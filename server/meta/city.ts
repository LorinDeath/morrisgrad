// Город под куполом (MorrisCurse, Аринар): безопасная зона выживших на месте первой чёрной розы.
// Модуль БЕЗ импортов: его читают зона/сервис (правила), раскладка мира arinarLayout.ts (земля, пропсы, коллайдеры — одинаково
// у сервера и клиента), клиент (отрисовка купола/домов) и админка (CITY_CFG — вкладка «🏰 Город», PK_CFG — «⚔ PK»).
// Клетка мира = 32 px. Купол 64×64 клетки = радиус 32 клетки (1024 px).
//
// Правила (всё — сервер):
//  • внутри купола урон = 0: игроки не бьют мобов и друг друга, мобы и маг не бьют игроков, снаряды через край гаснут;
//  • мобы внутрь не заходят (выталкиваются за край), лагеря/бродячие внутри не появляются;
//  • «убийца» (PK-режим, или ≥ killerP убийств игроков, или ≥ killerM убийств мобов за windowMin минут) внутрь не войдёт:
//    купол выталкивает (как барьер Чёрного мага) и показывает, через сколько можно войти;
//  • убийства, сделанные из-под любого купола (город, купол/сфера мага), не считаются.
import { ROSE_ADJ } from "./bmCfg";
export const CITY_TILE = 32;
export const CITY_SLOTS = 12; // мест для NPC (админка: включить, имя, вид, точка, дом)
export const CITY_LOOKS = ["petr", "kyut", "alzi", "leyr"]; // вид NPC-заглушки (листы героев NPC_ROWS) — пока нет своих спрайтов жителей

