// «Партия Чёрных королей»: рейтинг Glicko-2 (как lichess), три лиги по размеру карты. Чистые функции — используются StratMatch/StratIndex и тестами.
// ТЗ: раздел «Рейтинг» и §14.R/§15.
export type League = "quick" | "normal" | "tactical";
export const LEAGUE_NAME: Record<League, string> = { quick: "Быстрая", normal: "Обычная", tactical: "Тактическая" };
export type Rating = { rating: number; rd: number; vol: number; games: number };
export const RATING_CFG = {
  start: { rating: 1500, rd: 350, vol: 0.06 },
  tau: 0.5, minRd: 45, maxRd: 350,
  provisional: 10,                       // первые 10 партий — «?» у рейтинга
  leagues: { quickMax: 9, normalMax: 29, tacticalMax: 100 } as Record<string, number>, // по большей стороне карты
  // t1208: множитель изменения рейтинга по разнице целей d = цели победителя − цели проигравшего (1…5; 0 на лимите при равенстве целей → как 1).
  // Победителю K·(a − b·d): близкая партия (d=1) — много, разгром (d=5) — мало. Проигравшему K·(a + b·d): d=1 — теряет мало, d=5 — много.
  // Ожидание по рейтингам (Glicko-2) учитывается как прежде; ничья — обычный Glicko со счётом 0,5. Сдача/неявка — проигравшему как при d = abandonD.
  margin: { win: { a: 1.4, b: 0.2 }, lose: { a: 0.4, b: 0.25 }, dMax: 5, abandonD: 5, min: 0.2, max: 2 },
  early: { none: 5, quarter: 10, mul: 0.25 }, // конец (сдача/неявка) до 5-го хода — без рейтинга и опыта; 5–9 — ×0,25
  idleLoserMul: 0.25,                    // проигравший не сделал ни одного действия — победителю ×0,25
  farmPerDay: 3,                         // одна и та же пара — не больше 3 рейтинговых партий в сутки
  ratedDefault: true,                    // «Рейтинговая» включена по умолчанию (с картой из пула)
  botXpMul: 0.25, botXpPerDay: 3,        // партии с ботами: рейтинга нет; опыт ×0,25 и только 3 такие партии в сутки
};
export function leagueOf(w: number, h = w, C = RATING_CFG): League | null {
  const m = Math.max(w, h); if (m <= C.leagues.quickMax) return "quick"; if (m <= C.leagues.normalMax) return "normal"; if (m <= C.leagues.tacticalMax) return "tactical"; return null;
}
const SCALE = 173.7178;
const g_ = (phi: number) => 1 / Math.sqrt(1 + 3 * phi * phi / (Math.PI * Math.PI));
const E_ = (mu: number, mu2: number, phi2: number) => 1 / (1 + Math.exp(-g_(phi2) * (mu - mu2)));
/** один рейтинговый период Glicko-2 (Glickman 2013). results: соперники и очки 1/0,5/0. mul — множитель изменения рейтинга (отрыв, ранний конец). */
export function glicko2(p: Rating, results: { opp: { rating: number; rd: number }; score: number }[], mul = 1, C = RATING_CFG): Rating {
  const mu = (p.rating - 1500) / SCALE, phi = p.rd / SCALE, sigma = p.vol;
  if (!results.length) { const ph = Math.sqrt(phi * phi + sigma * sigma); return { ...p, rd: Math.min(C.maxRd, ph * SCALE) }; }
  let vInv = 0, dSum = 0;
  for (const r of results) { const mu2 = (r.opp.rating - 1500) / SCALE, phi2 = r.opp.rd / SCALE, e = E_(mu, mu2, phi2), g = g_(phi2); vInv += g * g * e * (1 - e); dSum += g * (r.score - e); }
  const v = 1 / vInv, delta = v * dSum, a = Math.log(sigma * sigma), tau = C.tau, eps = 1e-6;
  const f = (x: number) => { const ex = Math.exp(x); return ex * (delta * delta - phi * phi - v - ex) / (2 * (phi * phi + v + ex) ** 2) - (x - a) / (tau * tau); };
  let A = a, B: number; if (delta * delta > phi * phi + v) B = Math.log(delta * delta - phi * phi - v); else { let k = 1; while (f(a - k * tau) < 0) k++; B = a - k * tau; }
  let fA = f(A), fB = f(B);
  for (let it = 0; Math.abs(B - A) > eps && it < 100; it++) { const Cc = A + (A - B) * fA / (fB - fA), fC = f(Cc); if (fC * fB <= 0) { A = B; fA = fB; } else fA /= 2; B = Cc; fB = fC; }
  const sig2 = Math.exp(A / 2), phiStar = Math.sqrt(phi * phi + sig2 * sig2), phiN = 1 / Math.sqrt(1 / (phiStar * phiStar) + 1 / v), muN = mu + phiN * phiN * dSum * mul;
  return { rating: muN * SCALE + 1500, rd: Math.max(C.minRd, Math.min(C.maxRd, phiN * SCALE)), vol: sig2, games: p.games + 1 };
}
export const provisional = (r: Rating, C = RATING_CFG) => r.games < C.provisional;

