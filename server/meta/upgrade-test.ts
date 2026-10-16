// Улучшение у Петра: стоимость, проклятые ×2 и второй материал, математика статов, капы героя, атомарность, чужие предметы, нехватка, админка
import { newAccount, newHero, upgradeItem, heroEffective } from "./profile";
import { ITEMS } from "./defs";
import { UPG, UPG_ORDER, upgCost, upgStats } from "./upgrade";
import { instStats, cursedStats } from "./cursed";
import { validatePatch, applyOverride } from "./overrides";
import { RESOURCES, STAT_CAPS } from "./shared";
let fail = 0; const ok = (c: boolean, m: string) => { if (!c) fail++; console.log((c ? "PASS " : "FAIL ") + m); };
ok(UPG_ORDER.length === Object.keys(RESOURCES).length && new Set(UPG_ORDER).size === UPG_ORDER.length && UPG.maxLvl === 58, `порядок: ${UPG_ORDER.length} разных материалов, максимум +${UPG.maxLvl}`);
ok(JSON.stringify(upgCost(1, false)) === JSON.stringify({ [UPG_ORDER[0]]: 3 }) && upgCost(10, false)![UPG_ORDER[9]] === 3, "обычная: +N стоит 3 × N-й материал");
{ const c = upgCost(5, true)!; ok(c[UPG_ORDER[4]] === 6 && c[UPG_ORDER[5]] === 6 && Object.keys(c).length === 2, "проклятая: 6 × материал уровня + 6 × следующий " + JSON.stringify(c)); }
{ const c = upgCost(58, true)!; ok(c[UPG_ORDER[57]] === 6 && c[UPG_ORDER[56]] === 6, "проклятая +58: пара — предыдущий материал"); }
ok(upgCost(0, false) === null && upgCost(59, false) === null, "вне диапазона — нет стоимости");
{ const s = upgStats({ hp: 100, armor: 7, regen: 0.3, critPct: 9, dmgMin: 6, dmgMax: 16 }, 10, false);
  ok(s.hp === 130 && s.armor === 9 && s.regen === 0.39 && s.critPct === 12 && s.dmgMin === 8 && s.dmgMax === 21, "обычная +10: плоские +30% от базы, % +3 п.п. " + JSON.stringify(s)); }
{ const s = upgStats({ hp: 150, critPct: 13.5 }, 10, true); ok(s.hp === 203 && s.critPct === 17, "проклятая +10: плоские +35%, % +3.5 п.п. " + JSON.stringify(s)); }
{ const s = upgStats({ hp: 100 }, 2, false); ok(s.hp === 106, "аддитивно (не сложный процент): +2 = +6%"); }
const it0: any = ITEMS.find((i: any) => i.slot === "helmet" && i.stats?.hp && i.stats?.critPct);
const mk = () => { const a: any = newAccount(); a.res = {}; a.inv = [{ uid: "u", id: it0.id, at: 0 }, { uid: "c", id: it0.id, at: 0, cursed: 1 }, { uid: "o", id: it0.id, at: 0, hero: "mage" }]; return a; };
{ const a = mk(); const r: any = upgradeItem(a, "warrior", "u"); ok(!r.ok && /Не хватает/.test(r.err) && !a.inv[0].up, "нехватка материалов: отказ, уровень не изменился — " + r.err); }
{ const a = mk(); a.res[UPG_ORDER[0]] = 5; const r: any = upgradeItem(a, "warrior", "u");
  ok(r.ok && a.inv[0].up === 1 && a.res[UPG_ORDER[0]] === 2, "успех: +1, списано ровно 3 (100%, без провалов)");
  ok(!upgradeItem(a, "warrior", "u").ok && a.res[UPG_ORDER[0]] === 2, "второй раз без материала +2 — отказ, ничего не списано"); }
{ const a = mk(); a.res[UPG_ORDER[0]] = 6; a.res[UPG_ORDER[1]] = 5; const r: any = upgradeItem(a, "warrior", "c");
  ok(!r.ok && a.res[UPG_ORDER[0]] === 6 && a.res[UPG_ORDER[1]] === 5, "проклятая: не хватает второго — атомарно, ничего не списано");
  a.res[UPG_ORDER[1]] = 6; ok(upgradeItem(a, "warrior", "c").ok && !a.res[UPG_ORDER[0]] && !a.res[UPG_ORDER[1]] && a.inv[1].up === 1, "проклятая: списано 6 + 6"); }
{ const a = mk(); for (const r of UPG_ORDER) a.res[r] = 999; ok(!upgradeItem(a, "warrior", "o").ok, "чужой предмет (другого героя) — отказ"); ok(!upgradeItem(a, "warrior", "zz").ok, "нет предмета — отказ");
  ok(!upgradeItem(a, "warrior", "u", 3).ok, "устаревший уровень от клиента (at) — отказ");
  for (let i = 0; i < 58; i++) upgradeItem(a, "warrior", "u"); ok(a.inv[0].up === 58 && !upgradeItem(a, "warrior", "u").ok, "максимум +58, дальше — отказ");
  const st = instStats(it0, a.inv[0]); ok(st.hp === Math.round(it0.stats.hp * (1 + 58 * 0.03)), `instStats учитывает +58: hp ${it0.stats.hp} → ${st.hp}`);
  const cst = instStats(it0, { cursed: 1, up: 4 }); ok(cst.hp === Math.round(cursedStats(it0.stats).hp * 1.14), "проклятый +4: от проклятой базы ×1.14");
  const h: any = newHero("warrior"); h.lvl = 60; h.equip = { helmet: "u" };
  const e: any = heroEffective(a, h, "warrior", { maxHp: 100, armor: 0, minAtk: 1, maxAtk: 2 }); ok(e.critPct <= STAT_CAPS.critPct, `кап героя соблюдён: крит ${e.critPct} ≤ ${STAT_CAPS.critPct}`); }
{ const v = validatePatch("upgrade", "main", { cost: 5, flatPct: 4, "order.0": UPG_ORDER[1], "order.1": UPG_ORDER[0], "costs.2": 9 }); ok(typeof v !== "string", "админка: валидный патч " + JSON.stringify(v));
  applyOverride("upgrade", "main", v); ok(JSON.stringify(upgCost(1, false)) === JSON.stringify({ [UPG_ORDER[1]]: 5 }) && upgCost(3, false)![UPG_ORDER[2]] === 9 && upgStats({ hp: 100 }, 1, false).hp === 104, "админка: материал/кол-во/прибавка применяются живьём");
  ok(typeof validatePatch("upgrade", "main", { "order.0": "nope" }) === "string" && typeof validatePatch("upgrade", "main", { maxLvl: 99 }) === "string", "админка: неизвестный материал и уровень > 58 отклонены");
  applyOverride("upgrade", "main", null); ok(JSON.stringify(upgCost(1, false)) === JSON.stringify({ [UPG_ORDER[0]]: 3 }), "сброс — по умолчанию"); }
if (fail) { console.log(fail + " FAIL"); process.exit(1); } console.log("upgrade ok");
