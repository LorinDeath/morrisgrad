// Чёрный маг (blackMage.ts + bmCfg.ts + хуки zone.ts): купола, защита, чёрная магия, очернение, розы и проклятая земля
import { Zone, type ZPlayer } from "./zone";
import { BlackMage, BM_NPC } from "./blackMage";
import { BM_CFG, bmClock, roseStage, roseCurseR, blkDark, blkNormal, DAY_MS, BM_TILE } from "./bmCfg";
import { instStats } from "./cursed";
import { NPCS, STATIC_NPCS } from "./shared";
import { ITEMS } from "./defs";
import { ARINAR_HUB } from "../worlds/sizes";
import { blackenEquipped, repairBlackened, heroEffective, newAccount, newHero } from "./profile";
const heroBase = (_c: string) => ({ maxHp: 120, armor: 4, minAtk: 6, maxAtk: 9 });
import { validatePatch } from "./overrides";
let ok = 0, bad = 0; const t = (n: string, c: any) => { c ? (ok++, console.log("ok  ", n)) : (bad++, console.log("FAIL", n)); };
const noop = () => {};

// ——— конфиг, рост роз, очернённые статы ———
t("НПС black_mage: мобильный, не в раскладке", NPCS[BM_NPC]?.mobile && !STATIC_NPCS[BM_NPC]);
t("роза: росток 3 дня (стадии 0–3)", roseStage(0) === 0 && roseStage(2.9 * DAY_MS) <= 3);
t("роза: бутон 3–5 дн.", roseStage(3.5 * DAY_MS) === 4);
t("роза: раскрытие 5–10 дн.", roseStage(6 * DAY_MS) === 5);
t("роза: раскрыта после 10 дн.", roseStage(10.01 * DAY_MS) === 6);
t("земля: нет до раскрытия", roseCurseR(9 * DAY_MS) === 0);
t("земля: +1 клетка в день", roseCurseR(10.1 * DAY_MS) === BM_TILE && roseCurseR(13.1 * DAY_MS) === 4 * BM_TILE);
t("земля: потолок", roseCurseR(1000 * DAY_MS) === BM_CFG.curseMaxTiles * BM_TILE);
{ const s = { hp: 100, armor: 10, dmgMin: 4 }; const n = blkNormal(s as any, 30), d = blkDark(s as any, 30);
  t("очернение 30%: обычные статы −30%", n.hp === 70 && n.armor === 7);
  t("очернение 30%: очернённые = база × 30% × k", d.hp === 30 && d.armor === 3);
  const b = blkNormal(s as any, 100); t("очернение 100%: вещь не работает", !b.hp && !b.armor); }
{ const def = ITEMS.find((i: any) => i.stats?.hp) as any;
  const a = instStats(def, { id: def.id } as any), b = instStats(def, { id: def.id, blk: 50 } as any), c = instStats(def, { id: def.id, blk: 50 } as any, true), z = instStats(def, { id: def.id } as any, true);
  t(`instStats: очернение 50% режет вдвое (${a.hp}→${b.hp})`, Math.abs(b.hp - a.hp * 0.5) <= 1);
  t(`instStats dark: очернённая часть (${c.hp})`, Math.abs(c.hp - a.hp * 0.5) <= 1 && !z.hp); }
{ const a: any = { inv: [{ uid: "u1", id: ITEMS[0].id }, { uid: "u2", id: ITEMS[1].id, blk: 99.5 }, { uid: "u3", id: ITEMS[2].id }] }, h: any = { equip: { a: "u1", b: "u2" } };
  blackenEquipped(a, h, 7); t("очернение: только надетые, потолок 100", a.inv[0].blk === 7 && a.inv[1].blk === 100 && !a.inv[2].blk);
  repairBlackened(a, h, 10); t("починка надетых на N%", !a.inv[0].blk && a.inv[1].blk === 90); }
{ const ids = ITEMS.slice(0, 5).map((i: any) => i.id), a: any = { inv: ids.map((id: string, i: number) => ({ uid: "q" + i, id, ...(i === 2 ? { blk: 35 } : {}) })) }, h: any = { equip: Object.fromEntries(ids.map((_: string, i: number) => ["s" + i, "q" + i])) };
  const n = blackenEquipped(a, h, 2);
  t("регрессия: одна вещь 35%, остальные 0 → +2% КАЖДОЙ надетой", n === 5 && a.inv.every((it: any, i: number) => it.blk === (i === 2 ? 37 : 2)));
  blackenEquipped(a, h, 2); t("регрессия: повторно — снова всем (4 / 39)", a.inv.every((it: any, i: number) => it.blk === (i === 2 ? 39 : 4))); }
