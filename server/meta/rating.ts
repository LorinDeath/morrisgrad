import { instStats } from "./cursed";
import { blkOf } from "./bmCfg";
// «Проклятые»: рейтинг игроков и просмотр персонажа (только публичные данные).
// • Рейтинг считается на сервере из D1 (heroes + accounts), кэшируется на экземпляр не дольше RATING_TTL_MS.
//   Игрок = лучший из его героев (уровень, затем опыт). Имя — из таблицы сайта users (по Clerk uid),
//   гости — «Гость #xxxx» (стабильный хеш ключа профиля). Ключи профилей и uid наружу не отдаются:
//   у строк — непрозрачный id (хеш), по которому можно открыть просмотр персонажа.
// • Рекорд урона = самый сильный ОДИНОЧНЫЙ удар по монстру в открытом мире (Поляна, Аринар), посчитанный
//   сервером (zone_attack / zone_ability: статы героя с сервера, крит и разброс — криптографический ГСЧ сервера,
//   броня моба). Забеги симулируются на клиенте ведущего — их удары сервер проверить не может, поэтому в рекорд
//   не идут (кап «максимально возможным уроном» сделал бы рекорд у всех одинаковым и подделываемым до капа).
import { HERO_IDS, ITEM_BY_ID } from "./defs";
import { heroEffective, equippedItems, fixAccount, newAccount, newHero, killStats, type Account, type Hero } from "./profile";
import { ITEM_INDEX } from "./library";
import { guestDisplay, guestNameFor, isGuestName } from "./guestNames";

export const RATING_TTL_MS = 60_000;
export const RATING_TOP = 100;

export type LvlRow = { pkey: string; hero: string | null; lvl: number; xp: number };
export type DmgRow = { pkey: string; hero: string; v: number; at: number; where: string };
export type DuelRow = { pkey: string; hero: string | null; w: number; l: number; d: number; s?: number };

// FNV-1a 2×32 — синхронно (Worker и Node), стабильно между перезапусками
export function opaqueId(pkey: string): string {
  let h1 = 0x811c9dc5, h2 = 0x9e3779b9 ^ pkey.length;
  for (let i = 0; i < pkey.length; i++) { const c = pkey.charCodeAt(i); h1 = Math.imul(h1 ^ c, 16777619); h2 = Math.imul(h2 ^ c, 2246822519) >>> 0; }
  return (h1 >>> 0).toString(36) + (h2 >>> 0).toString(36);
}
// гость: «Гость» Имя (имя из 100 четырёхбуквенных — назначает сервер, accounts.data.gname); без записанного имени — стабильное по ключу
export function guestName(pkey: string, gname?: string | null): string {
  return guestDisplay(gname && isGuestName(gname) ? gname : guestNameFor(pkey));
}
// Рейтинг дуэлянтов: нижняя граница доверительного интервала Уилсона (z = 1.96) для доли побед (ничья = ½ победы).
// Одна дуэль 1:0 даёт ≈0.21 и не обгоняет, например, 18 побед из 20 (≈0.70).
export function wilsonLB(w: number, l: number, d: number, z = 1.96): number {
  const n = w + l + d;
  if (!n) return 0;
  const p = (w + d / 2) / n, z2 = z * z;
  return (p + z2 / (2 * n) - z * Math.sqrt((p * (1 - p) + z2 / (4 * n)) / n)) / (1 + z2 / n);
}
const uidOf = (pkey: string) => (pkey.startsWith("uid:") ? pkey.slice(4) : null);
const cleanName = (s: any) => (typeof s === "string" ? s.replace(/[\u0000-\u001f<>]/g, "").trim().slice(0, 32) : "");

export class Rating {
  db: any;
  at = 0;
  building: Promise<void> | null = null;
  lvl: LvlRow[] = [];
  dmg: DmgRow[] = [];
  lvlRank = new Map<string, number>();
  dmgRank = new Map<string, number>();
  duel: DuelRow[] = [];
  duelRank = new Map<string, number>();
  names = new Map<string, string>();
  gnames = new Map<string, string>(); // гость → записанное имя
  byId = new Map<string, string>(); // opaque id → pkey (только строки, которые уже показывались)
  builds = 0;
  constructor(db: any) { this.db = db; }

  async ensure(now = Date.now()) {
    if (!this.db) return;
    if (this.at && now - this.at < RATING_TTL_MS) return;
    if (!this.building) this.building = this.build().finally(() => { this.building = null; });
    await this.building;
  }

