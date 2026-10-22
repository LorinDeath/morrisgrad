// Сборка контента из бестиария: мобы мира (статы по кривым balance.ts), комплекты трофеев (предметы с
// фиксированными статами по уровню источника и редкости), таблицы добычи, материалы, облики и навыки монстров.
// Детерминированно (без случайности): одинаковый результат на сервере и клиенте.
import { BESTIARY, type MobSpec } from "./bestiary";
import { VARIANTS } from "./biomes";
import { weaponHitMult, AFFIX_MAX_SHARE, ITEM_LINE_CAP, mobStats, itemBudget, weaponAvg, STAT_COST, SLOT_PROFILE, ARCHETYPE_SLOT, itemReqLevel, DROP_PCT, BOSS_DROP_PCT, RARE_DROP_PCT, SET_PIECE_MULT, tierOf, type GearArchetype } from "./balance";

export interface GenItem {
  id: string; name: string; slot: string; rarity: string; stats: Record<string, number>; lore: string; icon: string;
  monster: string; look?: string; grantsAbility?: string; band: string; lvl: number; req: number; wtype?: string;
  from?: string; part?: string; // копия трофея под уровень варианта биома: from — вариант-источник, part — базовый предмет комплекта
}
export interface GenLoot {
  name: string; kind: "zone" | "run" | "boss"; lvl: number; tier: number; size: string; role: string; rare: boolean; where: string[];
  stats: { hp: number; dmg: number; armor: number; speed: string };
  abilitiesText: string[]; lore: string;
  gear: { item: string; chance: number }[];
  materials: { res: string; chance: number; qty: [number, number] }[];
  look?: { id: string; name: string; parts: string[]; bonus: string; stat?: Record<string, number> };
  abilities?: string[];
}
export interface GenZoneMob {
  name: string; hp: number; dmg: number; speed: number; aggro: number; xp: number; radius: number; armor: number; color: string;
  boss?: boolean; lvl: number; tier: number; role: string; size: string; rare?: boolean; huge?: boolean; phases?: number;
}

const SLOT_KEYS: [keyof MobSpec["gear"], string][] = [["w", "weapon"], ["h", "helmet"], ["a", "armor"], ["l", "legs"], ["g", "hands"]];
const SLOT_ICON: Record<string, string> = { helmet: "🪖", armor: "🛡️", legs: "🥾", hands: "🧤" };
const WTYPE_ICON: Record<string, string> = { spear: "🔱", daggers: "🗡️", book: "📖", staff: "🪄", sword: "⚔️", bow: "🏹", axe: "🪓", fly_blades: "🦿", moon_blade: "🌙" };
const SLOT_LORE: Record<string, string> = { weapon: "Оружие", helmet: "Снято с головы", armor: "Снято с плеч", legs: "Снято с лап", hands: "Снято с рук" };
const SPEED_WORD = (v: number) => (v >= 115 ? "очень быстрая" : v >= 90 ? "быстрая" : v >= 65 ? "средняя" : "медленная");
const BAND = (L: number) => `Мэлвелдил ${["I", "II", "III", "IV", "V"][tierOf(L) - 1]} · ур. ${L}`;

function hash(s: string): number { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }

const r1 = (v: number) => Math.round(v * 10) / 10;
export function statRound(k: string, v: number): number {
  if (k === "armor" || k === "hp" || k === "magnetPct") return Math.max(1, Math.round(v));
  if (k === "regen") return Math.max(0.1, r1(v));
  if (k === "lifestealPct") return Math.max(0.5, Math.round(v * 2) / 2);
  return Math.max(1, Math.round(v));
}

