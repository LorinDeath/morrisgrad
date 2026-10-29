// Чёрные мобы конструктора в мире: лист на тип (ui/bmMobArt.composeMobSheet → CanvasTexture), свой SpriteBatch на тип.
// Сторона: o.flip (смотрит влево) — ряды 4–7 листа (риг зеркально, табличка прямо), не UV-зеркало клетки.
// Состояния: idle / walk (движется) / atk (флаг атаки) / hurt (попадание) / die (свой список). Табличка класса — в листе.
import { SpriteBatch } from '../engine/spriteBatch.js';
import { composeMobSheet, BANIM, MCELL, MCOLS, MROWS, MIRROR_ROW } from '../ui/bmMobArt.js';
import { BM_MOBS, BMM_CFG, BMM_VER, mobElem } from '../../../../../server/meta/blackMobs.ts';
import { elRGB } from '../engine/projAtlas.js';
// контур цветом стихии: тёмные листы чёрных мобов не теряются на тёмной земле (Поляна — лунная ночь, лес, ночь) — силуэт без тона зоны
const RIM_COL = { fire: [1, 0.45, 0.15], ice: [0.6, 0.9, 1] };
export const rimColor = (type) => { const m = BM_MOBS[type]; const el = m ? mobElem(m) : 'fire'; return elRGB(el) || RIM_COL[el] || RIM_COL.fire; };

