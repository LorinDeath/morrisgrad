// Конфиг проклятия с сервера (meta_state.curse = CURSE из админки, вкладка «Проклятие»). Только отображение:
// статы/урон решает сервер; в забеге (клиент-хост) — множитель навыка R для проклятого оружия.
export const CURSE = { statMult: 1.5, rsMult: 2, glow1: 0.3, glow2: 0.5, glow3: 0.65, glow4: 0.8, glow5: 1, tint: '#a855f7' };
export function setCurse(c) {
  if (!c || typeof c !== 'object') return;
  for (const k of Object.keys(CURSE)) if (c[k] != null) CURSE[k] = c[k];
}
/** яркость свечения по числу надетых проклятых (0..5); 5 — полный комплект */
export function glowK(n) { n = Math.max(0, Math.min(5, n | 0)); return n ? Number(CURSE['glow' + n]) || 0 : 0; }
/** цвет проклятия [r,g,b] 0..1 и 0xRRGGBB */
export function curseRGB() { const m = /^#?([0-9a-f]{6})$/i.exec(CURSE.tint || ''); const n = m ? parseInt(m[1], 16) : 0xa855f7; return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255]; }
export function curseHex() { const m = /^#?([0-9a-f]{6})$/i.exec(CURSE.tint || ''); return m ? parseInt(m[1], 16) : 0xa855f7; }
