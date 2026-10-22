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
export const CITY_SLOTS = 24; // мест для NPC (админка: включить, имя, вид, точка, дом)
export const CITY_LOOKS = ["petr", "kyut", "alzi", "leyr"]; // вид NPC-заглушки (листы героев NPC_ROWS) — пока нет своих спрайтов жителей

// ——— раскладка (клетки от центра; +x — восток, +y — юг) ———
const R2 = (x: number, y: number) => x * x + y * y;
/** чёрная роза (первая, prod) — клумба на севере площади; центр города смещён на 4 клетки к югу, чтобы в самом центре встал фонтан */
export const ROSE_DX = 0, ROSE_DY = -4;
const H = (x: number, y: number, s: number) => { let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(s, 1442695041)) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
// земля, пропсы, здания и проходимость — карта Историка (cityMap.ts ← alkazak_map.json); прежняя процедурная раскладка удалена
/** центральный объект площади: сейчас фонтан, позже статуя — меняется в админке (centerpiece), место вокруг свободно */
export const CENTERPIECES: Record<string, { name: string; r: number }> = { fountain: { name: "Фонтан", r: 1.6 }, statue: { name: "Статуя (место зарезервировано)", r: 1.2 }, none: { name: "Пусто", r: 0 } };
/** места NPC по умолчанию: снаружи — точки карты Историка (клетки от центра, alkazak_map.json → points), внутри — здание + npc_spots
 *  его интерьера. У каждого здания — свой экземпляр комнаты и свои места (шаблонов интерьера 3, зданий 11). */
