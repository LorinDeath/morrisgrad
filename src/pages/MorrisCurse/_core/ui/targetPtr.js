// Метки отслеживаемых целей на экране: номер и цвет — как в трекере (охота из Бестиария + задания).
// Цель на экране — кружок с номером над ней; за экраном — указатель у края в её сторону с расстоянием.
// Соседние метки (одно направление/одно место) собираются в одну группу: кружки с номерами в ряд, одна стрелка и
// расстояние до ближайшей — без «каши». Пул DOM-элементов, обновление ~15 раз/с. На телефоне метки не заходят
// в нижнюю зону управления (джойстик слева, кнопки справа).
const MAX = 30, NEAR = 34, SHOW = 4;
export class TargetPointers {
  constructor(layer, { mobile }) {
    this.mobile = mobile; this.pool = []; this.at = 0; this.stats = { on: 0, groups: 0, edge: 0, ms: 0 };
    const root = document.createElement('div'); root.className = 'mc-tptr'; layer.appendChild(root); this.root = root;
  }
  el(i) {
    let e = this.pool[i];
    if (!e) { e = document.createElement('div'); e.className = 'tp'; e.innerHTML = '<u></u><b></b><s></s>'; this.root.appendChild(e); e._n = e.children[0]; e._d = e.children[1]; e._a = e.children[2]; e._k = ''; this.pool[i] = e; }
    return e;
  }
  hide() { if (this.root.style.display !== 'none') this.root.style.display = 'none'; }
  /** targets: [{world,x,y,n,c,label}], ctx: {world, x, y}, project(x, y) → {x, y} | null, W/H — размер слоя,
   *  avoid — прямоугольники панелей {l,t,r,b} (трекер, мини-карта): метка у края не уходит под них */
  update(targets, ctx, project, W, H, now = performance.now(), avoid = null) {
    if (now - this.at < 66) return; this.at = now; const t0 = performance.now();
    this.root.style.display = '';
    const mob = this.mobile, pad = 16;
    const top = mob ? 44 : 56, bot = mob ? H * 0.58 : H - 96, left = pad + 10, right = W - pad - 10; // безопасная рамка: выше панели действий/управления
    const cx = W / 2, cy = Math.min(H / 2, (top + bot) / 2), groups = [];
    let n = 0;
    for (const t of targets || []) {
      if (n >= MAX) break; if (t.world !== ctx.world) continue;
      const p = project(t.x, t.y); if (!p) continue;
      const dist = Math.hypot(t.x - ctx.x, t.y - ctx.y);
      let x = p.x, y = p.y, ang = 0; const out = x < left || x > right || y < top || y > bot;
      if (out) { const dx = x - cx, dy = y - cy; ang = Math.atan2(dy, dx);
        const kx = dx > 0 ? (right - cx) / dx : dx < 0 ? (left - cx) / dx : Infinity, ky = dy > 0 ? (bot - cy) / dy : dy < 0 ? (top - cy) / dy : Infinity, kk = Math.min(kx, ky);
        x = cx + dx * kk; y = cy + dy * kk; }
      else if (dist < 40) continue; // игрок уже на месте
      for (const r of avoid || []) if (x > r.l - 14 && x < r.r + 14 && y > r.t - 14 && y < r.b + 14) { // под панелью — сдвинуть к её краю, ближнему к центру
        if (r.l > cx) x = r.l - 16; else if (r.r < cx) x = r.r + 16; else y = r.b + 16; }
      n++;
      const g = groups.find((q) => q.out === out && Math.abs(q.x - x) < NEAR && Math.abs(q.y - y) < NEAR);
      if (g) { g.list.push(t); if (dist < g.dist) { g.dist = dist; g.ang = ang; } } else groups.push({ x, y, out, ang, dist, list: [t] });
    }
    groups.forEach((g, i) => {
      const e = this.el(i), key = g.list.map((t) => t.n + t.c).join(',') + (g.out ? '|o' : '');
      if (e._k !== key) { e._k = key;
        const L = g.list.slice(0, SHOW);
        e._n.innerHTML = L.map((t) => `<i style="--c:${t.c}">${t.n}</i>`).join('') + (g.list.length > SHOW ? `<i class="more">+${g.list.length - SHOW}</i>` : '');
        e.style.setProperty('--c', g.list[0].c); e.classList.toggle('out', g.out); e.title = g.list.map((t) => `${t.n}. ${t.label || ''}`).join('\n'); }
      const dt = g.out ? `${Math.round(g.dist / 20)} м` : ''; if (e._d.textContent !== dt) e._d.textContent = dt;
      e._a.style.transform = g.out ? `rotate(${g.ang}rad)` : '';
      e.style.transform = `translate(${Math.round(g.x)}px, ${Math.round(g.y)}px)`; if (e.style.display) e.style.display = '';
    });
    for (let i = groups.length; i < this.pool.length; i++) if (this.pool[i].style.display !== 'none') this.pool[i].style.display = 'none';
    this.stats = { on: n, groups: groups.length, edge: groups.filter((g) => g.out).length, ms: +(performance.now() - t0).toFixed(3) };
  }
}
