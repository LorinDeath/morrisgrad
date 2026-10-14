// Задача 5: формы навыков открытого мира (сервер-авторитет)
import { castShape, SHAPES } from "./abilityShapes";
let ok = 0, bad = 0; const t = (n: string, c: any) => { c ? ok++ : (bad++, console.log("FAIL", n)); };
function setup(mobs: [number, number][]) {
  const ms = mobs.map(([x, y], i) => ({ id: i, x, y, hp: 1000, alive: true }));
  const zone = { mobsAround: (x: number, y: number, r: number) => ms.filter((m) => m.alive && Math.hypot(m.x - x, m.y - y) <= r) };
  const log: any = { hits: [] as any[], st: [] as any[], move: null, buff: [] as any[], later: [] as any[], ev: [] as any[] };
  const c: any = { zone, sid: "s", x: 0, y: 0, dx: 1, dy: 0, now: 0, dmg: 100, radiusMult: 1,
    hit: (m: any, k: number, o: any) => { log.hits.push([m.id, k, o]); return 100 * k; }, status: (m: any, s: any) => log.st.push([m.id, s]),
    move: (x: number, y: number) => (log.move = [x, y]), bounds: (x: number, y: number) => [Math.min(x, 1000), y],
    buff: (b: any) => log.buff.push(b), later: (ms: number, fn: any) => log.later.push([ms, fn]), ev: (e: any) => log.ev.push(e) };
  return { c, log, ms };
}
{ const { c, log } = setup([[100, 0], [-100, 0], [500, 0]]); castShape("frost_nova", c);
  t("нова: в радиусе обе стороны", log.hits.length === 2); t("нова: заморозка", log.st.length === 2); }
{ const { c, log } = setup([[200, 0], [400, 0], [200, 200]]); castShape("pierce", c);
  t("линия: только по направлению", log.hits.length === 2 && log.hits.every((h: any) => h[0] !== 2)); t("линия: пробой брони", log.hits[0][2]?.pierceArmor); }
{ const { c, log } = setup([[100, 0]]); castShape("shadow_step", c);
  t("рывок: перенос героя", log.move && log.move[0] > 100); t("рывок: неуязвимость", log.buff.some((b: any) => b.invuln)); }
{ const { c, log } = setup([[300, 0]]); castShape("meteor", c);
  t("метеор: урон отложен", log.hits.length === 0 && log.later.length > 0); log.later.forEach((l: any) => l[1]()); t("метеор: падает в точке", log.hits.length === 1); }
{ const { c, log } = setup([[0, 0]]); castShape("shield_wall", c); t("стена щитов: снижение урона", log.buff.some((b: any) => b.dr)); }
{ const { c, log } = setup([]); c.x = 950; castShape("leap_strike", c); t("прыжок: в границах мира", log.move && log.move[0] <= 1000); }
t("все формы известны", Object.values(SHAPES).every((s: any) => ["nova", "line", "proj", "dash", "leap", "rain", "meteor", "cloud", "cone"].includes(s.k)));
console.log(`shapes ${ok}/${ok + bad}`);
