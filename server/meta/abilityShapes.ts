// «Проклятые»: формы активных навыков в открытом мире — как в «Вампир-лайке» (забеги), но считает сервер.
// Раньше любой навык был вспышкой по площади вокруг героя. Теперь у каждого своя механика:
// линия насквозь, снаряд со взрывом, рывок/прыжок (сервер сам двигает героя, клиенту — ability_move),
// дождь из точек, отложенный удар (метеор), аура с тиками, неуязвимость/снижение урона, заморозка/замедление.
// Направление — от клиента (нормализуется), всё остальное (дальность, урон, цели, позиции) — сервер.
import { ABILITY_BY_ID } from "./defs";
import { cryptoRand } from "./profile";

export type Shape =
  | { k: "nova"; r: number; slow?: boolean; freeze?: number; knock?: number; heal?: number; dr?: number; invuln?: number; ticks?: number; gap?: number }
  | { k: "line"; len: number; w: number; pierceArmor?: boolean }
  | { k: "proj"; len: number; r: number; w: string }
  | { k: "dash"; len: number; w: number; trail?: number; invuln?: number; fan?: number; toStrongest?: boolean }
  | { k: "leap"; len: number; r: number; invuln?: number }
  | { k: "rain"; n: number; area: number; r: number }
  | { k: "meteor"; dist: number; r: number; delay: number }
  | { k: "cloud"; r: number; invuln: number }
  | { k: "cone"; len: number; arc: number; freeze?: number; slow?: boolean; knock?: number; heal?: number };

// Навыки «Вампир-лайка» на оружии (слот R): форма в открытом мире по мотивам оружия забега
export const WEAPON_SKILL_CD = 8; // с
export const RS_SHAPES: Record<string, Shape> = {
  war_axe: { k: "proj", len: 320, r: 100, w: "staff" }, // брошенная секира: летит вперёд, взрыв у первой цели
  spear: { k: "line", len: 420, w: 40, pierceArmor: true },
  daggers: { k: "line", len: 300, w: 90 },
  fire_spark: { k: "proj", len: 420, r: 100, w: "staff" },
  orbit_skulls: { k: "nova", r: 130, ticks: 3, gap: 600 },
  chain_bolt: { k: "rain", n: 6, area: 200, r: 60 },
  ice_fan: { k: "cone", len: 260, arc: 1.0, freeze: 1500 }, // веер ледяных осколков вперёд (как в забеге)
  thorn_bow: { k: "line", len: 480, w: 36 },
  moon_orb: { k: "proj", len: 380, r: 90, w: "staff" },
  glyph_mine: { k: "rain", n: 5, area: 120, r: 70 },
  sun_beam: { k: "line", len: 520, w: 50 },
  split_shard: { k: "proj", len: 360, r: 130, w: "staff" },
  plague_flask: { k: "meteor", dist: 220, r: 120, delay: 500 },
  fly_blades: { k: "dash", len: 200, w: 70 },
};
export const SHAPES: Record<string, Shape> = {
  backstab: { k: "dash", len: 260, w: 50, toStrongest: true, fan: 150 },
  shield_wall: { k: "nova", r: 150, knock: 3, dr: 4000 },
  whirlwind: { k: "nova", r: 120, ticks: 4, gap: 750 },
  pierce: { k: "line", len: 420, w: 44, pierceArmor: true },
  spear_rain: { k: "rain", n: 18, area: 220, r: 55 },
  leap_strike: { k: "leap", len: 220, r: 120, invuln: 600 },
  trick_strike: { k: "cone", len: 170, arc: 1.3, heal: 0.1 }, // финт: веер ударов вперёд + лечение от урона
  smoke_bomb: { k: "cloud", r: 150, invuln: 2500 },
  shadow_step: { k: "dash", len: 240, w: 50, trail: 600, invuln: 300 },
  fireball: { k: "proj", len: 480, r: 110, w: "staff" },
  frost_nova: { k: "nova", r: 170, freeze: 2000 },
  meteor: { k: "meteor", dist: 300, r: 130, delay: 1200 },
  fly_blade_dash: { k: "dash", len: 200, w: 60 },
  // навыки монстров из кодекса — тоже по направлению
  dew_splash: { k: "cone", len: 220, arc: 1.1, slow: true },
  warden_slam: { k: "meteor", dist: 140, r: 120, delay: 350 },
  gear_spin: { k: "cone", len: 200, arc: 1.6, knock: 2 },
};
// навыки монстров: форма их базовой реализации (AbilityDef.base), иначе — вспышка
export function shapeOf(id: string): Shape {
  if (id.startsWith("rs:") && RS_SHAPES[id.slice(3)]) return RS_SHAPES[id.slice(3)];
  const d: any = ABILITY_BY_ID[id];
  return SHAPES[id] || (d?.base && SHAPES[d.base]) || { k: "nova", r: 140 };
}

