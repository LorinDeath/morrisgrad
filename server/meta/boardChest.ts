// Сундуки наград доски — серверная часть. Хранятся в JSON аккаунта (a.chests, как a.board — без миграции D1),
// пока не открыты и не опустошены. Открытие бросает содержимое ВНУТРЬ сундука (сохраняется: повторный вход
// покажет те же вещи); забрать/разобрать/надеть — по одной или всё; не влезло в сумку — осталось в сундуке;
// пустой сундук исчезает. Сундук принадлежит телу, которое сдало задание (как и сама награда).
import { BCHEST, BC_TIERS, tierOfRank, artOf, chestOdds, rollItems, countOf, type BcTier } from "./boardChestCfg";
import { ITEM_BY_ID, salvageYield, HERO_NAMES } from "./defs";
import { addItem, addRes, equip, cryptoRand, type Account, type Hero } from "./profile";

export interface BcItem { lid: number; id: string; c?: 1; e?: number; b?: number } // b — очернение %, переносится на экземпляр (InvItem.blk)
export interface BcChest { id: number; tier: BcTier; L: number; cat: string; rank: string; hero: string; src: string; at: number; items?: BcItem[]; n?: number }
export interface BcStore { seq: number; list: BcChest[] }
const BAG = 120;
export function chestsOf(a: Account): BcStore {
  const A = a as any; const s: BcStore = A.chests && typeof A.chests === "object" ? A.chests : (A.chests = { seq: 0, list: [] });
  if (!Array.isArray(s.list)) s.list = []; s.seq = s.seq | 0;
  for (const c of s.list) if (c && Array.isArray(c.items)) c.items = c.items.filter((x) => x && ITEM_BY_ID[x.id]); // вещь удалили из игры — пропадает
  s.list = s.list.filter((c) => c && BC_TIERS.includes(c.tier) && !(Array.isArray(c.items) && c.items.length === 0));
  return s;
}
/** вещь из сундука → сумка тела: проклятие, ярус и очернение переносятся на экземпляр */
function give(a: Account, x: BcItem, c: BcChest, hero: string) {
  const it = addItem(a, x.id, "bchest:" + c.tier, hero, !!x.c, x.e || 0);
  if (it && Number(x.b) > 0) it.blk = Math.max(1, Math.min(99, Math.round(Number(x.b))));
  return it;
}
const bagN = (a: Account, hero: string | null) => a.inv.filter((i) => (i.hero || null) === (hero || null)).length;
/** Хватит ли места под новый сундук (проверка ДО записи ступени задания). */
export function chestRoomErr(a: Account): string | null {
  if (BCHEST.on === false) return null;
  const mx = Math.max(1, BCHEST.maxStore | 0 || 100);
  return chestsOf(a).list.length >= mx ? `Сундуков наград уже ${mx} — откройте или опустошите часть (🎁, клавиша Y), и сдайте задание снова` : null;
}
/** Выдать сундук за ранг задания. null — ранг без сундука или выключено. */
export function grantChest(a: Account, hero: string, rank: string, L: number, cat: string, src: string): BcChest | null {
  if (BCHEST.on === false) return null;
  const tier = tierOfRank(rank); if (!tier) return null;
  const s = chestsOf(a); const c: BcChest = { id: ++s.seq, tier, L: Math.max(1, Math.min(25, Math.round(L) || 1)), cat, rank, hero, src, at: Date.now() };
  s.list.push(c); return c;
}
function view(a: Account, c: BcChest) {
  const o = chestOdds(c.tier, c.L, c.cat);
  return { id: c.id, tier: c.tier, art: artOf(c.tier, c.rank), name: o.name, color: o.color, L: c.L, cat: c.cat, rank: c.rank, hero: c.hero, heroName: (HERO_NAMES as any)[c.hero] || c.hero,
    src: c.src, at: c.at, opened: Array.isArray(c.items), items: c.items || null, odds: o };
}
export function chestList(a: Account) {
  const s = chestsOf(a);
  return { ok: true, list: s.list.slice().sort((x, y) => y.at - x.at || y.id - x.id).map((c) => view(a, c)), max: Math.max(1, BCHEST.maxStore | 0 || 100) };
}
const find = (a: Account, h: string | null, id: any) => {
  const c = chestsOf(a).list.find((x) => x.id === Number(id));
  if (!c) return { err: "Сундука нет — обновите окно" };
  if (h !== c.hero) return { err: `Это сундук героя ${(HERO_NAMES as any)[c.hero] || c.hero} — откройте его, играя этим телом` };
  return { c };
};
const drop = (a: Account, c: BcChest) => { const s = chestsOf(a); if (c.items && !c.items.length) s.list = s.list.filter((x) => x !== c); };
/** Открыть: бросок вещей внутрь сундука (один раз; повтор — те же вещи). Сумка не нужна. */
export function chestOpen(a: Account, h: string | null, id: any, rnd: () => number = cryptoRand) {
  const f = find(a, h, id); if (f.err) return { ok: false, err: f.err }; const c = f.c!;
  let fresh = false;
  if (!Array.isArray(c.items)) {
    let lid = 0; c.items = rollItems(c.tier, c.L, c.cat, rnd).map((x) => ({ lid: ++lid, ...x })); c.n = c.items.length; fresh = true;
    if (!c.items.length) { const s = chestsOf(a); s.list = s.list.filter((x) => x !== c); return { ok: true, chest: { ...view(a, c), items: [] }, fresh, gone: true }; }
  }
  return { ok: true, chest: view(a, c), fresh };
}
/** Забрать одну (lid) или всё (all): сколько влезло в сумку тела; остальное остаётся. */
export function chestTake(a: Account, h: string | null, id: any, lid: any, all: boolean) {
  const f = find(a, h, id); if (f.err) return { ok: false, err: f.err }; const c = f.c!;
  if (!Array.isArray(c.items)) return { ok: false, err: "Сначала откройте сундук" };
  const want = all ? c.items.slice() : c.items.filter((x) => x.lid === Number(lid));
  if (!want.length) return { ok: false, err: "Этой вещи в сундуке уже нет" };
  const got: any[] = []; let full = false;
  for (const x of want) {
    if (bagN(a, c.hero) >= BAG) { full = true; break; }
    const it = give(a, x, c, c.hero); if (!it) { full = true; break; }
    c.items = c.items.filter((y) => y !== x); got.push({ lid: x.lid, uid: it.uid, id: it.id });
  }
  drop(a, c);
  const left = c.items.length;
  return { ok: got.length > 0 || !full, got, left, gone: !left, full, err: !got.length && full ? "Сумка полна — освободите место (вещи остались в сундуке)" : undefined,
    msg: full && got.length ? `Забрано ${got.length}, сумка полна — ${left} осталось в сундуке` : undefined, chest: left ? view(a, c) : null };
}
/** Разобрать вещь прямо из сундука (сумка не нужна): материалы по правилам разбора. */
export function chestSalvage(a: Account, h: string | null, id: any, lid: any) {
  const f = find(a, h, id); if (f.err) return { ok: false, err: f.err }; const c = f.c!;
  if (!Array.isArray(c.items)) return { ok: false, err: "Сначала откройте сундук" };
  const x = c.items.find((y) => y.lid === Number(lid)); if (!x || !ITEM_BY_ID[x.id]) return { ok: false, err: "Этой вещи в сундуке уже нет" };
  const got = salvageYield(x.id);
  c.items = c.items.filter((y) => y !== x);
  for (const [r, n] of Object.entries(got)) addRes(a, r, n);
  drop(a, c);
  return { ok: true, got, lid: x.lid, left: c.items.length, gone: !c.items.length, chest: c.items.length ? view(a, c) : null };
}
/** Надеть прямо из сундука: вещь переходит в сумку и надевается (уровень проверяет equip). Нужно 1 место в сумке. */
export function chestEquip(a: Account, hero: Hero, cls: string, id: any, lid: any) {
  const f = find(a, cls, id); if (f.err) return { ok: false, err: f.err }; const c = f.c!;
  if (!Array.isArray(c.items)) return { ok: false, err: "Сначала откройте сундук" };
  const x = c.items.find((y) => y.lid === Number(lid)); if (!x) return { ok: false, err: "Этой вещи в сундуке уже нет" };
  const def = ITEM_BY_ID[x.id]; const req = Math.max(def?.req || 1, def?.lvl || 1);
  if (hero.lvl < req) return { ok: false, err: `Нужен ${req} уровень героя (у героя ${hero.lvl})` };
  if (bagN(a, cls) >= BAG) return { ok: false, err: "Сумка полна — снятая вещь не поместится" };
  const it = give(a, x, c, cls); if (!it) return { ok: false, err: "Сумка полна" };
  const r = equip(a, hero, cls, it.uid);
  if (!r.ok) { a.inv = a.inv.filter((i) => i.uid !== it.uid); return { ok: false, err: (r as any).err || "Не удалось надеть" }; }
  c.items = c.items.filter((y) => y !== x); drop(a, c);
  return { ok: true, uid: it.uid, lid: x.lid, left: c.items.length, gone: !c.items.length, chest: c.items.length ? view(a, c) : null };
}
export { countOf };
