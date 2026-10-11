// Утилиты низкополигональной геометрии: покраска вершин и слияние деталей в один меш.
// Слитая геометрия с цветами вершин рисуется одним draw call (важно для InstancedMesh орды).

export function paint(THREE, geo, color) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  const c = new THREE.Color(color);
  const n = g.attributes.position.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return g;
}

// part: { geo, color, pos:[x,y,z], rot:[x,y,z], scale:[x,y,z] }
export function mergeParts(THREE, parts) {
  const geos = parts.map((p) => {
    let g = p.geo.clone();
    if (p.scale) g.scale(p.scale[0], p.scale[1], p.scale[2]);
    if (p.rot) {
      g.rotateX(p.rot[0] || 0); g.rotateY(p.rot[1] || 0); g.rotateZ(p.rot[2] || 0);
    }
    if (p.pos) g.translate(p.pos[0], p.pos[1], p.pos[2]);
    return paint(THREE, g, p.color);
  });
  let total = 0;
  geos.forEach((g) => { total += g.attributes.position.count; });
  const pos = new Float32Array(total * 3);
  const nor = new Float32Array(total * 3);
  const col = new Float32Array(total * 3);
  let o = 0;
  geos.forEach((g) => {
    if (!g.attributes.normal) g.computeVertexNormals();
    pos.set(g.attributes.position.array, o * 3);
    nor.set(g.attributes.normal.array, o * 3);
    col.set(g.attributes.color.array, o * 3);
    o += g.attributes.position.count;
    g.dispose();
  });
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  out.computeBoundingSphere();
  return out;
}

export function flatMat(THREE, opts = {}) {
  return new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.75, metalness: 0.05, ...opts });
}

// Перевод мировых пикселей сервера (0..1200) в 3D-единицы: 20 px = 1 м (как «метры» в HUD).
export const PX = 20;
export const WORLD_PX = 1200;
export const HALF = WORLD_PX / PX / 2; // 30
export const toX = (px) => px / PX - HALF;
export const toZ = (py) => py / PX - HALF;
export const toPx = (x) => (x + HALF) * PX;
export const toPy = (z) => (z + HALF) * PX;
