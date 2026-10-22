// bun meta/variant-copy-test.ts [prod-ovr.json] — копии трофеев вариантов: наследование правки базы, своя строка важнее,
// живое обновление при правке базы, статы по кривой соседей, заполнение строк D1 (не перезаписывает, идемпотентно).
import { existsSync, readFileSync } from "node:fs";
import { ITEM_BY_ID } from "./defs";
import { TRAITS } from "./overrides";
import { copyIds, copyBase } from "./variantCopy";
import { parseRows, seedPlan, seedSql, memDb, SEED_BY } from "./variantSeed";
import { libraryRows, dropRows } from "./library";
let pass = 0, fail = 0; const ok = (c: any, m: string) => { c ? pass++ : fail++; console.log((c ? "PASS " : "FAIL ") + m); };
const I: any = ITEM_BY_ID;
const B = "whisper_wisp_weapon", C = "ice_whisper_wisp_weapon";
ok(copyBase(C) === B && copyIds().length === 170, `копий в коде: ${copyIds().length}; ${C} ← ${B}`);
// синтетика: правка базы с навыком R и чертой; если дана прод-выгрузка — она
const file = process.argv[2] || "/workspace/mc-release-logs/prod-ovr-all.json";
const prod = existsSync(file) ? parseRows(JSON.parse(readFileSync(file, "utf8"))) : null;
const rows = prod || [{ kind: "item", id: B, data: JSON.stringify({ rs: "fire_spark", traits: [{ k: "burn", chance: 18, dpsPct: 11, dur: 2.5 }] }) }];
console.log(prod ? `вход: прод-выгрузка ${file} (${rows.length} строк)` : "вход: синтетика");
const { plan, store } = await seedPlan(rows);
const todo = plan.filter((x) => !x.exists), W = plan.filter((x) => x.slot === "weapon");
ok(todo.length === 170, `будет создано строк копий: ${todo.length}`);
ok(I[C].rs === "fire_spark" && plan.find((x) => x.id === C)?.data.rs === "fire_spark", `${C}: навык R базы (${I[C].rs})`);
ok(JSON.stringify(TRAITS.item[C]) === JSON.stringify(TRAITS.item[B]) && TRAITS.item[C]?.length, `${C}: черты базы`);
if (prod) { ok(W.length === 34 && W.every((x) => x.rs && x.rs === I[x.base].rs), `оружие: ${W.filter((x) => x.rs).length}/${W.length} с навыком R базы`);
  ok(plan.filter((x) => x.traits).length === 34 && plan.every((x) => JSON.stringify(TRAITS.item[x.id] || []) === JSON.stringify(TRAITS.item[x.base] || [])), `черты базы: ${plan.filter((x) => x.traits).length} копий`); }
