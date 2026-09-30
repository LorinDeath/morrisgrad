// entities.ts - Core game entities: Hero, Pawns, Soldiers, Enemies, Buildings, Resources, and Projectiles

import type { UnitFaction, UnitRole, PawnActivity, PawnTool, PawnCargo, BuildingType } from './types';
import type { AssetManager } from './assets';
import type { SoundEngine } from './audio';

export class BaseEntity {
  public id: number;
  public x: number;
  public y: number;
  public radius: number;
  public dead: boolean = false;

  constructor(x: number, y: number, radius: number = 20) {
    this.id = Math.floor(Math.random() * 10000000);
    this.x = x;
    this.y = y;
    this.radius = radius;
  }

  public update(dt: number): void {}
  public draw(ctx: CanvasRenderingContext2D, assets: AssetManager): void {}
}

export class Unit extends BaseEntity {
  public faction: UnitFaction;
  public role: UnitRole;
  public hp: number;
  public maxHp: number;
  public speed: number;
  public attackDamage: number;
  public attackRange: number;
  public attackCooldown: number;
  public attackTimer: number = 0;

  // Animation and state
  public state: 'idle' | 'run' | 'attack' | 'guard' | 'heal' = 'idle';
  public animKey: string = '';
  public frameIndex: number = 0;
  public frameSpeed: number = 8; // frames per second
  public flipX: boolean = false;
  public scale: number = 0.55;

  // Navigation & AI
  public targetX: number | null = null;
  public targetY: number | null = null;
  public targetEntity: Unit | Building | null = null;
  public isGuarding: boolean = false;
  public hitFlashTimer: number = 0;

  constructor(
    x: number, 
    y: number, 
    faction: UnitFaction, 
    role: UnitRole, 
    maxHp: number, 
    speed: number, 
    damage: number, 
    range: number = 35
  ) {
    super(x, y, 18);
    this.faction = faction;
    this.role = role;
    this.maxHp = maxHp;
    this.hp = maxHp;
    this.speed = speed;
    this.attackDamage = damage;
    this.attackRange = range;
    this.attackCooldown = 0.9;
  }

  public takeDamage(amount: number, canBlock: boolean = false): number {
    if (this.dead) return 0;
    let finalDmg = amount;
    if (canBlock && this.isGuarding) {
      finalDmg = Math.round(amount * 0.2); // 80% damage reduction
    }
    this.hp -= finalDmg;
    this.hitFlashTimer = 0.15;
    if (this.hp <= 0) {
      this.hp = 0;
      this.dead = true;
    }
    return finalDmg;
  }

  public heal(amount: number): number {
    if (this.dead) return 0;
    const oldHp = this.hp;
    this.hp = Math.min(this.maxHp, this.hp + amount);
    return this.hp - oldHp;
  }

  public update(dt: number): void {
    if (this.attackTimer > 0) this.attackTimer -= dt;
    if (this.hitFlashTimer > 0) this.hitFlashTimer -= dt;

    // Advance sprite animation
    this.frameIndex += this.frameSpeed * dt;

    // Movement towards target position or target entity
    let destX = this.targetX;
    let destY = this.targetY;

    if (this.targetEntity) {
      if (this.targetEntity.dead) {
        this.targetEntity = null;
      } else {
        destX = this.targetEntity.x;
        destY = this.targetEntity.y;
      }
    }

    if (destX !== null && destY !== null) {
      const dx = destX - this.x;
      const dy = destY - this.y;
      const dist = Math.hypot(dx, dy);

      const stopDist = this.targetEntity ? this.attackRange * 0.8 : 5;

      if (dist > stopDist) {
        const moveDist = Math.min(dist, this.speed * dt);
        this.x += (dx / dist) * moveDist;
        this.y += (dy / dist) * moveDist;
        this.flipX = dx < 0;
        this.state = 'run';
      } else {
        if (!this.targetEntity) {
          this.targetX = null;
          this.targetY = null;
        }
        if (this.state === 'run') this.state = 'idle';
      }
    } else {
      if (this.state === 'run') this.state = 'idle';
    }
  }

