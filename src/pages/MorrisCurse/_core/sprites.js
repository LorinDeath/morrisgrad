import campfireSrc from '../../../assets/free_campfire.png';
import soulSrc from '../../../assets/character_1_frame16x20.png';
import rogueSrc from '../../../assets/character_1_frame16x20 2.png';
import warriorSrc from '../../../assets/character_8_frame16x20.png';
import spearmanSrc from '../../../assets/character_9_frame16x20.png';
import keytSrc from '../../../assets/Keyt.png';
import mageSrc from '../../../assets/mage.png';
import darSrc from '../../../assets/Dar.png';
import flowerSrc from '../../../assets/Vampire Tulip 1A[anim].png'; // Импорт спрайтшита цветка

export const darImg = createImg(darSrc);
export const flowerImg = createImg(flowerSrc); // Экспорт картинки цветка

function createImg(src) {
  const img = new Image();
  img.src = typeof src === 'object' && src !== null
    ? (src.src || src.default?.src || src.default || '')
    : src;
  return img;
}

export const CAMPFIRE_CONFIG = {
  cols: 3,
  rows: 1,
  activeRow: 0,
  frameSpeed: 140,
  drawWidth: 36
};

export const SPRITE_CONFIG = {
  cols: 3,
  rows: 4,
  frameSpeed: 130,
  drawWidth: 32,
  drawHeight: 40
};

// Конфигурация сетки анимаций цветка (4 колонки, 14 рядов)
export const FLOWER_SPRITE_CONFIG = {
  cols: 4,
  rows: 14,
  frameSpeed: 150,
  drawWidth: 64,  // Увеличенной в 2 раза ширина (было 32)
  drawHeight: 64  // Увеличенная в 2 раза высота (было 32)
};

export const campfireImg = createImg(campfireSrc);
export const keytImg = createImg(keytSrc);

export const SPRITES = {
  soul: createImg(soulSrc),
  warrior: createImg(warriorSrc),
  spearman: createImg(spearmanSrc),
  rogue: createImg(rogueSrc),
  mage: createImg(mageSrc)
};

export function createArtDecoPattern(ctx) {
  const tile = document.createElement('canvas');
  tile.width = 64;
  tile.height = 64;
  const t = tile.getContext('2d');

  t.fillStyle = '#0a0812';
  t.fillRect(0, 0, 64, 64);

  t.fillStyle = '#120d1f';
  t.beginPath(); t.moveTo(0, 0); t.lineTo(24, 0); t.lineTo(0, 24); t.fill();
  t.beginPath(); t.moveTo(64, 0); t.lineTo(40, 0); t.lineTo(64, 24); t.fill();
  t.beginPath(); t.moveTo(64, 64); t.lineTo(40, 64); t.lineTo(64, 40); t.fill();
  t.beginPath(); t.moveTo(0, 64); t.lineTo(24, 64); t.lineTo(0, 40); t.fill();

  t.strokeStyle = 'rgba(197, 155, 39, 0.45)';
  t.lineWidth = 1;
  t.beginPath();
  t.moveTo(14, 0); t.lineTo(0, 14);
  t.moveTo(50, 0); t.lineTo(64, 14);
  t.moveTo(50, 64); t.lineTo(64, 50);
  t.moveTo(14, 64); t.lineTo(0, 50);
  t.stroke();

  t.fillStyle = '#171126';
  t.beginPath();
  t.moveTo(32, 0); t.lineTo(64, 32);
  t.lineTo(32, 64); t.lineTo(0, 32);
  t.closePath();
  t.fill();
  t.strokeStyle = 'rgba(212, 175, 55, 0.6)';
  t.lineWidth = 1.2;
  t.stroke();

  t.strokeStyle = '#432d5c';
  t.lineWidth = 1;
  t.beginPath();
  t.moveTo(32, 7); t.lineTo(57, 32);
  t.lineTo(32, 57); t.lineTo(7, 32);
  t.closePath();
  t.stroke();

  t.fillStyle = '#07050d';
  t.beginPath();
  t.moveTo(32, 13); t.lineTo(51, 32);
  t.lineTo(32, 51); t.lineTo(13, 32);
  t.closePath();
  t.fill();
  t.strokeStyle = 'rgba(197, 155, 39, 0.5)';
  t.lineWidth = 1;
  t.stroke();

  t.strokeStyle = 'rgba(245, 215, 127, 0.55)';
  t.lineWidth = 1;
  t.beginPath();
  t.moveTo(32, 21); t.lineTo(43, 32);
  t.lineTo(32, 43); t.lineTo(21, 32);
  t.closePath();
  t.stroke();

  t.fillStyle = 'rgba(212, 175, 55, 0.7)';
  t.beginPath();
  t.moveTo(32, 27); t.lineTo(37, 32);
  t.lineTo(32, 37); t.lineTo(27, 32);
  t.closePath();
  t.fill();

  t.strokeStyle = 'rgba(212, 175, 55, 0.15)';
  t.lineWidth = 1;
  t.strokeRect(0.5, 0.5, 63, 63);

  return ctx.createPattern(tile, 'repeat');
}

