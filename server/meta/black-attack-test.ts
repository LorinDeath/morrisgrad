// Аудит атаки артефакта: дуга/снаряд, сервер-авторитет, чёрные мобы как игроки, правило посохов.
// Запуск: cd server && bun meta/black-attack-test.ts
import { BMA_CFG, BM_PARTS, ARC_MAX, chargedAtk, computeArtifact, artModeAtk, staffDirs, isStaff, staffMuzzles, shotOrigins, type BmPart } from "./blackArt";
import { BM_WEAPON_PTS } from "./bmWeaponPts";
import { readFileSync, existsSync } from "node:fs";
import { registerBlackMobs, mobAtk, mobFinal, BM_MOBS } from "./blackMobs";
import { ZONE_MOBS, ITEM_BY_ID } from "./defs";
import { Zone, inArc, factionOf, type ZPlayer } from "./zone";
import { SCHEMA, validatePatch } from "./overrides";

let pass = 0, fail = 0;
const ok = (c: any, m: string) => { if (c) pass++; else fail++; console.log((c ? "PASS " : "FAIL ") + m); };
const near = (a: number, b: number, e = 1e-6) => Math.abs(a - b) <= e;
registerBlackMobs(ITEM_BY_ID as any);

// ---------- 1. заряд и формы ----------
{
  const arc = { kind: "arc" as const, range: 120, arc: 1.15, max: 4 };
  const a0 = chargedAtk(arc, 50, 0), a1 = chargedAtk(arc, 50, 1);
  ok(a0.range === 120 && near(a0.arc!, 1.15), "неполный заряд: размер удара не меняется");
  ok(a1.range === 180 && near(a1.arc!, Math.min(ARC_MAX, 1.15 * Math.sqrt(1.5))), "полный заряд: дуга ×Мощность (радиус ×m, угол ×√m)");
  ok(chargedAtk({ ...arc, arc: 3 }, 100, 1).arc! <= ARC_MAX + 1e-9, "угол дуги не больше ARC_MAX (вне спины)");
  ok(a1.max === BMA_CFG.arcMax, "взмах задевает всех в дуге до arcMax");
  const pr = { kind: "proj" as const, range: 9 * 32, width: 22 };
  const p1 = chargedAtk(pr, 80, 1); ok(p1.range === Math.min(Math.round(288 * 1.8), BMA_CFG.maxRangeTiles * 32) && p1.width === Math.round(22 * 1.8), "снаряд: дальность (до maxRangeTiles) и размер ×Мощность");
  ok(chargedAtk({ ...pr, range: 2000 }, 0, 0).range === BMA_CFG.maxRangeTiles * BMA_CFG.tile, "дальность не больше админского максимума");
  ok(chargedAtk(pr, 500, 1).range <= BMA_CFG.maxRangeTiles * BMA_CFG.tile && chargedAtk(pr, 500, 1).width! <= 22 * BMA_CFG.powerMaxMul, "предохранитель Мощности");
  ok(inArc(0, 0, 1, 0, 100, 0.5, 80, 10, 10) && !inArc(0, 0, 1, 0, 100, 0.5, -30, 0, 10) && !inArc(0, 0, 1, 0, 100, 0.5, 150, 0, 10), "inArc: внутри / за спиной / дальше радиуса");
}

