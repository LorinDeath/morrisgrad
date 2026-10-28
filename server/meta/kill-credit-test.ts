// Аудит зачёта убийств (решение Алекса): каждая категория мобов × каждый потребитель (сюжетные квесты, доска: личные/охота/ежедневные,
// достижения, Бестиарий), соло и в отряде (рядом без урона, павший рядом, далеко). Прогон: bun meta/kill-credit-test.ts
import { MetaService } from "./service";
import { newAccount, newHero, acceptQuest } from "./profile";
import { BTASKS, boardOf, boardRefresh, boardClaim, BOARD_CFG, makeRoll, fitWindow, fitReward } from "./board";
import { bumpTier } from "./boardChest";
import { tierOfRank } from "./boardChestCfg";
import { ZONE_MOBS, RUN_BOSS_BY_ROOM } from "./defs";
import { QUEST_BY_ID } from "./quests";
let f = 0; const ok = (c: any, m: string, x?: any) => { console.log((c ? "PASS " : "FAIL ") + m + (!c && x !== undefined ? " " + JSON.stringify(x) : "")); if (!c) f++; };
BOARD_CFG.tutVetReward = false;
for (const id of ["npc_a02", "npc_a10", "npc_a06"]) (BTASKS[id] as any).req = undefined; // цепочки NPC — не предмет теста
let HL = 30;
const TRACK = ["hunt_rare_white_stag", "hunt_wb_moon_sentinel", "hunt_wb_air_moon_sentinel", "ach_rare_white_stag", "ach_wb_moon_sentinel", "ach_wb_air_moon_sentinel", "hard_solo_moon_sentinel", "ach_kills", "ach_elite", "ach_rare", "ach_wboss", "ach_party_k", "npc_a01", "npc_a02", "npc_a10", "npc_a06", "d_kill_a", "d_elite_a", "d_rare", "d_wboss"];

function world() {
  const svc: any = new MetaService(null, {});
  const acc = new Map<string, any>(), her = new Map<string, any>(), sess = new Map<string, any>();
  svc.store.account = (pk: string) => acc.get(pk); svc.store.hero = (pk: string) => her.get(pk); svc.store.heroMap = (pk: string) => ({ warrior: her.get(pk) });
  svc.push = () => {}; svc.send = () => {}; svc.boardSoon = () => {};
  svc.sessionLookup = (sid: string) => sess.get(sid) || null;
  const add = (sid: string, x: number, y: number, o: any = {}) => {
    const pk = "uid:" + sid, a: any = newAccount(), h: any = newHero("warrior"); a.hero = "warrior"; h.lvl = HL;
    acc.set(pk, a); her.set(pk, h); boardRefresh(a, h, { pkey: pk });
    const b = boardOf(a); b.sel.daily = ["d_kill_a", "d_elite_a", "d_rare", "d_wboss"]; for (const id of b.sel.daily) delete b.roll[id];
    for (const id of ["npc_a01", "npc_a02", "npc_a10", "npc_a06", "hunt_rare_white_stag", "hunt_wb_moon_sentinel", "hunt_wb_air_moon_sentinel", "hard_solo_moon_sentinel"]) if (!b.tk.includes(id)) b.tk.push(id);
    a.quests.active.l4_boss = { p: [0] }; // «Безветрие»
    sess.set(sid, [{ sid }, { id: sid, username: sid, world: o.world || "arinar", x, y, stats: { classId: "warrior" }, runId: o.run || null }]);
    svc.ms.set(sid, { pkey: pk, ready: true, zp: { sid, hp: o.dead ? 0 : 100, maxHp: 100, alive: !o.dead, x, y }, abilCd: {} });
    return a;
  };
  return { svc, add };
}
const snap = (a: any, type: string) => { const b = boardOf(a), o: any = { best: a.bestiary[type]?.kills || 0, l4: a.quests.active.l4_boss?.p?.[0] || (a.quests.done.includes("l4_boss") ? 1 : 0) }; for (const id of TRACK) o[id] = b.p[id] || 0; return o; };
const diff = (x: any, y: any) => Object.fromEntries(Object.keys(y).filter((k) => y[k] !== x[k]).map((k) => [k, y[k] - x[k]]));

let mid = 1;
const mob = (type: string, o: any = {}) => ({ id: mid++, type, x: 500, y: 500, hp: 0, maxHp: 100, dmgBy: new Map<string, number>(o.dmg || [["A", 100]]), killer: o.killer || "A",
  elite: !!o.elite, chief: !!o.chief, cursed: false, ench: 0, special: o.special || "", usedAbility: new Set<string>(), qf: new Map(), region: o.region ?? "r1", camp: 0 });

