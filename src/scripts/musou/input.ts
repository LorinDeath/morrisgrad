// Стик и взгляд. Без DOM, чтобы правило скорости можно было прогнать тестом.
// Полный вылет стика — длина radius. Внутри мёртвой зоны шага нет.
// Дальше длина растёт от 0 до 1, направление уже единичное: диагональ не быстрее прямого.

export function stickVector(dx: number, dy: number, radius: number) {
  const L = Math.hypot(dx, dy);
  const r = Math.max(8, radius);
  const dead = r * 0.16;
  if (L <= dead || L === 0) return { x: 0, y: 0 };
  const mag = Math.min(1, (L - dead) / (r - dead));
  return { x: (dx / L) * mag, y: (dy / L) * mag };
}

export function clampMove(x: number, y: number) {
  const L = Math.hypot(x, y);
  if (L <= 1 || L === 0) return { x, y };
  return { x: x / L, y: y / L };
}

/** Мышь или второй палец держат взгляд. Иначе тело смотрит туда, куда идёт шаг. */
export function travelAim(mx: number, my: number, pointerAim: number, look: boolean) {
  if (look) return pointerAim;
  if (Math.hypot(mx, my) > 0.12) return Math.atan2(my, mx);
  return pointerAim;
}
