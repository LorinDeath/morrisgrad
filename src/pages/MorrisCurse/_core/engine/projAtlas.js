// Настоящие летящие снаряды открытого мира (и дуэлей) — спрайты FX atlas v3 fx30 (engine/fxAtlas.js, assets/mc/fx30/).
// Сервер (server/meta/zone.ts) ведёт снаряд и считает попадания; клиент получает {k:'proj'} при вылете
// и {k:'pend'} при попадании/конце полёта и только рисует: анимация fly (цикл), затем hit; у падающих — fall → hit.
// Режимы из атласа: directional — поворот по полёту; billboard / billboard_spin_baked — к камере (вращение уже в кадрах);
// ground — на земле; fall — без поворота, метеор зеркалится по X. Смешивание и ореол — из fx30_atlas.json
// (огненный шар и метеор — normal + glow, как просила художница).
import { FxAtlas, fxDef, fxDur, FX_META } from './fxAtlas.js';
import { GLOW } from './projBatch.js';
import { FX_LIM } from './gfxCfg.js';
import { pathWorld, steer } from '../../../../../server/meta/skillCraft.ts';

const PX = 20;
// проклятый навык R (cz): фиолетовый шейдер — умножение цвета спрайта + фиолетовый ореол (цвет — CURSE.tint)
import { curseRGB, curseHex } from '../meta/curseCfg.js';
export { curseRGB, curseHex };
// старые ключи сервера, которых нет в v2, — на ключи v2 (sun_beam как снаряд — его вспышка; лужа — plague_puddle)
const T2 = { sun_beam: 'sun_beam' };
// 📊 кэш описаний (fxDef + разбор анимаций — на каждый снаряд/вспышку дорого); сброс — при смене псевдонимов (навыки конструктора)
const PI_CACHE = new Map();
export function clearProjInfo() { PI_CACHE.clear(); }
export function projInfo(t) {
  let r = PI_CACHE.get(t); if (r) return r;
  r = projInfo0(t); if (fxDef(T2[t] || t)) PI_CACHE.set(t, r); return r;
}
function projInfo0(t) {
  const d = fxDef(T2[t] || t) || fxDef('fireball');
  const m = d.mode;
  const fly = d.anims.fly ? 'fly' : d.anims.loop ? 'loop' : d.anims.fall ? 'fall' : Object.keys(d.anims)[0];
  const imp = d.anims.hit ? 'hit' : d.anims.burst ? 'burst' : d.anims.land ? 'land' : fly;
  // 🜏 снаряд навыка артефакта (лист Художника sk_*_bolt): ячейка не квадратная, след — анимация trail, взрыв рисует zoneView (burst)
  const M = FX_META.keys?.[d.key];
  return { key: d.key, fly, imp, impDur: fxDur(d.key, imp) || 0.3, rot: m === 'directional', ground: m === 'ground', fall: m === 'fall', size: d.size || 1.3, glow: d.glow, skill: !!M?.skill, cell: M?.skill ? M.cellM : null, trail: !!(M?.skill && d.anims.trail) };
}

