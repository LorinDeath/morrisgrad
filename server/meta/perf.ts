// «📊 Нагрузка»: дешёвая телеметрия сервера (DO). Только кольцевые буферы фиксированного размера, без выделений на такт,
// без записи в D1 на такт. ВАЖНО (прод Cloudflare Workers): часы (Date.now/performance.now) не идут во время
// синхронного кода — «длительность такта» на проде часто 0; реальную нагрузку показывает ИНТЕРВАЛ между тактами
// (опоздание относительно цели) и счётчики. Локально (wrangler dev) часы идут, длительность видна.
export const TICK_TARGET_MS = 100;  // setInterval в room.ts
export const ZONE_SEND_MS = 200;    // zone_state раз в 0.2 с (service.ts zoneAcc)
const SER_N = 9000;                 // 15 мин при 10 Гц
export class Series {
  t = new Float64Array(SER_N); v = new Float32Array(SER_N); i = 0; len = 0; private scratch = new Float32Array(SER_N);
  push(t: number, v: number) { this.t[this.i] = t; this.v[this.i] = v; this.i = (this.i + 1) % SER_N; if (this.len < SER_N) this.len++; }
  stats(since: number) {
    let n = 0, sum = 0, max = 0;
    for (let k = 0; k < this.len; k++) { const j = (this.i - 1 - k + SER_N) % SER_N; if (this.t[j] < since) break; const x = this.v[j]; this.scratch[n++] = x; sum += x; if (x > max) max = x; }
    if (!n) return { n: 0, avg: 0, p50: 0, p95: 0, p99: 0, max: 0 };
    const a = this.scratch.subarray(0, n); a.sort();
    const q = (p: number) => +a[Math.min(n - 1, Math.floor(p * n))].toFixed(3);
    return { n, avg: +(sum / n).toFixed(3), p50: q(0.5), p95: q(0.95), p99: q(0.99), max: +max.toFixed(3) };
  }
  /** история для графика: максимум по корзинам (buckets точек за последние sec секунд) */
  hist(now: number, sec: number, buckets: number) {
    const out = new Array(buckets).fill(0), w = (sec * 1000) / buckets, since = now - sec * 1000;
    for (let k = 0; k < this.len; k++) { const j = (this.i - 1 - k + SER_N) % SER_N; const t = this.t[j]; if (t < since) break; const b = Math.min(buckets - 1, Math.floor((t - since) / w)); if (this.v[j] > out[b]) out[b] = +this.v[j].toFixed(2); }
    return out;
  }
}
// посекундные счётчики (900 с = 15 мин)
export const SEC_KEYS = ["ticks", "msgIn", "bytesIn", "msgOut", "bytesOut", "bcast", "fanout", "dbq", "dbErr", "dbMs", "err", "wsOpen", "wsClose", "req"] as const;
type SK = (typeof SEC_KEYS)[number];
const SEC_N = 900;
class PerSec {
  ring: Record<string, Float64Array> = {}; cur: Record<string, number> = {}; tot: Record<string, number> = {}; sec = 0; filled = 0;
  constructor() { for (const k of SEC_KEYS) { this.ring[k] = new Float64Array(SEC_N); this.cur[k] = 0; this.tot[k] = 0; } }
  roll(now: number) {
    const s = Math.floor(now / 1000); if (!this.sec) this.sec = s;
    while (this.sec < s) { const j = this.sec % SEC_N; for (const k of SEC_KEYS) { this.ring[k][j] = this.cur[k]; this.cur[k] = 0; } this.sec++; if (this.filled < SEC_N) this.filled++; }
  }
  add(k: SK, v = 1) { this.cur[k] += v; this.tot[k] += v; }
  /** в среднем в секунду за последние sec секунд */
  rate(k: SK, sec: number) { const n = Math.min(sec, this.filled); if (!n) return 0; let s = 0; for (let d = 1; d <= n; d++) s += this.ring[k][(this.sec - d + SEC_N) % SEC_N]; return +(s / n).toFixed(2); }
  sum(k: SK, sec: number) { const n = Math.min(sec, this.filled); let s = 0; for (let d = 1; d <= n; d++) s += this.ring[k][(this.sec - d + SEC_N) % SEC_N]; return s; }
  hist(k: SK, sec: number, buckets: number) { const n = Math.min(sec, this.filled), out = new Array(buckets).fill(0), per = sec / buckets; for (let d = 1; d <= n; d++) { const b = buckets - 1 - Math.floor((d - 1) / per); if (b >= 0) out[b] += this.ring[k][(this.sec - d + SEC_N) % SEC_N]; } return out.map((v) => +(v / per).toFixed(2)); }
}
export const PERF = {
  boot: Date.now(), boots: 0, lastBootPrev: 0,
  tickDur: new Series(), tickGap: new Series(), zone: {} as Record<string, Series>, lastTick: 0,
  sec: new PerSec(), msgTypes: new Map<string, number>(), errLast: [] as { at: number; m: string }[], dbSlow: [] as { at: number; ms: number; sql: string }[],
  handlerMs: new Series(), // время обработчика входящего сообщения (часы Workers — см. шапку)
};
export function perfTick(t0: number, t1: number) {
  const now = Date.now(); PERF.sec.roll(now); PERF.sec.add("ticks");
  if (PERF.lastTick) PERF.tickGap.push(now, now - PERF.lastTick); PERF.lastTick = now;
  PERF.tickDur.push(now, t1 - t0);
}
export function perfZone(w: string, ms: number) { (PERF.zone[w] ||= new Series()).push(Date.now(), ms); }
export function perfErr(m: string) { PERF.sec.add("err"); if (PERF.errLast.length >= 20) PERF.errLast.shift(); PERF.errLast.push({ at: Date.now(), m: m.slice(0, 160) }); }
export function perfMsgIn(type: string, bytes: number) { PERF.sec.add("msgIn"); PERF.sec.add("bytesIn", bytes); if (PERF.msgTypes.size < 200 || PERF.msgTypes.has(type)) PERF.msgTypes.set(type, (PERF.msgTypes.get(type) || 0) + 1); }
/** обёртка сокета: считает исходящие сообщения/байты (одно сложение на send) */
export function wrapSend(ws: any) { const orig = ws.send.bind(ws); ws.send = (d: any) => { PERF.sec.add("msgOut"); PERF.sec.add("bytesOut", typeof d === "string" ? d.length : d?.byteLength || 0); return orig(d); }; return ws; }
/** обёртка D1: число запросов, ошибки, задержка (await — часы идут, задержка честная и на проде) */
export function wrapDb(db: any) {
  if (!db || db.__perf) return db;
  const time = async (sql: string, f: () => Promise<any>) => { const t = Date.now(); PERF.sec.add("dbq"); try { return await f(); } catch (e) { PERF.sec.add("dbErr"); throw e; } finally { const ms = Date.now() - t; PERF.sec.add("dbMs", ms); if (ms > 200) { if (PERF.dbSlow.length >= 10) PERF.dbSlow.shift(); PERF.dbSlow.push({ at: Date.now(), ms, sql: sql.replace(/\s+/g, " ").slice(0, 80) }); } } };
  const stmt = (s: any, sql: string): any => ({ bind: (...a: any[]) => stmt(s.bind(...a), sql), first: (c?: any) => time(sql, () => s.first(c)), run: () => time(sql, () => s.run()), all: () => time(sql, () => s.all()), raw: (o?: any) => time(sql, () => s.raw(o)), __s: s });
  return { __perf: true, prepare: (sql: string) => stmt(db.prepare(sql), sql), batch: (list: any[]) => time("batch×" + list.length, () => db.batch(list.map((x) => x.__s || x))), exec: (q: string) => time(q, () => db.exec(q)), dump: () => db.dump?.() };
}
/** снимок «Сервер»: такт, интервалы, сеть, D1, ошибки, аптайм */
export function perfServer(now = Date.now()) {
  const W = (m: number) => now - m * 60000, S = PERF.sec;
  const win = (s: Series) => ({ m1: s.stats(W(1)), m5: s.stats(W(5)), m15: s.stats(W(15)) });
  const zones: Record<string, any> = {}; for (const [w, s] of Object.entries(PERF.zone)) zones[w] = { updateMs: win(s), hist5m: s.hist(now, 300, 60) };
  const r = (k: SK) => ({ s1m: S.rate(k, 60), s5m: S.rate(k, 300), s15m: S.rate(k, 900) });
  const dbq1 = S.sum("dbq", 60);
  return {
    target: { tickMs: TICK_TARGET_MS, tickHz: 1000 / TICK_TARGET_MS, zoneSendMs: ZONE_SEND_MS, note: "Часы Workers стоят во время синхронного кода: tickMs на проде ≈ 0; смотрите gapMs (интервал между тактами) и lateMs" },
    tickMs: win(PERF.tickDur), gapMs: win(PERF.tickGap), tickHz: r("ticks"),
    lateMs: { p95_5m: +Math.max(0, PERF.tickGap.stats(W(5)).p95 - TICK_TARGET_MS).toFixed(1), max_5m: +Math.max(0, PERF.tickGap.stats(W(5)).max - TICK_TARGET_MS).toFixed(1) },
    hist: { tickMs5m: PERF.tickDur.hist(now, 300, 60), gapMs5m: PERF.tickGap.hist(now, 300, 60), msgOut15m: S.hist("msgOut", 900, 60), bytesOut15m: S.hist("bytesOut", 900, 60) },
    zones, handlerMs: win(PERF.handlerMs),
    net: { msgIn: r("msgIn"), bytesIn: r("bytesIn"), msgOut: r("msgOut"), bytesOut: r("bytesOut"), broadcasts: r("bcast"), fanoutPerBroadcast: +(S.sum("fanout", 60) / Math.max(1, S.sum("bcast", 60))).toFixed(1),
      topIn: [...PERF.msgTypes.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12) },
    db: { perMin: dbq1, perMin5: +(S.sum("dbq", 300) / 5).toFixed(1), avgMs1m: +(S.sum("dbMs", 60) / Math.max(1, dbq1)).toFixed(1), errors15m: S.sum("dbErr", 900), slow: PERF.dbSlow },
    errors: { s15m: S.sum("err", 900), total: S.tot.err, last: PERF.errLast.slice(-8) },
    ws: { opened15m: S.sum("wsOpen", 900), closed15m: S.sum("wsClose", 900), reqTotal: S.tot.req, req15m: S.sum("req", 900) },
    uptime: { bootAt: PERF.boot, sec: Math.round((now - PERF.boot) / 1000), boots: PERF.boots, prevBootAt: PERF.lastBootPrev },
    cpu: { note: "CPU-время запроса Workers изнутри не видно; ориентир — gapMs/lateMs и handlerMs (локально точные)" },
  };
}
/** число перезапусков DO — 1 запись в SQLite DO при старте (не D1) */
export function perfBoot(sql: any) {
  try { if (!sql) return; sql.exec("CREATE TABLE IF NOT EXISTS perf_boot (k TEXT PRIMARY KEY, n INTEGER, last INTEGER)");
    const r = [...sql.exec("SELECT n, last FROM perf_boot WHERE k='boot'")][0] as any; PERF.boots = (r?.n || 0) + 1; PERF.lastBootPrev = r?.last || 0;
    sql.exec("INSERT INTO perf_boot (k, n, last) VALUES ('boot', ?, ?) ON CONFLICT(k) DO UPDATE SET n=excluded.n, last=excluded.last", PERF.boots, PERF.boot);
  } catch (e: any) { /* без SQLite DO — тесты */ }
}
