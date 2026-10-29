// Рендер снарядов и эффектов забега и открытого мира — поверх FX atlas v3 fx30 (engine/fxAtlas.js, assets/mc/fx30/).
// API прежний (shot / hit / boom / cloud / beam / zap / status) + метки и телеграфы спрайтами (mark / teleLine / teleCircle / teleCone)
// и навыковые эффекты (nova / cone / dash / slam). Старый proj_atlas.png больше не используется.
import { GLOW } from './projBatch.js';
import { elRGB } from './projAtlas.js';
import { FxAtlas, fxDef, fxDur, TELE_RGB } from './fxAtlas.js';

const C = (hex) => [((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255];

// Вид выстрела → ключ v2 + размер/режим/шлейф. w,h — метры; mode: 0 к камере, 1 по направлению, 2 на земле;
// spin — рад/с (только для «волчка» без вращения в кадрах); trail — «призраки»; streak — длина шлейфа ореола (с·скорость)
export const SHOT_STYLE = {
  soul_spark: { key: 'soul_spark', w: 0.95, h: 0.95, mode: 1, trail: 3, streak: 0.09, hit: 'hit_ice' },
  war_axe: { key: 'war_axe', w: 1.4, h: 1.4, mode: 0, trail: 2, streak: 0, hit: 'hit' },
  spear: { key: 'spear', w: 2.2, h: 1.1, mode: 1, trail: 2, streak: 0.06, hit: 'hit' },
  daggers: { key: 'daggers', w: 1.1, h: 1.1, mode: 1, trail: 2, streak: 0.05, hit: 'hit_bleed' },
  fire_spark: { key: 'fire_spark', w: 1.4, h: 1.4, mode: 1, trail: 4, streak: 0.12, hit: 'hit_fire' },
  orbit_skulls: { key: 'orbit_skulls', w: 1.3, h: 1.3, mode: 0, trail: 3, streak: 0, hit: 'hit_shadow' },
  chain_bolt: { key: 'chain_bolt', w: 1.3, h: 1.3, mode: 1, trail: 3, streak: 0.07, hit: 'hit_lightning' },
  ice_fan: { key: 'ice_fan', w: 1.2, h: 1.2, mode: 1, trail: 2, streak: 0.06, hit: 'hit_ice' },
  thorn_bow: { key: 'thorn_bow', w: 1.7, h: 1.7, mode: 1, trail: 3, streak: 0.05, hit: 'hit_bleed' },
  moon_orb: { key: 'moon_orb', w: 1.2, h: 1.2, mode: 0, trail: 4, streak: 0.08, hit: 'hit_holy' },
  glyph_mine: { key: 'glyph_mine', w: 1.9, h: 1.9, mode: 2, trail: 0, streak: 0, hit: 'hit_arcane', y: 0.06 },
  split_shard: { key: 'split_shard', w: 1.1, h: 1.1, mode: 1, trail: 3, streak: 0.07, hit: 'hit_arcane' },
  plague_flask: { key: 'plague_flask', w: 1.0, h: 1.0, mode: 0, trail: 2, streak: 0, hit: 'hit_poison', lob: 2.6 },
  fly_blades: { key: 'fly_blade', w: 1.3, h: 1.3, mode: 0, trail: 3, streak: 0.05, hit: 'hit_bleed' },
  staff_bolt: { key: 'auto_staff', w: 1.4, h: 1.4, mode: 1, trail: 3, streak: 0.09, hit: 'hit_arcane' },
  ab_backstab: { key: 'backstab', w: 1.5, h: 1.5, mode: 1, trail: 2, streak: 0.05, hit: 'hit_shadow' },
  ab_pierce: { key: 'pierce', w: 3.8, h: 1.9, mode: 1, trail: 3, streak: 0.08, hit: 'hit' },
  ab_trick: { key: 'daggers', w: 1.1, h: 1.1, mode: 1, trail: 2, streak: 0.05, hit: 'hit_bleed' },
  ab_fireball: { key: 'fireball', w: 2.8, h: 2.8, mode: 1, trail: 3, streak: 0.14, hit: 'hit_fire' },
  enemy: { key: 'enemy_acid', w: 1.1, h: 1.1, mode: 1, trail: 1, streak: 0.06, hit: 'hit_acid' },
  enemy_boss: { key: 'enemy_boss', w: 1.9, h: 1.9, mode: 0, trail: 1, streak: 0, hit: 'hit_arcane' },
};
// 11 семейств снарядов монстров (+ босс): ключ v2 и вспышка попадания
export const ENEMY_FAMILIES = { acid: 'hit_acid', bone: 'hit', fire: 'hit_fire', frost: 'hit_ice', shadow: 'hit_shadow', arcane: 'hit_arcane', blood: 'hit_bleed', rock: 'hit', lightning: 'hit_lightning', web: 'hit_white', water: 'hit_ice' };
for (const [f, hit] of Object.entries(ENEMY_FAMILIES)) SHOT_STYLE['enemy_' + f] = { key: 'enemy_' + f, w: 1.1, h: 1.1, mode: 1, trail: 1, streak: 0.06, hit };
export const STATUS_COLOR = { burn: C(0xf97316), poison: C(0x84cc16), bleed: C(0xdc2626), freeze: C(0x7dd3fc), slow: C(0x60a5fa), stun: C(0xfde047), curse: C(0xa855f7) };
// цвета меток (кольца под мобами/мешками), ключи v2 mark_*
export const MARK = { target: 'mark_target', tracked: 'mark_tracked', cursed: 'mark_cursed', boss: 'mark_boss', leader: 'mark_leader', elite: 'mark_elite', loot: 'mark_loot', magnet: 'mark_magnet' };

export class ProjFx {
  constructor(THREE, parent, { max = 1600, glowMax = 2200 } = {}) {
    this.THREE = THREE; this.parent = parent;
    this.fx = new FxAtlas(THREE, parent, { max, glowMax, order: 4 });
    this.glow = this.fx.glow;
    this.time = 0;
  }
  get sprites() { return this.fx.ready ? this.fx : null; }
  ensure() { return this.fx.ready; }
  begin(dt) { this.time += dt || 0; this.fx.begin(dt || 0); }
  end() { this.fx.end(); }

  // Снаряд вида kind (SHOT_STYLE или прямо ключ v2). age — сек с вылета, seed — сдвиг фазы, k — масштаб, a — прозрачность
  shot(kind, x, z, vx, vz, age = 0, seed = 0, k = 1, a = 1, y = 0.9) {
    let S = SHOT_STYLE[kind];
    if (!S) { const d = fxDef(kind); S = d ? { key: d.key, w: d.size, h: d.size, mode: d.mode === 'directional' ? 1 : d.mode === 'ground' ? 2 : 0, trail: 1, streak: 0.05 } : SHOT_STYLE.enemy; }
    const d = fxDef(S.key); if (!d) return;
    const sp = Math.hypot(vx, vz);
    const dx = sp > 0.01 ? vx / sp : 0, dz = sp > 0.01 ? vz / sp : 0;
    let yy = S.y ?? y;
    if (S.lob) yy = 0.4 + Math.sin(Math.min(1, age / 0.9) * Math.PI) * S.lob;
    const t = age + seed * 0.25, anim = d.anims.fly ? 'fly' : 'loop', gc = d.glow;
    // шлейф ореола позади (только у светящихся)
    if (gc && S.streak && sp > 1) {
      const L = Math.min(5, sp * S.streak * 2.2) * k;
      this.glow.push(x - dx * L * 0.45, yy, z - dz * L * 0.45, L, S.w * 0.5 * k, 1, 0, dx, dz, GLOW.streak, 0, gc[0], gc[1], gc[2], 0.7 * a);
    }
    // «призраки» позади (только у летящих)
    if (S.trail && sp > 1) {
      for (let i = S.trail; i >= 1; i--) {
        const off = i * Math.min(0.32, sp * 0.018) * k * (S.mode === 1 ? S.w * 0.6 : 1), ka = 1 - i / (S.trail + 1);
        this.fx.draw(S.key, anim, t - i * 0.05, x - dx * off, yy, z - dz * off, S.w * k * (0.6 + 0.4 * ka), S.h * k * (0.6 + 0.4 * ka), S.mode, 0, dx, dz, null, 0.3 * ka * a, 0);
      }
    }
    this.fx.draw(S.key, anim, t, x, yy, z, S.w * k, S.h * k, S.mode, 0, dx, dz, null, a, 1);
  }
  hitOf(kind) { return SHOT_STYLE[kind]?.hit || 'hit'; }

  // Анимация попадания: t ∈ [0,1) (растягиваем 8 кадров на всё время); tint — [r,g,b] (для hit_white)
  hit(key, x, z, t, size = 1.2, y = 0.9, tint = null) {
    const d = fxDef(key) || fxDef('hit');
    const an = d.anims.hit || d.anims.burst || d.anims.loop;
    this.fx.draw(d.key, an === d.anims.hit ? 'hit' : Object.keys(d.anims)[0], t * an.frames / an.fps, x, y, z, size, size, 0, 0, 0, 0, tint, 1, 0);
    const gc = tint || d.glow; if (gc && t < 0.6) this.glow.push(x, y, z, size * (1.2 + t), size * (1.2 + t), 0, t * 2, 0, 0, GLOW.star, 0, gc[0], gc[1], gc[2], (1 - t / 0.6) * 0.8);
  }

  // Взрыв радиуса r (м): кольцо-взрыв boom (r128, тинт) + вспышка попадания по стихии
  boom(x, z, r, t, color = 0xf97316, row = 'hit_fire') {
    const gc = C(color), k = Math.min(1, t), D = r * 2.2;
    this.fx.draw('boom', 'burst', k * fxDur('boom', 'burst'), x, 0.06, z, D, D, 2, 0, 0, 0, gc, 1 - k * 0.3, 0);
    this.glow.push(x, 0.8, z, r * 1.6, r * 1.6, 0, 0, 0, 0, GLOW.ball, 0, gc[0], gc[1], gc[2], 0.5 * (1 - k));
    this.hit(row, x, z, k, r * 1.3, 0.9);
  }

  // Облако/зона на земле: яд — plague_cloud, дым — smoke_bomb (цикл + затухание в конце)
  cloud(x, z, r, t, life, color = 0x65a30d, seed = 0) {
    const smoke = color === 0x64748b || color === 0x94a3b8 || color === 0x475569;
    const key = smoke ? 'smoke_bomb' : 'plague_cloud', D = r * 2.3;
    const fadeLen = fxDur(key, 'fade'), left = life - t;
    const a = Math.min(1, t / 0.25);
    if (left < fadeLen) this.fx.draw(key, 'fade', fadeLen - left, x, 0.06, z, D, D, 2, seed, 0, 0, null, a, 1);
    else this.fx.draw(key, 'loop', t + seed, x, 0.06, z, D, D, 2, seed, 0, 0, null, a, 1);
  }

  // Луч из 3 частей (sun_beam_start + mid×N + end) от (x,z) по (dx,dz) длиной len
  beam(x, z, dx, dz, len, width, t, life, color = 0xfbbf24, row = 'sun_beam') {
    const fade = Math.min(1, t / 0.08) * Math.min(1, (life - t) / 0.15);
    if (row === 'chain_zap') { this.fx.beam('chain_zap', this.time, x, 1.0, z, dx, dz, len, width * 1.6, null, fade); return; }
    this.fx.beam('sun_beam', this.time, x, 1.0, z, dx, dz, len, width * 1.8, null, fade);
    if (t < 0.25) this.fx.draw('sun_beam', 'hit', t, x + dx * len, 1.0, z + dz * len, width * 3, width * 3, 0, 0, 0, 0, null, fade, 1);
  }

  // Разряд между двумя точками (цепная молния): тайл chain_zap_mid + удар сверху chain_bolt_strike
  zap(x, z, x2, z2, t, color = 0x818cf8) {
    const dx = x2 - x, dz = z2 - z, L = Math.hypot(dx, dz) || 1;
    this.fx.beam('chain_zap', this.time, x, 1.0, z, dx / L, dz / L, L, 0.6, null, 1 - t);
    this.fx.draw('chain_bolt_strike', 'fall', t * 0.25, x2, 0.1, z2, 1.0, 2.0, 0, 0, 0, 0, null, 1 - t, 1);
  }

  // Иконка статуса над головой (status_burn/poison/bleed/freeze/slow/stun/curse)
  status(kind, x, y, z, seed = 0) {
    if (!STATUS_COLOR[kind]) return;
    this.fx.draw('status_' + kind, 'loop', this.time + seed * 0.37, x, y + Math.sin(this.time * 4 + seed) * 0.06, z, 0.8, 0.8, 0, 0, 0, 0, null, 1, 0);
  }

  // Метка под целью (mark_*), R — радиус, м
  mark(kind, x, z, R, a = 1, seed = 0, col = null) { const D = R * 2; this.fx.draw(MARK[kind] || kind, 'loop', this.time + seed * 0.13, x, 0.05, z, D, D, 2, 0, 0, 0, col, a, 0); } // col [r,g,b] — для белых меток (target: ярус зачарования)
  // Телеграфы — нейтральный #dcd3e6 из атласа, цвет задаёт код (col — [r,g,b])
  teleLine(x, z, dx, dz, len, width, col = [1, 0.3, 0.3], a = 1) {
    const L = Math.hypot(dx, dz) || 1, cap = Math.min(width, len * 0.3);
    dx /= L; dz /= L;
    const n = Math.max(1, Math.round((len - cap) / width)), sl = (len - cap) / n;
    for (let i = 0; i < n; i++) this.fx.draw('tele_line_tile', 'loop', this.time, x + dx * i * sl, 0.05, z + dz * i * sl, sl * 1.02, width, 2, 0, dx, dz, col, a, 0);
    this.fx.draw('tele_line_end', 'loop', this.time, x + dx * (len - cap), 0.05, z + dz * (len - cap), cap, width, 2, 0, dx, dz, col, a, 0);
  }
  teleCircle(x, z, R, k, col = [1, 0.3, 0.6], a = 1) {
    this.fx.draw('tele_circle_fill', 'loop', this.time, x, 0.05, z, R * 2 * Math.max(0.05, k), R * 2 * Math.max(0.05, k), 2, 0, 0, 0, col, a * 0.8, 0);
    this.fx.draw('tele_circle_ring', 'loop', this.time, x, 0.055, z, R * 2, R * 2, 2, 0, 0, 0, col, a, 0);
  }
  // 🜏 Огненный взмах артефакта: заливка сектора (= хитбокс сервера) + огненный край лезвия, проходящий от края до края, и угли по ободу.
  // (x,z) центр, (dx,dz) направление, L — радиус (м), h — полуугол (рад), k ∈ [0,1) прогресс, full — полный заряд (ярче/золотистее)
  fireArc(x, z, dx, dz, L, h, k, full = false, el = 'fire', o = {}) {
    const base = Math.atan2(dz, dx), fade = 1 - k, sw = Math.min(1, k * 2.6), th = -h + 2 * h * sw, ice = el === 'ice', ec = elRGB(el);
    let hot = ice ? (full ? [0.92, 0.98, 1] : [0.66, 0.89, 1]) : full ? [1, 0.82, 0.35] : [1, 0.5, 0.12], deep = ice ? (full ? [0.37, 0.72, 0.91] : [0.18, 0.35, 0.54]) : full ? [1, 0.55, 0.12] : [0.95, 0.28, 0.04];
    if (ec) { hot = ec.map((c) => Math.min(1, c * 0.55 + (full ? 0.5 : 0.35))); deep = ec.map((c) => c * (full ? 0.95 : 0.7)); } // ЭТАП 2: вода/камень/природа/молния — цвет стихии из админки
    const water = el === 'water'; if (water && ec) hot = ec.map((c) => Math.min(1, c * 0.4 + 0.6)); // вода: светлее край (тёмно-синий терялся на траве/в тени)
    // ЭТАП 2: большой взмах — лента следа в воздухе за лезвием (длина stl — доля дуги, высота sth, м): от яркого края к прозрачному хвосту
    const stl = o.stl ?? 0.8, sth = o.sth ?? 1.1, ssc = (o.ssc || 1.25) / 1.25;
    if (stl > 0 && sw > 0.02) {
      const tail = Math.min(2 * h, 2 * h * stl), steps = Math.max(6, Math.ceil(tail * L / 0.35)), lift = Math.sin(Math.min(1, sw) * Math.PI) * 0.25;
      for (let i = 0; i <= steps; i++) {
        const a = th - (tail * i) / steps; if (a < -h - 0.02) break;
        const q = i / steps, aa = base + a, ux = Math.cos(aa), uz = Math.sin(aa), R = L * (0.92 - 0.1 * q), w = ((1 - q) * 1.15 + 0.2) * ssc, al = (1 - q) * (1 - q) * fade;
        this.glow.push(x + ux * R, sth + lift * (1 - q), z + uz * R, w * 1.6, w * 0.55, 1, 0, -uz, ux, GLOW.streak, 0, hot[0], hot[1], hot[2], 0.85 * al);
        if (i % 2 === 0) this.glow.push(x + ux * R * 0.72, sth * 0.8, z + uz * R * 0.72, w, w, 0, 0, 0, 0, GLOW.ball, 0, deep[0], deep[1], deep[2], 0.45 * al);
        if (water) { this.glow.push(x + ux * R * 1.02, sth + lift * (1 - q) + 0.08, z + uz * R * 1.02, w * 1.9, w * 0.32, 1, 0, -uz, ux, GLOW.streak, 0, 0.92, 0.98, 1, 0.9 * al); // пенный гребень волны
          if (i % 3 === 0) this.glow.push(x + ux * R * 0.86, sth * 0.9, z + uz * R * 0.86, w * 1.3, w * 1.3, 0, 0, 0, 0, GLOW.ball, 0, ec ? ec[0] : 0.2, ec ? ec[1] : 0.6, ec ? ec[2] : 1, 0.6 * al); }
      }
    }
    // лёд: дуга Художника (ice_arc, 6 кадров @24, радиус ~50 px из 128 — масштаб по дальности) поверх заливки
    if (ice && k < 0.5) this.fx.draw('ice_arc', 'arc', k * 0.42, x, 0.08, z, L * 128 / 50 * 1.0, L * 128 / 50 * Math.min(1, h / 0.9 + 0.2), 2, 0, dx, dz, null, 1, 0.8, false);
    // заливка сектора: кольца свечения на земле — видно всю зону урона
    for (const rr of [0.3, 0.55, 0.8, 0.97]) {
      const n = Math.max(3, Math.ceil(2 * h * rr * L / 0.55));
      for (let i = 0; i <= n; i++) {
        const a = base - h + (2 * h * i) / n, px = x + Math.cos(a) * rr * L, pz = z + Math.sin(a) * rr * L, s = 0.5 + rr * 0.7;
        this.glow.push(px, 0.05, pz, s, s, 2, 0, 0, 0, GLOW.ball, 0, deep[0], deep[1], deep[2], 0.34 * fade);
      }
    }
    // след: угли по ободу от начала взмаха до лезвия
    const n2 = Math.max(4, Math.ceil(2 * h * L / 0.45));
    for (let i = 0; i <= n2; i++) {
      const a = -h + (2 * h * i) / n2; if (a > th) break;
      const aa = base + a, px = x + Math.cos(aa) * L * 0.96, pz = z + Math.sin(aa) * L * 0.96, age = (th - a) / (2 * h);
      this.glow.push(px, 0.25, pz, 0.9, 0.9, 0, 0, 0, 0, GLOW.ball, 0, hot[0], hot[1], hot[2], Math.max(0, 0.9 - age * 1.4) * fade);
    }
    // лезвие: яркая огненная полоса вдоль радиуса под текущим углом взмаха
    if (k < 0.6) {
      const aa = base + th, ux = Math.cos(aa), uz = Math.sin(aa), a1 = 1 - k / 0.6;
      this.glow.push(x + ux * L * 0.6, 0.3, z + uz * L * 0.6, L * 0.85, 0.8, 1, 0, ux, uz, GLOW.streak, 0, hot[0], hot[1], hot[2], 0.95 * a1);
      for (let j = 1; j <= 4; j++) this.fx.draw(ice || el === 'water' || el === 'lightning' ? 'ice_bolt' : 'fire_spark', ice ? 'trail' : 'fly', this.time + j * 0.07, x + ux * L * (0.25 + j * 0.18), 0.35 + (stl > 0 ? sth * 0.5 : 0), z + uz * L * (0.25 + j * 0.18), 0.75, 0.75, 1, 0, -uz, ux, ec ? ec.map((c) => -c) : null, a1, ec ? 0 : 0.6);
    }
  }
  /** эффект стихии Художника (ice_hit / ice_crit / ice_zero / ice_release) к камере; t — сек от начала, S — размер, м */
  elemFx(key, anim, t, x, z, S = 1.6, y = 0.9) { return this.fx.draw(key, anim, t, x, y, z, S, S, 0, 0, 0, 0, null, 1, 1, false); }
  teleCone(x, z, dx, dz, range, ang, col = [1, 0.3, 0.3], a = 1) { this.fx.cone('tele_cone', 'loop', this.time, x, z, dx, dz, range, ang, col, a); }
  // Навыковые эффекты: конус (ice_fan_cone / dew_splash_cone / gear_spin_cone), нова (nova_burst тинт / frost_nova / level_shockwave),
  // рывок (dash_trail тинт / shadow_step_trail / fly_blade_dash_trail / leap_strike), удар стража (warden_slam: падение + удар)
  cone(key, x, z, dx, dz, range, ang, t) { this.fx.cone(key, 'cast', t * fxDur(key, 'cast'), x, z, dx, dz, range, ang); }
  nova(key, x, z, R, t, col = null) { this.fx.draw(key, 'burst', t * fxDur(key, 'burst'), x, 0.07, z, R * 2.2, R * 2.2, 2, 0, 0, 0, col, 1, 1); }
  dash(key, x, z, dx, dz, len, t, col = null) { const d = fxDef(key); if (!d) return; const an = d.anims.trail ? 'trail' : 'loop'; this.fx.draw(key, an, this.time, x, 1.0, z, len, Math.max(1.2, len * 0.3), 1, 0, dx, dz, col, 1 - t, 1); }
  slam(x, z, R, t, delay = 0.35) { // t — сек от начала падения; delay — время падения до удара
    if (t < delay) { const k = t / delay; this.fx.draw('warden_slam', 'fall', t, x, 0.4 + 6 * (1 - k), z, R * 0.9, R * 1.8, 0, 0, 0, 0, null, 1, 1); }
    else this.fx.draw('warden_slam', 'hit', t - delay, x, 0.07, z, R * 2.4, R * 2.4, 2, 0, 0, 0, null, 1, 1);
  }
  aura(key, x, z, R, seed = 0, a = 1) { this.fx.draw(key, 'loop', this.time + seed, x, 0.06, z, R * 2, R * 2, 2, 0, 0, 0, null, a, 1); }

  dispose() { this.fx.dispose(); }
}
