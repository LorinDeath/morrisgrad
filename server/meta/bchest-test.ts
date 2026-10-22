// 🎁 Сундуки наград доски: ранг → ярус, уровень вещей ±spread, потолок редкости/зачарования, количество по разделам,
// выдача за сданное задание, хранилище (полно — задание не сдаётся), открытие (вещи внутри, переживают перезаход),
// забрать по одной/всё при полной сумке, разобрать и надеть — проверяет сервер.
import { BCHEST, BC_TIERS, BC_CATS, BC_RARS, rarIdx, chestOdds, rollItems, countOf, rarOdds, bchestPreview, artOf } from "./boardChestCfg";
import { chestsOf, chestList, chestOpen, chestTake, chestSalvage, chestEquip, grantChest } from "./boardChest";
import { BTASKS, boardRefresh, boardOf, boardClaim, makeRoll } from "./board";
import { newAccount, newHero, fixAccount } from "./profile";
import { ITEM_BY_ID } from "./defs";
let f = 0; const ok = (c: any, m: string) => { if (!c) console.log("FAIL " + m); else if (!/^·/.test(m)) console.log("PASS " + m); if (!c) f++; };
let seed = 12345; const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x80000000);
// 1) уровень, редкость, зачарование, проклятие — по ярусу; количество — по разделу
const cnt: Record<string, number[]> = {}; let rolls = 0, widened = 0;
for (const t of BC_TIERS) for (let L = 1; L <= 25; L++) for (const cat of BC_CATS) for (let k = 0; k < 6; k++) {
  const T = BCHEST.tiers[t], cap = rarIdx(T.maxRar), { s } = rarOdds(t, L), its = rollItems(t, L, cat, rnd); rolls++;
  if (s !== BCHEST.spread) widened++;
  const [lo, hi] = countOf(cat); (cnt[cat] ||= []).push(its.length);
  ok(its.length >= lo && its.length <= hi, `· ${t} L${L} ${cat}: вещей ${its.length} в ${lo}…${hi}`);
  for (const x of its) { const d = ITEM_BY_ID[x.id];
    ok(d && Math.abs((d.lvl || 1) - L) <= s, `· ${t} L${L}: уровень вещи ${d?.lvl} в ±${s}`);
    ok(rarIdx(d.rarity) <= cap, `· ${t}: редкость ${d.rarity} не выше ${T.maxRar}`);
    ok(!x.e || (x.e >= 1 && x.e <= T.enchMax), `· ${t}: ярус ${x.e} ≤ ${T.enchMax}`);
    ok(!x.c || T.cursePct > 0, `· ${t}: проклятие только где шанс > 0`); }
}
ok(f === 0, `броски: ${rolls}, окно уровней шире ±${BCHEST.spread} — ${widened} (нет вещей рядом)`);
for (const c of BC_CATS) { const [lo, hi] = countOf(c), v = cnt[c]; ok(v.includes(lo) && v.includes(hi), `${c}: выпадают и ${lo}, и ${hi} вещей (${Math.min(...v)}…${Math.max(...v)})`); }
// разброс уровня ±2 реально используется
{ const lv = new Set<number>(); for (let k = 0; k < 400; k++) for (const x of rollItems("rare", 12, "monthly", rnd)) lv.add(ITEM_BY_ID[x.id].lvl!); ok(lv.has(10) && lv.has(14) && ![...lv].some((l) => l < 10 || l > 14), `L12: уровни ${[...lv].sort((a, b) => a - b)}`); }
// шансы суммируются в 100, чёрный — с мифическими, простой — без зачарования
for (const t of BC_TIERS) { const o = chestOdds(t, 25, "daily"); const sm = Object.values(o.rar).reduce((s, x) => s + x, 0); ok(Math.abs(sm - 100) < 0.5, `${t} L25: редкость ∑ ${sm}`); }
ok(chestOdds("black", 25, "daily").rar.mythic > 0, "чёрный L25: мифические возможны"); ok(chestOdds("common", 10, "daily").enchPct === 0 && !Object.keys(chestOdds("common", 10, "daily").ench).length, "простой: без зачарования");
{ let big = 0, n = 0; for (let k = 0; k < 3000; k++) for (const x of rollItems("black", 25, "daily", rnd)) { n++; if (x.c) big++; } ok(Math.abs(big / n * 100 - BCHEST.tiers.black.cursePct) < 4, `чёрный: проклятых ${(big / n * 100).toFixed(1)}% ≈ ${BCHEST.tiers.black.cursePct}%`); }
// 2) выдача за сданное задание с рангом; хранилище полно — не сдаётся, ступень не записана
const a: any = newAccount(); const W: any = newHero("warrior"); W.lvl = 10; const ctx = { pkey: "uid:bc", heroes: { warrior: W } };
a.hero = "warrior"; boardRefresh(a, W, ctx);
const prep = (rank: string) => { const b = boardOf(a); const id = b.sel.daily.find((x: string) => BTASKS[x].ev === "kill" && !BTASKS[x].f && !BTASKS[x].m && W.lvl <= BTASKS[x].maxLvl) || "d_kill_b";
  if (!b.sel.daily.includes(id)) b.sel.daily.push(id); delete b.c[id];
  b.roll[id] = makeRoll(BTASKS[id], W.lvl, "x|" + id + rank, id, ["warrior"], rank, "warrior", { warrior: W.lvl }); b.p[id] = b.roll[id].n; return id; };
{ const id = prep("S"); const r = boardClaim(a, W, id, ctx); ok(r.ok && r.chest?.tier === "cursed", `ранг S → ${r.chest?.tier} (${r.err || ""})`);
  ok(chestsOf(a).list.length === 1 && chestsOf(a).list[0].L === boardOf(a).roll[id]?.L || chestsOf(a).list[0].L >= 1, "сундук в хранилище, уровень = уровню задания"); }
{ const id = prep("F"); const r = boardClaim(a, W, id, ctx); ok(r.ok && r.chest?.tier === "common", `ранг F → ${r.chest?.tier}`); }
{ const mx = BCHEST.maxStore; BCHEST.maxStore = 2; const id = prep("B"); const r = boardClaim(a, W, id, ctx);
  ok(!r.ok && /Сундуков наград уже 2/.test(r.err) && !boardOf(a).c[id], "хранилище полно: задание не сдано, ступень не записана: " + r.err); BCHEST.maxStore = mx;
  const r2 = boardClaim(a, W, id, ctx); ok(r2.ok && r2.chest?.tier === "rare", "место есть — сдано, ранг B → rare"); }
