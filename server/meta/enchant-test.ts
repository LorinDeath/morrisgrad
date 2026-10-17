// «Зачарованные»: появление мобов по ярусам, множители ОЗ/урона/брони/опыта, регенерация в бою, дроп своего и младших ярусов,
// проклятые + зачарованные (сложение), улучшение у Петра (% и материалы), админка «✦ Зачарование» (проверка сервером).
// bun server/meta/enchant-test.ts
import { Zone, mobDmgMul, mobArmorMul, mobEffStats, enchMul, isKiller, type ZPlayer } from "./zone";
import { ZONE_MOBS, ITEMS, MONSTER_LOOT } from "./defs";
import { CURSE, cursedStats, instStats } from "./cursed";
import { ENCH, ENCH_N, parseTag, tagOf, enchStats, rollMobTier, mobRegenPct, weightedTier } from "./enchant";
import { validatePatch, applyOverride, currentValues } from "./overrides";
import { ZONE_GEN } from "./zoneGen";
import { newAccount, addItem, rollMonsterLoot, campRoll, enchDropMult } from "./profile";
import { UPG, UPG_ORDER, upgCost, upgStats } from "./upgrade";
import { killXp } from "./balance";
import { Roles } from "./roles";
let f = 0, pass = 0; const ok = (c: any, m: string) => { console.log((c ? "PASS " : "FAIL ") + m); c ? pass++ : f++; };
const near = (a: number, b: number, eps = 1e-6) => Math.abs(a - b) <= eps * Math.max(1, Math.abs(b));
const P = (sid: string, x: number, y: number): ZPlayer => ({ sid, x, y, hp: 1e9, maxHp: 1e9, armorRed: 0, alive: true, respawnAt: 0 } as any);
const pct0 = ZONE_GEN.cursedPct;
const small = Object.keys(ZONE_MOBS).find((k) => !ZONE_MOBS[k].boss && ZONE_MOBS[k].size === "s" && ZONE_MOBS[k].armor > 0)!;
const boss = ZONE_MOBS.ice_swarm_mother ? "ice_swarm_mother" : Object.keys(ZONE_MOBS).find((k) => ZONE_MOBS[k].boss)!;
const D = (t: string): any => ZONE_MOBS[t];
// ---------- 1) появление ----------
{ ZONE_GEN.cursedPct = 0;
  const z: any = new Zone("arinar", [], [], { proc: false }); const N = 60000, cnt = Array(ENCH_N + 1).fill(0);
  for (let i = 0; i < N; i++) cnt[z.addMob(small, 500, 500, {}).ench || 0]++;
  z.mobs.length = 0;
  // броски от старшего к младшему: P(n) = p_n × Π(1 − p_k), k > n
  const exp = ENCH.tiers.map((t, i) => (t.spawnPct / 100) * ENCH.tiers.slice(i + 1).reduce((s, q) => s * (1 - q.spawnPct / 100), 1));
  const got = cnt.slice(1).map((c) => c / N);
  ok(got.every((g, i) => Math.abs(g - exp[i]) < Math.max(0.0012, exp[i] * 0.25)), `доли ярусов ${got.map((g) => (g * 100).toFixed(2)).join("/")}% ≈ ${exp.map((e) => (e * 100).toFixed(2)).join("/")}% (6/3/1.5/0.6/0.2/0.05)`);
  ok(ENCH.tiers.map((t) => t.spawnPct).join() === "6,3,1.5,0.6,0.2,0.05", "шансы по умолчанию 6 / 3 / 1.5 / 0.6 / 0.2 / 0.05 %");
  // боссы: могут быть зачарованы (и Чёрным), флажок яруса «может быть боссом»
  const all = (rnd: number) => rollMobTier(() => rnd, { boss: true });
  ok(all(0) === 6, "босс может быть Чёрным (по умолчанию)");
  ENCH.tiers[5].boss = false; ok(all(0) === 5, "флажок «боссом нельзя» у Чёрного — босс получает младший ярус"); ok(rollMobTier(() => 0, {}) === 6, "обычный моб — по-прежнему Чёрный"); ENCH.tiers[5].boss = true;
  ENCH.on = false; ok(rollMobTier(() => 0) === 0, "выкл — зачарованных нет"); ENCH.on = true;
  // проклятый: только доп. шанс comboPct
  ZONE_GEN.cursedPct = 100; const zc: any = new Zone("arinar", [], [], { proc: false });
  const cm = Array.from({ length: 4000 }, () => zc.addMob(small, 500, 500, {})); const ce = cm.filter((m: any) => m.ench).length;
  ok(cm.every((m: any) => m.cursed) && ce <= 20, `проклятые: зачарованы ${ce} из 4000 (доп. шанс ${ENCH.comboPct}%)`);
  ENCH.comboPct = 100; const cm2 = Array.from({ length: 300 }, () => zc.addMob(small, 500, 500, {}));
  ok(cm2.every((m: any) => m.cursed && m.ench >= 1), "comboPct 100% — каждый проклятый ещё и зачарован (сложение)");
  const hist = [0, 0, 0, 0, 0, 0, 0]; for (let i = 0; i < 20000; i++) hist[weightedTier(i / 20000)]++;
  ok(hist[1] > hist[2] && hist[2] > hist[3] && hist[5] > hist[6] && hist[6] > 0, `ярус доп. шанса — по весам: ${hist.slice(1).join("/")}`);
  ENCH.comboPct = 0.1; ZONE_GEN.cursedPct = pct0; }
