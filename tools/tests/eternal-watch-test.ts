// «Вечная стража», вторая ночь. node --experimental-strip-types tools/tests/eternal-watch-test.ts
import { readFileSync } from "fs";
import { join } from "path";
import {
  MAPS, PATH_GAP, PLAY_MODES, RESEARCH, SAVE_KEY, TOWER_KINDS, TOWER_SPRITE, TOWERS, bonusesFor, buyNode, canBuy, chooseAbility, compile, debugSpawn,
  enemyHp, formatNumber, freshMeta, beginRun, callWave, dailyMutators, endRun, levelOf, loadMeta, makeDailyMap, mapById, mitigate,
  nodeById, openMode, placeStamp, placeTower, placeWall, researchCount, serializeMeta, simulate, stepRun, towerTip,
  upgradeTower, wavePlan,
} from "../../src/scripts/eternal-watch/logic.ts";

let fails = 0;
let passes = 0;
const ok = (c: unknown, m: string) => {
  if (c) passes++;
  else { fails++; console.log("FAIL " + m); }
};
const close = (a: number, b: number, m: string) => ok(Math.abs(a - b) < 1e-6, `${m}: ${a} vs ${b}`);

ok(MAPS.length === 24, "24 ночи");
ok(researchCount() >= 100, `узлов ${researchCount()}`);
ok(SAVE_KEY === "mg-eternal-watch-v2", "ключ сохранения");
const seen = new Set<string>();
for (const map of MAPS) {
  ok(!seen.has(map.id), "id " + map.id);
  seen.add(map.id);
  ok(map.spawns.length >= 1 && map.gates.length >= 1, map.id + " порталы");
  ok(map.ground.length === map.spawns.length, map.id + " тропы");
  let build = 0;
  const gates = new Set(map.gates.map((g) => g.x + "," + g.y));
  for (const route of map.ground) {
    const end = route.gate;
    ok(gates.has(end.x + "," + end.y), `${map.id} тропа до Врат`);
    ok(route.length >= 8, `${map.id} длина ${route.length}`);
  }
  for (let y = 0; y < map.rows; y++) for (let x = 0; x < map.cols; x++) {
    const ch = map.grid[y][x];
    if (".+*~^$".includes(ch)) build++;
    if ("=STUGH".includes(ch)) ok(true, "walk");
  }
  ok(build >= 8, `${map.id} площадок ${build}`);
}
for (const node of RESEARCH) {
  for (const r of node.requires) ok(!!nodeById(r.id), `${node.id} требует ${r.id}`);
  if (node.max > 1) {
    const a = node.cost(1);
    const b = node.cost(2);
    const grow = b.sparks > a.sparks || b.ash > a.ash || b.vein > a.vein;
    ok(grow, `${node.id} цена растёт`);
  }
}
const abyss = nodeById("night.abyss")!;
ok(abyss.max >= 40, "ночь без края длинная");
const c1 = abyss.cost(1);
const c8 = abyss.cost(8);
ok(c8.sparks > c1.sparks * 5 && c8.ash > c1.ash && c8.vein > c1.vein, "поздняя цена");

const meta = freshMeta();
ok(!canBuy(meta, "spark.dmg1").ok, "урон искры без закалки");
ok(buyNode(meta, "spark.dmg1").ok === false, "покупка закрыта");
meta.sparks = 100;
ok(buyNode(meta, "spark.root").ok, "закалка");
ok(meta.sparks === 94, "6 искр");
ok(buyNode(meta, "spark.dmg1").ok, "урон I");
ok((compile(meta).dmg.spark) === 0.06 + 0.08, "бонус урона");
ok(compile(meta).unlocked.muzzle === false, "жерло закрыто");
ok(buyNode(meta, "muzzle.root").ok, "открыть жерло");
ok(compile(meta).unlocked.muzzle, "жерло открыто");

