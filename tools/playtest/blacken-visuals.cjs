// LOCAL (хаб «Поляна»): вид очернения — значки вещей (окно C «Мой персонаж», книга «Снаряжение»), подсказка, строка в ПАРАМЕТРАХ,
// портрет в окне, герой в мире (свой и глазами другого игрока) на 0/30/70/100 %. Только 127.0.0.1 (guardLocal).
const { chromium } = require('playwright-core');
const { guardLocal, assertLocalUrl } = require('./_local.cjs');
const OUT = process.env.OUT || '/workspace/morrisgrad-round3/blacken-visuals';
const BASE = process.env.BM_BASE || 'http://127.0.0.1:5293/game.html', WS = process.env.BM_WS || 'ws://127.0.0.1:8879';
assertLocalUrl(BASE); assertLocalUrl(WS);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
(async () => {
  require('fs').mkdirSync(OUT, { recursive: true });
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const open = async (uid, cls) => {
    const ctx = await b.newContext({ viewport: { width: 1280, height: 760 } }); await guardLocal(ctx);
    const p = await ctx.newPage(); p.st = null; p.errs = [];
    p.on('pageerror', (e) => p.errs.push(String(e).slice(0, 200)));
    p.on('websocket', (ws) => ws.on('framereceived', (f) => { const s = String(f.payload); if (s.includes('"type":"meta_state"')) try { p.st = JSON.parse(s); } catch {} if (s.includes('"type":"dev_bm"')) try { p.dev = JSON.parse(s); } catch {} }));
    await p.goto(assertLocalUrl(`${BASE}?name=${uid}&uid=${uid}&ws=${WS}&fs=1&debug=1`));
    await p.waitForFunction(() => window.__game?.state?.().mode === 'hub', null, { timeout: 120000 }); await sleep(800);
    await p.evaluate((c) => window.__game.debug.selectClass(c), cls); await sleep(1200);
    p.S = (o) => p.evaluate((x) => window.__game.debug.send(x), o); p.G = (f, a) => p.evaluate(f, a);
    p.bm = async (o) => { p.dev = null; await p.S({ type: 'dev_grant', bm: o }); for (let i = 0; i < 40 && !p.dev; i++) await sleep(100); return p.dev; };
    p.tp = async (x, y) => { await p.G(([a, c]) => window.__game.debug.tp(a, c, true), [x, y]); await sleep(900); };
    return p;
  };
  const tag = Date.now().toString(36);
  const A = await open('bv_a_' + tag, 'warrior'), B = await open('bv_b_' + tag, 'mage');
  await A.S({ type: 'dev_grant', xp: 60000 }); await sleep(500);
  for (const id of ['dew_slime_helmet', 'dew_slime_armor', 'dew_slime_legs', 'dew_slime_hands']) await A.S({ type: 'dev_grant', item: id });
  await sleep(1500);
  for (const it of A.st.account.inv) { await A.S({ type: 'equip', uid: it.uid }); await sleep(250); }
  await sleep(1200);
  const worn = () => (A.st?.account?.inv || []).filter((i) => Object.values(A.st?.hero?.equip || {}).includes(i.uid));
  ok(worn().length === 4, 'A: надето 4 вещи');
  // хаб (Поляна): открытое место без крон — герой виден целиком; очернение — из players_state.stats.bk (где угодно)
  const pa = await A.G(() => window.__game.state().player); await A.tp(pa.x, pa.y + 120); await B.tp(pa.x + 90, pa.y + 130); await sleep(1500);
  const aSid = (await A.G(() => window.__game.state().myId)), clip = { x: 440, y: 200, width: 400, height: 300 };
  const res = [];
  for (const lv of [0, 30, 70, 100]) {
    await A.bm({ blk: lv }); await sleep(2600);
    const me = (await A.G(() => window.__game.debug.charsBlk()))['__me'];
    const bSees = await B.G((sid) => window.__game.debug.charsBlk()['p_' + sid], aSid);
    res.push({ lv, me: me?.bk, other: bSees?.bk, eff: A.st?.hero?.effective?.blkVis });
    ok(lv === 0 ? !me?.on && !(me?.bk) : me?.on && me.bk > 0, `${lv}%: свой герой — bk ${me?.bk} (сервер ${A.st?.hero?.effective?.blkVis})`);
    ok((bSees?.bk | 0) === (me?.bk | 0) && (lv === 0 || bSees?.on), `${lv}%: другой игрок видит то же — bk ${bSees?.bk}`);
    await A.mouse.move(5, 750); await B.mouse.move(5, 750); await sleep(200);
    await A.screenshot({ path: `${OUT}/world-${lv}-self.png`, clip });
    await B.screenshot({ path: `${OUT}/world-${lv}-other-sees.png`, clip: { ...clip, x: clip.x - 90 } });
    await A.G(() => window.__game.debug.charSheet()); await A.waitForSelector('.mc-charsheet .mc-insp-gear', { timeout: 10000 }); await sleep(1600);
    const cs = await A.$eval('.mc-charsheet', (e) => ({ ov: [...e.querySelectorAll('.mc-insp-gear .mc-blk')].map((x) => +x.dataset.k), shade: e.querySelectorAll('.mc-insp-gear .mc-blkd').length, line: (e.innerText.match(/Очернение снаряжения\s*([\d.]+)%/) || [])[1], tip: (e.querySelector('.mc-insp-gear .tip .bk') || {}).textContent || '', pv: e.querySelector('canvas.mc-insp-pv')?.dataset.drawn, shadow: (e.innerText.match(/Ушло в тень[^\n]*\n?[^\n]*/) || [''])[0] }));
    console.log('  C:', JSON.stringify(cs));
    if (lv === 0) ok(!cs.ov.length && !cs.line, '0%: в окне C нет очернения');
    else { ok(cs.ov.length === 4 && cs.shade === 4, `${lv}%: оверлей на 4 слотах окна C (сила ${cs.ov.join(',')})`); ok(+cs.line > 0, `${lv}%: ПАРАМЕТРЫ — «Очернение снаряжения ${cs.line}%»`); ok(/Очернение|Сломано/.test(cs.tip), `${lv}%: подсказка вещи — «${cs.tip}»`); ok(+cs.pv > 0, `${lv}%: портрет очернён (${cs.pv})`); }
    await A.mouse.move(1270, 700); await sleep(300); await A.screenshot({ path: `${OUT}/C-window-${lv}.png` });
    if (lv === 70) { await A.hover('.mc-charsheet .mc-insp-slot:nth-child(3)'); await sleep(400); await A.screenshot({ path: `${OUT}/C-window-70-tooltip.png` }); }
    await A.keyboard.press('Escape'); await sleep(500);
    if (lv === 70) { // глазами другого игрока: окно «Персонаж»
      await B.G((sid) => window.__game.debug.inspect(sid), aSid); await B.waitForSelector('.mc-insp .mc-insp-gear', { timeout: 10000 }); await sleep(1600);
      const bi = await B.$eval('.mc-insp', (e) => ({ ov: e.querySelectorAll('.mc-insp-gear .mc-blk').length, line: (e.innerText.match(/Очернение снаряжения\s*([\d.]+)%/) || [])[1], pv: e.querySelector('canvas.mc-insp-pv')?.dataset.drawn }));
      ok(bi.ov === 4 && +bi.line > 0 && +bi.pv > 0, 'другой игрок: окно «Персонаж» — оверлей, строка, портрет ' + JSON.stringify(bi));
      await B.screenshot({ path: `${OUT}/other-inspects-70.png` }); await B.keyboard.press('Escape'); await sleep(400);
    }
  }
  const ks = res.map((r) => r.me | 0); ok(ks[0] === 0 && ks[1] < ks[2] && ks[2] < ks[3], 'сила растёт с очернением: ' + ks.join(' → '));
  // по вещам: ноги 35 %, остальные 0 — оверлей только у ног; книга «Снаряжение» (надетые и сумка)
  await A.bm({ blk: 0 }); const legs = worn().find((i) => /legs/.test(i.id)); await A.bm({ blkUid: { uid: legs.uid, v: 35 } }); await sleep(2200);
  await A.G(() => window.__game.debug.charSheet()); await A.waitForSelector('.mc-charsheet .mc-insp-gear'); await sleep(1500);
  const mixed = await A.$$eval('.mc-charsheet .mc-insp-slot', (e) => e.map((x) => x.querySelectorAll('.mc-blk').length));
  ok(mixed.filter(Boolean).length === 1, 'ноги 35 %: оверлей только на одном слоте ' + mixed.join(','));
  await A.screenshot({ path: `${OUT}/C-window-mixed-legs35.png` }); await A.keyboard.press('Escape'); await sleep(400);
  await A.G(() => window.__game.debug.openBook('gear')); await sleep(1200);
  const g = await A.$$eval('.mc-gslot .mc-blk', (e) => e.length).catch(() => 0); ok(g === 1, `книга «Снаряжение»: оверлей на надетых ногах (${g})`);
  await A.screenshot({ path: `${OUT}/book-gear-legs35.png` });
  ok(!A.errs.length && !B.errs.length, 'без ошибок страницы ' + [...A.errs, ...B.errs].join(' | '));
  console.log('levels', JSON.stringify(res));
  console.log(fails ? `FAILED ${fails}` : 'blacken-visuals ok'); await b.close(); process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
