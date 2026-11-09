// «Ночной атлас» — чистая логика: раскладка луга, физика, якоря спрайтов.
// Кадр 16×16. Герой смотрит вправо, якорь низ-центр (x = 8, y = 16).
// Подошвы idle/walk — строка 13, контур — строка 14: контур стоит на пикселе
// сразу над верхней кромкой tile_ground. Прыжок в кадре уже поднят на 2 px
// (низ на строке 12) и не зацикливается. Куст сажается на 2 px в траву.

export const TILE = 16;
export const GROUND_H = 16;
export const HERO_ANCHOR_X = 8;
export const OUTLINE_ROW = 14;
/** drawImage y = screenFeet − HERO_DRAW_DY, чтобы строка 14 легла на groundTop − 1. */
export const HERO_DRAW_DY = OUTLINE_ROW + 1;
/** На сколько пикселей куст уходит в траву относительно линии контура героя. */
export const BUSH_SINK = 2;
export const WALK_FPS = 6;
export const WORLD_SCREENS = 2.75;

export const GRAVITY = 1100;
export const JUMP_V = 325;
export const SHORT_HOP_V = 180;
export const MAX_RUN = 104;
export const ACCEL = 780;
export const PICKUP_R = 18;
export const HERO_CX_ABOVE_FEET = 6;
export const ITEM_CX_ABOVE_LIFT = 7;

export const AIR_LIFT_MIN = 26;
export const AIR_LIFT_MAX = 38;

export type WonderId =
  | "item_chest"
  | "item_bird"
  | "item_berry"
  | "item_clock"
  | "item_critter"
  | "item_boat"
  | "item_hat"
  | "item_campfire"
  | "item_balloon"
  | "item_fish"
  | "item_mill"
  | "item_gramophone";

export interface WonderSpec {
  id: WonderId;
  name: string;
  air: boolean;
  /** Нижняя непрозрачная строка (0…15). Для героя прыжка не используется. */
  bottom: number;
}

export const WONDERS: readonly WonderSpec[] = [
  { id: "item_chest", name: "Сундук", air: false, bottom: 12 },
  { id: "item_bird", name: "Сова", air: true, bottom: 13 },
  { id: "item_berry", name: "Лунная ягода", air: true, bottom: 14 },
  { id: "item_clock", name: "Карманные часы", air: true, bottom: 13 },
  { id: "item_critter", name: "Ёжик", air: false, bottom: 13 },
  { id: "item_boat", name: "Лодка", air: false, bottom: 14 },
  { id: "item_hat", name: "Шляпа", air: false, bottom: 13 },
  { id: "item_campfire", name: "Костёр", air: false, bottom: 13 },
  { id: "item_balloon", name: "Воздушный шар", air: true, bottom: 14 },
  { id: "item_fish", name: "Рыбка", air: true, bottom: 12 },
  { id: "item_mill", name: "Мельница", air: false, bottom: 14 },
  { id: "item_gramophone", name: "Граммофон", air: false, bottom: 14 },
];

const BY_ID = new Map(WONDERS.map((w) => [w.id, w]));
export const wonder = (id: WonderId): WonderSpec => {
  const w = BY_ID.get(id);
  if (!w) throw new Error("unknown wonder " + id);
  return w;
};

export const CANVAS_SPRITES = [
  "hero_idle",
  "hero_walk1",
  "hero_walk2",
  "hero_jump",
  ...WONDERS.map((w) => w.id),
  "tile_sky",
  "tile_ground",
  "tile_star",
  "tile_bush",
] as const;

export type HeroFrame = "hero_idle" | "hero_walk1" | "hero_walk2" | "hero_jump";

export function heroFrame(onGround: boolean, speed: number, animTime: number): HeroFrame {
  if (!onGround) return "hero_jump";
  if (Math.abs(speed) < 8) return "hero_idle";
  return Math.floor(animTime * WALK_FPS) % 2 === 0 ? "hero_walk1" : "hero_walk2";
}

export function groundTopOf(logicalH: number): number {
  return logicalH - GROUND_H;
}

export function screenFeet(groundTop: number, rise: number): number {
  return groundTop - Math.round(rise);
}

/** Все кадры героя, включая прыжок: якорь общий, подъём ног уже в рисунке. */
export function heroDrawY(feetY: number): number {
  return feetY - HERO_DRAW_DY;
}