// ——— раскладка (клетки от центра; +x — восток, +y — юг) ———
const R2 = (x: number, y: number) => x * x + y * y;
/** чёрная роза (первая, prod) — клумба на севере площади; центр города смещён на 4 клетки к югу, чтобы в самом центре встал фонтан */
export const ROSE_DX = 0, ROSE_DY = -4;
const H = (x: number, y: number, s: number) => { let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(s, 1442695041)) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
/** поля (вспаханные борозды), огороды, кладбище — прямоугольники в клетках */
const FIELDS = [{ x0: 9, y0: 14, x1: 22, y1: 22 }, { x0: -25, y0: -22, x1: -14, y1: -15 }];
const GARDENS = [{ x0: -4, y0: -12, x1: -2, y1: -8 }, { x0: -16, y0: 5, x1: -14, y1: 9 }, { x0: 14, y0: 6, x1: 16, y1: 10 }, { x0: 11, y0: -11, x1: 13, y1: -8 }];
const GRAVES = { x0: -7, y0: -26, x1: -2, y1: -21 };
const inR = (r: any, x: number, y: number) => x >= r.x0 && x <= r.x1 && y >= r.y0 && y <= r.y1;
/** тропинки от дверей до главных дорог (крест |dx|≤1 / |dy|≤1) */
function pathCells(): Set<number> {
  const s = new Set<number>(), k = (x: number, y: number) => (x + 512) * 1024 + (y + 512);
  // к палаткам и полям
  for (let x = 2; x <= 15; x++) s.add(k(x, -15)); for (let y = 2; y <= 13; y++) s.add(k(17, y));
  for (let x = -16; x <= -2; x++) s.add(k(x, 15)); for (let y = -14; y <= -2; y++) s.add(k(-19, y));
  return s;
}
let PATHS: Set<number> | null = null;
export type CityCell = { t: string; m: number; wall?: 1 }; // t — тайл (имя в tiles_atlas), m — маска оттенка: 1 очернённая земля, 2 пробивается трава, 3 пол/камень (без оттенка), 4 поле
/** клетка (dx, dy) от центра: что лежит (тайл + маска); null — вне купола */
export function cityCell(dx: number, dy: number, rTiles = CITY_CFG.rTiles): CityCell | null {
  if (R2(dx + 0.5, dy + 0.5) > rTiles * rTiles) return null;
  PATHS ??= pathCells();
  const h = H(dx, dy, 31), pick = (a: string[]) => a[Math.floor(H(dx, dy, 7) * a.length) % a.length];
  const rr = R2(dx, dy);
  const PR = Math.max(4, Number(CITY_CFG.plazaTiles) || 6);
  if (rr <= PR * PR) { // центральная площадь: в центре — фонтан (позже статуя), вокруг — кольцо рун; клумба у розы (север площади)
    const fr = Math.max(1, Number(CITY_CFG.centerFreeTiles) || 3);
    if (rr <= fr * fr) return { t: Math.abs(Math.sqrt(rr) - (fr - 0.6)) < 0.6 ? "plaza_rune" : pick(["plaza0", "plaza2", "plaza3"]), m: 3 };
    if (R2(dx - ROSE_DX, dy - ROSE_DY) <= 1.6 * 1.6) return { t: pick(["garden0", "garden1"]), m: 2 };
    return { t: pick(["cobble0", "cobble1", "cobble2", "plaza1"]), m: 3 };
  }
  if ((Math.abs(dx) <= 1 || Math.abs(dy) <= 1)) return { t: pick(["dirt0", "dirt1", "dirt2"]), m: 1 };   // главные дороги к четырём воротам
  if (PATHS.has((dx + 512) * 1024 + (dy + 512))) return { t: pick(["dirt0", "dirt1", "dirt2"]), m: 1 };
  for (const f of FIELDS) if (inR(f, dx, dy)) return { t: (dy & 1) ? "dirt2" : pick(["dirt0", "dirt1"]), m: 4 }; // борозды через ряд
  for (const g of GARDENS) if (inR(g, dx, dy)) return { t: pick(["garden0", "garden1", "garden2"]), m: 2 };
  if (inR(GRAVES, dx, dy)) return { t: pick(["rot1", "rot2", "waste1"]), m: 1 };
  // трава пробивается: чаще у колодцев, огородов и домов, реже к краю купола
  const near = Math.max(0, 1 - Math.sqrt(rr) / rTiles), gp = (CITY_CFG.grassPct / 100) * (0.55 + near * 0.9);
  if (h < gp) return { t: pick(["grass0", "grass1", "grass2", "grass3"]), m: 2 };
  return { t: pick(["rot0", "rot1", "rot2", "rot3", "crater0", "waste2"]), m: 1 };
}
export interface CityProp { k: string; x: number; y: number; s: number; f: boolean } // как пропсы раскладки (px мира)
/** все пропсы города (px мира от центра cx, cy) — детерминированно */
export function cityProps(cx: number, cy: number, rTiles = CITY_CFG.rTiles): CityProp[] {
  const T = CITY_TILE, out: CityProp[] = [], P = (k: string, tx: number, ty: number, s = 1, f = false) => out.push({ k, x: cx + tx * T, y: cy + ty * T, s, f });
  // площадь «от центра»: фонтан (отдельный объект CENTERPIECE — рисует клиент, коллайдер — cityWallColliders), фонари кольцом,
  // низкая ограда-клумба вокруг розы на севере площади, скамьи-ящики, колодцы — на дорогах за площадью
  const PR = Math.max(4, Number(CITY_CFG.plazaTiles) || 6);
  for (let a = 0; a < 8; a++) { const g = (a / 8) * Math.PI * 2 + Math.PI / 8; P("lantern", Math.cos(g) * (PR - 0.6) + 0.5, Math.sin(g) * (PR - 0.6) + 0.5); }
  for (let a = 0; a < 7; a++) { const g = (a / 7) * Math.PI * 2 + 0.45; P("fence", ROSE_DX + 0.5 + Math.cos(g) * 1.7, ROSE_DY + 0.9 + Math.sin(g) * 1.5, 0.7, a % 2 === 0); }
  P("banner", -1.6, -PR + 0.4, 1.05); P("banner", 2.6, -PR + 0.4, 1.05, true);
  P("crate", -4.2, 2.2, 0.75); P("crate", 4.8, 2.2, 0.75, true); P("barrel", -4.4, -2.0, 0.7);
  P("well", 3.6, PR + 2.6); P("well", 14.5, 2.6); P("campfire", -PR - 1.5, 3.8, 0.9);
  // фонари вдоль дорог, флаги у ворот
  for (let d = 8; d < rTiles - 3; d += 6) { P("lantern", 2.2, d + 0.5); P("lantern", -1.7, -d); P("lantern", d, -1.6); P("lantern", -d - 0.5, 2.3); }
  for (const [x, y] of [[0, -1], [0, 1], [1, 0], [-1, 0]]) { const r = rTiles - 2.2; P("banner", x * r + y * 2.6, y * r + x * 2.6 + 0.4); P("banner", x * r - y * 2.6, y * r - x * 2.6 + 0.4, 1, true); }
  P("signpost", 2.6, rTiles - 4); P("signpost", -2.6, -rTiles + 4.5, 1, true);
  // палатки беженцев (СВ и ЮЗ) с кострами
  for (const [x, y, f] of [[12, -19, 0], [16.5, -20, 1], [19.5, -16, 0], [13, -13.5, 1], [18, -12, 0]] as [number, number, number][]) P("tent", x, y, 1, !!f);
  P("campfire", 15.5, -16); P("crate", 14.4, -15.2, 0.9); P("barrel", 17.2, -17.6, 0.9);
  for (const [x, y, f] of [[-18.5, 13.5, 1], [-13.5, 18.5, 0], [-19.5, 19, 0], [-10.5, 13, 1]] as [number, number, number][]) P("tent", x, y, 1, !!f);
  P("campfire", -15.5, 16.2); P("crate", -16.8, 15, 0.85);
  // поля: ограда по периметру, огородные кусты
  for (const f of FIELDS) {
    for (let x = f.x0; x <= f.x1 + 1; x += 2) { P("fence", x, f.y0 - 0.2, 0.8); P("fence", x, f.y1 + 1.1, 0.8, true); }
    for (let y = f.y0 + 1; y <= f.y1; y += 2) { P("fence", f.x0 - 0.3, y, 0.8); P("fence", f.x1 + 1.2, y, 0.8, true); }
  }
  for (const g of GARDENS) for (let x = g.x0; x <= g.x1; x++) for (let y = g.y0; y <= g.y1; y += 2) if (H(x, y, 5) < 0.55) P(H(x, y, 6) < 0.5 ? "bush" : "violets", x + 0.5, y + 0.6, 0.6 + H(x, y, 8) * 0.25);
  // кладбище: надгробия рядами
  for (let x = GRAVES.x0; x <= GRAVES.x1; x += 2) for (let y = GRAVES.y0; y <= GRAVES.y1; y += 2) if (H(x, y, 9) < 0.8) P("tombstone", x + 0.5, y + 0.8, 0.8 + H(x, y, 10) * 0.2, H(x, y, 11) < 0.5);
  P("dead_tree", GRAVES.x0 - 1.5, GRAVES.y0 + 1);
  // окраина: сухие деревья, кусты, грибы (кое-где жизнь)
  for (let i = 0; i < 60; i++) {
    const a = H(i, 1, 21) * Math.PI * 2, r = (0.72 + H(i, 2, 22) * 0.24) * rTiles, x = Math.cos(a) * r, y = Math.sin(a) * r;
    const cell = cityCell(Math.floor(x), Math.floor(y), rTiles); if (!cell || cell.m === 3 || cell.m === 4 || Math.abs(x) < 3 || Math.abs(y) < 3) continue;
    const q = H(i, 3, 23); P(q < 0.45 ? "dead_tree" : q < 0.7 ? "bush" : q < 0.85 ? "mushroom" : "rock", x, y, 0.8 + H(i, 4, 24) * 0.3, H(i, 5, 25) < 0.5);
  }
  return out.filter((p) => R2(p.x - cx, p.y - cy) < (rTiles * T - 20) ** 2);
}
/** центральный объект площади: сейчас фонтан, позже статуя — меняется в админке (centerpiece), место вокруг свободно */
export const CENTERPIECES: Record<string, { name: string; r: number }> = { fountain: { name: "Фонтан", r: 1.6 }, statue: { name: "Статуя (место зарезервировано)", r: 1.2 }, none: { name: "Пусто", r: 0 } };
/** центральный объект → коллайдер (здания и пропсы dm_* — cityBuild.ts → buildingColliders) */
export function cityWallColliders(cx: number, cy: number): { x: number; y: number; rx: number; ry: number }[] {
  const T = CITY_TILE, out: any[] = [], ci = Math.floor(cx / T), cj = Math.floor(cy / T);
  const cp = CENTERPIECES[CITY_CFG.centerpiece] || CENTERPIECES.fountain; if (cp.r > 0) out.push({ x: (ci + 0.5) * T, y: (cj + 0.5) * T, rx: cp.r * T, ry: cp.r * T * 0.8 });
  return out;
}
/** места NPC по умолчанию (клетки от центра): у дверей, на площади, у палаток, у полей */
const SLOT_DEF: [number, number, string, string, string][] = [
  [0, 0, "elder", "table", "Староста"], [0, 0, "smith", "hearth", "Кузнец"], [0, 0, "healer", "hearth", "Знахарка"], [0, 0, "inn", "merchant", "Трактирщица"],
  [2.5, -6.5, "", "", "Сторож у розы"], [16, -14.5, "", "", "Беженец"], [-15, 14.5, "", "", "Беженка"], [12, 13.5, "", "", "Пахарь"],
  [0, 0, "scribe", "table", "Писарь"], [0, 0, "inn", "patron", "Бард"], [0, 0, "store", "merchant", "Лавочник"], [-3.5, -21.5, "", "", "Могильщик"],
];

