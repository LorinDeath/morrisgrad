// engine.ts - Master Engine for "Путь Аскетов: Осада Цитадели" with Working Construction, Dynamic Quests, & Complete Gameplay System

import { SoundEngine } from './audio';
import { AssetManager } from './assets';
import { 
  HeroUnit, PawnUnit, WarriorUnit, ArcherUnit, MonkUnit, LancerUnit, BossUnit,
  Building, ResourceNode, DecorationEntity, Unit, BaseEntity 
} from './entities';
import type { 
  GamePhase, GameMode, Difficulty, Resources, UpgradeDef, 
  Projectile, FloatingTextItem, ParticleItem, ArmyCommand 
} from './types';

interface QuestStage {
  id: number;
  title: string;
  desc: string;
  targetCount: number;
  currentCount: number;
  rewardText: string;
  isCompleted: boolean;
}

export class TinySwordsEngine {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private minimapCanvas: HTMLCanvasElement;
  private minimapCtx: CanvasRenderingContext2D;
  private root: HTMLElement;

  private sound: SoundEngine;
  private assets: AssetManager;

  // World bounds
  public readonly worldWidth = 2600;
  public readonly worldHeight = 2000;

  // Camera & Screen Shake
  private camera = { x: 1000, y: 750 };
  private shakeTimer = 0;
  private shakeIntensity = 0;

  // Timing
  private lastTime = 0;
  private isRunning = false;
  private isPaused = false;
  private animFrameId: number | null = null;
  private totalElapsed = 0;

  // Game state
  private mode: GameMode = 'campaign';
  private difficulty: Difficulty = 'normal';
  private phase: GamePhase = 'day';
  private currentWave = 1;
  private maxWave = 10;
  private waveTimer = 50;
  private nightElapsed = 0;
  private armyCommand: ArmyCommand = 'follow';

  // Quests & Objectives
  private currentQuestIdx = 0;
  private quests: QuestStage[] = [
    {
      id: 1,
      title: '1. Основание Обители',
      desc: 'Постройте 1 Хижину и наймите 2 послушников',
      targetCount: 3, // 1 house + 2 pawns
      currentCount: 0,
      rewardText: '+120 🪵 +100 🪙 +60 XP',
      isCompleted: false
    },
    {
      id: 2,
      title: '2. Сбор Ресурсов',
      desc: 'Накопите 200 древесины и 200 золота',
      targetCount: 400,
      currentCount: 0,
      rewardText: '+80 🥩 +100 XP',
      isCompleted: false
    },
    {
      id: 3,
      title: '3. Ратное Воинство',
      desc: 'Постройте Казармы и наймите 2 мечников',
      targetCount: 3, // 1 barracks + 2 warriors
      currentCount: 0,
      rewardText: '+150 🪙 Реликвия Меча',
      isCompleted: false
    },
    {
      id: 4,
      title: '4. Бастион Небес',
      desc: 'Постройте Сторожевую Башню для защиты Цитадели',
      targetCount: 1,
      currentCount: 0,
      rewardText: '+100 🪵 +Огненные Стрелы',
      isCompleted: false
    },
    {
      id: 5,
      title: '5. Святая Молитва',
      desc: 'Постройте Монастырь и наймите монаха-целителя',
      targetCount: 2, // 1 monastery + 1 monk
      currentCount: 0,
      rewardText: '+Благодать Монахов +150 XP',
      isCompleted: false
    },
    {
      id: 6,
      title: '6. Сокрушение Тьмы',
      desc: 'Уничтожьте Черную Крепость на севере ИЛИ выдержите 10 волн!',
      targetCount: 10,
      currentCount: 1,
      rewardText: 'ВЕЛИКИЙ ТРИУМФ МОРРИСГРАДА!',
      isCompleted: false
    }
  ];

  // Economy & Resources
  private resources: Resources = {
    wood: 180,
    gold: 180,
    food: 60,
    pop: 4,
    maxPop: 15
  };

  // Stats
  private stats = {
    kills: 0,
    woodHarvested: 0,
    goldMined: 0,
    unitsRecruited: 0,
    score: 0
  };

  // Upgrades
  private upgrades: UpgradeDef[] = [
    { id: 'blade_sharpness', title: 'Клинок Праведника', desc: '+25% к урону Героя и Воинов', icon: '🗡️', level: 0, maxLevel: 5 },
    { id: 'archer_multishot', title: 'Залп Небес', desc: 'Лучники выпускают дополнительную стрелу', icon: '🏹', level: 0, maxLevel: 3 },
    { id: 'fortified_walls', title: 'Щит Аскезы', desc: '+30% к здоровью всех зданий и Цитадели', icon: '🛡️', level: 0, maxLevel: 5 },
    { id: 'holy_light', title: 'Благодать Монахов', desc: 'Монахи исцеляют в 2 раза эффективнее', icon: '⛪', level: 0, maxLevel: 4 },
    { id: 'peasant_diligence', title: 'Усердие Послушников', desc: 'Пешки добывают на +50% больше ресурсов', icon: '⛏️', level: 0, maxLevel: 4 },
    { id: 'flaming_towers', title: 'Огненные Башни', desc: 'Башни стреляют зажигательными стрелами', icon: '🔥', level: 0, maxLevel: 3 },
    { id: 'divine_dash', title: 'Громовой Рывок', desc: 'Рывок отбрасывает врагов и наносит урон', icon: '⚡', level: 0, maxLevel: 3 },
    { id: 'golden_harvest', title: 'Золотая Жила', desc: 'Пассивный доход +15 золота каждые 10 секунд', icon: '💰', level: 0, maxLevel: 3 }
  ];

  // Entities
  private hero!: HeroUnit;
  private castle!: Building;
  private dreadCastle: Building | null = null;
  private friendlyUnits: Unit[] = [];
  private enemyUnits: Unit[] = [];
  private buildings: Building[] = [];
  private resourceNodes: ResourceNode[] = [];
  private decorations: DecorationEntity[] = [];
  private projectiles: Projectile[] = [];
  private particles: ParticleItem[] = [];
  private floatingTexts: FloatingTextItem[] = [];
  private shockwaves: { x: number; y: number; radius: number; maxRadius: number; life: number }[] = [];

  // RTS Box Selection
  private isBoxSelecting = false;
  private boxStartX = 0;
  private boxStartY = 0;
  private boxCurrentX = 0;
  private boxCurrentY = 0;

  // Building placement
  private selectedBuildType: string | null = null;
  private mouseWorldX = 0;
  private mouseWorldY = 0;

  // Inputs
  private keys: Record<string, boolean> = {};
  private joystickVector = { x: 0, y: 0 };
  private touchActive = false;

  constructor(canvas: HTMLCanvasElement, minimapCanvas: HTMLCanvasElement, root: HTMLElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
    this.minimapCanvas = minimapCanvas;
    this.minimapCtx = minimapCanvas.getContext('2d')!;
    this.root = root;

    this.sound = new SoundEngine();
    this.assets = new AssetManager();

    this.initCanvasSize();
    this.initEvents();
    this.loadSavedStats();
  }

  private initCanvasSize() {
    const resize = () => {
      this.canvas.width = window.innerWidth;
      this.canvas.height = window.innerHeight;
      this.ctx.imageSmoothingEnabled = false;
    };
    window.addEventListener('resize', resize);
    resize();
  }

  private loadSavedStats() {
    try {
      const data = localStorage.getItem('ascetic_path_stats');
      if (data) {
        const parsed = JSON.parse(data);
        const wElem = this.root.querySelector('#stat-high-wave');
        const kElem = this.root.querySelector('#stat-high-kills');
        if (wElem) wElem.textContent = parsed.highWave || '0';
        if (kElem) kElem.textContent = parsed.highKills || '0';
      }
    } catch (e) {}
  }

  private saveStats() {
    try {
      const existing = localStorage.getItem('ascetic_path_stats');
      const prev = existing ? JSON.parse(existing) : { highWave: 0, highKills: 0 };
      const updated = {
        highWave: Math.max(prev.highWave || 0, this.currentWave),
        highKills: Math.max(prev.highKills || 0, this.stats.kills)
      };
      localStorage.setItem('ascetic_path_stats', JSON.stringify(updated));
    } catch (e) {}
  }

  public startGame(mode: GameMode = 'campaign', difficulty: Difficulty = 'normal') {
    this.mode = mode;
    this.difficulty = difficulty;
    this.isRunning = true;
    this.isPaused = false;
    this.phase = 'day';
    this.currentWave = 1;
    this.waveTimer = 50;
    this.nightElapsed = 0;
    this.totalElapsed = 0;
    this.currentQuestIdx = 0;

    const startRes = difficulty === 'easy' ? 240 : difficulty === 'hard' ? 120 : 180;
    this.resources = {
      wood: startRes,
      gold: startRes,
      food: 60,
      pop: 4,
      maxPop: 15
    };

    this.stats = {
      kills: 0,
      woodHarvested: 0,
      goldMined: 0,
      unitsRecruited: 0,
      score: 0
    };

    this.upgrades.forEach(u => u.level = 0);
    this.initWorld();

    this.root.querySelector('#screen-menu')?.classList.remove('active');
    this.root.querySelector('#screen-game')?.classList.add('active');
    this.root.querySelector('#modal-gameover')?.classList.remove('active');
    this.root.querySelector('#modal-pause')?.classList.remove('active');
    this.root.querySelector('#modal-upgrade')?.classList.remove('active');

    this.updateUI();

    this.lastTime = performance.now();
    this.loop(this.lastTime);
  }

