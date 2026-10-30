// «Чёрная магия», этап А: чёрные статы, артефакт как оружие, мешок крита, заряд, навыки артефактов.
// Чистый модуль без серверных зависимостей: его читают и сервер (бой, профиль), и клиент (вкладка «Артефакты», Библиотека).
// Всё настраивается в админке (game_overrides): kind "bmagic" (настройки, BMA_CFG), "bpart" (части оружия, BM_PARTS),
// навыки артефактов — обычные записи kind "skill" (поля bm.pct / bm.k) — единый список навыков игры.
import type { AbilityDef } from "./shared";
import { BM_WEAPON_PTS } from "./bmWeaponPts";
import { BM_ELEM_NAMES } from "./bmElemNames";

export type BmStats = { force: number; power: number; charge: number; bdmg: number; barm: number; bcap: number; bcrit: number; pfire: number; pice: number;
  pwater: number; pstone: number; pnature: number; plightning: number }; // этап 2: чистый урон воды/камня/природы/молнии (новые поля — 0 у старых слепков)
export const BM_KEYS: (keyof BmStats)[] = ["force", "power", "charge", "bdmg", "barm", "bcap", "bcrit", "pfire", "pice", "pwater", "pstone", "pnature", "plightning"];
export const BM_NAMES: Record<keyof BmStats, { name: string; unit: string; icon: string; hint: string }> = {
  force: { name: "Сила атаки", unit: "%", icon: "✊", hint: "зажмите атаку: только ПОЛНЫЙ заряд умножает удар на (1 + сила %); отпустили раньше — обычный удар" },
  power: { name: "Мощность", unit: "%", icon: "💥", hint: "только на полном заряде: размер и дальность удара +мощность %" },
  charge: { name: "Скорость заряда", unit: "с", icon: "⏳", hint: "секунд до полного заряда (держать дольше не нужно)" },
  bdmg: { name: "Чёрный урон", unit: "%", icon: "🔥", hint: "удар = % от макс. ОЗ цели, обычная броня не учитывается" },
  barm: { name: "Чёрная броня", unit: "", icon: "🛡", hint: "вычитается из каждого входящего удара (можно 0)" },
  bcap: { name: "Предельная броня", unit: "%", icon: "⛨", hint: "один удар снимает не больше этого % ваших макс. ОЗ" },
  bcrit: { name: "Шанс крита", unit: " из 100", icon: "🎲", hint: "мешочек: ровно столько критов на 100 ударов; выпали все криты — сразу новый мешочек" },
  pfire: { name: "Чистый огненный урон", unit: "% ОЗ", icon: "🔥", hint: "к каждому удару: этот % ВАШИХ макс. ОЗ сверху, мимо чёрной брони и предельной брони (TZ.md §ICE)" },
  pice: { name: "Чистый ледяной урон", unit: "% ОЗ", icon: "❄", hint: "к каждому удару: этот % ВАШИХ макс. ОЗ сверху, мимо чёрной брони и предельной брони (TZ.md §ICE)" },
  pwater: { name: "Чистый водный урон", unit: "% ОЗ", icon: "💧", hint: "к каждому удару: этот % ВАШИХ макс. ОЗ сверху, мимо чёрной брони и предельной брони" },
  pstone: { name: "Чистый каменный урон", unit: "% ОЗ", icon: "🪨", hint: "к каждому удару: этот % ВАШИХ макс. ОЗ сверху, мимо чёрной брони и предельной брони" },
  pnature: { name: "Чистый урон природы", unit: "% ОЗ", icon: "🌿", hint: "к каждому удару: этот % ВАШИХ макс. ОЗ сверху, мимо чёрной брони и предельной брони" },
  plightning: { name: "Чистый урон молнии", unit: "% ОЗ", icon: "⚡", hint: "к каждому удару: этот % ВАШИХ макс. ОЗ сверху, мимо чёрной брони и предельной брони" },
};
/** 🜏 ОСЬ СТИХИЙ — единый реестр (данные, не код). Новая стихия = строка здесь + контент (детали/тела/кусочки/арт) + live:true.
 *  live:false — стихия заготовлена (цвет, иконка, чистый стат, набор fx), но в игре ещё не участвует: нет деталей, кусочков, выбора в админке.
 *  pure — ключ стата чистого урона (% ОЗ атакующего); fx — набор эффектов (снаряд, атлас навыков public/bm-art/<fx.skills>, вспышка). */
export type ElemDef = { id: string; name: string; icon: string; color: string; pure: string; live: boolean; trait?: string;
  fx: { proj: string; skills: string; hit: string } };
const ELEMENTS0: ElemDef[] = [
  { id: "fire", name: "Огонь", icon: "🔥", color: "#ff8a2a", pure: "pfire", live: true, fx: { proj: "fire_spark", skills: "fx/skills", hit: "ember" } },
  { id: "ice", name: "Лёд", icon: "❄", color: "#6cc8ff", pure: "pice", live: true, trait: "замедление", fx: { proj: "ice_bolt", skills: "ice/fx/skills", hit: "frost" } },
  // этап 2 (bm-elements4): вода, камень, природа, молния — полный набор Художника (public/bm-art/{body,weapon,fx,craft}/<стихия>_…)
  { id: "water", name: "Вода", icon: "💧", color: "#3a8dff", pure: "pwater", live: true, trait: "отбрасывание волной", fx: { proj: "water_bolt", skills: "water/fx/skills", hit: "water_hit" } },
  { id: "stone", name: "Камень", icon: "🪨", color: "#c8a46a", pure: "pstone", live: true, trait: "тяжёлые удары, броня", fx: { proj: "stone_bolt", skills: "stone/fx/skills", hit: "stone_hit" } },
  { id: "nature", name: "Природа", icon: "🌿", color: "#5fd04a", pure: "pnature", live: true, trait: "острая и опасная, яд", fx: { proj: "nature_bolt", skills: "nature/fx/skills", hit: "nature_hit" } },
  { id: "lightning", name: "Молния", icon: "⚡", color: "#ffe14a", pure: "plightning", live: true, trait: "острые и очень быстрые", fx: { proj: "lightning_bolt", skills: "lightning/fx/skills", hit: "lightning_hit" } },
];
/** цвет стихии — из админки (BMA_CFG.elemColor, «🜏 Чёрная магия: настройки» → «Цвета стихий»); нет правки — цвет реестра */
export const ELEM_DEF_COLOR: Record<string, string> = Object.fromEntries(ELEMENTS0.map((e) => [e.id, e.color]));
const okHex = (c: any) => typeof c === "string" && /^#[0-9a-fA-F]{6}$/.test(c);
export const elemColor = (el: string) => { const c = (BMA_CFG as any)?.elemColor?.[el]; return okHex(c) ? c : ELEM_DEF_COLOR[el]; };
export const ELEMENTS: ElemDef[] = ELEMENTS0.map((e) => Object.defineProperty({ ...e }, "color", { get: () => elemColor(e.id), enumerable: true }) as ElemDef);
export const ELEM_BY_ID: Record<string, ElemDef> = Object.fromEntries(ELEMENTS.map((e) => [e.id, e]));
/** все стихии оси (включая заготовленные) */
export const ALL_ELEMS = ELEMENTS.map((e) => e.id);
/** стихии чистого урона: стихия → стат (для всей оси) */
export const PURE_KEYS: Record<string, string> = Object.fromEntries(ELEMENTS.map((e) => [e.id, e.pure]));
/** живой словарь цветов: читает правку админки при каждом обращении (цифры урона, мобы, превью — сразу новым цветом) */
export const ELEM_COLOR: Record<string, string> = new Proxy({ ...ELEM_DEF_COLOR }, { get: (t, k: any) => (typeof k === "string" && k in t ? elemColor(k) : (t as any)[k]) });
export const bmZero = (): BmStats => ({ force: 0, power: 0, charge: 0, bdmg: 0, barm: 0, bcap: 0, bcrit: 0, pfire: 0, pice: 0, pwater: 0, pstone: 0, pnature: 0, plightning: 0 });

