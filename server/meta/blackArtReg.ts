// Серверный реестр артефактов (чёрная магия): артефакт — строка items с id art_<12hex>, slot weapon, wtype artifact,
// props.bm — снимок сборки (части, чёрные статы, форма удара, навыки). Регистрируется в ITEM_BY_ID при загрузке профиля
// (store.loadD1 дочитывает такие строки из items ДО фильтра инвентаря — иначе созданная игроком вещь пропала бы из сумки).
import { ITEM_BY_ID, ITEM_WTYPE } from "./defs";
import { BM_PARTS, BMA_CFG, computeArtifact, artRarity, capBm, bmZero, type ArtInfo } from "./blackArt";

export const ART_RE = /^art_[0-9a-f]{12}$/;
export const isArtifactId = (id: any) => typeof id === "string" && ART_RE.test(id);
export const ART_WTYPE = "artifact";

function hex12(): string {
  const b = new Uint8Array(6); (globalThis.crypto as any).getRandomValues(b);
  return [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
}
function safeJson(s: any, d: any) { if (s && typeof s === "object") return s; try { return JSON.parse(String(s || "")); } catch { return d; } }

/** собрать определение предмета-артефакта; bm — снимок (ответ 4) */
export function artItemDef(id: string, name: string, rarity: string, lvl: number, icon: string, lore: string, bm: ArtInfo): any {
  return { id, name, slot: "weapon", rarity, stats: {}, lore, icon, lvl, req: 1, wtype: ART_WTYPE, bm, art: 1 };
}
export function registerArtifact(def: any) { ITEM_BY_ID[def.id] = def; ITEM_WTYPE[def.id] = ART_WTYPE; return def; }
/** строка таблицы items → ITEM_BY_ID. Неверная/без снимка — null (вещь останется в D1, но не в игре). */
export function registerArtifactRow(r: any): any | null {
  if (!r || !isArtifactId(r.id)) return null;
  const props = safeJson(r.props, {}), bm = props?.bm;
  if (!bm || !bm.parts || !bm.stats || !bm.atk) return null;
  const st = { ...bmZero(), ...bm.stats };
  const def = registerArtifact(artItemDef(r.id, String(r.name || "Артефакт"), String(r.rarity || "rare"), Number(r.item_level) || 1, String(r.icon || "🔥"), String(r.description || ""),
    { parts: bm.parts, stats: st, atk: bm.atk, cd: Number(bm.cd) || 600, skills: Array.isArray(bm.skills) ? bm.skills : [], elem: bm.elem || "fire", ranged: !!bm.ranged }));
  if (props.author) def.author = String(props.author); if (props.created) def.created = Number(props.created) || 0; if (props.src) def.src = String(props.src);
  return def;
}
/** значения для INSERT в items */
export function artifactRow(def: any): any[] {
  return [def.id, def.name, "weapon", def.rarity, def.lvl || 1, def.req || 1, ART_WTYPE, "{}", JSON.stringify({ bm: def.bm, art: 1, v: 1, ...(def.author ? { author: def.author } : {}), ...(def.created ? { created: def.created } : {}), ...(def.src ? { src: def.src } : {}) }), def.icon || "🔥", def.lore || ""];
}
export const ARTIFACT_INSERT = "INSERT OR IGNORE INTO items (id, name, slot, rarity, item_level, req_level, wtype, stats, props, icon, description) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)";
export const ARTIFACT_SELECT = "SELECT id, name, slot, rarity, item_level, req_level, wtype, stats, props, icon, description FROM items WHERE id IN ";
export const ARTIFACT_UPDATE = "UPDATE items SET props = ?, rarity = ? WHERE id = ?";

/** новый артефакт из частей (сборка/тест). null — неверная сборка. */
export function makeArtifact(parts: Record<string, string>, name?: string, meta?: { author?: string; src?: string; lore?: string }): any | null {
  const bm = computeArtifact(parts); if (!bm) return null;
  const blade = BM_PARTS[parts.blade], ice = bm.elem === "ice";
  const id = "art_" + hex12();
  const lvl = Math.max(1, ...Object.values(parts).map((p) => Number(BM_PARTS[p]?.lvl) || 1));
  const def = registerArtifact(artItemDef(id, name || (ice ? (blade?.ranged ? "Ледяной клинок осколков" : "Ледяное лезвие инея") : blade?.ranged ? "Огненный клинок искр" : "Огненное лезвие пепла"),
    artRarity(parts), lvl, blade?.ranged ? "🏹" : ice ? "❄" : "🔥",
    meta?.lore || `Артефакт чёрной магии (${bm.elems ? "огонь и лёд" : ice ? "лёд" : "огонь"}).`, bm));
  def.created = Date.now(); if (meta?.author) def.author = meta.author; if (meta?.src) def.src = meta.src;
  return def;
}
/** модерация: скрыть имя артефакта игрока */
export const ART_HIDDEN_NAME = "Безымянный артефакт";
export const ARTIFACT_RENAME = "UPDATE items SET name = ? WHERE id = ?";
/** чёрные статы артефакта (с капами): ТОЛЬКО неизменяемый слепок, сохранённый при создании (решение Алекса t994u/t996u).
 *  Правки деталей, настроек и «Пересчитать все» созданные артефакты не меняют — даже «ошибочно сильные» остаются как есть.
 *  Капы (BMA_CFG.caps) — общий предохранитель боя, не пересчёт: применяются при чтении, слепок в D1 не трогают. */
export function artInfo(itemId: string | null | undefined): ArtInfo | null {
  const d: any = itemId ? ITEM_BY_ID[itemId] : null; if (!d?.bm) return null;
  return { ...d.bm, stats: capBm(d.bm.stats) };
}
/** УСТАРЕЛО (t996u): созданные артефакты — неизменяемый слепок, «Пересчитать все» их не трогает. Оставлено только для
 *  ручной миграции разработчиком; из админки/сервиса не вызывается. */
export function recalcAllArtifacts(): any[] {
  const out: any[] = [];
  for (const d of Object.values(ITEM_BY_ID) as any[]) {
    if (!d?.bm || !isArtifactId(d.id)) continue;
    const n = computeArtifact(d.bm.parts); if (!n) continue;
    if (JSON.stringify(n) !== JSON.stringify(d.bm)) { d.bm = n; d.rarity = artRarity(n.parts); out.push(d); }
  }
  return out;
}