// ——— настройки (админка) ———
export const CITY_CFG: any = {
  name: "Альказак",         // название города (вход, карта, подсказки)
  on: true,                 // город есть (выкл — купол, запреты и NPC пропадают; раскладка земли остаётся до перезапуска)
  x: 24624, y: 3376,        // центр (клетка фонтана), px мира: первая чёрная роза (prod black_roses id 1792366351175927, «Ледник Жертв») — на 4 клетки севернее, клумба на площади
  plazaTiles: 6,            // радиус центральной площади, клеток
  centerpiece: "fountain",  // в центре площади: fountain — фонтан, statue — статуя (место зарезервировано), none — пусто
  centerFreeTiles: 3,       // свободное место вокруг центрального объекта, клеток
  rTiles: 40,               // радиус купола, клеток (80×80 клеток, финальный купол Историка R = 40 → 1280 px). Земля/дома строятся при старте сервера
  alphaIn: 0.02,            // купол изнутри: непрозрачность (0.02 = прозрачность 98 %)
  alphaOut: 0.28,           // купол снаружи
  rim: 0.55,                // яркость ободка (френель)
  color: "#8b5cf6",         // цвет купола
  noDamage: true,           // внутри — урон 0 (атаки, навыки, снаряды, статусы — в обе стороны)
  mobsOut: true,            // мобы не заходят внутрь, лагеря внутри убраны
  nodesOut: true,           // узлы ресурсов под куполом — сразу за край (после перезапуска)
  pushExtraTiles: 1,        // выталкивание убийцы: за край + N клеток
  killerPOn: true,          // убийца: убил игроков
  killerP: 1,               //   столько игроков (1 — сразу)
  killerMOn: true,          // убийца: убил мобов
  killerM: 5,               //   столько мобов
  windowMin: 10,            //   за последние N минут
  pkBlocked: true,          // в PK-режиме внутрь нельзя
  denyMsgSec: 2,            // сообщение «купол не пускает» не чаще раза в N с
  groundTint: 0.55,         // очернение земли (0 — как тайлы, 1 — почти чёрная)
  grassPct: 16,             // трава пробивается: %
  interiorOf: { house_log: "house_living", house_plank: "shop_tavern", tent: "tent" }, // дверь пропса (door.interior) → комната interiors_dark.json
  // роза в центре (prod black_roses id 1792366351175927 — первая роза, вокруг неё город): сразу раскрыта, без проклятой земли.
  // Только в коде (данные prod не меняются); остальные розы растут и проклинают как обычно. Внутри купола проклятая земля любых роз не действует.
  roseId: "1792366351175927", roseBloom: true, roseNoCurse: true, noCurseIn: true,
  // места NPC: npc.N.on / name / title / look / house + spot (место в комнате, npc_spots интерьера) или dx / dy (клетки от центра при R = 32, снаружи)
  npc: SLOT_DEF.map(([dx, dy, house, spot, name]) => ({ on: false, name, title: "житель города", look: CITY_LOOKS[0], dx, dy, house, spot })),
};
export const PK_CFG: any = {
  on: true,                 // PK-режим доступен
  enterSec: 7,              // включить: ждать N с без боя
  exitSec: 30,              // выключить: ждать N с без боя
  defense: "retaliate",     // retaliate — не-PK может отвечать PK, который его ударил (не становится убийцей); none — не может
  defendSec: 30,            // право ответа длится N с после удара PK
  dmgMult: 1,               // урон по игрокам, × (от урона по мобу без разницы уровней)
  color: "#ef4444",         // цвет имени PK (видят все)
};
export const POS_CFG: any = {
  on: true,                 // вход/переподключение — в том же мире и точке (выкл — как раньше, в хабе)
  saveSec: 60,              // позиция пишется не чаще раза в N с (и всегда при смене мира и выходе)
};
export const cityR = () => Math.max(1, Number(CITY_CFG.rTiles) || 32) * CITY_TILE;
export const cityOn = () => CITY_CFG.on !== false;
/** интерьеры зданий города лежат вне мира (обе координаты < ROOM_LIMIT, cityBuild.ts) — это тоже город */
export const ROOM_LIMIT = -10000;
export function inCity(x: number, y: number, pad = 0) { if (!cityOn()) return false; if (x < ROOM_LIMIT && y < ROOM_LIMIT) return true; const R = cityR() + pad; return (x - CITY_CFG.x) ** 2 + (y - CITY_CFG.y) ** 2 <= R * R; }
/** точка за краем купола (луч от центра) */
export const ROOM_OUT: { f: null | ((x: number, y: number) => [number, number] | null) } = { f: null }; // из интерьера — к двери здания (cityBuild.ts)
export function pushOut(x: number, y: number, extraPx = 0): [number, number] {
  if (x < ROOM_LIMIT && y < ROOM_LIMIT) { const o = ROOM_OUT.f?.(x, y); [x, y] = o || [CITY_CFG.x, CITY_CFG.y + 1]; }
  const dx = x - CITY_CFG.x, dy = y - CITY_CFG.y, L = Math.hypot(dx, dy), k = cityR() + extraPx;
  const ux = L > 1 ? dx / L : 0, uy = L > 1 ? dy / L : 1; return [CITY_CFG.x + ux * k, CITY_CFG.y + uy * k];
}
/** отрезок пересекает край купола (снаряд влетает/вылетает) */
/** узел ресурса под куполом → сразу за край по тому же лучу (genNodes: одинаково на сервере и клиенте; растёт с rTiles) */
export function cityNodeSpot(x: number, y: number): [number, number] | null {
  if (!cityOn() || CITY_CFG.nodesOut === false || !inCity(x, y, 24)) return null;
  const a = Math.atan2(y - CITY_CFG.y, x - CITY_CFG.x), d = cityR() + 2 * CITY_TILE;
  return [Math.round(CITY_CFG.x + Math.cos(a) * d), Math.round(CITY_CFG.y + Math.sin(a) * d)];
}
export function crossesCity(x0: number, y0: number, x1: number, y1: number) { return inCity(x0, y0) !== inCity(x1, y1); }
// розы: поправки города (bmCfg.ROSE_ADJ) — роза центра раскрыта и без проклятия, купол гасит проклятие любых роз
ROSE_ADJ.f = (id: number) => (cityOn() && String(id) === String(CITY_CFG.roseId) ? { bloom: CITY_CFG.roseBloom !== false, nc: CITY_CFG.roseNoCurse !== false } : null);
ROSE_ADJ.noCurseAt = (x: number, y: number) => CITY_CFG.noCurseIn !== false && inCity(x, y);

