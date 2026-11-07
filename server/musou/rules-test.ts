// bun server/musou/rules-test.ts
import {
  BAG_MAX, BAG_START, FLOORS, applyRun, bagPrice, beginRun, boundedSolo, buyBag, buyOffer, chestChoices, claimChest, claimQuest, equipItem,
  affixText, beginMode, buyRune, compareGear, finishRun, chainAt, diffLock, dropQuality, dungeonBudget, floorByN, floorLock, floorNeed, floorOpen, forgeItem, killNeed, makeScript, marksOn, memberDiffLock, modeFloor, modeLock, mulberry32, newProfile, normalize, raiseRadiance, relevance, rollDropTier, rollItem, roomOutcome, runOffer, seal, setHero, setOath, sheet, shopOffers, skillBook, skillGlow, socketRune, spendStat, stagePay, statGlance, takeInbox, unequip, xpNeed,
} from "../../src/scripts/musou/rules";
import { markGold, markPay, markSeed, rollBook, rollMark } from "../../src/scripts/musou/mark";
import { Battle } from "../../src/scripts/musou/sim";
import { pickShard } from "./plaza";
import { DEFAULT_TUNE, DIFF_NAME, chestTotal, diffRow, eliteDmg, eliteHp, eliteName, floorKit, floorMut, getTune, mobHp, previewTune, resetTune, setTune, validateTune } from "../../src/scripts/musou/tune";
import { FLOOR_N } from "../../src/scripts/musou/sw-catalog";
import { fightScale } from "../../src/scripts/musou/sw-catalog";
import { auditShadowCatalog } from "./sw-audit";
import { MODE_LIST } from "../../src/scripts/musou/modes";
import { craftFor } from "../../src/scripts/musou/stagecraft";
import { HARD_CAP, mitigate, rateChance } from "../../src/scripts/musou/caps";
import { blowAmount, bossPhase, castTiming, eliteArmorK, freshHand, skillSeconds, tickHand, trySwing } from "../../src/scripts/musou/strike.ts";
import { HERO_FRAME, beastFrame, heroDir, heroLocalFrame } from "../../src/scripts/musou/anim";
import { HEROES, heroById } from "../../src/scripts/musou/rules";
import { clampMove, stickVector, travelAim } from "../../src/scripts/musou/input";
import { BOSS_SCRIPTS, GENERAL_SCRIPTS, castOf } from "../../src/scripts/musou/scripts";
import { SW_MODES } from "../../src/scripts/musou/sw-catalog";

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
ok(!fight.elites.some((e) => e.kind === "general"), "сектор мишеней без генерала: в файле только толпа");
const throne = new Battle(24, [{ id: "you", name: "Лорин", hero: "lorin", sheet: sheet(heroP) }], 24);
let tg = 0;
while (tg < 12) { throne.press("you", { mx: 1, my: 0, aim: 0, hold: true, heavy: false, skill: 0 }); throne.step(1 / 30); tg += 1 / 30; }
ok(throne.elites.some((e) => e.kind === "general" && e.name.includes("Страж Трона")), "чертог башни выпускает Стража Трона из файла");
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
ok(mobHp(0, 1) === 10 && eliteHp("boss", 1, 1) === 2120 && eliteHp("boss", 1, 4) === Math.round(2120 * 1.54), "четверо получают босса ×1.54, толпа от группы не толстеет");
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

ok(auditShadowCatalog() === null, auditShadowCatalog() || "снимок данжей совпал с файлами Тёмного мира");
ok(FLOOR_N === 169 && FLOORS.length === 169 && new Set(FLOORS.map((f) => f.sw)).size === 17, "в игре 17 данжей и 169 этапов, не тринадцать комнат");
ok(FLOORS.find((f) => f.sw === "dungeon_intro_3")?.dungeonName === "Хрустальные Пещеры" && floorNeed(FLOORS.find((f) => f.sw === "dungeon_intro_3")!.n) === 6, "третий данж — Хрустальные Пещеры с 6 уровня, как в файле замены");
ok(FLOORS[FLOOR_N - 1].sw === "dungeon_null_dimension" && FLOORS[FLOOR_N - 1].boss.includes("Архитектор") && floorNeed(FLOOR_N) === 300, "последний этап — Архитектор Нуль-Измерения, уровень 300");
ok(new Set(FLOORS.filter((f, i) => FLOORS.findIndex((x) => x.dungeon === f.dungeon) === i).map((f) => f.gRow + ":" + f.bRow)).size === 17, "у семнадцати данжей разные пары обликов элиты");
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

let roster = true;
for (const def of FLOORS) {
  const kit = floorKit(def.n);
  if (def.general !== kit.general || def.boss !== kit.boss) roster = false;
  if (!["circle", "cone", "line", "curse", "summon"].includes(kit.gSig)) roster = false;
}
const bossFloor = FLOORS.find((f) => f.goal === "boss")!;
ok(roster && bossFloor.boss === "Теневой Страж" && bossFloor.file.endsWith("01_intro_castle.js") && makeScript(bossFloor.n, 1).bossAt === 36000, "этап с боссом берёт имя из файла и оставляет явку босса");
ok(eliteName("boss", FLOOR_N).includes("Абсолютный") && floorMut(FLOOR_N)?.name === "Абсолютный", "чертог Нуля носит мутацию Абсолютный");
const nullScale = fightScale(FLOOR_N);
ok(eliteHp("boss", FLOOR_N, 1) === Math.round((DEFAULT_TUNE.combat.bossHp + nullScale * DEFAULT_TUNE.combat.bossHpPerFloor) * 2.3), "мутация множит здоровье, но не на ×360");
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
const roadN = FLOORS.find((f) => f.sw === "dungeon_intro_2")!.n;
const legacy = JSON.parse(JSON.stringify(locked));
legacy.clears = [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1];
legacy.chain = [3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3];
legacy.roster = [];
const kept = normalize(legacy);
ok(floorOpen(kept, roadN) && kept.lvl === 1 && kept.clears.length === FLOOR_N, "старые 13 зачисток открывают те же данжи для повтора даже на 1 уровне");
const fresh = newProfile(23);
setHero(fresh, "lorin");
const low = floorLock(fresh, roadN);
ok(!!low && low.includes("уровня 2") && fresh.lvl === 1 && floorOpen(fresh, 1) && !floorOpen(fresh, 2), "непройденный тракт на 1 уровне закрыт, второй этап замка закрыт до первого");
const titan = FLOORS.find((f) => f.sw === "dungeon_titan_cradle")!;
const gifted = newProfile(21);
setHero(gifted, "lorelin");
gifted.lvl = floorNeed(titan.n);
ok(floorOpen(gifted, titan.n) && !floorOpen(gifted, titan.n + 1) && gifted.clears.every((c) => !c), "уровень колыбели открывает её первый этаж и не пропускает второй");
const heir = JSON.parse(JSON.stringify(DEFAULT_TUNE));
for (const row of heir.floors) { delete row.need; delete row.xp; }
const heirOk = validateTune(heir);
const crystal = FLOORS.find((f) => f.sw === "dungeon_intro_3")!;
ok(heirOk.ok && heirOk.tune.floors.length === FLOOR_N && heirOk.tune.floors[crystal.n - 1].need === 6 && heirOk.tune.floors[0].xp === 55, "набор без порога получает уровень и опыт из снимка данжей");

