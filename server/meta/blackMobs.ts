// ЧЁРНАЯ МАГИЯ, этап В: конструктор чёрных мобов из частей тела (Художник: public/bm-art/body), лагеря/логова с таймерами.
//  · bmbody — часть тела (слот, лист Художника, поправки к статам); встроенные — 35 листов Художника, свои — «bbx_…»
//  · bmmob — моб: тело по слотам, оружие (детали кузни или артефакт игрока), класс (табличка), флаги, статы, опыт, дроп
//    → регистрируется в ZONE_MOBS как «bmx_<id>» с black:true (бестиарий/дроп/квесты/доска работают как у обычных мобов)
//  · bmcamp — лагерь: точка, радиус, состав [{mob, n}], вожак, возрождение от/до (с); таймеры — library_meta «bm_timers»
//  · bmmcfg — общие настройки (всё правится в админке, game_overrides; старые сейвы не затронуты — новых полей у игрока нет)
// Снятие с публикации — hidden:1 (никогда не удаление: живые мобы и записи бестиария остаются целы).
import { ZONE_MOBS, MONSTER_LOOT } from "./defs";
import { RESOURCES } from "./shared";
import { BM_PARTS, BP_TYPES, pieceId, CUSTOM_BP } from "./blackArt";
import { mobXp, tierOf } from "./balance";

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
  maxCamps: 30,             // лагерей всего
  maxCustomMobs: 200, maxCustomBody: 300,
  mobVis: 0.6,              // масштаб листа Художника в мире (лист 104 px ≈ 5.2 м; 0.6 → моб ≈ 2.3 м, как обычные крупные)
  weaponDmgPct: 15,         // моб с оружием в руке: +% урона
  refMul: 1.35,             // «Авто по уровню»: × статов обычного моба того же уровня
  cls: { warrior: { hp: 1, dmg: 1, speed: 1 }, archer: { hp: 0.8, dmg: 0.9, speed: 1.05 }, mage: { hp: 0.75, dmg: 1.15, speed: 0.95 }, brute: { hp: 1.5, dmg: 0.85, speed: 0.85 } } as Record<string, { hp: number; dmg: number; speed: number }>,
  campMinDist: 400,         // лагерь не ближе к городу/куполу, px
};

export interface BmBody { id: string; name: string; slot: BodySlot; img: string; hp: number; dmg: number; armor: number; speed: number; hidden?: boolean; desc?: string }
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
export function makeBody(id: string, slot: string): BmBody {
  const s = (BODY_SLOTS as readonly string[]).includes(slot) ? slot as BodySlot : "torso";
  return { id, name: BODY_SLOT_NAMES[s] + " (новая)", slot: s, img: `${s}_1`, hp: 0, dmg: 0, armor: 0, speed: 0 };
}

export interface BmDrop { res: string; chance: number; qty: [number, number] }
export interface BmMob {
  id: string; name: string; desc?: string; cls: string; lvl: number;
  hp: number; dmg: number; armor: number; speed: number; aggro: number; radius: number; xp: number;
  body: Partial<Record<BodySlot, string>>;
  weapon: Partial<Record<string, string>>;   // детали кузни (handle/blade/…) — пусто: без оружия
  artId?: string;                            // артефакт игрока в руке (art_…): тогда детали — из него
  cursed?: boolean; ench?: number;           // всегда проклятый / ярус зачарования (0 — по броску мира)
  scale: number; drops: BmDrop[]; gear?: { item: string; chance: number }[]; hidden?: boolean;
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
  ["bmx_forge_brute", "Горновой громила", "brute", 12, { tail: 3, armL: 2, legL: 2, torso: 5, legR: 2, head: 4, armR: 2 }, { handle: "fire_handle", blade: "fire_blade", blade2: "fire_blade2", blade3: "fire_blade3" }, [{ res: pieceId("fire", "blade2"), chance: 15, qty: [1, 2] }, { res: pieceId("fire", "blade3"), chance: 15, qty: [1, 2] }]],
];
export const BM_MOBS: Record<string, BmMob> = {};
for (const [id, name, cls, lvl, body, weapon, drops] of BUILTIN) {
  const m = makeMob(id, lvl, cls); m.name = name; m.body = Object.fromEntries(Object.entries(body).map(([s, v]) => [s, `fb_${s}_${v}`])); m.weapon = { ...weapon }; m.drops = drops;
  if (cls === "brute") m.scale = 1.2;
  BM_MOBS[id] = m;
}

export interface BmCampMob { mob: string; n: number }
export interface BmCamp { id: string; name: string; world: string; x: number; y: number; r: number; mobs: BmCampMob[]; chief: string; respawnMin: number; respawnMax: number; hidden?: boolean; lair?: boolean }
export const CUSTOM_BC = /^bmc_[a-z0-9_]{2,32}$/;
export const BM_CAMPS: Record<string, BmCamp> = {};
export function makeCamp(id: string): BmCamp { return { id, name: "Лагерь чёрных", world: "arinar", x: 0, y: 0, r: 160, mobs: [], chief: "", respawnMin: 60, respawnMax: 120 }; }

