export class Minimap {
  constructor(mountElement) {
    this.mountElement = mountElement;
    this.zoomLevels = [0.15, 0.28, 0.45];
    this.zoomLabels = ['1x', '2x', '3x'];
    this.zoomIndex = 0;

    this.filters = {
      players: true,
      portals: true
    };

    this.mount();
  }

  mount() {
    this.container = document.createElement('div');
    this.container.className = 'hud-card hud-minimap-card';
    this.container.innerHTML = `
      <div class="hud-header" style="display: flex; justify-content: space-between; align-items: center;">
        <span>МИНИ-КАРТА</span>
        <div style="display: flex; align-items: center; gap: 4px;">
          <button id="mm-btn-minus" class="mm-btn">-</button>
          <span id="mm-zoom-text" style="color: #ffd700; font-size: 10px; min-width: 18px; text-align: center;">1x</span>
          <button id="mm-btn-plus" class="mm-btn">+</button>
        </div>
      </div>

      <div style="position: relative; width: 100%; display: flex; justify-content: center; margin: 4px 0;">
        <canvas id="mm-canvas" width="220" height="150" style="background: #07050d; border: 1px solid #3b2c52; border-radius: 4px; display: block; image-rendering: pixelated;"></canvas>
      </div>

      <div style="display: flex; gap: 6px; justify-content: space-between;">
        <button id="mm-toggle-players" class="mm-toggle-btn mm-toggle-active">👥 Игроки</button>
        <button id="mm-toggle-portals" class="mm-toggle-btn mm-toggle-active">🌀 Порталы</button>
      </div>
    `;

    this.mountElement.appendChild(this.container);

    this.canvas = this.container.querySelector('#mm-canvas');
    this.ctx = this.canvas.getContext('2d');

    const minusBtn = this.container.querySelector('#mm-btn-minus');
    const plusBtn = this.container.querySelector('#mm-btn-plus');
    const zoomText = this.container.querySelector('#mm-zoom-text');

    minusBtn.onclick = () => {
      if (this.zoomIndex > 0) {
        this.zoomIndex--;
        zoomText.textContent = this.zoomLabels[this.zoomIndex];
      }
    };

    plusBtn.onclick = () => {
      if (this.zoomIndex < this.zoomLevels.length - 1) {
        this.zoomIndex++;
        zoomText.textContent = this.zoomLabels[this.zoomIndex];
      }
    };

    const playersBtn = this.container.querySelector('#mm-toggle-players');
    const portalsBtn = this.container.querySelector('#mm-toggle-portals');

    playersBtn.onclick = () => {
      this.filters.players = !this.filters.players;
      playersBtn.classList.toggle('mm-toggle-active', this.filters.players);
      playersBtn.classList.toggle('mm-toggle-inactive', !this.filters.players);
    };

    portalsBtn.onclick = () => {
      this.filters.portals = !this.filters.portals;
      portalsBtn.classList.toggle('mm-toggle-active', this.filters.portals);
      portalsBtn.classList.toggle('mm-toggle-inactive', !this.filters.portals);
    };

    this.injectStyles();
  }

  injectStyles() {
    if (document.getElementById('minimap-inline-css')) return;
    const style = document.createElement('style');
    style.id = 'minimap-inline-css';
    style.textContent = `
      .mm-btn {
        background: #1b142c;
        border: 1px solid #c59b27;
        color: #ffd700;
        font-family: monospace;
        font-size: 11px;
        font-weight: bold;
        width: 20px;
        height: 20px;
        line-height: 18px;
        text-align: center;
        border-radius: 3px;
        cursor: pointer;
        padding: 0;
      }
      .mm-btn:hover {
        background: #2a1f45;
        border-color: #ffd700;
      }
      .mm-toggle-btn {
        flex: 1;
        font-family: monospace;
        font-size: 10px;
        padding: 4px 6px;
        border-radius: 4px;
        cursor: pointer;
        transition: all 0.2s;
        border: 1px solid transparent;
      }
      .mm-toggle-active {
        background: #261a45;
        border-color: #8b5cf6;
        color: #e9d5ff;
      }
      .mm-toggle-inactive {
        background: #110d1c;
        border-color: #2b223d;
        color: #64748b;
        opacity: 0.6;
      }
    `;
    document.head.appendChild(style);
  }

