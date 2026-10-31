// Арена ботов (баланс, архетипы, разрыв в силе). Параллельно, под nice:
//   nice bun tools/strat/arena.ts <plan.json> [jobs=6] > out.json
// plan: { cfg?: patch, sizes:[8,15], n: игр на пару, pairs:[{races:[r,r], bots:[spec,spec], tag?}] }
// spec: "old" (прежний жадный бот) | { arch, depth, beam }. Стороны, первый ход и карты чередуются.
import { newGame, apply, botAction, makeMap, officialMaps, STRAT_CFG as BASE, type Race } from "../../server/strat/rules";
import { deepMerge } from "../../server/strat/econ-cfg";
import { aiAction, evaluate } from "../../server/strat/ai";
import { techList } from "../../server/strat/econ";
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";

type Spec = "old" | { arch?: string; depth?: number; beam?: number; noise?: number };
const [, self, planPath, a2, a3, a4] = process.argv;
const plan = JSON.parse(readFileSync(planPath, "utf8"));
const CFG = deepMerge(BASE, plan.cfg || {});
const tasks: { size: number; pi: number; i: number }[] = [];
for (const size of plan.sizes) plan.pairs.forEach((_: any, pi: number) => { for (let i = 0; i < plan.n; i++) tasks.push({ size, pi, i }); });

function play(size: number, pi: number, i: number) {
  const P = plan.pairs[pi];
  const swap = i % 2 === 1, first = (Math.floor(i / 2) % 2) as 0 | 1; // swap: кто снизу; first: кто ходит первым
  const label = (s: number) => (swap ? 1 - s : s); // сторона → индекс в паре
  const races = [P.races[label(0)], P.races[label(1)]] as [Race, Race];
  const bots: Spec[] = [P.bots[label(0)], P.bots[label(1)]];
  const maps = officialMaps(size).map((o) => o.id);
  const g = newGame(size, races, first, CFG, plan.turnLimit ?? null, makeMap(size, maps[Math.floor(i / 4) % maps.length]));
  const st = [{ turns: 0, legal: 0, good: 0 }, { turns: 0, legal: 0, good: 0 }];
  const rec: Record<string, number> = {}, bld: Record<string, number> = {}; let chiefDown = 0; const goalT: Record<string, number> = {}; let acts = 0, pturns = 0, secs = 0, actsThis = 0, techs = 0, found = 0;
  let minEv = [1e9, 1e9], lastTurn = -1;
  const sec = CFG.sizes[size].turnSec;
  for (let k = 0; k < 30000 && g.winner === -1; k++) {
    if (g.turn !== lastTurn && g.cur === g.first) { lastTurn = g.turn; if (g.turn >= 3) { const e = evaluate(g, 0, CFG); minEv[0] = Math.min(minEv[0], e); minEv[1] = Math.min(minEv[1], -e); } }
    const side = g.cur, b = bots[side];
    const a = b === "old" ? botAction(g, side, CFG) : aiAction(g, side, CFG, { ...b, stats: st[side] });
    const r = apply(g, side, a, CFG);
    if (!r.ok) { apply(g, side, { a: "end" }, CFG); continue; }
    acts++; actsThis++;
    for (const e of r.ev as any[]) {
      if (e.e === "recruit") rec[e.kind] = (rec[e.kind] || 0) + 1;
      if (e.e === "build") bld[e.b] = (bld[e.b] || 0) + 1;
      if (e.e === "chief_down") chiefDown++;
      if (e.e === "goal" && goalT[e.goal] === undefined) goalT[e.goal] = g.turn;
      if (e.e === "tech") techs++; if (e.e === "found") found++;
      if (e.e === "turn" || e.e === "end") { pturns++; secs += Math.min(sec, 4 + 6 * actsThis); actsThis = 0; }
    }
  }
  const wl = g.winner === 2 ? -1 : label(g.winner);
  return { size, pi, wl, reason: g.reason, turns: g.turn, firstWin: g.winner === 2 ? -1 : g.winner === first ? 1 : 0,
    comeback: g.winner === 0 || g.winner === 1 ? (minEv[g.winner] < -10 ? 1 : 0) : 0, min: secs / 60,
    rich: [0, 1].map((s) => (st[label(s)].turns ? [st[label(s)].legal / st[label(s)].turns, st[label(s)].good / st[label(s)].turns] : [0, 0])), rec, bld, techs, found, chiefDown, goalT,
    combo: g.winner === 0 || g.winner === 1 ? [...(g.ec?.goals[g.winner] || [])].sort().join("+") : "",
    goals: [0, 1].map((s) => [...(g.ec?.goals[label(s)] || [])]),
    br: [0, 1].map((s) => { const o: Record<string, number> = {}; for (const id of g.ec?.techs[label(s)] || []) { const b = techList(CFG).find((t) => t.id === id)?.br || "?"; o[b] = (o[b] || 0) + 1; } return o; }) };
}

