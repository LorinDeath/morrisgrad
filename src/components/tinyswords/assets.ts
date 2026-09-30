// assets.ts - Tiny Swords Asset Loader & Sprite Rendering Engine

export interface SpriteInfo {
  img: HTMLImageElement;
  loaded: boolean;
  frameW: number;
  frameH: number;
  frameCount: number;
}

export class AssetManager {
  private sprites: Map<string, SpriteInfo> = new Map();
  private loadedCount: number = 0;
  private totalCount: number = 0;

  constructor() {
    this.registerAllAssets();
  }

  private register(key: string, url: string, frameW: number, frameH: number, frameCount: number = 1) {
    this.totalCount++;
    const img = new Image();
    const info: SpriteInfo = { img, loaded: false, frameW, frameH, frameCount };
    this.sprites.set(key, info);

    img.onload = () => {
      info.loaded = true;
      this.loadedCount++;
    };
    img.onerror = () => {
      // Keep loaded=false so fallback drawing triggers cleanly
      console.warn(`[AssetManager] Asset failed to load: ${url}`);
    };
    img.src = url;
  }

  private registerAllAssets() {
    // BLUE UNITS (Player)
    this.register('hero_idle', '/Tiny Swords/Units/Blue Units/Warrior/Warrior_Idle.png', 192, 192, 8);
    this.register('hero_run', '/Tiny Swords/Units/Blue Units/Warrior/Warrior_Run.png', 192, 192, 6);
    this.register('hero_attack1', '/Tiny Swords/Units/Blue Units/Warrior/Warrior_Attack1.png', 192, 192, 4);
    this.register('hero_attack2', '/Tiny Swords/Units/Blue Units/Warrior/Warrior_Attack2.png', 192, 192, 4);
    this.register('hero_guard', '/Tiny Swords/Units/Blue Units/Warrior/Warrior_Guard.png', 192, 192, 6);

    this.register('pawn_idle', '/Tiny Swords/Units/Blue Units/Pawn/Pawn_Idle.png', 192, 192, 8);
    this.register('pawn_run', '/Tiny Swords/Units/Blue Units/Pawn/Pawn_Run.png', 192, 192, 6);
    this.register('pawn_axe', '/Tiny Swords/Units/Blue Units/Pawn/Pawn_Interact Axe.png', 192, 192, 6);
    this.register('pawn_pickaxe', '/Tiny Swords/Units/Blue Units/Pawn/Pawn_Interact Pickaxe.png', 192, 192, 6);
    this.register('pawn_hammer', '/Tiny Swords/Units/Blue Units/Pawn/Pawn_Interact Hammer.png', 192, 192, 3);
    this.register('pawn_knife', '/Tiny Swords/Units/Blue Units/Pawn/Pawn_Interact Knife.png', 192, 192, 4);
    this.register('pawn_wood', '/Tiny Swords/Units/Blue Units/Pawn/Pawn_Run Wood.png', 192, 192, 6);
    this.register('pawn_gold', '/Tiny Swords/Units/Blue Units/Pawn/Pawn_Run Gold.png', 192, 192, 6);
    this.register('pawn_meat', '/Tiny Swords/Units/Blue Units/Pawn/Pawn_Run Meat.png', 192, 192, 6);

    this.register('archer_idle', '/Tiny Swords/Units/Blue Units/Archer/Archer_Idle.png', 192, 192, 6);
    this.register('archer_run', '/Tiny Swords/Units/Blue Units/Archer/Archer_Run.png', 192, 192, 4);
    this.register('archer_shoot', '/Tiny Swords/Units/Blue Units/Archer/Archer_Shoot.png', 192, 192, 8);
    this.register('arrow', '/Tiny Swords/Units/Blue Units/Archer/Arrow.png', 64, 64, 1);

    this.register('monk_idle', '/Tiny Swords/Units/Blue Units/Monk/Idle.png', 192, 192, 6);
    this.register('monk_run', '/Tiny Swords/Units/Blue Units/Monk/Run.png', 192, 192, 4);
    this.register('monk_heal', '/Tiny Swords/Units/Blue Units/Monk/Heal.png', 192, 192, 11);
    this.register('monk_heal_fx', '/Tiny Swords/Units/Blue Units/Monk/Heal_Effect.png', 192, 192, 11);

    this.register('lancer_idle', '/Tiny Swords/Units/Blue Units/Lancer/Lancer_Idle.png', 320, 320, 12);
    this.register('lancer_run', '/Tiny Swords/Units/Blue Units/Lancer/Lancer_Run.png', 320, 320, 6);
    this.register('lancer_attack', '/Tiny Swords/Units/Blue Units/Lancer/Lancer_Right_Attack.png', 320, 320, 3);

    // ENEMY UNITS (Black & Red)
    this.register('enemy_warrior_idle', '/Tiny Swords/Units/Black Units/Warrior/Warrior_Idle.png', 192, 192, 8);
    this.register('enemy_warrior_run', '/Tiny Swords/Units/Black Units/Warrior/Warrior_Run.png', 192, 192, 6);
    this.register('enemy_warrior_attack', '/Tiny Swords/Units/Black Units/Warrior/Warrior_Attack1.png', 192, 192, 4);

    this.register('enemy_pawn_idle', '/Tiny Swords/Units/Black Units/Pawn/Pawn_Idle.png', 192, 192, 8);
    this.register('enemy_pawn_run', '/Tiny Swords/Units/Black Units/Pawn/Pawn_Run.png', 192, 192, 6);

    this.register('enemy_archer_idle', '/Tiny Swords/Units/Red Units/Archer/Archer_Idle.png', 192, 192, 6);
    this.register('enemy_archer_run', '/Tiny Swords/Units/Red Units/Archer/Archer_Run.png', 192, 192, 4);
    this.register('enemy_archer_shoot', '/Tiny Swords/Units/Red Units/Archer/Archer_Shoot.png', 192, 192, 8);

    this.register('enemy_lancer_idle', '/Tiny Swords/Units/Black Units/Lancer/Lancer_Idle.png', 320, 320, 12);
    this.register('enemy_lancer_run', '/Tiny Swords/Units/Black Units/Lancer/Lancer_Run.png', 320, 320, 6);
    this.register('enemy_lancer_attack', '/Tiny Swords/Units/Black Units/Lancer/Lancer_Right_Attack.png', 320, 320, 3);

    // BUILDINGS (Blue)
    this.register('building_castle', '/Tiny Swords/Buildings/Blue Buildings/Castle.png', 320, 256, 1);
    this.register('building_tower', '/Tiny Swords/Buildings/Blue Buildings/Tower.png', 128, 256, 1);
    this.register('building_barracks', '/Tiny Swords/Buildings/Blue Buildings/Barracks.png', 192, 256, 1);
    this.register('building_archery', '/Tiny Swords/Buildings/Blue Buildings/Archery.png', 192, 256, 1);
    this.register('building_monastery', '/Tiny Swords/Buildings/Blue Buildings/Monastery.png', 192, 320, 1);
    this.register('building_house', '/Tiny Swords/Buildings/Blue Buildings/House1.png', 128, 192, 1);

    // TERRAIN & RESOURCES
    this.register('tree', '/Tiny Swords/Terrain/Resources/Wood/Trees/Tree1.png', 192, 256, 8);
    this.register('stump', '/Tiny Swords/Terrain/Resources/Wood/Trees/Stump 1.png', 192, 256, 1);
    this.register('res_wood', '/Tiny Swords/Terrain/Resources/Wood/Wood Resource/Wood Resource.png', 64, 64, 1);

    this.register('gold_mine', '/Tiny Swords/Terrain/Resources/Gold/Gold Resource/Gold_Resource.png', 128, 128, 1);
    this.register('gold_stone', '/Tiny Swords/Terrain/Resources/Gold/Gold Stones/Gold Stone 1.png', 128, 128, 1);

    this.register('sheep_idle', '/Tiny Swords/Terrain/Resources/Meat/Sheep/Sheep_Idle.png', 128, 128, 6);
    this.register('sheep_move', '/Tiny Swords/Terrain/Resources/Meat/Sheep/Sheep_Move.png', 128, 128, 4);
    this.register('sheep_grass', '/Tiny Swords/Terrain/Resources/Meat/Sheep/Sheep_Grass.png', 128, 128, 12);
    this.register('res_meat', '/Tiny Swords/Terrain/Resources/Meat/Meat Resource/Meat Resource.png', 64, 64, 1);

    this.register('bush', '/Tiny Swords/Terrain/Decorations/Bushes/Bushe1.png', 128, 128, 8);

    // PARTICLES
    this.register('fx_explosion', '/Tiny Swords/Particle FX/Explosion_01.png', 192, 192, 8);
    this.register('fx_fire', '/Tiny Swords/Particle FX/Fire_01.png', 64, 64, 8);
    this.register('fx_dust', '/Tiny Swords/Particle FX/Dust_01.png', 64, 64, 8);
  }

