// Контент 30.10: 50 навыков (по одному на лезвие), 100 чёрных мобов, 20 логов-шаблонов — только существующими полями конструкторов
// (skdef / bpart / bmmob / bmcamp). Данные строятся здесь, проверяются validatePatch сервера (gen-1030.ts) и тестом архетипов.
export const ELS = ["fire", "ice", "water", "stone", "nature", "lightning"] as const;
export type El = (typeof ELS)[number];
const EL3: Record<El, string> = { fire: "fir", ice: "ice", water: "wat", stone: "sto", nature: "nat", lightning: "lig" };
const BODY: Record<El, string> = { fire: "fb", ice: "ib", water: "wb", stone: "sb", nature: "nb", lightning: "lb" };

// ---------- навыки: [лезвие, id, имя, иконка, форма, cd, поля, описание] ----------
type SkRow = [string, string, string, string, string, number, Record<string, any>, string];
const M0 = (k: string, v: number, on = "cast", ms = 4000) => ({ "mods.0.k": k, "mods.0.op": "pct", "mods.0.v": v, "mods.0.ms": ms, "mods.0.st": 1, "mods.0.on": on, "mods.0.if": "", "mods.0.th": 50, "mods.0.ch": 100 });
export const SKILLS: SkRow[] = [
  // 🔥 огонь — взрывы, поджог, раскалённые снаряды
  ["fire_blade", "f_cinder_whip", "Плеть искр", "🔥", "cone", 11, { len: 270, arc: 70, pct: 1.2, k: 0.6 }, "Длинная огненная плеть хлещет вперёд."],
  ["fire_blade_r", "f_ember_fan", "Веер углей", "☄️", "proj", 12, { path: "line", n: 3, spread: 18, spd: 520, range: 520, boom: 70, pct: 0.8, k: 0.4 }, "Три раскалённых уголька веером."],
  ["fire_staff_arch", "f_magma_lob", "Магмовый ком", "🌋", "proj", 16, { path: "lob", spd: 420, range: 460, boom: 150, boomMul: 1.3, knock: 3, pct: 1.5, k: 0.6 }, "Ком магмы летит навесом и разбрызгивается."],
  ["fire_staff_skull", "f_skull_burst", "Череп-взрыв", "💀", "nova", 14, { r: 170, ticks: 3, tickGap: 550, pct: 0.9, k: 0.5, ...M0("dmg", 25, "cast", 5000) }, "Вокруг заклинателя трижды рвётся пламя; после каста навыки сильнее."],
  ["fire_staff_tree", "f_ash_rain", "Пепельный ливень", "🌧️", "rain", 18, { drops: 10, area: 220, r: 70, gap: 90, pct: 0.6, k: 0.3 }, "Горящий пепел падает на площадь вокруг цели."],
  // ❄️ лёд — замедление, заморозка
  ["ice_blade", "i_rime_lash", "Ледяной бич", "❄️", "cone", 12, { len: 240, arc: 80, slow: "on", pct: 1, k: 0.5 }, "Бич из инея: удар конусом и замедление."],
  ["ice_blade_glaive", "i_frost_ring", "Кольцо стужи", "🧊", "nova", 14, { r: 170, freeze: 900, pct: 1.1, k: 0.5, ...M0("armor", 40, "cast", 5000) }, "Мороз вокруг сковывает врагов; хозяин крепнет."],
  ["ice_blade_r", "i_shard_boomer", "Возвратный осколок", "🔷", "proj", 13, { path: "boomerang", amp: 18, spd: 480, range: 760, pierce: 3, hitMul: 1, boom: 0, slow: "on", pct: 0.7, k: 0.4 }, "Осколок летит и возвращается, режа всех на пути."],
  ["ice_staff_arch", "i_blizzard_snake", "Вьюжная змейка", "🌨️", "proj", 15, { path: "sine", n: 2, spread: 0, amp: 22, freq: 1.4, spd: 420, range: 520, slow: "on", pct: 0.8, k: 0.4 }, "Две снежные змейки вьются к цели."],
  ["ice_staff_antler", "i_hail", "Ледяной град", "🌨️", "rain", 18, { drops: 8, area: 180, r: 70, gap: 110, freeze: 600, pct: 0.6, k: 0.3 }, "Град с рогами инея: попавших сковывает."],
  ["ice_staff_tree", "i_rime_loop", "Петля изморози", "🌀", "proj", 16, { path: "bezier", spd: 400, range: 500, b1a: 0.35, b1s: 0.4, b2a: 0.7, b2s: -0.4, slow: "on", pct: 0.9, k: 0.4 }, "Снаряд обходит преграды по кривой и морозит."],
  // 💧 вода — отброс, замедление, волны
  ["water_blade", "w_tide_lash", "Хлыст прилива", "💧", "cone", 11, { len: 250, arc: 75, slow: "on", pct: 1, k: 0.5 }, "Волна-хлыст и вязкая вода под ногами."],
  ["water_blade_2", "w_whirlpool", "Водоворот", "🌊", "nova", 14, { r: 160, ticks: 3, tickGap: 600, slow: "on", pct: 0.7, k: 0.4 }, "Вода крутится вокруг и тянет вниз."],
  ["water_blade_3", "w_wave_leap", "Бросок волны", "🏄", "dash", 12, { len: 280, invuln: 300, trail: 1, trailMul: 0.6, pct: 0.8, k: 0.4 }, "Рывок на гребне, за ним — мокрый след."],
  ["water_blade_4", "w_surf_smash", "Удар прибоя", "🌊", "cone", 13, { len: 190, arc: 140, knock: 4, pct: 1.2, k: 0.5 }, "Широкий удар прибоя отбрасывает назад."],
  ["water_blade_r", "w_jet", "Струя давления", "💦", "proj", 11, { path: "line", spd: 700, range: 560, pierce: 3, hitMul: 1, boom: 0, pct: 0.7, k: 0.4 }, "Тонкая струя пробивает насквозь."],
  ["water_blade_2_r", "w_spray_arc", "Дуга брызг", "💧", "proj", 13, { path: "arc", n: 2, spread: 20, spd: 460, range: 480, pct: 0.8, k: 0.4 }, "Две капли летят дугой с боков."],
  ["water_blade_3_r", "w_return_wave", "Возвратная волна", "🔁", "proj", 14, { path: "boomerang", amp: 18, spd: 460, range: 720, pierce: 4, hitMul: 1, boom: 0, knock: 2, pct: 0.7, k: 0.4 }, "Волна уходит и возвращается к хозяину."],
  ["water_staff_1", "w_deep_rain", "Ливень глубин", "🌧️", "rain", 17, { drops: 12, area: 200, r: 60, gap: 80, slow: "on", pct: 0.5, k: 0.3 }, "Тяжёлый дождь вязнет на врагах."],
  ["water_staff_2", "w_bubble_hunter", "Пузырь-ловец", "🫧", "proj", 15, { path: "homing", turn: 180, seek: 520, spd: 340, range: 640, slow: "on", pct: 0.9, k: 0.4 }, "Пузырь сам находит цель и вязнет."],
  ["water_staff_3", "w_foam_ring", "Кольцо пены", "🫧", "nova", 16, { r: 180, knock: 5, pct: 0.8, k: 0.4, ...M0("heal", 6) }, "Пена отбрасывает врагов и лечит хозяина."],
  // 🪨 камень — тяжёлые удары, отброс, медленные навыки
  ["stone_blade", "s_rock_lash", "Каменный хлыст", "🪨", "cone", 13, { len: 230, arc: 70, knock: 2, pct: 1.4, k: 0.6 }, "Тяжёлый хлыст из щебня."],
  ["stone_blade_2", "s_quake", "Сотрясение", "💥", "nova", 15, { r: 190, knock: 6, pct: 1.6, k: 0.7 }, "Удар о землю разбрасывает всех вокруг."],
  ["stone_blade_3", "s_ram", "Таран", "🐏", "dash", 14, { len: 240, knock: 5, invuln: 200, pct: 1.2, k: 0.5 }, "Рывок напролом, сбивая с ног."],
  ["stone_blade_4", "s_spikes", "Шипы из земли", "⛰️", "nova", 15, { r: 150, ticks: 3, tickGap: 650, slow: "on", pct: 0.7, k: 0.4, ...M0("armor", 50, "cast", 6000) }, "Каменные шипы бьют трижды; хозяин твердеет."],
  ["stone_blade_r", "s_boulder", "Валун", "🪨", "proj", 16, { path: "lob", spd: 380, range: 460, boom: 160, boomMul: 1.4, knock: 4, pct: 1.6, k: 0.6 }, "Валун падает навесом и откидывает."],
  ["stone_blade_2_r", "s_gravel_volley", "Щебёночный залп", "🪨", "proj", 14, { path: "line", n: 3, spread: 25, spd: 520, range: 480, pct: 0.8, k: 0.4 }, "Три куска щебня веером."],
  ["stone_blade_3_r", "s_chip_arc", "Скол по дуге", "🔸", "proj", 13, { path: "arc", amp: 18, spd: 480, range: 480, pct: 1, k: 0.5 }, "Острый скол облетает щит сбоку."],
  ["stone_staff_1", "s_rockfall", "Камнепад", "🏔️", "rain", 20, { drops: 6, area: 180, r: 90, gap: 130, knock: 3, pct: 1, k: 0.5 }, "Крупные камни падают на площадь."],
  ["stone_staff_2", "s_granite_loop", "Гранитная петля", "🌀", "proj", 17, { path: "bezier", spd: 380, range: 500, b1a: 0.35, b1s: -0.4, b2a: 0.7, b2s: 0.4, pct: 1.1, k: 0.5 }, "Гранитный снаряд по петле."],
  ["stone_staff_3", "s_creeping_basalt", "Ползучий базальт", "🐍", "proj", 18, { path: "sine", amp: 10, freq: 1, spd: 300, range: 520, pierce: 2, hitMul: 1, boom: 60, slow: "on", pct: 0.9, k: 0.4 }, "Базальт ползёт волной и вязнет."],
  // 🌿 природа — вампиризм, лечение, замедление
  ["nature_blade", "n_thorn_lash", "Терновая плеть", "🌿", "cone", 11, { len: 240, arc: 75, sHeal: 4, pct: 1, k: 0.5 }, "Плеть терний; хозяин пьёт силу раны."],
  ["nature_blade_2", "n_thorn_ring", "Кольцо шипов", "🌵", "nova", 13, { r: 160, ticks: 2, tickGap: 700, slow: "on", pct: 0.9, k: 0.4 }, "Шипы вокруг бьют дважды и цепляют."],
  ["nature_blade_3", "n_lynx_leap", "Прыжок рыси", "🐆", "dash", 12, { len: 260, trail: 1, trailMul: 0.5, sHeal: 5, pct: 0.9, k: 0.5 }, "Рывок с колючим следом и вампиризмом."],
  ["nature_blade_4", "n_vine_sting", "Жало лозы", "🪱", "cone", 12, { len: 320, arc: 40, slow: "on", pct: 1.1, k: 0.5 }, "Узкое длинное жало, опутывает."],
  ["nature_blade_r", "n_thorn_hunter", "Колючка-охотник", "🌱", "proj", 12, { path: "homing", turn: 220, seek: 480, spd: 420, range: 560, pct: 0.8, k: 0.4 }, "Колючка сама ищет цель."],
  ["nature_blade_2_r", "n_seed_dance", "Пляска семян", "🌰", "proj", 14, { path: "sine", n: 2, spread: 0, amp: 18, freq: 1.6, spd: 440, range: 520, pct: 0.7, k: 0.4 }, "Семена вьются парой."],
  ["nature_blade_3_r", "n_leaf_boomer", "Лист-бумеранг", "🍃", "proj", 13, { path: "boomerang", amp: 18, spd: 480, range: 760, pierce: 3, hitMul: 1, boom: 0, sHeal: 3, pct: 0.7, k: 0.4 }, "Лист летит и возвращается, режа и леча."],
  ["nature_staff_1", "n_spore_rain", "Споровый дождь", "🍄", "rain", 17, { drops: 12, area: 200, r: 60, gap: 80, slow: "on", sHeal: 3, pct: 0.5, k: 0.3 }, "Ядовитые споры вязнут на врагах."],
  ["nature_staff_2", "n_bloom", "Цветение", "🌸", "nova", 16, { r: 200, sHeal: 6, pct: 0.6, k: 0.3, ...M0("heal", 10) }, "Цветок раскрывается вокруг: лечит хозяина."],
  ["nature_staff_3", "n_rot_fruit", "Гнилой плод", "🍎", "proj", 15, { path: "lob", spd: 400, range: 460, boom: 150, boomMul: 1.2, slow: "on", pct: 1, k: 0.5 }, "Плод падает навесом и лопается."],
  // ⚡ молния — скорость, множество снарядов, пробивание
  ["lightning_blade", "l_spark_lash", "Разряд-хлыст", "⚡", "cone", 10, { len: 240, arc: 65, sHaste: 1, pct: 0.9, k: 0.5 }, "Хлыст из разрядов; хозяин ускоряется."],
  ["lightning_blade_2", "l_bolt_leap", "Скачок молнии", "🌩️", "dash", 10, { len: 320, invuln: 250, trail: 1, trailMul: 0.5, pct: 0.8, k: 0.4 }, "Мгновенный скачок со следом искр."],
  ["lightning_blade_3", "l_ball_flash", "Шаровая вспышка", "🔆", "nova", 13, { r: 140, ticks: 4, tickGap: 400, pct: 0.6, k: 0.3 }, "Шаровая молния трещит вокруг четыре раза."],
  ["lightning_blade_4", "l_thunder_swing", "Громовой взмах", "🌪️", "cone", 12, { len: 210, arc: 100, knock: 3, pct: 1.1, k: 0.5 }, "Взмах с громом отбрасывает."],
  ["lightning_blade_r", "l_spark_fan", "Искровой веер", "✨", "proj", 12, { path: "line", n: 5, spread: 12, spd: 640, range: 520, pct: 0.45, k: 0.25 }, "Пять искр широким веером."],
  ["lightning_blade_2_r", "l_spark_swarm", "Рой искр", "🐝", "proj", 14, { path: "homing", n: 3, spread: 30, turn: 260, seek: 520, spd: 460, range: 600, pct: 0.5, k: 0.3 }, "Три самонаводящиеся искры."],
  ["lightning_staff_1", "l_storm_rain", "Грозовой дождь", "⛈️", "rain", 16, { drops: 14, area: 220, r: 55, gap: 60, pct: 0.45, k: 0.25 }, "Частые удары молний по площади."],
  ["lightning_staff_2", "l_chain_loop", "Цепная петля", "🔗", "proj", 15, { path: "bezier", n: 2, spread: 16, spd: 480, range: 520, pierce: 4, hitMul: 1, boom: 0, b1a: 0.3, b1s: 0.6, b2a: 0.7, b2s: -0.6, pct: 0.6, k: 0.3 }, "Две молнии-петли прошивают строй."],
  ["lightning_staff_3", "l_return_bolt", "Возвратная молния", "↩️", "proj", 13, { path: "boomerang", amp: 18, spd: 560, range: 800, pierce: 3, hitMul: 1, boom: 0, pct: 0.7, k: 0.4, ...M0("spd", 30, "hit", 3000) }, "Молния возвращается; попадание ускоряет хозяина."],
];
export const skId = (r: SkRow) => "skx_c30_" + r[1];
export const bladeCopyId = (b: string) => "bpx_c30_" + b.replace("lightning", "lig").replace("nature", "nat").replace("stone", "sto").replace("water", "wat");
export const isRangedBlade = (b: string) => /_r$|staff/.test(b);
export const MELEE_FORM = (f: string) => f === "cone" || f === "nova" || f === "dash";

