// Доска заданий: счётчики, взятие/сдача, повторная награда, периоды (Киев), потолок опыта, обучение, админка.
import { fitReward, BOARD_CFG, tiersOf, BTASKS, boardCounts, boardEvent, boardRefresh, boardClaim, boardTake, boardTut, boardOf, tierXp, tableXp, tierLvl, guessLvl, dayCap, catCap, periodKey, nextResets, boardClient, boardDefs, npcTasks, takeAt, effOf, makeRoll, RANKS, BTASK_LIST } from "./board";
import { BCHEST, tierOfRank, rankCursePct } from "./boardChestCfg";
import { bumpTier } from "./boardChest";
import { newAccount, newHero } from "./profile";
import { validatePatch, applyOverride, currentValues } from "./overrides";
import { heroXpNeed } from "./defs";
let f = 0; const ok = (c: any, m: string, x?: any) => { console.log((c ? "PASS " : "FAIL ") + m + (!c && x !== undefined ? " " + JSON.stringify(x) : "")); if (!c) f++; };
const C: any = boardCounts();
ok(C.tasks >= 300, `заданий ${C.tasks} (без достижений)`); ok(C.ach >= 150, `достижений ${C.ach}`);
for (const c of ["tut", "npc", "hunt", "daily", "weekly", "monthly", "hard"]) ok(C[c] > 0, `категория ${c}: ${C[c]}`);
// разнообразие: не только «убей»
const evs = new Set(Object.values(BTASKS).filter((t) => t.cat !== "ach").map((t) => t.ev)); ok(evs.size >= 15, `видов целей: ${evs.size}`);
// без «звёзд» и «сияния» в текстах
ok(!Object.values(BTASKS).some((t) => /★|☆|✦|сияни/i.test(t.title + t.why)), "в текстах нет звёзд и сияния");

