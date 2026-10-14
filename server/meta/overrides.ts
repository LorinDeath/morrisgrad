// «Проклятые»: правки игровых данных из админ-панели — общая часть сервера и клиента (без D1).
// Схема полей (тип, диапазон) — ЕДИНСТВЕННЫЙ список того, что можно менять; патч вне схемы отклоняется.
// apply() восстанавливает исходное значение из кода и накладывает патч — повторное применение идемпотентно.
// Черты (traits) — эффекты в духе RPG Maker MZ «Traits/Effects»: поджог, кровотечение, яд, заморозка, замедление,
// отбрасывание, вампиризм — с параметрами; вешаются на оружие (тип), предмет и навык; применяет сервер при попадании.
import { ZONE_MOBS, WEAPON_TYPES, ITEM_BY_ID, ABILITY_BY_ID, MONSTER_LOOT, RESOURCES } from "./defs";
import { MOB_SKILLS_LIST } from "./mobSkills";
import { ZONE_GEN, BOSS_TIMERS, WORLD_GEN } from "./zoneGen";

export type Kind = "mob" | "weapon" | "item" | "skill" | "loot" | "spawn" | "boss" | "rare";
export interface Field { path: string; label: string; t: "int" | "num" | "bool" | "enum" | "skills"; min?: number; max?: number; opts?: string[] }
export interface TraitParam { k: string; label: string; min: number; max: number; def: number }
export const TRAIT_DEFS: Record<string, { name: string; params: TraitParam[] }> = {
  burn: { name: "Поджог", params: [{ k: "chance", label: "Шанс, %", min: 0, max: 100, def: 25 }, { k: "dpsPct", label: "Урон/с, % удара", min: 1, max: 200, def: 15 }, { k: "dur", label: "Длит., с", min: 0.5, max: 20, def: 3 }] },
  bleed: { name: "Кровотечение", params: [{ k: "chance", label: "Шанс, %", min: 0, max: 100, def: 25 }, { k: "dpsPct", label: "Урон/с, % удара", min: 1, max: 200, def: 12 }, { k: "dur", label: "Длит., с", min: 0.5, max: 20, def: 3 }] },
  poison: { name: "Яд", params: [{ k: "chance", label: "Шанс, %", min: 0, max: 100, def: 20 }, { k: "dpsPct", label: "Урон/с, % удара", min: 1, max: 200, def: 8 }, { k: "dur", label: "Длит., с", min: 0.5, max: 30, def: 6 }] },
  freeze: { name: "Заморозка", params: [{ k: "chance", label: "Шанс, %", min: 0, max: 100, def: 10 }, { k: "dur", label: "Длит., с", min: 0.2, max: 5, def: 1 }] },
  slow: { name: "Замедление", params: [{ k: "chance", label: "Шанс, %", min: 0, max: 100, def: 30 }] },
  knock: { name: "Отбрасывание", params: [{ k: "chance", label: "Шанс, %", min: 0, max: 100, def: 30 }, { k: "power", label: "Сила", min: 0.5, max: 10, def: 2 }] },
  lifesteal: { name: "Вампиризм", params: [{ k: "chance", label: "Шанс, %", min: 0, max: 100, def: 100 }, { k: "pct", label: "% урона в ОЗ", min: 1, max: 50, def: 5 }] },
};
export interface Trait { k: string; [p: string]: any }

