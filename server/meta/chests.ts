import { parseTag } from "./enchant";
// Сундуки схватки (Albion-стиль). Сервер — авторитет.
// Схватка: мобы, вступившие в бой вместе (пачка/лагерь, в радиусе linkRadius, с общими игроками) — одна схватка.
// Дроп копится; когда умирает ПОСЛЕДНИЙ моб схватки — ОДИН сундук на месте его смерти. Одиночный моб — обычный мешок.
// В сундуке у каждого участника свои броски (личные позиции). Личная фаза personalSec: владелец открывает сразу и видит
// только своё. Потом всё невзятое — общее; сундук стоит publicSec; открыть — канал channelSec, любой урон прерывает;
// окно добычи: брать по одной (Shift+клик), урон закрывает окно. Все настройки — CHEST (админка, вкладка «📦 Сундуки», только админ).
export const CHEST = {
  on: true,              // сундуки схватки включены (выкл — каждый моб роняет мешок, как раньше)
  personalSec: 120,      // личная фаза, с
  publicSec: 3600,       // общий сундук живёт, с (после личной фазы)
  channelSec: 15,        // открытие общего сундука, с (урон прерывает)
  range: 120,            // px: открыть/брать — не дальше
  linkRadius: 450,       // px: мобы в этом радиусе с общими игроками — одна схватка
  linkWindowSec: 20,     // с: схватка рядом, где убийство было не раньше — продолжается (цепочка пулов)
  timeoutSec: 60,        // с: схватка без убийств закрывается (сундук у последнего трупа)
  minSharePct: 7,        // % урона схватки, чтобы получить добычу (боссы/редкие — любой вклад)
  partyNear: true,       // члены отряда участника рядом тоже получают добычу
  partyMode: "personal" as "personal" | "rr" | "roll", // personal — броски каждому; rr — общий бросок отряда по кругу; roll — общий бросок, вещь случайному
  guard: true,           // охрана: при переходе в общий — стража у сундука, если рядом нет мобов
  guardN: 3,             // стражей
  takeRate: 6,           // позиций/с на игрока (двойной клик / Shift+клик, без «забрать всё»)
  // --- Лагерь (сундук зачищенного лагеря) ---
  campRaw: true,         // шансы ровно как в таблице (без equipDropMult/matDropMult); выкл — таблица × campMult
  campMult: 1,           // свой множитель шансов сундука лагеря (если campRaw выкл), кламп 100%
  campSecondPct: 0,      // % шанс второго сундука (независимый второй бросок по тем же убийствам)
  campSpawnEmpty: false, // ставить сундук, даже если бросок пустой
  matDropMult: 1,        // шанс МАТЕРИАЛОВ × в открытом мире (мешки мобов; сундук лагеря и забеги — без него); количество не меняется
  lvlGuard: true,        // страж уровня добычи: вещь сундука лагеря и мешка моба — в окне уровня моба (вариант биома — свой уровень)
  lvlUp: 1,              // окно: не выше уровня моба + lvlUp
  lvlDown: 1,            // окно: не ниже уровня моба − lvlDown
  campIdleSec: 600,      // с: зачистка лагеря без убийств столько времени — сбрасывается (накопленное пропадает)
};
export type ChestEntry = { lid: number; k: "item" | "res"; id: string; n: number; c?: 1; e?: number; o: string }; // o — владелец (pkey) в личной фазе
export type Chest = { keepEmpty?: 1; id: number; world: string; x: number; y: number; at: number; pubAt: number; exp: number; src: string; kind: string; mob: string; guardType: string; entries: ChestEntry[]; guarded?: 1 };
export type Kill = { type: string; lootKey: string; elite: boolean; cursed: boolean; ench?: number; boss: boolean; rare: boolean; special: string; x: number; y: number };
export type Encounter = { id: number; world: string; watch: Set<number>; dmg: Map<string, number>; pkey: Map<string, string>; kills: Kill[]; x: number; y: number; lastAt: number; startAt: number; anyBoss: boolean };

