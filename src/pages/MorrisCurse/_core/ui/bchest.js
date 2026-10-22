// 🎁 Окно «Сундуки наград» (Y / кнопка 🎁 / на телефоне — кнопка в верхнем ряду). Сундуки за сданные задания с рангом
// хранятся на сервере (JSON аккаунта), пока не открыты и не опустошены. Слева — список (вид, ярус, уровень, сколько
// вещей, тело). Справа — шансы и «Открыть»; после открытия — сетка из тех же ячеек, что сумка C (itemSlot): подсказка-сравнение,
// Shift+клик / двойной клик / двойной тап — забрать одну, «Забрать всё», «Надеть», «Разобрать».
// Всё решает сервер (bchest_*); клиент только показывает. Пустой сундук исчезает с «пуфом».
import { TAKE_HINT, isDblTap, markDown, TOUCH } from './dblTap.js';
import { esc } from './overlay.js';
import { card, addCards, ITEM_BY_ID } from '../meta/itemCards.js';
import { itemSlot, curseDef } from './book.js';
import { enchText, enchName } from '../meta/enchCfg.js';
import { RARITIES, RESOURCES } from '../../../../../server/meta/shared.ts';
import { loadAtlas, imageUrl, iconHtml as chestIco } from './chestArt.js';
import { playOpen, poof, bcInst } from './bchestFx.js';

