// Пропсы v2 — спрайты утверждённых листов (props_p32 32×48, props_b64 64×64 + аддитивные *_glow) на SpriteBatch.
// Кадры анимации играет шейдер (iAnim + общий uTime), поэтому даже статичные батчи чанков качаются/мерцают;
// у каждого экземпляра своя фаза (хеш позиции), варианты (tree/tree_2/tree_3…) — детерминированно по позиции
// (server/meta/propsV2.ts → propVariant: те же, что у сервера для коллизий).
import { SpriteBatch, loadAtlasTexture, assetUrl } from './spriteBatch.js';
import { GRADE } from './atmosphere.js';
import { LIGHT, pixTex, setDisplayRGB } from './pixColor.js';
import { PROPS_META as META, propVariant, propDef } from '../../../../../server/meta/propsV2.ts';
import p32 from '../../../../assets/mc/props2/props_p32.png';
import b64 from '../../../../assets/mc/props2/props_b64.png';
import p32g from '../../../../assets/mc/props2/props_p32_glow.png';
import b64g from '../../../../assets/mc/props2/props_b64_glow.png';

const SRC = { p32, b64, p32_glow: p32g, b64_glow: b64g };
let texP = null;
export function loadPropTextures(THREE) {
  if (!texP) texP = Promise.all(Object.entries(SRC).map(([k, s]) => loadAtlasTexture(THREE, assetUrl(s)).then((t) => [k, t]))).then((a) => Object.fromEntries(a));
  return texP;
}
const phaseOf = (x, y) => { const h = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453; return (h - Math.floor(h)) * 10; };
export const propHeightM = (key, s = 1) => { const d = propDef(key); return d ? META.sheets[d.sheet].frameH / 10 * s : 4.8 * s; };

// Набор батчей на группу пропсов (чанк/сцена): 2 листа × (обычный + свечение)
export class PropSprites {
  constructor(THREE, tex, { max = 256, light = 1, parent = null, outline = false } = {}) {
    this.b = {};
    for (const sh of ['p32', 'b64']) {
      const S = META.sheets[sh];
      this.b[sh] = new SpriteBatch(THREE, tex[sh], { cellW: S.frameW, cellH: S.frameH, cols: S.cols, rows: S.rows, max, light });
      this.b[sh + '_glow'] = new SpriteBatch(THREE, tex[sh + '_glow'], { cellW: S.frameW, cellH: S.frameH, cols: S.cols, rows: S.rows, max, light, additive: true });
      if (outline) { // свечение узлов сбора: сплошной контур под спрайтом + аддитивная аура поверх (те же кадры атласа)
        this.b[sh + '_sil'] = new SpriteBatch(THREE, tex[sh], { cellW: S.frameW, cellH: S.frameH, cols: S.cols, rows: S.rows, max, light, sil: true });
        this.b[sh + '_aura'] = new SpriteBatch(THREE, tex[sh], { cellW: S.frameW, cellH: S.frameH, cols: S.cols, rows: S.rows, max, light, aura: true });
      }
    }
    this.list = Object.values(this.b);
    if (parent) for (const B of this.list) parent.add(B.mesh);
  }
  begin() { for (const B of this.list) B.begin(); }
  end() { for (const B of this.list) B.end(); }
  setLight(k) { for (const B of this.list) B.setLight(k); }
  // k — ключ (старый или v2); (wx, wy) — точка мира (для варианта и фазы); (x, z) — сцена; s — масштаб; y — подъём (м)
  push(k, wx, wy, x, z, s = 1, flip = false, alpha = 1, y = 0, tint = null, variant = true) {
    const key = variant ? propVariant(k, wx, wy) : (META.aliases[k] || k);
    const d = key && propDef(key); if (!d) return false;
    const B = this.b[d.sheet], h = META.sheets[d.sheet].frameH / 10 * s, ph = phaseOf(wx, wy);
    const r = tint ? tint[0] : 1, g = tint ? tint[1] : 1, bb = tint ? tint[2] : 1;
    B.push(x, y, z, h, d.col, d.row, flip, r, g, bb, 0, alpha); if (d.frames > 1) B.anim(d.frames, d.fps, ph);
    if (d.glow) { const G = this.b[d.glow.sheet]; G.push(x, y, z, h, d.col, d.row, flip, 1, 1, 1, 0, alpha); if (d.frames > 1) G.anim(d.frames, d.fps, ph); }
    return true;
  }
  // свечение узла: контур цветом rgb (масштаб size, альфа a) и аура (яркость k) — тот же кадр/вариант, что у push()
  pushGlow(k, wx, wy, x, z, s, flip, rgb, size, a, auraK, variant = true) {
    const key = variant ? propVariant(k, wx, wy) : (META.aliases[k] || k);
    const d = key && propDef(key); if (!d || !this.b[d.sheet + '_sil']) return false;
    const h = META.sheets[d.sheet].frameH / 10 * s, ph = phaseOf(wx, wy), S = this.b[d.sheet + '_sil'], A = this.b[d.sheet + '_aura'];
    S.push(x, -h * (size - 1) * 0.12, z, h * size, d.col, d.row, flip, rgb[0], rgb[1], rgb[2], 0, a); if (d.frames > 1) S.anim(d.frames, d.fps, ph);
    if (auraK > 0) { A.push(x, 0, z, h, d.col, d.row, flip, rgb[0] * auraK, rgb[1] * auraK, rgb[2] * auraK, 0, 1); if (d.frames > 1) A.anim(d.frames, d.fps, ph); }
    return true;
  }
  // плоская декаль (arena_sigil): кладётся на землю отдельным мешем — здесь только проверка ключа
  dispose(parent) { for (const B of this.list) { B.dispose(); parent?.remove(B.mesh); } }
}

