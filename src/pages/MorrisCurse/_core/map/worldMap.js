import { mobHomes } from '../../../../../server/meta/mobHome.ts';
// Большая карта мира (клавиша M, кнопка 🗺 у мини-карты): на весь экран, открывается приближенной вокруг игрока,
// перетаскивание/колесо/щипок, туман войны (чёрное — не разведано), объекты из реестра (server/meta/markers.ts) —
// только в разведанных местах. Подложка — арт художника v5 (map/mapArt.js: 4096 десктоп / 2048 мобильные).
import { mapImage, drawMarkerIcon, drawFog } from './mapArt.js';
import { markersOf, MARKER_STYLE, bossStatus } from '../../../../../server/meta/markers.ts';
import { WORLD_SIZES } from '../../../../../server/worlds/sizes.ts';
import { fog } from './fog.js';
import { FOG_N, getBit } from '../../../../../server/meta/explore.ts';
import { esc } from '../ui/overlay.js';
import { biomeLabels, drawBiomeLabel, placeLabels } from './biomeLabels.js';
import { regionsLayer } from '../ui/regionMap.js';
import { marks, drawMark, MARK_NAME_MAX } from './marks.js';

const url = (s) => (typeof s === 'object' && s !== null ? (s.src || s.default || '') : s);
export class WorldMap {
  constructor(parent, getState) {
    this.getState = getState; this.isOpen = false;
    const el = this.el = document.createElement('div');
    el.className = 'mc-worldmap'; el.style.display = 'none';
    el.innerHTML = `<canvas></canvas><div class="wm-top"><b>Карта мира</b> <span class="wm-info"></span><span class="wm-sp"></span>
      <button data-mk="1" class="wm-bm on" title="Показать/скрыть мои метки">📍 Метки</button><button data-mkadd="1" class="wm-bm" title="Поставить метку (или правый клик по карте)">＋📍</button><button data-bm="1" class="wm-bm" title="Карта биомов (N)">🧭 Биомы</button><button data-z="1">＋</button><button data-z="-1">－</button><button data-c="1" title="К герою">◎</button><button class="wm-x" title="Закрыть (M / Esc)">✕</button></div>
      <div class="wm-tip"></div><div class="wm-pop"></div>`;
    parent.appendChild(el);
    this.cv = el.querySelector('canvas'); this.ctx = this.cv.getContext('2d');
    this.tip = el.querySelector('.wm-tip'); this.info = el.querySelector('.wm-info');
    el.querySelector('.wm-x').onclick = () => this.close();
    el.querySelectorAll('[data-z]').forEach((b) => (b.onclick = () => this.zoomBy(Number(b.dataset.z) > 0 ? 1.5 : 1 / 1.5)));
    el.querySelector('[data-c]').onclick = () => this.center();
    this.pop = el.querySelector('.wm-pop'); this.addMode = false;
    this.mkBtn = el.querySelector('[data-mk]'); this.mkBtn.onclick = () => { marks.show = !marks.show; this.mkBtn.classList.toggle('on', marks.show); this.closePop(); this.draw(); };
    this.addBtn = el.querySelector('[data-mkadd]'); this.addBtn.onclick = () => { this.addMode = !this.addMode; this.addBtn.classList.toggle('on', this.addMode); };
    this.cv.addEventListener('contextmenu', (e) => { e.preventDefault(); this.askAdd(e.offsetX, e.offsetY); });
    this.biome = false; this.bmBtn = el.querySelector('[data-bm]'); this.bmBtn.onclick = () => this.toggleBiome();
    const pts = new Map(); let pinch = 0;
    this.cv.addEventListener('pointerdown', (e) => { if (e.button === 2) return; pts.set(e.pointerId, { x: e.clientX, y: e.clientY }); this._down = { x: e.clientX, y: e.clientY, ox: e.offsetX, oy: e.offsetY, moved: false }; this.cv.setPointerCapture(e.pointerId); });
    this.cv.addEventListener('pointermove', (e) => {
      const p = pts.get(e.pointerId);
      if (!p) { this.hover(e.offsetX, e.offsetY); return; }
      if (pts.size === 2) {
        const [a, b] = [...pts.values()]; const d0 = Math.hypot(a.x - b.x, a.y - b.y);
        p.x = e.clientX; p.y = e.clientY; const [c, d] = [...pts.values()]; const d1 = Math.hypot(c.x - d.x, c.y - d.y);
        if (pinch && d0) this.zoomBy(d1 / d0); pinch = 1; return;
      }
      if (this._down && Math.hypot(e.clientX - this._down.x, e.clientY - this._down.y) > 5) this._down.moved = true;
      this.cx -= (e.clientX - p.x) / this.k; this.cy -= (e.clientY - p.y) / this.k; p.x = e.clientX; p.y = e.clientY; this.draw();
    });
    const up = (e) => { const d = this._down; pts.delete(e.pointerId); if (pts.size < 2) pinch = 0; if (e.type === 'pointerup' && d && !d.moved && pts.size === 0) this.tap(d.ox, d.oy); this._down = null; };
    this.cv.addEventListener('pointerup', up); this.cv.addEventListener('pointercancel', up);
    this.cv.addEventListener('wheel', (e) => { e.preventDefault(); this.zoomBy(e.deltaY < 0 ? 1.25 : 0.8); }, { passive: false });
    window.addEventListener('resize', () => this.isOpen && this.fit());
  }
  get world() { return this.getState().world || 'hellfire'; }
  fit() { const r = this.el.getBoundingClientRect(); this.cv.width = r.width; this.cv.height = r.height; this.draw(); }
  open() {
    this.isOpen = true; this.el.style.display = 'block'; clearInterval(this._tick); this._tick = setInterval(() => this.isOpen && this.draw(), 1000); // таймеры боссов
    this.fit();
    const S = WORLD_SIZES[this.world] || 1200;
    this.minK = Math.min(this.cv.width, this.cv.height) / S * 0.9;
    this.k = Math.max(this.minK, 0.06); // приближено: ~16000 px мира на экран 1000 px
    this.center();
  }
  close() { this.closePop?.(); clearInterval(this._tick); this.isOpen = false; this.el.style.display = 'none'; this.tip.style.display = 'none'; }
  toggle() { this.isOpen ? this.close() : this.open(); }
  /** «карта биомов»: регионы цветом биома + подписи «биом · ур. мобов» (только разведанное); выкл — обычная карта */
  toggleBiome(on = !this.biome) { this.biome = !!on; this.bmBtn.classList.toggle('on', this.biome); this.draw(); }
  center() { const p = this.getState().me || { x: 0, y: 0 }; this.cx = p.x; this.cy = p.y; this.draw(); }
  zoomBy(f) { this.k = Math.max(this.minK || 0.01, Math.min(1.5, this.k * f)); this.draw(); }
  toWorld(sx, sy) { return [this.cx + (sx - this.cv.width / 2) / this.k, this.cy + (sy - this.cv.height / 2) / this.k]; }
  myMarks() { return marks.show && marks.world === this.world ? marks.list : []; }
  markAt(sx, sy) { return this.myMarks().find((m) => { const [x, y] = this.toScreen(m.x, m.y); return Math.abs(sx - (x + 6)) < 12 && sy > y - 20 && sy < y + 6; }); }
  tap(sx, sy) {
    if (this.addMode) { this.addMode = false; this.addBtn.classList.remove('on'); this.askAdd(sx, sy); return; }
    const m = this.markAt(sx, sy); if (m) this.showMark(m, sx, sy); else this.closePop();
  }
  closePop() { this.pop.style.display = 'none'; this.pop.innerHTML = ''; this.popFor = null; }
  placePop(sx, sy) { this.pop.style.display = 'block'; this.pop.style.left = Math.min(this.cv.width - 250, Math.max(8, sx + 12)) + 'px'; this.pop.style.top = Math.min(this.cv.height - 120, Math.max(60, sy - 10)) + 'px'; }
  askAdd(sx, sy) {
    const [wx, wy] = this.toWorld(sx, sy), S = WORLD_SIZES[this.world] || 1200; if (wx < 0 || wy < 0 || wx > S || wy > S) return;
    if (marks.list.length >= 200) { this.pop.innerHTML = '<b>Не больше 200 меток</b>'; this.placePop(sx, sy); return; }
    this.popFor = 'new'; this.pop.innerHTML = `<b>Новая метка</b><input type="text" maxlength="${MARK_NAME_MAX}" placeholder="Название (до ${MARK_NAME_MAX} симв.)"><div><button data-ok>Сохранить</button><button data-no>Отмена</button></div>`;
    this.placePop(sx, sy); const inp = this.pop.querySelector('input'); inp.focus();
    const ok = () => { const n = inp.value.trim().slice(0, MARK_NAME_MAX); this.send?.({ type: 'mark_add', x: Math.round(wx), y: Math.round(wy), n }); this.closePop(); };
    this.pop.querySelector('[data-ok]').onclick = ok; this.pop.querySelector('[data-no]').onclick = () => this.closePop();
    inp.onkeydown = (e) => { e.stopPropagation(); if (e.key === 'Enter') ok(); if (e.key === 'Escape') this.closePop(); };
  }
  showMark(m, sx, sy) {
    this.popFor = m.id; this.pop.innerHTML = `<b>📍 ${esc(m.n)}</b><div><button data-del class="del">Удалить</button><button data-no>Закрыть</button></div>`; this.placePop(sx, sy);
    this.pop.querySelector('[data-del]').onclick = () => { this.send?.({ type: 'mark_del', id: m.id }); this.closePop(); };
    this.pop.querySelector('[data-no]').onclick = () => this.closePop();
  }
  toScreen(x, y) { return [this.cv.width / 2 + (x - this.cx) * this.k, this.cv.height / 2 + (y - this.cy) * this.k]; }
  visibleMarkers() { const w = this.world; return markersOf(w).filter((m) => fog.seen(w, m.x, m.y)); }
  hover(sx, sy) {
    const m = this.visibleMarkers().find((m) => { const [x, y] = this.toScreen(m.x, m.y); return Math.hypot(sx - x, sy - y) < 12; });
    if (!m) { this.tip.style.display = 'none'; return; }
    this.tip.style.display = 'block'; this.tip.style.left = sx + 14 + 'px'; this.tip.style.top = sy + 'px'; { const bs = bossStatus(m); this.tip.innerHTML = esc(m.label) + (bs ? `<br><b style="color:${bs.alive ? '#fca5a5' : '#d1d5db'}">${bs.alive ? '☠ Босс жив — можно идти' : '⏳ Возродится через ' + esc(bs.text)}</b>` : ''); }
  }
  draw() {
    if (!this.isOpen) return;
    const ctx = this.ctx, W = this.cv.width, H = this.cv.height, w = this.world, S = WORLD_SIZES[w] || 1200;
    const st = this.getState();
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
    const [x0, y0] = this.toScreen(0, 0), sz = S * this.k;
    const img = w === 'arinar' ? mapImage(true) : null;
    if (img && !img.complete) img.onload = () => this.draw();
    ctx.imageSmoothingEnabled = this.k < 4096 / (WORLD_SIZES.arinar || 48000); // крупно — пиксели арта чёткие
    if (img && img.complete && img.naturalWidth) ctx.drawImage(img, x0, y0, sz, sz);
    else { ctx.fillStyle = '#1b1530'; ctx.fillRect(x0, y0, sz, sz); }
    if (this.biome && w === 'arinar') { ctx.save(); ctx.imageSmoothingEnabled = false; ctx.globalAlpha = 0.85; ctx.drawImage(regionsLayer(1024), x0, y0, sz, sz); ctx.restore(); } // цвет биома — под туманом
    if (fog.active(w)) drawFog(ctx, fog, x0, y0, sz, FOG_N, getBit); // чёрное с облаками — неразведанное
    ctx.strokeStyle = '#c59b27'; ctx.lineWidth = 2; ctx.strokeRect(x0, y0, sz, sz);
    ctx.font = '14px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const ms = this.visibleMarkers();
    for (const m of ms) {
      const [x, y] = this.toScreen(m.x, m.y); if (x < -20 || y < -20 || x > W + 20 || y > H + 20) continue;
      const stl = MARKER_STYLE[m.type] || {};
      if (!drawMarkerIcon(ctx, m.type, x, y, this.k > 0.05 ? 32 : 16)) {
        ctx.fillStyle = 'rgba(10,6,20,.75)'; ctx.beginPath(); ctx.arc(x, y, 10, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = m.color || stl.color || '#fff'; ctx.lineWidth = 1.5; ctx.stroke();
        ctx.fillStyle = '#fff'; ctx.fillText(m.icon || stl.icon || '•', x, y + 1);
      }
      if (m.type === 'boss') { const bs = bossStatus(m); // мировой босс: «☠ жив» красным / «⏳ 4:12» до возрождения
        if (bs) { const t = bs.alive ? '☠ жив' : '⏳ ' + bs.text; ctx.font = 'bold 12px sans-serif'; const tw = ctx.measureText(t).width + 8;
          if (bs.alive) { ctx.strokeStyle = '#ef4444'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(x, y, 15 + 2 * Math.sin(performance.now() / 220), 0, Math.PI * 2); ctx.stroke(); }
          else { ctx.fillStyle = 'rgba(40,40,48,.55)'; ctx.beginPath(); ctx.arc(x, y, 13, 0, Math.PI * 2); ctx.fill(); }
          ctx.fillStyle = 'rgba(10,6,20,.85)'; ctx.fillRect(x - tw / 2, y + 16, tw, 16); ctx.fillStyle = bs.alive ? '#fca5a5' : '#d1d5db'; ctx.fillText(t, x, y + 24.5); ctx.font = '14px sans-serif'; } }
      if (this.k > 0.12 && m.type === 'sign') { ctx.font = '11px sans-serif'; ctx.fillStyle = '#fde68a'; ctx.fillText(m.label, x, y + 24); ctx.font = '14px sans-serif'; }
    }
    for (const m of st.party || []) { // отряд на карте M — зелёные метки с именем
      const [x, y] = this.toScreen(m.x, m.y);
      ctx.fillStyle = '#4ade80'; ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, 6, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.font = '11px sans-serif'; ctx.fillStyle = '#bbf7d0'; ctx.textAlign = 'center'; ctx.fillText(m.name, x, y - 10); ctx.font = '14px sans-serif';
    }
    const hu = st.hunt; // охота из Бестиария: место обитания (регион) + текущая цель 🎯
    if (hu) { const hs = mobHomes(hu.id).filter((h) => h.world === w); ctx.lineWidth = 2;
      for (const h of hs) { const [x, y] = this.toScreen(h.x, h.y); if (x < -30 || y < -30 || x > W + 30 || y > H + 30) continue; ctx.strokeStyle = 'rgba(74,222,128,.55)'; ctx.setLineDash([4, 4]); ctx.beginPath(); ctx.arc(x, y, Math.max(8, 600 * this.k), 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]); }
      const t = hu.target; if (t && t.world === w) { const [x, y] = this.toScreen(t.x, t.y); ctx.fillStyle = 'rgba(10,30,15,.85)'; ctx.strokeStyle = '#4ade80'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(x, y, 12 + 2 * Math.sin(performance.now() / 220), 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#fff'; ctx.fillText('🎯', x, y + 1); ctx.font = 'bold 12px sans-serif'; const tx = `Охота: ${hu.name}`, tw = ctx.measureText(tx).width + 8; ctx.fillStyle = 'rgba(10,6,20,.85)'; ctx.fillRect(x - tw / 2, y + 16, tw, 16); ctx.fillStyle = '#86efac'; ctx.fillText(tx, x, y + 24.5); ctx.font = '14px sans-serif'; }
      this.stats_hunt = { homes: hs.length, target: !!(t && t.world === w) }; }
    const p = st.me; if (p) {
      const [x, y] = this.toScreen(p.x, p.y);
      if (!drawMarkerIcon(ctx, 'player', x, y, 32)) { ctx.fillStyle = '#ffd700'; ctx.strokeStyle = '#000'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, 6, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); }
    }
    const mk = this.myMarks(); // мои метки (только у владельца — сервер шлёт лишь свои)
    for (const m of mk) { const [x, y] = this.toScreen(m.x, m.y); if (x < -40 || y < -40 || x > W + 40 || y > H + 40) continue; drawMark(ctx, x, y, m.n, this.k, this.popFor === m.id); }
    const bl = this.biome ? biomeLabels(w) : []; let placed = [];
    if (bl.length) { // подписи поверх, но не на иконках: препятствия — игрок, метки, отряд
      const obst = []; if (p) obst.push([...this.toScreen(p.x, p.y), 22]);
      for (const m of ms) obst.push([...this.toScreen(m.x, m.y), this.k > 0.05 ? 18 : 10]);
      for (const m of st.party || []) obst.push([...this.toScreen(m.x, m.y), 12]);
      for (const m of mk) { const [x, y] = this.toScreen(m.x, m.y); obst.push([x + 6, y - 6, 14]); if (this.k > 0.015) for (let dx = -m.n.length * 3.5; dx <= m.n.length * 3.5; dx += 14) obst.push([x + dx, y + 11, 9]); }
      const items = bl.filter((L) => !(this.k < 0.012 && L.cells < 3)).map((L) => { const [x, y] = this.toScreen(L.x, L.y); return { L, x, y }; }).filter((it) => it.x > -150 && it.y > -40 && it.x < W + 150 && it.y < H + 40);
      placed = placeLabels(ctx, items, obst, this.k); for (const it of placed) drawBiomeLabel(ctx, it.x, it.y, it.L, this.k, it.B);
      this._place = { placed: placed.map((it) => ({ x0: it.x - it.B.w / 2, x1: it.x + it.B.w / 2, y0: it.y - it.B.h / 2, y1: it.y + it.B.h / 2 })), obst }; }
    const blN = placed.length;
    this.info.textContent = fog.active(w) ? `разведано ${fog.pct()}% · объектов видно: ${ms.length}` : `объектов: ${ms.length}`;
    this.stats = { marks: mk.length, marksShown: marks.show, k2: this.k, biome: this.biome, overlap: this._place && bl.length ? this._place.placed.some((r) => this._place.obst.some(([x, y, rr]) => x + rr > r.x0 && x - rr < r.x1 && y + rr > r.y0 && y - rr < r.y1)) : false, labels: (this.biome ? biomeLabels(w) : []).map((L) => L.name + (L.sub ? ': ' + L.sub : '') + ' ' + L.lvl.join('-')), labelsDrawn: blN, k: this.k, markers: ms.length, fog: fog.active(w), pct: fog.pct(), hunt: hu ? this.stats_hunt : null };
  }
}