/** Настройки чёрной магии (админка «🜏 Чёрная магия: настройки», kind bmagic/main). */
/** полуугол дуги не шире 81° — ровно столько умеет рисовать спрайт конуса (визуал = хитбокс) */
export const ARC_MAX = Math.PI * 0.45;
export const BMA_CFG = {
  on: true,                        // артефакты включены (выкл — артефакт ведёт себя как пустое оружие, равного 0)
  critMul: 1.75, bagSize: 100,
  classMul: { mob: 1, elite: 0.6, chief: 0.5, rare: 0.4, boss: 0.15, world: 0.05 } as Record<string, number>,
  vsPlayer: 1,                     // ответ 5: множитель урона «чёрного» удара (мобы, навыки артефактов у мобов) по игрокам
  pvpMul: 1,                       // PK: чёрный удар игрока по игроку (поверх PK «Урон ×»)
  chargeMoveMul: 0.6, holdMaxSec: 6, powerMaxMul: 2, minFrac: 0.1, // заряд: замедление, сгорание (0 — не сгорает), предохранитель мощности; minFrac — устарело (бонус только на полном заряде)
  maxRangeTiles: 14, tile: 32,     // дальний бой: макс. дальность лезвия в клетках (и с полным зарядом — не дальше)
  arcMax: 12,                      // ближний бой: сколько целей задевает один взмах (все внутри дуги, до этого числа)
  mobRangeMul: 1,                  // чёрные мобы: дальность их лезвия, × (снаряд/дуга как у игрока)
  mobCdMul: 1,                     // чёрные мобы: темп их ударов, × к кд рукояти (дуга ×1.5, выстрел ×2 от кд)
  mobAimMs: 350,                   // чёрный лучник/маг: прицел (линия-телеграф) до вылета снаряда, мс
  skillArt: true,                  // 🜏 навыки артефактов: анимации листами Художника (выкл — старые код-эффекты); снаряд навыка — свой спрайт
  skillFxScale: 1,                 // масштаб листов навыков (× к размеру по радиусу/дальности)
  skillCraft: true,                // 🛠 навыки артефактов исполняются конструктором навыков (выкл — прежний код форм, аварийный откат)
  skMaxSpeedPct: 60,               // потолок прибавки скорости бега от модификаторов навыков, %
  rainLead: 450,                   // дождь навыка: метки на земле за столько мс до удара каждой капли (капля успевает упасть)
  staffSpread: 12,                 // посохи: угол между снарядами мульти-выстрела, градусы (2-й/3-й посох — свой снаряд)
  staffStatsAdd: false,            // посохи во 2/3 слоте: складывать их боевые статы (выкл — каждый снаряд с уроном основного)
  staffRangeTiles: 8,              // посох без своей дальности: дальность снаряда, клетки
  muzzleScale: 0.6,               // снаряд вылетает из дула посоха: px листа (64×64) → px мира; 0 — из центра героя/моба
  staffTest: false,                // ТЕСТ (до арта Художника): все детали 2-го/3-го лезвия считать посохами
  maxArtifacts: 30,                // ответ 6: на аккаунт
  levelGapOff: true,               // разница уровней не режет процентный урон
  soulToBlack: false,              // проценты души/талантов (dmgPct) к чёрному урону — выкл
  liveParts: false,                // ответ 4: снимок частей (выкл) / живой пересчёт
  skillBag: true,                  // навыки артефакта тоже тянут из мешка крита (одно вытягивание на применение)
  // этап Б: кузня Знахаря (Альказак) — детали из кусочков чертежа, сборка, разбор
  craftPerMin: 6,                  // сборок артефакта в минуту (антиспам)
  partCraftPerMin: 30,             // созданий деталей в минуту
  salvageBase: 10,                 // разбор артефакта: базовые осколки bm_shard_<стихия>
  salvagePerPart: 4,               //   + за каждую деталь сверх двух обязательных
  forgeCityOnly: true,             // кузня — только в Альказаке (рядом со Знахарем)
  maxCustomParts: 300,             // своих деталей из конструктора (bpx_*) не больше
  maxCustomSkills: 200,            // 🛠 своих навыков конструктора (skx_*) не больше
  caps: { force: 500, power: 200, charge: 0.3, bdmg: 5, barm: 100000, bcap: 1, bcrit: 100, ...Object.fromEntries(ELEMENTS.map((e) => [e.pure, 20])) } as Record<string, number>,
  // этап ICE: чистый урон стихий (pfire/pice) = % макс. ОЗ АТАКУЮЩЕГО, сверху остального урона (TZ.md §ICE)
  pureMul: Object.fromEntries(ELEMENTS.map((e) => [e.id, 1])) as Record<string, number>,                 // глобальный множитель по стихии
  pureClassMul: { mob: 1, elite: 0.6, chief: 0.5, rare: 0.4, boss: 0.15, world: 0.05, player: 1 } as Record<string, number>, // по категории цели — по умолчанию те же множители, что classMul у чёрного урона (решение Алекса)
  pureSkill: 1,                    // навыки артефактов: множитель чистого урона за одно попадание навыка
  pureVsPlayer: 1,                 // по игрокам (PvP и чёрные мобы → игрок)
  pureMob: 1,                      // чёрные мобы: множитель их чистого урона (их ОЗ × сумма pfire/pice их частей)
  pureCrit: false,                 // крит умножает и чистый урон
  pureArmor: false,                // вкл — чистый урон тоже режется чёрной/предельной бронёй цели (выкл — мимо брони)
  bmMinDmg: 1,                     // мин. урон удара по «чёрной» цели после чёрной брони (0 — разрешить 0); только если удар был > 0
  elemColor: { ...ELEM_DEF_COLOR } as Record<string, string>, // цвета стихий (цифры чистого урона, мобы, дуги, превью); правятся в админке
  // этап 2: большой взмах ближнего лезвия со следом воздуха (клиент рисует; хитбокс — прежняя дуга)
  bigSwing: true, swingTrail: 1, swingScale: 1.25, swingAirMs: 260, swingH: 1.1, // swingTrail — длина ленты (×0.8 дуги), swingScale — толщина, swingAirMs — сколько лента висит в воздухе, swingH — высота, м
  // этап 2: типы снарядов дальних лезвий (поле shot у детали): множители по умолчанию
  shotOn: true, shotExplodeR: 80, shotExplodeK: 0.6, shotRicochetN: 2, shotRicochetK: 0.7, shotRicochetR: 260, shotPierceN: 3, shotSplitN: 3, shotSplitK: 0.5, shotSplitR: 160,
  // этап 2: камень — замедление-оглушение (плеть/кольцо), как iceSlow у льда; яд природы — в чертах навыков, отбрасывание воды — в форме
  stoneSlow: true,
  iceSlow: true,                   // ледяные навыки артефактов (Ледяной хлыст, Кольцо инея) замедляют цель (стандартное замедление игры) // charge — нижний предел (с), bcap — нижний предел (%)
};

/** Часть оружия (kind bpart). Тестовый огненный набор этапа А — ЗАГЛУШКА (арт — от Художника на этапе Б). */
export interface BmPart {
  id: string; name: string; type: "handle" | "blade" | "blade2" | "blade3" | "crystal"; elem: string; rarity: string; lvl: number;
  stats: Partial<BmStats>; skill?: string; icon: string; color: string;
  ranged?: boolean; rangeTiles?: number; reach?: number; arc?: number; width?: number; cd?: number; extraShot?: boolean; hidden?: boolean;
  /** этап Б: стоимость детали в кусочках чертежа bp_<стихия>_<тип>, требуемый уровень героя, описание, лист Художника (ключ) */
  cost?: number; reqLvl?: number; desc?: string; img?: string;
  /** форма детали лезвия (админка): «staff» — палка/посох (основной — дальний по умолчанию, во 2/3 слоте — +снаряд), «blade» — клинок.
   *  Нет поля — по листу Художника: blade_3* («Посох-жаровня») — посох, иначе клинок. */
  form?: "staff" | "blade";
  /** этап 2: тип снаряда дальнего лезвия/посоха (нет — обычный): explode — взрыв по площади, ricochet — отскок к следующей цели,
   *  pierce — насквозь, split — раскол на осколки. shotN — отскоков/целей/осколков, shotR — радиус (px), shotK — × урона вторичного удара */
  shot?: "" | "explode" | "ricochet" | "pierce" | "split"; shotN?: number; shotR?: number; shotK?: number;
}
export const SHOT_TYPES = ["", "explode", "ricochet", "pierce", "split"] as const;
export const SHOT_NAMES: Record<string, string> = { "": "Обычный", explode: "Взрывной", ricochet: "Рикошет", pierce: "Пробивной", split: "Раскалывающийся" };
/** тип снаряда сборки (слепок артефакта): от основного лезвия; параметры по умолчанию — BMA_CFG.shot* */
export type ShotInfo = { t: string; n: number; r: number; k: number };
/** ЭТАП 2: параметры большого взмаха для событий shot/marc (клиент рисует след в воздухе; по умолчанию — без полей) */
export function swingEv(): Record<string, number> {
  const C: any = BMA_CFG; if (C.bigSwing === false || !(Number(C.swingTrail) > 0)) return { stl: 0 };
  const o: Record<string, number> = {}, L = Number(C.swingTrail), S = Number(C.swingScale), A = Number(C.swingAirMs), H = Number(C.swingH);
  if (L !== 1) o.stl = +Math.min(2, 0.8 * L).toFixed(3); if (Number.isFinite(S) && S !== 1.25) o.ssc = Math.max(0.2, Math.min(4, S));
  if (Number.isFinite(A) && A !== 260) o.slf = +Math.max(0.15, Math.min(2.5, 0.24 + A / 1000)).toFixed(3); if (Number.isFinite(H) && H !== 1.1) o.sth = Math.max(0, Math.min(4, H));
  return o;
}
export function shotOf(b: BmPart | null | undefined): ShotInfo | null {
  const t = b?.shot; if (!t || !(SHOT_TYPES as readonly string[]).includes(t) || (BMA_CFG as any).shotOn === false) return null;
  const C: any = BMA_CFG;
  const def = t === "explode" ? { n: 1, r: C.shotExplodeR, k: C.shotExplodeK } : t === "ricochet" ? { n: C.shotRicochetN, r: C.shotRicochetR, k: C.shotRicochetK }
    : t === "pierce" ? { n: C.shotPierceN, r: 0, k: 0.8 } : { n: C.shotSplitN, r: C.shotSplitR, k: C.shotSplitK };
  return { t, n: Math.max(1, Math.min(8, Math.round(b!.shotN ?? def.n))), r: Math.max(0, Math.min(600, Number(b!.shotR ?? def.r) || 0)), k: Math.max(0, Math.min(3, Number(b!.shotK ?? def.k) || 0)) };
}
/** боевые статы (не складываются от доп. посохов при staffStatsAdd = выкл); barm/bcap — защитные, складываются всегда */
export const BM_ATK_KEYS = ["force", "power", "charge", "bdmg", "bcrit", "pfire", "pice"];
/** деталь — посох? slot — в каком слоте стоит (для тестового флага staffTest) */
export function isStaff(p: BmPart | null | undefined, slot?: string): boolean {
  if (!p || !/^blade/.test(p.type)) return false;
  if (p.form) return p.form === "staff" || (!!BMA_CFG.staffTest && (slot === "blade2" || slot === "blade3"));
  if (BMA_CFG.staffTest && (slot === "blade2" || slot === "blade3")) return true;
  const t = p.img ? BM_WEAPON_PTS[p.img]?.type : null; // тип листа Художника (атлас: type)
  return t === "staff" || /^blade_3(_|$)|_staff_/.test(p.img || "");
}
/** типы деталей: обязательные handle + blade, необязательные blade2/blade3/crystal */
export const BP_TYPES = ["handle", "blade", "blade2", "blade3", "crystal"] as const;
export type BpType = typeof BP_TYPES[number];
export const BP_TYPE_NAMES: Record<string, string> = { handle: "Рукоять", blade: "Лезвие", blade2: "Второе лезвие", blade3: "Третье лезвие", crystal: "Кристалл" };
/** стихии в игре (live): детали, кусочки, мобы, выбор в админке. Порядок — как в реестре ELEMENTS */
export const BP_ELEMS = ELEMENTS.filter((e) => e.live).map((e) => e.id);
export const BP_ELEM_NAMES: Record<string, string> = Object.fromEntries(ELEMENTS.map((e) => [e.id, e.name]));
export const BP_ELEM_ICONS: Record<string, string> = Object.fromEntries(ELEMENTS.map((e) => [e.id, e.icon]));
/** стихия: нет поля / неизвестная — огонь (старые сохранения) */
export const elemOf = (e: any) => (BP_ELEMS.includes(e) ? e : "fire");
/** кусочек чертежа (ресурс) для типа детали */
export const pieceId = (elem: string, type: string) => `bp_${elem}_${type}`;
export const shardId = (elem: string) => `bm_shard_${elem}`;
export const BP_COST_DEF: Record<string, number> = { handle: 20, blade: 30, blade2: 15, blade3: 15, crystal: 25 };
export const partCost = (p: BmPart) => Math.max(0, Math.round(p.cost ?? BP_COST_DEF[p.type] ?? 20));
/** своя деталь из конструктора админки */
export const CUSTOM_BP = /^bpx_[a-z0-9_]{2,32}$/;
export function makeBpart(id: string, type: string, elem = "fire"): BmPart {
  const t = (BP_TYPES as readonly string[]).includes(type) ? type as BpType : "blade";
  const el = elemOf(elem);
  return { id, name: BP_TYPE_NAMES[t] + " (новая)", type: t, elem: el, rarity: "common", lvl: 1, icon: t === "crystal" ? "💎" : t === "handle" ? BP_ELEM_ICONS[el] : "🗡️", color: el === "fire" ? "#ff7a1a" : ELEM_DEF_COLOR[el] || "#ff7a1a",
    stats: {}, cost: BP_COST_DEF[t], ...(t === "handle" ? { cd: 600 } : t === "blade" ? { reach: 110, arc: 1.1 } : {}) };
}
/** ЛЁД (этап ICE): полный ледяной набор Художника (public/bm-art/{body,weapon}/ice_…, «elem»: «ice»). Статы зеркалят огонь деталь в деталь;
 *  чистый ледяной урон — у кристалла (как чистый огненный у огненного). Детали создаются только из bp_ice_* (кусочки — только с ледяных мобов). */