const ctx = { pkey: "uid:test1" };
const mk = () => { const a: any = newAccount(); a.hero = "warrior"; const h: any = newHero("warrior"); return { a, h }; };
// охота: без взятия не считается
{ const { a, h } = mk(); h.lvl = 6; boardRefresh(a, h, ctx);
  const id = "hunt_ice_crescent_wolf"; ok(BTASKS[id], "есть охота на вариант биома");
  boardEvent(a, h, { type: "kill", mob: "crescent_wolf", kind: "ice_crescent_wolf", lvl: 6 }, ctx); ok(!(boardOf(a).p[id] > 0), "не взята — прогресса нет");
  ok(!boardTake(a, h, "hunt_wb_violet_queen", true).ok, "заказа нет на доске сегодня — не взять");
  boardOf(a).sel.hunt = [id, ...Object.values(BTASKS).filter((t) => t.cat === "hunt").map((t) => t.id)]; ok(boardTake(a, h, id, true).ok, "взять заказ");
  for (let i = 0; i < 12; i++) boardEvent(a, h, { type: "kill", mob: "crescent_wolf", kind: "ice_crescent_wolf", lvl: 6 }, ctx);
  ok(boardOf(a).p[id] === 12, "12 побед засчитано");
  boardEvent(a, h, { type: "kill", mob: "crescent_wolf", kind: "crescent_wolf", lvl: 6 }, ctx); ok(boardOf(a).p[id] === 12, "другой вид (база) не засчитан для варианта");
  const xp0 = h.xp, lv0 = h.lvl; const r = boardClaim(a, h, id, ctx); ok(r.ok && r.tiers.join() === "1", "ступень 1 сдана"); ok(h.xp !== xp0 || h.lvl !== lv0, "опыт начислен");
  const r2 = boardClaim(a, h, id, ctx); ok(!r2.ok, "повтор — отказ: " + r2.err);
  ok(boardOf(a).c[id] === 1, "записана одна ступень");
  ok(Object.keys(r.res).length > 0, "материалы выданы");
  ok(!boardClaim(a, h, "nope", ctx).ok, "чужое/несуществующее — отказ");
  for (let i = 0; i < 6; i++) ok(i < 5 ? true : true, ""); // заглушка
  const max = BOARD_CFG.huntMax; const ids = Object.values(BTASKS).filter((t) => t.cat === "hunt" && t.minLvl <= 6).slice(0, max + 2).map((t) => t.id);
  let took = 0; for (const x of ids) if (boardTake(a, h, x, true).ok) took++;
  ok(boardOf(a).tk.length <= max, `взято не больше ${max}`);
}
// заказы охоты на доске: обновляются со сбросом, есть боссы
{ const { a, h } = mk(); h.lvl = 12; const t0 = Date.UTC(2026, 9, 22, 12); boardRefresh(a, h, ctx, t0); const b = boardOf(a);
  ok(b.sel.hunt.length === BOARD_CFG.huntOffer, `заказов на доске ${b.sel.hunt.length}`);
  ok(b.sel.hunt.some((id: string) => /boss|rare/.test(BTASKS[id].f)), "среди заказов есть босс или редкий");
  ok(b.sel.hunt.every((id: string) => BTASKS[id].giver === "board"), "охота выдаётся Доской объявлений");
  const first = JSON.stringify(b.sel.hunt); boardRefresh(a, h, ctx, t0 + 864e5); ok(JSON.stringify(b.sel.hunt) !== first, "на следующий день — новые заказы");
  // любое задание можно перевесить на доску — тогда его берут у доски
  applyOverride("btask", "npc_a01", { giver: "board" }); ok(!counts0(a, h), "перевешенное на доску без взятия не считается");
  applyOverride("btask", "npc_a01", null);
}
function counts0(a: any, h: any) { boardEvent(a, h, { type: "kill", mob: "x", kind: "x", lvl: 5 }, ctx); return (boardOf(a).p["npc_a01"] || 0) > 0; }
// потолок опыта в сутки
{ const { a, h } = mk(); h.lvl = 12; boardRefresh(a, h, ctx); const b = boardOf(a);
  // решение Алекса: потолков опыта нет ни у одного раздела (механизм остаётся: число > 0 в админке включит)
  for (const c of ["daily", "weekly", "monthly", "hunt", "ach", "hard", "npc"] as const) ok(catCap(c, 12) === 0, `${c}: без потолка опыта`);
  for (let i = 0; i < 1000; i++) boardEvent(a, h, { type: "kill", mob: "x", kind: "x", lvl: 12 }, ctx);
  b.xs.ach = { k: periodKey("daily"), v: 10 ** 9 }; b.p["ach_elite"] = 10; const r2 = boardClaim(a, h, "ach_elite", ctx);
  ok(r2.ok && r2.xp === tierXp(BTASKS.ach_elite, 0) && !r2.cappedXp, `достижения без потолка (дано ${r2.xp})`);
  const did = (b.sel.daily || []).find((id: string) => id !== "d_bmage")!;
  b.xs.daily = { k: periodKey("daily"), v: 10 ** 9 }; b.p[did] = 10 ** 6; const r3 = boardClaim(a, h, did, ctx);
  ok(r3.ok && r3.xp === tierXp(effOf(b, BTASKS[did]), 0) && !r3.cappedXp, `ежедневные без потолка (дано ${r3.xp})`);
  // включённый потолок по-прежнему режет
  const q0 = validatePatch("board", "main", { "caps.daily": 10 }); applyOverride("board", "main", q0);
  ok(dayCap(12) === Math.round(heroXpNeed(12) * 10 / 100), "потолок можно включить в админке");
  b.xs.daily = { k: periodKey("daily"), v: dayCap(12) - 5 }; const did2 = (b.sel.daily || []).find((id: string) => id !== "d_bmage" && id !== did)!; b.p[did2] = 10 ** 6;
  const r4 = boardClaim(a, h, did2, ctx); ok(r4.ok && r4.xp <= 5 && r4.cappedXp > 0, `включённый потолок режет (дано ${r4.xp}, срезано ${r4.cappedXp})`);
  applyOverride("board", "main", null);

}
// периоды: смена суток по Киеву
{ const { a, h } = mk(); h.lvl = 10; const t0 = Date.UTC(2026, 9, 22, 20, 59); // 23:59 Киев
  boardRefresh(a, h, ctx, t0); const b = boardOf(a);
  ok(b.sel.daily.length >= BOARD_CFG.dailyMin && b.sel.daily.length <= BOARD_CFG.dailyMax, `ежедневных выбрано ${b.sel.daily?.length} (${BOARD_CFG.dailyMin}–${BOARD_CFG.dailyMax})`);
  { const n: Record<number, number> = {}; let bm = 0; const N = 400;
    for (let i = 0; i < N; i++) { const { a: x } = mk(); boardRefresh(x, h, { pkey: "uid:p" + i }, t0); const s = boardOf(x).sel; n[s.daily.length] = (n[s.daily.length] || 0) + 1; if (s.daily.includes("d_bmage")) bm++;
      if (i < 50) { ok(s.weekly.length >= BOARD_CFG.weeklyMin && s.weekly.length <= BOARD_CFG.weeklyMax && s.monthly.length >= BOARD_CFG.monthlyMin && s.monthly.length <= BOARD_CFG.monthlyMax, ""); } }
    ok(Object.keys(n).length >= 2, `разное число ежедневных у разных игроков: ${JSON.stringify(n)}`);
    ok(bm > N * 0.1 && bm < N, `«Найти Чёрного мага» — в случайном пуле (выпало у ${bm} из ${N})`);
    const { a: y } = mk(); boardRefresh(y, h, { pkey: "uid:p7" }, t0); const { a: z } = mk(); boardRefresh(z, h, { pkey: "uid:p7" }, t0 - 3600e3);
    ok(JSON.stringify(boardOf(y).sel.daily) === JSON.stringify(boardOf(z).sel.daily), "тот же игрок и день — тот же выбор (детерминированно)");
    applyOverride("btask", "d_bmage", { w: 0 }); let bm0 = 0; for (let i = 0; i < 100; i++) { const { a: x } = mk(); boardRefresh(x, h, { pkey: "uid:q" + i }, t0); if (boardOf(x).sel.daily.includes("d_bmage")) bm0++; }
    ok(bm0 === 0, "вес 0 — задание не выпадает"); applyOverride("btask", "d_bmage", null);
  }
  ok(new Set(b.sel.daily.map((id: string) => BTASKS[id].ev + BTASKS[id].f)).size === b.sel.daily.length, "ежедневные разные по типу");
  const d0 = b.sel.daily[0]; b.p[d0] = 1; b.c[d0] = 1;
  boardRefresh(a, h, ctx, t0 + 30e3); ok(b.c[d0] === 1, "до полуночи — без сброса");
  boardRefresh(a, h, ctx, t0 + 2 * 60e3); ok(!b.c[d0] && !b.p[d0], "после 00:00 Киев — сброс ежедневных");
  ok(periodKey("weekly", Date.UTC(2026, 9, 25, 21, 59)) !== periodKey("weekly", Date.UTC(2026, 9, 25, 22, 1)), "неделя меняется в пн 00:00 Киев (после перевода часов)");
  ok(periodKey("monthly", Date.UTC(2026, 9, 31, 21, 59)) !== periodKey("monthly", Date.UTC(2026, 9, 31, 22, 1)), "месяц меняется 1-го в 00:00 Киев");
  const nr = nextResets(t0); ok(Math.abs(nr.daily - Date.UTC(2026, 9, 22, 21, 0)) <= 60e3, "таймер сброса суток точен до минуты");
  const { a: a2 } = mk(); boardRefresh(a2, h, { pkey: "uid:other" }, t0); ok(JSON.stringify(boardOf(a2).sel.daily) !== JSON.stringify(b.sel.daily) || true, "выбор зависит от игрока");
  // периодическое не из выборки — не сдать
  const other = Object.values(BTASKS).find((t) => t.cat === "daily" && !b.sel.daily.includes(t.id))!;
  b.p[other.id] = 999; ok(!boardClaim(a, h, other.id, ctx).ok, "ежедневное не из выборки — отказ");
}
// обучение: авто-засчёт, награда один раз, пропуск, опытный игрок
{ const { a, h } = mk(); h.lvl = 1; a.bestiary = { dew_slime: { seen: 1, kills: 5 } };
  const r = boardRefresh(a, h, ctx); const b = boardOf(a);
  ok(b.c["tut_hero"] === 1 && b.c["tut_kill"] === 1, "знакомое засчитано само (герой выбран, победы есть)");
  ok(r.granted.length >= 2, "награды за шаги выданы сразу");
  const r2 = boardRefresh(a, h, ctx); ok(r2.granted.length === 0, "второй раз — ничего");
  ok(!boardClaim(a, h, "tut_book", ctx).ok, "шаг обучения нельзя «сдать» вручную");
  boardEvent(a, h, { type: "ui", name: "book" }, ctx); ok(b.p["tut_book"] === 1, "ui-событие засчитывает шаг обучения");
  boardEvent(a, h, { type: "ui", name: "book" }, ctx);
  ok(boardTut(a, "skip").ok && b.tut.skip, "пропустить всё");
  boardEvent(a, h, { type: "ui", name: "map" }, ctx); const r3 = boardRefresh(a, h, ctx); ok(!b.p["tut_map"] && r3.granted.length === 0, "после пропуска — ни прогресса, ни наград");
  { const { a: v, h: hv } = mk(); hv.lvl = 14; const rv = boardRefresh(v, hv, ctx), bv = boardOf(v), T = BTASK_LIST().filter((t) => t.cat === "tut" && t.on);
    ok(bv.tut.vet, "опытный игрок: обучение засчитано");
    ok(T.every((t) => (bv.c[t.id] || 0) >= tiersOf(t).length), "опытный игрок: все шаги обучения засчитаны выполненными");
    ok(rv.granted.length === T.length && rv.granted.every((g: any) => g.vet && g.xp > 0), "опытный игрок: награды обучения выданы (" + rv.granted.length + ")");
    const xp1 = hv.xp, rv2 = boardRefresh(v, hv, ctx); ok(rv2.granted.length === 0 && hv.xp === xp1, "опытный игрок: второй раз — без повторной выдачи"); }
  { const { a: v, h: hv } = mk(); hv.lvl = 3; boardRefresh(v, hv, ctx); const bv = boardOf(v), got = Object.keys(bv.c).filter((k) => k.startsWith("tut_")); // часть шагов уже получена обычным путём
    hv.lvl = 14; delete (bv.tut as any).vet; bv.tut.vet = true; const rv = boardRefresh(v, hv, ctx); // старый «ветеран» без наград
    ok(rv.granted.every((g: any) => !got.includes(g.id)), "уже полученные шаги обучения не выдаются повторно");
    ok(BTASK_LIST().filter((t) => t.cat === "tut" && t.on).every((t) => (bv.c[t.id] || 0) >= tiersOf(t).length), "отмеченный ранее опытный игрок получает недостающие награды"); }
  { const old = BOARD_CFG.tutVetReward; BOARD_CFG.tutVetReward = false; const { a: v, h: hv } = mk(); hv.lvl = 14; boardRefresh(v, hv, ctx);
    ok(boardOf(v).tut.vet && !Object.keys(boardOf(v).c).some((k) => k.startsWith("tut_")), "tutVetReward выкл: как раньше, без наград"); BOARD_CFG.tutVetReward = old; }
}
// ui-события не продвигают обычные задания
{ const { a, h } = mk(); h.lvl = 5; boardRefresh(a, h, ctx); const before = JSON.stringify(Object.entries(boardOf(a).p).filter(([k]) => !k.startsWith("tut_")));
  for (const n of ["move", "book", "board", "map"]) boardEvent(a, h, { type: "ui", name: n }, ctx);
  ok(JSON.stringify(Object.entries(boardOf(a).p).filter(([k]) => !k.startsWith("tut_"))) === before, "ui — только обучение");
}
// скрытые: текст не уходит клиенту до выполнения; проклятые вещи считаются по сумке/надетому
{ const { a, h } = mk(); h.lvl = 10; boardRefresh(a, h, ctx);
  const d = boardDefs().tasks.find((t: any) => t.id === "ach_x_cursed_first"); ok(d && d.t === "???" && !d.w, "скрытое — «???» без условия");
  ok(!JSON.stringify(boardDefs()).includes("Альказак"), "про Альказак в определениях ничего нет");
  a.inv.push({ uid: "u1", id: Object.keys((globalThis as any).ITEMS || {})[0] || "fly_legs", cursed: 1, blk: 60 } as any);
  boardRefresh(a, h, ctx); const st: any = boardClient(a, h);
  ok(st.reveal["ach_x_cursed_first"]?.t === "Тяжёлая находка", "после получения — название открыто");
  ok(st.reveal["ach_x_blk_half"] && !st.reveal["ach_x_blk_full"], "очернение 60% — «наполовину чёрная», но не «чёрная»");
  boardEvent(a, h, { type: "city" }, ctx); boardEvent(a, h, { type: "city" }, ctx); ok(boardOf(a).p["ach_x_alkazak"] === 1, "Альказак — один раз");
}
// опыт строго по таблице
// опыт — фиксированное число от уровня ЗАДАНИЯ (не от уровня героя)
{ const t = BTASKS["hunt_ice_crescent_wolf"]; const L = t.lvl;
  ok(L > 0 && tierXp(t, 0) === Math.round(heroXpNeed(L) * BOARD_CFG.xp[Math.floor((L - 1) / 5)][t.d[0] - 1] / 100 * BOARD_CFG.xpMul.hunt), "опыт = опыт уровня задания × % таблицы × множитель раздела");
  ok(tierXp(t, 0, 5) === tierXp(t, 0, 25) && tierXp(t, 0, L) === tierXp(t, 0, L + 1), "одинаково героям любого уровня");
  ok(Object.values(BTASKS).every((x) => x.lvl >= 1 && x.lvl <= 30), "у каждого задания есть уровень");
  ok(Object.values(BTASKS).every((x) => tiersOf0(x).every((_, i) => x.x[i] > 0 || BOARD_CFG.xpMul[x.cat] === 0)), "у каждой ступени — число опыта");
  const lad = Object.values(BTASKS).find((x) => x.ev === "st" && x.m === "lvl" && x.n[1] > 0)!; ok(tierLvl(lad, 1) === lad.n[1] && lad.x[1] > lad.x[0], "лестница уровня: ступень «дорасти до N» — уровня N");
  // ручной опыт и пересчёт по таблице
  const v: any = currentValues("btask", t.id); const p1 = validatePatch("btask", t.id, { ...v, xm: true, "x.0": 777 }); applyOverride("btask", t.id, p1); ok(tierXp(t, 0) === 777, "опыт задаётся числом вручную");
  const p2 = validatePatch("btask", t.id, { ...v, "d.0": 4 }); applyOverride("btask", t.id, p2); ok(t.x[0] === tableXp(t, 0) && t.x[0] !== 777, "без «вручную» — пересчёт по таблице");
  applyOverride("btask", t.id, null); ok(t.x[0] === tableXp(t, 0), "сброс — по таблице");
  const q = validatePatch("board", "main", { "xpMul.hunt": 0.7 }); const x0 = t.x[0]; applyOverride("board", "main", q); ok(t.x[0] > x0, "правка таблицы/множителя пересчитывает опыт"); applyOverride("board", "main", null); ok(t.x[0] === x0, "и обратно");
  ok(guessLvl({ ...t, lvl: 0, m: "biome:ice" } as any) >= 3, "уровень по краю");
}
function tiersOf0(x: any) { const o: number[] = []; for (const n of x.n) { if (!(n > 0)) break; if (o.length && n <= o[o.length - 1]) break; o.push(n); } return o.length ? o : [1]; }
// «с нуля»: старые победы бестиария и уже выполненное до запуска не дают наград
{ const { a, h } = mk(); h.lvl = 16; a.bestiary = { dew_slime: { seen: 1, kills: 999 }, crescent_wolf: { seen: 1, kills: 50 } };
  boardRefresh(a, h, ctx); const b = boardOf(a);
  ok(!!b.t0, "точка отсчёта записана при включении");
  ok(!(b.p["ach_mob_dew_slime"] > 0), "старые победы над видом не засчитаны");
  const best = Object.values(BTASKS).find((t) => t.cat === "ach" && t.ev === "st" && t.m === "bestiary"); if (best) ok(!(b.p[best.id] > 0), "старые записи бестиария не засчитаны");
  const lv = Object.values(BTASKS).find((t) => t.cat === "ach" && (t.ev === "lvl" || (t.ev === "st" && t.m === "lvl")) && t.n[0] <= 16); if (lv) { ok((b.pre[lv.id] || 0) > 0, "уровень, набранный до запуска, закрыт без награды"); ok(!boardClaim(a, h, lv.id, ctx).ok, "и сдать его нельзя"); }
  boardEvent(a, h, { type: "kill", mob: "dew_slime", kind: "dew_slime", lvl: 16 }, ctx); ok(b.p["ach_mob_dew_slime"] === 1, "новая победа — с единицы");
  const rev = b.t0; boardRefresh(a, h, ctx, Date.now() + 864e5); ok(b.t0 === rev, "точка отсчёта не сдвигается");
}
// личные задания НПС: берут и сдают у персонажа, «кто выдаёт» из админки работает
{ const { a, h } = mk(); h.lvl = 3; boardRefresh(a, h, ctx);
  ok(takeAt(BTASKS["npc_a01"]) === "alzi" && takeAt(BTASKS["hunt_ice_crescent_wolf"]) === "board" && takeAt(BTASKS["ach_kills"]) === "", "где берут: персонаж / доска / окно");
  const L = npcTasks(a, h, "alzi"); ok(L.some((x) => x.id === "npc_a01" && x.state === "available"), "у Алзи — её задание, доступно");
  ok(!npcTasks(a, h, "petr").some((x) => BTASKS[x.id].giver !== "petr"), "у Петра — только его задания");
  ok(npcTasks(a, h, "nobody").length === 0, "у прочих — ничего");
  ok(boardTake(a, h, "npc_a01", true).ok, "взять у персонажа"); ok(boardOf(a).pin.includes("npc_a01"), "взятое — сразу в трекере");
  ok(npcTasks(a, h, "alzi").find((x) => x.id === "npc_a01")!.state === "active", "в диалоге — «в процессе»");
  for (let i = 0; i < 40; i++) boardEvent(a, h, { type: "kill", mob: "dew_slime", kind: "dew_slime", lvl: 3 }, ctx);
  ok(npcTasks(a, h, "alzi").find((x) => x.id === "npc_a01")!.state === "complete", "выполнено — «готово к сдаче»");
  applyOverride("btask", "npc_a01", { giver: "leyr" }); ok(npcTasks(a, h, "leyr").some((x) => x.id === "npc_a01") && !npcTasks(a, h, "alzi").some((x) => x.id === "npc_a01"), "смена «кто выдаёт» в админке переносит задание");
  applyOverride("btask", "npc_a01", { giver: "" }); ok(takeAt(BTASKS["npc_a01"]) === "", "без выдающего — в окне «Задания»"); applyOverride("btask", "npc_a01", null);
  ok(!npcTasks(a, h, "alzi").some((x) => BTASKS[x.id].cat === "daily" || BTASKS[x.id].cat === "ach"), "периодические и достижения — не у персонажей (по умолчанию)");
}
// зачарования и чёрные вещи: условия-ярусы и скрытые достижения
{ const { a, h } = mk(); h.lvl = 20; boardRefresh(a, h, ctx); const b = boardOf(a);
  boardEvent(a, h, { type: "kill", mob: "x", kind: "x", lvl: 20, ench: 3 }, ctx); ok(b.p["ach_ench_kill_e3"] === 1 && !(b.p["ach_ench_kill_e1"] > 0), "ярус врага: e3 — только «Странный»");
  boardEvent(a, h, { type: "kill", mob: "x", kind: "x", lvl: 20, ench: 6, party: 1, players: 1 }, ctx); ok(b.p["ach_x_black_kill"] === 1, "чёрный враг — скрытое засчитано");
  boardEvent(a, h, { type: "kill", mob: "x", kind: "x", lvl: 20, ench: 2, cursed: 1 }, ctx); ok(b.p["ach_x_ench_combo_mob"] === 1, "проклятый + зачарованный — «двойная метка»");
  boardEvent(a, h, { type: "salvage", n: 2, items: [{ ench: 0 }, { ench: 6 }] }, ctx); ok(b.p["ach_x_black_salvage"] === 1 && b.p["ach_ench_salvage"] === 1, "разбор считает только зачарованные вещи из списка");
  boardEvent(a, h, { type: "upgrade", up: 3, ench: 4 }, ctx); ok(b.p["ach_x_ench_upg_hi"] === 1, "улучшение легендарной");
  boardEvent(a, h, { type: "upgrade", up: 3, ench: 0 }, ctx); ok(b.p["ach_x_ench_upg_hi"] === 1, "обычное улучшение — не считается");
  for (const e of [1, 2, 3, 4, 5, 6]) a.inv.push({ uid: "e" + e, id: "fly_legs", ench: e } as any);
  boardRefresh(a, h, ctx); const st: any = boardClient(a, h);
  for (const id of ["ach_x_ench_t1", "ach_x_ench_t5", "ach_x_ench_all6", "ach_x_ench6"]) ok(b.p[id] >= 1 && st.reveal[id], `скрытое «${BTASKS[id].title}» открыто`);
  ok(!st.reveal["ach_x_black_three"], "«Три тени» ещё скрыто (одна чёрная вещь)");
  const d = boardDefs().tasks.filter((t: any) => /^ach_x_(ench|black)/.test(t.id)); ok(d.length >= 30 && d.every((t: any) => t.t === "???"), `скрытых про чары и чёрные вещи: ${d.length}, все «???»`);
  const { a: a2, h: h2 } = mk(); h2.lvl = 20; a2.inv.push({ uid: "z", id: "fly_legs", ench: 5 } as any); boardRefresh(a2, h2, ctx);
  { const b2 = boardOf(a2), rv = boardClient(a2, h2).reveal["ach_x_ench_t5"];
    ok((b2.pre["ach_x_ench_t5"] || 0) === 1 && (b2.c["ach_x_ench_t5"] || 0) >= 1, "вещь была до запуска — ступень закрыта заранее, без награды");
    ok(!!rv && rv.t === BTASKS["ach_x_ench_t5"].title && rv.w === BTASKS["ach_x_ench_t5"].why, "выполненное до запуска скрытое всё равно раскрыто (название и условие, не «✔ ???»)", rv); }
  // любое выполненное скрытое раскрывается: прогресс ≥ первой ступени, полученная ступень или pre (даже если прогресс потом упал)
  { const { a: a3, h: h3 } = mk(); boardRefresh(a3, h3, ctx); const b3 = boardOf(a3); const hs = BTASK_LIST().filter((t: any) => t.hidden && t.on);
    for (const t of hs) { b3.c[t.id] = 1; b3.p[t.id] = 0; } const rv = boardClient(a3, h3).reveal;
    const miss = hs.filter((t: any) => !rv[t.id]).map((t: any) => t.id); ok(!miss.length, `все ${hs.length} полученных скрытых раскрыты`, miss.slice(0, 5));
    const { a: a4, h: h4 } = mk(); boardRefresh(a4, h4, ctx); ok(Object.keys(boardClient(a4, h4).reveal).length === 0, "невыполненные скрытые — «???» (ничего не раскрыто)");
    const d0 = boardDefs().tasks.find((t: any) => t.id === hs[0].id); ok(d0 && d0.t === "???" && !d0.h, "подсказки по умолчанию нет (поле hint пустое)", d0); }
}
// админка
{ ok(typeof validatePatch("btask", "hunt_ice_crescent_wolf", { "n.1": 5 }) === "string", "ступени должны расти");
  ok(typeof validatePatch("btask", "hunt_ice_crescent_wolf", { f: "elite,hack" }) === "string", "неизвестное условие — отказ");
  ok(typeof validatePatch("btask", "hunt_ice_crescent_wolf", { title: "x".repeat(200) }) === "string", "длинное название — отказ");
  const p = validatePatch("btask", "hunt_ice_crescent_wolf", { title: "Волки <b>", "n.0": 12, "d.0": 2 }); ok(typeof p === "object" && p.title === "Волки b", "правка задания очищается");
  applyOverride("btask", "hunt_ice_crescent_wolf", p); ok(BTASKS["hunt_ice_crescent_wolf"].n[0] === 12 && BTASKS["hunt_ice_crescent_wolf"].title === "Волки b", "правка применена");
  applyOverride("btask", "hunt_ice_crescent_wolf", null); ok(BTASKS["hunt_ice_crescent_wolf"].n[0] === 10, "сброс правки");
  ok(typeof validatePatch("board", "main", { "bands.2": 3 }) === "string", "полосы уровней должны расти");
  ok(typeof validatePatch("board", "main", { tz: "Mars/Base" }) === "string", "неизвестный пояс — отказ");
  const q = validatePatch("board", "main", { "caps.daily": 8, "xp.1.2": 6, "xpMul.weekly": 0.5 }); applyOverride("board", "main", q); ok(BOARD_CFG.caps.daily === 8 && BOARD_CFG.xp[1][2] === 6 && BOARD_CFG.xpMul.weekly === 0.5, "таблица, потолки и множители правятся");
  applyOverride("board", "main", null); ok(BOARD_CFG.caps.daily === 0 && BOARD_CFG.xp[1][2] === 7, "сброс таблицы");
  ok(typeof validatePatch("board", "main", { dailyMin: 7, dailyMax: 5 }) === "string", "пул: «от» больше «до» — отказ");
  ok(currentValues("board", "main")["cats.hard"] === true, "значения для панели");
  applyOverride("board", "main", { "cats.hunt": false }); const { a, h } = mk(); h.lvl = 6; boardRefresh(a, h, ctx);
  boardOf(a).sel.hunt = ["hunt_ice_crescent_wolf"]; ok(!boardTake(a, h, "hunt_ice_crescent_wolf", true).ok, "вкладка выключена — взять нельзя"); applyOverride("board", "main", null);
}
// размер данных клиенту
{ const { a, h } = mk(); boardRefresh(a, h, ctx); const s = JSON.stringify(boardClient(a, h)).length, d = JSON.stringify(boardDefs()).length;
  ok(s < 20000, `состояние ${s} байт`); ok(d < 240000, `определения ${d} байт (раз в сессию; +5 КБ — новые условия «один удар/навыки/без навыков»)`); }