// ---------- 2. правило посохов ----------
{
  BMA_CFG.staffTest = false; BMA_CFG.staffStatsAdd = false;
  const S = computeArtifact({ handle: "fire_handle", blade: "fire_staff" })!;
  ok(isStaff(BM_PARTS.fire_staff) && S.staff && S.ranged && S.atk.kind === "proj" && S.alt?.kind === "arc", "основной посох: дальний по умолчанию, есть ближняя форма");
  ok(artModeAtk(S, true).kind === "arc" && artModeAtk(S, false).kind === "proj", "переключатель режима посоха");
  const Sw = computeArtifact({ handle: "fire_handle", blade: "fire_blade" })!;
  ok(!Sw.staff && artModeAtk(Sw, false).kind === "arc" && artModeAtk(Sw as any, true) === Sw.atk, "клинок: режим не переключается");
  const full = { handle: "fire_handle", blade: "fire_staff", blade2: "fire_blade2", blade3: "fire_blade3", crystal: "fire_crystal" };
  const A0 = computeArtifact(full)!;
  ok((A0.shots || 1) === 1 && !A0.atk.count, "2/3 лезвие — клинки: один снаряд");
  ok(near(A0.stats.bdmg, 0.08 + 0.02, 1e-9) && A0.stats.barm === 5, "клинки во 2/3: статы складываются как раньше");
  BMA_CFG.staffTest = true; // тестовый флаг админки: 2/3 лезвия — посохи
  const A3 = computeArtifact(full)!;
  ok(A3.shots === 3 && A3.atk.count === 3, "посох + 2 посоха: три снаряда");
  ok(near(A3.stats.bdmg, 0.08, 1e-9) && A3.stats.power === 40 && A3.stats.barm === 5 && A3.stats.bcap === 12, "доп. посохи: боевые статы НЕ складываются, защитные — да");
  BMA_CFG.staffStatsAdd = true; ok(near(computeArtifact(full)!.stats.bdmg, 0.1, 1e-9), "staffStatsAdd: боевые статы посохов складываются"); BMA_CFG.staffStatsAdd = false;
  const A2 = computeArtifact({ handle: "fire_handle", blade: "fire_staff", blade2: "fire_blade2" })!; ok(A2.shots === 2, "посох + 1 посох: два снаряда");
  const ch = chargedAtk(A3.atk, 0, 0); ok(ch.count === 3 && near(ch.spread!, BMA_CFG.staffSpread * Math.PI / 180 * 2), "залп: веер staffSpread° между снарядами");
  const D = staffDirs(3, 1, 0), ang = D.map(([x, y]) => Math.atan2(y, x) * 180 / Math.PI);
  ok(D.length === 3 && near(ang[0], -BMA_CFG.staffSpread, 1e-6) && near(ang[1], 0) && near(ang[2], BMA_CFG.staffSpread, 1e-6), "staffDirs: −12° / 0° / +12°");
  const Am = computeArtifact({ handle: "fire_handle", blade: "fire_blade", blade2: "fire_blade2", blade3: "fire_blade3" })!;
  ok(Am.atk.kind === "arc" && !Am.ranged && !chargedAtk(Am.atk, 0, 0).count, "смесь: основной клинок — одна дуга (снаряды посохов только в дальнем)");
  BMA_CFG.staffTest = false;
  const P2: Record<string, BmPart> = { ...BM_PARTS, st2: { ...BM_PARTS.fire_blade2, id: "st2", form: "staff" }, b3: { ...BM_PARTS.fire_blade3, id: "b3", img: "blade3_1" } };
  const Mx = computeArtifact({ handle: "fire_handle", blade: "fire_staff", blade2: "st2", blade3: "b3" }, P2)!;
  ok(Mx.shots === 2 && near(Mx.stats.bdmg, 0.1, 1e-9), "смесь посох+клинок во 2/3: +1 снаряд, статы клинка складываются");
  ok(isStaff({ ...BM_PARTS.fire_blade, form: undefined, img: "blade_3" } as any, "blade") && !isStaff({ ...BM_PARTS.fire_blade, img: "blade_2" } as any, "blade"), "без поля form: лист blade_3 («Посох-жаровня») — посох");
  ok(SCHEMA.bpart.fields.some((f: any) => f.path === "form") && ["staffSpread", "staffStatsAdd", "staffTest", "staffRangeTiles"].every((k) => SCHEMA.bmagic.fields.some((f: any) => f.path === k)), "админка: тип лезвия и настройки посохов");
  ok(typeof validatePatch("bpart" as any, "fire_blade2", { form: "staff" }) === "object", "правка детали: form = staff проходит");
  const old = { ...computeArtifact({ handle: "fire_handle", blade: "fire_blade" })! }; delete (old as any).staff; ok(!("staff" in old) && !("shots" in old), "старые снимки без новых полей — работают как раньше (поля дополнительные)");
}


