// Доска заданий и достижений — клиентская копия (только показ). Всё считает и выдаёт сервер (server/meta/board.ts):
// defs — определения (раз в сессию и после правок админки), st — состояние игрока (прогресс, взятые, отслеживаемые).
// meta.state заменяется каждым meta_state, поэтому доска хранится отдельно здесь.
export const UI_CATS = ['tut', 'npc', 'hunt', 'daily', 'weekly', 'monthly', 'hard', 'ach'];
export const PERIODIC = ['daily', 'weekly', 'monthly'];

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
    if (d.boardDefs) { this.defs = d.boardDefs; this.byId = new Map(this.defs.tasks.map((t) => [t.id, t])); ch = true; }
    if (d.board) { this.st = d.board; ch = true; }
    if (ch) this.emit();
  }
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
  // запросы (сервер проверит всё сам)
  claim(id) { this.send({ type: 'board_claim', id }); }
  take(id, on) { this.send({ type: 'board_take', id, on: !!on }); }
  pin(id, on) { this.send({ type: 'board_pin', id, on: !!on }); }
  tut(mode) { this.send({ type: 'board_tut', mode }); }
  ui(k) { if (this.uiSent?.[k]) return; (this.uiSent ||= {})[k] = 1; this.send({ type: 'board_ui', name: k }); }
}
