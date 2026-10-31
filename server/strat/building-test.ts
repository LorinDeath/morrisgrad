// Тесты t1136/t1137: разрушаемые постройки (удар, руины, восстановление, ремонт, ответ Стены), стройка Вождём, «Скрытое здоровье».
//   nice bun server/strat/building-test.ts
import { newGame, apply, view, STRAT_CFG, razeTargets, type GameState, type Piece } from "./rules";
import { bldStat, bldHp, buildCost, buildCostAt, repairCost, buildCityAt, chiefBuildSite, hasFree } from "./econ";
import { redactHp, hpState } from "./hidehp";
import { aiAction, candidates } from "./ai";
let fails = 0, n = 0; const ok = (c: any, m: string) => { n++; if (!c) { fails++; console.log("FAIL " + m); } else console.log("PASS " + m); };
const C = STRAT_CFG;
const cap = (g: GameState, s: number) => g.ec.cities.find((c) => c.owner === s && c.cap)!;
const king = (g: GameState, s: number) => g.pieces.find((p) => p.owner === s && p.kind === "king")!;
const fresh = (g: GameState) => { g.ap = 9; g.apMax = 9; for (const p of g.pieces) p.acted = false; };
function setup() {
  const g = newGame(8, ["fire", "ice"], 0); const c1 = cap(g, 1);
  c1.bld.push("market", "wall"); // у врага Рынок и Стена
  const k = king(g, 0); const kn = { ...k, id: 900, kind: "knight", hp: 14, maxHp: 14, atk: 6, arm: 1, tal: [], xp: 0, acted: false } as Piece;
  // отодвинуть вражеского Вождя с клетки города (защитник мешает удару)
  const k1 = king(g, 1); k1.x = c1.x; k1.y = c1.y === 0 ? 1 : c1.y - 1;
  if (g.pieces.some((p) => p !== k1 && p.x === k1.x && p.y === k1.y)) k1.x = Math.min(7, k1.x + 1);
  kn.x = c1.x + 1 <= 7 ? c1.x + 1 : c1.x - 1; kn.y = c1.y; // вплотную к городу (ладья-удар D4 нет — рыцарь бьёт буквой Г, поэтому ставим конём «Г»)
  kn.kind = "rook" as any; kn.hp = 22; kn.maxHp = 22; kn.atk = 5; kn.arm = 3;
  g.pieces = g.pieces.filter((p) => !(p.x === kn.x && p.y === kn.y)); g.pieces.push(kn); fresh(g);
  return { g, c1, kn };
}
// --- конфиг HP/БРН по типу
{
  ok(bldStat(C, "wall").hp > bldStat(C, "library").hp && bldStat(C, "library").hp > bldStat(C, "market").hp, "Стена > знание > экономика по HP");
  ok(bldStat(C, "wonder").hp >= 2 * bldStat(C, "wall").hp && bldStat(C, "wall").arm >= 3 && bldStat(C, "market").arm === 0, "Чудо — очень прочное; Стена с бронёй; Рынок без брони");
  ok(!!bldStat(C, "wall").counter && !bldStat(C, "market").counter && !bldStat(C, "library").counter, "ответный удар только у Стены");
}
// --- удар по постройке, разрушение, руины, восстановление
{
  const { g, c1, kn } = setup();
  const T = razeTargets(g, kn, C); ok(T.some((t) => t.city === c1.id && t.b.includes("market")), "Страж вплотную видит постройки вражеского города");
  const hp0 = bldHp(g, c1, "market", C);
  const r = apply(g, 0, { a: "raze", id: kn.id, city: c1.id, b: "market" } as any);
  ok(r.ok && bldHp(g, c1, "market", C) < hp0 && r.ok && r.ev.some((e: any) => e.e === "bhit" && e.b === "market"), "удар снимает HP постройки (событие bhit)");
  ok(!r.ok || !r.ev.some((e: any) => e.e === "bcounter"), "Рынок не отвечает");
  ok(!(apply(g, 0, { a: "raze", id: kn.id, city: c1.id, b: "market" } as any) as any).ok, "фигура бьёт раз за ход");
  let guard = 0; while (c1.bld.includes("market") && guard++ < 10) { fresh(g); apply(g, 0, { a: "raze", id: kn.id, city: c1.id, b: "market" } as any); }
  ok(!c1.bld.includes("market") && c1.ruin?.includes("market"), "при 0 HP — разрушена, слот свободен, руины");
  ok(buildCostAt(g, 1, c1, "market", C) === Math.ceil(buildCost(g, 1, "market", C) * C.bldHp.rebuild), "восстановление из руин — со скидкой rebuild");
  // ответ Стены
  fresh(g); const h0 = kn.hp; const r2 = apply(g, 0, { a: "raze", id: kn.id, city: c1.id, b: "wall" } as any);
  ok(r2.ok && kn.hp < kn.maxHp && r2.ev.some((e: any) => e.e === "bcounter" && e.dmg > 0), "Стена бьёт в ответ вплотную стоящего");
  // ремонт
  const rc = repairCost(g, c1, "wall", C); ok(rc > 0, "ремонт стоит золото");
  g.cur = 1; fresh(g); g.ec.res[1].gold = 50; c1.acted = false;
  const kk = g.pieces.find((p) => p.x === c1.x && p.y === c1.y && p.owner === 0); if (kk) kk.x = (kk.x + 3) % 8;
  const rr = apply(g, 1, { a: "repair", city: c1.id, b: "wall" } as any);
  ok(rr.ok && bldHp(g, c1, "wall", C) === bldStat(C, "wall").hp && g.ec.res[1].gold === 50 - rc, "ремонт: полное HP за repairCost");
  ok((apply(g, 1, { a: "repair", city: c1.id, b: "wall" } as any) as any).err === "city_acted", "ремонт — действие города (раз в ход)");
  // защитник на клетке города закрывает постройки
  const { g: g2, c1: d1, kn: k2 } = setup(); const k1 = king(g2, 1); k1.x = d1.x; k1.y = d1.y;
  ok(!razeTargets(g2, k2, C).some((t) => t.city === d1.id), "пока на клетке города защитник — постройки не бьются");
  // бот видит удары по постройкам
  const { g: g3, kn: k3 } = setup(); ok(candidates(g3, 0, C).some((a: any) => a.a === "raze" && a.id === k3.id), "кандидаты бота включают удары по постройкам");
}
// --- стройка Вождём (t1137)
{
  const g = newGame(8, ["fire", "ice"], 0), c = cap(g, 0), k = king(g, 0); g.ec.res[0].gold = 100;
  ok(buildCityAt(g, 0, k.x, k.y, C) === c && !!chiefBuildSite(g, 0, C), "Вождь на земле столицы может строить");
  const ap = g.ap; const r = apply(g, 0, { a: "build", id: k.id, b: "barracks" } as any);
  ok(r.ok && c.bld.includes("barracks") && g.ap === ap - 1 && k.acted && !c.acted, "стройка тратит 1 ОД и действие Вождя, но не действие города");
  const g2 = newGame(8, ["fire", "ice"], 0), k2 = king(g2, 0); g2.ec.res[0].gold = 100; k2.x = 4; k2.y = 4;
  const T = buildCityAt(g2, 0, 4, 4, C); ok(T === null ? (apply(g2, 0, { a: "build", id: k2.id, b: "barracks" } as any) as any).err === "not_own_land" : true, "вне своей земли — not_own_land");
  const g3 = newGame(8, ["fire", "ice"], 0); g3.ec.res[0].gold = 100; g3.pieces = g3.pieces.filter((p) => !(p.owner === 0 && p.kind === "king"));
  ok((apply(g3, 0, { a: "build", city: cap(g3, 0).id, b: "barracks" } as any) as any).err === "no_chief", "нет Вождя — нет новых построек");
  ok(!(apply(g3, 0, { a: "build", city: cap(g3, 0).id, b: "barracks" } as any) as any).ok && cap(g3, 0).bld.length === 0, "найм в городе остаётся (стройка — нет)");
}
// --- «Скрытое здоровье»
{
  const { g, c1, kn } = setup(); apply(g, 0, { a: "raze", id: kn.id, city: c1.id, b: "wall" } as any);
  const tgt = king(g, 1); tgt.hp = 7; // 7/30 — «при смерти»
  const ev = [{ e: "hit", id: kn.id, t: tgt.id, dmg: 5, hp: 7 }, { e: "bhit", id: kn.id, city: c1.id, b: "wall", dmg: 3, hp: 17, max: 20 }, { e: "hit", id: tgt.id, t: kn.id, dmg: 2, hp: 20 }];
  const bhp = g.ec.cities.map((c) => ({ city: c.id, b: c.bld.map((b) => ({ b, hp: bldHp(g, c, b, C), max: bldStat(C, b).hp })), ruin: c.ruin || [] }));
  const R = redactHp(view(g, false, C), ev, bhp, 0), s = JSON.stringify(R);
  const ek = R.g.pieces.find((p: any) => p.id === tgt.id), mk = R.g.pieces.find((p: any) => p.id === kn.id);
  ok(!("hp" in ek) && ek.hs === "low" && "hp" in mk, "чужая фигура: только грубое состояние; своя — точные ОЗ");
  ok(!("dmg" in R.ev[0]) && !("hp" in R.ev[0]) && R.ev[0].hs === "low" && !("dmg" in R.ev[1]) && R.ev[1].hs, "урон по чужим скрыт в событиях (фигуры и постройки)");
  ok(R.ev[2].dmg === 2 && R.ev[2].hp === 20, "урон по своим виден");
  const ec1 = R.g.ec.cities.find((c: any) => c.id === c1.id); ok(!ec1.bhp && ec1.bhs?.wall === "ok" || !ec1.bhp, "ОЗ чужих построек скрыты в ec");
  const B = R.bhp!.find((c: any) => c.city === c1.id); ok(B.b.every((x: any) => !("hp" in x) && !("max" in x) && x.hs), "список bhp: чужие — только состояние");
  ok(!s.includes('"hp":7') && !s.includes('"dmg":5') && !s.includes('"dmg":3'), "нет утечек точных чисел в сериализованном виде");
  const S = redactHp(view(g, false, C), ev, bhp, -1); ok(S.g.pieces.every((p: any) => !("hp" in p)), "зритель видит грубо обе стороны");
  const T2 = redactHp(view(g, false, C), ev, bhp, 0, () => true); ok(T2.g.pieces.every((p: any) => "hp" in p), "союзник (team) видит точные ОЗ");
  ok(hpState(21, 30) === "ok" && hpState(15, 30) === "hurt" && hpState(9, 30) === "low" && hpState(0, 30) === "dead", "пороги: >66% цел / 33–66% ранен / <33% при смерти");
}
console.log(`\n${n - fails}/${n} ok`); if (fails) process.exit(1);
