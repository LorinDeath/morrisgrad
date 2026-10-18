// ОЗ мобов без верхнего предела: админка принимает ОЗ > 1e7 (до Number.MAX_SAFE_INTEGER), произведения множителей
// (проклятие × ярус × элита × вожак × отряд) не уходят за точные целые, панель «Цель» и Бестиарий пишут большие числа читаемо.
// bun server/meta/mob-hp-nocap-test.ts
import { Zone, capHp, enchMul } from "./zone";
import { ZONE_MOBS } from "./defs";
import { ZONE_GEN } from "./zoneGen";
import { CURSE } from "./cursed";
import { validatePatch, applyOverride, SCHEMA } from "./overrides";
import { fmtBig } from "../../src/pages/MorrisCurse/_core/fmtNum.js";
let f = 0; const ok = (c: any, m: string) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) f++; };
ZONE_GEN.cursedPct = 0;
const T = "violet_queen", d: any = ZONE_MOBS[T];
ok(SCHEMA.mob.fields.find((x: any) => x.path === "hp")!.max === Number.MAX_SAFE_INTEGER, "поле ОЗ: максимум — Number.MAX_SAFE_INTEGER");
for (const hp of [2e7, 5e9, 3e12, Number.MAX_SAFE_INTEGER]) { const p: any = validatePatch("mob", T, { hp }); ok(typeof p !== "string" && p.hp === hp, `админка принимает ОЗ ${hp}`); }
ok(typeof validatePatch("mob", T, { hp: Number.MAX_SAFE_INTEGER * 2 }) === "string" && typeof validatePatch("mob", T, { hp: Infinity }) === "string" && typeof validatePatch("mob", T, { hp: 0 }) === "string", "больше точных целых / бесконечность / 0 — отклоняются");
const z: any = new Zone("arinar", [], [], { proc: false });
applyOverride("mob", T, validatePatch("mob", T, { hp: 5e9 }) as any);
const a = z.addMob(T, 1000, 1000, { hpMul: 2.5, special: "boss" });
ok(a.maxHp === 5e9 * 2.5 && a.hp === a.maxHp, `мировой босс 5e9 × отряд 2.5 = ${a.maxHp}`);
const c = z.addMob(T, 1100, 1000); c.cursed = true; c.ench = 6; c.elite = true; c.maxHp = c.hp = z.hpOf(c, 4);
const want = 5e9 * ZONE_GEN.eliteHp * CURSE.mobHp * enchMul(c, "hp") * (1 + ZONE_GEN.bossScalePerPlayer * 3);
ok(c.maxHp === Math.min(Number.MAX_SAFE_INTEGER, Math.round(want)) && Number.isSafeInteger(c.maxHp), `проклятый Чёрный элитный: ${c.maxHp} (без предела ${want.toExponential(2)})`);
applyOverride("mob", T, validatePatch("mob", T, { hp: Number.MAX_SAFE_INTEGER }) as any);
const x = z.addMob(T, 1200, 1000, { hpMul: 2.5, special: "boss" }); x.cursed = true; x.ench = 6; x.maxHp = x.hp = z.hpOf(x, 5);
ok(x.maxHp === Number.MAX_SAFE_INTEGER, "произведение выше точных целых — упирается в MAX_SAFE_INTEGER, а не в Infinity/NaN");
z.syncMobStats(); ok(Number.isSafeInteger(a.maxHp) && Number.isSafeInteger(c.maxHp), "синхронизация живых: ОЗ — точные целые");
ok(capHp(NaN) === 1 && capHp(-5) === 1 && capHp(1e300) === Number.MAX_SAFE_INTEGER, "capHp: NaN/отрицательные → 1, огромные → MAX_SAFE_INTEGER");
ok(JSON.parse(JSON.stringify({ hp: x.maxHp })).hp === Number.MAX_SAFE_INTEGER, "состояние зоны (JSON) передаёт ОЗ без потерь; в ленте мобов — проценты");
applyOverride("mob", T, null);
const fm: [number, string][] = [[1176, "1 176"], [1794143, "1.8 млн"], [16661, "16 661"], [2.5e7, "25 млн"], [5e9, "5 млрд"], [1.25e11, "125 млрд"], [3.4e12, "3.4 трлн"], [Number.MAX_SAFE_INTEGER, "9.0e15"]];
for (const [n, s] of fm) ok(fmtBig(n) === s, `формат ${n} → «${fmtBig(n)}» (ждали «${s}»)`);
console.log(f ? `FAILED ${f}` : "ALL PASS"); if (f) process.exit(1);
