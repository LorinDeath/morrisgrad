// engine.ts - Complete Action Roguelite Game Engine for Geometria
import type {
  DifficultyConfig,
  DifficultyMultiplier,
  DropGem,
  Enemy,
  FloatingText,
  GameSaveData,
  Particle,
  PlayerCore,
  PlayerCoreType,
  PlayerStats,
  Projectile,
  UpgradeCard,
  WeaponId,
  EvolutionWeaponId,
  PassiveId,
  DimensionPact
} from './types';
import {
  DIFFICULTY_CONFIGS,
  PLAYER_CORES,
  ALL_WEAPONS_LIST,
  ALL_PASSIVES_LIST,
  EVOLUTION_RECIPES,
  DIMENSION_PACTS
} from './constants';
import { sound } from './audio';

// Helper: Generate polygon SVG points string
export function getPolygonPoints(sides: number, radius: number, cx: number = 0, cy: number = 0, rotation: number = 0): string {
  if (sides <= 2) return `${cx - radius},${cy} ${cx + radius},${cy}`;
  const points: string[] = [];
  const angleStep = (Math.PI * 2) / sides;
  const startAngle = rotation - Math.PI / 2; // Point upwards initially

  for (let i = 0; i < sides; i++) {
    const angle = startAngle + i * angleStep;
    const px = (cx + radius * Math.cos(angle)).toFixed(1);
    const py = (cy + radius * Math.sin(angle)).toFixed(1);
    points.push(`${px},${py}`);
  }
  return points.join(' ');
}

// Helper: Generate Star SVG points string
export function getStarPoints(spikes: number, outerR: number, innerR: number, cx: number = 0, cy: number = 0, rotation: number = 0): string {
  const points: string[] = [];
  const step = Math.PI / spikes;
  let angle = rotation - Math.PI / 2;

  for (let i = 0; i < spikes * 2; i++) {
    const r = i % 2 === 0 ? outerR : innerR;
    const px = (cx + r * Math.cos(angle)).toFixed(1);
    const py = (cy + r * Math.sin(angle)).toFixed(1);
    points.push(`${px},${py}`);
    angle += step;
  }
  return points.join(' ');
}

export class GameEngine {
  public arenaWidth = 1600;
  public arenaHeight = 900;

  // Selected config
  public difficulty: DifficultyConfig;
  public core: PlayerCore;

  // Player state
  public px = 800;
  public py = 450;
  public pvx = 0;
  public pvy = 0;
  public playerRotation = 0;
  public targetAimX = 800;
  public targetAimY = 400;

  public stats: PlayerStats;
  public level = 1;
  public currentXp = 0;
  public xpToNext = 30;
  public abilityCooldownTimer = 0;
  public abilityActiveTimer = 0;
  public dashCooldownTimer = 0;
  public iFramesTimer = 0;
  public isDashing = false;

  // Inventory: 6 Weapon slots + 6 Passive slots (Vampire Survivors formula)
  public weapons: Map<WeaponId | EvolutionWeaponId, number> = new Map();
  public passives: Map<PassiveId, number> = new Map();

  // Weapon internal cooldown timers
  private weaponCooldowns: Map<string, number> = new Map();
  public orbitalAngle = 0;
  public prismBeamAngle = 0;

  // Entities
  public enemies: Enemy[] = [];
  public projectiles: Projectile[] = [];
  public particles: Particle[] = [];
  public floatingTexts: FloatingText[] = [];
  public gems: DropGem[] = [];
  public mines: { x: number; y: number; timer: number; radius: number }[] = [];
  public sentries: { x: number; y: number; shootTimer: number; lifeTimer: number }[] = [];
  public toxicPuddles: { x: number; y: number; radius: number; lifeTimer: number; damage: number }[] = [];
  public vortices: { x: number; y: number; radius: number; lifeTimer: number; pullSpeed: number; damage: number }[] = [];

  // Wave & Spawning
  public wave = 1;
  public waveTime = 0;
  public waveDuration = 35; // seconds
  public waveKillCount = 0;
  public totalKills = 0;
  public shardsEarned = 0;
  public totalDamageDealt = 0;
  public highestCombo = 0;
  public currentCombo = 0;
  public comboTimer = 0;
  public bossActive = false;
  public bossEntityId: number | null = null;
  public isGameOver = false;
  public isVictory = false;
  public isPaused = false;
  public awaitingLevelUp = false;
  public awaitingBossPact = false;
  public availableBossPacts: DimensionPact[] = [];
  public activePacts: DimensionPact[] = [];

  // 1st New Mechanic: Hyper-Resonance Combo Overdrive
  public hyperResonanceTimer = 0;
  public isHyperResonance = false;

  // 2nd New Mechanic: Banish System
  public banishesLeft = 1;
  public banishedIds: Set<string> = new Set();

  public runDuration = 0;
  public nextEntityId = 1;
  public spawnTimer = 0;

  // Available upgrades pool
  public availableLevelUpCards: UpgradeCard[] = [];
  public rerollsLeft = 1;

  // Meta save data
  public saveData: GameSaveData;

  // Input states
  public keys: Record<string, boolean> = {};
  public autoAim = true;
  public autoFire = true;
  public mouseIsDown = false;

  constructor(difficultyMult: DifficultyMultiplier = 1, coreType: PlayerCoreType = 'delta', saveData: GameSaveData) {
    this.difficulty = DIFFICULTY_CONFIGS[difficultyMult] || DIFFICULTY_CONFIGS[1];
    this.core = PLAYER_CORES[coreType] || PLAYER_CORES['delta'];
    this.saveData = saveData;

    // Apply meta bonuses
    const metaHpLvl = saveData.metaUpgrades['meta_hp'] || 0;
    const metaDmgLvl = saveData.metaUpgrades['meta_dmg'] || 0;
    const metaSpeedLvl = saveData.metaUpgrades['meta_speed'] || 0;
    const metaMagnetLvl = saveData.metaUpgrades['meta_magnet'] || 0;
    const metaRerollLvl = saveData.metaUpgrades['meta_reroll'] || 0;
    const metaBanishLvl = saveData.metaUpgrades['meta_banish'] || 0;
    const metaReviveLvl = saveData.metaUpgrades['meta_revive'] || 0;
    const metaGreedLvl = saveData.metaUpgrades['meta_greed'] || 0;

    const baseHp = this.core.baseHp + metaHpLvl * 12;
    this.rerollsLeft = 1 + metaRerollLvl;
    this.banishesLeft = 1 + metaBanishLvl;

    // Check Quantum Reactor Tree (4th new mechanic)
    const tree = saveData.reactorTree || {};
    const hasHyperProj = !!tree['node_hyper_projectiles'];
    const hasCritMastery = !!tree['node_crit_mastery'];

    this.stats = {
      maxHp: baseHp,
      currentHp: baseHp,
      shield: this.core.id === 'tetra' ? 45 : 0,
      maxShield: this.core.id === 'tetra' ? 45 : 0,
      moveSpeed: this.core.baseSpeed * (1 + metaSpeedLvl * 0.06),
      damageMultiplier: (1 + metaDmgLvl * 0.08),
      attackSpeedMultiplier: 1.0,
      critChance: (this.core.id === 'delta' ? 0.30 : 0.08) + (hasCritMastery ? 0.10 : 0.0),
      critMultiplier: 2.0,
      pickupRadius: (this.core.id === 'octa' ? 220 : 130) * (1 + metaMagnetLvl * 0.3),
      armorReduction: this.core.id === 'tetra' ? 0.20 : 0.0,
      regenRate: 0.0,
      bulletSizeMultiplier: 1.0,
      projectileSpeedMultiplier: 1.0,
      abilityCooldownReduction: 0.0,
      shardsMultiplier: this.difficulty.shardMultiplier * (1 + metaGreedLvl * 0.15),
      revivesLeft: metaReviveLvl,
      extraProjectiles: hasHyperProj ? 1 : 0,
      extraPierce: 0,
      vampirismChance: 0.0,
      thornsReflectPct: 0.0,
      berserkActive: false,
      slowAuraRadius: 0,
      luckBonus: 0.0
    };

    // Give starting weapon based on core
    if (this.core.id === 'delta') {
      this.weapons.set('pulse_needle', 1);
    } else if (this.core.id === 'tetra') {
      this.weapons.set('singularity_nova', 1);
    } else if (this.core.id === 'hexa') {
      this.weapons.set('orbital_gliders', 1);
    } else {
      this.weapons.set('void_seekers', 1);
    }
  }

  public update(dt: number) {
    if (this.isGameOver || this.isPaused || this.awaitingLevelUp || this.awaitingBossPact) return;

    this.runDuration += dt;
    this.waveTime += dt;

    // Regen HP
    if (this.stats.regenRate > 0 && this.stats.currentHp < this.stats.maxHp) {
      this.stats.currentHp = Math.min(this.stats.maxHp, this.stats.currentHp + this.stats.regenRate * dt);
    }

    // Shield Regen
    if (this.stats.maxShield > 0 && this.stats.currentHp > 0) {
      this.stats.shield = Math.min(this.stats.maxShield, this.stats.shield + 3.5 * dt);
    }

    // Hyper-Resonance (1st New Mechanic)
    if (this.hyperResonanceTimer > 0) {
      this.hyperResonanceTimer -= dt;
      this.isHyperResonance = true;
      if (Math.random() < 0.35) {
        this.createParticle(this.px, this.py, (Math.random() - 0.5) * 80, (Math.random() - 0.5) * 80, '#00ffff', 8, 0.25, 'spark');
      }
    } else {
      this.isHyperResonance = false;
    }

    // Timers
    if (this.abilityCooldownTimer > 0) this.abilityCooldownTimer -= dt;
    if (this.abilityActiveTimer > 0) this.abilityActiveTimer -= dt;
    if (this.dashCooldownTimer > 0) this.dashCooldownTimer -= dt;
    if (this.iFramesTimer > 0) this.iFramesTimer -= dt;

    // Combo countdown
    const hasComboExtend = !!this.saveData?.reactorTree?.['node_combo_extend'];
    const comboMaxTime = hasComboExtend ? 4.5 : 2.2;
    if (this.comboTimer > 0) {
      this.comboTimer -= dt;
      if (this.comboTimer <= 0) {
        this.currentCombo = 0;
      }
    }

    // Player Movement
    this.handlePlayerMovement(dt);

    // Auto / Manual Aim
    this.updateAim();

    // Weapons firing (all 20 weapons + 10 evolutions)
    this.updateWeapons(dt);

    // Update Sentries & Special zones
    this.updateSentries(dt);
    this.updateToxicPuddles(dt);
    this.updateVortices(dt);
    this.updateMines(dt);

    // Wave Progression & Bosses
    this.updateWaveLogic();

    // Enemy Spawning
    this.updateSpawning(dt);

    // Update Entities
    this.updateEnemies(dt);
    this.updateProjectiles(dt);
    this.updateGems(dt);
    this.updateParticles(dt);
    this.updateFloatingTexts(dt);
  }

