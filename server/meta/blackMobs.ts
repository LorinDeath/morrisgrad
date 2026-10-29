// ЧЁРНАЯ МАГИЯ, этап В: конструктор чёрных мобов из частей тела (Художник: public/bm-art/body), лагеря/логова с таймерами.
//  · bmbody — часть тела (слот, лист Художника, поправки к статам); встроенные — 35 листов Художника, свои — «bbx_…»
//  · bmmob — моб: тело по слотам, оружие (детали кузни или артефакт игрока), класс (табличка), флаги, статы, опыт, дроп
//    → регистрируется в ZONE_MOBS как «bmx_<id>» с black:true (бестиарий/дроп/квесты/доска работают как у обычных мобов)
//  · bmcamp — лагерь: точка, радиус, состав [{mob, n}], вожак, возрождение от/до (с); таймеры — library_meta «bm_timers»
//  · bmmcfg — общие настройки (всё правится в админке, game_overrides; старые сейвы не затронуты — новых полей у игрока нет)
// Снятие с публикации — hidden:1 (никогда не удаление: живые мобы и записи бестиария остаются целы).
import { ZONE_MOBS, MONSTER_LOOT, ITEM_BY_ID } from "./defs";
import { BC_TIERS } from "./boardChestCfg";
import { RESOURCES } from "./shared";
import { BM_PARTS, BP_TYPES, BP_ELEMS, ALL_ELEMS, PURE_KEYS, ELEM_COLOR, pieceId, shardId, elemOf, CUSTOM_BP, BMA_CFG, ARC_MAX, isStaff, staffMuzzles, shotOf } from "./blackArt";
import { mobXp, tierOf } from "./balance";
import { BM_ELEM_NAMES } from "./bmElemNames";

export const BODY_SLOTS = ["tail", "armL", "legL", "torso", "legR", "head", "armR"] as const;
export type BodySlot = typeof BODY_SLOTS[number];
export const BODY_SLOT_NAMES: Record<string, string> = { tail: "Хвост", armL: "Левая рука (дальняя)", legL: "Левая нога (дальняя)", torso: "Торс", legR: "Правая нога (ближняя)", head: "Голова", armR: "Правая рука (с оружием)" };
export const BODY_REQ: BodySlot[] = ["torso", "head", "legL", "legR", "armR"]; // хвост и левая рука — по желанию
export const BM_CLASSES = ["warrior", "archer", "mage", "brute"] as const;
export const BM_CLASS_NAMES: Record<string, string> = { warrior: "Воин", archer: "Лучник", mage: "Маг", brute: "Громила" };
const CLASS_ROLE: Record<string, string> = { warrior: "melee", archer: "ranged", mage: "caster", brute: "tank" };

export const BMM_CFG = {
  on: true,                 // чёрные мобы и их лагеря в мире
  fightNearTiles: 12,       // чёрные ↔ обычные дерутся, только если игрок ближе стольких клеток (32 px) — иначе мир спит
  maxCampMobs: 40,          // мобов в одном лагере не больше
  strictElemDrops: true,    // кусочки стихии — только с мобов ЭТОЙ стихии (ледяные мобы — только ледяные; выкл — огненные можно с любых)
  maxCamps: 30,             // лагерей всего
  maxCustomMobs: 200, maxCustomBody: 300,
  mobVis: 0.6,              // масштаб листа Художника в мире (лист 104 px ≈ 5.2 м; 0.6 → моб ≈ 2.3 м, как обычные крупные)
  moveOn: true,             // ЭТАП 2: рывки/телепорты/тени из параметров движения моба (выкл — только ходьба)
  moveCdMul: 1,             // множитель перезарядки рывков и телепортов всех чёрных мобов
  weaponDmgPct: 15,         // моб с оружием в руке: +% урона
  refMul: 1.35,             // «Авто по уровню»: × статов обычного моба того же уровня
  cls: { warrior: { hp: 1, dmg: 1, speed: 1 }, archer: { hp: 0.8, dmg: 0.9, speed: 1.05 }, mage: { hp: 0.75, dmg: 1.15, speed: 0.95 }, brute: { hp: 1.5, dmg: 0.85, speed: 0.85 } } as Record<string, { hp: number; dmg: number; speed: number }>,
  campMinDist: 400,         // лагерь не ближе к городу/куполу, px
};

