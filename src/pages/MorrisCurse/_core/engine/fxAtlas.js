// FX atlas v3 «fx30» (Художник, 2026-10-17: те же 93 ключа и псевдонимы, что в fx2, перерисованы по 30 кадров; assets/mc/fx30/README.md) — ЕДИНЫЙ источник спрайтов снарядов,
// попаданий, статусов, телеграфов, меток и навыковых эффектов для мира, забегов, дуэлей и хаба.
// 7 листов с равномерной сеткой (s32, s64, w64, t32, a96, r128, c128): на каждый лист и вид смешивания — свой ProjBatch
// (батч создаётся лениво при первом использовании), плюс один аддитивный батч мягкого ореола (glow из json).
// Ключ → keys[key].anims[anim] = {sheet,x,y,w,h,frames,fps,loop,fps_match_original_timing}; псевдонимы старых ключей — aliases.
// Раскладка v3: одна строка листа на пару (ключ, анимация), 30 кадров вправо от (x,y). Кадр выбирается по времени
// (floor(t·fps)), поэтому 30 кадров не прореживаем: fps = fps_match_original_timing — длительность ровно как у fx2
// (удары/касты/взрывы 52–120 к/с → прежние 0,25–0,5 с; ауры/статусы/круги — цикл, обычно 30 к/с).
// anchor [ax, ay]: точка привязки внутри кадра (0..1, x вдоль направления, y сверху вниз) — центр квада смещаем так,
// чтобы привязка попала в (x, z): луч/шлейф/конус начинаются в точке, метеор/копьё падают остриём в цель.
import { ProjBatch, glowTexture, GLOW } from './projBatch.js';
import { loadAtlasTexture } from './spriteBatch.js';
import META from '../../../../assets/mc/fx30/fx30_atlas.json';
import s32 from '../../../../assets/mc/fx30/fx30_s32.png';
import s64 from '../../../../assets/mc/fx30/fx30_s64.png';
import w64 from '../../../../assets/mc/fx30/fx30_w64.png';
import t32 from '../../../../assets/mc/fx30/fx30_t32.png';
import a96 from '../../../../assets/mc/fx30/fx30_a96.png';
import r128 from '../../../../assets/mc/fx30/fx30_r128.png';
import c128 from '../../../../assets/mc/fx30/fx30_c128.png';
// 🜏 «Чёрная магия»: эффекты стихий Художника (public/bm-art/fx, tools/bm-art/sync-ice.py) — свои листы, ключи как у Художника
// (ice_bolt, ice_hit, ice_arc, ice_release, ice_crit, ice_zero). У каждого — пара <key>_glow (аддитивно, рисуется вместе с базой).
import BM_FX from '../../../../../public/bm-art/fx/index.json';
// 🜏 листы НАВЫКОВ Художника (public/bm-art/fx/skills, tools/bm-art/sync-skills.py): ключ sk_<ключ>_<часть> (+ _glow аддитивно).
// Листы большие (до 2960 px) — грузятся ЛЕНИВО: при первом рисовании (или preloadSkillFx) — не на старте страницы.
import BM_SKILL_FX from '../../../../../public/bm-art/fx/skills/index.json';
export const SKILL_FX = BM_SKILL_FX;

