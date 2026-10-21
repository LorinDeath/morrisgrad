// @ts-nocheck
// Город Альказак: здания (пропсы dm_* Историка), двери и ИНТЕРЬЕРЫ — отдельные маленькие карты за дверью.
// Всё берётся из данных арта (src/assets/mc/city/*.json, синк tools/sync-city-art): размеры, якоря, двери (door.dx/dy/w),
// сетка проходимости комнат (. # E), спавн, выходы, места NPC (npc_spots). Новая поставка арта — только пересинк.
//
// Комнаты лежат ВНЕ мира Аринара (обе координаты < ROOM_LIMIT): туда не дойти пешком, мобов нет, земля мира не рисуется.
// Комната i — квадрат ROOM_SPAN px с началом в (ROOM_BASE − i·ROOM_STEP) по обеим осям.
// Вход: игрок упирается в дверь здания (триггер у якоря) → сервер переносит на spawn комнаты. Выход: клетка E → наружу,
// на шаг южнее двери (повторно не войдёт, пока не отойдёт от триггера).
import PROPS from "../../src/assets/mc/city/props_dark_atlas.json";
import ROOMS_J from "../../src/assets/mc/city/interiors_dark.json";
import { CITY_CFG, CITY_TILE, cityR, cityOn, CITY_SLOTS, CITY_LOOKS, ROOM_LIMIT, ROOM_OUT, pkUi } from "./city";
import { mapBuildings, mapShiftPx, walkColliders, mapPoint } from "./cityMap";

export const PXM = 20;                               // px мира на метр
export { ROOM_LIMIT };                               // x и y меньше — интерьер
export const ROOM_BASE = -20000, ROOM_STEP = 1000, ROOM_SPAN = 960;
const T = CITY_TILE;
export const DARK_PROPS: any = PROPS;
export const ROOMS: Record<string, any> = (ROOMS_J as any).interiors || {};
const RT = Number((ROOMS_J as any).tile) || 32;      // px клетки комнаты

/** здания города — из карты Историка (alkazak_map.json → buildings): спрайт bld_*, основание = интерьер, дверь, выход наружу.
 *  Все 11 зданий используют 3 шаблона интерьера (house_living / shop_tavern / tent), но у каждого — СВОЙ экземпляр комнаты
 *  (своё место за пределами мира) и свои места NPC. */
export interface CityBuildingDef { id: string; name: string; key: string; interior?: string }
const NAMES: Record<string, string> = { tavern: "Таверна «У чёрной розы»", house_elder: "Дом старосты" };
export const BUILD_DEF: CityBuildingDef[] = mapBuildings().map((b: any) => ({ id: b.id, name: NAMES[b.id] || (b.interior === "tent" ? "Шатёр беженцев" : "Жилой дом"), key: b.key, interior: b.interior, role: b.role }));
/** раскладка зданий — авторская (карта), радиус купола её не растягивает */
export const cityScale = () => 1;
export function roomKeyOf(b: CityBuildingDef): string | null {
  const m = (CITY_CFG.interiorOf || {})[b.interior || ""] || b.interior; return m && ROOMS[m] ? m : null;
}
export interface CityBuilding extends CityBuildingDef { i: number; x: number; y: number; door: { x: number; y: number; hw: number; y0: number; y1: number } | null; exit: [number, number]; room: string | null; ox: number; oy: number; w: number; h: number; rect: number[]; spawn: number[] | null; exits: number[][] }
let CACHE: { sig: string; list: CityBuilding[] } | null = null;
/** здания с мировыми координатами (px, со сдвигом карты): якорь, дверь (триггер), выход, комната */
export function cityBuildings(): CityBuilding[] {
  const sig = `${CITY_CFG.x},${CITY_CFG.y},${JSON.stringify(CITY_CFG.interiorOf || {})},${CITY_CFG.on}`;
  if (CACHE && CACHE.sig === sig) return CACHE.list;
  const [sx, sy] = mapShiftPx(), out: CityBuilding[] = [], M = mapBuildings();
  BUILD_DEF.forEach((b, i) => {
    const m = M[i], room = roomKeyOf(b), R = room ? ROOMS[room] : null, o = ROOM_BASE - i * ROOM_STEP;
    const [ax, ay] = m.anchor_world_px, tr = m.door_trigger_world_px; // [x, y, w, h]
    out.push({ ...b, i, x: ax + sx, y: ay + sy, room, ox: o, oy: o, w: R ? R.size[0] * RT : 0, h: R ? R.size[1] * RT : 0,
      rect: [m.world_rect_px[0] + sx, m.world_rect_px[1] + sy, m.world_rect_px[2], m.world_rect_px[3]],
      door: tr ? { x: tr[0] + tr[2] / 2 + sx, y: tr[1] + tr[3] / 2 + sy, hw: tr[2] / 2 + 2, y0: tr[1] + sy - 6, y1: tr[1] + tr[3] + sy + 6 } : null,
      exit: [m.exit_world_px[0] + sx, m.exit_world_px[1] + sy], spawn: m.interior_spawn?.px || null, exits: m.interior_exit_tiles || [] });
  });
  CACHE = { sig, list: out }; return out;
}
export const buildingById = (id: string) => cityBuildings().find((b) => b.id === id) || null;

