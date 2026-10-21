// Свет 2.5D-мира (только отрисовка у клиента, на механику не влияет): админка «💡 Свет» (kind='light', id='main' в game_overrides),
// правка применяется живьём (meta_state.light → engine/pixColor.js setLightCfg). Все значения — множители в экранном пространстве:
// пиксель на экране = пиксель атласа × свет (тон зоны / день-ночь), поэтому свет не засвечивает и не обесцвечивает спрайты.
export const LIGHT_CFG = {
  ground: 0.84,     // яркость земли (тайлы), спрайты на ней — 1
  hero: 1,          // герои и облики (дополнительно к «Чёрный маг → Яркость спрайтов героев»)
  props: 1,         // одиночные пропсы: порталы, Алтарь, Сердце Обители
  glow: 1,          // свечение вихря портала и других *_glow одиночных пропсов
  pool: 1,          // световые пятна огней на земле (факелы, костры, фонари, порталы)
  halo: 1,          // ореолы огней и порталов
  haloBehind: true, // ореол — за спрайтом источника (виден вокруг, пиксели не засвечивает); выкл — как раньше, поверх
  shadow: 1,        // плотность теней-капель под героями, мобами и пропсами
};
const cl = (v: any, a: number, b: number, d: number) => { const n = Number(v); return Number.isFinite(n) ? Math.max(a, Math.min(b, n)) : d; };
export const lightClient = () => ({ ground: cl(LIGHT_CFG.ground, 0.2, 1.5, 0.84), hero: cl(LIGHT_CFG.hero, 0.3, 1.5, 1), props: cl(LIGHT_CFG.props, 0.3, 1.5, 1),
  glow: cl(LIGHT_CFG.glow, 0, 2, 1), pool: cl(LIGHT_CFG.pool, 0, 2, 1), halo: cl(LIGHT_CFG.halo, 0, 2, 1), haloBehind: LIGHT_CFG.haloBehind !== false, shadow: cl(LIGHT_CFG.shadow, 0, 1.5, 1) });
