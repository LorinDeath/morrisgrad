// Сервис мета-прогрессии, квестов и открытого мира Аринара. Подключается к GameRoom минимально:
// onJoin / handle(msg) / tick / onClose. Старые сообщения протокола не меняются.
import { CHARACTER_CLASSES } from "../classes";
import { verifyClerkToken, DEFAULT_CLERK_ISSUER } from "./auth";
import {
  HERO_IDS, ITEMS, ITEM_BY_ID, salvageYield, RUN_SKILL_BY_ID, RUN_SKILLS, MONSTER_LOOT, NPCS, NPC_RANGE, ZONE_MOBS, ZONE_RESPAWN, ABILITY_BY_ID, REWARD_RULES, MINIGAMES,
  ZONE_SPAWNS, ZONE_NODES, HUB_SPAWNS, RUN_LOOT_KEY, RUN_BOSS_BY_ROOM, WEAPON_TYPES, volleyDirs, weaponType, RECIPES, RESOURCES,
} from "./defs";
import { ZONE_GEN, genOf } from "./zoneGen";
import { baseOf } from "./biomes";
import { mobXp, xpLevelMult, killXp } from "./balance";
import { QUESTS, QUEST_BY_ID, turninNpc, setCustomQuests, builtinOverrides } from "./quests";
import { HOME_PORTAL_HUB, HOME_PORTAL_CD_MS, HOME_PORTAL_COMBAT_MS } from "../worlds/portals";
// спрайт снаряда автоатаки по типу оружия (атлас projectiles.png)
import { AUTO_SPRITE, shotAim } from "./abilityShapes";
import { LootBags, pickBagOwner, type Bag } from "./loot";
import { Parties, PARTY_MAX, partyXpShare, splitLoot } from "./party";
import { AdminStore, traitsFor, applyTraits } from "./admin";
import { ExploreStore } from "./exploreDb";
import { FOG_WORLDS } from "./explore";
import {
  heroEffective, markSeen, rollRunSkill, weaponSkill, noteMob, noteItem, cryptoRand, snapshot, learnTalent, setLoadout, upgradeRadiance, silenceAbility, buySoulNode, equip, unequip, salvage, salvagePreview, salvageMany, effSkill, codexBound,
  craft, addItem, addRes, rollMonsterLoot, gainXp, questEvent, questAvailable, acceptQuest, turnInQuest, questComplete, type Account, type Hero,
  questLockReason, questRefresh,
} from "./profile";
import { Zone, MOB_SKILLS, regSig, type ZPlayer } from "./zone";
import { ProfileStore } from "./store";
import { itemCard, mobDropView, mobStatView, SILHOUETTES, ITEM_INDEX } from "./library";
import { Rating, loadPublicProfile, publicCharacter, guestName, opaqueId, loadDuelRecord } from "./rating";
import { Pvp, type Duel } from "./pvp";
import { Social } from "./social";
import { Roles } from "./roles";
import { WEAPON_SKILL_CD } from "./abilityShapes";
import { rsInfo, RS_DEF } from "./rsAny";
import { setQuestTrack } from "./questTrack";
import { tryRevive } from "./revive";
/** ХП/с игрока: вне боя — полное (стат + база зоны + 4% ХП/с), в бою — ×ZONE_GEN.regenCombat. */
/** восстановление в бою для клиента (забеги считают ХП у себя) */
export function regenCfg() { const G: any = ZONE_GEN; return { mul: G.regenCombat ?? 0.1, sec: G.regenCombatSec ?? 5 }; }
export function regenRate(now: number, hurtAt: number, hitAt: number, maxHp: number, statRegen: number, hub: boolean): number {
  const G: any = ZONE_GEN, inCombat = now - Math.max(hurtAt, hitAt) < (G.regenCombatSec ?? 5) * 1000;
  const full = statRegen + (hub ? 2 : 0.3) + maxHp * 0.04;
  return inCombat ? (statRegen + (hub ? 2 : 0.3)) * (G.regenCombat ?? 0.1) : full;
}
import { castShape } from "./abilityShapes";
import { worldBounds, OPEN_AOI } from "../worlds/sizes";
import { GUEST_NAMES, guestDisplay, isGuestName } from "./guestNames";

export interface MetaSess {
  sid: string; pkey: string; verified: boolean; ready: boolean;
  zp: ZPlayer; lastAtk: number; gather: { node: number; at: number } | null; abilCd: Record<string, number>; wt?: string;
  run: { room: string; at: number; cls: string | null; maxMembers: number; usedAbility: boolean } | null;
  dirty: boolean; lastSave: number; lastHub: number;
  cards: Set<string>; sentRecipes?: boolean; rl: { t: number; n: number; warned: number };
  pub?: { cls: string; lvl: number; armor: number; dr: number; wMin: number; wMax: number; critPct: number; wt: string } | null; // публичные статы для панели «ЦЕЛЬ»
  social?: { rating: number; insp: number[] }; // ограничение частоты: рейтинг — раз в 2 с, просмотр персонажа — 1/с и 12/мин
}

// Схема входящих мета-сообщений: тип → поля и их типы (лишние поля игнорируются, неверные — отказ)
const S = (o: Record<string, "s" | "n" | "b" | "o" | "a" | "s?" | "n?" | "b?" | "o?" | "a?">) => o;
const MSG_SCHEMA: Record<string, Record<string, string>> = {
  meta_get: S({}), lib_get: S({}), talent_learn: S({ id: "s" }), loadout_set: S({ ids: "a" }), radiance_up: S({ id: "s" }), ability_silence: S({ id: "s", confirm: "s?" }),
  soul_buy: S({ id: "s" }), equip: S({ uid: "s" }), unequip: S({ slot: "s" }), salvage: S({ uid: "s" }), salvage_preview: S({ rarity: "s" }), salvage_many: S({ rarity: "s", uids: "a" }), craft: S({ recipe: "s" }), npc_talk: S({ npc: "s" }),
  quest_accept: S({ id: "s" }), quest_turnin: S({ id: "s" }), run_result: S({ time: "n?", kills: "o?", bossKills: "n?", room: "s?" }),
  loot_open: S({ bag: "n" }), loot_take: S({ bag: "n", lids: "a?", all: "b?" }),
  zone_attack: S({}), zone_ability: S({}), zone_target: S({}), gather_start: S({}), gather_done: S({}), dev_grant: S({}),
  mark_seen: S({ inv: "a?", items: "a?", mobs: "a?", feats: "a?" }),
  rating_get: S({}), inspect_player: S({ sid: "s?", id: "s?", hero: "s?" }),
  party_invite: S({ sid: "s" }), party_respond: S({ from: "s", accept: "b" }), party_leave: S({}), party_kick: S({ sid: "s" }), party_promote: S({ sid: "s" }), party_get: S({}),
  duel_challenge: S({ sid: "s" }), duel_respond: S({ from: "s", accept: "b", dnd: "b?" }),
  save_now: S({}), online_get: S({}), friends_get: S({}), friend_add: S({ sid: "s?", id: "s?" }), friend_respond: S({ id: "s", accept: "b" }),
  admin_open: S({}), admin_audit: S({}), admin_save: S({ kind: "s", id: "s", patch: "o" }), admin_reset: S({ kind: "s", id: "s" }), admin_quest_save: S({ quest: "o" }), admin_quest_delete: S({ id: "s" }), admin_quest_reset: S({ id: "s" }),
  friend_cancel: S({ id: "s" }), friend_remove: S({ id: "s" }), role_set: S({ id: "s?", sid: "s?", moderator: "b" }), settings_set: S({ duel: "s?", freq: "b?", dnd: "b?" }), duel_cancel: S({}), duel_leave: S({}),
};
function validMsg(msg: any): boolean {
  const sch = MSG_SCHEMA[msg.type];
  if (!sch) return true; // не мета-сообщение — его разберёт GameRoom
  for (const [k, t] of Object.entries(sch)) {
    const v = msg[k], opt = t.endsWith("?"), b = t[0];
    if (v === undefined || v === null) { if (opt) continue; return false; }
    if (b === "s" && (typeof v !== "string" || v.length > 64)) return false;
    if (b === "n" && (typeof v !== "number" || !Number.isFinite(v))) return false;
    if (b === "b" && typeof v !== "boolean") return false;
    if (b === "o" && (typeof v !== "object" || Array.isArray(v) || Object.keys(v).length > 200)) return false;
    if (b === "a" && (!Array.isArray(v) || v.length > 200)) return false;
  }
  return true;
}
const MOB_TYPES = Object.keys(ZONE_MOBS);
const RATE = { windowMs: 1000, max: 40 }; // мета-сообщений в секунду на сессию (атаки/движение сюда не входят)

// Базовые статы героя для прогрессии (нормализованы из server/classes.ts, чтобы классы не расходились в разы)
export function heroBase(cls: string | null) {
  const c = cls ? CHARACTER_CLASSES[cls] : null;
  if (!c) return { maxHp: 70, armor: 0, minAtk: 6, maxAtk: 9 };
  return { maxHp: Math.round(55 + c.stats.maxHp * 0.55), armor: Math.round(c.stats.armor / 5), minAtk: 6, maxAtk: 9 };
}

export class MetaService {
  store: ProfileStore;
  // Общие миры с мобами: Аринар (Мэлвелдил) и Поляна перевоплощения (хаб, мошкара пролога)
  // Аринар — процедурный режиссёр спавна (zoneGen.ts, сид экземпляра); Поляна хаба — фиксированные точки пролога.
  // ZONE_SPAWNS/ZONE_NODES оставлены как справка и для отката (proc: false).
  zones: Record<string, Zone> = { arinar: new Zone("arinar", [], ZONE_NODES, { proc: true, seed: ZONE_GEN.seed }), hellfire: new Zone("hellfire", HUB_SPAWNS, [], { proc: true }) };
  ms = new Map<string, MetaSess>(); // session.id → состояние
  env: any;
  zoneAcc = 0;
  rating: Rating;
  pvp: Pvp;
  social: Social;
  roles: Roles;
  duelMem = new Map<string, { w: number; l: number; d: number }>(); // счёт дуэлей без D1 (локальные тесты без базы)
  onPlayersChanged: (() => void) | null = null; // GameRoom.broadcast — после телепортов дуэли
  explore: ExploreStore;
  admin: AdminStore;
  onVerified?: (ws: any, session: any, uid: string) => void;
  constructor(sql: any, env: any) {
    this.store = new ProfileStore(sql, env?.GAME_DB);
    this.rating = new Rating(env?.GAME_DB);
    this.pvp = new Pvp(this);
    this.party = new Parties();
    this.social = new Social(this, env?.GAME_DB);
    this.roles = new Roles(env?.GAME_DB);
    this.explore = new ExploreStore(env?.GAME_DB);
    this.admin = new AdminStore(env?.GAME_DB);
    this.loot = new LootBags();
    { let t: any = null; this.admin.onChange = () => { if (!t) t = setTimeout(() => { t = null; this.broadcastConfig(); }, 50); }; } // правки — всем онлайн сразу
    this.rating.roleOf = (pk: string) => this.roles.of(pk);
    if (env?.GAME_DB) this.store.ensureLibrary();
    this.env = env || {};
  }

