// t1163: баланс рас — круговой турнир ботов (все 6 рас, все пары + зеркала), по размерам/лигам. Параллельно, под nice:
//   nice bun tools/strat/race-sim.ts <out.jsonl> [n=40 на пару и размер] [sizes=8,15] [jobs=6] [bot=ai|old]
//   SIM_CFG='{"...":...}' — правки конфига поверх STRAT_CFG (как из админки), для экспериментов с балансом
// Пишет по строке JSON на партию; сводку строит tools/strat/race-report.ts.
import { newGame, apply, botAction, makeMap, officialMaps, RACES, STRAT_CFG as BASE, type Race } from "../../server/strat/rules";
import { deepMerge } from "../../server/strat/econ-cfg";
import { aiAction } from "../../server/strat/ai";
import { leagueOf } from "../../server/strat/rating";
import { spawn } from "node:child_process";
import { writeFileSync, appendFileSync, unlinkSync } from "node:fs";

const [, self, outPath, a2, a3, a4, a5, w1, w2] = process.argv;
const N = +(a2 || 40), sizes = (a3 || "8,15").split(",").map(Number), JOBS = +(a4 || 6), BOT = a5 || "ai";
const CFG = deepMerge(BASE, process.env.SIM_CFG ? JSON.parse(process.env.SIM_CFG) : {});
const pairs: [Race, Race][] = []; for (let i = 0; i < RACES.length; i++) for (let j = i; j < RACES.length; j++) pairs.push([RACES[i], RACES[j]]);
const tasks: { size: number; pi: number; i: number }[] = [];
for (const size of sizes) pairs.forEach((_, pi) => { for (let i = 0; i < N; i++) tasks.push({ size, pi, i }); });

function play(size: number, pi: number, i: number) {
  const P = pairs[pi], swap = i % 2 === 1, first = (Math.floor(i / 2) % 2) as 0 | 1; // стороны и первый ход чередуются
  const races = (swap ? [P[1], P[0]] : [P[0], P[1]]) as [Race, Race];
  const maps = officialMaps(size).map((o) => o.id), map = maps[Math.floor(i / 4) % maps.length];
  const g = newGame(size, races, first, CFG, null, makeMap(size, map));
  const ult: [string[], string[]] = [[], []], abil: [Record<string, number>, Record<string, number>] = [{}, {}], bld: [Record<string, number>, Record<string, number>] = [{}, {}];
  let k = 0, bad = 0;
  for (; k < 20000 && g.winner === -1; k++) {
    const side = g.cur; const a = BOT === "old" ? botAction(g, side, CFG) : aiAction(g, side, CFG, {});
    const r: any = apply(g, side, a, CFG);
    if (!r.ok) { bad++; apply(g, side, { a: "end" } as any, CFG); continue; }
    for (const e of r.ev as any[]) {
      if (e.e === "ult") ult[e.side].push(e.ult);
      else if (e.e === "ability") abil[side][e.ab] = (abil[side][e.ab] || 0) + 1;
      else if (e.e === "build") bld[side][e.b] = (bld[side][e.b] || 0) + 1;
    }
  }
  return { size, league: leagueOf(size), map, races, first, winner: g.winner, reason: g.reason, turns: g.turn, acts: k, bad,
    goals: [0, 1].map((s) => [...(g.ec?.goals[s] || [])]), gt: g.ec?.gt, techs: [0, 1].map((s) => [...(g.ec?.techs[s] || [])]),
    era: [0, 1].map((s) => g.ec?.era[s] ?? null), glory: [0, 1].map((s) => g.ec?.res[s].glory ?? 0),
    ult, abil, bld, pieces: [0, 1].map((s) => g.pieces.filter((p) => p.owner === s).length) };
}

if (w1 === "--worker") {
  const shard = +w2, out: string[] = [], part = `${outPath}.part${shard}`; writeFileSync(part, "");
  tasks.forEach((t, j) => { if (j % JOBS === shard) { const l = JSON.stringify(play(t.size, t.pi, t.i)); out.push(l); appendFileSync(part, l + "\n"); } }); // .part — прогресс на случай обрыва
  process.stdout.write(out.join("\n"));
} else {
  const t0 = Date.now();
  const parts = await Promise.all(Array.from({ length: JOBS }, (_, s) => new Promise<string>((res, rej) => {
    const p = spawn("nice", ["-n", "15", process.execPath, self, outPath, String(N), sizes.join(","), String(JOBS), BOT, "--worker", String(s)], { stdio: ["ignore", "pipe", "inherit"], env: process.env });
    let buf = ""; p.stdout.on("data", (d) => (buf += d)); p.on("close", (c) => (c ? rej(new Error("worker " + s)) : res(buf)));
  })));
  const lines = parts.filter(Boolean).join("\n"); writeFileSync(outPath, lines + "\n"); for (let s = 0; s < JOBS; s++) try { unlinkSync(`${outPath}.part${s}`); } catch {}
  console.error(`race-sim: ${lines.split("\n").length} партий, ${((Date.now() - t0) / 1000).toFixed(0)} с → ${outPath}`);
}
