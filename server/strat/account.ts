// «Полководец» — уровень аккаунта сайта в «Партии Чёрных королей» (ТЗ §5.2). ЧИСТО КОСМЕТИКА: статус/рамка/звание.
// Никаких игровых бонусов (HP/АТК/броня/ОД/ресурсы): движок (rules/econ/ai) уровень аккаунта не читает — проверяется тестом.
// Поэтому «Честного боя» больше нет: рейтинговая партия = карта из рейтингового пула + стандартные настройки.
//
// Опыт = минуты АКТИВНОГО времени партии (время своих ходов, каждый ход — не больше лимита хода; авто-пропуски
// и «не за столом» = 0) × итог (победа ×1,2 / ничья ×1,0 / поражение ×0,8; при 50% побед в среднем ×1,0) × xpMul
// (ранний конец, боты — rating.ts). Значит, 1 XP ≈ 1 минута игры.
//
// Определения для расчёта времени:
//  • «непрерывная игра» — 24 ч × 7 дн. фактического времени в партиях, 50% побед (1 440 XP в сутки);
//  • «активный игрок» — 2 ч игры в день (120 XP в сутки).
// Кривая: cum(L) = a·(L−1)² + A·(e^{k(L−1)} − 1). Квадратичная часть делает первые уровни быстрыми
// (L5 ≈ 2 ч, L10 ≈ 10 ч), экспонента — крутой конец. Подобрана так, что:
//  • L100 = 15 лет непрерывной игры (7 889 400 XP);
//  • L65 → L66 у активного игрока ≈ 30 дней (событие).
export const ACCOUNT_CFG = {
  maxLevel: 100,
  perDayContinuous: 1440, perDayActive: 120,
  totalXp: Math.round(15 * 365.25 * 1440), // 7 889 400
  a: 600 / 81,                           // cum(10) = 600 XP = 10 ч
  k: 0.1823518029936696, A: 0.11292372814719889,
  result: { win: 1.2, draw: 1.0, loss: 0.8 },
  perMatchCap: 600,                      // не больше 10 ч активного времени за одну партию (100×100 FFA)
};
type AC = typeof ACCOUNT_CFG;
/** всего XP, нужного для уровня L (L1 = 0) */
export function xpForLevel(L: number, C: AC = ACCOUNT_CFG): number {
  if (L <= 1) return 0; if (L >= C.maxLevel) return C.totalXp;
  return Math.round(C.a * (L - 1) ** 2 + C.A * (Math.exp(C.k * (L - 1)) - 1));
}
export const LEVEL_XP: number[] = Array.from({ length: ACCOUNT_CFG.maxLevel + 1 }, (_, L) => xpForLevel(L));
/** уровень по накопленному опыту (1…100) */
export function levelOf(xp: number, C: AC = ACCOUNT_CFG): number {
  let L = 1; while (L < C.maxLevel && xp >= xpForLevel(L + 1, C)) L++; return L;
}
/** прогресс для профиля: уровень, XP до следующего, доля */
export function levelInfo(xp: number, C: AC = ACCOUNT_CFG) {
  const lv = levelOf(xp, C), lo = xpForLevel(lv, C), hi = lv >= C.maxLevel ? lo : xpForLevel(lv + 1, C);
  return { level: lv, xp, next: hi, frac: hi > lo ? (xp - lo) / (hi - lo) : 1 };
}
/** опыт за партию: активные минуты × итог × xpMul (rating.ts: ранний конец 0/0,25/1, бот ×0,25 и ≤3 в сутки) */
export function matchXp(activeMs: number, result: "win" | "draw" | "loss", mul: number, C: AC = ACCOUNT_CFG): number {
  const min = Math.min(C.perMatchCap, Math.max(0, activeMs) / 60000);
  return Math.floor(min * C.result[result] * Math.max(0, mul));
}
/** дней до уровня при данном темпе (XP/сутки) — для ТЗ/админки */
export const daysTo = (L: number, perDay: number) => xpForLevel(L) / perDay;
