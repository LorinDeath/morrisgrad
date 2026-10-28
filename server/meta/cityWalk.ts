// @ts-nocheck
// Жители Альказака (места NPC города с флажком walk): живут в своём доме (house + spot из interiors_dark.json → npc_spots)
// и выходят гулять по улицам. Тот же цикл, что у NpcWander (пауза → свободная точка в радиусе → шаг по прямой с проверкой пути),
// плюс смена «дом ↔ улица»: по таймеру житель стоит у своей точки и переходит через дверь (как игрок: комната ↔ снаружи у двери).
// Пока с жителем говорит игрок — стоит и смотрит на собеседника (talkStart / talkEnd, как у NpcWander).
// Сервер — единственный источник правды: позиции уходят в zone_state.npc ([id, x, y, dir, moving]).
// Настройки — CITY_CFG.walk (админка «🏰 Город» → «Жители: прогулка»), правка применяется живьём.
import { CITY_CFG, cityR, cityOn } from "./city";
import { cityNpcId, slotPos, buildingById, outsideDoor, inRoomArea, roomWalkable } from "./cityBuild";
import { npcBlocked, dirOf, TILE_PX } from "./npcWander";

type St = { id: string; i: number; sig: string; out: boolean; home: [number, number]; door: [number, number]; ax: number; ay: number; x: number; y: number; tx: number; ty: number; moving: boolean; pauseUntil: number; phaseUntil: number; dir: number; talk: Map<string, { until: number }> };
const R_BODY = 12;
const rnd = (a: number, b: number) => a + Math.random() * (b - a);
const num = (v: any, d: number) => (Number.isFinite(Number(v)) ? Number(v) : d);
const W = () => CITY_CFG.walk || {};
/** проходимо для жителя: в комнате — сетка комнаты, снаружи — коллизии мира и не ближе 3 клеток к краю купола */
export function cityWalkBlocked(x: number, y: number, r = R_BODY) {
  if (inRoomArea(x, y)) return !roomWalkable(x, y, r);
  if ((x - CITY_CFG.x) ** 2 + (y - CITY_CFG.y) ** 2 > (cityR() - 3 * TILE_PX) ** 2) return true;
  return npcBlocked("arinar", x, y, r);
}
/** житель: место включено, ходит (walk) и живёт в здании с комнатой */
/** ближайшая свободная точка (место в комнате бывает вплотную к мебели): спираль по 8 px до 4 клеток */
export function freeNear(x: number, y: number, blocked = cityWalkBlocked): [number, number] {
  if (!blocked(x, y, R_BODY)) return [x, y];
  for (let d = 8; d <= 4 * TILE_PX; d += 8) for (let k = 0; k < 16; k++) { const a = (k / 16) * Math.PI * 2, px = Math.round(x + Math.cos(a) * d), py = Math.round(y + Math.sin(a) * d); if (!blocked(px, py, R_BODY)) return [px, py]; }
  return [x, y];
}
export const isResident = (s: any) => !!(s && s.on && s.walk && s.house && buildingById(s.house)?.room);