const CAT = { daily: 'Ежедневное', weekly: 'Недельное', monthly: 'Месячное', hard: 'Испытание', hunt: 'Заказ' };
const RAR_ORDER = Object.keys(RARITIES).sort((a, b) => RARITIES[a].order - RARITIES[b].order);
const textCol = (c) => { const m = /^#?([\da-f]{6})$/i.exec(c || ''); if (!m) return c || '#e7e5e4'; const n = parseInt(m[1], 16), l = 0.3 * (n >> 16) + 0.59 * ((n >> 8) & 255) + 0.11 * (n & 255); return l < 70 ? '#d6d3d1' : c; };

export class BchestWindow {
  constructor(host, send, { book, meta } = {}) {
    this.host = host; this.send = send; this.book = book; this.meta = meta; this.el = null; this.st = null; this.sel = null; this.cell = null; this.shift = false; this.pending = new Set(); this.hidden = new Set(); this.fx = null;
    this.A = null; this.icoUrl = { 20: null, 40: null };
    addEventListener('keydown', (e) => { if (e.key === 'Shift') this.shift = true; if (e.key === 'Escape' && this.isOpen && !this.fx) { if (this.cmpEl?.style.display === '') { this.hideCmp(); } else this.close(); e.stopPropagation(); } }, true);
    addEventListener('keyup', (e) => { if (e.key === 'Shift') this.shift = false; });
    addEventListener('blur', () => { this.shift = false; });
  }
  get isOpen() { return !!this.el; }
  toggle() { if (this.isOpen) this.close(); else this.open(); }
  async art() { if (this.A) return; this.A = await loadAtlas(); if (this.A) { this.icoUrl[40] = await imageUrl(this.A.sheets.chests_icons_40?.image || 'chests_icons_40.png'); this.icoUrl[20] = await imageUrl(this.A.sheets.chests_icons_20?.image || 'chests_icons_20.png'); } if (this.el) this.render(); }
  open() {
    if (!this.el) {
      const el = document.createElement('div'); el.className = 'mc-loot mc-bchest'; el.id = 'mc-bchest';
      el.innerHTML = `<header><b>🎁 Сундуки наград</b><small class="ttl"></small><button class="x" title="Закрыть (Esc)">✕</button></header>
        <div class="bc-body"><div class="bc-list"></div><div class="bc-pane"></div></div><div class="msg"></div>`;
      el.querySelector('.x').onclick = () => this.close();
      el.addEventListener('keydown', (e) => e.stopPropagation());
      el.addEventListener('pointerdown', (e) => e.stopPropagation());
      const cm = document.createElement('div'); cm.className = 'mc-cmp bc-cmp'; cm.style.display = 'none'; document.body.appendChild(cm); this.cmpEl = cm; // fixed — вне окна (у окна transform)
      this.host.appendChild(el); this.el = el;
    }
    this.send({ type: 'bchest_list' }); this.art(); this.render();
  }
  close() { this.fx?.stop(); this.fx = null; this.cmpEl?.remove(); this.cmpEl = null; this.el?.remove(); this.el = null; this.cell = null; this.pending.clear(); }
  msg(t, err) { const m = this.el?.querySelector('.msg'); if (m) { m.textContent = t || ''; m.className = 'msg' + (err ? ' err' : ''); } }
  cls() { return this.meta?.hero?.cls || null; }
  cur() { return this.st?.list?.find((c) => c.id === this.sel) || null; }
  /** ответ сервера bchest_state: { list, max, cards, ev? } */
  onState(d) {
    addCards(d.cards);
    const prev = this.st; this.st = d; const ev = d.ev;
    if (ev && !ev.ok && ev.err) this.msg(ev.err, true);
    if (ev?.op === 'open' && ev.ok && ev.chest) { this.msg('');
      this.sel = ev.id; const items = ev.chest.items || [];
      if (ev.fresh && this.el) { // свежее открытие — сцена; клетки появляются, когда в них «легла» вещь
        this.hidden = new Set(items.map((x) => x.lid)); this.render();
        this.fx = playOpen(ev.chest, items, { host: document.body,
          target: (i) => this.el?.querySelector(`.grid [data-lid="${items[i].lid}"]`)?.getBoundingClientRect() || this.el?.querySelector('.grid')?.getBoundingClientRect(),
          onLand: (i) => { this.hidden.delete(items[i].lid); const c = this.el?.querySelector(`.grid [data-lid="${items[i].lid}"]`); if (c) { c.classList.remove('hid'); c.classList.add('pop'); } },
          onDone: () => { this.fx = null; this.hidden.clear(); if (ev.gone) this.poofSel(ev.id); this.render(); } });
        return;
      }
    }
    if (ev && ev.ok && ev.gone) { this.poofSel(ev.id); }
    if (ev?.op === 'take' && ev.got?.length) { for (const g of ev.got) this.pending.delete(g.lid); this.msg(ev.msg || `Забрано: ${ev.got.length}${ev.left ? ` · в сундуке ещё ${ev.left}` : ''}`, !!ev.full); }
    if (ev?.op === 'salvage' && ev.ok) { this.msg(`Разобрано: ${Object.entries(ev.got || {}).map(([k, n]) => `${RESOURCES[k]?.icon || ''}${RESOURCES[k]?.name || k} ×${n}`).join(', ') || 'ничего'}`); }
    if (ev?.op === 'equip' && ev.ok) this.msg('Надето');
    if (ev && !ev.ok) this.pending.clear();
    if (!this.cur() && this.st.list.length && !(ev?.gone)) this.sel = (this.st.list.find((c) => c.hero === this.cls()) || this.st.list[0]).id;
    if (!prev && !this.sel && d.list.length) this.sel = d.list[0].id;
    this.render();
  }
  poofSel(id) { const r = this.el?.querySelector(`.bc-list [data-id="${id}"]`)?.getBoundingClientRect() || this.el?.querySelector('.bc-pane')?.getBoundingClientRect(); if (r) poof(r); if (this.sel === id) this.sel = null; this.cell = null; }
  /** иконка сундука + значок уровня (= уровень задания) */
  ico(c, size, scale = 1, badge = true) { const i0 = this.ico0(c, size, scale), i = c.dark ? `<span class="bc-dark">${i0}</span>` : i0; return badge && c.L ? `<span class="bc-icw" title="${esc(this.tag(c))}">${i}<b class="bc-lv${size * scale < 30 ? ' s' : ''}">${c.L}</b></span>` : i; }
  /** «SS · Ур. 12 · вещи 10–14» */
  tag(c) { const o = c.odds || {}; return `${c.rank} · Ур. ${c.L} · вещи ${o.lo === o.hi ? o.lo : `${o.lo}–${o.hi}`}`; }
  ico0(c, size, scale = 1) { return chestIco(this.A, this.icoUrl[size], c.art, c.opened ? 'open' : 'closed', size, scale) || `<i class="bc-ico fb" style="--cc:${esc(c.color)};width:${size * scale}px;height:${size * scale}px"></i>`; }
  render() {
    if (!this.el) return;
    const L = this.st?.list || [], me = this.cls();
    this.el.querySelector('.ttl').textContent = this.st ? ` · ${L.length} / ${this.st.max}` : ' · загрузка…';
    const list = this.el.querySelector('.bc-list');
    list.innerHTML = L.length ? L.map((c) => `<button class="bc-row${c.id === this.sel ? ' on' : ''}${c.hero !== me ? ' other' : ''}" data-id="${c.id}" style="--cc:${esc(c.color)}">${this.ico(c, 40)}
        <span class="t"><b style="color:${esc(textCol(c.color))}">${esc(c.name)}</b><small class="lvl">${esc(this.tag(c))}</small><small>${esc(CAT[c.cat] || c.cat)}</small>
        <small>${c.opened ? `открыт · внутри ${c.items?.length || 0}` : `вещей ${c.odds.cmin}–${c.odds.cmax}`}${c.hero !== me ? ` · 🔒 ${esc(c.heroName)}` : ''}</small></span></button>`).join('')
      : `<div class="bc-empty">Сундуков пока нет.<br><small>Сдайте задание с рангом (доска 📋, клавиша U) — за ранг дают сундук: F–E простой, D добротный, C редкий, B странный, A легендарный, S божественный, SS чёрный; иногда — проклятый вариант (чем ниже ранг, тем чаще, не больше 30 %; у SS — 2 %).</small></div>`;
    list.querySelectorAll('[data-id]').forEach((b) => { b.onclick = () => { this.sel = Number(b.dataset.id); this.cell = null; this.hideCmp(); this.msg(''); this.render(); }; });
    const pane = this.el.querySelector('.bc-pane'), c = this.cur();
    if (!c) { pane.innerHTML = L.length ? '<div class="bc-empty">Выберите сундук слева</div>' : ''; return; }
    const mine = c.hero === me;
    if (!c.opened) {
      const o = c.odds, rar = RAR_ORDER.filter((r) => o.rar[r] > 0).map((r) => `<div class="od"><span style="color:${RARITIES[r].color}">${esc(RARITIES[r].name)}</span><i><b style="width:${Math.min(100, o.rar[r])}%;background:${RARITIES[r].color}"></b></i><em>${fmtP(o.rar[r])}</em></div>`).join('');
      const en = Object.entries(o.ench || {}).map(([n, p]) => `<span style="color:${enchText(+n)}">${esc(enchName(+n))} ${fmtP(p)}</span>`).join(' · ');
      pane.innerHTML = `<div class="bc-big">${this.ico(c, 40, 2)}<div><b style="color:${esc(textCol(c.color))}">${esc(c.name)}</b><small class="lvl">${esc(this.tag(c))}</small><small>За задание «${esc(CAT[c.cat] || c.cat)}» уровня ${c.L}, ранг ${esc(c.rank)}</small>
          <small>Тело: ${esc(c.heroName)}${mine ? '' : ' — откройте, играя им'}</small></div></div>
        <div class="bc-odds"><div class="row">Вещей: <b>${o.cmin === o.cmax ? o.cmin : `${o.cmin}–${o.cmax}`}</b> · уровень вещей <b>${o.lo}–${o.hi}</b></div>
          <div class="row mc-dim">Качество (шанс на каждую вещь):</div>${rar || '<div class="mc-dim">нет подходящих вещей</div>'}
          <div class="row">✦ Зачарование: ${o.enchCap ? `<b>${fmtP(o.enchPct)}</b>${en ? ` <small>(${en})</small>` : ''} <small>· не выше «<span style="color:${enchText(o.enchCap)}">${esc(enchName(o.enchCap))}</span>»</small>` : '<b>нет</b> <small>· в простом сундуке вещи без зачарования</small>'}</div>
          ${c.cur ? `<div class="row bc-curn">☠ <b>Проклятый сундук</b> <small>· тот же потолок зачарования, что у яруса, но проклятых вещей больше</small></div>` : ''}<div class="row">☠ Проклятые вещи: <b>${fmtP(o.cursePct)}</b>${o.blackCursed > 0 ? ` <small>· из них чёрные проклятые (☠ + «${esc(enchName(6))}») ≈ ${o.blackCursed >= 1 ? fmtP(o.blackCursed) : (+o.blackCursed).toFixed(2) + '%'} от всех вещей</small>` : !c.cur && o.enchCap >= 6 ? ` <small>· чёрные проклятые (☠ + «${esc(enchName(6))}») — только в «Чёрном проклятом» сундуке</small>` : ''}</div>
          <div class="row">🌑 Очернённые (Чёрный маг): ${o.blkPct > 0 ? `<b>${fmtP(o.blkPct)}</b> <small>· статы −${o.blkMin}…${o.blkMax}%, чаще малое</small>` : '<b>нет</b>'}</div></div>
        <footer><button class="btn gold all bc-open"${mine ? '' : ' disabled'}>Открыть</button><small>${mine ? 'Вещи бросаются при открытии и ждут в сундуке, пока не заберёте' : `Сундук героя ${esc(c.heroName)}`}</small></footer>`;
      pane.querySelector('.bc-open').onclick = () => { if (!mine || this.fx) return; this.msg('Открываем…'); this.send({ type: 'bchest_open', id: c.id }); };
      return;
    }
    const items = c.items || [];
    pane.innerHTML = `<div class="bc-head">${this.ico(c, 20, 1)} <b style="color:${esc(textCol(c.color))}">${esc(c.name)}</b><small>${esc(this.tag(c))} · внутри ${items.length}</small></div>
      <div class="grid mc-bag"></div>
      <footer><div class="bc-acts"><button class="btn" data-a="take" disabled>Забрать</button><button class="btn" data-a="equip" disabled>Надеть</button><button class="btn danger" data-a="salvage" disabled>Разобрать</button><button class="btn gold all" data-a="all"${mine ? '' : ' disabled'}>Забрать всё</button></div><small>${TAKE_HINT}${TOUCH ? ' · долгое нажатие — сравнение' : ' · наведите — сравнение с надетым'}</small></footer>`;
    const g = pane.querySelector('.grid');
    const hl = this.meta?.hero?.lvl | 0; // та же ячейка, что в сумке (C): рамки редкости/✦, проклятие, очернение; «ур.» — только если не хватает уровня
    g.innerHTML = items.map((e) => { const it = bcInst(e), d = curseDef(ITEM_BY_ID[e.id], it); if (!d) return ''; const nm = d.name || e.id, low = hl && (d.lvl | 0) > hl;
      return itemSlot(it, d, { tag: 'div', cls: `${this.hidden.has(e.lid) ? ' hid' : ''}${this.cell === e.lid ? ' on' : ''}${this.pending.has(e.lid) ? ' taking' : ''}${low ? ' unmet' : ''}`, attrs: `data-lid="${e.lid}" aria-label="${esc(nm)}"`, req: low ? d.lvl : 0 }); }).join('');
    g.querySelectorAll('[data-lid]').forEach((el) => { const lid = Number(el.dataset.lid);
      el.onpointerdown = (ev) => { markDown(this, lid); if (ev.pointerType !== 'mouse') { clearTimeout(this.lpT); this.lpT = setTimeout(() => this.showCmp(lid, ev.clientX, ev.clientY), 420); } };
      el.onpointerup = el.onpointercancel = () => clearTimeout(this.lpT);
      el.onpointerenter = (ev) => { if (ev.pointerType === 'mouse') this.showCmp(lid, ev.clientX, ev.clientY); };
      el.onpointermove = (ev) => { if (ev.pointerType === 'mouse' && this.cmpEl?.style.display === '') this.placeCmp(ev.clientX, ev.clientY); };
      el.onpointerleave = (ev) => { if (ev.pointerType === 'mouse') this.hideCmp(); };
      el.onclick = (ev) => this.click(lid, ev.shiftKey || this.shift); });
    pane.querySelectorAll('.bc-acts [data-a]').forEach((b) => { const a = b.dataset.a; if (a !== 'all') b.disabled = !mine || !this.cell || !items.some((x) => x.lid === this.cell);
      b.onclick = () => { if (a === 'all') { this.send({ type: 'bchest_take', id: c.id, all: true }); return; } if (!this.cell) return; this.act(a, this.cell); }; });
  }
  act(a, lid) { const c = this.cur(); if (!c || this.pending.has(lid)) return; this.hideCmp(); if (a === 'take') { this.pending.add(lid); this.el?.querySelector(`[data-lid="${lid}"]`)?.classList.add('taking'); setTimeout(() => this.pending.delete(lid), 1500); }
    this.send({ type: 'bchest_' + a, id: c.id, lid }); if (a !== 'take') this.cell = null; }
  click(lid, shift) {
    if (shift || isDblTap(this, lid)) { this.act('take', lid); return; }
    this.cell = this.cell === lid ? null : lid; const x = this.cur()?.items?.find((y) => y.lid === lid), nm = x ? card(x.id)?.name || x.id : '';
    this.msg(this.cell ? `«${nm}» — ${TOUCH ? 'двойной тап — забрать' : 'двойной клик или Shift + клик — забрать'}` : ''); this.render();
  }
  showCmp(lid, x, y) { const it = this.cur()?.items?.find((i) => i.lid === lid); if (!it || !this.book) return;
    const html = this.book.cmpHtml(null, { uid: 'bc' + lid, ...bcInst(it), hint: TOUCH ? 'Двойной тап — забрать · кнопки внизу — надеть/разобрать' : 'Shift + клик — забрать · выделите — «Надеть» / «Разобрать»' });
    if (!html || !this.cmpEl) return; this.cmpEl.innerHTML = html; this.cmpEl.style.display = ''; this.placeCmp(x, y); }
  placeCmp(x, y) { const b = this.cmpEl, w = b.offsetWidth, h = b.offsetHeight; let L = x + 16, T = y + 12; if (L + w > innerWidth - 6) L = Math.max(6, x - w - 16); if (T + h > innerHeight - 6) T = Math.max(6, innerHeight - h - 6); b.style.left = L + 'px'; b.style.top = T + 'px'; }
  hideCmp() { clearTimeout(this.lpT); if (this.cmpEl) this.cmpEl.style.display = 'none'; }
}
const fmtP = (p) => { const v = Number(p) || 0; return (v >= 10 || Number.isInteger(v) ? Math.round(v) : v.toFixed(1)) + '%'; };