t("админка: правка «Чёрный маг» проходит", typeof validatePatch("bmage", "main", { blkK: 2, domeTiles: 6 } as any) !== "string");
t("админка: вне пределов — отказ", typeof validatePatch("bmage", "main", { domeTiles: 999 } as any) === "string");

// ——— зона и маг ———
const z = new Zone("arinar", [], [], { proc: true, seed: 11 });
const bm = new BlackMage("arinar");
z.guard = bm; bm.loaded = true;
const hurt: any[] = [], pushed: any[] = [];
bm.host = { hurt: (sid, pct, src, blk) => hurt.push({ sid, pct, src, blk }), push: (sid, x, y) => { pushed.push({ sid, x, y }); const p = pm.get(sid); if (p) { p.x = x; p.y = y; } } };
// место: пусто, вне хаба
let spot: [number, number] | null = null;
for (let i = 0; i < 4000 && !spot; i++) { const x = 4000 + Math.random() * 40000, y = 4000 + Math.random() * 40000;
  if (Math.hypot(x - ARINAR_HUB.x, y - ARINAR_HUB.y) > ARINAR_HUB.r + 2000 && z.regionAt(x, y) && !z.near(x, y, 900).length && !bm.blocked("arinar", x, y, 14)) spot = [x, y]; }
t("нашлось место", spot);
const [X, Y] = spot!;
const mk = (sid: string, x: number, y: number): ZPlayer => ({ sid, x, y, hp: 1000, maxHp: 1000, armorRed: 0, alive: true, respawnAt: 0 });
const A = mk("A", X + 120, Y), B = mk("B", X - 40, Y + 10);
const pm = new Map<string, ZPlayer>([["A", A], ["B", B]]);
bm.x = bm.homeX = bm.tx = X; bm.y = bm.homeY = bm.ty = Y + 260; bm.pauseUntil = Infinity; bm.tpAt = Infinity; bm.wDomeAt = Infinity;
// моб рядом (обычный, не босс)
// простейший моб через публичный способ: берём ближайшего живого моба мира и переносим его
const live = z.mobs.filter((m) => !m.dead);
const M = live.find((m) => !m.special)!, BOSS = live.find((m) => m.special === "boss") || live.find((m) => (m as any).elite) || live[1];
const put = (m: any, x: number, y: number) => { (z as any).moveMob ? (z as any).moveMob(m, x, y) : (m.x = x, m.y = y); m.hx = x; m.hy = y; };
put(M, X + 40, Y); M.hp = M.maxHp;
// 1) игрок бьёт моба → маг идёт защищать, ставит боевой купол над мобом
let now = Date.now();
let r = z.damage(M, "A", 5, noop); t("урон по мобу вне купола проходит", r > 0);
bm.domeCdAt = 0;
for (let i = 0; i < 40; i++) bm.tick(0.25, z as any, pm as any);
const d0 = bm.domes.find((d) => d.kind === "c");
t("моб в 8 клетках → БОЛЬШОЙ купол: маг подошёл до ~7 клеток, купол с магом в центре, моб внутри", d0 && Math.hypot(d0.x - M.x, d0.y - M.y) > (BM_CFG.smallTriggerTiles - 0.5) * BM_TILE && Math.hypot(d0.x - M.x, d0.y - M.y) <= BM_CFG.bigCastTiles * BM_TILE + 8 && Math.hypot(d0.x - M.x, d0.y - M.y) < d0.r && d0.r === BM_CFG.domeTiles * BM_TILE);
t("напавший (A) вытолкнут из купола", d0 && Math.hypot(A.x - d0.x, A.y - d0.y) >= d0.r);
t("B был внутри и не нападал — под защитой", bm.playerSafe("B", B.x, B.y));
t("A — напавший, не под защитой", !bm.playerSafe("A", A.x, A.y));
const hp0 = M.hp; r = z.damage(M, "A", 50, noop); t("урон игрока по мобу в куполе = 0", r === 0 && M.hp === hp0);
t("купол не впускает напавшего (clampMove)", !!bm.clampMove("A", d0!.x, d0!.y));
t("невиновный входит свободно", !bm.clampMove("B", d0!.x + 10, d0!.y));
// снаряд игрока снаружи гаснет на краю купола
{ const p: any = { o: "p", sid: "A", x: d0!.x + d0!.r + 30, y: d0!.y, dx: -1, dy: 0, w: 10 }; t("снаряд игрока гаснет на краю купола", bm.guardProj(p, p.x, p.y, d0!.x + d0!.r - 10, d0!.y));
  const q: any = { o: "m", bm: 1, x: 0, y: 0 }; t("стрела мага проходит сквозь купол", !bm.guardProj(q, d0!.x + d0!.r + 30, d0!.y, d0!.x, d0!.y)); }
