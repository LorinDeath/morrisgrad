// Серверный профиль «Проклятых» в SQLite Durable Object (ctx.storage.sql).
// Таблицы (миграции идемпотентны, применяются при старте объекта):
//   mc_schema(version)                         — версия схемы
//   mc_accounts(pkey PK, data JSON, verified, updated_at)   — общий для аккаунта: сумка, материалы, звёзды, квесты…
//   mc_heroes(pkey, hero, data JSON, updated_at, PK(pkey,hero)) — у каждого героя своя ветка прогресса
// pkey = "uid:<Clerk userId>" (проверенный токен) или "guest:<ник>" (непроверенный гость).
import { weaponType,
  HERO_IDS, HERO_MAX_LEVEL, heroXpNeed, talentPointsForLevel, abilitySlots, heroLevelHp, STAT_CAPS, softCap, armorToReduction,
  TALENTS, TALENT_BY_ID, TALENT_TIER_REQ, ABILITIES_DEF, ABILITY_BY_ID, LEGACY_ABILITY, RADIANCE_MAX, radianceCost, radianceProps,
  radiancePowerMult, radianceCdMult, SOUL_BRANCH, ITEM_BY_ID, MONSTER_LOOT, LOOKS, RECIPES, RESOURCES, SLOTS,
} from "./defs";
import { QUESTS, QUEST_BY_ID, type QuestDef } from "./quests";

export const SCHEMA_VERSION = 1;

export interface InvItem { uid: string; id: string }
export interface Account {
  v: number; inv: InvItem[]; res: Record<string, number>; stars: Record<string, number>;
  starsBy: Record<string, Record<string, number>>; creation: number; soul: string[];
  quests: { active: Record<string, { p: number[] }>; done: string[] };
  bestiary: Record<string, { seen: number; kills: number }>; flags: Record<string, boolean>; hero: string | null; nextUid: number;
}
export interface Hero {
  lvl: number; xp: number; talents: Record<string, number>; abil: Record<string, { rad: number; silenced?: boolean }>;
  loadout: string[]; equip: Record<string, string>; // слот → uid предмета из общей сумки
}

export function newAccount(): Account {
  return { v: 1, inv: [], res: {}, stars: { yellow: 0, red: 0, purple: 0, black: 0 }, starsBy: {}, creation: 0, soul: [],
    quests: { active: { p1_swarm: { p: [0] } }, done: [] }, bestiary: {}, flags: {}, hero: null, nextUid: 1 };
}
export function newHero(cls: string): Hero {
  const legacy = LEGACY_ABILITY[cls];
  return { lvl: 1, xp: 0, talents: {}, abil: legacy ? { [legacy]: { rad: 0 } } : {}, loadout: legacy ? [legacy] : [], equip: {} };
}

