// «Вечная стража»: площадки, формулы, луч, иней, шип, маяк, резонанс, волны, сохранения.
// Запуск: node --experimental-strip-types tools/tests/eternal-watch-test.ts
import { existsSync, readFileSync } from "fs";
import { join } from "path";
import {
  FROST_STACK_LIFE,
  LAW_PADS,
  LAWS,
  META_PADS,
  PADS,
  PATH,
  PATH_LEN,
  RUNES,
  SHOP,
  SPRITE_NAMES,
  TOWERS,
  auraFor,
  bagMax,
  beamTargets,
  beginNight,
  buyShop,
  combosOf,
  dawnConversion,
  enemyArmor,
  enemyMaxHp,
  executeThreshold,
  fitCanvas,
  formatNumber,
  freshMeta,
  killGoldBase,
  parseSave,
  placeTower,
  progressAtCell,
  resonanceOf,
  serializeSave,
  shotDamage,
  sparkBoss,
  sparkMilestone,
  spawnEnemy,
  spawnInterval,
  startingGold,
  stepRun,
  towerSpec,
  upgradeCost,
  waveClearGold,
  wavePlan,
  type Meta,
  type Run,
  type TowerKind,
} from "../../src/scripts/eternal-watch/logic.ts";

let fails = 0;
let passes = 0;
const ok = (c: unknown, m: string) => {
  if (c) passes++;
  else {
    fails++;
    console.log("FAIL " + m);
  }
};
const close = (a: number, b: number, m: string) => ok(Math.abs(a - b) < 1e-6, `${m}: ${a} vs ${b}`);

const root = join(import.meta.dirname, "../..");
for (const size of [16, 32, 64]) {
  for (const name of SPRITE_NAMES) {
    ok(existsSync(join(root, `public/games/eternal-watch/sprites/${size}/${name}.png`)), `png ${size}/${name}`);
  }
}
ok(SPRITE_NAMES.length === 42, "42 спрайта");
ok(existsSync(join(root, "public/games/eternal-watch/cover.png")), "обложка");

const pathSet = new Set(PATH.map((c) => c.x + "," + c.y));
ok(PADS.length >= 16, `площадок ${PADS.length}`);
ok(PATH[0]?.x === 15 && PATH[0]?.y === 2 && PATH[PATH.length - 1]?.x === 1 && PATH[PATH.length - 1]?.y === 2, "концы тропы");
ok(PATH_LEN === PATH.length - 1 && PATH_LEN === 24, "длина тропы 24");
for (const p of PADS) ok(!pathSet.has(p.x + "," + p.y), `площадка не на тропе ${p.x},${p.y}`);
const padSet = new Set(PADS.map((c) => c.x + "," + c.y));
ok(META_PADS.length === 2 && LAW_PADS.length === 4, "доп. площадки 2 и 4");
for (const p of [...META_PADS, ...LAW_PADS]) {
  ok(!pathSet.has(p.x + "," + p.y) && !padSet.has(p.x + "," + p.y), `доп. площадка свободна ${p.x},${p.y}`);
}
for (const p of LAW_PADS) ok(!META_PADS.some((m) => m.x === p.x && m.y === p.y), "закон не повторяет лавку");

