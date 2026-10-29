import { SK_DEFS, skPublic } from "./skillCraft";
/** 🛠 навыки конструктора для клиента (анимация, траектория, стихия) — пресеты и свои skx_… */
const skdClient = () => Object.values(SK_DEFS).map(skPublic);
import { isRs, rsCodexId } from "./rsAny";
import { artInfo, isArtifactId } from "./blackArtReg";
import { BMA_CFG, isBmSkill, artModeAtk } from "./blackArt";
import { CHEST } from "./chests";
import { UPG, upgCost, upgClient } from "./upgrade";
import { BM_CFG, charBlk, charBlkVis, blkVisClient } from "./bmCfg";
import { lightClient } from "./lightCfg";
import { gfxClient } from "./gfxCfg";
import { CURSE, CURSED_TAG, isCursedTag, untag, instStats, glowLevel, curseClient } from "./cursed";
import { ENCH, parseTag, tagOf, tierDef, tierOk, weightedTier, enchClient } from "./enchant";
// Серверный профиль «Проклятых»: модель аккаунта/героя и вся игровая логика над ней.
// Хранение — store.ts (D1 — источник истины, сквозная запись из DO; фолбэк — SQLite DO, схема ниже).
// Таблицы (миграции идемпотентны, применяются при старте объекта):
//   mc_schema(version)                         — версия схемы
//   mc_accounts(pkey PK, data JSON, verified, updated_at)   — общий для аккаунта: сумка, материалы, звёзды, квесты…
//   mc_heroes(pkey, hero, data JSON, updated_at, PK(pkey,hero)) — у каждого героя своя ветка прогресса
// pkey = "uid:<Clerk userId>" (проверенный токен) или "guest:<ник>" (непроверенный гость).
import { weaponType,
  HERO_IDS, HERO_MAX_LEVEL, heroXpNeed, talentPointsForLevel, abilitySlots, heroLevelHp, STAT_CAPS, softCap, armorToReduction,
  TALENTS, TALENT_BY_ID, TALENT_TIER_REQ, TALENT_VERSION, ACTIVE_NODE, ABILITIES_DEF, ABILITY_BY_ID, LEGACY_ABILITY, RADIANCE_MAX, radianceCost, radianceProps,
  radiancePowerMult, radianceCdMult, SOUL_BRANCH, ITEM_BY_ID, MONSTER_LOOT, RUN_SKILLS, RUN_SKILL_BY_ID, RUN_SKILL_DROP_PCT, LOOKS, RECIPES, RESOURCES, SLOTS, salvageYield, WEAPON_TYPES, ITEMS, OWN_GEAR, lootMobLvl, partOf, ZONE_MOBS,
} from "./defs";
import { QUESTS, QUEST_BY_ID, questType, type QuestDef } from "./quests";
import { grantSpec, chestRoomErr } from "./boardChest";
import { BCHEST, effSpec, bcSpecCount, type BcSpec } from "./boardChestCfg";
import { condFail } from "./questConds";
import { goalMatch } from "./biomes";

export const SCHEMA_VERSION = 1;

// uid — instance_id (crypto.randomUUID() сервера), at — когда получен, src — источник, n — «новое» (ещё не просмотрено)
export interface InvItem { uid: string; id: string; at?: number; src?: string; n?: number; hero?: string | null; rs?: string; cursed?: 1; ench?: number; lk?: 1; up?: number; blk?: number } // blk — очернение 0…100 % (Чёрный маг, только сервер) // hero — владелец-герой (у каждого героя своя сумка)
export interface Disc { items: Record<string, { st: "seen" | "owned"; at: number; src: string; v: number }>; feats: Record<string, { at: number; v: number }> }
export interface Account {
  v: number; inv: InvItem[]; res: Record<string, number>; stars: Record<string, number>;
  starsBy: Record<string, Record<string, number>>; creation: number; soul: string[];
  quests: { active: Record<string, { p: number[] }>; done: string[]; untracked?: string[]; rep?: Record<string, string>; br?: Record<string, string> };
  mobTrack?: string | null; // «Отслеживать» из Бестиария (одна цель, сохраняется на сервере)
  mobTracks?: string[]; // несколько целей Бестиария (лимит — BOARD_CFG.trackMax); mobTrack = первая (совместимость)
  bestiary: Record<string, { seen: number; kills: number; at?: number; v?: number }>; disc: Disc;
  /** Бестиарий: особые особи вида (bestiaryVar.ts) — { вид: { c|e1…e6: [встречен, побед, ОЗ] } }; в accounts.data */
  bvar?: Record<string, Record<string, [number, number, number]>>; flags: Record<string, boolean>; hero: string | null; nextUid: number;
  runSkills?: string[]; // кодекс: открытые (хоть раз выпавшие) навыки «Вампир-лайка»
  gname?: string; // имя гостевого профиля (guestNames.ts), назначает сервер
}
export interface Hero {
  lvl: number; xp: number; talents: Record<string, number>; abil: Record<string, { rad: number; silenced?: boolean }>;
  loadout: string[]; equip: Record<string, string>; // слот → uid предмета из общей сумки
  tv?: number; // версия дерева талантов (heroes.talent_ver)
  md?: number; mdAt?: number; mdW?: string; // рекорд одиночного удара в открытом мире (heroes.max_dmg / max_dmg_at / max_dmg_where; только сервер)
  portal?: { x?: number; y?: number; at?: number; cd?: number }; // личный портал домой (heroes.home_portal)
  refunded?: number; // не хранится: сколько очков вернули при загрузке (уведомление игроку)
}

export function newAccount(): Account {
  return { v: 1, inv: [], res: {}, stars: { yellow: 0, red: 0, purple: 0, black: 0 }, starsBy: {}, creation: 0, soul: [],
    quests: { active: { p1_swarm: { p: [0] } }, done: [] }, bestiary: {}, disc: { items: {}, feats: {} }, flags: {}, hero: null, nextUid: 1 };
}
export function newHero(cls: string): Hero {
  const legacy = LEGACY_ABILITY[cls];
  return { lvl: 1, xp: 0, talents: {}, abil: legacy ? { [legacy]: { rad: 0 } } : {}, loadout: legacy ? [legacy] : [], equip: {}, tv: TALENT_VERSION };
}

// ---------------- вычисления ----------------
export function talentSpent(h: Hero): number { return Object.values(h.talents).reduce((a, b) => a + b, 0); }
export function talentPoints(h: Hero): number { return talentPointsForLevel(h.lvl) - talentSpent(h); }

export function itemReq(def: { lvl?: number; req?: number }): number { return Math.max(1, def.req || 1, def.lvl || 1); }

export function equippedItems(a: Account, h: Hero): { slot: string; uid: string; id: string; cursed?: 1; ench?: number; up?: number; blk?: number }[] {
  const out: { slot: string; uid: string; id: string; cursed?: 1; ench?: number; up?: number; blk?: number }[] = [];
  for (const [slot, uid] of Object.entries(h.equip)) {
    const it = a.inv.find((i) => i.uid === uid);
    const def = it && ITEM_BY_ID[it.id];
    if (def && h.lvl >= itemReq(def)) out.push({ slot, uid, id: it.id, ...(it.cursed ? { cursed: 1 as const } : {}), ...(tierOk(it.ench) ? { ench: it.ench } : {}), ...(it.up ? { up: it.up } : {}), ...(it.blk ? { blk: it.blk } : {}) }); // надетое не по уровню (старые сохранения) не действует
  }
  return out;
}

/** снять N % очернения с надетых вещей героя (награда квеста). Возвращает, сколько вещей очищено. */
export function repairBlackened(a: Account, h: Hero, pct: number): number {
  const p = Math.max(0, Math.min(100, Number(pct) || 0)); let n = 0;
  if (!p) return 0;
  for (const uid of Object.values(h.equip || {})) { const it = a.inv.find((i) => i.uid === uid); if (it && (it.blk || 0) > 0) { const v = Math.max(0, Math.round(((it.blk || 0) - p) * 10) / 10); if (v > 0) it.blk = v; else delete it.blk; n++; } }
  return n;
}
/** очернить надетые вещи героя на +add % (смерть от мага — число его попаданий; взрыв — explBlk). Возвращает число вещей. */
export function blackenEquipped(a: Account, h: Hero, add: number): number {
  const p = Math.max(0, Number(add) || 0); let n = 0;
  if (!p) return 0;
  for (const uid of Object.values(h.equip || {})) { const it = a.inv.find((i) => i.uid === uid); if (it && ITEM_BY_ID[it.id]) { it.blk = Math.min(100, Math.round(((it.blk || 0) + p) * 10) / 10); n++; } }
  return n;
}
export function activeLook(a: Account, h: Hero): string | null {
  const ids = new Set(equippedItems(a, h).map((e) => partOf(e.id))); // копия трофея варианта биома — та же часть комплекта
  for (const look of Object.values(LOOKS)) if (look.parts.every((p) => ids.has(p))) return look.id;
  return null;
}

