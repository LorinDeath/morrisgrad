// r6: лист персонажа (C) и книга (B) вписаны в игровое окно в обеих раскладках (с боковыми панелями / без);
// панель отряда сверху, не перекрывает трекер заданий; полоски ОЗ союзников по отряду — фиолетовые. → /workspace/morrisgrad-round3/r6-*.png
const { chromium } = require('playwright-core');
const OUT = '/workspace/morrisgrad-round3', WS = 'ws://127.0.0.1:8787';
(async () => {
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  let pass = 0, fail = 0; const errs = []; const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? 'PASS ' : 'FAIL ') + m); };
  const mk = async (name, panels, vp = { width: 1440, height: 860 }) => { const p = await (await b.newContext({ viewport: vp })).newPage(); p.on('pageerror', (e) => errs.push(String(e).slice(0, 200)));
    await p.goto(`http://127.0.0.1:5199/game.html?name=${name}&ws=${WS}&fs=1&debug=1${panels ? '&panels=1' : ''}`);
    await p.waitForFunction(() => window.__game?.state?.().mode === 'hub', null, { timeout: 120000 }); await p.waitForTimeout(2000);
    await p.evaluate(() => window.__game.debug.selectClass('mage')); await p.waitForTimeout(2500); return p; };
  const inside = (p, sel) => p.evaluate((sel) => { const L = document.querySelector('.mc3d-layer').getBoundingClientRect(); const e = document.querySelector(sel); if (!e) return { ok: false, why: 'нет ' + sel };
    const r = e.getBoundingClientRect(); const ok = r.left >= L.left - 1 && r.right <= L.right + 1 && r.top >= L.top - 1 && r.bottom <= L.bottom + 1;
    return { ok, L: [L.left, L.right, L.top, L.bottom].map(Math.round), r: [r.left, r.right, r.top, r.bottom].map(Math.round) }; }, sel);
  for (const [lay, panels] of [['panels', true], ['full', false]]) {
    const p = await mk('R6' + lay, panels);
    if (panels) { const ctl = await p.evaluate(() => document.querySelector('.hud-left')?.innerText || ''); ok(/Меню\s*B/.test(ctl) && /Персонаж\s*C/.test(ctl) && !/Бестиарий\s*B/.test(ctl), 'панель «Управление»: Меню B, Персонаж C'); }
    await p.mouse.click(p.viewportSize().width / 2, 430); await p.keyboard.press('KeyC'); await p.waitForSelector('.mc-charsheet', { timeout: 10000 }).catch(() => {}); await p.waitForTimeout(1200);
    let r = await inside(p, '.mc-charsheet'); ok(r.ok, `${lay}: лист персонажа внутри окна игры ${JSON.stringify(r)}`);
    const tal = await inside(p, '.mc-cs-tal'); const sc = await p.evaluate(() => { const c = document.querySelector('.mc-cs-cols'); return c.scrollHeight > c.clientHeight + 2 || c.scrollWidth > c.clientWidth + 2 ? 'scroll' : 'fit'; });
    ok(true, `${lay}: дерево талантов ${tal.ok ? 'видно в окне' : 'ниже (прокрутка)'} · колонки: ${sc}`);
    await p.screenshot({ path: `${OUT}/r6-${lay}-charsheet.png` });
    await p.keyboard.press('KeyC'); await p.waitForTimeout(400); await p.keyboard.press('KeyB'); await p.waitForTimeout(800);
    r = await inside(p, '.mc-book'); ok(r.ok, `${lay}: книга-меню внутри окна игры ${JSON.stringify(r)}`); await p.screenshot({ path: `${OUT}/r6-${lay}-book.png` });
    await p.keyboard.press('KeyB'); await p.waitForTimeout(400);
    if (!panels) await p.context().close(); else var P = p;
  }
  // отряд: два игрока
  const A = P, B = await mk('R6b', false);
  const bs = await B.evaluate(() => window.__game.state().player); await A.evaluate(([x, y]) => window.__game.debug.teleport(x - 60, y), [bs.x, bs.y]); await A.waitForTimeout(1500);
  const bsid = await B.evaluate(() => window.__game.state().myId ?? window.__game.debug.myId?.());
  await A.evaluate((s) => window.__game.debug.partyInvite ? window.__game.debug.partyInvite(s) : window.__game.debug.rawSend({ type: 'party_invite', sid: s }), bsid);
  await B.waitForSelector('.mc-party-ask [data-a="yes"]', { timeout: 8000 }).catch(() => {}); await B.click('.mc-party-ask [data-a="yes"]').catch(() => {}); await A.waitForTimeout(2500);
  for (const [lay, p] of [['panels', A], ['full', B]]) {
    const g = await p.evaluate(() => { const pa = document.querySelector('.mc-party')?.getBoundingClientRect(), L = document.querySelector('.mc3d-layer').getBoundingClientRect();
      const qs = [...document.querySelectorAll('.mc-qtrack, .mc-tracker, .mc3d-quests')].filter((e) => e.offsetParent).map((e) => e.getBoundingClientRect());
      const hit = (a, c) => a.left < c.right && c.left < a.right && a.top < c.bottom && c.top < a.bottom;
      return pa ? { top: Math.round(pa.top - L.top), left: Math.round(pa.left - L.left), w: Math.round(pa.width), overQuest: qs.some((q) => hit(pa, q)), nq: qs.length } : null; });
    ok(g && g.top < 80 && !g.overQuest, `${lay}: панель отряда сверху, не на трекере заданий ${JSON.stringify(g)}`);
    const bars = await p.evaluate(() => window.__game.debug.hpBars?.() || null);
    ok(bars && bars.some((x) => x.party && x.color === 'rgb(168, 85, 247)') && bars.filter((x) => !x.party).every((x) => x.color !== 'rgb(168, 85, 247)'), `${lay}: полоса ОЗ союзника фиолетовая, своя — как была ${JSON.stringify(bars)}`);
    await p.screenshot({ path: `${OUT}/r6-${lay}-party.png` });
  }
  ok(!errs.length, 'без ошибок страницы ' + errs.join('|')); console.log(`${pass} passed, ${fail} failed`); await b.close(); process.exit(fail ? 1 : 0);
})();
