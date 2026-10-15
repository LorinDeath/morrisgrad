// Счётчик урона героя. Определения (все — по событиям сервера zone_state.ev hit.by / pvp phit.by):
//   dps   — скользящее среднее за последние 5 с (в начале боя делим на фактическую длительность, но не меньше 1 с);
//   dpm   — урон, реально нанесённый за последние 60 с (без экстраполяции);
//   peak  — максимум урона за одну секунду (окно 1 с) в текущем бою;
//   fight — сумма за текущий бой (бой заканчивается после 8 с тишины).
// Связь: dpm ≤ fight; при ровном темпе dpm ≈ dps × min(60, длительность боя в с).
export const DPS_WIN = 5000, DPM_WIN = 60000, PEAK_WIN = 1000, FIGHT_GAP = 8000;
export class DpsMeter {
  constructor() { this.hits = []; this.peak = 0; this.fightStart = 0; this.fightDmg = 0; this.el = null; }
  add(d, now = performance.now()) {
    if (!(d > 0)) return;
    const last = this.hits.length ? this.hits[this.hits.length - 1][0] : -Infinity;
    if (now - last > FIGHT_GAP) { this.fightStart = now; this.fightDmg = 0; this.peak = 0; }
    this.hits.push([now, d]); this.fightDmg += d;
    // пик: урон за последнюю секунду, включая этот удар
    let s1 = 0; for (let i = this.hits.length - 1; i >= 0 && now - this.hits[i][0] < PEAK_WIN; i--) s1 += this.hits[i][1];
    if (s1 > this.peak) this.peak = s1;
    while (this.hits.length && now - this.hits[0][0] >= DPM_WIN) this.hits.shift();
  }
  stats(now = performance.now()) {
    while (this.hits.length && now - this.hits[0][0] >= DPM_WIN) this.hits.shift();
    let s5 = 0, s60 = 0;
    for (const [t, d] of this.hits) { s60 += d; if (now - t < DPS_WIN) s5 += d; }
    const last = this.hits.length ? this.hits[this.hits.length - 1][0] : 0;
    const active = last > 0 && now - last < FIGHT_GAP;
    const win = Math.min(DPS_WIN, Math.max(1000, now - this.fightStart));
    const dps = active ? s5 / (win / 1000) : 0;
    return { dps: Math.round(dps), dpm: Math.round(s60), peak: Math.round(this.peak), fight: Math.round(this.fightDmg), active };
  }
  // плашка над панелью действий: видна в бою и 8 с после
  mount(host) {
    if (this.el) return; const el = this.el = document.createElement('div');
    el.className = 'mc-dps'; el.style.cssText = 'position:absolute;right:12px;bottom:86px;z-index:20;pointer-events:none;font:12px/1.3 monospace;color:#fde68a;background:rgba(10,6,20,.78);border:1px solid #c59b27;border-radius:6px;padding:4px 8px;display:none;text-align:right';
    el.title = 'урона/с — среднее за 5 с; за 60 с — реальный урон за последнюю минуту; пик — лучшая секунда боя';
    host.appendChild(el);
  }
  render(now = performance.now()) {
    if (!this.el) return; const s = this.stats(now);
    if (!s.active) { this.el.style.display = 'none'; return; }
    this.el.style.display = 'block';
    this.el.innerHTML = `⚔ <b>${s.dps}</b> урона/с · <b>${s.dpm}</b> за 60 с<br><small style="color:#c4b5fd">пик ${s.peak}/с · за бой ${s.fight}</small>`;
  }
}
