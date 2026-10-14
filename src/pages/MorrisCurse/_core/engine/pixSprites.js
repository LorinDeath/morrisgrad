// Пиксельные атласы «Проклятых» (2.5D), единый масштаб пикселей: 10 px = 1 м (как у тайлов земли 16×16 = 1.6 м).
// chars_atlas.png — чиби 16×20 в ячейке 24×24 (запас под оружие): строки spearman, rogue, mage, warrior, alzi, leyr, petr, kyut;
//   24 колонки = 4 направления (вниз, влево, вправо, вверх) × 6 кадров (шаг A, стойка, шаг B, вдох, замах, удар) — gen_chars.py.
// mobs_atlas.png — строка = тип врага, ячейка 48×48, 12 колонок: 0–3 ход, 4–6 атака, 7 урон, 8–11 распад.
// Оба листа генерируются скриптами tools/mc-sprites/ (см. README там же).
import charsSrc from '../../../../assets/mc/chars_atlas.png';
import heroesHdSrc from '../../../../assets/mc/heroes_atlas.png';
import { GRADE } from './atmosphere.js';
import mobsSrc from '../../../../assets/mc/mobs_atlas.png';
import projSrc from '../../../../assets/mc/proj_atlas.png';
import projMeta from '../../../../assets/mc/proj_atlas.json';
import { loadAtlasTexture } from './spriteBatch.js';

const url = (s) => (typeof s === 'object' && s !== null ? (s.src || s.default?.src || s.default || '') : s);

export const PX_PER_M = 10;
export const HERO_ROWS = { spearman: 0, rogue: 1, mage: 2, warrior: 3 };
export const NPC_ROWS = { alzi: 4, leyr: 5, petr: 6, kyut: 7 };
// heroes_atlas.png — те же строки и кадры в ячейке 48×60 (утверждённые листы 2026-10, tools/mc-sprites/build_hero_atlases.py).
// По умолчанию — HD-атлас (фигура ≈57 px из 60 → рост 2.1 м, как у 21 px из 24 в старом); ?herosd=1 / localStorage mc-hero-sd=1 — старый 24×24.
const SD = typeof location !== 'undefined' && (/[?&]herosd=1/.test(location.search) || (typeof localStorage !== 'undefined' && localStorage.getItem('mc-hero-sd') === '1'));
export const HERO_HD = !SD;
export const HERO_CELL = HERO_HD ? { w: 48, h: 60, cols: 24, rows: 8 } : { w: 24, h: 24, cols: 24, rows: 8 };
export const HERO_H_M = HERO_HD ? 2.2 : 2.4; // высота билборда, м
export const HERO_FRAMES = 6;
export const MOB_CELL = { w: 48, h: 48, cols: 12, rows: 14 };
export const MOB_ROWS = { imp: 0, bat: 1, ghoul: 2, spitter: 3, golem: 4, warden: 5, blade_fly: 6, dream_moth: 7, rot_glitch: 8, moon_sentinel: 9, alzi: 10, leyr: 11, petr: 12, kyut: 13, kyut_mirror: 13 };
// высота кадра 48×48 в метрах (фигура занимает ~80% кадра)
export const MOB_HEIGHT = { imp: 1.9, bat: 1.7, ghoul: 2.3, spitter: 2.0, golem: 3.2, warden: 4.6, blade_fly: 2.1, dream_moth: 2.0, rot_glitch: 2.0, moon_sentinel: 5.0, alzi: 2.6, leyr: 2.5, petr: 2.6, kyut: 2.5, kyut_mirror: 2.6 };
export const MOB_FLYING = { bat: 0.6, blade_fly: 0.5, dream_moth: 0.7 };
export const MOB_ANIM = { walk: 0, atk: 4, hit: 7, die: 8 };

// proj_atlas.png — снаряды/попадания (tools/mc-sprites/gen_projectiles.py): ячейка 32×32, 8 кадров в строке
export const PROJ_COLS = projMeta.cols || 8;
export const PROJ_ROW_LIST = projMeta.rows || [];
export const PROJ_ROWS = Object.fromEntries(PROJ_ROW_LIST.map((k, i) => [k, i]));

const atlases = { heroes: null, mobs: null, proj: null };
let loading = null;

export function loadPixAtlases(THREE) {
  if (loading) return loading;
  loading = Promise.all([
    loadAtlasTexture(THREE, url(HERO_HD ? heroesHdSrc : charsSrc)).then((t) => { atlases.heroes = t; }).catch((e) => console.warn('[pix]', e.message)),
    loadAtlasTexture(THREE, url(mobsSrc)).then((t) => { atlases.mobs = t; }).catch((e) => console.warn('[pix]', e.message)),
    loadAtlasTexture(THREE, url(projSrc)).then((t) => { atlases.proj = t; }).catch((e) => console.warn('[pix]', e.message)),
  ]).then(() => atlases);
  return loading;
}

