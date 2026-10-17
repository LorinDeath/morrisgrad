import { parseTag } from "./enchant";
// Добыча на земле (Albion-стиль): после убийства у трупа лежит ЛИЧНЫЙ мешок каждого, кто получил награду (вклад ≥15%).
// Сервер — авторитет: владелец, дальность подбора, таймер исчезновения, полная сумка, анти-дюп (каждая позиция
// мешка имеет свой lid и снимается ровно один раз), лимит запросов. Мешки живут в памяти комнаты (DO) — как мобы.
export const BAG_TTL_MS = 120_000;   // мешок исчезает через 2 мин
export const BAG_RANGE = 110;        // px: открыть/забрать — не дальше
export const BAG_MAX_PER_OWNER = 40; // старые мешки владельца исчезают первыми
export const TAKE_RATE = 25;         // позиций/с (Shift-проводка забирает быстро, но не флудом)
export type BagEntry = { lid: number; k: "item" | "res"; id: string; n: number; c?: 1; e?: number }; // e — ярус зачарования 1…6 (сервер) // c — проклятый экземпляр (решает сервер)
export type Bag = { id: number; world: string; x: number; y: number; owner: string; at: number; exp: number; src: string; kind: string; mob: string; entries: BagEntry[] };

export const KILLER_BAG_CHANCE = 0.1; // мешок добившему вместо лучшего по урону
/** Владелец мешка: игрок с наибольшим уроном; с шансом 10% (rng сервера) — добивший (если это игрок). Мобы («mob:…») не владеют. */
export function pickBagOwner(dmgBy: Map<string, number>, killer: string | null | undefined, rand: () => number): string | null {
  let best: string | null = null, bd = -1;
  for (const [sid, d] of dmgBy) if (!sid.startsWith("mob:") && d > bd) { bd = d; best = sid; }
  if (!best) return null;
  if (killer && !killer.startsWith("mob:") && killer !== best && dmgBy.has(killer) && rand() < KILLER_BAG_CHANCE) return killer;
  return best;
}

export class LootBags {
  bags = new Map<number, Bag>();
  private nextId = 1; private nextLid = 1;
  private rl = new Map<string, { t: number; tokens: number }>();
  drop(world: string, x: number, y: number, owner: string, loot: { items: string[]; res: Record<string, number> }, src: string, kind: string, mob: string, now = Date.now()): Bag | null {
    const entries: BagEntry[] = [];
    for (const raw of loot.items) { const t = parseTag(raw); entries.push({ lid: this.nextLid++, k: "item", id: t.id, n: 1, ...(t.c ? { c: 1 as const } : {}), ...(t.e ? { e: t.e } : {}) }); }
    for (const [id, n] of Object.entries(loot.res)) if (n > 0) entries.push({ lid: this.nextLid++, k: "res", id, n });
    if (!entries.length) return null;
    const mine = [...this.bags.values()].filter((b) => b.owner === owner).sort((a, b) => a.at - b.at);
    while (mine.length >= BAG_MAX_PER_OWNER) this.bags.delete(mine.shift()!.id);
    // мешки одного владельца у одного трупа не накладываются: небольшой сдвиг
    const b: Bag = { id: this.nextId++, world, x: Math.round(x + (Math.random() - 0.5) * 16), y: Math.round(y + (Math.random() - 0.5) * 16), owner, at: now, exp: now + BAG_TTL_MS, src, kind, mob, entries };
    this.bags.set(b.id, b);
    return b;
  }
  expire(now = Date.now()) { for (const [id, b] of this.bags) if (now >= b.exp || !b.entries.length) this.bags.delete(id); }
  /** мешки владельца рядом (для zone_state): [id, x, y, позиций] */
  near(owner: string, world: string, x: number, y: number, r: number): [number, number, number, number][] {
    const out: [number, number, number, number][] = [];
    for (const b of this.bags.values()) if (b.owner === owner && b.world === world && Math.abs(b.x - x) <= r && Math.abs(b.y - y) <= r) out.push([b.id, b.x, b.y, b.entries.length]);
    return out;
  }
  /** проверка доступа: свой мешок, тот же мир, рядом, не истёк */
  access(id: any, owner: string, world: string, x: number, y: number, now = Date.now()): Bag | string {
    const b = this.bags.get(Number(id));
    if (!b || now >= b.exp) return "Мешок исчез";
    if (b.owner !== owner) return "Это чужая добыча";
    if (b.world !== world || Math.hypot(b.x - x, b.y - y) > BAG_RANGE) return "Подойдите ближе к мешку";
    return b;
  }
  /** лимит: позиций в секунду на владельца */
  admit(owner: string, n: number, now = Date.now()) {
    const r = this.rl.get(owner) || { t: now, tokens: TAKE_RATE };
    r.tokens = Math.min(TAKE_RATE, r.tokens + ((now - r.t) / 1000) * TAKE_RATE); r.t = now;
    const can = Math.max(0, Math.min(n, Math.floor(r.tokens))); r.tokens -= can; this.rl.set(owner, r);
    return can;
  }
  /** снять позиции (lids или все): give() кладёт в инвентарь и возвращает false, если некуда — позиция остаётся */
  take(b: Bag, lids: number[] | "all", give: (e: BagEntry) => boolean, budget: number) {
    const want = lids === "all" ? b.entries.map((e) => e.lid) : [...new Set(lids.map(Number))].filter(Number.isInteger);
    const got: BagEntry[] = []; let full = false;
    for (const lid of want) {
      if (got.length >= budget) break;
      const i = b.entries.findIndex((e) => e.lid === lid); if (i < 0) continue; // уже взято — анти-дюп
      const e = b.entries[i];
      if (!give(e)) { full = true; continue; }
      b.entries.splice(i, 1); got.push(e);
    }
    if (!b.entries.length) this.bags.delete(b.id);
    return { got, full, left: b.entries.length };
  }
}