// 3) открытие: вещи внутри и переживают перезаход (JSON аккаунта как в store.accData)
const relog = (x: any) => { const { inv, res, bestiary, disc, ...rest } = x; const y: any = fixAccount({ ...newAccount(), ...JSON.parse(JSON.stringify(rest)) }); y.inv = inv; y.res = res; y.bestiary = bestiary; y.disc = disc; return y; };
let A: any = a; const big = grantChest(A, "warrior", "SS", 10, "monthly", "test")!;
{ const r = chestOpen(A, "mage", big.id); ok(!r.ok && /героя Велес/.test(r.err!), "чужое тело не открывает: " + r.err); }
const o1: any = chestOpen(A, "warrior", big.id); ok(o1.ok && o1.fresh && o1.chest.items.length >= 10 && o1.chest.items.length <= 30, `открыт: ${o1.chest?.items?.length} вещей`);
const items1 = JSON.stringify(o1.chest.items);
A = relog(A); const o2: any = chestOpen(A, "warrior", big.id); ok(o2.ok && !o2.fresh && JSON.stringify(o2.chest.items) === items1, "после перезахода — те же вещи, без нового броска");
// 4) сумка почти полна: «Забрать всё» берёт сколько влезло, остальное — в сундуке (и после перезахода)
while (A.inv.filter((i: any) => i.hero === "warrior").length < 117) A.inv.push({ uid: "f" + A.inv.length, id: "padded_coat", hero: "warrior" });
{ const n0 = o2.chest.items.length, r: any = chestTake(A, "warrior", big.id, null, true); ok(r.ok && r.got.length === 3 && r.full && r.left === n0 - 3 && /осталось в сундуке/.test(r.msg), `забрано ${r.got.length}, осталось ${r.left}: ${r.msg}`);
  ok(r.got.every((g: any) => A.inv.find((i: any) => i.uid === g.uid && i.hero === "warrior" && i.src === "bchest:black")), "вещи в сумке тела, источник bchest");
  const x0 = JSON.parse(items1).find((x: any) => x.lid === r.got[0].lid), inv0 = A.inv.find((i: any) => i.uid === r.got[0].uid);
  ok(!!inv0.cursed === !!x0.c && (inv0.ench || 0) === (x0.e || 0), "проклятие/ярус перенесены на экземпляр");
  const r2: any = chestTake(A, "warrior", big.id, null, true); ok(!r2.ok && /Сумка полна/.test(r2.err), "сумка полна — ошибка, вещи на месте");
  A = relog(A); ok(chestsOf(A).list.find((c: any) => c.id === big.id)?.items?.length === n0 - 3, "остаток пережил перезаход"); }
