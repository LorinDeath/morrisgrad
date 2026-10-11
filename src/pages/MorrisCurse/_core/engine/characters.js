// Фабрика персонажей: воксельные модели из спрайтов проекта (по умолчанию),
// запасные режимы — спрайт-билборды ('sprite') и процедурные low-poly ('lowpoly').
// Режим можно переключить: ?models=sprite|voxel|lowpoly или localStorage 'mc-models'.
import { SHEETS } from './spriteSheets.js';
import { loadSheetImage, SpriteCharacter } from './spriteVoxel.js';
import { makeHumanoid, makeSoul } from './models.js';
import { makeHero, hasHero } from './heroes.js';

const images = {};
let mode = 'hero'; // hero (персонажи по референсам) | voxel (из спрайт-листов) | sprite (билборды) | lowpoly

export function modelMode() { return mode; }

export function initModelMode() {
  try {
    const q = new URLSearchParams(window.location.search).get('models');
    const saved = window.localStorage.getItem('mc-models');
    const m = q || saved;
    if (m === 'hero' || m === 'sprite' || m === 'voxel' || m === 'lowpoly') mode = m;
  } catch (_) {}
  return mode;
}

export function setModelMode(m) {
  mode = m;
  try { window.localStorage.setItem('mc-models', m); } catch (_) {}
}

export async function preloadCharacterSheets() {
  await Promise.all(Object.keys(SHEETS).map(async (k) => {
    try { images[k] = await loadSheetImage(k); } catch (err) { console.warn('[models]', err.message); }
  }));
  return images;
}

export function kindFromClass(classId) {
  return classId && SHEETS[classId] ? classId : 'soul';
}

// Унифицированный интерфейс: { group, update(dt, moving, t, dirX, dirY), setTint(hex,k), kind }
export function createCharacter(THREE, kind, tint) {
  if (mode === 'hero' && hasHero(kind)) {
    try { return makeHero(THREE, kind); } catch (err) { console.warn('[models] герой не построен, запасной вариант', err); }
  }
  const img = images[kind];
  if (mode !== 'lowpoly' && img) {
    try {
      const ch = new SpriteCharacter(THREE, kind, img, mode === 'sprite' ? 'sprite' : 'voxel');
      return ch;
    } catch (err) {
      console.warn('[models] спрайт-модель не построена, low-poly запасной вариант', err);
    }
  }
  const lp = kind === 'soul' ? makeSoul(THREE, tint) : makeHumanoid(THREE, kind, tint);
  return {
    group: lp.group,
    kind,
    update(dt, moving, t, dirX = 0, dirY = 1) {
      lp.update(dt, moving, t);
      if (Math.abs(dirX) + Math.abs(dirY) > 0.01) lp.group.rotation.y = Math.atan2(dirX, dirY);
    },
    setTint() {},
  };
}