// ---------- 2) множители ----------
applyOverride("curse", "main", validatePatch("curse", "main", { mobHp: 20, mobDmg: 20, mobArmor: 20, mobXp: 4 }) as any); // живые значения прода
{ ZONE_GEN.cursedPct = 0; ENCH.on = false;
  const z: any = new Zone("arinar", [], [], { proc: false });
  const exp: [number, number, number, number][] = [[1.5, 1.2, 1.2, 1.5], [2.5, 1.5, 1.4, 2], [4, 2, 2, 2.5], [7, 3, 3, 3], [12, 6, 6, 3.5], [40, 40, 8, 8]];
  for (let n = 1; n <= 6; n++) {
    const m = z.addMob(boss, 3000, 3000, { special: "boss" }); m.ench = n; m.maxHp = m.hp = z.hpOf(m);
    const [h, dm, ar, xp] = exp[n - 1], d = D(boss);
    ok(m.maxHp === Math.round(d.hp * h) && near(mobDmgMul(m, false), dm) && near(mobArmorMul(m), ar) && near(enchMul(m, "xp"), xp),
      `${ENCH.tiers[n - 1].name}: ОЗ ×${h} (${m.maxHp}), урон ×${dm}, броня ×${ar}, опыт ×${xp}`);
  }
  // появление через addMob: ОЗ сразу с ярусом
  ENCH.on = true; const sv = ENCH.tiers.map((t) => t.spawnPct); ENCH.tiers.forEach((t, i) => (t.spawnPct = i === 3 ? 100 : 0));
  const m4 = z.addMob(small, 3000, 3000, {}); ok(m4.ench === 4 && m4.maxHp === Math.round(D(small).hp * 7), `addMob: Легендарный сразу ×7 ОЗ (${m4.maxHp})`);
  ENCH.tiers.forEach((t, i) => (t.spawnPct = sv[i])); ENCH.on = false;
  // проклятый + ярус: множители перемножаются
  const cb = z.addMob(boss, 3000, 3000, { special: "boss" }); cb.cursed = true; cb.ench = 5; cb.maxHp = cb.hp = z.hpOf(cb);
  ok(cb.maxHp === Math.round(D(boss).hp * 20 * 12) && near(mobDmgMul(cb, false), 20 * 6) && near(mobArmorMul(cb), 20 * 6), `проклятый Божественный: ОЗ ×240, урон ×120, броня ×120`);
  const st = mobEffStats(cb); ok(near(st.armor, Math.round(D(boss).armor * 120 * 10) / 10) && near(st.dmg, Math.round(D(boss).dmg * 120 * 10) / 10), `панель «Цель»: броня ${st.armor}, урон ${st.dmg}`);
  // серия босса и обычный удар — с ярусом
  const pm = new Map<string, ZPlayer>([["p", P("p", 3150, 3000)]]); const b0 = z.addMob(boss, 3000, 3000, { special: "boss" }), b6 = z.addMob(boss, 3000, 3000, { special: "boss" }); b6.ench = 6;
  const ser = (m: any) => { m.casts = []; m.patIdx = 0; z.bossPattern(m, D(boss), pm.get("p"), pm, Date.now()); return m.casts[0].dmg; };
  ok(near(ser(b6) / ser(b0), 40), "серия босса Чёрного: урон ×40");
  // броня режет удар героя
  const real = z.damage(Object.assign(b6, { hp: 1e12, maxHp: 1e12 }), "p", 5000, () => {}); ok(real === Math.max(250, 5000 - D(boss).armor * 8), `удар 5000 по броне Чёрного ${D(boss).armor}×8: прошло ${real}`);
  // Чёрный — убийца: скорость/рывок/агрессия как у проклятого, навыки 3–6
  ok(isKiller(b6) && !isKiller(b0) && !isKiller(Object.assign(z.addMob(small, 1, 1, {}), { ench: 5 })), "Чёрный — «убийца», Божественный — нет");
  const sk = Array.from({ length: 200 }, () => { const m = z.addMob(small, 500, 500, {}); m.ench = 6; z.rollSkills(m); return m.skills.length; });
  ok(Math.min(...sk) >= 3 && Math.max(...sk) <= 6 && Math.max(...sk) >= 5, `Чёрный обычный моб: навыков ${Math.min(...sk)}–${Math.max(...sk)} (3–6)`);
  ok(killXp({ xp: 10, mobL: 5, heroL: 5, enchXp: 8 }) === Math.round(killXp({ xp: 10, mobL: 5, heroL: 5 }) * 8) || killXp({ xp: 10, mobL: 5, heroL: 5, enchXp: 8 }) >= killXp({ xp: 10, mobL: 5, heroL: 5 }) * 7.9, "опыт Чёрного ×8 (после потолка проклятых)");
  ENCH.on = true; ZONE_GEN.cursedPct = pct0; }