/** живые мобы, связанные с убитым: рядом и в бою с теми же игроками (или того же лагеря и в бою) */
export function linkedAlive(mobs: any[], m: any, players: Set<string>, r = CHEST.linkRadius): any[] {
  const out: any[] = [];
  for (const o of mobs) {
    if (o === m || o.dead || o.reset) continue;
    if (Math.hypot(o.x - m.x, o.y - m.y) > r) continue;
    let eng = !!o.targetSid && players.has(o.targetSid);
    if (!eng) for (const k of o.dmgBy?.keys?.() || []) if (players.has(k)) { eng = true; break; }
    if (!eng && m.camp && o.camp === m.camp && (o.targetSid || o.mobTarget)) eng = true;
    if (eng) out.push(o);
  }
  return out;
}
export function engaged(o: any): boolean { if (!o || o.dead || o.reset) return false; if (o.targetSid) return true; for (const k of o.dmgBy?.keys?.() || []) if (!String(k).startsWith("mob:")) return true; return false; }

export class Encounters {
  map = new Map<number, Encounter>(); byMob = new Map<number, number>(); private seq = 1;
  /** убийство моба: вернёт схватку (дроп копится) или null — одиночный моб (обычный мешок) */
  onKill(world: string, m: any, mobs: any[], pkeyOf: (sid: string) => string | null, now = Date.now()): Encounter | null {
    if (!CHEST.on) return null;
    const players = new Set<string>([...m.dmgBy.keys()].filter((k: string) => !k.startsWith("mob:")));
    if (!players.size) return null;
    let e = this.map.get(this.byMob.get(m.id) || 0) || null;
    if (!e) for (const x of this.map.values()) if (x.world === world && now - x.lastAt < CHEST.linkWindowSec * 1000 && Math.hypot(x.x - m.x, x.y - m.y) < CHEST.linkRadius * 1.5 && [...players].some((p) => x.dmg.has(p))) { e = x; break; }
    const linked = linkedAlive(mobs, m, players);
    if (!e && !linked.length) return null;
    if (!e) { e = { id: this.seq++, world, watch: new Set(), dmg: new Map(), pkey: new Map(), kills: [], x: m.x, y: m.y, lastAt: now, startAt: now, anyBoss: false }; this.map.set(e.id, e); }
    for (const o of linked) { e.watch.add(o.id); this.byMob.set(o.id, e.id); }
    e.watch.delete(m.id); this.byMob.delete(m.id);
    for (const [sid, d] of m.dmgBy as Map<string, number>) if (!sid.startsWith("mob:")) { e.dmg.set(sid, (e.dmg.get(sid) || 0) + d); const pk = pkeyOf(sid); if (pk) e.pkey.set(sid, pk); }
    e.x = m.x; e.y = m.y; e.lastAt = now;
    return e;
  }
  /** схватка закончена? (все наблюдаемые мобы мертвы/сброшены/вышли из боя или таймаут) */
  done(e: Encounter, byId: (id: number) => any, now = Date.now()): boolean {
    for (const id of [...e.watch]) if (!engaged(byId(id))) { e.watch.delete(id); this.byMob.delete(id); }
    return !e.watch.size || now - e.lastAt > CHEST.timeoutSec * 1000;
  }
  close(e: Encounter) { this.map.delete(e.id); for (const id of e.watch) this.byMob.delete(id); }
}

