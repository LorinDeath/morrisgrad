// Сервис мета-прогрессии, квестов и открытого мира Аринара. Подключается к GameRoom минимально:
// onJoin / handle(msg) / tick / onClose. Старые сообщения протокола не меняются.
import { CHARACTER_CLASSES } from "../classes";
import { verifyClerkToken, DEFAULT_CLERK_ISSUER } from "./auth";
import {
  HERO_IDS, ITEM_BY_ID, MONSTER_LOOT, NPCS, NPC_RANGE, ZONE_MOBS, ZONE_RESPAWN, ABILITY_BY_ID, REWARD_RULES, MINIGAMES,
  ZONE_SPAWNS, ZONE_NODES, HUB_SPAWNS, RUN_LOOT_KEY, RUN_BOSS_BY_ROOM, WEAPON_TYPES, weaponType, RECIPES,
} from "./defs";
import { ZONE_GEN, genOf } from "./zoneGen";
import { mobXp, xpLevelMult } from "./balance";
import { QUESTS, QUEST_BY_ID } from "./quests";
import {
  heroEffective, markSeen, noteMob, noteItem, cryptoRand, snapshot, learnTalent, setLoadout, upgradeRadiance, silenceAbility, buySoulNode, equip, unequip, salvage,
  craft, addItem, addRes, rollMonsterLoot, gainXp, questEvent, questAvailable, acceptQuest, turnInQuest, questComplete, type Account, type Hero,
} from "./profile";
import { Zone, type ZPlayer } from "./zone";
import { ProfileStore } from "./store";
import { itemCard, mobDropView, SILHOUETTES, ITEM_INDEX } from "./library";

export interface MetaSess {
  sid: string; pkey: string; verified: boolean; ready: boolean;
  zp: ZPlayer; lastAtk: number; gather: { node: number; at: number } | null; abilCd: Record<string, number>; wt?: string;
  run: { room: string; at: number; cls: string | null; maxMembers: number; usedAbility: boolean } | null;
  dirty: boolean; lastSave: number; lastHub: number;
  cards: Set<string>; sentRecipes?: boolean; rl: { t: number; n: number; warned: number };
}

