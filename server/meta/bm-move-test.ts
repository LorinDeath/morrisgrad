// ЭТАП 2: движение чёрных мобов из конструктора — рывок, телепорт, тени (событие mmv), скорость; выключатель и множитель в админке.
import { ZONE_MOBS, ITEM_BY_ID } from "./defs";
import { Zone } from "./zone";
import { BM_MOBS, BMM_CFG, registerBlackMobs, mobFinal } from "./blackMobs";
let P = 0, F = 0; const ok = (c: any, m: string) => { if (c) { P++; console.log("PASS " + m); } else { F++; console.log("FAIL " + m); } };
registerBlackMobs(ITEM_BY_ID as any);
const z: any = new Zone("arinar", [], [], { proc: false });
const X = 32640, Y = 24000;
const run = (type: string, tx: number, ranged = false, secs = 3, gap = 0) => { z.events.length = 0; const m = z.addMob(type, X, Y); const d = (ZONE_MOBS as any)[type]; const x0 = m.x; let busy = 0;
  for (let t = 0, now = Date.now(); t < secs; t += 0.05, now += 50) { const dx = (gap ? m.x + gap : tx) - m.x, dist = Math.abs(dx) || 1; if (z.bmMoveStep(m, d, dist, Math.sign(dx), 0, ranged ? 200 : 40, now, 0.05, ranged)) busy++; }
  return { m, ev: z.events.filter((e: any) => e.k === "mmv" && e.id === m.id), moved: m.x - x0, busy }; };
const L = run("bmx_storm_warden", X + 500);
ok(L.ev.some((e: any) => e.t === "dash") && L.moved > 100, `молния (воин): рывок к цели (${L.ev.map((e: any) => e.t).join(",")}, сдвиг ${Math.round(L.moved)})`);
ok(L.ev.every((e: any) => e.g === 4 && e.el === "lightning" && Number.isFinite(e.x0) && Number.isFinite(e.x1) && Number.isFinite(e.x)), "событие mmv: тени 4, стихия, откуда/куда, x/y для зоны видимости");
const Lb = run("bmx_storm_warden", X + 380, false, 1);
ok(Lb.ev.some((e: any) => e.t === "blink"), "молния: телепорт к далёкой цели");
const S = run("bmx_rock_warden", X + 500);
ok(S.ev.length === 0 && S.busy === 0 && !(ZONE_MOBS as any).bmx_rock_warden.bmMove, "камень: без рывков/телепортов (медленный и тяжёлый)");
ok((ZONE_MOBS as any).bmx_storm_warden.speed > (ZONE_MOBS as any).bmx_rock_warden.speed * 1.3, `скорость: молния ${(ZONE_MOBS as any).bmx_storm_warden.speed} > камень ${(ZONE_MOBS as any).bmx_rock_warden.speed}`);
ok(Math.abs((ZONE_MOBS as any).bmx_storm_warden.speed - Math.round(mobFinal(BM_MOBS.bmx_storm_warden, ITEM_BY_ID as any).speed * 1.35)) <= 1, "скорость моба × move.spd");
const R = run("bmx_volt_archer", X + 60, true, 1.5);
ok(R.ev.length > 0 && R.moved < 0, `молния (лучник): отскок от цели вплотную (${R.ev.map((e: any) => e.t).join(",")}, сдвиг ${Math.round(R.moved)})`);
BMM_CFG.moveOn = false; const Off = run("bmx_storm_warden", X + 500); BMM_CFG.moveOn = true;
ok(Off.ev.length === 0 && Off.busy === 0, "админка: «Движение мобов» выкл — только ходьба");
BMM_CFG.moveCdMul = 3; const Slow = run("bmx_storm_warden", 0, false, 20, 300); BMM_CFG.moveCdMul = 1; const Fast = run("bmx_storm_warden", 0, false, 20, 300);
ok(Slow.ev.length < Fast.ev.length, `админка: перезарядка ×3 — реже (${Slow.ev.length} < ${Fast.ev.length})`);
BM_MOBS.bmx_rock_warden.move = { spd: 0.85, dash: { cd: 1000, len: 150, spd: 900 }, ghost: 3 }; registerBlackMobs(ITEM_BY_ID as any);
const S2 = run("bmx_rock_warden", X + 300); ok(S2.ev.some((e: any) => e.t === "dash" && e.g === 3), "конструктор: камню добавили рывок — работает сразу");
console.log(`${P} PASS / ${F} FAIL`); if (F) process.exitCode = 1;