// Итоговые статы героя — то, что ОДНОСТОРОННЕ передаётся в забег/мини-игру/открытый мир.
/** режим посоха (флаг аккаунта bmm:<uid> — ближний; нет — дальний по умолчанию). Только для основного лезвия-посоха. */
export const artModeKey = (uid: any) => `bmm:${uid}`;
function artEff(a: Account, e: { id: string; uid: any }, art: any) {
  const melee = !!art.staff && !!a.flags?.[artModeKey(e.uid)];
  const atk = artModeAtk(art, melee);
  return { id: e.id, uid: e.uid, parts: art.parts, atk, cd: art.cd, skills: art.skills, ranged: atk.kind === "proj", elem: art.elem,
    ...(art.staff ? { staff: true, mode: melee ? "melee" : "ranged" } : {}), shots: atk.kind === "proj" ? Math.max(1, atk.count || 1) : 1,
    ...(atk.kind === "proj" && art.shot ? { shot: art.shot } : {}) }; // этап 2: тип снаряда дальнего лезвия
}
export function heroEffective(a: Account, h: Hero, cls: string, base: { maxHp: number; armor: number; minAtk: number; maxAtk: number }, opt?: { dark?: boolean }) {
  const dark = !!opt?.dark; // проклятая земля Чёрного мага: у вещей работают только очернённые статы (игроку не сообщается)
  const raw: Record<string, number> = { hp: 0, armor: 0, dmgPct: 0, speedPct: 0, regen: 0, magnetPct: 0, cdrPct: 0, critPct: 0, lifestealPct: 0, atkSpeedPct: 0, revive: 0, armorPen: 0, armorPenPct: 0 };
  if (!(dark && BM_CFG.groundTalentsOff)) for (const [id, r] of Object.entries(h.talents)) {
    const t = TALENT_BY_ID[id];
    if (t) for (const [k, v] of Object.entries(t.per)) raw[k] += (v || 0) * r;
  }
  if (!(dark && BM_CFG.groundTalentsOff)) for (const id of a.soul) { const n = SOUL_BRANCH.find((s) => s.id === id); if (n) for (const [k, v] of Object.entries(n.per)) raw[k] += v || 0; }
  let wMin = 0, wMax = 0, weaponId: string | null = null;
  const all = equippedItems(a, h);
  // артефакт чёрной магии в руке (ответ 1): действуют только душа, таланты и база класса/уровня; ВСЁ снаряжение и комплекты заглушены
  const artE = BMA_CFG.on ? all.find((e) => ITEM_BY_ID[e.id]?.slot === "weapon" && (ITEM_BY_ID[e.id] as any).bm) : undefined;
  const art = artE ? artInfo(artE.id) : null;
  const items = art ? [] : all;
  if (art) weaponId = artE!.id;
  for (const e of items) {
    const st: any = instStats(ITEM_BY_ID[e.id], e, dark); // проклятый экземпляр: статы базы ×1.5 на лету; очернение — bmCfg
    if (ITEM_BY_ID[e.id].slot === "weapon") weaponId = e.id;
    wMin += st.dmgMin || 0; wMax += st.dmgMax || 0;
    for (const k of ["armor", "hp", "speedPct", "critPct", "regen", "cdrPct", "magnetPct", "lifestealPct", "atkSpeedPct", "armorPen", "armorPenPct"]) raw[k] += (st as any)[k] || 0;
  }
  // полный комплект моба: облик + бонус комплекта (bestiary.ts → look.stat)
  const look = art ? null : activeLook(a, h);
  const lookStat = look && !dark ? LOOKS[look]?.stat : null; // на проклятой земле бонус комплекта — обычный стат, не действует
  if (lookStat) for (const [k, v] of Object.entries(lookStat)) raw[k] = (raw[k] || 0) + (v || 0);
  // капы и убывающая отдача (см. docs/MORRISCURSE-BALANCE.md)
  const eff = {
    maxHp: Math.round(base.maxHp + heroLevelHp(h.lvl) + raw.hp),
    armor: Math.round(base.armor + raw.armor),
    damageReduction: 0,
    dmgPct: Math.round(softCap(raw.dmgPct, STAT_CAPS.dmgPct) * 10) / 10,
    speedPct: Math.round(Math.max(-20, softCap(raw.speedPct, STAT_CAPS.speedPct)) * 10) / 10,
    regen: Math.round(softCap(raw.regen, STAT_CAPS.regen) * 100) / 100,
    magnetPct: Math.round(softCap(raw.magnetPct, STAT_CAPS.magnetPct)),
    cdrPct: Math.round(softCap(raw.cdrPct, STAT_CAPS.cdrPct) * 10) / 10,
    critPct: Math.round(softCap(raw.critPct, STAT_CAPS.critPct) * 10) / 10,
    lifestealPct: Math.round(softCap(raw.lifestealPct, STAT_CAPS.lifestealPct) * 10) / 10,
    atkSpeedPct: Math.round(softCap(raw.atkSpeedPct, STAT_CAPS.atkSpeedPct) * 10) / 10,
    armorPen: Math.round(softCap(raw.armorPen, STAT_CAPS.armorPen)),
    armorPenPct: Math.round(softCap(raw.armorPenPct, STAT_CAPS.armorPenPct) * 10) / 10,
    revive: raw.revive > 0 ? 1 : 0,
    weaponMin: base.minAtk + wMin, weaponMax: base.maxAtk + wMax, itemDmgMin: wMin, itemDmgMax: wMax,
    look, weaponId, wtype: art ? "artifact" : weaponType(weaponId, cls),
    bm: art ? art.stats : null, art: art ? artEff(a, artE!, art) : null,
    cursedGlow: glowLevel(items.filter((e) => e.cursed).length), weaponCursed: items.some((e) => e.cursed && e.slot === "weapon") ? 1 : 0,
    blkAvg: charBlk(items), blkVis: charBlkVis(items), // очернение героя: % по надетому (режим админки) и сила затемнения 0…100 (видно всем)
  };
  eff.damageReduction = Math.round(armorToReduction(eff.armor) * 1000) / 1000;
  const mods = talentMods(h, cls);
  // раскладка позиционная (Q, G, F; "" — пустой слот): у навыка есть slot — его клавиша на панели
  const abilities = h.loadout.map((id, slot) => ({ id, slot })).filter((x) => x.id && x.slot < abilitySlots(h.lvl) && usableAbility(a, h, cls, x.id)).map(({ id, slot }) => {
    const rad = h.abil[id]?.rad || 0;
    const def = ABILITY_BY_ID[id];
    const m = mods[id] || { props: [], powerPct: 0, cdPct: 0 };
    return {
      id, rad, slot,
      power: Math.round(def.power * radiancePowerMult(rad) * (1 + m.powerPct / 100) * 100) / 100,
      cd: Math.round(def.cd * radianceCdMult(rad) * (1 - eff.cdrPct / 100) * Math.max(0.4, 1 + m.cdPct / 100) * 100) / 100,
      props: [...radianceProps(id, rad), ...m.props],
    };
  });
  return { ...eff, abilities, level: h.lvl };
}

