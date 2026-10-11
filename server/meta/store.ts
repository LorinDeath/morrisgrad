// Гибридное хранилище профилей «Проклятых».
//   Источник истины — D1 (binding GAME_DB → morrisgrad_db, схема server/migrations/0001_init.sql).
//   Durable Object держит «горячее» состояние онлайн-игроков (кэш Account/Hero в памяти) и пишет в D1
//   сквозной записью (write-through): после каждого изменения — ОДИН атомарный db.batch() с разницей
//   относительно последнего успешно записанного снимка. Записи одного игрока сериализуются цепочкой промисов.
//   • предметы — строки item_instances (instance_id = crypto.randomUUID() сервера, INSERT OR IGNORE → повтор безопасен);
//   • материалы — абсолютные значения (повтор идемпотентен); надетое — hero_equipment (UNIQUE instance_id: нет дюпа);
//   • открытия (предметы/мобы/свойства) + флаг «новое» (viewed_at IS NULL); журнал выдач — grant_audit (уникальный tx).
//   Старые профили из SQLite DO (mc_accounts/mc_heroes) переносятся в D1 при первом входе (uid → UUID).
//   Без GAME_DB (локальные тесты без D1) — прежнее хранилище SQLite DO.
import { HERO_IDS, ITEM_BY_ID, RESOURCES } from "./defs";
import { newAccount, newHero, newUid, noteItem, fixAccount, sanitizeTalents, type Account, type Hero, type InvItem } from "./profile";
import { TALENT_VERSION } from "./shared";
import { libraryHash, seedTables, SEED_COLS, SEED_PK } from "./library";

type Shadow = {
  acc: string; heroes: Record<string, string>; inv: Map<string, string>; invSeen: Map<string, number>; res: Map<string, number>;
  equip: Map<string, string>; mobs: Map<string, string>; idisc: Map<string, string>; fdisc: Map<string, number>;
};


const accData = (a: Account) => {
  const { inv, res, bestiary, disc, ...rest } = a as any;
  return JSON.stringify(rest);
};
const heroData = (h: Hero) => JSON.stringify({ lvl: h.lvl, xp: h.xp, talents: h.talents, abil: h.abil, loadout: h.loadout, tv: h.tv || 1 });

function snapshotOf(a: Account, heroes: Record<string, Hero>): Shadow {
  const s: Shadow = { acc: accData(a), heroes: {}, inv: new Map(), invSeen: new Map(), res: new Map(), equip: new Map(), mobs: new Map(), idisc: new Map(), fdisc: new Map() };
  for (const [cls, h] of Object.entries(heroes)) {
    s.heroes[cls] = heroData(h);
    for (const [slot, uid] of Object.entries(h.equip || {})) s.equip.set(`${cls}|${slot}`, uid);
  }
  for (const it of a.inv) { s.inv.set(it.uid, it.id); s.invSeen.set(it.uid, it.n ? 0 : 1); }
  for (const [r, q] of Object.entries(a.res)) s.res.set(r, q);
  for (const [m, b] of Object.entries(a.bestiary)) s.mobs.set(m, `${b.kills}|${b.v ? 1 : 0}|${b.at || 0}`);
  for (const [id, d] of Object.entries(a.disc?.items || {})) s.idisc.set(id, `${d.st}|${d.v ? 1 : 0}`);
  for (const [f, d] of Object.entries(a.disc?.feats || {})) s.fdisc.set(f, d.v ? 1 : 0);
  return s;
}
const emptyShadow = (): Shadow => ({ acc: "", heroes: {}, inv: new Map(), invSeen: new Map(), res: new Map(), equip: new Map(), mobs: new Map(), idisc: new Map(), fdisc: new Map() });

export class ProfileStore {
  sql: any;
  db: any;
  accounts = new Map<string, Account>();
  heroes = new Map<string, Hero>(); // `${pkey}|${hero}`
  verified = new Map<string, boolean>();
  shadow = new Map<string, Shadow>();
  chain = new Map<string, Promise<void>>();
  pending = new Set<string>();
  loading = new Map<string, Promise<void>>();
  libReady: Promise<void> | null = null;
  stats = { flushes: 0, errors: 0, lastError: "" };

