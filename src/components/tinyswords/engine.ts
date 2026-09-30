// engine.ts - Complete RTS & Action RPG Game Engine for "Путь Аскетов"

import { SoundEngine } from './audio';
import { AssetManager } from './assets';
import { 
  HeroUnit, PawnUnit, WarriorUnit, ArcherUnit, MonkUnit, LancerUnit, BossUnit,
  Building, ResourceNode, Unit, BaseEntity 
} from './entities';
import type { 
  GamePhase, GameMode, Difficulty, Resources, UpgradeDef, 
  Projectile, FloatingTextItem, ParticleItem, ArmyCommand 
} from './types';

export class TinySwordsEngine {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private minimapCanvas: HTMLCanvasElement;
  private minimapCtx: CanvasRenderingContext2D;
  private root: HTMLElement;

  private sound: SoundEngine;
  private assets: AssetManager;

  // World bounds
  public readonly worldWidth = 2400;
  public readonly worldHeight = 1800;

  // Camera
  private camera = { x: 900, y: 700 };

  // Loop & timing
  private lastTime = 0;
  private isRunning = false;
  private isPaused = false;
  private animFrameId: number | null = null;

  // Game state
  private mode: GameMode = 'campaign';
  private difficulty: Difficulty = 'normal';
  private phase: GamePhase = 'day';
  private currentWave = 1;
  private maxWave = 10;
  private waveTimer = 45; // 45 seconds day phase
  private nightElapsed = 0;
  private armyCommand: ArmyCommand = 'follow';

  // Economy & Resources
  private resources: Resources = {
    wood: 120,
    gold: 150,
    food: 40,
    pop: 3,
    maxPop: 10
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
    { id: 'flaming_towers', title: 'Огненные Башни', desc: 'Башни поджигают врагов разрывными стрелами', icon: '🔥', level: 0, maxLevel: 3 }
  ];

  // Entities
  private hero!: HeroUnit;
  private castle!: Building;
  private friendlyUnits: Unit[] = [];
  private enemyUnits: Unit[] = [];
  private buildings: Building[] = [];
  private resourceNodes: ResourceNode[] = [];
  private projectiles: Projectile[] = [];
  private particles: ParticleItem[] = [];
  private floatingTexts: FloatingTextItem[] = [];

  // Building placement state
  private selectedBuildType: string | null = null;
  private mouseWorldX = 0;
  private mouseWorldY = 0;

  // Input states
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

  // --- START / RESTART GAME ---
  public startGame(mode: GameMode = 'campaign', difficulty: Difficulty = 'normal') {
    this.mode = mode;
    this.difficulty = difficulty;
    this.isRunning = true;
    this.isPaused = false;
    this.phase = 'day';
    this.currentWave = 1;
    this.waveTimer = 45;
    this.nightElapsed = 0;

    // Reset economy
    const startRes = difficulty === 'easy' ? 200 : difficulty === 'hard' ? 80 : 120;
    this.resources = {
      wood: startRes,
      gold: startRes,
      food: 40,
      pop: 3,
      maxPop: 10
    };

    this.stats = {
      kills: 0,
      woodHarvested: 0,
      goldMined: 0,
      unitsRecruited: 0,
      score: 0
    };

    // Upgrades reset
    this.upgrades.forEach(u => u.level = 0);

    // Initialize world entities
    this.initWorld();

    // UI screen transition
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
    this.projectiles = [];
    this.particles = [];
    this.floatingTexts = [];

    const centerX = this.worldWidth / 2;
    const centerY = this.worldHeight / 2;

    // Castle in center
    this.castle = new Building(centerX, centerY, 'castle');
    this.buildings.push(this.castle);

    // Hero at front of castle
    this.hero = new HeroUnit(centerX, centerY + 120);

    // Initial starting units: 2 Pawns, 1 Warrior, 1 Archer
    const pawn1 = new PawnUnit(centerX - 80, centerY + 100);
    const pawn2 = new PawnUnit(centerX + 80, centerY + 100);
    const war1 = new WarriorUnit(centerX - 40, centerY + 140);
    const arch1 = new ArcherUnit(centerX + 40, centerY + 140);

    this.friendlyUnits.push(pawn1, pawn2, war1, arch1);
    this.resources.pop = this.friendlyUnits.length;

    // Scatter Trees, Gold Mines, and Sheep across the island
    for (let i = 0; i < 28; i++) {
      const angle = Math.random() * Math.PI * 2;
      const dist = 220 + Math.random() * 850;
      const tx = centerX + Math.cos(angle) * dist;
      const ty = centerY + Math.sin(angle) * dist;
      if (tx > 80 && tx < this.worldWidth - 80 && ty > 80 && ty < this.worldHeight - 80) {
        this.resourceNodes.push(new ResourceNode(tx, ty, 'tree'));
      }
    }

    for (let i = 0; i < 8; i++) {
      const angle = Math.random() * Math.PI * 2;
      const dist = 300 + Math.random() * 750;
      const gx = centerX + Math.cos(angle) * dist;
      const gy = centerY + Math.sin(angle) * dist;
      this.resourceNodes.push(new ResourceNode(gx, gy, 'gold_mine'));
    }

    for (let i = 0; i < 10; i++) {
      const angle = Math.random() * Math.PI * 2;
      const dist = 200 + Math.random() * 700;
      const sx = centerX + Math.cos(angle) * dist;
      const sy = centerY + Math.sin(angle) * dist;
      this.resourceNodes.push(new ResourceNode(sx, sy, 'sheep'));
    }
  }