// ——— убийцы: журнал убийств за окно (в памяти сервера, ключ — pkey) ———
export class KillLog {
  m = new Map<string, number[]>(); p = new Map<string, number[]>();
  /** засчитать убийство; fromDome — убийца стоял под куполом (город/маг): не считается */
  note(pkey: string, kind: "m" | "p", fromDome: boolean, now = Date.now()): boolean {
    if (!pkey || fromDome) return false;
    const M = kind === "m" ? this.m : this.p, a = M.get(pkey) || []; a.push(now); this.trim(a, now); M.set(pkey, a); return true;
  }
  win() { return Math.max(0.1, Number(CITY_CFG.windowMin) || 10) * 60000; }
  trim(a: number[], now: number) { const lo = now - this.win(); while (a.length && a[0] <= lo) a.shift(); if (a.length > 200) a.splice(0, a.length - 200); }
  /** убийца ли (без PK): until — когда перестанет (мс, 0 — не убийца), why — причина */
  status(pkey: string, now = Date.now()): { killer: boolean; until: number; why: "" | "p" | "m"; n: number } {
    let until = 0, why: "" | "p" | "m" = "", n = 0;
    const chk = (kind: "p" | "m", on: boolean, need: number) => {
      const a = (kind === "m" ? this.m : this.p).get(pkey); if (!on || !a) return; this.trim(a, now); need = Math.max(1, Math.round(need) || 1);
      if (a.length >= need) { const u = a[a.length - need] + this.win(); if (u > until) { until = u; why = kind; n = a.length; } } // свободен, когда в окне останется need−1
    };
    chk("p", CITY_CFG.killerPOn !== false, CITY_CFG.killerP); chk("m", CITY_CFG.killerMOn !== false, CITY_CFG.killerM);
    return { killer: until > now, until, why, n };
  }
  count(pkey: string, kind: "m" | "p", now = Date.now()) { const a = (kind === "m" ? this.m : this.p).get(pkey); if (!a) return 0; this.trim(a, now); return a.length; }
  gc(now = Date.now()) { for (const M of [this.m, this.p]) for (const [k, a] of M) { this.trim(a, now); if (!a.length) M.delete(k); } }
}

