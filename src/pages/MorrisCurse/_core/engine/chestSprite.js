// Сундук схватки — анимированный лист assets/mc/chest/chest.png (24×22, 6×4: 0 idle_closed, 1 shake, 2 open, 3 idle_open; см. chest.json).
// Каждая ячейка при загрузке кладётся в ячейку с полями (CW×CH), чтобы ореолы не обрезались. Масштаб: сундук 16 px ≈ 1.1 м — по пояс
// герою (2.2 м). Сверху: золотой (личный) / серый (общий) контур — аддитивно; ореол проклятия — тот же алгоритм, что у героя
// (pixSprites.setCurseGlow), запечён на сверхвыборке для уровней 1..5. Тень — atmo.shadow (zoneView).
import { SpriteBatch, assetUrl } from './spriteBatch.js';
import { glowK, curseRGB } from '../meta/curseCfg.js';
import sheetSrc from '../../../../assets/mc/chest/chest.png';
import META from '../../../../assets/mc/chest/chest.json';

const SW = META.cell.w, SH = META.cell.h, COLS = 6, ROWS = 4;
const PL = 2, PT = 3, CW = SW + PL * 2, CH = SH + PT; // поля: по 2 px слева/справа, 3 сверху; низ (якорь) — как в листе
const PX_M = 16 / 1.1, HM = CH / PX_M, SS = 3;
const A = META.anims;