  async build() {
    const db = this.db;
    const [lv, dm, du] = await db.batch([
      db.prepare(`SELECT pkey, hero, lvl, xp, acc_hero FROM (
          SELECT h.pkey, h.hero, h.lvl, h.xp, json_extract(a.data, '$.hero') AS acc_hero,
            ROW_NUMBER() OVER (PARTITION BY h.pkey ORDER BY h.lvl DESC, h.xp DESC, (h.hero = json_extract(a.data, '$.hero')) DESC, h.hero) AS rn
          FROM heroes h LEFT JOIN accounts a ON a.pkey = h.pkey)
        WHERE rn = 1 ORDER BY lvl DESC, xp DESC, pkey LIMIT 50000`),
      db.prepare(`SELECT pkey, hero, max_dmg, max_dmg_at, max_dmg_where FROM (
          SELECT pkey, hero, max_dmg, max_dmg_at, max_dmg_where, ROW_NUMBER() OVER (PARTITION BY pkey ORDER BY max_dmg DESC, max_dmg_at ASC) AS rn
          FROM heroes WHERE max_dmg > 0)
        WHERE rn = 1 ORDER BY max_dmg DESC, max_dmg_at ASC, pkey LIMIT 50000`),
      // дуэлянты: порядок — по нижней границе Уилсона (учитывает и число дуэлей, и долю побед), см. wilsonLB
      db.prepare(`SELECT pkey, last_hero, wins, losses, draws, updated_at FROM duel_stats WHERE wins + losses + draws > 0 LIMIT 50000`),
    ]);
    this.duel = (du.results || []).map((r: any) => ({ pkey: r.pkey, hero: r.last_hero || null, w: r.wins, l: r.losses, d: r.draws, s: wilsonLB(r.wins, r.losses, r.draws), at: r.updated_at || 0 }))
      .sort((x: any, y: any) => y.s - x.s || (y.w + y.l + y.d) - (x.w + x.l + x.d) || x.at - y.at || (x.pkey < y.pkey ? -1 : 1));
    this.duelRank = new Map(this.duel.map((r, i) => [r.pkey, i + 1]));
    // душа без героя (все герои ур. 1 без опыта и герой аккаунта не выбран) — в рейтинге без класса
    this.lvl = (lv.results || []).map((r: any) => ({ pkey: r.pkey, hero: !r.acc_hero && r.lvl <= 1 && !r.xp ? null : r.hero, lvl: r.lvl, xp: r.xp }));
    this.dmg = (dm.results || []).map((r: any) => ({ pkey: r.pkey, hero: r.hero, v: r.max_dmg, at: r.max_dmg_at || 0, where: r.max_dmg_where || "" }));
    this.lvlRank = new Map(this.lvl.map((r, i) => [r.pkey, i + 1]));
    this.dmgRank = new Map(this.dmg.map((r, i) => [r.pkey, i + 1]));
    this.names = new Map(); this.gnames = new Map();
    await this.loadNames([...this.lvl.slice(0, RATING_TOP), ...this.dmg.slice(0, RATING_TOP), ...this.duel.slice(0, RATING_TOP)].map((r) => r.pkey));
    this.at = Date.now();
    this.builds++;
  }

  // имена зарегистрированных игроков — из таблицы сайта users (нет таблицы локально — гостевые имена не страдают)
  async loadNames(pkeys: string[]) {
    const uids = [...new Set(pkeys.map(uidOf).filter((u): u is string => !!u && !this.names.has("uid:" + u)))];
    for (let i = 0; i < uids.length; i += 80) {
      const part = uids.slice(i, i + 80);
      try {
        const r = await this.db.prepare(`SELECT id, username FROM users WHERE id IN (${part.map(() => "?").join(",")})`).bind(...part).all();
        for (const row of r.results || []) { const n = cleanName(row.username); if (n) this.names.set("uid:" + row.id, n); }
      } catch (_) { break; }
    }
    for (const u of uids) if (!this.names.has("uid:" + u)) this.names.set("uid:" + u, "Игрок #" + opaqueId(u).slice(0, 4).toUpperCase());
    const gs = [...new Set(pkeys.filter((p) => p.startsWith("guest:") && !this.gnames.has(p)))];
    for (let i = 0; i < gs.length; i += 80) {
      const part = gs.slice(i, i + 80);
      try {
        const r = await this.db.prepare(`SELECT pkey, json_extract(data, '$.gname') AS g FROM accounts WHERE pkey IN (${part.map(() => "?").join(",")})`).bind(...part).all();
        for (const row of r.results || []) if (row.g) this.gnames.set(row.pkey, String(row.g));
      } catch (_) { break; }
    }
  }
  name(pkey: string): string { return pkey.startsWith("uid:") ? this.names.get(pkey) || "Игрок" : guestName(pkey, this.gnames.get(pkey)); }

