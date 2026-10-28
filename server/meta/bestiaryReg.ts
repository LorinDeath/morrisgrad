// Реестр Бестиария: ВСЁ, что реально появляется в игре, вычисляется из источников спавна (не из ручного списка).
// Открытый мир — таблицы регионов (лагеря, вожаки, кочевники, фоновые стаи; zoneTables.ts по тегам where), фиксированные
// спавны хаба, логова мировых боссов, редкие Отголоски, свита боссов при смене фазы (summonPool); забеги и испытания —
// волны/элита/боссы комнат survivors/data.js. Новый моб/босс (в т. ч. правкой админки таблиц/таймеров) попадает в реестр сам.
// Группы (вкладки Бестиария в игре и на сайте, фильтры админки): mob — обычные виды (и варианты биомов — отдельными карточками),
// elite — элита забегов/испытаний (ROOM_ELITES), chief — вожаки лагерей (сильнейший вид таблицы региона, campChiefType),
// rare — редкие именные Отголоски, boss — боссы забегов/испытаний, world — мировые боссы (логова и таймеры).
// Категорию любого вида можно переопределить в админке (Бестиарий → «Категория», game_overrides mob.cat).
// Элита/вожак «в рамке» у обычного вида — экземпляр: его убийство засчитывается в карточку вида. Только сервер (таблицы регионов есть лишь на сервере).
import "./zoneTables";
import { ZONE_MOBS, HUB_SPAWNS, campChiefType } from "./defs";
import { WORLD_GEN, BOSS_TIMERS } from "./zoneGen";
import { summonPool } from "./biomes";
import { WORLD_NAMES } from "./mobHome";
import { BM_CAMPS, BMM_CFG } from "./blackMobs";
import { RUN_ROOMS, ROOM_WAVES, ROOM_BOSS, ROOM_ELITES, TRIAL_WAVES, ENEMIES } from "../../src/pages/MorrisCurse/_core/survivors/data.js";

export type BGroup = "mob" | "elite" | "chief" | "rare" | "boss" | "world" | "black";
export const BGROUPS: BGroup[] = ["mob", "elite", "chief", "rare", "boss", "world", "black"];
export const BGROUP_RU: Record<BGroup, string> = { mob: "Мобы", elite: "Элита", chief: "Вожаки", rare: "Редкие", boss: "Боссы", world: "Мировые боссы", black: "Чёрные" };
/** вожаки лагерей: вид → регионы, где он стоит в центре лагеря (для отчёта/админки) */
export function campChiefs(): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const [wid, G] of Object.entries(WORLD_GEN) as [string, any][]) for (const r of G.regions || []) {
    if (!r.table?.length || r.dens === 0) continue; const t = campChiefType(r.table); if (!t) continue;
    const l = out.get(t) || [], n = `${WORLD_NAMES[wid] || wid} · ${region(r.name)}`; if (!l.includes(n)) l.push(n); out.set(t, l);
  }
  return out;
}
/** категория по умолчанию (без правки админки) — для реестра и фильтров админки */
const ELITE_RUN = new Set(Object.values(ROOM_ELITES as any).flat() as string[]);
export interface BEntry { id: string; g: BGroup; g0?: BGroup; lvl: number; where: string[]; name?: string; resp?: [number, number] } // resp — окно возвращения редкого Отголоска, сек (для подсказки в «???»)

const R: any = RUN_ROOMS, EN: any = ENEMIES;
/** виды только забегов/испытаний (нет в мире): «Отражение Кьют» — запись Бестиария есть, лута/статов мира нет */
export const ARENA_ONLY: Record<string, { name: string; boss: boolean; lvl: number }> = Object.fromEntries(
  Object.entries(EN).filter(([id]) => !(ZONE_MOBS as any)[id]).map(([id, e]: [string, any]) => [id, { name: e.name, boss: !!e.boss, lvl: e.lvl || 10 }]));
/** ключ Бестиария для убийства в забеге/испытании: вид мира или вид только арены; иначе — не пишется */
export const arenaKey = (type: string): string | null => ((ZONE_MOBS as any)[type] || ARENA_ONLY[type] ? type : null);

/** волна испытания с боссом (TRIAL_WAVES): раньше неё босс в Бестиарий не пишется */
export const TRIAL_BOSS_WAVE = Math.max(1, (TRIAL_WAVES as any[]).findIndex((w) => Object.keys(w).some((t) => (ZONE_MOBS as any)[t]?.boss || (ENEMIES as any)[t]?.boss)) + 1);
const region = (n: string) => String(n || "").replace(/\s*\([^)]*пятно[^)]*\)\s*$/, "").split(":")[0].trim(); // «Синее пламя: Тлеющие поля (СЗ, пятно 2)» → «Синее пламя»
const regionAt = (G: any, x: number, y: number) => G.regions.find((r: any) => x >= r.rect[0] && x < r.rect[2] && y >= r.rect[1] && y < r.rect[3]);
const roomName = (room: string) => (R[room]?.mode ? "Испытание: " : "Забег: ") + (R[room]?.name || room);