function padded(img) { // лист → лист с полями
  const cv = document.createElement('canvas'); cv.width = CW * COLS; cv.height = CH * ROWS; const g = cv.getContext('2d'); g.imageSmoothingEnabled = false;
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) g.drawImage(img, c * SW, r * SH, SW, SH, c * CW + PL, r * CH + PT, SW, SH);
  return cv;
}
function alphaOf(src) { const a = src.getContext('2d').getImageData(0, 0, src.width, src.height).data, w = src.width; return (x, y) => a[(y * w + x) * 4 + 3] / 255; }
function outline(src) { // золотой/серый контур: дилатация 2 px по ячейке + слабое внутреннее
  const w = src.width, h = src.height, al = alphaOf(src);
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h; const g = cv.getContext('2d'), out = g.createImageData(w, h), o = out.data;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const cx = Math.floor(x / CW), cy = Math.floor(y / CH), on = (X, Y) => Math.floor(X / CW) === cx && Math.floor(Y / CH) === cy && X >= 0 && Y >= 0 && X < w && Y < h && al(X, Y) > 0;
    let v = 0;
    if (on(x, y)) v = 0.07; else { let d = 9; for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) if (on(x + dx, y + dy)) d = Math.min(d, Math.max(Math.abs(dx), Math.abs(dy))); v = d === 1 ? 1 : d === 2 ? 0.45 : 0; }
    const i = (y * w + x) * 4; o[i] = o[i + 1] = o[i + 2] = 255; o[i + 3] = Math.round(v * 255);
  }
  g.putImageData(out, 0, 0); return cv;
}
// Ореол проклятия — CPU-копия шейдера героя: 8 направлений, внешний на 1.5·uR и 3·uR (вес 0.55), внутреннее у края 0.55 + 0.10 по телу,
// uR = 0.8 + 1.2·k (×0.6: на сплошном силуэте сундука, чтобы толщина на экране совпала с героем). Лист: 5 уровней × (6×4) ячеек ×SS.
// R — подмес белого (outer·0.15), A — плотность; яркость/пульс задаёт вершинная альфа (как uK у героя).
function curseMasks(src) {
  const al = alphaOf(src), fw = CW * SS, fh = CH * SS, cv = document.createElement('canvas'); cv.width = fw * COLS; cv.height = fh * ROWS * 5;
  const g = cv.getContext('2d'), out = g.createImageData(cv.width, cv.height), o = out.data;
  const sm = (e0, e1, v) => { const t = Math.min(1, Math.max(0, (v - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };
  for (let lv = 1; lv <= 5; lv++) { const uR = (0.8 + 1.2 * glowK(lv)) * 0.6;
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
      const S = (x, y) => { x = Math.floor(x / SS); y = Math.floor(y / SS); return x < 0 || y < 0 || x >= CW || y >= CH ? 0 : al(c * CW + x, r * CH + y); };
      for (let y = 0; y < fh; y++) for (let x = 0; x < fw; x++) {
        const px = x + 0.5, py = y + 0.5, a0 = S(px, py) >= 0.3 ? 1 : 0; let nOut = 0, nMin = 1;
        for (let i = 0; i < 8; i++) { const an = i * 0.785398, dx = Math.cos(an), dy = Math.sin(an);
          nOut = Math.max(nOut, S(px + dx * 1.5 * uR, py + dy * 1.5 * uR), S(px + dx * 3 * uR, py + dy * 3 * uR) * 0.55); nMin = Math.min(nMin, S(px + dx * 1.5, py + dy * 1.5)); }
        const outer = sm(0.2, 0.9, nOut) * (1 - a0), inner = a0 * (1 - sm(0.3, 1, nMin)) * 0.55 + a0 * 0.10;
        const i = ((((lv - 1) * ROWS + r) * fh + y) * cv.width + c * fw + x) * 4; o[i] = Math.round(outer * 0.15 * 255); o[i + 3] = Math.round(Math.min(1, outer + inner) * 255);
      }
    } }
  g.putImageData(out, 0, 0); return cv;
}
const tex = (THREE, cv) => { const t = new THREE.CanvasTexture(cv); t.needsUpdate = true; return t; };
// кадр анимации: st — 'closed'|'chan'|'open', t — секунд в текущем состоянии
export function chestFrame(st, t, T) {
  if (st === 'chan') { const a = A.shake; return [a.row, Math.floor(t * a.fps) % a.frames]; } // канал длится дольше анимации — трясём по кругу
  if (st === 'open') { const a = A.open, f = Math.floor(t * a.fps); if (f < a.frames) return [a.row, f]; const b = A.idle_open; return [b.row, Math.floor(T * b.fps) % b.frames]; }
  const a = A.idle_closed; return [a.row, Math.floor(T * a.fps) % a.frames];
}
export class ChestSprites {
  constructor(THREE, parent) {
    this.THREE = THREE; this.parent = parent; this.ready = false; this.st = new Map();
    const img = new Image(); img.onload = () => this._init(img); img.src = assetUrl(sheetSrc);
  }
  _init(img) {
    const THREE = this.THREE, parent = this.parent, bc = padded(img), base = tex(THREE, bc);
    this.src = bc; this.ck = [1, 2, 3, 4, 5].map(glowK).join(); this.ct = tex(THREE, curseMasks(bc));
    const o = { cellW: CW, cellH: CH, cols: COLS, rows: ROWS, max: 64 };
    this.b = new SpriteBatch(THREE, base, o);
    this.g = new SpriteBatch(THREE, tex(THREE, outline(bc)), { ...o, additive: true });
    this.gi = new SpriteBatch(THREE, this.ct, { cellW: CW * SS, cellH: CH * SS, cols: COLS, rows: ROWS * 5, max: 64, soft: true }); // ореол проклятия, как у героя
    this.x = new SpriteBatch(THREE, base, o); // «рентген» сквозь пропсы
    this.x.material.depthFunc = THREE.GreaterDepth; this.x.material.depthWrite = false;
    for (const [B, ro, dt] of [[this.g, 9, false], [this.b, 10, true], [this.gi, 11, false], [this.x, 12, true]]) { B.material.depthTest = dt; if (B !== this.b) B.material.depthWrite = false; B.mesh.renderOrder = ro; parent.add(B.mesh); }
    this.ready = true;
  }
  begin() { if (!this.ready) return; this.b.begin(); this.g.begin(); this.gi.begin(); this.x.begin(); this.seen = new Set(); }
  end() { if (!this.ready) return; this.b.end(); this.g.end(); this.gi.end(); this.x.end(); for (const id of [...this.st.keys()]) if (!this.seen.has(id)) this.st.delete(id); }
  /** c: {id, pub, mine, cz}; st: 'closed'|'chan'|'open'; T — время */
  push(x, z, c, st, T, k = 1) {
    if (!this.ready) return;
    this.seen.add(c.id); let s = this.st.get(c.id); if (!s || s.st !== st) { s = { st, t0: T }; this.st.set(c.id, s); }
    const [row, col] = chestFrame(st, T - s.t0, T), h = HM * k;
    const tint = st === 'chan' ? [1.0, 0.85, 0.35] : !c.pub && c.mine ? [1.0, 0.78, 0.25] : c.pub ? [0.75, 0.8, 0.9] : [0.35, 0.35, 0.4];
    const pulse = st === 'chan' ? 0.7 + 0.3 * Math.sin(T * 10) : !c.pub && c.mine ? 0.75 + 0.25 * Math.sin(T * 3) : 0.55;
    if (c.cz > 0) { // проклятые внутри (видимые мне): ореол как у героя; 5 — пульс
      const n = Math.min(5, c.cz), [r, g, b] = curseRGB(), key = [1, 2, 3, 4, 5].map(glowK).join();
      if (key !== this.ck) { this.ck = key; this.ct.image = curseMasks(this.src); this.ct.needsUpdate = true; } // админ поменял glow1..5
      const uK = Math.min(1, glowK(n) * (n >= 5 ? 0.8 + 0.35 * Math.sin(T * 4) : 1) * 1.15); // как _glowTick героя
      this.gi.push(x, 0, z, h, col, (n - 1) * ROWS + row, false, r, g, b, 0, uK);
    } else this.g.push(x, 0, z, h, col, row, false, tint[0] * pulse, tint[1] * pulse, tint[2] * pulse, 0, 1);
    this.b.push(x, 0, z, h, col, row, false, c.pub ? 0.9 : 1, c.pub ? 0.9 : 1, c.pub ? 0.92 : 1, 0, 1);
    this.x.push(x, 0, z, h, col, row, false, 1, 1, 1, 0, 0.45);
  }
}
