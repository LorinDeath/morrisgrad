// Закрепление: одиночный разбор отклонён, массовый пропускает закреплённые и считает верно, квест не съедает закреплённое
import { newAccount, newHero, salvage, salvagePreview, salvageMany, setLock } from "./profile";
import { ITEMS } from "./defs";
import { fmtPct, cleanNum } from "../../src/pages/MorrisCurse/_core/ui/fmtPct.js";
import { diffStats } from "../../src/pages/MorrisCurse/_core/ui/itemCompare.js";
let fail = 0; const ok = (c: boolean, m: string) => { if (!c) fail++; console.log((c ? "PASS " : "FAIL ") + m); };
const rare = ITEMS.filter((i: any) => i.rarity === "rare" && i.slot !== "weapon");
const h = newHero("warrior");
const mk = () => { const a: any = newAccount(); a.res = {}; a.inv = rare.slice(0, 4).map((it: any, k: number) => ({ uid: "u" + k, id: it.id, at: 0 })); return a; };
{ const a = mk(); ok(setLock(a, "warrior", "u0", true).ok && a.inv[0].lk === 1, "закрепить");
  const r: any = salvage(a, [h], "u0"); ok(!r.ok && a.inv.length === 4 && !(a.res.soul_shard), "одиночный разбор закреплённого отклонён: " + r.err);
  ok(setLock(a, "warrior", "u0", false).ok && !a.inv[0].lk, "открепить"); ok(salvage(a, [h], "u0").ok && a.inv.length === 3, "после открепления — разбирается"); }
{ const a = mk(); setLock(a, "warrior", "u1", true); setLock(a, "warrior", "u2", true);
  const p = salvagePreview(a, [h], "warrior", "rare");
  ok(p.uids.length === 2 && !p.uids.includes("u1") && !p.uids.includes("u2") && p.res.soul_shard === 4, `превью: закреплённые не считаются (${p.uids.length} шт, ${JSON.stringify(p.res)})`);
  const m: any = salvageMany(a, [h], "warrior", "rare", ["u0", "u1", "u2", "u3"]); // клиент подсунул закреплённые
  ok(m.ok && m.n === 2 && a.res.soul_shard === 4 && a.inv.map((i: any) => i.uid).sort().join() === "u1,u2", `массовый: разобрано ${m.n}, закреплённые остались`);
  ok(!salvageMany(a, [h], "warrior", "rare", ["u1", "u2"]).ok, "массовый только из закреплённых — «Нечего разбирать»"); }
{ const a = mk(); a.inv[0].hero = "mage"; ok(!setLock(a, "warrior", "u0", true).ok, "чужой предмет не закрепить"); ok(!setLock(a, "warrior", "zz", true).ok, "нет предмета"); }
{ const d = diffStats({ dmgMin: 4, dmgMax: 8, hp: 10, critPct: 3 }, { dmgMin: 2, dmgMax: 4, hp: 15, armor: 5 });
  const by = Object.fromEntries(d.map((r: any) => [r.k, r]));
  ok(by.dmg.d === 3 && by.hp.d === -5 && by.critPct.kind === "new" && by.armor.kind === "lost" && by.armor.d === -5, "сравнение: ▲урон ▼hp, новое/потеря " + JSON.stringify(d));
  ok(diffStats({ hp: 15 }, {}).every((r: any) => r.kind === "new"), "пустой слот — всё прибавка");
  ok(diffStats({ hp: 22.5 }, { hp: 15 })[0].d === 7.5, "проклятые статы (×1.5) сравниваются как есть"); }
{ const c: any = [[0.35000000000000003, "0.35"], [0.0014, "0.0014"], [0.014000000000000002, "0.014"], [12.3456, "12.3"], [100, "100"], [5, "5"], [0, "0"], [0.000014, "0.000014"]];
  for (const [v, e] of c) ok(fmtPct(v) === e, `fmtPct(${v}) = ${fmtPct(v)} (ожидалось ${e})`);
  ok(cleanNum(0.35000000000000003) === 0.35, "cleanNum для поля админки"); }
if (fail) { console.log(fail + " FAIL"); process.exit(1); } console.log("item-lock ok");
