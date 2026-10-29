// Настоящие летящие снаряды открытого мира (и дуэлей) — спрайты FX atlas v3 fx30 (engine/fxAtlas.js, assets/mc/fx30/).
// Сервер (server/meta/zone.ts) ведёт снаряд и считает попадания; клиент получает {k:'proj'} при вылете
// и {k:'pend'} при попадании/конце полёта и только рисует: анимация fly (цикл), затем hit; у падающих — fall → hit.
// Режимы из атласа: directional — поворот по полёту; billboard / billboard_spin_baked — к камере (вращение уже в кадрах);
// ground — на земле; fall — без поворота, метеор зеркалится по X. Смешивание и ореол — из fx30_atlas.json
// (огненный шар и метеор — normal + glow, как просила художница).
import { FxAtlas, fxDef, fxDur, FX_META } from './fxAtlas.js';
import { GLOW } from './projBatch.js';

const PX = 20;
// проклятый навык R (cz): фиолетовый шейдер — умножение цвета спрайта + фиолетовый ореол (цвет — CURSE.tint)
import { curseRGB, curseHex } from '../meta/curseCfg.js';
export { curseRGB, curseHex };
// старые ключи сервера, которых нет в v2, — на ключи v2 (sun_beam как снаряд — его вспышка; лужа — plague_puddle)
const T2 = { sun_beam: 'sun_beam' };
export function projInfo(t) {
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
    this.atl = new FxAtlas(THREE, parent, { max: 900, glowMax: 600, order: 4 });
    this.atl.loading.then(() => { this.ready = true; });
  }
  get count() { return this.live.size; }
  // сервер: снаряд вылетел
  // свой выстрел: снаряд появляется СРАЗУ из отрисованного центра героя (клиент), сервер потом подтверждает его тем же cid
  // (точка вылета на сервере = эта же точка, если она в допуске) — без рывка назад и без двойного снаряда
  predict(cid, t, x, y, dx, dy, r, s = 640) {
    if (this.live.size > 500) return;
    const id = 'c' + cid + ':' + (this._pn = (this._pn || 0) + 1);
    const p = { id, t, x0: x, y0: y, dx, dy, s, r, arc: false, age: 0, info: projInfo(t), o: 'p', pred: cid };
    this.live.set(id, p); (this.pred[cid] ||= []).push(p);
    setTimeout(() => { const L = this.pred[cid]; if (!L) return; for (const q of L) if (this.live.get(q.id) === q) this.live.delete(q.id); delete this.pred[cid]; }, 900); // сервер отклонил — убираем
  }
  spawn(e) {
    // ICE: вспышка вылета ice_release у дула (лист Художника: центр 48,48)
    if (e.t === 'ice_bolt' && this.fx.length < 200) { const ri = projInfo('ice_release'); if (ri.key === 'ice_release') this.fx.push({ kind: 'impact', t: 'ice_release', x: e.x, y: e.y, age: 0, life: ri.impDur, info: ri, k: Math.max(0.8, e.sz || 1), dx: e.dx || 1, dy: e.dy || 0, fdx: 1, cz: false }); }
    this.spawned[`${e.o || '?'}:${e.t}`] = (this.spawned[`${e.o || '?'}:${e.t}`] || 0) + 1; // счётчик для отладки/тестов
    const L = e.cid && e.sid === this.meSid ? this.pred[e.cid] : null;
    if (L?.length) { // подтверждение своего: ближайший по направлению прогноз получает id сервера (позиция не прыгает)
      let bi = 0, bd = -2; L.forEach((q, i) => { const d = q.dx * e.dx + q.dy * e.dy; if (d > bd) { bd = d; bi = i; } });
      const q = L.splice(bi, 1)[0]; if (!L.length) delete this.pred[e.cid];
      if (this.live.get(q.id) === q) { this.live.delete(q.id); q.cz = !!e.cz; q.id = e.id; q.dx = e.dx; q.dy = e.dy; q.s = e.s || q.s; q.r = e.r || q.r; q.t = e.t; q.info = projInfo(e.t); q.pred = 0; q.k = e.sz || q.k || 1; this.live.set(e.id, q); this.confirmed = (this.confirmed || 0) + 1; return; }
    }
    if (this.live.size > 500) return;
    // a — мс, которые снаряд уже пролетел на сервере до отправки пачки: догоняем, чтобы он был там, где на самом деле
    this.live.set(e.id, { id: e.id, t: e.t, x0: e.x, y0: e.y, dx: e.dx, dy: e.dy, s: e.s || 520, r: e.r || 400, arc: !!e.arc, age: Math.min(0.4, (e.a || 0) / 1000), info: projInfo(e.t), o: e.o, cz: !!e.cz, k: Math.max(0.4, Math.min(4, Number(e.sz) || 1)) }); // k — размер снаряда (чёрное лезвие: ширина хитбокса / 20, растёт с Мощностью)
  }
  // сервер: попал / долетел
  end(e) {
    const p = this.live.get(e.id);
    // попадание пришло раньше, чем снаряд долетел на экране (пачка событий 5 Гц) — долетает до точки, потом удар
    if (p && !p.arc) { const dist = Math.hypot(e.x - p.x0, e.y - p.y0); if (p.s * p.age < dist - 4) { p.r = dist; p.endE = e; return; } }
    this.live.delete(e.id);
    const t = e.t || p?.t || 'fireball';
    if (t === 'plague_flask') return; // фляга: лужу рисует событие 'puddle'
    if ((p?.info || projInfo(t)).skill) return; // 🜏 навык артефакта: взрыв (burst) рисует zoneView по событию 'ability'
    this.impact(t, e.x, e.y, { dx: p?.dx, dy: p?.dy, cz: p?.cz });
  }
  impact(t, x, y, o = {}) { if (this.fx.length < 200) this.fx.push({ kind: 'impact', t, x, y, age: 0, life: projInfo(t).impDur, info: projInfo(t), k: o.k || 1, dx: o.dx || 1, dy: o.dy || 0, fdx: o.fdx || 1, cz: !!o.cz }); }
  puddle(x, y, r, life = 2.4, t = 'plague_puddle') { this.fx.push({ kind: 'loop', t, x, y, age: 0, life, info: projInfo(t), k: Math.max(1, (r || 60) / 50) }); }
  // падение сверху к моменту удара (метеор, дождь копий): delay — сек до удара
  fall(t, x, y, delay, fdx = 1, k = 1) { this.fx.push({ kind: 'fall', t, x, y, age: -Math.max(0, delay - 0.35), life: 0.35, info: projInfo(t), fdx, k }); }
  // разлёт осколков/секир из точки (нова/вихрь моба)
  burst(t, x, y, r, n = 10) { for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2; this.fx.push({ kind: 'fly', t, x, y, dx: Math.cos(a), dy: Math.sin(a), r, age: 0, life: 0.35, info: projInfo(t) }); } }

  // (x,y) — точка мира; h — высота, м; w (знак — зеркало), hh — размер; mode 0/1/2; anim/t — анимация и её время
  _put(info, anim, t, x, y, h, w, hh, mode, dx, dz, a = 1, loop, cz = false) {
    const X = this.toX(x), Z = this.toZ(y);
    if (cz) { const CZ = curseRGB(), gs = Math.max(Math.abs(w), hh) * 2.1; this.atl.glow.push(X, mode === 2 ? 0.05 : h, Z, gs, gs, mode === 2 ? 2 : 0, 0, 0, 0, GLOW.ball, 0, CZ[0], CZ[1], CZ[2], 0.75 * a); }
    this.atl.draw(info.key, anim, t, X, h, Z, w, hh, mode, 0, dx, dz, cz ? curseRGB().map((c) => -c) : null, a, cz ? 0 : 1, loop);
  }
  _mode(info) { return info.ground ? 2 : info.rot ? 1 : 0; }

  update(dt) {
    this.time += dt;
    this.atl.begin(dt);
    if (!this.ready) { this.atl.end(); return; }
    for (const p of this.live.values()) {
      p.age += dt;
      const d = Math.min(p.r, p.s * p.age);
      if (p.endE && p.s * p.age >= p.r) { this.live.delete(p.id); const e = p.endE; p.endE = null; this.end(e); continue; }
      if (p.age > p.r / p.s + 1.5) { this.live.delete(p.id); continue; } // 'pend' потерян — не висим
      const x = p.x0 + p.dx * d, y = p.y0 + p.dy * d, i = p.info, S = i.size * (p.k || 1);
      const h = p.arc ? 0.6 + Math.sin(Math.min(1, d / p.r) * Math.PI) * Math.min(4, p.r / PX * 0.35) : i.ground ? 0.06 : 1.0;
      const m = this._mode(i), w = i.cell ? i.cell[0] * (p.k || 1) : i.fall && p.dx < 0 ? -S : S, hh = i.cell ? i.cell[1] * (p.k || 1) : S;
      if (i.trail) { p.tr ??= 0; while (d - p.tr >= 16 && this.fx.length < 320) { p.tr += 16; this.fx.push({ kind: 'trail', t: p.t, x: p.x0 + p.dx * p.tr, y: p.y0 + p.dy * p.tr, dx: p.dx, dy: p.dy, age: 0, life: fxDur(i.key, 'trail') || 0.33, info: i, k: p.k || 1 }); } }
      this._put(i, i.fly, p.age, x, y, h, w, hh, m, m ? p.dx : 0, m ? p.dy : 0, 1, true, p.cz);
    }
    for (let j = this.fx.length - 1; j >= 0; j--) {
      const f = this.fx[j]; f.age += dt;
      if (f.age < 0) continue;
      if (f.age >= f.life) {
        this.fx.splice(j, 1);
        if (f.kind === 'fall') this.impact(f.t, f.x, f.y, { k: f.k, fdx: f.fdx });
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