export interface BmBody { id: string; name: string; slot: BodySlot; img: string; hp: number; dmg: number; armor: number; speed: number; hidden?: boolean; desc?: string;
  elem?: string;                 // ICE: стихия части (нет поля — огонь)
  pfire?: number; pice?: number; // ICE: чистый урон стихии моба с этой частью, % его макс. ОЗ (по умолчанию 0; правится в админке)
}
export const CUSTOM_BB = /^bbx_[a-z0-9_]{2,32}$/;
// поправки встроенных частей по варианту листа (1 кость, 2 камень, 3 латы, 4 уголь/корни, 5 обсидиан/хитин): %ОЗ, %урона, +броня, %скорости
const VAR_MODS: Record<number, [number, number, number, number]> = { 1: [0, 4, 0, 4], 2: [10, 0, 3, -6], 3: [6, 3, 4, -3], 4: [-4, 2, 0, 6], 5: [4, 6, 2, 0] };
const SLOT_W: Record<string, number> = { torso: 1.6, head: 0.8, legL: 0.6, legR: 0.6, armL: 0.6, armR: 0.8, tail: 0.5 };
const BODY_NAMES: Record<string, string[]> = {
  tail: ["Костяной позвоночник", "Хвост ящера с огнём", "Каменная булава", "Плеть из углей", "Скорпионье жало"],
  armL: ["Костяная с когтями", "Каменный кулак", "Раскалённая латная", "Обугленная ветвь", "Обсидиановая клешня"],
  legL: ["Костяная с копытом", "Каменный столб", "Раскалённые латы", "Корни", "Хитиновая лапа"],
  torso: ["Рёберная клетка", "Обсидиановый панцирь", "Каменная глыба", "Обугленный ствол", "Кузнечный горн"],
  legR: ["Костяная с копытом", "Каменный столб", "Раскалённые латы", "Корни", "Хитиновая лапа"],
  head: ["Рогатый череп", "Голова-жаровня", "Морда адского пса", "Каменный монолит", "Пепельный капюшон"],
  armR: ["Костяная с когтями", "Каменный кулак", "Раскалённая латная", "Обугленная ветвь", "Обсидиановая клешня"],
};
export const BM_BODY: Record<string, BmBody> = {};
for (const s of BODY_SLOTS) for (let v = 1; v <= 5; v++) {
  const [hp, dmg, ar, sp] = VAR_MODS[v], w = SLOT_W[s];
  BM_BODY[`fb_${s}_${v}`] = { id: `fb_${s}_${v}`, name: BODY_NAMES[s][v - 1], slot: s, img: `${s}_${v}`, hp: Math.round(hp * w), dmg: Math.round(dmg * w), armor: Math.round(ar * w), speed: Math.round(sp * w) };
}
// ICE: ледяной набор Художника (public/bm-art/body/ice_<slot>_<n>): те же поправки по варианту; armL/legL — те же листы, что armR/legR
const ICE_NAMES: Record<string, string[]> = {
  head: ["Череп в ледяной короне", "Ледниковый шлем", "Череп ледяного оленя", "Кристальная друза", "Маска Снежной вдовы"],
  torso: ["Кираса с ледяным сердцем", "Сосулечный хребет", "Кристалл-монолит", "Шкура ледяного тролля", "Ледяная клетка-фонарь"],
  armR: ["Ледяные когти", "Ледяная глыба-кулак", "Воронёная латная в инее", "Сосулечная цепь", "Рука с кристальным щитом"],
  legR: ["Птичья лапа со шпорой", "Ледяная колонна", "Сабатон в инее", "Снежная лапа йети", "Ледяная ходуля"],
  tail: ["Сосулечный хвост", "Хвост ледяного змея", "Сноп кристаллов", "Позвонки в ледяной корке", "Меховой хвост в инее"],
};
ICE_NAMES.armL = ICE_NAMES.armR; ICE_NAMES.legL = ICE_NAMES.legR;
for (const s of BODY_SLOTS) for (let v = 1; v <= 5; v++) {
  const [hp, dmg, ar, sp] = VAR_MODS[v], w = SLOT_W[s];
  BM_BODY[`ib_${s}_${v}`] = { id: `ib_${s}_${v}`, name: ICE_NAMES[s][v - 1], slot: s, img: `ice_${s}_${v}`, hp: Math.round(hp * w), dmg: Math.round(dmg * w), armor: Math.round(ar * w), speed: Math.round(sp * w), elem: "ice" };
}
// ЭТАП 2: вода (wb_), камень (sb_), природа (nb_), молния (lb_) — полные наборы Художника (public/bm-art/body/<el>_<slot>_<n>, у каждой свои armL/legL)
export const ELEM_BODY_PRE: Record<string, string> = { fire: "fb", ice: "ib", water: "wb", stone: "sb", nature: "nb", lightning: "lb" };
for (const el of ["water", "stone", "nature", "lightning"]) for (const s of BODY_SLOTS) for (let v = 1; v <= 5; v++) {
  const [hp, dmg, ar, sp] = VAR_MODS[v], w = SLOT_W[s], id = `${ELEM_BODY_PRE[el]}_${s}_${v}`;
  // характер стихии: камень — крепче и медленнее, молния — быстрее и хрупче
  const dHp = el === "stone" ? 4 : el === "lightning" ? -3 : 0, dAr = el === "stone" ? 2 : 0, dSp = el === "lightning" ? 6 : el === "stone" ? -4 : 0;
  BM_BODY[id] = { id, name: BM_ELEM_NAMES.body[el]?.[`${s}_${v}`] || `${BODY_SLOT_NAMES[s]} ${v}`, slot: s, img: `${el}_${s}_${v}`, hp: Math.round((hp + dHp) * w), dmg: Math.round(dmg * w), armor: Math.round((ar + dAr) * w), speed: Math.round((sp + dSp) * w), elem: el };
}
export function makeBody(id: string, slot: string): BmBody {
  const s = (BODY_SLOTS as readonly string[]).includes(slot) ? slot as BodySlot : "torso";
  return { id, name: BODY_SLOT_NAMES[s] + " (новая)", slot: s, img: `${s}_1`, hp: 0, dmg: 0, armor: 0, speed: 0 };
}

export interface BmDrop { res: string; chance: number; qty: [number, number] }
export interface BmGear { item: string; chance: number }
/** сундук наград (окно «🎁 Сундуки»): ярус BC_TIERS, шанс %, шанс проклятого %, уровень (0 — по мобу) */
export interface BmChestDrop { t: string; chance: number; c?: number; L?: number }
/** добыча лагеря/логова целиком (сверх бросков его мобов): кусочки/ресурсы, снаряжение, сундуки наград — каждому получателю сундука лагеря */
export interface BmCampLoot { drops?: BmDrop[]; gear?: BmGear[]; chests?: BmChestDrop[] }
export interface BmMob {
  id: string; name: string; desc?: string; cls: string; lvl: number;
  hp: number; dmg: number; armor: number; speed: number; aggro: number; radius: number; xp: number;
  body: Partial<Record<BodySlot, string>>;
  weapon: Partial<Record<string, string>>;   // детали кузни (handle/blade/…) — пусто: без оружия
  artId?: string;                            // артефакт игрока в руке (art_…): тогда детали — из него
  cursed?: boolean; ench?: number;           // всегда проклятый / ярус зачарования (0 — по броску мира)
  scale: number; drops: BmDrop[]; gear?: BmGear[]; hidden?: boolean;
  chests?: BmChestDrop[];                    // ЭТАП 2: сундуки наград (ярус, шанс %, проклятый %) — убийце/владельцу мешка, в окно «🎁 Сундуки»
  elem?: string;                             // ICE: стихия моба (нет — по лезвию/торсу); ледяные кусочки падают только с ледяных
  move?: BmMove;                             // ЭТАП 2: движение (скорость ×, рывки, телепорт, послеобразы); нет — как раньше
}
/** параметры движения чёрного моба (всё — в админке «Чёрные мобы» → «Движение»):
 *  spd — × скорости; dash — рывок к цели (кд мс, длина px, скорость px/с); blink — телепорт за спину/вбок (кд мс, дальность px);
 *  ghost — послеобразов при рывке/телепорте (0 — нет). Сервер шлёт событие mmv (не bm* — те идут виду Чёрного мага), клиент рисует след и вспышку стихии. */
