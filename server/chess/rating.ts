// Боевые шахматы: упрощённый Glicko-2, один пул 8×8. Не смешивать со strat_*.
export type Rating = { rating: number; rd: number; vol: number; games: number };
export const CHESS_RATING_CFG = {
  start: { rating: 1500, rd: 350, vol: 0.06 } as Rating,
  tau: 0.5, minRd: 45, maxRd: 350, provisional: 10,
  botNoRate: true, guestNoRate: true,
};
const SCALE = 173.7178;
const g_ = (phi: number) => 1 / Math.sqrt(1 + 3 * phi * phi / (Math.PI * Math.PI));
const E_ = (mu: number, mu2: number, phi2: number) => 1 / (1 + Math.exp(-g_(phi2) * (mu - mu2)));

export function glicko2(p: Rating, results: { opp: { rating: number; rd: number }; score: number }[], C = CHESS_RATING_CFG): Rating {
  const mu = (p.rating - 1500) / SCALE, phi = p.rd / SCALE, sigma = p.vol;
  if (!results.length) { const ph = Math.sqrt(phi * phi + sigma * sigma); return { ...p, rd: Math.min(C.maxRd, ph * SCALE) }; }
  let vInv = 0, dSum = 0;
  for (const r of results) {
    const mu2 = (r.opp.rating - 1500) / SCALE, phi2 = r.opp.rd / SCALE, e = E_(mu, mu2, phi2), g = g_(phi2);
    vInv += g * g * e * (1 - e); dSum += g * (r.score - e);
  }
  const v = 1 / vInv, delta = v * dSum, a = Math.log(sigma * sigma), tau = C.tau, eps = 1e-6;
  const f = (x: number) => { const ex = Math.exp(x); return ex * (delta * delta - phi * phi - v - ex) / (2 * (phi * phi + v + ex) ** 2) - (x - a) / (tau * tau); };
  let A = a, B: number;
  if (delta * delta > phi * phi + v) B = Math.log(delta * delta - phi * phi - v);
  else { let k = 1; while (f(a - k * tau) < 0) k++; B = a - k * tau; }
  let fA = f(A), fB = f(B);
  for (let it = 0; Math.abs(B - A) > eps && it < 100; it++) {
    const Cc = A + (A - B) * fA / (fB - fA), fC = f(Cc);
    if (fC * fB <= 0) { A = B; fA = fB; } else fA /= 2;
    B = Cc; fB = fC;
  }
  const sig2 = Math.exp(A / 2), phiStar = Math.sqrt(phi * phi + sig2 * sig2);
  const phiN = 1 / Math.sqrt(1 / (phiStar * phiStar) + 1 / v), muN = mu + phiN * phiN * dSum;
  return { rating: muN * SCALE + 1500, rd: Math.max(C.minRd, Math.min(C.maxRd, phiN * SCALE)), vol: sig2, games: p.games + 1 };
}
export const provisional = (r: Rating, C = CHESS_RATING_CFG) => r.games < C.provisional;

/** Локальный рейтинг (localStorage) — для вертикали до D1. */
export function localApply(myKey: string, won: boolean, oppKey = "bot") {
  if (typeof localStorage === "undefined") return null;
  const load = (k: string): Rating => {
    try { return JSON.parse(localStorage.getItem("chess_r_" + k) || "null") || { ...CHESS_RATING_CFG.start }; }
    catch { return { ...CHESS_RATING_CFG.start }; }
  };
  if (oppKey === "bot" || oppKey.startsWith("guest:")) return null;
  const me = load(myKey), opp = load(oppKey);
  const me2 = glicko2(me, [{ opp, score: won ? 1 : 0 }]);
  const opp2 = glicko2(opp, [{ opp: me, score: won ? 0 : 1 }]);
  localStorage.setItem("chess_r_" + myKey, JSON.stringify(me2));
  localStorage.setItem("chess_r_" + oppKey, JSON.stringify(opp2));
  return { before: me.rating, after: me2.rating, delta: me2.rating - me.rating };
}