export function bushDrawY(groundTop: number): number {
  return groundTop - HERO_DRAW_DY + BUSH_SINK;
}

/** Нижний непрозрачный пиксель предмета ложится на contactY − 1. */
export function propDrawY(contactY: number, bottomRow: number): number {
  return contactY - 1 - bottomRow;
}

export function bobOffset(time: number, phase: number, air: boolean): number {
  return Math.round(Math.sin(time * (air ? 1.6 : 2.2) + phase) * (air ? 2 : 1));
}

export function driftOffset(time: number, phase: number): number {
  return Math.round(Math.sin(time * 0.55 + phase) * 8);
}

export function starVisible(time: number, phase: number): boolean {
  return Math.floor(time * 0.7 + phase * 4) % 6 !== 0;
}

export interface WonderSpot {
  id: WonderId;
  x: number;
  lift: number;
  phase: number;
}

export interface Bush {
  x: number;
}

export interface Star {
  x: number;
  above: number;
  phase: number;
}

export interface NightWorld {
  worldW: number;
  spots: WonderSpot[];
  bushes: Bush[];
  stars: Star[];
}

export interface Body {
  x: number;
  rise: number;
  vx: number;
  vy: number;
  facing: 1 | -1;
  ground: boolean;
  coyote: number;
  buffer: number;
}

export interface Input {
  left: boolean;
  right: boolean;
  jumpHeld: boolean;
  jumpPressed: boolean;
}

const snap16 = (n: number) => Math.max(TILE, Math.round(n / TILE) * TILE);

function shuffle<T>(arr: readonly T[], rng: () => number): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const t = a[i]!;
    a[i] = a[j]!;
    a[j] = t;
  }
  return a;
}

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function makeWorld(viewW: number, rng: () => number): NightWorld {
  const view = Math.max(TILE * 8, viewW);
  let worldW = snap16(view * WORLD_SCREENS);
  const minW = snap16(view * 2.5);
  const maxW = snap16(view * 3);
  if (worldW < minW) worldW = minW;
  if (worldW > maxW) worldW = maxW;

  const ground = shuffle(WONDERS.filter((w) => !w.air).map((w) => w.id), rng);
  const air = shuffle(WONDERS.filter((w) => w.air).map((w) => w.id), rng);
  // 7 на земле, 5 в воздухе, вперемешку по всей длине луга.
  const pattern = [0, 1, 0, 0, 1, 0, 1, 0, 0, 1, 0, 1];
  let gi = 0;
  let ai = 0;
  const ids = pattern.map((p) => (p === 0 ? ground[gi++]! : air[ai++]!));

  const marginL = 78;
  const marginR = 40;
  const usable = Math.max(ids.length * 28, worldW - marginL - marginR);
  const slot = usable / ids.length;
  const spots: WonderSpot[] = ids.map((id, i) => {
    const spec = wonder(id);
    const jitter = (rng() - 0.5) * slot * 0.28;
    const x = Math.round(marginL + (i + 0.5) * slot + jitter);
    const lift = spec.air ? AIR_LIFT_MIN + Math.floor(rng() * (AIR_LIFT_MAX - AIR_LIFT_MIN + 1)) : 0;
    return { id, x: Math.min(worldW - 28, Math.max(72, x)), lift, phase: rng() * Math.PI * 2 };
  });
  spots.sort((a, b) => a.x - b.x);
  for (let i = 1; i < spots.length; i++) {
    const prev = spots[i - 1]!;
    const cur = spots[i]!;
    if (cur.x < prev.x + 30) cur.x = Math.min(worldW - 28, prev.x + 30);
  }

  const bushes: Bush[] = [];
  const bushN = Math.max(4, Math.round(worldW / 160));
  const bushClear = (x: number) =>
    spots.every((s) => Math.abs(s.x - x) >= (wonder(s.id).air ? 8 : 28)) && bushes.every((b) => Math.abs(b.x - x) >= 44);
  for (let n = 0; n < bushN * 8 && bushes.length < bushN; n++) {
    const x = Math.round(28 + rng() * (worldW - 56));
    if (bushClear(x)) bushes.push({ x });
  }
  // Края луга: кусты у кромки, если между чудесами уже тесно.
  if (!bushes.some((b) => b.x < 150)) {
    const first = Math.min(...spots.map((s) => s.x));
    const x = Math.max(56, first - 34);
    if (bushClear(x)) bushes.push({ x });
  }
  const rightEdge = worldW - 40;
  if (!bushes.some((b) => b.x > worldW - 120) && bushClear(rightEdge)) bushes.push({ x: rightEdge });

  const stars: Star[] = [];
  const starN = Math.max(10, Math.round(worldW / 40));
  for (let i = 0; i < starN; i++) {
    stars.push({
      x: Math.round(16 + rng() * (worldW - 32)),
      above: 36 + Math.floor(rng() * 78),
      phase: rng() * Math.PI * 2,
    });
  }

  return { worldW, spots, bushes, stars };
}

