// t1288: клиент считает «N из 2» по урезанному древу (TECHS в клиентской сборке пуст) — должно совпадать с сервером
import { newGame, apply, STRAT_CFG as C } from "./rules";
import { eraTechs, canEra, canResearch, techList } from "./econ";
import { treeView } from "./tree-view";
let fails = 0; const ok = (c: any, m: string) => { if (!c) { fails++; console.log("FAIL", m); } else console.log("ok  ", m); };
const cli = (g: any) => { const tv = treeView(g, 0, C); return { ...C, techs: tv.techs.map((n: any) => n.name ? { id: n.id, br: n.br, era: n.era, grp: n.grp, ...(n.req ? { req: n.req } : {}), name: n.name, eff: n.eff, fx: n.fx || {} } : { id: n.id, br: n.br, era: n.era, grp: n.id, req: ["?"], name: "?", eff: "", fx: {} }) } as any; };
for (const size of [8, 15, 35]) {
  const g: any = newGame(size, ["water", "fire"], 0); if (!g.ec || g.ec.era[0] < 1) continue; g.ec.res[0].know = 99999;
  for (let i = 0; i < C.econ.research.need; i++) { g.cur = 0; g.ec.rs[0] = 0; g.ap = Math.max(g.ap, 1);
    const t = techList(C).find((t) => !g.ec.techs[0].includes(t.id) && !canResearch(g, 0, t, C)); if (!t) break;
    ok(apply(g, 0, { a: "research", t: t.id } as any, C).ok, `${size}: изучено ${t.id}`);
    ok(eraTechs(g, 0, cli(g)) === eraTechs(g, 0, C) && eraTechs(g, 0, C) === i + 1, `${size}: клиент ${eraTechs(g, 0, cli(g))} = сервер ${eraTechs(g, 0, C)} = ${i + 1}`); }
  ok(canEra(g, 0, cli(g)) === canEra(g, 0, C), `${size}: canEra клиент=${canEra(g, 0, cli(g))} сервер=${canEra(g, 0, C)}`);
}
console.log(fails ? `FAILS: ${fails}` : "techcount-test: all ok"); process.exit(fails ? 1 : 0);
