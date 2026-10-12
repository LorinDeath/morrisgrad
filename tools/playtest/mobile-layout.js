// Мобильная раскладка: телефоны в портрете и альбоме, хаб и забег. Проверяет: кнопки и панели HUD не перекрываются,
// кнопки ≥ 44 px и внутри экрана, джойстик слева снизу, дуга (атака/рывок/Q/R/F) справа снизу; делает скриншоты.
const { chromium, devices } = require('playwright-core');
const OUT = '/workspace/morrisgrad-round2';
const VIEWS = [[360, 640], [390, 844], [412, 915], [844, 390]];
(async () => {
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  let pass = 0, fail = 0;
  const ok = (c, m) => { if (c) pass++; else fail++; console.log((c ? 'PASS ' : 'FAIL ') + m); };
  const only = process.argv[2];
  for (const [w, h] of VIEWS) {
    if (only && only !== `${w}x${h}`) continue;
    const tag = `${w}x${h}`;
    const ctx = await b.newContext({ ...devices['iPhone 13'], viewport: { width: w, height: h }, screen: { width: w, height: h } });
    const p = await ctx.newPage();
    const errs = []; p.on('pageerror', (e) => errs.push(String(e)));
    await p.goto(`http://127.0.0.1:5199/game.html?name=Mob${w}&uid=test_r2_mlay_${w}_${Date.now()}&ws=ws://127.0.0.1:8787&fs=1&debug=1`);
    await p.waitForFunction(() => window.__game?.state?.().mode === 'hub', null, { timeout: 60000 });
    for (let i = 0; i < 6; i++) { await p.evaluate(() => window.__game.debug.selectClass('mage')); await p.waitForTimeout(1200); if (await p.evaluate(() => !!window.__game.meta?.hero)) break; }
    // открыть второй активный навык (Морозная звезда) — чтобы на дуге было 2 навыка
    await p.evaluate(() => window.__game.debug.rawSend({ type: 'dev_grant', xp: 4000000, flags: { talents_open: 1 } }));
    await p.waitForTimeout(700);
    for (const id of ['coat', 'coat', 'coat', 'frost_nova']) { await p.evaluate((i) => window.__game.debug.rawSend({ type: 'talent_learn', id: 'mage.' + i }), id); await p.waitForTimeout(250); }
    await p.waitForTimeout(1500);
    const audit = (mode) => p.evaluate((mode) => {
      const layer = document.querySelector('.mc3d-layer').getBoundingClientRect();
      const vis = (e) => { const r = e.getBoundingClientRect(); const cs = getComputedStyle(e); return r.width > 0 && r.height > 0 && cs.display !== 'none' && cs.visibility !== 'hidden' && e.offsetParent !== null; };
      const R = (e) => { const r = e.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; };
      const items = [];
      for (const e of document.querySelectorAll('.mc3d-touch .mc3d-tbtn')) if (vis(e)) items.push({ n: 'btn:' + (e.dataset.act || e.dataset.hold) + (e.dataset.slot ?? ''), btn: 1, round: getComputedStyle(e).borderRadius === '50%', ...R(e) });
      const panels = mode === 'run' ? ['.mc3d-hp', '.mc3d-top', '.mc-abar-run', '.mc3d-allies'] : ['.mc-tracker', '.mc3d-prompt', '.mc-tchip'];
      for (const s of panels) for (const e of document.querySelectorAll(s)) if (vis(e) && e.children.length + (e.textContent.trim() ? 1 : 0) > 0) items.push({ n: s, ...R(e) });
      const over = [];
      for (let i = 0; i < items.length; i++) for (let j = i + 1; j < items.length; j++) {
        const a = items[i], c = items[j];
        const ix = Math.min(a.x + a.w, c.x + c.w) - Math.max(a.x, c.x), iy = Math.min(a.y + a.h, c.y + c.h) - Math.max(a.y, c.y);
        if (!(ix > 1 && iy > 1)) continue;
        // круглые кнопки: пересечение по окружностям, а не по описанным квадратам
        if (a.btn && c.btn && a.round && c.round) { const d = Math.hypot(a.x + a.w / 2 - c.x - c.w / 2, a.y + a.h / 2 - c.y - c.h / 2); if (d >= (a.w + c.w) / 2 - 1) continue; }
        over.push(`${a.n}×${c.n}`);
      }
      const small = items.filter((i) => i.btn && (i.w < 44 || i.h < 44)).map((i) => `${i.n} ${i.w}x${i.h}`);
      const vw = window.innerWidth, vh = window.innerHeight;
      const out = items.filter((i) => i.x < Math.max(0, layer.left) - 1 || i.y < Math.max(0, layer.top) - 1 || i.x + i.w > Math.min(vw, layer.right) + 1 || i.y + i.h > Math.min(vh, layer.bottom) + 1).map((i) => i.n);
      const joy = document.querySelector('.mc3d-joy-hint')?.getBoundingClientRect();
      const atk = document.querySelector(mode === 'run' ? '.mc3d-tbtn.k-dash' : '.mc3d-tbtn.k-atk').getBoundingClientRect();
      return { over, small, out, n: items.length, names: items.map((i) => i.n), joyBL: joy && joy.left - layer.left < layer.width * 0.3 && layer.bottom - joy.bottom < layer.height * 0.2, clusterBR: layer.right - atk.right < 40 && layer.bottom - atk.bottom < 40, joyOver: items.filter((i) => joy && i.x < joy.right && i.x + i.w > joy.left && i.y < joy.bottom && i.y + i.h > joy.top).map((i) => i.n) };
    }, mode);
    let a = await audit('hub');
    ok(a.over.length === 0, `${tag} hub: no overlaps among ${a.n} controls/panels ${a.over.join(', ')}`);
    ok(a.small.length === 0, `${tag} hub: all buttons ≥ 44 px ${a.small.join(', ')}`);
    ok(a.out.length === 0, `${tag} hub: everything on screen ${a.out.join(', ')}`);
    ok(a.joyBL && a.clusterBR && a.joyOver.length === 0, `${tag} hub: joystick bottom-left, attack bottom-right, nothing on the joystick ${a.joyOver.join(',')}`);
    ok(a.names.filter((n) => n.startsWith('btn:ability')).length === 2, `${tag} hub: 2 skill buttons (fireball + frost_nova)`);
    await p.screenshot({ path: `${OUT}/mobile-hub-${tag}.png` });
    // книга на весь экран: кнопки не поверх
    await p.tap('.mc3d-tbtn[data-act="book"]'); await p.waitForTimeout(500);
    const bookTop = await p.evaluate(() => { const r = document.querySelector('.mc-book').getBoundingClientRect(); const e = document.elementFromPoint(r.right - 30, r.bottom - 30); return !!e?.closest('.mc-book'); });
    ok(bookTop, `${tag}: open book covers touch controls (no buttons on top)`);
    await p.evaluate(() => window.__game.book?.close?.()); await p.waitForTimeout(200);
    // забег
    await p.evaluate(() => window.__game.startRun('crypt'));
    await p.waitForFunction(() => window.__game.state().mode === 'run', null, { timeout: 8000 });
    await p.waitForTimeout(3500);
    a = await audit('run');
    ok(a.over.length === 0, `${tag} run: no overlaps among ${a.n} controls/panels ${a.over.join(', ')}`);
    ok(a.small.length === 0 && a.out.length === 0, `${tag} run: sizes ≥ 44, on screen ${a.small.join(',')} ${a.out.join(',')}`);
    ok(a.joyBL && a.clusterBR && a.joyOver.length === 0, `${tag} run: joystick bottom-left, dash in the corner`);
    await p.tap('.mc3d-tbtn.ab[data-slot="0"]'); await p.waitForTimeout(600);
    ok(await p.evaluate(() => window.__game.run.me.abilities[0].cdLeft > 1), `${tag} run: tap on skill button casts (cooldown starts)`);
    await p.waitForTimeout(2500);
    await p.screenshot({ path: `${OUT}/mobile-run-${tag}.png` });
    ok(errs.length === 0, `${tag}: no page errors ${errs.slice(0, 2).join(' | ')}`);
    await ctx.close();
  }
  console.log(`${pass} passed, ${fail} failed`);
  await b.close();
})();
