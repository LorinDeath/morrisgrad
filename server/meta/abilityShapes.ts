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
  | { k: "cloud"; r: number; invuln: number };

export const SHAPES: Record<string, Shape> = {
  backstab: { k: "dash", len: 260, w: 50, toStrongest: true, fan: 150 },
  shield_wall: { k: "nova", r: 150, knock: 3, dr: 4000 },
  whirlwind: { k: "nova", r: 120, ticks: 4, gap: 750 },
  pierce: { k: "line", len: 420, w: 44, pierceArmor: true },
  spear_rain: { k: "rain", n: 18, area: 220, r: 55 },
  leap_strike: { k: "leap", len: 220, r: 120, invuln: 600 },
  trick_strike: { k: "nova", r: 140, heal: 0.1 },
  smoke_bomb: { k: "cloud", r: 150, invuln: 2500 },
  shadow_step: { k: "dash", len: 240, w: 50, trail: 600, invuln: 300 },
  fireball: { k: "proj", len: 480, r: 110, w: "staff" },
  frost_nova: { k: "nova", r: 170, freeze: 2000 },
  meteor: { k: "meteor", dist: 300, r: 130, delay: 1200 },
  fly_blade_dash: { k: "dash", len: 200, w: 60 },
};
// навыки монстров: форма их базовой реализации (AbilityDef.base), иначе — вспышка
export function shapeOf(id: string): Shape {
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
}

const R = (n: number) => Math.round(n);
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
      const len = s.len * k;
      hitAll(lineMobs(c.zone, c.x, c.y, c.dx, c.dy, len, s.w), 1, { pierceArmor: s.pierceArmor });
      c.ev({ k: "aline", sid: c.sid, id, x: R(c.x), y: R(c.y), dx: c.dx, dy: c.dy, len: R(len) });
      break;
    }
    case "proj": {
      // летит до первого моба на линии (или до конца), там взрыв
      const len = s.len * k;
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
      for (let i = 0; i < s.n; i++) {
        const a = cryptoRand() * Math.PI * 2, d = Math.sqrt(cryptoRand()) * area;
        const px = c.x + Math.cos(a) * d, py = c.y + Math.sin(a) * d;
        c.later(80 * i, () => { hitAll(c.zone.mobsAround(px, py, s.r), 1 / 4); c.ev({ k: "ability", sid: c.sid, id, x: R(px), y: R(py), r: s.r }); });
      }
      break;
    }
    case "meteor": {
      const [tx, ty] = c.bounds(c.x + c.dx * s.dist, c.y + c.dy * s.dist);
      const r = s.r * k;
      c.ev({ k: "amark", sid: c.sid, id, x: R(tx), y: R(ty), r, t: s.delay / 1000 });
      c.later(s.delay, () => { hitAll(c.zone.mobsAround(tx, ty, r), 1); c.ev({ k: "ability", sid: c.sid, id, x: R(tx), y: R(ty), r }); });
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
