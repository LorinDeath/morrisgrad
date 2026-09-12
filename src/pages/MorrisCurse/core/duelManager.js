import { CLASSES, getChargeInfo, getArmorReduction } from './classes.js';

export class DuelManager {
  constructor(container, socketSender) {
    this.container = container || document.body;
    this.send = socketSender;

    this.currentDuel = null;
    this.myId = null;
    this.me = null;
    this.allies = [];
    this.enemies = [];
    this.selectedTargetId = null;

    this.chargeTimer = 0;
    this.abilityCooldown = 0;
    this.attackCooldown = 0;
    this.chargeInterval = null;
    this.closeTimeout = null;

    this.isClassSelectOpen = false;
    this.isInviteOpen = false;

    this.initClassSelectDOM();
    this.initInviteDOM();
    this.initWapArenaDOM();
  }

  isAnyModalOpen() {
    return this.isClassSelectOpen || this.isInviteOpen || Boolean(this.currentDuel);
  }

  initClassSelectDOM() {
    this.classModal = document.createElement('div');
    this.classModal.id = 'class-select-modal';
    this.classModal.style.cssText = `
      position: absolute; inset: 0; display: none; align-items: center; justify-content: center;
      background: rgba(5, 4, 10, 0.9); z-index: 10005; font-family: monospace;
    `;
    this.classModal.innerHTML = `
      <div style="background: #0e0c18; border: 2px solid #38bdf8; border-radius: 8px; width: 90%; max-width: 440px; padding: 18px; color: #fff;">
        <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #1f1a30; padding-bottom: 8px; margin-bottom: 12px;">
          <span style="font-weight: bold; color: #38bdf8; font-size: 15px;">АЛТАРЬ ПЕРЕВОПЛОЩЕНИЯ</span>
          <button id="close-class-btn" style="background: none; border: none; color: #888; font-size: 18px; cursor: pointer;">✕</button>
        </div>
        <div style="display: flex; flex-direction: column; gap: 10px;" id="class-cards-list"></div>
      </div>
    `;
    this.container.appendChild(this.classModal);
    this.classModal.querySelector('#close-class-btn').onclick = () => this.closeClassSelect();

    const list = this.classModal.querySelector('#class-cards-list');
    Object.values(CLASSES).forEach((c) => {
      const red = (getArmorReduction(c.armor) * 100).toFixed(1);
      const card = document.createElement('div');
      card.style.cssText = `background: #151222; border: 1px solid ${c.color}; border-radius: 6px; padding: 10px; cursor: pointer; transition: 0.2s;`;
      card.innerHTML = `
        <div style="font-weight: bold; color: ${c.color}; font-size: 14px;">${c.name}</div>
        <div style="font-size: 11px; color: #cbd5e1; margin-top: 4px;">
          ❤️ HP: ${c.hp} | 🛡️ Броня: ${c.armor} (${red}%) | ⚔️ Атака: ${c.minAtk}-${c.maxAtk}
        </div>
        <div style="font-size: 11px; color: #a855f7; margin-top: 2px;">Навык: ${c.ability.name} (${c.ability.desc})</div>
      `;
      card.onclick = () => {
        this.send({ type: 'select_class', classId: c.id });
        this.closeClassSelect();
      };
      list.appendChild(card);
    });
  }

  openClassSelect() {
    this.isClassSelectOpen = true;
    this.classModal.style.display = 'flex';
  }

  closeClassSelect() {
    this.isClassSelectOpen = false;
    this.classModal.style.display = 'none';
  }

