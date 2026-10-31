// t1217: редактор карт игроков, хаб карт (лайки/избранное/комментарии) и модерация (только Алекс).
// Карта — строки t/s size×size (server/strat/terrain.ts); проверки те же, что на сервере (validateMap + точки спавна).
// Доска редактора рисуется кусками 16×16 клеток (кэш, правка сбрасывает только свои куски) и только видимая часть; мини-карта — 1 px на клетку.
import { TERRAIN, STRUCT, validateMap, unreachableCells, spawnsOf, isMapSize, MAP_MIN, MAP_MAX, SPAWN_MAX, type MapData } from "../../../server/strat/terrain";
import { STRAT_CFG, ensureSize } from "../../../server/strat/rules";
import { drawTerrainCell, drawStructArt, drawStruct, terrainLayer, GOLD, INK, RED } from "./terrain-draw";
import { artVer } from "./art";
import { esc, modal, confirmDlg, promptDlg } from "./ui-kit";
import { ic } from "./icons";

export type MapsCtx = {
  req: (type: string, o?: any) => Promise<any>;
  toast: (t: string, k?: "info" | "good" | "bad") => void;
  isAdmin: () => boolean; isGuest: () => boolean;
  /** Создать лобби на этой карте (bot — сразу с ботом: «Проверить в игре»). */
  play: (id: string, size: number, bot: boolean) => void;
};
const SIDE: [string, string] = [GOLD, RED];
const LEAGUE: Record<string, [string, number, number]> = { quick: ["Быстрая", 4, 9], normal: ["Обычная", 10, 35], tactic: ["Тактическая", 36, 100] };
const leagueOfSize = (n: number) => (n <= 9 ? "quick" : n <= 35 ? "normal" : "tactic");
export const MAP_ERR: Record<string, string> = {
  bad_size: `Размер — от ${MAP_MIN} до ${MAP_MAX}`, bad_name: "Нужно название (до 40 символов)", login_required: "Только для вошедших на сайт", too_many: "Слишком много карт на проверке",
  rate: "Не так часто", not_found: "Карта не найдена", play_first: "Лайк — после сыгранной партии на этой карте", banned: "Комментарии для вас закрыты", empty: "Пустой комментарий",
  not_admin: "Только для администратора", offline: "Нет связи с сервером", db: "Ошибка базы",
  too_blocked: "Больше 25% клеток непроходимо", too_many_res: "Слишком много ресурсов", unreachable: "Есть недостижимые клетки (подсвечены)", army_blocked: "Армии некуда встать",
  spawns_few: "Нужно минимум 2 точки спавна", spawns_many: `Не больше ${SPAWN_MAX} точек спавна`, spawn_half: "Точки спавна: нужна хотя бы одна снизу и одна сверху", spawn_space: "У точки спавна мало места для армии",
  spawn_blocked: "Точка спавна на непроходимой клетке", not_symmetric: "Карта несимметрична — баланс сторон под вопросом", spawns_extra: "Игра пока 1×1: используются нижняя и верхняя точки",
};
const errText = (e: string) => MAP_ERR[e] || MAP_ERR[e.replace(/^invalid:/, "").split(",")[0]] || e;

/** Проверка как на сервере (checkSave): validateMap + число точек спавна. */
export function checkLocal(m: MapData) {
  const army = ensureSize(STRAT_CFG, m.size).army, v = validateMap(m, { armyRows: 0, armyCols: [], army });
  const n = spawnsOf(m).length; if (n < 2) v.errors.push("spawns_few"); if (n > SPAWN_MAX) v.errors.push("spawns_many");
  return v;
}

// ---------------------------------------------------------------- редактор
type Tool = "paint" | "fill" | "erase" | "pan";
type Sym = "none" | "rot" | "mirror";
const T_COL: Record<string, string> = { ".": "#7f8c4c", ",": "#97a65c", f: "#3c6a34", m: "#8b8173", w: "#3a6d9c", b: "#8a5c33", r: "#b99a62", "#": "#47403d", g: "#9b6b3a" };
const S_COL: Record<string, string> = { M: "#e0b04a", Q: "#c9c1b0", A: "#8f6fd6", S: "#f3e3a0", V: "#d98a4a", T: "#d8d0c0", W: "#7fc6e8", R: "#a08a70", X: "#b04ad9", D: "#5aa0c8", O: "#ffd966", P: "#ff4a3a" };
const DRAFT = "strat.mapDraft";
const CH = 16; // клеток в куске кэша