  public drawHealthBar(ctx: CanvasRenderingContext2D): void {
    if (this.dead || this.hp >= this.maxHp) return;
    const barW = 28;
    const barH = 4;
    const bx = this.x - barW / 2;
    const by = this.y - 38;

    ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
    ctx.fillRect(bx, by, barW, barH);

    const fillRatio = Math.max(0, this.hp / this.maxHp);
    ctx.fillStyle = this.faction === 'player' ? '#22c55e' : '#ef4444';
    ctx.fillRect(bx, by, barW * fillRatio, barH);
  }

  public draw(ctx: CanvasRenderingContext2D, assets: AssetManager): void {
    // Shadow beneath unit
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(this.x, this.y, 14, 7, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
    ctx.fill();
    ctx.restore();

    // Hit flash
    const alpha = this.hitFlashTimer > 0 ? 0.7 : 1;

    // Sprite drawing
    const drawn = assets.drawSprite(
      ctx,
      this.animKey,
      this.x,
      this.y,
      this.frameIndex,
      this.scale,
      this.flipX,
      alpha
    );

    // Fallback if sprite not loaded
    if (!drawn) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(this.x, this.y - 12, 12, 0, Math.PI * 2);
      ctx.fillStyle = this.faction === 'player' ? '#3b82f6' : '#ef4444';
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.restore();
    }

    this.drawHealthBar(ctx);
  }
}

// HERO UNIT - Grand Knight of the Ascetics
export class HeroUnit extends Unit {
  public level: number = 1;
  public xp: number = 0;
  public xpNeeded: number = 100;
  public comboStep: number = 0;
  public dashCooldown: number = 3.0;
  public dashTimer: number = 0;
  public whirlCooldown: number = 6.0;
  public whirlTimer: number = 0;
  public rallyCooldown: number = 12.0;
  public rallyTimer: number = 0;
  public isDashing: boolean = false;
  public dashDuration: number = 0.25;

  constructor(x: number, y: number) {
    super(x, y, 'player', 'hero', 200, 140, 35, 45);
    this.animKey = 'hero_idle';
    this.scale = 0.65;
  }

  public addXp(amount: number): boolean {
    this.xp += amount;
    if (this.xp >= this.xpNeeded) {
      this.xp -= this.xpNeeded;
      this.level++;
      this.xpNeeded = Math.round(this.xpNeeded * 1.4);
      this.maxHp += 30;
      this.hp = this.maxHp;
      this.attackDamage += 6;
      return true; // Leveled up
    }
    return false;
  }

  public update(dt: number): void {
    if (this.dashTimer > 0) this.dashTimer -= dt;
    if (this.whirlTimer > 0) this.whirlTimer -= dt;
    if (this.rallyTimer > 0) this.rallyTimer -= dt;

    if (this.isDashing) {
      this.dashDuration -= dt;
      if (this.dashDuration <= 0) {
        this.isDashing = false;
        this.speed = 140;
      }
    }

    super.update(dt);

    // Pick sprite based on state
    if (this.isGuarding) {
      this.animKey = 'hero_guard';
    } else if (this.state === 'attack') {
      this.animKey = this.comboStep === 1 ? 'hero_attack2' : 'hero_attack1';
    } else if (this.state === 'run') {
      this.animKey = 'hero_run';
    } else {
      this.animKey = 'hero_idle';
    }
  }
}

// PAWN (PEASANT) - Gathers wood, gold, food, builds structures
export class PawnUnit extends Unit {
  public activity: PawnActivity = 'idle';
  public currentTool: PawnTool = 'none';
  public cargo: PawnCargo = 'none';
  public targetResource: ResourceNode | null = null;
  public targetBuilding: Building | null = null;
  public harvestTimer: number = 0;
  public castleRef: Building | null = null;

  constructor(x: number, y: number) {
    super(x, y, 'player', 'pawn', 80, 110, 8, 30);
    this.animKey = 'pawn_idle';
    this.scale = 0.55;
  }

