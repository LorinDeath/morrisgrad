// Посекционное сохранение админки (admin_save_sec): каждая секция — своя строка game_overrides «<id>@<раздел>»,
// только изменённые поля; совместимость со старыми строками (вся сущность одной строкой). Запуск: cd server && bun meta/admin-section-test.ts
import { Database } from "bun:sqlite";
import { AdminStore, mergeRows } from "./admin";
import { currentValues, sectionMap, sectionIds, sectionable, secRowId, splitRowId } from "./overrides";
import { validMsg } from "./service";

let pass = 0, fail = 0;
const ok = (c: any, m: string) => { if (c) { pass++; console.log("PASS " + m); } else { fail++; console.log("FAIL " + m); } };

/** D1 поверх bun:sqlite (prepare/bind/first/all/run/batch) */
function d1() {
  const db = new Database(":memory:");
  db.exec(`CREATE TABLE game_overrides (kind TEXT NOT NULL, id TEXT NOT NULL, data TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 1, updated_by TEXT, updated_at INTEGER, PRIMARY KEY (kind, id));
    CREATE TABLE game_override_audit (aid INTEGER PRIMARY KEY AUTOINCREMENT, kind TEXT, target_id TEXT, before TEXT, after TEXT, version INTEGER, granted_by TEXT, at INTEGER);
    CREATE TABLE game_config_version (k TEXT PRIMARY KEY, v INTEGER NOT NULL DEFAULT 0); INSERT INTO game_config_version VALUES ('overrides', 213);
    CREATE TABLE custom_quests (id TEXT PRIMARY KEY, data TEXT, enabled INTEGER, version INTEGER, updated_by TEXT, updated_at INTEGER);
    CREATE TABLE quest_dialogues (quest_id TEXT PRIMARY KEY, data TEXT, version INTEGER, updated_by TEXT, updated_at INTEGER);`);
  const stmt = (sql: string, args: any[] = []) => ({
    bind: (...a: any[]) => stmt(sql, a),
    first: async () => db.query(sql).get(...args) ?? null,
    all: async () => ({ results: db.query(sql).all(...args) }),
    run: async () => { db.query(sql).run(...args); return { success: true }; },
    _run: () => db.query(sql).run(...args),
  });
  return { raw: db, prepare: (sql: string) => stmt(sql), batch: async (st: any[]) => { db.transaction(() => st.forEach((s) => s._run()))(); return []; } };
}
const rows = (D: any) => D.raw.query("SELECT id, data, version FROM game_overrides WHERE kind = 'city' ORDER BY id").all().map((r: any) => ({ ...r, data: JSON.parse(r.data) }));
const ver = (D: any) => D.raw.query("SELECT v FROM game_config_version").get().v;

// ——— разделы схемы ———
const M = sectionMap("city" as any), ids = sectionIds("city" as any);
ok(ids[0] === "_main" && ids.includes("_h_kill") && ids.includes("npc.0._h"), "разделы города: Основное, купол…, подразделы NPC — " + ids.length);
ok(M.windowMin === "_h_kill" && M.killerP === "_h_kill" && M.x === "_h_dome" && M.on === "_main" && M["npc.0.name"] === "npc.0._h", "поле → раздел (windowMin — «убийца»)");
ok(secRowId("main", "_main") === "main" && secRowId("main", "_h_kill") === "main@_h_kill" && splitRowId("main@_h_kill")[0] === "main" && splitRowId("main")[1] === "_main", "id строки раздела");
ok(!sectionable("loot" as any) && !sectionable("btask" as any) && sectionable("city" as any) && sectionable("mob" as any), "дроп и btask — без разделов (свои формы, целиком)");

// ——— протокол: >200 полей больше не отбрасывается («Неверный запрос» → вечное «Сохранение…») ———
const big: any = {}; for (let i = 0; i < 233; i++) big["f" + i] = i;
ok(validMsg({ type: "admin_save", kind: "city", id: "main", patch: big }), "admin_save с 233 полями (весь город) проходит проверку сообщения");
ok(validMsg({ type: "admin_save_sec", kind: "city", id: "main", sec: "_h_kill", patch: { windowMin: 1 } }), "admin_save_sec — допустимое сообщение");
ok(!validMsg({ type: "admin_save_sec", kind: "city", id: "main", patch: { windowMin: 1 } }), "admin_save_sec без sec — отклоняется");
const huge: any = {}; for (let i = 0; i < 700; i++) huge["f" + i] = i;
ok(!validMsg({ type: "admin_save", kind: "city", id: "main", patch: huge }), "потолок полей админ-патча остаётся (700 — нет)");