// NPC в городе пока НЕТ (решение пользователя): места — только данные, все выключены (включаются в админке, когда появятся настоящие жители)
const SLOT_DEF: [number, number, string, string, string, boolean, string?][] = [
  [-4, -5.75, "", "", "Староста", false, "right"], [8.5, -8.875, "", "", "Хозяин таверны", false, "down"], [-4, -1.75, "", "", "Торговка", false, "right"],
  [-12, 3.25, "", "", "Огородник", false, "down"], [30, 15.25, "", "", "Беженка", false, "up"], [-35, 2.25, "", "", "Дозорный", false, "left"],
  [0, 0, "tavern", "merchant", "Хозяйка таверны", false], [0, 0, "tavern", "patron", "Бард", false], [0, 0, "house_elder", "hearth", "Жена старосты", false],
  [0, 0, "tent_e1", "bedroll", "Беженец", false], [0, 0, "tent_s1", "supplies", "Беженка с ребёнком", false], [0, 0, "house_sw1", "table", "Охотник", false],
  [0, 0, "house_nw2", "table", "Жилец", false], [0, 0, "house_n1", "hearth", "Жилица", false], [0, 0, "house_n2", "table", "Жилец", false],
  [0, 0, "house_se1", "hearth", "Жилица", false], [0, 0, "house_s1", "table", "Жилец", false], [0, 0, "tent_s2", "bedroll", "Беженец", false],
  [0, 0, "tavern", "customer", "Посетитель", false], [0, 0, "tavern", "hearth", "Путник", false], [0, 0, "house_elder", "table", "Писарь", false],
  [0, 0, "house_nw2", "bed", "Больной", false], [0, 0, "house_n1", "bed", "Старик", false], [0, 0, "house_s1", "hearth", "Жилица", false],
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
  alphaOut: 0.9,            // купол снаружи (финальная оболочка Историка: 0.9 снаружи, 0.02 изнутри, переход ≈ 0.7 с)
  rim: 0.55,                // яркость ободка (френель)
  color: "#8b5cf6",         // цвет купола
  noDamage: true,           // внутри — урон 0 (атаки, навыки, снаряды, статусы — в обе стороны)
  mobsOut: true,            // мобы не заходят внутрь, лагеря внутри убраны
  mobPushPx: 40,            //   моб у купола: выталкивается за край на столько px
  mobAggroPadPx: 0,         //   цель ушла под купол глубже края на столько px — моб теряет цель (0 — сразу за кольцом: внутри урон 0 в обе стороны, моб не «висит» на краю)
  mobBossesOut: true,       //   боссы тоже не заходят (выкл — босс может войти; агро всё равно сбрасывается, урон внутри 0)
  mobDomeFlash: true,       //   вспышка купола, когда он выталкивает моба (тот же эффект, что у игрока; не чаще раза в 3 с на моба)
  nodesOut: true,           // узлы ресурсов под куполом — сразу за край (после перезапуска)
  pushExtraTiles: 1,        // выталкивание убийцы: за край + N клеток
  killerPOn: true,          // убийца: убил игроков
  killerP: 1,               //   столько игроков (1 — сразу)
  killerMOn: true,          // убийца: убил мобов
  killerM: 5,               //   столько мобов
  windowMin: 10,            //   за последние N минут
  pkBlocked: true,          // в PK-режиме внутрь нельзя
  denyMsgSec: 2,            // сообщение «купол не пускает» не чаще раза в N с
  groundLight: 1.35,        // (integ: пайплайн pixColor темнит тайлы — днём город читается) яркость земли города (тайлы tiles_dark): 1 — как нарисовано, >1 светлее (днём не «чёрная»), <1 темнее; вживую
  fadeSec: 0.6,             // купол: переход прозрачности при входе/выходе, с (до ~95 %)
  fadeBandPx: 32,           // …полоса перехода у края, px (по обе стороны радиуса)
  ringOn: true,             // линия края купола на земле по всему кругу (только вид; север купола рисуется «в небе» — на земле края не было)
  ringA: 0.9,               //   непрозрачность линии
  ringW: 5,                 //   ширина яркой линии, px мира
  ringGlow: 4,              //   ореол вокруг линии, × ширины (0 — без ореола)
  blightOn: true,           // пятно порчи под розой (только вид)
  blightSize: 1,            // …размер, ×
  blightK: 1,               // …сила (непрозрачность и искры), ×
  groundTint: 0.55,         // очернение земли (0 — как тайлы, 1 — почти чёрная)
  grassPct: 16,             // трава пробивается: %
  interiorOf: { house_log: "house_living", house_plank: "shop_tavern", tent: "tent" }, // дверь пропса (door.interior) → комната interiors_dark.json
  // роза в центре (prod black_roses id 1792366351175927 — первая роза, вокруг неё город): сразу раскрыта, без проклятой земли.
  // Только в коде (данные prod не меняются); остальные розы растут и проклинают как обычно. Внутри купола проклятая земля любых роз не действует.
  roseId: "1792366351175927", roseBloom: true, roseNoCurse: true, noCurseIn: true,
  rosePos: [24608, 3232],   // центр травяной клумбы (решение пользователя: роза на траве, не на досках); где РИСОВАТЬ розу города (точка карты Историка; только отрисовка, данные black_roses не меняются)
  // места NPC: npc.N.on / name / title / look / house + spot (место в комнате, npc_spots интерьера) или dx / dy (клетки от центра при R = 32, снаружи)
  npc: SLOT_DEF.map(([dx, dy, house, spot, name, on, f], i) => ({ on, name, title: "житель города", look: CITY_LOOKS[i % CITY_LOOKS.length], dx, dy, f: f || "down", house, spot })),
};
export const PK_CFG: any = {
  on: true,                 // PK-режим доступен
  enterSec: 7,              // включить: ждать N с без боя
  exitSec: 30,              // выключить: ждать N с без боя
  defense: "retaliate",     // retaliate — не-PK может отвечать PK, который его ударил (не становится убийцей); none — не может
  defendSec: 30,            // право ответа длится N с после удара PK
  dmgMult: 1,               // урон по игрокам, × (от урона по мобу без разницы уровней)
  color: "#ef4444",         // цвет имени PK (видят все)
  barFrom: "#f8fafc",       // полоса отсчёта над героем: вход — из этого цвета в barTo, выход — обратно
  barTo: "#dc2626",
  barCancel: "#94a3b8",     // сброс отсчёта боем — полоса гаснет этим цветом
  barW: 54,                 // ширина полосы над героем, px экрана
  tagText: "PK",            // значок слева от имени (PK-режим и убийцы); порядок: PK → АДМИН → имя
  tagBg: "#7f1d1d",
  tagFg: "#fee2e2",
  tagGlow: "#ef4444",
  tagKiller: true,
  cancelOnHit: true,        // отсчёт PK (вход/выход) сбрасывает полученный урон
  cancelOnDeal: true,       // …и нанесённый урон          // значок и красное имя — также у убийц (убил игрока / N мобов за окно), не только в PK-режиме
};
/** вид PK для клиентов (cityClient): цвета/подписи из админки */
export const pkUi = () => ({ color: PK_CFG.color, barFrom: PK_CFG.barFrom, barTo: PK_CFG.barTo, barCancel: PK_CFG.barCancel, barW: Number(PK_CFG.barW) || 54, tagText: String(PK_CFG.tagText || "PK").slice(0, 6), tagBg: PK_CFG.tagBg, tagFg: PK_CFG.tagFg, tagGlow: PK_CFG.tagGlow, tagKiller: PK_CFG.tagKiller !== false, enterSec: Number(PK_CFG.enterSec) || 0, exitSec: Number(PK_CFG.exitSec) || 0 });
/** публичное состояние PK для всех (stats игрока в снимке): pkT 0 — нет отсчёта, 1 — входит, 2 — выходит; pkP — доля 0…1; pkD — длительность, с;
 *  pkC — счётчик сбросов (боем/отменой — клиент показывает гаснущую полосу); pkK — убийца по журналу купола */