function ICE_PARTS(): Record<string, BmPart> {
  const c = "#6cc8ff", P = (id: string, img: string, name: string, type: BmPart["type"], o: Partial<BmPart>): BmPart =>
    ({ id, img: "ice_" + img, name, type, elem: "ice", rarity: "rare", lvl: 1, icon: "❄", color: c, stats: {}, ...o });
  const out: Record<string, BmPart> = {
    ice_handle: P("ice_handle", "handle_1", "Древко в ледяной оплётке", "handle", { stats: { force: 40, charge: 1.6, bcrit: 5 }, cd: 560, skill: "bmi_blizzard_dash" }),
    ice_handle2: P("ice_handle2", "handle_2", "Гарда-крылья инея", "handle", { rarity: "uncommon", stats: { force: 30, charge: 1.4, bcrit: 4 }, cd: 600, skill: "bmi_blizzard_dash" }),
    ice_blade: P("ice_blade", "blade_1", "Клинок-сосулька", "blade", { icon: "🗡️", stats: { bdmg: 0.1, power: 40, bcrit: 2 }, reach: 120, arc: 1.15, skill: "bmi_frost_whip" }),
    ice_blade_glaive: P("ice_blade_glaive", "blade_2", "Ледяная глефа", "blade", { icon: "🗡️", stats: { bdmg: 0.09, power: 45, bcrit: 2 }, reach: 130, arc: 1.05, skill: "bmi_frost_whip" }),
    ice_blade_r: P("ice_blade_r", "blade_1_ranged", "Клинок-сосулька (дальний)", "blade", { icon: "🏹", stats: { bdmg: 0.08, power: 30, bcrit: 2 }, ranged: true, rangeTiles: 9, width: 22, skill: "bmi_frost_whip" }),
    ice_blade2: P("ice_blade2", "blade2_1", "Второе лезвие: сосулька-шип", "blade2", { rarity: "uncommon", icon: "🧊", stats: { barm: 3, bcap: 12 }, skill: "bmi_rime_ring" }),
    ice_blade3: P("ice_blade3", "blade3_1", "Третье лезвие: ледяной серп", "blade3", { rarity: "uncommon", icon: "🌙", stats: { bdmg: 0.02, barm: 2 }, skill: "bmi_icicle_hail" }),
    ice_staff_arch: P("ice_staff_arch", "blade_staff_1", "Посох архимага Стужи", "blade", { form: "staff", rarity: "epic", icon: "🪄", reqLvl: 10, cost: 40,
      stats: { bdmg: 0.1, power: 40, bcrit: 3 }, ranged: true, rangeTiles: 10, width: 22, reach: 115, arc: 1.0, skill: "bmi_shard_bolt" }),
    ice_staff_antler: P("ice_staff_antler", "blade_staff_2", "Посох с оленьим рогом", "blade", { form: "staff", icon: "🪄", cost: 32,
      stats: { bdmg: 0.08, power: 30, bcrit: 4 }, ranged: true, rangeTiles: 9, width: 24, reach: 110, arc: 1.0, skill: "bmi_shard_bolt" }),
    ice_staff_tree: P("ice_staff_tree", "blade_staff_3", "Ледяное древо", "blade", { form: "staff", icon: "🪄", cost: 32,
      stats: { bdmg: 0.07, power: 35, bcrit: 2, barm: 2 }, ranged: true, rangeTiles: 9, width: 22, reach: 120, arc: 1.05, skill: "bmi_icicle_hail" }),
    ice_crystal: P("ice_crystal", "crystal_1", "Слеза льда", "crystal", { rarity: "epic", icon: "💎", color: "#eafaff", stats: { bcrit: 1, power: 10, pice: 0.5 }, skill: "bmi_shard_bolt" }),
  };
  const b2 = ["Пастуший крюк инея", "Посох-снежинка", "Крюк с ледяной подвеской", "Витой с морозной сферой", "Посох-друза"];
  const b3 = ["Посох-полумесяц", "Шестигранное кольцо", "Обледенелая ветвь", "Факел холодного пламени", "Тройной кристалл"];
  b2.forEach((n, i) => { const id = `ice_b2staff_${i + 1}`; out[id] = P(id, `blade2_staff_${i + 1}`, n, "blade2", { form: "staff", rarity: i < 3 ? "uncommon" : "rare", icon: "🪄",
    stats: { bdmg: 0.02, power: 6, barm: i % 2 ? 1 : 2 }, skill: "bmi_rime_ring" }); });
  b3.forEach((n, i) => { const id = `ice_b3staff_${i + 1}`; out[id] = P(id, `blade3_staff_${i + 1}`, n, "blade3", { form: "staff", rarity: i < 3 ? "uncommon" : "rare", icon: "🪄",
    stats: { bdmg: 0.02, bcrit: 1, barm: i % 2 ? 2 : 1 }, skill: "bmi_icicle_hail" }); });
  return out;
}
/** ЭТАП 2: полный набор детали стихии из листов Художника (<el>_handle_1…5, blade_1…5 и _ranged, blade_staff_1…3, blade2/3_1…5, их посохи, crystal_1…5).
 *  Имена — из листов (bmElemNames.ts). Характер стихии — множители статов (ELEM_FLAVOR); всё правится в админке (bpart). */
