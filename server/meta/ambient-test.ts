// Бродячие мобы Аринара (добавка к лагерям): шансы, край экрана, охота на игрока, кап, уход, без боссов/элиты (кроме вожака группы)
import { Zone, type ZPlayer } from "./zone";
import { ZONE_GEN, inSafe } from "./zoneGen";
import { ZONE_MOBS } from "./defs";
let ok = 0, bad = 0; const t = (n: string, c: any) => { c ? (ok++, console.log("ok  ", n)) : (bad++, console.log("FAIL", n)); };
const noop = () => {};
const z = new Zone("arinar", [], [], { proc: true, seed: 7 });
// пустое место: точка в регионе, далеко от лагерей и безопасных зон
let spot: [number, number] | null = null;
for (let i = 0; i < 4000 && !spot; i++) { const x = 3000 + Math.random() * 42000, y = 3000 + Math.random() * 42000;
  if (!inSafe(x, y, 600, "arinar") && z.regionAt(x, y) && !z.near(x, y, 800).some((m) => Math.hypot(m.x - x, m.y - y) < 800)) spot = [x, y]; }
t("нашлась пустошь между лагерями", spot);
const p: ZPlayer = { sid: "a", x: spot![0], y: spot![1], hp: 1e12, maxHp: 1e12, armorRed: 0, alive: true, respawnAt: 0 };
const pm = new Map([["a", p]]);
const amb = () => z.mobs.filter((m) => m.ambient === "a" && !m.dead);
let now = 1_000_000, firstSeen: any[] = [], maxOwn = 0;
const seen = new Set<number>();
for (let s = 0; s < 6000; s++) { // 3000 с (шаг 0.5): ~300 проверок
  now += 500; p.x = spot![0]; p.y = spot![1];
  z.update(0.5, now, pm, noop, noop);
  for (const m of amb()) if (!seen.has(m.id)) { seen.add(m.id); firstSeen.push({ d: Math.hypot(m.x - p.x, m.y - p.y), m, tgt: m.targetSid }); }
  maxOwn = Math.max(maxOwn, amb().length);
  // «убиваем» тех, кто дошёл (имитация боя), чтобы снова стало пусто
  for (const m of amb()) if (Math.hypot(m.x - p.x, m.y - p.y) < 320) { m.dead = true; m.respawnAt = -1; }
}
const st = z.ambStats;
console.log("stats", JSON.stringify(st), "spawned mobs", firstSeen.length, "maxOwn", maxOwn);
t(`проверка раз в ${ZONE_GEN.ambientEvery} с (~300 за 3000 с): ${st.checks}`, st.checks >= 200 && st.checks <= 310);
t(`одиночки ≈10% (${st.singles})`, st.singles >= 8 && st.singles <= 55);
t(`группы ≈1% (${st.groups})`, st.groups <= 12);
t("появляются у края экрана", firstSeen.every((f) => f.d > ZONE_GEN.ambientEdge * 0.6));
t("сразу идут на игрока", firstSeen.every((f) => f.tgt === "a"));
t("не боссы", firstSeen.every((f) => !ZONE_MOBS[f.m.type].boss));
t("элита только вожак группы", firstSeen.filter((f) => f.m.elite).length <= st.groups);
t(`кап на игрока ${ZONE_GEN.ambientCap} (макс ${maxOwn})`, maxOwn <= ZONE_GEN.ambientCap);
// дошли ли (охота): моб от края приближается
{ const z2 = new Zone("arinar", [], [], { proc: true, seed: 7 }); const p2 = { ...p }; const pm2 = new Map([["a", p2]]);
  (ZONE_GEN as any).ambientChance = 100; let n2 = 1_000_000; let d0 = 0, d1 = 0, id = 0;
  for (let s = 0; s < 80; s++) { n2 += 250; z2.update(0.25, n2, pm2, noop, noop); const m = z2.mobs.find((x) => x.ambient === "a" && !x.dead);
    if (m && !id) { id = m.id; d0 = Math.hypot(m.x - p2.x, m.y - p2.y); } if (m && m.id === id) d1 = Math.hypot(m.x - p2.x, m.y - p2.y); }
  t(`моб бежит к игроку (${d0.toFixed(0)} → ${d1.toFixed(0)} px)`, id && d1 < d0 - 150);
  // рядом есть моб → не спавним; уход игрока → исчезают
  const before = z2.ambStats.singles; for (let s = 0; s < 60; s++) { n2 += 500; z2.update(0.5, n2, pm2, noop, noop); }
  t("рядом уже есть моб → новые не появляются", z2.ambStats.singles - before <= 1);
  p2.x += 5000; for (let s = 0; s < 400; s++) { n2 += 500; z2.update(0.5, n2, pm2, noop, noop); }
  t("игрок ушёл далеко → бродячие исчезли (не копятся)", z2.mobs.filter((x) => x.ambient === "a" && !x.dead && Math.hypot(x.x - p2.x, x.y - p2.y) > 2000).length === 0);
  (ZONE_GEN as any).ambientChance = 10; }
// админ: выкл
{ (ZONE_GEN as any).ambientOn = 0; const z3 = new Zone("arinar", [], [], { proc: true, seed: 7 }); const p3 = { ...p }; let n3 = 1_000_000;
  for (let s = 0; s < 400; s++) { n3 += 500; z3.update(0.5, n3, new Map([["a", p3]]), noop, noop); }
  t("ambientOn=0 → ничего", z3.ambStats.singles + z3.ambStats.groups === 0); (ZONE_GEN as any).ambientOn = 1; }
console.log(`ambient ${ok}/${ok + bad}`); if (bad) process.exit(1);
