// LOCAL: PK над героем — полоса отсчёта (вход 7 с белый→красный, сброс уроном, выход 30 с красный→белый) у себя и у другого
// игрока, значок PK слева от имени (PK → АДМИН → имя) для PK-режима и для убийцы (5 мобов за окно). Скриншоты + кадры GIF.
// Только 127.0.0.1 (guardLocal). Сервер: wrangler dev --local (MC_DEV_TRUST_USERID=1), клиент: vite 5297.
const { chromium } = require('playwright-core');
const { guardLocal, assertLocalUrl } = require('./_local.cjs');
const fs = require('fs');
const OUT = process.env.OUT || '/workspace/morrisgrad-round3/dome-city/polish/pk';
const BASE = process.env.C_BASE || 'http://127.0.0.1:5297/game.html', WS = process.env.C_WS || 'ws://127.0.0.1:8883';
assertLocalUrl(BASE); assertLocalUrl(WS);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const CX = 24624, CY = 3376;
let ok = 0, bad = 0; const t = (n, c, x) => { c ? (ok++, console.log('ok  ', n)) : (bad++, console.log('FAIL', n, x === undefined ? '' : JSON.stringify(x))); };
const rgb = (s) => (String(s).match(/\d+/g) || []).map(Number);
(async () => {
  fs.mkdirSync(`${OUT}/frames`, { recursive: true }); fs.mkdirSync(`${OUT}/framesB`, { recursive: true });
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const open = async (uid) => {
    const ctx = await b.newContext({ viewport: { width: 1280, height: 760 } }); await guardLocal(ctx);
    const p = await ctx.newPage(); p.errs = []; p.on('pageerror', (e) => p.errs.push(String(e)));
    await p.goto(assertLocalUrl(`${BASE}?name=${uid}&uid=${uid}&ws=${WS}&fs=1&debug=1`));
    await p.waitForFunction(() => window.__game?.state?.().mode === 'hub', null, { timeout: 120000 }); await sleep(800);
    p.G = (f, a) => p.evaluate(f, a); p.uid = uid; return p;
  };
  const toArinar = async (p) => {
    if ((await p.G(() => window.__game.state().player?.stats?.classId)) == null) { await p.G(() => window.__game.debug.selectClass('warrior')); await sleep(1500); }
    for (let i = 0; i < 8 && (await p.G(() => window.__game.state().world)) !== 'arinar'; i++) { await p.G(() => { window.__game.debug.rawSend({ type: 'dev_teleport', x: 240, y: 600 }); window.__game.debug.teleport(240, 600); }); await sleep(1200); await p.G(() => window.__game.debug.rawSend({ type: 'use_portal', portalId: 'portal_arinar' })); await sleep(3000); }
  };
  const dev = async (p, o) => { await p.G((o) => { window.__devCity = null; window.__game.debug.rawSend({ type: 'dev_grant', city: o }); }, o); await p.waitForFunction(() => window.__devCity, null, { timeout: 5000 }).catch(() => {}); return p.G(() => window.__devCity); };
  const tp = async (p, x, y) => { await p.G(([x, y]) => window.__game.debug.tp(x, y, true), [x, y]); await sleep(1200); };
  const city = (p) => p.G(() => window.__game.debug.city());
  const ids = {}; // ключ подписи: свой герой — 'me', чужой — 'p_<sid>' (по имени нельзя: «призрак» прошлой сессии с тем же именем)
  const lab = async (p, who) => { const key = p.uid === who ? 'me' : 'p_' + ids[who]; const L = await p.G(() => window.__game.debug.city().labels); return L.find((l) => l.key === key) || null; };
  const CROP = { x: 400, y: 150, width: 480, height: 300 };
  const shot = (p, n, crop = false) => p.screenshot({ path: `${OUT}/${n}.png`, ...(crop ? { clip: CROP } : {}) }).then(() => console.log('shot', n));
  // кадры GIF: A (свой герой) и B (видит A рядом) — каждый опрос; кадр-«снимок» момента = копия последнего кадра
  const CROPB = { x: 170, y: 110, width: 600, height: 340 }; // B в центре экрана, A левее (~310 px) — оба в кадре
  let fr = 0, last = null; const frame = async () => { const n = String(fr++).padStart(3, '0');
    await A.screenshot({ path: `${OUT}/frames/f${n}.png`, clip: CROP }); await B.screenshot({ path: `${OUT}/framesB/f${n}.png`, clip: CROPB }); last = n; };
  const still = (name) => { if (last == null) return; fs.copyFileSync(`${OUT}/frames/f${last}.png`, `${OUT}/${name}-A.png`); fs.copyFileSync(`${OUT}/framesB/f${last}.png`, `${OUT}/${name}-seen-by-B.png`); console.log('still', name); };

  const A = await open('city_admin'), B = await open('city_b'); await toArinar(A); await toArinar(B);
  ids.city_admin = await A.G(() => window.__game.debug.myId()); ids.city_b = await B.G(() => window.__game.debug.myId());
  const d0 = await dev(A, { pk: false, clearKills: true, fastPk: { enter: 7, exit: 30 } }); await dev(B, { pk: false, clearKills: true });
  const R = d0.city.r, X = CX + R + 260, Y = CY;                       // за куполом — PK-режим разрешён
  await tp(A, X, Y); await tp(B, X + 70, Y + 10); // B справа рядом (подписи не перекрываются — иначе оверлей прячет чужую); кадр B шире — A в нём
  await A.G(() => window.__game.debug.rawSend({ type: 'dev_grant', bm: { mortal: true } })); await sleep(500); // dev-телепорт даёт неуязвимость — урон не прошёл бы
  for (const p of [A, B]) await p.G(() => window.__game.debug.setCells(10)); await sleep(1500);
  // удар по A — dev domeHit (тот же путь, что удар моба в zone.update); моба рядом не держим — он сбивал бы отсчёт сам

  // ход отсчёта: опрос подписей A (у себя) и B (видит A) + кадры GIF, пока условие не выполнится; история [мс, t, p, g-канал цвета]
  // история — пишется В СТРАНИЦЕ (setInterval 150 мс), не зависит от скорости скриншотов на нагруженном ящике
  const probe = (p, key) => p.G((key) => { clearInterval(window.__pkI); const H = (window.__pkH = []), T0 = Date.now();
    window.__pkI = setInterval(() => { const l = window.__game.debug.city().labels.find((x) => x.key === key); if (l?.bar) H.push([Date.now() - T0, l.bar.t, l.bar.p, l.bar.col]); }, 150); }, key);
  const unprobe = (p) => p.G(() => { clearInterval(window.__pkI); return window.__pkH || []; });
  let onFrame = null; const watch = async (until, maxMs, frames = true) => { const T0 = Date.now();
    await probe(A, 'me'); await probe(B, 'p_' + ids.city_admin);
    while (Date.now() - T0 < maxMs) { const la = await lab(A, 'city_admin'), lb = await lab(B, 'city_admin');
      if (frames) { await frame(); if (onFrame) onFrame(la, lb); } if (await until(la, lb)) break; }
    const cv = (h) => h.map((x) => [x[0], x[1], x[2], rgb(x[3])[1]]);
    const ha = cv(await unprobe(A)), hb = cv(await unprobe(B)); // 'd' — вспышка «готово» после смены режима: отдельно
    return { a: ha.filter((x) => x[1] !== 'd'), b: hb.filter((x) => x[1] !== 'd'), doneA: ha.some((x) => x[1] === 'd'), doneB: hb.some((x) => x[1] === 'd') }; };
  const mono = (h) => h.every((x, i) => !i || x[2] >= h[i - 1][2] - 0.02);
  // ожидаемый зелёный канал по формуле полосы (smoothstep между #f8fafc и #dc2626): вход — белый→красный, выход — обратно
  const gExp = (t, p) => { const k = Math.max(0, Math.min(1, p)), q = k * k * (3 - 2 * k); return t === '1' ? 250 + (38 - 250) * q : 38 + (250 - 38) * q; };
  const colOk = (h) => h.length > 0 && h.every((x) => Math.abs(x[3] - gExp(x[1], x[2])) <= 30);

  // 1) вход и сброс уроном (окно входа на время проверки — 14 с: ящик под нагрузкой, кадры медленные; 7 с — в city-test)
  await dev(A, { fastPk: { enter: 14, exit: 30 }, pk: false });
  await A.click('.ch-pk'); const T1 = Date.now();
  let a1 = null, b1 = null; for (let i = 0; i < 30 && !(a1?.bar && b1?.bar); i++) { a1 = await lab(A, 'city_admin'); b1 = await lab(B, 'city_admin'); }
  t('вход: полоса над своим героем (A)', a1?.bar?.t === '1' && a1.bar.p < 0.8, a1);
  t('вход: другой игрок видит полосу над A (B)', b1?.bar?.t === '1', b1);
  await frame(); still('01-enter-countdown');
  await dev(A, { domeHit: 1 });
  let ac = null, bc = null; for (let i = 0; i < 20 && !(ac?.bar?.t === 'c' && bc?.bar?.t === 'c'); i++) { if (ac?.bar?.t !== 'c') ac = await lab(A, 'city_admin'); if (bc?.bar?.t !== 'c') bc = await lab(B, 'city_admin'); }
  t('урон: отсчёт сброшен — полоса гаснет «✕» (A)', ac?.bar?.t === 'c', ac);
  t('урон: сброс виден и у B', bc?.bar?.t === 'c', bc);
  await frame(); still('02-cancel-by-damage');
  await sleep(1500); const h1 = (await city(A)).hud; t('после сброса полосы нет, PK не включён', !(await lab(A, 'city_admin'))?.bar && !h1.pk, h1);

  // 2) вход до конца (7 с): полоса заполняется, белый → красный; потом значок PK слева (PK → АДМИН → имя), красное имя
  await dev(A, { fastPk: { enter: 7, exit: 30 }, pk: false });
  await A.click('.ch-pk');
  let got = {}; onFrame = (la) => { const p = la?.bar?.p; if (la?.bar?.t === '1') { if (p > 0.3 && p < 0.7 && !got.m) { got.m = 1; still('03-enter-mid'); } if (p > 0.75 && !got.l) { got.l = 1; still('04-enter-late-red'); } } };
  const H2 = await watch(async () => (await city(A)).hud.pk, 40000);
  console.log('enter history A', JSON.stringify(H2.a.map((x) => [x[0], x[2], x[3]])));
  t('вход: полоса росла монотонно (A)', H2.a.length >= 2 && mono(H2.a), H2.a);
  t('вход: цвет из белого в красный (зелёный канал падал)', H2.a.length >= 2 && H2.a[0][3] > H2.a[H2.a.length - 1][3] + 40, H2.a);
  t('вход: цвет каждой точки — по доле (белый→красный)', colOk(H2.a), H2.a);
  t('вход: B видел полосу A', H2.b.length >= 1 && H2.b.every((x) => x[1] === '1'), H2.b);
  t('вход: по готовности — вспышка «готово» (A и B)', H2.doneA && H2.doneB, [H2.doneA, H2.doneB]);
  const h2 = (await city(A)).hud; t('PK включён (7 с)', h2.pk === true, h2);
  let a3 = null, b3 = null; for (let i = 0; i < 20 && !(a3?.tag && b3?.tag); i++) { a3 = await lab(A, 'city_admin'); b3 = await lab(B, 'city_admin'); }
  t('значок PK слева от имени (у себя)', a3?.tag === 'PK' && a3.order[0] === 'PK', a3);
  t('порядок значков: PK, затем АДМИН, затем имя', a3?.order?.[0] === 'PK' && /админ/i.test(a3?.order?.[1] || '') && a3.text.indexOf('city_admin') > a3.text.toLowerCase().indexOf('админ'), a3);
  t('B видит значок PK и красное имя A', b3?.tag === 'PK' && /239, 68, 68/.test(b3.color), b3);
  onFrame = null; for (let i = 0; i < 3; i++) await frame(); still('05-nameplate-PK-ADMIN');

  // 3) выход (30 с): красный → белый
  await A.click('.ch-pk'); let e0 = null; for (let i = 0; i < 20 && e0?.bar?.t !== '2'; i++) e0 = await lab(A, 'city_admin');
  t('выход: полоса пошла (t=2), цвет по формуле красный→белый', e0?.bar?.t === '2' && Math.abs(rgb(e0.bar.col)[1] - gExp('2', e0.bar.p)) <= 30, e0);
  await frame(); still('06-exit-start-red');
  got = {}; onFrame = (la) => { const p = la?.bar?.p; if (la?.bar?.t === '2') { if (p > 0.4 && p < 0.65 && !got.m) { got.m = 1; still('07-exit-mid'); } if (p > 0.85 && !got.l) { got.l = 1; still('08-exit-late-white'); } } };
  const H3 = await watch(async () => !(await city(A)).hud.pk, 90000); onFrame = null;
  console.log('exit history A', JSON.stringify(H3.a.map((x) => [x[0], x[2], x[3]])));
  t('выход: полоса росла монотонно', H3.a.length >= 2 && mono(H3.a), H3.a);
  t('выход: цвет из красного в белый (зелёный канал рос)', H3.a.length >= 2 && H3.a[H3.a.length - 1][3] > H3.a[0][3] + 60, H3.a);
  t('выход: цвет каждой точки — по доле (красный→белый)', colOk(H3.a), H3.a);
  t('выход: B видел полосу выхода', H3.b.some((x) => x[1] === '2'), H3.b.slice(0, 3));
  // длительность — по скорости полосы (опрос стартует уже после клика): (t_last − t_first) / (p_last − p_first)
  { const a0 = H3.a[0], a1 = H3.a[H3.a.length - 1], est = a1 && a1[2] - a0[2] > 0.3 ? (a1[0] - a0[0]) / (a1[2] - a0[2]) : 0;
    t('выход: длился ~30 с (по скорости полосы 27…33 с)', est >= 27000 && est <= 33000, { est: Math.round(est), a0, a1 }); }
  const h3 = (await city(A)).hud; t('PK выключен', h3.pk === false, h3);
  await sleep(1200); const a4 = await lab(A, 'city_admin'); t('после выхода значка PK нет', !a4?.tag, a4);
  for (let i = 0; i < 3; i++) await frame();

  // 4) убийца без PK-режима (5 мобов за окно): значок PK и красное имя — у B для A
  await dev(B, { mobKills: 5 }); await sleep(1800);
  const kb = await lab(A, 'city_b'); t('убийца (5 мобов) — значок PK у имени, видят другие', kb?.tag === 'PK' && /239, 68, 68|ef4444/.test(kb.color), kb);
  const kbs = await lab(B, 'city_b'); t('убийца видит значок у себя', kbs?.tag === 'PK', kbs);
  await frame(); still('09-killer-tag-city_b');
  await dev(B, { clearKills: true }); await sleep(1500); t('журнал очищен — значка нет', !(await lab(A, 'city_b'))?.tag);
  await dev(A, { pk: false, clearKills: true });
  try { require('child_process').execSync(`python3 -c "from PIL import Image;import glob
for d,o in (('frames','pk-A.gif'),('framesB','pk-seen-by-B.gif')):
  fs=sorted(glob.glob('${OUT}/'+d+'/f*.png')); ims=[Image.open(f).convert('RGB') for f in fs]
  ims[0].save('${OUT}/'+o, save_all=True, append_images=ims[1:], duration=260, loop=0)"`); console.log('gif ok'); } catch (e) { console.log('gif fail', String(e).slice(0, 200)); }
  console.log('errors', A.errs.slice(0, 3), B.errs.slice(0, 3));
  console.log(`\n${ok} ok, ${bad} fail`); await b.close(); process.exit(bad ? 1 : 0);
})().catch((e) => { console.error('FAIL', e); process.exit(1); });
