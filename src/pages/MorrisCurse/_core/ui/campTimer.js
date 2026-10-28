// Таймеры возрождения логов/лагерей и маркеры заданий на мёртвые цели (решение Алекса).
// Игрок может скрыть их в «⚙️ Настройки» (на этом устройстве, по умолчанию — показывать); админка «📋 Доска» → QoL: вкл/выкл, приближение мини-карты, радиус в мире.
export function campTimersOn() { try { return localStorage.getItem('mc-camptimer') !== '0'; } catch (_) { return true; } }
export function setCampTimers(on) { try { localStorage.setItem('mc-camptimer', on ? '1' : '0'); } catch (_) {} }
/** настройки админки (board cfg → qol); cfg — то, что прислал сервер */
export function campCfg(qol) { const q = qol || {}; return { on: q.campTimer !== false, zoom: Number(q.campZoom) || 1.4, near: Number(q.campNear) || 900 }; }
/** «m:ss» до возрождения (сек) */
export function respawnTxt(sec) { const s = Math.max(0, Math.ceil(Number(sec) || 0)); const m = Math.floor(s / 60); return m >= 60 ? `${Math.floor(m / 60)} ч ${m % 60} мин` : `${m}:${String(s % 60).padStart(2, '0')}`; }
/** сколько секунд до возрождения лагеря c (c[9] — момент, проставленный при получении zone_state; c[8] — сек от сервера) */
export function campLeft(c) { return c && c[9] ? Math.max(0, (c[9] - Date.now()) / 1000) : 0; }
/** лагерь, где все цели мертвы: ближайший с целью isT — маркер ведёт к нему с таймером возрождения (а не «на мёртвый спавн») */
export function deadCampTarget(camps, isT, ctx, name, extra = {}) {
  let best = null, bd = Infinity;
  for (const c of camps || []) if (!(c[3] > 0) && c[7]?.some(isT)) { const d = Math.hypot(c[1] - ctx.x, c[2] - ctx.y); if (d < bd) { bd = d; best = c; } }
  if (!best) return null;
  const left = campLeft(best), t = left > 0 ? `⏳ возродится через ${respawnTxt(left)}` : '⏳ скоро возродится';
  return { world: ctx.world, x: best[1], y: best[2], label: `${name} · ${campTimersOn() ? t : 'все убиты'}`, sp: campTimersOn() ? t : '', dead: 1, ...extra };
}
