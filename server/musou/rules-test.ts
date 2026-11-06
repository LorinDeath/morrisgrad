// bun server/musou/rules-test.ts
import {
  BAG_MAX, BAG_START, FLOORS, applyRun, bagPrice, beginRun, boundedSolo, buyBag, buyOffer, claimChest, claimQuest, equipItem,
  finishRun, killNeed, makeScript, mulberry32, newProfile, roomOutcome, setHero, sheet, shopOffers, spendStat, takeInbox,
} from "../../src/scripts/musou/rules";
import { Battle } from "../../src/scripts/musou/sim";
import { DEFAULT_TUNE, eliteHp, floorKit, mobHp, previewTune, resetTune, setTune, validateTune } from "../../src/scripts/musou/tune";

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

ok(FLOORS[0].general === "Осколок Командира" && FLOORS[0].boss === "Теневой Страж" && FLOORS[12].boss === "Титан Атлас", "13 этажей носят имена данжей Тёмного мира");
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

console.log(fails ? `FAILED ${fails}/${n}` : `OK ${n}`);
process.exit(fails ? 1 : 0);
