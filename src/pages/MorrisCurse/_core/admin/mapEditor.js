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

    this.tiles = new Map();

    this.currentLayer = 0;
    this.selectedTile = 'platform_star';
    this.currentTool = 'brush';
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
    this.panel.className = 'mc-editor-panel';
    this.panel.style.display = 'none';

    this.panel.innerHTML = `
      <div class="mc-editor-header">
        <span class="mc-editor-title">МАППИНГ // СТУДИЯ</span>
        <button id="ed-close-btn" class="mc-editor-close">✕</button>
      </div>

      <div class="mc-editor-meta">
        <span style="color: #94a3b8;">Мир: <b id="ed-world-name" style="color: #ffd700;">-</b></span>
        <span style="color: #38bdf8;" id="ed-coords">X: 0 | Y: 0</span>
      </div>

      <div style="display: flex; gap: 6px;">
        <button id="ed-sandbox-toggle" class="mc-btn-sandbox">
          🏕️ Песочница (Solo)
        </button>
      </div>

      <div style="display: flex; gap: 4px;">
        <button id="ed-tool-brush" class="mc-btn-tool active">Кисть</button>
        <button id="ed-tool-box" class="mc-btn-tool">Область (Box)</button>
        <button id="ed-tool-erase" class="mc-btn-tool">Ластик</button>
        <button id="ed-clear-all" class="mc-btn-danger">Сброс</button>
      </div>

      <div style="font-size: 11px; color: #a5b4fc;">Слой:</div>
      <div style="display: flex; gap: 4px;">
        <button class="ed-layer-btn mc-btn-tool active" data-layer="0">0: Пол</button>
        <button class="ed-layer-btn mc-btn-tool" data-layer="1">1: Объект</button>
        <button class="ed-layer-btn mc-btn-tool" data-layer="2">2: Стена</button>
      </div>

      <div style="font-size: 11px; color: #a5b4fc;">Элемент палитры:</div>
      <div id="ed-palette-list" class="mc-palette-list"></div>

      <div style="display: flex; flex-direction: column; gap: 6px; border-top: 1px solid #282142; padding-top: 8px;">
        <button id="ed-import-btn" class="mc-btn-tool">
          📥 Загрузить / Вставить код (JS/TS)
        </button>
        <button id="ed-export-btn" class="mc-btn-tool active" style="background: #059669; border-color: #34d399; font-weight: bold;">
          💾 Экспорт карты в файл (.ts)
        </button>
      </div>

      <div id="ed-import-modal" class="mc-import-box" style="display: none;">
        <span style="font-size: 10px; color: #38bdf8;">Вставь массив TileData[] или содержимое файла:</span>
        <textarea id="ed-import-area" class="mc-import-textarea"></textarea>
        <div style="display: flex; gap: 4px;">
          <button id="ed-import-apply" class="mc-btn-tool active" style="background: #2563eb;">Применить</button>
          <button id="ed-import-cancel" class="mc-btn-tool">Отмена</button>
        </div>
      </div>
    `;

    this.container.appendChild(this.panel);
    this.bindEvents();
    this.renderPalette();
  }

  bindEvents() {
    this.panel.querySelector('#ed-close-btn').onclick = () => this.toggle(false);

    const bBrush = this.panel.querySelector('#ed-tool-brush');
    const bBox = this.panel.querySelector('#ed-tool-box');
    const bErase = this.panel.querySelector('#ed-tool-erase');

    const setTool = (tool, btn) => {
      this.currentTool = tool;
      [bBrush, bBox, bErase].forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    };

    bBrush.onclick = () => setTool('brush', bBrush);
    bBox.onclick = () => setTool('box', bBox);
    bErase.onclick = () => setTool('eraser', bErase);

    this.panel.querySelector('#ed-clear-all').onclick = () => {
      if (confirm('Очистить все нарисованные тайлы текущей локации?')) {
        this.tiles.clear();
      }
    };

    const layerBtns = this.panel.querySelectorAll('.ed-layer-btn');
    layerBtns.forEach((btn) => {
      btn.onclick = () => {
        this.currentLayer = Number(btn.dataset.layer);
        layerBtns.forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        this.renderPalette();
      };
    });

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

    this.canvas.addEventListener('mousedown', (e) => {
      if (!this.isActive) return;
      if (e.button === 0) {
        this.isMouseDown = true;
        const cell = this.getCellFromEvent(e);
        if (this.currentTool === 'box') {
          this.boxStart = cell;
        } else {
          this.paintAtCell(cell.x, cell.y);
        }
      } else if (e.button === 1) {
        e.preventDefault();
        this.pickTileAtEvent(e);
      }
    });

    window.addEventListener('mouseup', () => {
      if (!this.isActive) return;
      if (this.isMouseDown && this.currentTool === 'box' && this.boxStart) {
        const cell = this.getCellFromEvent(window.__LAST_MOUSE_EVENT__ || { clientX: 0, clientY: 0 });
        this.fillBox(this.boxStart, cell);
        this.boxStart = null;
      }
      this.isMouseDown = false;
    });

    this.canvas.addEventListener('mousemove', (e) => {
      window.__LAST_MOUSE_EVENT__ = e;
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
      row.className = `mc-palette-item ${isSel ? 'active' : ''}`;
      row.innerHTML = `
        <div class="mc-palette-preview" style="background: ${item.color};"></div>
        <span style="color: ${isSel ? '#ffd700' : '#e2e8f0'};">${item.name}</span>
      `;
      row.onclick = () => {
        this.selectedTile = item.id;
        this.renderPalette();
      };
      list.appendChild(row);
    });
  }

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
    this.renderTilesOnly(ctx);

    if (!this.isActive) return;

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

    const hx = this.hoverCell.x * this.cellSize;
    const hy = this.hoverCell.y * this.cellSize;
    ctx.fillStyle = 'rgba(129, 140, 248, 0.35)';
    ctx.fillRect(hx, hy, this.cellSize, this.cellSize);
    ctx.strokeStyle = '#818cf8';
    ctx.lineWidth = 1.5 / camera.zoom;
    ctx.strokeRect(hx, hy, this.cellSize, this.cellSize);

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