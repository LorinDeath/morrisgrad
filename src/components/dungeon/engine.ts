
function pointToSegmentDistance(px: number, py: number, x1: number, y1: number, x2: number, y2: number): number {
  const l2 = (x2 - x1) * (x2 - x1) + (y2 - y1) * (y2 - y1);
  if (l2 === 0) return Math.hypot(px - x1, py - y1);
  let t = ((px - x1) * (x2 - x1) + (py - y1) * (y2 - y1)) / l2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (x1 + t * (x2 - x1)), py - (y1 + t * (y2 - y1)));
}

// engine.ts - Enhanced Game Engine with Biomes, Chests, Combos, Skills, and Traps

import type {
  ChallengeEvent,
  Chest,
  DestructibleCrate,
  DifficultyLevel,
  DungeonMap,
  Enemy,
  EnemyType,
  FloatingText,
  GameMode,
  HeroClass,
  ItemDrop,
  MetaUpgrades,
  Particle,
  PlayerStats,
  Projectile,
  ShopKeeper,
  SpikeTrap,
  Vase,
  Relic,
  GroundRelic,
  BlackHoleEntity,
  StartingLoadoutWeapon,
  StartingPack,
} from './types';
import { evaluateSynergy, type SynergyInfo } from './relics';
import { Tile } from './types';
import { generateDungeon, isWalkable } from './dungeonGen';
import {
  createBloodParticles,
  createDrop,
  createFloatingText,
  createInitialPlayer,
  createSparkleParticles,
  createVaseShatterParticles,
  spawnEnemiesForRoom,
} from './entities';
import type { DungeonAssets } from './assets';
import type { DungeonAudio } from './audio';
import {
  type Weapon,
  type GroundWeapon,
  type GroundScroll,
  RARITY_COLORS,
  generateRandomWeapon,
  generateRandomScroll,
  applyScrollToWeapon,
  infuseWeaponWithStarXp,
  getStarRisks,
  createBrokenFallbackWeapon,
} from './weapons';
import { DungeonComputeManager } from './dungeonWorker';

export interface EngineCallbacks {
  onStatsUpdate: (player: PlayerStats, boss?: Enemy | null) => void;
  onLevelUp: () => void;
  onGameOver: (stats: { floor: number; kills: number; gold: number; blueCoins: number }) => void;
  onVictory: (stats: { floor: number; kills: number; gold: number; blueCoins: number }) => void;
  onNotify: (text: string) => void;
  onShopOpen?: (shop: ShopKeeper) => void;
  onShopClose?: () => void;
  onPrompt?: (text: string | null) => void;
  onWeaponHover?: (groundWeapon: Weapon | null, equippedWeapon: Weapon | null) => void;
  onRelicFound?: (groundRelic: GroundRelic) => void;
  onUltimateTrigger?: (synergyName: string) => void;
  onEvolutionNotify?: (text: string) => void;
  onPerformanceUpdate?: (info: {
    multiCoreEnabled: boolean;
    coreCount: number;
    activeEnemies: number;
    totalEnemies: number;
    visibleEnemies: number;
  }) => void;
}

export class DungeonEngine {
  private canvas: HTMLCanvasElement;
  private minimapCanvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D;
  private lightCanvas: HTMLCanvasElement;
  private lightCtx: CanvasRenderingContext2D;

  private assets: DungeonAssets;
  private audio: DungeonAudio;
  private callbacks: EngineCallbacks;

  public map!: DungeonMap;
  public player!: PlayerStats;
  public playerPos = { x: 0, y: 0 };
  public playerVel = { x: 0, y: 0 };
  public playerDir: 0 | 1 | 2 | 3 = 0;
  public playerAnim = { state: 'idle' as 'idle' | 'run' | 'hurt' | 'death', frame: 0, timer: 0 };

  public enemies: Enemy[] = [];
  public projectiles: Projectile[] = [];
  public items: ItemDrop[] = [];
  public particles: Particle[] = [];
  public floatingTexts: FloatingText[] = [];

  public groundWeapons: GroundWeapon[] = [];
  public groundScrolls: GroundScroll[] = [];
  public hoveredGroundWeapon: GroundWeapon | null = null;
  public groundRelics: GroundRelic[] = [];
  public blackHoles: BlackHoleEntity[] = [];
  public brimstoneBeams: Array<{ x1: number; y1: number; x2: number; y2: number; life: number; maxLife: number; damage: number }> = [];
  public timeFreezeTimer = 0;
  private meatCubeAngle = 0;
  private meatCubeHitTimer = 0;
  private godheadAuraTimer = 0;
  private divineRegenTimer = 0;
  private chaosD6Timer = 0;
  private currentStartingWeapon: StartingLoadoutWeapon = 'default';
  private currentStartingPack: StartingPack = 'none';
  private flameAuraTimer = 0;
  private chainLightningCounter = 0;
  private soulBoltCounter = 0;
  public camera = { x: 0, y: 0, targetX: 0, targetY: 0, zoom: 2.9 };
  public screenShake = { x: 0, y: 0, duration: 0, intensity: 0 };

  public keys = new Set<string>();
  public mouse = { x: 0, y: 0, worldX: 0, worldY: 0, isDown: false, rightDown: false };
  public touchMove = { active: false, dx: 0, dy: 0 };

  private isRunning = false;
  private isPaused = false;
  private lastTime = 0;
  private animFrameId: number | null = null;

  public totalKills = 0;
  public currentBoss: Enemy | null = null;
  public hitStopTimer = 0;

  private slashVisual = {
    active: false,
    angle: 0,
    timer: 0,
    radius: 40,
    color: '#f87171',
    combo: 0,
  };

  // High-performance light & glow GPU offscreen caches
  private lightGlowPlayerCanvas: HTMLCanvasElement;
  private lightGlowTorchCanvas: HTMLCanvasElement;
  private lightGlowProjCanvas: HTMLCanvasElement;

  // Progressive Evolution & Performance Timers
  public floorTimer = 0;
  private lastEvolutionInterval = 0;
  private enemyAiTick = 0;

  // Multi-Core Worker & Multi-Thread Simulation Manager (2nd CPU Core)
  public workerManager: DungeonComputeManager;
  private tintedSpriteCache: Map<string, HTMLCanvasElement> = new Map();
  private minimapBaseCanvas: HTMLCanvasElement | null = null;
  private minimapBaseCtx: CanvasRenderingContext2D | null = null;
  private minimapDirty = true;
  private lastMinimapUpdate = 0;
  public lastVisibleEnemiesCount = 0;

  private currentHeroClass: HeroClass = 'zombie';
  private currentGameMode: GameMode = 'campaign';
  public currentDifficulty: DifficultyLevel = 'normal';
  private currentMeta: MetaUpgrades = {
    extraHearts: 0,
    extraDamage: 0,
    extraGold: 0,
    extraLight: 0,
    extraPotions: 0,
    vampireMastery: 0,
    critMastery: 0,
    greedMastery: 0,
    spectralDiscount: 0,
    soulMagnet: 0,
    lootLuck: 0,
    starAffinity: 0,
  };

  constructor(
    canvas: HTMLCanvasElement,
    assets: DungeonAssets,
    audio: DungeonAudio,
    callbacks: EngineCallbacks,
    minimapCanvas?: HTMLCanvasElement
  ) {
    this.canvas = canvas;
    this.minimapCanvas = minimapCanvas || null;
    this.ctx = canvas.getContext('2d')!;
    this.ctx.imageSmoothingEnabled = false;

    this.lightCanvas = document.createElement('canvas');
    this.lightCtx = this.lightCanvas.getContext('2d')!;

    // 1. Offscreen Player Glow Mask (256x256)
    this.lightGlowPlayerCanvas = document.createElement('canvas');
    this.lightGlowPlayerCanvas.width = 256;
    this.lightGlowPlayerCanvas.height = 256;
    const lpCtx = this.lightGlowPlayerCanvas.getContext('2d')!;
    const lpGrad = lpCtx.createRadialGradient(128, 128, 10, 128, 128, 128);
    lpGrad.addColorStop(0, 'rgba(0, 0, 0, 1.0)');
    lpGrad.addColorStop(0.7, 'rgba(0, 0, 0, 0.7)');
    lpGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    lpCtx.fillStyle = lpGrad;
    lpCtx.beginPath();
    lpCtx.arc(128, 128, 128, 0, Math.PI * 2);
    lpCtx.fill();

    // 2. Offscreen Torch Glow Mask (128x128)
    this.lightGlowTorchCanvas = document.createElement('canvas');
    this.lightGlowTorchCanvas.width = 128;
    this.lightGlowTorchCanvas.height = 128;
    const ltCtx = this.lightGlowTorchCanvas.getContext('2d')!;
    const ltGrad = ltCtx.createRadialGradient(64, 64, 5, 64, 64, 64);
    ltGrad.addColorStop(0, 'rgba(0, 0, 0, 0.95)');
    ltGrad.addColorStop(0.6, 'rgba(0, 0, 0, 0.6)');
    ltGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ltCtx.fillStyle = ltGrad;
    ltCtx.beginPath();
    ltCtx.arc(64, 64, 64, 0, Math.PI * 2);
    ltCtx.fill();

    // 3. Offscreen Projectile Glow Mask (64x64)
    this.lightGlowProjCanvas = document.createElement('canvas');
    this.lightGlowProjCanvas.width = 64;
    this.lightGlowProjCanvas.height = 64;
    const lprCtx = this.lightGlowProjCanvas.getContext('2d')!;
    const lprGrad = lprCtx.createRadialGradient(32, 32, 2, 32, 32, 32);
    lprGrad.addColorStop(0, 'rgba(0, 0, 0, 0.85)');
    lprGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    lprCtx.fillStyle = lprGrad;
    lprCtx.beginPath();
    lprCtx.arc(32, 32, 32, 0, Math.PI * 2);
    lprCtx.fill();

    this.assets = assets;
    this.audio = audio;
    this.callbacks = callbacks;
    this.workerManager = new DungeonComputeManager();

    this.resizeCanvas();
    this.initFloor(1, true);
  }

  private getTintedSprite(
    sheet: HTMLImageElement,
    type: EnemyType,
    isHurt: boolean,
    customTint?: string
  ): HTMLCanvasElement | HTMLImageElement {
    if (!sheet || !sheet.complete || (sheet.naturalWidth === 0 && sheet.width === 0)) {
      return sheet;
    }

    const cacheKey = `${sheet.src || 'sheet'}_${type}_${isHurt ? 'hurt' : 'norm'}_${customTint || 'none'}`;
    const cached = this.tintedSpriteCache.get(cacheKey);
    if (cached) return cached;

    let filterStr = 'none';
    if (isHurt) {
      filterStr = 'brightness(2.2) saturate(0.4)';
    } else if (type === 'zombie_spitter') {
      filterStr = 'hue-rotate(65deg) saturate(2.4) brightness(1.1)';
    } else if (type === 'zombie_runner') {
      filterStr = 'hue-rotate(160deg) saturate(2.2) brightness(1.1)';
    } else if (type === 'zombie_brute') {
      filterStr = 'hue-rotate(330deg) saturate(2.8) brightness(1.05)';
    } else if (type === 'zombie_witch') {
      filterStr = 'hue-rotate(240deg) saturate(2.5) brightness(1.15)';
    } else if (type === 'zombie_pyro') {
      filterStr = 'hue-rotate(25deg) saturate(3.2) brightness(1.2)';
    } else if (customTint) {
      filterStr = 'saturate(1.5)';
    }

    if (filterStr === 'none') {
      return sheet;
    }

    try {
      const offCanvas = document.createElement('canvas');
      offCanvas.width = sheet.naturalWidth || sheet.width || 256;
      offCanvas.height = sheet.naturalHeight || sheet.height || 128;
      const offCtx = offCanvas.getContext('2d');
      if (!offCtx) return sheet;

      offCtx.imageSmoothingEnabled = false;
      offCtx.filter = filterStr;
      offCtx.drawImage(sheet, 0, 0);

      this.tintedSpriteCache.set(cacheKey, offCanvas);
      return offCanvas;
    } catch {
      return sheet;
    }
  }

  public setHeroClass(cls: HeroClass) {
    this.currentHeroClass = cls;
  }

  public setGameMode(mode: GameMode) {
    this.currentGameMode = mode;
  }

  public setDifficulty(diff: DifficultyLevel) {
    this.currentDifficulty = diff;
    if (this.player) this.player.difficulty = diff;
  }

  public setMetaUpgrades(meta: MetaUpgrades) {
    this.currentMeta = meta;
  }

  public setStartingLoadout(weapon: StartingLoadoutWeapon, pack: StartingPack) {
    this.currentStartingWeapon = weapon;
    this.currentStartingPack = pack;
  }

  public resizeCanvas() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = this.canvas.parentElement?.clientWidth || window.innerWidth;
    const h = this.canvas.parentElement?.clientHeight || window.innerHeight;

    this.canvas.width = w * dpr;
    this.canvas.height = h * dpr;
    this.ctx.scale(dpr, dpr);
    this.ctx.imageSmoothingEnabled = false;

    this.lightCanvas.width = w;
    this.lightCanvas.height = h;

