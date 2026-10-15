// Пропсы v2 — спрайты утверждённых листов (props_p32 32×48, props_b64 64×64 + аддитивные *_glow) на SpriteBatch.
// Кадры анимации играет шейдер (iAnim + общий uTime), поэтому даже статичные батчи чанков качаются/мерцают;
// у каждого экземпляра своя фаза (хеш позиции), варианты (tree/tree_2/tree_3…) — детерминированно по позиции
// (server/meta/propsV2.ts → propVariant: те же, что у сервера для коллизий).
import { SpriteBatch, loadAtlasTexture, assetUrl } from './spriteBatch.js';
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
  constructor(THREE, tex, { max = 256, light = 1, parent = null } = {}) {
    this.b = {};
    for (const sh of ['p32', 'b64']) {
      const S = META.sheets[sh];
      this.b[sh] = new SpriteBatch(THREE, tex[sh], { cellW: S.frameW, cellH: S.frameH, cols: S.cols, rows: S.rows, max, light });
      this.b[sh + '_glow'] = new SpriteBatch(THREE, tex[sh + '_glow'], { cellW: S.frameW, cellH: S.frameH, cols: S.cols, rows: S.rows, max, light, additive: true });
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
  // плоская декаль (arena_sigil): кладётся на землю отдельным мешем — здесь только проверка ключа
  dispose(parent) { for (const B of this.list) { B.dispose(); parent?.remove(B.mesh); } }
}
