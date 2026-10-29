// 🜏 КОНСТРУКТОР НАВЫКОВ (админка «🛠 Конструктор навыков»): навык собирается из данных, как в Azure Striker / Mighty Gunvolt.
// Форма (снаряд / плеть-конус / кольцо / дождь / рывок) + анимация листа Художника любой стихии + траектория снаряда
// (прямая, дуга, синусоида, самонаведение, бумеранг, кривая Безье, навес) + скорость, масштаб, хитбокс «по картинке»
// (server/meta/skillArtHit.json — непрозрачная рамка кадров, tools/bm-art/sync-skills.py) + количество/веер, пробивание,
// длительность + тип урона (чёрный / чистый стихийный / обычный) + эффекты на цели и на себя + цена (ОЗ, самозамедление,
// перезарядка) + модификаторы (+X% атаки, ×N урона, +% скорости/крита/зарядки/брони… по условию и шансу, со стаками).
// Хранение — game_overrides (kind "skdef"); свои навыки — id «skx_…» (создаются из шаблона, сброс = удаление).
// Пять огненных и пять ледяных навыков артефактов — ПРЕСЕТЫ (их id), значения по умолчанию дают ровно прежнее поведение
// (skillcraft-test: эквивалентность старым формам abilityShapes). Модуль общий: сервер и клиент (траектории pathAt).
import { BMA_CFG, BM_SKILLS, BM_SHAPES, ELEMENTS, SK_ELEM } from "./blackArt";
import ART from "./skillArtHit.json";

