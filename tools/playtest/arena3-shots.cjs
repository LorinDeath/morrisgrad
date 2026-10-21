// LOCAL ONLY: арена забега 32 (arena32, флаг arena3) — снимки старое/новое по 4 темам (crypt/abyss/mirror/abode), ПК и телефон,
// парапет спрайтами и в полу, крупно кромка и диагонали, прореживание столбов; замеры кадра/draw calls; вход-выход ×N без утечек.
// MOBILE=1 — телефон (Pixel 7); SH=shots,modes,perf,leak; OUT — папка; ROOMS — комнаты (crypt,abyss,duel,trial).
const { chromium, devices } = require('playwright-core');
const { guardLocal, assertLocalUrl } = require('./_local.cjs');
const fs = require('fs');
const OUT = process.env.OUT || '/workspace/morrisgrad-round3/props3/arena3';
const BASE = assertLocalUrl(process.env.LF_BASE || 'http://127.0.0.1:5331/game.html'), WS = assertLocalUrl(process.env.LF_WS || 'ws://127.0.0.1:8931');
const MOB = !!process.env.MOBILE, PF = MOB ? 'phone' : 'pc';
const SH = (process.env.SH || 'shots,modes,perf,leak').split(',');
const ROOMS = (process.env.ROOMS || 'crypt,abyss,duel,trial').split(',');
const TH = { crypt: 'crypt', abyss: 'abyss', duel: 'mirror', trial: 'abode' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const R = { pf: PF, perf: {}, leak: {}, a32: {}, checks: [] }; let fails = 0;
const ok = (c, m) => { R.checks.push((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; console.log((c ? 'PASS ' : 'FAIL ') + m); };
// камеры (сцена, м): общий вид, север (прямая кромка), диагональ (северо-запад), юг
const CAM = MOB ? { wide: { x: 0, z: -10, zoom: 0.22 }, north: { x: 0, z: -56, zoom: 0.55 }, diag: { x: -41, z: -42, zoom: 0.55 }, south: { x: 0, z: 54, zoom: 0.55 } }
  : { wide: { x: 0, z: -14, zoom: 0.3 }, north: { x: 0, z: -56, zoom: 0.75 }, diag: { x: -41, z: -42, zoom: 0.75 }, south: { x: 0, z: 54, zoom: 0.75 } };
async function page(b, set) {
  const ctx = await b.newContext(MOB ? { ...devices['Pixel 7'], viewport: { width: 412, height: 839 } } : { viewport: { width: 1280, height: 760 } }); await guardLocal(ctx);
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(String(e).slice(0, 300))); p.on('console', (m) => { if (m.type() === 'error' || /arena32|arena props/.test(m.text())) errs.push('console: ' + m.text().slice(0, 200)); });
  const uid = `a3_${PF}_${set}`;
  await p.goto(assertLocalUrl(`${BASE}?name=${uid}&uid=${uid}&ws=${WS}&fs=1&debug=1&props=3&arena=${set}${MOB ? '&mobile=1' : ''}`));
  await p.waitForFunction(() => window.__game?.state?.().mode === 'hub', null, { timeout: 240000 });
  await sleep(1200); await p.evaluate(() => window.__game.debug.selectClass('mage')).catch(() => {}); await sleep(2000);
  return { ctx, p, errs };
}
const D = (p, fn, ...a) => p.evaluate(([fn, a]) => window.__game.debug[fn](...a), [fn, a]);
// cfg — поля «🖼 Графика» локально: после выхода в хаб снимок сервера возвращает свои значения, поэтому ставим их прямо перед входом
async function enter(p, room, cfg = null) {
  if ((await p.evaluate(() => window.__game.state().mode)) === 'run') { await D(p, 'leaveRun'); await p.waitForFunction(() => window.__game.state().mode === 'hub', null, { timeout: 60000 }); await sleep(1500); }
  if (cfg) await D(p, 'gfxLocal', cfg);
  await p.evaluate((r) => window.__game.startRun(r), room);
  await p.waitForFunction(() => window.__game.state().mode === 'run', null, { timeout: 60000 });
  for (let i = 0; i < 60; i++) { const a = await D(p, 'arena32'); if (!a || a.ready) break; await sleep(250); }
  await sleep(3500);
}
async function cam(p, c, file, wait = 2200) { await D(p, 'freeCam', c); await sleep(wait); await p.mouse.move(5, 5); await p.screenshot({ path: file }); }
async function perf(p) { // общий вид, свободная камера: кадр и draw calls (среднее/макс за ~6 с)
  await D(p, 'freeCam', CAM.wide); await sleep(2500); const s = [];
  for (let i = 0; i < 4; i++) s.push(await D(p, 'frameStats', 2000));
  const m = await D(p, 'glMem'), c = await p.evaluate(() => window.__game.perf()); await D(p, 'freeCam', null);
  const av = (k) => +(s.reduce((a, q) => a + q[k], 0) / s.length).toFixed(1);
  return { fps: av('fps'), cpuMs: c.cpuMs, calls: av('calls'), tris: Math.round(av('tris')), textures: m.textures, geometries: m.geometries, programs: m.programs };
}
(async () => {
  fs.mkdirSync(`${OUT}/raw`, { recursive: true });
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const P = { 2: await page(b, 2), 3: await page(b, 3) };
  const AUTO = { arena3Wall: 'auto', arena3Posts: 1 };
  if (SH.includes('shots') || SH.includes('perf')) for (const room of ROOMS) for (const set of [2, 3]) {
    const { p } = P[set]; await enter(p, room, set === 3 ? AUTO : null); const th = TH[room], tag = set === 3 ? 'new' : 'old';
    if (set === 3) { const a = await D(p, 'arena32'); R.a32[th] = a; ok(a?.ready, `${PF} ${th}: арена 32 собрана (${a?.mode}, парапет ${a?.wall}, столбов ${a?.posts})`); ok(a?.mode === (MOB ? 'baked' : 'sprites'), `${PF} ${th}: auto → ${MOB ? 'в полу' : 'спрайты'} (${a?.mode})`); }
    else ok((await D(p, 'arena32')) === null, `${PF} ${th}: при arena3 выкл — старая арена (без arena32)`);
    if (SH.includes('shots')) {
      await D(p, 'freeCam', null); await sleep(800); await p.mouse.move(5, 5); await p.screenshot({ path: `${OUT}/raw/${PF}-${th}-${tag}-hero.png` });
      for (const k of ['wide', 'north', 'diag', 'south']) await cam(p, CAM[k], `${OUT}/raw/${PF}-${th}-${tag}-${k}.png`);
    }
    if (SH.includes('perf')) { (R.perf[th] ||= {})[tag] = await perf(p); console.log('perf', PF, th, tag, JSON.stringify(R.perf[th][tag])); }
  }
  if (SH.includes('modes')) { // парапет: спрайты / в полу; прореживание столбов 2 — на crypt и abode
    const { p } = P[3];
    for (const room of ['crypt', 'trial']) { const th = TH[room];
      for (const [nm, cfg] of [['sprites', { arena3Wall: 'sprites', arena3Posts: 1 }], ['baked', { arena3Wall: 'baked', arena3Posts: 1 }], ['posts2', { arena3Wall: MOB ? 'baked' : 'sprites', arena3Posts: 2 }]]) {
        await enter(p, room, cfg); const a = await D(p, 'arena32');
        ok(a.mode === cfg.arena3Wall, `${PF} ${th}: парапет ${nm} → ${a.mode}`);
        if (nm === 'posts2') ok(a.thinned > 0, `${PF} ${th}: прореживание — ${a.thinned} из ${a.tight} тесных столбов`);
        for (const k of ['north', 'diag']) await cam(p, CAM[k], `${OUT}/raw/${PF}-${th}-mode-${nm}-${k}.png`);
        if (SH.includes('perf') && room === 'crypt' && nm !== 'posts2') { R.perf['crypt-' + nm] = await perf(p); console.log('perf', PF, 'crypt', nm, JSON.stringify(R.perf['crypt-' + nm])); }
      }
    }
  }
  if (SH.includes('leak')) { // вход-выход ×6 (новая арена): textures/geometries/programs в хабе после каждого выхода
    for (const set of [2, 3]) { const { p } = P[set]; const tag = set === 3 ? 'new' : 'old'; const L = [];
      if ((await p.evaluate(() => window.__game.state().mode)) === 'run') { await D(p, 'leaveRun'); await sleep(2500); }
      for (let i = 0; i < 6; i++) { await enter(p, 'crypt', set === 3 ? AUTO : null); const inRun = await D(p, 'glMem'); await D(p, 'leaveRun'); await p.waitForFunction(() => window.__game.state().mode === 'hub', null, { timeout: 60000 }); await sleep(3000);
        const m = await D(p, 'glMem'); const heap = await p.evaluate(() => (performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null)); L.push({ i, run: { tex: inRun.textures, geo: inRun.geometries }, hub: { tex: m.textures, geo: m.geometries, prog: m.programs }, heapMb: heap }); }
      R.leak[tag] = L; console.log('leak', PF, tag, JSON.stringify(L));
      const a = L[1].hub, z = L[L.length - 1].hub; R.leak[tag + 'Grow'] = { tex: (z.tex - a.tex) / 4, geo: (z.geo - a.geo) / 4 };
      console.log(`INFO ${PF} ${tag}: за вход-выход (crypt ×6) в хабе текстур +${(z.tex - a.tex) / 4}, геометрий +${(z.geo - a.geo) / 4}; в забеге − в хабе = ${L.map((q) => q.run.tex - q.hub.tex).join(',')}`);
    }
    // хаб сам догружает текстуры со временем (ресурсы по радиусу, игроки: +9 за 30 с простоя без входов), поэтому рост хаба — только INFO;
    // утечка арены = рост разницы «в забеге − в хабе» от входа к входу (текстуры арены не освобождаются)
    for (const tag of ['old', 'new']) { const d = (R.leak[tag] || []).map((q) => q.run.tex - q.hub.tex).slice(1); const good = Math.max(...d) - Math.min(...d) <= 1 && d[d.length - 1] - d[0] <= 1; if (d.length) (tag === 'new' ? ok : (c, m) => console.log((c ? 'INFO ok ' : 'INFO шум ') + m))(good, `${PF} ${tag}: текстуры арены освобождаются при выходе (в забеге − в хабе: ${d.join(',')})`); }
  }
  R.errs = { old: P[2].errs.filter((e) => !/GL Driver/.test(e)), new: P[3].errs.filter((e) => !/GL Driver/.test(e)) };
  ok(!R.errs.new.length, `${PF}: ошибок страницы нет (${R.errs.new.join(' | ').slice(0, 300)})`);
  fs.writeFileSync(`${OUT}/report-${PF}.json`, JSON.stringify(R, null, 1));
  await b.close(); console.log(fails ? `FAIL ${fails}` : 'PASS arena3-shots'); process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