if (a2 === "--worker") {
  const shard = +a3, jobs = +a4; const out: any[] = [];
  tasks.forEach((t, j) => { if (j % jobs === shard) out.push(play(t.size, t.pi, t.i)); });
  process.stdout.write(JSON.stringify(out));
} else {
  const jobs = +(a2 || 6);
  const parts = await Promise.all(Array.from({ length: jobs }, (_, s) => new Promise<any[]>((res, rej) => {
    const p = spawn("nice", ["-n", "15", process.execPath, self, planPath, "--worker", String(s), String(jobs)], { stdio: ["ignore", "pipe", "inherit"] });
    let buf = ""; p.stdout.on("data", (d) => (buf += d)); p.on("close", (c) => (c ? rej(new Error("worker " + s)) : res(JSON.parse(buf))));
  })));
  const all = parts.flat(); const rep: any = {};
  for (const size of plan.sizes) plan.pairs.forEach((P: any, pi: number) => {
    const G = all.filter((r) => r.size === size && r.pi === pi), n = G.length;
    const w0 = G.filter((r) => r.wl === 0).length, w1 = G.filter((r) => r.wl === 1).length, dec = w0 + w1;
    const fw = G.filter((r) => r.firstWin === 1).length, fd = G.filter((r) => r.firstWin >= 0).length;
    const reasons: any = {}; for (const r of G) reasons[r.reason] = (reasons[r.reason] || 0) + 1;
    const sum = (f: (r: any) => number) => G.reduce((s, r) => s + f(r), 0);
    const agg = (k: "rec" | "bld") => { const o: any = {}; for (const r of G) for (const [x, v] of Object.entries(r[k])) o[x] = +((o[x] || 0) + (v as number) / n).toFixed(2); return o; };
    const tl = G.map((r) => r.turns).sort((a, b) => a - b), q = (p: number) => tl[Math.min(n - 1, Math.floor(p * n))];
    const ci = (p: number, m: number) => (m ? +(1.96 * Math.sqrt(p * (1 - p) / m) * 100).toFixed(1) : 0);
    rep[`${size}x${size} ${P.tag || P.races.join("-")}`] = {
      n, A: +(w0 / n * 100).toFixed(1), B: +(w1 / n * 100).toFixed(1), draw: +((n - dec) / n * 100).toFixed(1),
      AofDecisive: dec ? +(w0 / dec * 100).toFixed(1) : 0, ci95: ci(dec ? w0 / dec : 0, dec), firstOfDecisive: fd ? +(fw / fd * 100).toFixed(1) : 0,
      reasons, turns: { avg: +(sum((r) => r.turns) / n).toFixed(1), p10: q(0.1), p50: q(0.5), p90: q(0.9) }, minutes: +(sum((r) => r.min) / n).toFixed(1),
      comeback: dec ? +(sum((r) => r.comeback) / dec * 100).toFixed(1) : 0,
      richA: [+(sum((r) => r.rich[0][0]) / n).toFixed(1), +(sum((r) => r.rich[0][1]) / n).toFixed(1)], richB: [+(sum((r) => r.rich[1][0]) / n).toFixed(1), +(sum((r) => r.rich[1][1]) / n).toFixed(1)],
      combos: (() => { const o: any = {}; for (const r of G) if (r.combo) o[r.combo] = (o[r.combo] || 0) + 1; return o; })(),
      goalUse: (() => { const o: any = {}; for (const r of G) for (const s of [0, 1]) for (const id of r.goals[s]) o[id] = +((o[id] || 0) + 1 / n / 2 * 100).toFixed(1); return o; })(),
      goalTurn: (() => { const o: any = {}, c: any = {}; for (const r of G) for (const [k, t] of Object.entries(r.goalT)) { o[k] = (o[k] || 0) + (t as number); c[k] = (c[k] || 0) + 1; } for (const k in o) o[k] = +(o[k] / c[k]).toFixed(1); return o; })(),
      chiefDeaths: +(sum((r) => r.chiefDown) / n).toFixed(2),
      brA: (() => { const o: any = {}; for (const r of G) for (const [k, v] of Object.entries(r.br[0])) o[k] = +((o[k] || 0) + (v as number) / n).toFixed(2); return o; })(),
      brB: (() => { const o: any = {}; for (const r of G) for (const [k, v] of Object.entries(r.br[1])) o[k] = +((o[k] || 0) + (v as number) / n).toFixed(2); return o; })(),
      recruits: agg("rec"), builds: agg("bld"), techs: +(sum((r) => r.techs) / n).toFixed(1), outposts: +(sum((r) => r.found) / n).toFixed(2),
    };
  });
  console.log(JSON.stringify(rep, null, 1));
}
