// «Проклятые»: общие (сервер + клиент) определения прогрессии по плану автора (DESIGN-month-plan.md).
// Сервер — единственный источник истины: требования, цены, статы предметов, шансы дропа,
// прогресс квестов и награды считаются ТОЛЬКО на сервере (server/meta/*.ts).
// Клиент импортирует файл лишь для отображения (тултипы, деревья, тексты квестов, бестиарий).
//
// Модель хранения:
//  • герой (warrior/spearman/rogue/mage) качается ОТДЕЛЬНО: уровень, опыт, очки талантов, таланты,
//    навыки и их Сияние, раскладка навыков, надетая экипировка (5 слотов) — всё своё у каждого героя;
//  • аккаунт: общая сумка предметов и материалы, кошелёк звёзд, очки Создания и ветка души,
//    сюжет/квесты, бестиарий. Баланс и капы — docs/MORRISCURSE-BALANCE.md.
// defs.ts — ТОЛЬКО СЕРВЕР: всё из shared.ts + предметы, добыча, облики, ремесло, статы мобов.

import { CONTENT } from "./content";
import { withVariants, baseOf } from "./biomes";
import type { ItemDef, HeroId } from "./shared";
import { CLASS_WTYPE } from "./shared";
export * from "./shared";
export { BESTIARY, BESTIARY_BY_ID } from "./bestiary";
export * as BALANCE from "./balance";

export const ITEMS: ItemDef[] = [
  // Трофеи всех Отголосков (5 слотов на моба) — генерируются из бестиария (bestiary.ts → content.ts):
  // статы фиксированы и зависят только от уровня источника и редкости (balance.ts: itemBudget / weaponAvg).
  ...(CONTENT.items as ItemDef[]),
  // --- классовое / ремесло ---
  { id: "greenpoise_bow", name: "Лук Гринпойса", slot: "weapon", rarity: "uncommon", classes: ["spearman", "rogue"], stats: { dmgMin: 7, dmgMax: 10 }, icon: "🏹", band: "ремесло", lvl: 5, req: 5, wtype: "bow", lore: "Из диких земель истребления. Тетива поёт на ветру." },
  { id: "guard_axe", name: "Секира Стража", slot: "weapon", rarity: "rare", classes: ["warrior"], stats: { dmgMin: 8, dmgMax: 11, armor: 2 }, icon: "🪓", band: "ремесло", lvl: 6, req: 6, wtype: "axe", lore: "Выдаётся членам совета Стражей." },
  { id: "aezer_staff", name: "Посох эфира Аезера", slot: "weapon", rarity: "rare", classes: ["mage"], stats: { dmgMin: 8, dmgMax: 11, cdrPct: 3 }, icon: "🪄", band: "ремесло", lvl: 6, req: 6, wtype: "staff", lore: "Белые маги не любили вопросов." },
  { id: "padded_coat", name: "Стёганая куртка", slot: "armor", rarity: "common", stats: { armor: 2, hp: 5 }, icon: "🧥", band: "старт", lvl: 1, req: 1, lore: "Тёплая. Это главное." },
  { id: "melveldil_sandals", name: "Сандалии Мэлвелдила", slot: "legs", rarity: "rare", stats: { speedPct: 7, regen: 0.2 }, icon: "👡", band: "ремесло", lvl: 5, req: 5, lore: "Лэйр говорит: в них земля сама толкает вперёд." },
];
// требование уровня = уровень предмета (если не задано строже); попадает в D1 items.req_level через library.ts
for (const it of ITEMS) { it.lvl = Math.max(1, it.lvl || 1); it.req = Math.max(it.req || 1, it.lvl); }
export const ITEM_BY_ID: Record<string, ItemDef> = Object.fromEntries(ITEMS.map((i) => [i.id, i]));

// ---------------- монстры: «что есть у монстра — то можно забрать» ----------------
// Каждый враг сам описывает: свои вещи (по слотам) с шансами, материалы, облик (полный комплект → вы
// выглядите как он) и навыки (даются надетым трофеем). Бросок — на сервере. Шансы — в процентах.
export interface MonsterLoot {
  name: string; kind: "zone" | "run" | "boss"; lvl?: number; tier?: number; size?: string; role?: string; rare?: boolean; where?: string[]; lore?: string;
  stats: { hp: number; dmg: number; armor: number; speed: string };
  abilitiesText: string[];
  gear: { item: string; chance: number }[];
  materials: { res: string; chance: number; qty: [number, number] }[];
  look?: { id: string; name: string; parts: string[]; bonus: string; stat?: Record<string, number> };
  abilities?: string[];
}
export const MONSTER_LOOT: Record<string, MonsterLoot> = { ...(CONTENT.loot as any), ...(CONTENT.runLoot as any) };
// старые ключи забегов (совместимость): мошка/мотылёк/слизь забега
MONSTER_LOOT.run_fly = MONSTER_LOOT.run_blade_fly; MONSTER_LOOT.run_moth = MONSTER_LOOT.run_dream_moth; MONSTER_LOOT.run_glitch = MONSTER_LOOT.run_rot_glitch;
// тип врага в забеге → таблица трофеев (в забегах шансы ниже, чем в открытом мире)
export const RUN_LOOT_KEY: Record<string, string> = Object.fromEntries(Object.keys(CONTENT.runLoot).map((k) => [k.slice(4), k]));
export const RUN_BOSS_BY_ROOM: Record<string, string> = { crypt: "warden", abyss: "moon_sentinel" };
export const LOOKS: Record<string, { id: string; name: string; parts: string[]; bonus: string; stat?: Record<string, number> }> =
  Object.fromEntries(Object.values(MONSTER_LOOT).filter((m) => m.look).map((m) => [m.look!.id, m.look!]));

