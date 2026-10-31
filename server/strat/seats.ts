// Режимы 2×2 и «Все ×3…×8» (t1219): места, команды, порядок ходов. 1×1 — частный случай (np=2, команда = место).
// Совместимость: у старых партий/повторов полей np/tm/out нет → два места, каждое — своя команда, ничья = 2.
export type ModeId = "1v1" | "2v2" | "ffa3" | "ffa4" | "ffa6" | "ffa8";
export const MODES: Record<ModeId, { seats: number; teams: number; name: string }> = {
  "1v1": { seats: 2, teams: 2, name: "1×1" },
  "2v2": { seats: 4, teams: 2, name: "2×2" },
  ffa3: { seats: 3, teams: 3, name: "Все ×3" },
  ffa4: { seats: 4, teams: 4, name: "Все ×4" },
  ffa6: { seats: 6, teams: 6, name: "Все ×6" },
  ffa8: { seats: 8, teams: 8, name: "Все ×8" },
};
export const MODE_IDS = Object.keys(MODES) as ModeId[];
export const isMode = (m: unknown): m is ModeId => typeof m === "string" && (MODE_IDS as string[]).includes(m);
/** команда места: 2×2 — места [A1,B1,A2,B2] → i%2 (ход A1→B1→A2→B2); 1×1/FFA — каждый сам за себя */
export const teamsFor = (mode: ModeId): number[] => Array.from({ length: MODES[mode].seats }, (_, i) => (mode === "2v2" ? i % 2 : i));
/** режимы, в которые годится карта с n точками спавна (карта на 4 точки — и 2×2, и «Все ×4») */
export const modesForSpawns = (n: number): ModeId[] => MODE_IDS.filter((m) => MODES[m].seats === n);

type G = { np?: number; tm?: number[]; out?: number[]; first?: number; cur?: number; winner?: number };
export const NP = (g: G) => g.np || 2;
export const teamOf = (g: G, s: number) => (g.tm ? g.tm[s] ?? s : s);
export const seatList = (g: G) => Array.from({ length: NP(g) }, (_, i) => i);
export const isOut = (g: G, s: number) => !!g.out?.includes(s);
/** a и b — соперники (разные команды; -1 — нейтраль, не соперник) */
export const foe = (g: G, a: number, b: number) => a !== b && a >= 0 && b >= 0 && teamOf(g, a) !== teamOf(g, b);
export const ally = (g: G, a: number, b: number) => a >= 0 && b >= 0 && teamOf(g, a) === teamOf(g, b);
export const foesOf = (g: G, s: number) => seatList(g).filter((o) => foe(g, s, o) && !isOut(g, o));
export const alliesOf = (g: G, s: number) => seatList(g).filter((o) => o !== s && ally(g, s, o));
export const teamSeats = (g: G, t: number) => seatList(g).filter((s) => teamOf(g, s) === t);
export const teamList = (g: G) => [...new Set(seatList(g).map((s) => teamOf(g, s)))];
/** код ничьей: ≤2 команд — 2 (как раньше), FFA — 100 (номера команд 0…7 заняты местами) */
export const drawCode = (g: G) => (teamList(g).length > 2 ? 100 : 2);
export const isDraw = (g: G, w = g.winner) => w === drawCode(g);
/** место выиграло (winner — номер команды) */
export const seatWon = (g: G, s: number, w = g.winner) => w !== undefined && w >= 0 && !isDraw(g, w) && teamOf(g, s) === w;
/** главный соперник для одиночных подсказок (1×1 — единственный; иначе первый живой по порядку ходов) */
export const mainFoe = (g: G, s: number) => { const f = foesOf(g, s); if (!f.length) return seatList(g).find((o) => foe(g, s, o)) ?? 1 - s; const n = NP(g); return f.sort((a, b) => ((a - s + n) % n) - ((b - s + n) % n))[0]; };
/** следующее место по кругу, пропуская выбывших */
export function nextSeat(g: G, prev: number): number {
  const n = NP(g); for (let k = 1; k <= n; k++) { const s = (prev + k) % n; if (!isOut(g, s)) return s; } return prev;
}
/** позиция места в круге хода (первый ходящий — 0): номер хода растёт, когда круг замкнулся */
export const roundPos = (g: G, s: number) => (s - (g.first || 0) + NP(g)) % NP(g);
/** массив длиной «мест» */
export const perSeat = <T>(g: G, f: (s: number) => T): T[] => seatList(g).map(f);
