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

  update({ player, otherPlayers, boss, worldPortals, worldSize = 1200, lastFaceDir = { x: 0, y: 1 }, currentWorld = 'hellfire', mobs = null, mobInfo = {} }) {
    if (!this.ctx || !this.canvas) return;
    const now = performance.now();
    if (now - (this._drawAt || 0) < 120) return;   // троттлинг перерисовки (~8 Гц)
    this._drawAt = now;

    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;
    const cx = w / 2;
    const cy = h / 2;
    const scale = this.zoomLevels[this.zoomIndex];
    const isArinar = currentWorld === 'arinar';
    this.stats = { mode: 'world', world: currentWorld, mobs: 0, bosses: 0, players: 0 };

    ctx.save();
    ctx.clearRect(0, 0, w, h);

    ctx.beginPath();
    ctx.rect(0, 0, w, h);
    ctx.clip();

    // 1. Космос за стенами
    ctx.fillStyle = isArinar ? '#020108' : '#05030a';
    ctx.fillRect(0, 0, w, h);

    // 2. Игровой мир
    const mapWorldX = cx + (0 - player.x) * scale;
    const mapWorldY = cy + (0 - player.y) * scale;
    const mapWorldSize = worldSize * scale;

    ctx.fillStyle = isArinar ? '#08051a' : '#0f0b1a';
    ctx.fillRect(mapWorldX, mapWorldY, mapWorldSize, mapWorldSize);

    // Сетка локации
    ctx.strokeStyle = isArinar ? 'rgba(129, 140, 248, 0.12)' : 'rgba(212, 175, 55, 0.08)';
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

    // Граница мира
    ctx.strokeStyle = isArinar ? '#818cf8' : '#c59b27';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(mapWorldX, mapWorldY, mapWorldSize, mapWorldSize);

    // 3. Порталы (СТРОГО текущего мира)
    if (this.filters.portals && worldPortals) {
      worldPortals.forEach((portal) => {
        if ((portal.world || 'hellfire') !== currentWorld) return;

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
        } else if (portal.id === 'portal_arinar') {
          // Иконка бабочки/портала в Аринар
          ctx.fillStyle = '#818cf8';
          ctx.beginPath();
          ctx.arc(px, py, 3.5, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = '#c084fc';
          ctx.lineWidth = 1;
          ctx.stroke();
        } else if (portal.id === 'portal_hellfire') {
          // Иконка возврата в Ад
          ctx.fillStyle = '#f97316';
          ctx.beginPath();
          ctx.arc(px, py, 3.5, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = '#ffd700';
          ctx.lineWidth = 1;
          ctx.stroke();
        } else {
          ctx.fillStyle = portal.color || '#38bdf8';
          ctx.beginPath();
          ctx.arc(px, py, 3, 0, Math.PI * 2);
          ctx.fill();
        }
      });
    }

    // 4. Метка Кейт (ТОЛЬКО в Аду)
    if (!isArinar && boss && boss.state !== 'dead' && boss.x > 0) {
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

    // 4b. Мобы открытого мира (все известные клиенту — зона присылает их по области видимости): обычные — красные точки,
    // элита — жёлтые, боссы — крупный пурпурный ромб с белым контуром
    if (mobs) {
      for (const m of mobs.values()) {
        const mx = cx + (m.x - player.x) * scale, my = cy + (m.y - player.y) * scale;
        if (mx < -6 || my < -6 || mx > w + 6 || my > h + 6) continue;
        this.stats.mobs++;
        if (mobInfo[m.type]?.boss) {
          this.stats.bosses++;
          ctx.fillStyle = '#e879f9'; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1;
          ctx.beginPath(); ctx.moveTo(mx, my - 5); ctx.lineTo(mx + 5, my); ctx.lineTo(mx, my + 5); ctx.lineTo(mx - 5, my); ctx.closePath(); ctx.fill(); ctx.stroke();
        } else if (m.elite) { ctx.fillStyle = '#facc15'; ctx.fillRect(mx - 2, my - 2, 4, 4); }
        else { ctx.fillStyle = '#ef4444'; ctx.fillRect(mx - 1.5, my - 1.5, 3, 3); }
      }
    }

    // 5. Другие игроки (текущего мира; без поля world — считаем, что в нашем): единый цвет «союзник» — голубой с белым контуром,
    // чтобы не путать с мобами и собой (золотой)
    if (this.filters.players && otherPlayers) {
      otherPlayers.forEach((p) => {
        if ((p.world || currentWorld) !== currentWorld) return;
        this.stats.players++;
        const ox = cx + (p.x - player.x) * scale;
        const oy = cy + (p.y - player.y) * scale;
        ctx.fillStyle = '#38bdf8';
        ctx.beginPath();
        ctx.arc(ox, oy, 3.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
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

    ctx.strokeStyle = isArinar ? '#38bdf8' : '#ffd700';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + (nx / norm) * dirLen, cy + (ny / norm) * dirLen);
    ctx.stroke();

    ctx.restore();
  }

  // Мини-карта забега: круглая арена (метры), орда, камни опыта, союзники
  updateRun(run, arenaRadius = 60) {
    if (!this.ctx || !this.canvas) return;
    // троттлинг: не чаще ~8 раз/с, даже если HUD обновляется чаще
    const now = performance.now();
    if (now - (this._runDrawAt || 0) < 120) return;
    this._runDrawAt = now;
    const ctx = this.ctx;
    const w = this.canvas.width, h = this.canvas.height, cx = w / 2, cy = h / 2;
    const scale = (Math.min(w, h) / 2 - 4) / arenaRadius * [1, 1.8, 3][this.zoomIndex];
    const m = run.me;
    const fx = this.zoomIndex === 0 ? 0 : m.x, fz = this.zoomIndex === 0 ? 0 : m.z;
    const X = (x) => cx + (x - fx) * scale, Y = (z) => cy + (z - fz) * scale;
    this.stats = { mode: 'run', mobs: 0, bosses: 0, players: 0, chests: 0, gems: 0, heart: 0 };
    ctx.save();
    ctx.fillStyle = '#05030a';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#120c1f';
    ctx.strokeStyle = '#c59b27';
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(X(0), Y(0), arenaRadius * scale, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    // камни/сферы опыта на земле на мини-карту НЕ рисуются (их сотни — лишняя работа и шум)
    for (const e of run.enemies.values()) {
      if (e.dead) continue;
      this.stats.mobs++;
      if (e.boss) {
        this.stats.bosses++;
        const bx = X(e.x), by = Y(e.z);
        ctx.fillStyle = '#e879f9'; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(bx, by - 5); ctx.lineTo(bx + 5, by); ctx.lineTo(bx, by + 5); ctx.lineTo(bx - 5, by); ctx.closePath(); ctx.fill(); ctx.stroke();
        continue;
      }
      ctx.fillStyle = e.elite ? '#facc15' : '#ef4444';
      const r = e.elite ? 3 : 2;
      ctx.fillRect(X(e.x) - r / 2, Y(e.z) - r / 2, r, r);
    }
    for (const p of run.pickups.values()) {
      if (p.kind === 'chest') this.stats.chests++;
      if (p.kind === 'chest') { ctx.fillStyle = '#f59e0b'; ctx.fillRect(X(p.x) - 2.5, Y(p.z) - 2, 5, 4); ctx.fillStyle = '#fde68a'; ctx.fillRect(X(p.x) - 0.5, Y(p.z) - 1, 1, 2); }
      else { ctx.fillStyle = '#4ade80'; ctx.fillRect(X(p.x) - 1.5, Y(p.z) - 1.5, 3, 3); }
    }
    // сердце (испытание Обители) — зелёный крест
    if (run.heart && run.heart.hp > 0) { const hx = X(run.heart.x ?? 0), hz = Y(run.heart.z ?? 0); ctx.fillStyle = '#4ade80'; ctx.fillRect(hx - 4, hz - 1.5, 8, 3); ctx.fillRect(hx - 1.5, hz - 4, 3, 8); this.stats.heart = 1; }
    for (const r of run.remotes.values()) {
      this.stats.players++;
      ctx.fillStyle = r.dead ? '#64748b' : '#38bdf8';
      ctx.beginPath(); ctx.arc(X(r.x), Y(r.z), 3.2, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1; ctx.stroke();
    }
    ctx.fillStyle = '#ffd700';
    ctx.beginPath(); ctx.arc(X(m.x), Y(m.z), 3.5, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
}
