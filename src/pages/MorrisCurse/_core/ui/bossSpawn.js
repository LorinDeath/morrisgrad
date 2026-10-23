// Мировые боссы в трекере, охоте и заданиях: куда вести стрелку и что написать, если босса сейчас нет.
// Данные — живое состояние логов от сервера (zone_state.wb → BOSS_STATE): жив / секунд до возрождения / выключен в локации.
// Время возрождения задаёт админка (таймеры боссов), показ — «Удобство (QoL)»: qol.bossTimer, qol.bossSoonSec.
import { BOSS_STATE, markersOf } from '../../../../../server/meta/markers.ts';

/** настройки показа из доски (defs.cfg.qol); без данных — включено */
export function bossCfg(board) { const q = board?.defs?.cfg?.qol || {}; return { on: q.bossTimer !== false, soon: Math.max(0, Number.isFinite(+q.bossSoonSec) ? +q.bossSoonSec : 10) }; }
export function fmtLeft(s) { s = Math.max(0, Math.round(s)); const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), ss = s % 60; return h ? `${h}:${String(m).padStart(2, '0')}:${String(ss).padStart(2, '0')}` : `${m}:${String(ss).padStart(2, '0')}`; }
/** логова боссов мира с живым состоянием, подходящие под isMatch(тип) */
export function bossLairs(isMatch, world, now = Date.now()) {
  const out = [];
  for (const m of markersOf(world, 'boss')) { const st = BOSS_STATE.get(m.id); if (!st || st.off || !st.type || !isMatch(st.type)) continue;
    out.push({ key: m.id.slice(5), world, x: m.x, y: m.y, type: st.type, alive: st.alive, left: st.alive ? 0 : Math.max(0, Math.round((st.at - now) / 1000)) }); }
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
/** «Босс появится через 4:12» / «Босс появляется» / «Босс жив» */
export function spawnText(l, cfg) {
  if (l.alive) return 'Босс жив';
  if (l.left <= cfg.soon) return 'Босс появляется';
  return `Босс появится через ${fmtLeft(l.left)}`;
}
/** цель-логово для компаса/меток: текст таймера — в подписи и в поле sp (экранная метка, карта, трекер) */
export function lairTarget(l, name, cfg, extra = {}) {
  const sp = cfg.on ? spawnText(l, cfg) : '';
  return { world: l.world, x: l.x, y: l.y, label: l.alive || !sp ? name : `${name} · ${sp.replace('Босс ', '')}`, ...extra, ...(sp ? { sp, spAlive: l.alive } : {}) };
}
