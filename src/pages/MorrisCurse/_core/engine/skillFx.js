// 🜏 Анимации НАВЫКОВ артефактов по листам Художника (public/bm-art/fx/skills, манифест index.json; tools/bm-art/sync-skills.py).
// Лист выбирается по стихии навыка и его слоту: форма навыка (BM_SHAPES.k) cone→whip, nova→ring, proj→bolt, rain→rain, dash→dash;
// elems[стихия].slots[слот] → ключ Художника (ember_whip, frost_ring…). Новая стихия = новый skills_atlas.json, без правок кода.
// Трансформации — по README Художника: whip — поворот по прицелу, stretchX = дальность/230; ring — scale = радиус/140;
// bolt — поворот по скорости, след-частицы каждые ~16 px, burst scale = радиус/100; rain — mark → drop → impact;
// dash — trail от точки старта, stretchX = длина/220, поверх игрока spirit (влево — отражение по x).
// Слои: ground — на полу (y≈0.06), above — поверх персонажей (y≈0.9). Рисунки смотрят вправо (+x). glow — пара _glow (аддитивно).
import { SKILL_FX, FX_META, preloadSkillFx } from './fxAtlas.js';
import { BM_SKILLS, BM_SHAPES } from '../../../../../server/meta/blackArt.ts';

export const SLOT_OF = { cone: 'whip', nova: 'ring', proj: 'bolt', rain: 'rain', dash: 'dash' };
/** базовые размеры форм (px мира), под которые нарисованы листы */
export const BASE = { whip: 230, ring: 140, burst: 100, rainDrop: 60, dash: 220, dashW: 60 };
const cache = new Map();
const strip = (id) => String(id || '').replace(/^rs:/, '');
/** навык → { key, slot, elem, parts } или null (не навык артефакта / нет листа своей стихии) */
export function skillArt(id) {
  id = strip(id);
  if (cache.has(id)) return cache.get(id);
  let r = null;
  const sh = BM_SHAPES[id];
  if (sh && SLOT_OF[sh.k]) {
    const elem = sh.elem || BM_SKILLS.find((s) => s.id === id)?.bm?.elem || 'fire', slot = SLOT_OF[sh.k];
    const key = SKILL_FX?.elems?.[elem]?.slots?.[slot], K = key && SKILL_FX.keys[key];
    if (K && Object.keys(K.parts || {}).length) r = { id, key, slot, elem, parts: K.parts };
  }
  cache.set(id, r);
  return r;
}
// снаряд навыка (сервер шлёт t = id навыка): псевдоним на часть bolt своего листа — его рисует ProjAtlasFx (fly + след)
for (const id of Object.keys(BM_SHAPES)) { const a = skillArt(id); if (a?.slot === 'bolt' && a.parts.bolt) FX_META.aliases[id] = `sk_${a.key}_bolt`; }

/** часть листа: ключ FX, анимация, длительность, размер ячейки (м), слой */
export function partOf(art, part) {
  const p = art?.parts?.[part]; if (!p) return null;
  const an = Object.keys(p.anims || {})[0], A = p.anims[an] || {};
  return { k: `sk_${art.key}_${part}`, anim: an, dur: (A.n || 1) / (A.fps || 12), loop: !!A.loop, w: p.cell[0] / 20, h: p.cell[1] / 20, layer: p.layer || 'above' };
}
/** заранее загрузить листы навыков (ключи Художника) — например навыков надетого артефакта */
export function preloadSkills(ids) { const keys = [...new Set(ids.map((i) => skillArt(i)?.key).filter(Boolean))]; if (keys.length) preloadSkillFx(keys); return keys; }

/** Телеграфы-эффекты (zoneView.teles kind 'skf') для события сервера. push — добавить эффект; mobsIn(x,y,r) — мобы рядом (для меток хлыста).
 *  Возвращает true, если событие нарисовано листом навыка (код-эффект не нужен). o.fs — масштаб из админки (BMA_CFG.skillFxScale). */
