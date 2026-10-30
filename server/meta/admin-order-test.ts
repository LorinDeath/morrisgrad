// 🛠 порядок загрузки правок: своя деталь → свой моб → свой лагерь. D1 отдаёт строки по ключу (kind, id), т. е.
// «bmcamp» < «bmmob» < «bpart» — без сортировки по зависимостям моб с «bpx_…» и лагерь со своим мобом пропускались.
import { AdminStore } from "./admin";
import { BM_PARTS } from "./blackArt";
import { BM_MOBS, BM_CAMPS } from "./blackMobs";
import { SK_DEFS } from "./skillCraft";
let pass = 0, fail = 0; const ok = (c: any, m: string) => { if (c) { pass++; console.log("PASS " + m); } else { fail++; console.log("FAIL " + m); } };
const rows = [
  { kind: "bmcamp", id: "bcx_ord_t", data: JSON.stringify({ name: "Проба", world: "arinar", x: 0, y: 0, hidden: true, chief: "bmx_ord_t", mobs: [{ mob: "bmx_ord_t", n: 2 }] }) },
  { kind: "bmmob", id: "bmx_ord_t", data: JSON.stringify({ name: "Проба", cls: "warrior", lvl: 8, "body.torso": "fb_torso_1", "body.head": "fb_head_1", "body.legL": "fb_legL_1", "body.legR": "fb_legR_1", "body.armL": "fb_armL_1", "body.armR": "fb_armR_1", "weapon.handle": "fire_handle", "weapon.blade": "bpx_ord_t" }) },
  { kind: "bpart", id: "bpx_ord_t", data: JSON.stringify({ type: "blade", elem: "fire", name: "Проба", skill: "skx_ord_t" }) },
  { kind: "skdef", id: "skx_ord_t", data: JSON.stringify({ name: "Проба", form: "cone", elem: "fire", cd: 12 }) },
].sort((a, b) => (a.kind + a.id < b.kind + b.id ? -1 : 1)); // как SQLite по первичному ключу
const st = (sql: string) => ({ bind: () => st(sql), first: async () => (sql.includes("game_config_version") ? { v: 7 } : null),
  all: async () => ({ results: sql.includes("FROM game_overrides") ? rows : [] }) });
const store = new AdminStore({ prepare: (sql: string) => st(sql) });
const warn = console.warn, warns: string[] = []; console.warn = (...a: any[]) => { warns.push(a.join(" ")); };
await store.sync(true); console.warn = warn;
ok(SK_DEFS.skx_ord_t, "навык skx загружен");
ok(BM_PARTS.bpx_ord_t?.skill === "skx_ord_t", "деталь bpx с навыком загружена");
ok(BM_MOBS.bmx_ord_t?.weapon?.blade === "bpx_ord_t", "моб bmx со своей деталью загружен");
ok(BM_CAMPS.bcx_ord_t?.mobs?.[0]?.mob === "bmx_ord_t" && BM_CAMPS.bcx_ord_t?.chief === "bmx_ord_t", "лагерь bcx со своим мобом загружен");
ok(!warns.some((w) => /ord_t/.test(w)), "нет пропусков: " + warns.filter((w) => /ord_t/.test(w)).join(" | "));
console.log(`${pass} PASS / ${fail} FAIL`); if (fail) process.exit(1);