const ARCH_CYCLE: GearArchetype[] = ["tank", "bruiser", "assassin", "caster", "balanced"];
export function archetypeOf(seed: number): GearArchetype { return ARCH_CYCLE[seed % ARCH_CYCLE.length]; }
function capLines(st: Record<string, number>) { for (const k in st) if (ITEM_LINE_CAP[k] != null) st[k] = Math.min(ITEM_LINE_CAP[k], st[k]); return st; }
export function genItemStats(slot: string, L: number, rarity: string, seed: number, wtype?: string, arch?: GearArchetype): Record<string, number> {
  const b = itemBudget(L, rarity);
  const A = arch || archetypeOf(seed);
  const profs = (ARCHETYPE_SLOT[A] || SLOT_PROFILE)[slot] || SLOT_PROFILE[slot];
  const prof = profs[seed % profs.length];
  const st: Record<string, number> = {};
  if (slot === "weapon") {
    const avg = weaponAvg(L, rarity) * weaponHitMult(wtype); // равный DPS: секира бьёт крупно, кинжалы мелко
    // широкий min–max (±45%), L25 epic book min ≈ 150+
    st.dmgMin = Math.max(1, Math.round(avg * 0.55)); st.dmgMax = Math.max(st.dmgMin + 2, Math.round(avg * 1.45));
    // вторичные линии: с ростом уровня — больше статов
    const lines = L >= 15 ? 2 : 1;
    const keys = Object.entries(prof);
    for (let i = 0; i < Math.min(lines, keys.length); i++) {
      const [k, f] = keys[(seed + i) % keys.length];
      st[k] = statRound(k, (b * 0.35 * f) / (STAT_COST[k] || 1));
    }
    return capLines(st);
  }
  for (const [k, f] of Object.entries(prof)) st[k] = statRound(k, (b * Math.min(AFFIX_MAX_SHARE, f)) / (STAT_COST[k] || 1));
  // высокий уровень: доп. линия (crit или regen)
  if (L >= 12 && !st.critPct && seed % 2 === 0) st.critPct = statRound("critPct", (b * 0.12) / STAT_COST.critPct);
  if (L >= 18 && !st.lifestealPct && seed % 3 === 0) st.lifestealPct = statRound("lifestealPct", (b * 0.08) / STAT_COST.lifestealPct);
  return capLines(st);
}

