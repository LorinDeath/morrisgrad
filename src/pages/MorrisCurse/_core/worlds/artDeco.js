// Ар-деко плитка пола (перенос рисунка из 2D-версии в CanvasTexture для 3D пола).
export function createArtDecoCanvas(palette = {}) {
  const P = {
    base: '#0a0812', corner: '#120d1f', diamond: '#171126', inner: '#07050d',
    gold: 'rgba(197, 155, 39, 0.45)', gold2: 'rgba(212, 175, 55, 0.6)', violet: '#432d5c',
    ...palette,
  };
  const S = 128;
  const tile = document.createElement('canvas');
  tile.width = S; tile.height = S;
  const t = tile.getContext('2d');
  t.scale(2, 2);
  t.fillStyle = P.base; t.fillRect(0, 0, 64, 64);
  t.fillStyle = P.corner;
  [[0, 0, 24, 0, 0, 24], [64, 0, 40, 0, 64, 24], [64, 64, 40, 64, 64, 40], [0, 64, 24, 64, 0, 40]].forEach((p) => {
    t.beginPath(); t.moveTo(p[0], p[1]); t.lineTo(p[2], p[3]); t.lineTo(p[4], p[5]); t.fill();
  });
  t.strokeStyle = P.gold; t.lineWidth = 1;
  t.beginPath();
  t.moveTo(14, 0); t.lineTo(0, 14); t.moveTo(50, 0); t.lineTo(64, 14);
  t.moveTo(50, 64); t.lineTo(64, 50); t.moveTo(14, 64); t.lineTo(0, 50);
  t.stroke();
  const diamond = (r) => { t.beginPath(); t.moveTo(32, 32 - r); t.lineTo(32 + r, 32); t.lineTo(32, 32 + r); t.lineTo(32 - r, 32); t.closePath(); };
  t.fillStyle = P.diamond; diamond(32); t.fill(); t.strokeStyle = P.gold2; t.lineWidth = 1.2; t.stroke();
  t.strokeStyle = P.violet; t.lineWidth = 1; diamond(25); t.stroke();
  t.fillStyle = P.inner; diamond(19); t.fill(); t.strokeStyle = P.gold; t.stroke();
  t.strokeStyle = 'rgba(245, 215, 127, 0.55)'; diamond(11); t.stroke();
  t.fillStyle = P.gold2; diamond(5); t.fill();
  t.strokeStyle = 'rgba(212, 175, 55, 0.15)'; t.strokeRect(0.5, 0.5, 63, 63);
  return tile;
}
