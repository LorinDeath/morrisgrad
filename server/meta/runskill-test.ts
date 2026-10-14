import { fixAccount, newAccount, rollRunSkill, snapshot } from "./profile";
import { RUN_SKILLS, ITEM_BY_ID } from "./defs";
let ok = 0, bad = 0; const t = (n: string, c: any) => { c ? ok++ : (bad++, console.log("FAIL", n)); };
const w = Object.values(ITEM_BY_ID).find((i: any) => i.slot === "weapon")!.id;
const nw = Object.values(ITEM_BY_ID).find((i: any) => i.slot !== "weapon")!.id;
const a: any = fixAccount(newAccount() as any);
t("пусто", a.runSkills.length === 0 && !a.runSkillSel);
t("не оружие", rollRunSkill(a, nw, "boss", () => 0) === null);
t("промах", rollRunSkill(a, w, "mob", () => 0.5) === null);
const r = rollRunSkill(a, w, "mob", () => 0.001); t("открыт", !!r && a.runSkills[0] === r && a.runSkillSel === r);
t("фича", !!a.disc.feats[`runskill:${r}`]);
for (let i = 0; i < 40; i++) rollRunSkill(a, w, "boss", () => 0.001);
t("без дублей и все", new Set(a.runSkills).size === a.runSkills.length && a.runSkills.length === RUN_SKILLS.length);
t("всё открыто → null", rollRunSkill(a, w, "boss", () => 0) === null);
a.runSkills.push("hack"); a.runSkillSel = "hack"; fixAccount(a); t("чистка мусора", !a.runSkills.includes("hack") && a.runSkillSel === null);
t("снимок", Array.isArray(snapshot(a, null, null, {}, true).account.runSkills));
let hits = 0; const b: any = fixAccount(newAccount() as any); for (let i = 0; i < 20000; i++) { const x: any = { ...b, runSkills: [], disc: { items: {}, feats: {} } }; if (rollRunSkill(x, w, "mob")) hits++; }
t("шанс ~2%", hits > 250 && hits < 550);
console.log(`run-skill ${ok}/${ok + bad}`);