  constructor(sql: any, db?: any) {
    this.sql = sql;
    this.db = db || null;
    this.migrateLegacy();
  }

  get mode() { return this.db ? "d1" : "do-sqlite"; }

  // ---- SQLite DO: прежняя схема (фолбэк и источник переноса) ----
  migrateLegacy() {
    if (!this.sql) return;
    this.sql.exec("CREATE TABLE IF NOT EXISTS mc_schema (version INTEGER NOT NULL)");
    const row = [...this.sql.exec("SELECT version FROM mc_schema LIMIT 1")][0] as any;
    const cur = row ? Number(row.version) : 0;
    if (cur < 1) {
      this.sql.exec("CREATE TABLE IF NOT EXISTS mc_accounts (pkey TEXT PRIMARY KEY, data TEXT NOT NULL, verified INTEGER NOT NULL DEFAULT 0, updated_at INTEGER NOT NULL)");
      this.sql.exec("CREATE TABLE IF NOT EXISTS mc_heroes (pkey TEXT NOT NULL, hero TEXT NOT NULL, data TEXT NOT NULL, updated_at INTEGER NOT NULL, PRIMARY KEY (pkey, hero))");
      if (row) this.sql.exec("UPDATE mc_schema SET version = 1"); else this.sql.exec("INSERT INTO mc_schema (version) VALUES (1)");
    }
  }
  legacyAccount(pkey: string): any | null {
    if (!this.sql) return null;
    const row = [...this.sql.exec("SELECT data FROM mc_accounts WHERE pkey = ?", pkey)][0] as any;
    return row ? JSON.parse(row.data) : null;
  }
  legacyHero(pkey: string, cls: string): any | null {
    if (!this.sql) return null;
    const row = [...this.sql.exec("SELECT data FROM mc_heroes WHERE pkey = ? AND hero = ?", pkey, cls)][0] as any;
    return row ? JSON.parse(row.data) : null;
  }

  // ---- библиотека: сверка версии пула при старте, досев при расхождении ----
  ensureLibrary(): Promise<void> {
    if (!this.db) return Promise.resolve();
    if (this.libReady) return this.libReady;
    this.libReady = (async () => {
      const want = libraryHash();
      const row = await this.db.prepare("SELECT value FROM library_meta WHERE key = 'items_hash'").first();
      if (row?.value === want) return;
      const stmts: any[] = [];
      for (const [table, rows] of seedTables()) {
        const cols = (SEED_COLS as any)[table] as string[];
        const pk = SEED_PK[table].split(",").map((x) => x.trim());
        const upd = cols.filter((c) => !pk.includes(c)).map((c) => `${c} = excluded.${c}`).join(", ");
        const sql = `INSERT INTO ${table} (${cols.join(", ")}) VALUES (${cols.map(() => "?").join(", ")}) ON CONFLICT(${pk.join(", ")}) DO UPDATE SET ${upd}`;
        const p = this.db.prepare(sql);
        for (const r of rows) stmts.push(p.bind(...cols.map((c) => r[c] ?? null)));
      }
      stmts.push(this.db.prepare("INSERT INTO library_meta (key, value) VALUES ('items_hash', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").bind(want));
      for (let i = 0; i < stmts.length; i += 200) await this.db.batch(stmts.slice(i, i + 200));
      console.log(`[mc] item library reseeded (${want})`);
    })().catch((e) => { console.error("[mc] library check failed", e?.message || e); this.libReady = null; });
    return this.libReady;
  }

  // ---- загрузка профиля (ждём перед входом) ----
  load(pkey: string): Promise<void> {
    if (this.accounts.has(pkey)) return Promise.resolve();
    let p = this.loading.get(pkey);
    if (p) return p;
    p = (this.db ? this.loadD1(pkey) : Promise.resolve(this.loadLegacy(pkey))).finally(() => this.loading.delete(pkey));
    this.loading.set(pkey, p);
    return p;
  }

  loadLegacy(pkey: string) {
    const raw = this.legacyAccount(pkey);
    const a = fixAccount(raw ? { ...newAccount(), ...raw } : newAccount());
    this.accounts.set(pkey, a);
    for (const cls of HERO_IDS) {
      const r = this.legacyHero(pkey, cls);
      const h: Hero = r ? { ...newHero(cls), tv: 1, ...r } : newHero(cls);
      const n = sanitizeTalents(h, cls, h.tv || 1); h.tv = TALENT_VERSION; if (n > 0) h.refunded = n;
      this.heroes.set(`${pkey}|${cls}`, h);
    }
  }

