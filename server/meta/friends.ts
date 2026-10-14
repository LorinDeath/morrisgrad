// «Проклятые»: друзья и настройки приватности (только сервер; D1, миграция 0006_social.sql).
// Заявка → принять/отклонить, удаление; взаимная заявка = сразу дружба. Лимиты: 100 друзей, 30 исходящих заявок,
// не чаще 1 заявки в секунду и 10 в минуту. Настройки: кто может вызывать на дуэль (все / друзья / никто),
// принимать ли заявки в друзья. Без D1 (локальные тесты без базы) — то же в памяти экземпляра.
export const MAX_FRIENDS = 100;
export const MAX_OUTGOING = 30;
export const REQ_GAP_MS = 1000;
export const REQ_PER_MIN = 10;
export type Prefs = { duel: "all" | "friends" | "none"; freq: boolean; dnd: number }; // dnd — «не беспокоить» до (мс), на весь аккаунт
export const DEFAULT_PREFS: Prefs = { duel: "all", freq: true, dnd: 0 };
export const DND_MS = 5 * 60_000;
export type Prof = { hero: string | null; lvl: number; gname: string | null };

export class FriendStore {
  db: any;
  // память (без D1)
  mReq = new Map<string, number>();         // "from>to" → at
  mFr = new Map<string, Map<string, number>>();
  mPrefs = new Map<string, Prefs>();
  // кэш для онлайн-проверок (дуэли «только друзья», пометки в списке онлайн)
  friendsCache = new Map<string, Set<string>>();
  prefsCache = new Map<string, Prefs>();
  constructor(db: any) { this.db = db; }

  async prefs(pkey: string): Promise<Prefs> {
    const c = this.prefsCache.get(pkey);
    if (c) return c;
    let p: Prefs = { ...DEFAULT_PREFS };
    if (this.db) {
      const r = await this.db.prepare("SELECT duel_allow, friend_requests, dnd_until FROM player_settings WHERE pkey = ?").bind(pkey).first();
      if (r) p = { duel: (["all", "friends", "none"].includes(r.duel_allow) ? r.duel_allow : "all") as Prefs["duel"], freq: !!r.friend_requests, dnd: Number(r.dnd_until) || 0 };
    } else p = { ...(this.mPrefs.get(pkey) || DEFAULT_PREFS) };
    this.prefsCache.set(pkey, p);
    return p;
  }
  async setPrefs(pkey: string, p: Prefs) {
    this.prefsCache.set(pkey, p);
    if (!this.db) { this.mPrefs.set(pkey, { ...p }); return; }
    await this.db.prepare(`INSERT INTO player_settings (pkey, duel_allow, friend_requests, dnd_until, updated_at) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(pkey) DO UPDATE SET duel_allow = excluded.duel_allow, friend_requests = excluded.friend_requests, dnd_until = excluded.dnd_until, updated_at = excluded.updated_at`)
      .bind(pkey, p.duel, p.freq ? 1 : 0, Math.round(p.dnd || 0), Date.now()).run();
  }