// ——— коллайдеры зданий и пропсов города (эллипс у основания; у зданий сдвинут к северу — стена за якорем, дверь доступна) ———
export const ELL_Y = 0.6;
/** коллайдер пропса dm_*: collider{dx_m,dy_m,rx_m,ry_m} из JSON, иначе solid_k × ширина (как propsV2) */
export function darkColliders(key: string, x: number, y: number, s = 1, out: any[] = []) {
  const d = DARK_PROPS.keys?.[key]; if (!d) return out;
  const c = d.collider;
  if (c && c.type === "ellipse") { out.push({ x: x + (c.dx_m || 0) * PXM * s, y: y + (c.dy_m || 0) * PXM * s, rx: c.rx_m * PXM * s, ry: c.ry_m * PXM * s }); return out; }
  if (/^dm_fence/.test(key)) return fenceColliders(key, x, y, s, out);
  const k = Number(d.solid_k) || 0; if (!k) return out;
  const rx = (d.size_m[0] * PXM * s * k) / 2, ry = rx * ELL_Y;
  out.push({ x, y: d.kind === "building" ? y - ry * 0.8 : y, rx, ry });
  return out;
}
/** заборы: в движке только эллипсы → цепочка маленьких кружков вдоль секции (±1.5 м); калитка проходима, у сломанной — пролом */
export function fenceColliders(key: string, x: number, y: number, s = 1, out: any[] = []) {
  if (key === "dm_fence_gate") return out;
  if (key === "dm_fence_post") { out.push({ x, y, rx: 6, ry: 6 * ELL_Y }); return out; }
  const half = 1.5 * PXM * s;
  for (let t = -half; t <= half + 0.1; t += 10) { if (key === "dm_fence_broken" && Math.abs(t) < 12) continue; out.push({ x: x + t, y, rx: 6, ry: 5 }); }
  return out;
}
/** стены зданий, заборы и твёрдые пропсы города — сетка walk карты (arinarLayout кладёт их в чанки; здесь — для тестов/старых вызовов) */
export function buildingColliders(): any[] { return cityOn() ? walkColliders() : []; }

