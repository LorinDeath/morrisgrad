// Рамка героя (лево-верх оверлея, только открытый мир): аватар 64×64 (обычный / очернённый по порогу из админки),
// имя, тело · уровень, полоска ОЗ. Видна, только когда нет боковой карточки «ГЕРОЙ» (полный экран ПК её показывает сам)
// и не в забеге. Обновляется вместе с HUD (раз в 0.15 с), DOM трогаем только при изменениях.
import { avatarUrl, UI } from './uiSkin.js';
import { RUN_CLASSES } from '../survivors/data.js';
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
export class PlayerFrame {
  constructor(layer, { onClick } = {}) {
    const el = document.createElement('div');
    el.className = 'mc-pframe'; el.style.display = 'none'; el.title = 'Персонаж (C)';
    el.innerHTML = '<span class="mc-av s64"><i></i></span><div class="pf-info"><div class="pf-nm"></div><div class="pf-cl"></div><div class="mc-uibar hp"><i></i><span></span></div></div>';
    el.addEventListener('pointerdown', (e) => { e.stopPropagation(); onClick?.(); });
    layer.appendChild(el);
    this.el = el; this.av = el.querySelector('.mc-av'); this.nm = el.querySelector('.pf-nm'); this.cl = el.querySelector('.pf-cl');
    this.bar = el.querySelector('.mc-uibar i'); this.val = el.querySelector('.mc-uibar span'); this.k = {};
  }
  set(key, v, fn) { if (this.k[key] !== v) { this.k[key] = v; fn(v); } }
  // d: { show, name, heroName, cls, lvl, hp, maxHp, bk }
  update(d) {
    const show = !!(d.show && d.cls);
    this.set('show', show, (v) => { this.el.style.display = v ? '' : 'none'; });
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
