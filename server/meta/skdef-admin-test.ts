// 🛠 Конструктор навыков в админке: kind «skdef» — свои «skx_…» создаются/правятся/удаляются, регистрируются во всех реестрах,
// детали оружия видят их в списке навыков, пресеты (5 огня + 5 льда) не меняются без правки, ошибки — понятным текстом.
import { validatePatch, applyOverride, SCHEMA, TABLES } from "./overrides";
import { SK_DEFS, SK_PRESET_IDS } from "./skillCraft";
import { BP_SKILL_OPTS } from "./skillReg";
import { ABILITY_BY_ID, ABILITIES_DEF } from "./shared";
import { SKILL_REGISTRY } from "./rsAny";
import { MOB_SKILLS, MOB_SKILLS_LIST } from "./mobSkills";
import { SK_ELEM, BM_SKILLS } from "./blackArt";
import { castShape } from "./abilityShapes";
import { KINDS } from "./admin";
let fails = 0;
const ok = (c: any, m: string) => { if (!c) { fails++; console.log("FAIL", m); } else console.log("ok  ", m); };
const before = JSON.stringify(SK_PRESET_IDS.map((id) => SK_DEFS[id])), abBefore = JSON.stringify(BM_SKILLS);
ok(KINDS.includes("skdef" as any), "skdef в KINDS админки");
ok(TABLES.skdef === SK_DEFS && SK_PRESET_IDS.length === 30, "таблица = SK_DEFS, 30 пресетов (по 5 на 6 стихий)");
const F = SCHEMA.skdef.fields;
ok(F.filter((f) => f.t !== "hdr").every((f) => f.h || f.t === "text" || f.t === "ltext" || f.t === "bool" || f.path.startsWith("mods.") || ["slow", "dmg"].includes(f.path) || f.label), "у полей есть подписи");
ok(F.some((f) => f.path === "mods.3.ch") && F.some((f) => f.path === "path" && f.opts?.includes("homing")), "модификаторы 1–4 и траектории в схеме");
ok(F.filter((f) => f.h).length >= 50, "подсказки у большинства полей: " + F.filter((f) => f.h).length);
// новый
const id = "skx_test_fan";
let p: any = validatePatch("skdef", id, { form: "proj", elem: "ice", name: "Веер льда", icon: "❄", cd: 6, path: "sine", n: 7, spread: 60, pierce: 3, hitMul: 0.5, "mods.0.k": "dmg", "mods.0.op": "mul", "mods.0.v": 1.5, "mods.0.ms": 4000, "mods.0.on": "hit" });
ok(typeof p === "object", "правка нового навыка проходит: " + (typeof p === "string" ? p : ""));
ok(!SK_DEFS[id], "проверка не оставляет временный навык");
applyOverride("skdef", id, p);
const d: any = SK_DEFS[id];
ok(d && d.form === "proj" && d.elem === "ice" && d.n === 7 && d.mods["0"].op === "mul" && d.mods["0"].v === 1.5, "создан по шаблону + правка");
ok(ABILITY_BY_ID[id]?.name === "Веер льда" && ABILITY_BY_ID[id].cd === 6 && (ABILITY_BY_ID[id] as any).bm?.elem === "ice", "в ABILITY_BY_ID");
ok(ABILITIES_DEF.filter((a) => a.id === id).length === 1 && SKILL_REGISTRY[id] && MOB_SKILLS[id] && MOB_SKILLS_LIST.includes(id), "в ABILITIES_DEF / SKILL_REGISTRY / MOB_SKILLS");
ok(BP_SKILL_OPTS.includes(id) && SK_ELEM[id] === "ice", "в списке навыков деталей и SK_ELEM");
const bp = SCHEMA.bpart.fields.find((f) => f.path === "skill");
ok(bp?.opts?.includes(id), "поле «Навык части» видит свой навык");
// повторное применение — не дублирует
applyOverride("skdef", id, { ...p, n: 5 }); ok(SK_DEFS[id].n === 5 && ABILITIES_DEF.filter((a) => a.id === id).length === 1 && MOB_SKILLS_LIST.filter((x) => x === id).length === 1, "повторная правка без дублей");
// каст своего навыка (снаряды)
const shots: any[] = []; const evs: any[] = [];
castShape(id, { x: 0, y: 0, dx: 1, dy: 0, sid: "s", radiusMult: 1, props: [], zone: { mobsAround: () => [] }, hit: () => 0, ev: (e: any) => evs.push(e), later: () => {}, fire: (o: any) => shots.push(o), status: () => {}, buff: () => {}, move: () => {}, bounds: (x: number, y: number) => [x, y] } as any);
ok(shots.length === 5 && shots.every((s) => s.pth?.p === "sine" && s.max === 3 && s.t === id), "каст: 5 снарядов по синусоиде, пробивание 3");
// ошибки
ok(typeof validatePatch("skdef", "skx_bad", { form: "proj", hitMul: 0, boom: 0 }) === "string", "снаряд без урона — ошибка");
ok(typeof validatePatch("skdef", "skx_h", { form: "proj", path: "homing", turn: 0 }) === "string", "самонаведение без поворота — ошибка");
ok(typeof validatePatch("skdef", "nope_x", { form: "proj" }) === "string", "чужой id — нет такой сущности");
ok(typeof validatePatch("skdef", id, { n: 99 }) === "string", "вне диапазона — ошибка");
// удаление
applyOverride("skdef", id, null);
ok(!SK_DEFS[id] && !ABILITY_BY_ID[id] && !SKILL_REGISTRY[id] && !MOB_SKILLS[id] && !MOB_SKILLS_LIST.includes(id) && !BP_SKILL_OPTS.includes(id) && !ABILITIES_DEF.some((a) => a.id === id), "сброс = удаление отовсюду");
// пресет: правка и сброс возвращают прежнее
const pid = SK_PRESET_IDS[0]; const q: any = validatePatch("skdef", pid, { spd: 900 }); ok(typeof q === "object", "пресет правится");
applyOverride("skdef", pid, q); ok(SK_DEFS[pid].spd === 900, "пресет: правка применена");
applyOverride("skdef", pid, null);
ok(JSON.stringify(SK_PRESET_IDS.map((i) => SK_DEFS[i])) === before && JSON.stringify(BM_SKILLS) === abBefore, "пресеты и навыки артефактов — как были");
console.log(fails ? `FAILS ${fails}` : "ALL OK"); if (fails) process.exit(1);
