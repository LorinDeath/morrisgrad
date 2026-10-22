// LOCAL: сцена открытия сундука наград в ПОЛНОМ ЭКРАНЕ и в окне (ПК 1280×800, iPhone 13). Регрессия: слой .bc-fx вешался на <body>,
// а в полный экран уходил #game-window — браузер не рисует ничего вне полноэкранного элемента, вспышки не было видно.
// Проверка: слой открытия внутри полноэкранного элемента (или полного экрана нет), кадр вспышки снят. Только 127.0.0.1 (_local.cjs).
const { chromium } = require('playwright-core');
const fs = require('fs');
const { guardLocal, assertLocalUrl } = require('./_local.cjs');
const OUT = process.env.OUT || '/workspace/morrisgrad-qol/shots/post1022/chest-flash';
const BASE = process.env.UD_BASE || 'http://127.0.0.1:5395/game.html', WS = process.env.UD_WS || 'ws://127.0.0.1:8995';
assertLocalUrl(BASE); assertLocalUrl(WS); fs.mkdirSync(OUT, { recursive: true });
const ATLAS = require('../../src/assets/mc/rewardchest/chests_atlas.json');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let ok = 0, bad = 0; const t = (n, c, x) => { c ? (ok++, console.log('ok  ', n, x === undefined ? '' : JSON.stringify(x))) : (bad++, console.log('FAIL', n, x === undefined ? '' : JSON.stringify(x))); };
const RANK = process.env.RANK || 'C'; // C → «Редкий сундук»
async function run(b, mob, full) {
  const tag = (mob ? 'iphone13' : 'pc') + (full ? '-fullscreen' : '-window');
  const ctx = await b.newContext(mob ? { viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1' } : { viewport: { width: 1280, height: 800 } });
  await guardLocal(ctx);
  await ctx.addInitScript(() => { try { localStorage.setItem('mc_fs_auto', '0'); } catch {} }); // автовход выключен — входим кнопкой у миникарты
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(String(e).slice(0, 200)));
  await p.clock.install();
  const uid = 'qa_fsfl_' + tag.replace(/-/g, '_') + '_' + Date.now().toString(36);
  await p.goto(assertLocalUrl(`${BASE}?name=${uid}&uid=${uid}&ws=${WS}&fs=1&debug=1${mob ? '&mobile=1' : ''}`));
  await p.waitForFunction(() => window.__game?.state?.().mode === 'hub', null, { timeout: 120000 }); await sleep(1500);
  const G = (f, a) => p.evaluate(f, a);
  await G(() => document.querySelectorAll('.mcl-err').forEach((e) => e.remove()));
  await G(() => window.__game.debug.selectClass('warrior')); await sleep(2500);
  await G(() => window.__game.board?.tut?.('skip')); await sleep(600);
  await G((r) => window.__game.debug.rawSend({ type: 'dev_grant', xp: 3000, bchestGrant: { ranks: [r], L: 12, cat: 'daily' } }), RANK); await sleep(1200);
  await G(() => window.__game.debug.rawSend({ type: 'meta_get' })); await sleep(1200);
  if (full) {
    const fb = await p.$('.ig-fs:not([hidden])'); t(`${tag}: кнопка полного экрана у миникарты`, !!fb);
    if (fb) { await fb.click(); await sleep(600); }
    const fe = await G(() => { const f = document.fullscreenElement; return f ? (f === document.documentElement ? 'html' : f.id || f.className) : null; });
    t(`${tag}: в полном экране весь документ`, fe === 'html', fe);
  }
  if (mob) await p.tap('.mc3d-tbtn[data-act="chests"]').catch(() => G(() => window.__game.bchestWin?.open?.())); else await p.keyboard.press('KeyY');
  await p.waitForSelector('#mc-bchest .bc-row', { timeout: 15000 }); await sleep(800);
  const c = await G(() => window.__game.bchestWin.st.list[0]); await G((id) => document.querySelector(`#mc-bchest .bc-row[data-id="${id}"]`)?.click(), c.id); await sleep(400);
  if (mob) await p.tap('#mc-bchest .bc-open'); else await p.click('#mc-bchest .bc-open');
  await p.waitForSelector('.bc-fx[data-run]', { timeout: 15000 });
  for (let tr = 0; tr < 5; tr++) { try { await p.clock.pauseAt((await G(() => Date.now())) + 60); break; } catch (e) { if (tr === 4) throw e; } }
  const vis = await G(() => { const fx = document.querySelector('.bc-fx'), f = document.fullscreenElement; const r = fx.getBoundingClientRect(); return { inFs: f ? f.contains(fx) : null, w: Math.round(r.width), h: Math.round(r.height), z: getComputedStyle(fx).zIndex, n: window.__game.bchestWin.st.list.find((x) => x.id === window.__game.bchestWin.sel)?.items?.length }; });
  t(`${tag}: слой открытия виден (внутри полноэкранного элемента / в окне)`, (full ? vis.inFs === true : vis.inFs === null) && vis.w > 300 && vis.h > 300, vis);
  const ev = ATLAS.keys['chest_open_' + c.art]?.events || { flash: 12, items_out: 14, idle_start: 30 };
  let tt = 0; for (const [n, f] of [['a-shake', ev.flash - 3], ['b-flash', ev.flash + 1], ['c-items', ev.items_out + 8]]) { const ms = Math.round(f * 1000 / 24) - tt; if (ms > 0) { await p.clock.runFor(ms); tt += ms; } await sleep(150); await p.screenshot({ path: `${OUT}/${tag}-${c.art}-${n}.png` }); }
  await p.clock.resume();
  await p.waitForSelector('.bc-fx', { state: 'detached', timeout: 20000 }).catch(() => {});
  await sleep(700); await p.screenshot({ path: `${OUT}/${tag}-${c.art}-d-grid.png` });
  t(`${tag}: без ошибок страницы`, !errs.length, errs);
  await ctx.close();
}
(async () => {
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  try { for (const [m, f] of [[false, true], [false, false], [true, false]]) await run(b, m, f); }
  catch (e) { bad++; console.log('FAIL exception', String(e).slice(0, 400)); }
  await b.close(); console.log(`bchest-fs-flash: ${ok} ok, ${bad} fail`); process.exit(bad ? 1 : 0);
})();
