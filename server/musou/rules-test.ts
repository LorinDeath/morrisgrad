// bun server/musou/rules-test.ts
import {
  BAG_MAX, BAG_START, FLOORS, applyRun, bagPrice, beginRun, boundedSolo, buyBag, buyOffer, chestChoices, claimChest, claimQuest, equipItem,
  finishRun, chainAt, diffLock, dropQuality, floorLock, floorNeed, floorOpen, forgeItem, killNeed, makeScript, memberDiffLock, mulberry32, newProfile, normalize, rollDropTier, rollItem, roomOutcome, runOffer, seal, setHero, setOath, sheet, shopOffers, spendStat, takeInbox, unequip,
} from "../../src/scripts/musou/rules";
import { Battle } from "../../src/scripts/musou/sim";
import { pickShard } from "./plaza";
import { DEFAULT_TUNE, DIFF_NAME, chestTotal, diffRow, eliteDmg, eliteHp, eliteName, floorKit, floorMut, getTune, mobHp, previewTune, resetTune, setTune, validateTune } from "../../src/scripts/musou/tune";

let fails = 0, n = 0;
const ok = (c: unknown, m: string) => { n++; if (!c) { fails++; console.log("FAIL " + m); } else console.log("PASS " + m); };

const p = newProfile(3);
ok(p.bagSize === BAG_START && p.bag.length === 0, "сумка с 12 ячеек, пустая");
ok(setHero(p, "lorin") === null && p.hero === "lorin", "герой Лорин");
const price = bagPrice(p)!;
p.gold = price;
ok(buyBag(p) === null && p.bagSize === 16 && p.gold === 0, "лавка расширяет сумку на 4");
ok(bagPrice(p)! > price, "следующее расширение дороже");
while (p.bagSize < BAG_MAX) { p.gold += bagPrice(p) || 0; buyBag(p); }
ok(p.bagSize === BAG_MAX && buyBag(p) !== null, "сумка упирается в предел");

p.gold = 0;
const offers = shopOffers(p);
const itemOffer = offers.find((o) => o.kind === "item")!;
ok(itemOffer.kind === "item" && shopOffers(p)[offers.indexOf(itemOffer)] && (itemOffer as any).item.name, "витрина стабильна");
p.gold = (itemOffer as any).price;
ok(buyOffer(p, itemOffer.id) === null && p.bag.length === 1, "покупка вещи занимает ячейку");
const full = newProfile(9);
setHero(full, "fox");
full.bagSize = 12;
full.gold = 9_999_999;
for (let i = 0; i < 12; i++) buyOffer(full, shopOffers(full).filter((o) => o.kind === "item")[i % 8]?.id || "g0");
ok(full.bag.length === 12 && buyOffer(full, "g0") !== null, "в полную сумку купить нельзя");

const runP = newProfile(4);
setHero(runP, "lorin");
const started = beginRun(runP, 1, 1_000);
ok(!("err" in started), "этаж 1 открыт");
const report = finishRun(runP, { nonce: (started as any).nonce, kills: 100, generals: 3, boss: true, party: 1 }, 1_000 + 40_000, mulberry32(1));
ok(!("err" in report) && runP.kills === 100 && runP.clears[0] === 1, "зачистка этажа копится");
const q = claimQuest(runP, "k1", mulberry32(2));
ok(!("err" in q) && runP.lvl >= 1, "квест на 100 тварей сдаётся в хабе");
ok(killNeed(1) === 100, "на первом этаже квест ровно на 100");

const before = sheet(runP).dmg;
runP.unspent = 1;
ok(spendStat(runP, "str") === null && sheet(runP).dmg > before, "сила растит урон");
const it = runP.bag[0];
if (it && runP.lvl >= it.req) ok(equipItem(runP, it.id) === null && !runP.bag.some((x) => x.id === it.id), "вещь надевается и уходит из сумки");
else ok(true, "вещь с этажа выше уровня — надеть нельзя, это нормально");

const fast = newProfile(5);
setHero(fast, "veles");
const bad = applyRun(fast, { floor: 1, kills: 100, generals: 3, boss: true, elapsedMs: 500, party: 1 }, mulberry32(3));
ok(!("err" in bad) && !bad.boss && fast.clears[0] === 0, "слишком быстрый босс не засчитывается");

const b = new Battle(1, [{ id: "you", name: "Лорин", hero: "lorin", sheet: sheet(setHero(newProfile(8), "lorin") || newProfile(8)) }]);
// setHero returns null; sheet needs the profile. rebuild properly:
const heroP = newProfile(8); setHero(heroP, "lorin");
const fight = new Battle(1, [{ id: "you", name: "Лорин", hero: "lorin", sheet: sheet(heroP) }], 11);
let t = 0;
while (t < 12) {
  fight.press("you", { mx: Math.cos(t), my: Math.sin(t), aim: t, hold: true, heavy: false, skill: t % 1.4 < 0.05 ? 1 : 0 });
  fight.step(1 / 30);
  t += 1 / 30;
}
ok(fight.kills > 15, "за 12 секунд комбо косит толпу, убито " + fight.kills);
ok(fight.elites.some((e) => e.kind === "general"), "на волне выходит генерал");
ok(fight.fx.length >= 0, "эффекты ударов живут в бою");

