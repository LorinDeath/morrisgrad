// Процедурное наполнение открытых миров: регионы-биомы по ярусам сложности, таблицы мобов (из бестиария),
// режиссёр спавна, мировые боссы и редкие Отголоски на длинных таймерах, узлы ресурсов.
// Общий для сервера (Zone — авторитет) и клиента (те же узлы ресурсов и регионы из того же сида — без пересылки).
// Всё детерминировано сидом экземпляра зоны (mulberry32), чтобы баги воспроизводились.
// Параметры и обоснование — docs/MORRISCURSE-BALANCE.md, раздел «Открытый мир: спавн».
import { STATIC_NPCS as NPCS, ZONE_RESPAWN } from "./shared";
import { LEVEL_GAP } from "./levelGap";
import { WORLD_SIZES, ARINAR_HUB } from "../worlds/sizes";
import { BIOMES, VARIANTS, VARIANT_BY_ID, type BiomeId } from "./biomes";

export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface MobRow { type: string; w: number; pack: [number, number] }
export interface Region {
  id: string; name: string; band: string; tier: number; lvl: [number, number]; biome: string; tags: Record<string, number>;
  rect: [number, number, number, number]; // x0, y0, x1, y1 (px мира)
  cap: number;                            // максимум живых мобов региона
  table: MobRow[];
  night?: Record<string, number>;         // множители весов в «Фиолетовую ночь»
  elite: number;                          // шанс элиты на пачку
  // плотность (админка «Спавн» → локация; пусто = как в коде): множитель числа лагерей, пачек в лагере, мобов в пачке,
  // максимум элит в лагере (кроме вожаков), есть ли мировой босс в локации
  dens?: number; packs?: [number, number]; pack?: [number, number]; eliteMax?: number; bossOn?: boolean;
  nodes: { type: string; res: string; n: number; respawn: number; qty: [number, number] }[];
}
export interface WorldBossDef { type: string; key?: string; x: number; y: number; firstAfter: number; every: number; where: string; stagger?: number }
export interface RareDef { type: string; region: string; every: [number, number]; life: number }
export interface SafeZone { x: number; y: number; r: number; name: string }
export interface WorldGen {
  id: string; size: number; seed: number; globalCap: number; nearBase: number; nearPerPlayer: number; nearMax: number;
  safe: SafeZone[]; regions: Region[]; bosses: WorldBossDef[]; rares: RareDef[]; respawn: { x: number; y: number };
  camps?: boolean; // фиксированные лагеря-пачки (крупные миры) вместо режиссёра у игроков
}

