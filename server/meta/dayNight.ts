// @ts-nocheck
// Смена дня и ночи в открытом мире (Аринар). Часы — реальное время Europe/Kiev, источник — сервер (у всех одно небо).
// Чистые функции — общие для сервера и клиента (engine/dayNight.js): фаза, прогресс перехода, цвет-грейд, сила огней.
// Админка «🌗 День и ночь» (DN_CFG): времена, темнота ночи, ключевые цвета, «форс-время» и ускорение для тестов.
// Забеги (Vampire Survivors) — не трогаем: клиент применяет только в мире arinar.

export const DN_CFG: any = {
  on: true,
  tz: "Europe/Kiev",       // часовой пояс (IANA); не поддержан — utcOffsetH
  utcOffsetH: 3,
  duskStart: "19:30",      // закат: 30 мин плавно
  night: "20:00",          // полная ночь
  dawnStart: "05:30",      // рассвет: 30 мин плавно
  day: "06:00",            // полный день
  nightDark: 0.84,         // темнота полной ночи (0 — нет, 1 — чёрная); свет — только у источников
  lightsOn: 0.35,          // на закате огни начинают загораться с этой доли перехода…
  lightsFull: 0.85,        // …и горят в полную силу отсюда (на рассвете — обратно)
  playerLightM: 6,         // радиус личного света героя, м
  mobLight: 1,             // свечение мобов (глаза/огни), ×
  townLight: 1,            // огни города/лагерей/пропсов, ×
  force: "",               // «HH:MM» — принудительное время (тест); пусто — реальное
  speed: 1,                // ускорение часов в режиме force (60 — минута за секунду)
  // ключевые цвета (умножение на сцену). Закат: день → золото → розово-фиолетовый → глубокая синяя ночь
  cDay: "#ffffff", cGolden: "#ffc27a", cPink: "#c77aa8", cNight: "#2a3a7a",
  // рассвет: ночь → холодный фиолет/розовый → мягкое тепло → нейтральный день
  cDawnViolet: "#7d6cc4", cDawnPink: "#d89ab8", cDawnWarm: "#ffe2b8",
};

