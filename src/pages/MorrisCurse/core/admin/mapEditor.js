export class MapEditor {
  constructor(canvas, container, getWorldCallback) {
    this.canvas = canvas;
    this.container = container;
    this.getWorld = getWorldCallback;
    this.isActive = false;
    this.cellSize = 32;
    this.worldSize = 1200;
    this.gridCount = Math.floor(this.worldSize / this.cellSize);

    // Локальное хранилище текущей сессии редактирования: key -> { x, y, tileId, layer }
    this.tiles = new Map();

    this.currentLayer = 0; // 0: Пол, 1: Объекты, 2: Коллизия
    this.selectedTile = 'platform_star';
    this.currentTool = 'brush'; // 'brush' | 'eraser'
    this.isMouseDown = false;

    // Палитра доступных тайлов
    this.palette = [
      { id: 'void', name: 'Пустота/Стереть', color: '#000000', layer: 0 },
      { id: 'floor_void', name: 'Тёмный гранит', color: '#13111c', layer: 0 },
      { id: 'floor_star', name: 'Звёздная плита', color: '#2e1b4d', layer: 0 },
      { id: 'floor_crystal', name: 'Хрусталь', color: '#1e3a5f', layer: 0 },
      { id: 'wall_cosmic', name: 'Стена разлома', color: '#6366f1', layer: 1 },
      { id: 'column_rune', name: 'Руническая колонна', color: '#c084fc', layer: 1 },
      { id: 'collision_box', name: '🚫 Блок коллизии', color: 'rgba(239, 68, 68, 0.7)', layer: 2 }
    ];

    this.initUI();
  }

  initUI() {
    this.panel = document.createElement('div');
    this.panel.id = 'map-editor-panel';
    this.panel.style.cssText = `
      position: absolute; top: 12px; left: 12px; width: 280px; max-height: 90vh;
      background: rgba(10, 8, 20, 0.96); border: 2px solid #818cf8;
      box-shadow: 0 0 25px rgba(129, 140, 248, 0.35); border-radius: 8px;
      padding: 14px; font-family: monospace; color: #fff; z-index: 100010;
      display: none; flex-direction: column; gap: 10px; box-sizing: border-box;
    `;

    this.panel.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #282142; padding-bottom: 6px;">
        <span style="color: #818cf8; font-weight: bold; font-size: 13px;">МАППИНГ // РЕДАКТОР</span>
        <button id="ed-close-btn" style="background: none; border: none; color: #94a3b8; font-size: 18px; cursor: pointer;">✕</button>
      </div>

      <div style="font-size: 11px; color: #94a3b8;">Мир: <b id="ed-world-name" style="color: #ffd700;">-</b></div>

      <div style="display: flex; gap: 6px;">
        <button id="ed-tool-brush" style="flex: 1; background: #4338ca; border: 1px solid #818cf8; color: #fff; padding: 5px; border-radius: 4px; cursor: pointer; font-size: 11px;">Кисть</button>
        <button id="ed-tool-erase" style="flex: 1; background: #1e1b2e; border: 1px solid #3b3355; color: #94a3b8; padding: 5px; border-radius: 4px; cursor: pointer; font-size: 11px;">Ластик</button>
        <button id="ed-clear-all" style="background: #7f1d1d; border: 1px solid #ef4444; color: #fff; padding: 5px 8px; border-radius: 4px; cursor: pointer; font-size: 11px;">Сброс</button>
      </div>

      <div style="font-size: 11px; color: #a5b4fc; margin-top: 4px;">Слой:</div>
      <div style="display: flex; gap: 4px;">
        <button class="ed-layer-btn" data-layer="0" style="flex: 1; background: #312e81; border: 1px solid #6366f1; color: #fff; padding: 4px; font-size: 10px; border-radius: 3px; cursor: pointer;">0: Пол</button>
        <button class="ed-layer-btn" data-layer="1" style="flex: 1; background: #1e1b2e; border: 1px solid #3b3355; color: #94a3b8; padding: 4px; font-size: 10px; border-radius: 3px; cursor: pointer;">1: Объект</button>
        <button class="ed-layer-btn" data-layer="2" style="flex: 1; background: #1e1b2e; border: 1px solid #3b3355; color: #94a3b8; padding: 4px; font-size: 10px; border-radius: 3px; cursor: pointer;">2: Стена</button>
      </div>

      <div style="font-size: 11px; color: #a5b4fc; margin-top: 4px;">Палитра элементов:</div>
      <div id="ed-palette-list" style="display: flex; flex-direction: column; gap: 6px; max-height: 160px; overflow-y: auto; padding-right: 4px;"></div>

      <div style="margin-top: 6px; border-top: 1px solid #282142; padding-top: 10px; display: flex; flex-direction: column; gap: 6px;">
        <button id="ed-export-btn" style="background: #059669; border: 1px solid #34d399; color: #fff; padding: 8px; border-radius: 4px; font-weight: bold; cursor: pointer; font-size: 11px;">
          💾 Экспорт карты в файл (.ts)
        </button>
      </div>
    `;

    this.container.appendChild(this.panel);
    this.bindEvents();
    this.renderPalette();
  }

  bindEvents() {
    this.panel.querySelector('#ed-close-btn').onclick = () => this.toggle(false);

    const bBrush = this.panel.querySelector('#ed-tool-brush');
    const bErase = this.panel.querySelector('#ed-tool-erase');

    bBrush.onclick = () => {
      this.currentTool = 'brush';
      bBrush.style.background = '#4338ca';
      bErase.style.background = '#1e1b2e';
    };
    bErase.onclick = () => {
      this.currentTool = 'eraser';
      bErase.style.background = '#4338ca';
      bBrush.style.background = '#1e1b2e';
    };

    this.panel.querySelector('#ed-clear-all').onclick = () => {
      if (confirm('Очистить все созданные тайлы этой локации?')) {
        this.tiles.clear();
      }
    };

    const layerBtns = this.panel.querySelectorAll('.ed-layer-btn');
    layerBtns.forEach((btn) => {
      btn.onclick = () => {
        this.currentLayer = Number(btn.dataset.layer);
        layerBtns.forEach((b) => {
          b.style.background = '#1e1b2e';
          b.style.borderColor = '#3b3355';
          b.style.color = '#94a3b8';
        });
        btn.style.background = '#312e81';
        btn.style.borderColor = '#6366f1';
        btn.style.color = '#fff';
        this.renderPalette();
      };
    });

    this.panel.querySelector('#ed-export-btn').onclick = () => this.exportMapFile();

    // Обработка кликов и рисования по Canvas
    this.canvas.addEventListener('mousedown', (e) => {
      if (!this.isActive) return;
      this.isMouseDown = true;
      this.paintAtEvent(e);
    });

    window.addEventListener('mouseup', () => { this.isMouseDown = false; });

    this.canvas.addEventListener('mousemove', (e) => {
      if (!this.isActive || !this.isMouseDown) return;
      this.paintAtEvent(e);
    });
  }

  renderPalette() {
    const list = this.panel.querySelector('#ed-palette-list');
    list.innerHTML = '';

    const filtered = this.palette.filter((p) => p.layer === this.currentLayer || p.id === 'void');
    filtered.forEach((item) => {
      const row = document.createElement('div');
      const isSel = this.selectedTile === item.id;
      row.style.cssText = `
        display: flex; align-items: center; gap: 8px; padding: 6px 8px;
        background: ${isSel ? '#2e264d' : '#141124'}; border: 1px solid ${isSel ? '#818cf8' : '#251e3a'};
        border-radius: 4px; cursor: pointer; font-size: 11px;
      `;
      row.innerHTML = `
        <div style="width: 14px; height: 14px; background: ${item.color}; border: 1px solid #fff; border-radius: 2px;"></div>
        <span style="color: ${isSel ? '#ffd700' : '#e2e8f0'};">${item.name}</span>
      `;
      row.onclick = () => {
        this.selectedTile = item.id;
        this.renderPalette();
      };
      list.appendChild(row);
    });
  }

  paintAtEvent(e) {
    // Координаты сетки рассчитываются с учётом сдвига камеры игры
    const rect = this.canvas.getBoundingClientRect();
    const screenX = (e.clientX - rect.left) * (this.canvas.width / rect.width);
    const screenY = (e.clientY - rect.top) * (this.canvas.height / rect.height);

    const camera = window.__GAME_CAMERA__ || { x: 600, y: 600, zoom: 0.5 };
    const worldX = (screenX - this.canvas.width / 2) / camera.zoom + camera.x;
    const worldY = (screenY - this.canvas.height / 2) / camera.zoom + camera.y;

    if (worldX < 0 || worldX >= this.worldSize || worldY < 0 || worldY >= this.worldSize) return;

    const cellX = Math.floor(worldX / this.cellSize);
    const cellY = Math.floor(worldY / this.cellSize);
    const key = `${cellX}_${cellY}_${this.currentLayer}`;

    if (this.currentTool === 'eraser' || this.selectedTile === 'void') {
      this.tiles.delete(key);
    } else {
      this.tiles.set(key, {
        x: cellX,
        y: cellY,
        tileId: this.selectedTile,
        layer: this.currentLayer
      });
    }
  }

  toggle(forceState) {
    this.isActive = forceState !== undefined ? forceState : !this.isActive;
    this.panel.style.display = this.isActive ? 'flex' : 'none';

    if (this.isActive) {
      const curWorld = this.getWorld ? this.getWorld() : 'unknown';
      this.panel.querySelector('#ed-world-name').textContent = curWorld.toUpperCase();
    }
  }

  // Отрисовка сетки и выставленных тайлов в цикле loop()
  renderOverlay(ctx, camera) {
    if (!this.isActive) {
      // Даже если редактор закрыт, отображаем уже сохранённые для предпросмотра тайлы
      this.renderTilesOnly(ctx);
      return;
    }

    // 1. Отрисовка тайлов
    this.renderTilesOnly(ctx);

    // 2. Координатная сетка 32x32
    ctx.save();
    ctx.strokeStyle = 'rgba(129, 140, 248, 0.22)';
    ctx.lineWidth = 1 / camera.zoom;
    ctx.beginPath();
    for (let x = 0; x <= this.worldSize; x += this.cellSize) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, this.worldSize);
    }
    for (let y = 0; y <= this.worldSize; y += this.cellSize) {
      ctx.moveTo(0, y);
      ctx.lineTo(this.worldSize, y);
    }
    ctx.stroke();

    // 3. Подсветка границ мира
    ctx.strokeStyle = '#ef4444';
    ctx.lineWidth = 2 / camera.zoom;
    ctx.strokeRect(0, 0, this.worldSize, this.worldSize);
    ctx.restore();
  }

  renderTilesOnly(ctx) {
    ctx.save();
    this.tiles.forEach((t) => {
      const rx = t.x * this.cellSize;
      const ry = t.y * this.cellSize;
      const item = this.palette.find((p) => p.id === t.tileId);
      ctx.fillStyle = item ? item.color : '#a855f7';
      ctx.fillRect(rx, ry, this.cellSize, this.cellSize);

      if (t.layer === 2) {
        // Обозначение коллизии
        ctx.strokeStyle = '#ef4444';
        ctx.lineWidth = 1;
        ctx.strokeRect(rx + 1, ry + 1, this.cellSize - 2, this.cellSize - 2);
      }
    });
    ctx.restore();
  }

  exportMapFile() {
    const world = this.getWorld ? this.getWorld() : 'arinar';
    const tileArray = Array.from(this.tiles.values());

    const fileContent = `// Сгенерировано Администратором в MapEditor
// Мир: ${world} | Тайлов: ${tileArray.length}

export interface TileData {
  x: number;
  y: number;
  tileId: string;
  layer: number;
}

export const ${world.toUpperCase()}_MAP_TILES: TileData[] = ${JSON.stringify(tileArray, null, 2)};
`;

    const blob = new Blob([fileContent], { type: 'text/typescript;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${world}Map.ts`;
    link.click();
    URL.revokeObjectURL(url);
  }
}