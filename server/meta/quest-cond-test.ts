// Условия целей квестов + путаница «вариант-босс ≠ базовый босс» (Часовой Пустоты ≠ Безветрие) + личные узлы сбора.
import { goalMatch, bestiaryKey } from "./biomes";
import { validateConds, condFail, condLive, condText, objConds, type FightFacts } from "./questConds";
import { validateQuest } from "./admin";
import { setCustomQuests } from "./quests";
import { newAccount, questEvent } from "./profile";
import { mobHomes } from "./mobHome";
import { Zone } from "./zone";
import { GATHER_CFG } from "./gatherCfg";
import { ZONE_GEN } from "./zoneGen";
let f = 0; const ok = (c: any, m: string) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) f++; };

// --- 1. Безветрие / Часовой
ok(!goalMatch("moon_sentinel", "air_moon_sentinel") && !goalMatch("moon_sentinel", "stone_moon_sentinel"), "Часовой Пустоты / Железный Часовой ≠ Безветрие");
ok(goalMatch("moon_sentinel", "moon_sentinel") && goalMatch("air_moon_sentinel", "air_moon_sentinel"), "точное совпадение засчитывается");
ok(goalMatch("golem", "stone_golem"), "обычный вариант биома («Чугунный голем») по-прежнему засчитывается как базовый");
ok(!goalMatch("stone_golem", "golem"), "цель-вариант не засчитывается базовым мобом");
ok(bestiaryKey("air_moon_sentinel") === "air_moon_sentinel" && bestiaryKey("stone_golem") === "stone_golem" && bestiaryKey("") === null, "Бестиарий: у варианта и варианта-босса своя карточка (в базовую не пишутся)");
const homes = mobHomes("moon_sentinel"); ok(homes.length > 0 && homes.every((h) => !/Звёздная высь|Железные каменоломни/.test(h.region)), "места обитания Безветрия — без биомов Часовых: " + homes.map((h) => h.region).join("; "));

// --- 2. условия: проверка правки
ok(Array.isArray(validateConds([{ k: "no_ability" }, { k: "time", v: 90 }])), "валидные условия приняты");
ok(typeof validateConds([{ k: "no_ability" }, { k: "no_ability" }]) === "string", "повтор отклонён");
ok(typeof validateConds([{ k: "hp_min", v: 150 }]) === "string", "hp_min > 99 отклонён");
ok(typeof validateConds([{ k: "weapon", v: "laser" }]) === "string", "несуществующее оружие отклонено");
ok(typeof validateConds([{ k: "hack" }]) === "string", "неизвестное условие отклонено");
ok(condText({ k: "time", v: 60 }) === "быстрее 60 с" && objConds({ noAbilities: true })[0].k === "no_ability", "тексты условий + старый noAbilities");
const F = (o: Partial<FightFacts> = {}): FightFacts => ({ ability: false, dash: false, hit: false, minHpPct: 100, sec: 30, solo: true, wts: ["sword"], cls: "warrior", night: false, biome: null, ...o });
ok(condFail([{ k: "no_ability" }], F()) === null && condFail([{ k: "no_ability" }], F({ ability: true })) === "применён навык", "no_ability");
ok(!!condFail([{ k: "no_dash" }], F({ dash: true })) && !!condFail([{ k: "no_hit" }], F({ hit: true })), "no_dash / no_hit");
ok(!!condFail([{ k: "hp_min", v: 50 }], F({ minHpPct: 40 })) && !condFail([{ k: "hp_min", v: 50 }], F({ minHpPct: 60 })), "hp_min");
ok(!!condFail([{ k: "time", v: 20 }], F({ sec: 25 })) && !condFail([{ k: "time", v: 20 }], F({ sec: 19 })), "time");
ok(!!condFail([{ k: "solo" }], F({ solo: false })), "solo");
ok(!!condFail([{ k: "weapon", v: "sword" }], F({ wts: ["sword", "bow"] })) && !condFail([{ k: "weapon", v: "sword" }], F()), "weapon");
ok(!!condFail([{ k: "cls", v: "mage" }], F()) && !!condFail([{ k: "night" }], F()) && !condFail([{ k: "night" }], F({ night: true })), "cls / night");
ok(!!condFail([{ k: "biome", v: "air" }], F({ biome: "ice" })) && !condFail([{ k: "biome", v: "air" }], F({ biome: "air" })), "biome");
ok(condFail([{ k: "no_ability" }], null) !== null, "без фактов боя (забег) — не засчитывается");
ok(condLive([{ k: "hp_min", v: 50 }], "hit", 30) !== null && condLive([{ k: "hp_min", v: 50 }], "hit", 70) === null, "живой сигнал hp_min");

