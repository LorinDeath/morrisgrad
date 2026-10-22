// 🎁 Награда «Сундуки» в заданиях (админка, поле ch): проверка правки на сервере, выдача за последнюю ступень (ярус, количество,
// уровень вещей, потолок чар, проклятость), хранилище (полно — не сдать, как ранговое), без поля — как раньше. Запуск: cd server && bun meta/chest-reward-test.ts
import { BCHEST, BC_TIERS, BC_ENCH_CAP, BC_CURSE_MAX, bcSpecErr, rollItems } from "./boardChestCfg";
import { validatePatch, applyOverride, currentValues, SCHEMA } from "./overrides";
import { chestsOf, chestOpen } from "./boardChest";
import { BTASKS, BTASK_LIST, boardRefresh, boardOf, boardClaim, boardClient, makeRoll } from "./board";
import { newAccount, newHero } from "./profile";
import { ITEM_BY_ID } from "./defs";
let f = 0, n = 0; const ok = (c: any, m: string, x?: any) => { n++; console.log((c ? "PASS " : "FAIL ") + m + (!c && x !== undefined ? " " + JSON.stringify(x) : "")); if (!c) f++; };
let seed = 4242; const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x80000000);
// 1) схема и проверка правки
ok(SCHEMA.btask.fields.some((x: any) => x.path === "ch" && x.t === "chests"), "поле «Сундуки» в схеме задания (сохраняется формой задания)");
const id0 = "d_kill_b"; ok(!!BTASKS[id0], "задание для проверки есть");
const bad: [any, string][] = [
  [[{ n: 1, t: "nope" }], "ярус"], [[{ n: 0, t: "rare" }], "сколько 0"], [[{ n: 11, t: "rare" }], "сколько 11"],
  [[{ n: 1, t: "common", e: 1 }], "простой с чарами"], [[{ n: 1, t: "rare", e: BC_ENCH_CAP.rare + 1 }], "чары выше яруса"],
  [[{ n: 1, t: "rare", c: BC_CURSE_MAX + 1 }], "шанс проклятого > 30"], [[{ n: 1, t: "rare", c: "maybe" }], "проклятый — неизвестно"],
  [[{ n: 1, t: "rare", L: 26 }], "уровень 26"], [[{ n: 1, t: "rare", L: 12, L2: 10 }], "уровень до < от"], [[{ n: 1, t: "rare", L: 0, L2: 5 }], "диапазон без «от»"],
  [Array.from({ length: 6 }, () => ({ n: 1, t: "rare" })), "больше 5 строк"], [{ n: 1 }, "не список"],
];
for (const [v, m] of bad) { const r = validatePatch("btask", id0, { ch: v }); ok(typeof r === "string", `отклонено: ${m}`, r); }
const good = [{ n: 2, t: "rare", L: 0, e: 1, c: "no" }, { n: 1, t: "legendary", L: 14, L2: 16, e: -1, c: 30 }, { n: 1, t: "black", L: 20, c: "yes", e: 6 }];
const pv = validatePatch("btask", id0, { ch: good });
ok(typeof pv === "object" && pv.ch.length === 3 && pv.ch[0].e === 1 && pv.ch[1].L2 === 16 && pv.ch[1].e === undefined && pv.ch[2].c === "yes", "принято и нормализовано", pv);
ok(bcSpecErr(null) === null && bcSpecErr([]) === null, "пустое поле — без награды-сундука");
// 2) выдача: задание с полем ch → сундуки за последнюю ступень (+ сундук ранга, как раньше)
const a: any = newAccount(); const W: any = newHero("warrior"); W.lvl = 10; a.hero = "warrior"; const ctx = { pkey: "uid:chr", heroes: { warrior: W } };
boardRefresh(a, W, ctx);
const prep = (id: string, rank?: string) => { const b = boardOf(a); if (!b.sel.daily.includes(id)) b.sel.daily.push(id); delete b.c[id];
  if (rank) b.roll[id] = makeRoll(BTASKS[id], W.lvl, "x|" + id + rank, id, ["warrior"], rank, "warrior", { warrior: W.lvl }); else delete b.roll[id];
  b.p[id] = rank ? b.roll[id].n : Math.max(...BTASKS[id].n); return id; };
applyOverride("btask", id0, pv);
ok(JSON.stringify(currentValues("btask", id0)!.ch) === JSON.stringify(pv.ch), "правка применена, админка видит её (currentValues)");
{ const st: any = (boardRefresh(a, W, ctx), boardClient(a, W)); const bx = st.bx?.[id0];
  ok(Array.isArray(bx) && bx.length === 3 && bx[0].k === 2 && bx[1].cp === 30 && bx[2].cp === 100 && bx[2].n === BCHEST.tiers.black.nameC, "клиент получает строки сундуков (bx) для карточки и записки", bx); }
