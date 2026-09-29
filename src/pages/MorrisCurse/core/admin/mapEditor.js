export class MapEditor {
  constructor(canvas, container, getWorldCallback, onSwitchWorldCallback = null) {
    this.canvas = canvas;
    this.container = container;
    this.getWorld = getWorldCallback;
    this.onSwitchWorld = onSwitchWorldCallback;
    this.isActive = false;
    this.cellSize = 32;
    this.worldSize = 1200;
    this.gridCount = Math.floor(this.worldSize / this.cellSize);

    // Локальное хранилище тайлов: key ("x_y_layer") -> { x, y, tileId, layer }
    this.tiles = new Map();

    this.currentLayer = 0; // 0: Пол, 1: Объект, 2: Коллизия
    this.selectedTile = 'platform_star';
    this.currentTool = 'brush'; // 'brush' | 'eraser' | 'box'
    this.isMouseDown = false;
    this.boxStart = null;
    this.hoverCell = { x: 0, y: 0 };

    this.palette = [
      { id: 'void', name: 'Пустота (Ластик)', color: '#000000', layer: 0 },
      { id: 'floor_void', name: 'Тёмный гранит', color: '#13111c', layer: 0 },
      { id: 'floor_star', name: 'Звёздная плита', color: '#2e1b4d', layer: 0 },
      { id: 'platform_star', name: 'Платформа рун', color: '#3b2568', layer: 0 },
      { id: 'floor_crystal', name: 'Хрусталь', color: '#1e3a5f', layer: 0 },
      { id: 'wall_cosmic', name: 'Стена разлома', color: '#6366f1', layer: 1 },
      { id: 'column_rune', name: 'Руническая колонна', color: '#c084fc', layer: 1 },
      { id: 'collision_box', name: '🚫 Блок коллизии', color: 'rgba(239, 68, 68, 0.75)', layer: 2 }
    ];

    this.initUI();
  }

  initUI() {
    this.panel = document.createElement('div');
    this.panel.id = 'map-editor-panel';
    this.panel.style.cssText = `
      position: absolute; top: 12px; left: 12px; width: 300px; max-height: 94vh;
      background: rgba(12, 10, 22, 0.97); border: 2px solid #818cf8;
      box-shadow: 0 0 25px rgba(129, 140, 248, 0.4); border-radius: 8px;
      padding: 12px; font-family: monospace; color: #fff; z-index: 100010;
      display: none; flex-direction: column; gap: 8px; box-sizing: border-box;
      user-select: none;
    `;

    this.panel.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #282142; padding-bottom: 6px;">
        <span style="color: #818cf8; font-weight: bold; font-size: 13px;">МАППИНГ // СТУДИЯ</span>
        <button id="ed-close-btn" style="background: none; border: none; color: #94a3b8; font-size: 18px; cursor: pointer;">✕</button>
      </div>

      <div style="display: flex; justify-content: space-between; align-items: center; font-size: 11px;">
        <span style="color: #94a3b8;">Мир: <b id="ed-world-name" style="color: #ffd700;">-</b></span>
        <span style="color: #38bdf8;" id="ed-coords">X: 0 | Y: 0</span>
      </div>

      <div style="display: flex; gap: 6px;">
        <button id="ed-sandbox-toggle" style="flex: 1; background: #065f46; border: 1px solid #10b981; color: #fff; padding: 5px; border-radius: 4px; font-size: 10px; cursor: pointer; font-weight: bold;">
          🏕️ Песочница (Solo)
        </button>
      </div>

      <div style="display: flex; gap: 4px;">
        <button id="ed-tool-brush" style="flex: 1; background: #4338ca; border: 1px solid #818cf8; color: #fff; padding: 5px; border-radius: 4px; cursor: pointer; font-size: 10px;">Кисть</button>
        <button id="ed-tool-box" style="flex: 1; background: #1e1b2e; border: 1px solid #3b3355; color: #94a3b8; padding: 5px; border-radius: 4px; cursor: pointer; font-size: 10px;">Область (Box)</button>
        <button id="ed-tool-erase" style="flex: 1; background: #1e1b2e; border: 1px solid #3b3355; color: #94a3b8; padding: 5px; border-radius: 4px; cursor: pointer; font-size: 10px;">Ластик</button>
        <button id="ed-clear-all" style="background: #7f1d1d; border: 1px solid #ef4444; color: #fff; padding: 5px 8px; border-radius: 4px; cursor: pointer; font-size: 10px;">Сброс</button>
      </div>

      <div style="font-size: 11px; color: #a5b4fc;">Слой редактирования:</div>
      <div style="display: flex; gap: 4px;">
        <button class="ed-layer-btn" data-layer="0" style="flex: 1; background: #312e81; border: 1px solid #6366f1; color: #fff; padding: 4px; font-size: 10px; border-radius: 3px; cursor: pointer;">0: Пол</button>
        <button class="ed-layer-btn" data-layer="1" style="flex: 1; background: #1e1b2e; border: 1px solid #3b3355; color: #94a3b8; padding: 4px; font-size: 10px; border-radius: 3px; cursor: pointer;">1: Объект</button>
        <button class="ed-layer-btn" data-layer="2" style="flex: 1; background: #1e1b2e; border: 1px solid #3b3355; color: #94a3b8; padding: 4px; font-size: 10px; border-radius: 3px; cursor: pointer;">2: Стена</button>
      </div>

      <div style="font-size: 11px; color: #a5b4fc;">Элемент палитры:</div>
      <div id="ed-palette-list" style="display: flex; flex-direction: column; gap: 4px; max-height: 130px; overflow-y: auto; padding-right: 2px;"></div>

      <div style="display: flex; flex-direction: column; gap: 6px; border-top: 1px solid #282142; padding-top: 8px;">
        <button id="ed-import-btn" style="background: #1e293b; border: 1px solid #475569; color: #94a3b8; padding: 6px; border-radius: 4px; cursor: pointer; font-size: 10px;">
          📥 Загрузить / Вставить код (JS/TS)
        </button>
        <button id="ed-export-btn" style="background: #059669; border: 1px solid #34d399; color: #fff; padding: 7px; border-radius: 4px; font-weight: bold; cursor: pointer; font-size: 11px;">
          💾 Экспорт карты в файл (.ts)
        </button>
      </div>

      <!-- Всплывающий блок для вставки кода -->
      <div id="ed-import-modal" style="display: none; flex-direction: column; gap: 6px; background: #0f172a; padding: 8px; border-radius: 4px; border: 1px solid #38bdf8;">
        <span style="font-size: 10px; color: #38bdf8;">Вставь массив TileData[] или содержимое файла:</span>
        <textarea id="ed-import-area" style="width: 100%; height: 80px; background: #020617; border: 1px solid #1e293b; color: #4ade80; font-family: monospace; font-size: 10px; resize: none;"></textarea>
        <div style="display: flex; gap: 4px;">
          <button id="ed-import-apply" style="flex: 1; background: #2563eb; border: none; color: #fff; padding: 4px; border-radius: 3px; font-size: 10px; cursor: pointer;">Применить</button>
          <button id="ed-import-cancel" style="background: #475569; border: none; color: #fff; padding: 4px 8px; border-radius: 3px; font-size: 10px; cursor: pointer;">Отмена</button>
        </div>
      </div>
    `;

    this.container.appendChild(this.panel);
    this.bindEvents();
    this.renderPalette();
  }

  bindEvents() {
    this.panel.querySelector('#ed-close-btn').onclick = () => this.toggle(false);

    // Переключение инструментов
    const bBrush = this.panel.querySelector('#ed-tool-brush');
    const bBox = this.panel.querySelector('#ed-tool-box');
    const bErase = this.panel.querySelector('#ed-tool-erase');

    const setTool = (tool, btn) => {
      this.currentTool = tool;
      [bBrush, bBox, bErase].forEach(b => {
        b.style.background = '#1e1b2e';
        b.style.borderColor = '#3b3355';
        b.style.color = '#94a3b8';
      });
      btn.style.background = '#4338ca';
      btn.style.borderColor = '#818cf8';
      btn.style.color = '#fff';
    };

    bBrush.onclick = () => setTool('brush', bBrush);
    bBox.onclick = () => setTool('box', bBox);
    bErase.onclick = () => setTool('eraser', bErase);

    this.panel.querySelector('#ed-clear-all').onclick = () => {
      if (confirm('Очистить все нарисованные тайлы текущей локации?')) {
        this.tiles.clear();
      }
    };

    // Слои
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

    // Песочница (Sandbox)
    const sbBtn = this.panel.querySelector('#ed-sandbox-toggle');
    sbBtn.onclick = () => {
      if (this.onSwitchWorld) {
        const curWorld = this.getWorld();
        const nextWorld = (curWorld === 'sandbox') ? 'hellfire' : 'sandbox';
        this.onSwitchWorld(nextWorld);
        sbBtn.textContent = nextWorld === 'sandbox' ? '🔥 Вернуться в Ад' : '🏕️ Песочница (Solo)';
        sbBtn.style.background = nextWorld === 'sandbox' ? '#7f1d1d' : '#065f46';
        this.panel.querySelector('#ed-world-name').textContent = nextWorld.toUpperCase();
      }
    };

    // Импорт кода
    const importModal = this.panel.querySelector('#ed-import-modal');
    const importArea = this.panel.querySelector('#ed-import-area');
    this.panel.querySelector('#ed-import-btn').onclick = () => {
      importModal.style.display = 'flex';
      importArea.focus();
    };
    this.panel.querySelector('#ed-import-cancel').onclick = () => {
      importModal.style.display = 'none';
      importArea.value = '';
    };
    this.panel.querySelector('#ed-import-apply').onclick = () => {
      this.importCode(importArea.value);
      importModal.style.display = 'none';
      importArea.value = '';
    };

    this.panel.querySelector('#ed-export-btn').onclick = () => this.exportMapFile();

    // Мышь по холсту
    this.canvas.addEventListener('mousedown', (e) => {
      if (!this.isActive) return;
      if (e.button === 0) { // ЛКМ
        this.isMouseDown = true;
        const cell = this.getCellFromEvent(e);
        if (this.currentTool === 'box') {
          this.boxStart = cell;
        } else {
          this.paintAtCell(cell.x, cell.y);
        }
      } else if (e.button === 1) { // СКМ: Пипетка
        e.preventDefault();
        this.pickTileAtEvent(e);
      }
    });

    window.addEventListener('mouseup', (e) => {
      if (!this.isActive) return;
      if (this.isMouseDown && this.currentTool === 'box' && this.boxStart) {
        const cell = this.getCellFromEvent(e);
        this.fillBox(this.boxStart, cell);
        this.boxStart = null;
      }
      this.isMouseDown = false;
    });

    this.canvas.addEventListener('mousemove', (e) => {
      if (!this.isActive) return;
      const cell = this.getCellFromEvent(e);
      this.hoverCell = cell;
      this.panel.querySelector('#ed-coords').textContent = `X: ${cell.x} | Y: ${cell.y}`;

      if (this.isMouseDown && this.currentTool !== 'box') {
        this.paintAtCell(cell.x, cell.y);
      }
    });
  }

  getCellFromEvent(e) {
    const rect = this.canvas.getBoundingClientRect();
    const screenX = (e.clientX - rect.left) * (this.canvas.width / rect.width);
    const screenY = (e.clientY - rect.top) * (this.canvas.height / rect.height);

    const camera = window.__GAME_CAMERA__ || { x: 600, y: 600, zoom: 0.5 };
    const worldX = (screenX - this.canvas.width / 2) / camera.zoom + camera.x;
    const worldY = (screenY - this.canvas.height / 2) / camera.zoom + camera.y;

    const cellX = Math.max(0, Math.min(this.gridCount - 1, Math.floor(worldX / this.cellSize)));
    const cellY = Math.max(0, Math.min(this.gridCount - 1, Math.floor(worldY / this.cellSize)));
    return { x: cellX, y: cellY };
  }

  paintAtCell(cellX, cellY) {
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

  fillBox(start, end) {
    const minX = Math.min(start.x, end.x);
    const maxX = Math.max(start.x, end.x);
    const minY = Math.min(start.y, end.y);
    const maxY = Math.max(start.y, end.y);

    for (let x = minX; x <= maxX; x++) {
      for (let y = minY; y <= maxY; y++) {
        this.paintAtCell(x, y);
      }
    }
  }

  pickTileAtEvent(e) {
    const cell = this.getCellFromEvent(e);
    // Проверяем сверху вниз (от слоя 2 к 0)
    for (let l = 2; l >= 0; l--) {
      const key = `${cell.x}_${cell.y}_${l}`;
      if (this.tiles.has(key)) {
        const t = this.tiles.get(key);
        this.selectedTile = t.tileId;
        this.currentLayer = t.layer;
        this.renderPalette();
        return;
      }
    }
  }

  renderPalette() {
    const list = this.panel.querySelector('#ed-palette-list');
    list.innerHTML = '';

    const filtered = this.palette.filter((p) => p.layer === this.currentLayer || p.id === 'void');
    filtered.forEach((item) => {
      const row = document.createElement('div');
      const isSel = this.selectedTile === item.id;
      row.style.cssText = `
        display: flex; align-items: center; gap: 8px; padding: 4px 6px;
        background: ${isSel ? '#2e264d' : '#141124'}; border: 1px solid ${isSel ? '#818cf8' : '#251e3a'};
        border-radius: 4px; cursor: pointer; font-size: 10px;
      `;
      row.innerHTML = `
        <div style="width: 12px; height: 12px; background: ${item.color}; border: 1px solid #fff; border-radius: 2px;"></div>
        <span style="color: ${isSel ? '#ffd700' : '#e2e8f0'};">${item.name}</span>
      `;
      row.onclick = () => {
        this.selectedTile = item.id;
        this.renderPalette();
      };
      list.appendChild(row);
    });
  }

  // Загрузка готового массива тайлов или парсинг текста из файла
  importCode(rawCode) {
    try {
      let arrayText = rawCode.trim();
      const match = arrayText.match(/\[\s*\{[\s\S]*\}\s*\]/);
      if (match) {
        arrayText = match[0];
      }
      const parsed = JSON.parse(arrayText);
      if (Array.isArray(parsed)) {
        this.loadTilesArray(parsed);
      }
    } catch (err) {
      alert('Ошибка при чтении кода. Убедись, что скопирован массив JSON объектов [ { ... } ]');
    }
  }

  loadTilesArray(tileArray) {
    this.tiles.clear();
    tileArray.forEach((t) => {
      const key = `${t.x}_${t.y}_${t.layer}`;
      this.tiles.set(key, t);
    });
  }

  toggle(forceState) {
    this.isActive = forceState !== undefined ? forceState : !this.isActive;
    this.panel.style.display = this.isActive ? 'flex' : 'none';

    if (this.isActive) {
      const curWorld = this.getWorld ? this.getWorld() : 'unknown';
      this.panel.querySelector('#ed-world-name').textContent = curWorld.toUpperCase();
    }
  }

  renderOverlay(ctx, camera) {
    // 1. Отрисовка тайлов карты
    this.renderTilesOnly(ctx);

    if (!this.isActive) return;

    // 2. Сетка 32x32
    ctx.save();
    ctx.strokeStyle = 'rgba(129, 140, 248, 0.2)';
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

    // 3. Подсветка активной ячейки под курсором
    const hx = this.hoverCell.x * this.cellSize;
    const hy = this.hoverCell.y * this.cellSize;
    ctx.fillStyle = 'rgba(129, 140, 248, 0.35)';
    ctx.fillRect(hx, hy, this.cellSize, this.cellSize);
    ctx.strokeStyle = '#818cf8';
    ctx.lineWidth = 1.5 / camera.zoom;
    ctx.strokeRect(hx, hy, this.cellSize, this.cellSize);

    // 4. Подсветка прямоугольника (если рисуем областью Box)
    if (this.isMouseDown && this.currentTool === 'box' && this.boxStart) {
      const minX = Math.min(this.boxStart.x, this.hoverCell.x) * this.cellSize;
      const maxX = (Math.max(this.boxStart.x, this.hoverCell.x) + 1) * this.cellSize;
      const minY = Math.min(this.boxStart.y, this.hoverCell.y) * this.cellSize;
      const maxY = (Math.max(this.boxStart.y, this.hoverCell.y) + 1) * this.cellSize;
      ctx.fillStyle = 'rgba(99, 102, 241, 0.3)';
      ctx.fillRect(minX, minY, maxX - minX, maxY - minY);
      ctx.strokeStyle = '#ffd700';
      ctx.strokeRect(minX, minY, maxX - minX, maxY - minY);
    }

    ctx.restore();
  }

  renderTilesOnly(ctx) {
    ctx.save();
    this.tiles.forEach((t) => {
      const rx = t.x * this.cellSize;
      const ry = t.y * this.cellSize;
      const item = this.palette.find((p) => p.id === t.tileId);

      if (t.layer === 0) {
        ctx.fillStyle = item ? item.color : '#1e1b2e';
        ctx.fillRect(rx, ry, this.cellSize, this.cellSize);
      } else if (t.layer === 1) {
        ctx.fillStyle = item ? item.color : '#6366f1';
        ctx.fillRect(rx + 2, ry + 2, this.cellSize - 4, this.cellSize - 4);
      } else if (t.layer === 2) {
        // Обозначение коллизии
        ctx.fillStyle = 'rgba(239, 68, 68, 0.4)';
        ctx.fillRect(rx, ry, this.cellSize, this.cellSize);
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