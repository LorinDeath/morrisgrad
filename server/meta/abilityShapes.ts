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
  | { k: "ring"; n: number }
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
  backstab: { k: "dash", len: 260, w: 50, toStrongest: true, invuln: 600 }, // + веер клинков после рывка (POST.backstab)
  shield_wall: { k: "nova", r: 150, knock: 3, dr: 4000 },
  whirlwind: { k: "nova", r: 120, ticks: 4, gap: 750 },
  pierce: { k: "line", len: 420, w: 44, pierceArmor: true },
  spear_rain: { k: "rain", n: 18, area: 220, r: 55 },
  leap_strike: { k: "leap", len: 220, r: 120, invuln: 600 },
  trick_strike: { k: "ring", n: 16 }, // вихрь кинжалов во все стороны + 10% лечения (как в забеге)
  smoke_bomb: { k: "cloud", r: 150, invuln: 2500 },
  shadow_step: { k: "dash", len: 240, w: 50, invuln: 450 }, // огненный след — только с талантом t_trail (как в забеге)
  fireball: { k: "proj", len: 480, r: 110, w: "staff" },
  frost_nova: { k: "ring", n: 20 }, // кольцо ледяных осколков + замедление вокруг (как в забеге)
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
  /** модификаторы навыка (Сияния и таланты t_*): составные эффекты как в забеге */
  props?: string[];
  /** текущая позиция героя (для отложенного «эха») */
  here?: () => [number, number];
  echo?: boolean;
  /** настоящий снаряд сервера (открытый мир); без него (дуэль) — прежний мгновенный расчёт */
  fire?: (o: { t: string; x: number; y: number; dx: number; dy: number; range: number; w: number; max: number; spd?: number; arc?: boolean; onHit?: (m: any, i: number) => void; onEnd?: (x: number, y: number, hit: boolean) => void }) => any;
}

const R = (n: number) => Math.round(n);
// строки атласа снарядов (src/assets/mc/projectiles.json): id навыка/оружия → спрайт
export const PROJ_SPRITES = new Set(["fireball", "war_axe", "fire_spark", "moon_orb", "split_shard", "thorn_bow", "spear", "pierce", "daggers", "sun_beam", "ice_fan", "chain_bolt",
  "plague_flask", "plague_puddle", "glyph_mine", "orbit_skulls", "meteor", "spear_rain", "dew_splash", "auto_staff", "auto_bow", "auto_daggers", "auto_claws"]);
// спрайт снаряда автоатаки по типу оружия (открытый мир и дуэли)
/** Точка вылета и прицел выстрела. Клиент присылает свою отрисованную позицию героя (ox, oy) и точку курсора (tx, ty):
 *  сервер принимает исходную точку, только если она ближе SHOT_TOL к серверной позиции (лаг движения ≤ ~100 мс при 175–250 px/с),
 *  иначе — серверная позиция. Направление — от принятой точки к курсору (так снаряд идёт ровно в курсор), иначе — вектор dx/dy. */
