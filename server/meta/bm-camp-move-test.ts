// B9: перенос лагеря (📍 «Поставить у меня» → сохранить) — старые мобы снимаются и НЕ воскресают, когда игрок приходит на старое место.
// Раньше: снятые получали respawnAt = −1, а неподвижные (fixed) воскрешались по `now >= respawnAt` → два комплекта мобов.
// Запуск: cd server && bun meta/bm-camp-move-test.ts
import { validatePatch, applyOverride } from "./overrides";
import { Zone, type ZPlayer } from "./zone";
import { registerBlackMobs } from "./blackMobs";
import { ITEM_BY_ID } from "./defs";
registerBlackMobs(ITEM_BY_ID as any);
let pass = 0, fail = 0;
const ok = (c: any, m: string) => { if (c) pass++; else fail++; console.log((c ? "PASS " : "FAIL ") + m); };
const z = new Zone("arinar", [], [], { proc: true });
const base = z.camps.find((c) => !z.safeAt(c.x, c.y, 2000))!;
const cx = base.x + 900, cy = base.y + 900, nx = cx + 1500, ny = cy;
const mk = (x: number, y: number) => validatePatch("bmcamp" as any, "bcx_mv", { name: "Перенос", world: "arinar", x, y, r: 120, mobs: [{ mob: "bmx_ash_warden", n: 4 }], respawnMin: 30, respawnMax: 40 });
const cp: any = mk(cx, cy); ok(typeof cp === "object", "лагерь: правка проходит"); applyOverride("bmcamp" as any, "bcx_mv", cp);
const P0 = (x: number, y: number) => new Map<string, ZPlayer>([["p", { sid: "p", x, y: y + 300, hp: 1e9, maxHp: 1e9, armorRed: 0, alive: true, respawnAt: 0, lvl: 10 }]]);
const near = (x: number, y: number) => z.mobs.filter((m: any) => m.bmc === "bcx_mv" && !m.dead && Math.hypot(m.sx - x, m.sy - y) < 400).length;
const all = () => z.mobs.filter((m: any) => m.bmc === "bcx_mv" && !m.dead).length;
let now = 50_000_000; const run = (pl: Map<string, ZPlayer>, n: number) => { for (let i = 0; i < n; i++) { now += 100; z.update(0.1, now, pl, () => {}, () => {}); } };
z.syncBlackCamps(now, true); run(P0(cx, cy), 20);
ok(near(cx, cy) === 4 && all() === 4, `до переноса: 4 на месте (${near(cx, cy)}/${all()})`);
applyOverride("bmcamp" as any, "bcx_mv", mk(nx, ny)); z.syncBlackCamps(now, true); // как admin «save» (service.ts)
run(P0(nx, ny), 40); ok(near(nx, ny) === 4, `после переноса: 4 на новом месте (${near(nx, ny)})`);
run(P0(cx, cy), 400); // игрок вернулся на старое место — чанк проснулся (раньше тут воскресали)
ok(near(cx, cy) === 0, `на старом месте никого (${near(cx, cy)})`);
ok(all() === 4, `всего живых 4, не 8 (${all()})`);
ok(!z.mobs.some((m: any) => m.bmc === "bcx_mv" && m.respawnAt === -1), "снятые удалены из зоны");
z.syncBlackCamps(now + 5000, true); run(P0(nx, ny), 40); ok(all() === 4 && near(nx, ny) === 4, "повторный sync — без дублей");
// ---------- B9b: правка → «Сохранить» обновляет ТОТ ЖЕ id, без дублей (лагерь / часть тела / навык / моб / деталь) ----------
import { Database } from "bun:sqlite";
import { AdminStore } from "./admin";
import { MetaService } from "./service";
import { BM_CAMPS, BM_BODY, BM_MOBS } from "./blackMobs";
import { BM_PARTS } from "./blackArt";
import { SK_DEFS } from "./skillCraft";
function d1() {
  const db = new Database(":memory:");
  db.exec(`CREATE TABLE game_overrides (kind TEXT NOT NULL, id TEXT NOT NULL, data TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 1, updated_by TEXT, updated_at INTEGER, PRIMARY KEY (kind, id));
    CREATE TABLE game_override_audit (aid INTEGER PRIMARY KEY AUTOINCREMENT, kind TEXT, target_id TEXT, before TEXT, after TEXT, version INTEGER, granted_by TEXT, at INTEGER);
    CREATE TABLE game_config_version (k TEXT PRIMARY KEY, v INTEGER NOT NULL DEFAULT 0); INSERT INTO game_config_version VALUES ('overrides', 1);
    CREATE TABLE custom_quests (id TEXT PRIMARY KEY, data TEXT, enabled INTEGER, version INTEGER, updated_by TEXT, updated_at INTEGER);
    CREATE TABLE quest_dialogues (quest_id TEXT PRIMARY KEY, data TEXT, version INTEGER, updated_by TEXT, updated_at INTEGER);`);
  const stmt = (sql: string, args: any[] = []) => ({ bind: (...x: any[]) => stmt(sql, x), first: async () => db.query(sql).get(...args) ?? null,
    all: async () => ({ results: db.query(sql).all(...args) }), run: async () => { db.query(sql).run(...args); return { success: true }; }, _run: () => db.query(sql).run(...args) });
  return { raw: db, prepare: (sql: string) => stmt(sql), batch: async (st: any[]) => { db.transaction(() => st.forEach((s) => s._run()))(); return []; } };
}
await (async () => {
  const D = d1(), A = new AdminStore(D); await A.sync(true);
  const P: any = MetaService.prototype, svc: any = { store: { db: null }, admin: A, zones: { arinar: z }, newIds: new Map(), newIdFor: P.newIdFor, newIdSeen: P.newIdSeen };
  const bmm = (msg: any) => P.bmmOp.call(svc, { pkey: "t" }, { world: "arinar", x: nx + 50, y: ny + 50 }, msg);
  const skc = (msg: any) => P.skcOp.call(svc, { pkey: "t" }, msg);
  const rows = (k: string) => (D.raw.query("SELECT COUNT(*) n FROM game_overrides WHERE kind = ?").get(k) as any).n;
  const nC = Object.keys(BM_CAMPS).length, camp = { name: "Двойной клик", world: "arinar", x: nx, y: ny + 2000, r: 120, mobs: [{ mob: "bmx_ash_warden", n: 2 }], respawnMin: 30, respawnMax: 40 };
  // новый лагерь: «Сохранить» дважды до ответа (один tmp) → один лагерь
  const [a, b] = await Promise.all([bmm({ op: "save", kind: "bmcamp", id: "", tmp: "tmpcamp01", data: camp }), bmm({ op: "save", kind: "bmcamp", id: "", tmp: "tmpcamp01", data: camp })]);
  ok(a.ok && b.ok && a.id === b.id && a.tmp === "tmpcamp01", `новый лагерь, двойное «Сохранить»: один id (${a.id} / ${b.id})`);
  ok(Object.keys(BM_CAMPS).length === nC + 1 && rows("bmcamp") === 1, `лагерей +1, строк в базе 1 (${Object.keys(BM_CAMPS).length - nC} / ${rows("bmcamp")})`);
  // правка: состав, имя, «Поставить у меня» → сохранить — тот же id
  const here = await bmm({ op: "here" });
  const c2 = await bmm({ op: "save", kind: "bmcamp", id: a.id, data: { ...camp, name: "Переименован", x: here.x, y: here.y, mobs: [{ mob: "bmx_ash_warden", n: 3 }] } });
  ok(c2.ok && c2.id === a.id && Object.keys(BM_CAMPS).length === nC + 1 && rows("bmcamp") === 1 && BM_CAMPS[a.id].name === "Переименован" && BM_CAMPS[a.id].x === here.x, "правка + «Поставить у меня» → тот же лагерь, без дубля");
  ok(c2.camps.filter((c: any) => c.name === "Переименован" || c.name === "Двойной клик").length === 1, "в списке админки лагерь один");
  run(P0(here.x, here.y), 40); ok(z.mobs.filter((m: any) => m.bmc === a.id && !m.dead).length === 3, "в зоне — новый состав (3), не 2+3");
  // часть тела: новая (tmp) дважды → одна; правка → та же
  const nB = Object.keys(BM_BODY).length, bd = { slot: "torso", name: "Своя", img: "torso_1", hp: 5, dmg: 0, armor: 0, speed: 0 };
  const [b1, b2] = await Promise.all([bmm({ op: "save", kind: "bmbody", id: "", tmp: "tmpbody01", data: bd }), bmm({ op: "save", kind: "bmbody", id: "", tmp: "tmpbody01", data: bd })]);
  const b3 = await bmm({ op: "save", kind: "bmbody", id: b1.id, data: { ...bd, hp: 9 } });
  ok(b1.ok && b1.id === b2.id && b3.id === b1.id && Object.keys(BM_BODY).length === nB + 1 && rows("bmbody") === 1, "часть тела: двойное «Сохранить» и правка — один id");
  // навык: «Новый»/«Дублировать» (tmp) дважды → один; правка → тот же
  const nS = Object.keys(SK_DEFS).length, pre = Object.keys(SK_DEFS)[0], v = { ...(await skc({ op: "list" })).list.find((x: any) => x.id === pre).v, name: "Копия" };
  const [s1, s2] = await Promise.all([skc({ op: "save", id: "", tmp: "tmpskill01", data: v }), skc({ op: "save", id: "", tmp: "tmpskill01", data: v })]);
  const s3 = await skc({ op: "save", id: s1.id, data: { ...v, name: "Копия 2" } });
  ok(s1.ok && s1.id === s2.id && s3.ok && s3.id === s1.id && Object.keys(SK_DEFS).length === nS + 1 && rows("skdef") === 1, `навык: двойное «Сохранить» и правка — один id (${s1.id}/${s2.id}/${s3.id}) ${s1.err || ""}`);
  // без tmp (старый клиент) — как раньше, новый id на каждый вызов: потому клиент и шлёт tmp
  // моб: новый → публикация → правка → публикация — тот же id; черновик снят
  const nM = Object.keys(BM_MOBS).length, m0 = await bmm({ op: "new", lvl: 10, cls: "warrior" });
  const p1 = await bmm({ op: "publish", id: m0.id, data: m0.data }), p2 = await bmm({ op: "publish", id: m0.id, data: { ...m0.data, name: "Правка" } });
  ok(p1.ok && p1.isNew && p2.ok && !p2.isNew && p2.id === m0.id && Object.keys(BM_MOBS).length === nM + 1 && BM_MOBS[m0.id].name === "Правка" && rows("bmc_mdraft") === 0, `моб: публикация и правка — тот же id ${p1.err || p2.err || ""}`);
  // деталь оружия (конструктор деталей): новая → публикация → правка — тот же id
  const nP = Object.keys(BM_PARTS).length, f0 = await P.bmfOp.call(svc, { pkey: "t" }, { op: "new", ptype: "handle" });
  const f1 = await P.bmfOp.call(svc, { pkey: "t" }, { op: "publish", id: f0.id, data: f0.data }), f2 = await P.bmfOp.call(svc, { pkey: "t" }, { op: "publish", id: f0.id, data: { ...f0.data, name: "Рукоять 2" } });
  ok(f0.ok && f1.ok && f2.ok && Object.keys(BM_PARTS).length === nP + 1 && BM_PARTS[f0.id]?.name === "Рукоять 2", `деталь: публикация и правка — тот же id ${f0.err || f1.err || f2.err || ""}`);
  // «＋ Новый» моб/деталь: двойной клик (один tmp) → один черновик; без tmp — как раньше
  { const d0 = rows("bmc_mdraft"), [n1, n2] = await Promise.all([bmm({ op: "new", lvl: 8, cls: "warrior", tmp: "tmpnewmob01" }), bmm({ op: "new", lvl: 8, cls: "warrior", tmp: "tmpnewmob01" })]);
    ok(n1.ok && n2.ok && n1.id === n2.id && rows("bmc_mdraft") === d0 + 1, `новый моб, двойной клик: один черновик (${n1.id} / ${n2.id}, +${rows("bmc_mdraft") - d0})`);
    const pd0 = rows("bmc_draft"), [q1, q2] = await Promise.all([P.bmfOp.call(svc, { pkey: "t" }, { op: "new", ptype: "handle", tmp: "tmpnewpart01" }), P.bmfOp.call(svc, { pkey: "t" }, { op: "new", ptype: "handle", tmp: "tmpnewpart01" })]);
    ok(q1.ok && q2.ok && q1.id === q2.id && rows("bmc_draft") === pd0 + 1, `новая деталь, двойной клик: один черновик (${q1.id} / ${q2.id}, +${rows("bmc_draft") - pd0})`);
    const q3 = await P.bmfOp.call(svc, { pkey: "t" }, { op: "new", ptype: "handle", tmp: "tmpnewpart02" }); ok(q3.ok && q3.id !== q1.id && rows("bmc_draft") === pd0 + 2, "следующий клик (новый tmp) — новый черновик"); }
})();
console.log(`\n${pass} PASS / ${fail} FAIL`); if (fail) process.exit(1);