// Навык доступен герою: свой класс (по уровню, не заглушён) или навык монстра от надетого трофея
export function monsterAbilities(a: Account, h: Hero): string[] {
  if (artInHand(a, h)) return []; // артефакт в руке: трофеи заглушены вместе со снаряжением
  return equippedItems(a, h).map((e) => ITEM_BY_ID[e.id].grantsAbility).filter(Boolean) as string[];
}
/** навыки частей надетого артефакта (пусто — артефакт не надет / выключен) */
export function artifactAbilities(a: Account, h: Hero): string[] {
  if (!BMA_CFG.on) return [];
  const e = equippedItems(a, h).find((x) => (ITEM_BY_ID[x.id] as any)?.bm);
  return (e && artInfo(e.id)?.skills.filter(isBmSkill)) || [];
}
export function usableAbility(a: Account, h: Hero, cls: string, id: string): boolean {
  const def = ABILITY_BY_ID[id];
  if (!def) return false;
  if (h.abil[id]?.silenced) return false;
  if (def.cls === "monster") return monsterAbilities(a, h).includes(id);
  if ((def.cls as string) === "artifact") return artifactAbilities(a, h).includes(id); // ответ 2: навыки надетого артефакта — в любые слоты
  return def.cls === cls && abilityUnlocked(h, cls, id);
}
// Навык класса открыт: стартовый (legacy) — всегда; остальные — узлом дерева талантов (очками), не уровнем.
export function abilityUnlocked(h: Hero, cls: string, id: string): boolean {
  const def = ABILITY_BY_ID[id];
  if (!def || def.cls !== cls) return false;
  if (def.legacy) return true;
  const node = ACTIVE_NODE[id];
  return !!node && (h.talents[node] || 0) > 0;
}
export function unlockedAbilities(h: Hero, cls: string): string[] {
  return ABILITIES_DEF.filter((d) => d.cls === cls && abilityUnlocked(h, cls, d.id)).map((d) => d.id);
}
// Модификаторы навыков от узлов дерева (mod/keystone): свойства t_* и ±% силы/перезарядки
export function talentMods(h: Hero, cls: string): Record<string, { props: string[]; powerPct: number; cdPct: number }> {
  const out: Record<string, { props: string[]; powerPct: number; cdPct: number }> = {};
  for (const [id, r] of Object.entries(h.talents)) {
    const t = TALENT_BY_ID[id];
    if (!t || !r || !t.mod || !id.startsWith(cls + ".")) continue;
    const o = (out[t.mod.ability] = out[t.mod.ability] || { props: [], powerPct: 0, cdPct: 0 });
    if (t.mod.prop && !o.props.includes(t.mod.prop)) o.props.push(t.mod.prop);
    o.powerPct += t.mod.powerPct || 0; o.cdPct += t.mod.cdPct || 0;
  }
  return out;
}

// ---------------- операции (все проверки здесь) ----------------
type R = { ok: true; msg?: string } | { ok: false; err: string };
const fail = (err: string): R => ({ ok: false, err });

export function gainXp(h: Hero, xp: number): number {
  let ups = 0;
  if (h.lvl >= HERO_MAX_LEVEL) return 0;
  h.xp += Math.max(0, Math.floor(xp));
  while (h.lvl < HERO_MAX_LEVEL && h.xp >= heroXpNeed(h.lvl)) { h.xp -= heroXpNeed(h.lvl); h.lvl++; ups++; }
  if (h.lvl >= HERO_MAX_LEVEL) h.xp = 0;
  // навыки класса открываются по уровню
  return ups;
}

export function learnTalent(a: Account, h: Hero, cls: string, id: string): R {
  if (!a.flags.talents_open) return fail("Дерево талантов откроет Алзи (кампания «Держать мир»)");
  if (typeof id !== "string") return fail("Плохой запрос");
  const t = TALENT_BY_ID[id];
  if (!t || !id.startsWith(cls + ".")) return fail("Талант недоступен этому герою");
  const cur = h.talents[id] || 0;
  if (cur >= t.max) return fail("Максимальный ранг");
  if (talentPoints(h) <= 0) return fail("Нет очков талантов (даются за уровни героя)");
  if (talentSpent(h) < (TALENT_TIER_REQ[t.tier] ?? Infinity)) return fail(`Ярус ${t.tier}: нужно вложить ${TALENT_TIER_REQ[t.tier]} очков в дерево`);
  for (const r of t.req || []) if (!(h.talents[r] > 0)) return fail(`Сначала изучите «${TALENT_BY_ID[r]?.name || r}»`);
  if (t.excl && (h.talents[t.excl] || 0) > 0) return fail(`Ключевой выбор: уже выбран «${TALENT_BY_ID[t.excl]?.name}» (только один из двух)`);
  h.talents[id] = cur + 1;
  if (t.grants && !h.abil[t.grants]) h.abil[t.grants] = { rad: 0 };
  // открытый навык сразу встаёт в свободный слот раскладки
  if (t.grants && !h.loadout.includes(t.grants)) { const hole = h.loadout.indexOf(""); if (hole >= 0 && hole < abilitySlots(h.lvl)) h.loadout[hole] = t.grants; else if (h.loadout.length < abilitySlots(h.lvl)) h.loadout.push(t.grants); }
  return { ok: true, msg: t.grants ? `Навык открыт: ${ABILITY_BY_ID[t.grants]?.name}` : undefined };
}

// Проверка сохранённого дерева (загрузка из D1 / переход со старого общего дерева).
// Неизвестные узлы, превышение рангов/очков, нарушенные ярусы/пререквизиты, оба узла ключевого выбора → полный сброс
// с возвратом очков (очки = уровень − 1 − вложенное, поэтому сброс = возврат). Раскладка очищается от закрытых навыков.
// Возвращает число возвращённых очков (0 — дерево корректно).
export function sanitizeTalents(h: Hero, cls: string, ver: number): number {
  const spent = talentSpent(h);
  let bad = ver < TALENT_VERSION;
  if (!bad) {
    const order = Object.entries(h.talents);
    if (spent > talentPointsForLevel(h.lvl)) bad = true;
    for (const [id, r] of order) {
      const t = TALENT_BY_ID[id];
      if (!t || !id.startsWith(cls + ".") || !Number.isInteger(r) || r < 0 || r > t.max) { bad = true; break; }
      if ((t.req || []).some((q) => !(h.talents[q] > 0))) { bad = true; break; }
      if (t.excl && h.talents[t.excl] > 0 && r > 0) { bad = true; break; }
      // ярус: без учёта узлов этого и более высоких ярусов должно хватать вложенного
      const below = order.reduce((acc, [j, rr]) => acc + ((TALENT_BY_ID[j]?.tier || 99) < t.tier ? rr : 0), 0);
      if (r > 0 && below < TALENT_TIER_REQ[t.tier]) { bad = true; break; }
    }
  }
  if (!bad) { h.loadout = h.loadout.map((x) => (x && (ABILITY_BY_ID[x]?.cls === "monster" || abilityUnlocked(h, cls, x)) ? x : "")); return 0; }
  h.talents = {};
  h.loadout = h.loadout.map((x) => (x && (ABILITY_BY_ID[x]?.cls === "monster" || abilityUnlocked(h, cls, x)) ? x : ""));
  const legacy = LEGACY_ABILITY[cls];
  if (legacy && !h.loadout.some(Boolean)) h.loadout = [legacy];
  return spent;
}

export function setLoadout(a: Account, h: Hero, cls: string, ids: unknown): R {
  if (!Array.isArray(ids)) return fail("Плохая раскладка");
  // позиционно: [Q, G, F], "" — пустой слот; навык не может стоять в двух слотах
  const pos = ids.map((x) => (x == null ? "" : String(x)));
  while (pos.length && !pos[pos.length - 1]) pos.pop();
  const uniq = pos.filter(Boolean);
  if (uniq.length < 1) return fail("Нужен хотя бы один навык");
  if (new Set(uniq).size !== uniq.length) return fail("Навык уже стоит в другом слоте");
  if (pos.length > abilitySlots(h.lvl)) return fail(`Слотов навыков: ${abilitySlots(h.lvl)} (3-й, F — с 5 уровня)`);
  for (const id of uniq) if (!usableAbility(a, h, cls, id)) return fail(`Навык недоступен: ${ABILITY_BY_ID[id]?.name || id}`);
  h.loadout = pos;
  for (const id of uniq) if (!h.abil[id]) h.abil[id] = { rad: 0 };
  return { ok: true };
}