  initInviteDOM() {
    this.inviteModal = document.createElement('div');
    this.inviteModal.style.cssText = `
      position: absolute; inset: 0; display: none; align-items: center; justify-content: center;
      background: rgba(0, 0, 0, 0.75); z-index: 10006; font-family: monospace;
    `;
    this.inviteModal.innerHTML = `
      <div style="background: #110e1f; border: 2px solid #ef4444; border-radius: 8px; width: 300px; padding: 16px; color: #fff; text-align: center;">
        <div style="color: #ef4444; font-weight: bold; font-size: 15px; margin-bottom: 8px;">ВЫЗОВ НА ДУЭЛЬ!</div>
        <div id="duel-invite-text" style="font-size: 13px; margin-bottom: 16px; color: #ddd;"></div>
        <div style="display: flex; justify-content: space-around;">
          <button id="duel-accept-btn" style="background: #22c55e; border: none; padding: 8px 16px; border-radius: 4px; color: #fff; font-weight: bold; cursor: pointer;">Принять</button>
          <button id="duel-decline-btn" style="background: #ef4444; border: none; padding: 8px 16px; border-radius: 4px; color: #fff; font-weight: bold; cursor: pointer;">Отказать</button>
        </div>
      </div>
    `;
    this.container.appendChild(this.inviteModal);
  }

  showInvite(fromNick, fromId) {
    this.isInviteOpen = true;
    const txt = this.inviteModal.querySelector('#duel-invite-text');
    txt.textContent = `Игрок ${fromNick} бросил вам вызов!`;
    this.inviteModal.style.display = 'flex';

    this.inviteModal.querySelector('#duel-accept-btn').onclick = () => {
      this.isInviteOpen = false;
      this.inviteModal.style.display = 'none';
      this.send({ type: 'duel_accept', targetId: fromId });
    };

    this.inviteModal.querySelector('#duel-decline-btn').onclick = () => {
      this.isInviteOpen = false;
      this.inviteModal.style.display = 'none';
      this.send({ type: 'duel_decline', targetId: fromId });
    };
  }

