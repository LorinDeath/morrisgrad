// t1221: туман войны (общий на команду в 2×2) и повторы на N мест — сценарные проверки без ИИ.
//   nice bun server/strat/fog-test.ts
import { Database } from "bun:sqlite";
import { readFileSync } from "fs";
import { newGame, apply, view, moveTargets, STRAT_CFG, type GameState, type Race, type Ev } from "./rules";
import { MODES, teamOf, type ModeId } from "./seats";
import { showcaseMap, showcaseAll } from "./showcase";
import { mapFits } from "./terrain";
import { visMask, fogRedact, mergeSeen, fromHex, toHex } from "./fog";
import { startLog, logAct, logEnd, rebuild, turnMarks, moveList, FrameCache, hashG, type RLog } from "./replay";
import { putReplay, libList, pruneReplays, revealFrame } from "./replay-db";
let fails = 0, n = 0; const ok = (c: any, m: string) => { n++; if (!c) { fails++; console.log("FAIL " + m); } else console.log("PASS " + m); };
const C = STRAT_CFG, RS: Race[] = ["fire", "ice", "stone", "water", "nature", "lightning", "fire", "ice"];
const mk = (id: string, md: ModeId) => { const m = (md === "2v2" || md === "1v1" ? showcaseMap(id) : null) || showcaseAll().find((x) => mapFits(x, md))!; return newGame(m.size, RS.slice(0, MODES[md].seats), 0, C, 0, m, { mode: md }); };
const same = (g: GameState) => (a: number, b: number) => teamOf(g, a) === teamOf(g, b);
const cheb = (a: any, b: any) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
/** Вид для места seat — как stateFor: view + события + ОЗ построек + башни + шах, затем туман. */
function seen(g: GameState, seat: number, ev: Ev[] = [], mem?: string) {
  const out: any = { g: view(g, true, C), ev, check: Array.from({ length: g.np || 2 }, () => true), towers: (g.ec.towers || []).map((t) => ({ ...t })),
    bhp: g.ec.cities.map((c) => ({ city: c.id, b: [] })) };
  const V = visMask(g, seat, same(g), C), sh = seat >= 0 ? mergeSeen(mem, V) : "";
  return { out: fogRedact(out, g, seat, same(g), V, fromHex(sh, V.length)), V, sh };
}
const free = (g: GameState, x: number, y: number) => x >= 0 && y >= 0 && x < g.size && y < g.size && !g.pieces.some((p) => p.x === x && p.y === y) && !g.ec.cities.some((c) => c.x === x && c.y === y) && g.map!.t[y * g.size + x] !== "w" && g.map!.t[y * g.size + x] !== "m";

// --- битсет
{ const M = new Uint8Array(37); [0, 5, 17, 36].forEach((i) => (M[i] = 1)); ok(toHex(fromHex(toHex(M), 37)) === toHex(M) && fromHex(toHex(M), 37)[36] === 1 && fromHex(toHex(M), 37)[35] === 0, "hex-битсет: туда-обратно"); }