export function upgradeRadiance(a: Account, h: Hero, cls: string, id: string): R {
  if (!a.flags.radiance_open) return fail("Сиянию научит Лэйр (кампания «Чувствовать»)");
  if (!usableAbility(a, h, cls, id)) return fail("Навык недоступен");
  const st = h.abil[id] || (h.abil[id] = { rad: 0 });
  if (st.rad >= RADIANCE_MAX) return fail("Сияние на максимуме (фиолетовое 3)");
  const c = radianceCost(st.rad + 1);
  if ((a.stars[c.color] || 0) < c.stars) return fail(`Нужно звёзд: ${c.stars} (${c.color})`);
  a.stars[c.color] -= c.stars;
  st.rad++;
  return { ok: true };
}

// Заглушить навык чёрной звездой: навсегда (для этого героя), +1 очко Создания. Выбор, а не обязанность.
export function silenceAbility(a: Account, h: Hero, cls: string, id: string, confirm: unknown): R {
  if (confirm !== "ЗАГЛУШИТЬ") return fail("Нужно подтверждение");
  const def = ABILITY_BY_ID[id];
  if (!def || def.cls !== cls) return fail("Можно заглушить только навык класса");
  if (!abilityUnlocked(h, cls, id)) return fail("Навык ещё не открыт в дереве талантов");
  if (h.abil[id]?.silenced) return fail("Уже заглушён");
  if ((a.stars.black || 0) < 1) return fail("Нужна чёрная звезда");
  a.stars.black -= 1;
  h.abil[id] = { rad: 0, silenced: true };
  h.loadout = h.loadout.filter((x) => x !== id);
  a.creation += 1;
  return { ok: true, msg: "Сияние погасло навсегда. Получено 1 очко Создания." };
}

export function buySoulNode(a: Account, id: string): R {
  const n = SOUL_BRANCH.find((s) => s.id === id);
  if (!n) return fail("Нет такого узла");
  if (a.soul.includes(id)) return fail("Уже открыто");
  if (n.req && !a.soul.includes(n.req)) return fail("Ветка закрыта");
  if (a.creation < n.cost) return fail("Не хватает очков Создания (только заглушая навыки)");
  a.creation -= n.cost;
  a.soul.push(id);
  return { ok: true };
}

// Криптостойкий ГСЧ для бросков добычи (Math.random предсказуем)
const RBUF = new Uint32Array(64); let rpos = 64;
export function cryptoRand(): number {
  if (rpos >= RBUF.length) { (globalThis.crypto as any).getRandomValues(RBUF); rpos = 0; }
  return RBUF[rpos++] / 4294967296;
}
export const newUid = (): string => (globalThis.crypto as any).randomUUID();

// Выдача экземпляра предмета — ТОЛЬКО сервером: id из пула, новый instance_id, источник, отметка открытия
export function addItem(a: Account, id: string, src = "?", hero: string | null = a.hero, cursed = false, ench = 0): InvItem | null {
  { const t = parseTag(id); id = t.id; if (t.c) cursed = true; if (t.e) ench = t.e; } // пометки броска "@c" / "@eN" — только сервер
  if (!tierOk(ench) || !ITEM_BY_ID[id]?.slot) ench = 0; // ярус — только у экипировки, 1…6
  if (!ITEM_BY_ID[id]) return null;
  if (a.inv.filter((i) => (i.hero || null) === (hero || null)).length >= 120) return null; // сумка героя ограничена
  const it: InvItem = { uid: newUid(), id, at: Date.now(), src, n: 1, hero: hero || null, ...(cursed ? { cursed: 1 as const } : {}), ...(ench ? { ench } : {}) };
  a.inv.push(it);
  noteItem(a, id, src, true);
  const def = ITEM_BY_ID[id];
  for (const k of Object.keys(def.stats || {})) noteFeature(a, `prop:${k}`);
  if (def.grantsAbility) noteFeature(a, `ability:${def.grantsAbility}`);
  return it;
}
export function noteItem(a: Account, id: string, src: string, owned: boolean) {
  if (!ITEM_BY_ID[id]) return;
  a.disc = a.disc || { items: {}, feats: {} };
  const d = a.disc.items[id];
  if (!d) a.disc.items[id] = { st: owned ? "owned" : "seen", at: Date.now(), src, v: 0 };
  else if (owned && d.st !== "owned") { d.st = "owned"; d.v = 0; }
}
export function noteFeature(a: Account, f: string) {
  a.disc = a.disc || { items: {}, feats: {} };
  if (!a.disc.feats[f]) a.disc.feats[f] = { at: Date.now(), v: 0 };
}
export function noteMob(a: Account, mob: string, kills = 0) {
  const b = a.bestiary[mob];
  if (!b) a.bestiary[mob] = { seen: 1, kills, at: Date.now(), v: 0 };
  else b.kills = (b.kills || 0) + kills;
}
export function fixAccount(a: Account): Account {
  a.disc = a.disc || { items: {}, feats: {} };
  a.disc.items = a.disc.items || {}; a.disc.feats = a.disc.feats || {};
  a.inv = (a.inv || []).filter((i) => ITEM_BY_ID[i.id]);
  a.runSkills = Array.isArray(a.runSkills) ? a.runSkills.filter((id) => RUN_SKILL_BY_ID[id]) : [];
  delete (a as any).runSkillSel; // старый выбор из пула (задача 8 v1) больше не используется
  return a;
}
// Бросок «оружие несёт навык забега»: только оружие, ГСЧ сервера. Навык записывается НА ЭКЗЕМПЛЯР предмета
// (item_instances.run_skill), в кодекс аккаунта — как открытие. Дубли навыков на разном оружии возможны.
export function rollRunSkill(a: Account, it: InvItem, kind: "mob" | "rare" | "boss", rnd = cryptoRand): string | null {
  if (!it || it.rs || ITEM_BY_ID[it.id]?.slot !== "weapon") return null;
  if (rnd() * 100 >= RUN_SKILL_DROP_PCT[kind]) return null;
  const pick = RUN_SKILLS[Math.floor(rnd() * RUN_SKILLS.length)].id;
  it.rs = pick;
  if (!(a.runSkills = a.runSkills || []).includes(pick)) { a.runSkills.push(pick); noteFeature(a, `runskill:${pick}`); }
  return pick;
}
// Навык 4-го слота (R): от надетого сейчас оружия героя; сняли оружие — навыка нет
/** Действующий навык R экземпляра оружия и откуда он: правка предмета в админке > правка типа оружия > выпавший. */
export function effSkill(inst: { id: string; rs?: string | null }): { rs: string; src: "item" | "type" | "drop" } | null {
  const d: any = (ITEM_BY_ID as any)[inst.id]; if (!d || d.slot !== "weapon") return null;
  if (d.rs && isRs(d.rs)) return { rs: d.rs, src: "item" };
  const t = (WEAPON_TYPES as any)[weaponType(inst.id, null)]?.rs; if (t && isRs(t)) return { rs: t, src: "type" };
  return inst.rs && RUN_SKILL_BY_ID[inst.rs] ? { rs: inst.rs, src: "drop" } : null;
}
/** Кодекс «закреплён за»: все виды оружия с этим действующим навыком; открытые в Библиотеке — по имени, закрытые — счётчиком. */
export function codexBound(a: Account, eqUids: Set<string>) {
    const bound: Record<string, { name: string; eq: boolean; src: string }[]> = {}, hidden: Record<string, number> = {};
    for (const d of ITEMS as any[]) { if (d.slot !== "weapon") continue;
      const fixed = effSkill({ id: d.id, rs: null }), disc = !!a.disc.items[d.id];
      const mine = a.inv.filter((i) => i.id === d.id);
      const pairs = fixed ? [{ rs: fixed.rs, src: fixed.src, eq: mine.some((i) => eqUids.has(i.uid)) }]
        : [...new Set(mine.map((i) => i.rs).filter((r) => r && RUN_SKILL_BY_ID[r!]))].map((rs) => ({ rs: rs!, src: "drop", eq: mine.some((i) => i.rs === rs && eqUids.has(i.uid)) }));
      for (const q of pairs) { const k = rsCodexId(q.rs);
        if (!disc) { hidden[k] = (hidden[k] || 0) + 1; continue; }
        (bound[k] = bound[k] || []).push({ name: d.name, eq: q.eq, src: q.src }); }
    }
  return { bound, hidden };
}
export function weaponSkill(a: Account, h: Hero | null): string | null {
  const uid = h?.equip?.weapon; if (!uid) return null;
  const inst = a.inv.find((i) => i.uid === uid); if (!inst) return null;
  // навык из админки важнее выпавшего у экземпляра: сначала у предмета, затем у типа оружия
  const adm = (ITEM_BY_ID as any)[inst.id]?.rs || (WEAPON_TYPES as any)[weaponType(inst.id, null)]?.rs;
  const rs = adm && isRs(adm) ? adm : inst.rs;
  return rs && isRs(rs) ? rs : null;
}
/** Надетое оружие проклято → навык R ×2. */
export function weaponCursed(a: Account, h: Hero | null): boolean {
  const uid = h?.equip?.weapon; if (!uid) return false;
  return !!a.inv.find((i) => i.uid === uid)?.cursed;
}
/** Сколько надето проклятых (действующих) вещей и уровень свечения (0..3) — для синхронизации другим игрокам. */
export function cursedGlow(a: Account, h: Hero | null): { n: number; glow: number } {
  if (!h) return { n: 0, glow: 0 };
  const eq = equippedItems(a, h); const n = eq.filter((e) => e.cursed).length;
  return { n, glow: glowLevel(n) };
}
// Снять отметку «новое» (сообщение mark_seen): только свои экземпляры/открытия, пачкой
export function markSeen(a: Account, m: { inv?: string[]; items?: string[]; mobs?: string[]; feats?: string[] }): number {
  let n = 0;
  const lim = (x: any) => (Array.isArray(x) ? x.slice(0, 200).filter((v) => typeof v === "string" && v.length <= 64) : []);
  const inv = new Set(lim(m.inv));
  for (const it of a.inv) if (inv.has(it.uid) && it.n) { it.n = 0; n++; }
  for (const id of lim(m.items)) { const d = a.disc.items[id]; if (d && !d.v) { d.v = 1; n++; } }
  for (const id of lim(m.mobs)) { const b = a.bestiary[id]; if (b && !b.v) { b.v = 1; n++; } }
  for (const f of lim(m.feats)) { const d = a.disc.feats[f]; if (d && !d.v) { d.v = 1; n++; } }
  return n;
}
export function addRes(a: Account, res: string, n: number) {
  if (!RESOURCES[res] || n <= 0) return;
  a.res[res] = Math.min(9999, (a.res[res] || 0) + Math.floor(n));
}

