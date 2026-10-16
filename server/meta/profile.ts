import { isRs, rsCodexId } from "./rsAny";
import { CHEST } from "./chests";
import { CURSE, CURSED_TAG, isCursedTag, untag, instStats, glowLevel, curseClient } from "./cursed";
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
  radiancePowerMult, radianceCdMult, SOUL_BRANCH, ITEM_BY_ID, MONSTER_LOOT, RUN_SKILLS, RUN_SKILL_BY_ID, RUN_SKILL_DROP_PCT, LOOKS, RECIPES, RESOURCES, SLOTS, salvageYield, WEAPON_TYPES, ITEMS,
} from "./defs";
import { QUESTS, QUEST_BY_ID, type QuestDef } from "./quests";

export const SCHEMA_VERSION = 1;

// uid — instance_id (crypto.randomUUID() сервера), at — когда получен, src — источник, n — «новое» (ещё не просмотрено)
export interface InvItem { uid: string; id: string; at?: number; src?: string; n?: number; hero?: string | null; rs?: string; cursed?: 1; lk?: 1 } // hero — владелец-герой (у каждого героя своя сумка)
export interface Disc { items: Record<string, { st: "seen" | "owned"; at: number; src: string; v: number }>; feats: Record<string, { at: number; v: number }> }
export interface Account {
  v: number; inv: InvItem[]; res: Record<string, number>; stars: Record<string, number>;
  starsBy: Record<string, Record<string, number>>; creation: number; soul: string[];
  quests: { active: Record<string, { p: number[] }>; done: string[]; untracked?: string[] };
  mobTrack?: string | null; // «Отслеживать» из Бестиария (одна цель, сохраняется на сервере)
  bestiary: Record<string, { seen: number; kills: number; at?: number; v?: number }>; disc: Disc; flags: Record<string, boolean>; hero: string | null; nextUid: number;
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

export function equippedItems(a: Account, h: Hero): { slot: string; uid: string; id: string; cursed?: 1 }[] {
  const out: { slot: string; uid: string; id: string; cursed?: 1 }[] = [];
  for (const [slot, uid] of Object.entries(h.equip)) {
    const it = a.inv.find((i) => i.uid === uid);
    const def = it && ITEM_BY_ID[it.id];
    if (def && h.lvl >= itemReq(def)) out.push({ slot, uid, id: it.id, ...(it.cursed ? { cursed: 1 as const } : {}) }); // надетое не по уровню (старые сохранения) не действует
  }
  return out;
}

export function activeLook(a: Account, h: Hero): string | null {
  const ids = new Set(equippedItems(a, h).map((e) => e.id));
  for (const look of Object.values(LOOKS)) if (look.parts.every((p) => ids.has(p))) return look.id;
  return null;
}

// Итоговые статы героя — то, что ОДНОСТОРОННЕ передаётся в забег/мини-игру/открытый мир.
export function heroEffective(a: Account, h: Hero, cls: string, base: { maxHp: number; armor: number; minAtk: number; maxAtk: number }) {
  const raw: Record<string, number> = { hp: 0, armor: 0, dmgPct: 0, speedPct: 0, regen: 0, magnetPct: 0, cdrPct: 0, critPct: 0, lifestealPct: 0, atkSpeedPct: 0, revive: 0, armorPen: 0, armorPenPct: 0 };
  for (const [id, r] of Object.entries(h.talents)) {
    const t = TALENT_BY_ID[id];
    if (t) for (const [k, v] of Object.entries(t.per)) raw[k] += (v || 0) * r;
  }
  for (const id of a.soul) { const n = SOUL_BRANCH.find((s) => s.id === id); if (n) for (const [k, v] of Object.entries(n.per)) raw[k] += v || 0; }
  let wMin = 0, wMax = 0, weaponId: string | null = null;
  const items = equippedItems(a, h);
  for (const e of items) {
    const st: any = instStats(ITEM_BY_ID[e.id], e); // проклятый экземпляр: статы базы ×1.5 на лету
    if (ITEM_BY_ID[e.id].slot === "weapon") weaponId = e.id;
    wMin += st.dmgMin || 0; wMax += st.dmgMax || 0;
    for (const k of ["armor", "hp", "speedPct", "critPct", "regen", "cdrPct", "magnetPct", "lifestealPct", "atkSpeedPct", "armorPen", "armorPenPct"]) raw[k] += (st as any)[k] || 0;
  }
  // полный комплект моба: облик + бонус комплекта (bestiary.ts → look.stat)
  const look = activeLook(a, h);
  const lookStat = look ? LOOKS[look]?.stat : null;
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
    look, weaponId, wtype: weaponType(weaponId, cls),
    cursedGlow: glowLevel(items.filter((e) => e.cursed).length), weaponCursed: items.some((e) => e.cursed && e.slot === "weapon") ? 1 : 0,
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
  return equippedItems(a, h).map((e) => ITEM_BY_ID[e.id].grantsAbility).filter(Boolean) as string[];
}
export function usableAbility(a: Account, h: Hero, cls: string, id: string): boolean {
  const def = ABILITY_BY_ID[id];
  if (!def) return false;
  if (h.abil[id]?.silenced) return false;
  if (def.cls === "monster") return monsterAbilities(a, h).includes(id);
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
export function addItem(a: Account, id: string, src = "?", hero: string | null = a.hero, cursed = false): InvItem | null {
  if (isCursedTag(id)) { id = untag(id); cursed = true; }
  if (!ITEM_BY_ID[id]) return null;
  if (a.inv.filter((i) => (i.hero || null) === (hero || null)).length >= 120) return null; // сумка героя ограничена
  const it: InvItem = { uid: newUid(), id, at: Date.now(), src, n: 1, hero: hero || null, ...(cursed ? { cursed: 1 as const } : {}) };
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
  h.equip[def.slot] = uid;
  return { ok: true };
}
export function unequip(h: Hero, slot: string): R {
  if (!h.equip[slot]) return fail("Слот пуст");
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
/** Бросок добычи. mul — множитель проклятого моба (только обычные вещи и материалы).
 * cursedRoll — проклятый БОСС: каждая экипировка дополнительно и НЕЗАВИСИМО бросается как проклятая по шансу строки (режима) × itemChanceMult, без mul. */
export function rollMonsterLoot(monster: string, rng = cryptoRand, mul = 1, cursedRoll = false, mode: LootMode = "base"): { items: string[]; res: Record<string, number> } {
  const m = MONSTER_LOOT[monster];
  const out = { items: [] as string[], res: {} as Record<string, number> };
  if (!m) return out;
  const gc = (g: { item: string; chance: number }) => (mode === "raw" ? g.chance : dropChance(g));
  const mc = (r: { chance: number }) => (mode === "world" ? matChance(r) : r.chance);
  for (const g of m.gear) if (rng() * 100 < Math.min(100, gc(g) * mul)) out.items.push(g.item);
  if (cursedRoll) for (const g of m.gear) if (ITEM_BY_ID[g.item]?.slot && rng() * 100 < Math.min(100, gc(g) * CURSE.itemChanceMult)) out.items.push(g.item + CURSED_TAG);
  for (const r of m.materials) if (rng() * 100 < Math.min(100, mc(r) * mul)) out.res[r.res] = (out.res[r.res] || 0) + r.qty[0] + Math.floor(rng() * (r.qty[1] - r.qty[0] + 1));
  return out;
}

/** бросок одного убийства для сундука зачищенного лагеря: СЫРЫЕ шансы; проклятый — × mobDropMult и проклятые копии (bossOnly); элита — второй бросок */
export function campRoll(k: { lootKey: string; elite: boolean; cursed: boolean; boss: boolean }, rng = cryptoRand) {
  const mul = (k.cursed ? CURSE.mobDropMult : 1) * (CHEST.campRaw ? 1 : CHEST.campMult), cr = k.cursed && (!CURSE.bossOnly || k.boss);
  const r = rollMonsterLoot(k.lootKey, rng, mul, cr, "raw");
  if (k.elite) { const l2 = rollMonsterLoot(k.lootKey, rng, mul, cr, "raw"); r.items.push(...l2.items); for (const [x, n] of Object.entries(l2.res)) r.res[x] = (r.res[x] || 0) + n; }
  return r;
}

// ---------------- квесты ----------------
export function questAvailable(a: Account, q: QuestDef, h: Hero | null = null): boolean {
  if (a.quests.done.includes(q.id) || a.quests.active[q.id]) return false;
  if (q.minLevel && (!h || h.lvl < q.minLevel)) return false;
  if (q.requires && !q.requires.every((r) => a.quests.done.includes(r))) return false;
  if (q.requiresStars && (a.starsBy[q.requiresStars.npc]?.[q.requiresStars.color] || 0) < q.requiresStars.count) return false;
  return true;
}
/** Почему квест закрыт (для списка «Все квесты»): null — можно взять. */
export function questLockReason(a: Account, q: QuestDef, h: Hero | null): string | null {
  if (a.quests.done.includes(q.id)) return "уже выполнен";
  if (a.quests.active[q.id]) return null;
  if (q.minLevel && (!h || h.lvl < q.minLevel)) return `нужен уровень героя ${q.minLevel}${h ? ` (у вас ${h.lvl})` : ""}`;
  const miss = (q.requires || []).filter((r) => !a.quests.done.includes(r));
  if (miss.length) return "сначала: " + miss.map((r) => `«${QUEST_BY_ID[r]?.title || r}»`).join(", ");
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
          if (ev.type === "kill" && ev.mob === o.mob && (!o.cls || o.cls === ev.cls)) st.p[i] = Math.min(tgt, st.p[i] + 1);
          if (ev.type === "ability_used" && o.noAbilities && before < tgt) st.p[i] = 0; // нечестное условие звёздного квеста
          break;
        case "kill_boss":
          if (ev.type === "kill_boss" && ev.mob === o.mob && !(o.noAbilities && ev.usedAbility)) st.p[i] = 1; break;
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
  delete a.quests.active[qid];
  a.quests.done.push(qid);
  const got: any = { items: [], res: q.rewards.res || {}, stars: q.rewards.stars || {}, xp: 0 };
  if (q.rewards.xp && h) { gainXp(h, q.rewards.xp); got.xp = q.rewards.xp; }
  for (const [c, n] of Object.entries(q.rewards.stars || {})) {
    a.stars[c] = (a.stars[c] || 0) + n;
    (a.starsBy[q.npc] = a.starsBy[q.npc] || {})[c] = (a.starsBy[q.npc]?.[c] || 0) + n;
  }
  for (const id of q.rewards.items || []) { const it = addItem(a, id, `quest:${qid}`); if (it) got.items.push(it); }
  for (const [r, n] of Object.entries(q.rewards.res || {})) addRes(a, r, n);
  if (q.rewards.flag) a.flags[q.rewards.flag] = true;
  // авто-принятие следующего авто-квеста (пролог)
  for (const nq of QUESTS) if (nq.auto && questAvailable(a, nq)) acceptQuest(a, nq.id);
  return { ok: true, rewards: got };
}

// Снимок профиля для клиента
export function snapshot(a: Account, h: Hero | null, cls: string | null, base: any, verified: boolean) {
  const heroes: Record<string, any> = {};
  return {
    verified,
    weaponSkill: weaponSkill(a, h), weaponCursed: weaponCursed(a, h), cursedGlow: cursedGlow(a, h).glow, curse: curseClient(), account: { mobTrack: a.mobTrack || null, runSkills: a.runSkills || [], inv: cls ? a.inv.filter((i) => !i.hero || i.hero === cls) : a.inv.filter((i) => !i.hero), res: a.res, stars: a.stars, starsBy: a.starsBy, creation: a.creation, soul: a.soul, quests: a.quests, bestiary: a.bestiary, flags: a.flags, disc: a.disc },
    hero: h && cls ? {
      cls, lvl: h.lvl, xp: h.xp, xpNeed: heroXpNeed(h.lvl), talents: h.talents, talentPoints: talentPoints(h), abil: h.abil, loadout: h.loadout,
      slots: abilitySlots(h.lvl), equip: h.equip, monsterAbilities: monsterAbilities(a, h), unlocked: unlockedAbilities(h, cls),
      effective: base ? heroEffective(a, h, cls, base) : null,
    } : null,
    heroes,
  };
}
export { HERO_IDS, ABILITIES_DEF, TALENTS };