const before = chestsOf(a).list.length;
{ prep(id0, "C"); const r = boardClaim(a, W, id0, ctx);
  ok(r.ok && r.chest?.tier === "rare" && r.chests?.length === 4, `сдано: сундук ранга C + 4 из награды (${r.err || ""})`, r.chests);
  const L = chestsOf(a).list.slice(before);
  ok(L.length === 5, "в хранилище +5 сундуков");
  const sp = L.filter((c: any) => c.rank === "");
  const rr = sp.filter((c: any) => c.tier === "rare"), lg = sp.find((c: any) => c.tier === "legendary"), bk = sp.find((c: any) => c.tier === "black");
  ok(rr.length === 2 && rr.every((c: any) => !c.cur && c.em === 1 && c.L === r.chest.L), "2 × редкий: не проклятые, чары до 1, уровень — уровень задания", rr);
  ok(lg && lg.L >= 14 && lg.L <= 16 && lg.em === undefined, "легендарный: уровень 14…16, чары по ярусу", lg);
  ok(bk && bk.cur === 1 && bk.L === 20 && bk.em === 6, "чёрный проклятый: да, ур. 20", bk);
  const o = chestOpen(a, "warrior", rr[0].id, rnd); ok(o.ok && o.chest.items.every((x: any) => !x.e || x.e <= 1), "открыт редкий: чары не выше 1", o.chest?.items); }
// потолок чар при броске
{ let mx = 0; for (let k = 0; k < 400; k++) for (const x of rollItems("legendary", 12, "monthly", rnd, false, 2)) mx = Math.max(mx, x.e || 0); ok(mx > 0 && mx <= 2, `потолок чар 2 у легендарного: макс. ${mx}`); }
{ let bc = 0, cur = 0, tot = 0; for (let k = 0; k < 2000; k++) { for (const x of rollItems("legendary", 20, "monthly", rnd, true)) { tot++; if (x.c && x.e === 6) bc++; } }
  ok(bc === 0, "«чёрные проклятые» (☠ + ✦6) — не из легендарного проклятого"); void cur; void tot; }
// шанс проклятого 30 %: доля ≈ 30
{ const t = "w_kill_b" in BTASKS ? "w_kill_b" : id0; applyOverride("btask", id0, { ch: [{ n: 10, t: "uncommon", c: 30 }] }); let c = 0, m = 0;
  for (let k = 0; k < 30; k++) { prep(id0); chestsOf(a).list = []; const r = boardClaim(a, W, id0, ctx); if (r.ok) for (const x of r.chests) { m++; if (x.cur) c++; } }
  ok(m === 300 && Math.abs(c / m * 100 - 30) < 7, `шанс 30 %: проклятых ${c} из ${m}`); void t; }
// хранилище полно — не сдать (то же сообщение, что у ранговых), ступень не записана
{ applyOverride("btask", id0, { ch: [{ n: 3, t: "rare" }] }); const mx = BCHEST.maxStore; BCHEST.maxStore = 4; chestsOf(a).list = [];
  for (let k = 0; k < 2; k++) chestsOf(a).list.push({ id: 900 + k, tier: "common", L: 5, cat: "daily", rank: "F", hero: "warrior", src: "t", at: 1 } as any);
  prep(id0); const r = boardClaim(a, W, id0, ctx);
  ok(!r.ok && /Сундуков наград уже 4/.test(r.err) && !(boardOf(a).c[id0] || 0), "2 + 3 > 4 — не сдано, ступень не записана", r);
  chestsOf(a).list.pop(); const need = 3 + (boardOf(a).roll[id0] ? 1 : 0); while (chestsOf(a).list.length + need > 4) chestsOf(a).list.pop();
  const r2 = boardClaim(a, W, id0, ctx); ok(r2.ok && r2.chests.length === 3 && chestsOf(a).list.length === 4, `место ровно на ${need} (3 из награды${need > 3 ? " + сундук ранга" : ""}) — сдано`, r2.err); BCHEST.maxStore = mx; }
// без поля — как раньше: только сундук ранга
{ applyOverride("btask", id0, null); chestsOf(a).list = []; prep(id0, "B"); const r = boardClaim(a, W, id0, ctx);
  ok(r.ok && r.chest?.tier === "strange" && !r.chests, "без поля «Сундуки» — только сундук ранга, как раньше", r);
  const st: any = boardClient(a, W); ok(!st.bx?.[id0], "клиент: строк сундуков нет"); }
// любые разделы: персонаж / достижение / обучение — поле в той же схеме, выдача в claimTiers
{ const np = BTASK_LIST().find((t: any) => t.cat === "npc"); ok(!!np && typeof validatePatch("btask", np.id, { ch: [{ n: 1, t: "divine", e: 5 }] }) === "object", "задание персонажа: поле принимается"); }
{ const ac = BTASK_LIST().find((t: any) => t.cat === "ach"); ok(!!ac && typeof validatePatch("btask", ac.id, { ch: [{ n: 1, t: "common", e: 0 }] }) === "object", "достижение: поле принимается"); }
void ITEM_BY_ID; void BC_TIERS;
console.log(f ? `FAILED ${f}` : `chest-reward ok ${n}/${n}`); if (f) process.exit(1);
