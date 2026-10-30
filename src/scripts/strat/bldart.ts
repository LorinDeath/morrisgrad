// Арт построек (buildings-v1 Художника): спрайты на доске, карточки/иконки в выборе стройки, слоты и рамки найма в окне
// столицы, баннеры городов (3-slice), стадии и сцена Великого чуда. Файлы — плоско в /strat/buildings/ (manifest.json рядом).
// Сопоставление id сервера → арт: quarry→quarry_r, sacredgrove→grove, lightningrod→rod; magetower — вариант расы;
// forge — bld_forge_lv2, если Кузня в городе стоит дважды; wonder — чудо своей расы (fire→eternal_fire, ice→permafrost,
// water→great_tide, stone→great_wall, nature→world_tree, lightning→storm_eye); observatory — заглушка 1×1 (аудит B1).
// Без арта (заглушки: рамка эпохи IV + значок): warhall, stronghold, mint, metropolis, observatory. arena/lighthouse пока не привязаны.
// ДОГАДКА: сервер не шлёт стадий стройки чуда — читаются защитно city.wonder{stage|prog|left,total} | city.wb | city.build{b:"wonder"}.
import { esc } from "./ui-kit";
import { ic } from "./icons";

export const BLD_DIR = "/strat/buildings/";
const RACE_LIST = ["fire", "ice", "water", "stone", "nature", "lightning"];
const SHARED = new Set(["barracks", "stable", "forge", "magetower", "library", "market", "granary", "wall", "watchtower", "warcouncil"]);
const RACE_B: Record<string, string> = { crucible: "crucible", glacier: "glacier", harbor: "harbor", quarry: "quarry_r", sacredgrove: "grove", lightningrod: "rod" };
export const WONDER_ART: Record<string, string> = { fire: "eternal_fire", ice: "permafrost", water: "great_tide", stone: "great_wall", nature: "world_tree", lightning: "storm_eye" };
/** Имена чудес рас (content-cfg WIP-сервера). */
/** Имена заглушек, которых нет в BUILD клиента (имена — догадка до правил). */
export const PH_NAME: Record<string, string> = { watchtower: "Сторожевая башня", warcouncil: "Военный совет", warhall: "Чертог войны", stronghold: "Несокрушимая твердыня", mint: "Монетный двор", metropolis: "Метрополия", observatory: "Обсерватория" };
export const WONDER_NAME: Record<string, string> = { fire: "Вечное пламя", ice: "Ледяной трон", water: "Великий маяк", stone: "Сердце горы", nature: "Древо мира", lightning: "Небесный шпиль" };
// Аудит B1: легендарная observatory — обычный слот 1×1 (256, якорь 128,234), wonder_observatory (2×2) для неё не годится → заглушка.
const BIG: Record<string, string> = {};
/** Легендарные постройки эпохи IV без арта: аккуратная заглушка (рамка era4_node_frame + значок), пока Художник не сдаст bld_*. */
export const PLACEHOLDER = ["warhall", "stronghold", "mint", "metropolis", "observatory"];
export const PH_ICON: Record<string, string> = { warhall: "sword", stronghold: "shield", mint: "gold", metropolis: "castle", observatory: "eye" };
export const E4_FRAME = "/strat/ui2/frames/era4_node_frame.png";
/** Якоря из manifest: постройка 256² → (128,234); чудо 512² → (256,476), занимает 2×2 клетки. */
export const ANCHOR = { b: { s: 256, x: 128, y: 234 }, w: { s: 512, x: 256, y: 476 } };

const wId = (b: string, race: string) => (b === "wonder" ? WONDER_ART[race] || "eternal_fire" : BIG[b] || null);
export const isBig = (b: string) => b === "wonder" || !!BIG[b];
export const hasArt = (b: string) => SHARED.has(b) || !!RACE_B[b] || isBig(b);
/** Спрайт на доску (null — заглушка). */
export function bSprite(b: string, race: string, o: { lv2?: boolean; stage?: number } = {}): string | null {
  const w = wId(b, race); if (w) return BLD_DIR + "wonder_" + w + (o.stage && o.stage < 4 ? "_build_" + Math.max(1, Math.min(3, o.stage)) : "") + ".png";
  if (b === "magetower" && RACE_LIST.includes(race)) return BLD_DIR + "bld_magetower_" + race + ".png";
  if (b === "forge" && o.lv2) return BLD_DIR + "bld_forge_lv2.png";
  if (SHARED.has(b)) return BLD_DIR + "bld_" + b + ".png";
  if (RACE_B[b]) return BLD_DIR + "bld_" + RACE_B[b] + ".png";
  return null;
}
/** Карточка 320×200 (непрозрачная) для выбора стройки; у чудес — сам спрайт чуда. */
export function bCard(b: string, race: string): string | null {
  const w = wId(b, race); if (w) return BLD_DIR + "wonder_" + w + ".png";
  if (SHARED.has(b)) return BLD_DIR + "bld_" + b + "_card.png";
  if (RACE_B[b]) return BLD_DIR + "bld_" + RACE_B[b] + "_card.png";
  return null;
}
export function bIcon64(b: string): string | null { if (SHARED.has(b)) return BLD_DIR + "bld_" + b + "_icon.png"; if (RACE_B[b]) return BLD_DIR + "bld_" + RACE_B[b] + "_icon.png"; return null; }
export const wonderScene = (race: string, b = "wonder") => BLD_DIR + "wonder_" + (wId(b, race) || "eternal_fire") + "_scene.png";
export const SLOT = { empty: BLD_DIR + "slot_empty.png", locked: BLD_DIR + "slot_locked.png" };
export const RECRUIT_FRAME = BLD_DIR + "recruit_card_frame.png";
export const bannerSrc = (race: string) => BLD_DIR + "city_banner_" + (RACE_LIST.includes(race) ? race : "fire") + ".png";