// ——— интерьеры ———
export const inRoomArea = (x: number, y: number) => x < ROOM_LIMIT && y < ROOM_LIMIT;
/** комната, в которой лежит точка (px), или null */
export function roomAt(x: number, y: number): CityBuilding | null {
  if (!inRoomArea(x, y)) return null;
  for (const b of cityBuildings()) if (b.room && x >= b.ox - 64 && y >= b.oy - 64 && x <= b.ox + ROOM_SPAN && y <= b.oy + ROOM_SPAN) return b;
  return null;
}
/** клетка комнаты: '.' / '#' / 'E' (вне комнаты — '#') */
export function roomCell(b: CityBuilding, cx: number, cy: number): string { const R = ROOMS[b.room!]; const row = R?.walk?.[cy]; if (!row || cx < 0 || cx >= row.length) return "#"; return row[cx] || "#"; }
/** границы перемещения в комнате [lo, hi] (общие для осей, как worldBounds) */
export function roomBounds(b: CityBuilding): [number, number] { return [b.ox, b.ox + Math.max(b.w, b.h)]; }
/** вытолкнуть круг из стен/мебели комнаты ('#') — сервер и клиент (предсказание) одинаково */
export function resolveRoom(x: number, y: number, r = 10): [number, number] {
  const b = roomAt(x, y); if (!b) return [x, y];
  x = Math.max(b.ox + r, Math.min(b.ox + b.w - r, x)); y = Math.max(b.oy + r, Math.min(b.oy + b.h - r, y));
  { // центр в стене/мебели (телепорт, рассинхрон) — в ближайшую проходимую клетку
    const ci = Math.floor((x - b.ox) / RT), cj = Math.floor((y - b.oy) / RT);
    if (roomCell(b, ci, cj) === "#") { let best: [number, number] | null = null, bd = 1e9; const R = ROOMS[b.room!];
      for (let cy = 0; cy < R.size[1]; cy++) for (let cx = 0; cx < R.size[0]; cx++) { if (roomCell(b, cx, cy) !== ".") continue; const px = b.ox + (cx + 0.5) * RT, py = b.oy + (cy + 0.5) * RT, d = (px - x) ** 2 + (py - y) ** 2; if (d < bd) { bd = d; best = [px, py]; } }
      if (best) [x, y] = best; }
  }
  for (let pass = 0; pass < 3; pass++) {
    let moved = false; const ci = Math.floor((x - b.ox) / RT), cj = Math.floor((y - b.oy) / RT);
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
      const cx = ci + di, cy = cj + dj; if (roomCell(b, cx, cy) !== "#") continue;
      const x0 = b.ox + cx * RT, y0 = b.oy + cy * RT, nx = Math.max(x0, Math.min(x0 + RT, x)), ny = Math.max(y0, Math.min(y0 + RT, y));
      const dx = x - nx, dy = y - ny, d = Math.hypot(dx, dy);
      if (d >= r) continue;
      if (d < 1e-3) { // центр внутри клетки: наружу по кратчайшей оси
        const l = x - x0, rr = x0 + RT - x, t = y - y0, bb = y0 + RT - y, m = Math.min(l, rr, t, bb);
        if (m === l) x = x0 - r; else if (m === rr) x = x0 + RT + r; else if (m === t) y = y0 - r; else y = y0 + RT + r;
      } else { x = nx + (dx / d) * r; y = ny + (dy / d) * r; }
      moved = true;
    }
    if (!moved) break;
  }
  return [x, y];
}
export const roomWalkable = (x: number, y: number, r = 10) => { const b = roomAt(x, y); if (!b) return false; const [a, c] = resolveRoom(x, y, r); return Math.hypot(a - x, c - y) < 1 && roomCell(b, Math.floor((x - b.ox) / RT), Math.floor((y - b.oy) / RT)) !== "#"; };
/** спавн комнаты (px мира) */
export function roomSpawn(b: CityBuilding): [number, number] { const R = ROOMS[b.room!]; const p = b.spawn || R?.spawn?.px || [R.size[0] * RT / 2, (R.size[1] - 2) * RT]; return [b.ox + p[0], b.oy + p[1]]; }
/** стоит на клетке выхода */
export function onExit(b: CityBuilding, x: number, y: number) { const R = ROOMS[b.room!]; const cx = Math.floor((x - b.ox) / RT), cy = Math.floor((y - b.oy) / RT); return [...(b.exits || []), ...(R?.exit || []).map((e: any) => (Array.isArray(e) ? e : e.tile || []))].some(([ex, ey]) => ex === cx && ey === cy) || roomCell(b, cx, cy) === "E"; }
/** точка снаружи у двери: на шаг южнее триггера */
export function outsideDoor(b: CityBuilding): [number, number] { return [b.exit[0], b.exit[1] + 8]; } // exit_world_px карты (лицом вниз), на полшага ниже триггера
/** игрок у двери (снаружи): упёрся в стену здания у проёма */
export function atDoor(b: CityBuilding, x: number, y: number) { const d = b.door; return !!d && !!b.room && Math.abs(x - d.x) <= d.hw && y >= d.y0 && y <= d.y1; }
/** пропсы-заглушки и декор не ставим на здания и подход к двери (arinarLayout фильтрует cityP) */
export function nearBuilding(x: number, y: number, pad = 16): boolean {
  if (!cityOn()) return false;
  for (const b of cityBuildings()) { const r = b.rect; if (x > r[0] - pad && x < r[0] + r[2] + pad && y > r[1] - pad && y < r[1] + r[3] + pad) return true; if (b.door && Math.abs(x - b.door.x) < 40 + pad && y >= b.door.y - 8 && y < b.door.y + 72 + pad) return true; }
  return false;
}
ROOM_OUT.f = (x, y) => { const b = roomAt(x, y); return b ? outsideDoor(b) : null; };
export function doorNear(x: number, y: number): CityBuilding | null { if (!cityOn()) return null; for (const b of cityBuildings()) if (atDoor(b, x, y)) return b; return null; }
/** точки NPC комнаты (px мира) */
export function roomNpcSpot(b: CityBuilding, spot: string): [number, number, string] | null { const R = ROOMS[b.room!]; const s = (R?.npc_spots || []).find((q) => q.id === spot) || null; return s ? [b.ox + s.px[0], b.oy + s.px[1], s.facing || "down"] : null; }