close(mitigate(10, 0, 0, 0, false), 10, "без брони");
ok(mitigate(10, 0.3, 0, 0, false) < 10, "сопротивление режет");
ok(mitigate(10, -0.18, 0, 0, false) > 10, "уязвимость");
ok(mitigate(10, 0, 8, 0, false) < mitigate(10, 0, 8, 0.5, false), "пробитие");
close(mitigate(10, 0.2, 8, 0, true), 8, "яд мимо брони");
ok(mitigate(10, 0, 100, 0, false) >= 0.25, "крошка урона");

const fresh = freshMeta();
const night = beginRun(fresh, "spark-path", false, 2)!;
ok(placeTower(night, fresh, 6, 3, "spark").ok, "искра на плитке");
const flyer = debugSpawn(night, fresh, "flyer", 6)!;
const flyerHp = flyer.hp;
simulate(night, fresh, 1.2, 0.05);
ok(flyer.alive && flyer.hp === flyerHp, "искра не бьёт ночницу");
const air = beginRun(freshMeta(), "spark-path", false, 2)!;
const airMeta = freshMeta();
airMeta.nodes["bolt.root"] = 1;
ok(placeTower(air, airMeta, 6, 3, "bolt").ok, "стрела");
const flyer2 = debugSpawn(air, airMeta, "flyer", 6)!;
const flyer2Hp = flyer2.hp;
simulate(air, airMeta, 1.4, 0.05);
ok(!flyer2.alive || flyer2.hp < flyer2Hp, "стрела бьёт ночницу");

const sh = beginRun(freshMeta(), "spark-path", false, 3)!;
const sm = freshMeta();
sm.sparks = 200;
sm.nodes["halo.root"] = 1;
placeTower(sh, sm, 6, 3, "spark");
const shade = debugSpawn(sh, sm, "shade", 6)!;
const shadeHp = shade.hp;
simulate(sh, sm, 1.6, 0.05);
ok(shade.hp === shadeHp, "тень не в прицеле");
ok(placeTower(sh, sm, 7, 3, "halo").ok, "ореол");
simulate(sh, sm, 1.8, 0.05);
ok(shade.hp < shadeHp || !shade.alive, "ореол раскрывает тень");

const sp = beginRun(freshMeta(), "spark-path", false, 4)!;
const sm2 = freshMeta();
placeTower(sp, sm2, 6, 3, "spark");
const splitter = debugSpawn(sp, sm2, "splitter", 6)!;
splitter.hp = 8;
simulate(sp, sm2, 2, 0.05);
ok(!splitter.alive, "дробильщик пал");
ok(sp.kills >= 1, "убийство засчитано");
const mites = sp.enemies.filter((e) => e.kind === "mite").length + (splitter.fromSplit ? 0 : 0);
ok(sp.enemies.some((e) => e.kind === "mite") || sp.kills >= 3, "осколки или они уже добиты, убийств " + sp.kills);

const bossRun = beginRun(freshMeta(), "spark-path", false, 5)!;
const bm = freshMeta();
bm.nodes["needle.root"] = 1;
placeTower(bossRun, bm, 6, 3, "needle");
const boss = debugSpawn(bossRun, bm, "boss", 6)!;
simulate(bossRun, bm, 25, 0.1);
ok(boss.phased2, "фаза 2");
ok(bossRun.enemies.some((e) => e.kind === "walker") || boss.phased3 || !boss.alive, "призыв или добивание");

const vein = beginRun(freshMeta(), "veins", false, 1)!;
const vm = freshMeta();
vm.nodes["miner.root"] = 1;
ok(placeTower(vein, vm, 4, 3, "miner").ok, "жильник");
ok(!placeTower(vein, vm, 6, 4, "miner").ok, "жильник не на пустыре");
simulate(vein, vm, 7, 0.1);
ok(vein.mined >= 1, "руда " + vein.mined);

