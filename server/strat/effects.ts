// «Партия Чёрных королей» — единая схема эффектов + генератор русских описаний с живыми числами (подсказки при наведении).
// Все источники (пассивки рас, навыки Вождей, таланты, технологии, постройки, клетки карты, способности фигур) приводятся к Effect[],
// описание строится из данных конфига (после правок админки числа в подсказках меняются сами). Модуль общий: сервер, клиент, тесты.
import { TERRAIN, STRUCT, TER_RULES } from "./terrain";
import { leagueOf } from "./rating";

export type Trigger = "always" | "turnStart" | "onHit" | "onKill" | "onAttack" | "active" | "onEnter" | "onBuild" | "onResearch" | "onDeath";
export type Target = "self" | "piece" | "allies" | "own" | "enemy" | "city" | "cities" | "side" | "cell" | "kind";
export type Cond = "ownTerritory" | "enemyTerritory" | "outsideOwn" | "targetMoved" | "targetBurning" | "targetChilled" | "nearChief" | "adjacentPawn"
  | "vsChief" | "nearCity" | "firstHitTurn" | "onCell" | "capitalOnly" | "lastEra" | "perCity" | "perCell" | "alive" | "wonderBuilt";
/** Эффект: что (key), когда (trigger), на кого (target), сколько (mag), сколько ходов (dur), радиус, как складывается, при каких условиях */
export type Effect = { key: string; trigger: Trigger; target: Target; mag: number; dur?: number; radius?: number; cd?: number; max?: number;
  stack: "add" | "max" | "once" | "none"; cond?: Cond[]; kind?: string; ref?: string };
export type EffectSource = { src: "race" | "chief" | "talent" | "tech" | "building" | "struct" | "terrain" | "unit"; id: string; race?: string; owner?: string; name: string; effects: Effect[] };

const KIND_RU: Record<string, [string, string]> = { // [ед., мн.]
  pawn: ["Ополченец", "Ополченцам"], knight: ["Всадник", "Всадникам"], mage: ["Маг", "Магам"], rook: ["Страж", "Стражам"], hero: ["Герой", "Героям"], king: ["Вождь", "Вождю"],
};
const RACE_RU: Record<string, string> = { fire: "Огонь", ice: "Лёд", water: "Вода", stone: "Камень", nature: "Природа", lightning: "Молния" };
const sg = (m: number) => (m > 0 ? "+" + m : String(m));
const pct = (m: number) => Math.round(m * 100) + "%";
const turns = (n: number) => n + " " + (n % 10 === 1 && n % 100 !== 11 ? "ход" : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20) ? "хода" : "ходов");
const cells = (n: number) => n + " " + (n % 10 === 1 && n % 100 !== 11 ? "клетка" : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20) ? "клетки" : "клеток");
const cellsG = (n: number) => n + " " + (n % 10 === 1 && n % 100 !== 11 ? "клетки" : "клеток");
const who = (e: Effect) => (e.kind ? KIND_RU[e.kind]?.[1] || e.kind : { self: "этой фигуре", piece: "фигуре", allies: "своим рядом", own: "своим фигурам", enemy: "врагу", city: "городу", cities: "каждому городу", side: "", cell: "фигуре на клетке", kind: "" }[e.target]);
const COND_RU: Record<Cond, string> = {
  ownTerritory: "на своей земле", enemyTerritory: "на вражеской земле", outsideOwn: "вне своей земли", targetMoved: "по фигуре, ходившей в прошлый ход",
  targetBurning: "по горящей цели", targetChilled: "по обмороженной цели", nearChief: "в радиусе 2 от своего Вождя", adjacentPawn: "рядом со своим Ополченцем",
  vsChief: "против Вождя и Героя", nearCity: "у своего города", firstHitTurn: "первый удар за ход", onCell: "стоя на клетке", capitalOnly: "только в столице",
  lastEra: "в последней эпохе", perCity: "с каждого города", perCell: "за клетку", alive: "пока жив", wonderBuilt: "когда построено Великое чудо",
};