// ---------- 3) регенерация в бою ----------
{ ok(mobRegenPct({ ench: 1 }) === 0.1 && mobRegenPct({ ench: 4 }) === 0.1 && mobRegenPct({ ench: 5 }) === 1 && mobRegenPct({ ench: 6 }) === 1 && mobRegenPct({ cursed: true }) === 1 && mobRegenPct({}) === 0, "реген: ярусы 1–4 — 0.1%/с, Божественный/Чёрный/проклятый — 1%/с, обычный — 0");
  ZONE_GEN.cursedPct = 0; ENCH.on = false;
  const z: any = new Zone("arinar", [], [], { proc: false });
  const mk = (e: number, cursed = false, special = "") => { const m = z.addMob(special ? boss : small, 5000, 5000, { special }); m.ench = e; m.cursed = cursed; m.maxHp = 1e6; m.hp = 5e5; return m; };
  const ms = [mk(1), mk(5), mk(0, true), mk(0), mk(6, false, "boss")];
  const pm = new Map<string, ZPlayer>([["p", P("p", 5000, 5000)]]); for (const m of ms) { m.targetSid = "p"; } // в бою (цель — игрок рядом)
  const now = Date.now(); for (let i = 0; i < 10; i++) { z.update(0.1, now + i * 100, pm, () => {}, () => {}); pm.get("p")!.hp = 1e9; for (const m of ms) m.reset = false; }
  const dh = ms.map((m) => Math.round(m.hp - 5e5));
  ok(Math.abs(dh[0] - 1000) <= 2 && Math.abs(dh[1] - 10000) <= 20 && Math.abs(dh[2] - 10000) <= 20 && dh[3] === 0 && Math.abs(dh[4] - 10000) <= 20, `за 1 с боя: Необычный +${dh[0]} (0.1%), Божественный +${dh[1]}, проклятый +${dh[2]} (1%), обычный +${dh[3]}, мировой Чёрный +${dh[4]}`);
  applyOverride("ench", "main", validatePatch("ench", "main", { cursedRegen: 2, "tiers.0.regen": 0.5 }) as any);
  ok(mobRegenPct({ cursed: true }) === 2 && mobRegenPct({ ench: 1 }) === 0.5, "реген правится в админке"); applyOverride("ench", "main", null);
  ENCH.on = true; ZONE_GEN.cursedPct = pct0; }
