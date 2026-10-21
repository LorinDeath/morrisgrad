// LOCAL ONLY: скриншоты VN-диалогов по персонажам (TAG=before|after) — сверка арта Историка (public/mc-vn).
const { chromium } = require('playwright-core');
const { guardLocal, assertLocalUrl } = require('./_local.cjs');
const TAG = process.env.TAG || 'after', OUT = process.env.OUT || '/workspace/morrisgrad-round3/ui-rework/vn';
const BASE = process.env.UI_BASE || 'http://127.0.0.1:5311/game.html', WS = process.env.UI_WS || 'ws://127.0.0.1:8911';
assertLocalUrl(BASE); assertLocalUrl(WS);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const SHOTS = [['mage', 'joy'], ['mage', 'think'], ['rogue', 'determined'], ['spearman', 'anger'], ['warrior', 'fear'], ['alzi', 'calm'], ['leyr', 'sad'], ['kyut', 'smirk'], ['petr', 'joy'], ['black_mage', 'smirk']];
(async () => {
  require('fs').mkdirSync(OUT, { recursive: true });
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const ctx = await b.newContext({ viewport: { width: 1280, height: 760 } }); const blocked = await guardLocal(ctx);
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(String(e).slice(0, 200)));
  await p.goto(assertLocalUrl(`${BASE}?name=VN&uid=vn_${TAG}${Date.now().toString(36)}&ws=${WS}&fs=1&debug=1`));
  await p.waitForFunction(() => window.__game?.state?.().mode === 'hub', null, { timeout: 120000 }); await sleep(1000);
  await p.evaluate(() => window.__game.debug.selectClass('warrior')); await sleep(1500);
  for (const [who, emo] of SHOTS) {
    await p.evaluate(([w, e]) => window.__game.debug.vn(w, e, `${w} · ${e}: сверка арта.`), [who, emo]); await sleep(1500);
    await p.screenshot({ path: `${OUT}/${TAG}-${who}-${emo}.png` });
    await p.evaluate(() => document.querySelector('.mc-vn button.ghost, .mc-dialog button.ghost')?.click()); await p.keyboard.press('Escape'); await sleep(500);
  }
  console.log(errs.length ? 'FAIL ошибки: ' + errs.join(' | ') : 'PASS без ошибок страницы', blocked.length ? 'FAIL внешние' : 'PASS только локально');
  await b.close();
})().catch((e) => { console.error(e); process.exit(2); });