export type SkForm = "proj" | "cone" | "nova" | "rain" | "dash";
export type SkPath = "line" | "arc" | "sine" | "homing" | "boomerang" | "bezier" | "lob";
export const SK_FORMS: SkForm[] = ["proj", "cone", "nova", "rain", "dash"];
export const SK_FORM_NAMES: Record<SkForm, string> = { proj: "Снаряд", cone: "Плеть / конус", nova: "Кольцо вокруг", rain: "Дождь на площадь", dash: "Рывок" };
export const SK_PATHS: SkPath[] = ["line", "arc", "sine", "homing", "boomerang", "bezier", "lob"];
export const SK_PATH_NAMES: Record<SkPath, string> = { line: "Прямая", arc: "Дуга (вбок)", sine: "Синусоида", homing: "Самонаведение", boomerang: "Бумеранг", bezier: "Кривая Безье", lob: "Навесом (над головами)" };
export const SK_SLOT: Record<SkForm, string> = { cone: "whip", nova: "ring", proj: "bolt", rain: "rain", dash: "dash" };
export const SK_DMG = ["black", "pure", "normal"] as const;
export const SK_DMG_NAMES: Record<string, string> = { black: "Чёрный (% ОЗ цели, мимо брони)", pure: "Чистый стихийный (стихия навыка)", normal: "Обычный (от оружия, броня режет)" };
/** модификаторы: стат → подпись */
export const SK_MOD_STATS: Record<string, string> = { "": "—", dmg: "Урон навыков", atk: "Атака героя", spd: "Скорость бега", crit: "Шанс крита", charge: "Скорость зарядки удара", armor: "Броня", cdr: "Перезарядка навыков", heal: "Лечение (% макс. ОЗ, мгновенно)" };
export const SK_MOD_ON: Record<string, string> = { cast: "при применении", hit: "при попадании", kill: "при убийстве", crit: "при крите навыка" };
export const SK_MOD_IF: Record<string, string> = { "": "всегда", hpBelow: "ОЗ героя ниже порога %", hpAbove: "ОЗ героя выше порога %", charged: "удар заряжен (держит заряд ≥ порога %)", tgtHpBelow: "ОЗ цели ниже порога %" };
export const SK_MAX_MODS = 4;
export interface SkMod { k: string; op: "pct" | "mul"; v: number; ms: number; st: number; on: string; if: string; th: number; ch: number }
export interface SkDef {
  id: string; preset?: boolean; name: string; icon: string; desc: string; elem: string; fx: string; form: SkForm; cd: number; rad: string;
  // снаряд
  path: SkPath; spd: number; range: number; dur: number; scale: number; amp: number; freq: number; turn: number; seek: number;
  b1a: number; b1s: number; b2a: number; b2s: number;
  hit: "auto" | "circle" | "box"; hitW: number; hitH: number; n: number; spread: number; pierce: number; hitMul: number; boom: number; boomMul: number;
  // площади
  r: number; len: number; arc: number; w: number; drops: number; area: number; lead: number; gap: number; ticks: number; tickGap: number;
  invuln: number; trail: number; trailMul: number;
  // урон
  dmg: "black" | "pure" | "normal"; pct: number; k: number; mul: number;
  // на цели
  slow: "" | "on" | "ice"; freeze: number; knock: number;
  // на себя
  sInv: number; sDr: number; sHeal: number; sHaste: number;
  // цена
  hpCost: number; selfSlow: number; selfSlowMul: number;
  mods: Record<string, SkMod>;
  traits?: any[];
}
export const CUSTOM_SK = /^skx_[a-z0-9_]{2,32}$/;
const ELEM_IDS = ELEMENTS.map((e) => e.id);
export const SK_ELEMS = ELEM_IDS;
const RAD = 180 / Math.PI;
/** пустой (новый) навык: огненный снаряд по прямой, взрыв у первой цели */
export function skBlank(id: string, form: SkForm = "proj", elem = "fire"): SkDef {
  return { id, name: "Новый навык", icon: "✨", desc: "", elem: ELEM_IDS.includes(elem) ? elem : "fire", fx: "", form: SK_FORMS.includes(form) ? form : "proj", cd: 8, rad: "echo,swift,vamp",
    path: "line", spd: 560, range: 480, dur: 0, scale: 1, amp: 60, freq: 1.5, turn: 240, seek: 420, b1a: 0.33, b1s: 0.5, b2a: 0.66, b2s: -0.5,
    hit: "auto", hitW: 0, hitH: 0, n: 1, spread: 20, pierce: 1, hitMul: 0, boom: 100, boomMul: 1,
    r: 140, len: 230, arc: RAD, w: 60, drops: 8, area: 200, lead: 0, gap: 80, ticks: 1, tickGap: 700, invuln: 0, trail: 0, trailMul: 0.7,
    dmg: "black", pct: 0.6, k: 2, mul: 1, slow: "", freeze: 0, knock: 0, sInv: 0, sDr: 0, sHeal: 0, sHaste: 0, hpCost: 0, selfSlow: 0, selfSlowMul: 0.6,
    mods: Object.fromEntries([0, 1, 2, 3].map((i) => [String(i), { k: "", op: "pct", v: 0, ms: 3000, st: 1, on: "cast", if: "", th: 50, ch: 100 }])) as any };
}
/** пресет из навыка артефакта (BM_SKILLS + BM_SHAPES): ровно прежние числа */
function presetOf(a: any): SkDef {
  const s = BM_SHAPES[a.id], el = a.bm?.elem || "fire", d = skBlank(a.id, s.k, el), ice = el === "ice";
  Object.assign(d, { preset: true, name: a.name, icon: a.icon, desc: a.desc, cd: a.cd, rad: (a.radiance || []).join(","), pct: a.bm.pct, k: a.bm.k, dmg: "black" });
  if (s.k === "cone") Object.assign(d, { len: s.len, arc: s.arc * RAD, slow: ice ? "ice" : "" });
  if (s.k === "nova") Object.assign(d, { r: s.r, knock: s.knock || 0, slow: ice ? "ice" : "" });
  if (s.k === "proj") Object.assign(d, { range: s.len, boom: s.r, spd: 560, hit: "circle", hitW: 30, hitH: 30, pierce: 1, hitMul: 0, boomMul: 1 });
  if (s.k === "rain") Object.assign(d, { drops: s.n, area: s.area, r: s.r, lead: -1, gap: 80 });
  if (s.k === "dash") Object.assign(d, { len: s.len, w: s.w, invuln: s.invuln || 0, trail: s.trail || 0 });
  return d;
}
export const SK_DEFS: Record<string, SkDef> = Object.fromEntries(BM_SKILLS.map((a) => [a.id, presetOf(a)]));
export const SK_PRESET_IDS = Object.keys(SK_DEFS);
for (const id of SK_PRESET_IDS) SK_ELEM[id] = SK_DEFS[id].elem;
/** шаблоны «Новый из пресета» в админке: любой навык можно продублировать */
export function skClone(src: SkDef, id: string): SkDef { const c = JSON.parse(JSON.stringify(src)); c.id = id; delete c.preset; c.name = String(src.name || "Навык").slice(0, 40) + " (копия)"; return c; }

