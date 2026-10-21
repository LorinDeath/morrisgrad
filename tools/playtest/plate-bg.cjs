// LOCAL ONLY: читаемость плашек в игровом поле (новый интерфейс, HUD в поле) на светлой земле — лёд и воздух.
// «Цель», трекер заданий, всплывающие окна, кнопки мини-карты. Метрика: яркость фона плашки при скрытом тексте
// (светлая земля, просвечивающая через плашку, — плохо). TAG=before — только замер/скриншоты.
const { chromium } = require('playwright-core');
const { guardLocal, assertLocalUrl } = require('./_local.cjs');
const TAG = process.env.TAG || 'after', OUT = process.env.OUT || '/workspace/morrisgrad-round3/ui-rework/fixes/target-bg';
const BASE = process.env.UI_BASE || 'http://127.0.0.1:5311/game-panel.html', WS = process.env.UI_WS || 'ws://127.0.0.1:8911';
assertLocalUrl(BASE); assertLocalUrl(WS);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
const MAXL = Number(process.env.MAXL || 45); // средняя яркость фона плашки (0…255) не выше
(async () => {
  require('fs').mkdirSync(OUT, { recursive: true });
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const ctx = await b.newContext({ viewport: { width: 1280, height: 720 } }); await guardLocal(ctx);
  await ctx.addInitScript(() => { try { localStorage.setItem('mc_ui_theme', 'new'); localStorage.setItem('mc_hud_old', '0'); } catch {} });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(String(e).slice(0, 200)));
  await p.goto(assertLocalUrl(`${BASE}?name=Плашка&uid=plate_${Date.now().toString(36)}&ws=${WS}&fs=1&debug=1`));
  await p.waitForFunction(() => window.__game?.state?.().mode === 'hub', null, { timeout: 120000 });
  const G = (f, a) => p.evaluate(f, a), S = (o) => G((x) => window.__game.debug.rawSend(x), o);
  await G(() => window.__game.debug.selectClass('warrior')); await sleep(1500); await S({ type: 'dev_grant', xp: 60000 }); await sleep(2000);
  for (let i = 0; i < 8 && (await G(() => window.__game.state().world)) !== 'arinar'; i++) { await G(() => window.__game.debug.teleport(240, 600)); await sleep(700); await S({ type: 'use_portal', portalId: 'portal_arinar' }); await sleep(1800); }
  const R = (sel) => G((s) => { const e = document.querySelector(s); if (!e || !e.offsetParent) return null; const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; }, sel);
  // яркость фона: текст и значки прозрачны, рамка не в счёт (берём середину плашки)
  const bgLum = async (sel) => {
    const r = await R(sel); if (!r) return null;
    await G((s) => { const e = document.querySelector(s); e.dataset.plateTest = '1'; const st = document.createElement('style'); st.id = 'plate-test'; st.textContent = `[data-plate-test] * { color: transparent !important; text-shadow: none !important; visibility: hidden; } [data-plate-test] .hud-card, [data-plate-test] { visibility: visible !important; }`; document.head.appendChild(st); }, sel);
    await sleep(120); const buf = await p.screenshot({ clip: { x: r.x + r.w * 0.2, y: r.y + r.h * 0.3, width: Math.max(4, r.w * 0.6), height: Math.max(4, r.h * 0.4) } });
    await G((s) => { delete document.querySelector(s).dataset.plateTest; document.getElementById('plate-test')?.remove(); }, sel);
    return G(async (u) => { const i = new Image(); await new Promise((r) => { i.onload = r; i.src = 'data:image/png;base64,' + u; }); const c = document.createElement('canvas'); c.width = i.width; c.height = i.height; const g = c.getContext('2d'); g.drawImage(i, 0, 0); const d = g.getImageData(0, 0, c.width, c.height).data; let s = 0, n = 0; for (let k = 0; k < d.length; k += 4) { s += d[k] * .3 + d[k + 1] * .59 + d[k + 2] * .11; n++; } return s / n; }, buf.toString('base64'));
  };
  const crop = async (sel, nm, pad = 8) => { const r = await R(sel); if (r) await p.screenshot({ path: `${OUT}/${TAG}-${nm}.png`, clip: { x: Math.max(0, r.x - pad), y: Math.max(0, r.y - pad), width: r.w + pad * 2, height: r.h + pad * 2 } }); };
  for (const [loc, x, y] of [['ice', 24000, 29500], ['air', 24000, 18500]]) {
    await G(([x, y]) => window.__game.debug.tp(x, y), [x, y]); await sleep(5500);
    const P = await G(() => { const s = window.__game.state(); return { x: s.x ?? s.player?.x, y: s.y ?? s.player?.y }; });
    await S({ type: 'dev_spawn_mob', mob: 'dew_slime', x: P.x + 90, y: P.y + 40, ench: 0, special: '', calm: true }); await sleep(1500);
    const m = await G(([x, y]) => window.__game.debug.zoneMobsFull().filter((o) => Math.hypot(o.x - x, o.y - y) < 300).sort((a, b) => Math.hypot(a.x - x, a.y - y) - Math.hypot(b.x - x, b.y - y))[0], [P.x, P.y]);
    if (m) { await G((id) => window.__game.debug.selectMobId(id), m.id); await sleep(1500); }
    await p.mouse.move(640, 300); await p.screenshot({ path: `${OUT}/${TAG}-${loc}-full.png` });
    const res = {};
    res.target = await bgLum('.ig-tgt .hud-card'); await crop('.ig-tgt', `${loc}-target`);
    res.tracker = await bgLum('.mc-tracker .q'); await crop('.mc-tracker', `${loc}-tracker`);
    res.mmBtn = await bgLum('#mm-btn-plus'); await crop('.ig-mm', `${loc}-minimap`);
    await p.click('.ig-b[data-ig="runs"]'); await sleep(500); res.pop = await bgLum('.ig-pop.open'); await crop('.ig-pop.open', `${loc}-pop`); await p.click('.ig-b[data-ig="runs"]'); await sleep(300);
    const op = await G(() => getComputedStyle(document.documentElement).getPropertyValue('--ui-plate').trim());
    for (const [k, v] of Object.entries(res)) { const line = `${loc}: фон «${k}» яркость ${v == null ? '—' : v.toFixed(1)}${op ? ` (плотность плашек ${op})` : ''}`; if (TAG === 'before') console.log('INFO ' + line); else ok(v != null && v <= MAXL, line + ` ≤ ${MAXL}`); }
    await G(() => window.__game.debug.clearTarget()); await sleep(500);
  }
  if (TAG !== 'before') ok(!errs.length, 'без ошибок страницы ' + errs.join(' | '));
  console.log(fails ? `plate-bg FAILED (${fails})` : 'plate-bg ok'); await b.close(); process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