const PX_PER_M0 = 20;
const url = (s) => (typeof s === 'object' && s !== null ? (s.src || s.default?.src || s.default || '') : s); // Astro: импорт PNG — объект с .src
const SRC = { s32: url(s32), s64: url(s64), w64: url(w64), t32: url(t32), a96: url(a96), r128: url(r128), c128: url(c128) };
for (const [k, d] of Object.entries(BM_FX || {})) registerBmFx(k, d);
/** лист эффекта стихии → META (лист + ключ + пара _glow). Снаряд (facing) — directional, дуга — на земле, остальное — к камере */
function registerBmFx(k, d) {
  if (!d || !Array.isArray(d.cell) || META.keys[k]) return;
  const [w, h] = d.cell, an = d.anchor || [w / 2, h / 2], mode = d.facing ? 'directional' : /_arc$/.test(k) ? 'ground' : 'billboard';
  for (const g of ['', '_glow']) {
    const sh = 'bmfx_' + k + g;
    META.sheets[sh] = { image: `${k}${g}.png`, frameW: w, frameH: h, cols: d.cols || 1, rows: d.rows || 1, bm: 1 };
    SRC[sh] = `/bm-art/fx/${k}${g}.png`;
    const anims = {};
    for (const [n, a] of Object.entries(d.anims || {})) anims[n] = { sheet: sh, x: 0, y: (a.row || 0) * h, w, h, frames: a.n || 1, fps: a.fps || 12, loop: !!a.loop };
    META.keys[k + g] = { blend: g ? 'additive' : 'normal', glow: g ? null : '#5fb8e8', mode, anchor: [an[0] / w, an[1] / h], size_m: Math.round((w / PX_PER_M0) * 0.9 * 100) / 100, tint: false, anims, elem: d.elem, bm: 1 };
  }
}
for (const [k, d] of Object.entries(BM_SKILL_FX?.keys || {})) for (const [pn, p] of Object.entries(d.parts || {})) registerSkillPart(k, pn, p, d);
function registerSkillPart(k, pn, p, d) {
  if (!Array.isArray(p.cell)) return;
  const [w, h] = p.cell, an = p.anchor || [w / 2, h / 2], key = `sk_${k}_${pn}`;
  for (const g of ['', '_glow']) {
    const sh = 'bmsk_' + k + '_' + pn + g, img = g ? p.glow : p.image;
    if (!img) continue;
    META.sheets[sh] = { image: img, frameW: w, frameH: h, cols: p.cols || 1, rows: p.rows || 1, bm: 1, lazy: 1 };
    SRC[sh] = `/bm-art/fx/skills/${img}`;
    const anims = {};
    for (const [n, a] of Object.entries(p.anims || {})) anims[n] = { sheet: sh, x: 0, y: (a.row || 0) * h, w, h, frames: a.n || 1, fps: a.fps || 12, loop: !!a.loop };
    // glow: null — без мягкого шара (свет уже в паре _glow); mode — directional (снаряд/хлыст/след), остальное к камере
    META.keys[key + g] = { blend: g ? 'additive' : 'normal', glow: null, mode: 'directional', anchor: [an[0] / w, an[1] / h], size_m: Math.round((w / PX_PER_M0) * 100) / 100, tint: false, anims, elem: d.elem, bm: 1, skill: 1, cellM: [w / PX_PER_M0, h / PX_PER_M0], layer: p.layer || 'above' };
  }
}
// снаряд стихии сам несёт попадание (projInfo берёт anims.hit): ice_bolt.hit = ice_hit
for (const g of ['', '_glow']) { const b = META.keys['ice_bolt' + g], hk = META.keys['ice_hit' + g]; if (b && hk) b.anims.hit = hk.anims.hit; }
export const FX_META = META;
export const PX_PER_M = 20; // «1 m = 20 px» (масштаб атласа = масштаб мира)
const hexRGB = (h) => { const n = parseInt(String(h).slice(1), 16); return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]; };
export const TELE_RGB = hexRGB('#dcd3e6'); // телеграфы нарисованы в этом нейтральном цвете — красим кодом
const missing = new Set();

// ключ (или старый псевдоним) → имя ключа v2; неизвестное — null (и одно предупреждение в консоль)
export function fxKey(k) {
  if (!k) return null;
  if (META.keys[k]) return k;
  const a = META.aliases[k];
  if (a && META.keys[a]) return a;
  if (!missing.has(k)) { missing.add(k); if (typeof console !== 'undefined') console.warn('[fx30] нет ключа', k); }
  return null;
}
export const fxMissing = () => [...missing];
if (typeof window !== 'undefined') window.__fxMissing = fxMissing; // для автотестов: ключи без спрайта

const DEFS = {};
// описание ключа: blend, glow (rgb|null), mode, anchor, size (м), tint, anims
export function fxDef(k) {
  const key = fxKey(k);
  if (!key) return null;
  if (DEFS[key]) return DEFS[key];
  const d = META.keys[key];
  return (DEFS[key] = { key, pair: d.bm && META.keys[key + '_glow'] ? key + '_glow' : null, add: d.blend === 'additive', glow: d.glow ? hexRGB(d.glow) : null, mode: d.mode, anchor: d.anchor || [0.5, 0.5], size: d.size_m || 1.3, tint: !!d.tint, anims: animsOf(d.anims) });
}
// анимации ключа: ячейка из пиксельных x/y (раскладка v3), fps под исходную длительность
function animsOf(src) {
  const out = {};
  for (const [name, a] of Object.entries(src)) {
    const S = META.sheets[a.sheet];
    out[name] = { sheet: a.sheet, col: Math.round(a.x / S.frameW), row: Math.round(a.y / S.frameH), frames: a.frames, fps: a.fps_match_original_timing || a.fps, loop: !!a.loop };
  }
  return out;
}
// кадр анимации в момент t (сек); loop=false — держит последний кадр
export function fxFrame(an, t, loop = an.loop) {
  const f = Math.floor(Math.max(0, t) * an.fps);
  return loop ? f % an.frames : Math.min(an.frames - 1, f);
}
// длительность нецикличной анимации
export function fxDur(k, anim) { const d = fxDef(k), an = d?.anims[anim]; return an ? an.frames / an.fps : 0; }
export function fxAspect(an) { const s = META.sheets[an.sheet]; return s.frameW / s.frameH; }

