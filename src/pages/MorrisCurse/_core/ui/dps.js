// Счётчик урона героя: DPS (урон в секунду за последние 5 с боя) и DPM (за последнюю минуту), пик DPS, сумма за бой.
// Источник — только события сервера (zone_state.ev hit.by / pvp phit.by), клиент ничего не считает сам.
export class DpsMeter {
  constructor() { this.hits = []; this.peak = 0; this.fightStart = 0; this.fightDmg = 0; this.el = null; }
  add(d, now = performance.now()) {
    if (!(d > 0)) return;
    if (!this.hits.length || now - this.hits[this.hits.length - 1][0] > 8000) { this.fightStart = now; this.fightDmg = 0; this.peak = 0; } // новый бой после 8 с тишины
    this.hits.push([now, d]); this.fightDmg += d;
    while (this.hits.length && now - this.hits[0][0] > 60000) this.hits.shift();
  }
  stats(now = performance.now()) {
    while (this.hits.length && now - this.hits[0][0] > 60000) this.hits.shift();
    let s5 = 0, s60 = 0; for (const [t, d] of this.hits) { s60 += d; if (now - t <= 5000) s5 += d; }
    const fight = this.fightStart ? Math.min(5000, Math.max(1000, now - this.fightStart)) : 5000; // в начале боя — не делим на полные 5 с
    const dps = s5 / (fight / 1000);
    const last = this.hits.length ? this.hits[this.hits.length - 1][0] : 0;
    if (now - last < 5000) this.peak = Math.max(this.peak, dps);
    const span = this.fightStart ? Math.min(60000, Math.max(1000, now - this.fightStart)) : 60000;
    return { dps: Math.round(dps), dpm: Math.round(span < 60000 ? s60 * 60000 / span : s60), dpm60: Math.round(s60), peak: Math.round(this.peak), fight: Math.round(this.fightDmg), active: now - last < 8000 && last > 0 };
  }
  // плашка над панелью действий: видна в бою и 8 с после
  mount(host) {
    if (this.el) return; const el = this.el = document.createElement('div');
    el.className = 'mc-dps'; el.style.cssText = 'position:absolute;right:12px;bottom:86px;z-index:20;pointer-events:none;font:12px/1.3 monospace;color:#fde68a;background:rgba(10,6,20,.78);border:1px solid #c59b27;border-radius:6px;padding:4px 8px;display:none;text-align:right';
    host.appendChild(el);
  }
  render(now = performance.now()) {
    if (!this.el) return; const s = this.stats(now);
    if (!s.active) { this.el.style.display = 'none'; return; }
    this.el.style.display = 'block';
    this.el.innerHTML = `⚔ <b>${s.dps}</b> урона/с · <b>${s.dpm}</b> урона/мин<br><small style="color:#c4b5fd">пик ${s.peak}/с · за бой ${s.fight} · за 60 с ${s.dpm60}</small>`;
  }
}