type Flavor = { force: number; bdmg: number; power: number; bcrit: number; charge: number; cd: number; barm: number; bcap: number; reach: number; range: number; shots: BmPart["shot"][] };
export const ELEM_FLAVOR: Record<string, Flavor> = {
  water: { force: 1, bdmg: 1, power: 1.1, bcrit: 1, charge: 1, cd: 1, barm: 1, bcap: 1, reach: 1.05, range: 1.1, shots: ["ricochet", "pierce", "explode", "split", ""] },
  stone: { force: 1.25, bdmg: 1.1, power: 0.9, bcrit: 0.8, charge: 1.2, cd: 1.15, barm: 1.8, bcap: 1.3, reach: 0.95, range: 0.9, shots: ["explode", "split", "explode", "pierce", ""] },
  nature: { force: 1.1, bdmg: 1.15, power: 1, bcrit: 1.4, charge: 0.95, cd: 0.95, barm: 0.8, bcap: 1, reach: 1, range: 1, shots: ["split", "pierce", "ricochet", "explode", ""] },
  lightning: { force: 0.9, bdmg: 1.05, power: 1, bcrit: 1.6, charge: 0.7, cd: 0.75, barm: 0.6, bcap: 0.9, reach: 1.1, range: 1.15, shots: ["ricochet", "pierce", "split", "ricochet", "explode"] },
};
/** навыки деталей стихии: рукоять — рывок, лезвие — плеть, 2-е — кольцо, 3-е — дождь, кристалл/посох — снаряд */
export const ELEM_SK: Record<string, { dash: string; lash: string; ring: string; rain: string; bolt: string; icon: string }> = {
  water: { dash: "bmw_wave_dash", lash: "bmw_tide_whip", ring: "bmw_bubble_ring", rain: "bmw_rain_torrent", bolt: "bmw_droplet_bolt", icon: "💧" },
  stone: { dash: "bms_landslide_dash", lash: "bms_boulder_lash", ring: "bms_spike_ring", rain: "bms_rockfall", bolt: "bms_boulder_bolt", icon: "🪨" },
  nature: { dash: "bmn_vine_dash", lash: "bmn_thorn_lash", ring: "bmn_bramble_ring", rain: "bmn_spore_rain", bolt: "bmn_seed_bolt", icon: "🌿" },
  lightning: { dash: "bml_blink_dash", lash: "bml_spark_lash", ring: "bml_storm_ring", rain: "bml_thunder_rain", bolt: "bml_ball_bolt", icon: "⚡" },
};
const R2 = (v: number) => Math.round(v * 100) / 100, R3 = (v: number) => Math.round(v * 1000) / 1000;
export function ELEM_PARTS(el: string): Record<string, BmPart> {
  const F = ELEM_FLAVOR[el], K = ELEM_SK[el], N = BM_ELEM_NAMES.weapon[el] || {}, c = ELEM_DEF_COLOR[el], pk = ELEM_BY_ID0[el].pure, out: Record<string, BmPart> = {};
  const P = (id: string, img: string, type: BmPart["type"], o: Partial<BmPart>): BmPart => ({ id, img: `${el}_${img}`, name: N[img] || img, type, elem: el, rarity: "rare", lvl: 1, icon: K.icon, color: c, stats: {}, ...o });
  const RAR = ["rare", "uncommon", "uncommon", "rare", "epic"];
  for (let i = 1; i <= 5; i++) { // рукояти: темп (кд), заряд, сила, крит
    const id = i === 1 ? `${el}_handle` : `${el}_handle${i}`;
    out[id] = P(id, `handle_${i}`, "handle", { rarity: RAR[i - 1], stats: { force: Math.round((40 - (i - 1) * 3) * F.force), charge: R2((1.6 - (i - 1) * 0.1) * F.charge), bcrit: Math.round((5 - (i % 2)) * F.bcrit) }, cd: Math.round((560 + (i - 1) * 20) * F.cd), skill: K.dash, ...(i >= 4 ? { reqLvl: 8 + i } : {}) });
  }
  for (let i = 1; i <= 5; i++) { // ближние лезвия и их дальние варианты (тип снаряда — по варианту)
    const id = i === 1 ? `${el}_blade` : `${el}_blade_${i}`, rid = i === 1 ? `${el}_blade_r` : `${el}_blade_${i}_r`;
    out[id] = P(id, `blade_${i}`, "blade", { icon: "🗡️", rarity: RAR[i - 1], stats: { bdmg: R3((0.1 - (i - 1) * 0.005) * F.bdmg), power: Math.round((40 + (i - 1) * 2) * F.power), bcrit: Math.round(2 * F.bcrit) }, reach: Math.round((120 + (i - 1) * 4) * F.reach), arc: R2(1.15 - (i - 1) * 0.03), skill: K.lash, ...(i >= 4 ? { reqLvl: 8 + i } : {}) });
    out[rid] = P(rid, `blade_${i}_ranged`, "blade", { icon: "🏹", rarity: RAR[i - 1], stats: { bdmg: R3((0.08 - (i - 1) * 0.004) * F.bdmg), power: Math.round(30 * F.power), bcrit: Math.round(2 * F.bcrit) }, ranged: true, rangeTiles: Math.min(14, Math.round(9 * F.range)), width: 22, skill: K.lash, shot: F.shots[i - 1] || "", ...(i >= 4 ? { reqLvl: 8 + i } : {}) });
  }
  for (let i = 1; i <= 3; i++) { const id = `${el}_staff_${i}`;
    out[id] = P(id, `blade_staff_${i}`, "blade", { form: "staff", icon: "🪄", rarity: i === 1 ? "epic" : "rare", cost: i === 1 ? 40 : 32, ...(i === 1 ? { reqLvl: 10 } : {}),
      stats: { bdmg: R3((0.1 - (i - 1) * 0.01) * F.bdmg), power: Math.round((40 - (i - 1) * 5) * F.power), bcrit: Math.round((3 + (i === 2 ? 1 : 0)) * F.bcrit) }, ranged: true, rangeTiles: Math.min(14, Math.round((10 - (i > 1 ? 1 : 0)) * F.range)), width: 22 + (i === 2 ? 2 : 0), reach: 115, arc: 1.0, skill: i === 3 ? K.rain : K.bolt, shot: F.shots[(i + 1) % 5] || "" });
  }
  for (let i = 1; i <= 5; i++) {
    const a = i === 1 ? `${el}_blade2` : `${el}_blade2_${i}`, b = i === 1 ? `${el}_blade3` : `${el}_blade3_${i}`;
    out[a] = P(a, `blade2_${i}`, "blade2", { rarity: i < 4 ? "uncommon" : "rare", icon: "🛡", stats: { barm: Math.round((3 + (i - 1) * 0.5) * F.barm * 10) / 10, bcap: Math.round(12 * F.bcap) }, skill: K.ring });
    out[b] = P(b, `blade3_${i}`, "blade3", { rarity: i < 4 ? "uncommon" : "rare", icon: "🌙", stats: { bdmg: R3(0.02 * F.bdmg), barm: Math.round(2 * F.barm * 10) / 10 }, skill: K.rain });
    const s2 = `${el}_b2staff_${i}`, s3 = `${el}_b3staff_${i}`;
    out[s2] = P(s2, `blade2_staff_${i}`, "blade2", { form: "staff", rarity: i < 4 ? "uncommon" : "rare", icon: "🪄", stats: { bdmg: R3(0.02 * F.bdmg), power: 6, barm: i % 2 ? 1 : 2 }, skill: K.ring });
    out[s3] = P(s3, `blade3_staff_${i}`, "blade3", { form: "staff", rarity: i < 4 ? "uncommon" : "rare", icon: "🪄", stats: { bdmg: R3(0.02 * F.bdmg), bcrit: 1, barm: i % 2 ? 2 : 1 }, skill: K.rain });
    const cr = i === 1 ? `${el}_crystal` : `${el}_crystal_${i}`; // кристаллы — чистый урон своей стихии
    out[cr] = P(cr, `crystal_${i}`, "crystal", { rarity: i === 5 ? "legendary" : "epic", icon: "💎", stats: { bcrit: 1, power: 10 - (i - 1), [pk]: R2(0.5 + (i - 1) * 0.1) } as any, skill: K.bolt, ...(i >= 3 ? { reqLvl: 6 + i * 2, cost: 25 + i * 5 } : {}) });
  }
  return out;
}
const ELEM_BY_ID0: Record<string, ElemDef> = Object.fromEntries(ELEMENTS0.map((e) => [e.id, e]));
export const BM_PARTS: Record<string, BmPart> = {
  fire_handle: { id: "fire_handle", img: "handle_1", name: "Рукоять тлеющего угля", type: "handle", elem: "fire", rarity: "rare", lvl: 1, icon: "🔥", color: "#e0601a",
    stats: { force: 40, charge: 1.6, bcrit: 5 }, cd: 560, skill: "bmf_phoenix_dash" },
  fire_blade: { id: "fire_blade", img: "blade_1", name: "Лезвие пламени", type: "blade", elem: "fire", rarity: "rare", lvl: 1, icon: "🗡️", color: "#ffa531",
    stats: { bdmg: 0.1, power: 40, bcrit: 2 }, reach: 120, arc: 1.15, skill: "bmf_ember_lash" },
  fire_blade_r: { id: "fire_blade_r", img: "blade_1_ranged", name: "Лезвие искр (дальнее)", type: "blade", elem: "fire", rarity: "rare", lvl: 1, icon: "🏹", color: "#ffa531",
    stats: { bdmg: 0.08, power: 30, bcrit: 2 }, ranged: true, rangeTiles: 9, width: 22, skill: "bmf_ember_lash" },
  fire_staff: { id: "fire_staff", img: "blade_3_ranged", name: "Посох-жаровня", type: "blade", form: "staff", elem: "fire", rarity: "rare", lvl: 1, icon: "🪄", color: "#ff8a2a",
    stats: { bdmg: 0.08, power: 30, bcrit: 2 }, ranged: true, rangeTiles: 9, width: 22, reach: 115, arc: 1.0, skill: "bmf_cinder_bolt", hidden: true },
  fire_blade2: { id: "fire_blade2", img: "blade2_1", name: "Второе лезвие: обсидиан", type: "blade2", elem: "fire", rarity: "uncommon", lvl: 1, icon: "🪨", color: "#a8320f",
    stats: { barm: 3, bcap: 12 }, skill: "bmf_magma_ring" },
  fire_blade3: { id: "fire_blade3", img: "blade3_1", name: "Третье лезвие: лава", type: "blade3", elem: "fire", rarity: "uncommon", lvl: 1, icon: "🌋", color: "#5c1a0b",
    stats: { bdmg: 0.02, barm: 2 }, skill: "bmf_lava_rain" },
  // — посохи Художника (лист type=staff; снаряд из дула каждого посоха). Основной посох — дальний по умолчанию (переключатель ближний/дальний);
  //   посох во 2/3 слоте — +1 снаряд с параметрами основного удара (его боевые статы не складываются, если staffStatsAdd выкл.)
  fire_staff_arch: { id: "fire_staff_arch", img: "blade_staff_1", name: "Посох архимага Пекла", type: "blade", form: "staff", elem: "fire", rarity: "epic", lvl: 1, icon: "🪄", color: "#ff7a1a", reqLvl: 10, cost: 40,
    stats: { bdmg: 0.1, power: 40, bcrit: 3 }, ranged: true, rangeTiles: 10, width: 22, reach: 115, arc: 1.0, skill: "bmf_cinder_bolt" },
  fire_staff_skull: { id: "fire_staff_skull", img: "blade_staff_2", name: "Рогатый череп на кости", type: "blade", form: "staff", elem: "fire", rarity: "rare", lvl: 1, icon: "🪄", color: "#e0601a", cost: 32,
    stats: { bdmg: 0.08, power: 30, bcrit: 4 }, ranged: true, rangeTiles: 9, width: 24, reach: 110, arc: 1.0, skill: "bmf_cinder_bolt" },
  fire_staff_tree: { id: "fire_staff_tree", img: "blade_staff_3", name: "Древо-посох", type: "blade", form: "staff", elem: "fire", rarity: "rare", lvl: 1, icon: "🪄", color: "#c8541a", cost: 32,
    stats: { bdmg: 0.07, power: 35, bcrit: 2, barm: 2 }, ranged: true, rangeTiles: 9, width: 22, reach: 120, arc: 1.05, skill: "bmf_lava_rain" },
  fire_b2staff_1: { id: "fire_b2staff_1", img: "blade2_staff_1", name: "Обугленная рогулька", type: "blade2", form: "staff", elem: "fire", rarity: "uncommon", lvl: 1, icon: "🪵", color: "#ff8a2a",
    stats: { bdmg: 0.02, power: 6, barm: 2 }, skill: "bmf_magma_ring" },
  fire_b2staff_2: { id: "fire_b2staff_2", img: "blade2_staff_2", name: "Костяной с черепком", type: "blade2", form: "staff", elem: "fire", rarity: "uncommon", lvl: 1, icon: "💀", color: "#ff8a2a",
    stats: { bdmg: 0.02, power: 6, barm: 1 }, skill: "bmf_magma_ring" },
  fire_b2staff_3: { id: "fire_b2staff_3", img: "blade2_staff_3", name: "Крюк с фонарём", type: "blade2", form: "staff", elem: "fire", rarity: "uncommon", lvl: 1, icon: "🏮", color: "#ff8a2a",
    stats: { bdmg: 0.02, power: 6, barm: 2 }, skill: "bmf_magma_ring" },
  fire_b2staff_4: { id: "fire_b2staff_4", img: "blade2_staff_4", name: "Витой с магмовой сферой", type: "blade2", form: "staff", elem: "fire", rarity: "rare", lvl: 1, icon: "🔮", color: "#ff8a2a",
    stats: { bdmg: 0.02, power: 6, barm: 1 }, skill: "bmf_magma_ring" },
  fire_b2staff_5: { id: "fire_b2staff_5", img: "blade2_staff_5", name: "Рогатина", type: "blade2", form: "staff", elem: "fire", rarity: "rare", lvl: 1, icon: "🔱", color: "#ff8a2a",
    stats: { bdmg: 0.02, power: 6, barm: 2 }, skill: "bmf_magma_ring" },
  fire_b3staff_1: { id: "fire_b3staff_1", img: "blade3_staff_1", name: "Позвоночник с глазом", type: "blade3", form: "staff", elem: "fire", rarity: "uncommon", lvl: 1, icon: "👁️", color: "#ff6a1a",
    stats: { bdmg: 0.02, bcrit: 1, barm: 1 }, skill: "bmf_lava_rain" },
  fire_b3staff_2: { id: "fire_b3staff_2", img: "blade3_staff_2", name: "Огненное кольцо", type: "blade3", form: "staff", elem: "fire", rarity: "uncommon", lvl: 1, icon: "⭕", color: "#ff6a1a",
    stats: { bdmg: 0.02, bcrit: 1, barm: 2 }, skill: "bmf_lava_rain" },
  fire_b3staff_3: { id: "fire_b3staff_3", img: "blade3_staff_3", name: "Корявый корень", type: "blade3", form: "staff", elem: "fire", rarity: "uncommon", lvl: 1, icon: "🌿", color: "#ff6a1a",
    stats: { bdmg: 0.02, bcrit: 1, barm: 1 }, skill: "bmf_lava_rain" },
  fire_b3staff_4: { id: "fire_b3staff_4", img: "blade3_staff_4", name: "Посох-факел", type: "blade3", form: "staff", elem: "fire", rarity: "rare", lvl: 1, icon: "🔥", color: "#ff6a1a",
    stats: { bdmg: 0.02, bcrit: 1, barm: 2 }, skill: "bmf_lava_rain" },
  fire_b3staff_5: { id: "fire_b3staff_5", img: "blade3_staff_5", name: "Тройной уголь", type: "blade3", form: "staff", elem: "fire", rarity: "rare", lvl: 1, icon: "☄️", color: "#ff6a1a",
    stats: { bdmg: 0.02, bcrit: 1, barm: 1 }, skill: "bmf_lava_rain" },
  fire_crystal: { id: "fire_crystal", img: "crystal_1", name: "Кристалл жара", type: "crystal", elem: "fire", rarity: "epic", lvl: 1, icon: "💎", color: "#ffe08a",
    stats: { bcrit: 1, power: 10, pfire: 0.5 }, skill: "bmf_cinder_bolt" },
  ...ICE_PARTS(),
  ...ELEM_PARTS("water"), ...ELEM_PARTS("stone"), ...ELEM_PARTS("nature"), ...ELEM_PARTS("lightning"),
};
const RAR_ORDER = ["common", "uncommon", "rare", "epic", "legendary", "mythic"];