export function bestiaryRegistry(): BEntry[] {
  const resp = new Map<string, [number, number]>(), where = new Map<string, Set<string>>(), boss = new Set<string>(), world = new Set<string>(), rare = new Set<string>();
  const add = (id: string, w: string) => { if (!id) return; let s = where.get(id); if (!s) where.set(id, (s = new Set())); if (w && s.size < 4) s.add(w); };
  for (const [wid, G] of Object.entries(WORLD_GEN) as [string, any][]) {
    const W = WORLD_NAMES[wid] || wid;
    for (const r of G.regions) for (const row of r.table || []) add(row.type, `${W} · ${region(r.name)}`);
    for (const b of G.bosses || []) { world.add(b.type); const rg = regionAt(G, b.x, b.y); add(b.type, `${W} · логово${rg ? ": " + region(rg.name) : ""}`); }
    for (const r of G.rares || []) {
      rare.add(r.type); if (r.every) resp.set(r.type, [r.every[0], r.every[1]]);
      const rg = G.regions.find((x: any) => x.id === r.region || x.kind === r.region); // как в zone.ts: регион или пятна биома
      add(r.type, `${W} · ${rg ? region(rg.name) : "редкое появление"}`);
    }
    for (const b of G.bosses || []) { const d: any = (ZONE_MOBS as any)[b.type]; if (d) for (const t of summonPool(ZONE_MOBS, d)) add(t, `свита: ${d.name}`); }
  }
  for (const s of HUB_SPAWNS) add(s.type, `${WORLD_NAMES.hellfire} · у портала`);
  // 👹 чёрные мобы конструктора: в реестре, только если стоят во включённом лагере (снятый с публикации — нет)
  const black = new Set<string>();
  if (BMM_CFG.on) for (const c of Object.values(BM_CAMPS)) { if (c.hidden) continue; for (const t of [c.chief, ...(c.mobs || []).map((x) => x.mob)]) { const z: any = (ZONE_MOBS as any)[t]; if (!z?.black || z.bmHidden) continue; black.add(t); add(t, `${WORLD_NAMES[c.world] || c.world} · ${c.lair ? "логово" : "лагерь"}: ${c.name}`); } }
  for (const t of Object.values(BOSS_TIMERS)) { world.add(t.type); add(t.type, ""); }
  for (const room of Object.keys(R)) {
    const mix = room === "trial" ? (TRIAL_WAVES as any[]) : ((ROOM_WAVES as any)[room] || []).map((w: any) => w.mix);
    for (const m of mix) for (const t of Object.keys(m || {})) add(t, roomName(room));
    for (const t of (ROOM_ELITES as any)[room] || []) add(t, roomName(room));
    const bt = (ROOM_BOSS as any)[room]; if (bt) { boss.add(bt); add(bt, roomName(room)); }
  }
  for (const [id, e] of Object.entries(ARENA_ONLY)) if (e.boss) { boss.add(id); add(id, "Испытание отражений"); } // дуэль: «Нет соперника — выйдет отражение»
  const out: BEntry[] = [], chiefs = campChiefs();
  for (const [id, w] of where) {
    const z: any = (ZONE_MOBS as any)[id], a = ARENA_ONLY[id];
    if (!z && !a) continue;
    const g0: BGroup = black.has(id) || z?.black ? "black" : world.has(id) || BOSS_TIMERS[id] ? "world" : boss.has(id) || z?.boss ? "boss" : rare.has(id) || z?.rare ? "rare" : chiefs.has(id) ? "chief" : ELITE_RUN.has(id) ? "elite" : "mob";
    const g: BGroup = BGROUPS.includes(z?.cat) ? z.cat : g0; // правка админки (mob.cat) важнее
    out.push({ id, g, ...(g !== g0 ? { g0 } : {}), lvl: z?.lvl ?? a?.lvl ?? 1, where: [...w], ...(z ? {} : { name: a.name }), ...(resp.has(id) ? { resp: resp.get(id)! } : {}) });
  }
  return out;
}

/** категории всех видов для админки: { id: { g — действующая, g0 — по месту появления, why — почему вожак } } */
export function mobCategories(): Record<string, { g: BGroup; g0: BGroup; why?: string }> {
  const reg = new Map(bestiaryRegistry().map((e) => [e.id, e])), ch = campChiefs(), out: Record<string, any> = {};
  for (const [id, z] of Object.entries(ZONE_MOBS) as [string, any][]) {
    const e = reg.get(id), g0: BGroup = e ? e.g0 || e.g : z.black ? "black" : z.boss ? "world" : z.rare ? "rare" : ch.has(id) ? "chief" : ELITE_RUN.has(id) ? "elite" : "mob";
    const g: BGroup = BGROUPS.includes(z.cat) ? z.cat : g0;
    out[id] = { g, g0, ...(ch.has(id) ? { why: "сильнейший вид региона — стоит в центре лагеря: " + ch.get(id)!.slice(0, 4).join(", ") + (ch.get(id)!.length > 4 ? ` и ещё ${ch.get(id)!.length - 4}` : "") } : {}) };
  }
  return out;
}