// ---------- кристаллы-ядра (архетипы «чёрного» процента и предельной брони) ----------
export type Tier = { t: string; arch: "glass" | "mid" | "fort"; bdmg: number; bcap: number; barm: number; name: string };
export const TIERS: Tier[] = [
  { t: "g10", arch: "glass", bdmg: 10, bcap: 0, barm: 0, name: "Ядро ярости" },
  { t: "g5", arch: "glass", bdmg: 5, bcap: 0, barm: 0, name: "Ядро злобы" },
  { t: "g3", arch: "glass", bdmg: 3, bcap: 0, barm: 0, name: "Ядро жала" },
  { t: "m3", arch: "mid", bdmg: 3, bcap: 50, barm: 0, name: "Ядро равновесия" },
  { t: "m1", arch: "mid", bdmg: 1, bcap: 10, barm: 5, name: "Ядро стойкости" },
  { t: "m05", arch: "mid", bdmg: 0.5, bcap: 25, barm: 10, name: "Ядро выдержки" },
  { t: "f05", arch: "fort", bdmg: 0.5, bcap: 5, barm: 25, name: "Ядро бастиона" },
  { t: "f01", arch: "fort", bdmg: 0.1, bcap: 1, barm: 40, name: "Ядро твердыни" },
];
export const coreId = (el: El, t: string) => `bpx_c30_k_${EL3[el]}_${t}`;
export const handleCopyId = (h: string) => "bpx_c30_h_" + h.replace("lightning", "lig").replace("nature", "nat").replace("stone", "sto").replace("water", "wat");
export const handleSecId = (el: El) => `bpx_c30_hs_${EL3[el]}`;
/** второй навык рукояти «с навыком» (для танков/убийц): ближний навык своей стихии */
export const SEC_SKILL: Record<El, string> = { fire: "skx_c30_f_skull_burst", ice: "skx_c30_i_frost_ring", water: "skx_c30_w_wave_leap", stone: "skx_c30_s_quake", nature: "skx_c30_n_lynx_leap", lightning: "skx_c30_l_bolt_leap" };

