// Снимки Бестиария: вкладки Мобы / Элита / Боссы / Мировые боссы (реестр с сервера), убийства вариантов/хаба — в свои карточки. VP=pc|iphone13|se
const { chromium, devices } = require('playwright-core');
const { guardLocal, assertLocalUrl } = require('/workspace/mg-qol/tools/playtest/_local.cjs');
const VP = process.env.VP || 'pc', OUT = '/workspace/morrisgrad-qol/shots/bestiary';
const VPS = { pc: { viewport: { width: 1366, height: 800 } }, iphone13: devices['iPhone 13'],
  se: { viewport: { width: 375, height: 667 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: devices['iPhone 13'].userAgent } };
const MOB = VP !== 'pc', BASE = 'http://127.0.0.1:5371', WS = 'ws://127.0.0.1:8971';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const d = { ...VPS[VP] }; delete d.defaultBrowserType; const ctx = await b.newContext(d); await guardLocal(ctx);
  await ctx.addInitScript(() => { try { localStorage.setItem('mc_ui_theme', 'new'); } catch {} });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(String(e).slice(0, 300)));
  const uid = 'bst_' + VP + Date.now().toString(36);
  await p.goto(assertLocalUrl(`${BASE}/${MOB ? 'game.html' : 'game-panel.html'}?name=Бестиарий&uid=${uid}&ws=${WS}&fs=1&debug=1${MOB ? '&mobile=1' : ''}`));
  await p.waitForFunction(() => window.__game?.state?.().mode === 'hub', null, { timeout: 120000 }); await sleep(1500);
  const G = (f, a) => p.evaluate(f, a); const S = (o) => G((x) => window.__game.debug.rawSend(x), o);
  const shot = async (n) => { await G(() => document.querySelectorAll('.mcl-err[data-code="MC-A04"]').forEach((e) => e.remove())); await p.screenshot({ path: `${OUT}/${VP}-${n}.png` }); console.log('shot', `${OUT}/${VP}-${n}.png`); };
  await G(() => window.__game.debug.selectClass('warrior')); await sleep(2500);
  await G(() => window.__game.board?.tut?.('skip')); await sleep(500);
  await S({ type: 'dev_grant', xp: 3000000 }); await sleep(400);
  const kill = async (n, killType) => { for (let i = 0; i < n * 3; i++) { await S({ type: "dev_grant", killNearAny: true, ...(killType ? { killType } : {}) }); await sleep(600); } }; // несколько попыток: мобы подгружаются не сразу после переноса
  await kill(2); // хаб (Поляна)
  for (let i = 0; i < 12 && (await G(() => window.__game.state().world)) !== 'arinar'; i++) { await G(() => { window.__game.debug.rawSend({ type: 'dev_teleport', x: 240, y: 600 }); window.__game.debug.teleport(240, 600); }); await sleep(700); await S({ type: 'use_portal', portalId: 'portal_arinar' }); await sleep(1500); }
  const where = await G(() => window.__game.state().world); console.log('world', where);
  const tp = async (x, y) => { await S({ type: 'dev_teleport', x, y, god: true }); await G(([a, c]) => window.__game.debug.teleport(a, c), [x, y]); await sleep(4000); };
  if (where === 'arinar') {
    await tp(13200, 1200); await kill(4); // «Железные каменоломни» — варианты краёв (stone_*)
    await tp(15600, 3600); await kill(2, 'stone_rust_baron'); // логово варианта-босса
    await tp(42000, 10800); await kill(1, 'swarm_mother');
  }
  await S({ type: 'meta_get' }); await sleep(1200);
  await G(() => window.__game.debug.openBook('bestiary')); await p.waitForSelector('.mc-btabs', { timeout: 20000 }); await sleep(1500);
  const acc = await G(() => Object.entries(window.__game.meta?.account?.bestiary || window.__game.debug.d?.()?.account?.bestiary || {}).filter(([, e]) => e.kills).map(([k, e]) => k + ':' + e.kills));
  console.log('killed', JSON.stringify(acc));
  const checks = [];
  for (const [n, g] of [['01-mobs', 'mob'], ['02-elite', 'elite'], ['03-bosses', 'boss'], ['04-world-bosses', 'world']]) {
    await G((v) => document.querySelector(`.mc-btabs [data-v="${v}"]`)?.click(), g); await sleep(700);
    const info = await G(() => { const t = document.querySelector('.mc-btabs .gold')?.textContent || ''; const rows = document.querySelectorAll('.mc-beast').length, unk = document.querySelectorAll('.mc-beast.unknown').length; const loc = [...document.querySelectorAll('.mc-beast.unknown small')].filter((e) => /водится:/.test(e.textContent)).length; return { t, rows, unk, loc, txt: document.querySelector('.mc-prog')?.innerText.replace(/\s+/g, ' ').slice(0, 200) }; });
    checks.push(`${n}: «${info.t}» записей ${info.rows}, ??? ${info.unk}, с местом ${info.loc} · ${info.rows && info.loc === info.unk ? 'ok' : 'CHECK'}`);
    if (n === '01-mobs') console.log('prog', info.txt);
    await G(() => document.querySelector('.mc-btabs')?.scrollIntoView({ block: 'start' })); await p.mouse.move(2, 2); await shot(n);
  }
  // открыть убитый вариант: своя карточка + «Где встречается»
  await G(() => document.querySelector('.mc-btabs [data-v="mob"]')?.click()); await sleep(500);
  const opened = await G(() => { const k = [...document.querySelectorAll('.mc-beast-h')].find((e) => /^stone_/.test(e.dataset.v)) || document.querySelector('.mc-beast-h'); if (!k) return ''; k.click(); return k.dataset.v; }); await sleep(1500);
  await G(() => document.querySelector('.mc-beast .s')?.closest('.mc-beast')?.scrollIntoView({ block: 'start' })); await sleep(300);
  checks.push(`card ${opened}: ${(await G(() => /Где встречается/.test(document.querySelector('.mc-beast .s')?.closest('.mc-beast')?.innerText || ''))) ? 'ok' : 'CHECK'}`);
  await shot('05-mob-card');
  console.log(checks.join('\n'));
  console.log(VP, 'RESULT', checks.every((c) => / ok$/.test(c)) && !errs.length ? 'PASS' : 'CHECK', 'ERRORS', errs.length, JSON.stringify(errs));
  await b.close();
})().catch((e) => { console.error('FAIL', e); process.exit(1); });
