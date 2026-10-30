import { OUTLEVEL_SOLO_BOSS } from "./balance";
// Открытые миры (Аринар — государство Мэлвелдил; Поляна хаба): общие для всех онлайн-игроков мобы и узлы ресурсов.
// Полностью серверный авторитет: позиции/HP мобов, урон по игрокам, сбор, дроп. Клиент лишь присылает
// намерения (атаковать / начать-закончить сбор / применить навык) — сервер проверяет дистанцию и кд.
// ИИ по ролям (bestiary.ts): melee, swarm, charger (замах → рывок), ranged (линия-телеграф → выстрел),
// caster (круг-телеграф под целью), tank (медленный, не отбрасывается). Крупные/боссы — набор
// телеграфируемых атак по фазам (60% / 30% ХП): круги, линии, кольцо, «волна» вокруг, призыв, ярость.
import { CURSE } from "./cursed";
import { ENCH, rollMobTier, tierDef, tierOk, mobRegenPct } from "./enchant";
import { resolveWorld, freeSpot } from "./propCollision.ts";
import { wetNear } from "./liquid.ts";
import { WET } from "./zoneGen";
WET.f = wetNear; // узлы сбора — не в воде/лаве
const MOB_R = 12;
import { mobShot } from "./mobFamily";
import { GATHER_CFG, gatherRange, gatherSlack, gatherTimeMs } from "./gatherCfg";
import { ZONE_MOBS, campChiefType, ABILITY_BY_ID, GATHER_RANGE, GATHER_TIME_MS, ZONE_ATTACK_RANGE, ZONE_ATTACK_CD_MS } from "./defs";
import "./zoneTables"; // заполняет таблицы мобов регионов (только сервер)
import { summonPool } from "./biomes";
import { ZONE_GEN, BOSS_TIMERS, rng, inSafe, isNight, genNodes, genOf, type Region, type WorldGen } from "./zoneGen";
import { WORLD_CHUNK } from "../worlds/sizes";

// Навыки боссов и проклятых (ids — базы навыков бестиария). Обычный босс — ровно 1 навык, проклятый — 2–5.
import { MOB_SKILLS, MOB_NATIVE } from "./mobSkills";
import { shapeOf } from "./abilityShapes";
import { pathWorld, steer, hbTouch, SK_DEFS, castCraft, skBuffAdd, skBuffSum } from "./skillCraft";
import { projSprite } from "./abilityShapes";
import { mitigateDamage } from "./balance";
import { BMA_CFG, bmSkillPct, bmPure, bmDefendEx, pureSum, pureEvFields, staffDirs, shotOrigins, mobShotOrigins, aimDirs, faceLeftOf, swingEv } from "./blackArt";
import { BM_MOBS, BM_CAMPS, BMM_CFG, bmxIndex, campRespawn, campElems, type BmCamp } from "./blackMobs";
export { MOB_SKILLS };
const SKILL_IDS = Object.keys(MOB_SKILLS);
const hashStr = (t: string) => { let h = 2166136261; for (let i = 0; i < t.length; i++) h = Math.imul(h ^ t.charCodeAt(i), 16777619); return h >>> 0; };
/** навыки моба: детерминированно по типу (+соль для проклятых) */
export function skillsFor(type: string, n: number, salt = 0): string[] {
  const r = rng(hashStr(type) ^ salt), pool = [...SKILL_IDS], out: string[] = [];
  while (out.length < n && pool.length) out.push(pool.splice(Math.floor(r() * pool.length), 1)[0]);
  return out;
}
/** явные навыки моба из админки (Бестиарий); случайные добираются в Zone.rollSkills */
export function ownSkills(d: any): string[] {
  // чёрный моб: + навыки деталей его оружия (поле «Навык части» в кузне), как у артефакта игрока
  return [...new Set([...((d?.skills as string[] | undefined) || []), ...((d?.bmSkills as string[] | undefined) || [])])].filter((k) => MOB_SKILLS[k]).slice(0, 5);
}
/** сколько случайных навыков у босса: мировой (special=boss) — CURSE.worldBossSkills*, обычный босс — CURSE.bossSkills*, остальные — 0 */
export function bossSkillRange(m: { special?: string }, d: any): [number, number] {
  const C: any = CURSE;
  if (m.special === "boss") return [C.worldBossSkillsMin ?? 5, C.worldBossSkillsMax ?? 10];
  if (d?.boss) return [C.bossSkillsMin ?? 1, C.bossSkillsMax ?? 3];
  return [0, 0];
}
// ---------- множители силы моба (единая точка: урон, броня, ХП; панель «Цель» берёт отсюда же) ----------
/** Ярус зачарования моба (0 — нет; 1…6 — ENCH.tiers, админка «✦ Зачарование»). */
export function enchTier(m: { ench?: number }): number { return tierOk(m.ench) ? m.ench! : 0; }
/** ОЗ моба без верхнего предела в бестиарии: произведение множителей (проклятие × ярус × элита × отряд) держим целым и в пределах точных целых JS. */
export const capHp = (v: number) => Math.max(1, Math.min(Number.MAX_SAFE_INTEGER, Math.round(Number(v) || 0)));
export function enchMul(m: { ench?: number }, what: "hp" | "dmg" | "armor" | "xp"): number {
  const t = tierDef(m.ench); if (!t) return 1;
  const v = Number(what === "hp" ? t.mobHp : what === "dmg" ? t.mobDmg : what === "armor" ? t.mobArmor : t.mobXp);
  return Number.isFinite(v) && v >= 0 ? v : 1;
}
/** «Убийца»: проклятый или ярус с флагом killer (Чёрный) — скорость, рывок, агрессия и натиск как у проклятого. */
export const isKiller = (m: { cursed?: boolean; ench?: number }) => !!m.cursed || !!tierDef(m.ench)?.killer;
type MobFlags = { type: string; elite?: boolean; chief?: boolean; cursed?: boolean; enraged?: boolean; special?: string; ench?: number };
/** Урон моба, ×: элита × вожак × проклятие × зачарование; enrage — ярость босса/мирового (как раньше, только у них). */
export function mobDmgMul(m: MobFlags, enrage = true): number {
  const d: any = ZONE_MOBS[m.type], G: any = ZONE_GEN;
  let k = (m.elite ? ZONE_GEN.eliteDmg : 1) * (m.chief ? ZONE_GEN.chiefDmg : 1) * (m.cursed ? CURSE.mobDmg : 1) * enchMul(m, "dmg");
  if (enrage && m.enraged && (m.special === "boss" || d?.boss)) k *= G.bossEnrageDmg || 2.8;
  return k;
}
/** Броня моба, ×: элита × проклятие × зачарование. vsMob — удар другого моба: проклятие ослаблено (×(1+(N−1)·0.67), как было). */
export function mobArmorMul(m: MobFlags, vsMob = false): number {
  const c = m.cursed ? (vsMob ? 1 + (CURSE.mobArmor - 1) * 0.67 : CURSE.mobArmor) : 1;
  return (m.elite ? ZONE_GEN.eliteArmor : 1) * c * enchMul(m, "armor");
}
/** Действующие броня и урон удара (для панели «Цель»): база бестиария (с правками админки) × множители. */
export function mobEffStats(m: MobFlags): { armor: number; dmg: number } {
  const d: any = ZONE_MOBS[m.type] || {}, r1 = (x: number) => Math.round(x * 10) / 10;
  return { armor: r1((d.armor || 0) * mobArmorMul(m)), dmg: r1((d.dmg || 0) * mobDmgMul(m)) };
}
const ck = (x: number, y: number) => Math.floor(x / WORLD_CHUNK) * 4096 + Math.floor(y / WORLD_CHUNK);
// ячейка сна мельче чанка интереса: камера 30 клеток (AOI ±607 px) — бодрствует 3×3 ячейки по 1000 px вокруг игрока (≥1000 px во все стороны)
const SLEEP_CELL = 1000;
const sk = (x: number, y: number) => Math.floor(x / SLEEP_CELL) * 4096 + Math.floor(y / SLEEP_CELL);

export interface ZCast { proj?: string; fx?: string; leap?: boolean; kind: "circle" | "line" | "ring" | "nova"; at: number; x: number; y: number; dx?: number; dy?: number; r?: number; r0?: number; len?: number; w?: number; dmg: number; bm?: number } // bm — навык артефакта: % макс. ОЗ игрока (чёрный урон)
/** удары игрока по мобу: всего, навыками, автоатакой; full — первый удар пришёлся по целому мобу без чужого урона */
export type MobHits = { n: number; ab: number; ba: number; full: boolean };
/** как игрок sid убил моба m (только по серверному учёту ударов): одним ударом — его первый и единственный удар по целому мобу,
 *  других бойцов не было и добил именно он (не урон по времени); только навыками / только автоатакой — по видам его ударов */
export function killHow(m: { hb?: Map<string, MobHits>; dmgBy: Map<string, number>; k1?: string; usedAbility: Set<string> }, sid: string) {
  const hb = m.hb?.get(sid); if (!hb) return { oneshot: 0, skillOnly: 0, basicOnly: 0 };
  const solo1 = [...m.dmgBy.keys()].every((k) => k === sid);
  return { oneshot: hb.n === 1 && hb.full && m.k1 === sid && solo1 ? 1 : 0, skillOnly: hb.ab > 0 && hb.ba === 0 ? 1 : 0, basicOnly: hb.ba > 0 && hb.ab === 0 && !m.usedAbility.has(sid) ? 1 : 0 };
}
export interface ZMob { id: number; type: string; respawn: number; sx: number; sy: number; x: number; y: number; hp: number; maxHp: number; dead: boolean; respawnAt: number;
  targetSid: string | null; wanderX: number; wanderY: number; nextWander: number; atkCd: number; dmgBy: Map<string, number>; usedAbility: Set<string>; hb?: Map<string, MobHits>; k1?: string; qf?: Map<string, number>; // qf: начало боя игрока с мобом (условия квестов)
  windup: number; dashX: number; dashY: number; dashT: number;
  hpBase?: number; // ОЗ бестиария (d.hp), от которых посчитаны maxHp: правка ОЗ в админке пересчитывает живых мобов (syncMobStats)
  // процедурный спавн: регион, элита, простой вне боя (для деспавна); fixed — классическая точка респавна
  fixed: boolean; region: string | null; elite: boolean; idle: number; chief?: boolean;
  // статусы от оружия игроков (сервер-авторитет): урон по времени, замедление, отбрасывание
  dot: { kind: string; dps: number; until: number; sid: string } | null; dots?: { kind: string; dps: number; until: number; sid: string }[]; slowUntil: number; kbx: number; kby: number;
  // телеграфы в полёте, фаза босса, ярость, особый тип (boss/rare), время жизни редкого
  casts: ZCast[]; phase: number; enraged: boolean; special: "" | "boss" | "rare"; expireAt: number; patIdx: number;
  // раунд Аринара: проклятый (10%), навыки и их кд, «сброс» поводка, рывок агрессии, лагерь
  cursed: boolean; ench?: number; skills: string[]; skCd: Record<string, number>; reset: boolean; burstUntil: number; camp: number; leapCd: number; shieldUntil: number;
  // бой моб↔моб (кочевники и враждебные фракции): цель-моб, время следующего осмотра; маршрут кочевника
  mobTarget: number; scanAt: number; roam: { pts: [number, number][]; i: number; home: [number, number]; waitUntil: number } | null;
  // бродячий моб (ambient): sid игрока-«хозяина», охота до huntUntil, множитель респавна лагеря (rk × campRespawn — живая правка)
  ambient?: string; huntUntil?: number; bornAt?: number; rk?: number }
export interface ZNode { id: number; type: string; res: string; respawn: number; x: number; y: number; readyAt: number; qty: [number, number]; by?: Map<string, number> } // by: личные таймеры (ключ игрока → когда снова готов)
export interface ZPlayer { sid: string; x: number; y: number; hp: number; maxHp: number; armorRed: number; alive: boolean; respawnAt: number; lvl?: number }

// ---------- фракции (бой моб↔моб) ----------
// Фракция — тема биома варианта (ice_/fire_/stone_/air_) или «дикие» (старые ярусы). Таблица враждебности
// симметрична: стихии воюют по кругу соседей, дикие — со всеми стихиями. Своя фракция не враждует.
export const HOSTILITY: Record<string, string[]> = {
  ice: ["fire", "air", "wild"], fire: ["ice", "stone", "wild"], stone: ["fire", "air", "wild"], air: ["stone", "ice", "wild"],
  wild: ["ice", "fire", "stone", "air"],
};
// чёрные мобы (конструктор, этап В) — своя фракция «black», враждебна всем обычным
for (const k of Object.keys(HOSTILITY)) HOSTILITY[k].push("black");
HOSTILITY.black = ["ice", "fire", "stone", "air", "wild"];
export const factionOf = (type: string) => { if ((ZONE_MOBS as any)[type]?.black) return "black"; const k = type.split("_")[0]; return HOSTILITY[k] && k !== "wild" && k !== "black" ? k : "wild"; };
export const hostile = (a: string, b: string) => HOSTILITY[factionOf(a)].includes(factionOf(b));
/** гладкий шум 0..1 (значения в узлах решётки step, билинейно) — плотность лагерей «пятнами» */
function valueNoise(seed: number, step: number) {
  const h = (i: number, j: number) => { let x = Math.imul(i, 374761393) ^ Math.imul(j, 668265263) ^ seed; x = Math.imul(x ^ (x >>> 13), 1274126177); return ((x ^ (x >>> 16)) >>> 0) / 4294967296; };
  return (x: number, y: number) => {
    const gx = x / step, gy = y / step, i = Math.floor(gx), j = Math.floor(gy), fx = gx - i, fy = gy - j;
    const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
    const a = h(i, j) + (h(i + 1, j) - h(i, j)) * sx, b = h(i, j + 1) + (h(i + 1, j + 1) - h(i, j + 1)) * sx;
    return a + (b - a) * sy;
  };
}
export const regSig = (r: any) => JSON.stringify([r.dens, r.packs, r.pack, r.elite, r.eliteMax, r.bossOn, popMul()]); // + численность лагерей (админка «Спавн»)
/** множитель численности лагерей (ZONE_GEN.campPopMul, 0.25…4; не число — 1) */
export const popMul = () => { const v = Number((ZONE_GEN as any).campPopMul); return Number.isFinite(v) && v > 0 ? Math.min(4, Math.max(0.25, v)) : 1; };
/** когда воскреснет моб лагеря: случайно в [campRespawnMin, campRespawnMax] с; оба 0 — старое campRespawn × ранг (вожак ×2, кочевник ×1.5) */
export function campRespawnSec(rk: number, R: () => number = Math.random) {
  const G: any = ZONE_GEN, a = Math.max(0, Number(G.campRespawnMin) || 0), b = Math.max(0, Number(G.campRespawnMax) || 0);
  if (!a && !b) return (Number(G.campRespawn) || 45) * rk;
  const lo = Math.min(a || b, b || a), hi = Math.max(a, b);
  return lo + R() * (hi - lo);
}
export const DOT_STACK_MAX = 5; // стаков одного статуса на цели
const MOB_INDEX: Record<string, number> = Object.fromEntries(Object.keys(ZONE_MOBS).map((k, i) => [k, i]));
// выстрел дальнобойного моба: спрайт по стихии
/** вспышка купола при выталкивании моба: не чаще раза в столько мс на моба */
export const DOME_FLASH_CD_MS = 3000;
/** …и не больше стольких вспышек в секунду на всю зону (толпа у купола — без потока событий) */
export const DOME_FLASH_PER_SEC = 12;
const KNOCK_IMMUNE = (d: any) => !!d.boss || d.size !== "s" || d.role === "tank";
const segDist = (px: number, py: number, x: number, y: number, dx: number, dy: number, len: number) => {
  const t = Math.max(0, Math.min(len, (px - x) * dx + (py - y) * dy));
  return Math.hypot(px - (x + dx * t), py - (y + dy * t));
};

/** точка (x,y) с телом радиуса r — внутри дуги удара (ox,oy → dx,dy; радиус range, полуугол arc)? Одна формула для
 *  ударов игрока по мобам и игрокам и для чёрных мобов — визуал дуги (конус range × 2·arc) совпадает с хитбоксом. */
export function inArc(ox: number, oy: number, dx: number, dy: number, range: number, arc: number, x: number, y: number, r: number) {
  const ex = x - ox, ey = y - oy, along = ex * dx + ey * dy;
  if (along < -r || along > range + r) return false;
  const dist = Math.hypot(ex, ey);
  if (dist > range + r) return false;
  if (dist <= r + 10) return true;
  return Math.acos(Math.max(-1, Math.min(1, along / (dist || 1)))) <= (arc || 1);
}
// Снаряды — сущности сервера: летят со скоростью, урон в момент попадания (не мгновенно), столкновения считает сервер.
// owner "p" — снаряд игрока (бьёт мобов), "m" — снаряд моба (бьёт игроков, от него можно увернуться).
export interface Proj {
  id: number; o: "p" | "m"; sid?: string; mob?: number; t: string; x: number; y: number; dx: number; dy: number; spd: number; range: number; w: number;
  max: number; flown: number; hit: Set<number | string>; n: number; arc?: boolean; delay?: number; born: number;
  onHit?: (target: any, i: number) => void; onEnd?: (x: number, y: number, hit: boolean) => void;
  /** 🜏 артефакт/чёрный моб: bm — флаг, bf — доля заряда при выстреле, sz — размер спрайта (ширина/20); vm — снаряд моба по мобам (foe — кто враг, onMob — попадание) */
  bm?: number; bf?: number; sz?: number; vm?: number; foe?: (m: any) => boolean; onMob?: (m: any, i: number) => void;
  /** 🛠 конструктор навыков: траектория (skillCraft.pathAt; x0/y0/ax/ay — старт и прицел), хитбокс по картинке, наведение */
  pth?: { p: string; a?: number; f?: number; b?: number[]; turn?: number; seek?: number }; hb?: any; x0?: number; y0?: number; ax?: number; ay?: number;
  hx?: number; hy?: number; tg?: any; turned?: number; hbR?: number;
  /** 🜏 этап 2: тип снаряда дальнего лезвия (blackArt shotOf: explode/ricochet/pierce/split; n/r/k), стихия (цвет у клиента),
   *  onAux — вторичный удар (цель, × урона): взрыв по соседям, отскок, осколок; child — осколок (без своего типа) */
  shot?: { t: string; n: number; r: number; k: number } | null; el?: string; onAux?: (target: any, k: number) => void; child?: number; boom?: number;
}
export const PROJ_SPEED: Record<string, number> = { default: 640, auto_bow: 900, thorn_bow: 900, spear: 820, pierce: 820, auto_daggers: 760, daggers: 760, fireball: 560, fire_spark: 760, ice_bolt: 760, moon_orb: 520, split_shard: 620, war_axe: 600, ice_fan: 720, auto_staff: 620, auto_claws: 700, chain_bolt: 1100, mob: 420, bm_arrow_small: 620, bm_arrow_big: 620 };

