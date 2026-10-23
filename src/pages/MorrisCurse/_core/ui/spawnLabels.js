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
/** вызывать каждый кадр между overlay.beginFrame() и endFrame(); project(x, y) → {x, y} | null */
export function drawSpawnLabels(overlay, items, project) {
  for (const it of items) { const q = project(it.x, it.y); if (!q) continue;
    overlay.label(it.key, q.x, q.y, `${it.kind === 'rare' ? '◆ ' : '☠ '}${escHtml(it.name)}<small class="sp">⏳ ${it.text}</small>`, it.soon ? '#fde68a' : '#e5e7eb'); }
}
const escHtml = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
