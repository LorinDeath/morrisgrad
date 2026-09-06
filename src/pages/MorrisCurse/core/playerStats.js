// Базовые характеристики призрака
export const DEFAULT_STATS = {
  hp: 1,
  maxHp: 1,
  armor: 1,
  attack: 1,
  rank: 'Бестелесный дух',
};

// Создание и управление DOM-элементами (Тултип + Окно Души)
export class StatsUI {
  constructor(container) {
    this.container = container || document.body;
    this.tooltip = null;
    this.soulModal = null;
    this.isSoulOpen = false;
    this.initDOM();
  }

  initDOM() {
    // 1. Всплывающий тултип при наведении
    this.tooltip = document.createElement('div');
    this.tooltip.id = 'player-hover-tooltip';
    this.tooltip.style.cssText = `
      position: absolute;
      display: none;
      pointer-events: none;
      z-index: 10000;
      background: rgba(12, 10, 20, 0.95);
      border: 1px solid #a855f7;
      box-shadow: 0 0 15px rgba(168, 85, 247, 0.35);
      border-radius: 6px;
      padding: 8px 12px;
      color: #fff;
      font-family: monospace;
      font-size: 12px;
      transform: translate(-50%, -120%);
      transition: opacity 0.1s ease;
      white-space: nowrap;
    `;
    this.container.appendChild(this.tooltip);

    // 2. Окно «Душа»
    this.soulModal = document.createElement('div');
    this.soulModal.id = 'soul-modal';
    this.soulModal.style.cssText = `
      position: absolute;
      inset: 0;
      display: none;
      align-items: center;
      justify-content: center;
      background: rgba(4, 3, 8, 0.85);
      backdrop-filter: blur(6px);
      z-index: 10001;
      font-family: monospace;
    `;
    this.soulModal.innerHTML = `
      <div style="background: #0d0b16; border: 2px solid #38bdf8; border-radius: 8px; width: 280px; padding: 18px; box-shadow: 0 0 25px rgba(56, 189, 248, 0.25); color: #fff; position: relative;">
        <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #1e1b2e; padding-bottom: 8px; margin-bottom: 12px;">
          <span style="font-weight: bold; color: #38bdf8; font-size: 14px;">ОБИТЕЛЬ ДУШИ</span>
          <button id="close-soul-btn" style="background: transparent; border: none; color: #94a3b8; font-size: 18px; cursor: pointer; line-height: 1;">✕</button>
        </div>
        <div id="soul-content" style="display: flex; flex-direction: column; gap: 8px; font-size: 13px;"></div>
      </div>
    `;
    this.container.appendChild(this.soulModal);

    this.soulModal.querySelector('#close-soul-btn').onclick = () => this.toggleSoulModal();
    this.soulModal.addEventListener('click', (e) => {
      if (e.target === this.soulModal) this.toggleSoulModal(false);
    });
  }

  showTooltip(screenX, screenY, player) {
    const stats = player.stats || DEFAULT_STATS;
    this.tooltip.innerHTML = `
      <div style="font-weight: bold; color: #38bdf8; margin-bottom: 4px;">${player.username}</div>
      <div style="color: #ef4444;">❤️ Здоровье: ${stats.hp}/${stats.maxHp}</div>
      <div style="color: #60a5fa;">🛡️ Броня: ${stats.armor}</div>
      <div style="color: #fbbf24;">⚔️ Атака: ${stats.attack}</div>
    `;
    this.tooltip.style.left = `${screenX}px`;
    this.tooltip.style.top = `${screenY}px`;
    this.tooltip.style.display = 'block';
  }

  hideTooltip() {
    this.tooltip.style.display = 'none';
  }

  toggleSoulModal(forceState, myStats, myName) {
    this.isSoulOpen = forceState !== undefined ? forceState : !this.isSoulOpen;
    if (this.isSoulOpen && myStats) {
      const content = this.soulModal.querySelector('#soul-content');
      content.innerHTML = `
        <div style="color: #ffd700; font-size: 14px; font-weight: bold; margin-bottom: 4px;">${myName}</div>
        <div style="color: #94a3b8; font-size: 11px; margin-bottom: 8px;">Статус: ${myStats.rank || 'Бестелесный'}</div>
        <div style="display: flex; justify-content: space-between; border-bottom: 1px dashed #241e3a; padding: 4px 0;">
          <span style="color: #ef4444;">❤️ Жизненная сила:</span>
          <span>${myStats.hp} / ${myStats.maxHp}</span>
        </div>
        <div style="display: flex; justify-content: space-between; border-bottom: 1px dashed #241e3a; padding: 4px 0;">
          <span style="color: #60a5fa;">🛡️ Защитная оболочка:</span>
          <span>${myStats.armor}</span>
        </div>
        <div style="display: flex; justify-content: space-between; border-bottom: 1px dashed #241e3a; padding: 4px 0;">
          <span style="color: #fbbf24;">⚔️ Сила импульса:</span>
          <span>${myStats.attack}</span>
        </div>
        <div style="font-size: 10px; color: #64748b; margin-top: 10px; text-align: center;">(Физическое воздействие заблокировано)</div>
      `;
      this.soulModal.style.display = 'flex';
    } else {
      this.soulModal.style.display = 'none';
      this.isSoulOpen = false;
    }
    return this.isSoulOpen;
  }
}