// ---------- проверки ----------
const okRes = (r: string) => !!(RESOURCES as any)[r];
export function cleanDrops(v: any): BmDrop[] | string {
  if (!Array.isArray(v) || v.length > 12) return "дроп: список до 12";
  const out: BmDrop[] = [];
  for (const d of v) { const c = Number(d?.chance), a = Math.round(Number(d?.qty?.[0] ?? 1)), b = Math.round(Number(d?.qty?.[1] ?? a));
    if (!okRes(String(d?.res))) return `нет ресурса ${d?.res}`; if (!(c >= 0 && c <= 100) || !(a >= 1 && b >= a && b <= 99)) return "дроп: шанс 0…100, кол-во 1…99"; out.push({ res: String(d.res), chance: c, qty: [a, b] }); }
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
  const ranged = m.cls === "archer" || m.cls === "mage" || !!(w.blade && BM_PARTS[w.blade]?.ranged);
  return { hp: Math.max(1, Math.round(m.hp * (1 + hp / 100) * C.hp)), dmg: Math.max(0, Math.round(m.dmg * (1 + dmg / 100) * C.dmg * (armed ? 1 + (BMM_CFG.weaponDmgPct || 0) / 100 : 1) * 10) / 10),
    armor: Math.max(0, Math.round(m.armor + ar)), speed: Math.max(10, Math.round(m.speed * (1 + sp / 100) * C.speed)), weapon: w, ranged };
}
/** живая регистрация: ZONE_MOBS[bmx_…] и MONSTER_LOOT (правка «на месте» — ссылки у живых мобов остаются верными) */
export function registerBlackMobs(items?: Record<string, any>) {
  for (const [id, m] of Object.entries(BM_MOBS)) {
    const f = mobFinal(m, items), role = f.ranged ? (m.cls === "mage" ? "caster" : "ranged") : CLASS_ROLE[m.cls] || "melee";
    const def: any = { name: m.name, hp: f.hp, dmg: f.dmg, armor: f.armor, speed: f.speed, aggro: m.aggro, xp: m.xp, radius: m.radius, color: "#ff5a1a", lvl: m.lvl, tier: tierOf(m.lvl), role, size: m.scale >= 1.3 ? "l" : "m",
      black: true, cat: "mob", bmCls: m.cls, bmHidden: !!m.hidden };
    const cur: any = (ZONE_MOBS as any)[id]; if (cur) { for (const k of Object.keys(cur)) if (!(k in def) && k !== "skills") delete cur[k]; Object.assign(cur, def); } else (ZONE_MOBS as any)[id] = def;
    const L: any = (MONSTER_LOOT as any)[id] || ((MONSTER_LOOT as any)[id] = { gear: [], materials: [] });
    L.materials = (m.drops || []).map((d) => ({ ...d, qty: [...d.qty] })); L.gear = (m.gear || []).map((g) => ({ ...g }));
    bmxIndex(id);
  }
}
/** клиенту: тело/оружие/табличка для отрисовки + порядок индексов */
export function bmmClient(items?: Record<string, any>) {
  const mobs: Record<string, any> = {};
  for (const [id, m] of Object.entries(BM_MOBS)) { const f = mobFinal(m, items); mobs[id] = { name: m.name, cls: m.cls, lvl: m.lvl, body: m.body, weapon: f.weapon, scale: m.scale, cursed: !!m.cursed, ench: m.ench || 0, hidden: !!m.hidden, ranged: f.ranged, hp: f.hp, dmg: f.dmg, armor: f.armor, speed: f.speed, xp: m.xp, aggro: m.aggro, radius: m.radius, drops: m.drops, desc: m.desc || "" }; }
  const body: Record<string, any> = {}; for (const [id, b] of Object.entries(BM_BODY)) body[id] = { name: b.name, slot: b.slot, img: b.img, hidden: !!b.hidden };
  return { order: [...BM_ORDER], mobs, body, vis: BMM_CFG.mobVis, base: BMX_BASE, classes: BM_CLASS_NAMES };
}
/** клиент: принять список с сервера (те же таблицы, что у сервера — ZONE_MOBS общий модуль) */
export function applyBmmClient(d: any) {
  if (!d || typeof d !== "object") return;
  for (const [id, m] of Object.entries<any>(d.mobs || {})) {
    BM_MOBS[id] = { id, name: m.name, cls: m.cls, lvl: m.lvl, hp: m.hp, dmg: m.dmg, armor: m.armor, speed: m.speed, aggro: m.aggro, radius: m.radius, xp: m.xp, body: m.body || {}, weapon: m.weapon || {}, scale: m.scale || 1, cursed: m.cursed, ench: m.ench, drops: m.drops || [], hidden: m.hidden, desc: m.desc };
    const cur: any = (ZONE_MOBS as any)[id], def = { name: m.name, hp: m.hp, dmg: m.dmg, armor: m.armor, speed: m.speed, aggro: m.aggro, xp: m.xp, radius: m.radius, color: "#ff5a1a", lvl: m.lvl, tier: tierOf(m.lvl), role: m.ranged ? "ranged" : "melee", size: "m", black: true, bmCls: m.cls, bmHidden: !!m.hidden };
    if (cur) Object.assign(cur, def); else (ZONE_MOBS as any)[id] = def;
  }
  for (const [id, b] of Object.entries<any>(d.body || {})) BM_BODY[id] = { ...(BM_BODY[id] || makeBody(id, b.slot)), ...b, id };
  if (Array.isArray(d.order)) { BM_ORDER.length = 0; ordIdx.clear(); for (const t of d.order) { ordIdx.set(t, BM_ORDER.length); BM_ORDER.push(t); } }
  if (Number.isFinite(d.vis)) BMM_CFG.mobVis = d.vis;
}
export const bmxTypeAt = (idx: number) => (idx >= BMX_BASE ? BM_ORDER[idx - BMX_BASE] : undefined);
/** случайная длительность возрождения лагеря, с */
export const campRespawn = (c: BmCamp, R: () => number = Math.random) => { const a = Math.max(5, c.respawnMin || 60), b = Math.max(a, c.respawnMax || a); return a + (b - a) * R(); };
export { CUSTOM_BP };