export function openEditor(ctx: MapsCtx, src?: { map: MapData; descr?: string; status?: string }) {
  document.getElementById("medit")?.remove();
  let draft: any = null; if (!src) try { draft = JSON.parse(localStorage.getItem(DRAFT) || "null"); } catch {}
  let m: MapData = src ? { ...src.map } : draft?.map && isMapSize(draft.map.size) ? draft.map : blankMap(24);
  let descr = src?.descr ?? draft?.descr ?? "", srcId = src?.map.id && /^u/.test(src.map.id) ? src.map.id : draft?.srcId || "";
  let tool: Tool = "paint", brush: { k: "t" | "s"; c: string } = { k: "t", c: "f" }, bsize = 1, sym: Sym = "rot", grid = true, showBad = true;
  const undo: { t: string; s: string; size: number }[] = [], redo: typeof undo = [];
  const el = document.createElement("div"); el.id = "medit"; el.className = "medit";
  el.innerHTML = `<header class="me-top">
      <button class="btn sq ghost" data-c="close" aria-label="Закрыть" data-tip="Закрыть редактор">${ic("close")}</button>
      <input class="me-name" maxlength="40" placeholder="Название карты" aria-label="Название карты">
      <label class="me-size" data-tip="Размер стороны: ${MAP_MIN}…${MAP_MAX}"><input type="number" min="${MAP_MIN}" max="${MAP_MAX}" aria-label="Размер"><span>клеток</span></label>
      <span class="me-lg"></span>
      <span class="me-sp"></span>
      <button class="btn sq ghost" data-c="undo" aria-label="Отменить" data-tip="Отменить (Ctrl+Z)">↶</button>
      <button class="btn sq ghost" data-c="redo" aria-label="Вернуть" data-tip="Вернуть (Ctrl+Y)">↷</button>
      <button class="btn sm ghost me-more" data-c="more"><span>Ещё</span></button>
      <button class="btn sm ghost" data-c="test"><span>Проверить в игре</span></button>
      <button class="btn sm gold" data-c="save"><span>Сохранить</span></button>
    </header>
    <div class="me-main">
      <aside class="me-pal">
        <div class="me-grp"><b>Рельеф</b><div class="me-sw" data-k="t"></div></div>
        <div class="me-grp"><b>Постройки</b><div class="me-sw" data-k="s"></div></div>
      </aside>
      <div class="me-stage"><canvas class="me-cv"></canvas>
        <div class="minimapbox me-mini"><canvas></canvas></div>
        <div class="me-zoom"><button class="btn sq ghost" data-c="zin" aria-label="Приблизить">+</button><button class="btn sq ghost" data-c="zout" aria-label="Отдалить">−</button><button class="btn sq ghost" data-c="fit" aria-label="Вся карта">⤢</button></div>
        <div class="me-hint"></div>
      </div>
      <aside class="me-side">
        <div class="me-status"></div>
        <div class="me-checks"></div>
        <label class="fld"><span>Описание</span><textarea class="me-descr" rows="3" maxlength="300" placeholder="Пара слов о замысле карты"></textarea></label>
        <div class="me-opts">
          <label><input type="checkbox" data-o="grid" checked> сетка</label>
          <label><input type="checkbox" data-o="bad" checked> подсветка проблем</label>
        </div>
        <div class="me-acts"><button class="btn sm ghost" data-c="clear"><span>Очистить</span></button><button class="btn sm ghost" data-c="preview"><span>Как в игре</span></button></div>
        <p class="muted me-note">Новая карта видна только вам и тем, кого вы позовёте по коду. Партии на ней — <b>без опыта и рейтинга</b>, пока её не одобрит администратор.</p>
      </aside>
    </div>
    <footer class="me-tools">
      <button class="mt" data-t="paint" aria-label="Кисть">${ic("build")}<span>Кисть</span></button>
      <button class="mt" data-t="fill" aria-label="Заливка">◧<span>Заливка</span></button>
      <button class="mt" data-t="erase" aria-label="Ластик">⌫<span>Ластик</span></button>
      <button class="mt" data-t="pan" aria-label="Рука">✋<span>Рука</span></button>
      <span class="mt-sep"></span>
      <button class="mt bs" data-b="1">1</button><button class="mt bs" data-b="3">3</button><button class="mt bs" data-b="5">5</button>
      <span class="mt-sep"></span>
      <button class="mt sy" data-s="none" data-tip="Без симметрии">∅<span>Без симм.</span></button>
      <button class="mt sy" data-s="rot" data-tip="Поворот на 180° — стороны равны">⟲<span>Поворот</span></button>
      <button class="mt sy" data-s="mirror" data-tip="Зеркало сверху вниз">⇅<span>Зеркало</span></button>
      <span class="mt-cur"></span>
    </footer>`;
  document.body.appendChild(el); document.body.classList.add("me-open");
  const $ = <T extends HTMLElement = HTMLElement>(s: string) => el.querySelector<T>(s)!;
  const cv = $<HTMLCanvasElement>(".me-cv"), g = cv.getContext("2d")!, mini = $<HTMLCanvasElement>(".me-mini canvas"), stage = $(".me-stage");
  const nameIn = $<HTMLInputElement>(".me-name"), sizeIn = $<HTMLInputElement>(".me-size input"), descrIn = $<HTMLTextAreaElement>(".me-descr");
  nameIn.value = m.name === "Новая карта" && !src ? "" : m.name; sizeIn.value = String(m.size); descrIn.value = descr;
  // палитра
  for (const k of ["t", "s"] as const) {
    const box = el.querySelector(`.me-sw[data-k="${k}"]`)!, defs: any = k === "t" ? TERRAIN : STRUCT;
    for (const c of Object.keys(defs)) { const b = document.createElement("button"); b.className = "sw"; b.dataset.c = c; b.dataset.tip = esc(defs[c].name + (defs[c].eff ? " — " + defs[c].eff : ""));
      const pc = document.createElement("canvas"); pc.width = pc.height = 64; swatch(pc.getContext("2d")!, k, c, 64); b.appendChild(pc);
      const sp = document.createElement("span"); sp.textContent = defs[c].name; b.appendChild(sp);
      b.onclick = () => { brush = { k, c }; if (tool === "erase" || tool === "pan") tool = "paint"; syncUi(); }; box.appendChild(b); }
  }
  // ---- вид
  let z = 24, ox = 0, oy = 0, W = 0, H = 0, dpr = 1;
  const chunks = new Map<string, HTMLCanvasElement>(); let chunkPx = 32, chunkVer = -1;
  let checks = checkLocal(m), bad = new Set<number>();
  const recheck = () => { checks = checkLocal(m); bad = new Set(unreachableCells(m)); renderChecks(); };
  function resize() { dpr = devicePixelRatio || 1; W = stage.clientWidth; H = stage.clientHeight; cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); cv.style.width = W + "px"; cv.style.height = H + "px"; clamp(); draw(); }
  function fit() { z = Math.max(2, Math.min(64, Math.min(W, H) * 0.94 / m.size)); ox = (W - z * m.size) / 2; oy = (H - z * m.size) / 2; draw(); }
  function clamp() { const s = z * m.size, pad = Math.min(W, H) * 0.5; ox = Math.min(W - pad * 0.3, Math.max(pad * 0.3 - s, ox)); oy = Math.min(H - pad * 0.3, Math.max(pad * 0.3 - s, oy)); }
  function zoomAt(f: number, cx: number, cy: number) { const nz = Math.max(2, Math.min(72, z * f)); ox = cx - (cx - ox) * nz / z; oy = cy - (cy - oy) * nz / z; z = nz; clamp(); draw(); }
  const T = (x: number, y: number) => (x < 0 || y < 0 || x >= m.size || y >= m.size ? "?" : m.t[y * m.size + x]);
  function chunk(cx: number, cy: number): HTMLCanvasElement {
    const key = cx + "," + cy; let c = chunks.get(key); if (c) return c;
    c = document.createElement("canvas"); const n = m.size, w = Math.min(CH, n - cx * CH), h = Math.min(CH, n - cy * CH); c.width = w * chunkPx; c.height = h * chunkPx;
    const k = c.getContext("2d")!, P = chunkPx, cells: [number, number][] = [];
    for (let y = cy * CH; y < cy * CH + h; y++) for (let x = cx * CH; x < cx * CH + w; x++) cells.push([x, y]);
    const order = (t: string) => ("w b".includes(t) ? 0 : ".,r".includes(t) ? 1 : 2); cells.sort((a, b) => order(T(a[0], a[1])) - order(T(b[0], b[1])) || a[1] - b[1]);
    for (const [x, y] of cells) drawTerrainCell(k, T(x, y), x, y, (x - cx * CH) * P, (y - cy * CH) * P, P, (dx, dy) => T(x + dx, y + dy));
    for (const [x, y] of cells) { const ch = m.s[y * n + x]; if (ch === "." || ch === "P") continue; const px = (x - cx * CH) * P, py = (y - cy * CH) * P; if (!drawStructArt(k, ch, px, py, P, null, GOLD)) drawStruct(k, ch, px + P / 2, py + P / 2, P * 0.7, GOLD); }
    chunks.set(key, c); return c;
  }
  const dirty = (x: number, y: number) => { for (const dx of [-1, 0, 1]) for (const dy of [-1, 0, 1]) chunks.delete(Math.floor((x + dx) / CH) + "," + Math.floor((y + dy) / CH)); };
  let flat: HTMLCanvasElement | null = null;
  function flatImg() { if (flat) return flat; const n = m.size; flat = document.createElement("canvas"); flat.width = flat.height = n; const k = flat.getContext("2d")!, id = k.createImageData(n, n);
    for (let i = 0; i < n * n; i++) { const s = m.s[i], col = s !== "." ? S_COL[s] || "#fff" : T_COL[m.t[i]] || "#777"; const v = parseInt(col.slice(1), 16); id.data[i * 4] = v >> 16; id.data[i * 4 + 1] = (v >> 8) & 255; id.data[i * 4 + 2] = v & 255; id.data[i * 4 + 3] = 255; }
    k.putImageData(id, 0, 0); return flat; }
  let raf = 0; function draw() { if (!raf) raf = requestAnimationFrame(paint); }
  function paint() {
    raf = 0; const n = m.size; g.setTransform(dpr, 0, 0, dpr, 0, 0); g.fillStyle = "#120c0e"; g.fillRect(0, 0, W, H);
    if (chunkVer !== artVer) { chunks.clear(); chunkVer = artVer; }
    const x0 = Math.max(0, Math.floor(-ox / z)), y0 = Math.max(0, Math.floor(-oy / z)), x1 = Math.min(n, Math.ceil((W - ox) / z)), y1 = Math.min(n, Math.ceil((H - oy) / z));
    g.imageSmoothingEnabled = z < chunkPx;
    if (z * dpr < 9) { g.imageSmoothingEnabled = false; g.drawImage(flatImg(), ox, oy, n * z, n * z); }
    else for (let cy = Math.floor(y0 / CH); cy * CH < y1; cy++) for (let cx = Math.floor(x0 / CH); cx * CH < x1; cx++) { const c = chunk(cx, cy); g.drawImage(c, ox + cx * CH * z, oy + cy * CH * z, (c.width / chunkPx) * z, (c.height / chunkPx) * z); }
    // точки спавна — номер и цвет стороны (1×1: нижняя — золото, верхняя — красный)
    const sp = spawnsOf(m); sp.forEach(([x, y], i) => { if (x < x0 - 1 || x > x1 || y < y0 - 1 || y > y1) return; const px = ox + x * z, py = oy + y * z;
      if (z >= 9 && drawStructArt(g, "P", px, py, z, null, y > (n - 1) / 2 ? SIDE[0] : SIDE[1])) {} else { g.fillStyle = y > (n - 1) / 2 ? GOLD : RED; g.beginPath(); g.arc(px + z / 2, py + z / 2, Math.max(2, z * 0.38), 0, 7); g.fill(); }
      if (z >= 12) { g.font = `700 ${Math.round(z * 0.36)}px system-ui`; g.textAlign = "center"; g.textBaseline = "middle"; g.lineWidth = 3; g.strokeStyle = INK; g.fillStyle = "#fff"; g.strokeText("P" + (i + 1), px + z / 2, py + z * 0.82); g.fillText("P" + (i + 1), px + z / 2, py + z * 0.82); } });
    if (grid && z >= 10) { g.strokeStyle = "rgba(26,16,20,.28)"; g.lineWidth = 1; g.beginPath();
      for (let x = x0; x <= x1; x++) { g.moveTo(ox + x * z + 0.5, oy + y0 * z); g.lineTo(ox + x * z + 0.5, oy + y1 * z); }
      for (let y = y0; y <= y1; y++) { g.moveTo(ox + x0 * z, oy + y * z + 0.5); g.lineTo(ox + x1 * z, oy + y * z + 0.5); } g.stroke(); }
    if (showBad && bad.size) { g.fillStyle = "rgba(255,40,40,.38)"; for (const i of bad) { const x = i % n, y = (i / n) | 0; if (x >= x0 && x < x1 && y >= y0 && y < y1) g.fillRect(ox + x * z, oy + y * z, z, z); } }
    // ось симметрии
    if (sym !== "none") { g.strokeStyle = "rgba(243,207,104,.55)"; g.setLineDash([6, 6]); g.lineWidth = 1.5; g.beginPath(); g.moveTo(ox, oy + n * z / 2); g.lineTo(ox + n * z, oy + n * z / 2); g.stroke(); g.setLineDash([]); }
    g.strokeStyle = GOLD; g.lineWidth = 2; g.strokeRect(ox - 1, oy - 1, n * z + 2, n * z + 2);
    if (hover) { const r = (bsize - 1) / 2; g.strokeStyle = "#fff"; g.lineWidth = 2; g.strokeRect(ox + (hover[0] - r) * z, oy + (hover[1] - r) * z, bsize * z, bsize * z); }
    paintMini(x0, y0, x1, y1);
  }
  function paintMini(x0: number, y0: number, x1: number, y1: number) {
    const n = m.size, s = mini.clientWidth || 120, d = dpr; if (mini.width !== Math.round(s * d)) { mini.width = mini.height = Math.round(s * d); }
    const k = mini.getContext("2d")!; k.setTransform(1, 0, 0, 1, 0, 0); k.imageSmoothingEnabled = false; k.drawImage(flatImg(), 0, 0, mini.width, mini.height);
    const q = mini.width / n; k.strokeStyle = "#fff"; k.lineWidth = Math.max(1, d * 1.5); k.strokeRect(x0 * q, y0 * q, (x1 - x0) * q, (y1 - y0) * q);
  }
  // ---- правка
  const symCells = (x: number, y: number): [number, number][] => { const n = m.size, out: [number, number][] = [[x, y]]; if (sym === "rot") out.push([n - 1 - x, n - 1 - y]); else if (sym === "mirror") out.push([x, n - 1 - y]); return out; };
  const SYM_S: Record<string, string> = {}; // постройки симметричны сами себе
  function setCell(x: number, y: number, k: "t" | "s" | "e", c: string) {
    const n = m.size; if (x < 0 || y < 0 || x >= n || y >= n) return false; const i = y * n + x; let ch = false;
    if (k === "e") { if (m.t[i] !== "." || m.s[i] !== ".") { m.t = rep(m.t, i, "."); m.s = rep(m.s, i, "."); ch = true; } }
    else if (k === "t") { if (m.t[i] !== c) { m.t = rep(m.t, i, c); ch = true; } }
    else { const v = SYM_S[c] || c; if (m.s[i] !== v) { if (v === "P" && m.s[i] !== "P" && spawnsOf(m).length >= SPAWN_MAX) { warnOnce("spawns_many"); return false; } m.s = rep(m.s, i, v); ch = true; } }
    if (ch) dirty(x, y); return ch;
  }
  let warned = ""; const warnOnce = (e: string) => { if (warned !== e) { warned = e; ctx.toast(errText(e), "bad"); setTimeout(() => (warned = ""), 1500); } };
  function stamp(x: number, y: number) {
    const r = (bsize - 1) / 2, k = tool === "erase" ? "e" : brush.k, br = brush.k === "s" && brush.c === "P" ? 0 : r; let any = false;
    for (let dy = -br; dy <= br; dy++) for (let dx = -br; dx <= br; dx++) for (const [a, b] of symCells(x + dx, y + dy)) any = setCell(a, b, k as any, brush.c) || any;
    if (any) { flat = null; draw(); }
  }
  function fillAt(x: number, y: number) {
    const n = m.size; if (x < 0 || y < 0 || x >= n || y >= n) return; const k = brush.k, arr = (k === "t" ? m.t : m.s).split(""), from = arr[y * n + x], to = brush.c;
    if (from === to || to === "P") return; const st = [y * n + x], seen = new Uint8Array(n * n); let cnt = 0;
    while (st.length) { const i = st.pop()!; if (seen[i] || arr[i] !== from) continue; seen[i] = 1; arr[i] = to; cnt++; const cx = i % n, cy = (i / n) | 0;
      if (cx > 0) st.push(i - 1); if (cx < n - 1) st.push(i + 1); if (cy > 0) st.push(i - n); if (cy < n - 1) st.push(i + n); }
    if (k === "t") m.t = arr.join(""); else m.s = arr.join("");
    if (sym !== "none") { for (let i = 0; i < n * n; i++) if (seen[i]) { const cx = i % n, cy = (i / n) | 0; for (const [a, b] of symCells(cx, cy).slice(1)) setCell(a, b, k, to); } }
    chunks.clear(); flat = null; draw();
  }
  const snap = () => ({ t: m.t, s: m.s, size: m.size });
  function push() { undo.push(snap()); if (undo.length > 80) undo.shift(); redo.length = 0; }
  function restore(st: { t: string; s: string; size: number }) { const sz = st.size !== m.size; m = { ...m, t: st.t, s: st.s, size: st.size }; chunks.clear(); flat = null; sizeIn.value = String(m.size); if (sz) fit(); afterEdit(); }
  let saveT = 0; function afterEdit() { recheck(); draw(); syncUi(); clearTimeout(saveT); saveT = window.setTimeout(saveDraft, 400); }
  function saveDraft() { try { localStorage.setItem(DRAFT, JSON.stringify({ map: { ...m, name: nameIn.value || "Новая карта" }, descr: descrIn.value, srcId })); } catch {} }
  // ---- указатель: 1 палец — инструмент (или рука), 2 — щипок/сдвиг; колесо — масштаб; правая/средняя кнопка — сдвиг
  const pts = new Map<number, { x: number; y: number }>(); let mode: "" | "draw" | "pan" | "pinch" = "", last = { x: 0, y: 0 }, pinch0 = 0, stroke = false, hover: [number, number] | null = null;
  const cell = (e: { x: number; y: number }): [number, number] => [Math.floor((e.x - ox) / z), Math.floor((e.y - oy) / z)];
  const loc = (e: PointerEvent) => { const r = cv.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
  cv.addEventListener("pointerdown", (e) => {
    cv.setPointerCapture(e.pointerId); const p = loc(e); pts.set(e.pointerId, p);
    if (pts.size === 2) { if (stroke) { stroke = false; const u = undo.pop(); if (u) restore(u); } const [a, b] = [...pts.values()]; mode = "pinch"; pinch0 = Math.hypot(a.x - b.x, a.y - b.y); last = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }; return; }
    if (e.button === 1 || e.button === 2 || tool === "pan") { mode = "pan"; last = p; return; }
    const [x, y] = cell(p); if (x < 0 || y < 0 || x >= m.size || y >= m.size) { mode = "pan"; last = p; return; }
    push(); if (tool === "fill") { fillAt(x, y); afterEdit(); mode = ""; return; }
    mode = "draw"; stroke = true; stamp(x, y);
  });
  cv.addEventListener("pointermove", (e) => {
    const p = loc(e); if (e.pointerType === "mouse") { const c = cell(p); hover = c[0] >= 0 && c[1] >= 0 && c[0] < m.size && c[1] < m.size && tool !== "pan" ? c : null; showHint(c); if (!mode) draw(); }
    if (!pts.has(e.pointerId)) return; pts.set(e.pointerId, p);
    if (mode === "pinch" && pts.size >= 2) { const [a, b] = [...pts.values()], d = Math.hypot(a.x - b.x, a.y - b.y), c = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }; ox += c.x - last.x; oy += c.y - last.y; last = c; if (pinch0 > 0) zoomAt(d / pinch0, c.x, c.y); pinch0 = d; return; }
    if (mode === "pan") { ox += p.x - last.x; oy += p.y - last.y; last = p; clamp(); draw(); return; }
    if (mode === "draw") { const [x, y] = cell(p); stamp(x, y); }
  });
  const up = (e: PointerEvent) => { pts.delete(e.pointerId); if (mode === "draw" && stroke) { stroke = false; if (undo.length && undo[undo.length - 1].t === m.t && undo[undo.length - 1].s === m.s) undo.pop(); afterEdit(); } if (pts.size === 0) mode = ""; else if (mode === "pinch" && pts.size === 1) { mode = "pan"; last = [...pts.values()][0]; } };
  cv.addEventListener("pointerup", up); cv.addEventListener("pointercancel", up); cv.addEventListener("pointerleave", () => { hover = null; draw(); });
  cv.addEventListener("contextmenu", (e) => e.preventDefault());
  cv.addEventListener("wheel", (e) => { e.preventDefault(); const p = { x: e.offsetX, y: e.offsetY }; if (e.ctrlKey || Math.abs(e.deltaY) > Math.abs(e.deltaX)) zoomAt(Math.exp(-e.deltaY * 0.0022), p.x, p.y); else { ox -= e.deltaX; clamp(); draw(); } }, { passive: false });
  const jump = (e: PointerEvent) => { const r = mini.getBoundingClientRect(), n = m.size, x = ((e.clientX - r.left) / r.width) * n, y = ((e.clientY - r.top) / r.height) * n; ox = W / 2 - x * z; oy = H / 2 - y * z; clamp(); draw(); };
  mini.addEventListener("pointerdown", (e) => { mini.setPointerCapture(e.pointerId); jump(e); }); mini.addEventListener("pointermove", (e) => { if (e.buttons) jump(e); });
  function showHint(c: [number, number]) { const h = $(".me-hint"); if (c[0] < 0 || c[1] < 0 || c[0] >= m.size || c[1] >= m.size) { h.textContent = ""; return; } const i = c[1] * m.size + c[0]; h.textContent = `${c[0] + 1}:${c[1] + 1} · ${(TERRAIN as any)[m.t[i]]?.name || ""}${m.s[i] !== "." ? " · " + (STRUCT as any)[m.s[i]]?.name : ""}`; }
  // ---- кнопки
  const key = (e: KeyboardEvent) => { if ((e.target as HTMLElement).closest("input,textarea")) return; if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") { e.preventDefault(); e.shiftKey ? doRedo() : doUndo(); } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") { e.preventDefault(); doRedo(); } else if (e.key === "Escape") close(); };
  document.addEventListener("keydown", key);
  const doUndo = () => { const u = undo.pop(); if (!u) return; redo.push(snap()); restore(u); };
  const doRedo = () => { const r = redo.pop(); if (!r) return; undo.push(snap()); restore(r); };
  const ro = new ResizeObserver(() => resize()); ro.observe(stage);
  function close() { saveDraft(); ro.disconnect(); document.removeEventListener("keydown", key); el.remove(); document.body.classList.remove("me-open"); }
  async function save(): Promise<string | null> {
    m.name = nameIn.value.trim(); if (!m.name) { ctx.toast(MAP_ERR.bad_name, "bad"); nameIn.focus(); return null; }
    if (ctx.isGuest()) { ctx.toast(MAP_ERR.login_required, "bad"); return null; }
    recheck(); if (checks.errors.length) { ctx.toast("Исправьте: " + errText(checks.errors[0]), "bad"); el.classList.add("me-show-side"); return null; }
    const r = await ctx.req("map_save", { map: { id: srcId || undefined, name: m.name, size: m.size, t: m.t, s: m.s, descr: descrIn.value.trim() } });
    if (r.err) { ctx.toast(errText(r.err), "bad"); return null; }
    srcId = r.id; m.id = r.id; saveDraft(); status = "pending"; renderChecks(); ctx.toast("Сохранено — карта на рассмотрении. Играть на ней можно уже сейчас (без опыта и рейтинга).", "good"); return r.id;
  }
  let status = src?.status || "";
  el.addEventListener("click", async (e) => {
    const t = e.target as HTMLElement, c = t.closest<HTMLElement>("[data-c]")?.dataset.c, tb = t.closest<HTMLElement>("[data-t]")?.dataset.t, bs = t.closest<HTMLElement>("[data-b]")?.dataset.b, sy = t.closest<HTMLElement>("[data-s]")?.dataset.s;
    if (tb) { tool = tb as Tool; syncUi(); } if (bs) { bsize = +bs; syncUi(); } if (sy) { sym = sy as Sym; syncUi(); draw(); }
    if (!c) return;
    if (c === "close") close(); else if (c === "undo") doUndo(); else if (c === "redo") doRedo();
    else if (c === "zin") zoomAt(1.4, W / 2, H / 2); else if (c === "zout") zoomAt(1 / 1.4, W / 2, H / 2); else if (c === "fit") fit();
    else if (c === "more") el.classList.toggle("me-show-side");
    else if (c === "clear") { if (await confirmDlg("Очистить карту?", "Все клетки станут равниной (отменить можно ↶).", "Очистить")) { push(); m = { ...m, t: ".".repeat(m.size * m.size), s: ".".repeat(m.size * m.size) }; chunks.clear(); flat = null; afterEdit(); } }
    else if (c === "preview") previewDlg(m);
    else if (c === "save") await save();
    else if (c === "test") { const id = await save(); if (id) { close(); ctx.play(id, m.size, true); } }
  });
  el.querySelectorAll<HTMLInputElement>("[data-o]").forEach((i) => (i.onchange = () => { if (i.dataset.o === "grid") grid = i.checked; else showBad = i.checked; draw(); }));
  sizeIn.onchange = () => { const v = Math.round(+sizeIn.value); if (!isMapSize(v)) { sizeIn.value = String(m.size); return ctx.toast(MAP_ERR.bad_size, "bad"); } if (v === m.size) return; push(); m = resizeMap(m, v); chunks.clear(); flat = null; fit(); afterEdit(); };
  nameIn.oninput = descrIn.oninput = () => { clearTimeout(saveT); saveT = window.setTimeout(saveDraft, 400); };
  function syncUi() {
    el.querySelectorAll<HTMLElement>("[data-t]").forEach((b) => b.classList.toggle("on", b.dataset.t === tool));
    el.querySelectorAll<HTMLElement>("[data-b]").forEach((b) => b.classList.toggle("on", +b.dataset.b! === bsize));
    el.querySelectorAll<HTMLElement>("[data-s]").forEach((b) => b.classList.toggle("on", b.dataset.s === sym));
    el.querySelectorAll<HTMLElement>(".sw").forEach((b) => b.classList.toggle("on", b.closest<HTMLElement>(".me-sw")!.dataset.k === brush.k && b.dataset.c === brush.c && tool !== "erase"));
    $<HTMLButtonElement>('[data-c="undo"]').disabled = !undo.length; $<HTMLButtonElement>('[data-c="redo"]').disabled = !redo.length;
    const L = leagueOfSize(m.size); $(".me-lg").innerHTML = `<b>${m.size}×${m.size}</b> · ${LEAGUE[L][0]}`;
    const d: any = brush.k === "t" ? TERRAIN : STRUCT; $(".mt-cur").textContent = tool === "erase" ? "Ластик" : tool === "pan" ? "Сдвиг карты" : (d[brush.c]?.name || "");
    cv.style.cursor = tool === "pan" ? "grab" : "crosshair";
  }
  function renderChecks() {
    const sp = spawnsOf(m).length, blk = [...m.t].filter((c) => c === "#" || c === "m" || c === "w").length / (m.size * m.size);
    $(".me-status").innerHTML = `${status ? `<span class="mstat st-${esc(status)}">${status === "approved" ? "одобрена" : status === "rejected" ? "отклонена" : "на рассмотрении"}</span>` : ""}<span>точек спавна: <b>${sp}</b>/${SPAWN_MAX}</span><span>преград: <b>${Math.round(blk * 100)}%</b></span>`;
    $(".me-checks").innerHTML = checks.errors.length || checks.warnings.length
      ? [...checks.errors.map((e) => `<div class="chk bad">${ic("close")}<span>${esc(errText(e))}</span></div>`), ...checks.warnings.map((e) => `<div class="chk warn">${ic("spark")}<span>${esc(errText(e))}</span></div>`)].join("")
      : `<div class="chk ok">${ic("check")}<span>Проверки пройдены — карту можно сохранить</span></div>`;
  }
  resize(); fit(); recheck(); syncUi();
  // арт грузится не сразу — перерисовать, когда появится
  let lastArt = artVer; const artT = setInterval(() => { if (!el.isConnected) return clearInterval(artT); if (artVer !== lastArt) { lastArt = artVer; chunks.clear(); draw(); } }, 600);
  setTimeout(() => { chunks.clear(); draw(); }, 900);
  return el;
}
const rep = (s: string, i: number, c: string) => s.slice(0, i) + c + s.slice(i + 1);
function blankMap(n: number): MapData { const s = ".".repeat(n * n).split(""); s[(n - 1) * n + (n >> 1)] = "P"; s[n - 1 - (n >> 1)] = "P"; return { id: "draft", name: "Новая карта", size: n, t: ".".repeat(n * n), s: s.join("") }; }
/** Смена размера: содержимое остаётся по центру, точки спавна за краем переносятся к краю. */
function resizeMap(m: MapData, n: number): MapData {
  const o = m.size, d = Math.floor((n - o) / 2), t = ".".repeat(n * n).split(""), s = ".".repeat(n * n).split("");
  for (let y = 0; y < o; y++) for (let x = 0; x < o; x++) { const a = x + d, b = y + d, i = y * o + x; if (a >= 0 && b >= 0 && a < n && b < n) { t[b * n + a] = m.t[i]; s[b * n + a] = m.s[i]; } else if (m.s[i] === "P") { const ca = Math.max(0, Math.min(n - 1, a)), cb = Math.max(0, Math.min(n - 1, b)); s[cb * n + ca] = "P"; t[cb * n + ca] = "."; } }
  return { ...m, size: n, t: t.join(""), s: s.join("") };
}
function swatch(k: CanvasRenderingContext2D, kind: "t" | "s", c: string, P: number) {
  if (kind === "t") { k.fillStyle = T_COL[c]; k.fillRect(0, 0, P, P); drawTerrainCell(k, c, 0, 0, 0, 0, P, () => c); return; }
  k.fillStyle = T_COL["."]; k.fillRect(0, 0, P, P); drawTerrainCell(k, ".", 0, 0, 0, 0, P, () => ".");
  if (!drawStructArt(k, c, 0, 0, P, null, GOLD)) drawStruct(k, c, P / 2, P / 2, P * 0.7, GOLD);
}
/** Карта «как в игре» — тот же рисунок, что в лобби. */
export function previewDlg(m: MapData, title = m.name || "Карта") {
  const md = modal({ id: "mpvdlg", title, sub: `${m.size}×${m.size} · ${LEAGUE[leagueOfSize(m.size)][0]} лига`, icon: "map", cls: "mpvdlg", body: `<div class="mpv-wrap"><canvas></canvas></div>` });
  const c = md.el.querySelector("canvas")!, w = Math.min(innerWidth - 48, innerHeight - 190, 900), d = Math.min(2, devicePixelRatio || 1); c.style.width = c.style.height = w + "px"; c.width = c.height = Math.round(w * d);
  const pnt = () => c.getContext("2d")!.drawImage(terrainLayer(m, Math.min(c.width, 2400), false, SIDE), 0, 0, c.width, c.height); pnt(); setTimeout(pnt, 800);
}