// ---------- мобы ----------
export const ROLES = ["tank", "healer", "kiter", "assassin", "summoner"] as const;
export type Role = (typeof ROLES)[number];
export const ROLE_RU: Record<Role, string> = { tank: "танк", healer: "лекарь-баффер", kiter: "кайтер", assassin: "убийца-рывок", summoner: "зона/контроль" };
const ROLE_TIERS: Record<Role, string[]> = { tank: ["f01", "f05", "m05"], healer: ["m1", "f05", "m05"], kiter: ["g3", "m1", "g5", "m3"], assassin: ["g10", "g5", "g3"], summoner: ["m1", "g3", "m3", "m05"] };
const NOUN: Record<Role, string[]> = { tank: ["Оплот", "Колосс", "Громила", "Бастион", "Твердыня"], healer: ["Знахарь", "Жрец", "Целитель", "Певчий", "Хранитель"],
  kiter: ["Стрелок", "Метатель", "Ловчий", "Застрельщик", "Лучник"], assassin: ["Резчик", "Тень", "Клинок", "Убийца", "Ловкач"], summoner: ["Заклинатель", "Ткач", "Чародей", "Вестник", "Призыватель"] };
const GEN: Record<El, string[]> = { fire: ["пепла", "углей", "жара", "горна", "золы", "пламени"], ice: ["инея", "стужи", "наста", "изморози", "вьюги", "мерзлоты"],
  water: ["прилива", "пены", "брызг", "течений", "омута", "глубин"], stone: ["скал", "щебня", "гранита", "утёса", "базальта", "осыпи"],
  nature: ["терний", "корней", "мха", "спор", "чащи", "лозы"], lightning: ["грома", "разрядов", "бури", "молний", "грозы", "зарниц"] };
