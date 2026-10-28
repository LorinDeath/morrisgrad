// Сундуки наград доски — серверная часть. Хранятся в JSON аккаунта (a.chests, как a.board — без миграции D1),
// пока не открыты и не опустошены. Открытие бросает содержимое ВНУТРЬ сундука (сохраняется: повторный вход
// покажет те же вещи); забрать/разобрать/надеть — по одной или всё; не влезло в сумку — осталось в сундуке;
// пустой сундук исчезает. Сундук принадлежит телу, которое сдало задание (как и сама награда).
import { BCHEST, BC_TIERS, BC_CURSE_MAX, tierOfRank, artOf, chestOdds, rollItems, countOf, rankCursePct, bcSpecCount, upTier, type BcTier, type BcSpec } from "./boardChestCfg";
import { ITEM_BY_ID, salvageYield, HERO_NAMES } from "./defs";
import { addItem, addRes, equip, cryptoRand, type Account, type Hero } from "./profile";

export interface BcItem { lid: number; id: string; c?: 1; e?: number; b?: number } // b — очернение %, переносится на экземпляр (InvItem.blk)
export interface BcChest { id: number; tier: BcTier; cur?: 1; L: number; cat: string; rank: string; hero: string; src: string; at: number; items?: BcItem[]; n?: number; em?: number; up?: BcTier } // up — ярус до улучшения (сундук улучшился при выдаче); em — потолок чар из награды задания
export interface BcStore { seq: number; list: BcChest[]; v?: number; op?: Record<string, number> } // op — счётчики открытых сундуков (достижения)
const BAG = 120;
export function chestsOf(a: Account): BcStore {
  const A = a as any; const s: BcStore = A.chests && typeof A.chests === "object" ? A.chests : (A.chests = { seq: 0, list: [], v: 2 });
  if (!Array.isArray(s.list)) s.list = []; s.seq = s.seq | 0;
  if ((s.v | 0) < 2) { // до ☠ вариантов: ярус «Проклятый» → проклятый божественный; старый «Чёрный» был всегда проклятым
    for (const c of s.list) if (c && (c.tier as string) === "cursed") { c.tier = "divine"; c.cur = 1; } else if (c && c.tier === "black") c.cur = 1;
    s.v = 2; }
  for (const c of s.list) if (c && Array.isArray(c.items)) c.items = c.items.filter((x) => x && ITEM_BY_ID[x.id]); // вещь удалили из игры — пропадает
  s.list = s.list.filter((c) => c && BC_TIERS.includes(c.tier) && !(Array.isArray(c.items) && c.items.length === 0));
  return s;
}
/** Счётчики открытых сундуков для достижений: all, cur (любой проклятый), <ярус>, <ярус>:c (проклятый вариант), ench (вещей с чарами).
 *  Первое обращение — задним числом по тому, что осталось в данных аккаунта: открытые, но не опустошённые сундуки в хранилище
 *  и вещи из сундуков в сумках (InvItem.src = "bchest:<ярус>"; по вещам — не меньше 1 сундука яруса, по числу вещей / потолок «до»).
 *  Опустошённые сундуки не хранятся — их можно досчитать только по журналу (audit «bchest … :open»), это не делается автоматически. */
