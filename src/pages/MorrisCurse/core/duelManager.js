import { CLASSES, getChargeInfo, getArmorReduction } from './classes.js';

export class DuelManager {
  constructor(container, socketSender) {
    this.container = container || document.body;
    this.send = socketSender;

    this.currentDuel = null;
    this.chargeTimer = 0;
    this.abilityCooldown = 0;
    this.attackCooldown = 0; // Антиспам таймер (2 сек)
    this.chargeInterval = null;

    // Флаги открытых окон для предотвращения залипания клавиш
    this.isClassSelectOpen = false;
    this.isInviteOpen = false;

    this.initClassSelectDOM();
    this.initInviteDOM();
    this.initWapArenaDOM();
  }

  isAnyModalOpen() {
    return this.isClassSelectOpen || this.isInviteOpen || Boolean(this.currentDuel);
  }

  // 1. Меню выбора тела (Портал)
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

  // 2. Окно вызова на дуэль
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

  // 3. WAP Арена
  initWapArenaDOM() {
    this.arenaModal = document.createElement('div');
    this.arenaModal.style.cssText = `
      position: absolute; inset: 0; display: none; align-items: center; justify-content: center;
      background: rgba(5, 4, 10, 0.95); z-index: 10010; font-family: monospace;
    `;
    this.arenaModal.innerHTML = `
      <div style="background: #0d0b16; border: 2px solid #a855f7; border-radius: 8px; width: 94%; max-width: 480px; padding: 14px; color: #fff; display: flex; flex-direction: column; gap: 10px; position: relative;">
        <div id="arena-countdown" style="display: none; position: absolute; inset: 0; background: rgba(0,0,0,0.85); z-index: 20; align-items: center; justify-content: center; font-size: 32px; font-weight: bold; color: #ffd700;"></div>
        
        <!-- Шапка с полосками HP -->
        <div style="display: flex; justify-content: space-between; border-bottom: 1px solid #231b38; padding-bottom: 8px;">
          <div style="width: 45%;">
            <div id="wap-my-name" style="font-weight: bold; font-size: 13px;">Вы</div>
            <div style="background: #241e33; height: 10px; border-radius: 4px; overflow: hidden; margin-top: 3px;">
              <div id="wap-my-hp-bar" style="background: #22c55e; width: 100%; height: 100%;"></div>
            </div>
            <div id="wap-my-hp-text" style="font-size: 11px; color: #aaa;">0/0</div>
          </div>
          <div style="align-self: center; font-weight: bold; color: #ef4444;">VS</div>
          <div style="width: 45%; text-align: right;">
            <div id="wap-opp-name" style="font-weight: bold; font-size: 13px;">Противник</div>
            <div style="background: #241e33; height: 10px; border-radius: 4px; overflow: hidden; margin-top: 3px;">
              <div id="wap-opp-hp-bar" style="background: #ef4444; width: 100%; height: 100%;"></div>
            </div>
            <div id="wap-opp-hp-text" style="font-size: 11px; color: #aaa;">0/0</div>
          </div>
        </div>

        <!-- Текстовый WAP-лог сражения -->
        <div id="wap-combat-log" style="background: #05040a; border: 1px solid #1f1930; height: 140px; border-radius: 4px; padding: 8px; overflow-y: auto; font-size: 11px; display: flex; flex-direction: column; gap: 4px;"></div>

        <!-- Кнопки действий -->
        <div style="display: flex; flex-direction: column; gap: 8px;">
          <button id="wap-attack-btn" style="background: #374151; border: 1px solid #4b5563; padding: 10px; border-radius: 6px; color: #fff; font-family: monospace; font-weight: bold; cursor: pointer; text-align: center; transition: 0.1s;">
            <span id="wap-atk-label">Атака</span>
            <div id="wap-charge-bar" style="background: #eab308; height: 3px; width: 0%; margin-top: 4px;"></div>
          </button>
          
          <button id="wap-ability-btn" style="background: #581c87; border: 1px solid #a855f7; padding: 8px; border-radius: 6px; color: #fff; font-family: monospace; font-weight: bold; cursor: pointer;">
            Способность
          </button>
        </div>
      </div>
    `;
    this.container.appendChild(this.arenaModal);

    const atkBtn = this.arenaModal.querySelector('#wap-attack-btn');
    atkBtn.onclick = () => {
      if (!this.currentDuel || this.currentDuel.locked || this.attackCooldown > 0) return;
      const charge = getChargeInfo(this.chargeTimer);
      this.send({ type: 'duel_action', action: 'attack', chargeMult: charge.mult });
      this.chargeTimer = 0;
      this.attackCooldown = 2.0; // 2 секунды антиспам
    };

    const abBtn = this.arenaModal.querySelector('#wap-ability-btn');
    abBtn.onclick = () => {
      if (!this.currentDuel || this.currentDuel.locked || this.abilityCooldown > 0) return;
      const charge = getChargeInfo(this.chargeTimer);
      this.send({ type: 'duel_action', action: 'ability', chargeMult: charge.mult });
      this.abilityCooldown = 14;
      this.attackCooldown = 2.0; // Запускаем откат и на атаку
      this.chargeTimer = 0;
    };
  }

  startDuel(data, myId) {
    this.currentDuel = data;
    this.currentDuel.locked = true;
    this.chargeTimer = 0;
    this.abilityCooldown = 0;
    this.attackCooldown = 0;

    const isPlayer1 = data.p1.id === myId;
    this.me = isPlayer1 ? data.p1 : data.p2;
    this.opp = isPlayer1 ? data.p2 : data.p1;

    this.arenaModal.style.display = 'flex';
    this.updateDuelUI();

    const log = this.arenaModal.querySelector('#wap-combat-log');
    log.innerHTML = `<div style="color: #ffd700;">Дуэль началась! Приготовьтесь к битве.</div>`;

    // Обратный отсчёт: 3, 2, 1, Бой!
    const cdBox = this.arenaModal.querySelector('#arena-countdown');
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
        this.currentDuel.locked = false;
        this.startTimers();
      }
    }, 1000);
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

      // Обновление кнопки атаки и антиспама
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

      // Кнопка способности
      const abBtn = this.arenaModal.querySelector('#wap-ability-btn');
      const myClass = CLASSES[this.me.classId];
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

  updateDuelUI() {
    if (!this.currentDuel) return;
    this.arenaModal.querySelector('#wap-my-name').textContent = this.me.username;
    this.arenaModal.querySelector('#wap-my-hp-text').textContent = `${Math.max(0, this.me.hp)}/${this.me.maxHp}`;
    this.arenaModal.querySelector('#wap-my-hp-bar').style.width = `${Math.max(0, (this.me.hp / this.me.maxHp) * 100)}%`;

    this.arenaModal.querySelector('#wap-opp-name').textContent = this.opp.username;
    this.arenaModal.querySelector('#wap-opp-hp-text').textContent = `${Math.max(0, this.opp.hp)}/${this.opp.maxHp}`;
    this.arenaModal.querySelector('#wap-opp-hp-bar').style.width = `${Math.max(0, (this.opp.hp / this.opp.maxHp) * 100)}%`;
  }

  endDuel(winnerName) {
    if (this.chargeInterval) clearInterval(this.chargeInterval);
    this.addLog(`<div style="color: #ffd700; font-weight: bold; margin-top: 4px;">Победитель дуэли: ${winnerName}!</div>`);
    this.currentDuel.locked = true;

    setTimeout(() => {
      this.arenaModal.style.display = 'none';
      this.currentDuel = null;
    }, 3500);
  }
}