const N = (path: string, label: string, min: number, max: number, t: "int" | "num" = "num"): Field => ({ path, label, t, min, max });
const ST = ["dmgMin", "dmgMax", "armor", "hp", "speedPct", "critPct", "regen", "cdrPct", "magnetPct", "lifestealPct", "atkSpeedPct"];
export const SCHEMA: Record<Kind, { name: string; fields: Field[]; traits?: boolean }> = {
  mob: { name: "Бестиарий", fields: [N("lvl", "Уровень", 1, 60, "int"), N("hp", "ОЗ", 1, 1e7, "int"), N("dmg", "Урон", 0, 1e5), N("armor", "Броня", 0, 95), N("speed", "Скорость", 0, 400), N("aggro", "Агро, px", 0, 2000, "int"), N("xp", "Опыт", 0, 1e6, "int"), N("radius", "Радиус", 4, 200, "int"), { path: "skills", label: "Навыки моба", t: "skills" }] },
  weapon: { name: "Оружие", traits: true, fields: [N("cd", "Перезарядка удара, мс", 100, 5000, "int"), { path: "atk.kind", label: "Форма удара", t: "enum", opts: ["proj", "line", "arc"] }, N("atk.range", "Дальность", 20, 800, "int"), N("atk.width", "Ширина", 4, 200, "int"), N("atk.arc", "Дуга, рад", 0.1, 3.2), N("atk.max", "Целей", 1, 10, "int"), N("atk.count", "Снарядов в залпе", 1, 9, "int"), N("atk.spread", "Веер, рад", 0, 2), N("atk.per", "Урон снаряда, ×", 0.05, 1), { path: "status.kind", label: "Статус", t: "enum", opts: ["", "burn", "bleed", "poison"] }, N("status.dpsPct", "Статус: урон/с, %", 0, 100), N("status.dur", "Статус: длит., с", 0, 20), { path: "status.slow", label: "Замедляет", t: "bool" }, N("status.knock", "Отбрасывание", 0, 10)] },
  item: { name: "Предметы", traits: true, fields: [N("lvl", "Ур. предмета", 1, 60, "int"), N("req", "Треб. уровень (надеть)", 1, 60, "int"), ...ST.map((k) => N("stats." + k, k, 0, 1e4))] },
  skill: { name: "Навыки", traits: true, fields: [N("cd", "Перезарядка, с", 0.5, 120), N("power", "Сила, ×", 0.1, 10)] },
  loot: { name: "Дроп", fields: [] }, // gear/materials — таблицы, проверяются отдельно (validateLoot)
  // спавн Аринара (живые: сервер читает ZONE_GEN на каждом респавне/проверке) — лагеря и бродячие мобы
  spawn: { name: "Спавн", fields: [N("campRespawn", "Респавн лагеря, с (вожак ×2, кочевник ×1.5)", 5, 3600, "int"),
    { path: "ambientOn", label: "Бродячие мобы включены", t: "bool" }, N("ambientEvery", "Бродячие: проверка раз в, с", 2, 600, "int"),
    N("ambientChance", "Бродячие: шанс одиночки, %", 0, 100), N("ambientGroupChance", "Бродячие: шанс группы с элитой, %", 0, 100),
    N("ambientGroup", "Бродячие: обычных в группе (+1 элита)", 1, 8, "int"), N("ambientCap", "Бродячие: максимум на игрока", 0, 20, "int"),
    N("ambientNear", "«Пусто», если нет мобов ближе, px", 150, 1500, "int"), N("ambientEdge", "Появляются на расстоянии, px (экран 640×360)", 200, 1200, "int"),
    N("ambientHunt", "Охотятся на игрока, с", 0, 120, "int"), N("ambientLife", "Уходят без боя через, с", 10, 600, "int")] },
  boss: { name: "Мировые боссы", fields: [N("every", "Возрождение после смерти, с", 30, 86400, "int"), N("firstAfter", "Первое появление после старта, с", 0, 86400, "int")] },
  rare: { name: "Редкие Отголоски", fields: [N("every.0", "Появление через, мин. с", 60, 86400, "int"), N("every.1", "Появление через, макс. с", 60, 86400, "int"), N("life", "Живёт, если не нашли, с", 30, 7200, "int")] },
};
export const TABLES: Record<Kind, Record<string, any>> = { mob: ZONE_MOBS, weapon: WEAPON_TYPES, item: ITEM_BY_ID, skill: ABILITY_BY_ID, loot: MONSTER_LOOT,
  spawn: { arinar: ZONE_GEN }, boss: BOSS_TIMERS, rare: Object.fromEntries(WORLD_GEN.arinar.rares.map((r: any) => [r.type, r])) };
export const TRAITS: Record<string, Record<string, Trait[]>> = { weapon: {}, item: {}, skill: {} };

const getP = (o: any, p: string) => p.split(".").reduce((x, k) => (x == null ? undefined : x[k]), o);
const setP = (o: any, p: string, v: any) => { const ks = p.split("."); let x = o; for (const k of ks.slice(0, -1)) x = x[k] = x[k] ?? {}; if (v === undefined) delete x[ks[ks.length - 1]]; else x[ks[ks.length - 1]] = v; };