export function chestOps(a: Account): Record<string, number> {
  const s = chestsOf(a); if (s.op && typeof s.op === "object") return s.op;
  const op: Record<string, number> = {}; const add = (k: string, n: number) => { if (n > 0) op[k] = (op[k] || 0) + n; };
  const opened = s.list.filter((c) => Array.isArray(c.items)), inv: any[] = (a as any).inv || [];
  const hi = Math.max(1, ...Object.values(BCHEST.count || {}).map((x: any) => Number(x?.max) || 1));
  for (const t of BC_TIERS) { // нижняя оценка: max(открытые в хранилище, вещи этого яруса в сумках / потолок «до») — без двойного счёта
    const oc = opened.filter((c) => c.tier === t), its = inv.filter((i) => i && i.src === "bchest:" + t);
    const n = Math.max(oc.length, its.length ? Math.ceil(its.length / hi) : 0); add(t, n); add("all", n);
    const nc = oc.filter((c) => c.cur).length; add(t + ":c", nc); add("cur", nc);
    add("ench", oc.reduce((k, c) => k + (c.items || []).filter((x) => (x.e | 0) > 0).length, 0) + its.filter((i) => (i.ench | 0) > 0).length);
  }
  s.op = op; return op;
}
function noteOpen(a: Account, c: BcChest) {
  const op = chestOps(a), add = (k: string, n = 1) => { if (n > 0) op[k] = (op[k] || 0) + n; };
  add("all"); add(c.tier); if (c.cur) { add("cur"); add(c.tier + ":c"); }
  add("ench", (c.items || []).filter((x) => (x.e | 0) > 0).length);
}
/** вещь из сундука → сумка тела: проклятие, ярус и очернение переносятся на экземпляр */
function give(a: Account, x: BcItem, c: BcChest, hero: string) {
  const it = addItem(a, x.id, "bchest:" + c.tier, hero, !!x.c, x.e || 0);
  if (it && Number(x.b) > 0) it.blk = Math.max(1, Math.min(99, Math.round(Number(x.b))));
  return it;
}
const bagN = (a: Account, hero: string | null) => a.inv.filter((i) => (i.hero || null) === (hero || null)).length;
/** Хватит ли места под новый сундук (проверка ДО записи ступени задания). */
export function chestRoomErr(a: Account, need = 1): string | null {
  if (BCHEST.on === false) return null;
  const mx = Math.max(1, BCHEST.maxStore | 0 || 100);
  return chestsOf(a).list.length + Math.max(1, need) > mx ? `Сундуков наград уже ${mx} — откройте или опустошите часть (🎁, клавиша Y), и сдайте задание снова` : null;
}
/** ярус выше на bump ступеней (не выше «божественного»: чёрный — только особые награды) */
export function bumpTier(t: BcTier | null, bump: number): BcTier | null {
  if (!t || !(bump > 0)) return t; const i = BC_TIERS.indexOf(t), top = BC_TIERS.indexOf("divine");
  return i >= top ? t : BC_TIERS[Math.min(top, i + Math.floor(bump))];
}
/** Выдать сундук за ранг задания. null — ранг без сундука или выключено. */
export function grantChest(a: Account, hero: string, rank: string, L: number, cat: string, src: string, rnd: () => number = cryptoRand, force?: boolean): BcChest | null {
  if (BCHEST.on === false) return null;
  const t0 = tierOfRank(rank); if (!t0) return null;
  const tier = upTier(t0, BCHEST.rankUp?.[rank] || 0, BCHEST.rankUp2?.[rank] || 0, rnd); // шанс улучшиться на 1/2 яруса (админка: ранг → улучшение)
  const cur = typeof force === "boolean" ? force : rnd() * 100 < rankCursePct(rank); // проклятый вариант — отдельный бросок по рангу
  const s = chestsOf(a); const c: BcChest = { id: ++s.seq, tier, ...(cur ? { cur: 1 as const } : {}), L: Math.max(1, Math.min(25, Math.round(L) || 1)), cat, rank, hero, src, at: Date.now(), ...(tier !== t0 ? { up: t0 } : {}) };
  s.list.push(c); return c;
}
/** Сундуки из награды задания (админка, поле ch): ярус, уровень, потолок чар, проклятость — как задано; потолок шанса BC_CURSE_MAX. */
export function grantSpec(a: Account, hero: string, specs: BcSpec[], taskL: number, cat: string, src: string, rnd: () => number = cryptoRand): BcChest[] {
  if (BCHEST.on === false || !Array.isArray(specs)) return [];
  const s = chestsOf(a), out: BcChest[] = [];
  for (const x of specs) { if (!BCHEST.tiers[x.t]) continue;
    for (let k = 0; k < Math.min(10, x.n | 0); k++) {
      const tier = upTier(x.t, x.u || 0, x.u2 || 0, rnd); // «шанс улучшиться до …» — бросок на сервере, на каждый сундук
      const lo = x.L || taskL, hi = x.L && x.L2 ? x.L2 : lo, L = lo + Math.floor(rnd() * (hi - lo + 1));
      const cur = x.c === "yes" ? true : typeof x.c === "number" ? rnd() * 100 < Math.min(BC_CURSE_MAX, x.c) : false;
      const c: BcChest = { id: ++s.seq, tier, ...(tier !== x.t ? { up: x.t } : {}), ...(cur ? { cur: 1 as const } : {}), L: Math.max(1, Math.min(25, Math.round(L) || 1)), cat, rank: "", hero, src, at: Date.now(), ...(Number.isInteger(x.e) && x.e! >= 0 ? { em: x.e } : {}) };
      s.list.push(c); out.push(c); } }
  return out;
}
export { bcSpecCount };
function view(a: Account, c: BcChest) {
  const o = chestOdds(c.tier, c.L, c.cat, !!c.cur);
  return { id: c.id, tier: c.tier, cur: !!c.cur, dark: o.dark, art: artOf(c.tier, c.rank, !!c.cur), name: o.name, color: o.color, L: c.L, cat: c.cat, rank: c.rank, hero: c.hero, heroName: (HERO_NAMES as any)[c.hero] || c.hero,
    src: c.src, at: c.at, ...(c.up && BCHEST.tiers[c.up] ? { upFrom: BCHEST.tiers[c.up].name } : {}), opened: Array.isArray(c.items), items: c.items || null, odds: o };
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
    chestOps(a); // задним числом — до первого нового открытия, чтобы оно не посчиталось дважды
    let lid = 0; c.items = rollItems(c.tier, c.L, c.cat, rnd, !!c.cur, Number.isInteger(c.em) ? c.em! : -1).map((x) => ({ lid: ++lid, ...x })); c.n = c.items.length; fresh = true;
    noteOpen(a, c);
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