// ——— анимация и хитбокс «по картинке» ———
export const skFxElem = (d: SkDef) => (d.fx && ELEM_IDS.includes(d.fx) ? d.fx : d.elem);
/** ключ листа Художника и его часть для формы */
export function skArtKey(d: SkDef): string | null { const A: any = ART; return A.elems?.[skFxElem(d)]?.[SK_SLOT[d.form]] || A.elems?.fire?.[SK_SLOT[d.form]] || null; }
/** хитбокс снаряда: {s:'c', r} или {s:'b', a0, a1, hw} (вдоль направления от точки снаряда, полуширина), px мира */
export function skHitbox(d: SkDef): { s: "c"; r: number } | { s: "b"; a0: number; a1: number; hw: number } {
  const sc = Math.max(0.1, d.scale || 1);
  if (d.hit === "circle") return { s: "c", r: Math.max(2, (d.hitW || 30) / 2) };
  if (d.hit === "box") { const L = Math.max(4, d.hitW || 40), W = Math.max(4, d.hitH || 20); return { s: "b", a0: -L / 2, a1: L / 2, hw: W / 2 }; }
  const key = skArtKey(d), H: any = key && (ART as any).hit?.[key]?.bolt;
  if (!H) return { s: "c", r: 15 * sc };
  return { s: "b", a0: H[0] * sc, a1: H[2] * sc, hw: Math.max(Math.abs(H[1]), Math.abs(H[3])) * sc };
}
/** касание моба радиуса mr снарядом в (px,py) с направлением (hx,hy) */
export function hbTouch(hb: any, px: number, py: number, hx: number, hy: number, mx: number, my: number, mr: number): boolean {
  const ex = mx - px, ey = my - py;
  if (hb.s === "c") return ex * ex + ey * ey <= (hb.r + mr) * (hb.r + mr);
  const al = ex * hx + ey * hy, sd = Math.abs(ex * hy - ey * hx);
  return al >= hb.a0 - mr && al <= hb.a1 + mr && sd <= hb.hw + mr;
}

