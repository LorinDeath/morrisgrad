// Сундук схватки — пиксель-арт (рисуется кодом, 32×28 на кадр): дерево, железные полосы, заклёпки, замок.
// Кадры: 0 — закрыт, 1 — открыт (крышка поднята, золото светится). Отдельный аддитивный батч — ореол (личный — золото,
// общий — серый/холодный, канал — пульс). Рисуется поверх пропсов (depthTest off, высокий renderOrder): виден за деревьями.
import { SpriteBatch } from './spriteBatch.js';
import { glowK, curseRGB } from '../meta/curseCfg.js';
const W = 32, H = 28;
const C = { o: '#140c08', wd: '#6b3f1f', wl: '#8a5629', wh: '#a8703a', ws: '#4a2a14', fe: '#3b3f4a', fl: '#7b8494', fh: '#b9c2cf', gd: '#e0b44f', gl: '#fde68a', gk: '#8a6416', in: '#1e120a' };
function px(g, x, y, w, h, c) { g.fillStyle = c; g.fillRect(x, y, w, h); }
function body(g, ox) { // корпус (нижняя часть), ширина 26, x 3..28, y 14..26
  px(g, ox + 3, 14, 26, 13, C.o); px(g, ox + 4, 15, 24, 11, C.wd);
  for (let y = 17; y < 26; y += 3) px(g, ox + 4, y, 24, 1, C.ws); // доски
  px(g, ox + 4, 15, 24, 1, C.wl);
  px(g, ox + 7, 15, 3, 11, C.fe); px(g, ox + 22, 15, 3, 11, C.fe); px(g, ox + 8, 15, 1, 11, C.fl); px(g, ox + 23, 15, 1, 11, C.fl); // полосы
  for (const x of [8, 23]) for (const y of [17, 23]) px(g, ox + x, y, 1, 1, C.fh); // заклёпки
  px(g, ox + 4, 25, 24, 1, C.ws);
}
function lidClosed(g, ox) { // крышка-арка y 5..14
  px(g, ox + 5, 4, 22, 1, C.o); px(g, ox + 4, 5, 24, 1, C.o); px(g, ox + 3, 6, 26, 9, C.o);
  px(g, ox + 5, 5, 22, 1, C.wh); px(g, ox + 4, 6, 24, 8, C.wd); px(g, ox + 4, 6, 24, 2, C.wl); px(g, ox + 4, 10, 24, 1, C.ws);
  px(g, ox + 7, 5, 3, 9, C.fe); px(g, ox + 22, 5, 3, 9, C.fe); px(g, ox + 8, 5, 1, 9, C.fh); px(g, ox + 23, 5, 1, 9, C.fh);
  px(g, ox + 3, 13, 26, 2, C.fe); px(g, ox + 3, 13, 26, 1, C.fl); // обод
  // замок
  px(g, ox + 13, 11, 6, 7, C.o); px(g, ox + 14, 12, 4, 5, C.gd); px(g, ox + 14, 12, 4, 1, C.gl); px(g, ox + 15, 14, 2, 2, C.gk); px(g, ox + 15, 16, 2, 1, C.o);
}
function lidOpen(g, ox) { // открыт: внутренность с золотом, крышка откинута назад (тонкая полоса сверху)
  px(g, ox + 3, 1, 26, 7, C.o); px(g, ox + 4, 2, 24, 5, C.wd); px(g, ox + 4, 2, 24, 1, C.wl); px(g, ox + 7, 2, 3, 5, C.fe); px(g, ox + 22, 2, 3, 5, C.fe);
  px(g, ox + 3, 8, 26, 7, C.o); px(g, ox + 4, 9, 24, 5, C.in);
  for (const [x, y, c] of [[6, 11, C.gd], [9, 10, C.gl], [12, 11, C.gd], [15, 9, C.gl], [17, 10, C.gd], [20, 11, C.gl], [23, 10, C.gd], [11, 12, C.gk], [19, 12, C.gk], [14, 12, C.gd]]) px(g, ox + x, y, 3, 2, c);
  px(g, ox + 15, 8, 2, 1, '#ffffff'); px(g, ox + 21, 9, 1, 1, '#ffffff');
  px(g, ox + 3, 13, 26, 2, C.fe); px(g, ox + 3, 13, 26, 1, C.fl);
  px(g, ox + 14, 14, 4, 3, C.gd); px(g, ox + 15, 15, 2, 1, C.gk); // открытый замок
}
function outline(src) { // контур по силуэту (пиксельная дилатация 2 px) + слабое внутреннее свечение
  const w = src.width, h = src.height, a = src.getContext('2d').getImageData(0, 0, w, h).data;
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h; const g = cv.getContext('2d'), out = g.createImageData(w, h), o = out.data;
  const on = (x, y) => x >= 0 && y >= 0 && x < w && y < h && a[(y * w + x) * 4 + 3] > 0 && Math.floor(x / W) === Math.floor(x / W);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let v = 0;
    if (on(x, y)) v = 0.16; else { let d = 9; for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) if (Math.floor((x + dx) / W) === Math.floor(x / W) && on(x + dx, y + dy)) d = Math.min(d, Math.max(Math.abs(dx), Math.abs(dy))); v = d === 1 ? 1 : d === 2 ? 0.45 : 0; }
    const i = (y * w + x) * 4; o[i] = o[i + 1] = o[i + 2] = 255; o[i + 3] = Math.round(v * 255);
  }
  g.putImageData(out, 0, 0); return cv;
}
function canvas(draw) { const cv = document.createElement('canvas'); cv.width = W * 2; cv.height = H; draw(cv.getContext('2d')); return cv; }
const tex = (THREE, cv) => { const t = new THREE.CanvasTexture(cv); t.needsUpdate = true; return t; };
export class ChestSprites {
  constructor(THREE, parent) {
    const bc = canvas((g) => { body(g, 0); lidClosed(g, 0); body(g, W); lidOpen(g, W); });
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
    const h = 1.15 * k, open = st === 'open' ? 1 : 0;
    const shake = st === 'chan' ? Math.sin(T * 38) * 0.06 * k : 0, lift = st === 'chan' ? Math.abs(Math.sin(T * 19)) * 0.05 : 0;
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
