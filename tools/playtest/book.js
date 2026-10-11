const { chromium } = require('playwright-core');
const OUT = '/workspace/morrisgrad-round2';
const kind = process.argv[2] || 'desktop';
(async () => {
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const { devices } = require('playwright-core');
  const o = kind === 'mobile' ? { ...devices['iPhone 13'] } : { viewport: { width: 1440, height: 860 } }; delete o.defaultBrowserType;
  const p = await (await b.newContext(o)).newPage();
  const errs = [];
  p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  p.on('pageerror', (e) => errs.push('PAGEERROR ' + String(e.stack || e)));
  const uid = 'test_r2_book_' + kind + '_' + Date.now();
  await p.goto(`http://127.0.0.1:5199/game.html?name=Book&uid=${uid}&ws=ws://127.0.0.1:8787${kind === 'desktop' ? '&fs=1' : ''}&debug=1`);
  await p.waitForFunction(() => window.__game?.state?.().mode === 'hub', null, { timeout: 60000 });
  await p.waitForFunction(() => window.__game.meta?.state, null, { timeout: 20000 });
  const G = (fn, a) => p.evaluate(fn, a);
  await G(() => window.__game.debug.selectClass('rogue')); await p.waitForTimeout(1500);
  for (const it of ['dew_slime_weapon', 'dew_slime_helmet', 'fly_carapace', 'greenpoise_bow']) { await G((i) => window.__game.debug.send({ type: 'dev_grant', item: i }), it); await p.waitForTimeout(150); }
  await p.waitForTimeout(1200);
  const inv = await G(() => window.__game.meta.account.inv.map((i) => ({ id: i.id, n: i.n, src: i.src })));
  console.log('inv', JSON.stringify(inv));
  const badge = await G(() => document.querySelector('.mc-bookbtn .mc-cnt')?.textContent);
  console.log('book badge', badge);
  await p.screenshot({ path: `${OUT}/${kind}-book-00-badge.png` });
  await G(() => window.__game.debug.openBook('gear')); await p.waitForTimeout(600);
  await p.screenshot({ path: `${OUT}/${kind}-book-01-gear-new.png` });
  // выбрать новый предмет → «новое» снимается (mark_seen)
  await G(() => document.querySelector('.mc-item.isnew')?.click()); await p.waitForTimeout(1500);
  await p.screenshot({ path: `${OUT}/${kind}-book-02-gear-tooltip.png` });
  await G(() => window.__game.debug.openBook('library')); await p.waitForTimeout(1500);
  await G(() => document.querySelector('.mc-lib:not(.lock)')?.click()); await p.waitForTimeout(800);
  await p.screenshot({ path: `${OUT}/${kind}-book-03-library.png` });
  await G(() => window.__game.debug.openBook(null)); await G(() => document.querySelector('.mc-book-x')?.click());
  for (let i = 0; i < 30; i++) { const st = await G(() => window.__game.state().player); const dx = 640 - st.x, dy = 270 - st.y, d = Math.hypot(dx, dy); if (d < 5) break; const k = Math.min(1, 45 / d); await G(([a, c]) => window.__game.debug.teleport(a, c), [st.x + dx * k, st.y + dy * k]); await p.waitForTimeout(110); }
  await p.waitForTimeout(2500);
  await G(() => window.__game.debug.openBook('bestiary')); await p.waitForTimeout(1200);
  await G(() => { const x = [...document.querySelectorAll('.mc-beast-h')][0]; x?.click(); }); await p.waitForTimeout(1200);
  await p.screenshot({ path: `${OUT}/${kind}-book-04-bestiary.png` });
  const after = await G(() => window.__game.meta.unread());
  console.log('unread after', JSON.stringify(after));
  console.log('errors', errs.slice(0, 5).join('\n'));
  await b.close();
})();
