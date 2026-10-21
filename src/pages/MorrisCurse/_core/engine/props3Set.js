// Пропсы 32 (props3, Художник: 20 px арта на метр, кадров больше) — отдельный модуль, его грузит только propAtlas.js динамическим
// import(), когда выбраны «Текстуры: Новые (32)»: телефоны со «Старыми (16)» не скачивают ни атлас, ни листы.
import META from '../../../../assets/mc/props3/props32_atlas.json';
import p64 from '../../../../assets/mc/props3/props32_p64.png';
import p64g from '../../../../assets/mc/props3/props32_p64_glow.png';
import b128 from '../../../../assets/mc/props3/props32_b128.png';
import b128g from '../../../../assets/mc/props3/props32_b128_glow.png';
import x64 from '../../../../assets/mc/props3/props32_x64.png';
import x64g from '../../../../assets/mc/props3/props32_x64_glow.png';
export { META };
export const SRC = { p64, p64_glow: p64g, b128, b128_glow: b128g, x64, x64_glow: x64g };
