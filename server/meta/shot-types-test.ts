// ЭТАП 2: типы снарядов дальних лезвий — взрыв, рикошет, насквозь, раскол (zone.shotFx), стихия в событии proj; выключатель shotOn.
import { ITEM_BY_ID, ZONE_MOBS } from "./defs";
import { Zone } from "./zone";
import { BM_PARTS, BMA_CFG, shotOf } from "./blackArt";
import { BM_MOBS, registerBlackMobs, mobAtk } from "./blackMobs";
let P = 0, F = 0; const ok = (c: any, m: string) => { if (c) { P++; console.log("PASS " + m); } else { F++; console.log("FAIL " + m); } };
registerBlackMobs(ITEM_BY_ID as any);
const X = 32640, Y = 24000;
const mk = () => { const z: any = new Zone("arinar", [], [], { proc: false }); return z; };
const sim = (shot: any, mobsAt: number[][], o: any = {}) => {
  const z = mk(); const ms = mobsAt.map(([x, y]) => { const m = z.addMob("bmx_volt_archer", x, y); m.hp = m.maxHp = 1e9; return m; });
  const main: number[] = [], aux: { id: number; k: number }[] = [];
  const p = z.fire({ o: "p", sid: "s1", t: "ice_bolt", x: X, y: Y, dx: 1, dy: 0, range: 600, w: 20, max: 1, el: "lightning", shot, onHit: (m: any) => main.push(m.id), onAux: (m: any, k: number) => aux.push({ id: m.id, k }), ...o });
  const ev0 = z.events.find((e: any) => e.k === "proj");
  for (let i = 0; i < 80; i++) { z.now = Date.now() + i * 50; z.updateProjs(0.05, new Map()); }
  return { z, ms, main, aux, p, ev0, shx: z.events.filter((e: any) => e.k === "shx") };
};
const line = [[X + 200, Y], [X + 300, Y], [X + 400, Y], [X + 500, Y]];
const n0 = sim(null, line);
ok(n0.main.length === 1 && n0.aux.length === 0 && n0.shx.length === 0, "обычный снаряд: одна цель, без вторичных");
ok(n0.ev0?.el === "lightning", "событие proj несёт стихию (цвет снаряда у клиента)");
const pr = sim({ t: "pierce", n: 3, r: 0, k: 0.8 }, line);
ok(pr.main.length === 3, `насквозь: 3 цели (${pr.main.length})`);
const ex = sim({ t: "explode", n: 1, r: 120, k: 0.6 }, [[X + 200, Y], [X + 240, Y + 60], [X + 600, Y + 400]]);
ok(ex.main.length === 1 && ex.aux.length === 1 && Math.abs(ex.aux[0].k - 0.6) < 1e-9 && ex.shx.some((e: any) => e.t === "explode" && e.el === "lightning" && Number.isFinite(e.x)), `взрыв: сосед в радиусе ×0.6, дальний — нет (${JSON.stringify(ex.aux)})`);
const exMiss = sim({ t: "explode", n: 1, r: 120, k: 0.6 }, [[X + 2000, Y + 2000]]);
ok(exMiss.shx.filter((e: any) => e.t === "explode").length === 1, "взрыв: и в конце полёта без попадания (один раз)");
const ric = sim({ t: "ricochet", n: 2, r: 260, k: 0.7 }, [[X + 200, Y], [X + 200, Y + 150], [X + 200, Y + 300], [X + 200, Y + 450]]);
ok(ric.main.length === 1 && ric.aux.length === 2 && Math.abs(ric.aux[1].k - 0.49) < 1e-9, `рикошет: 2 отскока, урон 0.7 → 0.49 (${JSON.stringify(ric.aux)})`);
ok(ric.shx.some((e: any) => e.t === "ric" && e.pts.length === 3), "рикошет: событие с точками цепи");
ok(new Set([ric.main[0], ...ric.aux.map((a) => a.id)]).size === 3, "рикошет: одна цель не бьётся дважды");
const sp = sim({ t: "split", n: 3, r: 200, k: 0.5 }, [[X + 200, Y], [X + 330, Y]]);
ok(sp.shx.some((e: any) => e.t === "split" && e.n === 3) && sp.aux.some((a) => a.id === sp.ms[1].id && a.k === 0.5) && !sp.aux.some((a) => a.id === sp.ms[0].id), `раскол: 3 осколка, задели следующего ×0.5, первую цель не бьют (${JSON.stringify(sp.aux)})`);
ok(!sp.z.projs.length && sp.z.events.filter((e: any) => e.k === "proj").length === 4, "раскол: осколки — свои снаряды (без собственного типа)");
// снаряд моба по игрокам
{ const z = mk(); const pl = (sid: string, x: number, y: number) => ({ sid, x, y, alive: true }); const players = new Map([["a", pl("a", X + 200, Y)], ["b", pl("b", X + 260, Y + 40)], ["c", pl("c", X + 900, Y)]]);
  const hits: string[] = [], aux: string[] = [];
  z.fire({ o: "m", mob: 1, t: "ice_bolt", x: X, y: Y, dx: 1, dy: 0, range: 600, w: 20, max: 1, shot: { t: "explode", n: 1, r: 120, k: 0.5 }, onHit: (p: any) => hits.push(p.sid), onAux: (p: any) => aux.push(p.sid) });
  for (let i = 0; i < 60; i++) z.updateProjs(0.05, players as any);
  ok(hits.join() === "a" && aux.join() === "b", `снаряд моба: взрыв задел соседа-игрока (${hits}|${aux})`); }
// данные: лезвия стихий, мобы, выключатель
const rb = Object.entries(BM_PARTS).filter(([, b]: any) => b.type === "blade" && b.ranged && b.shot);
ok(rb.length >= 4 && new Set(rb.map(([, b]: any) => b.shot)).size === 4, `дальние лезвия стихий: все 4 типа (${rb.map(([id, b]: any) => id + ":" + b.shot).join(" ")})`);
const shooters = Object.keys(BM_MOBS).filter((id) => (ZONE_MOBS as any)[id]?.bmAtk?.shot);
ok(shooters.length >= 4 && shooters.every((id) => (ZONE_MOBS as any)[id].bmAtk.kind === "proj"), `мобы-стрелки: тип снаряда из лезвия (${shooters.map((id) => id + ":" + (ZONE_MOBS as any)[id].bmAtk.shot.t).join(" ")})`);
void mobAtk;
(BMA_CFG as any).shotOn = false; ok(shotOf(rb[0][1] as any) === null, "админка: «Типы снарядов» выкл — обычные"); (BMA_CFG as any).shotOn = true;
const C: any = BMA_CFG, old = C.shotRicochetN; C.shotRicochetN = 5; const ricB = rb.find(([, b]: any) => b.shot === "ricochet" && b.shotN == null);
ok(!ricB || shotOf(ricB[1] as any)!.n === 5, "админка: число отскоков по умолчанию"); C.shotRicochetN = old;
console.log(`${P} PASS / ${F} FAIL`); if (F) process.exitCode = 1;