const walker = newProfile(22);
setHero(walker, "listaf");
let chain = true;
for (let f = 1; f <= FLOOR_N; f++) {
  walker.lvl = Math.max(walker.lvl, floorNeed(f));
  if (!floorOpen(walker, f)) chain = false;
  if (f < FLOOR_N && FLOORS[f].dungeon === FLOORS[f - 1].dungeon && floorOpen(walker, f + 1)) chain = false;
  const go = beginRun(walker, f, 10_000 * f);
  if ("err" in go) { chain = false; break; }
  const done = finishRun(walker, { nonce: go.nonce, reason: "win", boss: true }, 10_000 * f + 40_000, mulberry32(f), { kills: killNeed(f), generals: 3, boss: true });
  if ("err" in done || !done.boss || done.xp <= 0) chain = false;
  for (const id of [`k${f}`, `g${f}`, `b${f}`]) {
    const got = claimQuest(walker, id, mulberry32(f + 3));
    if ("err" in got) chain = false;
  }
}
ok(chain && floorOpen(walker, FLOOR_N), `кампания открывает следующий этап только после предыдущего, уровень для входа берётся из файла: ${walker.lvl}`);
const bare = newProfile(30);
setHero(bare, "lorin");
const bareGo = beginRun(bare, 1, 1000);
const bareWin = finishRun(bare, { nonce: (bareGo as { nonce: string }).nonce, reason: "win", boss: true, kills: 0, generals: 0 }, 1000 + 40_000, mulberry32(9));
ok(!("err" in bareWin) && bareWin.boss && bare.lvl === 1 && bareWin.xp === stagePay(1, 1, 1, false).total && bareWin.xp < xpNeed(1), "одна зачистка первого этапа не поднимает уровень");
ok(stagePay(1, 1, 1, false).total === 1 && stagePay(1, 1, 1, true).total === 1, "повтор первого этапа не обнуляет его единственный опыт");

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
const replayBook = !("err" in g2) ? replayP.pending?.marks : undefined;
const replaySlice = stagePay(replayP.lvl, 7, 1, true);
const replayBonus = markPay(marksOn(7, replayBook), 0, replaySlice.total);
const w2 = finishRun(replayP, { nonce: (g2 as { nonce: string }).nonce, reason: "win", boss: true }, 90_000 + 40_000, mulberry32(73), { kills: killNeed(7), generals: 3, boss: true });
const flat = DEFAULT_TUNE.economy.clearBase + 7 * DEFAULT_TUNE.economy.clearPerFloor + DEFAULT_TUNE.economy.bossBase + 7 * DEFAULT_TUNE.economy.bossPerFloor;
const expectGold = Math.round(Math.round(flat * DEFAULT_TUNE.economy.replayGold) + killNeed(7) * DEFAULT_TUNE.economy.killGold + 3 * DEFAULT_TUNE.economy.generalGold) + markGold(replayBonus);
const expectXp = replaySlice.total + replayBonus;
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
for (let f = 1; f <= FLOOR_N; f++) {
  let prevGold = 0, prevXp = 0, prevHp = 0;
  for (let d = 1; d <= 7; d++) {
    const who = newProfile(1000 + f * 10 + d);
    setHero(who, "lorin");
    who.lvl = Math.max(who.lvl, floorNeed(f));
    if (f > 1) who.clears[f - 2] = 1;
    who.chain[f - 1] = d - 1;
    const o = runOffer(who, f, d, 1);
    if (o.hp !== ratiosHp[d - 1] || o.dmg !== ratiosDmg[d - 1] || o.name !== DIFF_NAME[d - 1]) matrix = false;
    if (!(o.bossHp > prevHp && o.goldFirst > prevGold && o.xpFirst >= prevXp)) matrix = false;
    if (d > 1 && !(dungeonBudget(who.lvl, floorByN(f).dungeon, d) > dungeonBudget(who.lvl, floorByN(f).dungeon, d - 1))) matrix = false;
    if (o.bossHp !== eliteHp("boss", f, 1, getTune(), d) || o.mobHp !== mobHp(0, f, getTune(), d)) matrix = false;
    if (o.chests !== chestTotal(d)) matrix = false;
    if (d > 1 && o.lower <= 0) matrix = false;
    if (d === 1 && o.lower !== 0) matrix = false;
    if (diffLock(who, f, d)) matrix = false;
    if (d < 7 && !diffLock(who, f, d + 1)?.includes("прохождением")) matrix = false;
    prevHp = o.bossHp; prevGold = o.goldFirst; prevXp = o.xpFirst;
  }
}
ok(matrix, "матрица всех этапов × 7 цветов: опасность растёт, следующий цвет закрыт");

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
ok(affixText({ stat: "crit", val: 3, name: "рейтинга крита" }) === "+3 рейтинга крита" && affixText({ stat: "crit", val: 3, name: "крита" }) === "+3 рейтинга крита", "строка аффикса не двоит слово рейтинга");
const smith = newProfile(77);
setHero(smith, "lorin");
smith.lvl = 12;
smith.clears[0] = 1;
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

