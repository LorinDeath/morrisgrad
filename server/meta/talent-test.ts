// Юнит-тесты деревьев талантов (без сети): уникальность деревьев, открытие навыков узлами, античит-проверки,
// взаимоисключение ключевых узлов, раскладка только из открытых, модификаторы навыков, переход со старого дерева.
// Запуск: esbuild server/meta/talent-test.ts --bundle --platform=node --outfile=/tmp/tt.js && node /tmp/tt.js
import { TALENTS, TALENT_BY_ID, TALENT_TIER_REQ, ACTIVE_NODE, ABILITIES_DEF, LEGACY_ABILITY, HERO_IDS } from "./shared";
import { newAccount, newHero, learnTalent, setLoadout, usableAbility, sanitizeTalents, heroEffective, talentPoints, silenceAbility, unlockedAbilities, type Hero } from "./profile";

let pass = 0, fail = 0;
const ok = (c: any, m: string) => { if (c) pass++; else fail++; console.log((c ? "PASS " : "FAIL ") + m); };
const base = { maxHp: 100, armor: 5, minAtk: 5, maxAtk: 8 };
const acc = () => { const a = newAccount(); a.flags.talents_open = true; return a; };
const hero = (cls: string, lvl: number): Hero => { const h = newHero(cls); h.lvl = lvl; return h; };
const learn = (a: any, h: Hero, cls: string, ...keys: string[]) => keys.map((k) => learnTalent(a, h, cls, `${cls}.${k}`));

// 1) уникальные деревья
const shapes = HERO_IDS.map((c) => TALENTS[c].map((t) => `${t.tier}:${t.col}:${t.kind}`).sort().join("|"));
ok(new Set(shapes).size === 4, "each class has its own tree layout (4 distinct shapes)");
const keySets = HERO_IDS.map((c) => TALENTS[c].map((t) => t.id.split(".")[1]).sort().join(","));
ok(new Set(keySets).size === 4, "node sets differ per class");
for (const c of HERO_IDS) {
  const T = TALENTS[c];
  const actives = ABILITIES_DEF.filter((d) => d.cls === c && !d.legacy).map((d) => d.id);
  ok(actives.every((id) => ACTIVE_NODE[id] && TALENT_BY_ID[ACTIVE_NODE[id]].kind === "active"), `${c}: every non-legacy active (${actives.join(", ")}) is a tree node`);
  ok(T.filter((t) => t.kind === "mod").every((t) => ABILITIES_DEF.find((d) => d.id === t.mod!.ability)?.cls === c), `${c}: mod nodes modify own class actives`);
  const ks = T.filter((t) => t.kind === "keystone");
  ok(ks.length >= 4 && ks.every((t) => t.excl && TALENT_BY_ID[t.excl].excl === t.id && TALENT_BY_ID[t.excl].tier === t.tier), `${c}: ${ks.length / 2} keystone pairs, symmetric exclusivity`);
  ok(T.every((t) => (t.req || []).every((r) => TALENT_BY_ID[r] && TALENT_BY_ID[r].tier < t.tier)), `${c}: prerequisites exist and sit on earlier tiers`);
  const cells = T.map((t) => `${t.tier}:${t.col}`);
  ok(new Set(cells).size === cells.length, `${c}: no overlapping nodes in layout`);
  const cap = T.reduce((s, t) => s + t.max, 0) - ks.length / 2;
  ok(cap > 29, `${c}: reachable ranks ${cap} > 29 points at max level (real choices)`);
}

