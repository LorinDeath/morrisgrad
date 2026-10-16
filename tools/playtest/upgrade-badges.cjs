// LOCAL: скриншоты значков улучшения всех ступеней (обычные и проклятые) — сумка, слоты, окно Петра, подсказка, телефон.
const { chromium } = require('playwright-core');
const { guardLocal, assertLocalUrl } = require('./_local.cjs');
const OUT = process.env.OUT || '/workspace/morrisgrad-round3/item-upgrade/badges';
const BASE = process.env.IU_BASE || 'http://127.0.0.1:5263/game.html', WS = process.env.IU_WS || 'ws://127.0.0.1:8819';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const uid = 'badge_' + Date.now().toString(36); let fails = 0;
  const run = async (vp, mobile, tag) => {
    const ctx = await b.newContext({ viewport: vp, ...(mobile ? { hasTouch: true, isMobile: true } : {}) }); await guardLocal(ctx);
    const p = await ctx.newPage(); p.st = null; const errs = []; p.on('pageerror', (e) => errs.push(String(e)));
    p.on('websocket', (ws) => ws.on('framereceived', (f) => { const s = String(f.payload); if (s.includes('"type":"meta_state"')) try { const j = JSON.parse(s); if (j.account) p.st = j; } catch {} }));
    await p.goto(assertLocalUrl(`${BASE}?name=Значки&uid=${uid}&ws=${WS}&fs=1&debug=1`));
    await p.waitForFunction(() => window.__game?.state?.().mode === 'hub', null, { timeout: 120000 }); await p.waitForTimeout(1000);
    await p.evaluate(() => window.__game.debug.selectClass('warrior')); await p.waitForTimeout(1500);
    const S = (o) => p.evaluate((x) => window.__game.debug.send(x), o);
    if (!mobile) {
      await S({ type: 'dev_grant', xp: 5000 });
      const lv = [1, 9, 10, 19, 20, 29, 30, 39, 40, 49, 50, 58];
      for (const l of lv) { await S({ type: 'dev_grant', item: 'night_bat_helmet' }); await S({ type: 'dev_grant', item: 'night_bat_helmet@c' }); }
      await S({ type: 'dev_grant', item: 'dew_slime_weapon' }); await S({ type: 'meta_get' }); await sleep(1500);
      const n = p.st.account.inv.filter((i) => i.id === 'night_bat_helmet' && !i.cursed), c = p.st.account.inv.filter((i) => i.cursed);
      for (let k = 0; k < lv.length; k++) { await S({ type: 'dev_grant', setUp: { uid: n[k].uid, up: lv[k] } }); await S({ type: 'dev_grant', setUp: { uid: c[k].uid, up: lv[k] } }); }
      const w = p.st.account.inv.find((i) => i.id === 'dew_slime_weapon'); await S({ type: 'dev_grant', setUp: { uid: w.uid, up: 58 } }); await S({ type: 'item_lock', uid: n[11].uid, on: true }); await S({ type: 'item_lock', uid: c[11].uid, on: true });
      await S({ type: 'equip', uid: w.uid }); await S({ type: 'equip', uid: n[6].uid }); await S({ type: 'meta_get' }); await sleep(1200);
    }
    await p.evaluate(() => window.__game.debug.openBook('gear')); await p.waitForTimeout(1000);
    const nb = await p.$$eval('.mc-upb', (x) => x.map((e) => e.className + ' ' + e.innerText));
    if (nb.length < 20) { fails++; console.log('FAIL мало значков', nb.length); } else console.log(`PASS ${tag}: значков ${nb.length}; ступени ${[...new Set(nb.map((s) => s.match(/t\d/)[0]))].join(',')}`);
    // значок не перекрывает замок
    const ov = await p.evaluate(() => [...document.querySelectorAll('.mc-item')].filter((c) => c.querySelector('.mc-lk') && c.querySelector('.mc-upb')).map((c) => { const a = c.querySelector('.mc-lk').getBoundingClientRect(), b = c.querySelector('.mc-upb').getBoundingClientRect(); return !(a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top); }));
    if (ov.some(Boolean) || !ov.length) { fails++; console.log('FAIL замок/значок', ov); } else console.log('PASS значок не перекрывает 🔒');
    await p.screenshot({ path: `${OUT}/${tag}-01-inventory-all-tiers.png` });
    const bag = await p.$('.mc-bag'); await bag.screenshot({ path: `${OUT}/${tag}-02-bag-closeup.png` });
    await p.$('.mc-gslots').then((e) => e.screenshot({ path: `${OUT}/${tag}-03-equip-slots.png` }));
    if (!mobile) {
      const cell = await p.$('.mc-bag .mc-item:has(.mc-upb.t6:not(.cz))'); const bb = await cell.boundingBox(); await p.mouse.move(bb.x + 10, bb.y + 10); await p.waitForTimeout(400);
      await p.screenshot({ path: `${OUT}/${tag}-04-tooltip.png` }); await p.mouse.move(3, 3);
      await cell.click(); await p.waitForTimeout(500); await p.mouse.move(3, 3); await p.$('.mc-detail').then((e) => e.screenshot({ path: `${OUT}/${tag}-05-item-card.png` }));
      // крупно: по одному значку каждой ступени ×4 (видно пиксели)
      await p.evaluate(() => { const d = document.createElement('div'); d.id = 'zoomrow'; d.style.cssText = 'position:fixed;left:10px;top:10px;z-index:99;background:#0e0a19;padding:10px;display:flex;gap:8px;transform:scale(3);transform-origin:0 0;border:1px solid #3b2c52';
        const seen = new Set(); for (const c of document.querySelectorAll('.mc-bag .mc-item')) { const u = c.querySelector('.mc-upb'); if (!u) continue; const k = u.className; if (seen.has(k)) continue; seen.add(k); const cl = c.cloneNode(true); cl.style.width = '52px'; d.appendChild(cl); } document.body.appendChild(d); });
      await p.waitForTimeout(300); await p.screenshot({ path: `${OUT}/${tag}-06-zoom-x3-all-tiers.png` }); await p.evaluate(() => document.getElementById('zoomrow').remove());
      await p.mouse.move(3, 3); await p.evaluate(() => { const d = document.createElement('div'); d.id = 'zoomcz'; d.style.cssText = 'position:fixed;left:10px;top:10px;z-index:99;background:#0e0a19;padding:10px;display:flex;gap:8px;transform:scale(3.2);transform-origin:0 0;border:1px solid #3b2c52';
        const seen = new Set(); for (const c of document.querySelectorAll('.mc-bag .mc-item')) { const u = c.querySelector('.mc-upb.cz'); if (!u || seen.has(u.className)) continue; seen.add(u.className); const cl = c.cloneNode(true); cl.style.width = '52px'; d.appendChild(cl); } document.body.appendChild(d); });
      await p.waitForTimeout(300); await p.screenshot({ path: `${OUT}/${tag}-06b-zoom-x3-cursed-tiers.png` }); await p.evaluate(() => document.getElementById('zoomcz').remove());
      await p.evaluate(() => window.__game.debug.openUpgrade()); await p.waitForTimeout(800); await p.screenshot({ path: `${OUT}/${tag}-07-petr-window.png` });
    }
    if (errs.length) { fails++; console.log('FAIL ошибки', errs); }
    await ctx.close();
  };
  await run({ width: 1280, height: 760 }, false, 'pc');
  await run({ width: 740, height: 360 }, true, 'mobile');
  await b.close(); console.log(fails ? fails + ' FAIL' : 'ALL PASS'); process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(3); });