// ---------- 4) дроп: свой ярус и младшие ----------
const W: any = (ITEMS as any[]).find((i) => i.slot === "weapon")!;
const seq = (xs: number[]) => { let i = 0; return () => xs[i++ % xs.length]; };
(MONSTER_LOOT as any).__e = { gear: [{ item: W.id, chance: 3 }], materials: [] };
{ // raw: шанс строки 3%; Легендарный 0.4 → 1.2%, Странный 0.6 → 1.8%, Редкий 0.8 → 2.4%, Необычный 1 → 3%
  let r = rollMonsterLoot("__e", seq([0.9, 0.011]), 1, false, "raw", 4); ok(r.items.length === 1 && r.items[0] === W.id + "@e4", `Легендарный: копия своего яруса (${r.items})`);
  r = rollMonsterLoot("__e", seq([0.9, 0.013, 0.017]), 1, false, "raw", 4); ok(r.items[0] === W.id + "@e3", "мимо своего — младший ярус (Странный)");
  r = rollMonsterLoot("__e", seq([0.9, 0.5, 0.5, 0.023]), 1, false, "raw", 4); ok(r.items[0] === W.id + "@e2", "… и ещё младше (Редкий)");
  r = rollMonsterLoot("__e", seq([0.9, 0.5, 0.5, 0.5, 0.5]), 1, false, "raw", 4); ok(!r.items.length, "все мимо — без копии");
  r = rollMonsterLoot("__e", seq([0.01, 0.011]), 1, false, "raw", 4); ok(r.items.length === 2 && r.items.includes(W.id) && r.items.includes(W.id + "@e4"), "обычная и копия — независимые броски");
  ENCH.dropLower = false; r = rollMonsterLoot("__e", seq([0.9, 0.013, 0.017]), 1, false, "raw", 4); ok(!r.items.length, "«и младших» выкл — только свой ярус"); ENCH.dropLower = true;
  let n2 = 0; for (let i = 0; i < 40000; i++) if (rollMonsterLoot("__e", Math.random, 1, false, "raw", 1).items.some((x) => x.endsWith("@e1"))) n2++;
  ok(Math.abs(n2 / 40000 - 0.03) < 0.006, `Необычный: копия ≈ 3% × 1 (${(n2 / 400).toFixed(2)}%)`);
  ok(enchDropMult(5) === 4 && enchDropMult(0) === 1, "обычный дроп Божественного ×4");
  let c = campRoll({ lootKey: "__e", elite: false, cursed: false, boss: false, ench: 6 } as any, seq([0.9, 0.0044])); ok(c.items[0] === W.id + "@e6", "сундук лагеря (campRoll): копия Чёрного");
  // проклятая копия + доп. шанс зачарования
  ENCH.comboPct = 100; r = rollMonsterLoot("__e", seq([0.9, 0.001, 0.0, 0.5]), 1, true, "raw"); const t = parseTag(r.items[0] || "");
  ok(t.c && t.e >= 1 && t.id === W.id, `проклятая копия ещё и зачарована: ${r.items[0]}`); ENCH.comboPct = 0.1;
  delete (MONSTER_LOOT as any).__e; }
// ---------- 5) вещи: статы, теги, сложение ----------
{ const it: any = (ITEMS as any[]).find((i) => i.slot === "helmet" && i.stats?.hp && i.stats?.critPct)!;
  const a: any = newAccount(); a.hero = "warrior";
  const x = addItem(a, it.id + "@e3@c", "t")!; ok(x.cursed === 1 && x.ench === 3 && x.id === it.id, "тег @e3@c → проклятая Странная (флаги экземпляра)");
  ok(addItem(a, it.id + "@c@e6", "t")!.ench === 6, "порядок суффиксов не важен");
  const res = Object.keys((MONSTER_LOOT as any)[Object.keys(MONSTER_LOOT)[0]].materials?.[0] || {}).length; void res;
  const s3 = instStats(it, { ench: 3 }), sc3 = instStats(it, { cursed: 1, ench: 3 });
  ok(s3.hp === Math.round(it.stats.hp * 2) && near(s3.critPct, Math.round(it.stats.critPct * 2 * 10) / 10), `Странная ×2: hp ${it.stats.hp} → ${s3.hp}, крит ${it.stats.critPct} → ${s3.critPct} (плоские и %)`);
  ok(JSON.stringify(sc3) === JSON.stringify(enchStats(cursedStats(it.stats), 3)), "проклятая Странная: × проклятие × ярус");
  ok(instStats(it, { ench: 6 }).hp === Math.round(it.stats.hp * 10), "Чёрная ×10");
  ok(ENCH.tiers.map((t) => t.stat).join() === "1.5,1.8,2,3,4,10", "статы ярусов 1.5/1.8/2/3/4/10");
  ok(!addItem(a, "soul_shard@e3", "t") || !(a.inv[a.inv.length - 1] as any).ench, "не экипировка — без яруса");
  ok(!addItem(a, it.id, "t", a.hero, false, 9)!.ench, "ярус вне 1…6 — отброшен");
  ok(tagOf("x", true, 2) === "x@e2@c" && parseTag("x@e2@c").e === 2 && parseTag("x@e2").c === false && parseTag("x").e === 0, "теги броска"); }