export const SHOT_TOL = 96;
export function shotAim(sx: number, sy: number, msg: any, lo = -Infinity, hi = Infinity): { x: number; y: number; dx: number; dy: number; client: boolean } {
  const ox = Number(msg?.ox), oy = Number(msg?.oy);
  const client = Number.isFinite(ox) && Number.isFinite(oy) && Math.hypot(ox - sx, oy - sy) <= SHOT_TOL;
  const x = client ? Math.max(lo, Math.min(hi, ox)) : sx, y = client ? Math.max(lo, Math.min(hi, oy)) : sy;
  let dx = Number(msg?.dx), dy = Number(msg?.dy);
  const tx = Number(msg?.tx), ty = Number(msg?.ty);
  if (Number.isFinite(tx) && Number.isFinite(ty) && Math.hypot(tx - x, ty - y) > 6) { dx = tx - x; dy = ty - y; }
  if (!Number.isFinite(dx) || !Number.isFinite(dy) || Math.hypot(dx, dy) < 0.01) { dx = 0; dy = 0; }
  const L = Math.hypot(dx, dy) || 1;
  return { x, y, dx: dx / L, dy: dy / L, client };
}
export const AUTO_SPRITE: Record<string, string> = { daggers: "auto_daggers", book: "auto_staff", staff: "auto_staff", bow: "auto_bow", fly_blades: "auto_claws", spear: "spear" };
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
  const P = c.props || [];
  let dealt = 0, endX = c.x, endY = c.y;
  const hitAll = (ms: any[], mult: number, opts?: any) => { for (const m of ms) dealt += c.hit(m, mult, opts) || 0; };
  // кольцо настоящих снарядов из точки (веер клинков/кинжалов/осколков забега); без fire — мгновенный круг
  const ring = (spr: string, n: number, ox: number, oy: number, range: number, mult: number, max: number, phase = 0, onHit?: (m: any, d: number) => void) => {
    if (!c.fire) { for (const m of c.zone.mobsAround(ox, oy, range)) { const d = c.hit(m, mult * Math.min(3, max)) || 0; dealt += d; onHit?.(m, d); } c.ev({ k: "ability", sid: c.sid, id, x: R(ox), y: R(oy), r: R(range) }); return; }
    for (let i = 0; i < n; i++) { const a = phase + (i / n) * Math.PI * 2;
      c.fire({ t: spr, x: ox, y: oy, dx: Math.cos(a), dy: Math.sin(a), range, w: 24, max, onHit: (m) => { const d = c.hit(m, mult) || 0; dealt += d; onHit?.(m, d); } }); }
  };
  switch (s.k) {
    case "nova": {
      const r = s.r * k;
      // таланты как в забеге: «Отражение» — волна стены щитов ×2 и +1 с защиты; «Шесть топоров» — вихрь 6 топоров вместо 4 (урон ×1.5)
      const refl = id === "shield_wall" && P.includes("t_reflect"), axes = id === "whirlwind" && P.includes("t_axes6");
      const tm = (refl ? 2 : 1) * (axes ? 1.5 : 1);
      const tick = () => {
        const ms = c.zone.mobsAround(c.x, c.y, r);
        hitAll(ms, (s.ticks ? 1 / Math.sqrt(s.ticks) : 1) * tm);
        for (const m of ms) c.status(m, { slow: !!(s.slow || s.freeze), knock: s.knock, freeze: s.freeze }, c.x, c.y);
        c.ev({ k: "ability", sid: c.sid, id, x: R(c.x), y: R(c.y), r });
      };
      tick();
      for (let i = 1; i < (s.ticks || 1); i++) c.later(i * (s.gap || 700), tick);
      if (s.dr) c.buff({ dr: s.dr + (refl ? 1000 : 0) });
      if (s.heal) c.buff({ heal: dealt * s.heal });
      break;
    }
    case "line": {
      const len = s.len * k, spr = projSprite(id, "spear");
      if (c.fire && spr !== "sun_beam") { // летящее копьё/кинжалы: пробивает насквозь, урон в момент касания
        const fan = spr === "daggers" ? [-0.22, 0, 0.22] : id === "pierce" && P.includes("t_twin") ? [-0.16, 0.16] : [0]; // «Двойной выпад»
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
        // талант «Тройной шар»: три шара веером ±18°, каждый 55% и меньше взрыв (как в забеге)
        const split = id === "fireball" && P.includes("t_split3");
        for (const da of split ? [-0.32, 0, 0.32] : [0]) {
        const [pdx, pdy] = rot(c.dx, c.dy, da);
        const r = s.r * k * (split ? 0.76 : 1), pm = split ? 0.55 : 1;
        c.fire({ t: spr, x: c.x, y: c.y, dx: pdx, dy: pdy, range: len, w: 30, max: 1, onEnd: (x, y) => {
          hitAll(c.zone.mobsAround(x, y, r), pm); c.ev({ k: "ability", sid: c.sid, id, x: R(x), y: R(y), r });
          if (spr === "split_shard") for (const a of [-0.6, 0, 0.6]) { const [vx, vy] = rot(c.dx, c.dy, a); c.fire!({ t: "split_shard", x: x + vx * 20, y: y + vy * 20, dx: vx, dy: vy, range: 170, w: 22, max: 1, onHit: (m) => { dealt += c.hit(m, 0.4) || 0; } }); }
        } });
        }
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
      c.move(nx, ny); endX = nx; endY = ny;
      if (s.invuln) c.buff({ invuln: s.invuln });
      if (s.fan) { const r = s.fan * k; hitAll(c.zone.mobsAround(nx, ny, r), 0.6); c.ev({ k: "ability", sid: c.sid, id, x: R(nx), y: R(ny), r }); }
      if (s.trail || (id === "shadow_step" && P.includes("t_trail"))) c.later(s.trail || 600, () => {
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
      endX = nx; endY = ny;
      c.later(400, () => { const quake = P.includes("t_quake"); const r = s.r * k * (quake ? 1.5 : 1); const ms = c.zone.mobsAround(nx, ny, r); hitAll(ms, 1); for (const m of ms) c.status(m, { knock: 2, slow: quake }, nx, ny); c.ev({ k: "ability", sid: c.sid, id, x: R(nx), y: R(ny), r }); });
      break;
    }
    case "rain": {
      const area = s.area * k, n = id === "spear_rain" && P.includes("t_storm") ? 26 : s.n; // «Ливень улик»: 26 копий
      // область дождя — ПЕРЕД героем по направлению (а не вокруг него)
      const ox = c.x + c.dx * area * 1.1, oy = c.y + c.dy * area * 1.1;
      for (let i = 0; i < n; i++) {
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
      if (id === "meteor" && P.includes("t_shower")) for (const [i, ox, oy] of [[1, 52, 24], [2, -44, -36]]) { // «Метеоритный дождь»: ещё два малых
        const [sx, sy] = c.bounds(tx + ox, ty + oy), r2 = r * 0.58;
        c.ev({ k: "amark", sid: c.sid, id, x: R(sx), y: R(sy), r: R(r2), t: (s.delay + i * 300) / 1000, fdx: c.dx < 0 ? -1 : 1 });
        c.later(s.delay + i * 300, () => { hitAll(c.zone.mobsAround(sx, sy, r2), 0.2); c.ev({ k: "ability", sid: c.sid, id, x: R(sx), y: R(sy), r: R(r2) }); });
      }
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
    case "ring": {
      if (id === "trick_strike") {
        // «Коварный удар»: вихрь 16 (24 — «Веер ножей») кинжалов, 10% урона — лечение; «Двойной вихрь» — второй через 0.4 с
        const n = P.includes("t_fan24") ? 24 : 16, range = 270 * k;
        // «Ядовитые кинжалы»: попадание отравляет на 4 с (как в забеге)
        const poison = P.includes("t_poison");
        const heal = (m: any, d: number) => { if (d) { c.buff({ heal: d * 0.1 }); if (poison) c.status(m, { dot: { kind: "poison", dps: Math.max(1, c.dmg * 0.12), dur: 4 } }, c.x, c.y); } };
        ring("daggers", n, c.x, c.y, range, 0.6, 2, 0, heal);
        if (P.includes("t_double") && !c.echo) c.later(400, () => { const [hx, hy] = c.here ? c.here() : [c.x, c.y]; ring("daggers", n, hx, hy, range, 0.6, 2, Math.PI / n, heal); });
      } else {
        // «Ледяная нова»: кольцо 20 (28 — «Глубокий холод») осколков + замедление вокруг
        const n = P.includes("t_deep") ? 28 : 20, r = 120 * k;
        ring("ice_fan", n, c.x, c.y, 154 * k, 0.45, 6, 0, (m) => c.status(m, { slow: true }, c.x, c.y));
        for (const m of c.zone.mobsAround(c.x, c.y, r)) c.status(m, { slow: true }, c.x, c.y);
        c.ev({ k: "ability", sid: c.sid, id, x: R(c.x), y: R(c.y), r: R(r) });
      }
      break;
    }
    case "cloud": {
      const r = s.r * k, choke = id === "smoke_bomb" && P.includes("t_choke");
      c.buff({ invuln: s.invuln });
      const ms = c.zone.mobsAround(c.x, c.y, r);
      hitAll(ms, 1);
      for (const m of ms) c.status(m, { slow: true }, c.x, c.y);
      // «Чадящая печь»: облако держится на 1.5 с дольше и жжёт врагов внутри (3 тика)
      if (choke) for (let i = 1; i <= 3; i++) c.later(i * 1000, () => { const ins = c.zone.mobsAround(c.x, c.y, r); hitAll(ins, 0.3); for (const m of ins) c.status(m, { slow: true }, c.x, c.y); });
      c.ev({ k: "amark", sid: c.sid, id, x: R(c.x), y: R(c.y), r, t: (s.invuln + (choke ? 1500 : 0)) / 1000 });
      break;
    }
  }
  // составные эффекты ПОСЛЕ основной формы — как в забеге (survivors/run.js castAbility)
  if (id === "backstab") {
    // «Удар в спину»: после рывка за спину — веер 10 (14 — талант t_fan) клинков из точки приземления
    ring("daggers", P.includes("t_fan") ? 14 : 10, endX, endY, 192 * k, 0.8, 3);
    c.ev({ k: "ability", sid: c.sid, id, x: R(endX), y: R(endY), r: 60 });
  }
  if (P.includes("nova") && !c.echo) { // Сияние «Нова»: взрыв вокруг героя после навыка
    const r = 80, ms = c.zone.mobsAround(endX, endY, r); hitAll(ms, 0.55);
    for (const m of ms) c.status(m, { knock: 2 }, endX, endY);
    c.ev({ k: "ability", sid: c.sid, id: "nova", x: R(endX), y: R(endY), r });
  }
  if (P.includes("echo") && !c.echo) // Сияние «Эхо»: повтор через 0.6 с с силой 40% из текущей позиции, без перемещения
    c.later(600, () => { const [hx, hy] = c.here ? c.here() : [endX, endY]; castShape(id, { ...c, x: hx, y: hy, dmg: c.dmg * 0.4, echo: true, hit: (m, mult, o) => c.hit(m, mult * 0.4, o), move: () => {}, buff: () => {} }); });
  return dealt;
}