/** 5 стартовых огненных навыков артефактов. Это обычные навыки игры (cls "artifact"): попадают в единый список навыков
 *  админки («✨ Навыки»), в пул навыков мобов (любой моб, не только чёрный) и навыков оружия; в Библиотеке — вкладка «Навыки артефактов».
 *  Урон: макс. ОЗ цели × (pct + k × «Чёрный урон» героя) / 100 × classMul[категория цели]; мимо обычной брони; крит — из мешка. */
export interface BmSkillCfg { pct: number; k: number; vfx: string; traits?: any[]; elem?: string }
export const BM_SKILLS: (AbilityDef & { bm: BmSkillCfg })[] = [
  { id: "bmf_ember_lash", cls: "artifact" as any, name: "Хлыст углей", icon: "🔥", cd: 6, power: 1, unlockLevel: 1, radiance: ["echo", "swift", "vamp"],
    desc: "Огненная плеть хлещет конусом вперёд и поджигает врагов.",
    bm: { pct: 0.6, k: 2, vfx: "плеть из пламени, веер искр (6 кадров), на целях — тлеющие угольки поджога", traits: [{ k: "burn", chance: 35, dpsPct: 20, dur: 3 }] } },
  { id: "bmf_magma_ring", cls: "artifact" as any, name: "Кольцо магмы", icon: "🌋", cd: 10, power: 1, unlockLevel: 1, radiance: ["extend", "nova", "vamp"],
    desc: "Земля вокруг героя трескается лавой, волна отбрасывает врагов.",
    bm: { pct: 0.8, k: 3, vfx: "трещины лавы расходятся кругом, вспышка 8 кадров, дрожание жара" } },
  { id: "bmf_cinder_bolt", cls: "artifact" as any, name: "Пепельный снаряд", icon: "☄️", cd: 7, power: 1, unlockLevel: 1, radiance: ["echo", "extend", "swift"],
    desc: "Шар раскалённого обсидиана летит вперёд и взрывается у первой цели.",
    bm: { pct: 0.7, k: 2.5, vfx: "обсидиановый шар в огне (петля 6 кадров) + след искр, взрыв 8 кадров" } },
  { id: "bmf_lava_rain", cls: "artifact" as any, name: "Лавовый дождь", icon: "🌧️", cd: 14, power: 1, unlockLevel: 1, radiance: ["extend", "echo", "vamp"],
    desc: "Капли лавы падают на площадь перед героем.",
    bm: { pct: 0.3, k: 1, vfx: "круги-телеграфы, капли лавы с хвостом, лужицы гаснут за 1 с", traits: [{ k: "burn", chance: 20, dpsPct: 15, dur: 2 }] } },
  { id: "bmf_phoenix_dash", cls: "artifact" as any, name: "Рывок феникса", icon: "🐦‍🔥", cd: 12, power: 1, unlockLevel: 1, radiance: ["swift", "echo", "nova"],
    desc: "Рывок сквозь врагов в облике огненной птицы, за героем — горящий след.",
    bm: { pct: 0.5, k: 2, vfx: "силуэт птицы из пламени, след горящих перьев, короткая неуязвимость" } },
  // — ЛЁД (этап ICE): зеркало огненных; вместо поджога — короткое замедление (BMA_CFG.iceSlow, стандартный статус slow игры)
  { id: "bmi_frost_whip", cls: "artifact" as any, name: "Ледяной хлыст", icon: "❄", cd: 6, power: 1, unlockLevel: 1, radiance: ["echo", "swift", "vamp"],
    desc: "Ледяная плеть хлещет конусом вперёд и замедляет врагов.",
    bm: { pct: 0.6, k: 2, elem: "ice", vfx: "плеть изо льда, веер осколков (ice_arc), на целях — иней (замедление)" } },
  { id: "bmi_rime_ring", cls: "artifact" as any, name: "Кольцо инея", icon: "🧊", cd: 10, power: 1, unlockLevel: 1, radiance: ["extend", "nova", "vamp"],
    desc: "Вокруг героя расходится кольцо инея: отбрасывает и замедляет.",
    bm: { pct: 0.8, k: 3, elem: "ice", vfx: "кольцо инея кругом, вспышка, ледяные искры (код-эффект до листа Художника)" } },
  { id: "bmi_shard_bolt", cls: "artifact" as any, name: "Осколочный снаряд", icon: "🔷", cd: 7, power: 1, unlockLevel: 1, radiance: ["echo", "extend", "swift"],
    desc: "Ледяной осколок летит вперёд и разлетается у первой цели.",
    bm: { pct: 0.7, k: 2.5, elem: "ice", vfx: "ледяной снаряд ice_bolt (6 кадров + след 4), попадание ice_hit 8 кадров" } },
  { id: "bmi_icicle_hail", cls: "artifact" as any, name: "Град сосулек", icon: "🌨️", cd: 14, power: 1, unlockLevel: 1, radiance: ["extend", "echo", "vamp"],
    desc: "Сосульки падают на площадь перед героем.",
    bm: { pct: 0.3, k: 1, elem: "ice", vfx: "круги-телеграфы, сосульки с хвостом, ледяные искры" } },
  { id: "bmi_blizzard_dash", cls: "artifact" as any, name: "Рывок метели", icon: "🌬️", cd: 12, power: 1, unlockLevel: 1, radiance: ["swift", "echo", "nova"],
    desc: "Рывок сквозь врагов в вихре метели, за героем — снежный след.",
    bm: { pct: 0.5, k: 2, elem: "ice", vfx: "вихрь снега, след инея, короткая неуязвимость" } },
  ...ELEM_SKILLS(),
];
/** ЭТАП 2: по 5 навыков воды, камня, природы, молнии (листы Художника public/bm-art/<el>/fx/skills) — пресеты конструктора навыков.
 *  Черты: природа — яд (плеть/спородождь), вода — отбрасывание, камень — замедление-оглушение, молния — быстрее (кд меньше) и шире кольцо */