  // --- MAIN LOOP ---
  private loop = (time: number) => {
    if (!this.isRunning) return;

    const dt = Math.min((time - this.lastTime) / 1000, 0.1);
    this.lastTime = time;

    if (!this.isPaused) {
      this.update(dt);
    }
    this.render();

    this.animFrameId = requestAnimationFrame(this.loop);
  };

  // --- UPDATE LOGIC ---
  private update(dt: number) {
    // 1. Phase timer & wave transition
    if (this.phase === 'day') {
      this.waveTimer -= dt;
      if (this.waveTimer <= 0) {
        this.startNightPhase();
      }
    } else {
      this.nightElapsed += dt;
      // Check if all enemies defeated
      if (this.enemyUnits.length === 0 && this.nightElapsed > 5) {
        this.completeWave();
      }
    }

    // 2. Hero Input & Movement
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
      const spd = this.hero.isDashing ? this.hero.speed * 2.5 : this.hero.speed;
      this.hero.x += (moveX / len) * spd * dt;
      this.hero.y += (moveY / len) * spd * dt;
      this.hero.flipX = moveX < 0;
      this.hero.state = 'run';

      // Clamp Hero in world
      this.hero.x = Math.max(50, Math.min(this.worldWidth - 50, this.hero.x));
      this.hero.y = Math.max(50, Math.min(this.worldHeight - 50, this.hero.y));
    } else if (this.hero.state === 'run') {
      this.hero.state = 'idle';
    }

    this.hero.update(dt);

    // 3. Smooth Camera Follow
    const targetCamX = this.hero.x - this.canvas.width / 2;
    const targetCamY = this.hero.y - this.canvas.height / 2;
    this.camera.x += (targetCamX - this.camera.x) * 0.1;
    this.camera.y += (targetCamY - this.camera.y) * 0.1;

    this.camera.x = Math.max(0, Math.min(this.worldWidth - this.canvas.width, this.camera.x));
    this.camera.y = Math.max(0, Math.min(this.worldHeight - this.canvas.height, this.camera.y));

    // 4. Update Friendly Units (Pawns, Warriors, Archers, Monks, Lancers)
    for (const unit of this.friendlyUnits) {
      unit.update(dt);

      // Unit Army Commands & AI
      if (unit.role === 'pawn') {
        // Pawns handle harvesting/returning
        const pawn = unit as PawnUnit;
        if (pawn.activity === 'idle') {
          // Auto-find closest tree or mine
          let closestRes: ResourceNode | null = null;
          let minDist = 350;
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
      } else {
        // Combat units AI
        if (this.armyCommand === 'follow') {
          // Follow Hero
          const distToHero = Math.hypot(this.hero.x - unit.x, this.hero.y - unit.y);
          if (distToHero > 160) {
            unit.targetX = this.hero.x + (Math.random() - 0.5) * 80;
            unit.targetY = this.hero.y + (Math.random() - 0.5) * 80;
          }
        } else if (this.armyCommand === 'defend') {
          // Stay around Castle
          const distToCastle = Math.hypot(this.castle.x - unit.x, this.castle.y - unit.y);
          if (distToCastle > 240) {
            unit.targetX = this.castle.x + (Math.random() - 0.5) * 160;
            unit.targetY = this.castle.y + (Math.random() - 0.5) * 160;
          }
        }

        // Target nearest enemy
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
          // Monks heal nearby wounded allies
          const monk = unit as MonkUnit;
          if (monk.healTimer <= 0) {
            this.monkHeal(monk);
          }
        }
      }
    }

