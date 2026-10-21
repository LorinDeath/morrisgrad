// Графика пропсов (админка «🖼 Графика», server/meta/gfxCfg.ts → снимок d.gfx → setGfxCfg).
// Живые поля (fpsMul, glow, lt, em, arena3 — со следующей арены) применяются сразу; выбор листов (props3Pc/props3Mobile, pack16, packGlow, lightSprites) делается
// при загрузке страницы, поэтому последние значения кэшируются в localStorage и действуют со следующей загрузки. ?props=2|3 — принудительно.
import { TEX_MODE, texDefault } from '../worlds/texPref.js';
import FB from '../../../../assets/mc/props3/fallback_v2.json';
import { PROPS_META } from '../../../../../server/meta/propsV2.ts';
const KEY = 'mc_gfx';
const LT = ['warm', 'fire', 'cool', 'violet', 'lime', 'portal'];
const lt = () => ({ haloS: 1, haloK: 1, poolS: 1, poolK: 1 });
export const GFX = { props3Pc: true, props3Mobile: false, pack16: false, packGlow: true, lightSprites: true, fallbackV2: true, arena3: false, fpsMul: 1, glow: 1,
  lt: Object.fromEntries(LT.map((t) => [t, lt()])), em: { v3: {}, v2: {} } };
const LOAD_KEYS = ['props3Pc', 'props3Mobile', 'pack16', 'packGlow', 'lightSprites', 'fallbackV2'];
const cl = (v, a, b, d) => { const n = Number(v); return Number.isFinite(n) ? Math.max(a, Math.min(b, n)) : d; };
/** живые множители — общие uniform-объекты SpriteBatch пропсов (propAtlas.js) */
export const PROP_FPS = { value: 1 }, PROP_GLOW = { value: 1 };
function applyLive(c) {
  if (c.fpsMul != null) GFX.fpsMul = cl(c.fpsMul, 0.25, 3, 1);
  if (c.glow != null) GFX.glow = cl(c.glow, 0, 3, 1);
  if (c.lt && typeof c.lt === 'object') for (const t of LT) { const o = c.lt[t]; if (o) GFX.lt[t] = { haloS: cl(o.haloS, 0.2, 3, 1), haloK: cl(o.haloK, 0, 3, 1), poolS: cl(o.poolS, 0.2, 3, 1), poolK: cl(o.poolK, 0, 3, 1) }; }
  if (c.em && typeof c.em === 'object') for (const s of ['v3', 'v2']) { const m = c.em[s]; if (m && typeof m === 'object') GFX.em[s] = Object.fromEntries(Object.entries(m).map(([k, o]) => [k, { x: cl(o?.x, -1, 128, -1), y: cl(o?.y, -1, 128, -1) }])); }
  if (typeof c.arena3 === 'boolean') GFX.arena3 = c.arena3;
  PROP_FPS.value = GFX.fpsMul; PROP_GLOW.value = GFX.glow;
}
try { const v = JSON.parse(localStorage.getItem(KEY) || 'null'); if (v && typeof v === 'object') { for (const k of LOAD_KEYS) if (typeof v[k] === 'boolean') GFX[k] = v[k]; applyLive(v); } } catch (_) {}
export const GFX_NEXT = { value: null };
/** снимок сервера: живые поля — сразу, поля загрузки — в кэш (со следующей загрузки страницы) */
export function setGfxCfg(c) {
  if (!c || typeof c !== 'object') return;
  applyLive(c);
  const next = {}; for (const k of LOAD_KEYS) next[k] = typeof c[k] === 'boolean' ? c[k] : GFX[k];
  try { localStorage.setItem(KEY, JSON.stringify({ ...next, arena3: GFX.arena3, fpsMul: GFX.fpsMul, glow: GFX.glow, lt: GFX.lt, em: GFX.em })); } catch (_) {}
  GFX_NEXT.value = next;
}
export function propsQuery() { try { const q = location.search.match(/[?&]props=(2|3)/); return q ? q[1] : null; } catch (_) { return null; } }
export const IS_MOBILE = texDefault() === '16';
/** набор пропсов этой загрузки страницы: 'v3' — «Текстуры: Новые (32)» и админка разрешила props3 для платформы; иначе 'v2'. ?props=2|3 — принудительно */
export const PROP_SET = (() => { const q = propsQuery(); if (q) return q === '3' ? 'v3' : 'v2'; return TEX_MODE === '32' && (IS_MOBILE ? GFX.props3Mobile : GFX.props3Pc) ? 'v3' : 'v2'; })();
/** набор пропсов арены забега: props3 (замены 3D-мешей спрайтами x64) только при GFX.arena3 (админка, по умолчанию выкл) и v3 на странице;
 *  ?arena=2|3 — принудительно (плейтесты). Только отрисовка: механика, баланс, спавн и коллизии забега не зависят от набора */
export function arenaSet() { try { const q = location.search.match(/[?&]arena=(2|3)/); if (q) return q[1] === '3' && PROP_SET === 'v3' ? 'v3' : 'v2'; } catch (_) {} return GFX.arena3 && PROP_SET === 'v3' ? 'v3' : 'v2'; }
// Откат отдельных ключей на props2 при props3 (assets/mc/props3/fallback_v2.json; админка «🖼 Графика» → fallbackV2 выключает откат):
// пока Художник не перерисовал портал v3. Размеры в метрах одинаковы, поэтому v2 рисуется в своём масштабе 10 px/м без пересчёта.
export const FALLBACK_V2 = new Set(FB.keys || []);
/** набор листов, из которого рисуется ключ (алиасы — как в атласе: «mesh:makePortal» → portal): set, но 'v2' для ключей из fallback_v2.json при v3 */
export function propSetFor(k, set = PROP_SET) { const a = PROPS_META.aliases[k] || k; return set === 'v3' && GFX.fallbackV2 && (FALLBACK_V2.has(a) || FALLBACK_V2.has(a.replace(/_\d+$/, ''))) ? 'v2' : set; }
/** масштаб спрайта портала мира (models.js makePortal) — им же масштабируется точка излучения в atmosphere.js */
export const PORTAL_S = 0.75;
