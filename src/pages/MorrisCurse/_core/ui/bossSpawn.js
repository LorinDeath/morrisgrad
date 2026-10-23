// Места появления в трекере, охоте, заданиях, карте и в самом мире: куда вести стрелку и что написать, если моба сейчас нет.
// Единый механизм для двух классов: мировой босс (логово) и редкий Отголосок (место следующего появления выбирает сервер).
// Данные — живое состояние от сервера (zone_state.wb / zone_state.rs → BOSS_STATE): жив / секунд до появления / выключен в локации.
// Время появления задаёт админка (таймеры боссов; «Редкие Отголоски»), показ — «Удобство (QoL)»: qol.bossTimer, qol.bossSoonSec (общие).
import { BOSS_STATE, markersOf, SPAWN_MARKERS } from '../../../../../server/meta/markers.ts';
import { ZONE_MOBS } from '../../../../../server/meta/defs.ts';

/** настройки показа из доски (defs.cfg.qol); без данных — включено */
export function bossCfg(board) { const q = board?.defs?.cfg?.qol || {}; return { on: q.bossTimer !== false, soon: Math.max(0, Number.isFinite(+q.bossSoonSec) ? +q.bossSoonSec : 10) }; }
export function fmtLeft(s) { s = Math.max(0, Math.round(s)); const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), ss = s % 60; return h ? `${h}:${String(m).padStart(2, '0')}:${String(ss).padStart(2, '0')}` : `${m}:${String(ss).padStart(2, '0')}`; }
/** места появления мира (логова боссов и редкие Отголоски) с живым состоянием, подходящие под isMatch(тип, вид); kind — 'boss' | 'rare' */
export function bossLairs(isMatch, world, now = Date.now()) {
  const out = [];
  for (const m of markersOf(world)) { if (!SPAWN_MARKERS.has(m.type)) continue; const st = BOSS_STATE.get(m.id); if (!st || st.off || !st.type || !isMatch(st.type, m.type)) continue;
    out.push({ key: m.id.slice(m.id.indexOf(':') + 1), kind: m.type, world, x: m.x, y: m.y, type: st.type, alive: st.alive, left: st.alive ? 0 : Math.max(0, Math.round((st.at - now) / 1000)), where: st.where || '' }); }
  return out;
}
/** какое логово показывать: живой босс (ближайший) → иначе тот, что появится раньше всех */
export function pickLair(lairs, ctx) {
  let best = null;
  for (const l of lairs) { const d = Math.hypot(l.x - ctx.x, l.y - ctx.y);
    const better = !best || (l.alive !== best.alive ? l.alive : l.alive ? d < best.d : l.left < best.left || (l.left === best.left && d < best.d));
    if (better) best = { ...l, d }; }
  return best;
}
/** Как назвать: босс — «Босс» (в трекере), имя можно передать явно (в мире и у редких — по имени: «Король Росы появится через 12:30») */
export const spawnName = (l, name) => name != null ? name : (l.kind === 'rare' ? ZONE_MOBS[l.type]?.name || 'Отголосок' : 'Босс');
/** «Босс появится через 4:12» / «Король Росы вот-вот появится» / «Король Росы появляется» (время вышло, сервер выбирает момент) / «Босс жив» */
export function spawnText(l, cfg, name) {
  const nm = spawnName(l, name);
  if (l.alive) return `${nm} ${l.kind === 'rare' ? 'здесь' : 'жив'}`;
  if (l.left <= 0) return `${nm} появляется`;
  if (l.left <= cfg.soon) return `${nm} вот-вот появится`;
  return `${nm} появится через ${fmtLeft(l.left)}`;
}
/** то же без имени — для узких подписей рядом с меткой: «появится через 4:12» / «вот-вот появится» / «появляется» */
export function spawnShort(l, cfg) { const t = spawnText(l, cfg, '').trim(); return t; }
/** цель-логово для компаса/меток: текст таймера — в подписи и в поле sp (экранная метка, карта, трекер) */
export function lairTarget(l, name, cfg, extra = {}) {
  const sp = cfg.on ? spawnText(l, cfg) : '', short = cfg.on ? spawnShort(l, cfg) : '';
  return { world: l.world, x: l.x, y: l.y, label: l.alive || !sp ? name : `${name} · ${short}`, ...extra, ...(sp ? { sp, sps: short, spAlive: l.alive } : {}) };
}
