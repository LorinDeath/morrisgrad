import { rsInfo, rsOptions, isRs, rsCodexId } from "./rsAny";
import { MOB_SKILLS_LIST, mobSkillOptions } from "./mobSkills";
import { RUN_SKILLS, ABILITIES_DEF } from "./shared";
import { shapeOf } from "./abilityShapes";
import { validatePatch } from "./overrides";
import { Zone } from "./zone";
import { ITEMS, ZONE_MOBS } from "./defs";
let f = 0; const ok = (c: any, m: string) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) f++; };
const O = rsOptions();
ok(O.length === RUN_SKILLS.length + ABILITIES_DEF.length && new Set(O.map((o) => o.name + o.group)).size === O.length, `R: все навыки игры (${O.length})`);
ok(O.every((o) => /[а-яё]/i.test(o.name) && o.group), "R: русские названия и группы");
ok(rsInfo("ab:meteor")!.cd >= 8 && rsInfo("ab:meteor")!.castId === "meteor" && rsInfo("ab:meteor")!.power <= 1.5, "навык героя в слоте R: кд ≥ 8, общая форма, сила ≤ 1.5");
ok(rsInfo("fly_blades")!.castId === "rs:fly_blades" && rsCodexId("fly_blades") === "rs:fly_blades" && rsCodexId("ab:meteor") === "meteor", "id для каста и Кодекса");
ok(!isRs("ab:nope") && !isRs("zzz"), "мусор отклонён");
const w = (ITEMS as any[]).find((d) => d.slot === "weapon");
ok(typeof validatePatch("item", w.id, { rs: "ab:leap_strike" }) !== "string", "админка: предмету — навык героя");
ok(typeof validatePatch("weapon", "daggers", { rs: "ab:frost_nova" }) !== "string", "админка: типу оружия — навык героя");
for (const o of O) { const s: any = shapeOf(rsInfo(o.id)!.castId); if (!s?.k) ok(false, "нет формы у " + o.id); }
ok(true, "у каждого навыка R есть форма каста");
// монстры: весь пул
const M = mobSkillOptions();
ok(MOB_SKILLS_LIST.length === ABILITIES_DEF.length + RUN_SKILLS.length && M.every((o) => /[а-яё]/i.test(o.name)), `монстры: все навыки игры (${M.length}) с русскими названиями`);
ok(typeof validatePatch("mob", Object.keys(ZONE_MOBS)[0], { skills: ["rs:fly_blades", "rs:sun_beam", "meteor"] }) !== "string", "админка: мобу — навыки оружия R");
const z: any = new Zone("arinar", [], [], { proc: true, seed: 3 }); const m = z.mobs.find((q: any) => !q.dead);
for (const id of RUN_SKILLS.map((r) => "rs:" + r.id)) { const p = { sid: "p", x: m.x + 120, y: m.y, alive: true, hp: 1e6, maxHp: 1e6 } as any;
  z.events = []; m.windup = 0; z.useSkill(m, { dmg: 10, size: "l" }, id, p, new Map([["p", p]]), 0, 1);
  if (!(z.events.some((e: any) => String(e.k).startsWith("tele")) || m.windup > 0)) ok(false, "моб: нет телеграфа у " + id); }
ok(true, "моб применяет все навыки оружия R (телеграфы)");
{ const { SKILL_REGISTRY } = await import("./rsAny"); const { applyOverride } = await import("./overrides");
  const n = Object.keys(SKILL_REGISTRY).length; ok(n === ABILITIES_DEF.length + RUN_SKILLS.length, `админка «Навыки»: все навыки игры (${n})`);
  const v = validatePatch("skill", "rs:fly_blades", { cd: 14, power: 1.4 }); ok(typeof v !== "string", "навык оружия R редактируется");
  applyOverride("skill", "rs:fly_blades", v as any); ok(rsInfo("fly_blades")!.cd === 14 && rsInfo("fly_blades")!.power === 1.4, "правка кд/силы навыка R действует на каст");
  applyOverride("skill", "rs:fly_blades", null); ok(rsInfo("fly_blades")!.cd === 8, "сброс — как в коде"); }
console.log(f ? `FAILED ${f}` : "rs-any ok"); if (f) process.exit(1);
