// D1-слой рейтинга (миграция 0026). Гости ("guest:…"), боты и нерейтинговые партии сюда не попадают.
import { RATING_CFG, leagueOf, rateMatch, mapHash, unratedReason, type League, type Rating, type RPlayer, type RatedCtx } from "./rating";
const LEAGUES: League[] = ["quick", "normal", "tactical"];
const DAY = 86_400_000;
export async function getRatings(env: any, uid: string) {
  const out: Record<string, any> = {}; if (!uid || uid.startsWith("guest:")) return out;
  const r = (await env.GAME_DB.prepare("SELECT league, rating, rd, games, wins, losses, draws, peak FROM strat_ratings WHERE user_id = ?").bind(uid).all()).results || [];
  for (const L of LEAGUES) { const x: any = r.find((y: any) => y.league === L);
    out[L] = x ? { rating: Math.round(x.rating), rd: Math.round(x.rd), games: x.games, wins: x.wins, losses: x.losses, draws: x.draws, peak: Math.round(x.peak), provisional: x.games < RATING_CFG.provisional }
      : { rating: RATING_CFG.start.rating, rd: RATING_CFG.start.rd, games: 0, wins: 0, losses: 0, draws: 0, peak: RATING_CFG.start.rating, provisional: true }; }
  return out;
}
/** топ-100 лиги; предварительные (меньше 10 партий) не показываются */
export async function leaderboard(env: any, league: string, limit = 100) {
  if (!LEAGUES.includes(league as League)) return [];
  const r = (await env.GAME_DB.prepare("SELECT r.user_id, r.rating, r.rd, r.games, r.wins, r.losses, r.draws, u.username FROM strat_ratings r LEFT JOIN users u ON u.id = r.user_id WHERE r.league = ? AND r.games >= ? ORDER BY r.rating DESC LIMIT ?")
    .bind(league, RATING_CFG.provisional, Math.min(100, limit)).all()).results || [];
  let pl = 0; // равный рейтинг — общее место (как в myPlace)
  return r.map((x: any, i: number) => ({ place: (pl = i && x.rating === (r[i - 1] as any).rating ? pl : i + 1), uid: x.user_id, nick: String(x.username || "").slice(0, 24), rating: Math.round(x.rating), rd: Math.round(x.rd), games: x.games, wins: x.wins, losses: x.losses, draws: x.draws }));
}
/** t1170+: моё место в лиге для экрана «Рейтинг». Предварительный (меньше provisional партий) — без места (place:null, prov:true).
 *  place = 1 + число непредварительных игроков с рейтингом строго выше; total — сколько непредварительных в лиге. */
