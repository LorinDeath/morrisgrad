// Точка излучения света у спрайта (emitter) — ОДИН модуль на весь клиент: мир (atmosphere.js — ореолы/пятна/PointLight),
// маска ночи (dayNight.js), город (cityView.js — ореолы фонарей, окна/двери). Ветка props3 (light_* спрайты Художника) берёт
// отсюда же: lightEmitter(key, frame) → где огонь у спрайта.
//
// Данные: assets/mc/light_emitters.json (tools/light-emitters/gen.py) — центроид светящихся пикселей *_glow листа
// (вес = альфа × яркость) на ключ и кадр; px спрайта от якоря низ-центр, ex вправо, ey ВВЕРХ. Здания — spots: окна/двери.
// Поверх — таблица правок (админка «Огни» → emitters; JSON { "city:dm_lantern_pole": [ex, ey] | {ex, ey, f:[[ex,ey]...]} }).
import EMIT from '../../../../assets/mc/light_emitters.json';

const KEYS = EMIT.keys || {};
let OVR = {};
/** правки якорей (админка): { "set:key" | "key": [ex, ey] | { ex, ey, f } } */
export function setEmitterOverrides(o) { OVR = o && typeof o === 'object' ? o : {}; }
export const emitterOverrides = () => OVR;

/** запись emitter'а по ключу: set — 'city' | 'world' (без набора — сначала city, потом world) */
export function emitterDef(key, set = null) {
  const k = String(key || '');
  const id = k.includes(':') ? k : set ? `${set}:${k}` : KEYS[`city:${k}`] ? `city:${k}` : `world:${k}`;
  return KEYS[id] ? { id, ...KEYS[id] } : null;
}
/** якорь в px спрайта [ex, ey] (от низа-центра, ey вверх); frame — кадр анимации (null — средний по кадрам). Правки админки — поверх */
export function lightEmitter(key, frame = null, set = null) {
  const d = emitterDef(key, set); const id = d?.id || String(key);
  const o = OVR[id] ?? OVR[String(key).replace(/^\w+:/, '')];
  if (o != null) {
    if (Array.isArray(o) && o.length >= 2) return [Number(o[0]) || 0, Number(o[1]) || 0];
    if (frame != null && Array.isArray(o.f) && o.f[frame % o.f.length]) return o.f[frame % o.f.length].map(Number);
    if (Number.isFinite(+o.ex) && Number.isFinite(+o.ey)) return [+o.ex, +o.ey];
  }
  if (!d) return null;
  if (frame != null && d.f?.length) { const f = d.f[frame % d.f.length]; if (f) return f; }
  return d.e;
}
/** смещение огня в метрах ПЛОСКОСТИ спрайта: [вправо, вверх] — для спрайта ширины wM × высоты hM (как он нарисован,
 *  с учётом своего масштаба по высоте, напр. SIN_P у города); flip — зеркальный спрайт (смещение зеркалится) */
export function emitterOffsetM(key, { wM, hM, s = 1, sy = 1, flip = false, frame = null, set = null } = {}) {
  const d = emitterDef(key, set), e = lightEmitter(key, frame, set); if (!d || !e) return null;
  if (wM == null) wM = (d.m?.[0] ?? d.w / 10) * s; if (hM == null) hM = (d.m?.[1] ?? d.h / 10) * s * sy; // sy — сжатие высоты при отрисовке (город: SIN_P)
  return [(flip ? -1 : 1) * e[0] * (wM / d.w), e[1] * (hM / d.h)];
}
/** окна/двери здания: [[вправо м, вверх м, вес]...] — крупные пятна glow (min px), не больше max */
export function emitterSpotsM(key, { wM, hM, flip = false, set = 'city', min = 6, max = 8 } = {}) {
  const d = emitterDef(key, set); if (!d?.spots) return [];
  return d.spots.filter((s) => s[2] >= min).sort((a, b) => b[2] - a[2]).slice(0, max).map((s) => [(flip ? -1 : 1) * s[0] * (wM / d.w), s[1] * (hM / d.h), s[2]]);
}

// ——— базис камеры: точка спрайта в мире = основание + right·dx + up·dy (спрайты повёрнуты к камере) ———
const BASIS = { rx: 1, ry: 0, rz: 0, ux: 0, uy: Math.cos(1.02), uz: -Math.sin(1.02), vx: 0, vy: -Math.sin(1.02), vz: -Math.cos(1.02) };
/** раз в кадр: оси камеры (right/up/view) — из её кватерниона */
export function setEmitterCamera(camera) {
  if (!camera?.quaternion) return; const q = camera.quaternion, x = q.x, y = q.y, z = q.z, w = q.w;
  BASIS.rx = 1 - 2 * (y * y + z * z); BASIS.ry = 2 * (x * y + w * z); BASIS.rz = 2 * (x * z - w * y);
  BASIS.ux = 2 * (x * y - w * z); BASIS.uy = 1 - 2 * (x * x + z * z); BASIS.uz = 2 * (y * z + w * x);
  BASIS.vx = -2 * (x * z + w * y); BASIS.vy = -2 * (y * z - w * x); BASIS.vz = -(1 - 2 * (x * x + y * y));
}
export const emitterBasis = () => BASIS;
/** мировая точка огня (x0, y0, z0 — основание спрайта; off — emitterOffsetM); back — на сколько м «за» спрайт (ореол позади) */
export function emitterWorld(x0, y0, z0, off, back = 0, out = [0, 0, 0]) {
  const B = BASIS, a = off?.[0] || 0, b = off?.[1] || 0;
  out[0] = x0 + B.rx * a + B.ux * b + B.vx * back; out[1] = y0 + B.ry * a + B.uy * b + B.vy * back; out[2] = z0 + B.rz * a + B.uz * b + B.vz * back;
  return out;
}
/** пятно на земле — прямо под огнём: смещение только «вправо» по земле (спрайт стоит в плоскости основания) */
export function emitterGround(x0, z0, off, out = [0, 0]) { const a = off?.[0] || 0; out[0] = x0 + BASIS.rx * a; out[1] = z0 + BASIS.rz * a; return out; }