// ——— PK-режим: переключение с ожиданием без боя (сервер-авторитет) ———
export interface PkState { pk: boolean; to: boolean | null; at: number; dur: number; def: Map<string, number> } // def — sid PK, которым можно ответить → до
export const newPk = (): PkState => ({ pk: false, to: null, at: 0, dur: 0, def: new Map() });
/** нажатие кнопки: старт отсчёта (к противоположному) или отмена идущего; возвращает событие для клиента */
export function pkToggle(s: PkState, now = Date.now()): { k: "start" | "cancel" | "off"; to?: boolean; sec?: number } {
  if (PK_CFG.on === false && !s.pk) return { k: "off" };
  if (s.to !== null) { s.to = null; return { k: "cancel" }; }
  s.to = !s.pk; s.at = now; s.dur = Math.max(0, Number(s.to ? PK_CFG.enterSec : PK_CFG.exitSec) || 0) * 1000;
  return { k: "start", to: s.to, sec: s.dur / 1000 };
}
/** бой (нанёс или получил урон): отсчёт сбрасывается; true — был отсчёт */
export function pkInterrupt(s: PkState): boolean { if (s.to === null) return false; s.to = null; return true; }
/** такт: отсчёт дошёл — режим сменился (true) */
export function pkTick(s: PkState, now = Date.now()): boolean {
  if (s.to === null) return false;
  if (now - s.at < s.dur) return false;
  s.pk = s.to; s.to = null; if (!s.pk) s.def.clear(); return true;
}
export const pkLeft = (s: PkState, now = Date.now()) => (s.to === null ? 0 : Math.max(0, Math.ceil((s.at + s.dur - now) / 1000)));
/** может ли a ударить b в PvP. inSafeA/B — стоят в безопасной зоне (город, купол мага, хаб) */
export function pvpAllowed(a: PkState, b: PkState, bSid: string, safeA: boolean, safeB: boolean, now = Date.now()): "pk" | "def" | "" {
  if (safeA || safeB) return "";
  if (a.pk) return "pk";
  if (PK_CFG.defense === "retaliate" && b.pk) { const u = a.def.get(bSid); if (u !== undefined && u > now) return "def"; }
  return "";
}
/** PK ударил не-PK: у того появляется право ответа */
export function pkGrantDefense(victim: PkState, attackerSid: string, now = Date.now()) { victim.def.set(attackerSid, now + Math.max(1, Number(PK_CFG.defendSec) || 30) * 1000); }
