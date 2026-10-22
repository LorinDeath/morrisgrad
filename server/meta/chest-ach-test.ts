// 🏆 Достижения за сундуки наград: открытые по ярусам и проклятым вариантам (1/10/50/100/500), первый проклятый, первый «Чёрный проклятый» (скрытые),
// вещи с чарами из сундуков; считает сервер (boardChest.chestOps), задним числом — по следам в аккаунте. Запуск: cd server && bun meta/chest-ach-test.ts
import { BTASK_LIST, boardRefresh, boardOf, boardClient } from "./board";
import { grantChest, chestOpen, chestOps, chestsOf } from "./boardChest";
import { BC_TIERS, BCHEST } from "./boardChestCfg";
import { newAccount, newHero } from "./profile";
let f = 0, n = 0; const ok = (c: any, m: string, x?: any) => { n++; console.log((c ? "PASS " : "FAIL ") + m + (!c && x !== undefined ? " " + JSON.stringify(x) : "")); if (!c) f++; };
let seed = 777; const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x80000000);
const L = BTASK_LIST().filter((t: any) => /^ach_(x_)?bch_/.test(t.id));
ok(L.length === 3 + BC_TIERS.length * 2 + 2, `достижений за сундуки: ${L.length}`);
for (const t of BC_TIERS) { const a = L.find((x: any) => x.id === `ach_bch_${t}`), c = L.find((x: any) => x.id === `ach_bch_${t}_c`);
  ok(a && c && JSON.stringify(a.n) === "[1,10,50,100,500]" && JSON.stringify(c.n) === "[1,10,50,100,500]", `${t}: обычный и проклятый, ступени 1/10/50/100/500`); }
ok(L.every((t: any) => (t.res?.soul_shard || 0) > 0), "награда — Осколки души (+ опыт по сложности)");
ok(L.filter((t: any) => t.hidden).map((t: any) => t.id).sort().join() === "ach_x_bch_first_black_c,ach_x_bch_first_cur", "скрытые: первый проклятый и первый «Чёрный проклятый»");
// новый игрок: доска запущена до сундуков — всё с нуля; открыл — засчитано сервером
const a: any = newAccount(), W: any = newHero("warrior"); W.lvl = 10; a.hero = "warrior"; const ctx = { pkey: "uid:cha", heroes: { warrior: W } };
boardRefresh(a, W, ctx); const b = boardOf(a);
ok(!(b.p.ach_bch_all || 0) && !(b.pre.ach_bch_all || 0), "до открытий — 0");
const got = { cur: 0, black: 0 }; let cc: any = null;
for (let i = 0; i < 40; i++) { const c = grantChest(a, "warrior", i % 2 ? "F" : "SS", 10, "daily", "t", rnd)!; if (c.cur) got.cur++; if (c.cur && c.tier === "black") cc = c; chestOpen(a, "warrior", c.id, rnd); chestsOf(a).list = chestsOf(a).list.filter((x) => x.id !== c.id); }
const op = chestOps(a); ok(op.all === 40 && (op.cur || 0) === got.cur, "счётчики открытых: всего 40, проклятых — сколько выпало", op);
ok((op.common || 0) === 20 && (op.black || 0) === 20, "по ярусам: F → простой, SS → чёрный", op);
const o2 = chestOpen(a, "warrior", grantChest(a, "warrior", "F", 10, "daily", "t", rnd)!.id, rnd); const id2 = o2.chest!.id; chestOpen(a, "warrior", id2, rnd);
ok(chestOps(a).all === 41, "повторное открытие того же сундука не считается");
boardRefresh(a, W, ctx);
ok((b.p.ach_bch_all || 0) === 41 && (b.p.ach_bch_common || 0) === 21, "прогресс достижений = счётчики сервера", { all: b.p.ach_bch_all, common: b.p.ach_bch_common });
ok(!got.cur || (b.p.ach_x_bch_first_cur || 0) >= 1, "первый проклятый — засчитан");
const st: any = boardClient(a, W); ok(!got.cur || st.reveal?.ach_x_bch_first_cur, "скрытый «первый проклятый» раскрыт после выполнения");
ok(!!cc === !!(b.p.ach_x_bch_first_black_c || 0), "«Чёрный проклятый» — только если такой сундук был открыт", { cc: !!cc });
// задним числом: аккаунт со старыми данными (открытый недобранный сундук + вещи из сундуков в сумке), счётчиков ещё нет
const r: any = newAccount(); r.chests = { seq: 2, v: 2, list: [{ id: 1, tier: "rare", cur: 1, L: 5, cat: "daily", rank: "C", hero: "warrior", src: "x", at: 1, items: [{ lid: 1, id: "dew_slime_weapon", e: 2 }] }, { id: 2, tier: "rare", L: 5, cat: "daily", rank: "C", hero: "warrior", src: "x", at: 1 }] };
r.inv = [{ uid: "u1", id: "dew_slime_weapon", src: "bchest:legendary", n: 1, ench: 1 }, { uid: "u2", id: "dew_slime_weapon", src: "bchest:legendary", n: 1 }, { uid: "u3", id: "dew_slime_weapon", src: "drop", n: 1 }];
const ro = chestOps(r);
ok(ro.rare === 1 && ro["rare:c"] === 1 && ro.cur === 1 && ro.legendary === 1 && ro.all === 2 && ro.ench === 2, "задним числом: открытый сундук и вещи из сундуков в сумке", ro);
ok(chestOps(r) === ro, "оценка прошлого — один раз, дальше только новые открытия");
const max = BCHEST.maxStore; void max;
console.log(f ? `FAILED ${f}` : `chest-ach ok ${n}/${n}`); if (f) process.exit(1);
