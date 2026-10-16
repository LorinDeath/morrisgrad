// Сундук схватки — пиксель-арт (рисуется кодом, 26×19 на кадр): дерево, железные полосы, заклёпки, замок.
// Кадры: 0 — закрыт, 1 — открыт (крышка поднята, золото светится). Отдельный аддитивный батч — ореол (личный — золото,
// общий — серый/холодный, канал — пульс). Рисуется поверх пропсов (depthTest off, высокий renderOrder): виден за деревьями.
import { SpriteBatch } from './spriteBatch.js';
import { glowK, curseRGB } from '../meta/curseCfg.js';
// Единый стиль пропсов (props_p32: бочка/ящик): ~10 px текстуры на 1 м, контур 1 px #1a1626, тёплое дерево с зерном,
// «лиловое» железо, свет сверху-слева. Кадр 26×19 (сам сундук 22×17 + поля 2 px под ореол), высота билборда 1.9 м.
const W = 26, H = 19, HM = H / 10;
const C = { o: '#1a1626', wd: '#4a2c14', wm: '#7d4d22', wl: '#966230', wh: '#b08a70', wg: '#6b4a3a',
  fe: '#3d3452', fm: '#7d6f91', fh: '#b4aac6', gd: '#e0b44f', gl: '#fde68a', gk: '#8a6416', in: '#120d18' };