// ——— траектории (детерминированные: сервер и клиент считают одинаково) ———
export interface PathP { p: SkPath; a?: number; f?: number; b?: number[] }
/** точка пути на пройденной длине s из range: [вдоль, вбок] в системе прицела и касательная [ta, ts] (не нормирована) */
export function pathAt(P: PathP, s: number, range: number): [number, number, number, number] {
  const R0 = Math.max(1, range), u = Math.max(0, Math.min(1, s / R0)), A = Number(P.a) || 0;
  switch (P.p) {
    case "arc": return [s, A * Math.sin(Math.PI * u), 1, A * Math.PI / R0 * Math.cos(Math.PI * u)];
    case "sine": { const w = 2 * Math.PI * (Number(P.f) || 1); return [s, A * Math.sin(w * u), 1, A * w / R0 * Math.cos(w * u)]; }
    case "boomerang": { const h = R0 / 2, out = s <= h; return [out ? s : R0 - s, A * Math.sin(Math.PI * u), out ? 1 : -1, A * Math.PI / R0 * Math.cos(Math.PI * u)]; }
    case "bezier": {
      const b = P.b || [0.33, 0.5, 0.66, -0.5], p1 = [b[0] * R0, b[1] * R0], p2 = [b[2] * R0, b[3] * R0], p3 = [R0, 0], t = u, m = 1 - t;
      const x = 3 * m * m * t * p1[0] + 3 * m * t * t * p2[0] + t * t * t * p3[0], y = 3 * m * m * t * p1[1] + 3 * m * t * t * p2[1] + t * t * t * p3[1];
      const tx = 3 * m * m * p1[0] + 6 * m * t * (p2[0] - p1[0]) + 3 * t * t * (p3[0] - p2[0]), ty = 3 * m * m * p1[1] + 6 * m * t * (p2[1] - p1[1]) + 3 * t * t * (p3[1] - p2[1]);
      return [x, y, tx || 1e-6, ty];
    }
    default: return [s, 0, 1, 0];
  }
}
/** мировая точка пути и единичное направление: (x0,y0) — старт, (dx,dy) — прицел */
export function pathWorld(P: PathP, x0: number, y0: number, dx: number, dy: number, s: number, range: number): [number, number, number, number] {
  const [a, sd, ta, ts] = pathAt(P, s, range), nx = -dy, ny = dx;
  const hx = dx * ta + nx * ts, hy = dy * ta + ny * ts, L = Math.hypot(hx, hy) || 1;
  return [x0 + dx * a + nx * sd, y0 + dy * a + ny * sd, hx / L, hy / L];
}
/** самонаведение: поворот направления (hx,hy) к цели не больше чем на turn°/с × dt */
export function steer(hx: number, hy: number, tx: number, ty: number, turnDeg: number, dt: number): [number, number] {
  const L = Math.hypot(tx, ty); if (L < 1e-6) return [hx, hy];
  const want = Math.atan2(ty, tx), cur = Math.atan2(hy, hx); let da = want - cur;
  while (da > Math.PI) da -= 2 * Math.PI; while (da < -Math.PI) da += 2 * Math.PI;
  const mx = (turnDeg / RAD) * dt, a = cur + Math.max(-mx, Math.min(mx, da));
  return [Math.cos(a), Math.sin(a)];
}
/** длина полёта: при длительности — скорость × время */
export const skRange = (d: SkDef, k = 1) => (d.dur > 0 ? d.spd * d.dur / 1000 : d.range * k);

// ——— форма для мобов (abilityShapes.shapeOf) ———
export function skShape(d: SkDef): any {
  const slow = slowOn(d);
  switch (d.form) {
    case "cone": return { k: "cone", len: d.len, arc: d.arc / RAD, elem: d.elem, slow, ...(d.knock ? { knock: d.knock } : {}), ...(d.freeze ? { freeze: d.freeze } : {}) };
    case "nova": return { k: "nova", r: d.r, elem: d.elem, slow, ...(d.knock ? { knock: d.knock } : {}), ...(d.freeze ? { freeze: d.freeze } : {}) };
    case "rain": return { k: "rain", n: d.drops, area: d.area, r: d.r, elem: d.elem };
    case "dash": return { k: "dash", len: d.len, w: d.w, elem: d.elem, ...(d.invuln ? { invuln: d.invuln } : {}), ...(d.trail ? { trail: d.trail } : {}) };
    default: return { k: "proj", len: d.range, r: d.boom || 60, w: "staff", elem: d.elem };
  }
}
export const slowOn = (d: SkDef) => d.slow === "on" || (d.slow === "ice" && !!BMA_CFG.iceSlow);

