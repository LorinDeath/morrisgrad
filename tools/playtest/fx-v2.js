// FX atlas v2: все листы грузятся, снаряды игрока/монстров (11 семейств + босс), эффекты навыков (конусы, новы, рывки, удар стража),
// телеграфы и метки — спрайтами нового атласа; нет ключей без спрайта и ошибок страницы. Только локально.
const { chromium } = require('playwright-core');
const { guardLocal, assertLocalUrl } = require(process.env.MC_LOCAL_GUARD || './_local');
const OUT = process.env.OUT || '/workspace/morrisgrad-round3/fx-v2', URL = 'http://127.0.0.1:5199/game.html?name=Алекс&uid=test_fx2&ws=ws://127.0.0.1:8787&fs=1&debug=1';
require('fs').mkdirSync(OUT, { recursive: true });
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
(async () => {
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const ctx = await b.newContext({ viewport: { width: 1440, height: 860 } }); await guardLocal(ctx);
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(String(e).slice(0, 200)));
  const warn = []; p.on('console', (m) => { if (/\[fx2\]/.test(m.text())) warn.push(m.text()); });
  await p.goto(assertLocalUrl(URL)); await p.waitForFunction(() => window.__game?.state?.().mode === 'hub', null, { timeout: 120000 }); await p.waitForTimeout(2500);
  const G = (f, a) => p.evaluate(f, a);
  // в пустое место хаба (без NPC)
  await G(([X, Y]) => { if (!X) return; window.__game.debug.rawSend({ type: 'dev_teleport', x: X, y: Y }); window.__game.debug.tp?.(X, Y); }, [+(process.env.FX_X || 0), +(process.env.FX_Y || 0)]); await p.waitForTimeout(2500);
  await p.waitForFunction(() => window.__game.debug.projs().ready, null, { timeout: 30000 }).catch(() => {});
  ok(await G(() => window.__game.debug.projs().ready), 'все 7 листов FX v2 загружены');
  await G(() => window.__game.debug.projDemo()); await p.waitForTimeout(1500);
  await p.screenshot({ path: `${OUT}/fx2-player-projectiles.png` });
  await G(() => window.__game.debug.fxDemo('clear'));
  await G(() => window.__game.debug.fxDemo('enemy')); await p.waitForTimeout(1500);
  await p.screenshot({ path: `${OUT}/fx2-enemy-families.png` });
  await G(() => window.__game.debug.fxDemo('clear'));
  await G(() => window.__game.debug.fxDemo('skills')); await p.waitForTimeout(700);
  await p.screenshot({ path: `${OUT}/fx2-skills.png` });
  await G(() => window.__game.debug.fxDemo('clear'));
  await p.waitForTimeout(300);
  await G(() => window.__game.debug.fxDemo('tele')); await p.waitForTimeout(700);
  await p.screenshot({ path: `${OUT}/fx2-telegraphs.png` });
  const miss = await G(() => window.__fxMissing?.() || []);
  ok(miss.length === 0, `нет ключей без спрайта: ${JSON.stringify(miss)}`);
  ok(errs.length === 0, `нет ошибок страницы: ${JSON.stringify(errs)}`);
  console.log(fails ? `FAILED ${fails}` : 'ALL PASS'); await b.close(); process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