function ELEM_SKILLS(): any[] {
  const D: [string, string, string, string, string, number, number, number, string, any[]?][] = [
    // [id, имя, иконка, слот, описание, кд, pct, k, vfx, traits]
    ["bmw_tide_whip", "Хлыст прилива", "🌊", "lash", "Водяная плеть хлещет конусом и отбрасывает врагов волной.", 6, 0.6, 2, "плеть из воды (water_arc), брызги, на целях — пена"],
    ["bmw_bubble_ring", "Кольцо пузырей", "🫧", "ring", "Вокруг героя лопается кольцо пузырей — отбрасывает.", 10, 0.8, 3, "кольцо пузырей, вспышка брызг"],
    ["bmw_droplet_bolt", "Капля-снаряд", "💧", "bolt", "Тяжёлая капля летит вперёд и разбрызгивается у первой цели.", 7, 0.7, 2.5, "капля water_bolt + след, всплеск 100 px"],
    ["bmw_rain_torrent", "Ливень", "🌧️", "rain", "Ливень обрушивается на площадь перед героем.", 14, 0.3, 1, "круги-телеграфы, струи воды, лужи гаснут за 1 с"],
    ["bmw_wave_dash", "Рывок волны", "🌊", "dash", "Рывок сквозь врагов на гребне волны.", 12, 0.5, 2, "гребень волны, след пены, короткая неуязвимость"],
    ["bms_boulder_lash", "Каменная плеть", "🪨", "lash", "Плеть из валунов бьёт конусом и оглушает (замедляет).", 7, 0.7, 2.2, "плеть из камней, каменная крошка"],
    ["bms_spike_ring", "Кольцо шипов", "⛰️", "ring", "Из земли вокруг героя вырываются каменные шипы.", 11, 0.9, 3.2, "кольцо шипов, пыль"],
    ["bms_boulder_bolt", "Валун-снаряд", "🥌", "bolt", "Валун летит вперёд и раскалывается у первой цели.", 8, 0.8, 2.8, "валун stone_bolt + пыль, раскол 100 px"],
    ["bms_rockfall", "Камнепад", "☄️", "rain", "Камни падают на площадь перед героем.", 15, 0.35, 1.1, "тени-телеграфы, падающие глыбы, пыль"],
    ["bms_landslide_dash", "Рывок оползня", "🏔️", "dash", "Рывок оползнем сквозь врагов.", 13, 0.55, 2.2, "оползень, каменный след"],
    ["bmn_thorn_lash", "Терновая плеть", "🌿", "lash", "Терновая плеть хлещет конусом и отравляет.", 6, 0.6, 2, "плеть из терна, листья, на целях — яд", [{ k: "poison", chance: 40, dpsPct: 20, dur: 3 }]],
    ["bmn_bramble_ring", "Кольцо терновника", "🌵", "ring", "Вокруг героя вырастает кольцо терновника.", 10, 0.8, 3, "кольцо терновника, листья"],
    ["bmn_seed_bolt", "Семя-снаряд", "🌰", "bolt", "Семя летит вперёд и раскрывается шипами у первой цели.", 7, 0.7, 2.5, "семя nature_bolt + след пыльцы"],
    ["bmn_spore_rain", "Ядовитый спородождь", "🍄", "rain", "Ядовитые споры падают на площадь перед героем.", 14, 0.3, 1, "облака спор, ядовитые лужи", [{ k: "poison", chance: 35, dpsPct: 18, dur: 3 }]],
    ["bmn_vine_dash", "Рывок лозы", "🌱", "dash", "Рывок по лозам сквозь врагов.", 12, 0.5, 2, "лозы, след листьев"],
    ["bml_spark_lash", "Разрядная плеть", "⚡", "lash", "Плеть из разрядов бьёт конусом — быстро и остро.", 5, 0.6, 2.1, "плеть из молний (lightning_arc), искры"],
    ["bml_storm_ring", "Кольцо грозы", "🌩️", "ring", "Вокруг героя бьёт кольцо грозы — отбрасывает.", 9, 0.8, 3, "кольцо разрядов, вспышка"],
    ["bml_ball_bolt", "Шаровая молния", "🔆", "bolt", "Шаровая молния летит вперёд и взрывается у первой цели.", 6, 0.7, 2.6, "шар lightning_bolt + искры, разряд 100 px"],
    ["bml_thunder_rain", "Грозовой ливень", "⛈️", "rain", "Удары молний по площади перед героем.", 12, 0.32, 1.05, "метки-телеграфы, удары молний"],
    ["bml_blink_dash", "Рывок-вспышка", "💫", "dash", "Мгновенный рывок-вспышка сквозь врагов, короткая неуязвимость.", 10, 0.5, 2, "вспышка, послеобразы, неуязвимость 0.4 с"],
  ];
  const RAD: Record<string, string[]> = { lash: ["echo", "swift", "vamp"], ring: ["extend", "nova", "vamp"], bolt: ["echo", "extend", "swift"], rain: ["extend", "echo", "vamp"], dash: ["swift", "echo", "nova"] };
  const EL: Record<string, string> = { bmw: "water", bms: "stone", bmn: "nature", bml: "lightning" };
  return D.map(([id, name, icon, slot, desc, cd, pct, k, vfx, traits]) => ({ id, cls: "artifact" as any, name, icon, cd, power: 1, unlockLevel: 1, radiance: RAD[slot], desc,
    bm: { pct, k, elem: EL[id.slice(0, 3)], vfx, ...(traits ? { traits } : {}) } }));
}
/** стихия навыка артефакта: bmi_* — лёд, bmf_* — огонь */
/** стихия навыков конструктора (skillCraft.ts заполняет: пресеты и свои skx_…) */
export const SK_ELEM: Record<string, string> = {};
export const SK_PREFIX: Record<string, string> = { bmf_: "fire", bmi_: "ice", bmw_: "water", bms_: "stone", bmn_: "nature", bml_: "lightning" };
export const skillElem = (id: any) => (typeof id !== "string" ? "fire" : SK_ELEM[id] || SK_PREFIX[id.slice(0, 4)] || "fire");
export const BM_SKILL_IDS = BM_SKILLS.map((s) => s.id);
export const isBmSkill = (id: any) => typeof id === "string" && (!!SK_PREFIX[id.slice(0, 4)] || !!SK_ELEM[id]);
/** формы навыков (abilityShapes.SHAPES) */
export const BM_SHAPES: Record<string, any> = {
  bmf_ember_lash: { k: "cone", len: 230, arc: 1.0 },
  bmf_magma_ring: { k: "nova", r: 140, knock: 2 },
  bmf_cinder_bolt: { k: "proj", len: 480, r: 100, w: "staff" },
  bmf_lava_rain: { k: "rain", n: 8, area: 200, r: 60 },
  bmf_phoenix_dash: { k: "dash", len: 220, w: 60, invuln: 400, trail: 1 },
  // лёд: формы те же; замедление — геттер (BMA_CFG.iceSlow правится в админке без перезапуска)
  bmi_frost_whip: { k: "cone", len: 230, arc: 1.0, elem: "ice", get slow() { return !!BMA_CFG.iceSlow; } },
  bmi_rime_ring: { k: "nova", r: 140, knock: 2, elem: "ice", get slow() { return !!BMA_CFG.iceSlow; } },
  bmi_shard_bolt: { k: "proj", len: 480, r: 100, w: "staff", elem: "ice" },
  bmi_icicle_hail: { k: "rain", n: 8, area: 200, r: 60, elem: "ice" },
  bmi_blizzard_dash: { k: "dash", len: 220, w: 60, invuln: 400, trail: 1, elem: "ice" },
  // этап 2: вода — отбрасывание (waterKnock), камень — замедление (stoneSlow), природа — яд в чертах, молния — шире и быстрее
  bmw_tide_whip: { k: "cone", len: 230, arc: 1.0, knock: 2, elem: "water" },
  bmw_bubble_ring: { k: "nova", r: 140, knock: 2, elem: "water" },
  bmw_droplet_bolt: { k: "proj", len: 480, r: 100, w: "staff", elem: "water" },
  bmw_rain_torrent: { k: "rain", n: 8, area: 200, r: 60, elem: "water" },
  bmw_wave_dash: { k: "dash", len: 220, w: 60, invuln: 400, trail: 1, elem: "water" },
  bms_boulder_lash: { k: "cone", len: 230, arc: 1.0, elem: "stone", get slow() { return !!BMA_CFG.stoneSlow; } },
  bms_spike_ring: { k: "nova", r: 140, knock: 2, elem: "stone", get slow() { return !!BMA_CFG.stoneSlow; } },
  bms_boulder_bolt: { k: "proj", len: 480, r: 100, w: "staff", elem: "stone" },
  bms_rockfall: { k: "rain", n: 8, area: 200, r: 60, elem: "stone" },
  bms_landslide_dash: { k: "dash", len: 220, w: 60, invuln: 400, trail: 1, elem: "stone" },
  bmn_thorn_lash: { k: "cone", len: 230, arc: 1.0, elem: "nature" },
  bmn_bramble_ring: { k: "nova", r: 140, knock: 2, elem: "nature" },
  bmn_seed_bolt: { k: "proj", len: 480, r: 100, w: "staff", elem: "nature" },
  bmn_spore_rain: { k: "rain", n: 8, area: 200, r: 60, elem: "nature" },
  bmn_vine_dash: { k: "dash", len: 220, w: 60, invuln: 400, trail: 1, elem: "nature" },
  bml_spark_lash: { k: "cone", len: 250, arc: 0.9, elem: "lightning" },
  bml_storm_ring: { k: "nova", r: 150, knock: 2, elem: "lightning" },
  bml_ball_bolt: { k: "proj", len: 520, r: 100, w: "staff", elem: "lightning" },
  bml_thunder_rain: { k: "rain", n: 8, area: 200, r: 60, elem: "lightning" },
  bml_blink_dash: { k: "dash", len: 240, w: 60, invuln: 400, trail: 1, elem: "lightning" },
};