// Схема входящих мета-сообщений: тип → поля и их типы (лишние поля игнорируются, неверные — отказ)
const S = (o: Record<string, "s" | "n" | "b" | "o" | "a" | "s?" | "n?" | "b?" | "o?" | "a?">) => o;
const MSG_SCHEMA: Record<string, Record<string, string>> = {
  meta_get: S({}), lib_get: S({}), talent_learn: S({ id: "s" }), loadout_set: S({ ids: "a" }), radiance_up: S({ id: "s" }), ability_silence: S({ id: "s", confirm: "s?" }),
  soul_buy: S({ id: "s" }), equip: S({ uid: "s" }), unequip: S({ slot: "s" }), salvage: S({ uid: "s" }), craft: S({ recipe: "s" }), npc_talk: S({ npc: "s" }),
  quest_accept: S({ id: "s" }), quest_turnin: S({ id: "s" }), run_result: S({ time: "n?", kills: "o?", bossKills: "n?", room: "s?" }),
  zone_attack: S({}), zone_ability: S({}), gather_start: S({}), gather_done: S({}), dev_grant: S({}),
  mark_seen: S({ inv: "a?", items: "a?", mobs: "a?", feats: "a?" }),
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
  constructor(sql: any, env: any) {
    this.store = new ProfileStore(sql, env?.GAME_DB);
    if (env?.GAME_DB) this.store.ensureLibrary();
    this.env = env || {};
  }

  // ---------- вход ----------
  async onJoin(ws: WebSocket, session: any, msg: any) {
    let uid: string | null = null;
    if (msg.token) uid = await verifyClerkToken(String(msg.token), this.env.CLERK_ISSUER || DEFAULT_CLERK_ISSUER);
    if (!uid && this.env.MC_DEV_TRUST_USERID === "1" && msg.userId) uid = String(msg.userId);
    const verified = !!uid;
    if (uid) session.userId = uid;
    // Гость (без входа): прогресс по случайному guestId из localStorage браузера — не по нику,
    // чтобы разные «Странники» не делили один профиль. Не подтверждён сервером, ценность низкая.
    const gid = typeof msg.guestId === "string" && /^[a-z0-9]{16,40}$/.test(msg.guestId) ? msg.guestId : `s${session.id}`;
    const pkey = uid ? `uid:${uid}` : `guest:${gid}`;
    // профиль из D1 (источник истины) — до любых действий игрока
    try { await this.store.load(pkey); } catch (e: any) {
      console.error("[mc] profile load failed", e?.message || e);
      this.send(ws, { type: "toast_error", message: "Профиль временно недоступен — попробуйте переподключиться" });
      return;
    }
    const ms: MetaSess = { cards: new Set(), rl: { t: 0, n: 0, warned: 0 }, sid: session.id, pkey, verified, ready: true, zp: { sid: session.id, x: session.x, y: session.y, hp: 70, maxHp: 70, armorRed: 0, alive: true, respawnAt: 0 },
      lastAtk: 0, gather: null, abilCd: {}, run: null, dirty: false, lastSave: Date.now(), lastHub: 0 };
    this.ms.set(session.id, ms);
    const a = this.store.account(pkey);
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
    s.available = QUESTS.filter((q) => questAvailable(a, q)).map((q) => q.id);
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
    if (wasFull || ms.zp.hp > eff.maxHp) ms.zp.hp = eff.maxHp;
    // облик («забери всё») и уровень героя видны другим игрокам через players_state.stats
    if (session.stats && cls) { session.stats.look = eff.look || null; session.stats.lvl = eff.level || 1; }
    ms.wt = eff.wtype;
  }

  effective(session: any) {
    const ms = this.ms.get(session.id)!;
    const cls = session.stats?.classId || null;
    const a = this.store.account(ms.pkey);
    if (!cls) return { ...heroBase(null), damageReduction: 0, dmgPct: 0, critPct: 5, lifestealPct: 0, regen: 0, cdrPct: 0, weaponMin: 6, weaponMax: 9, abilities: [] as any[], speedPct: 0, magnetPct: 0, atkSpeedPct: 0, revive: 0, look: null, level: 0, weaponId: null, wtype: weaponType(null, null) };
    return heroEffective(a, this.store.hero(ms.pkey, cls), cls, heroBase(cls));
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
    if (!ms) return false;
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
      case "lib_get": this.send(ws, { type: "library", ...this.library(a) }); return true;
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
        const heroes = HERO_IDS.map((id) => this.store.hero(ms.pkey, id));
        reply(salvage(a, heroes, String(msg.uid))); return true;
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
        const quests = QUESTS.filter((q) => q.npc === npc && (questAvailable(a, q) || a.quests.active[q.id])).map((q) => ({ id: q.id, state: a.quests.active[q.id] ? (questComplete(a, q.id) ? "complete" : "active") : "available" }));
        this.push(ws, session);
        this.send(ws, { type: "npc_dialog", npc, quests });
        return true;
      }
      case "quest_accept": {
        const q = QUEST_BY_ID[String(msg.id)];
        if (!q || !this.nearNpc(session, q.npc)) { this.send(ws, { type: "toast_error", message: "Возьмите квест у персонажа" }); return true; }
        const r = acceptQuest(a, q.id);
        if (r.ok) { this.qev(a, session, { type: "talk", npc: q.npc }); if ((session.world || "hellfire") === "arinar") this.qev(a, session, { type: "reach", world: "arinar" }); }
        reply(r, `Квест принят: ${q.title}`); return true;
      }
      case "quest_turnin": {
        const q = QUEST_BY_ID[String(msg.id)];
        if (!q) return true;
        // сюжетные квесты пролога сдаются автоматически, остальные — у персонажа
        if (q.campaign !== "prologue" && !this.nearNpc(session, q.npc)) { this.send(ws, { type: "toast_error", message: `Сдайте квест: ${NPCS[q.npc]?.name}` }); return true; }
        const r = turnInQuest(a, h, q.id);
        if (r.ok) this.push(ws, session, { questDone: { id: q.id, rewards: (r as any).rewards } });
        else this.send(ws, { type: "toast_error", message: (r as any).err });
        this.refreshZonePlayer(session);
        return true;
      }
      case "run_result": this.runResult(ws, session, msg, ctx).catch((e) => console.error("[mc] run_result", e?.message || e)); return true;
      case "zone_attack": this.zoneAttack(ws, session, msg); return true;
      case "zone_ability": this.zoneAbility(ws, session, msg); return true;
      case "gather_start": ms.gather = { node: Number(msg.node), at: Date.now() }; return true;
      case "gather_done": this.gatherDone(ws, session, msg); return true;
      case "dev_grant": {
        // Только для локальных тестов (MC_DEV_TRUST_USERID=1): выдать звёзды/опыт/предмет
        if (this.env.MC_DEV_TRUST_USERID !== "1") return true;
        if (msg.stars) for (const [c, n] of Object.entries(msg.stars)) a.stars[c] = (a.stars[c] || 0) + Number(n);
        if (msg.xp && h) gainXp(h, Number(msg.xp));
        if (msg.item) addItem(a, String(msg.item), "grant:dev");
        if (msg.res) for (const [r, n] of Object.entries(msg.res)) addRes(a, r, Number(n));
        this.push(ws, session); return true;
      }
    }
    return false;
  }

  // Библиотека предметов и мобов (вкладки Книги). Сервер присылает данные ТОЛЬКО открытых предметов;
  // закрытые — силуэты (слот/редкость/ярус по номеру в пуле), без имени, статов, свойств и навыков.
  library(a: Account) {
    const items: Record<string, any> = {};
    const owned: Record<string, { n: number; srcs: string[] }> = {};
    for (const it of a.inv) { const o = (owned[it.id] = owned[it.id] || { n: 0, srcs: [] }); o.n++; if (it.src && !o.srcs.includes(it.src) && o.srcs.length < 6) o.srcs.push(it.src); }
    for (const [id, d] of Object.entries(a.disc.items)) {
      const c = itemCard(id);
      if (c) items[id] = { ...c, n: ITEM_INDEX[id], st: d.st, isNew: !d.v, first: d.src, owned: owned[id]?.n || 0, ownedSrc: owned[id]?.srcs || [] };
    }
    const known = (id: string) => !!a.disc.items[id];
    const mobs: Record<string, any> = {};
    for (const [id, b] of Object.entries(a.bestiary)) mobs[id] = { kills: b.kills || 0, isNew: !b.v, drops: mobDropView(id, known) };
    const feats = Object.fromEntries(Object.entries(a.disc.feats).map(([f, d]) => [f, { isNew: !d.v }]));
    return { size: SILHOUETTES.length, sil: SILHOUETTES, items, mobs, feats };
  }

  nearNpcOrAltar(session: any) {
    return (session.world || "hellfire") === "hellfire" && Math.hypot(session.x - 565, session.y - 600) <= 110;
  }

  // Вызывается из GameRoom после select_class (Алтарь): герой выбран — прогресс применяется к нему
  onSelectHero(ws: WebSocket, session: any) {
    const ms = this.ms.get(session.id);
    if (!ms) return;
    const a = this.store.account(ms.pkey);
    a.hero = session.stats.classId;
    this.store.hero(ms.pkey, a.hero!);
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

  // ---------- открытый мир ----------
  zoneOf(session: any): Zone | null {
    if (session.runRoom || session.inDuel) return null;
    return this.zones[session.world || "hellfire"] || null;
  }
  // Базовая атака в открытом мире — по клику в направлении курсора (или кнопкой атаки с автонаведением на телефоне).
  // Сервер проверяет кд (скорость атаки), направление (единичный вектор), дальность и форму удара оружия.
  // Старые клиенты могут прислать {mob} без направления — тогда направление считается на этого моба.
  zoneAttack(ws: WebSocket, session: any, msg: any) {
    const ms = this.ms.get(session.id)!;
    const zone = this.zoneOf(session);
    if (!zone || !ms.zp.alive) return;
    ms.zp.x = session.x; ms.zp.y = session.y;
    const eff = this.effective(session);
    const now = Date.now();
    const wt = eff.wtype || "book";
    const W = WEAPON_TYPES[wt] || WEAPON_TYPES.book;
    // темп удара по оружию: допуск 15% на сетевой джиттер, но средний темп не выше cd (следующий слот = max(now, прежний) + cd)
    const atkCd = W.cd / (1 + Math.max(0, eff.atkSpeedPct || 0) / 100);
    if (now < ms.lastAtk - atkCd * 0.15) return;
    let dx = Number(msg.dx), dy = Number(msg.dy);
    if (!Number.isFinite(dx) || !Number.isFinite(dy) || Math.hypot(dx, dy) < 0.01) {
      const m0 = zone.mobs.find((x) => x.id === Number(msg.mob) && !x.dead);
      if (!m0) return;
      dx = m0.x - session.x; dy = m0.y - session.y;
    }
    const L = Math.hypot(dx, dy) || 1; dx /= L; dy /= L;
    ms.lastAtk = Math.max(now, ms.lastAtk) + atkCd; // lastAtk хранит момент следующего разрешённого удара
    ms.wt = wt;
    const targets = zone.targetsInDir(ms.zp, dx, dy, W.atk);
    const first = targets[0];
    const reach = W.atk.kind === "arc" ? W.atk.range * 0.8 : W.atk.range;
    const tx = first && W.atk.kind === "proj" ? first.x : session.x + dx * reach, ty = first && W.atk.kind === "proj" ? first.y : session.y + dy * reach;
    // визуал выстрела для всех рядом (AOI); свой клиент рисует сразу и пропускает своё событие
    zone.events.push({ k: "shot", sid: session.id, x: session.x, y: session.y, tx: Math.round(tx), ty: Math.round(ty), w: wt });
    if (!targets.length) return;
    const a = this.store.account(ms.pkey);
    targets.forEach((m, i) => {
      if (!a.bestiary[m.type]) { noteMob(a, m.type, 0); ms.dirty = true; }
      const crit = cryptoRand() * 100 < eff.critPct;
      const raw = eff.weaponMin + cryptoRand() * (eff.weaponMax - eff.weaponMin);
      const k = i === 0 ? 1 : (W.atk.kind === "line" ? 0.7 : 0.8);
      const dmg = raw * (1 + eff.dmgPct / 100) * (crit ? 1.75 : 1) * k;
      const real = zone.damage(m, session.id, dmg, (mm) => this.onMobKilled(mm)) || 0;
      if (!m.dead) zone.applyStatus(m, session.id, { kind: W.status.kind, dps: W.status.dpsPct ? real * W.status.dpsPct / 100 : 0, dur: W.status.dur, slow: W.status.slow, knock: W.status.knock }, session.x, session.y);
      if (eff.lifestealPct && real) ms.zp.hp = Math.min(ms.zp.maxHp, ms.zp.hp + real * eff.lifestealPct / 100);
      if (crit) zone.events.push({ k: "crit", id: m.id, x: m.x, y: m.y });
    });
  }

  zoneAbility(ws: WebSocket, session: any, msg: any) {
    const ms = this.ms.get(session.id)!;
    const zone = this.zoneOf(session);
    if (!zone || !ms.zp.alive) return;
    const eff = this.effective(session);
    const ab = eff.abilities.find((x: any) => x.id === msg.id);
    if (!ab) return;
    const now = Date.now();
    if ((ms.abilCd[ab.id] || 0) > now) return;
    ms.abilCd[ab.id] = now + ab.cd * 1000;
    ms.zp.x = session.x; ms.zp.y = session.y;
    const def = ABILITY_BY_ID[ab.id];
    const radius = ab.props.includes("extend") ? 200 : 140;
    const avg = (eff.weaponMin + eff.weaponMax) / 2;
    const dmg = avg * Math.max(0.6, Math.min(4, ab.power)) * 2.2 * (1 + eff.dmgPct / 100);
    let dealt = 0;
    for (const m of zone.mobsAround(session.x, session.y, radius)) {
      m.usedAbility.add(session.id);
      dealt += zone.damage(m, session.id, dmg, (mm) => this.onMobKilled(mm)) || 0;
    }
    if (ab.props.includes("vamp") || def.id === "trick_strike") ms.zp.hp = Math.min(ms.zp.maxHp, ms.zp.hp + dealt * 0.08);
    zone.events.push({ k: "ability", sid: session.id, id: ab.id, x: session.x, y: session.y, r: radius });
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
    for (const [sid, dmg] of m.dmgBy as Map<string, number>) {
      if (!d.boss && !d.rare && dmg / total < 0.15) continue; // вклад ≥15% (босс/редкий — любой вклад)
      const ms = this.ms.get(sid);
      const entry = this.sessionLookup?.(sid);
      if (!ms || !entry) continue;
      const [ws, session] = entry;
      const a = this.store.account(ms.pkey);
      const cls = session.stats?.classId || null;
      const h = cls ? this.store.hero(ms.pkey, cls) : null;
      noteMob(a, m.type, 1);
      // опыт: по уровню моба с поправкой на разницу уровней (серые мобы почти ничего не дают)
      const xp = Math.round(d.xp * (m.elite ? ZONE_GEN.eliteXp : 1) * xpLevelMult(d.lvl || 1, h?.lvl || 1)); // серые мобы (≥5 ур. ниже) — 0
      const out: any = { xp, items: [], res: {}, mob: m.type, elite: !!m.elite };
      if (h && xp > 0) out.levelUps = gainXp(h, xp);
      const src = `${d.boss ? "boss" : d.rare ? "rare" : "kill"}:${m.type}`;
      this.grantLoot(a, rollMonsterLoot(m.type), out, src);
      if (m.elite) this.grantLoot(a, rollMonsterLoot(m.type), out, src); // элита: второй бросок добычи
      this.qev(a, session, { type: "kill", mob: m.type, cls });
      if (d.boss) this.qev(a, session, { type: "kill_boss", mob: m.type, usedAbility: m.usedAbility.has(sid) });
      this.push(ws, session, { loot: out });
      // эпические и выше трофеи — объявление в мире (MMO-момент)
      const epic = out.items.find((it: any) => ["epic", "legendary", "mythic"].includes(ITEM_BY_ID[it.id]?.rarity));
      if (epic) this.zones[session.world || "hellfire"]?.events.push({ k: "announce", text: `💎 ${session.username || "Игрок"} добывает «${ITEM_BY_ID[epic.id].name}»!`, color: "#f0abfc" });
    }
  }
  sessionLookup: ((sid: string) => [WebSocket, any] | null) | null = null;

  tick(dt: number, sessions: Map<WebSocket, any>) {
    const now = Date.now();
    const byWorld: Record<string, { players: Map<string, ZPlayer>; socks: [WebSocket, any][] }> = {};
    for (const w of Object.keys(this.zones)) byWorld[w] = { players: new Map(), socks: [] };
    for (const [ws, s] of sessions) {
      const ms = this.ms.get(s.id);
      if (!ms) continue;
      const w = s.world || "hellfire";
      if (byWorld[w] && !s.runRoom && !s.inDuel) {
        ms.zp.x = s.x; ms.zp.y = s.y;
        if (!ms.zp.alive && now >= ms.zp.respawnAt) {
          ms.zp.alive = true; ms.zp.hp = ms.zp.maxHp;
          const rp = genOf(w).respawn;
          s.x = rp.x; s.y = rp.y; ms.zp.x = s.x; ms.zp.y = s.y;
          this.send(ws, { type: "zone_respawn", x: s.x, y: s.y });
        }
        if (ms.zp.alive && ms.zp.hp < ms.zp.maxHp) {
          const eff = this.effective(s);
          // вне боя (5 с без урона) — быстрое восстановление 4% ХП/с, как в MMO: простой между стычками короткий
          const ooc = now - ((ms as any).hurtAt || 0) > 5000 ? ms.zp.maxHp * 0.04 : 0;
          ms.zp.hp = Math.min(ms.zp.maxHp, ms.zp.hp + (eff.regen + (w === "hellfire" ? 2 : 0.3) + ooc) * dt);
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
    for (const [w, zone] of Object.entries(this.zones)) {
      const { players, socks } = byWorld[w];
      zone.update(dt, now, players, (sid, dmg, src) => {
        const ms = this.ms.get(sid);
        if (!ms || !ms.zp.alive) return;
        const real = Math.max(1, Math.round(dmg * (1 - ms.zp.armorRed)));
        ms.zp.hp -= real; (ms as any).hurtAt = now;
        zone.events.push({ k: "phit", sid, d: real, src });
        if (ms.zp.hp <= 0) { ms.zp.hp = 0; ms.zp.alive = false; ms.zp.respawnAt = now + 5000; zone.events.push({ k: "pdie", sid }); }
      }, (mm) => this.onMobKilled(mm));
      if (!sendNow) continue;
      if (!socks.length) { zone.events.length = 0; continue; }
      const ev = zone.takeEvents();
      for (const [ws, s] of socks) {
        const ms = this.ms.get(s.id)!;
        const st = zone.state(s.x, s.y, ev);
        // Библиотека мобов: «встречен», когда моб оказался рядом (≈ на экране)
        const acc = this.store.accounts.get(ms.pkey);
        let met = false;
        if (acc) for (let i = 0; i < st.m.length; i += 6) {
          const type = MOB_TYPES[st.m[i + 1]];
          if (type && !acc.bestiary[type] && Math.abs(st.m[i + 2] - s.x) < 420 && Math.abs(st.m[i + 3] - s.y) < 320) { noteMob(acc, type, 0); ms.dirty = true; met = true; }
        }
        if (met) this.send(ws, { type: "meta_state", ...this.snap(s) }); // новая запись Бестиария → счётчик «новое»
        this.send(ws, { type: "zone_state", ...st, me: { hp: Math.round(ms.zp.hp), maxHp: ms.zp.maxHp, alive: ms.zp.alive, wt: ms.wt } });
      }
    }
  }

  onClose(session: any) {
    const ms = this.ms.get(session?.id);
    if (!ms) return;
    this.save(session);
    this.ms.delete(session.id);
    // выгружаем кэш, если других сессий с этим ключом нет
    if (![...this.ms.values()].some((x) => x.pkey === ms.pkey)) this.store.evict(ms.pkey, () => [...this.ms.values()].some((x) => x.pkey === ms.pkey)).catch((e) => console.error("[mc] evict", e?.message || e));
  }
}