// ——— выполнение (abilityShapes.castShape → castCraft) ———
/** хуки сервиса для цены, модификаторов и бафов на себя (в дуэлях/у мобов их нет — навык работает без них) */
export interface SkHooks {
  hpFrac(): number; chargeFrac(): number; pay(hpPct: number): boolean;
  mod(m: SkMod, idx: number): void; selfHaste(ms: number): void; selfSlow(ms: number, mul: number): void; dmgMul(): number;
}
const R = (n: number) => Math.round(n);
const rot = (dx: number, dy: number, a: number): [number, number] => [dx * Math.cos(a) - dy * Math.sin(a), dx * Math.sin(a) + dy * Math.cos(a)];
function lineMobs(zone: any, x: number, y: number, dx: number, dy: number, len: number, w: number) {
  return zone.mobsAround(x + dx * len / 2, y + dy * len / 2, len / 2 + w).filter((m: any) => {
    const ex = m.x - x, ey = m.y - y, along = ex * dx + ey * dy;
    return along >= -w && along <= len + w && Math.abs(ex * dy - ey * dx) <= w / 2 + 14;
  });
}
const modList = (d: SkDef) => Object.keys(d.mods || {}).sort().map((i) => [Number(i), d.mods[i]] as [number, SkMod]).filter(([, m]) => m && m.k);
/** условие модификатора */
function modOk(m: SkMod, H: SkHooks | undefined, tgt: any, rnd: () => number): boolean {
  const th = (Number(m.th) || 0) / 100;
  if (m.if === "hpBelow" && !(H && H.hpFrac() < th)) return false;
  if (m.if === "hpAbove" && !(H && H.hpFrac() > th)) return false;
  if (m.if === "charged" && !(H && H.chargeFrac() >= th)) return false;
  if (m.if === "tgtHpBelow" && !(tgt && tgt.maxHp > 0 && tgt.hp / tgt.maxHp < th)) return false;
  return (Number(m.ch) ?? 100) >= 100 || rnd() * 100 < (Number(m.ch) || 0);
}
/** мгновенный множитель урона этого применения от модификаторов «Урон навыков» без длительности (при применении) */
export function castDmgMul(d: SkDef, H: SkHooks | undefined, rnd: () => number = Math.random): number {
  let k = 1;
  for (const [, m] of modList(d)) if (m.k === "dmg" && m.on === "cast" && !(m.ms > 0) && modOk(m, H, null, rnd)) k *= m.op === "mul" ? (Number(m.v) || 1) : 1 + (Number(m.v) || 0) / 100;
  return k;
}
/** Применить навык конструктора. c — CastCtx (abilityShapes), k — radiusMult, art — рисовать листом (иначе старый код-эффект). */
export function castCraft(id: string, d: SkDef, c: any, k: number, art: boolean, rnd: () => number = Math.random, fbSprite = "fireball"): { dealt: number; ex: number; ey: number } {
  const H: SkHooks | undefined = c.sk;
  let dealt = 0, ex = c.x, ey = c.y;
  if (d.hpCost > 0 && H && !H.pay(d.hpCost)) return { dealt: 0, ex, ey }; // не хватает ОЗ — навык не срабатывает
  const mods = modList(d);
  const cm = (Number(d.mul) || 1) * castDmgMul(d, H, rnd) * (H ? H.dmgMul() : 1);
  const st = { slow: slowOn(d) || !!d.freeze, knock: d.knock || undefined, freeze: d.freeze || undefined };
  const anySt = st.slow || !!st.knock || !!st.freeze;
  const fireMods = (on: string, tgt: any) => { if (H) for (const [i, m] of mods) if (m.on === on && !(m.k === "dmg" && on === "cast" && !(m.ms > 0)) && modOk(m, H, tgt, rnd)) H.mod(m, i); };
  /** урон по мобу + эффекты (статусы, лечение, модификаторы попадания/убийства) */
  const hit = (m: any, mult: number) => {
    const wasDead = !!m.dead, dd = c.hit(m, mult * cm) || 0; dealt += dd;
    if (dd) { if (d.sHeal > 0) c.buff({ heal: dd * d.sHeal / 100 }); fireMods("hit", m); if (!wasDead && m.dead) fireMods("kill", m); }
    return dd;
  };
  /** как в прежних формах: сначала урон всем, потом статусы всем задетым (если у навыка они есть) */
  const hitAll = (ms: any[], mult: number, stx = c.x, sty = c.y) => { for (const m of ms) hit(m, mult); if (anySt) for (const m of ms) c.status(m, st, stx, sty); };
  switch (d.form) {
    case "nova": {
      const r = d.r * k, ticks = Math.max(1, d.ticks | 0);
      const tick = () => { const ms = c.zone.mobsAround(c.x, c.y, r); hitAll(ms, ticks > 1 ? 1 / Math.sqrt(ticks) : 1); c.ev({ k: "ability", sid: c.sid, id, x: R(c.x), y: R(c.y), r }); };
      tick(); for (let i = 1; i < ticks; i++) c.later(i * (d.tickGap || 700), tick);
      break;
    }
    case "cone": {
      const len = d.len * k, arc = d.arc / RAD, half = arc / 2;
      const ms = c.zone.mobsAround(c.x, c.y, len + 14).filter((m: any) => {
        const ex2 = m.x - c.x, ey2 = m.y - c.y, dd = Math.hypot(ex2, ey2) || 1;
        return dd < 24 || Math.acos(Math.max(-1, Math.min(1, (ex2 * c.dx + ey2 * c.dy) / dd))) <= half;
      });
      hitAll(ms, 1);
      c.ev({ k: "acone", sid: c.sid, id, x: R(c.x), y: R(c.y), dx: +c.dx.toFixed(3), dy: +c.dy.toFixed(3), len: R(len), arc });
      break;
    }
    case "rain": {
      const area = d.area * k, n = Math.max(1, d.drops | 0), ox = c.x + c.dx * area * 1.1, oy = c.y + c.dy * area * 1.1;
      const lead = art ? Math.max(0, Math.min(1500, d.lead >= 0 ? d.lead : Number(BMA_CFG.rainLead) || 0)) : 0, gap = d.gap ?? 80, pts: number[][] = [];
      for (let i = 0; i < n; i++) {
        const a = rnd() * Math.PI * 2, dd = Math.sqrt(rnd()) * area, px = ox + Math.cos(a) * dd, py = oy + Math.sin(a) * dd;
        if (art) pts.push([R(px), R(py), lead + gap * i]);
        c.later(lead + gap * i, () => { hitAll(c.zone.mobsAround(px, py, d.r), 1 / 4, px, py); c.ev({ k: "ability", sid: c.sid, id, x: R(px), y: R(py), r: d.r }); });
      }
      if (art) c.ev({ k: "arain", sid: c.sid, id, x: R(ox), y: R(oy), r: d.r, lead, pts });
      break;
    }
    case "dash": {
      const dx = c.dx, dy = c.dy, [nx, ny] = c.bounds(c.x + dx * d.len, c.y + dy * d.len), real = Math.hypot(nx - c.x, ny - c.y);
      hitAll(lineMobs(c.zone, c.x, c.y, dx, dy, real, d.w), 1);
      c.ev({ k: "aline", sid: c.sid, id, x: R(c.x), y: R(c.y), dx, dy, len: R(real) });
      const fx = c.x, fy = c.y; c.move(nx, ny); ex = nx; ey = ny;
      if (d.invuln) c.buff({ invuln: d.invuln });
      if (d.trail) c.later(d.trail, () => {
        hitAll(lineMobs(c.zone, fx, fy, dx, dy, real, d.w + 30), d.trailMul ?? 0.7, fx, fy);
        for (let i = 0; i <= 3; i++) c.ev({ k: "ability", sid: c.sid, id, x: R(fx + dx * real * i / 3), y: R(fy + dy * real * i / 3), r: 60 });
      });
      break;
    }
    default: { // снаряд
      const len = skRange(d, k), r = d.boom * k, n = Math.max(1, Math.min(12, d.n | 0)), spr = art ? id : fbSprite;
      const spread = (d.spread || 0) / RAD, hb = skHitbox(d), lob = d.path === "lob";
      const legacy = d.path === "line" && d.hit === "circle" && d.hitW === 30 && d.scale === 1 && !d.hitMul;
      const end = (x: number, y: number) => { if (r > 0 && d.boomMul > 0) hitAll(c.zone.mobsAround(x, y, r), d.boomMul, x, y); c.ev({ k: "ability", sid: c.sid, id, x: R(x), y: R(y), r: r || 40 }); };
      if (c.fire) {
        for (let i = 0; i < n; i++) {
          const da = n > 1 ? -spread / 2 + (i / (n - 1)) * spread : 0, [pdx, pdy] = rot(c.dx, c.dy, da);
          const o: any = { t: spr, ...(art || !legacy ? { spd: d.spd } : {}), x: c.x, y: c.y, dx: pdx, dy: pdy, range: len, w: hb.s === "c" ? hb.r * 2 : hb.hw * 2, max: lob ? 0 : Math.max(1, d.pierce || 99), onEnd: end };
          if (lob) o.arc = true;
          if (d.hitMul > 0) o.onHit = (m: any) => { hit(m, d.hitMul); if (anySt) c.status(m, st, c.x, c.y); };
          if (!legacy && !lob) { o.pth = { p: d.path, a: (n > 1 && d.path !== "line" ? (i % 2 ? -1 : 1) : 1) * d.amp, f: d.freq, b: [d.b1a, d.b1s, d.b2a, d.b2s], turn: d.turn, seek: d.seek }; o.hb = hb; if (d.scale !== 1) o.sz = d.scale; }
          c.fire(o);
        }
        break;
      }
      // без настоящих снарядов (дуэль): мгновенно до первой цели на линии
      const on = lineMobs(c.zone, c.x, c.y, c.dx, c.dy, len, 30).map((m: any) => ({ m, a: (m.x - c.x) * c.dx + (m.y - c.y) * c.dy })).sort((p: any, q: any) => p.a - q.a);
      const at = on.length ? Math.max(0, on[0].a) : len, tx = c.x + c.dx * at, ty = c.y + c.dy * at;
      c.ev({ k: "aproj", sid: c.sid, id, x: R(c.x), y: R(c.y), tx: R(tx), ty: R(ty), w: "staff" });
      c.later(Math.min(600, at * 1.2), () => { if (on[0] && d.hitMul > 0) hit(on[0].m, d.hitMul); end(tx, ty); });
    }
  }
  // на себя и цена
  if (d.sInv > 0 || d.sDr > 0) c.buff({ ...(d.sInv > 0 ? { invuln: d.sInv } : {}), ...(d.sDr > 0 ? { dr: d.sDr } : {}) });
  if (H && d.sHaste > 0) H.selfHaste(d.sHaste);
  if (H && d.selfSlow > 0) H.selfSlow(d.selfSlow, d.selfSlowMul || 0.6);
  fireMods("cast", null);
  return { dealt, ex, ey };
}