// ---------- сундук ЗАЧИЩЕННОГО ЛАГЕРЯ ----------
// Только мобы лагеря (m.camp) копят добычу; лагерь зачищен, когда КАЖДЫЙ его моб убит хотя бы раз за эту зачистку
// (лагерные мобы возрождаются за ~45 с — «все мертвы одновременно» в большом лагере недостижимо). Тогда — ОДИН сундук
// в центре лагеря, броски по СЫРЫМ шансам таблицы (без equipDropMult/matDropMult). Одиночки, бродяги, стража — мешки.
export type CampRun = Encounter & { camp: number; killed: Set<number> };
export class CampRuns {
  map = new Map<string, CampRun>(); private seq = 1;
  key(world: string, camp: number) { return world + ":" + camp; }
  /** убийство лагерного моба → зачистка (копится). null — не лагерный/сундуки выключены */
  onKill(world: string, m: any, pkeyOf: (sid: string) => string | null, now = Date.now()): CampRun | null {
    if (!CHEST.on || !m.camp || m.chestGuard) return null;
    const players = [...(m.dmgBy?.keys?.() || [])].filter((k: string) => !k.startsWith("mob:"));
    if (!players.length) return null;
    const k = this.key(world, m.camp); let r = this.map.get(k);
    if (r && now - r.lastAt > CHEST.campIdleSec * 1000) { this.map.delete(k); r = undefined; }
    if (!r) { r = { id: this.seq++, camp: m.camp, killed: new Set(), world, watch: new Set(), dmg: new Map(), pkey: new Map(), kills: [], x: m.x, y: m.y, lastAt: now, startAt: now, anyBoss: false }; this.map.set(k, r); }
    r.killed.add(m.id);
    for (const [sid, d] of m.dmgBy as Map<string, number>) if (!sid.startsWith("mob:")) { r.dmg.set(sid, (r.dmg.get(sid) || 0) + d); const pk = pkeyOf(sid); if (pk) r.pkey.set(sid, pk); }
    r.lastAt = now; return r;
  }
  /** зачищен ли лагерь: каждый (не снятый навсегда) моб лагеря убит за эту зачистку */
  cleared(r: CampRun, mobs: any[]): boolean {
    let n = 0; for (const o of mobs) if (o.camp === r.camp && o.respawnAt !== -1) { n++; if (!r.killed.has(o.id)) return false; }
    return n > 0;
  }
  close(r: CampRun) { this.map.delete(this.key(r.world, r.camp)); }
  expire(now = Date.now()) { for (const [k, r] of this.map) if (now - r.lastAt > CHEST.campIdleSec * 1000) this.map.delete(k); }
}

/** получатели: вклад ≥ minSharePct урона схватки (босс/редкий — любой) + отряд рядом (partyNear). sid → pkey */
export function recipients(e: Encounter, party: (sid: string) => string[]): Map<string, string> {
  const total = [...e.dmg.values()].reduce((a, b) => a + b, 0) || 1, out = new Map<string, string>();
  const any = e.kills.some((k) => k.boss || k.rare);
  for (const [sid, d] of e.dmg) { if (!any && (d / total) * 100 < CHEST.minSharePct) continue; const pk = e.pkey.get(sid); if (pk) out.set(sid, pk); }
  if (CHEST.partyNear) for (const sid of [...out.keys()]) for (const g of party(sid)) if (!out.has(g)) { const pk = e.pkey.get(g) || null; if (pk) out.set(g, pk); }
  return out;
}

type Roll = { items: string[]; res: Record<string, number> };
/** броски по всем убийствам схватки: personal — каждому свой; rr/roll — один бросок на отряд, вещи по кругу/случайно */
export function rollChest(e: Encounter, rec: Map<string, string>, groupOf: (sid: string) => string[], roll: (k: Kill) => Roll, rnd: () => number): { o: string; id: string; k: "item" | "res"; n: number }[] {
  const out: { o: string; id: string; k: "item" | "res"; n: number }[] = [];
  const add = (pk: string, r: Roll) => { for (const id of r.items) out.push({ o: pk, id, k: "item", n: 1 }); for (const [id, n] of Object.entries(r.res)) if (n > 0) out.push({ o: pk, id, k: "res", n }); };
  const groups: string[][] = [];
  if (CHEST.partyMode === "personal") for (const s of rec.keys()) groups.push([s]);
  else { const seen = new Set<string>(); for (const s of rec.keys()) { if (seen.has(s)) continue; const g = [s, ...groupOf(s).filter((x) => x !== s && rec.has(x))]; g.forEach((x) => seen.add(x)); groups.push(g); } }
  for (const g of groups) {
    let rr = Math.floor(rnd() * g.length);
    for (const k of e.kills) {
      const r = roll(k);
      if (g.length === 1) { add(rec.get(g[0])!, r); continue; }
      for (const id of r.items) { const who = CHEST.partyMode === "roll" ? g[Math.floor(rnd() * g.length)] : g[rr++ % g.length]; add(rec.get(who)!, { items: [id], res: {} }); }
      for (const [id, n] of Object.entries(r.res)) { const per = Math.floor(n / g.length); let extra = n - per * g.length; for (const s of g) { const q = per + (extra-- > 0 ? 1 : 0); if (q) add(rec.get(s)!, { items: [], res: { [id]: q } }); } }
    }
  }
  return out;
}

