// t1207: детерминированный расчёт кривой опыта по лигам (без партий с ботом): сколько ходов до ур. 2/3/4 у Вождя и у фигуры.
// Модели: «пассив» — Вождь весь ход стоит на своём городе (hold + survive), без боя; «обычно» — пассив + удар раз в 2 хода + убийство раз в 6 ходов.
// Фигура: «обычно» — удар раз в 2 хода + убийство раз в 6 ходов (пассивного опыта у фигур нет).
import { newGame } from "./rules";
import { gainXp, pieceLevel, lg } from "./econ";
import { STRAT_CFG as C } from "./rules";
import { GOALS } from "./content-cfg";
let fails = 0; const ok = (c: any, m: string) => { if (!c) { fails++; console.log("FAIL", m); } };
const CH: any = (C as any).chief, CX = CH.xp, PX: any = C.econ.xp;
function turnsTo(size: number, king: boolean, mode: "passive" | "typical", maxT = 400): number[] {
  const g = newGame(size, ["fire", "ice"], 0) as any; const p = g.pieces.find((x: any) => x.owner === 0 && x.kind === (king ? "king" : "pawn"));
  p.xp = 0; (p as any).xpf = 0; const out: number[] = []; const ev: any[] = [];
  for (let t = 1; t <= maxT && out.length < 3; t++) {
    if (king) { if (t % CX.surviveEvery === 0) gainXp(g, p, CX.survive, ev, C); if (t % (CX.holdEvery || 1) === 0) gainXp(g, p, CX.hold, ev, C); }
    if (mode === "typical") { if (t % 6 === 0) gainXp(g, p, king ? CX.kill : PX.kill, ev, C); else if (t % 2 === 0) gainXp(g, p, king ? CX.hit : PX.hit, ev, C); }
    const lv = pieceLevel(p, C); while (out.length < lv - 1) out.push(t);
  }
  while (out.length < 3) out.push(Infinity); return out;
}
const rows: string[] = [];
for (const [lname, size] of [["quick", 8], ["normal", 15], ["tactical", 35]] as const) {
  const g = newGame(size, ["fire", "ice"], 0) as any; const m = lg(g, C)?.xp ?? 1;
  const kp = turnsTo(size, true, "passive"), kt = turnsTo(size, true, "typical"), pt = turnsTo(size, false, "typical");
  rows.push(`${lname} ${size}×${size} xp×${m}: Вождь обычно ур.2/3/4 на ходу ${kt.join("/")}; Вождь пассив ${kp.join("/")}; фигура обычно ${pt.join("/")}`);
  const target = { quick: 3, normal: 10, tactical: 30 }[lname];
  ok(Math.abs(kt[0] - target) <= Math.max(1, target * 0.25), `${lname}: первый уровень Вождя ≈ ${target} ходов (получили ${kt[0]})`);
  ok(kp[0] > kt[0], `${lname}: пассив медленнее обычной игры`);
  ok(kt[1] - kt[0] >= kt[0], `${lname}: ур.3 дольше, чем ур.2`);
  ok(kt[2] - kt[1] > kt[1] - kt[0], `${lname}: ур.4 ещё дольше`);
  ok(pt[0] >= kt[0], `${lname}: фигура не быстрее Вождя`);
}
// цели (t1207)
const S: any = GOALS.sizes;
ok(S[8].gold === 150 && S[15].gold === 1000 && S[35].gold === 5000, "Казна 150/1000/5000");
ok(S[8].share === 0.56 && S[15].share === 0.33 && S[35].share === 0.33, "Держава без изменений, 35 = 0.33");
ok(S[8].wonderGold === 18 && S[8].wonderKnow === 6 && S[15].wonderGold === 40 && S[15].wonderKnow === 15 && S[35].wonderGold === 90 && S[35].wonderKnow === 35, "Чудо 18/6, 40/15, 90/35");
ok(S[8].holdK === 4 && S[8].holdTurns === 5 && S[15].holdK === 8 && S[15].holdTurns === 10 && S[35].holdK === 14 && S[35].holdTurns === 20, "t1208: Твердыня 4/5, 8/10, 14/20");
ok([8, 15, 35].every((n) => S[n].need === 6 && S[n].list.length === 6 && S[n].list.includes("glory")), "t1211: победа — все 6 целей (Слава — 6-я)");
ok(C.econ.sizes[8].glory === 190 && C.econ.sizes[15].glory === 375 && C.econ.sizes[35].glory === 750, "Слава 190/375/750");
console.log(rows.join("\n")); console.log(fails ? `xp-test: FAIL ${fails}` : "xp-test: OK"); if (fails) process.exit(1);
