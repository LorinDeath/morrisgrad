import { Zone } from "./zone";
import { MOB_SKILLS, MOB_SKILLS_LIST } from "./mobSkills";
import { ABILITIES_DEF } from "./shared";
import { validatePatch, applyOverride } from "./overrides";
import { ZONE_MOBS } from "./defs";
let f = 0; const ok = (c: any, m: string) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) f++; };
const ids = ABILITIES_DEF.map((a) => a.id);
ok(ids.filter((i) => !/^bm[fi]_/.test(i)).length === 24, `героевых навыков ${ids.length}`); // + 5 огненных (bmf_*) и 5 ледяных (bmi_*) навыков артефактов — тот же список
ok(ids.filter((i) => i.startsWith("bmf_")).length === 5, "5 навыков артефактов в общем списке");
ok(ids.every((i) => MOB_SKILLS[i]), "все (24 + 5 артефактных) — в пуле навыков монстров");
ok(ids.every((i) => MOB_SKILLS[i].cd >= 6), "перезарядка у моба ≥ 6 с");
ok(typeof validatePatch("mob", Object.keys(ZONE_MOBS)[0], { skills: ["pierce", "leap_strike"] }) !== "string", "админка принимает навыки героя у моба");
const z: any = new Zone("arinar", [], [], { proc: true, seed: 3 });
const m = z.mobs.find((q: any) => !q.dead), d = { dmg: 10, size: "boss" };
for (const id of ids) {
  const p = { sid: "p", x: m.x + 120, y: m.y, alive: true, hp: 1e6, maxHp: 1e6 } as any, pl = new Map([["p", p]]);
  z.events = []; const nc = (z.casts || []).length; m.windup = 0;
  z.useSkill(m, d, id, p, pl, 0, 1);
  const tele = z.events.some((e: any) => String(e.k).startsWith("tele")) || m.windup > 0;
  ok(tele, `${id}: есть телеграф`);
  ok(z.events.some((e: any) => e.k === "mskill" && e.name), `${id}: имя навыка показано`);
}
{ const live = z.mobs.find((q: any) => !q.dead && !q.cursed), t = live.type;
  const pt = validatePatch("mob", t, { skills: ["meteor", "pierce"] }); applyOverride("mob", t, pt as any);
  const n = z.syncMobSkills(); ok(n > 0 && live.skills.join() === "meteor,pierce", `правка админки — сразу у живых мобов (${n}): ${live.skills}`);
  applyOverride("mob", t, null); z.syncMobSkills(); ok(!live.skills.includes("pierce"), "сброс — навыки как в коде"); }
console.log(f ? `FAILED ${f}` : "mob-hero-skills ok"); if (f) process.exit(1);
