// Боевые эффекты на доске (аудит fx-audit.md): разряд, лечение, щит/корни, залп, падение Вождя, выпад, хит-стоп.
// Арт — fx-v1 Художника (/strat/art/fx/fx-manifest.json, webp; собирает tools/strat/sync_fx.py): лист кадров + якорь.
// Имена анимаций — в FX_ART (можно переопределить: localStorage "strat.fxArt" = JSON {ключ: имя}; ?fxArt=0 — всё кодом).
// Своего «кодового арта» нет (решение Алекса t1177/t1178): нет файла в манифесте — эффект просто пропускается (без запросов и 404).
// Код рисует только движение: выпад, хит-стоп 60 мс, тряску (выключены при «уменьшить движение»).
export const FX_ART: Record<string, string> = {
  zapHit: "fx_discharge", zapArc: "fx_discharge_arc", heal: "fx_heal", spawn: "fx_spawn", levelup: "fx_levelup", cityGrow: "fx_city_grow", ignite: "fx_ignite", slow: "fx_slow",
  burn: "fx_status_burn", chill: "fx_status_chill", shield: "fx_status_shield", roots: "fx_status_root", heal_st: "fx_status_heal", guard: "fx_status_guard", buff: "fx_status_buff",
  volley: "proj_", ent: "ent_nature_", chiefBanner: "banner_chief_fallen_blank", // volley/ent — префиксы: proj_<раса>, ent_nature_<поза>
  ult_doom: "fx_ult_doom", ult_blink: "fx_ult_blink", ult_dome: "fx_ult_dome", ult_blizzard: "fx_ult_blizzard", ult_tide: "fx_ult_tide", ult_grove: "fx_ult_grove",
};
try { Object.assign(FX_ART, JSON.parse(localStorage.getItem("strat.fxArt") || "{}")); } catch { /* битый JSON — по умолчанию */ }
type Anim = { src: string; w: number; h: number; fr: number[][]; fps: number; anchor?: number[]; loop?: number[] | boolean | null; nameField?: any; subPlate?: any };
const off = typeof location !== "undefined" && new URLSearchParams(location.search).get("fxArt") === "0";
let man: Record<string, Anim> = {};
const imgs = new Map<string, HTMLImageElement>();
/** «Уменьшить движение»: без выпада, хит-стопа и тряски. */
export const calm = () => typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Ленивая загрузка: сразу — статусы, удары, снаряды, энт, оверлеи (нужны в каждом ходе); ульты и баннеры — по требованию
 *  (want) и фоном после старта (requestIdleCallback), чтобы первый кадр ульты не был пустым. */
const LAZY = /^(fx_ult_|banner_)/;
let onUpd: () => void = () => {}; const pend = new Set<string>(), waiters = new Map<string, ((i: HTMLImageElement | null) => void)[]>();
function want(nm: string) {
  if (imgs.has(nm) || pend.has(nm) || !man[nm]) return; pend.add(nm); const a = man[nm], i = new Image(); i.decoding = "async";
  const done = (ok: boolean) => { pend.delete(nm); if (ok) imgs.set(nm, i); (waiters.get(nm) || []).forEach((f) => f(ok ? i : null)); waiters.delete(nm); if (ok) onUpd(); };
  i.onload = () => done(true); i.onerror = () => { console.warn("[strat] эффект не загрузился, пропускаю:", a.src); done(false); }; i.src = a.src;
}
export async function loadFx(onUpdate: () => void, url = "/strat/art/fx/fx-manifest.json") {
  if (off) return; onUpd = onUpdate;
  try { const r = await fetch(url, { cache: "no-cache" }); if (!r.ok) return; man = await r.json(); } catch { return; }
  for (const k of Object.keys(man)) if (!LAZY.test(k)) want(k);
  const rest = () => { for (const k of Object.keys(man)) want(k); }; const ric = (window as any).requestIdleCallback;
  if (ric) ric(rest, { timeout: 8000 }); else setTimeout(rest, 3000);
}
/** картинка арта (грузит, если ещё нет); null — нет в манифесте / не загрузилась */
export function fxImg(key: string): Promise<HTMLImageElement | null> {
  const nm = FX_ART[key] || key; if (!man[nm]) return Promise.resolve(null); const im = imgs.get(nm); if (im) return Promise.resolve(im);
  return new Promise((res) => { (waiters.get(nm) || waiters.set(nm, []).get(nm)!).push(res); want(nm); if (!pend.has(nm) && !imgs.has(nm)) res(null); });
}
/** есть ли загруженный арт для ключа FX_ART */
export function hasFx(key: string) { const nm = FX_ART[key] || key; return !!(man[nm] && imgs.get(nm)); }
export function fxDur(key: string) { const a = man[FX_ART[key] || key]; return a ? (a.fr.length / (a.fps || 16)) * 1000 : 0; }
/** кадр анимации key в момент age (мс), центр якоря — (x, y), высота кадра = size px. false — арта нет / закончилась. */
export function drawFxArt(ctx: CanvasRenderingContext2D, key: string, x: number, y: number, size: number, age: number, opt: { rot?: number; len?: number; loop?: boolean } = {}): boolean {
  const nm = FX_ART[key] || key, a = man[nm], im = imgs.get(nm); if (a && !im) want(nm); if (!a || !im || age < 0) return false;
  let i = Math.floor((age / 1000) * (a.fps || 16));
  if (i >= a.fr.length) { if (!opt.loop) return false; const [l0, l1] = Array.isArray(a.loop) ? a.loop : [1, a.fr.length]; i = l0 - 1 + ((i - l0 + 1) % (l1 - l0 + 1)); }
  const [fx, fy, fw, fh] = a.fr[i], [ax, ay] = a.anchor || [fw / 2, fh / 2], k = size / fh;
  ctx.save(); ctx.translate(x, y); if (opt.rot) ctx.rotate(opt.rot);
  const sxk = opt.len ? opt.len / fw : k; ctx.drawImage(im, fx, fy, fw, fh, -ax * sxk, -ay * k, fw * sxk, fh * k); ctx.restore();
  return true;
}

