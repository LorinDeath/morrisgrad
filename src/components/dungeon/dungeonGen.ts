// dungeonGen.ts - Procedural Dungeon Generator for Dungeon Gathering with Biomes, Boss Rush, and Tutorial

import { generateRandomWeapon, generateRandomScroll, type GroundWeapon, type GroundScroll } from './weapons';
import { getRandomRelic } from './relics';
import type { GroundRelic } from './types';
import {
  Tile,
  type DungeonMap,
  type Room,
  type BiomeType,
  type Torch,
  type Vase,
  type DestructibleCrate,
  type Chest,
  type Shrine,
  type Fountain,
  type SpikeTrap,
  type ShopKeeper,
  type ChallengeEvent,
  type GameMode,
} from './types';

export function generateDungeon(floorNumber: number, mode: GameMode = 'campaign'): DungeonMap {
  if (mode === 'tutorial') {
    return generateTutorialDungeon();
  }
  if (mode === 'boss_rush') {
    return generateBossRushDungeon(floorNumber);
  }

  // 6 Биомов для 12+ этажей:
  // 1-2: crypt (Древний Склеп)
  // 3-4: sunken (Затопленные Катакомбы)
  // 5-6: toxic (Чумные Топи)
  // 7-8: magma (Инферно-Печи)
  // 9-10: void (Залы Бездны)
  // 11-12+: sanctum (Святилище Архилича)
  const baseBiome: BiomeType =
    floorNumber <= 2
      ? 'crypt'
      : floorNumber <= 4
      ? 'sunken'
      : floorNumber <= 6
      ? 'toxic'
      : floorNumber <= 8
      ? 'magma'
      : floorNumber <= 10
      ? 'void'
      : 'sanctum';

  // Увеличенные просторные габариты подземелья для глубокого исследования
  const mapWidth = 84 + Math.min(floorNumber * 4, 32);
  const mapHeight = 84 + Math.min(floorNumber * 4, 32);

  const tiles: number[][] = Array.from({ length: mapHeight }, () =>
    Array(mapWidth).fill(Tile.VOID)
  );

  const discovered: boolean[][] = Array.from({ length: mapHeight }, () =>
    Array(mapWidth).fill(false)
  );

  const rooms: Room[] = [];
  const targetRoomCount = 16 + Math.min(floorNumber * 2, 8);

  const biomePool: BiomeType[] = ['crypt', 'sunken', 'toxic', 'magma', 'void', 'sanctum'];
  const baseIdx = biomePool.indexOf(baseBiome);
  const adjacentBiomes: BiomeType[] = [
    biomePool[(baseIdx + biomePool.length - 1) % biomePool.length],
    biomePool[(baseIdx + 1) % biomePool.length],
    biomePool[(baseIdx + 2) % biomePool.length],
  ];

  let attempts = 0;
  while (rooms.length < targetRoomCount && attempts < 1200) {
    attempts++;

    // Просторные залы и комнаты
    let rw = 11 + Math.floor(Math.random() * 8);
    let rh = 11 + Math.floor(Math.random() * 8);

    // Большие арены и залы орды
    if (rooms.length === 2 || rooms.length === 6 || rooms.length === 11) {
      rw = 22 + Math.floor(Math.random() * 7);
      rh = 22 + Math.floor(Math.random() * 7);
    } else if (rooms.length === 4 || rooms.length === 8 || rooms.length === 14) {
      rw = 16 + Math.floor(Math.random() * 6);
      rh = 16 + Math.floor(Math.random() * 6);
    }

    const rx = 3 + Math.floor(Math.random() * (mapWidth - rw - 6));
    const ry = 3 + Math.floor(Math.random() * (mapHeight - rh - 6));

    let overlaps = false;
    for (const r of rooms) {
      if (
        rx < r.x + r.w + 3 &&
        rx + rw + 3 > r.x &&
        ry < r.y + r.h + 3 &&
        ry + rh + 3 > r.y
      ) {
        overlaps = true;
        break;
      }
    }

    if (!overlaps) {
      // 60% шанс основного биома данжа, 40% шанс соседнего биома
      const rBiome =
        rooms.length === 0
          ? baseBiome
          : Math.random() < 0.60
          ? baseBiome
          : adjacentBiomes[Math.floor(Math.random() * adjacentBiomes.length)];

      const room: Room = {
        id: rooms.length,
        x: rx,
        y: ry,
        w: rw,
        h: rh,
        type: 'normal',
        biome: rBiome,
        cx: Math.floor(rx + rw / 2),
        cy: Math.floor(ry + rh / 2),
        connected: [],
        visited: false,
        cleared: false,
      };
      rooms.push(room);

      for (let y = ry; y < ry + rh; y++) {
        for (let x = rx; x < rx + rw; x++) {
          const rand = Math.random();
          if (rBiome === 'sunken' && rand < 0.16 && x > rx + 1 && x < rx + rw - 2) {
            tiles[y][x] = Tile.WATER;
          } else if (rBiome === 'toxic' && rand < 0.12 && x > rx + 1 && x < rx + rw - 2) {
            tiles[y][x] = Tile.WATER;
          } else if (rBiome === 'sanctum' && rand < 0.25) {
            tiles[y][x] = Tile.FLOOR_ALT;
          } else if (rBiome === 'magma' && rand < 0.28) {
            tiles[y][x] = Tile.FLOOR_CRACK;
          } else if (rand < 0.18) {
            tiles[y][x] = Tile.FLOOR_ALT;
          } else if (rand < 0.28) {
            tiles[y][x] = Tile.FLOOR_CRACK;
          } else {
            tiles[y][x] = Tile.FLOOR;
          }
        }
      }
    }
  }

  // Minimum Spanning Tree
  const connectedRooms = new Set<number>([0]);
  const edges: Array<[number, number]> = [];

  while (connectedRooms.size < rooms.length) {
    let bestDist = Infinity;
    let bestPair: [number, number] = [0, 1];

    for (const u of connectedRooms) {
      for (let v = 0; v < rooms.length; v++) {
        if (!connectedRooms.has(v)) {
          const dx = rooms[u].cx - rooms[v].cx;
          const dy = rooms[u].cy - rooms[v].cy;
          const dist = dx * dx + dy * dy;
          if (dist < bestDist) {
            bestDist = dist;
            bestPair = [u, v];
          }
        }
      }
    }

    connectedRooms.add(bestPair[1]);
    edges.push(bestPair);
    rooms[bestPair[0]].connected.push(bestPair[1]);
    rooms[bestPair[1]].connected.push(bestPair[0]);
  }

  const extraLoops = Math.min(6, Math.floor(rooms.length / 2));
  for (let i = 0; i < extraLoops; i++) {
    const r1 = Math.floor(Math.random() * rooms.length);
    const r2 = Math.floor(Math.random() * rooms.length);
    if (r1 !== r2 && !rooms[r1].connected.includes(r2)) {
      edges.push([r1, r2]);
      rooms[r1].connected.push(r2);
      rooms[r2].connected.push(r1);
    }
  }

  for (const [u, v] of edges) {
    const x1 = rooms[u].cx;
    const y1 = rooms[u].cy;
    const x2 = rooms[v].cx;
    const y2 = rooms[v].cy;

    let curX = x1;
    let curY = y1;
    const stepX = x2 >= x1 ? 1 : -1;
    const stepY = y2 >= y1 ? 1 : -1;

    while (curX !== x2) {
      carveCorridorPoint(tiles, curX, curY, mapWidth, mapHeight);
      curX += stepX;
    }
    while (curY !== y2) {
      carveCorridorPoint(tiles, curX, curY, mapWidth, mapHeight);
      curY += stepY;
    }
    carveCorridorPoint(tiles, curX, curY, mapWidth, mapHeight);
  }

  rooms[0].type = 'spawn';
  rooms[0].visited = true;

  const distances: number[] = Array(rooms.length).fill(-1);
  distances[0] = 0;
  const queue = [0];
  while (queue.length > 0) {
    const curr = queue.shift()!;
    for (const neighbor of rooms[curr].connected) {
      if (distances[neighbor] === -1) {
        distances[neighbor] = distances[curr] + 1;
        queue.push(neighbor);
      }
    }
  }

  let exitRoomIndex = 1;
  let maxDist = -1;
  for (let i = 1; i < rooms.length; i++) {
    if (distances[i] > maxDist) {
      maxDist = distances[i];
      exitRoomIndex = i;
    }
  }

  // Боссы на этажах 3, 6, 9 и финальный на 12
  const isBossFloor = floorNumber % 3 === 0 || floorNumber >= 12;
  rooms[exitRoomIndex].type = isBossFloor ? 'boss' : 'exit';

  const candidateIndices = rooms
    .map((_, idx) => idx)
    .filter((idx) => idx !== 0 && idx !== exitRoomIndex);

  candidateIndices.sort((a, b) => rooms[b].w * rooms[b].h - rooms[a].w * rooms[a].h);

  // 1. Залы Орды (20-30 врагов)
  const hordeCount = floorNumber >= 2 ? (rooms.length > 14 ? 2 : 1) : 1;
  for (let h = 0; h < hordeCount && candidateIndices.length > 0; h++) {
    const hordeIdx = candidateIndices.shift()!;
    rooms[hordeIdx].type = 'horde';
    rooms[hordeIdx].titleBanner = '⚔️ ВНИМАНИЕ: ЗАЛ ВЕЛИКОЙ ОРДЫ!';
  }

  // 2. Обитель Стража (Мини-Босс)
  if (candidateIndices.length > 0) {
    const eliteIdx = candidateIndices.shift()!;
    rooms[eliteIdx].type = 'elite';
    rooms[eliteIdx].titleBanner = '☠️ ОБИТЕЛЬ СТРАЖА КАТАКОМБ!';
  }

  // 3. Лавка
  let shopRoomIndex = -1;
  if (candidateIndices.length > 0) {
    shopRoomIndex = candidateIndices.splice(
      Math.floor(Math.random() * candidateIndices.length),
      1
    )[0];
    rooms[shopRoomIndex].type = 'shop';
  }

  // 4. Святилище
  let shrineRoomIndex = -1;
  if (candidateIndices.length > 0) {
    shrineRoomIndex = candidateIndices.splice(
      Math.floor(Math.random() * candidateIndices.length),
      1
    )[0];
    rooms[shrineRoomIndex].type = 'shrine';
  }

  // 5. Испытание
  let challengeRoomIndex = -1;
  if (candidateIndices.length > 0 && floorNumber >= 2) {
    challengeRoomIndex = candidateIndices.splice(
      Math.floor(Math.random() * candidateIndices.length),
      1
    )[0];
    rooms[challengeRoomIndex].type = 'challenge';
  }

  // 6. Сокровищница
  let treasureRoomIndex = -1;
  if (candidateIndices.length > 0) {
    treasureRoomIndex = candidateIndices.splice(
      Math.floor(Math.random() * candidateIndices.length),
      1
    )[0];
    rooms[treasureRoomIndex].type = 'treasure';
  }

  autoTileWalls(tiles, mapWidth, mapHeight);

  const torches: Torch[] = [];

  const vases: Vase[] = [];
  const chests: Chest[] = [];
  const shrines: Shrine[] = [];

  const fountains: Fountain[] = [];
  const traps: SpikeTrap[] = []; // Без ловушек!

  let vaseIdCounter = 1;
  let chestIdCounter = 1;

  const exitRoom = rooms[exitRoomIndex];
  const stairsPoint = { x: exitRoom.cx, y: exitRoom.cy };
  tiles[stairsPoint.y][stairsPoint.x] = Tile.STAIRS_DOWN;

  if (treasureRoomIndex !== -1) {
    const tRoom = rooms[treasureRoomIndex];
    chests.push({
      id: chestIdCounter++,
      x: tRoom.cx * 16 + 8,
      y: tRoom.cy * 16 + 8,
      opened: false,
      type: 'gold',
    });
    tiles[tRoom.cy][tRoom.cx] = Tile.CHEST;
  }

  if (shrineRoomIndex !== -1) {
    const sRoom = rooms[shrineRoomIndex];
    tiles[sRoom.cy][sRoom.cx] = Tile.SHRINE;
    const blessings: Array<'might' | 'vitality' | 'haste' | 'greed'> = [
      'might',
      'vitality',
      'haste',
      'greed',
    ];
    shrines.push({
      id: 1,
      x: sRoom.cx * 16 + 8,
      y: sRoom.cy * 16 + 8,
      used: false,
      blessingType: blessings[Math.floor(Math.random() * blessings.length)],
    });

    const fx = sRoom.cx - 2;
    const fy = sRoom.cy;
    if (isFloor(tiles[fy][fx])) {
      tiles[fy][fx] = Tile.FOUNTAIN;
      fountains.push({
        id: 1,
        x: fx * 16 + 8,
        y: fy * 16 + 8,
        used: false,
      });
    }
  }

  let shop: ShopKeeper | undefined = undefined;
  if (shopRoomIndex !== -1) {
    const shpRoom = rooms[shopRoomIndex];
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const tx = shpRoom.cx + dx;
        const ty = shpRoom.cy + dy;
        if (isFloor(tiles[ty][tx])) tiles[ty][tx] = Tile.SHOP_CARPET;
      }
    }

    shop = {
      x: shpRoom.cx * 16 + 8,
      y: shpRoom.cy * 16 + 8,
      roomIndex: shopRoomIndex,
      items: [
        {
          id: 'pot_hp',
          name: 'Зелье Исцеления',
          desc: 'Восстанавливает +2 сердца здоровья.',
          cost: 20,
          currency: 'gold',
          icon: '🧪',
          category: 'potion',
        },
        {
          id: 'pot_speed',
          name: 'Зелье Скорости',
          desc: '+40% к скорости бега на 10 сек.',
          cost: 15,
          currency: 'gold',
          icon: '⚡',
          category: 'potion',
        },
        {
          id: 'pot_power',
          name: 'Зелье Мощи',
          desc: '+50% к наносимому урону на 10 сек.',
          cost: 20,
          currency: 'gold',
          icon: '🔥',
          category: 'potion',
        },
        {
          id: 'stat_heart',
          name: 'Осколок Жизни',
          desc: 'Навсегда добавляет +1 сердце (2 HP).',
          cost: 50,
          currency: 'gold',
          icon: '❤️',
          category: 'stat',
        },
        {
          id: 'stat_blade',
          name: 'Точильный Камень',
          desc: 'Навсегда увеличивает базовый урон на +6.',
          cost: 45,
          currency: 'gold',
          icon: '🗡️',
          category: 'stat',
        },
        {
          id: 'stat_boots',
          name: 'Сапоги Ветра',
          desc: 'Навсегда увеличивает скорость бега на +25.',
          cost: 35,
          currency: 'gold',
          icon: '🥾',
          category: 'stat',
        },
        {
          id: 'soul_pack',
          name: 'Обмен Душ',
          desc: 'Конвертирует 60 золотых монет в 2 синие души.',
          cost: 60,
          currency: 'gold',
          icon: '💎',
          category: 'perk',
        },
      ],
    };
  }

  let challenge: ChallengeEvent | undefined = undefined;
  if (challengeRoomIndex !== -1) {
    const chRoom = rooms[challengeRoomIndex];
    challenge = {
      roomIndex: challengeRoomIndex,
      active: false,
      cleared: false,
      wave: 0,
      maxWaves: 2,
      enemiesRemaining: 0,
      totemX: chRoom.cx * 16 + 8,
      totemY: chRoom.cy * 16 + 8,
    };
  }

  // Torches & Vases
  for (const r of rooms) {
    const torchY = r.y - 1;
    if (torchY >= 0) {
      torches.push({
        x: r.x + 2,
        y: torchY,
        type: 'wall',
        frame: Math.floor(Math.random() * 8),
        animTimer: Math.random(),
        lightIntensity: 1.0,
      });
      if (r.w >= 8) {
        torches.push({
          x: r.x + r.w - 3,
          y: torchY,
          type: 'wall',
          frame: Math.floor(Math.random() * 8),
          animTimer: Math.random(),
          lightIntensity: 1.0,
        });
      }
    }

    const vaseCount = r.type === 'treasure' ? 8 : r.type === 'normal' ? 5 : 3;
    const cornerOffsets = [
      [1, 1],
      [r.w - 2, 1],
      [1, r.h - 2],
      [r.w - 2, r.h - 2],
      [2, 1],
      [r.w - 3, 1],
      [1, 2],
      [r.w - 2, 2],
    ];

    for (let v = 0; v < Math.min(vaseCount, cornerOffsets.length); v++) {
      const [ox, oy] = cornerOffsets[v];
      const vx = r.x + ox;
      const vy = r.y + oy;
      if (isFloor(tiles[vy][vx])) {
        const randContent = Math.random();
        let contents: 'coins' | 'potion' | 'blue_coin' | 'empty' = 'coins';
        if (randContent < 0.25) contents = 'potion';
        else if (randContent < 0.48) contents = 'blue_coin';
        else if (randContent < 0.92) contents = 'coins';
        else contents = 'empty';

        vases.push({
          id: vaseIdCounter++,
          x: vx * 16 + 8,
          y: vy * 16 + 8,
          frame: Math.floor(Math.random() * 16),
          animTimer: Math.random(),
          broken: false,
          contents,
        });
      }
    }
  }

  const crates: DestructibleCrate[] = [];
  let crateIdCounter = 1;

  for (const r of rooms) {
    if (r.type === 'spawn' || r.type === 'boss') continue;
    const crateCount = r.type === 'treasure' ? 4 : r.type === 'normal' ? 3 : 1;
    for (let c = 0; c < crateCount; c++) {
      const cx = r.x + 2 + Math.floor(Math.random() * (r.w - 4));
      const cy = r.y + 2 + Math.floor(Math.random() * (r.h - 4));
      if (
        isFloor(tiles[cy][cx]) &&
        tiles[cy][cx] !== Tile.STAIRS_DOWN &&
        tiles[cy][cx] !== Tile.SHRINE &&
        tiles[cy][cx] !== Tile.CHEST &&
        tiles[cy][cx] !== Tile.FOUNTAIN
      ) {
        crates.push({
          id: crateIdCounter++,
          x: cx * 16 + 8,
          y: cy * 16 + 8,
          hp: 20,
          maxHp: 20,
          broken: false,
        });
      }
    }
  }

  const spawnPoint = {
    x: rooms[0].cx * 16 + 8,
    y: rooms[0].cy * 16 + 8,
  };

  const groundWeapons: GroundWeapon[] = [];
  const groundScrolls: GroundScroll[] = [];
  const groundRelics: GroundRelic[] = [];
  let groundIdCounter = 1;

  for (const r of rooms) {
    if (r.type === 'spawn') {
      groundWeapons.push({
        id: groundIdCounter++,
        weapon: generateRandomWeapon(floorNumber, 'wand', 'uncommon'),
        x: (r.cx + 2) * 16 + 8,
        y: (r.cy + 1) * 16 + 8,
        bobTimer: Math.random() * Math.PI * 2,
      });
      continue;
    }

    if (r.type === 'treasure') {
      groundRelics.push({
        id: groundIdCounter++,
        relic: getRandomRelic(),
        x: r.cx * 16 + 8,
        y: (r.cy - 1) * 16 + 8,
        bobTimer: Math.random() * Math.PI * 2,
      });
      groundWeapons.push({
        id: groundIdCounter++,
        weapon: generateRandomWeapon(floorNumber, undefined, Math.random() < 0.5 ? 'legendary' : 'epic', true, 'normal', 0, r.biome),
        x: (r.cx - 2) * 16 + 8,
        y: r.cy * 16 + 8,
        bobTimer: Math.random() * Math.PI * 2,
      });
      groundScrolls.push({
        id: groundIdCounter++,
        scroll: generateRandomScroll(),
        x: (r.cx + 2) * 16 + 8,
        y: r.cy * 16 + 8,
        bobTimer: Math.random() * Math.PI * 2,
      });
    } else if (r.type === 'horde') {
      groundWeapons.push({
        id: groundIdCounter++,
        weapon: generateRandomWeapon(floorNumber, undefined, 'rare', true, 'normal', 0, r.biome),
        x: r.cx * 16 + 8,
        y: (r.cy - 2) * 16 + 8,
        bobTimer: Math.random() * Math.PI * 2,
      });
      groundScrolls.push({
        id: groundIdCounter++,
        scroll: generateRandomScroll(),
        x: r.cx * 16 + 8,
        y: (r.cy + 2) * 16 + 8,
        bobTimer: Math.random() * Math.PI * 2,
      });
    } else if (r.type === 'elite') {
      if (Math.random() < 0.75) {
        groundRelics.push({
          id: groundIdCounter++,
          relic: getRandomRelic(),
          x: (r.cx + 2) * 16 + 8,
          y: r.cy * 16 + 8,
          bobTimer: Math.random() * Math.PI * 2,
        });
      }
      groundWeapons.push({
        id: groundIdCounter++,
        weapon: generateRandomWeapon(floorNumber, undefined, Math.random() < 0.4 ? 'legendary' : 'epic', true, 'normal', 0, r.biome),
        x: r.cx * 16 + 8,
        y: r.cy * 16 + 8,
        bobTimer: Math.random() * Math.PI * 2,
      });
    } else if (r.type === 'shrine' || r.type === 'challenge') {
      if (Math.random() < 0.75) {
        groundScrolls.push({
          id: groundIdCounter++,
          scroll: generateRandomScroll(),
          x: (r.cx - 1) * 16 + 8,
          y: (r.cy + 1) * 16 + 8,
          bobTimer: Math.random() * Math.PI * 2,
        });
      }
    } else if (r.type === 'normal') {
      if (Math.random() < 0.06) {
        groundWeapons.push({
          id: groundIdCounter++,
          weapon: generateRandomWeapon(floorNumber, undefined, undefined, false, 'normal', 0, r.biome),
          x: (r.x + 2 + Math.floor(Math.random() * (r.w - 4))) * 16 + 8,
          y: (r.y + 2 + Math.floor(Math.random() * (r.h - 4))) * 16 + 8,
          bobTimer: Math.random() * Math.PI * 2,
        });
      }
      if (Math.random() < 0.06) {
        groundScrolls.push({
          id: groundIdCounter++,
          scroll: generateRandomScroll(),
          x: (r.x + 2 + Math.floor(Math.random() * (r.w - 4))) * 16 + 8,
          y: (r.y + 2 + Math.floor(Math.random() * (r.h - 4))) * 16 + 8,
          bobTimer: Math.random() * Math.PI * 2,
        });
      }
    }
  }

  return {
    width: mapWidth,
    height: mapHeight,
    tiles,
    discovered,
    rooms,
    spawnPoint,
    stairsPoint,
    torches,
    vases,
    crates,
    chests,
    shrines,
    fountains,
    traps,
    shop,
    challenge,
    decals: [],
    biome: baseBiome,
    groundWeapons,
    groundScrolls,
    groundRelics,
  };
}

