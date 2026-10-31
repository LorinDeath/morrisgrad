// t1221: прокачка — после выбора навыка ожидание снимается; Вождь получает карты дерева вождя (не talents.king);
// фигуры видят ур. 3; псевдоним {a:"skill"} понимается сервером; hasFree учитывает ждущий навык Вождя.
import { readFileSync } from "node:fs";
import { parseAct } from "./parse-act";
import { newGame, apply, STRAT_CFG as C } from "./rules";
import { gainXp, pieceLevel, pendingTalent, talentOpts, chiefChoices, unitChoices, hasFree } from "./econ";
let fails = 0; const ok = (c: any, m: string) => { if (!c) { fails++; console.log("FAIL", m); } else console.log("ok  ", m); };
const toLv = (g: any, p: any, lv: number) => { let k = 0; while (pieceLevel(p, C) < lv && k++ < 10000) gainXp(g, p, 1, [], C); };

{ // Вождь: ур. 2 → карты дерева вождя, выбор снимает ожидание
  const g: any = newGame(8, ["fire", "ice"], 0); const k = g.pieces.find((p: any) => p.owner === 0 && p.kind === "king");
  toLv(g, k, 2); ok(pieceLevel(k, C) === 2, "Вождь дошёл до ур. 2");
  ok(pendingTalent(k, C, g) === 2, "Вождь ждёт навык ур. 2");
  const T = talentOpts(g, k, C)!; const cc = chiefChoices(g, k, C);
  ok(T && T.lv === 2 && T.o.length === cc.length && T.o.every((o, i) => o.id === cc[i].id), "talentOpts = chiefChoices");
  const bad = ((C as any).talents.king?.[0] || []).map((x: any) => x.id).filter((id: string) => !cc.some((n) => n.id === id));
  for (const id of bad) ok(!apply(g, 0, { a: "talent", id: k.id, t: id } as any, C).ok, `Вождю нельзя «${id}» из talents.king`);
  g.cur = 0; g.ap = Math.max(g.ap, 1); g.pieces.filter((p: any) => p.owner === 0 && p !== k).forEach((p: any) => (p.acted = true)); k.acted = true;
  ok(hasFree(g, 0, C), "hasFree: ждущий навык Вождя — ход не «пустой»");
  const r = apply(g, 0, { a: "talent", id: k.id, t: cc[0].id } as any, C);
  ok(r.ok, "выбор узла дерева принят"); ok(pendingTalent(k, C, g) === 0 && talentOpts(g, k, C) === null, "после выбора ожидание снято");
  ok(!apply(g, 0, { a: "talent", id: k.id, t: cc[0].id } as any, C).ok, "повторный выбор без очка — отказ");
  toLv(g, k, 3); ok(pendingTalent(k, C, g) === 3 && (talentOpts(g, k, C)?.o.length || 0) > 0, "Вождь ур. 3: снова ждёт навык");
}
{ // фигура: ур. 2 пассивка, ур. 3 умение
  const g: any = newGame(8, ["fire", "ice"], 0); const p = g.pieces.find((q: any) => q.owner === 0 && q.kind === "pawn");
  toLv(g, p, 3); ok(pendingTalent(p, C, g) === 2, "фигура ур. 3 без талантов ждёт ур. 2");
  ok(apply(g, 0, { a: "talent", id: p.id, t: unitChoices(p, 2, C)[0].id } as any, C).ok, "пассивка ур. 2 принята");
  const T = talentOpts(g, p, C); ok(T?.lv === 3 && T.o.length === unitChoices(p, 3, C).length, "после — ждёт умение ур. 3 (видно клиенту)");
  ok(apply(g, 0, { a: "talent", id: p.id, t: T!.o[0].id } as any, C).ok && pendingTalent(p, C, g) === 0, "умение ур. 3 принято, ожидание снято");
}
{ // протокол: сервер понимает {a:"skill"} и отдаёт pend/опции только своих фигур
  const src = readFileSync(new URL("./match.ts", import.meta.url), "utf8");
  const pa: any = parseAct({ a: "skill", id: 3, s: "grit" }); ok(pa?.a === "talent" && pa.id === 3 && pa.t === "grit", "parseAct: {a:\"skill\"} → talent");
  ok(/pdv\s*=\s*1/.test(src) && /talentOpts\(/.test(src), "match.ts: stateFor отдаёт pend/po своих фигур");
  const cl = readFileSync(new URL("../../src/scripts/strat/client.ts", import.meta.url), "utf8");
  ok(!/send\(\{\s*a:\s*"skill"/.test(cl), "клиент больше не шлёт {a:\"skill\"}");
}
console.log(fails ? `FAILS: ${fails}` : "lvl-test: all ok"); process.exit(fails ? 1 : 0);