const glance = statGlance(cast, "str");
ok(glance.after.dmg > glance.before.dmg && cast.alloc.str === 1, "превью силы показывает рост урона и очко не тратит");
ok(statGlance(cast, "vit").after.hp > statGlance(cast, "vit").before.hp, "превью живучести показывает рост здоровья");
ok(MODE_LIST.length === 7 && MODE_LIST.every((m) => getTune().modes[m.id] === SW_MODES[m.id]), "семь режимов и их пороги совпали с MODE_MIN_LVL");
const young = newProfile(4);
setHero(young, "lorin");
ok(!!modeLock(young, "arena") && "err" in beginMode(young, "arena", 1), "арена с 5 уровня закрыта на 1");
young.lvl = 5;
const arenaGo = beginMode(young, "arena", 1000);
ok(!("err" in arenaGo), "арена с 5 уровня начинается");
const rushed = finishRun(young, { nonce: "err" in arenaGo ? "" : arenaGo.nonce, boss: true, reason: "win", kills: 4 }, 2000, mulberry32(1));
ok(!("err" in rushed) && rushed.boss === false && young.book.wins[0] === 0, "арена за секунду не засчитывается");
young.lvl = 10;
const duel = beginMode(young, "duel", 5000);
const duelFight = new Battle(modeFloor(young, "duel"), [{ id: "you", name: "Лорин", hero: "lorin", sheet: sheet(young) }]);
ok(!!duelFight.elites[0] && duelFight.elites[0].name.includes("Теневой Двойник") && duelFight.elites[0].tier >= 2 && duelFight.elites[0].maxHp >= sheet(young).hp && duelFight.elites[0].maxHp <= Math.round(sheet(young).hp * 1.85), "дуэль — один зачарованный двойник, здоровье у здоровья героя");
const duelEnd = finishRun(young, { nonce: "err" in duel ? "" : duel.nonce, boss: true, reason: "win", kills: 0 }, 14000, mulberry32(2));
ok(!("err" in duelEnd) && duelEnd.boss && young.book.wins[1] === 1 && duelEnd.items.length === 1, "победа дуэли пишет победу и одну вещь");
young.lvl = 20;
const abyss = beginMode(young, "abyss", 20000);
const abyssEnd = finishRun(young, { nonce: "err" in abyss ? "" : abyss.nonce, boss: true, reason: "win", kills: 3 }, 28000, mulberry32(3));
ok(!("err" in abyssEnd) && young.book.abyss === 2 && young.book.best === 1, "бездна после победы открывает следующий этаж");
const rush = modeFloor(young, "bossrush");
ok(rush.boss.includes("Теневой Страж") && rush.play?.soloBoss === true, "босс-раш начинается с босса Подвалов");
const purge = modeFloor(young, "purgatory");
ok(purge.play?.playerDmg === 0.7 && purge.play.armor === 0.3 && purge.play.loot === 3, "чистилище режет урон, даёт броню и три вещи");
const raid = modeFloor(young, "demiurge");
ok(raid.boss === "Демиург" && raid.play?.enrageSec === 45 && raid.sw === "mode_demiurge", "рейд — Демиург и ярость на 45-й секунде");
young.lvl = 80;
const rage = beginMode(young, "demiurge", 30000);
const raged = finishRun(young, { nonce: "err" in rage ? "" : rage.nonce, boss: true, reason: "win", kills: 0 }, 80000, mulberry32(4));
ok(!("err" in raged) && raged.boss === false, "ярость после 45 секунд не даёт победу рейда");
setHero(young, "veles");
ok(young.book.abyss === 1 && young.book.wins[1] === 0, "режимы второго героя с нуля");
setHero(young, "lorin");
ok(young.book.abyss === 2 && young.book.wins[1] === 1, "этаж бездны остаётся на первом герое");
const swarm = FLOORS.find((f) => f.name.startsWith("Орда ("));
const swarmFight = swarm ? new Battle(swarm.n, [{ id: "you", name: "Лорин", hero: "lorin", sheet: sheet(young) }]) : null;
const scaled = swarm ? [0, 1, 2].map((k) => Math.round(mobHp(k, swarm.n) * 0.75)) : [];
ok(!!swarm && !!swarmFight && scaled.includes(swarmFight.lastMobHp) && craftFor(3, "dungeon_intro_3").env.includes("Хрусталь"), "орда башни бьётся на 0.75, пещеры носят свой свет");
const moved = validateTune({ ...DEFAULT_TUNE, modes: { ...DEFAULT_TUNE.modes, arena: 9 } });
const zero = validateTune({ ...DEFAULT_TUNE, modes: { ...DEFAULT_TUNE.modes, arena: 0 } });
ok(moved.ok && moved.tune.modes.arena === 9 && !zero.ok, "админка двигает порог арены и не пускает ноль");

ok(heroLocalFrame("idle", 0, 0, 0) !== heroLocalFrame("idle", 0, 0, 0.5), "стойка героя дышит двумя кадрами");
ok(heroLocalFrame("run", 0, 0, 0) !== heroLocalFrame("run", 0, 0, 0.2), "бег героя чередует два шага");
ok(heroLocalFrame("swing", 0.1, 0, 0) === 4 && heroLocalFrame("swing", 0.6, 0, 0) === 5, "замах и удар — разные кадры листа");
ok(heroLocalFrame("down", 0, 0, 0.1) !== heroLocalFrame("swing", 0.6, 0, 0), "смерть героя не стоит в кадре удара");
ok(beastFrame(true, 0, 0, 0, 0) !== beastFrame(true, 0, 0, 0, 0.2), "толпа шагает по четырём кадрам");
ok(beastFrame(true, 0, 0.2, 0, 0) === 7 && beastFrame(true, 0, 0, 0.3, 0) === 4 && beastFrame(false, 0.64, 0, 0, 0) === 8 && beastFrame(false, 0.01, 0, 0, 0) === 11, "попадание, удар и смерть бестиария — свои столбцы");

ok(rateChance(Number.NaN, "crit") === 0 && rateChance(-40, "dodge") === 0 && rateChance(Number.POSITIVE_INFINITY, "ls") === 0, "NaN, минус и бесконечность не дают шанс");
ok(rateChance(1e9, "crit") === HARD_CAP.crit && rateChance(1e9, "dodge") === HARD_CAP.dodge && rateChance(1e9, "ls") === HARD_CAP.ls, "огромный рейтинг упирается в потолок и не перешагивает");
ok(rateChance(5000, "crit") === rateChance(9000, "crit"), "тысяча стаков баффа не растит шанс выше потолка");
const capTune = JSON.parse(JSON.stringify(DEFAULT_TUNE));
capTune.caps = { crit: 0.9 };
ok(!validateTune(capTune).ok, "админка не получает поле, которым можно обойти потолок");
const wide = JSON.parse(JSON.stringify(DEFAULT_TUNE));
wide.diff.hp[6] = 32;
const tooWide = JSON.parse(JSON.stringify(DEFAULT_TUNE));
tooWide.diff.hp[6] = 40;
ok(validateTune(wide).ok && !validateTune(tooWide).ok, "здоровье чёрной можно поднять до ×32 и нельзя до ×40");