// выстрел игрока ИЗ купола наружу: купол не гасит, выстрел «чернеет», бьёт другого игрока как стрела мага, в конце — чёрный взрыв
{ const C = mk("C", d0!.x - d0!.r - 90, d0!.y), D = mk("D", d0!.x - d0!.r - 90, d0!.y + 30); pm.set("C", C); pm.set("D", D); hurt.length = 0; const ev0 = z.events.length;
  const p: any = { o: "p", sid: "B", x: d0!.x - d0!.r + 20, y: d0!.y, dx: -1, dy: 0, w: 10 }; t("исходящий выстрел из купола не гаснет", !bm.guardProj(p, p.x, p.y, d0!.x - d0!.r - 10, d0!.y) && p.blk === 1);
  const st0 = bm.stats.blackHits || 0;
  z.fire({ o: "p", sid: "B", t: "auto_bow", x: d0!.x - d0!.r + 20, y: d0!.y, dx: -1, dy: 0, range: 200, w: 10, max: 1 });
  z.pl = pm; for (let i = 0; i < 20; i++) z.updateProjs(0.05, pm);
  const evs = z.events.slice(ev0);
  t("выстрел почернел (событие bmblk)", evs.some((e) => e.k === "bmblk"));
  t("чёрный выстрел попал в игрока C: % макс. ОЗ, как стрела мага", (bm.stats.blackHits || 0) === st0 + 1 && hurt.some((h) => h.sid === "C" && h.src === "arrow" && h.pct === BM_CFG.pvpShotPct));
  t("чёрный взрыв: D рядом получил урон и очернение", hurt.some((h) => h.sid === "D" && h.src === "expl" && h.pct === BM_CFG.pvpExplPct && h.blk === BM_CFG.pvpExplBlk));
  t("стрелок (B) своим взрывом не задет", !hurt.some((h) => h.sid === "B"));
  t("конец чёрного выстрела — как у стрелы мага (pend bm_arrow_small)", evs.some((e) => e.k === "pend" && e.t === "bm_arrow_small"));
  t("смерть от чёрного выстрела = смерть от мага (очернение по попаданиям + роза)", bm.killedByMage("C"));
  bm.hits.delete("C"); bm.hits.delete("D"); bm.lastHurt.delete("C"); bm.lastHurt.delete("D");
  const off = BM_CFG.pvpShot; BM_CFG.pvpShot = false; const q: any = { o: "p", sid: "B", x: p.x, y: p.y, dx: -1, dy: 0, w: 10 };
  t("pvpShot выкл: исходящий выстрел летит обычным", !bm.guardProj(q, q.x, q.y, d0!.x - d0!.r - 10, d0!.y) && !q.blk); BM_CFG.pvpShot = off;
  pm.delete("C"); pm.delete("D"); hurt.length = 0; }