export function getDirectionRow(dirX, dirY) {
  if (Math.abs(dirX) > Math.abs(dirY)) {
    return dirX < 0 ? 1 : 2;
  }
  return dirY < 0 ? 3 : 0;
}

export function drawCharacterShadow(ctx, x, y, scale = 1) {
  ctx.save();
  ctx.fillStyle = 'rgba(2, 1, 6, 0.55)';
  ctx.beginPath();
  ctx.ellipse(x, y + 13, 11 * scale, 4.5 * scale, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

export function drawCharacterSprite(ctx, img, x, y, dirX, dirY, isMoving, now, fallbackColor) {
  if (!img || !img.complete || img.naturalWidth === 0) {
    const dw = SPRITE_CONFIG.drawWidth;
    const dh = SPRITE_CONFIG.drawHeight;
    ctx.fillStyle = fallbackColor || '#ffffff';
    ctx.fillRect(x - dw / 2, y - dh / 2, dw, dh);
    return;
  }

  ctx.imageSmoothingEnabled = false;

  const isFullSheet = img.naturalWidth > 200;
  const totalCols = isFullSheet ? 12 : 3;
  const totalRows = isFullSheet ? 8 : 4;

  const dw = isFullSheet ? 38 : SPRITE_CONFIG.drawWidth;
  const dh = isFullSheet ? 46 : SPRITE_CONFIG.drawHeight;
  const yOffset = isFullSheet ? 6 : 4;

  const frameW = img.naturalWidth / totalCols;
  const frameH = img.naturalHeight / totalRows;
  const row = getDirectionRow(dirX, dirY);

  const WALK_SEQUENCE = [0, 1, 2, 1];
  const col = isMoving ? WALK_SEQUENCE[Math.floor(now / 130) % 4] : 1;

  const sx = col * frameW;
  const sy = row * frameH;
  const dx = x - dw / 2;
  const dy = y - dh / 2 - yOffset;

  ctx.drawImage(img, sx, sy, frameW, frameH, dx, dy, dw, dh);
}

export function drawBossSprite(ctx, img, x, y, dirX, dirY, isMoving, now) {
  drawCharacterSprite(ctx, img, x, y, dirX, dirY, isMoving, now, '#f472b6');
}

// Отрисовка цветка-вампира с учетом стадий и цветовых шейдеров
export function drawFlowerSprite(ctx, flower, now) {
  if (!flowerImg.complete || flowerImg.naturalWidth === 0) {
    ctx.fillStyle = '#f43f5e';
    ctx.fillRect(flower.x - 12, flower.y - 12, 24, 24);
    return;
  }

  ctx.save();
  ctx.imageSmoothingEnabled = false;

  // Выбор ряда в зависимости от стадии
  let targetRow = 1; // Ряд 2 (спящий бутон)
  if (flower.stage === 'mature') {
    targetRow = 6; // Ряд 7 (созревший спиральный стебель)
  } else if (flower.stage === 'active') {
    targetRow = 0; // Ряд 1 (активный монстр с пастью)
  }

  const frameW = flowerImg.naturalWidth / FLOWER_SPRITE_CONFIG.cols;
  const frameH = flowerImg.naturalHeight / FLOWER_SPRITE_CONFIG.rows;
  const col = Math.floor(now / FLOWER_SPRITE_CONFIG.frameSpeed) % FLOWER_SPRITE_CONFIG.cols;

  const sx = col * frameW;
  const sy = targetRow * frameH;
  const dw = FLOWER_SPRITE_CONFIG.drawWidth;
  const dh = FLOWER_SPRITE_CONFIG.drawHeight;
  const dx = flower.x - dw / 2;
  const dy = flower.y - dh / 2;

  // Применение стихийных шейдеров (Canvas Filters)
  if (flower.stage === 'active') {
    if (flower.flowerType === 'fire') {
      ctx.filter = 'hue-rotate(-20deg) saturate(2.5) brightness(1.2)';
    } else if (flower.flowerType === 'frost') {
      ctx.filter = 'hue-rotate(180deg) saturate(2.2) brightness(1.1)';
    } else if (flower.flowerType === 'hell') {
      ctx.filter = 'hue-rotate(270deg) contrast(1.5) brightness(0.7)';
    }
  }

  ctx.drawImage(flowerImg, sx, sy, frameW, frameH, dx, dy, dw, dh);
  ctx.restore();
}