/** Описание ключей: триггер/цель/складывание по умолчанию и шаблон текста. */
type Spec = { trig: Trigger; tgt: Target; stack?: Effect["stack"]; cond?: Cond[]; t: (e: Effect) => string };
export const EFFECT_KEYS: Record<string, Spec> = {
  // характеристики
  atk: { trig: "always", tgt: "own", t: (e) => `${sg(e.mag)} АТК ${who(e)}` },
  arm: { trig: "always", tgt: "own", t: (e) => `${sg(e.mag)} БРН ${who(e)}` },
  hp: { trig: "always", tgt: "self", t: (e) => `${sg(e.mag)} HP ${who(e)}` },
  hpMul: { trig: "always", tgt: "own", stack: "none", t: (e) => `${sg(Math.round((e.mag - 1) * 100))}% HP всем фигурам` },
  ap: { trig: "turnStart", tgt: "side", t: (e) => `${sg(e.mag)} ОД за ход` },
  shot: { trig: "always", tgt: "kind", t: (e) => `выстрел Мага на ${cells(e.mag).replace("клетка", "клетку")} дальше` },
  mageMove: { trig: "always", tgt: "kind", t: (e) => `${sg(e.mag)} к ходу Мага` },
  rookAtk: { trig: "always", tgt: "kind", t: (e) => `${sg(e.mag)} АТК Стражам` },
  kingHp: { trig: "onResearch", tgt: "self", t: (e) => `${sg(e.mag)} HP Вождю (и будущим Вождям)` },
  // экономика
  gold: { trig: "turnStart", tgt: "side", t: (e) => `${sg(e.mag)} з за ход` },
  know: { trig: "turnStart", tgt: "side", t: (e) => `${sg(e.mag)} знания за ход` },
  growth: { trig: "turnStart", tgt: "cities", t: (e) => `${sg(e.mag)} роста за ход` },
  glory: { trig: "turnStart", tgt: "side", t: (e) => `${sg(e.mag)} Славы за ход` },
  goldTurn: { trig: "turnStart", tgt: "side", t: (e) => `${sg(e.mag)} з за ход` },
  goldCity: { trig: "turnStart", tgt: "cities", t: (e) => `${sg(e.mag)} з за ход с каждого города` },
  knowCity: { trig: "turnStart", tgt: "cities", t: (e) => `${sg(e.mag)} знание за ход с каждого города` },
  goldMV: { trig: "turnStart", tgt: "side", t: (e) => `${sg(e.mag)} з с каждого Рудника и Деревни в территории` },
  bldDisc: { trig: "onBuild", tgt: "side", t: (e) => `постройки дешевле на ${pct(e.mag)}` },
  knightDisc: { trig: "onBuild", tgt: "side", t: (e) => `Всадник дешевле на ${e.mag} з` },
  pawnCost: { trig: "onBuild", tgt: "city", stack: "none", t: (e) => `Ополченец стоит ${e.mag} з` },
  research: { trig: "turnStart", tgt: "side", t: (e) => `${sg(e.mag)} исследование за ход; каждое даёт Славу` },
  growthMul: { trig: "turnStart", tgt: "cities", stack: "none", t: (e) => `рост городов ×${e.mag}` },
  forestKnow: { trig: "turnStart", tgt: "side", t: (e) => `${sg(e.mag)} знание за клетку леса в территории${e.max ? ` (не больше ${e.max})` : ""}` },
  knowPen: { trig: "turnStart", tgt: "side", t: (e) => `−${e.mag} знание за ход${e.max ? ` (доход не ниже ${e.max})` : ""}` },
  swapRate: { trig: "active", tgt: "city", stack: "none", t: (e) => `обмен: 1 знание → ${e.mag} з${e.max ? ` (до ${e.max} за раз)` : ""}` },
  harborWater: { trig: "turnStart", tgt: "side", t: (e) => `${sg(e.mag)} з за клетку воды в территории (до ${e.max})` },
  glacierGold: { trig: "turnStart", tgt: "side", t: (e) => `раз в ${turns(e.cd || 3)} +${pct(e.mag)} к золоту (до +${e.max})` },
  quarryGold: { trig: "turnStart", tgt: "side", t: (e) => `${sg(e.mag)} з с каждой Каменоломни на карте в территории` },
  // территория
  capR: { trig: "always", tgt: "city", t: (e) => `${sg(e.mag)} к радиусу территории столицы` },
  capRLvl: { trig: "always", tgt: "city", t: (e) => `бонус к радиусу — только со ${e.mag}-го уровня столицы` }, // t1163: «Чаща»
  outR: { trig: "always", tgt: "city", t: (e) => `${sg(e.mag)} к радиусу территории застав` },
  outposts: { trig: "always", tgt: "side", t: (e) => `${sg(e.mag)} застава сверх лимита` },
  outDist: { trig: "always", tgt: "side", t: (e) => `заставу можно ставить на ${e.mag} ближе к столице` },
  terrGlory: { trig: "turnStart", tgt: "side", t: (e) => `Слава за территорию ×${1 + e.mag / 2}` },
  // бой и условия
  killGlory: { trig: "onKill", tgt: "side", t: (e) => `${sg(e.mag)} Славы за каждое убийство` },
  siege: { trig: "always", tgt: "cities", t: (e) => `осада своих городов дольше на ${turns(e.mag)}` },
  atkEnemyT: { trig: "onAttack", tgt: "own", cond: ["enemyTerritory"], t: (e) => `${sg(e.mag)} АТК на вражеской земле` },
  armOwnT: { trig: "always", tgt: "own", cond: ["ownTerritory"], t: (e) => `${sg(e.mag)} БРН на своей земле` },
  armOutside: { trig: "always", tgt: "own", cond: ["outsideOwn"], t: (e) => `${sg(e.mag)} БРН вне своей земли (не ниже 0)` },
  armKing2: { trig: "always", tgt: "own", cond: ["nearChief"], t: (e) => `${sg(e.mag)} БРН своим в радиусе 2 от Вождя` },
  formation: { trig: "always", tgt: "own", cond: ["adjacentPawn"], t: (e) => `${sg(e.mag)} БРН фигуре рядом со своим Ополченцем` },
  ambush: { trig: "onAttack", tgt: "enemy", cond: ["targetMoved"], t: (e) => `${sg(e.mag)} урона по фигуре, ходившей в прошлый ход` },
  fury: { trig: "onAttack", tgt: "enemy", cond: ["targetBurning"], t: (e) => `${sg(e.mag)} АТК по горящей цели` },
  rime: { trig: "onAttack", tgt: "enemy", cond: ["targetChilled"], t: (e) => `${sg(e.mag)} АТК по обмороженной цели (и в ход после)` },
  burn: { trig: "onHit", tgt: "enemy", t: (e) => `удар поджигает: ${e.mag} урона в начале хода цели, ${turns(e.dur || 1)}` },
  burnT: { trig: "onHit", tgt: "enemy", t: (e) => `поджог длится на ${turns(e.mag)} дольше` },
  burnD: { trig: "onHit", tgt: "enemy", t: (e) => `${sg(e.mag)} урона от поджога` },
  chill: { trig: "onHit", tgt: "enemy", t: (e) => `удар обмораживает: цель ходит максимум на ${cells(e.mag)}, конь не прыгает, ${turns(e.dur || 1)}` },
  chillT: { trig: "onHit", tgt: "enemy", t: (e) => `обморозка длится на ${turns(e.mag)} дольше` },
  chain: { trig: "onHit", tgt: "enemy", cond: ["firstHitTurn"], t: (e) => `первый удар за ход бьёт разрядом ${e.mag} урона соседнего с целью врага` },
  chainDmg: { trig: "onHit", tgt: "enemy", t: (e) => `разряд Молнии ${sg(e.mag)} урона` },
  heal: { trig: "turnStart", tgt: "own", cond: ["ownTerritory"], t: (e) => `${sg(e.mag)} HP своим фигурам на своей земле в начале хода` },
  healCell: { trig: "turnStart", tgt: "cell", cond: ["onCell"], t: (e) => `лечит свою фигуру на клетке на ${e.mag} HP в начале хода` },
  cover: { trig: "always", tgt: "cell", cond: ["onCell"], t: (e) => `укрытие: ${sg(e.mag)} БРН фигуре на клетке` },
  wallArm: { trig: "always", tgt: "own", cond: ["nearCity"], t: (e) => e.radius === 0 ? `${sg(e.mag)} БРН фигуре на клетке города` : `${sg(e.mag)} БРН своим в радиусе ${e.radius ?? 1} от города` },
  forgeAtk: { trig: "always", tgt: "kind", t: (e) => `${sg(e.mag)} АТК выбранному типу фигур${e.max ? ` (до ${e.max} раз)` : ""}` },
  forgeDisc: { trig: "onBuild", tgt: "city", t: (e) => `Кузня дешевле на ${pct(e.mag)}` },
  newAtk: { trig: "onBuild", tgt: "piece", t: (e) => `${sg(e.mag)} АТК новым фигурам` },
  unlockUnit: { trig: "always", tgt: "city", stack: "once", t: (e) => `открывает найм: ${KIND_RU[e.ref || ""]?.[0] || e.ref}` },
  unlockBuild: { trig: "onResearch", tgt: "side", stack: "once", t: (e) => `открывает постройку: ${e.ref}` },
  // Вождь
  auraArm: { trig: "always", tgt: "allies", t: (e) => `${sg(e.mag)} БРН своим в радиусе ${e.radius ?? 1}` },
  auraAtk: { trig: "always", tgt: "allies", t: (e) => `${sg(e.mag)} АТК своим в радиусе ${e.radius ?? 1}` },
  xpMul: { trig: "always", tgt: "self", stack: "none", t: (e) => `опыт Вождя ×${e.mag}` },
  slayer: { trig: "onAttack", tgt: "enemy", cond: ["vsChief"], t: (e) => `${sg(e.mag)} АТК против Вождя и Героя` },
  healAct: { trig: "active", tgt: "allies", t: (e) => `1 ОД: лечит своих в радиусе ${e.radius ?? 2} на ${e.mag} HP` },
  ultimate: { trig: "active", tgt: "cell", t: (e) => `${e.max || 2} ОД, ультимейт: ${e.ref || ""}${e.mag ? `; урон ${e.mag}` : ""}${e.radius ? `; дальность ${e.radius}` : ""}; по Вождю — половина урона, не добивает` },
  nextHit: { trig: "active", tgt: "self", t: (e) => `${e.max || 1} ОД: следующий удар +${e.mag} урона` },
  guardAct: { trig: "active", tgt: "self", t: (e) => `${e.max || 1} ОД: +${e.mag} БРН себе` },
  selfHeal: { trig: "active", tgt: "self", t: (e) => `${e.max || 1} ОД: лечит себя на ${e.mag} HP` },
  volleyAct: { trig: "active", tgt: "enemy", t: (e) => `${e.max || 1} ОД: выстрел на ${e.mag} урона по врагу` },
  actUpgrade: { trig: "always", tgt: "self", t: (e) => `уровень 4: умение сильнее ×${String(e.mag).replace(".", ",")}, перезарядка на ${e.ref || 1} короче` },
  summon: { trig: "active", tgt: "side", t: (e) => `1 ОД: призывает ${e.mag > 1 ? e.mag + " " : ""}Ополченца рядом (в пределах лимита фигур)` },
  // t1140–t1143: эпоха IV, земля, ОД
  terrGrow: { trig: "turnStart", tgt: "cities", t: (e) => `рост земли на ${e.mag} ход быстрее (не быстрее минимума лиги)` },
  ultPow: { trig: "always", tgt: "self", t: (e) => `ультимейт Вождя сильнее на ${e.mag}` },
  ultCd: { trig: "always", tgt: "self", t: (e) => `перезарядка ультимейта Вождя на ${e.mag} хода короче` },
  wonderUlt: { trig: "always", tgt: "self", cond: ["wonderBuilt"], t: (e) => `с Великим чудом ультимейт Вождя ещё на ${e.mag} сильнее` },
  wonderCd: { trig: "always", tgt: "self", cond: ["wonderBuilt"], t: (e) => `с Великим чудом перезарядка ультимейта ещё на ${e.mag} короче` },
  apOnce: { trig: "turnStart", tgt: "side", stack: "none", t: (e) => `${sg(e.mag)} ОД за ход (одна на игрока${e.max && e.max > 1 ? `, до ${e.max} в этой лиге` : ""})` },
  towerField: { trig: "always", tgt: "cell", stack: "none", t: (e) => `ставится Вождём рядом с собой, вне своей земли до ${cellsG(e.mag)} от неё; ${e.max} ОЗ, ответный удар ${e.ref}; +1 БРН своим рядом` },
  legend: { trig: "always", tgt: "side", stack: "once", t: (e) => `легендарная (эпоха IV, ${e.mag} на игрока, только в столице)` },
  // клетки, цели
  ruin: { trig: "onEnter", tgt: "side", stack: "once", t: (e) => `разово первому вошедшему: ${e.ref}` },
  obelisk: { trig: "turnStart", tgt: "side", cond: ["onCell"], t: (e) => `${sg(e.mag)} Славы за ход, пока на клетке своя фигура` },
  holdPoint: { trig: "turnStart", tgt: "side", cond: ["onCell"], t: (e) => `${sg(e.mag)} очко «Твердыни», пока на клетке своя фигура` },
  wonderSite: { trig: "always", tgt: "cell", t: () => `место для Великого чуда (по желанию)` },
  impassable: { trig: "always", tgt: "cell", stack: "none", t: (e) => e.ref ? `непроходимо (кроме расы ${e.ref})` : `непроходимо` },
  blocksShot: { trig: "always", tgt: "cell", stack: "none", t: () => `закрывает обстрел` },
  stopsSlide: { trig: "always", tgt: "cell", stack: "none", t: () => `скольжение останавливается на клетке` },
  goal: { trig: "onBuild", tgt: "side", stack: "once", t: (e) => `выполняет цель «${e.ref}»` },
  elem: { trig: "onAttack", tgt: "enemy", stack: "none", t: (e) => `${sg(Math.round(e.mag * 100))}% урона по ${e.ref}` },
  // способности фигур
  move: { trig: "always", tgt: "self", stack: "none", t: (e) => e.ref ? `${e.ref}` : `ходит до ${cellsG(e.mag)}` },
  ranged: { trig: "always", tgt: "self", stack: "none", t: (e) => `бьёт издалека по диагоналям до ${cellsG(e.mag)}, сам не встаёт на клетку цели` },
  jump: { trig: "always", tgt: "self", stack: "none", t: () => `ходит буквой «Г» и перепрыгивает фигуры и рельеф` },
  promote: { trig: "onEnter", tgt: "self", stack: "once", t: () => `дойдя до последней линии, превращается (по умолчанию в Стража)` },
  era: { trig: "always", tgt: "self", stack: "none", t: (e) => `найм с эпохи ${["", "I", "II", "III"][e.mag] || e.mag}, один на игрока` },
};