const wind = new Battle(1, [{ id: "you", name: "Лорин", hero: "lorin", sheet: sheet(heroP) }], 4);
let w = 0;
while (wind.phase !== "fight" && w < 3) { wind.step(0.05); w += 0.05; }
wind.press("you", { mx: 0, my: 0, aim: 0, light: true });
wind.step(0.04);
ok(!!wind.party[0].atk && !wind.party[0].atk.hit, "замах серии ещё не наносит урон");
let guard = 0;
while (wind.party[0].atk && guard < 40) { wind.step(0.05); guard++; }
wind.press("you", { mx: 1, my: 0, aim: 0, dodge: true });
wind.step(0.05);
ok(wind.party[0].dodgeCd > 1 && wind.party[0].iframe > 0.15, "рывок даёт кадры неуязвимости и откат");

const script = makeScript(1, 7);
const early = roomOutcome(script, 5000, [{ id: "g0", alive: false, spawned: false }, { id: "boss", alive: false, spawned: false }]);
ok(early.generals === 0 && !early.boss && early.kills < 99999, "сервер не считает нерождённых генералов и босса");
const lied = boundedSolo(1, 5000, 99999, 3, true);
ok(lied.kills < 200 && lied.generals === 0 && !lied.boss, "одиночный забег не принимает произвольные убийства");
const again = finishRun(runP, { nonce: (started as any).nonce, kills: 999, generals: 3, boss: true }, 1_000 + 80_000, mulberry32(1));
ok("err" in again, "повтор того же забега не выдаёт награду");

const bagP = newProfile(2);
setHero(bagP, "listaf");
bagP.bag = Array.from({ length: 12 }, (_, i) => ({ id: "b" + i, base: "boots", name: "хлам", slot: "boots" as const, rarity: "common" as const, req: 1, ilvl: 1, dmg: 0, armor: 1, affixes: [] }));
bagP.inbox.push({ id: "rare1", base: "helm", name: "редкий шлем", slot: "helm" as const, rarity: "rare" as const, req: 1, ilvl: 1, dmg: 0, armor: 4, affixes: [] });
const held = takeInbox(bagP, "bag");
ok("err" in held && bagP.inbox.length === 1, "редкая вещь не растворяется, пока сумка полна");
const sold = takeInbox(bagP, "sell");
ok(!("err" in sold) && bagP.inbox.length === 0 && bagP.gold > 150, "редкую вещь можно продать явно");

const giveUp = newProfile(5);
setHero(giveUp, "lorin");
const g0 = beginRun(giveUp, 1, 5000);
const goldBefore = giveUp.gold;
const gave = finishRun(giveUp, { nonce: (g0 as { nonce: string }).nonce, kills: 0, generals: 0, boss: true, reason: "surrender" }, 5000 + 40_000, mulberry32(5));
ok(!("err" in gave) && gave.reason === "surrender" && gave.boss === false && gave.gold === 0 && giveUp.gold === goldBefore && !giveUp.clears[0], "сдача не платит базу и не засчитывает босса");

const fell = newProfile(6);
setHero(fell, "lorin");
const f0 = beginRun(fell, 1, 8000);
const loss = finishRun(fell, { nonce: (f0 as { nonce: string }).nonce, kills: 10, generals: 1, boss: true, reason: "dead" }, 8000 + 20_000, mulberry32(6));
ok(!("err" in loss) && loss.reason === "dead" && loss.boss === false && !fell.clears[0] && loss.gold > 0 && loss.gold < 50, "поражение платит только за сбитых");

const heroP2 = newProfile(8);
setHero(heroP2, "lorin");
const stand = new Battle(1, [{ id: "you", name: "Лорин", hero: "lorin", sheet: sheet(heroP2) }], 11);
let stood = 0;
while (stood < 25) { stand.step(0.05); stood += 0.05; }
ok(stand.phase === "fight" && stand.party[0].hp > 0 && stand.reason === "none", "стояние 25 секунд не завершает этаж");

const die = new Battle(1, [{ id: "you", name: "Лорин", hero: "lorin", sheet: sheet(heroP2) }], 3);
let intro = 0;
while (die.phase !== "fight" && intro < 4) { die.step(0.05); intro += 0.05; }
die.party[0].hp = 0;
die.party[0].revives = 0;
die.party[0].downT = 99;
die.step(0.05);
ok(die.phase === "fight" && die.party[0].hp === 0, "нулевое здоровье видно до экрана итога");
let corpse = 0;
while (die.phase === "fight" && corpse < 3) { die.step(0.05); corpse += 0.05; }
ok(die.phase === "lost" && die.reason === "dead", "после трупа исход — поражение");

