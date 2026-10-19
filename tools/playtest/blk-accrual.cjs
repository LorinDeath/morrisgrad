// LOCAL: регрессия очернения — одна вещь 35%, остальные 0; взрыв мага (+2%) и смерть (+N) — растут ВСЕ надетые; meta_state и D1 (local).
const { chromium } = require('playwright-core');
const { guardLocal, assertLocalUrl } = require('./_local.cjs');
const BASE = process.env.BM_BASE || 'http://127.0.0.1:5293/game.html', WS = process.env.BM_WS || 'ws://127.0.0.1:8879';
const PERSIST = process.env.BM_PERSIST || '/workspace/mc-harness-bm/wr';
assertLocalUrl(BASE); assertLocalUrl(WS);
const UID = 'blk_acc_' + Date.now().toString(36);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
(async () => {
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const ctx = await b.newContext({ viewport: { width: 1280, height: 760 } }); await guardLocal(ctx);
  const p = await ctx.newPage(); p.st = null;
  p.on('websocket', (ws) => ws.on('framereceived', (f) => { const s = String(f.payload); if (s.includes('"type":"meta_state"')) try { p.st = JSON.parse(s); } catch {} }));
  await p.goto(assertLocalUrl(`${BASE}?name=${UID}&uid=${UID}&ws=${WS}&fs=1&debug=1`));
  await p.waitForFunction(() => window.__game?.state?.().mode === 'hub', null, { timeout: 120000 }); await sleep(800);
  await p.evaluate(() => window.__game.debug.selectClass('warrior')); await sleep(1200);
  const S = (o) => p.evaluate((x) => window.__game.debug.send(x), o);
  for (let i = 0; i < 8 && (await p.evaluate(() => window.__game.state().world)) !== 'arinar'; i++) { await p.evaluate(() => { window.__game.debug.rawSend({ type: 'dev_teleport', x: 240, y: 600 }); window.__game.debug.teleport(240, 600); }); await sleep(900); }
  await S({ type: 'dev_grant', xp: 60000 }); await sleep(500);
  for (const id of ['dew_slime_helmet', 'dew_slime_armor', 'dew_slime_legs', 'dew_slime_hands']) await S({ type: 'dev_grant', item: id });
  await sleep(1500);
  for (const it of p.st.account.inv) { await S({ type: 'equip', uid: it.uid }); await sleep(250); }
  await sleep(1500);
  const worn = () => (p.st?.account?.inv || []).filter((i) => Object.values(p.st?.hero?.equip || {}).includes(i.uid)).map((i) => ({ uid: i.uid, id: i.id, blk: i.blk || 0 }));
  let w = worn(); ok(w.length >= 3, 'надето: ' + w.map((x) => x.id).join(', '));
  const legs = w.find((x) => /legs/.test(x.id)) || w[0];
  await S({ type: 'dev_grant', bm: { blk: 0 } }); await sleep(300); await S({ type: 'dev_grant', bm: { blkUid: { uid: legs.uid, v: 35 } } }); await sleep(1800);
  w = worn(); console.log('  до:', w.map((x) => `${x.id}:${x.blk}`).join(' '));
  ok(w.find((x) => x.uid === legs.uid).blk === 35 && w.filter((x) => x.uid !== legs.uid).every((x) => x.blk === 0), 'исходно: ноги 35%, остальные 0');
  await S({ type: 'dev_grant', bm: { mortal: 1 } }); await sleep(300);
  for (let i = 0; i < 3; i++) { await S({ type: 'dev_grant', bm: { hurt: { pct: 1, blk: 2 } } }); await sleep(250); }
  await sleep(2500);
  w = worn(); console.log('  после 3 взрывов:', w.map((x) => `${x.id}:${x.blk}`).join(' '));
  ok(w.every((x) => x.blk === (x.uid === legs.uid ? 41 : 6)), '3 взрыва по +2%: ноги 41%, остальные 6%');
  await S({ type: 'dev_grant', bm: { hits: 5 } }); await sleep(200); await S({ type: 'dev_grant', bm: { die: 1 } }); await sleep(2500);
  w = worn(); console.log('  после смерти (5 попаданий):', w.map((x) => `${x.id}:${x.blk}`).join(' '));
  ok(w.every((x) => x.blk === (x.uid === legs.uid ? 46 : 11)), 'смерть после 5 попаданий: +5% всем');
  await sleep(7000);
  const out = require('child_process').execSync(`cd /workspace/mg-blackmage/server && nice ../node_modules/.bin/wrangler d1 execute morrisgrad_db --local --persist-to ${PERSIST} --json --command "SELECT instance_id, item_id, blk FROM item_instances WHERE owner = 'uid:${UID}' AND state = 'inv'"`, { encoding: 'utf8' });
  const rows = JSON.parse(out)[0].results; console.log('  D1:', rows.map((r) => `${r.item_id}:${r.blk}`).join(' '));
  ok(w.every((x) => rows.find((r) => r.instance_id === x.uid)?.blk === x.blk), 'D1 (local) совпадает с сервером');
  console.log(fails ? `FAILED ${fails}` : 'blk-accrual ok'); await b.close(); process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