// категории: [метка, тип, флаги моба, ожидаемые задания доски для убийцы]
const anyReg = Object.entries(ZONE_MOBS).find(([, d]: any) => !d.boss && !d.rare && !d.variant && d.lvl >= 5)![0];
const CATS: [string, string, any, string[]][] = [
  ["обычный", anyReg, {}, ["ach_kills", "npc_a01", "d_kill_a"]],
  ["элита", anyReg, { elite: true }, ["ach_kills", "ach_elite", "npc_a01", "npc_a02", "d_kill_a", "d_elite_a"]],
  ["вожак (элита лагеря)", anyReg, { elite: true, chief: true }, ["ach_kills", "ach_elite", "npc_a01", "npc_a02", "d_kill_a", "d_elite_a"]],
  ["редкий", "white_stag", { special: "rare" }, ["ach_kills", "ach_elite", "ach_rare", "npc_a01", "npc_a02", "npc_a10", "d_elite_a", "d_rare", "hunt_rare_white_stag", "ach_rare_white_stag"]],
  ["мировой босс (Безветрие)", "moon_sentinel", { special: "boss" }, ["ach_kills", "ach_wboss", "npc_a01", "npc_a06", "d_kill_a", "d_wboss", "hunt_wb_moon_sentinel", "ach_wb_moon_sentinel"]],
  ["мировой босс-вариант", "air_moon_sentinel", { special: "boss" }, ["ach_kills", "ach_wboss", "npc_a01", "npc_a06", "d_kill_a", "d_wboss", "hunt_wb_air_moon_sentinel", "ach_wb_air_moon_sentinel"]],
  ["призванный помощник босса", anyReg, { region: null }, ["ach_kills", "npc_a01", "d_kill_a"]],
];
const table: string[] = [];
for (const [lab, type, fl, want] of CATS) {
  HL = Math.max(1, (ZONE_MOBS as any)[type].lvl || 1); // герой — уровня моба («сильные враги» d_kill_a)
  // соло
  { const { svc, add } = world(); const A = add("A", 500, 500); const s0 = snap(A, type); svc.onMobKilled(mob(type, fl)); const d = diff(s0, snap(A, type));
    ok(d.best === 1, `${lab}: Бестиарий +1 (соло)`, d);
    const miss = want.filter((id) => !(d[id] >= 1)); ok(!miss.length, `${lab}: все ожидаемые задания доски (соло)`, { miss, d });
    if (type === "moon_sentinel") ok(d.l4 === 1, `${lab}: сюжет «Безветрие» (l4_boss) засчитан`, d);
    else ok(!d.l4, `${lab}: сюжет «Безветрие» не тронут`, d);
    table.push(`${lab} | соло: ${Object.keys(d).join(",")}`);
  }
  // отряд: B рядом без урона, C павший рядом, D далеко, E в забеге
  { const { svc, add } = world(); const A = add("A", 500, 500), B = add("B", 700, 500), C = add("C", 600, 600, { dead: true }), D = add("D", 9000, 9000), E = add("E", 520, 520, { run: "r1" });
    const P: any = svc.party; for (const x of ["B", "C", "D"]) { P.invite("A", x); P.accept(x, "A"); }
    ok(!!P.get("A") && P.get("A").members.length === 4 && P.get("B") === P.get("A"), `${lab}: отряд собран для теста`, P.get("A")?.members);
    const ss = [A, B, C, D, E].map((a) => snap(a, type)); svc.onMobKilled(mob(type, fl)); const ds = [A, B, C, D, E].map((a, i) => diff(ss[i], snap(a, type)));
    const big = !!((ZONE_MOBS as any)[type].boss || (ZONE_MOBS as any)[type].rare);
    ok(ds[0].best === 1 && ds[0].ach_party_k === 1, `${lab}: убийца в отряде — Бестиарий и «в отряде»`, ds[0]);
    ok(ds[1].best === 1 && want.every((id) => ds[1][id] >= 1), `${lab}: член отряда рядом без урона — засчитано`, ds[1]);
    ok(big ? ds[2].best === 1 && want.every((id) => ds[2][id] >= 1) : !ds[2].best, big ? `${lab}: павший член отряда рядом — засчитано (босс/редкий)` : `${lab}: павший рядом — не засчитано (обычные мобы, как раньше)`, ds[2]);
    ok(!Object.keys(ds[3]).length, `${lab}: член отряда далеко — не засчитано`, ds[3]);
    { const w2 = world(); const A2 = w2.add("A", 500, 500), E2 = w2.add("E", 520, 520, { run: "r1" }); w2.svc.party.invite("A", "E"); w2.svc.party.accept("E", "A");
      const e0 = snap(E2, type); w2.svc.onMobKilled(mob(type, fl)); ds[4] = diff(e0, snap(E2, type)); void A2;
      ok(!Object.keys(ds[4]).length, `${lab}: член отряда в забеге — не засчитано`, ds[4]); }
    if (type === "moon_sentinel") ok(ds[1].l4 === 1 && ds[2].l4 === 1, "Безветрие: сюжет засчитан отряду рядом, в том числе павшему", ds);
    table.push(`${lab} | отряд: рядом=${ds[1].best ? "да" : "нет"} павший=${ds[2].best ? "да" : "нет"} далеко=${ds[3].best ? "да" : "нет"} забег=${ds[4].best ? "да" : "нет"}`);
  }
}
// убийца, павший до смерти босса (добил яд/союзник) и уже в городе — всё равно засчитано
{ const { svc, add } = world(); const A = add("A", 500, 500, { dead: true, world: "hellfire" }); const s0 = snap(A, "moon_sentinel"); svc.onMobKilled(mob("moon_sentinel", { special: "boss" })); const d = diff(s0, snap(A, "moon_sentinel"));
  ok(d.l4 === 1 && d.best === 1, "Безветрие: убийца, павший и ушедший в город до смерти босса, — засчитано", d); }