    this.camera.zoom = w < 600 ? 3.3 : w < 1024 ? 3.0 : 2.85;
  }

  public initFloor(floorNum: number, resetPlayer = false) {
    this.floorTimer = 0;
    this.lastEvolutionInterval = 0;
    this.minimapDirty = true;
    this.tintedSpriteCache.clear();
    if (resetPlayer) {
      this.player = createInitialPlayer(
        this.currentHeroClass,
        this.currentMeta,
        this.currentDifficulty,
        this.currentGameMode,
        this.currentStartingWeapon,
        this.currentStartingPack
      );
      this.player.gameMode = this.currentGameMode;
      this.player.difficulty = this.currentDifficulty;
      this.totalKills = 0;
    }
    this.player.floor = floorNum;

    this.map = generateDungeon(floorNum, this.currentGameMode);
    this.groundWeapons = this.map.groundWeapons ? [...this.map.groundWeapons] : [];
    this.groundScrolls = this.map.groundScrolls ? [...this.map.groundScrolls] : [];
    this.groundRelics = this.map.groundRelics ? [...this.map.groundRelics] : [];
    this.blackHoles = [];
    this.brimstoneBeams = [];
    this.recalculatePlayerStats();
    this.playerPos.x = this.map.spawnPoint.x;
    this.playerPos.y = this.map.spawnPoint.y;
    this.playerVel.x = 0;
    this.playerVel.y = 0;

    this.camera.x = this.playerPos.x;
    this.camera.y = this.playerPos.y;
    this.camera.targetX = this.playerPos.x;
    this.camera.targetY = this.playerPos.y;

    this.enemies = [];
    this.projectiles = [];
    this.items = [];
    this.particles = [];
    this.floatingTexts = [];
    this.currentBoss = null;

    for (const room of this.map.rooms) {
      const roomEnemies = spawnEnemiesForRoom(room, floorNum, this.currentDifficulty, this.currentGameMode);
      this.enemies.push(...roomEnemies);
      const boss = roomEnemies.find((e) => e.isBoss);
      if (boss) this.currentBoss = boss;
    }

    this.audio.setBossMode(this.currentBoss !== null);
    if (this.currentBoss) {
      this.audio.playBossRoar();
      const bName =
        floorNum === 3
          ? 'НЕЧЕСТИВЫЙ КОЛОСС СКЛЕПА'
          : floorNum === 6
          ? 'ЧУМНОЙ ПАЛАЧ КАТАКОМБ'
          : 'АРХИ-ЛИЧ МОРРИСГРАДА';
      this.callbacks.onNotify(`ЭТАЖ ${floorNum}: ${bName}!`);
    } else {
      const zoneName =
        this.map.biome === 'crypt'
          ? 'ЗАБЫТЫЕ СКЛЕПЫ'
          : this.map.biome === 'sunken'
          ? 'ЗАТОПЛЕННЫЕ КАТАКОМБЫ'
          : 'ТРОННАЯ БЕЗДНА';
      this.callbacks.onNotify(`ЭТАЖ ${floorNum}: ${zoneName}`);
    }

    this.updateFogOfWar();
    this.syncStats();
  }

  public start() {
    if (this.isRunning) return;
    this.isRunning = true;
    this.isPaused = false;
    this.lastTime = performance.now();
    this.loop = this.loop.bind(this);
    this.animFrameId = requestAnimationFrame(this.loop);
  }

  public pause() {
    this.isPaused = true;
  }

  public resume() {
    if (this.isPaused) {
      this.isPaused = false;
      this.lastTime = performance.now();
    }
  }

  public stop() {
    this.isRunning = false;
    if (this.animFrameId) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }
  }

  private loop(currentTime: number) {
    if (!this.isRunning) return;
    const dt = Math.min((currentTime - this.lastTime) / 1000, 0.05);
    this.lastTime = currentTime;

    if (!this.isPaused) {
      if (this.hitStopTimer > 0) {
        this.hitStopTimer -= dt;
      } else {
        this.update(dt);
      }
    }
    this.render();

    this.animFrameId = requestAnimationFrame(this.loop);
  }

  // --- UPDATE LOGIC ---
  private update(dt: number) {
    this.floorTimer += dt;
    this.enemyAiTick++;

    // Многопоточная диспетчеризация расчетов на 2-е ядро процессора (Web Worker)
    if (this.enemyAiTick % 3 === 0 && this.enemies.length > 0) {
      const projectileQueries: Array<{ id: number; x: number; y: number; radius: number }> = [];
      for (const p of this.projectiles) {
        if (p.homing && p.fromPlayer) {
          projectileQueries.push({ id: p.id, x: p.x, y: p.y, radius: 240 });
        }
      }
      this.workerManager.dispatch(this.playerPos, this.enemies, projectileQueries);
    }

    const currentEvolutionInterval = Math.floor(this.floorTimer / 180);
    if (currentEvolutionInterval > this.lastEvolutionInterval && this.floorTimer >= 180) {
      this.lastEvolutionInterval = currentEvolutionInterval;
      this.triggerMobEvolution();
    }

    this.updatePlayer(dt);
    this.updateEnemies(dt);
    this.updateProjectiles(dt);
    this.updateItems(dt);

    // Update ground weapons & scrolls bobbing
    for (const gw of this.groundWeapons) {
      gw.bobTimer += dt * 3;
    }
    for (const gs of this.groundScrolls) {
      gs.bobTimer += dt * 3;
    }

    // Track hovered ground weapon for tooltip inspection
    let nearestGw: GroundWeapon | null = null;
    let minGwDist = 28;
    for (const gw of this.groundWeapons) {
      const d = Math.hypot(this.mouse.worldX - gw.x, this.mouse.worldY - gw.y);
      if (d < minGwDist) {
        minGwDist = d;
        nearestGw = gw;
      }
    }
    this.hoveredGroundWeapon = nearestGw;

    // Exploration room discovery banner
    const pTileX = Math.floor(this.playerPos.x / 16);
    const pTileY = Math.floor(this.playerPos.y / 16);
    for (const r of this.map.rooms) {
      if (
        pTileX >= r.x &&
        pTileX < r.x + r.w &&
        pTileY >= r.y &&
        pTileY < r.y + r.h
      ) {
        if (!r.visited) {
          r.visited = true;
          if (r.titleBanner) {
            this.callbacks.onNotify(r.titleBanner);
            this.addScreenShake(0.25, 5);
          }
        }
        break;
      }
    }

    
    // Update ground relics bobbing
    for (const gr of this.groundRelics) {
      gr.bobTimer += dt * 3;
    }

    // Time freeze countdown
    if (this.timeFreezeTimer > 0) {
      this.timeFreezeTimer -= dt;
      if (this.timeFreezeTimer <= 0) {
        this.player.isUltimateActive = false;
      }
    }
    if (this.player.ultimateTimer > 0) {
      this.player.ultimateTimer -= dt;
    }

    // Brimstone beams decay
    for (let i = this.brimstoneBeams.length - 1; i >= 0; i--) {
      this.brimstoneBeams[i].life -= dt;
      if (this.brimstoneBeams[i].life <= 0) {
        this.brimstoneBeams.splice(i, 1);
      }
    }

    // Black Holes update
    for (let i = this.blackHoles.length - 1; i >= 0; i--) {
      const bh = this.blackHoles[i];
      bh.duration -= dt;
      bh.damageTimer -= dt;
      const doDamage = bh.damageTimer <= 0;
      if (doDamage) bh.damageTimer = bh.damageInterval;

      // Particle accretion disk
      if (Math.random() < 0.8) {
        const pAng = Math.random() * Math.PI * 2;
        const pDist = 15 + Math.random() * (bh.radius * 0.8);
        this.particles.push({
          x: bh.x + Math.cos(pAng) * pDist,
          y: bh.y + Math.sin(pAng) * pDist,
          vx: -Math.sin(pAng) * 70,
          vy: Math.cos(pAng) * 70,
          size: 2.5,
          color: '#c084fc',
          alpha: 0.9,
          life: 0,
          maxLife: 0.35,
        });
      }

      for (const e of this.enemies) {
        if (e.isDead) continue;
        const edist = Math.hypot(e.x - bh.x, e.y - bh.y);
        if (edist < bh.radius) {
          const pull = (1 - edist / bh.radius) * bh.pullForce;
          const pAngle = Math.atan2(bh.y - e.y, bh.x - e.x);
          e.vx += Math.cos(pAngle) * pull * dt;
          e.vy += Math.sin(pAngle) * pull * dt;
          if (doDamage) {
            this.hitEnemy(e, bh.damage, Math.atan2(e.y - bh.y, e.x - bh.x), false, true, bh.damage);
          }
        }
      }

      if (bh.duration <= 0) {
        this.blackHoles.splice(i, 1);
      }
    }

    // Meat Cube update
    if (this.player.relics.some((r) => r?.id === 'meat_cube')) {
      this.meatCubeAngle += dt * 3.5;
      const c1 = {
        x: this.playerPos.x + Math.cos(this.meatCubeAngle) * 36,
        y: this.playerPos.y + Math.sin(this.meatCubeAngle) * 36,
      };
      const c2 = {
        x: this.playerPos.x + Math.cos(this.meatCubeAngle + Math.PI) * 36,
        y: this.playerPos.y + Math.sin(this.meatCubeAngle + Math.PI) * 36,
      };
      const cubes = [c1, c2];

      // Block bullets
      for (let pi = this.projectiles.length - 1; pi >= 0; pi--) {
        const p = this.projectiles[pi];
        if (!p.fromPlayer) {
          for (const c of cubes) {
            if (Math.hypot(p.x - c.x, p.y - c.y) < 15) {
              this.projectiles.splice(pi, 1);
              this.audio.playHit();
              this.particles.push(...createSparkleParticles(p.x, p.y, '#e11d48'));
              break;
            }
          }
        }
      }

      // Meat cube collision with enemies
      this.meatCubeHitTimer += dt;
      if (this.meatCubeHitTimer >= 0.28) {
        this.meatCubeHitTimer = 0;
        for (const c of cubes) {
          for (const e of this.enemies) {
            if (!e.isDead && Math.hypot(e.x - c.x, e.y - c.y) < 18) {
              e.hp -= 45;
              e.hurtTimer = 0.18;
              this.floatingTexts.push(createFloatingText(e.x, e.y, 'МЯСО 45', '#e11d48', 12));
              this.particles.push(...createBloodParticles(e.x, e.y, '#e11d48'));
              if (e.hp <= 0) this.killEnemy(e);
            }
          }
        }
      }
    }

    // Godhead Aura update
    if (this.player.relics.some((r) => r?.id === 'godhead_halo') || this.player.activeSynergy?.includes('БОЖЕСТВЕННЫЙ АБСОЛЮТ')) {
      this.godheadAuraTimer += dt;
      if (this.godheadAuraTimer >= 0.32) {
        this.godheadAuraTimer = 0;
        const rad = this.player.activeSynergy?.includes('БОЖЕСТВЕННЫЙ АБСОЛЮТ') ? 170 : 110;
        for (const e of this.enemies) {
          if (!e.isDead && Math.hypot(e.x - this.playerPos.x, e.y - this.playerPos.y) < rad) {
            e.hp -= 20;
            e.hurtTimer = 0.15;
            this.floatingTexts.push(createFloatingText(e.x, e.y, 'БОГ 20', '#facc15', 11));
            this.particles.push(...createSparkleParticles(e.x, e.y, '#ffd700'));
            if (e.hp <= 0) this.killEnemy(e);
          }
        }
      }
    }

    // Divine Absolute synergy HP regeneration
    if (this.player.activeSynergy?.includes('БОЖЕСТВЕННЫЙ АБСОЛЮТ')) {
      this.divineRegenTimer += dt;
      if (this.divineRegenTimer >= 5.0) {
        this.divineRegenTimer = 0;
        if (this.player.hp < this.player.maxHp) {
          this.player.hp = Math.min(this.player.maxHp, this.player.hp + 1);
          this.floatingTexts.push(createFloatingText(this.playerPos.x, this.playerPos.y, '+1 HP', '#4ade80', 12));
        }
      }
    }

    // Chaos D6 periodic gifts
    if (this.player.relics.some((r) => r?.id === 'chaos_d6')) {
      this.chaosD6Timer += dt;
      if (this.chaosD6Timer >= 14.0) {
        this.chaosD6Timer = 0;
        if (Math.random() < 0.5) {
          this.items.push(createDrop('potion_hp', this.playerPos.x + 8, this.playerPos.y));
          this.items.push(createDrop('coin', this.playerPos.x - 8, this.playerPos.y, 25));
          this.callbacks.onNotify('🎲 КОСТЬ D6: ДАР ХАОСА (ЗЕЛЬЕ + МОНЕТЫ)!');
        } else {
          for (const e of this.enemies) {
            if (!e.isDead && Math.hypot(e.x - this.playerPos.x, e.y - this.playerPos.y) < 180) {
              e.hp -= 55;
              e.hurtTimer = 0.2;
              this.floatingTexts.push(createFloatingText(e.x, e.y, 'ХАОС 55', '#ec4899', 13));
              if (e.hp <= 0) this.killEnemy(e);
            }
          }
          this.callbacks.onNotify('🎲 КОСТЬ D6: ВСПЫШКА РАЗРУШЕНИЯ!');
        }
      }
    }

    // Aegis shield cooldown
    if (this.player.hasAegisShield && this.player.aegisShieldTimer > 0) {
      this.player.aegisShieldTimer -= dt;
    }

    // Flame aura tick
    if (this.player.flameAura) {
      this.flameAuraTimer += dt;
      if (this.flameAuraTimer >= 0.4) {
        this.flameAuraTimer = 0;
        for (const e of this.enemies) {
          if (!e.isDead && Math.hypot(e.x - this.playerPos.x, e.y - this.playerPos.y) < 46) {
            e.hp -= 15;
            e.hurtTimer = 0.15;
            this.particles.push(...createSparkleParticles(e.x, e.y, '#f97316'));
            this.floatingTexts.push(createFloatingText(e.x, e.y, 'ОГОНЬ 15', '#f97316', 10));
            if (e.hp <= 0) this.killEnemy(e);
          }
        }
      }
    }

    // Freeze dash check
    if (this.player.isDashing && this.player.freezeDash) {
      for (const e of this.enemies) {
        if (!e.isDead && Math.hypot(e.x - this.playerPos.x, e.y - this.playerPos.y) < 55) {
          e.speed = Math.max(15, e.speed * 0.35);
          this.particles.push({
            x: e.x,
            y: e.y,
            vx: 0,
            vy: -15,
            size: 3,
            color: '#38bdf8',
            alpha: 0.9,
            life: 0,
            maxLife: 0.4,
          });
        }
      }
    }
    this.updateProps(dt);
    // Traps completely removed per user request
    this.updateChallenge(dt);
    this.updateParticles(dt);
    this.updateFloatingTexts(dt);
    this.updateCamera(dt);
    this.updateFogOfWar();

    // Обучающие подсказки по комнатам
    if (this.currentGameMode === 'tutorial') {
      const curTileX = Math.floor(this.playerPos.x / 16);
      const curTileY = Math.floor(this.playerPos.y / 16);
      const curR = this.map.rooms.find(
        (r) => curTileX >= r.x && curTileX < r.x + r.w && curTileY >= r.y && curTileY < r.y + r.h
      );
      if (curR?.tutorialMessage && this.callbacks.onPrompt) {
        this.callbacks.onPrompt(curR.tutorialMessage);
      }
    }

    this.checkInteractions();
    this.syncStats();
  }

  private updatePlayer(dt: number) {
    if (this.player.attackTimer > 0) this.player.attackTimer -= dt;
    if (this.player.dashTimer > 0) this.player.dashTimer -= dt;
    if (this.player.specialSkillTimer > 0) this.player.specialSkillTimer -= dt;
    if (this.player.invulnerableTimer > 0) this.player.invulnerableTimer -= dt;
    if (this.player.buffSpeedTimer > 0) this.player.buffSpeedTimer -= dt;
    if (this.player.buffPowerTimer > 0) this.player.buffPowerTimer -= dt;

    if (this.player.comboResetTimer > 0) {
      this.player.comboResetTimer -= dt;
      if (this.player.comboResetTimer <= 0) {
        this.player.comboStep = 0;
      }
    }

    if (this.slashVisual.active) {
      this.slashVisual.timer -= dt;
      if (this.slashVisual.timer <= 0) this.slashVisual.active = false;
    }

    if (this.player.isDashing) {
      this.particles.push({
        x: this.playerPos.x + (Math.random() - 0.5) * 10,
        y: this.playerPos.y + (Math.random() - 0.5) * 10,
        vx: 0,
        vy: 0,
        size: 3,
        color: this.player.heroClass === 'paladin' ? '#ffd700' : '#60a5fa',
        alpha: 0.6,
        life: 0,
        maxLife: 0.25,
      });

      this.moveEntityWithCollision(this.playerPos, this.playerVel.x * dt, this.playerVel.y * dt, 5.5);
      return;
    }

    let moveX = 0;
    let moveY = 0;

    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) moveY -= 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) moveY += 1;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) moveX -= 1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) moveX += 1;

    if (this.touchMove.active) {
      moveX = this.touchMove.dx;
      moveY = this.touchMove.dy;
    }

    const len = Math.hypot(moveX, moveY);
    if (len > 0.05) {
      const normX = moveX / len;
      const normY = moveY / len;

      let speed = this.player.speed;
      if (this.player.buffSpeedTimer > 0) speed *= 1.4;

      this.playerVel.x = normX * speed;
      this.playerVel.y = normY * speed;

      if (Math.abs(normX) > Math.abs(normY)) {
        this.playerDir = normX > 0 ? 1 : 3;
      } else {
        this.playerDir = normY > 0 ? 0 : 2;
      }

      this.playerAnim.state = 'run';
    } else {
      this.playerVel.x = 0;
      this.playerVel.y = 0;
      this.playerAnim.state = 'idle';
    }

    this.moveEntityWithCollision(this.playerPos, this.playerVel.x * dt, this.playerVel.y * dt, 5.5);

    this.playerAnim.timer += dt;
    if (this.playerAnim.timer >= 0.08) {
      this.playerAnim.timer = 0;
      this.playerAnim.frame = (this.playerAnim.frame + 1) % 8;
    }

    if (this.mouse.isDown && this.player.attackTimer <= 0) {
      this.performAttack();
    }

    if (this.player.flameAura && Math.random() < 0.25) {
      this.particles.push({
        x: this.playerPos.x + (Math.random() - 0.5) * 30,
        y: this.playerPos.y + (Math.random() - 0.5) * 30,
        vx: (Math.random() - 0.5) * 20,
        vy: -25 - Math.random() * 20,
        size: 2,
        color: '#f97316',
        alpha: 0.9,
        life: 0,
        maxLife: 0.4,
      });

      for (const e of this.enemies) {
        if (!e.isDead && Math.hypot(e.x - this.playerPos.x, e.y - this.playerPos.y) < 45) {
          e.hp -= 2;
          this.floatingTexts.push(createFloatingText(e.x, e.y, '🔥2', '#f97316', 10));
          if (e.hp <= 0) this.killEnemy(e);
        }
      }
    }
  }

  public performAttack() {
    if (this.player.attackTimer > 0) return;
    this.player.attackTimer = this.player.attackCooldown;

    const dx = this.mouse.worldX - this.playerPos.x;
    const dy = this.mouse.worldY - this.playerPos.y;
    const angle = Math.atan2(dy, dx);

    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    if (Math.abs(cos) > Math.abs(sin)) {
      this.playerDir = cos > 0 ? 1 : 3;
    } else {
      this.playerDir = sin > 0 ? 0 : 2;
    }

    
    // Relic: Brimstone Crimson Laser Beam!
    const hasBrimstone = this.player.relics.some((r) => r?.id === 'brimstone_beam');
    if (hasBrimstone) {
      this.player.attackTimer = this.player.attackCooldown;
      this.audio.playSpecialSkill();
      this.addScreenShake(0.25, 6);
      const beamLength = 380;
      const bx = this.playerPos.x + Math.cos(angle) * beamLength;
      const by = this.playerPos.y + Math.sin(angle) * beamLength;
      this.brimstoneBeams.push({
        x1: this.playerPos.x,
        y1: this.playerPos.y,
        x2: bx,
        y2: by,
        life: 0.32,
        maxLife: 0.32,
        damage: Math.round(this.player.damage * 2.2),
      });

      for (const e of this.enemies) {
        if (e.isDead) continue;
        const distToLine = pointToSegmentDistance(e.x, e.y, this.playerPos.x, this.playerPos.y, bx, by);
        if (distToLine < e.radius + 16) {
          const dmg = Math.round(this.player.damage * 2.2);
          this.hitEnemy(e, dmg, angle, true);
          this.particles.push(...createBloodParticles(e.x, e.y, '#ef4444'));

          if (this.player.activeSynergy?.includes('КРОВАВЫЙ РАСПАД')) {
            for (let k = 0; k < 2; k++) {
              const sa = angle + (Math.random() - 0.5) * 1.6;
              this.projectiles.push({
                id: Math.random(),
                x: e.x,
                y: e.y,
                vx: Math.cos(sa) * 260,
                vy: Math.sin(sa) * 260,
                radius: 6,
                damage: Math.round(this.player.damage * 0.7),
                fromPlayer: true,
                color: '#ef4444',
                trailColor: '#7f1d1d',
                life: 0,
                maxLife: 1.5,
                piercing: true,
                homing: true,
                isSplitTear: true,
              });
            }
          }
        }
      }
      return;
    }

    const wpn = this.player.equippedWeapon;
    const isRanged = !!(wpn && wpn.projectile) || this.player.heroClass === 'sorcerer';

    if (isRanged) {
      this.audio.playSpecialSkill();
      const projCfg = wpn?.projectile;
      const isOrb = projCfg?.isMagicOrb ?? (this.player.heroClass === 'sorcerer');
      const pSpeed = projCfg?.speed || 290;
      const pRadius = isOrb ? (projCfg?.radius || 9) : (projCfg?.radius || 5);
      const pColor = projCfg?.color || (this.player.heroClass === 'sorcerer' ? '#c084fc' : '#f8fafc');
      const pTrail = projCfg?.trailColor || (this.player.heroClass === 'sorcerer' ? '#ec4899' : '#38bdf8');
      const pPierce = projCfg?.pierce || 2;
      const multishot = projCfg?.multishot || 1;
      const orbType = projCfg?.orbType || (this.player.heroClass === 'sorcerer' ? 'plasma' : undefined);
      const isExplosive = projCfg?.explosive || wpn?.bonusExplosive;
      let isHoming = projCfg?.homing || wpn?.bonusHoming;
      const hasOccultEye = this.player.relics.some((r) => r?.id === 'occult_eye');
      const hasSacredHeart = this.player.relics.some((r) => r?.id === 'sacred_heart');
      const hasTriquetra = this.player.relics.some((r) => r?.id === 'unholy_triquetra');
      if (hasOccultEye || hasSacredHeart) isHoming = true;

      const spreadStep = 0.14;
      const half = (multishot - 1) / 2;

      const wpnDark = this.player.equippedWeapon?.bonusDarkMagicPct || 0;
      const hasVoidSeal = this.player.relics.some((r) => r?.id === 'void_seal');
      const isDarkProj = wpnDark > 0 || hasVoidSeal || orbType === 'void';

      for (let s = -half; s <= half; s++) {
        const shootAngle = angle + s * spreadStep;
        const pDamage = Math.round(
          this.player.damage * (this.player.buffPowerTimer > 0 ? 1.5 : 1.0) * (hasSacredHeart ? 2.2 : 1.0)
        );
        this.projectiles.push({
          id: Math.random(),
          x: this.playerPos.x,
          y: this.playerPos.y,
          vx: Math.cos(shootAngle) * pSpeed,
          vy: Math.sin(shootAngle) * pSpeed,
          radius: hasSacredHeart ? 14 : pRadius,
          damage: pDamage,
          fromPlayer: true,
          color: hasSacredHeart ? '#ffffff' : hasTriquetra ? '#a855f7' : isDarkProj ? '#c084fc' : pColor,
          trailColor: hasSacredHeart ? '#ffd700' : hasTriquetra ? '#7e22ce' : isDarkProj ? '#3b0764' : pTrail,
          life: 0,
          maxLife: 2.2,
          piercing: true,
          pierceCount: pPierce,
          hitEnemyIds: new Set(),
          isMagicOrb: isOrb,
          orbType: (isDarkProj && !orbType ? 'void' : orbType) as any,
          explosive: isExplosive,
          homing: isHoming,
          isDarkMagic: isDarkProj,
          darkMagicDamage: isDarkProj ? Math.max(1, Math.round(pDamage * (hasVoidSeal ? 1.0 : Math.max(0.25, wpnDark)))) : 0,
        });
      }

      // Recoil lunge
      this.moveEntityWithCollision(
        this.playerPos,
        -Math.cos(angle) * 3,
        -Math.sin(angle) * 3,
        5.5
      );

      // Soul bolt perk trigger
      if (this.player.soulBoltReadyCounter > 0) {
        this.soulBoltCounter = (this.soulBoltCounter || 0) + 1;
        if (this.soulBoltCounter >= 3) {
          this.soulBoltCounter = 0;
          this.projectiles.push({
            id: Math.random(),
            x: this.playerPos.x,
            y: this.playerPos.y,
            vx: Math.cos(angle) * 220,
            vy: Math.sin(angle) * 220,
            radius: 6,
            damage: Math.round(this.player.damage * 1.8),
            fromPlayer: true,
            color: '#38bdf8',
            trailColor: '#0284c7',
            life: 0,
            maxLife: 2.2,
            homing: true,
          });
        }
      }

      return;
    }

    const combo = this.player.comboStep;
    this.player.comboResetTimer = 0.75;
    this.player.comboStep = (combo + 1) % 3;

    this.audio.playClawSlash(combo);

    const isFinisher = combo === 2;
    const range = this.player.attackRange * (isFinisher ? 1.35 : 1.0);
    const comboMultiplier = isFinisher ? 2.0 : combo === 1 ? 1.3 : 1.0;
    const baseDamage =
      this.player.damage *
      comboMultiplier *
      (this.player.buffPowerTimer > 0 ? 1.5 : 1.0);

    // Subtle lunge forward towards aim cursor on attack
    const lungeDist = isFinisher ? 8 : 4;
    this.moveEntityWithCollision(
      this.playerPos,
      Math.cos(angle) * lungeDist,
      Math.sin(angle) * lungeDist,
      5.5
    );

    this.slashVisual = {
      active: true,
      angle,
      timer: isFinisher ? 0.22 : 0.16,
      radius: range,
      color:
        this.player.heroClass === 'paladin'
          ? '#ffd700'
          : isFinisher
          ? '#ef4444'
          : '#38bdf8',
      combo,
    };

    const arcSpan = isFinisher ? Math.PI : 0.9 + this.player.cleaveBonus;
    for (let a = -arcSpan / 2; a <= arcSpan / 2; a += 0.25) {
      const pa = angle + a;
      this.particles.push({
        x: this.playerPos.x + Math.cos(pa) * (range * 0.8),
        y: this.playerPos.y + Math.sin(pa) * (range * 0.8),
        vx: Math.cos(pa) * (isFinisher ? 100 : 60),
        vy: Math.sin(pa) * (isFinisher ? 100 : 60),
        size: isFinisher ? 3.5 : 2.5,
        color: this.slashVisual.color,
        alpha: 1.0,
        life: 0,
        maxLife: 0.22,
      });
    }

    for (const enemy of this.enemies) {
      if (enemy.isDead) continue;
      const ex = enemy.x - this.playerPos.x;
      const ey = enemy.y - this.playerPos.y;
      const dist = Math.hypot(ex, ey);

      if (dist <= range + enemy.radius) {
        const enemyAngle = Math.atan2(ey, ex);
        let diff = Math.abs(enemyAngle - angle);
        while (diff > Math.PI) diff = Math.abs(diff - Math.PI * 2);

        const wpnDark = this.player.equippedWeapon?.bonusDarkMagicPct || 0;
        const hasVoidSeal = this.player.relics.some((r) => r?.id === 'void_seal');
        const isDarkMelee = wpnDark > 0 || hasVoidSeal || this.player.activeSynergy?.includes('ЧЁРНАЯ СИНГУЛЯРНОСТЬ');
        const darkMeleeDmg = isDarkMelee ? Math.max(1, Math.round(baseDamage * (hasVoidSeal ? 1.0 : Math.max(0.25, wpnDark)))) : 0;

        if (isFinisher || diff < arcSpan / 2) {
          this.hitEnemy(enemy, baseDamage, angle, isFinisher, isDarkMelee, darkMeleeDmg);
        }
      }
    }

    for (const vase of this.map.vases) {
      if (vase.broken) continue;
      const dist = Math.hypot(vase.x - this.playerPos.x, vase.y - this.playerPos.y);
      if (dist <= range + 12) {
        this.smashVase(vase);
      }
    }

    if (this.map.crates) {
      for (const crate of this.map.crates) {
        if (crate.broken) continue;
        const dist = Math.hypot(crate.x - this.playerPos.x, crate.y - this.playerPos.y);
        if (dist <= range + 14) {
          this.hitCrate(crate, baseDamage);
        }
      }
    }

    if (this.player.perks.includes('soul_bolt')) {
      this.player.soulBoltReadyCounter = (this.player.soulBoltReadyCounter || 0) + 1;
      if (this.player.soulBoltReadyCounter >= 3) {
        this.player.soulBoltReadyCounter = 0;
        this.fireSoulBolt(angle);
      }
    }
  }

  public performSpecialSkill() {
    if (this.player.specialSkillTimer > 0) return;
    this.player.specialSkillTimer = this.player.specialSkillCooldown;
    this.audio.playSpecialSkill();

    if (this.player.heroClass === 'zombie') {
      this.addScreenShake(0.25, 6);
      this.particles.push(...createBloodParticles(this.playerPos.x, this.playerPos.y, '#84cc16'));
      this.floatingTexts.push(
        createFloatingText(this.playerPos.x, this.playerPos.y, 'ЧУМНОЙ ВЗРЫВ!', '#a3e635', 14)
      );

      for (const e of this.enemies) {
        if (!e.isDead && Math.hypot(e.x - this.playerPos.x, e.y - this.playerPos.y) < 95) {
          this.hitEnemy(e, Math.round(this.player.damage * 1.6), Math.atan2(e.y - this.playerPos.y, e.x - this.playerPos.x), true);
        }
      }
    } else if (this.player.heroClass === 'paladin') {
      this.addScreenShake(0.3, 7);
      this.particles.push(...createSparkleParticles(this.playerPos.x, this.playerPos.y, '#ffd700'));
      this.floatingTexts.push(
        createFloatingText(this.playerPos.x, this.playerPos.y, 'ОСВЯЩЕННЫЙ ВИХРЬ!', '#fde047', 14)
      );

      this.projectiles = this.projectiles.filter((p) => p.fromPlayer);

      for (const e of this.enemies) {
        if (!e.isDead && Math.hypot(e.x - this.playerPos.x, e.y - this.playerPos.y) < 110) {
          this.hitEnemy(e, Math.round(this.player.damage * 2.0), Math.atan2(e.y - this.playerPos.y, e.x - this.playerPos.x), true);
        }
      }
    } else if (this.player.heroClass === 'sorcerer') {
      this.addScreenShake(0.3, 8);
      this.particles.push(...createSparkleParticles(this.playerPos.x, this.playerPos.y, '#c084fc'));
      this.floatingTexts.push(
        createFloatingText(this.playerPos.x, this.playerPos.y, 'ВСПЫШКА ПУСТОТЫ!', '#c084fc', 14)
      );

      // Deflect incoming projectiles
      this.projectiles = this.projectiles.filter((p) => p.fromPlayer);

      // Radial dark matter shockwave
      for (const e of this.enemies) {
        if (!e.isDead && Math.hypot(e.x - this.playerPos.x, e.y - this.playerPos.y) < 115) {
          this.hitEnemy(
            e,
            Math.round(this.player.damage * 2.2),
            Math.atan2(e.y - this.playerPos.y, e.x - this.playerPos.x),
            true,
            true,
            Math.round(this.player.damage * 2.2)
          );
        }
      }
    } else if (this.player.heroClass === 'berserker') {
      this.addScreenShake(0.35, 9);
      this.particles.push(...createBloodParticles(this.playerPos.x, this.playerPos.y, '#ef4444'));
      this.floatingTexts.push(
        createFloatingText(this.playerPos.x, this.playerPos.y, 'ВИХРЬ БЕЗУМИЯ!', '#ef4444', 15)
      );

      for (const e of this.enemies) {
        if (!e.isDead && Math.hypot(e.x - this.playerPos.x, e.y - this.playerPos.y) < 125) {
          this.hitEnemy(
            e,
            Math.round(this.player.damage * 2.8),
            Math.atan2(e.y - this.playerPos.y, e.x - this.playerPos.x),
            true
          );
        }
      }
    } else if (this.player.heroClass === 'assassin') {
      this.addScreenShake(0.2, 5);
      this.floatingTexts.push(
        createFloatingText(this.playerPos.x, this.playerPos.y, 'ВЕЕР КЛИНКОВ!', '#06b6d4', 14)
      );

      for (let i = 0; i < 8; i++) {
        const da = (i / 8) * Math.PI * 2;
        this.projectiles.push({
          id: Math.random(),
          x: this.playerPos.x,
          y: this.playerPos.y,
          vx: Math.cos(da) * 330,
          vy: Math.sin(da) * 330,
          radius: 5,
          damage: Math.round(this.player.damage * 1.5),
          fromPlayer: true,
          color: '#06b6d4',
          trailColor: '#0891b2',
          life: 0,
          maxLife: 1.5,
          piercing: true,
        });
      }
    }
  }

  public performDash() {
    if (this.player.dashTimer > 0 || this.player.isDashing) return;
    this.player.dashTimer = this.player.dashCooldown;
    this.player.isDashing = true;
    this.player.invulnerableTimer = this.player.dashDuration + 0.1;
    this.audio.playDash();

    let dx = this.playerVel.x;
    let dy = this.playerVel.y;
    if (Math.hypot(dx, dy) === 0) {
      const dirs = [
        [0, 1],
        [1, 0],
        [0, -1],
        [-1, 0],
      ];
      dx = dirs[this.playerDir][0];
      dy = dirs[this.playerDir][1];
    }
    const dlen = Math.hypot(dx, dy);
    const dashSpeed = 350;
    this.playerVel.x = (dx / dlen) * dashSpeed;
    this.playerVel.y = (dy / dlen) * dashSpeed;

    setTimeout(() => {
      this.player.isDashing = false;
    }, this.player.dashDuration * 1000);
  }

  public usePotion(type: 'hp' | 'speed' | 'power') {
    if (this.player.potions[type] <= 0) return;
    this.player.potions[type]--;
    this.audio.playPotion();

    if (type === 'hp') {
      const healAmount = this.player.perks.includes('alchemist_mastery') ? 4 : 2;
      this.player.hp = Math.min(this.player.hp + healAmount, this.player.maxHp);
      this.floatingTexts.push(
        createFloatingText(this.playerPos.x, this.playerPos.y, `+${healAmount} HP`, '#4ade80', 14)
      );
      this.particles.push(...createSparkleParticles(this.playerPos.x, this.playerPos.y, '#22c55e'));
    } else if (type === 'speed') {
      this.player.buffSpeedTimer = 10;
      this.floatingTexts.push(
        createFloatingText(this.playerPos.x, this.playerPos.y, 'СКОРОСТЬ!', '#facc15', 13)
      );
      this.particles.push(...createSparkleParticles(this.playerPos.x, this.playerPos.y, '#eab308'));
    } else if (type === 'power') {
      this.player.buffPowerTimer = 10;
      this.floatingTexts.push(
        createFloatingText(this.playerPos.x, this.playerPos.y, 'МОЩЬ +50%!', '#ef4444', 13)
      );
      this.particles.push(...createSparkleParticles(this.playerPos.x, this.playerPos.y, '#f87171'));
    }

    this.syncStats();
  }

  private hitEnemy(
    enemy: Enemy,
    baseDamage: number,
    pushAngle: number,
    isFinisher = false,
    isDarkMagic = false,
    darkMagicDamage = 0
  ) {
    const isCrit = Math.random() < this.player.critChance;
    let finalDamage = Math.round(isCrit ? baseDamage * this.player.critMult : baseDamage);

    if (this.player.perks.includes('berserker_rage') && this.player.hp <= 4) {
      finalDamage = Math.round(finalDamage * 1.85);
    }

    // -------------------------------------------------------------
    // ЧЁРНЫЙ ЩИТ И МЕХАНИКА ЧЁРНОЙ МАГИИ
    // -------------------------------------------------------------
    if (enemy.hasDarkShield && (enemy.darkShieldHp || 0) > 0) {
      const hasVoidSeal = this.player.relics.some((r) => r?.id === 'void_seal');
      const wpnDarkPct = this.player.equippedWeapon?.bonusDarkMagicPct || 0;
      const isPureVoid = isDarkMagic || hasVoidSeal || this.player.activeSynergy?.includes('ЧЁРНАЯ СИНГУЛЯРНОСТЬ');
      const hasDarkAttack = isPureVoid || wpnDarkPct > 0;

      if (!hasDarkAttack) {
        // Обычные атаки ПОЛНОСТЬЮ блокируются черным щитом!
        this.audio.playDarkShieldAbsorb();
        this.floatingTexts.push(
          createFloatingText(enemy.x, enemy.y - 10, '🛡️ ПОГЛОЩЕНО (0)', '#c084fc', 12)
        );
        for (let sp = 0; sp < 4; sp++) {
          this.particles.push({
            x: enemy.x + (Math.random() - 0.5) * 16,
            y: enemy.y + (Math.random() - 0.5) * 16,
            vx: Math.cos(pushAngle + Math.PI + (Math.random() - 0.5)) * 90,
            vy: Math.sin(pushAngle + Math.PI + (Math.random() - 0.5)) * 90,
            size: 3,
            color: '#c084fc',
            alpha: 1.0,
            life: 0,
            maxLife: 0.25,
          });
        }
        const pushForce = enemy.isBoss ? 15 : 50;
        enemy.vx += Math.cos(pushAngle) * pushForce;
        enemy.vy += Math.sin(pushAngle) * pushForce;
        return;
      }

      // Атака содержит Чёрную Магию: пробивает щит и наносит урон
      const darkRatio = isPureVoid ? 1.0 : Math.max(0.20, wpnDarkPct);
      const pureDarkDmg = darkMagicDamage > 0 ? darkMagicDamage : Math.max(1, Math.round(finalDamage * darkRatio));

      enemy.darkShieldHp = (enemy.darkShieldHp || 0) - pureDarkDmg;
      this.floatingTexts.push(
        createFloatingText(enemy.x, enemy.y - 14, `🔮 ТЁМНЫЙ УРОН ${pureDarkDmg}`, '#e879f9', 13)
      );

      for (let sp = 0; sp < 5; sp++) {
        this.particles.push({
          x: enemy.x,
          y: enemy.y,
          vx: (Math.random() - 0.5) * 80,
          vy: (Math.random() - 0.5) * 80,
          size: 3,
          color: '#9333ea',
          alpha: 1.0,
          life: 0,
          maxLife: 0.35,
        });
      }

      if (enemy.darkShieldHp <= 0) {
        enemy.hasDarkShield = false;
        enemy.darkShieldHp = 0;
        this.audio.playDarkShieldBreak();
        this.addScreenShake(0.28, 6);
        this.floatingTexts.push(
          createFloatingText(enemy.x, enemy.y, '💥 ЧЁРНЫЙ ЩИТ РАЗРУШЕН!', '#f0abfc', 15)
        );
      }
    }

    // Chain Lightning perk
    if (this.player.chainLightning) {
      this.chainLightningCounter = (this.chainLightningCounter || 0) + 1;
      if (this.chainLightningCounter >= 3) {
        this.chainLightningCounter = 0;
        let zapped = 0;
        for (const other of this.enemies) {
          if (other !== enemy && !other.isDead && Math.hypot(other.x - enemy.x, other.y - enemy.y) < 140) {
            other.hp -= 40;
            other.hurtTimer = 0.2;
            this.particles.push(...createSparkleParticles(other.x, other.y, '#38bdf8'));
            this.floatingTexts.push(createFloatingText(other.x, other.y, '⚡ МОЛНИЯ 40', '#38bdf8', 13));
            if (other.hp <= 0) this.killEnemy(other);
            zapped++;
            if (zapped >= 3) break;
          }
        }
      }
    }

    // Броня моба: базовое сопротивление возрастает плавно с 5-го этажа,
    // а аффиксы пробития (Pierce) и Чёрная Магия эффективно пробивают броню
    let enemyArmor = enemy.armor || 0;
    if (enemyArmor > 0) {
      const wpnDarkPct = this.player.equippedWeapon?.bonusDarkMagicPct || 0;
      const pierceBonus = this.player.equippedWeapon?.projectile?.pierce || 0;
      if (isDarkMagic || wpnDarkPct >= 0.5) {
        enemyArmor = 0; // Полное пробитие брони Чёрной Магией
      } else if (wpnDarkPct > 0) {
        enemyArmor = Math.max(0, Math.round(enemyArmor * (1 - wpnDarkPct)));
      }
      if (pierceBonus > 1) {
        enemyArmor = Math.max(0, enemyArmor - (pierceBonus - 1) * 2);
      }
      finalDamage = Math.max(1, finalDamage - enemyArmor);
    }

    enemy.hp -= finalDamage;
    enemy.hurtTimer = 0.2;
    enemy.state = 'hurt';

    const pushForce = enemy.isBoss ? 40 : isFinisher ? 220 : 150;
    enemy.vx += Math.cos(pushAngle) * pushForce;
    enemy.vy += Math.sin(pushAngle) * pushForce;

    if (isCrit || isFinisher || enemy.isBoss) {
      this.hitStopTimer = 0.035;
    }

    this.audio.playHit();
    this.particles.push(
      ...createBloodParticles(enemy.x, enemy.y, enemy.type === 'zombie_runner' ? '#84cc16' : '#dc2626')
    );

    this.addDecal(enemy.x, enemy.y, 'blood', enemy.type === 'zombie_runner' ? '#65a30d' : '#991b1b');

    this.floatingTexts.push(
      createFloatingText(
        enemy.x,
        enemy.y,
        isCrit ? `КРИТ! ${finalDamage}` : `${finalDamage}`,
        isCrit ? '#ffd700' : '#ffffff',
        isCrit ? 15 : 12
      )
    );

    if (Math.random() < this.player.lifestealChance && this.player.hp < this.player.maxHp) {
      this.player.hp = Math.min(this.player.hp + 1, this.player.maxHp);
      this.audio.playBite();
      this.floatingTexts.push(
        createFloatingText(this.playerPos.x, this.playerPos.y, '+1 HP', '#4ade80', 11)
      );
    }

    if (enemy.hp <= 0) {
      this.killEnemy(enemy);
    }
  }

  private killEnemy(enemy: Enemy) {
    if (enemy.isDead) return;
    enemy.isDead = true;
    enemy.state = 'death';
    enemy.deathTimer = 0.55;
    this.totalKills++;

    this.addScreenShake(enemy.isBoss ? 0.45 : 0.12, enemy.isBoss ? 8 : 3);

    // Charge Ultimate
    const chargeVal = enemy.isBoss ? 25 : enemy.isElite ? 12 : 5;
    this.player.ultimateCharge = Math.min(100, (this.player.ultimateCharge || 0) + chargeVal);

    // Relic: Black Hole Singularity
    if (this.player.relics.some((r) => r?.id === 'black_hole') && (Math.random() < 0.35 || enemy.isBoss)) {
      this.blackHoles.push({
        id: Date.now() + Math.random(),
        x: enemy.x,
        y: enemy.y,
        radius: 120,
        duration: 3.5,
        maxDuration: 3.5,
        pullForce: 180,
        damage: 30,
        damageInterval: 0.35,
        damageTimer: 0,
      });
      this.callbacks.onNotify('🕳️ СИНГУЛЯРНОСТЬ ЗАТЯГИВАЕТ ВРАГОВ!');
    }

    // Relic: Blood Crown - 8 radial blood thorns
    if (this.player.relics.some((r) => r?.id === 'blood_crown')) {
      for (let i = 0; i < 8; i++) {
        const ba = (i / 8) * Math.PI * 2;
        this.projectiles.push({
          id: Math.random(),
          x: enemy.x,
          y: enemy.y,
          vx: Math.cos(ba) * 280,
          vy: Math.sin(ba) * 280,
          radius: 4,
          damage: 32,
          fromPlayer: true,
          color: '#ef4444',
          trailColor: '#991b1b',
          life: 0,
          maxLife: 1.2,
          piercing: true,
          pierceCount: 2,
          hitEnemyIds: new Set(),
        });
      }
    }


    if (this.player.toxicRupture) {
      this.particles.push(...createBloodParticles(enemy.x, enemy.y, '#84cc16'));
      for (const other of this.enemies) {
        if (!other.isDead && Math.hypot(other.x - enemy.x, other.y - enemy.y) < 60) {
          other.hp -= 20;
          this.floatingTexts.push(createFloatingText(other.x, other.y, 'ЯД 20', '#a3e635', 11));
          if (other.hp <= 0) this.killEnemy(other);
        }
      }
    }

    const luckVal = this.currentMeta.lootLuck || 0;
    const metaGreed = (this.currentMeta.greedMastery || 0) * 0.25;
    const metaLootLuck = luckVal * 0.35;
    const dropMultiplier = (this.player.perks.includes('gravedigger_greed') ? 1.6 : 1.0) * (1 + metaGreed);
    const coinCount = Math.round((enemy.isBoss ? 16 : 2 + Math.random() * 3) * dropMultiplier);

    for (let c = 0; c < coinCount; c++) {
      this.items.push(createDrop('coin', enemy.x, enemy.y, 5));
    }

    const blueCoinChance = 0.28 + (this.currentMeta.greedMastery || 0) * 0.12 + (this.currentMeta.lootLuck || 0) * 0.08;
    if (enemy.isBoss || Math.random() < blueCoinChance) {
      this.items.push(createDrop('blue_coin', enemy.x, enemy.y, 1));
    }

    // Vampiric bloodline perk: heal 1 HP on kill
    if (this.player.perks.includes('vampiric_bloodline')) {
      this.player.hp = Math.min(this.player.maxHp, this.player.hp + 1);
    }

    // Bonus souls from weapon affix
    if (this.player.equippedWeapon.bonusSouls && Math.random() < 0.45) {
      this.items.push(createDrop('blue_coin', enemy.x, enemy.y, 1));
    }

    if (enemy.isBoss || Math.random() < 0.18) {
      const potTypes: Array<'potion_hp' | 'potion_speed' | 'potion_power'> = [
        'potion_hp',
        'potion_speed',
        'potion_power',
      ];
      this.items.push(
        createDrop(potTypes[Math.floor(Math.random() * potTypes.length)], enemy.x, enemy.y, 1)
      );
    }

    const xpVal = enemy.isBoss ? 60 : enemy.isElite ? 18 : 5;
    this.items.push(createDrop('xp_gem', enemy.x, enemy.y, xpVal));

    // Loot drops in Diablo style!
    const dropRoll = Math.random();
    if (enemy.isBoss) {
      this.groundWeapons.push({
        id: Math.random(),
        weapon: generateRandomWeapon(this.player.floor, 'wand', 'legendary', true, this.currentDifficulty, this.currentMeta.lootLuck || 0),
        x: enemy.x - 16,
        y: enemy.y,
        bobTimer: Math.random() * Math.PI * 2,
      });
      this.groundScrolls.push({
        id: Math.random(),
        scroll: generateRandomScroll(),
        x: enemy.x + 16,
        y: enemy.y,
        bobTimer: Math.random() * Math.PI * 2,
      });
    } else if (enemy.name.includes('СТРАЖ')) {
      // Гарантированная награда за победу над Мини-Боссом!
      this.groundWeapons.push({
        id: Math.random(),
        weapon: generateRandomWeapon(
          this.player.floor,
          undefined,
          Math.random() < 0.5 ? 'legendary' : 'epic',
          true,
          this.currentDifficulty,
          this.currentMeta.lootLuck || 0
        ),
        x: enemy.x - 12,
        y: enemy.y,
        bobTimer: Math.random() * Math.PI * 2,
      });
      this.groundScrolls.push({
        id: Math.random(),
        scroll: generateRandomScroll(),
        x: enemy.x + 12,
        y: enemy.y,
        bobTimer: Math.random() * Math.PI * 2,
      });
    } else if (enemy.isElite) {
      // 55% шанс выпадения оружия с Элиты
      if (dropRoll < 0.55) {
        this.groundWeapons.push({
          id: Math.random(),
          weapon: generateRandomWeapon(
            this.player.floor,
            undefined,
            Math.random() < 0.35 ? 'epic' : 'rare',
            true,
            this.currentDifficulty,
            luckVal
          ),
          x: enemy.x,
          y: enemy.y,
          bobTimer: Math.random() * Math.PI * 2,
        });
      } else if (dropRoll < 0.85) {
        this.groundScrolls.push({
          id: Math.random(),
          scroll: generateRandomScroll(),
          x: enemy.x,
          y: enemy.y,
          bobTimer: Math.random() * Math.PI * 2,
        });
      }
    } else if (dropRoll < 0.020 * (1 + metaLootLuck)) {
      // Обычные мобы: шанс всего ~2% (лут редкий, ценный и не захламляет коридоры)
      this.groundWeapons.push({
        id: Math.random(),
        weapon: generateRandomWeapon(this.player.floor, undefined, undefined, false, this.currentDifficulty, luckVal),
        x: enemy.x,
        y: enemy.y,
        bobTimer: Math.random() * Math.PI * 2,
      });
    } else if (dropRoll < 0.035 * (1 + metaLootLuck)) {
      this.groundScrolls.push({
        id: Math.random(),
        scroll: generateRandomScroll(),
        x: enemy.x,
        y: enemy.y,
        bobTimer: Math.random() * Math.PI * 2,
      });
    }

    if (enemy.isBoss) {
      this.currentBoss = null;
      this.audio.setBossMode(false);
      this.callbacks.onNotify('ВЛАДЫКА СКЛЕПА ПОВЕРЖЕН!');
    }
  }

  private hitCrate(crate: DestructibleCrate, damage: number) {
    crate.hp -= damage;
    this.audio.playVaseSmash();
    this.particles.push(...createVaseShatterParticles(crate.x, crate.y));
    this.floatingTexts.push(
      createFloatingText(crate.x, crate.y, `-${damage}`, '#d97706', 11)
    );

    if (crate.hp <= 0) {
      crate.broken = true;
      this.addScreenShake(0.15, 3);
      this.addDecal(crate.x, crate.y, 'shard', '#78350f');
      const rand = Math.random();
      if (rand < 0.45) {
        this.items.push(createDrop('coin', crate.x, crate.y, 5));
        this.items.push(createDrop('coin', crate.x, crate.y, 5));
      } else if (rand < 0.7) {
        this.items.push(createDrop('blue_coin', crate.x, crate.y, 1));
      } else if (rand < 0.85) {
        this.items.push(createDrop('potion_hp', crate.x, crate.y, 1));
      }
      if (Math.random() < 0.03) {
        if (Math.random() < 0.5) {
          this.groundWeapons.push({
            id: Math.random(),
            weapon: generateRandomWeapon(this.player.floor),
            x: crate.x,
            y: crate.y,
            bobTimer: Math.random() * Math.PI * 2,
          });
        } else {
          this.groundScrolls.push({
            id: Math.random(),
            scroll: generateRandomScroll(),
            x: crate.x,
            y: crate.y,
            bobTimer: Math.random() * Math.PI * 2,
          });
        }
      }
    }
  }

  private smashVase(vase: Vase) {
    vase.broken = true;
    this.audio.playVaseSmash();
    this.particles.push(...createVaseShatterParticles(vase.x, vase.y));
    this.addDecal(vase.x, vase.y, 'shard', '#8d5b4c');

    if (vase.contents === 'coins') {
      for (let i = 0; i < 3; i++) {
        this.items.push(createDrop('coin', vase.x, vase.y, 5));
      }
    } else if (vase.contents === 'blue_coin') {
      this.items.push(createDrop('blue_coin', vase.x, vase.y, 1));
    } else if (vase.contents === 'potion') {
      this.items.push(createDrop('potion_hp', vase.x, vase.y, 1));
    }
  }

  private addDecal(x: number, y: number, type: 'blood' | 'shard' | 'scorch', color: string) {
    if (this.map.decals.length > 100) {
      this.map.decals.shift();
    }
    this.map.decals.push({
      x,
      y,
      type,
      color,
      size: 4 + Math.random() * 5,
      angle: Math.random() * Math.PI * 2,
    });
  }

  // -------------------------------------------------------------
  // ПРОГРЕССИВНАЯ ЭВОЛЮЦИЯ МОБОВ (КАЖДЫЕ 3 МИНУТЫ)
  // -------------------------------------------------------------
  private triggerMobEvolution() {
    const candidates = this.enemies.filter((e) => !e.isDead && !e.isBoss);
    if (candidates.length === 0) return;

    // Выбираем 1 или 2 мобов для мутации
    const count = Math.min(candidates.length, Math.random() < 0.5 ? 1 : 2);
    candidates.sort(() => Math.random() - 0.5);

    for (let i = 0; i < count; i++) {
      const e = candidates[i];
      e.isEvolved = true;
      e.evolutionTier = (e.evolutionTier || 0) + 1;

      if (e.type === 'zombie_walker') {
        e.type = Math.random() < 0.5 ? 'zombie_runner' : 'zombie_brute';
        e.name = e.type === 'zombie_runner' ? '★ [МУТАЦИЯ]: Теневой Спринтер' : '★ [МУТАЦИЯ]: Чумной Громила';
        e.scale = e.type === 'zombie_brute' ? 1.4 : 1.1;
      } else if (e.type === 'zombie_spitter') {
        e.type = 'zombie_witch';
        e.name = '★ [МУТАЦИЯ]: Некромантка Склепа';
        e.scale = 1.15;
      } else if (e.type === 'zombie_runner') {
        e.type = 'zombie_pyro';
        e.name = '★ [МУТАЦИЯ]: Пиромант Бездны';
        e.scale = 1.25;
      } else if (e.type === 'zombie_brute') {
        e.name = '★ [ЭВОЛЮЦИЯ]: ЧУМНОЙ ТИТАН БЕЗДНЫ';
        e.scale = 1.7;
        e.damage += 1;
      } else {
        e.name = `★ [ВЛАДЫКА ПУСТОТЫ]: ${e.name}`;
        e.scale = Math.min(2.0, e.scale * 1.25);
        e.damage += 1;
      }

      e.maxHp = Math.round(e.maxHp * 1.75 + 40);
      e.hp = e.maxHp;
      e.speed *= 1.12;

      // Эволюционировавший моб обретает Чёрный Щит
      e.hasDarkShield = true;
      e.darkShieldHp = Math.round(e.maxHp * 0.9 + 30);
      e.maxDarkShieldHp = e.darkShieldHp;

      for (let k = 0; k < 10; k++) {
        const a = Math.random() * Math.PI * 2;
        const spd = 50 + Math.random() * 80;
        this.particles.push({
          x: e.x,
          y: e.y,
          vx: Math.cos(a) * spd,
          vy: Math.sin(a) * spd,
          size: 3.5,
          color: '#c084fc',
          alpha: 1.0,
          life: 0,
          maxLife: 0.45,
        });
      }

      this.floatingTexts.push(
        createFloatingText(e.x, e.y - 18, '★ ТЁМНАЯ ЭВОЛЮЦИЯ! ★', '#e879f9', 14)
      );

      const minutes = Math.floor(this.floorTimer / 60);
      const alertMsg = `⚠️ [ТЁМНАЯ ЭВОЛЮЦИЯ | ${minutes} МИН]: Нежить мутировала в [${e.name}] с ЧЁРНЫМ ЩИТОМ!`;
      this.callbacks.onNotify(alertMsg);
      if (this.callbacks.onEvolutionNotify) {
        this.callbacks.onEvolutionNotify(alertMsg);
      }
    }

    this.audio.playDarkEvolutionRoar();
    this.addScreenShake(0.35, 6);
  }

  private fireSoulBolt(angle: number) {
    this.audio.playClawSlash();
    this.projectiles.push({
      id: Math.random(),
      x: this.playerPos.x,
      y: this.playerPos.y,
      vx: Math.cos(angle) * 230,
      vy: Math.sin(angle) * 230,
      radius: 6,
      damage: Math.round(this.player.damage * 1.3),
      fromPlayer: true,
      color: '#c084fc',
      trailColor: '#7e22ce',
      life: 0,
      maxLife: 2.0,
      piercing: false,
    });
  }

  private updateEnemies(dt: number) {
    if (this.timeFreezeTimer > 0) {
      // Time is frozen by Doomsday Watch / Ultimate
      return;
    }
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];

      if (e.isDead) {
        e.deathTimer -= dt;
        if (e.deathTimer <= 0) {
          this.enemies.splice(i, 1);
        }
        continue;
      }

      if (e.hurtTimer > 0) {
        e.hurtTimer -= dt;
        if (e.hurtTimer <= 0) e.state = 'idle';
      }

      if (e.attackTimer > 0) e.attackTimer -= dt;
      if (e.dodgeTimer && e.dodgeTimer > 0) e.dodgeTimer -= dt;
      if (e.telegraphTimer && e.telegraphTimer > 0) e.telegraphTimer -= dt;

      e.vx *= 0.88;
      e.vy *= 0.88;

      const dx = this.playerPos.x - e.x;
      const dy = this.playerPos.y - e.y;
      const dist = Math.hypot(dx, dy);

      // LOD 0 = Active (< 460px), 1 = Relaxed (460 - 820px), 2 = Sleeping (>= 820px)
      const lod = this.workerManager.getEnemyLod(e.id, dist);
      e.lodLevel = lod as 0 | 1 | 2;

      // LOD 2: Спящий режим мобов в дальних комнатах огромного данжа (0% нагрузки на CPU!)
      if (lod === 2 && !e.isBoss) {
        continue;
      }

      // Корректировка отталкивания толпы со 2-го ядра (Web Worker)
      const crowdVec = this.workerManager.getCrowdVector(e.id);
      if (crowdVec) {
        e.vx += crowdVec.vx;
        e.vy += crowdVec.vy;
      }

      // LOD 1: Средняя дистанция (соседняя комната) - симуляция раз в 4 кадра
      if (lod === 1 && !e.isBoss) {
        if (this.enemyAiTick % 4 !== e.id % 4) {
          continue;
        }
      }

      const detectRange = e.isBoss ? 480 : 250;

      // 1. УМНЫЙ ОПТИМИЗИРОВАННЫЙ AI: Уклонение только для спринтеров/элиты с дросселированием
      const canDodge = e.type === 'zombie_runner' || e.isElite;
      if (canDodge && (!e.dodgeTimer || e.dodgeTimer <= 0) && dist < 170 && (this.enemyAiTick % 6 === e.id % 6)) {
        const checkLimit = Math.min(this.projectiles.length, 12);
        for (let pi = 0; pi < checkLimit; pi++) {
          const p = this.projectiles[pi];
          if (!p.fromPlayer) continue;
          if (Math.abs(e.x - p.x) > 60 || Math.abs(e.y - p.y) > 60) continue;
          const pdist = Math.hypot(e.x - p.x, e.y - p.y);
          if (pdist < 65) {
            // Проверяем вектор движения снаряда в сторону врага
            const dot = (e.x - p.x) * p.vx + (e.y - p.y) * p.vy;
            if (dot > 0) {
              const plen = Math.hypot(p.vx, p.vy) || 1;
              const perpX = -p.vy / plen;
              const perpY = p.vx / plen;
              const side = Math.random() < 0.5 ? 1 : -1;
              const dodgeSpeed = e.type === 'zombie_runner' ? 220 : 150;
              e.vx += perpX * side * dodgeSpeed;
              e.vy += perpY * side * dodgeSpeed;
              e.dodgeTimer = e.dodgeCooldown || (2.2 + Math.random() * 1.5);
              this.floatingTexts.push(
                createFloatingText(e.x, e.y, 'УВОРОТ!', '#38bdf8', 11)
              );
              break;
            }
          }
        }
      }

      // Активация фазы Чёрного Щита у боссов
      if (e.isBoss && !e.hasDarkShield && e.hp < e.maxHp * 0.5 && !e.isDead) {
        e.hasDarkShield = true;
        e.darkShieldHp = Math.round(e.maxHp * 0.45);
        e.maxDarkShieldHp = e.darkShieldHp;
        this.audio.playDarkEvolutionRoar();
        this.addScreenShake(0.4, 8);
        this.floatingTexts.push(
          createFloatingText(e.x, e.y - 24, '🛡️ ВЕЛИКИЙ ЧЁРНЫЙ ЩИТ!', '#c084fc', 16)
        );
        this.callbacks.onNotify('👑 ВЛАДЫКА ВОЗДВИГ ЧЁРНЫЙ ЩИТ БЕЗДНЫ! ИСПОЛЬЗУЙТЕ ЧЁРНУЮ МАГИЮ ИЛИ СВЕРХНАВЫКИ!');
      }

      // 2. Движение с тактическим позиционированием
      if (dist < detectRange && dist > 14) {
        let dirX = dx / dist;
        let dirY = dy / dist;

        // Тактическое удержание дистанции стрелками (плевун, ведьма, пиромант)
        if (e.preferredDistance && dist < e.preferredDistance) {
          // Отступаем назад и маневрируем вбок!
          const strafe = e.id % 2 === 0 ? 1 : -1;
          dirX = -dirX * 0.7 + (-dirY * strafe) * 0.7;
          dirY = -dirY * 0.7 + (dirX * strafe) * 0.7;
        } else if (e.preferredDistance && dist < e.preferredDistance + 45) {
          // Стрейфим вокруг игрока
          const strafe = e.id % 2 === 0 ? 1 : -1;
          const sx = -dirY * strafe;
          const sy = dirX * strafe;
          dirX = sx;
          dirY = sy;
        }

        const moveDx = (dirX * e.speed + e.vx) * dt;
        const moveDy = (dirY * e.speed + e.vy) * dt;
        this.moveEntityWithCollision(e, moveDx, moveDy, e.isBoss ? 16 : 6);

        if (Math.abs(dirX) > Math.abs(dirY)) {
          e.dir = dirX > 0 ? 1 : 3;
        } else {
          e.dir = dirY > 0 ? 0 : 2;
        }

        e.state = 'walk';

        // 3. Ближняя атака (удар лапами/когтями)
        if (dist <= 26 && e.attackTimer <= 0) {
          e.attackTimer = e.attackCooldown;
          this.damagePlayer(e.damage);
        }

        // 4. ОРУЖИЕ МОНСТРОВ: Использование уникальных дальнобойных атак и сфер
        if (e.rangedAttack && dist <= e.rangedAttack.range && dist > 30 && e.attackTimer <= 0) {
          e.attackTimer = e.attackCooldown || e.rangedAttack.cooldown;
          const aimAngle = Math.atan2(dy, dx);
          const r = e.rangedAttack;

          if (r.spreadCount && r.spreadCount > 1) {
            const half = (r.spreadCount - 1) / 2;
            for (let s = -half; s <= half; s++) {
              const spAngle = aimAngle + s * 0.22;
              this.projectiles.push({
                id: Math.random(),
                x: e.x,
                y: e.y,
                vx: Math.cos(spAngle) * r.speed,
                vy: Math.sin(spAngle) * r.speed,
                radius: r.radius,
                damage: r.damage,
                fromPlayer: false,
                color: r.color,
                trailColor: r.trailColor,
                life: 0,
                maxLife: 2.8,
                isMagicOrb: r.isOrb,
              });
            }
          } else {
            this.projectiles.push({
              id: Math.random(),
              x: e.x,
              y: e.y,
              vx: Math.cos(aimAngle) * r.speed,
              vy: Math.sin(aimAngle) * r.speed,
              radius: r.radius,
              damage: r.damage,
              fromPlayer: false,
              color: r.color,
              trailColor: r.trailColor,
              life: 0,
              maxLife: 3.2,
              isMagicOrb: r.isOrb,
              homing: r.homing,
            });
          }
        }
      } else if (Math.hypot(e.vx, e.vy) > 0.1) {
        this.moveEntityWithCollision(e, e.vx * dt, e.vy * dt, e.isBoss ? 16 : 6);
      }

      e.animTimer += dt;
      if (e.animTimer >= 0.1) {
        e.animTimer = 0;
        e.frame = (e.frame + 1) % 8;
      }
    }
  }

  public damagePlayer(damage: number) {
    if (this.player.invulnerableTimer > 0) return;
    if (this.player.isDashing) return;

    if (this.player.hasAegisShield && this.player.aegisShieldTimer <= 0) {
      this.player.aegisShieldTimer = 14.0;
      this.floatingTexts.push(
        createFloatingText(this.playerPos.x, this.playerPos.y, '🔰 ЭГИДА: УДАР БЛОКИРОВАН!', '#ffd700', 14)
      );
      this.particles.push(...createSparkleParticles(this.playerPos.x, this.playerPos.y, '#ffd700'));
      this.audio.playVictory();
      return;
    }

    const finalDamage = Math.max(1, damage - this.player.armor);
    this.player.hp = Math.max(0, this.player.hp - finalDamage);
    this.player.invulnerableTimer = 0.5;

    this.audio.playHit();
    this.addScreenShake(0.2, 5);
    this.particles.push(...createBloodParticles(this.playerPos.x, this.playerPos.y, '#ef4444'));

    this.floatingTexts.push(
      createFloatingText(this.playerPos.x, this.playerPos.y, `-${finalDamage} HP`, '#ef4444', 13)
    );

    if (this.player.hp <= 0) {
      this.handlePlayerDeath();
    }
  }

  private handlePlayerDeath() {
    this.audio.playBite();
    this.isPaused = true;
    this.callbacks.onGameOver({
      floor: this.player.floor,
      kills: this.totalKills,
      gold: this.player.gold,
      blueCoins: this.player.blueCoins,
    });
  }

  private updateProjectiles(dt: number) {
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      p.life += dt;

      if (p.homing && p.fromPlayer) {
        let closest: Enemy | null = null;
        let cdist = 220;
        const targetId = this.workerManager.getNearestTarget(p.id);
        if (targetId) {
          closest = this.enemies.find((e) => e.id === targetId && !e.isDead) || null;
        }
        if (!closest) {
          for (const e of this.enemies) {
            if (e.isDead || e.lodLevel === 2) continue;
            if (Math.abs(e.x - p.x) > cdist || Math.abs(e.y - p.y) > cdist) continue;
            const d = Math.hypot(e.x - p.x, e.y - p.y);
            if (d < cdist) {
              cdist = d;
              closest = e;
            }
          }
        }
        if (closest) {
          const hx = closest.x - p.x;
          const hy = closest.y - p.y;
          const hlen = Math.hypot(hx, hy) || 1;
          p.vx += (hx / hlen) * 420 * dt;
          p.vy += (hy / hlen) * 420 * dt;
        }
      } else if (p.homing && !p.fromPlayer) {
        // Вражеские самонаводящиеся сферы некромантки плавно летят к игроку
        const hx = this.playerPos.x - p.x;
        const hy = this.playerPos.y - p.y;
        const hlen = Math.hypot(hx, hy) || 1;
        p.vx += (hx / hlen) * 160 * dt;
        p.vy += (hy / hlen) * 160 * dt;
      }

      p.x += p.vx * dt;
      p.y += p.vy * dt;

      if (Math.random() < 0.15 && this.particles.length < 160) {
        this.particles.push({
          x: p.x,
          y: p.y,
          vx: (Math.random() - 0.5) * 10,
          vy: (Math.random() - 0.5) * 10,
          size: 2,
          color: p.trailColor,
          alpha: 0.8,
          life: 0,
          maxLife: 0.25,
        });
      }

      const tx = Math.floor(p.x / 16);
      const ty = Math.floor(p.y / 16);
      if (
        ty >= 0 &&
        ty < this.map.height &&
        tx >= 0 &&
        tx < this.map.width &&
        !isWalkable(this.map.tiles[ty][tx])
      ) {
        this.projectiles.splice(i, 1);
        continue;
      }

      if (p.fromPlayer) {
        if (!p.hitEnemyIds) p.hitEnemyIds = new Set();
        for (const enemy of this.enemies) {
          if (
            !enemy.isDead &&
            enemy.lodLevel !== 2 &&
            !p.hitEnemyIds.has(enemy.id) &&
            Math.abs(enemy.x - p.x) < 32 &&
            Math.abs(enemy.y - p.y) < 32 &&
            Math.hypot(enemy.x - p.x, enemy.y - p.y) < enemy.radius + p.radius
          ) {
            p.hitEnemyIds.add(enemy.id);
            this.hitEnemy(
              enemy,
              p.damage,
              Math.atan2(p.vy, p.vx),
              false,
              p.isDarkMagic,
              p.darkMagicDamage || 0
            );
            this.particles.push(...createSparkleParticles(p.x, p.y, p.color));

            // Relic: Isaac's Tear - splits into 4 homing micro-orbs
            if (this.player.relics.some((r) => r?.id === 'isaac_tear') && !p.isSplitTear) {
              const splitAngles = [0, Math.PI / 2, Math.PI, (Math.PI * 3) / 2];
              for (const sa of splitAngles) {
                this.projectiles.push({
                  id: Math.random(),
                  x: p.x,
                  y: p.y,
                  vx: Math.cos(sa) * 230,
                  vy: Math.sin(sa) * 230,
                  radius: 5,
                  damage: Math.round(p.damage * 0.45),
                  fromPlayer: true,
                  color: '#38bdf8',
                  trailColor: '#0284c7',
                  life: 0,
                  maxLife: 1.4,
                  piercing: true,
                  pierceCount: 1,
                  hitEnemyIds: new Set(),
                  homing: true,
                  isSplitTear: true,
                });
              }
            }


            // Взрыв магических сфер по площади!
            if (p.explosive) {
              for (const other of this.enemies) {
                if (other !== enemy && !other.isDead && Math.hypot(other.x - p.x, other.y - p.y) < 55) {
                  this.hitEnemy(other, Math.round(p.damage * 0.65), Math.atan2(other.y - p.y, other.x - p.x));
                }
              }
              this.particles.push(...createSparkleParticles(p.x, p.y, '#f97316'));
            }

            // Гравитационная воронка (стягивание монстров)
            if (this.player.perks.includes('singularity') || (this.player.equippedWeapon.affixes && this.player.equippedWeapon.affixes.some((a) => a.type === 'pull'))) {
              for (const other of this.enemies) {
                if (!other.isDead) {
                  const odist = Math.hypot(other.x - p.x, other.y - p.y);
                  if (odist < 90 && odist > 5) {
                    other.vx -= ((other.x - p.x) / odist) * 120;
                    other.vy -= ((other.y - p.y) / odist) * 120;
                  }
                }
              }
            }

            if (p.pierceCount && p.pierceCount > 1) {
              p.pierceCount--;
            } else if (!p.piercing) {
              this.projectiles.splice(i, 1);
              break;
            }
          }
        }
      } else {
        if (Math.hypot(this.playerPos.x - p.x, this.playerPos.y - p.y) < 10 + p.radius) {
          this.damagePlayer(p.damage);
          this.projectiles.splice(i, 1);
          continue;
        }
      }

      if (p.life >= p.maxLife) {
        this.projectiles.splice(i, 1);
      }
    }
  }

  private updateItems(dt: number) {
    for (let i = this.items.length - 1; i >= 0; i--) {
      const item = this.items[i];
      item.x += item.vx * dt;
      item.y += item.vy * dt;
      item.vx *= 0.9;
      item.vy *= 0.9;

      item.animTimer += dt;
      if (item.animTimer >= 0.1) {
        item.animTimer = 0;
        item.frame = (item.frame + 1) % 8;
      }

      const dist = Math.hypot(this.playerPos.x - item.x, this.playerPos.y - item.y);
      const magnetRange = 75;

      if (dist < magnetRange) {
        item.magnetized = true;
        const speed = 210;
        item.vx = ((this.playerPos.x - item.x) / dist) * speed;
        item.vy = ((this.playerPos.y - item.y) / dist) * speed;
      }

      if (dist < 14) {
        this.collectItem(item);
        this.items.splice(i, 1);
      }
    }
  }

  private collectItem(item: ItemDrop) {
    if (item.type === 'coin') {
      this.player.gold += item.value;
      this.audio.playCoin();
      this.floatingTexts.push(
        createFloatingText(item.x, item.y, `+${item.value} 🪙`, '#fde047', 11)
      );
    } else if (item.type === 'blue_coin') {
      this.player.blueCoins += item.value;
      this.audio.playBlueCoin();
      this.floatingTexts.push(
        createFloatingText(item.x, item.y, `+${item.value} 💎`, '#38bdf8', 12)
      );
    } else if (item.type === 'potion_hp') {
      this.player.potions.hp++;
      this.audio.playPotion();
      this.floatingTexts.push(
        createFloatingText(item.x, item.y, '+1 Зелье Здоровья', '#f87171', 11)
      );
    } else if (item.type === 'potion_speed') {
      this.player.potions.speed++;
      this.audio.playPotion();
      this.floatingTexts.push(
        createFloatingText(item.x, item.y, '+1 Зелье Скорости', '#facc15', 11)
      );
    } else if (item.type === 'potion_power') {
      this.player.potions.power++;
      this.audio.playPotion();
      this.floatingTexts.push(
        createFloatingText(item.x, item.y, '+1 Зелье Мощи', '#fb923c', 11)
      );
    } else if (item.type === 'xp_gem') {
      this.addXp(item.value);
    }

    this.particles.push(...createSparkleParticles(item.x, item.y, '#ffd700'));
    this.syncStats();
  }

  public addXp(amount: number) {
    this.player.xp += amount;
    while (this.player.xp >= this.player.nextLevelXp) {
      this.player.xp -= this.player.nextLevelXp;
      this.player.level++;
      this.player.nextLevelXp = Math.round(this.player.nextLevelXp * 1.32 + 25);

      // Ощутимая и важная прокачка характеристик на каждом уровне!
      this.player.maxHp += 1;
      this.player.hp = Math.min(this.player.maxHp, this.player.hp + 2);
      this.recalculatePlayerStats();

      this.audio.playLevelUp();
      this.addScreenShake(0.2, 5);
      this.floatingTexts.push(
        createFloatingText(
          this.playerPos.x,
          this.playerPos.y,
          `⭐ УРОВЕНЬ ${this.player.level}! +ХП +УРОН +СКОРОСТЬ`,
          '#ffd700',
          15
        )
      );
      this.particles.push(...createSparkleParticles(this.playerPos.x, this.playerPos.y, '#ffd700'));

      this.isPaused = true;
      this.callbacks.onLevelUp();
    }
    this.syncStats();
  }

  public recalculatePlayerStats() {
    const wpn = this.player.equippedWeapon;
    if (!wpn) return;

    let dmg = wpn.bonusDamage + this.currentMeta.extraDamage;
    if (this.player.perks.includes('blood_pact')) dmg += 22;
    if (this.player.perks.includes('cleave_master')) dmg += 8;
    this.player.damage = dmg;

    this.player.attackCooldown = wpn.attackCooldown;
    this.player.attackRange = wpn.attackRange + (this.player.perks.includes('cleave_master') ? 18 : 0);

    let crit = 0.12 + wpn.bonusCritChance + this.currentMeta.critMastery * 0.04;
    if (this.player.perks.includes('reaper_edge')) crit += 0.25;
    this.player.critChance = Math.min(0.85, crit);
    this.player.critMult = wpn.bonusCritMult;

    let lifesteal = 0.08 + wpn.bonusLifesteal + this.currentMeta.vampireMastery * 0.05;
    if (this.player.perks.includes('vampiric_claws')) lifesteal += 0.22;
    this.player.lifestealChance = Math.min(0.60, lifesteal);

    
    // Relic Stat Bonuses & Synergies
    for (const relic of this.player.relics) {
      if (!relic || !relic.stats) continue;
      if (relic.stats.bonusDamage) dmg += relic.stats.bonusDamage;
      if (relic.stats.bonusCrit) crit += relic.stats.bonusCrit;
      if (relic.stats.bonusLifesteal) lifesteal += relic.stats.bonusLifesteal;
      if (relic.stats.bonusSpeed) this.player.speed += relic.stats.bonusSpeed;
    }

    const syn = evaluateSynergy(this.player.relics);
    this.player.activeSynergy = syn ? syn.name : null;
    if (syn?.id === 'isaac_awakening') {
      dmg += 20;
    }

    this.player.bonusLightRadius = wpn.bonusLightRadius + this.currentMeta.extraLight * 35;
    this.syncStats();
  }

  
  public equipRelic(slotIndex: number, newRelic: Relic, groundRelicId?: number): Relic | null {
    if (slotIndex < 0 || slotIndex >= this.player.relicSlotsCount) return null;
    const oldRelic = this.player.relics[slotIndex];
    this.player.relics[slotIndex] = newRelic;

    if (newRelic.stats?.bonusHp) {
      this.player.maxHp += newRelic.stats.bonusHp;
      this.player.hp += newRelic.stats.bonusHp;
    }
    if (oldRelic && oldRelic.stats?.bonusHp) {
      this.player.maxHp = Math.max(2, this.player.maxHp - oldRelic.stats.bonusHp);
      this.player.hp = Math.min(this.player.hp, this.player.maxHp);
    }

    if (groundRelicId !== undefined) {
      const gIdx = this.groundRelics.findIndex((gr) => gr.id === groundRelicId);
      if (gIdx !== -1) {
        if (oldRelic) {
          this.groundRelics[gIdx].relic = oldRelic;
        } else {
          this.groundRelics.splice(gIdx, 1);
        }
      }
    } else if (oldRelic) {
      this.groundRelics.push({
        id: Date.now() + Math.random(),
        relic: oldRelic,
        x: this.playerPos.x,
        y: this.playerPos.y,
        bobTimer: 0,
      });
    }

    this.recalculatePlayerStats();
    this.audio.playVictory();

    const syn = evaluateSynergy(this.player.relics);
    if (syn) {
      this.callbacks.onNotify(`${syn.name}: ${syn.desc}`);
      this.particles.push(...createSparkleParticles(this.playerPos.x, this.playerPos.y, syn.color));
      this.floatingTexts.push(
        createFloatingText(this.playerPos.x, this.playerPos.y, syn.name, syn.color, 16)
      );
    } else {
      this.callbacks.onNotify(`РЕЛИКВИЯ В СЛОТЕ ${slotIndex + 1}: ${newRelic.name}!`);
      this.floatingTexts.push(
        createFloatingText(this.playerPos.x, this.playerPos.y, `РЕЛИКВИЯ: ${newRelic.name}`, '#f59e0b', 14)
      );
    }

    this.syncStats();
    return oldRelic;
  }

  public triggerUltimate() {
    if (this.player.ultimateCharge < 100 && !this.player.isUltimateActive) {
      this.callbacks.onNotify('УЛЬТА ЕЩЁ ЗАРЯЖАЕТСЯ!');
      return;
    }

    this.player.ultimateCharge = 0;
    this.player.isUltimateActive = true;
    this.player.ultimateTimer = 4.0;
    this.timeFreezeTimer = 4.0;
    this.audio.playVictory();
    this.addScreenShake(0.5, 12);

    const syn = evaluateSynergy(this.player.relics);
    const ultName = syn ? syn.name : '⚡ СУДНЫЙ ДЕНЬ: ВРЕМЯ ОСТАНОВЛЕНО!';
    this.callbacks.onNotify(ultName);
    this.floatingTexts.push(
      createFloatingText(this.playerPos.x, this.playerPos.y, ultName, '#38bdf8', 16)
    );

    for (const e of this.enemies) {
      if (!e.isDead) {
        e.hp -= 120;
        e.hurtTimer = 0.4;
        this.particles.push(...createSparkleParticles(e.x, e.y, '#38bdf8'));
        this.floatingTexts.push(
          createFloatingText(e.x, e.y, '⚡ 120 УЛЬТА', '#38bdf8', 15)
        );
        if (e.hp <= 0) this.killEnemy(e);
      }
    }

    if (syn?.id === 'event_horizon') {
      this.blackHoles.push({
        id: Date.now(),
        x: this.playerPos.x,
        y: this.playerPos.y,
        radius: 190,
        duration: 5.0,
        maxDuration: 5.0,
        pullForce: 300,
        damage: 40,
        damageInterval: 0.25,
        damageTimer: 0,
      });
    }

    if (this.callbacks.onUltimateTrigger) {
      this.callbacks.onUltimateTrigger(ultName);
    }
  }

  public equipGroundWeapon(weapon: Weapon) {
    const idx = this.groundWeapons.findIndex((w) => w.weapon.id === weapon.id);
    if (idx !== -1) {
      const gw = this.groundWeapons[idx];
      const oldWeapon = this.player.equippedWeapon;
      this.player.equippedWeapon = gw.weapon;
      gw.weapon = oldWeapon;
      this.recalculatePlayerStats();
      this.audio.playVictory();
      this.particles.push(...createSparkleParticles(this.playerPos.x, this.playerPos.y, RARITY_COLORS[this.player.equippedWeapon.rarity].main));
      this.floatingTexts.push(
        createFloatingText(this.playerPos.x, this.playerPos.y, `ЭКИПИРОВАНО: ${this.player.equippedWeapon.name}!`, RARITY_COLORS[this.player.equippedWeapon.rarity].main, 14)
      );
    }
  }

  private updateProps(dt: number) {
    for (const t of this.map.torches) {
      t.animTimer += dt;
      if (t.animTimer >= 0.1) {
        t.animTimer = 0;
        t.frame = (t.frame + 1) % 8;
      }
    }

    for (const v of this.map.vases) {
      if (!v.broken) {
        v.animTimer += dt;
        if (v.animTimer >= 0.12) {
          v.animTimer = 0;
          v.frame = (v.frame + 1) % 16;
        }
      }
    }
  }

  private updateTraps(dt: number) {
    for (const trap of this.map.traps) {
      trap.timer += dt;
      if (trap.state === 'dormant') {
        if (trap.timer >= 2.0) {
          trap.state = 'warning';
          trap.timer = 0;
          this.audio.playTrapClick();
        }
      } else if (trap.state === 'warning') {
        if (trap.timer >= 0.6) {
          trap.state = 'active';
          trap.timer = 0;
          this.audio.playSpikeStab();
        }
      } else if (trap.state === 'active') {
        const px = Math.floor(this.playerPos.x / 16);
        const py = Math.floor(this.playerPos.y / 16);
        if (px === trap.tileX && py === trap.tileY && !this.player.isDashing) {
          this.damagePlayer(1);
        }

        for (const e of this.enemies) {
          if (!e.isDead) {
            const ex = Math.floor(e.x / 16);
            const ey = Math.floor(e.y / 16);
            if (ex === trap.tileX && ey === trap.tileY) {
              e.hp -= 15;
              this.floatingTexts.push(createFloatingText(e.x, e.y, 'ШИПЫ 15', '#94a3b8', 11));
              if (e.hp <= 0) this.killEnemy(e);
            }
          }
        }

        if (trap.timer >= 1.2) {
          trap.state = 'dormant';
          trap.timer = 0;
        }
      }
    }
  }

  private updateChallenge(dt: number) {
    const ch = this.map.challenge;
    if (!ch || !ch.active || ch.cleared) return;

    const aliveInRoom = this.enemies.filter(
      (e) => !e.isDead && e.roomIndex === ch.roomIndex
    ).length;

    if (aliveInRoom === 0) {
      if (ch.wave < ch.maxWaves) {
        ch.wave++;
        this.callbacks.onNotify(`ВОЛНА ${ch.wave}/${ch.maxWaves}!`);
        const cRoom = this.map.rooms[ch.roomIndex];
        const newWave = spawnEnemiesForRoom(cRoom, this.player.floor + 1);
        this.enemies.push(...newWave);
      } else {
        ch.cleared = true;
        ch.active = false;
        this.audio.playFountainHeal();
        this.callbacks.onNotify('ИСПЫТАНИЕ ПРОЙДЕНО! СУНДУК СОКРОВИЩ!');

        for (let i = 0; i < 14; i++) {
          this.items.push(createDrop('coin', ch.totemX, ch.totemY, 5));
        }
        this.items.push(createDrop('blue_coin', ch.totemX, ch.totemY, 2));
        this.items.push(createDrop('potion_power', ch.totemX, ch.totemY, 1));
      }
    }
  }

  private updateParticles(dt: number) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life += dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.gravity) p.vy += p.gravity * dt;
      p.alpha = 1 - p.life / p.maxLife;

      if (p.life >= p.maxLife) {
        this.particles.splice(i, 1);
      }
    }
  }

  private updateFloatingTexts(dt: number) {
    for (let i = this.floatingTexts.length - 1; i >= 0; i--) {
      const t = this.floatingTexts[i];
      t.life += dt;
      t.y += t.vy * dt;
      t.alpha = 1 - t.life / t.maxLife;

      if (t.life >= t.maxLife) {
        this.floatingTexts.splice(i, 1);
      }
    }
  }

  private updateCamera(dt: number) {
    this.camera.targetX = this.playerPos.x;
    this.camera.targetY = this.playerPos.y;

    this.camera.x += (this.camera.targetX - this.camera.x) * 8 * dt;
    this.camera.y += (this.camera.targetY - this.camera.y) * 8 * dt;

    if (this.screenShake.duration > 0) {
      this.screenShake.duration -= dt;
      this.screenShake.x = (Math.random() - 0.5) * this.screenShake.intensity * 2;
      this.screenShake.y = (Math.random() - 0.5) * this.screenShake.intensity * 2;
    } else {
      this.screenShake.x = 0;
      this.screenShake.y = 0;
    }
  }

  public addScreenShake(duration: number, intensity: number) {
    this.screenShake.duration = duration;
    this.screenShake.intensity = intensity;
  }

  private updateFogOfWar() {
    const tileX = Math.floor(this.playerPos.x / 16);
    const tileY = Math.floor(this.playerPos.y / 16);

    const radius = 6 + (this.currentMeta.extraLight > 0 ? 2 : 0);
    for (
      let y = Math.max(0, tileY - radius);
      y <= Math.min(this.map.height - 1, tileY + radius);
      y++
    ) {
      for (
        let x = Math.max(0, tileX - radius);
        x <= Math.min(this.map.width - 1, tileX + radius);
        x++
      ) {
        if (Math.hypot(x - tileX, y - tileY) <= radius) {
          if (!this.map.discovered[y][x]) {
            this.map.discovered[y][x] = true;
            this.minimapDirty = true;
          }
        }
      }
    }
  }

  private checkInteractions() {
    let prompt: string | null = null;

    // 0. Ground Relics interaction (Isaac style modal)
    for (let i = 0; i < this.groundRelics.length; i++) {
      const gr = this.groundRelics[i];
      const dist = Math.hypot(this.playerPos.x - gr.x, this.playerPos.y - gr.y);
      if (dist < 38) {
        prompt = `[E] РЕЛИКВИЯ: ${gr.relic.name} [${gr.relic.rarity.toUpperCase()}]`;
        if (this.keys.has('KeyE') || this.keys.has('KeyF')) {
          this.keys.delete('KeyE');
          this.keys.delete('KeyF');
          if (this.callbacks.onRelicFound) {
            this.callbacks.onRelicFound(gr);
          }
        }
        break;
      }
    }

    let hoveredWeapon: Weapon | null = null;
    let hoveredEquipped: Weapon | null = null;

    // 1. Ground Weapons interaction (Diablo style with Star Infusion!)
    for (let i = 0; i < this.groundWeapons.length; i++) {
      const gw = this.groundWeapons[i];
      const dist = Math.hypot(this.playerPos.x - gw.x, this.playerPos.y - gw.y);
      if (dist < 38) {
        hoveredWeapon = gw.weapon;
        hoveredEquipped = this.player.equippedWeapon;
        const risks = getStarRisks(this.player.equippedWeapon.stars || 0, this.currentMeta.starAffinity || 0);
        let riskWarning = 'Безопасно 100%';
        if ((this.player.equippedWeapon.stars || 0) > 0) {
          riskWarning = `Сброс: ${Math.round(risks.resetChance * 100)}%, Поломка: ${(risks.breakChance * 100).toFixed(1)}%`;
        }
        const starGainText =
          gw.weapon.rarity === 'legendary' ? '+2★' : gw.weapon.rarity === 'epic' ? '+1★' : '+XP';
        prompt = `[E] ВЗЯТЬ: ${gw.weapon.name} | [F] В ЗВЁЗДЫ ⭐ (${starGainText} • ${riskWarning})`;

        if (this.keys.has('KeyE')) {
          this.keys.delete('KeyE');

          const oldWpn = this.player.equippedWeapon;
          this.player.equippedWeapon = gw.weapon;
          this.recalculatePlayerStats();

          // Swap weapon onto ground
          gw.weapon = oldWpn;

          this.audio.playVictory();
          this.particles.push(
            ...createSparkleParticles(
              this.playerPos.x,
              this.playerPos.y,
              RARITY_COLORS[this.player.equippedWeapon.rarity].main
            )
          );
          const starStr = this.player.equippedWeapon.stars > 0 ? ` [⭐x${this.player.equippedWeapon.stars}]` : '';
          this.floatingTexts.push(
            createFloatingText(
              this.playerPos.x,
              this.playerPos.y,
              `ЭКИПИРОВАНО: ${this.player.equippedWeapon.name}${starStr}!`,
              RARITY_COLORS[this.player.equippedWeapon.rarity].main,
              14
            )
          );
          break;
        }

        if (this.keys.has('KeyF')) {
          this.keys.delete('KeyF');

          const starAffinityBonus = (this.currentMeta.starAffinity || 0);
          const res = infuseWeaponWithStarXp(
            this.player.equippedWeapon,
            gw.weapon,
            starAffinityBonus,
            this.currentHeroClass
          );
          this.groundWeapons.splice(i, 1);

          if (res.outcome === 'broken') {
            this.player.equippedWeapon = res.upgradedWeapon;
            this.recalculatePlayerStats();
            this.audio.playHit();
            this.addScreenShake(0.35, 12);
            this.particles.push(...createVaseShatterParticles(this.playerPos.x, this.playerPos.y));
            this.floatingTexts.push(
              createFloatingText(this.playerPos.x, this.playerPos.y, '💥 РАЗРУШЕНО В ПЫЛЬ!', '#ef4444', 16)
            );
            this.callbacks.onNotify(
              '💥 КАТАСТРОФА! Оружие раскололось в пыль от звёздной энергии! В руках остался ржавый обломок!'
            );
          } else if (res.outcome === 'reset') {
            this.recalculatePlayerStats();
            this.audio.playHit();
            this.addScreenShake(0.25, 8);
            this.particles.push(...createBloodParticles(this.playerPos.x, this.playerPos.y, '#f59e0b'));
            this.floatingTexts.push(
              createFloatingText(this.playerPos.x, this.playerPos.y, '⚠️ СБРОС ДО 0 ЗВЁЗД!', '#f59e0b', 15)
            );
            this.callbacks.onNotify(
              `⚠️ НЕУДАЧА ЗВЁЗДНОЙ КОВКИ! Энергия сорвалась, ${this.player.equippedWeapon.name} потеряло все звёзды!`
            );
          } else if (res.leveledUp) {
            this.recalculatePlayerStats();
            this.audio.playVictory();
            this.addScreenShake(0.22, 6);
            this.particles.push(...createSparkleParticles(this.playerPos.x, this.playerPos.y, '#facc15'));
            this.floatingTexts.push(
              createFloatingText(
                this.playerPos.x,
                this.playerPos.y,
                `⭐ +${res.starsGained} ЗВЕЗДА! (+${this.player.equippedWeapon.stars * 10}% статов)`,
                '#facc15',
                15
              )
            );
            this.callbacks.onNotify(
              `⭐ ЗВЁЗДНЫЙ ТРИУМФ! ${this.player.equippedWeapon.name} закалено до [⭐x${this.player.equippedWeapon.stars}] (+${this.player.equippedWeapon.stars * 10}% ко всем параметрам)!`
            );
          } else {
            this.recalculatePlayerStats();
            this.particles.push(...createSparkleParticles(this.playerPos.x, this.playerPos.y, '#facc15'));
            this.floatingTexts.push(
              createFloatingText(
                this.playerPos.x,
                this.playerPos.y,
                `⭐ +${res.xpGained} ЗВЁЗДНЫЙ EXP (${this.player.equippedWeapon.starXp}/${this.player.equippedWeapon.starMaxXp})`,
                '#facc15',
                12
              )
            );
          }
          break;
        }
        break;
      }
    }

    if (this.callbacks.onWeaponHover) {
      this.callbacks.onWeaponHover(hoveredWeapon, hoveredEquipped);
    }

    // 2. Ground Scrolls interaction
    if (!prompt) {
      for (let i = this.groundScrolls.length - 1; i >= 0; i--) {
        const gs = this.groundScrolls[i];
        const dist = Math.hypot(this.playerPos.x - gs.x, this.playerPos.y - gs.y);
        if (dist < 34) {
          prompt = `[E] СВИТОК: ${gs.scroll.name} (${gs.scroll.desc})`;
          if (this.keys.has('KeyE') || this.keys.has('KeyF')) {
            this.keys.delete('KeyE');
            this.keys.delete('KeyF');

            const res = applyScrollToWeapon(gs.scroll, this.player.equippedWeapon);
            this.recalculatePlayerStats();
            this.audio.playSpecialSkill();
            this.particles.push(...createSparkleParticles(this.playerPos.x, this.playerPos.y, gs.scroll.color));
            this.floatingTexts.push(
              createFloatingText(this.playerPos.x, this.playerPos.y, res.message, gs.scroll.color, 14)
            );
            this.callbacks.onNotify(res.message);
            this.groundScrolls.splice(i, 1);
          }
          break;
        }
      }
    }

    // Stairs
    const distStairs = Math.hypot(
      this.playerPos.x - (this.map.stairsPoint.x * 16 + 8),
      this.playerPos.y - (this.map.stairsPoint.y * 16 + 8)
    );
    if (distStairs < 20) {
      if (this.currentBoss && !this.currentBoss.isDead) {
        prompt = '🔒 ДВЕРЬ ЗАПЕРТА: ВЛАДЫКА СКЛЕПА ЖИВ!';
      } else {
        prompt = '[E] СПУСТИТЬСЯ НА СЛЕДУЮЩИЙ ЭТАЖ';
        if (this.keys.has('KeyE') || this.keys.has('KeyF')) {
          this.keys.delete('KeyE');
          this.keys.delete('KeyF');
          this.descendFloor();
        }
      }
    }

    // Chests
    for (const chest of this.map.chests) {
      if (chest.opened) continue;
      const dist = Math.hypot(this.playerPos.x - chest.x, this.playerPos.y - chest.y);
      if (dist < 26) {
        prompt = '[E] ОТКРЫТЬ СУНДУК СОКРОВИЩ';
        if (this.keys.has('KeyE') || this.keys.has('KeyF')) {
          this.keys.delete('KeyE');
          this.keys.delete('KeyF');
          chest.opened = true;
          this.audio.playVictory();

          for (let i = 0; i < 15; i++) {
            this.items.push(createDrop('coin', chest.x, chest.y, 5));
          }
          this.items.push(createDrop('blue_coin', chest.x, chest.y, 2));
          this.items.push(createDrop('potion_hp', chest.x, chest.y, 1));

          // Diablo weapon and scroll from chest!
          this.groundWeapons.push({
            id: Math.random(),
            weapon: generateRandomWeapon(this.player.floor, undefined, Math.random() < 0.4 ? 'legendary' : 'epic', true, this.currentDifficulty),
            x: chest.x - 14,
            y: chest.y + 10,
            bobTimer: Math.random() * Math.PI * 2,
          });
          this.groundScrolls.push({
            id: Math.random(),
            scroll: generateRandomScroll(),
            x: chest.x + 14,
            y: chest.y + 10,
            bobTimer: Math.random() * Math.PI * 2,
          });

          this.particles.push(...createSparkleParticles(chest.x, chest.y, '#ffd700'));
          this.floatingTexts.push(
            createFloatingText(chest.x, chest.y, 'СУНДУК ОТКРЫТ!', '#ffd700', 14)
          );

          // Free relic choice
          setTimeout(() => {
            this.isPaused = true;
            this.callbacks.onLevelUp();
          }, 400);
        }
      }
    }

    // Shrine
    for (const shrine of this.map.shrines) {
      if (shrine.used) continue;
      const dist = Math.hypot(this.playerPos.x - shrine.x, this.playerPos.y - shrine.y);
      if (dist < 26) {
        prompt = '[E] ПОМОЛИТЬСЯ У АЛТАРЯ';
        if (this.keys.has('KeyE') || this.keys.has('KeyF')) {
          this.keys.delete('KeyE');
          this.keys.delete('KeyF');
          this.useShrine(shrine);
        }
      }
    }

    // Fountain
    for (const f of this.map.fountains) {
      if (f.used) continue;
      const dist = Math.hypot(this.playerPos.x - f.x, this.playerPos.y - f.y);
      if (dist < 26) {
        prompt = '[E] ИСПИТЬ ИЗ КУПЕЛИ ЖИЗНИ';
        if (this.keys.has('KeyE') || this.keys.has('KeyF')) {
          this.keys.delete('KeyE');
          this.keys.delete('KeyF');
          f.used = true;
          this.audio.playFountainHeal();
          this.player.hp = this.player.maxHp;
          this.player.invulnerableTimer = 3.0;
          this.callbacks.onNotify('ИСТОЧНИК ИСЦЕЛИЛ ВАС ПОЛНОСТЬЮ!');
          this.particles.push(...createSparkleParticles(f.x, f.y, '#38bdf8'));
        }
      }
    }

    // Shopkeeper
    if (this.map.shop) {
      const distShop = Math.hypot(
        this.playerPos.x - this.map.shop.x,
        this.playerPos.y - this.map.shop.y
      );
      if (distShop < 30) {
        prompt = '[E] ТОРГОВАТЬ СО СПЕКТРАЛЬНЫМ ЛАВОЧНИКОМ';
        if (this.keys.has('KeyE') || this.keys.has('KeyF')) {
          this.keys.delete('KeyE');
          this.keys.delete('KeyF');
          if (this.callbacks.onShopOpen) {
            this.callbacks.onShopOpen(this.map.shop);
          }
        }
      }
    }

    // Challenge Totem
    if (this.map.challenge && !this.map.challenge.active && !this.map.challenge.cleared) {
      const ch = this.map.challenge;
      const distTotem = Math.hypot(this.playerPos.x - ch.totemX, this.playerPos.y - ch.totemY);
      if (distTotem < 30) {
        prompt = '[E] НАЧАТЬ ИСПЫТАНИЕ СКЛЕПА!';
        if (this.keys.has('KeyE') || this.keys.has('KeyF')) {
          this.keys.delete('KeyE');
          this.keys.delete('KeyF');
          ch.active = true;
          ch.wave = 1;
          this.audio.playChallengeStart();
          this.callbacks.onNotify('ИСПЫТАНИЕ НАЧАЛОСЬ: ВЫСТОЙТЕ 2 ВОЛНЫ!');
          const cRoom = this.map.rooms[ch.roomIndex];
          const newWave = spawnEnemiesForRoom(cRoom, this.player.floor + 1);
          this.enemies.push(...newWave);
        }
      }
    }

    if (this.callbacks.onPrompt) {
      this.callbacks.onPrompt(prompt);
    }
  }

  private descendFloor() {
    this.audio.playStairs();
    const nextFloor = this.player.floor + 1;

    // Campaign victory after Floor 10!
    if (this.player.gameMode === 'campaign' && nextFloor > 10) {
      this.isPaused = true;
      this.callbacks.onVictory({
        floor: this.player.floor,
        kills: this.totalKills,
        gold: this.player.gold,
        blueCoins: this.player.blueCoins,
      });
    } else {
      this.initFloor(nextFloor);
    }
  }

  private useShrine(shrine: { blessingType: string; used: boolean; x: number; y: number }) {
    shrine.used = true;
    this.audio.playShrine();

    if (shrine.blessingType === 'might') {
      this.player.damage += 4;
      this.callbacks.onNotify('БЛАГОСЛОВЕНИЕ: СИЛА УДАРА +4!');
    } else if (shrine.blessingType === 'vitality') {
      this.player.hp = this.player.maxHp;
      this.callbacks.onNotify('БЛАГОСЛОВЕНИЕ: ПОЛНОЕ ИСЦЕЛЕНИЕ!');
    } else if (shrine.blessingType === 'haste') {
      this.player.speed += 20;
      this.callbacks.onNotify('БЛАГОСЛОВЕНИЕ: СКОРОСТЬ +20!');
    } else if (shrine.blessingType === 'greed') {
      this.player.gold += 50;
      this.callbacks.onNotify('БЛАГОСЛОВЕНИЕ: +50 ЗОЛОТА!');
    }

    this.particles.push(...createSparkleParticles(shrine.x, shrine.y, '#38bdf8'));
    this.floatingTexts.push(
      createFloatingText(shrine.x, shrine.y, 'СВЯТИЛИЩЕ ОЧИЩЕНО', '#ffd700', 13)
    );
  }

  public moveEntityWithCollision(
    entity: { x: number; y: number },
    dx: number,
    dy: number,
    radius = 5.5
  ) {
    const dist = Math.hypot(dx, dy);
    if (dist <= 0) return;

    // Sub-stepping in max 3.5px increments to completely prevent tunneling through walls!
    const steps = Math.max(1, Math.ceil(dist / 3.5));
    const stepDx = dx / steps;
    const stepDy = dy / steps;

    for (let s = 0; s < steps; s++) {
      const nextX = entity.x + stepDx;
      if (this.canOccupy(nextX, entity.y, radius)) {
        entity.x = nextX;
      }

      const nextY = entity.y + stepDy;
      if (this.canOccupy(entity.x, nextY, radius)) {
        entity.y = nextY;
      }
    }
  }

  public canOccupy(px: number, py: number, r: number): boolean {
    const minTx = Math.floor((px - r) / 16);
    const maxTx = Math.floor((px + r) / 16);
    const minTy = Math.floor((py - r) / 16);
    const maxTy = Math.floor((py + r) / 16);

    for (let ty = minTy; ty <= maxTy; ty++) {
      for (let tx = minTx; tx <= maxTx; tx++) {
        if (ty < 0 || ty >= this.map.height || tx < 0 || tx >= this.map.width) {
          return false;
        }
        if (!isWalkable(this.map.tiles[ty][tx])) {
          return false;
        }
      }
    }

    if (this.map) {
      if (this.map.vases) {
        for (const v of this.map.vases) {
          if (!v.broken && Math.hypot(px - v.x, py - v.y) < r + 7) {
            return false;
          }
        }
      }
      if (this.map.crates) {
        for (const c of this.map.crates) {
          if (!c.broken && Math.hypot(px - c.x, py - c.y) < r + 8) {
            return false;
          }
        }
      }
    }

    return true;
  }

  // --- RENDER PIPELINE ---
  public render() {
    const w = this.canvas.width / (window.devicePixelRatio || 1);
    const h = this.canvas.height / (window.devicePixelRatio || 1);

    this.ctx.fillStyle = '#0a0d14';
    this.ctx.fillRect(0, 0, w, h);

    this.ctx.save();
    const zoom = this.camera.zoom;
    this.ctx.translate(w / 2 + this.screenShake.x, h / 2 + this.screenShake.y);
    this.ctx.scale(zoom, zoom);
    this.ctx.translate(-this.camera.x, -this.camera.y);

    this.renderTiles();
    this.renderDecals();
    this.renderProps();
    // Traps removed
    this.renderGroundWeapons();
    this.renderGroundScrolls();
    this.renderGroundRelics();
    this.renderBlackHoles();
    this.renderBrimstoneBeams();
    this.renderMeatCubes();
    this.renderGodheadAura();
    this.renderUltimateVisuals();
    this.renderItems();
    this.renderEnemies();
    this.renderPlayer();
    this.renderSlashAttack();
    this.renderProjectiles();
    this.renderParticles();
    this.renderFloatingTexts();
    this.renderHoveredWeaponTooltip();
    this.renderCrosshair();

    this.ctx.restore();

    this.renderLightingPass(w, h);

    // Auto-render minimap every frame
    if (this.minimapCanvas) {
      this.renderMinimap(this.minimapCanvas);
    }
  }

  private renderTiles() {
    const tilesImg = this.assets.tiles;
    const zoom = this.camera.zoom;
    const halfW = (this.canvas.width / zoom) / 2 + 32;
    const halfH = (this.canvas.height / zoom) / 2 + 32;
    const startX = Math.max(0, Math.floor((this.camera.x - halfW) / 16));
    const endX = Math.min(this.map.width, Math.ceil((this.camera.x + halfW) / 16));
    const startY = Math.max(0, Math.floor((this.camera.y - halfH) / 16));
    const endY = Math.min(this.map.height, Math.ceil((this.camera.y + halfH) / 16));

    for (let y = startY; y < endY; y++) {
      for (let x = startX; x < endX; x++) {
        const t = this.map.tiles[y][x];
        const px = x * 16;
        const py = y * 16;

        if (t === Tile.FLOOR) {
          this.ctx.drawImage(tilesImg, 5 * 16, 2 * 16, 16, 16, px, py, 16, 16);
        } else if (t === Tile.FLOOR_ALT) {
          this.ctx.drawImage(tilesImg, 6 * 16, 2 * 16, 16, 16, px, py, 16, 16);
        } else if (t === Tile.FLOOR_CRACK) {
          this.ctx.drawImage(tilesImg, 7 * 16, 2 * 16, 16, 16, px, py, 16, 16);
        } else if (t === Tile.SHOP_CARPET) {
          this.ctx.fillStyle = '#450a0a';
          this.ctx.fillRect(px, py, 16, 16);
          this.ctx.drawImage(tilesImg, 5 * 16, 2 * 16, 16, 16, px, py, 16, 16);
        } else if (t === Tile.WALL_FRONT) {
          this.ctx.drawImage(tilesImg, 2 * 16, 2 * 16, 16, 16, px, py, 16, 16);
        } else if (t === Tile.WALL_TOP) {
          this.ctx.drawImage(tilesImg, 2 * 16, 1 * 16, 16, 16, px, py, 16, 16);
        } else if (t === Tile.WALL_SIDE_L) {
          this.ctx.drawImage(tilesImg, 1 * 16, 2 * 16, 16, 16, px, py, 16, 16);
        } else if (t === Tile.WALL_SIDE_R) {
          this.ctx.drawImage(tilesImg, 4 * 16, 2 * 16, 16, 16, px, py, 16, 16);
        } else if (t === Tile.WATER || t === Tile.FOUNTAIN) {
          const f = Math.floor((performance.now() / 250) % 4);
          this.ctx.drawImage(this.assets.water, f * 16, 0, 16, 16, px, py, 16, 16);
        }
      }
    }
  }

  private renderDecals() {
    const zoom = this.camera.zoom;
    const halfW = (this.canvas.width / zoom) / 2 + 40;
    const halfH = (this.canvas.height / zoom) / 2 + 40;
    const minX = this.camera.x - halfW;
    const maxX = this.camera.x + halfW;
    const minY = this.camera.y - halfH;
    const maxY = this.camera.y + halfH;

    for (const d of this.map.decals) {
      if (d.x < minX || d.x > maxX || d.y < minY || d.y > maxY) continue;
      this.ctx.save();
      this.ctx.translate(d.x, d.y);
      this.ctx.rotate(d.angle);
      this.ctx.fillStyle = d.color;
      this.ctx.globalAlpha = 0.55;
      if (d.type === 'blood') {
        this.ctx.beginPath();
        this.ctx.ellipse(0, 0, d.size, d.size * 0.6, 0, 0, Math.PI * 2);
        this.ctx.fill();
      } else {
        this.ctx.fillRect(-d.size / 2, -d.size / 2, d.size, d.size);
      }
      this.ctx.restore();
    }
  }

  private renderGroundWeapons() {
    const zoom = this.camera.zoom;
    const halfW = (this.canvas.width / zoom) / 2 + 50;
    const halfH = (this.canvas.height / zoom) / 2 + 50;
    const minX = this.camera.x - halfW;
    const maxX = this.camera.x + halfW;
    const minY = this.camera.y - halfH;
    const maxY = this.camera.y + halfH;

    const time = performance.now() * 0.003;
    for (const gw of this.groundWeapons) {
      if (gw.x < minX || gw.x > maxX || gw.y < minY || gw.y > maxY) continue;
      const wpn = gw.weapon;
      const colorInfo = RARITY_COLORS[wpn.rarity] || RARITY_COLORS.common;
      const bob = Math.sin(gw.bobTimer + time) * 3.5;
      const px = gw.x;
      const py = gw.y + bob;

      this.ctx.save();

      // 1. Soft pulsing ground glow
      const groundGlow = this.ctx.createRadialGradient(gw.x, gw.y + 6, 2, gw.x, gw.y + 6, 18);
      groundGlow.addColorStop(0, colorInfo.glow);
      groundGlow.addColorStop(1, 'rgba(0,0,0,0)');
      this.ctx.fillStyle = groundGlow;
      this.ctx.beginPath();
      this.ctx.ellipse(gw.x, gw.y + 6, 18, 9, 0, 0, Math.PI * 2);
      this.ctx.fill();

      // 2. Vertical Light Pillar for Rare and Legendary items (Diablo style!)
      if (wpn.rarity === 'rare' || wpn.rarity === 'legendary') {
        const pillarGrad = this.ctx.createLinearGradient(px, py, px, py - 60);
        pillarGrad.addColorStop(0, colorInfo.glow);
        pillarGrad.addColorStop(0.6, colorInfo.glow.replace('0.7', '0.2').replace('0.9', '0.3'));
        pillarGrad.addColorStop(1, 'rgba(0,0,0,0)');
        this.ctx.fillStyle = pillarGrad;
        this.ctx.fillRect(px - 3, py - 60, 6, 60);

        if (Math.random() < 0.25) {
          this.particles.push({
            x: px + (Math.random() - 0.5) * 8,
            y: py - Math.random() * 30,
            vx: (Math.random() - 0.5) * 12,
            vy: -35 - Math.random() * 25,
            size: 1.5,
            color: colorInfo.main,
            alpha: 0.9,
            life: 0,
            maxLife: 0.4,
          });
        }
      }

      // 3. Draw Weapon Graphic
      this.renderWeaponCanvasIcon(px, py - 4, wpn);

      // 4. Compact floating nameplate
      const starStr = wpn.stars > 0 ? ` ⭐x${wpn.stars}` : '';
      const nameText = `${wpn.name}${wpn.level > 0 ? ` +${wpn.level}` : ''}${starStr}`;
      this.ctx.font = 'bold 9px monospace';
      const textW = this.ctx.measureText(nameText).width;

      this.ctx.fillStyle = 'rgba(15, 23, 42, 0.88)';
      this.ctx.strokeStyle = colorInfo.main;
      this.ctx.lineWidth = 1;
      this.ctx.beginPath();
      this.ctx.roundRect(px - textW / 2 - 4, py - 18, textW + 8, 12, 3);
      this.ctx.fill();
      this.ctx.stroke();

      this.ctx.fillStyle = colorInfo.main;
      this.ctx.textAlign = 'center';
      this.ctx.fillText(nameText, px, py - 9);

      // Near player indicator
      const dist = Math.hypot(this.playerPos.x - gw.x, this.playerPos.y - gw.y);
      if (dist < 38) {
        this.ctx.fillStyle = '#ffd700';
        this.ctx.font = 'bold 9px sans-serif';
        this.ctx.fillText('▼ [E] ВЗЯТЬ • [F] В ЗВЁЗДЫ ⭐', px, py - 22);
      }

      this.ctx.restore();
    }
  }

  private renderWeaponCanvasIcon(x: number, y: number, wpn: Weapon) {
    this.ctx.save();
    this.ctx.translate(x, y);

    const mainColor = RARITY_COLORS[wpn.rarity].main;

    if (wpn.type === 'wand') {
      // Wood staff rod
      this.ctx.strokeStyle = '#78350f';
      this.ctx.lineWidth = 2.5;
      this.ctx.beginPath();
      this.ctx.moveTo(-6, 7);
      this.ctx.lineTo(4, -3);
      this.ctx.stroke();

      // Golden orb holder
      this.ctx.fillStyle = '#ffd700';
      this.ctx.beginPath();
      this.ctx.arc(4, -3, 2.5, 0, Math.PI * 2);
      this.ctx.fill();

      // Pulsing magic orb
      this.ctx.fillStyle = mainColor;
      this.ctx.shadowColor = mainColor;
      this.ctx.shadowBlur = 8;
      this.ctx.beginPath();
      this.ctx.arc(7, -6, 4, 0, Math.PI * 2);
      this.ctx.fill();

      // White core
      this.ctx.fillStyle = '#ffffff';
      this.ctx.beginPath();
      this.ctx.arc(6, -7, 1.5, 0, Math.PI * 2);
      this.ctx.fill();
    } else if (wpn.type === 'sword') {
      this.ctx.strokeStyle = mainColor;
      this.ctx.lineWidth = 2.5;
      this.ctx.beginPath();
      this.ctx.moveTo(-5, 6);
      this.ctx.lineTo(6, -5);
      this.ctx.stroke();

      this.ctx.strokeStyle = '#ffd700';
      this.ctx.lineWidth = 2;
      this.ctx.beginPath();
      this.ctx.moveTo(-6, 2);
      this.ctx.lineTo(-2, 6);
      this.ctx.stroke();
    } else if (wpn.type === 'dagger') {
      this.ctx.strokeStyle = mainColor;
      this.ctx.lineWidth = 2;
      this.ctx.beginPath();
      this.ctx.moveTo(-3, 4);
      this.ctx.lineTo(4, -3);
      this.ctx.stroke();
      this.ctx.strokeStyle = '#94a3b8';
      this.ctx.beginPath();
      this.ctx.moveTo(-5, 2);
      this.ctx.lineTo(-2, 5);
      this.ctx.stroke();
    } else if (wpn.type === 'hammer') {
      this.ctx.strokeStyle = '#78350f';
      this.ctx.lineWidth = 2.5;
      this.ctx.beginPath();
      this.ctx.moveTo(-5, 6);
      this.ctx.lineTo(3, -2);
      this.ctx.stroke();

      this.ctx.fillStyle = mainColor;
      this.ctx.fillRect(1, -7, 7, 5);
    } else {
      // Bow
      this.ctx.strokeStyle = '#b45309';
      this.ctx.lineWidth = 2;
      this.ctx.beginPath();
      this.ctx.arc(0, 0, 7, -Math.PI / 4, (3 * Math.PI) / 4);
      this.ctx.stroke();
      this.ctx.strokeStyle = mainColor;
      this.ctx.lineWidth = 1;
      this.ctx.beginPath();
      this.ctx.moveTo(-5, -5);
      this.ctx.lineTo(5, 5);
      this.ctx.stroke();
    }

    this.ctx.restore();
  }

  private renderGroundScrolls() {
    const zoom = this.camera.zoom;
    const halfW = (this.canvas.width / zoom) / 2 + 50;
    const halfH = (this.canvas.height / zoom) / 2 + 50;
    const minX = this.camera.x - halfW;
    const maxX = this.camera.x + halfW;
    const minY = this.camera.y - halfH;
    const maxY = this.camera.y + halfH;

    const time = performance.now() * 0.003;
    for (const gs of this.groundScrolls) {
      if (gs.x < minX || gs.x > maxX || gs.y < minY || gs.y > maxY) continue;
      const scroll = gs.scroll;
      const bob = Math.sin(gs.bobTimer + time) * 3;
      const px = gs.x;
      const py = gs.y + bob;

      this.ctx.save();

      // Soft glow
      const sGlow = this.ctx.createRadialGradient(px, py + 4, 1, px, py + 4, 14);
      sGlow.addColorStop(0, scroll.color);
      sGlow.addColorStop(1, 'rgba(0,0,0,0)');
      this.ctx.fillStyle = sGlow;
      this.ctx.beginPath();
      this.ctx.ellipse(px, py + 4, 12, 6, 0, 0, Math.PI * 2);
      this.ctx.fill();

      // Parchment body
      this.ctx.fillStyle = '#fef08a';
      this.ctx.strokeStyle = '#ca8a04';
      this.ctx.lineWidth = 1;
      this.ctx.fillRect(px - 6, py - 5, 12, 10);
      this.ctx.strokeRect(px - 6, py - 5, 12, 10);

      // Wax seal
      this.ctx.fillStyle = scroll.color;
      this.ctx.beginPath();
      this.ctx.arc(px, py, 3, 0, Math.PI * 2);
      this.ctx.fill();

      // Nameplate
      this.ctx.font = 'bold 9px monospace';
      const textW = this.ctx.measureText(scroll.name).width;
      this.ctx.fillStyle = 'rgba(15, 23, 42, 0.88)';
      this.ctx.strokeStyle = scroll.color;
      this.ctx.beginPath();
      this.ctx.roundRect(px - textW / 2 - 4, py - 18, textW + 8, 12, 3);
      this.ctx.fill();
      this.ctx.stroke();

      this.ctx.fillStyle = scroll.color;
      this.ctx.textAlign = 'center';
      this.ctx.fillText(scroll.name, px, py - 9);

      const dist = Math.hypot(this.playerPos.x - gs.x, this.playerPos.y - gs.y);
      if (dist < 34) {
        this.ctx.fillStyle = '#ffd700';
        this.ctx.font = 'bold 9px sans-serif';
        this.ctx.fillText('▼ [E] СВИТОК', px, py - 22);
      }

      this.ctx.restore();
    }
  }

  private renderTraps() {
    for (const trap of this.map.traps) {
      const px = trap.tileX * 16;
      const py = trap.tileY * 16;
      this.ctx.save();
      this.ctx.fillStyle = '#1e293b';
      this.ctx.fillRect(px + 2, py + 2, 12, 12);

      if (trap.state === 'warning') {
        this.ctx.fillStyle = '#dc2626';
        this.ctx.fillRect(px + 4, py + 4, 8, 8);
      } else if (trap.state === 'active') {
        this.ctx.fillStyle = '#f87171';
        this.ctx.fillRect(px + 3, py + 3, 3, 10);
        this.ctx.fillRect(px + 7, py + 1, 3, 12);
        this.ctx.fillRect(px + 11, py + 3, 3, 10);
      }
      this.ctx.restore();
    }
  }

  private renderProps() {
    const zoom = this.camera.zoom;
    const halfW = (this.canvas.width / zoom) / 2 + 50;
    const halfH = (this.canvas.height / zoom) / 2 + 50;
    const minX = this.camera.x - halfW;
    const maxX = this.camera.x + halfW;
    const minY = this.camera.y - halfH;
    const maxY = this.camera.y + halfH;

    // Crates / Barricades
    if (this.map.crates) {
      for (const crate of this.map.crates) {
        if (crate.broken) continue;
        if (crate.x < minX || crate.x > maxX || crate.y < minY || crate.y > maxY) continue;
        this.ctx.save();
        this.ctx.fillStyle = '#78350f';
        this.ctx.fillRect(crate.x - 7, crate.y - 7, 14, 14);
        this.ctx.fillStyle = '#b45309';
        this.ctx.fillRect(crate.x - 6, crate.y - 6, 12, 12);
        this.ctx.strokeStyle = '#451a03';
        this.ctx.lineWidth = 1;
        this.ctx.strokeRect(crate.x - 7, crate.y - 7, 14, 14);
        this.ctx.beginPath();
        this.ctx.moveTo(crate.x - 6, crate.y - 6);
        this.ctx.lineTo(crate.x + 6, crate.y + 6);
        this.ctx.moveTo(crate.x + 6, crate.y - 6);
        this.ctx.lineTo(crate.x - 6, crate.y + 6);
        this.ctx.stroke();
        this.ctx.restore();
      }
    }
    // Chests
    for (const chest of this.map.chests) {
      if (chest.x < minX || chest.x > maxX || chest.y < minY || chest.y > maxY) continue;
      this.ctx.save();
      if (!chest.opened) {
        this.ctx.shadowColor = '#ffd700';
        this.ctx.shadowBlur = 8;
        // Draw golden chest
        this.ctx.fillStyle = '#eab308';
        this.ctx.fillRect(chest.x - 7, chest.y - 6, 14, 12);
        this.ctx.fillStyle = '#713f12';
        this.ctx.fillRect(chest.x - 6, chest.y - 5, 12, 10);
        this.ctx.fillStyle = '#fef08a';
        this.ctx.fillRect(chest.x - 2, chest.y - 2, 4, 4);
      } else {
        // Open chest
        this.ctx.fillStyle = '#713f12';
        this.ctx.fillRect(chest.x - 7, chest.y - 4, 14, 10);
        this.ctx.fillStyle = '#1e293b';
        this.ctx.fillRect(chest.x - 6, chest.y - 3, 12, 8);
      }
      this.ctx.restore();
    }

    // Shrines
    for (const shrine of this.map.shrines) {
      if (shrine.x < minX || shrine.x > maxX || shrine.y < minY || shrine.y > maxY) continue;
      this.ctx.save();
      if (!shrine.used) {
        this.ctx.shadowColor = '#38bdf8';
        this.ctx.shadowBlur = 12;
      }
      this.ctx.drawImage(
        this.assets.structure,
        0,
        0,
        16,
        32,
        shrine.x - 8,
        shrine.y - 24,
        16,
        32
      );
      this.ctx.restore();

      if (!shrine.used) {
        this.ctx.save();
        this.ctx.font = 'bold 8px monospace';
        this.ctx.textAlign = 'center';
        this.ctx.fillStyle = '#38bdf8';
        this.ctx.shadowColor = '#000';
        this.ctx.shadowBlur = 4;
        this.ctx.fillText('КУПЕЛЬ [E]', shrine.x, shrine.y - 28);
        this.ctx.restore();
      }
    }

    // Challenge Totem
    if (this.map.challenge) {
      const ch = this.map.challenge;
      if (ch.totemX >= minX && ch.totemX <= maxX && ch.totemY >= minY && ch.totemY <= maxY) {
        this.ctx.save();
        this.ctx.shadowColor = ch.active ? '#ef4444' : '#a855f7';
        this.ctx.shadowBlur = ch.active ? 15 : 8;
        this.ctx.drawImage(
          this.assets.structure,
          0,
          0,
          16,
          32,
          ch.totemX - 8,
          ch.totemY - 24,
          16,
          32
        );
        this.ctx.restore();
      }
    }

    // Shopkeeper NPC (Spectral Merchant)
    if (this.map.shop) {
      const shp = this.map.shop;
      if (shp.x >= minX && shp.x <= maxX && shp.y >= minY && shp.y <= maxY) {
        this.ctx.save();
        
        // Carpet under merchant
        this.ctx.fillStyle = '#78350f';
        this.ctx.beginPath();
        this.ctx.ellipse(shp.x, shp.y + 4, 15, 8, 0, 0, Math.PI * 2);
        this.ctx.fill();
        this.ctx.strokeStyle = '#ffd700';
        this.ctx.lineWidth = 1;
        this.ctx.stroke();

        // Spectral golden & purple aura
        this.ctx.shadowColor = '#ffd700';
        this.ctx.shadowBlur = 14;

        // Animated idle standing merchant with pre-rendered spectral violet tint
        const idleFrame = Math.floor(Date.now() / 250) % 4;
        const merchantSheet = this.getTintedSprite(this.assets.zombieIdle, 'zombie_witch', false);
        this.ctx.drawImage(
          merchantSheet,
          idleFrame * 32,
          0,
          32,
          32,
          shp.x - 16,
          shp.y - 20,
          32,
          32
        );
        this.ctx.restore();

        // Floating label above shopkeeper
        this.ctx.save();
        this.ctx.font = 'bold 8px monospace';
        this.ctx.textAlign = 'center';
        this.ctx.fillStyle = '#ffd700';
        this.ctx.shadowColor = '#000';
        this.ctx.shadowBlur = 4;
        this.ctx.fillText('ТОРГОВЕЦ [E]', shp.x, shp.y - 24);
        this.ctx.restore();
      }
    }

    // Stairs Down
    const sx = this.map.stairsPoint.x * 16;
    const sy = this.map.stairsPoint.y * 16;
    if (sx >= minX - 16 && sx <= maxX + 16 && sy >= minY - 16 && sy <= maxY + 16) {
      this.ctx.drawImage(this.assets.tiles, 6 * 16, 5 * 16, 16, 16, sx, sy, 16, 16);
      this.ctx.save();
      this.ctx.font = 'bold 8px monospace';
      this.ctx.textAlign = 'center';
      this.ctx.fillStyle = '#fde047';
      this.ctx.shadowColor = '#000';
      this.ctx.shadowBlur = 4;
      this.ctx.fillText('СПУСК [E]', sx + 8, sy - 6);
      this.ctx.restore();
    }

    // Torches
    for (const torch of this.map.torches) {
      const tx = torch.x * 16;
      const ty = torch.y * 16;
      if (tx < minX || tx > maxX || ty < minY || ty > maxY) continue;
      const img =
        torch.type === 'left'
          ? this.assets.torchLeft
          : torch.type === 'right'
          ? this.assets.torchRight
          : this.assets.torchWall;

      this.ctx.drawImage(img, torch.frame * 16, 0, 16, 16, tx, ty, 16, 16);
    }

    // Vases
    if (this.map.vases) {
      for (const vase of this.map.vases) {
        if (vase.broken) continue;
        if (vase.x < minX || vase.x > maxX || vase.y < minY || vase.y > maxY) continue;
        this.ctx.drawImage(
          this.assets.vaseAnim,
          vase.frame * 16,
          0,
          16,
          16,
          vase.x - 8,
          vase.y - 8,
          16,
          16
        );
      }
    }
  }

  private renderItems() {
    const zoom = this.camera.zoom;
    const halfW = (this.canvas.width / zoom) / 2 + 50;
    const halfH = (this.canvas.height / zoom) / 2 + 50;
    const minX = this.camera.x - halfW;
    const maxX = this.camera.x + halfW;
    const minY = this.camera.y - halfH;
    const maxY = this.camera.y + halfH;

    for (const item of this.items) {
      if (item.x < minX || item.x > maxX || item.y < minY || item.y > maxY) continue;
      if (item.type === 'coin') {
        this.ctx.drawImage(
          this.assets.coins,
          item.frame * 16,
          0,
          16,
          16,
          item.x - 8,
          item.y - 8,
          16,
          16
        );
      } else if (item.type === 'blue_coin') {
        this.ctx.drawImage(
          this.assets.blueCoins,
          item.frame * 16,
          0,
          16,
          16,
          item.x - 8,
          item.y - 8,
          16,
          16
        );
      } else if (item.type === 'potion_hp') {
        this.ctx.drawImage(this.assets.potions[0], item.x - 8, item.y - 8, 16, 16);
      } else if (item.type === 'potion_speed') {
        this.ctx.drawImage(this.assets.potions[2], item.x - 8, item.y - 8, 16, 16);
      } else if (item.type === 'potion_power') {
        this.ctx.drawImage(this.assets.potions[5], item.x - 8, item.y - 8, 16, 16);
      } else if (item.type === 'xp_gem') {
        this.ctx.save();
        this.ctx.fillStyle = '#c084fc';
        this.ctx.shadowColor = '#a855f7';
        this.ctx.shadowBlur = 8;
        this.ctx.beginPath();
        this.ctx.arc(item.x, item.y, 4, 0, Math.PI * 2);
        this.ctx.fill();
        this.ctx.restore();
      }
    }
  }

  private renderEnemies() {
    const zoom = this.camera.zoom;
    const halfW = (this.canvas.width / zoom) / 2 + 50;
    const halfH = (this.canvas.height / zoom) / 2 + 50;
    const minX = this.camera.x - halfW;
    const maxX = this.camera.x + halfW;
    const minY = this.camera.y - halfH;
    const maxY = this.camera.y + halfH;

    let visibleCount = 0;

    for (const e of this.enemies) {
      if (e.x < minX || e.x > maxX || e.y < minY || e.y > maxY) continue;
      visibleCount++;

      this.ctx.save();
      this.ctx.translate(e.x, e.y);

      if (e.scale !== 1.0) {
        this.ctx.scale(e.scale, e.scale);
      }

      let baseSheet = this.assets.zombieIdle;
      if (e.state === 'walk') baseSheet = this.assets.zombieRun;
      else if (e.state === 'hurt') baseSheet = this.assets.zombieHurt;
      else if (e.state === 'death') baseSheet = this.assets.zombieDeath;

      // Быстрая аппаратная аура элиты без тяжелого Gaussian shadowBlur
      if (e.isElite) {
        this.ctx.beginPath();
        this.ctx.arc(0, 0, e.radius + 6, 0, Math.PI * 2);
        this.ctx.fillStyle =
          e.eliteAffix === 'fire'
            ? 'rgba(249, 115, 22, 0.35)'
            : e.eliteAffix === 'frost'
            ? 'rgba(56, 189, 248, 0.35)'
            : 'rgba(168, 85, 247, 0.35)';
        this.ctx.fill();
        this.ctx.strokeStyle =
          e.eliteAffix === 'fire'
            ? '#f97316'
            : e.eliteAffix === 'frost'
            ? '#38bdf8'
            : '#a855f7';
        this.ctx.lineWidth = 1.5;
        this.ctx.stroke();
      }

      // Кэшированный оффскрин-спрайт без пересчета ctx.filter на CPU
      const sheet = this.getTintedSprite(
        baseSheet,
        e.type,
        e.hurtTimer > 0,
        e.tint
      );

      const frame = e.state === 'hurt' ? e.frame % 2 : e.frame % 8;
      const row = e.dir;

      this.ctx.drawImage(sheet, frame * 32, row * 32, 32, 32, -16, -20, 32, 32);

      this.ctx.restore();

      // РЕНДЕРИНГ ЧЁРНОГО ЩИТА (ШЕЙДЕР-ГЛИТЧ БЕЗДНЫ)
      if (e.hasDarkShield && (e.darkShieldHp || 0) > 0) {
        const time = performance.now() * 0.005;
        const shieldR = (e.radius + 12) * e.scale;

        this.ctx.save();
        // 1. Черное ядро поглощения света
        this.ctx.beginPath();
        this.ctx.arc(e.x, e.y, shieldR, 0, Math.PI * 2);
        this.ctx.fillStyle = 'rgba(6, 4, 15, 0.72)';
        this.ctx.fill();

        // 2. Неоновая фиолетовая окантовка
        this.ctx.strokeStyle = '#c084fc';
        this.ctx.lineWidth = 2.0;
        this.ctx.beginPath();
        const startA = time * 2.5;
        this.ctx.arc(e.x, e.y, shieldR, startA, startA + Math.PI * 1.3);
        this.ctx.stroke();

        this.ctx.strokeStyle = '#38bdf8';
        this.ctx.lineWidth = 1.5;
        this.ctx.beginPath();
        this.ctx.arc(e.x, e.y, shieldR + 2, startA + Math.PI, startA + Math.PI * 2.1);
        this.ctx.stroke();

        // 3. Глитч-сканлайны искажения
        const glitchOffset = Math.sin(time * 25 + e.id) * 5;
        this.ctx.fillStyle = 'rgba(192, 132, 252, 0.45)';
        this.ctx.fillRect(e.x - 14 + glitchOffset, e.y - 7, 28, 2);
        this.ctx.fillRect(e.x - 12 - glitchOffset, e.y + 5, 24, 1.5);
        this.ctx.restore();

        // 4. Полоса прочности Чёрного Щита над ХП
        const sBarW = 32 * e.scale;
        const sBarH = 4;
        const sBarX = e.x - sBarW / 2;
        const sBarY = e.y - 32 * e.scale;
        this.ctx.fillStyle = '#06040f';
        this.ctx.fillRect(sBarX - 1, sBarY - 1, sBarW + 2, sBarH + 2);
        this.ctx.fillStyle = '#a855f7';
        const shieldPct = Math.max(0, (e.darkShieldHp || 0) / (e.maxDarkShieldHp || 1));
        this.ctx.fillRect(sBarX, sBarY, shieldPct * sBarW, sBarH);

        this.ctx.font = 'bold 7px monospace';
        this.ctx.fillStyle = '#f0abfc';
        this.ctx.textAlign = 'center';
        this.ctx.fillText('🛡️ ЧЁРНЫЙ ЩИТ', e.x, sBarY - 2);
      }

      // Health bar & name for injured and elite enemies
      if (!e.isDead && !e.isBoss) {
        if (e.isElite || e.hp < e.maxHp) {
          const barW = 28 * e.scale;
          const barH = 3.5;
          const barX = e.x - barW / 2;
          const barY = e.y - 25 * e.scale;

          this.ctx.fillStyle = '#0f172a';
          this.ctx.fillRect(barX - 1, barY - 1, barW + 2, barH + 2);
          this.ctx.fillStyle = e.isElite ? '#f59e0b' : '#ef4444';
          this.ctx.fillRect(barX, barY, (Math.max(0, e.hp) / e.maxHp) * barW, barH);

          if (e.isElite || e.isEvolved) {
            this.ctx.font = 'bold 7px sans-serif';
            this.ctx.fillStyle = e.hasDarkShield ? '#c084fc' : '#ffd700';
            this.ctx.textAlign = 'center';
            this.ctx.fillText(e.name, e.x, barY - 3);
          }
        }
      }
    }
    this.lastVisibleEnemiesCount = visibleCount;
  }

  private renderPlayer() {
    this.ctx.save();
    this.ctx.translate(this.playerPos.x, this.playerPos.y);

    if (this.player.invulnerableTimer > 0) {
      const blink = Math.floor(performance.now() / 80) % 2 === 0;
      if (blink) this.ctx.globalAlpha = 0.4;
    }

    if (this.player.heroClass === 'paladin') {
      this.ctx.filter = 'sepia(0.85) hue-rotate(5deg) saturate(3) contrast(1.15)';
      this.ctx.shadowColor = '#ffd700';
      this.ctx.shadowBlur = 14;
    } else if (this.player.heroClass === 'sorcerer') {
      this.ctx.filter = 'hue-rotate(240deg) saturate(2.4) brightness(1.1)';
      this.ctx.shadowColor = '#c084fc';
      this.ctx.shadowBlur = 14;
    } else if (this.player.heroClass === 'berserker') {
      this.ctx.filter = 'hue-rotate(320deg) saturate(3.5) brightness(1.15)';
      this.ctx.shadowColor = '#ef4444';
      this.ctx.shadowBlur = 15;
    } else if (this.player.heroClass === 'assassin') {
      this.ctx.filter = 'brightness(0.7) contrast(1.6) hue-rotate(160deg)';
      this.ctx.shadowColor = '#06b6d4';
      this.ctx.shadowBlur = 12;
    } else {
      this.ctx.filter = 'saturate(1.4) brightness(1.05)';
      this.ctx.shadowColor = '#84cc16';
      this.ctx.shadowBlur = 10;
    }

    if (this.player.buffPowerTimer > 0) {
      this.ctx.shadowColor = '#ef4444';
      this.ctx.shadowBlur = 12;
    } else if (this.player.buffSpeedTimer > 0) {
      this.ctx.shadowColor = '#facc15';
      this.ctx.shadowBlur = 12;
    }

    let sheet = this.assets.zombieIdle;
    if (this.playerAnim.state === 'run') sheet = this.assets.zombieRun;

    const frame = this.playerAnim.frame;
    const row = this.playerDir;

    this.ctx.drawImage(sheet, frame * 32, row * 32, 32, 32, -16, -20, 32, 32);

    // Class Accessories & Indicators
    if (this.player.heroClass === 'paladin') {
      // Golden Holy Crown Halo
      this.ctx.save();
      this.ctx.strokeStyle = '#fef08a';
      this.ctx.lineWidth = 1.5;
      this.ctx.shadowColor = '#ffd700';
      this.ctx.shadowBlur = 8;
      this.ctx.beginPath();
      this.ctx.ellipse(0, -22, 6, 2.5, 0, 0, Math.PI * 2);
      this.ctx.stroke();
      this.ctx.restore();
    } else if (this.player.heroClass === 'sorcerer') {
      // Orbiting soul orb
      const orbAngle = performance.now() / 350;
      const ox = Math.cos(orbAngle) * 14;
      const oy = Math.sin(orbAngle) * 8 - 10;
      this.ctx.save();
      this.ctx.fillStyle = '#c084fc';
      this.ctx.shadowColor = '#a855f7';
      this.ctx.shadowBlur = 8;
      this.ctx.beginPath();
      this.ctx.arc(ox, oy, 2.5, 0, Math.PI * 2);
      this.ctx.fill();
      this.ctx.restore();
    } else if (this.player.heroClass === 'berserker') {
      // Raging flame sparks
      if (Math.random() < 0.4) {
        this.particles.push({
          x: this.playerPos.x + (Math.random() - 0.5) * 16,
          y: this.playerPos.y - 12,
          vx: (Math.random() - 0.5) * 15,
          vy: -20 - Math.random() * 20,
          size: 2,
          color: '#ef4444',
          alpha: 0.8,
          life: 0,
          maxLife: 0.3,
        });
      }
    }

    this.ctx.restore();
  }

  private renderSlashAttack() {
    if (!this.slashVisual.active) return;
    this.ctx.save();
    this.ctx.translate(this.playerPos.x, this.playerPos.y);
    this.ctx.rotate(this.slashVisual.angle);

    const r = this.slashVisual.radius;
    const isFinisher = this.slashVisual.combo === 2;

    if (isFinisher) {
      // 360-degree explosive whirlwind shockwave
      this.ctx.save();
      this.ctx.shadowColor = '#ffd700';
      this.ctx.shadowBlur = 18;
      this.ctx.strokeStyle = '#ffd700';
      this.ctx.lineWidth = 6;
      this.ctx.beginPath();
      this.ctx.arc(0, 0, r * 1.1, 0, Math.PI * 2);
      this.ctx.stroke();

      this.ctx.strokeStyle = '#ffffff';
      this.ctx.lineWidth = 3;
      this.ctx.beginPath();
      this.ctx.arc(0, 0, r * 0.95, 0, Math.PI * 2);
      this.ctx.stroke();
      this.ctx.restore();
    } else {
      // Sweeping crescent blade slash
      const flip = this.slashVisual.combo === 1 ? -1 : 1;
      const startAngle = -0.9 * flip;
      const endAngle = 0.9 * flip;

      this.ctx.save();
      this.ctx.shadowColor = this.slashVisual.color;
      this.ctx.shadowBlur = 14;

      // Outer crescent
      this.ctx.strokeStyle = this.slashVisual.color;
      this.ctx.lineWidth = 5;
      this.ctx.beginPath();
      this.ctx.arc(0, 0, r, Math.min(startAngle, endAngle), Math.max(startAngle, endAngle));
      this.ctx.stroke();

      // Bright inner core
      this.ctx.strokeStyle = '#ffffff';
      this.ctx.lineWidth = 2.5;
      this.ctx.beginPath();
      this.ctx.arc(0, 0, r - 3, Math.min(startAngle, endAngle), Math.max(startAngle, endAngle));
      this.ctx.stroke();
      this.ctx.restore();
    }

    this.ctx.restore();
  }

  private renderCrosshair() {
    const mx = this.mouse.worldX;
    const my = this.mouse.worldY;
    if (mx === 0 && my === 0) return;

    this.ctx.save();
    this.ctx.translate(mx, my);

    // Target lock-on check
    let hoveringEnemy = false;
    for (const e of this.enemies) {
      if (!e.isDead && Math.hypot(e.x - mx, e.y - my) < e.radius + 8) {
        hoveringEnemy = true;
        break;
      }
    }

    const color = hoveringEnemy ? '#ef4444' : '#38bdf8';
    this.ctx.shadowColor = color;
    this.ctx.shadowBlur = hoveringEnemy ? 12 : 6;
    this.ctx.strokeStyle = color;
    this.ctx.lineWidth = 1.5;

    // Outer rotating reticle brackets
    const angle = performance.now() / 600;
    this.ctx.rotate(angle);
    const size = hoveringEnemy ? 9 : 7;

    for (let i = 0; i < 4; i++) {
      this.ctx.rotate(Math.PI / 2);
      this.ctx.beginPath();
      this.ctx.moveTo(size - 3, size);
      this.ctx.lineTo(size, size);
      this.ctx.lineTo(size, size - 3);
      this.ctx.stroke();
    }

    // Center dot
    this.ctx.fillStyle = '#ffffff';
    this.ctx.beginPath();
    this.ctx.arc(0, 0, 1.5, 0, Math.PI * 2);
    this.ctx.fill();

    this.ctx.restore();

    // Subtle aim guide line from hero to cursor
    const pdist = Math.hypot(mx - this.playerPos.x, my - this.playerPos.y);
    if (pdist > 25) {
      this.ctx.save();
      this.ctx.strokeStyle = 'rgba(56, 189, 248, 0.22)';
      this.ctx.lineWidth = 1;
      this.ctx.setLineDash([3, 5]);
      this.ctx.beginPath();
      this.ctx.moveTo(this.playerPos.x, this.playerPos.y);
      this.ctx.lineTo(mx, my);
      this.ctx.stroke();
      this.ctx.restore();
    }
  }

  private renderProjectiles() {
    const time = performance.now() * 0.012;
    const zoom = this.camera.zoom;
    const halfW = (this.canvas.width / zoom) / 2 + 50;
    const halfH = (this.canvas.height / zoom) / 2 + 50;
    const minX = this.camera.x - halfW;
    const maxX = this.camera.x + halfW;
    const minY = this.camera.y - halfH;
    const maxY = this.camera.y + halfH;

    for (const p of this.projectiles) {
      if (p.x < minX || p.x > maxX || p.y < minY || p.y > maxY) continue;

      if (p.isMagicOrb) {
        const outerR = p.radius * 2.0;

        // 1. Внешний ореол (Halo) без тяжелого градиента
        this.ctx.globalAlpha = 0.28;
        this.ctx.fillStyle = p.trailColor;
        this.ctx.beginPath();
        this.ctx.arc(p.x, p.y, outerR, 0, Math.PI * 2);
        this.ctx.fill();

        // 2. Внутреннее яркое кольцо энергии
        this.ctx.globalAlpha = 0.85;
        this.ctx.fillStyle = p.color;
        this.ctx.beginPath();
        this.ctx.arc(p.x, p.y, p.radius * 1.1, 0, Math.PI * 2);
        this.ctx.fill();

        // 3. Сияющее ядро
        this.ctx.globalAlpha = 1.0;
        this.ctx.fillStyle = p.isDarkMagic ? '#06040f' : '#ffffff';
        this.ctx.beginPath();
        this.ctx.arc(p.x, p.y, p.radius * 0.65, 0, Math.PI * 2);
        this.ctx.fill();

        // 4. Орбитальные искры
        const spAngle = time + p.id;
        const ox = p.x + Math.cos(spAngle) * (p.radius + 3);
        const oy = p.y + Math.sin(spAngle) * (p.radius + 3);
        this.ctx.fillStyle = p.isDarkMagic ? '#c084fc' : '#fef08a';
        this.ctx.beginPath();
        this.ctx.arc(ox, oy, 1.8, 0, Math.PI * 2);
        this.ctx.fill();
      } else {
        // Обычные пули: быстрая отрисовка без shadowBlur
        this.ctx.globalAlpha = 1.0;
        this.ctx.fillStyle = p.color;
        this.ctx.beginPath();
        this.ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        this.ctx.fill();
      }
    }
    this.ctx.globalAlpha = 1.0;
  }

  private renderParticles() {
    const zoom = this.camera.zoom;
    const halfW = (this.canvas.width / zoom) / 2 + 30;
    const halfH = (this.canvas.height / zoom) / 2 + 30;
    const minX = this.camera.x - halfW;
    const maxX = this.camera.x + halfW;
    const minY = this.camera.y - halfH;
    const maxY = this.camera.y + halfH;

    this.ctx.save();
    for (const p of this.particles) {
      if (p.x < minX || p.x > maxX || p.y < minY || p.y > maxY) continue;
      this.ctx.globalAlpha = Math.max(0, Math.min(1, p.alpha));
      this.ctx.fillStyle = p.color;
      this.ctx.fillRect(p.x - p.size * 0.5, p.y - p.size * 0.5, p.size, p.size);
    }
    this.ctx.restore();
  }

  private renderFloatingTexts() {
    for (const t of this.floatingTexts) {
      this.ctx.save();
      this.ctx.globalAlpha = t.alpha;
      this.ctx.fillStyle = t.color;
      this.ctx.font = `900 ${t.size}px monospace`;
      this.ctx.textAlign = 'center';
      this.ctx.shadowColor = '#000000';
      this.ctx.shadowBlur = 4;
      this.ctx.fillText(t.text, t.x, t.y);
      this.ctx.restore();
    }
  }

  private renderLightingPass(w: number, h: number) {
    this.lightCtx.clearRect(0, 0, w, h);

    this.lightCtx.fillStyle = 'rgba(7, 9, 14, 0.88)';
    this.lightCtx.fillRect(0, 0, w, h);

    this.lightCtx.globalCompositeOperation = 'destination-out';

    const zoom = this.camera.zoom;
    const toScreen = (wx: number, wy: number) => ({
      x: (wx - this.camera.x) * zoom + w / 2 + this.screenShake.x,
      y: (wy - this.camera.y) * zoom + h / 2 + this.screenShake.y,
    });

    const pScreen = toScreen(this.playerPos.x, this.playerPos.y);
    const pFlicker = Math.sin(performance.now() * 0.005) * 4;
    const baseRadius = 135 + (this.currentMeta.extraLight > 0 ? 35 : 0) + (this.player.bonusLightRadius || 0);
    const pRadius = (baseRadius + pFlicker) * (zoom / 2);

    // Аппаратный блиттинг из кэша вместо createRadialGradient
    this.lightCtx.drawImage(
      this.lightGlowPlayerCanvas,
      pScreen.x - pRadius,
      pScreen.y - pRadius,
      pRadius * 2,
      pRadius * 2
    );

    for (const torch of this.map.torches) {
      const tPos = toScreen(torch.x * 16 + 8, torch.y * 16 + 8);
      if (tPos.x < -100 || tPos.x > w + 100 || tPos.y < -100 || tPos.y > h + 100) continue;

      const tFlicker = Math.sin(performance.now() * 0.008 + torch.x) * 5;
      const tRadius = (70 + tFlicker) * (zoom / 2);

      this.lightCtx.drawImage(
        this.lightGlowTorchCanvas,
        tPos.x - tRadius,
        tPos.y - tRadius,
        tRadius * 2,
        tRadius * 2
      );
    }

    if (this.map.shop) {
      const shPos = toScreen(this.map.shop.x, this.map.shop.y);
      if (shPos.x >= -100 && shPos.x <= w + 100 && shPos.y >= -100 && shPos.y <= h + 100) {
        this.lightCtx.drawImage(
          this.lightGlowPlayerCanvas,
          shPos.x - 80,
          shPos.y - 80,
          160,
          160
        );
      }
    }

    for (const proj of this.projectiles) {
      const prPos = toScreen(proj.x, proj.y);
      if (prPos.x < -40 || prPos.x > w + 40 || prPos.y < -40 || prPos.y > h + 40) continue;
      const r = proj.isMagicOrb ? 30 : 16;
      this.lightCtx.drawImage(
        this.lightGlowProjCanvas,
        prPos.x - r,
        prPos.y - r,
        r * 2,
        r * 2
      );
    }

    this.lightCtx.globalCompositeOperation = 'source-over';
    this.ctx.drawImage(this.lightCanvas, 0, 0, w, h);
  }

  private renderHoveredWeaponTooltip() {
    if (!this.hoveredGroundWeapon) return;
    const gw = this.hoveredGroundWeapon;
    const wpn = gw.weapon;
    const colorInfo = RARITY_COLORS[wpn.rarity] || RARITY_COLORS.common;

    this.ctx.save();
    const pad = 10;
    const boxW = 220;
    const lineH = 13;
    const affixCount = wpn.affixes.length;
    const boxH = 68 + Math.max(1, affixCount) * lineH + 26;

    let bx = gw.x - boxW / 2;
    let by = gw.y - boxH - 24;

    const zoom = this.camera.zoom;
    const viewW = this.canvas.width / zoom;
    const viewH = this.canvas.height / zoom;
    const minX = this.camera.x - viewW / 2 + 10;
    const maxX = this.camera.x + viewW / 2 - boxW - 10;
    const minY = this.camera.y - viewH / 2 + 10;

    bx = Math.max(minX, Math.min(maxX, bx));
    if (by < minY) by = gw.y + 24;

    // Фоновая карточка в стиле Diablo
    this.ctx.fillStyle = 'rgba(8, 12, 22, 0.96)';
    this.ctx.strokeStyle = colorInfo.main;
    this.ctx.lineWidth = 1.8;
    this.ctx.shadowColor = colorInfo.main;
    this.ctx.shadowBlur = 12;
    this.ctx.beginPath();
    this.ctx.roundRect(bx, by, boxW, boxH, 6);
    this.ctx.fill();
    this.ctx.stroke();

    this.ctx.shadowBlur = 0;

    // Заголовок и редкость
    this.ctx.font = 'bold 11px sans-serif';
    this.ctx.fillStyle = colorInfo.main;
    this.ctx.textAlign = 'left';
    const starLabel = wpn.stars > 0 ? ` ⭐x${wpn.stars}` : '';
    this.ctx.fillText(wpn.level > 0 ? `${wpn.name} +${wpn.level}${starLabel}` : `${wpn.name}${starLabel}`, bx + pad, by + 16);

    this.ctx.font = '9px sans-serif';
    this.ctx.fillStyle = '#94a3b8';
    this.ctx.fillText(`[${colorInfo.label}] • ${wpn.type.toUpperCase()}`, bx + pad, by + 28);

    // Характеристики
    this.ctx.font = 'bold 9px monospace';
    this.ctx.fillStyle = '#fde047';
    const dps = (wpn.bonusDamage / wpn.attackCooldown).toFixed(0);
    this.ctx.fillText(`Урон: ${wpn.bonusDamage} (${dps} DPS)  Скор: ${(1 / wpn.attackCooldown).toFixed(1)}/с`, bx + pad, by + 42);

    if (wpn.projectile) {
      this.ctx.font = '8px monospace';
      this.ctx.fillStyle = '#38bdf8';
      const orbStr = wpn.projectile.isMagicOrb ? '🔮 Магическая сфера' : '🏹 Стрела';
      this.ctx.fillText(`${orbStr} • Пробивает: ${wpn.projectile.pierce} ${wpn.projectile.multishot ? `(x${wpn.projectile.multishot})` : ''}`, bx + pad, by + 54);
    }

    // Линия-разделитель
    let curY = by + 64;
    this.ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    this.ctx.lineWidth = 1;
    this.ctx.beginPath();
    this.ctx.moveTo(bx + pad, curY);
    this.ctx.lineTo(bx + boxW - pad, curY);
    this.ctx.stroke();

    curY += 10;
    this.ctx.font = '8px monospace';
    if (wpn.affixes.length === 0) {
      this.ctx.fillStyle = '#64748b';
      this.ctx.fillText('Без особых аффиксов', bx + pad, curY);
      curY += lineH;
    } else {
      for (const affix of wpn.affixes) {
        const isDark = affix.type === 'darkMagic';
        this.ctx.fillStyle = isDark ? '#c084fc' : '#38bdf8';
        this.ctx.fillText(`• ${affix.name}:`, bx + pad, curY);
        this.ctx.fillStyle = isDark ? '#f0abfc' : '#e2e8f0';
        const nameW = this.ctx.measureText(`• ${affix.name}: `).width;
        this.ctx.fillText(affix.desc, bx + pad + nameW, curY);
        curY += lineH;
      }
    }

    // Сравнение с текущим оружием
    const dmgDiff = wpn.bonusDamage - this.player.equippedWeapon.bonusDamage;
    this.ctx.font = 'bold 9px monospace';
    this.ctx.fillStyle = dmgDiff >= 0 ? '#4ade80' : '#f87171';
    this.ctx.fillText(`Сравнение: ${dmgDiff >= 0 ? `+${dmgDiff}` : dmgDiff} Урона`, bx + pad, curY + 2);

    // Подсказка подбора
    this.ctx.fillStyle = '#ffd700';
    this.ctx.font = 'bold 9px sans-serif';
    this.ctx.textAlign = 'right';
    this.ctx.fillText('[E] Взять', bx + boxW - pad, curY + 2);

    this.ctx.restore();
  }

  public renderMinimap(minimapCanvas: HTMLCanvasElement) {
    const mctx = minimapCanvas.getContext('2d');
    if (!mctx) return;

    const mw = minimapCanvas.width;
    const mh = minimapCanvas.height;

    // Check if offscreen base canvas needs initialization
    if (
      !this.minimapBaseCanvas ||
      this.minimapBaseCanvas.width !== mw ||
      this.minimapBaseCanvas.height !== mh
    ) {
      this.minimapBaseCanvas = document.createElement('canvas');
      this.minimapBaseCanvas.width = mw;
      this.minimapBaseCanvas.height = mh;
      this.minimapBaseCtx = this.minimapBaseCanvas.getContext('2d');
      this.minimapDirty = true;
    }

    const now = performance.now();
    // Only re-rasterize map tiles when new tiles were revealed and throttled to 4 FPS max
    if (this.minimapDirty && this.minimapBaseCtx && now - this.lastMinimapUpdate > 250) {
      this.minimapDirty = false;
      this.lastMinimapUpdate = now;

      const bmctx = this.minimapBaseCtx;
      bmctx.fillStyle = '#0a0f1d';
      bmctx.fillRect(0, 0, mw, mh);

      const scaleX = mw / this.map.width;
      const scaleY = mh / this.map.height;

      for (let y = 0; y < this.map.height; y++) {
        for (let x = 0; x < this.map.width; x++) {
          if (!this.map.discovered[y][x]) continue;

          const t = this.map.tiles[y][x];
          if (t === Tile.STAIRS_DOWN) {
            bmctx.fillStyle = '#38bdf8';
            bmctx.fillRect(x * scaleX, y * scaleY, scaleX + 0.5, scaleY + 0.5);
          } else if (t === Tile.CHEST) {
            bmctx.fillStyle = '#ffd700';
            bmctx.fillRect(x * scaleX - 1, y * scaleY - 1, 3, 3);
          } else if (t === Tile.SHRINE) {
            bmctx.fillStyle = '#ffd700';
            bmctx.fillRect(x * scaleX, y * scaleY, scaleX + 0.5, scaleY + 0.5);
          } else if (t === Tile.SHOP_CARPET) {
            bmctx.fillStyle = '#a855f7';
            bmctx.fillRect(x * scaleX, y * scaleY, scaleX + 0.5, scaleY + 0.5);
          } else if (isWalkable(t)) {
            bmctx.fillStyle = '#334155';
            bmctx.fillRect(x * scaleX, y * scaleY, scaleX + 0.5, scaleY + 0.5);
          }
        }
      }
    }

    // Fast blit of pre-rendered minimap background
    if (this.minimapBaseCanvas) {
      mctx.drawImage(this.minimapBaseCanvas, 0, 0);
    } else {
      mctx.fillStyle = '#0a0f1d';
      mctx.fillRect(0, 0, mw, mh);
    }

    const scaleX = mw / this.map.width;
    const scaleY = mh / this.map.height;

    // Draw only active/boss enemies on minimap
    for (const e of this.enemies) {
      if (e.isDead) continue;
      if (e.isBoss || e.lodLevel !== 2) {
        const tx = Math.floor(e.x / 16);
        const ty = Math.floor(e.y / 16);
        if (this.map.discovered[ty]?.[tx]) {
          mctx.fillStyle = e.isBoss ? '#ec4899' : '#ef4444';
          mctx.fillRect(tx * scaleX - 1, ty * scaleY - 1, 3, 3);
        }
      }
    }

    const ptx = this.playerPos.x / 16;
    const pty = this.playerPos.y / 16;
    mctx.fillStyle = '#22c55e';
    mctx.beginPath();
    mctx.arc(ptx * scaleX, pty * scaleY, 2.5, 0, Math.PI * 2);
    mctx.fill();
  }

  private syncStats() {
    this.callbacks.onStatsUpdate(this.player, this.currentBoss);
    if (this.callbacks.onPerformanceUpdate && (this.enemyAiTick % 12 === 0)) {
      this.callbacks.onPerformanceUpdate({
        multiCoreEnabled: this.workerManager.multiCoreEnabled,
        coreCount: this.workerManager.coreCount,
        activeEnemies: this.workerManager.activeCount,
        totalEnemies: this.enemies.filter((e) => !e.isDead).length,
        visibleEnemies: this.lastVisibleEnemiesCount,
      });
    }
  }

  public destroy() {
    this.stop();
    this.workerManager.destroy();
    this.tintedSpriteCache.clear();
  }

  private renderGroundRelics() {
    const time = performance.now() * 0.003;
    for (const gr of this.groundRelics) {
      const r = gr.relic;
      const bob = Math.sin(gr.bobTimer + time) * 4;
      const px = gr.x;
      const py = gr.y + bob;

      this.ctx.save();

      // Pulsing runic altar circle
      const rColor = r.rarity === 'legendary' ? '#fb923c' : r.rarity === 'epic' ? '#c084fc' : '#38bdf8';
      const glow = this.ctx.createRadialGradient(gr.x, gr.y + 6, 2, gr.x, gr.y + 6, 22);
      glow.addColorStop(0, rColor);
      glow.addColorStop(1, 'rgba(0,0,0,0)');
      this.ctx.fillStyle = glow;
      this.ctx.beginPath();
      this.ctx.ellipse(gr.x, gr.y + 6, 22, 11, 0, 0, Math.PI * 2);
      this.ctx.fill();

      // Vertical Holy Light Ray
      const beamGrad = this.ctx.createLinearGradient(px, py, px, py - 65);
      beamGrad.addColorStop(0, rColor);
      beamGrad.addColorStop(0.7, 'rgba(255, 215, 0, 0.15)');
      beamGrad.addColorStop(1, 'rgba(0,0,0,0)');
      this.ctx.fillStyle = beamGrad;
      this.ctx.fillRect(px - 4, py - 65, 8, 65);

      // Pedestal Base
      this.ctx.fillStyle = '#1e1b4b';
      this.ctx.strokeStyle = '#ffd700';
      this.ctx.lineWidth = 1.2;
      this.ctx.beginPath();
      this.ctx.roundRect(px - 10, gr.y + 2, 20, 8, 2);
      this.ctx.fill();
      this.ctx.stroke();

      // Floating Relic Icon
      this.ctx.font = '18px sans-serif';
      this.ctx.textAlign = 'center';
      this.ctx.textBaseline = 'middle';
      this.ctx.shadowColor = rColor;
      this.ctx.shadowBlur = 12;
      this.ctx.fillText(r.icon, px, py - 6);

      // Nameplate
      const nameText = `${r.icon} ${r.name}`;
      this.ctx.font = 'bold 9px monospace';
      const textW = this.ctx.measureText(nameText).width;

      this.ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
      this.ctx.strokeStyle = rColor;
      this.ctx.lineWidth = 1;
      this.ctx.beginPath();
      this.ctx.roundRect(px - textW / 2 - 4, py - 24, textW + 8, 12, 3);
      this.ctx.fill();
      this.ctx.stroke();

      this.ctx.fillStyle = '#ffffff';
      this.ctx.fillText(nameText, px, py - 15);

      // Distance prompt
      const dist = Math.hypot(this.playerPos.x - gr.x, this.playerPos.y - gr.y);
      if (dist < 38) {
        this.ctx.fillStyle = '#ffd700';
        this.ctx.font = 'bold 9px sans-serif';
        this.ctx.fillText('▼ [E] ОСМОТРЕТЬ', px, py - 28);
      }

      this.ctx.restore();
    }
  }

  private renderBlackHoles() {
    for (const bh of this.blackHoles) {
      this.ctx.save();
      // Outer event horizon distortion
      const radGrad = this.ctx.createRadialGradient(bh.x, bh.y, 4, bh.x, bh.y, bh.radius);
      radGrad.addColorStop(0, '#000000');
      radGrad.addColorStop(0.4, 'rgba(88, 28, 135, 0.8)');
      radGrad.addColorStop(0.8, 'rgba(192, 132, 252, 0.3)');
      radGrad.addColorStop(1, 'rgba(0,0,0,0)');
      this.ctx.fillStyle = radGrad;
      this.ctx.beginPath();
      this.ctx.arc(bh.x, bh.y, bh.radius, 0, Math.PI * 2);
      this.ctx.fill();

      // Black Hole core
      this.ctx.fillStyle = '#000000';
      this.ctx.strokeStyle = '#c084fc';
      this.ctx.lineWidth = 2;
      this.ctx.beginPath();
      this.ctx.arc(bh.x, bh.y, 14, 0, Math.PI * 2);
      this.ctx.fill();
      this.ctx.stroke();

      this.ctx.restore();
    }
  }

  private renderBrimstoneBeams() {
    for (const beam of this.brimstoneBeams) {
      this.ctx.save();
      const alpha = beam.life / beam.maxLife;
      this.ctx.strokeStyle = `rgba(239, 68, 68, ${alpha})`;
      this.ctx.lineWidth = 14;
      this.ctx.lineCap = 'round';
      this.ctx.shadowColor = '#ef4444';
      this.ctx.shadowBlur = 20;

      // Outer Crimson Beam
      this.ctx.beginPath();
      this.ctx.moveTo(beam.x1, beam.y1);
      this.ctx.lineTo(beam.x2, beam.y2);
      this.ctx.stroke();

      // Inner White Core
      this.ctx.strokeStyle = `rgba(255, 255, 255, ${alpha})`;
      this.ctx.lineWidth = 4;
      this.ctx.beginPath();
      this.ctx.moveTo(beam.x1, beam.y1);
      this.ctx.lineTo(beam.x2, beam.y2);
      this.ctx.stroke();

      this.ctx.restore();
    }
  }

  private renderMeatCubes() {
    if (!this.player.relics.some((r) => r?.id === 'meat_cube')) return;
    this.ctx.save();
    const cubes = [
      { x: this.playerPos.x + Math.cos(this.meatCubeAngle) * 36, y: this.playerPos.y + Math.sin(this.meatCubeAngle) * 36 },
      { x: this.playerPos.x + Math.cos(this.meatCubeAngle + Math.PI) * 36, y: this.playerPos.y + Math.sin(this.meatCubeAngle + Math.PI) * 36 },
    ];

    for (const c of cubes) {
      this.ctx.fillStyle = '#dc2626';
      this.ctx.strokeStyle = '#450a0a';
      this.ctx.lineWidth = 1.5;
      this.ctx.shadowColor = '#ef4444';
      this.ctx.shadowBlur = 8;
      this.ctx.fillRect(c.x - 6, c.y - 6, 12, 12);
      this.ctx.strokeRect(c.x - 6, c.y - 6, 12, 12);

      // Meat eye / details
      this.ctx.fillStyle = '#ffffff';
      this.ctx.fillRect(c.x - 2, c.y - 2, 4, 4);
      this.ctx.fillStyle = '#000000';
      this.ctx.fillRect(c.x - 1, c.y - 1, 2, 2);
    }
    this.ctx.restore();
  }

  private renderGodheadAura() {
    const hasGodhead = this.player.relics.some((r) => r?.id === 'godhead_halo') || this.player.activeSynergy?.includes('БОЖЕСТВЕННЫЙ АБСОЛЮТ');
    if (!hasGodhead) return;

    this.ctx.save();
    const rad = this.player.activeSynergy?.includes('БОЖЕСТВЕННЫЙ АБСОЛЮТ') ? 170 : 110;
    const pulse = Math.sin(performance.now() * 0.005) * 6;

    const auraGrad = this.ctx.createRadialGradient(
      this.playerPos.x,
      this.playerPos.y,
      10,
      this.playerPos.x,
      this.playerPos.y,
      rad + pulse
    );
    auraGrad.addColorStop(0, 'rgba(255, 215, 0, 0.35)');
    auraGrad.addColorStop(0.7, 'rgba(250, 204, 21, 0.15)');
    auraGrad.addColorStop(1, 'rgba(0,0,0,0)');

    this.ctx.fillStyle = auraGrad;
    this.ctx.beginPath();
    this.ctx.arc(this.playerPos.x, this.playerPos.y, rad + pulse, 0, Math.PI * 2);
    this.ctx.fill();

    this.ctx.strokeStyle = '#ffd700';
    this.ctx.lineWidth = 1.2;
    this.ctx.setLineDash([6, 4]);
    this.ctx.beginPath();
    this.ctx.arc(this.playerPos.x, this.playerPos.y, rad + pulse, 0, Math.PI * 2);
    this.ctx.stroke();

    this.ctx.restore();
  }

  private renderUltimateVisuals() {
    if (this.timeFreezeTimer <= 0) return;
    this.ctx.save();

    // Blue matrix temporal grid
    this.ctx.fillStyle = 'rgba(56, 189, 248, 0.12)';
    this.ctx.fillRect(this.camera.x - 300, this.camera.y - 300, 600, 600);

    this.ctx.font = 'bold 16px sans-serif';
    this.ctx.fillStyle = '#38bdf8';
    this.ctx.textAlign = 'center';
    this.ctx.shadowColor = '#0284c7';
    this.ctx.shadowBlur = 10;
    this.ctx.fillText(`⏳ ОСТАНОВКА ВРЕМЕНИ: ${this.timeFreezeTimer.toFixed(1)}с`, this.playerPos.x, this.playerPos.y - 45);

    this.ctx.restore();
  }
}
