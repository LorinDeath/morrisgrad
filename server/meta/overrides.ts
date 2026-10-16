import { rsOptions, SKILL_REGISTRY } from "./rsAny";
import { initZoneNames } from "./mapZones";
import { DASH_CFG } from "./dash";
import { mobSkillOptions } from "./mobSkills";
// «Проклятые»: правки игровых данных из админ-панели — общая часть сервера и клиента (без D1).
// Схема полей (тип, диапазон) — ЕДИНСТВЕННЫЙ список того, что можно менять; патч вне схемы отклоняется.
// apply() восстанавливает исходное значение из кода и накладывает патч — повторное применение идемпотентно.
// Черты (traits) — эффекты в духе RPG Maker MZ «Traits/Effects»: поджог, кровотечение, яд, заморозка, замедление,
// отбрасывание, вампиризм — с параметрами; вешаются на оружие (тип), предмет и навык; применяет сервер при попадании.
import { ZONE_MOBS, WEAPON_TYPES, ITEM_BY_ID, ABILITY_BY_ID, MONSTER_LOOT, RESOURCES, salvageDefault } from "./defs";
import { RUN_SKILLS } from "./shared";
import { MOB_SKILLS_LIST } from "./mobSkills";
import { ZONE_GEN, BOSS_TIMERS, WORLD_GEN } from "./zoneGen";
import { CURSE } from "./cursed";
import { CHEST } from "./chests";
import { UPG, UPG_ORDER } from "./upgrade";

