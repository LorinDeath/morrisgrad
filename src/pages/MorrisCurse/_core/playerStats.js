// Карточка «Душа» [C]: характеристики тела, навык класса и лучший забег. (Без дуэльного WAP-интерфейса.)
import { CLASSES, getArmorReduction } from './classes.js';
import { RUN_CLASSES, ABILITIES, WEAPONS, displayClassName } from './survivors/data.js';
import { esc } from './ui/overlay.js';
import { fmtTime } from './ui/runUI.js';

export const DEFAULT_STATS = {
  classId: null,
  hp: 1,
  maxHp: 1,
  armor: 1,
  attack: 1,
  rank: 'Бестелесный дух',
};

export class StatsUI {
  constructor(overlay) {
    this.ov = overlay;
    this.isOpen = false;
  }

  toggleSoulModal(forceState, myStats, myName, currentWorld = 'hellfire', extra = {}) {
    const next = forceState !== undefined ? forceState : !this.isOpen;
    if (!next) { this.close(); return; }
    const st = myStats || DEFAULT_STATS;
    const cls = CLASSES[st.classId] || null;
    const rc = RUN_CLASSES[st.classId] || RUN_CLASSES.soul;
    const ab = ABILITIES[rc.ability];
    const w = WEAPONS[rc.startWeapon];
    let best = null;
    try { best = JSON.parse(localStorage.getItem('mc-run-best') || 'null'); } catch (_) {}
    const html = `<div class="mc3d-results">
      <h2 style="color:${esc(cls?.color || '#a5f3fc')}">${esc(myName)}</h2>
      <div class="mc3d-kv">
        <span>Тело</span><b>${esc(cls ? displayClassName(st.classId, cls.name) : 'Душа (без тела)')}</b>
        <span>Мир</span><b>${currentWorld === 'arinar' ? 'Аринар' : currentWorld === 'hellfire' ? 'Адское Пламя' : esc(currentWorld)}</b>
        <span>Здоровье</span><b>${st.hp} / ${st.maxHp}</b>
        <span>Броня</span><b>${st.armor} (−${Math.round(getArmorReduction(st.armor) * 100)}% урона)</b>
        <span>Атака</span><b>${st.minAtk !== undefined ? `${st.minAtk}–${st.maxAtk}` : (st.attack ?? '—')}</b>
        <span>Щит (цветы)</span><b>${extra.shield || 0}</b>
        <span>Оружие забега</span><b>${w ? `${w.icon} ${esc(w.name)}` : '—'}</b>
        <span>Навык</span><b>${ab ? `${ab.icon} ${esc(ab.name)}` : 'нет (нужно тело)'}</b>
        <span>Лучший забег</span><b>${best ? `${fmtTime(best.time)} · ур. ${best.level} · ☠ ${best.kills}` : '—'}</b>
      </div>
      ${ab ? `<p style="font-size:11px;color:#fde68a">${esc(ab.desc)}</p>` : ''}
    </div>`;
    this.el = this.ov.showScreen(html, [{ text: 'Закрыть [C]', cls: 'ghost', onClick: () => this.close() }], 'mc3d-soul-screen');
    this.isOpen = true;
  }

  close() {
    if (this.isOpen && this.ov.screen === this.el) this.ov.hideScreen();
    this.isOpen = false;
  }
}
