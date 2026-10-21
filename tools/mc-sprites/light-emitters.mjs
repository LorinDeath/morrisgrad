// Точки излучения огней (engine/lightEmitter.js): для каждого ключа-источника света (LIGHT_PROPS в atmosphere.js и их варианты)
// и каждого кадра — центроид светящихся пикселей кадра *_glow (вес = яркость × альфа), в px кадра (x вправо, y вниз).
// Наборы v2 (props2) и v3 (props3). Запуск: node tools/mc-sprites/light-emitters.mjs  → src/assets/mc/light_emitters.json
import { readFileSync, writeFileSync } from 'fs';
import { createRequire } from 'module';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
const require = createRequire(import.meta.url);
const sharp = require(process.env.SHARP || '/workspace/mc-ui-tools/node_modules/sharp');
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
export const LIGHT_BASE = ['lantern', 'torch', 'campfire', 'crystal', 'star_crystal', 'pylon'];
export const EMIT_EXTRA = ['portal']; // не пропсы-огни, но со своим светом в atmosphere.js (порталы мира)
const SETS = { v2: { dir: 'src/assets/mc/props2', atlas: 'props_atlas.json', pxm: 10 }, v3: { dir: 'src/assets/mc/props3', atlas: 'props32_atlas.json', pxm: 20 } };
const imgs = {};
async function raw(file) { if (!imgs[file]) { const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true }); imgs[file] = { data, w: info.width, h: info.height }; } return imgs[file]; }
/** центроид светящихся пикселей кадра (px кадра, центр пикселя +0.5); null — пусто */
export function centroid(I, x0, y0, fw, fh) {
  let sw = 0, sx = 0, sy = 0;
  for (let y = 0; y < fh; y++) for (let x = 0; x < fw; x++) {
    const o = ((y0 + y) * I.w + x0 + x) * 4, a = I.data[o + 3] / 255; if (!a) continue;
    const wgt = a * (0.2126 * I.data[o] + 0.7152 * I.data[o + 1] + 0.0722 * I.data[o + 2]) / 255; if (wgt <= 0) continue;
    sw += wgt; sx += wgt * (x + 0.5); sy += wgt * (y + 0.5);
  }
  return sw > 0 ? [sx / sw, sy / sw] : null;
}
export async function frameCentroid(setName, key, f) {
  const S = SETS[setName], A = JSON.parse(readFileSync(resolve(ROOT, S.dir, S.atlas), 'utf8')), d = A.keys[key];
  if (!d?.glow) return null;
  const G = A.sheets[d.glow.sheet], I = await raw(resolve(ROOT, S.dir, G.image));
  const c = d.col + f, r = d.row + Math.floor(c / G.cols);
  return centroid(I, (c % G.cols) * G.frameW, r * G.frameH, G.frameW, G.frameH);
}
export function lightKeys(A) { return Object.keys(A.keys).filter((k) => LIGHT_BASE.includes(k) || LIGHT_BASE.includes(A.keys[k].variant_of) || EMIT_EXTRA.includes(k)); }
async function main() {
  const out = { note: 'центроид светящихся пикселей *_glow по кадрам, px кадра; генератор tools/mc-sprites/light-emitters.mjs', sets: {} };
  for (const [sn, S] of Object.entries(SETS)) {
    const A = JSON.parse(readFileSync(resolve(ROOT, S.dir, S.atlas), 'utf8')), o = (out.sets[sn] = { pxm: S.pxm, keys: {} });
    for (const k of lightKeys(A)) {
      const d = A.keys[k], G = A.sheets[d.glow?.sheet || d.sheet], n = Math.max(1, d.frames || 1), pts = [];
      for (let f = 0; f < n; f++) { const p = await frameCentroid(sn, k, f); pts.push(p ? [+p[0].toFixed(2), +p[1].toFixed(2)] : null); }
      o.keys[k] = { fw: G.frameW, fh: G.frameH, frames: n, fps: d.fps || 0, pts };
    }
  }
  writeFileSync(resolve(ROOT, 'src/assets/mc/light_emitters.json'), JSON.stringify(out));
  for (const [sn, o] of Object.entries(out.sets)) for (const [k, v] of Object.entries(o.keys)) { const p = v.pts.filter(Boolean), mx = p.reduce((a, q) => a + q[0], 0) / p.length, my = p.reduce((a, q) => a + q[1], 0) / p.length; console.log(sn, k.padEnd(14), `${v.fw}×${v.fh}`, 'кадров', v.frames, 'ср. точка', mx.toFixed(1), my.toFixed(1), 'пустых', v.pts.length - p.length); }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
