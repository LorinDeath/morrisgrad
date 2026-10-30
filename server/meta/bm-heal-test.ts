// t1062u: лекари чёрных мобов лечат союзников — поддержка из конструктора (цель self/allies/low, радиус, %, перезарядка, бафф),
// правка через админку (validatePatch → тот же id), 22 лекаря контента 30.10 лечат союзников в бою с игроком.
// Запуск: cd server && bun meta/bm-heal-test.ts
import { build, } from "../../tools/content/gen-1030";
import { validatePatch, applyOverride } from "./overrides";
import { Zone, type ZPlayer } from "./zone";
import { registerBlackMobs, cleanSup, BM_MOBS } from "./blackMobs";
import { ITEM_BY_ID, ZONE_MOBS } from "./defs";
import "./skillReg";
registerBlackMobs(ITEM_BY_ID as any); const { mobs } = build();
let pass = 0, fail = 0; const ok = (c: any, m: string) => { if (c) pass++; else { fail++; console.log("FAIL " + m); } };
// 1) очистка значений
ok(cleanSup({}) === undefined && cleanSup({ tgt: "" }) === undefined, "пусто / без цели — поддержки нет");
ok(typeof cleanSup({ tgt: "all" }) === "string" && typeof cleanSup({ tgt: "low", buff: "x" }) === "string", "неверная цель / бафф — ошибка");
const c: any = cleanSup({ tgt: "low", r: 99999, pct: 500, cd: 1, buff: "dmg" }); ok(c.r === 1200 && c.pct === 100 && c.cd === 500 && c.bv === 20 && c.bms === 4000, "значения зажимаются, бафф урона по умолчанию +20 % на 4 с");
// 2) 22 лекаря контента — все с поддержкой союзников
const H = mobs.filter((m) => m.role === "healer"); ok(H.length === 22, `лекарей ${H.length}`);
ok(H.every((m) => (ZONE_MOBS as any)[m.id].bmSup && (ZONE_MOBS as any)[m.id].bmSup.tgt !== "self"), "у всех 22 — лечение союзников (bmSup)");
// 3) бой: лекарь + 2 раненых союзника (тот же лагерь), игрок рядом
const z: any = new Zone("arinar", [], [], { proc: true }); for (const m of z.mobs) { m.dead = true; m.respawnAt = 9e15; }
const base = z.camps.find((cc: any) => !z.safeAt(cc.x, cc.y, 2000))!; const X = base.x + 900, Y = base.y + 900;
const tank = mobs.find((m) => m.role === "tank")!.id;
const fight = (hid: string, secs: number) => {
  for (const m of z.mobs) if (!m.dead) { m.dead = true; m.respawnAt = 9e15; }
  const h = z.addMob(hid, X, Y), a = z.addMob(tank, X + 60, Y), b = z.addMob(tank, X - 60, Y), far = z.addMob(tank, X + 2000, Y);
  for (const m of [h, a, b, far]) { m.camp = 777; m.cursed = false; m.ench = 0; }
  a.hp = a.maxHp * 0.3; b.hp = b.maxHp * 0.6; far.hp = far.maxHp * 0.3; h.hp = h.maxHp * 0.9;
  const pl = new Map<string, ZPlayer>([["p", { sid: "p", x: X, y: Y + 150, hp: 1e12, maxHp: 1e12, armorRed: 0, alive: true, respawnAt: 0, lvl: 30 }]]);
  let now = 60_000_000; z.events.length = 0; const ev: any[] = [];
  for (let s = 0; s < secs * 10; s++) { now += 100; pl.get("p")!.x = X; pl.get("p")!.y = Y + 150; z.update(0.1, now, pl, () => {}, () => {}); ev.push(...z.events.filter((e: any) => e.k === "mheal" && e.id === h.id)); z.events.length = 0; }
  return { h, a, b, far, ev, now };
};
const hLow = H.find((m) => (ZONE_MOBS as any)[m.id].bmSup.tgt === "low" && (ZONE_MOBS as any)[m.id].bmSup.buff === "shield")!.id;
{ const r = fight(hLow, 12), S = (ZONE_MOBS as any)[hLow].bmSup;
  ok(r.ev.length >= 1, `«самый раненый»: лечения были (${r.ev.length})`);
  ok(r.ev[0]?.t?.[0]?.[0] === r.a.id, "первым лечит самого раненого союзника (30 %), не себя");
  ok(r.a.hp > r.a.maxHp * 0.3, `союзник подлечен: ${(r.a.hp / r.a.maxHp * 100).toFixed(1)} %`);
  ok(!r.ev.some((e: any) => e.t.some((t: any) => t[0] === r.far.id)), "союзник вне радиуса — не лечится");
  ok(r.ev.length <= Math.ceil(12000 / S.cd) + 1, `перезарядка ${S.cd} мс: ${r.ev.length} лечений за 12 с`);
  ok(r.ev.every((e: any) => e.b === "shield") && (r.a.shieldUntil > 0), "бафф «щит» на союзнике");
  ok(r.ev.every((e: any) => e.t.every((t: any) => Number.isFinite(t[2]) && Number.isFinite(t[3]))) && Number.isFinite(r.ev[0].x), "событие mheal: координаты цели и лекаря для клиента"); }
