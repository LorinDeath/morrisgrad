// Окно «Задания»: три вида.
//  all — общее окно (U / 📋): вкладки Обучение · Персонажи · Доска охоты · Ежедневные · Еженедельные · Ежемесячные · Тяжёлые · Достижения;
//  nb  — Доска объявлений (Аринар, у места появления): листки-заказы на пробковой доске, «Взято X / Y», взять/отменить/сдать;
//  ab  — Доска достижений (Поляна, у Алтаря тел): таблички по разделам, «Тела» — уровни каждого героя.
// Без «сияния» и «звёзд». Только показ: что засчитать и что выдать — решает сервер (board_claim/take/pin/tut).
import { esc } from './overlay.js';
import { RESOURCES } from '../../../../../server/meta/shared.ts';
import { ITEM_BY_ID } from '../meta/itemCards.js';
import { hasPlace } from './boardLoc.js';
import { UI_CATS, PERIODIC } from '../meta/boardStore.js';

const TAB_IC = { tut: '🧭', npc: '🗣', hunt: '📌', daily: '☀', weekly: '📅', monthly: '🗓', hard: '⚔', ach: '🏆' };
const SHORT = { tut: 'Обучение', npc: 'Персонажи', hunt: 'Доска охоты', daily: 'День', weekly: 'Неделя', monthly: 'Месяц', hard: 'Тяжёлые', ach: 'Достижения' };
const AB_SECT = [
  ['body', 'Тела', (id) => id.startsWith('ach_cls_')],
  ['hunt', 'Охота', (id) => /^ach_(mob|wb|rare|biome)_/.test(id) || ['ach_kills', 'ach_kills_lvl', 'ach_elite', 'ach_cursed', 'ach_ench', 'ach_party_k', 'ach_wboss', 'ach_rare', 'ach_solo_wb', 'ach_night', 'ach_wbosses_all', 'ach_bestiary'].includes(id)],
  ['craft', 'Добыча и ремесло', (id) => /^ach_(gather|loot|bags|chests|craft|salvage|upgrade|upg|mat|items|equipped|monster|look|ench_eq|lock)/.test(id)],
  ['trial', 'Испытания и бои', (id) => /^ach_(trial|runs|crypt|abyss|duel|pvp|pk|deaths)/.test(id)],
  ['world', 'Мир и герой', () => true],
];
const secOf = (t) => (t.hid ? 'hidden' : AB_SECT.find((s) => s[2](t.id))[0]);
const fmtLeft = (ms) => { const s = Math.max(0, Math.round(ms / 1000)), d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60); return d ? `${d} д ${h} ч` : h ? `${h} ч ${m} мин` : `${m} мин`; };

export class BoardWin {
  /** opt: { mobile, near(kind) — рядом ли с доской nb/ab, heroLvl(), onTrack() } */
  constructor(overlay, store, opt) {
    this.ov = overlay; this.s = store; this.opt = opt; this.isOpen = false; this.mode = 'all'; this.tab = 'tut'; this.abSec = 'body'; this.scroll = {};
    const el = document.createElement('div'); el.className = 'mc-bd'; el.style.display = 'none'; overlay.layer.appendChild(el); this.el = el;
    el.addEventListener('pointerdown', (e) => { e.stopPropagation(); if (e.target === el) this.close(); });
    el.addEventListener('wheel', (e) => e.stopPropagation(), { passive: true });
    el.addEventListener('touchmove', (e) => e.stopPropagation(), { passive: true });
    el.addEventListener('click', (e) => this.onClick(e));
    store.on(() => { if (this.isOpen) this.render(); });
    this.timer = 0;
  }
  open(mode = 'all', tab) {
    try {
      this.mode = mode; if (tab) this.tab = tab;
      else if (mode === 'all') { const st = this.s.tutStep(); this.tab = st ? 'tut' : this.tab === 'tut' ? 'daily' : this.tab; }
      this.isOpen = true; this.el.style.display = ''; this.render(); this.s.ui('board'); this.opt.onShow?.(true);
      clearInterval(this.timer); this.timer = setInterval(() => { if (this.isOpen) this.renderInfo(); }, 30000);
    } catch (e) { console.error('[board] MC-B02', e); this.close(); this.ov.toast('Окно заданий не открылось (MC-B02)', '#fca5a5'); }
  }
  close() { this.isOpen = false; this.el.style.display = 'none'; clearInterval(this.timer); this.opt.onShow?.(false); }
  toggle(mode, tab) { if (this.isOpen && this.mode === mode && (!tab || tab === this.tab)) this.close(); else this.open(mode, tab); }