// ---------- 2б. посохи Художника: встроенные детали, тип листа, дуло ----------
{
  BMA_CFG.staffTest = false;
  const IDX = JSON.parse(readFileSync(new URL("../../public/bm-art/weapon/index.json", import.meta.url), "utf8"));
  const keys = ["blade_staff_1", "blade_staff_2", "blade_staff_3", ...[1, 2, 3, 4, 5].flatMap((i) => [`blade2_staff_${i}`, `blade3_staff_${i}`])];
  ok(keys.every((k) => IDX[k]?.type === "staff" && IDX[k].points.muzzle && existsSync(new URL(`../../public/bm-art/weapon/${k}.png`, import.meta.url)) && existsSync(new URL(`../../public/bm-art/weapon/${k}_glow.png`, import.meta.url))), "13 листов посохов в игре: тип staff, дуло, png + glow");
  ok(IDX.blade_3.type === "staff" && IDX.blade_3_ranged.type === "staff" && BM_WEAPON_PTS.blade_3.type === "staff", "«Посох-жаровня» (blade_3) — тип staff");
  ok(IDX.blade_1.type === "blade" && IDX.blade2_1.type === "blade", "клинки остаются клинками");
  const own = Object.values(BM_PARTS).filter((p) => /_staff_|^blade_staff/.test(p.img || ""));
  ok(own.length === 13 && own.every((p) => isStaff(p, p.type) && !p.hidden), `встроенные детали-посохи Художника (${own.length}), открыты в кузне`);
  ok(isStaff({ ...BM_PARTS.fire_blade2, form: undefined, img: "blade2_staff_3" } as any, "blade2") && !isStaff({ ...BM_PARTS.fire_blade2, form: undefined, img: "blade2_3" } as any, "blade2"), "без поля form: тип берётся из атласа");
  const W3 = { handle: "fire_handle", blade: "fire_staff_arch", blade2: "fire_b2staff_1", blade3: "fire_b3staff_1", crystal: "fire_crystal" };
  const A = computeArtifact(W3)!; ok(A.staff && A.ranged && A.shots === 3 && A.atk.count === 3, "три посоха Художника — тройной выстрел без тестового флага");
  ok(near(A.stats.bdmg, 0.1, 1e-9) && A.stats.barm === 2 + 1, "боевые статы доп. посохов не складываются, броня — да");
  const M = staffMuzzles(W3); const pm = BM_WEAPON_PTS.blade_staff_1.muzzle!, g = BM_WEAPON_PTS.handle_1.grip!, hb = BM_WEAPON_PTS.handle_1.bladeBase!, bb = BM_WEAPON_PTS.blade_staff_1.base!;
  ok(M.length === 3 && M[0][0] < M[1][0] && M[1][0] < M[2][0], "дула: 3-е лезвие слева, основной в центре, 2-е справа");
  ok(M[1][0] === hb[0] - g[0] - bb[0] + pm[0] && M[1][1] === hb[1] - g[1] - bb[1] + pm[1] && M.every((m) => m[1] < -20), "дуло основного посоха — по цепочке листов, выше руки");
  const b1 = BM_WEAPON_PTS.blade_staff_1, q2 = BM_WEAPON_PTS.blade2_staff_1;
  ok(M[2][0] === M[1][0] - pm[0] + bb[0] - bb[0] + b1.branch1![0] - q2.base![0] + q2.muzzle![0] - (b1.base![0] - bb[0]), "дуло 2-го лезвия: branch1 → base → muzzle");
  const O = shotOrigins(M, 3, 1000, 1000, 1, 0), s = BMA_CFG.muzzleScale;
  ok(O.every(([x]) => x > 1000) && O[0][1] < O[1][1] && O[1][1] < O[2][1], "прицел вправо: снаряды вылетают впереди, слева направо по вееру");
  ok(near(O[1][0], 1000 - s * M[1][1]) && near(O[1][1], 1000 + s * M[1][0]), "точка вылета = дуло × muzzleScale, повёрнуто по прицелу");
  const Ou = shotOrigins(M, 3, 0, 0, 0, -1); ok(Ou.every(([, y]) => y < 0) && Ou[0][0] < Ou[2][0], "прицел вверх: вылет над героем, 3-е лезвие слева");
  BMA_CFG.muzzleScale = 0; ok(shotOrigins(M, 3, 5, 6, 1, 0).every(([x, y]) => x === 5 && y === 6), "muzzleScale 0 — из центра"); BMA_CFG.muzzleScale = s;
  ok(shotOrigins(staffMuzzles({ handle: "fire_handle", blade: "fire_blade_r" }), 1, 0, 0, 1, 0)[0][0] > 0, "дальнее лезвие без посохов — из своего дула");
  ok(SCHEMA.bmagic.fields.some((f: any) => f.path === "muzzleScale"), "админка: muzzleScale");
}

// ---------- 3. зона: дуга и снаряд игрока ----------
const mk = () => { const z = new Zone("arinar", [], [], { proc: true }); const b = z.camps.find((c) => !z.safeAt(c.x, c.y, 2000))!;
  for (const m of z.mobs) { m.dead = true; m.respawnAt = 9e15; } return { z, cx: b.x + 900, cy: b.y + 900 }; };