  public getSprite(key: string): SpriteInfo | undefined {
    return this.sprites.get(key);
  }

  public getProgress(): number {
    return this.totalCount > 0 ? this.loadedCount / this.totalCount : 1;
  }

  /**
   * Draws a sprite frame centered around (x, y) with scaling and optional horizontal flip
   */
  public drawSprite(
    ctx: CanvasRenderingContext2D,
    key: string,
    x: number,
    y: number,
    frameIndex: number,
    scale: number = 1,
    flipX: boolean = false,
    alpha: number = 1
  ): boolean {
    const info = this.sprites.get(key);
    if (!info || !info.loaded) {
      return false; // Fallback will handle
    }

    const frame = Math.floor(frameIndex) % info.frameCount;
    const sx = frame * info.frameW;
    const sy = 0;
    const sw = info.frameW;
    const sh = info.frameH;

    const dw = sw * scale;
    const dh = sh * scale;

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(Math.round(x), Math.round(y));
    if (flipX) {
      ctx.scale(-1, 1);
    }

    // Draw centered on anchor (feet at bottom-center)
    ctx.drawImage(
      info.img,
      sx, sy, sw, sh,
      -dw / 2, -dh * 0.75, dw, dh
    );
    ctx.restore();
    return true;
  }

  /**
   * Draws a static building sprite with base centered at (x, y)
   */
  public drawBuilding(
    ctx: CanvasRenderingContext2D,
    key: string,
    x: number,
    y: number,
    scale: number = 1,
    alpha: number = 1
  ): boolean {
    const info = this.sprites.get(key);
    if (!info || !info.loaded) {
      return false;
    }

    const dw = info.frameW * scale;
    const dh = info.frameH * scale;

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(Math.round(x), Math.round(y));

    // Anchor at bottom-center of the building
    ctx.drawImage(
      info.img,
      0, 0, info.frameW, info.frameH,
      -dw / 2, -dh * 0.85, dw, dh
    );
    ctx.restore();
    return true;
  }
}