  // WAP Арена с карточками целей и нижним HP игрока
  initWapArenaDOM() {
    this.arenaModal = document.createElement('div');
    this.arenaModal.style.cssText = `
      position: absolute; inset: 0; display: none; align-items: center; justify-content: center;
      background: rgba(5, 4, 10, 0.95); z-index: 10010; font-family: monospace;
    `;
    this.arenaModal.innerHTML = `
      <div style="background: #0d0b16; border: 2px solid #a855f7; border-radius: 8px; width: 94%; max-width: 490px; padding: 14px; color: #fff; display: flex; flex-direction: column; gap: 10px; position: relative;">
        <div id="arena-countdown" style="display: none; position: absolute; inset: 0; background: rgba(0,0,0,0.85); z-index: 20; align-items: center; justify-content: center; font-size: 32px; font-weight: bold; color: #ffd700;"></div>
        
        <!-- 1. ПОЛЕ БОЯ: КАРТОЧКИ ВРАГОВ И СОЮЗНИКОВ -->
        <div id="arena-battlefield" style="display: flex; flex-direction: column; gap: 8px; border-bottom: 1px solid #231b38; padding-bottom: 10px;">
          <!-- Враги -->
          <div>
            <div style="font-size: 10px; color: #f87171; font-weight: bold; margin-bottom: 4px; display: flex; justify-content: space-between;">
              <span>ВРАГИ (ВЫБЕРИТЕ ЦЕЛЬ ДЛЯ УДАРА):</span>
              <span id="arena-target-selected-hint" style="color: #ffd700;">🎯 Цель выбрана</span>
            </div>
            <div id="arena-enemies-list" style="display: flex; gap: 6px; flex-wrap: wrap;"></div>
          </div>

          <!-- Союзники (скрыто, если нет) -->
          <div id="arena-allies-section" style="display: none;">
            <div style="font-size: 10px; color: #38bdf8; font-weight: bold; margin-bottom: 4px;">СОЮЗНИКИ:</div>
            <div id="arena-allies-list" style="display: flex; gap: 6px; flex-wrap: wrap;"></div>
          </div>
        </div>

        <!-- 2. ЛОГ СРАЖЕНИЯ -->
        <div id="wap-combat-log" style="background: #05040a; border: 1px solid #1f1930; height: 120px; border-radius: 4px; padding: 8px; overflow-y: auto; font-size: 11px; display: flex; flex-direction: column; gap: 4px;"></div>

        <!-- 3. СТАТУС СВОЕГО ЗДОРОВЬЯ (НАД КНОПКАМИ) -->
        <div id="arena-my-status-box" style="background: #110d22; border: 1px solid #3b2c52; border-radius: 6px; padding: 8px;">
          <div style="display: flex; justify-content: space-between; align-items: center; font-size: 11px; margin-bottom: 4px;">
            <span><b id="wap-my-name" style="color: #4ade80;">Вы</b> [Ваше Здоровье]:</span>
            <b id="wap-my-hp-val" style="color: #4ade80;">100 / 100 HP</b>
          </div>
          <div style="background: #241e33; height: 10px; border-radius: 4px; overflow: hidden;">
            <div id="wap-my-hp-bar" style="background: #22c55e; width: 100%; height: 100%; transition: width 0.2s ease-out;"></div>
          </div>
        </div>

        <!-- 4. КНОПКИ ДЕЙСТВИЙ -->
        <div style="display: flex; flex-direction: column; gap: 8px;">
          <button id="wap-attack-btn" style="background: #374151; border: 1px solid #4b5563; padding: 10px; border-radius: 6px; color: #fff; font-family: monospace; font-weight: bold; cursor: pointer; text-align: center; transition: 0.1s;">
            <span id="wap-atk-label">Атака</span>
            <div id="wap-charge-bar" style="background: #eab308; height: 3px; width: 0%; margin-top: 4px;"></div>
          </button>
          
          <div style="display: flex; gap: 8px;">
            <button id="wap-ability-btn" style="flex: 2; background: #581c87; border: 1px solid #a855f7; padding: 8px; border-radius: 6px; color: #fff; font-family: monospace; font-weight: bold; cursor: pointer;">
              Способность
            </button>
            <button id="wap-escape-btn" style="flex: 1; background: #dc2626; border: 1px solid #f87171; padding: 8px; border-radius: 6px; color: #fff; font-family: monospace; font-weight: bold; cursor: pointer;">
              Сбежать
            </button>
          </div>
        </div>
      </div>
    `;
    this.container.appendChild(this.arenaModal);

    const atkBtn = this.arenaModal.querySelector('#wap-attack-btn');
    atkBtn.onclick = () => {
      if (!this.currentDuel || this.currentDuel.locked || this.attackCooldown > 0) return;
      const charge = getChargeInfo(this.chargeTimer);
      this.send({
        type: 'duel_action',
        action: 'attack',
        chargeMult: charge.mult,
        targetId: this.selectedTargetId
      });
      this.chargeTimer = 0;
      this.attackCooldown = 2.0;
    };

    const abBtn = this.arenaModal.querySelector('#wap-ability-btn');
    abBtn.onclick = () => {
      if (!this.currentDuel || this.currentDuel.locked || this.abilityCooldown > 0) return;
      const charge = getChargeInfo(this.chargeTimer);
      this.send({
        type: 'duel_action',
        action: 'ability',
        chargeMult: charge.mult,
        targetId: this.selectedTargetId
      });
      this.abilityCooldown = 14;
      this.attackCooldown = 2.0;
      this.chargeTimer = 0;
    };

    const escBtn = this.arenaModal.querySelector('#wap-escape-btn');
    escBtn.onclick = () => {
      if (!this.currentDuel) return;
      this.send({ type: 'duel_action', action: 'escape' });
      this.escapeBattle();
    };
  }

  escapeBattle() {
    if (this.chargeInterval) clearInterval(this.chargeInterval);
    if (this.closeTimeout) clearTimeout(this.closeTimeout);
    this.arenaModal.style.display = 'none';
    this.currentDuel = null;
  }