export async function myPlace(env: any, uid: string, league: string) {
  if (!uid || uid.startsWith("guest:") || !LEAGUES.includes(league as League)) return null;
  const x: any = await env.GAME_DB.prepare("SELECT rating, rd, games, wins, losses, draws FROM strat_ratings WHERE user_id = ? AND league = ?").bind(uid, league).first();
  const tot: any = await env.GAME_DB.prepare("SELECT COUNT(*) AS n FROM strat_ratings WHERE league = ? AND games >= ?").bind(league, RATING_CFG.provisional).first();
  if (!x) return { place: null, prov: true, rating: RATING_CFG.start.rating, rd: RATING_CFG.start.rd, games: 0, wins: 0, losses: 0, draws: 0, left: RATING_CFG.provisional, total: tot?.n || 0 };
  const prov = x.games < RATING_CFG.provisional;
  const above: any = prov ? null : await env.GAME_DB.prepare("SELECT COUNT(*) AS n FROM strat_ratings WHERE league = ? AND games >= ? AND rating > ?").bind(league, RATING_CFG.provisional, x.rating).first();
  return { place: prov ? null : (above?.n || 0) + 1, prov, rating: Math.round(x.rating), rd: Math.round(x.rd), games: x.games, wins: x.wins, losses: x.losses, draws: x.draws, left: prov ? RATING_CFG.provisional - x.games : 0, total: tot?.n || 0 };
}
/** карта в рейтинговом пуле: официальные витринные — всегда; карта игрока — если одобрена и хэш совпал со снимком */
export async function mapInPool(env: any, map: { id?: string; size: number; t: string; s: string } | null | undefined, status?: string): Promise<boolean> {
  if (!map?.id) return false; if (/^o/.test(map.id)) return true; if (!/^u/.test(map.id) || status !== "approved") return false;
  const r: any = await env.GAME_DB.prepare("SELECT version_hash FROM strat_rated_maps WHERE map_id = ?").bind(map.id).first();
  return !!r && r.version_hash === (await mapHash(map));
}
export async function poolSet(env: any, admin: string, row: { id: string; size: number; t: string; s: string; status: string } | null, on: boolean) {
  if (!row) return { err: "not_found" };
  if (!on) { await env.GAME_DB.prepare("DELETE FROM strat_rated_maps WHERE map_id = ?").bind(row.id).run(); return { ok: true }; } // прошлые партии не пересчитываются
  if (row.status !== "approved") return { err: "not_approved" };
  await env.GAME_DB.prepare("INSERT INTO strat_rated_maps (map_id, version_hash, added_by, added_at) VALUES (?,?,?,?) ON CONFLICT(map_id) DO UPDATE SET version_hash = excluded.version_hash, added_by = excluded.added_by, added_at = excluded.added_at")
    .bind(row.id, await mapHash(row), admin, Date.now()).run(); return { ok: true };
}
export async function pairToday(env: any, a: string, b: string): Promise<number> {
  const r: any = await env.GAME_DB.prepare("SELECT COUNT(DISTINCT match_id) AS n FROM strat_rating_history WHERE user_id = ? AND opp = ? AND created_at > ?").bind(a, b, Date.now() - DAY).first();
  return r?.n || 0;
}
/** Итог партии → рейтинги. players: uid, команда, место, счёт целей, число действий. Возвращает {reason} или изменения. */
/** G (t1209): коэффициенты по d из снимка партии (goals.sizes[n].rate; правятся в админке «Цели и лиги»). */
export function ratingCfgFor(rate?: { winA?: number; winB?: number; loseA?: number; loseB?: number } | null) {
  if (!rate) return RATING_CFG; const M = RATING_CFG.margin;
  return { ...RATING_CFG, margin: { ...M, win: { a: rate.winA ?? M.win.a, b: rate.winB ?? M.win.b }, lose: { a: rate.loseA ?? M.lose.a, b: rate.loseB ?? M.lose.b } } };
}
export async function rateFinished(env: any, matchId: string, size: number, ctx: RatedCtx, players: Omit<RPlayer, "r">[], rate?: any) {
  const league = leagueOf(size); if (!league) return { unrated: "size" };
  if (players.length === 2) ctx = { ...ctx, pairToday: await pairToday(env, players[0].uid, players[1].uid) };
  const why = unratedReason(ctx); if (why) return { unrated: why };
  const S = RATING_CFG.start, ps: RPlayer[] = [];
  for (const p of players) { const x: any = await env.GAME_DB.prepare("SELECT rating, rd, vol, games FROM strat_ratings WHERE user_id = ? AND league = ?").bind(p.uid, league).first();
    ps.push({ ...p, r: x ? { rating: x.rating, rd: x.rd, vol: x.vol, games: x.games } : { ...S, games: 0 } }); }
  const res = rateMatch(ps, ctx.turns, ctx.reason, ratingCfgFor(rate)); if (!Object.keys(res).length) return { unrated: "too_early" };
  const now = Date.now(), st: any[] = [];
  for (const p of ps) { const n = res[p.uid]; if (!n) continue;
    const best = Math.min(...ps.map((q) => q.place)), worst = Math.max(...ps.map((q) => q.place));
    const w = p.place === best && best !== worst ? 1 : 0, l = p.place === worst && best !== worst ? 1 : 0, d = best === worst ? 1 : 0;
    const opp = ps.length === 2 ? ps.find((q) => q.uid !== p.uid)!.uid : "";
    st.push(env.GAME_DB.prepare(`INSERT INTO strat_ratings (user_id, league, rating, rd, vol, games, wins, losses, draws, peak, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)
      ON CONFLICT(user_id, league) DO UPDATE SET rating=excluded.rating, rd=excluded.rd, vol=excluded.vol, games=excluded.games, wins=wins+?, losses=losses+?, draws=draws+?, peak=MAX(peak, excluded.rating), updated_at=excluded.updated_at`)
      .bind(p.uid, league, n.rating, n.rd, n.vol, n.games, w, l, d, Math.max(S.rating, n.rating), now, w, l, d));
    st.push(env.GAME_DB.prepare("INSERT INTO strat_rating_history (user_id, league, match_id, before, after, rd, result, opp, created_at) VALUES (?,?,?,?,?,?,?,?,?)")
      .bind(p.uid, league, matchId, p.r.rating, n.rating, n.rd, w ? 1 : d ? 0.5 : 0, opp, now)); }
  await env.GAME_DB.batch(st);
  return { league, changes: Object.fromEntries(Object.entries(res).map(([k, v]) => [k, { rating: Math.round(v.rating), delta: v.delta }])) };
}

// ---------- «Полководец» (косметика; миграция 0027)
import { levelInfo, levelOf } from "./account";
export async function getProfile(env: any, uid: string) {
  const r: any = await env.GAME_DB.prepare("SELECT xp FROM strat_profile WHERE user_id = ?").bind(uid).first();
  return levelInfo(r?.xp || 0);
}
/** сколько партий с ботом уже дали опыт сегодня (UTC) */
export async function botXpToday(env: any, uid: string, day = new Date().toISOString().slice(0, 10)): Promise<number> {
  const r: any = await env.GAME_DB.prepare("SELECT bot_xp_day, bot_xp_count FROM strat_profile WHERE user_id = ?").bind(uid).first();
  return r && r.bot_xp_day === day ? r.bot_xp_count : 0;
}
/** начислить опыт (только зарегистрированным); bot — партия с ботом (для лимита в сутки) */
export async function addXp(env: any, uid: string, xp: number, bot: boolean, day = new Date().toISOString().slice(0, 10)) {
  if (xp <= 0) return null;
  const cur: any = await env.GAME_DB.prepare("SELECT xp, bot_xp_day, bot_xp_count FROM strat_profile WHERE user_id = ?").bind(uid).first();
  const total = (cur?.xp || 0) + xp, bc = bot ? (cur?.bot_xp_day === day ? cur.bot_xp_count : 0) + 1 : (cur?.bot_xp_count || 0);
  await env.GAME_DB.prepare("INSERT INTO strat_profile (user_id, xp, level, bot_xp_day, bot_xp_count, updated_at) VALUES (?,?,?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET xp=excluded.xp, level=excluded.level, bot_xp_day=excluded.bot_xp_day, bot_xp_count=excluded.bot_xp_count, updated_at=excluded.updated_at")
    .bind(uid, total, levelOf(total), bot ? day : (cur?.bot_xp_day || null), bc, Date.now()).run();
  return levelInfo(total);
}