  async friends(pkey: string): Promise<string[]> {
    let out: string[];
    if (this.db) out = ((await this.db.prepare("SELECT friend_pkey FROM friendships WHERE pkey = ? ORDER BY created_at LIMIT 200").bind(pkey).all()).results || []).map((r: any) => r.friend_pkey);
    else out = [...(this.mFr.get(pkey)?.keys() || [])];
    this.friendsCache.set(pkey, new Set(out));
    return out;
  }
  prefsCached(pkey: string): Prefs { return this.prefsCache.get(pkey) || DEFAULT_PREFS; }
  isFriendCached(a: string, b: string) { return !!this.friendsCache.get(a)?.has(b); }
  async reqIn(pkey: string): Promise<{ pkey: string; at: number }[]> {
    if (this.db) return ((await this.db.prepare("SELECT from_pkey, created_at FROM friend_requests WHERE to_pkey = ? ORDER BY created_at DESC LIMIT 100").bind(pkey).all()).results || []).map((r: any) => ({ pkey: r.from_pkey, at: r.created_at }));
    return [...this.mReq].filter(([k]) => k.endsWith(">" + pkey)).map(([k, at]) => ({ pkey: k.slice(0, k.lastIndexOf(">")), at }));
  }
  async reqOut(pkey: string): Promise<{ pkey: string; at: number }[]> {
    if (this.db) return ((await this.db.prepare("SELECT to_pkey, created_at FROM friend_requests WHERE from_pkey = ? ORDER BY created_at DESC LIMIT 100").bind(pkey).all()).results || []).map((r: any) => ({ pkey: r.to_pkey, at: r.created_at }));
    return [...this.mReq].filter(([k]) => k.startsWith(pkey + ">")).map(([k, at]) => ({ pkey: k.slice(pkey.length + 1), at }));
  }
  async hasReq(from: string, to: string): Promise<boolean> {
    if (this.db) return !!(await this.db.prepare("SELECT 1 AS x FROM friend_requests WHERE from_pkey = ? AND to_pkey = ?").bind(from, to).first());
    return this.mReq.has(from + ">" + to);
  }
  async addReq(from: string, to: string) {
    if (this.db) await this.db.prepare("INSERT OR IGNORE INTO friend_requests (from_pkey, to_pkey, created_at) VALUES (?, ?, ?)").bind(from, to, Date.now()).run();
    else this.mReq.set(from + ">" + to, Date.now());
  }
  async delReq(from: string, to: string) {
    if (this.db) await this.db.prepare("DELETE FROM friend_requests WHERE from_pkey = ? AND to_pkey = ?").bind(from, to).run();
    else this.mReq.delete(from + ">" + to);
  }
  async addFriend(a: string, b: string) {
    const now = Date.now();
    if (this.db) await this.db.batch([
      this.db.prepare("INSERT OR IGNORE INTO friendships (pkey, friend_pkey, created_at) VALUES (?, ?, ?)").bind(a, b, now),
      this.db.prepare("INSERT OR IGNORE INTO friendships (pkey, friend_pkey, created_at) VALUES (?, ?, ?)").bind(b, a, now),
      this.db.prepare("DELETE FROM friend_requests WHERE (from_pkey = ? AND to_pkey = ?) OR (from_pkey = ? AND to_pkey = ?)").bind(a, b, b, a),
    ]);
    else {
      for (const [x, y] of [[a, b], [b, a]]) { if (!this.mFr.has(x)) this.mFr.set(x, new Map()); this.mFr.get(x)!.set(y, now); }
      this.mReq.delete(a + ">" + b); this.mReq.delete(b + ">" + a);
    }
    this.friendsCache.get(a)?.add(b); this.friendsCache.get(b)?.add(a);
  }
  async delFriend(a: string, b: string) {
    if (this.db) await this.db.prepare("DELETE FROM friendships WHERE (pkey = ? AND friend_pkey = ?) OR (pkey = ? AND friend_pkey = ?)").bind(a, b, b, a).run();
    else { this.mFr.get(a)?.delete(b); this.mFr.get(b)?.delete(a); }
    this.friendsCache.get(a)?.delete(b); this.friendsCache.get(b)?.delete(a);
  }
  async count(pkey: string): Promise<{ friends: number; out: number }> {
    if (this.db) {
      const [f, o] = await this.db.batch([
        this.db.prepare("SELECT COUNT(*) AS n FROM friendships WHERE pkey = ?").bind(pkey),
        this.db.prepare("SELECT COUNT(*) AS n FROM friend_requests WHERE from_pkey = ?").bind(pkey),
      ]);
      return { friends: f.results?.[0]?.n || 0, out: o.results?.[0]?.n || 0 };
    }
    return { friends: this.mFr.get(pkey)?.size || 0, out: (await this.reqOut(pkey)).length };
  }
  // герой/уровень/имя гостя для игроков не в сети
  async profiles(pkeys: string[]): Promise<Map<string, Prof>> {
    const out = new Map<string, Prof>();
    if (!this.db || !pkeys.length) return out;
    for (let i = 0; i < pkeys.length; i += 80) {
      const part = pkeys.slice(i, i + 80);
      const q = part.map(() => "?").join(",");
      const r = await this.db.prepare(`SELECT a.pkey, json_extract(a.data, '$.hero') AS hero, json_extract(a.data, '$.gname') AS gname,
          (SELECT h.lvl FROM heroes h WHERE h.pkey = a.pkey AND h.hero = json_extract(a.data, '$.hero')) AS lvl
        FROM accounts a WHERE a.pkey IN (${q})`).bind(...part).all();
      for (const row of r.results || []) out.set(row.pkey, { hero: row.hero || null, lvl: row.lvl || 1, gname: row.gname || null });
    }
    return out;
  }
}
