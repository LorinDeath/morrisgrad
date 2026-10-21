// LOCAL: смена дня и ночи в Аринаре — снимки одного места в разные минуты (хаб, дикая земля, Альказак) + GIF ускоренного заката.
// Только 127.0.0.1 (guardLocal). Часы закрепляются локально (debug.dn({pin})) — сервер и админ-форс проверяет dayNight-test.ts.
const { chromium } = require('playwright-core');
const { execFileSync } = require('child_process');
const fs = require('fs');
const { guardLocal, assertLocalUrl } = require('./_local.cjs');
const OUT = process.env.OUT || '/workspace/morrisgrad-round3/dome-city/daynight';
const BASE = process.env.C_BASE || 'http://127.0.0.1:5297/game.html', WS = process.env.C_WS || 'ws://127.0.0.1:8883';
assertLocalUrl(BASE); assertLocalUrl(WS); fs.mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let ok = 0, bad = 0; const t = (n, c, x) => { c ? (ok++, console.log('ok  ', n)) : (bad++, console.log('FAIL', n, x === undefined ? '' : JSON.stringify(x))); };
const PLACES = { hub: [24000, 24000], wild: [25472, 2260], city: [24624, 3560] };
const STAGES = ['12:00', '19:30', '19:40', '19:50', '20:00', '23:00', '05:30', '05:45', '06:00'];
(async () => {
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const ctx = await b.newContext({ viewport: { width: 1280, height: 760 } }); await guardLocal(ctx);
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(String(e)));
  await p.goto(assertLocalUrl(`${BASE}?name=dn_test&uid=dn_test&ws=${WS}&fs=1&debug=1`));
  await p.waitForFunction(() => window.__game?.state?.().mode === 'hub', null, { timeout: 120000 }); await sleep(800);
  const G = (f, a) => p.evaluate(f, a);
  if ((await G(() => window.__game.state().player?.stats?.classId)) == null) { await G(() => window.__game.debug.selectClass('warrior')); await sleep(1500); }
  for (let i = 0; i < 8 && (await G(() => window.__game.state().world)) !== 'arinar'; i++) { await G(() => { window.__game.debug.rawSend({ type: 'dev_teleport', x: 240, y: 600 }); window.__game.debug.teleport(240, 600); }); await sleep(1200); await G(() => window.__game.debug.rawSend({ type: 'use_portal', portalId: 'portal_arinar' })); await sleep(3000); }
  t('в Аринаре', (await G(() => window.__game.state().world)) === 'arinar');
  // часы с сервера: Europe/Kiev, близко к реальному
  await sleep(1500); let d = await G(() => window.__game.debug.dn());
  const kiev = (() => { const f = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Kiev', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date()).split(':').map(Number); return f[0] * 60 + f[1]; })();
  t('часы сервера = Киев', Math.abs(((d.min - kiev + 720 + 1440) % 1440) - 720) < 3, { d, kiev });
  const tp = async (x, y) => { await G(([x, y]) => window.__game.debug.tp(x, y, true), [x, y]); await sleep(2500); };
  const res = {};
  for (const [pl, [x, y]] of Object.entries(PLACES)) {
    await tp(x, y); await G(() => window.__game.debug.setCells(16)); await sleep(1500);
    for (const s of STAGES) {
      await G((s) => window.__game.debug.dn({ pin: s }), s); await sleep(700);
      d = await G(() => window.__game.debug.dn()); res[`${pl}@${s}`] = d;
      await p.screenshot({ path: `${OUT}/${pl}-${s.replace(':', '')}.png` });
    }
    console.log(pl, STAGES.map((s) => `${s}:${res[`${pl}@${s}`].phase}/${res[`${pl}@${s}`].n}L/${res[`${pl}@${s}`].ms}ms`).join(' '));
  }
  t('полдень — проход выключен', !res['hub@12:00'].active);
  t('20:00 — ночь, проход включён', res['hub@20:00'].active && res['hub@20:00'].phase === 'night');
  t('ночью есть источники света (герой + огни)', res['city@20:00'].n >= 2 && res['wild@20:00'].n >= 2, { c: res['city@20:00'].n, w: res['wild@20:00'].n });
  t('кадр маски дешёвый (< 3 мс)', Object.values(res).every((r) => r.ms < 3), Object.values(res).map((r) => r.ms));
  // «смягчить ночь»
  await tp(...PLACES.city); await G(() => { localStorage.setItem('mc-dn-reduce', '60'); window.__game.debug.dn({ pin: '23:00' }); }); await sleep(700);
  const soft = await G(() => window.__game.debug.dn()); await p.screenshot({ path: `${OUT}/city-2300-reduce60.png` });
  t('смягчить ночь: светлее', Math.min(...soft.color) > Math.min(...res['city@23:00'].color) + 0.2, { soft: soft.color, n: res['city@23:00'].color });
  await G(() => localStorage.removeItem('mc-dn-reduce'));
  // HUD читаемый: DOM не затронут — проверяем, что панель HUD видна и непрозрачна
  const hudOk = await G(() => { const e = document.querySelector('.mc3d-hud, .mc-hud, #hud'); return !e || getComputedStyle(e).opacity !== '0'; }); t('HUD поверх (DOM не темнеет)', hudOk);
  // дом города: свет выключен внутри
  // GIF: закат 19:26…20:04 в Альказаке (минута за кадр)
  const gdir = `${OUT}/gif`; fs.mkdirSync(gdir, { recursive: true });
  let i = 0; for (let m = 19 * 60 + 26; m <= 20 * 60 + 4; m += 1, i++) { await G((m) => window.__game.debug.dn({ pin: m }), m); await sleep(250); await p.screenshot({ path: `${gdir}/f${String(i).padStart(3, '0')}.png` }); }
  let j = i; for (let m = 5 * 60 + 26; m <= 6 * 60 + 4; m += 1, j++) { await G((m) => window.__game.debug.dn({ pin: m }), m); await sleep(250); await p.screenshot({ path: `${gdir}/f${String(j).padStart(3, '0')}.png` }); }
  try {
    execFileSync('nice', ['ffmpeg', '-y', '-loglevel', 'error', '-framerate', '8', '-i', `${gdir}/f%03d.png`, '-vf', 'scale=640:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=128[p];[b][p]paletteuse=dither=bayer', `${OUT}/dusk-dawn-city.gif`]);
    t('GIF собран', fs.statSync(`${OUT}/dusk-dawn-city.gif`).size > 10000);
  } catch (e) { t('GIF собран', false, String(e)); }
  await G(() => window.__game.debug.dn({ pin: null }));
  fs.writeFileSync(`${OUT}/stages.json`, JSON.stringify(res, null, 1));
  t('без ошибок страницы', errs.length === 0, errs.slice(0, 3));
  console.log(`day-night: ${ok} ok, ${bad} fail`); await b.close(); process.exit(bad ? 1 : 0);
})().catch((e) => { console.error('FAIL', e); process.exit(1); });
