// t1225: ульты через сетевой путь (parseAct → hiddenTarget → apply, как StratMatch.doAct): все 6 ульт Вождей и все ульты фигур × 6 рас.
//   nice bun server/strat/ult-net-test.ts
import { readFileSync } from "node:fs";
import { newGame, apply, STRAT_CFG, RACES, ultOf, type GameState, type Piece, type Race, type Kind } from "./rules";
import { parseAct } from "./parse-act";
import { hiddenTarget } from "./tree-view";
import { startLog, logAct, rebuild, hashG } from "./replay";
import { pieceLevel } from "./econ";
const C: any = STRAT_CFG; let n = 0, fails = 0;
const ok = (c: any, m: string) => { n++; if (!c) { fails++; console.log("FAIL " + m); } };
const ULT_OF = C.ults && (Object.fromEntries(Object.entries({ fire: "doom", lightning: "blink", stone: "dome", ice: "blizzard", water: "tide", nature: "grove" }))) as Record<string, string>;
type St = { ult: string[][]; ck: number[] };
/** как StratMatch.doAct: разбор → скрытые узлы → apply → статистика; log — повтор */
function net(g: GameState, side: 0 | 1, raw: any, st: St, log: any) {
  const act = parseAct(JSON.parse(JSON.stringify(raw))); if (!act) return { err: "bad_action" } as any;
  const hid = hiddenTarget(g, side, act, C); if (hid) return { err: hid };
  const kingId = g.pieces.find((p) => p.owner === side && p.kind === "king")?.id, cur = g.cur;
  const r = apply(g, side, act, C); if (!r.ok) return { err: r.err };
  for (const e of r.ev as any[]) { if (e.e === "kill" && kingId && e.by === kingId) st.ck[side]++; if (e.e === "ult") st.ult[e.side].push(String(e.ult)); }
  logAct(log, side, act, false, g, g.cur !== cur); return { ev: r.ev as any[] };
}
let nid = 1000;
function put(g: GameState, o: 0 | 1, k: Kind, x: number, y: number, hp?: number): Piece {
  const u = C.units[k], h = hp ?? u.hp; const p: Piece = { id: nid++, owner: o, kind: k, x, y, hp: h, maxHp: Math.max(h, u.hp), atk: u.atk, arm: u.arm, acted: false, burn: 0, chill: 0, xp: 0, tal: [] } as any;
  g.pieces.push(p); return p;
}
/** доска 15×15: только Вожди; свой Вождь (7,7), вражеский — (x,y) */
function setup(race: Race, foe: Race, kx = 0, ky = 0) {
  const g = newGame(15, [race, foe], 0, C, 40); g.pieces = g.pieces.filter((p) => p.kind === "king");
  const k = g.pieces.find((p) => p.owner === 0)!, e = g.pieces.find((p) => p.owner === 1)!; k.x = 7; k.y = 7; e.x = kx; e.y = ky;
  g.cur = 0; g.ap = 10; (g as any).nextId = 5000; return { g, k, e };
}
const lv5 = (k: Piece) => { const L: number[] = C.chief.lv; k.xp = L[4]; k.tal = ["aura", "rally", "command", "ult"]; };
const cell = (cs: any[], x: number, y: number) => cs.some((c) => c[0] === x && c[1] === y);

// ---------- 1. разбор действия
ok(JSON.stringify(parseAct({ a: "ult", id: 3, x: 4, y: 5 })) === JSON.stringify({ a: "ult", id: 3, x: 4, y: 5 }), "parseAct пропускает { a: ult }");
ok(!parseAct({ a: "ult", id: 3, x: -1, y: 5 }) && !parseAct({ a: "ult", id: "3", x: 1, y: 5 }) && !parseAct({ a: "ult", id: 3, x: 1.5, y: 5 }), "parseAct отсекает мусор в ульте");
ok(!!parseAct({ a: "ability", id: 3, ab: "bolt", x: 1, y: 1 }), "parseAct пропускает умение фигуры");

