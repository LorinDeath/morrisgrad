// Сервис мета-прогрессии, квестов и открытого мира Аринара. Подключается к GameRoom минимально:
// onJoin / handle(msg) / tick / onClose. Старые сообщения протокола не меняются.
import { CHARACTER_CLASSES } from "../classes";
import { verifyClerkToken, verifyClerkTokenEx, DEFAULT_CLERK_ISSUER } from "./auth";
import { originAllowed, isLocalRequest } from "../limits";
import {
  HERO_IDS, ITEMS, ITEM_BY_ID, salvageYield, RUN_SKILL_BY_ID, RUN_SKILLS, MONSTER_LOOT, NPCS, NPC_RANGE, ZONE_MOBS, ZONE_RESPAWN, ABILITY_BY_ID, REWARD_RULES, MINIGAMES,
  ZONE_SPAWNS, ZONE_NODES, HUB_SPAWNS, RUN_LOOT_KEY, RUN_BOSS_BY_ROOM, WEAPON_TYPES, volleyDirs, weaponType, RECIPES, RESOURCES, GATHER_RANGE,
} from "./defs";
import { ZONE_GEN, genOf } from "./zoneGen";
import { baseOf, goalMatch, bestiaryKey } from "./biomes";
import { condLive, type FightFacts } from "./questConds";
import { mobXp, xpLevelMult, killXp, dotStackMax, weaponSkillPowerMult, levelGapDmgMult, levelGapHitMult } from "./balance";
import { QUESTS, QUEST_BY_ID, turninNpc, setCustomQuests, builtinOverrides } from "./quests";
import { QUEST_DIALOGUES } from "./vnChars";
import { HOME_PORTAL_HUB, HOME_PORTAL_CD_MS, HOME_PORTAL_COMBAT_MS } from "../worlds/portals";
// спрайт снаряда автоатаки по типу оружия (FX atlas v2)
import { AUTO_SPRITE, shotAim } from "./abilityShapes";
import { CURSE, curseClient, isCursedTag, untag, skillPowerMult } from "./cursed";
import { parseTag, tierDef } from "./enchant";
import { enchDropMult } from "./profile";
import { LootBags, pickBagOwner, type Bag } from "./loot";
import { CHEST, Chests, CampRuns, recipients, rollChest, type Chest, type CampRun } from "./chests";
import { Parties, PARTY_MAX, partyXpShare, splitLoot } from "./party";
import { AdminStore, traitsFor, applyTraits } from "./admin";
import { ExploreStore } from "./exploreDb";
import { FOG_WORLDS } from "./explore";
import { mapZones } from "./mapZones";
import { MarkStore } from "./mapMarks";
import { PERF, perfServer, perfZone, wrapDb } from "./perf";
import { ST } from "./stats";
import { regionAt, isNight } from "./zoneGen";
import { ZONE_NAMES, zoneKeyOf } from "./mapZones";
import { dashTry, dashClient, DASH_CFG, isInvuln } from "./dash";
import { gatherClient } from "./gatherCfg";
import { uiClient, UI_CFG } from "./uiCfg";
import { cleanLayout, layoutView, UI_LAY_RATE_MS } from "./uiLayout";
import { terrainClient } from "./terrainCfg";
import { NpcWander } from "./npcWander";
import { BlackMage, BM_NPC, BM_LOCK } from "./blackMage";
import { BM_CFG, bmClock, bmClient, DAY_MS } from "./bmCfg";
import { WORLD_GEN, inSafe } from "./zoneGen";
import { dnClient, DN_CFG, dnAt, dnMinutes } from "./dayNight";
import { CITY_CFG, PK_CFG, POS_CFG, KillLog, inCity, pushOut, cityKeepOut, cityR, newPk, pkToggle, pkInterrupt, pkTick, pkLeft, pvpAllowed, pkGrantDefense, pkIdle, CITY_TILE, pkPublic, type PkState } from "./city";
import { cityClient, syncCityNpcs, cityNpcId, slotPos, roomAt, buildingById, doorNear, onExit, roomSpawn, outsideDoor, inRoomArea, roomWalkable } from "./cityBuild";
let MZ: { ver: number; z: any } | null = null;
import { BOARD_CFG, devBoardRoll, bmWanted, tutPending, boardEvent, boardRefresh, boardClient, boardDefs, boardClaim, boardTake, boardPin, boardTut, nearBoard, atBoard, takeAt, npcTasks, BTASKS } from "./board";
import {
  heroEffective, weaponCursed, cursedGlow, markSeen, rollRunSkill, weaponSkill, noteMob, noteItem, cryptoRand, snapshot, learnTalent, setLoadout, upgradeRadiance, silenceAbility, buySoulNode, equip, unequip, salvage, setLock, upgradeItem, salvagePreview, salvageMany, effSkill, codexBound,
  craft, addItem, addRes, rollMonsterLoot, campRoll, gainXp, questEvent, questAvailable, acceptQuest, turnInQuest, questComplete, type Account, type Hero,
  questLockReason, questRefresh, blackenEquipped,
} from "./profile";
import { chestsOf, chestList, chestOpen, chestTake, chestSalvage, chestEquip, grantChest } from "./boardChest";
import { BCHEST, bchestPreview } from "./boardChestCfg";
import { Zone, killHow, MOB_SKILLS, regSig, mobEffStats, enchMul, type ZPlayer } from "./zone";
import { ProfileStore } from "./store";
import { itemCard, mobDropView, mobStatView, SILHOUETTES, ITEM_INDEX } from "./library";
import { bestiaryRegistry, arenaKey, ARENA_ONLY, TRIAL_BOSS_WAVE } from "./bestiaryReg";
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
/** заморозка моба: боссы — 0.6 с, элита/редкие — половина; после — 1.5 с устойчивости (нельзя держать вечно) */
export const FREEZE_GUARD: { inDome?: (x: number, y: number) => any } = {}; // купол Чёрного мага: заморозка игроков не проходит
export function freezeMob(m: any, ms: number, now = Date.now()) {
  if ((m.frzImmune || 0) > now) return 0;
  if (FREEZE_GUARD.inDome?.(m.x, m.y)) return 0;
  const d = ZONE_MOBS[m.type]?.boss || m.special === "boss" ? Math.min(600, ms) : m.elite || m.special === "rare" ? ms * 0.5 : ms;
  m.frozenUntil = Math.max(m.frozenUntil || 0, now + d); m.frzImmune = m.frozenUntil + 1500;
  return d;
}
export function regenRate(now: number, hurtAt: number, hitAt: number, maxHp: number, statRegen: number, hub: boolean): number {
  const G: any = ZONE_GEN, inCombat = now - Math.max(hurtAt, hitAt) < (G.regenCombatSec ?? 5) * 1000;
  const full = statRegen + (hub ? 2 : 0.3) + maxHp * 0.04;
  return inCombat ? (statRegen + (hub ? 2 : 0.3)) * (G.regenCombat ?? 0.1) : full;
}
import { castShape } from "./abilityShapes";
import { worldBounds, OPEN_AOI, ARINAR_LAYOUT_VER } from "../worlds/sizes";
import { walkable, freeWalk, POS_WORLDS } from "./walkable";
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
  meta_get: S({}), lib_get: S({}), board_claim: S({ id: "s" }), board_take: S({ id: "s", on: "b" }), board_pin: S({ id: "s", on: "b" }), board_tut: S({ mode: "s" }), board_ui: S({ name: "s" }), talent_learn: S({ id: "s" }), loadout_set: S({ ids: "a" }), radiance_up: S({ id: "s" }), ability_silence: S({ id: "s", confirm: "s?" }),
  soul_buy: S({ id: "s" }), equip: S({ uid: "s" }), unequip: S({ slot: "s" }), salvage: S({ uid: "s" }), item_lock: S({ uid: "s", on: "b" }), item_upgrade: S({ uid: "s", at: "n?" }), salvage_preview: S({ rarity: "s" }), salvage_many: S({ rarity: "s", uids: "a" }), craft: S({ recipe: "s" }), npc_talk: S({ npc: "s" }), npc_talk_end: S({ npc: "s?" }),
  quest_accept: S({ id: "s" }), quest_turnin: S({ id: "s" }), run_result: S({ time: "n?", kills: "o?", bossKills: "n?", room: "s?" }),
  loot_open: S({ bag: "n" }), chest_open: S({ chest: "n" }), chest_take: S({ chest: "n", lid: "n" }), loot_take: S({ bag: "n", lids: "a?", all: "b?" }),
  zone_attack: S({}), zone_ability: S({}), zone_target: S({}), gather_start: S({}), gather_done: S({}), dev_grant: S({}),
  mark_seen: S({ inv: "a?", items: "a?", mobs: "a?", feats: "a?" }),
  rating_get: S({}), inspect_player: S({ sid: "s?", id: "s?", hero: "s?" }),
  party_invite: S({ sid: "s" }), party_respond: S({ from: "s", accept: "b" }), party_leave: S({}), party_kick: S({ sid: "s" }), party_promote: S({ sid: "s" }), party_get: S({}),
  duel_challenge: S({ sid: "s" }), duel_respond: S({ from: "s", accept: "b", dnd: "b?" }),
  save_now: S({}), online_get: S({}), friends_get: S({}), friend_add: S({ sid: "s?", id: "s?" }), friend_respond: S({ id: "s", accept: "b" }),
  admin_bchest_preview: S({ patch: "o", L: "n", cat: "s" }), admin_open: S({}), admin_audit: S({}), admin_save: S({ kind: "s", id: "s", patch: "o" }), admin_save_sec: S({ kind: "s", id: "s", sec: "s", patch: "o" }), admin_reset: S({ kind: "s", id: "s" }), admin_quest_save: S({ quest: "o" }), admin_quest_delete: S({ id: "s" }), admin_quest_reset: S({ id: "s" }), admin_dialogue_save: S({ questId: "s", dialogue: "o" }),
  bchest_list: S({}), bchest_open: S({ id: "n" }), bchest_take: S({ id: "n", lid: "n?", all: "b?" }), bchest_salvage: S({ id: "n", lid: "n" }), bchest_equip: S({ id: "n", lid: "n" }),
  friend_cancel: S({ id: "s" }), friend_remove: S({ id: "s" }), role_set: S({ id: "s?", sid: "s?", moderator: "b" }), settings_set: S({ duel: "s?", freq: "b?", dnd: "b?" }), duel_cancel: S({}), duel_leave: S({}),
  ui_layout_set: S({ dev: "s", lay: "o", lock: "b?" }), // раскладка интерфейса (uiLayout.ts: id из списка, числа −1…1, ≤ 40 записей, ≤ 2 КБ)
};
const ADMIN_PATCH_TYPES = new Set(["admin_save", "admin_save_sec", "admin_bchest_preview"]), ADMIN_PATCH_KEYS = 600;
/** сохранения админки ждут admin_result: любой отказ (схема, частота, размер) — ответом, а не только всплывашкой (панель не висит) */
const ADMIN_RESULT_TYPES = new Set(["admin_save", "admin_save_sec", "admin_reset", "admin_quest_save", "admin_quest_delete", "admin_quest_reset", "admin_dialogue_save"]);
export function validMsg(msg: any): boolean {
  const sch = MSG_SCHEMA[msg.type];
  if (!sch) return true; // не мета-сообщение — его разберёт GameRoom
  for (const [k, t] of Object.entries(sch)) {
    const v = msg[k], opt = t.endsWith("?"), b = t[0];
    if (v === undefined || v === null) { if (opt) continue; return false; }
    if (b === "s" && (typeof v !== "string" || v.length > 64)) return false;
    if (b === "n" && (typeof v !== "number" || !Number.isFinite(v))) return false;
    if (b === "b" && typeof v !== "boolean") return false;
    // патч админки: вкладка «Альказак» — 233 поля (24 места NPC), лимит 200 молча ронял сохранение («Сохранение…» навсегда)
    if (b === "o" && (typeof v !== "object" || Array.isArray(v) || Object.keys(v).length > (ADMIN_PATCH_TYPES.has(msg.type) ? ADMIN_PATCH_KEYS : 200))) return false;
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
  marks: MarkStore;
  admin: AdminStore;
  onVerified?: (ws: any, session: any, uid: string) => void;
  constructor(sql: any, env: any) {
    if (env?.GAME_DB) env = { ...env, GAME_DB: wrapDb(env.GAME_DB) }; // «📊 Нагрузка»: счёт запросов D1 и задержки
    ST.db = env?.GAME_DB || null;
    this.store = new ProfileStore(sql, env?.GAME_DB);
    this.rating = new Rating(env?.GAME_DB);
    this.pvp = new Pvp(this);
    this.party = new Parties();
    this.social = new Social(this, env?.GAME_DB);
    (this.social as any).onFriend = (p1: string, p2: string) => { for (const [sid, m] of this.ms) if (m.pkey === p1 || m.pkey === p2) this.bevSid(sid, { type: "friend" }); };
    this.roles = new Roles(env?.GAME_DB);
    this.explore = new ExploreStore(env?.GAME_DB);
    this.marks = new MarkStore(env?.GAME_DB);
    this.admin = new AdminStore(env?.GAME_DB);
    this.loot = new LootBags(); this.chests = new Chests(); this.camps = new CampRuns(); this.db = env?.GAME_DB || null;
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
    else if (msg.token) {
      const chk = await verifyClerkTokenEx(String(msg.token), this.env.CLERK_ISSUER || DEFAULT_CLERK_ISSUER, (azp) => originAllowed(this.env, azp, session.localConn === true));
      uid = chk.uid;
      if (!uid && !(session.dev === true && msg.userId)) {
        // Игрок прислал токен, но он не прошёл: раньше молча становился гостем (прогресс уходил в чужой guest-профиль).
        // jwks — сбой у нас: повтор (meta_error → meta_get). Иначе — auth_invalid: клиент обновит токен и переподключится
        // или покажет «Сессия истекла» (MC-A03, реестр src/errors/codes.js). Профиль не создаём.
        if (chk.reason === "jwks") { this.send(ws, { type: "meta_error", retry: true, message: "Проверяем вход…" }); return; }
        this.send(ws, { type: "auth_invalid", code: "MC-A03", reason: chk.reason || "invalid" });
        return;
      }
    }
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
    ST.join(session.id, pkey, verified); if (verified && msg.guestId) { ST.pendingConv.add(pkey); if (ST.pendingConv.size > 500) ST.pendingConv.clear(); } // гость → вошёл в аккаунт (оценка)
    const a = this.store.account(pkey);
    // гость: имя из 100 четырёхбуквенных назначает сервер один раз (хранится в профиле), показ — «Гость» Имя
    if (!verified) {
      if (!a.gname || !isGuestName(a.gname)) { a.gname = GUEST_NAMES[Math.floor(cryptoRand() * GUEST_NAMES.length)]; this.store.saveAccount(pkey, false); }
      session.username = guestDisplay(a.gname);
      this.send(ws, { type: "guest_name", name: session.username });
    }
    await this.social.warm(pkey);
    await this.roles.ensure();
    { const ms0 = this.ms.get(session.id); const role = ms0?.verified ? this.roles.of(pkey) : undefined; const pf = this.roles.panelFlags(ms0); this.send(ws, { type: "my_role", role: role || null, ...pf }); }
    if (a.hero && CHARACTER_CLASSES[a.hero] && !session.stats.classId) this.applyHeroToSession(session, a.hero);
    this.refreshZonePlayer(session);
    this.send(ws, { type: "meta_state", ...this.snap(session), uiLay: layoutView(a) }); // раскладка интерфейса — только при входе (дальше клиент сам)
    this.restorePos(ws, session, ms, a); // вход/переподключение: туда, где был (мир и точка; невалидная — ближайшая допустимая)
    { const P = this.pkOf(ms); if (session.stats) session.stats.pk = P.pk ? 1 : 0; if (P.pk || P.to !== null) this.pkSend(ws, ms); }
  }

  // ——— позиция между входами (админка «🏰 Город» → posOn): аккаунт хранит lastPos = { w, x, y, at, h? } ———
  /** запомнить (не чаще posSaveSec; force — смена мира/выход). Мёртвых и забеги не трогаем */
  posNote(session: any, ms: any, force = false, now = Date.now(), cls: string | null = session?.stats?.classId || null) {
    if (POS_CFG.on === false || !ms || !ms.zp.alive || session.runRoom || session.inDuel) return;
    const w = session.world || "hellfire"; if (!POS_WORLDS.has(w)) return;
    if (!force && now - ((ms as any).posAt || 0) < Math.max(5, Number(POS_CFG.saveSec) || 60) * 1000) return;
    const a = this.store.account(ms.pkey) as any, by = POS_CFG.perBody !== false && cls && CHARACTER_CLASSES[cls] ? cls : null;
    const o = (by ? a.posBy?.[by] : null) || a.lastPos;
    if (o && o.w === w && Math.abs(o.x - session.x) < 16 && Math.abs(o.y - session.y) < 16 && (!by || a.posBy?.[by])) { (ms as any).posAt = now; return; } // не двигался — без записи
    const h = w === "arinar" ? roomAt(session.x, session.y) : null; // в здании города: id здания + точка в комнате (раскладка комнаты может смениться)
    const p = h ? { w, x: Math.round(h.x), y: Math.round(h.y), at: now, h: h.id, rx: Math.round(session.x - h.ox), ry: Math.round(session.y - h.oy) } : { w, x: Math.round(session.x), y: Math.round(session.y), at: now };
    a.lastPos = p; // общая (последнее тело) — запасная, если у тела своей ещё нет
    if (by) { if (!a.posBy || typeof a.posBy !== "object") a.posBy = {}; a.posBy[by] = { ...p }; } // своя у каждого тела (POS_CFG.perBody)
    (ms as any).posAt = now; ms.dirty = true;
  }
  /** точка входа по сохранённой: проверки (мир, границы, проходимость/вода/лава, купол города для убийц, купол мага, исчезнувший дом) */
  posFix(ms: any, p: any): { w: string; x: number; y: number; why: string } | null {
    if (!p || !POS_WORLDS.has(p.w) || !Number.isFinite(Number(p.x)) || !Number.isFinite(Number(p.y))) return null;
    const w = String(p.w), [lo, hi] = worldBounds(w); let x = Math.max(lo + 16, Math.min(hi - 16, Number(p.x))), y = Math.max(lo + 16, Math.min(hi - 16, Number(p.y))), why = "";
    if (w === "arinar" && p.h) { // вышел из игры в здании города
      const b = buildingById(String(p.h));
      if (b?.room && CITY_CFG.on !== false && !this.killerOf(ms).killer) {
        let rx = b.ox + Number(p.rx), ry = b.oy + Number(p.ry);
        if (!Number.isFinite(rx) || !Number.isFinite(ry) || !roomWalkable(rx, ry)) { [rx, ry] = roomSpawn(b); why = "room"; }
        return { w, x: Math.round(rx), y: Math.round(ry), why };
      }
      if (b) { [x, y] = outsideDoor(b); why = b.room ? "killer" : "house"; } // комнаты больше нет / убийца — у двери (дальше — проверки ниже)
      else { x = CITY_CFG.x; y = CITY_CFG.y + 8 * CITY_TILE; why = "house"; } // здания больше нет — у фонтана
    }
    if (w === "arinar") {
      for (const d of this.bm.domesAt(x, y)) { const a = Math.atan2(y - d.y, x - d.x) || Math.PI / 2; x = d.x + Math.cos(a) * (d.r + 48); y = d.y + Math.sin(a) * (d.r + 48); why = "bmdome"; }
      if (inCity(x, y, 12) && this.killerOf(ms).killer) { [x, y] = pushOut(x, y, 48); why = "killer"; }
    }
    if (!walkable(w, x, y)) { const f = freeWalk(w, x, y); if (!f) return null; [x, y] = f; why = why || "blocked"; }
    return { w, x: Math.round(x), y: Math.round(y), why };
  }
  restorePos(ws: WebSocket, session: any, ms: any, a: any) {
    if (a.klp && !this.killLog.p.has(ms.pkey)) this.killLog.p.set(ms.pkey, (a.klp as number[]).filter((t) => Number.isFinite(t)));
    if (POS_CFG.on === false || (session as any).posRestored || session.runRoom || session.inDuel) return;
    (session as any).posRestored = true;
    const by = POS_CFG.perBody !== false && a.hero ? a.posBy?.[a.hero] : null; // точка активного тела; нет — общая (старые аккаунты)
    const f = this.posFix(ms, by || a.lastPos); if (!f) return;
    this.posGo(ws, session, f);
  }
  /** перенести сессию в проверенную точку (вход/переподключение, смена тела с POS_CFG.switchTp) */
  posGo(ws: WebSocket, session: any, f: { w: string; x: number; y: number; why: string }) {
    if (f.w === "hellfire" && (session.world || "hellfire") === "hellfire" && Math.hypot(f.x - session.x, f.y - session.y) < 24) return;
    session.world = f.w; session.x = f.x; session.y = f.y; (session as any).lastMoveAt = Date.now();
    if (f.w === "arinar") (session as any).arVer = ARINAR_LAYOUT_VER;
    session.dismoraleUntil = 0; session.escapedUntil = 0;
    this.send(ws, { type: "world_switched", world: f.w, x: f.x, y: f.y, restored: 1, why: f.why || undefined });
    this.onWorldChange(ws, session);
    if (f.w === "arinar") this.cityRoomNote(ws, session, "restore");
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
    const bs: any = {}; const bUps = this.boardSnap(ms, a, h, bs); // до снимка: награды шагов обучения уже в опыте/материалах
    const s: any = snapshot(a, h, cls, heroBase(cls), ms.verified);
    Object.assign(s, bs); if (bUps) s.boardLevelUps = bUps;
    { const L = chestsOf(a).list; s.bchest = { n: L.length, mine: L.filter((c) => c.hero === cls).length, fresh: L.filter((c) => c.hero === cls && !Array.isArray(c.items)).length, on: BCHEST.on !== false }; } // 🎁 значок HUD
    // Алтарь тел: у каждого героя — статы/экип/сумка для превью без смены оболочки
    for (const id of HERO_IDS) {
      const hh = this.store.hero(ms.pkey, id);
      const base = heroBase(id);
      const eqUids = new Set(Object.values(hh.equip || {}));
      const equip: Record<string, { uid: string; id: string }> = {};
      for (const [slot, uid] of Object.entries(hh.equip || {})) {
        const it = a.inv.find((i) => i.uid === uid);
        if (it) equip[slot] = { uid: String(uid), id: it.id, ...(it.cursed ? { cursed: 1 } : {}), ...(it.ench ? { ench: it.ench } : {}), ...(it.blk ? { blk: it.blk } : {}) };
      }
      const bag = a.inv
        .filter((i) => (!i.hero || i.hero === id) && !eqUids.has(i.uid))
        .map((i) => ({ uid: i.uid, id: i.id, ...(i.cursed ? { cursed: 1 } : {}), ...(i.ench ? { ench: i.ench } : {}) }));
      const eff = heroEffective(a, hh, id, base);
      s.heroes[id] = {
        lvl: hh.lvl, xp: hh.xp, loadout: hh.loadout, equip, bag,
        effective: {
          maxHp: eff.maxHp, armor: eff.armor, damageReduction: eff.damageReduction,
          weaponMin: eff.weaponMin, weaponMax: eff.weaponMax,
          dmgPct: eff.dmgPct, critPct: eff.critPct, speedPct: eff.speedPct, cursedGlow: (eff as any).cursedGlow || 0,
        },
      };
    }
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
    s.questDialogues = QUEST_DIALOGUES; // диалоги-новеллы квестов (админка)
    s.questOverrides = builtinOverrides(); // правки сюжетных квестов (клиент накладывает поверх кода)
    if (h) s.portal = h.portal?.x != null ? { x: h.portal.x, y: h.portal.y, cd: h.portal.cd } : { cd: h.portal?.cd || 0 }; // личный портал домой
    if (!MZ || MZ.ver !== this.admin.ver) MZ = { ver: this.admin.ver, z: mapZones(WORLD_GEN.arinar.regions as any, ZONE_MOBS as any) }; s.mapZones = MZ.z; s.dash = dashClient(); s.gather = gatherClient(); s.ui = uiClient(); s.terrain = terrainClient(); // вид интерфейса (админка «🎨 Интерфейс») // карта M: биом · ур. мобов (живые уровни)
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
    const base = { type: "config_update", ver: this.admin.ver, patches, customQuests: QUESTS.filter((q) => q.custom), questOverrides: builtinOverrides(), questDialogues: QUEST_DIALOGUES, regenCfg: regenCfg() };
    for (const [sid, ms] of this.ms) {
      const e = this.sessionLookup?.(sid); if (!e) continue;
      const cards: Record<string, any> = {};
      // правка «Проклятия» меняет cstats всех карточек — переслать все закэшированные
      for (const id of this.admin.touched.has("curse:main") ? [...ms.cards] : items) if (ms.cards.has(id)) { const c = itemCard(id); if (c) cards[id] = c; }
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
    ms.zp.armorRed = eff.damageReduction; (ms.zp as any).armor = eff.armor || 0; // сырая броня — для пробития в дуэлях
    (ms as any).revive = (eff as any).revive || 0; // талант «встать с 40% ХП» (revive.ts)
    if (wasFull || ms.zp.hp > eff.maxHp) ms.zp.hp = eff.maxHp;
    // облик («забери всё») и уровень героя видны другим игрокам через players_state.stats
    if (session.stats && cls) { session.stats.look = eff.look || null; session.stats.lvl = eff.level || 1; session.stats.cg = (eff as any).cursedGlow || 0; session.stats.bk = (eff as any).blkVis || 0; } // cg — свечение проклятия (видно всем)
    ms.wt = eff.wtype; if ((ms as any).q) (ms as any).q.wts.push([Date.now(), ms.wt || ""]); // смена оружия — для условия «только оружием»
    (ms.zp as any).lvl = eff.level || 1; ms.pub = cls ? { cls, lvl: eff.level || 1, armor: eff.armor, dr: eff.damageReduction, wMin: eff.weaponMin, wMax: eff.weaponMax, critPct: eff.critPct, wt: eff.wtype } : null;
  }

  effective(session: any) {
    const ms = this.ms.get(session.id)!;
    const cls = session.stats?.classId || null;
    const a = this.store.account(ms.pkey);
    if (!cls) return { ...heroBase(null), damageReduction: 0, dmgPct: 0, critPct: 5, lifestealPct: 0, regen: 0, cdrPct: 0, armorPen: 0, armorPenPct: 0, weaponMin: 6, weaponMax: 9, abilities: [] as any[], speedPct: 0, magnetPct: 0, atkSpeedPct: 0, revive: 0, look: null, level: 0, weaponId: null, wtype: weaponType(null, null), cursedGlow: 0, weaponCursed: 0 };
    return heroEffective(a, this.store.hero(ms.pkey, cls), cls, heroBase(cls), { dark: !!(ms as any).dark }); // проклятая земля (Чёрный маг): только очернённые статы
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
    if (now - d.fightAt >= 15000) d.sids.forEach((sid, i) => this.bevSid(sid, { type: "pvp", win: winner === i })); // доска: дуэль не короче 15 с
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
    const h = ms && cls ? this.store.hero(ms.pkey, cls) : null;
    const before = a.quests.done.length;
    const out = questEvent(a, ev, h);
    // доска заданий (board.ts): тот же поток событий; сданный сюжетный квест — отдельное событие
    if (ms) {
      try {
        const ctx = { pkey: ms.pkey, heroes: this.store.heroMap(ms.pkey) };
        let ch = boardEvent(a, h, ev, ctx);
        for (let i = before; i < a.quests.done.length; i++) ch = boardEvent(a, h, { type: "quest_done", id: a.quests.done[i] }, ctx) || ch;
        if (ch) { ms.dirty = true; this.boardSoon(session); }
      } catch (e: any) { console.error("[mc]", "MC-B01", "board event", e?.message || e); }
    }
    return out;
  }
  /** событие только для доски (смерть, рывок, портал, отряд…) */
  bev(session: any, ev: any) {
    const ms = this.ms.get(session.id); if (!ms) return;
    const a = this.store.account(ms.pkey), cls = session.stats?.classId;
    const h = cls ? this.store.hero(ms.pkey, cls) : null;
    try { if (boardEvent(a, h, ev, { pkey: ms.pkey, heroes: this.store.heroMap(ms.pkey) })) { ms.dirty = true; this.boardSoon(session); } }
    catch (e: any) { console.error("[mc]", "MC-B01", "board event", e?.message || e); }
  }
  bevSid(sid: string, ev: any) { const e = this.sessionLookup?.(sid); if (e?.[1]) this.bev(e[1], ev); }
  /** прогресс доски без meta_state (рывки, навыки): не чаще раза в 0,5 с; ближайший push всё равно отправит состояние */
  boardSoon(session: any) {
    const ms: any = this.ms.get(session.id); if (!ms || ms.boardT) return;
    ms.boardT = setTimeout(() => {
      ms.boardT = null;
      const e = this.sessionLookup?.(session.id); if (!e || !this.ms.has(session.id)) return;
      const a = this.store.account(ms.pkey), cls = session.stats?.classId, h = cls ? this.store.hero(ms.pkey, cls) : null;
      if (h && tutPending(a)) { this.push(e[0], session); return; } // шаг обучения выполнен — награда выдаётся сразу (полный meta_state)
      const st = boardClient(a, h); if (st.rev === ms.boardRev) return;
      ms.boardRev = st.rev; this.send(e[0], { type: "board_state", board: st });
    }, 500);
  }
  /** доска в meta_state: пересчёт состояний, определения (раз в сессию/после правок), состояние при смене rev */
  boardSnap(ms: any, a: Account, h: Hero | null, s: any) {
    try {
      const r = boardRefresh(a, h, { pkey: ms.pkey, heroes: this.store.heroMap(ms.pkey) });
      if (r.granted.length) { s.boardGranted = r.granted.map((g: any) => ({ id: g.id, title: g.title, cat: g.cat, xp: g.xp, res: g.res, capped: g.cappedXp || undefined })); ms.dirty = true; }
      if (ms.boardDefsVer !== this.admin.ver) { s.boardDefs = boardDefs(); ms.boardDefsVer = this.admin.ver; ms.boardRev = -1; }
      const st = boardClient(a, h);
      if (st.rev !== ms.boardRev || st.lvl !== ms.boardLvl) { s.board = st; ms.boardRev = st.rev; ms.boardLvl = st.lvl; }
      return r.levelUps;
    } catch (e: any) { console.error("[mc]", "MC-B01", "board snap", e?.message || e); return 0; }
  }

  bm = new BlackMage("arinar"); bmLoaded = false; bmSaving = false; bmDirty = false; bmSaveAt = 0; // Чёрный маг (blackMage.ts) — один на Аринар
  npcs = new NpcWander(); // NPC бродят вокруг точки появления (позиции — сервер, рассылка в zone_state.npc)
  nearNpc(session: any, npc: string) {
    const n = NPCS[npc], p = npc === BM_NPC ? { x: this.bm.x, y: this.bm.y } : this.npcs.pos(npc) || n; // Чёрный маг — живая позиция (телепорт)
    if (npc === BM_NPC && (BM_CFG.on === false || this.bm.aggro.has(session.id))) return false; // выключен / этот игрок с ним в бою — ни взять, ни сдать
    // +20 px запаса: клиент видит NPC с интерполяцией (до ~0,2 с отставания), NPC мог чуть отойти
    return n && (session.world || "hellfire") === n.world && Math.hypot(session.x - p.x, session.y - p.y) <= NPC_RANGE + 20;
  }

  // ---------- сообщения ----------
  handle(ws: WebSocket, session: any, msg: any, ctx: { runMembers: (room: string) => any[]; broadcast: () => void }): boolean {
    const ms = this.ms.get(session?.id);
    if (!ms) {
      // профиль ещё не загружен (или загрузка не удалась) — meta_get запускает повтор
      if (msg.type === "meta_get" && session) { this.retryJoin(ws, session); return true; }
      return false;
    }
    if (msg.type === "mark_add" || msg.type === "mark_del" || msg.type === "mark_rename" || msg.type === "mark_list") { // метки карты M: только свои, герой = класс сессии, мир = мир сессии
      const cls = session.stats?.classId, w = session.world || "hellfire"; if (!cls) return true;
      const t = Date.now(); if (msg.type !== "mark_list" && t - ((ms as any).markAt || 0) < 150) { this.send(ws, { type: "mark_err", message: "Слишком часто" }); return true; }
      (ms as any).markAt = t; const P = ms.pkey, done = (r: any) => this.send(ws, r.ok ? { type: "mark_ok", op: msg.type, world: w, mark: r.mark, id: msg.id } : { type: "mark_err", message: r.err });
      const fail = (e: any) => { console.error("[mc] marks", e?.message || e); this.send(ws, { type: "mark_err", message: "Не удалось сохранить метку" }); };
      if (msg.type === "mark_list") this.marks.list(P, cls, w).then((a) => this.send(ws, { type: "marks", world: w, hero: cls, list: a })).catch(fail);
      else if (msg.type === "mark_add") this.marks.add(P, cls, w, msg.x, msg.y, msg.n).then((r: any) => { if (r?.ok) this.bev(session, { type: "mark" }); done(r); }).catch(fail);
      else if (msg.type === "mark_rename") this.marks.rename(P, cls, w, msg.id, msg.n).then(done).catch(fail);
      else this.marks.del(P, cls, w, msg.id).then(done).catch(fail);
      return true;
    }
    if (msg.type === "dash") { // рывок: перезарядка и неуязвимость — по часам сервера; мигание видят все в мире
      const now = Date.now(), r = dashTry((ms as any).dashSt ||= {}, now);
      if (!r.ok) { this.send(ws, { type: "dash_reject", left: Math.round(r.left) }); return true; }
      this.qNote(ms, "dash", now); // условия квестов: «без рывка»
      this.bev(session, { type: "dash" });
      if (DASH_CFG.invulnMs > 0) (ms as any).invulnUntil = Math.max((ms as any).invulnUntil || 0, r.invulnUntil);
      const fx = { type: "dash_fx", id: session.id, ms: DASH_CFG.invulnMs, blink: DASH_CFG.blink !== false }, w = session.world || "hellfire";
      for (const sid of this.ms.keys()) { const e = this.sessionLookup?.(sid); if (e && (e[1]?.world || "hellfire") === w) this.send(e[0], fx); }
      return true;
    }
    if (MSG_SCHEMA[msg.type]) {
      const now = Date.now();
      if (now - ms.rl.t > RATE.windowMs) { ms.rl.t = now; ms.rl.n = 0; }
      if (++ms.rl.n > RATE.max) {
        if (now - ms.rl.warned > 10000) { ms.rl.warned = now; this.store.audit(ms.pkey, "reject", `rl:${ms.pkey}:${Math.floor(now / 10000)}`, { why: "rate", type: msg.type }); }
        if (ADMIN_RESULT_TYPES.has(msg.type)) this.send(ws, { type: "admin_result", ok: false, op: "reject", kind: msg.kind, id: msg.id, sec: msg.sec, err: "Слишком много запросов — повторите через секунду" });
        return true;
      }
      if (!validMsg(msg)) { this.send(ws, { type: "toast_error", message: "Неверный запрос" });
        if (ADMIN_RESULT_TYPES.has(msg.type)) this.send(ws, { type: "admin_result", ok: false, op: "reject", kind: msg.kind, id: msg.id, sec: msg.sec, err: "Неверный запрос (сервер отклонил формат сохранения)" }); this.store.audit(ms.pkey, "reject", `schema:${ms.pkey}:${now}`, { why: "schema", type: msg.type }); return true; }
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
      case "meta_get": (ms as any).boardRev = -1; (ms as any).boardDefsVer = -2; this.send(ws, { type: "meta_state", ...this.snap(session) }); return true;
      case "board_claim": {
        const now = Date.now(); if (now - ((ms as any).bclAt || 0) < 150) return true; (ms as any).bclAt = now;
        const bid = String(msg.id).slice(0, 64);
        if (BTASKS[bid] && atBoard(BTASKS[bid]) && !nearBoard("nb", session.world || "hellfire", session.x, session.y)) { this.send(ws, { type: "toast_error", message: "Этот заказ сдаётся у Доски объявлений (Аринар, у портала)" }); return true; }
        { const at = BTASKS[bid] ? takeAt(BTASKS[bid]) : ""; if (at && at !== "board" && !this.nearNpc(session, at)) { this.send(ws, { type: "toast_error", message: `Личное задание сдаётся персонажу: ${NPCS[at]?.name || at}` }); return true; } }
        const r = boardClaim(a, h, bid, { pkey: ms.pkey, heroes: this.store.heroMap(ms.pkey) });
        if (!r.ok) { this.send(ws, { type: "toast_error", message: r.err, code: "MC-B03" }); return true; }
        this.store.audit(ms.pkey, "board", `board:${ms.pkey}:${(a as any).hero || ""}:${r.id}:${r.tiers.join(".")}:${(a as any).board?.per?.[r.cat] || ""}`, { id: r.id, tiers: r.tiers, xp: r.xp, res: r.res, item: r.item?.id, chest: r.chest?.tier, chests: r.chests?.map((c: any) => c.tier + (c.cur ? ":c" : "")) });
        this.push(ws, session, { boardClaimed: { id: r.id, title: r.title, xp: r.xp, res: r.res, item: r.item, chest: r.chest, chests: r.chests, tiers: r.tiers, capped: r.cappedXp || undefined, levelUps: r.levelUps || undefined } });
        if (r.levelUps) this.refreshZonePlayer(session);
        return true;
      }
      case "board_take": {
        const tid = String(msg.id).slice(0, 64), at = BTASKS[tid] ? takeAt(BTASKS[tid]) : "board";
        if (at === "board" && !nearBoard("nb", session.world || "hellfire", session.x, session.y)) { this.send(ws, { type: "toast_error", message: "Заказы берут и отменяют у Доски объявлений (Аринар, у портала)" }); return true; }
        if (at && at !== "board" && !this.nearNpc(session, at)) { this.send(ws, { type: "toast_error", message: `Личные задания берут у персонажа: ${NPCS[at]?.name || at}` }); return true; }
        const r = boardTake(a, h, tid, !!msg.on);
        if (r.ok && msg.on && BTASKS[tid]?.ev === "reach") this.bev(session, { type: "reach", world: session.world || "hellfire" }); // «дойти до …» — уже там (как у квестов)
        if (r.ok) this.push(ws, session, r.msg ? { toast: r.msg } : {}); else this.send(ws, { type: "toast_error", message: r.err }); return true; }
      case "board_pin": { const r = boardPin(a, String(msg.id).slice(0, 64), !!msg.on); if (r.ok) this.push(ws, session); else this.send(ws, { type: "toast_error", message: r.err }); return true; }
      case "board_tut": { const r = boardTut(a, String(msg.mode)); if (r.ok) this.push(ws, session); else this.send(ws, { type: "toast_error", message: r.err }); return true; }
      case "board_ui": { // клиентские «ui»-события: только шаги обучения (без ценности), имя — из белого списка
        const name = String(msg.name); if (!["move", "book", "board", "map"].includes(name)) return true;
        this.bev(session, { type: "ui", name }); return true;
      }
      case "lib_get": this.send(ws, { type: "library", ...this.library(a, HERO_IDS.map((id) => this.store.hero(ms.pkey, id))) }); return true;
      case "mark_seen": {
        const n = markSeen(a, msg);
        if (n) { ms.dirty = true; this.store.saveAccount(ms.pkey, ms.verified); }
        this.send(ws, { type: "seen_ok", n });
        return true;
      }
      case "talent_learn": if (!needHero()) return true; { const r = learnTalent(a, h!, cls!, String(msg.id)); if (r.ok) this.qev(a, session, { type: "talent" }); reply(r, "Талант изучен"); this.refreshZonePlayer(session); } return true;
      case "loadout_set": if (!needHero()) return true; { const lo: any = setLoadout(a, h!, cls!, msg.ids); if (lo.ok) this.bev(session, { type: "loadout" }); reply(lo, "Раскладка сохранена"); } return true;
      case "radiance_up": if (!needHero()) return true; { const rr: any = upgradeRadiance(a, h!, cls!, String(msg.id)); if (rr.ok) this.bev(session, { type: "radiance" }); reply(rr, "Сияние усилено"); } return true;
      case "ability_silence": if (!needHero()) return true; reply(silenceAbility(a, h!, cls!, String(msg.id), msg.confirm)); return true;
      case "soul_buy": {
        if (!this.nearNpcOrAltar(session)) { this.send(ws, { type: "toast_error", message: "Ветка души открывается только у Алтаря перевоплощения" }); return true; }
        const sb: any = buySoulNode(a, String(msg.id)); if (sb.ok) this.bev(session, { type: "soul" });
        reply(sb, "Душа изменилась"); this.refreshZonePlayer(session); return true;
      }
      case "bchest_list": this.send(ws, this.bchestMsg(ms, a)); return true;
      case "bchest_open": case "bchest_take": case "bchest_salvage": case "bchest_equip": { // 🎁 сундуки наград доски: всё решает сервер
        const now = Date.now(); if (now - ((ms as any).bcAt || 0) < 40) return true; (ms as any).bcAt = now;
        let r: any;
        if (msg.type === "bchest_open") r = chestOpen(a, cls, msg.id);
        else if (msg.type === "bchest_take") r = chestTake(a, cls, msg.id, msg.lid, !!msg.all);
        else if (msg.type === "bchest_salvage") r = chestSalvage(a, cls, msg.id, msg.lid);
        else { if (!needHero()) return true; r = chestEquip(a, h!, cls!, msg.id, msg.lid); }
        if (r.ok && msg.type === "bchest_open" && r.fresh) this.store.audit(ms.pkey, "bchest", `bchest:${ms.pkey}:${msg.id}:open`, { id: msg.id, n: r.chest?.items?.length || 0 });
        if (r.ok && msg.type === "bchest_salvage") this.bev(session, { type: "salvage", n: 1, items: [] });
        if (r.ok && msg.type === "bchest_equip") { const it = a.inv.find((i) => i.uid === r.uid); const mon = it && ITEM_BY_ID[it.id]?.monster; if (mon) this.qev(a, session, { type: "equip_monster", monster: mon }); this.bev(session, { type: "equip" }); }
        if (r.ok && r.fresh) for (const x of r.chest?.items || []) noteItem(a, x.id, "bchest", false); // увидели в сундуке — в Библиотеку как «видели»
        this.send(ws, { ...this.bchestMsg(ms, a), ev: { op: msg.type.slice(7), id: msg.id, ...r } });
        if (r.ok || r.got?.length) this.push(ws, session, r.msg ? { toast: r.msg } : {}); else if (r.err) this.send(ws, { type: "toast_error", message: r.err });
        if (msg.type === "bchest_equip" && r.ok) this.refreshZonePlayer(session);
        return true;
      }
      case "equip": {
        if (!needHero()) return true;
        const r = equip(a, h!, cls!, String(msg.uid));
        if (r.ok) { const it = a.inv.find((i) => i.uid === msg.uid); const mon = it && ITEM_BY_ID[it.id].monster; if (mon) this.qev(a, session, { type: "equip_monster", monster: mon }); this.bev(session, { type: "equip" }); }
        reply(r, "Надето"); this.refreshZonePlayer(session); return true;
      }
      case "unequip": if (!needHero()) return true; reply(unequip(h!, String(msg.slot)), "Снято"); this.refreshZonePlayer(session); return true;
      case "salvage": {
        const own = a.inv.find((i) => i.uid === String(msg.uid));
        if (own?.hero && own.hero !== cls) { this.send(ws, { type: "toast_error", message: "Это предмет другого героя" }); return true; }
        const heroes = HERO_IDS.map((id) => this.store.hero(ms.pkey, id));
        const sr: any = salvage(a, heroes, String(msg.uid)); if (sr.ok) this.bev(session, { type: "salvage", n: 1, items: own ? [{ ench: own.ench | 0, cursed: !!own.cursed }] : [] });
        reply(sr); return true;
      }
      case "item_lock": { // закрепление экземпляра (флаг в D1: item_instances.locked)
        const lr: any = setLock(a, cls || null, String(msg.uid), !!msg.on); if (lr.ok && msg.on) this.bev(session, { type: "lock" });
        reply(lr); return true;
      }
      case "item_upgrade": { // улучшение — только у Петра; сервер считает стоимость и списывает; не чаще 4 раз/с
        if (!this.nearNpc(session, "petr")) { this.send(ws, { type: "toast_error", message: "Улучшение — у Петра (хаб, юго-запад)" }); return true; }
        const now = Date.now(); if (now - ((ms as any).upgAt || 0) < 250) return true; (ms as any).upgAt = now;
        const r: any = upgradeItem(a, cls || null, String(msg.uid), msg.at == null ? undefined : Number(msg.at));
        if (r.ok) { this.store.audit(ms.pkey, "upgrade", `upg:${msg.uid}:${r.up}`, { uid: msg.uid, up: r.up, cost: r.cost }); const ui: any = a.inv.find((i) => i.uid === String(msg.uid)); this.bev(session, { type: "upgrade", up: r.up | 0, ench: ui?.ench | 0, cursed: !!ui?.cursed }); }
        this.send(ws, { type: "upgrade_result", ok: !!r.ok, uid: String(msg.uid), up: r.up, err: r.err });
        reply(r); if (r.ok) this.refreshZonePlayer(session); return true;
      }
      case "salvage_preview": { // массовый разбор: сначала превью от сервера (что именно получит игрок), подтверждение — в игре
        const heroes = HERO_IDS.map((id) => this.store.hero(ms.pkey, id));
        this.send(ws, { type: "salvage_preview", ...salvagePreview(a, heroes, cls || null, String(msg.rarity)) }); return true;
      }
      case "salvage_many": {
        const heroes = HERO_IDS.map((id) => this.store.hero(ms.pkey, id));
        const uids = Array.isArray(msg.uids) ? msg.uids.slice(0, 500).map(String) : [];
        const was = new Map(a.inv.map((i) => [i.uid, { ench: (i as any).ench | 0, cursed: !!i.cursed }]));
        const sr: any = salvageMany(a, heroes, cls || null, String(msg.rarity), uids);
        if (sr.ok && sr.n) { const left = new Set(a.inv.map((i) => i.uid)); this.bev(session, { type: "salvage", n: sr.n, items: [...was].filter(([u]) => !left.has(u)).map(([, v]) => v) }); }
        reply(sr); return true;
      }
      case "craft": {
        if (!this.nearNpc(session, "petr")) { this.send(ws, { type: "toast_error", message: "Ремесло — у Петра (хаб, юго-запад)" }); return true; }
        const r = craft(a, String(msg.recipe));
        if (r.ok) this.qev(a, session, { type: "craft", recipe: String(msg.recipe) });
        reply(r, "Создано!"); return true;
      }
      case "pk_toggle": { // кнопка PK у полоски ОЗ: отсчёт без боя (enterSec / exitSec), повторное нажатие — отмена
        if ((session.world || "hellfire") !== "arinar") { this.send(ws, { type: "toast_error", message: "PK-режим — только в Аринаре" }); return true; }
        const r = pkToggle(this.pkOf(ms)); if (r.k === "start" && r.to) this.bev(session, { type: "pk" });
        if (r.k === "off") this.send(ws, { type: "toast_error", message: "PK-режим сейчас отключён" });
        this.pkSend(ws, ms); return true;
      }
      case "pk_get": { this.pkSend(ws, ms); return true; }
      case "city_knock": { // клиент упёрся в купол (убийцу не пускает — шаг внутрь не предсказан): плашка с причиной и отсчётом
        if ((session.world || "hellfire") !== "arinar" || CITY_CFG.on === false) return true;
        const now = Date.now(), k = this.killerOf(ms, now); if (k.killer && !inCity(session.x, session.y) && Math.hypot(session.x - CITY_CFG.x, session.y - CITY_CFG.y) < cityR() + 160) this.cityDenyMsg(session, ms, k, now);
        else this.pkSend(ws, ms); // клиент думал, что он убийца, а это уже не так — обновить состояние
        return true;
      }
      case "npc_talk_end": { this.npcs.talkEnd(msg.npc ? String(msg.npc) : null, session.id); if (!msg.npc || msg.npc === BM_NPC) this.bm.talkEnd(session.id); return true; }
      case "npc_talk": {
        const npc = String(msg.npc);
        if (npc === BM_NPC && this.bm.aggro.has(session.id)) { this.send(ws, { type: "toast_error", message: "Чёрный маг не станет говорить с тем, кто на него напал" }); return true; } // с остальными говорит и во время боя
        if (!this.nearNpc(session, npc)) { this.send(ws, { type: "toast_error", message: "Подойдите ближе" }); return true; }
        this.npcs.talkStart(npc, session.id, session.x, session.y); // стоит, пока открыт диалог (npc_talk_end / таймаут)
        if (npc === BM_NPC) this.bm.talkStart(session.id); // Чёрный маг тоже стоит и смотрит (если на него никто не напал)
        this.questEv(ws, session, { type: "talk", npc });
        questRefresh(a, h);
        // все квесты персонажа: доступные, закрытые (с причиной), активные, готовые к сдаче, выполненные (лор читается)
        const quests = QUESTS.filter((q) => !q.auto && (q.npc === npc || turninNpc(q) === npc)).map((q) => {
          const act = a.quests.active[q.id];
          const state = act ? (questComplete(a, q.id) ? (turninNpc(q) === npc ? "complete" : "active") : "active") : a.quests.done.includes(q.id) ? "done" : q.npc !== npc ? "elsewhere" : questAvailable(a, q, h) ? "available" : "locked";
          return { id: q.id, state, reason: state === "locked" ? questLockReason(a, q, h) : state === "elsewhere" ? `берётся у: ${NPCS[q.npc]?.name || q.npc}` : undefined, p: act?.p };
        }).filter((x) => x.state !== "elsewhere" || a.quests.done.includes(x.id));
        this.push(ws, session);
        this.send(ws, { type: "npc_dialog", npc, quests, tasks: npcTasks(a, h, npc) }); // личные задания персонажа (доска заданий, поле «кто выдаёт»)
        return true;
      }
      case "mob_track": { // «Отслеживать» из Бестиария: { id } или { id: null } — снять
        const id = msg.id ? String(msg.id) : null;
        if (id && !(ZONE_MOBS as any)[id] && !(ZONE_MOBS as any)[baseOf(id)]) { this.send(ws, { type: "toast_error", message: "Нет такого существа" }); return true; }
        // несколько целей: { id, on } — добавить/убрать; { id } (старый клиент) — одна цель; { id: null } — снять все. Лимит — админка «📋 Доска» trackMax
        const max = Math.max(1, Math.min(30, (BOARD_CFG.trackMax | 0) || 10));
        let L: string[] = Array.isArray((a as any).mobTracks) ? (a as any).mobTracks.filter((x: any) => typeof x === "string") : a.mobTrack ? [a.mobTrack] : [];
        if (!id) L = []; else if (msg.on === undefined) L = [id]; else if (msg.on) { if (!L.includes(id)) { if (L.length >= max) { this.send(ws, { type: "toast_error", message: `Отслеживать можно не больше ${max} врагов` }); this.push(ws, session); return true; } L.push(id); } } else L = L.filter((x) => x !== id);
        (a as any).mobTracks = L; a.mobTrack = L[0] || null; if (id && msg.on !== false) this.bev(session, { type: "track" }); reply({ ok: true }); return true;
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
        if (r.ok) ST.inc("quests");
        if (r.ok) this.push(ws, session, { questDone: { id: q.id, rewards: (r as any).rewards } });
        else this.send(ws, { type: "toast_error", message: (r as any).err });
        this.refreshZonePlayer(session);
        return true;
      }
      case "run_result": this.runResult(ws, session, msg, ctx).catch((e) => console.error("[mc] run_result", e?.message || e)); return true;
      case "rating_get": {
        const so = (ms.social = ms.social || { rating: 0, insp: [] });
        if (Date.now() - so.rating < 2000) { this.send(ws, { type: "rating_err", message: "Рейтинг обновляется — подождите пару секунд" }); return true; }
        so.rating = Date.now(); this.bev(session, { type: "rating" });
        this.rating.view(ms.pkey).then((v) => this.send(ws, { type: "rating", ...v })).catch((e) => { console.error("[mc] rating", e?.message || e); this.send(ws, { type: "rating_err", message: "Рейтинг временно недоступен" }); });
        return true;
      }
      case "admin_perf": { // «📊 Нагрузка» — только админ (роль из D1 + проверенный вход); модератору отказ
        if (!this.roles.canAdminFull(ms)) { this.send(ws, { type: "toast_error", message: "Недостаточно прав" }); return true; }
        if (Date.now() - ((ms as any).perfAt || 0) < 1000) return true; (ms as any).perfAt = Date.now();
        this.perfSnapshot().then((data) => this.send(ws, { type: "admin_perf", data })).catch((e) => console.error("[mc] perf", e?.message || e));
        return true;
      }
      case "admin_bchest_preview": { // 🎁 предпросмотр шансов сундуков наград (значения формы не сохраняются)
        if (!this.roles.canAdminFull(ms)) { this.send(ws, { type: "toast_error", message: "Недостаточно прав" }); return true; }
        if (Date.now() - ((ms as any).bcpAt || 0) < 250) return true; (ms as any).bcpAt = Date.now();
        if (JSON.stringify(msg).length > 24000) return true;
        this.send(ws, { type: "admin_bchest_preview", ...bchestPreview(msg.patch, msg.L, String(msg.cat || "daily"), cryptoRand) }); return true;
      }
      case "client_stats": { // fps/пинг/устройство раз в минуту; значения проверяются и обрезаются в ST.clientStats
        if (Date.now() - ((ms as any).cstAt || 0) < 20000) return true; (ms as any).cstAt = Date.now();
        ST.clientStats(session.id, msg); return true;
      }
      case "admin_open": case "admin_audit": case "admin_save": case "admin_save_sec": case "admin_reset": case "admin_quest_save": case "admin_quest_delete": case "admin_quest_reset": case "admin_dialogue_save": {
        // роли из D1 + verified; id/роль из сообщения клиента игнорируются.
        // Админ — всё. Модератор — только admin_open + admin_save/reset для mob/weapon/item. Остальное — отказ.
        const deny = (why: string) => { this.send(ws, { type: "toast_error", message: "Недостаточно прав", code: "MC-A07", for: String(msg.type || "").slice(0, 40), why }); this.store.audit(ms.pkey, "reject", `admin:${ms.pkey}:${Date.now()}`, { why, type: msg.type, kind: (msg as any).kind }); return true; };
        if (msg.type === "admin_open") {
          if (!this.roles.canOpenAdmin(ms)) return deny("not_panel");
        } else if (msg.type === "admin_save" || msg.type === "admin_save_sec" || msg.type === "admin_reset") {
          if (!this.roles.canAdminWrite(ms, String((msg as any).kind || ""))) return deny("not_write_kind");
        } else {
          // audit / quests / dialogues — только полный админ
          if (!this.roles.canAdminFull(ms)) return deny("admin_only");
        }
        const rej = (err: string) => { this.send(ws, { type: "toast_error", message: err }); if (ADMIN_RESULT_TYPES.has(msg.type)) this.send(ws, { type: "admin_result", ok: false, op: "reject", kind: (msg as any).kind, id: (msg as any).id, sec: (msg as any).sec, err }); return true; };
        const t = Date.now(); if (msg.type !== "admin_open" && t - ((ms as any).admAt || 0) < 300) return rej("Слишком часто — повторите через секунду");
        (ms as any).admAt = t;
        if (JSON.stringify(msg).length > 24000) return rej("Слишком большой запрос");
        const fail = (e: any) => { console.error("[mc] admin", e?.message || e); this.send(ws, { type: "admin_result", ok: false, err: "Ошибка сохранения" }); };
        if (msg.type === "admin_open") this.admin.sync(true).then(() => this.send(ws, { type: "admin_catalog", ...this.admin.catalogFor(this.roles.isAdmin(ms) ? "admin" : "moderator") })).catch(fail);
        else if (msg.type === "admin_audit") this.admin.audit(60).then((rows) => this.send(ws, { type: "admin_audit", rows })).catch(fail);
        else if (msg.type === "admin_save") this.admin.save(ms.pkey, msg.kind, msg.id, msg.patch).then((r) => this.send(ws, { type: "admin_result", op: "save", kind: msg.kind, id: msg.id, ...r })).catch(fail);
        else if (msg.type === "admin_save_sec") this.admin.saveSection(ms.pkey, msg.kind, msg.id, msg.sec, msg.patch).then((r) => this.send(ws, { type: "admin_result", op: "save", kind: msg.kind, id: msg.id, sec: msg.sec, ...r })).catch(fail);
        else if (msg.type === "admin_reset") this.admin.reset(ms.pkey, msg.kind, msg.id).then((r) => this.send(ws, { type: "admin_result", op: "reset", kind: msg.kind, id: msg.id, ...r })).catch(fail);
        else if (msg.type === "admin_quest_reset") this.admin.resetQuest(ms.pkey, msg.id).then((r) => this.send(ws, { type: "admin_result", op: "quest", reset: true, ...r })).catch(fail);
        else if (msg.type === "admin_dialogue_save") this.admin.saveDialogue(ms.pkey, msg.questId, msg.dialogue).then((r) => this.send(ws, { type: "admin_result", op: "dialogue", ...r })).catch(fail);
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
          // журнал выдачи/снятия модератора (в player_roles остаётся только текущее состояние, история терялась)
          this.store.audit(ms.pkey, "role_set", `role:${opaqueId(target!)}:${Date.now()}`, { target: opaqueId(target!), role: r.role || null });
          this.send(ws, { type: "role_changed", id: opaqueId(target!), role: r.role || null });
          this.push(ws, session, { toast: r.role ? "Модерка выдана" : "Модерка снята" });
          const osid = this.social.onlineSid(target!); const oe = osid ? this.sessionLookup?.(osid) : null;
          if (oe) { const tms = this.ms.get(oe[1].id); this.send(oe[0], { type: "my_role", role: r.role || null, ...this.roles.panelFlags(tms) }); }
        }).catch((e) => { console.error("[mc] role_set", e?.message || e); this.send(ws, { type: "toast_error", message: "Не удалось сохранить роль" }); });
        return true;
      }
      case "inspect_player": {
        const so = (ms.social = ms.social || { rating: 0, insp: [] });
        const t = Date.now();
        so.insp = so.insp.filter((x) => t - x < 60000);
        if ((so.insp.length && t - so.insp[so.insp.length - 1] < 700) || so.insp.length >= 12) { this.send(ws, { type: "inspect_err", message: "Слишком часто — подождите немного" }); return true; }
        so.insp.push(t); this.bev(session, { type: "inspect" });
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
      case "ui_layout_set": {
        // перетаскивание интерфейса: раскладка ПК/телефона — в аккаунт (переезжает между устройствами); выкл в админке — не храним
        if (UI_CFG.drag === false) return true;
        const t = Date.now();
        if (t - ((ms as any).layAt || 0) < UI_LAY_RATE_MS) { this.send(ws, { type: "ui_layout", ok: false, why: "rate", dev: msg.dev }); return true; }
        const c = cleanLayout(msg.dev, msg.lay, msg.lock, t);
        if (!c) { this.send(ws, { type: "ui_layout", ok: false, why: "bad", dev: msg.dev }); return true; }
        (ms as any).layAt = t;
        const a = this.store.account(ms.pkey) as any;
        a.uiLay = { ...(a.uiLay && typeof a.uiLay === "object" ? a.uiLay : {}), [c.dev]: c.lay };
        for (const k of Object.keys(a.uiLay)) if (k !== "pc" && k !== "mob") delete a.uiLay[k];
        ms.dirty = true;
        this.send(ws, { type: "ui_layout", ok: true, dev: c.dev, at: c.lay.at, n: Object.keys(c.lay.off).length });
        return true;
      }
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
      case "chest_open": this.chestOpen(ws, session, msg); return true;
      case "chest_take": this.chestTake(ws, session, msg); return true;
      case "dev_grant": {
        // Только для локальных тестов (MC_DEV_TRUST_USERID=1): выдать звёзды/опыт/предмет
        if (session.dev !== true) return true;
        // тесты рейтинга: выгрузить профиль в D1 и сбросить кэш рейтинга (обычно — не чаще раза в 60 с)
        if (msg.ratingRefresh) { this.save(session); (this.store.chain.get(ms.pkey) || Promise.resolve()).then(() => this.store.flush(ms.pkey)).then(() => { this.rating.at = 0; this.send(ws, { type: "dev_rating_reset" }); }); return true; }
        if (msg.stars) for (const [c, n] of Object.entries(msg.stars)) a.stars[c] = (a.stars[c] || 0) + Number(n);
        if (msg.xp && h) gainXp(h, Number(msg.xp));
        if (msg.boardRoll && typeof msg.boardRoll === "object") { const br: any = msg.boardRoll; ms.dirty = true; // тест рангов: вариант задания с заданным рангом (и количеством)
          const r = devBoardRoll(a, h, String(br.id || ""), String(br.r || ""), Number(br.n) || 0, Number.isFinite(br.minL) ? Number(br.minL) : -1, { pkey: ms.pkey, heroes: this.store.heroMap(ms.pkey) }, String(br.rb || ""), Math.max(0, Number(br.p) || 0)); if (r) this.boardSoon(session); }
        if (msg.bchestGrant && typeof msg.bchestGrant === "object" && a.hero) { const g: any = msg.bchestGrant; ms.dirty = true; // тест сундуков наград (только dev): ранги → сундуки, как за сданное задание
          for (const r of (Array.isArray(g.ranks) ? g.ranks : [g.rank]).slice(0, 12)) grantChest(a, a.hero, String(r || "F"), Math.max(1, Math.min(25, Number(g.L) || 10)), String(g.cat || "daily"), "dev", undefined, typeof g.cur === "boolean" ? g.cur : undefined); }
        if (msg.killNear || msg.killNearAny) { const z = this.zoneOf(session); const m = z?.mobs.filter((x: any) => !x.dead && (msg.killNearAny || !x.special) && (!msg.killType || x.type === msg.killType)).sort((p: any, q: any) => Math.hypot(p.x - session.x, p.y - session.y) - Math.hypot(q.x - session.x, q.y - session.y))[0];
          if (m && Math.hypot(m.x - session.x, m.y - session.y) < 500) { if (msg.cursed) m.cursed = true; if (Number.isInteger(msg.ench) && msg.ench >= 0 && msg.ench <= 6) m.ench = msg.ench; z!.damage(m, session.id, m.hp + 1e6, (mm: any) => this.onMobKilled(mm)); } } // тест: настоящее убийство (обычный путь награды); killNearAny — и боссы (только MC_DEV); killType — фильтр вида
        if (msg.mobInfo) { const z = this.zoneOf(session); const list = (z?.mobs || []).filter((x: any) => !x.dead).sort((p: any, q: any) => Math.hypot(p.x - session.x, p.y - session.y) - Math.hypot(q.x - session.x, q.y - session.y)); const m = msg.typeFilter ? list.find((x: any) => x.type === msg.typeFilter) : list[0]; if (m) this.send(ws, { type: "dev_mob", id: m.id, mob: m.type, hp: m.hp, maxHp: m.maxHp, cursed: !!m.cursed, ench: m.ench || 0, elite: !!m.elite, special: m.special || "" }); }
        if (msg.bag && typeof msg.bag === "object") { const items = (Array.isArray(msg.bag.items) ? msg.bag.items : []).filter((id: any) => ITEM_BY_ID[parseTag(String(id)).id]).slice(0, 30); const res: Record<string, number> = {}; for (const [r, n] of Object.entries(msg.bag.res || {})) if (RESOURCES[r]) res[r] = Math.max(1, Math.min(99, Number(n) || 1)); this.loot.drop(session.world || "hellfire", session.x + 50, session.y, ms.pkey, { items, res }, "dev", "mob", "dev"); }
        if (msg.engageNear) { const z = this.zoneOf(session); for (const m of z?.near(session.x, session.y, Number(msg.engageNear) || 300) || []) if (!m.dead && !m.special && Math.hypot(m.x - session.x, m.y - session.y) <= (Number(msg.engageNear) || 300)) { m.targetSid = session.id; m.dmgBy.set(session.id, (m.dmgBy.get(session.id) || 0) + 1); } } // тест сундуков: «пачка вступила в бой»
        if (msg.chestInfo) this.send(ws, { type: "dev_chests", list: [...this.chests.chests.values()].map((c) => ({ id: c.id, x: c.x, y: c.y, n: c.entries.length, owners: [...new Set(c.entries.map((e) => e.o))], per: c.entries.reduce((o: any, e) => ((o[e.o] = (o[e.o] || 0) + 1), o), {}), pub: Date.now() >= c.pubAt, guarded: !!c.guarded })), enc: this.camps.map.size });
        if (msg.chestSpawn && typeof msg.chestSpawn === "object") { const ents: any[] = []; for (const [owner, ids] of Object.entries(msg.chestSpawn.by || {})) for (const id of (Array.isArray(ids) ? ids : []).slice(0, 30)) if (ITEM_BY_ID[parseTag(String(id)).id]) ents.push({ o: owner === "me" ? ms.pkey : String(owner), id: String(id), k: "item", n: 1 }); this.chests.spawn(session.world || "hellfire", session.x + (Number(msg.chestSpawn.dx) || 0), session.y + (Number(msg.chestSpawn.dy) || 0), ents, "dev", "mob", "dev", "dew_slime"); } // тест сундуков (только dev)
        if (msg.bm && typeof msg.bm === "object") this.bmDev(ws, session, ms, a, h, msg.bm); // Чёрный маг (только dev)
        if (msg.city && typeof msg.city === "object") this.cityDev(ws, session, ms, a, msg.city); // город/PK/позиция (только dev)
        if (msg.hurtMe) { (ms as any).hurtAt = Date.now(); ms.zp.hp = Math.max(1, ms.zp.hp - 1); }
        if (msg.flags) for (const f of Object.keys(msg.flags)) a.flags[f] = true;
        if (msg.item) addItem(a, String(msg.item), "grant:dev");
        if (msg.setUp && typeof msg.setUp === "object") { const it = a.inv.find((i) => i.uid === String(msg.setUp.uid)); if (it) it.up = Math.max(0, Math.min(58, Number(msg.setUp.up) | 0)); } // тест значков улучшения (только dev)
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
  /** Бестиарий для забегов/испытаний: вид мира или вид только арены (arenaKey); боссы — не больше одного за раз */
  noteArenaKills(a: Account, raw: any, o: { cap?: number; skip?: string; onlyBoss?: boolean; bossOk?: boolean } = {}) {
    let left = o.cap ?? Infinity;
    for (const [type, n0] of Object.entries(raw && typeof raw === "object" ? raw : {})) {
      const key = arenaKey(type); if (!key || key === o.skip) continue;
      const isBoss = !!((ZONE_MOBS as any)[key]?.boss || ARENA_ONLY[key]?.boss);
      if (o.onlyBoss && !isBoss) continue;
      if (isBoss && !o.onlyBoss && !o.bossOk) continue;
      const n = Math.min(isBoss ? 1 : Infinity, left, Math.max(0, Math.floor(Number(n0) || 0)));
      if (n <= 0) continue;
      noteMob(a, key, n); left -= n;
      if (left <= 0) break;
    }
  }
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
    for (const [id, b] of Object.entries(a.bestiary)) mobs[id] = { kills: b.kills || 0, isNew: !b.v, drops: mobDropView(id, known), st: mobStatView(id) ?? (ARENA_ONLY[id] ? { lvl: ARENA_ONLY[id].lvl } : null) }; // статы — с правками админки (как считает сервер)
    const reg = bestiaryRegistry(); // реестр Бестиария: всё, что появляется в игре (группы, уровень, где водится) — знаменатель шкалы
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
    return { size: SILHOUETTES.length, sil: SILHOUETTES, items, mobs, reg, feats, codex, inv };
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
    if (prev && prev !== session.stats.classId) this.posNote(session, ms, true, Date.now(), prev); // прежнее тело «остаётся» здесь (своя точка)
    a.hero = session.stats.classId;
    this.store.hero(ms.pkey, a.hero!);
    // смена души: всё прошлого героя (сумка, 4 надетых, прогресс) — в D1 сразу, не ждём автосохранения
    if (prev && prev !== a.hero) { this.save(session); this.store.flush(ms.pkey).catch(() => {}); }
    this.qev(a, session, { type: "select_hero" });
    this.autoTurnInPrologue(a, session);
    this.refreshZonePlayer(session);
    ms.zp.hp = ms.zp.maxHp;
    this.push(ws, session);
    // смена тела: по умолчанию остаёмся у Алтаря; POS_CFG.switchTp — новое тело встаёт туда, где его оставили (с проверками posFix)
    if (prev && prev !== a.hero && POS_CFG.on !== false && POS_CFG.perBody !== false && POS_CFG.switchTp === true && !session.runRoom && !session.inDuel) {
      const f = this.posFix(ms, (a as any).posBy?.[a.hero!]); if (f) this.posGo(ws, session, f);
    } else if (prev !== a.hero) this.posNote(session, ms, true);
  }
  onWorldChange(ws: WebSocket, session: any) {
    const ms = this.ms.get(session.id);
    if (!ms) return;
    ms.zp.x = session.x; ms.zp.y = session.y;
    (ms as any).cityVer = 0; // город: настройки отрисовки — заново
    this.posNote(session, ms, true);
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
      // Бестиарий: убитые в забеге — в карточки своих видов мира (раньше — в отдельные «run_*»); босс комнаты — ниже по bossKills
      this.noteArenaKills(a, kills, { skip: RUN_BOSS_BY_ROOM[run.room] || "warden" });
      // броски дропа по трофеям убитых (ограничено по числу бросков)
      let rolls = 0;
      for (const [type, n] of Object.entries(kills)) {
        const key = RUN_LOOT_KEY[type];
        if (!key || !MONSTER_LOOT[key]) continue;
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
      if (won && time >= 10) this.noteArenaKills(a, msg.kills, { cap: 1, onlyBoss: true }); // «Отражение Кьют» — только победа над отражением (не над игроком: тогда kills пуст)
      if (time >= 10) this.bev(session, { type: "duel" }); // любая честная дуэль (не короче 10 с)
    } else if (mode === "trial") {
      const waves = Math.min(REWARD_RULES.trial.maxWaves, Math.floor(time / 20), Math.max(0, Math.floor(Number(msg.wave) || 0)));
      out.xp = waves * REWARD_RULES.trial.perWaveXp;
      out.waves = waves;
      if (time >= 20) this.noteArenaKills(a, msg.kills, { cap: Math.floor(time * REWARD_RULES.runMaxKillsPerSecond), bossOk: waves >= TRIAL_BOSS_WAVE }); // только Бестиарий (без лута)
      if (time >= 20) this.bev(session, { type: "trial", waves, players });
    }
    if (h && out.xp) out.levelUps = gainXp(h, out.xp);
    this.store.audit(ms.pkey, "run_reward", `run:${runId}`, { xp: out.xp, items: out.items.map((i: any) => i.id), res: out.res, time: out.time }, { qty: out.xp, source: `run:${run.room}` });
    this.push(ws, session, { reward: out });
  }

  grantLoot(a: Account, loot: { items: string[]; res: Record<string, number> }, out: any, src = "?") {
    for (const id of loot.items) { const it = addItem(a, id, src); if (it) { out.items.push(it); (out.cards = out.cards || {})[it.id] = itemCard(it.id); } }
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
      this.bev(session, { type: "portal" });
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
      const it = addItem(a, e.id, b.src, a.hero, !!e.c, (e as any).e || 0); if (!it) return false; // сумка полна — позиция остаётся в мешке
      out.items.push(it); (out.cards = out.cards || {})[e.id] = itemCard(e.id); return true;
    }, budget);
    // редкое оружие несёт навык «Вампир-лайка» (бросок при подборе, только сервер)
    for (const it of out.items) {
      const rs = rollRunSkill(a, it, b.kind as any);
      if (rs) { out.runSkill = { ...RUN_SKILL_BY_ID[rs], from: it.id, uid: it.uid }; this.bev(session, { type: "runskill" });
        this.zones[session.world || "hellfire"]?.events.push({ k: "announce", text: `${RUN_SKILL_BY_ID[rs].icon} ${session.username || "Игрок"} постигает навык «${RUN_SKILL_BY_ID[rs].name}»!`, color: "#fde68a" }); break; }
    }
    const epic = out.items.find((it: any) => ["epic", "legendary", "mythic"].includes(ITEM_BY_ID[it.id]?.rarity));
    if (epic) this.zones[session.world || "hellfire"]?.events.push({ k: "announce", text: `💎 ${session.username || "Игрок"} добывает «${ITEM_BY_ID[epic.id].name}»!`, color: "#f0abfc" });
    if (r.got.length) { ms.dirty = true; this.bev(session, { type: "loot", items: out.items.length, res: out.res, bag: !r.left }); this.push(ws, session, { loot: out }); }
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
  /** вампиризм: лечит героя (сервер) и копит дробные остатки; событие «lsheal» уходит, когда набралось ≥1 ОЗ */
  lifesteal(zone: any, session: any, ms: any, amt: number) {
    if (!(amt > 0) || !ms.zp.alive) return;
    const before = ms.zp.hp;
    ms.zp.hp = Math.min(ms.zp.maxHp, ms.zp.hp + amt);
    ms.lsAcc = (ms.lsAcc || 0) + (ms.zp.hp - before);
    if (ms.lsAcc >= 1) { const n = Math.floor(ms.lsAcc); ms.lsAcc -= n; zone?.events.push({ k: "lsheal", sid: session.id, d: n, x: Math.round(session.x), y: Math.round(session.y) }); }
  }
  /** черты (поджог/яд/кровотечение/заморозка/замедление/отбрасывание/вампиризм) — только сервер.
   *  Добивающий удар: эффекты на моба не нужны, но вампиризм всё равно лечит. */
  traitHit(zone: any, m: any, session: any, ms: any, real: number, traits: any[]) {
    if (!traits.length || !real) return;
    const dead = !!m.dead;
    const stacks = dotStackMax(ms?.pub?.lvl || session.stats?.level || 1);
    applyTraits(traits, real, cryptoRand, {
      dot: (kind, dps, dur) => { if (!dead) zone.applyStatus(m, session.id, { kind, dps, dur }, session.x, session.y, stacks); },
      slow: () => { if (!dead) zone.applyStatus(m, session.id, { slow: true }, session.x, session.y); },
      knock: (p) => { if (!dead) zone.applyStatus(m, session.id, { knock: p }, session.x, session.y); },
      freeze: (t) => { if (!dead) freezeMob(m, t); },
      heal: (hp) => this.lifesteal(zone, session, ms, hp),
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
    if (lockId === BM_LOCK && zone.guard === this.guardMux) { // цель — Чёрный маг (бессмертен; удар = нападение)
      if (Math.hypot(this.bm.x - ox, this.bm.y - oy) <= Math.max(160, W.atk.range * 1.6)) { dx = this.bm.x - ox; dy = this.bm.y - oy; }
    } else if (lockId) { // выбранная цель: точно в неё (сервер-авторитет: моб жив и в пределах дальности оружия ×1.6)
      const m0 = zone.byId.get(lockId);
      if (m0 && !m0.dead && Math.hypot(m0.x - ox, m0.y - oy) <= Math.max(160, W.atk.range * 1.6)) { dx = m0.x - ox; dy = m0.y - oy; }
    }
    if (Math.hypot(dx, dy) < 0.01) return;
    const L = Math.hypot(dx, dy) || 1; dx /= L; dy /= L;
    ms.lastAtk = Math.max(now, ms.lastAtk) + atkCd; // lastAtk хранит момент следующего разрешённого удара
    { const q = (ms as any).q; if (q && q.wts[q.wts.length - 1]?.[1] !== wt) { q.wts.push([now, wt]); if (q.wts.length > 40) q.wts.shift(); } } // «только оружием»
    ms.wt = wt;
    // ближний бой (дуга) — мгновенно; стрелковое оружие (снаряд/линия) — НАСТОЯЩИЕ снаряды сервера: урон при попадании
    const reach = W.atk.kind === "arc" ? W.atk.range * 0.8 : W.atk.range;
    const per = (W.atk.count || 1) > 1 ? W.atk.per || 1 / (W.atk.count || 1) : 1;
    const a = this.store.account(ms.pkey);
    const statused = new Set<number>();
    const traits = traitsFor(wt, this.equippedIds(session, a));
    const applyHit = (m: any, k: number) => {
      if (m.dead || !ms.zp.alive && W.atk.kind === "arc") return;
      { const bk = bestiaryKey(m.type); if (bk && !a.bestiary[bk]) { noteMob(a, bk, 0); ms.dirty = true; } }
      const crit = cryptoRand() * 100 < eff.critPct;
      const raw = eff.weaponMin + cryptoRand() * (eff.weaponMax - eff.weaponMin);
      const gapHit = levelGapHitMult(ZONE_MOBS[m.type]?.lvl || 1, eff.level || 1);
      const dmg = raw * (1 + eff.dmgPct / 100) * (crit ? 1.75 : 1) * k * gapHit;
      const real = zone.damage(m, session.id, dmg, (mm) => this.onMobKilled(mm), { penFlat: eff.armorPen || 0, penPct: eff.armorPenPct || 0 }, "ba") || 0;
      this.noteHit(session, real, m.type);
      if (!m.dead && !statused.has(m.id) && statused.add(m.id)) zone.applyStatus(m, session.id, { kind: W.status.kind, dps: W.status.dpsPct ? real * W.status.dpsPct / 100 : 0, dur: W.status.dur, slow: W.status.slow, knock: W.status.knock }, ox, oy, dotStackMax(eff.level || 1));
      if (eff.lifestealPct && real) this.lifesteal(zone, session, ms, real * eff.lifestealPct / 100);
      if (real) this.traitHit(zone, m, session, ms, real, traits);
      if (crit) zone.events.push({ k: "crit", id: m.id, x: m.x, y: m.y });
    };
    for (const [vx, vy] of volleyDirs(W.atk, dx, dy)) {
      if (W.atk.kind === "arc") {
        const targets = zone.targetsInDir(ms.zp, vx, vy, W.atk);
        zone.events.push({ k: "shot", sid: session.id, x: Math.round(ox), y: Math.round(oy), tx: Math.round(ox + vx * reach), ty: Math.round(oy + vy * reach), w: wt });
        targets.forEach((m, i) => applyHit(m, per * (i === 0 ? 1 : 0.8)));
        if ((session.world || "hellfire") === "arinar") this.pvpArc(session, ms, ox, oy, vx, vy, W.atk, per); // PK-режим: удар задевает и игроков
        if (zone.guard === this.guardMux && this.bm.meleeHits(ox, oy, vx, vy, W.atk.range, W.atk.arc, W.atk.width, "arc")) this.bm.hitMage(session.id); // удар по магу — нападение
      } else {
        const line = W.atk.kind === "line";
        zone.fire({ o: "p", sid: session.id, t: AUTO_SPRITE[wt] || "auto_staff", x: ox, y: oy, cid: Number(msg.cid) || undefined, dx: vx, dy: vy, range: W.atk.range, w: W.atk.width || 20, max: line ? W.atk.max || 1 : 1, pv: (session.world || "hellfire") === "arinar" ? 1 : undefined, pvk: per,
          onHit: (m: any, i: number) => applyHit(m, per * (i === 0 ? 1 : line ? 0.7 : 0.8)) });
      }
    }
  }

  // Рекорд одиночного удара: только удары, посчитанные сервером в открытом мире (см. rating.ts)
  noteHit(session: any, real: number, mobType: string) {
    { const m0 = this.ms.get(session.id); if (m0) (m0 as any).hitAt = Date.now(); } // бой — для портала домой
    if (real > 0) this.pkCombat(session.id, "deal"); // нанёс урон — PK-отсчёт сброшен
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
    const h = this.store.hero(ms.pkey, cls);
    const ab = this.rsAbility(weaponSkill(this.store.account(ms.pkey), h));
    if (ab && h) ab.power = Math.round(ab.power * weaponSkillPowerMult(h.lvl) * 100) / 100;
    if (ab && h && weaponCursed(this.store.account(ms.pkey), h)) { ab.power = Math.round(ab.power * CURSE.rsMult * 100) / 100; ab.cursed = 1; } // проклятое оружие: навык R ×rsMult (доты — % удара)
    return ab;
  }
  zoneAbility(ws: WebSocket, session: any, msg: any) {
    const ms = this.ms.get(session.id)!;
    const zone = this.zoneOf(session);
    if (!zone || !ms.zp.alive) return;
    const eff = this.effective(session);
    // 4-й слот (R): навык надетого оружия — сервер сам берёт его с экипировки, клиент лишь просит "rs"
    let ab: any = eff.abilities.find((x: any) => x.id === msg.id);
    if (!ab && msg.id === "rs") {
      ab = this.rsAbilityOf(session);
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
    const dmg = avg * skillPowerMult(ab.power) * 2.2 * (1 + eff.dmgPct / 100) * (1 + 0.15 * tmods);
    // направление от клиента — только единичный вектор; дальность/цели/позиции — сервер (meta/abilityShapes.ts)
    let dx = aimR.dx, dy = aimR.dy;
    if (Math.hypot(dx, dy) < 0.01) { dx = 0; dy = 1; }
    const world = session.world || "hellfire";
    const sid = session.id;
    const dealt = castShape(ab.cast || ab.id, {
      zone, sid, x: session.x, y: session.y, dx, dy, now, dmg, radiusMult, props: ab.props, here: () => [session.x, session.y],
      fire: (o) => zone.fire({ ...o, o: "p", sid, ...(ab.cursed ? { cz: 1 } : {}) }), // настоящие снаряды навыков (cz — проклятый навык R: фиолетовый шейдер)
      hit: (m, mult, opts) => {
        if (m.dead) return 0;
        m.usedAbility.add(sid);
        const d = ZONE_MOBS[m.type];
        const raw = dmg * mult * (opts?.pierceArmor && d?.armor ? 1 + Math.min(0.5, d.armor / 100) : 1) * levelGapHitMult(d?.lvl || 1, eff.level || 1);
        const real = zone.damage(m, sid, raw, (mm: any) => this.onMobKilled(mm), { penFlat: eff.armorPen || 0, penPct: eff.armorPenPct || 0 }, "ab") || 0;
        this.noteHit(session, real, m.type);
        if (eff.lifestealPct && real) this.lifesteal(zone, session, ms, real * eff.lifestealPct / 100); // пассивный вампиризм и с навыков
        if (real) this.traitHit(zone, m, session, ms, real, traitsFor(null, [], ab.id));
        return real;
      },
      status: (m, st, fx, fy) => { const stacks = dotStackMax(eff.level || 1); if (st.dot) zone.applyStatus(m, sid, st.dot, fx, fy, stacks); if (st.slow || st.knock) zone.applyStatus(m, sid, { slow: st.slow, knock: st.knock }, fx, fy); if (st.freeze) freezeMob(m, st.freeze); },
      move: (x, y) => { session.x = x; session.y = y; ms.zp.x = x; ms.zp.y = y; (session as any).lastMoveAt = Date.now(); this.send(ws, { type: "ability_move", x: Math.round(x), y: Math.round(y) }); },
      bounds: (x, y) => { const [lo, hi] = worldBounds(world); return [Math.max(lo, Math.min(hi, x)), Math.max(lo, Math.min(hi, y))]; },
      buff: (b) => {
        const t = Date.now();
        if (b.invuln) (ms as any).invulnUntil = Math.max((ms as any).invulnUntil || 0, t + b.invuln);
        if (b.dr) (ms as any).drUntil = Math.max((ms as any).drUntil || 0, t + b.dr);
        if (b.heal) ms.zp.hp = Math.min(ms.zp.maxHp, ms.zp.hp + b.heal);
      },
      later: (ms2, fn) => this.fx.push({ at: Date.now() + ms2, world, sid, fn }),
      ev: (e) => zone.events.push(ab.cursed ? { ...e, cz: 1 } : e),
    });
    if (ab.props.includes("vamp")) this.lifesteal(zone, session, ms, dealt * 0.08);
    if (ab.props.includes("swift")) { // Порыв сияния: +25% скорости на 2 с (как в забеге) — открытый мир
      (ms as any).swiftUntil = Math.max((ms as any).swiftUntil || 0, Date.now() + 2000);
      this.send(ws, { type: "buff", id: "swift", ms: 2000 });
    }
    void def;
    this.qNote(ms, "ability", now);
    const a = this.store.account(ms.pkey);
    if (this.qev(a, session, { type: "ability_used" }).length) this.send(ws, { type: "toast_error", message: "Звёздный квест: навык применён — прогресс «без навыков» сброшен" });
  }

  gatherDone(ws: WebSocket, session: any, msg: any) {
    const ms = this.ms.get(session.id)!;
    const zone = this.zoneOf(session);
    if (!zone || !ms.gather || ms.gather.node !== Number(msg.node)) { ms.gather = null; this.send(ws, { type: "toast_error", message: "Сбор не начался — нажмите ещё раз" }); return; }
    ms.zp.x = session.x; ms.zp.y = session.y;
    const now = Date.now(), nd = zone.nodes.find((x: any) => x.id === ms.gather!.node);
    const n = zone.gatherCheck(ms.zp, ms.gather.node, ms.gather.at, now, ms.pkey);
    ms.gather = null;
    if (!n) { // понятная причина вместо тишины
      const why = !nd ? "узел не найден" : zone.nodeReadyAt(nd, ms.pkey) > now ? `ещё не вырос (≈${Math.ceil((zone.nodeReadyAt(nd, ms.pkey) - now) / 1000)} с)` : !ms.zp.alive ? "герой мёртв" : Math.hypot(nd.x - ms.zp.x, nd.y - ms.zp.y) > GATHER_RANGE ? "слишком далеко" : "прервано";
      this.send(ws, { type: "toast_error", message: "Сбор не удался: " + why }); return; }
    zone.nodeTaken(n, ms.pkey, now);
    const qty = n.qty[0] + Math.floor(cryptoRand() * (n.qty[1] - n.qty[0] + 1));
    const a = this.store.account(ms.pkey);
    addRes(a, n.res, qty);
    this.qev(a, session, { type: "gather", res: n.res, n: qty });
    this.push(ws, session, { gathered: { res: n.res, n: qty } });
  }

  // ---------- условия целей квестов (questConds.ts): факты боя игрока с конкретным мобом ----------
  // m.qf: sid → начало боя; ms.q: время последнего навыка/рывка, удары (t, % ОЗ после удара), смены оружия.
  qs(ms: any) { return (ms.q ||= { ab: 0, dash: 0, hits: [] as [number, number][], wts: [] as [number, string][], fights: new Set<any>() }); }
  /** начало боя sid с мобом m; если моб — цель задания с условиями, трекер «перезаряжает» попытку */
  engage(m: any, sid: string) {
    const ms: any = this.ms.get(sid); if (!ms || m.dead) return;
    (m.qf ||= new Map()).set(sid, Date.now());
    const q = this.qs(ms); for (const f of q.fights) if (f.dead || !f.qf?.has(sid)) q.fights.delete(f); q.fights.add(m);
    q.wts.push([Date.now(), ms.wt || ""]); if (q.wts.length > 40) q.wts.splice(0, q.wts.length - 40);
    const entry = this.sessionLookup?.(sid); if (!entry) return;
    for (const t of this.condTargets(ms, m.type)) this.send(entry[0], { type: "quest_cond", qid: t.qid, i: t.i, ok: true, armed: 1, mob: m.type });
  }
  /** активные незакрытые цели kill/kill_boss с условиями, подходящие под тип моба */
  condTargets(ms: any, type: string): { qid: string; i: number; conds: any[] }[] {
    const a = this.store.accounts.get(ms.pkey); if (!a) return [];
    const out: { qid: string; i: number; conds: any[] }[] = [];
    for (const [qid, st] of Object.entries(a.quests.active) as [string, any][]) { const q = QUEST_BY_ID[qid]; if (!q) continue;
      q.objectives.forEach((o: any, i: number) => { if ((o.type === "kill" || o.type === "kill_boss") && o.conds?.length && (st.p[i] || 0) < (o.count || 1) && goalMatch(o.mob, type)) out.push({ qid, i, conds: o.conds }); }); }
    return out;
  }
  /** событие боя (навык/рывок/удар по герою): запомнить и сразу показать «✖ условие нарушено» по целям, с которыми идёт бой */
  qNote(ms: any, kind: "ability" | "dash" | "hit", now: number) {
    const q = this.qs(ms), pct = ms.zp.maxHp ? Math.max(0, ms.zp.hp) / ms.zp.maxHp * 100 : 100;
    if (kind === "ability") q.ab = now; else if (kind === "dash") q.dash = now;
    else { q.hits.push([now, pct]); if (q.hits.length > 600) q.hits.splice(0, q.hits.length - 600); }
    if (!q.fights.size) return;
    const entry = this.sessionLookup?.(ms.zp.sid); if (!entry) return;
    const sent = (q.sent ||= new Map<string, number>());
    for (const m of [...q.fights]) { if (m.dead || !m.qf?.has(ms.zp.sid)) { q.fights.delete(m); continue; }
      for (const t of this.condTargets(ms, m.type)) { const why = condLive(t.conds, kind, pct); const key = `${t.qid}:${t.i}:${m.id}:${m.qf.get(ms.zp.sid)}`;
        if (why && !sent.has(key)) { sent.set(key, now); if (sent.size > 50) sent.delete(sent.keys().next().value!); this.send(entry[0], { type: "quest_cond", qid: t.qid, i: t.i, ok: false, reason: why, mob: m.type }); } } }
  }
  /** факты боя sid с мобом m на момент смерти моба (для condFail) */
  fightFacts(m: any, sid: string, session: any, ms: any, h: any): FightFacts | null {
    if (!ms) return null;
    const now = Date.now(), t0 = m.qf?.get(sid) ?? now, q = this.qs(ms);
    const hits = q.hits.filter((x: [number, number]) => x[0] >= t0), hpNow = ms.zp.maxHp ? Math.max(0, ms.zp.hp) / ms.zp.maxHp * 100 : 100;
    const wts = new Set<string>([ms.wt || ""]); for (const [t, w] of q.wts) if (t >= t0) wts.add(w);
    const reg: any = regionAt(m.x, m.y, session.world || "arinar");
    return { ability: q.ab >= t0 || m.usedAbility?.has(sid), dash: q.dash >= t0, hit: hits.length > 0, minHpPct: Math.min(hpNow, ...hits.map((x: [number, number]) => x[1])),
      sec: (now - t0) / 1000, solo: [...m.dmgBy.keys()].every((k: string) => k === sid), wts: [...wts].filter(Boolean), cls: h?.cls || session.stats?.classId || null,
      night: isNight(now), biome: typeof reg?.biome === "string" && reg.biome.startsWith("b_") ? reg.biome.slice(2) : null };
  }

  onMobKilled(m: any) {
    { const ks = m.killer && String(m.killer), km = ks && !ks.startsWith("mob:") ? this.ms.get(ks) : null; // убийца по журналу купола (не из-под купола)
      if (km) this.killLog.note(km.pkey, "m", this.underDome(km.zp.x, km.zp.y)); }
    ST.inc("kills"); if (m.elite) ST.inc("kills_elite"); if (m.cursed) ST.inc("kills_cursed"); if (m.ench) ST.inc("kills_ench"); if (m.special === "boss" || ZONE_MOBS[m.type]?.boss) ST.inc("kills_boss");
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
    // Сундук схватки: моб из пачки/лагеря → дроп копится; последний моб схватки — ОДИН сундук. Одиночка — мешок (ниже).
    const zw = (() => { for (const sid of m.dmgBy.keys()) { const p = this.partyPos(sid); if (p) return p.world; } return "arinar"; })();
    const zone: any = (this.zones as any)[zw];
    // сундук зачищенного лагеря: лагерный моб — добыча копится (мешка нет: без двойного броска); последний моб лагеря — ОДИН сундук
    const enc = zone ? this.camps.onKill(zw, m, (sid) => this.ms.get(sid)?.pkey || null) : null;
    if (enc) { enc.kills.push({ type: m.type, lootKey: MONSTER_LOOT[m.type] ? m.type : baseOf(m.type), elite: !!m.elite, cursed: !!m.cursed, ench: m.ench || 0, boss: !!d.boss || m.special === "boss", rare: !!d.rare, special: m.special || "", x: m.x, y: m.y }); if (d.boss) enc.anyBoss = true;
      for (const sid of recv.keys()) { const pk = this.ms.get(sid)?.pkey; if (pk && !enc.pkey.has(sid)) enc.pkey.set(sid, pk); } // отряд рядом
      if (this.camps.cleared(enc, zone.mobs)) { const c = (zone.camps || []).find((x: any) => x.id === enc.camp); if (c) { enc.x = c.x; enc.y = c.y; } else { enc.x = m.x; enc.y = m.y; } this.finishCamp(enc); } }
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
      { const bk = bestiaryKey(m.type); if (bk) noteMob(a, bk, 1); } // у варианта и варианта-босса («Часовой Пустоты») — своя карточка
      const lootKey = MONSTER_LOOT[m.type] ? m.type : base; // у каждого моба своя (правимая в админке) таблица
      // опыт: по уровню моба с поправкой на разницу уровней (серые мобы почти ничего не дают)
      const n = recv.get(sid) || 1;
      const xp = Math.round(killXp({ xp: d.xp, mobL: d.lvl || 1, heroL: h?.lvl || 1, elite: m.elite, cursed: m.cursed, boss: !!d.boss, enchXp: enchMul(m, "xp") }) * partyXpShare(n)); // balance.killXp: серые — 0, сильные — больше с потолком; отряд — доля
      const out: any = { xp, items: [], res: {}, mob: m.type, elite: !!m.elite, cursed: !!m.cursed, ench: m.ench || undefined, party: n > 1 ? n : undefined };
      if (h && xp > 0) out.levelUps = gainXp(h, xp);
      const src = `${d.boss ? "boss" : d.rare ? "rare" : "kill"}:${m.type}`;
      const lootMul = (m.cursed ? CURSE.mobDropMult : 1) * enchDropMult(m.ench || 0); // проклятый/зачарованный: шансы обычных вещей/материалов × (только сервер)
      // проклятые ВЕРСИИ вещей: только с проклятых боссов (CURSE.bossOnly), отдельный независимый бросок по базовому шансу
      const cursedRoll = !!m.cursed && (!CURSE.bossOnly || !!d.boss || m.special === "boss");
      // добыча НЕ в сумку: личный мешок на земле у трупа (открыть кликом/E, забрать по одному, Shift-проводкой или всё)
      if (!enc && !split && ownerGrp.includes(sid)) { // один бросок на убийство (как раньше), затем — делёж в отряде владельца мешка
        const roll = rollMonsterLoot(lootKey, cryptoRand, lootMul, cursedRoll, "world", m.ench || 0); // открытый мир: × equipDropMult и × matDropMult
        if (m.elite) { const l2 = rollMonsterLoot(lootKey, cryptoRand, lootMul, cursedRoll, "world", m.ench || 0); roll.items.push(...l2.items); for (const [r, k] of Object.entries(l2.res)) roll.res[r] = (roll.res[r] || 0) + k; } // элита: второй бросок
        split = splitLoot(roll, ownerGrp.filter((g) => recv.has(g)), cryptoRand);
      }
      const loot = split?.get(sid) || { items: [] as string[], res: {} as Record<string, number> };
      if (loot.items.length) { ST.inc("items_drop", loot.items.length); for (const it of loot.items) { const t = parseTag(String(it)); if (t.c) ST.inc("cursed_drop"); if (t.e) ST.inc("ench_drop"); } }
      const bag = enc ? null : this.loot.drop(session.world || "hellfire", m.x, m.y, ms.pkey, loot, src, d.boss ? "boss" : d.rare || m.elite ? "rare" : "mob", m.type);
      if (bag) out.bag = { id: bag.id, n: bag.entries.length, x: bag.x, y: bag.y };
      if (enc) { let left = 0; for (const o of zone.mobs) if (o.camp === enc.camp && o.respawnAt !== -1 && !enc.killed.has(o.id)) left++; out.enc = left; } // добыча копится в сундук лагеря; осталось мобов
      // квесты: kind — настоящий тип (вариант биома), сопоставление цели — goalMatch (вариант-босс ≠ базовый босс)
      const fight = this.fightFacts(m, sid, session, ms, h);
      const qf: any[] = [];
      const how = killHow(m, sid); // как убит (сервер считал каждый удар) — задания «одним ударом», «только навыками», «без навыков»
      this.qev(a, session, { type: "kill", mob: base, kind: m.type, cls, fight, failed: qf, lvl: d.lvl || 1, elite: !!m.elite, cursed: !!m.cursed, ench: m.ench || 0, boss: !!d.boss, rare: !!d.rare, party: n, ...how,
        night: session.world === "arinar" && dnAt(dnMinutes()).phase === "night", hpPct: ms.zp?.maxHp ? Math.round((ms.zp.hp / ms.zp.maxHp) * 100) : 100 });
      if (d.boss) this.qev(a, session, { type: "kill_boss", mob: base, kind: m.type, usedAbility: m.usedAbility.has(sid), fight, failed: qf });
      for (const f of qf) this.send(ws, { type: "quest_cond", qid: f.qid, i: f.i, ok: false, reason: f.reason, kill: 1 });
      this.push(ws, session, { loot: out });
    }
  }
  sessionLookup: ((sid: string) => [WebSocket, any] | null) | null = null;
  party!: Parties; partyAt = 0; regAt = 0;
  /** пересобрать лагеря локаций, чьи настройки плотности изменились (админка → D1 → applyOverride на этом экземпляре) */
  syncRegions() {
    for (const z of Object.values(this.zones as any) as any[]) z?.syncMobSkills?.(); // навыки мобов из админки — сразу у живых
    for (const z of Object.values(this.zones as any) as any[]) { const n = z?.syncMobStats?.() || 0; if (n) console.log(`[mc] ОЗ мобов из админки: обновлено живых ${n}`); } // ОЗ — тоже сразу у живых
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
        this.bev(session, { type: "party" }); { const e = this.sessionLookup?.(from); if (e) this.bev(e[1], { type: "party" }); }
        this.partySend(r); return;
      }
      case "party_leave": { const p = P.leave(me); this.send(ws, { type: "party_state", id: null }); this.partySend(p); return; }
      case "party_kick": { const r = P.kick(me, String(msg.sid || "")); if (typeof r === "string") return err(r); const e = this.sessionLookup?.(String(msg.sid)); if (e) this.send(e[0], { type: "party_state", id: null }); this.partySend(r); return; }
      case "party_promote": { const r = P.promote(me, String(msg.sid || "")); if (typeof r === "string") return err(r); this.partySend(r); return; }
      case "party_get": { const p = P.get(me); this.send(ws, p ? this.partyView(p) : { type: "party_state", id: null }); return; }
    }
  }
  loot!: LootBags; lootExpAt = 0;
  chests!: Chests; camps!: CampRuns; db: any = null; chestLoaded = false; chestSaving = false;
  // ---------- сундуки схватки ----------
  /** лагерь зачищен: ОДИН сундук в центре лагеря. Шансы — СЫРЫЕ из таблицы (без equipDropMult/matDropMult).
   * Проклятые мобы — прежние правила: обычные вещи/материалы × mobDropMult, проклятые копии — по CURSE.bossOnly и itemChanceMult. */
  finishCamp(e: CampRun) {
    this.camps.close(e);
    const groupOf = (sid: string) => { const p = this.party.get(sid); return p ? p.members.filter((x) => { const q = this.partyPos(x), me = this.partyPos(sid); return q && me && q.world === me.world && Math.hypot(q.x - e.x, q.y - e.y) < 1500; }) : [sid]; };
    const rec = recipients(e, (sid) => (CHEST.partyNear ? groupOf(sid) : [sid]));
    const last = e.kills[e.kills.length - 1], guardType = (e.kills.find((k) => !k.boss && !k.special) || last).type;
    const kind = e.anyBoss ? "boss" : e.kills.some((k) => k.rare || k.elite) ? "rare" : "mob";
    // второй сундук — с шансом campSecondPct (независимый второй бросок по тем же убийствам), чуть в стороне
    const n = 1 + (cryptoRand() * 100 < CHEST.campSecondPct ? 1 : 0);
    let any = false;
    for (let i = 0; i < n; i++) {
      const ents = rollChest(e, rec, groupOf, campRoll, cryptoRand);
      for (const en of ents) if (en.k === "item") { ST.inc("items_drop"); const t = parseTag(en.id); if (t.c) ST.inc("cursed_drop"); if (t.e) ST.inc("ench_drop"); }
      const c = this.chests.spawn(e.world, e.x + (i ? 70 : 0), e.y + (i ? 30 : 0), ents, `camp:${e.world}:${e.camp}`, kind, last.type, guardType, Date.now(), CHEST.campSpawnEmpty);
      if (!c) continue; any = true;
      for (const [sid, pk] of rec) { const en = this.sessionLookup?.(sid); const mine = c.entries.filter((x) => x.o === pk).length; if (en && (mine || c.keepEmpty)) this.send(en[0], { type: "chest_spawn", id: c.id, x: c.x, y: c.y, mine, kills: e.kills.length, second: i ? 1 : undefined }); }
    }
    if (!any) for (const sid of rec.keys()) { const en = this.sessionLookup?.(sid); if (en) this.send(en[0], { type: "toast", message: "Лагерь зачищен — в этот раз без добычи" }); } // пустой сундук не ставим (campSpawnEmpty выкл)
  }
  /** 🎁 окно сундуков наград: список + карточки вещей внутри (клиент не знает таблиц предметов) */
  private bchestMsg(ms: MetaSess, a: Account) {
    const L = chestList(a), cards: Record<string, any> = {};
    for (const c of L.list) for (const x of c.items || []) if (!ms.cards.has(x.id)) { const cc = itemCard(x.id); if (cc) { cards[x.id] = cc; ms.cards.add(x.id); } }
    return { type: "bchest_state", ...L, cards };
  }
  chestView(c: Chest, ms: MetaSess, extra: any = {}) {
    const now = Date.now(), ents = this.chests.visible(c, ms.pkey, now), cards: Record<string, any> = {};
    for (const e of ents) if (e.k === "item" && !ms.cards.has(e.id)) { const cc = itemCard(e.id); if (cc) { cards[e.id] = cc; ms.cards.add(e.id); } }
    return { type: "chest_view", now, id: c.id, x: c.x, y: c.y, pub: this.chests.isPublic(c, now) ? 1 : 0, pubAt: c.pubAt, exp: c.exp, entries: ents.map(({ o, ...r }) => ({ ...r, mine: o === ms.pkey ? 1 : undefined })), cards, ...extra };
  }
  chestOpen(ws: WebSocket, session: any, msg: any) {
    const ms = this.ms.get(session.id); if (!ms || !this.zoneOf(session)) return;
    if (ms.zp && ms.zp.alive === false) return this.send(ws, { type: "chest_err", id: Number(msg.chest), message: "Вы мертвы" });
    const c = this.chests.get(msg.chest, session.world || "hellfire", session.x, session.y);
    if (typeof c === "string") return this.send(ws, { type: "chest_err", id: Number(msg.chest), message: c });
    const r = this.chests.tryOpen(c, ms.pkey, session.id);
    if ("err" in r) return this.send(ws, { type: "chest_err", id: c.id, message: r.err });
    if ("channel" in r) return this.send(ws, { type: "chest_channel", id: c.id, until: r.channel, left: Math.max(0, r.channel - Date.now()), sec: CHEST.channelSec }); // left — остаток в мс: часы телефона могут отличаться от сервера
    ST.inc("chests_open"); this.send(ws, this.chestView(c, ms));
  }
  chestTake(ws: WebSocket, session: any, msg: any) {
    const ms = this.ms.get(session.id); if (!ms || !this.zoneOf(session)) return;
    const c = this.chests.get(msg.chest, session.world || "hellfire", session.x, session.y);
    if (typeof c === "string") return this.send(ws, { type: "chest_err", id: Number(msg.chest), message: c });
    const a = this.store.account(ms.pkey), out: any = { xp: 0, items: [], res: {}, fromChest: c.id };
    const r = this.chests.take(c, ms.pkey, msg.lid, (e) => {
      if (e.k === "res") { addRes(a, e.id, e.n); out.res[e.id] = e.n; return true; }
      const it = addItem(a, e.id, c.src, a.hero, !!e.c, (e as any).e || 0); if (!it) return false; out.items.push(it); (out.cards = {})[e.id] = itemCard(e.id); return true;
    });
    if (r.err) return this.send(ws, { type: "chest_err", id: c.id, message: r.err, lid: Number(msg.lid) });
    for (const it of out.items) { const rs = rollRunSkill(a, it, c.kind as any); if (rs) { out.runSkill = { ...RUN_SKILL_BY_ID[rs], from: it.id, uid: it.uid }; this.bev(session, { type: "runskill" }); break; } }
    const epic = out.items.find((it: any) => ["epic", "legendary", "mythic"].includes(ITEM_BY_ID[it.id]?.rarity));
    if (epic) this.zones[session.world || "hellfire"]?.events.push({ k: "announce", text: `💎 ${session.username || "Игрок"} добывает «${ITEM_BY_ID[epic.id].name}»!`, color: "#f0abfc" });
    { const seen: Set<number> = ((ms as any).chestSeen ||= new Set()); if (!seen.has(c.id)) { seen.add(c.id); this.bev(session, { type: "chest" }); } } // сундук считается один раз
    ms.dirty = true; this.push(ws, session, { loot: out });
    // всем, у кого этот сундук открыт — обновлённый вид (конкурентный доступ: позицию получает ровно один)
    for (const v of this.chests.viewers(c.id)) { const en = this.sessionLookup?.(v.sid), m2 = this.ms.get(v.sid); if (en && m2) this.send(en[0], this.chestView(c, m2, v.sid === session.id ? { taken: r.got!.lid } : { gone: r.got!.lid })); }
  }
  chestChan(now: number) {
    if (!this.chests.chan.size && !this.chests.open.size) return;
    const ev = this.chests.tick(now, (sid) => (this.ms.get(sid) as any)?.hurtAt || 0, (sid) => { const p = this.partyPos(sid); return p ? { world: p.world, x: p.x, y: p.y, alive: p.alive } : null; });
    for (const e of ev) { const en = this.sessionLookup?.(e.sid), ms = this.ms.get(e.sid); if (!en || !ms) continue;
      if (e.k === "opened") { const c = this.chests.chests.get(e.id); if (c) this.send(en[0], this.chestView(c, ms, { opened: 1 })); }
      else this.send(en[0], { type: e.k === "cancel" ? "chest_cancel" : "chest_close", id: e.id, message: e.why }); }
  }
  chestTick(now: number) {
    if (!this.chestLoaded) { this.chestLoaded = true; this.chestLoad().catch((e) => console.error("[mc] chest load", e?.message || e)); }
    if (!this.bmLoaded) { this.bmLoaded = true; this.bmInit(); this.bmLoad().catch((e) => { this.bm.loaded = true; console.error("[mc] black mage load", e?.message || e); }); }
    this.camps.expire(now); // зачистки без убийств дольше campIdleSec — сброс
    this.chests.expire(now);
    for (const c of this.chests.chests.values()) if (CHEST.guard && !c.guarded && now >= c.pubAt && c.entries.length) this.guardChest(c);
    if (!this.chestSaving && (this.chests.dirty.size || this.chests.removed.size)) this.chestSave().catch((e) => console.error("[mc] chest save", e?.message || e));
  }
  /** стража общего сундука: если рядом нет живых мобов — пачка того же вида (не возрождается; лагерь вокруг и так возрождается) */
  guardChest(c: Chest) {
    c.guarded = 1; this.chests.dirty.add(c.id);
    const z: any = (this.zones as any)[c.world]; if (!z || !ZONE_MOBS[c.guardType] || !CHEST.guardN) return;
    if (z.near(c.x, c.y, 400).some((m: any) => !m.dead && Math.hypot(m.x - c.x, m.y - c.y) < 400)) return;
    for (let i = 0; i < CHEST.guardN; i++) { const a = (i / CHEST.guardN) * Math.PI * 2, mm = z.addMob(c.guardType, c.x + Math.cos(a) * 70, c.y + Math.sin(a) * 70, { fixed: false, respawn: 0 }); (mm as any).chestGuard = c.id; }
  }

  // ——— Чёрный маг: связь с зоной, урон игрокам, смерть, очернение, сохранение ———
  bmInit() {
    const z = this.zones.arinar; if (!z) return;
    z.guard = this.guardMux; FREEZE_GUARD.inDome = (x, y) => this.guardMux.inDome(x, y);
    // город под куполом (city.ts): мобы не заходят, лагеря/мобы с домом внутри — убраны; места NPC — в реестр
    z.keepOut = cityKeepOut();
    const pruned = z.pruneKeepOut(); syncCityNpcs(NPCS as any); console.log(`[mc] город: убрано мобов под куполом ${pruned}`);
    this.bm.host = {
      hurt: (sid, pct, src, blkAdd) => this.bmHurt(sid, pct, src, blkAdd),
      push: (sid, x, y) => { const e = this.sessionLookup?.(sid); const ms = this.ms.get(sid); if (!e) return; const s2 = e[1]; s2.x = x; s2.y = y; (s2 as any).lastMoveAt = Date.now(); if (ms) { ms.zp.x = x; ms.zp.y = y; } this.send(e[0], { type: "pos_fix", x: Math.round(x), y: Math.round(y), bm: 1 }); },
      pkeyOf: (sid) => this.ms.get(sid)?.pkey || null,
      dirty: () => { this.bmDirty = true; },
      roseAdded: (r) => { if (this.db) this.db.prepare("INSERT OR IGNORE INTO black_roses (id, world, x, y, born, pkey) VALUES (?, ?, ?, ?, ?, ?)").bind(r.id, "arinar", r.x, r.y, r.born, r.pkey || null).run().catch((e: any) => console.error("[mc] rose save", e?.message || e)); },
    };
  }
  /** урон мага: pct % макс. ОЗ (истинный — броня не режет), неуязвимость рывка/навыка работает (уклониться можно) */
  bmHurt(sid: string, pct: number, src: "arrow" | "expl", blkAdd: number) {
    const ms = this.ms.get(sid); if (!ms || !ms.zp.alive) return;
    const now = Date.now(), z = this.zones.arinar;
    if (isInvuln(ms, now)) return;
    if (this.bm.playerSafe(sid, ms.zp.x, ms.zp.y) || this.citySafe(ms)) return;
    this.pkCombat(sid, "hit");
    const real = Math.max(1, Math.round(ms.zp.maxHp * Math.max(0, pct) / 100));
    ms.zp.hp -= real; (ms as any).hurtAt = now;
    this.qNote(ms, "hit", now);
    z?.events.push({ k: "phit", sid, d: real, src: "black_mage", bm: src === "expl" ? 2 : 1 });
    if (blkAdd > 0) { const e = this.sessionLookup?.(sid), cls = e?.[1]?.stats?.classId; if (cls && blackenEquipped(this.store.account(ms.pkey), this.store.hero(ms.pkey, cls), blkAdd)) { ms.dirty = true; (ms as any).bmMeta = true; } }
    if (ms.zp.hp <= 0 && tryRevive(ms as any)) { z?.events.push({ k: "previve", sid, hp: ms.zp.hp }); this.bevSid(sid, { type: "revive" }); }
    else if (ms.zp.hp <= 0) {
      ms.zp.hp = 0; ms.zp.alive = false; ms.zp.respawnAt = now + 5000; z?.events.push({ k: "pdie", sid, bm: 1 }); ST.inc("deaths"); this.bevSid(sid, { type: "death", by: "bm" });
      this.bmDeath(sid, ms);
    }
  }
  /** смерть от мага: надетым вещам +N % очернения (N — попадания мага с прошлой смерти), роза на месте смерти */
  bmDeath(sid: string, ms: any) {
    const n = this.bm.onPlayerDeath(sid, ms.zp.x, ms.zp.y);
    const e = this.sessionLookup?.(sid), cls = e?.[1]?.stats?.classId;
    void n; void cls; // очернение теперь — сразу за каждое попадание (bmHurt, hitBlk); смерть — только роза
  }
  /** проклятая земля под игроком (раз в 0,5 с): меняет статы молча (refreshZonePlayer), игроку не сообщается */
  bmGround(s: any, ms: any, now: number) {
    if (now - ((ms as any).bmGrAt || 0) < 500) return; (ms as any).bmGrAt = now;
    const on = (s.world || "hellfire") === "arinar" && this.bm.cursedAt(s.x, s.y);
    if (on !== !!(ms as any).dark) { (ms as any).dark = on; this.refreshZonePlayer(s); this.bmGroundHook(s, on); }
  }
  /** хук на будущее (развитие проклятой земли): вошёл/вышел */
  bmGroundHook(_s: any, _on: boolean) {}
  /** движение игрока (room.ts): напавший не войдёт в купол */
  bmClampMove(session: any, x: number, y: number): [number, number] | null {
    if ((session.world || "hellfire") !== "arinar") return null;
    const c = this.bm.clampMove(session.id, x, y); if (c) return c;
    return this.cityClamp(session, x, y);
  }

  // ——— Город под куполом (city.ts) и PK-режим: всё решает сервер ———
  killLog = new KillLog();
  /** guard зоны Аринара: купола мага + город (урон 0 внутри, снаряды через край гаснут) + PvP-попадания */
  guardMux: any = {
    guardMobHit: (m: any, sid: string, ax: number, ay: number) => {
      if (CITY_CFG.noDamage !== false && sid && !sid.startsWith("mob:") && (inCity(m.x, m.y) || (Number.isFinite(ax) && inCity(ax, ay)))) return true;
      return this.bm.guardMobHit(m, sid, ax, ay);
    },
    noteFight: (m: any, sid: string) => this.bm.noteFight(m, sid),
    guardProj: (p: any, x0: number, y0: number, x1: number, y1: number) => {
      if (CITY_CFG.noDamage !== false && inCity(x0, y0) !== inCity(x1, y1)) { this.zones.arinar?.events.push({ k: "cityblock", x: Math.round(x1), y: Math.round(y1) }); return true; } // край купола гасит любой снаряд (и стрелы мага)
      return this.bm.guardProj(p, x0, y0, x1, y1);
    },
    inDome: (x: number, y: number) => this.bm.inDome(x, y) || (CITY_CFG.noDamage !== false && inCity(x, y)),
    blackHit: (p: any, pl: any) => (inCity(pl.x, pl.y) ? false : this.bm.blackHit(p, pl)),
    pvpHit: (p: any, pl: any) => this.pvpStrike(p.sid, pl.sid, p.pvk || 1, p),
  };
  citySafe(ms: any) { return CITY_CFG.noDamage !== false && inCity(ms.zp.x, ms.zp.y); }
  pkMap = new Map<string, PkState>();
  /** PK-состояние — по ключу игрока (переподключение не сбрасывает; флаг pk хранится в аккаунте) */
  pkOf(ms: any): PkState {
    let P = this.pkMap.get(ms.pkey);
    if (!P) { P = newPk(); P.pk = !!(this.store.account(ms.pkey) as any).pk; this.pkMap.set(ms.pkey, P); }
    ms.pk = P; return P;
  }
  /** «под куполом» (город или купол/сфера мага) — убийства оттуда не считаются */
  underDome(x: number, y: number) { return inCity(x, y) || !!this.bm.inDome(x, y); }
  /** безопасная зона для PvP: город, купол мага (кто не нападал), хаб и места NPC */
  pvpSafe(sid: string, ms: any) { const x = ms.zp.x, y = ms.zp.y; return inCity(x, y) || this.bm.playerSafe(sid, x, y) || inSafe(x, y, 0, "arinar"); }
  /** убийца: PK-режим или журнал убийств; until — мс (PK — 0: пока режим включён) */
  killerOf(ms: any, now = Date.now()): { killer: boolean; until: number; why: string } {
    const st = this.killLog.status(ms.pkey, now), pk = this.pkOf(ms).pk && CITY_CFG.pkBlocked !== false;
    return { killer: pk || st.killer, until: st.until, why: pk ? "pk" : st.why };
  }
  cityDenyMsg(session: any, ms: any, k: { until: number; why: string }, now: number) {
    if (now - ((ms as any).cityDenyAt || 0) < Math.max(0.3, Number(CITY_CFG.denyMsgSec) || 2) * 1000) return; (ms as any).cityDenyAt = now;
    const e = this.sessionLookup?.(session.id); if (!e) return;
    const sec = k.until > now ? Math.ceil((k.until - now) / 1000) : 0;
    const why = k.why === "pk" ? "Вы в PK-режиме — купол не пускает убийц. Выключите PK (30 с без боя)" + (sec ? `, а затем ещё ${Math.ceil(sec / 60)} мин.` : ".")
      : k.why === "p" ? `Купол не пускает убийц: вы убили игрока за последние ${CITY_CFG.windowMin} мин.` : `Купол не пускает убийц: вы убили ${CITY_CFG.killerM}+ мобов за последние ${CITY_CFG.windowMin} мин.`;
    this.send(e[0], { type: "city_deny", why: k.why, sec, until: k.until, message: why });
  }
  /** движение: убийца не войдёт в купол (точка за краем) */
  cityClamp(session: any, x: number, y: number): [number, number] | null {
    if (!inCity(x, y, 12)) return null;
    const ms = this.ms.get(session.id); if (!ms) return null;
    const now = Date.now(), k = this.killerOf(ms, now); if (!k.killer) return null;
    this.cityDenyMsg(session, ms, k, now);
    return pushOut(x, y, 24 + CITY_TILE * Math.max(0, Number(CITY_CFG.pushExtraTiles) || 0));
  }
  /** такт игрока Аринара: PK-отсчёт, убийцу внутри — за край (стал убийцей внутри, телепорт, вход в игру) */
  cityTick(ws: WebSocket, s: any, ms: any, now: number) {
    const P = this.pkOf(ms);
    if (pkTick(P, now)) { this.pkSend(ws, ms, now); if (s.stats) s.stats.pk = P.pk ? 1 : 0; ST.inc(P.pk ? "pk_on" : "pk_off"); (this.store.account(ms.pkey) as any).pk = P.pk ? 1 : undefined; ms.dirty = true;
      this.send(ws, { type: "toast", message: P.pk ? "⚔ PK-режим включён: вы можете нападать на игроков. Купол Альказака вас не пустит." : "PK-режим выключен", color: P.pk ? PK_CFG.color : "#a7f3d0" }); }
    const k = this.killerOf(ms, now);
    if (s.stats) pkPublic(s.stats, P, PK_CFG.tagKiller !== false && k.killer && !P.pk, now); // видят все: полоса отсчёта над героем, значок PK у убийц
    if (!ms.zp.alive || !inCity(s.x, s.y)) return;
    if (!(ms as any).cityIn) { (ms as any).cityIn = 1; this.bev(s, { type: "city" }); } // доска: скрытое достижение — один раз (повтор отсекает boardEvent)
    if (!k.killer) return;
    const wasRoom = inRoomArea(s.x, s.y);
    const [nx, ny] = pushOut(s.x, s.y, 24 + CITY_TILE * Math.max(0, Number(CITY_CFG.pushExtraTiles) || 0));
    s.x = nx; s.y = ny; ms.zp.x = nx; ms.zp.y = ny; (s as any).lastMoveAt = now;
    this.send(ws, { type: "pos_fix", x: Math.round(nx), y: Math.round(ny), city: 1 }); this.cityDenyMsg(s, ms, k, now);
    if (wasRoom) this.cityRoomNote(ws, s, "kick");
  }
  /** двери зданий города (room.ts → после шага): снаружи у двери — в комнату; в комнате на клетке выхода — наружу */
  cityDoors(ws: WebSocket, session: any) {
    if (CITY_CFG.on === false) return;
    const ms = this.ms.get(session.id); if (!ms || !ms.zp.alive) return;
    const now = Date.now(), x = session.x, y = session.y;
    const inR = roomAt(x, y);
    if (inR) {
      if (!onExit(inR, x, y)) return;
      const [ox, oy] = outsideDoor(inR); this.cityTeleport(ws, session, ms, ox, oy, now); (ms as any).doorAt = now; (ms as any).doorOut = inR.id;
      ST.inc("city_room_out"); this.cityRoomNote(ws, session, "exit", inR.id); return;
    }
    const b = doorNear(x, y);
    if (!b) { (ms as any).doorOut = ""; return; }
    if ((ms as any).doorOut === b.id || now - ((ms as any).doorAt || 0) < 600) return; // только что вышел — сперва отойти от двери
    if (this.killerOf(ms, now).killer) return; // убийцу купол и так не пустит
    const [sx, sy] = roomSpawn(b); this.cityTeleport(ws, session, ms, sx, sy, now); (ms as any).doorAt = now;
    ST.inc("city_room_in"); this.cityRoomNote(ws, session, "enter", b.id);
  }
  cityTeleport(ws: WebSocket, session: any, ms: any, x: number, y: number, now: number) {
    session.x = x; session.y = y; ms.zp.x = x; ms.zp.y = y; (session as any).lastMoveAt = now;
    this.send(ws, { type: "pos_fix", x: Math.round(x), y: Math.round(y), door: 1 });
  }
  /** клиенту: в каком здании герой (null — снаружи); комнату он рисует сам по interiors_dark.json */
  cityRoomNote(ws: WebSocket, session: any, how: string, id?: string) {
    const b = roomAt(session.x, session.y);
    this.send(ws, { type: "city_room", how, id: b?.id || null, room: b?.room || null, ox: b?.ox, oy: b?.oy, name: b?.name || (id ? buildingById(id)?.name : "") || "" });
  }
  pkSend(ws: WebSocket, ms: any, now = Date.now()) {
    const P = this.pkOf(ms), k = this.killLog.status(ms.pkey, now);
    { const e = this.sessionLookup?.(ms.sid || ms.id); const st = e?.[1]?.stats; if (st) pkPublic(st, P, PK_CFG.tagKiller !== false && k.killer && !P.pk, now); }
    this.send(ws, { type: "pk_state", pk: P.pk, to: P.to, left: pkLeft(P, now), leftMs: P.to === null ? 0 : Math.max(0, P.at + P.dur - now), durMs: P.dur, cancels: (P as any).cancels || 0, dur: Math.round(P.dur / 1000), on: PK_CFG.on !== false, killer: k.killer ? { until: k.until, why: k.why, sec: Math.ceil((k.until - now) / 1000) } : null, color: PK_CFG.color });
  }
  /** бой (нанёс/получил урон): PK-отсчёт сбрасывается */
  pkCombat(sid: string, kind: "hit" | "deal" = "hit") {
    if ((kind === "hit" ? PK_CFG.cancelOnHit : PK_CFG.cancelOnDeal) === false) return; // админка: этот вид боя отсчёт не сбрасывает
    const ms = this.ms.get(sid); if (!ms || !(ms as any).pk) return;
    if (pkInterrupt((ms as any).pk)) { const e = this.sessionLookup?.(sid); if (e) { this.pkSend(e[0], ms); this.send(e[0], { type: "toast_error", message: "Бой — отсчёт PK-режима сброшен" }); } }
  }
  /** удар игрока a по игроку v (автоатака: дуга или снаряд). true — попадание засчитано (снаряд гаснет) */
  pvpStrike(aSid: string, vSid: string, k: number, proj?: any): boolean {
    if (!aSid || !vSid || aSid === vSid) return false;
    const ams = this.ms.get(aSid), vms = this.ms.get(vSid); if (!ams || !vms || !ams.zp.alive || !vms.zp.alive) return false;
    const ea = this.sessionLookup?.(aSid), ev = this.sessionLookup?.(vSid); if (!ea || !ev) return false;
    const sa = ea[1], sv = ev[1]; if ((sa.world || "hellfire") !== "arinar" || (sv.world || "hellfire") !== "arinar" || sa.inDuel || sv.inDuel) return false;
    if (PK_CFG.on === false) return false;
    const now = Date.now(), A = this.pkOf(ams), V = this.pkOf(vms);
    const how = pvpAllowed(A, V, vSid, this.pvpSafe(aSid, ams), this.pvpSafe(vSid, vms), now); if (!how) return false;
    const z = this.zones.arinar; this.pkCombat(aSid, "deal"); this.pkCombat(vSid, "hit"); (ams as any).hitAt = now;
    if (how === "pk" && !V.pk) pkGrantDefense(V, aSid, now); // жертва может ответить (самооборона)
    if (isInvuln(vms, now)) return true;
    const eff = this.effective(sa), crit = cryptoRand() * 100 < eff.critPct;
    const raw = eff.weaponMin + cryptoRand() * (eff.weaponMax - eff.weaponMin);
    const real = Math.max(1, Math.round(raw * (1 + eff.dmgPct / 100) * (crit ? 1.75 : 1) * k * Math.max(0, Number(PK_CFG.dmgMult) || 0) * (1 - vms.zp.armorRed)));
    vms.zp.hp -= real; (vms as any).hurtAt = now; this.qNote(vms, "hit", now);
    z?.events.push({ k: "phit", sid: vSid, d: real, src: "pvp", by: aSid, crit: crit ? 1 : undefined });
    if (vms.zp.hp <= 0 && tryRevive(vms as any)) { z?.events.push({ k: "previve", sid: vSid, hp: vms.zp.hp }); return true; }
    if (vms.zp.hp > 0) return true;
    // смерть — обычная (как от моба): без новых потерь
    vms.zp.hp = 0; vms.zp.alive = false; vms.zp.respawnAt = now + 5000; z?.events.push({ k: "pdie", sid: vSid, pvp: aSid }); ST.inc("deaths"); ST.inc("pvp_kills"); this.bm.hits.delete(vSid);
    this.onPvpKill(aSid, ams, sa, vSid, vms, sv, how, now);
    return true;
  }
  /** убийство игрока: пожизненная статистика обоим, журнал убийц — только за PK-убийство не из-под купола (самооборона не делает убийцей) */
  onPvpKill(aSid: string, ams: any, sa: any, vSid: string, vms: any, sv: any, how: "pk" | "def", now: number) {
    const aa = this.store.account(ams.pkey), va = this.store.account(vms.pkey);
    const ka = ((aa as any).kst ??= { pk: 0, pd: 0 }), kv = ((va as any).kst ??= { pk: 0, pd: 0 });
    ka.pk = (ka.pk || 0) + 1; kv.pd = (kv.pd || 0) + 1; ams.dirty = true; vms.dirty = true;
    const counted = how === "pk" && this.killLog.note(ams.pkey, "p", this.underDome(ams.zp.x, ams.zp.y), now);
    if (counted) (aa as any).klp = (this.killLog.p.get(ams.pkey) || []).slice(-20); // убийства игроков — переживают перезапуск сервера
    const ea = this.sessionLookup?.(aSid), ev = this.sessionLookup?.(vSid);
    if (ea) { this.send(ea[0], { type: "pvp_kill", victim: this.displayName(sv), counted, self: how === "def" }); this.pkSend(ea[0], ams, now); }
    if (ev) this.send(ev[0], { type: "pvp_death", killer: this.displayName(sa) });
  }
  /** PvP-дуга (ближний удар): игроки в секторе — как цели моба */
  pvpArc(session: any, ms: any, ox: number, oy: number, vx: number, vy: number, atk: any, per: number) {
    if (PK_CFG.on === false) return;
    const R = atk.range + 14, arc = atk.arc || 1;
    for (const m2 of this.ms.values()) {
      if (m2.sid === session.id || !m2.zp.alive) continue;
      const ex = m2.zp.x - ox, ey = m2.zp.y - oy, d = Math.hypot(ex, ey); if (d > R) continue;
      if (d > 16 && Math.acos(Math.max(-1, Math.min(1, (ex * vx + ey * vy) / (d || 1)))) > arc) continue;
      this.pvpStrike(session.id, m2.sid, per);
    }
  }
  /** удар моба по игроку (zone.update): общий путь — им же пользуется плейтест купола (dev domeHit) */
  zoneHit(w: string, zone: any, sid: string, dmg: number, src: string, mob: any, now: number) {
    const ms = this.ms.get(sid);
    if (!ms || !ms.zp.alive) return;
    if (mob && !mob.qf?.has(sid)) this.engage(mob, sid); // моб ударил первым — бой (условия квестов) начался
    if (isInvuln(ms, now)) return; // неуязвимость навыка (прыжок, облако, рывок)
    if (w === "arinar" && this.citySafe(ms)) { (this as any).cityBlocked = ((this as any).cityBlocked || 0) + 1; return; } // город: урон 0 (счётчик — для плейтеста)
    if (w === "arinar" && (this.bm.playerSafe(sid, ms.zp.x, ms.zp.y) || this.citySafe(ms))) return; // купол Чёрного мага / город: неуязвим
    if (w === "arinar") this.pkCombat(sid, "hit"); // получил урон — PK-отсчёт сброшен
    const gap = levelGapDmgMult(ZONE_MOBS[src]?.lvl || 1, ms.pub?.lvl || 1); // формула: разница уровней
    const real = Math.max(1, Math.round(dmg * gap * (1 - ms.zp.armorRed) * (((ms as any).drUntil || 0) > now ? 0.5 : 1)));
    ms.zp.hp -= real; (ms as any).hurtAt = now;
    this.qNote(ms, "hit", now); // условия квестов: удар получен, минимум ОЗ
    zone.events.push({ k: "phit", sid, d: real, src });
    if (ms.zp.hp <= 0 && tryRevive(ms as any)) { zone.events.push({ k: "previve", sid, hp: ms.zp.hp }); this.bevSid(sid, { type: "revive" }); } // талант: раз за бой
    else if (ms.zp.hp <= 0) { ms.zp.hp = 0; ms.zp.alive = false; ms.zp.respawnAt = now + 5000; zone.events.push({ k: "pdie", sid }); ST.inc("deaths"); this.bevSid(sid, { type: "death" }); if (w === "arinar") this.bm.hits.delete(sid); } // умер не от мага — счёт попаданий мага сгорает
  }
  /** dev (MC_DEV_TRUST_USERID): PK сразу, накрутить убийства, включить места NPC, статус */
  cityDev(ws: WebSocket, session: any, ms: any, a: any, o: any) {
    const now = Date.now(), P = this.pkOf(ms);
    if (o.pk !== undefined) { P.pk = !!o.pk; P.to = null; if (session.stats) session.stats.pk = P.pk ? 1 : 0; a.pk = P.pk ? 1 : undefined; this.pkSend(ws, ms); }
    if (Array.isArray(o.mobAt)) { // плейтест: ближайший моб — в точку (за край купола) и в бой с игроком
      const z = this.zones.arinar; const m = (z?.mobs || []).filter((x: any) => !x.dead && !x.special).sort((p: any, q: any) => Math.hypot(p.x - session.x, p.y - session.y) - Math.hypot(q.x - session.x, q.y - session.y))[0];
      if (m) { m.x = m.sx = Number(o.mobAt[0]); m.y = m.sy = Number(o.mobAt[1]); m.reset = false; m.targetSid = session.id; m.dmgBy?.set(session.id, (m.dmgBy.get(session.id) || 0) + 1); (ms as any).devMob = m.id; }
    }
    if (o.domeHit) { // плейтест: удар моба по игроку тем же путём, что в zone.update (внутри купола — урон 0, счётчик cityBlocked)
      const z = this.zones.arinar, dm = z && (ms as any).devMob ? z.mobs.find((x: any) => x.id === (ms as any).devMob) : null;
      for (let i = 0; i < Number(o.domeHit); i++) this.zoneHit("arinar", z, session.id, 25, dm?.type || "rot_glitch", dm || null, now);
    }
    if (o.fastPk) { (PK_CFG as any).enterSec = Number(o.fastPk.enter ?? PK_CFG.enterSec); (PK_CFG as any).exitSec = Number(o.fastPk.exit ?? PK_CFG.exitSec); }
    if (o.mobKills) for (let i = 0; i < Number(o.mobKills); i++) this.killLog.note(ms.pkey, "m", false, now - i);
    if (o.pvpKills) for (let i = 0; i < Number(o.pvpKills); i++) this.killLog.note(ms.pkey, "p", false, now - i);
    if (o.domeKill) { const ud = this.underDome(session.x, session.y); this.killLog.note(ms.pkey, "m", ud, now); this.killLog.note(ms.pkey, "p", ud, now); } // плейтест: тот же путь, что onMobKilled/onPvpKill
    if (o.clearKills) { this.killLog.m.delete(ms.pkey); this.killLog.p.delete(ms.pkey); delete a.klp; this.pkSend(ws, ms, now); }
    if (o.mobKills || o.pvpKills) this.pkSend(ws, ms, now); // клиенту — новый статус убийцы (значок PK)
    if (Array.isArray(o.npcOn)) { (CITY_CFG.npc as any[]).forEach((sl, i) => (sl.on = o.npcOn.includes(i))); syncCityNpcs(NPCS as any); this.cityVer++; }
    if (o.posNow) this.posNote(session, ms, true);
    const k = this.killerOf(ms, now);
    const dm = (ms as any).devMob != null ? this.zones.arinar?.byId?.get((ms as any).devMob) : null;
    this.send(ws, { type: "dev_city", blocked: (this as any).cityBlocked || 0, mob: dm && !dm.dead ? { x: Math.round(dm.x), y: Math.round(dm.y), t: dm.type, tg: dm.targetSid || null } : null, inCity: inCity(session.x, session.y), me: { x: Math.round(session.x), y: Math.round(session.y), w: session.world }, pk: P.pk, to: P.to, left: pkLeft(P, now), killer: k,
      m: this.killLog.count(ms.pkey, "m", now), p: this.killLog.count(ms.pkey, "p", now), kst: a.kst || null, lastPos: a.lastPos || null, city: cityClient(), hp: Math.round(ms.zp.hp), alive: ms.zp.alive });
  }
  cityVer = 1;
  /** «📊» и клиенту: настройки города (отрисовка) */
  cityView() { return cityClient(); }
  async bmLoad() {
    if (!this.db) { this.bm.loaded = true; return; }
    await this.db.prepare("CREATE TABLE IF NOT EXISTS bm_state (k TEXT PRIMARY KEY, data TEXT NOT NULL, updated_at INTEGER NOT NULL)").run();
    await this.db.prepare("CREATE TABLE IF NOT EXISTS black_roses (id INTEGER PRIMARY KEY, world TEXT NOT NULL, x INTEGER NOT NULL, y INTEGER NOT NULL, born INTEGER NOT NULL, pkey TEXT)").run();
    const st = await this.db.prepare("SELECT data FROM bm_state WHERE k = 'arinar'").first().catch(() => null);
    if (st?.data) { try { this.bm.restore(JSON.parse(st.data)); } catch {} }
    const r = await this.db.prepare("SELECT id, x, y, born, pkey FROM black_roses WHERE world = 'arinar'").all();
    for (const row of r?.results || []) if (!this.bm.roses.some((q) => q.id === row.id)) this.bm.addRose({ id: Number(row.id), x: Number(row.x), y: Number(row.y), born: Number(row.born), pkey: row.pkey || null });
    this.bm.loaded = true;
    console.log(`[mc] Чёрный маг: розы ${this.bm.roses.length}, купола ${this.bm.domes.length}`);
  }
  async bmSave() {
    this.bmDirty = false; if (!this.db) return; this.bmSaving = true;
    try { await this.db.prepare("INSERT INTO bm_state (k, data, updated_at) VALUES ('arinar', ?, ?) ON CONFLICT(k) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at").bind(JSON.stringify(this.bm.serialize()), Date.now()).run(); }
    finally { this.bmSaving = false; }
  }
  /** dev (MC_DEV_TRUST_USERID=1 + localhost): управление магом для плейтестов */
  bmDev(ws: WebSocket, session: any, ms: any, a: Account, h: Hero | null, o: any) {
    const bm = this.bm, now = bmClock.now();
    if (o.here) { bm.x = bm.homeX = bm.tx = session.x + (Number(o.dx) || 160); bm.y = bm.homeY = bm.ty = session.y + (Number(o.dy) || 0); bm.moving = false; bm.pauseUntil = now + 60000; }
    if (o.tp) bm.teleport(now);
    if (o.at) { bm.x = bm.homeX = bm.tx = Number(o.at.x) || bm.x; bm.y = bm.homeY = bm.ty = Number(o.at.y) || bm.y; bm.moving = false; bm.pauseUntil = now + 60000; }
    if (o.clearMobs) { const z = this.zones.arinar as any; for (const m of z.near(session.x, session.y, Math.min(1500, Number(o.clearMobs) || 600))) if (!m.dead && (!m.special || o.clearBoss)) z.kill(m, () => {}); } // dev: убрать мобов вокруг (без наград)
    let spot: any = null; // плейтест: открытое место (вся окрестность R проходима, мобов нет, вне хаба)
    if (o.openSpot) { const R = Math.min(1200, Number(o.openSpot) || 600), z = this.zones.arinar as any; let best = Infinity;
      for (let i = 0; i < 1500; i++) { const x = 3000 + Math.random() * 42000, y = 3000 + Math.random() * 42000;
        if (Math.hypot(x - 24000, y - 24000) < 1200 + R + 400 || bm.blocked("arinar", x, y, 24)) continue;
        let n = 0, all = 0; for (let dx = -R; dx <= R; dx += 64) for (let dy = -R; dy <= R; dy += 64) if (dx * dx + dy * dy <= R * R) { all++; if (bm.blocked("arinar", x + dx, y + dy, 16)) n++; }
        if (n > all * 0.04) continue;
        const mobs = z.near(x, y, R + 200).filter((m: any) => !m.dead && !m.special).length, sc = mobs * 10 + n; // меньше мобов, потом — меньше преград
        if (sc < best) { best = sc; spot = { x: Math.round(x), y: Math.round(y), blockedPct: Math.round(n / all * 100), mobs }; } }
      // мобов в окрестности убрать (dev, без наград) — лагеря вернутся по своему таймеру
      if (spot) for (const m of z.near(spot.x, spot.y, R + 200)) if (!m.dead && !m.special) z.kill(m, () => {}); }
    if (o.walk) { bm.tx = bm.x + (Number(o.walk.dx) || 0); bm.ty = bm.y + (Number(o.walk.dy) || 0); bm.moving = true; bm.pauseUntil = 0; } // шаг к точке (скриншот ходьбы)
    if (o.aggro) bm.hitMage(session.id);
    if (o.calm) { bm.aggro.clear(); bm.volley = null; bm.fights.clear(); }
    if (o.dome) bm.castDome(o.dome === "me" ? session.x : bm.x, o.dome === "me" ? session.y : bm.y, o.kind === "c" ? "c" : o.kind === "s" ? "s" : "w", this.zones.arinar.pl || new Map(), now);
    if (o.clearDomes) bm.domes = [];
    if (o.smallCd === 0) bm.smallCdAt = 0;
    if (o.domeCd === 0) bm.domeCdAt = 0;
    if (Number.isFinite(Number(o.days))) bmClock.offset += Number(o.days) * DAY_MS; // «перемотка» часов мага (рост роз, купола)
    if (o.resetClock) bmClock.offset = 0;
    if (o.rose) { const id = Date.now() * 1000 + Math.floor(Math.random() * 1000); bm.addRose({ id, x: Math.round(session.x + (Number(o.rose.dx) || 0)), y: Math.round(session.y + (Number(o.rose.dy) || 0)), born: now - (Number(o.rose.ageDays) || 0) * DAY_MS, pkey: ms.pkey }, true); }
    if (o.blk != null && h) { const v = Math.max(0, Math.min(100, Number(o.blk) || 0)); for (const uid of Object.values(h.equip || {})) { const it = a.inv.find((i) => i.uid === uid); if (it) { if (v > 0) it.blk = v; else delete it.blk; } } }
    if (o.blkUid) { const it = a.inv.find((i) => i.uid === String(o.blkUid.uid)); if (it) { const v = Math.max(0, Math.min(100, Number(o.blkUid.v) || 0)); if (v > 0) it.blk = v; else delete it.blk; } }
    if (o.hits) bm.hits.set(session.id, { n: Number(o.hits) | 0, at: now });
    if (o.hurt) this.bmHurt(session.id, Number(o.hurt.pct) || 0, o.hurt.src === "arrow" ? "arrow" : "expl", Number(o.hurt.blk) || 0); // dev: урон/очернение мага по себе (как взрыв)
    if (o.die) { ms.zp.hp = 0; ms.zp.alive = false; ms.zp.respawnAt = Date.now() + 5000; this.bmDeath(session.id, ms); } // dev: смерть от мага (+N очернения, N — попадания)
    if (o.mortal) { ms.invulnUntil = 0; ms.zp.alive = true; ms.zp.hp = ms.zp.maxHp; }
    if (Number(o.hp) > 0 && ms.zp.alive) ms.zp.hp = Math.min(ms.zp.maxHp, Number(o.hp)); // dev: задать ОЗ (сцена смерти) // снять dev-неуязвимость (dev_teleport god)
    this.send(ws, { type: "dev_bm", info: bm.info(), cursed: bm.cursedAt(session.x, session.y), dark: !!ms.dark, eff: this.effective(session), offset: bmClock.offset, me: { x: Math.round(session.x), y: Math.round(session.y) }, spot, mobs: ((this.zones.arinar as any)?.near(session.x, session.y, 500) || []).filter((m: any) => !m.dead).map((m: any) => [m.id, m.type, Math.round(m.x), Math.round(m.y)]) });
  }
  async chestLoad() {
    if (!this.db) return;
    await this.db.prepare("CREATE TABLE IF NOT EXISTS loot_chests (id INTEGER PRIMARY KEY, world TEXT NOT NULL, exp INTEGER NOT NULL, data TEXT NOT NULL)").run();
    const now = Date.now(), r = await this.db.prepare("SELECT data FROM loot_chests WHERE exp > ?").bind(now).all();
    const list: Chest[] = []; for (const row of r?.results || []) { try { list.push(JSON.parse(row.data)); } catch {} }
    this.chests.seed(list.filter((c) => !this.chests.chests.has(c.id)));
    await this.db.prepare("DELETE FROM loot_chests WHERE exp <= ?").bind(now).run();
    if (list.length) console.log(`[mc] сундуков восстановлено: ${list.length}`);
  }
  async chestSave() {
    if (!this.db) { this.chests.dirty.clear(); this.chests.removed.clear(); return; }
    this.chestSaving = true;
    try {
      const up = [...this.chests.dirty].map((id) => this.chests.chests.get(id)).filter(Boolean) as Chest[], del = [...this.chests.removed];
      this.chests.dirty.clear(); this.chests.removed.clear();
      const st: any[] = [];
      for (const c of up) st.push(c.entries.length ? this.db.prepare("INSERT INTO loot_chests (id, world, exp, data) VALUES (?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET exp=excluded.exp, data=excluded.data").bind(c.id, c.world, c.exp, JSON.stringify(c)) : this.db.prepare("DELETE FROM loot_chests WHERE id=?").bind(c.id));
      for (const id of del) st.push(this.db.prepare("DELETE FROM loot_chests WHERE id=?").bind(id));
      if (st.length) await this.db.batch(st);
    } finally { this.chestSaving = false; }
  }
  fx: { at: number; world: string; sid: string; fn: () => void }[] = []; // отложенные части навыков (метеор, тики, след)

  /** Живой срез для «📊 Нагрузка»: только агрегаты, без ников/IP (id — анонимный хеш). Вызывается по запросу админа. */
  perfLive(now = Date.now()) {
    const worlds: any = {}, zones: any = {}, lvl: Record<string, number> = {}, cls: Record<string, number> = {};
    let reg = 0, guest = 0;
    for (const s of this.sessionsRef?.values?.() || []) {
      const ms = this.ms.get(s.id); if (!ms) continue;
      ms.verified ? reg++ : guest++;
      const w = s.world || "hellfire"; worlds[w] = (worlds[w] || 0) + 1;
      if (w === "arinar") { let z = "?"; try { const r: any = regionAt(s.x, s.y); z = (r && (ZONE_NAMES[zoneKeyOf(r.id)]?.name || r.name)) || "вне локаций"; } catch (_) {} zones[z] = (zones[z] || 0) + 1; }
      const L = ms.pub?.lvl || 1, b = L >= 50 ? "50+" : `${Math.floor((L - 1) / 10) * 10 + 1}-${Math.floor((L - 1) / 10) * 10 + 10}`; lvl[b] = (lvl[b] || 0) + 1;
      const c = s.stats?.classId || "?"; cls[c] = (cls[c] || 0) + 1;
    }
    const ent: any = {};
    for (const [w, z] of Object.entries(this.zones) as any) {
      let awake = 0, dots = 0, casts = 0; for (const m of z.mobs || []) { if (!m.dead && !m.sleep) awake++; dots += m.dots?.length || 0; casts += m.casts?.length || 0; }
      ent[w] = { mobs: (z.mobs || []).length, awake: z.stats?.awake ?? awake, camps: z.gen?.camps?.length || 0, projectiles: (z.projs || z.projectiles || []).length, aoe: (z.aoes || z.casts || []).length + casts, dots };
    }
    let chests = 0; for (const c of this.chests.chests.values()) chests++;
    return { online: { total: reg + guest, registered: reg, guests: guest }, worlds, zones, levels: lvl, classes: cls, entities: ent, chests, lootBags: this.loot.bags.size, parties: this.party.parties.size, fx: this.fx.length };
  }
  stAt = 0;
  sessionsRef: Map<WebSocket, any> | null = null;
  async perfSnapshot() {
    const now = Date.now(), live = this.perfLive(now), hist: any = await ST.history(now);
    const D = hist.days as string[], today = D[D.length - 1], daily = hist.daily as Record<string, Record<string, number>>;
    const td: Record<string, number> = { ...(daily[today] || {}) }; // + ещё не записанная минута из памяти
    for (const [k, v] of ST.sum) td[k] = (td[k] || 0) + v; for (const [k, v] of ST.max) td[k] = Math.max(td[k] || 0, v);
    { let n = 0, r = 0; const pre = today + "|"; for (const k of ST.seen) if (k.startsWith(pre)) n++; for (const q of ST.seenQ) if (q[0] === today && q[2]) r++; // ещё не записанные в D1
      hist.dau[today] = Math.max(hist.dau[today] || 0, n); hist.dauReg[today] = Math.max(hist.dauReg[today] || 0, r); }
    td.peak = Math.max(td.peak || 0, live.online.total);
    const g = (d: string, k: string) => (d === today ? td[k] : daily[d]?.[k]) || 0, last7 = D.slice(-7);
    const hourRow = (d: string) => Array.from({ length: 24 }, (_, h) => Math.max(g(d, "h" + String(h).padStart(2, "0")), (ST.hourly as any)[d]?.[h] || 0));
    const ECON = ["kills", "kills_elite", "kills_cursed", "kills_ench", "kills_boss", "deaths", "chests_open", "items_drop", "cursed_drop", "ench_drop", "quests"];
    const perDay = (k: string) => D.map((d) => g(d, k));
    return { v: 1, at: new Date(now).toISOString(), tz: "Europe/Kiev", privacy: "только агрегаты; id игроков — анонимный солёный хеш, IP и ники не хранятся",
      server: perfServer(now),
      online: { now: live.online, peakToday: g(today, "peak"), peak7d: Math.max(0, ...last7.map((d) => g(d, "peak"))),
        dau: D.map((d) => hist.dau[d] || 0), dauRegistered: D.map((d) => hist.dauReg[d] || 0), wau: hist.wau, mau: hist.mau,
        newRegistrations: perDay("new_reg"), guestToRegistered: perDay("conv"), sessionsPerDay: perDay("sessions"),
        sessions: ST.sessionSummary(now), sessionLenBuckets: Object.fromEntries(Object.keys(td).filter((k) => /^sl\d$/.test(k)).map((k) => [k, td[k]])),
        hourlyToday: hourRow(today), hourly7d: last7.map((d) => ({ day: d, h: hourRow(d) })) },
      players: { worlds: live.worlds, zones: live.zones, levels: live.levels, classes: live.classes, activeToday: ST.todaySummary(), client: ST.clientSummary() },
      economy: { today: Object.fromEntries(ECON.map((k) => [k, g(today, k)])), perDay: Object.fromEntries(ECON.map((k) => [k, perDay(k)])) },
      entities: live.entities, objects: { chests: live.chests, lootBags: live.lootBags, parties: live.parties, fx: live.fx },
      days: D, note: hist.note || undefined };
  }
  /** GET …/admin/perf — тот же JSON. Bearer Clerk-токен → uid → роль «админ» из D1. Иначе 401/403. */
  async perfHttp(req: Request) {
    const h = { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" };
    const tok = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
    if (!tok) return new Response(JSON.stringify({ error: "нужен токен" }), { status: 401, headers: h });
    const local = isLocalRequest(req);
    const uid = await verifyClerkToken(tok, this.env.CLERK_ISSUER || DEFAULT_CLERK_ISSUER, (azp) => originAllowed(this.env, azp, local)).catch(() => null);
    if (!uid) return new Response(JSON.stringify({ error: "токен недействителен" }), { status: 401, headers: h });
    await this.roles.ensure().catch(() => {});
    if (!this.roles.canAdminFull({ pkey: "uid:" + uid, verified: true } as any)) return new Response(JSON.stringify({ error: "только админ" }), { status: 403, headers: h });
    return new Response(JSON.stringify(await this.perfSnapshot()), { headers: h });
  }

  tick(dt: number, sessions: Map<WebSocket, any>) {
    const now = Date.now();
    this.sessionsRef = sessions;
    if (now - (this.stAt || 0) >= 60000) { // аналитика: раз в минуту (выборка онлайна + один batch в D1)
      this.stAt = now; let r = 0, g = 0;
      for (const s of sessions.values()) { const ms = this.ms.get(s.id); if (!ms) continue; ms.verified ? r++ : g++; ST.hero(s.id, ms.pub?.lvl || 1, s.stats?.classId || ""); }
      ST.tick(now, r, g);
    }
    if (now - (this.lootExpAt || 0) > 1000) { this.lootExpAt = now; this.loot.expire(now); this.chestTick(now); }
    this.chestChan(now);
    if (now - (this.regAt || 0) > 3000) { this.regAt = now; this.admin.sync().catch(() => {}); this.syncRegions(); } // набор правок (D1, не чаще раза в 10 с — внутри sync) + пересборка лагерей / ОЗ живых мобов
    if (now - this.partyAt > 1000) { this.partyAt = now; for (const p of this.party.parties.values()) this.partySend(p); } // ОЗ/позиции отряда — для рамок, карты и мини-карты
    try { this.pvp.tick(now); } catch (e: any) { console.error("[mc] pvp tick", e?.message || e); }
    try { this.npcs.tick(now, Math.min(0.5, dt)); } catch (e: any) { console.error("[mc] npc tick", e?.message || e); }
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
        if (w === "arinar") this.cityTick(ws, s, ms, now);
        if (w === "arinar" && ms.zp?.alive && now - ((ms as any).bmfAt || 0) > 2000) { // доска: «Найти Чёрного мага» — рядом с ним или в его куполе
          (ms as any).bmfAt = now; const acc = this.store.account(ms.pkey);
          const want = !!acc && bmWanted(acc) && BM_CFG.on !== false;
          if (want && ((Number.isFinite(this.bm.x) && Math.hypot(s.x - this.bm.x, s.y - this.bm.y) <= 220) || this.bm.inDome(s.x, s.y))) this.bev(s, { type: "bm_find" });
          // трекер «Найти Чёрного мага»: примерное место (±100 px) — только тем, у кого задание сегодня не выполнено
          if (want && (BOARD_CFG.qol as any)?.bmArrow !== false && Number.isFinite(this.bm.x)) this.send(ws, { type: "bm_hint", x: Math.round(this.bm.x / 100) * 100, y: Math.round(this.bm.y / 100) * 100 });
          else if ((ms as any).bmHint !== want) this.send(ws, { type: "bm_hint", off: 1 });
          (ms as any).bmHint = want;
        } // город под куполом: PK-отсчёт, убийцу — за край
        this.posNote(s, ms, false, now); // позиция для переподключения (не чаще POS_CFG.saveSec)
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
      const zt0 = performance.now();
      if (!zone.onEngage) zone.onEngage = (m, sid) => this.engage(m, sid);
      zone.update(dt, now, players, (sid, dmg, src, mob) => this.zoneHit(w, zone, sid, dmg, src, mob, now), (mm) => this.onMobKilled(mm));
      if (w === "arinar" && this.bm.loaded && zone.guard === this.guardMux) {
        try { this.bm.tick(Math.min(0.5, dt), zone as any, players as any); } catch (e: any) { console.error("[mc] black mage tick", e?.message || e); }
        for (const [, s] of socks) { const ms = this.ms.get(s.id); if (ms) { this.bmGround(s, ms, now); if ((ms as any).bmMeta && now - ((ms as any).bmMetaAt || 0) > 1500) { (ms as any).bmMeta = false; (ms as any).bmMetaAt = now; this.refreshZonePlayer(s); const e = this.sessionLookup?.(s.id); if (e) this.send(e[0], { type: "meta_state", ...this.snap(s) }); } } }
        if ((this.bmDirty || now - this.bmSaveAt > 60000) && !this.bmSaving && now - this.bmSaveAt > 10000) { this.bmSaveAt = now; this.bmSave().catch((e) => console.error("[mc] black mage save", e?.message || e)); }
      }
      perfZone(w, performance.now() - zt0);
      if (!sendNow) continue;
      if (!socks.length) { zone.events.length = 0; continue; }
      const ev = zone.takeEvents();
      const npc: any[] = this.npcs.snapshot(w); // [id, x, y, dir, moving] — все NPC мира (их единицы)
      const bmOn = w === "arinar" && this.bm.loaded && BM_CFG.on !== false, bmE = bmOn ? this.bm.npcEntry() : null;
      if (bmE) npc.push(bmE); // Чёрный маг — НПС квестов (позиция живая)
      if (w === "arinar" && CITY_CFG.on !== false) (CITY_CFG.npc as any[]).forEach((sl, i) => { const p = sl.on ? slotPos(sl) : null; if (p) npc.push([cityNpcId(i), p[0], p[1], 0, 0]); }); // места NPC города (снаружи и в комнатах зданий)
      const cityCfgSig = w === "arinar" ? JSON.stringify(cityClient()) : "";
      const dnSig = w === "arinar" ? JSON.stringify(DN_CFG) : "";
      if (cityCfgSig && cityCfgSig !== (this as any).citySig) { (this as any).citySig = cityCfgSig; this.cityVer++; syncCityNpcs(NPCS as any); }
      for (const [ws, s] of socks) {
        const ms = this.ms.get(s.id)!;
        const st = zone.state(s.x, s.y, ev, zone.gen.camps ? OPEN_AOI : 700, ms.pkey); // Аринар: интерес = самый дальний зум камеры (VIEW_CELLS.max), не больше
        // Библиотека мобов: «встречен», когда моб оказался рядом (≈ на экране)
        const acc = this.store.accounts.get(ms.pkey);
        let met = false;
        if (acc) for (let i = 0; i < st.m.length; i += 6) {
          const type = bestiaryKey(MOB_TYPES[st.m[i + 1]] || "");
          if (type && !acc.bestiary[type] && Math.abs(st.m[i + 2] - s.x) < 420 && Math.abs(st.m[i + 3] - s.y) < 320) { noteMob(acc, type, 0); ms.dirty = true; met = true; }
        }
        if (met) this.send(ws, { type: "meta_state", ...this.snap(s) }); // новая запись Бестиария → счётчик «новое»
        const tid = (ms as any).target, tm = tid ? zone.byId.get(tid) : null;
        const tg = tm && !tm.dead && Math.abs(tm.x - s.x) < 1600 && Math.abs(tm.y - s.y) < 1600
          ? { id: tm.id, type: tm.type, name: ZONE_MOBS[tm.type].name, lvl: ZONE_MOBS[tm.type].lvl, hp: Math.max(0, Math.ceil(tm.hp)), maxHp: tm.maxHp,
              elite: tm.elite || undefined, cursed: tm.cursed || undefined, ench: tm.ench || undefined, boss: tm.special === "boss" || undefined, reset: tm.reset || undefined,
              ...mobEffStats(tm), // armor/dmg — действующие на сервере (база × элита/вожак/проклятие/ярость), не база бестиария
              skills: tm.skills.length ? tm.skills.map((k) => MOB_SKILLS[k].name) : undefined,
              sts: tm.dots?.length ? tm.dots.filter((x) => x.until > now).reduce((o: any, x) => ((o[x.kind] = (o[x.kind] || 0) + 1), o), {}) : undefined } // стаки статусов цели
          : tid ? { id: tid, gone: 1 } : undefined;
        const bags = this.loot.near(ms.pkey, s.world || "hellfire", s.x, s.y, 800);
        const chests = this.chests.near(ms.pkey, s.world || "hellfire", s.x, s.y, 900, now);
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
        // Чёрный маг рядом: m — [x,y,dir,moving,state]; d — купола; ro — розы (раз в 2 с и при посадке): [id,x,y,возраст мс]
        let bm: any;
        if (bmOn) { bm = { m: this.bm.mageNear(s.x, s.y), d: this.bm.domesNear(s.x, s.y) };
          if (now - ((ms as any).roAt || 0) > 2000 || (ms as any).roVer !== this.bm.roseVer) { (ms as any).roAt = now; (ms as any).roVer = this.bm.roseVer; bm.ro = this.bm.rosesSnap(s.x, s.y); bm.cfg = bmClient(); }
          if (!bm.m && !bm.d.length && !bm.ro) bm = undefined; }
        // город под куполом: настройки отрисовки и места NPC — при входе в мир и при правке в админке (версия)
        let city: any; if (w === "arinar" && (ms as any).cityVer !== this.cityVer && ((Math.abs(s.x - CITY_CFG.x) < 9000 && Math.abs(s.y - CITY_CFG.y) < 9000) || inRoomArea(s.x, s.y))) { (ms as any).cityVer = this.cityVer; city = cityClient(); }
        // день и ночь: часы и настройки — при входе, при правке в админке (подпись) и раз в 20 с (клиент ведёт часы сам)
        let dn: any; if (w === "arinar" && ((ms as any).dnSig !== dnSig || now - ((ms as any).dnAt || 0) > 20000)) { (ms as any).dnSig = dnSig; (ms as any).dnAt = now; dn = dnClient(now); }
        this.send(ws, { type: "zone_state", ...st, tg, bags, chests, fp, wb, cp, bm, city, dn, npc: npc.length ? npc : undefined, me: { hp: Math.round(ms.zp.hp), maxHp: ms.zp.maxHp, alive: ms.zp.alive, wt: ms.wt } });
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
      this.marks.list(ms.pkey, cls, w).then((a) => { if (ms.fogKey === key) this.send(ws, { type: "marks", world: w, hero: cls, list: a }); }).catch(() => {}); // свои метки героя для этого мира
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
      if (add.length) { this.send(ws, { type: "fog_add", world: w, c: add }); this.bev(s, { type: "explore", n: add.length }); }
      this.explore.save(ms.pkey, cls, w).catch(() => {});
    }
  }

  onClose(session: any) {
    ST.leave(session?.id);
    this.npcs.talkEnd(null, session?.id);
    this.pvpGone(session);
    { const p = this.party.leave(session?.id); this.partySend(p); } // отключился — выходит из отряда
    const ms = this.ms.get(session?.id);
    if (!ms) return;
    this.posNote(session, ms, true); // выход: точка для следующего входа
    this.save(session);
    this.ms.delete(session.id);
    if (![...this.ms.values()].some((x) => x.pkey === ms.pkey)) { this.explore.flushKey(ms.pkey).catch(() => {});
      const P = this.pkMap.get(ms.pkey); if (P && pkIdle(P)) this.pkMap.delete(ms.pkey); } // PK без отсчёта — выгрузить (иначе карта растёт с каждым гостем); идёт отсчёт — переживёт переподключение
    // выгружаем кэш, если других сессий с этим ключом нет
    if (![...this.ms.values()].some((x) => x.pkey === ms.pkey)) this.store.evict(ms.pkey, () => [...this.ms.values()].some((x) => x.pkey === ms.pkey)).catch((e) => console.error("[mc] evict", e?.message || e));
  }
}

