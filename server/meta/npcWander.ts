// NPC бродят вокруг точки появления (сервер — единственный источник правды: все игроки видят одно и то же).
// Простой цикл: пауза → выбор свободной точки в радиусе → ход по прямой (путь проверен по коллизиям пропсов) → пауза.
// Пока с NPC разговаривает игрок (npc_talk … npc_talk_end, или таймаут) — стоит и смотрит на собеседника.
// Админка «🚶 NPC» (kind='npc', id='main') — правка применяется живьём.
import { STATIC_NPCS as NPCS } from "./shared";
import { blockedWorld } from "./propCollision";
import { HELLFIRE_MAP_TILES } from "../maps/hellfireMap";
import { worldBounds } from "../worlds/sizes";

export const TILE_PX = 32; // клетка мира (worldLayout.CELL)
export const NPC_CFG = {
  on: true,          // NPC ходят
  radiusTiles: 10,   // радиус прогулки от точки появления, клеток (32 px)
  speed: 42,         // скорость шага, px/с (герой ≈ 160)
  pauseMin: 2.5,     // пауза между прогулками, с (мин.)
  pauseMax: 7,       // пауза, с (макс.)
  talkHoldSec: 90,   // стоит у собеседника, если окно не закрыли (обрыв связи и т. п.), с
};
export const npcClient = () => ({ on: NPC_CFG.on !== false, radius: NPC_CFG.radiusTiles * TILE_PX, speed: NPC_CFG.speed });

type St = { id: string; world: string; sx: number; sy: number; x: number; y: number; tx: number; ty: number; moving: boolean; pauseUntil: number; dir: number; talk: Map<string, { until: number; x: number; y: number }> };
const R_BODY = 12;
// твёрдые тайлы хаба (стены/вода: layer 2 или collision_box — как WorldMapManager клиента) + пропсы v2 + края мира
const SOLID: Record<string, Set<string>> = { hellfire: new Set(((HELLFIRE_MAP_TILES as any[]) || []).filter((t) => t.layer === 2 || t.tileId === "collision_box").map((t) => `${t.x}_${t.y}`)) };
export function npcBlocked(w: string, x: number, y: number, r: number) {
  const [lo, hi] = worldBounds(w); if (x - r < lo + 16 || y - r < lo + 16 || x + r > hi - 16 || y + r > hi - 16) return true;
  const g = SOLID[w];
  if (g?.size) for (let cx = Math.floor((x - r) / TILE_PX); cx <= Math.floor((x + r) / TILE_PX); cx++) for (let cy = Math.floor((y - r) / TILE_PX); cy <= Math.floor((y + r) / TILE_PX); cy++) if (g.has(`${cx}_${cy}`)) return true;
  return blockedWorld(w, x, y, r);
}
const rnd = (a: number, b: number) => a + Math.random() * (b - a);
// направление спрайта: 0 вниз, 1 влево, 2 вправо, 3 вверх
export const dirOf = (dx: number, dy: number, prev = 0) => (Math.abs(dx) < 0.01 && Math.abs(dy) < 0.01 ? prev : Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 1 : 2) : dy < 0 ? 3 : 0);

export class NpcWander {
  st = new Map<string, St>();
  blocked: (w: string, x: number, y: number, r: number) => boolean;
  constructor(blocked = npcBlocked) {
    this.blocked = blocked;
    for (const [id, n] of Object.entries(NPCS)) this.st.set(id, { id, world: n.world, sx: n.x, sy: n.y, x: n.x, y: n.y, tx: n.x, ty: n.y, moving: false, pauseUntil: Date.now() + rnd(500, 4000), dir: 0, talk: new Map() });
  }
  pos(id: string) { return this.st.get(id); }
  /** путь свободен: выборка по отрезку каждые 4 px (шаг ≤ R_BODY − радиус проверки, чтобы между выборками тело не задевало углы) */
  clear(w: string, x0: number, y0: number, x1: number, y1: number) {
    const L = Math.hypot(x1 - x0, y1 - y0), n = Math.max(1, Math.ceil(L / 4));
    for (let i = 1; i <= n; i++) { const k = i / n; try { if (this.blocked(w, x0 + (x1 - x0) * k, y0 + (y1 - y0) * k, R_BODY)) return false; } catch { return false; } }
    return true;
  }
  pick(s: St) {
    const R = Math.max(0, NPC_CFG.radiusTiles) * TILE_PX;
    for (let i = 0; i < 10 && R > 8; i++) {
      const a = Math.random() * Math.PI * 2, d = Math.sqrt(Math.random()) * R, tx = s.sx + Math.cos(a) * d, ty = s.sy + Math.sin(a) * d;
      if (Math.hypot(tx - s.x, ty - s.y) < 24) continue;
      if (this.clear(s.world, s.x, s.y, tx, ty)) return [tx, ty];
    }
    return null;
  }
  talkStart(id: string, who: string, px: number, py: number, now = Date.now()) {
    const s = this.st.get(id); if (!s) return;
    s.talk.set(who, { until: now + NPC_CFG.talkHoldSec * 1000, x: px, y: py });
    s.moving = false; s.dir = dirOf(px - s.x, py - s.y, s.dir);
  }
  talkEnd(id: string | null, who: string, now = Date.now()) {
    for (const s of this.st.values()) if ((!id || s.id === id) && s.talk.delete(who) && !s.talk.size) s.pauseUntil = now + rnd(1500, 3000);
  }
  tick(now: number, dt: number) {
    for (const s of this.st.values()) {
      for (const [k, t] of s.talk) if (t.until <= now) s.talk.delete(k);
      if (s.talk.size) { s.moving = false; continue; }
      if (NPC_CFG.on === false) { // выкл — домой (мгновенно), стоять
        if (s.x !== s.sx || s.y !== s.sy) { s.x = s.tx = s.sx; s.y = s.ty = s.sy; s.dir = 0; } s.moving = false; continue;
      }
      if (!s.moving) {
        if (now < s.pauseUntil) continue;
        const t = this.pick(s);
        if (!t) { s.pauseUntil = now + rnd(NPC_CFG.pauseMin, NPC_CFG.pauseMax) * 1000; continue; }
        [s.tx, s.ty] = t; s.moving = true;
      }
      const dx = s.tx - s.x, dy = s.ty - s.y, L = Math.hypot(dx, dy), step = Math.max(1, NPC_CFG.speed) * dt;
      s.dir = dirOf(dx, dy, s.dir);
      if (L <= step) { s.x = s.tx; s.y = s.ty; s.moving = false; s.pauseUntil = now + rnd(NPC_CFG.pauseMin, Math.max(NPC_CFG.pauseMin, NPC_CFG.pauseMax)) * 1000; }
      else { s.x += (dx / L) * step; s.y += (dy / L) * step; }
    }
  }
  /** для zone_state: [id, x, y, dir, moving(0/1)] по миру */
  snapshot(world: string) {
    const out: [string, number, number, number, number][] = [];
    for (const s of this.st.values()) if (s.world === world) out.push([s.id, Math.round(s.x), Math.round(s.y), s.dir, s.moving ? 1 : 0]);
    return out;
  }
}