  private initWorld() {
    this.friendlyUnits = [];
    this.enemyUnits = [];
    this.buildings = [];
    this.resourceNodes = [];
    this.decorations = [];
    this.projectiles = [];
    this.particles = [];
    this.floatingTexts = [];
    this.shockwaves = [];

    const centerX = this.worldWidth * 0.45;
    const centerY = this.worldHeight * 0.52;

    // 1. Citadel
    this.castle = new Building(centerX, centerY, 'castle', 'player');
    this.buildings.push(this.castle);

    // 2. Hero Unit
    this.hero = new HeroUnit(centerX, centerY + 130);

    // 3. Initial Squad: 2 Pawns, 1 Warrior, 1 Archer
    const pawn1 = new PawnUnit(centerX - 80, centerY + 110);
    const pawn2 = new PawnUnit(centerX + 80, centerY + 110);
    const war1 = new WarriorUnit(centerX - 40, centerY + 150, 'blue');
    const arch1 = new ArcherUnit(centerX + 40, centerY + 150, 'blue');
    this.friendlyUnits.push(pawn1, pawn2, war1, arch1);
    this.resources.pop = this.friendlyUnits.length;

    // 4. Dread Outpost (North-East)
    const dreadX = this.worldWidth * 0.82;
    const dreadY = this.worldHeight * 0.22;
    this.dreadCastle = new Building(dreadX, dreadY, 'castle', 'enemy');
    const dreadTower1 = new Building(dreadX - 100, dreadY + 80, 'tower', 'enemy');
    const dreadTower2 = new Building(dreadX + 100, dreadY + 80, 'tower', 'enemy');
    this.buildings.push(this.dreadCastle, dreadTower1, dreadTower2);

    // 5. Allied Golden Order Camp (South-East)
    const goldCampX = this.worldWidth * 0.78;
    const goldCampY = this.worldHeight * 0.8;
    const goldMonastery = new Building(goldCampX, goldCampY, 'monastery', 'player');
    this.buildings.push(goldMonastery);
    const allyKnight = new WarriorUnit(goldCampX - 40, goldCampY + 60, 'yellow');
    const allyMonk = new MonkUnit(goldCampX + 40, goldCampY + 60, 'yellow');
    this.friendlyUnits.push(allyKnight, allyMonk);

    // 6. Resources
    for (let i = 0; i < 35; i++) {
      const angle = Math.random() * Math.PI * 2;
      const dist = 240 + Math.random() * 950;
      const tx = centerX + Math.cos(angle) * dist;
      const ty = centerY + Math.sin(angle) * dist;
      if (tx > 90 && tx < this.worldWidth - 90 && ty > 90 && ty < this.worldHeight - 90) {
        const variant = 1 + (i % 4);
        this.resourceNodes.push(new ResourceNode(tx, ty, 'tree', variant));
      }
    }

    for (let i = 0; i < 10; i++) {
      const angle = Math.random() * Math.PI * 2;
      const dist = 320 + Math.random() * 850;
      const gx = centerX + Math.cos(angle) * dist;
      const gy = centerY + Math.sin(angle) * dist;
      const resType = i % 2 === 0 ? 'gold_mine' : 'gold_stone';
      this.resourceNodes.push(new ResourceNode(gx, gy, resType as any));
    }

    for (let i = 0; i < 12; i++) {
      const angle = Math.random() * Math.PI * 2;
      const dist = 200 + Math.random() * 750;
      const sx = centerX + Math.cos(angle) * dist;
      const sy = centerY + Math.sin(angle) * dist;
      this.resourceNodes.push(new ResourceNode(sx, sy, 'sheep'));
    }

    // 7. Decorations
    for (let i = 0; i < 15; i++) {
      const bx = 120 + Math.random() * (this.worldWidth - 240);
      const by = 120 + Math.random() * (this.worldHeight - 240);
      this.decorations.push(new DecorationEntity(bx, by, 'bush', (i % 2) + 1));
    }

    for (let i = 0; i < 12; i++) {
      const rx = 120 + Math.random() * (this.worldWidth - 240);
      const ry = 120 + Math.random() * (this.worldHeight - 240);
      this.decorations.push(new DecorationEntity(rx, ry, 'rock', (i % 2) + 1));
    }

    for (let i = 0; i < 8; i++) {
      const wx = 60 + Math.random() * (this.worldWidth - 120);
      const wy = 50 + (i % 2 === 0 ? 0 : this.worldHeight - 100);
      this.decorations.push(new DecorationEntity(wx, wy, 'water_rock', (i % 2) + 1));
    }

    for (let i = 0; i < 6; i++) {
      const cx = Math.random() * this.worldWidth;
      const cy = 100 + Math.random() * (this.worldHeight - 300);
      this.decorations.push(new DecorationEntity(cx, cy, 'cloud', (i % 3) + 1));
    }

    // Easter Egg: Rubber Duck in the eastern lake
    this.decorations.push(new DecorationEntity(centerX + 750, centerY + 280, 'duck'));
  }

  public triggerScreenShake(intensity: number = 8, duration: number = 0.3) {
    this.shakeIntensity = intensity;
    this.shakeTimer = duration;
  }

  // --- MAIN LOOP ---
  private loop = (time: number) => {
    if (!this.isRunning) return;

    const dt = Math.min((time - this.lastTime) / 1000, 0.1);
    this.lastTime = time;
    this.totalElapsed += dt;

    if (!this.isPaused) {
      this.update(dt);
    }
    this.render();

    this.animFrameId = requestAnimationFrame(this.loop);
  };