// ---------- артефакт ----------
export interface ArtAtk { kind: "arc" | "proj"; range: number; arc?: number; width?: number; max?: number; count?: number; spread?: number }
/** staff — основное лезвие посох (можно переключать ближний/дальний), shots — снарядов за выстрел (1 + посохи во 2/3 слоте),
 *  alt — вторая форма удара посоха (ближняя дуга) */
export interface ArtInfo { parts: Record<string, string>; stats: BmStats; atk: ArtAtk; cd: number; skills: string[]; elem: string; elems?: string[]; ranged: boolean; staff?: boolean; shots?: number; alt?: ArtAtk; shot?: ShotInfo }
const r3 = (v: number) => Math.round(v * 1000) / 1000;
/** Сумма частей → чёрные статы, форма удара (от основного лезвия), навыки. null — сборка неверна. */
export function computeArtifact(parts: Record<string, string>, P: Record<string, BmPart> = BM_PARTS): ArtInfo | null {
  const h = P[parts.handle], b = P[parts.blade];
  if (!h || h.type !== "handle" || !b || b.type !== "blade") return null;
  const st = bmZero(), skills: string[] = [], elems: string[] = []; let shots = 1;
  for (const slot of ["handle", "blade", "blade2", "blade3", "crystal"]) {
    const p = parts[slot] && P[parts[slot]]; if (!p) continue;
    if (p.type !== slot) return null;
    const pe = elemOf(p.elem); if (!elems.includes(pe)) elems.push(pe);
    const extraStaff = (slot === "blade2" || slot === "blade3") && isStaff(p, slot);
    if (extraStaff) shots++;
    for (const k of BM_KEYS) { if (extraStaff && !BMA_CFG.staffStatsAdd && BM_ATK_KEYS.includes(k)) continue; st[k] = r3(st[k] + (Number((p.stats as any)[k]) || 0)); }
    if (p.skill && !skills.includes(p.skill)) skills.push(p.skill);
  }
  const staff = isStaff(b, "blade"), ranged = staff || !!b.ranged;
  const proj: ArtAtk = { kind: "proj", range: Math.round(Math.min(Math.max(1, b.rangeTiles || (staff ? BMA_CFG.staffRangeTiles : 6)), BMA_CFG.maxRangeTiles) * BMA_CFG.tile), width: b.width || 20, ...(shots > 1 ? { count: shots } : {}) };
  const arc: ArtAtk = { kind: "arc", range: Math.round(Math.max(40, b.reach || 110)), arc: Math.min(ARC_MAX, b.arc || 1.1), max: 4 };
  return { parts: { ...parts }, stats: st, atk: ranged ? proj : arc, cd: Math.max(200, h.cd || 600), skills, elem: b.elem || "fire", ...(elems.length > 1 ? { elems } : {}), ranged,
    ...(staff ? { staff: true, alt: arc } : {}), ...(shots > 1 ? { shots } : {}), ...(ranged && shotOf(b) ? { shot: shotOf(b)! } : {}) };
}
export function artRarity(parts: Record<string, string>, P: Record<string, BmPart> = BM_PARTS): string {
  let best = 0; for (const id of Object.values(parts)) { const i = RAR_ORDER.indexOf(P[id]?.rarity || "common"); if (i > best) best = i; }
  return RAR_ORDER[best];
}
/** капы: «нижние» пределы для скорости заряда и предельной брони, верхние — для остальных */
export function capBm(s: BmStats): BmStats {
  const C = BMA_CFG.caps, o = { ...s };
  for (const k of BM_KEYS) { const c = Number(C[k]); if (!Number.isFinite(c)) continue;
    if (k === "charge") o.charge = o.charge > 0 ? Math.max(c, o.charge) : 0;
    else if (k === "bcap") o.bcap = o.bcap > 0 ? Math.max(c, o.bcap) : 0;
    else o[k] = Math.min(c, o[k]); }
  return o;
}

// ---------- мешок крита ----------
/** состояние мешка: [вытянуто, критов выпало, размер, критов в мешке]. Ровно K критов на каждые N вытягиваний. */
export type Bag = [number, number, number, number];
export function bagDraw(bag: Bag | null | undefined, bcrit: number, rnd: () => number, size = BMA_CFG.bagSize): { crit: boolean; bag: Bag } {
  const N = Math.max(1, Math.round(size)), want = Math.max(0, Math.min(N, Math.round(bcrit)));
  let b: Bag = Array.isArray(bag) && bag.length === 4 && bag[0] < bag[2] ? [bag[0], bag[1], bag[2], bag[3]] : [0, 0, N, want];
  if (b[3] !== want) b[3] = Math.max(b[1], Math.min(b[2], want)); // стат сменился посреди мешка: осталось max(0, новые − выпавшие)
  const leftDraws = b[2] - b[0], leftCrits = Math.max(0, b[3] - b[1]);
  const crit = leftCrits > 0 && rnd() * leftDraws < leftCrits;
  b = [b[0] + 1, b[1] + (crit ? 1 : 0), b[2], b[3]];
  // мешочек кончился ИЛИ выпали все его криты (ответ Алекса 28.10) — сразу новый мешочек
  if (b[0] >= b[2] || (b[3] > 0 && b[1] >= b[3])) b = [0, 0, N, want];
  return { crit, bag: b };
}

// ---------- урон ----------
/** чёрный удар по цели с макс. ОЗ maxHp: maxHp×bdmg% × classMul × vs × (1 + force% на ПОЛНОМ заряде) × крит.
 *  Пример: 10% от 300 = 30, «Сила атаки» +20% → 36. frac < 1 (отпустили раньше) — обычный удар. */
export function bmHit(maxHp: number, cat: string, bm: BmStats, frac: number, crit: boolean, vs = 1, pctOverride?: number): number {
  const pct = pctOverride ?? bm.bdmg;
  const base = Math.max(0, maxHp) * Math.max(0, pct) / 100 * (BMA_CFG.classMul[cat] ?? 1) * vs;
  const full = frac >= 1 ? Math.max(0, bm.force) / 100 : 0;
  return base * (1 + full) * (crit ? BMA_CFG.critMul : 1);
}
/** защита «чёрной» цели: −чёрная броня, затем не больше bcap % своих ОЗ; 0 разрешён */
export function bmDefend(dmg: number, def: { barm: number; bcap: number }, maxHp: number): number { return bmDefendEx(dmg, def, maxHp).d; }
/** чёрная броня + предельная броня; zero — броня поглотила удар целиком (клиент: эффект «0 урона» ice_zero);
 *  BMA_CFG.bmMinDmg — минимальный урон после брони, если удар был > 0 (0 — разрешить 0) */
export function bmDefendEx(dmg: number, def: { barm: number; bcap: number }, maxHp: number): { d: number; zero: boolean } {
  let d = Math.max(0, dmg - Math.max(0, def.barm || 0));
  if (def.bcap > 0) d = Math.min(d, Math.max(0, maxHp) * def.bcap / 100);
  const zero = dmg > 0 && d <= 0, mn = Math.max(0, Number(BMA_CFG.bmMinDmg) || 0);
  if (dmg > 0 && mn > 0) d = Math.max(Math.min(mn, dmg), d);
  return { d, zero };
}
/** ЧИСТЫЙ урон стихий (TZ.md §ICE): X% макс. ОЗ АТАКУЮЩЕГО за удар, сверху остального урона.
 *  attMaxHp — макс. ОЗ атакующего; bm.pfire/pice — % (сумма частей/кристаллов этой стихии); cat — категория цели (mob/elite/…/player);
 *  vs — доп. множитель (pureVsPlayer / pureSkill / pureMob считает вызывающий). Возврат — по стихиям, целые ≥ 0. */