close(enemyMaxHp("walker", 1, []), 20, "пехота 1");
close(enemyMaxHp("walker", 10, []), 20 * 1.13 ** 9, "пехота 10");
close(enemyMaxHp("runner", 3, []), 12 * 1.13 ** 2, "бегун 3");
close(enemyMaxHp("tank", 5, []), 55 * 1.13 ** 4, "танк 5");
close(enemyMaxHp("swarm", 8, []), 7 * 1.13 ** 7, "рой 8");
close(enemyMaxHp("healer", 15, []), 18 * 1.13 ** 14, "лекарь 15");
close(enemyMaxHp("boss", 10, []), 400 * 1.18 ** 1, "босс 10");
close(enemyMaxHp("boss", 30, []), 400 * 1.18 ** 3, "босс 30");
close(enemyMaxHp("tank", 5, ["goldThirst"]), 55 * 1.13 ** 4 * 1.2, "жажда золота");
close(enemyMaxHp("swarm", 8, ["swarmFlame"]), 7 * 1.13 ** 7 * 0.7, "рой и пламя");
close(enemyMaxHp("boss", 20, ["quietBoss"]), 400 * 1.18 ** 2 * 1.5, "тихий босс");
ok(enemyArmor("tank", 1, []) === 8 && enemyArmor("boss", 1, []) === 12, "броня");
ok(enemyArmor("walker", 120, ["worldArmor"]) === 16, "броня мира и волна 120");
ok(killGoldBase(20) === 1 && killGoldBase(25) === 2 && killGoldBase(694) === 1 + Math.floor(694 / 25), "золото за убийство");
ok(waveClearGold(1) === 6 && waveClearGold(10) === 15, "золото за волну");
ok(sparkMilestone(4) === 0 && sparkMilestone(5) === 1 && sparkMilestone(30) === 4, "искры за пятую");
ok(sparkBoss(10) === 4 && sparkBoss(30) === 6 && sparkBoss(9) === 0, "искры за босса");
ok(dawnConversion(100, 30, []) === 4 + 12, "рассвет 100 золота волна 30");
ok(dawnConversion(100, 30, ["endless"]) === (4 + 12) * 3, "ночь без конца умножает обмен");
ok(dawnConversion(100, 30, ["doubleSparks"]) === Math.round(16 * 1.8), "двойные искры на рассвете");
ok(startingGold(freshMeta()) === 100, "старт 100");
{
  const m = freshMeta();
  m.startGoldRanks = 2;
  m.laws = ["generous", "doubleSparks"];
  m.carryGold = 10;
  ok(startingGold(m) === 100 + 50 + 25 - 20 + 10, "стартовое золото с метой");
  m.carryGold = 0;
  m.startGoldRanks = 0;
  m.laws = ["doubleSparks"];
  ok(startingGold(m) === 80, "двойные искры снимают 20 и не опускают старт ниже 20");
  const poor = freshMeta();
  poor.laws = ["doubleSparks"];
  ok(startingGold(poor) >= 20, "минимум 20");
}
close(spawnInterval(1), 0.55, "интервал 1");
close(spawnInterval(41), 0.55 * 0.98 ** 40, "интервал с потолком");

const w1 = wavePlan(1);
ok(w1.length === 1 && w1[0]!.kind === "walker" && w1[0]!.count === 8, "волна 1: 8 пехоты");
const w10 = wavePlan(10);
const count = (n: number, k: string) => wavePlan(n).find((g) => g.kind === k)?.count ?? 0;
ok(count(10, "walker") === 14 && count(10, "runner") === 4 && count(10, "tank") === 1 && count(10, "swarm") === 4 && count(10, "healer") === 0 && count(10, "boss") === 1, "волна 10");
ok(count(15, "walker") === 17 && count(15, "runner") === 5 && count(15, "tank") === 2 && count(15, "swarm") === 4 && count(15, "healer") === 1 && count(15, "boss") === 0, "волна 15");
ok(count(8, "swarm") === 4 && count(16, "swarm") === 8, "пачки роя");

ok(formatNumber(999) === "999" && formatNumber(1000) === "1K", "порог тысячи");
ok(formatNumber(1200) === "1.2K" && formatNumber(12400) === "12.4K", "тысячи");
ok(formatNumber(1_350_000) === "1.35M", "миллионы");
ok(formatNumber(2_100_000_000) === "2.10B", "миллиарды");
ok(formatNumber(1e15) === "1.00e15", "научная запись");

const fit = fitCanvas(960, 540, 1);
ok(Number.isInteger(fit.S) && fit.S >= 1, "масштаб целый");
const phone = fitCanvas(390, 420, 2);
ok(Number.isInteger(phone.S) && phone.S >= 1 && 256 * phone.S <= 390 * 2 + 0.01, "телефон: целые аппаратные пиксели");
ok(fitCanvas(412, 0, 2.625).S === Math.max(1, Math.floor((412 * 2.625) / 256)), "нулевая высота не схлопывает масштаб");
ok(fitCanvas(360, 1, 3).S === Math.max(1, Math.floor((360 * 3) / 256)), "крошечная высота не режет масштаб");
ok(fitCanvas(8, 0, 3).S === 1, "минимум ×1");

function night(): { meta: Meta; run: Run } {
  const meta = freshMeta();
  const run = beginNight(meta, 7);
  run.phase = "fight";
  run.queue = ["walker"];
  run.spawnCd = 99;
  return { meta, run };
}