export interface BmMove { spd?: number; dash?: { cd: number; len: number; spd?: number }; blink?: { cd: number; range: number }; ghost?: number }
export const ELEM_MOVE: Record<string, BmMove> = {
  lightning: { spd: 1.35, dash: { cd: 2200, len: 170, spd: 1400 }, blink: { cd: 5000, range: 220 }, ghost: 4 }, // молния: быстрые и острые
  water: { spd: 1.05, dash: { cd: 4500, len: 140, spd: 900 }, ghost: 2 },
  nature: { spd: 1.1, dash: { cd: 3800, len: 120, spd: 1000 }, ghost: 1 },
  stone: { spd: 0.85 },
};
export function cleanMove(v: any): BmMove | undefined | string {
  if (v == null || v === "") return undefined; if (typeof v !== "object") return "движение: объект";
  const n = (x: any, a: number, b: number) => { const k = Number(x); return Number.isFinite(k) ? Math.max(a, Math.min(b, k)) : undefined; };
  const o: BmMove = {}; const sp = n(v.spd, 0.2, 4); if (sp !== undefined) o.spd = sp;
  if (v.dash && Number(v.dash.cd) > 0) o.dash = { cd: n(v.dash.cd, 300, 60000)!, len: n(v.dash.len, 20, 600) ?? 140, spd: n(v.dash.spd, 200, 4000) ?? 1000 };
  if (v.blink && Number(v.blink.cd) > 0) o.blink = { cd: n(v.blink.cd, 500, 60000)!, range: n(v.blink.range, 40, 800) ?? 200 };
  const g = n(v.ghost, 0, 8); if (g) o.ghost = Math.round(g);
  return o;
}
/** стихия моба: явная → лезвие оружия → торс → огонь (старые записи без поля) */
export function mobElem(m: BmMob, items?: Record<string, any>): string {
  if (m.elem && BP_ELEMS.includes(m.elem)) return m.elem;
  const w = mobWeapon(m, items), b = w.blade && BM_PARTS[w.blade]; if (b) return elemOf(b.elem);
  const t = m.body?.torso && BM_BODY[m.body.torso]; return elemOf(t?.elem);
}
/** ресурс → стихия, если это кусочек чертежа / осколок стихии (иначе null) */
export const resElem = (r: string) => { for (const el of BP_ELEMS) if (r === shardId(el) || BP_TYPES.some((t) => r === pieceId(el, t))) return el; return null; };
/** чистый урон стихий моба: сумма pfire/pice деталей оружия (основные статы) + частей тела, % его макс. ОЗ */
export function mobPure(m: BmMob, items?: Record<string, any>) {
  const w = mobWeapon(m, items); const acc: Record<string, number> = {}; // ось стихий: все чистые статы реестра ELEMENTS
  const add = (src: any) => { if (src) for (const el of ALL_ELEMS) { const k = PURE_KEYS[el], v = Number(src[k]) || 0; if (v) acc[k] = (acc[k] || 0) + v; } };
  for (const id of Object.values(w)) { const p: any = id && BM_PARTS[id]; if (p) add(p.stats); }
  for (const id of Object.values(m.body || {})) add(id && BM_BODY[id]);
  const out: any = {}; let any = false; for (const k of Object.keys(acc)) if (acc[k] > 0) { out[k] = Math.round(acc[k] * 1000) / 1000; any = true; }
  if (any) { out.pfire ??= 0; out.pice ??= 0; } // старые поля — всегда есть (совместимость)
  return any ? out : null;
}
export const CUSTOM_BM = /^bmx_[a-z0-9_]{2,32}$/;
/** «Авто по уровню»: средние статы обычных мобов этого уровня × refMul */
export function refStats(lvl: number) {
  const L = Math.max(1, Math.round(lvl)); const pool = Object.entries(ZONE_MOBS).filter(([k, d]: any) => !d.black && !d.boss && !d.rare && Math.abs((d.lvl || 1) - L) <= 1 && !k.startsWith("bmx_"));
  const avg = (f: (d: any) => number, def: number) => (pool.length ? pool.reduce((a, [, d]) => a + f(d), 0) / pool.length : def);
  const k = BMM_CFG.refMul || 1;
  return { hp: Math.round(avg((d) => d.hp, 30 + L * 18) * k), dmg: Math.round(avg((d) => d.dmg, 4 + L * 1.5) * k * 10) / 10, armor: Math.round(avg((d) => d.armor, L)), speed: Math.round(avg((d) => d.speed, 70)), aggro: Math.round(avg((d) => d.aggro, 220)), xp: Math.round(mobXp(L) * k) };
}
export function makeMob(id: string, lvl = 5, cls = "warrior"): BmMob {
  const r = refStats(lvl);
  return { id, name: "Чёрный моб (новый)", cls: (BM_CLASSES as readonly string[]).includes(cls) ? cls : "warrior", lvl, ...r, radius: 16,
    body: { torso: "fb_torso_1", head: "fb_head_1", legL: "fb_legL_1", legR: "fb_legR_1", armR: "fb_armR_1", armL: "fb_armL_1" }, weapon: {}, scale: 1, drops: [] };
}
const BUILTIN: [string, string, string, number, Partial<Record<BodySlot, number>>, Record<string, string>, BmDrop[]][] = [
  ["bmx_ash_warden", "Пепельный страж", "warrior", 8, { tail: 1, armL: 1, legL: 1, torso: 1, legR: 1, head: 1, armR: 1 }, { handle: "fire_handle", blade: "fire_blade" }, [{ res: pieceId("fire", "handle"), chance: 18, qty: [1, 2] }, { res: pieceId("fire", "blade"), chance: 12, qty: [1, 1] }]],
  ["bmx_ember_archer", "Угольный стрелок", "archer", 10, { armL: 4, legL: 4, torso: 4, legR: 4, head: 5, armR: 4 }, { handle: "fire_handle", blade: "fire_blade_r", crystal: "fire_crystal" }, [{ res: pieceId("fire", "crystal"), chance: 10, qty: [1, 1] }, { res: pieceId("fire", "blade"), chance: 10, qty: [1, 2] }]],
  ["bmx_staff_seer", "Трёхпосохий жрец", "archer", 14, { armL: 3, legL: 3, torso: 3, legR: 3, head: 3, armR: 3 }, { handle: "fire_handle", blade: "fire_staff_arch", blade2: "fire_b2staff_1", blade3: "fire_b3staff_1", crystal: "fire_crystal" }, [{ res: pieceId("fire", "blade"), chance: 12, qty: [1, 2] }, { res: pieceId("fire", "crystal"), chance: 8, qty: [1, 1] }]], // три посоха Художника — веер из 3 снарядов
  // ICE: ледяные чёрные мобы — единственный источник bp_ice_* (тело ib_*, оружие ice_*)
  ["bmx_frost_warden", "Страж инея", "warrior", 9, { tail: 1, armL: 1, legL: 1, torso: 1, legR: 1, head: 1, armR: 1 }, { handle: "ice_handle", blade: "ice_blade" }, [{ res: pieceId("ice", "handle"), chance: 18, qty: [1, 2] }, { res: pieceId("ice", "blade"), chance: 12, qty: [1, 1] }]],
  ["bmx_rime_archer", "Стрелок изморози", "archer", 11, { armL: 4, legL: 5, torso: 2, legR: 5, head: 3, armR: 4 }, { handle: "ice_handle", blade: "ice_blade_r", crystal: "ice_crystal" }, [{ res: pieceId("ice", "crystal"), chance: 10, qty: [1, 1] }, { res: pieceId("ice", "blade"), chance: 10, qty: [1, 2] }]],
  ["bmx_glacier_seer", "Жрец стужи", "mage", 14, { armL: 5, legL: 3, torso: 3, legR: 3, head: 4, armR: 5 }, { handle: "ice_handle2", blade: "ice_staff_arch", blade2: "ice_b2staff_2", blade3: "ice_b3staff_5", crystal: "ice_crystal" }, [{ res: pieceId("ice", "blade"), chance: 12, qty: [1, 2] }, { res: pieceId("ice", "crystal"), chance: 8, qty: [1, 1] }]],
  ["bmx_yeti_brute", "Ледяной громила", "brute", 12, { tail: 5, armL: 2, legL: 4, torso: 4, legR: 4, head: 2, armR: 2 }, { handle: "ice_handle", blade: "ice_blade_glaive", blade2: "ice_blade2", blade3: "ice_blade3" }, [{ res: pieceId("ice", "blade2"), chance: 15, qty: [1, 2] }, { res: pieceId("ice", "blade3"), chance: 15, qty: [1, 2] }]],
  ["bmx_forge_brute", "Горновой громила", "brute", 12, { tail: 3, armL: 2, legL: 2, torso: 5, legR: 2, head: 4, armR: 2 }, { handle: "fire_handle", blade: "fire_blade", blade2: "fire_blade2", blade3: "fire_blade3" }, [{ res: pieceId("fire", "blade2"), chance: 15, qty: [1, 2] }, { res: pieceId("fire", "blade3"), chance: 15, qty: [1, 2] }]],
  ...ELEM_BUILTIN(),
];
/** ЭТАП 2: по 4 моба на стихию (воин, лучник, маг-посохи, громила) — единственный источник bp_<стихия>_* */
function ELEM_BUILTIN(): [string, string, string, number, Partial<Record<BodySlot, number>>, Record<string, string>, BmDrop[]][] {
  const N: Record<string, [string, string, string, string]> = {
    water: ["Страж прилива", "Стрелок брызг", "Жрица глубин", "Утопленный громила"],
    stone: ["Каменный страж", "Метатель сколов", "Жрец горы", "Скальный громила"],
    nature: ["Терновый страж", "Колючий стрелок", "Друид-мухоловка", "Корневой громила"],
    lightning: ["Грозовой страж", "Разрядный стрелок", "Жрец бури", "Громовой громила"],
  };
  const ID: Record<string, [string, string, string, string]> = {
    water: ["tide_warden", "spray_archer", "deep_seer", "drowned_brute"], stone: ["rock_warden", "shard_archer", "mount_seer", "cliff_brute"],
    nature: ["thorn_warden", "burr_archer", "trap_seer", "root_brute"], lightning: ["storm_warden", "volt_archer", "tempest_seer", "thunder_brute"],
  };
  const LV: Record<string, number> = { water: 13, stone: 15, nature: 17, lightning: 19 };
  const D = (el: string, t: string, c: number, q: [number, number] = [1, 1]): BmDrop => ({ res: pieceId(el, t), chance: c, qty: q });
  const out: any[] = [];
  for (const el of ["water", "stone", "nature", "lightning"]) { const L = LV[el], n = N[el], i = ID[el];
    out.push([`bmx_${i[0]}`, n[0], "warrior", L, { tail: 1, armL: 1, legL: 1, torso: 1, legR: 1, head: 1, armR: 1 }, { handle: `${el}_handle`, blade: `${el}_blade` }, [D(el, "handle", 18, [1, 2]), D(el, "blade", 12)]]);
    out.push([`bmx_${i[1]}`, n[1], "archer", L + 1, { armL: 4, legL: 2, torso: 4, legR: 2, head: 3, armR: 4 }, { handle: `${el}_handle3`, blade: `${el}_blade_r`, crystal: `${el}_crystal` }, [D(el, "crystal", 10), D(el, "blade", 10, [1, 2])]]);
    out.push([`bmx_${i[2]}`, n[2], "mage", L + 3, { armL: 5, legL: 3, torso: 2, legR: 3, head: 5, armR: 5 }, { handle: `${el}_handle2`, blade: `${el}_staff_1`, blade2: `${el}_b2staff_2`, blade3: `${el}_b3staff_5`, crystal: `${el}_crystal_2` }, [D(el, "blade", 12, [1, 2]), D(el, "crystal", 8)]]);
    out.push([`bmx_${i[3]}`, n[3], "brute", L + 2, { tail: 3, armL: 2, legL: 5, torso: 3, legR: 5, head: 4, armR: 2 }, { handle: `${el}_handle4`, blade: `${el}_blade_4`, blade2: `${el}_blade2`, blade3: `${el}_blade3` }, [D(el, "blade2", 15, [1, 2]), D(el, "blade3", 15, [1, 2])]]);
  }
  return out;
}
export const BM_MOBS: Record<string, BmMob> = {};
/** встроенные мобы: id тоже bmx_*, но это не «свои» — сброс правок их не удаляет */
export const BM_BUILTIN = new Set(BUILTIN.map((b) => b[0]));
export const isCustomBm = (id: string) => CUSTOM_BM.test(id) && !BM_BUILTIN.has(id);
for (const [id, name, cls, lvl, body, weapon, drops] of BUILTIN) {
  const bel = elemOf(BM_PARTS[weapon.blade || ""]?.elem), pre = ELEM_BODY_PRE[bel] || "fb";
  const m = makeMob(id, lvl, cls); m.name = name; m.body = Object.fromEntries(Object.entries(body).map(([s, v]) => [s, `${pre}_${s}_${v}`])); m.weapon = { ...weapon }; m.drops = drops;
  if (bel !== "fire") m.elem = bel;
  if (ELEM_MOVE[bel]) m.move = JSON.parse(JSON.stringify(ELEM_MOVE[bel]));
  if (cls === "brute") m.scale = 1.2;
  BM_MOBS[id] = m;
}