  private handlePlayerMovement(dt: number) {
    let dx = 0;
    let dy = 0;

    if (this.keys['KeyW'] || this.keys['ArrowUp']) dy -= 1;
    if (this.keys['KeyS'] || this.keys['ArrowDown']) dy += 1;
    if (this.keys['KeyA'] || this.keys['ArrowLeft']) dx -= 1;
    if (this.keys['KeyD'] || this.keys['ArrowRight']) dx += 1;

    // Normalize
    const len = Math.hypot(dx, dy);
    if (len > 0) {
      dx /= len;
      dy /= len;
    }

    let speed = this.stats.moveSpeed;
    if (this.isDashing) {
      speed *= 3.4;
    }
    if (this.isHyperResonance) {
      speed *= 1.25;
    }

    this.px += dx * speed * dt;
    this.py += dy * speed * dt;

    // Clamping within arena margins
    const margin = 30;
    this.px = Math.max(margin, Math.min(this.arenaWidth - margin, this.px));
    this.py = Math.max(margin, Math.min(this.arenaHeight - margin, this.py));

    // Dash trail particles
    if (this.isDashing) {
      this.createParticle(this.px, this.py, (Math.random() - 0.5) * 60, (Math.random() - 0.5) * 60, this.core.color, 14, 0.25, 'polygon', this.core.sides);
    }
  }

  public triggerDash() {
    if (this.dashCooldownTimer > 0) return;
    this.isDashing = true;
    this.iFramesTimer = 0.35;
    this.dashCooldownTimer = 1.6;

    sound.playDash();

    // Delta ability: Hyper dash deals 400% damage to all enemies along line
    if (this.core.id === 'delta' && this.abilityActiveTimer > 0) {
      this.damageEnemiesInRadius(this.px, this.py, 130, this.core.baseDamage * 4, true);
    }

    setTimeout(() => {
      this.isDashing = false;
    }, 250);
  }

  public triggerSpecialAbility() {
    if (this.abilityCooldownTimer > 0) return;
    const cd = this.core.abilityCooldown * (1 - this.stats.abilityCooldownReduction);
    this.abilityCooldownTimer = cd;
    sound.playSpecialAbility();

    if (this.core.id === 'delta') {
      this.abilityActiveTimer = 4.0;
      this.triggerDash();
      this.createShockwave(this.px, this.py, 200, '#00ffcc');
      this.addFloatingText(this.px, this.py - 30, '⚡ ГИПЕР-РЕЗКА!', '#00ffcc', 22);
    } else if (this.core.id === 'tetra') {
      this.iFramesTimer = 3.0;
      this.abilityActiveTimer = 3.0;
      this.createShockwave(this.px, this.py, 400, '#38bdf8');
      this.projectiles = this.projectiles.filter(p => p.isPlayer);
      this.enemies.forEach(e => {
        e.speed = 0;
        setTimeout(() => { e.speed = this.getEnemyBaseSpeed(e.type); }, 2500);
      });
      this.damageEnemiesInRadius(this.px, this.py, 450, 90, true);
      this.addFloatingText(this.px, this.py - 30, '🛡️ ЭМИ-БАСТИОН!', '#38bdf8', 22);
    } else if (this.core.id === 'hexa') {
      for (let i = 0; i < 3; i++) {
        const angle = (i * Math.PI * 2) / 3;
        this.sentries.push({
          x: this.px + Math.cos(angle) * 120,
          y: this.py + Math.sin(angle) * 120,
          shootTimer: 0,
          lifeTimer: 15.0
        });
      }
      this.createShockwave(this.px, this.py, 180, '#a855f7');
      this.addFloatingText(this.px, this.py - 30, '⬡ ПРИЗМА-ТУРЕЛИ!', '#a855f7', 22);
    } else if (this.core.id === 'octa') {
      this.abilityActiveTimer = 3.5;
      this.addFloatingText(this.px, this.py - 30, '💥 ЛУЧ СУДНОГО ДНЯ!', '#f59e0b', 24);
    }
  }

  private updateAim() {
    if (this.autoAim) {
      let nearestDist = Infinity;
      let target: Enemy | null = null;
      for (const e of this.enemies) {
        const d = Math.hypot(e.x - this.px, e.y - this.py);
        if (d < nearestDist) {
          nearestDist = d;
          target = e;
        }
      }
      if (target) {
        this.targetAimX = target.x;
        this.targetAimY = target.y;
      }
    }

    const angle = Math.atan2(this.targetAimY - this.py, this.targetAimX - this.px);
    this.playerRotation = angle;
  }