{
  const { meta, run } = night();
  ok(placeTower(run, meta, 10, 1, "beam").ok, "луч ставится");
  const tower = run.towers[0]!;
  const spots = [5.15, 5.7, 6.3, 6.9];
  const enemies = spots.map((p) => {
    const e = spawnEnemy(run, "walker", p);
    e.maxHp = 1000;
    e.hp = 1000;
    return e;
  });
  const hits = beamTargets(run, tower, enemies[3]!);
  ok(hits.length === 3, `луч пробивает 3, не 4: ${hits.length}`);
  stepRun(run, meta, 1 / 60);
  const hurt = enemies.filter((e) => e.hp < 1000);
  ok(hurt.length === 3, `после выстрела ранены 3: ${hurt.length}`);
  tower.glyphs = ["focus"];
  for (const e of enemies) e.hp = 1000;
  tower.cooldown = 0;
  const only = beamTargets(run, tower, enemies[3]!);
  ok(only.length === 1 && only[0] === enemies[3], "фокус не пробивает");
  stepRun(run, meta, 1 / 60);
  const hurtF = enemies.filter((e) => e.hp < 999);
  ok(hurtF.length === 1 && enemies[3]!.hp < 990 && enemies[3]!.hp > 980, `фокус бьёт одну цель ×2.1 (${enemies.map((e) => e.hp.toFixed(1)).join(",")})`);
}

{
  const { meta, run } = night();
  ok(placeTower(run, meta, 10, 1, "frost").ok, "иней ставится");
  const e = spawnEnemy(run, "walker", progressAtCell(10, 2));
  e.maxHp = 500;
  e.hp = 500;
  let frozen = false;
  for (let i = 0; i < 80 && !frozen; i++) {
    stepRun(run, meta, 0.05);
    if (e.freezeUntil > run.time) frozen = true;
  }
  ok(frozen, `3 стака инея замораживают (жизнь стака ${FROST_STACK_LIFE} с)`);
  ok(e.stackLockUntil > e.freezeUntil, "после заморозки есть пауза");
}

{
  const { meta, run } = night();
  ok(placeTower(run, meta, 9, 2, "spike").ok, "шип ставится");
  const low = spawnEnemy(run, "walker", progressAtCell(10, 2));
  low.maxHp = 200;
  low.hp = 20;
  const tower = run.towers[0]!;
  ok(executeThreshold(run, tower) === 0.15, "порог шипа 15%");
  stepRun(run, meta, 1 / 60);
  ok(!low.alive, "шип казнит ниже порога, хотя удара не хватает на остаток");
  const high = spawnEnemy(run, "walker", progressAtCell(10, 2));
  high.maxHp = 200;
  high.hp = 40;
  tower.cooldown = 0;
  stepRun(run, meta, 1 / 60);
  ok(high.alive && high.hp < 40 && high.hp > 20, `выше порога шип только ранит (${high.hp})`);
}

{
  const { meta, run } = night();
  run.gold = 400;
  ok(placeTower(run, meta, 13, 1, "beam").ok && placeTower(run, meta, 12, 1, "beacon").ok && placeTower(run, meta, 14, 1, "beacon").ok, "маяки и луч стоят");
  const beam = run.towers.find((t) => t.kind === "beam")!;
  const a = run.towers.find((t) => t.x === 12)!;
  const b = run.towers.find((t) => t.x === 14)!;
  a.glyphs = ["haste"];
  const aura = auraFor(run.towers, beam);
  ok(aura && Math.abs(aura.rate - 0.32) < 1e-9, "два маяка не складываются, берётся лучший темп");
  ok(auraFor(run.towers, a) === null && auraFor(run.towers, b) === null, "маяк не бафает маяки");
  b.glyphs = ["bounty"];
  const aura2 = auraFor(run.towers, beam);
  ok(aura2 && aura2.gold && Math.abs(aura2.rate - 0.32) < 1e-9, "золото маяка не удваивает темп");
}

{
  const { meta, run } = night();
  for (const x of [10, 11, 12, 13, 14, 15]) {
    run.gold += 100;
    ok(placeTower(run, meta, x, 1, "beam").ok, `резонанс-площадка ${x}`);
  }
  const ids = run.towers.map((t) => t.id);
  const bonus = resonanceOf(run.towers, ids[0]!).bonus;
  ok(Math.abs(bonus - 0.4) < 1e-9, `потолок резонанса +40% (${bonus})`);
  ok(resonanceOf(run.towers, ids[1]!).bonus === 0.4, "каждая башня связки получает потолок");
  run.gold += 100;
  placeTower(run, meta, 4, 1, "beam");
  const lone = run.towers.find((t) => t.x === 4)!;
  ok(resonanceOf(run.towers, lone.id).bonus === 0, "одинокая башня без резонанса");
  const pair = resonanceOf(run.towers.filter((t) => t.x === 10 || t.x === 11), run.towers.find((t) => t.x === 10)!.id);
  ok(Math.abs(pair.bonus - 0.08) < 1e-9, "двое дают +8%");
}

