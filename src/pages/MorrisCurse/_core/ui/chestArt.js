// 🎁 Рисунки сундуков наград (художник: /workspace/art/chests → tools/sync-chest-art.sh → src/assets/mc/rewardchest).
// Манифест — chests_atlas.json художника: листы, ключи анимаций, события (flash / lid_off / items_out / idle_start),
// якорь и треки вылета предметов. Всё грузится ЛЕНИВО (группа 'rchest' манифеста ресурсов) — только когда открыто окно 🎁.
// Нет файла/ключа — рисует процедурный запасной сундук (bchestFx.js), окно не ломается.
const JSON_G = import.meta.glob('../../../../assets/mc/rewardchest/chests_atlas.json', { import: 'default' });
const PNG_G = import.meta.glob('../../../../assets/mc/rewardchest/*.png', { query: '?url', import: 'default' });
const pngLoader = (name) => PNG_G[`../../../../assets/mc/rewardchest/${name}`];
let atlasP = null;
/** атлас художника или null */
export function loadAtlas() {
  if (!atlasP) { const f = Object.values(JSON_G)[0]; atlasP = f ? f().then((a) => (a && a.sheets && a.keys ? a : null)).catch(() => null) : Promise.resolve(null); }
  return atlasP;
}
const imgs = new Map();
/** картинка листа по имени файла → Promise<HTMLImageElement|null> */
export function loadImage(name) {
  if (imgs.has(name)) return imgs.get(name);
  const L = pngLoader(name);
  const p = !L ? Promise.resolve(null) : L().then((url) => new Promise((res) => { const im = new Image(); im.decoding = 'async'; im.onload = () => res(im); im.onerror = () => res(null); im.src = url; })).catch(() => null);
  imgs.set(name, p); return p;
}
const urls = new Map();
export async function imageUrl(name) { if (urls.has(name)) return urls.get(name); const L = pngLoader(name); const u = L ? await L().catch(() => null) : null; urls.set(name, u); return u; }
/** анимация открытия по ключу вида (common … cursed_mythic): { open, idle, sheet, img, items } или null */
export async function openAnim(art) {
  const A = await loadAtlas(); if (!A) return null;
  const open = A.keys[`chest_open_${art}`], idle = A.keys[`chest_idle_${art}`]; if (!open) return null;
  const sheet = A.sheets[open.sheet]; if (!sheet) return null;
  const img = await loadImage(sheet.image); if (!img) return null;
  return { open, idle, sheet, img, items: (A.items && A.items[art]) || [], anchor: open.anchor || [A.anchor?.x ?? 112, A.anchor?.y ?? 211], fps: open.fps || A.fps || 24 };
}
/** HTML иконки сундука из листа иконок (20/40 px; state: closed | open). urlMap — заранее загруженные url листов */
export function iconHtml(A, url, art, state, size, scale = 1) {
  const k = A?.keys?.[`chest_icon${size}_${art}_${state}`], sh = k && A.sheets[k.sheet];
  if (!k || !sh || !url) return '';
  const i = k.start, sx = (i % sh.cols) * sh.frameW, sy = Math.floor(i / sh.cols) * sh.frameH, W = sh.frameW * scale;
  return `<i class="bc-ico" style="width:${W}px;height:${sh.frameH * scale}px;background:url('${url}') -${sx * scale}px -${sy * scale}px / ${sh.cols * sh.frameW * scale}px ${sh.rows * sh.frameH * scale}px no-repeat"></i>`;
}
/** кадры анимации иконки (для «открылся» в списке) */
export function iconAnim(A, art, size) { const k = A?.keys?.[`chest_icon${size}_${art}_open_anim`]; return k ? { k, sh: A.sheets[k.sheet] } : null; }
