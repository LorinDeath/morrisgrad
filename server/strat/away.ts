// «Игрок не за столом» (ТЗ §14.K): обрыв связи НЕ заканчивает партию. Ход отсутствующего пропускается сам по лимиту хода,
// запаса времени больше нет. После 5 подряд авто-пропусков отсутствующего соперник может «Забрать победу» (reason "claim").
export const AWAY_CFG = {
  // лимит одного хода (минуты) по стороне поля; между опорами — линейно; от 50 и выше — 30. Админ меняет через cfg.turnMinutes.
  anchors: [[4, 1], [5, 2], [8, 3], [10, 5], [15, 15], [30, 20], [50, 30]] as [number, number][],
  claimAfter: 5,              // подряд пропущенных ходов отсутствующего игрока
  hostMin: 1, hostMax: 60,    // переопределение хостом (минуты); в рейтинговой — только по умолчанию
};
/** лимит хода в минутах для стороны поля n (интерполяция по опорам) */
export function turnMinutes(n: number, anchors: [number, number][] = AWAY_CFG.anchors): number {
  const a = [...anchors].sort((x, y) => x[0] - y[0]);
  if (n <= a[0][0]) return a[0][1]; if (n >= a[a.length - 1][0]) return a[a.length - 1][1];
  for (let i = 1; i < a.length; i++) if (n <= a[i][0]) { const [x0, y0] = a[i - 1], [x1, y1] = a[i]; return Math.round((y0 + ((n - x0) * (y1 - y0)) / (x1 - x0)) * 10) / 10; }
  return a[a.length - 1][1];
}
/** валидный ввод хоста: null — по умолчанию; число 1–60; иначе undefined (ошибка) */
export function validTurnMin(v: unknown): number | null | undefined {
  if (v === null || v === "default") return null; const n = Number(v);
  return Number.isFinite(n) && n >= AWAY_CFG.hostMin && n <= AWAY_CFG.hostMax ? Math.round(n * 10) / 10 : undefined;
}
/** можно ли «Забрать победу»: соперник не за столом и пропустил claimAfter ходов подряд */
export const canClaim = (oppAway: boolean, oppSkips: number, C = AWAY_CFG) => oppAway && oppSkips >= C.claimAfter;
