// Навыки конструктора у мобов работают со ВСЕМИ параметрами (раньше моб кастовал старую форму + огненный снаряд fire_spark).
// Запуск: cd server && bun meta/bm-mob-craft-test.ts
import { ZONE_MOBS, ITEM_BY_ID } from "./defs";
import { Zone, type ZPlayer } from "./zone";
import { registerBlackMobs } from "./blackMobs";
import { validatePatch, applyOverride } from "./overrides";
import { SK_DEFS } from "./skillCraft";
import { MOB_SKILLS } from "./mobSkills";
import "./skillReg";
let P = 0, F = 0; const ok = (c: any, m: string) => { if (c) { P++; console.log("PASS " + m); } else { F++; console.log("FAIL " + m); } };
registerBlackMobs(ITEM_BY_ID as any);
const sk = (id: string, p: any) => { const v = validatePatch("skdef" as any, id, p); ok(typeof v === "object", `навык ${id} проходит ${typeof v === "string" ? v : ""}`); applyOverride("skdef" as any, id, v); return SK_DEFS[id]; };
sk("skx_t_bolt", { name: "Проба: стрела", form: "proj", elem: "water", path: "sine", amp: 8, freq: 2, n: 3, spread: 30, spd: 600, range: 600, dmg: "normal", mul: 2, cd: 12 });
sk("skx_t_home", { name: "Проба: наводка", form: "proj", elem: "nature", path: "homing", seek: 900, turn: 900, spd: 500, range: 900, dmg: "black", pct: 3, k: 0, cd: 14 });
sk("skx_t_whip", { name: "Проба: плеть", form: "cone", elem: "stone", len: 200, arc: 90, dmg: "normal", slow: "stone", cd: 11 });
sk("skx_t_ring", { name: "Проба: кольцо", form: "nova", elem: "lightning", r: 180, ticks: 3, tickGap: 400, dmg: "pure", pct: 1, k: 0, freeze: 800, cd: 13 });
sk("skx_t_rain", { name: "Проба: дождь", form: "rain", elem: "ice", area: 120, r: 60, drops: 8, lead: 100, gap: 60, dmg: "normal", knock: 5, sHeal: 50, cd: 15 });
sk("skx_t_dash", { name: "Проба: рывок", form: "dash", elem: "fire", len: 260, w: 60, invuln: 400, trail: 300, dmg: "normal", sHaste: 50, cd: 10 });
ok(MOB_SKILLS.skx_t_bolt?.cd === 12 && MOB_SKILLS.skx_t_dash?.cd === 10, "кд моба = кд навыка из конструктора");
const z: any = new Zone("arinar", [], [], { proc: false });
const X = 32640, Y = 24000, type = "bmx_storm_warden", d = (ZONE_MOBS as any)[type];
type Hit = { sid: string; dmg: number; bm?: number; how?: string };
function cast(id: string, dx = 250, ms = 3000) {
  z.mobs.length = 0; z.projs.length = 0; z.events.length = 0; (z as any).mfx = [];
  const m = z.addMob(type, X, Y); m.skills = []; const pl: ZPlayer = { sid: "p", x: X + dx, y: Y, hp: 1e9, maxHp: 1e4, armorRed: 0, alive: true, respawnAt: 0, lvl: 10 };
  const players = new Map([["p", pl]]), hits: Hit[] = []; const onHit = (sid: string, dmg: number, _s: string, _m: any, bm?: number, how?: string) => hits.push({ sid, dmg, bm, how });
  let now = Date.now(); z.now = now; z.pl = players; z.curHit = onHit;
  z.heroCast(m, d, id, pl, players, now, 100, 1, 1000, 1, 0);
  const ev0 = [...z.events]; let still = true, x0 = m.x;
  for (let t = 0; t < ms; t += 50) { now += 50; if (t < 900 && Math.abs(m.x - x0) > 1) still = false; m.atkCd = 99; z.update(0.05, now, players, onHit, () => {}); }
  return { m, ev: [...ev0, ...z.events], hits, still, pl, x0 };
}
{ const r = cast("skx_t_bolt"); const pr = r.ev.filter((e: any) => e.k === "proj");
  ok(r.ev.some((e: any) => e.k === "tele"), "телеграф перед выстрелом");
  ok(pr.length === 3 && pr.every((e: any) => e.t === "skx_t_bolt"), `«Количество» 3 и спрайт навыка (не fire_spark): ${pr.map((e: any) => e.t).join(",")}`);
  ok(pr.every((e: any) => e.pth?.p === "sine"), "траектория «Синусоида» уходит клиенту");
  ok(r.hits.length >= 1 && r.hits.every((h) => h.how === "skill:skx_t_bolt" && !h.bm && Math.abs(h.dmg - r.hits[0].dmg) < 1e-6) && r.hits[0].dmg > 100, `обычный урон × «Множитель» (${r.hits.map((h) => Math.round(h.dmg)).join(",")})`); }
{ const r = cast("skx_t_home", 250); const pr = r.ev.find((e: any) => e.k === "proj");
  r.pl.y = Y; // цель на прямой — проверяем наводку отдельной целью сбоку
  ok(pr && pr.t === "skx_t_home", "наводящийся снаряд со своим спрайтом");
  ok(r.hits.length === 1 && r.hits[0].bm! > 0 && Math.abs(r.hits[0].bm! - 3) < 1e-6, `чёрный навык: % ОЗ игрока = pct 3 (${r.hits[0]?.bm})`); }
{ // наводка на игрока сбоку
  z.mobs.length = 0; z.projs.length = 0; z.events.length = 0; z.mfx = [];
  const m = z.addMob(type, X, Y); m.skills = []; const pl: ZPlayer = { sid: "p", x: X + 200, y: Y + 260, hp: 1e9, maxHp: 1e4, armorRed: 0, alive: true, respawnAt: 0, lvl: 10 };
  const players = new Map([["p", pl]]), hits: Hit[] = []; const oh = (sid: string, dmg: number, _s: string, _m: any, bm?: number, how?: string) => hits.push({ sid, dmg, bm, how });
  let now = Date.now(); z.now = now; z.pl = players; z.curHit = oh;
  z.heroCast(m, d, "skx_t_home", { ...pl, x: X + 300, y: Y }, players, now, 100, 1, 1000, 1, 0); // целился прямо, игрок — сбоку
  for (let t = 0; t < 3000; t += 50) { now += 50; m.atkCd = 99; z.update(0.05, now, players, oh, () => {}); }
  ok(z.events.some((e: any) => e.k === "ptg" && e.m === "p:p") && hits.length === 1, "«Самонаведение» мобского снаряда — на игрока (ptg p:sid), попадание"); }
{ const r = cast("skx_t_whip", 150); const c = r.ev.find((e: any) => e.k === "tele_cone"), a = r.ev.find((e: any) => e.k === "acone");
  ok(c && c.fx === "skx_t_whip" && Math.round(c.len) === Math.round(200 * Math.max(0.8, 1)), "плеть: телеграф-конус своей длины");
  ok(a && a.id === "skx_t_whip" && a.o === "m" && r.hits.length === 1, "плеть: событие acone (лист навыка) и попадание");
  ok(r.ev.some((e: any) => e.k === "pstatus" && e.to === "p" && e.s === "slow"), "плеть: «Замедление» → pstatus игроку");
  ok(r.still, "моб стоит во время замаха (можно уйти)"); }
{ const r = cast("skx_t_whip", 400); ok(r.hits.length === 0, "плеть: вне длины — промах"); }
{ const r = cast("skx_t_ring", 120); const ab = r.ev.filter((e: any) => e.k === "ability" && e.id === "skx_t_ring");
  ok(r.ev.some((e: any) => e.k === "tele_circle" && e.r === 180), "кольцо: телеграф радиуса r");
  ok(ab.length === 3 && r.hits.length === 3, `«Тики» 3 (${ab.length} событий, ${r.hits.length} ударов)`);
  ok(r.hits.every((h) => Math.abs(h.bm! - 1 / Math.sqrt(3)) < 1e-6), `чистый: % ОЗ × 1/√тиков (${r.hits[0]?.bm?.toFixed(3)})`);
  ok(r.ev.some((e: any) => e.k === "pstatus" && e.s === "freeze" && e.ms === 800), "«Заморозка» 800 мс → pstatus freeze"); }
{ const r = cast("skx_t_rain", 300); const ar = r.ev.find((e: any) => e.k === "arain");
  ok(r.ev.some((e: any) => e.k === "tele_circle" && Math.abs(e.x - (X + 300)) < 2), "дождь: телеграф на цели");
  ok(ar && Math.abs(ar.x - (X + 300)) < 2 && ar.pts?.length === 8, `дождь: центр на цели, капель 8 (${ar?.pts?.length})`);
  ok(r.hits.length >= 1 && r.hits.every((h) => Math.abs(h.dmg - 100 * Math.max(0.8, Math.min(1.8, 1)) / 4) < 30), `дождь: ×1/4 за каплю (${r.hits.length} попаданий)`);
  ok(r.ev.some((e: any) => e.k === "pstatus" && e.s === "knock" && e.d === 120), "«Отброс» 5 → pstatus knock 120 px (как у моба: 5 × 24)"); }
{ const r = cast("skx_t_dash", 150);
  ok(r.m.x - r.x0 > 200 && r.hits.length >= 1, `рывок: моб сместился (${Math.round(r.m.x - r.x0)}) и попал`);
  ok(r.ev.some((e: any) => e.k === "aline" && e.id === "skx_t_dash"), "рывок: событие aline (лист навыка)");
  ok(r.m.burstUntil > 0, "«Ускорение себя» → моб быстрее"); }
{ // выключатель админки skillCraft — прежнее поведение
  const { BMA_CFG } = await import("./blackArt"); BMA_CFG.skillCraft = false; const r = cast("skx_t_bolt"); BMA_CFG.skillCraft = true;
  ok(!r.ev.some((e: any) => e.k === "proj" && e.t === "skx_t_bolt" && e.pth), "skillCraft выкл — старая форма"); }
console.log(`${P} PASS / ${F} FAIL`); if (F) process.exitCode = 1;