  startDuel(data, myId) {
    if (this.closeTimeout) {
      clearTimeout(this.closeTimeout);
      this.closeTimeout = null;
    }

    const d = data.duel || data;
    this.currentDuel = d;
    this.currentDuel.isBossFight = Boolean(data.isBossFight || d.isBossFight);
    this.myId = String(myId || '').trim().toLowerCase();

    this.chargeTimer = 0;
    this.abilityCooldown = 0;
    this.attackCooldown = 0;

    this.parseTeams(d);

    this.arenaModal.style.display = 'flex';
    this.renderBattlefield();
    this.updateMyHpUI();

    const log = this.arenaModal.querySelector('#wap-combat-log');
    const cdBox = this.arenaModal.querySelector('#arena-countdown');

    if (this.currentDuel.isBossFight) {
      cdBox.style.display = 'none';
      this.currentDuel.locked = false;
      log.innerHTML = `<div style="color: #f472b6; font-weight: bold;">⚔️ Битва началась! Выберите врага и атакуйте!</div>`;
      this.startTimers();
    } else {
      this.currentDuel.locked = true;
      log.innerHTML = `<div style="color: #ffd700;">Дуэль началась! Приготовьтесь к бою.</div>`;
      cdBox.style.display = 'flex';
      let count = 3;
      cdBox.textContent = count;

      const cdInt = setInterval(() => {
        count--;
        if (count > 0) {
          cdBox.textContent = count;
        } else if (count === 0) {
          cdBox.textContent = 'БОЙ!';
        } else {
          clearInterval(cdInt);
          cdBox.style.display = 'none';
          if (this.currentDuel) this.currentDuel.locked = false;
          this.startTimers();
        }
      }, 1000);
    }
  }

  parseTeams(duel) {
    const isBossFight = Boolean(duel.isBossFight);
    const hunters = duel.hunters || (duel.p1 ? [duel.p1] : []);
    const allies = duel.allies || (duel.p2 ? [duel.p2] : []);

    const isMatch = (p) => {
      const pid = String(p.id || '').toLowerCase();
      const pName = String(p.username || '').toLowerCase();
      return pid === this.myId || pName === this.myId;
    };

    const inHunters = hunters.some(isMatch);

    if (isBossFight) {
      if (inHunters) {
        this.me = hunters.find(isMatch) || hunters[0];
        this.allies = hunters.filter(h => h !== this.me);
        this.enemies = allies;
      } else {
        this.me = allies.find(isMatch) || allies[0];
        this.allies = allies.filter(a => a !== this.me);
        this.enemies = hunters;
      }
    } else {
      const p1 = hunters[0] || duel.p1;
      const p2 = allies[0] || duel.p2;

      if (isMatch(p1)) {
        this.me = p1;
        this.allies = [];
        this.enemies = p2 ? [p2] : [];
      } else {
        this.me = p2;
        this.allies = [];
        this.enemies = p1 ? [p1] : [];
      }
    }

    // Автоматический выбор первого живого врага
    if (!this.selectedTargetId || !this.enemies.some(e => e.id === this.selectedTargetId && e.hp > 0)) {
      const living = this.enemies.find(e => e.hp > 0);
      this.selectedTargetId = living ? living.id : (this.enemies[0]?.id || null);
    }
  }