const xpRun = beginRun(freshMeta(), "spark-path", false, 8)!;
const xm = freshMeta();
xpRun.nextWaveAt = 1e9;
xpRun.queue = [];
placeTower(xpRun, xm, 6, 3, "spark");
for (let i = 0; i < 40; i++) {
  const e = debugSpawn(xpRun, xm, "walker", 6)!;
  e.hp = 4;
  e.maxHp = 4;
  e.freezeUntil = 1e9;
}
simulate(xpRun, xm, 40, 0.1);
const tower = xpRun.towers[0];
ok(levelOf(tower.xp) >= 4, "уровень " + levelOf(tower.xp));
ok(!!tower.offer && tower.offer.length >= 2 && tower.offer.length <= 3, "выбор " + tower.offer?.join(","));
if (tower.offer) ok(chooseAbility(xpRun, tower.id, tower.offer[0]).ok, "взять умение");
ok(tower.abilities.length === 1, "умение записано");

ok(placeStamp(xpRun, freshMeta(), 3, 3, "dmg").ok === false, "клеймо без древа");
xm.nodes["mod.stamp"] = 1;
ok(placeStamp(xpRun, xm, 3, 3, "dmg").ok, "клеймо");
ok(!placeStamp(xpRun, xm, 3, 3, "rate").ok, "плитка занята");

ok(upgradeTower(xpRun, xm, tower.id, "dmg").ok, "ранг");
ok(tower.ranks.dmg === 1, "ранг 1");

const plan = wavePlan(1, 1, false, 5);
ok(plan[0].kind === "walker" && plan.length === 1, "волна 1 только пехота");
const plan10 = wavePlan(10, 10, false, 12);
ok(plan10.some((g) => g.kind === "flyer") && plan10.some((g) => g.kind === "shield"), "волна 10 сложная");
ok(!wavePlan(3, 3, false, 8).some((g) => g.kind === "boss"), "босс не в середине");
ok(wavePlan(6, 8, false, 8).some((g) => g.kind === "boss"), "босс в конце");

const hps = [1, 5, 10, 15, 20, 25, 30].map((n) => enemyHp("walker", n, 1, true, 0));
for (let i = 1; i < hps.length; i++) {
  const ratio = hps[i] / hps[i - 1];
  ok(ratio > 1.4 && ratio < 2.2, `гладкий рост ${ratio}`);
}
ok(enemyHp("knight", 5, 4, false, 0.2) < enemyHp("knight", 5, 4, false, 0), "знание режет здоровье");

ok(formatNumber(12) === "12", "12");
ok(formatNumber(1200).startsWith("1.2") && formatNumber(1200).endsWith("K"), formatNumber(1200));
ok(formatNumber(1.35e6).includes("M"), formatNumber(1.35e6));

const round = serializeMeta(meta);
const back = loadMeta(round, null).meta;
ok(back.sparks === meta.sparks && back.nodes["muzzle.root"] === 1, "круг сохранения");
ok(loadMeta("{{{", null).meta.sparks === 0, "битый json");
ok(loadMeta("null", null).persist, "null не роняет");
const weird = loadMeta(JSON.stringify({ v: 9, sparks: 50 }), null);
ok(!weird.persist && weird.meta.sparks === 0, "чужая версия не затирается и не читается");
const v1 = loadMeta(null, JSON.stringify({ v: 1, sparks: 40 }));
ok(v1.meta.sparks === 20 && v1.meta.v1Bonus, "бонус v1");
const again = loadMeta(serializeMeta(v1.meta), JSON.stringify({ v: 1, sparks: 40 }));
ok(again.meta.sparks === 20, "бонус один раз");
ok(loadMeta(null, "nope").meta.v1Bonus, "битый v1 не роняет");

const tip = towerTip(freshMeta(), "spark");
ok(tip.includes("Урон") && tip.includes("Радиус") && tip.includes("Темп") && tip.includes("35"), "подсказка башни");
const locked = towerTip(freshMeta(), "needle");
ok(locked.includes("закрыта") && locked.includes("Урон"), "подсказка закрытой");