// ---------- 2. ульты Вождей × 6 рас
const table: string[] = [];
for (const race of RACES as Race[]) {
  const foe = (race === "fire" ? "ice" : "fire") as Race, id = ULT_OF[race], U = C.ults[id];
  const { g, k, e } = setup(race, foe, 0, 0); const st: St = { ult: [[], []], ck: [0, 0] };
  // без таланта ульты нет
  k.xp = C.chief.lv[4]; k.tal = ["aura", "rally", "command", "banner"];
  const log0 = startLog("T", g, C, null);
  ok(net(g, 0, { a: "ult", id: k.id, x: 7, y: 5 }, st, log0).err === "no_ult", `${race}: ур.5 без узла ульты → no_ult`);
  lv5(k); ok(pieceLevel(k, C) >= 5 && ultOf(g, k, C)?.id === id, `${race}: ульта ${id} после выбора узла`);
  // цели
  const pw = put(g, 1, "pawn", 7, 4, 3); // слабая — умрёт
  const tank = put(g, 1, "rook", 7, 3, 30);
  e.x = 8; e.y = 4; e.hp = 3; // вражеский Вождь: должен остаться с 1 HP
  const ally = put(g, 0, "pawn", 7, 6, 2); ally.maxHp = 10;
  let tx = 7, ty = 4;
  if (U.shape === "chain") { tx = 7; ty = 4; }
  if (U.shape === "line") { // волна вверх от (7,7): клетки (6..8, 6..2); союзник (7,6) — лечение; враг (7,5) — урон + отброс
    pw.y = 5; tank.x = 6; tank.y = 5; e.x = 8; e.y = 4; tx = 7; ty = 6; }
  if (U.shape === "square" && (U.size || 3) === 3) { tx = 7; ty = 5; } // купол 3×3 вокруг (7,5): (7,6) свой, (7,4) враг
  // ошибки
  const snap = structuredClone(g), log = startLog("T", g, C, null);
  if (U.shape === "chain") { ok(net(g, 0, { a: "ult", id: k.id, x: 3, y: 3 }, st, log).err === "bad_target", `${race}: рывок в пустую клетку → bad_target`);
    ok(net(g, 0, { a: "ult", id: k.id, x: ally.x, y: ally.y }, st, log).err === "bad_target", `${race}: рывок в своего → bad_target`); }
  else if (U.shape === "line") ok(net(g, 0, { a: "ult", id: k.id, x: 7, y: 7 }, st, log).err === "bad_cell", `${race}: волна в себя → bad_cell`);
  else ok(net(g, 0, { a: "ult", id: k.id, x: 7, y: 7 - U.range - 1 }, st, log).err === "out_of_range", `${race}: дальше радиуса ${U.range} → out_of_range`);
  g.ap = U.ap - 1; ok(net(g, 0, { a: "ult", id: k.id, x: tx, y: ty }, st, log).err === "no_ap", `${race}: мало ОД → no_ap`); g.ap = 10;
  const xp0 = k.xp || 0, gl0 = g.ec!.res[0].glory, kills0 = g.ec!.kills[0], ap0 = g.ap, ehp0 = e.hp, thp0 = tank.hp, k0 = { x: k.x, y: k.y };
  const r = net(g, 0, { a: "ult", id: k.id, x: tx, y: ty }, st, log);
  ok(!r.err, `${race}: ульта проходит сетевой путь (${r.err || "ok"})`);
  if (r.err) { table.push(`${race}\t${id}\tFAIL ${r.err}`); continue; }
  const ev = r.ev, U0 = ev.find((x: any) => x.e === "ult");
  ok(U0 && U0.ult === id && U0.side === 0 && U0.name === U.name, `${race}: событие ult с ключом и названием`);
  ok(g.ap === ap0 - U.ap, `${race}: списано ${U.ap} ОД (было ${ap0}, стало ${g.ap})`);
  ok(k.cds?.ult === U.cd, `${race}: перезарядка ${U.cd} (есть ${k.cds?.ult})`);
  ok(st.ult[0].join() === id, `${race}: статистика L.st.ult`);
  const hits = ev.filter((x: any) => x.e === "hit" && x.ult);
  const dmg = U.dmg || 0;
  if (dmg) {
    ok(!g.pieces.includes(pw) && ev.some((x: any) => x.e === "kill" && x.id === pw.id && x.by === k.id), `${race}: ульта добивает фигуру, убийство за Вождём`);
    ok((k.xp || 0) > xp0 && g.ec!.kills[0] === kills0 + 1 && g.ec!.res[0].glory > gl0 && st.ck[0] === 1, `${race}: опыт Вождю, счётчик убийств, Слава, статистика ck`);
    ok(hits.every((h: any) => h.why?.via === "ult" && h.why.atk.reduce((s: number, a: any) => s + a.n, 0) === dmg), `${race}: разбор удара ульты сходится (${dmg})`);
    const eh = hits.find((h: any) => h.t === e.id);
    if (eh) ok(e.hp === Math.max(1, ehp0 - eh.why.raw) && e.hp >= 1 && g.pieces.includes(e) && (ehp0 - eh.why.raw >= 1 || eh.why.spare) && eh.why.chiefMul === U.chiefMul && eh.why.raw === Math.max(1, Math.round(dmg * U.chiefMul)), `${race}: Вождь врага не ниже 1 HP, ×${U.chiefMul}`);
    else ok(e.hp === ehp0, `${race}: Вождь вне области не задет`);
    ok(!g.ec!.goals[0].includes("chief"), `${race}: цель «Вождь» ультой не берётся (Вождь жив)`);
  } else ok(!hits.length, `${race}: ульта без урона`);
  if (U.shape === "chain") { const hit = hits.map((h: any) => h.t);
    ok(hit[0] === pw.id && hit.length === Math.min(U.hops, 3), `${race}: рывок бьёт ${U.hops} целей (${hit.length})`);
    ok(Math.max(Math.abs(k.x - k0.x), Math.abs(k.y - k0.y)) > 0 && ev.some((x: any) => x.e === "move" && x.id === k.id && x.blink), `${race}: Вождь перескочил к последней цели`); }
  if (U.burnCells) ok((g.ec as any).fire?.some((f: any) => f.x === tx && f.y === ty && f.t === U.burnCells && f.s === 0), `${race}: земля горит ${U.burnCells} х.`);
  if (U.shield) ok((ally as any).sh === U.shield && (ally as any).sht === U.shieldTurns && !(e as any).sh, `${race}: щит ${U.shield} своим на ${U.shieldTurns} х., врагу — нет`);
  if (U.chill) ok(tank.chill >= U.chill && tank.hp === thp0 - dmg, `${race}: замедление ${U.chill} и урон`);
  if (U.root) ok((tank as any).root === U.root, `${race}: корни ${U.root} х.`);
  if (U.spawn) ok(g.pieces.filter((p) => p.owner === 0 && (p as any).treant).length === U.spawn, `${race}: выросло ${U.spawn} Древня`);
  if (U.heal) ok(ally.hp === Math.min(10, 2 + U.heal), `${race}: волна лечит своих на ${U.heal}`);
  if (U.push) ok(tank.y === 4 || ev.some((x: any) => x.e === "move" && x.push), `${race}: волна отбрасывает`);
  // повтор: тот же итог из лога
  const rb = rebuild(log, C, log.acts.length, { g: snap, i: 0 });
  ok(rb.diverged < 0 && hashG(rb.g) === hashG(g), `${race}: повтор воспроизводит ульту один в один`);
  // перезарядка
  k.acted = false; ok(net(g, 0, { a: "ult", id: k.id, x: tx, y: ty }, st, log).err === "cooldown", `${race}: повторно сразу → cooldown`);
  const cd0 = k.cds!.ult; net(g, 0, { a: "end" }, st, log); net(g, 1, { a: "end" }, st, log);
  ok(k.cds!.ult === cd0 - 1, `${race}: перезарядка убывает за ход (${cd0} → ${k.cds!.ult})`);
  table.push(`${race}\t${id}\tok`);
}

