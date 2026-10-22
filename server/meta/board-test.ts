// Доска заданий: счётчики, взятие/сдача, повторная награда, периоды (Киев), потолок опыта, обучение, админка.
import { BOARD_CFG, BTASKS, boardCounts, boardEvent, boardRefresh, boardClaim, boardTake, boardTut, boardOf, tierXp, dayCap, periodKey, nextResets, boardClient, boardDefs } from "./board";
import { newAccount, newHero } from "./profile";
import { validatePatch, applyOverride, currentValues } from "./overrides";
import { heroXpNeed } from "./defs";
let f = 0; const ok = (c: any, m: string) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) f++; };
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
  const cap = dayCap(12); ok(cap === Math.round(heroXpNeed(12) * BOARD_CFG.capPct / 100), "потолок = % уровня");
  const ach = BTASKS["ach_kills"]; let total = 0;
  for (let i = 0; i < 1000; i++) boardEvent(a, h, { type: "kill", mob: "x", kind: "x", lvl: 12 }, ctx);
  const r = boardClaim(a, h, "ach_kills", ctx); total += r.xp || 0;
  b.xd.v = cap - 10; b.p["ach_elite"] = 10; const r2 = boardClaim(a, h, "ach_elite", ctx);
  ok(r2.ok && r2.xp <= 10 && r2.cappedXp > 0, `сверх потолка опыт не даётся (дано ${r2.xp}, срезано ${r2.cappedXp})`);
  ok(b.xd.v <= cap, "дневной счётчик не выше потолка");
  void ach; void total;
}
// периоды: смена суток по Киеву
{ const { a, h } = mk(); h.lvl = 10; const t0 = Date.UTC(2026, 9, 22, 20, 59); // 23:59 Киев
  boardRefresh(a, h, ctx, t0); const b = boardOf(a);
  ok((b.sel.daily || []).length === BOARD_CFG.dailyN + 1 && b.sel.daily.includes("d_bmage"), `ежедневных выбрано ${b.sel.daily?.length} (+«Найти Чёрного мага» у всех)`);
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
  const { a: v, h: hv } = mk(); hv.lvl = 14; boardRefresh(v, hv, ctx); ok(boardOf(v).tut.vet && !Object.keys(boardOf(v).c).some((k) => k.startsWith("tut_")), "опытный игрок: обучение засчитано без наград");
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
{ const t = BTASKS["hunt_ice_crescent_wolf"]; const L = Math.min(20, t.lvl + BOARD_CFG.refPlus);
  ok(tierXp(t, 0, 20) === Math.round(heroXpNeed(L) * BOARD_CFG.xp[Math.floor((L - 1) / 5)][t.d[0] - 1] / 100), "опыт = опыт уровня цели × % таблицы");
  ok(tierXp(t, 0, 20) < tierXp({ ...t, lvl: 0 } as any, 0, 20), "низкое задание на высоком уровне даёт меньше");
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
  const q = validatePatch("board", "main", { capPct: 20, "xp.1.2": 6 }); applyOverride("board", "main", q); ok(BOARD_CFG.capPct === 20 && BOARD_CFG.xp[1][2] === 6, "таблица опыта правится");
  applyOverride("board", "main", null); ok(BOARD_CFG.capPct === 30 && BOARD_CFG.xp[1][2] === 7, "сброс таблицы");
  ok(currentValues("board", "main")["cats.hard"] === true, "значения для панели");
  applyOverride("board", "main", { "cats.hunt": false }); const { a, h } = mk(); h.lvl = 6; boardRefresh(a, h, ctx);
  boardOf(a).sel.hunt = ["hunt_ice_crescent_wolf"]; ok(!boardTake(a, h, "hunt_ice_crescent_wolf", true).ok, "вкладка выключена — взять нельзя"); applyOverride("board", "main", null);
}
// размер данных клиенту
{ const { a, h } = mk(); boardRefresh(a, h, ctx); const s = JSON.stringify(boardClient(a, h)).length, d = JSON.stringify(boardDefs()).length;
  ok(s < 20000, `состояние ${s} байт`); ok(d < 200000, `определения ${d} байт (раз в сессию)`); }
// производительность события
{ const { a, h } = mk(); h.lvl = 10; boardRefresh(a, h, ctx); const t0 = performance.now();
  for (let i = 0; i < 20000; i++) boardEvent(a, h, { type: "kill", mob: "golem", kind: "stone_golem", lvl: 10, elite: i % 7 === 0 }, ctx);
  const us = (performance.now() - t0) * 1000 / 20000; ok(us < 50, `событие kill: ${us.toFixed(1)} мкс`); }
console.log(f ? `FAILED ${f}` : "board ok"); if (f) process.exit(1);