  renderBattlefield() {
    const enemiesBox = this.arenaModal.querySelector('#arena-enemies-list');
    const alliesBox = this.arenaModal.querySelector('#arena-allies-list');
    const alliesSection = this.arenaModal.querySelector('#arena-allies-section');

    // Отрисовка карточек врагов
    enemiesBox.innerHTML = '';
    this.enemies.forEach((enemy) => {
      const isSelected = enemy.id === this.selectedTargetId;
      const isDead = enemy.hp <= 0;
      const card = document.createElement('div');
      card.className = `arena-combatant-card ${isSelected ? 'target-selected' : ''}`;
      card.style.cssText = `
        flex: 1; min-width: 130px; background: ${isSelected ? '#20121d' : '#120d1c'};
        border: 2px solid ${isSelected ? '#ef4444' : '#3b2c52'};
        box-shadow: ${isSelected ? '0 0 10px rgba(239, 68, 68, 0.6)' : 'none'};
        border-radius: 6px; padding: 6px 8px; cursor: ${isDead ? 'not-allowed' : 'pointer'};
        opacity: ${isDead ? '0.4' : '1'}; transition: all 0.15s;
      `;

      const pct = Math.max(0, Math.min(100, (enemy.hp / (enemy.maxHp || 100)) * 100));
      const displayName = enemy.isBoss ? 'Кейт [БОСС]' : enemy.username;

      card.innerHTML = `
        <div style="font-size: 11px; font-weight: bold; color: ${isSelected ? '#ef4444' : '#f87171'}; display: flex; justify-content: space-between; align-items: center;">
          <span>${displayName}</span>
          ${isSelected ? '<span>🎯</span>' : ''}
        </div>
        <div style="background: #231b33; height: 6px; border-radius: 3px; overflow: hidden; margin: 4px 0 2px 0;">
          <div style="background: #ef4444; width: ${pct}%; height: 100%; transition: width 0.2s;"></div>
        </div>
        <div style="font-size: 10px; color: #cbd5e1; text-align: right;">${Math.max(0, enemy.hp)} / ${enemy.maxHp || 100} HP</div>
      `;

      if (!isDead) {
        card.onclick = () => {
          this.selectedTargetId = enemy.id;
          this.renderBattlefield();
        };
      }

      enemiesBox.appendChild(card);
    });

    // Отрисовка карточек союзников
    if (this.allies.length > 0) {
      alliesSection.style.display = 'block';
      alliesBox.innerHTML = '';
      this.allies.forEach((ally) => {
        const card = document.createElement('div');
        card.style.cssText = `
          flex: 1; min-width: 120px; background: #0c1424; border: 1px solid #1e3a8a;
          border-radius: 6px; padding: 6px 8px;
        `;
        const pct = Math.max(0, Math.min(100, (ally.hp / (ally.maxHp || 100)) * 100));
        card.innerHTML = `
          <div style="font-size: 11px; font-weight: bold; color: #38bdf8;">${ally.username}</div>
          <div style="background: #172554; height: 6px; border-radius: 3px; overflow: hidden; margin: 4px 0 2px 0;">
            <div style="background: #38bdf8; width: ${pct}%; height: 100%; transition: width 0.2s;"></div>
          </div>
          <div style="font-size: 10px; color: #94a3b8; text-align: right;">${Math.max(0, ally.hp)} / ${ally.maxHp || 100} HP</div>
        `;
        alliesBox.appendChild(card);
      });
    } else {
      alliesSection.style.display = 'none';
    }
  }

  updateMyHpUI() {
    if (!this.me) return;
    const nameEl = this.arenaModal.querySelector('#wap-my-name');
    const valEl = this.arenaModal.querySelector('#wap-my-hp-val');
    const barEl = this.arenaModal.querySelector('#wap-my-hp-bar');

    if (nameEl) nameEl.textContent = this.me.username || 'Вы';
    const cur = Math.max(0, this.me.hp);
    const max = this.me.maxHp || 100;
    if (valEl) valEl.textContent = `${cur} / ${max} HP`;
    if (barEl) barEl.style.width = `${Math.max(0, Math.min(100, (cur / max) * 100))}%`;
  }

