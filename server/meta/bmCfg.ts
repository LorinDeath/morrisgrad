// «Чёрный маг» — все настройки (админка «🌑 Чёрный маг», kind='bmage', id='main'; значения ниже — исходные из кода).
// Модуль без импортов: его читают зона, профиль (очернение статов), квесты и клиент — без циклов зависимостей.
// Клетка мира = 32 px (1 тайл ТЗ). Время роста роз — реальные дни (сервер), в dev можно «перемотать» (bmClock.offset).
export const BM_TILE = 32;
export const DAY_MS = 86_400_000;
export const BM_CFG = {
  on: true,                 // маг есть в мире (выкл — исчезает; купола/розы остаются и живут по своим часам)
  // ——— перемещение ———
  tpEveryMin: 50,           // телепорт в случайную точку Аринара (кроме центральной площади), мин
  hubPadTiles: 20,          // запас от края центральной площади (Гранатовый двор), клеток
  speed: 38,                // шаг, px/с (герой ≈ 160): «медленно, уверенно»
  wanderTiles: 6,           // гуляет вокруг точки телепорта, клеток
  protectTiles: 10,         // «рядом идёт бой» (маг→защищаемый) — идёт защищать, клеток
  stepBetween: true,        // встаёт между игроком и мобом, которого тот бьёт
  // ——— купола ———
  domeTiles: 8,             // РАДИУС купола, клеток (арт v4: Ø16 клеток = 512 px; inDome и отрисовка — один радиус)
  domeLifeSec: 3600,        // живёт (реальное время), с — переживает телепорт мага и перезапуск сервера
  domeCdMin: 30,            // боевой купол: перерыв, с (случайно от…до)
  domeCdMax: 160,
  smallDomeOn: true,        // МАЛАЯ сфера вокруг мага (арт fx_small_dome): игрок ближе smallTriggerTiles бьёт мага или моба рядом с ним
  smallDomeTiles: 2.5,      //   радиус, клеток (Ø5 = 160 px)
  smallDomeLifeSec: 20,     //   живёт, с
  smallDomeCdSec: 15,       //   перерыв между малыми сферами, с
  smallTriggerTiles: 5,     //   маг→защищаемый ближе N клеток — малая сфера НА ЦЕЛИ (дальше — большой купол); удар по самому магу с N клеток — сфера на маге
  smallCastTiles: 4,        //   подходит к цели до N клеток и ставит малую сферу
  bigCastTiles: 7,          // большой купол: подходит к цели до N клеток и ставит купол С СОБОЙ В ЦЕНТРЕ (цель точно внутри радиуса 8)
  bigCastMinTiles: 5,       //   запас: если цель отходит — догоняет до N клеток
  worldDomesMax: 5,         // случайные купола по миру — максимум одновременно
  worldDomeEveryMin: 6,     // маг ставит случайный купол раз в, мин (случайно от…до)
  worldDomeEveryMax: 20,
  domesHardCap: 60,         // предохранитель: всего куполов (боевые + случайные)
  domeAggro: true,          // удар по тому, кого защищает купол, = нападение на мага
  // ——— выстрел чёрной магии ———
  compressTiles: 2,         // сжатие пространства вокруг мага (в куполе убивает любого моба, даже босса; без опыта и добычи)
  arrowPct: 1,              // стрела вне купола: % макс. ОЗ цели за попадание
  arrowRate: 10,            //   выстрелов в секунду
  arrowTiles: 0.25,         //   ширина снаряда, клеток
  arrowDomePct: 2,          // маг в куполе: стрела ×2 — % макс. ОЗ
  arrowDomeRate: 7,         //   выстрелов в секунду
  arrowDomeTiles: 0.5,      //   ширина снаряда (полклетки)
  arrowSpeed: 620,          // скорость стрел, px/с
  rangeTiles: 14,           // дальность стрельбы, клеток
  volleyMin: 1,             // длительность очереди, с (случайно от…до)
  volleyMax: 15,
  volleyGapMin: 2,          // пауза между очередями, с
  volleyGapMax: 6,
  explTiles: 1.5,           // взрыв каждого выстрела: радиус, клеток (цель не задевает)
  explPct: 5,               //   урон другим игрокам, % макс. ОЗ
  hitBlk: 0.1,              // попадание стрелы мага: +N % очернения КАЖДОЙ надетой вещи сразу (раньше — только при смерти)
  explBlk: 0.2,               //   +% очернения надетым вещам задетых
  // ——— выстрелы игроков из купола (PvP): купол их не гасит, они становятся «чёрными» ———
  pvpShot: true,            // выкл — вылетают обычными (купол всё равно не гасит исходящие)
  pvpShotPct: 2,            // попадание чёрного выстрела по другому игроку, % макс. ОЗ (как стрела мага из купола) + счёт попаданий
  pvpExplPct: 5,            // чёрный взрыв в конце полёта: урон игрокам рядом (кроме стрелка), % макс. ОЗ
  pvpExplBlk: 0.2,            //   +% очернения надетым вещам задетых
  aggroForgetSec: 180,      // забывает напавшего, если тот не нападал, с (было 60)
  leashTiles: 120,          // дальше — не преследует, клеток (было 30)
  chaseSpeedMul: 3,         // погоня за напавшим: скорость × N (38 → 114 px/с; было ×1)
  blinkOn: true,            // рывок к убегающему напавшему
  blinkTriggerTiles: 12,    //   напавший дальше N клеток — рывок
  blinkToTiles: 6,          //   приземляется в N клетках от него
  blinkCdSec: 5,            //   не чаще раза в N с
  selfDomeOn: true,         // нападение на самого мага: барьер вокруг мага + напавший вытолкнут (выкл — как раньше: малая сфера только вблизи)
  selfBigDome: true,        //   напавший дальше smallTriggerTiles (до радиуса купола+2) — большой купол с магом в центре, ближе — малая сфера
  selfDomeLifeSec: 120,     //   большой купол от нападения на мага живёт, с (защитные — domeLifeSec)
  selfDomeCdSec: 8,         //   большой купол от нападения не чаще раза в N с (на перерыве — малая сфера; стоящий купол и так выталкивает)
  pushExtraTiles: 1,        // выталкивание: за край купола + N клеток (было 0 — край + 28 px)
  hitsForgetSec: 600,       // счётчик попаданий мага по игроку сгорает без новых попаданий, с
  // ——— очернение вещей ———
  blkK: 1,                  // очернённые статы = статы вещи × очернение% × k (то, что ушло из обычных)
  // ——— вид очернения (только отрисовка; уровень героя считает сервер и рассылает всем в players_state.stats.bk) ———
  blkVisOn: true,           // выкл — ни значки, ни герой не темнеют (цифры в подсказках остаются)
  blkVisItemMax: 0.85,      // значок вещи при 100%: сила затемнения 0…1
  blkVisCharMax: 1,         // герой при полном очернении: сила затемнения 0…1 (1 — чёрный силуэт с фиолетовым ободком)
  blkVisCurve: 0.7,         // кривая: сила = max × (очернение/100)^кривая (<1 — заметно уже на малых, >1 — копится к концу)
  blkGlitch: true,          // глитч чёрной половины героя: строки сдвигаются на 1 px вправо
  blkGlitchHz: 0.7,         //   раз в секунду
  heroLight: 1,             // яркость спрайтов героев (0.82 гасило засвет SpriteMaterial; засвет исправлен в engine/pixColor.js — 1 = как в атласе)
  blkVisMode: "avg",      // очернение героя: slots — Σ по 5 слотам / 5 (пустой слот = 0), avg — среднее надетых, max — самая чёрная вещь
  // ——— чёрные розы ———
  sproutDays: 3,            // росток, реальных дней
  budDays: 2,               // бутон
  openDays: 5,              // раскрытие зелёного бутона
  curseTilesPerDay: 1,      // раскрытая роза: проклятая земля растёт на N клеток в день
  curseMaxTiles: 30,        // предел радиуса проклятой земли одной розы, клеток (производительность)
  groundTalentsOff: false,  // проклятая земля выключает и таланты/ветку души (по умолчанию — только вещи и бонус комплекта)
  trailSec: 1,              // чёрный след: «заражает» на N с (пока только визуал)
} as any;
/** часы мага: offset — только dev («перемотка» роста роз и куполов для плейтестов), в проде всегда 0 */
export const bmClock = { offset: 0, now: () => Date.now() + bmClock.offset };

