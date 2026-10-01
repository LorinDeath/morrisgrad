// dungeonWorker.ts - Multi-threaded Web Worker for Dungeon Gathering
// Offloads Spatial Partitioning, Distance Culling, LOD and Crowd Physics to a 2nd CPU Core

export interface WorkerSyncMessage {
  type: 'compute';
  player: { x: number; y: number };
  enemies: Array<{
    id: number;
    x: number;
    y: number;
    radius: number;
    isBoss: boolean;
    isDead: boolean;
  }>;
  queries?: Array<{
    id: number;
    x: number;
    y: number;
    radius: number;
  }>;
  cellSize?: number;
}

export interface WorkerResultMessage {
  type: 'computeResult';
  lodMap: Record<number, number>; // 0 = Active, 1 = Relaxed, 2 = Sleeping
  nearestMap: Record<number, number>; // queryId -> enemyId
  crowdMap: Record<number, { vx: number; vy: number }>;
  activeCount: number;
  sleepingCount: number;
}

// Inlined Blob Worker script for zero-build dependency & instant multi-threading on any browser/platform
const WORKER_SCRIPT = `
self.onmessage = function(e) {
  var data = e.data;
  if (!data || data.type !== 'compute') return;

  var player = data.player;
  var enemies = data.enemies || [];
  var queries = data.queries || [];
  var cellSize = data.cellSize || 128;

  var lodMap = {};
  var grid = new Map();
  var activeCount = 0;
  var sleepingCount = 0;

  // 1. Multi-Core Distance & LOD Classification
  for (var i = 0; i < enemies.length; i++) {
    var en = enemies[i];
    if (en.isDead) continue;

    var dx = player.x - en.x;
    var dy = player.y - en.y;
    var dist = Math.hypot(dx, dy);

    var lod = 0;
    if (en.isBoss) {
      lod = 0;
      activeCount++;
    } else if (dist < 460) {
      lod = 0;
      activeCount++;
    } else if (dist < 820) {
      lod = 1;
      activeCount++;
    } else {
      lod = 2;
      sleepingCount++;
    }
    lodMap[en.id] = lod;

    // Only active and relaxed enemies enter spatial grid
    if (lod < 2) {
      var cx = Math.floor(en.x / cellSize);
      var cy = Math.floor(en.y / cellSize);
      var key = (cx << 16) | (cy & 0xFFFF);
      var cell = grid.get(key);
      if (!cell) {
        cell = [];
        grid.set(key, cell);
      }
      cell.push(en);
    }
  }

  // 2. Query Resolver for Homing Bullets & Auras
  var nearestMap = {};
  for (var q = 0; q < queries.length; q++) {
    var query = queries[q];
    var qcx = Math.floor(query.x / cellSize);
    var qcy = Math.floor(query.y / cellSize);
    var closestId = null;
    var minDist = query.radius || 220;

    for (var ox = -1; ox <= 1; ox++) {
      for (var oy = -1; oy <= 1; oy++) {
        var k = ((qcx + ox) << 16) | ((qcy + oy) & 0xFFFF);
        var bucket = grid.get(k);
        if (bucket) {
          for (var b = 0; b < bucket.length; b++) {
            var ce = bucket[b];
            var d = Math.hypot(ce.x - query.x, ce.y - query.y);
            if (d < minDist) {
              minDist = d;
              closestId = ce.id;
            }
          }
        }
      }
    }
    if (closestId !== null) {
      nearestMap[query.id] = closestId;
    }
  }

  // 3. Fast Crowd Repulsion (Core 2 Calculation)
  var crowdMap = {};
  grid.forEach(function(bucket) {
    if (bucket.length > 1) {
      for (var a = 0; a < bucket.length; a++) {
        for (var b = a + 1; b < bucket.length; b++) {
          var ea = bucket[a];
          var eb = bucket[b];
          var cdx = eb.x - ea.x;
          var cdy = eb.y - ea.y;
          var cdist = Math.hypot(cdx, cdy);
          var minR = (ea.radius || 10) + (eb.radius || 10);
          if (cdist > 0.01 && cdist < minR) {
            var push = (minR - cdist) * 0.45;
            var nx = (cdx / cdist) * push;
            var ny = (cdy / cdist) * push;
            if (!crowdMap[ea.id]) crowdMap[ea.id] = { vx: 0, vy: 0 };
            if (!crowdMap[eb.id]) crowdMap[eb.id] = { vx: 0, vy: 0 };
            crowdMap[ea.id].vx -= nx * 0.35;
            crowdMap[ea.id].vy -= ny * 0.35;
            crowdMap[eb.id].vx += nx * 0.35;
            crowdMap[eb.id].vy += ny * 0.35;
          }
        }
      }
    }
  });

  self.postMessage({
    type: 'computeResult',
    lodMap: lodMap,
    nearestMap: nearestMap,
    crowdMap: crowdMap,
    activeCount: activeCount,
    sleepingCount: sleepingCount
  });
};
`;