/** настройки артефактов для клиента (вкладка «Артефакты», заряд, лимит) */
export function bmaClient(a: Account) {
  return { on: BMA_CFG.on, chargeMoveMul: BMA_CFG.chargeMoveMul, holdMaxSec: BMA_CFG.holdMaxSec, critMul: BMA_CFG.critMul, bagSize: BMA_CFG.bagSize,
    classMul: BMA_CFG.classMul, maxArtifacts: BMA_CFG.maxArtifacts, have: a.inv.filter((i) => isArtifactId(i.id)).length, parts: (a as any).bmParts || {} };
}
/** в слоте оружия — артефакт чёрной магии */
export function artInHand(a: Account, h: Hero): boolean {
  const u = h.equip.weapon; if (!u) return false;
  const it = a.inv.find((i) => i.uid === u); return !!(it && (ITEM_BY_ID[it.id] as any)?.bm);
}
export function equip(a: Account, h: Hero, cls: string, uid: string): R {
  const it = a.inv.find((i) => i.uid === uid);
  if (!it) return fail("Нет такого предмета");
  // у каждого героя своя сумка: чужой предмет не надеть (и один экземпляр — не на двух героях: иначе D1 отвергает выгрузку)
  if (it.hero && it.hero !== cls) return fail("Это предмет другого героя");
  if (!it.hero) it.hero = cls;
  const def = ITEM_BY_ID[it.id];
  if (!SLOTS[def.slot]) return fail("Неизвестный слот");
  // Классовых ограничений экипа нет: любой герой носит любой предмет (гибриды ок).
  const req = itemReq(def);
  if (h.lvl < req) return fail(`Нужен ${req} уровень героя (у героя ${h.lvl})`);
  if (def.slot !== "weapon" && artInHand(a, h)) return fail("В руке артефакт: остальные слоты заблокированы (снимите артефакт)");
  h.equip[def.slot] = uid;
  return { ok: true };
}
export function unequip(h: Hero, slot: string, a?: Account): R {
  if (!h.equip[slot]) return fail("Слот пуст");
  if (a && slot !== "weapon" && artInHand(a, h)) return fail("В руке артефакт: остальные слоты заблокированы (снимите артефакт)");
  delete h.equip[slot];
  return { ok: true };
}
/** Закрепить/открепить экземпляр: закреплённый не разбирается ни поштучно, ни пачкой (проверяет сервер). */
export function setLock(a: Account, cls: string | null, uid: string, on: boolean): R & { uid?: string; lk?: boolean } {
  const it = a.inv.find((i) => i.uid === uid);
  if (!it) return fail("Нет предмета");
  if (it.hero && it.hero !== cls) return fail("Это предмет другого героя");
  if (on) it.lk = 1; else delete it.lk;
  return { ok: true, msg: on ? "Закреплено" : "Откреплено", uid, lk: on };
}
/** Улучшение у Петра: +1 уровень, всегда успешно; материалы списываются атомарно (сначала проверка всех, потом списание). */
export function upgradeItem(a: Account, cls: string | null, uid: string, expect?: number): R & { uid?: string; up?: number; cost?: Record<string, number> } {
  const it = a.inv.find((i) => i.uid === uid);
  if (!it || !ITEM_BY_ID[it.id]) return fail("Нет предмета");
  if (it.hero && it.hero !== cls) return fail("Это предмет другого героя");
  const cur = it.up || 0;
  if (expect != null && expect !== cur) return fail("Уровень предмета уже изменился — обновите окно");
  if (cur >= UPG.maxLvl) return fail(`Предмет уже улучшен до максимума (+${UPG.maxLvl})`);
  const cost = upgCost(cur + 1, !!it.cursed, undefined, tierOk(it.ench) ? it.ench : 0);
  if (!cost) return fail("Улучшение недоступно");
  const miss = Object.entries(cost).filter(([r, n]) => (a.res[r] || 0) < n);
  if (miss.length) return fail("Не хватает: " + miss.map(([r, n]) => `${RESOURCES[r]?.name || r} ${a.res[r] || 0}/${n}`).join(", "));
  for (const [r, n] of Object.entries(cost)) a.res[r] = (a.res[r] || 0) - n;
  for (const r of Object.keys(cost)) if (a.res[r] <= 0) delete a.res[r];
  it.up = cur + 1;
  return { ok: true, msg: `Улучшено до +${it.up}`, uid, up: it.up, cost };
}
export function salvage(a: Account, heroes: Hero[], uid: string): R {
  const idx = a.inv.findIndex((i) => i.uid === uid);
  if (idx < 0) return fail("Нет предмета");
  if (heroes.some((h) => Object.values(h.equip).includes(uid))) return fail("Сначала снимите предмет");
  if (a.inv[idx].lk) return fail("Предмет закреплён — сначала открепите");
  const got = salvageYield(a.inv[idx].id);
  a.inv.splice(idx, 1);
  for (const [r, n] of Object.entries(got)) addRes(a, r, n);
  return { ok: true, msg: yieldText(got) || "Разобрано", got } as any;
}
const yieldText = (g: Record<string, number>) => Object.entries(g).map(([r, n]) => `+${n} ${RESOURCES[r]?.name || r}`).join(", ");
/** Какие экземпляры можно разобрать «пачкой по редкости»: не надеты, свои/общие для героя cls, ровно этой редкости. */
export function salvageCandidates(a: Account, heroes: Hero[], cls: string | null, rarity: string): InvItem[] {
  const worn = new Set(heroes.flatMap((h) => Object.values(h.equip || {})));
  return a.inv.filter((i) => ITEM_BY_ID[i.id]?.rarity === rarity && !i.lk && !worn.has(i.uid) && (!i.hero || i.hero === cls));
}
/** Превью массового разбора — считает сервер: ровно сумма одиночных разборов. */
export function salvagePreview(a: Account, heroes: Hero[], cls: string | null, rarity: string) {
  const list = salvageCandidates(a, heroes, cls, rarity), res: Record<string, number> = {};
  for (const i of list) for (const [r, n] of Object.entries(salvageYield(i.id))) res[r] = (res[r] || 0) + n;
  return { rarity, uids: list.map((i) => i.uid), items: list.map((i) => ({ uid: i.uid, id: i.id, name: ITEM_BY_ID[i.id]?.name || i.id })), res };
}
/** Массовый разбор: разбираем только подтверждённые uid, которые всё ещё подходят (никаких сюрпризов после превью). */
export function salvageMany(a: Account, heroes: Hero[], cls: string | null, rarity: string, uids: string[]): R & { got?: Record<string, number>; n?: number; uids?: string[] } {
  const ok = new Set(salvageCandidates(a, heroes, cls, rarity).map((i) => i.uid));
  const pick = [...new Set(uids)].filter((u) => ok.has(u));
  if (!pick.length) return fail("Нечего разбирать");
  const got: Record<string, number> = {};
  for (const u of pick) { const r: any = salvage(a, heroes, u); if (r.ok) for (const [k, n] of Object.entries(r.got || {})) got[k] = (got[k] || 0) + (n as number); }
  return { ok: true, msg: `Разобрано ${pick.length}: ${yieldText(got) || "ничего"}`, got, n: pick.length, uids: pick };
}
export function craft(a: Account, rid: string): R & { item?: InvItem } {
  const r = RECIPES.find((x) => x.id === rid);
  if (!r) return fail("Нет рецепта");
  for (const [res, n] of Object.entries(r.cost)) if ((a.res[res] || 0) < n) return fail(`Не хватает: ${RESOURCES[res]?.name || res}`);
  if (a.inv.length >= 120) return fail("Сумка полна");
  for (const [res, n] of Object.entries(r.cost)) a.res[res] -= n;
  const item = addItem(a, r.item, `craft:${r.id}`)!;
  return { ok: true, item };
}