    // 5. Update Enemy Units AI
    for (const enemy of this.enemyUnits) {
      enemy.update(dt);

      // Find target: nearest building or player unit or castle
      let nearestTarget: BaseEntity | null = null;
      let minDist = 9999;

      // Check Hero
      const distHero = Math.hypot(this.hero.x - enemy.x, this.hero.y - enemy.y);
      if (distHero < minDist) {
        minDist = distHero;
        nearestTarget = this.hero;
      }

      // Check friendly units
      for (const friendly of this.friendlyUnits) {
        if (!friendly.dead) {
          const d = Math.hypot(friendly.x - enemy.x, friendly.y - enemy.y);
          if (d < minDist) {
            minDist = d;
            nearestTarget = friendly;
          }
        }
      }

      // Check Castle & Buildings
      for (const b of this.buildings) {
        if (!b.dead) {
          const d = Math.hypot(b.x - enemy.x, b.y - enemy.y);
          if (d < minDist * 0.8) {
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

    // 6. Update Buildings (Towers shoot arrows!)
    for (const b of this.buildings) {
      b.update(dt);
      if (b.type === 'tower' && !b.isUnderConstruction && b.shootTimer <= 0) {
        // Find nearest enemy within 220px
        for (const enemy of this.enemyUnits) {
          if (!enemy.dead) {
            const d = Math.hypot(enemy.x - b.x, enemy.y - b.y);
            if (d < 240) {
              b.shootTimer = b.shootCooldown;
              const hasFire = this.getUpgradeLevel('flaming_towers') > 0;
              this.spawnProjectile(b.x, b.y - 70, enemy.x, enemy.y, 24, 'player', hasFire);
              this.sound.playBowShoot();
              break;
            }
          }
        }
      }
    }

    // 7. Update Projectiles (Parabolic Trajectories)
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      p.progress += p.speed * dt;

      p.x = p.startX + (p.targetX - p.startX) * p.progress;
      p.y = p.startY + (p.targetY - p.startY) * p.progress;

      if (p.progress >= 1) {
        // Impact!
        this.sound.playArrowHit();
        this.spawnDust(p.targetX, p.targetY);

        // Check damage
        if (p.faction === 'player') {
          for (const enemy of this.enemyUnits) {
            if (!enemy.dead && Math.hypot(enemy.x - p.targetX, enemy.y - p.targetY) < 30) {
              const dmg = enemy.takeDamage(p.damage, false);
              this.spawnFloatingText(enemy.x, enemy.y - 20, `-${dmg}`, p.isFire ? '#f59e0b' : '#fff');
              if (p.isFire) this.spawnExplosion(enemy.x, enemy.y);
              if (enemy.dead) this.handleEnemyDeath(enemy);
              break;
            }
          }
        } else {
          // Enemy arrow against Hero or friendly
          if (Math.hypot(this.hero.x - p.targetX, this.hero.y - p.targetY) < 30) {
            const dmg = this.hero.takeDamage(p.damage, true);
            this.spawnFloatingText(this.hero.x, this.hero.y - 20, `-${dmg}`, '#ef4444');
          } else {
            for (const f of this.friendlyUnits) {
              if (!f.dead && Math.hypot(f.x - p.targetX, f.y - p.targetY) < 25) {
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

    // 8. Update Resource Nodes
    for (const res of this.resourceNodes) {
      res.update(dt);
    }

    // 9. Update Floating Texts & Particles
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

    // 10. Clean dead entities
    this.friendlyUnits = this.friendlyUnits.filter(u => !u.dead);
    this.enemyUnits = this.enemyUnits.filter(u => !u.dead);
    this.buildings = this.buildings.filter(b => !b.dead);
    this.resources.pop = this.friendlyUnits.length;

    // 11. Check Game Over (Castle or Hero dead)
    if (this.castle.dead || this.hero.dead) {
      this.triggerGameOver(false);
    }

    // 12. Periodic Castle passive regen & deposit
    if (Math.hypot(this.hero.x - this.castle.x, this.hero.y - this.castle.y) < 140) {
      this.hero.heal(8 * dt);
    }

    this.updateUI();
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
          this.spawnProjectile(attacker.x, attacker.y - 15, target.x + 10, target.y + 10, attacker.attackDamage, 'player');
        }, 120);
      }
    } else {
      // Melee attack
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
    this.hero.attackTimer = this.hero.attackCooldown;
    this.hero.state = 'attack';
    this.hero.comboStep = (this.hero.comboStep + 1) % 2;

    this.sound.playSwordSwing();

    // Damage enemies in frontal arc
    const reach = this.hero.attackRange + 15;
    const facingDir = this.hero.flipX ? -1 : 1;
    const slashCenterX = this.hero.x + facingDir * 25;
    const slashCenterY = this.hero.y;

    this.spawnDust(slashCenterX, slashCenterY);

    for (const enemy of this.enemyUnits) {
      if (!enemy.dead) {
        const d = Math.hypot(enemy.x - slashCenterX, enemy.y - slashCenterY);
        if (d < reach) {
          const dmgMult = 1 + this.getUpgradeLevel('blade_sharpness') * 0.25;
          const isCrit = Math.random() < 0.25;
          const raw = this.hero.attackDamage * (isCrit ? 1.8 : 1) * dmgMult;
          const dmg = enemy.takeDamage(Math.round(raw), false);

          this.sound.playSwordHit();
          this.spawnFloatingText(enemy.x, enemy.y - 25, `${isCrit ? '💥 ' : ''}-${dmg}`, isCrit ? '#f59e0b' : '#fff', isCrit ? 18 : 14);

          // Knockback
          enemy.x += facingDir * 18;

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
    this.spawnExplosion(this.hero.x, this.hero.y);

    const radius = 120;
    for (const enemy of this.enemyUnits) {
      if (!enemy.dead) {
        const d = Math.hypot(enemy.x - this.hero.x, enemy.y - this.hero.y);
        if (d < radius) {
          const dmg = enemy.takeDamage(Math.round(this.hero.attackDamage * 2.2), false);
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
    this.hero.dashDuration = 0.25;
    this.sound.playSwordSwing();
    this.spawnDust(this.hero.x, this.hero.y);
  }

  public heroRally() {
    if (this.hero.dead || this.hero.rallyTimer > 0) return;
    this.hero.rallyTimer = this.hero.rallyCooldown;
    this.sound.playHorn();

    // Buff all friendlies: heal 25 HP and speed boost
    for (const unit of this.friendlyUnits) {
      unit.heal(25);
      unit.speed += 20;
      setTimeout(() => unit.speed -= 20, 5000);
      this.spawnFloatingText(unit.x, unit.y - 20, '🎺 БЛАГОСЛОВЕНИЕ!', '#ffd700', 12);
    }
  }

  private monkHeal(monk: MonkUnit) {
    monk.healTimer = monk.healCooldown;
    monk.state = 'heal';

    this.sound.playHeal();
    const healPower = Math.round(20 * (1 + this.getUpgradeLevel('holy_light') * 1.0));

    // Area heal around monk
    const targets = [this.hero, ...this.friendlyUnits];
    for (const target of targets) {
      if (!target.dead && Math.hypot(target.x - monk.x, target.y - monk.y) < 140) {
        const healed = target.heal(healPower);
        if (healed > 0) {
          this.spawnFloatingText(target.x, target.y - 20, `+${healed} HP`, '#22c55e', 14);
        }
      }
    }
  }

  private handleEnemyDeath(enemy: Unit) {
    this.stats.kills++;
    this.stats.score += 50;

    // Yield Gold and XP
    const goldDrop = 8 + Math.floor(Math.random() * 8);
    this.resources.gold += goldDrop;
    this.spawnFloatingText(enemy.x, enemy.y, `+${goldDrop} 🪙`, '#ffd700', 14);

    const leveled = this.hero.addXp(30);
    if (leveled) {
      this.sound.playVictory();
      this.spawnFloatingText(this.hero.x, this.hero.y - 40, `НОВЫЙ УРОВЕНЬ ${this.hero.level}!`, '#00ffcc', 20);
    }
  }

  // --- DAY / NIGHT WAVES ---
  private startNightPhase() {
    this.phase = 'night';
    this.nightElapsed = 0;
    this.sound.setPhase('night');
    this.sound.playHorn();

    this.spawnFloatingText(this.hero.x, this.hero.y - 50, 'ОСАДА НАЧАЛАСЬ!', '#ef4444', 24);

    // Spawn wave of enemies along the borders
    const count = 5 + this.currentWave * 4;
    for (let i = 0; i < count; i++) {
      const side = Math.floor(Math.random() * 4);
      let sx = 0;
      let sy = 0;
      if (side === 0) { sx = Math.random() * this.worldWidth; sy = 40; }
      else if (side === 1) { sx = Math.random() * this.worldWidth; sy = this.worldHeight - 40; }
      else if (side === 2) { sx = 40; sy = Math.random() * this.worldHeight; }
      else { sx = this.worldWidth - 40; sy = Math.random() * this.worldHeight; }

      const rand = Math.random();
      if (rand < 0.5) {
        this.enemyUnits.push(new WarriorUnit(sx, sy, 'enemy'));
      } else if (rand < 0.8) {
        this.enemyUnits.push(new ArcherUnit(sx, sy, 'enemy'));
      } else {
        this.enemyUnits.push(new LancerUnit(sx, sy, 'enemy'));
      }
    }

    // Boss on wave 5 and 10!
    if (this.currentWave === 5 || this.currentWave === 10) {
      const boss = new BossUnit(this.worldWidth / 2, 60);
      this.enemyUnits.push(boss);
      const bossWrap = this.root.querySelector('#hud-boss-wrap') as HTMLElement;
      if (bossWrap) bossWrap.style.display = 'block';
    }
  }

  private completeWave() {
    this.sound.playVictory();
    this.phase = 'day';
    this.waveTimer = 45;
    this.sound.setPhase('day');

    const bossWrap = this.root.querySelector('#hud-boss-wrap') as HTMLElement;
    if (bossWrap) bossWrap.style.display = 'none';

    // Reward
    this.resources.gold += 50 * this.currentWave;
    this.resources.wood += 40 * this.currentWave;

    if (this.mode === 'campaign' && this.currentWave >= this.maxWave) {
      this.triggerGameOver(true);
      return;
    }

    this.currentWave++;
    this.saveStats();

    // Show Perk Upgrade Dialog
    this.showUpgradeModal();
  }

  // --- UPGRADE MODAL ---
  private showUpgradeModal() {
    this.isPaused = true;
    const modal = this.root.querySelector('#modal-upgrade') as HTMLElement;
    const grid = this.root.querySelector('#upgrade-cards-list') as HTMLElement;
    if (!modal || !grid) return;

    grid.innerHTML = '';
    // Pick 3 random upgrades
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

  // --- BUILDING & RECRUITMENT ---
  public recruitPawn() {
    if (this.resources.gold < 30 || this.resources.food < 10) {
      this.spawnFloatingText(this.hero.x, this.hero.y - 20, 'Не хватает золота или еды!', '#ef4444');
      return;
    }
    if (this.resources.pop >= this.resources.maxPop) {
      this.spawnFloatingText(this.hero.x, this.hero.y - 20, 'Достигнут лимит населения! Постройте дом.', '#ef4444');
      return;
    }

    this.resources.gold -= 30;
    this.resources.food -= 10;
    this.stats.unitsRecruited++;

    const pawn = new PawnUnit(this.castle.x + 20, this.castle.y + 60);
    this.friendlyUnits.push(pawn);
    this.sound.playBuild();
    this.spawnFloatingText(pawn.x, pawn.y - 20, '+1 Послушник', '#34d399');
  }

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

    const b = new Building(worldX, worldY, this.selectedBuildType as any, true);
    this.buildings.push(b);
    this.sound.playBuild();

    if (this.selectedBuildType === 'house') {
      this.resources.maxPop += 5;
    }

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
      speed: 1.8,
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
      spriteName: 'fx_dust',
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
      spriteName: 'fx_explosion',
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

  // --- RENDERING ---
  private render() {
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;

    ctx.clearRect(0, 0, w, h);

    ctx.save();
    // Apply camera transform
    ctx.translate(-Math.round(this.camera.x), -Math.round(this.camera.y));

    // 1. Water background
    ctx.fillStyle = '#1e3a8a';
    ctx.fillRect(0, 0, this.worldWidth, this.worldHeight);

    // 2. Main Grass Island
    ctx.fillStyle = '#22c55e';
    ctx.beginPath();
    ctx.roundRect(80, 80, this.worldWidth - 160, this.worldHeight - 160, 40);
    ctx.fill();

    // Inner terrain detailing
    ctx.fillStyle = '#16a34a';
    for (let x = 140; x < this.worldWidth - 140; x += 180) {
      for (let y = 140; y < this.worldHeight - 140; y += 180) {
        ctx.fillRect(x, y, 40, 20);
      }
    }

    // 3. Draw Resource Nodes (Trees, Gold, Sheep)
    for (const res of this.resourceNodes) {
      res.draw(ctx, this.assets);
    }

    // 4. Draw Buildings
    for (const b of this.buildings) {
      b.draw(ctx, this.assets);
    }

    // 5. Draw Friendly Units
    for (const u of this.friendlyUnits) {
      u.draw(ctx, this.assets);
    }

    // 6. Draw Hero
    this.hero.draw(ctx, this.assets);

    // 7. Draw Enemy Units
    for (const e of this.enemyUnits) {
      e.draw(ctx, this.assets);
    }

    // 8. Draw Projectiles (with ground shadow)
    for (const p of this.projectiles) {
      // Parabolic arc height
      const arcZ = Math.sin(p.progress * Math.PI) * p.arcHeight;

      // Shadow on ground
      ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
      ctx.beginPath();
      ctx.ellipse(p.x, p.y, 4, 2, 0, 0, Math.PI * 2);
      ctx.fill();

      // Flying arrow
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

    // 9. Draw Particles
    for (const pt of this.particles) {
      if (pt.spriteName) {
        this.assets.drawSprite(ctx, pt.spriteName, pt.x, pt.y, pt.frameIndex, pt.scale);
      }
    }

    // 10. Draw Floating Texts
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

    // 11. Building Placement Blueprint Ghost
    if (this.selectedBuildType) {
      ctx.save();
      ctx.globalAlpha = 0.55;
      this.assets.drawBuilding(ctx, 'building_' + this.selectedBuildType, this.mouseWorldX, this.mouseWorldY, 0.7);
      ctx.strokeStyle = '#ffd700';
      ctx.lineWidth = 2;
      ctx.strokeRect(this.mouseWorldX - 40, this.mouseWorldY - 60, 80, 60);
      ctx.restore();
    }

    // 12. Day/Night Ambient Light Filter
    if (this.phase === 'night') {
      ctx.fillStyle = 'rgba(10, 15, 35, 0.48)';
      ctx.fillRect(0, 0, this.worldWidth, this.worldHeight);

      // Warm torch light around Castle & Hero
      const radCastle = ctx.createRadialGradient(this.castle.x, this.castle.y, 20, this.castle.x, this.castle.y, 250);
      radCastle.addColorStop(0, 'rgba(255, 215, 0, 0.25)');
      radCastle.addColorStop(1, 'rgba(255, 215, 0, 0)');
      ctx.fillStyle = radCastle;
      ctx.fillRect(this.castle.x - 250, this.castle.y - 250, 500, 500);

      const radHero = ctx.createRadialGradient(this.hero.x, this.hero.y, 10, this.hero.x, this.hero.y, 140);
      radHero.addColorStop(0, 'rgba(255, 215, 0, 0.3)');
      radHero.addColorStop(1, 'rgba(255, 215, 0, 0)');
      ctx.fillStyle = radHero;
      ctx.fillRect(this.hero.x - 140, this.hero.y - 140, 280, 280);
    }

    ctx.restore();

    // 13. Render Minimap Radar
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
    mctx.fillRect(80 * scaleX, 80 * scaleY, (this.worldWidth - 160) * scaleX, (this.worldHeight - 160) * scaleY);

    // Castle
    mctx.fillStyle = '#38bdf8';
    mctx.fillRect(this.castle.x * scaleX - 3, this.castle.y * scaleY - 3, 6, 6);

    // Friendly units
    mctx.fillStyle = '#22c55e';
    for (const u of this.friendlyUnits) {
      mctx.fillRect(u.x * scaleX - 1.5, u.y * scaleY - 1.5, 3, 3);
    }

    // Hero
    mctx.fillStyle = '#ffd700';
    mctx.fillRect(this.hero.x * scaleX - 2.5, this.hero.y * scaleY - 2.5, 5, 5);

    // Enemies (blinking red)
    mctx.fillStyle = '#ef4444';
    for (const e of this.enemyUnits) {
      mctx.fillRect(e.x * scaleX - 2, e.y * scaleY - 2, 4, 4);
    }

    // Camera viewport box
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

    // Hero stats
    setTxt('#hud-hero-lvl', this.hero.level.toString());
    setTxt('#hud-hero-hp-text', `${Math.ceil(this.hero.hp)} / ${this.hero.maxHp}`);
    setWidth('#hud-hero-hp', (this.hero.hp / this.hero.maxHp) * 100);

    setTxt('#hud-hero-xp-text', `${this.hero.xp} / ${this.hero.xpNeeded} XP`);
    setWidth('#hud-hero-xp', (this.hero.xp / this.hero.xpNeeded) * 100);

    // Castle stats
    setTxt('#hud-castle-hp-text', `${Math.ceil(this.castle.hp)} / ${this.castle.maxHp}`);
    setWidth('#hud-castle-hp', (this.castle.hp / this.castle.maxHp) * 100);

    // Wave & Phase
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

    // Resources
    setTxt('#res-wood-val', Math.floor(this.resources.wood).toString());
    setTxt('#res-gold-val', Math.floor(this.resources.gold).toString());
    setTxt('#res-food-val', Math.floor(this.resources.food).toString());
    setTxt('#res-pop-val', `${this.resources.pop}/${this.resources.maxPop}`);

    // Skill cooldown masks
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
    // Keyboard
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

    // Mouse
    this.canvas.addEventListener('mousemove', (e) => {
      const rect = this.canvas.getBoundingClientRect();
      const screenX = e.clientX - rect.left;
      const screenY = e.clientY - rect.top;
      this.mouseWorldX = screenX + this.camera.x;
      this.mouseWorldY = screenY + this.camera.y;
    });

    this.canvas.addEventListener('mousedown', (e) => {
      if (e.button === 0) {
        // Left click
        if (this.selectedBuildType) {
          this.placeBuildingAt(this.mouseWorldX, this.mouseWorldY);
        } else {
          this.heroAttack();
        }
      } else if (e.button === 2) {
        // Right click -> Guard
        e.preventDefault();
        this.hero.isGuarding = true;
      }
    });

    this.canvas.addEventListener('mouseup', (e) => {
      if (e.button === 2) {
        this.hero.isGuarding = false;
      }
    });

    this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());

    // Menu Buttons
    this.root.querySelector('#btn-start-game')?.addEventListener('click', () => {
      this.startGame(this.mode, this.difficulty);
    });

    // Difficulty chips
    this.root.querySelectorAll('.diff-chip').forEach(btn => {
      btn.addEventListener('click', () => {
        this.root.querySelectorAll('.diff-chip').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.difficulty = btn.getAttribute('data-diff') as Difficulty;
      });
    });

    // Mode buttons
    this.root.querySelectorAll('.mode-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        this.root.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.mode = btn.getAttribute('data-mode') as GameMode;
      });
    });

    // Pause & Audio Buttons
    this.root.querySelector('#btn-pause')?.addEventListener('click', () => this.togglePause());
    this.root.querySelector('#btn-resume')?.addEventListener('click', () => this.togglePause());
    this.root.querySelector('#btn-restart')?.addEventListener('click', () => this.startGame(this.mode, this.difficulty));
    this.root.querySelector('#btn-to-menu')?.addEventListener('click', () => this.returnToMenu());
    this.root.querySelector('#btn-try-again')?.addEventListener('click', () => this.startGame(this.mode, this.difficulty));
    this.root.querySelector('#btn-go-menu')?.addEventListener('click', () => this.returnToMenu());

    this.root.querySelector('#btn-toggle-sound')?.addEventListener('click', () => {
      const muted = this.sound.toggleMute();
      const btn = this.root.querySelector('#btn-toggle-sound');
      if (btn) btn.textContent = muted ? '🔇' : '🔊';
    });

    // Command buttons
    this.root.querySelector('#cmd-follow')?.addEventListener('click', () => this.setArmyCommand('follow'));
    this.root.querySelector('#cmd-defend')?.addEventListener('click', () => this.setArmyCommand('defend'));
    this.root.querySelector('#cmd-attack')?.addEventListener('click', () => this.setArmyCommand('attack'));
    this.root.querySelector('#cmd-hire-pawn')?.addEventListener('click', () => this.recruitPawn());

    // Building buttons
    this.root.querySelectorAll('.build-card').forEach(btn => {
      btn.addEventListener('click', () => {
        const bType = btn.getAttribute('data-build');
        if (bType) this.selectBuildingPlacement(bType);
      });
    });

    // Mobile Virtual Joystick
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

    // Touch Action Buttons
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
