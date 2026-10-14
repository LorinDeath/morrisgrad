// Настоящие летящие снаряды открытого мира — спрайты утверждённого атласа (assets/mc/projectiles.png + .json, 8×25 кадров 32×32).
// Сервер (server/meta/zone.ts) ведёт снаряд и считает попадания; клиент получает {k:'proj'} при вылете
// и {k:'pend'} при попадании/конце полёта и только рисует: кадры 0–3 — полёт (12 к/с), 4–7 — удар (14 к/с).
// Правила художницы: метеор, дождь копий, глиф, лужа — НЕ поворачиваются (метеор зеркалится по X);
// секира/кинжалы/фляга — вращение уже нарисовано, только поворот по направлению полёта;
// часть видов — аддитивное смешивание; у оружия без магии ореол выключен.
import { ProjBatch, glowTexture, GLOW } from './projBatch.js';
import { loadAtlasTexture } from './spriteBatch.js';
import atlasSrc from '../../../../assets/mc/projectiles.png';
import META from '../../../../assets/mc/projectiles.json';

export const NO_ROTATE = new Set(['meteor', 'spear_rain', 'glyph_mine', 'plague_puddle']);
export const ADDITIVE = new Set(['chain_bolt', 'fire_spark', 'sun_beam', 'glyph_mine', 'auto_claws']);
export const GLOW_OFF = new Set(['war_axe', 'spear', 'daggers', 'spear_rain', 'auto_bow', 'auto_daggers']);
const GROUND = new Set(['glyph_mine', 'plague_puddle']); // лежат на земле
// размер в метрах (1 м = 20 px мира); по умолчанию 1.3
const SIZE = { fireball: 1.9, meteor: 3.2, spear: 2.0, pierce: 2.4, sun_beam: 1.8, war_axe: 1.5, moon_orb: 1.4, glyph_mine: 2.4, plague_puddle: 3.0, spear_rain: 2.0, orbit_skulls: 1.4, auto_daggers: 1.0, daggers: 1.1, auto_bow: 1.5, thorn_bow: 1.6 };
const PX = 20;
const hexRGB = (h) => { const n = parseInt(String(h || '#ffffff').slice(1), 16); return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]; };

export function projInfo(t) {
  const it = META.items[t] || META.items.fireball;
  return { row: it.row, flight: it.flight, impact: it.impact, glow: (it.glowEnabled === false || GLOW_OFF.has(t)) ? null : hexRGB(it.glow),
    add: ADDITIVE.has(t), rot: !NO_ROTATE.has(t), ground: GROUND.has(t), size: SIZE[t] || 1.3 };
}

