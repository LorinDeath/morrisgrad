// Загрузка ресурсов глазами игрока (стиль «Проклятых», рус.): полный экран первого визита со стадиями и честным прогрессом
// по байтам (МБ, скорость, осталось), плашка обновления, вспышка «Ресурсы актуальны», маленький индикатор в углу во время игры
// (ленивые группы, текстуры зоны) и подпись на переходе между зонами. Ошибки — errorBox.js. Ничего не «висит» молча:
// у каждой стадии есть сторож — если долго нет прогресса, показываем, какой шаг ждём, и даём «Повторить».
import './boot.css';
import { fmtMB } from './manifestDiff.js';
const isMob = () => { try { return /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent || '') || /[?&]mobile=1/.test(location.search); } catch (_) { return false; } };
/** масштаб «🔍 Размер интерфейса» (ui-cursed-rework, ui/uiScale.js): выбор игрока из localStorage; без выбора — 100% (телефон — авто по ширине) */
export function uiZoom() {
  const mob = isMob(); let v = null;
  try { const s = localStorage.getItem(mob ? 'mc_ui_scale_mob' : 'mc_ui_scale_pc'); if (s != null && Number.isFinite(Number(s))) v = Number(s); } catch (_) {}
  if (v == null) v = mob ? Math.round(Math.max(0.85, Math.min(1.1, Math.min(screen?.width || innerWidth, screen?.height || innerHeight) / 400)) * 100) : 100;
  return Math.max(0.5, Math.min(2, v / 100));
}
const ROOTS = new WeakMap(); // корень слоя на каждом хосте (поле игры, окно админки)
export function mclRoot(host) {
  const h = host || document.getElementById('game-window') || document.getElementById('game-canvas')?.parentElement || document.body;
  let r = ROOTS.get(h);
  if (!r || !r.isConnected) { r = document.createElement('div'); r.className = 'mcl' + (isMob() ? ' mcl-mobile' : ''); h.appendChild(r); ROOTS.set(h, r); if (h !== document.body && getComputedStyle(h).position === 'static') h.style.position = 'relative'; }
  r.style.setProperty('--mcl-zoom', String(uiZoom()));
  return r;
}
const fmtSpeed = (bps) => (bps >= 1048576 ? `${(bps / 1048576).toFixed(1)} МБ/с` : `${Math.max(1, Math.round(bps / 1024))} КБ/с`);
const fmtEta = (s) => (!Number.isFinite(s) || s <= 0 ? '' : s < 60 ? `≈ ${Math.ceil(s)} с` : `≈ ${Math.floor(s / 60)} мин ${Math.round(s % 60)} с`);
/** скорость — скользящее окно 2 с (без скачков от первого маленького файла) */
export function speedMeter() {
  const pts = []; return { add(bytes) { const t = performance.now(); pts.push([t, bytes]); while (pts.length > 2 && t - pts[0][0] > 2000) pts.shift(); },
    bps() { if (pts.length < 2) return 0; const [t0, b0] = pts[0], [t1, b1] = pts[pts.length - 1]; return t1 > t0 ? ((b1 - b0) * 1000) / (t1 - t0) : 0; } };
}
export const STAGES = [['check', 'Проверяем ресурсы…'], ['gfx', 'Загружаем графику…'], ['snd', 'Звуки…'], ['world', 'Готовим мир…']];
/** полный экран первого визита. kind: 'first' | 'update' (большое обновление тоже полным экраном) */
export function fullLoader({ kind = 'first', files = 0, bytes = 0 } = {}) {
  const el = document.createElement('div'); el.className = 'mcl-screen mcl-z'; el.dataset.mcl = 'full';
  el.innerHTML = `<div class="mcl-box"><h2 class="mcl-title">ПРОКЛЯТЫЕ</h2><p class="mcl-sub">${kind === 'first' ? 'первый запуск' : 'обновление игры'}</p>
    <ul class="mcl-stages">${STAGES.map(([k, t]) => `<li data-s="${k}">${t}</li>`).join('')}</ul>
    <div class="mcl-bar ind"><i></i></div><div class="mcl-nums"><span class="a">—</span><span class="b"></span><span class="c"></span></div>
    <p class="mcl-step" style="display:none"></p>
    <p class="mcl-note">${kind === 'first' ? `Игра скачивает ресурсы один раз (${files ? `${files} файлов, ` : ''}${bytes ? fmtMB(bytes) + ' МБ' : 'несколько МБ'}) и хранит их на устройстве. Следующие входы — быстрые: проверяется только список изменений.` : 'Скачиваются только изменённые файлы — остальное уже есть на устройстве.'}</p></div>`;
  mclRoot().appendChild(el);
  return ctrl(el);
}
/** короткая плашка обновления «Загружаем обновление: N файлов, X МБ» */
export function updateToast({ files, bytes }) {
  const el = document.createElement('div'); el.className = 'mcl-toast mcl-z'; el.dataset.mcl = 'update';
  el.innerHTML = `<div>Загружаем обновление: ${files} ${plural(files, 'файл', 'файла', 'файлов')}, ${fmtMB(bytes)} МБ</div><div class="mcl-bar"><i></i></div><div class="mcl-nums"><span class="a"></span><span class="b"></span><span class="c"></span></div><p class="mcl-step" style="display:none"></p>`;
  mclRoot().appendChild(el);
  return ctrl(el);
}
export function flashOk(text = 'Ресурсы актуальны') { const el = document.createElement('div'); el.className = 'mcl-flash mcl-z'; el.dataset.mcl = 'ok'; el.textContent = text; mclRoot().appendChild(el); setTimeout(() => el.remove(), 1500); return el; }
export const plural = (n, a, b, c) => { const m = n % 10, h = n % 100; return m === 1 && h !== 11 ? a : m >= 2 && m <= 4 && (h < 10 || h >= 20) ? b : c; };
function ctrl(el) {
  const bar = el.querySelector('.mcl-bar'), fill = bar?.firstElementChild, A = el.querySelector('.a'), B = el.querySelector('.b'), C = el.querySelector('.c'), step = el.querySelector('.mcl-step');
  const sp = speedMeter(); let stalled = null, last = performance.now();
  const c = {
    el,
    stage(k) { let seen = false; for (const li of el.querySelectorAll('.mcl-stages li')) { const me = li.dataset.s === k; li.classList.toggle('on', me); li.classList.toggle('done', !me && !seen); if (me) seen = true; } last = performance.now(); },
    progress(done, total) {
      if (!bar) return; bar.classList.toggle('ind', !total); sp.add(done); last = performance.now(); c.wait(null);
      if (total) fill.style.width = `${Math.min(100, (done / total) * 100).toFixed(1)}%`;
      A.textContent = total ? `${fmtMB(done)} / ${fmtMB(total)} МБ` : '';
      const bps = sp.bps(); B.textContent = bps ? fmtSpeed(bps) : ''; C.textContent = bps && total ? `осталось ${fmtEta((total - done) / bps)}` : '';
    },
    /** какой шаг ждём (видно игроку, если шаг затянулся) */
    wait(text) { if (!step) return; step.textContent = text ? `Ждём: ${text}` : ''; step.style.display = text ? '' : 'none'; },
    /** сторож: нет прогресса ms → onStall(шаг) (показать шаг и «Повторить»), опрос раз в секунду */
    watch(ms, what, onStall) { clearInterval(stalled); stalled = setInterval(() => { if (performance.now() - last > ms) { c.wait(what()); onStall?.(what()); last = performance.now(); } }, 1000); },
    close() { clearInterval(stalled); el.remove(); },
  };
  return c;
}
/** индикатор в углу во время игры: несколько параллельных задач (ленивые группы, текстуры зоны) — одна точка с подсказкой */
const JOBS = new Map(); let CORNER = null;
export function cornerJob(id, label) {
  JOBS.set(id, { label, done: 0, total: 0 }); renderCorner();
  return { progress(d, t) { const j = JOBS.get(id); if (j) { j.done = d; j.total = t; renderCorner(); } }, end() { JOBS.delete(id); renderCorner(); } };
}
function renderCorner() {
  if (!JOBS.size) { CORNER?.remove(); CORNER = null; return; }
  if (!CORNER || !CORNER.isConnected) { CORNER = document.createElement('div'); CORNER.className = 'mcl-corner mcl-z'; CORNER.dataset.mcl = 'corner'; CORNER.innerHTML = '<span class="t"></span><div class="tip"></div>';
    CORNER.addEventListener('click', () => CORNER.classList.toggle('tipon')); mclRoot().appendChild(CORNER); }
  const js = [...JOBS.values()], d = js.reduce((a, j) => a + j.done, 0), t = js.reduce((a, j) => a + j.total, 0);
  CORNER.querySelector('.t').textContent = t ? `загрузка ${Math.round((d / t) * 100)}%` : 'загрузка…';
  CORNER.querySelector('.tip').textContent = 'Догружаем в фоне: ' + js.map((j) => j.label + (j.total ? ` (${fmtMB(j.done)}/${fmtMB(j.total)} МБ)` : '')).join('; ') + '. Играть можно — это не мешает.';
}
/** подпись на переходе между зонами («Готовим мир: Аринар…»), пока прогреваются текстуры следующей зоны */
let VEIL = null;
export function veil(text) { if (!text) { VEIL?.remove(); VEIL = null; return; } if (!VEIL || !VEIL.isConnected) { VEIL = document.createElement('div'); VEIL.className = 'mcl-veil mcl-z'; VEIL.dataset.mcl = 'veil'; mclRoot().appendChild(VEIL); } VEIL.textContent = text; }