// Бросок дропа «по трофеям монстра» — только на сервере
/** Действующий шанс строки дропа: экипировка × CURSE.equipDropMult (кламп 100). */
export function dropChance(g: { item: string; chance: number }): number { return ITEM_BY_ID[g.item]?.slot ? Math.min(100, g.chance * CURSE.equipDropMult) : g.chance; }
/** Действующий шанс материала в открытом мире: × CURSE.matDropMult (кламп 100). Количество не меняется. */
export function matChance(r: { chance: number }): number { return Math.min(100, r.chance * CHEST.matDropMult); }
/** Режим броска: "world" — открытый мир (экипировка × equipDropMult, материалы × matDropMult);
 * "base" — как раньше (экипировка × equipDropMult, материалы без множителя; забеги/подземелья);
 * "raw" — шансы ровно как в таблице (сундук зачищенного лагеря), без equipDropMult/matDropMult. */
export type LootMode = "world" | "base" | "raw";
/** Бросок добычи. mul — множитель проклятого/зачарованного моба (только обычные вещи и материалы).
 * cursedRoll — проклятый БОСС: каждая экипировка дополнительно и НЕЗАВИСИМО бросается как проклятая по шансу строки (режима) × itemChanceMult, без mul;
 *   выпавшая проклятая копия с шансом ENCH.comboPct ещё и зачарована (ярус — по весам).
 * ench — ярус моба: каждая экипировка отдельно бросается как копия яруса (шанс строки × itemChance яруса), при неудаче — младшего
 *   (ENCH.dropLower), не больше одной копии на строку. */
/** Страж уровня добычи (CHEST.lvlGuard, окно lvlDown…lvlUp вокруг уровня моба): вещь вне окна (например, правка
 *  «Дроп» в админке со старым предметом базы) — подменяется «своей» вещью моба того же слота, а если и её нет в окне —
 *  не выпадает. Без правок админа все вещи и так ровно уровня моба. null — не ронять. */
export function lootLvlFit(item: string, monster: string): string | null {
  const it = ITEM_BY_ID[item];
  if (!CHEST.lvlGuard || !it?.slot) return item;
  const L = lootMobLvl(monster);
  if (!L) return item;
  const ok = (x: string | undefined) => { const l = (x && ITEM_BY_ID[x]?.lvl) || 1; return l <= L + Math.max(0, Number(CHEST.lvlUp) || 0) && l >= L - Math.max(0, Number(CHEST.lvlDown) || 0); };
  if (ok(item)) return item;
  const own = OWN_GEAR[monster]?.[it.slot];
  return own && ok(own) ? own : null;
}
export function rollMonsterLoot(monster: string, rng = cryptoRand, mul = 1, cursedRoll = false, mode: LootMode = "base", ench = 0): { items: string[]; res: Record<string, number> } {
  const m00 = MONSTER_LOOT[monster];
  const out = { items: [] as string[], res: {} as Record<string, number> };
  if (!m00) return out;
  const m0 = (ZONE_MOBS as any)[monster]?.black ? m00 : { ...m00, materials: (m00.materials || []).filter((r: any) => !/^(bp_|bm_shard_)/.test(String(r.res))) }; // кусочки — только с чёрных мобов
  // таблица со стражем уровня: шанс строки сохраняется, предмет — в окне уровня моба
  const m = { ...m0, gear: m0.gear.flatMap((g) => { const x = lootLvlFit(g.item, monster); return x ? [x === g.item ? g : { ...g, item: x }] : []; }) };
  const gc = (g: { item: string; chance: number }) => (mode === "raw" ? g.chance : dropChance(g));
  const mc = (r: { chance: number }) => (mode === "world" ? matChance(r) : r.chance);
  for (const g of m.gear) if (rng() * 100 < Math.min(100, gc(g) * mul)) out.items.push(g.item);
  if (cursedRoll) for (const g of m.gear) if (ITEM_BY_ID[g.item]?.slot && rng() * 100 < Math.min(100, gc(g) * CURSE.itemChanceMult)) {
    const combo = ENCH.on && (Number(ENCH.comboPct) || 0) > 0 && rng() * 100 < Number(ENCH.comboPct) ? weightedTier(rng()) : 0;
    out.items.push(combo ? tagOf(g.item, true, combo) : g.item + CURSED_TAG);
  }
  if (ENCH.on && tierOk(ench)) for (const g of m.gear) {
    if (!ITEM_BY_ID[g.item]?.slot) continue;
    for (let t = ench; t >= (ENCH.dropLower ? 1 : ench); t--) if (rng() * 100 < Math.min(100, gc(g) * (Number(tierDef(t)!.itemChance) || 0))) { out.items.push(tagOf(g.item, false, t)); break; }
  }
  for (const r of m.materials) if (rng() * 100 < Math.min(100, mc(r) * mul)) out.res[r.res] = (out.res[r.res] || 0) + r.qty[0] + Math.floor(rng() * (r.qty[1] - r.qty[0] + 1));
  return out;
}

/** зачарованный моб: множитель шанса обычных вещей и материалов (dropMult яруса; без яруса/выкл — 1) */
export function enchDropMult(ench: number): number { const t = ENCH.on ? tierDef(ench) : null; return t ? Number(t.dropMult) || 1 : 1; }
/** бросок одного убийства для сундука зачищенного лагеря: СЫРЫЕ шансы; проклятый — × mobDropMult и проклятые копии (bossOnly); элита — второй бросок */
export function campRoll(k: { lootKey: string; elite: boolean; cursed: boolean; boss: boolean; ench?: number }, rng = cryptoRand) {
  const e = tierOk(k.ench) ? k.ench! : 0;
  const mul = (k.cursed ? CURSE.mobDropMult : 1) * enchDropMult(e) * (CHEST.campRaw ? 1 : CHEST.campMult), cr = k.cursed && (!CURSE.bossOnly || k.boss);
  const r = rollMonsterLoot(k.lootKey, rng, mul, cr, "raw", e);
  if (k.elite) { const l2 = rollMonsterLoot(k.lootKey, rng, mul, cr, "raw", e); r.items.push(...l2.items); for (const [x, n] of Object.entries(l2.res)) r.res[x] = (r.res[x] || 0) + n; }
  return r;
}

