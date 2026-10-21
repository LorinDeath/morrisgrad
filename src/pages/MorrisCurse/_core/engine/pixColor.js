// Цветовой конвейер пиксель-арта (Three.js r128, renderer.outputEncoding = sRGB) — ОДНО правило для всех спрайтов и тайлов:
//   на экране пиксель = пиксель атласа × свет, где «свет» (тон зоны, яркость, день/ночь) — множитель в экранном (sRGB) пространстве.
//
// Почему так. Встроенные материалы three (SpriteMaterial, MeshBasicMaterial…) в конце шейдера кодируют цвет linear → sRGB.
// PNG/канвасы атласов уже в sRGB; без пометки encoding = sRGBEncoding three считает их линейными, и кодирование применяется
// к ним второй раз: тёмные/средние тона поднимаются (0.25 → 0.54), цвет теряет насыщенность — «засвет» (портал «Аринар»,
// герои, алтарь, земля). Свой шейдер SpriteBatch (мобы, NPC, пропсы чанков) кодирование не делает и всегда был верным —
// поэтому рядом стояли «правильный» тёмный обелиск и бледный портал. Проверка 'colorSpace' in tex — API r152+, в r128 её нет.
// Плюс ACES-тонмаппинг рендерера на MeshBasicMaterial земли (toneMapped по умолчанию true) дополнительно сдвигал оттенки.
//
// Правило: текстуру пиксель-арта для встроенного материала помечаем pixTex(), материал — pixMat() (без тонмаппинга),
// а множители цвета задаём setDisplayRGB() (экранное значение → линейное для шейдера). Тогда decode → ×свет → encode = как в атласе.
// Свет (ореолы и пятна огней) — аддитивно ВОКРУГ спрайта и на земле, но не поверх его пикселей (atmosphere.js: halo за спрайтом).
// День/ночь и прочий общий свет — через GRADE (atmosphere.js) и LIGHT ниже: это множители, они не «высветляют» пиксель в белый.

/** Настройки света (админка «💡 Свет», meta_state.light → setLightCfg). Все — множители в экранном пространстве. */
export const LIGHT = {
  ground: 0.84,     // яркость земли (тайлы) относительно атласа; спрайты на ней — 1
  hero: 1,          // доп. множитель героев/обликов (с BLK_FX.heroLight из «Чёрного мага»)
  props: 1,         // одиночные пропсы-спрайты (порталы, алтарь, сердце Обители)
  glow: 1,          // свечение *_glow у одиночных пропсов (вихрь портала)
  pool: 1,          // сила световых пятен огней на земле (× прозрачность 0.45)
  halo: 1,          // сила ореолов у огней/порталов (× 0.8)
  haloBehind: true, // ореол рисуется ЗА спрайтом источника (виден вокруг него, не засвечивает его пиксели)
  shadow: 1,        // плотность теней-капель
};
const LIM = { ground: [0.2, 1.5], hero: [0.3, 1.5], props: [0.3, 1.5], glow: [0, 2], pool: [0, 2], halo: [0, 2], shadow: [0, 1.5] };
const subs = new Set();
/** подписка на смену настроек (материалы, которые нужно перекрасить) */
export function onLight(fn) { subs.add(fn); return () => subs.delete(fn); }
export function setLightCfg(c) {
  if (!c || typeof c !== 'object') return;
  for (const [k, [a, b]] of Object.entries(LIM)) if (c[k] != null && Number.isFinite(Number(c[k]))) LIGHT[k] = Math.max(a, Math.min(b, Number(c[k])));
  if (c.haloBehind != null) LIGHT.haloBehind = !!c.haloBehind;
  for (const f of subs) { try { f(LIGHT); } catch (e) { console.warn('[light]', e); } }
}

/** текстура пиксель-арта (PNG/канвас в sRGB) для встроенного материала three: декодировать при чтении */
export function pixTex(THREE, t) {
  if (!t) return t;
  if ('colorSpace' in t && THREE.SRGBColorSpace) t.colorSpace = THREE.SRGBColorSpace; // r152+
  else if (THREE.sRGBEncoding) t.encoding = THREE.sRGBEncoding;                       // r128 (сайт)
  return t;
}
/** встроенный материал пиксель-арта: без тонмаппинга (ACES искажает палитру) */
export function pixMat(m) { if (m) m.toneMapped = false; return m; }
/** color ← экранный множитель (r, g, b) в линейном виде: decode(пиксель) × lin(множитель) → encode = пиксель × множитель */
export function setDisplayRGB(color, r, g = r, b = r) {
  color.setRGB(r, g, b);
  if (color.convertSRGBToLinear) color.convertSRGBToLinear();
  return color;
}
/** то же из hex (#rrggbb / число) — цвета, подобранные «на глаз» в экранном пространстве */
export function setDisplayHex(color, hex, k = 1) {
  color.set(hex); return setDisplayRGB(color, color.r * k, color.g * k, color.b * k);
}
