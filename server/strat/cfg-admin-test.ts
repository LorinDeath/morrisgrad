// t1243: полная админка правил — схема, проверка, слияние, версии (идущая партия и повтор держат свой снимок), откат, сброс, конфликт, доступ.
// Настоящий SQLite (bun:sqlite) с миграциями вместо D1. Без ботов.
import { Database } from "bun:sqlite";
import { readdirSync, readFileSync } from "node:fs";
import { newGame, apply, STRAT_CFG } from "./rules";
import { schema, checkValue, invariants, pathsPatch, flatten, resolve, toPath, SECTIONS } from "./cfg-schema";
import { loadStratCfg, dropOverrideCache, mergeCfg } from "./cfg";
import { startLog, logAct, rebuild } from "./replay";
import { adminCfgHttp } from "./admin-cfg-http";
let fails = 0; const ok = (c: any, m: string) => { if (!c) { fails++; console.log("FAIL", m); } };

// ── схема
const S = schema(), F = (p: string) => S.byPath.get(p)!;
ok(S.fields.length > 2000, "схема покрывает весь конфиг (" + S.fields.length + " полей)");
ok(S.fields.every((f) => SECTIONS.some((s) => s.id === f.sec)) && S.fields.every((f) => f.g && f.l), "у каждого поля есть раздел и русская подпись");
ok(invariants(STRAT_CFG).length === 0, "правила из кода проходят все связи: " + JSON.stringify(invariants(STRAT_CFG).slice(0, 2)));
ok(S.fields.every((f) => !checkValue(f, f.def, f.p) || f.ro), "каждое умолчание проходит свою проверку");
for (const sec of ["units", "races", "chief", "ults", "techs", "build", "econ", "league", "goals", "xp"]) ok(S.fields.some((f) => f.sec === sec && !f.ro), "раздел «" + sec + "» редактируется");
ok(F("techs.#horse.era").t === "int" && F("techs.#horse.era").max === 4, "эпоха технологии 1…4");
ok(F("techs.#steel.req.0").opts!.includes("horse"), "требование технологии — выбор из технологий");
ok(F("ults.blink.shape").opts!.join() === "circle,square,line,chain", "форма ульты — 4 варианта");
ok(F("techs.#horse.id").ro && F("goals.ids.0").ro, "коды элементов — только просмотр");
ok(resolve(STRAT_CFG, "chiefs.#fire_lord.tree.#aura.fx.auraArm")?.join() === "chiefs,0,tree,0,fx,auraArm", "путь по id элементов");
ok(resolve(STRAT_CFG, "techs.0.era") === null && resolve(STRAT_CFG, "techs.#nope.era") === null && resolve(STRAT_CFG, "units.pawn") === null, "неверный путь — null");
ok(toPath(STRAT_CFG, resolve(STRAT_CFG, "sizes.8.army.1.2")!) === "sizes.8.army.1.2", "путь ↔ ключи");
// ── проверка значений
const e = (p: string, v: any) => checkValue(S.byPath.get(p), v, p);
ok(!e("units.pawn.hp", 12) && e("units.pawn.hp", 0)?.includes("вне границ") && e("units.pawn.hp", 9999) && e("units.pawn.hp", 2.5)?.includes("целое") && e("units.pawn.hp", "10")?.includes("число"), "HP: целое 1…500");
ok(e("units.pawn.hp", NaN) && e("units.pawn.hp", Infinity), "NaN/∞ — нельзя");
ok(e("econ.league.normal.xp", 0)?.includes("вне границ") && !e("econ.league.normal.xp", 0.5), "множитель опыта 0,01…10");
ok(e("ults.blink.shape", "star")?.includes("можно только") && !e("ults.blink.shape", "circle"), "форма — из списка");
ok(e("techs.#horse.name", "")?.includes("пуст") && e("techs.#horse.name", "<b>x</b>")?.includes("символы") && e("techs.#horse.name", "x".repeat(61))?.includes("длинно") && !e("techs.#horse.name", "Кони"), "текст: не пустой, без < >, до 60");
ok(e("techs.#horse.id", "x")?.includes("не редактируется"), "код — нельзя");
ok(e("units.pawn.foo", 1)?.includes("нет в правилах"), "несуществующее поле");
ok(e("econ.replay.on", 1)?.includes("да/нет") && !e("econ.replay.on", false), "переключатель — да/нет");
// ── связи (инварианты)
const inv = (set: Record<string, any>) => invariants(mergeCfg(pathsPatch(set)));
ok(inv({ "econ.xp.lv.3": 1 }).some((x) => x.msg.includes("больше")), "кривая опыта должна расти");
ok(inv({ "econ.raceDraw.fav": 90 }).some((x) => x.msg.includes("100%")), "жеребьёвка: 100%");
ok(inv({ "techs.#steel.era": 1, "techs.#horse.era": 3 }).some((x) => x.msg.includes("более поздней эпохи") || x.msg.includes("одной эпохи")), "требование из более поздней эпохи — ошибка");
ok(inv({ "goals.sizes.8.need": 6, "goals.sizes.8.list.0": "glory", "goals.sizes.8.list.1": "glory" }).some((x) => x.msg.includes("повторяются")), "цели не повторяются");
ok(inv({ "econ.league.normal.apBase": 9, "econ.league.normal.apMax": 3 }).some((x) => x.msg.includes("ОД база")), "ОД база ≤ максимум");
ok(inv({ "sizes.8.army.0.2": "pawn" }).some((x) => x.msg.includes("ровно один Вождь")), "в армии ровно один Вождь");
// ── слияние
const P = pathsPatch({ "units.pawn.hp": 14, "techs.#horse.fx.knightDisc": 2, "chiefs.#fire_lord.tree.#aura.fx.auraArm": 3, "sizes.8.army.1.0": "rook", "techs.#gone.era": 2, "units.pawn.hp2": 1 });
const C = mergeCfg(P) as any;
ok(C.units.pawn.hp === 14 && C.techs.find((t: any) => t.id === "horse").fx.knightDisc === 2 && C.chiefs[0].tree[0].fx.auraArm === 3 && C.sizes[8].army[1][0] === "rook", "правки по путям слиты");
ok(Array.isArray(C.sizes[8].army[1]) && C.sizes[8].army[1].length === STRAT_CFG.sizes[8]!.army[1]!.length && Array.isArray(C.techs), "списки остаются списками той же длины");
ok((STRAT_CFG as any).units.pawn.hp === 10, "умолчания не испорчены");
ok(JSON.stringify(flatten(P)) === JSON.stringify({ "units.pawn.hp": 14, "sizes.8.army.1.0": "rook", "techs.#horse.fx.knightDisc": 2, "chiefs.#fire_lord.tree.#aura.fx.auraArm": 3 }) || Object.keys(flatten(P)).length === 4, "патч → пути (устаревшие пропущены)");
{ const long = "Длинное описание ".repeat(20).trim(); ok((mergeCfg(pathsPatch({ "techs.#horse.eff": long })) as any).techs[0].eff === long, "длинные описания (до 400) не обрезаются"); }

