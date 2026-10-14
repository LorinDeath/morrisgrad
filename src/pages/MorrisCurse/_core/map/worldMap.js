// Большая карта мира (клавиша M, кнопка 🗺 у мини-карты): на весь экран, открывается приближенной вокруг игрока,
// перетаскивание/колесо/щипок, туман войны (чёрное — не разведано), объекты из реестра (server/meta/markers.ts) —
// только в разведанных местах. Подложка — арт художника v5 (map/mapArt.js: 4096 десктоп / 2048 мобильные).
import { mapImage, drawMarkerIcon, drawFog } from './mapArt.js';
import { markersOf, MARKER_STYLE } from '../../../../../server/meta/markers.ts';
import { WORLD_SIZES } from '../../../../../server/worlds/sizes.ts';
import { fog } from './fog.js';
import { FOG_N, getBit } from '../../../../../server/meta/explore.ts';
import { esc } from '../ui/overlay.js';

const url = (s) => (typeof s === 'object' && s !== null ? (s.src || s.default || '') : s);
export class WorldMap {
  constructor(parent, getState) {
    this.getState = getState; this.isOpen = false;
    const el = this.el = document.createElement('div');
    el.className = 'mc-worldmap'; el.style.display = 'none';
    el.innerHTML = `<canvas></canvas><div class="wm-top"><b>Карта мира</b> <span class="wm-info"></span><span class="wm-sp"></span>
      <button data-z="1">＋</button><button data-z="-1">－</button><button data-c="1" title="К герою">◎</button><button class="wm-x" title="Закрыть (M / Esc)">✕</button></div>
      <div class="wm-tip"></div>`;
    parent.appendChild(el);
    this.cv = el.querySelector('canvas'); this.ctx = this.cv.getContext('2d');
    this.tip = el.querySelector('.wm-tip'); this.info = el.querySelector('.wm-info');
    el.querySelector('.wm-x').onclick = () => this.close();
    el.querySelectorAll('[data-z]').forEach((b) => (b.onclick = () => this.zoomBy(Number(b.dataset.z) > 0 ? 1.5 : 1 / 1.5)));
    el.querySelector('[data-c]').onclick = () => this.center();
    const pts = new Map(); let pinch = 0;
    this.cv.addEventListener('pointerdown', (e) => { pts.set(e.pointerId, { x: e.clientX, y: e.clientY }); this.cv.setPointerCapture(e.pointerId); });
    this.cv.addEventListener('pointermove', (e) => {
      const p = pts.get(e.pointerId);
      if (!p) { this.hover(e.offsetX, e.offsetY); return; }
      if (pts.size === 2) {
        const [a, b] = [...pts.values()]; const d0 = Math.hypot(a.x - b.x, a.y - b.y);
        p.x = e.clientX; p.y = e.clientY; const [c, d] = [...pts.values()]; const d1 = Math.hypot(c.x - d.x, c.y - d.y);
        if (pinch && d0) this.zoomBy(d1 / d0); pinch = 1; return;
      }
      this.cx -= (e.clientX - p.x) / this.k; this.cy -= (e.clientY - p.y) / this.k; p.x = e.clientX; p.y = e.clientY; this.draw();
    });
    const up = (e) => { pts.delete(e.pointerId); if (pts.size < 2) pinch = 0; };
    this.cv.addEventListener('pointerup', up); this.cv.addEventListener('pointercancel', up);
    this.cv.addEventListener('wheel', (e) => { e.preventDefault(); this.zoomBy(e.deltaY < 0 ? 1.25 : 0.8); }, { passive: false });
    window.addEventListener('resize', () => this.isOpen && this.fit());
  }
  get world() { return this.getState().world || 'hellfire'; }
  fit() { const r = this.el.getBoundingClientRect(); this.cv.width = r.width; this.cv.height = r.height; this.draw(); }
  open() {
    this.isOpen = true; this.el.style.display = 'block';
    this.fit();
    const S = WORLD_SIZES[this.world] || 1200;
    this.minK = Math.min(this.cv.width, this.cv.height) / S * 0.9;
    this.k = Math.max(this.minK, 0.06); // приближено: ~16000 px мира на экран 1000 px
    this.center();
  }
  close() { this.isOpen = false; this.el.style.display = 'none'; this.tip.style.display = 'none'; }
  toggle() { this.isOpen ? this.close() : this.open(); }
  center() { const p = this.getState().me || { x: 0, y: 0 }; this.cx = p.x; this.cy = p.y; this.draw(); }
  zoomBy(f) { this.k = Math.max(this.minK || 0.01, Math.min(1.5, this.k * f)); this.draw(); }
  toScreen(x, y) { return [this.cv.width / 2 + (x - this.cx) * this.k, this.cv.height / 2 + (y - this.cy) * this.k]; }
  visibleMarkers() { const w = this.world; return markersOf(w).filter((m) => fog.seen(w, m.x, m.y)); }
  hover(sx, sy) {
    const m = this.visibleMarkers().find((m) => { const [x, y] = this.toScreen(m.x, m.y); return Math.hypot(sx - x, sy - y) < 12; });
    if (!m) { this.tip.style.display = 'none'; return; }
    this.tip.style.display = 'block'; this.tip.style.left = sx + 14 + 'px'; this.tip.style.top = sy + 'px'; this.tip.innerHTML = esc(m.label);
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
      if (this.k > 0.12 && m.type === 'sign') { ctx.font = '11px sans-serif'; ctx.fillStyle = '#fde68a'; ctx.fillText(m.label, x, y + 24); ctx.font = '14px sans-serif'; }
    }
    const p = st.me; if (p) {
      const [x, y] = this.toScreen(p.x, p.y);
      if (!drawMarkerIcon(ctx, 'player', x, y, 32)) { ctx.fillStyle = '#ffd700'; ctx.strokeStyle = '#000'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, 6, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); }
    }
    this.info.textContent = fog.active(w) ? `разведано ${fog.pct()}% · объектов видно: ${ms.length}` : `объектов: ${ms.length}`;
    this.stats = { k: this.k, markers: ms.length, fog: fog.active(w), pct: fog.pct() };
  }
}
