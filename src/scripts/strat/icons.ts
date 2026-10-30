// Иконки интерфейса «Партии Чёрных королей» — один SVG-спрайт в стиле C (жирная чёрная линия, плоские золото/кость/красный).
// Заменяемые: Художник присылает свои — меняем <symbol> здесь (или путь на PNG в ICON_IMG), разметка панелей не меняется.
const K = "#1a1420", G = "#e0b04a", G2 = "#f3d27a", I = "#f4ead2", R = "#b3261e";
const s = (body: string) => `<g stroke="${K}" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round">${body}</g>`;
export const ICONS: Record<string, string> = {
  chat: s(`<path d="M3.5 5h17v11H10l-4.5 4v-4h-2z" fill="${I}"/><path d="M7.5 9.5h9M7.5 12.5h6" fill="none"/>`),
  mute: s(`<path d="M4 9.5h4l5-4.5v14l-5-4.5H4z" fill="${I}"/><path d="M16 9l5 6M21 9l-5 6" fill="none" stroke="${R}" stroke-width="2.2"/>`),
  ult: s(`<path d="M12 1.5l2.4 6.3 6.6-1.9-3.9 5.6 4.9 4.6-6.7.3L12 22.5l-3.3-6.1-6.7-.3 4.9-4.6L3 5.9l6.6 1.9z" fill="${R}"/><path d="M12 7l1.3 3.2 3.2.3-2.4 2.2.8 3.3L12 14.3 9.1 16l.8-3.3-2.4-2.2 3.2-.3z" fill="${G2}"/>`),
  zap: s(`<path d="M13.5 2L5 13.5h6L9.5 22 19 9.5h-6.2z" fill="${G}"/>`),
  clock: s(`<circle cx="12" cy="13" r="8.5" fill="${I}"/><path d="M12 8.5V13l3 2" fill="none" stroke-width="2"/><path d="M9.5 2.5h5" fill="none" stroke-width="2"/>`),
  chevron: s(`<path d="M9 5l7 7-7 7" fill="none" stroke-width="2.4"/>`),
  play: s(`<path d="M7 4.5l12 7.5-12 7.5z" fill="${G}"/>`),
  pause: s(`<path d="M6.5 4.5h4v15h-4zM13.5 4.5h4v15h-4z" fill="${G}"/>`),
  stepb: s(`<path d="M18 4.5L8 12l10 7.5z" fill="${G}"/><path d="M5.5 4.5v15" fill="none" stroke-width="2.6"/>`),
  stepf: s(`<path d="M6 4.5L16 12 6 19.5z" fill="${G}"/><path d="M18.5 4.5v15" fill="none" stroke-width="2.6"/>`),
  first: s(`<path d="M20 5l-7 7 7 7zM12 5l-7 7 7 7z" fill="${G}"/>`),
  last: s(`<path d="M4 5l7 7-7 7zM12 5l7 7-7 7z" fill="${G}"/>`),
  save: s(`<path d="M4 3.5h13l3 3v14H4z" fill="${I}"/><path d="M7.5 3.5h8v5h-8z" fill="${G}"/><rect x="7" y="13" width="10" height="7.5" fill="${G2}"/>`),
  hist: s(`<path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3" fill="none" stroke-width="2.2"/><path d="M3 4v4.5h4.5" fill="none" stroke-width="2.2"/><path d="M12 8v4.5l3 2" fill="none" stroke-width="2"/>`),
  warn: s(`<path d="M12 3l10 17.5H2z" fill="${G}"/><path d="M12 9.5v5" fill="none" stroke-width="2.4"/><circle cx="12" cy="17.3" r=".6" fill="${K}"/>`),
  gold: s(`<circle cx="12" cy="12" r="9.5" fill="${G}"/><circle cx="12" cy="12" r="6.6" fill="${G2}"/><path d="M8.6 14.5h6.8l.8-5-2.6 2-1.6-3-1.6 3-2.6-2z" fill="${G}"/>`),
  know: s(`<path d="M4 5.5c3-1 5.5-.6 8 1.2 2.5-1.8 5-2.2 8-1.2v13c-3-1-5.5-.6-8 1.2-2.5-1.8-5-2.2-8-1.2z" fill="${I}"/><path d="M12 6.7v13" fill="none"/><path d="M6.5 9h3M6.5 11.5h3M14.5 9h3M14.5 11.5h3" fill="none" stroke-width="1.2"/>`),
  glory: s(`<path d="M12 2.5l2.6 5.6 6.1.7-4.5 4.2 1.2 6-5.4-3-5.4 3 1.2-6L3.3 8.8l6.1-.7z" fill="${G}"/><circle cx="12" cy="11.5" r="2.2" fill="${G2}"/>`),
  ap: s(`<path d="M12 2l7 10-7 10-7-10z" fill="${R}"/><path d="M12 6.5l3.8 5.5L12 17.5 8.2 12z" fill="${G}"/>`),
  apoff: s(`<path d="M12 2l7 10-7 10-7-10z" fill="#3a3040"/><path d="M12 6.5l3.8 5.5L12 17.5 8.2 12z" fill="#55485c"/>`),
  turn: s(`<path d="M6 3h12M6 21h12" fill="none"/><path d="M7.5 3c0 5 4.5 6 4.5 9s-4.5 4-4.5 9h9c0-5-4.5-6-4.5-9s4.5-4 4.5-9z" fill="${I}"/><path d="M9.5 19.5h5L12 16z" fill="${G}"/>`),
  era: s(`<path d="M4 20.5h16M5.5 18h13M6 6.5h12L12 3z" fill="${G}"/><path d="M7.5 7v11M12 7v11M16.5 7v11" fill="none" stroke-width="2.4"/><path d="M4 20.5h16v-2.5H4zM5 6.5h14" fill="${G}"/>`),
  tech: s(`<circle cx="12" cy="12" r="8.5" fill="${I}"/><ellipse cx="12" cy="12" rx="8.5" ry="3.4" fill="none"/><ellipse cx="12" cy="12" rx="3.4" ry="8.5" fill="none"/><circle cx="12" cy="12" r="2.2" fill="${G}"/>`),
  castle: s(`<path d="M3.5 21V9h3v2h2V9h3v2h1V9h3v2h2V9h3v12z" fill="${I}"/><path d="M10 21v-4.5a2 2 0 014 0V21z" fill="${K}"/><path d="M12 9V3l4 1.5-4 1.5" fill="${R}"/>`),
  outpost: s(`<path d="M2.5 20.5L12 5l9.5 15.5z" fill="${I}"/><path d="M12 20.5l-3-6h6z" fill="${K}"/><path d="M12 5V2.5l3.5 1.2L12 5" fill="${R}"/>`),
  recruit: s(`<path d="M6 21V3" fill="none" stroke-width="2"/><path d="M6 4h12l-3 4 3 4H6z" fill="${R}"/><path d="M10 8h4M12 6v4" fill="none" stroke="${I}" stroke-width="1.8"/>`),
  build: s(`<path d="M4 20l9-9" fill="none" stroke-width="3"/><path d="M4 20l9-9" fill="none" stroke="${G}" stroke-width="1.2"/><path d="M11 6l4-3 6 6-3 4z" fill="${I}"/>`),
  flag: s(`<path d="M5 22V3" fill="none" stroke-width="2"/><path d="M5 4c4-2 7 2 14 0v9c-7 2-10-2-14 0z" fill="${I}"/>`),
  close: s(`<path d="M6 6l12 12M18 6L6 18" fill="none" stroke="${G2}" stroke-width="2.6"/>`),
  menu: s(`<path d="M4 6h16M4 12h16M4 18h16" fill="none" stroke="${G2}" stroke-width="2.4"/>`),
  eye: s(`<path d="M2 12c5-7 15-7 20 0-5 7-15 7-20 0z" fill="${I}"/><circle cx="12" cy="12" r="3.4" fill="${G}"/>`),
  crown: s(`<path d="M3 18L2 7l5 4 5-7 5 7 5-4-1 11z" fill="${G}"/><path d="M3 20.5h18" fill="none" stroke-width="2.4"/><circle cx="12" cy="13" r="1.8" fill="${R}"/>`),
  sword: s(`<path d="M14.5 3H21v6.5L10 20.5 3.5 14z" fill="${I}"/><path d="M5 12.5l6.5 6.5M3 21l3.5-3.5" fill="none" stroke-width="2.4"/><path d="M8 14l7-7" fill="none" stroke-width="1"/>`),
  scales: s(`<path d="M12 3v17M7 20.5h10M4 6.5h16" fill="none" stroke-width="2"/><path d="M1.8 13L4 6.5 6.2 13zM17.8 13L20 6.5l2.2 6.5z" fill="${G}"/><path d="M1.8 13a2.2 2.2 0 004.4 0M17.8 13a2.2 2.2 0 004.4 0" fill="${G}"/>`),
  spark: s(`<path d="M12 2l2.2 7.8L22 12l-7.8 2.2L12 22l-2.2-7.8L2 12l7.8-2.2z" fill="${G}"/><circle cx="12" cy="12" r="2" fill="${I}"/>`),
  lock: s(`<path d="M7.5 11V8a4.5 4.5 0 019 0v3" fill="none" stroke-width="2.2"/><rect x="5" y="11" width="14" height="10" fill="${G}"/><path d="M12 14.5v3" fill="none" stroke-width="2"/>`),
  check: s(`<path d="M4 12.5l5 5L20 6" fill="none" stroke-width="3.4"/><path d="M4 12.5l5 5L20 6" fill="none" stroke="${G2}" stroke-width="1.6"/>`),
  shield: s(`<path d="M12 2.5l8 3v6c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10v-6z" fill="${I}"/><path d="M12 5v14.3c3-1.3 5.5-4 5.5-7.8V7.2z" fill="${G}"/>`),
  heart: s(`<path d="M12 20.5S3 15 3 8.8A4.6 4.6 0 0112 7a4.6 4.6 0 019 1.8C21 15 12 20.5 12 20.5z" fill="${R}"/><path d="M7 9.5a2.4 2.4 0 012.4-2" fill="none" stroke="${I}" stroke-width="1.3"/>`),
  burn: s(`<path d="M12 22c-4.4 0-7-2.8-7-6.6 0-4 3.4-6 3.6-10.4 2 1.4 3 3.2 3 5 1-1 1.8-3 1.6-5.5C17 7 19 11 19 15.4 19 19.2 16.4 22 12 22z" fill="#ff7a3d"/><path d="M12 22c-2 0-3.2-1.3-3.2-3 0-2 1.8-3 2.2-5 1.6 1.2 4.2 2.8 4.2 5 0 1.7-1.2 3-3.2 3z" fill="${G2}"/>`),
  chill: s(`<path d="M12 2v20M3.3 7l17.4 10M3.3 17L20.7 7" fill="none" stroke-width="2.4"/><path d="M12 2v20M3.3 7l17.4 10M3.3 17L20.7 7" fill="none" stroke="#bfeaff" stroke-width="1"/><path d="M9.5 3.5L12 6l2.5-2.5M9.5 20.5L12 18l2.5 2.5" fill="none" stroke-width="1.4"/>`),
  wave: s(`<path d="M2 9c2.5-3 5-3 7.5 0s5 3 7.5 0 3.5-2.5 5-1.2M2 15c2.5-3 5-3 7.5 0s5 3 7.5 0 3.5-2.5 5-1.2" fill="none" stroke-width="2.6"/><path d="M2 9c2.5-3 5-3 7.5 0s5 3 7.5 0 3.5-2.5 5-1.2M2 15c2.5-3 5-3 7.5 0s5 3 7.5 0 3.5-2.5 5-1.2" fill="none" stroke="#7fd0f0" stroke-width="1"/>`),
  mountain: s(`<path d="M1.5 20.5L9 6l4 7 2.5-4 7 11.5z" fill="#c2a27a"/><path d="M7 10L9 6l2 3.6-1 1-1-1z" fill="${I}"/>`),
  leaf: s(`<path d="M4 20C4 9 10 4 21 3c-.5 11-6 17-17 17z" fill="#7ccf5a"/><path d="M4 20L15 9M9 15h4M12 12V8" fill="none" stroke-width="1.4"/>`),
  bolt: s(`<path d="M14 2L4.5 13.5H11L9 22l10.5-12.5H13z" fill="#ffe14d"/>`),
  flame: s(`<path d="M12 22c-4.4 0-7-2.8-7-6.6 0-4 3.4-6 3.6-10.4 2 1.4 3 3.2 3 5 1-1 1.8-3 1.6-5.5C17 7 19 11 19 15.4 19 19.2 16.4 22 12 22z" fill="#ff7a3d"/><path d="M12 22c-2 0-3.2-1.3-3.2-3 0-2 1.8-3 2.2-5 1.6 1.2 4.2 2.8 4.2 5 0 1.7-1.2 3-3.2 3z" fill="${G2}"/>`),
  snow: s(`<path d="M12 2v20M3.3 7l17.4 10M3.3 17L20.7 7" fill="none" stroke-width="2.6"/><path d="M12 2v20M3.3 7l17.4 10M3.3 17L20.7 7" fill="none" stroke="#bfeaff" stroke-width="1.1"/>`),
  horse: s(`<path d="M7 21l1.5-6.5L6 12l3-6 1-3 2 2.5c4 .5 7 4 7 9.5V21z" fill="${I}"/><path d="M6 12l3-1.2" fill="none"/><circle cx="10.5" cy="8" r=".9" fill="${K}"/>`),
  tower: s(`<path d="M7 21l1.5-12h7L17 21z" fill="${I}"/><path d="M7 9h10l-5-6.5z" fill="${R}"/><path d="M12 13l1 2-1 2-1-2z" fill="${G}"/>`),
  anvil: s(`<path d="M3 7h13c0 3 2 4 5 4-1.5 2-4 3-7 3l1 4H6l1.5-4C5 13 3 11 3 7z" fill="#9a94a0"/><path d="M5 21h12" fill="none" stroke-width="2.2"/>`),
  wall: s(`<path d="M2.5 20.5V8h4V5.5h3V8h5V5.5h3V8h4v12.5z" fill="#c2a27a"/><path d="M2.5 12.5h19M2.5 16.5h19M8 8.5v4M15 8.5v4M5 12.5v4M12 12.5v4M18.5 12.5v4M8 16.5v4M15 16.5v4" fill="none" stroke-width="1.1"/>`),
  book: s(`<path d="M5 3.5h12.5v17H5a1.5 1.5 0 01-1.5-1.5V5A1.5 1.5 0 015 3.5z" fill="${R}"/><path d="M6.5 17.5h11v3h-11z" fill="${I}"/><path d="M10 7h5" fill="none" stroke="${G2}" stroke-width="1.6"/>`),
  wheat: s(`<path d="M12 22V6" fill="none" stroke-width="2"/><path d="M12 6c-2-1-2-3.5 0-4.5 2 1 2 3.5 0 4.5zM12 11c-3 0-4.5-2-4.5-4 3 0 4.5 2 4.5 4zM12 11c3 0 4.5-2 4.5-4-3 0-4.5 2-4.5 4zM12 16c-3 0-4.5-2-4.5-4 3 0 4.5 2 4.5 4zM12 16c3 0 4.5-2 4.5-4-3 0-4.5 2-4.5 4z" fill="${G}"/>`),
  cauldron: s(`<path d="M3 9h18M5 9c0 7 3 11 7 11s7-4 7-11" fill="#3a3040"/><path d="M8 9c0-3 1.5-5 2.5-6 .5 2 1.5 3 1.5 3s1-2.5 2.5-3.5C16 4 16 7 16 9" fill="#ff7a3d"/><path d="M7 20.5l-1 1.5M17 20.5l1 1.5" fill="none" stroke-width="2"/>`),
  boot: s(`<path d="M7 3h6v10l7 3v4.5H5V16z" fill="${I}"/><path d="M5 18.5h15" fill="none"/>`),
  plus: s(`<path d="M12 4v16M4 12h16" fill="none" stroke-width="3.6"/><path d="M12 4v16M4 12h16" fill="none" stroke="${G2}" stroke-width="1.6"/>`),
  arrow: s(`<path d="M4 12h15M13 6l6 6-6 6" fill="none" stroke-width="2.6"/>`),
  back: s(`<path d="M20 12H5M11 6l-6 6 6 6" fill="none" stroke="${G2}" stroke-width="2.6"/>`),
  copy: s(`<rect x="8" y="8" width="12" height="13" fill="${I}"/><path d="M5 16V3.5h11" fill="none" stroke-width="2"/>`),
  bot: s(`<rect x="4" y="7" width="16" height="12" fill="${I}"/><path d="M12 7V3.5" fill="none" stroke-width="2"/><circle cx="12" cy="3" r="1.5" fill="${R}"/><rect x="7.5" y="10.5" width="3" height="3" fill="${G}"/><rect x="13.5" y="10.5" width="3" height="3" fill="${G}"/><path d="M8.5 16.5h7" fill="none"/>`),
  dice: s(`<rect x="3.5" y="3.5" width="17" height="17" fill="${I}"/><circle cx="8" cy="8" r="1.4" fill="${K}"/><circle cx="16" cy="16" r="1.4" fill="${K}"/><circle cx="12" cy="12" r="1.4" fill="${K}"/>`),
  user: s(`<circle cx="12" cy="8" r="4" fill="${I}"/><path d="M4 21c0-4.5 3.6-7.5 8-7.5s8 3 8 7.5z" fill="${G}"/>`),
  refresh: s(`<path d="M19 12a7 7 0 11-2.1-5" fill="none" stroke="${G2}" stroke-width="2.4"/><path d="M18 3v4.5h-4.5" fill="none" stroke="${G2}" stroke-width="2.4"/>`),
  map: s(`<path d="M3 5.5l5.5-2 7 2 5.5-2v15l-5.5 2-7-2-5.5 2z" fill="${I}"/><path d="M8.5 3.5v15M15.5 5.5v15" fill="none"/><path d="M10.5 10l3 3M13.5 10l-3 3" fill="none" stroke="${R}" stroke-width="1.8"/>`),
  skull: s(`<path d="M5 11a7 7 0 0114 0c0 2.5-1 3.8-2 4.5V19H7v-3.5C6 14.8 5 13.5 5 11z" fill="${I}"/><circle cx="9.3" cy="11.5" r="1.8" fill="${K}"/><circle cx="14.7" cy="11.5" r="1.8" fill="${K}"/><path d="M10 19v2M14 19v2" fill="none"/>`),
  xp: s(`<path d="M12 3l2.4 4.8L20 8.6l-4 3.9.9 5.5L12 15.4 7.1 18l.9-5.5-4-3.9 5.6-.8z" fill="${I}"/>`),
  target: s(`<circle cx="12" cy="12" r="9" fill="${I}"/><circle cx="12" cy="12" r="5.5" fill="${R}"/><circle cx="12" cy="12" r="2" fill="${I}"/>`),
};
/** Герб расы: иконка стихии. */
export const RACE_ICON: Record<string, string> = { fire: "flame", ice: "snow", water: "wave", stone: "mountain", nature: "leaf", lightning: "bolt" };
/** Иконки построек (неизвестная постройка от баланса → «build»). */
export const BUILD_ICON: Record<string, string> = { barracks: "sword", stable: "horse", magetower: "tower", forge: "anvil", wall: "wall", market: "scales", library: "book", granary: "wheat", crucible: "cauldron", glacier: "snow" };
export const BRANCH_ICON: Record<string, string> = { war: "sword", econ: "scales", elem: "spark" };