  async loadD1(pkey: string) {
    await this.ensureLibrary();
    const db = this.db;
    const q = (sql: string) => db.prepare(sql).bind(pkey);
    const res = await db.batch([
      q("SELECT data, verified FROM accounts WHERE pkey = ?"),
      q("SELECT hero, lvl, xp, talents, abil, loadout, talent_ver FROM heroes WHERE pkey = ?"),
      q("SELECT instance_id, item_id, acquired_at, source, viewed_at FROM item_instances WHERE owner = ? AND state = 'inv' ORDER BY acquired_at"),
      q("SELECT hero, slot, instance_id FROM hero_equipment WHERE pkey = ?"),
      q("SELECT res, qty FROM resources WHERE pkey = ?"),
      q("SELECT item_id, state, first_at, first_source, viewed_at FROM player_item_discovery WHERE pkey = ?"),
      q("SELECT mob_id, seen_at, kills, viewed_at FROM player_mob_discovery WHERE pkey = ?"),
      q("SELECT feature, first_at, viewed_at FROM player_feature_discovery WHERE pkey = ?"),
    ]);
    const [accR, heroR, instR, eqR, resR, idR, mdR, fdR] = res.map((r: any) => r.results || []);
    if (!accR.length) {
      // первый вход в D1: перенос из SQLite DO (если был), иначе новый профиль; запишется первой же выгрузкой
      const raw = this.legacyAccount(pkey);
      const a = fixAccount(raw ? { ...newAccount(), ...raw } : newAccount());
      const remap: Record<string, string> = {};
      for (const it of a.inv) { const u = newUid(); remap[it.uid] = u; it.uid = u; it.src = it.src || "migrate"; it.at = it.at || Date.now(); }
      for (const it of a.inv) noteItem(a, it.id, it.src || "migrate", true);
      this.accounts.set(pkey, a);
      for (const cls of HERO_IDS) {
        const r = this.legacyHero(pkey, cls);
        const h: Hero = r ? { ...newHero(cls), tv: 1, ...r } : newHero(cls);
        { const n = sanitizeTalents(h, cls, h.tv || 1); h.tv = TALENT_VERSION; if (n > 0) h.refunded = n; }
        h.equip = Object.fromEntries(Object.entries(h.equip || {}).filter(([, u]) => remap[u]).map(([s, u]) => [s, remap[u]]));
        this.heroes.set(`${pkey}|${cls}`, h);
      }
      this.shadow.set(pkey, emptyShadow());
      if (raw) console.log(`[mc] migrated legacy profile ${pkey.slice(0, 12)}… items=${a.inv.length}`);
      return;
    }
    const a: Account = fixAccount({ ...newAccount(), ...JSON.parse(accR[0].data) });
    a.inv = instR.filter((r: any) => ITEM_BY_ID[r.item_id]).map((r: any) => ({ uid: r.instance_id, id: r.item_id, at: r.acquired_at, src: r.source, n: r.viewed_at == null ? 1 : 0 }));
    a.res = Object.fromEntries(resR.map((r: any) => [r.res, r.qty]));
    a.bestiary = Object.fromEntries(mdR.map((r: any) => [r.mob_id, { seen: 1, kills: r.kills, at: r.seen_at, v: r.viewed_at == null ? 0 : 1 }]));
    a.disc = {
      items: Object.fromEntries(idR.map((r: any) => [r.item_id, { st: r.state, at: r.first_at, src: r.first_source || "", v: r.viewed_at == null ? 0 : 1 }])),
      feats: Object.fromEntries(fdR.map((r: any) => [r.feature, { at: r.first_at, v: r.viewed_at == null ? 0 : 1 }])),
    };
    this.accounts.set(pkey, a);
    const owned = new Set(a.inv.map((i) => i.uid));
    for (const cls of HERO_IDS) {
      const r = heroR.find((x: any) => x.hero === cls);
      const h: Hero = r ? { ...newHero(cls), lvl: r.lvl, xp: r.xp, talents: JSON.parse(r.talents), abil: JSON.parse(r.abil), loadout: JSON.parse(r.loadout), equip: {}, tv: r.talent_ver ?? 1 } : newHero(cls);
      for (const e of eqR) if (e.hero === cls && owned.has(e.instance_id)) h.equip[e.slot] = e.instance_id;
      this.heroes.set(`${pkey}|${cls}`, h);
    }
    // снимок ДО проверки дерева: исправленное (возврат очков / talent_ver = 2) уйдёт в D1 первой же выгрузкой
    this.shadow.set(pkey, snapshotOf(a, this.heroMap(pkey)));
    let refundedAny = false;
    for (const cls of HERO_IDS) {
      const h = this.heroes.get(`${pkey}|${cls}`)!;
      const before = { talents: h.talents, loadout: h.loadout, tv: h.tv };
      const n = sanitizeTalents(h, cls, h.tv || 1);
      h.tv = TALENT_VERSION;
      if (n > 0) { h.refunded = n; refundedAny = true; this.audit(pkey, "talent_refund", `talent_refund:${cls}:${before.tv}:${Date.now()}`, { hero: cls, points: n, from: before.tv, talents: before.talents, loadout: before.loadout }); }
    }
    const sh = this.shadow.get(pkey)!;
    if (refundedAny || HERO_IDS.some((c) => sh.heroes[c] !== undefined && sh.heroes[c] !== heroData(this.heroes.get(`${pkey}|${c}`)!))) this.flush(pkey).catch(() => {});
  }

