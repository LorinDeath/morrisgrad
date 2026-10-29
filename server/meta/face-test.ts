// Чёрные мобы смотрят по ходу / на цель: риг зеркален при взгляде влево — дула (точки вылета), сторона в флагах состояния (биты 26/27).
// Запуск: esbuild face-test.ts --bundle --platform=node --format=esm --loader:.json=json → node
import { BMA_CFG, mobShotOrigins, faceLeftOf, staffMuzzles, MOB_HAND } from "./blackArt";
import { BM_MOBS, registerBlackMobs } from "./blackMobs";
import { ITEM_BY_ID, ZONE_MOBS } from "./defs";
import { Zone } from "./zone";
import { mobFaceL } from "../../src/pages/MorrisCurse/_core/ui/bmMobArt.js";

let pass = 0, fail = 0;
const ok = (c: any, m: string) => { if (c) pass++; else fail++; console.log((c ? "PASS " : "FAIL ") + m); };
registerBlackMobs(ITEM_BY_ID as any);

// --- 1. сторона взгляда
ok(faceLeftOf(-0.9, false) === true && faceLeftOf(0.9, true) === false, "к цели: слева — влево, справа — вправо");
ok(faceLeftOf(0.05, true) === true && faceLeftOf(-0.05, false) === false, "цель строго сверху/снизу — прежняя сторона");
ok(mobFaceL(false, 0, (1 << 27) | (1 << 26)) === true && mobFaceL(true, 0, 1 << 27) === false, "клиент: в бою — сторона с сервера (биты 26/27)");
ok(mobFaceL(false, -5, 0) === true && mobFaceL(true, 5, 0) === false && mobFaceL(true, 0.5, 0) === true, "клиент: вне боя — по ходу по x, вверх/вниз — прежняя");

// --- 2. дула зеркальны
const mz: [number, number][] = [[-10, -60], [0, -70], [12, -58]];
const R = mobShotOrigins(mz, 3, 1000, 500, false), L = mobShotOrigins(mz, 3, 1000, 500, true);
ok(R.every((p, i) => Math.abs((p[0] - 1000) + (L[2 - i][0] - 1000)) < 1e-6 && Math.abs(p[1] - L[2 - i][1]) < 1e-6), "влево: дула — зеркало правых (x → −x, порядок слева направо сохранён)");
ok(R.every((p) => p[1] < 500) && R[1][0] > 1000 && L[1][0] < 1000, "дуло над мобом, со стороны руки (правая рука → вправо, зеркально — влево)");
const one = mobShotOrigins([[0, -60]], 1, 0, 0, false), s = BMA_CFG.muzzleScale, a = MOB_HAND[2] * Math.PI / 180;
ok(Math.abs(one[0][0] - s * (MOB_HAND[0] + 60 * Math.sin(a))) < 1e-6 && Math.abs(one[0][1] - s * (MOB_HAND[1] - 60 * Math.cos(a))) < 1e-6, "дуло = рука + оружие под углом хвата (не по прицелу)");
ok(mobShotOrigins([], 1, 7, 9, true)[0][0] === 7, "без дул — из центра");
// дуло не зависит от направления прицела: одна сторона — одна точка
const seer = (ZONE_MOBS as any).bmx_glacier_seer || (ZONE_MOBS as any).bmx_staff_seer;
ok(!!seer?.bmMz?.length, "ZONE_MOBS: у посохового моба есть дула");