export type Kind = "mob" | "weapon" | "item" | "skill" | "loot" | "spawn" | "boss" | "rare" | "region" | "curse" | "chest" | "dash" | "biome" | "upgrade";
export interface Field { path: string; label: string; t: "hdr" | "int" | "num" | "bool" | "enum" | "skills" | "resmap" | "color" | "text"; min?: number; max?: number; opts?: string[]; optl?: { id: string; name: string; group: string }[]; optn?: Record<string, string> }
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
const ST = ["dmgMin", "dmgMax", "armor", "hp", "speedPct", "critPct", "regen", "cdrPct", "magnetPct", "lifestealPct", "atkSpeedPct", "armorPen", "armorPenPct"];
export const SCHEMA: Record<Kind, { name: string; fields: Field[]; traits?: boolean }> = {
  mob: { name: "Бестиарий", fields: [N("lvl", "Уровень", 1, 60, "int"), N("hp", "ОЗ", 1, 1e7, "int"), N("dmg", "Урон", 0, 1e5), N("armor", "Броня", 0, 1e4), N("speed", "Скорость", 0, 400), N("aggro", "Агро, px", 0, 2000, "int"), N("xp", "Опыт", 0, 1e6, "int"), N("radius", "Радиус", 4, 200, "int"), { path: "skills", label: "Навыки моба (любые навыки игры, до 5)", t: "skills", optl: mobSkillOptions() }] },
  weapon: { name: "Оружие", traits: true, fields: [N("cd", "Перезарядка удара, мс", 100, 5000, "int"), { path: "atk.kind", label: "Форма удара", t: "enum", opts: ["proj", "line", "arc"] }, N("atk.range", "Дальность", 20, 800, "int"), N("atk.width", "Ширина", 4, 200, "int"), N("atk.arc", "Дуга, рад", 0.1, 3.2), N("atk.max", "Целей", 1, 10, "int"), N("atk.count", "Снарядов в залпе", 1, 9, "int"), N("atk.spread", "Веер, рад", 0, 2), N("atk.per", "Урон снаряда, ×", 0.05, 1), N("status.knock", "Отбрасывание", 0, 10),
    { path: "rs", label: "Навык оружия (R) для всего типа — важнее выпавшего (предмет может задать свой)", t: "enum", opts: ["", ...rsOptions().map((r) => r.id)], optl: rsOptions() }] }, // статусы — только чертами предметов
  item: { name: "Предметы", traits: true, fields: [N("lvl", "Ур. предмета", 1, 60, "int"), N("req", "Треб. уровень (надеть)", 1, 60, "int"), ...ST.map((k) => N("stats." + k, k, 0, 1e4)),
    // навык оружия (R): если задан — важнее навыка, выпавшего у экземпляра; «» — как выпало
    { path: "rs", label: "Навык оружия (R), важнее выпавшего — любой навык игры", t: "enum", opts: ["", ...rsOptions().map((r) => r.id)], optl: rsOptions() },
    { path: "salvage", label: "Разбор даёт (ресурс: кол-во)", t: "resmap" }] },
  skill: { name: "Навыки", traits: true, fields: [N("cd", "Перезарядка, с", 0.5, 120), N("power", "Сила, ×", 0.1, 10)] },
  loot: { name: "Дроп", fields: [] }, // gear/materials — таблицы, проверяются отдельно (validateLoot)
  // спавн Аринара (живые: сервер читает ZONE_GEN на каждом респавне/проверке) — лагеря и бродячие мобы
  spawn: { name: "Спавн", fields: [N("regenCombat", "Восстановление ХП в бою, × (вне боя — полное)", 0, 1), N("regenCombatSec", "«В бою» после удара/урона, с", 0, 60),
    N("campRespawn", "Респавн лагеря, с (вожак ×2, кочевник ×1.5)", 5, 3600, "int"),
    { path: "ambientOn", label: "Бродячие мобы включены", t: "bool" }, N("ambientEvery", "Бродячие: проверка раз в, с", 2, 600, "int"),
    N("ambientChance", "Бродячие: шанс одиночки, %", 0, 100), N("ambientGroupChance", "Бродячие: шанс группы с элитой, %", 0, 100),
    N("ambientGroup", "Бродячие: обычных в группе (+1 элита)", 1, 8, "int"), N("ambientCap", "Бродячие: максимум на игрока", 0, 20, "int"),
    N("ambientNear", "«Пусто», если нет мобов ближе, px", 150, 1500, "int"), N("ambientEdge", "Появляются на расстоянии, px (экран 640×360)", 200, 1200, "int"),
    N("ambientHunt", "Охотятся на игрока, с", 0, 120, "int"), N("ambientLife", "Уходят без боя через, с", 10, 600, "int")] },
  // плотность мобов по локациям Аринара (лагеря строятся заново при правке — сервер, без дублей)
  region: { name: "Локации: плотность", fields: [N("dens", "Лагерей: множитель (0 — без лагерей, 1 — как в коде)", 0, 5),
    N("packs.0", "Пачек в лагере: от", 1, 6, "int"), N("packs.1", "Пачек в лагере: до", 1, 6, "int"),
    N("pack.0", "Мобов в пачке: от", 1, 10, "int"), N("pack.1", "Мобов в пачке: до", 1, 10, "int"),
    N("elite", "Шанс элиты (0…1; с лимитом — на пачку)", 0, 1), N("eliteMax", "Максимум элит в лагере (кроме вожаков)", 0, 12, "int"),
    { path: "bossOn", label: "Мировой босс в локации", t: "bool" }] },
  boss: { name: "Мировые боссы", fields: [N("every", "Возрождение после смерти, с", 30, 86400, "int"), N("firstAfter", "Первое появление после старта, с", 0, 86400, "int")] },
  // «Проклятие» — только админ (модератору не отдаётся: roles.MOD_ADMIN_KINDS); одна запись id='main'
  curse: { name: "Проклятие", fields: [N("equipDropMult", "Шанс дропа экипировки, × (открытый мир и забеги; сундук лагеря — по таблице)", 0, 100),
    N("mobDropMult", "Проклятый моб/босс: шанс обычных вещей и материалов, ×", 0, 100),
    N("itemChanceMult", "Проклятая версия вещи: шанс = базовый × (отдельный бросок)", 0, 100),
    { path: "bossOnly", label: "Проклятые вещи — только с проклятых боссов", t: "bool" },
    N("statMult", "Статы проклятой вещи, ×", 1, 10), N("rsMult", "Урон навыка R проклятого оружия, ×", 1, 10),
    N("mobHp", "Проклятый моб: ОЗ, ×", 1, 50), N("mobDmg", "Проклятый моб: урон, ×", 1, 50), N("mobArmor", "Проклятый моб: броня, ×", 1, 20), N("mobXp", "Проклятый моб: опыт, ×", 0, 50),
    N("glow1", "Свечение: 1 вещь (0…1)", 0, 1), N("glow2", "Свечение: 2 вещи", 0, 1), N("glow3", "Свечение: 3 вещи", 0, 1), N("glow4", "Свечение: 4 вещи", 0, 1), N("glow5", "Свечение: полный комплект (пульсирует)", 0, 1),
    { path: "tint", label: "Цвет проклятия", t: "color" }] },
  // «⚒ Улучшение» у Петра — только админ: материал и кол-во на каждый уровень, проклятые, прибавка статов (провалов/поломок нет)
  upgrade: { name: "Улучшение", fields: [N("maxLvl", `Максимальный уровень улучшения (≤ ${UPG_ORDER.length})`, 0, UPG_ORDER.length, "int"), N("cost", "Материалов за уровень (обычная вещь), если у уровня не задано своё", 1, 999, "int"),
    N("cursedMult", "Проклятая вещь: кол-во ×, плюс второй материал (следующий по редкости)", 1, 20),
    N("flatPct", "Обычная: +% к плоским статам за уровень (от базы)", 0, 100), N("pctPts", "Обычная: +п.п. к процентным статам за уровень", 0, 10),
    N("cFlatPct", "Проклятая: +% к плоским статам за уровень (от проклятой базы)", 0, 100), N("cPctPts", "Проклятая: +п.п. к процентным статам за уровень", 0, 10),
    ...UPG_ORDER.flatMap((_, i) => [{ path: `order.${i}`, label: `+${i + 1}: материал`, t: "enum" as const, opts: Object.keys(RESOURCES), optn: Object.fromEntries(Object.entries(RESOURCES).map(([k, r]) => [k, `${r.icon} ${r.name}`])) },
      N(`costs.${i}`, `+${i + 1}: кол-во (0 — общее)`, 0, 999, "int")])] },
  // «Рывок» — только админ: перезарядка и неуязвимость (сервер считает по времени)
  biome: { name: "Биомы карты", fields: [{ path: "name", label: "Название биома на карте M", t: "text" }, { path: "sub", label: "Название зоны (вторая строка; пусто — без неё)", t: "text" }] },
  dash: { name: "Рывок", fields: [N("cd", "Перезарядка рывка, с", 0.5, 60), N("invulnMs", "Неуязвимость после рывка, мс (1 кадр ≈ 16,7 мс · 5 кадров ≈ 83 мс; 0 — нет)", 0, 1000, "int"), { path: "blink", label: "Мигание героя во время неуязвимости (видят все)", t: "bool" }] },
  // «Сундуки схватки» — только админ (не в roles.MOD_ADMIN_KINDS); одна запись id='main'
  chest: { name: "Сундуки", fields: [{ path: "_h_camp", label: "Лагерь", t: "hdr" },
    { path: "on", label: "Сундук зачищенного лагеря включён (выкл — мешок с каждого моба)", t: "bool" },
    { path: "campRaw", label: "Сундук лагеря: шансы ровно как в таблице (выкл — таблица × свой множитель)", t: "bool" },
    N("campMult", "Сундук лагеря: свой множитель шансов, × (если «как в таблице» выкл)", 0, 100),
    N("campSecondPct", "Шанс второго сундука, %", 0, 100), { path: "campSpawnEmpty", label: "Ставить сундук, даже если пустой", t: "bool" },
    N("campIdleSec", "Зачистка лагеря сбрасывается без убийств через, с", 30, 7200, "int"),
    N("matDropMult", "Шанс материалов в открытом мире, × (мешки мобов; количество не меняется)", 0, 100),
    { path: "_h_gen", label: "Общие", t: "hdr" },
    N("personalSec", "Личная фаза, с", 0, 3600, "int"), N("publicSec", "Общий сундук живёт, с", 10, 86400, "int"), N("channelSec", "Открытие общего сундука (канал), с", 0, 120),
    N("range", "Дальность открыть/взять, px", 40, 400, "int"), N("linkRadius", "(не используется) радиус связи мобов, px", 50, 3000, "int"), N("linkWindowSec", "(не используется) окно продолжения, с", 0, 300),
    N("timeoutSec", "(не используется) закрыть без убийств через, с", 5, 900, "int"),  N("minSharePct", "Порог вклада, % урона по лагерю", 0, 100),
    { path: "partyNear", label: "Отряд участника рядом тоже получает добычу", t: "bool" },
    { path: "partyMode", label: "Режим отряда: personal — свои броски; rr — общий бросок по кругу; roll — общий бросок, случайному", t: "enum", opts: ["personal", "rr", "roll"] },
    { path: "guard", label: "Стража у общего сундука", t: "bool" }, N("guardN", "Стражей", 0, 8, "int"), N("takeRate", "Взятий в секунду (Shift+клик)", 1, 30)] },
  rare: { name: "Редкие Отголоски", fields: [N("every.0", "Появление через, мин. с", 60, 86400, "int"), N("every.1", "Появление через, макс. с", 60, 86400, "int"), N("life", "Живёт, если не нашли, с", 30, 7200, "int")] },
};
export const TABLES: Record<Kind, Record<string, any>> = { mob: ZONE_MOBS, weapon: WEAPON_TYPES, item: ITEM_BY_ID, skill: SKILL_REGISTRY, loot: MONSTER_LOOT,
  spawn: { arinar: ZONE_GEN }, curse: { main: CURSE }, chest: { main: CHEST }, dash: { main: DASH_CFG }, upgrade: { main: UPG }, biome: initZoneNames(WORLD_GEN.arinar.regions as any), region: Object.fromEntries(WORLD_GEN.arinar.regions.filter((r: any) => r.table.length).map((r: any) => [r.id, r])), boss: BOSS_TIMERS, rare: Object.fromEntries(WORLD_GEN.arinar.rares.map((r: any) => [r.type, r])) };
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
    const f = S.fields.find((x) => x.path === p); if (!f || f.t === "hdr") return `поле ${p} не редактируется`;
    if (f.t === "bool") out[p] = !!v;
    else if (f.t === "enum") { if (!f.opts!.includes(String(v))) return `${f.label}: недопустимо`; if (p === "rs" && v && kind === "item" && TABLES.item[id].slot !== "weapon") return "навык R — только у оружия"; out[p] = String(v); }
    else if (f.t === "resmap") {
      if (!v || typeof v !== "object" || Array.isArray(v) || Object.keys(v).length > 8) return `${f.label}: до 8 ресурсов`;
      const m: Record<string, number> = {};
      for (const [r, n] of Object.entries(v as any)) { const q = Math.round(Number(n)); if (!RESOURCES[r]) return `нет ресурса ${r}`; if (!(q >= 0 && q <= 999)) return "кол-во 0…999"; if (q) m[r] = q; }
      out[p] = m;
    }
    else if (f.t === "text") { const t = String(v ?? "").replace(/[<>\u0000-\u001f]/g, "").trim(); if (t.length > 48) return `${f.label}: до 48 символов`; if (!t && p === "name") return `${f.label}: не пусто`; out[p] = t; }
    else if (f.t === "color") { if (!/^#[0-9a-fA-F]{6}$/.test(String(v))) return `${f.label}: #rrggbb`; out[p] = String(v).toLowerCase(); }
    else if (f.t === "skills") { if (!Array.isArray(v) || v.length > 5 || !v.every((s) => MOB_SKILLS_LIST.includes(s))) return "навыки моба: до 5 из списка"; out[p] = [...new Set(v as string[])]; }
    else { const n = Number(v); if (!Number.isFinite(n) || n < f.min! || n > f.max!) return `${f.label}: ${f.min}…${f.max}`; out[p] = f.t === "int" ? Math.round(n) : n; }
  }
  if (kind === "region") { const R = TABLES.region[id]; for (const k of ["packs", "pack"]) { const a = out[k + ".0"] ?? R[k]?.[0], b = out[k + ".1"] ?? R[k]?.[1]; if (a != null && b != null && a > b) return `${k === "packs" ? "пачек" : "мобов"}: «от» больше «до»`; } }
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
  for (const [p, v] of Object.entries(patch)) {
    if (p === "traits") TRAITS[kind][id] = v as Trait[];
    else if (!SCHEMA[kind].fields.some((f) => f.path === p)) continue; // старые поля из D1 (например, статус типа оружия) — игнорируются
    else setP(o, p, v);
  }
}
export function currentValues(kind: Kind, id: string) {
  const o = TABLES[kind][id]; if (!o) return null;
  if (kind === "loot") return { gear: o.gear, materials: o.materials };
  const v: any = Object.fromEntries(SCHEMA[kind].fields.map((f) => [f.path, getP(o, f.path) ?? null]));
  if (kind === "item" && v.salvage == null) v.salvage = salvageDefault(id);
  if (kind === "region" && v.bossOn == null) v.bossOn = true; // по умолчанию босс есть (флажок не должен выключить его случайно) // по умолчанию — текущая логика разбора
  if (SCHEMA[kind].traits) v.traits = TRAITS[kind][id] || [];
  return v;
}