// ---------------- квесты ----------------
// повторяемые квесты (q.repeat): период — как у доски заданий (день/неделя по Киеву); board.ts подставляет periodKey при загрузке
let QPERIOD: (cat: string) => string = () => "";
export function setQuestPeriod(f: (cat: string) => string) { QPERIOD = f; }
export const questPeriod = (q: QuestDef) => (q.repeat ? QPERIOD(q.repeat) : "");
/** квест закрыт как выполненный СЕЙЧАС: обычный — сдан; повторяемый — сдан в текущем периоде */
export function questDoneNow(a: Account, q: QuestDef): boolean {
  if (!a.quests.done.includes(q.id)) return false;
  return !q.repeat || (a.quests.rep?.[q.id] || "") === questPeriod(q);
}
/** условия ветки: в квесте b.q сдан и выбран вариант b.k */
const branchMiss = (a: Account, q: QuestDef) => (q.reqBranch || []).filter((b) => !(a.quests.done.includes(b.q) && a.quests.br?.[b.q] === b.k));
export function questAvailable(a: Account, q: QuestDef, h: Hero | null = null): boolean {
  if (questDoneNow(a, q) || a.quests.active[q.id]) return false;
  if (q.minLevel && (!h || h.lvl < q.minLevel)) return false;
  if (q.requires && !q.requires.every((r) => a.quests.done.includes(r))) return false;
  if (branchMiss(a, q).length) return false;
  if (q.requiresStars && (a.starsBy[q.requiresStars.npc]?.[q.requiresStars.color] || 0) < q.requiresStars.count) return false;
  return true;
}
/** Почему квест закрыт (для списка «Все квесты»): null — можно взять. */
export function questLockReason(a: Account, q: QuestDef, h: Hero | null): string | null {
  if (questDoneNow(a, q)) return q.repeat ? (q.repeat === "weekly" ? "выполнен на этой неделе — снова на следующей" : "выполнен сегодня — снова завтра") : "уже выполнен";
  if (a.quests.active[q.id]) return null;
  if (q.minLevel && (!h || h.lvl < q.minLevel)) return `нужен уровень героя ${q.minLevel}${h ? ` (у вас ${h.lvl})` : ""}`;
  const miss = (q.requires || []).filter((r) => !a.quests.done.includes(r));
  if (miss.length) return "сначала: " + miss.map((r) => `«${QUEST_BY_ID[r]?.title || r}»`).join(", ");
  const bm = branchMiss(a, q);
  if (bm.length) return "сначала: " + bm.map((b) => { const bq = QUEST_BY_ID[b.q]; return `«${bq?.title || b.q}» — выбор «${bq?.rewards.alt?.[b.k]?.name || b.k}»`; }).join(", ");
  if (q.requiresStars && (a.starsBy[q.requiresStars.npc]?.[q.requiresStars.color] || 0) < q.requiresStars.count) return `нужно звёзд (${q.requiresStars.color}) от персонажа: ${q.requiresStars.count}`;
  return null;
}
// «собрать» и «уровень» — состояние профиля, а не события: пересчитываем перед показом/сдачей
const bagCount = (a: Account, h: Hero | null, id: string) => { const eq = new Set(Object.values(h?.equip || {})); return a.inv.filter((i) => i.id === id && (!i.hero || i.hero === a.hero) && !eq.has(i.uid)).length; };
export function questRefresh(a: Account, h: Hero | null): string[] {
  const ch: string[] = [];
  for (const [qid, st] of Object.entries(a.quests.active)) {
    const q = QUEST_BY_ID[qid]; if (!q) continue;
    q.objectives.forEach((o: any, i) => {
      const b = st.p[i];
      if (o.type === "collect") st.p[i] = Math.min(o.count, o.item ? bagCount(a, h, o.item) : Math.floor(a.res[o.res] || 0));
      if (o.type === "level") st.p[i] = h && h.lvl >= o.count ? 1 : 0;
      if (b !== st.p[i]) ch.push(qid);
    });
  }
  return [...new Set(ch)];
}
export function acceptQuest(a: Account, qid: string, h: Hero | null = null): R {
  const q = QUEST_BY_ID[qid];
  if (!q || !questAvailable(a, q, h)) return fail("Квест недоступен");
  const nActive = Object.keys(a.quests.active).length;
  if (nActive >= 8) return fail("Слишком много активных квестов");
  a.quests.active[qid] = { p: q.objectives.map(() => 0) };
  questRefresh(a, h);
  noteFeature(a, `quest:${qid}`);
  return { ok: true };
}
export function objectiveTarget(o: any): number { return o.type === "level" ? 1 : o.count || 1; }
export function questComplete(a: Account, qid: string): boolean {
  const q = QUEST_BY_ID[qid]; const st = a.quests.active[qid];
  if (!q || !st) return false;
  return q.objectives.every((o, i) => st.p[i] >= objectiveTarget(o));
}
// Событие прогресса. Возвращает id квестов, где что-то изменилось. Авто-квесты сдаются сразу.
export function questEvent(a: Account, ev: any, h: Hero | null = null): string[] {
  const ch = questEventRaw(a, ev);
  for (const id of ch) { const q = QUEST_BY_ID[id]; if (q?.auto && questComplete(a, id)) turnInQuest(a, h, id); }
  return ch;
}
/** условия цели (админка: «не применяя навыков», «быстрее N с»…) — по фактам боя с сервера; провал → в ev.failed */
function condsPass(qid: string, i: number, o: any, ev: any): boolean {
  if (!o.conds?.length) return true;
  const why = condFail(o.conds, ev.fight);
  if (!why) return true;
  ev.failed?.push({ qid, i, reason: why });
  return false;
}
function questEventRaw(a: Account, ev: any): string[] {
  const changed: string[] = [];
  for (const [qid, st] of Object.entries(a.quests.active)) {
    const q = QUEST_BY_ID[qid];
    if (!q) continue;
    q.objectives.forEach((o: any, i) => {
      const before = st.p[i];
      const tgt = objectiveTarget(o);
      if (before >= tgt && !(o.noAbilities && ev.type === "ability_used")) return;
      switch (o.type) {
        case "talk": if (ev.type === "talk" && ev.npc === o.npc) st.p[i] = 1; break;
        case "select_hero": if (ev.type === "select_hero") st.p[i] = 1; break;
        case "reach": if (ev.type === "reach" && ev.world === o.world) st.p[i] = 1; break;
        case "kill":
          if (ev.type === "kill" && goalMatch(o.mob, ev.kind || ev.mob) && (!o.cls || o.cls === ev.cls) && condsPass(qid, i, o, ev)) st.p[i] = Math.min(tgt, st.p[i] + 1);
          if (ev.type === "ability_used" && o.noAbilities && before < tgt) st.p[i] = 0; // нечестное условие звёздного квеста
          break;
        case "kill_boss":
          if (ev.type === "kill_boss" && goalMatch(o.mob, ev.kind || ev.mob) && !(o.noAbilities && ev.usedAbility) && condsPass(qid, i, o, ev)) st.p[i] = 1; break;
        case "gather": if (ev.type === "gather" && ev.res === o.res) st.p[i] = Math.min(tgt, st.p[i] + (ev.n || 1)); break;
        case "equip_monster": if (ev.type === "equip_monster" && ev.monster === o.monster) st.p[i] = 1; break;
        case "craft": if (ev.type === "craft") st.p[i] = Math.min(tgt, st.p[i] + 1); break;
        case "talent": if (ev.type === "talent") st.p[i] = Math.min(tgt, st.p[i] + 1); break;
        case "run":
          if (ev.type === "run" && ev.room === o.room && ev.time >= o.minTime && (!o.cls || o.cls === ev.cls)
            && (!o.minPlayers || ev.players >= o.minPlayers) && (!o.maxPlayers || ev.players <= o.maxPlayers)) st.p[i] = 1;
          break;
        case "duel_win": if (ev.type === "duel_win" && (ev.hpCapPct || 100) <= (o.hpCapPct || 100)) st.p[i] = 1; break;
      }
      if (st.p[i] !== before) changed.push(qid);
    });
  }
  return [...new Set(changed)];
}
/** итоговая награда с учётом выбранной ветки */
export function questRewardsFor(a: Account, q: QuestDef): { xp?: number; items?: string[]; res?: Record<string, number>; ch?: any[]; br?: string } {
  const k = a.quests.br?.[q.id], v: any = k ? q.rewards.alt?.[k] : null, b: any = q.rewards;
  if (!v) return { xp: b.xp, items: b.items, res: b.res, ch: b.ch };
  const has = (x: any) => x != null && !(Array.isArray(x) && !x.length) && !(typeof x === "object" && !Array.isArray(x) && !Object.keys(x).length);
  return { xp: v.xp != null ? v.xp : b.xp, items: has(v.items) ? v.items : b.items, res: has(v.res) ? v.res : b.res, ch: has(v.ch) ? v.ch : b.ch, br: k };
}
/** сундуки квеста (BcSpec[]): свои → ветки → по типу квеста; rewards.chOff — без сундука */
export function questChestSpec(a: Account | null, q: QuestDef) {
  const R = a ? questRewardsFor(a, q) : (q.rewards as any);
  return effSpec(R.ch, (q.rewards as any).chOff, questType(q));
}
/** сундуки каждой ветки со своим полем «Сундуки» — клиент показывает их сразу после выбора в диалоге */
export function questChestBranches(q: QuestDef): Record<string, BcSpec[]> | undefined {
  const A: any = (q.rewards as any).alt || {}, o: Record<string, BcSpec[]> = {};
  for (const k of Object.keys(A)) if (Array.isArray(A[k]?.ch) && A[k].ch.length) o[k] = effSpec(A[k].ch, (q.rewards as any).chOff, questType(q));
  return Object.keys(o).length ? o : undefined;
}
/** выбор игрока в окне диалога квеста: запоминается ветка (награда и открытие следующих квестов) */
export function questChoose(a: Account, qid: string, k: string): R {
  const q = QUEST_BY_ID[qid]; if (!q) return fail("Нет такого квеста");
  if (questDoneNow(a, q) && !a.quests.active[qid]) return fail("Квест уже сдан — выбор не меняется");
  (a.quests.br = a.quests.br || {})[qid] = k;
  return { ok: true };
}
export function turnInQuest(a: Account, h: Hero | null, qid: string): R & { rewards?: any } {
  const q = QUEST_BY_ID[qid];
  questRefresh(a, h);
  if (!q || !questComplete(a, qid)) return fail("Квест не выполнен");
  // «собрать предмет/ресурс»: сдаётся NPC
  for (const o of q.objectives as any[]) if (o.type === "collect" && o.item) { // закреплённые не сдаются: если без них не хватает — просим открепить
    const eq = new Set(Object.values(h?.equip || {}));
    const free = a.inv.filter((i) => i.id === o.item && !i.lk && (!i.hero || i.hero === a.hero) && !eq.has(i.uid)).length;
    if (free < o.count) return fail("Нужный предмет закреплён — открепите его для сдачи");
  }
  for (const o of q.objectives as any[]) if (o.type === "collect") {
    if (o.res) a.res[o.res] = Math.max(0, (a.res[o.res] || 0) - o.count);
    else { const eq = new Set(Object.values(h?.equip || {})); let n = o.count; a.inv = a.inv.filter((i) => { if (n > 0 && i.id === o.item && !i.lk && (!i.hero || i.hero === a.hero) && !eq.has(i.uid)) { n--; return false; } return true; }); }
  }
  // награда ветки диалога (выбор игрока, a.quests.br): заполненные поля заменяют основные
  const R = questRewardsFor(a, q);
  const spec = questChestSpec(a, q), nCh = bcSpecCount(spec);
  if (nCh && !q.auto) { const e = chestRoomErr(a, nCh); if (e) return fail(e); }
  delete a.quests.active[qid];
  if (!a.quests.done.includes(qid)) a.quests.done.push(qid);
  if (q.repeat) (a.quests.rep = a.quests.rep || {})[qid] = questPeriod(q);
  const got: any = { items: [], res: R.res || {}, stars: q.rewards.stars || {}, xp: 0 };
  if (R.br) got.br = R.br;
  if (R.xp && h) { gainXp(h, R.xp); got.xp = R.xp; }
  for (const [c, n] of Object.entries(q.rewards.stars || {})) {
    a.stars[c] = (a.stars[c] || 0) + n;
    (a.starsBy[q.npc] = a.starsBy[q.npc] || {})[c] = (a.starsBy[q.npc]?.[c] || 0) + n;
  }
  for (const id of R.items || []) { const it = addItem(a, id, `quest:${qid}`); if (it) got.items.push(it); }
  for (const [r, n] of Object.entries(R.res || {})) addRes(a, r, n);
  if (q.rewards.flag) a.flags[q.rewards.flag] = true;
  // сундуки за квест: свой список квеста/ветки или по типу (BCHEST.qdef); улучшение яруса — бросок здесь, на сервере
  if (nCh && a.hero && !(q.auto && chestRoomErr(a, nCh))) {
    const cs = grantSpec(a, a.hero, spec, h?.lvl || 1, "quest", `quest:${qid}`);
    if (cs.length) got.chests = cs.map((c) => ({ id: c.id, tier: c.tier, cur: !!c.cur, ...(c.up ? { upFrom: BCHEST.tiers[c.up]?.name } : {}), name: c.cur ? BCHEST.tiers[c.tier].nameC : BCHEST.tiers[c.tier].name, color: BCHEST.tiers[c.tier].color, L: c.L }));
  }
  // «Очищение снаряжения» (Чёрный маг): −N % очернения у каждой НАДЕТОЙ вещи героя, сдающего квест (не ниже 0)
  if ((q.rewards as any).blkFix > 0 && h) got.blkFix = repairBlackened(a, h, (q.rewards as any).blkFix);
  // авто-принятие следующего авто-квеста (пролог)
  for (const nq of QUESTS) if (nq.auto && questAvailable(a, nq)) acceptQuest(a, nq.id);
  return { ok: true, rewards: got };
}