// малая сфера Ø5 вокруг мага: игрок ближе 5 клеток бьёт мага
{ const E = mk("E", bm.x + 60, bm.y), F = mk("F", bm.x - 30, bm.y + 20), G = mk("G", bm.x + 400, bm.y); pm.set("E", E); pm.set("F", F); pm.set("G", G); z.pl = pm; pushed.length = 0;
  const keep = bm.domes; bm.domes = []; const n0 = 0; bm.smallCdAt = 0; bm.selfCdAt = 0; bm.hitMage("G");
  t("дальний (>5 клеток) удар по магу — малой сферы нет", bm.domes.length === n0);
  bm.hitMage("E"); const sd = bm.domes.find((d) => d.kind === "s");
  t("ближний удар по магу → малая сфера вокруг мага, R 2.5 клетки (80 px)", !!sd && sd.r === 80 && Math.hypot(sd.x - bm.x, sd.y - bm.y) < 2);
  t("малая сфера: напавший E вытолкнут", pushed.some((q) => q.sid === "E") && Math.hypot(E.x - sd!.x, E.y - sd!.y) >= sd!.r);
  t("малая сфера: F внутри — под защитой; E — нет", bm.playerSafe("F", F.x, F.y) && !bm.clampMove("F", sd!.x, sd!.y) && !!bm.clampMove("E", sd!.x, sd!.y));
  t("малая сфера живёт smallDomeLifeSec", Math.abs((sd!.exp - sd!.born) / 1000 - BM_CFG.smallDomeLifeSec) < 1);
  pushed.length = 0; E.x = sd!.x + 20; E.y = sd!.y; bm.hitMage("E"); t("повторный удар из сферы: новой нет, напавший снова вытолкнут", bm.domes.filter((d) => d.kind === "s").length === 1 && pushed.some((q) => q.sid === "E") && Math.hypot(E.x - sd!.x, E.y - sd!.y) >= sd!.r + 28);
  const r2 = new BlackMage("arinar"); r2.restore(JSON.parse(JSON.stringify(bm.serialize()))); t("малая сфера переживает перезапуск (kind s)", r2.domes.some((d) => d.kind === "s" && d.r === 80));
  bm.domes = keep; bm.aggro.clear(); pm.delete("E"); pm.delete("F"); pm.delete("G"); }
// нападение на самого мага с 5–10 клеток: большой купол с магом в центре, напавший вытолкнут за край + pushExtraTiles
{ const keep = bm.domes; bm.domes = []; bm.selfCdAt = 0; pushed.length = 0;
  const H = mk("H", bm.x + 7 * BM_TILE, bm.y); pm.set("H", H); z.pl = pm; bm.hitMage("H");
  const d = bm.domes.find((x) => x.kind === "c");
  t("удар по магу с 7 клеток → большой купол, маг в центре", !!d && Math.hypot(d.x - bm.x, d.y - bm.y) < 2 && d.r === BM_CFG.domeTiles * BM_TILE);
  t("большой купол: напавший вытолкнут за край (+1 клетка)", pushed.some((q) => q.sid === "H") && Math.hypot(H.x - d!.x, H.y - d!.y) >= d!.r + 28 + BM_CFG.pushExtraTiles * BM_TILE - 1);
  t("большой купол от нападения живёт selfDomeLifeSec", Math.abs((d!.exp - d!.born) / 1000 - BM_CFG.selfDomeLifeSec) < 1);
  t("напавший не войдёт обратно", !!bm.clampMove("H", d!.x, d!.y));
  // выкл selfDomeOn — старое поведение (только малая сфера вблизи)
  bm.domes = []; const o = BM_CFG.selfDomeOn; BM_CFG.selfDomeOn = false; H.x = bm.x + 7 * BM_TILE; bm.hitMage("H"); t("selfDomeOn выкл: с 7 клеток барьера нет", bm.domes.length === 0); BM_CFG.selfDomeOn = o;
  bm.domes = keep; bm.aggro.clear(); pm.delete("H"); }
// погоня: убегающий напавший — рывок к нему (blinkToTiles), не чаще blinkCdSec
{ const J = mk("J", bm.x + 20 * BM_TILE, bm.y); pm.set("J", J); z.pl = pm; bm.blinkAt = 0;
  const x0 = bm.x; bm.fightFoe(J, Math.hypot(J.x - bm.x, J.y - bm.y), 0.05, bmClock.now(), pm);
  const dd = Math.hypot(J.x - bm.x, J.y - bm.y);
  t(`рывок к убегающему: было 20 клеток, стало ${(dd / BM_TILE).toFixed(1)}`, Math.abs(dd - BM_CFG.blinkToTiles * BM_TILE) < BM_TILE * 1.5 && bm.x !== x0);
  J.x = bm.x + 20 * BM_TILE; const x1 = bm.x; bm.fightFoe(J, 20 * BM_TILE, 0.05, bmClock.now(), pm); t("рывок: перезарядка (второй сразу — нет)", Math.abs(bm.x - x1) < BM_TILE);
  t(`поводок ${BM_CFG.leashTiles} клеток, забывает через ${BM_CFG.aggroForgetSec} с, погоня ×${BM_CFG.chaseSpeedMul}`, BM_CFG.leashTiles >= 120 && BM_CFG.aggroForgetSec >= 180 && BM_CFG.chaseSpeedMul >= 3);
  pm.delete("J"); bm.volley = null; }
{ const H = mk("H", d0!.x, d0!.y + 20); pm.set("H", H); pushed.length = 0; const mo = { x: d0!.x + d0!.r + 100, y: d0!.y };
  t("удар ИЗ купола по мобу снаружи проходит", !bm.guardMobHit(mo, "H", H.x, H.y));
  t("…но стрелок теряет защиту купола и вытолкнут (купол — не неуязвимая башня)", !bm.playerSafe("H", d0!.x, d0!.y) && pushed.some((q) => q.sid === "H"));
  t("…и маг на него не агрится (это не нападение на защищаемых)", !bm.aggro.has("H")); pm.delete("H"); }