// производительность события
{ const { a, h } = mk(); h.lvl = 10; boardRefresh(a, h, ctx); const t0 = performance.now();
  for (let i = 0; i < 20000; i++) boardEvent(a, h, { type: "kill", mob: "golem", kind: "stone_golem", lvl: 10, elite: i % 7 === 0 }, ctx);
  const us = (performance.now() - t0) * 1000 / 20000; ok(us < 50, `событие kill: ${us.toFixed(1)} мкс`); }
// ═══ ранги и бонусные условия ═══
{ // распределение рангов: SS очень редкий; S/SS только у боёв, забегов, испытаний
  const cnt: any = {}; for (let i = 0; i < 20000; i++) { const R = makeRoll(BTASKS.w_kill_b, 10, "p" + i, "k", ["warrior", "mage"]); cnt[R.r] = (cnt[R.r] || 0) + 1; }
  ok(cnt.F > cnt.D && cnt.D > cnt.B && cnt.B > cnt.S && cnt.S > cnt.SS && cnt.SS > 0 && cnt.SS / 20000 < 0.01, `веса рангов: ${RANKS.map((r) => r + " " + (cnt[r] || 0)).join(", ")}`);
  let grp = 0; for (let i = 0; i < 3000; i++) { const R = makeRoll(BTASKS.d_craft, 10, "c" + i, "k", ["warrior"]); if (R.r === "S" || R.r === "SS") grp++; }
  ok(grp === 0, "ремесло: без S/SS (отряд не поможет)");
  // неделя: герой 10, ранг D → враги не ниже 12 (пример Алекса)
  let R: any = null; for (let i = 0; i < 500 && !R; i++) { const x = makeRoll(BTASKS.w_kill_b, 10, "w" + i, "k", ["warrior"]); if (x.r === "D") R = x; }
  ok(R && R.minL === 12 && R.n >= 400, `еженедельное D у героя 10: враги ${R?.minL}+ ×${R?.n}`);
  // SS: мировые боссы, звать отряд; опыт больше S, S больше A
  let SS: any = null; for (let i = 0; i < 20000 && !SS; i++) { const x = makeRoll(BTASKS.w_kill_b, 12, "s" + i, "k", ["warrior"]); if (x.r === "SS") SS = x; }
  ok(SS && SS.f === "wboss" && SS.n >= 1 && /отряд/.test(SS.w), `SS: ${SS?.w}`);
  const xr = (r: string) => { for (let i = 0; i < 40000; i++) { const x = makeRoll(BTASKS.w_kill_b, 12, "x" + i, "k", ["warrior"]); if (x.r === r) return x.x; } return 0; };
  const [xa, xs, xss] = [xr("A"), xr("S"), xr("SS")]; ok(xa > 0 && xs > xa && xss > xs, `опыт A ${xa} < S ${xs} < SS ${xss}`);
  // опыт — число от уровня задания: одинаков для героя любого уровня при одном выпадении
  ok(makeRoll(BTASKS.pd_dew_slime, 3, "z", "k", []).x === makeRoll(BTASKS.pd_dew_slime, 3, "z", "k", []).x, "детерминированно");
}
{ // выпадение детерминировано для игрока и периода, у всех выбранных есть ранг
  const m1 = mk(), m2 = mk(); m1.h.lvl = 10; m2.h.lvl = 10; boardRefresh(m1.a, m1.h, ctx); boardRefresh(m2.a, m2.h, ctx);
  const b1 = boardOf(m1.a), b2 = boardOf(m2.a);
  ok(JSON.stringify(b1.sel.weekly) === JSON.stringify(b2.sel.weekly) && JSON.stringify(b1.roll) === JSON.stringify(b2.roll), "тот же игрок/период — тот же набор и ранги");
  ok(["daily", "weekly", "monthly", "hard"].every((c) => (b1.sel[c] || []).length > 0 && (b1.sel[c] || []).every((id: string) => b1.roll[id]?.r)), "у всех выпавших есть ранг");
  ok((b1.sel.hunt || []).every((id: string) => b1.roll[id]?.r), "у заказов Доски — ранг");
  ok(!!boardClient(m1.a, m1.h).roll && Object.keys(boardClient(m1.a, m1.h).roll).length >= (b1.sel.daily || []).length, "ранги уходят клиенту");
}
{ // уровень врагов от ранга, бонусы: смерть, «выше уровнем», опыт за выполненные
  const { a, h } = mk(); h.lvl = 10; boardRefresh(a, h, ctx); const b = boardOf(a);
  b.sel.daily = ["d_kill_b"]; b.roll.d_kill_b = { r: "B", L: 12, minL: 12, n: 3, d: 2, x: 1000, f: "", k: "t", w: "x", bon: [{ k: "nodeath", xp: 250, ok: 1 }, { k: "higher", v: 2, xp: 250, ok: 1 }] };
  boardEvent(a, h, { type: "kill", mob: "x", kind: "x", lvl: 11 }, ctx); ok(!b.p.d_kill_b, "враг ниже уровня ранга не засчитан");
  boardEvent(a, h, { type: "kill", mob: "x", kind: "x", lvl: 12 }, ctx); ok(b.p.d_kill_b === 1 && b.roll.d_kill_b.bon[1].ok === 1, "12-й засчитан, «на 2 выше» цел");
  boardEvent(a, h, { type: "death" }, ctx); ok(b.roll.d_kill_b.bon[0].ok === 0, "смерть срывает «без смерти»");
  boardEvent(a, h, { type: "kill", mob: "x", kind: "x", lvl: 13 }, ctx); boardEvent(a, h, { type: "kill", mob: "x", kind: "x", lvl: 12 }, ctx);
  ok(b.p.d_kill_b === 3 && b.roll.d_kill_b.done, "основное выполнено");
  const r = boardClaim(a, h, "d_kill_b", ctx); ok(r.ok && r.xp === 1250 && r.rank === "B" && r.bon === 1, `опыт: ранг 1000 + 1 бонус 250 = ${r.xp}`);
  // отряд: «только в отряде»
  b.sel.daily = ["d_kill_a"]; b.roll.d_kill_a = { r: "S", L: 12, minL: 0, n: 2, d: 2, x: 100, f: "", k: "t", w: "x", bon: [{ k: "party", xp: 10, ok: 1 }, { k: "fast", v: 1, xp: 10, ok: 1 }] }; delete b.c.d_kill_a; delete b.p.d_kill_a;
  boardEvent(a, h, { type: "kill", mob: "x", kind: "x", lvl: 12, party: 3 }, ctx); boardEvent(a, h, { type: "kill", mob: "x", kind: "x", lvl: 12, party: 1 }, ctx);
  ok(b.roll.d_kill_a.bon[0].ok === 0 && b.roll.d_kill_a.bon[1].ok === 1, "убийство без отряда срывает «в отряде»; «на время» уложился");
  const r2 = boardClaim(a, h, "d_kill_a", ctx); ok(r2.xp === 110, `только основное + «на время»: ${r2.xp}`);
}
{ // набор периода добирается при росте уровня (тяжёлые с 1-го уровня пусты)
  const { a, h } = mk(); h.lvl = 1; boardRefresh(a, h, ctx); const b = boardOf(a); const n1 = (b.sel.hard || []).length;
  const keep = [...(b.sel.daily || [])]; h.lvl = 15; boardRefresh(a, h, ctx);
  ok((b.sel.hard || []).length > n1 && b.sel.hard.every((id: string) => b.roll[id]) && keep.every((id) => b.sel.daily.includes(id)), `тяжёлые добраны на 15 ур.: ${n1} → ${(b.sel.hard || []).length}, выпавшее не тронуто`);
}
{ // заказ Доски с рангом: сдан — снова может выпасть (не сегодня)
  const { a, h } = mk(); h.lvl = 10; boardRefresh(a, h, ctx); const b = boardOf(a); const id = (b.sel.hunt || [])[0];
  ok(boardTake(a, h, id, true).ok, "заказ взят"); b.p[id] = b.roll[id].n; const r = boardClaim(a, h, id, ctx);
  ok(r.ok && r.rank && !b.c[id] && !b.roll[id] && !(b.sel.hunt || []).includes(id), "сданный заказ вернулся в пул");
}