// ---------------- ремесло (у Петра) ----------------
export const RECIPES: { id: string; item: string; cost: Record<string, number> }[] = [
  { id: "r_fly_legs", item: "fly_legs", cost: { fly_wing: 6, fly_chitin: 4 } },
  { id: "r_fly_carapace", item: "fly_carapace", cost: { fly_chitin: 8, fly_wing: 2 } },
  { id: "r_bow", item: "greenpoise_bow", cost: { dreamwood: 6, moonpetal: 2 } },
  { id: "r_axe", item: "guard_axe", cost: { dreamwood: 4, starsilver: 3 } },
  { id: "r_staff", item: "aezer_staff", cost: { dreamwood: 4, moonpetal: 4, soul_shard: 2 } },
  { id: "r_padded", item: "padded_coat", cost: { dreamwood: 3, moonpetal: 1 } },
  { id: "r_sandals", item: "melveldil_sandals", cost: { starsilver: 4, moonpetal: 4, dreamwood: 2 } },
];

// ---------------- Аринар → государство Мэлвелдил: общий мир с мобами и ресурсами ----------------
export const ZONE_WORLD = "arinar";
export interface ZoneMobDef { name: string; hp: number; dmg: number; speed: number; aggro: number; xp: number; radius: number; armor: number; color: string; boss?: boolean; lvl: number; tier: number; role: string; size: string; rare?: boolean; huge?: boolean; phases?: number }
// Все Отголоски мира: статы — из кривых balance.ts по уровню/роли/размеру (см. bestiary.ts)
export const ZONE_MOBS: Record<string, ZoneMobDef> = withVariants(CONTENT.zoneMobs as any); // + варианты биомов Аринара
export const ZONE_SPAWNS: { type: string; x: number; y: number; respawn: number }[] = [
  { type: "blade_fly", x: 420, y: 300, respawn: 20 }, { type: "blade_fly", x: 500, y: 250, respawn: 20 }, { type: "blade_fly", x: 560, y: 330, respawn: 20 },
  { type: "blade_fly", x: 700, y: 280, respawn: 20 }, { type: "blade_fly", x: 760, y: 360, respawn: 20 }, { type: "blade_fly", x: 640, y: 210, respawn: 20 },
  { type: "dream_moth", x: 300, y: 860, respawn: 30 }, { type: "dream_moth", x: 400, y: 940, respawn: 30 }, { type: "dream_moth", x: 230, y: 980, respawn: 30 },
  { type: "rot_glitch", x: 1000, y: 820, respawn: 22 }, { type: "rot_glitch", x: 1060, y: 900, respawn: 22 }, { type: "rot_glitch", x: 950, y: 960, respawn: 22 },
  { type: "moon_sentinel", x: 720, y: 1040, respawn: 480 },
];
export const ZONE_NODES: { type: string; res: string; x: number; y: number; respawn: number; qty: [number, number] }[] = [
  { type: "tree", res: "dreamwood", x: 160, y: 300, respawn: 35, qty: [1, 3] },
  { type: "tree", res: "dreamwood", x: 240, y: 420, respawn: 35, qty: [1, 3] },
  { type: "tree", res: "dreamwood", x: 1080, y: 300, respawn: 35, qty: [1, 3] },
  { type: "flower", res: "moonpetal", x: 520, y: 760, respawn: 40, qty: [1, 2] },
  { type: "flower", res: "moonpetal", x: 860, y: 520, respawn: 40, qty: [1, 2] },
  { type: "flower", res: "moonpetal", x: 160, y: 700, respawn: 40, qty: [1, 2] },
  { type: "crystal", res: "starsilver", x: 1100, y: 620, respawn: 60, qty: [1, 2] },
  { type: "crystal", res: "starsilver", x: 560, y: 1100, respawn: 60, qty: [1, 2] },
  { type: "ore", res: "rot_ore", x: 1120, y: 1060, respawn: 45, qty: [1, 2] },
];
// Поляна перевоплощения (хаб): несколько Мошкар-Жнецов на северном краю — первый бой пролога
export const HUB_SPAWNS: { type: string; x: number; y: number; respawn: number }[] = [
  { type: "blade_fly", x: 520, y: 150, respawn: 12 }, { type: "blade_fly", x: 600, y: 120, respawn: 12 }, { type: "blade_fly", x: 680, y: 160, respawn: 12 },
  { type: "blade_fly", x: 760, y: 130, respawn: 12 },
];
export const ITEM_WTYPE: Record<string, string> = Object.fromEntries(ITEMS.filter((i) => i.wtype).map((i) => [i.id, i.wtype!]));
export function weaponType(itemId: string | null | undefined, cls: string | null | undefined): string {
  return (itemId && ITEM_WTYPE[itemId]) || (cls && CLASS_WTYPE[cls]) || "book";
}


// Таблица трофеев есть у КАЖДОГО моба открытого мира (у вариантов биомов — копия базовой), чтобы в админке «Дроп»
// редактировался любой из ZONE_MOBS отдельно. Без правок админа дроп варианта совпадает с базовым (как было).
for (const [k, d] of Object.entries(ZONE_MOBS)) {
  if (MONSTER_LOOT[k]) continue;
  const b = MONSTER_LOOT[(d as any).base || ""];
  MONSTER_LOOT[k] = b
    ? { ...b, name: d.name, lvl: d.lvl, gear: b.gear.map((g) => ({ ...g })), materials: b.materials.map((r) => ({ ...r, qty: [...r.qty] as any })) }
    : { name: d.name, kind: "zone", lvl: d.lvl, stats: { hp: d.hp, dmg: d.dmg, armor: d.armor || 0, speed: String(d.speed) }, abilitiesText: [], gear: [], materials: [] } as any;
}