// малая сфера по дистанции: маг в 2–5 клетках от защищаемого моба → подходит до ~4 и ставит малую сферу НА МОБЕ, напавший вытолкнут
{ const M2 = live.find((m) => !m.special && m !== M && m.id !== BOSS?.id)!; put(M2, bm.x + 150, bm.y + 20); M2.hp = M2.maxHp; const J = mk("J", M2.x + 60, M2.y); pm.set("J", J); z.pl = pm;
  bm.domes = bm.domes.filter((d) => d.kind !== "s"); bm.smallCdAt = 0; bm.domeCdAt = Infinity; pushed.length = 0; bm.aggro.clear(); bm.fights.clear();
  z.damage(M2, "J", 5, noop); for (let i = 0; i < 40 && !bm.domes.some((d) => d.kind === "s"); i++) bm.tick(0.1, z as any, pm as any);
  const s2 = bm.domes.find((d) => d.kind === "s");
  t("моб в ~4.7 клетках → МАЛАЯ сфера на мобе (позиция мага неважна)", !!s2 && Math.hypot(s2.x - M2.x, s2.y - M2.y) < 4 && s2.r === 80);
  t("маг подошёл до ~4 клеток", Math.hypot(bm.x - M2.x, bm.y - M2.y) <= BM_CFG.smallCastTiles * BM_TILE + 6);
  t("напавший J вытолкнут из малой сферы", pushed.some((q) => q.sid === "J") && Math.hypot(J.x - M2.x, J.y - M2.y) >= 80);
  bm.domes = bm.domes.filter((d) => d !== s2); bm.fights.clear(); bm.domeCdAt = 0; pm.delete("J"); put(M2, M2.x + 3000, M2.y); }
// 2) нападение на мага → залп стрел (сервер-авторитет: только напавший)
bm.hitMage("A"); hurt.length = 0;
const fired: any[] = []; const realFire = z.fire.bind(z); (z as any).fire = (o: any) => { fired.push(o); return realFire(o); };
for (let i = 0; i < 20; i++) { now += 100; z.update(0.1, now, pm, noop, noop); bm.tick(0.1, z as any, pm as any); }
t(`маг стреляет в напавшего (${fired.length} стрел)`, fired.length > 0 && fired.every((f) => f.only === "A" && f.bm));
t("стрелы — урон % ОЗ (1% вне купола / 2% в куполе)", hurt.some((h) => h.sid === "A" && h.src === "arrow" && (h.pct === BM_CFG.arrowPct || h.pct === BM_CFG.arrowDomePct)));
t("B (в куполе, не напавший) не получил урона", !hurt.some((h) => h.sid === "B"));
// взрыв: третий игрок рядом с целью получает 5% и очернение 2%
{ const C = mk("C", A.x + 20, A.y); pm.set("C", C); hurt.length = 0; bm.explode(A.x, A.y, "A", false, pm as any);
  const hc = hurt.find((h) => h.sid === "C"); t("взрыв: цель не задета, другой игрок 5% + очернение 2%", hc && hc.pct === BM_CFG.explPct && hc.blk === BM_CFG.explBlk && !hurt.some((h) => h.sid === "A")); pm.delete("C"); }
// 3) сжатие пространства: убивает любого моба (и босса) в куполе рядом с магом, без наград
{ const killed: any[] = []; put(BOSS, bm.x + 20, bm.y); BOSS.dead = false; BOSS.hp = BOSS.maxHp;
  bm.castDome(bm.x, bm.y, "c", pm as any); now += 50; z.update(0.05, now, pm, noop, noop); put(BOSS, bm.x + 20, bm.y); z.update(0.01, now + 10, pm, noop, noop); const realKill = z.kill.bind(z); (z as any).kill = (m: any, cb: any) => { killed.push({ m, cb }); return realKill(m, cb); };
  bm.compress(bmClock.now());
  t(`сжатие убило моба в куполе (${BOSS.type}${BOSS.special ? " " + BOSS.special : ""})`, BOSS.dead && killed.some((k) => k.m === BOSS));
  t("сжатие: без наград (колбэк убийства пустой)", killed.every((k) => String(k.cb).replace(/\s/g, "") === "()=>{}"));
  (z as any).kill = realKill; }
