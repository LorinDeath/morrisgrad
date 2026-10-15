// Тёмные арены забега + стабильная сортировка спрайтов (локально). TAG=before|after → /workspace/morrisgrad-round3/dark-arena/<TAG>-*.png
// A) мерцание: статичные пары спрайтов на одной глубине (debug.sortDemo), кадры при покачивании зума → одинаковые кадры при одном зуме
// B) все комнаты забега (crypt/abyss/duel/trial): кадр арены + мини-карта; яркость пола и читаемость (контраст мобов) — python
const { chromium } = require('playwright-core');
const { execFileSync } = require('child_process');
const { guardLocal, assertLocalUrl } = require(process.env.MC_LOCAL_GUARD || './_local');
const TAG = process.env.TAG || 'after', OUT = '/workspace/morrisgrad-round3/dark-arena';
require('fs').mkdirSync(OUT, { recursive: true });
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
const URL = (u) => `http://127.0.0.1:5199/game.html?name=Алекс&uid=test_dark_${u}&ws=ws://127.0.0.1:8787&fs=1&debug=1&panels=1`;
(async () => {
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = async (u) => { const ctx = await b.newContext({ viewport: { width: 1440, height: 860 } }); await guardLocal(ctx); const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(String(e).slice(0, 200)));
    await p.goto(assertLocalUrl(URL(u))); await p.waitForFunction(() => window.__game?.state?.().mode === 'hub', null, { timeout: 120000 }); await p.waitForTimeout(2500); return { p, errs, ctx }; };
  // A) мерцание
  if (!process.env.SKIP_A) {
    const { p, errs, ctx } = await page('sort');
    await p.evaluate(() => window.__game.debug.selectClass('mage')); await p.waitForTimeout(1500);
    const me = await p.evaluate(() => window.__game.state().player);
    ok((await p.evaluate(([x, y]) => window.__game.debug.sortDemo(x, y), [me.x, me.y])) === 'ok', 'sortDemo построен');
    await p.waitForTimeout(1500);
    await p.evaluate(() => { window.__game.atmo?.setQuality?.(3); }); // без частиц (светлячки летают через кадр)
    await p.evaluate(() => window.__game.debug.setZoom(0.5)); await p.waitForTimeout(2500);
    const s0 = await p.evaluate(([x, y]) => window.__game.debug.screenOf(x - 90, y + 34), [me.x, me.y]);
    const s1 = await p.evaluate(([x, y]) => window.__game.debug.screenOf(x + 100, y - 30), [me.x, me.y]);
    const clip = { x: Math.round(Math.min(s0.x, s1.x)), y: Math.round(Math.min(s0.y, s1.y)), width: Math.round(Math.abs(s1.x - s0.x)), height: Math.round(Math.abs(s1.y - s0.y)) };
    console.log('INFO clip', JSON.stringify(clip));
    const j0 = await p.evaluate(([x, y]) => window.__game.debug.screenOf(x - 50, y + 64), [me.x, me.y]), j1 = await p.evaluate(([x, y]) => window.__game.debug.screenOf(x + 20, y + 6), [me.x, me.y]);
    const jclip = { x: Math.round(Math.min(j0.x, j1.x)), y: Math.round(Math.min(j0.y, j1.y)), width: Math.round(Math.abs(j1.x - j0.x)), height: Math.round(Math.abs(j1.y - j0.y)) };
    const jf = []; for (let i = 0; i < 10; i++) { const f = `${OUT}/${TAG}-jitter-${i}.png`; await p.screenshot({ path: f, clip: jclip }); jf.push(f); await p.waitForTimeout(150 + i * 37); }
    const jd = execFileSync('python3', ['-c', `
import sys
from PIL import Image, ImageChops
ims=[Image.open(f).convert('RGB') for f in sys.argv[1:]]
def d(a,b):
  x=ImageChops.difference(a,b).convert('L').point(lambda v:255 if v>60 else 0); return sum(1 for v in x.getdata() if v)/(a.size[0]*a.size[1])
print(max(d(ims[0],im) for im in ims[1:]))
`, ...jf]).toString().trim();
    ok(+jd < 0.01, `дрожащая по y пара (±4 мм каждый кадр): порядок не прыгает — макс. отличие кадров ${(+jd * 100).toFixed(2)}%`);
    { const strip = execFileSync('python3', ['-c', `
import sys
from PIL import Image
ims=[Image.open(f) for f in sys.argv[2:]]; w,h=ims[0].size; o=Image.new('RGB',(w*len(ims),h))
for k,im in enumerate(ims): o.paste(im,(k*w,0))
o.save(sys.argv[1])
`, `${OUT}/${TAG}-jitter-strip.png`, ...jf]); void strip; }
    const files = [];
    for (let i = 0; i < 8; i++) { await p.evaluate((z) => window.__game.debug.setZoom(z), i % 2 ? 0.52 : 0.5); await p.waitForTimeout(2500); const f = `${OUT}/${TAG}-sort-${i}.png`; await p.screenshot({ path: f, clip }); files.push(f); }
    await p.screenshot({ path: `${OUT}/${TAG}-sort-demo.png` });
    const out = execFileSync('python3', ['-c', `
import sys
from PIL import Image, ImageChops
fs=sys.argv[1:]; ims=[Image.open(f).convert('RGB') for f in fs]
def d(a,b):
  x=ImageChops.difference(a,b).convert('L').point(lambda v:255 if v>40 else 0); return sum(1 for v in x.getdata() if v)/ (a.size[0]*a.size[1])
print(max(d(ims[i],ims[i+2]) for i in range(len(ims)-2)))
`, ...files]).toString().trim();
    ok(+out < 0.004, `спрайты на одной глубине стабильны: макс. доля «прыгающих» пикселей между кадрами при одном зуме ${(+out * 100).toFixed(2)}%`);
    ok(!errs.length, 'нет ошибок страницы (хаб) ' + errs.join('|')); await ctx.close();
  }
  // B) комнаты забега
  for (const room of process.env.SKIP_B ? [] : ['crypt', 'abyss', 'duel', 'trial']) {
    const { p, errs, ctx } = await page('r_' + room);
    await p.evaluate(() => window.__game.debug.selectClass('mage')); await p.waitForTimeout(1200);
    await p.evaluate((r) => window.__game.startRun(r), room);
    await p.waitForFunction(() => window.__game.state().mode === 'run', null, { timeout: 30000 }).catch(() => {});
    // ждём мобов (по игровым часам) и чуть стреляем — снаряды/вспышки дают свет
    for (let i = 0; i < 40; i++) { const n = await p.evaluate(() => window.__game.state().run?.enemies || 0); if (n >= 6) break; await p.waitForTimeout(500); }
    await p.mouse.move(900, 380); await p.mouse.down(); await p.waitForTimeout(1800);
    const f = `${OUT}/${TAG}-run-${room}.png`; await p.screenshot({ path: f }); await p.mouse.up();
    const mm = await p.$('.hud-minimap-card canvas');
    if (mm) await mm.screenshot({ path: `${OUT}/${TAG}-minimap-${room}.png` });
    const st = await p.evaluate(() => window.__game.state());
    const lum = execFileSync('python3', ['-c', `
import sys
from PIL import Image
im=Image.open(sys.argv[1]).convert('L'); w,h=im.size
c=im.crop((int(w*0.3),int(h*0.2),int(w*0.7),int(h*0.8)))
px=sorted(c.getdata()); n=len(px)
print(sum(px)/n, px[n//2], px[int(n*0.99)])
`, f]).toString().trim().split(' ').map(Number);
    console.log(`INFO ${room}: mode ${st.mode}, enemies ${st.run?.enemies}, luminance mean ${lum[0].toFixed(1)} median ${lum[1]} p99 ${lum[2]}`);
    ok(st.mode === 'run', `${room}: забег запущен`);
    if (TAG === 'after') ok(lum[1] < 45 && lum[2] > 150, `${room}: пол тёмный (медиана ${lum[1]}), яркие акценты есть (p99 ${lum[2]})`);
    ok(!errs.length, `${room}: нет ошибок страницы ${errs.join('|')}`);
    await ctx.close();
  }
  console.log(fails ? `FAILED ${fails}` : 'ALL PASS'); await b.close(); process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