export class DungeonComputeManager {
  private worker: Worker | null = null;
  private isBusy = false;
  public multiCoreEnabled = false;
  public coreCount = 1;

  // Cached results from last computation
  public lodMap: Record<number, number> = {};
  public nearestMap: Record<number, number> = {};
  public crowdMap: Record<number, { vx: number; vy: number }> = {};
  public activeCount = 0;
  public sleepingCount = 0;

  constructor() {
    this.coreCount =
      typeof navigator !== 'undefined' && navigator.hardwareConcurrency
        ? navigator.hardwareConcurrency
        : 4;

    this.initWorker();
  }

  private initWorker() {
    if (typeof window === 'undefined' || typeof Worker === 'undefined') {
      return;
    }

    try {
      const blob = new Blob([WORKER_SCRIPT], { type: 'application/javascript' });
      const blobUrl = URL.createObjectURL(blob);
      this.worker = new Worker(blobUrl);

      this.worker.onmessage = (e: MessageEvent<WorkerResultMessage>) => {
        this.isBusy = false;
        if (e.data && e.data.type === 'computeResult') {
          this.lodMap = e.data.lodMap || {};
          this.nearestMap = e.data.nearestMap || {};
          this.crowdMap = e.data.crowdMap || {};
          this.activeCount = e.data.activeCount || 0;
          this.sleepingCount = e.data.sleepingCount || 0;
        }
      };

      this.worker.onerror = (err) => {
        console.warn('[DungeonWorker] Multi-core worker error, falling back to main thread:', err);
        this.worker = null;
        this.multiCoreEnabled = false;
      };

      this.multiCoreEnabled = true;
    } catch (err) {
      console.warn('[DungeonWorker] Failed to create worker:', err);
      this.worker = null;
      this.multiCoreEnabled = false;
    }
  }

  /**
   * Dispatch snapshot to 2nd Core
   */
  public dispatch(
    player: { x: number; y: number },
    enemies: Array<{ id: number; x: number; y: number; radius: number; isBoss: boolean; isDead: boolean }>,
    queries?: Array<{ id: number; x: number; y: number; radius: number }>
  ) {
    if (this.worker && !this.isBusy) {
      this.isBusy = true;
      this.worker.postMessage({
        type: 'compute',
        player: { x: player.x, y: player.y },
        enemies: enemies.map((e) => ({
          id: e.id,
          x: e.x,
          y: e.y,
          radius: e.radius,
          isBoss: e.isBoss,
          isDead: e.isDead,
        })),
        queries,
      } as WorkerSyncMessage);
    } else if (!this.worker) {
      // In-thread fallback if Web Worker is disabled/unsupported
      this.computeSyncFallback(player, enemies, queries);
    }
  }

  private computeSyncFallback(
    player: { x: number; y: number },
    enemies: Array<{ id: number; x: number; y: number; isBoss: boolean; isDead: boolean }>,
    queries?: Array<{ id: number; x: number; y: number; radius: number }>
  ) {
    this.lodMap = {};
    let active = 0;
    let sleeping = 0;

    for (let i = 0; i < enemies.length; i++) {
      const e = enemies[i];
      if (e.isDead) continue;
      const d = Math.hypot(player.x - e.x, player.y - e.y);
      let lod = 0;
      if (e.isBoss) {
        lod = 0;
        active++;
      } else if (d < 460) {
        lod = 0;
        active++;
      } else if (d < 820) {
        lod = 1;
        active++;
      } else {
        lod = 2;
        sleeping++;
      }
      this.lodMap[e.id] = lod;
    }

    this.activeCount = active;
    this.sleepingCount = sleeping;
  }

  public getEnemyLod(id: number, fallbackDist: number): number {
    if (this.lodMap[id] !== undefined) {
      return this.lodMap[id];
    }
    return fallbackDist < 460 ? 0 : fallbackDist < 820 ? 1 : 2;
  }

  public getNearestTarget(queryId: number): number | null {
    return this.nearestMap[queryId] ?? null;
  }

  public getCrowdVector(id: number): { vx: number; vy: number } | null {
    return this.crowdMap[id] ?? null;
  }

  public destroy() {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
  }
}