const PX_PER_M = 20;
export class BmMobLayer {
  constructor(THREE, root) { this.THREE = THREE; this.root = root; this.b = new Map(); this.tried = new Map(); this.dying = []; this.ghosts = []; this.sig = ''; }
  /** правки конструктора: пересобрать листы изменённых типов */
  invalidate() { for (const [id, e] of this.b) { this.root.remove(e.batch.mesh, e.sil.mesh); e.batch.dispose(); e.sil.dispose(); e.tex.dispose(); } this.b.clear(); this.tried.clear(); }
  batch(type) {
    let e = this.b.get(type); if (e) return e;
    const now = performance.now(); if (now - (this.tried.get(type) || 0) < 400) return null; this.tried.set(type, now);
    const cv = composeMobSheet(type); if (!cv) return null;
    const tex = new this.THREE.CanvasTexture(cv); tex.needsUpdate = true;
    const batch = new SpriteBatch(this.THREE, tex, { cellW: MCELL, cellH: MCELL, cols: MCOLS, rows: MROWS, max: 64 });
    const sil = new SpriteBatch(this.THREE, tex, { cellW: MCELL, cellH: MCELL, cols: MCOLS, rows: MROWS, max: 64, sil: true });
    this.root.add(sil.mesh, batch.mesh); e = { batch, sil, tex, cv, rim: rimColor(type) }; this.b.set(type, e); return e;
  }
  heightOf(o) { const m = BM_MOBS[o.type]; return (MCELL / PX_PER_M) * (BMM_CFG.mobVis || 0.6) * (m?.scale || 1) * (o.chief ? 1.3 : o.elite ? 1.12 : 1); }
  frameOf(o, dt) {
    if (o.hitN) o.bmHurt = 0.25; o.bmHurt = Math.max(0, (o.bmHurt || 0) - dt);
    o.bmAtk = Math.max(0, (o.bmAtk || 0) - dt); // взмах/выстрел оружием (событие marc / свой снаряд)
    let a = o.flag === 2 || o.bmAtk > 0 ? 'atk' : o.moving ? 'walk' : 'idle'; if (o.bmHurt > 0 && a !== 'atk') a = 'hurt';
    if (a !== o.bmA) { o.bmA = a; o.bmT = 0; } o.bmT = (o.bmT || 0) + dt;
    const A = BANIM[a]; let k = Math.floor(o.bmT * A.fps); k = A.loop || a === 'atk' ? k % A.n : Math.min(A.n - 1, k);
    return A.off + k;
  }
  /** кадр мира: mobs — Map зоны (рисуем только black), tint(o) → [r,g,b] */
  draw(mobs, T, dt, toX, toZ, tint) {
    if (this.ver !== BMM_VER) { this.ver = BMM_VER; this.invalidate(); } // правка конструктора — пересобрать листы
    for (const e of this.b.values()) { e.batch.begin(); e.sil.begin(); }
    const rim = Math.max(0, Math.min(1, Number(BMM_CFG.rim ?? 0.85))), rw = 1 + Math.max(0, Number(BMM_CFG.rimW ?? 0.06));
    for (const o of mobs.values()) { if (!o.black) continue; const e = this.batch(o.type); if (!e) continue;
      o.moving = o.mvT < 0.3 && !o.frozen; const f = this.frameOf(o, dt); o.hitN = false; o.strN = false;
      const [r, g, bl] = tint(o); e.batch.push(toX(o.x), 0, toZ(o.y), this.heightOf(o), f % MCOLS, Math.floor(f / MCOLS) + (o.flip ? MIRROR_ROW : 0), false, r, g, bl, o.flash > 0.05 ? 0.6 : 0, 1); e.batch.sortId(o.id);
      if (rim > 0.01) { const h = this.heightOf(o); e.sil.push(toX(o.x), -h * (rw - 1) * 0.35, toZ(o.y), h * rw, f % MCOLS, Math.floor(f / MCOLS) + (o.flip ? MIRROR_ROW : 0), false, e.rim[0], e.rim[1], e.rim[2], 0, rim); e.sil.sortId(o.id); } }
    for (let i = this.dying.length - 1; i >= 0; i--) { const d = this.dying[i]; d.t += dt; const A = BANIM.die, life = A.n / A.fps + 0.25; if (d.t >= life) { this.dying.splice(i, 1); continue; }
      const e = this.batch(d.type); if (!e) continue; const f = A.off + Math.min(A.n - 1, Math.floor(d.t * A.fps));
      e.batch.push(toX(d.x), 0, toZ(d.y), d.h, f % MCOLS, Math.floor(f / MCOLS) + (d.flip ? MIRROR_ROW : 0), false, 1, 1, 1, 0, 1 - Math.max(0, d.t - life + 0.25) * 4); }
    for (let i = this.ghosts.length - 1; i >= 0; i--) { const g = this.ghosts[i]; g.t += dt; if (g.t >= g.life) { this.ghosts.splice(i, 1); continue; } if (g.t < 0) continue;
      const e = this.batch(g.type); if (!e) continue; const a = 0.55 * (1 - g.t / g.life);
      e.batch.push(toX(g.x), 0, toZ(g.y), g.h, g.f % MCOLS, Math.floor(g.f / MCOLS) + (g.flip ? MIRROR_ROW : 0), false, g.col[0], g.col[1], g.col[2], 0.55, a); }
    for (const e of this.b.values()) { e.batch.end(); e.sil.end(); }
  }
  /** ЭТАП 2: тени-послеобразы рывка/телепорта (событие mmv): n копий кадра вдоль пути, цвет стихии, тают; при рывке появляются по ходу движения */
  ghost(o, e, col) {
    const n = Math.max(0, Math.min(8, e.g | 0)); if (!n || !o || this.ghosts.length > 96) return;
    const f = o.bmA ? BANIM[o.bmA].off : BANIM.walk.off, h = this.heightOf(o), dur = e.t === 'dash' ? (e.ms || 150) / 1000 : 0;
    for (let i = 0; i < n; i++) { const k = (i + 1) / (n + 1); this.ghosts.push({ type: o.type, x: e.x0 + (e.x1 - e.x0) * k, y: e.y0 + (e.y1 - e.y0) * k, f, h, flip: !!o.flip, col, t: -dur * k, life: 0.32 + 0.05 * i }); }
  }
  die(o, e) { this.dying.push({ type: e.type, x: e.x, y: e.y, t: 0, flip: !!o?.flip, h: o ? this.heightOf(o) : this.heightOf({ type: e.type }) }); }
  dispose() { this.invalidate(); }
}