const norm = Object.keys(ZONE_MOBS).find((t) => !(ZONE_MOBS as any)[t].black && !(ZONE_MOBS as any)[t].boss && (ZONE_MOBS as any)[t].lvl >= 5 && factionOf(t) !== "black")!;
const P = (sid: string, x: number, y: number): ZPlayer => ({ sid, x, y, hp: 1e9, maxHp: 1e9, armorRed: 0, alive: true, respawnAt: 0, lvl: 10 } as any);
{
  const { z, cx, cy } = mk(); const me = P("me", cx, cy);
  const atk = chargedAtk({ kind: "arc", range: 120, arc: 1.15, max: 4 }, 0, 0);
  const inA = [z.addMob(norm, cx + 60, cy, { fixed: true }), z.addMob(norm, cx + 70, cy + 50, { fixed: true }), z.addMob(norm, cx + 70, cy - 50, { fixed: true })];
  const out = [z.addMob(norm, cx - 60, cy, { fixed: true }), z.addMob(norm, cx + 260, cy, { fixed: true })];
  const T = z.targetsInDir(me, 1, 0, atk);
  ok(inA.every((m) => T.includes(m)) && out.every((m) => !T.includes(m)) && new Set(T).size === T.length, `дуга игрока: все в дуге по разу (${T.length}), за спиной и дальше — нет`);
  for (const m of [...inA, ...out]) { m.dead = true; m.respawnAt = 9e15; }
  // снаряд: попал / увернулся
  const hits: number[] = [];
  const tgt = z.addMob(norm, cx + 200, cy, { fixed: true });
  z.fire({ o: "p", sid: "me", t: "fire_spark", x: cx, y: cy, dx: 1, dy: 0, range: 300, w: 22, max: 1, onHit: (m: any) => hits.push(m.id) } as any);
  for (let i = 0; i < 40; i++) z.updateProjs(0.05, new Map());
  ok(hits.length === 1 && hits[0] === tgt.id, "снаряд: урон только при попадании, один раз");
  const hits2: number[] = []; const dod = z.addMob(norm, cx + 200, cy + 300, { fixed: true }); dod.x = cx + 250; dod.y = cy + 300;
  const t2 = z.addMob(norm, cx + 250, cy + 300, { fixed: true }); tgt.dead = true; dod.dead = true;
  z.fire({ o: "p", sid: "me", t: "fire_spark", x: cx, y: cy + 300, dx: 1, dy: 0, range: 300, w: 22, max: 1, onHit: (m: any) => hits2.push(m.id) } as any);
  z.updateProjs(0.05, new Map()); t2.y += 120; // цель ушла с линии
  for (let i = 0; i < 40; i++) z.updateProjs(0.05, new Map());
  ok(hits2.length === 0, "снаряд: цель ушла — промах");
  // посохи: 3 снаряда веером, каждый — своя цель
  t2.dead = true; const fan = staffDirs(3, 1, 0), got = new Map<number, number>(), tg: any[] = [];
  for (const [vx, vy] of fan) tg.push(z.addMob(norm, cx + vx * 220, cy + 600 + vy * 220, { fixed: true }));
  for (const [vx, vy] of fan) z.fire({ o: "p", sid: "me", t: "fire_spark", x: cx, y: cy + 600, dx: vx, dy: vy, range: 300, w: 22, max: 1, onHit: (m: any) => got.set(m.id, (got.get(m.id) || 0) + 1) } as any);
  for (let i = 0; i < 40; i++) z.updateProjs(0.05, new Map());
  ok(tg.every((m) => got.get(m.id) === 1), "тройной выстрел: каждый снаряд попал в свою цель, по разу");
}