export interface BmCampMob { mob: string; n: number }
export interface BmCamp { id: string; name: string; world: string; x: number; y: number; r: number; mobs: BmCampMob[]; chief: string; respawnMin: number; respawnMax: number; hidden?: boolean; lair?: boolean; loot?: BmCampLoot }
export const CUSTOM_BC = /^bcx_[a-z0-9_]{2,32}$/;
export const BM_CAMPS: Record<string, BmCamp> = {};
export function makeCamp(id: string): BmCamp { return { id, name: "Лагерь чёрных", world: "arinar", x: 0, y: 0, r: 160, mobs: [], chief: "", respawnMin: 60, respawnMax: 120 }; }

/** ЭТАП 2: встроенные лагерь + логово на стихию (вода/камень/природа/молния). По умолчанию скрыты — включает админка («👹 Лагеря»: снять «скрыт»),
 *  так что выкладка ничего не меняет в мире сама. Добыча лагеря — только кусочки своей стихии + сундуки наград; логово — вожак и ярус сундука выше. */
export const BM_CAMP_BUILTIN = new Set<string>();
{ const P: [number, number][] = [[32640, 24000], [16220, 31141], [25067, 11566], [32795, 35402], [7919, 21219], [39343, 14136], [18879, 43499], [19966, 16359]];
  const NM: Record<string, [string, string]> = { water: ["Лагерь прилива", "Логово глубин"], stone: ["Лагерь сколов", "Логово горы"], nature: ["Лагерь терний", "Логово корней"], lightning: ["Лагерь бури", "Логово грома"] };
  const ID: Record<string, string[]> = { water: ["tide_warden", "spray_archer", "deep_seer", "drowned_brute"], stone: ["rock_warden", "shard_archer", "mount_seer", "cliff_brute"], nature: ["thorn_warden", "burr_archer", "trap_seer", "root_brute"], lightning: ["storm_warden", "volt_archer", "tempest_seer", "thunder_brute"] };
  const TIER: Record<string, [string, string]> = { water: ["uncommon", "rare"], stone: ["uncommon", "rare"], nature: ["rare", "strange"], lightning: ["rare", "strange"] };
  let k = 0;
  for (const el of ["water", "stone", "nature", "lightning"]) { const i = ID[el].map((x) => "bmx_" + x);
    for (const lair of [false, true]) { const [x, y] = P[k++], id = `bc_${el}${lair ? "_lair" : ""}`;
      const c = makeCamp(id); Object.assign(c, { name: NM[el][lair ? 1 : 0], world: "arinar", x, y, r: lair ? 220 : 170, hidden: true, lair: lair || undefined,
        mobs: lair ? [{ mob: i[0], n: 2 }, { mob: i[1], n: 2 }, { mob: i[2], n: 1 }] : [{ mob: i[0], n: 2 }, { mob: i[1], n: 2 }],
        chief: lair ? i[3] : "", respawnMin: lair ? 240 : 90, respawnMax: lair ? 420 : 180,
        loot: { drops: lair ? [{ res: pieceId(el, "crystal"), chance: 60, qty: [1, 2] }, { res: pieceId(el, "blade3"), chance: 40, qty: [1, 1] }, { res: shardId(el), chance: 50, qty: [1, 3] }] : [{ res: pieceId(el, "handle"), chance: 50, qty: [1, 2] }, { res: pieceId(el, "blade"), chance: 30, qty: [1, 1] }],
          chests: [{ t: TIER[el][lair ? 1 : 0], chance: lair ? 100 : 35, ...(lair ? { c: 10 } : {}) }] } });
      BM_CAMPS[id] = c; BM_CAMP_BUILTIN.add(id); } } }