const hm = (s: string, d: number) => { const m = /^(\d{1,2}):(\d{2})$/.exec(String(s || "").trim()); return m ? (Number(m[1]) % 24) * 60 + Math.min(59, Number(m[2])) : d; };
export const smooth = (x: number) => { x = Math.max(0, Math.min(1, x)); return x * x * (3 - 2 * x); };
/** мягкий ease-in-out (синус): без рывка в начале и конце перехода, но заметное движение уже с первых минут */
export const easeIO = (x: number) => { x = Math.max(0, Math.min(1, x)); return 0.5 - 0.5 * Math.cos(Math.PI * x); };
const spd = (v: any) => { const n = Number(v); return Number.isFinite(n) && n >= 0 ? n : 1; };
export function hex3(c: string, d: [number, number, number] = [1, 1, 1]): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(c || "")); if (!m) return d; const v = parseInt(m[1], 16); return [((v >> 16) & 255) / 255, ((v >> 8) & 255) / 255, (v & 255) / 255];
}
const lerp3 = (a: number[], b: number[], t: number): [number, number, number] => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
/** путь по ключевым цветам: keys [[p, rgb]], p 0…1, плавно (smoothstep на отрезке) */
function path(keys: [number, number[]][], p: number): [number, number, number] {
  for (let i = 1; i < keys.length; i++) if (p <= keys[i][0]) { const [a, ca] = keys[i - 1], [b, cb] = keys[i]; return lerp3(ca, cb, smooth((p - a) / Math.max(1e-6, b - a))); }
  return lerp3(keys[keys.length - 1][1], keys[keys.length - 1][1], 0);
}
/** минуты от полуночи в часовом поясе tz (дробные) */
export function zoneMinutes(ms: number, cfg = DN_CFG): number {
  try {
    const f = new Intl.DateTimeFormat("en-GB", { timeZone: cfg.tz || "Europe/Kiev", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" });
    const p = Object.fromEntries(f.formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
    return (Number(p.hour) % 24) * 60 + Number(p.minute) + (Number(p.second) + (ms % 1000) / 1000) / 60;
  } catch { const d = new Date(ms + (Number(cfg.utcOffsetH) || 0) * 3600000); return d.getUTCHours() * 60 + d.getUTCMinutes() + (d.getUTCSeconds() + d.getUTCMilliseconds() / 1000) / 60; }
}
const inArc = (m: number, a: number, b: number) => (a <= b ? m >= a && m < b : m >= a || m < b);
const arcP = (m: number, a: number, b: number) => { const L = (b - a + 1440) % 1440 || 1440; return ((m - a + 1440) % 1440) / L; };

export interface DnState { phase: "day" | "dusk" | "night" | "dawn"; p: number; dark: number; color: [number, number, number]; lights: number; min: number }
/** состояние неба в минуту суток m: цвет-умножение (грейд + темнота), сила огней 0…1, темнота 0…1 */
export function dnAt(m: number, cfg = DN_CFG): DnState {
  m = ((m % 1440) + 1440) % 1440;
  const ds = hm(cfg.duskStart, 1170), ns = hm(cfg.night, 1200), ws = hm(cfg.dawnStart, 330), dy = hm(cfg.day, 360);
  const nd = Math.max(0, Math.min(1, Number(cfg.nightDark) ?? 0.84));
  const night = hex3(cfg.cNight, [0.16, 0.23, 0.48]); const nm = Math.max(night[0], night[1], night[2], 1e-3);
  const N = night.map((c) => (c / nm) * (1 - nd)) as [number, number, number]; // оттенок ночи × яркость
  const D = hex3(cfg.cDay), lo = Number(cfg.lightsOn) || 0.35, hi = Math.max(lo + 0.01, Number(cfg.lightsFull) || 0.85);
  const br = (c: [number, number, number], k: number) => c.map((x) => x * k) as [number, number, number];
  if (cfg.on === false) return { phase: "day", p: 0, dark: 0, color: [1, 1, 1], lights: 0, min: m };
  if (inArc(m, ds, ns)) { // закат
    const p = arcP(m, ds, ns), e = easeIO(p);
    // цвет — по ключевым кадрам во времени (плавно на каждом отрезке), темнота — ease-in-out
    const color = path([[0, D], [0.33, br(hex3(cfg.cGolden, [1, 0.76, 0.48]), 0.97)], [0.66, br(hex3(cfg.cPink, [0.78, 0.48, 0.66]), 0.62 + 0.3 * (1 - nd))], [1, N]], p);
    return { phase: "dusk", p, dark: e * nd, color, lights: smooth((p - lo) / (hi - lo)), min: m };
  }
  if (inArc(m, ws, dy)) { // рассвет
    const p = arcP(m, ws, dy), e = easeIO(p);
    const color = path([[0, N], [0.33, br(hex3(cfg.cDawnViolet, [0.49, 0.42, 0.77]), 0.42 + 0.3 * (1 - nd))], [0.62, br(hex3(cfg.cDawnPink, [0.85, 0.6, 0.72]), 0.78)], [0.85, br(hex3(cfg.cDawnWarm, [1, 0.89, 0.72]), 0.96)], [1, D]], p);
    return { phase: "dawn", p, dark: (1 - e) * nd, color, lights: 1 - smooth((p - (1 - hi)) / (hi - lo)), min: m };
  }
  if (inArc(m, ns, ws)) return { phase: "night", p: 0, dark: nd, color: N, lights: 1, min: m };
  return { phase: "day", p: 0, dark: 0, color: D, lights: 0, min: m };
}
// ——— сервер: «форс-время» с ускорением (отсчёт от момента установки) ———
let FORCE = { key: "", at: 0, min: 0 };
export function dnMinutes(now = Date.now(), cfg = DN_CFG): number {
  const f = String(cfg.force || "").trim();
  if (!f) { FORCE.key = ""; return zoneMinutes(now, cfg); }
  const key = f + "|" + cfg.speed; if (FORCE.key !== key) FORCE = { key, at: now, min: hm(f, 720) };
  return (FORCE.min + ((now - FORCE.at) / 60000) * spd(cfg.speed)) % 1440;
}
/** клиенту: настройки + текущая минута и скорость хода часов (клиент интерполирует между сообщениями) */
export function dnClient(now = Date.now()) {
  const c = DN_CFG, rate = String(c.force || "").trim() ? spd(c.speed) : 1;
  return { cfg: { on: c.on, duskStart: c.duskStart, night: c.night, dawnStart: c.dawnStart, day: c.day, nightDark: c.nightDark, lightsOn: c.lightsOn, lightsFull: c.lightsFull, playerLightM: c.playerLightM, mobLight: c.mobLight, townLight: c.townLight,
    cDay: c.cDay, cGolden: c.cGolden, cPink: c.cPink, cNight: c.cNight, cDawnViolet: c.cDawnViolet, cDawnPink: c.cDawnPink, cDawnWarm: c.cDawnWarm }, min: dnMinutes(now), rate, at: now };
}
