// Чёрный маг (server/meta/blackMage.ts) — только отрисовка: всё решает сервер (позиция, купола, стрелы, взрывы, розы).
// zone_state.bm = { m: [x,y,dir,moving,state] | null, d: [[id,x,y,r,leftSec,isWorld]…], ro?: [[id,x,y,ageMs]…], cfg? }
// События зоны: bmdome / bmtp / bmx (взрыв) / bmc (сжатие) / bmblock / bmpush / bmimm / bmrose; снаряды proj/pend с t = bm_arrow_*.
// Арт: src/assets/mc/bm/* (художник, /workspace/black_mage): листы 48×60 мага, FX bm_fx_atlas.json, роза 64×64 (7 стадий × 60 кадров), земля 16 px.
import { pixTex, pixMat } from '../engine/pixColor.js';
import { SpriteBatch, loadAtlasTexture } from '../engine/spriteBatch.js';
import { ProjBatch } from '../engine/projBatch.js';
import { toX, toZ } from '../engine/geometry.js';
import { atmo } from '../engine/atmosphere.js';
import { HERO_H_M } from '../engine/pixSprites.js';
import { BM_CFG, roseStage, roseCurseR, DAY_MS } from '../../../../../server/meta/bmCfg.ts';
import META0 from '../../../../assets/mc/bm/bm_fx_atlas.json';
import SMALL from '../../../../assets/mc/bm/bm_small_dome_atlas.json'; // малая сфера (отдельный пакет fx_small_dome, ключи не пересекаются)
import sd160 from '../../../../assets/mc/bm/bm_fx_sd160.png';
import sd160g from '../../../../assets/mc/bm/bm_fx_sd160_glow.png';
import sg160 from '../../../../assets/mc/bm/bm_fx_sg160.png';
import sg160g from '../../../../assets/mc/bm/bm_fx_sg160_glow.png';
const META = { sheets: { ...META0.sheets, ...SMALL.sheets }, keys: { ...META0.keys, ...SMALL.keys } };
import mageSrc from '../../../../assets/mc/bm/black_mage_48x60.png';
import idleSrc from '../../../../assets/mc/bm/black_mage_idle_wind_48x60.png';
import s32 from '../../../../assets/mc/bm/bm_fx_s32.png';
import s32g from '../../../../assets/mc/bm/bm_fx_s32_glow.png';
import s64 from '../../../../assets/mc/bm/bm_fx_s64.png';
import s64g from '../../../../assets/mc/bm/bm_fx_s64_glow.png';
import r128 from '../../../../assets/mc/bm/bm_fx_r128.png';
import r128g from '../../../../assets/mc/bm/bm_fx_r128_glow.png';
import d256 from '../../../../assets/mc/bm/bm_fx_d256.png';
import d256g from '../../../../assets/mc/bm/bm_fx_d256_glow.png';
import g256 from '../../../../assets/mc/bm/bm_fx_g256.png';
import g256g from '../../../../assets/mc/bm/bm_fx_g256_glow.png';
import g256x from '../../../../assets/mc/bm/bm_fx_g256x.png';
import g256xg from '../../../../assets/mc/bm/bm_fx_g256x_glow.png';
import t64 from '../../../../assets/mc/bm/bm_fx_t64.png';
import t64g from '../../../../assets/mc/bm/bm_fx_t64_glow.png';
import roseSrc from '../../../../assets/mc/bm/black_rose.png';
import groundSrc from '../../../../assets/mc/bm/cursed_ground.png';
import pulseGlowSrc from '../../../../assets/mc/bm/cursed_ground_pulse_glow.png';