// ---------- проверки ----------
const okRes = (r: string) => !!(RESOURCES as any)[r];
export function cleanDrops(v: any): BmDrop[] | string {
  if (!Array.isArray(v) || v.length > 12) return "дроп: список до 12";
  const out: BmDrop[] = [];
  for (const d of v) { const c = Number(d?.chance), a = Math.round(Number(d?.qty?.[0] ?? 1)), b = Math.round(Number(d?.qty?.[1] ?? a));
    if (!okRes(String(d?.res))) return `нет ресурса ${d?.res}`; if (!(c >= 0 && c <= 100) || !(a >= 1 && b >= a && b <= 99)) return "дроп: шанс 0…100, кол-во 1…99"; out.push({ res: String(d.res), chance: c, qty: [a, b] }); }
  return out;
}
export function cleanGear(v: any): BmGear[] | string {
  if (!Array.isArray(v) || v.length > 12) return "снаряжение: список до 12";
  const out: BmGear[] = [];
  for (const g of v) { const id = String(g?.item || ""), c = Number(g?.chance); if (!(ITEM_BY_ID as any)[id]) return `нет предмета ${id}`; if (!(c >= 0 && c <= 100)) return "снаряжение: шанс 0…100"; out.push({ item: id, chance: c }); }
  return out;
}
export function cleanChests(v: any): BmChestDrop[] | string {
  if (!Array.isArray(v) || v.length > 6) return "сундуки: список до 6";
  const out: BmChestDrop[] = [];
  for (const x of v) { const t = String(x?.t || ""), c = Number(x?.chance), cu = Number(x?.c ?? 0), L = Math.round(Number(x?.L ?? 0));
    if (!(BC_TIERS as readonly string[]).includes(t)) return `сундук: нет яруса ${t}`; if (!(c >= 0 && c <= 100)) return "сундук: шанс 0…100"; if (!(cu >= 0 && cu <= 100)) return "сундук: проклятый 0…100 %"; if (!(L >= 0 && L <= 25)) return "сундук: уровень 0…25 (0 — по мобу)";
    out.push({ t, chance: c, ...(cu ? { c: cu } : {}), ...(L ? { L } : {}) }); }
  return out;
}
/** стихии лагеря: стихии его мобов и вожака (обычные мобы — без стихии) */
export function campElems(c: BmCamp, items?: Record<string, any>): Set<string> {
  const s = new Set<string>(); for (const id of [...(c.mobs || []).map((x) => x.mob), c.chief]) { const m = id && BM_MOBS[id]; if (m) s.add(mobElem(m, items)); } return s;
}
/** добыча лагеря: кусочки стихии — только если в лагере есть мобы этой стихии (лагерь без чёрных — без кусочков вовсе) */
export function cleanCampLoot(v: any, c?: BmCamp): BmCampLoot | string {
  if (v == null || v === "") return {}; if (typeof v !== "object" || Array.isArray(v)) return "добыча лагеря: объект {drops, gear, chests}";
  const o: BmCampLoot = {};
  if (v.drops !== undefined) { const d = cleanDrops(v.drops); if (typeof d === "string") return d; o.drops = d; }
  if (v.gear !== undefined) { const g = cleanGear(v.gear); if (typeof g === "string") return g; o.gear = g; }
  if (v.chests !== undefined) { const h = cleanChests(v.chests); if (typeof h === "string") return h; o.chests = h; }
  if (c && o.drops?.length) { const els = campElems(c); for (const d of o.drops) { const re = resElem(d.res); if (re && !els.has(re)) return `${d.res}: кусочки стихии «${re}» — только из лагеря с мобами этой стихии`; } }
  return o;
}
/** бросок сундуков наград (сервер, cryptoRand): список [ярус, проклятый?, уровень] */
export function rollBmChests(list: BmChestDrop[] | undefined, lvl: number, rnd: () => number, mul = 1): { t: string; cur: boolean; L: number }[] {
  const out: { t: string; cur: boolean; L: number }[] = [];
  for (const x of list || []) if (rnd() * 100 < Math.min(100, x.chance * mul)) out.push({ t: x.t, cur: !!x.c && rnd() * 100 < x.c, L: Math.max(1, Math.min(25, x.L || lvl || 1)) });
  return out;
}
/** бросок добычи лагеря (ресурсы/кусочки и снаряжение — по сырым шансам) */
export function rollCampLoot(l: BmCampLoot | undefined, rnd: () => number): { items: string[]; res: Record<string, number> } {
  const out = { items: [] as string[], res: {} as Record<string, number> }; if (!l) return out;
  for (const g of l.gear || []) if (rnd() * 100 < g.chance) out.items.push(g.item);
  for (const d of l.drops || []) if (rnd() * 100 < d.chance) out.res[d.res] = (out.res[d.res] || 0) + d.qty[0] + Math.floor(rnd() * (d.qty[1] - d.qty[0] + 1));
  return out;
}
export function cleanCampMobs(v: any): BmCampMob[] | string {
  if (!Array.isArray(v) || v.length > 8) return "состав: до 8 видов";
  const out: BmCampMob[] = []; let tot = 0;
  for (const e of v) { const id = String(e?.mob || ""), n = Math.round(Number(e?.n)); if (!ZONE_MOBS[id] && !BM_MOBS[id]) return `нет моба ${id}`; if (!(n >= 1 && n <= 40)) return "число мобов 1…40"; tot += n; out.push({ mob: id, n }); }
  if (tot > (BMM_CFG.maxCampMobs || 40)) return `мобов в лагере не больше ${BMM_CFG.maxCampMobs || 40}`;
  return out;
}
/** проверка тела/оружия моба: обязательные слоты, части из своего слота */
export function mobErr(m: BmMob): string | null {
  for (const s of BODY_REQ) if (!m.body?.[s]) return `нужна часть: ${BODY_SLOT_NAMES[s]}`;
  for (const [s, id] of Object.entries(m.body || {})) { if (!id) continue; const b = BM_BODY[id as string]; if (!b) return `нет части тела ${id}`; if (b.slot !== s) return `${b.name}: это не ${BODY_SLOT_NAMES[s]}`; }
  const w = m.weapon || {};
  if (Object.values(w).some(Boolean)) { if (!w.handle || !w.blade) return "оружие: нужны рукоять и лезвие (или пусто)";
    for (const [t, id] of Object.entries(w)) { if (!id) continue; const p = BM_PARTS[id as string]; if (!(BP_TYPES as readonly string[]).includes(t)) return `оружие: неизвестный слот ${t}`; if (!p) return `нет детали ${id}`; if (p.type !== t) return `${p.name}: не ${t}`; } }
  if (m.artId && !/^art_[0-9a-f]{12}$/.test(m.artId)) return "артефакт: id вида art_…";
  if (m.elem && !BP_ELEMS.includes(m.elem)) return "стихия: из списка";
  { const el = mobElem(m); for (const d of m.drops || []) { const re = resElem(d.res); if (re && re !== el && (BMM_CFG.strictElemDrops !== false || re !== "fire")) return `${d.res}: кусочки этой стихии падают только с мобов стихии «${re}» (у моба — «${el}»)`; } }
  if (m.gear !== undefined) { const g = cleanGear(m.gear); if (typeof g === "string") return g; }
  if (m.chests !== undefined) { const h = cleanChests(m.chests); if (typeof h === "string") return h; }
  if (m.move !== undefined) { const v = cleanMove(m.move); if (typeof v === "string") return v; }
  if (!(BM_CLASSES as readonly string[]).includes(m.cls)) return "класс: из списка";
  return null;
}

