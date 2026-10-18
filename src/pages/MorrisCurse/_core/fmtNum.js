// Читаемые большие числа (ОЗ мобов без верхнего предела): до миллиона — с пробелами (1 794 143),
// дальше — «12.3 млн», «4.5 млрд», «7.8 трлн», ещё больше — «1.2e15».
const UNITS = [[1e12, 'трлн'], [1e9, 'млрд'], [1e6, 'млн']];
export function fmtBig(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return String(v ?? '-');
  const a = Math.abs(n);
  if (a >= 1e15) return n.toExponential(1).replace('+', '');
  for (const [k, u] of UNITS) if (a >= k) { const x = n / k; return `${x >= 100 ? Math.round(x) : Math.round(x * 10) / 10} ${u}`; }
  return Math.round(n).toLocaleString('ru-RU').replace(/\u00a0/g, ' ');
}
