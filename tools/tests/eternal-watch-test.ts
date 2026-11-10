// «Вечная стража», вторая ночь. node --experimental-strip-types tools/tests/eternal-watch-test.ts
import { readFileSync } from "fs";
import { join } from "path";
import {
  MAPS, PATH_GAP, RESEARCH, SAVE_KEY, TOWERS, buyNode, canBuy, chooseAbility, compile, debugSpawn,
  enemyHp, formatNumber, freshMeta, beginRun, callWave, levelOf, loadMeta, mapById, mitigate,
  nodeById, placeStamp, placeTower, researchCount, serializeMeta, simulate, towerTip,
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

console.log(fails ? `FAIL ${fails}` : `ok ${passes}`);
process.exit(fails ? 1 : 0);