// ——— розы: стадии по возрасту (реальное время сервера) ———
// 7 стадий арта (black_rose.json): 0 росток, 1–3 стебель (рост), 4 бутон, 5 раскрытие, 6 раскрыта.
export function roseStage(ageMs: number): number {
  const d = Math.max(0, ageMs) / DAY_MS, s = BM_CFG.sproutDays, b = BM_CFG.budDays, o = BM_CFG.openDays;
  if (d < s) { const f = d / s; return f < 1 / 6 ? 0 : f < 1 / 2 ? 1 : f < 5 / 6 ? 2 : 3; } // рост (Художник: 0–0.5 / 0.5–1.5 / 1.5–2.5 / 2.5–3 д при 3 днях)
  if (d < s + b) return 4;                                  // бутон
  if (d < s + b + o) return 5;                              // зелёный бутон раскрывается
  return 6;                                                 // раскрыта — проклинает землю
}
export const roseOpenMs = () => (BM_CFG.sproutDays + BM_CFG.budDays + BM_CFG.openDays) * DAY_MS;
/** радиус проклятой земли розы, px (0 — ещё не раскрылась): +curseTilesPerDay клеток в день с момента раскрытия, предел curseMaxTiles */
export function roseCurseR(ageMs: number): number {
  const t = ageMs - roseOpenMs(); if (t < 0) return 0;
  const tiles = Math.min(Math.max(0, BM_CFG.curseMaxTiles), BM_CFG.curseTilesPerDay * (1 + Math.floor(t / DAY_MS)));
  return Math.max(0, tiles) * BM_TILE;
}
/** самый большой возможный радиус (для пространственного индекса), px */
export const roseMaxR = () => Math.max(0, BM_CFG.curseMaxTiles) * BM_TILE;

