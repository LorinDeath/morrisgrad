// Снаряды и эффекты — 2D-спрайты (PNG-атлас) на инстансированных квадах: один draw call на батч.
// Режимы квада (iSize.z):
//   0 — билборд к камере, поворот на iSize.w (вращение «волчком»);
//   1 — билборд к камере, повёрнут по направлению полёта iDir (мир XZ → экран) + iSize.w;
//   2 — квад на земле (плоскость XZ), повёрнут по iDir (+ iSize.w): лужи, глифы, ударные кольца.
// Два батча на сцену: «спрайты» (обычное смешивание, атлас proj_atlas.png, NearestFilter — пиксель-арт)
// и «свечение» (аддитивное, процедурная мягкая текстура) — под каждым снарядом ореол и шлейф.
// Горячий цикл без аллокаций: push() пишет только в Float32Array.

const VERT = `
attribute vec3 iPos;
attribute vec4 iSize;   // w, h, mode, rot
attribute vec2 iDir;    // направление в мире (x, z)
attribute vec4 iUV;     // u0, v0, du, dv
attribute vec4 iCol;    // r, g, b, a
varying vec2 vUv;
varying vec4 vCol;
void main() {
  vec2 q = position.xy * iSize.xy;
  float dl = length(iDir);
  vec4 mv;
  if (iSize.z > 1.5) {
    float a = (dl > 0.0001 ? atan(iDir.y, iDir.x) : 0.0) + iSize.w;
    float c = cos(a), s = sin(a);
    // локальный x — вдоль направления, y — поперёк (в плоскости земли)
    vec3 w = iPos + vec3(q.x * c - q.y * s, 0.0, q.x * s + q.y * c);
    mv = modelViewMatrix * vec4(w, 1.0);
  } else {
    mv = modelViewMatrix * vec4(iPos, 1.0);
    float a = iSize.w;
    if (iSize.z > 0.5 && dl > 0.0001) {
      vec3 d = (modelViewMatrix * vec4(iDir.x, 0.0, iDir.y, 0.0)).xyz;
      a += atan(d.y, d.x);
    }
    float c = cos(a), s = sin(a);
    mv.xy += vec2(q.x * c - q.y * s, q.x * s + q.y * c);
  }
  vUv = vec2(iUV.x + uv.x * iUV.z, iUV.y + uv.y * iUV.w);
  vCol = iCol;
  gl_Position = projectionMatrix * mv;
}`;

const FRAG = `
uniform sampler2D map;
uniform float uAdd;
varying vec2 vUv;
varying vec4 vCol;
void main() {
  vec4 c = texture2D(map, vUv);
  if (uAdd > 0.5) {
    gl_FragColor = vec4(c.rgb * vCol.rgb * vCol.a * c.a, 1.0);
  } else {
    float a = c.a * vCol.a;
    if (a < 0.04) discard;
    gl_FragColor = vec4(c.rgb * vCol.rgb, a);
  }
}`;