// ——— таймерные бафы модификаторов (ms.skb): свёртка в статы героя (service.effective) ———
export interface SkBuff { k: string; op: "pct" | "mul"; v: number; until: number; n: number; max: number; src: string }
/** добавить стак (обновляет длительность); ключ — навык+номер модификатора */
export function skBuffAdd(list: SkBuff[], src: string, m: SkMod, now: number): SkBuff | null {
  if (!(m.ms > 0)) return null;
  for (let i = list.length - 1; i >= 0; i--) if (list[i].until <= now) list.splice(i, 1);
  let b = list.find((x) => x.src === src);
  if (!b) { if (list.length >= 16) return null; b = { k: m.k, op: m.op === "mul" ? "mul" : "pct", v: Number(m.v) || 0, until: 0, n: 0, max: Math.max(1, Math.min(20, m.st | 0 || 1)), src }; list.push(b); }
  b.n = Math.min(b.max, b.n + 1); b.until = now + m.ms; b.v = Number(m.v) || 0;
  return b;
}
/** итог по стату: pct — сумма процентов, mul — произведение множителей */
export function skBuffSum(list: SkBuff[] | undefined, k: string, now: number): { pct: number; mul: number } {
  let pct = 0, mul = 1; if (!list) return { pct, mul };
  for (const b of list) if (b.k === k && b.until > now) { if (b.op === "mul") mul *= Math.pow(b.v || 1, b.n); else pct += b.v * b.n; }
  return { pct, mul: Math.max(0.05, Math.min(20, mul)) };
}
/** применить бафы к посчитанным статам героя (копия объекта) */
export function skApplyBuffs(e: any, list: SkBuff[] | undefined, now: number): any {
  if (!list?.length || !list.some((b) => b.until > now)) return e;
  const o = { ...e }, S = (k: string) => skBuffSum(list, k, now);
  { const s = S("atk"); if (s.pct || s.mul !== 1) { o.dmgPct = (o.dmgPct || 0) + s.pct; o.weaponMin = o.weaponMin * s.mul; o.weaponMax = o.weaponMax * s.mul; } }
  { const s = S("crit"); if (s.pct || s.mul !== 1) o.critPct = Math.min(100, ((o.critPct || 0) + s.pct) * s.mul); }
  { const s = S("spd"); if (s.pct || s.mul !== 1) o.speedPct = Math.min(Number(BMA_CFG.skMaxSpeedPct) || 60, ((o.speedPct || 0) + s.pct) * (s.mul !== 1 ? s.mul : 1) + (s.mul !== 1 && !o.speedPct ? (s.mul - 1) * 100 : 0)); }
  { const s = S("armor"); if (s.pct || s.mul !== 1) { const a0 = o.armor || 0; o.armor = Math.round(a0 * (1 + s.pct / 100) * s.mul); if (a0 > 0) o.damageReduction = Math.min(0.85, (o.damageReduction || 0) * o.armor / a0); } }
  { const s = S("cdr"); if (s.pct || s.mul !== 1) o.cdrPct = Math.min(60, ((o.cdrPct || 0) + s.pct) * s.mul); }
  { const s = S("charge"); if ((s.pct || s.mul !== 1) && o.bm) o.bm = { ...o.bm, charge: Math.max(0.05, (o.bm.charge || 1) / ((1 + s.pct / 100) * s.mul)) }; }
  return o;
}