/** Биты статусов моба для снимка: вид (8/16/32 — поджог/яд/кровотечение) + стаки каждого вида по 3 бита (13–15, 16–18, 19–21; максимум 7). */
export function mobStatusBits(dots: { kind: string; until: number }[] | undefined, now: number): number {
  let st = 0;
  if (dots?.length) for (const dd of dots) if (dd.until > now) { const i = dd.kind === "burn" ? 0 : dd.kind === "poison" ? 1 : 2; st |= 8 << i; const sh = 13 + i * 3, c = (st >> sh) & 7; if (c < 7) st = (st & ~(7 << sh)) | ((c + 1) << sh); }
  return st;
}
/** «Отброс» навыка в пикселях на единицу — как у моба (applyStatus: скорость k·6, сдвиг ×10/с, затухание 0.75 за тик 100 мс ≈ 24 px) */
export const KNOCK_PX = 24;
export class Zone {
  projs: Proj[] = []; private nextProj = 1;
  /** Чёрный маг (blackMage.ts): купола гасят урон игроков и снаряды; null — мира без мага */
  guard: { guardMobHit(m: any, sid: string, ax: number, ay: number): boolean; noteFight(m: any, sid: string): void; guardProj(p: any, x0: number, y0: number, x1: number, y1: number): boolean; inDome(x: number, y: number): any; blackHit?(p: any, pl: any): boolean; pvpHit?(p: any, pl: any): boolean } | null = null;
  /** город под куполом (city.ts): мобы внутрь не заходят, спавнов внутри нет; null — в мире нет города */
  keepOut: { inside(x: number, y: number, pad?: number): boolean; out(x: number, y: number): [number, number]; skip?(m: ZMob, boss: boolean): boolean; around?(x: number, y: number, dx: number, dy: number): [number, number]; aggroPad?(): number; flash?(): boolean } | null = null; // skip — моб не выталкивается (боссы при mobBossesOut=false); aggroPad — запас сброса агро у края; flash — вспышка купола при выталкивании
  domeFlashWin = { t: 0, n: 0 };
  safeAt(x: number, y: number, pad = 0) { return inSafe(x, y, pad, this.world) || !!this.keepOut?.inside(x, y, pad); }
  /** убрать лагеря и мобов, чей дом внутри купола (после постройки лагерей — сид и порядок лагерей остального мира не меняются) */
  pruneKeepOut() {
    const K = this.keepOut; if (!K) return 0; let n = 0;
    const gone = new Set(this.camps.filter((c) => K.inside(c.x, c.y, 200)).map((c) => c.id));
    for (const m of this.mobs) if (!m.dead && m.respawnAt !== -1 && ((m.camp && gone.has(m.camp)) || (m.special !== "boss" && K.inside(m.sx ?? m.x, m.sy ?? m.y, 60)))) { m.dead = true; m.respawnAt = -1; m.camp = 0; n++; }
    this.camps = this.camps.filter((c) => !gone.has(c.id)); (this as any).campCache && ((this as any).campCache.at = 0);
    return n;
  }
  pl: Map<string, ZPlayer> | null = null; // игроки последнего такта (позиция атакующего для купола)
  /** выпустить снаряд (сервер); событие proj — клиентам для отрисовки (траектория детерминирована) */
  fire(o: Partial<Proj> & { o: "p" | "m"; t: string; x: number; y: number; dx: number; dy: number; range: number; w: number; max: number }) {
    if (this.projs.length > 600) return null; // предохранитель
    const L = Math.hypot(o.dx, o.dy) || 1;
    const p: Proj = { spd: PROJ_SPEED[o.t] || PROJ_SPEED.default, flown: 0, hit: new Set(), n: 0, born: this.now || Date.now(), id: this.nextProj++, ...o, dx: o.dx / L, dy: o.dy / L } as Proj;
    if (p.pth) { p.x0 = p.x; p.y0 = p.y; p.ax = p.dx; p.ay = p.dy; p.hx = p.dx; p.hy = p.dy; }
    if (p.hb) p.hbR = p.hb.s === "c" ? p.hb.r : Math.max(Math.abs(p.hb.a0), Math.abs(p.hb.a1), p.hb.hw);
    if (p.shot && p.shot.t === "pierce") p.max = Math.max(p.max, Math.max(1, Math.round(p.shot.n || 1))); // пробивной: N целей насквозь
    this.projs.push(p);
    this.events.push({ k: "proj", _b: p.born, ...(p.pth ? { pth: { p: p.pth.p, a: p.pth.a, f: p.pth.f, b: p.pth.b, turn: p.pth.turn } } : {}), cid: (p as any).cid, id: p.id, o: p.o, sid: p.sid, t: p.t, x: Math.round(p.x), y: Math.round(p.y), dx: +p.dx.toFixed(3), dy: +p.dy.toFixed(3), s: p.spd, r: Math.round(p.range), arc: p.arc ? 1 : undefined, cz: (p as any).cz ? 1 : undefined, sz: (p as any).sz, bm: (p as any).bm, mob: p.o === "m" ? p.mob : undefined, el: p.el || undefined, st: p.shot?.t || undefined });
    return p;
  }
  /** 🜏 этап 2: вторичный эффект снаряда по типу (вызывается при первом попадании; взрыв — и в конце полёта без попадания).
   *  Цели — мобы для снаряда игрока, игроки для снаряда моба; уже задетые снарядом пропускаются. Событие shx (x/y — для AOI). */
  shotFx(p: Proj, tgt: any | null, x: number, y: number, players: Map<string, ZPlayer>) {
    const S = p.shot; if (!S || p.child || !p.onAux) return;
    const isP = p.o === "p";
    const idOf = (t: any) => isP ? t.id : t.sid;
    const pick = (cx: number, cy: number, r: number, skip: Set<number | string>) => {
      const out: { t: any; d: number }[] = [];
      if (isP) { for (const m of this.near(cx, cy, r + 60)) { if (m.dead || m.reset || skip.has(m.id)) continue; const d = Math.hypot(m.x - cx, m.y - cy); if (d <= r + (ZONE_MOBS[m.type]?.radius || 16)) out.push({ t: m, d }); } }
      else for (const pl of players.values()) { if (!pl.alive || skip.has(pl.sid)) continue; const d = Math.hypot(pl.x - cx, pl.y - cy); if (d <= r + 14) out.push({ t: pl, d }); }
      return out.sort((a, b) => a.d - b.d);
    };
    const r = Math.max(0, Number(S.r) || 0), k = Math.max(0, Number(S.k) || 0), n = Math.max(1, Math.min(8, Math.round(Number(S.n) || 1)));
    if (S.t === "explode") {
      if (p.boom) return; p.boom = 1;
      for (const c of pick(x, y, r, p.hit)) { p.hit.add(idOf(c.t)); p.onAux(c.t, k); }
      this.events.push({ k: "shx", t: "explode", x: Math.round(x), y: Math.round(y), r, el: p.el, o: p.o });
    } else if (S.t === "ricochet" && tgt) {
      const seen = new Set(p.hit); let cur = tgt, kk = 1; const pts: number[][] = [[Math.round(tgt.x), Math.round(tgt.y)]];
      for (let j = 0; j < n; j++) {
        const c = pick(cur.x, cur.y, r, seen)[0]; if (!c) break;
        seen.add(idOf(c.t)); p.hit.add(idOf(c.t)); kk *= k; p.onAux(c.t, kk); cur = c.t; pts.push([Math.round(cur.x), Math.round(cur.y)]);
      }
      if (pts.length > 1) this.events.push({ k: "shx", t: "ric", x: pts[0][0], y: pts[0][1], pts, el: p.el, o: p.o });
    } else if (S.t === "split" && tgt) {
      const base = Math.atan2(p.dy, p.dx), spread = 1.1, aux = p.onAux;
      for (let j = 0; j < n; j++) {
        const a = base + (n === 1 ? 0 : -spread / 2 + spread * j / (n - 1));
        const c = this.fire({ o: p.o, sid: p.sid, mob: p.mob, t: p.t, x, y, dx: Math.cos(a), dy: Math.sin(a), range: Math.max(30, r), w: Math.max(8, Math.round(p.w * 0.6)), max: 1, spd: p.spd,
          child: 1, el: p.el, bm: p.bm, sz: p.sz ? +(p.sz * 0.6).toFixed(2) : undefined, vm: undefined, onHit: (t: any) => aux(t, k) } as any);
        if (c) for (const h of p.hit) c.hit.add(h);
      }
      this.events.push({ k: "shx", t: "split", x: Math.round(x), y: Math.round(y), n, el: p.el, o: p.o });
    }
  }
  /** 🛠 шаг снаряда по траектории конструктора навыков: путь детерминирован от старта (клиент считает так же);
   *  самонаведение — поворот к цели (ptg — клиенту, на кого наводится); бумеранг на развороте снова может задеть тех же */
  pathStep(p: Proj, st: number) {
    const P = p.pth!;
    if (P.p === "homing") {
      let tg = p.tg;
      if (p.o === "m" && (!tg || !tg.alive)) { // снаряд моба наводится на игроков
        tg = null; let best = Infinity;
        for (const q of (this.pl || new Map()).values()) { if (!q.alive || p.hit.has(q.sid)) continue; const ex = q.x - p.x, ey = q.y - p.y, d = Math.hypot(ex, ey), fw = (ex * p.dx + ey * p.dy) / (d || 1); if (d > (P.seek || 420) || fw < -0.2) continue; const sc = d * (1.6 - fw); if (sc < best) { best = sc; tg = q; } }
        p.tg = tg; if (tg) this.events.push({ k: "ptg", id: p.id, m: "p:" + tg.sid });
      } else if (p.o !== "m" && (!tg || tg.dead)) {
        tg = null; let best = Infinity;
        for (const m of this.near(p.x, p.y, P.seek || 420)) { if (m.dead || p.hit.has(m.id)) continue; const ex = m.x - p.x, ey = m.y - p.y, d = Math.hypot(ex, ey), fw = (ex * p.dx + ey * p.dy) / (d || 1); if (fw < -0.2) continue; const sc = d * (1.6 - fw); if (sc < best) { best = sc; tg = m; } }
        p.tg = tg; if (tg) this.events.push({ k: "ptg", id: p.id, m: tg.id });
      }
      if (tg) [p.dx, p.dy] = steer(p.dx, p.dy, tg.x - p.x, tg.y - p.y, P.turn || 240, st / Math.max(1, p.spd));
      p.x += p.dx * st; p.y += p.dy * st; p.hx = p.dx; p.hy = p.dy;
      return;
    }
    const w = pathWorld(P as any, p.x0!, p.y0!, p.ax!, p.ay!, p.flown + st, p.range);
    p.x = w[0]; p.y = w[1]; p.hx = w[2]; p.hy = w[3];
    if (P.p === "boomerang" && !p.turned && p.flown + st >= p.range / 2) { p.turned = 1; p.hit.clear(); }
  }
  /** движение и столкновения снарядов: шаги не длиннее ширины снаряда (быстрый снаряд не «перепрыгивает» моба) */
  updateProjs(dt: number, players: Map<string, ZPlayer>) {
    for (let i = this.projs.length - 1; i >= 0; i--) {
      const p = this.projs[i];
      let left = Math.min(p.range - p.flown, p.spd * dt), done = false;
      if (p.arc) { // навесной (фляга): летит над головами, урон — по месту падения
        p.flown += left; p.x += p.dx * left; p.y += p.dy * left;
        if (p.flown >= p.range - 0.5) done = true;
      } else while (left > 0 && !done) {
        const st = Math.min(left, Math.max(6, p.w * 0.5)); left -= st;
        const x0 = p.x, y0 = p.y;
        if (p.pth) this.pathStep(p, st); else { p.x += p.dx * st; p.y += p.dy * st; }
        p.flown += st;
        if (this.guard && this.guard.guardProj(p, x0, y0, p.x, p.y)) { done = true; break; } // купол / тело Чёрного мага
        if (p.o === "p") {
          for (const m of this.near(p.x, p.y, (p.hbR ? p.hbR * 2 : p.w) + 60)) {
            if (m.dead || p.hit.has(m.id)) continue;
            if (p.hb ? !hbTouch(p.hb, p.x, p.y, p.hx ?? p.dx, p.hy ?? p.dy, m.x, m.y, ZONE_MOBS[m.type].radius) : Math.hypot(m.x - p.x, m.y - p.y) > ZONE_MOBS[m.type].radius + p.w / 2) continue;
            p.hit.add(m.id); const k = p.n++; p.onHit?.(m, k); if (k === 0 && p.shot) this.shotFx(p, m, m.x, m.y, players); // n считаем и без onHit (взрыв в onEnd)
            if (p.n >= p.max) { done = true; break; }
          }
          // PK: автоатака игрока задевает игроков (решает guard.pvpHit: PK-режим, самооборона, безопасные зоны)
          if (!done && (p as any).pv && !(p as any).blk && this.guard?.pvpHit) for (const pl of players.values()) {
            if (!pl.alive || pl.sid === p.sid || p.hit.has(pl.sid) || Math.hypot(pl.x - p.x, pl.y - p.y) > 14 + p.w / 2) continue;
            if (!this.guard.pvpHit(p, pl)) continue;
            p.hit.add(pl.sid); p.n++;
            if (p.n >= p.max) { done = true; break; }
          }
          // «чёрный» выстрел игрока, вылетевший из купола (blackMage.ts blackShot): бьёт и других игроков — как стрела мага
          if (!done && (p as any).blk && this.guard?.blackHit) for (const pl of players.values()) {
            if (!pl.alive || pl.sid === p.sid || p.hit.has(pl.sid) || Math.hypot(pl.x - p.x, pl.y - p.y) > 14 + p.w / 2) continue;
            if (!this.guard.blackHit(p, pl)) continue;
            p.hit.add(pl.sid); const k = p.n++; void k;
            if (p.n >= p.max) { done = true; break; }
          }
        } else if ((p as any).vm) { // снаряд чёрного моба в драке с мобами: бьёт враждебных мобов на пути (от него тоже можно уйти)
          const foe = (p as any).foe as ((m: ZMob) => boolean) | undefined;
          for (const m of this.near(p.x, p.y, p.w + 60)) {
            if (m.dead || m.reset || m.id === p.mob || p.hit.has(m.id) || (foe && !foe(m))) continue;
            if (Math.hypot(m.x - p.x, m.y - p.y) > ZONE_MOBS[m.type].radius + p.w / 2) continue;
            p.hit.add(m.id); const k = p.n++; (p as any).onMob?.(m, k);
            if (p.n >= p.max) { done = true; break; }
          }
        } else {
          for (const pl of players.values()) {
            if (!pl.alive || p.hit.has(pl.sid) || ((p as any).only && (p as any).only !== pl.sid)) continue; // only — стрела мага летит только в напавшего
            if (Math.hypot(pl.x - p.x, pl.y - p.y) > 14 + p.w / 2) continue;
            p.hit.add(pl.sid); const k = p.n++; p.onHit?.(pl, k); if (k === 0 && p.shot) this.shotFx(p, pl, pl.x, pl.y, players);
            if (p.n >= p.max) { done = true; break; }
          }
        }
        if (p.flown >= p.range - 0.5) done = true;
      }
      if (done) {
        this.projs.splice(i, 1);
        this.events.push({ k: "pend", id: p.id, x: Math.round(p.x), y: Math.round(p.y), hit: p.n > 0 ? 1 : undefined, t: (p as any).blk ? "bm_arrow_small" : p.t }); // чёрный выстрел — конец рисует клиент мага
        if (p.shot?.t === "explode") this.shotFx(p, null, p.x, p.y, players); // взрыв в конце полёта (и без попадания)
        p.onEnd?.(p.x, p.y, p.n > 0);
      }
    }
  }
  mobs: ZMob[] = [];
  nodes: ZNode[] = [];
  events: any[] = [];
  world: string;
  gen: WorldGen;
  size: number;
  // процедурный режим
  proc: boolean;
  seed: number;
  rand: () => number;
  nextId = 1;
  tokens = ZONE_GEN.burst;
  dirAcc = 0;
  // мировые боссы и редкие: тип → время следующего появления / id живого
  bossAt: Record<string, number> = {};
  bossIds: Record<string, number> = {};
  rareAt: Record<string, number> = {};
  rareIds: Record<string, number> = {};
  rareNext: Record<string, { x: number; y: number; reg: string }> = {}; // заранее выбранное место следующего появления редкого (там же отсчёт для игроков)
  rareDirty = false;  // таймеры изменились — сервису пора сохранить их (чтобы перезапуск не сбрасывал отсчёт)
  rareHold = false;   // пока сохранённые таймеры не подгружены, новые не заводим
  stats = { spawned: 0, despawned: 0, rejected: 0, awake: 0, asleep: 0, resets: 0, domeDrops: 0, domeMoved: 0, cursed: 0, ench: 0, roamers: 0, mobHits: 0, mobKills: 0 };
  byId = new Map<number, ZMob>();
  buckets = new Map<number, ZMob[]>(); // чанк WORLD_CHUNK → мобы (интерес/выборки)
  awake = new Set<number>();           // чанки рядом с игроками (остальные спят: без ИИ)
  camps: { id: number; region: string; x: number; y: number; types: string[] }[] = [];
  now = Date.now(); // время текущего такта (для телеграфов)

  constructor(world: string, spawns: { type: string; x: number; y: number; respawn: number }[], nodes: { type: string; res: string; x: number; y: number; respawn: number; qty: [number, number] }[],
    opts: { proc?: boolean; seed?: number } = {}) {
    this.world = world;
    this.gen = genOf(world);
    this.size = this.gen.size;
    this.proc = !!opts.proc;
    this.seed = (opts.seed ?? this.gen.seed) >>> 0;
    this.rand = rng(this.seed);
    spawns.forEach((s) => this.addMob(s.type, s.x, s.y, { fixed: true, respawn: s.respawn }));
    const nodeList = this.proc ? genNodes(this.seed, world) : nodes.map((n, i) => ({ id: 1000 + i, ...n }));
    nodeList.forEach((n) => this.nodes.push({ id: n.id, type: n.type, res: n.res, respawn: n.respawn, x: n.x, y: n.y, readyAt: 0, qty: n.qty }));
    if (this.gen.camps) this.buildCamps();
    this.reindex();
  }