export function buildContent() {
  const items: GenItem[] = [];
  const loot: Record<string, GenLoot> = {};
  const zoneMobs: Record<string, GenZoneMob> = {};
  const resources: Record<string, { name: string; icon: string; color: string }> = {};
  const abilities: any[] = [];
  const runLoot: Record<string, GenLoot> = {};
  for (const m of BESTIARY) {
    const kind: GenLoot["kind"] = m.size === "boss" || m.size === "huge" ? "boss" : m.where.every((w) => w.startsWith("run:")) ? "run" : "zone";
    const st = mobStats(m.lvl, m.role, m.size);
    const color = m.mats[0]?.[3] || "#a855f7";
    const speed = Math.round(72 * st.speedMult * (m.size === "s" ? 1 : m.size === "l" ? 0.85 : 0.7));
    const radius = m.size === "s" ? 13 : m.size === "l" ? 24 : m.size === "boss" ? 32 : 46;
    zoneMobs[m.id] = {
      name: m.name, hp: st.hp, dmg: st.dmg, speed, aggro: m.size === "s" ? 170 : 230, xp: st.xp, radius, armor: st.armor, color,
      boss: m.size === "boss" || m.size === "huge" || undefined, lvl: m.lvl, tier: tierOf(m.lvl), role: m.role, size: m.size,
      rare: m.rare || undefined, huge: m.size === "huge" || undefined, phases: m.boss?.phases,
    };
    for (const [id, name, icon, col] of m.mats) resources[id] = resources[id] || { name, icon, color: col };
    const table = m.size === "boss" || m.size === "huge" ? BOSS_DROP_PCT : m.rare ? RARE_DROP_PCT : DROP_PCT;
    const parts: string[] = [];
    const gear: { item: string; chance: number }[] = [];
    const lookId = m.look ? m.id : undefined;
    SLOT_KEYS.forEach(([k, slot], si) => {
      const spec = m.gear[k] as any;
      const name: string = spec[0], rarity: string = spec[1], wtype: string | undefined = k === "w" ? spec[2] : undefined;
      const id = m.legacy?.[k] || `${m.id}_${slot}`;
      const grants = k === "w" && m.ability ? m.ability.id : undefined;
      items.push({
        id, name, slot, rarity, stats: genItemStats(slot, m.lvl, rarity, hash(m.id) + si, wtype, archetypeOf(hash(m.id))), icon: k === "w" ? WTYPE_ICON[wtype!] || "⚔️" : SLOT_ICON[slot],
        lore: `${SLOT_LORE[slot]}: «${m.name}». ${m.lore}`, monster: m.id, look: lookId, grantsAbility: grants, band: BAND(m.lvl),
        lvl: m.lvl, req: itemReqLevel(m.lvl), wtype,
      });
      parts.push(id);
      gear.push({ item: id, chance: Math.round(table[rarity] * (grants && rarity !== "mythic" ? SET_PIECE_MULT : 1) * 1000) / 1000 });
    });
    const matChance = m.size === "s" ? 40 : 100;
    const materials = m.mats.map(([id], i) => ({ res: id, chance: i === 0 ? matChance : m.size === "s" ? 12 : 100, qty: (m.size === "s" ? [1, 2] : m.size === "l" ? [2, 4] : [3, 6]) as [number, number] }));
    if (m.size !== "s" || m.lvl >= 11) materials.push({ res: "soul_shard", chance: m.size === "s" ? 4 : 100, qty: m.size === "s" ? [1, 1] : [2, 5] });
    if (m.ability) {
      abilities.push({ id: m.ability.id, cls: "monster", name: m.ability.name, icon: m.ability.icon, cd: m.ability.cd, power: m.ability.power, unlockLevel: 1,
        desc: m.ability.desc, base: m.ability.base, radiance: ["extend", "echo", "swift"], monster: m.id });
    }
    const L: GenLoot = {
      name: m.name, kind, lvl: m.lvl, tier: tierOf(m.lvl), size: m.size, role: m.role, rare: !!m.rare, where: m.where,
      stats: { hp: st.hp, dmg: st.dmg, armor: st.armor, speed: SPEED_WORD(speed) },
      abilitiesText: [m.desc], lore: m.lore, gear, materials,
      look: m.look ? { id: m.id, name: m.look.name, parts, bonus: m.look.bonus, stat: m.look.stat } : undefined,
      abilities: m.ability ? [m.ability.id] : undefined,
    };
    loot[m.id] = L;
    // в забегах шансы ниже (врагов сотни), материалы — реже
    if (m.where.some((w) => w.startsWith("run:"))) {
      runLoot["run_" + m.id] = { ...L, kind: L.kind === "boss" ? "boss" : "run", name: m.name + (L.kind === "boss" ? "" : " (забег)"),
        gear: L.kind === "boss" ? gear : gear.map((g) => ({ item: g.item, chance: Math.round(g.chance * 0.12 * 1000) / 1000 })),
        materials: L.kind === "boss" ? materials : materials.map((x) => ({ ...x, chance: Math.round(x.chance * 0.15 * 10) / 10, qty: [1, 1] as [number, number] })) };
    }
  }
  // Варианты биомов («Стальной паук» 9 ур. от «Паука-гнильца» 13 ур.): раньше роняли ПРЕДМЕТЫ БАЗЫ — с её уровнем
  // (сундук лагеря 9–10 ур. давал вещи 12–14 ур.). Теперь у варианта, чей уровень отличается от базы, — свои копии
  // трофеев: те же имя/слот/редкость/тип оружия/архетип/облик, статы и уровень — по уровню варианта.
  // Копии дописываются В КОНЕЦ пула (defs.ts), порядковые номера старых предметов не меняются.
  const variantItems: GenItem[] = [];
  const variantGear: Record<string, Record<string, string>> = {}; // вариант → { базовый предмет → копия }
  const byId = Object.fromEntries(BESTIARY.map((m) => [m.id, m]));
  for (const v of VARIANTS) {
    const m = byId[v.base];
    if (!m || m.lvl === v.lvl) continue;
    const map: Record<string, string> = (variantGear[v.id] = {});
    SLOT_KEYS.forEach(([k, slot], si) => {
      const baseId = m.legacy?.[k] || `${m.id}_${slot}`;
      const b = items.find((x) => x.id === baseId);
      if (!b) return;
      const id = `${v.id}_${slot}`;
      variantItems.push({ ...b, id, stats: genItemStats(slot, v.lvl, b.rarity, hash(m.id) + si, b.wtype, archetypeOf(hash(m.id))),
        lore: `${SLOT_LORE[slot]}: «${v.name}». ${m.lore}`, band: BAND(v.lvl), lvl: v.lvl, req: itemReqLevel(v.lvl), from: v.id, part: baseId });
      map[baseId] = id;
    });
  }
  return { items, loot, runLoot, zoneMobs, resources, abilities, variantItems, variantGear };
}

export const CONTENT = buildContent();