  // WEAPONS AND EVOLUTIONS UPDATE (All 20 Weapons + 10 Evolutions)
  private updateWeapons(dt: number) {
    this.orbitalAngle += dt * 3.5;
    this.prismBeamAngle += dt * 2.2;

    const atkSpeed = this.stats.attackSpeedMultiplier * (this.isHyperResonance ? 2.0 : 1.0);
    const extraProj = this.stats.extraProjectiles;

    // Octa Special Beam
    if (this.abilityActiveTimer > 0 && this.core.id === 'octa') {
      this.damageEnemiesInLine(this.px, this.py, this.targetAimX, this.targetAimY, 50, 140 * dt);
      this.createParticle(
        this.px + Math.cos(this.playerRotation) * (Math.random() * 500),
        this.py + Math.sin(this.playerRotation) * (Math.random() * 500),
        (Math.random() - 0.5) * 100,
        (Math.random() - 0.5) * 100,
        '#f59e0b',
        8,
        0.2,
        'spark'
      );
    }

    // 1. Pulse Needle / Hyper Rail
    if (this.weapons.has('pulse_needle') || this.weapons.has('hyper_rail')) {
      const isEvo = this.weapons.has('hyper_rail');
      const lvl = this.weapons.get('hyper_rail') || this.weapons.get('pulse_needle') || 1;
      const baseCd = isEvo ? 0.32 : Math.max(0.12, 0.45 - lvl * 0.05);
      this.advanceCooldown('pulse_needle', dt, baseCd / atkSpeed, () => {
        const count = (isEvo ? 3 : Math.min(5, 1 + Math.floor(lvl / 2))) + extraProj;
        const spread = isEvo ? 0.25 : 0.15;
        const startAngle = this.playerRotation - (spread * (count - 1)) / 2;

        for (let i = 0; i < count; i++) {
          const a = startAngle + i * spread;
          const speed = isEvo ? 1100 : 850 * this.stats.projectileSpeedMultiplier;
          this.projectiles.push({
            id: this.nextEntityId++,
            x: this.px,
            y: this.py,
            vx: Math.cos(a) * speed,
            vy: Math.sin(a) * speed,
            radius: isEvo ? 14 : 7 * this.stats.bulletSizeMultiplier,
            damage: (isEvo ? 65 : 22 + lvl * 6) * this.stats.damageMultiplier,
            color: isEvo ? '#00ffff' : '#38bdf8',
            isPlayer: true,
            pierce: (isEvo ? 99 : 1 + Math.floor(lvl / 3)) + this.stats.extraPierce,
            lifeTime: 0,
            maxLifeTime: 1.8,
            shape: 'laser',
            rotation: a
          });
        }
        sound.playShoot(isEvo ? 'heavy' : 'pulse');
      });
    }

    // 2. Void Seekers / Quantum Swarm
    if (this.weapons.has('void_seekers') || this.weapons.has('quantum_swarm')) {
      const isEvo = this.weapons.has('quantum_swarm');
      const lvl = this.weapons.get('quantum_swarm') || this.weapons.get('void_seekers') || 1;
      const cd = (isEvo ? 0.45 : 1.0 - lvl * 0.1) / atkSpeed;
      this.advanceCooldown('void_seekers', dt, cd, () => {
        const count = (isEvo ? 8 : 2 + Math.floor(lvl / 2)) + extraProj;
        for (let i = 0; i < count; i++) {
          const a = (i * Math.PI * 2) / count + Math.random() * 0.5;
          this.projectiles.push({
            id: this.nextEntityId++,
            x: this.px,
            y: this.py,
            vx: Math.cos(a) * 220,
            vy: Math.sin(a) * 220,
            radius: isEvo ? 10 : 8,
            damage: (isEvo ? 45 : 28 + lvl * 8) * this.stats.damageMultiplier,
            color: isEvo ? '#ec4899' : '#a855f7',
            isPlayer: true,
            pierce: 1 + this.stats.extraPierce,
            lifeTime: 0,
            maxLifeTime: 3.5,
            isHoming: true,
            shape: 'polygon',
            rotation: a
          });
        }
        sound.playShoot('homing');
      });
    }

    // 3. Fractal Mines / Supernova Tetra
    if (this.weapons.has('fractal_mines') || this.weapons.has('supernova_tetra')) {
      const isEvo = this.weapons.has('supernova_tetra');
      const lvl = this.weapons.get('supernova_tetra') || this.weapons.get('fractal_mines') || 1;
      const cd = (isEvo ? 1.0 : 2.0 - lvl * 0.2) / atkSpeed;
      this.advanceCooldown('fractal_mines', dt, cd, () => {
        const mineCount = 1 + Math.floor(extraProj / 2);
        for (let m = 0; m < mineCount; m++) {
          this.mines.push({
            x: this.px + (Math.random() - 0.5) * 100,
            y: this.py + (Math.random() - 0.5) * 100,
            timer: isEvo ? 0.7 : 1.6,
            radius: (isEvo ? 200 : 120 + lvl * 15) * this.stats.bulletSizeMultiplier
          });
        }
      });
    }

    // 4. Singularity Nova / Entropy Tsunami
    if (this.weapons.has('singularity_nova') || this.weapons.has('entropy_tsunami')) {
      const isEvo = this.weapons.has('entropy_tsunami');
      const lvl = this.weapons.get('entropy_tsunami') || this.weapons.get('singularity_nova') || 1;
      const cd = (isEvo ? 1.5 : 3.0 - lvl * 0.3) / atkSpeed;
      this.advanceCooldown('singularity_nova', dt, cd, () => {
        const radius = (isEvo ? 380 : 220 + lvl * 25) * this.stats.bulletSizeMultiplier;
        const dmg = (isEvo ? 95 : 40 + lvl * 12) * this.stats.damageMultiplier;
        this.createShockwave(this.px, this.py, radius, isEvo ? '#ff0055' : '#00ffcc');
        this.damageEnemiesInRadius(this.px, this.py, radius, dmg, true);
        sound.playExplosion(false);
      });
    }

    // 5. Tesla Polygon / Thunder God Matrix
    if (this.weapons.has('tesla_polygon') || this.weapons.has('thunder_god_matrix')) {
      const isEvo = this.weapons.has('thunder_god_matrix');
      const lvl = this.weapons.get('thunder_god_matrix') || this.weapons.get('tesla_polygon') || 1;
      const cd = (isEvo ? 0.6 : 1.2 - lvl * 0.1) / atkSpeed;
      this.advanceCooldown('tesla_polygon', dt, cd, () => {
        const targetsCount = (isEvo ? 15 : 3 + lvl * 2) + extraProj;
        const sorted = [...this.enemies].sort((a, b) => Math.hypot(a.x - this.px, a.y - this.py) - Math.hypot(b.x - this.px, b.y - this.py));
        const hitEnemies = sorted.slice(0, targetsCount);
        hitEnemies.forEach(e => {
          this.hitEnemy(e, (isEvo ? 55 : 25 + lvl * 6) * this.stats.damageMultiplier, isEvo);
          this.createParticle(e.x, e.y, (Math.random() - 0.5) * 100, (Math.random() - 0.5) * 100, '#facc15', 6, 0.2, 'spark');
        });
        if (hitEnemies.length > 0) sound.playShoot('pulse');
      });
    }

    // 6. Prism Beam / Death Star Prism
    if (this.weapons.has('prism_beam') || this.weapons.has('death_star_prism')) {
      const isEvo = this.weapons.has('death_star_prism');
      const lvl = this.weapons.get('death_star_prism') || this.weapons.get('prism_beam') || 1;
      const beamCount = isEvo ? 4 : 2;
      const dmg = (isEvo ? 80 : 30 + lvl * 8) * this.stats.damageMultiplier * dt;
      for (let b = 0; b < beamCount; b++) {
        const angle = this.prismBeamAngle + (b * Math.PI * 2) / beamCount;
        const targetX = this.px + Math.cos(angle) * 700;
        const targetY = this.py + Math.sin(angle) * 700;
        this.damageEnemiesInLine(this.px, this.py, targetX, targetY, 30, dmg);
      }
    }

    // 7. Bouncing Shuriken / Infinite Ricochet
    if (this.weapons.has('bouncing_shuriken') || this.weapons.has('infinite_ricochet')) {
      const isEvo = this.weapons.has('infinite_ricochet');
      const lvl = this.weapons.get('infinite_ricochet') || this.weapons.get('bouncing_shuriken') || 1;
      const cd = (isEvo ? 0.6 : 1.1 - lvl * 0.1) / atkSpeed;
      this.advanceCooldown('bouncing_shuriken', dt, cd, () => {
        const count = (isEvo ? 5 : 2 + Math.floor(lvl / 2)) + extraProj;
        for (let i = 0; i < count; i++) {
          const a = (i * Math.PI * 2) / count + Math.random();
          this.projectiles.push({
            id: this.nextEntityId++,
            x: this.px,
            y: this.py,
            vx: Math.cos(a) * 550,
            vy: Math.sin(a) * 550,
            radius: 12,
            damage: (isEvo ? 50 : 25 + lvl * 7) * this.stats.damageMultiplier,
            color: '#10b981',
            isPlayer: true,
            pierce: 5 + this.stats.extraPierce,
            lifeTime: 0,
            maxLifeTime: isEvo ? 6.0 : 3.0,
            shape: 'polygon',
            rotation: a,
            vRot: 12,
            bounces: isEvo ? 12 : 4
          });
        }
        sound.playShoot('pulse');
      });
    }

    // 8. Vortex Gravity / Black Hole Singularity
    if (this.weapons.has('vortex_gravity') || this.weapons.has('black_hole_singularity')) {
      const isEvo = this.weapons.has('black_hole_singularity');
      const lvl = this.weapons.get('black_hole_singularity') || this.weapons.get('vortex_gravity') || 1;
      const cd = (isEvo ? 2.0 : 3.5 - lvl * 0.3) / atkSpeed;
      this.advanceCooldown('vortex_gravity', dt, cd, () => {
        const vx = this.px + (Math.random() - 0.5) * 400;
        const vy = this.py + (Math.random() - 0.5) * 400;
        this.vortices.push({
          x: vx,
          y: vy,
          radius: (isEvo ? 260 : 160 + lvl * 18) * this.stats.bulletSizeMultiplier,
          lifeTimer: isEvo ? 4.5 : 2.5,
          pullSpeed: isEvo ? 350 : 200,
          damage: (isEvo ? 60 : 25 + lvl * 6) * this.stats.damageMultiplier
        });
        sound.playExplosion(false);
      });
    }

    // 9. Plasma Mortar / Orbital Cataclysm
    if (this.weapons.has('plasma_mortar') || this.weapons.has('orbital_cataclysm')) {
      const isEvo = this.weapons.has('orbital_cataclysm');
      const lvl = this.weapons.get('orbital_cataclysm') || this.weapons.get('plasma_mortar') || 1;
      const cd = (isEvo ? 1.0 : 2.2 - lvl * 0.2) / atkSpeed;
      this.advanceCooldown('plasma_mortar', dt, cd, () => {
        const count = (isEvo ? 6 : 2 + Math.floor(lvl / 3)) + extraProj;
        for (let i = 0; i < count; i++) {
          const tx = this.px + (Math.random() - 0.5) * 600;
          const ty = this.py + (Math.random() - 0.5) * 600;
          setTimeout(() => {
            this.createShockwave(tx, ty, isEvo ? 180 : 110, '#ef4444');
            this.damageEnemiesInRadius(tx, ty, isEvo ? 180 : 110, (isEvo ? 85 : 45 + lvl * 10) * this.stats.damageMultiplier, true);
            sound.playExplosion(false);
          }, 350);
        }
      });
    }

    // 10. Hex Drone
    if (this.weapons.has('hex_drone')) {
      const lvl = this.weapons.get('hex_drone') || 1;
      const cd = (0.5 - lvl * 0.05) / atkSpeed;
      this.advanceCooldown('hex_drone', dt, cd, () => {
        if (this.enemies.length > 0) {
          const target = this.enemies[0];
          const a = Math.atan2(target.y - this.py, target.x - this.px);
          this.projectiles.push({
            id: this.nextEntityId++,
            x: this.px + Math.cos(this.orbitalAngle) * 50,
            y: this.py + Math.sin(this.orbitalAngle) * 50,
            vx: Math.cos(a) * 800,
            vy: Math.sin(a) * 800,
            radius: 8,
            damage: (18 + lvl * 5) * this.stats.damageMultiplier,
            color: '#c084fc',
            isPlayer: true,
            pierce: 1 + this.stats.extraPierce,
            lifeTime: 0,
            maxLifeTime: 1.5,
            shape: 'laser',
            rotation: a
          });
        }
      });
    }

    // 11. Sonic Rings
    if (this.weapons.has('sonic_rings')) {
      const lvl = this.weapons.get('sonic_rings') || 1;
      this.advanceCooldown('sonic_rings', dt, (2.0 - lvl * 0.15) / atkSpeed, () => {
        const r = (140 + lvl * 20) * this.stats.bulletSizeMultiplier;
        this.createShockwave(this.px, this.py, r, '#38bdf8');
        this.damageEnemiesInRadius(this.px, this.py, r, (30 + lvl * 8) * this.stats.damageMultiplier, false);
      });
    }

    // 12. Mirror Boomerang
    if (this.weapons.has('mirror_boomerang')) {
      const lvl = this.weapons.get('mirror_boomerang') || 1;
      this.advanceCooldown('mirror_boomerang', dt, (1.4 - lvl * 0.1) / atkSpeed, () => {
        const count = 1 + extraProj;
        for (let i = 0; i < count; i++) {
          const a = this.playerRotation + (i - (count - 1) / 2) * 0.25;
          this.projectiles.push({
            id: this.nextEntityId++,
            x: this.px,
            y: this.py,
            vx: Math.cos(a) * 600,
            vy: Math.sin(a) * 600,
            radius: 14,
            damage: (35 + lvl * 9) * this.stats.damageMultiplier,
            color: '#34d399',
            isPlayer: true,
            pierce: 99,
            lifeTime: 0,
            maxLifeTime: 2.4,
            shape: 'polygon',
            rotation: a,
            vRot: 15,
            isBoomerang: true,
            boomerangState: 'forward',
            originX: this.px,
            originY: this.py,
            hitList: new Set()
          });
        }
        sound.playShoot('pulse');
      });
    }

    // 13. Toxic Matrix
    if (this.weapons.has('toxic_matrix')) {
      const lvl = this.weapons.get('toxic_matrix') || 1;
      this.advanceCooldown('toxic_matrix', dt, (1.5 - lvl * 0.1) / atkSpeed, () => {
        this.toxicPuddles.push({
          x: this.px,
          y: this.py,
          radius: (50 + lvl * 10) * this.stats.bulletSizeMultiplier,
          lifeTimer: 4.0,
          damage: (15 + lvl * 5) * this.stats.damageMultiplier
        });
      });
    }

    // 14. Meteor Swarm
    if (this.weapons.has('meteor_swarm')) {
      const lvl = this.weapons.get('meteor_swarm') || 1;
      this.advanceCooldown('meteor_swarm', dt, (2.4 - lvl * 0.2) / atkSpeed, () => {
        const count = 3 + extraProj;
        for (let i = 0; i < count; i++) {
          const mx = this.px + (Math.random() - 0.5) * 700;
          const my = this.py + (Math.random() - 0.5) * 700;
          this.createParticle(mx, my - 200, 0, 400, '#f97316', 15, 0.5, 'polygon', 5);
          setTimeout(() => {
            this.createShockwave(mx, my, 130, '#f97316');
            this.damageEnemiesInRadius(mx, my, 130, (50 + lvl * 14) * this.stats.damageMultiplier, true);
            sound.playExplosion(false);
          }, 450);
        }
      });
    }

    // 15. Orbital Laser Satellite
    if (this.weapons.has('orbital_laser_satellite')) {
      const lvl = this.weapons.get('orbital_laser_satellite') || 1;
      this.advanceCooldown('orbital_laser_satellite', dt, (0.7 - lvl * 0.05) / atkSpeed, () => {
        const satAngle = this.orbitalAngle * 1.5;
        const satX = this.px + Math.cos(satAngle) * 160;
        const satY = this.py + Math.sin(satAngle) * 160;
        const a = satAngle + Math.PI / 2;
        this.projectiles.push({
          id: this.nextEntityId++,
          x: satX,
          y: satY,
          vx: Math.cos(a) * 900,
          vy: Math.sin(a) * 900,
          radius: 8,
          damage: (26 + lvl * 7) * this.stats.damageMultiplier,
          color: '#00ffcc',
          isPlayer: true,
          pierce: 2 + this.stats.extraPierce,
          lifeTime: 0,
          maxLifeTime: 1.5,
          shape: 'laser',
          rotation: a
        });
      });
    }

    // 16. Cryo Spikes
    if (this.weapons.has('cryo_spikes')) {
      const lvl = this.weapons.get('cryo_spikes') || 1;
      this.advanceCooldown('cryo_spikes', dt, (1.6 - lvl * 0.1) / atkSpeed, () => {
        const count = 4 + extraProj;
        for (let i = 0; i < count; i++) {
          const a = (i * Math.PI * 2) / count + this.orbitalAngle;
          this.projectiles.push({
            id: this.nextEntityId++,
            x: this.px,
            y: this.py,
            vx: Math.cos(a) * 450,
            vy: Math.sin(a) * 450,
            radius: 10,
            damage: (28 + lvl * 6) * this.stats.damageMultiplier,
            color: '#67e8f9',
            isPlayer: true,
            pierce: 3 + this.stats.extraPierce,
            lifeTime: 0,
            maxLifeTime: 2.0,
            shape: 'polygon',
            rotation: a
          });
        }
      });
    }

    // 17. Saw Blade
    if (this.weapons.has('saw_blade')) {
      const lvl = this.weapons.get('saw_blade') || 1;
      this.advanceCooldown('saw_blade', dt, (2.5 - lvl * 0.2) / atkSpeed, () => {
        const a = this.playerRotation;
        this.projectiles.push({
          id: this.nextEntityId++,
          x: this.px,
          y: this.py,
          vx: Math.cos(a) * 220,
          vy: Math.sin(a) * 220,
          radius: 30 * this.stats.bulletSizeMultiplier,
          damage: (38 + lvl * 10) * this.stats.damageMultiplier,
          color: '#e11d48',
          isPlayer: true,
          pierce: 99,
          lifeTime: 0,
          maxLifeTime: 4.5,
          shape: 'saw',
          rotation: a,
          vRot: 20
        });
      });
    }

    // 18. Cluster Dodecahedron
    if (this.weapons.has('cluster_dodecahedron')) {
      const lvl = this.weapons.get('cluster_dodecahedron') || 1;
      this.advanceCooldown('cluster_dodecahedron', dt, (2.6 - lvl * 0.2) / atkSpeed, () => {
        const a = this.playerRotation;
        this.projectiles.push({
          id: this.nextEntityId++,
          x: this.px,
          y: this.py,
          vx: Math.cos(a) * 400,
          vy: Math.sin(a) * 400,
          radius: 16,
          damage: (50 + lvl * 12) * this.stats.damageMultiplier,
          color: '#d97706',
          isPlayer: true,
          pierce: 1,
          lifeTime: 0,
          maxLifeTime: 1.0,
          shape: 'polygon',
          rotation: a
        });
      });
    }

    // 19. Chaos Spark
    if (this.weapons.has('chaos_spark')) {
      const lvl = this.weapons.get('chaos_spark') || 1;
      this.advanceCooldown('chaos_spark', dt, (1.3 - lvl * 0.1) / atkSpeed, () => {
        const a = Math.random() * Math.PI * 2;
        this.projectiles.push({
          id: this.nextEntityId++,
          x: this.px,
          y: this.py,
          vx: Math.cos(a) * 500,
          vy: Math.sin(a) * 500,
          radius: 10,
          damage: (40 + lvl * 10) * this.stats.damageMultiplier,
          color: '#f43f5e',
          isPlayer: true,
          pierce: 4 + this.stats.extraPierce,
          lifeTime: 0,
          maxLifeTime: 3.0,
          shape: 'spark',
          rotation: a,
          bounces: 6
        });
      });
    }
  }