const ARCH_RU = { glass: "стеклянная пушка", mid: "середина", fort: "крепость" };
const MUL = { glass: { hp: 0.45, dmg: 1.2, ar: 0.5, xp: 0.9 }, mid: { hp: 1, dmg: 1, ar: 1, xp: 1 }, fort: { hp: 1.6, dmg: 0.7, ar: 1.8, xp: 1.3 } };
const CLS: Record<Role, (ranged: boolean) => string> = { tank: () => "brute", healer: () => "mage", kiter: (r) => (r ? "archer" : "warrior"), assassin: () => "warrior", summoner: () => "mage" };
const DROP_SLOT: Record<Role, string> = { tank: "handle", healer: "crystal", kiter: "blade2", assassin: "blade", summoner: "blade3" };
const MOVE: Record<Role, (j: number) => any> = {
  tank: (j) => ({ spd: 0.8 + (j % 2) * 0.1 }),
  healer: (j) => (j % 2 ? { spd: 0.9, blink: { cd: 9000, range: 220 } } : { spd: 0.95 }),
  kiter: (j) => (j % 2 ? { spd: 1.1, dash: { cd: 6000, len: 170, spd: 900 } } : { spd: 1.15, blink: { cd: 8000, range: 260 } }),
  assassin: (j) => [{ spd: 1.3, dash: { cd: 4500, len: 230, spd: 1400 }, ghost: 2 }, { spd: 1.25, blink: { cd: 5000, range: 320 }, ghost: 3 }, { spd: 1.4, dash: { cd: 6000, len: 300, spd: 1600 }, blink: { cd: 9000, range: 260 }, ghost: 4 }][j % 3],
  summoner: (j) => (j % 3 === 2 ? { spd: 0.9, blink: { cd: 10000, range: 240 }, ghost: 1 } : { spd: 0.9 }),
};
/** t1062u: лекари лечат союзников (админка «Чёрные мобы» → «Поддержка»): по кругу — самого раненого со щитом, всех рядом с бафом урона, самого раненого с рывком скорости */
export const HEAL_SUP = (j: number) => [{ tgt: "low", r: 280, pct: 8, cd: 5000, buff: "shield", bms: 2500 }, { tgt: "allies", r: 240, pct: 4, cd: 7000, buff: "dmg", bv: 15, bms: 4000 }, { tgt: "low", r: 300, pct: 10, cd: 6000, buff: "spd", bms: 3000 }][j % 3];
export type MobRow = { id: string; el: El; role: Role; tier: Tier; blade: string; skill: string; sec: boolean; P: Record<string, any> };
export function buildMobs(bladesByEl: Record<string, string[]>, handlesByEl: Record<string, string[]>, taken: Set<string>): MobRow[] {
  const out: MobRow[] = [], ptr: Record<string, number> = {}, cnt: Record<string, number> = {}, used = new Set<string>();
  const pool = (el: El, ranged: boolean) => bladesByEl[el].filter((b) => isRangedBlade(b) === ranged);
  for (let i = 0; i < 100; i++) {
    const el = ELS[i % 6], role = ROLES[Math.floor(i / 6) % 5], key = el + role, j = (cnt[key] = (cnt[key] ?? -1) + 1);
    const tier = TIERS.find((t) => t.t === ROLE_TIERS[role][j % ROLE_TIERS[role].length])!;
    const ranged = role === "kiter" || role === "summoner" || role === "healer";
    // лезвие: сначала ещё не занятые (чтобы каждое из 50 досталось хотя бы одному мобу), потом по кругу
    const P0 = pool(el, ranged), fresh = P0.filter((b) => !used.has(b));
    const pk = el + ranged; const blade = fresh.length ? fresh[0] : P0[(ptr[pk] = ((ptr[pk] ?? -1) + 1)) % P0.length]; used.add(blade);
    const sk = SKILLS.find((s) => s[0] === blade)!;
    const lvl = 8 + ((i * 7) % 23), M = MUL[tier.arch];
    const cls = CLS[role](blade.endsWith("_r"));
    const sec = (role === "tank" || role === "assassin") && j % 2 === 0;
    const hs = handlesByEl[el], handle = sec ? handleSecId(el) : handleCopyId(hs[(i + j) % hs.length]);
    let name = ""; for (let s = 0; s < 30 && (!name || taken.has(name)); s++) name = `${NOUN[role][(j + s) % 5]} ${GEN[el][(j * 2 + Math.floor(s / 5) + (role.length % 3)) % 6]}`;
    taken.add(name);
    const v = (n: number) => 1 + ((i + n) % 5), b = BODY[el];
    const shard = `bm_shard_${el}`, piece = `bp_${el}_${DROP_SLOT[role]}`;
    const chests: any[] = [{ t: tier.arch === "fort" ? "rare" : "uncommon", chance: tier.arch === "glass" ? 6 : tier.arch === "mid" ? 10 : 8 }];
    if (lvl >= 24) chests.push({ t: "strange", chance: 3 });
    const P: Record<string, any> = {
      name, desc: `${ROLE_RU[role][0].toUpperCase() + ROLE_RU[role].slice(1)}, ${ARCH_RU[tier.arch]}: чёрный урон ${tier.bdmg} % ОЗ героя, предельная броня ${tier.bcap || "—"}${tier.bcap ? " %" : ""}. Навык — «${sk[2]}».`,
      cls, lvl, elem: el, pctOnly: true, take: C30_TAKE, // t1062u: по игроку — только заявленный % (без плоского урона уровня и разницы уровней)
      hp: Math.round(lvl * (120 + 6 * lvl) * M.hp * (role === "tank" ? 1.3 : 1)), dmg: Math.round(lvl * (2 + 0.95 * lvl) * M.dmg * (role === "tank" ? 0.8 : 1)),
      armor: Math.round(lvl * (5 + 0.4 * lvl) * M.ar), speed: 66 + (i % 11), aggro: role === "kiter" ? 230 : role === "tank" ? 160 : 185,
      radius: role === "tank" ? 20 : 16, xp: Math.round(lvl * 10 * M.xp), scale: role === "tank" ? 1.25 : role === "assassin" ? 0.9 : 1,
      "body.torso": `${b}_torso_${v(0)}`, "body.head": `${b}_head_${v(1)}`, "body.armL": `${b}_armL_${v(2)}`, "body.armR": `${b}_armR_${v(2)}`,
      "body.legL": `${b}_legL_${v(3)}`, "body.legR": `${b}_legR_${v(3)}`, "body.tail": i % 3 === 0 ? `${b}_tail_${v(4)}` : "",
      "weapon.handle": handle, "weapon.blade": bladeCopyId(blade), "weapon.crystal": coreId(el, tier.t),
      drops: [{ res: piece, chance: tier.arch === "fort" ? 14 : 9, qty: [1, 1] }, { res: shard, chance: 20, qty: [1, 2] }], chests, move: MOVE[role](j),
      ...(role === "healer" ? { sup: HEAL_SUP(j) } : {}),
    };
    out.push({ id: `bmx_c30_${EL3[el]}_${role.slice(0, 4)}_${j + 1}`, el, role, tier, blade, skill: skId(sk), sec, P });
  }
  return out;
}