// ——— очернение предметов: blk 0…100 (%), 100 — вещь не работает ———
export const blkOf = (it: { blk?: number } | null | undefined) => { const v = Number(it?.blk); return Number.isFinite(v) ? Math.max(0, Math.min(100, v)) : 0; };
/** обычные статы очернённой вещи: −blk% ко всем; 100% — нули (вещь не работает) */
export function blkNormal<T extends Record<string, any>>(st: T, blk: number): T {
  if (!(blk > 0)) return st; const k = Math.max(0, 1 - blk / 100), o: any = {};
  for (const [key, v] of Object.entries(st || {})) o[key] = typeof v === "number" ? (Number.isInteger(v) ? Math.round(v * k) : Math.round(v * k * 10) / 10) : v;
  return o;
}
/** ОЧЕРНЁННЫЕ статы (тайна: игроку не показываются): статы вещи × blk% × blkK — действуют только на проклятой земле */
export function blkDark<T extends Record<string, any>>(st: T, blk: number): T {
  const k = Math.max(0, blk / 100) * Math.max(0, Number(BM_CFG.blkK) || 0), o: any = {};
  for (const [key, v] of Object.entries(st || {})) o[key] = typeof v === "number" ? (Number.isInteger(v) ? Math.round(v * k) : Math.round(v * k * 10) / 10) : v;
  return o;
}
/** очернение героя (0…100) по надетому — режим blkVisMode; FULL = число слотов (5) */
export function charBlk(items: { blk?: number }[], slots = 5): number {
  const v = (items || []).map(blkOf).filter((x) => x > 0); if (!v.length) return 0;
  const m = BM_CFG.blkVisMode, sum = v.reduce((a, b) => a + b, 0);
  const r = m === "max" ? Math.max(...v) : m === "avg" ? sum / v.length : sum / Math.max(1, slots);
  return Math.round(Math.max(0, Math.min(100, r)) * 10) / 10;
}
/** сила затемнения 0…1 по очернению 0…100 (кривая и предел из админки) */
export function blkVisK(pct: number, max: number): number {
  if (BM_CFG.blkVisOn === false) return 0; const x = Math.max(0, Math.min(100, Number(pct) || 0)) / 100; if (!(x > 0)) return 0;
  return Math.max(0, Math.min(1, (Number(max) || 0) * Math.pow(x, Math.max(0.1, Number(BM_CFG.blkVisCurve) || 1))));
}
/** уровень затемнения героя для всех клиентов: 0…100 (= blkVisK × 100) */
// герой: чёрная правая половина тела, доля половины = очернение% × blkVisCharMax (линейно: 100 % — ровно половина)
export const charBlkVis = (items: { blk?: number }[]) => BM_CFG.blkVisOn === false ? 0 : Math.round(Math.max(0, Math.min(1, Number(BM_CFG.blkVisCharMax) || 0)) * charBlk(items));
/** клиенту (meta_state.bmv): отрисовка значков */
export const blkVisClient = () => ({ on: BM_CFG.blkVisOn !== false, itemMax: Number(BM_CFG.blkVisItemMax) || 0, charMax: Number(BM_CFG.blkVisCharMax) || 0, curve: Number(BM_CFG.blkVisCurve) || 1, heroLight: Number(BM_CFG.heroLight) || 1, glitch: BM_CFG.blkGlitch !== false, hz: Number(BM_CFG.blkGlitchHz) || 0 });
/** клиенту — только видимое (без blkK и без розы/земли как механики): длительности роста для отрисовки */
export const bmClient = () => ({ on: BM_CFG.on !== false, domeR: BM_CFG.domeTiles * BM_TILE, sproutDays: BM_CFG.sproutDays, budDays: BM_CFG.budDays, openDays: BM_CFG.openDays,
  curseTilesPerDay: BM_CFG.curseTilesPerDay, curseMaxTiles: BM_CFG.curseMaxTiles, trailSec: BM_CFG.trailSec, compressR: BM_CFG.compressTiles * BM_TILE });
