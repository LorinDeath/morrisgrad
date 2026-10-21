// Пол, кромка, парапет и декали арены забега 32 px (Художник, arena_32) — отдельный модуль: его грузит survivors/arena32.js
// динамическим import() только при arena3 (админка «🖼 Графика», по умолчанию выкл), поэтому обычная арена не тянет ни атлас, ни листы.
import META from '../../../../assets/mc/arena32/arena32_atlas.json';
import floor from '../../../../assets/mc/arena32/arena32_floor.png';
import floorG from '../../../../assets/mc/arena32/arena32_floor_glow.png';
import wall from '../../../../assets/mc/arena32/arena32_wall.png';
import decal from '../../../../assets/mc/arena32/arena32_decal.png';
import decalG from '../../../../assets/mc/arena32/arena32_decal_glow.png';
export { META };
export const SRC = { floor, floor_glow: floorG, wall, decal, decal_glow: decalG };