export class CityWalk {
  st = new Map<string, St>();
  blocked: (x: number, y: number, r: number) => boolean;
  constructor(blocked = cityWalkBlocked) { this.blocked = blocked; }
  pos(id: string) { return this.st.get(id) || null; }
  /** состав жителей — из CITY_CFG.npc (правка в админке: имя/дом/место/вкл — пересобирается) */
  sync(now = Date.now()) {
    const seen = new Set<string>();
    if (cityOn()) (CITY_CFG.npc as any[]).forEach((s, i) => {
      if (!isResident(s)) return;
      const id = cityNpcId(i), b = buildingById(s.house), p = slotPos(s); if (!b || !p) return;
      const d = outsideDoor(b), door = freeNear(d[0], d[1] + 24, this.blocked), home = freeNear(p[0], p[1], this.blocked), sig = `${s.house}|${s.spot}|${p[0]},${p[1]}|${door}`;
      seen.add(id);
      const o = this.st.get(id);
      if (o && o.sig === sig) return;
      const start = !!s.startOut; // по умолчанию начинает дома
      const ax = start ? door[0] : home[0], ay = start ? door[1] : home[1];
      this.st.set(id, { id, i, sig, out: start, home, door, ax, ay, x: ax, y: ay, tx: ax, ty: ay, moving: false, pauseUntil: now + rnd(500, 3000), phaseUntil: now + this.phaseMs(start), dir: 0, talk: o?.talk || new Map() });
    });
    for (const id of [...this.st.keys()]) if (!seen.has(id)) this.st.delete(id);
  }
  phaseMs(out: boolean) { const w = W(); return out ? rnd(num(w.outMinSec, 40), Math.max(num(w.outMinSec, 40), num(w.outMaxSec, 90))) * 1000 : rnd(num(w.inMinSec, 30), Math.max(num(w.inMinSec, 30), num(w.inMaxSec, 70))) * 1000; }
  clear(x0: number, y0: number, x1: number, y1: number) {
    const L = Math.hypot(x1 - x0, y1 - y0), n = Math.max(1, Math.ceil(L / 4));
    for (let i = 1; i <= n; i++) { const k = i / n; try { if (this.blocked(x0 + (x1 - x0) * k, y0 + (y1 - y0) * k, R_BODY)) return false; } catch { return false; } }
    return true;
  }
  pick(s: St) {
    const w = W(), R = Math.max(0, s.out ? num(w.rOutTiles, 7) : num(w.rInTiles, 2.5)) * TILE_PX;
    for (let k = 0; k < 10 && R > 8; k++) {
      const a = Math.random() * Math.PI * 2, d = Math.sqrt(Math.random()) * R, tx = s.ax + Math.cos(a) * d, ty = s.ay + Math.sin(a) * d;
      if (Math.hypot(tx - s.x, ty - s.y) < 20) continue;
      if (this.clear(s.x, s.y, tx, ty)) return [tx, ty];
    }
    return null;
  }
  talkStart(id: string, who: string, px: number, py: number, now = Date.now()) {
    const s = this.st.get(id); if (!s) return;
    s.talk.set(who, { until: now + num(W().talkHoldSec, 90) * 1000 }); s.moving = false; s.dir = dirOf(px - s.x, py - s.y, s.dir);
  }
  talkEnd(id: string | null, who: string, now = Date.now()) {
    for (const s of this.st.values()) if ((!id || s.id === id) && s.talk.delete(who) && !s.talk.size) s.pauseUntil = now + rnd(1500, 3000);
  }
  /** перейти через дверь: дома → на улицу у двери, с улицы → на своё место в комнате */
  swap(s: St, now: number) {
    s.out = !s.out; const [ax, ay] = s.out ? s.door : s.home;
    s.ax = s.x = s.tx = ax; s.ay = s.y = s.ty = ay; s.moving = false; s.dir = s.out ? 0 : 3;
    s.pauseUntil = now + rnd(800, 2500); s.phaseUntil = now + this.phaseMs(s.out);
  }
  tick(now: number, dt: number) {
    const w = W(), on = w.on !== false, speed = Math.max(1, num(w.speed, 38));
    for (const s of this.st.values()) {
      for (const [k, t] of s.talk) if (t.until <= now) s.talk.delete(k);
      if (s.talk.size) { s.moving = false; continue; }
      if (!on) { if (s.out || s.x !== s.home[0] || s.y !== s.home[1]) { s.out = true; this.swap(s, now); } continue; } // выкл — стоят дома на своём месте
      if (!s.moving && now >= s.phaseUntil && w.goOut !== false) { this.swap(s, now); continue; }
      if (!s.moving) {
        if (now < s.pauseUntil) continue;
        const t = this.pick(s);
        if (!t) { s.pauseUntil = now + rnd(2, 6) * 1000; continue; }
        [s.tx, s.ty] = t; s.moving = true;
      }
      const dx = s.tx - s.x, dy = s.ty - s.y, L = Math.hypot(dx, dy), step = speed * dt;
      s.dir = dirOf(dx, dy, s.dir);
      if (L <= step) { s.x = s.tx; s.y = s.ty; s.moving = false; s.pauseUntil = now + rnd(num(w.pauseMin, 2.5), Math.max(num(w.pauseMin, 2.5), num(w.pauseMax, 7))) * 1000; }
      else { s.x += (dx / L) * step; s.y += (dy / L) * step; }
    }
  }
  entry(id: string): [string, number, number, number, number] | null { const s = this.st.get(id); return s ? [id, Math.round(s.x), Math.round(s.y), s.dir, s.moving ? 1 : 0] : null; }
}
