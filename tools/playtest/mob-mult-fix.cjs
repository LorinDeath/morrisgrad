// LOCAL: панель «Цель» у проклятого босса показывает броню/урон с множителями (сервер tg.armor/tg.dmg), ПК + телефон.
// Только 127.0.0.1 (guardLocal). MM_BASE=http://127.0.0.1:5311/game.html MM_WS=ws://127.0.0.1:8911 MM_WR=/workspace/mc-harness-mobfix/wr node tools/playtest/mob-mult-fix.cjs
const { chromium } = require('playwright-core');
const { guardLocal, assertLocalUrl } = require('./_local.cjs');
const fs = require('fs');
const OUT = process.env.OUT || '/workspace/morrisgrad-round3/mob-mult-fix';
const BASE = process.env.MM_BASE || 'http://127.0.0.1:5311/game-panel.html', WS = process.env.MM_WS || 'ws://127.0.0.1:8911', WR = process.env.MM_WR || '/workspace/mc-harness-mobfix/wr';
const TYPE = process.env.MM_MOB || 'ice_swarm_mother', TAG = process.env.MM_TAG || 'after';
const ADMIN = 'mm_admin_' + Date.now().toString(36);
require('child_process').execSync(`cd ${__dirname}/../../server && nice ../node_modules/.bin/wrangler d1 execute morrisgrad_db --local --persist-to ${WR} --command "INSERT OR REPLACE INTO player_roles (pkey, role, granted_by, granted_at) VALUES ('uid:${ADMIN}','admin','local-test',0)"`, { stdio: 'ignore', env: { ...process.env, CI: '1' } });
fs.mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
const run = async (b, label, ctxOpts, first) => {
  const ctx = await b.newContext(ctxOpts); const blocked = await guardLocal(ctx);
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(String(e).slice(0, 200)));
  const uid = ADMIN + (first ? '' : '_m');
  if (!first) require('child_process').execSync(`cd ${__dirname}/../../server && nice ../node_modules/.bin/wrangler d1 execute morrisgrad_db --local --persist-to ${WR} --command "INSERT OR REPLACE INTO player_roles (pkey, role, granted_by, granted_at) VALUES ('uid:${uid}','admin','local-test',0)"`, { stdio: 'ignore', env: { ...process.env, CI: '1' } });
  await p.goto(assertLocalUrl(`${BASE}?name=${uid}&uid=${uid}&ws=${WS}&fs=1&debug=1`));
  await p.waitForFunction(() => window.__game?.state?.().mode === 'hub', null, { timeout: 120000 }); await sleep(1500);
  const G = (fn, a) => p.evaluate(fn, a), S = (o) => G((x) => window.__game.debug.rawSend(x), o);
  if (first) { await S({ type: 'admin_save', kind: 'curse', id: 'main', patch: { mobHp: 20, mobDmg: 20, mobArmor: 20 } }); await sleep(2500); } // как на проде (только локальная база)
  await G(() => window.__game.debug.selectClass('warrior')); await sleep(2000);
  for (let i = 0; i < 8 && (await G(() => window.__game.state().world)) !== 'arinar'; i++) { await G(() => window.__game.debug.teleport(240, 600)); await sleep(700); await S({ type: 'use_portal', portalId: 'portal_arinar' }); await sleep(1800); }
  ok((await G(() => window.__game.state().world)) === 'arinar', `${label}: в Аринаре`);
  const X = first ? 31000 : 31600, Y = 9000;
  await G(([x, y]) => { window.__game.debug.rawSend({ type: 'dev_teleport', x, y, god: true }); window.__game.debug.teleport(x, y); }, [X, Y]); await sleep(2500);
  await S({ type: 'dev_spawn_mob', mob: TYPE, x: X + 150, y: Y - 20, cursed: true, special: 'boss' }); await sleep(1500);
  const mob = await G(([t, x, y]) => window.__game.debug.zoneMobsFull().filter((m) => m.type === t && m.cursed).sort((a, b) => Math.hypot(a.x - x, a.y - y) - Math.hypot(b.x - x, b.y - y))[0] || null, [TYPE, X, Y]);
  ok(!!mob, `${label}: проклятый ${TYPE} появился (ОЗ ${mob?.maxHp})`);
  const sel = mob ? await G((id) => window.__game.debug.selectMobId(id), mob.id) : false; ok(sel, `${label}: цель выбрана (id ${mob?.id})`);
  await sleep(2500);
  const panel = await G(() => { const t = (id) => document.getElementById(id)?.textContent || ''; return { name: t('ghud-target-name'), cls: t('ghud-target-class'), hp: t('ghud-target-hp'), armor: t('ghud-target-armor'), atk: t('ghud-target-atk') }; });
  console.log(label, JSON.stringify(panel));
  const panelShown = await G(() => !!document.getElementById('ghud-target-armor')?.offsetParent);
  if (panelShown) {
    ok(/Проклят/.test(panel.cls), `${label}: метка «☠ Проклятый»`);
    ok(+panel.armor > 19 && +panel.atk > 11.5, `${label}: броня ${panel.armor}, урон ${panel.atk} — с множителями (база 19 / 11.5)`);
  } else console.log(`INFO ${label}: боковой панели «Цель» на этом экране нет (телефон: .mc3d-mobile .game-hud-panel скрыта)`);
  await p.screenshot({ path: `${OUT}/${TAG}-${label}.png` });
  ok(!blocked.length, `${label}: нет запросов наружу`); ok(!errs.length, `${label}: без ошибок страницы ${errs.join(' | ')}`);
  await ctx.close(); return panel;
};
(async () => {
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const pc = await run(b, 'pc', { viewport: { width: 1440, height: 860 } }, true);
  const mob = await run(b, 'mobile', { viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }, false);
  fs.writeFileSync(`${OUT}/${TAG}-panel.json`, JSON.stringify({ pc, mob }, null, 1));
  await b.close();
  console.log(fails ? `FAILED ${fails}` : 'mob-mult-fix ok'); process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