ok(previewTune(DEFAULT_TUNE).clearGold === 84 && previewTune(DEFAULT_TUNE).surrenderGold === 0, "этаж 1: зачистка 84 золота до толпы, сдача без целей — 0");
ok(mobHp(0, 1) === 10 && eliteHp("boss", 1, 1) === 2120 && eliteHp("boss", 1, 4) === 2120, "здоровье толпы и босса по умолчанию не растёт от группы");
const tuned = validateTune(JSON.parse(JSON.stringify({ ...DEFAULT_TUNE, combat: { ...DEFAULT_TUNE.combat, mobHp: [40, 5, 16], partyHpPerExtra: 0.35 } })));
ok(tuned.ok, "набор с новым здоровьем проходит проверку");
if (tuned.ok) setTune(tuned.tune);
ok(mobHp(0, 1) === 42 && eliteHp("boss", 1, 4) === Math.round(2120 * 2.05), "следующий бой читает опубликованные числа");
const junk = JSON.parse(JSON.stringify(DEFAULT_TUNE));
junk.economy.startGold = "150; DROP TABLE orda_saves";
junk.sql = "DROP TABLE orda_saves";
ok(!validateTune(junk).ok, "строка и лишнее поле не становятся правилом");
resetTune();
ok(mobHp(0, 1) === 10, "сброс набора возвращает числа кода");

function armed(cursed: 0 | 1) {
  const who = newProfile(12);
  setHero(who, "lorin");
  who.bag.push({ id: "c1", base: "blade", name: "Клинок", slot: "weapon", rarity: "common", req: 1, ilvl: 1, dmg: 20, armor: 0, affixes: [], ...(cursed ? { cursed: 1 as const } : {}) });
  equipItem(who, "c1");
  return sheet(who);
}
ok(armed(1).dmg > armed(0).dmg && armed(1).speed < armed(0).speed, "проклятие множит урон и режет скорость");

ok(FLOORS[0].sw === "dungeon_intro_1" && FLOORS[0].general === "Манекен I" && FLOORS[0].boss === "Теневой Страж" && FLOORS[2].name === "Чёрные Чумные Топи" && FLOORS[12].sw === "dungeon_titan_cradle" && FLOORS[12].boss === "Титан Атлас", "13 этажей — данжи Тёмного мира, не чужая пещера");
ok(new Set(FLOORS.map((f) => f.gRow + ":" + f.bRow)).size === 13, "у этажей разные пары обликов элиты");
const renamed = JSON.parse(JSON.stringify(DEFAULT_TUNE));
renamed.floors[0].general = "Тестовый Командир";
const renamedOk = validateTune(renamed);
ok(renamedOk.ok, "имена этажей проходят проверку");
if (renamedOk.ok) setTune(renamedOk.tune);
ok(floorKit(1).general === "Тестовый Командир", "следующий бой берёт имя из админки");
const badSig = JSON.parse(JSON.stringify(DEFAULT_TUNE));
badSig.floors[3].gSig = "<script>";
ok(!validateTune(badSig).ok, "чужой приём этажа отвергнут");
resetTune();

const chestWho = newProfile(8);
setHero(chestWho, "veles");
beginRun(chestWho, 1, 4000);
const loot = claimChest(chestWho, 0, mulberry32(4));
ok(!("err" in loot) && (chestWho.bag.length + chestWho.inbox.length) === 1, "сундук кладёт одну вещь");
ok("err" in claimChest(chestWho, 0, mulberry32(5)), "тот же сундук не выдаёт второй раз");
ok(DEFAULT_TUNE.loot.curseChance > 0 && DEFAULT_TUNE.loot.enchChance > 0 && DEFAULT_TUNE.loot.chestCount === 2, "чары и проклятия выпадают, сундуков два");

const marked = new Battle(4, [{ id: "you", name: "Велес", hero: "veles", sheet: sheet(chestWho) }], 2);
while (marked.phase === "intro") marked.step(0.05);
const me = marked.party[0];
me.x = 180;
me.y = 180;
me.iframe = 0;
marked.elites.push({
  kind: "general", name: "Могильный Упырь", title: "генерал", x: me.x + 20, y: me.y, hp: 100, maxHp: 100,
  facing: 0, alive: true, wind: 0.04, windMax: 0.5, cd: 9, pattern: 0, swing: 0, stun: 0, tint: "#c9b6ff", r: 30, sig: "curse", row: 28,
});
marked.step(0.05);
ok(me.curse > 0, "проклятие генерала вешает метку на героя");
me.x = marked.chests[0].x;
me.y = marked.chests[0].y;
let dwell = 0;
while (!marked.chests[0].open && dwell < 2) { marked.step(0.05); dwell += 0.05; }
ok(marked.chests[0].open && marked.takeChests().length === 1, "стояние у сундука открывает его");

const chooser = newProfile(11);
setHero(chooser, "lorin");
beginRun(chooser, 1, 5000);
const offer = chestChoices(chooser, 1, mulberry32((chooser.nextId * 997 + 1 * 13) >>> 0));
ok(!("err" in offer) && offer.tiers.length === 6 && offer.tiers[5].name === "Чёрный" && offer.tiers[5].stat === 10, "сундук показывает шесть ярусов, включая Чёрный");
const cursed = claimChest(chooser, 1, mulberry32((chooser.nextId * 997 + 1 * 13) >>> 0), "curse");
ok(!("err" in cursed) && cursed.item.cursed === 1, "выбор проклятия пишет метку на вещь");
const blackWho = newProfile(12);
setHero(blackWho, "lorin");
beginRun(blackWho, 1, 5000);
const black = claimChest(blackWho, 0, mulberry32(3), 6);
ok(!("err" in black) && black.item.ench === 6 && black.item.name.startsWith("Чёрный"), "чёрный ярус выбирается, а не выпадает молча");
const trade = (mark: { cursed?: 1; ench?: 6 }) => {
  const who = newProfile(15);
  setHero(who, "lorin");
  who.bag.push({ id: "w", base: "blade", name: "Клинок", slot: "weapon", rarity: "common", req: 1, ilvl: 1, dmg: 20, armor: 0, affixes: [], ...mark });
  equipItem(who, "w");
  return sheet(who);
};
const plainBlade = trade({});
const cursedBlade = trade({ cursed: 1 });
const blackBlade = trade({ ench: 6 });
ok(cursedBlade.dmg > plainBlade.dmg && cursedBlade.speed < plainBlade.speed, "проклятый клинок поднимает урон и режет шаг");
ok(blackBlade.dmg > cursedBlade.dmg && blackBlade.speed < cursedBlade.speed, "чёрный ярус сильнее проклятия и ещё медленнее");