/** Стадия чуда в городе: 0 — нет, 1..3 — стройка, 4 — построено. */
export function wonderStage(ct: any): number {
  if ((ct?.bld || []).includes("wonder")) return 4;
  const w = ct?.wonder ?? ct?.wb ?? (ct?.build?.b === "wonder" ? ct.build : null); if (w == null || w === false) return 0;
  const st = (v: number) => Math.max(1, Math.min(3, v | 0));
  if (typeof w === "number") return w > 0 && w < 1 ? st(1 + w * 3) : st(w);
  if (w.done) return 4; if (w.stage != null) return w.stage >= 4 ? 4 : st(w.stage);
  const p = w.total ? 1 - (w.left ?? 0) / Math.max(1, w.total) : w.prog ?? 0; return st(1 + Math.min(0.999, p) * 3);
}

// ---------- кэш картинок для холста ----------
const cache = new Map<string, HTMLImageElement>();
export function bImg(src: string, onLoad?: () => void): HTMLImageElement | null {
  let im = cache.get(src); if (!im) { im = new Image(); cache.set(src, im); if (onLoad) im.onload = onLoad; im.src = src; }
  return im.complete && im.naturalWidth ? im : null;
}
/** Рисует спрайт с якорем: (ax, ay) — точка на экране, куда встаёт якорь; size — сторона кадра на экране. */
export function drawAnchored(ctx: CanvasRenderingContext2D, im: HTMLImageElement, ax: number, ay: number, size: number, big: boolean) {
  const A = big ? ANCHOR.w : ANCHOR.b, k = size / A.s; ctx.drawImage(im, ax - A.x * k, ay - A.y * k, size, size);
}
/** Баннер города 3-slice на холсте (cx — центр): L96 / середина 96..384 тянется / R96; имя — на середине. */
export function drawBanner(ctx: CanvasRenderingContext2D, race: string, name: string, cx: number, y: number, h: number, redraw?: () => void) {
  const im = bImg(bannerSrc(race), redraw); if (!im) return; const k = h / 96, cap = 96 * k;
  ctx.save(); ctx.font = `600 ${Math.round(h * 0.34)}px "Oswald", "Arial Narrow", sans-serif`; const tw = ctx.measureText(name).width;
  const mid = Math.max(h * 1.2, tw + h * 0.3), w = cap * 2 + mid, x = cx - w / 2;
  ctx.drawImage(im, 0, 0, 96, 96, x, y, cap, h); ctx.drawImage(im, 96, 0, 288, 96, x + cap, y, mid, h); ctx.drawImage(im, 384, 0, 96, 96, x + cap + mid, y, cap, h);
  ctx.fillStyle = "#f6ead0"; ctx.textBaseline = "middle"; ctx.shadowColor = "#000a"; ctx.shadowBlur = 2; ctx.fillText(name, x + cap + h * 0.04, y + h * 0.5); ctx.restore();
  return w;
}
/** HTML-баннер (CSS border-image 3-slice). */
export const bannerHtml = (race: string, name: string, cls = "") => `<span class="cbanner ${cls}" style="--bn:url('${bannerSrc(race)}')"><span>${esc(name)}</span></span>`;
/** Иконка постройки для чипов/строк: 64-px арт или SVG-заглушка. */
export function bIconHtml(b: string, fallbackIcon: string): string { const s = bIcon64(b); if (s) return `<img class="ic img bico" src="${s}" alt="">`;
  return PLACEHOLDER.includes(b) ? `<span class="e4fr ph" title="Арт в работе">${ic(PH_ICON[b] || fallbackIcon)}</span>` : ic(fallbackIcon); }

/** Всплывающее окно «Чудо построено»: сцена 1024×768, текст — в приглушённом центре 640×480. */
export function wonderPopup(o: { race: string; b?: string; title: string; city: string; who: string; eff: string; mine: boolean }): HTMLElement {
  document.getElementById("wonderpop")?.remove();
  const el = document.createElement("div"); el.id = "wonderpop"; el.className = "ovl wonderpop";
  el.innerHTML = `<div class="wp-scene" role="dialog" aria-modal="true" style="background-image:url('${wonderScene(o.race, o.b)}')">
    <div class="wp-txt"><small>${o.mine ? "Чудо построено" : "Соперник построил чудо"}</small><h3>${esc(o.title)}</h3>
      <p class="wp-who">${esc(o.who)} · ${esc(o.city)}</p><p class="wp-eff">${esc(o.eff)}</p>
      <button class="btn gold" data-x>${ic("check")}<span>${o.mine ? "Слава!" : "Понятно"}</span></button></div></div>`;
  const close = () => { el.classList.add("out"); setTimeout(() => el.remove(), 220); document.removeEventListener("keydown", key); };
  const key = (e: KeyboardEvent) => { if (e.key === "Escape" || e.key === "Enter") close(); };
  el.querySelector<HTMLElement>("[data-x]")!.onclick = close; el.onclick = (e) => { if (e.target === el) close(); }; document.addEventListener("keydown", key);
  document.body.appendChild(el); requestAnimationFrame(() => el.classList.add("in")); return el;
}
