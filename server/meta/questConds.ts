// Условия целей квестов «убить» / «победить босса» (админка: «+ условие» под целью). Клиентобезопасно.
// Сервер собирает факты боя с конкретным мобом (fightFacts в service.ts: с первого удара/попадания до смерти моба)
// и решает: засчитать убийство или нет. Провал не сбрасывает прогресс — просто это убийство не считается
// (следующий бой — новая попытка).
import { WEAPON_TYPES, HERO_NAMES } from "./shared";
import { BIOMES } from "./biomes";

export interface QuestCond { k: string; v?: number | string }
/** факты одного боя игрока с мобом (считает только сервер) */
export interface FightFacts {
  ability: boolean; dash: boolean; hit: boolean; minHpPct: number; sec: number; solo: boolean;
  wts: string[]; cls: string | null; night: boolean; biome: string | null;
}
type P = { t: "num"; min: number; max: number; def: number; unit: string } | { t: "enum"; opts: { id: string; name: string }[] };
const CLS: Record<string, string> = { warrior: "Воин", spearman: "Копейщик", rogue: "Разбойник", mage: "Маг" };
export const COND_DEFS: { k: string; name: string; p?: P }[] = [
  { k: "no_ability", name: "Не применяя навыков" },
  { k: "no_dash", name: "Без рывка" },
  { k: "no_hit", name: "Не получив ни одного удара" },
  { k: "hp_min", name: "Здоровье всё время не ниже", p: { t: "num", min: 1, max: 99, def: 50, unit: "%" } },
  { k: "time", name: "Быстрее, чем за", p: { t: "num", min: 3, max: 3600, def: 60, unit: "с" } },
  { k: "solo", name: "В одиночку (никто другой не бьёт цель)" },
  { k: "weapon", name: "Только оружием", p: { t: "enum", opts: Object.entries(WEAPON_TYPES).map(([id, w]) => ({ id, name: w.name })) } },
  { k: "cls", name: "Только героем", p: { t: "enum", opts: Object.keys(CLS).map((id) => ({ id, name: `${CLS[id]} (${HERO_NAMES[id] || id})` })) } },
  { k: "night", name: "Ночью («Фиолетовая ночь»)" },
  { k: "biome", name: "В биоме", p: { t: "enum", opts: Object.values(BIOMES).map((b) => ({ id: b.id, name: b.name })) } },
];
export const COND_BY_K = Object.fromEntries(COND_DEFS.map((c) => [c.k, c]));
const optName = (c: QuestCond) => { const d = COND_BY_K[c.k]?.p; return d?.t === "enum" ? d.opts.find((o) => o.id === c.v)?.name || String(c.v) : ""; };

/** короткий текст условия для игрока: «не применяя навыков», «быстрее 60 с», «только оружием: Меч» */
export function condText(c: QuestCond): string {
  const d = COND_BY_K[c.k]; if (!d) return c.k;
  switch (c.k) {
    case "hp_min": return `здоровье не ниже ${c.v}%`;
    case "time": return `быстрее ${c.v} с`;
    case "weapon": return `только оружием: ${optName(c)}`;
    case "cls": return `только героем: ${optName(c)}`;
    case "biome": return `в биоме «${optName(c)}»`;
    default: return d.name.charAt(0).toLowerCase() + d.name.slice(1);
  }
}
/** условия цели для показа (вкл. старый флаг noAbilities сюжетных квестов) */
export function objConds(o: any): QuestCond[] {
  const out: QuestCond[] = [...(Array.isArray(o?.conds) ? o.conds : [])];
  if (o?.noAbilities && !out.some((c) => c.k === "no_ability")) out.unshift({ k: "no_ability" });
  return out;
}

/** проверка правки админки: до 5 условий, без повторов, параметры в пределах */
export function validateConds(list: any): QuestCond[] | string {
  if (list == null) return [];
  if (!Array.isArray(list) || list.length > 5) return "условий у цели — не больше 5";
  const out: QuestCond[] = [], seen = new Set<string>();
  for (const c of list) {
    const d = COND_BY_K[c?.k]; if (!d) return `неизвестное условие ${c?.k}`;
    if (seen.has(d.k)) return `условие «${d.name}» повторяется`; seen.add(d.k);
    if (!d.p) { out.push({ k: d.k }); continue; }
    if (d.p.t === "num") { const v = Math.round(Number(c.v ?? d.p.def)); if (!(v >= d.p.min && v <= d.p.max)) return `«${d.name}»: ${d.p.min}…${d.p.max} ${d.p.unit}`; out.push({ k: d.k, v }); }
    else { const v = String(c.v ?? ""); if (!d.p.opts.some((o) => o.id === v)) return `«${d.name}»: выберите вариант`; out.push({ k: d.k, v }); }
  }
  return out;
}

/** первое нарушенное условие (текст для игрока) или null — всё выполнено. Нет фактов боя (забег) — не засчитывается. */
export function condFail(conds: QuestCond[], f: FightFacts | null | undefined): string | null {
  if (!conds?.length) return null;
  if (!f) return "условие нельзя проверить в этом режиме";
  for (const c of conds) {
    switch (c.k) {
      case "no_ability": if (f.ability) return "применён навык"; break;
      case "no_dash": if (f.dash) return "использован рывок"; break;
      case "no_hit": if (f.hit) return "получен удар"; break;
      case "hp_min": if (f.minHpPct < Number(c.v)) return `здоровье опускалось до ${Math.max(0, Math.floor(f.minHpPct))}% (нужно ≥ ${c.v}%)`; break;
      case "time": if (f.sec > Number(c.v)) return `бой длился ${Math.ceil(f.sec)} с (нужно ≤ ${c.v} с)`; break;
      case "solo": if (!f.solo) return "цель били другие игроки"; break;
      case "weapon": if (f.wts.some((w) => w !== c.v) || !f.wts.length) return `нужно только оружие «${optName(c)}»`; break;
      case "cls": if (f.cls !== c.v) return `нужен герой «${optName(c)}»`; break;
      case "night": if (!f.night) return "сейчас не ночь"; break;
      case "biome": if (f.biome !== c.v) return `нужно в биоме «${optName(c)}»`; break;
    }
  }
  return null;
}
/** какие условия нарушает живое событие боя (для мгновенного «✖» в трекере) */
export function condLive(conds: QuestCond[], kind: "ability" | "dash" | "hit", hpPct: number): string | null {
  for (const c of conds || []) {
    if (kind === "ability" && c.k === "no_ability") return "применён навык";
    if (kind === "dash" && c.k === "no_dash") return "использован рывок";
    if (kind === "hit" && c.k === "no_hit") return "получен удар";
    if (kind === "hit" && c.k === "hp_min" && hpPct < Number(c.v)) return `здоровье ниже ${c.v}%`;
  }
  return null;
}
