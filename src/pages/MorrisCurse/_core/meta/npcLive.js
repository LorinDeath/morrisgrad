// Живые позиции NPC (сервер двигает их вокруг точки появления, присылает zone_state.npc = [[id, x, y, dir, moving], …]).
// Клиент плавно догоняет серверную точку; всё, что раньше брало NPCS[id].x/y (рисование, взаимодействие, метки, стрелка
// задания), берёт npcPos(id). Нет данных с сервера — NPC стоит в точке появления (как раньше).
import { NPCS } from '../../../../../server/meta/shared.ts';

const L = new Map(); // id → { x, y, tx, ty, dir, moving, at }
export function npcUpdate(arr) {
  if (!Array.isArray(arr)) return;
  const now = performance.now();
  for (const [id, x, y, dir, mv] of arr) {
    let s = L.get(id);
    if (!s || Math.hypot(x - s.x, y - s.y) > 400) { s = { x, y }; L.set(id, s); } // первый кадр / телепорт — без проезда
    s.tx = x; s.ty = y; s.dir = dir | 0; s.moving = !!mv; s.at = now;
  }
}
export function npcStep(dt) {
  const k = Math.min(1, dt * 7);
  for (const s of L.values()) { s.x += (s.tx - s.x) * k; s.y += (s.ty - s.y) * k; }
}
/** {x, y, dir, moving} — позиция для отрисовки/взаимодействия */
export function npcPos(id) {
  const s = L.get(id), n = NPCS[id];
  if (!s) return n ? { x: n.x, y: n.y, dir: 0, moving: false } : null;
  const moving = s.moving || Math.hypot(s.tx - s.x, s.ty - s.y) > 2;
  return { x: s.x, y: s.y, dir: s.dir, moving };
}
/** серверная точка (тесты) */
export const npcServer = (id) => { const s = L.get(id); return s ? { x: s.tx, y: s.ty, moving: s.moving } : null; };
export const npcReset = () => L.clear();
