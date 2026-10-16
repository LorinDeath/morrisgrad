// Шанс в процентах для показа: до 3 значащих цифр, без хвостовых нулей и «мусора» плавающей точки
// (0.35000000000000003 → «0.35», 0.0014 → «0.0014», 12.3456 → «12.3», 100 → «100»). Точка — как и в остальных числах интерфейса.
export function fmtPct(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return '?';
  if (n === 0) return '0';
  const a = Math.abs(n), s = a >= 100 ? Math.round(n) : Number(n.toPrecision(3));
  return String(s).includes('e') ? s.toFixed(Math.min(20, 2 - Math.floor(Math.log10(a)))).replace(/\.?0+$/, '') : String(s);
}
/** Число для поля ввода (админка): без мусора плавающей точки, точность сохраняется (6 значащих). */
export const cleanNum = (v) => (Number.isFinite(Number(v)) ? Number(Number(v).toPrecision(6)) : v);
