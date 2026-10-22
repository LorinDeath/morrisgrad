// Мобы у купола Альказака (hotfix 22.10): игрок у края купола убивает обычного моба, моб не уходит в «Уклонение» (неуязвимый сброс домой).
// Запуск: bun server/meta/mob-dome-test.ts
import { CITY_CFG, inCity, cityKeepOut, cityR } from "./city";
const { Zone } = await import("./zone"); const { ZONE_GEN } = await import("./zoneGen");
let ok = 0, bad = 0; const t = (n: string, c: any, x?: any) => { c ? (ok++, console.log("ok  ", n)) : (bad++, console.log("FAIL", n, x ?? "")); };
const z: any = new Zone("arinar", [], [], { proc: true, seed: ZONE_GEN.seed });
z.keepOut = cityKeepOut(); z.pruneKeepOut();
// как guardMux в service.ts: урон 0, если моб или атакующий под куполом
z.guard = { guardMobHit: (m: any, sid: string, ax: number, ay: number) => CITY_CFG.noDamage !== false && !!sid && (inCity(m.x, m.y) || (Number.isFinite(ax) && inCity(ax, ay))), noteFight() {}, guardProj: () => false, inDome: (x: number, y: number) => inCity(x, y), blackHit: () => false, pvpHit: () => false };
const R = cityR(), pool = z.mobs.filter((q: any) => !q.dead && q.special !== "boss" && !q.camp);
let k = 0;
function fight(label: string, px: number, py: number, mx: number, my: number, ticks = 200, hit = true) {
  const m: any = pool[k++]; m.x = mx; m.y = my; m.sx = mx; m.sy = my; m.reset = false; m.targetSid = null; m.spOk = 1; m.dead = false; m.hp = m.maxHp; m.fixed = false;
  const PL = new Map([["p1", { sid: "p1", x: px, y: py, hp: 1e12, maxHp: 1e12, alive: true, dead: false, lvl: 5 } as any]]); z.pl = PL;
  const T = Date.now(); let resets = 0, dealt = 0, tgt = 0, got = 0;
  for (let i = 0; i < ticks && !m.dead; i++) { z.events.length = 0; z.update(0.05, T + i * 50, PL, (sid: string, dmg: number) => { if (sid === "p1" && dmg > 0) got += dmg; }, () => {}); if (m.reset || z.events.some((e: any) => e.id === m.id && e.k === "evade")) resets++; if (m.targetSid) tgt++; if (hit && i % 4 === 0 && !m.dead) dealt += z.damage(m, "p1", Math.ceil(m.maxHp / 15), () => {}) || 0; }
  return { label, type: m.type, dead: m.dead, resets, dealt, tgt, got: Math.round(got), hp: Math.round(m.hp), maxHp: m.maxHp };
}
const S = CITY_CFG.y + R; // южный край купола
const a = fight("игрок на краю купола (R+10), моб рядом снаружи", CITY_CFG.x, S + 10, CITY_CFG.x + 150, S + 60);
t("на краю купола: моб не уходит в Уклонение", a.resets === 0, a); t("на краю купола: моба можно убить", a.dead && a.dealt > 0, a);
const a2 = fight("игрок на краю купола (R+10), моб атакует (игрок не бьёт)", CITY_CFG.x, S + 10, CITY_CFG.x + 60, S + 60, 200, false);
t("на краю купола: моб сам атакует и наносит урон игроку", a2.got > 0 && a2.resets === 0, a2);
const a3 = fight("игрок чуть внутри края (R-10), моб снаружи", CITY_CFG.x, S - 10, CITY_CFG.x + 60, S + 60, 200, false);
t("у самого края изнутри (в пределах запаса): без Уклонения", a3.resets === 0, a3);
const b = fight("игрок у купола (R+80), моб рядом", CITY_CFG.x, S + 80, CITY_CFG.x + 120, S + 140);
t("у купола: моб дерётся (берёт цель), не сбрасывается", b.tgt > 0 && b.resets === 0, b); t("у купола: моба можно убить", b.dead, b); t("у купола: моб наносит урон игроку", b.got > 0, b);
const c = fight("игрок далеко от города", 20000, 8000, 20150, 8000);
t("в поле: моба можно убить, без сброса", c.dead && c.resets === 0, c);
const d = fight("игрок под куполом (R-300), моб снаружи", CITY_CFG.x, S - 300, CITY_CFG.x + 100, S + 80);
t("под куполом: моб не берёт игрока целью", d.tgt === 0, d); t("под куполом: урон из-под купола 0 (как задумано)", d.dealt === 0, d); t("под куполом: моб не уходит в Уклонение", d.resets === 0, d);
// поводок по-прежнему работает
{ const m: any = pool[k++]; m.x = 20000; m.y = 9000; m.sx = 20000; m.sy = 9000 - ZONE_GEN.leash - 200; m.reset = false; m.spOk = 1; m.dead = false; m.hp = m.maxHp; m.targetSid = "p1";
  const PL = new Map([["p1", { sid: "p1", x: 20000, y: 9050, hp: 1e12, maxHp: 1e12, alive: true, lvl: 5 } as any]]); z.pl = PL; z.update(0.05, Date.now(), PL, () => {}, () => {});
  t("поводок: утащенный далеко моб сбрасывается как раньше", m.reset === true); }

// у самого края изнутри: моб не «висит» на кольце с целью (урон там 0 в обе стороны) — теряет её
t("у края изнутри (R-10): моб без цели, урона игроку нет", a3.tgt <= 2 && a3.got === 0, a3);
// дома мобов: пересборка лагерей (админка) и новые мобы — не под куполом
{ const regs = z.gen.regions.filter((r: any) => r.table.length && r.rect[0] < CITY_CFG.x + R && r.rect[2] > CITY_CFG.x - R && r.rect[1] < CITY_CFG.y + R && r.rect[3] > CITY_CFG.y - R);
  for (const r of regs) z.regenRegion(r.id);
  const bad2 = z.mobs.filter((m: any) => !m.dead && m.respawnAt !== -1 && m.special !== "boss" && Math.hypot(m.sx - CITY_CFG.x, m.sy - CITY_CFG.y) < R + 60);
  t("пересборка лагерей у города: ни одного дома моба под куполом (R+60)", regs.length > 0 && bad2.length === 0, [regs.length, bad2.length]);
  const nm: any = z.addMob(pool[0].type, CITY_CFG.x + 200, CITY_CFG.y + 100, {});
  t("новый моб с точкой под куполом — дом за краем", Math.hypot(nm.sx - CITY_CFG.x, nm.sy - CITY_CFG.y) > R + 60 && nm.x === nm.sx, Math.round(Math.hypot(nm.sx - CITY_CFG.x, nm.sy - CITY_CFG.y))); }
console.log(`\n${ok} ok, ${bad} fail`); if (bad) process.exit(1);
