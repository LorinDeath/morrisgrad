// Настройка игрока «Мобы: Новые / Старые» — отдельно от «Текстур», на этом устройстве (localStorage mc_mobs), переключается сразу.
// По умолчанию — из админки «🖼 Графика» (mobs32Pc / mobs32Mobile: ПК новые, телефон старые); телефон может включить новые сам.
// Общий выключатель админки mobs32 сильнее настройки: выкл — у всех старые. Забеги — ещё и mobs32Run.
// ?mobs=new|old — принудительно (плейтесты).
import { GFX, onGfx } from './gfxCfg.js';
// своя проверка телефона (не texDefault: на ui-cursed-rework умолчание «Текстур» берётся из админки и может не совпадать с платформой)
export const IS_MOBILE = (() => { try { const ua = navigator.userAgent || ''; return /Mobi|Android|iPhone|iPad/i.test(ua) || (navigator.maxTouchPoints > 1 && matchMedia('(pointer: coarse)').matches) || /[?&]mobile=1/.test(location.search); } catch (_) { return false; } })();
export const MOB_KEY = 'mc_mobs';
const subs = new Set();
const q = () => { try { const m = location.search.match(/[?&]mobs=(new|old)/); return m ? m[1] : null; } catch (_) { return null; } };
/** выбор игрока: 'new' | 'old' | null (не выбирал — берётся умолчание платформы) */
export function mobPrefRaw() { try { const v = localStorage.getItem(MOB_KEY); return v === 'new' || v === 'old' ? v : null; } catch (_) { return null; } }
export const mobDefault = () => ((IS_MOBILE ? GFX.mobs32Mobile : GFX.mobs32Pc) ? 'new' : 'old');
/** что показывает переключатель: выбор игрока или умолчание */
export const mobPref = () => q() || mobPrefRaw() || mobDefault();
/** новые мобы реально включены (с учётом выключателя админки); run — для забегов */
export function mobsNew(run = false) { return !!GFX.mobs32 && mobPref() === 'new' && (!run || !!GFX.mobs32Run); }
/** кэш режима для горячего цикла (без localStorage на кадр): обновляется при смене настройки/админки */
export const MOBS_ON = { zone: false, run: false };
let last = null;
function fire() { MOBS_ON.zone = mobsNew(); MOBS_ON.run = mobsNew(true); const v = MOBS_ON.zone + ':' + MOBS_ON.run; if (v === last) return; last = v; for (const f of subs) { try { f(MOBS_ON); } catch (e) { console.warn('[mobs]', e); } } }
export function setMobPref(v) { try { localStorage.setItem(MOB_KEY, v === 'old' ? 'old' : 'new'); } catch (_) {} fire(); }
/** подписка на смену режима (настройка игрока или админка); возвращает отписку */
export function onMobMode(fn) { subs.add(fn); return () => subs.delete(fn); }
fire();
onGfx(fire);

/** строка панели «Настройки» (ui/social.js renderSettings; совместима с ui-cursed-rework: .mc-set-row / .grp / .mc-btn sm / data-act) */
export function mobSettingsRow() {
  const v = mobPref(), off = !GFX.mobs32, dis = off ? ' disabled title="Новые мобы сейчас выключены администратором"' : '';
  const note = off ? ' <small class="mc-set-note">— выключено администратором</small>' : IS_MOBILE && v === 'new' ? ' <small class="mc-set-note">— больше памяти (≈50–60 МБ на тир)</small>' : '';
  return `<div class="mc-set-row" data-row="mobs"><span>👹 Мобы${note}</span><div class="grp"><button class="mc-btn sm ${v === 'new' && !off ? 'gold' : ''}" data-act="mobs" data-v="new"${dis || (IS_MOBILE ? ' title="Плавные 64-кадровые спрайты; на телефоне — больше видеопамяти"' : ' title="Плавные 64-кадровые спрайты (Художник)"')}>Новые</button><button class="mc-btn sm ${v === 'old' || off ? 'gold' : ''}" data-act="mobs" data-v="old" title="Прежние 12-кадровые спрайты: легче для памяти">Старые</button></div></div>`;
}
