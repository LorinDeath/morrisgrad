// Рывок: перезарядка 5 с и неуязвимость 5 кадров (83 мс) — по времени сервера; правка админки (kind dash) с ограничениями.
import { dashTry, DASH_CFG, DASH_LAG_MS, FRAME_MS } from "./dash";
import { validatePatch, applyOverride, TABLES } from "./overrides";
let pass = 0, fail = 0; const ok = (c: any, m: string) => { c ? pass++ : fail++; console.log((c ? "PASS " : "FAIL ") + m); };
ok(DASH_CFG.cd === 5 && DASH_CFG.invulnMs === 83 && Math.round(DASH_CFG.invulnMs / FRAME_MS) === 5, "по умолчанию: 5 с, 83 мс = 5 кадров");
const st: any = {}; const t0 = 1_000_000;
let r = dashTry(st, t0); ok(r.ok && r.invulnUntil === t0 + 83, "первый рывок принят, неуязвим до +83 мс");
ok(!dashTry(st, t0 + 1000).ok, "через 1 с — отказ (перезарядка)");
ok(!dashTry(st, t0 + 5000 - DASH_LAG_MS - 10).ok, "раньше допуска пинга — отказ");
ok(dashTry(st, t0 + 5000 - DASH_LAG_MS + 10).ok, "в пределах допуска пинга — принят");
ok(TABLES.dash.main === DASH_CFG, "админка: kind dash/main = живой конфиг");
ok(typeof validatePatch("dash", "main", { cd: 0.1 }) === "string" || (validatePatch("dash", "main", { cd: 0.1 }) as any).cd >= 0.5, "cd < 0.5 отклонено/зажато");
ok(typeof validatePatch("dash", "main", { invulnMs: 5000 }) === "string" || (validatePatch("dash", "main", { invulnMs: 5000 }) as any).invulnMs <= 1000, "неуязвимость > 1000 мс отклонена/зажата");
const pt = validatePatch("dash", "main", { cd: 3, invulnMs: 50, blink: false }); ok(typeof pt !== "string", "правка принимается " + JSON.stringify(pt));
applyOverride("dash", "main", pt as any); ok(DASH_CFG.cd === 3 && DASH_CFG.invulnMs === 50 && DASH_CFG.blink === false, "правка применилась живьём");
r = dashTry({}, t0); ok(r.invulnUntil === t0 + 50, "новое окно неуязвимости 50 мс");
applyOverride("dash", "main", null); ok(DASH_CFG.cd === 5 && DASH_CFG.invulnMs === 83, "сброс — как в коде");
console.log(`${pass} passed, ${fail} failed`); if (fail) process.exit(1);