(async () => {
  // ——— старая строка (prod после хотфикса: {"windowMin":1}) читается как прежде ———
  const D = d1(); D.raw.exec(`INSERT INTO game_overrides VALUES ('city','main','{"windowMin":1}',1,'hotfix-alkazak-wait-1min',0)`);
  const A = new AdminStore(D); await A.sync(true);
  ok(currentValues("city" as any, "main").windowMin === 1, "старая строка city/main {windowMin:1} применяется");

  // ——— сохранение раздела «Купол»: только изменённое поле, своя строка, старая строка не тронута ———
  const x0 = currentValues("city" as any, "main").x;
  let r: any = await A.saveSection("t", "city" as any, "main", "_h_dome", { rTiles: 38 });
  ok(r.ok && r.sec === "_h_dome" && r.values.rTiles === 38 && r.values.windowMin === 1 && r.values.x === x0, "раздел «Купол»: rTiles 38, остальное как было — " + (r.err || ""));
  let R = rows(D);
  ok(R.length === 2 && R[0].id === "main" && JSON.stringify(R[0].data) === '{"windowMin":1}' && R[1].id === "main@_h_dome" && JSON.stringify(R[1].data) === '{"rTiles":38}', "D1: main {windowMin:1} + main@_h_dome {rTiles:38} — " + JSON.stringify(R));
  ok(ver(D) === 214, "версия набора +1 (горячая перезагрузка у других воркеров)");
  const au: any = D.raw.query("SELECT target_id, before, after FROM game_override_audit ORDER BY aid DESC").get();
  ok(au.target_id === "main@_h_dome" && JSON.parse(au.after).rTiles === 38 && JSON.parse(au.after).windowMin === undefined, "журнал: строка раздела, только поля раздела");

  // ——— раздел «Убийца»: поле из старой строки переносится в строку раздела ———
  r = await A.saveSection("t", "city" as any, "main", "_h_kill", { killerP: 3 });
  R = rows(D);
  ok(r.ok && r.values.killerP === 3 && r.values.windowMin === 1 && r.values.rTiles === 38, "раздел «Убийца»: killerP 3, windowMin 1 сохранился");
  ok(!R.find((x: any) => x.id === "main") && JSON.stringify(R.find((x: any) => x.id === "main@_h_kill")?.data) === '{"windowMin":1,"killerP":3}', "windowMin перенесён из общей строки в main@_h_kill — " + JSON.stringify(R));
  // null — убрать правку поля
  r = await A.saveSection("t", "city" as any, "main", "_h_kill", { killerP: null });
  ok(r.ok && JSON.stringify(rows(D).find((x: any) => x.id === "main@_h_kill")?.data) === '{"windowMin":1}', "null убирает поле из раздела");

  // ——— ошибки — ответ, а не тишина ———
  r = await A.saveSection("t", "city" as any, "main", "_h_kill", { rTiles: 30 }); ok(!r.ok && /не из этого раздела/.test(r.err), "чужое поле в разделе — ошибка: " + r.err);
  r = await A.saveSection("t", "city" as any, "main", "_h_nope", { x: 1 }); ok(!r.ok && /нет такого раздела/.test(r.err), "нет раздела — ошибка");
  r = await A.saveSection("t", "city" as any, "main", "_h_kill", {}); ok(!r.ok, "пустой патч — ошибка");
  r = await A.saveSection("t", "city" as any, "main", "_h_kill", { windowMin: 99999 }); ok(!r.ok || r.values.windowMin <= 1440, "значение вне диапазона — ошибка/обрезка: " + (r.err || r.values?.windowMin));
  r = await A.saveSection("t", "loot" as any, Object.keys((await import("./overrides")).TABLES.loot)[0], "_main", { a: 1 }); ok(!r.ok, "дроп — без разделов");

  // ——— другой воркер (холодный старт) собирает сущность из всех строк ———
  const B = new AdminStore(D); await B.sync(true);
  const cv = currentValues("city" as any, "main");
  ok(cv.windowMin === 1 && cv.rTiles === 38 && cv.killerP !== 3, "холодная загрузка: main@_h_kill + main@_h_dome слиты");
  const mr = mergeRows([{ kind: "city", id: "main", data: '{"windowMin":5,"rTiles":30}' }, { kind: "city", id: "main@_h_kill", data: '{"windowMin":1}' }, { kind: "city", id: "main@bad", data: "{" }]);
  ok(mr.size === 1 && mr.get("city:main").windowMin === 1 && mr.get("city:main").rTiles === 30, "mergeRows: раздел поверх общей строки, битый JSON пропущен");

  // ——— Основное (поля до первого заголовка) — в общей строке ———
  r = await A.saveSection("t", "city" as any, "main", "_main", { name: "Моррисград" });
  ok(r.ok && rows(D).find((x: any) => x.id === "main")?.data?.name === "Моррисград", "раздел «Основное» — общая строка main");

  // ——— прежнее полное сохранение и сброс убирают строки разделов ———
  r = await A.save("t", "city" as any, "main", { windowMin: 2 });
  R = rows(D); ok(r.ok && R.length === 1 && R[0].id === "main" && r.values.rTiles !== 38, "admin_save (целиком) заменяет и разделы — " + JSON.stringify(R));
  await A.saveSection("t", "city" as any, "main", "_h_dome", { rTiles: 37 });
  r = await A.reset("t", "city" as any, "main");
  ok(r.ok && rows(D).length === 0, "сброс удаляет общую строку и все разделы");
  // «_» в id — не подстановочный знак: сброс mob ice_dew_slime не трогает iceXdew_slime@…
  D.raw.exec(`INSERT INTO game_overrides VALUES ('city','mainX@_h_kill','{}',1,'t',0)`);
  await A.reset("t", "city" as any, "main"); ok(D.raw.query("SELECT count(*) n FROM game_overrides").get().n === 1, "сброс не трогает чужие id с тем же префиксом");

  // ——— моб: без заголовков — всё «Основное», только изменённые поля поверх старой строки ———
  const mobId = "ice_dew_slime"; const hp0 = currentValues("mob" as any, mobId)?.hp;
  if (hp0 != null) {
    D.raw.exec(`INSERT INTO game_overrides VALUES ('mob','${mobId}','{"lvl":7}',1,'t',0)`); await A.sync(true);
    r = await A.saveSection("t", "mob" as any, mobId, "_main", { hp: 666 });
    const mr2: any = D.raw.query(`SELECT data FROM game_overrides WHERE kind='mob' AND id='${mobId}'`).get();
    ok(r.ok && JSON.stringify(JSON.parse(mr2.data)) === '{"lvl":7,"hp":666}', "моб: hp добавлен к старой правке, lvl цел — " + mr2.data);
  }
  console.log(`${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