  public assignHarvest(res: ResourceNode, castle: Building) {
    this.targetResource = res;
    this.targetBuilding = null;
    this.castleRef = castle;
    this.activity = 'moving';
    this.targetX = res.x;
    this.targetY = res.y;
    this.cargo = 'none';

    if (res.type === 'tree') this.currentTool = 'axe';
    else if (res.type === 'gold_mine' || res.type === 'gold_stone') this.currentTool = 'pickaxe';
    else if (res.type === 'sheep') this.currentTool = 'knife';
  }

  public assignBuild(building: Building) {
    this.targetBuilding = building;
    this.targetResource = null;
    this.activity = 'building';
    this.targetX = building.x;
    this.targetY = building.y;
    this.currentTool = 'hammer';
  }

  public update(dt: number): void {
    super.update(dt);

    // AI Logic for harvesting and returning goods
    if (this.activity === 'moving' && this.targetResource) {
      const dist = Math.hypot(this.targetResource.x - this.x, this.targetResource.y - this.y);
      if (dist < 40) {
        this.activity = this.targetResource.type === 'tree' ? 'chopping' :
                        this.targetResource.type === 'sheep' ? 'gathering' : 'mining';
        this.harvestTimer = 2.0; // 2 seconds per harvest action
      }
    } else if (this.activity === 'chopping' || this.activity === 'mining' || this.activity === 'gathering') {
      this.harvestTimer -= dt;
      if (this.harvestTimer <= 0) {
        // Cargo loaded
        if (this.activity === 'chopping') this.cargo = 'wood';
        else if (this.activity === 'mining') this.cargo = 'gold';
        else if (this.activity === 'gathering') this.cargo = 'meat';

        // Return to castle
        if (this.castleRef) {
          this.activity = 'returning';
          this.targetX = this.castleRef.x;
          this.targetY = this.castleRef.y;
        }
      }
    } else if (this.activity === 'returning' && this.castleRef) {
      const dist = Math.hypot(this.castleRef.x - this.x, this.castleRef.y - this.y);
      if (dist < 80) {
        // Deposit cargo!
        const delivered = this.cargo;
        this.cargo = 'none';

        // If resource node still exists, go back!
        if (this.targetResource && !this.targetResource.dead) {
          this.activity = 'moving';
          this.targetX = this.targetResource.x;
          this.targetY = this.targetResource.y;
        } else {
          this.activity = 'idle';
          this.currentTool = 'none';
        }
        return;
      }
    }

    // Set sprite based on current tool & cargo
    if (this.cargo === 'wood') {
      this.animKey = 'pawn_wood';
    } else if (this.cargo === 'gold') {
      this.animKey = 'pawn_gold';
    } else if (this.cargo === 'meat') {
      this.animKey = 'pawn_meat';
    } else if (this.activity === 'chopping') {
      this.animKey = 'pawn_axe';
    } else if (this.activity === 'mining') {
      this.animKey = 'pawn_pickaxe';
    } else if (this.activity === 'building') {
      this.animKey = 'pawn_hammer';
    } else if (this.activity === 'gathering') {
      this.animKey = 'pawn_knife';
    } else if (this.state === 'run') {
      this.animKey = 'pawn_run';
    } else {
      this.animKey = 'pawn_idle';
    }
  }
}

// WARRIOR UNIT - Sturdy Melee Frontline
export class WarriorUnit extends Unit {
  constructor(x: number, y: number, faction: UnitFaction = 'player') {
    super(x, y, faction, faction === 'player' ? 'warrior' : 'enemy_warrior', 150, 115, 24, 40);
    this.animKey = faction === 'player' ? 'hero_idle' : 'enemy_warrior_idle';
    this.scale = 0.55;
  }

  public update(dt: number): void {
    super.update(dt);
    const prefix = this.faction === 'player' ? 'hero_' : 'enemy_warrior_';
    if (this.state === 'attack') this.animKey = prefix + 'attack1';
    else if (this.state === 'run') this.animKey = prefix + 'run';
    else this.animKey = prefix + 'idle';
  }
}

// ARCHER UNIT - Long Range Volley
export class ArcherUnit extends Unit {
  constructor(x: number, y: number, faction: UnitFaction = 'player') {
    super(x, y, faction, faction === 'player' ? 'archer' : 'enemy_archer', 90, 110, 18, 180);
    this.animKey = faction === 'player' ? 'archer_idle' : 'enemy_archer_idle';
    this.scale = 0.55;
    this.attackCooldown = 1.6;
  }