  private advanceCooldown(key: string, dt: number, targetCd: number, onReady: () => void) {
    const cur = (this.weaponCooldowns.get(key) || 0) + dt;
    if (cur >= targetCd) {
      this.weaponCooldowns.set(key, 0);
      onReady();
    } else {
      this.weaponCooldowns.set(key, cur);
    }
  }

  private updateSentries(dt: number) {
    for (let i = this.sentries.length - 1; i >= 0; i--) {
      const s = this.sentries[i];
      s.lifeTimer -= dt;
      s.shootTimer += dt;
      if (s.lifeTimer <= 0) {
        this.createShockwave(s.x, s.y, 60, '#a855f7');
        this.sentries.splice(i, 1);
        continue;
      }
      if (s.shootTimer >= 0.3) {
        s.shootTimer = 0;
        let target: Enemy | null = null;
        let minD = 500;
        for (const e of this.enemies) {
          const d = Math.hypot(e.x - s.x, e.y - s.y);
          if (d < minD) {
            minD = d;
            target = e;
          }
        }
        if (target) {
          const a = Math.atan2(target.y - s.y, target.x - s.x);
          this.projectiles.push({
            id: this.nextEntityId++,
            x: s.x,
            y: s.y,
            vx: Math.cos(a) * 900,
            vy: Math.sin(a) * 900,
            radius: 6,
            damage: 25 * this.stats.damageMultiplier,
            color: '#a855f7',
            isPlayer: true,
            pierce: 1,
            lifeTime: 0,
            maxLifeTime: 1.5,
            shape: 'laser',
            rotation: a
          });
        }
      }
    }
  }

  private updateToxicPuddles(dt: number) {
    for (let i = this.toxicPuddles.length - 1; i >= 0; i--) {
      const p = this.toxicPuddles[i];
      p.lifeTimer -= dt;
      this.damageEnemiesInRadius(p.x, p.y, p.radius, p.damage * dt * 2, false);
      if (p.lifeTimer <= 0) {
        this.toxicPuddles.splice(i, 1);
      }
    }
  }

  private updateVortices(dt: number) {
    for (let i = this.vortices.length - 1; i >= 0; i--) {
      const v = this.vortices[i];
      v.lifeTimer -= dt;

      // Pull enemies towards vortex center
      for (const e of this.enemies) {
        const dist = Math.hypot(v.x - e.x, v.y - e.y);
        if (dist < v.radius && dist > 15) {
          const a = Math.atan2(v.y - e.y, v.x - e.x);
          e.x += Math.cos(a) * v.pullSpeed * dt;
          e.y += Math.sin(a) * v.pullSpeed * dt;
          this.hitEnemy(e, v.damage * dt * 1.5, false);
        }
      }

      if (v.lifeTimer <= 0) {
        this.createShockwave(v.x, v.y, v.radius * 1.2, '#8b5cf6');
        this.damageEnemiesInRadius(v.x, v.y, v.radius * 1.2, v.damage * 3, true);
        this.vortices.splice(i, 1);
      }
    }
  }

