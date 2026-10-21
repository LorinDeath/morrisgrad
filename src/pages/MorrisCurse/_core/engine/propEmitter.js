// Точки излучения огней ПРОПСОВ props2/props3 (наборы v2/v3, по варианту и кадру). Город, мир и ночная маска — engine/lightEmitter.js.
// Точка излучения огня (фонарь — у головы фонаря, факел — у пламени, костёр — у огня), а не центр текстуры спрайта.
// Источник — центроид светящихся пикселей кадра *_glow (вес = яркость × альфа), посчитан по кадрам генератором
// tools/mc-sprites/light-emitters.mjs → assets/mc/prop_emitters.json (оба набора: v2 props2 и v3 props3). OVERRIDE — ручные правки.
// Статичные огни (static: все, кроме качающихся MOVING) — одна точка u: центроид объединения всех кадров (README §7b), остальные — по кадрам.
// Ореол ставится в эту точку (за спрайтом), пятно света — на землю прямо под ней (atmosphere.js).
import E from '../../../../assets/mc/prop_emitters.json';
import { PROP_SET, GFX } from './gfxCfg.js';

/** ручные правки в коде: 'v3:lantern' → [px, py] в px кадра (все кадры) или { кадр: [px, py] }. Админка «🖼 Графика» → em.<набор>.<ключ> (x, y ≥ 0) — поверх */
export const OVERRIDE = {};
const adminOv = (set, key) => { const o = GFX.em?.[set]?.[key] || GFX.em?.[set]?.[key.replace(/_\d+$/, '')]; return o && o.x >= 0 && o.y >= 0 ? [o.x, o.y] : null; };

/**
 * @param key ключ пропса (вариант, как его рисует PropSprites: propVariant)
 * @param frame кадр анимации (по модулю числа кадров)
 * @param set 'v2' | 'v3' (по умолчанию — набор страницы)
 * @returns { dx, h, px, py, frames, fps } — dx: смещение вправо от якоря (низ по центру), h: высота над землёй, м при s = 1 без отражения;
 *          px/py — точка в px кадра; null — у ключа нет свечения
 */
export function lightEmitter(key, frame = 0, set = PROP_SET) {
  const S = E.sets[set], d = S?.keys[key]; if (!d) return null;
  const f = ((Math.floor(frame) % d.frames) + d.frames) % d.frames;
  const ov = adminOv(set, key) || OVERRIDE[`${set}:${key}`];
  const p = (Array.isArray(ov) ? ov : ov?.[f]) || (d.static && d.u) || d.pts[f] || d.pts.find(Boolean); if (!p) return null; // статичный — общий центроид всех кадров
  return { dx: (p[0] - d.fw / 2) / S.pxm, h: (d.fh - p[1]) / S.pxm, px: p[0], py: p[1], frames: d.frames, fps: d.fps };
}
/** есть ли у ключа таблица точек (источник света с *_glow) */
export const hasEmitter = (key, set = PROP_SET) => !!E.sets[set]?.keys[key];
/** то же под отдельным именем (общий engine/lightEmitter.js — точки огней города/мира/ночной маски, свой формат) */
export const propEmitter = lightEmitter;
