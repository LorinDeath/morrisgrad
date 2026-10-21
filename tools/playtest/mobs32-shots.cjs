// LOCAL ONLY: мобы bestiary32 — снимки «старые/новые», GIF анимаций, ночное свечение, толпа (замеры кадра и draw calls), видеопамять по тирам
// и выгрузка, живое переключение «Мобы» без утечек, выключатель админки, телефон, настоящие мобы сервера (dev_spawn_mob).
// SH=boot,tiers,vram,gifs,night,crowd,switch,settings,kill,real,mobile (по умолчанию все); OUT — папка снимков.
const { chromium, devices } = require('playwright-core');
const { guardLocal, assertLocalUrl } = require('./_local.cjs');
const fs = require('fs');
const OUT = process.env.OUT || '/workspace/morrisgrad-round3/mobs32';
const BASE = assertLocalUrl(process.env.LF_BASE || 'http://127.0.0.1:5341/game.html'), WS = assertLocalUrl(process.env.LF_WS || 'ws://127.0.0.1:8941');
const SH = (process.env.SH || 'boot,tiers,vram,gifs,night,crowd,switch,settings,kill,real,mobile').split(',');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const R = { checks: [] }; let fails = 0;
const ok = (c, m) => { R.checks.push((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; console.log((c ? 'PASS ' : 'FAIL ') + m); };
const TIER = { 1: ['grass_imp', 'night_bat', 'rootling', 'dew_king'], 2: ['crescent_wolf', 'lantern_ghost', 'garden_golem', 'star_hound'], 3: ['ghoul', 'golem', 'glitch_knight', 'pick_skeleton'], 4: ['pixel_wraith', 'heat_golem', 'spark_imp', 'glitch_hound'], 5: ['crystal_drake', 'void_eye', 'star_knight', 'lunar_golem'] };
const GIF_MOBS = ['grass_imp', 'crescent_wolf', 'glitch_knight', 'pixel_wraith', 'crystal_drake'];
async function boot(b, { mobile = false, q = '', tag = 'pc' } = {}) {
  const ctx = await b.newContext(mobile ? { ...devices['Pixel 7'], viewport: { width: 412, height: 839 } } : { viewport: { width: 1280, height: 760 } }); await guardLocal(ctx);
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(String(e).slice(0, 300))); p.on('console', (m) => { if (m.type() === 'error' || /beast32|\[mobs\]/.test(m.text())) errs.push('console: ' + m.text().slice(0, 200)); });
  const reqs = []; p.on('request', (r) => { if (/bestiary32/.test(r.url())) reqs.push(r.url().replace(/^.*\/src\/assets\/mc\//, '')); });
  const uid = 'm32_' + tag; const t0 = Date.now();
  await p.goto(assertLocalUrl(`${BASE}?name=${uid}&uid=${uid}&ws=${WS}&fs=1&debug=1&props=3${mobile ? '&mobile=1' : ''}${q}`));
  await p.waitForFunction(() => window.__game?.state?.().mode === 'hub', null, { timeout: 240000 }).catch(async (e) => { console.log('errs', errs.join(' | ')); await p.screenshot({ path: `${OUT}/boot-fail-${tag}.png` }); throw e; });
  await sleep(1500); await p.evaluate(() => window.__game.debug.selectClass('mage')).catch(() => {}); await sleep(2500);
  return { ctx, p, errs, reqs, tHub: Date.now() - t0 };
}
const D = (p, fn, ...a) => p.evaluate(([fn, a]) => window.__game.debug[fn](...a), [fn, a]);
async function waitPages(p, ids, ms = 30000) {
  const t0 = Date.now(); for (;;) { const st = await D(p, 'mobs32'); const r = await p.evaluate((ids) => ids.every((id) => true), ids); const want = await p.evaluate(async (ids) => { const m = await import('/@fs/workspace/mg-mobs/src/pages/MorrisCurse/_core/engine/beast32.js'); return [...new Set(ids.map((id) => m.B32_META.mobs[id]?.page))]; }, ids);
    if (want.every((i) => st.pages[i].st === 'ready') && st.drawn > 0) return st; if (Date.now() - t0 > ms) return st; await sleep(250); }
}
const frames2 = (p) => p.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(r)))));
const row = (ids, anim = 'idle', sp = 150, dy = 0, extra = {}) => ids.map((type, i) => ({ type, anim, dx: (i - (ids.length - 1) / 2) * sp, dy, ...extra }));
const clipC = (w, h, oy = 0) => ({ x: 640 - w / 2, y: 380 - h / 2 + oy, width: w, height: h });
(async () => {
  fs.mkdirSync(OUT + '/frames', { recursive: true });
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const { p, errs, reqs, tHub } = await boot(b, { tag: 'pc' });
  const HOME = await D(p, 'pos').catch(() => null);
  // открытая ровная площадка Аринара (лёд, без пропсов): демо-мобы видны целиком
  const tpHome = async () => {
    for (let i = 0; i < 8 && (await p.evaluate(() => window.__game.state().world)) !== 'arinar'; i++) { await D(p, 'tp', 240, 610, true); await sleep(700); await D(p, 'rawSend', { type: 'use_portal', portalId: 'portal_arinar' }); await sleep(3000); }
    await D(p, 'tp', +(process.env.HX || 20400), +(process.env.HY || 1200), true); await sleep(5000); await D(p, 'mood', 'b_stone'); };
  await tpHome();
  if (SH.includes('boot')) {
    const st = await D(p, 'mobs32'); R.boot = { tHub, st, reqs: [...reqs] };
    ok(st.on.zone === true && st.pref === 'new', 'ПК: «Мобы: Новые» по умолчанию');
    ok(reqs.filter((u) => /\.png/.test(u)).length === 0, `ленивая загрузка: до появления мобов листов не качали (${reqs.length} запросов bestiary32)`);
    ok(st.mb === 0, `ленивая загрузка: видеопамять мобов 32 при входе = ${st.mb} МБ`);
  }
  if (SH.includes('tiers')) { // старое vs новое: 4 моба на тир, idle-кадр, один и тот же кадр «на паузе»
    await D(p, 'setZoom', 0.75);
    for (const t of [1, 2, 3, 4, 5]) {
      await D(p, 'mobDemo', row(TIER[t], 'idle', 78, 70)); await D(p, 'mobDemoAt', 0.35);
      await waitPages(p, TIER[t]); await frames2(p); await sleep(400);
      await p.screenshot({ path: `${OUT}/frames/tier${t}-new.png`, clip: { x: 140, y: 190, width: 1000, height: 460 } });
      await D(p, 'mobPref', 'old'); await frames2(p); await sleep(400);
      await p.screenshot({ path: `${OUT}/frames/tier${t}-old.png`, clip: { x: 140, y: 190, width: 1000, height: 460 } });
      await D(p, 'mobPref', 'new'); await sleep(300);
    }
    await D(p, 'mobDemo', []);
  }
  if (SH.includes('vram')) { // видеопамять по тирам: только мобы тира, ждём листы → замер; убираем → через grace (2 с) лист выгружен
    await D(p, 'gfxLocal', { mobGrace: 2 }); await D(p, 'mobDemo', []); await sleep(3500);
    const base = await D(p, 'mobs32'); R.vram = { base: { mb: base.mb, tex: base.tex }, tiers: {} };
    const all = await D(p, 'mobTypes32'); const meta = await p.evaluate(async () => { const m = await import('/@fs/workspace/mg-mobs/src/pages/MorrisCurse/_core/engine/beast32.js'); return m.B32_META.mobs; });
    for (const t of [1, 2, 3, 4, 5]) {
      const ids = all.filter((id) => meta[id].tier === t);
      await D(p, 'mobDemo', ids.map((type, i) => ({ type, anim: 'idle', dx: ((i % 7) - 3) * 120, dy: Math.floor(i / 7) * 120 - 60 })));
      const st = await waitPages(p, ids); const t0 = Date.now();
      await D(p, 'mobDemo', []); let st2; for (let i = 0; i < 40; i++) { await sleep(250); st2 = await D(p, 'mobs32'); if (st2.mb === 0) break; }
      R.vram.tiers[t] = { mb: st.mb, pages: st.pages.filter((q) => q.st === 'ready').map((q) => q.page), tex: st.tex, calls: st.calls, afterMb: st2.mb, afterTex: st2.tex, releaseMs: Date.now() - t0 };
      ok(st.pages.filter((q) => q.st === 'ready').every((q) => q.tier === t), `тир ${t}: в видеопамяти только листы тира ${t} (${st.mb} МБ)`);
      ok(st2.mb === 0 && st2.tex <= base.tex, `тир ${t}: после ухода мобов листы выгружены (${st2.mb} МБ, текстур ${st2.tex} ≤ ${base.tex})`);
    }
    // все тиры сразу (худший случай)
    await D(p, 'mobDemo', all.map((type, i) => ({ type, anim: 'idle', dx: ((i % 12) - 6) * 70, dy: Math.floor(i / 12) * 70 - 200 })));
    const sa = await waitPages(p, all, 60000); R.vram.all = { mb: sa.mb, calls: sa.calls, tex: sa.tex };
    await D(p, 'mobDemo', []); await sleep(3500); const sz = await D(p, 'mobs32'); R.vram.allAfter = { mb: sz.mb, tex: sz.tex };
    ok(sz.mb === 0, `все 10 страниц (${sa.mb} МБ) выгружены после ухода (${sz.mb} МБ)`);
    await D(p, 'gfxLocal', { mobGrace: 20 });
  }
  if (SH.includes('gifs')) { // GIF по кадрам (время «на паузе»): idle/walk/atk/hurt/die, реальный fps; + отражение (влево)
    await D(p, 'setZoom', 1.4); const A = { idle: [16, 12], walk: [12, 24], atk: [12, 20], hurt: [6, 24], die: [18, 24] }; R.gifs = {};
    for (const id of GIF_MOBS) {
      for (const [an, [n, fps]] of Object.entries(A)) {
        await D(p, 'mobDemo', [{ type: id, anim: an, dx: -50, dy: 60 }, { type: id, anim: an, dx: 50, dy: 60, flip: true }]); await waitPages(p, [id]);
        for (let i = 0; i < n; i++) { await D(p, 'mobDemoAt', (i + 0.5) / fps); await frames2(p); await p.screenshot({ path: `${OUT}/frames/gif-${id}-${an}-${String(i).padStart(2, '0')}.png`, clip: { x: 300, y: 330, width: 680, height: 380 } }); }
        R.gifs[id + ':' + an] = { n, fps };
      }
      // старый для сравнения: 1 цикл каждой анимации старыми листами
      await D(p, 'mobPref', 'old');
      for (const [an, n, fps] of [['walk', 4, 7], ['atk', 3, 6], ['hurt', 1, 4], ['die', 4, 8]]) { await D(p, 'mobDemo', [{ type: id, anim: an, dx: -50, dy: 60 }, { type: id, anim: an, dx: 50, dy: 60, flip: true }]);
        for (let i = 0; i < n; i++) { await D(p, 'mobDemoAt', an === 'atk' ? [0.1, 0.32, 0.4][i] : an === 'die' ? (i + 0.5) / 8 : (i + 0.5) / fps); await frames2(p); await p.screenshot({ path: `${OUT}/frames/gifold-${id}-${an}-${String(i).padStart(2, '0')}.png`, clip: { x: 300, y: 330, width: 680, height: 380 } }); } }
      await D(p, 'mobPref', 'new');
    }
    await D(p, 'mobDemo', []);
  }
  if (SH.includes('night')) { // ночное свечение: светящиеся мобы, ночь (hub) и «день» (b_stone); свечение ×1 и ×2
    const ids = ['lantern_ghost', 'spark_imp', 'pixel_wraith', 'fallen_star', 'void_eye', 'moon_moth', 'crystal_drake', 'whisper_wisp'];
    await D(p, 'setZoom', 1.0); await D(p, 'mobDemo', ids.map((type, i) => ({ type, anim: 'idle', dx: ((i % 4) - 1.5) * 110, dy: Math.floor(i / 4) * 130 - 40 }))); await D(p, 'mobDemoAt', 0.4); await waitPages(p, ids);
    for (const [nm, mood, g] of [['night', 'hub', 1], ['night-glow2', 'hub', 2], ['day', 'b_stone', 1]]) { await D(p, 'gfxLocal', { mobGlow: g }); await D(p, 'mood', mood); await sleep(2500); await p.mouse.move(5, 5); await p.screenshot({ path: `${OUT}/night-glow-${nm}.png` }); }
    await D(p, 'gfxLocal', { mobGlow: 1 }); await D(p, 'mood', 'hub'); await D(p, 'mobPref', 'old'); await sleep(1500); await p.screenshot({ path: `${OUT}/night-glow-night-OLD.png` }); await D(p, 'mobPref', 'new');
    await D(p, 'mood', 'b_stone'); await D(p, 'mobDemo', []);
  }
  if (SH.includes('crowd')) { // толпа 60 мобов (3 тира, ходьба): кадр, CPU, draw calls — новые vs старые
    const ids = [...TIER[1], ...TIER[2], ...TIER[3]], list = []; for (let i = 0; i < 60; i++) list.push({ type: ids[i % ids.length], anim: i % 5 === 0 ? 'atk' : 'walk', dx: ((i % 10) - 4.5) * 58, dy: Math.floor(i / 10) * 55 - 200, flip: i % 3 === 0, t0: i * 0.07 });
    await D(p, 'setZoom', 0.6); await D(p, 'mobDemo', list); await waitPages(p, ids, 40000); await D(p, 'mood', 'b_stone'); await sleep(1500);
    const meas = async () => { const s = []; for (let i = 0; i < 12; i++) { await sleep(400); s.push(await p.evaluate(() => window.__game.perf())); } const st = await D(p, 'mobs32'); const avg = (k) => +(s.reduce((a, x) => a + x[k], 0) / s.length).toFixed(2); return { fps: avg('fps'), cpuMs: avg('cpuMs'), calls: Math.round(avg('calls')), mobCalls: st.calls, drawn: st.drawn, mb: st.mb }; };
    R.crowd = { new: await meas() }; await p.screenshot({ path: `${OUT}/crowd-new.png` });
    await D(p, 'mobPref', 'old'); await sleep(1500); R.crowd.old = await meas(); await p.screenshot({ path: `${OUT}/crowd-old.png` });
    await D(p, 'mobPref', 'new'); await sleep(1500); await D(p, 'mood', 'hub'); await sleep(2000); await p.screenshot({ path: `${OUT}/crowd-new-night.png` }); await D(p, 'mood', 'b_stone');
    ok(R.crowd.new.drawn >= 60 && R.crowd.new.mobCalls <= 12, `толпа 60: новыми листами ${R.crowd.new.drawn} мобов, draw calls мобов ${R.crowd.new.mobCalls} (≤ 2 на страницу)`);
    ok(R.crowd.new.calls - R.crowd.old.calls <= 12, `draw calls кадра: новые ${R.crowd.new.calls} vs старые ${R.crowd.old.calls}`);
  }
  if (SH.includes('switch')) { // 20 переключений «Мобы» с толпой на экране: текстуры/геометрии/видеопамять не растут
    const ids = [...TIER[2], ...TIER[4]]; await D(p, 'setZoom', 1.1); await D(p, 'mobDemo', ids.flatMap((type, i) => [{ type, anim: 'walk', dx: ((i % 4) - 1.5) * 105, dy: Math.floor(i / 4) * 120 - 60 }])); await waitPages(p, ids); await sleep(800);
    const s0 = await D(p, 'mobs32'); const hist = [];
    for (let i = 0; i < 20; i++) { await D(p, 'mobPref', i % 2 ? 'new' : 'old'); await sleep(i % 2 ? 900 : 300); if (i % 2) await waitPages(p, ids, 15000); const s = await D(p, 'mobs32'); hist.push({ i, pref: s.pref, mb: s.mb, tex: s.tex, geo: s.geo, drawn: s.drawn }); }
    const s1 = await D(p, 'mobs32'); R.switch = { before: { mb: s0.mb, tex: s0.tex, geo: s0.geo }, after: { mb: s1.mb, tex: s1.tex, geo: s1.geo, loads: s1.loads, frees: s1.frees }, hist };
    ok(s1.tex <= s0.tex && s1.geo <= s0.geo + 2 && Math.abs(s1.mb - s0.mb) < 0.5, `20 переключений: текстур ${s0.tex}→${s1.tex}, геометрий ${s0.geo}→${s1.geo}, МБ ${s0.mb}→${s1.mb} (без утечек)`);
    ok(hist.filter((h) => h.pref === 'old').every((h) => h.mb === 0), '«Старые»: листы новых мобов сразу выгружены (0 МБ)');
    // GIF живого переключения (кадр в кадр): новые → старые → новые
    for (let i = 0; i < 24; i++) { if (i === 8) await D(p, 'mobPref', 'old'); if (i === 16) await D(p, 'mobPref', 'new'); await sleep(i === 16 ? 0 : 60); await p.screenshot({ path: `${OUT}/frames/switch-${String(i).padStart(2, '0')}.png`, clip: { x: 140, y: 120, width: 1000, height: 600 } }); }
  }
  if (SH.includes('settings')) { // строка «Мобы» в настройках + переключение кнопками (живое)
    await p.click('.mc-setbtn', { force: true }).catch(() => {}); await p.waitForSelector('[data-row="mobs"]', { timeout: 15000 }).catch(() => {});
    await sleep(600); const rowEl = await p.$('[data-row="mobs"]'); ok(!!rowEl, 'в «Настройках» есть строка «👹 Мобы»');
    if (rowEl) {
      const box = await rowEl.evaluate((e) => { const r = e.closest('.mc-set')?.getBoundingClientRect() || e.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; });
      await p.screenshot({ path: `${OUT}/settings-row.png`, clip: { x: Math.max(0, box.x - 10), y: Math.max(0, box.y - 10), width: Math.min(1280, box.w + 20), height: Math.min(700, box.h + 20) } });
      await p.screenshot({ path: `${OUT}/settings-panel.png` });
      for (let i = 0; i < 18; i++) { if (i === 4) await p.click('[data-act="mobs"][data-v="old"]'); if (i === 11) await p.click('[data-act="mobs"][data-v="new"]'); await sleep(i >= 11 ? 120 : 80); await p.screenshot({ path: `${OUT}/frames/settings-${String(i).padStart(2, '0')}.png` }); }
      const st = await D(p, 'mobs32'); ok(st.pref === 'new' && (await p.evaluate(() => localStorage.getItem('mc_mobs'))) === 'new', 'кнопки «Новые/Старые» сохраняют выбор на устройстве (mc_mobs)');
    }
    await p.keyboard.press('Escape').catch(() => {}); await sleep(500);
  }
  if (SH.includes('kill')) { // выключатель админки сильнее настройки: всё старое, листы выгружены, кнопка «Новые» неактивна
    await D(p, 'gfxLocal', { mobs32: false }); await sleep(800); const st = await D(p, 'mobs32');
    ok(st.on.zone === false && st.mb === 0 && st.drawn === 0, `выключатель mobs32=выкл: новые выкл, ${st.mb} МБ, нарисовано новыми ${st.drawn}`);
    await p.click('.mc-setbtn', { force: true }).catch(() => {}); await p.waitForSelector('[data-row="mobs"]', { timeout: 15000 }).catch(() => {}); await sleep(500);
    const dis = await p.$eval('[data-act="mobs"][data-v="new"]', (e) => e.disabled).catch(() => null); ok(dis === true, 'кнопка «Новые» неактивна, пока выключено администратором');
    const rowEl = await p.$('[data-row="mobs"]'); if (rowEl) { const r = await rowEl.boundingBox(); await p.screenshot({ path: `${OUT}/settings-row-killed.png`, clip: { x: Math.max(0, r.x - 10), y: Math.max(0, r.y - 10), width: r.width + 20, height: r.height + 20 } }); }
    await p.keyboard.press('Escape').catch(() => {}); await D(p, 'gfxLocal', { mobs32: true }); await sleep(800); ok((await D(p, 'mobs32')).on.zone === true, 'выключатель снова вкл → новые');
    await D(p, 'mobDemo', []);
  }
  if (SH.includes('real')) { // настоящие мобы сервера (dev_spawn_mob) по тиру: удар/урон/смерть идут по флагам сервера
    for (let i = 0; i < 8 && (await p.evaluate(() => window.__game.state().world)) !== 'arinar'; i++) { await D(p, 'tp', 240, 610, true); await sleep(700); await D(p, 'rawSend', { type: 'use_portal', portalId: 'portal_arinar' }); await sleep(3000); }
    const pos = { x: 13200, y: 1200 }; await D(p, 'tp', pos.x, pos.y, true); await sleep(3000); await D(p, 'setZoom', 1.2);
    const types = ['grass_imp', 'crescent_wolf', 'rot_spider', 'moon_wolf', 'crater_crab'];
    types.forEach(() => {}); for (const [i, t] of types.entries()) await D(p, 'devSpawn', t, pos.x - 160 + i * 80, pos.y - 90);
    await sleep(2500); const seen = {}; const frames = [];
    const st0 = await D(p, 'mobFrames'); R.real = { spawned: st0.map((o) => o.sk) };
    for (let k = 0; k < 60; k++) { const fr = await D(p, 'mobFrames'); for (const o of fr) { if (o.f < 0) continue; const a = o.f < 16 ? 'idle' : o.f < 28 ? 'walk' : o.f < 40 ? 'atk' : o.f < 46 ? 'hurt' : 'die'; (seen[o.sk] ||= {})[a] = (seen[o.sk][a] || 0) + 1; }
      if (k === 10) { const t = fr.find((o) => o.hp > 0); if (t) await D(p, 'selectMobId', t.id); } // автоатака героя → hurt/die
      if (k === 30) { const t = fr.find((o) => o.hp > 0); if (t) await D(p, 'selectMobId', t.id); }
      if (k % 15 === 5) { await p.mouse.move(5, 5); await p.screenshot({ path: `${OUT}/real-${k}.png` }); }
      await sleep(250); }
    R.real.seen = seen; const st = await D(p, 'mobs32'); R.real.st = { mb: st.mb, pages: st.pages.filter((q) => q.st === 'ready').map((q) => q.page), drawn: st.drawn, calls: st.calls };
    ok(Object.values(seen).some((s) => s.atk), `настоящие мобы: кадры удара по флагам сервера (${JSON.stringify(seen)})`);
  }
  R.errs = errs; await p.context().close();
  if (SH.includes('mobile')) { // телефон: «Старые» по умолчанию, ни одного листа bestiary32; включить сам — грузятся, пометка про память
    const m = await boot(b, { mobile: true, tag: 'mob' }); await D(m.p, 'tp', 300, 700, true); await sleep(1500);
    await D(m.p, 'mobDemo', row(TIER[1], 'walk', 90, 30)); await sleep(3000); const s0 = await D(m.p, 'mobs32');
    ok(s0.on.zone === false && s0.pref === 'old' && s0.mb === 0 && m.reqs.filter((u) => /\.png/.test(u)).length === 0, `телефон: «Старые» по умолчанию, ${s0.mb} МБ, листов bestiary32 скачано ${m.reqs.filter((u) => /\.png/.test(u)).length}`);
    await m.p.screenshot({ path: `${OUT}/mobile-old.png` });
    await D(m.p, 'mobPref', 'new'); const s1 = await waitPages(m.p, TIER[1]); await sleep(800); await m.p.screenshot({ path: `${OUT}/mobile-optin-new.png` });
    ok(s1.on.zone === true && s1.mb > 0, `телефон включил «Новые» сам: ${s1.mb} МБ (тир 1)`);
    await m.p.tap('.mc3d-tbtn[data-act="people"]').catch(() => {}); await m.p.waitForSelector('[data-view="settings"]', { timeout: 15000 }).catch(() => {}); await m.p.tap('[data-view="settings"]').catch(() => {}); await m.p.waitForSelector('[data-row="mobs"]', { timeout: 15000 }).catch(() => {}); await sleep(600);
    const note = await m.p.$eval('[data-row="mobs"]', (e) => e.textContent).catch(() => ''); ok(/памяти/.test(note), `телефон: пометка про память в строке «Мобы» (${note.trim()})`);
    const rowEl = await m.p.$('[data-row="mobs"]'); if (rowEl) { const r = await rowEl.boundingBox(); await m.p.screenshot({ path: `${OUT}/settings-row-mobile.png`, clip: { x: 0, y: Math.max(0, r.y - 10), width: 412, height: r.height + 20 } }); }
    R.mobile = { s0: { mb: s0.mb, on: s0.on }, s1: { mb: s1.mb }, errs: m.errs }; await m.ctx.close();
  }
  fs.writeFileSync(`${OUT}/mobs32-results.json`, JSON.stringify(R, null, 1));
  console.log('errs', JSON.stringify(R.errs).slice(0, 1500));
  console.log(fails ? `FAILED ${fails}` : 'mobs32 ok'); await b.close(); process.exit(fails ? 1 : 0);
})().catch((e) => { console.error('FAIL', e); process.exit(2); });
