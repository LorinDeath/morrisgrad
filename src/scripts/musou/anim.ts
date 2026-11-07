// Кадры листов Проклятых.
// Герой, heroes_atlas: на направление 6 кадров — шаг, стойка, шаг, вдох, замах, удар.
// Бестиарий, клетка 64, 12 кадров: шаг 0–3, удар 4–6, попадание 7, смерть 8–11.

export const HERO_FRAME = { stepA: 0, stance: 1, stepB: 2, breath: 3, windup: 4, strike: 5 } as const;
export const BEAST_WALK = [0, 1, 2, 3] as const;
export const BEAST_ATTACK = [4, 5, 6] as const;
export const BEAST_HURT = 7;
export const BEAST_DEATH = [8, 9, 10, 11] as const;
export const DEATH_SEC = 0.64;

/**
 * Локальный столбец героя 0..5. На листе героя нет ряда смерти: четыре направления и шесть кадров.
 * Падение — отдельная очередь, не кадр ранения и не кадр удара. t — секунды с момента падения.
 * Сначала вдох, потом стойка. Дальше рисунок оседает, кренится и гаснет.
 */
export function heroLocalFrame(anim: string, swing: number, hurt: number, t: number) {
  if (anim === "down") {
    if (t < 0.22) return HERO_FRAME.breath;
    return HERO_FRAME.stance;
  }
  if (hurt > 0.08 && anim !== "swing") return HERO_FRAME.windup;
  if (anim === "swing") {
    if (swing < 0.45) return HERO_FRAME.windup;
    if (swing < 0.9) return HERO_FRAME.strike;
    return HERO_FRAME.stance;
  }
  if (anim === "run") return ((t * 8) | 0) % 2 === 0 ? HERO_FRAME.stepA : HERO_FRAME.stepB;
  return ((t * 2.4) | 0) % 2 === 0 ? HERO_FRAME.stance : HERO_FRAME.breath;
}

/** Столбец бестиария 0..11. */
export function beastFrame(alive: boolean, die: number, hurt: number, attack: number, t: number) {
  if (!alive) {
    const k = 1 - Math.max(0, Math.min(1, die / DEATH_SEC));
    return BEAST_DEATH[Math.min(3, (k * 4) | 0)];
  }
  if (hurt > 0) return BEAST_HURT;
  if (attack > 0) return BEAST_ATTACK[Math.min(2, ((1 - Math.min(1, attack / 0.32)) * 3) | 0)];
  return BEAST_WALK[((t * 8) | 0) % 4];
}
