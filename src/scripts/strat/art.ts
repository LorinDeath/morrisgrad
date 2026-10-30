// Арт «Партии Чёрных королей»: стиль — вариант C (жирная чистая линия, плоские заливки, ар-деко; чёрный/золото/слоновая кость/красный).
// Всё, что есть, перечислено в /strat/art/manifest.json (собирает tools/strat/sync_art.py). Чего нет или не загрузилось —
// клиент рисует заглушку (кружок с глифом). Поэтому новые наборы рас подключаются без правки кода.
export type Pose = "idle" | "attack" | "hit" | "death";
type Manifest = { cell: number; groundY: number; units: Record<string, Record<string, Partial<Record<Pose, string>>>>; tiles: Record<string, string>; fx: Record<string, string[]> };

const img = new Map<string, HTMLImageElement>(); // только успешно загруженные
let man: Manifest | null = null;
export let artReady = false;

function load(url: string, onDone: () => void) {
  const i = new Image(); i.decoding = "async";
  i.onload = () => { img.set(url, i); onDone(); };
  i.onerror = () => { console.warn("[strat] нет спрайта, заглушка:", url); onDone(); };
  i.src = url;
}
/** Грузит манифест и картинки; onUpdate — перерисовать, когда что-то подгрузилось. Никогда не бросает. */
export async function loadArt(onUpdate: () => void, base = "/strat/art/manifest.json") {
  try {
    const r = await fetch(base, { cache: "no-cache" }); if (!r.ok) throw new Error("HTTP " + r.status);
    man = await r.json();
  } catch (e) { console.warn("[strat] манифест арта недоступен — всё заглушками", e); man = null; artReady = true; onUpdate(); return; }
  const urls = new Set<string>();
  for (const r of Object.values(man!.units || {})) for (const k of Object.values(r)) for (const u of Object.values(k)) if (u) urls.add(u);
  for (const u of Object.values(man!.tiles || {})) urls.add(u);
  for (const l of Object.values(man!.fx || {})) for (const u of l) urls.add(u);
  let left = urls.size; if (!left) { artReady = true; onUpdate(); return; }
  for (const u of urls) load(u, () => { if (--left === 0) artReady = true; onUpdate(); });
}
const got = (u?: string) => (u ? img.get(u) || null : null);
/** Спрайт фигуры: нужная поза → idle → null (заглушка). */
export function unitSprite(race: string, kind: string, pose: Pose): HTMLImageElement | null {
  const k = man?.units?.[race]?.[kind]; if (!k) return null;
  return got(k[pose]) || got(k.idle);
}
export function tileSprite(race: string | null, light: boolean): HTMLImageElement | null {
  const t = man?.tiles || {}; const key = light ? "light" : "dark";
  return got(race ? t[race + ":" + key] : undefined) || got(t["common:" + key]);
}
/** Кадры эффекта удара для расы атакующего; нет своих — пусто (рисуется только всплывающее число). */
export function hitFx(race: string): HTMLImageElement[] {
  return (man?.fx?.[race] || []).map((u) => img.get(u)).filter(Boolean) as HTMLImageElement[];
}
export const groundRatio = () => (man ? man.groundY / man.cell : 240 / 256);