const PX = 20; // px мира в метре
// атлас v4 (Художник): у d256/g256/g256x по 15 колонок, длинные анимации переносятся на следующие ряды
const SH = { s32: [s32, s32g], s64: [s64, s64g], r128: [r128, r128g], d256: [d256, d256g], g256: [g256, g256g], g256x: [g256x, g256xg], t64: [t64, t64g], sd160: [sd160, sd160g], sg160: [sg160, sg160g] };
const anim = (key, a) => { const K = META.keys[key], d = K.anims[a], S = META.sheets[d.sheet]; const sz = Array.isArray(K.size_m) ? K.size_m : [K.size_m || 1.6, K.size_m || 1.6];
  return { sheet: d.sheet, row: Math.round(d.y / S.frameH), col0: Math.round(d.x / S.frameW), cols: d.cols || S.cols, frames: d.frames, fps: d.fps_match_original_timing || d.fps, loop: d.loop, ay: (K.anchor || [0.5, 0.5])[1], w: sz[0], h: sz[1] }; };
// кадр i → [колонка, ряд] (перенос по cols); loop=false — держит последний кадр
const frame = (an, t, loop = an.loop) => { const f = Math.floor(Math.max(0, t) * an.fps), i = loop ? f % an.frames : Math.min(an.frames - 1, f); const c = an.col0 + i; return [c % an.cols, an.row + Math.floor(c / an.cols)]; };
const dur = (an) => an.frames / an.fps;
const A = {
  arrowS: anim('bm_arrow_small', 'fly'), arrowSHit: anim('bm_arrow_small', 'hit'), arrowB: anim('bm_arrow_big', 'fly'), arrowBHit: anim('bm_arrow_big', 'hit'),
  decal: anim('bm_trail_decal', 'decal'), puff: anim('bm_trail', 'puff'), boom: anim('bm_explosion', 'boom'), compress: anim('bm_compress', 'cast'),
  ring: anim('bm_dome_ring', 'loop'), ringIn: anim('bm_dome_ring', 'spawn'), ringOut: anim('bm_dome_ring', 'collapse'),
  sDome: anim('bm_small_dome', 'loop'), sDomeIn: anim('bm_small_dome', 'spawn'), sDomeOut: anim('bm_small_dome', 'collapse'),
  sRing: anim('bm_small_dome_ring', 'loop'), sRingIn: anim('bm_small_dome_ring', 'spawn'), sRingOut: anim('bm_small_dome_ring', 'collapse'),
  dome: anim('bm_dome', 'loop'), domeIn: anim('bm_dome', 'spawn'), domeOut: anim('bm_dome', 'collapse'), tpOut: anim('bm_teleport', 'out'), tpIn: anim('bm_teleport', 'in'),
};
const DOME = META.keys.bm_dome, A_OUT = DOME.draw_alpha_outside ?? 0.9, A_IN = DOME.draw_alpha_inside ?? 0.5;
// купол: квад 25.8×24 м на круг Ø25.6 м (art_scale 2) — масштаб от радиуса сервера
const domeK = (r) => (r * 2 / PX) / 25.6, sDomeK = (r) => (r * 2 / PX) / 8.0; // малая: квад 8.1×7.6 м на круг Ø8 м