  heroMap(pkey: string): Record<string, Hero> {
    const out: Record<string, Hero> = {};
    for (const cls of HERO_IDS) { const h = this.heroes.get(`${pkey}|${cls}`); if (h) out[cls] = h; }
    return out;
  }

  account(pkey: string): Account {
    let a = this.accounts.get(pkey);
    if (a) return a;
    if (!this.db) { this.loadLegacy(pkey); return this.accounts.get(pkey)!; }
    // не должно случаться (вход ждёт load); безопасный пустой профиль без записи поверх D1
    a = newAccount();
    console.warn("[mc] account() before load", pkey.slice(0, 10));
    return a;
  }
  hero(pkey: string, cls: string): Hero {
    const k = `${pkey}|${cls}`;
    let h = this.heroes.get(k);
    if (h) return h;
    h = newHero(cls);
    if (this.accounts.has(pkey)) this.heroes.set(k, h);
    return h;
  }

  // ---- запись ----
  saveAccount(pkey: string, verified: boolean) {
    this.verified.set(pkey, verified);
    if (!this.db) {
      const a = this.accounts.get(pkey);
      if (!a || !this.sql) return;
      this.sql.exec("INSERT INTO mc_accounts (pkey, data, verified, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(pkey) DO UPDATE SET data = excluded.data, verified = excluded.verified, updated_at = excluded.updated_at",
        pkey, JSON.stringify(a), verified ? 1 : 0, Date.now());
      return;
    }
    this.flush(pkey);
  }
  saveHero(pkey: string, cls: string) {
    if (this.db) return; // герои уходят той же выгрузкой flush()
    const h = this.heroes.get(`${pkey}|${cls}`);
    if (!h || !this.sql) return;
    this.sql.exec("INSERT INTO mc_heroes (pkey, hero, data, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(pkey, hero) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at",
      pkey, cls, JSON.stringify(h), Date.now());
  }

  // Поставить выгрузку в очередь игрока (повторные запросы, пока ждём, склеиваются в одну)
  flush(pkey: string): Promise<void> {
    if (!this.db || !this.accounts.has(pkey)) return Promise.resolve();
    if (this.pending.has(pkey)) return this.chain.get(pkey) || Promise.resolve();
    this.pending.add(pkey);
    const prev = this.chain.get(pkey) || Promise.resolve();
    const next = prev.then(() => { this.pending.delete(pkey); return this.flushNow(pkey); }).catch((e) => {
      this.stats.errors++; this.stats.lastError = String(e?.message || e);
      console.error("[mc] D1 flush failed", pkey.slice(0, 12), this.stats.lastError);
    });
    this.chain.set(pkey, next);
    return next;
  }

