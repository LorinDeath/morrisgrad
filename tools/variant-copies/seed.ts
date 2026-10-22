// Сухой прогон / SQL заполнения строк копий трофеев вариантов. Только читает выгрузку и пишет локальные файлы; в D1 не ходит.
//   cd server && bun ../tools/variant-copies/seed.ts --in prod-ovr.json [--out seed.sql] [--md copies-stats.md]
// prod-ovr.json: wrangler d1 execute morrisgrad_db --remote --json --command "SELECT kind, id, data, version FROM game_overrides"
import { readFileSync, writeFileSync } from "node:fs";
import { parseRows, seedPlan, seedSql, type PlanItem } from "../../server/meta/variantSeed";

const arg = (k: string) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : undefined; };
const inp = arg("--in"); if (!inp) { console.error("нужен --in <выгрузка game_overrides JSON>"); process.exit(2); }
const rows = parseRows(JSON.parse(readFileSync(inp, "utf8")));
const { plan } = await seedPlan(rows);
const todo = plan.filter((x) => !x.exists), W = plan.filter((x) => x.slot === "weapon");
const f1 = (n: number) => (n >= 0 ? "+" : "") + n.toFixed(1) + "%";
console.log(`строк game_overrides во входе: ${rows.length} (item: ${rows.filter((r) => r.kind === "item").length})`);
console.log(`копий в коде: ${plan.length}; уже со своей строкой (НЕ трогаем): ${plan.length - todo.length}; будет создано: ${todo.length}`);
console.log(`оружие-копий: ${W.length}, с навыком R базы: ${W.filter((x) => x.rs).length}; копий с чертами базы: ${plan.filter((x) => x.traits).length}`);
const out = plan.filter((x) => Math.abs(x.dev) > 15), outCode = plan.filter((x) => Math.abs(x.devCode) > 15);
console.log(`статы: вне ±15% от соседей — у кода ${outCode.length}, после подгонки ${out.length}; макс. |откл.| ${Math.max(...plan.map((x) => Math.abs(x.dev))).toFixed(1)}%`);
for (const x of todo.slice(0, 5)) console.log(`  + ${x.id} L${x.lvl} req${x.req}${x.rs ? " rs=" + x.rs : ""}${x.traits ? " черт " + x.traits : ""} ${JSON.stringify(x.stats)}`);
if (todo.length > 5) console.log(`  … ещё ${todo.length - 5}`);
const o = arg("--out"); if (o) { writeFileSync(o, seedSql(plan)); console.log(`SQL → ${o}`); }
const md = arg("--md"); if (md) { writeFileSync(md, table(plan)); console.log(`таблица → ${md}`); }

function table(p: PlanItem[]) {
  const s = (o: Record<string, number>) => Object.entries(o).map(([k, v]) => `${k} ${v}`).join(", ") || "—";
  const L = ["# Копии трофеев вариантов — статы по уровню", "",
    "Источник: код + прод-строки game_overrides (выгрузка). Соседи — НЕ копии того же слота и редкости, уровень копии ±окно (0…5, пока не ≥3; иначе любой редкости), приведённые к уровню копии формой бюджета кода: урон — weaponAvg(L, r) (12+5.2L+0.2L²)·RARITY_DMG и делитель weaponHitMult(тип), прочие линии — сила Σ STAT_COST·значение, приведение itemBudget(L, r) (18+10L+0.72L²)·RARITY_BUDGET.",
    "Статы копии = профиль базы (те же линии в тех же долях, особые бонусы базы) × (медиана соседей / сила базы), округление statRound, потолок линии max(ITEM_LINE_CAP, у базы, у соседей ±2 ур.).",
    "Откл. — сила копии против медианы соседей: оружие — общая сила (урон/множитель типа + прочие линии), остальное — сила линий; в скобках у оружия — отдельно урон и линии. Если все линии базы упёрлись в потолки (правило игры), недостающая сила уходит в урон (оружие) или поровну в броню и здоровье. «Код» — то, что давала генерация копии в коде (genItemStats).", "",
    `Итого: ${p.length} копий; вне ±15% у кода — ${p.filter((x) => Math.abs(x.devCode) > 15).length}, после подгонки — ${p.filter((x) => Math.abs(x.dev) > 15).length}; макс. |откл.| после подгонки ${Math.max(...p.map((x) => Math.abs(x.dev))).toFixed(1)}%, медиана |откл.| ${med(p.map((x) => Math.abs(x.dev))).toFixed(1)}%.`, "",
    "| копия | имя | слот/редк. | ур. (база) | треб. | R / черты | статы базы → копии | соседи: медиана (n, ±ур.) | откл. кода | откл. | |", "|---|---|---|---|---|---|---|---|---|---|---|"];
  for (const x of p) L.push(`| ${x.id} | ${x.name} | ${x.slot}/${x.rarity} | ${x.lvl} (${x.baseLvl}, ${x.base}) | ${x.req} | ${x.rs || "—"} / ${x.traits || "—"} | ${s(x.baseStats)} → ${s(x.stats)} | ${x.slot === "weapon" ? `урон ${x.peers.dmg.toFixed(1)} (${x.peers.nD}, ±${x.peers.wD}); ` : ""}сила ${x.peers.sec.toFixed(1)} (${x.peers.nS}, ±${x.peers.wS})${x.peers.any ? " *любая редк." : ""} | ${f1(x.devCode)} | ${f1(x.dev)}${x.slot === "weapon" ? ` (урон ${x.devD != null ? f1(x.devD) : "—"}, линии ${x.devS != null ? f1(x.devS) : "—"})` : ""} | ${Math.abs(x.devCode) > 15 ? "исправлено" : ""}${Math.abs(x.dev) > 15 ? " ⚠" : ""} |`);
  return L.join("\n") + "\n";
}
function med(a: number[]) { const b = [...a].sort((x, y) => x - y); return b.length ? b[Math.floor(b.length / 2)] : 0; }
