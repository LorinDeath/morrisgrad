// Генерация 3D-моделей из пиксель-арт спрайтов проекта.
// Каждый непрозрачный пиксель кадра → столбик вокселей; толщина растёт от контура к центру
// (дистанционное преобразование силуэта), поэтому фигура получается «пухлой», а не плоской.
// Строится только внешняя поверхность (лицо/спина/боковые стенки), цвет — из пикселя спрайта.
import { SHEETS, WALK_SEQUENCE, directionRow } from './spriteSheets.js';

const imageCache = new Map();
const frameCache = new Map();
const geoCache = new Map();
const texCache = new Map();

export function loadSheetImage(kind) {
  const def = SHEETS[kind];
  if (!def) return Promise.reject(new Error('Нет листа ' + kind));
  if (imageCache.has(kind)) return imageCache.get(kind);
  const p = new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Не загрузился спрайт ' + kind));
    img.src = def.src;
  });
  imageCache.set(kind, p);
  return p;
}

// Кадры 3×4 + общая обрезка: одинаковая для всех кадров, чтобы ноги стояли на земле.
export function extractFrames(kind, img) {
  if (frameCache.has(kind)) return frameCache.get(kind);
  const def = SHEETS[kind];
  const fw = Math.floor(img.naturalWidth / def.sheetCols);
  const fh = Math.floor(img.naturalHeight / def.sheetRows);
  const cv = document.createElement('canvas');
  cv.width = fw * 3; cv.height = fh * 4;
  const cx = cv.getContext('2d', { willReadFrequently: true });
  cx.drawImage(img, 0, 0, fw * 3, fh * 4, 0, 0, fw * 3, fh * 4);
  const all = cx.getImageData(0, 0, fw * 3, fh * 4).data;
  let minX = fw, maxX = -1, minY = fh, maxY = -1;
  const frames = [];
  for (let r = 0; r < 4; r++) {
    frames[r] = [];
    for (let c = 0; c < 3; c++) {
      const px = new Uint8ClampedArray(fw * fh * 4);
      for (let y = 0; y < fh; y++) {
        for (let x = 0; x < fw; x++) {
          const si = ((r * fh + y) * fw * 3 + c * fw + x) * 4;
          const di = (y * fw + x) * 4;
          px[di] = all[si]; px[di + 1] = all[si + 1]; px[di + 2] = all[si + 2]; px[di + 3] = all[si + 3];
          if (all[si + 3] > 96) {
            if (x < minX) minX = x; if (x > maxX) maxX = x;
            if (y < minY) minY = y; if (y > maxY) maxY = y;
          }
        }
      }
      frames[r][c] = { w: fw, h: fh, data: px };
    }
  }
  const out = { frames, fw, fh, bounds: { minX, maxX, minY, maxY } };
  frameCache.set(kind, out);
  return out;
}