// 2) навыки открываются деревом, не уровнем
{
  const a = acc(), h = hero("mage", 30);
  ok(usableAbility(a, h, "mage", "fireball"), "legacy fireball free at start");
  ok(!usableAbility(a, h, "mage", "frost_nova") && !usableAbility(a, h, "mage", "meteor"), "lvl 30 mage without talents: frost_nova/meteor locked (no unlock by level)");
  ok(!setLoadout(a, h, "mage", ["fireball", "frost_nova"]).ok, "loadout rejects locked active");
  ok(!learnTalent(a, h, "mage", "mage.frost_nova").ok, "active node needs its prerequisite (Белый мундир) and tier 2");
  learn(a, h, "mage", "coat", "coat", "coat");
  const r = learnTalent(a, h, "mage", "mage.frost_nova");
  ok(r.ok && usableAbility(a, h, "mage", "frost_nova") && h.loadout.includes("frost_nova"), "frost_nova unlocked by tree node, auto-slotted");
  ok(unlockedAbilities(h, "mage").join() === "fireball,frost_nova", "unlocked list = fireball, frost_nova");
  ok(setLoadout(a, h, "mage", ["frost_nova", "fireball"]).ok, "loadout with unlocked actives accepted");
  // позиционная раскладка Q/G/F: дыры, F, обмен, без дублей
  ok(setLoadout(a, h, "mage", ["", "", "fireball"]).ok && h.loadout.join() === ",,fireball", "навык на F при пустых Q/G");
  ok(heroEffective(a, h, "mage", { maxHp: 100, armor: 0, minAtk: 1, maxAtk: 2 }).abilities.find((x: any) => x.id === "fireball")?.slot === 2, "у навыка slot=2 (F) — панель берёт клавишу из slot");
  ok(setLoadout(a, h, "mage", ["fireball", "", "frost_nova"]).ok && h.loadout.join() === "fireball,,frost_nova", "Q + F, G пуст");
  ok(!setLoadout(a, h, "mage", ["fireball", "fireball"]).ok, "один навык в двух слотах — отклонено");
  ok(!setLoadout(a, h, "mage", ["", "", ""]).ok, "пустая раскладка — отклонено");
  const lo = hero("mage", 3); ok(!setLoadout(a, lo, "mage", ["", "", "fireball"]).ok, "F до 5 ур. — отклонено");
}
// 3) античит: очки, ярусы, пререквизиты, чужой класс, ключевой выбор, мусор
{
  const a = acc(), h = hero("warrior", 2);
  ok(learnTalent(a, h, "warrior", "warrior.vit").ok && talentPoints(h) === 0, "lvl 2 = 1 point spent");
  ok(!learnTalent(a, h, "warrior", "warrior.vit").ok, "no points → rejected");
  const h2 = hero("warrior", 30);
  ok(!learnTalent(a, h2, "warrior", "warrior.iron").ok, "tier 4 keystone rejected with 0 spent (tier gate)");
  ok(!learnTalent(a, h2, "warrior", "mage.split").ok, "other class node rejected");
  ok(!learnTalent(a, h2, "warrior", "warrior.__proto__").ok && !learnTalent(a, h2, "warrior", "constructor").ok, "prototype keys rejected");
  learn(a, h2, "warrior", "vit", "vit", "vit", "vit", "vit", "might", "might", "might", "might", "might", "ward", "ward");
  ok(Object.values(h2.talents).reduce((x, y) => x + y, 0) === 12, "12 points spent");
  ok(!learnTalent(a, h2, "warrior", "warrior.vit").ok, "max rank enforced");
  ok(learnTalent(a, h2, "warrior", "warrior.iron").ok, "tier 4 keystone after 12 points");
  const fr = learnTalent(a, h2, "warrior", "warrior.fury");
  ok(!fr.ok && /Ключевой выбор/.test((fr as any).err), "mutually exclusive keystone rejected");
  ok(!learnTalent(a, h2, "warrior", "warrior.axes").ok, "mod node without its active (Вихрь стали) rejected");
  const a0 = newAccount();
  ok(!learnTalent(a0, hero("warrior", 10), "warrior", "warrior.vit").ok, "story gate (Алзи) still applies");
}
// 4) модификаторы навыков реально меняют навык
{
  const a = acc(), h = hero("mage", 10);
  const before = heroEffective(a, h, "mage", base).abilities.find((x: any) => x.id === "fireball");
  learn(a, h, "mage", "ether", "ether", "ether", "split");
  const after = heroEffective(a, h, "mage", base).abilities.find((x: any) => x.id === "fireball");
  ok(!before.props.includes("t_split3") && after.props.includes("t_split3"), "Тройной шар: fireball gets t_split3 prop");
  const r = hero("rogue", 10);
  learn(a, r, "rogue", "ember", "ember", "ember", "venom");
  ok(heroEffective(a, r, "rogue", base).abilities[0].props.includes("t_poison"), "Ядовитые кинжалы: trick_strike gets t_poison");
  const w = hero("warrior", 30);
  learn(a, w, "warrior", "vit", "vit", "vit", "vit", "vit", "might", "might", "might", "might", "might", "ward", "ward", "ward", "ward", "ward", "fan", "crit", "crit", "crit", "echo");
  const bs = heroEffective(a, w, "warrior", base).abilities.find((x: any) => x.id === "backstab");
  ok(bs && bs.cd <= 12 * 0.75 + 0.01 && bs.props.includes("t_fan"), `Эхо клинков: backstab cd ${bs?.cd} (−25%) + Веер клинков`);
}
// 5) переход со старого общего дерева: возврат очков, раскладка без закрытых, монстр-навык сохраняется
{
  const h = hero("spearman", 12);
  h.talents = { "spearman.vit": 5, "spearman.might": 4, "spearman.focus": 2 };
  h.loadout = ["pierce", "spear_rain", "fly_blade_dash"];
  const n = sanitizeTalents(h, "spearman", 1);
  ok(n === 11 && Object.keys(h.talents).length === 0 && talentPoints(h) === 11, `old tree (ver 1) → full refund of ${n} points`);
  ok(h.loadout.join() === "pierce,,fly_blade_dash", "loadout keeps legacy + monster trophy skill, drops locked spear_rain (slot left empty, positions kept)");
  const g = hero("rogue", 30);
  learn(acc(), g, "rogue", "agile", "agile", "agile", "smoke_bomb");
  ok(sanitizeTalents(g, "rogue", 2) === 0 && g.talents["rogue.smoke_bomb"] === 1, "valid v2 tree kept as is");
  const t = hero("rogue", 30); t.talents = { "rogue.ghost": 1, "rogue.cuts": 1 };
  ok(sanitizeTalents(t, "rogue", 2) === 2 && !Object.keys(t.talents).length, "tampered tree (both keystones, no tier) → reset");
  const t2 = hero("rogue", 3); t2.talents = { "rogue.ember": 5 };
  ok(sanitizeTalents(t2, "rogue", 2) === 5, "tampered tree (more points than level) → reset");
  const t3 = hero("rogue", 30); t3.talents = { "rogue.venom": 1, "rogue.agile": 3 };
  ok(sanitizeTalents(t3, "rogue", 2) === 4, "tampered tree (missing prerequisite) → reset");
}
// 6) монстр-трофей и заглушение
{
  const a = acc(), h = hero("spearman", 10);
  ok(!silenceAbility(a, h, "spearman", "spear_rain", "ЗАГЛУШИТЬ").ok, "cannot silence a not-yet-unlocked active");
  ok(LEGACY_ABILITY.spearman === "pierce" && usableAbility(a, h, "spearman", "pierce"), "legacy pierce usable");
}
console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