// листы грузятся один раз на страницу (не на каждый экземпляр FxAtlas)
let texP = null;
const LAZY = {}; // лист → текстура (ленивые листы навыков; общие для всех FxAtlas)
const lazyP = {};
let THREE0 = null;
function lazySheet(sheet) {
  if (LAZY[sheet] || lazyP[sheet] || !THREE0) return LAZY[sheet] || null;
  lazyP[sheet] = loadAtlasTexture(THREE0, SRC[sheet]).then((t) => { LAZY[sheet] = t; }).catch((e) => { console.warn('[fx skills]', e.message); });
  return null;
}
/** заранее загрузить листы навыков: keys — ключи Художника (ember_whip…) или их части sk_*; без аргумента — ничего */
export function preloadSkillFx(keys = []) {
  for (const sh of Object.keys(META.sheets)) if (META.sheets[sh].lazy && keys.some((k) => sh.startsWith('bmsk_' + k.replace(/^sk_/, '')))) lazySheet(sh);
}
export const skillFxLoaded = () => Object.keys(LAZY);
if (typeof window !== 'undefined') window.__skillFxLoaded = skillFxLoaded; // для автотестов
function sharedTextures(THREE) {
  THREE0 = THREE0 || THREE;
  if (!texP) texP = Promise.all(Object.keys(META.sheets).filter((s) => !META.sheets[s].lazy).map((s) => loadAtlasTexture(THREE, SRC[s]).then((t) => [s, t]).catch((e) => { console.warn('[fx30]', e.message); return [s, null]; })))
    .then((a) => Object.fromEntries(a.filter((e) => e[1])));
  return texP;
}

export class FxAtlas {
  constructor(THREE, parent, { max = 900, glowMax = 900, order = 4 } = {}) {
    this.THREE = THREE; this.parent = parent; this.max = max; this.order = order;
    this.tex = {}; this.batches = {}; this.list = []; this.time = 0; this.ready = false;
    this.glow = new ProjBatch(THREE, glowTexture(THREE), { cols: 4, rows: 1, max: glowMax, additive: true, nearest: false, renderOrder: order - 1 });
    parent.add(this.glow.mesh);
    this.loading = sharedTextures(THREE).then((tex) => { this.tex = tex; this.ready = true; });
  }
  _batch(sheet, add) {
    const id = sheet + (add ? '+' : '');
    let b = this.batches[id];
    if (b) return b;
    const tex = this.tex[sheet] || (META.sheets[sheet]?.lazy ? LAZY[sheet] || lazySheet(sheet) : null);
    if (!tex) return null;
    // одна текстура на лист для обычного и аддитивного батча и для всех FxAtlas (хаб: ProjFx + ProjAtlasFx) —
    // фильтры одинаковые (Nearest), поэтому без clone(): каждый лист грузится в видеопамять один раз
    const S = META.sheets[sheet];
    b = new ProjBatch(this.THREE, tex, { cols: S.cols, rows: S.rows, max: this.max, additive: add, renderOrder: this.order + (add ? 1 : 0) });
    this.parent.add(b.mesh); this.list.push(b); this.batches[id] = b; b.begin();
    return b;
  }
  begin(dt = 0) { this.time += dt; this.glow.begin(); for (const b of this.list) b.begin(); }
  end() { this.glow.end(); for (const b of this.list) b.end(); }

