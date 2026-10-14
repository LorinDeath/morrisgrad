// Процедурное наполнение открытых миров: регионы-биомы по ярусам сложности, таблицы мобов (из бестиария),
// режиссёр спавна, мировые боссы и редкие Отголоски на длинных таймерах, узлы ресурсов.
// Общий для сервера (Zone — авторитет) и клиента (те же узлы ресурсов и регионы из того же сида — без пересылки).
// Всё детерминировано сидом экземпляра зоны (mulberry32), чтобы баги воспроизводились.
// Параметры и обоснование — docs/MORRISCURSE-BALANCE.md, раздел «Открытый мир: спавн».
import { NPCS, ZONE_RESPAWN } from "./shared";
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
  nodes: { type: string; res: string; n: number; respawn: number; qty: [number, number] }[];
}
export interface WorldBossDef { type: string; x: number; y: number; firstAfter: number; every: number; where: string }
export interface RareDef { type: string; region: string; every: [number, number]; life: number }
export interface SafeZone { x: number; y: number; r: number; name: string }
export interface WorldGen {
  id: string; size: number; seed: number; globalCap: number; nearBase: number; nearPerPlayer: number; nearMax: number;
  safe: SafeZone[]; regions: Region[]; bosses: WorldBossDef[]; rares: RareDef[]; respawn: { x: number; y: number };
  camps?: boolean; // фиксированные лагеря-пачки (крупные миры) вместо режиссёра у игроков
}

// Общие параметры режиссёра (миры переопределяют капы)
export const ZONE_GEN = {
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
  campStep: 1000, campJitter: 220, campMinDist: 760, campRespawn: 45,
  // поводок MMO: моб дальше leash от дома → «сброс» (уходит домой, быстро лечится, игнорирует игроков)
  leash: 900, leashBoss: 1300, resetSpeed: 2.2, resetRegen: 0.6, // доля maxHp в секунду
  sleepR: 1, // спят чанки дальше этого числа соседних чанков (WORLD_CHUNK) от любого игрока
  cursedPct: 10, cursedHp: 2.5, cursedDmg: 1.4, cursedLoot: 10,
  eliteHp: 2.2, eliteDmg: 1.5, eliteArmor: 1.4, eliteXp: 2.5,
  nodeMinDist: 95,
  bossScalePerPlayer: 0.5,   // ХП босса ×(1 + 0.5·(игроков−1)), максимум ×2.5
};

// ---------- таблицы регионов: тег where бестиария → вес ----------
// Таблицы мобов заполняет ТОЛЬКО сервер (zoneTables.ts импортирует бестиарий со снаряжением) —
// клиентский бандл получает лишь регионы, теги и узлы ресурсов.
const reg = (o: Omit<Region, "table" | "night">): Region => ({ ...o, table: [], night: {} });
const N = (type: string, res: string, n: number, respawn: number, qty: [number, number] = [1, 2]) => ({ type, res, n, respawn, qty });