  // ---------- вход ----------
  async onJoin(ws: WebSocket, session: any, msg: any) {
    session.metaJoinMsg = msg; // для повторной загрузки профиля по meta_get (если первая не удалась)
    if (session.metaJoining) return;
    session.metaJoining = true;
    try { await this.joinMeta(ws, session, msg); } finally { session.metaJoining = false; }
  }
  // Повтор входа в мету: клиент присылает meta_get, пока не получил meta_state (не чаще раза в секунду).
  retryJoin(ws: WebSocket, session: any) {
    const now = Date.now();
    if (session.metaJoining || now - (session.metaRetryAt || 0) < 1000) return;
    session.metaRetryAt = now;
    this.onJoin(ws, session, session.metaJoinMsg || {}).catch((err) => console.error("meta retry", err));
  }
  async joinMeta(ws: WebSocket, session: any, msg: any) {
    await this.admin.sync(); // правки админ-панели (горячая перезагрузка по версии набора)
    let uid: string | null = null;
    // повтор после неудачной загрузки: уже проверенный uid берём из сессии (токен Clerk мог истечь)
    if (session.metaUid) uid = session.metaUid;
    else if (msg.token) uid = await verifyClerkToken(String(msg.token), this.env.CLERK_ISSUER || DEFAULT_CLERK_ISSUER);
    if (!uid && session.dev === true && msg.userId) uid = String(msg.userId).slice(0, 128);
    if (uid) session.metaUid = uid;
    const verified = !!uid;
    if (uid) session.userId = uid;
    if (uid && msg.token) this.onVerified?.(ws, session, uid);
    // Гость (без входа): прогресс по случайному guestId из localStorage браузера — не по нику,
    // чтобы разные «Странники» не делили один профиль. Не подтверждён сервером, ценность низкая.
    const gid = typeof msg.guestId === "string" && /^[a-z0-9]{16,40}$/.test(msg.guestId) ? msg.guestId : `s${session.id}`;
    const pkey = uid ? `uid:${uid}` : `guest:${gid}`;
    // профиль из D1 (источник истины) — до любых действий игрока
    try { await this.store.load(pkey); } catch (e: any) {
      console.error("[mc] profile load failed", e?.message || e);
      this.send(ws, { type: "meta_error", retry: true, message: "Профиль загружается дольше обычного — повторяем…" });
      return;
    }
    if ((ws as any).readyState > 1) return; // игрок ушёл, пока грузился профиль
    if (this.ms.has(session.id)) { this.send(ws, { type: "meta_state", ...this.snap(session) }); return; }
    const ms: MetaSess = { cards: new Set(), rl: { t: 0, n: 0, warned: 0 }, sid: session.id, pkey, verified, ready: true, zp: { sid: session.id, x: session.x, y: session.y, hp: 70, maxHp: 70, armorRed: 0, alive: true, respawnAt: 0 },
      lastAtk: 0, gather: null, abilCd: {}, run: null, dirty: false, lastSave: Date.now(), lastHub: 0 };
    this.ms.set(session.id, ms);
    const a = this.store.account(pkey);
    // гость: имя из 100 четырёхбуквенных назначает сервер один раз (хранится в профиле), показ — «Гость» Имя
    if (!verified) {
      if (!a.gname || !isGuestName(a.gname)) { a.gname = GUEST_NAMES[Math.floor(cryptoRand() * GUEST_NAMES.length)]; this.store.saveAccount(pkey, false); }
      session.username = guestDisplay(a.gname);
      this.send(ws, { type: "guest_name", name: session.username });
    }
    await this.social.warm(pkey);
    await this.roles.ensure();
    { const ms0 = this.ms.get(session.id); const role = ms0?.verified ? this.roles.of(pkey) : undefined; this.send(ws, { type: "my_role", role: role || null, admin: this.roles.isAdmin(ms0) }); }
    if (a.hero && CHARACTER_CLASSES[a.hero] && !session.stats.classId) this.applyHeroToSession(session, a.hero);
    this.refreshZonePlayer(session);
    this.send(ws, { type: "meta_state", ...this.snap(session) });
  }

  applyHeroToSession(session: any, cls: string) {
    const c = CHARACTER_CLASSES[cls];
    session.color = c.color;
    session.stats = { classId: cls, hp: c.stats.hp, maxHp: c.stats.maxHp, armor: c.stats.armor, minAtk: c.stats.minAtk, maxAtk: c.stats.maxAtk };
  }

  snap(session: any) {
    const ms = this.ms.get(session.id)!;
    const a = this.store.account(ms.pkey);
    const cls = session.stats?.classId || null;
    const h = cls ? this.store.hero(ms.pkey, cls) : null;
    const s: any = snapshot(a, h, cls, heroBase(cls), ms.verified);
    for (const id of HERO_IDS) { const hh = this.store.hero(ms.pkey, id); s.heroes[id] = { lvl: hh.lvl, xp: hh.xp, loadout: hh.loadout }; }
    // черты админки для ЗАБЕГА (забег считает клиент-хост): оружие+надетое, навыки героя по id и навык оружия (rs:*)
    try { const eff = this.effective(session); const sk: Record<string, any[]> = {};
      for (const ab of eff.abilities || []) { const t = traitsFor(null, [], ab.id); if (t.length) sk[ab.id] = t; }
      const rs = (s as any).weaponSkill; if (rs) { const t = traitsFor(null, [], "rs:" + rs); if (t.length) sk["rs:" + rs] = t; }
      s.runTraits = { weapon: traitsFor(eff.wtype || null, this.equippedIds(session, a)), skill: sk }; } catch { /* нет героя — без черт */ }
    // переход на новые деревья талантов: сообщить о возвращённых очках (один раз)
    const refunds = HERO_IDS.map((id) => [id, this.store.hero(ms.pkey, id)] as const).filter(([, hh]) => hh.refunded);
    if (refunds.length) { s.notice = `Деревья талантов обновлены: очки возвращены (${refunds.map(([id, hh]) => `${id} +${hh.refunded}`).join(", ")}). Активные навыки теперь открываются в дереве.`; for (const [, hh] of refunds) delete hh.refunded; }
    questRefresh(a, h);
    s.available = QUESTS.filter((q) => questAvailable(a, q, h)).map((q) => q.id);
    s.customQuests = QUESTS.filter((q) => q.custom); // тексты квестов админ-панели (клиент вливает в QUEST_BY_ID)
    s.questOverrides = builtinOverrides(); // правки сюжетных квестов (клиент накладывает поверх кода)
    if (h) s.portal = h.portal?.x != null ? { x: h.portal.x, y: h.portal.y, cd: h.portal.cd } : { cd: h.portal?.cd || 0 }; // личный портал домой
    s.configPatches = this.admin.clientPatches(); s.configVer = this.admin.ver; s.regenCfg = regenCfg(); // правки оружия/навыков/мобов
    s.complete = Object.keys(a.quests.active).filter((id) => questComplete(a, id));
    s.zone = { hp: Math.round(ms.zp.hp), maxHp: ms.zp.maxHp };
    // карточки предметов сумки — только новые для этой сессии (клиент кэширует); статы из клиента не принимаются
    const cards: Record<string, any> = {};
    const want = new Set<string>(a.inv.map((it) => it.id));
    // рецепты Петра и предметы-награды текущих/доступных заданий — показываются в Книге, значит нужны их карточки
    if (!ms.sentRecipes) { s.recipes = RECIPES; ms.sentRecipes = true; }
    for (const r of RECIPES) want.add(r.item);
    for (const qid of [...Object.keys(a.quests.active), ...s.available]) for (const id of QUEST_BY_ID[qid]?.rewards?.items || []) want.add(id);
    for (const id of want) if (!ms.cards.has(id)) { const c = itemCard(id); if (c) { ms.cards.add(id); cards[id] = c; } }
    s.cards = cards;
    s.store = this.store.mode;
    return s;
  }

  /** правка админ-панели — сразу всем онлайн-игрокам (без переподключения): тексты квестов, оружие/навыки/мобы,
   *  свежие карточки изменённых предметов, пересчитанные статы героя. Сервер уже применил правку в памяти (мир/дуэли/забеги). */
  broadcastConfig() {
    const patches = this.admin.clientPatches(), items = this.admin.touchedItems();
    const base = { type: "config_update", ver: this.admin.ver, patches, customQuests: QUESTS.filter((q) => q.custom), questOverrides: builtinOverrides(), regenCfg: regenCfg() };
    for (const [sid, ms] of this.ms) {
      const e = this.sessionLookup?.(sid); if (!e) continue;
      const cards: Record<string, any> = {};
      for (const id of items) if (ms.cards.has(id)) { const c = itemCard(id); if (c) cards[id] = c; }
      this.send(e[0], { ...base, cards });
      try { this.send(e[0], { type: "meta_state", ...this.snap(e[1]) }); } catch (_) {}
    }
  }
  send(ws: WebSocket, obj: any) { try { ws.send(JSON.stringify(obj)); } catch (_) {} }

  push(ws: WebSocket, session: any, extra: any = {}) {
    const ms = this.ms.get(session.id);
    if (!ms) return;
    ms.dirty = true;
    this.save(session);
    this.refreshZonePlayer(session);
    this.send(ws, { type: "meta_state", ...this.snap(session), ...extra });
  }

  save(session: any) {
    const ms = this.ms.get(session.id);
    if (!ms) return;
    this.store.saveAccount(ms.pkey, ms.verified);
    for (const id of HERO_IDS) if (this.store.heroes.has(`${ms.pkey}|${id}`)) this.store.saveHero(ms.pkey, id);
    ms.dirty = false; ms.lastSave = Date.now();
  }

  refreshZonePlayer(session: any) {
    const ms = this.ms.get(session.id);
    if (!ms) return;
    const cls = session.stats?.classId || null;
    const eff = this.effective(session);
    const wasFull = ms.zp.hp >= ms.zp.maxHp;
    ms.zp.maxHp = eff.maxHp;
    ms.zp.armorRed = eff.damageReduction;
    (ms as any).revive = (eff as any).revive || 0; // талант «встать с 40% ХП» (revive.ts)
    if (wasFull || ms.zp.hp > eff.maxHp) ms.zp.hp = eff.maxHp;
    // облик («забери всё») и уровень героя видны другим игрокам через players_state.stats
    if (session.stats && cls) { session.stats.look = eff.look || null; session.stats.lvl = eff.level || 1; }
    ms.wt = eff.wtype;
    ms.pub = cls ? { cls, lvl: eff.level || 1, armor: eff.armor, dr: eff.damageReduction, wMin: eff.weaponMin, wMax: eff.weaponMax, critPct: eff.critPct, wt: eff.wtype } : null;
  }

  effective(session: any) {
    const ms = this.ms.get(session.id)!;
    const cls = session.stats?.classId || null;
    const a = this.store.account(ms.pkey);
    if (!cls) return { ...heroBase(null), damageReduction: 0, dmgPct: 0, critPct: 5, lifestealPct: 0, regen: 0, cdrPct: 0, weaponMin: 6, weaponMax: 9, abilities: [] as any[], speedPct: 0, magnetPct: 0, atkSpeedPct: 0, revive: 0, look: null, level: 0, weaponId: null, wtype: weaponType(null, null) };
    return heroEffective(a, this.store.hero(ms.pkey, cls), cls, heroBase(cls));
  }

