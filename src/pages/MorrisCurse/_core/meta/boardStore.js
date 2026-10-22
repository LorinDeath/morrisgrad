// Доска заданий и достижений — клиентская копия (только показ). Всё считает и выдаёт сервер (server/meta/board.ts):
// defs — определения (раз в сессию и после правок админки), st — состояние игрока (прогресс, взятые, отслеживаемые).
// meta.state заменяется каждым meta_state, поэтому доска хранится отдельно здесь.
import { RESOURCES, HERO_NAMES } from '../../../../../server/meta/shared.ts';
import { ITEM_BY_ID } from './itemCards.js';
export const UI_CATS = ['tut', 'npc', 'hunt', 'daily', 'weekly', 'monthly', 'hard', 'ach'];
export const PERIODIC = ['daily', 'weekly', 'monthly', 'hard'];
export const RANKS = ['F', 'E', 'D', 'C', 'B', 'A', 'S', 'SS'];
/** плашка ранга: буква в строгой цветной рамке (без свечения); S/SS — «на отряд» */
export const rankTag = (r) => (r ? `<b class="mc-rank r-${r}" title="Ранг ${r}${r === 'S' || r === 'SS' ? ' — на отряд' : ''}">${r}</b>` : '');
/** бонусное условие словами (сервер: board.ts BONUS_NAMES) */
export function bonusText(o) {
  switch (o.k) {
    case 'nodeath': return 'Без единой смерти';
    case 'fast': return `Уложиться в ${o.v} мин с первого засчитанного`;
    case 'body': return `Только в теле: ${HERO_NAMES[o.v] || o.v}`;
    case 'higher': return `Только враги на ${o.v}+ ур. выше вас`;
    case 'party': return 'Только в отряде';
    case 'solo': return 'Только в одиночку';
    case 'night': return 'Только ночью (Аринар)';
    case 'elite': return 'Только элитные враги';
    default: return o.k;
  }
}

