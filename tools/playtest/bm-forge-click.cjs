// LOCAL: регрессия «кузня Знахаря зависает» — окно открывается из диалога и закрывается НАСТОЯЩИМИ кликами мыши
// (p.mouse по координатам: элемент под курсором = кнопка кузни, а не холст). Только 127.0.0.1.
const { chromium } = require('playwright-core');
const { execSync } = require('node:child_process');
const fs = require('fs');
const { guardLocal, assertLocalUrl } = require('./_local.cjs');
const OUT = process.env.OUT || '/workspace/black-magic/shots-forgefix';
const BASE = process.env.UD_BASE || 'http://127.0.0.1:5414/game.html', WS = process.env.UD_WS || 'ws://127.0.0.1:8414';
const PERSIST = process.env.PERSIST || '/workspace/mc-harness-ice/wr';
const VIDEO = process.env.VIDEO || '';
assertLocalUrl(BASE); assertLocalUrl(WS); fs.mkdirSync(OUT, { recursive: true });
const W = '/workspace/mc-ui-tools/node_modules/.bin/wrangler';
const d1 = (sql) => JSON.parse(execSync(`cd /workspace/mg-ice/server && PATH=/workspace/tools/node22/bin:$PATH ${W} d1 execute morrisgrad_db --local --persist-to ${PERSIST} --json --command ${JSON.stringify(sql)}`, { stdio: 'pipe' }).toString())[0].results;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let ok = 0, bad = 0; const t = (n, c, x) => { c ? ok++ : bad++; console.log(c ? 'ok  ' : 'FAIL', n, x === undefined ? '' : JSON.stringify(x).slice(0, 400)); };
const U = 'qa_bmfc_' + Date.now().toString(36);
(async () => {
  d1(`INSERT OR REPLACE INTO player_roles (pkey, role, granted_by, granted_at) VALUES ('uid:${U}', 'admin', 'local-test', 0)`);
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const ctx = await b.newContext({ viewport: { width: 1440, height: 860 }, ...(VIDEO ? { recordVideo: { dir: VIDEO, size: { width: 1280, height: 764 } } } : {}) });
  await guardLocal(ctx); await ctx.addInitScript(() => { try { localStorage.setItem('mc_fs_auto', '0'); localStorage.setItem('mc_ui_theme', 'new'); } catch {} });
  const p = await ctx.newPage(); const errs = [];
  p.on('pageerror', (e) => errs.push(String(e.stack || e).slice(0, 400)));
  const G = (f, a) => p.evaluate(f, a);
  const shot = async (n) => { await G(() => document.querySelectorAll('.mcl-err').forEach((e) => e.remove())); await sleep(300); await p.screenshot({ path: `${OUT}/${n}.png` }); console.log('shot', `${OUT}/${n}.png`); };
  // что под курсором в центре элемента (то, что получит настоящий клик)
  const hit = (sel) => G((sel) => { const e = document.querySelector(sel); if (!e) return { none: true }; const r = e.getBoundingClientRect(); const x = r.x + r.width / 2, y = r.y + r.height / 2; const top = document.elementFromPoint(x, y);
    return { x, y, top: top ? top.tagName + '.' + String(top.className).slice(0, 40) : null, own: !!top && (top === e || e.contains(top)), pe: getComputedStyle(e).pointerEvents }; }, sel);
  const realClick = async (sel) => { const h = await hit(sel); if (!h.none) await p.mouse.click(h.x, h.y); return h; };
  await p.goto(assertLocalUrl(`${BASE}?name=${U}&uid=${U}&ws=${WS}&fs=1&debug=1`));
  await p.waitForFunction(() => window.__game?.state?.().mode === 'hub' && window.__game?.debug, null, { timeout: 120000 }); await sleep(2500);
  await G(() => window.__game.debug.selectClass('warrior')); await sleep(2500); await G(() => window.__game.board?.tut?.('skip')); await sleep(400);
  for (let i = 0; i < 8 && (await G(() => window.__game.state().world)) !== 'arinar'; i++) { await G(() => { window.__game.debug.rawSend({ type: 'dev_teleport', x: 240, y: 600 }); window.__game.debug.teleport(240, 600); }); await sleep(1200); await G(() => window.__game.debug.rawSend({ type: 'use_portal', portalId: 'portal_arinar' })); await sleep(3000); }
  let z = null; for (let i = 0; i < 20 && !z; i++) { z = await G(() => window.__game.debug.npcByName('Знахарь')); if (!z) await sleep(700); }
  t('Знахарь найден', !!z, z);
  let dlg = false;
  for (let i = 0; i < 4 && !dlg; i++) {
    const q = await G((id) => window.__game.debug.npcAt(id), z.id); await G(([x, y]) => window.__game.debug.tp(x, y + 30, true), [q.x, q.y]); await sleep(1200);
    await G((id) => window.__game.debug.rawSend({ type: 'npc_talk', npc: id }), z.id); await sleep(1500);
    dlg = await G(() => [...document.querySelectorAll('button')].some((b) => b.textContent.includes('Кузня Знахаря')));
  }
  t('диалог Знахаря с кнопкой кузни', dlg);
  // открыть кузню НАСТОЯЩИМ кликом по кнопке диалога
  await G(() => { const b = [...document.querySelectorAll('button')].find((b) => b.textContent.includes('Кузня Знахаря')); if (b) b.setAttribute('data-qa', 'forge-btn'); });
  const h0 = await realClick('[data-qa="forge-btn"]'); await sleep(1800);
  t('кузня открылась от клика мышью', await G(() => !!window.__game.forgeWin?.isOpen), h0);
  await shot('01-forge-open');
  // вкладка «Сборка» — настоящий клик
  const h1 = await hit('.bmf [data-f="tab"][data-v="asm"]'); t('под курсором — вкладка кузни (не холст)', h1.own, h1);
  await p.mouse.click(h1.x, h1.y); await sleep(900);
  t('клик по вкладке работает', await G(() => window.__game.forgeWin.tab === 'asm'), await G(() => window.__game.forgeWin.tab));
  await shot('02-forge-tab-asm');
  const h2 = await hit('.bmf [data-f="x"]'); t('под курсором — крестик ×', h2.own, h2);
  await p.mouse.click(h2.x, h2.y); await sleep(800);
  t('крестик закрывает кузню', await G(() => !window.__game.forgeWin.isOpen && getComputedStyle(document.querySelector('.bmf')).display === 'none'));
  // после закрытия интерфейс жив: кнопки HUD кликаются (элемент под курсором — не скрытая кузня)
  const h3 = await G(() => { const e = [...document.querySelectorAll('.mc3d-layer button')].find((b) => !b.closest('.bmf') && b.offsetParent && b.getBoundingClientRect().width > 10); if (!e) return null; const r = e.getBoundingClientRect(); const top = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); return { own: !!top && (top === e || e.contains(top)), cls: e.className }; });
  t('после закрытия кнопки HUD доступны', !!h3 && h3.own, h3);
  // повторное открытие/закрытие клавишей Esc и снова мышью
  await G(() => window.__game.forgeWin.open()); await sleep(800);
  const h4 = await hit('.bmf [data-f="x"]'); await p.mouse.click(h4.x, h4.y); await sleep(600);
  t('повторно: открылась и закрылась мышью', await G(() => !window.__game.forgeWin.isOpen), h4);
  await G(() => window.__game.forgeWin.open()); await sleep(800); await p.mouse.click(5, 5).catch(() => {}); await p.keyboard.press('Escape'); await sleep(600);
  t('Esc закрывает кузню', await G(() => !window.__game.forgeWin.isOpen));
  await shot('03-forge-closed');
  t('без ошибок страницы', errs.length === 0, errs.slice(0, 3));
  console.log(`\n${ok} ok, ${bad} FAIL`); await ctx.close(); await b.close(); process.exit(bad ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
