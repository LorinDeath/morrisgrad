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

// Спокойная каменная плитка: крупные плиты с лёгким шумом и тонким, едва заметным ар-деко узором.
// Пол перестаёт «рябить» под толпой спрайтов — читаются мобы, телеграфы и снаряды.
export function createStoneCanvas(palette = {}, seed = 7) {
  const P = {
    base: '#15111d', var: 0.06, grout: 'rgba(0,0,0,0.55)', hi: 'rgba(255,255,255,0.035)',
    motif: 'rgba(197,155,39,0.10)', moss: null, crack: 'rgba(0,0,0,0.35)',
    ...palette,
  };
  let s = seed;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const S = 256;
  const c = document.createElement('canvas');
  c.width = S; c.height = S;
  const t = c.getContext('2d');
  t.fillStyle = P.base; t.fillRect(0, 0, S, S);
  const plates = [[0, 0, 128, 128], [128, 0, 128, 64], [128, 64, 128, 64], [0, 128, 64, 128], [64, 128, 192, 128]];
  const shade = (hex, k) => {
    const n = parseInt(hex.slice(1), 16);
    const f = (v) => Math.max(0, Math.min(255, Math.round(v * (1 + k))));
    return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`;
  };
  for (const [x, y, w, h] of plates) {
    t.fillStyle = shade(P.base, (rnd() - 0.5) * P.var * 2);
    t.fillRect(x + 1, y + 1, w - 2, h - 2);
    // мелкий шум
    for (let i = 0; i < (w * h) / 40; i++) {
      t.fillStyle = rnd() < 0.5 ? 'rgba(0,0,0,0.10)' : 'rgba(255,255,255,0.025)';
      t.fillRect(x + rnd() * w, y + rnd() * h, 2, 2);
    }
    // фаска сверху-слева
    t.fillStyle = P.hi; t.fillRect(x + 1, y + 1, w - 2, 2); t.fillRect(x + 1, y + 1, 2, h - 2);
    t.fillStyle = P.grout; t.fillRect(x, y, w, 1); t.fillRect(x, y, 1, h);
    // трещина
    if (rnd() < 0.5) {
      t.strokeStyle = P.crack; t.lineWidth = 1;
      t.beginPath();
      let cx = x + 10 + rnd() * (w - 20), cy = y + 10 + rnd() * (h - 20);
      t.moveTo(cx, cy);
      for (let k = 0; k < 4; k++) { cx += (rnd() - 0.5) * 22; cy += (rnd() - 0.5) * 22; t.lineTo(cx, cy); }
      t.stroke();
    }
    if (P.moss && rnd() < 0.45) {
      t.fillStyle = P.moss;
      for (let k = 0; k < 18; k++) t.fillRect(x + (rnd() < 0.5 ? 2 : w - 8) + rnd() * 6, y + rnd() * h, 3, 3);
    }
  }
  // узор: тонкий ромб на большой плите
  t.strokeStyle = P.motif; t.lineWidth = 1.5;
  t.beginPath(); t.moveTo(64, 14); t.lineTo(114, 64); t.lineTo(64, 114); t.lineTo(14, 64); t.closePath(); t.stroke();
  t.beginPath(); t.moveTo(64, 40); t.lineTo(88, 64); t.lineTo(64, 88); t.lineTo(40, 64); t.closePath(); t.stroke();
  return c;
}