  private updateMines(dt: number) {
    for (let i = this.mines.length - 1; i >= 0; i--) {
      const m = this.mines[i];
      m.timer -= dt;

      let triggered = m.timer <= 0;
      if (!triggered) {
        for (const e of this.enemies) {
          if (Math.hypot(e.x - m.x, e.y - m.y) < 50) {
            triggered = true;
            break;
          }
        }
      }

      if (triggered) {
        this.createShockwave(m.x, m.y, m.radius, '#f59e0b');
        this.damageEnemiesInRadius(m.x, m.y, m.radius, 70 * this.stats.damageMultiplier, true);
        sound.playExplosion(false);

        // Spawn cluster shrapnel
        for (let k = 0; k < 6; k++) {
          const a = (k * Math.PI * 2) / 6;
          this.projectiles.push({
            id: this.nextEntityId++,
            x: m.x,
            y: m.y,
            vx: Math.cos(a) * 450,
            vy: Math.sin(a) * 450,
            radius: 8,
            damage: 30 * this.stats.damageMultiplier,
            color: '#f59e0b',
            isPlayer: true,
            pierce: 2,
            lifeTime: 0,
            maxLifeTime: 0.8,
            shape: 'polygon',
            rotation: a
          });
        }

        this.mines.splice(i, 1);
      }
    }
  }

  private updateWaveLogic() {
    if (this.waveTime >= this.waveDuration) {
      this.waveTime = 0;
      this.wave++;
      this.addFloatingText(this.arenaWidth / 2, 180, `⚡ ВОЛНА ${this.wave} ⚡`, '#ffd700', 36);

      // Boss Wave Check: every 5 waves
      if (this.wave % 5 === 0 && !this.bossActive) {
        this.spawnBoss();
      }
    }
  }

  private updateSpawning(dt: number) {
    const maxEnemies = Math.floor((30 + this.wave * 7) * this.difficulty.enemyCountMult);
    if (this.enemies.length >= maxEnemies) return;

    this.spawnTimer += dt;
    const spawnInterval = Math.max(0.10, (1.4 - this.wave * 0.04) / this.difficulty.enemyCountMult);

    if (this.spawnTimer >= spawnInterval) {
      this.spawnTimer = 0;
      this.spawnEnemy();
    }
  }

  private spawnEnemy() {
    let x = 0;
    let y = 0;
    const side = Math.floor(Math.random() * 4);
    if (side === 0) {
      x = Math.random() * this.arenaWidth;
      y = -40;
    } else if (side === 1) {
      x = this.arenaWidth + 40;
      y = Math.random() * this.arenaHeight;
    } else if (side === 2) {
      x = Math.random() * this.arenaWidth;
      y = this.arenaHeight + 40;
    } else {
      x = -40;
      y = Math.random() * this.arenaHeight;
    }

    const roll = Math.random();
    let type: Enemy['type'] = 'dot';
    let sides = 0;
    let radius = 14;
    let hp = 30;
    let speed = 190;
    let damage = 12;
    let color = '#ef4444';
    let strokeColor = '#f87171';
    let xpValue = 10;
    let shardValue = 1;

    if (this.wave >= 2 && roll > 0.4) {
      type = 'triangle';
      sides = 3;
      radius = 18;
      hp = 55;
      speed = 240;
      damage = 18;
      color = '#f97316';
      strokeColor = '#fb923c';
      xpValue = 18;
      shardValue = 2;
    }
    if (this.wave >= 4 && roll > 0.65) {
      type = 'square';
      sides = 4;
      radius = 24;
      hp = 130;
      speed = 130;
      damage = 25;
      color = '#3b82f6';
      strokeColor = '#60a5fa';
      xpValue = 35;
      shardValue = 4;
    }
    if (this.wave >= 6 && roll > 0.8) {
      type = 'pentagon';
      sides = 5;
      radius = 22;
      hp = 95;
      speed = 150;
      damage = 20;
      color = '#10b981';
      strokeColor = '#34d399';
      xpValue = 45;
      shardValue = 5;
    }
    if (this.wave >= 8 && roll > 0.9) {
      type = 'hexagon';
      sides = 6;
      radius = 28;
      hp = 220;
      speed = 110;
      damage = 35;
      color = '#eab308';
      strokeColor = '#fde047';
      xpValue = 70;
      shardValue = 8;
    }

    hp *= this.difficulty.enemyHpMult * (1 + (this.wave - 1) * 0.18);
    speed *= this.difficulty.enemySpeedMult;

    const isElite = Math.random() < this.difficulty.eliteChance;
    let eliteAffix: Enemy['eliteAffix'] | undefined = undefined;
    let shieldHp = 0;

    if (isElite) {
      hp *= 3.0;
      radius *= 1.4;
      damage *= 1.5;
      xpValue *= 3.5;
      shardValue *= 4;
      const affixes: Enemy['eliteAffix'][] = ['shielded', 'hyperspeed', 'explosive', 'pulsar', 'vortex'];
      eliteAffix = affixes[Math.floor(Math.random() * affixes.length)];
      if (eliteAffix === 'shielded') shieldHp = hp * 0.6;
      if (eliteAffix === 'hyperspeed') speed *= 1.5;
    }

    this.enemies.push({
      id: this.nextEntityId++,
      type,
      x,
      y,
      vx: 0,
      vy: 0,
      hp,
      maxHp: hp,
      radius,
      color,
      strokeColor,
      sides,
      rotation: Math.random() * Math.PI * 2,
      rotationSpeed: (Math.random() - 0.5) * 4,
      speed,
      damage,
      xpValue,
      shardValue,
      isElite,
      eliteAffix,
      shieldHp,
      shootCooldown: type === 'pentagon' ? 1.5 : 0
    });
  }

  private spawnBoss() {
    this.bossActive = true;
    sound.playBossAlert();

    const bossHp = (8000 + this.wave * 3500) * this.difficulty.enemyHpMult;
    const bossType: Enemy['bossType'] = this.wave === 5 ? 'penta_colossus' : this.wave === 10 ? 'octa_leviathan' : this.wave === 15 ? 'void_icosahedron' : 'hyper_fractal_prime';
    const bossTitle = bossType === 'penta_colossus' ? 'ПЕНТА-КОЛОСС' : bossType === 'octa_leviathan' ? 'ОКТА-ЛЕВИАФАН' : bossType === 'void_icosahedron' ? 'ИКОСАЭДР ПУСТОТЫ' : 'ФРАКТАЛЬНЫЙ ПРАЙМ';

    const boss: Enemy = {
      id: this.nextEntityId++,
      type: 'boss',
      bossType,
      x: this.arenaWidth / 2,
      y: -100,
      vx: 0,
      vy: 0,
      hp: bossHp,
      maxHp: bossHp,
      radius: 75,
      color: '#ff0055',
      strokeColor: '#ff77aa',
      sides: bossType === 'penta_colossus' ? 5 : bossType === 'octa_leviathan' ? 8 : 12,
      rotation: 0,
      rotationSpeed: 0.8,
      speed: 85 * this.difficulty.enemySpeedMult,
      damage: 45,
      xpValue: 1200,
      shardValue: 80 * this.difficulty.shardMultiplier,
      isElite: true,
      shootCooldown: 1.0,
      specialTimer: 4.0
    };

    this.enemies.push(boss);
    this.bossEntityId = boss.id;

    this.addFloatingText(this.arenaWidth / 2, 240, `⚠️ БОСС: ${bossTitle} ⚠️`, '#ff0055', 40);
  }

  private updateEnemies(dt: number) {
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];
      e.rotation += e.rotationSpeed * dt;

      // Check frozen
      if (e.frozenTimer && e.frozenTimer > 0) {
        e.frozenTimer -= dt;
      }

      // Check Chrono Dilation passive aura
      let currentSpeed = e.speed;
      if (this.stats.slowAuraRadius > 0 && Math.hypot(e.x - this.px, e.y - this.py) < this.stats.slowAuraRadius) {
        currentSpeed *= 0.75;
      }
      if (e.frozenTimer && e.frozenTimer > 0) {
        currentSpeed *= 0.5;
      }

      const angle = Math.atan2(this.py - e.y, this.px - e.x);
      e.vx = Math.cos(angle) * currentSpeed;
      e.vy = Math.sin(angle) * currentSpeed;

      e.x += e.vx * dt;
      e.y += e.vy * dt;

      // Shooting logic
      if (e.shootCooldown !== undefined) {
        e.shootCooldown -= dt;
        if (e.shootCooldown <= 0) {
          if (e.type === 'pentagon') {
            e.shootCooldown = 2.2;
            this.shootEnemyBullet(e.x, e.y, angle, 280, 16, '#10b981');
          } else if (e.type === 'boss') {
            e.shootCooldown = Math.max(0.6, 1.4 - this.difficulty.multiplier * 0.05);
            const bullets = 8 + Math.floor(this.difficulty.multiplier);
            for (let b = 0; b < bullets; b++) {
              const bAngle = e.rotation + (b * Math.PI * 2) / bullets;
              this.shootEnemyBullet(e.x, e.y, bAngle, 240 * this.difficulty.enemySpeedMult, 20, '#ff0055');
            }
          }
        }
      }

      // Boss special ability
      if (e.type === 'boss' && e.specialTimer !== undefined) {
        e.specialTimer -= dt;
        if (e.specialTimer <= 0) {
          e.specialTimer = 5.0;
          this.createShockwave(e.x, e.y, 350, '#ff0055');
          for (let s = 0; s < 16; s++) {
            const sAngle = (s * Math.PI * 2) / 16;
            this.shootEnemyBullet(e.x, e.y, sAngle, 320, 22, '#ffd700');
          }
        }
      }