// Общие параметры режиссёра (миры переопределяют капы)
export const ZONE_GEN = {
  regenCombat: 0.1,          // множитель восстановления ХП в бою (нанёс/получил урон за последние regenCombatSec)
  regenCombatSec: 5,         // «в бою» столько секунд после последнего удара
  levelGap: LEVEL_GAP,       // урон героя по мобу выше уровнем: +1/+2/+3… (тот же объект, что в balance.ts)
  seed: 0x4d454c56,          // «MELV»: сид экземпляра Аринара по умолчанию
  globalCap: 60,             // все мобы зоны (без боссов и редких) — для режиссёра (Поляна)
  nearBase: 6,               // мобов в радиусе nearR вокруг игрока, если он один
  nearPerPlayer: 3,          // +за каждого игрока поблизости
  nearMax: 16,               // потолок плотности вокруг группы
  nearR: 480,
  spawnMinDist: 300,         // не появляться на глазах: минимум до любого игрока
  spawnMinDistCrowded: 170,  // если игроки покрыли всю карту — вторая половина попыток с меньшим отступом
  spawnMaxDist: 950,         // и только в регионах рядом с игроками (AOI): дальше — не спавним
  mobMinDist: 55,            // «Пуассон»: минимум между новым мобом и живыми
  ratePerSec: 1.5,           // ведро токенов: пачек в секунду
  burst: 4,
  directorEvery: 0.5,        // с, такт режиссёра (дёшево для DO)
  tries: 10,                 // кандидатов позиции на пачку
  despawnDist: 1150,         // дальше от всех игроков…
  despawnIdle: 30,           // …и вне боя столько секунд → исчезает
  // лагеря (Аринар): сетка с шагом campStep и разбросом; соседние лагеря дальше, чем радиус «подтягивания»
  campStep: 1000, campJitter: 220, campMinDist: 900, campRespawn: 45,
  // большие лагеря: 2–3 пачки по кругу campRing + вожак (×chiefHp ОЗ, ×chiefDmg урон), в части лагерей два вожака
  campFill: 0.95, campAccept: 0.3, campRing: 120, campPacks3: 0.45, campTwoChiefs: 0.22, chiefHp: 2.6, chiefDmg: 1.4,
  // кочевники: доля мобов региона, бродят по петле соседних лагерей (в пределах roamRange) и дерутся с враждебными
  roamPct: 0.07, roamRange: 3200,
  // поводок MMO: моб дальше leash от дома → «сброс» (уходит домой, быстро лечится, игнорирует игроков)
  leash: 900, leashBoss: 1300, resetSpeed: 2.2, resetRegen: 0.6, // доля maxHp в секунду
  sleepR: 1, // спят чанки дальше этого числа соседних чанков (WORLD_CHUNK) от любого игрока
  cursedPct: 10, cursedHp: 4.5, cursedDmg: 2.2, cursedLoot: 10, cursedSpeed: 1.5, cursedLeap: 0.55, // скорость/рывок — анти-kite; соло проклятого нельзя
  eliteHp: 2.2, eliteDmg: 1.5, eliteArmor: 1.4, eliteXp: 2.5,
  nodeMinDist: 95,
  bossScalePerPlayer: 0.5,   // ХП босса ×(1 + 0.5·(игроков−1)), максимум ×2.5
  // Анти-kite мировых боссов: ярость если мало damagers / долго бой; рывки чаще; скорость выше
  bossEnrageSec: 75,         // через N с боя с <bossEnrageMinPlayers damagers → ярость
  bossEnrageMinPlayers: 3,
  bossEnrageDmg: 2.8,
  bossEnrageSpeed: 1.75,
  bossCombatSpeed: 1.25,     // в бою босс быстрее обычного моба
  bossLeapMul: 0.5,          // кд рывка×
  bossSoftEnrageSec: 360,    // мягкий enrage для рейда (~6 мин) — ×урона даже в группе
  // «бродячие» мобы (Аринар, ДОБАВКА к лагерям): раз в ambientEvery с на игрока, если в ambientNear px нет живых мобов —
  // ambientChance % один обычный моб региона у края экрана (ambientEdge px), ambientGroupChance % — группа ambientGroup + 1 элита;
  // идут на игрока (охота ambientHunt с); не больше ambientCap на игрока; уходят, если далеко/без боя ambientLife с
  ambientOn: 1, ambientEvery: 10, ambientChance: 10, ambientGroupChance: 1, ambientNear: 420, ambientEdge: 380,
  ambientGroup: 3, ambientCap: 6, ambientHunt: 25, ambientLife: 60, ambientDespawnDist: 1100,
};

// ---------- таблицы регионов: тег where бестиария → вес ----------
// Таблицы мобов заполняет ТОЛЬКО сервер (zoneTables.ts импортирует бестиарий со снаряжением) —
// клиентский бандл получает лишь регионы, теги и узлы ресурсов.
const reg = (o: Omit<Region, "table" | "night">): Region => ({ ...o, table: [], night: {} });
const N = (type: string, res: string, n: number, respawn: number, qty: [number, number] = [1, 2]) => ({ type, res, n, respawn, qty });