export function createHero(): Body {
  return { x: 28, rise: 0, vx: 0, vy: 0, facing: 1, ground: true, coyote: 0.1, buffer: 0 };
}

export function stepBody(b: Body, inp: Input, dtIn: number, worldW: number): void {
  const dt = Math.min(Math.max(dtIn, 0), 0.033);
  const dir = (inp.right ? 1 : 0) - (inp.left ? 1 : 0);
  if (dir !== 0) {
    b.vx += dir * ACCEL * dt;
    b.facing = dir < 0 ? -1 : 1;
  } else {
    const s = Math.sign(b.vx);
    const n = Math.abs(b.vx) - ACCEL * 1.45 * dt;
    b.vx = n > 0 ? s * n : 0;
  }
  if (b.vx > MAX_RUN) b.vx = MAX_RUN;
  if (b.vx < -MAX_RUN) b.vx = -MAX_RUN;
  b.x += b.vx * dt;
  if (b.x < 14) {
    b.x = 14;
    b.vx = 0;
  }
  if (b.x > worldW - 14) {
    b.x = worldW - 14;
    b.vx = 0;
  }

  if (inp.jumpPressed) b.buffer = 0.12;
  else b.buffer = Math.max(0, b.buffer - dt);
  if (b.ground) b.coyote = 0.1;
  else b.coyote = Math.max(0, b.coyote - dt);

  if (b.buffer > 0 && (b.ground || b.coyote > 0)) {
    b.vy = JUMP_V;
    b.ground = false;
    b.buffer = 0;
    b.coyote = 0;
  }
  if (!inp.jumpHeld && b.vy > SHORT_HOP_V) b.vy = SHORT_HOP_V;

  b.vy -= GRAVITY * dt;
  b.rise += b.vy * dt;
  if (b.rise <= 0) {
    b.rise = 0;
    b.vy = 0;
    b.ground = true;
  } else b.ground = false;
}

export function itemPoint(spot: WonderSpot, time: number): { x: number; above: number } {
  const spec = wonder(spot.id);
  return {
    x: spot.x + (spec.air ? driftOffset(time, spot.phase) : 0),
    above: spot.lift + bobOffset(time, spot.phase, spec.air),
  };
}

export function overlaps(b: Body, spot: WonderSpot, time: number): boolean {
  const p = itemPoint(spot, time);
  const dx = b.x - p.x;
  const dy = b.rise + HERO_CX_ABOVE_FEET - (p.above + ITEM_CX_ABOVE_LIFT);
  return dx * dx + dy * dy <= PICKUP_R * PICKUP_R;
}

export interface Fit {
  S: number;
  logicalW: number;
  logicalH: number;
}

/** Целый масштаб: логический пиксель = S аппаратных пикселей, без дроби. */
export function fitCanvas(availW: number, availH: number, dpr: number): Fit {
  const d = dpr > 0 && Number.isFinite(dpr) ? dpr : 1;
  const pick = (minW: number, minH: number): Fit | null => {
    let best: Fit | null = null;
    const maxS = Math.max(1, Math.ceil(d * 6));
    for (let S = 1; S <= maxS; S++) {
      const logicalW = Math.floor((availW * d) / S / TILE) * TILE;
      const logicalH = Math.floor((availH * d) / S / TILE) * TILE;
      if (logicalW >= minW && logicalH >= minH) best = { S, logicalW, logicalH };
    }
    return best;
  };
  return (
    pick(240, 144) ||
    pick(192, 112) || {
      S: 1,
      logicalW: Math.max(TILE, Math.floor((availW * d) / TILE) * TILE),
      logicalH: Math.max(TILE, Math.floor((availH * d) / TILE) * TILE),
    }
  );
}