// ----------------------------------------------------
// ПРОЦЕДУРНЫЙ ОБУЧАЮЩИЙ СКЛЕП (TUTORIAL TRAINING GROUNDS)
// ----------------------------------------------------
export function generateTutorialDungeon(): DungeonMap {
  const mapWidth = 52;
  const mapHeight = 52;

  const tiles: number[][] = Array.from({ length: mapHeight }, () =>
    Array(mapWidth).fill(Tile.VOID)
  );
  const discovered: boolean[][] = Array.from({ length: mapHeight }, () =>
    Array(mapWidth).fill(false)
  );

  // 5 последовательных обучающих залов
  const stepConfigs = [
    {
      w: 10,
      h: 10,
      title: 'ШАГ 1: ДВИЖЕНИЕ И РЫВОК',
      msg: 'Используйте WASD для движения и Пробел/Shift для быстрого рывка!',
    },
    {
      w: 12,
      h: 11,
      title: 'ШАГ 2: ОРУЖИЕ И МАГИЯ СФЕР',
      msg: 'Подберите жезл [E] и атакуйте [ЛКМ]. Сферы пробивают толпы!',
    },
    {
      w: 12,
      h: 12,
      title: 'ШАГ 3: СПЕЦНАВЫК И МЕНЮ TAB',
      msg: 'Нажмите [ПКМ / Q] для навыка класса. Нажмите [Tab] для просмотра параметров!',
    },
    {
      w: 14,
      h: 12,
      title: 'ШАГ 4: СУНДУКИ И СВИТКИ ЗАТОЧКИ',
      msg: 'Разбейте вазы, откройте сундук и активируйте свиток заточки оружия!',
    },
    {
      w: 16,
      h: 16,
      title: 'ШАГ 5: ТРЕНИРОВОЧНЫЙ СТРАЖ',
      msg: 'Победите Тренировочного Стража и спуститесь по лестнице!',
    },
  ];

  const rooms: Room[] = [];
  let curY = 6;
  for (let i = 0; i < stepConfigs.length; i++) {
    const cfg = stepConfigs[i];
    const rx = Math.floor(mapWidth / 2 - cfg.w / 2);
    const ry = curY;

    const r: Room = {
      id: i,
      x: rx,
      y: ry,
      w: cfg.w,
      h: cfg.h,
      type: i === 0 ? 'spawn' : i === stepConfigs.length - 1 ? 'exit' : 'tutorial_step',
      biome: 'crypt',
      cx: Math.floor(rx + cfg.w / 2),
      cy: Math.floor(ry + cfg.h / 2),
      connected: i > 0 ? [i - 1] : [],
      visited: i === 0,
      cleared: false,
      titleBanner: cfg.title,
      tutorialMessage: cfg.msg,
    };
    rooms.push(r);

    for (let y = ry; y < ry + cfg.h; y++) {
      for (let x = rx; x < rx + cfg.w; x++) {
        tiles[y][x] = (x + y) % 3 === 0 ? Tile.FLOOR_ALT : Tile.FLOOR;
      }
    }

    // Соединительный коридор к предыдущей комнате
    if (i > 0) {
      const prevR = rooms[i - 1];
      let cy = prevR.y + prevR.h;
      while (cy <= ry) {
        carveCorridorPoint(tiles, prevR.cx, cy, mapWidth, mapHeight);
        cy++;
      }
    }

    curY += cfg.h + 5;
  }

  autoTileWalls(tiles, mapWidth, mapHeight);

  const groundWeapons: GroundWeapon[] = [
    {
      id: 991,
      weapon: generateRandomWeapon(1, 'wand', 'uncommon'),
      x: rooms[1].cx * 16 + 8,
      y: rooms[1].cy * 16 + 8,
      bobTimer: 0,
    },
  ];

  const groundScrolls: GroundScroll[] = [
    {
      id: 992,
      scroll: generateRandomScroll(),
      x: rooms[3].cx * 16 + 8,
      y: rooms[3].cy * 16 + 8,
      bobTimer: 0,
    },
  ];

  const chests: Chest[] = [
    {
      id: 993,
      x: (rooms[3].cx - 3) * 16 + 8,
      y: rooms[3].cy * 16 + 8,
      opened: false,
      type: 'gold',
    },
  ];

  const exitRoom = rooms[rooms.length - 1];
  const stairsPoint = { x: exitRoom.cx, y: exitRoom.cy };
  tiles[stairsPoint.y][stairsPoint.x] = Tile.STAIRS_DOWN;

  const torches: Torch[] = [];
  for (const r of rooms) {
    torches.push({
      x: r.x + 2,
      y: r.y - 1,
      type: 'wall',
      frame: 0,
      animTimer: 0,
      lightIntensity: 1.2,
    });
    torches.push({
      x: r.x + r.w - 3,
      y: r.y - 1,
      type: 'wall',
      frame: 0,
      animTimer: 0,
      lightIntensity: 1.2,
    });
  }

  const groundRelics: GroundRelic[] = [
    {
      id: 995,
      relic: getRandomRelic(),
      x: rooms[3].cx * 16 + 8,
      y: (rooms[3].cy + 2) * 16 + 8,
      bobTimer: 0,
    },
  ];

  const vases: Vase[] = [
    {
      id: 994,
      x: (rooms[3].cx + 3) * 16 + 8,
      y: rooms[3].cy * 16 + 8,
      frame: 0,
      animTimer: 0,
      broken: false,
      contents: 'potion',
    },
  ];

  return {
    width: mapWidth,
    height: mapHeight,
    tiles,
    discovered,
    rooms,
    spawnPoint: { x: rooms[0].cx * 16 + 8, y: rooms[0].cy * 16 + 8 },
    stairsPoint,
    torches,
    vases,
    crates: [],
    chests,
    shrines: [],
    fountains: [],
    traps: [],
    decals: [],
    biome: 'crypt',
    groundWeapons,
    groundScrolls,
    groundRelics,
  };
}