export class BmView {
  constructor(THREE, root) {
    this.THREE = THREE; this.root = root; this.ready = false;
    this.mage = null;        // {x,y,tx,ty,dir,moving,state,flash}
    this.domes = new Map();  // id → {id,x,y,r,exp,world,born}
    this.gone = [];          // схлопывающиеся купола
    this.roses = new Map();  // id → {id,x,y,born}
    this.arrows = new Map(); this.fx = []; this.trail = []; this.trailAt = 0; this.time = 0;
    this.ground = new Map(); // id розы → {mesh, r}
    this.stats = { proj: 0, boom: 0, compress: 0, tp: 0, domes: 0 };
    const L = (s) => loadAtlasTexture(THREE, s);
    Promise.all([L(mageSrc), L(idleSrc), L(roseSrc), ...Object.values(SH).flatMap(([a, b]) => [L(a), L(b)]), L(groundSrc), L(pulseGlowSrc)]).then((tx) => {
      const [mt, it, rt] = tx; let i = 3;
      this.mageB = new SpriteBatch(THREE, mt, { cellW: 48, cellH: 60, cols: 6, rows: 4, max: 4 }); root.add(this.mageB.mesh);
      this.idleB = new SpriteBatch(THREE, it, { cellW: 48, cellH: 60, cols: 8, rows: 4, max: 4 }); root.add(this.idleB.mesh);
      this.roseB = new SpriteBatch(THREE, rt, { cellW: 64, cellH: 64, cols: 30, rows: 15, max: 512 }); root.add(this.roseB.mesh);
      this.B = {};
      for (const k of Object.keys(SH)) { const S = META.sheets[k], top = k === 'd256' || k === 'sd160'; // купол — после персонажей и без теста глубины (полусфера не срезается землёй)
        const n = new ProjBatch(THREE, tx[i++], { cols: S.cols, rows: S.rows, max: top ? 64 : 400, renderOrder: top ? 9 : 5 }), g = new ProjBatch(THREE, tx[i++], { cols: S.cols, rows: S.rows, max: top ? 64 : 400, additive: true, renderOrder: top ? 10 : 6 });
        if (top) for (const b of [n, g]) { b.mesh.material.depthTest = false; b.mesh.material.depthWrite = false; }
        root.add(n.mesh); root.add(g.mesh); this.B[k] = [n, g]; }
      this.groundImg = tx[i++].image;
      // пульс вен проклятой земли (cursed_ground_pulse_glow 3840×512): кадр t — блок 256×256 по (t%15, t//15), внутри ряд = маска, колонка = вариант
      this.pulseB = new ProjBatch(THREE, tx[i++], { cols: 240, rows: 32, max: 2500, additive: true, renderOrder: 2 }); root.add(this.pulseB.mesh);
      this.ready = true;
    }).catch((e) => console.warn('[bm]', e.message));
  }
  // ——— данные с сервера ———
  apply(bm) {
    if (!bm) { this.mage = null; this.domes.clear(); return; }
    if (bm.cfg) Object.assign(BM_CFG, bm.cfg);
    const m = bm.m;
    if (!m) this.mage = null;
    else { const [x, y, dir, mv, st] = m; if (!this.mage || Math.hypot(x - this.mage.x, y - this.mage.y) > 400) this.mage = { x, y, flash: 0 };
      Object.assign(this.mage, { tx: x, ty: y, dir: dir | 0, moving: !!mv, state: st | 0 }); }
    const now = Date.now(), keep = new Set();
    for (const [id, x, y, r, left, w] of bm.d || []) { keep.add(id); const d = this.domes.get(id); if (d) { d.exp = now + left * 1000; continue; } this.domes.set(id, { id, x, y, r, exp: now + left * 1000, world: w === 1, small: w === 2, born: this.time - 99 }); }
    for (const [id, d] of this.domes) if (!keep.has(id)) { this.domes.delete(id); this.gone.push({ ...d, t: 0 }); }
    if (Array.isArray(bm.ro)) { const k2 = new Set(); for (const [id, x, y, age] of bm.ro) { k2.add(id); const r = this.roses.get(id); const born = now - age; if (r) r.born = born; else this.roses.set(id, { id, x, y, born, ph: (id % 997) / 97 }); }
      for (const id of [...this.roses.keys()]) if (!k2.has(id)) this.roses.delete(id); }
  }
  event(e) {
    switch (e.k) {
      case 'proj': { const big = e.t === 'bm_arrow_big'; this.arrows.set(e.id, { x0: e.x, y0: e.y, dx: e.dx, dy: e.dy, s: e.s || 620, r: e.r || 450, age: 0, big }); this.stats.proj++; return true; }
      case 'pend': { const a = this.arrows.get(e.id); this.arrows.delete(e.id); this.fx.push({ an: (a ? a.big : e.t === 'bm_arrow_big') ? A.arrowBHit : A.arrowSHit, x: e.x, y: e.y, t: 0, h: 1 }); return true; }
      case 'bmx': this.fx.push({ an: A.boom, x: e.x, y: e.y, t: 0, s: e.b ? 1.15 : 1, h: 0.4 }); this.stats.boom++; return true;
      case 'bmc': this.fx.push({ an: A.compress, x: e.x, y: e.y, t: 0, s: ((e.r || 64) * 2 / PX * 1.25) / A.compress.w, mode: 2 }); this.stats.compress++; return true;
      case 'bmtp': if (e.o) { this.fx.push({ an: A.tpOut, x: e.x, y: e.y, t: 0 }); this.mage = null; } else this.fx.push({ an: A.tpIn, x: e.x, y: e.y, t: 0 }); this.stats.tp++; return true;
      case 'bmdome': if (!this.domes.has(e.id)) this.domes.set(e.id, { id: e.id, x: e.x, y: e.y, r: e.r, exp: Date.now() + (e.life || 3600) * 1000, world: e.kind === 'w', small: e.kind === 's', born: this.time }); else this.domes.get(e.id).born = this.time; this.stats.domes++; return true;
      case 'bmblock': this.fx.push({ an: A.arrowSHit, x: e.x, y: e.y, t: 0, h: 1 }); return true;
      case 'bmblk': this.arrows.set(e.id, { x0: e.x, y0: e.y, dx: e.dx, dy: e.dy, s: e.s || 620, r: e.r || 300, age: 0, big: !!e.b, pl: 1 }); this.fx.push({ an: A.arrowSHit, x: e.x, y: e.y, t: 0, h: 1 }); this.stats.black = (this.stats.black || 0) + 1; return true;
      case 'bmimm': if (this.mage) this.mage.flash = 0.25; return true;
      case 'bmpush': return true;
      case 'bmrose': if (!this.roses.has(e.id)) this.roses.set(e.id, { id: e.id, x: e.x, y: e.y, born: Date.now(), ph: (e.id % 997) / 97, plant: this.time }); return true;
    }
    return false;
  }
  near(px, py, R = 40) { const m = this.mage; return m && Math.hypot(m.x - px, m.y - py) < R ? m : null; }
  inDome(px, py) { for (const d of this.domes.values()) if ((px - d.x) ** 2 + (py - d.y) ** 2 <= d.r * d.r) return d; return null; }
  // ——— кадр ———
  update(dt, view) {
    this.time += dt; const T = this.time;
    if (!this.ready) return;
    const m = this.mage, k = Math.min(1, dt * 7);
    if (m) { m.x += (m.tx - m.x) * k; m.y += (m.ty - m.y) * k; m.flash = Math.max(0, m.flash - dt);
      // короткий чёрный след (bm_trail + пятно bm_trail_decal), гаснет за trailSec
      if ((m.moving || Math.hypot(m.tx - m.x, m.ty - m.y) > 3) && T - this.trailAt > 0.15 && BM_CFG.trailSec > 0) { this.trailAt = T; this.trail.push({ x: m.x, y: m.y, t: 0 }); } }
    const life = Math.max(0.2, Number(BM_CFG.trailSec) || 1);
    this.trail = this.trail.filter((p) => (p.t += dt) < life);
    for (const B of Object.values(this.B)) { B[0].begin(); B[1].begin(); }
    // an — анимация, t — её время; (x,y) — точка привязки на земле (px мира); s — масштаб к size_m; mode 0 к камере / 1 по полёту / 2 на земле
    const put = (an, t, x, y, s = 1, mode = 0, dx = 1, dz = 0, a = 1, glow = 0.8, h0 = 0, loop) => {
      const [col, row] = frame(an, t, loop), [n, g] = this.B[an.sheet], w = an.w * s, hh = an.h * s;
      const cy = mode === 2 ? 0.04 + h0 : h0 + (mode === 0 ? (an.ay - 0.5) * hh : 0); // билборд: центр квада над привязкой (anchor_y)
      n.push(toX(x), cy, toZ(y), w, hh, mode, 0, dx, dz, col, row, 1, 1, 1, a); if (glow > 0) g.push(toX(x), cy, toZ(y), w, hh, mode, 0, dx, dz, col, row, 1, 1, 1, a * glow); };
    // маг (глитч-спрайты Художника): идёт — лист 48×60 (шаг A-стойка-B), стоит — idle_wind 8 кадров, стреляет — кадры 4–5
    this.mageB.begin(); this.idleB.begin();
    if (m) {
      const fl = m.flash > 0 ? 0.6 : 0, X = toX(m.x), Z = toZ(m.y), H = HERO_H_M * 1.08;
      if (m.state === 2) this.mageB.push(X, 0, Z, H, 4 + (Math.floor(T * 8) & 1), m.dir, false, 1, 1, 1, fl, 1);
      else if (m.moving) this.mageB.push(X, 0, Z, H, [0, 1, 2, 1][Math.floor(T * 5) & 3], m.dir, false, 1, 1, 1, fl, 1);
      else this.idleB.push(X, 0, Z, H, Math.floor(T * 6) % 8, m.dir, false, 1, 1, 1, fl, 1);
      atmo.shadow(X, Z, 0.6);
    }
    this.mageB.end(); this.idleB.end();
    for (const p of this.trail) { const a = 1 - p.t / life; put(A.decal, p.t * dur(A.decal) / life, p.x, p.y, 1, 2, 1, 0, a * 0.9, 0.4); put(A.puff, p.t, p.x, p.y, 0.7, 0, 1, 0, a * 0.8, 0.3); }
    // купола (v4): spawn 2 с → loop 4 с (повтор) → collapse 1.8 с, строго 30 к/с; полусфера-билборд + кольцо на земле.
    // Прозрачность по зрителю: свой герой снаружи — 0.9, внутри — 0.5 (glow — так же)
    const vin = (d) => view && (view.x - d.x) ** 2 + (view.y - d.y) ** 2 <= d.r * d.r;
    const dset = (d) => d.small ? [A.sDomeIn, A.sDome, A.sDomeOut, A.sRingIn, A.sRing, A.sRingOut, sDomeK(d.r)] : [A.domeIn, A.dome, A.domeOut, A.ringIn, A.ring, A.ringOut, domeK(d.r)];
    for (const d of this.domes.values()) {
      const [dIn, dL, , rIn, rL, , s] = dset(d), age = T - d.born, sp = age < dur(dIn), a = vin(d) ? A_IN : A_OUT, t = sp ? age : age - dur(dIn);
      put(sp ? rIn : rL, t, d.x, d.y, s, 2, 1, 0, a, 0.6);
      put(sp ? dIn : dL, t, d.x, d.y, s, 0, 1, 0, a, 0.6);
    }
    this.gone = this.gone.filter((d) => { d.t += dt; const [, , dOut, , , rOut, s] = dset(d); if (d.t > dur(dOut)) return false; const a = vin(d) ? A_IN : A_OUT; put(rOut, d.t, d.x, d.y, s, 2, 1, 0, a, 0.6); put(dOut, d.t, d.x, d.y, s, 0, 1, 0, a, 0.6); return true; });
    // стрелы: летят по направлению (сервер — авторитет; клиент только догоняет и гасит на pend)
    for (const [id, a] of this.arrows) { a.age += dt; const dist = Math.min(a.r, a.s * a.age); if (a.age > a.r / a.s + 0.6) { this.arrows.delete(id); continue; }
      put(a.big ? A.arrowB : A.arrowS, a.age, a.x0 + a.dx * dist, a.y0 + a.dy * dist, 1, 1, a.dx, a.dy, 1, 0.9, 1.1); }
    this.fx = this.fx.filter((f) => { f.t += dt; if (f.t > dur(f.an)) return false; put(f.an, f.t, f.x, f.y, f.s || 1, f.mode || 0, 1, 0, 1, 0.8, f.h || 0); return true; });
    for (const B of Object.values(this.B)) { B[0].end(); B[1].end(); }
    // розы: стадия по возрасту (сутки сервера), покачивание 60 кадров на стадию, 30 к/с; посадка — ряд 14 (30 кадров)
    this.roseB.begin(); const now = Date.now();
    for (const r of this.roses.values()) { const st = roseStage(now - r.born), X = toX(r.x), Z = toZ(r.y);
      if (r.plant !== undefined && T - r.plant < 1) { this.roseB.push(X, 0, Z, 1.9, Math.min(29, Math.floor((T - r.plant) * 30)), 14, false, 1, 1, 1, 0, 1); continue; }
      this.roseB.push(X, 0, Z, 1.9, 0, st * 2, (r.id & 1) === 1, 1, 1, 1, 0, 1); this.roseB.anim(60, 30, r.ph); this.roseB.sortId('rose' + r.id); }
    this.roseB.end();
    this.groundUpdate(now, view);
  }
  // ——— проклятая земля: один плоский меш на розу (холст из тайлов cursed_ground 16 px: маска соседей NESW + вариант по позиции) ———
  groundUpdate(now, view) {
    if (!this.groundImg) return;
    for (const [id, g] of this.ground) if (!this.roses.has(id)) { this.dropGround(id, g); }
    const disks = [];
    for (const r of this.roses.values()) {
      const R = roseCurseR(now - r.born), g = this.ground.get(r.id);
      if (R > 0) disks.push([r.x, r.y, R]);
      if (g && g.r === R) continue;
      if (g) this.dropGround(r.id, g);
      if (R <= 0) continue;
      const mesh = this.groundMesh(r.x, r.y, R); this.root.add(mesh); this.ground.set(r.id, { mesh, r: R });
    }
    // пульс вен: тайлы 16 px рядом со своим героем (до 24 тайлов), объединение всех кругов; список — при смене тайла/радиусов
    const P = this.pulseB; P.begin();
    if (view && disks.length) {
      const T16 = 16, vx = Math.floor(view.x / T16), vy = Math.floor(view.y / T16), sig = vx + ',' + vy + '|' + disks.map((d) => d.join(':')).join(';');
      if (sig !== this.pulseSig) { this.pulseSig = sig; const L = []; const N = 24;
        const near = disks.filter(([x, y, R]) => Math.abs(x - view.x) < R + N * T16 + 32 && Math.abs(y - view.y) < R + N * T16 + 32);
        const cur = (i, j) => { const x = (i + 0.5) * T16, y = (j + 0.5) * T16; for (const [cx, cy, R] of near) if ((x - cx) ** 2 + (y - cy) ** 2 <= R * R) return true; return false; };
        if (near.length) for (let j = vy - N; j <= vy + N; j++) for (let i = vx - N; i <= vx + N; i++) { if (!cur(i, j)) continue;
          const mask = (cur(i, j - 1) ? 1 : 0) | (cur(i + 1, j) ? 2 : 0) | (cur(i, j + 1) ? 4 : 0) | (cur(i - 1, j) ? 8 : 0);
          L.push([(i + 0.5) * T16, (j + 0.5) * T16, mask, (((j % 4) + 4) % 4) * 4 + (((i % 4) + 4) % 4)]); if (L.length >= 2400) break; }
        this.pulseL = L; }
      const t = Math.floor(this.time * 30) % 30, bx = (t % 15) * 16, by = Math.floor(t / 15) * 16, a = 0.85;
      for (const [x, y, mask, v] of this.pulseL || []) P.push(toX(x), 0.035, toZ(y), 0.8, 0.8, 2, 0, 1, 0, bx + v, by + mask, 1, 1, 1, a);
    }
    P.end();
  }
  dropGround(id, g) { this.root.remove(g.mesh); g.mesh.geometry.dispose(); g.mesh.material.map.dispose(); g.mesh.material.dispose(); this.ground.delete(id); }
  // основной слой: один плоский меш на розу — холст из тайлов cursed_ground 16 px (маска NESW, вариант по позиции, 47-blob: внутренние углы — ряды 16–24)
  groundMesh(cx, cy, R) {
    const THREE = this.THREE, T16 = 16, n = Math.ceil(R / T16) + 1, size = n * 2 * T16;
    const tx0 = Math.floor(cx / T16) - n, ty0 = Math.floor(cy / T16) - n;
    const inside = (i, j) => { const x = (tx0 + i + 0.5) * T16, y = (ty0 + j + 0.5) * T16; return (x - cx) ** 2 + (y - cy) ** 2 <= R * R; };
    const cv = document.createElement('canvas'); cv.width = cv.height = size; const c = cv.getContext('2d'); c.imageSmoothingEnabled = false;
    for (let j = 0; j < n * 2; j++) for (let i = 0; i < n * 2; i++) {
      if (!inside(i, j)) continue;
      let row = (inside(i, j - 1) ? 1 : 0) | (inside(i + 1, j) ? 2 : 0) | (inside(i, j + 1) ? 4 : 0) | (inside(i - 1, j) ? 8 : 0);
      if (row === 15) { const ne = !inside(i + 1, j - 1), se = !inside(i + 1, j + 1), sw = !inside(i - 1, j + 1), nw = !inside(i - 1, j - 1), k = ne + se + sw + nw;
        if (k === 1) row = ne ? 16 : se ? 17 : sw ? 18 : 19;
        else if (k === 2) row = ne && nw ? 20 : se && sw ? 21 : ne && se ? 22 : sw && nw ? 23 : 24; // диагональные пары (NE+SW, SE+NW) в листе нет — ставим «все 4»
        else if (k > 2) row = 24; }
      const gx = tx0 + i, gy = ty0 + j, col = (((gy % 4) + 4) % 4) * 4 + (((gx % 4) + 4) % 4);
      c.drawImage(this.groundImg, col * T16, row * T16, T16, T16, i * T16, j * T16, T16, T16);
    }
    const tex = new THREE.CanvasTexture(cv); tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.NearestFilter; tex.generateMipmaps = false;
    const mat = pixMat(new THREE.MeshBasicMaterial({ map: pixTex(THREE, tex), transparent: true, depthWrite: false, opacity: 0.92 })); // тайлы как в листе (pixColor.js)
    const mesh = new THREE.Mesh(new THREE.PlaneBufferGeometry(size / PX, size / PX), mat);
    mesh.rotation.x = -Math.PI / 2; mesh.renderOrder = 1;
    mesh.position.set(toX(tx0 * T16 + size / 2), 0.03, toZ(ty0 * T16 + size / 2));
    return mesh;
  }
  debug() { return { mage: this.mage && { x: Math.round(this.mage.x), y: Math.round(this.mage.y), state: this.mage.state, moving: this.mage.moving }, domes: [...this.domes.values()].map((d) => ({ id: d.id, x: d.x, y: d.y, r: d.r, world: d.world, small: !!d.small })), roses: [...this.roses.values()].map((r) => ({ id: r.id, x: r.x, y: r.y, stage: roseStage(Date.now() - r.born), days: +((Date.now() - r.born) / DAY_MS).toFixed(2), curseR: roseCurseR(Date.now() - r.born) })), ground: this.ground.size, pulse: this.pulseL?.length || 0, arrows: this.arrows.size, stats: this.stats }; }
  dispose() { for (const g of this.ground.values()) this.root.remove(g.mesh); this.ground.clear(); }
}
