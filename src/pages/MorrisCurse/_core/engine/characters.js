// Фабрика персонажей. По умолчанию — 2.5D: пиксельные билборды из атласа героев (engine/pixSprites.js),
// облики Отголосков («забери всё») — кадры из атласа врагов, душа без класса — билборд из листа проекта.
// Запасные режимы: 'hero' (3D low-poly по референсам), 'voxel' (воксели из листов), 'sprite', 'lowpoly'.
// Переключение: ?models=pix|hero|voxel|sprite|lowpoly или localStorage 'mc-models'.
import { SHEETS } from './spriteSheets.js';
import { loadSheetImage, SpriteCharacter } from './spriteVoxel.js';
import { makeHumanoid, makeSoul } from './models.js';
import { makeHero, hasHero } from './heroes.js';
import { PixCharacter, HERO_ROWS, MOB_ROWS, pixAtlases } from './pixSprites.js';

const images = {};
let mode = 'pix'; // pix (2.5D пиксельные билборды) | hero (3D по референсам) | voxel | sprite | lowpoly

export function modelMode() { return mode; }

export function initModelMode() {
  try {
    const q = new URLSearchParams(window.location.search).get('models');
    const saved = window.localStorage.getItem('mc-models');
    const m = q || saved;
    if (m === 'pix' || m === 'hero' || m === 'sprite' || m === 'voxel' || m === 'lowpoly') mode = m;
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

export function kindFromClass(classId, look) {
  if (look && mode === 'pix' && MOB_ROWS[look] !== undefined) return 'look:' + look;
  return classId && SHEETS[classId] ? classId : 'soul';
}

// Унифицированный интерфейс: { group, update(dt, moving, t, dirX, dirY), setTint(hex,k), kind }
export function createCharacter(THREE, kind, tint) {
  if (mode === 'pix' && (HERO_ROWS[kind] !== undefined || (kind.startsWith('look:') && MOB_ROWS[kind.slice(5)] !== undefined))) {
    const at = pixAtlases();
    if (at.heroes && at.mobs) {
      try { return new PixCharacter(THREE, kind); } catch (err) { console.warn('[models] 2.5D-спрайт не построен', err); }
    }
  }
  if (kind.startsWith('look:')) kind = 'soul';
  if (mode === 'hero' && hasHero(kind)) {
    try { return makeHero(THREE, kind); } catch (err) { console.warn('[models] герой не построен, запасной вариант', err); }
  }
  const img = images[kind];
  if (mode !== 'lowpoly' && img) {
    try {
      const ch = new SpriteCharacter(THREE, kind, img, mode === 'sprite' || mode === 'pix' ? 'sprite' : 'voxel');
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