export function validateTraits(list: any): Trait[] | string {
  if (!Array.isArray(list) || list.length > 6) return "черт — не больше 6";
  const out: Trait[] = [];
  for (const t of list) {
    const d = TRAIT_DEFS[t?.k]; if (!d) return `неизвестный эффект ${t?.k}`;
    const o: Trait = { k: t.k };
    for (const p of d.params) { const v = Number(t[p.k] ?? p.def); if (!Number.isFinite(v) || v < p.min || v > p.max) return `${d.name}: «${p.label}» вне ${p.min}…${p.max}`; o[p.k] = v; }
    out.push(o);
  }
  return out;
}
function validateLoot(patch: any): any | string {
  const out: any = {};
  if (patch.gear !== undefined) {
    if (!Array.isArray(patch.gear) || patch.gear.length > 20) return "gear: список до 20";
    out.gear = [];
    for (const g of patch.gear) { if (!ITEM_BY_ID[g?.item]) return `нет предмета ${g?.item}`; const c = Number(g.chance); if (!(c >= 0 && c <= 100)) return "шанс 0…100"; out.gear.push({ item: g.item, chance: c }); }
  }
  if (patch.materials !== undefined) {
    if (!Array.isArray(patch.materials) || patch.materials.length > 12) return "materials: список до 12";
    out.materials = [];
    for (const m of patch.materials) {
      if (!RESOURCES[m?.res]) return `нет ресурса ${m?.res}`; const c = Number(m.chance), a = Math.round(Number(m.qty?.[0])), b = Math.round(Number(m.qty?.[1]));
      if (!(c >= 0 && c <= 100) || !(a >= 1 && b >= a && b <= 99)) return "материал: шанс 0…100, кол-во 1…99"; out.materials.push({ res: m.res, chance: c, qty: [a, b] });
    }
  }
  return out;
}
/** Проверка патча: только поля схемы, числа в диапазоне. Возвращает очищенный патч или текст ошибки. */
export function validatePatch(kind: Kind, id: string, patch: any): any | string {
  const S = SCHEMA[kind]; if (!S || !TABLES[kind][id]) return "нет такой сущности";
  if (!patch || typeof patch !== "object") return "пустой патч";
  if (kind === "loot") return validateLoot(patch);
  const out: any = {};
  for (const [p, v] of Object.entries(patch)) {
    if (p === "traits") { if (!S.traits) return "у этой сущности нет черт"; const t = validateTraits(v); if (typeof t === "string") return t; out.traits = t; continue; }
    const f = S.fields.find((x) => x.path === p); if (!f) return `поле ${p} не редактируется`;
    if (f.t === "bool") out[p] = !!v;
    else if (f.t === "enum") { if (!f.opts!.includes(String(v))) return `${f.label}: недопустимо`; out[p] = String(v); }
    else if (f.t === "skills") { if (!Array.isArray(v) || v.length > 5 || !v.every((s) => MOB_SKILLS_LIST.includes(s))) return "навыки моба: до 5 из списка"; out[p] = [...new Set(v as string[])]; }
    else { const n = Number(v); if (!Number.isFinite(n) || n < f.min! || n > f.max!) return `${f.label}: ${f.min}…${f.max}`; out[p] = f.t === "int" ? Math.round(n) : n; }
  }
  if (kind === "rare") { const cur = TABLES.rare[id].every; const a = out["every.0"] ?? cur[0], b = out["every.1"] ?? cur[1]; if (a > b) return "мин. время больше макс."; }
  return out;
}
const ORIG = new Map<string, any>();
/** Наложить правку (патч поверх значений из кода). patch=null — вернуть исходное. */
export function applyOverride(kind: Kind, id: string, patch: any | null) {
  const o = TABLES[kind]?.[id]; if (!o) return;
  const key = kind + ":" + id;
  const paths = kind === "loot" ? ["gear", "materials"] : [...SCHEMA[kind].fields.map((f) => f.path)];
  if (!ORIG.has(key)) ORIG.set(key, Object.fromEntries(paths.map((p) => [p, JSON.parse(JSON.stringify(getP(o, p) ?? null))])));
  const orig = ORIG.get(key);
  for (const p of paths) setP(o, p, orig[p] === null ? undefined : JSON.parse(JSON.stringify(orig[p])));
  if (SCHEMA[kind].traits) delete TRAITS[kind][id];
  if (!patch) return;
  for (const [p, v] of Object.entries(patch)) { if (p === "traits") TRAITS[kind][id] = v as Trait[]; else setP(o, p, v); }
}
export function currentValues(kind: Kind, id: string) {
  const o = TABLES[kind][id]; if (!o) return null;
  if (kind === "loot") return { gear: o.gear, materials: o.materials };
  const v: any = Object.fromEntries(SCHEMA[kind].fields.map((f) => [f.path, getP(o, f.path) ?? null]));
  if (SCHEMA[kind].traits) v.traits = TRAITS[kind][id] || [];
  return v;
}
