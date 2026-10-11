// Процедурное наполнение открытого мира (Аринар): регионы-биомы, таблицы мобов, режиссёр спавна, узлы ресурсов.
// Общий для сервера (Zone — авторитет) и клиента (те же узлы ресурсов из того же сида — без пересылки позиций).
// Всё детерминировано сидом экземпляра зоны (mulberry32), чтобы баги воспроизводились.
// Параметры и обоснование — docs/MORRISCURSE-BALANCE.md, раздел «Открытый мир: спавн».
import { NPCS, ZONE_RESPAWN } from "./defs";

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
  id: string; name: string; band: string;
  rect: [number, number, number, number]; // x0, y0, x1, y1 (px мира 0..1200)
  cap: number;                            // максимум живых мобов региона
  table: MobRow[];
  night?: Record<string, number>;         // множители весов в «Фиолетовую ночь»
  elite: number;                          // шанс элиты на пачку
  nodes: { type: string; res: string; n: number; respawn: number; qty: [number, number] }[];
}

export const ZONE_GEN = {
  seed: 0x4d454c56,          // «MELV»: сид экземпляра Аринара по умолчанию
  globalCap: 34,             // все мобы зоны (без мирового босса)
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
  eliteHp: 2.2, eliteDmg: 1.35, eliteXp: 2.5,
  boss: { type: "moon_sentinel", x: 720, y: 1040, firstAfter: 180, every: 480 },
  nodeMinDist: 95,
};

export const SAFE_ZONES: { x: number; y: number; r: number; name: string }[] = [
  { x: ZONE_RESPAWN.x, y: ZONE_RESPAWN.y, r: 170, name: "точка возрождения / портал" },
  { x: 240, y: 600, r: 120, name: "Разлом в Мир Адского Пламени" },
  { x: 900, y: 600, r: 120, name: "портал Бездны" },
  ...Object.values(NPCS).filter((n) => n.world === "arinar").map((n) => ({ x: n.x, y: n.y, r: 120, name: n.name })),
];

export const REGIONS: Region[] = [
  {
    id: "wastes", name: "Звёздные пустоши", band: "Мэлвелдил I", rect: [340, 140, 900, 430], cap: 10, elite: 0.05,
    table: [{ type: "blade_fly", w: 6, pack: [1, 3] }, { type: "rot_glitch", w: 1, pack: [1, 2] }],
    nodes: [{ type: "crystal", res: "starsilver", n: 2, respawn: 60, qty: [1, 2] }],
  },
  {
    id: "ridge", name: "Восточный кряж", band: "Мэлвелдил I–II", rect: [920, 160, 1170, 560], cap: 7, elite: 0.07,
    table: [{ type: "blade_fly", w: 3, pack: [2, 3] }, { type: "dream_moth", w: 2, pack: [1, 2] }],
    night: { dream_moth: 2 },
    nodes: [{ type: "tree", res: "dreamwood", n: 2, respawn: 35, qty: [1, 3] }, { type: "crystal", res: "starsilver", n: 1, respawn: 60, qty: [1, 2] }],
  },
  {
    id: "meadow", name: "Луга мотыльков", band: "Мэлвелдил II", rect: [110, 760, 560, 1150], cap: 8, elite: 0.06,
    table: [{ type: "dream_moth", w: 5, pack: [1, 2] }, { type: "blade_fly", w: 1, pack: [1, 2] }],
    night: { dream_moth: 1.6 },
    nodes: [{ type: "flower", res: "moonpetal", n: 3, respawn: 40, qty: [1, 2] }],
  },
  {
    id: "mines", name: "Гнилые копи", band: "Мэлвелдил II", rect: [880, 700, 1170, 1150], cap: 9, elite: 0.08,
    table: [{ type: "rot_glitch", w: 5, pack: [2, 3] }, { type: "dream_moth", w: 1, pack: [1, 1] }],
    nodes: [{ type: "ore", res: "rot_ore", n: 2, respawn: 45, qty: [1, 2] }],
  },
  {
    id: "groves", name: "Западные рощи", band: "Мэлвелдил I", rect: [100, 150, 330, 480], cap: 5, elite: 0.04,
    table: [{ type: "rot_glitch", w: 2, pack: [1, 2] }, { type: "blade_fly", w: 2, pack: [1, 2] }],
    nodes: [{ type: "tree", res: "dreamwood", n: 3, respawn: 35, qty: [1, 3] }, { type: "flower", res: "moonpetal", n: 1, respawn: 40, qty: [1, 2] }],
  },
];

export function inSafe(x: number, y: number, pad = 0) {
  for (const s of SAFE_ZONES) if (Math.hypot(x - s.x, y - s.y) < s.r + pad) return true;
  return false;
}
export function regionAt(x: number, y: number): Region | null {
  for (const r of REGIONS) if (x >= r.rect[0] && x <= r.rect[2] && y >= r.rect[1] && y <= r.rect[3]) return r;
  return null;
}

// «Фиолетовая ночь»: каждые 20 мин реального времени 5 мин ночи (дёшево, без часов клиента)
export function isNight(now: number) { return Math.floor(now / 60000) % 20 >= 15; }

// Узлы ресурсов из сида: одинаково на сервере и клиенте (id 1000+i)
export function genNodes(seed: number) {
  const R = rng(seed ^ 0x9e3779b9);
  const out: { id: number; type: string; res: string; x: number; y: number; respawn: number; qty: [number, number] }[] = [];
  for (const reg of REGIONS) {
    for (const nd of reg.nodes) {
      for (let k = 0; k < nd.n; k++) {
        for (let t = 0; t < 30; t++) {
          const x = Math.round(reg.rect[0] + 30 + R() * (reg.rect[2] - reg.rect[0] - 60));
          const y = Math.round(reg.rect[1] + 30 + R() * (reg.rect[3] - reg.rect[1] - 60));
          if (inSafe(x, y, 20) || Math.hypot(x - ZONE_GEN.boss.x, y - ZONE_GEN.boss.y) < 110) continue;
          if (out.some((o) => Math.hypot(o.x - x, o.y - y) < ZONE_GEN.nodeMinDist)) continue;
          out.push({ id: 1000 + out.length, type: nd.type, res: nd.res, x, y, respawn: nd.respawn, qty: nd.qty });
          break;
        }
      }
    }
  }
  return out;
}