/** URL статичной картинки (баннер) или null */
export function fxUrl(key: string) { const nm = FX_ART[key] || key; return man[nm] && imgs.get(nm) ? man[nm].src : null; }
/** метаданные арта (name_field баннера и т.п.) */
export function fxMeta(key: string): Anim | null { const nm = FX_ART[key] || key; return man[nm] || null; } // только манифест; картинка — fxImg
/** Энт (призыв Природы): арт ent_nature_<поза> (idle — анимация idle_anim), якорь в ногах = (cx, gy). false — арта нет. */
export function drawEnt(ctx: CanvasRenderingContext2D, pose: string, cx: number, gy: number, cell: number, now: number): boolean {
  const pre = FX_ART.ent; if (!pre) return false; const h = cell * 1.05;
  if (pose === "attack") gy -= (9 / 256) * h; // в позе attack ноги на 9 px (из 256) ниже линии земли — README fx-v1
  if (pose === "idle" && drawFxArt(ctx, pre + "idle_anim", cx, gy, h, now, { loop: true })) return true;
  return drawFxArt(ctx, pre + pose, cx, gy, h, 0) || drawFxArt(ctx, pre + "idle", cx, gy, h, 0);
}

// ---------- состояние ----------
type Pt = [number, number];
const arcs: { a: Pt; b: Pt; t: number }[] = [];
const shots: { a: Pt; b: Pt; t: number; k: string }[] = [];
const anims: { key: string; x: number; y: number; t: number; s: number }[] = [];
const lunges = new Map<number, { dx: number; dy: number; t: number }>();
const LUNGE_MS = 230, STOP_MS = 60;
let stopAt = 0, stopUntil = 0;
/** дуга разряда a→b (fx_discharge_arc) + удар в b (fx_discharge); нет арта — ничего */
export function addArc(a: Pt, b: Pt, now: number) { if (hasFx("zapArc")) arcs.push({ a, b, t: now }); addAnim("zapHit", b[0], b[1], now); }
/** снаряд залпа proj_<раса> летит от стрелка к цели (остриё — якорь, ~0,55 клетки) */
export function addShot(a: Pt, b: Pt, now: number, race = "fire") { const k = (FX_ART.volley || "") + race; if (FX_ART.volley && hasFx(k)) shots.push({ a, b, t: now, k }); }
export function addAnim(key: string, x: number, y: number, now: number, s = 1.3) { if (hasFx(key)) anims.push({ key, x, y, t: now, s }); }
/** выпад атакующего к цели (доля клетки); с «уменьшить движение» — нет */
export function addLunge(id: number, from: Pt, to: Pt, now: number) {
  if (calm()) return; const dx = Math.sign(to[0] - from[0]), dy = Math.sign(to[1] - from[1]); if (dx || dy) lunges.set(id, { dx, dy, t: now });
}
/** смещение фигуры от выпада в клетках */
export function lungeOf(id: number, now: number): Pt {
  const l = lunges.get(id); if (!l) return [0, 0]; const k = (now - l.t) / LUNGE_MS; if (k >= 1) { lunges.delete(id); return [0, 0]; }
  const e = k < 0.45 ? k / 0.45 : 1 - (k - 0.45) / 0.55, d = 0.22 * Math.sin((e * Math.PI) / 2); return [l.dx * d, l.dy * d];
}
/** хит-стоп 60 мс: кадр удара держится */
export function hitStop(now: number) { if (calm()) return; stopAt = now + 17; stopUntil = now + 17 + STOP_MS; }
export function inHitStop(now: number) { return now >= stopAt && now < stopUntil; }
export const hitStopLeft = (now: number) => Math.max(0, stopUntil - now);
export function resetFx2() { arcs.length = shots.length = anims.length = 0; lunges.clear(); stopAt = stopUntil = 0; marks.clear(); }

