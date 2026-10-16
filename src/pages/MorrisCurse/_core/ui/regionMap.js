// Админка «Спавн» → локация: карта мира со всеми регионами (цвет биома, как мини-карта/карта M — подложка mapArt),
// выбранный регион подсвечен (клетка — белым, всё его пятно — золотой рамкой). Клик по карте выбирает регион.
import { WORLD_GEN, regionAt } from '../../../../../server/meta/zoneGen.ts';
import { BIOMES } from '../../../../../server/meta/biomes.ts';
import { WORLD_SIZES } from '../../../../../server/worlds/sizes.ts';
import { mapImage } from '../map/mapArt.js';
const REG_COL = { grove: '#2f5a3a', meadow: '#4b4a7a', garden: '#6a3a44', waste: '#3a4458', rot: '#3d4426', ridge: '#4a4038', pylon: '#3c3a62', glitch: '#24502e', crater: '#3a3a5a', thin: '#4a4260' };
const colOf = (r) => (r.biome.startsWith('b_') ? BIOMES[r.biome.slice(2)]?.color : REG_COL[r.biome]) || '#333';
let BG = null;
function regionsLayer(px) { // все регионы цветом биома — один раз
  if (BG) return BG; const S = WORLD_SIZES.arinar, k = px / S; const cv = document.createElement('canvas'); cv.width = cv.height = px; const g = cv.getContext('2d');
  for (const r of WORLD_GEN.arinar.regions) { g.globalAlpha = r.id.includes('_outer') ? 0.45 : 0.6; g.fillStyle = colOf(r); g.fillRect(r.rect[0] * k, r.rect[1] * k, (r.rect[2] - r.rect[0]) * k, (r.rect[3] - r.rect[1]) * k); }
  g.globalAlpha = 1; return (BG = cv);
}
export function regionMapHtml() { return `<div class="adm-rmap"><canvas width="420" height="420" style="width:420px;max-width:100%;image-rendering:pixelated;border:2px solid #c59b27;background:#000;cursor:crosshair"></canvas><small class="adm-rmap-cap"></small></div>`; }
/** рисует карту в sec; id — выбранный регион; onPick(id) — клик по карте */
export function mountRegionMap(sec, id, onPick) {
  const cv = sec.querySelector('.adm-rmap canvas'); if (!cv) return null;
  const g = cv.getContext('2d'), P = cv.width, S = WORLD_SIZES.arinar, k = P / S, R = WORLD_GEN.arinar.regions;
  const sel = R.find((r) => r.id === id), cap = sec.querySelector('.adm-rmap-cap');
  const draw = () => {
    g.fillStyle = '#000'; g.fillRect(0, 0, P, P);
    const img = mapImage(false); if (img.complete && img.naturalWidth) { g.globalAlpha = 0.55; g.drawImage(img, 0, 0, P, P); g.globalAlpha = 1; } else img.onload = draw;
    g.drawImage(regionsLayer(P), 0, 0);
    if (sel) {
      const same = R.filter((r) => sel.patch != null ? r.patch === sel.patch : r.id === sel.id);
      g.fillStyle = 'rgba(253,230,138,.35)'; for (const r of same) g.fillRect(r.rect[0] * k, r.rect[1] * k, (r.rect[2] - r.rect[0]) * k, (r.rect[3] - r.rect[1]) * k);
      g.strokeStyle = '#c59b27'; g.lineWidth = 1; for (const r of same) g.strokeRect(r.rect[0] * k + 0.5, r.rect[1] * k + 0.5, (r.rect[2] - r.rect[0]) * k - 1, (r.rect[3] - r.rect[1]) * k - 1);
      const [x0, y0, x1, y1] = sel.rect.map((v) => v * k); g.fillStyle = '#fff'; g.fillRect(x0, y0, x1 - x0, y1 - y0); g.strokeStyle = '#000'; g.lineWidth = 2; g.strokeRect(x0 - 2, y0 - 2, x1 - x0 + 4, y1 - y0 + 4);
      const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2; g.strokeStyle = '#fff'; g.lineWidth = 1; g.beginPath(); g.moveTo(cx, 0); g.lineTo(cx, y0 - 3); g.moveTo(cx, y1 + 3); g.lineTo(cx, P); g.moveTo(0, cy); g.lineTo(x0 - 3, cy); g.moveTo(x1 + 3, cy); g.lineTo(P, cy); g.stroke();
    }
    g.fillStyle = '#fde68a'; g.fillRect(P / 2 - 2, P / 2 - 2, 4, 4); // хаб
    if (cap) cap.textContent = sel ? `${sel.name} · клетка ${sel.id} · подсвечено всё пятно` : 'Клик по карте — выбрать регион';
  };
  draw();
  cv.onclick = (e) => { const b = cv.getBoundingClientRect(), x = (e.clientX - b.left) / b.width * S, y = (e.clientY - b.top) / b.height * S; const r = regionAt(x, y, 'arinar'); if (r) onPick(r.id); };
  return { sel: sel?.id || null };
}