const root = join(import.meta.dirname, "../..");
const files = [
  "src/pages/games/eternal-watch.astro",
  "src/scripts/eternal-watch/client.ts",
  "src/scripts/eternal-watch/logic.ts",
  "docs/eternal-watch-v2-DESIGN.md",
];
const banned = ["pixel art atlas", "hugging face", "krea", "сюрприз"];
for (const file of files) {
  const text = readFileSync(join(root, file), "utf8").toLowerCase();
  for (const word of banned) ok(!text.includes(word), `${file} без «${word}»`);
}
const astro = readFileSync(join(root, "src/pages/games/eternal-watch.astro"), "utf8");
ok(astro.includes("minmax(42dvh, 1fr)"), "поле не схлопывается");
ok(astro.includes("100dvh"), "высота экрана");
ok(!astro.includes("flex: 0 0 auto"), "нет нулевой колонки v1");
const buttons = astro.match(/<button\b[^>]*>/g) ?? [];
ok(buttons.length > 0 && buttons.every((b) => b.includes("data-tip")), "кнопки страницы с подсказкой");
ok(mapById("finale")!.gates.length === 2, "финал с двумя вратами");
ok(MAPS.filter((m) => m.gates.length === 2).every((m) => m.ground.length >= 2), "двое врат — два портала");

const scripted = beginRun(freshMeta(), "spark-path", false, 1)!;
const smeta = freshMeta();
for (const [x, y] of [[9, 3], [7, 3], [6, 1], [5, 3]] as const) placeTower(scripted, smeta, x, y, "spark");
simulate(scripted, smeta, 100, 0.1);
ok(scripted.outcome === "win" && (scripted.reward?.stars ?? 0) >= 1, "первая ночь берётся");
const caller = beginRun(freshMeta(), "spark-path", false, 9)!;
caller.nextWaveAt = caller.time + 30;
ok(callWave(caller).ok && caller.nextWaveAt === caller.time, "вызов волны");

const spaced = beginRun(freshMeta(), "spark-path", false, 4)!;
simulate(spaced, freshMeta(), 5, 0.05);
const walkers = spaced.enemies.filter((e) => e.alive && e.kind === "walker").sort((a, b) => a.progress - b.progress);
ok(walkers.length >= 2, `пехота на тропе ${walkers.length}`);
for (let i = 1; i < walkers.length; i++) {
  ok(walkers[i].progress - walkers[i - 1].progress >= PATH_GAP * 0.9, `зазор ${walkers[i].progress - walkers[i - 1].progress}`);
}

ok(PLAY_MODES.length === 10, "10 режимов");
const modeIds = new Set(PLAY_MODES.map((m) => m.id));
ok(modeIds.size === 10, "id режимов уникальны");
for (const mode of PLAY_MODES) {
  ok(mode.name.length > 1 && mode.icon.startsWith("mode_"), mode.id + " имя и иконка");
  ok(mode.rules.includes("Древо") && mode.research.includes("Древо"), mode.id + " сказано про древо");
  ok(mode.summary.length > 8 && mode.score.length > 4, mode.id + " описание");
}
for (const kind of TOWER_KINDS) ok(TOWER_SPRITE[kind].startsWith("tower_"), "спрайт " + kind);

const oldSave = JSON.stringify({
  v: 2, sparks: 11, ash: 2, vein: 3, nodes: { "spark.root": 1 }, stars: { "spark-path": 2 },
  endlessBest: { "spark-path": 4 }, damageNumbers: false, v1Bonus: true, run: null,
});
const migrated = loadMeta(oldSave, null);
ok(migrated.persist && migrated.meta.sparks === 11 && migrated.meta.nodes["spark.root"] === 1, "старый сейв читается");
ok(migrated.meta.stars["spark-path"] === 2 && migrated.meta.endlessBest["spark-path"] === 4, "звёзды и рекорд на месте");
ok(migrated.meta.damageNumbers === false && migrated.meta.modeBest && migrated.meta.dailyBest, "новые поля пустые");
const packed = JSON.parse(serializeMeta(migrated.meta)) as { v: number; sparks: number };
ok(packed.v === 2 && packed.sparks === 11, "запись остаётся v2");

