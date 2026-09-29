import { HELLFIRE_MAP_TILES } from '../../../../server/maps/hellfireMap.ts';
import { ARINAR_MAP_TILES } from '../../../../server/maps/arinarMap.ts';

export class WorldMapManager {
  constructor(cellSize = 32) {
    this.cellSize = cellSize;
    this.currentWorld = 'hellfire';
    
    this.maps = {
      hellfire: HELLFIRE_MAP_TILES || [],
      arinar: ARINAR_MAP_TILES || []
    };

    this.solidGrid = new Set();
    this.switchWorld('hellfire');
  }

  switchWorld(worldName) {
    this.currentWorld = worldName || 'hellfire';
    this.rebuildCollisions();
  }

  rebuildCollisions() {
    this.solidGrid.clear();
    const activeTiles = this.maps[this.currentWorld] || [];
    activeTiles.forEach((t) => {
      if (t.layer === 2 || t.tileId === 'collision_box') {
        this.solidGrid.add(`${t.x}_${t.y}`);
      }
    });
  }

  isBlocked(worldX, worldY, padding = 10) {
    const minCellX = Math.floor((worldX - padding) / this.cellSize);
    const maxCellX = Math.floor((worldX + padding) / this.cellSize);
    const minCellY = Math.floor((worldY - padding) / this.cellSize);
    const maxCellY = Math.floor((worldY + padding) / this.cellSize);

    for (let cx = minCellX; cx <= maxCellX; cx++) {
      for (let cy = minCellY; cy <= maxCellY; cy++) {
        if (this.solidGrid.has(`${cx}_${cy}`)) {
          return true;
        }
      }
    }
    return false;
  }

  // Отрисовка пола (Слой 0) для текущего мира
  renderFloor(ctx) {
    const activeTiles = this.maps[this.currentWorld] || [];
    const floorTiles = activeTiles.filter((t) => t.layer === 0);

    floorTiles.forEach((t) => {
      const rx = t.x * this.cellSize;
      const ry = t.y * this.cellSize;

      if (t.tileId === 'floor_star' || t.tileId === 'platform_star') {
        ctx.fillStyle = this.currentWorld === 'arinar' ? '#181b36' : '#221533';
        ctx.fillRect(rx, ry, this.cellSize, this.cellSize);
        ctx.strokeStyle = this.currentWorld === 'arinar' ? 'rgba(129, 140, 248, 0.4)' : 'rgba(245, 158, 11, 0.3)';
        ctx.lineWidth = 1;
        ctx.strokeRect(rx + 1, ry + 1, this.cellSize - 2, this.cellSize - 2);
      } else if (t.tileId === 'floor_void') {
        ctx.fillStyle = '#0a0814';
        ctx.fillRect(rx, ry, this.cellSize, this.cellSize);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.04)';
        ctx.fillRect(rx + 2, ry + 2, this.cellSize - 4, this.cellSize - 4);
      } else if (t.tileId === 'floor_crystal') {
        ctx.fillStyle = '#102a45';
        ctx.fillRect(rx, ry, this.cellSize, this.cellSize);
        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 1;
        ctx.strokeRect(rx + 2, ry + 2, this.cellSize - 4, this.cellSize - 4);
      } else {
        ctx.fillStyle = '#141124';
        ctx.fillRect(rx, ry, this.cellSize, this.cellSize);
      }
    });
  }

  // Отрисовка декораций и препятствий (Слой 1)
  renderObjects(ctx, now) {
    const activeTiles = this.maps[this.currentWorld] || [];
    const objTiles = activeTiles.filter((t) => t.layer === 1);

    objTiles.forEach((t) => {
      const rx = t.x * this.cellSize;
      const ry = t.y * this.cellSize;

      if (t.tileId === 'column_rune') {
        const pulse = Math.sin(now / 260) * 0.25 + 0.75;
        ctx.save();
        ctx.fillStyle = '#1b132e';
        ctx.fillRect(rx + 4, ry - 8, this.cellSize - 8, this.cellSize + 8);
        ctx.strokeStyle = `rgba(192, 132, 252, ${pulse})`;
        ctx.lineWidth = 1.5;
        ctx.strokeRect(rx + 4, ry - 8, this.cellSize - 8, this.cellSize + 8);

        ctx.fillStyle = `rgba(244, 114, 182, ${pulse})`;
        ctx.font = 'bold 11px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('ᛟ', rx + this.cellSize / 2, ry + 6);
        ctx.restore();
      } else {
        ctx.fillStyle = '#2d2244';
        ctx.fillRect(rx, ry, this.cellSize, this.cellSize);
        ctx.strokeStyle = '#4f3b75';
        ctx.strokeRect(rx, ry, this.cellSize, this.cellSize);
      }
    });
  }
}