// ── D1 на SQLite + HTTP
const sql = new Database(":memory:");
for (const f of readdirSync(new URL("../migrations", import.meta.url).pathname).filter((x) => x.endsWith(".sql")).sort()) sql.exec(readFileSync(new URL("../migrations/" + f, import.meta.url).pathname, "utf8"));
sql.exec("INSERT INTO player_roles (pkey, role, granted_by, granted_at) VALUES ('uid:adm', 'admin', 't', 0), ('uid:mod', 'moderator', 't', 0)");
const stmt = (q: string, args: any[] = []): any => ({ bind: (...a: any[]) => stmt(q, a), first: async () => sql.query(q).get(...args) ?? null, all: async () => ({ results: sql.query(q).all(...args) }), run: async () => (sql.query(q).run(...args), { success: true }), _q: q, _a: args });
const db: any = { prepare: (q: string) => stmt(q), batch: async (ss: any[]) => sql.transaction(() => ss.map((s) => sql.query(s._q).run(...s._a)))() };
const env: any = { GAME_DB: db, MC_DEV_TRUST_USERID: "1" };
const req = (method: string, body?: any, user = "adm") => adminCfgHttp(new Request("http://127.0.0.1:8871/strat/admin/cfg" + (user ? "?devUser=" + user : ""), { method, body: body ? JSON.stringify(body) : undefined }), env);
const J = async (r: Response) => ({ s: r.status, j: (await r.json()) as any });