export class ProfileStore {
  sql: any;
  accounts = new Map<string, Account>();
  heroes = new Map<string, Hero>(); // `${pkey}|${hero}`
  constructor(sql: any) {
    this.sql = sql;
    this.migrate();
  }
  migrate() {
    if (!this.sql) return;
    this.sql.exec("CREATE TABLE IF NOT EXISTS mc_schema (version INTEGER NOT NULL)");
    const row = [...this.sql.exec("SELECT version FROM mc_schema LIMIT 1")][0] as any;
    const cur = row ? Number(row.version) : 0;
    if (cur < 1) {
      this.sql.exec("CREATE TABLE IF NOT EXISTS mc_accounts (pkey TEXT PRIMARY KEY, data TEXT NOT NULL, verified INTEGER NOT NULL DEFAULT 0, updated_at INTEGER NOT NULL)");
      this.sql.exec("CREATE TABLE IF NOT EXISTS mc_heroes (pkey TEXT NOT NULL, hero TEXT NOT NULL, data TEXT NOT NULL, updated_at INTEGER NOT NULL, PRIMARY KEY (pkey, hero))");
      if (row) this.sql.exec("UPDATE mc_schema SET version = 1"); else this.sql.exec("INSERT INTO mc_schema (version) VALUES (1)");
    }
    // будущие миграции: if (cur < 2) { ALTER TABLE … } — только аддитивные изменения
  }
  account(pkey: string): Account {
    let a = this.accounts.get(pkey);
    if (a) return a;
    const row = this.sql ? ([...this.sql.exec("SELECT data FROM mc_accounts WHERE pkey = ?", pkey)][0] as any) : null;
    a = row ? { ...newAccount(), ...JSON.parse(row.data) } : newAccount();
    this.accounts.set(pkey, a!);
    return a!;
  }
  hero(pkey: string, cls: string): Hero {
    const k = `${pkey}|${cls}`;
    let h = this.heroes.get(k);
    if (h) return h;
    const row = this.sql ? ([...this.sql.exec("SELECT data FROM mc_heroes WHERE pkey = ? AND hero = ?", pkey, cls)][0] as any) : null;
    h = row ? { ...newHero(cls), ...JSON.parse(row.data) } : newHero(cls);
    this.heroes.set(k, h!);
    return h!;
  }
  saveAccount(pkey: string, verified: boolean) {
    const a = this.accounts.get(pkey);
    if (!a || !this.sql) return;
    this.sql.exec("INSERT INTO mc_accounts (pkey, data, verified, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(pkey) DO UPDATE SET data = excluded.data, verified = excluded.verified, updated_at = excluded.updated_at",
      pkey, JSON.stringify(a), verified ? 1 : 0, Date.now());
  }
  saveHero(pkey: string, cls: string) {
    const h = this.heroes.get(`${pkey}|${cls}`);
    if (!h || !this.sql) return;
    this.sql.exec("INSERT INTO mc_heroes (pkey, hero, data, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(pkey, hero) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at",
      pkey, cls, JSON.stringify(h), Date.now());
  }
  evict(pkey: string) {
    this.accounts.delete(pkey);
    for (const cls of HERO_IDS) this.heroes.delete(`${pkey}|${cls}`);
  }
}

// ---------------- вычисления ----------------
export function talentSpent(h: Hero): number { return Object.values(h.talents).reduce((a, b) => a + b, 0); }
export function talentPoints(h: Hero): number { return talentPointsForLevel(h.lvl) - talentSpent(h); }

