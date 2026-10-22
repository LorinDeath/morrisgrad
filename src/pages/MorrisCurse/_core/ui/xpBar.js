// Полоса опыта над панелью умений (ПК — над .mc-abar-main, телефон — внизу по центру, над краем экрана). Тонкая, фиолетовая, как полоса
// уровня в окне C. Наведение/касание — «Уровень N · cur/max опыта · P%». За убийство мобов — короткая надпись «+0,1% опыта» (подряд —
// складываются). Перетаскивается (id «xp», ui/uiDrag.js). Админка «🎨 Интерфейс»: xpBar / xpPop / xpPopMs.
import { UI } from './uiSkin.js';

/** доля в процентах по-русски: 0,1 / 0,05 / <0,01 */
export function pctRu(p) {
  if (!(p > 0)) return '0';
  if (p < 0.01) return '<0,01';
  const s = p >= 10 ? p.toFixed(0) : p >= 0.1 ? p.toFixed(1) : p.toFixed(2);
  return s.replace(/\.0+$/, '').replace('.', ',');
}
export class XpBar {
  constructor(layer, mobile) {
    this.layer = layer; this.mobile = !!mobile; this.h = null; this.acc = 0; this.popT = 0; this.tipT = 0; this.vis = true;
    const el = document.createElement('div'); el.className = 'mc-xpbar' + (mobile ? ' mob' : '');
    el.innerHTML = '<i class="f"></i><span class="tip"></span><b class="pop"></b>';
    layer.appendChild(el); this.el = el; this.fill = el.querySelector('.f'); this.tip = el.querySelector('.tip'); this.popEl = el.querySelector('.pop');
    el.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') el.classList.add('tipon'); });
    el.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') el.classList.remove('tipon'); });
    el.addEventListener('click', () => { if (!this.mobile) return; el.classList.add('tipon'); clearTimeout(this.tipT); this.tipT = setTimeout(() => el.classList.remove('tipon'), 2500); }); // телефон: касание — подсказка на 2,5 с
    this.iv = setInterval(() => this.place(), 300);
  }
  /** meta.hero: { lvl, xp, xpNeed } */
  set(h) {
    if (!h) return; this.h = { lvl: h.lvl, xp: Number(h.xp) || 0, need: Number(h.xpNeed) || 0 };
    const p = this.h.need ? Math.min(100, this.h.xp / this.h.need * 100) : 100;
    this.fill.style.width = `${p.toFixed(2)}%`;
    this.tip.textContent = this.h.need ? `Уровень ${this.h.lvl} · ${this.h.xp}/${this.h.need} опыта · ${pctRu(p)}%` : `Уровень ${this.h.lvl} · предел`;
    this.place();
  }
  /** опыт за моба в процентах уровня; подряд — суммируются, пока надпись видна */
  pop(pct) {
    if (UI.xpPop === false || !(pct > 0)) return;
    this.acc += pct; this.popEl.textContent = `+${pctRu(this.acc)}% опыта`;
    this.el.classList.remove('popon'); void this.el.offsetWidth; this.el.classList.add('popon');
    clearTimeout(this.popT);
    this.popT = setTimeout(() => { this.el.classList.remove('popon'); this.acc = 0; }, Math.min(5000, Math.max(600, Number(UI.xpPopMs) || 1600)));
  }
  show(v) { this.vis = !!v; this.place(); }
  /** базовое место (без сдвига игрока): ПК — над панелью умений; если её нет — внизу по центру */
  place() {
    const on = this.vis && UI.xpBar !== false && !!this.h;
    if (this.el.style.display !== (on ? '' : 'none')) this.el.style.display = on ? '' : 'none';
    if (!on || this.mobile) return;
    const main = this.layer.querySelector('.mc-abar-main'), L = this.layer.getBoundingClientRect();
    const r = main?.getBoundingClientRect();
    if (!r || r.width < 20 || getComputedStyle(main.closest('.mc-abar') || main).display === 'none') { this.el.classList.add('free'); this.el.style.left = this.el.style.top = this.el.style.width = ''; return; }
    this.el.classList.remove('free');
    const left = `${Math.round(r.left - L.left)}px`, top = `${Math.round(r.top - L.top - 9)}px`, w = `${Math.round(r.width)}px`;
    if (this.el.style.left !== left) this.el.style.left = left;
    if (this.el.style.top !== top) this.el.style.top = top;
    if (this.el.style.width !== w) this.el.style.width = w;
  }
}
