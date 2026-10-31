// t1163: сводка баланса рас из JSONL race-sim.ts → MD + CSV.
//   bun tools/strat/race-report.ts <outDir> <title> <a.jsonl> [b.jsonl …]
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { ULTS } from "../../server/strat/tree-data";
const [, , outDir, title, ...files] = process.argv;
mkdirSync(outDir, { recursive: true });
const R = ["fire", "ice", "water", "stone", "nature", "lightning"];
const RU: Record<string, string> = { fire: "Огонь", ice: "Лёд", water: "Вода", stone: "Камень", nature: "Природа", lightning: "Молния" };
const rows: any[] = files.flatMap((f) => readFileSync(f, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)));
const pct = (a: number, b: number) => (b ? ((100 * a) / b).toFixed(1) : "—");
const md: string[] = [`# ${title}`, "", `Партий: ${rows.length}. Бот: ai.ts (aiAction), обе стороны. Стороны и первый ход чередуются. Винрейт рас — без зеркальных партий; ничьи/недоигранные считаются за 0.5 (в знаменателе).`, ""];
const csv: Record<string, string[]> = { races: ["group,race,games,wins,draws,winrate"], matchup: ["size,race,vs,games,winrate"], goals: ["size,combo,count,share"], techs: ["size,tech,race,games_with,winrate_with,winner_share,loser_share"], ults: ["size,ult,casts,games_used,winrate_used"] };
const groups: [string, any[]][] = [];
for (const s of [...new Set(rows.map((r) => r.size))].sort((a, b) => a - b)) groups.push([`${s}×${s} (${rows.find((r) => r.size === s).league})`, rows.filter((r) => r.size === s)]);
if (groups.length > 1) groups.push(["все размеры", rows]);
const flags: string[] = [];
for (const [name, G] of groups) {
  const fin = G.filter((r) => r.winner >= 0), bad = G.reduce((a, r) => a + r.bad, 0);
  const avg = (k: string, xs: any[]) => (xs.length ? (xs.reduce((a, r) => a + r[k], 0) / xs.length).toFixed(1) : "—");
  const first = fin.filter((r) => r.winner === r.first).length;
  md.push(`## ${name}`, "", `- партий ${G.length}, доиграно ${fin.length} (${pct(fin.length, G.length)}%), неверных действий ${bad}`, `- средняя длина: ${avg("turns", fin)} ходов, ${avg("acts", fin)} действий; первый ход побеждает в ${pct(first, fin.length)}%`);
  const reasons: Record<string, number> = {}; for (const r of G) reasons[r.reason || "нет"] = (reasons[r.reason || "нет"] || 0) + 1;
  md.push(`- исход: ${Object.entries(reasons).map(([k, v]) => `${k} ${v}`).join(", ")}`, "");
  md.push("| Раса | Партий | Побед | Ничьих | Винрейт | Зеркала: побед стороны 0 |", "|---|---|---|---|---|---|");
  for (const x of R) {
    const g = G.filter((r) => r.races[0] !== r.races[1] && r.races.includes(x));
    const w = g.filter((r) => r.winner >= 0 && r.races[r.winner] === x).length, d = g.filter((r) => r.winner < 0).length;
    const wr = g.length ? (w + d / 2) / g.length : 0;
    const m = G.filter((r) => r.races[0] === x && r.races[1] === x);
    md.push(`| ${RU[x]} | ${g.length} | ${w} | ${d} | **${(wr * 100).toFixed(1)}%** | ${m.filter((r) => r.winner === 0).length}/${m.length} |`);
    csv.races.push(`${name},${x},${g.length},${w},${d},${(wr * 100).toFixed(1)}`);
    if (name !== "все размеры" && g.length && (wr < 0.45 || wr > 0.55)) flags.push(`${name}: ${RU[x]} ${(wr * 100).toFixed(1)}%`);
  }
  md.push("", "Матрица (строка против столбца, винрейт строки):", "", "| | " + R.map((x) => RU[x]).join(" | ") + " |", "|---|" + R.map(() => "---").join("|") + "|");
  for (const x of R) {
    const cells = R.map((y) => {
      if (x === y) return "—";
      const g = G.filter((r) => r.races.includes(x) && r.races.includes(y));
      const w = g.filter((r) => r.winner >= 0 && r.races[r.winner] === x).length, d = g.filter((r) => r.winner < 0).length;
      csv.matchup.push(`${name},${x},${y},${g.length},${pct(w + d / 2, g.length)}`);
      return pct(w + d / 2, g.length);
    });
    md.push(`| ${RU[x]} | ${cells.join(" | ")} |`);
  }
  // цели победителя
  const combos: Record<string, number> = {}, single: Record<string, number> = {};
  for (const r of fin.filter((r) => r.reason === "goals")) { const k = [...r.goals[r.winner]].sort().join("+"); combos[k] = (combos[k] || 0) + 1; for (const q of r.goals[r.winner]) single[q] = (single[q] || 0) + 1; }
  const ng = fin.filter((r) => r.reason === "goals").length;
  md.push("", `Цели победителя (по целям — ${ng} из ${fin.length}):`, "", "| Набор целей | Партий | Доля |", "|---|---|---|");
  for (const [k, v] of Object.entries(combos).sort((a, b) => b[1] - a[1])) { md.push(`| ${k} | ${v} | ${pct(v, ng)}% |`); csv.goals.push(`${name},${k},${v},${pct(v, ng)}`); }
  md.push("", "Отдельные цели у победителя: " + Object.entries(single).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${pct(v, ng)}%`).join(", "));
  const gtAvg: Record<string, number[]> = {}; for (const r of fin) for (const [k, t] of Object.entries(r.gt?.[r.winner] || {})) (gtAvg[k] ||= []).push(t as number);
  md.push("", "Средний ход взятия цели (победитель): " + Object.entries(gtAvg).map(([k, v]) => `${k} ${(v.reduce((a, b) => a + b, 0) / v.length).toFixed(0)}`).join(", "), "");
  // технологии
  const tech: Record<string, { race: Set<string>; n: number; w: number; inW: number; inL: number }> = {};
  for (const r of fin) for (const s of [0, 1]) for (const t of r.techs[s]) { const o = (tech[t] ||= { race: new Set(), n: 0, w: 0, inW: 0, inL: 0 }); o.race.add(r.races[s]); o.n++; if (r.winner === s) { o.w++; o.inW++; } else o.inL++; }
  const tl = Object.entries(tech).filter(([, o]) => o.n >= 10).sort((a, b) => b[1].w / b[1].n - a[1].w / a[1].n);
  md.push("Технологии (≥10 изучений; винрейт стороны, изучившей; доля у победителей/проигравших):", "", "| Технология | Расы | Изучили | Винрейт | У победителей | У проигравших |", "|---|---|---|---|---|---|");
  for (const [t, o] of tl) { const rc = o.race.size >= 6 ? "все" : [...o.race].map((x) => RU[x]).join(", "); md.push(`| ${t} | ${rc} | ${o.n} | ${pct(o.w, o.n)}% | ${pct(o.inW, fin.length)}% | ${pct(o.inL, fin.length)}% |`); csv.techs.push(`${name},${t},"${rc}",${o.n},${pct(o.w, o.n)},${pct(o.inW, fin.length)},${pct(o.inL, fin.length)}`); }
  // ульты
  const ul: Record<string, { c: number; g: number; w: number }> = {};
  for (const r of fin) for (const s of [0, 1]) { const seen = new Set<string>(); for (const u of r.ult[s]) { const o = (ul[u] ||= { c: 0, g: 0, w: 0 }); o.c++; if (!seen.has(u)) { seen.add(u); o.g++; if (r.winner === s) o.w++; } } }
  md.push("", "Ульты (Вождь — ключи ULTS, остальные — ульты фигур 5-го уровня):", "", "| Ульта | Чья | Кастов | Партий с ней | Винрейт использовавшего |", "|---|---|---|---|---|");
  for (const [u, o] of Object.entries(ul).sort((a, b) => b[1].c - a[1].c)) { md.push(`| ${u} | ${u in ULTS ? "Вождь" : "фигура"} | ${o.c} | ${o.g} | ${pct(o.w, o.g)}% |`); csv.ults.push(`${name},${u},${o.c},${o.g},${pct(o.w, o.g)}`); }
  md.push("");
}
md.push("## Вне коридора 45–55%", "", flags.length ? flags.map((f) => "- " + f).join("\n") : "- нет", "");
writeFileSync(`${outDir}/report.md`, md.join("\n"));
for (const [k, v] of Object.entries(csv)) writeFileSync(`${outDir}/${k}.csv`, v.join("\n") + "\n");
console.log(flags.join("\n") || "в коридоре");
