// Непроходимая вода/лава (liquid.ts + propCollision.ts): сервер-авторитетно по типу тайла, клиент — тот же модуль.
// Проверки: середина пруда закрыта, берег проходим, выталкивание на сушу (скольжение и «вынос» из середины),
// выключатель админки, и что ни одна ключевая точка (спавны, NPC, порталы, лагеря, узлы сбора, точки мобов) не в жидкости.
import { liquidAt, inLiquid, resolveLiquid } from "./liquid";
import { resolveWorld, blockedWorld } from "./propCollision";
import { TERRAIN_CFG } from "./terrainCfg";
import { layoutWorld, CELL, MARGIN } from "./worldLayout";
import { arinarPlan } from "./arinarLayout";
import { NPCS, ZONE_RESPAWN } from "./shared";
import { WORLD_PORTALS, HOME_PORTAL_HUB } from "../worlds/portals";
import { ZONE_SPAWNS, HUB_SPAWNS } from "./defs";
import { genNodes, WORLD_GEN, WET } from "./zoneGen";
import { wetNear } from "./liquid";
WET.f = wetNear;
let fail = 0, pass = 0; const ok = (c: any, m: string) => { if (c) pass++; else fail++; console.log((c ? "ok   " : "FAIL ") + m); };

// пруд Поляны: клетка воды, у которой все 8 соседей — вода (середина)
const L: any = layoutWorld("hellfire"); let mid: any = null, shore: any = null;
for (let j = 1; j < L.N - 1 && !mid; j++) for (let i = 1; i < L.N - 1; i++) {
  const b = (di: number, dj: number) => L.biome[(j + dj) * L.N + i + di];
  if (b(0, 0) !== "water") continue;
  const all = [-1, 0, 1].every((dj) => [-1, 0, 1].every((di) => b(di, dj) === "water"));
  if (all && !mid) mid = { x: (i - MARGIN + 0.5) * CELL, y: (j - MARGIN + 0.5) * CELL };
  if (!shore && b(0, -1) !== "water") shore = { x: (i - MARGIN + 0.5) * CELL, y: (j - MARGIN) * CELL };
}
ok(mid && shore, `Поляна: есть пруд (середина ${mid && Math.round(mid.x)},${mid && Math.round(mid.y)})`);
ok(liquidAt("hellfire", mid.x, mid.y) === 1 && inLiquid("hellfire", mid.x, mid.y), "середина пруда — вода, непроходима");
ok(blockedWorld("hellfire", mid.x, mid.y), "blockedWorld учитывает воду (спавны/NPC/маг обходят)");
ok(!inLiquid("hellfire", shore.x, shore.y + 4), "кромка берега (4 px в клетку воды со стороны суши) — проходима");
ok(!inLiquid("hellfire", shore.x, shore.y - 6), "суша у берега — проходима");
{ const [x, y] = resolveWorld("hellfire", shore.x, shore.y + 20); ok(!inLiquid("hellfire", x, y) && Math.hypot(x - shore.x, y - shore.y - 20) <= 24, `шаг в воду от берега — откат на ближайшую кромку (${Math.round(x)},${Math.round(y)})`); }
{ const [x, y] = resolveLiquid("hellfire", mid.x, mid.y); ok(!inLiquid("hellfire", x, y) && Math.hypot(x - mid.x, y - mid.y) < 24 * CELL, `стоящий в середине пруда выносится на сушу (${Math.round(Math.hypot(x - mid.x, y - mid.y))} px)`); }
TERRAIN_CFG.waterBlock = false;
ok(!inLiquid("hellfire", mid.x, mid.y) && !blockedWorld("hellfire", mid.x, mid.y, 1), "админка: «Вода непроходима» выкл — проходимо");
TERRAIN_CFG.waterBlock = true;

// Аринар: озёра
const P: any = arinarPlan(); let aw = 0, wx = 0, wy = 0;
for (let k = 0; k < 4000 && !aw; k++) { const i = Math.floor(Math.random() * P.n), j = Math.floor(Math.random() * P.n); if (P.biomeAt(i, j) === "water" && P.biomeAt(i + 1, j) === "water" && P.biomeAt(i - 1, j) === "water" && P.biomeAt(i, j + 1) === "water" && P.biomeAt(i, j - 1) === "water") { aw = 1; wx = (i + 0.5) * 32; wy = (j + 0.5) * 32; } }
ok(aw && inLiquid("arinar", wx, wy), `Аринар: вода непроходима (${Math.round(wx)},${Math.round(wy)})`);

// ключевые точки — не в жидкости (сырая проверка, без выключателей)
const bad: string[] = [];
const chk = (w: string, x: number, y: number, nm: string) => { if (liquidAt(w, x, y)) bad.push(`${nm}@${w}:${Math.round(x)},${Math.round(y)}`); };
chk("arinar", ZONE_RESPAWN.x, ZONE_RESPAWN.y, "респаун");
chk("hellfire", HOME_PORTAL_HUB.x, HOME_PORTAL_HUB.y, "портал домой");
for (const p of WORLD_PORTALS as any[]) { chk(p.world || "hellfire", p.x, p.y, p.id); if (p.targetWorld) chk(p.targetWorld, p.targetX || 300, p.targetY || 600, p.id + "→"); }
for (const [id, n] of Object.entries(NPCS as any) as any[]) chk(n.world || "hellfire", n.x, n.y, "NPC " + id);
for (const s of ZONE_SPAWNS) chk("arinar", s.x, s.y, "спавн " + s.type);
for (const s of HUB_SPAWNS) chk("hellfire", s.x, s.y, "спавн хаба " + s.type);
for (const n of genNodes(7, "arinar")) chk("arinar", n.x, n.y, "узел " + n.res);
for (const b of (WORLD_GEN.arinar as any).bosses || []) chk("arinar", b.x, b.y, "босс " + (b.type || ""));
ok(!bad.length, `ключевые точки не в воде/лаве${bad.length ? ": " + bad.slice(0, 12).join("; ") + (bad.length > 12 ? ` … ещё ${bad.length - 12}` : "") : ""}`);
console.log(`${pass} passed, ${fail} failed`); if (fail) process.exit(1);