// --- 2×2: видимость общая на команду, соперникам — нет
{
  const g = mk("m01", "2v2"), N = g.size;
  const V0 = visMask(g, 0, same(g), C), V2 = visMask(g, 2, same(g), C), V1 = visMask(g, 1, same(g), C);
  ok(toHex(V0) === toHex(V2), "союзники A1 и A2 видят одно и то же (общая видимость команды)");
  ok(toHex(V0) !== toHex(V1), "команда B видит иначе");
  ok(g.pieces.filter((p) => teamOf(g, p.owner) === 0).every((p) => V0[p.y * N + p.x]), "клетки всех фигур команды A видны A1 (в т.ч. фигуры союзника)");
  const vc = V0.reduce((a, b) => a + b, 0); ok(vc > 0 && vc < N * N, `видно не всё поле: ${vc}/${N * N}`);
  const r0 = seen(g, 0).out, r2 = seen(g, 2).out, r1 = seen(g, 1).out;
  ok(JSON.stringify(r0.g.pieces.map((p: any) => p.id).sort()) === JSON.stringify(r2.g.pieces.map((p: any) => p.id).sort()), "A1 и A2 получают один и тот же набор фигур");
  ok(r1.g.pieces.filter((p: any) => teamOf(g, p.o) === 0).every((p: any) => V1[p.y * N + p.x]), "B1 получает фигуры команды A только в своей видимости");
  ok(r1.g.pieces.filter((p: any) => teamOf(g, p.o) === 1).length === g.pieces.filter((p) => teamOf(g, p.owner) === 1).length, "B1 получает все фигуры своей команды");
  ok(r1.check[0] === false && r1.check[2] === false && r1.check[1] === true && r1.check[3] === true, "шах соперников не уходит (только своей команды)");
  ok(typeof r1.fog?.vis === "string" && r1.fog.vis === toHex(V1), "в состоянии есть маска тумана");
  const spec = seen(g, -1).out; ok(spec.g.pieces.length === 0 && spec.ev.length === 0 || spec.g.pieces.length === 0, "зритель в живой партии с туманом не получает фигур");

  // радиус: 3 у обычной фигуры, 4 у Всадника (Чебышёв), прочие источники обзора убраны
  const h = structuredClone(g); const me = h.pieces.find((p) => p.owner === 0 && p.kind !== "knight" && p.kind !== "king")!;
  h.pieces = h.pieces.filter((p) => p.id === me.id || p.owner !== 0 && p.owner !== 2); h.ec.cities = h.ec.cities.filter((c) => teamOf(h, c.owner) !== 0); h.ec.towers = [];
  for (const c of h.ec.cities) { (c as any).grow = []; }
  const VV = visMask(h, 0, same(h), C);
  const pts = Array.from({ length: N * N }, (_, i) => ({ x: i % N, y: Math.floor(i / N) })).filter((q) => cheb(q, me) <= 4);
  const ownT = (x: number, y: number) => false; void ownT;
  ok(pts.filter((q) => cheb(q, me) <= 3).every((q) => VV[q.y * N + q.x]), "фигура видит радиус 3");
  const ring4 = pts.filter((q) => cheb(q, me) === 4); ok(ring4.some((q) => !VV[q.y * N + q.x]), "4-я клетка уже вне обзора обычной фигуры");
  me.kind = "knight"; const VK = visMask(h, 0, same(h), C); ok(ring4.every((q) => VK[q.y * N + q.x]), "Всадник видит радиус 4");
  me.kind = "pawn";
  // враг на 3 клетках виден, на 5 — нет; событие хода скрытого врага вырезано
  const foe = h.pieces.find((p) => p.owner === 1)!; const near = pts.find((q) => cheb(q, me) === 3 && free(h, q.x, q.y)), far = Array.from({ length: N * N }, (_, i) => ({ x: i % N, y: Math.floor(i / N) })).find((q) => cheb(q, me) === 6 && free(h, q.x, q.y) && !visMask(h, 0, same(h), C)[q.y * N + q.x]);
  ok(!!near && !!far, "есть клетки для проверки");
  foe.x = near!.x; foe.y = near!.y; let R = seen(h, 0, [{ e: "move", id: foe.id, x: foe.x, y: foe.y } as any]).out;
  ok(R.g.pieces.some((p: any) => p.id === foe.id) && R.ev.length === 1, "враг в 3 клетках виден, его ход — тоже");
  foe.x = far!.x; foe.y = far!.y; R = seen(h, 0, [{ e: "move", id: foe.id, x: foe.x, y: foe.y } as any, { e: "hit", id: foe.id, t: 99999, dmg: 3 } as any, { e: "turn", cur: 1, turn: 2 } as any]).out;
  ok(!R.g.pieces.some((p: any) => p.id === foe.id), "враг вне обзора не приходит (сервер вырезал)");
  ok(R.ev.length === 1 && R.ev[0].e === "turn", "события скрытого врага вырезаны, общие — оставлены");
  ok(!JSON.stringify(R).includes(`"id":${foe.id},"o":`), "в отданном JSON нет записи скрытой фигуры");
}
// --- память разведки: клетки помнят город, но не фигуры
{
  const g = mk("m01", "2v2"), N = g.size, me = g.pieces.find((p) => p.owner === 0 && p.kind !== "king")!;
  const ec = g.ec.cities.find((c) => teamOf(g, c.owner) === 1)!; const keep = { x: me.x, y: me.y };
  me.x = ec.x; me.y = Math.max(0, ec.y - 1); if (!free(g, me.x, me.y)) me.y = Math.min(N - 1, ec.y + 1);
  const a = seen(g, 0); ok(a.out.g.ec.cities.some((c: any) => c.id === ec.id), "вражеский город в обзоре — виден");
  me.x = keep.x; me.y = keep.y; const b = seen(g, 0, [], a.sh), cc = b.out.g.ec.cities.find((c: any) => c.id === ec.id);
  ok(!!cc && !b.V[ec.y * N + ec.x], "ушли — город остался на разведанной клетке");
  ok(cc && cc.bhp === undefined && cc.forge === undefined, "у разведанного (не видимого) города детали скрыты");
  ok(!b.out.g.pieces.some((p: any) => teamOf(g, p.o) === 1 && cheb(p, ec) <= 1 && !b.V[p.y * N + p.x]), "фигур на разведанных клетках нет");
  ok(fromHex(b.sh, N * N).reduce((s, v) => s + v, 0) >= fromHex(a.sh, N * N).reduce((s, v) => s + v, 0), "память только растёт");
  const fresh = seen(g, 1); ok(!fresh.out.g.ec.cities.some((c: any) => c.id === g.ec.cities.find((x) => x.owner === 0)!.id) || fresh.V[g.ec.cities.find((x) => x.owner === 0)!.y * N + g.ec.cities.find((x) => x.owner === 0)!.x], "неразведанный чужой город не отдаётся");
  ok(b.out.g.ec.fnd == null || b.out.g.ec.fnd.every((f: any, s: number) => f == null || teamOf(g, s) === 0), "канал поселения соперников не уходит");
}

