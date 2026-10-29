// Чёрные мобы конструктора в мире: лист на тип (ui/bmMobArt.composeMobSheet → CanvasTexture), свой SpriteBatch на тип.
// Сторона: o.flip (смотрит влево) — ряды 4–7 листа (риг зеркально, табличка прямо), не UV-зеркало клетки.
// Состояния: idle / walk (движется) / atk (флаг атаки) / hurt (попадание) / die (свой список). Табличка класса — в листе.
import { SpriteBatch } from '../engine/spriteBatch.js';
import { composeMobSheet, BANIM, MCELL, MCOLS, MROWS, MIRROR_ROW } from '../ui/bmMobArt.js';
import { BM_MOBS, BMM_CFG, BMM_VER } from '../../../../../server/meta/blackMobs.ts';

const PX_PER_M = 20;
export class BmMobLayer {
  constructor(THREE, root) { this.THREE = THREE; this.root = root; this.b = new Map(); this.tried = new Map(); this.dying = []; this.sig = ''; }
  /** правки конструктора: пересобрать листы изменённых типов */
  invalidate() { for (const [id, e] of this.b) { this.root.remove(e.batch.mesh); e.batch.dispose(); e.tex.dispose(); } this.b.clear(); this.tried.clear(); }
  batch(type) {
    let e = this.b.get(type); if (e) return e;
    const now = performance.now(); if (now - (this.tried.get(type) || 0) < 400) return null; this.tried.set(type, now);
    const cv = composeMobSheet(type); if (!cv) return null;
    const tex = new this.THREE.CanvasTexture(cv); tex.needsUpdate = true;
    const batch = new SpriteBatch(this.THREE, tex, { cellW: MCELL, cellH: MCELL, cols: MCOLS, rows: MROWS, max: 64 });
    this.root.add(batch.mesh); e = { batch, tex, cv }; this.b.set(type, e); return e;
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
    for (const e of this.b.values()) e.batch.begin();
    for (const o of mobs.values()) { if (!o.black) continue; const e = this.batch(o.type); if (!e) continue;
      o.moving = o.mvT < 0.3 && !o.frozen; const f = this.frameOf(o, dt); o.hitN = false; o.strN = false;
      const [r, g, bl] = tint(o); e.batch.push(toX(o.x), 0, toZ(o.y), this.heightOf(o), f % MCOLS, Math.floor(f / MCOLS) + (o.flip ? MIRROR_ROW : 0), false, r, g, bl, o.flash > 0.05 ? 0.6 : 0, 1); e.batch.sortId(o.id); }
    for (let i = this.dying.length - 1; i >= 0; i--) { const d = this.dying[i]; d.t += dt; const A = BANIM.die, life = A.n / A.fps + 0.25; if (d.t >= life) { this.dying.splice(i, 1); continue; }
      const e = this.batch(d.type); if (!e) continue; const f = A.off + Math.min(A.n - 1, Math.floor(d.t * A.fps));
      e.batch.push(toX(d.x), 0, toZ(d.y), d.h, f % MCOLS, Math.floor(f / MCOLS) + (d.flip ? MIRROR_ROW : 0), false, 1, 1, 1, 0, 1 - Math.max(0, d.t - life + 0.25) * 4); }
    for (const e of this.b.values()) e.batch.end();
  }
  die(o, e) { this.dying.push({ type: e.type, x: e.x, y: e.y, t: 0, flip: !!o?.flip, h: o ? this.heightOf(o) : this.heightOf({ type: e.type }) }); }
  dispose() { this.invalidate(); }
}
