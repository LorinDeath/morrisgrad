// bun server/strat/racedraw-test.ts — рейтинговый жребий рас (t1144)
import { drawRaces, cleanFav, commitOf, allowed } from "./racedraw";
import { RACES, type Race } from "./rules";
import { deepMerge } from "./econ-cfg";
import { STRAT_CFG } from "./rules";
let ok = 0, bad = 0; const t = (n: string, c: any) => { if (c) ok++; else { bad++; console.log("FAIL", n); } };
const S = (fav: Race[], team: number) => ({ fav, team });
// ввод
t("cleanFav мусор", cleanFav("x").length === 0 && cleanFav(["fire", "fire", "zzz", "ice", "stone", "water"]).join() === "fire,ice,stone");
t("cleanFav favMax", cleanFav(["fire", "ice", "stone"], 2).length === 2);
// детерминизм + commit
const a = await drawRaces("seed1", [S(["fire"], 0), S(["ice"], 1)]), b = await drawRaces("seed1", [S(["fire"], 0), S(["ice"], 1)]);
t("детерминизм", JSON.stringify(a) === JSON.stringify(b));
t("commit sha256 hex", /^[0-9a-f]{64}$/.test(await commitOf("seed1")) && (await commitOf("seed1")) !== (await commitOf("seed2")));
// распределение ≈85/15 и config override
async function share(cfg: any, N = 3000) { let f = 0; for (let i = 0; i < N; i++) { const r = await drawRaces("d" + i, [S(["fire", "ice"], 0), S([], 1)], cfg); if (r.rolls.find((x) => x.seat === 0)!.fromFav) f++; } return f / N; }
const sh = await share({}); t("85/15 ≈ " + sh.toFixed(3), sh > 0.82 && sh < 0.88);
const adm = deepMerge(STRAT_CFG, { econ: { raceDraw: { fav: 50, other: 50 } } }) as any;
t("админ-патч доходит до cfg", adm.econ.raceDraw.fav === 50 && (STRAT_CFG.econ as any).raceDraw.fav === 85);
const sh2 = await share(adm.econ.raceDraw); t("50/50 из админки ≈ " + sh2.toFixed(3), sh2 > 0.46 && sh2 < 0.54);
const sh0 = await share({ fav: 100, other: 0 }, 500); t("100/0 → всегда любимая", sh0 === 1);
// внутри группы равномерно, остальные — тоже
{ const c: Record<string, number> = {}; for (let i = 0; i < 3000; i++) { const r = await drawRaces("u" + i, [S([], 0)]); c[r.races[0]] = (c[r.races[0]] || 0) + 1; }
  t("без любимых — равномерно по 6", RACES.every((x) => c[x] > 400 && c[x] < 600)); }
// недоступна → запасной вариант
{ let dup = 0, fb = 0; for (let i = 0; i < 2000; i++) { const r = await drawRaces("c" + i, [S(["fire"], 0), S(["fire"], 1)]); if (r.races[0] === r.races[1]) dup++; if (r.rolls.some((x) => x.favPool.length === 0)) fb++; }
  t("1×1 одна любимая на двоих: повторов нет", dup === 0); t("1×1: у второго любимая занята → берёт из остальных", fb > 1500); }
// FFA ≤6: все разные
{ let bad6 = 0; for (let i = 0; i < 500; i++) { const r = await drawRaces("f" + i, [0, 1, 2, 3, 4, 5].map((k) => S(["fire", "ice", "stone"], k))); if (new Set(r.races).size !== 6) bad6++; } t("FFA 6: без повторов", bad6 === 0); }
// FFA 8: минимум повторов — 6 разных, макс по 2
{ let badm = 0; for (let i = 0; i < 500; i++) { const r = await drawRaces("g" + i, Array.from({ length: 8 }, (_, k) => S(["fire"], k))); const c: Record<string, number> = {}; r.races.forEach((x) => c[x] = (c[x] || 0) + 1);
  if (new Set(r.races).size !== 6 || Math.max(...Object.values(c)) > 2) badm++; } t("FFA 8: 6 рас, ≤2 повтора каждой", badm === 0); }
// команды 4×4 (8 игроков): повтор только между разными командами
{ let badt = 0; for (let i = 0; i < 500; i++) { const seats = Array.from({ length: 8 }, (_, k) => S(["ice", "fire"], k % 2)); const r = await drawRaces("h" + i, seats);
  for (let x = 0; x < 8; x++) for (let y = x + 1; y < 8; y++) if (r.races[x] === r.races[y] && seats[x].team === seats[y].team) badt++; } t("4×4: в команде без повторов", badt === 0); }
// 2 команды по 5 (10): внутри команды разные, повторы ≤2
{ let badt = 0; for (let i = 0; i < 300; i++) { const seats = Array.from({ length: 10 }, (_, k) => S([], k < 5 ? 0 : 1)); const r = await drawRaces("k" + i, seats);
  for (const tm of [0, 1]) { const rr = r.races.filter((_, k) => seats[k].team === tm); if (new Set(rr).size !== 5) badt++; } } t("5×5: в команде без повторов", badt === 0); }
// allowed: команда больше числа рас — повтор неизбежен, но не пустой пул
t("allowed: 7 в одной команде не пусто", allowed(Array.from({ length: 7 }, () => S([], 0)), 6, [...RACES, null] as any).length > 0);
// порядок мест по жребию: место 0 не получает любимую чаще места 1 при общей любимой
{ let w0 = 0, w1 = 0; for (let i = 0; i < 2000; i++) { const r = await drawRaces("o" + i, [S(["fire"], 0), S(["fire"], 1)], { fav: 100, other: 0 }); if (r.races[0] === "fire") w0++; if (r.races[1] === "fire") w1++; }
  t(`очерёдность честная ${w0}/${w1}`, Math.abs(w0 - w1) < 200 && w0 + w1 === 2000); }
// проверяемость: из раскрытого seed пересчитывается то же
{ const seats = [S(["stone"], 0), S(["water", "nature"], 1)], r = await drawRaces("audit", seats); t("аудит: пересчёт по seed", JSON.stringify((await drawRaces("audit", seats)).races) === JSON.stringify(r.races)); }
console.log(`racedraw: ${ok} PASS, ${bad} FAIL`); if (bad) process.exit(1);