export function pixAtlases() { return atlases; }

// Направление → строка листа (вниз 0, влево 1, вправо 2, вверх 3); dirY > 0 — «к камере»
export function dirRow(dx, dy) {
  if (Math.abs(dx) > Math.abs(dy) * 1.1) return dx < 0 ? 1 : 2;
  return dy < 0 ? 3 : 0;
}

const nearest = (THREE, t) => { t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.generateMipmaps = false; return t; };

// Персонаж-билборд (герой или «облик» Отголоска): THREE.Sprite, низ привязан к земле.
// Интерфейс как у остальных моделей: { group, update(dt, moving, t, dirX, dirY), setTint, kind }
export class PixCharacter {
  constructor(THREE, kind) {
    this.THREE = THREE;
    this.kind = kind;
    const isLook = kind.startsWith('look:');
    this.mobType = isLook ? kind.slice(5) : null;
    const base = isLook ? atlases.mobs : atlases.heroes;
    if (!base) throw new Error('атлас не загружен');
    const tex = nearest(THREE, base.clone());
    tex.needsUpdate = true;
    const cell = isLook ? MOB_CELL : HERO_CELL;
    tex.repeat.set(1 / cell.cols, 1 / cell.rows);
    this.tex = tex; this.cell = cell;
    this.row = isLook ? (MOB_ROWS[this.mobType] ?? 6) : (HERO_ROWS[kind] ?? 0);
    const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, alphaTest: 0.3, toneMapped: false });
    const sp = new THREE.Sprite(mat);
    sp.center.set(0.5, 0);
    const h = isLook ? (MOB_HEIGHT[this.mobType] || 2) : HERO_H_M;
    sp.scale.set(h * (cell.w / cell.h), h, 1);
    this.sprite = sp;
    this.lift = isLook ? (MOB_FLYING[this.mobType] || 0) : 0;
    const g = new THREE.Group();
    g.add(sp);
    // мягкая тень-«блоб»
    const sh = new THREE.Mesh(new THREE.CircleBufferGeometry(0.55, 14), new THREE.MeshBasicMaterial({ color: 0x0a0614, transparent: true, opacity: 0.38, depthWrite: false }));
    sh.rotation.x = -Math.PI / 2; sh.scale.set(1.1, 0.6, 1); sh.position.set(0.06, 0.03, 0.03); sh.renderOrder = 1;
    g.add(sh);
    this.group = g;
    this.phase = Math.random() * 4;
    this.dRow = 0;
    this.setCell(1);
  }

  setCell(col) {
    const c = this.cell;
    const row = this.row;
    if (this.mobType) {
      this.tex.offset.set(col / c.cols, 1 - (row + 1) / c.rows);
    } else {
      this.tex.offset.set((this.dRow * HERO_FRAMES + col) / c.cols, 1 - (row + 1) / c.rows);
    }
  }

  update(dt, moving, t, dirX = 0, dirY = 1) {
    if (!this.tinted && GRADE.value) this.sprite.material.color.copy(GRADE.value);  // тон зоны (atmosphere.js)
    this.phase += dt * (moving ? 8 : 0);
    if (Math.abs(dirX) + Math.abs(dirY) > 0.01) this.dRow = dirRow(dirX, dirY);
    if (this.mobType) {
      const f = Math.floor(t * 8 + this.phase) % 4;
      this.setCell(f);
      this.sprite.position.y = this.lift + (this.lift ? Math.sin(t * 6) * 0.12 : 0);
      if (Math.abs(dirX) > 0.05) this.tex.repeat.x = (dirX < 0 ? -1 : 1) / this.cell.cols;
      if (this.tex.repeat.x < 0) this.tex.offset.x += 1 / this.cell.cols;
    } else {
      const seq = [0, 1, 2, 1];
      this.atkT = Math.max(0, (this.atkT || 0) - dt);
      let col;
      if (this.atkT > 0) col = this.atkT > 0.14 ? 4 : 5;           // замах → удар
      else if (moving) col = seq[Math.floor(this.phase) % 4];
      else col = Math.floor(t * 1.25 + this.phase) % 2 ? 3 : 1;    // дыхание на месте
      this.setCell(col);
      this.sprite.position.y = moving ? Math.abs(Math.sin(this.phase * Math.PI / 2)) * 0.05 : 0;
    }
  }

  // короткая анимация атаки (замах/удар), направление — текущее
  attack() { if (!this.mobType) this.atkT = 0.28; }

  setTint(hex, k = 0) {
    this.tinted = k > 0 && hex != null;
    if (this.tinted) this.sprite.material.color.setHex(hex).lerp(new this.THREE.Color(1, 1, 1), 1 - k);
    else this.sprite.material.color.setRGB(1, 1, 1);
  }
}
