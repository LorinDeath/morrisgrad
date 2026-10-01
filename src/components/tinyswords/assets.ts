// assets.ts - Bulletproof Tiny Swords Asset Loader & Sprite Rendering Engine with Intelligent Fallbacks

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
      console.warn(`[AssetManager] Asset failed to load: ${url}`);
    };
    img.src = url;
  }

  private registerAllAssets() {
    // === BLUE UNITS (Player Order) ===
    this.register('hero_idle', '/Tiny Swords/Units/Blue Units/Warrior/Warrior_Idle.png', 192, 192, 8);
    this.register('hero_run', '/Tiny Swords/Units/Blue Units/Warrior/Warrior_Run.png', 192, 192, 6);
    this.register('hero_attack', '/Tiny Swords/Units/Blue Units/Warrior/Warrior_Attack1.png', 192, 192, 4);
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
    this.register('archer_attack', '/Tiny Swords/Units/Blue Units/Archer/Archer_Shoot.png', 192, 192, 8);
    this.register('arrow', '/Tiny Swords/Units/Blue Units/Archer/Arrow.png', 64, 64, 1);

    this.register('monk_idle', '/Tiny Swords/Units/Blue Units/Monk/Idle.png', 192, 192, 6);
    this.register('monk_run', '/Tiny Swords/Units/Blue Units/Monk/Run.png', 192, 192, 4);
    this.register('monk_heal', '/Tiny Swords/Units/Blue Units/Monk/Heal.png', 192, 192, 11);
    this.register('monk_heal_fx', '/Tiny Swords/Units/Blue Units/Monk/Heal_Effect.png', 192, 192, 11);

    this.register('lancer_idle', '/Tiny Swords/Units/Blue Units/Lancer/Lancer_Idle.png', 320, 320, 12);
    this.register('lancer_run', '/Tiny Swords/Units/Blue Units/Lancer/Lancer_Run.png', 320, 320, 6);
    this.register('lancer_attack', '/Tiny Swords/Units/Blue Units/Lancer/Lancer_Right_Attack.png', 320, 320, 3);
    this.register('lancer_attack1', '/Tiny Swords/Units/Blue Units/Lancer/Lancer_Right_Attack.png', 320, 320, 3);

    // === BLACK UNITS (Dread Legion & Boss) ===
    this.register('black_warrior_idle', '/Tiny Swords/Units/Black Units/Warrior/Warrior_Idle.png', 192, 192, 8);
    this.register('black_warrior_run', '/Tiny Swords/Units/Black Units/Warrior/Warrior_Run.png', 192, 192, 6);
    this.register('black_warrior_attack', '/Tiny Swords/Units/Black Units/Warrior/Warrior_Attack1.png', 192, 192, 4);
    this.register('black_warrior_attack1', '/Tiny Swords/Units/Black Units/Warrior/Warrior_Attack1.png', 192, 192, 4);
    this.register('black_warrior_attack2', '/Tiny Swords/Units/Black Units/Warrior/Warrior_Attack2.png', 192, 192, 4);

    this.register('black_archer_idle', '/Tiny Swords/Units/Black Units/Archer/Archer_Idle.png', 192, 192, 6);
    this.register('black_archer_run', '/Tiny Swords/Units/Black Units/Archer/Archer_Run.png', 192, 192, 4);
    this.register('black_archer_shoot', '/Tiny Swords/Units/Black Units/Archer/Archer_Shoot.png', 192, 192, 8);
    this.register('black_archer_attack', '/Tiny Swords/Units/Black Units/Archer/Archer_Shoot.png', 192, 192, 8);

    this.register('black_lancer_idle', '/Tiny Swords/Units/Black Units/Lancer/Lancer_Idle.png', 320, 320, 12);
    this.register('black_lancer_run', '/Tiny Swords/Units/Black Units/Lancer/Lancer_Run.png', 320, 320, 6);
    this.register('black_lancer_attack', '/Tiny Swords/Units/Black Units/Lancer/Lancer_Right_Attack.png', 320, 320, 3);
    this.register('black_lancer_attack1', '/Tiny Swords/Units/Black Units/Lancer/Lancer_Right_Attack.png', 320, 320, 3);

    this.register('black_pawn_idle', '/Tiny Swords/Units/Black Units/Pawn/Pawn_Idle.png', 192, 192, 8);
    this.register('black_pawn_run', '/Tiny Swords/Units/Black Units/Pawn/Pawn_Run.png', 192, 192, 6);

    // === RED UNITS (Blood Marauders) ===
    this.register('red_warrior_idle', '/Tiny Swords/Units/Red Units/Warrior/Warrior_Idle.png', 192, 192, 8);
    this.register('red_warrior_run', '/Tiny Swords/Units/Red Units/Warrior/Warrior_Run.png', 192, 192, 6);
    this.register('red_warrior_attack', '/Tiny Swords/Units/Red Units/Warrior/Warrior_Attack1.png', 192, 192, 4);
    this.register('red_warrior_attack1', '/Tiny Swords/Units/Red Units/Warrior/Warrior_Attack1.png', 192, 192, 4);

    this.register('red_archer_idle', '/Tiny Swords/Units/Red Units/Archer/Archer_Idle.png', 192, 192, 6);
    this.register('red_archer_run', '/Tiny Swords/Units/Red Units/Archer/Archer_Run.png', 192, 192, 4);
    this.register('red_archer_shoot', '/Tiny Swords/Units/Red Units/Archer/Archer_Shoot.png', 192, 192, 8);
    this.register('red_archer_attack', '/Tiny Swords/Units/Red Units/Archer/Archer_Shoot.png', 192, 192, 8);

    this.register('red_lancer_idle', '/Tiny Swords/Units/Red Units/Lancer/Lancer_Idle.png', 320, 320, 12);
    this.register('red_lancer_attack', '/Tiny Swords/Units/Red Units/Lancer/Lancer_Right_Attack.png', 320, 320, 3);
    this.register('red_lancer_attack1', '/Tiny Swords/Units/Red Units/Lancer/Lancer_Right_Attack.png', 320, 320, 3);

    // === YELLOW UNITS (Golden Order Mercenaries) ===
    this.register('yellow_warrior_idle', '/Tiny Swords/Units/Yellow Units/Warrior/Warrior_Idle.png', 192, 192, 8);
    this.register('yellow_warrior_run', '/Tiny Swords/Units/Yellow Units/Warrior/Warrior_Run.png', 192, 192, 6);
    this.register('yellow_warrior_attack', '/Tiny Swords/Units/Yellow Units/Warrior/Warrior_Attack1.png', 192, 192, 4);
    this.register('yellow_warrior_attack1', '/Tiny Swords/Units/Yellow Units/Warrior/Warrior_Attack1.png', 192, 192, 4);

    this.register('yellow_monk_idle', '/Tiny Swords/Units/Yellow Units/Monk/Idle.png', 192, 192, 6);
    this.register('yellow_monk_heal', '/Tiny Swords/Units/Yellow Units/Monk/Heal.png', 192, 192, 11);
    this.register('yellow_lancer_idle', '/Tiny Swords/Units/Yellow Units/Lancer/Lancer_Idle.png', 320, 320, 12);
    this.register('yellow_lancer_run', '/Tiny Swords/Units/Yellow Units/Lancer/Lancer_Run.png', 320, 320, 6);
    this.register('yellow_lancer_attack', '/Tiny Swords/Units/Yellow Units/Lancer/Lancer_Right_Attack.png', 320, 320, 3);
    this.register('yellow_lancer_attack1', '/Tiny Swords/Units/Yellow Units/Lancer/Lancer_Right_Attack.png', 320, 320, 3);

    // === PURPLE UNITS (Void Cultists) ===
    this.register('purple_warrior_idle', '/Tiny Swords/Units/Purple Units/Warrior/Warrior_Idle.png', 192, 192, 8);
    this.register('purple_warrior_attack', '/Tiny Swords/Units/Purple Units/Warrior/Warrior_Attack1.png', 192, 192, 4);
    this.register('purple_monk_idle', '/Tiny Swords/Units/Purple Units/Monk/Idle.png', 192, 192, 6);
    this.register('purple_monk_heal', '/Tiny Swords/Units/Purple Units/Monk/Heal.png', 192, 192, 11);

    // === BUILDINGS: BLUE ===
    this.register('building_castle', '/Tiny Swords/Buildings/Blue Buildings/Castle.png', 320, 256, 1);
    this.register('building_tower', '/Tiny Swords/Buildings/Blue Buildings/Tower.png', 128, 256, 1);
    this.register('building_barracks', '/Tiny Swords/Buildings/Blue Buildings/Barracks.png', 192, 256, 1);
    this.register('building_archery', '/Tiny Swords/Buildings/Blue Buildings/Archery.png', 192, 256, 1);
    this.register('building_monastery', '/Tiny Swords/Buildings/Blue Buildings/Monastery.png', 192, 320, 1);
    this.register('building_house', '/Tiny Swords/Buildings/Blue Buildings/House1.png', 128, 192, 1);

    // === BUILDINGS: BLACK (Dread Outpost) ===
    this.register('black_castle', '/Tiny Swords/Buildings/Black Buildings/Castle.png', 320, 256, 1);
    this.register('black_tower', '/Tiny Swords/Buildings/Black Buildings/Tower.png', 128, 256, 1);
    this.register('black_barracks', '/Tiny Swords/Buildings/Black Buildings/Barracks.png', 192, 256, 1);

    // === BUILDINGS: YELLOW (Mercenary Fort) ===
    this.register('yellow_castle', '/Tiny Swords/Buildings/Yellow Buildings/Castle.png', 320, 256, 1);
    this.register('yellow_monastery', '/Tiny Swords/Buildings/Yellow Buildings/Monastery.png', 192, 320, 1);

    // === TERRAIN, TILES & BIOMES ===
    this.register('tilemap_color1', '/Tiny Swords/Terrain/Tileset/Tilemap_color1.png', 576, 384, 1);
    this.register('tilemap_color2', '/Tiny Swords/Terrain/Tileset/Tilemap_color2.png', 576, 384, 1);
    this.register('water_foam', '/Tiny Swords/Terrain/Tileset/Water Foam.png', 192, 192, 16);
    this.register('water_tile', '/Tiny Swords/Terrain/Tileset/Water Background color.png', 64, 64, 1);

    // === TREES & STUMPS ===
    this.register('tree1', '/Tiny Swords/Terrain/Resources/Wood/Trees/Tree1.png', 192, 256, 8);
    this.register('tree2', '/Tiny Swords/Terrain/Resources/Wood/Trees/Tree2.png', 192, 256, 8);
    this.register('tree3', '/Tiny Swords/Terrain/Resources/Wood/Trees/Tree3.png', 192, 192, 8);
    this.register('tree4', '/Tiny Swords/Terrain/Resources/Wood/Trees/Tree4.png', 192, 192, 8);
    this.register('stump1', '/Tiny Swords/Terrain/Resources/Wood/Trees/Stump 1.png', 192, 256, 1);
    this.register('stump2', '/Tiny Swords/Terrain/Resources/Wood/Trees/Stump 2.png', 192, 256, 1);
    this.register('wood_item', '/Tiny Swords/Terrain/Resources/Wood/Wood Resource/Wood Resource.png', 64, 64, 1);

    // === GOLD ===
    this.register('gold_mine', '/Tiny Swords/Terrain/Resources/Gold/Gold Resource/Gold_Resource.png', 128, 128, 1);
    this.register('gold_mine_hl', '/Tiny Swords/Terrain/Resources/Gold/Gold Resource/Gold_Resource_Highlight.png', 128, 128, 6);
    this.register('gold_stone1', '/Tiny Swords/Terrain/Resources/Gold/Gold Stones/Gold Stone 1.png', 128, 128, 1);
    this.register('gold_stone1_hl', '/Tiny Swords/Terrain/Resources/Gold/Gold Stones/Gold Stone 1_Highlight.png', 128, 128, 6);
    this.register('gold_stone2', '/Tiny Swords/Terrain/Resources/Gold/Gold Stones/Gold Stone 2.png', 128, 128, 1);

    // === MEAT & ANIMALS ===
    this.register('sheep_idle', '/Tiny Swords/Terrain/Resources/Meat/Sheep/Sheep_Idle.png', 128, 128, 6);
    this.register('sheep_move', '/Tiny Swords/Terrain/Resources/Meat/Sheep/Sheep_Move.png', 128, 128, 4);
    this.register('sheep_grass', '/Tiny Swords/Terrain/Resources/Meat/Sheep/Sheep_Grass.png', 128, 128, 12);
    this.register('meat_item', '/Tiny Swords/Terrain/Resources/Meat/Meat Resource/Meat Resource.png', 64, 64, 1);

    // === DECORATIONS & EASTER EGGS ===
    this.register('duck', '/Tiny Swords/Terrain/Decorations/Rubber Duck/Rubber duck.png', 64, 64, 1);
    this.register('bush1', '/Tiny Swords/Terrain/Decorations/Bushes/Bushe1.png', 128, 128, 8);
    this.register('bush2', '/Tiny Swords/Terrain/Decorations/Bushes/Bushe2.png', 128, 128, 8);
    this.register('rock1', '/Tiny Swords/Terrain/Decorations/Rocks/Rock1.png', 64, 64, 1);
    this.register('rock2', '/Tiny Swords/Terrain/Decorations/Rocks/Rock2.png', 64, 64, 1);
    this.register('water_rock1', '/Tiny Swords/Terrain/Decorations/Rocks in the Water/Water Rocks_01.png', 64, 64, 1);
    this.register('water_rock2', '/Tiny Swords/Terrain/Decorations/Rocks in the Water/Water Rocks_02.png', 64, 64, 1);
    this.register('cloud1', '/Tiny Swords/Terrain/Decorations/Clouds/Clouds_01.png', 576, 256, 1);
    this.register('cloud2', '/Tiny Swords/Terrain/Decorations/Clouds/Clouds_02.png', 576, 256, 1);
    this.register('cloud3', '/Tiny Swords/Terrain/Decorations/Clouds/Clouds_03.png', 576, 256, 1);

    // === PARTICLES ===
    this.register('fx_explosion1', '/Tiny Swords/Particle FX/Explosion_01.png', 192, 192, 8);
    this.register('fx_explosion2', '/Tiny Swords/Particle FX/Explosion_02.png', 192, 192, 10);
    this.register('fx_fire1', '/Tiny Swords/Particle FX/Fire_01.png', 64, 64, 8);
    this.register('fx_fire2', '/Tiny Swords/Particle FX/Fire_02.png', 64, 64, 10);
    this.register('fx_dust1', '/Tiny Swords/Particle FX/Dust_01.png', 64, 64, 8);
    this.register('fx_dust2', '/Tiny Swords/Particle FX/Dust_02.png', 64, 64, 10);
    this.register('fx_splash', '/Tiny Swords/Particle FX/Water Splash.png', 192, 192, 9);
  }

  public getSprite(key: string): SpriteInfo | undefined {
    return this.sprites.get(key);
  }

  public getProgress(): number {
    return this.totalCount > 0 ? this.loadedCount / this.totalCount : 1;
  }

  /**
   * Safe drawSprite with intelligent fallbacks:
   * 1. Direct key match
   * 2. Fallback to `[prefix]_[unit]_idle`
   * 3. Fallback to `hero_idle`
   * NEVER returns false if basic unit sprites are loaded — absolutely zero disappearing sprites!
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
    let info = this.sprites.get(key);

    // Intelligent Fallback 1: Try idle of same unit
    if (!info || !info.loaded) {
      const parts = key.split('_');
      if (parts.length >= 2) {
        const fallbackKey = `${parts[0]}_${parts[1]}_idle`;
        info = this.sprites.get(fallbackKey);
      }
    }

    // Intelligent Fallback 2: Try hero_idle
    if (!info || !info.loaded) {
      info = this.sprites.get('hero_idle');
    }

    if (!info || !info.loaded) {
      return false;
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

    ctx.drawImage(
      info.img,
      sx, sy, sw, sh,
      -dw / 2, -dh * 0.75, dw, dh
    );
    ctx.restore();
    return true;
  }

  public drawBuilding(
    ctx: CanvasRenderingContext2D,
    key: string,
    x: number,
    y: number,
    scale: number = 1,
    alpha: number = 1
  ): boolean {
    let info = this.sprites.get(key);
    if (!info || !info.loaded) {
      info = this.sprites.get('building_castle');
    }
    if (!info || !info.loaded) {
      return false;
    }

    const dw = info.frameW * scale;
    const dh = info.frameH * scale;

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(Math.round(x), Math.round(y));

    ctx.drawImage(
      info.img,
      0, 0, info.frameW, info.frameH,
      -dw / 2, -dh * 0.85, dw, dh
    );
    ctx.restore();
    return true;
  }
}
