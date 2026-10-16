// Сундук схватки (Albion-стиль). Сервер — авторитет (chest_open / chest_take / chest_view / chest_channel).
// Личная фаза: окно сразу, только свои позиции. Общая: канал открытия (полоса), урон прерывает; брать только Shift+клик по одной.
import { upBadge } from './upBadge.js';
import { esc } from './overlay.js';
import { card, iconHtml } from '../meta/itemCards.js';
import { curseTint } from './book.js';
import { RESOURCES, RARITIES } from '../../../../../server/meta/shared.ts';

export class ChestWindow {
  constructor(host, send) {
    this.host = host; this.send = send; this.el = null; this.c = null; this.bar = null; this.ch = null; this.shift = false; this.pending = new Set();
    addEventListener('keydown', (e) => { if (e.key === 'Shift') { this.shift = true; if (this.isOpen) e.stopImmediatePropagation(); } if (e.key === 'Escape' && this.isOpen) { this.close(); e.stopPropagation(); } }, true);
    addEventListener('keyup', (e) => { if (e.key === 'Shift') this.shift = false; });
    addEventListener('blur', () => { this.shift = false; });
  }
  get isOpen() { return !!this.el; }
  get channeling() { return !!this.ch; }
  // ---- канал открытия ----
  channel(d) {
    // остаток — по своим часам: часы телефона бывают сдвинуты относительно сервера (полоса заполнялась за ~4 с и «висела»)
    const now = Date.now(), left = Number.isFinite(d.left) ? d.left : Math.max(0, d.until - now);
    if (this.ch && this.ch.id === d.id) this.ch.until = now + left; // повторное нажатие — тот же канал, полоса не начинается заново
    else this.ch = { id: d.id, from: now, until: now + left, sec: d.sec };
    if (!this.bar) { const b = document.createElement('div'); b.className = 'mc-chest-chan'; b.innerHTML = `<div class="t">📦 Открытие сундука… <span></span></div><div class="trk"><i></i></div><small>Любой урон прервёт открытие</small>`; this.host.appendChild(b); this.bar = b; }
  }
  cancel(msg) { this.ch = null; if (this.bar) { this.bar.classList.add('fail'); this.bar.querySelector('.t').textContent = msg || 'Открытие прервано'; const b = this.bar; this.bar = null; setTimeout(() => b.remove(), 1400); } }
  // ---- окно ----
  view(d) {
    if (Number.isFinite(d.now)) { const k = Date.now() - d.now; d = { ...d, pubAt: d.pubAt + k, exp: d.exp + k }; } // таймеры окна — в часах клиента
    if (this.ch && this.ch.id === d.id) { this.ch = null; this.bar?.remove(); this.bar = null; }
    if (this.c && this.c.id === d.id && this.el) { if (d.taken) this.pending.delete(d.taken); this.c = d; if (!d.entries.length) { this.close(); return; } this.render(); return; }
    this.c = d; this.order = null;
    if (!this.el) {
      const el = document.createElement('div'); el.className = 'mc-loot mc-chest'; el.id = 'mc-chest';
      el.innerHTML = `<header><b>📦 Сундук схватки</b><small class="ttl"></small><button class="x" title="Закрыть (Esc)">✕</button></header>
        <div class="grid"></div><footer><small>Shift + клик — забрать предмет (по одному)</small></footer><div class="msg"></div>`;
      el.querySelector('.x').onclick = () => this.close();
      el.addEventListener('keydown', (e) => e.stopPropagation());
      this.host.appendChild(el); this.el = el;
    }
    this.render();
  }
  close(msg) { this.el?.remove(); this.el = null; this.c = null; this.pending.clear(); this.order = null; return msg; }
  msg(t, err) { const m = this.el?.querySelector('.msg'); if (m) { m.textContent = t; m.className = 'msg' + (err ? ' err' : ''); } }
  error(d) { if (d.lid) { this.pending.delete(d.lid); this.el?.querySelector(`[data-lid="${d.lid}"]`)?.classList.remove('taking'); } this.msg(d.message, true); }
  take(lid, shift) {
    if (!this.c || this.pending.has(lid)) return;
    if (!shift) { this.msg('Зажмите Shift и кликните по предмету', true); return; }
    this.pending.add(lid); this.el?.querySelector(`[data-lid="${lid}"]`)?.classList.add('taking');
    this.send({ type: 'chest_take', chest: this.c.id, lid });
    setTimeout(() => this.pending.delete(lid), 1500);
  }
  tick(px, py) {
    if (this.ch && this.bar) { const k = Math.min(1, (Date.now() - this.ch.from) / Math.max(1, this.ch.until - this.ch.from)); this.bar.querySelector('i').style.width = (k * 100).toFixed(1) + '%'; this.bar.querySelector('span').textContent = Math.max(0, (this.ch.until - Date.now()) / 1000).toFixed(1) + ' с'; }
    if (this.c && Math.hypot(this.c.x - px, this.c.y - py) > 150) this.close();
    if (this.el && this.c) { const pub = this.c.pub || Date.now() >= this.c.pubAt; const left = Math.max(0, Math.round(((pub ? this.c.exp : this.c.pubAt) - Date.now()) / 1000));
      this.el.querySelector('.ttl').textContent = pub ? ` · общий · исчезнет через ${fmt(left)}` : ` · личный · станет общим через ${fmt(left)}`; }
  }
  render() {
    const g = this.el.querySelector('.grid'), c = this.c;
    if (!this.order || this.orderId !== c.id) { this.order = c.entries.map((e) => e.lid); this.orderId = c.id; }
    const by = new Map(c.entries.map((e) => [e.lid, e])); for (const e of c.entries) if (!this.order.includes(e.lid)) this.order.push(e.lid);
    g.innerHTML = this.order.map((lid) => by.get(lid) || { empty: true }).map((e) => {
      if (e.empty) return `<div class="cell empty"></div>`;
      if (e.k === 'res') { const r = RESOURCES[e.id] || {}; return `<div class="cell res" data-lid="${e.lid}" title="${esc(r.name || e.id)}"><span class="ic">${r.icon || '◆'}</span><span class="n">${e.n}</span><span class="nm">${esc(r.name || e.id)}</span></div>`; }
      const cc = card(e.id) || { name: e.id }, cz = !!e.c, nm = cz ? 'Проклятый ' + String(cc.name || e.id).charAt(0).toLowerCase() + String(cc.name || e.id).slice(1) : cc.name || e.id;
      const rc = cz ? curseTint() : RARITIES[cc.rarity]?.color || '#9ca3af';
      return `<div class="cell${cz ? ' cursed' : ''}${e.mine ? ' mine' : ''}" data-lid="${e.lid}" style="--rc:${rc}" title="${esc(nm)}">${iconHtml(cc, 36)}${upBadge(e.up, cz)}<span class="nm" style="color:${rc}">${esc(nm)}</span>${cc.lvl ? `<span class="lv">ур. ${cc.lvl}</span>` : ''}${cz ? '<span class="cz">☠</span>' : ''}</div>`;
    }).join('');
    g.querySelectorAll('[data-lid]').forEach((el) => { const lid = Number(el.dataset.lid); if (this.pending.has(lid)) el.classList.add('taking'); el.onclick = (ev) => this.take(lid, ev.shiftKey || this.shift); });
  }
}
const fmt = (s) => (s >= 60 ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` : `${s} с`);
