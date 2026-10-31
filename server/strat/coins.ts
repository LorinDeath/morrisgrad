// Монеты (ТЗ §16.C): только победителю РЕЙТИНГОВОЙ партии. Сундуки/скины — позже, сейчас только валюта.
//  Победа по целям: 3–2 → 5, 3–1 → 4, 3–0 → 3.
//  Победа сдачей/неявкой/«забрать победу»: у победителя 1 цель → 1, 2 цели → 2, 0 → 0.
//  Лига: «Быстрая» ×1, «Обычная» ×5, «Тактическая» ×15 (к базе), затем
//  множитель раннего конца — как у рейтинга: до 5-го хода 0, ходы 5–9 ×0,25 (вниз), с 10-го ×1.
//  Лимит фарма — как у рейтинга: не больше 3 рейтинговых партий у пары в сутки (4-я уже не рейтинговая → монет нет).
import { earlyMul, isAbandon, RATING_CFG } from "./rating";
export const COINS_CFG = { league: { quick: 1, normal: 5, tactical: 15 } as Record<string, number>, goals: { 2: 5, 1: 4, 0: 3 } as Record<number, number>, abandon: { 0: 0, 1: 1, 2: 2 } as Record<number, number> };
export function coinsFor(o: { league?: string | null; rated: boolean; won: boolean; reason: string; turns: number; winnerGoals: number; loserGoals: number }, C = COINS_CFG, R = RATING_CFG): number {
  if (!o.rated || !o.won) return 0;
  const base = isAbandon(o.reason) || o.winnerGoals < 3 ? (C.abandon[Math.max(0, Math.min(2, o.winnerGoals))] ?? 0) : (C.goals[Math.max(0, Math.min(2, o.loserGoals))] ?? 0);
  const lm = C.league[o.league || "quick"] ?? 1; // лига умножает базу ДО множителя раннего конца
  return Math.floor(base * lm * earlyMul(o.turns, o.reason, R));
}
export async function getCoins(env: any, uid: string): Promise<number> {
  const r: any = await env.GAME_DB.prepare("SELECT balance FROM strat_coins WHERE user_id = ?").bind(uid).first(); return r?.balance || 0;
}
/** начислить (идемпотентно по match_id: повтор finish не удвоит) */
export async function grantCoins(env: any, uid: string, matchId: string, n: number, reason: string) {
  if (n <= 0) return 0; const now = Date.now(), db = env.GAME_DB;
  const ins: any = await db.prepare("INSERT OR IGNORE INTO strat_coin_ledger (user_id, match_id, delta, reason, created_at) VALUES (?,?,?,?,?)").bind(uid, matchId, n, reason, now).run();
  if (!(ins?.meta?.changes > 0)) return 0;
  await db.prepare("INSERT INTO strat_coins (user_id, balance, updated_at) VALUES (?,?,?) ON CONFLICT(user_id) DO UPDATE SET balance = balance + excluded.balance, updated_at = excluded.updated_at").bind(uid, n, now).run();
  return n;
}