let injected = false;
/** Вставляет SVG-спрайт в документ один раз. */
export function injectIcons() {
  if (injected || typeof document === "undefined") return; injected = true;
  const defs = Object.entries(ICONS).map(([k, v]) => `<symbol id="i-${k}" viewBox="0 0 24 24">${v}</symbol>`).join("");
  const d = document.createElement("div"); d.style.display = "none";
  d.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg">${defs}</svg>`; document.body.prepend(d);
}
/** Разметка иконки: <svg class="ic"><use href="#i-name"></svg>. Неизвестное имя → «spark». */
/** Ресурсные иконки из UI-набора Художника (ui-v1, icon_res_*): PNG вместо SVG-заглушек. */
export const KIT_ICON: Record<string, string> = { gold: "gold", know: "knowledge", glory: "glory", ap: "ap", wheat: "growth", growth: "growth", shield: "armor", sword: "attack", heart: "hp" };
const kitSrc = (name: string) => `/strat/ui/icons/icon_res_${KIT_ICON[name]}_64.png`;
/** UI v2 (Художник, ui-v2/icons): 53 иконки 64/32 px. Имя игры → имя арта; нет в наборе — SVG-заглушка. */
export const ART_ICONS = new Set("anvil arrow back bolt book boot build burn castle cauldron chat check chill clock close copy crown dice era eye flag flame heart horse leaf lock map menu mountain mute outpost plus recruit refresh report scales shield skull snow spark sword target tower turn ult user wall warn wave wheat whisper xp zap".split(" "));
const ART_ALIAS: Record<string, string> = { play: "arrow", chevron: "arrow", tech: "book", know: "book", apoff: "warn", danger: "warn", ability: "zap" };
export const artIcon = (name: string, big = false) => { if (name === "bot") return "/strat/ui2/badges/bot_mark.png"; const a = ART_ICONS.has(name) ? name : ART_ALIAS[name]; return a ? `/strat/ui2/icons/icon_${a}_${big ? 64 : 32}.png` : null; };
export const ic = (name: string, cls = "") => {
  if (KIT_ICON[name]) return `<img class="ic kit ${cls}" src="${kitSrc(name)}" alt="" aria-hidden="true" draggable="false">`;
  const a = !/\bmono\b/.test(cls) && artIcon(name, /\bbig\b/.test(cls));
  return a ? `<img class="ic art i-${name} ${cls}" src="${a}" alt="" aria-hidden="true" draggable="false">` : `<svg class="ic ${cls}" aria-hidden="true"><use href="#i-${ICONS[name] ? name : "spark"}"/></svg>`;
};

const imgCache = new Map<string, HTMLImageElement>();
/** Иконка как картинка для холста (готова не сразу — onLoad перерисует доску). */
export function iconImg(name: string, onLoad?: () => void): HTMLImageElement | null {
  let im = imgCache.get(name);
  if (!im) { im = new Image(); imgCache.set(name, im); if (onLoad) im.onload = onLoad;
    if (KIT_ICON[name]) { im.src = kitSrc(name); return null; }
    const a = artIcon(name, true); if (a) { im.src = a; return null; }
    im.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="96" height="96">${ICONS[name] || ICONS.spark}</svg>`); }
  return im.complete && im.naturalWidth ? im : null;
}