// ---------- 6) улучшение у Петра ----------
{ const b = { hp: 1000, critPct: 10, armor: 50 };
  const s = upgStats(b, 10, false, UPG, 4); ok(s.hp === 1120 && s.armor === 56 && near(s.critPct, 11.2), `Легендарная +10: +1.2%/ур. ко всем статам (вместо обычного): ${JSON.stringify(s)}`);
  const s6 = upgStats(b, 10, false, UPG, 6); ok(s6.hp === 1500 && near(s6.critPct, 15), "Чёрная +10: +5%/ур. → +50%");
  ok(ENCH.tiers.map((t) => t.upPct).join() === "0.2,0.4,0.7,1.2,2,5", "прирост ярусов 0.2/0.4/0.7/1.2/2/5 %");
  const sc = upgStats(b, 10, true, UPG, 1); ok(sc.hp === Math.round(1000 * (1 + 10 * (UPG.cFlatPct + 0.2) / 100)), "проклятая Необычная: проклятый прирост + прирост яруса");
  const n0 = upgCost(1, false)![UPG_ORDER[0]];
  ok(ENCH.tiers.map((t, i) => upgCost(1, false, UPG, i + 1)![UPG_ORDER[0]] / n0).join() === "2,4,8,16,32,64", "материалы: обычная ×1, ярусы ×2 … Чёрная ×64");
  const cc = upgCost(1, true, UPG, 3)!; ok(cc[UPG_ORDER[0]] === n0 * (UPG.cursedMult + 8) && cc[UPG_ORDER[1]] === n0 * (UPG.cursedMult + 8), `проклятая Странная: материалов ×(${UPG.cursedMult}+8), второй материал — тоже`);
  ok(JSON.stringify(upgCost(1, true)) === JSON.stringify({ [UPG_ORDER[0]]: n0 * UPG.cursedMult, [UPG_ORDER[1]]: n0 * UPG.cursedMult }), "проклятая без яруса — как было");
  ok(upgStats(b, 10, false).hp === Math.round(1000 * (1 + 10 * UPG.flatPct / 100)), "обычная — как было"); }
// ---------- 7) админка ----------
{ const v = validatePatch("ench", "main", { "tiers.5.mobArmor": 12, "tiers.0.color": "#00FF00", "tiers.2.name": "Чудной", comboPct: 0.5, on: true });
  ok(typeof v !== "string", "правка ярусов принимается"); applyOverride("ench", "main", v as any);
  ok(ENCH.tiers[5].mobArmor === 12 && ENCH.tiers[0].color === "#00ff00" && ENCH.tiers[2].name === "Чудной" && ENCH.comboPct === 0.5, "правка действует живьём");
  ok(currentValues("ench", "main")!["tiers.5.mobArmor"] === 12, "текущие значения для админки");
  applyOverride("ench", "main", null); ok(ENCH.tiers[5].mobArmor === 8 && ENCH.tiers[2].name === "Странный" && ENCH.comboPct === 0.1, "сброс — как в коде");
  ok(typeof validatePatch("ench", "main", { "tiers.1.skMin": 5, "tiers.1.skMax": 2 }) === "string", "навыков «от» > «до» — отклонено");
  ok(typeof validatePatch("ench", "main", { "tiers.0.color": "red" }) === "string", "цвет не #rrggbb — отклонён");
  ok(typeof validatePatch("ench", "main", { "tiers.0.stat": 0.5 }) === "string" && typeof validatePatch("ench", "main", { "tiers.0.spawnPct": 101 }) === "string", "числа вне диапазона — отклонены");
  ok(typeof validatePatch("ench", "main", { "tiers.6.stat": 2 }) === "string" && typeof validatePatch("ench", "main", { evil: 1 }) === "string", "чужие поля — отклонены");
  ok(typeof validatePatch("ench", "main", { "tiers.0.name": "<b>x" }) !== "string" && (validatePatch("ench", "main", { "tiers.0.name": "<b>x" }) as any)["tiers.0.name"] === "bx", "имя — без разметки");
  const c = validatePatch("curse", "main", { cursedPct: 25 }); ok(typeof c !== "string", "«☠ Проклятие»: шанс проклятого моба правится");
  applyOverride("curse", "main", c as any); ok(ZONE_GEN.cursedPct === 25 && (CURSE as any).cursedPct === 25, "шанс проклятого 25% действует в зоне"); applyOverride("curse", "main", null); ok(ZONE_GEN.cursedPct === 10, "сброс — 10%");
  const r: any = new Roles(null as any); r.loaded = true; r.loadedAt = Date.now(); r.map.set("uid:mod", "moderator"); r.map.set("uid:adm", "admin");
  ok(!r.canAdminWrite({ pkey: "uid:mod", verified: true }, "ench") && r.canAdminWrite({ pkey: "uid:adm", verified: true }, "ench"), "вкладка — только админ (модератору нельзя)"); }
applyOverride("curse", "main", null); ZONE_GEN.cursedPct = pct0;
console.log(f ? `FAILED ${f}` : `enchant ok (${pass})`); if (f) process.exit(1);