/** пожизненные убийства: p — игроков (PvP), d — смертей от игроков, m — мобов (Σ убийств бестиария: открытый мир и забеги, с начала игры) */
export function killStats(a: Account): { p: number; d: number; m: number } {
  let m = 0; for (const b of Object.values(a.bestiary || {})) m += Number((b as any).kills) || 0;
  if (!m && (a as any)._mk) m = Number((a as any)._mk) || 0; // публичный профиль: сумма из D1 (бестиарий не загружается)
  const k = (a as any).kst || {}; return { p: Number(k.pk) || 0, d: Number(k.pd) || 0, m };
}
// Снимок профиля для клиента
export function snapshot(a: Account, h: Hero | null, cls: string | null, base: any, verified: boolean) {
  const heroes: Record<string, any> = {};
  return {
    verified, kst: killStats(a), // пожизненная статистика: игроков убито / смертей от игроков / мобов убито
    weaponSkill: weaponSkill(a, h), weaponCursed: weaponCursed(a, h), cursedGlow: cursedGlow(a, h).glow, curse: curseClient(), bmv: blkVisClient(), bma: bmaClient(a), skd: skdClient(), light: lightClient(), gfx: gfxClient(), ench: enchClient(), upg: upgClient(), account: { mobTrack: a.mobTrack || null, mobTracks: Array.isArray((a as any).mobTracks) ? (a as any).mobTracks : a.mobTrack ? [a.mobTrack] : [], runSkills: a.runSkills || [], inv: cls ? a.inv.filter((i) => !i.hero || i.hero === cls) : a.inv.filter((i) => !i.hero), res: a.res, stars: a.stars, starsBy: a.starsBy, creation: a.creation, soul: a.soul, quests: a.quests, bestiary: a.bestiary, flags: a.flags, disc: a.disc },
    hero: h && cls ? {
      cls, lvl: h.lvl, xp: h.xp, xpNeed: heroXpNeed(h.lvl), talents: h.talents, talentPoints: talentPoints(h), abil: h.abil, loadout: h.loadout,
      slots: abilitySlots(h.lvl), equip: h.equip, monsterAbilities: monsterAbilities(a, h), artAbilities: artifactAbilities(a, h), artInHand: artInHand(a, h), unlocked: unlockedAbilities(h, cls),
      effective: base ? heroEffective(a, h, cls, base) : null,
    } : null,
    heroes,
  };
}
export { HERO_IDS, ABILITIES_DEF, TALENTS };
