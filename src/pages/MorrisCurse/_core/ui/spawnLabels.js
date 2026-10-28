// Отсчёт в самом мире — над местом появления: мировые боссы (логова) и редкие Отголоски (место следующего появления).
// Единый механизм: всё, что сервер присылает как место появления (zone_state.wb / zone_state.rs → BOSS_STATE), получает подпись
// «Король Росы / появится через 12:30» без правок клиента. Жив — подписи нет. Показ и «вот-вот» — общие настройки qol.bossTimer, qol.bossSoonSec.
import { BOSS_STATE, markersOf, SPAWN_MARKERS } from '../../../../../server/meta/markers.ts';
import { ZONE_MOBS } from '../../../../../server/meta/defs.ts';
import { fmtLeft } from './bossSpawn.js';

export const SPAWN_LABEL_R = 1800; // дальше — подпись не рисуем (по экрану и так видно только то, что в камере)
/** подписи на текущий кадр: [{ key, x, y, name, text, kind }] — чистая функция (для тестов). known(type) — встречен ли вид (скрытый — без имени) */
export function spawnLabelItems(world, px, py, cfg, now = Date.now(), known = () => true) {
  const out = []; if (!cfg?.on) return out;
  for (const m of markersOf(world)) {
    if (!SPAWN_MARKERS.has(m.type)) continue; const st = BOSS_STATE.get(m.id);
    if (!st || st.alive || st.off || !st.type) continue;
    if (Math.hypot(m.x - px, m.y - py) > SPAWN_LABEL_R) continue;
    const left = Math.max(0, Math.round((st.at - now) / 1000)), nm = ZONE_MOBS[st.type]?.name || (st.kind === 'rare' ? 'Редкий Отголосок' : 'Мировой босс');
    const name = st.kind === 'rare' && !known(st.type) ? 'Редкий Отголосок' : nm;
    const text = left <= 0 ? 'появляется' : left <= cfg.soon ? 'вот-вот появится' : `появится через ${fmtLeft(left)}`;
    out.push({ key: 'sp_' + m.id, x: m.x, y: m.y, name, text, kind: st.kind || 'boss', soon: left <= cfg.soon });
  }
  return out;
}
/** пустые лагеря (все убиты) рядом с игроком: «⛺ Волки / возродится через 2:40». camps — zone_state.cp (с [9] — моментом возрождения), cfg — campCfg */
export function campLabelItems(camps, px, py, cfg, now = Date.now()) {
  const out = []; if (!cfg?.on || !camps) return out;
  for (const c of camps) { if (c[3] > 0 || !(c[4] > 0)) continue; if (Math.hypot(c[1] - px, c[2] - py) > cfg.near) continue;
    const left = c[9] ? Math.max(0, Math.round((c[9] - now) / 1000)) : 0, ty = c[7]?.[0], name = 'Лагерь: ' + (ZONE_MOBS[ty]?.name || 'мобы');
    out.push({ key: 'cp_' + c[0], x: c[1], y: c[2], name, text: left > 0 ? `возродится через ${fmtLeft(left)}` : 'вот-вот возродится', kind: 'camp', soon: left <= 10 }); }
  return out;
}
/** вызывать каждый кадр между overlay.beginFrame() и endFrame(); project(x, y) → {x, y} | null */
export function drawSpawnLabels(overlay, items, project) {
  for (const it of items) { const q = project(it.x, it.y); if (!q) continue;
    overlay.label(it.key, q.x, q.y, `${it.kind === 'rare' ? '◆ ' : it.kind === 'camp' ? '⛺ ' : '☠ '}${escHtml(it.name)}<small class="sp">⏳ ${it.text}</small>`, it.soon ? '#fde68a' : '#e5e7eb'); }
}
const escHtml = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