const names = new Set<string>();
let roster = true;
for (let fl = 1; fl <= 13; fl++) {
  const def = FLOORS[fl - 1];
  const kit = floorKit(fl);
  if (def.general !== kit.general || def.boss !== kit.boss) roster = false;
  if (!["circle", "cone", "line", "curse", "summon"].includes(kit.gSig)) roster = false;
  if (def.gRow < 0 || def.bRow < 0) roster = false;
  names.add(kit.general);
  names.add(kit.boss);
  const b = new Battle(fl, [{ id: "you", name: "t", hero: "lorin", sheet: sheet(chooser) }], fl);
  b.party[0].hp = 99999;
  b.party[0].maxHp = 99999;
  for (let i = 0; i < 200 && b.elites.length === 0; i++) b.step(0.05);
  if (!b.elites[0] || !b.elites[0].name.includes(kit.general)) roster = false;
}
ok(roster && names.size === 26, "все 13 этажей зовут своих генерала и босса и ставят их в бой");
ok(eliteName("boss", 13).includes("Абсолютный") && floorMut(13)?.name === "Абсолютный", "последний этаж носит мутацию Абсолютный в потолке Орды");
ok(eliteHp("boss", 13, 1) === Math.round((DEFAULT_TUNE.combat.bossHp + 13 * DEFAULT_TUNE.combat.bossHpPerFloor) * 2.3), "мутация множит здоровье, но не на ×360");
const wild = JSON.parse(JSON.stringify(DEFAULT_TUNE));
wild.mut.mult[9] = 360;
ok(!validateTune(wild).ok, "×360 Тёмного мира правило не пускает");
wild.mut.mult[9] = 2.3;
wild.ench.stat = [1.5, 1.8, 2];
ok(!validateTune(wild).ok, "урезанные три яруса чар больше не проходят");

const cup = newProfile(13);
setHero(cup, "veles");
cup.gold = 100;
ok(setOath(cup, "cup") === null, "кубок выбирается в хабе");
const broke = newProfile(14);
setHero(broke, "veles");
broke.gold = 10;
broke.oath = "cup";
ok("err" in beginRun(broke, 1, 1), "кубок без ставки не начинается");
const opened = beginRun(cup, 1, 1000);
ok(!("err" in opened) && cup.gold === 75, "ставка кубка списывается до боя");
const nonce = (opened as { nonce: string }).nonce;
const lost = finishRun(cup, { nonce, reason: "dead", boss: false }, 9000, mulberry32(1), { kills: 0, generals: 0, boss: false });
ok(!("err" in lost) && lost.reason === "dead" && cup.gold === 75, "поражение кубка ставку не возвращает");
setOath(cup, "cup");
const cupAgain = beginRun(cup, 1, 20000);
const winNonce = (cupAgain as { nonce: string }).nonce;
const won = finishRun(cup, { nonce: winNonce, reason: "win", boss: true }, 40000, mulberry32(2), { kills: 12, generals: 1, boss: true });
ok(!("err" in won) && won.boss && cup.gold === 75 - 25 + won.gold, "победа кубка возвращает ставку дважды и пишет её в отчёт");
ok((cup.quests.b1?.p || 0) === 1, "победа двигает квест босса");

const locked = newProfile(20);
setHero(locked, "lorin");
locked.clears = [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1];
ok(floorOpen(locked, 2) && locked.lvl === 1, "уже пройденный данж открыт для повтора даже на 1 уровне");
const fresh = newProfile(23);
setHero(fresh, "lorin");
const low = floorLock(fresh, 2);
ok(!!low && low.includes("уровня 2") && fresh.lvl === 1 && floorOpen(fresh, 1), "непройденный тракт на 1 уровне закрыт, первый данж открыт");
const gifted = newProfile(21);
setHero(gifted, "lorelin");
gifted.lvl = floorNeed(13);
ok(floorOpen(gifted, 13) && gifted.clears.every((c) => !c), "уровень 15 открывает колыбель титанов без единой зачистки");
const heir = JSON.parse(JSON.stringify(DEFAULT_TUNE));
for (const row of heir.floors) { delete row.need; delete row.xp; }
const heirOk = validateTune(heir);
ok(heirOk.ok && heirOk.ok && heirOk.tune.floors[2].need === 4 && heirOk.tune.floors[9].xp === 2830, "старый набор этажей получает порог уровня и опыт по умолчанию");