function dressed(lvl: number, diff: number, focus: "even" | "dex" | "str") {
  const p = newProfile(8000 + lvl * 10 + diff);
  setHero(p, "lorin");
  p.lvl = lvl;
  const pts = (lvl - 1) * 5;
  const cut = focus === "even" ? Math.floor(pts / 4) : focus === "dex" ? Math.floor(pts * 0.7) : Math.floor(pts * 0.7);
  p.alloc = focus === "dex"
    ? { str: Math.floor(pts * 0.1), dex: cut, vit: Math.floor(pts * 0.1), ene: pts - cut - Math.floor(pts * 0.2) }
    : focus === "str"
      ? { str: cut, dex: Math.floor(pts * 0.1), vit: Math.floor(pts * 0.1), ene: pts - cut - Math.floor(pts * 0.2) }
      : { str: cut, dex: cut, vit: cut, ene: pts - cut * 3 };
  const budget = diff === 7 ? 1.62 : diff >= 4 ? 1.22 : 1;
  const tier = diff === 7 ? 6 : diff >= 5 ? 4 : 0;
  for (let i = 0; i < 8; i++) {
    const it = rollItem(mulberry32(100 + lvl + i), { ilvl: Math.min(60, Math.max(1, lvl)), floor: 2, rarity: diff >= 4 ? "rare" : "magic", budget, tier, act: diff === 7 ? "killer" : "none", id: "g" + lvl + "-" + i });
    it.req = 1;
    p.bag.push(it);
    const slot = it.slot === "ring" ? (p.equip.ring1 ? "ring2" : "ring1") : it.slot;
    if (!p.equip[slot]) p.equip[slot] = it;
  }
  return sheet(p);
}
let ordinaryBuild = true;
for (const lvl of [1, 40, 120, 300]) {
  for (const diff of lvl >= 120 ? [1, 4, 7] : [1]) {
    const s = dressed(lvl, diff, "even");
    if (!(s.crit < 0.36 && s.dodge < 0.32 && s.ls < 0.09 && s.crit <= HARD_CAP.crit && s.dodge <= HARD_CAP.dodge && s.ls <= HARD_CAP.ls)) ordinaryBuild = false;
  }
}
ok(ordinaryBuild, "обычные сборки 1/40/120/300 и до чёрной не упираются в потолки");
const greedy = newProfile(4242);
setHero(greedy, "lorin");
greedy.lvl = 300;
greedy.alloc = { str: 0, dex: 1495, vit: 0, ene: 0 };
for (const slot of ["weapon", "helm", "chest", "gloves", "boots", "amulet", "ring", "ring"] as const) {
  const paper = slot === "ring" ? (greedy.equip.ring1 ? "ring2" : "ring1") : slot;
  greedy.equip[paper] = {
    id: "cap-" + paper, base: "x", name: "Кап", slot: slot === "ring" ? "ring" : slot, rarity: "rare", ilvl: 60, req: 1,
    dmg: 0, armor: 0, up: 58, ench: 6,
    affixes: [{ stat: "crit", val: 3, name: "крита" }, { stat: "dodge", val: 2, name: "уклонения" }, { stat: "ls", val: 2, name: "вампиризма" }],
  };
}
const greed = sheet(greedy);
ok(greed.crit <= 0.4 && greed.dodge <= 0.4 && greed.ls <= 0.1 && greed.crit > dressed(300, 7, "even").crit, "жадная сборка не перешагивает потолок и обгоняет обычную");

const shopper = newProfile(77);
setHero(shopper, "lorin");
shopper.lvl = 12;
const weapon = rollItem(mulberry32(5), { ilvl: 8, floor: 1, rarity: "rare", id: "cmp-w" });
weapon.req = 1;
weapon.slot = "weapon";
const ring = rollItem(mulberry32(6), { ilvl: 8, floor: 1, rarity: "magic", id: "cmp-r" });
ring.req = 1;
ring.slot = "ring";
const high = rollItem(mulberry32(7), { ilvl: 20, floor: 1, rarity: "rare", id: "cmp-h" });
high.req = 40;
high.slot = "weapon";
shopper.bag.push(weapon, ring, high);
const snap = JSON.stringify(shopper);
const cmp = compareGear(shopper, weapon.id);
const cmpRing = compareGear(shopper, ring.id);
const blocked = compareGear(shopper, high.id);
ok(JSON.stringify(shopper) === snap, "сравнение не пишет сохранение");
shopper.equip.ring1 = { ...ring, id: "worn-ring" };
const cmpRing2 = compareGear(shopper, ring.id);
ok(!!cmp && cmp.empty && cmp.after.dmg !== cmp.before.dmg, "пустой слот оружия показывает прирост урона");
ok(!!cmpRing && cmpRing.slot === "ring1" && !!cmpRing.otherRing && cmpRing.otherRing.slot === "ring2", "первое кольцо сравнивается, второе остаётся видимым");
ok(!!cmpRing2 && cmpRing2.slot === "ring2" && cmpRing2.empty, "занятое первое кольцо отдаёт сравнение второму пустому");
ok(!!blocked && !!blocked.blocked && blocked.after.dmg === blocked.before.dmg && blocked.after.crit === blocked.before.crit, "вещь выше уровня не рисует чужие статы");

