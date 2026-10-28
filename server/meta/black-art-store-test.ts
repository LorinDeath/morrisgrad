// Риск «срезания инвентаря»: вещь, созданная игроком (артефакт art_<hex>), есть в D1 items, но не в коде.
// store.loadD1 обязан дочитать её ДО фильтра a.inv, а выгрузка — писать строку items до item_instances (FK).
// Запуск: cd server && bun meta/black-art-store-test.ts
import { ProfileStore } from "./store";
import { libraryHash } from "./library";
import { ITEM_BY_ID } from "./defs";
import { makeArtifact, artifactRow, isArtifactId } from "./blackArtReg";

let pass = 0, fail = 0;
const ok = (c: any, m: string) => { if (c) pass++; else fail++; console.log((c ? "PASS " : "FAIL ") + m); };
ProfileStore.LIB_TIMEOUT_MS = 150;

const art = makeArtifact({ handle: "fire_handle", blade: "fire_blade", blade2: "fire_blade2", blade3: "fire_blade3", crystal: "fire_crystal" })!;
ok(art && isArtifactId(art.id) && art.bm.skills.length === 5, "тестовый артефакт: 5 частей, 5 навыков");
const row: any = Object.fromEntries(["id", "name", "slot", "rarity", "item_level", "req_level", "wtype", "stats", "props", "icon", "description"].map((k, i) => [k, artifactRow(art)[i]]));
delete (ITEM_BY_ID as any)[art.id]; // «новый процесс»: в коде артефакта нет
ok(!ITEM_BY_ID[art.id], "до загрузки — артефакта нет в ITEM_BY_ID");

function fakeDb(opts: { itemsRows: any[]; failItems?: boolean }) {
  const log: string[] = [], writes: { sql: string; args: any[] }[] = [];
  const stmt = (sql: string, args: any[] = []) => ({
    sql, args,
    bind: (...a: any[]) => stmt(sql, a),
    first: async () => ({ value: libraryHash() }),
    all: async () => { log.push(sql); if (opts.failItems) throw new Error("D1 down"); return { results: sql.includes("FROM items WHERE id IN") ? opts.itemsRows.filter((r) => args.includes(r.id)) : [] }; },
    run: async () => ({}),
  });
  const db = {
    prepare: (sql: string) => stmt(sql),
    batch: async (q: any[]) => {
      if (q[0]?.sql?.startsWith("SELECT data")) return q.map((x: any, i: number) => ({ results:
        i === 0 ? [{ data: JSON.stringify({}), verified: 1 }]
        : i === 2 ? [{ instance_id: "u-art", item_id: art.id, acquired_at: 1, source: "grant:test", viewed_at: 1, hero: null, run_skill: null, cursed: 0, ench: 0, locked: 0, upg: 0, blk: 0 },
                     { instance_id: "u-gone", item_id: "no_such_item_x", acquired_at: 1, source: "x", viewed_at: 1, hero: null, run_skill: null, cursed: 0, ench: 0, locked: 0, upg: 0, blk: 0 }]
        : [] }));
      for (const x of q) writes.push({ sql: x.sql, args: x.args });
      return q.map(() => ({ results: [] }));
    },
  };
  return { db, log, writes };
}

(async () => {
  {
    const { db, log } = fakeDb({ itemsRows: [row] });
    const s = new ProfileStore(null, db);
    await s.load("uid:t1");
    const a = s.accounts.get("uid:t1")!;
    ok(log.some((q) => q.includes("FROM items WHERE id IN")), "загрузка дочитывает строки артефактов из items");
    ok(a && a.inv.some((i: any) => i.uid === "u-art" && i.id === art.id), "артефакт остался в сумке после загрузки");
    ok(ITEM_BY_ID[art.id]?.wtype === "artifact" && (ITEM_BY_ID[art.id] as any).bm?.stats?.bdmg > 0, "артефакт зарегистрирован: wtype artifact, снимок чёрных статов");
    ok(!a.inv.some((i: any) => i.id === "no_such_item_x"), "неизвестная не-артефактная вещь по-прежнему отфильтрована");
  }
  {
    delete (ITEM_BY_ID as any)[art.id];
    const { db } = fakeDb({ itemsRows: [row], failItems: true });
    const s = new ProfileStore(null, db);
    let threw = false; try { await (s as any).loadD1("uid:t2"); } catch { threw = true; }
    ok(threw && !s.accounts.has("uid:t2"), "ошибка чтения items — профиль НЕ грузится урезанным (лучше повтор, чем потеря вещей)");
  }
  {
    // выгрузка: новый экземпляр артефакта → INSERT OR IGNORE INTO items раньше INSERT item_instances
    delete (ITEM_BY_ID as any)[art.id];
    const { db, writes } = fakeDb({ itemsRows: [row] });
    const s = new ProfileStore(null, db);
    await s.load("uid:t3");
    const a = s.accounts.get("uid:t3")!;
    const art2 = makeArtifact({ handle: "fire_handle", blade: "fire_blade_r" })!;
    a.inv.push({ uid: "u-new", id: art2.id, at: 5, src: "grant:bm_test", n: 1, hero: null } as any);
    await (s as any).flushNow("uid:t3");
    const iItems = writes.findIndex((w) => w.sql.startsWith("INSERT OR IGNORE INTO items") && w.args[0] === art2.id);
    const iInst = writes.findIndex((w) => w.sql.startsWith("INSERT OR IGNORE INTO item_instances") && w.args[0] === "u-new");
    ok(iItems >= 0 && iInst > iItems, `выгрузка: строка items артефакта перед экземпляром (${iItems} < ${iInst})`);
    ok(JSON.parse(writes[iItems].args[8]).bm.atk.kind === "proj", "в items записан снимок (дальнее лезвие → снаряд)");
    ok(!writes.some((w) => w.sql.includes("state = 'salvaged'") && w.args[1] === "u-art"), "старый артефакт не помечен удалённым");
  }
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
