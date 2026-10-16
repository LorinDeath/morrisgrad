// Окно мешка добычи (Albion-стиль): клик — взять предмет; зажать Shift и провести курсором — забрать всё, над чем прошли;
// «Забрать всё». Внутри игрового контейнера, рамка как у игровых панелей. Сервер — авторитет (loot_take / loot_bag).
import { upBadge } from './upBadge.js';
import { esc } from './overlay.js';
import { card, iconHtml } from '../meta/itemCards.js';
import { curseTint } from './book.js';
import { RESOURCES, RARITIES } from '../../../../../server/meta/shared.ts';

export class LootWindow {
  constructor(host, send) {
    this.host = host; this.send = send; this.el = null; this.bag = null; this.pending = new Set(); this.flushAt = 0; this.shift = false;
    addEventListener('keydown', (e) => { if (e.key === 'Shift') { this.shift = true; if (this.isOpen) e.stopImmediatePropagation(); } /* Shift в окне добычи — проводка, не рывок */ if (e.key === 'Escape' && this.isOpen) { this.close(); e.stopPropagation(); } }, true);
    addEventListener('keyup', (e) => { if (e.key === 'Shift') this.shift = false; });
    addEventListener('blur', () => { this.shift = false; });
  }
  get isOpen() { return !!this.el; }
  open(bag) {
    this.bag = bag;
    if (!this.el) {
      const el = document.createElement('div'); el.className = 'mc-loot'; el.id = 'mc-loot';
      el.innerHTML = `<header><b>💰 Добыча</b><small class="ttl"></small><button class="x" title="Закрыть (Esc)">✕</button></header>
        <div class="grid"></div><footer><small>Клик — взять · Shift + провести — забрать много</small><button class="btn gold all">Забрать всё</button></footer><div class="msg"></div>`;
      el.querySelector('.x').onclick = () => this.close();
      el.querySelector('.all').onclick = () => this.send({ type: 'loot_take', bag: this.bag.id, all: true });
      el.addEventListener('keydown', (e) => e.stopPropagation());
      this.host.appendChild(el); this.el = el;
    }
    this.render();
  }
  update(bag) { if (this.bag && bag.id === this.bag.id) { for (const l of bag.taken || []) this.pending.delete(l); this.bag = bag; if (!bag.entries.length) { this.close(); return; } this.render(); if (bag.full) this.msg('Сумка полна — освободите место', true); } }
  error(m) { this.msg(m, true); if (/исчез|Подойдите/.test(m)) setTimeout(() => this.close(), 900); }
  msg(t, err) { const m = this.el?.querySelector('.msg'); if (m) { m.textContent = t; m.className = 'msg' + (err ? ' err' : ''); } }
  close() { this.el?.remove(); this.el = null; this.bag = null; this.pending.clear(); this.order = null; }
  /** отойти далеко — окно закрывается */
  tick(px, py) { if (this.bag && Math.hypot(this.bag.x - px, this.bag.y - py) > 140) this.close(); }
  take(lid) {
    if (!this.bag || this.pending.has(lid)) return;
    this.pending.add(lid); this.el?.querySelector(`[data-lid="${lid}"]`)?.classList.add('taking');
    clearTimeout(this.t); this.t = setTimeout(() => { // Shift-проводка: соседние клетки — одним запросом
      const lids = [...this.pending]; if (lids.length && this.bag) this.send({ type: 'loot_take', bag: this.bag.id, lids });
      setTimeout(() => { for (const l of lids) this.pending.delete(l); this.el?.querySelectorAll('.taking').forEach((x) => x.classList.remove('taking')); }, 1500);
    }, 70);
  }
  render() {
    const g = this.el.querySelector('.grid');
    // клетки на ФИКСИРОВАННЫХ местах: взятая становится пустой (сетка не съезжает под курсором при Shift-проводке)
    if (!this.order || this.orderBag !== this.bag.id) { this.order = this.bag.entries.map((e) => e.lid); this.orderBag = this.bag.id; }
    const byLid = new Map(this.bag.entries.map((e) => [e.lid, e]));
    for (const e of this.bag.entries) if (!this.order.includes(e.lid)) this.order.push(e.lid);
    g.innerHTML = this.order.map((lid) => byLid.get(lid) || { empty: true, lid }).map((e) => {
      if (e.empty) return `<div class="cell empty"></div>`;
      if (e.k === 'res') { const r = RESOURCES[e.id] || {}; return `<div class="cell res" data-lid="${e.lid}" title="${esc(r.name || e.id)}"><span class="ic">${r.icon || '◆'}</span><span class="n">${e.n}</span><span class="nm">${esc(r.name || e.id)}</span></div>`; }
      const c = card(e.id) || { name: e.id }; const cursed = !!e.c; const nm = cursed ? ('Проклятый ' + String(c.name || e.id).charAt(0).toLowerCase() + String(c.name || e.id).slice(1)) : (c.name || e.id);
      const rc = cursed ? curseTint() : (RARITIES[c.rarity]?.color || '#9ca3af');
      return `<div class="cell${cursed ? ' cursed' : ''}" data-lid="${e.lid}" data-cursed="${cursed ? 1 : 0}" style="--rc:${rc}" title="${esc(nm)}">${iconHtml(c, 36)}${upBadge(e.up, cursed)}<span class="nm" style="color:${rc}">${esc(nm)}</span>${c.lvl ? `<span class="lv">ур. ${c.lvl}</span>` : ''}${cursed ? '<span class="cz">☠</span>' : ''}</div>`;
    }).join('');
    g.querySelectorAll('[data-lid]').forEach((c) => {
      if (this.pending.has(Number(c.dataset.lid))) c.classList.add('taking');
      const lid = Number(c.dataset.lid);
      c.onclick = () => this.take(lid);
      c.onmouseenter = (e) => { if (this.shift || e.shiftKey) this.take(lid); };
    });
    const left = Math.max(0, Math.round((this.bag.exp - Date.now()) / 1000));
    this.el.querySelector('.ttl').textContent = ` · исчезнет через ${left} с`;
  }
}