/** Описание одного эффекта (живые числа из самого эффекта). */
export function describeEffect(e: Effect): string {
  const s = EFFECT_KEYS[e.key]; if (!s) return "";
  let t = s.t(e);
  const own = new Set(s.cond || []);
  const extra = (e.cond || []).filter((c) => !own.has(c) && !t.includes(COND_RU[c]) && c !== "alive").map((c) => COND_RU[c]);
  if (e.cond?.includes("alive") && !t.includes("пока жив")) extra.push("пока жив");
  if (e.trigger === "active" && e.cd && !t.includes("перезарядка")) extra.push(`перезарядка ${turns(e.cd)}`);
  if (e.dur && !t.includes("ход") && e.key !== "burn") extra.push(`на ${turns(e.dur)}`);
  return extra.length ? `${t} (${extra.join(", ")})` : t;
}
export const describeEffects = (list: Effect[]) => list.map(describeEffect).filter(Boolean).join("; ");

const mk = (key: string, mag: number, o: Partial<Effect> = {}): Effect => {
  const s = EFFECT_KEYS[key]; return { key, trigger: s?.trig || "always", target: s?.tgt || "side", stack: s?.stack || "add", mag, ...(s?.cond ? { cond: s.cond } : {}), ...o };
};
/** fx-объект (технологии, навыки, таланты) → Effect[]; неизвестный ключ → key "unknown:<k>" (тест ловит) */
export function fxToEffects(fx: Record<string, any> | undefined, base: Partial<Effect> = {}): Effect[] {
  const out: Effect[] = []; if (!fx) return out;
  const r = fx.r, cd = fx.cd;
  for (const [k, v] of Object.entries(fx)) {
    if (k === "r" || k === "cd") continue;
    if ((k === "atkK" || k === "armK") && v && typeof v === "object") { for (const [kind, m] of Object.entries(v)) if (m) out.push(mk(k === "atkK" ? "atk" : "arm", m as number, { ...base, target: "kind", kind })); continue; }
    if (typeof v !== "number" || !v) continue;
    if (k === "heal" && cd) { out.push(mk("healAct", v, { ...base, trigger: "active", radius: r ?? 2, cd })); continue; }
    if (k === "summon") { out.push(mk("summon", v, { ...base, trigger: "active", cd })); continue; }
    if (k === "burn") { out.push(mk("burn", 1, { ...base, dur: 2 })); continue; }
    if (!EFFECT_KEYS[k]) { out.push({ key: "unknown:" + k, trigger: "always", target: "side", mag: v, stack: "add" }); continue; }
    out.push(mk(k, v, { ...base, ...(k.startsWith("aura") ? { radius: r ?? 1 } : {}) }));
  }
  return out;
}

