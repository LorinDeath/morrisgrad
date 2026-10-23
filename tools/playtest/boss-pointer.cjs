// LOCAL ONLY (локальный wrangler dev + vite): охота на мирового босса — указатель и таймер появления.
// Проверяет: трекер (строка охоты), стрелку, метку у цели на экране, карту M; босс жив → таймера нет; убит → реальный таймер сервера.
// Запуск: NODE_PATH=/workspace/mc-ui-tools/node_modules BP_SHOT=before|after node tools/playtest/boss-pointer.cjs
const { chromium } = require('playwright-core');
const { guardLocal, assertLocalUrl } = require('./_local.cjs');
const BASE = process.env.GR_BASE || 'http://127.0.0.1:5395/game.html', WS = process.env.GR_WS || 'ws://127.0.0.1:8995';
const OUT = process.env.OUT || '/workspace/boss-fix', SHOT = process.env.BP_SHOT || '';
const fs = require('fs'); fs.mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
(async () => {
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox', '--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const ctx = await b.newContext({ viewport: { width: 1100, height: 720 } }); await guardLocal(ctx);
  const p = await ctx.newPage(); const G = (f, a) => p.evaluate(f, a);
  const uid = 'bp_' + Date.now().toString(36);
  await p.goto(assertLocalUrl(`${BASE}?name=${uid}&uid=${uid}&ws=${WS}&fs=1&debug=1`));
  await p.waitForFunction(() => window.__game?.state?.().mode === 'hub', null, { timeout: 120000 }); await sleep(800);
  await G(() => window.__game.debug.selectClass('warrior')); await sleep(1200);
  for (let i = 0; i < 8 && (await G(() => window.__game.state().world)) !== 'arinar'; i++) { await G(() => { window.__game.debug.rawSend({ type: 'dev_teleport', x: 240, y: 600 }); window.__game.debug.teleport(240, 600); }); await sleep(700); await G(() => window.__game.debug.rawSend({ type: 'use_portal', portalId: 'portal_arinar' })); await sleep(2500); }
  ok((await G(() => window.__game.state().world)) === 'arinar', 'в Аринаре'); await sleep(3000);
  const bs = async () => (await G(() => window.__game.debug.bossState())).map(([id, s]) => ({ id: id.slice(5), alive: s.alive, left: Math.round((s.at - Date.now()) / 1000), type: s.type, off: !!s.off }));
  let st = []; for (let i = 0; i < 20 && !st.length; i++) { st = await bs(); if (!st.length) await sleep(500); }
  ok(st.length > 0, 'сервер прислал состояние логов боссов: ' + st.length);
  const type = st[0].type; console.log('тип босса для охоты:', type, 'логов этого типа:', st.filter((x) => x.type === type).length);
  await G((t) => window.__game.debug.rawSend({ type: 'mob_track', id: t, on: true }), type); await sleep(1500);
  const tr = () => G(() => { const t = window.__game.debug.track(); const q = document.querySelector('.mc-tracker .q'); return { target: t.target, hunt: t.hunt && { where: t.hunt.where, label: t.hunt.target?.label, sp: t.hunt.target?.sp, hx: t.hunt.target?.x, hy: t.hunt.target?.y }, text: q ? q.textContent : '', arrow: document.querySelector('.mc-tracker .arrow span')?.textContent || '' }; });
  let t = await tr(); console.log('трекер:', JSON.stringify(t).slice(0, 500));
  const tx = t.hunt?.hx ?? t.target?.x, ty = t.hunt?.hy ?? t.target?.y;
  ok(tx != null, 'есть цель охоты: ' + tx + ',' + ty);
  ok(/Босс появится через \d+:\d\d|Босс появляется/.test(t.text), 'трекер: «Босс появится через мм:сс» (текст: ' + t.text.replace(/\s+/g, ' ').slice(0, 120) + ')');
  ok(/появится через|появляется/.test(t.arrow), 'стрелка трекера: таймер в подписи (' + t.arrow + ')');
  // у метки на экране
  await G(([x, y]) => { window.__game.debug.rawSend({ type: 'dev_teleport', x: x - 420, y: y + 80, god: true }); window.__game.debug.teleport(x - 420, y + 80); }, [tx, ty]); await sleep(2500);
  const ptr = await G(() => [...document.querySelectorAll('.mc-tptr .tp b')].map((e) => e.textContent).join('|'));
  ok(/⏳/.test(ptr), 'метка у цели на экране: таймер (' + ptr + ')');
  if (SHOT) await p.screenshot({ path: `${OUT}/${SHOT}-screen.png` });
  // карта M
  await p.keyboard.press('m'); await sleep(1200); if (SHOT) await p.screenshot({ path: `${OUT}/${SHOT}-map.png` }); await p.keyboard.press('Escape'); await sleep(400);
  // босс появился → «жив», без таймера
  await G(() => window.__game.debug.rawSend({ type: 'dev_grant', spawnBosses: true })); await sleep(7000);
  st = await bs(); const mine = st.filter((x) => x.type === type); console.log('после spawn:', JSON.stringify(mine));
  t = await tr(); console.log('трекер после spawn:', t.text.replace(/\s+/g, ' ').slice(0, 160));
  ok(mine.some((x) => x.alive) && !/появится через/.test(t.text), 'босс жив: таймера нет');
  if (SHOT) await p.screenshot({ path: `${OUT}/${SHOT}-alive.png` });
  // убили босса → реальный таймер сервера
  const key = mine.find((x) => x.alive)?.id; for (const m1 of mine) { await G((k) => window.__game.debug.rawSend({ type: 'dev_grant', killBoss: k }), m1.id); await sleep(600); } await sleep(7000);
  st = await bs(); const dead = st.filter((x) => x.type === type && !x.alive).sort((a, b) => a.left - b.left)[0]; console.log('после kill:', JSON.stringify(dead));
  t = await tr(); const m = t.text.match(/Босс появится через (\d+):(\d\d)/); console.log('трекер после kill:', t.text.replace(/\s+/g, ' ').slice(0, 160));
  ok(!!dead && !dead.alive && dead.left > 60, 'сервер: босс убит, возрождение через ' + (dead && dead.left) + ' с');
  if (m) ok(Math.abs(+m[1] * 60 + +m[2] - dead.left) <= 8, 'таймер в трекере совпадает с серверным (' + m[0] + ')'); else ok(false, 'таймер в трекере после убийства отсутствует');
  if (SHOT) await p.screenshot({ path: `${OUT}/${SHOT}-dead.png` });
  await b.close(); process.exit(fails ? 1 : 0);
})().catch((e) => { console.error('CRASH', e); process.exit(3); });