export function skillEvent(e, push, mobsIn, o = {}) {
  if (e.art === 0) return false; // выключено в админке («Анимации навыков листами Художника»)
  const art = skillArt(e.id); if (!art) return false;
  const fs = Number(e.fs) || o.fs || 1;
  const P = (part) => partOf(art, part);
  const add = (p, x, y, extra) => { if (p) push({ kind: 'skf', k: p.k, anim: p.anim, loop: p.loop, w: p.w, h: p.h, layer: p.layer, x, y, t: 0, life: p.dur, ...extra }); };
  switch (art.slot) {
    case 'whip': { // acone: плеть по прицелу, «веер» — 2 бледные копии ±треть дуги; на задетых — метка (петля 1.5 с)
      if (e.k !== 'acone') return e.k === 'ability';
      const L = P('lash'), sx = (e.len || BASE.whip) / BASE.whip;
      if (!L) return false;
      add(L, e.x, e.y, { dx: e.dx, dy: e.dy, sx, sy: fs, mode: 2, hy: 0.9 });
      const a = (e.arc || 1) / 3;
      for (const s of [-1, 1]) { const c = Math.cos(a * s), n = Math.sin(a * s); add(L, e.x, e.y, { dx: e.dx * c - e.dy * n, dy: e.dx * n + e.dy * c, sx: sx * 0.92, sy: fs * 0.8, mode: 2, hy: 0.88, a: 0.5, t: -0.03 }); }
      const M = P('mark');
      if (M && mobsIn) { const half = (e.arc || 1) / 2, len = e.len || BASE.whip;
        for (const m of mobsIn(e.x, e.y, len + 14)) { const ex = m.x - e.x, ey = m.y - e.y, d = Math.hypot(ex, ey) || 1;
          if (d < 24 || Math.acos(Math.max(-1, Math.min(1, (ex * e.dx + ey * e.dy) / d))) <= half) add(M, m.x, m.y, { mob: m.id, mode: 0, hy: 1.2, t: -0.17, life: 1.5, loop: true, sx: 1.4, sy: 1.4 }); } }
      return true;
    }
    case 'ring': { // ability в центре героя: кольцо по радиусу
      if (e.k !== 'ability') return false;
      const R = P('ring'); if (!R) return false;
      const s = ((e.r || BASE.ring) / BASE.ring) * fs;
      add(R, e.x, e.y, { sx: s, sy: s, mode: 2, hy: 0.06 });
      return true;
    }
    case 'bolt': { // полёт рисует ProjAtlasFx (псевдоним id → sk_*_bolt); здесь — взрыв в точке
      if (e.k !== 'ability') return false;
      const B = P('burst'); if (!B) return false;
      const s = ((e.r || BASE.burst) / BASE.burst) * fs;
      add(B, e.x, e.y, { sx: s, sy: s, mode: 2, hy: 0.3 });
      return true;
    }
    case 'rain': { // arain: метки сразу, капля за 1/3 с до удара, удар (лужа гаснет 1 с); ability каждой капли уже нарисована
      if (e.k === 'ability') return true;
      if (e.k !== 'arain' || !Array.isArray(e.pts)) return false;
      const M = P('mark'), D = P('drop'), I = P('impact'), s = ((e.r || BASE.rainDrop) / BASE.rainDrop) * fs;
      for (const [x, y, ms] of e.pts) { const hit = (ms || 0) / 1000, st = Math.max(0, hit - (e.lead || 450) / 1000);
        add(M, x, y, { sx: s, sy: s, mode: 2, hy: 0.05, t: -st, life: Math.max(0.1, hit - st), loop: true });
        if (D) add(D, x, y, { sx: fs, sy: fs, mode: 0, hy: 0, t: -Math.max(0, hit - D.dur), life: D.dur });
        add(I, x, y, { sx: s, sy: s, mode: 2, hy: 0.06, t: -hit }); }
      return true;
    }
    case 'dash': { // aline: след от старта по направлению; spirit поверх героя едет по линии рывка 0.25 с и держится до конца неуязвимости
      if (e.k === 'ability') return true;
      if (e.k !== 'aline') return false;
      const T = P('trail'), S = P('spirit'), len = e.len || BASE.dash;
      add(T, e.x, e.y, { dx: e.dx, dy: e.dy, sx: len / BASE.dash, sy: fs, mode: 2, hy: 0.06 });
      if (S) add(S, e.x, e.y, { mode: 0, hy: 1.0, life: 0.4, loop: true, sx: (e.dx < 0 ? -1 : 1) * fs, sy: fs, move: [e.x, e.y, e.x + e.dx * len, e.y + e.dy * len, 0.25] });
      return true;
    }
  }
  return false;
}

/** нарисовать эффект kind 'skf' (fx — FxAtlas; toX/toZ — мир → сцена) */
export function drawSkf(fx, t, toX, toZ) {
  let x = t.x, y = t.y;
  if (t.move) { const [x0, y0, x1, y1, d] = t.move, k = Math.min(1, t.t / d); x = x0 + (x1 - x0) * k; y = y0 + (y1 - y0) * k; }
  const w = t.w * (t.sx ?? 1), h = t.h * (t.sy ?? 1), a = (t.a ?? 1) * (t.loop && t.life - t.t < 0.15 ? Math.max(0, (t.life - t.t) / 0.15) : 1);
  return fx.draw(t.k, t.anim, t.t, toX(x), t.hy ?? 0.06, toZ(y), w, h, t.mode ?? 2, 0, t.dx || 0, t.dy || 0, null, a, 0, t.loop);
}
