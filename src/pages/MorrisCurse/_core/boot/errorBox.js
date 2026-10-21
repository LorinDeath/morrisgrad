// Окно ошибки с кодом (реестр src/errors/codes.js). Игроку: код крупно, одна строка, «Скопировать код» (код + контекст + версия + время),
// «Повторить» — если код повторяемый. Ни стека, ни внутренностей: детали — только в консоль ([mc-err]) и на сервер (журнал «📊 Нагрузка»).
import './boot.css';
import { CODES, codeInfo, ctxId, CODE_RE } from '../../../../errors/codes.js';
import { mclRoot } from './loaderUI.js';
const Q = []; let SINK = null; const SENT = new Map(); // code → время последней отправки (не чаще раза в 30 с на код)
export const clientVersion = () => (typeof window !== 'undefined' && window.__MC_VER__) || 'dev';
/** отправка на сервер (net.js): code + ctx + версия; до подключения — в очередь (и в localStorage, чтобы дойти со следующего входа) */
export function setErrSink(fn) { SINK = fn; if (!fn) return; let old = []; try { old = JSON.parse(localStorage.getItem('mc_err_q') || '[]'); localStorage.removeItem('mc_err_q'); } catch (_) {} for (const r of [...old, ...Q.splice(0)].slice(-10)) fn(r); }
function report(r) {
  const t = SENT.get(r.code) || 0, now = Date.now(); if (now - t < 30000) return; SENT.set(r.code, now);
  if (SINK) { try { SINK(r); } catch (_) {} return; }
  Q.push(r); try { localStorage.setItem('mc_err_q', JSON.stringify(Q.slice(-10))); } catch (_) {}
}
let CUR = null; export const ERR_LOG = []; // для плейтестов: какие коды показаны
/**
 * Показать ошибку. code — из реестра; opt: { detail (только в консоль/сервер), step (видно игроку — какой шаг ждём), onRetry, soft (без затемнения, плашкой сверху), host }
 * Повторный показ того же кода, пока окно открыто, не плодит окна. Возвращает { ctx, close }.
 */
export function showError(code, opt = {}) {
  if (!CODE_RE.test(code) || !CODES[code]) code = 'MC-X00';
  const info = codeInfo(code), ctx = opt.ctx || ctxId(), at = new Date();
  console.warn('[mc-err]', code, ctx, opt.detail || '');
  report({ code, ctx, ver: clientVersion(), step: opt.step ? String(opt.step).slice(0, 40) : undefined });
  ERR_LOG.push({ code, ctx, step: opt.step || null, at: at.getTime() });
  if (CUR && CUR.code === code) { CUR.setStep(opt.step); return CUR; }
  CUR?.close();
  const root = mclRoot(opt.host), el = document.createElement('div');
  el.className = `mcl-err mcl-z sev-${info.sev}${opt.soft ? ' soft' : ''}`; el.setAttribute('role', 'alertdialog'); el.dataset.code = code;
  const time = at.toLocaleString('ru-RU', { hour12: false });
  const retry = info.retry && opt.onRetry !== false;
  el.innerHTML = `<div class="mcl-box">${opt.soft || info.sev === 'info' ? '<button class="mcl-x" aria-label="Закрыть">✕</button>' : ''}
    <div class="mcl-code">${code}</div><p class="mcl-msg"></p><p class="mcl-step"></p><p class="mcl-meta">контекст ${ctx} · версия ${clientVersion()} · ${time}</p>
    <div class="mcl-btns">${retry ? '<button class="mcl-btn pri" data-a="retry">Повторить</button>' : ''}<button class="mcl-btn" data-a="copy">Скопировать код</button></div></div>`;
  el.querySelector('.mcl-msg').textContent = info.msg;
  const stepEl = el.querySelector('.mcl-step'), setStep = (s) => { stepEl.textContent = s ? `Ждали: ${s}` : ''; stepEl.style.display = s ? '' : 'none'; }; setStep(opt.step);
  const text = `${code} · ${ctx} · v${clientVersion()} · ${at.toISOString()}${opt.step ? ' · ' + opt.step : ''}`;
  el.addEventListener('click', async (e) => {
    const a = e.target.closest('[data-a]')?.dataset.a;
    if (e.target.closest('.mcl-x')) close();
    if (a === 'copy') { const b = e.target; try { await navigator.clipboard.writeText(text); b.textContent = 'Скопировано ✓'; } catch (_) { prompt('Код ошибки:', text); } setTimeout(() => { b.textContent = 'Скопировать код'; }, 1600); }
    if (a === 'retry') { close(); if (typeof opt.onRetry === 'function') opt.onRetry(); else location.reload(); }
  });
  root.appendChild(el);
  const close = () => { el.remove(); if (CUR === h) CUR = null; };
  const h = { code, ctx, text, close, setStep, el };
  CUR = h; if (opt.autoClose) setTimeout(close, opt.autoClose);
  return h;
}
export const currentError = () => CUR;
/** перехват непредвиденных ошибок → MC-X00 (одна на 30 с; игра не останавливается, окно — плашкой) */
let hooked = false;
export function hookGlobalErrors() {
  if (hooked || typeof window === 'undefined') return; hooked = true;
  const on = (msg, src) => { const s = String(msg || ''); if (/ResizeObserver loop|Script error\.?$/.test(s)) return; showError('MC-X00', { detail: `${s} @ ${src || ''}`.slice(0, 300), soft: true }); };
  window.addEventListener('error', (e) => on(e.message, `${e.filename || ''}:${e.lineno || ''}`));
  window.addEventListener('unhandledrejection', (e) => on(e.reason?.message || e.reason, 'promise'));
}
