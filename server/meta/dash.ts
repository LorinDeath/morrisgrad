// Стандартный рывок героя (Space/Shift). Настройки — админка «🏃 Рывок» (kind='dash', id='main' в game_overrides).
// Сервер — источник истины: перезарядка и окно неуязвимости считаются по ВРЕМЕНИ сервера (не по кадрам клиента).
export const FRAME_MS = 1000 / 60;
export const DASH_CFG = { cd: 5, invulnMs: 83, blink: true }; // 5 с; 5 кадров ≈ 83 мс
export const DASH_LAG_MS = 250; // допуск на пинг: клиент может прислать рывок чуть раньше конца перезарядки
export const dashClient = () => ({ cd: DASH_CFG.cd, invulnMs: DASH_CFG.invulnMs, blink: DASH_CFG.blink !== false });
/** попытка рывка: ok — принят (ставит st.last и окно неуязвимости), иначе — на перезарядке */
export function dashTry(st: { last?: number }, now: number, cfg = DASH_CFG): { ok: boolean; invulnUntil: number; left: number } {
  const cdMs = Math.max(0, cfg.cd) * 1000, left = (st.last || 0) + cdMs - now;
  if (st.last && left > DASH_LAG_MS) return { ok: false, invulnUntil: 0, left };
  st.last = now; return { ok: true, invulnUntil: now + Math.max(0, Math.min(1000, cfg.invulnMs)), left: 0 };
}
