// 📌 «Поставленные лагеря»: удаление лагеря (op «cdel») — лагерь и его живые мобы снимаются сразу и НЕ возвращаются после перезапуска DO.
// Перезапуск — настоящий: второй процесс bun на том же файле базы (новые BM_CAMPS/AdminStore/Zone, таймеры из «library_meta»).
// Запуск: cd server && bun meta/bm-placed-test.ts
import { Database } from "bun:sqlite";
import { Zone } from "./zone";
import { registerBlackMobs, BM_CAMPS, BM_CAMP_BUILTIN } from "./blackMobs";
import { ITEM_BY_ID } from "./defs";
import { AdminStore } from "./admin";
import { MetaService } from "./service";
import { isPlaced, placedOf } from "../../src/pages/MorrisCurse/_core/ui/bmMobsAdmin.js";
registerBlackMobs(ITEM_BY_ID as any);
let pass = 0, fail = 0;
const ok = (c: any, m: string) => { if (c) pass++; else fail++; console.log((c ? "PASS " : "FAIL ") + m); };
const [phase, file] = [process.argv[2] || "1", process.argv[3] || `/tmp/bm-placed-${process.pid}.db`];
function d1(path: string) {
  const db = new Database(path);
  db.exec(`CREATE TABLE IF NOT EXISTS game_overrides (kind TEXT NOT NULL, id TEXT NOT NULL, data TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 1, updated_by TEXT, updated_at INTEGER, PRIMARY KEY (kind, id));
    CREATE TABLE IF NOT EXISTS game_override_audit (aid INTEGER PRIMARY KEY AUTOINCREMENT, kind TEXT, target_id TEXT, before TEXT, after TEXT, version INTEGER, granted_by TEXT, at INTEGER);
    CREATE TABLE IF NOT EXISTS game_config_version (k TEXT PRIMARY KEY, v INTEGER NOT NULL DEFAULT 0); INSERT OR IGNORE INTO game_config_version VALUES ('overrides', 1);
    CREATE TABLE IF NOT EXISTS custom_quests (id TEXT PRIMARY KEY, data TEXT, enabled INTEGER, version INTEGER, updated_by TEXT, updated_at INTEGER);
    CREATE TABLE IF NOT EXISTS quest_dialogues (quest_id TEXT PRIMARY KEY, data TEXT, version INTEGER, updated_by TEXT, updated_at INTEGER);
    CREATE TABLE IF NOT EXISTS library_meta (k TEXT PRIMARY KEY, v TEXT);`);
  const stmt = (sql: string, args: any[] = []) => ({ bind: (...x: any[]) => stmt(sql, x), first: async () => db.query(sql).get(...args) ?? null,
    all: async () => ({ results: db.query(sql).all(...args) }), run: async () => { db.query(sql).run(...args); return { success: true }; }, _run: () => db.query(sql).run(...args) });
  return { raw: db, prepare: (sql: string) => stmt(sql), batch: async (st: any[]) => { db.transaction(() => st.forEach((s) => s._run()))(); return []; } };
}
const D = d1(file), A = new AdminStore(D); await A.sync(true);
const z = new Zone("arinar", [], [], { proc: true });
const live = (id: string) => z.mobs.filter((m: any) => m.bmc === id && !m.dead && m.respawnAt !== -1).length;
const inZone = (id: string) => z.mobs.filter((m: any) => m.bmc === id).length;
const now = Date.now();
if (phase === "1") {
  const P: any = MetaService.prototype, svc: any = { store: { db: null }, admin: A, zones: { arinar: z }, newIds: new Map(), newIdFor: P.newIdFor };
  const base = z.camps.find((c) => !z.safeAt(c.x, c.y, 2500))!;
  const bmm = (msg: any) => P.bmmOp.call(svc, { pkey: "t" }, { world: "arinar", x: base.x, y: base.y }, msg);
  const mk = (i: number) => ({ name: "Поставлен " + i, world: "arinar", x: base.x + 1200 + i * 1400, y: base.y + 1200, r: 120, mobs: [{ mob: "bmx_ash_warden", n: 3 }], respawnMin: 300, respawnMax: 300 });
  const ids: string[] = [];
  for (let i = 0; i < 3; i++) { const r = await bmm({ op: "save", kind: "bmcamp", id: "", tmp: "plc" + i + "xyz", data: mk(i) }); ok(r.ok && BM_CAMPS[r.id], `лагерь ${i + 1} поставлен (${r.id} ${r.err || ""})`); ids.push(r.id); }
  z.syncBlackCamps(now, true);
  ok(ids.every((id) => live(id) === 3), `у каждого по 3 живых (${ids.map(live)})`);
  const L = (await bmm({ op: "camps" })).camps, mine = L.filter((c: any) => ids.includes(c.id));
  ok(mine.every((c: any) => c.bio?.name && c.live?.alive === 3), `список: местность и «живы 3» (${mine.map((c: any) => c.bio?.name + ":" + c.live?.alive)})`);
  ok(placedOf({}, L, () => []).filter((c: any) => ids.includes(c.id)).length === 3 && !placedOf({}, [{ id: "t", x: 0, y: 0 }], () => []).length && isPlaced({ x: 5, y: 0 }), "фильтр вкладки: шаблоны 0,0 не попадают, поставленные — да");
  ok(placedOf({ pbi: mine[0].bio.name }, L, () => []).every((c: any) => c.bio?.name === mine[0].bio.name), "фильтр по местности");
  // у удаляемого и у оставшегося — по одному убитому (таймер возрождения)
  for (const id of [ids[1], ids[2]]) { const m: any = z.mobs.find((x: any) => x.bmc === id && !x.dead); m.dead = true; m.hp = 0; m.respawnAt = now + 300_000; }
  ok(Object.keys(z.bmTimers(now)).some((k) => k.startsWith(ids[1] + ":")), "до удаления у лагеря 2 есть таймер");
  const nope = await bmm({ op: "cdel", id: ids[1] }); ok(!nope.ok && BM_CAMPS[ids[1]] && live(ids[1]) === 2, "без подтверждения не удаляется");
  const del = await bmm({ op: "cdel", id: ids[1], data: { confirm: ids[1] } });
  ok(del.ok && !BM_CAMPS[ids[1]] && !del.camps.some((c: any) => c.id === ids[1]), `удалён: нет в таблице и в ответе (${del.how})`);
  ok(live(ids[1]) === 0, `его живые мобы сняты сразу (${live(ids[1])})`);
  ok(!Object.keys(z.bmTimers(now)).some((k) => k.startsWith(ids[1] + ":")), "таймеров удалённого нет");
  ok(live(ids[0]) === 3 && live(ids[2]) === 2, `остальные не тронуты (${live(ids[0])}/${live(ids[2])})`);
  for (let i = 0; i < 50; i++) z.update(0.1, now + 1000 + i * 100, new Map(), () => {}, () => {});
  ok(inZone(ids[1]) === 0, "из зоны убраны совсем (не воскреснут)");
  ok((D.raw.query("SELECT COUNT(*) n FROM game_overrides WHERE kind='bmcamp' AND id=?").get(ids[1]) as any).n === 0, "строки в базе нет");
  // встроенный — выключается навсегда; логово-шаблон 30.10 — назад в шаблоны
  const bi = [...BM_CAMP_BUILTIN][0];
  if (bi) { const r = await bmm({ op: "cdel", id: bi, data: { confirm: bi } }); ok(r.ok && BM_CAMPS[bi]?.hidden && live(bi) === 0, `встроенный ${bi}: выключен (${r.how})`); }
  const t = await bmm({ op: "save", kind: "bmcamp", id: "", tmp: "plctplxyz", data: { ...mk(5), name: "Логово-тест" } });
  // имитация шаблона 30.10 с поставленным логовом: id bcx_c30_*
  const c30 = "bcx_c30_test"; await A.save("t", "bmcamp" as any, c30, { name: "Шаблон", world: "arinar", x: mk(6).x, y: mk(6).y, r: 120, lair: true, "mobs": [{ mob: "bmx_ash_warden", n: 2 }], respawnMin: 60, respawnMax: 90 } as any);
  z.syncBlackCamps(now, true); ok(live(c30) === 2, "шаблон поставлен: 2 живых");
  const r30 = await bmm({ op: "cdel", id: c30, data: { confirm: c30 } });
  ok(r30.ok && BM_CAMPS[c30]?.hidden && BM_CAMPS[c30].x === 0 && BM_CAMPS[c30].y === 0 && live(c30) === 0, `логово-шаблон: снято, назад в шаблоны (${r30.how})`);
  await bmm({ op: "cdel", id: t.id, data: { confirm: t.id } });
  D.raw.query("INSERT OR REPLACE INTO library_meta VALUES ('bm_timers', ?)").run(JSON.stringify(z.bmTimers(now)));
  await Bun.write(file + ".ids", JSON.stringify({ ids, bi }));
  console.log(`фаза 1: ${pass} PASS / ${fail} FAIL`);
  const p2 = Bun.spawnSync(["bun", import.meta.path, "2", file], { stdout: "inherit", stderr: "inherit" });
  try { require("fs").unlinkSync(file); require("fs").unlinkSync(file + ".ids"); } catch {}
  process.exit(fail || p2.exitCode ? 1 : 0);
} else {
  // ---- после перезапуска: всё с нуля из базы ----
  const { ids, bi } = JSON.parse(await Bun.file(file + ".ids").text());
  z.bmPending = JSON.parse((D.raw.query("SELECT v FROM library_meta WHERE k='bm_timers'").get() as any)?.v || "{}");
  z.syncBlackCamps(now, true);
  ok(BM_CAMPS[ids[0]] && BM_CAMPS[ids[2]] && !BM_CAMPS[ids[1]], "перезапуск: 2 лагеря на месте, удалённого нет");
  ok(inZone(ids[1]) === 0, `перезапуск: мобов удалённого нет (${inZone(ids[1])})`);
  ok(live(ids[0]) === 3 && live(ids[2]) === 2, `перезапуск: составы и таймер убитого сохранены (${live(ids[0])}/${live(ids[2])})`);
  if (bi) ok(BM_CAMPS[bi]?.hidden && inZone(bi) === 0, "перезапуск: встроенный остался выключенным");
  ok(BM_CAMPS.bcx_c30_test?.hidden && BM_CAMPS.bcx_c30_test.x === 0 && inZone("bcx_c30_test") === 0, "перезапуск: логово осталось шаблоном");
  console.log(`фаза 2 (после перезапуска): ${pass} PASS / ${fail} FAIL`);
  process.exit(fail ? 1 : 0);
}