// ---------- регистрация в мир ----------
/** порядок видов для сетевого индекса (только дописывается: индекс моба в состоянии зоны = BMX_BASE + позиция) */
export const BMX_BASE = 100000;
export const BM_ORDER: string[] = [];
const ordIdx = new Map<string, number>();
export function bmxIndex(type: string): number { let i = ordIdx.get(type); if (i === undefined) { i = BM_ORDER.length; BM_ORDER.push(type); ordIdx.set(type, i); } return BMX_BASE + i; }
export const isBlack = (type: string) => !!(ZONE_MOBS as any)[type]?.black;
/** детали оружия моба: из артефакта (если есть в реестре) или из конструктора */
export function mobWeapon(m: BmMob, items?: Record<string, any>): Record<string, string> {
  const a = m.artId && items?.[m.artId]?.bm?.parts; if (a && typeof a === "object") return { ...a };
  return Object.fromEntries(Object.entries(m.weapon || {}).filter(([, v]) => !!v)) as Record<string, string>;
}
export function mobFinal(m: BmMob, items?: Record<string, any>) {
  let hp = 0, dmg = 0, ar = 0, sp = 0;
  for (const id of Object.values(m.body || {})) { const b = id && BM_BODY[id]; if (b) { hp += b.hp; dmg += b.dmg; ar += b.armor; sp += b.speed; } }
  const C = BMM_CFG.cls[m.cls] || { hp: 1, dmg: 1, speed: 1 }, w = mobWeapon(m, items), armed = !!w.blade;
  const ranged = m.cls === "archer" || m.cls === "mage" || !!(w.blade && (BM_PARTS[w.blade]?.ranged || isStaff(BM_PARTS[w.blade], "blade"))); // посох — дальний, как у игрока
  return { hp: Math.max(1, Math.round(m.hp * (1 + hp / 100) * C.hp)), dmg: Math.max(0, Math.round(m.dmg * (1 + dmg / 100) * C.dmg * (armed ? 1 + (BMM_CFG.weaponDmgPct || 0) / 100 : 1) * 10) / 10),
    armor: Math.max(0, Math.round(m.armor + ar)), speed: Math.max(10, Math.round(m.speed * (1 + sp / 100) * C.speed * (m.move?.spd || 1))), weapon: w, ranged };
}
/** удар чёрного моба — как у игрока с этим лезвием: ближнее — дуга (радиус = досягаемость лезвия, полуугол = arc),
 *  дальнее — настоящий снаряд (дальность лезвия в клетках, не дальше maxRangeTiles; ширина лезвия). Лучник/маг без
 *  дальнего лезвия — снаряд на 8 клеток; без лезвия — короткая дуга «кулаком». cd — рукоять (мс). */
