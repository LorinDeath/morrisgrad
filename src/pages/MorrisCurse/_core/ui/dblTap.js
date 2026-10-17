// Двойной клик (ПК) / двойной тап (телефон) по клетке окна добычи. Своя проверка по времени, а не событие dblclick:
// на телефонах dblclick ненадёжен, а между кликами сетка может перерисоваться (обновление сундука) — сравниваем по lid.
// Время берём по НАЖАТИЮ (pointerdown): на медленном телефоне click приходит с задержкой, и интервал между click «плывёт».
export const TOUCH = (() => { try { return matchMedia('(hover: none) and (pointer: coarse)').matches || /Android|iPhone|iPad|iPod/i.test(navigator.userAgent); } catch (_) { return false; } })();
export const DBL_MS = 450;
export const TAKE_HINT = TOUCH ? 'Двойной тап по предмету — забрать (по одному)' : 'Двойной клик или Shift + клик — забрать предмет (по одному)';
/** запомнить момент нажатия на клетку (вешать на pointerdown) */
export function markDown(owner, lid) { owner.__down = { lid, at: performance.now() }; }
/** true, если это второй клик по тому же lid за DBL_MS (состояние — в owner.__tap / owner.__down) */
export function isDblTap(owner, lid) {
  const d = owner.__down, now = d && d.lid === lid ? d.at : performance.now(), t = owner.__tap;
  if (t && t.lid === lid && now - t.at <= DBL_MS) { owner.__tap = null; return true; }
  owner.__tap = { lid, at: now }; return false;
}