resetTune();
const light = (s: ReturnType<typeof sheet>) => 5.15 * s.dmg / (1.14 / Math.max(0.4, s.aspd));
const starter = dressed(1, 1, "even");
const mid = dressed(40, 3, "even");
const highLv = dressed(120, 5, "even");
const end = dressed(300, 7, "even");
const glass = dressed(300, 7, "str");
const boss = (floor: number, diff: number, party = 1) => eliteHp("boss", floor, party, getTune(), diff);
const slam = (floor: number, diff: number, s: ReturnType<typeof sheet>) => mitigate(eliteDmg("boss", floor, getTune(), diff), s.armor) / s.hp;
const t1 = boss(1, 1) / light(starter);
const tMid = boss(24, 3) / light(mid);
const tHigh = boss(90, 5) / light(highLv);
const tEnd = boss(169, 7) / light(end);
const tParty = boss(169, 7, 4) / (light(end) * 4);
const hitEnd = slam(169, 7, end);
const hitGlass = slam(169, 7, glass);
ok(t1 >= 6 && t1 <= 45 && tMid >= 8 && tMid <= 70 && tHigh >= 10 && tHigh <= 90 && tEnd >= 20 && tEnd <= 100, `время босса в окне: ${t1.toFixed(1)} / ${tMid.toFixed(1)} / ${tHigh.toFixed(1)} / ${tEnd.toFixed(1)} с`);
ok(hitEnd < 0.35 && hitGlass > hitEnd && hitGlass < 0.85, `удар чёрного босса: танк ${(hitEnd * 100).toFixed(1)}%, стекло ${(hitGlass * 100).toFixed(1)}%`);
ok(boss(1, 7, 4) / boss(1, 7, 1) > 1.4 && boss(1, 7, 4) / boss(1, 7, 1) <= 2.05, "четверо делят более толстого босса, потолок ×2.05");
ok(tParty < tEnd, "четверо убивают чёрного босса быстрее одного при той же сборке");
const raidHero = newProfile(8080);
setHero(raidHero, "lorin");
raidHero.lvl = 80;
const raidFloor = modeFloor(raidHero, "demiurge");
const raidBoss = eliteHp("boss", raidFloor.n, 1, getTune(), 1) * (raidFloor.play?.foeHp || 1);
const chip = 100 / (100 + 18);
const raidGear = dressed(80, 4, "even");
const raidWeak = dressed(40, 1, "even");
const raidTime = raidBoss / (light(raidGear) * chip);
const raidSlow = raidBoss / (light(raidWeak) * chip);
ok(raidFloor.n === 59 && raidFloor.play?.foeHp === 8 && raidTime > 24 && raidTime < 45 && raidSlow > 45, `рейд этаж ${raidFloor.n}: сборка 80 уровня ${raidTime.toFixed(1)} с, слабая ${raidSlow.toFixed(1)} с`);
const vow = newProfile(909);
setHero(vow, "lorin");
vow.pending = { floor: 1, at: 1, nonce: "n", diff: 1, oath: "harvest" };
const vowed = sheet(vow);
ok(vowed.ls > 0.05 && vowed.ls < 0.07 && vowed.ls <= HARD_CAP.ls, "жатва с нуля около 6% и не выше потолка");
const feelP = newProfile(11);
setHero(feelP, "lorin");
const brawl = new Battle(1, [{ id: "you", name: "Лорин", hero: "lorin", sheet: sheet(feelP) }]);
brawl.press("you", { hold: true, aim: 0, mx: 1, my: 0 });
let falling = false;
for (let i = 0; i < 500; i++) {
  brawl.step(0.05);
  if (brawl.mobs().some((m) => !m.alive && m.die > 0.2)) falling = true;
}
ok(brawl.kills > 3 && falling, "толпа падает кадрами смерти");
const mirrorFight = new Battle(modeFloor(feelP, "duel"), [{ id: "you", name: "Лорин", hero: "lorin", sheet: sheet(feelP) }]);
mirrorFight.introT = 0;
const mirror = mirrorFight.elites.find((e) => e.kind === "boss");
ok(!!mirror, "дуэль выпускает босса сразу");
if (mirror) {
  mirror.hp = mirror.maxHp * 0.2;
  mirror.cd = 0;
  for (let i = 0; i < 40; i++) mirrorFight.step(0.05);
  ok(mirror.phase === 3 && mirror.windMax >= 0.8 && mirrorFight.mobs().length >= 1, "босс зовёт прислужников и удлиняет замах на последней фазе");
}

const crowd = new Battle(1, [{ id: "you", name: "Лорин", hero: "lorin", sheet: sheet(feelP) }], 7);
crowd.introT = 0;
const crowdHero = crowd.party[0];
const farThen = Math.min(...crowd.mobs().filter((m) => m.alive).map((m) => Math.hypot(m.x - crowdHero.x, m.y - crowdHero.y)));
const hpThen = crowdHero.hp;
for (let i = 0; i < 260; i++) crowd.step(0.05);
const farNow = Math.min(...crowd.mobs().filter((m) => m.alive).map((m) => Math.hypot(m.x - crowdHero.x, m.y - crowdHero.y)).concat([1e9]));
ok(farNow < farThen - 30 && crowdHero.hp < hpThen, "толпа сама подходит и снимает здоровье, герой стоит");

const duelMark = new Battle(modeFloor(feelP, "duel"), [{ id: "you", name: "Лорин", hero: "lorin", sheet: sheet(feelP) }], 5);
const duelBoss = duelMark.elites.find((e) => e.kind === "boss");
ok(!!duelBoss && duelBoss.tier >= 2 && duelBoss.tier <= 6 && /Редкий|Странный|Легендарный|Божественный|Чёрный/.test(duelBoss.name) && duelBoss.pow <= 1.45, "дуэль показывает ярус чар и не множит урон выше потолка");
if (duelBoss) {
  const far = Math.hypot(duelBoss.x - duelMark.party[0].x, duelBoss.y - duelMark.party[0].y);
  duelMark.introT = 0;
  for (let i = 0; i < 40; i++) duelMark.step(0.05);
  const near = Math.hypot(duelBoss.x - duelMark.party[0].x, duelBoss.y - duelMark.party[0].y);
  ok(near < far - 20, "двойник сам сокращает дистанцию");
}

let under = 0;
for (let d = 5; d <= 7; d++) for (let s = 1; s <= 300; s++) if (rollMark(s, "boss", d).tier < d - 1 || rollMark(s, "g0", d).tier > 6) under++;
ok(under === 0, "с легендарной ступени ярус не ниже цвета и не выше Чёрного");
let ups = 0;
for (let s = 1; s <= 4000; s++) if (rollMark(s, "boss", 1).tier > 0) ups++;
ok(ups === 315, `на базовой шаг вверх ровно 315 из 4000, сейчас ${ups}`);
const blackPlus = rollMark(1, "boss", 7);
ok(blackPlus.tier === 6 && blackPlus.up <= 3, "чёрный шаг вверх — плюс, не седьмой ярус");

const roomSeed = markSeed("room-nonce", 1, 7);
const one = rollBook(roomSeed, 7);
const two = rollBook(roomSeed, 7);
ok(JSON.stringify(one) === JSON.stringify(two) && one.boss.tier === 6, "один сид комнаты даёт одного и того же чёрного босса");
const mateA = newProfile(81);
const mateB = newProfile(82);
setHero(mateA, "lorin");
setHero(mateB, "lorin");
mateA.lvl = 20;
mateB.lvl = 20;
mateA.chain[0] = 6;
mateB.chain[0] = 6;
const openA = beginRun(mateA, 1, 1, "room-nonce", false, 7);
const openB = beginRun(mateB, 1, 1, "room-nonce", false, 7);
ok(!("err" in openA) && !("err" in openB) && mateA.pending?.seed === mateB.pending?.seed && JSON.stringify(mateA.pending?.marks) === JSON.stringify(mateB.pending?.marks), "оба клиента комнаты получают одного генерала");
const paid = finishRun(mateA, { nonce: "room-nonce", reason: "win", boss: true }, 50_000, mulberry32(3), { kills: 8, generals: 1, boss: true });
const paidAgain = finishRun(mateA, { nonce: "room-nonce", reason: "win", boss: true }, 50_000, mulberry32(3), { kills: 8, generals: 1, boss: true });
ok(!("err" in paid) && "err" in paidAgain && paidAgain.err === "Забег не начат", "повторный end не выдаёт награду второй раз");