// ---------------------------------------------------------------- хаб
const TABS = [["plays", "Популярные"], ["likes", "По лайкам"], ["new", "Новые"], ["fav", "Избранное"], ["mine", "Мои"]] as const;
const ST_RU: Record<string, string> = { pending: "на рассмотрении", rejected: "отклонена", hidden: "скрыта", approved: "одобрена" };
function thumbCanvas(x: any, px = 132) { const c = document.createElement("canvas"), d = Math.min(2, devicePixelRatio || 1); c.width = c.height = Math.round(px * d); c.style.width = c.style.height = px + "px";
  const paint = () => c.getContext("2d")!.drawImage(terrainLayer({ id: "th:" + x.id, name: x.name, size: x.pn, t: x.pt, s: x.ps } as any, c.width, false, SIDE), 0, 0); paint(); return c; }

export function openMapsHub(ctx: MapsCtx) {
  let tab = "plays", league = "", q = "", admin = false, me = false, list: any[] = [], seq = 0;
  const md = modal({ id: "mapsdlg", title: "Карты игроков", icon: "map", cls: "mapsdlg", body: `
    <div class="mh-bar"><div class="mh-tabs" role="tablist">${TABS.map(([id, t]) => `<button class="mh-tab" data-tab="${id}" role="tab">${t}</button>`).join("")}</div>
      <div class="mh-flt"><select class="mh-lg" aria-label="Лига"><option value="">Все размеры</option>${Object.entries(LEAGUE).map(([k, [n, a, b]]) => `<option value="${k}">${n} · ${a}–${b}</option>`).join("")}</select>
      <input class="mh-q" type="search" placeholder="Поиск: название или автор" maxlength="40"><button class="btn sm gold mh-new">${ic("build")}<span>Создать карту</span></button>
      <button class="btn sm ghost mh-mod" hidden>${ic("crown")}<span>Модерация</span></button></div></div>
    <div class="mh-grid"><div class="empty">Загрузка карт…</div></div>
    <p class="muted mh-foot">В хабе — только карты, одобренные администратором. Свою карту до одобрения видите вы и те, кого вы позовёте по коду; партии на ней — без опыта и рейтинга.</p>` });
  const el = md.el, grid = el.querySelector<HTMLElement>(".mh-grid")!;
  el.querySelectorAll<HTMLButtonElement>("[data-tab]").forEach((b) => (b.onclick = () => { tab = b.dataset.tab!; load(); }));
  el.querySelector<HTMLSelectElement>(".mh-lg")!.onchange = (e) => { league = (e.target as HTMLSelectElement).value; load(); };
  let qt = 0; el.querySelector<HTMLInputElement>(".mh-q")!.oninput = (e) => { q = (e.target as HTMLInputElement).value; clearTimeout(qt); qt = window.setTimeout(load, 300); };
  el.querySelector<HTMLButtonElement>(".mh-new")!.onclick = () => { md.close(); openEditor(ctx); };
  el.querySelector<HTMLButtonElement>(".mh-mod")!.onclick = () => openModeration(ctx);
  async function load() {
    el.querySelectorAll<HTMLElement>("[data-tab]").forEach((b) => b.classList.toggle("on", b.dataset.tab === tab));
    const my = ++seq, sort = tab === "likes" ? "likes" : tab === "new" ? "new" : "plays", t2 = tab === "fav" || tab === "mine" ? tab : "all";
    const r = await ctx.req("map_hub", { sort, tab: t2, league, q }); if (my !== seq) return;
    if (r.err) { grid.innerHTML = `<div class="empty">${esc(errText(r.err))}</div>`; return; }
    list = r.list || []; admin = !!r.admin; me = !!r.me; el.querySelector<HTMLElement>(".mh-mod")!.hidden = !admin; render();
  }
  function render() {
    grid.innerHTML = list.length ? "" : `<div class="empty">${tab === "fav" ? "В избранном пока пусто" : tab === "mine" ? "У вас пока нет карт — «Создать карту»" : "Ничего не нашлось"}</div>`;
    for (const x of list) {
      const card = document.createElement("article"); card.className = "mhc" + (x.status !== "approved" ? " unapproved" : ""); card.dataset.id = x.id;
      card.innerHTML = `<div class="mhc-pv"></div><div class="mhc-b"><b class="mhc-n"></b><small class="mhc-a"></small>
        <div class="mhc-tags"><span class="tag">${x.size}×${x.size}</span><span class="tag l-${x.league}">${LEAGUE[leagueOfSize(x.size)][0]}</span>${x.rated ? `<span class="tag gold">рейтинговая</span>` : ""}${x.showcase ? `<span class="tag">витрина</span>` : ""}${x.status !== "approved" ? `<span class="tag red">${ST_RU[x.status] || x.status}</span><span class="tag red">без опыта и рейтинга</span>` : ""}</div>
        <div class="mhc-st"><span data-tip="Сыграно партий">${ic("sword")}${x.plays}</span><button class="lk ${x.liked ? "on" : ""}" data-a="like" aria-label="Нравится" ${x.status !== "approved" ? "disabled" : ""}>♥ <i>${x.likes}</i></button><button class="fv ${x.faved ? "on" : ""}" data-a="fav" aria-label="В избранное" ${x.status !== "approved" ? "disabled" : ""}>★ <i>${x.favs}</i></button><button data-a="open" aria-label="Комментарии">${ic("chat")}<i>${x.comments}</i></button></div>
        <div class="mhc-act"><button class="btn sm gold" data-a="play"><span>Играть</span></button><button class="btn sm ghost" data-a="open"><span>Подробнее</span></button>${x.mine ? `<button class="btn sm ghost" data-a="edit"><span>Изменить</span></button>` : ""}</div></div>`;
      card.querySelector(".mhc-n")!.textContent = x.name; card.querySelector(".mhc-a")!.textContent = "автор: " + (x.author || "—");
      card.querySelector(".mhc-pv")!.appendChild(thumbCanvas(x)); grid.appendChild(card);
    }
  }
  grid.addEventListener("click", async (e) => {
    const t = e.target as HTMLElement, a = t.closest<HTMLElement>("[data-a]")?.dataset.a, id = t.closest<HTMLElement>("[data-id]")?.dataset.id; if (!id) return; const x = list.find((y) => y.id === id); if (!x) return;
    if (!a) { if (t.closest(".mhc-pv")) openDetail(ctx, x, load); return; }
    if (a === "like" || a === "fav") {
      if (!me) return ctx.toast(MAP_ERR.login_required, "bad"); const on = a === "like" ? !x.liked : !x.faved;
      const r = await ctx.req(a === "like" ? "map_like" : "map_fav", { id, on }); if (r.err) return ctx.toast(errText(r.err), "bad");
      if (a === "like") { x.liked = on; x.likes = r.likes ?? x.likes + (on ? 1 : -1); } else { x.faved = on; x.favs = r.favs ?? x.favs + (on ? 1 : -1); } render(); return;
    }
    if (a === "play") { md.close(); ctx.play(id, x.size, false); }
    if (a === "open") openDetail(ctx, x, load);
    if (a === "edit") { const r = await ctx.req("map_get", { id }); if (r.err) return ctx.toast(errText(r.err), "bad"); md.close(); openEditor(ctx, { map: r.map, descr: r.descr, status: r.status }); }
  });
  load(); return md;
}

