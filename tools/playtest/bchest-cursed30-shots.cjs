// Снимки: окно шансов для обычных и проклятых сундуков (☠), потолок зачарования «✦ не выше», открытый чёрный проклятый, админ-предпросмотр. VP=pc|iphone13|se. Только локальный стенд.
const { chromium, devices } = require('playwright-core');
const { guardLocal, assertLocalUrl } = require('/workspace/mg-qol/tools/playtest/_local.cjs');
const VP = process.env.VP || 'pc', OUT = '/workspace/morrisgrad-qol/shots/bchest6';
const VPS = { pc: { viewport: { width: 1366, height: 800 } }, iphone13: devices['iPhone 13'],
  se: { viewport: { width: 375, height: 667 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: devices['iPhone 13'].userAgent } };
const MOB = VP !== 'pc', BASE = 'http://127.0.0.1:5371', WS = 'ws://127.0.0.1:8971';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const d = { ...VPS[VP] }; delete d.defaultBrowserType; const ctx = await b.newContext(d); await guardLocal(ctx);
  await ctx.addInitScript(() => { try { localStorage.setItem('mc_ui_theme', 'new'); } catch {} });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(String(e).slice(0, 300)));
  const uid = MOB ? 'bc6_' + VP + Date.now().toString(36) : 'qa_admin';
  await p.goto(assertLocalUrl(`${BASE}/${MOB ? 'game.html' : 'game-panel.html'}?name=Сундуки&uid=${uid}&ws=${WS}&fs=1&debug=1${MOB ? '&mobile=1' : ''}`));
  await p.waitForFunction(() => window.__game?.state?.().mode === 'hub', null, { timeout: 120000 }); await sleep(1500);
  const G = (f, a) => p.evaluate(f, a); const S = (o) => G((x) => window.__game.debug.rawSend ? window.__game.debug.rawSend(x) : window.__game.debug.send(x), o);
  const shot = async (n) => { await G(() => document.querySelectorAll('.mcl-err[data-code="MC-A04"]').forEach((e) => e.remove())); await p.screenshot({ path: `${OUT}/${VP}-${n}.png` }); console.log('shot', `${OUT}/${VP}-${n}.png`); };
  await G(() => window.__game.debug.selectClass('warrior')); await sleep(2500);
  await G(() => window.__game.board?.tut?.('skip')); await sleep(500);
  await S({ type: 'dev_grant', xp: 3000000 }); await sleep(400);
  await S({ type: 'dev_grant', bchestGrant: { ranks: ['F'], L: 12, cat: 'weekly', cur: false } }); await sleep(300);
  await S({ type: 'dev_grant', bchestGrant: { ranks: ['D'], L: 12, cat: 'weekly', cur: false } }); await sleep(300);
  await S({ type: 'dev_grant', bchestGrant: { ranks: ['D'], L: 12, cat: 'weekly', cur: true } }); await sleep(300);
  await S({ type: 'dev_grant', bchestGrant: { ranks: ['SS'], L: 12, cat: 'monthly', cur: true } }); await sleep(400);
  await S({ type: 'dev_grant', bchestGrant: { ranks: ['SS'], L: 12, cat: 'monthly', cur: false } }); await sleep(800);
  await S({ type: 'meta_get' }); await sleep(1200);
  await G(() => window.__game.bchestWin.open()); await p.waitForSelector('#mc-bchest .bc-row', { timeout: 15000 }); await sleep(1200);
  const L = await G(() => window.__game.bchestWin.st.list.filter((c) => !c.opened).map((c) => ({ id: c.id, rank: c.rank, cur: !!c.cur, dark: !!c.dark, name: c.name, cap: c.odds?.enchCapName, art: c.odds?.art })));
  console.log('list', JSON.stringify(L.slice(-6)));
  const sel = async (f) => { const c = L.filter(f).pop(); if (!c) return null; await G((i) => { const e = document.querySelector(`#mc-bchest .bc-row[data-id="${i}"]`); e?.scrollIntoView({ block: 'nearest' }); e?.click(); }, c.id); await sleep(800); return c; };
  const checks = [];
  for (const [n, f] of [['01-simple', (c) => c.rank === 'F'], ['02-uncommon', (c) => c.rank === 'D' && !c.cur], ['03-uncommon-cursed', (c) => c.rank === 'D' && c.cur], ['04-black-cursed', (c) => c.rank === 'SS' && c.cur], ['04b-black-regular', (c) => c.rank === 'SS' && !c.cur]]) {
    const c = await sel(f); if (!c) { checks.push(n + ':нет'); continue; }
    const txt = await G(() => document.querySelector('#mc-bchest')?.innerText || '');
    const capOk = n === '01-simple' ? /не зачарован|✦ нет|без зачар/i.test(txt) : /✦/.test(txt);
    const curOk = c.cur ? /прокл/i.test(txt) : n !== '04b-black-regular' || /только в «Чёрном проклятом»/.test(txt);
    checks.push(`${n}: ${c.name} · art ${c.art}${c.dark ? '+dark' : ''} · cap ${c.cap || '—'} · ${capOk && curOk ? 'ok' : 'CHECK'}`);
    await p.mouse.move(2, 2); await shot(n);
  }
  // открыть обычный чёрный: чары до ✦6 есть, ☠+✦6 нет
  await sel((c) => c.rank === 'SS' && !c.cur); const bb = await (await p.$('#mc-bchest .bc-open')).boundingBox();
  if (MOB) await p.touchscreen.tap(bb.x + bb.width / 2, bb.y + bb.height / 2); else await p.click('#mc-bchest .bc-open');
  await p.waitForSelector('.bc-fx', { timeout: 8000 }).catch(() => {}); await sleep(900); await shot('05-black-regular-fx');
  await p.waitForSelector('.bc-fx', { state: 'detached', timeout: 30000 }).catch(() => {}); await sleep(1200);
  const it = await G(() => window.__game.bchestWin.cur()?.items || []);
  checks.push(`opened regular SS: ☠+✦6 ${it.filter((x) => x.c && x.e === 6).length} · ${it.some((x) => x.c && x.e === 6) ? 'CHECK' : 'ok'}`);
  console.log('opened SS (regular): items', it.length, 'cursed', it.filter((x) => x.c).length, 'black ✦6', it.filter((x) => x.e === 6).length, 'max ✦', Math.max(0, ...it.map((x) => x.e || 0)));
  await p.mouse.move(2, 2); await shot('06-black-regular-opened');
  if (!MOB) {
    await G(() => window.__game.bchestWin.close());
    await G(() => window.__game.debug.openAdmin()); await p.waitForFunction(() => window.__game.debug.admin().loaded, null, { timeout: 20000 });
    await G(() => document.querySelector('.mc-admin [data-tab="bchest"]')?.click()); await sleep(800);
    await G(() => document.querySelector('.mc-admin aside li[data-id]')?.click()); await sleep(1000);
    await G(() => document.querySelector('.mc-admin .bcp-go')?.click()); await sleep(1800);
    await G(() => document.querySelector('.mc-admin .mc-bcp')?.scrollIntoView()); await sleep(400); await shot('07-admin-preview');
    const rows = await G(() => [...document.querySelectorAll('.mc-admin .mc-bcp tr')].length); console.log('admin preview rows', rows);
    const rk = await G(() => [...document.querySelectorAll('.mc-admin .mc-bcp tr')].map((r) => r.innerText.replace(/\s+/g, ' ').slice(0, 120)).filter((t) => /шанс ☠ по рангам/.test(t)));
    console.log('preview ☠ ranks', JSON.stringify(rk)); checks.push(`preview SS 2%: ${rk.some((t) => /SS 2%/.test(t)) ? 'ok' : 'CHECK'}`);
    // поля рангов: max 30; ввод 100 → сервер отклоняет (локальный стенд, ничего не сохраняется)
    await G(() => { const i = document.querySelector('.mc-admin [data-p="rankCurse.F"]'); i?.closest('tr,label,div')?.scrollIntoView({ block: 'center' }); });
    const mx = await G(() => document.querySelector('.mc-admin [data-p="rankCurse.SS"]')?.max); checks.push(`field max ${mx}: ${mx === '30' ? 'ok' : 'CHECK'}`);
    await shot('08-admin-rank-fields');
    await G(() => { const i = document.querySelector('.mc-admin [data-p="rankCurse.SS"]'); i.value = '100'; i.dispatchEvent(new Event('input', { bubbles: true })); });
    await G(() => document.querySelector('.mc-admin [data-p="rankCurse.SS"]').closest('section,.sec,form,div[data-kind]')?.querySelector('[data-save]')?.click() ?? document.querySelector('.mc-admin [data-save]')?.click()); await sleep(1500);
    const m = await G(() => document.querySelector('.mc-admin .msg')?.textContent || ''); console.log('save 100 →', m); checks.push(`save SS=100 rejected: ${/30/.test(m) && !/Сохранено/i.test(m) ? 'ok' : 'CHECK'}`);
    await G(() => document.querySelector('.mc-admin .msg')?.scrollIntoView({ block: 'center' })); await shot('09-admin-reject-100');
    await G(() => { const i = document.querySelector('.mc-admin [data-p="rankCurse.SS"]'); i.value = ''; });
  }
  console.log(checks.join('\n'));
  console.log(VP, 'RESULT', checks.every((c) => / ok$/.test(c)) && !errs.length ? 'PASS' : 'CHECK', 'ERRORS', errs.length, JSON.stringify(errs));
  await b.close();
})().catch((e) => { console.error('FAIL', e); process.exit(1); });