  roleOf: (pkey: string) => string | undefined = () => undefined;
  lvlView(r: LvlRow, rank: number, me: string) { const id = opaqueId(r.pkey); this.byId.set(id, r.pkey); return { r: rank, id, name: this.name(r.pkey), role: this.roleOf(r.pkey), hero: r.hero, lvl: r.lvl, xp: r.xp, me: r.pkey === me || undefined }; }
  dmgView(r: DmgRow, rank: number, me: string) { const id = opaqueId(r.pkey); this.byId.set(id, r.pkey); return { r: rank, id, name: this.name(r.pkey), role: this.roleOf(r.pkey), hero: r.hero, v: r.v, at: r.at, where: r.where, me: r.pkey === me || undefined }; }

  duelView(r: DuelRow, rank: number, me: string) {
    const id = opaqueId(r.pkey); this.byId.set(id, r.pkey);
    const n = r.w + r.l + r.d;
    return { r: rank, id, name: this.name(r.pkey), role: this.roleOf(r.pkey), hero: r.hero, w: r.w, l: r.l, d: r.d, n, wr: n ? Math.round((r.w / n) * 1000) / 10 : 0, score: Math.round((r.s ?? wilsonLB(r.w, r.l, r.d)) * 1000) / 10, me: r.pkey === me || undefined };
  }

  // Публичный вид рейтинга для игрока: топ-100 по обеим вкладкам + своё место (даже вне топа)
  async view(me: string) {
    await this.ensure();
    if (uidOf(me) && !this.names.has(me)) await this.loadNames([me]);
    const top = (rows: any[], f: (r: any, i: number) => any) => rows.slice(0, RATING_TOP).map((r, i) => f(r, i + 1));
    const li = this.lvlRank.get(me), di = this.dmgRank.get(me), ui = this.duelRank.get(me);
    return {
      at: this.at, ttl: RATING_TTL_MS, total: { level: this.lvl.length, dmg: this.dmg.length, duel: this.duel.length },
      level: { top: top(this.lvl, (r, i) => this.lvlView(r, i, me)), me: li ? this.lvlView(this.lvl[li - 1], li, me) : null },
      dmg: { top: top(this.dmg, (r, i) => this.dmgView(r, i, me)), me: di ? this.dmgView(this.dmg[di - 1], di, me) : null },
      duel: { top: top(this.duel, (r, i) => this.duelView(r, i, me)), me: ui ? this.duelView(this.duel[ui - 1], ui, me) : null },
    };
  }
}

// Профиль игрока «вне сети» — только для просмотра (в кэш профилей не попадает)
export async function loadPublicProfile(db: any, pkey: string): Promise<{ a: Account; heroes: Record<string, Hero & { md?: number; mdW?: string }> } | null> {
  const q = (sql: string) => db.prepare(sql).bind(pkey);
  const [accR, heroR, eqR, mkR] = (await db.batch([
    q("SELECT data FROM accounts WHERE pkey = ?"),
    q("SELECT hero, lvl, xp, talents, abil, loadout, max_dmg, max_dmg_where FROM heroes WHERE pkey = ?"),
    q("SELECT e.hero, e.slot, e.instance_id, i.item_id, i.cursed, i.ench, i.upg, i.blk FROM hero_equipment e JOIN item_instances i ON i.instance_id = e.instance_id AND i.owner = e.pkey AND i.state = 'inv' WHERE e.pkey = ?"),
    q("SELECT COALESCE(SUM(kills), 0) AS k FROM player_mob_discovery WHERE pkey = ?"), // пожизненно убито мобов (Σ бестиария)
  ])).map((r: any) => r.results || []);
  if (!accR.length && !heroR.length) return null;
  const a: Account = fixAccount({ ...newAccount(), ...(accR[0] ? JSON.parse(accR[0].data) : {}), inv: eqR.map((e: any) => ({ uid: e.instance_id, id: e.item_id, ...(e.cursed ? { cursed: 1 } : {}), ...(e.ench >= 1 && e.ench <= 6 ? { ench: e.ench | 0 } : {}), ...(e.upg ? { up: e.upg } : {}), ...(e.blk > 0 ? { blk: Math.min(100, Number(e.blk)) } : {}) })) } as Account);
  (a as any)._mk = Number(mkR?.[0]?.k) || 0;
  const heroes: Record<string, any> = {};
  for (const cls of HERO_IDS) {
    const r = heroR.find((x: any) => x.hero === cls);
    const h: any = r ? { ...newHero(cls), lvl: r.lvl, xp: r.xp, talents: JSON.parse(r.talents), abil: JSON.parse(r.abil), loadout: JSON.parse(r.loadout), equip: {}, md: r.max_dmg || 0, mdW: r.max_dmg_where || "" } : newHero(cls);
    for (const e of eqR) if (e.hero === cls) h.equip[e.slot] = e.instance_id;
    heroes[cls] = h;
  }
  return { a, heroes };
}