ok(plan.every((x) => I[x.id].from && I[x.id].lvl === x.lvl && x.req === Math.max(1, Math.min(60, x.lvl + ((I[x.base].req || I[x.base].lvl) - I[x.base].lvl)))), "уровень копии — уровень моба-варианта, треб. — тот же сдвиг, что у базы");
const maxDev = Math.max(...plan.map((x) => Math.abs(x.dev)));
ok(maxDev <= 15, `статы копий в пределах ±15% от соседей (макс. ${maxDev.toFixed(1)}%)`);
ok(plan.every((x) => Object.keys(x.stats).filter((k) => !/^dmg|^armor$|^hp$/.test(k)).every((k) => k in x.baseStats)), "особые линии — только из профиля базы");
// библиотека D1: копии — в items и mob_drops
const lib = libraryRows(), dr = dropRows();
ok(copyIds().every((id) => lib.some((r: any) => (r.id ?? r[0]) === id)), `items: все 170 копий в библиотеке (${lib.length} строк)`);
ok(dr.some((r: any) => JSON.stringify(r).includes(C)), `mob_drops: копии в таблице дропа`);
// SQL: только вставки копий, ON CONFLICT DO NOTHING, базу не трогает
const sql = seedSql(plan, 1);
ok((sql.match(/ON CONFLICT\(kind, id\) DO NOTHING/g) || []).length === 170 && !/DO UPDATE|DELETE|UPDATE game_overrides/.test(sql), "SQL: 170 вставок без перезаписи");
ok(!plan.some((x) => sql.includes(`VALUES ('item', '${x.base}',`)), "SQL: базовые строки не трогает");
// повторный прогон после заполнения — 0; админ-правка копии сохраняется
const after = [...rows, ...todo.map((x) => ({ kind: "item", id: x.id, data: JSON.stringify(x.id === C ? { ...x.data, rs: "daggers" } : x.data) }))];
const p2 = (await seedPlan(after)).plan;
ok(p2.filter((x) => !x.exists).length === 0 && seedSql(p2).split("\n").filter((l) => /INSERT/.test(l)).length === 0, "повторный прогон: 0 новых строк (идемпотентно)");
ok(I[C].rs === "daggers", "своя строка копии важнее наследования");
// живое наследование: правка базы → копия без строки меняется; своя строка — нет; сброс — снова наследует
const s2 = new (store.constructor as any)(memDb(rows)); await s2.sync(true);
const r1 = await s2.save("t", "item", B, { ...JSON.parse(rows.find((r) => r.id === B)?.data || "{}"), rs: "daggers" });
ok(r1.ok && I[C].rs === "daggers" && r1.copies?.some((c: any) => c.id === C && c.inh), "правка базы сразу меняет копию (и уходит в ответ админки)");
const r2 = await s2.save("t", "item", C, { rs: "fire_spark", "stats.dmgMax": 99 });
ok(r2.ok && I[C].rs === "fire_spark" && I[C].stats.dmgMax === 99 && s2.copyOwn.has(C), "сохранение копии — своя строка");
await s2.save("t", "item", B, { ...JSON.parse(rows.find((r) => r.id === B)?.data || "{}"), rs: "split_shard" });
ok(I[C].rs === "fire_spark", "после своей строки правка базы копию не перетирает");
const cat = s2.catalog(), ce = cat.ent.item.find((e: any) => e.id === C), ce2 = cat.ent.item.find((e: any) => e.id === "ice_night_bat_armor");
ok(ce?.part === B && ce.inh === false && ce2?.inh === true && ce2.part === "night_bat_armor", "каталог: part/inh у копий");
const r3 = await s2.reset("t", "item", C);
ok(r3.ok && !s2.copyOwn.has(C) && I[C].rs === "split_shard", "сброс копии — снова наследует базу");
// раздельное сохранение (release: admin_save_sec): раздел копии — своя строка «<id>@<раздел>», прочие поля наследуются
if (typeof s2.saveSection === "function") {
  const OV: any = await import("./overrides"), map = OV.sectionMap("item"), K = "ice_night_bat_weapon", KB = "night_bat_weapon", sec = map["rs"];
  const r4 = await s2.saveSection("t", "item", K, sec, { rs: "fire_spark" });
  ok(r4.ok && I[K].rs === "fire_spark" && s2.copyOwn.has(K) && [...s2.db._st.ov.keys()].some((k: string) => k.endsWith(sec === OV.SEC_MAIN ? "\u0000" + K : K + "@" + sec)) && r4.copies?.some((c: any) => c.id === K && !c.inh), `раздел «${sec}» копии сохранён своей строкой`);
  const dm = I[K].stats.dmgMax, bRow = JSON.parse(rows.find((r) => r.id === KB)?.data || "{}");
  await s2.save("t", "item", KB, { ...bRow, "stats.dmgMax": Math.round((I[KB].stats.dmgMax || 10) * 2) });
  ok(I[K].rs === "fire_spark" && I[K].stats.dmgMax > dm, `после раздела: правка базы меняет унаследованный урон (${dm} → ${I[K].stats.dmgMax}), свой навык R остаётся`);
}
ok(s2.db._st.audit.length >= 4 && SEED_BY === "seed:variant-copies", "журнал правок пишется");
console.log(`\n${pass} PASS, ${fail} FAIL`); process.exit(fail ? 1 : 0);
