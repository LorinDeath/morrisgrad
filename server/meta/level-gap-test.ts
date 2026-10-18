// Правило разницы уровней (урон героя по мобу выше уровнем): +1 → ×0.6, +2 → ×0.08, +3 и выше → ×0.02; ниже/равный — ×1.
// Значения правятся в админке «Спавн» (levelGap.hit1/2/3) и сбрасываются к коду.
// bun server/meta/level-gap-test.ts
import { levelGapHitMult, levelGapDmgMult, LEVEL_GAP } from "./balance";
import { validatePatch, applyOverride, currentValues } from "./overrides";
import { ZONE_GEN } from "./zoneGen";
let f = 0; const ok = (c: any, m: string) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) f++; };
const near = (a: number, b: number) => Math.abs(a - b) < 1e-9;
for (const h of [1, 10, 24]) {
  ok(near(levelGapHitMult(h, h), 1) && near(levelGapHitMult(Math.max(1, h - 3), h), 1), `ур.${h}: равный и ниже — ×1`);
  ok(near(levelGapHitMult(h + 1, h), 0.6), `ур.${h}: +1 — ×0.6`);
  ok(near(levelGapHitMult(h + 2, h), 0.08), `ур.${h}: +2 — ×0.08`);
  ok(near(levelGapHitMult(h + 3, h), 0.02) && near(levelGapHitMult(h + 9, h), 0.02), `ур.${h}: +3 и выше — ×0.02`);
}
ok(ZONE_GEN.levelGap === LEVEL_GAP, "ZONE_GEN.levelGap — тот же объект, что в формуле");
// урон моба по герою (levelGapDmgMult) не менялся
ok(near(levelGapDmgMult(10, 12), Math.pow(0.82, 2)) && near(levelGapDmgMult(5, 30), 0.1), "урон моба по герою выше уровнем — как раньше");
// админка: правка → формула; кривые значения отсекаются; сброс → код
const cv: any = currentValues("spawn", "arinar");
ok(cv["levelGap.hit1"] === 0.6 && cv["levelGap.hit2"] === 0.08 && cv["levelGap.hit3"] === 0.02, "админка «Спавн» показывает levelGap.hit1/2/3");
const p = validatePatch("spawn", "arinar", { ...cv, "levelGap.hit1": 0.5, "levelGap.hit2": 0.1, "levelGap.hit3": 0 });
ok(typeof p !== "string", "правка проходит проверку");
applyOverride("spawn", "arinar", p);
ok(near(levelGapHitMult(11, 10), 0.5) && near(levelGapHitMult(12, 10), 0.1) && near(levelGapHitMult(15, 10), 0), "правка действует сразу");
ok(typeof validatePatch("spawn", "arinar", { "levelGap.hit1": 1.5 }) === "string", "значение > 1 отклоняется");
applyOverride("spawn", "arinar", null);
ok(near(levelGapHitMult(11, 10), 0.6) && near(levelGapHitMult(13, 10), 0.02) && ZONE_GEN.levelGap === LEVEL_GAP, "сброс — значения кода, объект тот же");
// живая правка прода без новых полей (старый набор spawn) не ломает правило
applyOverride("spawn", "arinar", { regenCombat: 0.1 }); ok(near(levelGapHitMult(12, 10), 0.08), "старая правка «Спавн» без levelGap — значения кода"); applyOverride("spawn", "arinar", null);
console.log(f ? `FAILED ${f}` : "ALL PASS"); if (f) process.exit(1);
