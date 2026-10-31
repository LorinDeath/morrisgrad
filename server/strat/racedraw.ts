// Рейтинговый жребий рас (Алекс, t1144): сервер назначает расу при старте рейтинговой партии.
// Взвешенно: «Любимые расы» игрока (до favMax) получают fav% вероятности, остальные — other% (конфиг econ.raceDraw, админка).
// Повторов нет, пока рас хватает; если игроков больше, чем рас, — повтор только с игроком другой команды, и как можно реже (FFA: каждый — своя команда).
// Проверяемо: в лобби публикуется commit = SHA-256(seed), при старте всем сразу раскрываются seed и броски; любой пересчитает drawRaces(seed, …).
import { RACES, type Race } from "./rules";

export type DrawSeat = { fav: Race[]; team: number };
export type DrawRoll = { seat: number; race: Race; fromFav: boolean; roll: number; pool: Race[]; favPool: Race[] };
export type DrawCfg = { fav: number; other: number; favMax: number };
export const DRAW_DEFAULT: DrawCfg = { fav: 85, other: 15, favMax: 3 };

/** Список любимых рас из ввода клиента: только известные, без повторов, не больше favMax. Мусор → []. */
export function cleanFav(x: any, favMax = DRAW_DEFAULT.favMax): Race[] {
  if (!Array.isArray(x)) return [];
  const out: Race[] = []; for (const r of x) if (typeof r === "string" && (RACES as string[]).includes(r) && !out.includes(r as Race) && out.length < favMax) out.push(r as Race);
  return out;
}
const hex = (b: ArrayBuffer) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
export const newSeed = () => hex(crypto.getRandomValues(new Uint8Array(16)).buffer);
export const commitOf = async (seed: string) => hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode("strat-race:" + seed)));
/** i-й бросок: первые 4 байта SHA-256(seed:i) / 2^32 ∈ [0, 1) */
async function roll(seed: string, i: number): Promise<number> {
  const d = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(seed + ":" + i)));
  return (d[0] * 16777216 + d[1] * 65536 + d[2] * 256 + d[3]) / 4294967296;
}
/** Допустимые расы для места s при уже назначенных: без повторов, пока можно; иначе — только расы, которых нет у товарищей по команде, с наименьшим числом повторов. */
export function allowed(seats: DrawSeat[], s: number, taken: (Race | null)[]): Race[] {
  const free = RACES.filter((r) => !taken.includes(r)); if (free.length) return free;
  const mate = new Set(taken.filter((r, i) => r && i !== s && seats[i].team === seats[s].team) as Race[]);
  let pool = RACES.filter((r) => !mate.has(r)); if (!pool.length) pool = [...RACES]; // команда больше числа рас — повтор неизбежен
  const cnt = (r: Race) => taken.filter((t) => t === r).length, min = Math.min(...pool.map(cnt));
  return pool.filter((r) => cnt(r) === min);
}
/** Жребий: порядок мест тоже по жребию (никто не получает любимую расу раньше всех только из-за номера места);
 *  два броска на место (группа «любимые/остальные», раса в группе). Детерминирован от seed. */
export async function drawRaces(seed: string, seats: DrawSeat[], cfg: Partial<DrawCfg> = {}): Promise<{ races: Race[]; rolls: DrawRoll[]; order: number[] }> {
  const C = { ...DRAW_DEFAULT, ...cfg }, wf = Math.max(0, +C.fav || 0), wo = Math.max(0, +C.other || 0);
  const taken: (Race | null)[] = seats.map(() => null), rolls: DrawRoll[] = [];
  const key = await Promise.all(seats.map((_, i) => roll(seed, 1000 + i))), order = seats.map((_, i) => i).sort((a, b) => key[a] - key[b] || a - b);
  for (const s of order) {
    const pool = allowed(seats, s, taken), fav = cleanFav(seats[s].fav, C.favMax).filter((r) => pool.includes(r)), oth = pool.filter((r) => !fav.includes(r));
    const r1 = await roll(seed, 2 * s), r2 = await roll(seed, 2 * s + 1);
    const pFav = !fav.length ? 0 : !oth.length ? 1 : wf + wo > 0 ? wf / (wf + wo) : 0.5;
    const useFav = r1 < pFav, grp = useFav ? fav : oth, race = grp[Math.floor(r2 * grp.length)];
    taken[s] = race; rolls.push({ seat: s, race, fromFav: useFav, roll: +r1.toFixed(6), pool, favPool: fav });
  }
  return { races: taken as Race[], rolls, order } as any;
}
