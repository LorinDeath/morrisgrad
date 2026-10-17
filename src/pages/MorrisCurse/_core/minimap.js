import { goalMatch } from '../../../../server/meta/biomes.ts';
const inTrack = (track, t) => { if (!track) return false; for (const g of track) if (goalMatch(g, t)) return true; return false; };
import { WORLD_GEN } from '../../../../server/meta/zoneGen.ts';
import { fog } from './map/fog.js';
import { markersOf, MARKER_STYLE, bossStatus } from '../../../../server/meta/markers.ts';
import { BIOMES } from '../../../../server/meta/biomes.ts';
import { mapImage, drawMarkerIcon, drawFog } from './map/mapArt.js';
import { FOG_N, getBit } from '../../../../server/meta/explore.ts';
// подложка мини-карты Аринара: регионы цветом биома (240×240, рисуется один раз)
const REG_COL = { grove: '#2f5a3a', meadow: '#4b4a7a', garden: '#6a3a44', waste: '#3a4458', rot: '#3d4426', ridge: '#4a4038', pylon: '#3c3a62', glitch: '#24502e', crater: '#3a3a5a', thin: '#4a4260' };
function arinarMinimapBg(size) {
  const cv = document.createElement('canvas'); cv.width = cv.height = 240;
  const g = cv.getContext('2d'), k = 240 / size;
  for (const r of WORLD_GEN.arinar.regions) {
    const b = r.biome.startsWith('b_') ? BIOMES[r.biome.slice(2)] : null;
    g.fillStyle = b ? b.color : REG_COL[r.biome] || '#333';
    g.globalAlpha = r.id.endsWith('_outer') ? 0.55 : 0.8;
    g.fillRect(r.rect[0] * k, r.rect[1] * k, (r.rect[2] - r.rect[0]) * k, (r.rect[3] - r.rect[1]) * k);
  }
  g.globalAlpha = 1; g.fillStyle = '#fde68a'; g.beginPath(); g.arc(120, 120, 3, 0, Math.PI * 2); g.fill(); // хаб
  return cv;
}
// Аринар: мини-карта = область камеры (VIEW_CELLS в sizes.ts) × запас; +/- меняют зум камеры (общий с колесом/щипком)
export const MINIMAP_MARGIN = 1.3;
const CELL_PX = 32;
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
          <button id="mm-btn-art" class="mm-btn mm-art" title="Мини-карта: простая / рисованная">🎨</button>
          <button id="mm-btn-map" class="mm-btn mm-map" title="Карта мира (M)">🗺</button>
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

    // вид мини-карты: plain — простая (без раскраски биомов), art — рисованная карта художника (под туманом)
    this.style = (() => { try { return localStorage.getItem('mc_mm_style') || 'plain'; } catch { return 'plain'; } })();
    const artBtn = this.container.querySelector('#mm-btn-art');
    const syncArt = () => { artBtn.classList.toggle('mm-art-on', this.style === 'art'); artBtn.title = this.style === 'art' ? 'Мини-карта: рисованная (нажмите — простая)' : 'Мини-карта: простая (нажмите — рисованная)'; };
    artBtn.onclick = (e) => { e.stopPropagation(); this.style = this.style === 'art' ? 'plain' : 'art'; try { localStorage.setItem('mc_mm_style', this.style); } catch {} syncArt(); };
    syncArt();
    this.container.querySelector('#mm-btn-map').onclick = (e) => { e.stopPropagation(); this.onOpenMap?.(); };
    const minusBtn = this.container.querySelector('#mm-btn-minus');
    const plusBtn = this.container.querySelector('#mm-btn-plus');
    const zoomText = this.zoomText = this.container.querySelector('#mm-zoom-text');

    minusBtn.onclick = () => {
      if (this.getCamCells?.()) { this.onZoom?.(1 / 1.25); return; }
      if (this.zoomIndex > 0) {
        this.zoomIndex--;
        zoomText.textContent = this.zoomLabels[this.zoomIndex];
      }
    };

    plusBtn.onclick = () => {
      if (this.getCamCells?.()) { this.onZoom?.(1.25); return; }
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

  update({ player, otherPlayers, boss, worldPortals, worldSize = 1200, lastFaceDir = { x: 0, y: 1 }, currentWorld = 'hellfire', mobs = null, mobInfo = {}, camps = null, track = null, party = null, hunt = null }) {
    if (!this.ctx || !this.canvas) return;
    const now = performance.now();
    if (now - (this._drawAt || 0) < 120) return;   // троттлинг перерисовки (~8 Гц)
    this._drawAt = now;

    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;
    const cx = w / 2;
    const cy = h / 2;
    const isArinar = currentWorld === 'arinar';
    // Аринар 48000 px: свой масштаб (весь мир → обзор края → окрестности) и подложка биомов
    const camCells = isArinar && worldSize > 4000 ? this.getCamCells?.() || 60 : 0;
    if (camCells && this.zoomText) { const t = String(Math.round(camCells)); if (this.zoomText.textContent !== t) { this.zoomText.textContent = t; this.zoomText.title = 'Обзор камеры, клеток'; } }
    const scale = camCells ? w / (camCells * MINIMAP_MARGIN * CELL_PX) : this.zoomLevels[this.zoomIndex]; // Аринар: область камеры ×1.3 (весь мир — только на карте M)
    this.stats = { mode: 'world', world: currentWorld, style: this.style, span: Math.round(w / scale), cam: Math.round(this.getCamCells?.() || 0), mobs: 0, bosses: 0, players: 0 };

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
    if (isArinar && worldSize > 4000 && this.style === 'art') { // рисованная карта (туман — ниже, поверх)
      const art = mapImage(false);
      if (art.complete && art.naturalWidth) { ctx.imageSmoothingEnabled = false; ctx.drawImage(art, mapWorldX, mapWorldY, mapWorldSize, mapWorldSize); }
    } // простая: без раскраски биомов — только тёмная подложка и сетка чанков

    // Сетка локации
    ctx.strokeStyle = isArinar ? 'rgba(129, 140, 248, 0.12)' : 'rgba(212, 175, 55, 0.08)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    const step = worldSize > 4000 ? 2000 : 128; // сетка: чанки WORLD_CHUNK в Аринаре
    for (let gx = 0; gx <= worldSize; gx += step) {
      const rx = mapWorldX + gx * scale;
      ctx.moveTo(rx, mapWorldY);
      ctx.lineTo(rx, mapWorldY + mapWorldSize);
    }
    for (let gy = 0; gy <= worldSize; gy += step) {
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

    // 3a. Туман войны (как на большой карте): неразведанное — чёрным
    if (fog.active(currentWorld)) drawFog(ctx, fog, mapWorldX, mapWorldY, mapWorldSize, FOG_N, getBit);
    // 3b. Объекты реестра карты (таблички, логова боссов, NPC… — server/meta/markers.ts), только разведанные
    this.stats.markers = 0;
    for (const m of markersOf(currentWorld)) {
      if (m.type === 'portal' || !fog.seen(currentWorld, m.x, m.y)) continue; // порталы рисуются ниже своим стилем
      const bx = cx + (m.x - player.x) * scale, by = cy + (m.y - player.y) * scale;
      if (bx < -4 || by < -4 || bx > w + 4 || by > h + 4) continue;
      this.stats.markers++;
      const col = m.color || MARKER_STYLE[m.type]?.color || '#fff';
      ctx.strokeStyle = col; ctx.lineWidth = 1;
      if (m.type === 'boss') { // мировой босс: живой — красное пульсирующее кольцо, мёртвый — серый с таймером
        const bs = bossStatus(m);
        if (this.style !== 'art' || !drawMarkerIcon(ctx, m.type, bx, by, 16)) { ctx.fillStyle = bs?.alive ? '#ef4444' : '#6b7280'; ctx.font = '11px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('☠', bx, by); }
        if (bs?.alive) { const pu = 5 + 2 * Math.sin(performance.now() / 220); ctx.strokeStyle = '#ef4444'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(bx, by, pu + 3, 0, Math.PI * 2); ctx.stroke(); }
        else if (bs) { ctx.fillStyle = 'rgba(0,0,0,.55)'; ctx.beginPath(); ctx.arc(bx, by, 6, 0, Math.PI * 2); ctx.fill(); ctx.font = 'bold 8px monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ctx.lineWidth = 2; ctx.strokeStyle = '#000'; ctx.strokeText(bs.text, bx, by + 7); ctx.fillStyle = '#d1d5db'; ctx.fillText(bs.text, bx, by + 7); }
        continue;
      }
      if (this.style === 'art' && drawMarkerIcon(ctx, m.type, bx, by, 16)) continue;
      if (m.type === 'sign') { ctx.fillStyle = col; ctx.fillRect(bx - 2, by - 3, 4, 3); ctx.fillRect(bx - 0.5, by, 1, 3); }
      else { ctx.beginPath(); ctx.arc(bx, by, 3, 0, Math.PI * 2); ctx.stroke(); }
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

    // 4a. Лагеря: круг = зона агро (радиус разброса пачки + агро самого «чуткого» моба); цвет — активность:
    // бой — красный, спит — оранжевый, пусто (ждёт респавна) — серый пунктир; лагерь с целью квеста — зелёный контур
    if (camps) {
      const isT = (t) => inTrack(track, t);
      for (const c of camps) {
        const x = cx + (c[1] - player.x) * scale, y = cy + (c[2] - player.y) * scale, r = Math.max(3, c[6] * scale);
        if (x < -r || y < -r || x > w + r || y > h + r) continue;
        this.stats.camps = (this.stats.camps || 0) + 1;
        const st = c[5], tg = c[7]?.some(isT);
        ctx.setLineDash(st === 2 ? [3, 3] : []);
        ctx.fillStyle = st === 1 ? 'rgba(239,68,68,0.18)' : st === 0 ? 'rgba(251,146,60,0.12)' : 'rgba(148,163,184,0.06)';
        ctx.strokeStyle = tg ? '#4ade80' : st === 1 ? '#ef4444' : st === 0 ? '#fb923c' : '#64748b';
        ctx.lineWidth = tg ? 1.6 : 1;
        ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = ctx.strokeStyle; ctx.font = '8px monospace'; ctx.textAlign = 'center';
        if (r > 8) ctx.fillText(`⛺${c[3]}/${c[4]}`, x, y + 3);
      }
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
        } else if (m.cursed) { ctx.fillStyle = '#a855f7'; ctx.fillRect(mx - 2, my - 2, 4, 4); }
        else if (m.elite) { ctx.fillStyle = '#facc15'; ctx.fillRect(mx - 2, my - 2, 4, 4); }
        else { ctx.fillStyle = '#ef4444'; ctx.fillRect(mx - 1.5, my - 1.5, 3, 3); }
        if (inTrack(track, m.type)) { this.stats.track = (this.stats.track || 0) + 1; ctx.strokeStyle = '#4ade80'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(mx, my, 4, 0, Math.PI * 2); ctx.stroke(); } // цель квеста
      }
    }

    // 4c. Охота из Бестиария: 🎯 к цели (живой моб / лагерь / место обитания / портал); за краем — на краю, по направлению
    if (hunt && hunt.world === currentWorld) {
      let hx = cx + (hunt.x - player.x) * scale, hy = cy + (hunt.y - player.y) * scale; const m = 7;
      const edge = hx < m || hy < m || hx > w - m || hy > h - m;
      if (edge) { const dx = hx - cx, dy = hy - cy, k = Math.min((w / 2 - m) / Math.abs(dx || 1e-6), (h / 2 - m) / Math.abs(dy || 1e-6)); hx = cx + dx * k; hy = cy + dy * k; }
      ctx.fillStyle = 'rgba(10,30,15,.85)'; ctx.strokeStyle = '#4ade80'; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.arc(hx, hy, 5.5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#4ade80'; ctx.beginPath(); ctx.arc(hx, hy, 2, 0, Math.PI * 2); ctx.fill();
      this.stats.hunt = edge ? 'edge' : 'in';
    } else this.stats.hunt = null;
    // 5. Другие игроки (текущего мира; без поля world — считаем, что в нашем): единый цвет «союзник» — голубой с белым контуром,
    // чтобы не путать с мобами и собой (золотой)
    // 5a. Отряд: зелёные с белым контуром (позиции с сервера — видны и вне области видимости), стрелка у края, если далеко
    const pset = new Set((party || []).map((m) => m.sid));
    for (const m of party || []) {
      if (m.world !== currentWorld || m.run) continue;
      this.stats.party = (this.stats.party || 0) + 1;
      let ox = cx + (m.x - player.x) * scale, oy = cy + (m.y - player.y) * scale;
      const out = ox < 4 || oy < 4 || ox > w - 4 || oy > h - 4;
      if (out) { const k = Math.min((w / 2 - 6) / Math.abs(ox - cx || 1), (h / 2 - 6) / Math.abs(oy - cy || 1)); ox = cx + (ox - cx) * k; oy = cy + (oy - cy) * k; }
      ctx.fillStyle = '#4ade80'; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.arc(ox, oy, out ? 3 : 4, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    }
    if (this.filters.players && otherPlayers) {
      otherPlayers.forEach((p) => {
        if ((p.world || currentWorld) !== currentWorld) return;
        if (pset.has(p.id) || pset.has(p.sid)) return; // уже нарисован как союзник
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
    // тёмная карта забега (как тёмная арена): фон почти чёрный, обод приглушён — точки игроков/мобов читаются
    ctx.fillStyle = '#020104';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#07050c';
    ctx.strokeStyle = 'rgba(197,155,39,0.55)';
    ctx.lineWidth = 1;
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
      const r = e.elite ? 4 : 3; // точка с тёмной обводкой — не сливается в «кашу» при толпе
      ctx.fillStyle = '#000'; ctx.fillRect(X(e.x) - r / 2 - 0.5, Y(e.z) - r / 2 - 0.5, r + 1, r + 1);
      ctx.fillStyle = e.elite ? '#facc15' : '#ff4d4d';
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
    ctx.beginPath(); ctx.arc(X(m.x), Y(m.z), 4.5, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.restore();
  }
}