export function equippedItems(a: Account, h: Hero): { slot: string; uid: string; id: string }[] {
  const out: { slot: string; uid: string; id: string }[] = [];
  for (const [slot, uid] of Object.entries(h.equip)) {
    const it = a.inv.find((i) => i.uid === uid);
    if (it && ITEM_BY_ID[it.id]) out.push({ slot, uid, id: it.id });
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
  const raw: Record<string, number> = { hp: 0, armor: 0, dmgPct: 0, speedPct: 0, regen: 0, magnetPct: 0, cdrPct: 0, critPct: 0, lifestealPct: 0, atkSpeedPct: 0, revive: 0 };
  for (const [id, r] of Object.entries(h.talents)) {
    const t = TALENT_BY_ID[id];
    if (t) for (const [k, v] of Object.entries(t.per)) raw[k] += (v || 0) * r;
  }
  for (const id of a.soul) { const n = SOUL_BRANCH.find((s) => s.id === id); if (n) for (const [k, v] of Object.entries(n.per)) raw[k] += v || 0; }
  let wMin = 0, wMax = 0, weaponId: string | null = null;
  const items = equippedItems(a, h);
  for (const e of items) {
    const st = ITEM_BY_ID[e.id].stats;
    if (ITEM_BY_ID[e.id].slot === "weapon") weaponId = e.id;
    wMin += st.dmgMin || 0; wMax += st.dmgMax || 0;
    for (const k of ["armor", "hp", "speedPct", "critPct", "regen", "cdrPct", "magnetPct", "lifestealPct", "atkSpeedPct"]) raw[k] += (st as any)[k] || 0;
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
    revive: raw.revive > 0 ? 1 : 0,
    weaponMin: base.minAtk + wMin, weaponMax: base.maxAtk + wMax, itemDmgMin: wMin, itemDmgMax: wMax,
    look, weaponId, wtype: weaponType(weaponId, cls),
  };
  eff.damageReduction = Math.round(armorToReduction(eff.armor) * 1000) / 1000;
  const abilities = h.loadout.filter((id) => usableAbility(a, h, cls, id)).slice(0, abilitySlots(h.lvl)).map((id) => {
    const rad = h.abil[id]?.rad || 0;
    const def = ABILITY_BY_ID[id];
    return { id, rad, power: Math.round(def.power * radiancePowerMult(rad) * 100) / 100, cd: Math.round(def.cd * radianceCdMult(rad) * (1 - eff.cdrPct / 100) * 100) / 100, props: radianceProps(id, rad) };
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
  return def.cls === cls && h.lvl >= def.unlockLevel;
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
  const t = TALENT_BY_ID[id];
  if (!t || !id.startsWith(cls + ".")) return fail("Талант недоступен этому герою");
  const cur = h.talents[id] || 0;
  if (cur >= t.max) return fail("Максимальный ранг");
  if (talentPoints(h) <= 0) return fail("Нет очков талантов (даются за уровни героя)");
  if (talentSpent(h) < TALENT_TIER_REQ[t.tier]) return fail(`Нужно вложить ${TALENT_TIER_REQ[t.tier]} очков в дерево`);
  if (t.req && !(h.talents[t.req] > 0)) return fail("Сначала изучите предыдущий талант");
  h.talents[id] = cur + 1;
  return { ok: true };
}

export function setLoadout(a: Account, h: Hero, cls: string, ids: unknown): R {
  if (!Array.isArray(ids)) return fail("Плохая раскладка");
  const uniq = [...new Set(ids.map(String))];
  if (uniq.length < 1) return fail("Нужен хотя бы один навык");
  if (uniq.length > abilitySlots(h.lvl)) return fail(`Слотов навыков: ${abilitySlots(h.lvl)} (3-й — с 5 уровня)`);
  for (const id of uniq) if (!usableAbility(a, h, cls, id)) return fail(`Навык недоступен: ${ABILITY_BY_ID[id]?.name || id}`);
  h.loadout = uniq;
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

export function addItem(a: Account, id: string): InvItem | null {
  if (!ITEM_BY_ID[id]) return null;
  if (a.inv.length >= 120) return null; // сумка ограничена
  const it = { uid: `i${a.nextUid++}`, id };
  a.inv.push(it);
  return it;
}
export function addRes(a: Account, res: string, n: number) {
  if (!RESOURCES[res] || n <= 0) return;
  a.res[res] = Math.min(9999, (a.res[res] || 0) + Math.floor(n));
}

export function equip(a: Account, h: Hero, cls: string, uid: string): R {
  const it = a.inv.find((i) => i.uid === uid);
  if (!it) return fail("Нет такого предмета");
  const def = ITEM_BY_ID[it.id];
  if (!SLOTS[def.slot]) return fail("Неизвестный слот");
  if (def.classes && !def.classes.includes(cls as any)) return fail("Этот предмет не подходит герою");
  if (def.req && h.lvl < def.req) return fail(`Нужен ${def.req} уровень героя`);
  h.equip[def.slot] = uid;
  return { ok: true };
}
export function unequip(h: Hero, slot: string): R {
  if (!h.equip[slot]) return fail("Слот пуст");
  delete h.equip[slot];
  return { ok: true };
}
export function salvage(a: Account, heroes: Hero[], uid: string): R {
  const idx = a.inv.findIndex((i) => i.uid === uid);
  if (idx < 0) return fail("Нет предмета");
  if (heroes.some((h) => Object.values(h.equip).includes(uid))) return fail("Сначала снимите предмет");
  const def = ITEM_BY_ID[a.inv[idx].id];
  a.inv.splice(idx, 1);
  const shards = { common: 0, uncommon: 1, rare: 2, epic: 4, legendary: 8, mythic: 15 }[def.rarity] || 0;
  if (shards) addRes(a, "soul_shard", shards);
  return { ok: true, msg: shards ? `+${shards} осколков души` : "Разобрано" };
}
export function craft(a: Account, rid: string): R & { item?: InvItem } {
  const r = RECIPES.find((x) => x.id === rid);
  if (!r) return fail("Нет рецепта");
  for (const [res, n] of Object.entries(r.cost)) if ((a.res[res] || 0) < n) return fail(`Не хватает: ${RESOURCES[res]?.name || res}`);
  if (a.inv.length >= 120) return fail("Сумка полна");
  for (const [res, n] of Object.entries(r.cost)) a.res[res] -= n;
  const item = addItem(a, r.item)!;
  return { ok: true, item };
}

// Бросок дропа «по трофеям монстра» — только на сервере
export function rollMonsterLoot(monster: string, rng = Math.random): { items: string[]; res: Record<string, number> } {
  const m = MONSTER_LOOT[monster];
  const out = { items: [] as string[], res: {} as Record<string, number> };
  if (!m) return out;
  for (const g of m.gear) if (rng() * 100 < g.chance) out.items.push(g.item);
  for (const r of m.materials) if (rng() * 100 < r.chance) out.res[r.res] = (out.res[r.res] || 0) + r.qty[0] + Math.floor(rng() * (r.qty[1] - r.qty[0] + 1));
  return out;
}

// ---------------- квесты ----------------
export function questAvailable(a: Account, q: QuestDef): boolean {
  if (a.quests.done.includes(q.id) || a.quests.active[q.id]) return false;
  if (q.requires && !q.requires.every((r) => a.quests.done.includes(r))) return false;
  if (q.requiresStars && (a.starsBy[q.requiresStars.npc]?.[q.requiresStars.color] || 0) < q.requiresStars.count) return false;
  return true;
}
export function acceptQuest(a: Account, qid: string): R {
  const q = QUEST_BY_ID[qid];
  if (!q || !questAvailable(a, q)) return fail("Квест недоступен");
  const nActive = Object.keys(a.quests.active).length;
  if (nActive >= 8) return fail("Слишком много активных квестов");
  a.quests.active[qid] = { p: q.objectives.map(() => 0) };
  return { ok: true };
}
export function objectiveTarget(o: any): number { return o.count || 1; }
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
  if (!q || !questComplete(a, qid)) return fail("Квест не выполнен");
  delete a.quests.active[qid];
  a.quests.done.push(qid);
  const got: any = { items: [], res: q.rewards.res || {}, stars: q.rewards.stars || {}, xp: 0 };
  if (q.rewards.xp && h) { gainXp(h, q.rewards.xp); got.xp = q.rewards.xp; }
  for (const [c, n] of Object.entries(q.rewards.stars || {})) {
    a.stars[c] = (a.stars[c] || 0) + n;
    (a.starsBy[q.npc] = a.starsBy[q.npc] || {})[c] = (a.starsBy[q.npc]?.[c] || 0) + n;
  }
  for (const id of q.rewards.items || []) { const it = addItem(a, id); if (it) got.items.push(it); }
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
    account: { inv: a.inv, res: a.res, stars: a.stars, starsBy: a.starsBy, creation: a.creation, soul: a.soul, quests: a.quests, bestiary: a.bestiary, flags: a.flags },
    hero: h && cls ? {
      cls, lvl: h.lvl, xp: h.xp, xpNeed: heroXpNeed(h.lvl), talents: h.talents, talentPoints: talentPoints(h), abil: h.abil, loadout: h.loadout,
      slots: abilitySlots(h.lvl), equip: h.equip, monsterAbilities: monsterAbilities(a, h),
      effective: base ? heroEffective(a, h, cls, base) : null,
    } : null,
    heroes,
  };
}
export { HERO_IDS, ABILITIES_DEF, TALENTS };
