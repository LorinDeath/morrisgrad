// assets.ts - Asset loader and sprite slicer for Dungeon Gathering Free Version

export interface DungeonAssets {
  tiles: HTMLImageElement;
  tilesSet1: HTMLImageElement;
  zombieIdle: HTMLImageElement;
  zombieRun: HTMLImageElement;
  zombieHurt: HTMLImageElement;
  zombieDeath: HTMLImageElement;
  zombiePortrait: HTMLImageElement;
  torchWall: HTMLImageElement;
  torchLeft: HTMLImageElement;
  torchRight: HTMLImageElement;
  vaseAnim: HTMLImageElement;
  water: HTMLImageElement;
  structure: HTMLImageElement;
  coins: HTMLImageElement;
  blueCoins: HTMLImageElement;
  hearts: HTMLImageElement;
  cursors: HTMLImageElement;
  buttons: HTMLImageElement;
  buttonSingle: HTMLImageElement;
  potions: HTMLImageElement[];
}

let loadedAssets: DungeonAssets | null = null;

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve) => {
    const img = new Image();
    img.src = src;
    img.onload = () => resolve(img);
    img.onerror = (err) => {
      console.warn(`Failed to load image: ${src}`, err);
      // Fallback empty image to prevent crash
      resolve(img);
    };
  });
}

export async function loadDungeonAssets(): Promise<DungeonAssets> {
  if (loadedAssets) return loadedAssets;

  const basePath = '/Dungeon%20Gathering%20Free%20Version/';

  const [
    tiles,
    tilesSet1,
    zombieIdle,
    zombieRun,
    zombieHurt,
    zombieDeath,
    zombiePortrait,
    torchWall,
    torchLeft,
    torchRight,
    vaseAnim,
    water,
    structure,
    coins,
    blueCoins,
    hearts,
    cursors,
    buttons,
    buttonSingle,
    p1, p2, p3, p4, p5, p6,
  ] = await Promise.all([
    loadImage(basePath + 'All%20Tiles%20Free%20Ver..png'),
    loadImage(basePath + 'Set%201.0.png'),
    loadImage(basePath + '1Zombie-Idle.png'),
    loadImage(basePath + '1Zombie-Run.png'),
    loadImage(basePath + '1Zombie-Hurt.png'),
    loadImage(basePath + '1Zombie-Death1.png'),
    loadImage(basePath + 'Zombies%201.1%20portraits%2016x16.png'),
    loadImage(basePath + 'Torch%20Yellow.png'),
    loadImage(basePath + 'Torch%20Yellow%20L.png'),
    loadImage(basePath + 'Torch%20Yellow%20R.png'),
    loadImage(basePath + 'Vase%20Shine%20Anim.png'),
    loadImage(basePath + 'Water.png'),
    loadImage(basePath + 'Structure.png'),
    loadImage(basePath + 'Coin%20Sheet.png'),
    loadImage(basePath + 'BlueCoin%20Sheet.png'),
    loadImage(basePath + 'Hearts%20Blue.png'),
    loadImage(basePath + 'Mouse%20cursors.png'),
    loadImage(basePath + 'Basic%20Buttons%203%20Fv.png'),
    loadImage(basePath + 'Button.png'),
    loadImage(basePath + 'Potion%201.png'),
    loadImage(basePath + 'Potion%202.png'),
    loadImage(basePath + 'Potion%203.png'),
    loadImage(basePath + 'Potion%204.png'),
    loadImage(basePath + 'Potion%205.png'),
    loadImage(basePath + 'Potion%206.png'),
  ]);

  loadedAssets = {
    tiles,
    tilesSet1,
    zombieIdle,
    zombieRun,
    zombieHurt,
    zombieDeath,
    zombiePortrait,
    torchWall,
    torchLeft,
    torchRight,
    vaseAnim,
    water,
    structure,
    coins,
    blueCoins,
    hearts,
    cursors,
    buttons,
    buttonSingle,
    potions: [p1, p2, p3, p4, p5, p6],
  };

  return loadedAssets;
}