export class ProjAtlasFx {
  constructor(THREE, parent, toX, toZ) {
    this.THREE = THREE; this.parent = parent; this.toX = toX; this.toZ = toZ;
    this.live = new Map(); // id → снаряд в полёте
    this.fx = [];          // удары, лужи, падения (метеор/копья), разлёты
    this.time = 0; this.ready = false; this.spawned = {};
    this.glow = new ProjBatch(THREE, glowTexture(THREE), { cols: 4, rows: 1, max: 600, additive: true, nearest: false, renderOrder: 3 });
    parent.add(this.glow.mesh);
    loadAtlasTexture(THREE, atlasSrc).then((tex) => {
      const t2 = tex.clone(); t2.needsUpdate = true;
      this.norm = new ProjBatch(THREE, tex, { cols: META.columns, rows: Math.round(800 / META.frameH), max: 800, renderOrder: 4 });
      this.add = new ProjBatch(THREE, t2, { cols: META.columns, rows: Math.round(800 / META.frameH), max: 400, additive: true, renderOrder: 5 });
      parent.add(this.norm.mesh); parent.add(this.add.mesh); this.ready = true;
    }).catch(() => {});
  }
  get count() { return this.live.size; }
  // сервер: снаряд вылетел
  spawn(e) {
    this.spawned[`${e.o || '?'}:${e.t}`] = (this.spawned[`${e.o || '?'}:${e.t}`] || 0) + 1; // счётчик для отладки/тестов
    if (this.live.size > 500) return;
    this.live.set(e.id, { id: e.id, t: e.t, x0: e.x, y0: e.y, dx: e.dx, dy: e.dy, s: e.s || 520, r: e.r || 400, arc: !!e.arc, age: 0, info: projInfo(e.t), o: e.o });
  }
  // сервер: попал / долетел
  end(e) {
    const p = this.live.get(e.id);
    // попадание пришло раньше, чем снаряд долетел на экране (пачка событий 5 Гц) — долетает до точки, потом удар
    if (p && !p.arc) { const dist = Math.hypot(e.x - p.x0, e.y - p.y0); if (p.s * p.age < dist - 4) { p.r = dist; p.endE = e; return; } }
    this.live.delete(e.id);
    const t = e.t || p?.t || 'fireball';
    if (t === 'plague_flask') return; // фляга: лужу рисует событие 'puddle'
    this.impact(t, e.x, e.y, { dx: p?.dx, dy: p?.dy });
  }
  impact(t, x, y, o = {}) { if (this.fx.length < 200) this.fx.push({ kind: 'impact', t, x, y, age: 0, life: 4 / META.fps.impact, info: projInfo(t), k: o.k || 1, dx: o.dx || 1, dy: o.dy || 0, fdx: o.fdx || 1 }); }
  puddle(x, y, r, life = 2.4, t = 'plague_puddle') { this.fx.push({ kind: 'loop', t, x, y, age: 0, life, info: projInfo(t), k: Math.max(1, (r || 60) / 50) }); }
  // падение сверху к моменту удара (метеор, дождь копий): delay — сек до удара
  fall(t, x, y, delay, fdx = 1, k = 1) { this.fx.push({ kind: 'fall', t, x, y, age: -Math.max(0, delay - 0.35), life: 0.35, info: projInfo(t), fdx, k }); }
  // разлёт осколков/секир из точки (нова/вихрь моба)
  burst(t, x, y, r, n = 10) { for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2; this.fx.push({ kind: 'fly', t, x, y, dx: Math.cos(a), dy: Math.sin(a), r, age: 0, life: 0.35, info: projInfo(t) }); } }

  _put(info, x, y, h, w, hh, mode, rot, dx, dz, col, a = 1) {
    const B = info.add ? this.add : this.norm;
    B.push(this.toX(x), h, this.toZ(y), w, hh, mode, rot, dx, dz, col, info.row, 1, 1, 1, a);
    if (info.glow) this.glow.push(this.toX(x), info.ground ? 0.05 : h, this.toZ(y), w * 1.6, hh * 1.6, info.ground ? 2 : 0, 0, 0, 0, GLOW.ball, 0, info.glow[0], info.glow[1], info.glow[2], 0.55 * a);
  }
  // вид спрайта: mode 1 — по направлению полёта; 0 — без поворота (метеор — зеркало ширины); 2 — на земле
  _mode(info) { return info.ground ? 2 : info.rot ? 1 : 0; }

  update(dt) {
    this.time += dt;
    this.glow.begin(); if (!this.ready) { this.glow.end(); return; }
    this.norm.begin(); this.add.begin();
    const fF = META.fps.flight, fI = META.fps.impact;
    for (const p of this.live.values()) {
      p.age += dt;
      const d = Math.min(p.r, p.s * p.age);
      if (p.endE && p.s * p.age >= p.r) { this.live.delete(p.id); const e = p.endE; p.endE = null; this.end(e); continue; }
      if (p.age > p.r / p.s + 1.5) { this.live.delete(p.id); continue; } // 'pend' потерян — не висим
      const x = p.x0 + p.dx * d, y = p.y0 + p.dy * d, i = p.info, S = i.size;
      const h = p.arc ? 0.6 + Math.sin(Math.min(1, d / p.r) * Math.PI) * Math.min(4, p.r / PX * 0.35) : i.ground ? 0.06 : 1.0;
      const col = i.flight[Math.floor(p.age * fF) % i.flight.length];
      const m = this._mode(i), w = !i.rot && p.dx < 0 && p.t === 'meteor' ? -S : S;
      this._put(i, x, y, h, w, S, m, 0, m ? p.dx : 0, m ? p.dy : 0, col);
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
        const col = i.impact[Math.min(i.impact.length - 1, Math.floor(f.age * fI))];
        const w = f.t === 'meteor' && f.fdx < 0 ? -S : S;
        this._put(i, f.x, f.y, i.ground ? 0.06 : 0.9, w, S, m === 1 ? 1 : m, 0, m === 1 ? f.dx : 0, m === 1 ? f.dy : 0, col);
      } else if (f.kind === 'loop') { // лужа: кадры удара по кругу, в конце тает
        const col = i.impact[Math.floor(f.age * fI * 0.6) % i.impact.length];
        const a = Math.min(1, f.age / 0.15) * Math.min(1, (f.life - f.age) / 0.6);
        this._put(i, f.x, f.y, 0.06, S, S, 2, 0, 0, 0, col, a);
      } else if (f.kind === 'fall') { // сверху-сбоку к цели; без поворота
        const k = f.age / f.life, hgt = 7 * (1 - k), off = 3 * PX * (1 - k) * -f.fdx;
        const col = i.flight[Math.floor(this.time * fF) % i.flight.length];
        this._put(i, f.x + off, f.y, 0.8 + hgt, f.fdx < 0 && f.t === 'meteor' ? -S : S, S, 0, 0, 0, 0, col);
      } else if (f.kind === 'fly') {
        const d = f.r * (f.age / f.life), col = i.flight[Math.floor(f.age * fF) % i.flight.length];
        this._put(i, f.x + f.dx * d, f.y + f.dy * d, 1.0, S, S, m, 0, f.dx, f.dy, col, 1 - f.age / f.life * 0.5);
      }
    }
    this.norm.end(); this.add.end(); this.glow.end();
  }
  dispose() { for (const b of [this.glow, this.norm, this.add]) if (b) { b.dispose(); this.parent.remove(b.mesh); } }
}