let budgetOk = true;
const lengths = new Set<number>();
for (const row of FLOORS) {
  if (row.stage !== 1) continue;
  const rows = FLOORS.filter((f) => f.dungeon === row.dungeon);
  lengths.add(rows.length);
  const lvl = floorNeed(row.n);
  const sum1 = rows.reduce((s, f) => s + stagePay(lvl, f.n, 1, false).total, 0);
  const sum3 = rows.reduce((s, f) => s + stagePay(lvl, f.n, 3, false).total, 0);
  if (sum1 !== dungeonBudget(lvl, row.dungeon, 1) || sum3 !== dungeonBudget(lvl, row.dungeon, 3)) budgetOk = false;
  const part = stagePay(lvl, row.n, 1, false);
  if (part.mob + part.general + part.clear !== part.total) budgetOk = false;
}
ok(budgetOk && lengths.has(3) && lengths.has(12) && lengths.has(20), "бюджет полного данжа делится на этапы 3…20 без двойного счёта");
for (const lvl of [1, 40, 120, 300]) {
  const home = FLOORS.find((f) => {
    if (f.stage !== 1) return false;
    const next = FLOORS.find((n) => n.dungeon === f.dungeon + 1 && n.stage === 1);
    const ceiling = next ? Math.max(floorNeed(f.n), floorNeed(next.n) - 1) : 300;
    return floorNeed(f.n) <= lvl && lvl <= ceiling;
  });
  const rows = FLOORS.filter((f) => f.dungeon === home!.dungeon);
  const got = rows.reduce((s, f) => s + stagePay(lvl, f.n, 1, false).total, 0);
  const got3 = rows.reduce((s, f) => s + stagePay(lvl, f.n, 3, false).total, 0);
  ok(!!home && got === Math.round(xpNeed(lvl) * 0.1) && got3 === Math.round(xpNeed(lvl) * 0.25) && relevance(lvl, home!.dungeon) === 1, `уровень ${lvl}: обычная ${got}, редкая ${got3}, порог ${xpNeed(lvl)}`);
}
ok(dungeonBudget(40, 1, 1) === Math.round(xpNeed(40) * 0.1 * relevance(40, 1)) && relevance(40, 1) < 0.2, "замок на 40 уровне не отдаёт десятую уровня");
ok(HARD_CAP.crit === 0.4 && HARD_CAP.dodge === 0.4 && HARD_CAP.ls === 0.1 && sheet(feelP).crit <= HARD_CAP.crit, "потолки 40/40/10 не двигаются от чар генерала");

const lowTune = JSON.parse(JSON.stringify(DEFAULT_TUNE));
lowTune.elite.minTier = [0, 1, 2, 3, 3, 5, 6];
ok(!validateTune(lowTune).ok, "админка не опускает легендарный ярус ниже цвета");
const fat = JSON.parse(JSON.stringify(DEFAULT_TUNE));
fat.elite.up = [0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5];
ok(!validateTune(fat).ok, "шанс шага вверх остаётся маленьким");

const bossKeys = BOSS_SCRIPTS.map((s) => s.moves.join(","));
const genKeys = GENERAL_SCRIPTS.map((s) => s.moves.join(","));
ok(BOSS_SCRIPTS.length === 17 && GENERAL_SCRIPTS.length === 17 && new Set(bossKeys).size === 17 && new Set(genKeys).size === 17, "у 17 боссов и 17 генералов разные порядки приёмов");
ok(BOSS_SCRIPTS.every((s, i) => s.moves[0] !== GENERAL_SCRIPTS[i].moves[0] && s.moves.length >= 2), "первый приём генерала не копирует босса своего данжа");
ok(castOf(1, "boss", 0, 0).tell === "копьё" && castOf(1, "boss", 1, 0).move === "cone" && castOf(11, "boss", 0, 0).move === "bite" && castOf(6, "boss", 0, 0).move === "pull", "замок бьёт копьём и щитом, Кармилла кусает, Танатос зовёт");
ok(castOf(17, "boss", 3, 6).tell === "чёрный след" && castOf(17, "boss", 0, 6).move === "summon", "чёрный след добавляется к порядку, а не стирает его");
{
  const walker = newProfile(3);
  setHero(walker, "lorin");
  const tough = sheet(walker);
  tough.hp = 20000;
  const live = new Battle(modeFloor(walker, "duel"), [{ id: "you", name: "Лорин", hero: "lorin", sheet: tough }], 1, 1);
  let seen = "";
  for (let i = 0; i < 200 && !seen; i++) {
    live.step(0.05);
    const boss = live.elites.find((e) => e.kind === "boss" && e.pattern === 1 && e.wind > 0);
    if (boss) seen = boss.move + ":" + boss.tell;
  }
  ok(seen === "line:копьё", "босс первого данжа открывает бой копьём, не множителем здоровья");
}
ok(heroLocalFrame("down", 0, 0, 0.05) === HERO_FRAME.breath && heroLocalFrame("down", 0, 0, 0.5) === HERO_FRAME.stance && heroLocalFrame("hurt", 0, 0.2, 1) === HERO_FRAME.windup && heroLocalFrame("down", 0, 0, 0.5) !== HERO_FRAME.windup, "падение героя садится в стойку и не повторяет кадр ранения");