export function mobAtk(w: Record<string, string>, ranged: boolean): { kind: "arc" | "proj"; range: number; arc?: number; width?: number; cd: number; count?: number; shot?: { t: string; n: number; r: number; k: number } } {
  const b: any = w.blade && BM_PARTS[w.blade], h: any = w.handle && BM_PARTS[w.handle], T = BMA_CFG.tile, rm = Math.max(0.1, Number(BMA_CFG.mobRangeMul) || 1);
  const cd = Math.max(200, h?.cd || 900), st = isStaff(b, "blade"), sb = !!b && (b.ranged || st);
  // посохи во 2/3 слоте — по снаряду на каждый (как у игрока); разброс — BMA_CFG.staffSpread (читается при выстреле)
  const n = 1 + (["blade2", "blade3"] as const).filter((k) => w[k] && isStaff(BM_PARTS[w[k]], k)).length;
  if (ranged) return { kind: "proj", range: Math.round(Math.min(BMA_CFG.maxRangeTiles * T, (sb ? Math.max(1, b.rangeTiles || (st ? BMA_CFG.staffRangeTiles : 6)) : 8) * T * rm)), width: sb ? b.width || 20 : 20, cd, ...(n > 1 ? { count: n } : {}), ...(sb && shotOf(b) ? { shot: shotOf(b)! } : {}) }; // этап 2: тип снаряда лезвия
  return { kind: "arc", range: Math.round(Math.max(40, (b && !b.ranged ? b.reach || 110 : 80) * rm)), arc: Math.min(ARC_MAX, b && !b.ranged ? b.arc || 1.1 : 0.9), cd };
}
/** цвет моба: огонь — прежний «#ff5a1a», остальные — цвет стихии (правится в админке) */
export const mobColor = (el: string) => (el === "fire" && ELEM_COLOR.fire === "#ff8a2a" ? "#ff5a1a" : ELEM_COLOR[el] || "#ff5a1a");
/** живая регистрация: ZONE_MOBS[bmx_…] и MONSTER_LOOT (правка «на месте» — ссылки у живых мобов остаются верными) */
export function registerBlackMobs(items?: Record<string, any>) {
  for (const [id, m] of Object.entries(BM_MOBS)) {
    const f = mobFinal(m, items), role = f.ranged ? (m.cls === "mage" ? "caster" : "ranged") : CLASS_ROLE[m.cls] || "melee";
    const mv0 = cleanMove(m.move), mv = mv0 && typeof mv0 === "object" ? mv0 : undefined;
    const def: any = { name: m.name, hp: f.hp, dmg: f.dmg, armor: f.armor, speed: Math.round(f.speed * (mv?.spd || 1)), aggro: m.aggro, xp: m.xp, radius: m.radius, color: mobColor(mobElem(m, items)), lvl: m.lvl, tier: tierOf(m.lvl), role, size: m.scale >= 1.3 ? "l" : "m",
      black: true, cat: "black", bmCls: m.cls, bmHidden: !!m.hidden, elem: mobElem(m, items), bmPure: mobPure(m, items) || undefined, bmAtk: mobAtk(f.weapon, f.ranged), bmMz: staffMuzzles(f.weapon).map(([x, y]) => [x * (m.scale || 1), y * (m.scale || 1)]), bmMove: mv && (mv.dash || mv.blink) ? mv : undefined }; // bmMz — дула посохов (снаряды вылетают из них)
    const cur: any = (ZONE_MOBS as any)[id]; if (cur) { for (const k of Object.keys(cur)) if (!(k in def) && k !== "skills") delete cur[k]; Object.assign(cur, def); } else (ZONE_MOBS as any)[id] = def;
    const L: any = (MONSTER_LOOT as any)[id] || ((MONSTER_LOOT as any)[id] = { gear: [], materials: [] });
    L.materials = (m.drops || []).map((d) => ({ ...d, qty: [...d.qty] })); L.gear = (m.gear || []).map((g) => ({ ...g }));
    bmxIndex(id);
  }
}
/** клиенту: тело/оружие/табличка для отрисовки + порядок индексов */
export function bmmClient(items?: Record<string, any>) {
  const mobs: Record<string, any> = {};
  for (const [id, m] of Object.entries(BM_MOBS)) { const f = mobFinal(m, items); mobs[id] = { name: m.name, cls: m.cls, lvl: m.lvl, elem: mobElem(m, items), pure: mobPure(m, items), body: m.body, weapon: f.weapon, scale: m.scale, cursed: !!m.cursed, ench: m.ench || 0, hidden: !!m.hidden, ranged: f.ranged, hp: f.hp, dmg: f.dmg, armor: f.armor, speed: f.speed, xp: m.xp, aggro: m.aggro, radius: m.radius, drops: m.drops, desc: m.desc || "", move: m.move }; }
  const body: Record<string, any> = {}; for (const [id, b] of Object.entries(BM_BODY)) body[id] = { name: b.name, slot: b.slot, img: b.img, hidden: !!b.hidden, elem: b.elem || "fire" };
  return { order: [...BM_ORDER], mobs, body, vis: BMM_CFG.mobVis, base: BMX_BASE, classes: BM_CLASS_NAMES, ec: { ...(BMA_CFG as any).elemColor } };
}
/** клиент: принять список с сервера (те же таблицы, что у сервера — ZONE_MOBS общий модуль) */
export let BMM_VER = 0;
export function applyBmmClient(d: any, extra?: Record<string, any>) {
  if (!d || typeof d !== "object") return;
  if (d.ec && typeof d.ec === "object") Object.assign((BMA_CFG as any).elemColor ||= {}, d.ec); // цвета стихий из админки — до мобов (color ниже)
  for (const [id, m] of Object.entries<any>(d.mobs || {})) {
    BM_MOBS[id] = { id, name: m.name, cls: m.cls, lvl: m.lvl, elem: m.elem, hp: m.hp, dmg: m.dmg, armor: m.armor, speed: m.speed, aggro: m.aggro, radius: m.radius, xp: m.xp, body: m.body || {}, weapon: m.weapon || {}, scale: m.scale || 1, cursed: m.cursed, ench: m.ench, drops: m.drops || [], hidden: m.hidden, desc: m.desc, ...(m.move ? { move: m.move } : {}) };
    const cur: any = (ZONE_MOBS as any)[id], def = { name: m.name, hp: m.hp, dmg: m.dmg, armor: m.armor, speed: m.speed, aggro: m.aggro, xp: m.xp, radius: m.radius, lvl: m.lvl, tier: tierOf(m.lvl), role: m.ranged ? "ranged" : "melee", size: "m", black: true, bmCls: m.cls, bmHidden: !!m.hidden, elem: m.elem || "fire", color: mobColor(m.elem || "fire"), ...(m.move ? { bmMove: m.move } : {}) };
    if (cur) Object.assign(cur, def); else (ZONE_MOBS as any)[id] = def;
    if (extra && extra !== ZONE_MOBS) { if (extra[id]) Object.assign(extra[id], def, { black: true }); else extra[id] = (ZONE_MOBS as any)[id]; }
  }
  for (const [id, b] of Object.entries<any>(d.body || {})) BM_BODY[id] = { ...(BM_BODY[id] || makeBody(id, b.slot)), ...b, id };
  if (Array.isArray(d.order)) { BM_ORDER.length = 0; ordIdx.clear(); for (const t of d.order) { ordIdx.set(t, BM_ORDER.length); BM_ORDER.push(t); } }
  if (Number.isFinite(d.vis)) BMM_CFG.mobVis = d.vis;
  BMM_VER++;
}
export const bmxTypeAt = (idx: number) => (idx >= BMX_BASE ? BM_ORDER[idx - BMX_BASE] : undefined);
/** случайная длительность возрождения лагеря, с */
export const campRespawn = (c: BmCamp, R: () => number = Math.random) => { const a = Math.max(5, c.respawnMin || 60), b = Math.max(a, c.respawnMax || a); return a + (b - a) * R(); };
export { CUSTOM_BP };