// ---------- 4. чёрные мобы как игроки ----------
{
  const { z, cx, cy } = mk(); let now = 60_000_000;
  const wm = z.addMob("bmx_ash_warden", cx, cy, { fixed: true }); const d: any = ZONE_MOBS.bmx_ash_warden;
  ok(d.bmAtk?.kind === "arc", "Пепельный страж: ближняя дуга своим лезвием");
  const front = P("f", cx + 40, cy), back = P("b", cx - 70, cy), far = P("x", cx + 400, cy);
  const pl = new Map([["f", front], ["b", back], ["x", far]]); const got: Record<string, number> = {};
  let arcs = 0;
  for (let i = 0; i < 120; i++) { now += 50; z.events.length = 0; z.update(0.05, now, pl, (sid) => { got[sid] = (got[sid] || 0) + 1; }, () => {}); arcs += z.events.filter((e: any) => e.k === "marc" && e.id === wm.id).length; wm.x = cx; wm.y = cy; }
  ok(arcs > 0 && got.f === arcs, `взмах стража: дуга видна (marc ×${arcs}), игрок в дуге получает урон ровно раз за взмах (${got.f})`);
  ok(!got.b && !got.x, "за спиной и вне досягаемости — урона нет");
  const ev = (() => { z.events.length = 0; wm.atkCd = 0; now += 50; z.update(0.05, now, pl, () => {}, () => {}); return z.events.find((e: any) => e.k === "marc") as any; })();
  ok(ev && ev.r === d.bmAtk.range && near(ev.a, d.bmAtk.arc, 1e-3), "событие marc = хитбокс сервера (радиус и угол)");
  // чёрный против обычного моба: та же дуга
  wm.dead = true; wm.respawnAt = 9e15;
  const { z: z2, cx: x2, cy: y2 } = mk(); const w2 = z2.addMob("bmx_ash_warden", x2, y2, { fixed: true });
  const o1 = z2.addMob(norm, x2 + 50, y2, { fixed: true }), o2 = z2.addMob(norm, x2 + 50, y2 + 30, { fixed: true }), o3 = z2.addMob(norm, x2 - 80, y2, { fixed: true });
  w2.mobTarget = o1.id; o1.mobTarget = w2.id; w2.atkCd = 0; const hp = [o1.hp, o2.hp, o3.hp];
  z2.now = now; z2.events.length = 0; z2.mobFight(w2, d, 0.05, () => {}, 1);
  ok(z2.events.some((e: any) => e.k === "marc") && o1.hp < hp[0] && o2.hp < hp[1] && o3.hp === hp[2], "страж против мобов: все в дуге получили урон, за спиной — нет");
  // чёрный лучник: настоящий снаряд, увернуться можно
  const da: any = ZONE_MOBS.bmx_ember_archer; ok(da.bmAtk?.kind === "proj", "Угольный лучник: снаряд");
  const { z: z3, cx: x3, cy: y3 } = mk(); const ar = z3.addMob("bmx_ember_archer", x3, y3, { fixed: true });
  const tp = P("t", x3 + 150, y3); const pl3 = new Map([["t", tp]]); let hitN = 0, projN = 0, srcBm = 0;
  for (let i = 0; i < 200 && !hitN; i++) { now += 50; z3.events.length = 0; z3.update(0.05, now, pl3, (_s, _d, _src, _m, bm) => { hitN++; if (bm !== undefined) srcBm++; }, () => {}); projN += z3.events.filter((e: any) => e.k === "proj" && e.bm).length; ar.x = x3; ar.y = y3; }
  ok(projN > 0 && hitN === 1, `лучник по игроку: летит снаряд (${projN}), урон при попадании`);
  // уворот: после прицела игрок уходит
  const { z: z4, cx: x4, cy: y4 } = mk(); const a4 = z4.addMob("bmx_ember_archer", x4, y4, { fixed: true }); const tp4 = P("t", x4 + 150, y4); const pl4 = new Map([["t", tp4]]);
  let h4 = 0, fired = false, moved = false;
  for (let i = 0; i < 200; i++) { now += 50; z4.events.length = 0; z4.update(0.05, now, pl4, () => { h4++; }, () => {}); a4.x = x4; a4.y = y4;
    if (!moved && z4.events.some((e: any) => e.k === "proj" && e.bm)) { fired = true; moved = true; tp4.y += 160; tp4.x += 400; } if (moved && i > 0 && fired && z4.projs.length === 0) break; }
  ok(fired && h4 === 0, "лучник: игрок ушёл с линии — промах");
  // лучник против моба: снаряд vm
  const { z: z5, cx: x5, cy: y5 } = mk(); const a5 = z5.addMob("bmx_ember_archer", x5, y5, { fixed: true }); const o5 = z5.addMob(norm, x5 + 150, y5, { fixed: true }); const h5 = o5.hp;
  a5.mobTarget = o5.id; a5.atkCd = 0; z5.now = now; z5.mobFight(a5, da, 0.05, () => {}, 1);
  const pv: any = z5.projs.find((p: any) => p.vm); ok(!!pv && pv.bm, "лучник против моба: настоящий снаряд");
  for (let i = 0; i < 40; i++) z5.updateProjs(0.05, new Map()); ok(o5.hp < h5, "снаряд попал в моба");
  const o6 = z5.addMob(norm, x5 + 150, y5 + 200, { fixed: true }); const h6 = o6.hp; a5.y = y5 + 200; a5.mobTarget = o6.id; a5.atkCd = 0; o5.dead = true;
  z5.mobFight(a5, da, 0.05, () => {}, 1); z5.updateProjs(0.05, new Map()); o6.y += 150;
  for (let i = 0; i < 40; i++) z5.updateProjs(0.05, new Map()); ok(o6.hp === h6, "моб ушёл с линии — промах");
  // посохи у чёрного моба: те же правила
  BMA_CFG.staffTest = false;
  const w = { handle: "fire_handle", blade: "fire_staff", blade2: "fire_blade2", blade3: "fire_blade3" };
  ok(mobAtk(w, true).kind === "proj" && !mobAtk(w, true).count, "моб с посохом: дальний, один снаряд (2/3 — клинки)");
  ok(mobFinal({ ...BM_MOBS.bmx_ash_warden, weapon: { handle: "fire_handle", blade: "fire_staff" } } as any).ranged, "страж с посохом в руке — стрелок");
  BMA_CFG.staffTest = true; ok(mobAtk(w, true).count === 3, "моб: посох + 2 посоха — три снаряда");
  const dd: any = { ...da, bmAtk: mobAtk(w, true) }; const n0 = z5.projs.length; a5.atkCd = 0; const o7 = z5.addMob(norm, a5.x + 150, a5.y, { fixed: true }); a5.mobTarget = o7.id; o6.dead = true;
  dd.bmMz = staffMuzzles({ handle: "fire_handle", blade: "fire_staff_arch", blade2: "fire_b2staff_1", blade3: "fire_b3staff_1" });
  z5.mobFight(a5, dd, 0.05, () => {}, 1); ok(z5.projs.length - n0 === 3, "моб-посох стреляет тремя снарядами веером");
  { const P3 = z5.projs.slice(-3) as any[]; ok(P3.every((p) => p.x > a5.x) && new Set(P3.map((p) => Math.round(p.y))).size === 3, "снаряды моба — из дула каждого посоха (три разные точки впереди)"); }
  ok(Array.isArray((ZONE_MOBS as any).bmx_ember_archer.bmMz) && (ZONE_MOBS as any).bmx_ember_archer.bmMz.length >= 1, "у чёрного моба в описании — дула его оружия");
  const { z: z6, cx: x6, cy: y6 } = mk(); const a6 = z6.addMob("bmx_ember_archer", x6, y6, { fixed: true }); const sv = da.bmAtk; da.bmAtk = mobAtk(w, true);
  const pl6 = new Map([["t", P("t", x6 + 150, y6)]]); let casts = 0;
  for (let i = 0; i < 60 && !casts; i++) { now += 50; z6.events.length = 0; z6.update(0.05, now, pl6, () => {}, () => {}); casts = z6.events.filter((e: any) => e.k === "tele_line" && e.id === a6.id).length; a6.x = x6; a6.y = y6; }
  da.bmAtk = sv; BMA_CFG.staffTest = false;
  ok(casts === 3, `моб-посох против игрока: три линии прицела (${casts})`);
  // встроенный «Трёхпосохий жрец»: против игрока — 3 настоящих снаряда из 3 разных дул (не из центра моба)
  const ds: any = ZONE_MOBS.bmx_staff_seer; ok(!!ds?.black && ds.bmAtk?.kind === "proj" && ds.bmAtk.count === 3 && ds.bmMz?.length === 3, "Трёхпосохий жрец: посох + 2 посоха → 3 снаряда, 3 дула");
  const { z: z7, cx: x7, cy: y7 } = mk(); const s7 = z7.addMob("bmx_staff_seer", x7, y7, { fixed: true }); const pl7 = new Map([["t", P("t", x7 + 150, y7)]]); let pj: any[] = [];
  for (let i = 0; i < 80 && pj.length < 3; i++) { now += 50; z7.events.length = 0; z7.update(0.05, now, pl7, () => {}, () => {}); pj.push(...z7.events.filter((e: any) => e.k === "proj" && e.o === "m" && e.bm)); s7.x = x7; s7.y = y7; }
  ok(pj.length >= 3 && new Set(pj.slice(0, 3).map((e) => `${e.x},${e.y}`)).size === 3 && pj.slice(0, 3).every((e) => e.x !== Math.round(x7) || e.y !== Math.round(y7)), `жрец по игроку: 3 снаряда из 3 дул (${pj.slice(0, 3).map((e) => e.x + "," + e.y).join(" ")})`);
}

console.log(`\n${pass} PASS / ${fail} FAIL`);
if (fail) process.exit(1);
