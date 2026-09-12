import { getArmorReduction } from './classes.js';
import { Minimap } from './minimap.js';

export class GameHUD {
  constructor(container, onDuelInvite) {
    this.container = container;
    this.onDuelInvite = onDuelInvite;
    this.currentTarget = null;
    this.mount();
  }

  mount() {
    this.container.querySelectorAll('.game-hud-panel').forEach(el => el.remove());

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
        <div class="hud-header">МИР</div>
        <div class="hud-row"><span>В сети:</span><b id="ghud-online">1</b></div>
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
      <!-- Контейнер мини-карты -->
      <div id="ghud-minimap-slot"></div>

      <div class="hud-card" id="ghud-target-card">
        <div class="hud-header">ЦЕЛЬ</div>
        <div id="ghud-target-empty" class="hud-empty">Кликните по игроку для выбора цели</div>
        <div id="ghud-target-details" style="display: none;">
          <div class="hud-target-title" id="ghud-target-name">Игрок</div>
          <div class="hud-row"><span>Класс:</span><b id="ghud-target-class">-</b></div>
          <div class="hud-row"><span>❤️ HP:</span><b id="ghud-target-hp">-</b></div>
          <div class="hud-row"><span>🛡️ Защита:</span><b id="ghud-target-armor">-</b></div>
          <div class="hud-row"><span>⚔️ Урон:</span><b id="ghud-target-atk">-</b></div>
          <button class="hud-duel-btn" id="ghud-duel-btn">⚔️ ВЫЗВАТЬ НА ДУЭЛЬ</button>
        </div>
      </div>

      <div class="hud-card">
        <div class="hud-header">ИГРОКИ РЯДОМ</div>
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

    // Инициализируем мини-карту в слоте
    const mmSlot = rightSidebar.querySelector('#ghud-minimap-slot');
    this.minimap = new Minimap(mmSlot);

    this.duelBtn = rightSidebar.querySelector('#ghud-duel-btn');
    if (this.duelBtn) {
      this.duelBtn.onclick = () => {
        if (this.currentTarget && typeof this.onDuelInvite === 'function') {
          this.onDuelInvite(this.currentTarget.id, this.currentTarget.username);
        }
      };
    }
  }

  setTarget(player) {
    this.currentTarget = player;
  }

  clearTarget() {
    this.currentTarget = null;
  }

  update(data) {
    const { player, otherPlayers, worldPortals, activeNearPortal, camera, dash, username, lastFaceDir } = data;
    const isMyBody = Boolean(player.stats && player.stats.classId);

    // 0. Обновляем мини-карту
    if (this.minimap) {
      this.minimap.update({
        player,
        otherPlayers,
        worldPortals,
        worldSize: 1200,
        lastFaceDir
      });
    }

    // 1. Мой статус
    const myName = document.getElementById('ghud-my-name');
    const myClass = document.getElementById('ghud-my-class');
    const hpBar = document.getElementById('ghud-my-hp-bar');
    const hpVal = document.getElementById('ghud-my-hp-val');

    if (myName) myName.textContent = username;
    if (myClass) {
      const classMap = { warrior: 'Воин', rogue: 'Разбойник', spearman: 'Копейщик' };
      myClass.textContent = isMyBody ? (classMap[player.stats.classId] || 'Герой') : 'Душа [C]';
    }

    const curHp = player.stats?.hp || 100;
    const maxHp = player.stats?.maxHp || 100;
    if (hpBar) hpBar.style.width = `${Math.max(0, Math.min(100, (curHp / maxHp) * 100))}%`;
    if (hpVal) hpVal.textContent = `${curHp} / ${maxHp} HP`;

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

    // 3. Мир
    const online = document.getElementById('ghud-online');
    const zoom = document.getElementById('ghud-zoom');
    const coords = document.getElementById('ghud-coords');
    if (online) online.textContent = `${otherPlayers.size + 1}`;
    if (zoom) zoom.textContent = `x${camera.zoom.toFixed(1)}`;
    if (coords) coords.textContent = `X: ${Math.round(player.x)} | Y: ${Math.round(player.y)}`;

    // 4. Цель
    const targetEmpty = document.getElementById('ghud-target-empty');
    const targetDetails = document.getElementById('ghud-target-details');
    const tName = document.getElementById('ghud-target-name');
    const tClass = document.getElementById('ghud-target-class');
    const tHp = document.getElementById('ghud-target-hp');
    const tArmor = document.getElementById('ghud-target-armor');
    const tAtk = document.getElementById('ghud-target-atk');

    if (this.currentTarget && otherPlayers.has(this.currentTarget.username.toLowerCase())) {
      const p = otherPlayers.get(this.currentTarget.username.toLowerCase());
      if (targetEmpty) targetEmpty.style.display = 'none';
      if (targetDetails) targetDetails.style.display = 'block';

      if (tName) tName.textContent = p.username;

      const classMap = { warrior: 'Воин', rogue: 'Разбойник', spearman: 'Копейщик' };
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
        if (!tClassId || !isMyBody) {
          this.duelBtn.textContent = 'Нужно тело';
          this.duelBtn.className = 'hud-duel-btn hud-btn-disabled';
        } else {
          this.duelBtn.textContent = '⚔️ ВЫЗВАТЬ НА ДУЭЛЬ';
          this.duelBtn.className = 'hud-duel-btn';
        }
      }
    } else {
      if (targetEmpty) targetEmpty.style.display = 'block';
      if (targetDetails) targetDetails.style.display = 'none';
    }

    // 5. Радар
    const nearbyBox = document.getElementById('ghud-nearby-list');
    if (nearbyBox) {
      const nearbyPlayers = [];
      otherPlayers.forEach(p => {
        const dist = Math.round(Math.hypot(player.x - p.x, player.y - p.y));
        if (dist <= 350) {
          nearbyPlayers.push({ player: p, dist });
        }
      });

      nearbyPlayers.sort((a, b) => a.dist - b.dist);

      if (nearbyPlayers.length === 0) {
        nearbyBox.innerHTML = `<span class="hud-empty">Никого нет поблизости</span>`;
      } else {
        nearbyBox.innerHTML = nearbyPlayers.map(item => `
          <div class="hud-nearby-item" data-id="${item.player.username}">
            <span>${item.player.username}</span>
            <b>${item.dist}px</b>
          </div>
        `).join('');

        nearbyBox.querySelectorAll('.hud-nearby-item').forEach(el => {
          el.onclick = () => {
            const nick = el.getAttribute('data-id')?.toLowerCase();
            if (nick && otherPlayers.has(nick)) {
              this.setTarget(otherPlayers.get(nick));
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