  // ——— PvP / публичные статы ———
  pvpGone(session: any) { if (session?.id) this.pvp.leave(session, "disconnect"); }
  pvpFrozen(session: any) { return this.pvp.frozen(session); }
  // статы героя, посчитанные сервером, для панели «ЦЕЛЬ» у других игроков (кэш обновляется в refreshZonePlayer)
  // роль сессии для показа (плашка над головой, чат, «Онлайн»): только проверенный вход
  roleOfSid(sid: string) { const ms = this.ms.get(sid); return ms?.verified ? this.roles.of(ms.pkey) : undefined; }
  publicStats(sid: string) {
    const ms = this.ms.get(sid);
    if (!ms || !ms.pub) return null;
    return { ...ms.pub, hp: Math.max(0, Math.round(ms.zp.hp)), maxHp: ms.zp.maxHp };
  }
  displayName(session: any) {
    const ms = this.ms.get(session?.id);
    if (ms && ms.pkey.startsWith("guest:")) return guestName(ms.pkey, this.store.accounts.get(ms.pkey)?.gname);
    return String(session?.username || "Странник").slice(0, 32);
  }
  duelBlock(from: string, to: string) { return this.social.duelBlock(from, to); }
  async recordDuel(d: Duel, winner: 0 | 1 | null, reason: string) {
    const now = Date.now();
    const res = (i: number) => (winner === null ? "d" : winner === i ? "w" : "l");
    const db = this.store.db;
    if (!db) {
      d.pkeys.forEach((pk, i) => { const r = this.duelMem.get(pk) || { w: 0, l: 0, d: 0 }; r[res(i) as "w" | "l" | "d"]++; this.duelMem.set(pk, r); });
      return;
    }
    const up = (i: number) => db.prepare(`INSERT INTO duel_stats (pkey, wins, losses, draws, last_hero, updated_at) VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(pkey) DO UPDATE SET wins = wins + excluded.wins, losses = losses + excluded.losses, draws = draws + excluded.draws, last_hero = excluded.last_hero, updated_at = excluded.updated_at`)
      .bind(d.pkeys[i], res(i) === "w" ? 1 : 0, res(i) === "l" ? 1 : 0, res(i) === "d" ? 1 : 0, d.heroes[i], now);
    // журнал первым: повтор с тем же id дуэли упадёт на PRIMARY KEY и не задвоит счёт (batch — одна транзакция)
    await db.batch([
      db.prepare("INSERT INTO duel_results (id, a_pkey, b_pkey, a_hero, b_hero, winner, reason, started_at, ended_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
        .bind(d.id, d.pkeys[0], d.pkeys[1], d.heroes[0], d.heroes[1], winner === null ? null : winner === 0 ? "a" : "b", reason, d.startAt, now),
      up(0), up(1),
    ]);
  }
  async duelRecord(pkey: string) {
    if (!this.store.db) return this.duelMem.get(pkey) || { w: 0, l: 0, d: 0 };
    return loadDuelRecord(this.store.db, pkey);
  }

  questEv(ws: WebSocket, session: any, ev: any) {
    const ms = this.ms.get(session.id);
    if (!ms) return;
    const a = this.store.account(ms.pkey);
    const changed = this.qev(a, session, ev);
    if (changed.length) {
      ms.dirty = true;
      this.send(ws, { type: "quest_progress", quests: changed.map((id) => ({ id, p: a.quests.active[id]?.p, complete: questComplete(a, id) })) });
    }
  }

  qev(a: Account, session: any, ev: any): string[] {
    const ms = this.ms.get(session.id);
    const cls = session.stats?.classId;
    return questEvent(a, ev, ms && cls ? this.store.hero(ms.pkey, cls) : null);
  }

  nearNpc(session: any, npc: string) {
    const n = NPCS[npc];
    return n && (session.world || "hellfire") === n.world && Math.hypot(session.x - n.x, session.y - n.y) <= NPC_RANGE;
  }

  // ---------- сообщения ----------
  handle(ws: WebSocket, session: any, msg: any, ctx: { runMembers: (room: string) => any[]; broadcast: () => void }): boolean {
    const ms = this.ms.get(session?.id);
    if (!ms) {
      // профиль ещё не загружен (или загрузка не удалась) — meta_get запускает повтор
      if (msg.type === "meta_get" && session) { this.retryJoin(ws, session); return true; }
      return false;
    }
    if (MSG_SCHEMA[msg.type]) {
      const now = Date.now();
      if (now - ms.rl.t > RATE.windowMs) { ms.rl.t = now; ms.rl.n = 0; }
      if (++ms.rl.n > RATE.max) {
        if (now - ms.rl.warned > 10000) { ms.rl.warned = now; this.store.audit(ms.pkey, "reject", `rl:${ms.pkey}:${Math.floor(now / 10000)}`, { why: "rate", type: msg.type }); }
        return true;
      }
      if (!validMsg(msg)) { this.send(ws, { type: "toast_error", message: "Неверный запрос" }); this.store.audit(ms.pkey, "reject", `schema:${ms.pkey}:${now}`, { why: "schema", type: msg.type }); return true; }
    }
    const a = this.store.account(ms.pkey);
    const cls: string | null = session.stats?.classId || null;
    const h: Hero | null = cls ? this.store.hero(ms.pkey, cls) : null;
    const reply = (r: any, okMsg?: string) => {
      if (r.ok) this.push(ws, session, { toast: r.msg || okMsg });
      else this.send(ws, { type: "toast_error", message: r.err });
    };
    const needHero = () => { if (!h || !cls) { this.send(ws, { type: "toast_error", message: "Сначала выберите героя на Алтаре перевоплощения" }); return false; } return true; };
    switch (msg.type) {
      case "meta_get": this.send(ws, { type: "meta_state", ...this.snap(session) }); return true;
      case "lib_get": this.send(ws, { type: "library", ...this.library(a, HERO_IDS.map((id) => this.store.hero(ms.pkey, id))) }); return true;
      case "mark_seen": {
        const n = markSeen(a, msg);
        if (n) { ms.dirty = true; this.store.saveAccount(ms.pkey, ms.verified); }
        this.send(ws, { type: "seen_ok", n });
        return true;
      }
      case "talent_learn": if (!needHero()) return true; { const r = learnTalent(a, h!, cls!, String(msg.id)); if (r.ok) this.qev(a, session, { type: "talent" }); reply(r, "Талант изучен"); this.refreshZonePlayer(session); } return true;
      case "loadout_set": if (!needHero()) return true; reply(setLoadout(a, h!, cls!, msg.ids), "Раскладка сохранена"); return true;
      case "radiance_up": if (!needHero()) return true; reply(upgradeRadiance(a, h!, cls!, String(msg.id)), "Сияние усилено"); return true;
      case "ability_silence": if (!needHero()) return true; reply(silenceAbility(a, h!, cls!, String(msg.id), msg.confirm)); return true;
      case "soul_buy": {
        if (!this.nearNpcOrAltar(session)) { this.send(ws, { type: "toast_error", message: "Ветка души открывается только у Алтаря перевоплощения" }); return true; }
        reply(buySoulNode(a, String(msg.id)), "Душа изменилась"); this.refreshZonePlayer(session); return true;
      }
      case "equip": {
        if (!needHero()) return true;
        const r = equip(a, h!, cls!, String(msg.uid));
        if (r.ok) { const it = a.inv.find((i) => i.uid === msg.uid); const mon = it && ITEM_BY_ID[it.id].monster; if (mon) this.qev(a, session, { type: "equip_monster", monster: mon }); }
        reply(r, "Надето"); this.refreshZonePlayer(session); return true;
      }
      case "unequip": if (!needHero()) return true; reply(unequip(h!, String(msg.slot)), "Снято"); this.refreshZonePlayer(session); return true;
      case "salvage": {
        const own = a.inv.find((i) => i.uid === String(msg.uid));
        if (own?.hero && own.hero !== cls) { this.send(ws, { type: "toast_error", message: "Это предмет другого героя" }); return true; }
        const heroes = HERO_IDS.map((id) => this.store.hero(ms.pkey, id));
        reply(salvage(a, heroes, String(msg.uid))); return true;
      }
      case "salvage_preview": { // массовый разбор: сначала превью от сервера (что именно получит игрок), подтверждение — в игре
        const heroes = HERO_IDS.map((id) => this.store.hero(ms.pkey, id));
        this.send(ws, { type: "salvage_preview", ...salvagePreview(a, heroes, cls || null, String(msg.rarity)) }); return true;
      }
      case "salvage_many": {
        const heroes = HERO_IDS.map((id) => this.store.hero(ms.pkey, id));
        const uids = Array.isArray(msg.uids) ? msg.uids.slice(0, 500).map(String) : [];
        reply(salvageMany(a, heroes, cls || null, String(msg.rarity), uids)); return true;
      }
      case "craft": {
        if (!this.nearNpc(session, "petr")) { this.send(ws, { type: "toast_error", message: "Ремесло — у Петра (хаб, юго-запад)" }); return true; }
        const r = craft(a, String(msg.recipe));
        if (r.ok) this.qev(a, session, { type: "craft" });
        reply(r, "Создано!"); return true;
      }
      case "npc_talk": {
        const npc = String(msg.npc);
        if (!this.nearNpc(session, npc)) { this.send(ws, { type: "toast_error", message: "Подойдите ближе" }); return true; }
        this.questEv(ws, session, { type: "talk", npc });
        questRefresh(a, h);
        // все квесты персонажа: доступные, закрытые (с причиной), активные, готовые к сдаче, выполненные (лор читается)
        const quests = QUESTS.filter((q) => !q.auto && (q.npc === npc || turninNpc(q) === npc)).map((q) => {
          const act = a.quests.active[q.id];
          const state = act ? (questComplete(a, q.id) ? (turninNpc(q) === npc ? "complete" : "active") : "active") : a.quests.done.includes(q.id) ? "done" : q.npc !== npc ? "elsewhere" : questAvailable(a, q, h) ? "available" : "locked";
          return { id: q.id, state, reason: state === "locked" ? questLockReason(a, q, h) : state === "elsewhere" ? `берётся у: ${NPCS[q.npc]?.name || q.npc}` : undefined, p: act?.p };
        }).filter((x) => x.state !== "elsewhere" || a.quests.done.includes(x.id));
        this.push(ws, session);
        this.send(ws, { type: "npc_dialog", npc, quests });
        return true;
      }
      case "quest_track": { // отслеживание: { id, on } или { all: true, on }
        const id = msg.all ? null : String(msg.id ?? "");
        reply(setQuestTrack(a.quests, id, !!msg.on)); return true;
      }
      case "quest_accept": {
        const q = QUEST_BY_ID[String(msg.id)];
        if (!q || !this.nearNpc(session, q.npc)) { this.send(ws, { type: "toast_error", message: "Возьмите квест у персонажа" }); return true; }
        const r = acceptQuest(a, q.id, h);
        if (r.ok) { this.qev(a, session, { type: "talk", npc: q.npc }); if ((session.world || "hellfire") === "arinar") this.qev(a, session, { type: "reach", world: "arinar" }); }
        reply(r, `Квест принят: ${q.title}`); return true;
      }
      case "quest_turnin": {
        const q = QUEST_BY_ID[String(msg.id)];
        if (!q) return true;
        // сюжетные квесты пролога сдаются автоматически, остальные — у персонажа
        if (q.campaign !== "prologue" && !this.nearNpc(session, turninNpc(q))) { this.send(ws, { type: "toast_error", message: `Сдайте квест: ${NPCS[turninNpc(q)]?.name}` }); return true; }
        const r = turnInQuest(a, h, q.id);
        if (r.ok) this.push(ws, session, { questDone: { id: q.id, rewards: (r as any).rewards } });
        else this.send(ws, { type: "toast_error", message: (r as any).err });
        this.refreshZonePlayer(session);
        return true;
      }
      case "run_result": this.runResult(ws, session, msg, ctx).catch((e) => console.error("[mc] run_result", e?.message || e)); return true;
      case "rating_get": {
        const so = (ms.social = ms.social || { rating: 0, insp: [] });
        if (Date.now() - so.rating < 2000) { this.send(ws, { type: "rating_err", message: "Рейтинг обновляется — подождите пару секунд" }); return true; }
        so.rating = Date.now();
        this.rating.view(ms.pkey).then((v) => this.send(ws, { type: "rating", ...v })).catch((e) => { console.error("[mc] rating", e?.message || e); this.send(ws, { type: "rating_err", message: "Рейтинг временно недоступен" }); });
        return true;
      }
      case "admin_open": case "admin_audit": case "admin_save": case "admin_reset": case "admin_quest_save": case "admin_quest_delete": case "admin_quest_reset": {
        // только серверно проверенный админ (uid из Clerk + player_roles); id/роль из сообщения не используются
        if (!this.roles.isAdmin(ms)) { this.send(ws, { type: "toast_error", message: "Недостаточно прав" }); this.store.audit(ms.pkey, "reject", `admin:${ms.pkey}:${Date.now()}`, { why: "not_admin", type: msg.type }); return true; }
        const t = Date.now(); if (msg.type !== "admin_open" && t - ((ms as any).admAt || 0) < 300) { this.send(ws, { type: "toast_error", message: "Слишком часто" }); return true; }
        (ms as any).admAt = t;
        if (JSON.stringify(msg).length > 24000) { this.send(ws, { type: "toast_error", message: "Слишком большой запрос" }); return true; }
        const fail = (e: any) => { console.error("[mc] admin", e?.message || e); this.send(ws, { type: "admin_result", ok: false, err: "Ошибка сохранения" }); };
        if (msg.type === "admin_open") this.admin.sync(true).then(() => this.send(ws, { type: "admin_catalog", ...this.admin.catalog() })).catch(fail);
        else if (msg.type === "admin_audit") this.admin.audit(60).then((rows) => this.send(ws, { type: "admin_audit", rows })).catch(fail);
        else if (msg.type === "admin_save") this.admin.save(ms.pkey, msg.kind, msg.id, msg.patch).then((r) => this.send(ws, { type: "admin_result", op: "save", kind: msg.kind, id: msg.id, ...r })).catch(fail);
        else if (msg.type === "admin_reset") this.admin.reset(ms.pkey, msg.kind, msg.id).then((r) => this.send(ws, { type: "admin_result", op: "reset", kind: msg.kind, id: msg.id, ...r })).catch(fail);
        else if (msg.type === "admin_quest_reset") this.admin.resetQuest(ms.pkey, msg.id).then((r) => this.send(ws, { type: "admin_result", op: "quest", reset: true, ...r })).catch(fail);
        else if (msg.type === "admin_quest_save") this.admin.saveQuest(ms.pkey, msg.quest).then((r) => this.send(ws, { type: "admin_result", op: "quest", ...r })).catch(fail);
        else this.admin.deleteQuest(ms.pkey, msg.id).then((r) => this.send(ws, { type: "admin_result", op: "quest_delete", id: msg.id, ...r })).catch(fail);
        return true;
      }
      case "role_set": {
        // только серверно проверенный админ; цель — по sid онлайн-сессии или непрозрачному id (рейтинг/друзья/онлайн)
        if (!this.roles.isAdmin(ms)) { this.send(ws, { type: "toast_error", message: "Недостаточно прав" }); return true; }
        let target: string | null = null;
        if (msg.sid) { const e = this.sessionLookup?.(String(msg.sid)); target = e ? this.ms.get(e[1].id)?.pkey || null : null; }
        else if (msg.id) target = this.rating.byId.get(String(msg.id)) || this.social.ids.get(String(msg.id)) || null;
        if (!target) { this.send(ws, { type: "toast_error", message: "Игрок не найден" }); return true; }
        this.roles.setModerator(ms.pkey, target, !!msg.moderator).then((r) => {
          if (!r.ok) { this.send(ws, { type: "toast_error", message: r.err }); return; }
          this.send(ws, { type: "role_changed", id: opaqueId(target!), role: r.role || null });
          this.push(ws, session, { toast: r.role ? "Модерка выдана" : "Модерка снята" });
          const osid = this.social.onlineSid(target!); const oe = osid ? this.sessionLookup?.(osid) : null;
          if (oe) this.send(oe[0], { type: "my_role", role: r.role || null, admin: false });
        }).catch((e) => { console.error("[mc] role_set", e?.message || e); this.send(ws, { type: "toast_error", message: "Не удалось сохранить роль" }); });
        return true;
      }
      case "inspect_player": {
        const so = (ms.social = ms.social || { rating: 0, insp: [] });
        const t = Date.now();
        so.insp = so.insp.filter((x) => t - x < 60000);
        if ((so.insp.length && t - so.insp[so.insp.length - 1] < 700) || so.insp.length >= 12) { this.send(ws, { type: "inspect_err", message: "Слишком часто — подождите немного" }); return true; }
        so.insp.push(t);
        this.inspect(ws, session, msg).catch((e) => { console.error("[mc] inspect", e?.message || e); this.send(ws, { type: "inspect_err", message: "Персонаж недоступен" }); });
        return true;
      }
      // выбор цели кликом: сервер шлёт её точные ХП/макс. ХП/имя/уровень в zone_state (панель «Цель»)
      case "zone_target": { const id = Number(msg.id); (ms as any).target = Number.isFinite(id) && id > 0 ? id : 0; return true; }
      case "zone_attack": if (this.pvp.inDuel(session.id)) this.pvp.attack(ws, session, msg); else this.zoneAttack(ws, session, msg); return true;
      case "zone_ability": if (this.pvp.inDuel(session.id)) this.pvp.ability(ws, session, msg); else this.zoneAbility(ws, session, msg); return true;
      // PvP-дуэли (meta/pvp.ts): вызов, ответ, отмена своего вызова, сдача
      case "party_invite": case "party_respond": case "party_leave": case "party_kick": case "party_promote": case "party_get": this.partyMsg(ws, session, msg); return true;
      case "duel_challenge": this.pvp.challenge(ws, session, msg); return true;
      case "duel_respond":
        // «Не беспокоить 5 минут»: отказ + запрет вызовов на весь аккаунт (все герои, все вкладки) на 5 минут
        if (msg.dnd) { this.social.setDnd(ms.pkey, true).then((p) => this.send(ws, { type: "settings", settings: this.social.settingsView(p), toast: "Не беспокоить: 5 минут" })).catch(() => {}); msg.accept = false; }
        this.pvp.respond(ws, session, msg); return true;
      case "save_now": {
        // кнопка «Сохранить сейчас» у Алтаря перевоплощения (автосохранение тоже работает)
        if (!this.nearNpcOrAltar(session)) { this.send(ws, { type: "toast_error", message: "Сохранение — у Алтаря перевоплощения" }); return true; }
        const t = Date.now();
        if (t - ((ms as any).lastSaveNow || 0) < 3000) { this.send(ws, { type: "toast_error", message: "Только что сохранено" }); return true; }
        (ms as any).lastSaveNow = t;
        this.save(session);
        this.store.flush(ms.pkey).then(() => this.store.chain.get(ms.pkey)).then(() => {
          const ok = !this.store.lastFailed(ms.pkey);
          this.send(ws, { type: "saved", ok, message: ok ? "Сохранено ✓" : "Не удалось сохранить — повторим автоматически" });
        });
        return true;
      }
      case "online_get": case "friends_get": case "friend_add": case "friend_respond": case "friend_cancel": case "friend_remove": case "settings_set":
        this.social.handle(ws, session, ms, msg).catch((e) => { console.error("[mc] social", e?.message || e); this.send(ws, { type: "social_err", message: "Друзья временно недоступны" }); });
        return true;
      case "duel_cancel": this.pvp.cancel(ws, session); return true;
      case "duel_leave": this.pvp.leave(session, "forfeit"); return true;
      case "gather_start": ms.gather = { node: Number(msg.node), at: Date.now() }; return true;
      case "gather_done": this.gatherDone(ws, session, msg); return true;
      case "loot_open": this.lootOpen(ws, session, msg); return true;
      case "loot_take": this.lootTake(ws, session, msg); return true;
      case "dev_grant": {
        // Только для локальных тестов (MC_DEV_TRUST_USERID=1): выдать звёзды/опыт/предмет
        if (session.dev !== true) return true;
        // тесты рейтинга: выгрузить профиль в D1 и сбросить кэш рейтинга (обычно — не чаще раза в 60 с)
        if (msg.ratingRefresh) { this.save(session); (this.store.chain.get(ms.pkey) || Promise.resolve()).then(() => this.store.flush(ms.pkey)).then(() => { this.rating.at = 0; this.send(ws, { type: "dev_rating_reset" }); }); return true; }
        if (msg.stars) for (const [c, n] of Object.entries(msg.stars)) a.stars[c] = (a.stars[c] || 0) + Number(n);
        if (msg.xp && h) gainXp(h, Number(msg.xp));
        if (msg.killNear) { const z = this.zoneOf(session); const m = z?.mobs.filter((x: any) => !x.dead && !x.special).sort((p: any, q: any) => Math.hypot(p.x - session.x, p.y - session.y) - Math.hypot(q.x - session.x, q.y - session.y))[0];
          if (m && Math.hypot(m.x - session.x, m.y - session.y) < 400) { if (msg.cursed) m.cursed = true; z!.damage(m, session.id, m.hp + 1e6, (mm: any) => this.onMobKilled(mm)); } } // тест: настоящее убийство (обычный путь награды)
        if (msg.bag && typeof msg.bag === "object") { const items = (Array.isArray(msg.bag.items) ? msg.bag.items : []).filter((id: any) => ITEM_BY_ID[id]).slice(0, 30); const res: Record<string, number> = {}; for (const [r, n] of Object.entries(msg.bag.res || {})) if (RESOURCES[r]) res[r] = Math.max(1, Math.min(99, Number(n) || 1)); this.loot.drop(session.world || "hellfire", session.x + 50, session.y, ms.pkey, { items, res }, "dev", "mob", "dev"); }
        if (msg.flags) for (const f of Object.keys(msg.flags)) a.flags[f] = true;
        if (msg.item) addItem(a, String(msg.item), "grant:dev");
        // стресс-тест анти-дюпа: забить сумку, освободить слоты, точный счёт предметов (только dev)
        if (msg.fill && ITEM_BY_ID[msg.fill.id]) for (let i = 0; i < Math.min(200, Number(msg.fill.n) || 0); i++) if (!addItem(a, String(msg.fill.id), "grant:fill")) break;
        if (msg.freeSlots) { let n = Math.min(200, Number(msg.freeSlots) || 0); for (let i = a.inv.length - 1; i >= 0 && n > 0; i--) if (a.inv[i].src === "grant:fill") { a.inv.splice(i, 1); n--; } }
        if (msg.invCount) { const cnt: Record<string, number> = {}; for (const it of a.inv) cnt[it.id] = (cnt[it.id] || 0) + 1; this.send(ws, { type: "dev_inv", n: a.inv.length, cnt, uids: new Set(a.inv.map((i) => i.uid)).size, res: a.res }); }
        if (msg.res) for (const [r, n] of Object.entries(msg.res)) addRes(a, r, Number(n));
        // тесты: мировые боссы (spawnBosses — всех сразу, killBoss — ключ логова), бродячие (ambientNow — проверка сейчас)
        { const z = this.zoneOf(session) as any; if (z) {
          if (msg.spawnBosses) for (const b of z.gen.bosses) if (!z.bossIds[b.key || b.type]) z.bossAt[b.key || b.type] = 1;
          if (msg.killBoss) { const id = z.bossIds[msg.killBoss], m = id && z.byId.get(id); if (m && !m.dead) z.kill(m, (mm: any) => this.onMobKilled(mm)); }
          if (msg.ambientNow) z.ambNext.set(session.id, 0);
          if (msg.devStats) this.send(ws, { type: "dev_stats", amb: z.ambStats, ambient: z.mobs.filter((m: any) => m.ambient === session.id && !m.dead).map((m: any) => ({ id: m.id, type: m.type, elite: m.elite, x: Math.round(m.x), y: Math.round(m.y), tgt: m.targetSid === session.id })), bosses: z.bossStatus(Date.now()).slice(0, 80).map((x: any, i: number) => [...x, z.gen.bosses[i].x, z.gen.bosses[i].y]) });
        } }
        this.push(ws, session); return true;
      }
    }
    return false;
  }

  // Библиотека предметов и мобов (вкладки Книги). Сервер присылает данные ТОЛЬКО открытых предметов;
  // закрытые — силуэты (слот/редкость/ярус по номеру в пуле), без имени, статов, свойств и навыков.
  library(a: Account, heroes: any[] = []) {
    const items: Record<string, any> = {};
    const owned: Record<string, { n: number; srcs: string[] }> = {};
    for (const it of a.inv) { const o = (owned[it.id] = owned[it.id] || { n: 0, srcs: [] }); o.n++; if (it.src && !o.srcs.includes(it.src) && o.srcs.length < 6) o.srcs.push(it.src); }
    for (const [id, d] of Object.entries(a.disc.items)) {
      const c = itemCard(id);
      if (c) items[id] = { ...c, n: ITEM_INDEX[id], st: d.st, isNew: !d.v, first: d.src, owned: owned[id]?.n || 0, ownedSrc: owned[id]?.srcs || [] };
    }
    const known = (id: string) => !!a.disc.items[id];
    const mobs: Record<string, any> = {};
    for (const [id, b] of Object.entries(a.bestiary)) mobs[id] = { kills: b.kills || 0, isNew: !b.v, drops: mobDropView(id, known), st: mobStatView(id) }; // статы — с правками админки (как считает сервер)
    const feats = Object.fromEntries(Object.entries(a.disc.feats).map(([f, d]) => [f, { isNew: !d.v }]));
    // Кодекс навыков: ВСЕ навыки (героев, оружия R, монстров) с действующими (после правок админки) значениями и «открыт/нет»
    const lvlBy: Record<string, number> = {}; HERO_IDS.forEach((cls, i) => { const h = heroes[i]; if (h) lvlBy[cls] = h.lvl || 1; }); // навык героя открыт, когда уровень героя этого класса ≥ уровня открытия
    const mobSk = new Set<string>(); for (const id of Object.keys(a.bestiary)) for (const k of ((ZONE_MOBS as any)[id]?.skills || [])) mobSk.add(k);
    const codex = [
      ...Object.values(ABILITY_BY_ID).map((d: any) => ({ id: d.id, kind: d.cls === "monster" ? "trophy" : "hero", cls: d.cls, name: d.name, icon: d.icon, desc: d.desc, cd: d.cd, power: d.power, lvl: d.unlockLevel || 1, found: d.cls === "monster" ? mobSk.has(d.id) : (lvlBy[d.cls] || 0) >= (d.unlockLevel || 1) })),
      ...RUN_SKILLS.map((r) => ({ id: "rs:" + r.id, kind: "weapon", name: r.name, icon: r.icon, desc: r.desc, cd: RS_DEF["rs:" + r.id]?.cd ?? WEAPON_SKILL_CD, found: (a.runSkills || []).includes(r.id) })),
      ...Object.entries(MOB_SKILLS).filter(([id]) => !id.startsWith("rs:")).map(([id, m]) => ({ id: "mob:" + id, kind: "mob", name: m.name, icon: "👹", desc: "Навык монстров и боссов", cd: m.cd, found: mobSk.has(id) })),
    ];
    // Карточки экземпляров: действующий навык оружия (с источником) и выход разбора — с правками админки
    const inv: Record<string, any> = {};
    const eqUids = new Set<string>(); for (const h of heroes) for (const u of Object.values(h?.equip || {})) if (u) eqUids.add(String(u));
    for (const it of a.inv) { const e = effSkill(it); inv[it.uid] = { salv: salvageYield(it.id), ...(e ? { rs: e.rs, rsSrc: e.src } : {}) }; }
    // «Закреплён за»: ВСЕ виды оружия с этим действующим навыком (правка предмета > правка типа > выпавший у своих экземпляров),
    // но показаны только открытые в Библиотеке; закрытые — лишь счётчиком («???»)
    const { bound, hidden } = codexBound(a, eqUids);
    // открытое оружие с этим навыком открывает и карточку навыка
    for (const c of codex as any[]) { if (bound[c.id]?.length) c.found = true; if (bound[c.id]) c.bound = bound[c.id].sort((x, y) => +y.eq - +x.eq || x.name.localeCompare(y.name)); if (hidden[c.id]) c.boundHidden = hidden[c.id]; }
    return { size: SILHOUETTES.length, sil: SILHOUETTES, items, mobs, feats, codex, inv };
  }

  nearNpcOrAltar(session: any) {
    return (session.world || "hellfire") === "hellfire" && Math.hypot(session.x - 565, session.y - 600) <= 110;
  }

  // Вызывается из GameRoom после select_class (Алтарь): герой выбран — прогресс применяется к нему
  onSelectHero(ws: WebSocket, session: any) {
    const ms = this.ms.get(session.id);
    if (!ms) return;
    const a = this.store.account(ms.pkey);
    const prev = a.hero;
    a.hero = session.stats.classId;
    this.store.hero(ms.pkey, a.hero!);
    // смена души: всё прошлого героя (сумка, 4 надетых, прогресс) — в D1 сразу, не ждём автосохранения
    if (prev && prev !== a.hero) { this.save(session); this.store.flush(ms.pkey).catch(() => {}); }
    this.qev(a, session, { type: "select_hero" });
    this.autoTurnInPrologue(a, session);
    this.refreshZonePlayer(session);
    ms.zp.hp = ms.zp.maxHp;
    this.push(ws, session);
  }
  onWorldChange(ws: WebSocket, session: any) {
    const ms = this.ms.get(session.id);
    if (!ms) return;
    ms.zp.x = session.x; ms.zp.y = session.y;
    const a = this.store.account(ms.pkey);
    if (this.qev(a, session, { type: "reach", world: session.world }).length) { this.autoTurnInPrologue(a, session); this.push(ws, session); }
  }
  autoTurnInPrologue(a: Account, session: any) {
    const ms = this.ms.get(session.id)!;
    const cls = session.stats?.classId;
    for (const id of Object.keys(a.quests.active)) {
      const q = QUEST_BY_ID[id];
      if (q && q.campaign === "prologue" && questComplete(a, id) && q.objectives.every((o) => o.type !== "talk")) turnInQuest(a, cls ? this.store.hero(ms.pkey, cls) : null, id);
    }
  }
  onRunJoin(session: any, room: string, members: number) {
    const ms = this.ms.get(session.id);
    if (ms) ms.run = { room, at: Date.now(), cls: session.stats?.classId || null, maxMembers: members, usedAbility: false };
  }
  onRunMembers(room: string, members: any[]) {
    for (const s of members) { const ms = this.ms.get(s.id); if (ms?.run && ms.run.room === room) ms.run.maxMembers = Math.max(ms.run.maxMembers, members.length); }
  }

  // Награда за забег/мини-игру: ТОЛЬКО то, что посчитал сервер (см. REWARD_RULES в defs.ts)
  async runResult(ws: WebSocket, session: any, msg: any, ctx: { runMembers: (room: string) => any[] }) {
    const ms = this.ms.get(session.id)!;
    const run = ms.run;
    if (!run || !session.runRoom || run.room !== session.runRoom) { this.send(ws, { type: "toast_error", message: "Нет активного забега для награды" }); return; }
    const now = Date.now();
    const realSec = (now - run.at) / 1000;
    const time = Math.max(0, Math.min(Number(msg.time) || 0, realSec + 2));
    ms.run = { ...run, at: now, maxMembers: ctx.runMembers(run.room).length }; // одна награда на окно времени
    // один итог на забег (run_id = игрок + комната + начало окна) — повтор отклоняет база (PRIMARY KEY)
    const runId = `${ms.pkey}|${run.room}|${run.at}`;
    const claimedKills: number = Object.values(msg.kills || {}).reduce((x: number, y: any) => x + Math.max(0, Math.floor(Number(y) || 0)), 0) as number;
    const fresh = await this.store.recordRun(ms.pkey, { runId, room: run.room, startedAt: run.at, endedAt: now, serverTime: Math.round(realSec), kills: Math.min(claimedKills, 1e6), xp: 0,
      flags: { claimedTime: Number(msg.time) || 0, cappedTime: Math.round(time), maxKills: Math.floor(time * REWARD_RULES.runMaxKillsPerSecond), claimedKills } });
    if (!fresh) { this.store.audit(ms.pkey, "reject", `rundup:${runId}`, { why: "duplicate run_result" }); return; }
    if (!this.ms.has(session.id)) return;
    const a = this.store.account(ms.pkey);
    const cls = session.stats?.classId || null;
    const h = cls ? this.store.hero(ms.pkey, cls) : null;
    const players = Math.max(run.maxMembers, ctx.runMembers(run.room).length);
    const out: any = { xp: 0, items: [], res: {}, room: run.room, time: Math.round(time) };
    const mode = MINIGAMES[run.room] ? run.room : "run";
    if (mode === "run") {
      const maxKills = Math.floor(time * REWARD_RULES.runMaxKillsPerSecond);
      const kills: Record<string, number> = {};
      let total = 0;
      for (const [type, n] of Object.entries(msg.kills || {})) {
        const k = Math.max(0, Math.floor(Number(n) || 0));
        const take = Math.min(k, maxKills - total);
        if (take <= 0) break;
        kills[type] = take; total += take;
      }
      // опыт забега масштабируется уровнем героя (как фарм в мире): минуты × N «мобов своего уровня», с потолком по времени
      const per = mobXp(h?.lvl || 1);
      const mins = Math.min(REWARD_RULES.runMaxMinutes, time / 60);
      out.xp = Math.round(Math.min(REWARD_RULES.runMaxMinutes * REWARD_RULES.runXpPerMinute * 1.25, mins * REWARD_RULES.runXpPerMinute + total * REWARD_RULES.runXpPerKill) * per);
      // броски дропа по трофеям убитых (ограничено по числу бросков)
      let rolls = 0;
      for (const [type, n] of Object.entries(kills)) {
        const key = RUN_LOOT_KEY[type];
        if (!key || !MONSTER_LOOT[key]) continue;
        noteMob(a, key, n);
        for (let i = 0; i < n && rolls < REWARD_RULES.runMaxLootRolls; i++, rolls++) this.grantLoot(a, rollMonsterLoot(key), out, `run:${run.room}:${key}`);
      }
      const bosses = Math.min(Math.floor(time / 300), Math.max(0, Math.floor(Number(msg.bossKills) || 0)));
      const boss = RUN_BOSS_BY_ROOM[run.room] || "warden";
      for (let i = 0; i < bosses; i++) {
        noteMob(a, boss, 1);
        this.grantLoot(a, rollMonsterLoot(boss), out, `run:${run.room}:${boss}`);
        this.qev(a, session, { type: "kill_boss", mob: boss, usedAbility: true });
      }
      this.qev(a, session, { type: "run", room: run.room, time, cls, players });
    } else if (mode === "duel") {
      const won = !!msg.won && time >= 10;
      out.xp = won ? REWARD_RULES.duel.winXp : (time >= 10 ? REWARD_RULES.duel.lossXp : 0);
      if (won) this.qev(a, session, { type: "duel_win", hpCapPct: Math.max(1, Math.min(100, Number(msg.hpCapPct) || 100)) });
    } else if (mode === "trial") {
      const waves = Math.min(REWARD_RULES.trial.maxWaves, Math.floor(time / 20), Math.max(0, Math.floor(Number(msg.wave) || 0)));
      out.xp = waves * REWARD_RULES.trial.perWaveXp;
      out.waves = waves;
    }
    if (h && out.xp) out.levelUps = gainXp(h, out.xp);
    this.store.audit(ms.pkey, "run_reward", `run:${runId}`, { xp: out.xp, items: out.items.map((i: any) => i.id), res: out.res, time: out.time }, { qty: out.xp, source: `run:${run.room}` });
    this.push(ws, session, { reward: out });
  }

  grantLoot(a: Account, loot: { items: string[]; res: Record<string, number> }, out: any, src = "?") {
    for (const id of loot.items) { const it = addItem(a, id, src); if (it) { out.items.push(it); (out.cards = out.cards || {})[id] = itemCard(id); } }
    for (const [r, n] of Object.entries(loot.res)) { addRes(a, r, n); out.res[r] = (out.res[r] || 0) + n; }
  }

  // ---------- личный портал домой ----------
  // Открыть: только Аринар, жив, не в бою (6 с), не чаще раза в 90 с, один активный портал на героя (D1 heroes.home_portal).
  homePortal(session: any, op: "open" | "enter" | "back"): { ok: true; x: number; y: number; world: string } | { ok: false; err: string } {
    const ms = this.ms.get(session.id), cls = session.stats?.classId; if (!ms || !cls) return { ok: false, err: "Сначала выберите героя" };
    const h = this.store.hero(ms.pkey, cls), now = Date.now(), P = h.portal || {};
    if (session.runRoom || session.inDuel || (session as any).pvp) return { ok: false, err: "Не во время забега или дуэли" };
    if (!ms.zp.alive) return { ok: false, err: "Нельзя, пока вы повержены" };
    if (op === "open") {
      if (session.world !== "arinar") return { ok: false, err: "Портал домой открывается только в Аринаре" };
      if (P.x != null) return { ok: false, err: "Портал уже открыт — сначала вернитесь через него" };
      if ((P.cd || 0) > now) return { ok: false, err: `Портал перезаряжается: ${Math.ceil(((P.cd || 0) - now) / 1000)} с` };
      if (now - Math.max((ms as any).hurtAt || 0, (ms as any).hitAt || 0) < HOME_PORTAL_COMBAT_MS) return { ok: false, err: "Нельзя открыть портал в бою" };
      h.portal = { x: Math.round(session.x), y: Math.round(session.y), at: now, cd: now + HOME_PORTAL_CD_MS };
    } else if (op === "enter") { // портал в поле ещё раз ведёт домой
      if (session.world !== "arinar" || P.x == null || Math.hypot(session.x - P.x, session.y - (P.y || 0)) > 90) return { ok: false, err: "Подойдите к своему порталу" };
    } else {
      if ((session.world || "hellfire") !== "hellfire" || Math.hypot(session.x - HOME_PORTAL_HUB.x, session.y - HOME_PORTAL_HUB.y) > 90) return { ok: false, err: "Подойдите к своему порталу в хабе" };
      if (P.x == null) return { ok: false, err: "Нет открытого портала" };
      const back = { x: P.x, y: P.y || 0 };
      h.portal = { cd: P.cd }; // одноразовый: после возврата закрыт
      ms.dirty = true; this.save(session);
      return { ok: true, world: "arinar", ...back };
    }
    ms.dirty = true; this.save(session);
    return { ok: true, world: "hellfire", x: HOME_PORTAL_HUB.x + 50, y: HOME_PORTAL_HUB.y + 40 };
  }

  // ---------- добыча на земле ----------
  private bagView(b: Bag, ms: MetaSess) {
    const cards: Record<string, any> = {};
    for (const e of b.entries) if (e.k === "item" && !ms.cards.has(e.id)) { const c = itemCard(e.id); if (c) { cards[e.id] = c; ms.cards.add(e.id); } }
    return { type: "loot_bag", id: b.id, x: b.x, y: b.y, exp: b.exp, entries: b.entries, cards };
  }
  lootOpen(ws: WebSocket, session: any, msg: any) {
    const ms = this.ms.get(session.id); if (!ms || !this.zoneOf(session)) return;
    const b = this.loot.access(msg.bag, ms.pkey, session.world || "hellfire", session.x, session.y);
    if (typeof b === "string") { this.send(ws, { type: "loot_err", id: Number(msg.bag), message: b }); return; }
    this.send(ws, this.bagView(b, ms));
  }
  lootTake(ws: WebSocket, session: any, msg: any) {
    const ms = this.ms.get(session.id); if (!ms || !this.zoneOf(session)) return;
    const b = this.loot.access(msg.bag, ms.pkey, session.world || "hellfire", session.x, session.y);
    if (typeof b === "string") { this.send(ws, { type: "loot_err", id: Number(msg.bag), message: b }); return; }
    const lids = msg.all === true ? "all" : Array.isArray(msg.lids) ? msg.lids.slice(0, 40) : [];
    const budget = this.loot.admit(ms.pkey, lids === "all" ? b.entries.length : lids.length);
    if (!budget) { this.send(ws, { type: "loot_err", id: b.id, message: "Не так быстро" }); return; }
    const a = this.store.account(ms.pkey);
    const out: any = { xp: 0, items: [], res: {}, fromBag: b.id };
    const r = this.loot.take(b, lids, (e) => {
      if (e.k === "res") { addRes(a, e.id, e.n); out.res[e.id] = (out.res[e.id] || 0) + e.n; return true; }
      const it = addItem(a, e.id, b.src); if (!it) return false; // сумка полна — позиция остаётся в мешке
      out.items.push(it); (out.cards = out.cards || {})[e.id] = itemCard(e.id); return true;
    }, budget);
    // редкое оружие несёт навык «Вампир-лайка» (бросок при подборе, только сервер)
    for (const it of out.items) {
      const rs = rollRunSkill(a, it, b.kind as any);
      if (rs) { out.runSkill = { ...RUN_SKILL_BY_ID[rs], from: it.id, uid: it.uid };
        this.zones[session.world || "hellfire"]?.events.push({ k: "announce", text: `${RUN_SKILL_BY_ID[rs].icon} ${session.username || "Игрок"} постигает навык «${RUN_SKILL_BY_ID[rs].name}»!`, color: "#fde68a" }); break; }
    }
    const epic = out.items.find((it: any) => ["epic", "legendary", "mythic"].includes(ITEM_BY_ID[it.id]?.rarity));
    if (epic) this.zones[session.world || "hellfire"]?.events.push({ k: "announce", text: `💎 ${session.username || "Игрок"} добывает «${ITEM_BY_ID[epic.id].name}»!`, color: "#f0abfc" });
    if (r.got.length) { ms.dirty = true; this.push(ws, session, { loot: out }); }
    this.send(ws, { ...this.bagView(b, ms), taken: r.got.map((e) => e.lid), full: r.full || undefined, gone: !r.left || undefined });
  }

  // ---------- открытый мир ----------
  zoneOf(session: any): Zone | null {
    if (session.runRoom || session.inDuel) return null;
    return this.zones[session.world || "hellfire"] || null;
  }
  // Базовая атака в открытом мире — по клику в направлении курсора (или кнопкой атаки с автонаведением на телефоне).
  // Сервер проверяет кд (скорость атаки), направление (единичный вектор), дальность и форму удара оружия.
  // Старые клиенты могут прислать {mob} без направления — тогда направление считается на этого моба.
  /** id надетых предметов героя (для черт из админ-панели) */
  /** то же без готового аккаунта (дуэли) */
  equippedOf(session: any): string[] { const ms = this.ms.get(session.id); if (!ms) return []; const a = this.store.account(ms.pkey); return a ? this.equippedIds(session, a) : []; }
  equippedIds(session: any, a: Account): string[] {
    const ms = this.ms.get(session.id), cls = session.stats?.classId; if (!ms || !cls) return [];
    const h = this.store.hero(ms.pkey, cls); const uids = new Set(Object.values(h?.equip || {}));
    return a.inv.filter((i: any) => uids.has(i.uid)).map((i: any) => i.id);
  }
  /** черты (поджог/яд/кровотечение/заморозка/замедление/отбрасывание/вампиризм) — только сервер */
  traitHit(zone: any, m: any, session: any, ms: any, real: number, traits: any[]) {
    if (!traits.length) return;
    applyTraits(traits, real, cryptoRand, {
      dot: (kind, dps, dur) => zone.applyStatus(m, session.id, { kind, dps, dur }, session.x, session.y),
      slow: () => zone.applyStatus(m, session.id, { slow: true }, session.x, session.y),
      knock: (p) => zone.applyStatus(m, session.id, { knock: p }, session.x, session.y),
      freeze: (t) => { m.frozenUntil = Date.now() + (ZONE_MOBS[m.type]?.boss ? Math.min(600, t) : t); },
      heal: (hp) => { ms.zp.hp = Math.min(ms.zp.maxHp, ms.zp.hp + hp); },
    });
  }
  zoneAttack(ws: WebSocket, session: any, msg: any) {
    const ms = this.ms.get(session.id)!;
    const zone = this.zoneOf(session);
    if (!zone || !ms.zp.alive) return;
    const eff = this.effective(session);
    const now = Date.now();
    const wt = eff.wtype || "book";
    // точка вылета = отрисованный центр героя у клиента (в допуске SHOT_TOL от серверной позиции), прицел — точка курсора;
    // автоатака по выбранной цели (msg.mob): сервер сам целит в ТЕКУЩУЮ позицию этого моба, если он в досягаемости
    const [blo, bhi] = worldBounds(session.world);
    const aimR = shotAim(session.x, session.y, msg, blo, bhi);
    const ox = aimR.x, oy = aimR.y;
    ms.zp.x = ox; ms.zp.y = oy;
    const W = WEAPON_TYPES[wt] || WEAPON_TYPES.book;
    // темп удара по оружию: допуск 15% на сетевой джиттер, но средний темп не выше cd (следующий слот = max(now, прежний) + cd)
    const atkCd = W.cd / (1 + Math.max(0, eff.atkSpeedPct || 0) / 100);
    if (now < ms.lastAtk - atkCd * 0.15) return;
    let dx = aimR.dx, dy = aimR.dy;
    const lockId = Number(msg.mob);
    if (lockId) { // выбранная цель: точно в неё (сервер-авторитет: моб жив и в пределах дальности оружия ×1.6)
      const m0 = zone.byId.get(lockId);
      if (m0 && !m0.dead && Math.hypot(m0.x - ox, m0.y - oy) <= Math.max(160, W.atk.range * 1.6)) { dx = m0.x - ox; dy = m0.y - oy; }
    }
    if (Math.hypot(dx, dy) < 0.01) return;
    const L = Math.hypot(dx, dy) || 1; dx /= L; dy /= L;
    ms.lastAtk = Math.max(now, ms.lastAtk) + atkCd; // lastAtk хранит момент следующего разрешённого удара
    ms.wt = wt;
    // ближний бой (дуга) — мгновенно; стрелковое оружие (снаряд/линия) — НАСТОЯЩИЕ снаряды сервера: урон при попадании
    const reach = W.atk.kind === "arc" ? W.atk.range * 0.8 : W.atk.range;
    const per = (W.atk.count || 1) > 1 ? W.atk.per || 1 / (W.atk.count || 1) : 1;
    const a = this.store.account(ms.pkey);
    const statused = new Set<number>();
    const traits = traitsFor(wt, this.equippedIds(session, a));
    const applyHit = (m: any, k: number) => {
      if (m.dead || !ms.zp.alive && W.atk.kind === "arc") return;
      if (!a.bestiary[baseOf(m.type)]) { noteMob(a, baseOf(m.type), 0); ms.dirty = true; }
      const crit = cryptoRand() * 100 < eff.critPct;
      const raw = eff.weaponMin + cryptoRand() * (eff.weaponMax - eff.weaponMin);
      const dmg = raw * (1 + eff.dmgPct / 100) * (crit ? 1.75 : 1) * k;
      const real = zone.damage(m, session.id, dmg, (mm) => this.onMobKilled(mm)) || 0;
      this.noteHit(session, real, m.type);
      if (!m.dead && !statused.has(m.id) && statused.add(m.id)) zone.applyStatus(m, session.id, { kind: W.status.kind, dps: W.status.dpsPct ? real * W.status.dpsPct / 100 : 0, dur: W.status.dur, slow: W.status.slow, knock: W.status.knock }, ox, oy);
      if (eff.lifestealPct && real) ms.zp.hp = Math.min(ms.zp.maxHp, ms.zp.hp + real * eff.lifestealPct / 100);
      if (real && !m.dead) this.traitHit(zone, m, session, ms, real, traits);
      if (crit) zone.events.push({ k: "crit", id: m.id, x: m.x, y: m.y });
    };
    for (const [vx, vy] of volleyDirs(W.atk, dx, dy)) {
      if (W.atk.kind === "arc") {
        const targets = zone.targetsInDir(ms.zp, vx, vy, W.atk);
        zone.events.push({ k: "shot", sid: session.id, x: Math.round(ox), y: Math.round(oy), tx: Math.round(ox + vx * reach), ty: Math.round(oy + vy * reach), w: wt });
        targets.forEach((m, i) => applyHit(m, per * (i === 0 ? 1 : 0.8)));
      } else {
        const line = W.atk.kind === "line";
        zone.fire({ o: "p", sid: session.id, t: AUTO_SPRITE[wt] || "auto_staff", x: ox, y: oy, cid: Number(msg.cid) || undefined, dx: vx, dy: vy, range: W.atk.range, w: W.atk.width || 20, max: line ? W.atk.max || 1 : 1,
          onHit: (m: any, i: number) => applyHit(m, per * (i === 0 ? 1 : line ? 0.7 : 0.8)) });
      }
    }
  }

  // Рекорд одиночного удара: только удары, посчитанные сервером в открытом мире (см. rating.ts)
  noteHit(session: any, real: number, mobType: string) {
    { const m0 = this.ms.get(session.id); if (m0) (m0 as any).hitAt = Date.now(); } // бой — для портала домой
    const ms = this.ms.get(session.id);
    const cls = session.stats?.classId;
    if (!ms || !cls || !(real > 0)) return;
    const h = this.store.hero(ms.pkey, cls);
    if (real <= (h.md || 0)) return;
    h.md = Math.round(real); h.mdAt = Date.now(); h.mdW = `${session.world || "hellfire"}:${mobType}`;
    ms.dirty = true;
  }

  // Просмотр персонажа: онлайн-игрок (sid сессии в этой комнате) или строка рейтинга (непрозрачный id)
  async inspect(ws: WebSocket, session: any, msg: any) {
    let pkey: string | null = null, cls: string | null = null, nick = "";
    if (msg.sid) {
      const e = this.sessionLookup?.(String(msg.sid));
      const tms = e ? this.ms.get(e[1].id) : null;
      if (!e || !tms) { this.send(ws, { type: "inspect_err", message: "Игрок не в сети" }); return; }
      pkey = tms.pkey; nick = e[1].username || "";
      cls = e[1].stats?.classId || this.store.account(pkey).hero || null;
    } else if (msg.id) {
      pkey = this.rating.byId.get(String(msg.id)) || this.social.ids.get(String(msg.id)) || null;
      if (!pkey) { await this.rating.ensure(); pkey = this.rating.byId.get(String(msg.id)) || null; }
      if (!pkey) { this.send(ws, { type: "inspect_err", message: "Персонаж не найден — обновите рейтинг" }); return; }
      cls = msg.hero && (HERO_IDS as readonly string[]).includes(msg.hero) ? String(msg.hero) : null;
      // игрок в сети: имя как в мире (ник сессии / «Гость» Имя)
      const osid = this.social.onlineSid(pkey); const oe = osid ? this.sessionLookup?.(osid) : null;
      if (oe) nick = this.displayName(oe[1]);
    }
    if (!pkey) { this.send(ws, { type: "inspect_err", message: "Не выбран персонаж" }); return; }
    await this.roles.ensure();
    const roleX = { role: this.roles.of(pkey), canMod: this.roles.isAdmin(this.ms.get(session.id)) && pkey.startsWith("uid:") && this.roles.of(pkey) !== "admin" || undefined };
    // имя: зарегистрированные — из таблицы сайта users, гости — «Гость #xxxx»
    if (pkey.startsWith("uid:") && !this.rating.names.has(pkey)) await this.rating.loadNames([pkey]);
    let name = pkey.startsWith("uid:") ? this.rating.names.get(pkey) || nick || "Игрок" : guestName(pkey, this.store.accounts.get(pkey)?.gname || this.rating.gnames.get(pkey));
    let a: Account, h: any;
    if (this.store.accounts.has(pkey)) {
      a = this.store.account(pkey);
      cls = cls || a.hero;
      if (!cls) { this.send(ws, { type: "inspect", ...roleX, id: opaqueId(pkey), name, cls: null, lvl: 0, gear: [], stats: null, abilities: [], maxDmg: null }); return; }
      h = this.store.hero(pkey, cls);
    } else {
      const p = this.store.db ? await loadPublicProfile(this.store.db, pkey) : null;
      if (!p) { this.send(ws, { type: "inspect_err", message: "Персонаж не найден" }); return; }
      a = p.a; cls = cls || a.hero;
      if (pkey.startsWith("guest:")) name = guestName(pkey, a.gname);
      if (!cls) { this.send(ws, { type: "inspect", ...roleX, id: opaqueId(pkey), name, cls: null, lvl: 0, gear: [], stats: null, abilities: [], maxDmg: null }); return; }
      h = p.heroes[cls];
    }
    const duel = await this.duelRecord(pkey);
    this.send(ws, { type: "inspect", id: opaqueId(pkey), sid: msg.sid || undefined, ...publicCharacter(name, cls, a, h, heroBase(cls)), duel, ...roleX });
  }

  /** Слот R: любой навык игры (оружия, героя, монстров) — форма из общих abilityShapes, кд/сила — rsInfo. */
  rsAbility(rs: string | null): any {
    const I = rsInfo(rs); if (!I) return null;
    return { id: "rs:" + rs, cast: I.castId, rsSlot: true, cd: I.cd, power: I.power, props: [] };
  }
  rsAbilityOf(session: any): any {
    const ms = this.ms.get(session.id); const cls = session.stats?.classId; if (!ms || !cls) return null;
    return this.rsAbility(weaponSkill(this.store.account(ms.pkey), this.store.hero(ms.pkey, cls)));
  }
  zoneAbility(ws: WebSocket, session: any, msg: any) {
    const ms = this.ms.get(session.id)!;
    const zone = this.zoneOf(session);
    if (!zone || !ms.zp.alive) return;
    const eff = this.effective(session);
    // 4-й слот (R): навык надетого оружия — сервер сам берёт его с экипировки, клиент лишь просит "rs"
    let ab: any = eff.abilities.find((x: any) => x.id === msg.id);
    if (!ab && msg.id === "rs") {
      const cls = session.stats?.classId; const a0 = this.store.account(ms.pkey);
      const rs = cls ? weaponSkill(a0, this.store.hero(ms.pkey, cls)) : null;
      ab = this.rsAbility(rs);
    }
    if (!ab) return;
    const now = Date.now();
    // подтверждение перезарядки для панели навыков клиента (сервер — источник правды)
    const cdKey = ab.rsSlot ? "rs" : ab.id; // перезарядка слота R общая (смена оружия её не сбрасывает)
    if ((ms.abilCd[cdKey] || 0) > now) { this.send(ws, { type: "ability_cd", id: ab.id, left: ms.abilCd[cdKey] - now, cd: ab.cd, ok: false }); return; }
    ms.abilCd[cdKey] = now + ab.cd * 1000;
    this.send(ws, { type: "ability_cd", id: ab.id, left: ab.cd * 1000, cd: ab.cd, ok: true });
    const [blo, bhi] = worldBounds(session.world);
    const aimR = shotAim(session.x, session.y, msg, blo, bhi); // вылет из отрисованного центра героя (в допуске), прицел — курсор
    if (aimR.client) { session.x = aimR.x; session.y = aimR.y; }
    ms.zp.x = session.x; ms.zp.y = session.y;
    const def = ABILITY_BY_ID[ab.id];
    // в открытом мире навыки — упрощённая область; каждый модификатор из дерева талантов (t_*) даёт +15% радиуса и урона
    const tmods = ab.props.filter((p: string) => p.startsWith("t_")).length;
    const radiusMult = (ab.props.includes("extend") ? 200 / 140 : 1) * (1 + 0.15 * tmods);
    const avg = (eff.weaponMin + eff.weaponMax) / 2;
    const dmg = avg * Math.max(0.6, Math.min(4, ab.power)) * 2.2 * (1 + eff.dmgPct / 100) * (1 + 0.15 * tmods);
    // направление от клиента — только единичный вектор; дальность/цели/позиции — сервер (meta/abilityShapes.ts)
    let dx = aimR.dx, dy = aimR.dy;
    if (Math.hypot(dx, dy) < 0.01) { dx = 0; dy = 1; }
    const world = session.world || "hellfire";
    const sid = session.id;
    const dealt = castShape(ab.cast || ab.id, {
      zone, sid, x: session.x, y: session.y, dx, dy, now, dmg, radiusMult, props: ab.props, here: () => [session.x, session.y],
      fire: (o) => zone.fire({ ...o, o: "p", sid }), // настоящие снаряды навыков
      hit: (m, mult, opts) => {
        if (m.dead) return 0;
        m.usedAbility.add(sid);
        const d = ZONE_MOBS[m.type];
        const raw = dmg * mult * (opts?.pierceArmor && d?.armor ? 1 + Math.min(0.5, d.armor / 100) : 1);
        const real = zone.damage(m, sid, raw, (mm: any) => this.onMobKilled(mm)) || 0;
        this.noteHit(session, real, m.type);
        if (real && !m.dead) this.traitHit(zone, m, session, ms, real, traitsFor(null, [], ab.id));
        return real;
      },
      status: (m, st, fx, fy) => { if (st.dot) zone.applyStatus(m, sid, st.dot, fx, fy); if (st.slow || st.knock) zone.applyStatus(m, sid, { slow: st.slow, knock: st.knock }, fx, fy); if (st.freeze) { m.frozenUntil = Date.now() + (ZONE_MOBS[m.type]?.boss ? 600 : st.freeze); } },
      move: (x, y) => { session.x = x; session.y = y; ms.zp.x = x; ms.zp.y = y; (session as any).lastMoveAt = Date.now(); this.send(ws, { type: "ability_move", x: Math.round(x), y: Math.round(y) }); },
      bounds: (x, y) => { const [lo, hi] = worldBounds(world); return [Math.max(lo, Math.min(hi, x)), Math.max(lo, Math.min(hi, y))]; },
      buff: (b) => {
        const t = Date.now();
        if (b.invuln) (ms as any).invulnUntil = Math.max((ms as any).invulnUntil || 0, t + b.invuln);
        if (b.dr) (ms as any).drUntil = Math.max((ms as any).drUntil || 0, t + b.dr);
        if (b.heal) ms.zp.hp = Math.min(ms.zp.maxHp, ms.zp.hp + b.heal);
      },
      later: (ms2, fn) => this.fx.push({ at: Date.now() + ms2, world, sid, fn }),
      ev: (e) => zone.events.push(e),
    });
    if (ab.props.includes("vamp")) ms.zp.hp = Math.min(ms.zp.maxHp, ms.zp.hp + dealt * 0.08);
    void def;
    const a = this.store.account(ms.pkey);
    if (this.qev(a, session, { type: "ability_used" }).length) this.send(ws, { type: "toast_error", message: "Звёздный квест: навык применён — прогресс «без навыков» сброшен" });
  }

  gatherDone(ws: WebSocket, session: any, msg: any) {
    const ms = this.ms.get(session.id)!;
    const zone = this.zoneOf(session);
    if (!zone || !ms.gather || ms.gather.node !== Number(msg.node)) return;
    ms.zp.x = session.x; ms.zp.y = session.y;
    const n = zone.gatherCheck(ms.zp, ms.gather.node, ms.gather.at, Date.now());
    ms.gather = null;
    if (!n) { this.send(ws, { type: "toast_error", message: "Сбор прерван" }); return; }
    n.readyAt = Date.now() + n.respawn * 1000;
    const qty = n.qty[0] + Math.floor(cryptoRand() * (n.qty[1] - n.qty[0] + 1));
    const a = this.store.account(ms.pkey);
    addRes(a, n.res, qty);
    this.qev(a, session, { type: "gather", res: n.res, n: qty });
    this.push(ws, session, { gathered: { res: n.res, n: qty } });
  }

  onMobKilled(m: any) {
    const d = ZONE_MOBS[m.type];
    const total = [...m.dmgBy.values()].reduce((x: number, y: number) => x + y, 0) || 1;
    // мешок — ОДИН: больше всех урона, с шансом 10% — добившему (сервер); видит и открывает только владелец
    const bagOwner = pickBagOwner(m.dmgBy, m.killer, cryptoRand);
    // Отряд (в духе Albion): награду получают и члены отряда рядом с мобом (≤1500 px, тот же мир), даже без урона.
    // Опыт — каждому своя доля: killXp × (1 + 10% за каждого сверх первого) / n; мешок владельца делится между членами рядом.
    const world: string | null = null; // мир — по участнику (моб в том же мире, что и бивший его)
    const recv = new Map<string, number>(); // sid → размер группы для дележа
    const grpOf = new Map<string, string[]>();
    for (const [sid, dmg] of m.dmgBy as Map<string, number>) {
      if (!d.boss && !d.rare && dmg / total < 0.15 && sid !== bagOwner) continue; // вклад ≥15% (босс/редкий — любой вклад)
      const me = this.partyPos(sid); if (!me) continue;
      const grp = this.party.near(sid, world || me.world, m.x, m.y, this.partyPos);
      for (const g of grp) { recv.set(g, Math.max(recv.get(g) || 1, grp.length)); grpOf.set(g, grp); }
      if (!grp.includes(sid)) { recv.set(sid, 1); grpOf.set(sid, [sid]); }
    }
    const ownerGrp = grpOf.get(bagOwner) || [bagOwner];
    let split: Map<string, { items: string[]; res: Record<string, number> }> | null = null;
    for (const sid of recv.keys()) {
      const ms = this.ms.get(sid);
      const entry = this.sessionLookup?.(sid);
      if (!ms || !entry) continue;
      const [ws, session] = entry;
      const a = this.store.account(ms.pkey);
      const cls = session.stats?.classId || null;
      const h = cls ? this.store.hero(ms.pkey, cls) : null;
      const base = baseOf(m.type); // вариант биома → трофеи/бестиарий/квесты базового Отголоска
      noteMob(a, base, 1);
      const lootKey = MONSTER_LOOT[m.type] ? m.type : base; // у каждого моба своя (правимая в админке) таблица
      // опыт: по уровню моба с поправкой на разницу уровней (серые мобы почти ничего не дают)
      const n = recv.get(sid) || 1;
      const xp = Math.round(killXp({ xp: d.xp, mobL: d.lvl || 1, heroL: h?.lvl || 1, elite: m.elite, cursed: m.cursed, boss: !!d.boss }) * partyXpShare(n)); // balance.killXp: серые — 0, сильные — больше с потолком; отряд — доля
      const out: any = { xp, items: [], res: {}, mob: m.type, elite: !!m.elite, cursed: !!m.cursed, party: n > 1 ? n : undefined };
      if (h && xp > 0) out.levelUps = gainXp(h, xp);
      const src = `${d.boss ? "boss" : d.rare ? "rare" : "kill"}:${m.type}`;
      const lootMul = m.cursed ? ZONE_GEN.cursedLoot : 1; // проклятый: шансы дропа ×10 (только сервер)
      // добыча НЕ в сумку: личный мешок на земле у трупа (открыть кликом/E, забрать по одному, Shift-проводкой или всё)
      if (!split && ownerGrp.includes(sid)) { // один бросок на убийство (как раньше), затем — делёж в отряде владельца мешка
        const roll = rollMonsterLoot(lootKey, cryptoRand, lootMul);
        if (m.elite) { const l2 = rollMonsterLoot(lootKey, cryptoRand, lootMul); roll.items.push(...l2.items); for (const [r, k] of Object.entries(l2.res)) roll.res[r] = (roll.res[r] || 0) + k; } // элита: второй бросок
        split = splitLoot(roll, ownerGrp.filter((g) => recv.has(g)), cryptoRand);
      }
      const loot = split?.get(sid) || { items: [] as string[], res: {} as Record<string, number> };
      const bag = this.loot.drop(session.world || "hellfire", m.x, m.y, ms.pkey, loot, src, d.boss ? "boss" : d.rare || m.elite ? "rare" : "mob", m.type);
      if (bag) out.bag = { id: bag.id, n: bag.entries.length, x: bag.x, y: bag.y };
      this.qev(a, session, { type: "kill", mob: base, cls });
      if (d.boss) this.qev(a, session, { type: "kill_boss", mob: base, usedAbility: m.usedAbility.has(sid) });
      this.push(ws, session, { loot: out });
    }
  }
  sessionLookup: ((sid: string) => [WebSocket, any] | null) | null = null;
  party!: Parties; partyAt = 0; regAt = 0;
  /** пересобрать лагеря локаций, чьи настройки плотности изменились (админка → D1 → applyOverride на этом экземпляре) */
  syncRegions() {
    for (const z of Object.values(this.zones as any) as any[]) z?.syncMobSkills?.(); // навыки мобов из админки — сразу у живых
    const z: any = (this.zones as any).arinar; if (!z?.gen?.camps) return;
    for (const r of z.gen.regions) { if (!r.table?.length) continue;
      if (z.regBuilt[r.id] !== regSig(r)) { const n = z.regenRegion(r.id); console.log(`[mc] регион ${r.id}: лагеря пересобраны (снято ${n})`); }
    }
  }
  ally(a: string, b: string) { return this.party.ally(a, b); }
  /** позиция участника (для дележа/портала): мир, x, y, жив ли в мире */
  partyPos = (sid: string) => { const e = this.sessionLookup?.(sid); if (!e) return null; const s = e[1], ms = this.ms.get(sid); return { world: s.world || "hellfire", x: s.x, y: s.y, alive: ms?.zp ? ms.zp.alive !== false : true, run: s.runId || null }; };
  partyView(p: any) {
    return { type: "party_state", id: p.id, leader: p.leader, max: PARTY_MAX, members: p.members.map((sid: string) => { const e = this.sessionLookup?.(sid), s = e?.[1], ms = this.ms.get(sid), cls = s?.stats?.classId || null;
      return { sid, name: s ? this.displayName(s) : "…", cls, lvl: cls && ms ? this.store.hero(ms.pkey, cls).lvl : 0, hp: ms?.zp ? Math.round(ms.zp.hp) : 0, maxHp: ms?.zp?.maxHp || 0, world: s?.world || "hellfire", x: Math.round(s?.x || 0), y: Math.round(s?.y || 0), run: s?.runRoom || null, online: !!e }; }) };
  }
  partySend(p: any) { if (!p) return; const v = p.members.length > 1 ? this.partyView(p) : null; for (const sid of p.members) { const e = this.sessionLookup?.(sid); if (e) this.send(e[0], v || { type: "party_state", id: null }); } }
  partyMsg(ws: WebSocket, session: any, msg: any) {
    const err = (m: string) => this.send(ws, { type: "toast_error", message: m });
    const P = this.party, me = session.id;
    switch (msg.type) {
      case "party_invite": {
        const to = String(msg.sid || ""), e = this.sessionLookup?.(to);
        if (!e) return err("Игрок не в сети");
        if (session.inDuel || e[1].inDuel) return err("Сначала завершите дуэль");
        const r = P.invite(me, to); if (r) return err(r);
        this.send(e[0], { type: "party_invite", from: me, name: this.displayName(session) });
        this.send(ws, { type: "toast", message: `Приглашение отправлено: ${this.displayName(e[1])}` });
        return;
      }
      case "party_respond": {
        const from = String(msg.from || "");
        if (!msg.accept) { P.decline(me, from); const e = this.sessionLookup?.(from); if (e) this.send(e[0], { type: "toast", message: `${this.displayName(session)} отклонил(а) приглашение` }); return; }
        const r = P.accept(me, from); if (typeof r === "string") return err(r);
        this.partySend(r); return;
      }
      case "party_leave": { const p = P.leave(me); this.send(ws, { type: "party_state", id: null }); this.partySend(p); return; }
      case "party_kick": { const r = P.kick(me, String(msg.sid || "")); if (typeof r === "string") return err(r); const e = this.sessionLookup?.(String(msg.sid)); if (e) this.send(e[0], { type: "party_state", id: null }); this.partySend(r); return; }
      case "party_promote": { const r = P.promote(me, String(msg.sid || "")); if (typeof r === "string") return err(r); this.partySend(r); return; }
      case "party_get": { const p = P.get(me); this.send(ws, p ? this.partyView(p) : { type: "party_state", id: null }); return; }
    }
  }
  loot!: LootBags; lootExpAt = 0;
  fx: { at: number; world: string; sid: string; fn: () => void }[] = []; // отложенные части навыков (метеор, тики, след)

  tick(dt: number, sessions: Map<WebSocket, any>) {
    const now = Date.now();
    if (now - (this.lootExpAt || 0) > 1000) { this.lootExpAt = now; this.loot.expire(now); }
    if (now - (this.regAt || 0) > 3000) { this.regAt = now; this.syncRegions(); } // правки плотности локаций → пересборка лагерей
    if (now - this.partyAt > 1000) { this.partyAt = now; for (const p of this.party.parties.values()) this.partySend(p); } // ОЗ/позиции отряда — для рамок, карты и мини-карты
    try { this.pvp.tick(now); } catch (e: any) { console.error("[mc] pvp tick", e?.message || e); }
    const byWorld: Record<string, { players: Map<string, ZPlayer>; socks: [WebSocket, any][] }> = {};
    for (const w of Object.keys(this.zones)) byWorld[w] = { players: new Map(), socks: [] };
    for (const [ws, s] of sessions) {
      const ms = this.ms.get(s.id);
      if (!ms) continue;
      const w = s.world || "hellfire";
      if (byWorld[w] && !s.runRoom && !s.inDuel) {
        ms.zp.x = s.x; ms.zp.y = s.y;
        this.fogTick(ws, s, ms, w, now);
        if (!ms.zp.alive && now >= ms.zp.respawnAt) {
          ms.zp.alive = true; ms.zp.hp = ms.zp.maxHp;
          const rp = genOf(w).respawn;
          s.x = rp.x; s.y = rp.y; ms.zp.x = s.x; ms.zp.y = s.y;
          this.send(ws, { type: "zone_respawn", x: s.x, y: s.y });
        }
        if (ms.zp.alive && ms.zp.hp < ms.zp.maxHp) {
          const eff = this.effective(s);
          // вне боя (5 с без урона) — быстрое восстановление 4% ХП/с, как в MMO: простой между стычками короткий
          // в бою (нанёс или получил урон за последние regenCombatSec с) — восстановление ×regenCombat; оба — из админки «Спавн»
          const R = regenRate(now, (ms as any).hurtAt || 0, (ms as any).hitAt || 0, ms.zp.maxHp, eff.regen, w === "hellfire");
          if ((ms as any).reviveUsed && R > eff.regen + 1) (ms as any).reviveUsed = false; // вне боя (полная регенерация) — талант снова готов
          ms.zp.hp = Math.min(ms.zp.maxHp, ms.zp.hp + R * dt);
        }
        // в хабе боевое состояние только у тех, у кого есть оболочка
        if (w !== "hellfire" || s.stats?.classId) byWorld[w].players.set(s.id, ms.zp);
        byWorld[w].socks.push([ws, s]);
      }
      if (ms.dirty && now - ms.lastSave > 5000) this.save(s);
    }
    this.zoneAcc += dt;
    const sendNow = this.zoneAcc >= 0.2;
    if (sendNow) this.zoneAcc = 0;
    if (this.fx.length) {
      const due = this.fx.filter((f) => f.at <= now);
      this.fx = this.fx.filter((f) => f.at > now);
      for (const f of due) { if (!this.ms.has(f.sid)) continue; try { f.fn(); } catch (e: any) { console.error("[mc] ability fx", e?.message || e); } }
    }
    for (const [w, zone] of Object.entries(this.zones)) {
      const { players, socks } = byWorld[w];
      zone.update(dt, now, players, (sid, dmg, src) => {
        const ms = this.ms.get(sid);
        if (!ms || !ms.zp.alive) return;
        if (((ms as any).invulnUntil || 0) > now) return; // неуязвимость навыка (прыжок, облако, рывок)
        const real = Math.max(1, Math.round(dmg * (1 - ms.zp.armorRed) * (((ms as any).drUntil || 0) > now ? 0.5 : 1)));
        ms.zp.hp -= real; (ms as any).hurtAt = now;
        zone.events.push({ k: "phit", sid, d: real, src });
        if (ms.zp.hp <= 0 && tryRevive(ms as any)) zone.events.push({ k: "previve", sid, hp: ms.zp.hp }); // талант: раз за бой
        else if (ms.zp.hp <= 0) { ms.zp.hp = 0; ms.zp.alive = false; ms.zp.respawnAt = now + 5000; zone.events.push({ k: "pdie", sid }); }
      }, (mm) => this.onMobKilled(mm));
      if (!sendNow) continue;
      if (!socks.length) { zone.events.length = 0; continue; }
      const ev = zone.takeEvents();
      for (const [ws, s] of socks) {
        const ms = this.ms.get(s.id)!;
        const st = zone.state(s.x, s.y, ev, zone.gen.camps ? OPEN_AOI : 700); // Аринар: интерес = самый дальний зум камеры (VIEW_CELLS.max), не больше
        // Библиотека мобов: «встречен», когда моб оказался рядом (≈ на экране)
        const acc = this.store.accounts.get(ms.pkey);
        let met = false;
        if (acc) for (let i = 0; i < st.m.length; i += 6) {
          const type = baseOf(MOB_TYPES[st.m[i + 1]] || "");
          if (type && !acc.bestiary[type] && Math.abs(st.m[i + 2] - s.x) < 420 && Math.abs(st.m[i + 3] - s.y) < 320) { noteMob(acc, type, 0); ms.dirty = true; met = true; }
        }
        if (met) this.send(ws, { type: "meta_state", ...this.snap(s) }); // новая запись Бестиария → счётчик «новое»
        const tid = (ms as any).target, tm = tid ? zone.byId.get(tid) : null;
        const tg = tm && !tm.dead && Math.abs(tm.x - s.x) < 1600 && Math.abs(tm.y - s.y) < 1600
          ? { id: tm.id, type: tm.type, name: ZONE_MOBS[tm.type].name, lvl: ZONE_MOBS[tm.type].lvl, hp: Math.max(0, Math.ceil(tm.hp)), maxHp: tm.maxHp,
              elite: tm.elite || undefined, cursed: tm.cursed || undefined, boss: tm.special === "boss" || undefined, reset: tm.reset || undefined,
              skills: tm.skills.length ? tm.skills.map((k) => MOB_SKILLS[k].name) : undefined,
              sts: tm.dots?.length ? tm.dots.filter((x) => x.until > now).reduce((o: any, x) => ((o[x.kind] = (o[x.kind] || 0) + 1), o), {}) : undefined } // стаки статусов цели
          : tid ? { id: tid, gone: 1 } : undefined;
        const bags = this.loot.near(ms.pkey, s.world || "hellfire", s.x, s.y, 800);
        // чужие личные порталы рядом (видны всем, войти может только владелец): [ключ, имя, x, y]
        const fp: [string, string, number, number][] = [];
        if ((s.world || "hellfire") === "arinar") for (const m2 of this.ms.values()) { if (m2.sid === s.id) continue; const s2 = this.sessionLookup?.(m2.sid)?.[1], c2 = s2?.stats?.classId; if (!c2) continue; // владелец может быть где угодно (хаб, забег)
          const P = this.store.hero(m2.pkey, c2).portal; if (P?.x != null && Math.abs(P.x - s.x) < 1500 && Math.abs((P.y || 0) - s.y) < 1500) fp.push([opaqueId(m2.pkey).slice(0, 12), this.displayName(s2), P.x, P.y || 0]); }
        // логова мировых боссов (карта M и мини-карта): раз в 5 с и сразу при смене (клиент сам скрывает неразведанные)
        let wb: any;
        if (zone.gen.bosses.length) { const list = zone.bossStatus(now), sig = list.map((x) => x[0] + x[1]).join(); if (now - ((ms as any).wbAt || 0) > 5000 || (ms as any).wbSig !== sig) { wb = list; (ms as any).wbAt = now; (ms as any).wbSig = sig; } }
        // лагеря рядом (мини-карта: зоны агро и активность; трекер квеста: где искать цель) — раз в 2 с
        let cp: any;
        if (zone.camps.length && now - ((ms as any).cpAt || 0) > 2000) { (ms as any).cpAt = now; cp = zone.campSummary(now).filter((c: any) => Math.abs(c[1] - s.x) < 6000 && Math.abs(c[2] - s.y) < 6000); }
        this.send(ws, { type: "zone_state", ...st, tg, bags, fp, wb, cp, me: { hp: Math.round(ms.zp.hp), maxHp: ms.zp.maxHp, alive: ms.zp.alive, wt: ms.wt } });
      }
    }
  }

  // туман войны: открываем по серверной позиции; клиенту — полная маска при смене героя/мира, дальше дельты раз в секунду
  fogTick(ws: WebSocket, s: any, ms: any, w: string, now: number) {
    const cls = s.stats?.classId;
    if (!cls) return;
    const key = cls + "|" + w;
    if (ms.fogKey !== key) {
      ms.fogKey = key; ms.fogAt = now;
      if (!FOG_WORLDS.includes(w)) { this.send(ws, { type: "fog", world: w, none: true }); return; }
      this.explore.visit(ms.pkey, cls, w, s.x, s.y);
      this.explore.full(ms.pkey, cls, w).then((f) => { if (ms.fogKey === key) this.send(ws, { type: "fog", ...f, hero: cls }); }).catch((e) => console.error("[mc] fog", e?.message || e));
      return;
    }
    if (!FOG_WORLDS.includes(w)) return;
    this.explore.visit(ms.pkey, cls, w, s.x, s.y);
    if (now - (ms.fogAt || 0) >= 1000) {
      ms.fogAt = now;
      const add = this.explore.takePending(ms.pkey, cls, w);
      if (add.length) this.send(ws, { type: "fog_add", world: w, c: add });
      this.explore.save(ms.pkey, cls, w).catch(() => {});
    }
  }

  onClose(session: any) {
    this.pvpGone(session);
    { const p = this.party.leave(session?.id); this.partySend(p); } // отключился — выходит из отряда
    const ms = this.ms.get(session?.id);
    if (!ms) return;
    this.save(session);
    this.ms.delete(session.id);
    if (![...this.ms.values()].some((x) => x.pkey === ms.pkey)) this.explore.flushKey(ms.pkey).catch(() => {});
    // выгружаем кэш, если других сессий с этим ключом нет
    if (![...this.ms.values()].some((x) => x.pkey === ms.pkey)) this.store.evict(ms.pkey, () => [...this.ms.values()].some((x) => x.pkey === ms.pkey)).catch((e) => console.error("[mc] evict", e?.message || e));
  }
}

