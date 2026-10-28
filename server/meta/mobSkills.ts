import { ABILITIES_DEF, RUN_SKILLS, HERO_NAMES } from "./shared";
// Навыки боссов/проклятых (вынесено из zone.ts — нужно и админ-панели на клиенте)
export const MOB_SKILLS: Record<string, { name: string; cd: number }> = {
  frost_nova: { name: "Ледяная звезда", cd: 9 }, meteor: { name: "Метеор", cd: 12 }, spear_rain: { name: "Дождь копий", cd: 10 },
  whirlwind: { name: "Вихрь", cd: 8 }, fly_blade_dash: { name: "Рывок клинка", cd: 7 }, shadow_step: { name: "Шаг тени", cd: 11 },
  fireball: { name: "Огненный шар", cd: 6 }, shield_wall: { name: "Стена щитов", cd: 15 }, smoke_bomb: { name: "Дымовая завеса", cd: 14 },
};
// Остальные навыки героев — тоже в пуле монстров/боссов (сервер кастует их по общей форме из abilityShapes:
// телеграф → удар по игрокам). Перезарядка — как у героя, но не меньше 6 с.
export const MOB_NATIVE = new Set(Object.keys(MOB_SKILLS).filter((k) => k !== "shield_wall")); // стена щитов — как у героя: ударная волна + защита
for (const a of ABILITIES_DEF) if (!MOB_SKILLS[a.id]) MOB_SKILLS[a.id] = { name: a.name, cd: Math.max(6, a.cd || 8) };
// и навыки оружия (R) — кастуются по форме RS_SHAPES (shapeOf("rs:<id>")), перезарядка 8 с
for (const r of RUN_SKILLS) MOB_SKILLS["rs:" + r.id] = { name: r.name, cd: 8 };
export const MOB_SKILLS_LIST = Object.keys(MOB_SKILLS);
/** Пул для админки «Навыки моба»: все навыки игры, русские названия, группы. */
export function mobSkillOptions(): { id: string; name: string; group: string }[] {
  const ab: any = Object.fromEntries(ABILITIES_DEF.map((a) => [a.id, a]));
  return MOB_SKILLS_LIST.map((id) => ({ id, name: MOB_SKILLS[id].name + (ab[id] && ab[id].cls !== "monster" && HERO_NAMES[ab[id].cls] ? ` (${HERO_NAMES[ab[id].cls]})` : ""),
    group: id.startsWith("rs:") ? "Оружие (R)" : ab[id]?.cls === "artifact" ? "Артефакты" : ab[id]?.cls === "monster" || !ab[id] ? "Монстры" : "Герои" }));
}