export type PureHit = { fire: number; ice: number; [el: string]: number };
export function bmPure(attMaxHp: number, bm: Partial<BmStats> | Record<string, any> | null | undefined, cat: string, vs = 1, crit = false): PureHit {
  const out: PureHit = { fire: 0, ice: 0 };
  if (!bm || !(attMaxHp > 0)) return out;
  const cm = BMA_CFG.pureClassMul[cat] ?? 1, cr = crit && BMA_CFG.pureCrit ? BMA_CFG.critMul : 1;
  for (const el of ALL_ELEMS) {
    const pct = Math.min(Number((bm as any)[PURE_KEYS[el]]) || 0, BMA_CFG.caps[PURE_KEYS[el]] ?? 1e9);
    if (pct > 0) out[el] = Math.round(attMaxHp * pct / 100 * (BMA_CFG.pureMul[el] ?? 1) * cm * vs * cr);
  }
  return out;
}
/** чистый урон по игроку с чёрной защитой: при BMA_CFG.pureArmor — тоже режется чёрной/предельной бронёй (без мин. урона) */
export function pureVsDef(p: PureHit, def: { barm: number; bcap: number } | null | undefined, maxHp: number): PureHit {
  const s = pureSum(p); if (!BMA_CFG.pureArmor || !def || s <= 0) return p;
  let d = Math.max(0, s - Math.max(0, def.barm || 0)); if (def.bcap > 0) d = Math.min(d, Math.max(0, maxHp) * def.bcap / 100);
  const o: PureHit = { fire: 0, ice: 0 }; for (const k of Object.keys(p)) o[k] = Math.round((p[k] || 0) * d / s); return o;
}
/** поля события удара: pf/pi (огонь/лёд, совместимость со старым клиентом) + pe {стихия: n} для прочих стихий оси */
export function pureEvFields(p: Record<string, number> | null | undefined): any {
  const o: any = {}; if (!p) return o;
  for (const k of Object.keys(p)) { const n = Math.round(Number(p[k]) || 0); if (n <= 0) continue; if (k === "fire") o.pf = n; else if (k === "ice") o.pi = n; else (o.pe ||= {})[k] = n; }
  return o;
}
/** клиент: [стихия, число][] из события удара (pf/pi/pe) — цифры каждой стихии своим цветом (ELEM_COLOR) */
export function pureList(e: any): [string, number][] {
  const L: [string, number][] = []; if (!e) return L;
  if (e.pf > 0) L.push(["fire", e.pf]); if (e.pi > 0) L.push(["ice", e.pi]);
  if (e.pe) for (const k of Object.keys(e.pe)) if (e.pe[k] > 0) L.push([k, e.pe[k]]);
  return L;
}
export const pureSum = (p: Record<string, number> | null | undefined) => { let s = 0; if (p) for (const k of Object.keys(p)) s += Number(p[k]) || 0; return s; };
/** % урона навыка артефакта: pct + k × чёрный урон */
export const bmSkillPct = (cfg: { pct?: number; k?: number } | undefined, bdmg: number) => Math.max(0, (Number(cfg?.pct) || 0) + (Number(cfg?.k) || 0) * Math.max(0, bdmg));
/** заряд по часам сервера: 1 — полный (держали ≥ «Скорость заряда»), иначе 0 (частичного бонуса нет).
 *  Передержал дольше holdMaxSec (если > 0) — сгорел, 0. */
export function chargeFrac(startAt: number, now: number, chargeSec: number): number {
  if (!startAt) return 0;
  const t = (now - startAt) / 1000;
  if (BMA_CFG.holdMaxSec > 0 && t > BMA_CFG.holdMaxSec) return 0;
  return t + 1e-3 >= Math.max(0.05, chargeSec || 1) ? 1 : 0;
}
/** форма удара с зарядом: только полный заряд (frac 1) — размер/дальность × (1 + power%), не больше powerMaxMul */
export function chargedAtk(atk: ArtAtk, power: number, frac: number): ArtAtk {
  const m = Math.min(Math.max(1, BMA_CFG.powerMaxMul), 1 + (frac >= 1 ? Math.max(0, power) / 100 : 0));
  const range = Math.round(atk.range * m), maxR = Math.max(1, BMA_CFG.maxRangeTiles) * BMA_CFG.tile;
  return { ...atk, range: atk.kind === "proj" ? Math.min(range, maxR) : range, ...(atk.width ? { width: Math.round(atk.width * m) } : {}),
    ...(atk.arc ? { arc: Math.min(ARC_MAX, atk.arc * Math.sqrt(m)) } : {}), ...(atk.kind === "arc" ? { max: Math.max(1, BMA_CFG.arcMax | 0) } : {}),
    ...(atk.kind === "proj" && (atk.count || 1) > 1 ? { count: Math.min(3, atk.count! | 0), spread: Math.max(0, Number(BMA_CFG.staffSpread) || 0) * Math.PI / 180 * (Math.min(3, atk.count! | 0) - 1) } : {}) };
}
/** направления мульти-выстрела посохов: n снарядов (≤ 3) веером, шаг staffSpread° (как volleyDirs у игрока) */
/** дула стреляющих частей в «px оружия» от точки хвата (рука), слева направо: основное лезвие + посохи во 2/3 слоте.
 *  Цепочка как в клиенте (bmWeaponArt): handle.grip → bladeBase → blade.base; blade.branch1 → blade2.base; blade.branch2 → blade3.base. */
export function staffMuzzles(parts: Record<string, string | undefined> | null | undefined, P: Record<string, BmPart> = BM_PARTS): [number, number][] {
  if (!parts) return [];
  const pt = (img: string | undefined, n: string, d: number[]) => ((img && (BM_WEAPON_PTS[img] as any)?.[n]) || d) as number[];
  const h = P[parts.handle || ""], b = P[parts.blade || ""]; if (!b) return [];
  const g = pt(h?.img, "grip", [32, 52]), hb = pt(h?.img, "bladeBase", [32, 40]), bb = pt(b.img, "base", [32, 58]);
  const ob = [hb[0] - g[0] - bb[0], hb[1] - g[1] - bb[1]];
  const mz = pt(b.img, "muzzle", pt(b.img, "tip", [32, 14]));
  const out: [number, number][] = [[ob[0] + mz[0], ob[1] + mz[1]]];
  for (const [slot, br, dm] of [["blade2", "branch1", [40, 14]], ["blade3", "branch2", [24, 14]]] as const) {
    const q = P[parts[slot] || ""]; if (!q || !isStaff(q, slot)) continue;
    const a = pt(b.img, br, br === "branch1" ? [36, 40] : [28, 46]), qb = pt(q.img, "base", slot === "blade2" ? [16, 44] : [48, 44]), qm = pt(q.img, "muzzle", dm);
    out.push([ob[0] + a[0] - qb[0] + qm[0], ob[1] + a[1] - qb[1] + qm[1]]);
  }
  return out.sort((u, v) => u[0] - v[0]);
}
/** точки вылета n снарядов веера (слева направо, как volleyDirs/staffDirs): (x, y) — центр, (dx, dy) — прицел; дуло → мир через muzzleScale */
export function shotOrigins(mz: [number, number][], n: number, x: number, y: number, dx: number, dy: number): [number, number][] {
  const s = Math.max(0, Math.min(2, Number(BMA_CFG.muzzleScale) || 0)), L = Math.hypot(dx, dy) || 1, fx = dx / L, fy = dy / L, rx = -fy, ry = fx;
  const out: [number, number][] = [];
  for (let k = 0; k < n; k++) {
    const m = mz.length ? mz[mz.length === n ? k : n === 1 ? Math.floor(mz.length / 2) : Math.min(mz.length - 1, k)] : null;
    out.push(!m || !s ? [x, y] : [x + s * (m[0] * rx - m[1] * fx), y + s * (m[0] * ry - m[1] * fy)]);
  }
  return out;
}
/** рука чёрного моба в «px рига» от центра ног (тело 104: центр x 52, земля y 100; DEF_HAND клиента 66,68 → +14, −32) и угол хвата, ° по часовой от «вверх» */
export const MOB_HAND: [number, number, number] = [14, -32, 24];
/** точки вылета снарядов чёрного моба: дуло оружия В ЕГО РУКЕ (хват под углом MOB_HAND), не повёрнутое по прицелу.
 *  faceL — моб смотрит влево: весь риг зеркален (x → −x), порядок дул слева направо тоже переворачивается. Экран вверх = мир −y. */
export function mobShotOrigins(mz: [number, number][], n: number, x: number, y: number, faceL: boolean): [number, number][] {
  const s = Math.max(0, Math.min(2, Number(BMA_CFG.muzzleScale) || 0)), side = faceL ? -1 : 1, a = MOB_HAND[2] * Math.PI / 180, c = Math.cos(a), sn = Math.sin(a);
  const L = faceL ? [...mz].reverse() : mz, out: [number, number][] = [];
  for (let k = 0; k < n; k++) {
    const m = L.length ? L[L.length === n ? k : n === 1 ? Math.floor(L.length / 2) : Math.min(L.length - 1, k)] : null;
    if (!m || !s) { out.push([x, y]); continue; }
    const rx = m[0] * c - m[1] * sn, ry = m[0] * sn + m[1] * c; // поворот по часовой (экранные оси, y вниз)
    out.push([x + side * s * (MOB_HAND[0] + rx), y + s * (MOB_HAND[1] + ry)]);
  }
  return out;
}
/** направления веера ИЗ ДУЛ на цель (tx, ty): дуло смещено от центра (рука/посох), поэтому каждый снаряд целится от своей точки вылета,
 *  иначе он летит параллельно линии «центр → цель» и проходит мимо (на ~45 px выше). Смещение веера (staffSpread) сохраняется.
 *  Цель ближе minD к дулу — прежнее направление (не разворачиваем назад). */
export function aimDirs(D: [number, number][], O: [number, number][], tx: number, ty: number, ux: number, uy: number, minD = 24): [number, number][] {
  const a0 = Math.atan2(uy, ux), out: [number, number][] = [];
  for (let i = 0; i < D.length; i++) {
    const o = O[i] || O[0], ex = tx - o[0], ey = ty - o[1];
    if (!o || Math.hypot(ex, ey) < minD) { out.push(D[i]); continue; }
    const a = Math.atan2(ey, ex) + (Math.atan2(D[i][1], D[i][0]) - a0);
    out.push([Math.cos(a), Math.sin(a)]);
  }
  return out;
}
/** сторона взгляда моба на цель: |ux| мал (цель строго сверху/снизу) — прежняя сторона */
export const faceLeftOf = (ux: number, prev: boolean) => (Math.abs(ux) > 0.2 ? ux < 0 : !!prev);
export function staffDirs(n: number, dx: number, dy: number): [number, number][] {
  const k = Math.max(1, Math.min(3, n | 0)); if (k === 1) return [[dx, dy]];
  const a0 = Math.atan2(dy, dx), st = Math.max(0, Number(BMA_CFG.staffSpread) || 0) * Math.PI / 180, out: [number, number][] = [];
  for (let i = 0; i < k; i++) { const a = a0 + st * (i - (k - 1) / 2); out.push([Math.cos(a), Math.sin(a)]); }
  return out;
}
/** форма удара с учётом режима посоха: melee — ближняя дуга (только если основное лезвие посох; доп. посохи в ближнем не стреляют) */
export function artModeAtk(art: { atk: ArtAtk; staff?: boolean; alt?: ArtAtk }, melee: boolean): ArtAtk {
  return art.staff && melee && art.alt ? art.alt : art.atk;
}
