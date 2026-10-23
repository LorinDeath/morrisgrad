// LOCAL ONLY (локальный wrangler dev + vite): отсчёт появления на месте спавна (мировые боссы и редкие Отголоски).
// Проверяет: подпись в мире (ПК и размер iPhone), «вот-вот», исчезновение при жизни, реальный таймер после убийства,
// трекер/стрелку/карту, подсказку в Бестиарии. Скрины: OUT (по умолчанию /workspace/elite-fix).
// Запуск: NODE_PATH=/workspace/mc-ui-tools/node_modules VP=pc|iphone node tools/playtest/elite-timers.cjs
const { chromium, devices } = require('playwright-core');
const { guardLocal, assertLocalUrl } = require('./_local.cjs');
const BASE = process.env.GR_BASE || 'http://127.0.0.1:5395/game.html', WS = process.env.GR_WS || 'ws://127.0.0.1:8995';
const OUT = process.env.OUT || '/workspace/elite-fix', VP = process.env.VP || 'pc', MOB = VP !== 'pc';
const fs = require('fs'); fs.mkdirSync(OUT, { recursive: true });
const OX = MOB ? 60 : -70, OY = MOB ? 70 : 80; // где стоит игрок относительно места появления (на телефоне — чтобы подпись не пряталась за кнопками)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
(async () => {
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox', '--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const d = MOB ? { ...devices['iPhone 13'] } : { viewport: { width: 1280, height: 760 } }; delete d.defaultBrowserType;
  const ctx = await b.newContext(d); await guardLocal(ctx);
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(String(e).slice(0, 300)));
  const G = (f, a) => p.evaluate(f, a), S = (o) => G((x) => window.__game.debug.rawSend(x), o);
  const uid = 'et_' + VP + Date.now().toString(36);
  await p.goto(assertLocalUrl(`${BASE}?name=${uid}&uid=${uid}&ws=${WS}&fs=1&debug=1${MOB ? '&mobile=1' : ''}`));
  await p.waitForFunction(() => window.__game?.state?.().mode === 'hub', null, { timeout: 120000 }); await sleep(800);
  await G(() => window.__game.debug.selectClass('warrior')); await sleep(1500);
  await G(() => window.__game.board?.tut?.('skip')); await sleep(300);
  await S({ type: 'dev_grant', xp: 3000000 }); await sleep(400);
  const tp = async (x, y) => { await S({ type: 'dev_teleport', x, y, god: true }); await G(([a, c]) => window.__game.debug.teleport(a, c), [x, y]); await sleep(2500); };
  for (let i = 0; i < 8 && (await G(() => window.__game.state().world)) !== 'arinar'; i++) { await tp(240, 600); await S({ type: 'use_portal', portalId: 'portal_arinar' }); await sleep(2500); }
  ok((await G(() => window.__game.state().world)) === 'arinar', 'в Аринаре'); await sleep(2500);
  const shot = async (n) => { await G(() => document.querySelectorAll('.mcl-err[data-code="MC-A04"]').forEach((e) => e.remove())); await p.screenshot({ path: `${OUT}/${VP}-${n}.png` }); console.log('shot', `${OUT}/${VP}-${n}.png`); };
  const state = () => G(() => window.__game.debug.bossState().map(([k, s]) => ({ k, alive: s.alive, left: Math.round((s.at - Date.now()) / 1000), type: s.type, x: s.x, y: s.y, kind: s.kind, off: !!s.off })));
  const labels = () => G(() => [...document.querySelectorAll('.mc3d-label')].filter((e) => { const r = e.getBoundingClientRect(), cs = getComputedStyle(e); return cs.display !== 'none' && cs.visibility !== 'hidden' && +cs.opacity > 0.05 && r.width > 0 && r.right > 0 && r.left < innerWidth && r.bottom > 0 && r.top < innerHeight; }).map((e) => e.textContent.replace(/\s+/g, ' ').trim()).filter((t) => /появ/.test(t)));
  let st = []; for (let i = 0; i < 24 && st.filter((x) => x.kind === 'rare').length < 5; i++) { st = await state(); await sleep(500); }
  const rares = st.filter((x) => x.kind === 'rare'); ok(rares.length === 5, 'сервер прислал места появления всех 5 редких: ' + rares.map((x) => x.type).join(','));
  ok(rares.every((x) => x.x != null && x.y != null), 'у каждого есть координаты места появления');
  const R = rares.find((x) => x.type === 'dew_king') || rares[0];
  // ---- 1. редкий: отсчёт в мире
  await S({ type: 'dev_grant', rareIn: 700 }); await sleep(7000); await tp(R.x + OX, R.y + OY); await sleep(2500);
  st = await state(); const r1 = st.find((x) => x.type === R.type); console.log('редкий', JSON.stringify(r1));
  let L = await labels(); console.log('подписи:', JSON.stringify(L)); console.log('rect:', JSON.stringify(await G(() => [...document.querySelectorAll('.mc3d-label')].filter((e) => /появ/.test(e.textContent)).map((e) => { const r = e.getBoundingClientRect(); return [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height), e.style.cssText.slice(0, 120)]; })))); 
  ok(L.some((t) => /появится через \d+:\d\d/.test(t)), 'подпись в мире: «появится через мм:сс»');
  ok(r1.left > 600 && r1.left <= 700, 'клиентский отсчёт соответствует серверному (' + r1.left + ' с)');
  ok(!L.some((t) => /Король Росы/.test(t)), 'вид не встречен: имя скрыто («Редкий Отголосок»)');
  await shot('1-world-rare'); if (process.env.STOP === '1') { await b.close(); process.exit(0); }
  // ---- 2. трекер/стрелка по охоте (class-level: mob_track)
  await S({ type: 'mob_track', id: R.type, on: true }); await sleep(1800);
  const tr = await G(() => { const q = document.querySelector('.mc-tracker .q'); return { text: q ? q.textContent.replace(/\s+/g, ' ') : '', arrow: document.querySelector('.mc-tracker .arrow span')?.textContent || '', ptr: [...document.querySelectorAll('.mc-tptr .tp b')].map((e) => e.textContent).join('|') }; });
  console.log('трекер:', JSON.stringify(tr).slice(0, 400));
  ok(/появится через \d+:\d\d/.test(tr.text + ' ' + tr.arrow + ' ' + tr.ptr), 'трекер/стрелка/метка у цели показывают отсчёт');
  await shot('2-tracker');
  await G(() => window.__game.debug.openMap?.()); await G(() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'm' }))); await sleep(1500);
  const mapTxt = await G(() => document.body.innerText.match(/Редкий Отголосок[^\n]*|[^\n]*появится через[^\n]*/g) || []); console.log('карта:', JSON.stringify(mapTxt).slice(0, 300));
  await shot('3-map'); await p.keyboard.press('Escape'); await sleep(400);
  // ---- 3. «вот-вот»
  await S({ type: 'dev_grant', rareIn: 14 }); await sleep(7500); // сервер шлёт состояние раз в 5 с
  // rareIn действует только на не появившийся; перезапуск таймера уже стоит
  L = await labels(); console.log('подписи (скоро):', JSON.stringify(L));
  ok(L.some((t) => /вот-вот появится/.test(t)), 'за N секунд: «вот-вот появится»'); await shot('4-soon');
  // ---- 4. жив — подписи нет
  await sleep(9000); st = await state(); const r2 = st.find((x) => x.type === R.type); console.log('после появления', JSON.stringify(r2));
  L = await labels(); ok(r2.alive && !L.some((t) => /появ/.test(t) && /Отголосок|Король/.test(t)), 'редкий жив: подписи с отсчётом нет'); await shot('5-alive');
  // ---- 5. убили → реальный таймер, вид встречен → имя
  await S({ type: 'dev_grant', killRare: R.type }); await sleep(7500);
  st = await state(); const r3 = st.find((x) => x.type === R.type); console.log('после убийства', JSON.stringify(r3));
  ok(!r3.alive && r3.left >= 590 && r3.left <= 1210, 'после убийства серверный таймер в окне [600,1200] с: ' + r3.left);
  await tp(r3.x + OX, r3.y + OY); await sleep(2500); L = await labels(); console.log('подписи после убийства:', JSON.stringify(L));
  ok(L.some((t) => /Король Росы.*появится через \d+:\d\d/.test(t)), 'вид встречен: «Король Росы появится через мм:сс»'); await shot('6-world-rare-named');
  // ---- 6. мировой босс: та же подпись
  let bosses = st.filter((x) => x.kind === 'boss' && !x.off && !x.alive);
  if (!bosses.length) { const A = st.find((x) => x.kind === 'boss' && !x.off && x.alive); if (A) { await S({ type: 'dev_grant', killBoss: A.k.slice(5) }); await sleep(7500); st = await state(); bosses = st.filter((x) => x.kind === 'boss' && !x.off && !x.alive); } }
  console.log('логов боссов:', bosses.length);
  if (bosses.length) { const B = bosses[0]; await tp(B.x + OX, B.y + OY); L = await labels(); console.log('подписи у логова:', JSON.stringify(L));
    ok(L.some((t) => /☠.*(появится через|вот-вот появится|появляется)/.test(t)), 'у логова мирового босса: подпись с отсчётом'); await shot('7-world-boss'); } else ok(false, 'нет мирового босса для проверки подписи');
  // ---- 7. Бестиарий: подсказка у скрытой карточки
  await G(() => window.__game.debug.openBook('bestiary')); await sleep(1500);
  await G(() => document.querySelector('button[data-act="btab"][data-v="elite"]')?.click()); await sleep(1200);
  const hint = await G(() => [...document.querySelectorAll('.mc-beast.unknown')].map((e) => e.textContent.replace(/\s+/g, ' ').trim()));
  console.log('подсказки Бестиария:', JSON.stringify(hint)); await shot('8-bestiary-elite');
  ok(hint.length === 4 && hint.some((t) => /Лунный кратер/.test(t) && /Редкий Отголосок.*мин/.test(t)) && !hint.some((t) => /Падшая|Звезда/.test(t)), 'Бестиарий: у скрытой Падшей Звезды есть подсказка (регион, редкий, возрождение)');
  ok(errs.length === 0, 'ошибок страницы нет ' + errs.join(' | ')); await b.close(); process.exit(fails ? 1 : 0);
})().catch((e) => { console.error('CRASH', e); process.exit(3); });