// --- 3. зона: моб смотрит на цель, выстрел из руки со стороны взгляда, сторона в состоянии
{ const z = new Zone("arinar", [], [], { proc: true, seed: 12 } as any);
  const type = Object.keys(BM_MOBS).find((k) => (ZONE_MOBS as any)[k]?.bmAtk?.kind === "proj" && (ZONE_MOBS as any)[k]?.bmMz?.length)!;
  const d: any = (ZONE_MOBS as any)[type];
  const m: any = z.mobs.find((x: any) => !x.dead && !x.special); m.type = type; m.hp = m.maxHp = 5000; m.atkCd = 0; m.casts = [];
  const tgt: any = z.mobs.find((x: any) => x !== m && !x.dead && !x.special); void tgt; // координаты не трогаем (сетка near)
  (z as any).now = Date.now();
  (z as any).projs.length = 0; z.bmShootMob(m, d, -1, 0, 1, () => {}); // по мобу слева
  m.bmFl = faceLeftOf(-1, false); (z as any).projs.length = 0; const p1 = z.bmShootMob(m, d, -1, 0, 1, () => {});
  ok(p1 && p1.x < m.x, `выстрел влево — из руки слева (${Math.round(p1?.x)} < ${Math.round(m.x)})`);
  m.bmFl = faceLeftOf(1, true); const p2 = z.bmShootMob(m, d, 1, 0, 1, () => {});
  ok(p2 && p2.x > m.x && Math.abs((p2.x - m.x) + (p1.x - m.x)) < 1e-6 && Math.abs(p2.y - p1.y) < 1e-6, "выстрел вправо — зеркальная точка");
  // бой с мобом выставляет сторону и биты состояния
  m.atkCd = 5; (z as any).bmMobFight(m, d, tgt, 150, -1, 0, 0.05, () => {}, 1);
  ok(m.bmFl === true && m.bmFt > (z as any).now, "драка: цель слева — смотрит влево");
  const st: any = z.state(m.x, m.y, [], 700); let fl = 0; for (let i = 0; i + 5 < st.m.length; i += 6) if (st.m[i] === m.id) fl = st.m[i + 5];
  ok((fl & (1 << 27)) && (fl & (1 << 26)), "состояние: биты 27 (сторона задана) и 26 (влево)");
  ok(mobFaceL(false, 0, fl) === true, "клиент по флагам — влево");
  (z as any).bmMobFight(m, d, tgt, 150, 1, 0, 0.05, () => {}, 1);
  const st2: any = z.state(m.x, m.y, [], 700); let fl2 = 0; for (let i = 0; i + 5 < st2.m.length; i += 6) if (st2.m[i] === m.id) fl2 = st2.m[i + 5];
  ok((fl2 & (1 << 27)) && !(fl2 & (1 << 26)), "цель справа — смотрит вправо");
  (z as any).now = Date.now() - 5000; m.bmFt = Date.now() - 1; const st3: any = z.state(m.x, m.y, [], 700); let fl3 = 0; for (let i = 0; i + 5 < st3.m.length; i += 6) if (st3.m[i] === m.id) fl3 = st3.m[i + 5];
  ok(!(fl3 & (1 << 27)), "вне боя — сторона по ходу (бит 27 снят)");
  // ближний взмах: дуга симметрична, хитбокс по направлению удара
  const mel = Object.keys(BM_MOBS).find((k) => (ZONE_MOBS as any)[k]?.bmAtk?.kind === "arc")!;
  const dm: any = (ZONE_MOBS as any)[mel]; (z as any).events.length = 0;
  z.bmSwing(m, dm, -1, 0, 1, 1, null, null, () => {}); const ev: any = (z as any).events.find((e: any) => e.k === "marc");
  ok(ev && ev.dx === -1 && ev.x === Math.round(m.x), "взмах влево: событие marc с dx −1 из центра моба (клиент поворачивает моба по dx)");
}
// --- 5. ледяной стрелок против героя: стреляет ice_bolt из руки со стороны цели (обе стороны)
{ const z = new Zone("arinar", [], [], { proc: true, seed: 12 } as any); (z as any).now = Date.now();
  const type = Object.keys(BM_MOBS).find((k) => (ZONE_MOBS as any)[k]?.bmAtk?.kind === "proj" && (ZONE_MOBS as any)[k]?.elem === "ice")!;
  const d: any = (ZONE_MOBS as any)[type]; const m: any = z.mobs.find((x: any) => !x.dead && !x.special); m.type = type; m.hp = m.maxHp = 5000;
  const dist = Math.min(d.bmAtk.range * 0.6, 220) - 30;
  for (const ux of [-1, 1]) { m.atkCd = 0; m.casts = []; const x0 = m.x;
    z.bmMobVsPlayer(m, d, { sid: "p", x: m.x + ux * dist, y: m.y } as any, new Map(), Date.now(), 1, dist, ux, 0, 0, 0.05, () => {}, () => {});
    const c = m.casts[0];
    ok(!!type && c && c.proj === "ice_bolt" && (ux < 0 ? c.x < x0 : c.x > x0) && m.bmFl === (ux < 0), `${type}: ice_bolt ${ux < 0 ? "влево" : "вправо"} из руки со стороны цели`); }
}
void staffMuzzles;
console.log(`\n${pass} passed, ${fail} failed`); if (fail) process.exit(1);