async function openDetail(ctx: MapsCtx, x: any, reload: () => void) {
  const md = modal({ id: "mapdet", title: x.name, sub: `${x.size}×${x.size} · ${LEAGUE[leagueOfSize(x.size)][0]} лига · автор: ${esc(x.author || "—")}`, icon: "map", cls: "mapdet", body: `
    <div class="md-grid"><div class="md-pv"><canvas></canvas></div><div class="md-info"><p class="md-descr"></p>
      ${x.status !== "approved" ? `<p class="xpbadge">Без опыта и рейтинга — ${esc(ST_RU[x.status] || x.status)}</p>` : x.rated ? `<p class="muted">Карта в рейтинговом пуле.</p>` : `<p class="muted">Одобрена. Опыт за партии начисляется; в рейтинговые партии её добавляет администратор.</p>`}
      <p class="md-reason muted" hidden></p>
      <div class="row"><button class="btn sm gold" data-a="play"><span>Играть</span></button><button class="btn sm ghost" data-a="bot"><span>С ботом</span></button></div>
      <h4 class="deco-h"><span>Комментарии</span></h4>
      ${x.status === "approved" ? `<div class="md-cin"><textarea maxlength="500" rows="2" placeholder="Ваш отзыв о карте (без ссылок, мат скрывается)"></textarea><button class="btn sm" data-a="send"><span>Отправить</span></button></div>` : ""}
      <div class="md-cl"><div class="empty">Загрузка…</div></div></div></div>` });
  const el = md.el, c = el.querySelector("canvas")!, w = Math.min(420, innerWidth - 40), d = Math.min(2, devicePixelRatio || 1); c.style.width = c.style.height = w + "px"; c.width = c.height = Math.round(w * d);
  const r = await ctx.req("map_get", { id: x.id }); if (!r.err) { const pnt = () => c.getContext("2d")!.drawImage(terrainLayer(r.map, c.width, false, SIDE), 0, 0); pnt(); setTimeout(pnt, 800);
    el.querySelector(".md-descr")!.textContent = r.descr || ""; if (r.reason) { const p = el.querySelector<HTMLElement>(".md-reason")!; p.hidden = false; p.textContent = "Причина отказа: " + r.reason; } }
  async function comments() {
    const r = await ctx.req("map_comments", { id: x.id }), box = el.querySelector<HTMLElement>(".md-cl")!; if (r.err) { box.innerHTML = `<div class="empty">${esc(errText(r.err))}</div>`; return; }
    box.innerHTML = r.list.length ? "" : `<div class="empty">Пока без комментариев</div>`;
    for (const cm of r.list) { const row = document.createElement("div"); row.className = "mcm"; row.innerHTML = `<b></b><time>${new Date(cm.at).toLocaleDateString("ru-RU")}</time><p></p><span class="mcm-a"><button class="lnk" data-r="${cm.id}">пожаловаться</button>${r.admin ? `<button class="lnk red" data-m="del" data-id="${cm.id}">удалить</button><button class="lnk red" data-m="ban" data-id="${cm.id}">удалить и запретить</button>` : ""}</span>`;
      row.querySelector("b")!.textContent = cm.nick; row.querySelector("p")!.textContent = cm.text; box.appendChild(row); }
  }
  el.addEventListener("click", async (e) => {
    const t = e.target as HTMLElement, a = t.closest<HTMLElement>("[data-a]")?.dataset.a;
    if (a === "play" || a === "bot") { md.close(); document.getElementById("mapsdlg")?.remove(); ctx.play(x.id, x.size, a === "bot"); }
    if (a === "send") { const ta = el.querySelector("textarea")!; const r = await ctx.req("map_comment", { id: x.id, text: ta.value }); if (r.err) return ctx.toast(errText(r.err), "bad"); ta.value = ""; comments(); reload(); }
    const rp = t.closest<HTMLElement>("[data-r]"); if (rp) { const r = await ctx.req("map_comment_report", { cid: +rp.dataset.r! }); ctx.toast(r.err ? errText(r.err) : "Жалоба отправлена", r.err ? "bad" : "good"); }
    const mm = t.closest<HTMLElement>("[data-m]"); if (mm) { const r = await ctx.req("map_comment_mod", { cid: +mm.dataset.id!, act: mm.dataset.m }); ctx.toast(r.err ? errText(r.err) : "Готово", r.err ? "bad" : "good"); comments(); }
  });
  comments();
}

