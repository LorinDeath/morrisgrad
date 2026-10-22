// Снимки: список сундуков с уровнем, шансы SS, открытый чёрный проклятый (чёрные проклятые + низшие проклятые + очернённые), подсказки, админка.
const { chromium } = require('playwright-core');
const OUT = '/workspace/morrisgrad-qol/shots/bchest2';
const BASE = 'http://127.0.0.1:5371', WS = 'ws://127.0.0.1:8971';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const ctx = await b.newContext({ viewport: { width: 1366, height: 800 } });
  await ctx.route(/^(?!https?:\/\/127\.0\.0\.1|ws:\/\/127\.0\.0\.1|data:|blob:)/, (r) => r.abort());
  await ctx.addInitScript(() => { try { localStorage.setItem('mc_ui_theme', 'new'); } catch {} });
  const p = await ctx.newPage(); const errs = [];
  p.on('pageerror', (e) => errs.push(String(e).slice(0, 300)));
  const uid = 'qa_admin';
  await p.goto(`${BASE}/game-panel.html?name=${uid}&uid=${uid}&ws=${WS}&fs=1&debug=1`);
  await p.waitForFunction(() => window.__game?.state?.().mode === 'hub', null, { timeout: 120000 });
  await sleep(1500);
  const G = (f, a) => p.evaluate(f, a);
  const shot = async (n) => { await G(() => document.querySelectorAll('.mcl-err[data-code="MC-A04"]').forEach((e) => e.remove())); await p.screenshot({ path: `${OUT}/${n}.png` }); console.log('shot', n); };
  await G(() => window.__game.debug.selectClass('warrior')); await sleep(2500);
  await G(() => window.__game.board?.tut?.('skip')); await sleep(800);
  // прошлые сундуки этого qa-аккаунта — открыть/забрать нельзя без места, поэтому просто добавляем свежие
  await G(() => window.__game.debug.rawSend({ type: 'dev_grant', xp: 3000, bchestGrant: { ranks: ['F', 'C', 'A', 'S'], L: 12, cat: 'weekly' } })); await sleep(800);
  await G(() => window.__game.debug.rawSend({ type: 'dev_grant', bchestGrant: { ranks: ['SS', 'SS', 'SS', 'SS', 'SS'], L: 12, cat: 'monthly' } })); await sleep(1200);
  await G(() => window.__game.debug.rawSend({ type: 'meta_get' })); await sleep(1500);
  await p.keyboard.press('KeyY');
  await p.waitForSelector('#mc-bchest .bc-row', { timeout: 15000 }); await sleep(1500);
  const list = await G(() => window.__game.bchestWin.st.list.map((c) => ({ id: c.id, rank: c.rank, L: c.L, cat: c.cat, opened: c.opened, lo: c.odds.lo, hi: c.odds.hi })));
  console.log('list', JSON.stringify(list.slice(-9)));
  console.log('odds SS', JSON.stringify(await G(() => { const c = window.__game.bchestWin.st.list.find((x) => x.rank === 'SS'); return c && { ...c.odds }; })));
  const ss = list.filter((c) => c.rank === 'SS' && c.cat === 'monthly' && !c.opened && c.L === 12).map((c) => c.id);
  await G((id) => document.querySelector(`#mc-bchest .bc-row[data-id="${id}"]`)?.scrollIntoView({ block: "nearest" }), ss[0]);
  await G((id) => document.querySelector(`#mc-bchest .bc-row[data-id="${id}"]`)?.click(), ss[0]); await sleep(600);
  await shot('01-window-list-levels-odds-SS');
  let got = null;
  for (const id of ss) {
    await G((i) => document.querySelector(`#mc-bchest .bc-row[data-id="${i}"]`)?.click(), id); await sleep(400);
    await p.click('#mc-bchest .bc-open');
    await p.waitForSelector('.bc-fx', { timeout: 15000 }).catch(() => {});
    await p.waitForSelector('.bc-fx', { state: 'detached', timeout: 30000 }).catch(() => {});
    await sleep(1200);
    const it = await G(() => window.__game.bchestWin.cur()?.items || []);
    const R = await G((xs) => xs.map((x) => ({ ...x, r: window.__game.debug?.itemDef?.(x.id)?.rarity })), it);
    const bc = it.filter((x) => x.c && x.e === 6).length, lc = it.filter((x) => x.c && x.e !== 6).length, bk = it.filter((x) => x.b).length;
    console.log('opened', id, it.length, 'blackCursed', bc, 'otherCursed', lc, 'blk', bk);
    if (bc && lc && bk) { got = { id, it }; break; }
  }
  if (!got) console.log('WARN: no chest with all three kinds');
  const it = got ? got.it : await G(() => window.__game.bchestWin.cur()?.items || []);
  await p.mouse.move(5, 5); await sleep(300);
  await shot('02-opened-SS-grid');
  const hov = async (lid, n) => { const el = await p.$(`#mc-bchest .grid [data-lid="${lid}"]`); if (!el) return; await el.scrollIntoViewIfNeeded(); await el.hover(); await sleep(800); await shot(n); await p.mouse.move(5, 5); await sleep(300); };
  const xb = it.find((x) => x.b && !x.c) || it.find((x) => x.b); if (xb) await hov(xb.lid, '03-tip-blackened');
  const xc = it.find((x) => x.c && x.e === 6); if (xc) await hov(xc.lid, '04-tip-black-cursed');
  const xl = it.find((x) => x.c && !x.e); if (xl) await hov(xl.lid, '05-tip-lower-cursed');
  await G(() => window.__game.bchestWin.close());
  await G(() => window.__game.debug.openAdmin()); await p.waitForFunction(() => window.__game.debug.admin().loaded, null, { timeout: 20000 });
  await G(() => document.querySelector('.mc-admin [data-tab="bchest"]')?.click()); await sleep(800);
  await G(() => document.querySelector('.mc-admin aside li[data-id]')?.click()); await sleep(1000);
  await G(() => document.querySelector('.mc-admin .bcp-go')?.click()); await sleep(1500);
  await G(() => document.querySelector('.mc-admin .mc-bcp')?.scrollIntoView()); await sleep(400);
  await shot('06-admin-preview');
  console.log('ERRORS', errs.length, JSON.stringify(errs));
  await b.close();
})().catch((e) => { console.error('FAIL', e); process.exit(1); });