// 4) смерть от мага: счёт попаданий → очернение, роза; не в хабе
{ bm.hits.set("A", { n: 9, at: bmClock.now() }); bm.lastHurt.set("A", bmClock.now()); const n0 = bm.roses.length;
  const n = bm.onPlayerDeath("A", A.x, A.y); t("смерть: очернение = числу попаданий мага (9)", n === 9);
  t("смерть: роза на месте смерти", bm.roses.length === n0 + 1);
  bm.hits.set("A", { n: 3, at: bmClock.now() }); bm.lastHurt.set("A", bmClock.now()); bm.onPlayerDeath("A", ARINAR_HUB.x, ARINAR_HUB.y);
  t("в центральном хабе розы не растут", bm.roses.length === n0 + 1); }
// 5) проклятая земля: роза раскрылась + дни → радиус; пространственный индекс
{ const rose = bm.roses[bm.roses.length - 1];
  t("свежая роза — земли нет", !bm.cursedAt(rose.x + 5, rose.y));
  bmClock.offset = 12.5 * DAY_MS; // перемотка: открыта 2,5 дня → 3 клетки
  t("через 12,5 дней: проклятая земля 3 клетки", bm.cursedAt(rose.x + 3 * BM_TILE - 4, rose.y) && !bm.cursedAt(rose.x + 3 * BM_TILE + 8, rose.y));
  for (let i = 0; i < 20000; i++) bm.addRose({ id: 1e6 + i, x: 1000 + (i % 200) * 230, y: 1000 + Math.floor(i / 200) * 230, born: 0 });
  const t0 = performance.now(); let hits = 0; for (let i = 0; i < 20000; i++) if (bm.cursedAt(Math.random() * 48000, Math.random() * 48000)) hits++;
  const ms = performance.now() - t0; t(`20 000 роз: 20 000 проверок земли за ${ms.toFixed(1)} мс`, ms < 400);
  bmClock.offset = 0; }
// 6) сохранение/восстановление: купола переживают телепорт и перезапуск
{ const ser = JSON.parse(JSON.stringify(bm.serialize())); const b2 = new BlackMage("arinar"); b2.restore(ser);
  t("купола переживают перезапуск", b2.domes.length === bm.domes.filter((d) => d.exp > bmClock.now()).length && b2.domes.length > 0);
  const nd = bm.domes.length; bm.teleport(); t("купола переживают телепорт мага", bm.domes.length === nd);
  t("телепорт: не на центральную площадь", Math.hypot(bm.x - ARINAR_HUB.x, bm.y - ARINAR_HUB.y) > ARINAR_HUB.r); }
// 7) случайные купола мира: максимум 5
{ const b3 = new BlackMage("arinar"); b3.host = bm.host; for (let i = 0; i < 12; i++) { b3.wDomeAt = 0; b3.tick(0.1, z as any, new Map() as any); b3.x += 600; }
  t(`случайных куполов ≤ ${BM_CFG.worldDomesMax} (${b3.domes.length})`, b3.domes.filter((d) => d.kind === "w").length <= BM_CFG.worldDomesMax); }
// 8) статы на проклятой земле: только очернённая часть
{ const def = ITEMS.find((i: any) => i.slot && i.stats?.hp) as any;
  const a: any = newAccount(), h: any = newHero("warrior"); a.inv.push({ uid: "e1", id: def.id, blk: 40 }); h.equip[def.slot] = "e1";
  let e1: any, e2: any; try { e1 = heroEffective(a, h, "warrior", heroBase("warrior")); e2 = heroEffective(a, h, "warrior", heroBase("warrior"), { dark: true }); } catch (e: any) { console.log("heroEffective", e.message); }
  t(`эффективные статы: на проклятой земле другие (${e1?.maxHp ?? e1?.hp} → ${e2?.maxHp ?? e2?.hp})`, e1 && e2 && (e1.maxHp ?? e1.hp) !== (e2.maxHp ?? e2.hp)); }
console.log(`\n${ok} ok, ${bad} fail`);
if (bad) process.exit(1);
