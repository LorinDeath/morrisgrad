// Коллизии досок (Доска объявлений и Доска достижений): непроходимые, как твёрдые пропсы. Позиции — из настроек доски
// (board.ts → BOARD_CFG nb*/ab*, админка). Отдельно от сеток пропсов: доски можно передвинуть в админке без перестройки сеток.
// Сервер ставит список из board.ts (при загрузке и после правки), клиент — из boardDefs().props (одинаковое выталкивание).
import { ColliderGrid, resolveCircle, blocked } from "./propsV2.ts";

export const BOARD_COL = { rx: 20, ry: 10 }; // основание доски ~2 м × 1 м (спрайт 2.6 м, тень 1.1 м)
const grids = new Map<string, ColliderGrid>();
let sig = "";
/** list — [{ world, x, y }] досок; пустой — коллизий нет (доска выключена) */
export function setBoardCols(list: { world: string; x: number; y: number }[]) {
  const s = JSON.stringify((list || []).map((p) => [p?.world, p?.x, p?.y])); if (s === sig) return; sig = s; grids.clear();
  for (const p of list || []) {
    const x = Number(p?.x), y = Number(p?.y); if (!p || !Number.isFinite(x) || !Number.isFinite(y)) continue;
    const w = p.world || "hellfire"; let g = grids.get(w); if (!g) grids.set(w, (g = new ColliderGrid()));
    g.add({ x, y, rx: BOARD_COL.rx, ry: BOARD_COL.ry });
  }
}
export function resolveBoards(world: string, x: number, y: number, r: number): [number, number] {
  const g = grids.get(world || "hellfire"); return g ? resolveCircle(g, x, y, r) : [x, y];
}
export function blockedBoards(world: string, x: number, y: number, r: number): boolean {
  const g = grids.get(world || "hellfire"); return g ? blocked(g, x, y, r) : false;
}