// ---------- Аринар (государство Мэлвелдил), 24000×24000 ----------
// Центр — хаб «Гранатовый двор» (порталы, Алзи, Лэйр, гранатовые деревья и фиалки). Вокруг хаба — кольцо ур. 1–5
// (рощи/луга фиалок/гранатовые сады). Дальше «вертушкой» — 4 стихийных биома (biomes.ts), у каждого
// внутренняя (ближе к хабу) и внешняя половины. В углах — окраины прежних ярусов 6–25 (их мобы и мировые боссы).
const H0 = 9600, H1 = 14400, HC0 = 11100, HC1 = 12900;
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
const ARINAR_REGIONS: Region[] = [
  reg({ id: "hub", name: "Гранатовый двор", band: "Сердце Аринара", tier: 1, lvl: [1, 1], biome: "garden", rect: [HC0, HC0, HC1, HC1], cap: 0, elite: 0, tags: {},
    nodes: [N("tree", "dreamwood", 3, 35, [1, 2]), N("flower", "moonpetal", 4, 40)] }),
  reg({ id: "groves", name: "Северные гранатовые рощи", band: "Мэлвелдил I", tier: 1, lvl: [1, 5], biome: "grove", rect: [H0, H0, H1, HC0], cap: 0, elite: 0.04,
    tags: { groves: 3, polyana_ring: 1 }, nodes: [N("tree", "dreamwood", 10, 35, [1, 3]), N("flower", "moonpetal", 4, 40)] }),
  reg({ id: "meadow", name: "Луга фиалок", band: "Мэлвелдил I", tier: 1, lvl: [1, 5], biome: "meadow", rect: [H0, HC1, H1, H1], cap: 0, elite: 0.05,
    tags: { meadow: 3, polyana_ring: 1 }, nodes: [N("flower", "moonpetal", 12, 40), N("tree", "dreamwood", 3, 35, [1, 3])] }),
  reg({ id: "violets_w", name: "Фиалковая лощина", band: "Мэлвелдил I", tier: 1, lvl: [1, 5], biome: "meadow", rect: [H0, HC0, HC0, HC1], cap: 0, elite: 0.04,
    tags: { meadow: 2, polyana_ring: 2 }, nodes: [N("flower", "moonpetal", 5, 40)] }),
  reg({ id: "pome_e", name: "Гранатовый сад Мэлвелдила", band: "Мэлвелдил I", tier: 1, lvl: [1, 5], biome: "garden", rect: [HC1, HC0, H1, HC1], cap: 0, elite: 0.04,
    tags: { groves: 2, gardens_edge: 2 }, nodes: [N("tree", "dreamwood", 6, 35, [1, 3])] }),
  // стихийные биомы («вертушка» вокруг хаба)
  BR("ice", 0, "Кровавые льды: Алый наст", [4800, 6000, H1, H0], [N("crystal", "starsilver", 14, 60)]),
  BR("ice", 1, "Кровавые льды: Ледник Жертв", [4800, 1200, H1, 6000], [N("crystal", "starsilver", 16, 60, [1, 3])]),
  BR("fire", 0, "Синее пламя: Тлеющие поля", [H1, 4800, 18600, H1], [N("ore", "rot_ore", 14, 45)]),
  BR("fire", 1, "Синее пламя: Горн Лазури", [18600, 4800, 22800, H1], [N("ore", "rot_ore", 14, 45, [1, 3]), N("crystal", "starsilver", 4, 60)]),
  BR("stone", 0, "Железные каменоломни: Рудные ступени", [H0, H1, 19200, 18600], [N("ore", "rot_ore", 16, 45)]),
  BR("stone", 1, "Железные каменоломни: Литейная бездна", [H0, 18600, 19200, 22800], [N("ore", "rot_ore", 16, 45, [2, 3])]),
  BR("air", 0, "Звёздная высь: Парящие острова", [5400, H0, H0, 19200], [N("crystal", "starsilver", 14, 60)]),
  BR("air", 1, "Звёздная высь: Край пустоты", [1200, H0, 5400, 19200], [N("crystal", "starsilver", 14, 60, [2, 3]), N("flower", "moonpetal", 4, 40)]),
  // окраины прежних ярусов (углы карты)
  reg({ id: "gardens", name: "Дикие гранатовые сады", band: "Мэлвелдил II", tier: 2, lvl: [6, 10], biome: "garden", rect: [1200, 1200, 4800, 5400], cap: 0, elite: 0.06,
    tags: { gardens: 3, gardens_edge: 1, meadow_far: 1, village_night: 0.4 }, nodes: [N("tree", "dreamwood", 8, 35, [1, 3]), N("flower", "moonpetal", 6, 40)] }),
  reg({ id: "thin", name: "Тонкие земли", band: "Мэлвелдил V", tier: 5, lvl: [21, 25], biome: "thin", rect: [1200, 5400, 4800, H0], cap: 0, elite: 0.1,
    tags: { thin: 3 }, nodes: [N("flower", "moonpetal", 4, 40, [2, 3]), N("ore", "rot_ore", 4, 45, [1, 3])] }),
  reg({ id: "wastes", name: "Звёздные пустоши", band: "Мэлвелдил II", tier: 2, lvl: [6, 10], biome: "waste", rect: [H1, 1200, 18600, 4800], cap: 0, elite: 0.06,
    tags: { wastes: 3, wastes_low: 0.8, ridge_low: 1.5 }, nodes: [N("crystal", "starsilver", 8, 60)] }),
  reg({ id: "ridge", name: "Восточный кряж", band: "Мэлвелдил III", tier: 3, lvl: [11, 15], biome: "ridge", rect: [18600, 1200, 22800, 4800], cap: 0, elite: 0.07,
    tags: { ridge: 3 }, nodes: [N("crystal", "starsilver", 8, 60)] }),
  reg({ id: "mines", name: "Гнилые копи", band: "Мэлвелдил III", tier: 3, lvl: [11, 15], biome: "rot", rect: [19200, H1, 22800, 18600], cap: 0, elite: 0.07,
    tags: { mines: 3 }, nodes: [N("ore", "rot_ore", 10, 45)] }),
  reg({ id: "pylons", name: "Гудящие пилоны", band: "Мэлвелдил IV", tier: 4, lvl: [16, 20], biome: "pylon", rect: [19200, 18600, 22800, 22800], cap: 0, elite: 0.08,
    tags: { pylons: 3 }, nodes: [N("crystal", "starsilver", 6, 60), N("ore", "rot_ore", 4, 45)] }),
  reg({ id: "crater", name: "Лунный кратер", band: "Мэлвелдил V", tier: 5, lvl: [21, 25], biome: "crater", rect: [5400, 19200, H0, 22800], cap: 0, elite: 0.1,
    tags: { crater: 3, crater_edge: 1 }, nodes: [N("crystal", "starsilver", 8, 60, [2, 3])] }),
  reg({ id: "glitch", name: "Глитч-разлом", band: "Мэлвелдил IV", tier: 4, lvl: [16, 20], biome: "glitch", rect: [1200, 19200, 5400, 22800], cap: 0, elite: 0.08,
    tags: { glitch: 3 }, nodes: [N("ore", "rot_ore", 6, 45)] }),
];
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
    bosses: [
      { type: "swarm_mother", x: 3000, y: 3300, firstAfter: 120, every: 600, where: "в Диких гранатовых садах" },
      { type: "thorn_matron", x: 3000, y: 2200, firstAfter: 240, every: 900, where: "в Диких гранатовых садах" },
      { type: "moon_sentinel", x: 20700, y: 3000, firstAfter: 360, every: 1200, where: "на Восточном кряже" },
      { type: "the_silencer", x: 21000, y: 20700, firstAfter: 480, every: 1500, where: "у Гудящих пилонов" },
      { type: "violet_queen", x: 7500, y: 21000, firstAfter: 600, every: 2400, where: "в Лунном кратере" },
      { type: "ice_swarm_mother", x: 9600, y: 7400, firstAfter: 90, every: 600, where: "на Алом насте" },
      { type: "ice_thorn_matron", x: 9600, y: 2600, firstAfter: 180, every: 900, where: "на Леднике Жертв" },
      { type: "fire_warden", x: 16600, y: 9600, firstAfter: 120, every: 700, where: "на Тлеющих полях" },
      { type: "fire_the_silencer", x: 21000, y: 9600, firstAfter: 240, every: 1200, where: "в Горне Лазури" },
      { type: "stone_moon_sentinel", x: 14400, y: 16600, firstAfter: 150, every: 1000, where: "на Рудных ступенях" },
      { type: "stone_rust_baron", x: 14400, y: 21000, firstAfter: 300, every: 1200, where: "в Литейной бездне" },
      { type: "air_moon_sentinel", x: 7400, y: 14400, firstAfter: 180, every: 1000, where: "на Парящих островах" },
      { type: "air_violet_queen", x: 3200, y: 14400, firstAfter: 360, every: 1800, where: "на Краю пустоты" },
    ],
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
  for (const r of genOf(world).regions) if (x >= r.rect[0] && x <= r.rect[2] && y >= r.rect[1] && y <= r.rect[3]) return r;
  return null;
}

// «Фиолетовая ночь»: каждые 20 мин реального времени 5 мин ночи (дёшево, без часов клиента)
export function isNight(now: number) { return Math.floor(now / 60000) % 20 >= 15; }

// Узлы ресурсов из сида: одинаково на сервере и клиенте (id 1000+i)
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
          if (out.some((o) => Math.hypot(o.x - x, o.y - y) < ZONE_GEN.nodeMinDist)) continue;
          out.push({ id: 1000 + out.length, type: nd.type, res: nd.res, x, y, respawn: nd.respawn, qty: nd.qty });
          break;
        }
      }
    }
  }
  return out;
}
