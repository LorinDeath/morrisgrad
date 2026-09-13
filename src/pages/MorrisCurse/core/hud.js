import { getArmorReduction } from './classes.js';
import { Minimap } from './minimap.js';

export class GameHUD {
  constructor(container, onDuelInvite, onJoinBossFight, onTouchFlower, onPickFlower) {
    this.container = container;
    this.onDuelInvite = onDuelInvite;
    this.onJoinBossFight = onJoinBossFight;
    this.onTouchFlower = onTouchFlower;
    this.onPickFlower = onPickFlower;
    this.currentTarget = null;
    this.mount();
  }

  mount() {
    this.container.querySelectorAll('.game-hud-panel').forEach((el) => el.remove());

    if (!document.getElementById('hud-mobile-hide-css')) {
      const style = document.createElement('style');
      style.id = 'hud-mobile-hide-css';
      style.textContent = `
        @media (pointer: coarse) and ((max-width: 1024px) or (max-height: 550px)) {
          .game-hud-panel.hud-left,
          .game-hud-panel.hud-right {
            display: none !important;
          }
          #game-canvas {
            width: 100% !important;
            height: 100% !important;
            max-width: 100% !important;
            max-height: 100% !important;
            object-fit: fill !important;
            display: block !important;
            flex: 1 1 auto !important;
          }
        }
      `;
      document.head.appendChild(style);
    }

    const canvas = this.container.querySelector('canvas') || this.container.querySelector('#game-canvas');

    const leftSidebar = document.createElement('aside');
    leftSidebar.className = 'game-hud-panel hud-left';
    leftSidebar.style.order = '1';
    leftSidebar.innerHTML = `
      <div class="hud-card">
        <div class="hud-header">СУЩНОСТЬ</div>
        <div class="hud-player-name" id="ghud-my-name">Странник</div>
        <div class="hud-player-class" id="ghud-my-class">Душа [C]</div>
        <div class="hud-bar-bg">
          <div class="hud-bar-fill hud-hp-fill" id="ghud-my-hp-bar" style="width: 100%;"></div>
        </div>
        <div class="hud-bar-val" id="ghud-my-hp-val">100 / 100 HP</div>
        
        <!-- Индикатор дебафа Дизмораль -->
        <div id="ghud-debuff-box" style="display: none; margin-top: 8px; padding: 6px 8px; background: rgba(239, 68, 68, 0.15); border: 1px solid #ef4444; border-radius: 4px; font-size: 11px;">
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <span style="color: #fca5a5; font-weight: bold;">💔 Дизмораль</span>
            <b id="ghud-debuff-timer" style="color: #ef4444;">60c</b>
          </div>
          <div style="font-size: 10px; color: #fecaca; margin-top: 2px;">Урон снижен на 35%</div>
        </div>
      </div>

      <div class="hud-card">
        <div class="hud-header">СПОСОБНОСТИ</div>
        <div class="hud-row">
          <span>Рывок [Space]</span>
          <b id="ghud-dash-status" class="hud-ready">ГОТОВ</b>
        </div>
        <div class="hud-bar-bg">
          <div class="hud-bar-fill hud-dash-fill" id="ghud-dash-bar" style="width: 100%;"></div>
        </div>
      </div>

      <div class="hud-card">
        <div class="hud-header">МИР И СВЯЗЬ</div>
        <div class="hud-row"><span>В сети:</span><b id="ghud-online">1</b></div>
        <div class="hud-row"><span>Пинг:</span><b id="ghud-ping" style="color: #4ade80;">-- ms</b></div>
        <div class="hud-row"><span>Качество:</span><b id="ghud-net-quality" style="color: #4ade80;">📶 Отличное</b></div>
        <div class="hud-row"><span>Зум:</span><b id="ghud-zoom">x0.5</b></div>
        <div class="hud-row"><span>Координаты:</span><b id="ghud-coords">X: 0 | Y: 0</b></div>
      </div>

      <div class="hud-card hud-controls">
        <div class="hud-header">УПРАВЛЕНИЕ</div>
        <div class="hud-ctrl-item"><span>[W][A][S][D]</span> Бег</div>
        <div class="hud-ctrl-item"><span>[Space/Shift]</span> Рывок</div>
        <div class="hud-ctrl-item"><span>[E] / Клик</span> Взаимодействие</div>
        <div class="hud-ctrl-item"><span>[C]</span> Алтарь души</div>
        <div class="hud-ctrl-item"><span>[Enter]</span> Чат</div>
        <div class="hud-ctrl-item"><span>[+/-] / Колесо</span> Зум</div>
      </div>
    `;

    const rightSidebar = document.createElement('aside');
    rightSidebar.className = 'game-hud-panel hud-right';
    rightSidebar.style.order = '3';
    rightSidebar.innerHTML = `
      <div id="ghud-minimap-slot"></div>

      <div class="hud-card" id="ghud-target-card">
        <div class="hud-header">ЦЕЛЬ</div>
        <div id="ghud-target-empty" class="hud-empty">Кликните по объекту</div>
        <div id="ghud-target-details" style="display: none;">
          <div class="hud-target-title" id="ghud-target-name">Цель</div>
          <div class="hud-row"><span>Класс / Тип:</span><b id="ghud-target-class">-</b></div>
          <div class="hud-row"><span>❤️ HP:</span><b id="ghud-target-hp">-</b></div>
          <div class="hud-row"><span>🛡️ Защита:</span><b id="ghud-target-armor">-</b></div>
          <div class="hud-row"><span>⚔️ Урон:</span><b id="ghud-target-atk">-</b></div>
          
          <button class="hud-duel-btn" id="ghud-duel-btn">⚔️ ВЫЗВАТЬ НА ДУЭЛЬ</button>
          <button class="hud-duel-btn" id="ghud-flower-touch-btn" style="display: none; background: #b91c1c; border-color: #f87171;">🖐️ ТРОНУТЬ БУТОН (-1 HP)</button>
          <button class="hud-duel-btn" id="ghud-flower-pick-btn" style="display: none; background: #0284c7; border-color: #38bdf8;">🌸 СОРВАТЬ (+20 🛡️ ЩИТ)</button>

          <div id="ghud-boss-join-buttons" style="display: none; flex-direction: column; gap: 6px; margin-top: 6px;">
            <button class="hud-duel-btn" id="ghud-join-hunters-btn" style="background: #dc2626; border-color: #f87171;">⚔️ Охотиться</button>
            <button class="hud-duel-btn" id="ghud-join-kate-btn" style="background: #ec4899; border-color: #f472b6;">💖 Защитить</button>
          </div>
        </div>
      </div>

      <div class="hud-card">
        <div class="hud-header">СУЩНОСТИ РЯДОМ</div>
        <div id="ghud-nearby-list" class="hud-nearby-box">
          <span class="hud-empty">Никого нет поблизости</span>
        </div>
      </div>

      <div class="hud-card">
        <div class="hud-header">ОКРУЖЕНИЕ</div>
        <div id="ghud-near-obj-empty" class="hud-empty">Поблизости нет объектов</div>
        <div id="ghud-near-obj-details" style="display: none;">
          <div class="hud-near-name" id="ghud-near-obj-name">Алтарь</div>
          <div class="hud-near-hint">Нажмите <b>[E]</b> или кликните для входа</div>
        </div>
      </div>
    `;

    if (canvas) {
      canvas.style.order = '2';
      this.container.insertBefore(leftSidebar, canvas);
      this.container.appendChild(rightSidebar);
    } else {
      this.container.appendChild(leftSidebar);
      this.container.appendChild(rightSidebar);
    }

    const mmSlot = rightSidebar.querySelector('#ghud-minimap-slot');
    this.minimap = new Minimap(mmSlot);

    this.duelBtn = rightSidebar.querySelector('#ghud-duel-btn');
    this.touchBtn = rightSidebar.querySelector('#ghud-flower-touch-btn');
    this.pickBtn = rightSidebar.querySelector('#ghud-flower-pick-btn');

    if (this.duelBtn) {
      this.duelBtn.onclick = () => {
        if (this.currentTarget && typeof this.onDuelInvite === 'function') {
          const targetId = this.currentTarget.isDar ? 'boss_dar' : this.currentTarget.id;
          this.onDuelInvite(targetId, this.currentTarget.name || this.currentTarget.username);
        }
      };
    }

    if (this.touchBtn) {
      this.touchBtn.onclick = () => {
        if (this.currentTarget && typeof this.onTouchFlower === 'function') {
          this.onTouchFlower(this.currentTarget.id);
        }
      };
    }

    if (this.pickBtn) {
      this.pickBtn.onclick = () => {
        if (this.currentTarget && typeof this.onPickFlower === 'function') {
          this.onPickFlower(this.currentTarget.id);
          this.clearTarget();
        }
      };
    }

    const huntersBtn = rightSidebar.querySelector('#ghud-join-hunters-btn');
    const kateBtn = rightSidebar.querySelector('#ghud-join-kate-btn');

    if (huntersBtn) huntersBtn.onclick = () => this.onJoinBossFight?.('hunters');
    if (kateBtn) kateBtn.onclick = () => this.onJoinBossFight?.('allies');
  }

