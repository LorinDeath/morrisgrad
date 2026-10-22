// 🎁 Симуляция сундуков наград: N открытий каждого яруса на уровнях 10 и 22 — распределение редкость × проклятие × чёрное,
// очернение, покрытие пула (выпавшие id против ВСЕХ вещей окна уровней) и причины невыпадения. Запуск: esbuild → node.
import { BCHEST, BC_TIERS, BC_RARS, rarIdx, rollItems, chestOdds, lvlWindow, baseRarPct, baseCursePct, baseEnchPct } from "./boardChestCfg";
import { ITEMS, ITEM_BY_ID } from "./defs";
import { ENCH } from "./enchant";
const N = Number(process.env.N || 10000), CAT = process.env.CAT || "weekly";
let seed = 777; const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x80000000);
const P = (x: number, n: number) => (n ? ((x / n) * 100).toFixed(x / n < 0.01 ? 2 : 1) : "0") + "%";
const RS: Record<string, string> = { common: "об", uncommon: "нео", rare: "ред", epic: "эп", legendary: "лег", mythic: "миф" };
console.log(`Основа (общие таблицы): редкость DROP_PCT ${BC_RARS.map((r) => `${RS[r]} ${baseRarPct()[r]}%`).join(", ")}; доля проклятых в дропе проклятого босса ${baseCursePct().toFixed(2)}%; зачарованный моб ${baseEnchPct().toFixed(2)}% (ярусы ${ENCH.tiers.map((t) => t.spawnPct).join("/")})`);
console.log(`Открытий на вариант: ${N}, раздел «${CAT}»\n`);
for (const L of [10, 22]) {
  const W = lvlWindow(L), win = ITEMS.filter((i: any) => i.slot && (i.lvl || 1) >= W.lo && (i.lvl || 1) <= W.hi);
  console.log(`=== Уровень ${L}: вещи ${W.lo}–${W.hi}, в окне ${win.length} вещей (${BC_RARS.map((r) => `${RS[r]} ${win.filter((i: any) => i.rarity === r).length}`).join(", ")}) ===`);
  console.log("ярус | вещей | " + BC_RARS.map((r) => RS[r]).join(" / ") + " | ☠ всего | ☠ по редкостям | ✦ | ☠+✦6 (чёрная проклятая) | ✦6 без ☠ | 🌑 доля · −мин…медиана…макс | покрытие");
  for (const t of BC_TIERS) {
    const T = BCHEST.tiers[t], o = chestOdds(t, L, CAT); let n = 0, c = 0, e = 0, bc = 0, e6 = 0, b = 0; const rar: Record<string, number> = {}, cr: Record<string, number> = {}, seen = new Set<string>(), bv: number[] = [];
    for (let k = 0; k < N; k++) for (const x of rollItems(t, L, CAT, rnd)) { const d = ITEM_BY_ID[x.id]; n++; seen.add(x.id); rar[d.rarity] = (rar[d.rarity] || 0) + 1;
      if (x.c) { c++; cr[d.rarity] = (cr[d.rarity] || 0) + 1; } if (x.e) e++; if (x.c && x.e === 6) bc++; if (!x.c && x.e === 6) e6++; if (x.b) { b++; bv.push(x.b); } }
    bv.sort((p, q) => p - q);
    const miss = win.filter((i: any) => !seen.has(i.id)), out = [...seen].filter((id) => !win.some((i: any) => i.id === id));
    const why = (i: any) => rarIdx(i.rarity) > rarIdx(T.maxRar) ? `выше потолка яруса (${T.maxRar})` : "мал шанс (не выпало за прогон)";
    const reasons: Record<string, number> = {}; for (const i of miss) reasons[why(i)] = (reasons[why(i)] || 0) + 1;
    console.log(`${T.name} [${o.art}] | ${n} | ${BC_RARS.map((r) => P(rar[r] || 0, n)).join(" / ")} | ${P(c, n)} | ${BC_RARS.filter((r) => cr[r]).map((r) => `${RS[r]} ${P(cr[r], n)}`).join(", ") || "—"} | ${P(e, n)} | ${P(bc, n)} (${bc}) | ${P(e6, n)} | ${b ? `${P(b, n)} · −${bv[0]}…${bv[bv.length >> 1]}…${bv[bv.length - 1]}%` : "—"} | ${seen.size}/${win.length} = ${P(seen.size, win.length)}${out.length ? ` ВНЕ ОКНА: ${out}` : ""}${miss.length ? ` · не выпали: ${Object.entries(reasons).map(([k, v]) => `${v} — ${k}`).join("; ")}${miss.length <= 6 ? ` [${miss.map((i: any) => i.id).join(", ")}]` : ""}` : ""}`);
    console.log(`   ожидаемо по формуле: редкость ${BC_RARS.filter((r) => o.rar[r]).map((r) => `${RS[r]} ${o.rar[r]}%`).join(", ")}; ☠ ${o.cursePct}%; ✦ ${o.enchPct}% (${Object.entries(o.ench).map(([k, v]) => `${k}:${v}%`).join(" ")}); ☠+✦6 ${o.blackCursed}%; 🌑 ${o.blkPct}% −${o.blkMin}…${o.blkMax}%`);
  }
  console.log("");
}