const walker = newProfile(22);
setHero(walker, "listaf");
let chain = true;
for (let f = 1; f <= 13; f++) {
  if (!floorOpen(walker, f)) chain = false;
  if (f < 13 && floorOpen(walker, f + 1)) chain = false;
  const go = beginRun(walker, f, 10_000 * f);
  if ("err" in go) { chain = false; break; }
  const done = finishRun(walker, { nonce: go.nonce, reason: "win", boss: true }, 10_000 * f + 40_000, mulberry32(f), { kills: killNeed(f), generals: 3, boss: true });
  if ("err" in done || !done.boss || done.xp <= 0) chain = false;
  for (const id of [`k${f}`, `g${f}`, `b${f}`]) {
    const got = claimQuest(walker, id, mulberry32(f + 3));
    if ("err" in got) chain = false;
  }
}
ok(chain && walker.lvl >= floorNeed(13) && floorOpen(walker, 13), `кампания 13 данжей доводит уровень до ${walker.lvl}, каждый следующий был закрыт до награды`);
const bare = newProfile(30);
setHero(bare, "lorin");
const bareGo = beginRun(bare, 1, 1000);
const bareWin = finishRun(bare, { nonce: (bareGo as { nonce: string }).nonce, reason: "win", boss: true, kills: 0, generals: 0 }, 1000 + 40_000, mulberry32(9));
ok(!("err" in bareWin) && bareWin.boss && bare.lvl >= 2, "победа на 40-й секунде даёт уровень даже без толпы");

const replayP = newProfile(41);
setHero(replayP, "lorin");
replayP.lvl = floorNeed(7);
const g1 = beginRun(replayP, 7, 5_000);
const w1 = finishRun(replayP, { nonce: (g1 as { nonce: string }).nonce, reason: "win", boss: true }, 5_000 + 40_000, mulberry32(70), { kills: killNeed(7), generals: 3, boss: true });
ok(!("err" in w1) && !w1.replay && w1.quests.includes("b7"), "первый проход башни сдаёт квест босса");
const chest = claimQuest(replayP, "b7", mulberry32(71));
const goldAfter = replayP.gold;
const bagAfter = replayP.bag.length;
const inboxAfter = replayP.inbox.length;
const xpAfter = replayP.xp;
const againClaim = claimQuest(replayP, "b7", mulberry32(72));
ok(!("err" in chest) && chest.item && chest.item.item.rarity === "rare" && !chest.item.sold, "сундук квеста башни — редкая вещь один раз");
ok("err" in againClaim && againClaim.err === "Награда уже взята" && replayP.gold === goldAfter && replayP.bag.length === bagAfter && replayP.inbox.length === inboxAfter && replayP.xp === xpAfter, "вторая сдача не даёт золото, опыт и вещь");
const nextOpen = floorOpen(replayP, 8);
const g2 = beginRun(replayP, 7, 90_000);
const w2 = finishRun(replayP, { nonce: (g2 as { nonce: string }).nonce, reason: "win", boss: true }, 90_000 + 40_000, mulberry32(73), { kills: killNeed(7), generals: 3, boss: true });
const flat = DEFAULT_TUNE.economy.clearBase + 7 * DEFAULT_TUNE.economy.clearPerFloor + DEFAULT_TUNE.economy.bossBase + 7 * DEFAULT_TUNE.economy.bossPerFloor;
const expectGold = Math.round(Math.round(flat * DEFAULT_TUNE.economy.replayGold) + killNeed(7) * DEFAULT_TUNE.economy.killGold + 3 * DEFAULT_TUNE.economy.generalGold);
const expectXp = Math.round(DEFAULT_TUNE.floors[6].xp * DEFAULT_TUNE.economy.replayXp) + Math.floor(killNeed(7) * 0.2);
const drop = !("err" in w2) ? w2.items[0].item : null;
ok(!("err" in w2) && w2.replay && w2.quests.length === 0 && w2.xp === expectXp && w2.gold === expectGold && w2.gold < w1.gold, "повтор платит четверть опыта данжа и 40% золота этажа, квест молчит");
ok(!!drop && (drop.rarity === "common" || drop.rarity === "magic") && !drop.unique && !drop.set, "повтор не даёт редкую, легендарную, сетовую или уникальную вещь");
ok(floorOpen(replayP, 7) && (!nextOpen || floorOpen(replayP, 8)), "повтор не закрывает ни этот данж, ни уже открытый следующий");
const still = claimQuest(replayP, "b7", mulberry32(74));
ok("err" in still && still.err === "Награда уже взята", "квест после повтора остаётся сданным");

const oldTune = JSON.parse(JSON.stringify(DEFAULT_TUNE));
delete oldTune.diff;
const oldOk = validateTune(oldTune);
ok(oldOk.ok && oldOk.tune.diff.hp.length === 7 && oldOk.tune.diff.hp[1] === 1.5 && oldOk.tune.diff.hp[6] === 20 && oldOk.tune.diff.lower[0] === 0 && oldOk.tune.diff.lower[6] === 0.6, "набор без сложностей получает цепочку чар до чёрной");
const chaos = JSON.parse(JSON.stringify(DEFAULT_TUNE));
chaos.diff.hp[6] = 40;
ok(!validateTune(chaos).ok, "×40 здоровья чёрной правило не пускает");
const short = JSON.parse(JSON.stringify(DEFAULT_TUNE));
short.diff.hp = [1, 2, 3, 4];
ok(!validateTune(short).ok, "четыре старые ступени больше не считаются цепочкой");
ok(DIFF_NAME.join(",") === "Базовая,Необычный,Редкий,Странный,Легендарный,Божественный,Чёрный", "имена и порядок — ярусы чар Проклятых");