// ----------------------------------------------------
// ПРОЦЕДУРНЫЙ БОСС-РАШ (BOSS RUSH ARENAS)
// ----------------------------------------------------
export function generateBossRushDungeon(waveNumber: number): DungeonMap {
  const mapWidth = 44;
  const mapHeight = 44;

  const tiles: number[][] = Array.from({ length: mapHeight }, () =>
    Array(mapWidth).fill(Tile.VOID)
  );
  const discovered: boolean[][] = Array.from({ length: mapHeight }, () =>
    Array(mapWidth).fill(false)
  );

  const biome: 'crypt' | 'sunken' | 'abyss' | 'sanctum' =
    waveNumber === 1
      ? 'crypt'
      : waveNumber === 2
      ? 'sunken'
      : waveNumber === 3
      ? 'abyss'
      : 'sanctum';

  // Две комнаты: 1. Алтарь передышки (Rest Chamber) и 2. Грандиозная Арена Босса
  const restRoom: Room = {
    id: 0,
    x: 16,
    y: 4,
    w: 12,
    h: 10,
    type: 'spawn',
    biome,
    cx: 22,
    cy: 9,
    connected: [1],
    visited: true,
    cleared: true,
    titleBanner: `⚔️ БОСС-РАШ • ВОЛНА ${waveNumber}`,
  };

  const bossArena: Room = {
    id: 1,
    x: 10,
    y: 18,
    w: 24,
    h: 22,
    type: 'boss',
    biome,
    cx: 22,
    cy: 29,
    connected: [0],
    visited: false,
    cleared: false,
    titleBanner: `💀 АРЕНА ВЛАДЫКИ • ВОЛНА ${waveNumber}`,
  };

  const rooms = [restRoom, bossArena];

  // Carve rest room
  for (let y = restRoom.y; y < restRoom.y + restRoom.h; y++) {
    for (let x = restRoom.x; x < restRoom.x + restRoom.w; x++) {
      tiles[y][x] = Tile.FLOOR;
    }
  }

  // Carve corridor
  for (let y = restRoom.y + restRoom.h; y <= bossArena.y; y++) {
    carveCorridorPoint(tiles, 22, y, mapWidth, mapHeight);
  }

  // Carve arena
  for (let y = bossArena.y; y < bossArena.y + bossArena.h; y++) {
    for (let x = bossArena.x; x < bossArena.x + bossArena.w; x++) {
      tiles[y][x] = (x + y) % 2 === 0 ? Tile.FLOOR_ALT : Tile.FLOOR;
    }
  }

  autoTileWalls(tiles, mapWidth, mapHeight);

  // На Алтаре Передышки спавнятся свитки, фонтан здоровья и легендарное оружие!
  const groundWeapons: GroundWeapon[] = [
    {
      id: 881,
      weapon: generateRandomWeapon(waveNumber * 2, 'wand', 'legendary'),
      x: (restRoom.cx - 3) * 16 + 8,
      y: restRoom.cy * 16 + 8,
      bobTimer: 0,
    },
  ];

  const groundScrolls: GroundScroll[] = [
    {
      id: 882,
      scroll: generateRandomScroll(),
      x: (restRoom.cx + 3) * 16 + 8,
      y: restRoom.cy * 16 + 8,
      bobTimer: 0,
    },
  ];

  const groundRelics: GroundRelic[] = [
    {
      id: 884,
      relic: getRandomRelic(),
      x: restRoom.cx * 16 + 8,
      y: (restRoom.cy + 2) * 16 + 8,
      bobTimer: 0,
    },
  ];

  const fountains: Fountain[] = [
    {
      id: 883,
      x: restRoom.cx * 16 + 8,
      y: (restRoom.cy - 2) * 16 + 8,
      used: false,
    },
  ];
  tiles[restRoom.cy - 2][restRoom.cx] = Tile.FOUNTAIN;

  // Лестница на следующую волну
  const stairsPoint = { x: bossArena.cx, y: bossArena.cy + 7 };
  tiles[stairsPoint.y][stairsPoint.x] = Tile.STAIRS_DOWN;

  const torches: Torch[] = [
    { x: bossArena.x + 2, y: bossArena.y - 1, type: 'wall', frame: 0, animTimer: 0, lightIntensity: 1.5 },
    { x: bossArena.x + bossArena.w - 3, y: bossArena.y - 1, type: 'wall', frame: 0, animTimer: 0, lightIntensity: 1.5 },
    { x: restRoom.x + 2, y: restRoom.y - 1, type: 'wall', frame: 0, animTimer: 0, lightIntensity: 1.2 },
  ];

  return {
    width: mapWidth,
    height: mapHeight,
    tiles,
    discovered,
    rooms,
    spawnPoint: { x: restRoom.cx * 16 + 8, y: restRoom.cy * 16 + 8 },
    stairsPoint,
    torches,
    vases: [],
    crates: [],
    chests: [],
    shrines: [],
    fountains,
    traps: [],
    decals: [],
    biome,
    groundWeapons,
    groundScrolls,
    groundRelics,
  };
}

