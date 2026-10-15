import { CURSE, cursedStats } from "./cursed";
import { dropChance } from "./profile";
// Библиотека предметов (только сервер): фиксированный пул предметов с уникальными id — из defs.ts (бестиарий).
// Строки для D1-таблицы item_library, хеш версии пула и «публичная карточка» предмета, которую сервер
// присылает клиенту ТОЛЬКО для открытых игроком предметов (встречен в добыче или получен).
import { ITEMS, ITEM_BY_ID, MONSTER_LOOT, LOOKS, ZONE_MOBS, ABILITY_BY_ID, RECIPES, RARITIES, BALANCE, type ItemDef } from "./defs";
import { MOB_SKILLS } from "./mobSkills";

// источники: какие мобы роняют предмет и с каким шансом (+ ремесло/квест)
const SOURCES: Record<string, { mob: string; chance: number; kind: string }[]> = {};
for (const [key, m] of Object.entries(MONSTER_LOOT)) if (!["run_fly", "run_moth", "run_glitch"].includes(key)) for (const g of m.gear) (SOURCES[g.item] = SOURCES[g.item] || []).push({ mob: key, chance: g.chance, kind: m.kind });
for (const r of RECIPES) (SOURCES[r.item] = SOURCES[r.item] || []).push({ mob: "craft:" + r.id, chance: 100, kind: "craft" });

export function itemSources(id: string) { return SOURCES[id] || []; }

export function libraryRows() {
  return ITEMS.map((it) => ({
    id: it.id, name: it.name, slot: it.slot, rarity: it.rarity, item_level: it.lvl || 1, req_level: it.req || 1, wtype: it.wtype || null,
    stats: JSON.stringify(it.stats), affixes: JSON.stringify([]), props: JSON.stringify({ classes: it.classes || null, band: it.band || null }),
    grants_ability: it.grantsAbility || null, set_id: it.monster || null, look_id: it.look || null,
    sources: JSON.stringify(itemSources(it.id)), description: it.lore, icon: it.icon, version: 1,
  }));
}

export function rarityRows() {
  return Object.entries(RARITIES).map(([id, r]) => ({ id, name: r.name, sort: r.order, color: r.color, budget_mult: BALANCE.RARITY_BUDGET[id], dmg_mult: BALANCE.RARITY_DMG[id],
    drop_pct_mob: BALANCE.DROP_PCT[id], drop_pct_rare: BALANCE.RARE_DROP_PCT[id], drop_pct_boss: BALANCE.BOSS_DROP_PCT[id] }));
}
export function mobRows() {
  return Object.entries(MONSTER_LOOT).filter(([k]) => !["run_fly", "run_moth", "run_glitch"].includes(k)).map(([id, m]) => {
    const z = ZONE_MOBS[id.replace(/^run_/, "")];
    return { id, name: m.name, lvl: m.lvl || z?.lvl || 1, tier: m.tier || z?.tier || 1, role: m.role || z?.role || "melee", size: m.size || z?.size || "s", kind: m.kind,
      rare: m.rare ? 1 : 0, stats: JSON.stringify(m.stats), where_tags: JSON.stringify(m.where || []), look_id: m.look?.id || null, description: (m.abilitiesText || []).join(" ") };
  });
}
export function dropRows() {
  const out: any[] = [];
  for (const r of mobRows()) {
    const m = MONSTER_LOOT[r.id];
    for (const g of m.gear) out.push({ mob_id: r.id, kind: "item", ref_id: g.item, chance: g.chance, min_qty: 1, max_qty: 1, conditions: JSON.stringify(ITEM_BY_ID[g.item]?.grantsAbility ? { setPiece: true } : {}) });
    for (const x of m.materials) out.push({ mob_id: r.id, kind: "res", ref_id: x.res, chance: x.chance, min_qty: x.qty[0], max_qty: x.qty[1], conditions: "{}" });
  }
  return out;
}

// FNV-1a (2×32 бит) по каноническому JSON пула — синхронно и одинаково в Worker и Node
export function libraryHash(): string {
  const s = JSON.stringify([libraryRows(), rarityRows(), mobRows(), dropRows()]);
  let h1 = 0x811c9dc5, h2 = 0x01000193 ^ s.length;
  for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); h1 = Math.imul(h1 ^ c, 16777619); h2 = Math.imul(h2 ^ c, 2246822519) >>> 0; }
  return (h1 >>> 0).toString(16).padStart(8, "0") + (h2 >>> 0).toString(16).padStart(8, "0");
}

