// Рендер снарядов и эффектов из PNG-атласа (proj_atlas.png) — общий для забега и открытого мира.
// Каждый вид снаряда: строка атласа, размер, режим квада (к камере / по направлению / на земле),
// скорость анимации, цвет и размер ореола, «призраки»-шлейф. Попадания — анимированные вспышки (8 кадров).
// Всё — 2 draw call: спрайты (обычное смешивание) + свечение (аддитивное).
import { ProjBatch, glowTexture, GLOW } from './projBatch.js';
import { pixAtlases, PROJ_ROWS, PROJ_COLS, PROJ_ROW_LIST } from './pixSprites.js';

const C = (hex) => [((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255];

// w,h — метры; mode: 0 к камере, 1 по направлению, 2 на земле; spin — рад/с (для mode 0/2);
// glow — цвет ореола, gs — его размер; trail — число «призраков»; streak — длина шлейфа (с·скорость)
export const SHOT_STYLE = {
  soul_spark: { row: 'soul_spark', w: 0.95, h: 0.95, mode: 1, fps: 14, glow: C(0x22d3ee), gs: 1.9, trail: 3, streak: 0.09, hit: 'hit_ice' },
  war_axe: { row: 'war_axe', w: 1.35, h: 1.35, mode: 0, fps: 18, glow: C(0xcbd5e1), gs: 1.5, trail: 2, streak: 0, hit: 'hit' },
  spear: { row: 'spear', w: 2.2, h: 0.75, mode: 1, fps: 10, glow: C(0xfbbf24), gs: 1.3, trail: 2, streak: 0.06, hit: 'hit' },
  daggers: { row: 'daggers', w: 1.05, h: 0.5, mode: 1, fps: 10, glow: C(0xe2e8f0), gs: 0.9, trail: 2, streak: 0.05, hit: 'hit_bleed' },
  fire_spark: { row: 'fire_spark', w: 1.4, h: 1.05, mode: 1, fps: 16, glow: C(0xf97316), gs: 2.4, trail: 4, streak: 0.12, hit: 'hit_fire' },
  orbit_skulls: { row: 'orbit_skulls', w: 1.25, h: 1.25, mode: 0, fps: 10, glow: C(0xa855f7), gs: 1.9, trail: 3, streak: 0, hit: 'hit_arcane' },
  chain_bolt: { row: 'chain_bolt', w: 1.3, h: 1.3, mode: 1, fps: 20, glow: C(0x818cf8), gs: 2.2, trail: 3, streak: 0.07, hit: 'hit_arcane' },
  ice_fan: { row: 'ice_fan', w: 1.15, h: 0.6, mode: 1, fps: 12, glow: C(0x7dd3fc), gs: 1.3, trail: 2, streak: 0.06, hit: 'hit_ice' },
  thorn_bow: { row: 'arrow', w: 1.7, h: 0.62, mode: 1, fps: 12, glow: C(0xef4444), gs: 1.0, trail: 3, streak: 0.05, hit: 'hit_bleed' },
  moon_orb: { row: 'ricochet', w: 1.15, h: 1.15, mode: 0, fps: 12, glow: C(0xfde68a), gs: 2.2, trail: 4, streak: 0.08, hit: 'hit' },
  glyph_mine: { row: 'mine', w: 1.8, h: 1.8, mode: 2, fps: 8, spin: 0.8, glow: C(0xa855f7), gs: 2.6, trail: 0, streak: 0, hit: 'hit_arcane', y: 0.06 },
  split_shard: { row: 'split', w: 1.05, h: 1.05, mode: 1, fps: 10, glow: C(0xec4899), gs: 1.6, trail: 3, streak: 0.07, hit: 'hit_arcane' },
  plague_flask: { row: 'poison_glob', w: 1.0, h: 1.0, mode: 0, fps: 10, spin: 4, glow: C(0xa855f7), gs: 1.5, trail: 2, streak: 0, hit: 'hit_poison', lob: 2.6 },
  fly_blades: { row: 'fly_blade', w: 1.3, h: 1.3, mode: 0, fps: 20, glow: C(0xa3e635), gs: 1.5, trail: 3, streak: 0.05, hit: 'hit_bleed' },
  staff_bolt: { row: 'staff_bolt', w: 1.4, h: 1.4, mode: 1, fps: 14, glow: C(0xd946ef), gs: 2.2, trail: 3, streak: 0.09, hit: 'hit_arcane' },
  ab_backstab: { row: 'ab_backstab', w: 1.5, h: 1.5, mode: 1, fps: 12, glow: C(0x38bdf8), gs: 1.8, trail: 2, streak: 0.05, hit: 'hit_ice' },
  ab_pierce: { row: 'ab_pierce', w: 3.8, h: 1.25, mode: 1, fps: 14, glow: C(0xfde047), gs: 3.2, trail: 3, streak: 0.08, hit: 'hit' },
  ab_trick: { row: 'ab_trick', w: 1.1, h: 1.1, mode: 1, fps: 16, glow: C(0x4ade80), gs: 1.5, trail: 2, streak: 0.05, hit: 'hit_acid' },
  ab_fireball: { row: 'ab_fireball', w: 2.8, h: 2.3, mode: 1, fps: 16, glow: C(0xff5a1f), gs: 4.2, trail: 4, streak: 0.14, hit: 'hit_fire' },
  enemy: { row: 'enemy', w: 0.95, h: 0.95, mode: 1, fps: 12, glow: C(0x84cc16), gs: 1.5, trail: 1, streak: 0.06, hit: 'hit_acid' },
  enemy_boss: { row: 'enemy_boss', w: 1.35, h: 1.35, mode: 0, fps: 12, spin: 3, glow: C(0xc026d3), gs: 2.1, trail: 1, streak: 0, hit: 'hit_arcane' },
};
export const STATUS_COLOR = { burn: C(0xf97316), poison: C(0x84cc16), bleed: C(0xdc2626), freeze: C(0x7dd3fc) };
const STATUS_FRAME = { burn: 0, poison: 2, bleed: 4, freeze: 6 };
const HIT_GLOW = { hit: C(0xfef3c7), hit_fire: C(0xf97316), hit_ice: C(0x7dd3fc), hit_arcane: C(0xc084fc), hit_acid: C(0xa3e635), hit_poison: C(0xa855f7), hit_bleed: C(0xef4444) };

export class ProjFx {
  constructor(THREE, parent, { max = 1600, glowMax = 2200 } = {}) {
    this.THREE = THREE;
    this.parent = parent;
    this.max = max; this.glowMax = glowMax;
    this.sprites = null;
    this.glow = new ProjBatch(THREE, glowTexture(THREE), { cols: 4, rows: 1, max: glowMax, additive: true, nearest: false, renderOrder: 3 });
    parent.add(this.glow.mesh);
    this.time = 0;
    this.ensure();
  }

  // атлас может догрузиться позже — создаём батч, когда текстура готова
  ensure() {
    if (this.sprites) return true;
    const tex = pixAtlases().proj;
    if (!tex) return false;
    const t = tex.clone(); t.needsUpdate = true;
    this.sprites = new ProjBatch(this.THREE, t, { cols: PROJ_COLS, rows: PROJ_ROW_LIST.length, max: this.max, renderOrder: 4 });
    this.parent.add(this.sprites.mesh);
    return true;
  }

  begin(dt) {
    this.time += dt || 0;
    this.ensure();
    if (this.sprites) this.sprites.begin();
    this.glow.begin();
  }

  end() {
    if (this.sprites) this.sprites.end();
    this.glow.end();
  }

  // Снаряд вида kind. age — сек с вылета (для анимации), seed — сдвиг фазы, k — масштаб, a — прозрачность
  shot(kind, x, z, vx, vz, age = 0, seed = 0, k = 1, a = 1, y = 0.9) {
    const S = SHOT_STYLE[kind] || SHOT_STYLE.enemy;
    const row = PROJ_ROWS[S.row];
    const sp = Math.hypot(vx, vz);
    const dx = sp > 0.01 ? vx / sp : 0, dz = sp > 0.01 ? vz / sp : 0;
    const frame = Math.floor(age * S.fps + seed * 3) & 7;
    let yy = S.y ?? y;
    if (S.lob) yy = 0.4 + Math.sin(Math.min(1, age / 0.9) * Math.PI) * S.lob;
    const rot = S.spin ? (age + seed) * S.spin : 0;
    const G = this.glow, gc = S.glow;
    // ореол
    if (S.mode === 2) G.push(x, 0.05, z, S.gs * k, S.gs * k, 2, 0, 0, 0, GLOW.ring, 0, gc[0], gc[1], gc[2], 0.55 * a * (0.75 + 0.25 * Math.sin(this.time * 6 + seed)));
    else G.push(x, yy, z, S.gs * k, S.gs * k, 0, 0, 0, 0, GLOW.ball, 0, gc[0], gc[1], gc[2], 0.7 * a);
    // шлейф-полоса позади
    if (S.streak && sp > 1) {
      const L = Math.min(5, sp * S.streak * 2.2) * k;
      G.push(x - dx * L * 0.45, yy, z - dz * L * 0.45, L, S.gs * 0.55 * k, 1, 0, dx, dz, GLOW.streak, 0, gc[0], gc[1], gc[2], 0.75 * a);
    }
    if (!this.sprites || row === undefined) return;
    // «призраки» позади (только у летящих)
    if (S.trail && sp > 1) {
      for (let i = S.trail; i >= 1; i--) {
        const off = i * Math.min(0.32, sp * 0.018) * k * (S.mode === 1 ? S.w * 0.6 : 1);
        const f = (frame + 8 - i) & 7;
        const ka = (1 - i / (S.trail + 1));
        this.sprites.push(x - dx * off, yy, z - dz * off, S.w * k * (0.6 + 0.4 * ka), S.h * k * (0.6 + 0.4 * ka), S.mode, rot, dx, dz, f, row, gc[0] * 1.2 + 0.2, gc[1] * 1.2 + 0.2, gc[2] * 1.2 + 0.2, 0.32 * ka * a);
      }
    }
    this.sprites.push(x, yy, z, S.w * k, S.h * k, S.mode, rot, dx, dz, frame, row, 1, 1, 1, a);
  }

  // Анимация попадания: t ∈ [0,1)
  hit(rowName, x, z, t, size = 1.2, y = 0.9, tint = null) {
    const row = PROJ_ROWS[rowName] ?? PROJ_ROWS.hit;
    const f = Math.min(7, Math.floor(t * 8));
    const gc = tint || HIT_GLOW[rowName] || HIT_GLOW.hit;
    if (t < 0.6) this.glow.push(x, y, z, size * (1.2 + t), size * (1.2 + t), 0, t * 2, 0, 0, GLOW.star, 0, gc[0], gc[1], gc[2], (1 - t / 0.6) * 0.9);
    if (this.sprites) this.sprites.push(x, y, z, size, size, 0, 0, 0, 0, f, row, tint ? 0.6 + tint[0] : 1, tint ? 0.6 + tint[1] : 1, tint ? 0.6 + tint[2] : 1, 1);
  }

  // Взрыв радиуса r: вспышка-спрайт, кольцо на земле, мягкое свечение
  boom(x, z, r, t, color = 0xf97316, row = 'hit_fire') {
    const gc = C(color);
    const k = Math.min(1, t);
    this.glow.push(x, 0.06, z, r * 2 * (0.4 + 0.75 * k), r * 2 * (0.4 + 0.75 * k), 2, 0, 0, 0, GLOW.ring, 0, gc[0], gc[1], gc[2], 0.9 * (1 - k));
    this.glow.push(x, 0.8, z, r * 1.6, r * 1.6, 0, 0, 0, 0, GLOW.ball, 0, gc[0], gc[1], gc[2], 0.6 * (1 - k));
    if (this.sprites) {
      const R = PROJ_ROWS[row] ?? PROJ_ROWS.hit_fire;
      this.sprites.push(x, 0.9, z, r * 1.5, r * 1.5, 0, 0, 0, 0, Math.min(7, Math.floor(k * 8)), R, 0.55 + gc[0] * 0.6, 0.55 + gc[1] * 0.6, 0.55 + gc[2] * 0.6, 1);
    }
  }

  // Облако/зона на земле (яд, дым)
  cloud(x, z, r, t, life, color = 0x65a30d, seed = 0) {
    const gc = C(color);
    const fade = Math.min(1, t / 0.25) * Math.min(1, (life - t) / 0.5);
    this.glow.push(x, 0.05, z, r * 2.3, r * 2.3, 2, 0, 0, 0, GLOW.ball, 0, gc[0], gc[1], gc[2], 0.55 * fade);
    if (!this.sprites) return;
    const row = PROJ_ROWS.cloud;
    for (let i = 0; i < 3; i++) {
      const a = seed + i * 2.1 + this.time * 0.4;
      const ox = Math.cos(a) * r * 0.35, oz = Math.sin(a) * r * 0.35;
      const f = (Math.floor(this.time * 6 + i * 3 + seed) & 7);
      this.sprites.push(x + ox, 0.3 + i * 0.25, z + oz, r * 1.5, r * 1.2, 0, 0, 0, 0, f, row, 0.7 + gc[0] * 0.5, 0.7 + gc[1] * 0.5, 0.7 + gc[2] * 0.5, 0.75 * fade);
    }
  }

  // Луч от (x,z) по направлению (dx,dz) длиной len
  beam(x, z, dx, dz, len, width, t, life, color = 0xfbbf24, row = 'beam') {
    const gc = C(color);
    const fade = Math.min(1, t / 0.08) * Math.min(1, (life - t) / 0.15);
    const mx = x + dx * len / 2, mz = z + dz * len / 2;
    this.glow.push(mx, 1.0, mz, len * 1.05, width * 3.2, 1, 0, dx, dz, GLOW.ball, 0, gc[0], gc[1], gc[2], 0.75 * fade);
    this.glow.push(x + dx * 0.4, 1.0, z + dz * 0.4, width * 3, width * 3, 0, this.time * 3, 0, 0, GLOW.star, 0, gc[0], gc[1], gc[2], fade);
    if (!this.sprites) return;
    const R = PROJ_ROWS[row];
    const seg = Math.max(1, Math.round(len / (width * 2.4)));
    const sl = len / seg;
    const f = Math.floor(this.time * 18) & 7;
    for (let i = 0; i < seg; i++) {
      const c = (i + 0.5) * sl;
      this.sprites.push(x + dx * c, 1.0, z + dz * c, sl * 1.04, width * 1.6 * (0.6 + 0.4 * fade), 1, 0, dx, dz, (f + i) & 7, R, 1, 1, 1, fade);
    }
  }

  // Разряд между двумя точками (цепная молния)
  zap(x, z, x2, z2, t, color = 0x818cf8) {
    const dx = x2 - x, dz = z2 - z, L = Math.hypot(dx, dz) || 1;
    this.beam(x, z, dx / L, dz / L, L, 0.35, t * 0.15, 0.15, color, 'beam');
    if (this.sprites) this.sprites.push(x2, 0.9, z2, 1.1, 1.1, 0, 0, 0, 0, Math.floor(this.time * 20) & 7, PROJ_ROWS.chain_bolt, 1, 1, 1, 1 - t);
  }

  // Иконка статуса над головой
  status(kind, x, y, z, seed = 0) {
    if (!this.sprites) return;
    const base = STATUS_FRAME[kind];
    if (base === undefined) return;
    const f = base + (Math.floor(this.time * 6 + seed) & 1);
    const gc = STATUS_COLOR[kind];
    this.glow.push(x, y, z, 0.9, 0.9, 0, 0, 0, 0, GLOW.ball, 0, gc[0], gc[1], gc[2], 0.5);
    this.sprites.push(x, y + Math.sin(this.time * 4 + seed) * 0.06, z, 0.62, 0.62, 0, 0, 0, 0, f, PROJ_ROWS.status, 1, 1, 1, 1);
  }

  dispose() {
    this.glow.dispose(); this.parent.remove(this.glow.mesh);
    if (this.sprites) { this.sprites.dispose(); this.parent.remove(this.sprites.mesh); }
  }
}