  async flushNow(pkey: string) {
    const a = this.accounts.get(pkey);
    if (!a) return;
    const db = this.db;
    const now = Date.now();
    const old = this.shadow.get(pkey) || emptyShadow();
    const cur = snapshotOf(a, this.heroMap(pkey));
    const st: any[] = [];
    const P = (sql: string, ...args: any[]) => st.push(db.prepare(sql).bind(...args));
    if (cur.acc !== old.acc) P("INSERT INTO accounts (pkey, verified, data, created_at, updated_at, rev) VALUES (?, ?, ?, ?, ?, 1) ON CONFLICT(pkey) DO UPDATE SET verified = excluded.verified, data = excluded.data, updated_at = excluded.updated_at, rev = accounts.rev + 1",
      pkey, this.verified.get(pkey) ? 1 : 0, cur.acc, now, now);
    for (const [cls, j] of Object.entries(cur.heroes)) {
      if (old.heroes[cls] === j) continue;
      const h = JSON.parse(j);
      P("INSERT INTO heroes (pkey, hero, lvl, xp, talents, abil, loadout, talent_ver, updated_at, rev) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1) ON CONFLICT(pkey, hero) DO UPDATE SET lvl = excluded.lvl, xp = excluded.xp, talents = excluded.talents, abil = excluded.abil, loadout = excluded.loadout, talent_ver = excluded.talent_ver, updated_at = excluded.updated_at, rev = heroes.rev + 1",
        pkey, cls, h.lvl, h.xp, JSON.stringify(h.talents), JSON.stringify(h.abil), JSON.stringify(h.loadout), h.tv || 1, now);
    }
    // снятое/перемещённое — сначала удалить (UNIQUE instance_id не даст надеть один экземпляр дважды)
    for (const [k, uid] of old.equip) if (cur.equip.get(k) !== uid) { const [cls, slot] = k.split("|"); P("DELETE FROM hero_equipment WHERE pkey = ? AND hero = ? AND slot = ?", pkey, cls, slot); }
    // новые экземпляры: идемпотентно по instance_id + запись аудита
    const byUid = new Map(a.inv.map((i) => [i.uid, i] as [string, InvItem]));
    for (const [uid, id] of cur.inv) {
      if (old.inv.has(uid)) continue;
      const it = byUid.get(uid)!;
      const tx = `grant:${uid}`;
      P("INSERT OR IGNORE INTO item_instances (instance_id, owner, item_id, acquired_at, source, state, tx_id, viewed_at, updated_at) VALUES (?, ?, ?, ?, ?, 'inv', ?, ?, ?)",
        uid, pkey, id, it.at || now, it.src || "?", tx, it.n ? null : now, now);
      P("INSERT OR IGNORE INTO grant_audit (ts, pkey, kind, item_id, instance_id, qty, source, tx_id, detail) VALUES (?, ?, 'grant', ?, ?, 1, ?, ?, NULL)", it.at || now, pkey, id, uid, it.src || "?", tx);
    }
    for (const [uid, id] of old.inv) if (!cur.inv.has(uid)) {
      P("UPDATE item_instances SET state = 'salvaged', updated_at = ? WHERE instance_id = ? AND owner = ?", now, uid, pkey);
      P("INSERT OR IGNORE INTO grant_audit (ts, pkey, kind, item_id, instance_id, qty, source, tx_id, detail) VALUES (?, ?, 'remove', ?, ?, 1, 'server', ?, NULL)", now, pkey, id, uid, `remove:${uid}`);
    }
    for (const [uid, seen] of cur.invSeen) if (old.inv.has(uid) && old.invSeen.get(uid) !== seen && seen) P("UPDATE item_instances SET viewed_at = ? WHERE instance_id = ? AND owner = ? AND viewed_at IS NULL", now, uid, pkey);
    for (const [k, uid] of cur.equip) if (old.equip.get(k) !== uid) {
      const [cls, slot] = k.split("|");
      P("INSERT INTO hero_equipment (pkey, hero, slot, instance_id, updated_at) SELECT ?, ?, ?, instance_id, ? FROM item_instances WHERE instance_id = ? AND owner = ? AND state = 'inv' ON CONFLICT(pkey, hero, slot) DO UPDATE SET instance_id = excluded.instance_id, updated_at = excluded.updated_at",
        pkey, cls, slot, now, uid, pkey);
    }
    for (const [r, q] of cur.res) if (old.res.get(r) !== q && RESOURCES[r]) P("INSERT INTO resources (pkey, res, qty, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(pkey, res) DO UPDATE SET qty = excluded.qty, updated_at = excluded.updated_at", pkey, r, q, now);
    for (const [r] of old.res) if (!cur.res.has(r)) P("DELETE FROM resources WHERE pkey = ? AND res = ?", pkey, r);
    for (const [m, v] of cur.mobs) if (old.mobs.get(m) !== v) {
      const b = a.bestiary[m];
      P("INSERT INTO player_mob_discovery (pkey, mob_id, seen_at, kills, viewed_at, updated_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(pkey, mob_id) DO UPDATE SET kills = MAX(player_mob_discovery.kills, excluded.kills), viewed_at = COALESCE(player_mob_discovery.viewed_at, excluded.viewed_at), updated_at = excluded.updated_at",
        pkey, m, b.at || now, b.kills || 0, b.v ? now : null, now);
    }
    for (const [id, v] of cur.idisc) if (old.idisc.get(id) !== v && ITEM_BY_ID[id]) {
      const d = a.disc.items[id];
      P("INSERT INTO player_item_discovery (pkey, item_id, state, first_at, first_source, viewed_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(pkey, item_id) DO UPDATE SET state = CASE WHEN excluded.state = 'owned' THEN 'owned' ELSE player_item_discovery.state END, viewed_at = COALESCE(player_item_discovery.viewed_at, excluded.viewed_at)",
        pkey, id, d.st, d.at || now, d.src || null, d.v ? now : null);
    }
    for (const [f, v] of cur.fdisc) if (old.fdisc.get(f) !== v) {
      const d = a.disc.feats[f];
      P("INSERT INTO player_feature_discovery (pkey, feature, first_at, viewed_at) VALUES (?, ?, ?, ?) ON CONFLICT(pkey, feature) DO UPDATE SET viewed_at = COALESCE(player_feature_discovery.viewed_at, excluded.viewed_at)", pkey, f, d.at || now, d.v ? now : null);
    }
    if (!st.length) return;
    await db.batch(st); // атомарно: либо всё, либо ничего
    this.shadow.set(pkey, cur);
    this.stats.flushes++;
  }