  public update(dt: number): void {
    super.update(dt);
    const prefix = this.faction === 'player' ? 'archer_' : 'enemy_archer_';
    if (this.state === 'attack') this.animKey = prefix + 'shoot';
    else if (this.state === 'run') this.animKey = prefix + 'run';
    else this.animKey = prefix + 'idle';
  }
}

// MONK UNIT - Holy Healer
export class MonkUnit extends Unit {
  public healCooldown: number = 2.5;
  public healTimer: number = 0;

  constructor(x: number, y: number) {
    super(x, y, 'player', 'monk', 110, 95, 0, 140);
    this.animKey = 'monk_idle';
    this.scale = 0.55;
  }

  public update(dt: number): void {
    if (this.healTimer > 0) this.healTimer -= dt;
    super.update(dt);
    if (this.state === 'heal') this.animKey = 'monk_heal';
    else if (this.state === 'run') this.animKey = 'monk_run';
    else this.animKey = 'monk_idle';
  }
}

// LANCER UNIT - Anti-Cavalry & Reach Attacks
export class LancerUnit extends Unit {
  constructor(x: number, y: number, faction: UnitFaction = 'player') {
    super(x, y, faction, faction === 'player' ? 'lancer' : 'enemy_lancer', 160, 120, 32, 65);
    this.animKey = faction === 'player' ? 'lancer_idle' : 'enemy_lancer_idle';
    this.scale = 0.45; // Lancer frames are 320x320
  }

  public update(dt: number): void {
    super.update(dt);
    const prefix = this.faction === 'player' ? 'lancer_' : 'enemy_lancer_';
    if (this.state === 'attack') this.animKey = prefix + 'attack';
    else if (this.state === 'run') this.animKey = prefix + 'run';
    else this.animKey = prefix + 'idle';
  }
}

// ENEMY BOSS - Overlord of Darkness
export class BossUnit extends Unit {
  public specialTimer: number = 5.0;

  constructor(x: number, y: number) {
    super(x, y, 'enemy', 'enemy_boss', 1200, 75, 45, 60);
    this.animKey = 'enemy_warrior_idle';
    this.scale = 1.0; // Huge boss!
    this.radius = 35;
  }

  public update(dt: number): void {
    if (this.specialTimer > 0) this.specialTimer -= dt;
    super.update(dt);
    if (this.state === 'attack') this.animKey = 'enemy_warrior_attack';
    else if (this.state === 'run') this.animKey = 'enemy_warrior_run';
    else this.animKey = 'enemy_warrior_idle';
  }
}

// BUILDINGS - Castle, Tower, Barracks, Archery, Monastery, House
export class Building extends BaseEntity {
  public type: BuildingType;
  public hp: number;
  public maxHp: number;
  public width: number;
  public height: number;
  public isUnderConstruction: boolean;
  public constructProgress: number = 0;
  public shootTimer: number = 0;
  public shootCooldown: number = 1.4;
  public hitFlashTimer: number = 0;

  constructor(x: number, y: number, type: BuildingType, underConstruction: boolean = false) {
    let hp = 1000;
    let w = 120;
    let h = 100;
    let radius = 50;

    if (type === 'castle') {
      hp = 2000;
      w = 200;
      h = 160;
      radius = 80;
    } else if (type === 'tower') {
      hp = 600;
      w = 80;
      h = 140;
      radius = 40;
    } else if (type === 'barracks' || type === 'archery' || type === 'monastery') {
      hp = 900;
      w = 120;
      h = 120;
      radius = 55;
    } else if (type === 'house') {
      hp = 400;
      w = 80;
      h = 80;
      radius = 35;
    }

    super(x, y, radius);
    this.type = type;
    this.maxHp = hp;
    this.hp = underConstruction ? 1 : hp;
    this.width = w;
    this.height = h;
    this.isUnderConstruction = underConstruction;
    this.constructProgress = underConstruction ? 0 : 1;
  }