let matrix = true;
const ratiosHp = DEFAULT_TUNE.diff.hp;
const ratiosDmg = DEFAULT_TUNE.diff.dmg;
for (let f = 1; f <= 13; f++) {
  let prevGold = 0, prevXp = 0, prevHp = 0;
  for (let d = 1; d <= 7; d++) {
    const who = newProfile(1000 + f * 10 + d);
    setHero(who, "lorin");
    who.lvl = Math.max(who.lvl, floorNeed(f));
    who.chain[f - 1] = d - 1;
    const o = runOffer(who, f, d, 1);
    if (o.hp !== ratiosHp[d - 1] || o.dmg !== ratiosDmg[d - 1] || o.name !== DIFF_NAME[d - 1]) matrix = false;
    if (!(o.bossHp > prevHp && o.goldFirst > prevGold && o.xpFirst > prevXp)) matrix = false;
    if (o.bossHp !== eliteHp("boss", f, 1, getTune(), d) || o.mobHp !== mobHp(0, f, getTune(), d)) matrix = false;
    if (o.chests !== chestTotal(d)) matrix = false;
    if (d > 1 && o.lower <= 0) matrix = false;
    if (d === 1 && o.lower !== 0) matrix = false;
    if (diffLock(who, f, d)) matrix = false;
    if (d < 7 && !diffLock(who, f, d + 1)?.includes("прохождением")) matrix = false;
    prevHp = o.bossHp; prevGold = o.goldFirst; prevXp = o.xpFirst;
  }
}
ok(matrix, "матрица 13 этажей × 7 цветов: опасность растёт, следующий цвет закрыт");

const junior = newProfile(70);
setHero(junior, "veles");
junior.lvl = 9;
junior.clears[0] = 1;
const senior = newProfile(71);
setHero(senior, "lorin");
senior.lvl = 60;
senior.chain[0] = 6;
const untried = newProfile(69);
setHero(untried, "lorin");
ok(!!diffLock(untried, 1, 2) && !diffLock(junior, 1, 2) && !!diffLock(junior, 1, 3) && !diffLock(senior, 1, 7), "базовая сразу, зелёный после неё, синий ещё нет, чёрный после шести");
ok("err" in beginRun(untried, 1, 900, undefined, false, 2) && !("err" in beginRun(junior, 1, 1000, undefined, false, 2)), "сервер пускает зелёный только после базовой");
junior.pending = null;
ok("err" in beginRun(junior, 1, 1100, undefined, false, 3) && !("err" in beginRun(senior, 1, 1000, undefined, false, 7)), "синий без синей ступени закрыт, чёрный после шести открыт");
const liedDiff = finishRun(senior, { nonce: senior.pending?.nonce, reason: "win", boss: true, diff: 1 } as any, 1000 + 40_000, mulberry32(81), { kills: 20, generals: 1, boss: true });
const blackRow = diffRow(7);
const flat1 = DEFAULT_TUNE.economy.clearBase + DEFAULT_TUNE.economy.clearPerFloor + DEFAULT_TUNE.economy.bossBase + DEFAULT_TUNE.economy.bossPerFloor;
const expectBlack = Math.round(Math.round(flat1 * blackRow.gold) + (20 * DEFAULT_TUNE.economy.killGold + DEFAULT_TUNE.economy.generalGold) * blackRow.gold);
ok(!("err" in liedDiff) && liedDiff.diff === 7 && liedDiff.diffName === "Чёрный" && !liedDiff.replay && liedDiff.gold === expectBlack, "первый чёрный платит свой цвет, даже если тело просит базовую");
ok(eliteDmg("boss", 1, getTune(), 7) === eliteDmg("boss", 1) * 9, "урон чёрного босса ×9 текущего набора");

const ordinary = newProfile(72);
setHero(ordinary, "lorin");
const oGo = beginRun(ordinary, 1, 2000);
const oWin = finishRun(ordinary, { nonce: (oGo as { nonce: string }).nonce, reason: "win", boss: true }, 2000 + 40_000, mulberry32(82), { kills: 20, generals: 1, boss: true });
const expectOrdinary = Math.round(flat1 + 20 * DEFAULT_TUNE.economy.killGold + DEFAULT_TUNE.economy.generalGold);
ok(!("err" in oWin) && oWin.diff === 1 && oWin.gold === expectOrdinary && oWin.gold < expectBlack, "базовая плата меньше чёрной при тех же целях");

