// Таланты «Клятва Вайт» / «Второй шанс» / «Пепел возрождается» / «Последняя страница» (per.revive):
// раз за бой встать с 40% ХП вместо гибели. Мир — заново после выхода из боя; дуэль — раз за дуэль; забег — раз за забег (клиент).
export const REVIVE_HP = 0.4;
export interface Revivable { revive?: number; reviveUsed?: boolean; zp: { hp: number; maxHp: number } }
/** true — герой встал (ХП = 40%), смерть отменяется */
export function tryRevive(ms: Revivable): boolean {
  if (!ms.revive || ms.reviveUsed) return false;
  ms.reviveUsed = true; ms.zp.hp = Math.max(1, Math.round(ms.zp.maxHp * REVIVE_HP));
  return true;
}
