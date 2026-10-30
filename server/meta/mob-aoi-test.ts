// t1054u: мобы в zone_state — до края мини-карты (MOB_AOI 648 вместо OPEN_AOI 528); события/узлы — по-прежнему OPEN_AOI.
// Замер до/после: число мобов, байты JSON zone_state, мкс на state() — по точкам у лагерей Аринара. Запуск: cd server && bun meta/mob-aoi-test.ts
import { ITEM_BY_ID, ZONE_NODES, ZONE_MOBS } from "./defs";
import { ZONE_GEN } from "./zoneGen";
import { registerBlackMobs } from "./blackMobs";
import { Zone } from "./zone";
import { OPEN_AOI, MOB_AOI, PLAYER_AOI, VIEW_CELLS, CELL_PX } from "../worlds/sizes";
registerBlackMobs(ITEM_BY_ID as any);
let pass = 0, fail = 0; const ok = (c: any, m: string, x?: any) => { if (c) pass++; else fail++; console.log((c ? "PASS " : "FAIL ") + m + (x !== undefined ? " " + JSON.stringify(x) : "")); };
const MM = (VIEW_CELLS.max * 1.3 * CELL_PX) / 2; // MINIMAP_MARGIN 1.3 (minimap.js) → ±624
ok(MOB_AOI >= MM && MOB_AOI === PLAYER_AOI && OPEN_AOI === 528, "MOB_AOI покрывает мини-карту", { MOB_AOI, MM, OPEN_AOI });
const z: any = new Zone("arinar", [], ZONE_NODES, { proc: true, seed: ZONE_GEN.seed });
// моб у края мини-карты (600 px по x) — виден с MOB_AOI, не виден со старым
{ const c = z.camps.find((c: any) => !z.safeAt(c.x, c.y, 2000)); const px = c.x + 5000, py = c.y + 5000; for (const m of z.near(px, py, 2000)) { m.dead = true; }
  const m = z.addMob(Object.keys(ZONE_MOBS)[0], px + 600, py - 590, { fixed: true });
  const ids = (s: any) => { const r = []; for (let i = 0; i < s.m.length; i += 6) r.push(s.m[i]); return r; };
  ok(!ids(z.state(px, py, [], OPEN_AOI, "k")).includes(m.id), "до: моб на 600 px пропадал");
  ok(ids(z.state(px, py, [], OPEN_AOI, "k", MOB_AOI)).includes(m.id), "после: моб на 600 px виден");
  const ev = [{ k: "x", x: px + 760, y: py }, { k: "phit" }];
  ok(z.state(px, py, ev, OPEN_AOI, "k", MOB_AOI).ev.length === 1, "события — по-прежнему по OPEN_AOI (760 px отрезано)");
  m.dead = true; }
// замер у лагерей
const pts = z.camps.filter((c: any) => !z.safeAt(c.x, c.y, 600)).slice(0, 60).map((c: any) => [c.x + 150, c.y + 100]);
const meas = (mob: number) => { let n = 0, bytes = 0; const t0 = performance.now(); const R = 200;
  for (let r = 0; r < R; r++) for (const [x, y] of pts) { const s = z.state(x, y, [], OPEN_AOI, "k", mob); if (r === 0) { n += s.m.length / 6; bytes += JSON.stringify({ type: "zone_state", ...s }).length; } }
  return { mobs: +(n / pts.length).toFixed(1), bytes: Math.round(bytes / pts.length), us: +(((performance.now() - t0) * 1000) / (R * pts.length)).toFixed(1) }; };
meas(MOB_AOI); // прогрев
const a = meas(OPEN_AOI), b = meas(MOB_AOI);
console.log("точек:", pts.length, "до (528):", JSON.stringify(a), "после (648):", JSON.stringify(b), `Δбайт ${b.bytes - a.bytes} (+${Math.round((b.bytes / a.bytes - 1) * 100)}%), Δмкс ${(b.us - a.us).toFixed(1)}`);
ok(b.mobs >= a.mobs && b.us < 200, "state() дёшев и после", { a, b });
console.log(`mob-aoi ${pass} PASS / ${fail} FAIL`); process.exit(fail ? 1 : 0);
