// Админка: свои задания доски (cx_…) — создание, проверка цели, копия, сброс = удаление, индекс событий; встроенные — без смены раздела
import { validatePatch, applyOverride, currentValues, btTargetErr, TABLES } from "./overrides";
import { BTASKS, boardEvent, boardDefs, boardRefresh, boardOf } from "./board";
import { newAccount, newHero } from "./profile";
let fails = 0; const ok = (c: any, m: string) => { if (!c) { fails++; console.log("FAIL", m); } else console.log("PASS", m); };
const base = { cat: "daily", ev: "kill", on: true, title: "Тест: волки", why: "проверка", giver: "", m: "", f: "", "n.0": 3, "d.0": 2, "n.1": 0, "d.1": 0, minLvl: 1, maxLvl: 30, lvl: 0, w: 2, res: { soul_shard: 1 }, item: "", req: "", hidden: false };
ok(typeof validatePatch("btask", "zz_new", base) === "string", "новый id без cx_ отклонён");
ok(typeof validatePatch("btask", "cx_t1", { ...base, cat: "tut" }) === "string", "раздел «обучение» для нового — нельзя");
ok(typeof validatePatch("btask", "cx_t1", { ...base, ev: "hack" }) === "string", "неизвестное событие отклонено");
ok(typeof validatePatch("btask", "cx_t1", { ...base, m: "nonexistent_mob" }) === "string", "цель не из списка отклонена");
ok(!BTASKS.cx_t1, "после отказа шаблон не остался");
const mob = Object.keys(TABLES.mob)[0];
const p = validatePatch("btask", "cx_t1", { ...base, m: mob });
ok(typeof p !== "string" && p.cat === "daily" && p.ev === "kill", "валидный патч содержит cat/ev");
ok(!BTASKS.cx_t1, "проверка не создаёт задание");
applyOverride("btask", "cx_t1", p);
ok(BTASKS.cx_t1?.title === "Тест: волки" && BTASKS.cx_t1.m === mob && BTASKS.cx_t1.w === 2, "создано через правку");
ok(boardDefs().tasks.some((t: any) => t.id === "cx_t1"), "видно игрокам в описании доски");
ok(currentValues("btask", "cx_t1")?.cat === "daily", "значения для админки");
// смена раздела у своего — нельзя, у встроенного — нельзя
ok(typeof validatePatch("btask", "cx_t1", { ...p, cat: "weekly" }) === "string", "раздел своего не меняется (копия)");
const bi = Object.keys(BTASKS).find((k) => BTASKS[k].cat === "daily" && !k.startsWith("cx_"))!;
ok(typeof validatePatch("btask", bi, { ...currentValues("btask", bi), ev: "gather" }) === "string", "событие встроенного не меняется");
ok(typeof validatePatch("btask", bi, { ...currentValues("btask", bi), w: 3 }) !== "string", "вес встроенного меняется");
// счёт по событию (индекс пересобран): своё достижение (не случайный пул)
const pa = validatePatch("btask", "cx_a1", { ...base, cat: "ach", m: mob, hidden: true }); ok(typeof pa !== "string", "своё скрытое достижение");
applyOverride("btask", "cx_a1", pa);
const a: any = newAccount(); a.hero = "warrior"; const h: any = newHero("warrior"); const ctx: any = { pkey: "uid:t" };
boardRefresh(a, h, ctx); boardEvent(a, h, { type: "kill", kind: mob, mob }, ctx); boardEvent(a, h, { type: "kill", kind: mob, mob }, ctx);
ok((boardOf(a).p.cx_a1 || 0) === 2, "событие засчитано новому достижению");
ok(boardDefs().tasks.find((t: any) => t.id === "cx_a1")?.t === "???", "скрытое — «???» игрокам");
applyOverride("btask", "cx_a1", null);
// личное задание персонажа без выдающего — нельзя
ok(typeof validatePatch("btask", "cx_n1", { ...base, cat: "npc", m: mob }) === "string", "задание персонажа без выдающего — отказ");
ok(typeof validatePatch("btask", "cx_n1", { ...base, cat: "npc", m: mob, giver: "petr", req: "cx_t1" }) !== "string", "задание Петра с предусловием — ок");
ok(typeof validatePatch("btask", "cx_n2", { ...base, req: "cx_nope" }) === "string", "предусловие на несуществующее — отказ");
// сброс своего = удаление
applyOverride("btask", "cx_t1", null);
ok(!BTASKS.cx_t1 && !boardDefs().tasks.some((t: any) => t.id === "cx_t1"), "сброс удаляет своё задание");
boardEvent(a, h, { type: "kill", kind: mob, mob }, ctx); boardRefresh(a, h, ctx);
ok(true, "событие после удаления без падения");
// цели по спискам
ok(btTargetErr("st", "lvl") === null && btTargetErr("st", "zzz") !== null, "состояние — из списка");
ok(btTargetErr("gather", "nope") !== null && btTargetErr("duel", "x") !== null && btTargetErr("kill", "biome:ice") === null && btTargetErr("kill", "role:tank") === null, "цели по событиям");
if (fails) { console.log("btask-admin FAIL", fails); process.exit(1); } else console.log("btask-admin ok");