// Сид всех справочных таблиц (items, rarities, mobs, mob_drops) — одинаковые операторы для миграции 0002 и самосева при старте
export const SEED_COLS = {
  rarities: ["id", "name", "sort", "color", "budget_mult", "dmg_mult", "drop_pct_mob", "drop_pct_rare", "drop_pct_boss"],
  mobs: ["id", "name", "lvl", "tier", "role", "size", "kind", "rare", "stats", "where_tags", "look_id", "description"],
  items: ["id", "name", "slot", "rarity", "item_level", "req_level", "wtype", "stats", "affixes", "props", "grants_ability", "set_id", "look_id", "sources", "description", "icon", "version"],
  mob_drops: ["mob_id", "kind", "ref_id", "chance", "min_qty", "max_qty", "conditions"],
} as const;
export const SEED_PK: Record<string, string> = { rarities: "id", mobs: "id", items: "id", mob_drops: "mob_id, kind, ref_id" };
export function seedTables(): [string, any[]][] { return [["rarities", rarityRows()], ["mobs", mobRows()], ["items", libraryRows()], ["mob_drops", dropRows()]]; }

// Публичная карточка открытого предмета (то, что видит клиент)
export function itemCard(id: string) {
  const it: ItemDef | undefined = ITEM_BY_ID[id];
  if (!it) return null;
  const look = it.look ? LOOKS[it.look] : null;
  const ab = it.grantsAbility ? ABILITY_BY_ID[it.grantsAbility] : null;
  return {
    n: ITEM_INDEX[it.id], id: it.id, name: it.name, slot: it.slot, rarity: it.rarity, lvl: it.lvl || 1, req: it.req || 1, wtype: it.wtype || null, stats: it.stats, cstats: cursedStats(it.stats), icon: it.icon, // cstats — статы проклятой версии (база × CURSE.statMult)
    lore: it.lore, classes: it.classes || null, band: it.band || null, monster: it.monster || null, monsterName: it.monster ? ZONE_MOBS[it.monster]?.name || null : null,
    look: look ? { id: look.id, name: look.name, bonus: look.bonus, parts: look.parts.length } : null,
    ability: ab ? { id: ab.id, name: ab.name, icon: ab.icon, desc: ab.desc, cd: ab.cd } : null,
    sources: itemSources(id).map((s) => ({ mob: s.mob, name: s.mob.startsWith("craft:") ? "Ремесло у Петра" : (ZONE_MOBS[s.mob.replace(/^run_/, "")]?.name || s.mob) + (s.mob.startsWith("run_") ? " (забег)" : ""), chance: s.mob.startsWith("craft:") ? s.chance : Math.min(100, s.chance * CURSE.equipDropMult) })),
  };
}
// Силуэт закрытого предмета: только слот и ярус (без id, имени, статов) — порядковый номер в пуле
export function itemSilhouette(idx: number) {
  const it = ITEMS[idx];
  return { n: idx, slot: it.slot, rarity: it.rarity, tier: Math.max(1, Math.min(5, Math.ceil((it.lvl || 1) / 5))) };
}
export const LIBRARY_SIZE = ITEMS.length;
export const ITEM_INDEX: Record<string, number> = Object.fromEntries(ITEMS.map((it, i) => [it.id, i]));

// Пул дропа моба для Библиотеки мобов: открытые предметы — по id, закрытые — только номер силуэта, слот, редкость и шанс
export function mobDropView(mob: string, known: (id: string) => boolean) {
  const m = MONSTER_LOOT[mob];
  if (!m) return null;
  return {
    gear: m.gear.map((g) => { const it = ITEM_BY_ID[g.item]; const chance = dropChance(g); return known(g.item) ? { id: g.item, chance } : { n: ITEM_INDEX[g.item], slot: it?.slot, rarity: it?.rarity, chance }; }),
    res: m.materials.map((r) => ({ res: r.res, chance: r.chance, qty: r.qty })),
  };
}
// Статы моба для Бестиария — из тех же данных, что использует сервер (ZONE_MOBS с правками админки из D1)
export function mobStatView(mob: string) {
  const z: any = (ZONE_MOBS as any)[mob], l: any = MONSTER_LOOT[mob];
  if (z) return { lvl: z.lvl, hp: Math.round(z.hp), dmg: z.dmg, armor: z.armor || 0, speed: z.speed, aggro: z.aggro, xp: z.xp, skills: (z.skills || []).map((k: string) => MOB_SKILLS[k]?.name || k) };
  if (l) return { lvl: l.lvl, hp: l.stats?.hp, dmg: l.stats?.dmg, armor: l.stats?.armor, skills: [] };
  return null;
}
export const SILHOUETTES = ITEMS.map((_, i) => { const s = itemSilhouette(i); return [s.slot, s.rarity, s.tier]; });