// ---------- Аринар (государство Мэлвелдил), 48000×48000 (1500×1500 клеток по 32 px) ----------
// Координаты раскладки заданы в «базовых» единицах 24000 и масштабируются K = размер/24000 (сейчас ×2).
const K = WORLD_SIZES.arinar / 24000;
const sc = (r: number[]) => r.map((v) => Math.round(v * K)) as [number, number, number, number];
// Центр — хаб «Гранатовый двор» (порталы, Алзи, Лэйр, гранатовые деревья и фиалки). Вокруг хаба — кольцо ур. 1–5
// (рощи/луга фиалок/гранатовые сады). Дальше «вертушкой» — 4 стихийных биома (biomes.ts), у каждого
// внутренняя (ближе к хабу) и внешняя половины. В углах — окраины прежних ярусов 6–25 (их мобы и мировые боссы).
const H0 = 9600, H1 = 14400, HC0 = 11100, HC1 = 12900; // базовые единицы (× K в sc)
const bt = (biome: BiomeId, half: 0 | 1): MobRow[] => {
  const vs = VARIANTS.filter((v) => v.biome === biome && !v.boss);
  const n = vs.length / 2;
  return (half ? vs.slice(n) : vs.slice(0, n)).map((v) => ({ type: v.id, w: 1, pack: v.base.match(/bat|wisp|fly|imp|mite|sprite/) ? [2, 4] : [2, 3] }));
};
const BR = (biome: BiomeId, half: 0 | 1, name: string, rect: [number, number, number, number], nodes: Region["nodes"]): Region => {
  const tbl = bt(biome, half), lv = tbl.map((r) => VARIANT_BY_ID[r.type].lvl);
  return { ...reg({ id: `${biome}_${half ? "outer" : "inner"}`, name, band: BIOMES[biome].name, tier: Math.ceil(Math.max(...lv) / 5), lvl: [Math.min(...lv), Math.max(...lv)],
    biome: `b_${biome}`, rect, cap: 0, elite: 0.06, tags: {}, nodes }), table: tbl };
};
const ARINAR_CORE: Region[] = [
  reg({ id: "hub", name: "Гранатовый двор", band: "Сердце Аринара", tier: 1, lvl: [1, 1], biome: "garden", rect: sc([HC0, HC0, HC1, HC1]), cap: 0, elite: 0, tags: {},
    nodes: [N("tree", "dreamwood", 3, 35, [1, 2]), N("flower", "moonpetal", 4, 40)] }),
  reg({ id: "groves", name: "Северные гранатовые рощи", band: "Мэлвелдил I", tier: 1, lvl: [1, 5], biome: "grove", rect: sc([H0, H0, H1, HC0]), cap: 0, elite: 0.04,
    tags: { groves: 3, polyana_ring: 1 }, nodes: [N("tree", "dreamwood", 10, 35, [1, 3]), N("flower", "moonpetal", 4, 40)] }),
  reg({ id: "meadow", name: "Луга фиалок", band: "Мэлвелдил I", tier: 1, lvl: [1, 5], biome: "meadow", rect: sc([H0, HC1, H1, H1]), cap: 0, elite: 0.05,
    tags: { meadow: 3, polyana_ring: 1 }, nodes: [N("flower", "moonpetal", 12, 40), N("tree", "dreamwood", 3, 35, [1, 3])] }),
  reg({ id: "violets_w", name: "Фиалковая лощина", band: "Мэлвелдил I", tier: 1, lvl: [1, 5], biome: "meadow", rect: sc([H0, HC0, HC0, HC1]), cap: 0, elite: 0.04,
    tags: { meadow: 2, polyana_ring: 2 }, nodes: [N("flower", "moonpetal", 5, 40)] }),
  reg({ id: "pome_e", name: "Гранатовый сад Мэлвелдила", band: "Мэлвелдил I", tier: 1, lvl: [1, 5], biome: "garden", rect: sc([HC1, HC0, H1, HC1]), cap: 0, elite: 0.04,
    tags: { groves: 2, gardens_edge: 2 }, nodes: [N("tree", "dreamwood", 6, 35, [1, 3])] }),
];

// ---------- генерация «как в Minecraft»: много пятен одного биома по всей карте ----------
// Карта вне кольца хаба делится на клетки PATCH_CELL; клетка относится к ближайшему «семени» Вороного
// (расстояние с шумом → неровные края). Семян 40: по 6 пятен на каждый стихийный биом + по 2 на прежние ярусы.
// Уровни задаёт ТИП биома (внутренняя/внешняя половина — по удалённости клетки от хаба), а не место на карте.
export const PATCH_CELL = 2400;
const PG = Math.round(WORLD_SIZES.arinar / PATCH_CELL);
const RING0 = Math.floor((H0 * K) / PATCH_CELL), RING1 = Math.ceil((H1 * K) / PATCH_CELL); // клетки кольца хаба
type Kind = { kind: string; biome?: BiomeId; mk: (half: 0 | 1, rect: Region["rect"], name: string) => Region; nm: string };
const LEG = (id: string, name: string, band: string, tier: number, lvl: [number, number], biome: string, elite: number, tags: Record<string, number>, nodes: Region["nodes"]): Kind =>
  ({ kind: id, nm: name, mk: (_h, rect, nm) => reg({ id, name: nm, band, tier, lvl, biome, rect, cap: 0, elite, tags, nodes }) });
