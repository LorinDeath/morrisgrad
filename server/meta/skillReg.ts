// 🛠 КОНСТРУКТОР НАВЫКОВ: регистрация своих навыков «skx_…» в общих реестрах игры (сервер).
// Свой навык = данные SK_DEFS + объект навыка (копия пресета той же формы с именем/значком/КД/уроном из конструктора) в
// ABILITIES_DEF / ABILITY_BY_ID / SKILL_REGISTRY (герой с артефактом, «✨ Навыки» админки), MOB_SKILLS (навыки мобов) и
// список навыков деталей оружия (bpart.skill). Сброс правки = снятие отовсюду. Пресеты (5 огня + 5 льда) не трогаются.
import { SK_DEFS, SK_HOOK, CUSTOM_SK, skBlank, type SkDef } from "./skillCraft";
import { BM_SKILLS, BM_SKILL_IDS, BM_SHAPES, SK_ELEM } from "./blackArt";
import { ABILITIES_DEF, ABILITY_BY_ID } from "./shared";
import { SKILL_REGISTRY } from "./rsAny";
import { MOB_SKILLS, MOB_SKILLS_LIST } from "./mobSkills";

/** живой список навыков для поля «Навык части» (bpart.skill): пресеты + свои */
export const BP_SKILL_OPTS: string[] = ["", ...BM_SKILL_IDS];

export function skAbility(d: SkDef): any {
  const base: any = BM_SKILLS.find((a) => BM_SHAPES[a.id]?.k === d.form && a.bm?.elem === d.elem) || BM_SKILLS.find((a) => BM_SHAPES[a.id]?.k === d.form) || BM_SKILLS[0];
  const a = JSON.parse(JSON.stringify(base));
  Object.assign(a, { id: d.id, name: d.name, icon: d.icon, desc: d.desc, cd: d.cd, radiance: String(d.rad || "").split(",").map((s) => s.trim()).filter(Boolean) });
  a.bm = { ...a.bm, pct: d.pct, k: d.k, elem: d.elem };
  return a;
}
function del<T>(arr: T[], v: T) { const i = arr.indexOf(v); if (i >= 0) arr.splice(i, 1); }

SK_HOOK.reg = (d: SkDef) => {
  if (!CUSTOM_SK.test(d.id)) return;
  const a = skAbility(d), i = ABILITIES_DEF.findIndex((x) => x.id === d.id);
  if (i >= 0) ABILITIES_DEF[i] = a; else ABILITIES_DEF.push(a);
  ABILITY_BY_ID[d.id] = a; SKILL_REGISTRY[d.id] = a;
  MOB_SKILLS[d.id] = { name: d.name, cd: Math.max(6, d.cd || 8) }; if (!MOB_SKILLS_LIST.includes(d.id)) MOB_SKILLS_LIST.push(d.id);
  if (!BP_SKILL_OPTS.includes(d.id)) BP_SKILL_OPTS.push(d.id);
  SK_ELEM[d.id] = d.elem;
};
SK_HOOK.unreg = (id: string) => {
  if (!CUSTOM_SK.test(id)) return;
  const i = ABILITIES_DEF.findIndex((x) => x.id === id); if (i >= 0) ABILITIES_DEF.splice(i, 1);
  delete ABILITY_BY_ID[id]; delete SKILL_REGISTRY[id]; delete MOB_SKILLS[id]; del(MOB_SKILLS_LIST, id); del(BP_SKILL_OPTS, id); delete SK_ELEM[id];
};
/** новый свой навык по шаблону пустой формы (дублирование в админке присылает все поля источника) */
export function skMake(id: string, p: any): SkDef { return skBlank(id, p?.form, p?.elem); }
