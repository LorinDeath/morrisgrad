// Навыки в открытом мире — направленные (как в «Вампир-лайке»), а не вспышка вокруг героя.
// Для каждого навыка класса и каждого навыка оружия (R): моб ВПЕРЕДИ по направлению каста получает урон,
// моб ПОЗАДИ — нет. Исключения — только формы «вокруг себя» по замыслу (вихрь, щит, облако, кольцо черепов…).
import { ABILITIES_DEF, RUN_SKILLS } from "./shared";
import { castShape, shapeOf } from "./abilityShapes";
let pass = 0, fail = 0;
const ok = (c: boolean, m: string) => { c ? pass++ : fail++; console.log((c ? "PASS " : "FAIL ") + m); };
const reach = (s: any) => s.k === "line" || s.k === "dash" ? s.len * 0.6 : s.k === "proj" ? s.len * 0.5 : s.k === "leap" ? s.len : s.k === "meteor" ? s.dist : s.k === "rain" ? s.area * 1.1 : s.k === "cone" ? s.len * 0.6 : s.r * 0.6;
function trial(id: string) {
  const s: any = shapeOf(id), d = reach(s);
  const mobs = [{ id: 1, x: 1000 + d, y: 1000, hp: 100, dead: false, usedAbility: new Set() }, { id: 2, x: 1000 - d, y: 1000, hp: 100, dead: false, usedAbility: new Set() }];
  const hit = new Set<number>();
  const zone = { mobsAround: (x: number, y: number, r: number) => mobs.filter((m) => Math.hypot(m.x - x, m.y - y) <= r + 14) };
  // дождь случаен: 40 повторов, считаем, попал ли хоть раз
  for (let rep = 0; rep < (s.k === "rain" ? 40 : 1); rep++)
    castShape(id, { zone, sid: "a", x: 1000, y: 1000, dx: 1, dy: 0, now: 0, dmg: 10, radiusMult: 1, hit: (m) => { hit.add(m.id); return 1; },
      status: () => {}, move: () => {}, bounds: (x, y) => [x, y], buff: () => {}, later: (_ms, fn) => fn(), ev: () => {} });
  return { s, front: hit.has(1), back: hit.has(2) };
}
const SELF = new Set(["nova", "cloud"]);
const ids = [...new Set([...ABILITIES_DEF.filter((a: any) => a.cls || a.classId || a.hero || true).map((a) => a.id), ...RUN_SKILLS.map((x) => "rs:" + x.id)])];
const rows: string[] = [];
let dir = 0, self = 0;
for (const id of ids) {
  const r = trial(id);
  if (SELF.has(r.s.k)) { self++; ok(r.front, `${id}: ${r.s.k} (вокруг себя по замыслу) — бьёт рядом`); rows.push(`${id}=${r.s.k}`); continue; }
  dir++;
  ok(r.front && !r.back, `${id}: ${r.s.k} — направленный: впереди ${r.front ? "попал" : "МИМО"}, позади ${r.back ? "ПОПАЛ" : "не задет"}`);
  rows.push(`${id}=${r.s.k}`);
}
console.log(`directional ${dir}, self-centred ${self}: ${rows.join(", ")}`);
console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