      // Check collision with player
      const distToPlayer = Math.hypot(this.px - e.x, this.py - e.y);
      if (distToPlayer < e.radius + 18) {
        this.hitPlayer(e.damage);
        // Thorns Reflector passive
        if (this.stats.thornsReflectPct > 0) {
          this.hitEnemy(e, e.damage * this.stats.thornsReflectPct, false);
        }
        e.x -= Math.cos(angle) * 40;
        e.y -= Math.sin(angle) * 40;
      }
    }
  }

  private shootEnemyBullet(x: number, y: number, angle: number, speed: number, damage: number, color: string) {
    this.projectiles.push({
      id: this.nextEntityId++,
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      radius: 7,
      damage,
      color,
      isPlayer: false,
      pierce: 1,
      lifeTime: 0,
      maxLifeTime: 5.0,
      bounces: this.difficulty.multiplier >= 16 ? 1 : 0
    });
  }

  private updateProjectiles(dt: number) {
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      p.lifeTime += dt;

      // Homing logic
      if (p.isHoming && p.isPlayer) {
        let nearest: Enemy | null = null;
        let minD = 400;
        for (const e of this.enemies) {
          const d = Math.hypot(e.x - p.x, e.y - p.y);
          if (d < minD) {
            minD = d;
            nearest = e;
          }
        }
        if (nearest) {
          const targetAngle = Math.atan2(nearest.y - p.y, nearest.x - p.x);
          const curAngle = Math.atan2(p.vy, p.vx);
          const diff = Math.atan2(Math.sin(targetAngle - curAngle), Math.cos(targetAngle - curAngle));
          const turnSpeed = 8.0 * dt;
          const newAngle = curAngle + Math.sign(diff) * Math.min(Math.abs(diff), turnSpeed);
          const speed = Math.hypot(p.vx, p.vy);
          p.vx = Math.cos(newAngle) * speed;
          p.vy = Math.sin(newAngle) * speed;
          p.rotation = newAngle;
        }
      }

      // Boomerang returning logic
      if (p.isBoomerang) {
        if (p.boomerangState === 'forward' && p.lifeTime > 0.8) {
          p.boomerangState = 'returning';
        }
        if (p.boomerangState === 'returning') {
          const toPlayerAngle = Math.atan2(this.py - p.y, this.px - p.x);
          p.vx = Math.cos(toPlayerAngle) * 700;
          p.vy = Math.sin(toPlayerAngle) * 700;
          if (Math.hypot(this.px - p.x, this.py - p.y) < 30) {
            this.projectiles.splice(i, 1);
            continue;
          }
        }
      }

      p.x += p.vx * dt;
      p.y += p.vy * dt;

      // Bounce at screen edges
      if (p.bounces && p.bounces > 0) {
        if (p.x <= 0 || p.x >= this.arenaWidth) {
          p.vx *= -1;
          p.bounces--;
        }
        if (p.y <= 0 || p.y >= this.arenaHeight) {
          p.vy *= -1;
          p.bounces--;
        }
      }

      // Lifetime & Boundary checks
      if (
        p.lifeTime >= p.maxLifeTime ||
        p.x < -100 ||
        p.x > this.arenaWidth + 100 ||
        p.y < -100 ||
        p.y > this.arenaHeight + 100
      ) {
        // Cluster grenade explosion
        if (p.shape === 'polygon' && p.color === '#d97706') {
          for (let k = 0; k < 6; k++) {
            const a = (k * Math.PI * 2) / 6;
            this.projectiles.push({
              id: this.nextEntityId++,
              x: p.x,
              y: p.y,
              vx: Math.cos(a) * 350,
              vy: Math.sin(a) * 350,
              radius: 9,
              damage: p.damage * 0.6,
              color: '#d97706',
              isPlayer: true,
              pierce: 1,
              lifeTime: 0,
              maxLifeTime: 0.6,
              shape: 'spark'
            });
          }
        }
        this.projectiles.splice(i, 1);
        continue;
      }

      // Player projectiles hit enemies
      if (p.isPlayer) {
        let hitSomething = false;
        for (let j = this.enemies.length - 1; j >= 0; j--) {
          const e = this.enemies[j];
          if (p.hitList && p.hitList.has(e.id)) continue;

          const dist = Math.hypot(e.x - p.x, e.y - p.y);
          if (dist < e.radius + p.radius) {
            this.hitEnemy(e, p.damage, p.crit);
            if (p.color === '#67e8f9') {
              e.frozenTimer = 2.0; // Cryo freeze
            }
            if (p.hitList) p.hitList.add(e.id);
            hitSomething = true;
            p.pierce--;
            if (p.pierce <= 0) break;
          }
        }
        if (hitSomething && p.pierce <= 0) {
          this.createParticle(p.x, p.y, (Math.random() - 0.5) * 50, (Math.random() - 0.5) * 50, p.color, 4, 0.2, 'spark');
          this.projectiles.splice(i, 1);
        }
      } else {
        // Enemy projectile hits player
        const dist = Math.hypot(this.px - p.x, this.py - p.y);
        if (dist < p.radius + 16) {
          this.hitPlayer(p.damage);
          this.createParticle(p.x, p.y, (Math.random() - 0.5) * 60, (Math.random() - 0.5) * 60, p.color, 6, 0.25, 'spark');
          this.projectiles.splice(i, 1);
        }
      }
    }
  }

  public hitEnemy(enemy: Enemy, rawDamage: number, forceCrit = false) {
    let finalMult = this.stats.damageMultiplier;
    // Berserk Resonator passive
    if (this.stats.berserkActive) {
      const missingHpPct = 1 - (this.stats.currentHp / this.stats.maxHp);
      finalMult *= (1 + missingHpPct);
    }
    if (this.isHyperResonance) {
      finalMult *= 1.5;
    }

    const isCrit = forceCrit || Math.random() < this.stats.critChance;
    const finalDamage = Math.round(rawDamage * finalMult * (isCrit ? this.stats.critMultiplier : 1));

    // Shield check on elite
    if (enemy.shieldHp && enemy.shieldHp > 0) {
      enemy.shieldHp -= finalDamage;
      this.addFloatingText(enemy.x, enemy.y - enemy.radius, `[🛡️ ${finalDamage}]`, '#38bdf8', 15);
      sound.playHit();
      return;
    }

    enemy.hp -= finalDamage;
    this.totalDamageDealt += finalDamage;
    sound.playHit();

    // Floating text
    this.addFloatingText(
      enemy.x + (Math.random() - 0.5) * 20,
      enemy.y - enemy.radius - 10,
      isCrit ? `${finalDamage}!` : `${finalDamage}`,
      isCrit ? '#ffd700' : '#ffffff',
      isCrit ? 22 : 16
    );

    this.createParticle(enemy.x, enemy.y, (Math.random() - 0.5) * 90, (Math.random() - 0.5) * 90, enemy.color, 5, 0.15, 'spark');

    // Combo system & Hyper-Resonance Trigger (1st New Mechanic)
    this.currentCombo++;
    this.comboTimer = 2.2;
    if (this.currentCombo > this.highestCombo) {
      this.highestCombo = this.currentCombo;
    }

    // Trigger Hyper-Resonance every 25 combo!
    if (this.currentCombo % 25 === 0 && !this.isHyperResonance) {
      this.hyperResonanceTimer = 6.0;
      this.createShockwave(this.px, this.py, 300, '#00ffff');
      this.addFloatingText(this.px, this.py - 50, '🔥 ГИПЕР-РЕЗОНАНС! (x2 СКОРОСТЬ)', '#00ffff', 28);
      sound.playSpecialAbility();
    }

    // Execute Protocol (Quantum Reactor Node)
    if (this.saveData?.reactorTree?.['node_execute'] && enemy.hp > 0 && enemy.hp < enemy.maxHp * 0.15 && enemy.type !== 'boss') {
      enemy.hp = 0;
      this.addFloatingText(enemy.x, enemy.y, '💀 КАЗНЬ!', '#ef4444', 18);
    }

    if (enemy.hp <= 0) {
      this.killEnemy(enemy);
    }
  }

  private killEnemy(enemy: Enemy) {
    const idx = this.enemies.indexOf(enemy);
    if (idx !== -1) {
      this.enemies.splice(idx, 1);
    }

    this.totalKills++;
    this.waveKillCount++;

    sound.playExplosion(enemy.type === 'boss');

    // Vampirism Matrix passive
    if (this.stats.vampirismChance > 0 && Math.random() < this.stats.vampirismChance) {
      this.stats.currentHp = Math.min(this.stats.maxHp, this.stats.currentHp + 3);
      this.addFloatingText(this.px, this.py - 30, '+3 HP (Вампиризм)', '#f43f5e', 16);
    }

    // Death explosion: Shatter into polygon vertices
    const shardCount = enemy.sides > 0 ? enemy.sides * 2 : 8;
    for (let k = 0; k < shardCount; k++) {
      const a = (k * Math.PI * 2) / shardCount + Math.random() * 0.4;
      const speed = 120 + Math.random() * 180;
      this.createParticle(
        enemy.x,
        enemy.y,
        Math.cos(a) * speed,
        Math.sin(a) * speed,
        enemy.color,
        Math.max(5, enemy.radius / 3),
        0.5 + Math.random() * 0.4,
        'polygon',
        3
      );
    }

    // High difficulty on-death shrapnel (x8, x16, x32, x64)
    if (this.difficulty.multiplier >= 8 && enemy.type !== 'dot') {
      const bulletCount = this.difficulty.multiplier >= 16 ? 6 : 4;
      for (let s = 0; s < bulletCount; s++) {
        const sAngle = (s * Math.PI * 2) / bulletCount;
        this.shootEnemyBullet(enemy.x, enemy.y, sAngle, 220, 14, '#ef4444');
      }
    }

    // Spawn XP Gems
    this.gems.push({
      id: this.nextEntityId++,
      x: enemy.x,
      y: enemy.y,
      value: enemy.xpValue,
      type: 'xp',
      radius: 8,
      color: enemy.xpValue > 50 ? '#ffd700' : enemy.xpValue > 25 ? '#a855f7' : '#00ffcc',
      sides: 4,
      rotation: 0
    });

    // Spawn Quantum Shard
    const baseShardCount = enemy.shardValue;
    const finalShards = Math.max(1, Math.round(baseShardCount * this.stats.shardsMultiplier));
    this.shardsEarned += finalShards;

    // Small chance for utility drops
    const utilityRoll = Math.random() * (1 + this.stats.luckBonus);
    if (utilityRoll < 0.025) {
      this.gems.push({
        id: this.nextEntityId++,
        x: enemy.x + 20,
        y: enemy.y + 20,
        value: 30,
        type: 'heal',
        radius: 12,
        color: '#10b981',
        sides: 8,
        rotation: 0
      });
    } else if (utilityRoll < 0.045) {
      this.gems.push({
        id: this.nextEntityId++,
        x: enemy.x + 20,
        y: enemy.y + 20,
        value: 1,
        type: 'magnet',
        radius: 12,
        color: '#38bdf8',
        sides: 6,
        rotation: 0
      });
    }

    // Boss Defeat -> 3rd New Mechanic: DIMENSION PACTS SELECTION!
    if (enemy.type === 'boss') {
      this.bossActive = false;
      this.bossEntityId = null;
      this.createShockwave(enemy.x, enemy.y, 600, '#ffd700');
      this.addFloatingText(this.arenaWidth / 2, 220, '🏆 БОСС УНИЧТОЖЕН! 🏆', '#ffd700', 42);

      // Quantum Symbiosis Reactor Node
      if (this.saveData?.reactorTree?.['node_vampire_lord']) {
        this.stats.currentHp = Math.min(this.stats.maxHp, this.stats.currentHp + this.stats.maxHp * 0.2);
        this.stats.shield = this.stats.maxShield;
        this.addFloatingText(this.px, this.py - 40, '💖 КВАНТОВЫЙ СИМБИОЗ (+20% HP)', '#ffd700', 22);
      }

      // Offer 3 Dimension Pacts (Mutation System)
      this.triggerBossDimensionPact();

      // Mega XP & Shard drop
      for (let g = 0; g < 15; g++) {
        const offX = (Math.random() - 0.5) * 120;
        const offY = (Math.random() - 0.5) * 120;
        this.gems.push({
          id: this.nextEntityId++,
          x: enemy.x + offX,
          y: enemy.y + offY,
          value: 120,
          type: 'xp',
          radius: 12,
          color: '#ffd700',
          sides: 5,
          rotation: 0
        });
      }
    }
  }

  // 3rd New Mechanic: Dimension Pact Selection after Boss
  private triggerBossDimensionPact() {
    const unselectedPacts = DIMENSION_PACTS.filter(p => !this.activePacts.some(ap => ap.id === p.id));
    if (unselectedPacts.length > 0) {
      unselectedPacts.sort(() => Math.random() - 0.5);
      this.availableBossPacts = unselectedPacts.slice(0, 3);
      this.awaitingBossPact = true;
    }
  }

  public selectDimensionPact(pact: DimensionPact) {
    this.activePacts.push(pact);
    this.awaitingBossPact = false;

    // Apply pact boons and curses
    if (pact.id === 'glass_cannon') {
      this.stats.damageMultiplier *= 2.2;
      this.stats.maxHp = Math.max(20, Math.round(this.stats.maxHp * 0.6));
      this.stats.currentHp = Math.min(this.stats.currentHp, this.stats.maxHp);
    } else if (pact.id === 'time_warp') {
      this.difficulty.enemySpeedMult *= 0.7;
      this.difficulty.enemyCountMult *= 1.5;
    } else if (pact.id === 'quantum_greed') {
      this.stats.shardsMultiplier *= 3.5;
    } else if (pact.id === 'photon_cascade') {
      this.stats.extraProjectiles += 2;
      this.stats.abilityCooldownReduction -= 0.25;
    } else if (pact.id === 'vampiric_pact') {
      this.stats.vampirismChance += 0.15;
      this.stats.regenRate = 0;
      this.stats.shield = 0;
      this.stats.maxShield = 0;
    }

    sound.playLevelUp();
    this.addFloatingText(this.px, this.py - 40, `АКТИВИРОВАН: ${pact.title}!`, pact.color, 24);
  }

  public hitPlayer(damage: number) {
    if (this.iFramesTimer > 0) return;

    const actualDamage = Math.max(1, Math.round(damage * (1 - this.stats.armorReduction)));

    // Quantum Greed pact penalty
    if (this.activePacts.some(p => p.id === 'quantum_greed') && this.shardsEarned > 10) {
      const lost = Math.round(this.shardsEarned * 0.04);
      this.shardsEarned -= lost;
      this.addFloatingText(this.px, this.py + 20, `-${lost} 💎 (Штраф Пакта)`, '#ffd700', 16);
    }

    // Shield absorption
    if (this.stats.shield > 0) {
      if (this.stats.shield >= actualDamage) {
        this.stats.shield -= actualDamage;
        this.addFloatingText(this.px, this.py - 25, `🛡️ -${actualDamage}`, '#38bdf8', 18);
        this.iFramesTimer = 0.2;
        return;
      } else {
        const leftover = actualDamage - this.stats.shield;
        this.stats.shield = 0;
        this.stats.currentHp -= leftover;

        // Reactive Barrier Node in Quantum Reactor
        if (this.saveData?.reactorTree?.['node_reactive_barrier']) {
          this.createShockwave(this.px, this.py, 350, '#38bdf8');
          this.projectiles = this.projectiles.filter(p => p.isPlayer);
          this.damageEnemiesInRadius(this.px, this.py, 350, 60, true);
        }
      }
    } else {
      this.stats.currentHp -= actualDamage;
    }

    // Emergency Phase Reactor Node
    if (this.saveData?.reactorTree?.['node_emergency_phase'] && actualDamage > 25) {
      this.iFramesTimer = 1.5;
      this.addFloatingText(this.px, this.py - 30, '🌀 ФАЗОВЫЙ СДВИГ!', '#38bdf8', 20);
    } else {
      this.iFramesTimer = 0.5;
    }

    sound.playHit();
    this.addFloatingText(this.px, this.py - 25, `-${actualDamage}`, '#ef4444', 20);
    this.createShockwave(this.px, this.py, 80, '#ff0055');

    if (this.stats.currentHp <= 0) {
      if (this.stats.revivesLeft > 0) {
        this.stats.revivesLeft--;
        this.stats.currentHp = Math.round(this.stats.maxHp * 0.6);
        this.iFramesTimer = 2.5;
        this.createShockwave(this.px, this.py, 500, '#ffd700');
        this.addFloatingText(this.px, this.py - 40, '✨ КВАНТОВЫЙ РЕАНИМАТОР СРАБОТАЛ! ✨', '#ffd700', 26);
        sound.playSpecialAbility();
      } else {
        this.gameOver();
      }
    }
  }

  private gameOver() {
    this.isGameOver = true;
    sound.stopBgm();
    sound.playExplosion(true);

    this.saveData.quantumShards += this.shardsEarned;
    this.saveData.totalRuns += 1;
    this.saveData.totalKills += this.totalKills;

    const mult = this.difficulty.multiplier;
    const currentHigh = this.saveData.highScores[mult] || 0;
    const finalScore = this.calculateScore();
    if (finalScore > currentHigh) {
      this.saveData.highScores[mult] = finalScore;
    }

    const currentBestWave = this.saveData.bestWaves[mult] || 0;
    if (this.wave > currentBestWave) {
      this.saveData.bestWaves[mult] = this.wave;
    }

    this.persistSave();
  }

  public calculateScore(): number {
    return Math.round(
      (this.totalKills * 50 + this.runDuration * 20 + this.totalDamageDealt * 0.1) *
      this.difficulty.scoreMultiplier
    );
  }

  private persistSave() {
    try {
      localStorage.setItem('geometria_save_v1', JSON.stringify(this.saveData));
    } catch (e) {
      console.warn('Could not save to localStorage', e);
    }
  }

  private updateGems(dt: number) {
    for (let i = this.gems.length - 1; i >= 0; i--) {
      const g = this.gems[i];
      g.rotation += dt * 3;

      const dist = Math.hypot(this.px - g.x, this.py - g.y);
      if (dist < this.stats.pickupRadius) {
        const angle = Math.atan2(this.py - g.y, this.px - g.x);
        const speed = Math.min(1000, 300 + (this.stats.pickupRadius - dist) * 6);
        g.x += Math.cos(angle) * speed * dt;
        g.y += Math.sin(angle) * speed * dt;

        if (dist < 25) {
          this.collectGem(g);
          this.gems.splice(i, 1);
        }
      }
    }
  }

  private collectGem(gem: DropGem) {
    sound.playGem();
    if (gem.type === 'xp') {
      this.currentXp += gem.value;
      if (this.currentXp >= this.xpToNext) {
        this.levelUp();
      }
    } else if (gem.type === 'heal') {
      this.stats.currentHp = Math.min(this.stats.maxHp, this.stats.currentHp + gem.value);
      this.addFloatingText(this.px, this.py - 30, `+${gem.value} HP`, '#10b981', 18);
    } else if (gem.type === 'magnet') {
      this.gems.forEach(g => {
        g.x = this.px;
        g.y = this.py;
      });
      this.addFloatingText(this.px, this.py - 30, '🧲 МАГНИТНЫЙ ИМПУЛЬС!', '#38bdf8', 20);
    }
  }

  private levelUp() {
    this.level++;
    this.currentXp -= this.xpToNext;
    this.xpToNext = Math.round(this.xpToNext * 1.35 + 20);

    sound.playLevelUp();
    this.createShockwave(this.px, this.py, 300, '#ffd700');
    this.addFloatingText(this.px, this.py - 40, `УРОВЕНЬ ${this.level}!`, '#ffd700', 30);

    this.awaitingLevelUp = true;
    this.generateUpgradeCards();
  }

  // GENERATE UPGRADE CARDS (Supports 20 Weapons, 10 Evolutions, 20 Passives, Banish Filtering)
  public generateUpgradeCards() {
    const cards: UpgradeCard[] = [];

    // Check all 10 Evolutions first
    const hasFreeEvolution = !!this.saveData?.reactorTree?.['node_free_evolution'];

    for (const [evoId, recipe] of Object.entries(EVOLUTION_RECIPES)) {
      const eId = evoId as EvolutionWeaponId;
      const baseWeaponLvl = this.weapons.get(recipe.baseWeaponId) || 0;
      const hasReqPassive = (this.passives.get(recipe.requiredPassiveId) || 0) >= 1 || hasFreeEvolution;
      const alreadyHasEvo = this.weapons.has(eId);

      if (baseWeaponLvl === 5 && hasReqPassive && !alreadyHasEvo && !this.banishedIds.has(eId)) {
        cards.push({
          id: `evo_${eId}`,
          type: 'evolution',
          weaponId: eId,
          name: recipe.name,
          titleRu: recipe.titleRu,
          description: recipe.desc,
          rarity: 'evolution',
          level: 1,
          maxLevel: 1,
          iconSvg: getPolygonPoints(recipe.iconSides, 16, 20, 20),
          color: recipe.color
        });
      }
    }

    // 20 Standard Weapons (respects 6 weapon slot limit and banish list)
    for (const w of ALL_WEAPONS_LIST) {
      if (this.banishedIds.has(w.id)) continue;
      const curLvl = this.weapons.get(w.id) || 0;
      // Offer if not maxed AND (player has < 6 weapons OR already owns this weapon)
      if (curLvl < 5 && (this.weapons.size < 6 || curLvl > 0)) {
        cards.push({
          id: `w_${w.id}`,
          type: 'weapon',
          weaponId: w.id,
          name: w.name,
          titleRu: curLvl === 0 ? `НОВОЕ: ${w.name}` : `${w.name} (Ур. ${curLvl + 1})`,
          description: curLvl === 0 ? w.desc : `+25% к урону и снижению перезарядки оружия.`,
          rarity: curLvl === 4 ? 'epic' : curLvl === 0 ? 'rare' : 'common',
          level: curLvl + 1,
          maxLevel: 5,
          iconSvg: getPolygonPoints(w.iconSides, 16, 20, 20),
          color: w.color
        });
      }
    }

    // 20 Passives (respects 6 passive slot limit and banish list)
    for (const p of ALL_PASSIVES_LIST) {
      if (this.banishedIds.has(p.id)) continue;
      const curLvl = this.passives.get(p.id) || 0;
      // Offer if not maxed AND (player has < 6 passives OR already owns this passive)
      if (curLvl < 5 && (this.passives.size < 6 || curLvl > 0)) {
        cards.push({
          id: `p_${p.id}`,
          type: 'passive',
          passiveId: p.id,
          name: p.name,
          titleRu: curLvl === 0 ? `МОДУЛЬ: ${p.name}` : `${p.name} (Ур. ${curLvl + 1})`,
          description: p.desc,
          rarity: curLvl === 4 ? 'legendary' : curLvl === 0 ? 'rare' : 'common',
          level: curLvl + 1,
          maxLevel: 5,
          iconSvg: getStarPoints(5, 16, 8, 20, 20),
          color: p.color
        });
      }
    }

    // Shuffle and pick 4 (or 5 if node_luck_overflow is active in Quantum Reactor)
    cards.sort(() => Math.random() - 0.5);
    const cardLimit = this.saveData?.reactorTree?.['node_luck_overflow'] ? 5 : 4;
    this.availableLevelUpCards = cards.slice(0, cardLimit);
  }

  public selectUpgrade(card: UpgradeCard) {
    if (card.type === 'weapon' && card.weaponId) {
      const cur = this.weapons.get(card.weaponId) || 0;
      this.weapons.set(card.weaponId, cur + 1);
    } else if (card.type === 'evolution' && card.weaponId) {
      // Find recipe to remove base weapon
      const recipe = EVOLUTION_RECIPES[card.weaponId as EvolutionWeaponId];
      if (recipe) {
        this.weapons.delete(recipe.baseWeaponId);
      }
      this.weapons.set(card.weaponId, 1);
    } else if (card.type === 'passive' && card.passiveId) {
      const cur = this.passives.get(card.passiveId) || 0;
      this.passives.set(card.passiveId, cur + 1);
      this.applyPassiveBonus(card.passiveId);
    }

    this.awaitingLevelUp = false;
  }

  // 2nd New Mechanic: Banish Card from Run
  public banishCard(card: UpgradeCard): boolean {
    if (this.banishesLeft <= 0) return false;
    this.banishesLeft--;

    if (card.weaponId) this.banishedIds.add(card.weaponId);
    if (card.passiveId) this.banishedIds.add(card.passiveId);

    // Regenerate cards excluding the newly banished item
    this.generateUpgradeCards();
    sound.playButtonClick();
    return true;
  }

  public rerollUpgrades(): boolean {
    if (this.rerollsLeft <= 0) return false;
    this.rerollsLeft--;
    this.generateUpgradeCards();
    sound.playButtonClick();
    return true;
  }

  private applyPassiveBonus(id: PassiveId) {
    if (id === 'kinetic_vector') this.stats.moveSpeed *= 1.12;
    if (id === 'crystalline_armor') this.stats.armorReduction = Math.min(0.70, this.stats.armorReduction + 0.15);
    if (id === 'gravity_grip') this.stats.pickupRadius *= 1.4;
    if (id === 'quantum_overclock') this.stats.attackSpeedMultiplier *= 1.15;
    if (id === 'fractal_scale') this.stats.bulletSizeMultiplier *= 1.25;
    if (id === 'prism_focus') {
      this.stats.critChance += 0.10;
      this.stats.critMultiplier += 0.35;
    }
    if (id === 'nano_repair') this.stats.regenRate += 0.8;
    if (id === 'overcharge_battery') this.stats.abilityCooldownReduction = Math.min(0.60, this.stats.abilityCooldownReduction + 0.15);
    if (id === 'kinetic_momentum') this.stats.projectileSpeedMultiplier *= 1.30;
    if (id === 'volatile_fuel') this.stats.damageMultiplier *= 1.20;
    if (id === 'vampiric_matrix') this.stats.vampirismChance += 0.04;
    if (id === 'energy_shield_generator') {
      this.stats.maxShield += 35;
      this.stats.shield += 35;
    }
    if (id === 'chrono_dilation') this.stats.slowAuraRadius = 220;
    if (id === 'luck_algorithm') this.stats.luckBonus += 0.15;
    if (id === 'greed_prism') this.stats.shardsMultiplier *= 1.25;
    if (id === 'berserk_resonator') this.stats.berserkActive = true;
    if (id === 'thorns_reflector') this.stats.thornsReflectPct += 1.5;
    if (id === 'pierce_accelerator') this.stats.extraPierce += 1;
    if (id === 'multi_fork') this.stats.extraProjectiles += 1;
  }

  private damageEnemiesInRadius(cx: number, cy: number, radius: number, damage: number, allowCrit: boolean) {
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];
      if (Math.hypot(e.x - cx, e.y - cy) < radius + e.radius) {
        this.hitEnemy(e, damage, allowCrit);
      }
    }
  }

  private damageEnemiesInLine(x1: number, y1: number, x2: number, y2: number, thickness: number, damage: number) {
    const angle = Math.atan2(y2 - y1, x2 - x1);
    const length = 1400;
    const endX = x1 + Math.cos(angle) * length;
    const endY = y1 + Math.sin(angle) * length;

    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];
      const dist = this.distToSegment(e.x, e.y, x1, y1, endX, endY);
      if (dist < thickness + e.radius) {
        this.hitEnemy(e, damage, false);
      }
    }
  }

  private distToSegment(px: number, py: number, x1: number, y1: number, x2: number, y2: number) {
    const l2 = (x2 - x1) ** 2 + (y2 - y1) ** 2;
    if (l2 === 0) return Math.hypot(px - x1, py - y1);
    let t = ((px - x1) * (x2 - x1) + (py - y1) * (y2 - y1)) / l2;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(px - (x1 + t * (x2 - x1)), py - (y1 + t * (y2 - y1)));
  }

  private getEnemyBaseSpeed(type: Enemy['type']): number {
    if (type === 'triangle') return 240 * this.difficulty.enemySpeedMult;
    if (type === 'square') return 130 * this.difficulty.enemySpeedMult;
    if (type === 'pentagon') return 150 * this.difficulty.enemySpeedMult;
    if (type === 'hexagon') return 110 * this.difficulty.enemySpeedMult;
    return 190 * this.difficulty.enemySpeedMult;
  }

  public createParticle(
    x: number,
    y: number,
    vx: number,
    vy: number,
    color: string,
    radius: number,
    maxLife: number,
    shape: Particle['shape'] = 'polygon',
    sides: number = 3
  ) {
    this.particles.push({
      x,
      y,
      vx,
      vy,
      color,
      radius,
      life: maxLife,
      maxLife,
      sides,
      rotation: Math.random() * Math.PI * 2,
      vRot: (Math.random() - 0.5) * 6,
      shape
    });
  }

  public createShockwave(x: number, y: number, radius: number, color: string) {
    this.particles.push({
      x,
      y,
      vx: 0,
      vy: 0,
      color,
      radius,
      life: 0.35,
      maxLife: 0.35,
      shape: 'ring'
    });
  }

  private updateParticles(dt: number) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.rotation !== undefined && p.vRot !== undefined) {
        p.rotation += p.vRot * dt;
      }
      if (p.life <= 0) {
        this.particles.splice(i, 1);
      }
    }
  }

  public addFloatingText(x: number, y: number, text: string, color: string, fontSize = 16) {
    this.floatingTexts.push({
      id: this.nextEntityId++,
      x,
      y,
      text,
      color,
      fontSize,
      opacity: 1.0,
      life: 0.8,
      vy: -55
    });
  }

  private updateFloatingTexts(dt: number) {
    for (let i = this.floatingTexts.length - 1; i >= 0; i--) {
      const ft = this.floatingTexts[i];
      ft.life -= dt;
      ft.y += ft.vy * dt;
      ft.opacity = Math.max(0, ft.life / 0.8);
      if (ft.life <= 0) {
        this.floatingTexts.splice(i, 1);
      }
    }
  }
}