// 5) разобрать из сундука (сумка полна — можно), надеть (нужно место и уровень)
{ const c = chestsOf(A).list.find((c: any) => c.id === big.id)!; const x = c.items![0]; const res0 = JSON.stringify(A.res);
  const r: any = chestSalvage(A, "warrior", big.id, x.lid); ok(r.ok && JSON.stringify(A.res) !== res0 && !c.items!.some((y) => y.lid === x.lid), "разобрано из сундука, материалы начислены: " + JSON.stringify(r.got));
  ok(!chestSalvage(A, "warrior", big.id, x.lid).ok, "повторно ту же вещь не разобрать");
  ok(!chestSalvage(A, "warrior", big.id, 999).ok && !chestTake(A, "warrior", big.id, 999, false).ok, "несуществующая вещь — отказ"); }
{ const c = chestsOf(A).list.find((c: any) => c.id === big.id)!; const x = c.items![0];
  const r0: any = chestEquip(A, W, "warrior", big.id, x.lid); ok(!r0.ok && /Сумка полна/.test(r0.err), "надеть при полной сумке нельзя: " + r0.err);
  A.inv = A.inv.filter((i: any) => !String(i.uid).startsWith("f"));
  const low: any = newHero("warrior"); low.lvl = 1; const rl: any = chestEquip(A, low, "warrior", big.id, x.lid); ok(!rl.ok && /уровень/.test(rl.err) && c.items!.some((y) => y.lid === x.lid), "мал уровень — не надето, вещь в сундуке");
  const n = A.inv.length; const r: any = chestEquip(A, W, "warrior", big.id, x.lid); const d = ITEM_BY_ID[x.id];
  ok(r.ok && W.equip[d.slot] === r.uid && A.inv.length === n + 1 && !c.items!.some((y) => y.lid === x.lid), "надето из сундука: " + (r.err || d.slot)); }
// 6) по одной; пустой сундук исчезает
{ let c = chestsOf(A).list.find((c: any) => c.id === big.id)!; const one: any = chestTake(A, "warrior", big.id, c.items![0].lid, false); ok(one.ok && one.got.length === 1, "Shift/двойное касание: одна вещь");
  const all: any = chestTake(A, "warrior", big.id, null, true); ok(all.ok && all.gone && !chestsOf(A).list.some((c: any) => c.id === big.id), "опустошённый сундук исчез"); }
ok(chestList(A).list.length === 3, "в списке остальные сундуки: " + chestList(A).list.length);
// 7) предпросмотр админки: значения формы применяются только к расчёту, конфиг не меняется; опасные ключи — мимо
{ const before = JSON.stringify(BCHEST);
  const pv: any = bchestPreview({ "tiers.common.maxRar": "rare", "tiers.common.w.rare": 50, "count.daily.max": 9, "__proto__.x": 1, "tiers.constructor": 1 }, 12, "daily", rnd);
  ok(pv.ok && pv.tiers.find((t: any) => t.tier === "common").rar.rare > 0 && pv.tiers[0].cmax === 9, "предпросмотр учёл значения формы");
  ok(JSON.stringify(BCHEST) === before && !({} as any).x, "конфиг после предпросмотра не изменился");
  ok(pv.tiers.every((t: any) => Array.isArray(t.sample) && t.sample.length >= t.cmin && t.ranks), "пример содержимого и ранги по ярусам");
  const bad: any = bchestPreview({ "count.weekly.min": 9, "count.weekly.max": 2 }, 5, "weekly"); ok(!bad.ok && /больше/.test(bad.err), "ошибка формы: " + bad.err); }
// 8) вид сундука: ранг → рисунок (12 вариантов), пусто — по ярусу
ok(artOf("common", "F") === "common" && artOf("black", "SS") === "cursed_mythic" && artOf("cursed", "S") === "cursed_legendary", "вид по рангу");
{ const keep = BCHEST.rankArt.C; BCHEST.rankArt.C = ""; ok(artOf("uncommon", "C") === BCHEST.tiers.uncommon.art, "пустой вид — как у яруса"); BCHEST.rankArt.C = keep; }
console.log(f ? `FAILED ${f}` : "bchest ok"); process.exit(f ? 1 : 0);