  // Нарисовать кадр анимации anim ключа k в момент t.
  // (x,y,z) — точка привязки (anchor); w,h — метры; mode: 0 к камере, 1 к камере по направлению, 2 на земле по направлению;
  // rot — доп. поворот; (dx,dz) — направление; col — [r,g,b] тинт (для tint-ключей и телеграфов); a — прозрачность;
  // glowK — множитель ореола (0 — без ореола); loop — переопределить цикличность
  draw(k, anim, t, x, y, z, w, h, mode = 0, rot = 0, dx = 0, dz = 0, col = null, a = 1, glowK = 1, loop) {
    const d = fxDef(k); if (!d) return false;
    const an = d.anims[anim] || d.anims[Object.keys(d.anims)[0]];
    const B = this._batch(an.sheet, d.add);
    const [ax, ay] = d.anchor;
    // смещение центра квада от точки привязки: вдоль направления (x кадра) и вверх (y кадра; для билбордов — по высоте)
    const ox = (0.5 - ax) * w, oy = (ay - 0.5) * h;
    let cx = x, cy = y, cz = z;
    const L = Math.hypot(dx, dz);
    if (ox && mode >= 1 && L > 1e-4) { cx += dx / L * ox; cz += dz / L * ox; }
    if (oy && mode !== 2) cy += oy; // на земле поперечная привязка у всех ключей — 0.5
    const r = col ? col[0] : 1, g = col ? col[1] : 1, b = col ? col[2] : 1;
    if (glowK > 0 && d.glow) {
      const gs = Math.max(Math.abs(w), h) * 1.5;
      if (mode === 2) this.glow.push(cx, 0.05, cz, gs, gs, 2, 0, 0, 0, GLOW.ball, 0, d.glow[0], d.glow[1], d.glow[2], 0.45 * a * glowK);
      else this.glow.push(cx, cy, cz, gs, gs, 0, 0, 0, 0, GLOW.ball, 0, d.glow[0], d.glow[1], d.glow[2], 0.55 * a * glowK);
    }
    if (!B) return false;
    B.push(cx, cy, cz, w, h, mode, rot, dx, dz, an.col + fxFrame(an, t, loop ?? an.loop), an.row, r, g, b, a);
    if (d.pair) this.draw(d.pair, anim, t, x, y, z, w, h, mode, rot, dx, dz, null, a, 0, loop); // пара _glow листа Художника
    return true;
  }
  // Луч из 3 частей: start + mid×N (тайл) + end. (x,z) начало, (dx,dz) направление (единичное), len, width — м
  beam(prefix, t, x, y, z, dx, dz, len, width, col = null, a = 1, ground = false) {
    const st = fxDef(prefix + '_start') ? prefix + '_start' : null, md = prefix + '_mid', en = fxDef(prefix + '_end') ? prefix + '_end' : null;
    const mode = ground ? 2 : 1, cap = Math.min(width * 2, len * 0.3);
    let p = 0;
    if (st) { this.draw(st, 'loop', t, x, y, z, cap, width, mode, 0, dx, dz, col, a, 0.6); p = cap; }
    const mid = len - p - (en ? cap : 0);
    const n = Math.max(1, Math.round(mid / (width * 2))), sl = mid / n;
    for (let i = 0; i < n; i++) this.draw(md, 'loop', t + i * 0.07, x + dx * (p + i * sl), y, z + dz * (p + i * sl), sl * 1.02, width, mode, 0, dx, dz, col, a, i % 2 ? 0 : 0.5);
    if (en) this.draw(en, 'loop', t, x + dx * (len - cap), y, z + dz * (len - cap), cap, width, mode, 0, dx, dz, col, a, 0.6);
  }
  // Конус на земле. Художница рисует конус на 90° (вершина слева по центру, дуга радиусом до 124 px из 128)
  // и сжимает по вертикали CY=0.36, чтобы влезть в 128×64. Поэтому длину и ширину квада считаем ОТДЕЛЬНО:
  // длина = range·128/124, ширина такая, чтобы видимый раствор стал реальным углом ang (полный, рад):
  // 64 px кадра = 2·124·sin45°·0.36 px рисунка ⇒ ширина = range·sin(ang/2)·64/(124·sin45°·0.36).
  cone(k, anim, t, x, z, dx, dz, range, ang, col = null, a = 1) {
    const h = Math.min(Math.PI * 0.45, Math.max(0.05, ang / 2));
    const len = range * 128 / 124, wid = range * Math.sin(h) * 64 / (124 * Math.SQRT1_2 * 0.36);
    return this.draw(k, anim, t, x, 0.06, z, len, wid, 2, 0, dx, dz, col, a, 0.5);
  }
  dispose() { this.glow.dispose(); this.parent.remove(this.glow.mesh); for (const b of this.list) { b.dispose(); this.parent.remove(b.mesh); } }
}
