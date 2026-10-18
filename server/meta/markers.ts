// «Проклятые»: общий реестр объектов карты (сервер и клиент). Любой объект, внесённый сюда (registerMarker),
// автоматически появляется на большой карте (M) и мини-карте — под туманом войны, т.е. только в разведанных местах.
// Сейчас: таблички (по одной у «семени» каждого пятна биома + в хабе), порталы, NPC, логова мировых боссов.
import { STATIC_NPCS as NPCS } from "./shared";
import { WORLD_GEN, ARINAR_PATCHES } from "./zoneGen";
import { WORLD_PORTALS } from "../worlds/portals";
import { ARINAR_HUB } from "../worlds/sizes";

export type MarkerType = "sign" | "portal" | "npc" | "boss" | (string & {});
export interface MapMarker { id: string; type: MarkerType; world: string; x: number; y: number; icon: string; label: string; color?: string }
const REG = new Map<string, MapMarker>();
const listeners = new Set<() => void>();
export function registerMarker(m: MapMarker) { REG.set(m.id, m); listeners.forEach((f) => f()); return m; }
export function unregisterMarker(id: string) { REG.delete(id); listeners.forEach((f) => f()); }
export function markersOf(world: string, type?: string): MapMarker[] { return [...REG.values()].filter((m) => m.world === world && (!type || m.type === type)); }
export function onMarkers(f: () => void) { listeners.add(f); return () => listeners.delete(f); }
export const MARKER_STYLE: Record<string, { icon: string; color: string }> = {
  sign: { icon: "🪧", color: "#fde68a" }, portal: { icon: "🌀", color: "#818cf8" }, npc: { icon: "💬", color: "#f9a8d4" }, boss: { icon: "☠", color: "#f0abfc" },
};

// --- живое состояние мировых боссов (сервер → zone_state.wb раз в несколько секунд): жив / через сколько возродится ---
export interface BossState { alive: boolean; at: number; type?: string }
export const BOSS_STATE = new Map<string, BossState>();
/** list: [ключ логова, жив 0/1, секунд до появления, тип] */
export function setBossState(list: [string, number, number, string?][], now = Date.now()) {
  for (const [k, a, s, t] of list) BOSS_STATE.set("boss:" + k, { alive: !!a, at: now + Math.max(0, s) * 1000, type: t });
  listeners.forEach((f) => f());
}
export function bossStatus(m: MapMarker, now = Date.now()): { alive: boolean; text: string } | null {
  const st = m.type === "boss" ? BOSS_STATE.get(m.id) : null; if (!st) return null;
  if (st.alive) return { alive: true, text: "жив" };
  const s = Math.max(0, Math.round((st.at - now) / 1000)), h = Math.floor(s / 3600), mm = Math.floor((s % 3600) / 60), ss = s % 60;
  return { alive: false, text: s <= 0 ? "вот-вот" : h ? `${h}:${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}` : `${mm}:${String(ss).padStart(2, "0")}` };
}

// --- встроенные объекты ---
registerMarker({ id: "sign:hub", type: "sign", world: "arinar", x: ARINAR_HUB.x - 120, y: ARINAR_HUB.y - 160, icon: "🪧", label: "Гранатовый двор — сердце Аринара" });
for (const P of ARINAR_PATCHES) {
  const seed = P.cells.find((c: any) => c.seed) || P.cells[0];
  const nm = seed.name.replace(/\s*\(.*\)$/, "");
  registerMarker({ id: `sign:patch${P.idx}`, type: "sign", world: "arinar", x: P.x - 260, y: P.y + 200, icon: "🪧", label: `${nm} · ур. ${seed.lvl[0]}–${seed.lvl[1]}` });
}
for (const p of WORLD_PORTALS as any[]) if (p.x != null) registerMarker({ id: `portal:${p.id}`, type: "portal", world: p.world || "hellfire", x: p.x, y: p.y, icon: "🌀", label: p.name || p.label || p.id });
for (const [id, n] of Object.entries(NPCS)) registerMarker({ id: `npc:${id}`, type: "npc", world: n.world, x: n.x, y: n.y, icon: "💬", label: `${n.name} — ${n.title}`, color: n.color });
for (const b of WORLD_GEN.arinar.bosses) registerMarker({ id: `boss:${b.key || b.type}`, type: "boss", world: "arinar", x: b.x, y: b.y, icon: "☠", label: `Логово босса ${b.where}` });