(async () => {
  // доступ
  ok((await req("GET", undefined, "")).status === 401, "без сессии — 401");
  ok((await req("GET", undefined, "mod")).status === 403 && (await req("GET", undefined, "joe")).status === 403, "модератор и игрок — 403");
  ok((await adminCfgHttp(new Request("https://morris.example/strat/admin/cfg?devUser=adm"), { ...env })).status === 401, "devUser не работает вне локального стенда");
  ok((await adminCfgHttp(new Request("http://127.0.0.1:8871/strat/admin/cfg?devUser=adm"), { GAME_DB: db })).status === 401, "devUser не работает без MC_DEV_TRUST_USERID");
  const g = await J(await req("GET")); ok(g.s === 200 && g.j.rev === 0 && g.j.fields.length === S.fields.length && g.j.sections.length === SECTIONS.length, "GET: схема, версия 0");

  // старт «идущей» партии до правки (снимок L.cfg / L.cfgPatch → лог повтора)
  dropOverrideCache(); const c0 = await loadStratCfg(env, true); const g0 = newGame(8, ["fire", "ice"], 0, c0.cfg);
  const log = startLog("t", g0, c0.cfg, null, Object.keys(c0.patch).length ? c0.patch : undefined);
  for (let i = 0; i < 4; i++) { apply(g0, g0.cur, { a: "end" } as any, c0.cfg); logAct(log, (g0.cur ^ 1) as any, { a: "end" } as any, false, g0, true); }
  const pawnHp0 = g0.pieces.find((p: any) => p.kind === "pawn")!.hp;

  // проверка без сохранения: ошибки по-русски, ничего не записано
  let r = await J(await req("POST", { op: "check", set: { "units.pawn.hp": 0, "ults.blink.shape": "star" } }));
  ok(r.s === 400 && r.j.errors.length === 2 && r.j.errors[0].msg.includes("Ополченец"), "check: ошибки с подписью поля");
  r = await J(await req("POST", { op: "check", set: { "econ.raceDraw.fav": 95 } })); ok(r.s === 400 && r.j.errors[0].msg.includes("100%"), "check: связи полей");
  r = await J(await req("POST", { op: "check", set: { "units.pawn.hp": 14, "sizes.8.turnLimit": 30 } }));
  ok(r.s === 200 && r.j.diff.length === 2 && r.j.diff.find((d: any) => d.p === "units.pawn.hp").before === 10 && r.j.diff.find((d: any) => d.p === "units.pawn.hp").after === 14, "check: разница было → стало");
  ok(sql.query("SELECT COUNT(*) n FROM strat_cfg_override").get()!.n === 0, "check ничего не сохраняет");
  // сохранение
  r = await J(await req("POST", { op: "save", set: { "units.pawn.hp": 14, "sizes.8.turnLimit": 30, "techs.#horse.name": "  Конница  " }, base: 0, note: "тест", who: "Алекс" }));
  ok(r.s === 200 && r.j.rev === 1 && r.j.n === 3, "save → версия 1, 3 поля");
  r = await J(await req("POST", { op: "save", set: { "units.pawn.hp": 15 }, base: 0 })); ok(r.s === 409 && r.j.msg.includes("кто-то"), "устаревшая версия → 409 конфликт");
  r = await J(await req("POST", { op: "save", set: { "units.pawn.hp": -5 }, base: 1 })); ok(r.s === 400 && !sql.query("SELECT 1 FROM strat_cfg_rev WHERE rev = 2").get(), "неверное значение → 400, версия не создана");
  const g1 = await J(await req("GET"));
  ok(g1.j.rev === 1 && g1.j.over["units.pawn.hp"] === 14 && g1.j.over["techs.#horse.name"] === "Конница" && g1.j.fields.find((f: any) => f.p === "units.pawn.hp").cur === 14, "GET: правки и итог");
  ok(g1.j.log.length === 3 && g1.j.log.every((l: any) => l.by === "adm" && l.rev === 1 && l.at > 0) && g1.j.log.find((l: any) => l.key === "p:units.pawn.hp").before === null, "журнал: кто, когда, было → стало, версия");
  ok(g1.j.revs[0].rev === 1 && g1.j.revs[0].note === "тест" && g1.j.revs[0].who === "Алекс" && g1.j.revs[0].n === 3, "версия: заметка, кто, сколько полей");

  // новая партия — новые числа; идущая и её повтор — свои
  const c1 = await loadStratCfg(env, true); const gN = newGame(8, ["fire", "ice"], 0, c1.cfg);
  ok(c1.rev === 1 && gN.turnLimit === 30 && gN.pieces.find((p: any) => p.kind === "pawn")!.hp > pawnHp0, "новая партия — с правкой (лимит 30, HP Ополченца выше)");
  ok(g0.turnLimit === 50 && c0.cfg.units.pawn.hp === 10 && g0.pieces.find((p: any) => p.kind === "pawn")!.hp === pawnHp0, "идущая партия — со своим снимком");
  const rb = rebuild(log, mergeCfg(log.patch || {})); ok(rb.diverged === -1 && rb.g.turnLimit === 50 && rb.g.turn === g0.turn, "старый повтор — свои правила, без расхождения");
  const log1 = startLog("t1", gN, c1.cfg, null, c1.patch); ok(rebuild(log1, mergeCfg(log1.patch)).g.turnLimit === 30, "повтор новой партии — с правкой");

  // откат одной записи журнала
  const lid = g1.j.log.find((l: any) => l.key === "p:units.pawn.hp").id;
  r = await J(await req("POST", { op: "undo", log: lid, dry: true })); ok(r.s === 200 && r.j.diff.length === 1 && r.j.diff[0].p === "units.pawn.hp" && r.j.diff[0].reset, "предпросмотр отката: одно поле, ничего не записано");
  ok((await J(await req("GET"))).j.rev === 1, "после предпросмотра версия та же");
  r = await J(await req("POST", { op: "undo", log: lid, base: 0 })); ok(r.s === 409, "откат с устаревшей версией-основой → 409");
  r = await J(await req("POST", { op: "undo", log: lid })); ok(r.s === 200 && r.j.rev === 2, "откат записи → версия 2");
  let g2 = (await J(await req("GET"))).j; ok(!("units.pawn.hp" in g2.over) && g2.over["sizes.8.turnLimit"] === 30, "откат вернул только это поле");
  // «вернуть по умолчанию»: поле (null), раздел, всё
  r = await J(await req("POST", { op: "save", set: { "techs.#horse.name": null }, base: 2 })); ok(r.s === 200 && r.j.rev === 3, "сброс поля");
  await J(await req("POST", { op: "save", set: { "units.knight.atk": 7, "ults.blink.cd": 5 }, base: 3 }));
  r = await J(await req("POST", { op: "reset", sec: "units" })); g2 = (await J(await req("GET"))).j;
  ok(r.s === 200 && !("units.knight.atk" in g2.over) && g2.over["ults.blink.cd"] === 5, "сброс раздела «Фигуры» не трогает ульты");
  // возврат к версии 1
  r = await J(await req("POST", { op: "restore", rev: 1 })); g2 = (await J(await req("GET"))).j;
  ok(r.s === 200 && g2.over["units.pawn.hp"] === 14 && g2.over["techs.#horse.name"] === "Конница" && !("ults.blink.cd" in g2.over), "возврат к версии 1 — точный снимок");
  r = await J(await req("POST", { op: "reset" })); g2 = (await J(await req("GET"))).j;
  ok(r.s === 200 && Object.keys(g2.over).length === 0 && (await loadStratCfg(env, true)).cfg.units.pawn.hp === 10, "сброс всего — умолчания");
  ok(g2.revs.length === r.j.rev && g2.log.every((l: any) => l.rev), "каждое действие — версия и журнал");
  // значение = умолчанию — правка не хранится
  r = await J(await req("POST", { op: "save", set: { "units.pawn.hp": 10 }, base: g2.rev })); ok(r.s === 200 && r.j.n === 0, "значение по умолчанию — правки нет");
  // старый раздел «Цели и лиги» (league:N) переносится в полную админку
  sql.exec(`INSERT INTO strat_cfg_override (key, json, updated_at, updated_by) VALUES ('league:8', '{"gold":222}', 1, 'old')`); dropOverrideCache();
  g2 = (await J(await req("GET"))).j; ok(g2.legacy["goals.sizes.8.gold"] === 222 && g2.fields.find((f: any) => f.p === "goals.sizes.8.gold").cur === 222, "старая правка лиги видна");
  r = await J(await req("POST", { op: "save", set: { "units.pawn.hp": 11 }, base: g2.rev })); g2 = (await J(await req("GET"))).j;
  ok(r.s === 200 && g2.over["goals.sizes.8.gold"] === 222 && !sql.query("SELECT 1 FROM strat_cfg_override WHERE key = 'league:8'").get() && (await loadStratCfg(env, true)).cfg.goals.sizes[8]!.gold === 222, "старая правка лиги перенесена без потерь");
  // устаревшая правка (поле убрали из кода) — не ломает загрузку
  sql.exec(`INSERT INTO strat_cfg_override (key, json, updated_at, updated_by) VALUES ('p:units.pawn.gone', '{"v":5}', 1, 'x'), ('p:techs.#horse.era', '{"v":99}', 1, 'x')`); dropOverrideCache();
  const c9 = await loadStratCfg(env, true); g2 = (await J(await req("GET"))).j;
  ok(c9.cfg.units.pawn.hp === 11 && (c9.cfg as any).techs[0].era === 1 && g2.stale.includes("units.pawn.gone"), "устаревшие и неверные строки пропускаются");
  // t1243: стартовые ОД — закреплены вверху и правятся по лигам; 4 доходит до новой партии
  const S0 = schema(); ok(["quick", "normal", "tactical"].every((l) => S0.byPath.get(`econ.league.${l}.apBase`)?.pin === 1), "стартовые ОД по лигам — в «Главном»");
  g2 = (await J(await req("GET"))).j;
  r = await J(await req("POST", { op: "save", set: { "econ.league.quick.apBase": 7, "econ.league.quick.apMax": 6 }, base: g2.rev })); ok(r.s === 400 && r.j.errors.some((e: any) => /ОД/.test(e.msg)), "стартовые ОД выше максимума — ошибка");
  r = await J(await req("POST", { op: "save", set: { "econ.league.quick.apBase": 4, "econ.league.normal.apBase": 4, "econ.league.tactical.apBase": 4 }, base: g2.rev })); ok(r.s === 200 && r.j.diff.length === 3, "стартовые ОД = 4 во всех лигах");
  const cA = await loadStratCfg(env, true); ok([5, 8, 15].every((n) => newGame(n, ["fire", "ice"], 0, cA.cfg).ap === 4), "новые партии 5×5, 8×8, 15×15 начинаются с 4 ОД");
  console.log(fails ? `cfg-admin-test: FAIL ${fails}` : "cfg-admin-test: OK"); if (fails) process.exit(1);
})();