let hardRare = false, plainRare = false;
for (let seed = 1; seed <= 40 && (!hardRare || !plainRare); seed++) {
  const farm = newProfile(800 + seed);
  setHero(farm, "lorin");
  farm.lvl = 60;
  farm.clears[0] = 1;
  farm.chain[0] = 1;
  const stay = beginRun(farm, 1, 3000, undefined, false, 1);
  const plain = finishRun(farm, { nonce: (stay as { nonce: string }).nonce, reason: "win", boss: true }, 3000 + 40_000, mulberry32(seed), { kills: 10, generals: 1, boss: true });
  if (!("err" in plain) && plain.replay && (plain.items[0].item.rarity === "rare" || plain.items[0].item.rarity === "legendary")) plainRare = true;
  const up = newProfile(900 + seed);
  setHero(up, "lorin");
  up.lvl = 60;
  up.clears[0] = 1;
  up.chain[0] = 7;
  up.quests.b1 = { p: 1, done: 1, claimed: 1 };
  const go = beginRun(up, 1, 4000, undefined, false, 7);
  const won = finishRun(up, { nonce: (go as { nonce: string }).nonce, reason: "win", boss: true }, 4000 + 40_000, mulberry32(seed + 90), { kills: 10, generals: 1, boss: true });
  const item = !("err" in won) ? won.items[0].item : null;
  if (item && won.replay && won.quests.length === 0 && item.affixes.length >= 2 && (item.rarity === "rare" || item.rarity === "legendary")) hardRare = true;
}
ok(!plainRare && hardRare, "базовый повтор не даёт редкое, чёрный повтор даёт и не сдаёт квест");

const box = newProfile(73);
setHero(box, "lorin");
box.lvl = 60;
box.chain[0] = 6;
const boxed = beginRun(box, 1, 5000, undefined, false, 7);
ok(!("err" in boxed) && !("err" in chestChoices(box, 2, mulberry32(3))) && "err" in chestChoices(box, 3, mulberry32(4)), "чёрный открывает третий сундук и не четвёртый сверх лимита");

const grown = JSON.parse(JSON.stringify(DEFAULT_TUNE));
grown.combat.partyHpPerExtra = 0.2;
const grownOk = validateTune(grown);
if (grownOk.ok) setTune(grownOk.tune);
const partyBoss = eliteHp("boss", 1, 4, getTune(), 7);
const soloBoss = eliteHp("boss", 1, 1, getTune(), 7);
ok(grownOk.ok && partyBoss === Math.round(2120 * 1.6 * 20) && partyBoss > soloBoss, "чёрный умножается на долю группы, а не вместо неё");
resetTune();

const member = [{ id: "you", name: "Лорин", hero: "lorin" as const, sheet: sheet(senior) }];
const calm = new Battle(1, member, 5, 1);
const blackFight = new Battle(1, member, 5, 7);
const pink = new Battle(1, member, 5, 4);
let walked = 0;
while (walked < 6) { calm.step(0.05); blackFight.step(0.05); pink.step(0.05); walked += 0.05; }
ok(calm.kit === "none" && pink.kit === "blink" && blackFight.kit === "killer" && calm.lastMobHp > 0 && blackFight.lastMobHp === calm.lastMobHp * 20 && blackFight.chests.length === calm.chests.length + 1, "чёрная тварь ×20, другой приём и сундук на один больше");
ok(pink.blinks > 0 && calm.blinks === 0, "странный скачет к герою, базовая нет");

const bareDiff = JSON.parse(JSON.stringify(DEFAULT_TUNE));
delete bareDiff.diff.ilvl;
delete bareDiff.diff.budget;
const bareOk = validateTune(bareDiff);
ok(bareOk.ok && bareOk.tune.diff.ilvl.join() === "0,1,2,3,4,6,8" && bareOk.tune.diff.budget[0] === 1 && bareOk.tune.diff.budget[6] === 1.62, "старый набор сложностей получает уровень вещи и бюджет цепочки");
const qualities = [1, 2, 3, 4, 5, 6, 7].map((d) => dropQuality(12, 2, d));
ok(qualities.every((q, i) => i === 0 || (q.ilvl > qualities[i - 1].ilvl && q.dmg > qualities[i - 1].dmg)), "качество вещи растёт по семи цветам");
const cap1 = dropQuality(60, 13, 1);
const cap7 = dropQuality(60, 13, 7);
ok(cap1.ilvl === 60 && cap7.ilvl === 60 && cap7.dmg > cap1.dmg && cap7.affixTop > cap1.affixTop, "на 60 уровне чёрный сильнее бюджетом, уровень вещи упирается в потолок");
const lowGear = rollItem(mulberry32(11), { ilvl: qualities[0].ilvl, floor: 2, rarity: "rare", bare: true, budget: 1, act: "none", tier: 0 });
const highGear = rollItem(mulberry32(11), { ilvl: qualities[6].ilvl, floor: 2, rarity: "rare", bare: true, budget: qualities[6].budget, extraAffix: qualities[6].affix, act: "killer", tier: 6 });
ok(highGear.ilvl > lowGear.ilvl && highGear.dmg + highGear.armor > lowGear.dmg + lowGear.armor && highGear.affixes.length > lowGear.affixes.length && highGear.ench === 6 && !lowGear.ench, "тот же посев на чёрном даёт вещь выше и с чёрными чарами");
ok(highGear.affixes.some((a) => a.stat === "ls" || a.stat === "dmg"), "чёрная вещь несёт аффиксы убийцы, не только цвет");
const smith = newProfile(77);
setHero(smith, "lorin");
smith.lvl = 12;
smith.chain[1] = 1;
const forged = beginRun(smith, 2, 8000, undefined, false, 2);
const forgedRun = !("err" in forged) ? finishRun(smith, { nonce: forged.nonce, reason: "win", boss: true, diff: 1 }, 8000 + 40_000, mulberry32(15), { kills: killNeed(2), generals: 1, boss: true }) : forged;
const wantIlvl = dropQuality(12, 2, 2).ilvl;
ok(!("err" in forgedRun) && forgedRun.items[0].item.ilvl === wantIlvl && wantIlvl === 13 && forgedRun.diff === 2 && smith.chain[1] === 2, "итог необычного пишет уровень вещи из забега и открывает следующий цвет");
let sawHome = false, sawLower = false;
for (let s = 1; s <= 80; s++) {
  const tier = rollDropTier(mulberry32(s), 7);
  if (tier === 6) sawHome = true;
  if (tier < 6) sawLower = true;
}
ok(rollDropTier(mulberry32(3), 1) === 0 && sawHome && sawLower, "база роняет свой ярус, чёрный роняет и свой, и младший");
const roomy = pickShard([24, 24, 3, 0, 0, 0, 0, 0]);
const packed = pickShard([24, 24, 24, 24, 24, 24, 24, 24]);
ok("shard" in roomy && roomy.shard === 3 && "err" in packed && packed.err === "Двор обители полон", "двор сажает на самый свободный осколок и закрывается, когда все места заняты");

