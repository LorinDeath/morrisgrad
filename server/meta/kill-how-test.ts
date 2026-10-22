// Задания «одним ударом / только навыками / без навыков»: серверный учёт ударов (zone.damage → hb, k1) и проверка доски.
import { Zone, killHow } from "./zone";
import { BTASKS, boardEvent, boardRefresh, boardOf } from "./board";
import { newAccount, newHero } from "./profile";
let f = 0; const ok = (c: any, m: string) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) f++; };
const mk = () => { const z = new Zone("hellfire", [{ type: "blade_fly", x: 520, y: 150, respawn: 12 }], [], { proc: false }); const m: any = z.mobs.find((x: any) => x.type === "blade_fly"); m.reset = false; m.hp = m.maxHp; return { z, m }; };
const noop = () => {};
{ const { z, m } = mk(); let how: any = null; z.damage(m, "p1", m.maxHp * 10, (mm: any) => { how = killHow(mm, "p1"); }, undefined, "ba");
  ok(how?.oneshot === 1 && how.basicOnly === 1 && how.skillOnly === 0, "один удар автоатакой по целому — одним ударом, без навыков: " + JSON.stringify(how)); }
{ const { z, m } = mk(); let how: any = null; z.damage(m, "p1", 1, noop, undefined, "ba"); z.damage(m, "p1", m.maxHp * 10, (mm: any) => { how = killHow(mm, "p1"); }, undefined, "ab");
  ok(how?.oneshot === 0 && how.skillOnly === 0 && how.basicOnly === 0, "два удара разных видов — ни одно условие: " + JSON.stringify(how)); }
{ const { z, m } = mk(); let how: any = null; z.damage(m, "p1", 1, noop, undefined, "ab"); z.damage(m, "p1", m.maxHp * 10, (mm: any) => { how = killHow(mm, "p1"); }, undefined, "ab");
  ok(how?.skillOnly === 1 && how.oneshot === 0, "только навыками (2 удара): " + JSON.stringify(how)); }
{ const { z, m } = mk(); let how: any = null; z.damage(m, "p2", 1, noop, undefined, "ba"); z.damage(m, "p1", m.maxHp * 10, (mm: any) => { how = killHow(mm, "p1"); }, undefined, "ba");
  ok(how?.oneshot === 0 && how.basicOnly === 1, "моб уже ранен другим игроком — не «одним ударом»: " + JSON.stringify(how)); }
{ const { z, m } = mk(); let how: any = null; z.damage(m, "p1", m.maxHp * 10, (mm: any) => { how = killHow(mm, "p1"); }, undefined, "ba"); m.usedAbility.add("p1");
  ok(killHow(m, "p1").basicOnly === 0, "навык по мобу (usedAbility) — уже не «без навыков»"); }
{ const { m } = mk(); ok(JSON.stringify(killHow(m, "p1")) === '{"oneshot":0,"skillOnly":0,"basicOnly":0}', "без ударов игрока (урон по времени / чужой) — ничего"); }
// доска: условие проверяется по флагам события
{ const a: any = newAccount(); a.hero = "warrior"; const h: any = newHero("warrior"); h.lvl = 10; const ctx = { pkey: "uid:how" };
  boardRefresh(a, h, ctx); const b = boardOf(a);
  for (const [id, flag] of [["pw_os_fire", "oneshot"], ["pw_sk_fire", "skillOnly"], ["pw_ba_fire", "basicOnly"]] as const) {
    ok(BTASKS[id], "есть " + id); if (!BTASKS[id]) continue;
    if (!b.sel.weekly.includes(id)) b.sel.weekly.push(id); b.p[id] = 0; delete b.roll[id];
    const ev: any = { type: "kill", mob: "fire_imp", kind: "fire_imp", lvl: 12, cls: "warrior", biome: "fire" };
    boardEvent(a, h, ev, ctx); const p0 = b.p[id] || 0;
    boardEvent(a, h, { ...ev, [flag]: 1 }, ctx); ok(p0 === 0 && (b.p[id] || 0) === 1, `${id}: без флага ${flag} — 0, с флагом — 1 (${p0}→${b.p[id] || 0})`);
  } }
console.log(f ? `FAILED ${f}` : "kill-how ok"); process.exit(f ? 1 : 0);
