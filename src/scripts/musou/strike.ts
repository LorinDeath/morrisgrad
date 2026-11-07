// Общий расчёт удара по генералу и боссу. Комната и клиент считают один и тот же откат и множитель.
import { heroById, skillGlow, type Sheet, type SkillDef } from "./rules";
import { HARD_CAP, rateChance } from "./caps";

export const LIGHT = [
  { r: 100, ang: 0.85, mul: 0.85, startup: 0.07, active: 0.05, recovery: 0.13 },
  { r: 124, ang: 1.2, mul: 1.05, startup: 0.06, active: 0.05, recovery: 0.12 },
  { r: 148, ang: 1.55, mul: 1.3, startup: 0.08, active: 0.06, recovery: 0.14 },
  { r: 196, ang: 2.45, mul: 1.95, startup: 0.11, active: 0.07, recovery: 0.2 },
];
export const HEAVY = { r: 176, ang: 1.2, mul: 2.2, startup: 0.14, active: 0.07, recovery: 0.24 };

export type ActKind = "light" | "heavy" | "skill" | "musou";

export type Hand = {
  cd: [number, number, number, number];
  musou: number;
  step: number;
  stepLeft: number;
  lock: number;
  haste: number;
  down: 0 | 1;
  final: 0 | 1;
  echo: number;
  echoIdx: number;
  musouLock: number;
  at: number;
  rng: number;
};

export function freshHand(now = 0, salt = 1): Hand {
  return {
    cd: [0, 0, 0, 0], musou: 0, step: 0, stepLeft: 0, lock: 0, haste: 0,
    down: 0, final: 0, echo: 0, echoIdx: -1, musouLock: 0, at: now, rng: salt >>> 0,
  };
}

export function tickHand(h: Hand, dt: number) {
  const rate = h.haste > 0 ? 1.25 : 1;
  for (let i = 0; i < 4; i++) if (h.cd[i] > 0) h.cd[i] = Math.max(0, h.cd[i] - dt * rate);
  if (h.stepLeft > 0) {
    h.stepLeft = Math.max(0, h.stepLeft - dt);
    if (h.stepLeft <= 0) h.step = 0;
  }
  if (h.lock > 0) h.lock = Math.max(0, h.lock - dt);
  if (h.haste > 0) h.haste = Math.max(0, h.haste - dt);
}

export function ageHand(h: Hand, now: number) {
  const dt = Math.max(0, Math.min(3, (now - (h.at || now)) / 1000));
  h.at = now;
  tickHand(h, dt);
}

export function paceOf(sheet: Sheet) {
  return Math.max(0.55, sheet.aspd || 1);
}

export function skillSeconds(hero: string, idx: number, sheet: Sheet) {
  const sk = heroById(hero).skills[idx];
  if (!sk) return 0;
  if (sk.musou) return 1.2;
  return sk.cd * (sheet.cdMul || 1);
}

export type Swing = {
  ok: true;
  kind: ActKind;
  skill: number;
  mul: number;
  skillHit: boolean;
  finisher: boolean;
  name: string;
  glow: string | null;
  r: number;
  ang: number;
  shape: SkillDef["shape"];
  dash: number;
  heal: number;
  stun: number;
  echo: boolean;
} | { ok: false; why: string };

export function trySwing(h: Hand, hero: string, sheet: Sheet, ask: { kind: string; skill?: number; echo?: number }, now: number): Swing {
  ageHand(h, now);
  if (h.down || h.final) return { ok: false, why: "герой на земле" };
  const raw = ask.kind === "heavy" ? "heavy" : ask.kind === "musou" ? "musou" : ask.kind === "skill" ? "skill" : "light";
  if (ask.echo) {
    const idx = ask.skill ?? -1;
    if (!(h.echo > now) || h.echoIdx !== idx) return { ok: false, why: "эха нет" };
    h.echo = 0;
    const built = reachOf(hero, idx, sheet);
    if (!built) return { ok: false, why: "нет навыка" };
    return {
      ok: true, kind: "skill", skill: idx, mul: built.sk.dmg * 0.4, skillHit: true, finisher: false, name: "эхо",
      glow: built.glow, r: built.r, ang: built.sk.ang || 0.5, shape: built.sk.shape, dash: built.sk.dash || 0,
      heal: 0, stun: built.sk.stun || 0, echo: true,
    };
  }
  if (raw === "skill" || raw === "musou") {
    const idx = raw === "musou" ? 3 : (ask.skill ?? -1);
    const built = reachOf(hero, idx, sheet);
    if (!built) return { ok: false, why: "нет навыка" };
    const sk = built.sk;
    if (raw === "musou" && !sk.musou) return { ok: false, why: "это не пыл" };
    if (raw === "skill" && sk.musou) return { ok: false, why: "пыл тратится отдельно" };
    if (h.cd[idx] > 0.02) return { ok: false, why: "навык ещё восстанавливается" };
    if (sk.musou && h.musou < 100) return { ok: false, why: "пыл не полон" };
    h.cd[idx] = sk.musou ? 1.2 : sk.cd * (sheet.cdMul || 1);
    if (sk.musou) {
      h.musou = 0;
      h.musouLock = now + 500;
    }
    if (built.glow === "swift") h.haste = Math.max(h.haste, 2);
    if (built.glow === "echo") {
      h.echo = now + 900;
      h.echoIdx = idx;
    }
    return {
      ok: true, kind: sk.musou ? "musou" : "skill", skill: idx, mul: sk.dmg, skillHit: true, finisher: !!sk.musou, name: sk.name,
      glow: built.glow, r: built.r, ang: sk.ang || 0.5, shape: sk.shape, dash: sk.dash || 0, heal: sk.heal || 0, stun: sk.stun || 0, echo: false,
    };
  }
  if (h.lock > 0.04) return { ok: false, why: "удар ещё идёт" };
  if (raw === "heavy") {
    const pace = paceOf(sheet);
    h.lock = (HEAVY.startup + HEAVY.active + HEAVY.recovery) / pace * 0.72;
    h.step = 0;
    h.stepLeft = 0;
    return {
      ok: true, kind: "heavy", skill: -1, mul: HEAVY.mul, skillHit: false, finisher: true, name: "тяжёлый", glow: null,
      r: HEAVY.r, ang: HEAVY.ang, shape: "arc", dash: 0, heal: 0, stun: 0, echo: false,
    };
  }
  if (h.stepLeft <= 0) h.step = 0;
  const step = h.step;
  const spec = LIGHT[step] || LIGHT[0];
  const pace = paceOf(sheet);
  h.lock = (spec.startup + spec.active + spec.recovery) / pace * 0.72;
  h.step = (step + 1) % 4;
  h.stepLeft = 0.72;
  return {
    ok: true, kind: "light", skill: -1, mul: spec.mul, skillHit: false, finisher: step === 3, name: "удар", glow: null,
    r: spec.r, ang: spec.ang, shape: "arc", dash: 0, heal: 0, stun: 0, echo: false,
  };
}