  // --- UPDATE LOGIC ---
  private update(dt: number) {
    if (this.shakeTimer > 0) this.shakeTimer -= dt;

    // Shockwaves
    for (let i = this.shockwaves.length - 1; i >= 0; i--) {
      const sw = this.shockwaves[i];
      sw.life -= dt;
      sw.radius += (sw.maxRadius / 0.4) * dt;
      if (sw.life <= 0) this.shockwaves.splice(i, 1);
    }

    // 1. Day / Night cycle
    if (this.phase === 'day') {
      this.waveTimer -= dt;
      if (this.waveTimer <= 0) {
        this.startNightPhase();
      }
    } else {
      this.nightElapsed += dt;
      if (this.enemyUnits.length === 0 && this.nightElapsed > 5) {
        this.completeWave();
      }
    }

    // 2. Castle Automatic Income & Passive Perk Income
    if (Math.floor(this.totalElapsed) % 5 === 0 && Math.random() < 0.05) {
      this.resources.gold += 12;
      const goldHarvestLvl = this.getUpgradeLevel('golden_harvest');
      if (goldHarvestLvl > 0) {
        this.resources.gold += 15 * goldHarvestLvl;
      }
    }

    // 3. Hero Movement & Input
    let moveX = 0;
    let moveY = 0;
    if (this.keys['KeyW'] || this.keys['ArrowUp']) moveY -= 1;
    if (this.keys['KeyS'] || this.keys['ArrowDown']) moveY += 1;
    if (this.keys['KeyA'] || this.keys['ArrowLeft']) moveX -= 1;
    if (this.keys['KeyD'] || this.keys['ArrowRight']) moveX += 1;

    if (this.touchActive) {
      moveX = this.joystickVector.x;
      moveY = this.joystickVector.y;
    }

    if (moveX !== 0 || moveY !== 0) {
      const len = Math.hypot(moveX, moveY);
      const spd = this.hero.isDashing ? this.hero.speed * 2.6 : this.hero.speed;
      this.hero.x += (moveX / len) * spd * dt;
      this.hero.y += (moveY / len) * spd * dt;
      this.hero.flipX = moveX < 0;
      this.hero.state = 'run';

      this.hero.x = Math.max(70, Math.min(this.worldWidth - 70, this.hero.x));
      this.hero.y = Math.max(70, Math.min(this.worldHeight - 70, this.hero.y));
    } else if (this.hero.state === 'run') {
      this.hero.state = 'idle';
    }

    this.hero.update(dt);

    // 4. Smooth Camera Lerp
    const targetCamX = this.hero.x - this.canvas.width / 2;
    const targetCamY = this.hero.y - this.canvas.height / 2;
    this.camera.x += (targetCamX - this.camera.x) * 0.1;
    this.camera.y += (targetCamY - this.camera.y) * 0.1;

    this.camera.x = Math.max(0, Math.min(this.worldWidth - this.canvas.width, this.camera.x));
    this.camera.y = Math.max(0, Math.min(this.worldHeight - this.canvas.height, this.camera.y));

    // 5. Update Friendly Units (Pawns with Autonomous Construction & Gathering)
    for (const unit of this.friendlyUnits) {
      unit.update(dt);

      if (unit.role === 'pawn') {
        const pawn = unit as PawnUnit;

        // AUTONOMOUS PEASANT AI: Build unbuilt buildings FIRST, then gather resources!
        if (pawn.activity === 'idle') {
          // Check unbuilt buildings
          const unbuilt = this.buildings.find(b => b.faction === 'player' && b.isUnderConstruction && !b.dead);
          if (unbuilt) {
            pawn.assignBuild(unbuilt);
          } else {
            // Find closest resource
            let closestRes: ResourceNode | null = null;
            let minDist = 450;
            for (const res of this.resourceNodes) {
              if (!res.dead && !res.isChopped) {
                const d = Math.hypot(res.x - pawn.x, res.y - pawn.y);
                if (d < minDist) {
                  minDist = d;
                  closestRes = res;
                }
              }
            }
            if (closestRes) {
              pawn.assignHarvest(closestRes, this.castle);
            }
          }
        }
      } else {
        if (!unit.isSelected) {
          if (this.armyCommand === 'follow') {
            const distToHero = Math.hypot(this.hero.x - unit.x, this.hero.y - unit.y);
            if (distToHero > 160) {
              unit.targetX = this.hero.x + (Math.random() - 0.5) * 90;
              unit.targetY = this.hero.y + (Math.random() - 0.5) * 90;
            }
          } else if (this.armyCommand === 'defend') {
            const distToCastle = Math.hypot(this.castle.x - unit.x, this.castle.y - unit.y);
            if (distToCastle > 240) {
              unit.targetX = this.castle.x + (Math.random() - 0.5) * 160;
              unit.targetY = this.castle.y + (Math.random() - 0.5) * 160;
            }
          }
        }

        let nearestEnemy: Unit | null = null;
        let minDist = unit.attackRange * 1.5;
        for (const enemy of this.enemyUnits) {
          if (!enemy.dead) {
            const d = Math.hypot(enemy.x - unit.x, enemy.y - unit.y);
            if (d < minDist) {
              minDist = d;
              nearestEnemy = enemy;
            }
          }
        }

        if (nearestEnemy) {
          unit.targetEntity = nearestEnemy;
          if (minDist <= unit.attackRange && unit.attackTimer <= 0) {
            this.unitAttack(unit, nearestEnemy);
          }
        } else if (unit.role === 'monk') {
          const monk = unit as MonkUnit;
          if (monk.healTimer <= 0) {
            this.monkHeal(monk);
          }
        }
      }
    }

    // 6. Update Enemy Units AI
    for (const enemy of this.enemyUnits) {
      enemy.update(dt);

      let nearestTarget: BaseEntity | null = null;
      let minDist = 9999;

      const distHero = Math.hypot(this.hero.x - enemy.x, this.hero.y - enemy.y);
      if (distHero < minDist) {
        minDist = distHero;
        nearestTarget = this.hero;
      }

      for (const friendly of this.friendlyUnits) {
        if (!friendly.dead) {
          const d = Math.hypot(friendly.x - enemy.x, friendly.y - enemy.y);
          if (d < minDist) {
            minDist = d;
            nearestTarget = friendly;
          }
        }
      }

      for (const b of this.buildings) {
        if (!b.dead && b.faction === 'player') {
          const d = Math.hypot(b.x - enemy.x, b.y - enemy.y);
          if (d < minDist * 0.85) {
            minDist = d;
            nearestTarget = b;
          }
        }
      }

      if (nearestTarget) {
        enemy.targetEntity = nearestTarget as any;
        if (minDist <= enemy.attackRange && enemy.attackTimer <= 0) {
          this.enemyAttack(enemy, nearestTarget);
        }
      }
    }

    // 7. Update Towers
    for (const b of this.buildings) {
      b.update(dt);
      if (b.type === 'tower' && !b.isUnderConstruction && b.shootTimer <= 0) {
        if (b.faction === 'player') {
          for (const enemy of this.enemyUnits) {
            if (!enemy.dead && Math.hypot(enemy.x - b.x, enemy.y - b.y) < 280) {
              b.shootTimer = b.shootCooldown;
              const hasFire = this.getUpgradeLevel('flaming_towers') > 0;
              this.spawnProjectile(b.x, b.y - 70, enemy.x, enemy.y, 35, 'player', hasFire);
              this.sound.playBowShoot();
              break;
            }
          }
        } else {
          const targets = [this.hero, ...this.friendlyUnits];
          for (const t of targets) {
            if (!t.dead && Math.hypot(t.x - b.x, t.y - b.y) < 240) {
              b.shootTimer = b.shootCooldown;
              this.spawnProjectile(b.x, b.y - 70, t.x, t.y, 24, 'enemy');
              this.sound.playBowShoot();
              break;
            }
          }
        }
      }
    }

    // 8. Update Projectiles
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      p.progress += p.speed * dt;
      p.x = p.startX + (p.targetX - p.startX) * p.progress;
      p.y = p.startY + (p.targetY - p.startY) * p.progress;

      if (p.progress >= 1) {
        this.sound.playArrowHit();
        this.spawnDust(p.targetX, p.targetY);

        if (p.faction === 'player') {
          for (const enemy of this.enemyUnits) {
            if (!enemy.dead && Math.hypot(enemy.x - p.targetX, enemy.y - p.targetY) < 32) {
              const dmg = enemy.takeDamage(p.damage, false);
              this.spawnFloatingText(enemy.x, enemy.y - 20, `-${dmg}`, p.isFire ? '#f59e0b' : '#fff');
              if (p.isFire) this.spawnExplosion(enemy.x, enemy.y);
              if (enemy.dead) this.handleEnemyDeath(enemy);
              break;
            }
          }
        } else {
          if (Math.hypot(this.hero.x - p.targetX, this.hero.y - p.targetY) < 30) {
            const dmg = this.hero.takeDamage(p.damage, true);
            this.spawnFloatingText(this.hero.x, this.hero.y - 20, `-${dmg}`, '#ef4444');
          } else {
            for (const f of this.friendlyUnits) {
              if (!f.dead && Math.hypot(f.x - p.targetX, f.y - p.targetY) < 28) {
                const dmg = f.takeDamage(p.damage, true);
                this.spawnFloatingText(f.x, f.y - 20, `-${dmg}`, '#ef4444');
                break;
              }
            }
          }
        }
        this.projectiles.splice(i, 1);
      }
    }

    // 9. Update Resources & Decorations
    for (const res of this.resourceNodes) res.update(dt);
    for (const dec of this.decorations) dec.update(dt);

    // 10. Update Floating Texts & Particles
    for (let i = this.floatingTexts.length - 1; i >= 0; i--) {
      const ft = this.floatingTexts[i];
      ft.y += ft.vy * dt;
      ft.life -= dt;
      if (ft.life <= 0) this.floatingTexts.splice(i, 1);
    }

    for (let i = this.particles.length - 1; i >= 0; i--) {
      const pt = this.particles[i];
      pt.x += pt.vx * dt;
      pt.y += pt.vy * dt;
      pt.frameTime += dt;
      if (pt.frameTime >= pt.maxFrameTime) {
        pt.frameTime = 0;
        pt.frameIndex++;
      }
      pt.life -= dt;
      if (pt.life <= 0 || pt.frameIndex >= pt.totalFrames) {
        this.particles.splice(i, 1);
      }
    }

    // 11. Cleanup Dead
    this.friendlyUnits = this.friendlyUnits.filter(u => !u.dead);
    this.enemyUnits = this.enemyUnits.filter(u => !u.dead);
    this.buildings = this.buildings.filter(b => !b.dead);
    this.resources.pop = this.friendlyUnits.length;

    // 12. Check Quests Progress
    this.checkQuests();

    // 13. Check Dread Castle destruction
    if (this.dreadCastle && this.dreadCastle.dead) {
      this.dreadCastle = null;
      this.sound.playVictory();
      this.spawnFloatingText(this.hero.x, this.hero.y - 60, 'ТЕМНАЯ КРЕПОСТЬ РАЗРУШЕНА! ВЕЛИКИЙ ТРИУМФ!', '#ffd700', 26);
      this.triggerGameOver(true);
      return;
    }

    // 14. Check Player Loss
    if (this.castle.dead || this.hero.dead) {
      this.triggerGameOver(false);
    }

    // 15. Citadel Heal Aura
    if (Math.hypot(this.hero.x - this.castle.x, this.hero.y - this.castle.y) < 160) {
      this.hero.heal(15 * dt);
    }

