// t1221: туман войны (ТЗ §3.12). Настройка хоста, по умолчанию выкл., в рейтинговой — выкл.
// Видно: своя (командная) территория и клетки в радиусе R от своих фигур, городов и Сторожевых башен (у Всадника — Rk), Чебышёв.
// Разведанные клетки помнят рельеф и города, но не показывают фигуры. В 2×2 видимость общая на команду.
// Сервер вырезает из состояния всё, чего команда не видит (фигуры, события, чужие каналы поселения, ОЗ построек) — подсмотреть в коде страницы нельзя.
import { territory } from "./econ";
import type { GameState, StratCfg } from "./rules";

export type FogCfg = { r: number; rKnight: number; rCity: number; rTower: number };
export const FOG0: FogCfg = { r: 3, rKnight: 4, rCity: 1, rTower: 3 };
export const fogCfg = (cfg: StratCfg): FogCfg => ({ ...FOG0, ...((cfg.econ as any).fog || {}) });

/** Маска видимости команды viewer (1 — видно). sameTeam(a, b) — союзники. viewer < 0 (зритель) — ничего. */
export function visMask(g: GameState, viewer: number, sameTeam: (a: number, b: number) => boolean, cfg: StratCfg): Uint8Array {
  const n = g.size, V = new Uint8Array(n * n); if (viewer < 0) return V;
  const F = fogCfg(cfg), mine = (o: number) => o >= 0 && sameTeam(o, viewer);
  const disc = (cx: number, cy: number, r: number) => { for (let y = Math.max(0, cy - r); y <= Math.min(n - 1, cy + r); y++) for (let x = Math.max(0, cx - r); x <= Math.min(n - 1, cx + r); x++) V[y * n + x] = 1; };
  if (g.ec) { const T = territory(g, cfg); for (let i = 0; i < T.length; i++) if (T[i] >= 0 && mine(T[i])) V[i] = 1;
    for (const c of g.ec.cities) if (mine(c.owner)) disc(c.x, c.y, F.rCity);
    for (const t of g.ec.towers || []) if (mine(t.owner)) disc(t.x, t.y, F.rTower); }
  for (const p of g.pieces) if (mine(p.owner)) disc(p.x, p.y, p.kind === "knight" ? F.rKnight : F.r);
  return V;
}
export const toHex = (M: Uint8Array) => { let s = ""; for (let i = 0; i < M.length; i += 4) s += (M[i] | (M[i + 1] << 1) | (M[i + 2] << 2) | (M[i + 3] << 3)).toString(16); return s; };
export function fromHex(s: string, len: number): Uint8Array { const M = new Uint8Array(len); for (let k = 0; k < s.length; k++) { const v = parseInt(s[k], 16) || 0; for (let b = 0; b < 4; b++) if (4 * k + b < len) M[4 * k + b] = (v >> b) & 1; } return M; }
/** Память разведки: seen |= vis (возвращает новую hex-строку). */
export function mergeSeen(seenHex: string | undefined, vis: Uint8Array): string { const S = fromHex(seenHex || "", vis.length); for (let i = 0; i < vis.length; i++) if (vis[i]) S[i] = 1; return toHex(S); }

const PIECE_EV = new Set(["move", "hit", "kill", "burn", "heal", "promote", "ability", "zap", "chief_up", "lvl", "talent", "xp"]);
/** Урезать уже собранный вид (out = stateFor: g, ev, bhp, towers, check) под туман зрителя viewer. Не мутирует исходные объекты игры. */
export function fogRedact(out: any, g: GameState, viewer: number, sameTeam: (a: number, b: number) => boolean, vis: Uint8Array, seen: Uint8Array) {
  const n = g.size, mine = (o: any) => typeof o === "number" && o >= 0 && viewer >= 0 && sameTeam(o, viewer);
  const at = (M: Uint8Array, x: any, y: any) => Number.isInteger(x) && Number.isInteger(y) && x >= 0 && y >= 0 && x < n && y < n && !!M[y * n + x];
  if (out.g) {
    out.g = { ...out.g, pieces: (out.g.pieces || []).filter((p: any) => mine(p.o) || at(vis, p.x, p.y)) };
    if (out.g.ec) { const ec = out.g.ec;
      out.g.ec = { ...ec, cities: ec.cities.filter((c: any) => mine(c.owner) || at(seen, c.x, c.y)).map((c: any) => mine(c.owner) || at(vis, c.x, c.y) ? c : (({ forge, bhp, sg, acted, claims, cw, tg, ...r }: any) => r)(c)),
        towers: (ec.towers || []).filter((t: any) => mine(t.owner) || at(seen, t.x, t.y)),
        fnd: Array.isArray(ec.fnd) ? ec.fnd.map((f: any, s: number) => (mine(s) ? f : null)) : ec.fnd }; }
  }
  const ids = new Set<number>((out.g?.pieces || []).map((p: any) => p.id)), city = new Map<number, any>((g.ec?.cities || []).map((c) => [c.id, c]));
  const seeId = (i: any) => typeof i === "number" && ids.has(i);
  if (Array.isArray(out.ev)) out.ev = out.ev.filter((e: any) => {
    if (!e || typeof e !== "object") return true;
    if (PIECE_EV.has(e.e)) { if (seeId(e.id) || seeId(e.t) || mine(e.o) || (e.e === "kill" && seeId(e.by))) return true; return typeof e.x === "number" && at(vis, e.x, e.y); }
    if (typeof e.x === "number" && typeof e.y === "number" && !mine(e.side) && !mine(e.o)) return at(vis, e.x, e.y);
    if (typeof e.city === "number") { const c = city.get(e.city); return !c || mine(c.owner) || at(vis, c.x, c.y); }
    return true;
  });
  if (Array.isArray(out.bhp)) out.bhp = out.bhp.filter((b: any) => { const c = city.get(b.city); return !c || mine(c.owner) || at(vis, c.x, c.y); });
  if (Array.isArray(out.towers)) out.towers = out.towers.filter((t: any) => mine(t.owner) || at(seen, t.x, t.y));
  if (Array.isArray(out.check)) out.check = out.check.map((v: any, s: number) => (mine(s) ? v : false));
  out.fog = { vis: toHex(vis), seen: toHex(seen) };
  return out;
}
/** t1247: в тумане бить можно только видимую команде цель (иначе подход Ладьи/Ферзя «на ощупь» раскрывал бы скрытые фигуры). */
export function fogAttackOk(g: GameState, seat: number, act: { a: string; x?: number; y?: number }, sameTeam: (a: number, b: number) => boolean, cfg: StratCfg): boolean {
  if (act.a !== "attack") return true; const x = act.x! | 0, y = act.y! | 0; if (x < 0 || y < 0 || x >= g.size || y >= g.size) return false;
  return visMask(g, seat, sameTeam, cfg)[y * g.size + x] === 1;
}