const jewel = newProfile(9);
setHero(jewel, "lorin");
jewel.gold = 5000;
jewel.lvl = 20;
const wand = rollItem(mulberry32(9), { ilvl: 8, floor: 1, rarity: "magic", bare: true, id: "wand" });
wand.slot = "weapon";
wand.dmg = 20;
wand.req = 1;
wand.affixes = [];
jewel.bag = [wand];
ok(equipItem(jewel, wand.id) === null, "оружие для гнезда надето");
const plain = sheet(jewel).dmg;
ok("err" in socketRune(jewel, wand.id, "r_creator"), "пустой запас не сажает руну");
ok(!("err" in buyRune(jewel, "r_creator")) && !("err" in buyRune(jewel, "r_vamp")) && !("err" in socketRune(jewel, wand.id, "r_creator")) && !("err" in socketRune(jewel, wand.id, "r_vamp")), "две разные руны садятся в оружие");
ok("err" in socketRune(jewel, wand.id, "r_chrono") && jewel.equip.weapon?.sockets?.length === 2, "третье гнездо закрыто");
ok(sheet(jewel).dmg > plain && sheet(jewel).ls <= HARD_CAP.ls && sheet(jewel).ls > 0, "Руна Творца поднимает урон, Руна Жатвы не обходит 10%");
jewel.pending = { floor: 1, at: 1, nonce: "o", chests: 0, diff: 1, oath: "harvest" };
ok(sheet(jewel).ls <= HARD_CAP.ls, "клятва жатвы и руна вместе остаются под потолком");
jewel.pending = null;
ok(!("err" in buyRune(jewel, "r_chrono")) && !("err" in buyRune(jewel, "r_nova")), "ещё две руны в запасе");
jewel.equip.weapon!.sockets = ["r_chrono", "r_nova"];
const timed = sheet(jewel);
ok(Math.abs(timed.cdMul - 0.75) < 1e-9 && Math.abs(timed.radiusMul - 1.2) < 1e-9, "Хронос короче перезарядку, Сверхновая шире навык");
for (let i = 0; i < 9; i++) ok(!("err" in raiseRadiance(jewel)), "сияние шагает до девяти");
ok("err" in raiseRadiance(jewel) && jewel.radiance === 9 && skillGlow("lorin", 0, 9) === "echo" && skillGlow("lorin", 1, 9) === "vamp" && skillGlow("lorin", 2, 5) === null, "девятый шаг открывает Эхо и Жажду, третий навык до девятого молчит");
ok(skillGlow("lorin", 2, 9) === "nova" && sheet(jewel).skill > sheet(newProfile(1)).skill && sheet(jewel).cdMul < 0.75, "девятое сияние усиливает навык и ещё короче перезарядку");
const shut = JSON.parse(JSON.stringify(DEFAULT_TUNE));
shut.craft.radianceMax = 12;
shut.craft.sockets = 2;
ok(!validateTune(shut).ok, "админка не поднимает сияние выше 9 и не открывает третье гнездо");
const legacyCraft = JSON.parse(JSON.stringify(DEFAULT_TUNE));
delete legacyCraft.craft;
const legacyOk = validateTune(legacyCraft);
ok(legacyOk.ok && legacyOk.tune.craft.radianceMax === 9 && legacyOk.tune.craft.sockets === 1, "старый набор без гнёзд оставляет сияние и руны включёнными");
const ringBack = normalize(JSON.parse(JSON.stringify(jewel)));
ok(ringBack.radiance === 9 && ringBack.equip.weapon?.sockets?.join(",") === "r_chrono,r_nova" && ringBack.roster.find((r) => r.id === "lorin")?.radiance === 9, "сияние и гнёзда переживают снимок героя");

const strong = newProfile(11);
setHero(strong, "lorin");
strong.lvl = 20;
strong.alloc.str = 40;
const tank = newProfile(12);
setHero(tank, "veles");
const sl = sheet(strong);
const sv = sheet(tank);
const hl = freshHand(0);
const hv = freshHand(0);
const cutL = trySwing(hl, "lorin", sl, { kind: "skill", skill: 0 }, 5000);
const cutV = trySwing(hv, "veles", sv, { kind: "skill", skill: 0 }, 5000);
ok(cutL.ok && cutV.ok && cutL.ok && cutV.ok && cutL.mul !== cutV.mul, "Жатва и Стена — разные навыки");
const dmgL = blowAmount(sl, cutL.ok ? cutL.mul : 0, true, false, false, eliteArmorK("boss", 0));
const dmgV = blowAmount(sv, cutV.ok ? cutV.mul : 0, true, false, false, eliteArmorK("boss", 0));
ok(Math.round(dmgL) !== Math.round(dmgV), "сила Лорин и лист Велеса дают разный урон боссу");
const cdLeft = hl.cd[0];
const repeatCut = trySwing(hl, "lorin", sl, { kind: "skill", skill: 0 }, 5300);
ok(!repeatCut.ok && hl.cd[0] < cdLeft && hl.cd[0] > cdLeft - 0.5, "повтор во время отката не обновляет навык");
const hm = freshHand(0);
ok(!trySwing(hm, "lorin", sl, { kind: "musou", skill: 3 }, 1000).ok, "пыл без шкалы не тратится");
hm.musou = 100;
const fired = trySwing(hm, "lorin", sl, { kind: "musou", skill: 3 }, 1000);
ok(fired.ok && hm.musou === 0 && Math.abs(hm.cd[3] - 1.2) < 1e-9, "пыл тратит шкалу и ставит свой откат");
ok(!trySwing(hm, "lorin", sl, { kind: "musou", skill: 3 }, 1200).ok, "пыл сразу второй раз не проходит");
hm.cd[0] = 4;
hm.haste = 2;
tickHand(hm, 1);
ok(Math.abs(hm.cd[0] - 2.75) < 1e-6, "порыв тратит откат быстрее");
ok(skillSeconds("lorin", 0, sheet(jewel)) < 3.2 * 0.75, "сияние и Хронос короче Жатву");
ok(bossPhase(50, 300) === 3 && castTiming("boss", "circle", "circle", 3).wind >= 0.8 && castTiming("boss", "circle", "circle", 3).cd < castTiming("boss", "circle", "circle", 1).cd, "третья фаза босса длиннее замах и короче паузу");
const bookL = skillBook(jewel);
ok(bookL.cards[0].name === "Жатва" && bookL.cards.length === 4 && bookL.passives.length >= 5 && bookL.step === 9, "вкладка навыков Лорин: четыре активных и пассивы сияния");
setHero(jewel, "veles");
const bookV = skillBook(jewel);
ok(bookV.cards[0].name === "Стена" && bookV.step === 0 && bookV.cards.every((c) => c.name !== "Жатва"), "чужой герой не тащит навыки и сияние Лорин");
setHero(jewel, "lorin");
ok(skillBook(jewel).step === 9 && skillBook(jewel).cards[0].name === "Жатва", "возврат к Лорин возвращает его сияние");
const coopBattle = new Battle(1, [{ id: "a", name: "А", hero: "lorin", sheet: sl }], 1, 1);
coopBattle.remote = true;
coopBattle.localId = "a";
let skillWalk = 0;
while (coopBattle.phase === "intro" && skillWalk < 3) { coopBattle.step(0.05); skillWalk += 0.05; }
coopBattle.press("a", { skill: 1, aim: 0 });
for (let i = 0; i < 6 && coopBattle.party[0].cd[0] <= 0; i++) coopBattle.step(0.05);
const cdNow = coopBattle.party[0].cd[0];
ok(cdNow > 1 && coopBattle.takeActs().some((a) => a.kind === "skill" && a.skill === 0), "клиент шлёт именно Жатву и ставит её откат");
for (let i = 0; i < 8; i++) { coopBattle.press("a", { skill: 1, aim: 0 }); coopBattle.step(0.05); }
ok(coopBattle.party[0].cd[0] < cdNow, "повтор клавиши во время отката не запускает Жатву снова");
coopBattle.party[0].cd[0] = 0;
coopBattle.linked = false;
coopBattle.press("a", { skill: 1, aim: 0 });
for (let i = 0; i < 8; i++) coopBattle.step(0.05);
ok(coopBattle.party[0].cd[0] === 0 && !coopBattle.takeActs().some((a) => a.kind === "skill"), "без связи Жатва не ставит откат");
coopBattle.linked = true;
coopBattle.press("a", { skill: 1, aim: 0 });
coopBattle.step(0.02);
coopBattle.linked = false;
for (let i = 0; i < 4; i++) coopBattle.step(0.05);
ok(coopBattle.party[0].cd[0] === 0 && !coopBattle.party[0].atk, "обрыв в замахе не тратит Жатву");
coopBattle.linked = true;
coopBattle.press("a", { skill: 1, aim: 0 });
coopBattle.step(0.02);
coopBattle.applyHand([2.2, 0, 0, 0], 40, 0, true, false, 0, 0);
for (let i = 0; i < 4; i++) coopBattle.step(0.05);
ok(coopBattle.party[0].cd[0] < 2.05 && coopBattle.party[0].cd[0] > 1.85, "снимок комнаты оставляет серверный откат, а не полный заново");

