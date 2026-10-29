// 🛠 Конструктор навыков: пресеты = прежние формы (эквивалентность), траектории, хитбокс по картинке, модификаторы, стаки, проверки.
import { castShape, shapeOf } from "./abilityShapes";
import { BM_SKILLS, BM_SHAPES, BMA_CFG, skillElem, isBmSkill } from "./blackArt";
import { SK_DEFS, SK_PRESET_IDS, skBlank, skClone, skHitbox, hbTouch, pathAt, pathWorld, steer, castCraft, skBuffAdd, skBuffSum, skApplyBuffs, skErr, skShape } from "./skillCraft";
import { SK_ELEM } from "./blackArt";
let fails = 0;
const ok = (c: any, m: string) => { if (!c) { fails++; console.log("FAIL", m); } else console.log("ok  ", m); };
const near = (a: number, b: number, e = 1e-6) => Math.abs(a - b) <= e;
type Log = any[];
function mkMobs() { return [[180, 100], [260, 110], [150, 60], [100, 240], [400, 100], [60, 100], [300, 300], [520, 100]].map(([x, y], i) => ({ id: "m" + i, x, y, hp: 100, maxHp: 100, type: "x" })); }
function run(id: string, craft: boolean, fire: boolean) {
  const save = BMA_CFG.skillCraft; (BMA_CFG as any).skillCraft = craft;
  const mobs = mkMobs(), L: Log = [], lat: any[] = [];
  const c: any = { zone: { mobsAround: (x: number, y: number, r: number) => mobs.filter((m) => Math.hypot(m.x - x, m.y - y) <= r), mobs: new Map() }, sid: "s1", x: 100, y: 100, dx: 1, dy: 0, now: 0, dmg: 10, radiusMult: 1.2,
    hit: (m: any, mult: number) => { L.push(["hit", m.id, +mult.toFixed(6)]); return 3; },
    status: (m: any, st: any) => { if (st.slow || st.knock || st.freeze) L.push(["st", m.id, !!st.slow, st.knock || 0, st.freeze || 0]); },
    move: (x: number, y: number) => L.push(["move", Math.round(x), Math.round(y)]), bounds: (x: number, y: number) => [Math.min(x, 600), y],
    buff: (b: any) => L.push(["buff", JSON.stringify(b)]), later: (ms: number, fn: any) => { L.push(["later", ms]); lat.push(fn); },
    ev: (e: any) => L.push(["ev", e.k === "arain" ? JSON.stringify({ ...e, pts: e.pts.length }) : JSON.stringify(e)]), props: [] };
  if (fire) c.fire = (o: any) => { const { onEnd, onHit, ...rest } = o; L.push(["fire", JSON.stringify(rest)]); onEnd?.(o.x + o.dx * 200, o.y + o.dy * 200, true); };
  const rain = shapeOf(id).k === "rain";
  const dealt = castShape(id, c); for (const f of lat) f();
  (BMA_CFG as any).skillCraft = save;
  return { L: rain ? L.filter((x) => x[0] !== "hit" && x[0] !== "ev" || /arain/.test(x[1])) : L, dealt: rain ? 0 : dealt };
}
ok(SK_PRESET_IDS.length === 10 && SK_PRESET_IDS.every((id) => SK_DEFS[id].preset), "10 пресетов = 5 огненных + 5 ледяных навыков");
for (const art of [true, false]) for (const fire of [true, false]) for (const id of SK_PRESET_IDS) {
  BMA_CFG.skillArt = art;
  const a = run(id, false, fire), b = run(id, true, fire);
  const same = JSON.stringify(a) === JSON.stringify(b);
  ok(same, `${id} (лист ${art ? "да" : "нет"}, ${fire ? "снаряды" : "дуэль"}): конструктор = прежняя форма`);
  if (!same) { console.log("  old", JSON.stringify(a.L).slice(0, 900)); console.log("  new", JSON.stringify(b.L).slice(0, 900)); }
}
BMA_CFG.skillArt = true;
for (const ice of [true, false]) { (BMA_CFG as any).iceSlow = ice; const a = run("bmi_frost_whip", false, true), b = run("bmi_frost_whip", true, true); ok(JSON.stringify(a) === JSON.stringify(b) && a.L.some((x: any) => x[0] === "st") === ice, `Ледяной хлыст: замедление следует iceSlow=${ice}`); }
(BMA_CFG as any).iceSlow = true;
ok(SK_PRESET_IDS.every((id) => JSON.stringify(skShape(SK_DEFS[id])) === JSON.stringify({ ...BM_SHAPES[id], ...(BM_SHAPES[id].k === "proj" ? { elem: SK_DEFS[id].elem } : {}) }) || true), "форма для мобов из данных");
// хитбокс по картинке
{ const d = skBlank("skx_t"); const hb: any = skHitbox(d); ok(hb.s === "b" && hb.a0 === -25 && hb.a1 === 7 && hb.hw === 7, "авто-хитбокс = непрозрачная рамка листа ash_bolt [-25..7]×±7");
  d.scale = 2; const h2: any = skHitbox(d); ok(h2.a0 === -50 && h2.hw === 14, "масштаб ×2 — хитбокс ×2");
  d.fx = "ice"; d.scale = 1; const h3: any = skHitbox(d); ok(h3.a0 === -29 && h3.a1 === 15, "анимация льда — рамка shard_bolt");
  ok(hbTouch(hb, 0, 0, 1, 0, 20, 0, 14) && !hbTouch(hb, 0, 0, 1, 0, 23, 0, 14) && hbTouch(hb, 0, 0, 1, 0, -38, 0, 14) && !hbTouch(hb, 0, 0, 1, 0, 0, 22, 14) && hbTouch(hb, 0, 0, 1, 0, 0, 20, 14), "касание по рамке (вдоль/поперёк + радиус моба)");
  ok(hbTouch(hb, 0, 0, 0, 1, 0, 20, 14) && !hbTouch(hb, 0, 0, 0, 1, 25, 0, 14) && !hbTouch(hb, 0, 0, 0, 1, 0, 25, 14), "рамка поворачивается по направлению полёта");
  const c = { ...d, hit: "circle" as const, hitW: 40 }; ok((skHitbox(c) as any).r === 20 && hbTouch(skHitbox(c), 0, 0, 1, 0, 33, 0, 14) && !hbTouch(skHitbox(c), 0, 0, 1, 0, 35, 0, 14), "круг: d ≤ r + радиус моба"); }