export interface CastCtx {
  zone: any; sid: string; x: number; y: number; dx: number; dy: number; now: number;
  dmg: number;                                   // базовый урон навыка (уже с талантами/Сиянием/статами)
  radiusMult: number;                            // Сияние «extend» / таланты
  hit: (m: any, mult: number, opts?: { pierceArmor?: boolean }) => number; // урон мобу, возвращает нанесённое
  status: (m: any, st: any, fx: number, fy: number) => void;
  move: (x: number, y: number) => void;          // сервер переносит героя (рывок/прыжок)
  bounds: (x: number, y: number) => [number, number];
  buff: (b: { invuln?: number; dr?: number; heal?: number }) => void;
  later: (ms: number, fn: () => void) => void;
  ev: (e: any) => void;
  /** настоящий снаряд сервера (открытый мир); без него (дуэль) — прежний мгновенный расчёт */
  fire?: (o: { t: string; x: number; y: number; dx: number; dy: number; range: number; w: number; max: number; spd?: number; arc?: boolean; onHit?: (m: any, i: number) => void; onEnd?: (x: number, y: number, hit: boolean) => void }) => any;
}

const R = (n: number) => Math.round(n);
// строки атласа снарядов (src/assets/mc/projectiles.json): id навыка/оружия → спрайт
export const PROJ_SPRITES = new Set(["fireball", "war_axe", "fire_spark", "moon_orb", "split_shard", "thorn_bow", "spear", "pierce", "daggers", "sun_beam", "ice_fan", "chain_bolt",
  "plague_flask", "plague_puddle", "glyph_mine", "orbit_skulls", "meteor", "spear_rain", "dew_splash", "auto_staff", "auto_bow", "auto_daggers", "auto_claws"]);
export function projSprite(id: string, fb: string): string {
  const k = id.startsWith("rs:") ? id.slice(3) : id; const b = (ABILITY_BY_ID as any)[id]?.base;
  return PROJ_SPRITES.has(k) ? k : b && PROJ_SPRITES.has(b) ? b : fb;
}
const rot = (dx: number, dy: number, a: number): [number, number] => [dx * Math.cos(a) - dy * Math.sin(a), dx * Math.sin(a) + dy * Math.cos(a)];
function lineMobs(zone: any, x: number, y: number, dx: number, dy: number, len: number, w: number) {
  return zone.mobsAround(x + dx * len / 2, y + dy * len / 2, len / 2 + w).filter((m: any) => {
    const ex = m.x - x, ey = m.y - y, along = ex * dx + ey * dy;
    return along >= -w && along <= len + w && Math.abs(ex * dy - ey * dx) <= w / 2 + 14;
  });
}

