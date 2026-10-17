// Конфиг «Зачарования» с сервера (meta_state.ench = ENCH из админки «✦ Зачарование»). Только отображение:
// цвета, имена ярусов, множители для подписей статов. Ярус экземпляра (it.ench) ставит только сервер.
import { ENCH, enchStats } from '../../../../../server/meta/enchant.ts';
export { ENCH, enchStats };
export function setEnch(c) {
  if (!c || typeof c !== 'object') return;
  for (const k of ['on', 'comboPct', 'cursedRegen', 'dropLower']) if (c[k] != null) ENCH[k] = c[k];
  if (Array.isArray(c.tiers)) c.tiers.forEach((t, i) => { if (ENCH.tiers[i] && t && typeof t === 'object') Object.assign(ENCH.tiers[i], t); });
}
/** ярус 1…6 из экземпляра/записи ({ench}|{e}|число), иначе 0 */
export function tierOf(x) { const n = Number(typeof x === 'object' && x ? (x.ench ?? x.e) : x); return Number.isInteger(n) && n >= 1 && n <= 6 ? n : 0; }
export const enchColor = (n) => ENCH.tiers[n - 1]?.color || '#ffffff';
const lum = (hex) => { const m = /^#?([0-9a-f]{6})$/i.exec(hex || ''); if (!m) return 1; const v = parseInt(m[1], 16); return (0.2126 * (v >> 16 & 255) + 0.7152 * (v >> 8 & 255) + 0.0722 * (v & 255)) / 255; };
export const isDark = (n) => lum(enchColor(n)) < 0.18;
/** цвет текста яруса: тёмный (Чёрный) — светлый текст на чёрном */
export const enchText = (n) => (isDark(n) ? '#f4f4f5' : enchColor(n));
export const enchName = (n) => String(ENCH.tiers[n - 1]?.name || '');
/** «Легендарная» (вещь), «легендарный» (приставка) */
export const enchFem = (n) => enchName(n).replace(/(ый|ий|ой)$/u, 'ая');
export function enchRGB(n) { const m = /^#?([0-9a-f]{6})$/i.exec(enchColor(n)); const v = m ? parseInt(m[1], 16) : 0xffffff; return [(v >> 16 & 255) / 255, (v >> 8 & 255) / 255, (v & 255) / 255]; }
/** классы рамки: cursed / ench eN / czen (проклятая+зачарованная — переливы) / dark (Чёрный — глитч) */
export function lookCls(cursed, n) { return `${cursed ? ' cursed' : ''}${n ? ` ench e${n}` : ''}${cursed && n ? ' czen' : ''}${n && (n === 6 || isDark(n)) ? ' glitch' : ''}`; }
export const lookStyle = (n) => (n ? `--ec:${enchColor(n)};--et:${enchText(n)};` : '');
export const enchBadge = (n) => (n ? `<b class="ez" style="--et:${enchText(n)}">✦ ${enchFem(n).replace(/[<>&"]/g, '')}</b>` : '');
/** имя с приставкой: «Проклятый легендарный шлем» */
export function lookName(name, cursed, n) {
  const low = (s) => s.charAt(0).toLowerCase() + s.slice(1);
  let nm = String(name || '');
  if (n) nm = enchName(n) + ' ' + low(nm);
  if (cursed) nm = 'Проклятый ' + low(nm);
  return nm;
}
