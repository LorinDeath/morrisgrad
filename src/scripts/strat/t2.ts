// terrain-v2 Художника (/strat/terrain/, мастер 256, small/ 128; mini_* и tile_lod_* без small).
// Ленивая подгрузка: нет файла/ещё грузится — null, вызывающий рисует прежнее (v1 или код). t2Ver растёт при подгрузке —
// ключ кэша пререндера рельефа. Белые маски (border_*, territory_fill, mark_move/hover, city_owned_mask) красятся умножением.
const BASE = "/strat/terrain/";
const NO_SMALL = /^(mini_|tile_lod_|minimap_frame)/;
const cache = new Map<string, HTMLImageElement | null>(), wait = new Map<string, HTMLImageElement>();
const off = typeof location !== "undefined" && new URLSearchParams(location.search).get("terrainArt") === "0";
export let t2Ver = 0;
let onLoad: (() => void) | null = null, deb = 0;
/** куда сообщать о подгрузке (перерисовать доску); вызовы склеиваются в один кадр */
export function t2OnLoad(f: () => void) { onLoad = f; }
function bump() { t2Ver++; if (!deb) deb = setTimeout(() => { deb = 0; onLoad?.(); }, 60) as any; }
/** картинка terrain-v2; px — экранный размер клетки в пикселях устройства (≤128 → small/) */
export function t2(name: string, px = 256): HTMLImageElement | null {
  if (off) return null;
  const small = px <= 128 && !NO_SMALL.test(name), key = (small ? "small/" : "") + name;
  const hit = cache.get(key); if (hit !== undefined) return hit || (small ? t2(name, 256) : null);
  if (!wait.has(key)) { const i = new Image(); i.decoding = "async"; wait.set(key, i);
    i.onload = () => { cache.set(key, i); wait.delete(key); bump(); };
    i.onerror = () => { cache.set(key, null); wait.delete(key); bump(); };
    i.src = BASE + key + ".png"; }
  // пока small грузится — мастер, если он уже есть
  return small ? cache.get(name) || null : null;
}
/** заранее запросить набор имён (чтобы пререндер рельефа не перерисовывался по одной картинке) */
export function t2Preload(names: string[], px = 256) { for (const n of names) t2(n, px); }
const tc = new Map<string, HTMLCanvasElement>();
/** белая маска → цвет владельца (умножение RGB, альфа маски сохраняется) */
export function t2Tint(name: string, col: string, px = 256): HTMLCanvasElement | null {
  const im = t2(name, px); if (!im) return null; const k = im.src + col, hit = tc.get(k); if (hit) return hit;
  const cv = document.createElement("canvas"); cv.width = im.naturalWidth; cv.height = im.naturalHeight; const x = cv.getContext("2d")!;
  x.drawImage(im, 0, 0); x.globalCompositeOperation = "multiply"; x.fillStyle = col; x.fillRect(0, 0, cv.width, cv.height);
  x.globalCompositeOperation = "destination-in"; x.drawImage(im, 0, 0); if (tc.size > 400) tc.clear(); tc.set(k, cv); return cv;
}
export const T2_RACES = ["fire", "ice", "lightning", "nature", "stone", "water"];
/** Экранные стороны по флагу переворота: возвращает смещение по карте для экранной стороны */
export const sideD = (flip: boolean) => { const d = flip ? -1 : 1; return { n: [0, -d], e: [d, 0], s: [0, d], w: [-d, 0] } as Record<"n" | "e" | "s" | "w", [number, number]>; };
/** Набор оверлеев по-«береговому»: стороны, где сосед «чужой», скруглённые и внутренние углы */
export function edgeSet(out: (dx: number, dy: number) => boolean, flip: boolean): { sides: string[]; corners: string[]; inner: string[] } {
  const D = sideD(flip), N = out(...D.n), E = out(...D.e), S = out(...D.s), W = out(...D.w);
  const sides: string[] = [], corners: string[] = [], inner: string[] = [];
  if (N) sides.push("n"); if (E) sides.push("e"); if (S) sides.push("s"); if (W) sides.push("w");
  const cor = (a: boolean, b: boolean, nm: string) => { if (a && b) corners.push(nm); };
  cor(N, E, "ne"); cor(N, W, "nw"); cor(S, E, "se"); cor(S, W, "sw");
  const dg = (a: boolean, b: boolean, d1: [number, number], d2: [number, number], nm: string) => { if (!a && !b && out(d1[0] + d2[0], d1[1] + d2[1])) inner.push(nm); };
  dg(N, E, D.n, D.e, "ne"); dg(N, W, D.n, D.w, "nw"); dg(S, E, D.s, D.e, "se"); dg(S, W, D.s, D.w, "sw");
  return { sides, corners, inner };
}
