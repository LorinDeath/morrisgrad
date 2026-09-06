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
    this.initDOM();
  }

  initDOM() {
    // 1. Тултип игрока с кнопкой Дуэли
    this.tooltip = document.createElement('div');
    this.tooltip.id = 'player-hover-tooltip';
    this.tooltip.style.cssText = `
      position: absolute; display: none; pointer-events: auto; z-index: 10000;
      background: rgba(12, 10, 20, 0.95); border: 1px solid #a855f7;
      box-shadow: 0 0 15px rgba(168, 85, 247, 0.35); border-radius: 6px;
      padding: 8px 12px; color: #fff; font-family: monospace; font-size: 12px;
      transform: translate(-50%, -120%); white-space: nowrap;
    `;
    this.container.appendChild(this.tooltip);

    // 2. Модальное окно [C] «Душа / Персонаж»
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

  showTooltip(screenX, screenY, targetPlayer, myPlayer) {
    const stats = targetPlayer.stats || DEFAULT_STATS;
    const isTargetBody = Boolean(stats.classId);
    const isMyBody = Boolean(myPlayer.stats.classId);
    const redPct = (getArmorReduction(stats.armor) * 100).toFixed(1);

    let html = `
      <div style="font-weight: bold; color: ${targetPlayer.color || '#38bdf8'}; margin-bottom: 4px;">
        ${targetPlayer.username} ${isTargetBody ? `[${CLASSES[stats.classId].name}]` : '[Дух]'}
      </div>
      <div style="color: #ef4444;">❤️ Здоровье: ${stats.hp}/${stats.maxHp}</div>
      <div style="color: #60a5fa;">🛡️ Броня: ${stats.armor} (${redPct}%)</div>
      <div style="color: #fbbf24;">⚔️ Атака: ${stats.minAtk || 1}-${stats.maxAtk || 1}</div>
    `;

    if (isTargetBody && isMyBody && !targetPlayer.inDuel && !myPlayer.inDuel) {
      html += `
        <button id="tooltip-duel-btn" style="margin-top: 6px; width: 100%; background: #dc2626; border: none; padding: 4px; border-radius: 4px; color: #fff; font-family: monospace; font-weight: bold; cursor: pointer;">
          ⚔️ Вызвать на дуэль
        </button>
      `;
    }

    this.tooltip.innerHTML = html;
    this.tooltip.style.left = `${screenX}px`;
    this.tooltip.style.top = `${screenY}px`;
    this.tooltip.style.display = 'block';

    const duelBtn = this.tooltip.querySelector('#tooltip-duel-btn');
    if (duelBtn) {
      duelBtn.onclick = (e) => {
        e.stopPropagation();
        this.hideTooltip();
        if (this.onDuelInvite) this.onDuelInvite(targetPlayer.id, targetPlayer.username);
      };
    }
  }

  hideTooltip() {
    this.tooltip.style.display = 'none';
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
            Вы ещё не обрели физическую оболочку. Подойдите к синему порталу (565, 600), чтобы выбрать тело.
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
          <div style="display: flex; justify-content: space-between;"><span>🛡️ Броня:</span> <span>${myStats.armor} (поглощение ${redPct}%)</span></div>
          <div style="display: flex; justify-content: space-between;"><span>⚔️ Базовый урон:</span> <span>${c.minAtk} - ${c.maxAtk}</span></div>
          
          <div style="background: #141024; border: 1px solid #2e264b; border-radius: 4px; padding: 6px; margin-top: 4px; font-size: 11px;">
            <div style="color: #eab308; font-weight: bold;">Замах (x1.0): ${(c.minAtk * 1).toFixed(0)}-${(c.maxAtk * 1).toFixed(0)}</div>
            <div style="color: #f97316; font-weight: bold;">Сверхзаряд (x2.0): ${(c.minAtk * 2).toFixed(0)}-${(c.maxAtk * 2).toFixed(0)}</div>
            <div style="color: #a855f7; font-weight: bold;">Ультразаряд (x3.0): ${(c.minAtk * 3).toFixed(0)}-${(c.maxAtk * 3).toFixed(0)}</div>
          </div>

          <div style="margin-top: 6px; font-size: 11px; color: #a855f7;">
            <b>Способность:</b> ${c.ability.name}<br/>
            <span style="color: #94a3b8;">${c.ability.desc} (КД: ${c.ability.cooldown}с)</span>
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