// ---------------------------------------------------------------- модерация (Алекс)
export function openModeration(ctx: MapsCtx) {
  let tab = "queue";
  const md = modal({ id: "moddlg", title: "Модерация карт", icon: "crown", cls: "moddlg", body: `<div class="mh-tabs">${[["queue", "Очередь"], ["rated", "Одобренные · рейтинговые"], ["comments", "Жалобы на комментарии"]].map(([k, t]) => `<button class="mh-tab" data-tab="${k}">${t}</button>`).join("")}</div>
    <p class="muted">Ничего не публикуется само: карта появляется в хабе только после «Одобрить». Жалобы лишь возвращают карту в очередь. В рейтинговые партии карту добавляете вы — переключатель «Рейтинговая».</p><div class="mod-body"><div class="empty">Загрузка…</div></div>` });
  const el = md.el, body = el.querySelector<HTMLElement>(".mod-body")!;
  el.querySelectorAll<HTMLButtonElement>("[data-tab]").forEach((b) => (b.onclick = () => { tab = b.dataset.tab!; load(); }));
  async function load() {
    el.querySelectorAll<HTMLElement>("[data-tab]").forEach((b) => b.classList.toggle("on", b.dataset.tab === tab)); body.innerHTML = `<div class="empty">Загрузка…</div>`;
    if (tab === "rated") {
      const r = await ctx.req("map_rated"); if (r.err) { body.innerHTML = `<div class="empty">${esc(errText(r.err))}</div>`; return; }
      body.innerHTML = `<table class="modt"><thead><tr><th>Карта</th><th>Размер</th><th>Лига</th><th>Автор</th><th>Рейтинговая</th></tr></thead><tbody></tbody></table>`; const tb = body.querySelector("tbody")!;
      for (const x of r.list) { const tr = document.createElement("tr"); tr.innerHTML = `<td></td><td>${x.size}×${x.size}</td><td>${LEAGUE[leagueOfSize(x.size)][0]}</td><td></td><td><label class="tgl"><input type="checkbox" ${x.rated ? "checked" : ""}><span></span></label></td>`;
        tr.children[0].textContent = x.name; tr.children[3].textContent = x.author_nick || "—";
        const cb = tr.querySelector("input")!; cb.onchange = async () => { const q = await ctx.req("map_pool", { id: x.id, on: cb.checked }); if (q.err) { cb.checked = !cb.checked; ctx.toast(errText(q.err), "bad"); } else ctx.toast(cb.checked ? "Добавлена в рейтинговые" : "Убрана из рейтинговых", "good"); };
        tb.appendChild(tr); }
      return;
    }
    const r = await ctx.req("map_queue"); if (r.err) { body.innerHTML = `<div class="empty">${esc(errText(r.err))}</div>`; return; }
    if (tab === "comments") {
      const cs = r.comments || []; body.innerHTML = cs.length ? "" : `<div class="empty">Жалоб нет</div>`;
      for (const cm of cs) { const row = document.createElement("div"); row.className = "mcm"; row.innerHTML = `<b></b><time>жалоб: ${cm.reports}</time><p></p><span class="mcm-a"><button class="btn sm ghost" data-m="keep"><span>Оставить</span></button><button class="btn sm" data-m="del"><span>Удалить</span></button><button class="btn sm red" data-m="ban"><span>Удалить и запретить</span></button></span>`;
        row.querySelector("b")!.textContent = cm.nick + " · " + cm.map_id; row.querySelector("p")!.textContent = cm.text;
        row.querySelectorAll<HTMLButtonElement>("[data-m]").forEach((b) => (b.onclick = async () => { const q = await ctx.req("map_comment_mod", { cid: cm.id, act: b.dataset.m }); ctx.toast(q.err ? errText(q.err) : "Готово", q.err ? "bad" : "good"); load(); })); body.appendChild(row); }
      return;
    }
    body.innerHTML = r.list.length ? "" : `<div class="empty">Очередь пуста</div>`;
    for (const x of r.list) {
      const row = document.createElement("div"); row.className = "modrow2"; const ch = x.checks || { errors: [], warnings: [] };
      row.innerHTML = `<div class="mr-pv"></div><div class="mr-b"><b class="nm"></b><span class="muted">${x.size}×${x.size} · ${LEAGUE[leagueOfSize(x.size)][0]} · ${esc(ST_RU[x.status] || x.status)}${x.flagged ? " · жалоб: " + x.flagged : ""}</span><span class="muted au"></span>
        <div class="${ch.errors.length ? "chk bad" : "chk ok"}">${ch.errors.length ? "ошибки: " + esc(ch.errors.map(errText).join("; ")) : "проверки пройдены"}${ch.warnings.length ? " · " + esc(ch.warnings.map(errText).join("; ")) : ""}</div>
        <div class="row"><button class="btn sm ghost" data-a="view"><span>Просмотр</span></button><button class="btn sm ghost" data-a="test"><span>Проверить в игре</span></button><button class="btn sm gold" data-a="approve"><span>Одобрить</span></button><button class="btn sm" data-a="reject"><span>Отклонить</span></button><button class="btn sm ghost" data-a="hide"><span>Скрыть</span></button>${x.flagged ? `<button class="btn sm ghost" data-a="clear_flag"><span>Снять жалобы</span></button>` : ""}</div></div>`;
      row.querySelector(".nm")!.textContent = x.name; row.querySelector(".au")!.textContent = "автор: " + (x.author_nick || x.author) + (x.flag_note ? " · жалоба: " + x.flag_note : "");
      const mp: MapData = { id: x.id, name: x.name, size: x.size, t: x.t, s: x.s }; const pc = document.createElement("canvas"), d = Math.min(2, devicePixelRatio || 1); pc.width = pc.height = Math.round(120 * d); pc.style.width = pc.style.height = "120px";
      pc.getContext("2d")!.drawImage(terrainLayer(mp, pc.width, false, SIDE), 0, 0); row.querySelector(".mr-pv")!.appendChild(pc);
      row.querySelectorAll<HTMLButtonElement>("[data-a]").forEach((b) => (b.onclick = async () => {
        const act = b.dataset.a!; if (act === "view") return previewDlg(mp); if (act === "test") { md.close(); document.getElementById("mapsdlg")?.remove(); return ctx.play(x.id, x.size, true); }
        let reason: string | undefined; if (act === "reject") { reason = (await promptDlg("Отклонить карту", "Причина отказа (увидит автор)", "Отклонить")) || ""; if (!reason.trim()) return; }
        const q = await ctx.req("map_mod", { id: x.id, act, reason }); ctx.toast(q.err ? errText(q.err) : "Готово: " + (ST_RU[q.status] || q.status), q.err ? "bad" : "good"); load();
      }));
      body.appendChild(row);
    }
  }
  load(); return md;
}