  public takeDamage(amount: number): number {
    if (this.dead) return 0;
    this.hp -= amount;
    this.hitFlashTimer = 0.15;
    if (this.hp <= 0) {
      this.hp = 0;
      this.dead = true;
    }
    return amount;
  }

  public repair(amount: number) {
    if (this.dead) return;
    this.hp = Math.min(this.maxHp, this.hp + amount);
    if (this.isUnderConstruction) {
      this.constructProgress = Math.min(1, this.hp / this.maxHp);
      if (this.constructProgress >= 1) {
        this.isUnderConstruction = false;
      }
    }
  }

  public update(dt: number): void {
    if (this.shootTimer > 0) this.shootTimer -= dt;
    if (this.hitFlashTimer > 0) this.hitFlashTimer -= dt;
  }

  public draw(ctx: CanvasRenderingContext2D, assets: AssetManager): void {
    let spriteKey = 'building_' + this.type;
    const drawn = assets.drawBuilding(ctx, spriteKey, this.x, this.y, 0.7);

    // Fallback if sprite not loaded
    if (!drawn) {
      ctx.save();
      ctx.fillStyle = '#475569';
      ctx.fillRect(this.x - this.width / 2, this.y - this.height, this.width, this.height);
      ctx.strokeStyle = '#ffd700';
      ctx.lineWidth = 3;
      ctx.strokeRect(this.x - this.width / 2, this.y - this.height, this.width, this.height);
      ctx.restore();
    }

    // Health / Construction Bar
    if (this.hp < this.maxHp || this.isUnderConstruction) {
      const bw = this.width * 0.75;
      const bh = 6;
      const bx = this.x - bw / 2;
      const by = this.y - this.height - 12;

      ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
      ctx.fillRect(bx, by, bw, bh);

      const ratio = this.hp / this.maxHp;
      ctx.fillStyle = this.isUnderConstruction ? '#f59e0b' : '#10b981';
      ctx.fillRect(bx, by, bw * ratio, bh);
    }
  }
}

// RESOURCE NODES - Trees, Gold Mines, Sheep
export class ResourceNode extends BaseEntity {
  public type: 'tree' | 'gold_mine' | 'gold_stone' | 'sheep';
  public amountLeft: number;
  public maxAmount: number;
  public frameIndex: number = 0;
  public frameSpeed: number = 4;
  public isChopped: boolean = false;
  public shakeTimer: number = 0;

  constructor(x: number, y: number, type: 'tree' | 'gold_mine' | 'gold_stone' | 'sheep') {
    super(x, y, type === 'gold_mine' ? 35 : 22);
    this.type = type;
    this.maxAmount = type === 'tree' ? 120 : type === 'gold_mine' ? 300 : 80;
    this.amountLeft = this.maxAmount;
  }

  public harvest(amount: number): number {
    const yieldAmount = Math.min(this.amountLeft, amount);
    this.amountLeft -= yieldAmount;
    this.shakeTimer = 0.2;
    if (this.amountLeft <= 0) {
      this.isChopped = true;
      if (this.type !== 'tree') {
        this.dead = true;
      }
    }
    return yieldAmount;
  }

  public update(dt: number): void {
    if (this.shakeTimer > 0) this.shakeTimer -= dt;
    this.frameIndex += this.frameSpeed * dt;
  }

  public draw(ctx: CanvasRenderingContext2D, assets: AssetManager): void {
    ctx.save();
    let ox = this.x;
    let oy = this.y;

    if (this.shakeTimer > 0) {
      ox += (Math.random() - 0.5) * 6;
    }

    if (this.type === 'tree') {
      const spriteKey = this.isChopped ? 'stump' : 'tree';
      assets.drawSprite(ctx, spriteKey, ox, oy, this.frameIndex, 0.65);
    } else if (this.type === 'gold_mine' || this.type === 'gold_stone') {
      assets.drawBuilding(ctx, 'gold_mine', ox, oy, 0.7);
    } else if (this.type === 'sheep') {
      assets.drawSprite(ctx, 'sheep_grass', ox, oy, this.frameIndex, 0.6);
    }
    ctx.restore();
  }
}
