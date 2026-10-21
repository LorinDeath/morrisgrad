// LOCAL: автоматическая проверка цветовой точности спрайтов под светом (страница light-fidelity-page.js).
// Пороги: среднее |ΔV| ≤ 0.02, среднее ΔS ∈ [−0.02, +0.03], p95 max|ΔRGB| ≤ 0.04, ни одного пикселя, высвеченного в белый.
// REPO=/workspace/mg-light-base — проверить «до» (origin/main). MOBILE=1 — как на телефоне (без PointLight, меньше частиц).
// LIGHT='{"pool":2}' — прогон с другими значениями админки «💡 Свет». Перед прогоном перезапустите vite харнесса (HMR ?t= даёт вторые копии модулей).
const { chromium } = require('playwright-core');
const { guardLocal, assertLocalUrl } = require('./_local.cjs');
const BASE = assertLocalUrl(process.env.LF_VITE || 'http://127.0.0.1:5321/');
const REPO = process.env.REPO || require('path').resolve(__dirname, '../..');
const OUT = process.env.OUT || '/workspace/morrisgrad-round3/light-fix';
const LIM = { dV: 0.02, dSmin: -0.02, dSmax: 0.03, p95: 0.04 };
(async () => {
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const ctx = await b.newContext({ viewport: { width: 920, height: 720 }, deviceScaleFactor: 1 }); await guardLocal(ctx);
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(String(e).slice(0, 300))); p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text().slice(0, 300)); });
  await p.goto(BASE + 'light-fidelity.html').catch(() => {}); // любая страница vite (тот же origin): модули грузятся через /@fs
  const PAGE = require('path').resolve(__dirname, 'light-fidelity-page.js');
  const go = (only) => p.evaluate(async ([page, repo, mobile, only, light]) => { document.body.innerHTML = ''; const m = await import(`/@fs${page}`); return m.run({ mobile, repo, only, light }); }, [PAGE, REPO, !!process.env.MOBILE, only, process.env.LIGHT ? JSON.parse(process.env.LIGHT) : null]).catch((e) => ({ err: String(e) }));
  const res = await go(''); if (res.err) { console.error('FAIL', res.err, errs.join(' | ')); process.exit(2); }
  await p.screenshot({ path: `${OUT}/fidelity-${process.env.TAG || 'run'}-sprites.png` });
  const rg = await go('ground'); if (rg.err) { console.error('FAIL', rg.err, errs.join(' | ')); process.exit(2); }
  await p.screenshot({ path: `${OUT}/fidelity-${process.env.TAG || 'run'}-ground.png` }); res.results.push(...rg.results);
  let fails = 0;
  console.log('repo', res.repo, 'LIGHT', JSON.stringify(res.light), 'heroLight', res.heroLight);
  for (const r of res.results) {
    console.log(`— ${r.mood}  grade ${r.grade.join(',')}`);
    for (const it of r.items) {
      const ok = !it.err && it.n > 30 && it.dV <= LIM.dV && it.dS >= LIM.dSmin && it.dS <= LIM.dSmax && it.p95 <= LIM.p95 && it.clip === 0;
      if (!ok) fails++;
      console.log(`  ${ok ? 'PASS' : 'FAIL'} ${it.name.padEnd(18)} n=${String(it.n).padStart(5)} |ΔV|=${it.dV} ΔS=${it.dS} p95=${it.p95} worst=${it.worst} белых=${it.clip}${it.err ? ' ' + it.err : ''}${!ok && it.wpair ? ' worst e/r ' + JSON.stringify(it.wpair) : ''}`);
    }
  }
  require('fs').writeFileSync(`${OUT}/fidelity-${process.env.TAG || 'run'}.json`, JSON.stringify(res, null, 1));
  if (errs.length) console.log('page errors:', errs.join(' | '));
  console.log(fails ? `light-fidelity: FAILED ${fails}` : 'light-fidelity ok'); await b.close(); process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