function carveCorridorPoint(
  tiles: number[][],
  x: number,
  y: number,
  mw: number,
  mh: number
) {
  for (let dy = 0; dy <= 1; dy++) {
    for (let dx = 0; dx <= 1; dx++) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx >= 1 && nx < mw - 1 && ny >= 1 && ny < mh - 1) {
        if (tiles[ny][nx] === Tile.VOID) {
          tiles[ny][nx] = Tile.FLOOR;
        }
      }
    }
  }
}

export function isFloor(tile: number): boolean {
  return (
    tile === Tile.FLOOR ||
    tile === Tile.FLOOR_ALT ||
    tile === Tile.FLOOR_CRACK ||
    tile === Tile.WATER ||
    tile === Tile.STAIRS_DOWN ||
    tile === Tile.SHRINE ||
    tile === Tile.SHOP_CARPET ||
    tile === Tile.FOUNTAIN ||
    tile === Tile.CHEST
  );
}

export function isWalkable(tile: number): boolean {
  return (
    tile === Tile.FLOOR ||
    tile === Tile.FLOOR_ALT ||
    tile === Tile.FLOOR_CRACK ||
    tile === Tile.STAIRS_DOWN ||
    tile === Tile.SHRINE ||
    tile === Tile.SHOP_CARPET ||
    tile === Tile.FOUNTAIN ||
    tile === Tile.CHEST
  );
}