// Публичная карточка персонажа: имя, герой, уровень, надетое (иконка, редкость, статы), итоговые параметры
// (как их считает сервер) и навыки раскладки с Сиянием. Без сумки, ресурсов, квестов, талантов, ключей.
export function publicCharacter(name: string, cls: string, a: Account, h: Hero & { md?: number; mdW?: string }, base: any) {
  const eff: any = heroEffective(a, h, cls, base);
  const gear = equippedItems(a, h).map((e) => {
    const it = ITEM_BY_ID[e.id];
    return { slot: e.slot, n: ITEM_INDEX[e.id], id: e.id, name: it.name, rarity: it.rarity, req: Math.max(1, it.req || 1, it.lvl || 1), stats: instStats(it, e), up: (e as any).up || 0, cursed: (e as any).cursed ? 1 : 0, icon: it.icon, ...(e.cursed ? { cursed: 1 } : {}), ...((e as any).ench ? { ench: (e as any).ench } : {}), ...(blkOf(e) ? { blk: blkOf(e) } : {}) };
  });
  // очернение: сколько ушло «в тень» (статы вещей × очернение%) — показываем как есть, без объяснения, где они действуют
  const shadow: Record<string, number> = {};
  for (const e of equippedItems(a, h)) { const b = blkOf(e); if (!b) continue; for (const [k, v] of Object.entries(instStats(ITEM_BY_ID[e.id], e, true) || {})) if (typeof v === "number" && v) shadow[k] = Math.round(((shadow[k] || 0) + v) * 10) / 10; }
  return {
    name, cls, lvl: h.lvl, gear,
    stats: { maxHp: eff.maxHp, armor: eff.armor, dr: eff.damageReduction, wMin: eff.weaponMin, wMax: eff.weaponMax, dmgPct: eff.dmgPct, critPct: eff.critPct, atkSpeedPct: eff.atkSpeedPct,
      speedPct: eff.speedPct, regen: eff.regen, lifestealPct: eff.lifestealPct, cdrPct: eff.cdrPct, magnetPct: eff.magnetPct, revive: eff.revive, armorPen: eff.armorPen || 0, armorPenPct: eff.armorPenPct || 0 },
    look: eff.look || null, wtype: eff.wtype, cg: eff.cursedGlow || 0, bk: eff.blkVis || 0, blk: eff.blkAvg ? { avg: eff.blkAvg, shadow } : null,
    abilities: eff.abilities.map((x: any) => ({ id: x.id, rad: x.rad, power: x.power, cd: x.cd })),
    maxDmg: h.md ? { v: h.md, where: h.mdW || "" } : null,
    kills: killStats(a), // пожизненно: игроков / смертей от игроков / мобов
  };
}

// Счёт дуэлей игрока (для просмотра персонажа); нет таблицы/строки — нули
export async function loadDuelRecord(db: any, pkey: string): Promise<{ w: number; l: number; d: number }> {
  if (!db) return { w: 0, l: 0, d: 0 };
  try {
    const r = await db.prepare("SELECT wins, losses, draws FROM duel_stats WHERE pkey = ?").bind(pkey).first();
    return r ? { w: r.wins, l: r.losses, d: r.draws } : { w: 0, l: 0, d: 0 };
  } catch (_) { return { w: 0, l: 0, d: 0 }; }
}