// --- 3. админка: квест с условиями
const base = { id: "c_cond", npc: "petr", title: "Опять безветрие", offer: ["a"], done: ["b"], rewards: { xp: 10 } };
const v: any = validateQuest({ ...base, objectives: [{ type: "kill_boss", mob: "moon_sentinel", text: "Убить", conds: [{ k: "no_ability" }, { k: "time", v: 120 }] }] });
ok(typeof v !== "string" && v.objectives[0].conds.length === 2, "квест с условиями сохраняется: " + JSON.stringify(v.objectives?.[0]?.conds));
ok(typeof validateQuest({ ...base, objectives: [{ type: "kill_boss", mob: "thin_wisp", text: "x" }] }) === "string", "kill_boss на не-боссе отклонён");
ok(typeof validateQuest({ ...base, objectives: [{ type: "kill", mob: "golem", count: 2, text: "x", conds: [{ k: "zzz" }] }] }) === "string", "плохое условие — ошибка сохранения");
const v2: any = validateQuest({ ...base, objectives: [{ type: "kill", mob: "golem", count: 2, text: "x" }] }); ok(typeof v2 !== "string" && !v2.objectives[0].conds, "без условий — поле не пишется");

// --- 4. засчитывание с условиями
setCustomQuests([v]);
const a: any = newAccount(); a.quests.active.c_cond = { p: [0] };
const fails: any[] = [];
questEvent(a, { type: "kill_boss", mob: "moon_sentinel", kind: "air_moon_sentinel", usedAbility: false, fight: F(), failed: fails });
ok(a.quests.active.c_cond.p[0] === 0, "убийство Часового Пустоты НЕ засчитано за Безветрие");
questEvent(a, { type: "kill_boss", mob: "moon_sentinel", kind: "moon_sentinel", usedAbility: true, fight: F({ ability: true }), failed: fails });
ok(a.quests.active.c_cond.p[0] === 0 && fails[0]?.reason === "применён навык", "Безветрие с навыком — не засчитано, причина: " + fails[0]?.reason);
questEvent(a, { type: "kill_boss", mob: "moon_sentinel", kind: "moon_sentinel", usedAbility: false, fight: F({ sec: 200 }), failed: fails });
ok(a.quests.active.c_cond.p[0] === 0 && /200/.test(fails[1]?.reason), "дольше лимита — не засчитано");
questEvent(a, { type: "kill_boss", mob: "moon_sentinel", kind: "moon_sentinel", usedAbility: false, fight: F({ sec: 60 }), failed: fails });
ok(a.quests.active.c_cond.p[0] === 1, "Безветрие без навыков за 60 с — засчитано (новая попытка после провала)");

// --- 5. личные узлы
const z = new Zone("arinar", [], [], { proc: true, seed: ZONE_GEN.seed });
const n = z.nodes.find((x) => x.res === "starsilver")!; const now = Date.now();
z.nodeTaken(n, "alice", now);
ok(z.nodeReadyAt(n, "alice") > now && z.nodeReadyAt(n, "bob") <= now, "личные узлы: собрал Алиса — Бобу узел доступен");
const st = z.state(n.x, n.y, [], 700, "alice"); const e = st.n.find((x: any) => x[0] === n.id);
ok(e && e[1] === 0 && e[2] > 0, "zone_state: узел у Алисы на восстановлении с секундами: " + JSON.stringify(e));
GATHER_CFG.personal = false; z.nodeTaken(n, "alice", now); ok(z.nodeReadyAt(n, "bob") > now, "личные выкл (админка) — общий таймер"); GATHER_CFG.personal = true;
const silver = z.nodes.filter((x) => x.res === "starsilver").length; ok(silver > 100, "звёздного серебра в Аринаре: " + silver);
console.log(f ? `FAILED ${f}` : "quest-cond ok"); if (f) process.exit(1);