export class ProjAtlasFx {
  constructor(THREE, parent, toX, toZ) {
    this.pred = {}; this.meSid = null;
    this.THREE = THREE; this.parent = parent; this.toX = toX; this.toZ = toZ;
    this.live = new Map(); // id → снаряд в полёте
    this.fx = [];          // удары, лужи, падения (метеор/копья), разлёты
    this.time = 0; this.ready = false; this.spawned = {};
    this.pool = []; this.ema = 1 / 60; this.mobPos = null; // 📊 пул объектов эффектов; сглаженный кадр (авто-качество); 🛠 позиция моба для самонаведения
    this.stat = { drop: 0, pooled: 0 };
    this.atl = new FxAtlas(THREE, parent, { max: 900, glowMax: 600, order: 4 });
    this.atl.loading.then(() => { this.ready = true; });
  }
  get count() { return this.live.size; }
  // 📊 лимиты (админка «🖼 Графика» → fx) с авто-качеством: при FPS ниже порога потолки ×0.6, шаг следа ×2
  _cap(k) { return FX_LIM.low ? Math.floor(FX_LIM[k] * 0.6) : FX_LIM[k]; }
  _fx(o) { if (this.fx.length >= (o.kind === 'trail' ? this._cap('trailMax') : this._cap('fxMax'))) { this.stat.drop++; return null; }
    const f = this.pool.pop() || {}; for (const k in f) f[k] = undefined; Object.assign(f, o); this.fx.push(f); return f; }
  /** 🛠 самонаведение: сервер выбрал цель (событие ptg) */
  target(id, m) { const p = this.live.get(id); if (p) p.tg = m; }
  // сервер: снаряд вылетел
  // свой выстрел: снаряд появляется СРАЗУ из отрисованного центра героя (клиент), сервер потом подтверждает его тем же cid
  // (точка вылета на сервере = эта же точка, если она в допуске) — без рывка назад и без двойного снаряда
  predict(cid, t, x, y, dx, dy, r, s = 640) {
    if (this.live.size > this._cap('projMax')) return;
    const id = 'c' + cid + ':' + (this._pn = (this._pn || 0) + 1);
    const p = { id, t, x0: x, y0: y, dx, dy, s, r, arc: false, age: 0, info: projInfo(t), o: 'p', pred: cid };
    this.live.set(id, p); (this.pred[cid] ||= []).push(p);
    setTimeout(() => { const L = this.pred[cid]; if (!L) return; for (const q of L) if (this.live.get(q.id) === q) this.live.delete(q.id); delete this.pred[cid]; }, 900); // сервер отклонил — убираем
  }
  spawn(e) {
    // ICE: вспышка вылета ice_release у дула (лист Художника: центр 48,48)
    if (e.t === 'ice_bolt') { const ri = projInfo('ice_release'); if (ri.key === 'ice_release') this._fx({ kind: 'impact', t: 'ice_release', x: e.x, y: e.y, age: 0, life: ri.impDur, info: ri, k: Math.max(0.8, e.sz || 1), dx: e.dx || 1, dy: e.dy || 0, fdx: 1, cz: false }); }
    this.spawned[`${e.o || '?'}:${e.t}`] = (this.spawned[`${e.o || '?'}:${e.t}`] || 0) + 1; // счётчик для отладки/тестов
    const L = e.cid && e.sid === this.meSid ? this.pred[e.cid] : null;
    if (L?.length) { // подтверждение своего: ближайший по направлению прогноз получает id сервера (позиция не прыгает)
      let bi = 0, bd = -2; L.forEach((q, i) => { const d = q.dx * e.dx + q.dy * e.dy; if (d > bd) { bd = d; bi = i; } });
      const q = L.splice(bi, 1)[0]; if (!L.length) delete this.pred[e.cid];
      if (this.live.get(q.id) === q) { this.live.delete(q.id); q.cz = !!e.cz; q.id = e.id; q.dx = e.dx; q.dy = e.dy; q.s = e.s || q.s; q.r = e.r || q.r; q.t = e.t; q.info = projInfo(e.t); q.pred = 0; q.k = e.sz || q.k || 1; this.live.set(e.id, q); this.confirmed = (this.confirmed || 0) + 1; return; }
    }
    if (this.live.size > this._cap('projMax')) { this.stat.drop++; return; }
    // a — мс, которые снаряд уже пролетел на сервере до отправки пачки: догоняем, чтобы он был там, где на самом деле
    this.live.set(e.id, { id: e.id, t: e.t, x0: e.x, y0: e.y, dx: e.dx, dy: e.dy, s: e.s || 520, r: e.r || 400, arc: !!e.arc, age: Math.min(0.4, (e.a || 0) / 1000), info: projInfo(e.t), o: e.o, cz: !!e.cz, k: Math.max(0.4, Math.min(4, Number(e.sz) || 1)), pth: e.pth && e.pth.p && e.pth.p !== 'line' ? e.pth : null, hx: e.dx, hy: e.dy, cx: e.x, cy: e.y, tg: 0 }); // k — размер снаряда (чёрное лезвие: ширина хитбокса / 20, растёт с Мощностью)
  }
  // сервер: попал / долетел
  end(e) {
    const p = this.live.get(e.id);
    // попадание пришло раньше, чем снаряд долетел на экране (пачка событий 5 Гц) — долетает до точки, потом удар
    if (p && p.pth) { p.endE = null; } // 🛠 траектория конструктора: точка удара — где снаряд сейчас (без догонялок по прямой)
    else if (p && !p.arc) { const dist = Math.hypot(e.x - p.x0, e.y - p.y0); if (p.s * p.age < dist - 4) { p.r = dist; p.endE = e; return; } }
    this.live.delete(e.id);
    const t = e.t || p?.t || 'fireball';
    if (t === 'plague_flask') return; // фляга: лужу рисует событие 'puddle'
    if ((p?.info || projInfo(t)).skill) return; // 🜏 навык артефакта: взрыв (burst) рисует zoneView по событию 'ability'
    this.impact(t, e.x, e.y, { dx: p?.dx, dy: p?.dy, cz: p?.cz });
  }
  impact(t, x, y, o = {}) { this._fx({ kind: 'impact', t, x, y, age: 0, life: projInfo(t).impDur, info: projInfo(t), k: o.k || 1, dx: o.dx || 1, dy: o.dy || 0, fdx: o.fdx || 1, cz: !!o.cz }); }
  puddle(x, y, r, life = 2.4, t = 'plague_puddle') { this._fx({ kind: 'loop', t, x, y, age: 0, life, info: projInfo(t), k: Math.max(1, (r || 60) / 50) }); }
  // падение сверху к моменту удара (метеор, дождь копий): delay — сек до удара
  fall(t, x, y, delay, fdx = 1, k = 1) { this._fx({ kind: 'fall', t, x, y, age: -Math.max(0, delay - 0.35), life: 0.35, info: projInfo(t), fdx, k }); }
  // разлёт осколков/секир из точки (нова/вихрь моба)
  burst(t, x, y, r, n = 10) { for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2; this._fx({ kind: 'fly', t, x, y, dx: Math.cos(a), dy: Math.sin(a), r, age: 0, life: 0.35, info: projInfo(t) }); } }

  // (x,y) — точка мира; h — высота, м; w (знак — зеркало), hh — размер; mode 0/1/2; anim/t — анимация и её время
  _put(info, anim, t, x, y, h, w, hh, mode, dx, dz, a = 1, loop, cz = false) {
    const X = this.toX(x), Z = this.toZ(y);
    if (cz) { const CZ = curseRGB(), gs = Math.max(Math.abs(w), hh) * 2.1; this.atl.glow.push(X, mode === 2 ? 0.05 : h, Z, gs, gs, mode === 2 ? 2 : 0, 0, 0, 0, GLOW.ball, 0, CZ[0], CZ[1], CZ[2], 0.75 * a); }
    this.atl.draw(info.key, anim, t, X, h, Z, w, hh, mode, 0, dx, dz, cz ? curseRGB().map((c) => -c) : null, a, cz ? 0 : 1, loop);
  }
  _mode(info) { return info.ground ? 2 : info.rot ? 1 : 0; }

  update(dt) {
    this.time += dt;
    this.ema += (Math.min(0.25, dt) - this.ema) * 0.05; FX_LIM.low = !!FX_LIM.auto && this.ema > 1 / (FX_LIM.autoFps || 30);
    const step = (FX_LIM.trailStep || 16) * (FX_LIM.low ? 2 : 1), trMax = this._cap('trailMax');
    this.atl.begin(dt);
    if (!this.ready) { this.atl.end(); return; }
    for (const p of this.live.values()) {
      p.age += dt;
      const d = Math.min(p.r, p.s * p.age);
      if (p.endE && p.s * p.age >= p.r) { this.live.delete(p.id); const e = p.endE; p.endE = null; this.end(e); continue; }
      if (p.age > p.r / p.s + 1.5) { this.live.delete(p.id); continue; } // 'pend' потерян — не висим
      let x, y, hdx = p.dx, hdy = p.dy;
      if (p.pth) { // 🛠 траектория конструктора (как сервер: skillCraft.pathWorld / steer)
        if (p.pth.p === 'homing') { const M = p.tg && this.mobPos?.(p.tg); if (M) [p.hx, p.hy] = steer(p.hx, p.hy, M[0] - p.cx, M[1] - p.cy, p.pth.turn || 240, dt);
          const st = Math.min(p.s * dt, Math.max(0, p.r - (p.fl || 0))); p.fl = (p.fl || 0) + st; p.cx += p.hx * st; p.cy += p.hy * st; x = p.cx; y = p.cy; hdx = p.hx; hdy = p.hy; }
        else { const q = pathWorld(p.pth, p.x0, p.y0, p.dx, p.dy, d, p.r); x = q[0]; y = q[1]; hdx = q[2]; hdy = q[3]; p.cx = x; p.cy = y; }
      } else { x = p.x0 + p.dx * d; y = p.y0 + p.dy * d; }
      const i = p.info, S = i.size * (p.k || 1);
      const h = p.arc ? 0.6 + Math.sin(Math.min(1, d / p.r) * Math.PI) * Math.min(4, p.r / PX * 0.35) : i.ground ? 0.06 : 1.0;
      const m = this._mode(i), w = i.cell ? i.cell[0] * (p.k || 1) : i.fall && p.dx < 0 ? -S : S, hh = i.cell ? i.cell[1] * (p.k || 1) : S;
      if (i.trail && trMax > 0) { p.tr ??= 0; const tl = fxDur(i.key, 'trail') || 0.33;
        if (p.pth) { if (d - p.tr >= step) { p.tr = d; this._fx({ kind: 'trail', t: p.t, x, y, dx: hdx, dy: hdy, age: 0, life: tl, info: i, k: p.k || 1 }); } } // по траектории — в текущей точке
        else while (d - p.tr >= step) { p.tr += step; if (!this._fx({ kind: 'trail', t: p.t, x: p.x0 + p.dx * p.tr, y: p.y0 + p.dy * p.tr, dx: p.dx, dy: p.dy, age: 0, life: tl, info: i, k: p.k || 1 })) { p.tr = d; break; } } }
      this._put(i, i.fly, p.age, x, y, h, w, hh, m, m ? hdx : 0, m ? hdy : 0, 1, true, p.cz);
    }
    for (let j = this.fx.length - 1; j >= 0; j--) {
      const f = this.fx[j]; f.age += dt;
      if (f.age < 0) continue;
      if (f.age >= f.life) {
        // 📊 удаление без сдвига массива (последний — на место j) и возврат объекта в пул
        const last = this.fx.pop(); if (j < this.fx.length) this.fx[j] = last;
        if (f.kind === 'fall') this.impact(f.t, f.x, f.y, { k: f.k, fdx: f.fdx });
        if (this.pool.length < 1024) this.pool.push(f);
        continue;
      }
      const i = f.info, S = i.size * (f.k || 1), m = this._mode(i);
      if (f.kind === 'impact') {
        const w = i.fall && f.fdx < 0 ? -S : S, big = i.fall || i.imp === 'land' || i.imp === 'burst';
        // удар падающих (метеор/копья/страж) и наземных — на земле; остальное — к камере по направлению
        this._put(i, i.imp, f.age, f.x, f.y, big || i.ground ? 0.5 : 0.9, w, S, i.ground ? 2 : m === 1 ? 1 : 0, m === 1 ? f.dx : 0, m === 1 ? f.dy : 0, 1, undefined, f.cz);
      } else if (f.kind === 'loop') { // лужа: цикл loop, в конце — fade
        const fd = fxDur(i.key, 'fade'), left = f.life - f.age, a = Math.min(1, f.age / 0.15);
        if (fd && left < fd) this._put(i, 'fade', fd - left, f.x, f.y, 0.06, S, S, 2, 0, 0, a);
        else this._put(i, 'loop', f.age, f.x, f.y, 0.06, S, S, 2, 0, 0, a * (fd ? 1 : Math.min(1, left / 0.6)));
      } else if (f.kind === 'fall') { // сверху-сбоку к цели; без поворота, остриё (anchor) — в точке
        const k = f.age / f.life, hgt = 7 * (1 - k), off = 3 * PX * (1 - k) * -f.fdx;
        this._put(i, 'fall', this.time, f.x + off, f.y, 0.3 + hgt, f.fdx < 0 && f.t === 'meteor' ? -S : S, S * 2, 0, 0, 0, 1, true);
      } else if (f.kind === 'trail') { // 🜏 след снаряда навыка: кадры trail на месте, гаснет
        this._put(i, 'trail', f.age, f.x, f.y, 1.0, i.cell[0] * f.k, i.cell[1] * f.k, m, f.dx, f.dy, 1 - (f.age / f.life) * 0.5);
      } else if (f.kind === 'fly') {
        const d = f.r * (f.age / f.life);
        this._put(i, i.fly, f.age, f.x + f.dx * d, f.y + f.dy * d, 1.0, S, S, m, f.dx, f.dy, 1 - f.age / f.life * 0.5, true);
      }
    }
    this.atl.end();
  }
  dispose() { this.atl.dispose(); }
}