export class BoardStore {
  constructor(send) {
    this.send = send; this.defs = null; this.st = null; this.byId = new Map(); this.listeners = new Set(); this.ver = 0;
    this.bmHint = null; // примерное место Чёрного мага (сервер шлёт, пока «Найти Чёрного мага» не выполнено)
  }
  on(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  emit() { this.ver++; for (const fn of this.listeners) { try { fn(this); } catch (e) { console.error('[board]', e); } } }
  get ready() { return !!(this.defs && this.st); }
  get on_() { return !!this.defs?.on; }
  /** из meta_state / board_state */
  apply(d) {
    let ch = false;
    if (d.boardDefs) { this.base = d.boardDefs; ch = true; }
    if (d.board) { this.st = d.board; ch = true; }
    if (ch) { this.merge(); this.emit(); }
  }
  /** выпавший вариант (ранг, количество, бонусы) поверх определения — как effOf на сервере */
  merge() {
    if (!this.base) return;
    const R = this.st?.roll || {};
    const tasks = this.base.tasks.map((t) => { const r = R[t.id]; if (!r) return t;
      return { ...t, n: [r.n], d: [r.d], x: [r.x], rk: r.r, roll: r, ...(r.f ? { f: [t.f, r.f].filter(Boolean).join(','), m: r.f === 'wboss' ? undefined : t.m } : {}), lvl: r.L }; });
    this.defs = { ...this.base, tasks }; this.byId = new Map(tasks.map((t) => [t.id, t]));
  }
  /** тело-владелец набора (ежедневные/еженедельные/ежемесячные/тяжёлые/заказы — у каждого тела свои) */
  get body() { return this.st?.body || ''; }
  bodyName(c) { return HERO_NAMES[c] || c || ''; }
  /** на каком теле выполнять условие ('' — на своём) */
  reqBody(t) { return t?.roll?.rb || (t?.rb && t.rb !== 'owner' ? t.rb : '') || ''; }
  /** «Выполнить на: Мариэль» — если условие на другом теле */
  reqText(t) { const rb = this.reqBody(t); if (!rb) return ''; return rb === 'any' ? 'Выполнить на любом теле' : rb === this.body ? '' : `Выполнить на: ${this.bodyName(rb)}`; }
  /** задания других тел, условие которых — на текущем теле: [{ t (с выпавшим вариантом), o — владелец, p, c }] */
  crossList() {
    if (!this.base || !this.st?.xb) return [];
    const by = new Map(this.base.tasks.map((t) => [t.id, t]));
    return this.st.xb.map((x) => { const t0 = by.get(x.id); if (!t0) return null; const r = x.roll;
      const t = r ? { ...t0, n: [r.n], d: [r.d], x: [r.x], rk: r.r, roll: r, lvl: r.L } : t0; return { t, o: x.o, p: x.p, c: x.c }; }).filter(Boolean);
  }
  /** бонусы задания: [{k,v,xp,ok, st: 'ok'|'fail'|'wait'}] */
  bonuses(t) { const r = t.roll; if (!r) return []; return (r.bon || []).map((o) => ({ ...o, st: !o.ok ? 'fail' : r.done ? 'ok' : 'wait' })); }
  def(id) { return this.byId.get(id) || null; }
  /** название/условие; скрытое — «???», пока не получено */
  title(t) { const r = t.hid && this.st?.reveal?.[t.id]; return r ? r.t : t.t; }
  why(t) { const r = t.hid && this.st?.reveal?.[t.id]; return r ? r.w : t.w || ''; }
  hiddenLocked(t) { return !!t.hid && !this.st?.reveal?.[t.id]; }
  giverName(t) { return this.defs?.givers?.[t.g] || ''; }
  prog(id) { return this.st?.p?.[id] || 0; }
  claimedTiers(id) { return this.st?.c?.[id] || 0; }
  /** ступени: { i — текущая (0…), n — цель текущей, have, done — все взяты, ready — есть что забрать } */
  tier(t) {
    const n = t.n || [1], c = this.claimedTiers(t.id), p = this.prog(t.id);
    const i = Math.min(c, n.length - 1), done = c >= n.length;
    let ready = 0; for (let k = c; k < n.length; k++) if (p >= n[k]) ready++; else break;
    return { i, n: n[i], have: Math.min(p, n[i]), all: n.length, c, done, ready, p };
  }
  taken(id) { return (this.st?.tk || []).includes(id); }
  pinned(id) { return (this.st?.pin || []).includes(id); }
  locked(id) { return this.st?.lock?.[id] || ''; }
  inPeriod(t) { return !PERIODIC.includes(t.cat) || (this.st?.sel?.[t.cat] || []).includes(t.id); }
  /** задания вкладки (с учётом выбора на период и предложения Доски охоты) */
  list(cat) {
    if (!this.defs) return [];
    let L = this.defs.tasks.filter((t) => t.cat === cat);
    if (PERIODIC.includes(cat)) { const sel = this.st?.sel?.[cat] || []; L = sel.map((id) => this.def(id)).filter(Boolean); }
    if (cat === 'hunt') { const off = new Set(this.st?.sel?.hunt || []); L = L.filter((t) => off.has(t.id) || this.taken(t.id)); }
    return L.sort((a, b) => (a.ord || 0) - (b.ord || 0));
  }
  /** заказы у Доски объявлений: охота + всё, что админ перенёс на Доску (giver = board) */
  boardOrders() { if (!this.defs) return []; const off = new Set(this.st?.sel?.hunt || []);
    return this.defs.tasks.filter((t) => t.nb && (t.cat !== 'hunt' || off.has(t.id) || this.taken(t.id)) && !(t.take && this.tier(t).done)); }
  takenCount() { return (this.st?.tk || []).length; } // как считает сервер (лимит «Взято X из Y»)
  readyCount(cat) { if (!this.defs) return 0; let n = 0; for (const t of cat ? this.list(cat) : this.defs.tasks) if ((!t.take || this.taken(t.id)) && this.tier(t).ready && !this.locked(t.id)) n++; return n; }
  /** обучение: текущий шаг (первый не выполненный по порядку) */
  tutStep() {
    const s = this.st; if (!s || !this.defs?.cfg?.tutOn || s.tut.off || s.tut.skip || s.tut.vet) return null;
    for (const t of this.list('tut')) { const r = this.tier(t); if (!r.done && !r.ready) return { t, r }; } // выполнен, но награда ждёт героя — уже не «текущий»
    return null;
  }
  tutLeft() { return this.list('tut').filter((t) => { const r = this.tier(t); return !r.done && !r.ready; }).length; }
  /** личные задания персонажа (поле «кто выдаёт» = id НПС): состояния как у сюжетных квестов — available / active / complete / done / locked.
   *  То же, что сервер шлёт в npc_dialog (npcTasks), — для пометки над НПС (❕/✔) без запроса. */
  npcTasks(npc) {
    if (!this.ready || !this.defs.on) return [];
    const out = [];
    for (const t of this.defs.tasks) {
      if (t.at !== npc) continue;
      const per = PERIODIC.includes(t.cat); if (per && !this.inPeriod(t)) continue;
      const r = this.tier(t); let state;
      if (r.done) state = 'done'; else if (per || this.taken(t.id)) state = r.ready ? 'complete' : 'active';
      else state = this.locked(t.id) ? 'locked' : 'available';
      out.push({ t, state, r });
    }
    return out;
  }
  xpOf(t, ti) { // опыт ступени — число от уровня задания (сервер: board.ts tierXp/tableXp), одинаковое героям любого уровня
    const v = Number(t?.x?.[ti]); return Number.isFinite(v) && v > 0 ? Math.round(v) : 0;
  }
  rewardList(t, ti) {
    const out = [], xp = this.xpOf(t, ti); if (xp) out.push(`+${xp} опыта`);
    const bx = this.bonuses(t).filter((o) => o.st !== 'fail').reduce((a, o) => a + o.xp, 0); if (bx) out.push(`бонусы до +${bx}`);
    for (const [k, v] of Object.entries(t.res || {})) out.push(`${RESOURCES[k]?.icon || ''}${v} ${RESOURCES[k]?.name || k}`);
    if (t.item && ti === (t.n.length - 1)) out.push(`🎁 ${ITEM_BY_ID[t.item]?.name || 'предмет'}`);
    return out;
  }
  // запросы (сервер проверит всё сам)
  claim(id) { this.send({ type: 'board_claim', id }); }
  take(id, on) { this.send({ type: 'board_take', id, on: !!on }); }
  pin(id, on) { this.send({ type: 'board_pin', id, on: !!on }); }
  tut(mode) { this.send({ type: 'board_tut', mode }); }
  ui(k) { if (this.uiSent?.[k]) return; (this.uiSent ||= {})[k] = 1; this.send({ type: 'board_ui', name: k }); }
}
