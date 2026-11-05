// Боевые шахматы: D1-слой рейтинга (миграция 0042, таблицы chess_*). Гости ("guest:…") и боты не рейтингуются.
import { glicko2, provisional, CHESS_RATING_CFG as C, type Rating } from "./rating";

export const isRatable = (uid: string | undefined | null, verified = true) =>
  !!uid && verified && !uid.startsWith("guest:") && !uid.startsWith("bot:");

type Row = Rating & { wins: number; losses: number; peak: number };
const START = (): Row => ({ ...C.start, games: 0, wins: 0, losses: 0, peak: C.start.rating });

export async function getChessRating(env: any, uid: string) {
  if (!isRatable(uid) || !env.GAME_DB) return null;
  const x: any = await env.GAME_DB.prepare("SELECT rating, rd, vol, games, wins, losses, peak FROM chess_ratings WHERE user_id = ?").bind(uid).first();
  const r: Row = x ? x : START();
  return { rating: Math.round(r.rating), rd: Math.round(r.rd), games: r.games, wins: r.wins, losses: r.losses, peak: Math.round(r.peak), provisional: provisional(r) };
}

export async function chessTop(env: any, limit = 50) {
  if (!env.GAME_DB) return [];
  let rows: any[] = [];
  try {
    rows = (await env.GAME_DB.prepare("SELECT r.user_id, r.rating, r.rd, r.games, r.wins, r.losses, u.username FROM chess_ratings r LEFT JOIN users u ON u.id = r.user_id WHERE r.games >= ? ORDER BY r.rating DESC LIMIT ?")
      .bind(C.provisional, Math.min(100, limit)).all()).results || [];
  } catch { // локальная D1 без таблицы users
    rows = (await env.GAME_DB.prepare("SELECT user_id, rating, rd, games, wins, losses, NULL AS username FROM chess_ratings WHERE games >= ? ORDER BY rating DESC LIMIT ?")
      .bind(C.provisional, Math.min(100, limit)).all()).results || [];
  }
  return rows.map((x: any, i: number) => ({ place: i + 1, nick: String(x.username || "").slice(0, 24), rating: Math.round(x.rating), rd: Math.round(x.rd), games: x.games, wins: x.wins, losses: x.losses }));
}

export type ChessChange = { before: number; after: number; delta: number; rd: number; games: number; provisional: boolean };
export type ChessRateResult = { unrated: string } | { dup?: boolean; changes: Record<string, ChessChange> };

/** Итог 1×1 → Glicko-2. Идемпотентно по match_id (перезапуск DO / повторный finish не меняет рейтинг второй раз). */
export async function rateChess(env: any, matchId: string, a: { uid: string; verified: boolean }, b: { uid: string; verified: boolean }, winnerUid: string, halfTurns: number, minHalfTurns = 4): Promise<ChessRateResult> {
  if (!env.GAME_DB) return { unrated: "no_db" };
  if (!isRatable(a.uid, a.verified) || !isRatable(b.uid, b.verified)) return { unrated: "guest" };
  if (a.uid === b.uid) return { unrated: "self" };
  if (halfTurns < minHalfTurns) return { unrated: "too_early" };
  const DB = env.GAME_DB;
  const done = (await DB.prepare("SELECT user_id, before, after, rd FROM chess_rating_history WHERE match_id = ?").bind(matchId).all()).results || [];
  if (done.length) return { dup: true, changes: Object.fromEntries(done.map((x: any) => [x.user_id, { before: Math.round(x.before), after: Math.round(x.after), delta: Math.round(x.after) - Math.round(x.before), rd: Math.round(x.rd), games: 0, provisional: false }])) };
  const load = async (uid: string): Promise<Row> => (await DB.prepare("SELECT rating, rd, vol, games, wins, losses, peak FROM chess_ratings WHERE user_id = ?").bind(uid).first()) || START();
  const ra = await load(a.uid), rb = await load(b.uid);
  const sa = winnerUid === a.uid ? 1 : winnerUid === b.uid ? 0 : 0.5;
  const na = glicko2(ra, [{ opp: rb, score: sa }]), nb = glicko2(rb, [{ opp: ra, score: 1 - sa }]);
  const now = Date.now(), changes: Record<string, ChessChange> = {}, st: any[] = [];
  for (const [uid, o, n, s, opp] of [[a.uid, ra, na, sa, b.uid], [b.uid, rb, nb, 1 - sa, a.uid]] as const) {
    const w = s === 1 ? 1 : 0, l = s === 0 ? 1 : 0;
    st.push(DB.prepare("INSERT INTO chess_ratings (user_id, rating, rd, vol, games, wins, losses, peak, updated_at) VALUES (?,?,?,?,?,?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET rating=excluded.rating, rd=excluded.rd, vol=excluded.vol, games=excluded.games, wins=excluded.wins, losses=excluded.losses, peak=excluded.peak, updated_at=excluded.updated_at")
      .bind(uid, n.rating, n.rd, n.vol, n.games, o.wins + w, o.losses + l, Math.max(o.peak, n.rating), now));
    st.push(DB.prepare("INSERT INTO chess_rating_history (user_id, match_id, before, after, rd, result, opp, created_at) VALUES (?,?,?,?,?,?,?,?)")
      .bind(uid, matchId, o.rating, n.rating, n.rd, s, opp, now));
    changes[uid] = { before: Math.round(o.rating), after: Math.round(n.rating), delta: Math.round(n.rating) - Math.round(o.rating), rd: Math.round(n.rd), games: n.games, provisional: provisional(n) };
  }
  await DB.batch(st);
  return { changes };
}
