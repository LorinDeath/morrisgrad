/** Сколько после победы можно забрать сундуки, прежде чем забег закроется. */
export const EXIT_MS = 10_000;

export function exitLeft(until: number, now: number) {
  if (!(until > 0)) return 0;
  return Math.max(0, Math.ceil((until - now) / 1000));
}

/** Повторное сообщение не сдвигает уже начатый отсчёт. */
export function armExitAt(now: number, existing: number | undefined, bossDown: boolean) {
  if (!bossDown) return existing || 0;
  if (existing && existing > 0) return existing;
  return now + EXIT_MS;
}

export function exitDue(until: number, now: number) {
  return until > 0 && now >= until;
}
