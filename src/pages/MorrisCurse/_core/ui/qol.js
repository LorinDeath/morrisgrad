// Мелкие удобства (каждое выключается в админке «📋 Доска» → QoL): справка по управлению (F1 / ❔),
// предупреждение о низком здоровье, «что открылось» при новом уровне, напоминание о неизрасходованных очках таланта.
// Только показ — ничего не меняет в игре.
import { esc } from './overlay.js';
import { abilitySlots, HERO_NAMES } from '../../../../../server/meta/shared.ts';

const HELP_PC = [['W A S D / стрелки', 'идти'], ['ЛКМ (удерживать)', 'атака в сторону курсора'], ['V', 'автоатака вкл/выкл'], ['Q · G · F', 'навыки'], ['R', 'навык оружия'],
  ['Пробел / Shift', 'рывок'], ['E', 'действие: поговорить, собрать, портал, доска'], ['U', 'задания и достижения'], ['B · J · I · T · K · L', 'книга: меню · задания · снаряжение · герой · навыки · библиотека'],
  ['C', 'лист персонажа'], ['M', 'карта мира'], ['H', 'портал домой'], ['Enter', 'чат'], ['Esc', 'закрыть окно'], ['F1', 'эта справка']];
const HELP_MOB = [['Джойстик слева', 'идти'], ['⚔ (держать)', 'атака с наведением'], ['Круглые кнопки', 'навыки'], ['⚡', 'рывок'], ['✋', 'действие: поговорить, собрать, портал, доска'],
  ['📋', 'задания и достижения'], ['📖', 'книга'], ['🗺', 'карта'], ['🌀', 'портал домой'], ['💬', 'чат'], ['👥', 'игроки и настройки']];

export class QolHud {
  constructor(overlay, meta, board, { mobile }) {
    this.ov = overlay; this.meta = meta; this.board = board; this.mobile = mobile; this.helpOpen = false;
    const L = overlay.layer;
    this.low = document.createElement('div'); this.low.className = 'mc-lowhp'; this.low.innerHTML = '<span>Мало здоровья — отойдите или сделайте рывок</span>'; this.low.style.display = 'none'; L.appendChild(this.low);
    this.nag = document.createElement('div'); this.nag.className = 'mc-talnag'; this.nag.style.display = 'none'; L.appendChild(this.nag);
    this.nag.addEventListener('pointerdown', (e) => { e.stopPropagation(); this.onNag?.(); });
    this.help = document.createElement('div'); this.help.className = 'mc-help'; this.help.style.display = 'none'; L.appendChild(this.help);
    this.help.addEventListener('pointerdown', (e) => { e.stopPropagation(); if (e.target === this.help || e.target.closest('[data-x]')) this.toggleHelp(false); });
    this.helpBtn = document.createElement('button'); this.helpBtn.className = 'mc-bookbtn mc-helpbtn'; this.helpBtn.title = 'Управление (F1)'; this.helpBtn.textContent = '❔';
    this.helpBtn.addEventListener('pointerdown', (e) => { e.stopPropagation(); this.toggleHelp(); }); L.appendChild(this.helpBtn);
    this.lvl = null; this.talSince = 0;
  }
  get cfg() { return this.board.defs?.cfg?.qol || {}; }
  on(k) { return this.board.defs ? this.cfg[k] !== false : k !== 'lvlInfo'; }
  toggleHelp(on = !this.helpOpen) {
    if (on && !this.on('help')) return;
    this.helpOpen = on; this.help.style.display = on ? '' : 'none'; this.ov.layer.parentElement?.classList.toggle('mc-help-open', on); if (!on) return;
    const rows = (this.mobile ? HELP_MOB : HELP_PC).map(([k, v]) => `<tr><td><b>${esc(k)}</b></td><td>${esc(v)}</td></tr>`).join('');
    this.help.innerHTML = `<div class="box"><div class="hd"><b>Управление</b><button data-x>✕</button></div><table>${rows}</table><p class="mc-dim">Не знаете, что делать? Откройте «Задания» (${this.mobile ? '📋' : 'U'}) — вкладка «Обучение».</p></div>`;
  }
  /** meta_state: новый уровень — короткая сводка «что открылось» */
  onState(d) {
    const h = this.meta.hero; if (!h) return;
    const key = h.cls + ':' + h.lvl;
    if (this.lvl && this.lvl.cls === h.cls && h.lvl > this.lvl.lvl && this.on('lvlInfo')) this.lvlUp(h, this.lvl.lvl);
    this.lvl = { cls: h.cls, lvl: h.lvl }; this.key = key;
  }
  lvlUp(h, from) {
    const out = [`+${h.lvl - from} очко таланта (${this.mobile ? '📖 → «Герой»' : 'T'})`];
    if (abilitySlots(h.lvl) > abilitySlots(from)) out.push('3-я ячейка навыка (F)');
    const B = this.board; if (B.defs) { const n = B.defs.tasks.filter((t) => !t.hid && t.min > from && t.min <= h.lvl).length; if (n) out.push(`${n} новых заданий на доске (${this.mobile ? '📋' : 'U'})`); }
    this.ov.toast(`${HERO_NAMES[h.cls] || ''}: уровень ${h.lvl}! Открылось: ${out.join(' · ')}`, '#facc15');
  }
  tick(me, mode) {
    // низкое здоровье: красная рамка по краям экрана (без мигания)
    const pct = me?.maxHp ? (me.hp / me.maxHp) * 100 : 100, low = this.on('lowHp') && mode === 'hub' && me?.alive !== false && pct > 0 && pct < (Number(this.cfg.lowHpPct) || 30);
    if (low !== this._low) { this._low = low; this.low.style.display = low ? '' : 'none'; }
    // очки таланта не потрачены > 90 с — напоминание
    const h = this.meta.hero, tp = h?.talentPoints | 0, now = Date.now();
    if (!tp) this.talSince = 0; else if (!this.talSince) this.talSince = now;
    const nag = this.on('talentNag') && mode === 'hub' && tp > 0 && this.meta.flag('talents_open') && now - this.talSince > 90000;
    if (nag !== this._nag || (nag && this._tp !== tp)) { this._nag = nag; this._tp = tp; this.nag.style.display = nag ? '' : 'none'; this.nag.textContent = `Очки таланта: ${tp} — ${this.mobile ? '📖 → «Герой»' : 'клавиша T'}`; }
    const hb = this.on('help') && !this.mobile; if (hb !== this._hb) { this._hb = hb; this.helpBtn.style.display = hb ? '' : 'none'; }
  }
}
