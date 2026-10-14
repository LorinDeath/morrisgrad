// Паритет навыков мир/поляна/дуэль ↔ забег («вампирик»): составные эффекты (рывок + снаряды, второй вихрь, эхо, таланты)
import { castShape } from "./abilityShapes";
let ok = 0, bad = 0; const t = (n: string, c: any) => { c ? (ok++, console.log("ok  ", n)) : (bad++, console.log("FAIL", n)); };
function setup(mobs: [number, number][], props: string[] = []) {
  const ms = mobs.map(([x, y], i) => ({ id: i, x, y, hp: 1000 * (i + 1), dead: false }));
  const zone = { mobsAround: (x: number, y: number, r: number) => ms.filter((m) => Math.hypot(m.x - x, m.y - y) <= r) };
  const L: any = { hits: [], fired: [], move: null, buff: [], later: [], ev: [] };
  const c: any = { zone, sid: "s", x: 0, y: 0, dx: 1, dy: 0, now: 0, dmg: 100, radiusMult: 1, props, here: () => L.move || [0, 0],
    hit: (m: any, k: number) => { L.hits.push([m.id, k]); return 100 * k; }, status: () => {}, move: (x: number, y: number) => (L.move = [x, y]),
    bounds: (x: number, y: number) => [x, y], buff: (b: any) => L.buff.push(b), later: (ms2: number, fn: any) => L.later.push([ms2, fn]), ev: (e: any) => L.ev.push(e),
    fire: (o: any) => { L.fired.push(o); return o; } };
  const runLater = () => { const q = L.later.splice(0); q.forEach((l: any) => l[1]()); };
  return { c, L, runLater };
}
{ const { c, L } = setup([[200, 0]]); castShape("backstab", c);
  t("Удар в спину: рывок за спину сильнейшего", L.move && L.move[0] > 200);
  const blades = L.fired.filter((f: any) => f.t === "daggers");
  t("Удар в спину: ПОСЛЕ рывка веер 10 клинков из точки приземления", blades.length === 10 && blades.every((f: any) => f.x === L.move[0] && f.y === L.move[1]));
  t("Удар в спину: неуязвимость 0.6 с", L.buff.some((b: any) => b.invuln === 600)); }
{ const { c, L } = setup([[200, 0]], ["t_fan"]); castShape("backstab", c); t("Удар в спину + t_fan: 14 клинков", L.fired.filter((f: any) => f.t === "daggers").length === 14); }
{ const { c, L, runLater } = setup([], ["t_double"]); castShape("trick_strike", c);
  t("Коварный удар: вихрь 16 кинжалов во все стороны", L.fired.length === 16 && new Set(L.fired.map((f: any) => Math.round(Math.atan2(f.dy, f.dx) * 10))).size === 16);
  runLater(); t("Коварный удар + t_double: второй вихрь через 0.4 с", L.fired.length === 32);
  L.fired[0].onHit({ id: 9, x: 0, y: 0 }); t("Коварный удар: лечение 10% урона", L.buff.some((b: any) => Math.abs(b.heal - 6) < 1e-9)); }
{ const { c, L } = setup([], ["t_fan24"]); castShape("trick_strike", c); t("Коварный удар + t_fan24: 24 кинжала", L.fired.length === 24); }
{ const { c, L } = setup([[60, 0]]); castShape("frost_nova", c); t("Ледяная нова: кольцо 20 осколков", L.fired.filter((f: any) => f.t === "ice_fan").length === 20); }
{ const { c, L } = setup([], ["t_split3"]); castShape("fireball", c); t("Огненный шар + t_split3: три шара веером", L.fired.filter((f: any) => f.t === "fireball").length === 3); }
{ const { c, L } = setup([]); castShape("fireball", c); t("Огненный шар: один шар по курсору", L.fired.length === 1 && L.fired[0].dx === 1); }
{ const { c, L } = setup([], ["t_twin"]); castShape("pierce", c); t("Колющий удар + t_twin: два копья", L.fired.length === 2); }
{ const { c, L } = setup([], ["t_shower"]); castShape("meteor", c); t("Метеор + t_shower: 3 падения", L.later.length === 3); }
{ const { c, L, runLater } = setup([]); castShape("shadow_step", c); runLater(); t("Шаг тени без t_trail: без огненного следа", L.ev.filter((e: any) => e.k === "ability").length === 0); }
{ const { c, L, runLater } = setup([], ["t_trail"]); castShape("shadow_step", c); runLater(); t("Шаг тени + t_trail: огненный след", L.ev.filter((e: any) => e.k === "ability").length >= 4); }
{ const { c, L, runLater } = setup([[300, 0]], ["t_quake"]); c.x = 0; castShape("leap_strike", c); runLater(); t("Прыжок + t_quake: радиус ×1.5 (моб в 80px от точки, r=180)", L.hits.length === 1); }
{ const { c, L } = setup([[50, 0]], ["nova"]); castShape("pierce", c); t("Сияние «Нова»: взрыв вокруг после навыка", L.ev.some((e: any) => e.id === "nova") && L.hits.length >= 1); }
{ const { c, L, runLater } = setup([], ["echo"]); castShape("fireball", c); t("Сияние «Эхо»: отложенный повтор", L.later.length === 1); runLater(); t("Эхо: второй шар", L.fired.length === 2);
  L.fired[1].onEnd(0, 0, false); t("Эхо: без бесконечной рекурсии", L.later.length === 0); }
{ // дуэль: без fire — мгновенный круг, но тоже срабатывает
  const { c, L } = setup([[200, 0]]); delete c.fire; castShape("backstab", c); t("Удар в спину без снарядов (fallback): веер наносит урон", L.hits.length >= 2); }
console.log(`skill-parity ${ok}/${ok + bad}`); if (bad) process.exit(1);
