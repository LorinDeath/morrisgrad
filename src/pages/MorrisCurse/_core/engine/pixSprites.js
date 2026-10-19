// Пиксельные атласы «Проклятых» (2.5D), единый масштаб пикселей: 10 px = 1 м (как у тайлов земли 16×16 = 1.6 м).
// chars_atlas.png — чиби 16×20 в ячейке 24×24 (запас под оружие): строки spearman, rogue, mage, warrior, alzi, leyr, petr, kyut;
//   24 колонки = 4 направления (вниз, влево, вправо, вверх) × 6 кадров (шаг A, стойка, шаг B, вдох, замах, удар) — gen_chars.py.
// mobs_atlas.png — строка = тип врага, ячейка 48×48, 12 колонок: 0–3 ход, 4–6 атака, 7 урон, 8–11 распад.
// Оба листа генерируются скриптами tools/mc-sprites/ (см. README там же).
import { sortKey, depthZ } from './spriteBatch.js';
let PIX_SEQ = 0;
// вид героев с сервера (meta_state.bmv): яркость неосвещённого спрайта героя (было 1 — ярче освещённой земли), глитч очернения
export const BLK_FX = { heroLight: 0.82, glitch: true, hz: 0.7 };
import charsSrc from '../../../../assets/mc/chars_atlas.png';
import heroesHdSrc from '../../../../assets/mc/heroes_atlas.png';
import { GRADE } from './atmosphere.js';
import mobsSrc from '../../../../assets/mc/mobs_atlas.png';
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

// снаряды/попадания/статусы — FX atlas v2 (engine/fxAtlas.js); старый proj_atlas удалён
const atlases = { heroes: null, mobs: null };
let loading = null;