// --- повторы: сценарные партии 2×2 и «Все ×4» (только «конец хода» и простые ходы, без ИИ)
function script(md: ModeId, id: string, turns: number) {
  const g = mk(id, md), log: RLog = startLog("T" + md + ":1", g, C, g.map, undefined, false, true);
  for (let k = 0; k < turns * (g.np || 2); k++) { const s = g.cur, p = g.pieces.find((q) => q.owner === s && !q.acted && moveTargets(g, q, C).length);
    if (p) { const [x, y] = moveTargets(g, p, C)[0]; const r = apply(g, s, { a: "move", id: p.id, x, y } as any, C); if (r.ok) logAct(log, s, { a: "move", id: p.id, x, y } as any, false, g, g.cur !== s); }
    const r = apply(g, s, { a: "end" }, C); if (r.ok) logAct(log, s, { a: "end" }, false, g, true); }
  return { g, log };
}
for (const [md, id] of [["2v2", "m01"], ["ffa4", "m07"]] as [ModeId, string][]) {
  const m = showcaseMap(id); if (!m) { ok(false, "нет карты " + id); continue; }
  const { g, log } = script(md, id, 4);
  ok(log.races.length === MODES[md].seats && log.mode === md && log.fog === true, `${md}: лог хранит ${log.races.length} рас, режим и флаг тумана`);
  const r = rebuild(log, C); ok(r.diverged < 0 && hashG(r.g) === hashG(g), `${md}: повтор восстанавливает партию без расхождений`);
  const tm = turnMarks(log); ok(tm.length >= 4 * MODES[md].seats && new Set(tm.map((t) => t.side)).size === MODES[md].seats, `${md}: разметка ходов по всем ${MODES[md].seats} местам`);
  const fc = new FrameCache(log, C, 5), mid = Math.floor(log.acts.length / 2); ok(hashG(fc.at(mid).g) === hashG(rebuild(log, C, mid).g), `${md}: перемотка (FrameCache) = пересборка`);
  const fr = revealFrame(fc.at(log.acts.length).g, [], C); ok(fr.trees.length === MODES[md].seats && fr.check.length === MODES[md].seats && fr.g.pieces.length === g.pieces.length, `${md}: кадр после партии раскрыт для всех мест`);
  // список ходов в живой партии с туманом: свои и союзника — полностью, соперника — обезличены
  const al = { ally: same(g) }, ml = moveList(log, 0, true, log.acts.length, al);
  const enemyMv = ml.list.filter((x) => !same(g)(x.side, 0) && log.acts[x.i][1].a === "move"), allyMv = ml.list.filter((x) => same(g)(x.side, 0) && log.acts[x.i][1].a === "move");
  ok(enemyMv.length > 0 && enemyMv.every((x: any) => x.a.a === "hidden" && x.a.x === undefined && x.n === "…"), `${md}: ходы соперников в живой партии с туманом скрыты`);
  ok(allyMv.length > 0 && allyMv.every((x: any) => x.a.x !== undefined && x.n.startsWith("→")), `${md}: ходы своей команды видны`);
  ok(moveList(log, 0, false).list.every((x: any) => x.a.a !== "hidden"), `${md}: после партии — всё раскрыто`);
}