const blitz = openMode(freshMeta(), "blitz", 4)!;
ok(blitz.mode === "blitz" && mapById(blitz.mapId)!.spawns.length === 1, "блиц");
blitz.queue = [];
blitz.nextWaveAt = blitz.time;
stepRun(blitz, freshMeta(), 0.05);
ok(blitz.queue.length >= 2, "блиц выпустил очередь");
ok(blitz.queue[1].at - blitz.queue[0].at < 0.95, "блиц чаще обычного такта");

const parade = openMode(freshMeta(), "boss", 2)!;
parade.queue = [];
parade.nextWaveAt = parade.time;
stepRun(parade, freshMeta(), 0.05);
const paradeKinds = parade.queue.map((q) => q.kind).concat(parade.enemies.filter((e) => e.alive).map((e) => e.kind));
ok(paradeKinds.length >= 1 && paradeKinds.every((k) => k === "boss"), "парад только боссы: " + paradeKinds.join(","));

const five = openMode(freshMeta(), "five", 1)!;
const fiveMap = mapById(five.mapId)!;
let built = 0;
for (let y = 0; y < fiveMap.rows && built < 6; y++) for (let x = 0; x < fiveMap.cols && built < 6; x++) {
  if (placeTower(five, freshMeta(), x, y, "spark").ok) built++;
}
ok(built === 5, "пять башен, шестая не встала " + built);
ok(!placeTower(five, freshMeta(), 2, 2, "spark").ok, "лимит пяти");

const maze = openMode(freshMeta(), "maze", 3)!;
const mazeMap = mapById(maze.mapId)!;
const beforeLen = mazeMap.ground[0].length;
ok(placeWall(maze, freshMeta(), 8, 5).ok, "стена на прямой");
ok(mapById(maze.mapId)!.ground[0].length > beforeLen, "тропа обошла стену");
let sealed = false;
for (let y = 1; y < mazeMap.rows - 1; y++) {
  const res = placeWall(maze, freshMeta(), 4, y);
  if (!res.ok) sealed = true;
}
ok(sealed, "полный заслон запрещён");
const walker = debugSpawn(maze, freshMeta(), "walker", 0.2)!;
const progress0 = walker.progress;
simulate(maze, freshMeta(), 1.2, 0.1);
ok(walker.alive && walker.progress > progress0, "лабиринт ведёт тварь");

const fogMeta = freshMeta();
ok(bonusesFor(fogMeta, null).unlocked.halo === false, "ореол закрыт в кампании");
const fog = openMode(fogMeta, "fog", 1)!;
ok(bonusesFor(fogMeta, fog).unlocked.halo, "ореол открыт в тумане");
const fogMap = mapById(fog.mapId)!;
const spawn = fogMap.spawns[0];
let sparkCell: { x: number; y: number } | null = null;
let haloCell: { x: number; y: number } | null = null;
for (let y = 0; y < fogMap.rows; y++) for (let x = 0; x < fogMap.cols; x++) {
  const dx = x - spawn.x;
  const dy = y - spawn.y;
  if (!sparkCell && dx * dx + dy * dy <= 2 && placeTower(fog, fogMeta, x, y, "spark").ok) sparkCell = { x, y };
}
ok(!!sparkCell, "искра у портала");
const hidden = debugSpawn(fog, fogMeta, "walker", 0.4)!;
const hiddenHp = hidden.hp;
simulate(fog, fogMeta, 1.4, 0.05);
ok(hidden.alive && hidden.hp === hiddenHp, "туман прячет цель");
for (let y = 0; y < fogMap.rows && !haloCell; y++) for (let x = 0; x < fogMap.cols; x++) {
  if (Math.abs(x - spawn.x) + Math.abs(y - spawn.y) <= 2 && placeTower(fog, fogMeta, x, y, "halo").ok) { haloCell = { x, y }; break; }
}
ok(!!haloCell, "ореол встал");
simulate(fog, fogMeta, 1.2, 0.05);
ok(!hidden.alive || hidden.hp < hiddenHp, "ореол открывает туман");