export function pkPublic(st: any, s: PkState, killer: boolean, now = Date.now()) {
  const t = s.to === null ? 0 : s.to ? 1 : 2;
  st.pk = s.pk ? 1 : 0; st.pkT = t; st.pkD = t ? Math.round(s.dur / 100) / 10 : 0;
  st.pkP = t && s.dur > 0 ? Math.min(1, Math.round(((now - s.at) / s.dur) * 1000) / 1000) : 0;
  st.pkC = (s as any).cancels || 0; st.pkK = killer ? 1 : 0;
}
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

/** запасы «моб ↔ купол» из админки (Город → Безопасная зона), в пределах — как в форме */
export const cityMobPushPx = () => { const v = Number(CITY_CFG.mobPushPx); return Number.isFinite(v) ? Math.max(0, Math.min(400, v)) : 40; };
export const cityMobAggroPadPx = () => { const v = Number(CITY_CFG.mobAggroPadPx); return Number.isFinite(v) ? Math.max(0, Math.min(200, v)) : 0; };
/** купол для зоны мобов (Zone.keepOut): мобы не заходят, выталкиваются на mobPushPx; боссы — по mobBossesOut; агро — сброс с запасом
 *  mobAggroPadPx; вспышка купола — mobDomeFlash. Деспауна/убийства у края нет намеренно (иначе фарм опыта, заманивая мобов к куполу) */
export function cityKeepOut() {
  return {
    inside: (x: number, y: number, pad = 0) => CITY_CFG.mobsOut !== false && inCity(x, y, pad),
    out: (x: number, y: number) => pushOut(x, y, cityMobPushPx()),
    skip: (_m: unknown, boss: boolean) => CITY_CFG.mobBossesOut === false && boss, // boss — от зоны (ZONE_MOBS[тип].boss или особый «босс»)
    aggroPad: () => cityMobAggroPadPx(),
    around: (x: number, y: number, dx: number, dy: number): [number, number] => { // касательная к куполу в сторону цели (обход по ободу)
      const rx = x - CITY_CFG.x, ry = y - CITY_CFG.y, L = Math.hypot(rx, ry) || 1; let tx = -ry / L, ty = rx / L; if (tx * dx + ty * dy < 0) { tx = -tx; ty = -ty; } return [tx, ty]; },
    flash: () => CITY_CFG.mobDomeFlash !== false,
  };
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
  if (s.to !== null) { s.to = null; (s as any).cancels = ((s as any).cancels || 0) + 1; return { k: "cancel" }; }
  s.to = !s.pk; s.at = now; s.dur = Math.max(0, Number(s.to ? PK_CFG.enterSec : PK_CFG.exitSec) || 0) * 1000;
  return { k: "start", to: s.to, sec: s.dur / 1000 };
}
/** бой (нанёс или получил урон): отсчёт сбрасывается; true — был отсчёт */
export function pkInterrupt(s: PkState): boolean { if (s.to === null) return false; s.to = null; (s as any).cancels = ((s as any).cancels || 0) + 1; return true; }
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
export function pkGrantDefense(victim: PkState, attackerSid: string, now = Date.now()) {
  if (victim.def.size > 16) for (const [sid, t] of victim.def) if (t <= now) victim.def.delete(sid); // истёкшие права ответа — не копятся
  victim.def.set(attackerSid, now + Math.max(1, Number(PK_CFG.defendSec) || 30) * 1000); }
/** PK-состояние можно выгрузить (последняя сессия вышла): нет отсчёта и живых прав ответа; флаг pk — в аккаунте */
export function pkIdle(s: PkState, now = Date.now()) { if (s.to !== null) return false; for (const t of s.def.values()) if (t > now) return false; return true; }