  updateDuel(data) {
    if (!this.currentDuel) return;

    // Синхронизация списков участников
    if (data.hunters || data.allies) {
      if (data.hunters) {
        data.hunters.forEach(h => {
          const m = [this.me, ...this.allies, ...this.enemies].find(p => p && p.id === h.id);
          if (m) { m.hp = h.hp; m.maxHp = h.maxHp; }
        });
      }
      if (data.allies) {
        data.allies.forEach(a => {
          const m = [this.me, ...this.allies, ...this.enemies].find(p => p && p.id === a.id);
          if (m) { m.hp = a.hp; m.maxHp = a.maxHp; }
        });
      }
    } else if (this.me && this.enemies[0]) {
      // Совместимость с 1v1 дуэлями
      this.me.hp = data.p1Hp !== undefined ? data.p1Hp : this.me.hp;
      this.enemies[0].hp = data.p2Hp !== undefined ? data.p2Hp : this.enemies[0].hp;
    }

    // Если текущая выбранная цель погибла — переключаем на живого врага
    const curTarget = this.enemies.find(e => e.id === this.selectedTargetId);
    if (!curTarget || curTarget.hp <= 0) {
      const nextLiving = this.enemies.find(e => e.hp > 0);
      if (nextLiving) this.selectedTargetId = nextLiving.id;
    }

    this.renderBattlefield();
    this.updateMyHpUI();

    if (data.log) {
      this.addLog(data.log);
    }
  }

  startTimers() {
    if (this.chargeInterval) clearInterval(this.chargeInterval);
    this.chargeInterval = setInterval(() => {
      if (!this.currentDuel || this.currentDuel.locked) return;

      this.chargeTimer = Math.min(16, this.chargeTimer + 0.1);

      if (this.abilityCooldown > 0) {
        this.abilityCooldown = Math.max(0, this.abilityCooldown - 0.1);
      }

      if (this.attackCooldown > 0) {
        this.attackCooldown = Math.max(0, this.attackCooldown - 0.1);
      }

      const charge = getChargeInfo(this.chargeTimer);
      const atkBtn = this.arenaModal.querySelector('#wap-attack-btn');
      const atkLabel = this.arenaModal.querySelector('#wap-atk-label');
      const chargeBar = this.arenaModal.querySelector('#wap-charge-bar');

      if (this.attackCooldown > 0) {
        atkBtn.disabled = true;
        atkBtn.style.opacity = '0.55';
        atkBtn.style.cursor = 'not-allowed';
        atkBtn.style.borderColor = '#4b5563';
        atkLabel.innerHTML = `ПЕРЕЗАРЯДКА <span style="color:#ef4444">(${this.attackCooldown.toFixed(1)}с)</span>`;
      } else {
        atkBtn.disabled = false;
        atkBtn.style.opacity = '1';
        atkBtn.style.cursor = 'pointer';
        atkBtn.style.borderColor = charge.color;
        atkLabel.innerHTML = `АТАКОВАТЬ <span style="color:${charge.color}">[${charge.label} x${charge.mult}]</span>`;
      }

      chargeBar.style.backgroundColor = charge.color;
      chargeBar.style.width = `${Math.min(100, (this.chargeTimer / 15) * 100)}%`;

      const abBtn = this.arenaModal.querySelector('#wap-ability-btn');
      const myClass = (this.me?.classId && CLASSES[this.me.classId]) ? CLASSES[this.me.classId] : CLASSES.warrior;
      if (this.abilityCooldown > 0) {
        abBtn.disabled = true;
        abBtn.style.opacity = '0.5';
        abBtn.style.cursor = 'not-allowed';
        abBtn.textContent = `${myClass.ability.name} (${this.abilityCooldown.toFixed(1)}c)`;
      } else {
        abBtn.disabled = false;
        abBtn.style.opacity = '1';
        abBtn.style.cursor = 'pointer';
        abBtn.textContent = `${myClass.ability.name} [Готово]`;
      }
    }, 100);
  }

  addLog(text) {
    const log = this.arenaModal.querySelector('#wap-combat-log');
    const msg = document.createElement('div');
    msg.innerHTML = text;
    log.appendChild(msg);
    log.scrollTop = log.scrollHeight;
  }

  endDuel(winnerName) {
    if (this.chargeInterval) clearInterval(this.chargeInterval);
    this.addLog(`<div style="color: #ffd700; font-weight: bold; margin-top: 4px;">Победитель: ${winnerName}!</div>`);
    if (this.currentDuel) this.currentDuel.locked = true;

    this.closeTimeout = setTimeout(() => {
      this.arenaModal.style.display = 'none';
      this.currentDuel = null;
    }, 3500);
  }
}