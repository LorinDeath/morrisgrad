// Навык «Вампир-лайка» на экземпляре оружия: бросок сервера, кодекс, 4-й слот от надетого оружия
import { fixAccount, newAccount, newHero, rollRunSkill, weaponSkill, snapshot, addItem, heroEffective } from "./profile";
import { RUN_SKILLS, ITEM_BY_ID } from "./defs";
import { RS_SHAPES, shapeOf } from "./abilityShapes";
let ok = 0, bad = 0; const t = (n: string, c: any) => { c ? ok++ : (bad++, console.log("FAIL", n)); };
const w = Object.values(ITEM_BY_ID).find((i: any) => i.slot === "weapon")!.id;
const nw = Object.values(ITEM_BY_ID).find((i: any) => i.slot !== "weapon")!.id;
const a: any = fixAccount(newAccount() as any); a.hero = "warrior";
const iw: any = addItem(a, w, "test", "warrior"), inw: any = addItem(a, nw, "test", "warrior");
t("кодекс пуст", a.runSkills.length === 0);
t("не оружие — нет", rollRunSkill(a, inw, "boss", () => 0) === null && !inw.rs);
t("промах", rollRunSkill(a, iw, "mob", () => 0.5) === null && !iw.rs);
const r = rollRunSkill(a, iw, "mob", () => 0.001);
t("навык на экземпляре", !!r && iw.rs === r); t("в кодексе", a.runSkills.includes(r)); t("фича кодекса", !!a.disc.feats[`runskill:${r}`]);
t("повторно не перебросить", rollRunSkill(a, iw, "boss", () => 0) === null && iw.rs === r);
const h: any = newHero("warrior"); h.equip = {};
t("не надето — слота R нет", weaponSkill(a, h) === null);
h.equip.weapon = iw.uid; t("надето — слот R", weaponSkill(a, h) === r);
t("снимок героя несёт weaponSkill", snapshot(a, h, "warrior", { maxHp: 100, armor: 5, minAtk: 6, maxAtk: 9 }, true).weaponSkill === r);
delete h.equip.weapon; t("сняли — слота нет", weaponSkill(a, h) === null);
iw.rs = "hack"; h.equip.weapon = iw.uid; t("мусорный навык игнорируется", weaponSkill(a, h) === null);
a.runSkills.push("hack"); a.runSkillSel = "x"; fixAccount(a); t("чистка кодекса и старого выбора", !a.runSkills.includes("hack") && !("runSkillSel" in a));
t("форма в мире есть у всех навыков", RUN_SKILLS.every((x) => RS_SHAPES[x.id] && shapeOf("rs:" + x.id) === RS_SHAPES[x.id]));
let hits = 0; for (let i = 0; i < 20000; i++) { const x: any = { ...a, runSkills: [], disc: { items: {}, feats: {} } }; if (rollRunSkill(x, { uid: "u", id: w } as any, "mob")) hits++; }
t("шанс ~2%", hits > 250 && hits < 550);
console.log(`run-skill ${ok}/${ok + bad}`);