  update({ player, otherPlayers, boss, worldPortals, worldSize = 1200, lastFaceDir = { x: 0, y: 1 } }) {
    if (!this.ctx || !this.canvas) return;

    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;
    const cx = w / 2;
    const cy = h / 2;
    const scale = this.zoomLevels[this.zoomIndex];

    ctx.save();
    ctx.clearRect(0, 0, w, h);

    ctx.beginPath();
    ctx.rect(0, 0, w, h);
    ctx.clip();

    // 1. Космос за стенами
    ctx.fillStyle = '#05030a';
    ctx.fillRect(0, 0, w, h);

    // 2. Игровой мир
    const mapWorldX = cx + (0 - player.x) * scale;
    const mapWorldY = cy + (0 - player.y) * scale;
    const mapWorldSize = worldSize * scale;

    ctx.fillStyle = '#0f0b1a';
    ctx.fillRect(mapWorldX, mapWorldY, mapWorldSize, mapWorldSize);

    ctx.strokeStyle = 'rgba(212, 175, 55, 0.08)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let gx = 0; gx <= worldSize; gx += 128) {
      const rx = mapWorldX + gx * scale;
      ctx.moveTo(rx, mapWorldY);
      ctx.lineTo(rx, mapWorldY + mapWorldSize);
    }
    for (let gy = 0; gy <= worldSize; gy += 128) {
      const ry = mapWorldY + gy * scale;
      ctx.moveTo(mapWorldX, ry);
      ctx.lineTo(mapWorldX + mapWorldSize, ry);
    }
    ctx.stroke();

    ctx.strokeStyle = '#c59b27';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(mapWorldX, mapWorldY, mapWorldSize, mapWorldSize);

    // 3. Порталы
    if (this.filters.portals && worldPortals) {
      worldPortals.forEach((portal) => {
        const px = cx + (portal.x - player.x) * scale;
        const py = cy + (portal.y - player.y) * scale;

        if (portal.id === 'portal_class_select') {
          ctx.fillStyle = '#a855f7';
          ctx.beginPath();
          ctx.moveTo(px, py - 4);
          ctx.lineTo(px + 4, py);
          ctx.lineTo(px, py + 4);
          ctx.lineTo(px - 4, py);
          ctx.closePath();
          ctx.fill();

          ctx.strokeStyle = '#f5d77f';
          ctx.lineWidth = 1;
          ctx.stroke();
        } else {
          ctx.fillStyle = '#38bdf8';
          ctx.beginPath();
          ctx.arc(px, py, 3, 0, Math.PI * 2);
          ctx.fill();
        }
      });
    }

    // 4. Метка Кейт (Неоново-розовый босс-маркер)
    if (boss && boss.state !== 'dead') {
      const bx = cx + (boss.x - player.x) * scale;
      const by = cy + (boss.y - player.y) * scale;

      ctx.fillStyle = '#f472b6';
      ctx.beginPath();
      ctx.arc(bx, by, 4.5, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }

    // 5. Другие игроки
    if (this.filters.players && otherPlayers) {
      otherPlayers.forEach((p) => {
        const ox = cx + (p.x - player.x) * scale;
        const oy = cy + (p.y - player.y) * scale;

        ctx.fillStyle = p.color || '#38bdf8';
        ctx.beginPath();
        ctx.arc(ox, oy, 3, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = '#050408';
        ctx.lineWidth = 1;
        ctx.stroke();
      });
    }

    // 6. Игрок
    ctx.fillStyle = '#ffd700';
    ctx.beginPath();
    ctx.arc(cx, cy, 3.5, 0, Math.PI * 2);
    ctx.fill();

    const dirLen = 8;
    const nx = lastFaceDir.x || 0;
    const ny = lastFaceDir.y || 1;
    const norm = Math.hypot(nx, ny) || 1;

    ctx.strokeStyle = '#ffd700';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + (nx / norm) * dirLen, cy + (ny / norm) * dirLen);
    ctx.stroke();

    ctx.restore();
  }
}