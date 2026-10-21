// Рельеф: непроходимые жидкости (вода, глубокая вода, лава) для героев и ходячих мобов.
// Админка «🌊 Рельеф» (kind='terrain', id='main' в game_overrides) — правка применяется живьём; клиент получает
// terrainClient() в meta_state и предсказывает так же (общий модуль liquid.ts).
export const TERRAIN_CFG = {
  waterBlock: true,   // вода/глубокая вода непроходимы (берега, кромки и мостки — проходимы)
  lavaBlock: true,    // лава непроходима
  edge: 8,            // px: насколько тело может «зайти» на клетку жидкости со стороны суши (берег нарисован внутри клетки)
};
export const terrainClient = () => ({ waterBlock: TERRAIN_CFG.waterBlock !== false, lavaBlock: TERRAIN_CFG.lavaBlock !== false,
  edge: Math.max(0, Math.min(16, Math.round(Number(TERRAIN_CFG.edge) || 0))) });