// ---------- логова (шаблоны: hidden, x/y = 0; ставятся кнопкой «📍 Поставить у меня») ----------
type Pick = [El, Role, number] | [El, Role, number, string]; // стихия, роль, кол-во, [ярус]
export type LairRow = { id: string; name: string; idea: string; r: number; chief: [El, Role, string?]; picks: Pick[]; chest: string };
/** t1062u (баланс): «Получаемый чёрный урон, ×» всех мобов c30 — удар игрока по ним ×100 (база: 4–10 ударов на моба вместо сотен) */
export const C30_TAKE = 100;
/** t1062u: логова с вожаком — для группы / сильного снаряжения; остальные — лёгкие: без вожака (он — обычный моб), сложность лагеря EASY */
export const HARD_LAIRS = new Set(["hive", "glass_wall", "citadel", "cliff_storm", "rot_fire", "storm_swarm"]);
export const EASY = { take: 2, deal: 0.3 };
export const LAIRS: LairRow[] = [
  { id: "forge", name: "Огненная кузня", idea: "крепкие танки держат вход, лекарь чинит, стрелки и заклинатель бьют из-за спин", r: 260, chief: ["fire", "summoner"], picks: [["fire", "tank", 2], ["fire", "healer", 1], ["fire", "kiter", 3]], chest: "rare" },
  { id: "frost_trap", name: "Ледяной капкан", idea: "град и кольцо стужи сковывают — убийцы добивают замёрзших", r: 240, chief: ["ice", "tank"], picks: [["ice", "summoner", 2], ["ice", "assassin", 3]], chest: "rare" },
  { id: "conduct_pool", name: "Проводящий омут", idea: "вода вязнет и замедляет, молнии бьют по медленным", r: 300, chief: ["lightning", "summoner"], picks: [["water", "summoner", 2], ["lightning", "kiter", 3], ["lightning", "assassin", 1]], chest: "rare" },
  { id: "stone_wall", name: "Каменная стена", idea: "три крепости с предельной бронёй и стрелки за ними; лекарь держит стену", r: 280, chief: ["stone", "tank"], picks: [["stone", "tank", 2], ["stone", "kiter", 3], ["stone", "healer", 1]], chest: "rare" },
  { id: "thicket", name: "Чаща-западня", idea: "лекари-вампиры, споровый дождь, рыси прыгают из кустов", r: 300, chief: ["nature", "summoner"], picks: [["nature", "healer", 2], ["nature", "assassin", 2], ["nature", "tank", 1]], chest: "rare" },
  { id: "storm_swarm", name: "Грозовой рой", idea: "много быстрых убийц-стекляшек: убей раньше, чем они тебя", r: 260, chief: ["lightning", "summoner"], picks: [["lightning", "assassin", 4], ["lightning", "kiter", 2]], chest: "strange" },
  { id: "steam_ash", name: "Пар и пепел", idea: "водяные танки отбрасывают к огненным стрелкам", r: 280, chief: ["water", "tank"], picks: [["water", "tank", 2], ["fire", "kiter", 3], ["fire", "summoner", 1]], chest: "rare" },
  { id: "frozen_cliff", name: "Мёрзлый утёс", idea: "каменный таран сбивает, лёд замедляет — не уйти", r: 280, chief: ["stone", "assassin"], picks: [["stone", "tank", 1], ["ice", "kiter", 3], ["ice", "healer", 1]], chest: "rare" },
  { id: "rot_fire", name: "Гнилой пожар", idea: "природа лечит, огонь жжёт: лекарей бей первыми", r: 300, chief: ["fire", "tank"], picks: [["nature", "healer", 2], ["fire", "assassin", 2], ["nature", "kiter", 2]], chest: "rare" },
  { id: "cliff_storm", name: "Буря в скалах", idea: "каменные стены и молнии-рои за ними", r: 300, chief: ["lightning", "tank"], picks: [["stone", "tank", 2], ["lightning", "kiter", 3], ["stone", "summoner", 1]], chest: "rare" },
  { id: "tide", name: "Прилив", idea: "чистая вода: волны отбрасывают, пена лечит, струи пробивают", r: 260, chief: ["water", "healer"], picks: [["water", "tank", 1], ["water", "kiter", 3], ["water", "assassin", 1]], chest: "rare" },
  { id: "glass_wall", name: "Пушки за стеной", idea: "стеклянные пушки (10 %/5 %) за крепостью с предельной бронёй 1 %", r: 260, chief: ["stone", "tank", "f01"], picks: [["fire", "assassin", 2, "g10"], ["lightning", "assassin", 2, "g5"], ["water", "kiter", 2, "g3"]], chest: "strange" },
  { id: "citadel", name: "Цитадель", idea: "одни крепости: долгий бой на выносливость", r: 300, chief: ["ice", "tank", "f01"], picks: [["stone", "tank", 2], ["water", "tank", 1], ["nature", "healer", 2, "f05"]], chest: "strange" },
  { id: "six", name: "Перекрёсток стихий", idea: "по мобу каждой стихии и роли — разнобой статусов", r: 360, chief: ["lightning", "summoner"], picks: [["fire", "tank", 1], ["ice", "summoner", 1], ["water", "healer", 1], ["stone", "kiter", 1], ["nature", "assassin", 1], ["lightning", "kiter", 1]], chest: "strange" },
  { id: "blizzard", name: "Вьюжная лощина", idea: "лёд и вода: замедление на замедлении, заморозка", r: 280, chief: ["ice", "summoner"], picks: [["ice", "kiter", 2], ["water", "summoner", 2], ["ice", "tank", 1]], chest: "rare" },
  { id: "thorn_barrow", name: "Терновый курган", idea: "каменные шипы и терновые кольца вокруг лекаря", r: 280, chief: ["nature", "healer"], picks: [["stone", "summoner", 2], ["nature", "tank", 2], ["nature", "kiter", 1]], chest: "rare" },
  { id: "spark_wood", name: "Искрящий лес", idea: "колючки-охотники и рой искр — всё летит само", r: 300, chief: ["nature", "kiter"], picks: [["lightning", "kiter", 2], ["nature", "kiter", 2], ["lightning", "healer", 1]], chest: "rare" },
  { id: "ash_swarm", name: "Пепельный рой", idea: "огненные убийцы с рывками и ливень пепла", r: 260, chief: ["fire", "summoner"], picks: [["fire", "assassin", 3], ["fire", "healer", 1]], chest: "rare" },
  { id: "deep_dark", name: "Глубинная тьма", idea: "пузыри-ловцы и возвратные волны; ледяной бастион", r: 300, chief: ["water", "summoner"], picks: [["water", "kiter", 2], ["ice", "tank", 1], ["water", "healer", 1], ["ice", "assassin", 1]], chest: "strange" },
  { id: "hive", name: "Улей (нагрузка)", idea: "самое плотное логово: 36 мобов всех стихий — проверка производительности", r: 420, chief: ["lightning", "tank"], picks: [["fire", "kiter", 4], ["ice", "summoner", 4], ["water", "assassin", 4], ["stone", "tank", 4], ["nature", "healer", 4], ["lightning", "kiter", 4], ["fire", "assassin", 4], ["water", "kiter", 6]], chest: "strange" },
];
