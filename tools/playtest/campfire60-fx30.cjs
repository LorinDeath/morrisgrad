// LOCAL: костёр на 60 кадров (props_p32, строки 43–50, перенос кадров по строкам в шейдере SpriteBatch) +
// эффекты навыков fx30 (93 ключа, 30 кадров, fps_match_original_timing). Скриншоты ПК + телефон, «до» (BASE main) и «после».
// Только 127.0.0.1 (guardLocal). TAG=after BASE=http://127.0.0.1:5301/game.html SRC=/workspace/mg-push WS=ws://127.0.0.1:8901 node tools/playtest/campfire60-fx30.cjs
const { chromium } = require('playwright-core');
const { guardLocal, assertLocalUrl } = require('./_local.cjs');
const fs = require('fs');
const TAG = process.env.TAG || 'after', BASE = process.env.BASE || 'http://127.0.0.1:5301/game.html', WS = process.env.WS || 'ws://127.0.0.1:8901';
const SRC = process.env.SRC || '/workspace/mg-push', R3 = process.env.OUT || '/workspace/morrisgrad-round3';
const OCF = `${R3}/campfire60`, OFX = `${R3}/fx30`; fs.mkdirSync(OCF, { recursive: true }); fs.mkdirSync(OFX, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
const HEROES = ['warrior', 'spearman', 'rogue', 'mage'];
(async () => {
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  for (const dev of ['pc', 'mobile']) {
    const mobile = dev === 'mobile';
    const ctx = await b.newContext(mobile ? { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 } : { viewport: { width: 1280, height: 760 } });
    await guardLocal(ctx);
    const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(String(e).slice(0, 200)));
    const uid = `cf60_${TAG}_${dev}_${Date.now().toString(36).slice(-4)}`;
    await p.goto(assertLocalUrl(`${BASE}?name=${uid}&uid=${uid}&ws=${WS}&fs=1&debug=1`));
    await p.waitForFunction(() => window.__game?.state?.().mode === 'hub', null, { timeout: 180000 }); await sleep(1500);
    await p.evaluate(() => window.__game.debug.selectClass('warrior')); await sleep(2000);
    const G = (f, a) => p.evaluate(f, a);
    // ---------- костёр у Петра (хаб: x+42, y-10 от NPC) ----------
    const cf = await G(async (src) => { const m = await import(`/@fs${src}/server/meta/shared.ts`); const n = m.NPCS.petr; return { x: n.x + 42, y: n.y - 10 }; }, SRC);
    await G(([x, y]) => window.__game.debug.tp(x - 10, y + 45, true), [cf.x, cf.y]); await sleep(2500);
    await p.screenshot({ path: `${OCF}/${TAG}-${dev}-hub-campfire.png` });
    const vp = p.viewportSize(), cw = mobile ? 300 : 360, ch = mobile ? 300 : 280;
    const clip = { x: Math.round(vp.width / 2 - cw / 2), y: Math.round(vp.height / 2 - ch * 0.95), width: cw, height: ch };
    // кадры подряд (без вмешательства в время): uTime спрайтов перед каждым снимком → номер кадра костра
    const seq = [], calls = [];
    const dbgLine = () => G(() => [...document.querySelectorAll('div')].map((e) => e.textContent).find((t) => / fps · cpu .* calls \d+/.test(t) && t.length < 400) || '');
    for (let k = 0; k < 8; k++) {
      seq.push(await G(async (src) => (await import(`/@fs${src}/src/pages/MorrisCurse/_core/engine/spriteBatch.js`)).SPRITE_TIME.value.toFixed(3), SRC));
      await p.screenshot({ path: `${OCF}/${TAG}-${dev}-seq-${String(k).padStart(2, '0')}.png`, clip });
      const m = (await dbgLine()).match(/calls (\d+)/); if (m) calls.push(+m[1]);
      await sleep(40);
    }
    fs.writeFileSync(`${OCF}/${TAG}-${dev}-calls.json`, JSON.stringify({ calls }));
    console.log(`  ${dev} draw calls у костра: ${calls.join(' ')}`);
    console.log(`  ${dev} кадры костра, uTime: ${seq.join(' ')}`);
    // ---------- эффекты навыков ----------
    const meta = await G(async (src) => { const m = await import(`/@fs${src}/src/pages/MorrisCurse/_core/engine/fxAtlas.js`); const M = m.FX_META; const out = {}; for (const k of Object.keys(M.keys)) for (const a of Object.keys(M.keys[k].anims)) out[k + '.' + a] = +m.fxDur(k, a).toFixed(4); return { v: M.version, n: Object.keys(M.keys).length, al: Object.keys(M.aliases).length, dur: out, aliasOk: Object.keys(M.aliases).filter((a) => !m.fxKey(a)) }; }, SRC);
    fs.writeFileSync(`${OFX}/${TAG}-${dev}-fxdur.json`, JSON.stringify(meta, null, 1));
    console.log(`  атлас v${meta.v}: ключей ${meta.n}, псевдонимов ${meta.al}, не резолвятся: ${JSON.stringify(meta.aliasOk)}`);
    await G(() => window.__game.debug.tp(565, 640, true)); await sleep(1500);
    await p.waitForFunction(() => window.__game.debug.projs().ready, null, { timeout: 60000 }).catch(() => {});
    ok(await G(() => window.__game.debug.projs().ready), `${TAG}/${dev}: все листы FX загружены`);
    for (const h of HEROES) {
      await G((c) => window.__game.debug.selectClass(c), h); await sleep(1800);
      const abil = await G(() => (window.__game.meta?.hero?.effective?.abilities || []).map((a) => a.id));
      for (const k of ['q', 'g', 'f', 'r']) { await p.keyboard.press(k); await sleep(120); }
      await sleep(80); await p.screenshot({ path: `${OFX}/${TAG}-${dev}-hero-${h}.png` });
      console.log(`  ${dev} ${h}: навыки [${abil.join(', ')}], снаряды/эффекты: ${JSON.stringify(await G(() => window.__game.debug.projs().spawned))}`);
      await sleep(1200);
    }
    const shot = async (name, f, wait) => { await G(() => window.__game.debug.fxDemo('clear')); await G(f); await sleep(wait); await p.screenshot({ path: `${OFX}/${TAG}-${dev}-${name}.png` }); };
    await shot('demo-projectiles', () => window.__game.debug.projDemo(), 900);
    await shot('demo-enemy', () => window.__game.debug.fxDemo('enemy'), 900);
    await shot('demo-skills', () => window.__game.debug.fxDemo('skills'), 500);
    await shot('demo-tele', () => window.__game.debug.fxDemo('tele'), 500);
    await shot('demo-cursed', () => { const g = window.__game.debug; g.cursedFxDemo(565, 640); }, 250);
    await G(() => window.__game.debug.fxDemo('clear'));
    const miss = await G(() => window.__fxMissing?.() || []);
    ok(miss.length === 0, `${TAG}/${dev}: нет ключей без спрайта ${JSON.stringify(miss)}`);
    ok(errs.length === 0, `${TAG}/${dev}: нет ошибок страницы ${JSON.stringify(errs)}`);
    await ctx.close();
  }
  console.log(fails ? `FAILED ${fails}` : 'ALL PASS'); await b.close(); process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
