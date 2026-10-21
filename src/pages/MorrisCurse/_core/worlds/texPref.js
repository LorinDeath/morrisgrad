// Настройка игрока «Текстуры: новые (32) / старые (16)» — на этом устройстве (localStorage), применяется после перезагрузки.
// По умолчанию: ПК — новые 32-px тайлсеты, телефон — старые 16 (канвасы земли при 32 px в 4 раза больше по памяти).
// Индексы тайлов у 16 и 32 одинаковы (0…62; у 32 ещё shore_in_* 63–66), сервер раскладывает по общему индексу.
// Забег (survivors/arena.js) не трогаем — там всегда прежние 16 px.
import t16Main from '../../../../assets/mc/tiles_atlas.png';
import t16Meta from '../../../../assets/mc/tiles_atlas.json';
import t16Ice from '../../../../assets/mc/tiles_ice.png';
import t16Fire from '../../../../assets/mc/tiles_fire.png';
import t16Stone from '../../../../assets/mc/tiles_stone.png';
import t16Air from '../../../../assets/mc/tiles_air.png';
import t32Main from '../../../../assets/mc/tiles32_atlas.png';
import t32Meta from '../../../../assets/mc/tiles32_atlas.json';
import t32Ice from '../../../../assets/mc/tiles32_ice.png';
import t32Fire from '../../../../assets/mc/tiles32_fire.png';
import t32Stone from '../../../../assets/mc/tiles32_stone.png';
import t32Air from '../../../../assets/mc/tiles32_air.png';

export const TEX_KEY = 'mc_tex';
const isMobile = () => { try { const ua = navigator.userAgent || ''; return /Mobi|Android|iPhone|iPad/i.test(ua) || (navigator.maxTouchPoints > 1 && matchMedia('(pointer: coarse)').matches) || /[?&]mobile=1/.test(location.search); } catch (_) { return false; } };
// по умолчанию — из админки «Интерфейс → Текстуры по умолчанию» (uiSkin.setUiCfg кладёт в localStorage mc_tex_def), иначе ПК 32 / телефон 16
export function texDefault() {
  const mob = isMobile();
  try { const d = JSON.parse(localStorage.getItem('mc_tex_def') || 'null'); const v = d && (mob ? d.mob : d.pc); if (v === '16' || v === '32') return v; } catch (_) {}
  return mob ? '16' : '32';
}
export function texPref() {
  try { const q = location.search.match(/[?&]tex=(16|32)/); if (q) return q[1]; const v = localStorage.getItem(TEX_KEY); if (v === '16' || v === '32') return v; } catch (_) {}
  return texDefault();
}
export function setTexPref(v) { try { localStorage.setItem(TEX_KEY, v === '16' ? '16' : '32'); } catch (_) {} }
// активный набор на эту загрузку страницы (не меняется до перезагрузки — канвасы уже запечены)
export const TEX_MODE = texPref();
const SETS = {
  '16': { meta: t16Meta, main: t16Main, sheets: [t16Main, t16Ice, t16Fire, t16Stone, t16Air] },
  '32': { meta: t32Meta, main: t32Main, sheets: [t32Main, t32Ice, t32Fire, t32Stone, t32Air] },
};
export const TILES = SETS[TEX_MODE] || SETS['16'];