// ---------- допуск партии к рейтингу
export type RatedCtx = {
  rated: boolean;          // переключатель хоста «Рейтинговая» (форсирует стандартные настройки; карта — из рейтингового пула)
  standard: boolean;       // настройки стандартные (лимит ходов/времени по умолчанию, без правок)
  mapInPool: boolean;      // карта в рейтинговом пуле (витрина или одобренная + в пуле, хэш совпал)
  humans: number; guests: number; bots: number; creatorOnly?: boolean;
  turns: number;           // номер хода на момент конца
  reason: string;          // goals / limit / king / forfeit / away / …
  pairToday?: number;      // сколько рейтинговых партий у этой пары сегодня (1×1)
};
/** null — рейтинг считается; иначе причина (для итогового окна партии) */
export function unratedReason(c: RatedCtx, C = RATING_CFG): string | null {
  if (!c.rated) return "not_rated_mode";
  if (c.bots > 0) return "bots";
  if (c.guests > 0) return "guests";
  if (c.creatorOnly) return "test_match";
  if (!c.mapInPool) return "map_not_in_pool";
  if (!c.standard) return "nonstandard";
  if (c.humans < 2) return "solo";
  if (isAbandon(c.reason) && c.turns < C.early.none) return "too_early";
  if ((c.pairToday || 0) >= C.farmPerDay) return "farm_limit";
  return null;
}
export const isAbandon = (reason: string) => reason === "forfeit" || reason === "away" || reason === "claim" || reason === "surrender" || reason === "disconnect";
/** множитель за ранний конец (сдача/неявка): <5 → 0 (без рейтинга и опыта), 5–9 → ×0,25, ≥10 → 1. Тот же множитель — для опыта. */
export function earlyMul(turns: number, reason: string, C = RATING_CFG): number {
  if (!isAbandon(reason)) return 1; if (turns < C.early.none) return 0; return turns < C.early.quarter ? C.early.mul : 1;
}
/** t1208: множитель по разнице целей d (победитель − проигравший). d неизвестна → 1. */
export function marginMul(won: boolean, d: number | undefined, C = RATING_CFG): number {
  if (d == null || !isFinite(d)) return 1; const M = C.margin, k = Math.max(1, Math.min(M.dMax, Math.round(d)));
  const v = won ? M.win.a - M.win.b * k : M.lose.a + M.lose.b * k; return Math.max(M.min, Math.min(M.max, Math.round(v * 1000) / 1000));
}
/** опыт Полководца с учётом раннего конца и ботов */
export function xpMul(c: { turns: number; reason: string; bots: number; botGamesToday?: number }, C = RATING_CFG): number {
  const e = earlyMul(c.turns, c.reason, C); if (!e) return 0;
  if (c.bots > 0) return (c.botGamesToday || 0) >= C.botXpPerDay ? 0 : e * C.botXpMul;
  return e;
}

// ---------- расчёт по итогу партии (1×1, команды, FFA)
export type RPlayer = { uid: string; team: number; place: number; goals?: number; actions: number; r: Rating }; // place: 1 — лучший (по команде)
/** Возвращает новые рейтинги. Команды: средний рейтинг/RD команды против среднего соперника. FFA: попарно по месту. */
export function rateMatch(ps: RPlayer[], turns: number, reason: string, C = RATING_CFG): Record<string, Rating & { delta: number }> {
  const em = earlyMul(turns, reason, C), out: Record<string, Rating & { delta: number }> = {}; if (!em) return out;
  const teams = new Map<number, RPlayer[]>(); for (const p of ps) teams.set(p.team, [...(teams.get(p.team) || []), p]);
  const avg = (t: RPlayer[]) => ({ rating: t.reduce((s, p) => s + p.r.rating, 0) / t.length, rd: Math.sqrt(t.reduce((s, p) => s + p.r.rd ** 2, 0) / t.length) });
  const tl = [...teams.entries()].map(([id, m]) => ({ id, m, place: Math.min(...m.map((p) => p.place)), goals: Math.max(...m.map((p) => p.goals ?? -1)), idle: m.every((p) => p.actions === 0), avg: avg(m) }));
  for (const t of tl) {
    const res: { opp: { rating: number; rd: number }; score: number }[] = []; let mulSum = 0;
    for (const o of tl) { if (o === t) continue;
      const score = t.place < o.place ? 1 : t.place > o.place ? 0 : 0.5; res.push({ opp: o.avg, score });
      const d = t.goals < 0 || o.goals < 0 ? undefined : Math.abs(t.goals - o.goals), ab = isAbandon(reason);
      let m = 1; if (score === 1) { m = marginMul(true, d, C); if (o.idle) m *= C.idleLoserMul; } else if (score === 0) m = marginMul(false, ab ? C.margin.abandonD : d, C);
      mulSum += m; }
    const mul = em * (res.length ? mulSum / res.length : 1);
    for (const p of t.m) { const n = glicko2(p.r, res, mul, C); out[p.uid] = { ...n, delta: Math.round(n.rating - p.r.rating) }; }
  }
  return out;
}
/** хэш версии карты для пула: меняется при любой правке автора → карта выпадает из пула до повторного одобрения */
export async function mapHash(m: { size: number; t: string; s: string; name?: string }): Promise<string> {
  const d = new TextEncoder().encode(`${m.size}|${m.t}|${m.s}`);
  const h = await crypto.subtle.digest("SHA-256", d); return [...new Uint8Array(h)].slice(0, 12).map((b) => b.toString(16).padStart(2, "0")).join("");
}