export class Chests {
  chests = new Map<number, Chest>(); private nextId = 1; private nextLid = 1;
  chan = new Map<string, { id: number; at: number; sid: string }>(); // pkey → открытие общего сундука (канал)
  open = new Map<string, { id: number; at: number; sid: string }>(); // pkey → открытое окно
  dirty = new Set<number>(); removed = new Set<number>();
  private rl = new Map<string, { t: number; tokens: number }>();
  seed(list: Chest[]) { for (const c of list) { this.chests.set(c.id, c); this.nextId = Math.max(this.nextId, c.id + 1); for (const e of c.entries) this.nextLid = Math.max(this.nextLid, e.lid + 1); } }
  spawn(world: string, x: number, y: number, ents: { o: string; id: string; k: "item" | "res"; n: number }[], src: string, kind: string, mob: string, guardType: string, now = Date.now(), keepEmpty = false): Chest | null {
    if (!ents.length && !keepEmpty) return null;
    const entries: ChestEntry[] = ents.map((e) => { const tg = e.k === "item" ? parseTag(e.id) : { id: e.id, c: false, e: 0 }, c = tg.c; return { lid: this.nextLid++, k: e.k, id: tg.id, n: e.n, o: e.o, ...(tg.e ? { e: tg.e } : {}), ...(c ? { c: 1 as const } : {}) }; });
    const c: Chest = { id: this.nextId++, world, x: Math.round(x), y: Math.round(y), at: now, pubAt: now + CHEST.personalSec * 1000, exp: now + (CHEST.personalSec + CHEST.publicSec) * 1000, src, kind, mob, guardType, entries, ...(keepEmpty && !entries.length ? { keepEmpty: 1 as const } : {}) };
    this.chests.set(c.id, c); this.dirty.add(c.id); return c;
  }
  isPublic(c: Chest, now = Date.now()) { return now >= c.pubAt; }
  /** позиции, видимые игроку: личная фаза — только свои; общая — все */
  visible(c: Chest, pk: string, now = Date.now()) { return this.isPublic(c, now) ? c.entries : c.entries.filter((e) => e.o === pk); }
  expire(now = Date.now()) { const gone: Chest[] = []; for (const [id, c] of this.chests) if (now >= c.exp || (!c.entries.length && !c.keepEmpty)) { this.chests.delete(id); this.removed.add(id); this.dirty.delete(id); gone.push(c); } return gone; }
  /** для zone_state: [id, x, y, фаза 0/1, осталось с, видимых мне, всего, проклятых видимых мне (≤5)] — в личной фазе только свои (чужое не уходит) */
  near(pk: string, world: string, x: number, y: number, r: number, now = Date.now()) {
    const out: number[][] = [];
    for (const c of this.chests.values()) if (c.world === world && Math.abs(c.x - x) <= r && Math.abs(c.y - y) <= r) { const pub = this.isPublic(c, now); { const vis = pub ? c.entries : c.entries.filter((e) => e.o === pk); out.push([c.id, c.x, c.y, pub ? 1 : 0, Math.max(0, Math.ceil(((pub ? c.exp : c.pubAt) - now) / 1000)), vis.length, c.entries.length, Math.min(5, vis.filter((e) => e.c).length)]); } }
    return out;
  }
  get(id: any, world: string, x: number, y: number, now = Date.now()): Chest | string {
    const c = this.chests.get(Number(id));
    if (!c || now >= c.exp || (!c.entries.length && !c.keepEmpty)) return "Сундук исчез";
    if (c.world !== world || Math.hypot(c.x - x, c.y - y) > CHEST.range) return "Подойдите ближе к сундуку";
    return c;
  }
  /** клик по сундуку: личная фаза — сразу (если есть свои); общая — канал (или уже открыт) */
  tryOpen(c: Chest, pk: string, sid: string, now = Date.now()): { view: true } | { channel: number } | { err: string } {
    if (!this.isPublic(c, now)) {
      if (!c.keepEmpty && !c.entries.some((e) => e.o === pk)) return { err: `Сундук пока личный: станет общим через ${Math.ceil((c.pubAt - now) / 1000)} с` };
      this.open.set(pk, { id: c.id, at: now, sid }); return { view: true };
    }
    const o = this.open.get(pk); if (o && o.id === c.id && o.at >= c.pubAt) return { view: true }; // окно личной фазы в общую не переходит — нужен канал
    const ch = this.chan.get(pk); if (ch && ch.id === c.id) return { channel: ch.at + CHEST.channelSec * 1000 };
    this.open.delete(pk); this.chan.set(pk, { id: c.id, at: now, sid });
    return { channel: now + CHEST.channelSec * 1000 };
  }
  /** тик каналов/окон: hurt(sid) — время последнего урона; pos(sid) — позиция/жив. Возвращает события для отправки. */
  tick(now: number, hurt: (sid: string) => number, pos: (sid: string) => { world: string; x: number; y: number; alive: boolean } | null) {
    const ev: { k: "opened" | "cancel" | "close"; pk: string; sid: string; id: number; why?: string }[] = [];
    for (const [pk, ch] of this.chan) {
      const c = this.chests.get(ch.id), p = pos(ch.sid);
      let why = !c ? "Сундук исчез" : !p || !p.alive ? "Открытие прервано" : hurt(ch.sid) > ch.at ? "Открытие прервано: вас ударили" : p.world !== c.world || Math.hypot(c.x - p.x, c.y - p.y) > CHEST.range + 40 ? "Открытие прервано: вы отошли" : "";
      if (why) { this.chan.delete(pk); ev.push({ k: "cancel", pk, sid: ch.sid, id: ch.id, why }); continue; }
      if (now >= ch.at + CHEST.channelSec * 1000) { this.chan.delete(pk); this.open.set(pk, { id: ch.id, at: now, sid: ch.sid }); ev.push({ k: "opened", pk, sid: ch.sid, id: ch.id }); }
    }
    for (const [pk, o] of this.open) {
      const c = this.chests.get(o.id), p = pos(o.sid);
      const why = !c ? "Сундук исчез" : !p || !p.alive ? "Окно закрыто" : (this.isPublic(c, now) && hurt(o.sid) > o.at) ? "Вас ударили — окно добычи закрыто" : (o.at < c.pubAt && now >= c.pubAt) ? "Сундук стал общим — откройте заново" : p.world !== c.world || Math.hypot(c.x - p.x, c.y - p.y) > CHEST.range + 30 ? "Вы отошли от сундука" : "";
      if (why) { this.open.delete(pk); ev.push({ k: "close", pk, sid: o.sid, id: o.id, why }); }
    }
    return ev;
  }
  admit(pk: string, now = Date.now()) { const r = this.rl.get(pk) || { t: now, tokens: CHEST.takeRate }; r.tokens = Math.min(CHEST.takeRate, r.tokens + ((now - r.t) / 1000) * CHEST.takeRate); r.t = now; if (r.tokens < 1) { this.rl.set(pk, r); return false; } r.tokens -= 1; this.rl.set(pk, r); return true; }
  /** взять ОДНУ позицию. Проверки: окно открыто этим игроком (и не прервано), позиция есть, личная — только владельцу. */
  take(c: Chest, pk: string, lid: any, give: (e: ChestEntry) => boolean, now = Date.now()): { got?: ChestEntry; err?: string } {
    const o = this.open.get(pk); if (!o || o.id !== c.id) return { err: this.isPublic(c, now) ? "Сначала откройте сундук" : "Окно закрыто" };
    const i = c.entries.findIndex((e) => e.lid === Number(lid)); if (i < 0) return { err: "Уже забрали" }; // анти-дюп: позиция снимается ровно один раз
    const e = c.entries[i];
    if (!this.isPublic(c, now) && e.o !== pk) return { err: "Это чужая добыча" };
    if (!this.admit(pk, now)) return { err: "Не так быстро" };
    if (!give(e)) return { err: "Сумка полна — освободите место" };
    c.entries.splice(i, 1); this.dirty.add(c.id);
    return { got: e };
  }
  viewers(id: number) { return [...this.open.entries()].filter(([, o]) => o.id === id).map(([pk, o]) => ({ pk, sid: o.sid })); }
}