function px(g, x, y, w, h, c) { g.fillStyle = c; g.fillRect(x, y, w, h); }
function body(g, ox) { // корпус: x 3..22, y 10..17
  px(g, ox + 3, 10, 20, 8, C.wm);
  px(g, ox + 3, 13, 20, 1, C.wg); px(g, ox + 3, 16, 20, 1, C.wg); // доски
  px(g, ox + 3, 10, 1, 8, C.wl); px(g, ox + 22, 10, 1, 8, C.wd); px(g, ox + 3, 17, 20, 1, C.wd); // свет слева, тень справа/снизу
  for (const [x, y] of [[9, 11], [16, 14], [12, 17]]) px(g, ox + x, y, 2, 1, C.wh); // зерно
  for (const x of [6, 18]) { px(g, ox + x, 10, 2, 8, C.fe); px(g, ox + x, 10, 1, 8, C.fm); px(g, ox + x, 12, 1, 1, C.fh); px(g, ox + x, 16, 1, 1, C.fh); } // полосы, заклёпки
}
function lidClosed(g, ox) { // крышка-арка y 3..9
  px(g, ox + 5, 3, 16, 1, C.wl); px(g, ox + 4, 4, 18, 1, C.wl); px(g, ox + 3, 5, 20, 4, C.wm);
  px(g, ox + 3, 7, 20, 1, C.wg); px(g, ox + 22, 5, 1, 4, C.wd); px(g, ox + 6, 4, 4, 1, C.wh);
  for (const x of [6, 18]) { px(g, ox + x, 4, 2, 5, C.fe); px(g, ox + x, 4, 1, 5, C.fm); }
  px(g, ox + 3, 9, 20, 1, C.fe); px(g, ox + 3, 9, 20, 1, C.fm); px(g, ox + 22, 9, 1, 1, C.fe); // обод
  px(g, ox + 11, 8, 4, 4, C.gk); px(g, ox + 11, 8, 3, 3, C.gd); px(g, ox + 11, 8, 2, 1, C.gl); px(g, ox + 12, 10, 1, 1, C.o); // замок
}
function lidOpen(g, ox) { // крышка откинута назад (внутренняя сторона), внутри — золото
  px(g, ox + 4, 1, 18, 1, C.wd); px(g, ox + 3, 2, 20, 4, C.wd); px(g, ox + 4, 2, 18, 1, C.wg);
  for (const x of [6, 18]) px(g, ox + x, 1, 2, 5, C.fe);
  px(g, ox + 3, 6, 20, 4, C.in);
  for (const [x, y, c] of [[5, 7, C.gd], [8, 6, C.gl], [11, 7, C.gd], [14, 6, C.gl], [17, 7, C.gd], [19, 8, C.gk], [7, 8, C.gk], [13, 8, C.gd]]) px(g, ox + x, y, 3, 2, c);
  px(g, ox + 9, 6, 1, 1, '#ffffff'); px(g, ox + 15, 6, 1, 1, '#ffffff');
  px(g, ox + 3, 9, 20, 1, C.fm);
  px(g, ox + 12, 10, 2, 2, C.gd); // открытый замок
}
function ink(g, ox) { // контур 1 px по силуэту (как у пропсов)
  const d = g.getImageData(ox, 0, W, H), a = d.data, m = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) m[i] = a[i * 4 + 3] > 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (!m[y * W + x]) {
    let n = false; for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const X = x + dx, Y = y + dy; if (X >= 0 && Y >= 0 && X < W && Y < H && m[Y * W + X]) n = true; }
    if (n) { const i = (y * W + x) * 4; a[i] = 26; a[i + 1] = 22; a[i + 2] = 38; a[i + 3] = 255; }
  }
  g.putImageData(d, ox, 0);
}
function outline(src) { // контур по силуэту (пиксельная дилатация 2 px) + слабое внутреннее свечение
  const w = src.width, h = src.height, a = src.getContext('2d').getImageData(0, 0, w, h).data;
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h; const g = cv.getContext('2d'), out = g.createImageData(w, h), o = out.data;
  const on = (x, y) => x >= 0 && y >= 0 && x < w && y < h && a[(y * w + x) * 4 + 3] > 0 && Math.floor(x / W) === Math.floor(x / W);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let v = 0;
    if (on(x, y)) v = 0.07; else { let d = 9; for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) if (Math.floor((x + dx) / W) === Math.floor(x / W) && on(x + dx, y + dy)) d = Math.min(d, Math.max(Math.abs(dx), Math.abs(dy))); v = d === 1 ? 1 : d === 2 ? 0.45 : 0; }
    const i = (y * w + x) * 4; o[i] = o[i + 1] = o[i + 2] = 255; o[i + 3] = Math.round(v * 255);
  }
  g.putImageData(out, 0, 0); return cv;
}
function canvas(draw) { const cv = document.createElement('canvas'); cv.width = W * 2; cv.height = H; draw(cv.getContext('2d')); return cv; }
const tex = (THREE, cv) => { const t = new THREE.CanvasTexture(cv); t.needsUpdate = true; return t; };
export class ChestSprites {
  constructor(THREE, parent) {
    const bc = canvas((g) => { body(g, 0); lidClosed(g, 0); body(g, W); lidOpen(g, W); ink(g, 0); ink(g, W); });
    const base = tex(THREE, bc), halo = tex(THREE, outline(bc)), halo2 = tex(THREE, outline(bc));
    this.b = new SpriteBatch(THREE, base, { cellW: W, cellH: H, cols: 2, rows: 1, max: 64 });
    this.g = new SpriteBatch(THREE, halo, { cellW: W, cellH: H, cols: 2, rows: 1, max: 64, additive: true });
    this.gi = new SpriteBatch(THREE, halo2, { cellW: W, cellH: H, cols: 2, rows: 1, max: 64, additive: true }); // внутреннее свечение — поверх корпуса
    // корпус — обычная глубина (герой перед сундуком не перекрывается); «рентген» — только там, где сундук закрыт пропсами (GreaterDepth)
    this.x = new SpriteBatch(THREE, base, { cellW: W, cellH: H, cols: 2, rows: 1, max: 64 });
    this.x.material.depthFunc = THREE.GreaterDepth; this.x.material.depthWrite = false;
    for (const [B, ro, dt] of [[this.g, 9, false], [this.b, 10, true], [this.gi, 11, false], [this.x, 12, true]]) { B.material.depthTest = dt; if (B !== this.b) B.material.depthWrite = false; B.mesh.renderOrder = ro; parent.add(B.mesh); }
  }
  begin() { this.b.begin(); this.g.begin(); this.gi.begin(); this.x.begin(); }
  end() { this.b.end(); this.g.end(); this.gi.end(); this.x.end(); }
  /** c: {pub, mine}; st: 'closed'|'chan'|'open'; T — время */
  push(x, z, c, st, T, k = 1) {
    const h = HM * k, open = st === 'open' ? 1 : 0;
    const shake = st === 'chan' ? Math.round(Math.sin(T * 38) * 1.5) * 0.1 * k : 0, lift = st === 'chan' ? (Math.sin(T * 19) > 0.3 ? 0.1 : 0) : 0;
    const col = st === 'chan' ? [1.0, 0.85, 0.35] : !c.pub && c.mine ? [1.0, 0.78, 0.25] : c.pub ? [0.75, 0.8, 0.9] : [0.35, 0.35, 0.4];
    const pulse = st === 'chan' ? 0.7 + 0.3 * Math.sin(T * 10) : !c.pub && c.mine ? 0.75 + 0.25 * Math.sin(T * 3) : 0.55;
    if (!(c.cz > 0)) this.g.push(x + shake, lift, z, h, open, 0, false, col[0] * pulse, col[1] * pulse, col[2] * pulse, 0, 1); // проклятые — вместо золота/серого фиолетовый
    if (c.cz > 0) { // проклятые вещи внутри (видимые мне): фиолетовый контур + лёгкое внутреннее свечение, как у героя; 5 — максимум, пульс
      const n = Math.min(5, c.cz), K = glowK(n) * (n >= 5 ? 0.75 + 0.25 * Math.sin(T * 5) : 1), [r, g, b] = curseRGB();
      this.gi.push(x + shake, lift, z, h, open, 0, false, r * K * 2.4, g * K * 2.4, b * K * 2.4, 0, 1); // контур + внутреннее (одна маска)
    }
    this.b.push(x + shake, lift, z, h, open, 0, false, c.pub ? 0.9 : 1, c.pub ? 0.9 : 1, c.pub ? 0.92 : 1, 0, 1);
    this.x.push(x + shake, lift, z, h, open, 0, false, 1, 1, 1, 0, 0.45); // силуэт сквозь деревья
  }
}