{
  const { meta, run } = night();
  run.gold = 500;
  placeTower(run, meta, 10, 1, "frost");
  placeTower(run, meta, 11, 1, "mortar");
  const mortar = run.towers.find((t) => t.kind === "mortar")!;
  const frost = run.towers.find((t) => t.kind === "frost")!;
  ok(combosOf(run.towers, mortar.id).includes("glassice"), "иней рядом с осколком включает стеклолёд");
  ok(!combosOf(run.towers, frost.id).includes("glassice"), "эффект стеклолёда на осколке");
  mortar.x = 13;
  ok(!combosOf(run.towers, mortar.id).includes("glassice"), "через клетку сочетания нет");
  mortar.x = 11;
  mortar.y = 3;
  ok(!combosOf(run.towers, mortar.id).includes("glassice"), "диагональ не считается");
}

{
  const fresh = parseSave(null);
  ok(fresh.allowWrite && fresh.meta.sparks === 0 && fresh.meta.night === 1 && fresh.meta.run === null, "пустое сохранение");
  const bad = parseSave("{{");
  ok(!bad.allowWrite && bad.meta.v === 1 && bad.meta.sparks === 0, "битый json не роняет и не разрешает затирать ключ");
  const old = parseSave(JSON.stringify({ v: 0, sparks: 9 }));
  ok(!old.allowWrite && old.meta.sparks === 0, "чужая версия не портит прогресс в памяти");
  const meta = freshMeta();
  meta.sparks = 40;
  const run = beginNight(meta, 3);
  placeTower(run, meta, 10, 1, "beam");
  const again = parseSave(serializeSave(meta));
  ok(again.allowWrite && again.meta.sparks === 40 && again.meta.run?.towers.length === 1, "круг save/load");
  ok(bagMax(freshMeta()) === 12, "сумка 12");
  buyShop(meta, "discount", null);
  ok(meta.discount && meta.sparks === 25 && bagMax(meta) === 13, "покупка скидки и рост сумки");
}

ok(upgradeCost({ ...towerBlank("beam"), level: 1 } as never) === Math.round(40 * 1.55), "цена 2 уровня");
ok(LAWS.length === 15 && RUNES.length === 20 && SHOP.length === 9 && TOWERS.length === 7, "полнота списков");
ok(towerSpec("chain").shop === 40 && towerSpec("well").shop === 55, "цены открытия");

function towerBlank(kind: TowerKind) {
  return { id: 1, kind, x: 0, y: 0, level: 1, glyphs: [], awakened: false, runes: [], target: "first" as const, spent: 0, cooldown: 0, shots: 0 };
}
ok(shotDamage({ towers: [towerBlank("beam")], laws: [] } as never, towerBlank("beam")) === 6, "базовый урон луча");

const page = readFileSync(join(root, "src/pages/games/eternal-watch.astro"), "utf8");
const hub = readFileSync(join(root, "src/pages/games.astro"), "utf8");
const seo = readFileSync(join(root, "src/lib/seo.ts"), "utf8");
for (const piece of ["Вечная стража", "Начать ночь", "Лавка искр", "Ночь кончилась", "Новая ночь", "Рассвет"]) {
  ok(page.includes(piece), "текст страницы: " + piece);
}
ok(page.includes('href="/games"') && hub.includes('data-game-url="/games/eternal-watch"') && hub.includes("Вечная стража"), "хаб ведёт на игру");
ok(seo.includes('"/games/eternal-watch"'), "адрес в карте сайта");
const banned = ["Pixel Art Atlas", "Hugging Face", "Krea", "сюрприз"];
for (const file of [
  "src/pages/games/eternal-watch.astro",
  "src/scripts/eternal-watch/client.ts",
  "src/scripts/eternal-watch/logic.ts",
  "src/pages/games.astro",
  "src/lib/seo.ts",
]) {
  const text = readFileSync(join(root, file), "utf8");
  for (const word of banned) ok(!text.includes(word), `${file} без «${word}»`);
}

console.log(`\neternal-watch-test: ${passes} PASS, ${fails} FAIL`);
process.exit(fails ? 1 : 0);
