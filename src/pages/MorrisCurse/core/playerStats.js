import { CLASSES, getArmorReduction } from './classes.js';

export const DEFAULT_STATS = {
  classId: null,
  hp: 1,
  maxHp: 1,
  armor: 1,
  attack: 1,
  rank: 'Бестелесный дух',
};

export class StatsUI {
  constructor(container, onDuelInvite) {
    this.container = container || document.body;
    this.onDuelInvite = onDuelInvite;
    this.isSoulOpen = false;
    this.isTargetOpen = false;
    this.currentTarget = null;

    this.initDOM();
  }

  initDOM() {
    // 1. Быстрый тултип при наведении (сквозной для мыши)
    this.tooltip = document.createElement('div');
    this.tooltip.id = 'player-hover-tooltip';
    this.tooltip.style.cssText = `
      position: absolute; display: none; pointer-events: none; z-index: 10000;
      background: rgba(12, 10, 20, 0.95); border: 1px solid #a855f7;
      box-shadow: 0 0 15px rgba(168, 85, 247, 0.35); border-radius: 6px;
      padding: 6px 10px; color: #fff; font-family: monospace; font-size: 11px;
      transform: translate(-50%, -120%); white-space: nowrap;
    `;
    this.container.appendChild(this.tooltip);

    // 2. Закреплённое окно цели с правого края экрана
    this.targetPanel = document.createElement('div');
    this.targetPanel.id = 'target-inspect-panel';
    this.targetPanel.style.cssText = `
      position: absolute; top: 12px; right: 12px; width: 190px;
      display: none; flex-direction: column; gap: 8px;
      background: rgba(14, 11, 24, 0.96); border: 2px solid #ef4444;
      box-shadow: 0 0 20px rgba(239, 68, 68, 0.35); border-radius: 8px;
      padding: 12px; color: #fff; font-family: monospace; font-size: 12px;
      z-index: 10005; box-sizing: border-box;
    `;
    this.targetPanel.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #2e2444; padding-bottom: 6px;">
        <span style="font-weight: bold; color: #ef4444; font-size: 11px;">ЦЕЛЬ</span>
        <button id="close-target-btn" style="background: none; border: none; color: #94a3b8; font-size: 16px; cursor: pointer; line-height: 1;">✕</button>
      </div>
      <div id="target-body-info" style="display: flex; flex-direction: column; gap: 4px;"></div>
      <button id="target-duel-btn" style="margin-top: 4px; background: #dc2626; border: 1px solid #f87171; color: #fff; padding: 7px; font-family: monospace; font-size: 11px; font-weight: bold; border-radius: 4px; cursor: pointer; transition: 0.2s;">
        ⚔️ Вызвать на дуэль
      </button>
    `;
    this.container.appendChild(this.targetPanel);

    this.targetPanel.querySelector('#close-target-btn').onclick = () => this.hideTarget();
    this.targetPanel.querySelector('#target-duel-btn').onclick = () => {
      if (this.currentTarget && this.onDuelInvite) {
        this.onDuelInvite(this.currentTarget.id, this.currentTarget.username);
        this.hideTarget();
      }
    };

    // 3. Окно «Душа / Персонаж» [C]
    this.soulModal = document.createElement('div');
    this.soulModal.id = 'soul-modal';
    this.soulModal.style.cssText = `
      position: absolute; inset: 0; display: none; align-items: center; justify-content: center;
      background: rgba(4, 3, 8, 0.85); backdrop-filter: blur(6px); z-index: 10001; font-family: monospace;
    `;
    this.soulModal.innerHTML = `
      <div style="background: #0d0b16; border: 2px solid #38bdf8; border-radius: 8px; width: 310px; padding: 18px; box-shadow: 0 0 25px rgba(56, 189, 248, 0.25); color: #fff; position: relative;">
        <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #1e1b2e; padding-bottom: 8px; margin-bottom: 12px;">
          <span id="soul-modal-title" style="font-weight: bold; color: #38bdf8; font-size: 14px;">ОБИТЕЛЬ ДУШИ</span>
          <button id="close-soul-btn" style="background: transparent; border: none; color: #94a3b8; font-size: 18px; cursor: pointer; line-height: 1;">✕</button>
        </div>
        <div id="soul-content" style="display: flex; flex-direction: column; gap: 8px; font-size: 13px;"></div>
      </div>
    `;
    this.container.appendChild(this.soulModal);
    this.soulModal.querySelector('#close-soul-btn').onclick = () => this.toggleSoulModal();
  }

  // Быстрый ховер-тултип (только инфо, без кнопок)
  showTooltip(screenX, screenY, targetPlayer) {
    const stats = targetPlayer.stats || DEFAULT_STATS;
    const isTargetBody = Boolean(stats.classId);
    const className = isTargetBody ? CLASSES[stats.classId].name : 'Дух';
    const redPct = (getArmorReduction(stats.armor) * 100).toFixed(1);

    this.tooltip.innerHTML = `
      <div style="font-weight: bold; color: ${targetPlayer.color || '#38bdf8'};">${targetPlayer.username} [${className}]</div>
      <div style="color: #ef4444;">❤️ ${stats.hp}/${stats.maxHp} | 🛡️ ${redPct}% | ⚔️ ${stats.minAtk || 1}-${stats.maxAtk || 1}</div>
      <div style="color: #64748b; font-size: 9px; margin-top: 2px;">(Клик для выбора цели)</div>
    `;
    this.tooltip.style.left = `${screenX}px`;
    this.tooltip.style.top = `${screenY}px`;
    this.tooltip.style.display = 'block';
  }

  hideTooltip() {
    this.tooltip.style.display = 'none';
  }

  // Открытие закреплённой панели цели по клику
  showTarget(targetPlayer, myPlayer) {
    this.currentTarget = targetPlayer;
    this.isTargetOpen = true;

    const stats = targetPlayer.stats || DEFAULT_STATS;
    const isTargetBody = Boolean(stats.classId);
    const isMyBody = Boolean(myPlayer.stats && myPlayer.stats.classId);
    const className = isTargetBody ? CLASSES[stats.classId].name : 'Бестелесный дух';
    const redPct = (getArmorReduction(stats.armor) * 100).toFixed(1);

    const infoBox = this.targetPanel.querySelector('#target-body-info');
    infoBox.innerHTML = `
      <div style="font-weight: bold; color: ${targetPlayer.color || '#fff'}; font-size: 13px;">${targetPlayer.username}</div>
      <div style="color: #94a3b8; font-size: 11px; margin-bottom: 4px;">Класс: ${className}</div>
      <div style="color: #ef4444;">❤️ HP: ${stats.hp}/${stats.maxHp}</div>
      <div style="color: #60a5fa;">🛡️ Защита: ${stats.armor} (${redPct}%)</div>
      <div style="color: #fbbf24;">⚔️ Урон: ${stats.minAtk || 1} - ${stats.maxAtk || 1}</div>
    `;

    const duelBtn = this.targetPanel.querySelector('#target-duel-btn');
    if (!isTargetBody || !isMyBody || targetPlayer.inDuel || myPlayer.inDuel) {
      duelBtn.disabled = true;
      duelBtn.style.opacity = '0.4';
      duelBtn.style.cursor = 'not-allowed';
      duelBtn.textContent = !isMyBody ? 'Нужно тело' : (!isTargetBody ? 'Цель — дух' : 'В бою');
    } else {
      duelBtn.disabled = false;
      duelBtn.style.opacity = '1';
      duelBtn.style.cursor = 'pointer';
      duelBtn.textContent = '⚔️ Начать дуэль';
    }

    this.targetPanel.style.display = 'flex';
  }

  hideTarget() {
    this.targetPanel.style.display = 'none';
    this.isTargetOpen = false;
    this.currentTarget = null;
  }

  toggleSoulModal(forceState, myStats, myName) {
    this.isSoulOpen = forceState !== undefined ? forceState : !this.isSoulOpen;
    if (this.isSoulOpen && myStats) {
      const isBody = Boolean(myStats.classId);
      const title = this.soulModal.querySelector('#soul-modal-title');
      const content = this.soulModal.querySelector('#soul-content');

      if (!isBody) {
        title.textContent = 'ОБИТЕЛЬ ДУШИ';
        title.style.color = '#38bdf8';
        content.innerHTML = `
          <div style="color: #ffd700; font-weight: bold;">${myName}</div>
          <div style="color: #94a3b8; font-size: 11px;">Статус: Бестелесный дух</div>
          <div style="color: #64748b; font-size: 11px; margin-top: 10px;">
            Подойдите к синему порталу (565, 600), чтобы выбрать тело.
          </div>
        `;
      } else {
        const c = CLASSES[myStats.classId];
        const redPct = (getArmorReduction(myStats.armor) * 100).toFixed(1);
        title.textContent = `ПЕРСОНАЖ: ${c.name.toUpperCase()}`;
        title.style.color = c.color;

        content.innerHTML = `
          <div style="color: #ffd700; font-weight: bold;">${myName}</div>
          <div style="display: flex; justify-content: space-between;"><span>❤️ Здоровье:</span> <span>${myStats.hp} / ${myStats.maxHp}</span></div>
          <div style="display: flex; justify-content: space-between;"><span>🛡️ Броня:</span> <span>${myStats.armor} (${redPct}%)</span></div>
          <div style="display: flex; justify-content: space-between;"><span>⚔️ Базовый урон:</span> <span>${c.minAtk} - ${c.maxAtk}</span></div>
          <div style="margin-top: 8px; font-size: 11px; color: #a855f7;">
            <b>Способность:</b> ${c.ability.name}<br/>
            <span style="color: #94a3b8;">${c.ability.desc}</span>
          </div>
        `;
      }
      this.soulModal.style.display = 'flex';
    } else {
      this.soulModal.style.display = 'none';
      this.isSoulOpen = false;
    }
    return this.isSoulOpen;
  }
}