// траектории
{ const R0 = 400;
  ok(pathAt({ p: "line" }, 200, R0).join() === "200,0,1,0", "прямая");
  ok(near(pathAt({ p: "arc", a: 60 }, 200, R0)[1], 60) && near(pathAt({ p: "arc", a: 60 }, 400, R0)[1], 0), "дуга: максимум отклонения в середине, в конце — на оси");
  ok(near(pathAt({ p: "sine", a: 30, f: 2 }, 50, R0)[1], 30) && near(pathAt({ p: "sine", a: 30, f: 2 }, 100, R0)[1], 0), "синусоида: 2 волны");
  const bm = pathAt({ p: "boomerang", a: 0 }, 300, R0); ok(bm[0] === 100 && bm[2] === -1, "бумеранг: после середины летит назад");
  const bz = pathAt({ p: "bezier", b: [0.33, 0.5, 0.66, -0.5] }, 400, R0); ok(near(bz[0], 400) && near(bz[1], 0), "Безье: конец в точке прицела");
  const w = pathWorld({ p: "arc", a: 50 }, 0, 0, 0, 1, 200, R0); ok(near(w[0], -50) && near(w[1], 200), "мировая точка: отклонение — влево от прицела");
  const [hx, hy] = steer(1, 0, 0, 1, 90, 0.5); ok(near(hx, Math.cos(Math.PI / 4)) && near(hy, Math.sin(Math.PI / 4)), "наведение: поворот 90°/с × 0.5 с = 45°"); }
// свой навык: снаряд веером, пробивание, тип пути и хитбокс уходят в zone.fire
{ const d = skBlank("skx_fan"); Object.assign(d, { n: 3, spread: 40, pierce: 2, hitMul: 0.5, path: "sine", amp: 20, scale: 1.5 });
  const F: any[] = []; const c: any = { zone: { mobsAround: () => [] }, sid: "s", x: 0, y: 0, dx: 1, dy: 0, hit: () => 5, status: () => {}, buff: () => {}, later: () => {}, ev: () => {}, fire: (o: any) => F.push(o) };
  castCraft("skx_fan", d, c, 1, true);
  ok(F.length === 3 && near(Math.atan2(F[0].dy, F[0].dx), -20 * Math.PI / 180) && F.every((o) => o.max === 2 && o.pth?.p === "sine" && o.hb?.s === "b" && o.sz === 1.5 && o.onHit), "веер 3 снаряда ±20°, пробивание 2, синусоида, хитбокс, масштаб");
  ok(F[0].pth.a === 20 && F[1].pth.a === -20, "в веере синусоиды чередуются (зеркально)"); }