const ELEM = (biome: BiomeId, inner: string, outer: string, nodes: [Region["nodes"], Region["nodes"]]): Kind =>
  ({ kind: biome, biome, nm: BIOMES[biome].name, mk: (h, rect, nm) => BR(biome, h, `${BIOMES[biome].name}: ${h ? outer : inner}${nm}`, rect, nodes[h]) });
const KINDS: Record<string, Kind> = {
  ice: ELEM("ice", "Алый наст", "Ледник Жертв", [[N("crystal", "starsilver", 1, 60)], [N("crystal", "starsilver", 1, 60, [1, 3])]]),
  fire: ELEM("fire", "Тлеющие поля", "Горн Лазури", [[N("ore", "rot_ore", 1, 45)], [N("ore", "rot_ore", 1, 45, [1, 3])]]),
  stone: ELEM("stone", "Рудные ступени", "Литейная бездна", [[N("ore", "rot_ore", 1, 45)], [N("ore", "rot_ore", 1, 45, [2, 3])]]),
  air: ELEM("air", "Парящие острова", "Край пустоты", [[N("crystal", "starsilver", 1, 60)], [N("crystal", "starsilver", 1, 60, [2, 3])]]),
  gardens: LEG("gardens", "Дикие гранатовые сады", "Мэлвелдил II", 2, [6, 10], "garden", 0.06, { gardens: 3, gardens_edge: 1, meadow_far: 1, village_night: 0.4 }, [N("tree", "dreamwood", 1, 35, [1, 3]), N("flower", "moonpetal", 1, 40)]),
  wastes: LEG("wastes", "Звёздные пустоши", "Мэлвелдил II", 2, [6, 10], "waste", 0.06, { wastes: 3, wastes_low: 0.8, ridge_low: 1.5 }, [N("crystal", "starsilver", 3, 60)]),
  ridge: LEG("ridge", "Восточный кряж", "Мэлвелдил III", 3, [11, 15], "ridge", 0.07, { ridge: 3 }, [N("crystal", "starsilver", 3, 60)]),
  mines: LEG("mines", "Гнилые копи", "Мэлвелдил III", 3, [11, 15], "rot", 0.07, { mines: 3 }, [N("ore", "rot_ore", 3, 45)]),
  pylons: LEG("pylons", "Гудящие пилоны", "Мэлвелдил IV", 4, [16, 20], "pylon", 0.08, { pylons: 3 }, [N("crystal", "starsilver", 3, 60)]),
  glitch: LEG("glitch", "Глитч-разлом", "Мэлвелдил IV", 4, [16, 20], "glitch", 0.08, { glitch: 3 }, [N("ore", "rot_ore", 3, 45)]),
  crater: LEG("crater", "Лунный кратер", "Мэлвелдил V", 5, [21, 25], "crater", 0.1, { crater: 3, crater_edge: 1 }, [N("crystal", "starsilver", 2, 60, [2, 3])]),
  thin: LEG("thin", "Тонкие земли", "Мэлвелдил V", 5, [21, 25], "thin", 0.1, { thin: 3 }, [N("flower", "moonpetal", 1, 40, [2, 3])]),
};
const DIRS = ["В", "ЮВ", "Ю", "ЮЗ", "З", "СЗ", "С", "СВ"];
const dirOf = (x: number, y: number) => DIRS[(Math.round(Math.atan2(y - ARINAR_HUB.y, x - ARINAR_HUB.x) / (Math.PI / 4)) + 8) % 8];
export interface Patch { idx: number; kind: string; x: number; y: number; cells: Region[] }
function genPatches() {
  const R = rng(ZONE_GEN.seed ^ 0x5eed);
  const seeds: { x: number; y: number }[] = [];
  const cx = ARINAR_HUB.x, cy = ARINAR_HUB.y, W = WORLD_SIZES.arinar, ringR = (H1 - H0) * K * 0.5;
  for (let t = 0; seeds.length < 40 && t < 20000; t++) {
    const x = 1200 + R() * (W - 2400), y = 1200 + R() * (W - 2400);
    if (Math.max(Math.abs(x - cx), Math.abs(y - cy)) < ringR + 1800) continue;
    if (seeds.some((q) => Math.hypot(q.x - x, q.y - y) < 5200)) continue;
    seeds.push({ x, y });
  }
  // ярусы: дальние семена — старшие прежние ярусы; остальное — стихии и ярус II вперемешку
  const byD = seeds.map((q, i) => ({ i, d: Math.hypot(q.x - cx, q.y - cy) })).sort((a, b) => b.d - a.d);
  const shuf = <T,>(a: T[]) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(R() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const far = shuf(["pylons", "pylons", "glitch", "glitch", "crater", "crater", "thin", "thin"]);
  const mid = shuf(["ridge", "ridge", "mines", "mines"]);
  const rest = shuf([...["ice", "fire", "stone", "air"].flatMap((k) => Array(6).fill(k)), "gardens", "gardens", "wastes", "wastes"]);
  const kindOf: string[] = [];
  byD.forEach((e, n) => { kindOf[e.i] = n < 8 ? far[n] : n < 12 ? mid[n - 8] : rest[n - 12]; });
  const patches: Patch[] = seeds.map((q, i) => ({ idx: i, kind: kindOf[i], x: Math.round(q.x), y: Math.round(q.y), cells: [] }));
  const grid: (Region | null)[] = new Array(PG * PG).fill(null);
  const cells: Region[] = [];
  const innerR = (H1 - H0) * K * 0.5 + 9000; // ближе — внутренняя половина стихии (ниже уровни)
  for (let j = 0; j < PG; j++) for (let i = 0; i < PG; i++) {
    if (i >= RING0 && i < RING1 && j >= RING0 && j < RING1) continue;
    const x0 = i * PATCH_CELL, y0 = j * PATCH_CELL, mx = x0 + PATCH_CELL / 2, my = y0 + PATCH_CELL / 2;
    const nz = (R() - 0.5) * 1800;
    let best = 0, bd = Infinity;
    seeds.forEach((q, k) => { const d = Math.hypot(q.x - mx, q.y - my) + nz * (k % 2 ? 1 : -1); if (d < bd) { bd = d; best = k; } });
    const P = patches[best], KD = KINDS[P.kind];
    const half: 0 | 1 = Math.hypot(mx - cx, my - cy) > innerR ? 1 : 0;
    const r = KD.mk(half, [x0, y0, x0 + PATCH_CELL, y0 + PATCH_CELL], "");
    const tag = ` (${dirOf(P.x, P.y)}, пятно ${P.idx + 1})`;
    r.name = r.name + tag;
    (r as any).kind = r.id; (r as any).patch = P.idx; r.id = `${r.id}#${i}_${j}`;
    P.cells.push(r); grid[j * PG + i] = r; cells.push(r);
  }
  // «семя» пятна — клетка, ближайшая к центру пятна (от неё дорога в хаб, там же босс)
  for (const P of patches) {
    if (!P.cells.length) continue;
    const mc = P.cells.reduce((a, c) => a + (c.rect[0] + c.rect[2]) / 2, 0) / P.cells.length, mcy = P.cells.reduce((a, c) => a + (c.rect[1] + c.rect[3]) / 2, 0) / P.cells.length;
    const s0 = P.cells.reduce((a, c) => (Math.hypot((c.rect[0] + c.rect[2]) / 2 - mc, (c.rect[1] + c.rect[3]) / 2 - mcy) < Math.hypot((a.rect[0] + a.rect[2]) / 2 - mc, (a.rect[1] + a.rect[3]) / 2 - mcy) ? c : a));
    (s0 as any).seed = true; P.x = (s0.rect[0] + s0.rect[2]) / 2; P.y = (s0.rect[1] + s0.rect[3]) / 2;
  }
  return { patches: patches.filter((p) => p.cells.length), grid, cells };
}
const GEN_P = genPatches();
export const ARINAR_PATCHES = GEN_P.patches;
const ARINAR_REGIONS: Region[] = [...ARINAR_CORE, ...GEN_P.cells];
// боссы: в каждом пятне свой (стихии — чередуются два босса биома; прежние ярусы — их мировые боссы)
const BOSS_BY_KIND: Record<string, { type: string; firstAfter: number; every: number }[]> = {
  ice: [{ type: "ice_swarm_mother", firstAfter: 90, every: 600 }, { type: "ice_thorn_matron", firstAfter: 180, every: 900 }],
  fire: [{ type: "fire_warden", firstAfter: 120, every: 700 }, { type: "fire_the_silencer", firstAfter: 240, every: 1200 }],
  stone: [{ type: "stone_moon_sentinel", firstAfter: 150, every: 1000 }, { type: "stone_rust_baron", firstAfter: 300, every: 1200 }],
  air: [{ type: "air_moon_sentinel", firstAfter: 180, every: 1000 }, { type: "air_violet_queen", firstAfter: 360, every: 1800 }],
  gardens: [{ type: "swarm_mother", firstAfter: 120, every: 600 }, { type: "thorn_matron", firstAfter: 240, every: 900 }],
  ridge: [{ type: "moon_sentinel", firstAfter: 360, every: 1200 }],
  pylons: [{ type: "the_silencer", firstAfter: 480, every: 1500 }],
  crater: [{ type: "violet_queen", firstAfter: 600, every: 2400 }],
};
/** тип мирового босса → его таймеры (общий объект для всех пятен: правка в админке сразу действует на все логова) */
export const BOSS_TIMERS: Record<string, { type: string; firstAfter: number; every: number }> = {};
for (const list of Object.values(BOSS_BY_KIND)) for (const b of list) BOSS_TIMERS[b.type] ??= b;
const ARINAR_BOSSES: WorldBossDef[] = [];
{
  const seen: Record<string, number> = {};
  for (const P of ARINAR_PATCHES) {
    const list = BOSS_BY_KIND[P.kind]; if (!list) continue;
    const n = seen[P.kind] = (seen[P.kind] || 0) + 1;
    const b = list[(n - 1) % list.length];
    const seedCell = P.cells.find((c) => (c as any).seed)!;
    ARINAR_BOSSES.push({ ...b, key: `${b.type}@${P.idx}`, x: P.x, y: P.y, firstAfter: b.firstAfter + (n - 1) * 30, stagger: (n - 1) * 30, where: `в «${seedCell.name}»` });
  }
}
export function patchOf(kind: string, near = ARINAR_HUB) {
  let best: Patch | null = null;
  for (const P of ARINAR_PATCHES) if (P.kind === kind && (!best || Math.hypot(P.x - near.x, P.y - near.y) < Math.hypot(best.x - near.x, best.y - near.y))) best = P;
  return best;
}
const ARINAR_SAFE: SafeZone[] = [
  { x: ARINAR_HUB.x, y: ARINAR_HUB.y, r: ARINAR_HUB.r, name: "Гранатовый двор (хаб Аринара)" },
  ...Object.values(NPCS).filter((n) => n.world === "arinar").map((n) => ({ x: n.x, y: n.y, r: 120, name: n.name })),
];

// ---------- Поляна перевоплощения (хаб, мир hellfire), 1200×1200: внешнее кольцо ур. 1–3 ----------
const RING = (id: string, name: string, rect: [number, number, number, number], cap: number): Region =>
  reg({ id, name, band: "Поляна", tier: 1, lvl: [1, 3], biome: "meadow", rect, cap, elite: 0.02, tags: { polyana_ring: 3 }, nodes: [] });
const HUB_REGIONS: Region[] = [
  RING("ring_w", "Западная опушка", [30, 160, 190, 1170], 3),
  RING("ring_s", "Южный луг", [190, 1070, 1170, 1170], 3),
  RING("ring_e", "Восточная опушка", [1030, 400, 1170, 1070], 3),
  RING("ring_nw", "Северо-западный край", [30, 30, 420, 160], 2),
  RING("ring_ne", "Северо-восточный край", [1010, 30, 1170, 220], 2),
];
const HUB_SAFE: SafeZone[] = [
  { x: 565, y: 600, r: 300, name: "Алтарь перевоплощения" },
  { x: 660, y: 640, r: 150, name: "точка появления" },
  { x: 240, y: 600, r: 110, name: "Разлом в Аринар" },
  { x: 900, y: 300, r: 120, name: "Склеп" },
  { x: 860, y: 840, r: 110, name: "Арена Кьют" },
  { x: 300, y: 900, r: 110, name: "Испытание" },
  { x: 565, y: 1000, r: 110, name: "Разлом мини-игр" },
  ...Object.values(NPCS).filter((n) => n.world === "hellfire").map((n) => ({ x: n.x, y: n.y, r: 110, name: n.name })),
];

export const WORLD_GEN: Record<string, WorldGen> = {
  arinar: {
    id: "arinar", size: WORLD_SIZES.arinar, seed: ZONE_GEN.seed, globalCap: 4000, nearBase: 6, nearPerPlayer: 3, nearMax: 16,
    safe: ARINAR_SAFE, regions: ARINAR_REGIONS, respawn: ZONE_RESPAWN,
    // мировые боссы: длинные таймеры, объявление всем в мире
    camps: true,
    // мировые боссы: длинные таймеры, объявление всем в мире. Боссы биомов — варианты (biomes.ts).
    bosses: ARINAR_BOSSES,
    // редкие Отголоски: случайное место региона, таймер со случайным разбросом, уходят, если их не нашли
    rares: [
      { type: "dew_king", region: "meadow", every: [600, 1200], life: 480 },
      { type: "white_stag", region: "gardens", every: [900, 1500], life: 480 },
      { type: "rust_baron", region: "mines", every: [900, 1500], life: 480 },
      { type: "cooler_maw", region: "pylons", every: [1200, 1800], life: 480 },
      { type: "fallen_star", region: "crater", every: [1500, 2400], life: 480 },
    ],
  },
  hellfire: {
    id: "hellfire", size: WORLD_SIZES.hellfire, seed: 0x504f4c59, globalCap: 10, nearBase: 4, nearPerPlayer: 2, nearMax: 8,
    safe: HUB_SAFE, regions: HUB_REGIONS, respawn: { x: 600, y: 640 }, bosses: [], rares: [],
  },
};

// совместимость: Аринар по умолчанию
export const SAFE_ZONES = ARINAR_SAFE;
export const REGIONS = ARINAR_REGIONS;

export function genOf(world?: string): WorldGen { return WORLD_GEN[world || "arinar"] || WORLD_GEN.arinar; }
export function inSafe(x: number, y: number, pad = 0, world = "arinar") {
  for (const s of genOf(world).safe) if (Math.hypot(x - s.x, y - s.y) < s.r + pad) return true;
  return false;
}
export function regionAt(x: number, y: number, world = "arinar"): Region | null {
  if (world === "arinar") { // O(1): ядро (хаб + кольцо) перебором, остальное — сетка пятен
    for (const r of ARINAR_CORE) if (x >= r.rect[0] && x <= r.rect[2] && y >= r.rect[1] && y <= r.rect[3]) return r;
    const i = Math.floor(x / PATCH_CELL), j = Math.floor(y / PATCH_CELL);
    return i >= 0 && j >= 0 && i < PG && j < PG ? GEN_P.grid[j * PG + i] : null;
  }
  for (const r of genOf(world).regions) if (x >= r.rect[0] && x <= r.rect[2] && y >= r.rect[1] && y <= r.rect[3]) return r;
  return null;
}

// «Фиолетовая ночь»: каждые 20 мин реального времени 5 мин ночи (дёшево, без часов клиента)
export function isNight(now: number) { return Math.floor(now / 60000) % 20 >= 15; }

// Узлы ресурсов из сида: одинаково на сервере и клиенте (id 1000+i)
/** проверка «в жидкости рядом» (liquid.ts wetNear) — подставляет zone.ts; прямой импорт дал бы цикл zoneGen → layout → markers → zoneGen */
export const WET: { f: null | ((w: string, x: number, y: number, r: number) => boolean) } = { f: null };
export function genNodes(seed: number, world = "arinar") {
  const G = genOf(world);
  const R = rng(seed ^ 0x9e3779b9);
  const out: { id: number; type: string; res: string; x: number; y: number; respawn: number; qty: [number, number] }[] = [];
  for (const reg of G.regions) {
    for (const nd of reg.nodes) {
      for (let k = 0; k < nd.n; k++) {
        for (let t = 0; t < 30; t++) {
          const x = Math.round(reg.rect[0] + 30 + R() * (reg.rect[2] - reg.rect[0] - 60));
          const y = Math.round(reg.rect[1] + 30 + R() * (reg.rect[3] - reg.rect[1] - 60));
          if (inSafe(x, y, 20, world) || G.bosses.some((b) => Math.hypot(x - b.x, y - b.y) < 130)) continue;
          if (WET.f?.(world, x, y, 24)) continue; // не в воде/лаве (liquid.ts подключает zone.ts — без циклического импорта)
          if (out.some((o) => Math.hypot(o.x - x, o.y - y) < ZONE_GEN.nodeMinDist)) continue;
          out.push({ id: 1000 + out.length, type: nd.type, res: nd.res, x, y, respawn: nd.respawn, qty: nd.qty });
          break;
        }
      }
    }
  }
  return out;
}