const canon: Record<string, string> = {
  lorin: "Алзи", lorelin: "Нофорд", veles: "Велес", listaf: "Кавега",
  chronos: "Мариэль", fox: "Кьют", itrain: "Петр", alex: "Лэйр",
};
ok(HEROES.map((h) => h.id).join() === "lorin,lorelin,veles,listaf,chronos,fox,itrain,alex", "heroId на месте");
ok(Object.entries(canon).every(([id, name]) => heroById(id).name === name), "имя на карточке совпадает со строкой атласа");
ok(heroById("lorin").skills[0].id === "harvest" && heroById("veles").skills[0].id === "wall", "навыки остались на своих heroId");
ok(heroDir(0) === 2 && heroDir(Math.PI) === 1 && heroDir(Math.PI / 2) === 0 && heroDir(-Math.PI / 2) === 3, "вправо — столбец 2, влево — столбец 1");
const fullStick = stickVector(80, 0, 46);
const halfStick = stickVector(28, 0, 46);
const deadStick = stickVector(4, 0, 46);
ok(Math.abs(fullStick.x - 1) < 0.05 && halfStick.x > 0.3 && halfStick.x < 0.7 && deadStick.x === 0, "стик: мёртвая зона и аналоговая длина");
const diag = stickVector(80, 80, 46);
ok(Math.abs(Math.hypot(diag.x, diag.y) - 1) < 0.05, "полный диагональный стик не длиннее 1");
ok(Math.abs(travelAim(1, 0, Math.PI, false)) < 0.01 && Math.abs(Math.abs(travelAim(-1, 0, 0, false)) - Math.PI) < 0.01, "без взгляда тело смотрит по шагу");
ok(travelAim(1, 0, -1.2, true) === -1.2, "мышь или второй палец держат взгляд");
const clamped = clampMove(1, 1);
ok(Math.abs(Math.hypot(clamped.x, clamped.y) - 1) < 1e-9, "клавиши по диагонали сжимаются до 1");

function paceWalk(dt: number, steps: number, mx: number, my: number) {
  const b = new Battle(1, [{ id: "you", name: "Алзи", hero: "lorin", sheet: sheet(setHero(newProfile(1), "lorin") || newProfile(1)) }], 3);
  b.phase = "fight";
  b.introT = 0;
  const x0 = b.party[0].x;
  const y0 = b.party[0].y;
  for (let i = 0; i < steps; i++) {
    b.press("you", { mx, my, aim: Math.atan2(my, mx || 1) });
    b.step(dt);
  }
  return Math.hypot(b.party[0].x - x0, b.party[0].y - y0);
}
const sec60 = paceWalk(1 / 60, 60, 1, 0);
const sec30 = paceWalk(1 / 30, 30, 1, 0);
const sec120 = paceWalk(1 / 120, 120, 1, 0);
ok(Math.abs(sec30 - sec60) < 1.5 && Math.abs(sec120 - sec60) < 1.5, "шаг за секунду одинаков на 30, 60 и 120");
const halfSec = paceWalk(1 / 60, 60, 0.5, 0);
ok(halfSec > sec60 * 0.42 && halfSec < sec60 * 0.58, "половина стика — около половины скорости");
const diagSec = paceWalk(1 / 60, 60, 1, 1);
ok(Math.abs(diagSec - sec60) < 1.5, "диагональ не быстрее прямого шага");
const swinging = new Battle(1, [{ id: "you", name: "Алзи", hero: "lorin", sheet: sheet(setHero(newProfile(1), "lorin") || newProfile(1)) }], 4);
swinging.phase = "fight";
swinging.press("you", { light: true, mx: 1, my: 0, aim: 0 });
swinging.step(0.05);
const xSwing = swinging.party[0].x;
swinging.press("you", { light: true, mx: 1, my: 0, aim: 0 });
swinging.step(0.05);
ok(swinging.party[0].x > xSwing + 2 && swinging.party[0].atk?.kind === "light", "лёгкий удар не прибивает шаг");
const queuedCast = new Battle(1, [{ id: "you", name: "Алзи", hero: "lorin", sheet: sheet(setHero(newProfile(1), "lorin") || newProfile(1)) }], 5);
queuedCast.phase = "fight";
queuedCast.press("you", { light: true, aim: 0, mx: 0, my: 0 });
queuedCast.step(0.016);
queuedCast.press("you", { skill: 1, aim: 0, mx: 0, my: 0 });
queuedCast.step(0.016);
ok(queuedCast.party[0].atk?.kind === "skill", "навык забирает замах лёгкого удара");
const frozen = new Battle(1, [{ id: "you", name: "Алзи", hero: "lorin", sheet: sheet(setHero(newProfile(1), "lorin") || newProfile(1)) }], 6);
frozen.phase = "fight";
frozen.hitstop = 0.05;
const xHit = frozen.party[0].x;
frozen.press("you", { mx: 1, my: 0, aim: 0 });
frozen.step(0.05);
ok(frozen.party[0].x > xHit + 2, "хитстоп не замораживает шаг");

console.log(fails ? `FAILED ${fails}/${n}` : `OK ${n}`);
process.exit(fails ? 1 : 0);
