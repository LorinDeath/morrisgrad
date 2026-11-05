// t1221: переход в новую эпоху засчитывает технологии текущей эпохи с поправкой лиги и изученные в ней (ec.tre)
import { newGame, apply, STRAT_CFG as C } from "./rules";
import { canEra, eraTechs, techEra, canResearch, eraCostOf, rCost } from "./econ";
import { view } from "./rules";
import { parseAct } from "./parse-act";
import { hiddenTarget } from "./tree-view";
import { TECHS } from "./econ-cfg";
let fails = 0; const ok = (c: any, m: string) => { if (!c) { fails++; console.log("FAIL", m); } else console.log("ok  ", m); };
for (const size of [8, 15, 35]) {
  const g: any = newGame(size, ["fire", "ice"], 0); if (!g.ec || g.ec.era[0] < 1) continue;
  g.ec.res[0].know = 99999;
  const pick = () => (TECHS as any[]).find((t) => !g.ec.techs[0].includes(t.id) && !canResearch(g, 0, t, C));
  let n = 0;
  for (let i = 0; i < C.econ.research.need; i++) { g.cur = 0; g.ec.rs[0] = 0; g.ap = Math.max(g.ap, 1); const t = pick(); if (!t) break;
    const r = apply(g, 0, { a: "research", t: t.id } as any, C); ok(r.ok, `${size}: изучено «${t.id}» (эпоха ${techEra(g, t, C)}, база ${t.era})`); if (r.ok) n++; }
  ok(eraTechs(g, 0, C) === n, `${size}: засчитано ${eraTechs(g, 0, C)} из ${n}`);
  ok(n === C.econ.research.need && canEra(g, 0, C) !== "need_techs", `${size}: после ${n} технологий эпоха не требует ещё технологий`);
  ok(g.ec.tre?.[0] && Object.values(g.ec.tre[0]).every((e) => e === 1), `${size}: ec.tre хранит эпоху изучения`);
}
{ // лига сдвигает эпоху узла: grove в normal → эпоха 4 по базе нет, засчитывается по techEra
  const g: any = newGame(15, ["fire", "ice"], 0), t: any = (TECHS as any[]).find((x) => x.id === "grove");
  if (t) { g.ec.techs[0].push("grove"); g.ec.era[0] = techEra(g, t, C); ok(eraTechs(g, 0, C) === 1, `grove засчитана в эпоху ${g.ec.era[0]} (по лиге), а не ${t.era}`); }
}
{ // t1235/t1242: технология прошлой эпохи, изученная уже в эпохе II, в II НЕ засчитывается
  const g: any = newGame(15, ["fire", "ice"], 0); g.ec.res[0].know = 99999; g.ec.era[0] = 2; g.cur = 0; g.ec.rs[0] = 0; g.ap = Math.max(g.ap, 1);
  ok(apply(g, 0, { a: "research", t: "horse" } as any, C).ok && eraTechs(g, 0, C) === 0, "horse (эпоха I), изученная в эпохе II, в II не засчитана");
}
// t1242: сетевой путь (parseAct → hiddenTarget → apply, как StratMatch.doAct) по ходам: эпоха II открывается в тот же ход, когда изучена 2-я технология; клиент (view) согласен с сервером
for (const size of [8, 15, 35]) {
  const g: any = newGame(size, ["fire", "ice"], 0);
  const net = (side: number, raw: any) => { const a: any = parseAct(JSON.parse(JSON.stringify(raw))); if (!a) return "parse"; const h = hiddenTarget(g, side, a, C); if (h) return h; const r = apply(g, side, a, C); return r.ok ? "" : r.err; };
  const cli = () => { const v: any = JSON.parse(JSON.stringify(view(g, true, C))); return { ...v, pieces: [] }; }; // как client.ts: ec — из снимка
  let done = 0, sameTurn = false, agree = true;
  for (let i = 0; i < 400 && g.ec.era[0] < 2; i++) {
    if (g.cur !== 0) { net(1, { a: "end" }); continue; }
    if (done < 2) { const t = (TECHS as any[]).find((x) => x.era === 1 && !x.race && !canResearch(g, 0, x, C)); if (t && !net(0, { a: "research", t: t.id })) { done++;
      if (done === 2) { g.ec.res[0].know = Math.max(g.ec.res[0].know, eraCostOf(g, 0, C)!); // знаний хватает — проверяем только счёт технологий
        sameTurn = !canEra(g, 0, C); agree = canEra(cli(), 0, C) === canEra(g, 0, C) && eraTechs(cli(), 0, C) === 2; ok(net(0, { a: "era" }) === "", `${size}: переход в эпоху II тем же ходом`); } } }
    if (g.cur === 0 && g.ec.era[0] < 2) net(0, { a: "end" });
  }
  ok(done === 2 && sameTurn, `${size}: 2-я технология засчитана сразу (тот же ход)`); ok(agree, `${size}: клиент и сервер согласны (2 из 2, canEra)`); ok(g.ec.era[0] === 2, `${size}: эпоха II`);
}
{ // t1242: цена эпохи на кнопке — с поправкой лиги, как в canEra
  for (const size of [8, 15, 35]) { const g: any = newGame(size, ["fire", "ice"], 0); if (!g.ec || g.ec.era[0] < 1) continue;
    const c = eraCostOf(g, 0, C)!; ok(c === rCost(g, C, C.econ.research.eraCost[2]), `${size}: цена эпохи II ${c}`);
    g.ec.techs[0] = ["horse", "masonry"]; g.ec.res[0].know = c - 1; ok(canEra(g, 0, C) === "no_know", `${size}: ${c - 1} знаний — мало`); g.ec.res[0].know = c; ok(canEra(g, 0, C) === null, `${size}: ${c} знаний — хватает`); }
}
{ // старое сохранение без ec.tre — не падает
  const g: any = newGame(8, ["fire", "ice"], 0); delete g.ec.tre; ok(eraTechs(g, 0, C) === 0, "без ec.tre — 0 и без ошибок");
}
console.log(fails ? `FAILS: ${fails}` : "era-test: all ok"); process.exit(fails ? 1 : 0);
