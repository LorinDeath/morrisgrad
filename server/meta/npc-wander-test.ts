// NPC бродят: в радиусе от точки появления, не сквозь твёрдое, стоят во время разговора, админка (kind npc) живьём.
import { NpcWander, NPC_CFG, TILE_PX, npcBlocked } from "./npcWander";
import { NPCS } from "./shared";
import { validatePatch, applyOverride, TABLES } from "./overrides";
let pass = 0, fail = 0; const ok = (c: any, m: string) => { c ? pass++ : fail++; console.log((c ? "PASS " : "FAIL ") + m); };
ok(NPC_CFG.radiusTiles === 10 && TILE_PX === 32, "по умолчанию радиус 10 клеток (320 px)");
ok(Object.values(NPCS).every((n) => !npcBlocked(n.world, n.x, n.y, 12)), "точки появления всех NPC свободны");
const W = new NpcWander(); let now = Date.now(); const R = NPC_CFG.radiusTiles * TILE_PX;
const maxD: Record<string, number> = {}, moved: Record<string, number> = {}; let bad = 0;
for (let i = 0; i < 6000; i++) { now += 100; W.tick(now, 0.1);
  for (const s of W.st.values()) { const d = Math.hypot(s.x - s.sx, s.y - s.sy); maxD[s.id] = Math.max(maxD[s.id] || 0, d); if (d > 1) moved[s.id] = 1; if (npcBlocked(s.world, s.x, s.y, 10)) bad++; } }
ok(Object.keys(NPCS).every((id) => moved[id]), "все NPC ходят: " + JSON.stringify(Object.fromEntries(Object.entries(maxD).map(([k, v]) => [k, Math.round(v)]))));
ok(Object.values(maxD).every((d) => d <= R + 1), "никто не выходит за радиус " + R);
ok(bad === 0, "ни разу не оказались в твёрдом (стены/пропсы/край мира): " + bad);
const p = W.pos("petr")!; W.talkStart("petr", "sid1", p.x + 30, p.y, now); const x0 = p.x, y0 = p.y;
for (let i = 0; i < 300; i++) { now += 100; W.tick(now, 0.1); }
ok(p.x === x0 && p.y === y0 && !p.moving && p.dir === 2, "разговор: стоит 30 с и смотрит на собеседника (вправо)");
W.talkEnd("petr", "sid1", now); for (let i = 0; i < 200; i++) { now += 100; W.tick(now, 0.1); }
ok(Math.hypot(p.x - x0, p.y - y0) > 1, "разговор закончен — снова гуляет");
W.talkStart("petr", "sid2", p.x, p.y + 10, now); const x1 = p.x; for (let i = 0; i < (NPC_CFG.talkHoldSec + 15) * 10; i++) { now += 100; W.tick(now, 0.1); }
ok(p.talk.size === 0, "окно не закрыли (обрыв) — держит не дольше talkHoldSec");
ok(TABLES.npc.main === NPC_CFG, "админка: kind npc/main = живой конфиг");
const pt = validatePatch("npc", "main", { radiusTiles: 3, speed: 60 }); ok(typeof pt !== "string", "правка принимается");
applyOverride("npc", "main", pt as any); ok(NPC_CFG.radiusTiles === 3 && NPC_CFG.speed === 60, "правка применилась живьём");
const W2 = new NpcWander(); let m2 = 0; for (let i = 0; i < 3000; i++) { now += 100; W2.tick(now, 0.1); for (const s of W2.st.values()) m2 = Math.max(m2, Math.hypot(s.x - s.sx, s.y - s.sy)); }
ok(m2 <= 3 * 32 + 1, "радиус 3 клетки соблюдается: " + Math.round(m2));
applyOverride("npc", "main", { on: false } as any); W2.tick(now + 100, 0.1); ok([...W2.st.values()].every((s) => s.x === s.sx && s.y === s.sy), "выкл — все стоят в точке появления");
applyOverride("npc", "main", null); ok(NPC_CFG.radiusTiles === 10 && NPC_CFG.on === true, "сброс — как в коде");
ok(typeof validatePatch("npc", "main", { radiusTiles: 999 }) === "string", "радиус > 30 отклонён");
void x1;
console.log(`${pass} passed, ${fail} failed`); if (fail) process.exit(1);