// ——— места NPC: снаружи (клетки от центра) или в здании (house + spot из interiors npc_spots) ———
export const cityNpcId = (i: number) => `city_${i + 1}`;
/** точка места NPC (px) или null — место выключено/недоступно */
export function slotPos(s: any): [number, number, string] | null {
  if (s.house) { const b = buildingById(s.house); if (b?.room) { const p = roomNpcSpot(b, s.spot || "") || (ROOMS[b.room].npc_spots?.[0] ? roomNpcSpot(b, ROOMS[b.room].npc_spots[0].id) : null); if (p) return p; } }
  if (s.pt) { const p = mapPoint(s.pt); if (p) return [p[0], p[1], s.f || "down"]; } // точка карты Историка (npc_elder…)
  return [Math.round(CITY_CFG.x + s.dx * T), Math.round(CITY_CFG.y + s.dy * T), s.f || "down"];
}
/** реестр NPC (shared.ts NPCS): места города — «мобильные» (не в раскладке), world '-' пока место выключено */
export function cityNpcDefs(): Record<string, any> {
  const o: any = {};
  (CITY_CFG.npc as any[]).forEach((s, i) => { const p = slotPos(s); o[cityNpcId(i)] = { name: s.name, title: s.title, world: s.on && cityOn() && p ? "arinar" : "-", x: p ? p[0] : 0, y: p ? p[1] : 0, color: "#c4b5fd", role: "city", mobile: true, city: i + 1, house: s.house || "" }; });
  return o;
}
export function syncCityNpcs(NPCS: Record<string, any>) { for (const [id, d] of Object.entries(cityNpcDefs())) { if (NPCS[id]) Object.assign(NPCS[id], d); else NPCS[id] = d; } }
/** клиенту: что рисовать (без правил убийц) */
export const cityClient = () => ({ pkUi: pkUi(), on: cityOn(), name: CITY_CFG.name, cp: CITY_CFG.centerpiece, x: CITY_CFG.x, y: CITY_CFG.y, r: cityR(), rTiles: Number(CITY_CFG.rTiles) || 32, aIn: CITY_CFG.alphaIn, aOut: CITY_CFG.alphaOut, rim: CITY_CFG.rim, color: CITY_CFG.color, tint: CITY_CFG.groundTint, rose: CITY_CFG.roseId && Array.isArray(CITY_CFG.rosePos) ? { id: String(CITY_CFG.roseId), x: CITY_CFG.rosePos[0] + mapShiftPx()[0], y: CITY_CFG.rosePos[1] + mapShiftPx()[1] } : null,
  b: cityBuildings().map((b) => [b.id, b.key, b.x, b.y, b.room || "", b.ox, b.oy, b.name, b.door ? b.door.x : 0, b.door ? b.door.y : 0]), // + дверь (триггер)
  npc: (CITY_CFG.npc as any[]).map((s, i) => { const p = s.on ? slotPos(s) : null; return p ? { id: cityNpcId(i), name: s.name, title: s.title, look: s.look, x: p[0], y: p[1], f: p[2], house: s.house || "" } : null; }).filter(Boolean) });
export { CITY_SLOTS, CITY_LOOKS };