function autoTileWalls(tiles: number[][], w: number, h: number) {
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (tiles[y][x] === Tile.VOID) {
        const hasFloorSouth = y + 1 < h && isFloor(tiles[y + 1][x]);
        const hasFloorNorth = y - 1 >= 0 && isFloor(tiles[y - 1][x]);
        const hasFloorEast = x + 1 < w && isFloor(tiles[y][x + 1]);
        const hasFloorWest = x - 1 >= 0 && isFloor(tiles[y][x - 1]);

        if (hasFloorSouth) {
          tiles[y][x] = Tile.WALL_FRONT;
          if (y - 1 >= 0 && tiles[y - 1][x] === Tile.VOID) {
            tiles[y - 1][x] = Tile.WALL_TOP;
          }
        } else if (hasFloorNorth) {
          tiles[y][x] = Tile.WALL_TOP;
        } else if (hasFloorWest) {
          tiles[y][x] = Tile.WALL_SIDE_R;
        } else if (hasFloorEast) {
          tiles[y][x] = Tile.WALL_SIDE_L;
        } else {
          const hasDiag =
            (y + 1 < h && x + 1 < w && isFloor(tiles[y + 1][x + 1])) ||
            (y + 1 < h && x - 1 >= 0 && isFloor(tiles[y + 1][x - 1])) ||
            (y - 1 >= 0 && x + 1 < w && isFloor(tiles[y - 1][x + 1])) ||
            (y - 1 >= 0 && x - 1 >= 0 && isFloor(tiles[y - 1][x - 1]));
          if (hasDiag) {
            tiles[y][x] = Tile.WALL_TOP;
          }
        }
      }
    }
  }
}
