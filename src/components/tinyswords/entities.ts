// entities.ts - Comprehensive game entities for Tiny Swords with Working Construction, Peasant AI & Balanced Combat

import type { UnitFaction, UnitRole, PawnActivity, PawnTool, PawnCargo, BuildingType } from './types';
import type { AssetManager } from './assets';

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
  public frameSpeed: number = 8;
  public flipX: boolean = false;
  public scale: number = 0.55;

  // Selection & AI
  public isSelected: boolean = false;
  public targetX: number | null = null;
  public targetY: number | null = null;
  public targetEntity: BaseEntity | null = null;
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
    range: number = 38
  ) {
    super(x, y, 18);
    this.faction = faction;
    this.role = role;
    this.maxHp = maxHp;
    this.hp = maxHp;
    this.speed = speed;
    this.attackDamage = damage;
    this.attackRange = range;
    this.attackCooldown = 0.85;
  }

  public takeDamage(amount: number, canBlock: boolean = false): number {
    if (this.dead) return 0;
    let finalDmg = amount;
    if (canBlock && this.isGuarding) {
      finalDmg = Math.round(amount * 0.15); // 85% block
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

    this.frameIndex += this.frameSpeed * dt;

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
      const stopDist = this.targetEntity ? this.attackRange * 0.8 : 6;

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

  public draw(ctx: CanvasRenderingContext2D, assets: AssetManager): void {
    // 1. Selection indicator
    if (this.isSelected && this.faction === 'player') {
      ctx.save();
      ctx.beginPath();
      ctx.ellipse(this.x, this.y, 22, 11, 0, 0, Math.PI * 2);
      ctx.strokeStyle = '#00ffcc';
      ctx.lineWidth = 2.5;
      ctx.shadowColor = '#00ffcc';
      ctx.shadowBlur = 10;
      ctx.stroke();
      ctx.restore();
    }

    // 2. Unit ground shadow
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(this.x, this.y, 15, 8, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
    ctx.fill();
    ctx.restore();

    // 3. Sprite drawing with intelligent fallbacks
    const alpha = this.hitFlashTimer > 0 ? 0.65 : 1;
    assets.drawSprite(
      ctx,
      this.animKey,
      this.x,
      this.y,
      this.frameIndex,
      this.scale,
      this.flipX,
      alpha
    );

    // 4. Health bar
    if (!this.dead && this.hp < this.maxHp) {
      const barW = 30;
      const barH = 5;
      const bx = this.x - barW / 2;
      const by = this.y - 40;

      ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
      ctx.fillRect(bx, by, barW, barH);

      const fillRatio = Math.max(0, this.hp / this.maxHp);
      ctx.fillStyle = this.faction === 'player' ? '#22c55e' : '#ef4444';
      ctx.fillRect(bx, by, barW * fillRatio, barH);
    }
  }
}

// HERO UNIT - Arch-Knight of the Ascetics
export class HeroUnit extends Unit {
  public level: number = 1;
  public xp: number = 0;
  public xpNeeded: number = 100;
  public comboStep: number = 0;
  public dashCooldown: number = 2.4;
  public dashTimer: number = 0;
  public whirlCooldown: number = 4.0;
  public whirlTimer: number = 0;
  public rallyCooldown: number = 8.0;
  public rallyTimer: number = 0;
  public isDashing: boolean = false;
  public dashDuration: number = 0.25;

  constructor(x: number, y: number) {
    super(x, y, 'player', 'hero', 280, 155, 45, 52);
    this.animKey = 'hero_idle';
    this.scale = 0.65;
  }

  public addXp(amount: number): boolean {
    this.xp += amount;
    if (this.xp >= this.xpNeeded) {
      this.xp -= this.xpNeeded;
      this.level++;
      this.xpNeeded = Math.round(this.xpNeeded * 1.35);
      this.maxHp += 40;
      this.hp = this.maxHp;
      this.attackDamage += 8;
      return true;
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
        this.speed = 155;
      }
    }

    super.update(dt);

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

// PAWN (PEASANT) - Complete Gathering & Construction AI
export class PawnUnit extends Unit {
  public activity: PawnActivity = 'idle';
  public currentTool: PawnTool = 'none';
  public cargo: PawnCargo = 'none';
  public targetResource: ResourceNode | null = null;
  public targetBuilding: Building | null = null;
  public harvestTimer: number = 0;
  public buildTimer: number = 0;
  public castleRef: Building | null = null;

  constructor(x: number, y: number) {
    super(x, y, 'player', 'pawn', 100, 130, 12, 32);
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

    if (res.resType === 'tree') this.currentTool = 'axe';
    else if (res.resType === 'gold_mine' || res.resType === 'gold_stone') this.currentTool = 'pickaxe';
    else if (res.resType === 'sheep') this.currentTool = 'knife';
  }

  public assignBuild(building: Building) {
    this.targetBuilding = building;
    this.targetResource = null;
    this.activity = 'building';
    this.targetX = building.x;
    this.targetY = building.y;
    this.currentTool = 'hammer';
    this.buildTimer = 0.4;
  }

  public update(dt: number): void {
    super.update(dt);

    // 1. Moving to Resource
    if (this.activity === 'moving' && this.targetResource) {
      const dist = Math.hypot(this.targetResource.x - this.x, this.targetResource.y - this.y);
      if (dist < 45) {
        this.activity = this.targetResource.resType === 'tree' ? 'chopping' :
                        this.targetResource.resType === 'sheep' ? 'gathering' : 'mining';
        this.harvestTimer = 1.3;
      }
    } 
    // 2. Harvesting Actions
    else if (this.activity === 'chopping' || this.activity === 'mining' || this.activity === 'gathering') {
      this.harvestTimer -= dt;
      if (this.harvestTimer <= 0) {
        if (this.activity === 'chopping') this.cargo = 'wood';
        else if (this.activity === 'mining') this.cargo = 'gold';
        else if (this.activity === 'gathering') this.cargo = 'meat';

        if (this.castleRef) {
          this.activity = 'returning';
          this.targetX = this.castleRef.x;
          this.targetY = this.castleRef.y;
        }
      }
    } 
    // 3. Returning Goods to Castle
    else if (this.activity === 'returning' && this.castleRef) {
      const dist = Math.hypot(this.castleRef.x - this.x, this.castleRef.y - this.y);
      if (dist < 80) {
        this.cargo = 'none';
        if (this.targetResource && !this.targetResource.dead) {
          this.activity = 'moving';
          this.targetX = this.targetResource.x;
          this.targetY = this.targetResource.y;
        } else {
          this.activity = 'idle';
          this.currentTool = 'none';
        }
      }
    }
    // 4. CONSTRUCTION & REPAIRING SYSTEM
    else if (this.activity === 'building' && this.targetBuilding) {
      if (this.targetBuilding.dead) {
        this.activity = 'idle';
        this.targetBuilding = null;
        this.currentTool = 'none';
        return;
      }

      const dist = Math.hypot(this.targetBuilding.x - this.x, this.targetBuilding.y - this.y);
      if (dist > 55) {
        this.targetX = this.targetBuilding.x;
        this.targetY = this.targetBuilding.y;
        this.state = 'run';
      } else {
        this.state = 'idle';
        this.targetX = null;
        this.targetY = null;
        this.buildTimer -= dt;

        if (this.buildTimer <= 0) {
          this.buildTimer = 0.45; // Hammer strike every 0.45s
          this.targetBuilding.repair(140);

          if (!this.targetBuilding.isUnderConstruction && this.targetBuilding.hp >= this.targetBuilding.maxHp) {
            // Finished construction!
            this.activity = 'idle';
            this.targetBuilding = null;
            this.currentTool = 'none';
          }
        }
      }
    }

    // Determine current animation key
    if (this.cargo === 'wood') this.animKey = 'pawn_wood';
    else if (this.cargo === 'gold') this.animKey = 'pawn_gold';
    else if (this.cargo === 'meat') this.animKey = 'pawn_meat';
    else if (this.activity === 'building') this.animKey = 'pawn_hammer';
    else if (this.activity === 'chopping') this.animKey = 'pawn_axe';
    else if (this.activity === 'mining') this.animKey = 'pawn_pickaxe';
    else if (this.activity === 'gathering') this.animKey = 'pawn_knife';
    else if (this.state === 'run') this.animKey = 'pawn_run';
    else this.animKey = 'pawn_idle';
  }
}

// WARRIOR UNIT - Frontline Tank
export class WarriorUnit extends Unit {
  public subFaction: 'blue' | 'red' | 'yellow' | 'black';

  constructor(x: number, y: number, subFaction: 'blue' | 'red' | 'yellow' | 'black' = 'blue') {
    const isPlayer = subFaction === 'blue' || subFaction === 'yellow';
    super(x, y, isPlayer ? 'player' : 'enemy', isPlayer ? 'warrior' : 'enemy_warrior', 190, 125, 32, 45);
    this.subFaction = subFaction;
    this.scale = 0.55;
    this.updateAnim();
  }

  private updateAnim() {
    let prefix = 'hero_';
    if (this.subFaction === 'black') prefix = 'black_warrior_';
    else if (this.subFaction === 'red') prefix = 'red_warrior_';
    else if (this.subFaction === 'yellow') prefix = 'yellow_warrior_';

    if (this.state === 'attack') this.animKey = prefix + 'attack';
    else if (this.state === 'run') this.animKey = prefix + 'run';
    else this.animKey = prefix + 'idle';
  }

  public update(dt: number): void {
    super.update(dt);
    this.updateAnim();
  }
}

// ARCHER UNIT - Long Range Marksman
export class ArcherUnit extends Unit {
  public subFaction: 'blue' | 'red' | 'black';

  constructor(x: number, y: number, subFaction: 'blue' | 'red' | 'black' = 'blue') {
    const isPlayer = subFaction === 'blue';
    super(x, y, isPlayer ? 'player' : 'enemy', isPlayer ? 'archer' : 'enemy_archer', 110, 120, 26, 240);
    this.subFaction = subFaction;
    this.attackCooldown = 1.3;
    this.scale = 0.55;
    this.updateAnim();
  }

  private updateAnim() {
    let prefix = 'archer_';
    if (this.subFaction === 'black') prefix = 'black_archer_';
    else if (this.subFaction === 'red') prefix = 'red_archer_';

    if (this.state === 'attack') this.animKey = prefix + 'shoot';
    else if (this.state === 'run') this.animKey = prefix + 'run';
    else this.animKey = prefix + 'idle';
  }

  public update(dt: number): void {
    super.update(dt);
    this.updateAnim();
  }
}

// MONK UNIT - Area Healer
export class MonkUnit extends Unit {
  public subFaction: 'blue' | 'yellow' | 'purple';
  public healCooldown: number = 2.0;
  public healTimer: number = 0;

  constructor(x: number, y: number, subFaction: 'blue' | 'yellow' | 'purple' = 'blue') {
    const isPlayer = subFaction === 'blue' || subFaction === 'yellow';
    super(x, y, isPlayer ? 'player' : 'enemy', 'monk', 140, 105, 0, 160);
    this.subFaction = subFaction;
    this.scale = 0.55;
    this.animKey = subFaction === 'yellow' ? 'yellow_monk_idle' : 'monk_idle';
  }

  public update(dt: number): void {
    if (this.healTimer > 0) this.healTimer -= dt;
    super.update(dt);

    if (this.subFaction === 'yellow') {
      if (this.state === 'heal') this.animKey = 'yellow_monk_heal';
      else this.animKey = 'yellow_monk_idle';
    } else {
      if (this.state === 'heal') this.animKey = 'monk_heal';
      else if (this.state === 'run') this.animKey = 'monk_run';
      else this.animKey = 'monk_idle';
    }
  }
}

// LANCER UNIT - Spear Vanguard
export class LancerUnit extends Unit {
  public subFaction: 'blue' | 'black' | 'yellow';

  constructor(x: number, y: number, subFaction: 'blue' | 'black' | 'yellow' = 'blue') {
    const isPlayer = subFaction === 'blue' || subFaction === 'yellow';
    super(x, y, isPlayer ? 'player' : 'enemy', isPlayer ? 'lancer' : 'enemy_lancer', 200, 130, 42, 75);
    this.subFaction = subFaction;
    this.scale = 0.45;
  }

  public update(dt: number): void {
    super.update(dt);
    let prefix = 'lancer_';
    if (this.subFaction === 'black') prefix = 'black_lancer_';
    else if (this.subFaction === 'yellow') prefix = 'yellow_lancer_';

    if (this.state === 'attack') this.animKey = prefix + 'attack';
    else if (this.state === 'run') this.animKey = prefix + 'run';
    else this.animKey = prefix + 'idle';
  }
}

// BOSS UNIT - Dread Overlord of the Black Empire
export class BossUnit extends Unit {
  public specialTimer: number = 4.0;

  constructor(x: number, y: number) {
    super(x, y, 'enemy', 'enemy_boss', 1500, 85, 55, 70);
    this.animKey = 'black_warrior_idle';
    this.scale = 1.05;
    this.radius = 40;
  }

  public update(dt: number): void {
    if (this.specialTimer > 0) this.specialTimer -= dt;
    super.update(dt);
    if (this.state === 'attack') this.animKey = 'black_warrior_attack';
    else if (this.state === 'run') this.animKey = 'black_warrior_run';
    else this.animKey = 'black_warrior_idle';
  }
}

// BUILDINGS - Castle, Tower, Barracks, Archery, Monastery, House
export class Building extends BaseEntity {
  public type: BuildingType;
  public faction: UnitFaction;
  public level: number = 1;
  public hp: number;
  public maxHp: number;
  public width: number;
  public height: number;
  public isUnderConstruction: boolean;
  public constructProgress: number = 0;
  public shootTimer: number = 0;
  public shootCooldown: number = 1.2;
  public hitFlashTimer: number = 0;

  constructor(
    x: number, 
    y: number, 
    type: BuildingType, 
    faction: UnitFaction = 'player', 
    underConstruction: boolean = false
  ) {
    let hp = 1100;
    let w = 120;
    let h = 100;
    let radius = 50;

    if (type === 'castle') {
      hp = 3000;
      w = 200;
      h = 160;
      radius = 85;
    } else if (type === 'tower') {
      hp = 850;
      w = 80;
      h = 140;
      radius = 42;
    } else if (type === 'barracks' || type === 'archery' || type === 'monastery') {
      hp = 1100;
      w = 120;
      h = 120;
      radius = 55;
    } else if (type === 'house') {
      hp = 500;
      w = 80;
      h = 80;
      radius = 35;
    }

    super(x, y, radius);
    this.type = type;
    this.faction = faction;
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
        this.hp = this.maxHp;
      }
    }
  }

  public update(dt: number): void {
    if (this.shootTimer > 0) this.shootTimer -= dt;
    if (this.hitFlashTimer > 0) this.hitFlashTimer -= dt;
  }

  public draw(ctx: CanvasRenderingContext2D, assets: AssetManager): void {
    let spriteKey = this.faction === 'enemy' ? 'black_' + this.type : 'building_' + this.type;
    assets.drawBuilding(ctx, spriteKey, this.x, this.y, 0.7);

    // Health or Construction progress bar
    if (this.hp < this.maxHp || this.isUnderConstruction) {
      const bw = this.width * 0.75;
      const bh = 6;
      const bx = this.x - bw / 2;
      const by = this.y - this.height - 12;

      ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
      ctx.fillRect(bx, by, bw, bh);

      const ratio = this.hp / this.maxHp;
      ctx.fillStyle = this.isUnderConstruction ? '#f59e0b' : this.faction === 'player' ? '#10b981' : '#ef4444';
      ctx.fillRect(bx, by, bw * ratio, bh);

      // Label
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 10px monospace';
      ctx.textAlign = 'center';
      if (this.isUnderConstruction) {
        ctx.fillText(`СТРОЙКА ${Math.round(ratio * 100)}%`, this.x, by - 4);
      }
    }
  }
}

// RESOURCE NODES - Trees (1..4), Gold Mines, Sheep
export class ResourceNode extends BaseEntity {
  public resType: 'tree' | 'gold_mine' | 'gold_stone' | 'sheep';
  public variant: number;
  public amountLeft: number;
  public maxAmount: number;
  public frameIndex: number = 0;
  public frameSpeed: number = 4;
  public isChopped: boolean = false;
  public shakeTimer: number = 0;

  constructor(x: number, y: number, resType: 'tree' | 'gold_mine' | 'gold_stone' | 'sheep', variant: number = 1) {
    super(x, y, resType === 'gold_mine' ? 35 : 22);
    this.resType = resType;
    this.variant = variant;
    this.maxAmount = resType === 'tree' ? 140 : resType === 'gold_mine' ? 400 : 90;
    this.amountLeft = this.maxAmount;
  }

  public harvest(amount: number): number {
    const yieldAmount = Math.min(this.amountLeft, amount);
    this.amountLeft -= yieldAmount;
    this.shakeTimer = 0.2;
    if (this.amountLeft <= 0) {
      this.isChopped = true;
      if (this.resType !== 'tree') {
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

    if (this.resType === 'tree') {
      const spriteKey = this.isChopped ? (this.variant === 2 ? 'stump2' : 'stump1') : `tree${this.variant}`;
      assets.drawSprite(ctx, spriteKey, ox, oy, this.frameIndex, 0.65);
    } else if (this.resType === 'gold_mine') {
      assets.drawBuilding(ctx, 'gold_mine', ox, oy, 0.7);
    } else if (this.resType === 'gold_stone') {
      assets.drawSprite(ctx, 'gold_stone1', ox, oy, this.frameIndex, 0.65);
    } else if (this.resType === 'sheep') {
      assets.drawSprite(ctx, 'sheep_grass', ox, oy, this.frameIndex, 0.6);
    }
    ctx.restore();
  }
}

// DECORATION ENTITY - Clouds, Bushes, Rocks, Duck
export class DecorationEntity extends BaseEntity {
  public decType: 'cloud' | 'bush' | 'rock' | 'duck' | 'water_rock';
  public variant: number;
  public vx: number = 0;
  public frameIndex: number = 0;

  constructor(x: number, y: number, decType: 'cloud' | 'bush' | 'rock' | 'duck' | 'water_rock', variant: number = 1) {
    super(x, y, 16);
    this.decType = decType;
    this.variant = variant;
    if (decType === 'cloud') {
      this.vx = 8 + Math.random() * 8;
    }
  }

  public update(dt: number): void {
    if (this.decType === 'cloud') {
      this.x += this.vx * dt;
      if (this.x > 2600) this.x = -600;
    }
    this.frameIndex += 3 * dt;
  }

  public draw(ctx: CanvasRenderingContext2D, assets: AssetManager): void {
    ctx.save();
    if (this.decType === 'cloud') {
      ctx.globalAlpha = 0.25;
      assets.drawSprite(ctx, `cloud${this.variant}`, this.x + 40, this.y + 120, 0, 0.8);
      ctx.globalAlpha = 0.65;
      assets.drawSprite(ctx, `cloud${this.variant}`, this.x, this.y, 0, 0.8);
    } else if (this.decType === 'duck') {
      assets.drawSprite(ctx, 'duck', this.x, this.y, 0, 0.6);
    } else if (this.decType === 'bush') {
      assets.drawSprite(ctx, `bush${this.variant}`, this.x, this.y, this.frameIndex, 0.6);
    } else if (this.decType === 'rock') {
      assets.drawSprite(ctx, `rock${this.variant}`, this.x, this.y, 0, 0.6);
    } else if (this.decType === 'water_rock') {
      assets.drawSprite(ctx, `water_rock${this.variant}`, this.x, this.y, 0, 0.6);
    }
    ctx.restore();
  }
}
