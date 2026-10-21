// Рамка героя (лево-верх оверлея, только открытый мир): аватар 64×64 (обычный / очернённый по порогу из админки),
// имя, тело · уровень, полоска ОЗ. Видна, только когда нет боковой карточки «ГЕРОЙ» (полный экран ПК её показывает сам)
// и не в забеге. Обновляется вместе с HUD (раз в 0.15 с), DOM трогаем только при изменениях.
import { avatarUrl, UI } from './uiSkin.js';
import { RUN_CLASSES } from '../survivors/data.js';
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
// Слот под кнопку PK (ветка dome-city монтирует в него свою кнопку: mountPkButton(document.getElementById('mc-pf-pk-slot'))).
// Один элемент на страницу: стоит рядом с полоской ОЗ в той рамке героя, что сейчас видна — новая рамка .mc-pframe или
// прежняя карточка «ГЕРОЙ» в левой колонке. Пустой слот скрыт (:empty) — без кнопки вид обеих рамок не меняется.
// Размер — квадратная кнопка в рамке с кольцом прогресса: 36×36 CSS px (ui-cursed.css «слот PK»). Логики PK здесь нет.
export const PK_SLOT_ID = 'mc-pf-pk-slot';
export function pkSlot() {
  let el = document.getElementById(PK_SLOT_ID);
  if (!el) { el = document.createElement('div'); el.id = PK_SLOT_ID; el.className = 'mc-pf-pk-slot'; }
  return el;
}
export class PlayerFrame {
  constructor(layer, { onClick } = {}) {
    const el = document.createElement('div');
    el.className = 'mc-pframe'; el.style.display = 'none'; el.title = 'Персонаж (C)';
    el.innerHTML = '<span class="mc-av s64"><i></i></span><div class="pf-info"><div class="pf-nm"></div><div class="pf-cl"></div><div class="mc-uibar hp"><i></i><span></span></div></div>';
    el.addEventListener('pointerdown', (e) => { e.stopPropagation(); onClick?.(); });
    layer.appendChild(el);
    this.el = el; this.av = el.querySelector('.mc-av'); this.nm = el.querySelector('.pf-nm'); this.cl = el.querySelector('.pf-cl');
    this.bar = el.querySelector('.mc-uibar i'); this.val = el.querySelector('.mc-uibar span'); this.k = {};
    this.info = el.querySelector('.pf-info');
    this.placePk();
  }
  // слот PK — в видимую рамку: новая (.mc-pframe, после полоски ОЗ) или прежняя карточка «ГЕРОЙ» (рядом с полоской ОЗ)
  placePk() {
    const slot = pkSlot(), oldBar = document.getElementById('ghud-my-hp-bar')?.parentElement;
    const inNew = !!this.el.offsetParent || !oldBar?.offsetParent;
    const host = inNew ? this.el : oldBar?.parentElement, before = inNew ? null : oldBar?.nextSibling;
    if (!host) { if (!slot.parentElement) this.el.appendChild(slot); return; }
    if (slot.parentElement !== host) { host.insertBefore(slot, before || null); slot.dataset.frame = inNew ? 'new' : 'old'; oldBar?.classList.toggle('mc-pk-near', !inNew); }
  }
  set(key, v, fn) { if (this.k[key] !== v) { this.k[key] = v; fn(v); } }
  // d: { show, name, heroName, cls, lvl, hp, maxHp, bk }
  update(d) {
    const show = !!(d.show && d.cls);
    this.set('show', show, (v) => { this.el.style.display = v ? '' : 'none'; });
    this.placePk();
    if (!show) return;
    const url = UI.avatars ? avatarUrl(d.cls, d.bk, 64) : '';
    this.set('av', url, (u) => { this.av.style.setProperty('--av', u ? `url('${u}')` : 'none'); this.av.classList.toggle('cz', u.includes('_cursed')); this.el.classList.toggle('noav', !u); });
    this.set('nm', d.name, (v) => { this.nm.textContent = v; });
    const body = d.heroName && d.heroName !== d.name ? d.heroName : (RUN_CLASSES[d.cls]?.name || d.heroName || '');
    this.set('cl', `${body} · ур. ${d.lvl || 1}`, (v) => { this.cl.textContent = v; });
    const mx = Math.max(1, d.maxHp || 1), hp = Math.max(0, Math.min(mx, d.hp ?? mx)), p = Math.round(hp / mx * 1000) / 10;
    this.set('p', p, (v) => { this.bar.style.width = `calc(${v}% + ${(v * 0.16).toFixed(1)}px)`; this.el.classList.toggle('low', v < 30); });
    this.set('hv', `${Math.round(hp)} / ${mx}`, (v) => { this.val.textContent = v; });
    this.set('bk', (d.bk | 0) > 0, (v) => this.el.classList.toggle('blk', v));
  }
}