export function loadPixAtlases(THREE) {
  if (loading) return loading;
  loading = Promise.all([
    loadAtlasTexture(THREE, url(HERO_HD ? heroesHdSrc : charsSrc)).then((t) => { atlases.heroes = t; }).catch((e) => console.warn('[pix]', e.message)),
    loadAtlasTexture(THREE, url(mobsSrc)).then((t) => { atlases.mobs = t; }).catch((e) => console.warn('[pix]', e.message)),
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
    this.key = sortKey(++PIX_SEQ); // стабильный ключ глубины (setSortId — по id игрока/моба)
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

  setSortId(id) { this.key = sortKey(id); }

  update(dt, moving, t, dirX = 0, dirY = 1) {
    { const gz = this.group.position.z; this.sprite.position.z = depthZ(gz, this.key) - gz; } // стабильный порядок слоёв (как SpriteBatch)
    if (!this.tinted && GRADE.value) { this.sprite.material.color.copy(GRADE.value); if (!this.mobType) this.sprite.material.color.multiplyScalar(BLK_FX.heroLight); } // тон зоны (atmosphere.js) × яркость героев (админка)
    this.phase += dt * (moving ? 8 : 0);
    if (Math.abs(dirX) + Math.abs(dirY) > 0.01) this.dRow = dirRow(dirX, dirY);
    if (this.mobType) {
      const f = Math.floor(t * 8 + this.phase) % 4;
      this.setCell(f);
      // подъём летуна — смещением центра спрайта (якорь глубины остаётся на земле → правильный порядок слоёв)
      this.sprite.center.y = -(this.lift + (this.lift ? Math.sin(t * 6) * 0.12 : 0)) / this.sprite.scale.y;
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
    this._glowTick(t);
    this._blkTick(t);
  }

  // короткая анимация атаки (замах/удар), направление — текущее
  attack() { if (!this.mobType) this.atkT = 0.28; }

  // Свечение проклятия: второй спрайт поверх с тем же кадром (общая текстура); шейдер рисует фиолетовый ОРЕОЛ по контуру
  // (соседние пиксели непрозрачны, сам — прозрачен) + слабое внутреннее свечение у края тела. k — яркость 0..1, pulse — пульс (полный комплект).
  setCurseGlow(k, rgb = [0.66, 0.33, 0.97], pulse = false) {
    if (!(k > 0)) { if (this.glow) this.glow.visible = false; this.glowK = 0; return; }
    if (!this.glow) {
      const T = this.THREE, img = this.tex.image || {};
      const mat = new T.SpriteMaterial({ map: this.tex, transparent: true, depthWrite: false, toneMapped: false });
      const U = { uTexel: { value: new T.Vector2(1 / (img.width || 1024), 1 / (img.height || 1024)) }, uCol: { value: new T.Vector3(...rgb) }, uK: { value: k }, uR: { value: 1 } };
      mat.onBeforeCompile = (sh) => {
        Object.assign(sh.uniforms, U);
        sh.fragmentShader = 'uniform vec2 uTexel; uniform vec3 uCol; uniform float uK; uniform float uR;\n' + sh.fragmentShader.replace('#include <map_fragment>', `
          float a0 = texture2D(map, vUv).a, nOut = 0.0, nMin = 1.0;
          for (int i = 0; i < 8; i++) { float an = float(i) * 0.785398; vec2 d = vec2(cos(an), sin(an)) * uTexel;
            nOut = max(nOut, texture2D(map, vUv + d * 1.5 * uR).a * 1.0); nOut = max(nOut, texture2D(map, vUv + d * 3.0 * uR).a * 0.55);
            nMin = min(nMin, texture2D(map, vUv + d * 1.5).a); }
          float outer = smoothstep(0.2, 0.9, nOut) * (1.0 - step(0.3, a0));
          float inner = step(0.3, a0) * (1.0 - smoothstep(0.3, 1.0, nMin)) * 0.55 + step(0.3, a0) * 0.10;
          diffuseColor = vec4(mix(uCol, vec3(1.0), outer * 0.15), clamp((outer + inner) * uK, 0.0, 1.0));`);
      };
      this.glowU = U;
      const g = new T.Sprite(mat); g.center.copy(this.sprite.center); g.scale.copy(this.sprite.scale); g.renderOrder = (this.sprite.renderOrder || 0) + 1;
      this.glow = g; this.group.add(g);
    }
    this.glow.visible = true; this.glowK = k; this.glowPulse = pulse;
    this.glowU.uCol.value.set(rgb[0], rgb[1], rgb[2]);
    this.glowU.uR.value = 0.8 + 1.2 * k; // толщина ореола растёт с числом проклятых вещей
  }
  _glowTick(t) {
    if (!this.glow?.visible) return;
    this.glow.position.copy(this.sprite.position); this.glow.position.z += 0.002; this.glow.center.copy(this.sprite.center);
    this.glowU.uK.value = Math.min(1, this.glowK * (this.glowPulse ? 0.8 + 0.35 * Math.sin(t * 4) : 1) * 1.15);
  }

  // Очернение (Чёрный маг) — как у самого мага: чёрная ПРАВАЯ (на экране, лицом к камере) половина тела. Та же сторона, что у мага:
  // анатомически — левая сторона героя; со спины — слева на экране, в профиль — от левого края (влево — сторона к нам, вправо — дальняя, уже).
  // k 0…1 — доля половины: 0.3 — 30 % половины от края, 1 — ровно половина (сервер: players_state.stats.bk / 100).
  // Третий спрайт с тем же кадром ПОВЕРХ героя (после тона зоны), fog/toneMapped выкл. — по-настоящему чёрный.
  // Шов — фиолетовая глитч-полоса с рваными строками; глитч: иногда строки чёрной части сдвигаются на 1 px вправо (BLK_FX.glitch / hz).
  setBlacken(k) {
    k = Math.max(0, Math.min(1, Number(k) || 0));
    if (!(k > 0.005)) { if (this.blk) this.blk.visible = false; this.blkK = 0; return; }
    if (!this.blk) {
      const T = this.THREE, img = this.tex.image || {};
      const mat = new T.SpriteMaterial({ map: this.tex, transparent: true, depthWrite: false, toneMapped: false, fog: false });
      const U = { uK: { value: k }, uT: { value: 0 }, uDir: { value: 0 }, uGl: { value: 1 }, uHz: { value: 0.7 }, uOff: { value: new T.Vector2() }, uRep: { value: new T.Vector2(1, 1) },
        uGrid: { value: new T.Vector2(this.cell.w, this.cell.h) }, uTexel: { value: new T.Vector2(1 / (img.width || 1024), 1 / (img.height || 1024)) }, uHw: { value: this.mobType ? 0.36 : 0.3 } };
      mat.onBeforeCompile = (sh) => {
        Object.assign(sh.uniforms, U);
        sh.fragmentShader = 'uniform float uK; uniform float uT; uniform float uDir; uniform float uGl; uniform float uHz; uniform vec2 uOff; uniform vec2 uRep; uniform vec2 uGrid; uniform vec2 uTexel; uniform float uHw;\nfloat bkH(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }\n' + sh.fragmentShader.replace('#include <map_fragment>', `
          vec2 lc0 = (vUv - uOff) / uRep; vec2 px0 = floor(lc0 * uGrid);
          float tick = floor(uT * max(uHz, 0.01) * 4.0);                         // 4 «кадра» на период
          float gOn = uGl * step(0.75, fract(uT * max(uHz, 0.01))) * step(0.45, bkH(vec2(px0.y, tick)));   // эта строка сдвинута на 1 px
          vec2 uv = vUv - vec2(gOn * uTexel.x * sign(uRep.x), 0.0);
          float a = step(0.3, texture2D(map, uv).a);
          vec2 lc = (uv - uOff) / uRep; vec2 px = floor(lc * uGrid);
          float u = (lc.x - 0.5) / uHw;
          float sd = uDir < 0.5 ? u : -u;                                        // лицом к камере — справа; спиной/в профиль — слева
          float f = uK * (uDir > 1.5 && uDir < 2.5 ? 0.6 : 1.0);                 // в профиль вправо видна дальняя сторона — уже
          float rowN = bkH(vec2(px.y, floor(uT * 6.0))), rowS = bkH(vec2(px.y, 7.0));
          float b = 1.0 - f * 1.0 + (rowN - 0.5) * 0.1 * min(1.0, f * 4.0) - step(0.86, rowS) * 0.18 * min(1.0, f * 3.0);
          float blk = a * step(b, sd);
          float seam = a * (1.0 - blk) * step(b - 0.16, sd) * (0.6 + 0.4 * step(0.5, rowN));
          float spark = blk * step(0.975, bkH(px + vec2(floor(uT * 3.0), 0.0)));
          vec3 col = mix(vec3(0.008, 0.0, 0.016), vec3(0.55, 0.22, 0.85), max(seam, spark * 0.8));
          diffuseColor = vec4(col, clamp(max(blk, seam * 0.85), 0.0, 1.0));`);
      };
      this.blkU = U;
      const g = new T.Sprite(mat); g.center.copy(this.sprite.center); g.scale.copy(this.sprite.scale); g.renderOrder = (this.sprite.renderOrder || 0) + 1;
      this.blk = g; this.group.add(g);
    }
    this.blk.visible = true; this.blkK = k; this.blkU.uK.value = k;
  }
  _blkTick(t) {
    if (!this.blk?.visible) return;
    this.blk.position.copy(this.sprite.position); this.blk.position.z += 0.001; this.blk.center.copy(this.sprite.center);
    this.blkU.uOff.value.set(this.tex.offset.x, this.tex.offset.y); this.blkU.uRep.value.set(this.tex.repeat.x, this.tex.repeat.y); this.blkU.uT.value = t; this.blkU.uDir.value = this.mobType ? 0 : this.dRow; this.blkU.uGl.value = BLK_FX.glitch ? 1 : 0; this.blkU.uHz.value = BLK_FX.hz;
  }

  setTint(hex, k = 0) {
    this.tinted = k > 0 && hex != null;
    if (this.tinted) this.sprite.material.color.setHex(hex).lerp(new this.THREE.Color(1, 1, 1), 1 - k);
    else this.sprite.material.color.setRGB(1, 1, 1);
  }
}