export class ProjBatch {
  /**
   * @param texture атлас (THREE.Texture)
   * @param opts { cols, rows, max, additive, nearest, renderOrder }
   */
  constructor(THREE, texture, { cols, rows, max = 1024, additive = false, nearest = true, renderOrder = 4 }) {
    this.cols = cols; this.rows = rows; this.max = max;
    this.du = 1 / cols; this.dv = 1 / rows;
    if (nearest) { texture.magFilter = THREE.NearestFilter; texture.minFilter = THREE.NearestFilter; texture.generateMipmaps = false; }
    else { texture.magFilter = THREE.LinearFilter; texture.minFilter = THREE.LinearFilter; texture.generateMipmaps = false; }
    texture.needsUpdate = true;
    const base = new THREE.PlaneBufferGeometry(1, 1);
    const geo = new THREE.InstancedBufferGeometry();
    geo.index = base.index;
    geo.setAttribute('position', base.attributes.position);
    geo.setAttribute('uv', base.attributes.uv);
    const mk = (n) => { const a = new THREE.InstancedBufferAttribute(new Float32Array(max * n), n); a.setUsage(THREE.DynamicDrawUsage); return a; };
    this.aPos = mk(3); this.aSize = mk(4); this.aDir = mk(2); this.aUV = mk(4); this.aCol = mk(4);
    geo.setAttribute('iPos', this.aPos); geo.setAttribute('iSize', this.aSize); geo.setAttribute('iDir', this.aDir);
    geo.setAttribute('iUV', this.aUV); geo.setAttribute('iCol', this.aCol);
    geo.instanceCount = 0;
    this.geo = geo;
    this.material = new THREE.ShaderMaterial({
      uniforms: { map: { value: texture }, uAdd: { value: additive ? 1 : 0 } },
      vertexShader: VERT, fragmentShader: FRAG,
      transparent: true, depthWrite: false, depthTest: true, side: THREE.DoubleSide,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = renderOrder;
    this.n = 0;
  }

  begin() { this.n = 0; }

  // x,y,z — центр; w,h — размер (м); mode 0/1/2; rot — доп. поворот; dx,dz — направление; col,row — ячейка
  push(x, y, z, w, h, mode, rot, dx, dz, col, row, r = 1, g = 1, b = 1, a = 1) {
    const i = this.n;
    if (i >= this.max) return false;
    this.n++;
    const p = this.aPos.array, s = this.aSize.array, d = this.aDir.array, u = this.aUV.array, c = this.aCol.array;
    p[i * 3] = x; p[i * 3 + 1] = y; p[i * 3 + 2] = z;
    s[i * 4] = w; s[i * 4 + 1] = h; s[i * 4 + 2] = mode; s[i * 4 + 3] = rot;
    d[i * 2] = dx; d[i * 2 + 1] = dz;
    u[i * 4] = col * this.du; u[i * 4 + 1] = 1 - (row + 1) * this.dv; u[i * 4 + 2] = this.du; u[i * 4 + 3] = this.dv;
    c[i * 4] = r; c[i * 4 + 1] = g; c[i * 4 + 2] = b; c[i * 4 + 3] = a;
    return true;
  }

  end() {
    this.geo.instanceCount = this.n;
    const upd = (a) => { a.needsUpdate = true; a.updateRange.offset = 0; a.updateRange.count = Math.max(1, this.n) * a.itemSize; };
    upd(this.aPos); upd(this.aSize); upd(this.aDir); upd(this.aUV); upd(this.aCol);
  }

  dispose() { this.geo.dispose(); this.material.dispose(); }
}

// Процедурная текстура свечения: 4 ячейки в ряд — мягкий шар, шлейф-«капля», звёздочка, кольцо.
export const GLOW = { ball: 0, streak: 1, star: 2, ring: 3 };
let glowTex = null;
export function glowTexture(THREE) {
  if (glowTex) return glowTex;
  const S = 64;
  const cv = document.createElement('canvas');
  cv.width = S * 4; cv.height = S;
  const g = cv.getContext('2d');
  // мягкий шар
  let gr = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.25, 'rgba(255,255,255,0.55)');
  gr.addColorStop(0.6, 'rgba(255,255,255,0.14)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, S, S);
  // шлейф: яркая голова справа, хвост гаснет влево
  g.save(); g.translate(S, 0);
  const lin = g.createLinearGradient(0, 0, S, 0);
  lin.addColorStop(0, 'rgba(255,255,255,0)'); lin.addColorStop(0.8, 'rgba(255,255,255,0.7)'); lin.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = lin;
  g.beginPath(); g.moveTo(0, S / 2); g.quadraticCurveTo(S * 0.7, S * 0.18, S, S / 2); g.quadraticCurveTo(S * 0.7, S * 0.82, 0, S / 2); g.fill();
  g.restore();
  // звёздочка-блик
  g.save(); g.translate(S * 2 + S / 2, S / 2);
  gr = g.createRadialGradient(0, 0, 0, 0, 0, S / 2);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.15, 'rgba(255,255,255,0.5)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr;
  for (let k = 0; k < 4; k++) { g.rotate(Math.PI / 4); g.fillRect(-S / 2, -1.5, S, 3); }
  g.beginPath(); g.arc(0, 0, S * 0.18, 0, Math.PI * 2); g.fill();
  g.restore();
  // кольцо
  gr = g.createRadialGradient(S * 3.5, S / 2, S * 0.28, S * 3.5, S / 2, S / 2);
  gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.55, 'rgba(255,255,255,0.9)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(S * 3, 0, S, S);
  glowTex = new THREE.CanvasTexture(cv);
  return glowTex;
}