// ——— запись в общий реестр навыков (через хук из overrides.ts — без циклических импортов) ———
export const SK_HOOK: { reg: (d: SkDef) => void; unreg: (id: string) => void } = { reg: () => {}, unreg: () => {} };
/** описание для героя/клиента (имя, значок, форма — клиент дорисует навык и регистрирует его в ABILITY_BY_ID) */
export function skPublic(d: SkDef) {
  return { id: d.id, name: d.name, icon: d.icon, desc: d.desc, elem: d.elem, fx: d.fx, form: d.form, cd: d.cd, path: d.path, amp: d.amp, freq: d.freq, b: [d.b1a, d.b1s, d.b2a, d.b2s], turn: d.turn, scale: d.scale };
}
/** проверка целого навыка после правки: ошибки, которые схема полей не ловит */
export function skErr(d: SkDef): string | null {
  if (!SK_FORMS.includes(d.form)) return "форма: выберите из списка";
  if (d.form === "proj" && !(d.boom > 0 && d.boomMul > 0) && !(d.hitMul > 0)) return "снаряд без урона: задайте «урон при касании» или взрыв";
  if (d.path === "homing" && !(d.turn > 0)) return "самонаведение: скорость поворота больше 0";
  for (const [, m] of modList(d)) { if (!SK_MOD_STATS[m.k]) return "модификатор: стат из списка"; if (m.op === "mul" && !(m.v > 0)) return "модификатор ×: множитель больше 0"; }
  return null;
}