  // Запись в журнал (отказы античита, награды забегов) — вне основной выгрузки
  audit(pkey: string, kind: string, tx: string, detail: any = null, extra: { item?: string; instance?: string; qty?: number; source?: string } = {}) {
    if (!this.db) return;
    this.db.prepare("INSERT OR IGNORE INTO grant_audit (ts, pkey, kind, item_id, instance_id, qty, source, tx_id, detail) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .bind(Date.now(), pkey, kind, extra.item || null, extra.instance || null, extra.qty ?? null, extra.source || null, tx, detail ? JSON.stringify(detail).slice(0, 2000) : null)
      .run().catch((e: any) => console.error("[mc] audit failed", e?.message || e));
  }

  // Итог забега: одна награда на run_id (PRIMARY KEY) — повтор/дубль отклоняется базой
  async recordRun(pkey: string, r: { runId: string; room: string; startedAt: number; endedAt: number; serverTime: number; kills: number; xp: number; flags: any }): Promise<boolean> {
    if (!this.db) return true;
    const res = await this.db.prepare("INSERT OR IGNORE INTO run_results (run_id, pkey, room, started_at, ended_at, server_time, kills, xp, flags) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .bind(r.runId, pkey, r.room, r.startedAt, r.endedAt, r.serverTime, r.kills, r.xp, JSON.stringify(r.flags || {})).run();
    return (res?.meta?.changes ?? 1) > 0;
  }

  // Выгрузить и забыть (последняя сессия игрока закрыта)
  async evict(pkey: string, stillUsed: () => boolean = () => false) {
    await this.flush(pkey);
    await (this.chain.get(pkey) || Promise.resolve());
    if (stillUsed()) return; // игрок успел переподключиться — профиль остаётся горячим
    this.accounts.delete(pkey);
    for (const cls of HERO_IDS) this.heroes.delete(`${pkey}|${cls}`);
    this.shadow.delete(pkey); this.chain.delete(pkey); this.verified.delete(pkey);
  }
}