// ---------- 3. ульты фигур (ур. 5) × 5 ролей × 6 рас
for (const race of RACES as Race[]) for (const kind of ["pawn", "knight", "mage", "rook", "hero"] as Kind[]) {
  const { g } = setup(race, race === "fire" ? "ice" : "fire", 0, 0); const st: St = { ult: [[], []], ck: [0, 0] };
  const p = put(g, 0, kind, 7, 9); const uid = C.unitTree[kind].ult, U = C.unitUlts[uid];
  ok(net(g, 0, { a: "ult", id: p.id, x: 7, y: 8 }, st, startLog("T", g, C, null)).err === "no_ult", `${race}/${kind}: до ур.5 → no_ult`);
  p.xp = C.econ.xp.lv[5];
  const foe = put(g, 1, "rook", 7, 8, 30), mate = put(g, 0, "pawn", 6, 9, 5);
  const tgt = U.shape === "chain" ? [7, 8] : U.shape === "line" ? [7, 8] : U.range >= 2 ? [7, 8] : [7, 8];
  const snap = structuredClone(g), log = startLog("T", g, C, null), ap0 = g.ap, hp0 = foe.hp, p0 = { x: p.x, y: p.y };
  const r = net(g, 0, { a: "ult", id: p.id, x: tgt[0], y: tgt[1] }, st, log);
  ok(!r.err, `${race}/${kind}: ульта ${uid} проходит (${r.err || "ok"})`); if (r.err) continue;
  const E = r.ev.find((x: any) => x.e === "ult"), nm = C.unitRaceNames?.[race]?.[uid] || U.name;
  ok(E?.ult === uid && E.name === nm, `${race}/${kind}: событие с расовым названием «${nm}»`);
  ok(g.ap === ap0 - U.ap && p.cds?.ult === U.cd && p.acted, `${race}/${kind}: ${U.ap} ОД, перезарядка ${U.cd}`);
  if (U.dmg) ok(foe.hp === hp0 - U.dmg, `${race}/${kind}: урон ${U.dmg} (${hp0}→${foe.hp})`);
  if (U.shield) ok((mate as any).sh === U.shield || (p as any).sh === U.shield, `${race}/${kind}: щит ${U.shield}`);
  if (U.chill) ok(foe.chill >= U.chill, `${race}/${kind}: замедление`);
  if (U.shape === "chain" && (U.hop ?? 3) === 0) ok(p.x === p0.x && p.y === p0.y, `${race}/${kind}: «Подвиг» бьёт с места, без перескока`);
  ok(st.ult[0].join() === uid, `${race}/${kind}: статистика ульт`);
  const rb = rebuild(log, C, log.acts.length, { g: snap, i: 0 }); ok(rb.diverged < 0 && hashG(rb.g) === hashG(g), `${race}/${kind}: повтор совпадает`);
}

// ---------- 4. коды ошибок есть в клиенте по-русски
const src = readFileSync(new URL("../../src/scripts/strat/client.ts", import.meta.url), "utf8") + readFileSync(new URL("../../src/scripts/strat/econ-ui.ts", import.meta.url), "utf8");
for (const k of ["no_ult", "bad_target", "out_of_range", "bad_cell", "cooldown", "use_ult", "no_ability", "no_ap", "already_acted", "bad_piece", "bad_action"])
  ok(new RegExp(`\\b${k}: "[А-ЯЁа-яё]`).test(src), `ERR клиента: ${k}`);

console.log(table.join("\n"));
console.log(`ult-net-test: ${n - fails} ok, ${fails} fail`); if (fails) process.exit(1);
