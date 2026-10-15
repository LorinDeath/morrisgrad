// Пиксельная земля и пропсы открытых миров (единый масштаб: 10 px арта = 1 м = 20 px мира; тайл 16×16 = 32 px мира).
// Раскладка детерминирована (тот же сид для всех клиентов) и строится из регионов zoneGen (биом региона → семейство тайлов).
// Земля запекается в ОДНУ текстуру (canvas из tiles_atlas) на плоскости мира + поля по краям; пропсы — один SpriteBatch.
import tilesSrc from '../../../../assets/mc/tiles_atlas.png';
import tilesMeta from '../../../../assets/mc/tiles_atlas.json';
import { loadPropTextures, PropSprites } from '../engine/propAtlas.js';
import { SpriteBatch, loadAtlasTexture } from '../engine/spriteBatch.js';
import { toX, toZ, PX } from '../engine/geometry.js';
import { ArinarTerrain } from './terrainChunks.js';

import { CELL, MARGIN, layoutWorld } from '../../../../../server/meta/worldLayout.ts';
export { CELL, layoutWorld };
const TEX = tilesMeta.tile;     // 16 px текстуры на тайл

const url = (s) => (typeof s === 'object' && s !== null ? (s.src || s.default?.src || s.default || '') : s);
function loadImg(src) {
  return new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = () => rej(new Error('img ' + src)); im.src = src; });
}
let tilesImg = null;
async function tilesImage() { return tilesImg || (tilesImg = await loadImg(url(tilesSrc))); }

// Запечь раскладку в canvas (1 тайл = 16×16 px текстуры)
export async function bakeGround(layout) {
  const im = await tilesImage();
  const cols = tilesMeta.cols;
  const cv = document.createElement('canvas');
  cv.width = cv.height = layout.N * TEX;
  const g = cv.getContext('2d');
  g.imageSmoothingEnabled = false;
  const blit = (idx, i, j) => g.drawImage(im, (idx % cols) * TEX, Math.floor(idx / cols) * TEX, TEX, TEX, i * TEX, j * TEX, TEX, TEX);
  const { N, base, over } = layout;
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) blit(base[j * N + i], i, j);
  for (let k = 0; k < over.length; k += 3) blit(over[k + 2], over[k], over[k + 1]);
  // мягкое затемнение полей за краем мира (граница читается, но не обрывается)
  const m = MARGIN * TEX, S = cv.width;
  const vg = (x0, y0, x1, y1) => { const gr = g.createLinearGradient(x0, y0, x1, y1); gr.addColorStop(0, 'rgba(8,6,18,0.75)'); gr.addColorStop(1, 'rgba(8,6,18,0)'); return gr; };
  g.fillStyle = vg(0, 0, m, 0); g.fillRect(0, 0, m, S);
  g.fillStyle = vg(S, 0, S - m, 0); g.fillRect(S - m, 0, m, S);
  g.fillStyle = vg(0, 0, 0, m); g.fillRect(0, 0, S, m);
  g.fillStyle = vg(0, S, 0, S - m); g.fillRect(0, S - m, S, m);
  return cv;
}

// 3D-объект земли + пропсов; возвращает { group, setLight(k) }
export async function buildTerrain(THREE, world) {
  // Аринар 48000 px — стриминг чанков (terrainChunks.js): целиком мир в одну текстуру не влезает
  if (world === 'arinar') { const t = await new ArinarTerrain(THREE).init(); return t; }
  const L = layoutWorld(world);
  const group = new THREE.Group();
  group.name = 'terrain-' + L.world;
  const cv = await bakeGround(L);
  const tex = new THREE.CanvasTexture(cv);
  tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.LinearMipMapLinearFilter; tex.anisotropy = 4;
  const span = (L.N * CELL) / PX; // метры
  // пиксели «как есть» (без пересвета от hemi/sun), общий тон — множителем; туман применяется
  const mat = new THREE.MeshBasicMaterial({ map: tex, color: 0xd6d2e0 });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(span, span), mat);
  ground.rotation.x = -Math.PI / 2;
  const c0 = -MARGIN * CELL + (L.N * CELL) / 2;
  ground.position.set(toX(c0), 0, toZ(c0));
  ground.receiveShadow = true;
  ground.name = 'ground';
  group.add(ground);

  // пропсы v2: варианты и фаза анимации — по позиции, кадры играет шейдер
  const ptex = await loadPropTextures(THREE);
  const batch = new PropSprites(THREE, ptex, { max: L.props.length + 8, parent: group });
  batch.begin();
  for (const p of L.props) batch.push(p.k, p.x, p.y, toX(p.x), toZ(p.y), p.s, p.f);
  batch.end();
  for (const B of batch.list) B.mesh.name = 'props';
  return { group, layout: L, ground, batch, setLight: (k) => { batch.setLight(k); mat.color.setScalar(0.84 * k); } };
}