// Отдельный анимированный пропс как THREE.Sprite (порталы, Сердце Обители и др. одиночные объекты сцены):
// основа (обычное смешивание, alphaTest) + свечение (аддитивно). Низ кадра — в точке группы. update(t) листает кадры.
// Цвет — как у пропсов SpriteBatch: пиксель атласа × тон зоны (GRADE) × LIGHT.props (свечение × LIGHT.glow), см. pixColor.js.
export function propObject(THREE, k, { s = 1, tint = null, glowTint = null } = {}) {
  const key = META.aliases[k] || k, d = propDef(key);
  const g = new THREE.Group(); if (!d) return { group: g, update() {} };
  const S = META.sheets[d.sheet], h = S.frameH / 10 * s, w = S.frameW / 10 * s;
  const mk = (add) => { const m = new THREE.SpriteMaterial({ transparent: true, alphaTest: add ? 0 : 0.3, depthWrite: !add, toneMapped: false, blending: add ? THREE.AdditiveBlending : THREE.NormalBlending }); const sp = new THREE.Sprite(m); sp.center.set(0.5, 0); sp.scale.set(w, h, 1); sp.renderOrder = add ? 3 : 2; return sp; };
  const base = mk(false), glow = d.glow ? mk(true) : null;
  const C = THREE.Color, baseTint = new C(tint ?? 0xffffff), glowCol = new C(glowTint ?? tint ?? 0xffffff);
  const paint = () => { // экранные множители → линейный цвет материала
    const G = GRADE.value || { r: 1, g: 1, b: 1 }, kp = LIGHT.props, kg = LIGHT.glow;
    setDisplayRGB(base.material.color, baseTint.r * G.r * kp, baseTint.g * G.g * kp, baseTint.b * G.b * kp);
    if (glow) setDisplayRGB(glow.material.color, glowCol.r * G.r * kg, glowCol.g * G.g * kg, glowCol.b * G.b * kg);
  };
  paint();
  g.add(base); if (glow) g.add(glow);
  const maps = [];
  loadPropTextures(THREE).then((tex) => {
    const set = (sp, t) => { const m = pixTex(THREE, t.clone()); m.needsUpdate = true; m.magFilter = m.minFilter = THREE.NearestFilter; m.generateMipmaps = false; m.repeat.set(1 / S.cols, 1 / S.rows); m.offset.set(d.col / S.cols, 1 - (d.row + 1) / S.rows); sp.material.map = m; sp.material.needsUpdate = true; maps.push(m); };
    set(base, tex[d.sheet]); if (glow) set(glow, tex[d.glow.sheet]);
  });
  const ph = Math.random() * 5;
  return { group: g, key, base, glow, maps, update(t) { paint(); if (d.frames < 2) return; const f = Math.floor((t + ph) * d.fps) % d.frames, c = d.col + f, r = d.row + Math.floor(c / S.cols); for (const m of maps) { m.offset.x = (c % S.cols) / S.cols; m.offset.y = 1 - (r + 1) / S.rows; } } };
}