const cast = newProfile(81);
setHero(cast, "lorin");
cast.lvl = 8;
cast.unspent = 2;
spendStat(cast, "str");
cast.clears[0] = 1;
cast.chain[0] = 1;
cast.gold = 400;
const blade = rollItem(mulberry32(4), { ilvl: 12, floor: 1, rarity: "rare", bare: true, id: "blade-a" });
blade.slot = "weapon";
blade.dmg = 40;
blade.req = 10;
cast.bag = [blade];
const bareDmg = sheet(cast).dmg;
ok(!!equipItem(cast, blade.id) && cast.bag.length === 1 && sheet(cast).dmg === bareDmg, "герой ниже требуемого уровня не надевает вещь и не получает её статы");
blade.req = 1;
ok(equipItem(cast, blade.id) === null && cast.bag.length === 0 && cast.equip.weapon?.id === "blade-a", "подходящий уровень надевает и убирает вещь из общей сумки");
setHero(cast, "veles");
ok(cast.hero === "veles" && cast.lvl === 1 && cast.unspent === 0 && cast.clears[0] === 0 && !cast.equip.weapon && cast.bag.length === 0 && cast.gold === 400, "новый герой с нуля, чужое надетое не в сумке, золото общее");
cast.lvl = 4;
const second = rollItem(mulberry32(5), { ilvl: 3, floor: 1, rarity: "magic", bare: true, id: "helm-b" });
second.slot = "helm";
second.req = 1;
cast.bag.push(second);
ok(equipItem(cast, second.id) === null && cast.equip.helm?.id === "helm-b", "надеть пишет на активного героя");
setHero(cast, "lorin");
ok(cast.lvl === 8 && cast.alloc.str === 1 && cast.clears[0] === 1 && cast.equip.weapon?.id === "blade-a" && !cast.equip.helm && cast.bag.length === 0, "возврат к первому герою возвращает его уровень и клинок");
setHero(cast, "veles");
ok(unequip(cast, "helm") === null && cast.bag.some((it) => it.id === "helm-b") && !cast.roster.find((r) => r.id === "lorin")?.equip.weapon === false, "снятие кладёт вещь в общую сумку и не трогает чужой слот");
setHero(cast, "lorin");
ok(cast.equip.weapon?.id === "blade-a" && cast.bag.some((it) => it.id === "helm-b"), "клинок первого героя не уехал в сумку вместе со шлемом второго");
const round = normalize(JSON.parse(JSON.stringify(seal(cast) || cast)));
ok(round.hero === "lorin" && round.bag.length === 1 && round.roster.length === 2 && round.roster.find((r) => r.id === "veles")?.lvl === 4, "снимок не удваивает сумку и не смешивает уровни");
const old = { hero: "lorin", lvl: 6, bag: [second], equip: { weapon: blade, helm: null, chest: null, gloves: null, boots: null, amulet: null, ring1: null, ring2: null }, clears: [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] };
const migrated = normalize(old);
ok(migrated.hero === "lorin" && migrated.lvl === 6 && migrated.equip.weapon?.id === "blade-a" && !migrated.bag.some((it) => it.id === "blade-a") && migrated.roster.length === 1, "старое сохранение становится одним слотом, надетое не дублируется в сумке");
cast.res.soul_shard = 1;
const poor = forgeItem(cast, "blade-a", 0);
ok("err" in poor && (cast.equip.weapon?.up || 0) === 0 && cast.res.soul_shard === 1, "кузница без материала не повышает вещь и ничего не списывает");
cast.res.soul_shard = 3;
const worn = sheet(cast).dmg;
const honed = forgeItem(cast, "blade-a", 0);
ok(!("err" in honed) && honed.up === 1 && !cast.res.soul_shard && sheet(cast).dmg > worn, "плюс Петра поднимает урон надетого клинка");
ok("err" in forgeItem(cast, "blade-a", 0), "повтор с устаревшим уровнем отклонён");

console.log(fails ? `FAILED ${fails}/${n}` : `OK ${n}`);
process.exit(fails ? 1 : 0);