  setTarget(target) {
    this.currentTarget = target;
  }

  clearTarget() {
    this.currentTarget = null;
  }

  update(data) {
    const {
      player,
      otherPlayers,
      boss = null,
      dar = null,
      worldFlowers = new Map(),
      worldPortals,
      activeNearPortal,
      camera,
      dash,
      username,
      lastFaceDir,
      ping = 0,
      deathLockUntil = 0
    } = data;

    const isMyBody = Boolean(player.stats && player.stats.classId);
    const isLocked = deathLockUntil > Date.now();
    const lockSec = Math.ceil((deathLockUntil - Date.now()) / 1000);

    if (this.minimap) {
      this.minimap.update({
        player,
        otherPlayers,
        boss,
        worldPortals,
        worldSize: 1200,
        lastFaceDir
      });
    }

    // 1. Статус своего персонажа
    const myName = document.getElementById('ghud-my-name');
    const myClass = document.getElementById('ghud-my-class');
    const hpBar = document.getElementById('ghud-my-hp-bar');
    const hpVal = document.getElementById('ghud-my-hp-val');

    if (myName) myName.textContent = username;
    if (myClass) {
      const classMap = { warrior: 'Воин', rogue: 'Разбойник', spearman: 'Копейщик', mage: 'Маг' };
      myClass.textContent = isMyBody ? (classMap[player.stats.classId] || 'Герой') : 'Душа [C]';
    }

    const curHp = player.stats?.hp || 100;
    const maxHp = player.stats?.maxHp || 100;
    if (hpBar) hpBar.style.width = `${Math.max(0, Math.min(100, (curHp / maxHp) * 100))}%`;
    if (hpVal) hpVal.textContent = `${curHp} / ${maxHp} HP ${player.shield ? `(+${player.shield} 🛡️)` : ''}`;

    const debuffBox = document.getElementById('ghud-debuff-box');
    const debuffTimer = document.getElementById('ghud-debuff-timer');
    if (debuffBox && debuffTimer) {
      const now = Date.now();
      if (player.dismoraleUntil && player.dismoraleUntil > now) {
        debuffBox.style.display = 'block';
        const leftSec = Math.ceil((player.dismoraleUntil - now) / 1000);
        debuffTimer.textContent = `${leftSec}c`;
      } else {
        debuffBox.style.display = 'none';
      }
    }

    // 2. Рывок
    const dashStatus = document.getElementById('ghud-dash-status');
    const dashBar = document.getElementById('ghud-dash-bar');
    if (dashStatus && dashBar) {
      if (dash.cooldownTimer <= 0) {
        dashStatus.textContent = 'ГОТОВ';
        dashStatus.className = 'hud-ready';
        dashBar.style.width = '100%';
      } else {
        dashStatus.textContent = `${dash.cooldownTimer.toFixed(1)}c`;
        dashStatus.className = 'hud-cd';
        const pct = ((dash.cooldown - dash.cooldownTimer) / dash.cooldown) * 100;
        dashBar.style.width = `${Math.max(0, Math.min(100, pct))}%`;
      }
    }

    // 3. Сеть
    const online = document.getElementById('ghud-online');
    const zoom = document.getElementById('ghud-zoom');
    const coords = document.getElementById('ghud-coords');
    const pingEl = document.getElementById('ghud-ping');
    const qualityEl = document.getElementById('ghud-net-quality');

    if (online) online.textContent = `${otherPlayers.size + 1}`;
    if (zoom) zoom.textContent = `x${camera.zoom.toFixed(1)}`;
    if (coords) coords.textContent = `X: ${Math.round(player.x)} | Y: ${Math.round(player.y)}`;

    if (pingEl && qualityEl) {
      pingEl.textContent = `${ping} ms`;
      if (ping <= 60) {
        pingEl.style.color = '#4ade80';
        qualityEl.style.color = '#4ade80';
        qualityEl.textContent = '📶 Отличное';
      } else if (ping <= 140) {
        pingEl.style.color = '#facc15';
        qualityEl.style.color = '#facc15';
        qualityEl.textContent = '📶 Хорошее';
      } else {
        pingEl.style.color = '#f87171';
        qualityEl.style.color = '#f87171';
        qualityEl.textContent = '📶 Нестабильное';
      }
    }

    // 4. Окно цели
    const targetEmpty = document.getElementById('ghud-target-empty');
    const targetDetails = document.getElementById('ghud-target-details');
    const tName = document.getElementById('ghud-target-name');
    const tClass = document.getElementById('ghud-target-class');
    const tHp = document.getElementById('ghud-target-hp');
    const tArmor = document.getElementById('ghud-target-armor');
    const tAtk = document.getElementById('ghud-target-atk');
    const bossJoinBtns = document.getElementById('ghud-boss-join-buttons');

    if (this.currentTarget) {
      if (targetEmpty) targetEmpty.style.display = 'none';
      if (targetDetails) targetDetails.style.display = 'block';

      if (this.duelBtn) this.duelBtn.style.display = 'none';
      if (this.touchBtn) this.touchBtn.style.display = 'none';
      if (this.pickBtn) this.pickBtn.style.display = 'none';
      if (bossJoinBtns) bossJoinBtns.style.display = 'none';

      // ЦВЕТКИ-ВАМПИРЫ
      if (this.currentTarget.isFlowerEntity || worldFlowers.has(this.currentTarget.id)) {
        const fl = worldFlowers.get(this.currentTarget.id) || this.currentTarget;

        if (fl.stage === 'bud') {
          if (tName) { tName.textContent = 'Спящий бутон'; tName.style.color = '#f87171'; }
          if (tClass) tClass.textContent = 'Растение-вампир';
          if (tHp) tHp.textContent = '10 / 10 HP';
          if (tArmor) tArmor.textContent = '0 (0%)';
          if (tAtk) tAtk.textContent = '1 (Шипы)';
          if (this.touchBtn) this.touchBtn.style.display = 'block';
        } else if (fl.stage === 'mature') {
          if (tName) { tName.textContent = 'Созревший вампирский стебель'; tName.style.color = '#38bdf8'; }
          if (tClass) tClass.textContent = 'Созревшее растение';
          if (tHp) tHp.textContent = 'HP: ?';
          if (tArmor) tArmor.textContent = 'Def: ?';
          if (tAtk) tAtk.textContent = 'Atk: ?';
          if (this.pickBtn) this.pickBtn.style.display = 'block';
        } else if (fl.stage === 'active') {
          const typeNames = { normal: 'Обычный', fire: 'Огненный', frost: 'Морозный', hell: 'Адский' };
          const typeColors = { normal: '#f43f5e', fire: '#f97316', frost: '#38bdf8', hell: '#c084fc' };

          if (tName) {
            tName.textContent = `${typeNames[fl.flowerType] || 'Хищный'} Тюльпан`;
            tName.style.color = typeColors[fl.flowerType] || '#f43f5e';
          }
          if (tClass) tClass.textContent = `Монстр (${typeNames[fl.flowerType] || 'Хищник'})`;
          if (tHp) tHp.textContent = `${fl.stats.hp} / ${fl.stats.maxHp} HP`;
          const redPct = (getArmorReduction(fl.stats.armor) * 100).toFixed(1);
          if (tArmor) tArmor.textContent = `${fl.stats.armor} (${redPct}%)`;
          if (tAtk) tAtk.textContent = `${fl.stats.atk}`;

          if (this.duelBtn) {
            this.duelBtn.style.display = 'block';
            this.duelBtn.textContent = '⚔️ НАПАСТЬ НА ТЮЛЬПАН';
            this.duelBtn.className = isLocked ? 'hud-duel-btn hud-btn-disabled' : 'hud-duel-btn';
          }
        }
        return;
      }

      // КЕЙТ
      if (this.currentTarget.isBoss || this.currentTarget.id === 'boss_keyt') {
        const b = boss || this.currentTarget;
        if (tName) {
          tName.textContent = 'Кейт';
          tName.style.color = '#f472b6';
        }
        if (tClass) tClass.textContent = 'Рыцарь смерти';
        if (tHp) tHp.textContent = `${b.hp} / ${b.maxHp}`;
        const redPct = (getArmorReduction(b.armor) * 100).toFixed(1);
        if (tArmor) tArmor.textContent = `${b.armor} (${redPct}%)`;
        if (tAtk) tAtk.textContent = `${b.attack}`;

        if (bossJoinBtns) bossJoinBtns.style.display = (b.inDuel && !player.inDuel) ? 'flex' : 'none';
      }
      // ДАР
      else if (this.currentTarget.isDar || this.currentTarget.id === 'boss_dar') {
        const d = dar || this.currentTarget;
        if (tName) {
          tName.textContent = 'Дар';
          tName.style.color = '#34d399';
        }
        if (tClass) tClass.textContent = 'Трикстер';
        if (tHp) tHp.textContent = `${d.hp} / ${d.maxHp}`;
        const redPct = (getArmorReduction(d.armor) * 100).toFixed(1);
        if (tArmor) tArmor.textContent = `${d.armor} (${redPct}%)`;
        if (tAtk) tAtk.textContent = `5 - 25`;

        if (this.duelBtn) {
          this.duelBtn.style.display = 'block';
          this.duelBtn.textContent = '⚔️ ВЫЗВАТЬ ДАР';
          this.duelBtn.className = 'hud-duel-btn';
        }
        if (bossJoinBtns) bossJoinBtns.style.display = (d.inDuel && !player.inDuel) ? 'flex' : 'none';
      }
      // ДРУГИЕ ИГРОКИ
      else if (otherPlayers.has(this.currentTarget.username?.toLowerCase())) {
        const p = otherPlayers.get(this.currentTarget.username.toLowerCase());
        if (this.duelBtn) this.duelBtn.style.display = 'block';

        if (tName) {
          tName.textContent = p.username;
          tName.style.color = '#ffd700';
        }

        const classMap = { warrior: 'Воин', rogue: 'Разбойник', spearman: 'Копейщик', mage: 'Маг' };
        const tClassId = p.stats?.classId;
        if (tClass) tClass.textContent = tClassId ? (classMap[tClassId] || tClassId) : 'Душа (нет тела)';
        if (tHp) tHp.textContent = `${p.stats?.hp || 100} / ${p.stats?.maxHp || 100}`;

        const armorVal = p.stats?.armor || 0;
        const redPct = (getArmorReduction(armorVal) * 100).toFixed(1);
        if (tArmor) tArmor.textContent = `${armorVal} (${redPct}%)`;

        const minA = p.stats?.minAtk !== undefined ? p.stats.minAtk : 1;
        const maxA = p.stats?.maxAtk !== undefined ? p.stats.maxAtk : 4;
        if (tAtk) tAtk.textContent = `${minA} - ${maxA}`;

        if (this.duelBtn) {
          if (isLocked) {
            this.duelBtn.textContent = `Восстановление (${lockSec}с)`;
            this.duelBtn.className = 'hud-duel-btn hud-btn-disabled';
          } else if (!tClassId || !isMyBody) {
            this.duelBtn.textContent = 'Нужно тело';
            this.duelBtn.className = 'hud-duel-btn hud-btn-disabled';
          } else {
            this.duelBtn.textContent = '⚔️ ВЫЗВАТЬ НА ДУЭЛЬ';
            this.duelBtn.className = 'hud-duel-btn';
          }
        }
      }
    } else {
      if (targetEmpty) targetEmpty.style.display = 'block';
      if (targetDetails) targetDetails.style.display = 'none';
    }

    // 5. Радар
    const nearbyBox = document.getElementById('ghud-nearby-list');
    if (nearbyBox) {
      const nearbyList = [];

      if (boss && boss.state !== 'dead') {
        const bDistPx = Math.hypot(player.x - boss.x, player.y - boss.y);
        if (bDistPx <= 500) {
          nearbyList.push({
            type: 'boss',
            title: 'Кейт',
            color: '#f472b6',
            meters: (bDistPx / 20).toFixed(1),
            distPx: bDistPx,
            raw: boss,
          });
        }
      }

      if (dar && dar.state !== 'dead') {
        const dDistPx = Math.hypot(player.x - dar.x, player.y - dar.y);
        if (dDistPx <= 500) {
          nearbyList.push({
            type: 'dar',
            title: 'Дар',
            color: '#34d399',
            meters: (dDistPx / 20).toFixed(1),
            distPx: dDistPx,
            raw: dar,
          });
        }
      }

      otherPlayers.forEach((p) => {
        const distPx = Math.hypot(player.x - p.x, player.y - p.y);
        if (distPx <= 400) {
          nearbyList.push({
            type: 'player',
            title: p.username,
            color: p.color || '#38bdf8',
            meters: (distPx / 20).toFixed(1),
            distPx: p,
            raw: p,
          });
        }
      });

      nearbyList.sort((a, b) => a.distPx - b.distPx);

      if (nearbyList.length === 0) {
        nearbyBox.innerHTML = `<span class="hud-empty">Никого нет поблизости</span>`;
      } else {
        nearbyBox.innerHTML = nearbyList.map((item) => `
          <div class="hud-nearby-item" data-type="${item.type}" data-id="${item.title}">
            <span style="color: ${item.color}">${item.title}</span>
            <b>${item.meters} м</b>
          </div>
        `).join('');

        nearbyBox.querySelectorAll('.hud-nearby-item').forEach((el) => {
          el.onclick = () => {
            const t = el.getAttribute('data-type');
            if (t === 'boss' && boss) {
              this.setTarget({ ...boss, isBoss: true });
            } else if (t === 'dar' && dar) {
              this.setTarget({ ...dar, isDar: true });
            } else {
              const nick = el.getAttribute('data-id')?.toLowerCase();
              if (nick && otherPlayers.has(nick)) {
                this.setTarget(otherPlayers.get(nick));
              }
            }
          };
        });
      }
    }

    // 6. Окружение
    const nearEmpty = document.getElementById('ghud-near-obj-empty');
    const nearDetails = document.getElementById('ghud-near-obj-details');
    const nearName = document.getElementById('ghud-near-obj-name');

    if (activeNearPortal) {
      if (nearEmpty) nearEmpty.style.display = 'none';
      if (nearDetails) nearDetails.style.display = 'block';
      if (nearName) {
        nearName.textContent = activeNearPortal.id === 'portal_class_select'
          ? 'Алтарь Перевоплощения'
          : activeNearPortal.name;
      }
    } else {
      if (nearEmpty) nearEmpty.style.display = 'block';
      if (nearDetails) nearDetails.style.display = 'none';
    }
  }
}