const dual = openMode(freshMeta(), "dual", 1)!;
ok(mapById(dual.mapId)!.spawns.length === 2, "два портала");

const life = openMode(freshMeta(), "life", 1)!;
ok(life.hearts === 1 && life.maxHearts === 1, "одна жизнь");
const lifeLen = mapById(life.mapId)!.ground[0].length;
debugSpawn(life, freshMeta(), "walker", lifeLen - 0.05);
simulate(life, freshMeta(), 0.4, 0.05);
ok(life.outcome === "lose" && life.leaks >= 1, "один прорыв кончает ночь");

const day = "2026-11-10";
const dailyA = openMode(freshMeta(), "daily", 1, day)!;
const gridA = mapById(dailyA.mapId)!.grid.join("|");
const mutA = dailyA.mutators.join(",");
const dailyB = openMode(freshMeta(), "daily", 9, day)!;
ok(mapById(dailyB.mapId)!.grid.join("|") === gridA, "двор дня стабилен");
ok(dailyB.mutators.join(",") === mutA && dailyMutators(day).join(",") === mutA, "модификаторы дня стабильны");
ok(makeDailyMap(day).grid.join("|") !== makeDailyMap("2026-11-11").grid.join("|"), "другой день другой двор");
const rich = freshMeta();
rich.nodes["spark.root"] = 1;
rich.nodes["spark.dmg1"] = 5;
ok(bonusesFor(rich, dailyA).dmg.spark === 0 && bonusesFor(rich, dailyA).unlocked.needle, "в дне дня древо молчит, башни открыты");
ok(bonusesFor(rich, null).dmg.spark > 0, "в кампании древо живо");

const chaos = openMode(freshMeta(), "chaos", 5)!;
for (let i = 0; i < 40 && chaos.scheduled < 5 && chaos.outcome === "play"; i++) {
  chaos.queue = [];
  for (const e of chaos.enemies) e.alive = false;
  chaos.nextWaveAt = chaos.time;
  stepRun(chaos, freshMeta(), 0.05);
}
ok(chaos.mutators.length >= 1 && chaos.banner.length > 2, "хаос назвал модификатор " + chaos.banner);

const sandMeta = freshMeta();
sandMeta.sparks = 4;
const sand = openMode(sandMeta, "sandbox", 1)!;
ok(sand.gold >= 50000 && bonusesFor(sandMeta, sand).unlocked.beam && bonusesFor(sandMeta, sand).abFire, "песочница щедрая");
placeTower(sand, sandMeta, 3, 3, "spark");
stepRun(sand, sandMeta, 0.05);
ok(sand.gold >= 50000, "золото вернулось");
endRun(sand, sandMeta);
ok(sandMeta.sparks === 4 && (sandMeta.modeBest.sandbox ?? 0) === 0, "песочница без награды и рекорда");

const camp = beginRun(freshMeta(), "spark-path", false, 1)!;
ok(camp.mode === "campaign" && !placeWall(camp, freshMeta(), 3, 3).ok, "в кампании стен нет");

const files2 = [
  "src/pages/games/eternal-watch.astro",
  "src/scripts/eternal-watch/client.ts",
  "src/scripts/eternal-watch/logic.ts",
  "src/scripts/eternal-watch/modes.ts",
  "src/scripts/eternal-watch/draw.ts",
  "docs/eternal-watch-v2-DESIGN.md",
];
for (const file of files2) {
  const text = readFileSync(join(root, file), "utf8").toLowerCase();
  for (const word of banned) ok(!text.includes(word), `${file} без «${word}»`);
}

console.log(fails ? `FAIL ${fails}` : `ok ${passes}`);
process.exit(fails ? 1 : 0);
