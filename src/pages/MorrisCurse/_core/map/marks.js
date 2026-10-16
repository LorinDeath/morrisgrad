// Метки игрока на карте M (личные, на героя): копия с сервера (marks / mark_ok). Рисует и обрабатывает клики worldMap.js.
export const MARK_NAME_MAX = 32;
export const marks = { world: null, list: [], show: true, ver: 0 };
export function onMarks(d) { marks.world = d.world; marks.list = Array.isArray(d.list) ? d.list : []; marks.ver++; }
export function onMarkOk(d) {
  if (d.world !== marks.world) return;
  if (d.op === 'mark_del') marks.list = marks.list.filter((m) => m.id !== Number(d.id));
  else if (d.mark) { const i = marks.list.findIndex((m) => m.id === d.mark.id); if (i >= 0) marks.list[i] = d.mark; else marks.list.push(d.mark); }
  marks.ver++;
}
// пиксельный флажок: древко + золотой флаг с тёмной обводкой
export function drawMark(ctx, x, y, name, k, hi) {
  x = Math.round(x); y = Math.round(y);
  ctx.fillStyle = '#000'; ctx.fillRect(x - 1, y - 16, 4, 18); ctx.fillRect(x + 1, y - 17, 12, 10);
  ctx.fillStyle = '#e5e7eb'; ctx.fillRect(x, y - 15, 2, 16);
  ctx.fillStyle = hi ? '#fff7cc' : '#facc15'; ctx.fillRect(x + 2, y - 16, 10, 8); ctx.fillStyle = '#b45309'; ctx.fillRect(x + 2, y - 10, 10, 2);
  ctx.fillStyle = 'rgba(0,0,0,.45)'; ctx.fillRect(x - 3, y + 1, 8, 2);
  if (k > 0.015 && name) { ctx.save(); ctx.font = 'bold 11px monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; const w = ctx.measureText(name).width + 8;
    ctx.fillStyle = 'rgba(18,12,31,.9)'; ctx.fillRect(x - w / 2, y + 4, w, 14); ctx.fillStyle = '#fde68a'; ctx.fillText(name, x, y + 11.5); ctx.restore(); }
}