// Возвращает суммарный урон (для вампиризма и т.п.)
export function castShape(id: string, c: CastCtx): number {
  const s = shapeOf(id);
  const k = c.radiusMult;
  let dealt = 0;
  const hitAll = (ms: any[], mult: number, opts?: any) => { for (const m of ms) dealt += c.hit(m, mult, opts) || 0; };
  switch (s.k) {
    case "nova": {
      const r = s.r * k;
      const tick = () => {
        const ms = c.zone.mobsAround(c.x, c.y, r);
        hitAll(ms, s.ticks ? 1 / Math.sqrt(s.ticks) : 1);
        for (const m of ms) c.status(m, { slow: !!(s.slow || s.freeze), knock: s.knock, freeze: s.freeze }, c.x, c.y);
        c.ev({ k: "ability", sid: c.sid, id, x: R(c.x), y: R(c.y), r });
      };
      tick();
      for (let i = 1; i < (s.ticks || 1); i++) c.later(i * (s.gap || 700), tick);
      if (s.dr) c.buff({ dr: s.dr });
      if (s.heal) c.buff({ heal: dealt * s.heal });
      break;
    }
    case "line": {
      const len = s.len * k, spr = projSprite(id, "spear");
      if (c.fire && spr !== "sun_beam") { // летящее копьё/кинжалы: пробивает насквозь, урон в момент касания
        const fan = spr === "daggers" ? [-0.22, 0, 0.22] : [0];
        for (const a of fan) { const [vx, vy] = rot(c.dx, c.dy, a); c.fire({ t: spr, x: c.x, y: c.y, dx: vx, dy: vy, range: len, w: fan.length > 1 ? 34 : s.w, max: 99, onHit: (m) => { dealt += c.hit(m, fan.length > 1 ? 0.5 : 1, { pierceArmor: s.pierceArmor }) || 0; } }); }
        break;
      }
      hitAll(lineMobs(c.zone, c.x, c.y, c.dx, c.dy, len, s.w), 1, { pierceArmor: s.pierceArmor });
      c.ev({ k: "aline", sid: c.sid, id, x: R(c.x), y: R(c.y), dx: c.dx, dy: c.dy, len: R(len) });
      break;
    }
    case "proj": {
      // летит до первого моба на линии (или до конца), там взрыв
      const len = s.len * k, spr = projSprite(id, "fireball");
      if (c.fire) {
        const r = s.r * k;
        c.fire({ t: spr, x: c.x, y: c.y, dx: c.dx, dy: c.dy, range: len, w: 30, max: 1, onEnd: (x, y) => {
          hitAll(c.zone.mobsAround(x, y, r), 1); c.ev({ k: "ability", sid: c.sid, id, x: R(x), y: R(y), r });
          if (spr === "split_shard") for (const a of [-0.6, 0, 0.6]) { const [vx, vy] = rot(c.dx, c.dy, a); c.fire!({ t: "split_shard", x: x + vx * 20, y: y + vy * 20, dx: vx, dy: vy, range: 170, w: 22, max: 1, onHit: (m) => { dealt += c.hit(m, 0.4) || 0; } }); }
        } });
        break;
      }
      const on = lineMobs(c.zone, c.x, c.y, c.dx, c.dy, len, 30).map((m: any) => ({ m, a: (m.x - c.x) * c.dx + (m.y - c.y) * c.dy })).sort((p: any, q: any) => p.a - q.a);
      const at = on.length ? Math.max(0, on[0].a) : len;
      const tx = c.x + c.dx * at, ty = c.y + c.dy * at;
      c.ev({ k: "aproj", sid: c.sid, id, x: R(c.x), y: R(c.y), tx: R(tx), ty: R(ty), w: s.w });
      const r = s.r * k;
      const flight = Math.min(600, at * 1.2);
      c.later(flight, () => { hitAll(c.zone.mobsAround(tx, ty, r), 1); c.ev({ k: "ability", sid: c.sid, id, x: R(tx), y: R(ty), r }); });
      break;
    }
    case "dash": {
      let dx = c.dx, dy = c.dy, len = s.len;
      if (s.toStrongest) {
        // «Удар в спину»: за спину сильнейшего врага в радиусе
        const ms = c.zone.mobsAround(c.x, c.y, s.len).sort((p: any, q: any) => q.hp - p.hp);
        if (ms[0]) { const ex = ms[0].x - c.x, ey = ms[0].y - c.y, d = Math.hypot(ex, ey) || 1; dx = ex / d; dy = ey / d; len = d + 40; }
      }
      const [nx, ny] = c.bounds(c.x + dx * len, c.y + dy * len);
      const real = Math.hypot(nx - c.x, ny - c.y);
      hitAll(lineMobs(c.zone, c.x, c.y, dx, dy, real, s.w), 1);
      c.ev({ k: "aline", sid: c.sid, id, x: R(c.x), y: R(c.y), dx, dy, len: R(real) });
      const fx = c.x, fy = c.y;
      c.move(nx, ny);
      if (s.invuln) c.buff({ invuln: s.invuln });
      if (s.fan) { const r = s.fan * k; hitAll(c.zone.mobsAround(nx, ny, r), 0.6); c.ev({ k: "ability", sid: c.sid, id, x: R(nx), y: R(ny), r }); }
      if (s.trail) c.later(s.trail, () => {
        hitAll(lineMobs(c.zone, fx, fy, dx, dy, real, s.w + 30), 0.7);
        for (let i = 0; i <= 3; i++) c.ev({ k: "ability", sid: c.sid, id, x: R(fx + dx * real * i / 3), y: R(fy + dy * real * i / 3), r: 60 });
      });
      break;
    }
    case "leap": {
      const [nx, ny] = c.bounds(c.x + c.dx * s.len, c.y + c.dy * s.len);
      if (s.invuln) c.buff({ invuln: s.invuln });
      c.ev({ k: "amark", sid: c.sid, id, x: R(nx), y: R(ny), r: s.r * k, t: 0.45 });
      c.move(nx, ny);
      c.later(400, () => { const r = s.r * k; const ms = c.zone.mobsAround(nx, ny, r); hitAll(ms, 1); for (const m of ms) c.status(m, { knock: 2 }, nx, ny); c.ev({ k: "ability", sid: c.sid, id, x: R(nx), y: R(ny), r }); });
      break;
    }
    case "rain": {
      const area = s.area * k;
      // область дождя — ПЕРЕД героем по направлению (а не вокруг него)
      const ox = c.x + c.dx * area * 1.1, oy = c.y + c.dy * area * 1.1;
      for (let i = 0; i < s.n; i++) {
        const a = cryptoRand() * Math.PI * 2, d = Math.sqrt(cryptoRand()) * area;
        const px = ox + Math.cos(a) * d, py = oy + Math.sin(a) * d;
        c.later(80 * i, () => { hitAll(c.zone.mobsAround(px, py, s.r), 1 / 4); c.ev({ k: "ability", sid: c.sid, id, x: R(px), y: R(py), r: s.r }); });
      }
      break;
    }
    case "meteor": {
      const [tx, ty] = c.bounds(c.x + c.dx * s.dist, c.y + c.dy * s.dist);
      const r = s.r * k;
      if (c.fire && projSprite(id, "") === "plague_flask") { // фляга летит навесом, разбивается в лужу (+2 тика)
        const dist = Math.hypot(tx - c.x, ty - c.y) || 1;
        c.ev({ k: "amark", sid: c.sid, id, x: R(tx), y: R(ty), r, t: s.delay / 1000 });
        c.fire({ t: "plague_flask", x: c.x, y: c.y, dx: (tx - c.x) / dist, dy: (ty - c.y) / dist, range: dist, w: 20, max: 0, arc: true, spd: dist / Math.max(0.25, s.delay / 1000), onEnd: (x, y) => {
          hitAll(c.zone.mobsAround(x, y, r), 1); c.ev({ k: "puddle", sid: c.sid, x: R(x), y: R(y), r, t: 2.4 });
          for (const t of [800, 1600]) c.later(t, () => hitAll(c.zone.mobsAround(x, y, r), 0.25));
        } });
        break;
      }
      c.ev({ k: "amark", sid: c.sid, id, x: R(tx), y: R(ty), r, t: s.delay / 1000, fdx: c.dx < 0 ? -1 : 1 });
      c.later(s.delay, () => { hitAll(c.zone.mobsAround(tx, ty, r), 1); c.ev({ k: "ability", sid: c.sid, id, x: R(tx), y: R(ty), r }); });
      break;
    }
    case "cone": {
      const len = s.len * k, half = s.arc / 2, spr = projSprite(id, "");
      if (c.fire && (spr === "ice_fan" || spr === "dew_splash")) { // веер: 5 осколков, каждый до первого моба
        for (let i = 0; i < 5; i++) { const [vx, vy] = rot(c.dx, c.dy, -half + (i / 4) * s.arc);
          c.fire({ t: spr, x: c.x, y: c.y, dx: vx, dy: vy, range: len, w: 24, max: 1, onHit: (m) => { dealt += c.hit(m, 0.7) || 0; c.status(m, { slow: !!(s.slow || s.freeze), knock: s.knock, freeze: s.freeze }, c.x, c.y); } }); }
        break;
      }
      const ms = c.zone.mobsAround(c.x, c.y, len + 14).filter((m: any) => {
        const ex = m.x - c.x, ey = m.y - c.y, d = Math.hypot(ex, ey) || 1;
        return d < 24 || Math.acos(Math.max(-1, Math.min(1, (ex * c.dx + ey * c.dy) / d))) <= half;
      });
      hitAll(ms, 1);
      for (const m of ms) c.status(m, { slow: !!(s.slow || s.freeze), knock: s.knock, freeze: s.freeze }, c.x, c.y);
      if (s.heal) c.buff({ heal: dealt * s.heal });
      for (const a of [-half, 0, half]) { const ca = Math.cos(a), sa = Math.sin(a); c.ev({ k: "aline", sid: c.sid, id, x: R(c.x), y: R(c.y), dx: c.dx * ca - c.dy * sa, dy: c.dx * sa + c.dy * ca, len: R(len) }); }
      break;
    }
    case "cloud": {
      const r = s.r * k;
      c.buff({ invuln: s.invuln });
      const ms = c.zone.mobsAround(c.x, c.y, r);
      hitAll(ms, 1);
      for (const m of ms) c.status(m, { slow: true }, c.x, c.y);
      c.ev({ k: "amark", sid: c.sid, id, x: R(c.x), y: R(c.y), r, t: s.invuln / 1000 });
      break;
    }
  }
  return dealt;
}