// ---------- каталог всех эффектов из конфига (для подсказок и теста полноты)
const bpR = (cfg: any, race: string | undefined, b: string, key: string) => {
  const t = cfg.buildTpl?.[b] ? b : "special", v = race ? cfg.buildRace?.[race]?.[t]?.p?.[key] : undefined;
  if (typeof v === "number") return v; const d = cfg.buildTpl?.[t]?.p?.[key]; if (typeof d === "number") return d; return cfg.build?.[b]?.[key] || 0;
};
/** эффекты постройки для расы (живые числа: шаблон → расовый вариант → общие величины econ) */
export function buildingEffects(cfg: any, b: string, race?: string): Effect[] {
  const E = cfg.econ, o: Effect[] = [], B = cfg.build[b] || {};
  const add = (k: string, m: number, x: Partial<Effect> = {}) => { if (m) o.push(mk(k, m, x)); };
  switch (b) {
    case "barracks": add("unlockUnit", 1, { ref: "rook" }); add("pawnCost", bpR(cfg, race, b, "pawnCost") || E.pawnBarracks || 2); break;
    case "stable": add("unlockUnit", 1, { ref: "knight" }); add("knightDisc", bpR(cfg, race, b, "knightDisc")); break;
    case "magetower": add("unlockUnit", 1, { ref: "mage" }); break;
    case "forge": add("forgeAtk", bpR(cfg, race, b, "atk") || 1, { max: E.forgeMax }); break;
    case "wall": add("wallArm", bpR(cfg, race, b, "arm"), { radius: bpR(cfg, race, b, "r") }); break;
    case "market": add("gold", bpR(cfg, race, b, "gold")); add("swapRate", bpR(cfg, race, b, "rate") || E.market.rate, { max: E.market.max }); break;
    case "library": add("know", bpR(cfg, race, b, "know")); break;
    case "granary": add("growth", bpR(cfg, race, b, "growth"), { target: "city" }); add("gold", bpR(cfg, race, b, "gold")); break;
    case "crucible": add("forgeDisc", 0.5); add("newAtk", 1); break;
    case "glacier": add("glacierGold", E.glacier.share, { cd: E.glacier.every, max: E.glacier.max }); break;
    case "harbor": add("harborWater", 1, { max: E.fx.harborMax }); break;
    case "quarry": add("wallArm", E.fx.quarryWallArm, { radius: 1, ref: "quarry" }); add("quarryGold", E.fx.quarryGold); break;
    case "sacredgrove": add("know", B.know || 0); add("growth", B.growth || 0, { target: "city" }); break;
    case "lightningrod": add("know", B.know || 0); add("chainDmg", E.fx.rodChain); break;
    case "warcouncil": add("apOnce", E.league?.normal?.apBld || 3, { max: E.league?.tactical?.onceMax || 1 }); break;
    case "watchtower": add("towerField", E.tower?.outDist || 2, { max: E.tower?.hp || 16, ref: String(E.tower?.counter || 2) }); break;
    case "wonder": o.push(...fxToEffects(B.fx)); add("glory", cfg.goals?.wonderGlory || 0); add("goal", 1, { ref: cfg.goals?.info?.wonder?.name || "Великое чудо", cond: ["capitalOnly", "lastEra"] }); break;
    default: add("gold", B.gold || 0); add("know", B.know || 0); add("growth", B.growth || 0); if (B.fx) o.push(...fxToEffects(B.fx));
  }
  if (B.legend) add("legend", E.era4?.legendMax || 1);
  return o;
}
/** t1163: числа расы для размера поля (как econ.raceCfg в партии): econ.league[лига].race[раса] поверх cfg.race[раса]; без size — общие */
export function raceNums(cfg: any, race: string, size?: number): any {
  const b = cfg.race?.[race] || {}, E = cfg.econ || {}; if (!size || !E.leagueRules || !E.league) return b;
  const o = E.league[leagueOf(size) || "tactical"]?.race?.[race]; return o ? { ...b, ...o } : b;
}
export function raceEffects(cfg: any, race: string, size?: number): Effect[] {
  const R = raceNums(cfg, race, size), o: Effect[] = [];
  if (R.hpMul && R.hpMul !== 1) o.push(mk("hpMul", R.hpMul));
  if (R.atk) o.push(mk("atk", R.atk)); if (R.arm) o.push(mk("arm", R.arm));
  if (R.rookAtk) o.push(mk("atk", R.rookAtk, { target: "kind", kind: "rook" }));
  if (R.burnTurns) o.push(mk("burn", R.burnDmg || 1, { dur: R.burnTurns }));
  if (R.chillTurns) o.push(mk("chill", R.chillMove || 1, { dur: R.chillTurns }));
  if (R.knowPen) o.push(mk("knowPen", R.knowPen, { max: R.knowFloor }));
  if (R.healOwnT) o.push(mk("heal", R.healOwnT));
  if (R.mageMove) o.push(mk("mageMove", R.mageMove, { target: "kind", kind: "mage" }));
  if (R.growthMul && R.growthMul !== 1) o.push(mk("growthMul", R.growthMul));
  if (R.forestKnow) o.push(mk("forestKnow", R.forestKnow, { max: R.forestKnowMax }));
  if (R.armOutside) o.push(mk("armOutside", R.armOutside));
  if (R.chain) o.push(mk("chain", R.chain));
  if (race === "stone") o.push(mk("move", 0, { ref: "проходит через горы" }));
  if (race === "water") o.push(mk("move", 0, { ref: "проходит по воде" }));
  const ring = ["water", "fire", "ice", "nature", "stone", "lightning"], i = ring.indexOf(race);
  if (i >= 0 && cfg.elementBonus) o.push(mk("elem", cfg.elementBonus, { ref: `расе «${RACE_RU[ring[(i + 1) % 6]]}»` }));
  return o;
}
export function unitEffects(cfg: any, kind: string): Effect[] {
  const R = cfg.range;
  switch (kind) {
    case "pawn": return [mk("move", 1, { ref: "ходит на 1 вперёд или вбок, отступает на 1 по диагонали назад; бьёт по диагонали вперёд" }), mk("promote", 1)];
    case "knight": return [mk("jump", 1)];
    case "mage": return [mk("move", R.mageMove, { ref: `ходит по диагонали до ${cellsG(R.mageMove)}` }), mk("ranged", R.mageShot)];
    case "rook": return [mk("move", R.rookMove, { ref: `ходит по прямой до ${cellsG(R.rookMove)}; бьёт соседнюю клетку по прямой` })];
    case "hero": return [mk("move", R.heroMove, { ref: `ходит в любую сторону до ${cellsG(R.heroMove)}` }), mk("era", 2)];
    case "king": return [mk("move", 1, { ref: "ходит на 1 в любую сторону; растёт в уровнях и учит навыки" })];
  }
  return [];
}
export function cellEffects(cfg: any, ch: string): Effect[] {
  const S = cfg.econ.struct?.[ch] || {}, o: Effect[] = [];
  const res = () => { if (S.gold) o.push(mk("gold", S.gold, { cond: ["ownTerritory"] })); if (S.know) o.push(mk("know", S.know, { cond: ["ownTerritory"] })); if (S.glory) o.push(mk("glory", S.glory, { cond: ["ownTerritory"] })); if (S.growth) o.push(mk("growth", S.growth, { target: "city", cond: ["ownTerritory"] })); };
  const H = cfg.goals?.hold;
  switch (ch) {
    case "f": o.push(mk("cover", TER_RULES.forestArm), mk("stopsSlide", 1)); break;
    case "g": o.push(mk("cover", TER_RULES.gateArm)); break;
    case "m": o.push(mk("impassable", 1, { ref: "Камня" }), mk("blocksShot", 1)); break;
    case "w": o.push(mk("impassable", 1, { ref: "Воды" })); break;
    case "#": o.push(mk("impassable", 1), mk("blocksShot", 1)); break;
    case ".": case ",": case "b": case "r": o.push(mk("move", 0, { ref: "обычная проходимая клетка" })); break;
    case "T": o.push(mk("cover", TER_RULES.towerArm)); if (H) o.push(mk("holdPoint", H.point)); break;
    case "W": o.push(mk("healCell", TER_RULES.wellHeal)); break;
    case "R": { const R = cfg.econ.ruins; o.push(mk("ruin", 1, { ref: `${R.gold} з, ${R.know} знания, ${R.glory} Славы` })); break; }
    case "X": o.push(mk("obelisk", cfg.econ.obelisk.glory)); if (H) o.push(mk("holdPoint", H.point)); break;
    case "O": o.push(mk("wonderSite", 1)); if (H) o.push(mk("holdPoint", H.point)); break;
    case "P": o.push(mk("move", 0, { ref: "место старта Вождя и столицы" })); break;
    default: res();
  }
  if (!o.length) res();
  return o;
}
/** навык Вождя: статы — самому Вождю; поджог — по правилам расы Огня (живые числа) */
/** ультимейт (Вождь/фигура) → эффект с живыми числами из cfg.ults / cfg.unitUlts */
export function ultEffects(cfg: any, id: string, unit = false): Effect[] {
  const u = (unit ? cfg.unitUlts : cfg.ults)?.[id]; if (!u) return [];
  return [{ key: "ultimate", trigger: "active", target: "cell", mag: u.dmg || 0, radius: u.range, cd: u.cd, max: u.ap, stack: "none", ref: u.eff }];
}
/** активное умение фигуры (ур. 3) */
export function unitActEffects(a: any): Effect[] {
  const key = ({ strike: "nextHit", guard: "guardAct", mend: "selfHeal", volley: "volleyAct" } as any)[a.type]; if (!key) return [];
  return [{ key, trigger: "active", target: a.type === "volley" ? "enemy" : "self", mag: a.mag, cd: a.cd, max: a.ap, stack: "none", ...(a.dur ? { dur: a.dur } : {}), ...(a.r ? { radius: a.r } : {}) }];
}
export function chiefEffects(cfg: any, n: { kind: string; fx: Record<string, any>; ult?: string }): Effect[] {
  if (n.ult) return ultEffects(cfg, n.ult);
  const F = cfg.race.fire || {};
  return fxToEffects(n.fx, { kind: "king", ...(n.kind === "active" ? { trigger: "active" as Trigger } : {}) }).map((e) =>
    e.key === "burn" ? { ...e, kind: undefined, mag: F.burnDmg || 1, dur: F.burnTurns || 2 } : e.key.startsWith("aura") || e.key === "healAct" || e.key === "summon" || e.key === "glory" || e.key === "ap" || e.key === "slayer" ? { ...e, kind: undefined } : e);
}
/** Полный каталог: всё, у чего игрок видит подсказку. race — расовые имена/варианты (иначе шаблон). */
export function effectCatalog(cfg: any, race?: string, view?: (t: any, race: string) => any, size?: number): EffectSource[] {
  const out: EffectSource[] = [];
  for (const r of Object.keys(cfg.race)) if (!race || r === race) out.push({ src: "race", id: r, race: r, name: RACE_RU[r] || r, effects: raceEffects(cfg, r, size) });
  for (const d of cfg.chiefs || []) if (!race || d.race === race || d.race === "any") for (const n of d.tree) out.push({ src: "chief", id: n.id, owner: d.id, race: d.race, name: n.name, effects: chiefEffects(cfg, n) });
  for (const [kind, T] of Object.entries(cfg.unitTree || {}) as [string, any][]) {
    for (const a of T.act) out.push({ src: "talent", id: a.id, owner: kind, name: a.name, effects: unitActEffects(a) });
    out.push({ src: "talent", id: kind + ":up", owner: kind, name: "Ур. 4", effects: [{ key: "actUpgrade", trigger: "always", target: "self", mag: T.up.pow, stack: "none", ref: String(T.up.cd) }] });
    const uu = cfg.unitUlts?.[T.ult]; if (uu) out.push({ src: "talent", id: T.ult, owner: kind, name: uu.name, effects: ultEffects(cfg, T.ult, true) });
  }
  for (const [kind, rows] of Object.entries(cfg.talents || {})) for (const pair of rows as any[]) for (const t of pair) {
    const fx: any = {}; for (const k of ["atk", "arm", "hp", "shot", "ap"]) if (t[k]) fx[k] = t[k];
    const ef = fxToEffects(fx, { target: "self" }).map((e) => (e.key === "shot" ? { ...e, stack: "add" as const } : e.key === "ap" ? { ...e, cond: ["alive" as Cond] } : e));
    out.push({ src: "talent", id: t.id, owner: kind, name: t.name, effects: ef });
  }
  for (const t0 of cfg.techs || []) {
    if (race && t0.race && t0.race !== race) continue;
    const t = race && view ? view(t0, race) : t0;
    const ef = fxToEffects(t.fx); if (t.id === "static") ef.push(mk("chainDmg", cfg.econ.fx.staticChain)); for (const b of t.unlock || []) ef.push(mk("unlockBuild", 1, { ref: (cfg.buildRace?.[race || ""]?.[cfg.buildTpl?.[b] ? b : "special"]?.name) || cfg.build[b]?.name || b }));
    out.push({ src: "tech", id: t.id, race: t.race || race, name: t.name, effects: ef });
  }
  for (const b of Object.keys(cfg.build)) { const B = cfg.build[b]; if (race && B.race && B.race !== race) continue; out.push({ src: "building", id: b, race: B.race || race, name: (race && cfg.buildRace?.[race]?.[cfg.buildTpl?.[b] ? b : "special"]?.name) || B.name, effects: buildingEffects(cfg, b, race) }); }
  for (const ch of Object.keys(TERRAIN)) out.push({ src: "terrain", id: ch, name: (TERRAIN as any)[ch].name, effects: cellEffects(cfg, ch) });
  for (const ch of Object.keys(STRUCT)) out.push({ src: "struct", id: ch, name: (STRUCT as any)[ch].name, effects: cellEffects(cfg, ch) });
  for (const k of Object.keys(cfg.units)) out.push({ src: "unit", id: k, name: KIND_RU[k]?.[0] || k, effects: unitEffects(cfg, k) });
  return out;
}
/** Подсказка для источника: «Имя: эффект; эффект» */
export const describeSource = (s: EffectSource) => describeEffects(s.effects);