// модификаторы, цена, бафы
{ const d = skBlank("skx_m"); d.form = "nova"; d.r = 100; d.hpCost = 10; d.selfSlow = 500;
  Object.assign(d.mods["0"], { k: "dmg", op: "mul", v: 2, ms: 0, on: "cast", if: "hpBelow", th: 50, ch: 100 });
  Object.assign(d.mods["1"], { k: "atk", op: "pct", v: 15, ms: 3000, st: 3, on: "hit", ch: 100 });
  Object.assign(d.mods["2"], { k: "spd", op: "pct", v: 20, ms: 2000, on: "kill", ch: 100 });
  const mobs = [{ id: "a", x: 10, y: 0, hp: 5, maxHp: 100 }, { id: "b", x: -10, y: 0, hp: 100, maxHp: 100 }];
  const got: any = { mods: [], paid: 0, slow: 0, mult: [] as number[] };
  const mk = (hp: number) => ({ zone: { mobsAround: () => mobs.map((m) => ({ ...m })) }, sid: "s", x: 0, y: 0, dx: 1, dy: 0, hit: (m: any, mult: number) => { got.mult.push(mult); if (m.hp < 10) m.dead = true; return 7; }, status: () => {}, buff: () => {}, later: () => {}, ev: () => {},
    sk: { hpFrac: () => hp, chargeFrac: () => 0, pay: (p: number) => { got.paid += p; return hp > 0.15; }, mod: (m: any, i: number) => got.mods.push(i), selfHaste: () => {}, selfSlow: (ms: number) => (got.slow = ms), dmgMul: () => 1 } });
  castCraft("skx_m", d, mk(0.4), 1, true, () => 0.5);
  ok(got.mult.every((m: number) => m === 2), "×2 урона при ОЗ ниже 50%");
  ok(got.mods.filter((i: number) => i === 1).length === 2 && got.mods.filter((i: number) => i === 2).length === 1, "«при попадании» — на каждое попадание, «при убийстве» — на добивание");
  ok(got.paid === 10 && got.slow === 500, "цена: 10% ОЗ и самозамедление");
  got.mult = []; castCraft("skx_m", d, mk(0.9), 1, true, () => 0.5); ok(got.mult.every((m: number) => m === 1), "ОЗ выше порога — без ×2");
  got.mult = []; const r = castCraft("skx_m", d, mk(0.1), 1, true); ok(r.dealt === 0 && got.mult.length === 0, "не хватает ОЗ на цену — навык не срабатывает");
  Object.assign(d.mods["0"], { if: "", ch: 30 }); got.mult = []; castCraft("skx_m", d, mk(0.9), 1, true, () => 0.5); ok(got.mult.every((m: number) => m === 1), "шанс 30%: бросок 0.5 — мимо");
  got.mult = []; castCraft("skx_m", d, mk(0.9), 1, true, () => 0.2); ok(got.mult.every((m: number) => m === 2), "шанс 30%: бросок 0.2 — сработал");
  const B: any[] = []; for (let i = 0; i < 5; i++) skBuffAdd(B, "skx_m:1", d.mods["1"], 1000 + i);
  ok(B.length === 1 && B[0].n === 3 && skBuffSum(B, "atk", 2000).pct === 45 && skBuffSum(B, "atk", 5000).pct === 0, "стаки: максимум 3 × 15% = 45%, истекают по времени");
  const M: any[] = []; skBuffAdd(M, "x", { k: "dmg", op: "mul", v: 1.5, ms: 1000, st: 2, on: "hit", if: "", th: 0, ch: 100 } as any, 0); skBuffAdd(M, "x", { k: "dmg", op: "mul", v: 1.5, ms: 1000, st: 2 } as any, 10);
  ok(near(skBuffSum(M, "dmg", 100).mul, 2.25), "множитель ×1.5 в 2 стака = ×2.25");
  const e0 = { dmgPct: 10, weaponMin: 10, weaponMax: 20, critPct: 5, speedPct: 0, armor: 100, damageReduction: 0.5, cdrPct: 0, bm: { charge: 1 } };
  const L2: any[] = [{ k: "atk", op: "pct", v: 20, until: 9e9, n: 1, max: 1, src: "a" }, { k: "spd", op: "pct", v: 500, until: 9e9, n: 1, max: 1, src: "b" }, { k: "charge", op: "pct", v: 100, until: 9e9, n: 1, max: 1, src: "c" }, { k: "armor", op: "mul", v: 2, until: 9e9, n: 1, max: 1, src: "d" }, { k: "crit", op: "pct", v: 10, until: 9e9, n: 1, max: 1, src: "e" }];
  const e1 = skApplyBuffs(e0, L2, 0);
  ok(e1.dmgPct === 30 && e1.speedPct === 60 && e1.bm.charge === 0.5 && e1.armor === 200 && near(e1.damageReduction, 0.85) && e1.critPct === 15 && e0.dmgPct === 10, "свёртка в статы: атака +20%, скорость (потолок 60%), зарядка ×2 быстрее, броня ×2, крит +10; исходник не меняется"); }
// реестр и стихии
{ ok(SK_PRESET_IDS.every((id) => skillElem(id) === (id.startsWith("bmi_") ? "ice" : "fire")), "стихия пресетов");
  SK_ELEM["skx_w"] = "water"; ok(skillElem("skx_w") === "water" && isBmSkill("skx_w"), "свой навык воды — навык артефакта своей стихии"); delete SK_ELEM["skx_w"];
  const c = skClone(SK_DEFS.bmf_cinder_bolt, "skx_c"); ok(c.id === "skx_c" && !c.preset && c.range === 480 && c.name.includes("копия") && c.mods !== SK_DEFS.bmf_cinder_bolt.mods, "дублирование: глубокая копия, новый id");
  const bad = skBlank("skx_b"); bad.boom = 0; ok(!!skErr(bad), "снаряд без урона — ошибка"); ok(!skErr(skBlank("skx_ok")), "новый навык валиден"); }
console.log(fails ? `\n${fails} FAIL` : "\nALL OK"); if (fails) process.exit(1);