  // Лагеря (органично): «дротики» Пуассона с ПЕРЕМЕННЫМ минимумом (campMinDist…×2.3) и плотностью по гладкому шуму —
  // где-то лагеря кучно (но не ближе campMinDist: бой с одной пачкой не тянет соседей), где-то пустоши.
  // Форма пачки: клякса / цепочка / две кучки / полумесяц; размер пачки плавает. Затем кочевники (roamPct).
  buildCamps() {
    const G = ZONE_GEN, R = rng(this.seed ^ 0xc0ffee);
    const dens = valueNoise(this.seed ^ 0x51ed, 3200), dens2 = valueNoise(this.seed ^ 0x9a1, 900);
    const CELL = 1000, grid = new Map<number, { x: number; y: number }[]>();
    const gk = (x: number, y: number) => Math.floor(x / CELL) * 4096 + Math.floor(y / CELL);
    const tooClose = (x: number, y: number, d: number) => {
      const r = Math.ceil(d / CELL), cx = Math.floor(x / CELL), cy = Math.floor(y / CELL);
      for (let i = -r; i <= r; i++) for (let j = -r; j <= r; j++) for (const c of grid.get((cx + i) * 4096 + cy + j) || []) if (Math.hypot(c.x - x, c.y - y) < d) return true;
      return false;
    };
    for (const reg of this.gen.regions) this.buildRegionCamps(reg, R, dens, dens2, grid, gk, tooClose);
    this.buildRoamers(R);
  }
  /** лагеря одной локации (и при старте, и при правке плотности в админке — тогда старые лагеря локации убираются) */
  buildRegionCamps(reg: any, R: () => number, dens: (x: number, y: number) => number, dens2: (x: number, y: number) => number, grid: Map<number, any[]>, gk: (x: number, y: number) => number, tooClose: (x: number, y: number, d: number) => boolean) {
    const G = ZONE_GEN;
    this.regBuilt[reg.id] = regSig(reg); // с какими настройками построены лагеря (пересборка — только при изменении)
    {
      if (!reg.table.length || reg.dens === 0) return;
      const w = reg.rect[2] - reg.rect[0], h = reg.rect[3] - reg.rect[1];
      const want = Math.max(1, Math.round((w * h) / (G.campStep * G.campStep) * G.campFill * (reg.dens ?? 1)));
      const minMul = 1 / Math.sqrt(Math.max(0.25, reg.dens ?? 1)); // гуще — лагеря ближе (но не ближе 0.5×)
      let made = 0;
      for (let t = 0; t < want * 14 && made < want; t++) {
        const x = Math.round(reg.rect[0] + 60 + R() * (w - 120)), y = Math.round(reg.rect[1] + 60 + R() * (h - 120));
        const dn = 0.65 * dens(x, y) + 0.35 * dens2(x, y);                  // 0..1: густо/пусто
        if (R() > G.campAccept + dn * dn * 1.3) continue;
        const minD = G.campMinDist * Math.max(0.5, minMul) * (1 + (1 - dn) * 1.8 * R() + (R() < 0.15 ? 0.6 : 0));       // в густых пятнах — ближе (но ≥ campMinDist)
        if (inSafe(x, y, 300, this.world) || this.gen.bosses.some((b) => Math.hypot(b.x - x, b.y - y) < 700)) continue;
        if (this.keepOut?.inside(x, y, 200 + G.campRing)) continue; // пересборка лагерей (админка) — не под куполом города и не у самого края (как pruneKeepOut)
        if (tooClose(x, y, minD)) continue;
        if (wetNear(this.world, x, y, G.campRing + 40)) continue; // лагерь целиком на суше (вода/лава непроходимы — liquid.ts)
        let tw = reg.table.reduce((a, b) => a + b.w, 0) * R(), row = reg.table[0];
        for (const tr of reg.table) { tw -= tr.w; if (tw <= 0) { row = tr; break; } }
        // БОЛЬШОЙ лагерь: 2–3 пачки по кругу (радиус campRing) + вожак в центре (иногда два вожака)
        const alt = reg.table.filter((tr) => tr.type !== row.type && ["ranged", "charger", "caster"].includes(ZONE_MOBS[tr.type]?.role));
        const nPacks = reg.packs ? reg.packs[0] + Math.floor(R() * (reg.packs[1] - reg.packs[0] + 1)) : R() < G.campPacks3 ? 3 : 2, a0 = R() * Math.PI * 2;
        let elites = 0; const eliteMax = reg.eliteMax ?? 99;
        const placed: [number, number][] = [];
        const spot = (x0: number, y0: number): [number, number] => { // не ближе 24 px к любому мобу лагеря (спираль наружу)
          for (let t = 0; t < 40; t++) { const a = t * 2.4, rr = t ? 10 + t * 5 : 0; const qx = this.clamp(x0 + Math.cos(a) * rr), qy = this.clamp(y0 + Math.sin(a) * rr);
            if (placed.every((o) => Math.hypot(o[0] - qx, o[1] - qy) >= 24)) { placed.push([qx, qy]); return [qx, qy]; } }
          const q: [number, number] = [this.clamp(x0), this.clamp(y0)]; placed.push(q); return q; };
        const camp = { id: ++this.campSeq, region: reg.id, x, y, types: [] as string[], packs: nPacks, chiefs: 0 };
        this.camps.push(camp); made++;
        const k = gk(x, y); const gb = grid.get(k); if (gb) gb.push(camp); else grid.set(k, [camp]);
        for (let pk = 0; pk < nPacks; pk++) {
          let n = row.pack[0] + Math.floor(R() * (row.pack[1] - row.pack[0] + 1));
          const roll = R(); if (roll < 0.18) n = Math.min(6, n + 1); else if (roll < 0.3) n = Math.max(2, n - 1);
          if (reg.pack) n = reg.pack[0] + Math.floor(R() * (reg.pack[1] - reg.pack[0] + 1)); // админка: мобов в пачке
          { const pm = popMul(); if (pm !== 1) { const nm = n * pm, fr = (Math.imul(x * 73856093 ^ y * 19349663 ^ (pk + 1) * 83492791, 2654435761) >>> 0) / 4294967296; n = Math.max(1, Math.min(15, Math.floor(nm) + (fr < nm - Math.floor(nm) ? 1 : 0))); } } // численность лагерей ×campPopMul (админка «Спавн»); дробь — по хешу места, R() не тратим: раскладка лагерей та же
          const eliteThis = R() < reg.elite && elites < eliteMax; if (eliteThis) elites++; // шанс элиты — на пачку, не больше eliteMax в лагере
          const prow = pk > 0 && R() < 0.35 ? reg.table[Math.floor(R() * reg.table.length)] : row; // соседняя пачка бывает другого вида
          const types: string[] = [];
          for (let i = 0; i < n; i++) types.push(i === n - 1 && n >= 3 && alt.length ? alt[Math.floor(R() * alt.length)].type : prow.type);
          const a = a0 + (pk / nPacks) * Math.PI * 2 + (R() - 0.5) * 0.6, rr = G.campRing * (0.8 + R() * 0.4);
          const px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr;
          for (const [i, p] of this.formation(n, R).entries()) {
            const [qx, qy] = spot(px + p[0] * 0.7, py + p[1] * 0.7);
            const m = this.addMob(types[i], qx, qy, { fixed: true, respawn: G.campRespawn, region: reg.id, elite: reg.eliteMax == null ? R() < reg.elite : eliteThis && i === 0 }); // без правки — как раньше (шанс на моба); с лимитом из админки — шанс на пачку, ≤ eliteMax в лагере
            m.rk = 1; m.camp = camp.id; camp.types.push(types[i]);
          }
        }
        // вожак: самый сильный вид региона, элита, ×chiefHp ОЗ, ×chiefDmg урон; в части лагерей — двое
        const strong = campChiefType(reg.table)!; // тот же выбор, что у категории «Вожак» Бестиария (bestiaryReg.ts)
        const nChief = R() < G.campTwoChiefs ? 2 : 1;
        for (let c = 0; c < nChief; c++) {
          const [qx, qy] = spot(x + (nChief > 1 ? (c ? 26 : -26) : 0), y);
          const m = this.addMob(strong, qx, qy, { fixed: true, respawn: G.campRespawn * 2, region: reg.id, elite: true });
          m.chief = true; m.rk = 2; m.camp = camp.id; m.maxHp = m.hp = this.hpOf(m, 1); m.hpBase = ZONE_MOBS[strong].hp; camp.types.push(strong); camp.chiefs++;
        }
      }
    }
  }
  campSeq = 0; regBuilt: Record<string, string> = {};
  /** Админка поменяла плотность локации: убрать её лагеря (мобы снимаются обычным путём «мёртв без респавна» — без дублей,
   *  мешки добычи живут отдельно и не теряются) и построить заново по новым правилам. Мобы в бою с игроком — тоже убираются. */
  regenRegion(id: string) {
    const reg = this.gen.regions.find((r) => r.id === id); if (!reg || !this.gen.camps) return 0;
    const old = new Set(this.camps.filter((c) => c.region === id).map((c) => c.id));
    let removed = 0;
    for (const m of this.mobs) if (m.camp && old.has(m.camp)) { m.dead = true; m.respawnAt = -1; m.camp = 0; removed++; }
    this.camps = this.camps.filter((c) => !old.has(c.id));
    const CELL = 1000, grid = new Map<number, any[]>(), gk = (x: number, y: number) => Math.floor(x / CELL) * 4096 + Math.floor(y / CELL);
    for (const c of this.camps) { const k = gk(c.x, c.y); const g = grid.get(k); if (g) g.push(c); else grid.set(k, [c]); }
    const tooClose = (x: number, y: number, d: number) => { const r = Math.ceil(d / CELL), cx = Math.floor(x / CELL), cy = Math.floor(y / CELL);
      for (let i = -r; i <= r; i++) for (let j = -r; j <= r; j++) for (const c of grid.get((cx + i) * 4096 + cy + j) || []) if (Math.hypot(c.x - x, c.y - y) < d) return true; return false; };
    const R = rng(this.seed ^ 0xc0ffee ^ (Date.now() & 0xffff));
    this.buildRegionCamps(reg, R, valueNoise(this.seed ^ 0x51ed, 3200), valueNoise(this.seed ^ 0x9a1, 900), grid, gk, tooClose);
    this.campCache.at = 0;
    return removed;
  }
  /** смещения членов пачки: неровные формы, минимум 24 px между мобами */
  formation(n: number, R: () => number): [number, number][] {
    const shape = R(), ang = R() * Math.PI * 2, spread = 34 + R() * 70, out: [number, number][] = [];
    const ca = Math.cos(ang), sa = Math.sin(ang);
    for (let i = 0; i < n; i++) {
      let best: [number, number] = [0, 0];
      for (let t = 0; t < 12; t++) {
        let u: number, v: number;
        if (shape < 0.45) { const r = spread * Math.sqrt(R()) * (0.6 + R() * 0.6), a = R() * 6.283; u = Math.cos(a) * r; v = Math.sin(a) * r * (0.5 + R() * 0.7); } // клякса
        else if (shape < 0.7) { u = (i - (n - 1) / 2) * (30 + R() * 22) + (R() - 0.5) * 18; v = (R() - 0.5) * 30 + Math.sin(i * 1.3) * 14; } // цепочка
        else if (shape < 0.9) { const side = i % 2 ? 1 : -1; u = side * spread * (0.7 + R() * 0.5) + (R() - 0.5) * 30; v = (R() - 0.5) * 40; } // две кучки
        else { const a = -1.2 + (n > 1 ? (i / (n - 1)) * 2.4 : 0) + (R() - 0.5) * 0.4, r = spread * (0.8 + R() * 0.4); u = Math.cos(a) * r - spread * 0.5; v = Math.sin(a) * r; } // полумесяц
        const x = u * ca - v * sa, y = u * sa + v * ca;
        best = [Math.round(x), Math.round(y)];
        if (out.every((o) => Math.hypot(o[0] - x, o[1] - y) >= 24)) break;
        if (t === 11) { const a = R() * 6.283; for (let r = 30; r < 200; r += 12) { const bx = Math.round(Math.cos(a) * r), by = Math.round(Math.sin(a) * r); if (out.every((o) => Math.hypot(o[0] - bx, o[1] - by) >= 24)) { best = [bx, by]; break; } } }
      }
      out.push(best);
    }
    return out;
  }
  /** кочевники: roamPct от мобов региона, 1–2 в группе; маршрут — петля по 3–4 соседним лагерям (часто — враждебной фракции) */
  buildRoamers(R: () => number) {
    const G = ZONE_GEN;
    const byReg = new Map<string, typeof this.camps>();
    for (const c of this.camps) { const l = byReg.get(c.region); if (l) l.push(c); else byReg.set(c.region, [c]); }
    for (const reg of this.gen.regions) {
      const own = byReg.get(reg.id); if (!own || !reg.table.length) continue;
      const mobsIn = own.reduce((a, c) => a + c.types.length, 0);
      let quota = Math.floor(mobsIn * G.roamPct + R());
      for (let g = 0; quota > 0 && g < 200; g++) {
        const start = own[Math.floor(R() * own.length)];
        const row = reg.table[Math.floor(R() * reg.table.length)];
        if (ZONE_MOBS[row.type]?.role === "tank") continue;
        const cand = this.camps.filter((c) => c !== start && Math.hypot(c.x - start.x, c.y - start.y) < G.roamRange);
        if (cand.length < 2) continue;
        const foe = cand.filter((c) => hostile(row.type, c.types[0])), pick: typeof cand = [];
        for (let k = 0, n = 2 + Math.floor(R() * 2); k < n; k++) { const pool = foe.length && R() < 0.5 ? foe : cand; const c = pool[Math.floor(R() * pool.length)]; if (!pick.includes(c)) pick.push(c); }
        // точка у лагеря, не в центре (кочевник проходит мимо — агрится/агрит, если враждебны)
        const pts: [number, number][] = [[start.x, start.y], ...pick].map((c: any) => { const a = R() * 6.283, r = 140 + R() * 120; return [this.clamp(Math.round((c.x ?? c[0]) + Math.cos(a) * r)), this.clamp(Math.round((c.y ?? c[1]) + Math.sin(a) * r))] as [number, number]; })
          .filter((p) => !this.safeAt(p[0], p[1], 120));
        if (pts.length < 2) continue;
        const k = Math.min(quota, R() < 0.55 ? 1 : 2);
        for (let i = 0; i < k; i++) {
          const m = this.addMob(row.type, pts[0][0] + i * 28, pts[0][1] + i * 18, { fixed: true, respawn: G.campRespawn * 1.5, region: reg.id, elite: R() < reg.elite });
          m.roam = { pts, i: 1, home: [m.x, m.y], waitUntil: 0 }; m.rk = 1.5;
          this.stats.roamers++;
        }
        quota -= k;
      }
    }
  }
  // ---------- бой моб↔моб ----------
  /** ближайший враждебный живой моб в радиусе r (не сбрасывающийся) */
  findFoe(m: ZMob, r: number): ZMob | null {
    let best: ZMob | null = null, bd = r;
    for (const o of this.near(m.x, m.y, r)) {
      if (o === m || o.reset || o.special || !hostile(m.type, o.type)) continue;
      if (!m.roam && !o.roam && !(((ZONE_MOBS as any)[m.type]?.black || (ZONE_MOBS as any)[o.type]?.black) && this.playerNear(m.x, m.y, (BMM_CFG.fightNearTiles || 0) * 32))) continue; // лагеря не воюют друг с другом — только с кочевниками; чёрные — со всеми, если рядом игрок
      const d = Math.hypot(o.x - m.x, o.y - m.y); if (d < bd) { bd = d; best = o; }
    }
    return best;
  }
  /** живой игрок ближе r px (чёрные мобы дерутся с обычными только на глазах у игроков — иначе мир спит) */
  playerNear(x: number, y: number, r: number) { if (!(r > 0) || !this.pl) return false; for (const p of this.pl.values()) if (p.alive && Math.abs(p.x - x) < r && Math.abs(p.y - y) < r && Math.hypot(p.x - x, p.y - y) < r) return true; return false; }
  // ---------- лагеря/логова чёрных мобов (админка «👹 Чёрные мобы») ----------
  bmSig = ""; bmCampNum = new Map<string, number>(); bmSeq = 900000; bmCheckAt = 0;
  bmPending: Record<string, number> | null = null; // таймеры возрождения из library_meta (после перезапуска)
  /** где лагерь нельзя ставить (город/купол/безопасная зона) — текст причины или null */
  bmCampErr(c: BmCamp) { const pad = BMM_CFG.campMinDist || 0; if (this.safeAt(c.x, c.y, pad)) return "слишком близко к городу/безопасной зоне"; if (!(c.x >= 0 && c.y >= 0 && c.x <= this.size && c.y <= this.size)) return "за краем мира"; return null; }
  /** привести мобов лагерей к таблице BM_CAMPS (правка админки — лагерь пересобирается; таймеры живых не трогаются у неизменённых) */
  syncBlackCamps(now = Date.now(), force = false) {
    if (!force && now < this.bmCheckAt) return; this.bmCheckAt = now + 2000;
    const want0 = BMM_CFG.on ? Object.values(BM_CAMPS).filter((c) => !c.hidden && c.world === this.world && !this.bmCampErr(c)).slice(0, BMM_CFG.maxCamps || 30) : [];
    // лагеря разных стихий не рядом: первый в таблице остаётся, соседний чужой стихии (ближе elemGap) не ставится
    const gap = Number(BMM_CFG.elemGap) || 0, want: BmCamp[] = [], wEl: Set<string>[] = [];
    for (const c of want0) { const e = campElems(c); const clash = gap > 0 && e.size > 0 && want.some((a, i) => wEl[i].size > 0 && ![...e].some((x) => wEl[i].has(x)) && Math.hypot(a.x - c.x, a.y - c.y) < gap);
      if (!clash) { want.push(c); wEl.push(e); } }
    const sigOf = (c: BmCamp) => JSON.stringify([c.x, c.y, c.r, c.mobs, c.chief, c.lair, c.respawnMin, c.respawnMax]);
    const sig = JSON.stringify(want.map((c) => [c.id, sigOf(c)])); if (sig === this.bmSig && !force) return; this.bmSig = sig;
    const keep = new Map(want.map((c) => [c.id, sigOf(c)]));
    // убрать мобов снятых/изменённых лагерей
    const drop = new Set<string>();
    for (const m of this.mobs) { const k = (m as any).bmc as string | undefined; if (!k || m.respawnAt === -1) continue; if (keep.get(k) !== (m as any).bmSig) { drop.add(k); } }
    for (const m of this.mobs) { const k = (m as any).bmc; if (k && drop.has(k) && m.respawnAt !== -1) { m.dead = true; m.respawnAt = -1; m.camp = 0; } }
    this.camps = this.camps.filter((c) => !(c.region.startsWith("bm:") && (drop.has(c.region.slice(3)) || !keep.has(c.region.slice(3)))));
    const have = new Set<string>(); for (const m of this.mobs) if ((m as any).bmc && m.respawnAt !== -1) have.add((m as any).bmc);
    for (const c of want) {
      if (have.has(c.id)) continue;
      let num = this.bmCampNum.get(c.id); if (!num) { num = this.bmSeq++; this.bmCampNum.set(c.id, num); }
      const list: string[] = []; if (c.chief) list.push(c.chief); for (const e of c.mobs) for (let i = 0; i < e.n; i++) list.push(e.mob);
      const cap = BMM_CFG.maxCampMobs || 40; list.length = Math.min(list.length, cap);
      const types: string[] = [];
      list.forEach((t, i) => { if (!(ZONE_MOBS as any)[t]) return;
        const a = (i / Math.max(1, list.length)) * Math.PI * 2 + 0.3, rr = i === 0 && c.chief ? 0 : c.r * (0.35 + 0.55 * ((i * 0.618) % 1));
        const m = this.addMob(t, this.clamp(Math.round(c.x + Math.cos(a) * rr)), this.clamp(Math.round(c.y + Math.sin(a) * rr)), { fixed: true, respawn: c.respawnMin, region: "bm:" + c.id, elite: (i === 0 && !!c.chief) || !!c.lair });
        m.camp = num!; (m as any).bmc = c.id; (m as any).bmSig = keep.get(c.id); (m as any).bmSlot = i; (m as any).bmElite = m.elite; if (i === 0 && c.chief) m.chief = true;
        const tk = this.bmPending?.[c.id + ":" + i]; if (tk && tk > now) { m.dead = true; m.hp = 0; m.respawnAt = tk; }
        types.push(t); });
      this.camps.push({ id: num, region: "bm:" + c.id, x: c.x, y: c.y, types });
    }
    this.bmPending = null; (this as any).campCache && ((this as any).campCache.at = 0);
  }
  /** таймеры возрождения мёртвых мобов чёрных лагерей: «лагерь:слот» → время (мс) */
  bmTimers(now = Date.now()) { const o: Record<string, number> = {}; for (const m of this.mobs) { const k = (m as any).bmc; if (k && m.dead && m.respawnAt > now) o[k + ":" + (m as any).bmSlot] = m.respawnAt; } return o; }
  /** удар моба по мобу (броня цели учитывается); вклад копится в dmgBy под ключом "mob:<id>" — игрок без ≥15% вклада награды не получит */
  mobHit(src: ZMob, t: ZMob, dmg: number, onKill: (m: ZMob) => void) {
    if (t.dead || t.reset) return 0;
    const d = ZONE_MOBS[t.type];
    const armor = d.armor * mobArmorMul(t, true);
    const sh = t.shieldUntil > this.now ? 0.5 : 1, sd: any = ZONE_MOBS[src.type];
    // ICE: чистый урон чёрного моба по мобу — % его макс. ОЗ × pureMob × класс цели
    const pp = sd?.bmPure ? bmPure(src.maxHp || sd.hp, sd.bmPure, t.special === "boss" ? "boss" : t.elite ? "elite" : "mob", (Number(BMA_CFG.pureMob) || 0) * sh) : null;
    const pv = pureEvFields(pp);
    const real = Math.max(1, Math.round(mitigateDamage(dmg, armor) * sh)) + pureSum(pp);
    t.hp -= real; t.dmgBy.set("mob:" + src.id, (t.dmgBy.get("mob:" + src.id) || 0) + real);
    if (!t.targetSid && !t.mobTarget) { t.mobTarget = src.id; this.rally(t, src.id); }
    this.events.push({ k: "hit", id: t.id, d: real, mob: 1, ...pv });
    this.stats.mobHits++;
    if (t.hp <= 0) { this.stats.mobKills++; (t as any).killer = "mob:" + src.id; this.kill(t, onKill); }
    return real;
  }
  /** пачка лагеря поднимается на защиту (против моба) */
  /** Лагеря для мини-карты/трекера: [id, x, y, живых, всего, состояние 0 спит/1 бой/2 пуст, радиус агро, типы, сек до возрождения]. Кэш ~1 с. */
  private campCache: { at: number; list: any[] } = { at: 0, list: [] };
  campSummary(now = Date.now()) {
    if (now - this.campCache.at < 1000) return this.campCache.list;
    const by = new Map<number, ZMob[]>();
    for (const m of this.mobs) if (m.camp) { const l = by.get(m.camp); if (l) l.push(m); else by.set(m.camp, [m]); }
    this.campCache = { at: now, list: this.camps.map((c) => {
      const ms = by.get(c.id) || [], alive = ms.filter((m) => !m.dead);
      const fight = alive.some((m) => m.targetSid || m.mobTarget);
      const aggro = Math.max(0, ...[...new Set(c.types)].map((t) => ZONE_MOBS[t]?.aggro || 0));
      const spread = Math.max(0, ...ms.map((m) => Math.hypot(m.sx - c.x, m.sy - c.y)));
      const ra = ms.filter((m) => m.dead && m.respawnAt > now).map((m) => m.respawnAt); // [8] — сек до ближайшего возрождения (0 — некого ждать)
      return [c.id, Math.round(c.x), Math.round(c.y), alive.length, ms.length, fight ? 1 : alive.length ? 0 : 2, Math.round(spread + aggro), [...new Set(c.types)], ra.length ? Math.ceil((Math.min(...ra) - now) / 1000) : 0];
    }) };
    return this.campCache.list;
  }
  rally(m: ZMob, foe: number) { if (m.camp) for (const o of this.near(m.x, m.y, 360)) if (o.camp === m.camp && !o.targetSid && !o.mobTarget && !o.reset) o.mobTarget = foe; }
  /** чёрный моб: враг для его удара — живой моб другой (враждебной) фракции, не он сам */
  bmFoe(m: ZMob) { const f = factionOf(m.type); return (t: ZMob) => t !== m && !t.dead && !t.reset && factionOf(t.type) !== f && (hostile(m.type, t.type) || hostile(t.type, m.type) || t.mobTarget === m.id || m.mobTarget === t.id); }
  /** взмах чёрного моба: событие marc (клиент рисует огненную дугу ровно range × 2·arc) и урон КАЖДОМУ внутри дуги, по разу:
   *  игрокам (onHit) и враждебным мобам (mobHit). Возвращает число задетых. */
  bmSwing(m: ZMob, d: any, ux: number, uy: number, dmgP: number, dmgM: number, players: Map<string, ZPlayer> | null, onHit: ((sid: string, dmg: number, src: string, mob?: ZMob, bm?: number, how?: string) => void) | null, onKill: (m: ZMob) => void) {
    const A = d.bmAtk, R = A.range, arc = A.arc || 1, max = Math.max(1, BMA_CFG.arcMax | 0), seen = new Set<number | string>();
    this.events.push({ k: "marc", id: m.id, x: Math.round(m.x), y: Math.round(m.y), dx: +ux.toFixed(3), dy: +uy.toFixed(3), r: R, a: +arc.toFixed(3), ...(d.elem && d.elem !== "fire" ? { el: d.elem } : {}), ...swingEv() });
    if (players && onHit) for (const p of players.values()) {
      if (seen.size >= max) break;
      if (!p.alive || seen.has(p.sid) || !inArc(m.x, m.y, ux, uy, R, arc, p.x, p.y, 14)) continue;
      seen.add(p.sid); onHit(p.sid, dmgP, m.type, m, undefined, "swing");
    }
    const foe = this.bmFoe(m);
    for (const t of this.near(m.x, m.y, R + 80)) {
      if (seen.size >= max) break;
      if (seen.has(t.id) || !foe(t) || !inArc(m.x, m.y, ux, uy, R, arc, t.x, t.y, ZONE_MOBS[t.type].radius)) continue;
      seen.add(t.id); this.mobHit(m, t, dmgM, onKill);
    }
    return seen.size;
  }
  /** выстрел чёрного моба по мобу: настоящий снаряд (урон при попадании, увернуться можно) */
  bmShootMob(m: ZMob, d: any, ux: number, uy: number, dmg: number, onKill: (m: ZMob) => void, tgt?: { x: number; y: number }) {
    const A = d.bmAtk, w = A.width || 20; let last: any = null;
    const D0 = staffDirs(A.count || 1, ux, uy), O = mobShotOrigins(d.bmMz || [], D0.length, m.x, m.y, !!(m as any).bmFl); // из дула посоха В РУКЕ (сторона взгляда)
    const D = tgt ? aimDirs(D0, O, tgt.x, tgt.y, ux, uy) : D0; // из дула — на цель
    for (let i = 0; i < D.length; i++) { const [vx, vy] = D[i]; // посохи во 2/3 слоте: по снаряду на каждый, у каждого полный урон
      last = this.fire({ o: "m", mob: m.id, t: d.elem === "ice" ? "ice_bolt" : "fire_spark", x: O[i][0], y: O[i][1], dx: vx, dy: vy, range: A.range, w, max: 1, spd: PROJ_SPEED.fire_spark, sz: +(w / 20).toFixed(2), bm: 1,
        vm: 1, foe: this.bmFoe(m), onMob: (t: ZMob) => this.mobHit(m, t, dmg, onKill) } as any); }
    return last;
  }
  /** чёрный моб против игрока: держит дистанцию своего лезвия; ближнее — взмах-дуга, дальнее — прицел (телеграф) и снаряд */
  bmMobVsPlayer(m: ZMob, d: any, best: ZPlayer, players: Map<string, ZPlayer>, now: number, mul: number, dist: number, ux: number, uy: number, sp: number, dt: number,
    onHit: (sid: string, dmg: number, src: string, mob?: ZMob, bm?: number, how?: string) => void, onKill: (m: ZMob) => void) {
    const A = d.bmAtk, cdK = Math.max(0.1, Number(BMA_CFG.mobCdMul) || 1);
    (m as any).bmFl = faceLeftOf(ux, (m as any).bmFl); (m as any).bmFt = now + 600; // смотрит на цель (клиенту — биты 26/27)
    if (this.bmMoveStep(m, d, dist, ux, uy, A.kind === "proj" ? Math.min(A.range * 0.6, 220) : Math.max(d.radius + 10, A.range * 0.55), now, dt, A.kind === "proj")) return;
    if (A.kind === "proj") {
      const want = Math.min(A.range * 0.6, 220);
      if (dist > want) { m.x += ux * sp * dt; m.y += uy * sp * dt; this.solid(m); }
      else if (dist < want - 60) { m.x -= ux * sp * 0.6 * dt; m.y -= uy * sp * 0.6 * dt; this.solid(m); }
      if (dist <= A.range * 0.95 && m.atkCd <= 0) {
        const w = A.width || 20;
        const D0 = staffDirs(A.count || 1, ux, uy), O = mobShotOrigins(d.bmMz || [], D0.length, m.x, m.y, !!(m as any).bmFl); // из дула посоха в руке (риг зеркален при взгляде влево)
        const D = aimDirs(D0, O, best.x, best.y, ux, uy); // целимся из дула, а не из центра моба: иначе снаряд идёт параллельно и мимо
        for (let i = 0; i < D.length; i++) { const [vx, vy] = D[i];
          this.cast(m, { kind: "line", at: now + Math.round(Math.max(0, Number(BMA_CFG.mobAimMs) || 0)), x: O[i][0], y: O[i][1], dx: vx, dy: vy, len: A.range, w, dmg: d.dmg * 1.2 * mul, ...(A.shot ? { shot: A.shot } : {}), ...(d.elem && d.elem !== "fire" && d.elem !== "ice" ? { el: d.elem } : {}), proj: d.elem === "ice" || d.elem === "water" || d.elem === "lightning" ? "ice_bolt" : "fire_spark", spd: PROJ_SPEED.fire_spark, sz: +(w / 20).toFixed(2) } as any); }
        m.atkCd = Math.max(0.6, A.cd / 1000 * 2 * cdK); // без windup: он у мобов запускает рывок
      }
      return;
    }
    const want = Math.max(d.radius + 10, A.range * 0.55);
    if (dist > want) { m.x += ux * sp * dt; m.y += uy * sp * dt; this.solid(m); }
    if (dist <= A.range + 14 - 4 && m.atkCd <= 0) {
      const tank = d.role === "tank", dmg = d.dmg * mul * (tank ? 1.25 : 1);
      this.bmSwing(m, d, ux, uy, dmg, dmg, players, onHit, onKill);
      m.atkCd = Math.max(0.5, A.cd / 1000 * 1.5 * cdK);
    }
  }
  /** ЭТАП 2: движение конструктора (move: рывок / телепорт / шлейф). true — шаг занят рывком (без удара в этот тик).
   *  Ближний: рывок/телепорт К цели, если она дальше желаемой; дальний: рывок вбок/назад, если цель вплотную, телепорт — отскок.
   *  Клиенту — событие mmv {id, x0,y0,x1,y1, t: dash|blink, g: число теней, el} (рисует тени-послеобразы). Всё — BMM_CFG (админка). */
  bmMoveStep(m: ZMob, d: any, dist: number, ux: number, uy: number, want: number, now: number, dt: number, ranged: boolean): boolean {
    const mv = d.bmMove, X: any = m; if (!mv || BMM_CFG.moveOn === false) return false;
    if (X.bmDashT > 0) { // идёт рывок
      const st = Math.min(X.bmDashLeft, X.bmDashSpd * dt); X.bmDashLeft -= st; X.bmDashT -= dt; m.x = this.clamp(m.x + X.bmDashX * st); m.y = this.clamp(m.y + X.bmDashY * st); this.solid(m);
      if (X.bmDashT <= 0 || X.bmDashLeft <= 0) X.bmDashT = 0;
      return true;
    }
    const cdK = Math.max(0.1, Number(BMM_CFG.moveCdMul) || 1), far = dist > want + 40, near = ranged && dist < want - 60;
    if (mv.blink && (X.bmBlinkAt || 0) <= now && ((!ranged && dist > want + 120 && dist < mv.blink.range * 2.2) || (near && dist < 90))) {
      const x0 = Math.round(m.x), y0 = Math.round(m.y), r = Math.min(mv.blink.range, ranged ? mv.blink.range : Math.max(0, dist - want));
      const sx = ranged ? -ux : ux, sy = ranged ? -uy : uy, side = (m.id % 2 ? 1 : -1) * (ranged ? 0.6 : 0.25); // отскок назад-вбок / за спину цели чуть сбоку
      const nx = this.clamp(m.x + (sx - sy * side) * r), ny = this.clamp(m.y + (sy + sx * side) * r);
      if (!this.safeAt(nx, ny, 0)) { m.x = nx; m.y = ny; this.solid(m); X.bmBlinkAt = now + mv.blink.cd * cdK; m.atkCd = Math.max(m.atkCd, 0.25);
        this.events.push({ k: "mmv", id: m.id, x: Math.round(m.x), y: Math.round(m.y), x0, y0, x1: Math.round(m.x), y1: Math.round(m.y), t: "blink", g: mv.ghost || 0, el: d.elem || "fire" }); return true; }
      X.bmBlinkAt = now + 800;
    }
    if (mv.dash && (X.bmDashAt || 0) <= now && (far && dist < mv.dash.len * 3 || near)) {
      const len = Math.min(mv.dash.len, ranged ? mv.dash.len : Math.max(20, dist - want + 10));
      const side = near ? (m.id % 2 ? 1 : -1) : 0; let dx = near ? -ux - uy * side : ux, dy = near ? -uy + ux * side : uy; const n = Math.hypot(dx, dy) || 1; dx /= n; dy /= n;
      X.bmDashX = dx; X.bmDashY = dy; X.bmDashLeft = len; X.bmDashSpd = mv.dash.spd || 1000; X.bmDashT = len / X.bmDashSpd + 0.05; X.bmDx0 = Math.round(m.x); X.bmDy0 = Math.round(m.y);
      X.bmDashAt = now + mv.dash.cd * cdK; const ex = Math.round(this.clamp(m.x + dx * len)), ey = Math.round(this.clamp(m.y + dy * len));
      this.events.push({ k: "mmv", id: m.id, x: ex, y: ey, x0: X.bmDx0, y0: X.bmDy0, x1: ex, y1: ey, t: "dash", ms: Math.round(X.bmDashT * 1000), g: mv.ghost || 0, el: d.elem || "fire" }); return true;
    }
    return false;
  }
  /** чёрный моб в драке с мобом — то же оружие, что против игроков */
  bmMobFight(m: ZMob, d: any, t: ZMob, dist: number, ux: number, uy: number, dt: number, onKill: (m: ZMob) => void, mul: number): boolean {
    const A = d.bmAtk, cdK = Math.max(0.1, Number(BMA_CFG.mobCdMul) || 1), td = ZONE_MOBS[t.type], sp = d.speed * (m.slowUntil > this.now ? 0.55 : 1) * dt;
    (m as any).bmFl = faceLeftOf(ux, (m as any).bmFl); (m as any).bmFt = this.now + 600;
    const dmg = d.dmg * mul * (d.role === "tank" ? 1.25 : 1);
    if (A.kind === "proj") {
      const want = Math.min(A.range * 0.6, 220);
      if (dist > want) { m.x += ux * sp; m.y += uy * sp; this.solid(m); }
      if (dist <= A.range * 0.95 && m.atkCd <= 0) { this.bmShootMob(m, d, ux, uy, dmg * 1.2, onKill, t); m.atkCd = Math.max(0.6, A.cd / 1000 * 2 * cdK); }
      return true;
    }
    const want = Math.max(d.radius + td.radius + 6, A.range * 0.55);
    if (dist > want) { m.x += ux * sp; m.y += uy * sp; this.solid(m); }
    if (dist <= A.range + td.radius - 4 && m.atkCd <= 0) { this.bmSwing(m, d, ux, uy, dmg, dmg, null, null, onKill); m.atkCd = Math.max(0.5, A.cd / 1000 * 1.5 * cdK); }
    return true;
  }
  /** такт драки с мобом: true — моб занят боем */
  mobFight(m: ZMob, d: any, dt: number, onKill: (m: ZMob) => void, mul: number): boolean {
    const t = m.mobTarget ? this.byId.get(m.mobTarget) : null;
    if (!t || t.dead || t.reset || Math.hypot(t.x - m.x, t.y - m.y) > d.aggro * 2.2) { m.mobTarget = 0; return false; }
    const dx = t.x - m.x, dy = t.y - m.y, dist = Math.hypot(dx, dy) || 1, ux = dx / dist, uy = dy / dist;
    const td = ZONE_MOBS[t.type];
    if (d.black && d.bmAtk) return this.bmMobFight(m, d, t, dist, ux, uy, dt, onKill, mul);
    const ranged = d.role === "ranged" || d.role === "caster", want = ranged ? 160 : d.radius + td.radius + 6;
    if (dist > want) { const sp = d.speed * (m.slowUntil > this.now ? 0.55 : 1) * dt; m.x += ux * sp; m.y += uy * sp; this.solid(m); }
    if (dist <= want + 12 && m.atkCd <= 0) {
      if (ranged) this.events.push({ k: "mshot", id: m.id, x: Math.round(m.x), y: Math.round(m.y), tx: Math.round(t.x), ty: Math.round(t.y) });
      this.mobHit(m, t, d.dmg * mul * (d.role === "tank" ? 1.25 : 1), onKill);
      m.atkCd = ranged ? 2.2 : d.role === "swarm" ? 0.9 : 1.2;
    }
    return true;
  }
  /** множитель ХП моба по его флагам */
  hpOf(m: ZMob, scale = 1) {
    const d = ZONE_MOBS[m.type];
    return capHp(d.hp * (m.chief ? ZONE_GEN.chiefHp : 1) * (m.elite ? ZONE_GEN.eliteHp : 1) * (m.cursed ? CURSE.mobHp : 1) * enchMul(m, "hp") * (d.boss ? 1 + ZONE_GEN.bossScalePerPlayer * (scale - 1) : 1));
  }
  /** Правка ОЗ моба в админке (или перечитанный набор правок) — сразу у живых мобов этого вида, без ожидания респавна.
   *  maxHp живого моба = ОЗ бестиария × множители экземпляра (элита/вожак/проклятие/ярус/игроки у босса); меняем только базу:
   *  maxHp ×(новые/старые ОЗ), текущие ОЗ — та же доля. Урон и броня берутся из бестиария на каждом ударе — им синхронизация не нужна. */
  syncMobStats(): number {
    let n = 0;
    for (const m of this.mobs) {
      const d: any = ZONE_MOBS[m.type]; if (!d) continue;
      const cur = Number(d.hp) || 0, base = m.hpBase;
      if (base === undefined || base <= 0) { m.hpBase = cur; continue; }
      if (base === cur || cur <= 0) continue;
      m.hpBase = cur; if (m.dead) continue; // мёртвый получит новые ОЗ при респавне (hpOf)
      const frac = m.maxHp > 0 ? Math.max(0, Math.min(1, m.hp / m.maxHp)) : 1;
      // обычный моб — точно как при спавне (hpOf: элита/вожак/проклятие/ярус); босс — пропорционально (множитель отряда на момент появления)
      m.maxHp = !d.boss && !m.special ? this.hpOf(m) : capHp(m.maxHp * cur / base);
      m.hp = Math.max(1, Math.min(m.maxHp, Math.round(m.maxHp * frac)));
      n++;
    }
    return n;
  }
  /** Правка навыков моба в админке — сразу у живых мобов этого вида (без ожидания респавна). Возвращает число обновлённых. */
  syncMobSkills(): number {
    let n = 0;
    for (const m of this.mobs) { if (m.dead) continue;
      const d: any = ZONE_MOBS[m.type], own = ownSkills(d), sig = JSON.stringify(own);
      if ((m as any).skSig === undefined || (m as any).skSig === sig) continue;
      m.skills = this.mergeSkills(m, own);
      for (const k of m.skills) if (m.skCd[k] == null) m.skCd[k] = 1.5;
      (m as any).skSig = sig; n++;
    }
    return n;
  }
  /** Случайные навыки: проклятый — 2–5 (как раньше), обычный босс — CURSE.bossSkillsMin…Max (1–3), мировой — worldBossSkillsMin…Max (5–10).
   *  Явные навыки из Бестиария всегда есть и добавляются к случайным (случайные добирают до выпавшего числа). */
  rollSkills(m: ZMob) {
    const d: any = ZONE_MOBS[m.type], own = ownSkills(d);
    const [lo, hi] = bossSkillRange(m, d), ri = (a: number, b: number) => { a = Math.max(0, Math.round(a)); b = Math.max(a, Math.round(b)); return a + Math.floor(this.rand() * (b - a + 1)); };
    const et = tierDef(m.ench), nEnch = et ? ri(et.skMin, et.skMax) : 0;
    const boss = hi > 0, nBoss = boss ? ri(lo, hi) : 0, nCursed = m.cursed ? ri(2, 5) : 0, nRand = Math.max(nCursed, nEnch);
    // cap: сколько всего навыков (не меньше явных); у не-боссов — как раньше: явные + 2–5 случайных, всего ≤ 5 (ярус: ≤ max(5, его «до»))
    const cap = boss ? Math.min(10, Math.max(nBoss, nRand, own.length)) : nRand ? Math.max(5, nEnch) : own.length;
    const need = boss ? Math.max(0, cap - own.length) : nRand;
    const salt = (m.id * 2654435761) ^ Math.floor(this.rand() * 0x7fffffff);
    (m as any).skRand = need ? skillsFor(m.type, need + own.length, salt).filter((k) => !own.includes(k)).slice(0, need) : [];
    (m as any).skCap = cap;
    m.skills = this.mergeSkills(m, own);
    m.skCd = Object.fromEntries(m.skills.map((k, i) => [k, 2 + i * 1.5]));
    (m as any).skSig = JSON.stringify(own);
  }
  mergeSkills(m: ZMob, own: string[]): string[] {
    const R: string[] = (m as any).skRand || [], cap = Math.max((m as any).skCap ?? 0, own.length);
    return [...new Set([...own, ...R])].slice(0, Math.max(cap, own.length));
  }
  /** проклятие и ярус зачарования при появлении/возрождении (сервер); проклятый — только доп. шанс ENCH.comboPct */
  rollCursed(m: ZMob) {
    m.cursed = this.rand() * 100 < ZONE_GEN.cursedPct;
    m.ench = rollMobTier(() => this.rand(), { boss: m.special === "boss" || !!ZONE_MOBS[m.type]?.boss, cursed: m.cursed });
    { const B = BM_MOBS[m.type]; if (B) { if (B.cursed) m.cursed = true; if (B.ench) m.ench = B.ench; } } // чёрный моб: флаги из конструктора
    this.rollSkills(m);
    if (m.cursed) this.stats.cursed++;
    if (m.ench) this.stats.ench++;
  }
  reindex() {
    this.buckets.clear();
    for (const m of this.mobs) {
      if (m.dead) continue;
      const k = ck(m.x, m.y);
      let b = this.buckets.get(k);
      if (!b) this.buckets.set(k, (b = []));
      b.push(m);
    }
  }
  /** живые мобы в квадрате (x±r, y±r) — по чанкам */
  near(x: number, y: number, r: number): ZMob[] {
    const out: ZMob[] = [];
    const c0 = Math.floor((x - r) / WORLD_CHUNK), c1 = Math.floor((x + r) / WORLD_CHUNK), r0 = Math.floor((y - r) / WORLD_CHUNK), r1 = Math.floor((y + r) / WORLD_CHUNK);
    for (let cx = c0; cx <= c1; cx++) for (let cy = r0; cy <= r1; cy++) {
      const b = this.buckets.get(cx * 4096 + cy);
      if (b) for (const m of b) if (!m.dead && Math.abs(m.x - x) <= r && Math.abs(m.y - y) <= r) out.push(m);
    }
    return out;
  }
  playersNear(grid: Map<number, ZPlayer[]>, x: number, y: number): ZPlayer[] {
    const cx = Math.floor(x / WORLD_CHUNK), cy = Math.floor(y / WORLD_CHUNK), out: ZPlayer[] = [];
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) { const b = grid.get((cx + i) * 4096 + cy + j); if (b) for (const p of b) out.push(p); }
    return out;
  }
  computeAwake(players: Map<string, ZPlayer>) {
    this.awake.clear();
    const S = ZONE_GEN.sleepR;
    for (const p of players.values()) {
      const cx = Math.floor(p.x / SLEEP_CELL), cy = Math.floor(p.y / SLEEP_CELL);
      for (let i = -S; i <= S; i++) for (let j = -S; j <= S; j++) this.awake.add((cx + i) * 4096 + cy + j);
    }
  }

  get bossId(): number { return Object.values(this.bossIds)[0] || 0; } // совместимость (тесты/отладка)
  isSpecial(m: ZMob) { return m.special !== ""; }
  clamp(v: number) { return Math.max(20, Math.min(this.size - 20, v)); }

  /** Выталкивание моба из твёрдых пропсов (скользит вдоль ствола/камня). Возврат домой (reset) — без коллизий: поводок не застревает */
  solid(m: ZMob) {
    const K = this.keepOut;
    if (K && !K.skip?.(m, m.special === "boss" || !!(ZONE_MOBS as any)[m.type]?.boss) && K.inside(m.x, m.y, MOB_R)) { // город: мобы не заходят
      const [ox, oy] = K.out(m.x, m.y); m.x = this.clamp(ox); m.y = this.clamp(oy);
      if (K.flash?.()) { const now = Date.now(), mm = m as any; const W = this.domeFlashWin; if (now - W.t >= 1000) { W.t = now; W.n = 0; } if (W.n < DOME_FLASH_PER_SEC && now - (mm.domeFlashAt || 0) >= DOME_FLASH_CD_MS) { mm.domeFlashAt = now; W.n++; this.events.push({ k: "dome_repel", id: m.id, x: Math.round(m.x), y: Math.round(m.y) }); } } // вспышка купола (не чаще раза в 3 с на моба)
    }
    if (m.reset) return; const [x, y] = resolveWorld(this.world, m.x, m.y, MOB_R); m.x = this.clamp(x); m.y = this.clamp(y); }
  spawnFix(m: ZMob) {
    (m as any).spOk = 1;
    const [sx, sy] = freeSpot(this.world, m.sx, m.sy, MOB_R);
    if (sx !== m.sx || sy !== m.sy) { if (m.x === m.sx && m.y === m.sy) { m.x = sx; m.y = sy; } m.sx = sx; m.sy = sy; (m as any).wanderX = sx; (m as any).wanderY = sy; }
    this.solid(m);
  }
  addMob(type: string, x: number, y: number, o: { fixed?: boolean; respawn?: number; region?: string | null; elite?: boolean; hpMul?: number; special?: "" | "boss" | "rare" } = {}) {
    const d = ZONE_MOBS[type];
    { const K = this.keepOut; if (K && o.special !== "boss" && !d?.boss && K.inside(x, y, 60)) { const o2 = K.out(x, y); const a = Math.atan2(o2[1] - y, o2[0] - x); x = this.clamp(Math.round(o2[0] + Math.cos(a) * 80)); y = this.clamp(Math.round(o2[1] + Math.sin(a) * 80)); this.stats.domeMoved++; } } // дом моба под куполом города (лагерь/стая/бродячий) — за край, R + толчок + 80 px
    const hp = capHp(d.hp * (o.elite ? ZONE_GEN.eliteHp : 1) * (o.hpMul || 1));
    const m: ZMob = { mobTarget: 0, scanAt: 0, roam: null, cursed: false, skills: [], skCd: {}, reset: false, burstUntil: 0, camp: 0, leapCd: 0, shieldUntil: 0, id: this.nextId++, type, respawn: o.respawn || 0, sx: x, sy: y, x, y, hp, maxHp: hp, dead: false, respawnAt: 0, targetSid: null,
      wanderX: x, wanderY: y, nextWander: 0, atkCd: 0, dmgBy: new Map(), usedAbility: new Set(), windup: 0, dashX: 0, dashY: 0, dashT: 0,
      fixed: !!o.fixed, region: o.region || null, elite: !!o.elite, idle: 0, dot: null, slowUntil: 0, kbx: 0, kby: 0,
      casts: [], phase: 1, enraged: false, special: o.special || "", expireAt: 0, patIdx: 0 };
    this.rollCursed(m);
    if (m.cursed || enchTier(m)) { m.maxHp = m.hp = capHp(hp * (m.cursed ? CURSE.mobHp : 1) * enchMul(m, "hp")); }
    m.hpBase = d.hp;
    this.mobs.push(m);
    this.byId.set(m.id, m);
    const k = ck(x, y); const b = this.buckets.get(k); if (b) b.push(m); else this.buckets.set(k, [m]);
    return m;
  }


  // ---------- бродячие мобы у игрока (Аринар): добавка к лагерям, чтобы между ними не было пусто ----------
  ambNext = new Map<string, number>();
  ambStats = { checks: 0, singles: 0, groups: 0, despawned: 0 };
  regionAt(x: number, y: number): Region | null {
    let best: Region | null = null;
    for (const r of this.gen.regions) if (r.table.length && x >= r.rect[0] && x <= r.rect[2] && y >= r.rect[1] && y <= r.rect[3]) { if (!best || (r.rect[2] - r.rect[0]) < (best.rect[2] - best.rect[0])) best = r; }
    return best;
  }
  ambient(now: number, players: Map<string, ZPlayer>) {
    const G = ZONE_GEN;
    // уход: хозяин вышел/далеко, или без боя дольше ambientLife — исчезает (не копится, не фармится «вагонами»)
    const own = new Map<string, number>();
    for (const m of this.mobs) {
      if (!m.ambient || m.dead) continue;
      const p = players.get(m.ambient);
      const far = !p || Math.hypot(p.x - m.x, p.y - m.y) > G.ambientDespawnDist;
      const idle = !m.targetSid && now - (m.bornAt || now) > G.ambientLife * 1000;
      if ((far && !m.targetSid) || idle || (far && now - (m.bornAt || now) > G.ambientLife * 3000)) { m.dead = true; m.respawnAt = -1; this.ambStats.despawned++; continue; }
      own.set(m.ambient, (own.get(m.ambient) || 0) + 1);
    }
    if (!G.ambientOn) return;
    for (const p of players.values()) {
      if (!p.alive) continue;
      const due = this.ambNext.get(p.sid);
      if (due === undefined) { this.ambNext.set(p.sid, now + G.ambientEvery * 1000); continue; }
      if (now < due) continue;
      this.ambNext.set(p.sid, now + Math.max(2, G.ambientEvery) * 1000);
      this.ambStats.checks++;
      if ((own.get(p.sid) || 0) >= G.ambientCap || this.safeAt(p.x, p.y, 200)) continue;
      if (this.near(p.x, p.y, G.ambientNear).some((m) => !m.dead && Math.hypot(m.x - p.x, m.y - p.y) < G.ambientNear)) continue;
      const roll = this.rand() * 100;
      const group = roll < G.ambientGroupChance, single = !group && roll < G.ambientGroupChance + G.ambientChance;
      if (!group && !single) continue;
      const reg = this.regionAt(p.x, p.y); if (!reg) continue;
      const rows = reg.table.filter((r) => { const d = ZONE_MOBS[r.type]; return d && !d.boss && d.size !== "boss" && d.size !== "huge"; });
      if (!rows.length) continue;
      let tw = rows.reduce((a, b) => a + b.w, 0) * this.rand(), row = rows[0];
      for (const r of rows) { tw -= r.w; if (tw <= 0) { row = r; break; } }
      let pos: [number, number] | null = null;
      for (let t = 0; t < 10 && !pos; t++) {
        const a = this.rand() * Math.PI * 2, x = this.clamp(p.x + Math.cos(a) * G.ambientEdge), y = this.clamp(p.y + Math.sin(a) * G.ambientEdge);
        if (!this.safeAt(x, y, 60) && Math.hypot(x - p.x, y - p.y) > G.ambientEdge * 0.7) pos = [x, y];
      }
      if (!pos) continue;
      const n = group ? Math.min(G.ambientCap - (own.get(p.sid) || 0), Math.max(1, Math.round(G.ambientGroup)) + 1) : 1;
      for (let i = 0; i < n; i++) {
        const a = this.rand() * Math.PI * 2, rr = i ? 22 + this.rand() * 30 : 0;
        const elite = group && i === 0;
        const m = this.addMob(row.type, this.clamp(pos[0] + Math.cos(a) * rr), this.clamp(pos[1] + Math.sin(a) * rr), { region: null, elite });
        m.ambient = p.sid; m.bornAt = now; m.huntUntil = now + G.ambientHunt * 1000; m.targetSid = p.sid; m.burstUntil = now + 1200;
        this.stats.spawned++;
      }
      own.set(p.sid, (own.get(p.sid) || 0) + n);
      if (group) this.ambStats.groups++; else this.ambStats.singles++;
    }
    for (const sid of this.ambNext.keys()) if (!players.has(sid)) this.ambNext.delete(sid);
  }

  /** состояние логов мировых боссов для карты, трекера и охоты: [ключ, жив, секунд до появления, тип, выключен в локации (админка)] */
  bossStatus(now: number): [string, number, number, string, number, number, number, string][] {
    return this.gen.bosses.map((b) => { const bk = b.key || b.type, id = this.bossIds[bk], m = id ? this.byId.get(id) : null;
      const alive = !!(m && !m.dead), at = this.bossAt[bk];
      const left = alive ? 0 : at && at < Number.MAX_SAFE_INTEGER ? Math.ceil((at - now) / 1000) : (BOSS_TIMERS[b.type]?.firstAfter ?? b.firstAfter) + ((b as any).stagger || 0);
      const off = this.gen.regions.find((r) => b.x >= r.rect[0] && b.x < r.rect[2] && b.y >= r.rect[1] && b.y < r.rect[3])?.bossOn === false;
      return [bk, alive ? 1 : 0, Math.max(0, left), b.type, off ? 1 : 0, Math.round(b.x), Math.round(b.y), b.where || ""]; }); // x, y, where — клиент создаёт метку логова сам, если её нет (новый босс из кода/админки)
  }

  // ---------- мировые боссы и редкие Отголоски ----------
  specials(now: number, players: Map<string, ZPlayer>) {
    const G = this.gen;
    const scale = Math.max(1, Math.min(4, players.size));
    for (const b of G.bosses) {
      const bk = b.key || b.type; // несколько боссов одного типа в разных пятнах — свои таймеры
      if (!this.bossAt[bk]) this.bossAt[bk] = now + (BOSS_TIMERS[b.type] ? BOSS_TIMERS[b.type].firstAfter + ((b as any).stagger || 0) : b.firstAfter) * 1000; // таймер — из админки
      const breg = this.gen.regions.find((r) => b.x >= r.rect[0] && b.x < r.rect[2] && b.y >= r.rect[1] && b.y < r.rect[3]);
      if (breg?.bossOn === false) { const id = this.bossIds[bk], bm = id && this.byId.get(id); if (bm && !bm.dead && !bm.targetSid) { bm.dead = true; bm.respawnAt = -1; } continue; } // админка: босс в локации выключен
      if (this.bossIds[bk] || now < this.bossAt[bk]) continue;
      const m = this.addMob(b.type, b.x, b.y, { region: null, hpMul: 1 + ZONE_GEN.bossScalePerPlayer * (scale - 1), special: "boss" });
      (m as any).bossKey = bk; this.bossIds[bk] = m.id; this.bossAt[bk] = Number.MAX_SAFE_INTEGER;
      const d = ZONE_MOBS[b.type];
      const et = tierDef(m.ench), etn = et ? `✦ ${String(et.name).toUpperCase()} ` : "";
      this.events.push({ k: "announce", text: `${m.cursed ? "☠️ ПРОКЛЯТЫЙ " + etn + "м" : et ? etn + "м" : "🌙 М"}ировой босс «${d.name}» (ур. ${d.lvl}) пробуждается ${b.where}!`, color: et && et.color !== "#0a0a0a" ? et.color : "#c084fc", x: undefined });
    }
    for (const r of G.rares) {
      if (this.rareHold) continue;
      this.rareInit(r, now);
      const live = this.rareIds[r.type] ? this.mobs.find((m) => m.id === this.rareIds[r.type] && !m.dead) : null;
      if (live) {
        if (now > live.expireAt && !live.targetSid) { live.dead = true; live.respawnAt = -1; this.events.push({ k: "announce", text: `«${ZONE_MOBS[r.type].name}» ускользает…`, color: "#94a3b8" }); }
        continue;
      }
      if (this.rareIds[r.type]) { delete this.rareIds[r.type]; this.rareSchedule(r, now); continue; }
      if (now < this.rareAt[r.type]) continue;
      // место выбрано заранее (там же игроки видят отсчёт); если его нет — выбираем сейчас, подальше от игроков
      let pt: { x: number; y: number; reg: string } | null = this.rareNext[r.type] || this.rarePick(r, players);
      if (!pt) continue;
      const m = this.addMob(r.type, pt.x, pt.y, { region: null, special: "rare" });
      m.expireAt = now + r.life * 1000;
      this.rareIds[r.type] = m.id; this.rareAt[r.type] = Number.MAX_SAFE_INTEGER; delete this.rareNext[r.type]; this.rareDirty = true;
      const d = ZONE_MOBS[r.type];
      this.events.push({ k: "announce", text: `✨ Редкий Отголосок «${d.name}» (ур. ${d.lvl}) замечен: ${pt.reg}!`, color: "#fde68a" });
    }
  }

  /** выбор точки появления редкого: случайное пятно подходящего региона, не в безопасной зоне (и вдали от игроков, если они переданы) */
  rarePick(r: { type: string; region: string }, players?: Map<string, ZPlayer>): { x: number; y: number; reg: string } | null {
    const cand = this.gen.regions.filter((x) => x.id === r.region || (x as any).kind === r.region); // пятна одного биома
    const reg = cand.length ? cand[Math.floor(this.rand() * cand.length)] : null;
    if (!reg) return null;
    for (let t = 0; t < 12; t++) {
      const x = reg.rect[0] + 60 + this.rand() * (reg.rect[2] - reg.rect[0] - 120), y = reg.rect[1] + 60 + this.rand() * (reg.rect[3] - reg.rect[1] - 120);
      if (this.safeAt(x, y, 40) || (players && [...players.values()].some((p) => Math.hypot(p.x - x, p.y - y) < 260))) continue;
      return { x, y, reg: reg.name };
    }
    return null;
  }
  /** следующее появление редкого: таймер из настроек (админка) + заранее выбранное место */
  rareSchedule(r: { type: string; region: string; every: [number, number] }, now: number) {
    this.rareAt[r.type] = now + (r.every[0] + this.rand() * (r.every[1] - r.every[0])) * 1000;
    const pt = this.rarePick(r); if (pt) this.rareNext[r.type] = pt; else delete this.rareNext[r.type];
    this.rareDirty = true;
  }
  /** первый таймер (после старта сервера, если сохранённого нет) */
  rareInit(r: { type: string; region: string; every: [number, number] }, now: number) {
    if (!this.rareAt[r.type]) this.rareSchedule(r, now);
    else if (!this.rareIds[r.type] && !this.rareNext[r.type] && this.rareAt[r.type] < Number.MAX_SAFE_INTEGER) { const pt = this.rarePick(r); if (pt) { this.rareNext[r.type] = pt; this.rareDirty = true; } }
  }
  /** состояние редких Отголосков для клиента: [тип, жив, секунд до появления, x, y, пятно] (жив: x, y — где сейчас; пятно — «Лунный кратер») */
  rareStatus(now: number): [string, number, number, number, number, string][] {
    const out: [string, number, number, number, number, string][] = [];
    for (const r of this.gen.rares || []) {
      if (!this.rareHold) this.rareInit(r, now);
      const id = this.rareIds[r.type], m = id ? this.byId.get(id) : null, alive = !!(m && !m.dead);
      const nx = this.rareNext[r.type], at = this.rareAt[r.type];
      if (alive) { out.push([r.type, 1, Math.max(0, Math.ceil((m!.expireAt - now) / 1000)), Math.round(m!.x), Math.round(m!.y), String((this.gen.regions.find((x) => m!.x >= x.rect[0] && m!.x < x.rect[2] && m!.y >= x.rect[1] && m!.y < x.rect[3]) || { name: "" }).name)]); continue; }
      if (!nx) continue; // места нет (ещё не заведён таймер) — клиенту показывать нечего
      out.push([r.type, 0, at && at < Number.MAX_SAFE_INTEGER ? Math.max(0, Math.ceil((at - now) / 1000)) : 0, Math.round(nx.x), Math.round(nx.y), nx.reg]);
    }
    return out;
  }
  /** снимок ожидающих таймеров для сохранения: тип → [когда (мс), x, y, пятно] */
  rareSnapshot(): Record<string, [number, number, number, string]> {
    const o: Record<string, [number, number, number, string]> = {};
    for (const r of this.gen.rares || []) { const at = this.rareAt[r.type], nx = this.rareNext[r.type]; if (at && at < Number.MAX_SAFE_INTEGER && nx && !this.rareIds[r.type]) o[r.type] = [Math.round(at), Math.round(nx.x), Math.round(nx.y), nx.reg]; }
    return o;
  }
  /** подгрузка сохранённых таймеров: просроченный — «вот-вот» (через 1–3 минуты), неизвестные типы игнорируются */
  rareRestore(snap: any, now: number) {
    for (const r of this.gen.rares || []) {
      const e = snap && snap[r.type]; if (!Array.isArray(e) || !(+e[0] > 0) || !Number.isFinite(+e[1]) || !Number.isFinite(+e[2])) continue;
      this.rareAt[r.type] = +e[0] > now ? Math.min(+e[0], now + r.every[1] * 1000) : now + (60 + this.rand() * 120) * 1000;
      this.rareNext[r.type] = { x: +e[1], y: +e[2], reg: String(e[3] || "") };
    }
    this.rareHold = false;
  }

  // ---------- режиссёр процедурного спавна ----------
  // Дёшево: такт раз в 0.5 с, O(мобы × игроки) с малыми числами (кап мобов на мир, AOI по регионам).
  director(dt: number, now: number, players: Map<string, ZPlayer>) {
    const G = ZONE_GEN, W = this.gen;
    this.tokens = Math.min(G.burst, this.tokens + G.ratePerSec * dt);
    const alive = [...players.values()].filter((p) => p.alive);
    // деспавн: далеко от всех и вне боя дольше despawnIdle (боссы и редкие — нет)
    for (const m of this.mobs) {
      if (m.dead || m.fixed || m.special) continue;
      let near = Infinity;
      for (const p of players.values()) near = Math.min(near, Math.hypot(p.x - m.x, p.y - m.y));
      if (near > G.despawnDist && !m.targetSid) m.idle += dt; else m.idle = 0;
      if (m.idle > G.despawnIdle) { m.dead = true; m.respawnAt = -1; this.stats.despawned++; }
    }
    if (!alive.length) return;
    this.specials(now, players);
    const living = this.mobs.filter((m) => !m.dead && !m.fixed && !m.special);
    if (living.length >= W.globalCap || this.tokens < 1) return;
    const night = isNight(now);
    // кандидаты-регионы: рядом хоть с одним игроком и не заполнены
    const regs: { r: Region; deficit: number }[] = [];
    for (const r of W.regions) {
      if (!r.table.length) continue;
      const cx = (r.rect[0] + r.rect[2]) / 2, cy = (r.rect[1] + r.rect[3]) / 2;
      const halfDiag = Math.hypot(r.rect[2] - r.rect[0], r.rect[3] - r.rect[1]) / 2;
      if (!alive.some((p) => Math.hypot(p.x - cx, p.y - cy) < G.spawnMaxDist + halfDiag * 0.5)) continue;
      const n = living.filter((m) => m.region === r.id).length;
      if (n < r.cap) regs.push({ r, deficit: r.cap - n });
    }
    if (!regs.length) return;
    // плотность вокруг игроков: потолок растёт с числом игроков поблизости
    const crowded = (x: number, y: number) => {
      for (const p of alive) {
        if (Math.hypot(p.x - x, p.y - y) > G.nearR * 1.6) continue;
        const group = alive.filter((q) => Math.hypot(q.x - p.x, q.y - p.y) < G.nearR).length;
        const lim = Math.min(W.nearMax, W.nearBase + W.nearPerPlayer * (group - 1));
        const around = living.filter((m) => Math.hypot(m.x - p.x, m.y - p.y) < G.nearR).length;
        if (around >= lim) return true;
      }
      return false;
    };
    const R = this.rand;
    const total = regs.reduce((a, b) => a + b.deficit, 0);
    let pick = R() * total, reg = regs[0].r;
    for (const x of regs) { pick -= x.deficit; if (pick <= 0) { reg = x.r; break; } }
    // позиция: несколько случайных кандидатов в прямоугольнике региона
    let pos: { x: number; y: number } | null = null;
    for (let t = 0; t < G.tries && !pos; t++) {
      const x = reg.rect[0] + R() * (reg.rect[2] - reg.rect[0]), y = reg.rect[1] + R() * (reg.rect[3] - reg.rect[1]);
      if (this.safeAt(x, y, 0)) continue;
      let dmin = Infinity;
      for (const p of players.values()) dmin = Math.min(dmin, Math.hypot(p.x - x, p.y - y));
      if (dmin < (t < G.tries / 2 ? G.spawnMinDist : G.spawnMinDistCrowded) || dmin > G.spawnMaxDist) continue;
      if (living.some((m) => Math.hypot(m.x - x, m.y - y) < G.mobMinDist)) continue;
      if (crowded(x, y)) continue;
      pos = { x, y };
    }
    if (!pos) { this.stats.rejected++; return; }
    // моб из таблицы региона (ночью — свои веса)
    const tbl = reg.table.map((row) => ({ row, w: row.w * (night && reg.night?.[row.type] ? reg.night[row.type] : 1) }));
    let tw = tbl.reduce((a, b) => a + b.w, 0) * R();
    let row = tbl[0].row;
    for (const x of tbl) { tw -= x.w; if (tw <= 0) { row = x.row; break; } }
    const elite = R() < reg.elite * (night ? 1.5 : 1);
    const n = elite ? 1 : row.pack[0] + Math.floor(R() * (row.pack[1] - row.pack[0] + 1));
    const room = Math.min(n, W.globalCap - living.length, reg.cap - living.filter((m) => m.region === reg.id).length);
    for (let i = 0; i < room; i++) {
      const a = R() * Math.PI * 2, rr = i ? 18 + R() * 26 : 0;
      const x = this.clamp(pos.x + Math.cos(a) * rr), y = this.clamp(pos.y + Math.sin(a) * rr);
      if (i && this.safeAt(x, y, 0)) continue; // член стаи не должен оказаться в безопасной зоне
      this.addMob(row.type, x, y, { region: reg.id, elite });
      this.stats.spawned++;
    }
    this.tokens -= 1;
  }

  // ---------- статусы от оружия игроков ----------
  applyStatus(m: ZMob, sid: string, st: { kind?: string; dps?: number; dur?: number; slow?: number | boolean; knock?: number }, fromX: number, fromY: number, maxStacks = DOT_STACK_MAX) {
    if (this.guard && sid && !sid.startsWith("mob:") && this.guard.inDome(m.x, m.y)) return; // купол Чёрного мага: статусы игроков не проходят
    const now = Date.now();
    const d = ZONE_MOBS[m.type];
    if (st.kind && st.dps && st.dur) {
      // стаки: один и тот же статус от разных попаданий/источников складывается (каждый стак — свой урон/с и срок),
      // до maxStacks на вид (по уровню героя, кап DOT_STACK_MAX); разные статусы действуют одновременно
      const cap = Math.max(1, Math.min(DOT_STACK_MAX, maxStacks | 0));
      const L = (m.dots = (m.dots || []).filter((x) => x.until > now));
      const same = L.filter((x) => x.kind === st.kind);
      if (same.length >= cap) L.splice(L.indexOf(same.reduce((a, b) => (a.until < b.until ? a : b))), 1);
      L.push({ kind: st.kind, dps: st.dps, until: now + st.dur * 1000, sid });
      m.dot = L[L.length - 1];
    }
    if (st.slow) m.slowUntil = now + (d.boss ? 600 : 1200);
    if (st.knock && !KNOCK_IMMUNE(d)) {
      const dx = m.x - fromX, dy = m.y - fromY, dd = Math.hypot(dx, dy) || 1;
      const k = st.knock * (m.elite ? 0.5 : 1);
      m.kbx += (dx / dd) * k * 6; m.kby += (dy / dd) * k * 6;
    }
  }

  // ---------- телеграфы ----------
  private bmCast: { pct: number; D: number } | null = null;
  cast(m: ZMob, c: ZCast) {
    if (this.bmCast && this.bmCast.D > 0) c.bm = Math.round(this.bmCast.pct * c.dmg / this.bmCast.D * 1000) / 1000; // доля формы (дождь ×0.6, конус ×0.7) — и для %
    m.casts.push(c);
    const t = Math.round(Math.max(0.2, (c.at - this.now) / 1000) * 100) / 100;
    if (c.kind === "circle") this.events.push({ k: "tele_circle", id: m.id, x: Math.round(c.x), y: Math.round(c.y), r: c.r, t, fx: c.fx, fdx: c.fx === "meteor" ? (c.x < m.x ? -1 : 1) : undefined });
    else if (c.kind === "line") this.events.push({ k: "tele_line", id: m.id, x: Math.round(c.x), y: Math.round(c.y), dx: +c.dx!.toFixed(3), dy: +c.dy!.toFixed(3), len: c.len, w: c.w, t });
    else if (c.kind === "ring") this.events.push({ k: "tele_ring", id: m.id, x: Math.round(c.x), y: Math.round(c.y), r0: c.r0, r: c.r, t, fx: c.fx });
    else this.events.push({ k: "tele_circle", id: m.id, x: Math.round(c.x), y: Math.round(c.y), r: c.r, t, nova: 1, fx: c.fx });
  }
  resolveCasts(m: ZMob, now: number, players: Map<string, ZPlayer>, onHit: (sid: string, dmg: number, src: string, mob?: ZMob, bm?: number, how?: string) => void) {
    for (let i = m.casts.length - 1; i >= 0; i--) {
      const c = m.casts[i];
      if (now < c.at) continue;
      m.casts.splice(i, 1);
      if (c.leap) { m.x = this.clamp(c.x); m.y = this.clamp(c.y); this.solid(m); }
      if (c.kind === "line" && c.proj) { // настоящий снаряд моба: летит от моба, от него можно отойти
        this.fire({ o: "m", mob: m.id, t: c.proj, x: (c as any).sz ? c.x : m.x, y: (c as any).sz ? c.y : m.y, dx: c.dx!, dy: c.dy!, range: c.len!, w: c.w!, max: 1, spd: (c as any).spd || (c.proj === "fireball" ? 480 : PROJ_SPEED.mob), ...((c as any).sz ? { sz: (c as any).sz, bm: 1 } : {}),
          ...((c as any).el ? { el: (c as any).el } : {}), ...((c as any).shot && (BMA_CFG as any).shotOn !== false ? { shot: (c as any).shot, onAux: (pl: ZPlayer, k: number) => onHit(pl.sid, c.dmg * k, m.type, m, c.bm, "aux") } : {}),
          onHit: (pl: ZPlayer) => onHit(pl.sid, c.dmg, m.type, m, c.bm, "proj:" + c.proj) });
        continue;
      }
      for (const p of players.values()) {
        if (!p.alive) continue;
        const dist = Math.hypot(p.x - c.x, p.y - c.y);
        const hit = c.kind === "circle" || c.kind === "nova" ? dist < c.r! + 8
          : c.kind === "ring" ? dist > c.r0! - 8 && dist < c.r! + 8
          : segDist(p.x, p.y, c.x, c.y, c.dx!, c.dy!, c.len!) < c.w! / 2 + 10;
        if (hit) onHit(p.sid, c.dmg, m.type, m, c.bm, "cast:" + (c.fx || c.kind));
      }
      if (c.kind === "line") this.events.push({ k: "mshot", id: m.id, x: Math.round(c.x), y: Math.round(c.y), tx: Math.round(c.x + c.dx! * c.len!), ty: Math.round(c.y + c.dy! * c.len!) });
      else this.events.push({ k: "slam", id: m.id, x: Math.round(c.x), y: Math.round(c.y), r: c.r, r0: c.r0, fx: c.fx, nova: c.kind === "nova" ? 1 : undefined }); // fx — спрайт атласа снарядов (метеор, копья, осколки…)
    }
  }

  // атаки крупных и боссов: по кругу набора, набор зависит от фазы
  bossPattern(m: ZMob, d: any, best: ZPlayer, players: Map<string, ZPlayer>, now: number) {
    const big = d.size === "huge" ? 1.35 : d.size === "boss" ? 1.15 : 1;
    const dmg = d.dmg * mobDmgMul(m); // было без проклятия и ярости — серия босса била базой
    const tele = (m.enraged ? 0.8 : 1) * (d.size === "l" ? 1.1 : 1.25) * 1000;
    const pats = d.size === "l" ? ["circle", d.role === "charger" ? "dash" : d.role === "caster" ? "triple" : "nova"]
      : m.phase === 1 ? ["circle", "line", "nova"] : m.phase === 2 ? ["triple", "line3", "ring", "circle"] : ["triple", "ring", "line3", "nova", "circle"];
    const p = pats[m.patIdx++ % pats.length];
    const dx = best.x - m.x, dy = best.y - m.y, dist = Math.hypot(dx, dy) || 1, ux = dx / dist, uy = dy / dist;
    if (p === "circle") this.cast(m, { kind: "circle", at: now + tele, x: best.x, y: best.y, r: Math.round(85 * big), dmg: dmg * 1.6 });
    else if (p === "triple") {
      const targets = [...players.values()].filter((q) => q.alive && Math.hypot(q.x - m.x, q.y - m.y) < 420).slice(0, 3);
      for (let i = 0; i < 3; i++) {
        const t = targets[i] || best, a = i * 2.1 + this.rand();
        this.cast(m, { kind: "circle", at: now + tele + i * 180, x: t.x + (targets[i] ? 0 : Math.cos(a) * 90), y: t.y + (targets[i] ? 0 : Math.sin(a) * 90), r: Math.round(70 * big), fx: "meteor", dmg: dmg * 1.4 });
      }
    } else if (p === "line" || p === "line3") {
      const n = p === "line3" ? 3 : 1;
      for (let i = 0; i < n; i++) {
        const a = Math.atan2(uy, ux) + (i - (n - 1) / 2) * 0.45;
        this.cast(m, { kind: "line", at: now + tele, x: m.x, y: m.y, dx: Math.cos(a), dy: Math.sin(a), len: Math.round(360 * big), w: Math.round(36 * big), dmg: dmg * 1.7 });
      }
    } else if (p === "nova") this.cast(m, { kind: "nova", at: now + tele, x: m.x, y: m.y, r: Math.round(150 * big), dmg: dmg * 1.5 });
    else if (p === "ring") this.cast(m, { kind: "ring", at: now + tele * 1.1, x: m.x, y: m.y, r0: Math.round(90 * big), r: Math.round(260 * big), dmg: dmg * 1.6 });
    else if (p === "dash") { m.windup = 0.7; m.dashX = ux; m.dashY = uy; this.events.push({ k: "tele", id: m.id, x: Math.round(m.x), y: Math.round(m.y), dx: +ux.toFixed(3), dy: +uy.toFixed(3), len: 220, t: 0.7 }); }
    m.atkCd = (d.size === "l" ? 3.2 : 3.6) * (m.enraged ? 0.7 : 1);
  }

  // смена фазы босса: объявление + призыв помощников из окрестного региона
  checkPhase(m: ZMob, d: any) {
    if (!d.boss) return;
    const frac = m.hp / m.maxHp;
    const want = frac <= 0.3 ? 3 : frac <= 0.6 ? 2 : 1;
    if (want <= m.phase) return;
    m.phase = want;
    if (want === 3) m.enraged = true;
    this.events.push({ k: "phase", id: m.id, x: Math.round(m.x), y: Math.round(m.y), p: want, text: want === 3 ? `«${d.name}» в ярости!` : `«${d.name}» меняет тактику!` });
    const pool = summonPool(ZONE_MOBS, d); // biomes.ts — та же формула показывает свиту в Бестиарии
    const n = d.size === "huge" ? 4 : 3;
    for (let i = 0; i < n && pool.length; i++) {
      const a = (i / n) * Math.PI * 2;
      const add = this.addMob(pool[Math.floor(this.rand() * pool.length)], this.clamp(m.x + Math.cos(a) * 70), this.clamp(m.y + Math.sin(a) * 70), { region: null });
      add.targetSid = m.targetSid;
    }
  }

  // players: sid → состояние игрока в мире. onHit(sid, dmg) — урон игроку; onKill(mob) — смерть моба.
  update(dt: number, now: number, players: Map<string, ZPlayer>, onHit: (sid: string, dmg: number, src: string, mob?: ZMob, bm?: number, how?: string) => void, onKill: (m: ZMob) => void) {
    this.now = now; this.pl = players; this.curHit = onHit;
    this.syncBlackCamps(now);
    this.runMfx(now);
    if (this.projs.length) this.updateProjs(dt, players);
    const scale = Math.max(1, Math.min(4, players.size)); // ХП босса растёт с числом игроков (ограниченно)
    if (this.proc) {
      // убитые/исчезнувшие процедурные мобы удаляются (их место займёт режиссёр)
      for (let i = this.mobs.length - 1; i >= 0; i--) {
        const m = this.mobs[i];
        if (m.dead && !m.fixed) {
          if (m.special === "boss") {
            const bk = (m as any).bossKey || m.type;
            const b = this.gen.bosses.find((x) => (x.key || x.type) === bk);
            delete this.bossIds[bk]; this.bossAt[bk] = now + ((b && BOSS_TIMERS[b.type]?.every) || b?.every || 600) * 1000; // таймер — из админки
          }
          if (m.special === "rare" && this.rareIds[m.type] === m.id) {
            const r = this.gen.rares.find((x) => x.type === m.type)!;
            delete this.rareIds[m.type]; this.rareSchedule(r, now);
          }
          this.byId.delete(m.id);
          this.mobs.splice(i, 1);
        }
      }
      this.dirAcc += dt;
      if (this.dirAcc >= ZONE_GEN.directorEvery) {
        if (this.gen.camps) { if ([...players.values()].some((p) => p.alive)) this.specials(now, players); this.ambient(now, players); } // лагеря вместо режиссёра + бродячие
        else this.director(this.dirAcc, now, players);
        this.dirAcc = 0;
      }
    }
    const sleepy = !!this.gen.camps;
    if (sleepy) this.computeAwake(players);
    // сетка игроков по чанкам: поиск цели — только среди соседних чанков (O(мобы × игроки рядом))
    let pgrid: Map<number, ZPlayer[]> | null = null;
    if (sleepy && players.size > 4) { pgrid = new Map(); for (const p of players.values()) { const k = ck(p.x, p.y); const b = pgrid.get(k); if (b) b.push(p); else pgrid.set(k, [p]); } }
    let awake = 0, asleep = 0;
    for (const m of this.mobs) {
      const d = ZONE_MOBS[m.type];
      // сон: чанк без игроков рядом — без ИИ (мобы заморожены; поводок/лечение — мгновенно при засыпании)
      if (sleepy && !this.awake.has(sk(m.x, m.y))) {
        asleep++;
        if (!m.dead && (m.targetSid || m.mobTarget || m.reset || m.hp < m.maxHp)) { m.x = m.sx; m.y = m.sy; m.hp = m.maxHp; m.targetSid = null; m.mobTarget = 0; m.reset = false; m.casts = []; m.dot = null; m.dots = []; m.windup = 0; m.dashT = 0; }
        continue;
      }
      awake++;
      if (!(m as any).spOk) this.spawnFix(m); // дом/спавн — вне твёрдых пропсов (лениво: только бодрствующие, сетка Аринара строится по чанкам)
      if (!m.dead && m.dots?.length) {
        m.dots = m.dots.filter((x) => x.until > now && !(this.guard && this.guard.inDome(m.x, m.y))); // в куполе Чёрного мага урон игроков (и по времени) не действует
        if (!m.dots.length) m.dot = null;
        else {
          let killer = "";
          for (const x of m.dots) { // каждый стак тикает сам: урон идёт своему источнику (счётчик DPS, вклад в награду)
            const dmg = x.dps * dt;
            m.hp -= dmg; killer = x.sid;
            m.dmgBy.set(x.sid, (m.dmgBy.get(x.sid) || 0) + dmg);
            const acc = ((m as any).dotAcc ||= {}); acc[x.sid] = (acc[x.sid] || 0) + dmg; // урон по времени — событием раз в ~1 с
            if (acc[x.sid] >= Math.max(1, x.dps)) { this.events.push({ k: "hit", id: m.id, d: Math.round(acc[x.sid]), by: x.sid, dot: 1 }); acc[x.sid] = 0; }
          }
          if (m.hp <= 0) { (m as any).killer = killer; m.k1 = ""; this.kill(m, onKill); continue; }
          this.checkPhase(m, d);
        }
      }
      if (!m.dead && (m.kbx || m.kby)) {
        m.x += m.kbx * dt * 10; m.y += m.kby * dt * 10; this.solid(m);
        m.kbx *= 0.75; m.kby *= 0.75;
        if (Math.abs(m.kbx) + Math.abs(m.kby) < 0.5) { m.kbx = 0; m.kby = 0; }
      }
      if (m.dead) {
        if (m.fixed && now >= m.respawnAt) {
          if (m.roam) { m.sx = m.roam.home[0]; m.sy = m.roam.home[1]; m.roam.i = 1; (m as any).spOk = 0; }
          m.dead = false; m.x = m.sx; m.y = m.sy; m.reset = false; m.mobTarget = 0;
          if (m.camp && !m.chief) { m.elite = (m as any).bmc ? !!(m as any).bmElite : this.rand() < (this.gen.regions.find((r) => r.id === m.region)?.elite || 0); } // чёрный лагерь/логово: элитность из таблицы, не по шансу региона
          this.rollCursed(m); m.maxHp = this.hpOf(m, scale); m.hp = m.maxHp; m.hpBase = ZONE_MOBS[m.type].hp;
          m.dmgBy.clear(); m.hb?.clear(); m.usedAbility.clear(); m.qf?.clear(); m.targetSid = null; m.phase = 1; m.enraged = false; m.casts = [];
        }
        continue;
      }
      // регенерация проклятых и зачарованных — в бою тоже (анти-кайт): % макс. ОЗ в секунду (сброс лечит сам)
      if (!m.reset && m.hp < m.maxHp) { const rp = mobRegenPct(m); if (rp > 0) m.hp = Math.min(m.maxHp, m.hp + m.maxHp * rp / 100 * dt); }
      if (m.casts.length) this.resolveCasts(m, now, players, onHit);
      // цель
      // поводок MMO: утащили далеко от дома → «сброс»: домой бегом, быстро лечится до полного, игнорирует игроков
      const homeD = Math.hypot(m.x - m.sx, m.y - m.sy);
      const tIn = !!(this.keepOut && m.targetSid && (() => { const t = players.get(m.targetSid!); return t && this.keepOut!.inside(t.x, t.y, -(this.keepOut!.aggroPad?.() ?? 0)); })()); // цель ушла под купол глубже края на mobAggroPadPx (радиус R − запас; было R + запас — игрок СНАРУЖИ у края сбрасывал мобов) — моб теряет цель
      // цель ушла под купол: моб просто теряет её (без «Уклонения» — не неуязвим, не бежит домой с лечением; дальше бродит у дома как обычно)
      if (tIn && !m.reset) { m.targetSid = null; m.casts = []; m.windup = 0; m.dashT = 0; m.burstUntil = 0; (m as any).combatSince = 0; this.stats.domeDrops++; }
      if (!m.reset && (m.targetSid || m.mobTarget) && homeD > (m.special || d.boss ? ZONE_GEN.leashBoss : ZONE_GEN.leash)) {
        m.reset = true; m.targetSid = null; m.mobTarget = 0; m.casts = []; m.windup = 0; m.dashT = 0; m.dot = null; m.dots = []; m.burstUntil = 0; (m as any).combatSince = 0; this.stats.resets++;
        this.events.push({ k: "evade", id: m.id, x: Math.round(m.x), y: Math.round(m.y) });
      }
      if (m.reset) {
        const dx = m.sx - m.x, dy = m.sy - m.y, dist = Math.hypot(dx, dy);
        const sp = d.speed * ZONE_GEN.resetSpeed * dt;
        let ux = dist > 0 ? dx / dist : 0, uy = dist > 0 ? dy / dist : 0; const K = this.keepOut;
        if (K?.around && dist > sp && K.inside(m.x + ux * sp, m.y + uy * sp, MOB_R) && !K.inside(m.sx, m.sy, MOB_R)) [ux, uy] = K.around(m.x, m.y, dx, dy); // путь домой через купол — в обход по ободу
        if (dist > sp) { m.x += ux * sp; m.y += uy * sp; } else { m.x = m.sx; m.y = m.sy; }
        if (K) this.solid(m); // домой — тоже не через купол города (solid при reset — только купол, без коллизий пропсов): скользит по ободу
        m.hp = Math.min(m.maxHp, m.hp + m.maxHp * ZONE_GEN.resetRegen * dt);
        if (dist <= sp && m.hp >= m.maxHp) { m.reset = false; m.dmgBy.clear(); m.hb?.clear(); m.usedAbility.clear(); m.qf?.clear(); m.phase = 1; m.enraged = false; }
        continue;
      }
      const aggro = (m as any).devCalm ? 0 : d.aggro * (m.special ? 1.2 : 1) * (isKiller(m) ? 1.25 : 1); // devCalm — только dev_spawn_mob (скриншоты)
      let best: ZPlayer | null = null, bd = aggro;
      if (m.targetSid) { const t = players.get(m.targetSid); if (t && t.alive) { const dd = Math.hypot(t.x - m.x, t.y - m.y); if (dd < aggro * (m.special ? 2.6 : 1.8) || (m.huntUntil && now < m.huntUntil && dd < ZONE_GEN.ambientDespawnDist)) { best = t; bd = dd; } } }
      const KO = this.keepOut, kpad = KO ? -(KO.aggroPad?.() ?? 0) : 0; // игрока под куполом (глубже края на запас) не выбираем целью — иначе агро → потеря цели → агро по кругу
      if (!best) for (const p of (pgrid ? this.playersNear(pgrid, m.x, m.y) : players.values())) { if (!p.alive) continue; if (KO && KO.inside(p.x, p.y, kpad)) continue; const dd = Math.hypot(p.x - m.x, p.y - m.y); if (dd < bd) { bd = dd; best = p; } }
      const fresh = !m.targetSid && best;
      m.targetSid = best ? best.sid : null;
      if (best) m.mobTarget = 0; // игроки важнее драки с мобом
      if (fresh) {
        m.burstUntil = now + (isKiller(m) ? 2800 : 1200); // проклятый дольше прессует — анти-kite
        (m as any).combatSince = now; // старт боя (ярость мирового босса)
        if (m.camp) for (const o of this.near(m.x, m.y, 360)) if (o.camp === m.camp && !o.targetSid && !o.reset) { o.targetSid = m.targetSid; o.burstUntil = now + 1200; }
      }
      if (!best) (m as any).combatSince = 0;
      m.atkCd = Math.max(0, m.atkCd - dt);
      m.leapCd = Math.max(0, m.leapCd - dt);
      for (const k of m.skills) m.skCd[k] = Math.max(0, (m.skCd[k] || 0) - dt);
      // Ярость мирового босса: мало damagers дольше bossEnrageSec, или soft enrage для рейда
      const isWorld = m.special === "boss" || !!d.boss;
      if (isWorld && (m as any).combatSince) {
        const fightSec = (now - (m as any).combatSince) / 1000;
        let damagers = 0; for (const k of m.dmgBy.keys()) if (!k.startsWith("mob:")) damagers++;
        const G = ZONE_GEN as any;
        // герой, опередивший босса на OUTLEVEL_SOLO_BOSS+, не провоцирует «ярость малой группы»
        let outlvl = damagers > 0; for (const k of m.dmgBy.keys()) if (!k.startsWith("mob:")) { const pl = players.get(k); if (!pl || (pl.lvl || 1) < (d.lvl || 1) + OUTLEVEL_SOLO_BOSS) outlvl = false; }
        if (!m.enraged && !outlvl && damagers < (G.bossEnrageMinPlayers || 3) && fightSec >= (G.bossEnrageSec || 75)) {
          m.enraged = true;
          this.events.push({ k: "phase", id: m.id, x: Math.round(m.x), y: Math.round(m.y), p: m.phase, text: `«${d.name}» в ярости — мало героев!` });
        } else if (!m.enraged && !outlvl && fightSec >= (G.bossSoftEnrageSec || 360)) {
          m.enraged = true;
          this.events.push({ k: "phase", id: m.id, x: Math.round(m.x), y: Math.round(m.y), p: m.phase, text: `«${d.name}» разъярён временем боя!` });
        }
      }
      const eliteDmg = mobDmgMul(m); // элита × вожак × проклятие × зачарование × ярость (мировой/босс)
      // рывок (charger и крупные): замах (телеграф) → рывок
      if (m.dashT > 0) {
        const dsp = d.size === "s" ? 330 : 420;
        m.dashT -= dt; m.x += m.dashX * dsp * dt; m.y += m.dashY * dsp * dt; this.solid(m);
        for (const p of players.values()) if (p.alive && Math.hypot(p.x - m.x, p.y - m.y) < d.radius + 12 && !m.usedAbility.has("dash:" + p.sid)) { onHit(p.sid, d.dmg * 1.5 * eliteDmg, m.type, m, undefined, "dash"); m.usedAbility.add("dash:" + p.sid); }
        if (m.dashT <= 0) for (const k of [...m.usedAbility]) if (k.startsWith("dash:")) m.usedAbility.delete(k);
        m.x = this.clamp(m.x); m.y = this.clamp(m.y); this.solid(m);
        continue;
      }
      if (m.windup > 0) {
        m.windup -= dt;
        if (m.windup <= 0) m.dashT = d.size === "s" ? 0.35 : 0.5;
        continue;
      }
      if ((m as any).frozenUntil > now) continue; // заморожен: ни шага, ни удара, ни навыка
      if ((m as any).castUntil > now) continue; // 🛠 навык конструктора: телеграф — моб стоит (уклониться можно)
      if (best) {
        const dx = best.x - m.x, dy = best.y - m.y, dist = Math.hypot(dx, dy) || 1, ux = dx / dist, uy = dy / dist;
        const sp = d.speed * ((m as any).frozenUntil > now ? 0 : 1) * (m.slowUntil > now ? 0.55 : 1) * (m.elite ? 1.1 : 1) * (m.enraged ? (isWorld ? ((ZONE_GEN as any).bossEnrageSpeed || 1.75) : 1.3) : 1) * (m.burstUntil > now ? 1.6 : 1) * (isKiller(m) ? (ZONE_GEN.cursedSpeed || 1.5) : 1) * (isWorld ? ((ZONE_GEN as any).bossCombatSpeed || 1.25) : 1);
        let want = d.radius + 14; // желаемая дистанция
        // навыки боссов/проклятых (свои кд)
        if (m.skills.length && dist < 420) {
          const k = m.skills.find((x) => m.skCd[x] <= 0);
          if (k) { this.useSkill(m, d, k, best, players, now, eliteDmg); m.skCd[k] = MOB_SKILLS[k].cd * (m.enraged ? 0.75 : 1); continue; }
        }
        if (d.black && d.bmAtk) { this.bmMobVsPlayer(m, d, best, players, now, eliteDmg, dist, ux, uy, sp, dt, onHit, onKill); continue; } // чёрный моб: удар своим лезвием, как у игрока
        if (d.size !== "s") {
          // Анти-kite: если герой далеко — рывок к нему (проклятый/обычный мировой босс)
          if (dist > 200 && m.leapCd <= 0) {
            m.windup = 0.45; m.dashX = ux; m.dashY = uy;
            m.leapCd = 3.2 * ((ZONE_GEN as any).bossLeapMul || 0.5);
            this.events.push({ k: "tele", id: m.id, x: Math.round(m.x), y: Math.round(m.y), dx: +ux.toFixed(3), dy: +uy.toFixed(3), len: Math.min(280, dist), t: 0.45 });
            continue;
          }
          if (m.atkCd <= 0 && dist < 420) { this.bossPattern(m, d, best, players, now); continue; }
        } else if (d.role === "charger") {
          if (dist < 150 && dist > 50 && m.atkCd <= 0) {
            m.windup = 0.55; m.dashX = ux; m.dashY = uy; m.atkCd = 2.4;
            this.events.push({ k: "tele", id: m.id, x: Math.round(m.x), y: Math.round(m.y), dx: +ux.toFixed(3), dy: +uy.toFixed(3), len: 115, t: 0.55 });
            continue;
          }
        } else if ((d.role === "melee" || d.role === "swarm") && d.lvl >= 3 && dist > 80 && dist < 210 && m.leapCd <= 0) {
          // прыжок: круг-телеграф под целью, через 0.65 с моб приземляется туда (уклоняемо)
          this.cast(m, { kind: "circle", at: now + 650, x: best.x, y: best.y, r: 52, dmg: d.dmg * 1.3 * eliteDmg, leap: true });
          m.leapCd = (d.role === "swarm" ? 7 : 5) * (isKiller(m) ? (ZONE_GEN.cursedLeap || 0.55) : 1); m.windup = isKiller(m) ? 0.4 : 0.65; m.dashX = 0; m.dashY = 0;
          continue;
        } else if (d.role === "ranged") {
          want = 170;
          if (dist < 280 && m.atkCd <= 0) {
            this.cast(m, { kind: "line", at: now + 700, x: m.x, y: m.y, dx: ux, dy: uy, len: 290, w: 20, dmg: d.dmg * 1.2 * eliteDmg, proj: mobShot(m.type, !!d.boss) }); // семейство снаряда по стихии моба (FX atlas v2)
            m.atkCd = 2.2; m.windup = 0.45;
            continue;
          }
        } else if (d.role === "caster") {
          want = 190;
          if (dist < 300 && m.atkCd <= 0) {
            this.cast(m, { kind: "circle", at: now + 1000, x: best.x, y: best.y, r: 60, dmg: d.dmg * 1.4 * eliteDmg, fx: "glyph_mine" });
            m.atkCd = 2.8; m.windup = 0.4;
            continue;
          }
        }
        if (dist > want) { m.x += ux * sp * dt; m.y += uy * sp * dt; this.solid(m); }
        else if (want > d.radius + 14 && dist < want - 50) { m.x -= ux * sp * 0.6 * dt; m.y -= uy * sp * 0.6 * dt; } // держит дистанцию
        if (dist <= d.radius + 16 && m.atkCd <= 0) {
          const tank = d.role === "tank";
          onHit(best.sid, d.dmg * eliteDmg * (tank ? 1.25 : d.role === "swarm" ? 0.9 : 1), m.type, m, undefined, "melee");
          m.atkCd = tank ? 1.4 : d.role === "swarm" ? 0.9 : 1.1;
        }
      } else {
        // бой моб↔моб: кочевник ↔ враждебный лагерь (осмотр раз в 0.4 с; только в бодрствующих чанках — сюда спящие не доходят)
        if (!m.mobTarget && now >= m.scanAt) { m.scanAt = now + 400; const f = this.findFoe(m, d.aggro); if (f) { m.mobTarget = f.id; this.rally(m, f.id); } }
        if (m.mobTarget && this.mobFight(m, d, dt, onKill, eliteDmg)) { m.x = this.clamp(m.x); m.y = this.clamp(m.y); this.solid(m); continue; }
        if (m.roam) { // кочевник: идёт по петле маршрута; «дом» для поводка — где он сейчас
          const [tx, ty] = m.roam.pts[m.roam.i], dx = tx - m.x, dy = ty - m.y, dist = Math.hypot(dx, dy);
          if (now >= m.roam.waitUntil) {
            if (dist < 20) { m.roam.i = (m.roam.i + 1) % m.roam.pts.length; m.roam.waitUntil = now + 1500 + Math.random() * 4000; }
            else { const sp = d.speed * 0.55 * dt; m.x += (dx / dist) * sp; m.y += (dy / dist) * sp; }
          }
          m.sx = m.x; m.sy = m.y;
          if (!m.dots?.length) m.hp = Math.min(m.maxHp, m.hp + m.maxHp * 0.08 * dt);
          if (m.hp >= m.maxHp) { m.dmgBy.clear(); m.hb?.clear(); m.qf?.clear(); }
          m.x = this.clamp(m.x); m.y = this.clamp(m.y); this.solid(m);
          continue;
        }
        // возврат/брожение у точки спавна; регенерация вне боя
        if (now >= m.nextWander) { m.nextWander = now + 2500 + Math.random() * 3000; m.wanderX = m.sx + (Math.random() - 0.5) * 120; m.wanderY = m.sy + (Math.random() - 0.5) * 120; if (!m.fixed && inSafe(m.wanderX, m.wanderY, 0, this.world)) { m.wanderX = m.sx; m.wanderY = m.sy; } }
        const dx = m.wanderX - m.x, dy = m.wanderY - m.y, dist = Math.hypot(dx, dy);
        if (dist > 4) { m.x += (dx / dist) * d.speed * 0.4 * dt; m.y += (dy / dist) * d.speed * 0.4 * dt; }
        if (!m.dots?.length) m.hp = Math.min(m.maxHp, m.hp + m.maxHp * 0.08 * dt); // горящий/отравленный не лечится
        if (m.hp >= m.maxHp) { m.dmgBy.clear(); m.hb?.clear(); m.usedAbility.clear(); m.qf?.clear(); m.phase = 1; m.enraged = false; }
      }
      m.x = this.clamp(m.x); m.y = this.clamp(m.y); this.solid(m);
    }
    this.stats.awake = awake; this.stats.asleep = asleep;
    this.reindex();
  }

  useSkill(m: ZMob, d: any, k: string, t: ZPlayer, players: Map<string, ZPlayer>, now: number, mul: number) {
    const big = d.size === "huge" ? 1.35 : d.size === "boss" ? 1.15 : d.size === "l" ? 1 : 0.7;
    const dmg = d.dmg * mul, tele = (m.enraged ? 800 : 1000);
    const dx = t.x - m.x, dy = t.y - m.y, dist = Math.hypot(dx, dy) || 1, ux = dx / dist, uy = dy / dist;
    this.events.push({ k: "mskill", id: m.id, x: Math.round(m.x), y: Math.round(m.y), name: MOB_SKILLS[k].name });
    if (k === "frost_nova") { this.cast(m, { kind: "nova", at: now + tele, x: m.x, y: m.y, r: Math.round(170 * big), dmg: dmg * 1.4, fx: "ice_fan" }); for (const p of players.values()) void p; }
    else if (k === "meteor") { const ts = [...players.values()].filter((q) => q.alive && Math.hypot(q.x - m.x, q.y - m.y) < 450).slice(0, 3); ts.forEach((q, i) => this.cast(m, { kind: "circle", at: now + tele * 1.3 + i * 200, x: q.x, y: q.y, r: Math.round(90 * big), dmg: dmg * 1.8, fx: "meteor" })); }
    else if (k === "spear_rain") { for (let i = 0; i < 5; i++) { const a = this.rand() * 6.283, r = 40 + this.rand() * 110; this.cast(m, { kind: "circle", at: now + tele + i * 120, x: t.x + Math.cos(a) * r, y: t.y + Math.sin(a) * r, r: Math.round(50 * big), dmg: dmg * 1.2, fx: "spear_rain" }); } }
    else if (k === "whirlwind") this.cast(m, { kind: "ring", at: now + tele, x: m.x, y: m.y, r0: Math.round(30 * big), r: Math.round(210 * big), dmg: dmg * 1.5, fx: "war_axe" });
    else if (k === "fly_blade_dash") { m.windup = 0.6; m.dashX = ux; m.dashY = uy; this.events.push({ k: "tele", id: m.id, x: Math.round(m.x), y: Math.round(m.y), dx: +ux.toFixed(3), dy: +uy.toFixed(3), len: 220, t: 0.6 }); }
    else if (k === "shadow_step") { m.x = this.clamp(t.x - ux * 60); m.y = this.clamp(t.y - uy * 60); this.solid(m); this.cast(m, { kind: "circle", at: now + 600, x: t.x, y: t.y, r: Math.round(70 * big), dmg: dmg * 1.5, fx: "auto_daggers" }); }
    else if (k === "fireball") this.cast(m, { kind: "line", at: now + 550, x: m.x, y: m.y, dx: ux, dy: uy, len: Math.round(420 * Math.max(0.8, big)), w: Math.round(40 * big), dmg: dmg * 1.6, proj: "fireball" });
    else if (!MOB_NATIVE.has(k)) this.heroCast(m, d, k, t, players, now, dmg, big, tele, ux, uy);
    else if (k === "smoke_bomb") { this.cast(m, { kind: "circle", at: now + 700, x: m.x, y: m.y, r: Math.round(120 * big), dmg: dmg * 0.9, fx: "plague_puddle" }); for (const p of players.values()) if (Math.hypot(p.x - m.x, p.y - m.y) < 140 * big) void p; }
    m.atkCd = Math.max(m.atkCd, 1.2);
  }

  /** Навык героя в руках моба: та же форма (abilityShapes.shapeOf), но по игрокам и с телеграфом (от удара можно уйти).
   *  Урон — урон моба × сила навыка (не больше CURSE.mobSkillPowerCap, по умолчанию ×1.8). */
  heroCast(m: ZMob, d: any, id: string, t: ZPlayer, players: Map<string, ZPlayer>, now: number, dmg: number, big: number, tele: number, ux: number, uy: number) {
    const s: any = shapeOf(id), pw = Math.min(Math.max(0.8, Number((CURSE as any).mobSkillPowerCap) || 1.8), Math.max(0.8, (ABILITY_BY_ID as any)[id]?.power || 1)), D = dmg * pw, k = Math.max(0.8, big);
    const AD: any = (ABILITY_BY_ID as any)[id]; // 🜏 навык артефакта у любого моба: % ОЗ игрока = pct + k × чёрный урон моба (обычный моб — 0)
    this.bmCast = AD?.cls === "artifact" && BMA_CFG.on && AD.bm ? { pct: bmSkillPct(AD.bm, Number(d?.bdmg) || 0), D } : null;
    const sk = SK_DEFS[id];
    if (sk && BMA_CFG.skillCraft !== false) { const pct = this.bmCast && sk.dmg !== "normal" ? this.bmCast.pct : 0; this.bmCast = null; this.mobCraft(m, id, sk, t, now, D, k, sk.form === "proj" ? 550 : tele, ux, uy, pct); return; }
    try { this.heroCastShape(m, s, id, t, now, D, k, tele, ux, uy); } finally { this.bmCast = null; }
  }
  /** 🛠 навык конструктора у моба — ВСЕ параметры конструктора (castCraft, как у героя): траектории, число/разброс снарядов,
   *  ×урона, тики, взрыв, пробивание, хитбокс/масштаб, замедление/заморозка/отброс игроков, лечение/неуязвимость/защита/скорость моба,
   *  модификаторы, цена ОЗ. Цели — игроки. Сначала телеграф (моб стоит), через tele — удар; листы навыка у клиента (без огненной подмены).
   *  pct > 0 — чёрный/чистый навык: % макс. ОЗ игрока (pct + k × чёрный урон моба) × множитель формы; иначе — плоский урон моба D. */
  mobCraft(m: ZMob, id: string, sk: any, t: ZPlayer, now: number, D: number, k: number, tele: number, ux: number, uy: number, pct: number) {
    const R = (v: number) => Math.round(v), ev = (e: any) => this.events.push(e);
    const ox = m.x, oy = m.y, tx = t.x, ty = t.y, tl = Math.max(250, tele) / 1000;
    if (sk.form === "cone") ev({ k: "tele_cone", id: m.id, fx: id, x: R(ox), y: R(oy), dx: +ux.toFixed(3), dy: +uy.toFixed(3), len: R(sk.len * k), arc: +(sk.arc / 57.29578).toFixed(3), t: tl });
    else if (sk.form === "nova") ev({ k: "tele_circle", id: m.id, x: R(ox), y: R(oy), r: R(sk.r * k), t: tl });
    else if (sk.form === "rain") ev({ k: "tele_circle", id: m.id, x: R(tx), y: R(ty), r: R(sk.area * k + sk.r), t: tl });
    else ev({ k: "tele", id: m.id, x: R(ox), y: R(oy), dx: +ux.toFixed(3), dy: +uy.toFixed(3), len: R(sk.form === "dash" ? sk.len : Math.min(600, sk.len || 400) * k), t: tl });
    (m as any).castUntil = now + tele;
    this.mlater(tele, () => {
      if (m.dead || m.reset) return;
      const onHit = this.curHit; if (!onHit) return;
      const area = sk.form === "rain" ? sk.area * k * 1.1 : 0; // дождь: центр — на цели (у героя — перед ним по прицелу)
      const hooks = {
        hpFrac: () => m.hp / Math.max(1, m.maxHp), chargeFrac: () => 1,
        pay: (p: number) => { const c = m.maxHp * p / 100; if (m.hp <= c) return false; m.hp -= c; return true; },
        mod: (md: any, i: number) => { if (md.k === "heal") { m.hp = Math.min(m.maxHp, m.hp + m.maxHp * (Number(md.v) || 0) / 100); return; } const b = skBuffAdd(((m as any).skb ||= []), id + ":" + i, md, this.now); if (b && md.k === "spd") m.burstUntil = Math.max(m.burstUntil, b.until); },
        selfHaste: (ms: number) => { m.burstUntil = Math.max(m.burstUntil, this.now + ms); },
        selfSlow: (ms: number) => { m.slowUntil = Math.max(m.slowUntil, this.now + ms); },
        dmgMul: () => { const q = skBuffSum((m as any).skb, "dmg", this.now); return (1 + q.pct / 100) * q.mul; },
      };
      const P = () => [...(this.pl || new Map()).values()].filter((p) => p.alive);
      const c: any = {
        sk: hooks, sid: "mob:" + m.id, x: area ? tx - ux * area : m.x, y: area ? ty - uy * area : m.y, dx: ux, dy: uy, now: this.now, dmg: D, radiusMult: k,
        zone: { mobsAround: (x: number, y: number, r: number) => P().filter((p) => Math.hypot(p.x - x, p.y - y) <= r + 14) },
        hit: (p: ZPlayer, mult: number) => { if (!p.alive) return 0; onHit(p.sid, D * mult, m.type, m, pct > 0 ? pct * mult : undefined, "skill:" + id); return D * mult; },
        status: (p: ZPlayer, st: any, fx?: number, fy?: number) => { // игроку: замедление/заморозка — клиент (как на арене), отброс — сдвиг
          if (st.freeze) ev({ k: "pstatus", to: p.sid, s: "freeze", ms: Math.min(3000, Number(st.freeze) || 1000), x: R(p.x), y: R(p.y) });
          else if (st.slow) ev({ k: "pstatus", to: p.sid, s: "slow", ms: 1200, x: R(p.x), y: R(p.y) });
          if (st.knock) { const ex = p.x - (fx ?? m.x), ey = p.y - (fy ?? m.y), L = Math.hypot(ex, ey) || 1, kd = Math.min(400, (Number(st.knock) || 0) * KNOCK_PX); ev({ k: "pstatus", to: p.sid, s: "knock", dx: +(ex / L).toFixed(3), dy: +(ey / L).toFixed(3), d: R(kd), x: R(p.x), y: R(p.y) }); }
        },
        move: (x: number, y: number) => { m.x = this.clamp(x); m.y = this.clamp(y); this.solid(m); },
        bounds: (x: number, y: number) => [this.clamp(x), this.clamp(y)],
        buff: (b: any) => { if (b.heal) m.hp = Math.min(m.maxHp, m.hp + b.heal); if (b.invuln || b.dr) m.shieldUntil = Math.max(m.shieldUntil, this.now + Math.min(4000, (b.invuln || 0) + (b.dr || 0))); },
        later: (ms: number, fn: () => void) => this.mlater(ms, () => { if (!m.dead) fn(); }),
        ev: (e: any) => ev({ ...e, sid: undefined, o: "m", mob: m.id, ...(BMA_CFG.skillArt === false ? { art: 0 } : {}), ...((Number(BMA_CFG.skillFxScale) || 1) !== 1 ? { fs: Number(BMA_CFG.skillFxScale) } : {}) }),
        fire: (o: any) => { const oh = o.onHit, oe = o.onEnd; if (o.arc) o.range = Math.max(60, Math.min(o.range, Math.hypot(tx - o.x, ty - o.y))); /* «Навесом»: моб бросает в точку цели, а не на всю дальность */ return this.fire({ ...o, o: "m", mob: m.id, onHit: oh ? (p: any, i: number) => oh(p, i) : undefined, onEnd: oe } as any); },
      };
      try { castCraft(id, sk, c, k, BMA_CFG.skillArt !== false, () => this.rand(), projSprite(id, "fireball")); } catch (e) { void e; }
    });
  }
  private mfx: { at: number; fn: () => void }[] = [];
  private curHit: ((sid: string, dmg: number, src: string, mob?: ZMob, bm?: number, how?: string) => void) | null = null;
  /** отложенные шаги навыков мобов (телеграф → удар, тики, дождь, след рывка); не больше 2000 в очереди */
  mlater(ms: number, fn: () => void) { if (this.mfx.length < 2000) this.mfx.push({ at: (this.now || Date.now()) + Math.max(0, ms), fn }); }
  runMfx(now: number) {
    if (!this.mfx.length) return;
    const due = this.mfx.filter((f) => f.at <= now); if (!due.length) return;
    this.mfx = this.mfx.filter((f) => f.at > now);
    for (const f of due) f.fn();
  }
  private heroCastShape(m: ZMob, s: any, id: string, t: ZPlayer, now: number, D: number, k: number, tele: number, ux: number, uy: number) {
    switch (s.k) {
      case "line": this.cast(m, { kind: "line", at: now + tele, x: m.x, y: m.y, dx: ux, dy: uy, len: Math.round(s.len * k), w: Math.round((s.w || 44) * k), dmg: D }); break;
      case "proj": this.cast(m, { kind: "line", at: now + 550, x: m.x, y: m.y, dx: ux, dy: uy, len: Math.round(s.len * k), w: Math.round(40 * k), dmg: D, proj: id === "fireball" ? "fireball" : "fire_spark" }); break;
      case "dash": m.windup = 0.6; m.dashX = ux; m.dashY = uy; this.events.push({ k: "tele", id: m.id, x: Math.round(m.x), y: Math.round(m.y), dx: +ux.toFixed(3), dy: +uy.toFixed(3), len: Math.round(s.len * k), t: 0.6 }); break;
      case "leap": this.cast(m, { kind: "circle", at: now + tele, x: t.x, y: t.y, r: Math.round(s.r * k), dmg: D, leap: true }); break;
      case "meteor": this.cast(m, { kind: "circle", at: now + tele + (s.delay || 600), x: t.x, y: t.y, r: Math.round(s.r * k), dmg: D * 1.2, fx: id === "warden_slam" ? "warden_slam" : "meteor" }); break;
      case "rain": for (let i = 0; i < Math.min(8, s.n); i++) { const a = this.rand() * 6.283, r = this.rand() * s.area; this.cast(m, { kind: "circle", at: now + tele + i * 110, x: t.x + Math.cos(a) * r, y: t.y + Math.sin(a) * r, r: Math.round(s.r * k), dmg: D * 0.6 }); } break;
      case "cone": this.events.push({ k: "tele_cone", id: m.id, fx: id, x: Math.round(m.x), y: Math.round(m.y), dx: +ux.toFixed(3), dy: +uy.toFixed(3), len: Math.round(s.len * k), arc: s.arc, t: Math.round(Math.max(0.2, tele / 1000) * 100) / 100 }); // телеграф конуса спрайтом
        for (const off of [-s.arc / 3, 0, s.arc / 3]) { const c = Math.cos(off), sn = Math.sin(off); this.cast(m, { kind: "line", at: now + tele, x: m.x, y: m.y, dx: ux * c - uy * sn, dy: ux * sn + uy * c, len: Math.round(s.len * k), w: 40, dmg: D * 0.7 }); } break;
      case "nova": this.cast(m, { kind: "nova", at: now + tele, x: m.x, y: m.y, r: Math.round(s.r * k * 1.2), dmg: D }); if (s.dr) m.shieldUntil = now + Math.min(4000, s.dr); break;
      case "ring": this.cast(m, { kind: "ring", at: now + tele, x: m.x, y: m.y, r0: Math.round(30 * k), r: Math.round(200 * k), dmg: D }); break;
      case "cloud": this.cast(m, { kind: "circle", at: now + 700, x: m.x, y: m.y, r: Math.round(s.r * k), dmg: D * 0.8, fx: "plague_puddle" }); m.shieldUntil = now + Math.min(2500, s.invuln || 1500); break;
      default: this.cast(m, { kind: "nova", at: now + tele, x: m.x, y: m.y, r: Math.round(150 * k), dmg: D });
    }
  }
  // Атака игрока по мобу (авто-атака). Дистанция/кд проверяются; урон считает вызывающий по статам героя.
  attack(p: ZPlayer, mobId: number, now: number, lastAt: number): ZMob | null {
    if (now - lastAt < ZONE_ATTACK_CD_MS) return null;
    const m = this.byId.get(mobId);
    if (!m || m.dead || !p.alive) return null;
    if (Math.hypot(m.x - p.x, m.y - p.y) > ZONE_ATTACK_RANGE + ZONE_MOBS[m.type].radius) return null;
    return m;
  }
  // Удар по клику: цели вдоль направления (dx,dy — единичный вектор) по форме оружия, ближние первыми
  targetsInDir(p: ZPlayer, dx: number, dy: number, atk: { kind: string; range: number; width?: number; arc?: number; max?: number }): ZMob[] {
    if (!p.alive) return [];
    const out: { m: ZMob; d: number }[] = [];
    for (const m of this.near(p.x, p.y, atk.range + 80)) {
      const r = ZONE_MOBS[m.type].radius;
      const ex = m.x - p.x, ey = m.y - p.y;
      const along = ex * dx + ey * dy;
      if (along < -r || along > atk.range + r) continue;
      if (atk.kind === "arc") {
        if (m.dead || !inArc(p.x, p.y, dx, dy, atk.range, atk.arc || 1, m.x, m.y, r)) continue;
        out.push({ m, d: Math.hypot(ex, ey) });
      } else {
        const perp = Math.abs(ex * dy - ey * dx);
        if (perp > (atk.width || 20) + r) continue;
        out.push({ m, d: along });
      }
    }
    out.sort((a, b) => a.d - b.d);
    const max = atk.kind === "proj" ? 1 : (atk.max || 1);
    return out.slice(0, max).map((x) => x.m);
  }
  mobsAround(x: number, y: number, r: number): ZMob[] {
    return this.near(x, y, r + 60).filter((m) => Math.hypot(m.x - x, m.y - y) <= r + ZONE_MOBS[m.type].radius);
  }
  damage(m: ZMob, sid: string, dmg: number, onKill: (m: ZMob) => void, pen?: { penFlat?: number; penPct?: number; black?: boolean; pure?: { fire: number; ice: number }; el?: string }, src?: "ba" | "ab") {
    if (m.dead) return;
    // удары игрока по мобу (задания доски: «одним ударом», «только навыками», «без навыков»): сколько ударов, какими, был ли моб цел
    if (sid && !sid.startsWith("mob:") && !m.reset) { const hb = (m.hb ||= new Map()); let e = hb.get(sid);
      if (!e) { e = { n: 0, ab: 0, ba: 0, full: m.hp >= m.maxHp && !m.dmgBy.size }; hb.set(sid, e); }
      e.n++; if (src === "ab") e.ab++; else if (src === "ba") e.ba++; }
    const d = ZONE_MOBS[m.type];
    if (m.reset) { this.events.push({ k: "hit", id: m.id, d: 0, evade: 1 }); return 0; } // «Уклонение»: сбрасывающийся моб неуязвим
    if (this.guard && sid) { const a = this.pl?.get(sid); if (this.guard.guardMobHit(m, sid, a ? a.x : NaN, a ? a.y : NaN)) { this.events.push({ k: "hit", id: m.id, d: 0, dome: 1 }); return 0; } } // купол Чёрного мага
    const armor = d.armor * mobArmorMul(m);
    const sh = m.shieldUntil > Date.now() ? 0.5 : 1;
    const pq: Record<string, number> = {}; if (pen?.pure) for (const k of Object.keys(pen.pure)) pq[k] = Math.max(0, Math.round((Number(pen.pure[k]) || 0) * sh)); // ICE: чистый урон стихий оси — сверху, мимо брони
    const pv = pureEvFields(pq), pSum = pureSum(pq);
    let main = pen?.black ? Math.max(0, Math.round(dmg * sh)) : Math.max(1, Math.round(mitigateDamage(dmg, armor, pen?.penFlat || 0, pen?.penPct || 0) * sh)); // 🜏 чёрный урон: броня моба не действует
    // 🜏 чёрная броня / предельная броня деталей оружия чёрного моба — от ударов игроков (та же формула, что у игрока: bmDefendEx)
    let bz = false; if (d.bmDef && sid && !sid.startsWith("mob:") && main > 0) { const z = bmDefendEx(main, d.bmDef, m.maxHp); main = Math.max(0, Math.round(z.d)); bz = z.zero; }
    const real = main + pSum;
    if (sid && !m.qf?.has(sid)) this.onEngage?.(m, sid); // начало боя игрока с мобом (условия квестов)
    m.hp -= real;
    m.dmgBy.set(sid, (m.dmgBy.get(sid) || 0) + real);
    if (!m.targetSid) m.targetSid = sid;
    this.events.push({ k: "hit", id: m.id, d: real, by: sid, bm: pen?.black ? 1 : undefined, ...(bz ? { zero: 1 } : {}), ...pv, ...(pen?.el && pen.el !== "fire" ? { el: pen.el } : {}) }); // bm — чёрный удар (вспышка/звук у клиента); by — для счётчика DPS у клиента
    if (this.guard && sid) this.guard.noteFight(m, sid); // «рядом идёт бой» — Чёрный маг идёт защищать
    if (m.hp <= 0) { (m as any).killer = sid; m.k1 = sid; this.kill(m, onKill); } // добивший — для правила мешка (10%)
    else this.checkPhase(m, d);
    return real;
  }
  kill(m: ZMob, onKill: (m: ZMob) => void) {
    m.dead = true; m.hp = 0; m.windup = 0; m.dashT = 0; m.dot = null; m.dots = []; m.casts = [];
    { const bc = (m as any).bmc && BM_CAMPS[(m as any).bmc]; m.respawnAt = Date.now() + (bc ? campRespawn(bc, () => this.rand()) : m.rk ? campRespawnSec(m.rk) : m.respawn) * 1000; } // лагеря — случайно campRespawnMin…Max (живая правка админки)
    this.events.push({ k: "die", id: m.id, x: Math.round(m.x), y: Math.round(m.y), type: m.type });
    if (m.special === "boss") this.events.push({ k: "announce", text: `🏆 ${m.cursed ? "Проклятый м" : "М"}ировой босс «${ZONE_MOBS[m.type].name}»${tierDef(m.ench) ? ` (✦ ${tierDef(m.ench)!.name})` : ""} повержен!`, color: "#fde68a" });
    onKill(m);
    m.qf?.clear(); m.k1 = undefined;
  }
  /** хук: игрок sid впервые вступил в бой с мобом m (удар по мобу или удар моба по игроку) — ставит m.qf */
  onEngage: ((m: ZMob, sid: string) => void) | null = null;
  /** когда узел снова готов для игрока who (личные узлы — свой таймер у каждого; иначе общий) */
  nodeReadyAt(n: ZNode, who?: string) { return GATHER_CFG.personal !== false && who ? Math.max(n.readyAt, n.by?.get(who) || 0) : n.readyAt; }
  /** отметить сбор: личный таймер (или общий, если «личные узлы» выключены в админке) */
  nodeTaken(n: ZNode, who: string, now: number) {
    const at = now + n.respawn * 1000 * Math.max(0.05, Number(GATHER_CFG.respawnMult) || 1);
    if (GATHER_CFG.personal === false) { n.readyAt = at; return; }
    const by = (n.by ||= new Map());
    if (by.size > 64) for (const [k, t] of by) if (t <= now) by.delete(k); // старые таймеры не копятся
    by.set(who, at);
  }
  gatherCheck(p: ZPlayer, nodeId: number, startedAt: number, now: number, who?: string): ZNode | null {
    const n = this.nodes.find((x) => x.id === nodeId);
    if (!n || now < this.nodeReadyAt(n, who) || !p.alive) return null;
    if (Math.hypot(n.x - p.x, n.y - p.y) > gatherRange() + gatherSlack()) return null; // дальность и запас — из админки «⛏ Сбор»
    if (now - startedAt < gatherTimeMs()) return null;
    return n;
  }
  // AOI: клиент получает только мобов/события в радиусе видимости
  takeEvents() { // снаряд: a — сколько мс он уже летит на сервере (события уходят пачкой 5 Гц; клиент догоняет позицию)
    const ev = this.events.splice(0, 80), now = Date.now();
    for (const e of ev) if (e.k === "proj" && e._b) { e.a = Math.max(0, Math.min(400, now - e._b)); delete e._b; }
    return ev;
  }
  state(px: number, py: number, ev: any[], aoi = 700, who?: string, mobAoi = aoi) {
    const m: number[] = [];
    const now = Date.now();
    const ma = mobAoi; // мобы — по своему радиусу (мини-карта), события/узлы — по aoi
    for (const x of (this.gen.camps ? this.near(px, py, ma * 1.15) : this.mobs)) {
      if (x.dead) continue;
      const far = Math.abs(x.x - px) > ma || Math.abs(x.y - py) > ma;
      if (far && !(x.special && Math.abs(x.x - px) < ma * 1.15 && Math.abs(x.y - py) < ma * 1.15)) continue; // боссов видно дальше
      // статусы — битами (могут быть одновременно) + число стаков каждого (по 3 бита: поджог 13–15, яд 16–18, кровотечение 19–21)
      const st = mobStatusBits(x.dots, now);
      m.push(x.id, MOB_INDEX[x.type] ?? bmxIndex(x.type), Math.round(x.x), Math.round(x.y), Math.round((x.hp / x.maxHp) * 100),
        (x.windup > 0 ? 1 : x.dashT > 0 ? 2 : 0) | (x.elite ? 4 : 0) | st | (x.slowUntil > now ? 64 : 0) | (x.enraged ? 128 : 0) | (x.special === "boss" ? 256 : x.special === "rare" ? 512 : 0) | (x.cursed ? 1024 : 0) | (x.reset ? 2048 : 0) | (x.chief ? 4096 : 0) | ((x as any).frozenUntil > now ? 1 << 22 : 0) | (enchTier(x) << 23) | ((x as any).bmFt > now ? (1 << 27) | ((x as any).bmFl ? 1 << 26 : 0) : 0)); // ярус зачарования — биты 23–25; 👹 чёрный в бою: 27 — сторона задана, 26 — смотрит влево
    }
    const nr = aoi * 2.2; // узлы — тоже по интересу (в Аринаре их сотни)
    const n = this.nodes.filter((x) => !this.gen.camps || (Math.abs(x.x - px) < nr && Math.abs(x.y - py) < nr)).map((x) => { const r = this.nodeReadyAt(x, who); return r <= now ? [x.id, 1] : [x.id, 0, Math.ceil((r - now) / 1000)]; }); // [id, готов, через сколько с]
    const near = ev.filter((e) => e.x === undefined || (Math.abs(e.x - px) <= aoi * 1.4 && Math.abs(e.y - py) <= aoi * 1.4));
    return { w: this.world, m, n, ev: near, sd: this.proc ? this.seed : undefined };
  }
}