// --- D1: все места (до 8) в записи, библиотека находит партию у любого места (bun:sqlite вместо D1)
{
  const sq = new Database(":memory:"); for (const f of ["0031_strat_replays.sql", "0036_strat_replay_seats.sql"]) sq.exec(readFileSync(new URL("../migrations/" + f, import.meta.url), "utf8"));
  const db = { prepare: (q: string) => { const st = sq.prepare(q); let a: any[] = []; const o = { bind: (...x: any[]) => { a = x; return o; }, run: async () => st.run(...a), all: async () => ({ results: st.all(...a) }), first: async () => st.get(...a) }; return o; } };
  const { g, log } = script("ffa8" as ModeId, "m09", 1);
  const N = log.races.length, uids = Array.from({ length: N }, (_, i) => (i === 5 ? "bot" : "u" + i)), nicks = uids.map((u, i) => "Игрок" + i);
  ok(N === 8, "«Все ×8»: 8 мест в логе");
  const e = await putReplay(db, { log, status: "over", uids, nicks, teams: uids.map((_, i) => teamOf(g, i)), bots: uids.map((u) => u === "bot"), winner: 3, reason: "test", turns: g.turn, rated: false, mapId: "m09" }, C);
  ok(e === "", "запись повтора на 8 мест");
  const pl: any[] = sq.prepare("SELECT seat, user_id FROM strat_replay_players WHERE replay_id = ? ORDER BY seat").all(log.id);
  ok(pl.length === 7 && !pl.some((p) => p.seat === 5), "strat_replay_players: все люди (бот — нет)");
  const L7 = await libList(db, "u7", C), m7 = L7.recent[0];
  ok(L7.recent.length === 1 && m7.id === log.id, "библиотека находит партию у 8-го места");
  ok(m7.nicks.length === 8 && m7.nicks[7] === "Игрок7" && m7.races.length === 8 && m7.teams?.length === 8 && m7.mode === "ffa8", "meta: ники, расы, команды и режим всех 8 мест");
  const g4 = script("2v2", "m01", 1); const log4 = { ...g4.log, id: "T2:2" };
  await putReplay(db, { log: log4, status: "over", uids: ["a", "b", "c", "d"], nicks: ["A1", "B1", "A2", "B2"], teams: [0, 1, 0, 1], winner: 0, reason: "test", turns: 2, rated: false, mapId: "m01" }, C);
  const md = (await libList(db, "d", C)).recent[0]; ok(md?.id === "T2:2" && JSON.stringify(md.teams) === "[0,1,0,1]" && md.nicks.join() === "A1,B1,A2,B2", "2×2: 4-е место видит партию, команды [A,B,A,B]");
  sq.prepare("INSERT INTO strat_replays (id, status, log, nick0, nick1, race0, race1, ended_at) VALUES ('old:1','over','{}','X','Y','fire','ice',1)").run();
  const mo = (await (async () => { sq.prepare("UPDATE strat_replays SET p0 = 'x' WHERE id = 'old:1'").run(); return libList(db, "x", { ...C, econ: { ...C.econ, replay: { keepDays: 1e9 } } } as any); })()).recent.find((r: any) => r.id === "old:1");
  ok(mo && mo.nicks.join() === "X,Y" && mo.teams === undefined, "старые записи (без seats) читаются как раньше");
  await pruneReplays(db, C, Date.now() + 1e12);
  ok((sq.prepare("SELECT COUNT(*) AS n FROM strat_replay_players").get() as any).n === 0, "очистка удаляет и строки мест");
}
console.log(`\n${n - fails}/${n} PASS`); if (fails) process.exit(1);
