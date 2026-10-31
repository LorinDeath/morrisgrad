// t1221: переход в новую эпоху засчитывает технологии текущей эпохи с поправкой лиги и изученные в ней (ec.tre)
import { newGame, apply, STRAT_CFG as C } from "./rules";
import { canEra, eraTechs, techEra, canResearch } from "./econ";
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
{ // технология прошлой эпохи, изученная уже в эпохе II, засчитывается в II
  const g: any = newGame(15, ["fire", "ice"], 0); g.ec.res[0].know = 99999; g.ec.era[0] = 2; g.cur = 0; g.ec.rs[0] = 0; g.ap = Math.max(g.ap, 1);
  ok(apply(g, 0, { a: "research", t: "horse" } as any, C).ok && eraTechs(g, 0, C) === 1, "horse (эпоха I), изученная в эпохе II, засчитана в II");
}
{ // старое сохранение без ec.tre — не падает
  const g: any = newGame(8, ["fire", "ice"], 0); delete g.ec.tre; ok(eraTechs(g, 0, C) === 0, "без ec.tre — 0 и без ошибок");
}
console.log(fails ? `FAILS: ${fails}` : "era-test: all ok"); process.exit(fails ? 1 : 0);