function srgbToLinear(c) {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

// Воксельная геометрия одного кадра.
export function voxelizeFrame(THREE, frame, bounds, { voxel, maxDepth = 4, mirrorBack = true } = {}) {
  const { w, h, data } = frame;
  const solid = (x, y) => x >= 0 && y >= 0 && x < w && y < h && data[(y * w + x) * 4 + 3] > 96;
  // Дистанция до контура (Чебышёв), даёт толщину
  const dist = new Int16Array(w * h);
  const INF = 999;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) dist[y * w + x] = solid(x, y) ? INF : 0;
  for (let pass = 0; pass < 2; pass++) {
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        if (!dist[i]) continue;
        let m = dist[i];
        const nb = pass === 0 ? [[-1, 0], [0, -1], [-1, -1], [1, -1]] : [[1, 0], [0, 1], [1, 1], [-1, 1]];
        for (const [dx, dy] of nb) {
          const nx = x + dx, ny = y + dy;
          const v = (nx < 0 || ny < 0 || nx >= w || ny >= h) ? 0 : dist[ny * w + nx];
          if (v + 1 < m) m = v + 1;
        }
        dist[i] = m;
      }
    }
    if (pass === 0) {
      // обратный проход
      for (let y = h - 1; y >= 0; y--) {
        for (let x = w - 1; x >= 0; x--) {
          const i = y * w + x;
          if (!dist[i]) continue;
          let m = dist[i];
          for (const [dx, dy] of [[1, 0], [0, 1], [1, 1], [-1, 1]]) {
            const nx = x + dx, ny = y + dy;
            const v = (nx < 0 || ny < 0 || nx >= w || ny >= h) ? 0 : dist[ny * w + nx];
            if (v + 1 < m) m = v + 1;
          }
          dist[i] = m;
        }
      }
      break;
    }
  }
  const depth = (x, y) => (solid(x, y) ? Math.min(maxDepth, dist[y * w + x]) : 0);

  const pos = [];
  const nor = [];
  const col = [];
  const cxm = (bounds.minX + bounds.maxX + 1) / 2;
  const footY = bounds.maxY + 1;
  const X = (x) => (x - cxm) * voxel;
  const Y = (y) => (footY - y) * voxel;
  const Z = (d) => d * voxel * 0.5;

  const quad = (a, b, c, d, n, rgb) => {
    pos.push(...a, ...b, ...c, ...a, ...c, ...d);
    for (let i = 0; i < 6; i++) { nor.push(n[0], n[1], n[2]); col.push(rgb[0], rgb[1], rgb[2]); }
  };

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!solid(x, y)) continue;
      const i = (y * w + x) * 4;
      const rgb = [srgbToLinear(data[i] / 255), srgbToLinear(data[i + 1] / 255), srgbToLinear(data[i + 2] / 255)];
      const side = [rgb[0] * 0.8, rgb[1] * 0.8, rgb[2] * 0.8];
      const d = depth(x, y);
      const x0 = X(x), x1 = X(x + 1), y0 = Y(y + 1), y1 = Y(y);
      const zf = Z(d), zb = -Z(d);
      // Лицо (к камере, +Z) и спина
      quad([x0, y0, zf], [x1, y0, zf], [x1, y1, zf], [x0, y1, zf], [0, 0, 1], rgb);
      quad([x1, y0, zb], [x0, y0, zb], [x0, y1, zb], [x1, y1, zb], [0, 0, -1], mirrorBack ? side : rgb);
      // Боковые стенки там, где сосед тоньше
      const sides = [
        [x - 1, y, [-1, 0, 0]], [x + 1, y, [1, 0, 0]], [x, y - 1, [0, 1, 0]], [x, y + 1, [0, -1, 0]],
      ];
      for (const [nx, ny, n] of sides) {
        const nd = depth(nx, ny);
        if (nd >= d) continue;
        const zf2 = Z(d), zn = Z(nd);
        // передняя часть стенки (от соседней толщины до своей) и задняя симметрично
        const segs = [[zn, zf2], [-zf2, -zn]];
        for (const [za, zb2] of segs) {
          if (zb2 - za <= 1e-6) continue;
          if (n[0] === -1) quad([x0, y0, za], [x0, y0, zb2], [x0, y1, zb2], [x0, y1, za], n, side);
          else if (n[0] === 1) quad([x1, y0, zb2], [x1, y0, za], [x1, y1, za], [x1, y1, zb2], n, side);
          else if (n[1] === 1) quad([x0, y1, zb2], [x1, y1, zb2], [x1, y1, za], [x0, y1, za], n, rgb);
          else quad([x0, y0, za], [x1, y0, za], [x1, y0, zb2], [x0, y0, zb2], n, side);
        }
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeBoundingSphere();
  return g;
}

export function voxelSize(kind, bounds) {
  const def = SHEETS[kind];
  const hPx = Math.max(1, bounds.maxY - bounds.minY + 1);
  return def.heightM / hPx;
}

// 12 геометрий (4 направления × 3 шага) для вида; кэш на всю игру
export function getVoxelFrames(THREE, kind, img) {
  if (geoCache.has(kind)) return geoCache.get(kind);
  const { frames, bounds, fh } = extractFrames(kind, img);
  const voxel = voxelSize(kind, bounds);
  const maxDepth = fh > 30 ? 9 : 4;
  const geos = frames.map((row) => row.map((f) => voxelizeFrame(THREE, f, bounds, { voxel, maxDepth })));
  const out = { geos, voxel, bounds };
  geoCache.set(kind, out);
  return out;
}