// ---------- отрисовка ----------
type SX = (v: number) => number;
/** Разовые эффекты поверх фигур. Возвращает true, пока что-то идёт. */
export function drawFx2(ctx: CanvasRenderingContext2D, sx: SX, sy: SX, z: number, now: number): boolean {
  const C = (x: number, y: number): Pt => [sx(x) + z / 2, sy(y) + z / 2];
  for (let i = arcs.length - 1; i >= 0; i--) { const a = arcs[i], age = now - a.t, A = C(...a.a), B = C(...a.b);
    if (age > 520 || !drawFxArt(ctx, "zapArc", A[0], A[1], z * 0.55, age, { rot: Math.atan2(B[1] - A[1], B[0] - A[0]), len: Math.hypot(B[0] - A[0], B[1] - A[1]), loop: true })) arcs.splice(i, 1); }
  for (let i = shots.length - 1; i >= 0; i--) { const s = shots[i], age = now - s.t, A = C(...s.a), B = C(...s.b), k = Math.min(1, age / 300);
    const L = z * 0.55, an = man[s.k], hh = an ? (L * an.h) / an.w : L * 0.4, ang = Math.atan2(B[1] - A[1] - Math.cos(Math.PI * k) * Math.PI * z * 0.4, B[0] - A[0]); // по касательной к дуге
    if (k >= 1 || !drawFxArt(ctx, s.k, A[0] + (B[0] - A[0]) * k, A[1] + (B[1] - A[1]) * k - Math.sin(Math.PI * k) * z * 0.4, hh, age, { rot: ang, len: L, loop: true })) shots.splice(i, 1); }
  for (let i = anims.length - 1; i >= 0; i--) { const a = anims[i], [x, y] = C(a.x, a.y); if (!drawFxArt(ctx, a.key, x, y, z * a.s, now - a.t)) anims.splice(i, 1); }
  return arcs.length + shots.length + anims.length + lunges.size > 0 || now < stopUntil;
}
/** Стойкие метки статусов на фигуре (поджог, обморожение, щит, корни, энт): петля арта, пока статус висит; снят — метка исчезает.
 *  st — ключи FX_ART активных статусов. Возвращает true, если что-то нарисовано (нужна перерисовка). */
const ICON_OF: Record<string, string> = { burn: "overlay_burn", chill: "overlay_chill", shield: "overlay_shield", roots: "overlay_root", heal_st: "overlay_heal", guard: "overlay_guard", buff: "overlay_buff" };
const marks = new Map<string, number>(); // `${id}:${key}` → начало
export function drawStatusMarks(ctx: CanvasRenderingContext2D, id: number, st: string[], X: number, Y: number, z: number, now: number): boolean {
  let any = false;
  const small = z < 34; // мелкий масштаб — статичная иконка overlay_<статус>_32/64 в углу клетки вместо анимации
  let ii = 0;
  for (const key of st) { if (small) { const ic = ICON_OF[key]; const nm = ic && (z * devicePixelRatio > 40 ? ic + "_64" : ic + "_32"); if (nm && drawFxArt(ctx, nm, X + z * (0.82 - 0.3 * ii), Y + z * 0.2, z * 0.4, 0)) ii++; continue; } // статично — перерисовка не нужна
    const mk = id + ":" + key; let t0 = marks.get(mk); if (t0 == null) { t0 = now; marks.set(mk, t0); }
    const a = man[FX_ART[key] || key], foot = a?.anchor && a.anchor[1] > a.h * 0.75; // fx_status_* — якорь в ногах (как спрайт фигуры)
    if (drawFxArt(ctx, key, X + z / 2, foot ? Y + z * 0.86 : Y + z / 2, foot ? z * 1.05 : z * 1.3, now - t0, { loop: true })) any = true; }
  return any;
}
/** забыть метки снятых статусов (вызывать раз в кадр со списком живых `${id}:${key}`) */
export function pruneMarks(live: Set<string>) { for (const k of marks.keys()) if (!live.has(k)) marks.delete(k); }