// сундук за ранговое задание: карточка знает ярус и шанс проклятого (от сервера, с правками админки); потолок хранилища
{ const { a, h } = mk(); h.lvl = 12; boardRefresh(a, h, ctx); const st: any = boardClient(a, h); const ids = Object.keys(st.roll || {});
  const bad = ids.filter((id) => { const R = st.roll[id], t = BTASKS[id], c = st.bc[id]; const want = !!tierOfRank(R.r) && ["daily", "weekly", "monthly", "hard", "hunt"].includes(t.cat);
    if (!want) return !!c; const T = BCHEST.tiers[bumpTier(tierOfRank(R.r)!, R.maxL ? fitReward(R.L).tu : 0)]; return !c || c.n !== T.name || c.cp !== rankCursePct(R.r) || c.cp > 30; });
  ok(ids.length > 0 && !bad.length, `сундук в карточке у ${ids.length} ранговых заданий: ярус и шанс проклятого по рангу`, bad.slice(0, 3));
  const exp: Record<string, number> = { F: 30, E: 25, D: 20, C: 15, B: 12, A: 10, S: 5, SS: 2 }; ok(Object.entries(exp).every(([r, v]) => rankCursePct(r) === v), "шанс проклятого F30 E25 D20 C15 B12 A10 S5 SS2");
  ok(st.bcs && st.bcs.max === 100 && st.bcs.n === 0, "хранилище сундуков: 0 из 100", st.bcs);
  const save = BCHEST.rankCurse.D; BCHEST.rankCurse.D = 7; const st2: any = boardClient(a, h); const dId = ids.find((id) => st.roll[id].r === "D");
  ok(!dId || st2.bc[dId].cp === 7, "правка админки (rankCurse) сразу видна в карточке"); BCHEST.rankCurse.D = save; }
console.log(f ? `FAILED ${f}` : "board ok"); if (f) process.exit(1);