// Текстуры кадров для запасного режима «спрайт-билборды»
export function getFrameTextures(THREE, kind, img) {
  if (texCache.has(kind)) return texCache.get(kind);
  const { frames, bounds } = extractFrames(kind, img);
  const tex = frames.map((row) => row.map((f) => {
    const cv = document.createElement('canvas');
    cv.width = f.w; cv.height = f.h;
    cv.getContext('2d').putImageData(new ImageData(f.data, f.w, f.h), 0, 0);
    const t = new THREE.CanvasTexture(cv);
    t.magFilter = THREE.NearestFilter;
    t.minFilter = THREE.NearestFilter;
    if (THREE.sRGBEncoding) t.encoding = THREE.sRGBEncoding;
    return t;
  }));
  const out = { tex, bounds, fw: frames[0][0].w, fh: frames[0][0].h };
  texCache.set(kind, out);
  return out;
}

// Персонаж из спрайта: mode 'voxel' (по умолчанию) или 'sprite' (билборд).
export class SpriteCharacter {
  static LEAN = 0.55;

  constructor(THREE, kind, img, mode = 'voxel') {
    this.THREE = THREE;
    this.kind = kind;
    this.mode = mode;
    this.group = new THREE.Group();
    this.row = 0;
    this.col = 1;
    this.phase = 0;
    if (mode === 'sprite') {
      const { tex, bounds, fw, fh } = getFrameTextures(THREE, kind, img);
      this.tex = tex;
      const hM = SHEETS[kind].heightM;
      const scale = hM / (bounds.maxY - bounds.minY + 1);
      const geo = new THREE.PlaneGeometry(fw * scale, fh * scale);
      const footOffset = (fh - (bounds.maxY + 1)) * scale;
      geo.translate(0, (fh * scale) / 2 - footOffset, 0);
      this.mat = new THREE.MeshStandardMaterial({ map: tex[0][1], transparent: true, alphaTest: 0.4, side: THREE.DoubleSide, roughness: 1 });
      this.mesh = new THREE.Mesh(geo, this.mat);
      this.mesh.castShadow = true;
      this.billboard = true;
    } else {
      const { geos } = getVoxelFrames(THREE, kind, img);
      this.geos = geos;
      this.mat = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.8, metalness: 0.0, side: THREE.DoubleSide });
      this.mesh = new THREE.Mesh(geos[0][1], this.mat);
      this.mesh.castShadow = true;
      this.mesh.receiveShadow = false;
    }
    // Лёгкий наклон назад: камера смотрит сверху под ~53°, без наклона фигура «сплющивается».
    // Наклон держит лицо персонажа почти перпендикулярно взгляду (приём HD-2D), но объём и тени остаются.
    this.lean = new THREE.Group();
    this.lean.rotation.x = -SpriteCharacter.LEAN;
    this.lean.add(this.mesh);
    this.group.add(this.lean);
  }

  setFrame(row, col) {
    if (row === this.row && col === this.col) return;
    this.row = row; this.col = col;
    if (this.mode === 'sprite') {
      this.mat.map = this.tex[row][col];
      this.mat.needsUpdate = true;
    } else {
      this.mesh.geometry = this.geos[row][col];
    }
  }

  // dirX/dirY — направление взгляда в координатах мира (x вправо, y «вниз» = к камере)
  update(dt, moving, t, dirX = 0, dirY = 1, camera = null) {
    const row = directionRow(dirX, dirY);
    if (moving) this.phase += dt * 7.7; // ≈130 мс на кадр, как в 2D
    const col = moving ? WALK_SEQUENCE[Math.floor(this.phase) % 4] : 1;
    this.setFrame(row, col);
    this.mesh.position.y = moving ? Math.abs(Math.sin(this.phase * Math.PI / 2)) * 0.05 : 0;
  }

  setTint(hex, k = 0) {
    if (!this.mat.emissive) return;
    this.mat.emissive.setHex(hex);
    this.mat.emissiveIntensity = k;
  }
}
