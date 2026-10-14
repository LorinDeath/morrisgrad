// Навыки боссов/проклятых (вынесено из zone.ts — нужно и админ-панели на клиенте)
export const MOB_SKILLS: Record<string, { name: string; cd: number }> = {
  frost_nova: { name: "Ледяная звезда", cd: 9 }, meteor: { name: "Метеор", cd: 12 }, spear_rain: { name: "Дождь копий", cd: 10 },
  whirlwind: { name: "Вихрь", cd: 8 }, fly_blade_dash: { name: "Рывок клинка", cd: 7 }, shadow_step: { name: "Шаг тени", cd: 11 },
  fireball: { name: "Огненный шар", cd: 6 }, shield_wall: { name: "Стена щитов", cd: 15 }, smoke_bomb: { name: "Дымовая завеса", cd: 14 },
};
export const MOB_SKILLS_LIST = Object.keys(MOB_SKILLS);