export function noteMusou(h: Hand, want: number, now: number) {
  if (!Number.isFinite(want)) return;
  const next = Math.max(0, Math.min(100, want));
  if (now < h.musouLock) {
    if (next < h.musou) h.musou = next;
    return;
  }
  if (next + 0.5 < h.musou) h.musou = next;
  else h.musou = Math.min(next, h.musou + 30);
}

export function blowAmount(sheet: Sheet, mul: number, skillHit: boolean, finisher: boolean, crit: boolean, armorK: number) {
  let dmg = sheet.dmg * mul * (skillHit ? sheet.skill : 1) * (crit ? 1.75 : 1) * armorK;
  if (finisher) dmg *= 1.08;
  return Math.max(1, dmg);
}

export function eliteArmorK(kind: "boss" | "general", soak: number) {
  return (100 / (100 + (kind === "boss" ? 18 : 8))) * (1 - Math.min(0.45, soak));
}

export function biteHeal(sheet: Sheet, dmg: number, vamp: boolean) {
  let heal = dmg * (sheet.ls || 0);
  if (vamp) {
    const room = Math.max(0, HARD_CAP.ls - (sheet.ls || 0));
    heal += dmg * Math.min(0.08, room);
  }
  return heal;
}

export function nextUnit(h: Hand) {
  h.rng = (h.rng + 0x6D2B79F5) >>> 0;
  let a = h.rng;
  a = (a + 0x6D2B79F5) | 0;
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export function rollCrit(h: Hand, critRaw: number, musou: number) {
  return nextUnit(h) < rateChance(critRaw + (musou >= 100 ? 36 : 0), "crit");
}

export function bossPhase(hp: number, max: number) {
  const ratio = max > 0 ? hp / max : 1;
  return ratio <= 0.33 ? 3 : ratio <= 0.66 ? 2 : 1;
}

export function castTiming(kind: "boss" | "general", move: string, sig: string, phase: number) {
  const wind = move === "pull" ? 0.9 : kind === "boss" ? (phase >= 3 ? 0.86 : phase === 2 ? 0.7 : 0.55) : sig === "line" ? 0.62 : 0.5;
  const cd = kind === "boss" ? (phase >= 3 ? 1.15 : 1.55) : sig === "cone" ? 1.45 : 1.85;
  return { wind, cd };
}

export function hitsPoint(ax: number, ay: number, aim: number, tx: number, ty: number, shape: SkillDef["shape"], r: number, ang: number, dash = 0) {
  const slack = 48;
  if (shape === "circle") return (tx - ax) ** 2 + (ty - ay) ** 2 <= (r + slack) ** 2;
  if (shape === "line") return onSeg(ax, ay, ax + Math.cos(aim) * r, ay + Math.sin(aim) * r, tx, ty, 36 + ang * 40 + slack);
  if (shape === "dash") return onSeg(ax - Math.cos(aim) * (dash || 160), ay - Math.sin(aim) * (dash || 160), ax, ay, tx, ty, r + slack);
  const dx = tx - ax, dy = ty - ay;
  if (dx * dx + dy * dy > (r + slack) ** 2) return false;
  return Math.abs(angDiff(Math.atan2(dy, dx), aim)) <= ang + 0.18;
}

function reachOf(hero: string, idx: number, sheet: Sheet) {
  const sk = heroById(hero).skills[idx];
  if (!sk) return null;
  const glow = skillGlow(hero, idx, sheet.radiance | 0);
  const reach = (sheet.radiusMul || 1) * (glow === "extend" ? 1.4 : 1);
  return { sk, glow, r: sk.r * reach };
}

function angDiff(a: number, b: number) {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

function onSeg(x1: number, y1: number, x2: number, y2: number, px: number, py: number, width: number) {
  const dx = x2 - x1, dy = y2 - y1;
  const l2 = dx * dx + dy * dy || 1;
  let t = ((px - x1) * dx + (py - y1) * dy) / l2;
  t = Math.max(0, Math.min(1, t));
  const x = x1 + dx * t, y = y1 + dy * t;
  return (px - x) ** 2 + (py - y) ** 2 <= width * width;
}