const hAll = H.find((m) => (ZONE_MOBS as any)[m.id].bmSup.tgt === "allies")!.id;
{ const r = fight(hAll, 8);
  ok(r.ev.length >= 1 && r.ev[0].t.length >= 3, `«все рядом»: лечит сразу ${r.ev[0]?.t?.length} (лекарь + 2 союзника)`);
  ok(r.a.hp > r.a.maxHp * 0.3 && r.b.hp > r.b.maxHp * 0.6, "оба союзника подлечены");
  ok(z.bmBuffDmg(r.a, r.now - 100) > 1.1, `бафф урона союзнику ×${z.bmBuffDmg(r.a, r.now - 100).toFixed(2)}`); }
// 4) никто не ранен, бафа нет — не тратит перезарядку
{ const id = "bmx_c30_heal_probe"; (ZONE_MOBS as any)[id] = { ...(ZONE_MOBS as any)[hLow], bmSup: { tgt: "low", r: 300, pct: 10, cd: 3000 } };
  const r = (() => { for (const m of z.mobs) if (!m.dead) { m.dead = true; m.respawnAt = 9e15; } const h = z.addMob(id, X, Y), a = z.addMob(tank, X + 60, Y); h.camp = a.camp = 778; let n = 0;
    const pl = new Map<string, ZPlayer>([["p", { sid: "p", x: X, y: Y + 150, hp: 1e12, maxHp: 1e12, armorRed: 0, alive: true, respawnAt: 0, lvl: 30 }]]); let now = 70_000_000;
    for (let s = 0; s < 50; s++) { now += 100; a.hp = a.maxHp; h.hp = h.maxHp; z.update(0.1, now, pl, () => {}, () => {}); n += z.events.filter((e: any) => e.k === "mheal").length; z.events.length = 0; } return n; })();
  ok(r === 0, `все целы — лечения нет (${r})`); delete (ZONE_MOBS as any)[id]; }
// 5) правка через админку — тот же id, поле сохраняется
{ const id = H[0].id, before = Object.keys(BM_MOBS).length;
  const p: any = validatePatch("bmmob" as any, id, { sup: { tgt: "allies", r: 200, pct: 5, cd: 4000, buff: "spd", bms: 2000 } }); ok(typeof p === "object", "админка: поддержка проходит проверку " + (typeof p === "string" ? p : ""));
  applyOverride("bmmob" as any, id, p); ok(Object.keys(BM_MOBS).length === before, "правка — тот же моб, без копии");
  ok((ZONE_MOBS as any)[id].bmSup?.tgt === "allies" && (ZONE_MOBS as any)[id].bmSup?.buff === "spd", "в мире — новая цель и бафф");
  const bad = validatePatch("bmmob" as any, id, { sup: { tgt: "everyone" } }); ok(typeof bad === "string", "неверная цель отклонена"); }
console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