    this.updateUI();
  }

  // --- QUEST SYSTEM ---
  private checkQuests() {
    if (this.currentQuestIdx >= this.quests.length) return;
    const q = this.quests[this.currentQuestIdx];
    if (q.isCompleted) return;

    if (q.id === 1) {
      // 1 house + 2 pawns
      const houses = this.buildings.filter(b => b.type === 'house' && !b.isUnderConstruction).length;
      const pawns = this.friendlyUnits.filter(u => u.role === 'pawn').length;
      q.currentCount = Math.min(1, houses) + Math.min(2, pawns);
      if (houses >= 1 && pawns >= 2) this.finishQuest(q, 120, 100, 60);
    } else if (q.id === 2) {
      // 200 wood + 200 gold
      q.currentCount = Math.min(200, this.resources.wood) + Math.min(200, this.resources.gold);
      if (this.resources.wood >= 200 && this.resources.gold >= 200) this.finishQuest(q, 0, 0, 80);
    } else if (q.id === 3) {
      // 1 barracks + 2 warriors
      const barracks = this.buildings.filter(b => b.type === 'barracks' && !b.isUnderConstruction).length;
      const warriors = this.friendlyUnits.filter(u => u.role === 'warrior').length;
      q.currentCount = Math.min(1, barracks) + Math.min(2, warriors);
      if (barracks >= 1 && warriors >= 2) this.finishQuest(q, 80, 150, 0);
    } else if (q.id === 4) {
      // 1 tower
      const towers = this.buildings.filter(b => b.type === 'tower' && !b.isUnderConstruction).length;
      q.currentCount = Math.min(1, towers);
      if (towers >= 1) this.finishQuest(q, 100, 100, 0);
    } else if (q.id === 5) {
      // 1 monastery + 1 monk
      const mon = this.buildings.filter(b => b.type === 'monastery' && !b.isUnderConstruction).length;
      const monks = this.friendlyUnits.filter(u => u.role === 'monk').length;
      q.currentCount = Math.min(1, mon) + Math.min(1, monks);
      if (mon >= 1 && monks >= 1) this.finishQuest(q, 100, 100, 50);
    } else if (q.id === 6) {
      q.currentCount = this.currentWave;
    }
  }

  private finishQuest(q: QuestStage, woodReward: number, goldReward: number, foodReward: number) {
    q.isCompleted = true;
    this.sound.playVictory();
    this.resources.wood += woodReward;
    this.resources.gold += goldReward;
    this.resources.food += foodReward;
    this.hero.addXp(100);

    this.spawnFloatingText(this.hero.x, this.hero.y - 50, `СВЯЩЕННАЯ МИССИЯ ВЫПОЛНЕНА!`, '#ffd700', 22);
    this.spawnFloatingText(this.hero.x, this.hero.y - 25, q.rewardText, '#00ffcc', 16);

    setTimeout(() => {
      this.currentQuestIdx++;
    }, 2000);
  }

  // --- COMBAT ACTIONS ---
  private unitAttack(attacker: Unit, target: BaseEntity) {
    attacker.attackTimer = attacker.attackCooldown;
    attacker.state = 'attack';

    if (attacker.role === 'archer') {
      this.sound.playBowShoot();
      const multishot = this.getUpgradeLevel('archer_multishot') > 0;
      this.spawnProjectile(attacker.x, attacker.y - 15, target.x, target.y, attacker.attackDamage, 'player');
      if (multishot) {
        setTimeout(() => {
          this.spawnProjectile(attacker.x, attacker.y - 15, target.x + 12, target.y + 12, attacker.attackDamage, 'player');
        }, 120);
      }
    } else {
      this.sound.playSwordSwing();
      setTimeout(() => {
        if (!attacker.dead && !target.dead) {
          const dmgBonus = this.getUpgradeLevel('blade_sharpness') * 0.25;
          const dmg = (target as any).takeDamage(Math.round(attacker.attackDamage * (1 + dmgBonus)), true);
          this.sound.playSwordHit();
          this.spawnFloatingText(target.x, target.y - 20, `-${dmg}`, '#ffd700');
          if ((target as any).dead && (target as Unit).faction === 'enemy') {
            this.handleEnemyDeath(target as Unit);
          }
        }
      }, 200);
    }
  }

  private enemyAttack(attacker: Unit, target: BaseEntity) {
    attacker.attackTimer = attacker.attackCooldown;
    attacker.state = 'attack';

    if (attacker.role === 'enemy_archer') {
      this.sound.playBowShoot();
      this.spawnProjectile(attacker.x, attacker.y - 15, target.x, target.y, attacker.attackDamage, 'enemy');
    } else {
      setTimeout(() => {
        if (!attacker.dead && !target.dead) {
          const dmg = (target as any).takeDamage(attacker.attackDamage, true);
          this.sound.playSwordHit();
          this.spawnFloatingText(target.x, target.y - 20, `-${dmg}`, '#ef4444');
        }
      }, 250);
    }
  }

  public heroAttack() {
    if (this.hero.dead || this.hero.attackTimer > 0) return;

    // HERO BUILD ASSIST: If standing near unbuilt building, build it!
    for (const b of this.buildings) {
      if (b.faction === 'player' && b.isUnderConstruction && !b.dead) {
        const d = Math.hypot(b.x - this.hero.x, b.y - this.hero.y);
        if (d < 75) {
          this.hero.attackTimer = 0.35;
          this.hero.state = 'attack';
          this.sound.playBuild();
          this.spawnDust(b.x, b.y);
          b.repair(160);
          this.spawnFloatingText(b.x, b.y - 40, '+СТРОЙКА!', '#ffd700', 16);
          return;
        }
      }
    }

    this.hero.attackTimer = this.hero.attackCooldown;
    this.hero.state = 'attack';
    this.hero.comboStep = (this.hero.comboStep + 1) % 2;

    this.sound.playSwordSwing();

    const reach = this.hero.attackRange + 25;
    const facingDir = this.hero.flipX ? -1 : 1;
    const slashCenterX = this.hero.x + facingDir * 32;
    const slashCenterY = this.hero.y;

    this.spawnDust(slashCenterX, slashCenterY);

    for (const enemy of this.enemyUnits) {
      if (!enemy.dead) {
        const d = Math.hypot(enemy.x - slashCenterX, enemy.y - slashCenterY);
        if (d < reach) {
          const dmgMult = 1 + this.getUpgradeLevel('blade_sharpness') * 0.25;
          const isCrit = Math.random() < 0.35;
          const raw = this.hero.attackDamage * (isCrit ? 2.0 : 1) * dmgMult;
          const dmg = enemy.takeDamage(Math.round(raw), false);

          this.sound.playSwordHit();
          this.triggerScreenShake(isCrit ? 5 : 2, 0.15);
          this.spawnFloatingText(enemy.x, enemy.y - 25, `${isCrit ? '💥 ' : ''}-${dmg}`, isCrit ? '#f59e0b' : '#fff', isCrit ? 18 : 14);

          enemy.x += facingDir * 24;
          if (enemy.dead) {
            this.handleEnemyDeath(enemy);
          }
        }
      }
    }
  }

  public heroWhirlwind() {
    if (this.hero.dead || this.hero.whirlTimer > 0) return;
    this.hero.whirlTimer = this.hero.whirlCooldown;

    this.sound.playExplosion();
    this.triggerScreenShake(8, 0.3);
    this.spawnExplosion(this.hero.x, this.hero.y);

    this.shockwaves.push({
      x: this.hero.x,
      y: this.hero.y,
      radius: 0,
      maxRadius: 160,
      life: 0.4
    });

    const radius = 150;
    for (const enemy of this.enemyUnits) {
      if (!enemy.dead) {
        const d = Math.hypot(enemy.x - this.hero.x, enemy.y - this.hero.y);
        if (d < radius) {
          const dmg = enemy.takeDamage(Math.round(this.hero.attackDamage * 2.6), false);
          this.spawnFloatingText(enemy.x, enemy.y - 30, `🌪️ -${dmg}`, '#ffd700', 18);
          if (enemy.dead) this.handleEnemyDeath(enemy);
        }
      }
    }
  }

  public heroDash() {
    if (this.hero.dead || this.hero.dashTimer > 0) return;
    this.hero.dashTimer = this.hero.dashCooldown;
    this.hero.isDashing = true;
    this.hero.dashDuration = 0.28;
    this.sound.playSwordSwing();
    this.spawnDust(this.hero.x, this.hero.y);

    const dashLvl = this.getUpgradeLevel('divine_dash');
    if (dashLvl > 0) {
      for (const enemy of this.enemyUnits) {
        if (!enemy.dead && Math.hypot(enemy.x - this.hero.x, enemy.y - this.hero.y) < 65) {
          enemy.takeDamage(35 * dashLvl, false);
          enemy.x += this.hero.flipX ? -45 : 45;
        }
      }
    }
  }

  public heroRally() {
    if (this.hero.dead || this.hero.rallyTimer > 0) return;
    this.hero.rallyTimer = this.hero.rallyCooldown;
    this.sound.playHorn();

    for (const unit of this.friendlyUnits) {
      unit.heal(40);
      unit.speed += 30;
      setTimeout(() => unit.speed -= 30, 5000);
      this.spawnFloatingText(unit.x, unit.y - 20, '🎺 БЛАГОСЛОВЕНИЕ!', '#ffd700', 14);
    }
  }

  private monkHeal(monk: MonkUnit) {
    monk.healTimer = monk.healCooldown;
    monk.state = 'heal';

    this.sound.playHeal();
    const healPower = Math.round(35 * (1 + this.getUpgradeLevel('holy_light') * 1.0));

    const targets = [this.hero, ...this.friendlyUnits];
    for (const target of targets) {
      if (!target.dead && Math.hypot(target.x - monk.x, target.y - monk.y) < 160) {
        const healed = target.heal(healPower);
        if (healed > 0) {
          this.spawnFloatingText(target.x, target.y - 20, `+${healed} HP`, '#22c55e', 14);
        }
      }
    }
  }

  private handleEnemyDeath(enemy: Unit) {
    this.stats.kills++;
    this.stats.score += 70;

    const goldDrop = 12 + Math.floor(Math.random() * 12);
    this.resources.gold += goldDrop;
    this.spawnFloatingText(enemy.x, enemy.y, `+${goldDrop} 🪙`, '#ffd700', 14);

    const leveled = this.hero.addXp(40);
    if (leveled) {
      this.sound.playVictory();
      this.spawnFloatingText(this.hero.x, this.hero.y - 45, `УРОВЕНЬ ${this.hero.level}!`, '#00ffcc', 22);
    }
  }

  // --- DAY / NIGHT WAVES ---
  private startNightPhase() {
    this.phase = 'night';
    this.nightElapsed = 0;
    this.sound.setPhase('night');
    this.sound.playHorn();

    this.spawnFloatingText(this.hero.x, this.hero.y - 50, 'ОСАДА НАЧАЛАСЬ!', '#ef4444', 26);

    const count = 5 + this.currentWave * 4;
    for (let i = 0; i < count; i++) {
      const side = Math.floor(Math.random() * 4);
      let sx = 0;
      let sy = 0;
      if (side === 0) { sx = Math.random() * this.worldWidth; sy = 50; }
      else if (side === 1) { sx = Math.random() * this.worldWidth; sy = this.worldHeight - 50; }
      else if (side === 2) { sx = 50; sy = Math.random() * this.worldHeight; }
      else { sx = this.worldWidth - 50; sy = Math.random() * this.worldHeight; }

      const rand = Math.random();
      if (rand < 0.45) {
        this.enemyUnits.push(new WarriorUnit(sx, sy, 'black'));
      } else if (rand < 0.75) {
        this.enemyUnits.push(new ArcherUnit(sx, sy, 'red'));
      } else {
        this.enemyUnits.push(new LancerUnit(sx, sy, 'black'));
      }
    }

    if (this.currentWave === 5 || this.currentWave === 10) {
      const boss = new BossUnit(this.worldWidth * 0.82, this.worldHeight * 0.28);
      this.enemyUnits.push(boss);
      const bossWrap = this.root.querySelector('#hud-boss-wrap') as HTMLElement;
      if (bossWrap) bossWrap.style.display = 'block';
    }
  }

  private completeWave() {
    this.sound.playVictory();
    this.phase = 'day';
    this.waveTimer = 50;
    this.sound.setPhase('day');

    const bossWrap = this.root.querySelector('#hud-boss-wrap') as HTMLElement;
    if (bossWrap) bossWrap.style.display = 'none';

    this.resources.gold += 70 * this.currentWave;
    this.resources.wood += 60 * this.currentWave;

    if (this.mode === 'campaign' && this.currentWave >= this.maxWave) {
      this.triggerGameOver(true);
      return;
    }

    this.currentWave++;
    this.saveStats();
    this.showUpgradeModal();
  }

  private showUpgradeModal() {
    this.isPaused = true;
    const modal = this.root.querySelector('#modal-upgrade') as HTMLElement;
    const grid = this.root.querySelector('#upgrade-cards-list') as HTMLElement;
    if (!modal || !grid) return;

    grid.innerHTML = '';
    const available = this.upgrades.filter(u => u.level < u.maxLevel);
    const shuffled = [...available].sort(() => Math.random() - 0.5).slice(0, 3);

    for (const upg of shuffled) {
      const card = document.createElement('div');
      card.className = 'upgrade-card';
      card.innerHTML = `
        <span class="upgrade-icon">${upg.icon}</span>
        <span class="upgrade-title">${upg.title} (${upg.level + 1}/${upg.maxLevel})</span>
        <span class="upgrade-desc">${upg.desc}</span>
      `;
      card.addEventListener('click', () => {
        upg.level++;
        modal.classList.remove('active');
        this.isPaused = false;
        this.sound.playVictory();
        this.spawnFloatingText(this.hero.x, this.hero.y - 30, `БЛАГОСЛОВЕНИЕ: ${upg.title}`, '#ffd700', 16);
      });
      grid.appendChild(card);
    }

    modal.classList.add('active');
  }

  public getUpgradeLevel(id: string): number {
    const upg = this.upgrades.find(u => u.id === id);
    return upg ? upg.level : 0;
  }

  // --- RECRUITMENT ---
  public recruitPawn() {
    if (this.resources.gold < 25 || this.resources.food < 10) {
      this.spawnFloatingText(this.hero.x, this.hero.y - 20, 'Не хватает золота (25) или еды (10)!', '#ef4444');
      return;
    }
    if (this.resources.pop >= this.resources.maxPop) {
      this.spawnFloatingText(this.hero.x, this.hero.y - 20, 'Лимит населения! Постройте хижину.', '#ef4444');
      return;
    }

    this.resources.gold -= 25;
    this.resources.food -= 10;
    this.stats.unitsRecruited++;

    const pawn = new PawnUnit(this.castle.x + 20, this.castle.y + 60);
    this.friendlyUnits.push(pawn);
    this.sound.playBuild();
    this.spawnFloatingText(pawn.x, pawn.y - 20, '+1 Послушник', '#34d399');
  }

  public trainUnit(type: 'warrior' | 'archer' | 'monk' | 'lancer') {
    let goldCost = 50;
    let woodCost = 20;

    if (type === 'archer') { goldCost = 60; woodCost = 40; }
    else if (type === 'monk') { goldCost = 80; woodCost = 0; }
    else if (type === 'lancer') { goldCost = 70; woodCost = 30; }

    if (this.resources.gold < goldCost || this.resources.wood < woodCost) {
      this.spawnFloatingText(this.hero.x, this.hero.y - 20, 'Не хватает ресурсов для найма!', '#ef4444');
      return;
    }
    if (this.resources.pop >= this.resources.maxPop) {
      this.spawnFloatingText(this.hero.x, this.hero.y - 20, 'Лимит населения! Постройте дом.', '#ef4444');
      return;
    }

    this.resources.gold -= goldCost;
    this.resources.wood -= woodCost;
    this.stats.unitsRecruited++;

    let unit: Unit;
    const sx = this.castle.x + (Math.random() - 0.5) * 60;
    const sy = this.castle.y + 70;

    if (type === 'warrior') unit = new WarriorUnit(sx, sy, 'blue');
    else if (type === 'archer') unit = new ArcherUnit(sx, sy, 'blue');
    else if (type === 'monk') unit = new MonkUnit(sx, sy, 'blue');
    else unit = new LancerUnit(sx, sy, 'blue');

    this.friendlyUnits.push(unit);
    this.sound.playBuild();
    this.spawnFloatingText(unit.x, unit.y - 20, `+1 ${unit.role.toUpperCase()}`, '#ffd700');
  }

  // --- BUILDING PLACEMENT & ASSIGNMENT ---
  public selectBuildingPlacement(type: string) {
    this.selectedBuildType = type;
    const tip = this.root.querySelector('#hud-interaction-tip') as HTMLElement;
    if (tip) tip.style.display = 'block';
  }

  public cancelBuildingPlacement() {
    this.selectedBuildType = null;
    const tip = this.root.querySelector('#hud-interaction-tip') as HTMLElement;
    if (tip) tip.style.display = 'none';
  }

  public placeBuildingAt(worldX: number, worldY: number) {
    if (!this.selectedBuildType) return;

    let woodCost = 50;
    let goldCost = 30;

    if (this.selectedBuildType === 'barracks') { woodCost = 80; goldCost = 50; }
    else if (this.selectedBuildType === 'archery') { woodCost = 70; goldCost = 60; }
    else if (this.selectedBuildType === 'monastery') { woodCost = 100; goldCost = 90; }
    else if (this.selectedBuildType === 'tower') { woodCost = 60; goldCost = 40; }
    else if (this.selectedBuildType === 'house') { woodCost = 40; goldCost = 20; }

    if (this.resources.wood < woodCost || this.resources.gold < goldCost) {
      this.spawnFloatingText(worldX, worldY, 'Не хватает дерева или золота!', '#ef4444');
      return;
    }

    this.resources.wood -= woodCost;
    this.resources.gold -= goldCost;

    const b = new Building(worldX, worldY, this.selectedBuildType as any, 'player', true);
    this.buildings.push(b);
    this.sound.playBuild();

    // AUTO-ASSIGN: Direct any available pawns to build this site immediately!
    const idlePawns = this.friendlyUnits.filter(u => u.role === 'pawn' && (u as PawnUnit).activity !== 'building') as PawnUnit[];
    const toAssign = idlePawns.slice(0, 2);
    for (const p of toAssign) {
      p.assignBuild(b);
    }

    if (this.selectedBuildType === 'house') {
      this.resources.maxPop += 5;
    }

    this.spawnFloatingText(worldX, worldY - 30, 'ФУНДАМЕНТ ЗАЛОЖЕН!', '#ffd700', 16);
    this.cancelBuildingPlacement();
  }

  // --- PROJECTILES & PARTICLES ---
  private spawnProjectile(
    startX: number, 
    startY: number, 
    targetX: number, 
    targetY: number, 
    damage: number, 
    faction: 'player' | 'enemy',
    isFire: boolean = false
  ) {
    this.projectiles.push({
      id: Math.random(),
      x: startX,
      y: startY,
      startX,
      startY,
      targetX,
      targetY,
      progress: 0,
      speed: 2.0,
      arcHeight: 50,
      damage,
      faction,
      isFire
    });
  }

  private spawnDust(x: number, y: number) {
    this.particles.push({
      x, y,
      vx: (Math.random() - 0.5) * 20,
      vy: (Math.random() - 0.5) * 20,
      spriteName: 'fx_dust1',
      frameIndex: 0,
      totalFrames: 8,
      frameTime: 0,
      maxFrameTime: 0.04,
      scale: 0.7,
      life: 0.32,
      maxLife: 0.32
    });
  }

  private spawnExplosion(x: number, y: number) {
    this.particles.push({
      x, y,
      vx: 0, vy: 0,
      spriteName: 'fx_explosion1',
      frameIndex: 0,
      totalFrames: 8,
      frameTime: 0,
      maxFrameTime: 0.05,
      scale: 0.9,
      life: 0.4,
      maxLife: 0.4
    });
  }

  private spawnFloatingText(x: number, y: number, text: string, color: string = '#fff', size: number = 14) {
    this.floatingTexts.push({
      x, y, text, color, size,
      life: 1.0, maxLife: 1.0, vy: -35
    });
  }

  // --- RENDERING (DIRECT CANVAS 2D) ---
  private render() {
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;

    ctx.clearRect(0, 0, w, h);

    ctx.save();

    let shakeX = 0;
    let shakeY = 0;
    if (this.shakeTimer > 0) {
      shakeX = (Math.random() - 0.5) * this.shakeIntensity;
      shakeY = (Math.random() - 0.5) * this.shakeIntensity;
    }
    ctx.translate(-Math.round(this.camera.x + shakeX), -Math.round(this.camera.y + shakeY));

    // 1. Water Ocean Backdrop
    ctx.fillStyle = '#1e3a8a';
    ctx.fillRect(0, 0, this.worldWidth, this.worldHeight);

    // Animated water foam along shores
    const foamTime = Math.floor(this.totalElapsed * 8);
    for (let x = 80; x < this.worldWidth - 80; x += 192) {
      this.assets.drawSprite(ctx, 'water_foam', x, 90, foamTime, 1, false, 0.45);
      this.assets.drawSprite(ctx, 'water_foam', x, this.worldHeight - 90, foamTime, 1, false, 0.45);
    }

    // 2. Main Kingdom Island (Grassland)
    ctx.fillStyle = '#16a34a';
    ctx.beginPath();
    ctx.roundRect(100, 100, this.worldWidth - 200, this.worldHeight - 200, 60);
    ctx.fill();

    // Autumn / Pasture biome on the right
    ctx.fillStyle = '#65a30d';
    ctx.beginPath();
    ctx.roundRect(this.worldWidth * 0.55, 140, this.worldWidth * 0.4 - 40, this.worldHeight - 280, 50);
    ctx.fill();

    // Corrupted Earth of the Dread Empire
    ctx.fillStyle = '#262626';
    ctx.beginPath();
    ctx.roundRect(this.worldWidth * 0.72, 120, this.worldWidth * 0.24, this.worldHeight * 0.32, 40);
    ctx.fill();

    // 3. Decorations (Rocks, Bushes, Water Rocks, Duck)
    for (const dec of this.decorations) {
      if (dec.decType !== 'cloud') {
        dec.draw(ctx, this.assets);
      }
    }

    // 4. Resource Nodes (Trees, Gold, Sheep)
    for (const res of this.resourceNodes) {
      res.draw(ctx, this.assets);
    }

    // 5. Buildings
    for (const b of this.buildings) {
      b.draw(ctx, this.assets);
    }

    // 6. Friendly Units
    for (const u of this.friendlyUnits) {
      u.draw(ctx, this.assets);
    }

    // 7. Hero
    this.hero.draw(ctx, this.assets);

    // 8. Enemy Units
    for (const e of this.enemyUnits) {
      e.draw(ctx, this.assets);
    }

    // 9. Projectiles
    for (const p of this.projectiles) {
      const arcZ = Math.sin(p.progress * Math.PI) * p.arcHeight;

      ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
      ctx.beginPath();
      ctx.ellipse(p.x, p.y, 4, 2, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.save();
      ctx.translate(p.x, p.y - arcZ);
      const angle = Math.atan2(p.targetY - p.startY, p.targetX - p.startX);
      ctx.rotate(angle);

      if (p.isFire) {
        ctx.fillStyle = '#f59e0b';
        ctx.fillRect(-8, -2, 16, 4);
      } else {
        ctx.fillStyle = '#e2e8f0';
        ctx.fillRect(-6, -1.5, 12, 3);
      }
      ctx.restore();
    }

    // 10. Particles
    for (const pt of this.particles) {
      if (pt.spriteName) {
        this.assets.drawSprite(ctx, pt.spriteName, pt.x, pt.y, pt.frameIndex, pt.scale);
      }
    }

    // 11. Drifting Clouds in Sky
    for (const dec of this.decorations) {
      if (dec.decType === 'cloud') {
        dec.draw(ctx, this.assets);
      }
    }

    // 12. Shockwaves
    for (const sw of this.shockwaves) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(sw.x, sw.y, sw.radius, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(255, 215, 0, ${sw.life * 2.5})`;
      ctx.lineWidth = 4;
      ctx.stroke();
      ctx.restore();
    }

    // 13. Floating Combat Texts
    for (const ft of this.floatingTexts) {
      const alpha = Math.max(0, ft.life / ft.maxLife);
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.fillStyle = ft.color;
      ctx.font = `bold ${ft.size}px monospace`;
      ctx.shadowColor = '#000';
      ctx.shadowBlur = 4;
      ctx.fillText(ft.text, ft.x - 15, ft.y);
      ctx.restore();
    }

    // 14. Building Blueprint Ghost
    if (this.selectedBuildType) {
      ctx.save();
      ctx.globalAlpha = 0.55;
      this.assets.drawBuilding(ctx, 'building_' + this.selectedBuildType, this.mouseWorldX, this.mouseWorldY, 0.7);
      ctx.strokeStyle = '#ffd700';
      ctx.lineWidth = 2;
      ctx.strokeRect(this.mouseWorldX - 40, this.mouseWorldY - 60, 80, 60);
      ctx.restore();
    }

    // 15. RTS Drag Selection Box
    if (this.isBoxSelecting) {
      ctx.save();
      const left = Math.min(this.boxStartX, this.boxCurrentX);
      const top = Math.min(this.boxStartY, this.boxCurrentY);
      const bw = Math.abs(this.boxCurrentX - this.boxStartX);
      const bh = Math.abs(this.boxCurrentY - this.boxStartY);

      ctx.fillStyle = 'rgba(0, 255, 204, 0.15)';
      ctx.fillRect(left, top, bw, bh);
      ctx.strokeStyle = '#00ffcc';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(left, top, bw, bh);
      ctx.restore();
    }

    // 16. Dynamic Lighting & Atmospheric Day/Night Shaders (Canvas 2D)
    if (this.phase === 'night') {
      const isBossWave = (this.currentWave === 5 || this.currentWave === 10);
      ctx.fillStyle = isBossWave ? 'rgba(40, 10, 25, 0.55)' : 'rgba(8, 14, 32, 0.52)';
      ctx.fillRect(0, 0, this.worldWidth, this.worldHeight);

      const flicker = 1 + Math.sin(this.totalElapsed * 7) * 0.05;
      const radCastle = ctx.createRadialGradient(
        this.castle.x, this.castle.y, 20,
        this.castle.x, this.castle.y, 300 * flicker
      );
      radCastle.addColorStop(0, 'rgba(255, 215, 0, 0.28)');
      radCastle.addColorStop(1, 'rgba(255, 215, 0, 0)');
      ctx.fillStyle = radCastle;
      ctx.fillRect(this.castle.x - 300, this.castle.y - 300, 600, 600);

      const radHero = ctx.createRadialGradient(
        this.hero.x, this.hero.y, 10,
        this.hero.x, this.hero.y, 160 * flicker
      );
      radHero.addColorStop(0, 'rgba(255, 220, 100, 0.32)');
      radHero.addColorStop(1, 'rgba(255, 220, 100, 0)');
      ctx.fillStyle = radHero;
      ctx.fillRect(this.hero.x - 160, this.hero.y - 160, 320, 320);

      for (const b of this.buildings) {
        if (b.type === 'tower') {
          const radTower = ctx.createRadialGradient(b.x, b.y, 15, b.x, b.y, 180 * flicker);
          radTower.addColorStop(0, 'rgba(255, 180, 50, 0.3)');
          radTower.addColorStop(1, 'rgba(255, 180, 50, 0)');
          ctx.fillStyle = radTower;
          ctx.fillRect(b.x - 180, b.y - 180, 360, 360);
        }
      }
    } else if (this.waveTimer < 10) {
      ctx.fillStyle = 'rgba(245, 158, 11, 0.12)';
      ctx.fillRect(0, 0, this.worldWidth, this.worldHeight);
    }

    ctx.restore();

    // 17. Low Health Vignette
    if (this.hero.hp / this.hero.maxHp < 0.35) {
      const pulse = 0.5 + 0.5 * Math.sin(this.totalElapsed * 6);
      const radVignette = ctx.createRadialGradient(w / 2, h / 2, w * 0.3, w / 2, h / 2, w * 0.7);
      radVignette.addColorStop(0, 'rgba(220, 38, 38, 0)');
      radVignette.addColorStop(1, `rgba(220, 38, 38, ${0.45 * pulse})`);
      ctx.fillStyle = radVignette;
      ctx.fillRect(0, 0, w, h);
    }

    // 18. Minimap
    this.renderMinimap();
  }

  private renderMinimap() {
    const mctx = this.minimapCtx;
    const mw = this.minimapCanvas.width;
    const mh = this.minimapCanvas.height;

    mctx.clearRect(0, 0, mw, mh);
    mctx.fillStyle = '#0f172a';
    mctx.fillRect(0, 0, mw, mh);

    const scaleX = mw / this.worldWidth;
    const scaleY = mh / this.worldHeight;

    // Island
    mctx.fillStyle = '#15803d';
    mctx.fillRect(100 * scaleX, 100 * scaleY, (this.worldWidth - 200) * scaleX, (this.worldHeight - 200) * scaleY);

    // Castle
    mctx.fillStyle = '#38bdf8';
    mctx.fillRect(this.castle.x * scaleX - 3, this.castle.y * scaleY - 3, 6, 6);

    // Dread Castle
    if (this.dreadCastle) {
      mctx.fillStyle = '#a855f7';
      mctx.fillRect(this.dreadCastle.x * scaleX - 4, this.dreadCastle.y * scaleY - 4, 8, 8);
    }

    // Friendly units
    mctx.fillStyle = '#22c55e';
    for (const u of this.friendlyUnits) {
      mctx.fillRect(u.x * scaleX - 1.5, u.y * scaleY - 1.5, 3, 3);
    }

    // Hero
    mctx.fillStyle = '#ffd700';
    mctx.fillRect(this.hero.x * scaleX - 2.5, this.hero.y * scaleY - 2.5, 5, 5);

    // Enemies
    mctx.fillStyle = '#ef4444';
    for (const e of this.enemyUnits) {
      mctx.fillRect(e.x * scaleX - 2, e.y * scaleY - 2, 4, 4);
    }

    // Camera box
    mctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
    mctx.lineWidth = 1;
    mctx.strokeRect(
      this.camera.x * scaleX,
      this.camera.y * scaleY,
      this.canvas.width * scaleX,
      this.canvas.height * scaleY
    );
  }

  // --- UI UPDATER ---
  private updateUI() {
    const setTxt = (id: string, text: string) => {
      const el = this.root.querySelector(id);
      if (el) el.textContent = text;
    };
    const setWidth = (id: string, pct: number) => {
      const el = this.root.querySelector(id) as HTMLElement;
      if (el) el.style.width = `${Math.max(0, Math.min(100, pct))}%`;
    };

    setTxt('#hud-hero-lvl', this.hero.level.toString());
    setTxt('#hud-hero-hp-text', `${Math.ceil(this.hero.hp)} / ${this.hero.maxHp}`);
    setWidth('#hud-hero-hp', (this.hero.hp / this.hero.maxHp) * 100);

    setTxt('#hud-hero-xp-text', `${this.hero.xp} / ${this.hero.xpNeeded} XP`);
    setWidth('#hud-hero-xp', (this.hero.xp / this.hero.xpNeeded) * 100);

    setTxt('#hud-castle-hp-text', `${Math.ceil(this.castle.hp)} / ${this.castle.maxHp}`);
    setWidth('#hud-castle-hp', (this.castle.hp / this.castle.maxHp) * 100);

    const phaseBadge = this.root.querySelector('#hud-phase-indicator');
    if (phaseBadge) {
      if (this.phase === 'day') {
        phaseBadge.className = 'phase-badge day';
        phaseBadge.textContent = '☀️ ДЕНЬ (СБОР И ЗАЩИТА)';
        setTxt('#hud-timer-label', 'До штурма:');
        setTxt('#hud-countdown', `00:${Math.ceil(this.waveTimer).toString().padStart(2, '0')}`);
      } else {
        phaseBadge.className = 'phase-badge night';
        phaseBadge.textContent = '🌙 НОЧЬ (ОСАДА ТЬМЫ!)';
        setTxt('#hud-timer-label', 'Врагов:');
        setTxt('#hud-countdown', this.enemyUnits.length.toString());
      }
    }
    setTxt('#hud-current-wave', this.currentWave.toString());
    setTxt('#hud-max-wave', this.mode === 'campaign' ? this.maxWave.toString() : '∞');

    setTxt('#res-wood-val', Math.floor(this.resources.wood).toString());
    setTxt('#res-gold-val', Math.floor(this.resources.gold).toString());
    setTxt('#res-food-val', Math.floor(this.resources.food).toString());
    setTxt('#res-pop-val', `${this.resources.pop}/${this.resources.maxPop}`);

    // Update Quest Tracker Card
    if (this.currentQuestIdx < this.quests.length) {
      const q = this.quests[this.currentQuestIdx];
      setTxt('#quest-title', q.title);
      setTxt('#quest-desc', `${q.desc} (${q.currentCount}/${q.targetCount})`);
      const pct = (q.currentCount / q.targetCount) * 100;
      setWidth('#quest-progress-fill', pct);
    }

    const setCd = (id: string, cur: number, max: number) => {
      const el = this.root.querySelector(id) as HTMLElement;
      if (el) el.style.height = `${(cur / max) * 100}%`;
    };
    setCd('#cd-whirl', this.hero.whirlTimer, this.hero.whirlCooldown);
    setCd('#cd-dash', this.hero.dashTimer, this.hero.dashCooldown);
    setCd('#cd-rally', this.hero.rallyTimer, this.hero.rallyCooldown);
  }

  // --- GAME OVER ---
  private triggerGameOver(victory: boolean) {
    this.isRunning = false;
    this.saveStats();

    const modal = this.root.querySelector('#modal-gameover') as HTMLElement;
    const title = this.root.querySelector('#gameover-title') as HTMLElement;
    const desc = this.root.querySelector('#gameover-desc') as HTMLElement;
    const ribbon = this.root.querySelector('#gameover-ribbon') as HTMLElement;

    if (victory) {
      this.sound.playVictory();
      if (ribbon) ribbon.textContent = 'СВЯЩЕННЫЙ ТРИУМФ';
      if (title) {
        title.textContent = 'МОРРИСГРАД СПАСЕН!';
        title.className = 'modal-heading';
        title.style.color = '#ffd700';
      }
      if (desc) desc.textContent = 'Орден Аскетов сокрушил Черный Легион! Тьма рассеялась над цитаделью.';
    } else {
      this.sound.playDefeat();
      if (ribbon) ribbon.textContent = 'ПАДЕНИЕ ЦИТАДЕЛИ';
      if (title) {
        title.textContent = 'ТЬМА ПОГЛОТИЛА МОРРИСГРАД';
        title.className = 'modal-heading text-defeat';
      }
      if (desc) desc.textContent = 'Цитадель пала. Но обет Аскета вечен — соберитесь с силами и начните вновь!';
    }

    const setTxt = (id: string, val: string | number) => {
      const el = this.root.querySelector(id);
      if (el) el.textContent = val.toString();
    };

    setTxt('#go-wave-val', this.currentWave);
    setTxt('#go-kills-val', this.stats.kills);
    setTxt('#go-wood-val', this.stats.woodHarvested);
    setTxt('#go-gold-val', this.stats.goldMined);
    setTxt('#go-recruits-val', this.stats.unitsRecruited);
    setTxt('#go-score-val', this.stats.score + this.currentWave * 200);

    if (modal) modal.classList.add('active');
  }

  // --- EVENT LISTENERS ---
  private initEvents() {
    window.addEventListener('keydown', (e) => {
      this.keys[e.code] = true;

      if (e.code === 'Space') {
        e.preventDefault();
        this.heroAttack();
      } else if (e.code === 'KeyQ') {
        this.heroWhirlwind();
      } else if (e.code === 'KeyE') {
        this.heroDash();
      } else if (e.code === 'KeyR') {
        this.heroRally();
      } else if (e.code === 'KeyF') {
        this.setArmyCommand('follow');
      } else if (e.code === 'KeyG') {
        this.setArmyCommand('defend');
      } else if (e.code === 'KeyT') {
        this.setArmyCommand('attack');
      } else if (e.code === 'Digit1') {
        this.recruitPawn();
      } else if (e.code === 'Digit2') {
        this.trainUnit('warrior');
      } else if (e.code === 'Digit3') {
        this.trainUnit('archer');
      } else if (e.code === 'Digit4') {
        this.trainUnit('monk');
      } else if (e.code === 'Digit5') {
        this.trainUnit('lancer');
      } else if (e.code === 'Escape') {
        if (this.selectedBuildType) {
          this.cancelBuildingPlacement();
        } else {
          this.togglePause();
        }
      }
    });

    window.addEventListener('keyup', (e) => {
      this.keys[e.code] = false;
      if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') {
        this.hero.isGuarding = false;
      }
    });

    // Canvas Mouse
    this.canvas.addEventListener('mousemove', (e) => {
      const rect = this.canvas.getBoundingClientRect();
      const screenX = e.clientX - rect.left;
      const screenY = e.clientY - rect.top;
      this.mouseWorldX = screenX + this.camera.x;
      this.mouseWorldY = screenY + this.camera.y;

      if (this.isBoxSelecting) {
        this.boxCurrentX = this.mouseWorldX;
        this.boxCurrentY = this.mouseWorldY;
      }
    });

    this.canvas.addEventListener('mousedown', (e) => {
      if (e.button === 0) {
        // Left Click
        if (this.selectedBuildType) {
          this.placeBuildingAt(this.mouseWorldX, this.mouseWorldY);
        } else {
          // Check Duck Easter egg
          for (const dec of this.decorations) {
            if (dec.decType === 'duck' && Math.hypot(dec.x - this.mouseWorldX, dec.y - this.mouseWorldY) < 35) {
              this.sound.playHeal();
              this.resources.gold += 50;
              this.spawnFloatingText(dec.x, dec.y - 20, '🦆 КРЯ! +50 ЗОЛОТА!', '#ffd700', 18);
              return;
            }
          }

          if (e.shiftKey) {
            this.isBoxSelecting = true;
            this.boxStartX = this.mouseWorldX;
            this.boxStartY = this.mouseWorldY;
            this.boxCurrentX = this.mouseWorldX;
            this.boxCurrentY = this.mouseWorldY;
          } else {
            this.heroAttack();
          }
        }
      } else if (e.button === 2) {
        // Right Click: Order selected units OR Guard
        e.preventDefault();
        const selected = this.friendlyUnits.filter(u => u.isSelected);
        if (selected.length > 0) {
          // Check if right-clicking an unbuilt or damaged building
          let targetBuild: Building | null = null;
          for (const b of this.buildings) {
            if (b.faction === 'player' && (b.isUnderConstruction || b.hp < b.maxHp) && Math.hypot(b.x - this.mouseWorldX, b.y - this.mouseWorldY) < 65) {
              targetBuild = b;
              break;
            }
          }

          let targetRes: ResourceNode | null = null;
          for (const res of this.resourceNodes) {
            if (!res.dead && Math.hypot(res.x - this.mouseWorldX, res.y - this.mouseWorldY) < 35) {
              targetRes = res;
              break;
            }
          }

          let targetEnemy: Unit | null = null;
          for (const enemy of this.enemyUnits) {
            if (!enemy.dead && Math.hypot(enemy.x - this.mouseWorldX, enemy.y - this.mouseWorldY) < 35) {
              targetEnemy = enemy;
              break;
            }
          }

          for (const u of selected) {
            if (targetBuild && u.role === 'pawn') {
              (u as PawnUnit).assignBuild(targetBuild);
              this.spawnFloatingText(targetBuild.x, targetBuild.y - 30, '🔨 СТРОИТЕЛЬСТВО', '#34d399');
            } else if (targetRes && u.role === 'pawn') {
              (u as PawnUnit).assignHarvest(targetRes, this.castle);
            } else if (targetEnemy) {
              u.targetEntity = targetEnemy;
            } else {
              u.targetX = this.mouseWorldX + (Math.random() - 0.5) * 50;
              u.targetY = this.mouseWorldY + (Math.random() - 0.5) * 50;
              u.targetEntity = null;
            }
          }
          this.spawnDust(this.mouseWorldX, this.mouseWorldY);
        } else {
          this.hero.isGuarding = true;
        }
      }
    });

    this.canvas.addEventListener('mouseup', (e) => {
      if (e.button === 0 && this.isBoxSelecting) {
        this.isBoxSelecting = false;
        const left = Math.min(this.boxStartX, this.boxCurrentX);
        const right = Math.max(this.boxStartX, this.boxCurrentX);
        const top = Math.min(this.boxStartY, this.boxCurrentY);
        const bottom = Math.max(this.boxStartY, this.boxCurrentY);

        for (const u of this.friendlyUnits) {
          u.isSelected = (u.x >= left && u.x <= right && u.y >= top && u.y <= bottom);
        }
        const count = this.friendlyUnits.filter(u => u.isSelected).length;
        if (count > 0) {
          this.sound.playSwordSwing();
          this.spawnFloatingText(this.hero.x, this.hero.y - 30, `Выбрано отрядов: ${count}`, '#00ffcc');
        }
      }

      if (e.button === 2) {
        this.hero.isGuarding = false;
      }
    });

    this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());

    // Menu Buttons
    const startBtn = this.root.querySelector('#btn-start-game');
    if (startBtn) {
      startBtn.addEventListener('click', () => {
        this.sound.playSwordSwing();
        this.startGame(this.mode, this.difficulty);
      });
    }

    this.root.querySelectorAll('.diff-chip').forEach(btn => {
      btn.addEventListener('click', () => {
        this.sound.playSwordHit();
        this.root.querySelectorAll('.diff-chip').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.difficulty = btn.getAttribute('data-diff') as Difficulty;
      });
    });

    this.root.querySelectorAll('.mode-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        this.sound.playSwordHit();
        this.root.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.mode = btn.getAttribute('data-mode') as GameMode;
      });
    });

    this.root.querySelector('#btn-pause')?.addEventListener('click', () => {
      this.sound.playSwordSwing();
      this.togglePause();
    });
    this.root.querySelector('#btn-resume')?.addEventListener('click', () => {
      this.sound.playSwordSwing();
      this.togglePause();
    });
    this.root.querySelector('#btn-restart')?.addEventListener('click', () => {
      this.sound.playSwordSwing();
      this.startGame(this.mode, this.difficulty);
    });
    this.root.querySelector('#btn-to-menu')?.addEventListener('click', () => {
      this.sound.playSwordSwing();
      this.returnToMenu();
    });
    this.root.querySelector('#btn-try-again')?.addEventListener('click', () => {
      this.sound.playSwordSwing();
      this.startGame(this.mode, this.difficulty);
    });
    this.root.querySelector('#btn-go-menu')?.addEventListener('click', () => {
      this.sound.playSwordSwing();
      this.returnToMenu();
    });

    this.root.querySelector('#btn-toggle-sound')?.addEventListener('click', () => {
      const muted = this.sound.toggleMute();
      const btn = this.root.querySelector('#btn-toggle-sound');
      if (btn) btn.textContent = muted ? '🔇' : '🔊';
    });

    this.root.querySelector('#cmd-follow')?.addEventListener('click', () => this.setArmyCommand('follow'));
    this.root.querySelector('#cmd-defend')?.addEventListener('click', () => this.setArmyCommand('defend'));
    this.root.querySelector('#cmd-attack')?.addEventListener('click', () => this.setArmyCommand('attack'));

    this.root.querySelector('#cmd-hire-pawn')?.addEventListener('click', () => { this.sound.playSwordHit(); this.recruitPawn(); });
    this.root.querySelector('#cmd-hire-warrior')?.addEventListener('click', () => { this.sound.playSwordHit(); this.trainUnit('warrior'); });
    this.root.querySelector('#cmd-hire-archer')?.addEventListener('click', () => { this.sound.playSwordHit(); this.trainUnit('archer'); });
    this.root.querySelector('#cmd-hire-monk')?.addEventListener('click', () => { this.sound.playSwordHit(); this.trainUnit('monk'); });
    this.root.querySelector('#cmd-hire-lancer')?.addEventListener('click', () => { this.sound.playSwordHit(); this.trainUnit('lancer'); });

    this.root.querySelector('#skill-attack')?.addEventListener('click', () => this.heroAttack());
    this.root.querySelector('#skill-guard')?.addEventListener('click', () => { this.hero.isGuarding = !this.hero.isGuarding; });
    this.root.querySelector('#skill-whirl')?.addEventListener('click', () => this.heroWhirlwind());
    this.root.querySelector('#skill-dash')?.addEventListener('click', () => this.heroDash());
    this.root.querySelector('#skill-rally')?.addEventListener('click', () => this.heroRally());

    this.root.querySelectorAll('.build-card').forEach(btn => {
      btn.addEventListener('click', () => {
        this.sound.playSwordSwing();
        const bType = btn.getAttribute('data-build');
        if (bType) this.selectBuildingPlacement(bType);
      });
    });

    // Touch joystick
    const joyBase = this.root.querySelector('#virtual-joystick') as HTMLElement;
    const joyKnob = this.root.querySelector('#joystick-knob') as HTMLElement;

    if (joyBase && joyKnob) {
      let joyStartX = 0;
      let joyStartY = 0;

      const handleTouchStart = (e: TouchEvent) => {
        const touch = e.touches[0];
        const rect = joyBase.getBoundingClientRect();
        joyStartX = rect.left + rect.width / 2;
        joyStartY = rect.top + rect.height / 2;
        this.touchActive = true;
      };

      const handleTouchMove = (e: TouchEvent) => {
        if (!this.touchActive) return;
        const touch = e.touches[0];
        const dx = touch.clientX - joyStartX;
        const dy = touch.clientY - joyStartY;
        const dist = Math.hypot(dx, dy);
        const maxDist = 35;

        if (dist > 0) {
          const clampedDist = Math.min(dist, maxDist);
          const nx = (dx / dist) * clampedDist;
          const ny = (dy / dist) * clampedDist;
          joyKnob.style.transform = `translate(${nx}px, ${ny}px)`;
          this.joystickVector.x = dx / dist;
          this.joystickVector.y = dy / dist;
        }
      };

      const handleTouchEnd = () => {
        this.touchActive = false;
        joyKnob.style.transform = `translate(0px, 0px)`;
        this.joystickVector = { x: 0, y: 0 };
      };

      joyBase.addEventListener('touchstart', handleTouchStart, { passive: true });
      window.addEventListener('touchmove', handleTouchMove, { passive: true });
      window.addEventListener('touchend', handleTouchEnd, { passive: true });
    }

    this.root.querySelector('#touch-btn-attack')?.addEventListener('touchstart', (e) => {
      e.preventDefault();
      this.heroAttack();
    });
    this.root.querySelector('#touch-btn-guard')?.addEventListener('touchstart', (e) => {
      e.preventDefault();
      this.hero.isGuarding = true;
    });
    this.root.querySelector('#touch-btn-guard')?.addEventListener('touchend', () => {
      this.hero.isGuarding = false;
    });
    this.root.querySelector('#touch-btn-dash')?.addEventListener('touchstart', (e) => {
      e.preventDefault();
      this.heroDash();
    });
    this.root.querySelector('#touch-btn-whirl')?.addEventListener('touchstart', (e) => {
      e.preventDefault();
      this.heroWhirlwind();
    });
  }

  private setArmyCommand(cmd: ArmyCommand) {
    this.armyCommand = cmd;
    this.sound.playSwordHit();
    this.root.querySelectorAll('.cmd-btn').forEach(btn => btn.classList.remove('active'));
    if (cmd === 'follow') this.root.querySelector('#cmd-follow')?.classList.add('active');
    else if (cmd === 'defend') this.root.querySelector('#cmd-defend')?.classList.add('active');
    else if (cmd === 'attack') this.root.querySelector('#cmd-attack')?.classList.add('active');

    const msg = cmd === 'follow' ? 'ПРИКАЗ: ЗА МНОЙ!' : cmd === 'defend' ? 'ПРИКАЗ: ОБОРОНЯТЬ ЗАМОК!' : 'ПРИКАЗ: В АТАКУ!';
    this.spawnFloatingText(this.hero.x, this.hero.y - 30, msg, '#ffd700');
  }

  private togglePause() {
    this.isPaused = !this.isPaused;
    const modal = this.root.querySelector('#modal-pause');
    if (modal) {
      if (this.isPaused) modal.classList.add('active');
      else modal.classList.remove('active');
    }
  }

  private returnToMenu() {
    this.isRunning = false;
    this.root.querySelectorAll('.game-modal-overlay').forEach(m => m.classList.remove('active'));
    this.root.querySelector('#screen-game')?.classList.remove('active');
    this.root.querySelector('#screen-menu')?.classList.add('active');
    this.loadSavedStats();
  }

  public destroy() {
    this.isRunning = false;
    if (this.animFrameId) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }
    this.sound.destroy();
  }
}
