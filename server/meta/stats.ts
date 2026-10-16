// «📊 Нагрузка» → Онлайн / Игроки / Экономика: агрегаты без персональных данных. В D1 — раз в минуту одним batch
// (stats_daily: суммы и максимумы за день; stats_seen: анонимный хеш игрока — один раз в день). IP и id не хранятся.
export const STATS_FLUSH_MS = 60_000;
const KYIV = "Europe/Kiev";
export const dayOf = (t: number) => new Date(t).toLocaleDateString("sv-SE", { timeZone: KYIV }); // ГГГГ-ММ-ДД
export const hourOf = (t: number) => Number(new Date(t).toLocaleString("en-GB", { timeZone: KYIV, hour: "2-digit", hour12: false }).slice(0, 2)) % 24;
/** анонимный id: FNV-1a 32 бит с солью — нельзя восстановить ключ, хватает для дедупликации */
export function anonId(key: string) { let h = 0x811c9dc5; const s = "mc-st:" + key; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); } return (h >>> 0).toString(36); }
const SL = [60, 300, 900, 1800, 3600, 7200, Infinity], SL_NAMES = ["<1м", "1–5м", "5–15м", "15–30м", "30–60м", "1–2ч", "2ч+"];
const MAXK = new Set(["peak", "peak_reg", "peak_guest"]);
const isMax = (k: string) => MAXK.has(k) || k.startsWith("h");
export class Stats {
  pendingConv = new Set<string>(); // pkey, вошедшие с гостевым id (для конверсии), очищается
  db: any = null; sum = new Map<string, number>(); max = new Map<string, number>(); seenQ: [string, string, number][] = []; seen = new Set<string>();
  sess = new Map<string, { at: number; reg: boolean; h: string }>(); durs: number[] = []; durDay = ""; flushAt = Date.now(); sampleAt = 0;
  today = new Map<string, { lvl: number; cls: string; reg: boolean }>(); todayDay = "";
  hourly: Record<string, number[]> = {}; // день → 24 максимума онлайна (память; история — из D1)
  client = new Map<string, { fps: number; ping: number; mobile: boolean; br: string; at: number }>();
  inc(k: string, v = 1) { this.sum.set(k, (this.sum.get(k) || 0) + v); }
  peak(k: string, v: number) { if (v > (this.max.get(k) ?? -1)) this.max.set(k, v); }
  /** игрок вошёл (после загрузки профиля) */
  join(sid: string, pkey: string, reg: boolean, now = Date.now()) {
    const h = anonId(pkey), d = dayOf(now); this.sess.set(sid, { at: now, reg, h });
    this.inc("sessions"); this.inc(reg ? "sessions_reg" : "sessions_guest");
    const sk = d + "|" + h; if (!this.seen.has(sk)) { this.seen.add(sk); if (this.seen.size > 50000) this.seen.clear(); this.seenQ.push([d, h, reg ? 1 : 0]); }
  }
  hero(sid: string, lvl: number, cls: string) { const s = this.sess.get(sid); if (!s || !cls) return; const d = dayOf(Date.now()); if (d !== this.todayDay) { this.todayDay = d; this.today.clear(); } this.today.set(s.h, { lvl, cls, reg: s.reg }); }
  leave(sid: string, now = Date.now()) {
    const s = this.sess.get(sid); if (!s) return; this.sess.delete(sid); this.client.delete(sid);
    const sec = Math.max(0, (now - s.at) / 1000); this.inc("sess_sec", Math.round(sec)); this.inc("sess_done");
    const b0 = SL.findIndex((x) => sec < x), b = b0 < 0 ? SL.length : b0; this.inc("sl" + b);
    const d = dayOf(now); if (d !== this.durDay) { this.durDay = d; this.durs = []; } if (this.durs.length < 5000) this.durs.push(sec);
  }
  clientStats(sid: string, m: any) {
    const n = (v: any, lo: number, hi: number) => { const x = Number(v); return Number.isFinite(x) ? Math.max(lo, Math.min(hi, x)) : null; };
    const fps = n(m.fps, 0, 500), ping = n(m.ping, 0, 10000); if (fps == null && ping == null) return false;
    const br = /^(chrome|firefox|safari|edge|opera|yandex|samsung|other)$/.test(String(m.br)) ? String(m.br) : "other";
    this.client.set(sid, { fps: fps ?? 0, ping: ping ?? 0, mobile: !!m.mobile, br, at: Date.now() }); return true;
  }
  /** раз в такт (дёшево): раз в 60 с — онлайн и запись в D1 */
  tick(now: number, onlineReg: number, onlineGuest: number) {
    if (now - this.sampleAt >= 60_000 || !this.sampleAt) { this.sampleAt = now;
      const on = onlineReg + onlineGuest, d = dayOf(now), hh = hourOf(now);
      this.peak("peak", on); this.peak("peak_reg", onlineReg); this.peak("peak_guest", onlineGuest); this.peak("h" + String(hh).padStart(2, "0"), on);
      const H = (this.hourly[d] ||= new Array(24).fill(0)); if (on > H[hh]) H[hh] = on; for (const k of Object.keys(this.hourly)) if (k < dayOf(now - 8 * 86400000)) delete this.hourly[k];
    }
    if (now - this.flushAt >= STATS_FLUSH_MS) { this.flushAt = now; this.flush(now).catch(() => {}); }
  }
  async flush(now = Date.now()) {
    if (!this.db) { this.sum.clear(); this.max.clear(); this.seenQ = []; return; }
    const d = dayOf(now), st: any[] = [];
    for (const [k, v] of this.sum) if (!isMax(k)) st.push(this.db.prepare("INSERT INTO stats_daily (day, k, v) VALUES (?, ?, ?) ON CONFLICT(day, k) DO UPDATE SET v = v + excluded.v").bind(d, k, v));
    for (const [k, v] of this.max) st.push(this.db.prepare("INSERT INTO stats_daily (day, k, v) VALUES (?, ?, ?) ON CONFLICT(day, k) DO UPDATE SET v = MAX(v, excluded.v)").bind(d, k, v));
    for (const [dd, h, r] of this.seenQ.splice(0, 200)) st.push(this.db.prepare("INSERT OR IGNORE INTO stats_seen (day, h, reg) VALUES (?, ?, ?)").bind(dd, h, r));
    this.sum.clear(); this.max.clear(); if (!st.length) return;
    try { await this.db.batch(st); } catch (e: any) { console.error("[mc] stats flush", e?.message || e); }
  }
  /** история для вкладки (только по запросу админа) */
  async history(now = Date.now()) {
    const days: string[] = []; for (let i = 29; i >= 0; i--) days.push(dayOf(now - i * 86400000));
    const out: any = { days, daily: {}, dau: {}, dauReg: {}, wau: 0, mau: 0, note: "" };
    if (!this.db) { out.note = "без D1 (тест)"; return out; }
    try {
      const r1 = await this.db.prepare("SELECT day, k, v FROM stats_daily WHERE day >= ?").bind(days[0]).all();
      for (const r of r1.results || []) (out.daily[r.day] ||= {})[r.k] = r.v;
      const r2 = await this.db.prepare("SELECT day, COUNT(*) n, SUM(reg) reg FROM stats_seen WHERE day >= ? GROUP BY day").bind(days[0]).all();
      for (const r of r2.results || []) { out.dau[r.day] = r.n; out.dauReg[r.day] = r.reg; }
      out.wau = (await this.db.prepare("SELECT COUNT(DISTINCT h) n FROM stats_seen WHERE day >= ?").bind(days[23]).first())?.n || 0;
      out.mau = (await this.db.prepare("SELECT COUNT(DISTINCT h) n FROM stats_seen WHERE day >= ?").bind(days[0]).first())?.n || 0;
    } catch (e: any) { out.note = "нет таблиц статистики (миграция 0017?): " + (e?.message || e); }
    return out;
  }
  /** уровни/классы героев, игравших сегодня (по анонимному id, без дублей) */
  todaySummary() {
    const lv: Record<string, number> = {}, cl: Record<string, number> = {}; let reg = 0;
    for (const t of this.today.values()) { const b = t.lvl >= 50 ? "50+" : `${Math.floor((t.lvl - 1) / 10) * 10 + 1}-${Math.floor((t.lvl - 1) / 10) * 10 + 10}`; lv[b] = (lv[b] || 0) + 1; cl[t.cls] = (cl[t.cls] || 0) + 1; if (t.reg) reg++; }
    return { heroes: this.today.size, registered: reg, levels: lv, classes: cl };
  }
  sessionSummary(now = Date.now()) {
    const a = [...this.durs].sort((x, y) => x - y), live = [...this.sess.values()].map((s) => (now - s.at) / 1000);
    const med = (v: number[]) => (v.length ? Math.round(v[Math.floor(v.length / 2)]) : 0);
    return { endedToday: a.length, avgSec: a.length ? Math.round(a.reduce((x, y) => x + y, 0) / a.length) : 0, medianSec: med(a), liveMedianSec: med(live.sort((x, y) => x - y)), buckets: SL_NAMES };
  }
  clientSummary() {
    const L = [...this.client.values()], fps = L.map((c) => c.fps).filter((x) => x > 0).sort((a, b) => a - b), ping = L.map((c) => c.ping).filter((x) => x > 0).sort((a, b) => a - b);
    const q = (v: number[], p: number) => (v.length ? Math.round(v[Math.min(v.length - 1, Math.floor(p * v.length))]) : 0);
    const br: Record<string, number> = {}; for (const c of L) br[c.br] = (br[c.br] || 0) + 1;
    return { reporting: L.length, fps: { p5: q(fps, 0.05), p50: q(fps, 0.5), p95: q(fps, 0.95) }, pingMs: { p50: q(ping, 0.5), p95: q(ping, 0.95), max: q(ping, 1) }, mobile: L.filter((c) => c.mobile).length, desktop: L.filter((c) => !c.mobile).length, browsers: br };
  }
}
export const ST = new Stats();
