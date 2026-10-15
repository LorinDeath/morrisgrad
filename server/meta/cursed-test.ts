// Проклятые вещи + дроп ×10 + вкладка «Проклятие».
// node_modules/.bin/esbuild server/meta/cursed-test.ts --bundle --platform=node --format=esm --outfile=/tmp/cu.mjs && node /tmp/cu.mjs
import { CURSE, cursedStats } from "./cursed";
import { newAccount, newHero, addItem, heroEffective, rollMonsterLoot, dropChance, equip, weaponCursed, cursedGlow, snapshot } from "./profile";
import { ITEM_BY_ID, ITEMS, MONSTER_LOOT, RESOURCES } from "./defs";
import { validatePatch, applyOverride, currentValues } from "./overrides";
import { itemCard } from "./library";
import { LootBags } from "./loot";
import { Roles } from "./roles";
let pass = 0, fail = 0; const ok = (c: any, m: string) => { c ? pass++ : fail++; console.log((c ? "PASS " : "FAIL ") + m); };
const W: any = (ITEMS as any[]).find((i) => i.slot === "weapon" && i.stats.dmgMin > 0 && (i.req || 1) <= 1) || (ITEMS as any[]).find((i) => i.slot === "weapon");
// 1) шанс дропа
const lootKey = Object.keys(MONSTER_LOOT).find((k) => MONSTER_LOOT[k].gear.some((g) => g.chance < 5) && MONSTER_LOOT[k].materials.length)!;
const L = MONSTER_LOOT[lootKey], g0 = L.gear.find((g) => g.chance < 5)!;
ok(Math.abs(dropChance(g0) - g0.chance * 10) < 1e-9, `экипировка ×10: ${g0.chance}% → ${dropChance(g0)}%`);
ok(dropChance({ item: g0.item, chance: 30 }) === 100, "кламп 100%");
const always = () => 0, never = () => 0.999999;
ok(Object.keys(rollMonsterLoot(lootKey, never).res).length === L.materials.filter((m) => m.chance >= 100).length, "материалы не умножаются (×10 их не касается)");
// независимые броски обычной/проклятой версии: rng стабы
const seq = (xs: number[]) => { let i = 0; return () => xs[i++ % xs.length]; };
const one = { ...MONSTER_LOOT[lootKey] }; (MONSTER_LOOT as any).__t = { ...one, gear: [{ item: g0.item, chance: 3 }], materials: [] };
// базовый 3% ×10 = 30%; моб mul=2 → обычная 60%; проклятая — 30% (без mul)
let r = rollMonsterLoot("__t", seq([0.5, 0.2]), 2, true); ok(r.items.includes(g0.item) && r.items.includes(g0.item + "@c"), "обычная (0.5<0.6) и проклятая (0.2<0.3) — обе");
r = rollMonsterLoot("__t", seq([0.5, 0.35]), 2, true); ok(r.items.length === 1 && r.items[0] === g0.item, "проклятая по БАЗОВОМУ шансу 30% (0.35 — нет), не 60%");
r = rollMonsterLoot("__t", seq([0.7, 0.1]), 2, true); ok(r.items.length === 1 && r.items[0] === g0.item + "@c", "броски независимы: нет обычной, есть проклятая");
r = rollMonsterLoot("__t", seq([0.1, 0.1]), 2, false); ok(!r.items.some((x) => x.endsWith("@c")), "не босс — без проклятых");
// 2) экземпляр, статы ×1.5 от базы с правками админки
const a = newAccount(); a.hero = "warrior"; const h: any = newHero("warrior"); h.lvl = 60;
const n = addItem(a, W.id, "t")!, c = addItem(a, W.id + "@c", "boss:x")!;
ok(!n.cursed && c.cursed === 1 && c.id === W.id, "проклятая — тот же id предмета + флаг экземпляра");
const base = { maxHp: 100, armor: 0, minAtk: 0, maxAtk: 0 };
equip(a, h, "warrior", n.uid); const en: any = heroEffective(a, h, "warrior", base);
equip(a, h, "warrior", c.uid); const ec: any = heroEffective(a, h, "warrior", base);
ok(ec.itemDmgMin === Math.round(W.stats.dmgMin * 1.5) && ec.itemDmgMax === Math.round(W.stats.dmgMax * 1.5), `урон ${W.stats.dmgMin}-${W.stats.dmgMax} → ${ec.itemDmgMin}-${ec.itemDmgMax}`);
ok(en.itemDmgMin === W.stats.dmgMin, "обычный экземпляр без изменений");
applyOverride("item", W.id, validatePatch("item", W.id, { "stats.dmgMin": 200, "stats.dmgMax": 300 }));
const ec2: any = heroEffective(a, h, "warrior", base);
ok(ec2.itemDmgMin === 300 && ec2.itemDmgMax === 450, "правка базы в админке → проклятая 300–450 автоматически");
ok(itemCard(W.id)!.cstats.dmgMin === 300, "карточка несёт cstats");
applyOverride("item", W.id, null);
ok(weaponCursed(a, h) && ec.weaponCursed === 1, "надетое проклятое оружие → R ×rsMult");
ok(cursedGlow(a, h).glow === 1 && ec.cursedGlow === 1, "свечение 1");
ok((snapshot(a, h, "warrior", base, true) as any).curse.tint === CURSE.tint, "клиент получает конфиг проклятия");
// 3) мешок: флаг только от сервера
const bags = new LootBags(); const b = bags.drop("w", 0, 0, "p", { items: [W.id + "@c", W.id], res: {} }, "boss:x", "boss", "x")!;
ok(b.entries[0].id === W.id && b.entries[0].c === 1 && !b.entries[1].c, "мешок: проклятая позиция помечена сервером");
ok(addItem(a, "nope@c") === null, "мусорный id с меткой отклонён");
// 4) вкладка «Проклятие»
ok(typeof validatePatch("curse", "main", { statMult: 2, tint: "#ff00aa", equipDropMult: 5 }) === "object", "правка проклятия валидна");
ok(typeof validatePatch("curse", "main", { tint: "red;x" }) === "string", "цвет — только #rrggbb");
ok(typeof validatePatch("curse", "main", { statMult: 0.5 }) === "string", "statMult ≥1");
applyOverride("curse", "main", validatePatch("curse", "main", { statMult: 2, equipDropMult: 5, rsMult: 3 }));
ok(cursedStats({ hp: 10 }).hp === 20 && dropChance({ item: g0.item, chance: 3 }) === 15 && CURSE.rsMult === 3, "правка применяется живьём (stat ×2, дроп ×5, R ×3)");
applyOverride("curse", "main", null); ok(CURSE.statMult === 1.5 && CURSE.equipDropMult === 10, "сброс — исходные");
ok(currentValues("curse", "main").tint === "#a855f7", "currentValues для панели");
const R = new Roles(null as any); (R as any).map.set("uid:m", "moderator"); (R as any).loaded = true; (R as any).loadedAt = Date.now();
ok(!R.canAdminWrite({ pkey: "uid:m", verified: true }, "curse"), "модератор не может писать «Проклятие»");
console.log(`cursed ${pass}/${pass + fail}`); process.exit(fail ? 1 : 0);