  xpOf(t, ti) { // как на сервере (tierXp): % от опыта уровня по таблице «уровень × сложность»
    const X = this.s.defs?.xp, hl = this.s.st?.lvl || 1; if (!X) return 0;
    const L0 = t.lvl > 0 ? Math.max(1, Math.min(hl, t.lvl + (X.refPlus | 0))) : hl, L = Math.min(X.need.length, L0);
    let b = X.bands.findIndex((v) => L <= v); if (b < 0) b = X.bands.length - 1;
    const pct = Number(X.t?.[b]?.[Math.max(0, Math.min(4, ((t.d?.[ti] | 0) || 1) - 1))]) || 0;
    return Math.round((X.need[L - 1] || 0) * pct / 100);
  }
  rewardText(t, ti) {
    const out = [], xp = this.xpOf(t, ti); if (xp) out.push(`+${xp} опыта`);
    for (const [k, v] of Object.entries(t.res || {})) out.push(`${RESOURCES[k]?.icon || ''}${v} ${RESOURCES[k]?.name || k}`);
    if (t.item && ti === (t.n.length - 1)) out.push(`🎁 ${ITEM_BY_ID[t.item]?.name || 'предмет'}`);
    return out.join(' · ');
  }
  // ——— общий вид строки ———
  row(t, o = {}) {
    const S = this.s, r = S.tier(t), lk = S.locked(t.id), hid = S.hiddenLocked(t);
    const pct = r.done ? 100 : Math.round((r.have / Math.max(1, r.n)) * 100);
    const tierTxt = r.all > 1 ? `Ступень ${Math.min(r.c + 1, r.all)} из ${r.all}` : '';
    const g = t.g && t.g !== 'board' && this.mode !== 'nb' ? `<small class="g">${esc(S.giverName(t))}</small>` : '';
    const needTake = t.take && !S.taken(t.id), atNb = t.nb && !this.opt.near('nb');
    let btn = '';
    if (!hid && !r.done && !lk) {
      if (needTake) btn += this.opt.near('nb') ? `<button data-b="take" data-v="${t.id}">Взять</button>` : `<span class="hint">Взять — у Доски объявлений</span>`;
      else if (r.ready && t.cat === 'tut') btn += `<span class="hint">Засчитано — награда придёт сама</span>`;
      else if (r.ready) btn += atNb ? `<span class="hint">Сдать — у Доски объявлений</span>` : `<button class="go" data-b="claim" data-v="${t.id}">Забрать${r.ready > 1 ? ` (${r.ready})` : ''}</button>`;
      if (t.take && S.taken(t.id) && !r.ready && this.opt.near('nb')) btn += `<button class="ghost" data-b="drop" data-v="${t.id}">Отменить</button>`;
      if (!needTake && t.cat !== 'tut') btn += `<button class="pin ${S.pinned(t.id) ? 'on' : ''}" data-b="pin" data-v="${t.id}" title="Показывать в трекере">${S.pinned(t.id) ? '✔ В трекере' : '＋ В трекер'}</button>`;
    }
    const where = !hid && !r.done && hasPlace(t) ? '<small class="pl" title="Трекер покажет стрелку">➤ есть место на карте</small>' : '';
    const why = hid ? 'Скрытое достижение. Условие откроется, когда вы его выполните.' : S.why(t);
    const ctl = !hid && o.ctl ? `<div class="ctl">${esc(o.ctl)}</div>` : '';
    return `<div class="mc-bd-row${r.ready && !r.done ? ' ready' : ''}${r.done ? ' done' : ''}${lk ? ' lock' : ''}${hid ? ' hid' : ''}" data-id="${t.id}">
      <div class="l"><div class="nm">${r.done ? '✔ ' : ''}${esc(S.title(t))} ${g}</div>
      ${why ? `<div class="w">${esc(why)}</div>` : ''}${ctl}
      ${hid ? '' : `<div class="bar"><i style="width:${pct}%"></i><span>${r.done ? 'выполнено' : `${r.have} / ${r.n}`}</span></div>`}
      <div class="tr">${[tierTxt, lk ? '🔒 ' + esc(lk) : !r.done && !hid ? esc(this.rewardText(t, r.i)) : ''].filter(Boolean).join(' · ')} ${where}</div></div>
      <div class="r">${btn}</div></div>`;
  }
  // ——— вкладка «Обучение» ———
  tutBody() {
    const S = this.s, st = S.st, L = S.list('tut'), cur = S.tutStep(), mob = this.opt.mobile;
    const left = S.tutLeft(), state = st.tut.vet ? 'Вы опытный игрок — обучение засчитано без наград.' : st.tut.skip ? 'Обучение пропущено.' : st.tut.off ? 'Подсказки обучения выключены.' : left ? `Осталось шагов: ${left} из ${L.length}` : 'Обучение пройдено!';
    const ctl = [
      !st.tut.skip && !st.tut.vet && left && this.s.defs.cfg.tutSkip ? '<button class="ghost" data-b="tut" data-v="skip">Пропустить обучение</button>' : '',
      st.tut.off ? '<button data-b="tut" data-v="on">Включить подсказки</button>' : !st.tut.skip && left ? '<button class="ghost" data-b="tut" data-v="off">Выключить подсказки</button>' : '',
      st.tut.skip ? '<button class="ghost" data-b="tut" data-v="restart">Вернуть обучение</button>' : '',
    ].join('');
    return `<div class="mc-bd-tut"><div class="st">${esc(state)}</div><div class="bt">${ctl}</div></div>` + L.map((t) => this.row(t, { ctl: (mob ? t.mob : t.pc) || '' })).join('') + (cur ? '' : '');
  }
  listBody(cat) {
    const S = this.s, L = S.list(cat);
    if (cat === 'tut') return this.tutBody();
    if (!L.length) return `<p class="mc-dim">${cat === 'hunt' ? 'Заказы охоты берут у Доски объявлений в Аринаре (у места появления).' : 'Пока пусто — заданий для вашего уровня нет.'}</p>`;
    if (cat === 'npc') { // по персонажам
      const by = {}; for (const t of L) (by[t.g || ''] ||= []).push(t);
      return Object.entries(by).map(([g, ts]) => `<div class="sec">${esc(this.s.defs.givers[g] || '—')}</div>` + ts.filter((t) => !S.locked(t.id) || S.prog(t.id)).slice(0, 40).map((t) => this.row(t)).join('') +
        (ts.some((t) => S.locked(t.id)) ? `<div class="mc-dim sm">Ещё ${ts.filter((t) => S.locked(t.id)).length} — откроются по цепочке и уровню</div>` : '')).join('');
    }
    if (cat === 'ach') return this.achBody(L);
    if (cat === 'hard') return L.map((t) => this.row(t)).join('');
    return L.map((t) => this.row(t)).join('');
  }
  achBody(L) {
    const S = this.s, sec = this.abSec, secs = [...AB_SECT.map((s) => [s[0], s[1]]), ['hidden', 'Скрытые']];
    const cnt = (k) => { const ts = L.filter((t) => secOf(t) === k); return `${ts.filter((t) => S.tier(t).done).length}/${ts.length}`; };
    const nav = `<div class="mc-bd-sub">${secs.map(([k, n]) => `<button class="${k === sec ? 'on' : ''}" data-b="sec" data-v="${k}">${esc(n)} <small>${cnt(k)}</small></button>`).join('')}</div>`;
    const ts = L.filter((t) => secOf(t) === sec).sort((a, b) => +S.tier(b).ready - +S.tier(a).ready || +S.tier(a).done - +S.tier(b).done);
    return nav + ts.map((t) => this.row(t)).join('');
  }
  // ——— Доска объявлений: листки ———
  sheet(t) {
    const S = this.s, r = S.tier(t), taken = S.taken(t.id), lk = S.locked(t.id), boss = /^hunt_(wb|rare)_/.test(t.id);
    const pct = Math.round((r.have / Math.max(1, r.n)) * 100);
    let btn = '';
    if (lk) btn = `<span class="hint">🔒 ${esc(lk)}</span>`;
    else if (!taken && t.take) btn = `<button data-b="take" data-v="${t.id}">Взять заказ</button>`;
    else if (r.ready) btn = `<button class="go" data-b="claim" data-v="${t.id}">Сдать${r.ready > 1 ? ` (${r.ready})` : ''}</button>`;
    if (taken && !r.ready) btn += `<button class="ghost" data-b="drop" data-v="${t.id}">Отменить</button>`;
    if (taken || !t.take) btn += `<button class="pin ${S.pinned(t.id) ? 'on' : ''}" data-b="pin" data-v="${t.id}">${S.pinned(t.id) ? '✔ трекер' : '＋ трекер'}</button>`;
    const rot = ((t.id.length * 37) % 5) - 2;
    return `<div class="mc-nb-sheet${taken ? ' tk' : ''}${r.ready ? ' ready' : ''}${boss ? ' boss' : ''}" style="--rot:${rot * 0.6}deg"><i class="pinh"></i>
      ${boss ? '<div class="stamp">босс</div>' : ''}
      <div class="nm">${esc(S.title(t))}</div><div class="w">${esc(S.why(t))}</div>
      ${taken || !t.take ? `<div class="bar"><i style="width:${pct}%"></i><span>${r.have} / ${r.n}</span></div>` : ''}
      <div class="tr">${r.all > 1 ? `Ступень ${Math.min(r.c + 1, r.all)} из ${r.all} · ` : ''}${esc(this.rewardText(t, r.i))}</div>
      <div class="r">${btn}</div></div>`;
  }
  nbBody() {
    const S = this.s, orders = S.boardOrders(), hunt = orders.filter((t) => t.cat === 'hunt'), other = orders.filter((t) => t.cat !== 'hunt');
    const takenH = hunt.filter((t) => S.taken(t.id)), offer = hunt.filter((t) => !S.taken(t.id));
    const max = S.defs.cfg.huntMax, n = S.takenCount();
    const ready = orders.filter((t) => (!t.take || S.taken(t.id)) && S.tier(t).ready);
    const grid = (ts) => `<div class="mc-nb-grid">${ts.map((t) => this.sheet(t)).join('')}</div>`;
    return `<div class="mc-nb-head"><span class="cnt${n >= max ? ' full' : ''}">Взято ${n} / ${max}</span><span>Новые заказы — через ${fmtLeft((S.st.reset?.daily || 0) - Date.now())}</span></div>` +
      (ready.length ? `<div class="mc-nb-sec">Готово к сдаче</div>${grid(ready)}` : '') +
      `<div class="mc-nb-sec">Ваши заказы</div>${takenH.filter((t) => !S.tier(t).ready).length ? grid(takenH.filter((t) => !S.tier(t).ready)) : '<p class="mc-nb-empty">Пока ничего не взято. Выберите листок ниже.</p>'}` +
      `<div class="mc-nb-sec">Заказы охоты на сегодня</div>${offer.length ? grid(offer) : '<p class="mc-nb-empty">Сегодняшние заказы разобраны.</p>'}` +
      (other.length ? `<div class="mc-nb-sec">Поручения доски</div>${grid(other.filter((t) => !(ready.includes(t))))}` : '');
  }
  renderInfo() {
    const S = this.s, el = this.el.querySelector('.mc-bd-info'); if (!el || !S.st) return;
    const st = S.st, rs = st.reset || {};
    el.innerHTML = this.mode === 'all' && PERIODIC.includes(this.tab) ? `Обновление через ${fmtLeft((rs[this.tab] || 0) - Date.now())} (по Киеву)` +
      (st.cap ? ` · опыт за день: ${st.xd} / ${st.cap}` : '') : this.mode === 'all' && ['npc', 'hunt', 'daily'].includes(this.tab) && st.cap ? `Опыт за задания сегодня: ${st.xd} / ${st.cap}` : '';
  }
  render() {
    const S = this.s;
    if (!S.ready) { this.el.innerHTML = `<div class="mc-bd-box"><div class="hd"><b>Задания</b><button data-b="x">✕</button></div><p class="mc-dim" style="padding:12px">Загрузка… (нужна связь с сервером)</p></div>`; return; }
    const body = this.el.querySelector('.bd'); if (body) this.scroll[this.mode + this.tab + this.abSec] = body.scrollTop;
    const mode = this.mode, cats = UI_CATS.filter((c) => S.defs.cats.includes(c));
    if (!cats.includes(this.tab)) this.tab = cats[0];
    const title = mode === 'nb' ? '📌 Доска объявлений' : mode === 'ab' ? '🏆 Доска достижений' : '📋 Задания';
    const tabs = mode === 'all' ? `<div class="mc-bd-tabs">${cats.map((c) => { const n = S.readyCount(c); return `<button class="${c === this.tab ? 'on' : ''}" data-b="tab" data-v="${c}">${TAB_IC[c]} ${esc(this.opt.mobile ? SHORT[c] : S.defs.names[c] || SHORT[c])}${n ? `<b class="nb">${n}</b>` : ''}</button>`; }).join('')}</div>` : '';
    const content = mode === 'nb' ? this.nbBody() : mode === 'ab' ? this.achBody(S.list('ach')) : this.listBody(this.tab);
    const sub = mode === 'nb' ? 'Берите заказы, охотьтесь, сдавайте здесь же.' : mode === 'ab' ? 'Награды забирайте здесь или в окне «Задания» (U).' : '';
    this.el.innerHTML = `<div class="mc-bd-box mode-${mode}${this.opt.mobile ? ' mob' : ''}"><div class="hd"><b>${title}</b><span class="mc-bd-info"></span><button data-b="x" aria-label="Закрыть">✕</button></div>
      ${sub ? `<div class="sub">${sub}</div>` : ''}${tabs}<div class="bd">${content}</div></div>`;
    this.renderInfo();
    const nb = this.el.querySelector('.bd'); if (nb) nb.scrollTop = this.scroll[this.mode + this.tab + this.abSec] || 0;
  }
  onClick(e) {
    const b = e.target.closest('[data-b]'); if (!b) return; e.stopPropagation();
    const a = b.dataset.b, v = b.dataset.v, S = this.s;
    if (a === 'x') return this.close();
    if (a === 'tab') { this.tab = v; return this.render(); }
    if (a === 'sec') { this.abSec = v; return this.render(); }
    if (b.disabled) return; b.disabled = true; setTimeout(() => { b.disabled = false; }, 600);
    if (a === 'claim') S.claim(v);
    else if (a === 'take') S.take(v, true);
    else if (a === 'drop') S.take(v, false);
    else if (a === 'pin') { S.pin(v, !S.pinned(v)); this.opt.onTrack?.(); }
    else if (a === 'tut') S.tut(v);
  }
}
