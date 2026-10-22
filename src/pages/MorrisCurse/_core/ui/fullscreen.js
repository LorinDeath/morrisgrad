// Полный экран страницы игры (src/pages/MorrisCurse/index.astro).
// - Окно игры и так занимает всё окно браузера (100vw × 100dvh, без шапки/подвала сайта) — полный экран лишь убирает рамку браузера,
//   поэтому вход/выход (в т. ч. по Esc) не сдвигает раскладку: канвас и HUD подстраиваются каждый кадр (stage.resize/overlay.syncRect).
// - Автовход: по первому жесту (клик / касание / клавиша, кроме Esc) — один раз за загрузку страницы; браузер без Fullscreen API
//   (iPhone Safari) — остаёмся во всё окно (+ meta apple-mobile-web-app-capable для ярлыка «На экран „Домой“»).
// - Выбор игрока (Настройки → «⛶ Полный экран: авто») — localStorage 'mc_fs_auto'; админ-флаг UI.fsAuto (meta_state.ui) — window.__MC_FS_AUTO__.
const KEY = 'mc_fs_auto';
// В полный экран уходит ВЕСЬ документ (<html>), а не #game-window: окно игры и так на всё окно (.mc-full), а слои, которые
// вешаются на <body> (сцена открытия сундука, летящие вещи, «пуф», сравнение вещей, сообщение об ошибке загрузки), вне
// полноэкранного элемента браузер не рисует — в полном экране открытие сундука было без анимации.
const host = () => document.documentElement;
/** куда вешать полноэкранные слои: полноэкранный элемент (если вдруг это не <html>) или <body> */
export const fsLayer = () => { const f = document.fullscreenElement || document.webkitFullscreenElement; return f && f !== document.documentElement ? f : document.body; };
export const fsSupported = () => { const el = host(); return !!(el.requestFullscreen || el.webkitRequestFullscreen) && document.fullscreenEnabled !== false; };
export const fsActive = () => !!(document.fullscreenElement || document.webkitFullscreenElement);
export function fsAutoPref() { try { return localStorage.getItem(KEY) !== '0'; } catch (_) { return true; } }
export function setFsAutoPref(on) { try { localStorage.setItem(KEY, on ? '1' : '0'); } catch (_) {} }
export function fsAdminOn() { if (typeof window.__MC_FS_AUTO__ === 'boolean') return window.__MC_FS_AUTO__; try { return localStorage.getItem('mc_fs_adm') !== '0'; } catch (_) { return true; } }
export const fsAutoAllowed = () => fsAdminOn() && fsAutoPref();
export function fsEnter() {
  const el = host(); if (fsActive() || !fsSupported()) return Promise.resolve(false);
  try {
    const p = el.requestFullscreen ? el.requestFullscreen({ navigationUI: 'hide' }) : el.webkitRequestFullscreen();
    return Promise.resolve(p).then(() => true, () => false);
  } catch (_) { return Promise.resolve(false); }
}
export function fsExit() {
  if (!fsActive()) return Promise.resolve();
  try { return Promise.resolve(document.exitFullscreen ? document.exitFullscreen() : document.webkitExitFullscreen()).catch(() => {}); } catch (_) { return Promise.resolve(); }
}
export const fsToggle = () => (fsActive() ? fsExit() : fsEnter());
// автовход по первому жесту: один удачный запрос за загрузку страницы (неудачный — пробуем на следующем жесте, не больше 3 раз)
let armed = false;
export function armAutoFullscreen() {
  if (armed) return; armed = true;
  let tries = 0, done = false;
  const evs = ['pointerup', 'touchend', 'keydown', 'click'];
  const off = () => { done = true; for (const t of evs) window.removeEventListener(t, on, true); };
  function on(e) {
    if (done) return;
    if (e.type === 'keydown' && (e.key === 'Escape' || e.repeat)) return; // Esc — это меню игры, не вход в полный экран
    if (e.target?.closest?.('[data-fs-btn]')) { off(); return; } // нажали саму кнопку ⛶ у карты — дальше решает игрок, автовход не дублирует запрос
    if (fsActive() || !fsSupported() || !fsAutoAllowed()) { if (fsActive() || !fsSupported()) off(); return; }
    tries++;
    fsEnter().then((ok) => { if (ok || tries >= 3) off(); });
  }
  for (const t of evs) window.addEventListener(t, on, true);
}
