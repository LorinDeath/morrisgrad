// Звук без кнопки «Начать игру»: браузер даёт WebAudio только после жеста игрока. Раньше этим жестом было нажатие «Начать игру»,
// теперь — первый клик/касание/клавиша где угодно на странице: создаём (или будим) общий AudioContext window.__mcAC,
// его берут звуки интерфейса (ui/atmoUi.js ctx()). Один раз за загрузку страницы.
let armed = false;
export function unlockAudioOnGesture() {
  if (armed) return; armed = true;
  const evs = ['pointerdown', 'touchend', 'keydown', 'click'];
  const off = () => { for (const t of evs) window.removeEventListener(t, on, true); };
  function on() {
    const A = window.AudioContext || window.webkitAudioContext; if (!A) return off();
    try {
      const c = window.__mcAC || (window.__mcAC = new A());
      if (c.state === 'suspended') c.resume().then(() => { if (c.state === 'running') off(); }, () => {});
      else off();
    } catch (_) { off(); }
  }
  for (const t of evs) window.addEventListener(t, on, { capture: true, passive: true });
}