// забег «Бездна» больше не засчитывает цель kill_boss (только Бестиарий/добыча)
{ ok(RUN_BOSS_BY_ROOM.abyss === "moon_sentinel", "Бездна: босс забега — Безветрие (для Бестиария/добычи)");
  const src = await Bun.file(new URL("./service.ts", import.meta.url)).text(); const i = src.indexOf("const boss = RUN_BOSS_BY_ROOM[run.room]"); const seg = src.slice(i, i + 600);
  ok(i > 0 && !/qev\([^)]*kill_boss/.test(seg), "Бездна: kill_boss из забега убран (цель — только убийство в открытом мире)");
  ok(!/Бездны/.test(QUEST_BY_ID.l4_boss.objectives[0].text), "текст l4_boss без «или конец «Бездны»»"); }
// редкие/боссы по уровню героя (п. 1): окно целей и награды растут с уровнем
{ const lo = makeRoll(BTASKS.w_rare, 4, "s1", "k", ["warrior"], "C") as any, hi = makeRoll(BTASKS.w_rare, 24, "s1", "k", ["warrior"], "C") as any;
  ok(lo.maxL && hi.maxL && lo.maxL < hi.maxL && lo.L < hi.L, "w_rare: окно целей у низкого уровня ниже, чем у высокого", [lo.minL, lo.maxL, hi.minL, hi.maxL]);
  ok(fitReward(hi.L).rm > fitReward(lo.L).rm && fitReward(hi.L).tu >= fitReward(lo.L).tu, "награды (ресурсы, ярус сундука) растут с уровнем цели");
  const W = fitWindow("rare", 4)!; ok(W && W.lo >= 1 && W.Lc === 5, "окно редких для 4 ур.: ближайший — Королевская роса (5)", W);
  const old = BOARD_CFG.fit.on; BOARD_CFG.fit.on = false; ok(!(makeRoll(BTASKS.w_rare, 24, "s1", "k", ["warrior"], "C") as any).maxL, "fit.on=false — как раньше"); BOARD_CFG.fit.on = old; }
// сдача: ярус выданного сундука — с прибавкой по уровню цели (как в карточке)
{ const a: any = newAccount(), h: any = newHero("warrior"); a.hero = "warrior"; h.lvl = 25; const ctx = { pkey: "uid:fit" }; boardRefresh(a, h, ctx);
  const b = boardOf(a), R = makeRoll(BTASKS.d_rare, 25, "s1", "k", ["warrior"], "C") as any; b.sel.daily = ["d_rare"]; b.roll.d_rare = R; b.p.d_rare = 99;
  const r = boardClaim(a, h, "d_rare", ctx), want = bumpTier(tierOfRank("C"), fitReward(R.L).tu);
  ok(r.ok && r.chest && r.chest.tier === want && fitReward(R.L).tu > 0, `сдача d_rare на 25 ур.: сундук «${r.chest?.name}» (ярус ${r.chest?.tier}, ожидался ${want})`, r.err || r.chest); }
console.log("\nТАБЛИЦА\n" + table.join("\n"));
console.log(f ? `\n${f} FAIL` : "\nвсё PASS"); process.exit(f ? 1 : 0);
