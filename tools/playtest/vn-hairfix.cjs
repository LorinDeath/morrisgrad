// LOCAL: аватары VN после чистки белого фона у волос — все 8 персонажей × 10 эмоций грузятся, окна диалога на тёмном и светлом фоне.
// Только 127.0.0.1 (guardLocal). VH_BASE=http://127.0.0.1:5297/game.html VH_WS=ws://127.0.0.1:8897 VH_WR=/workspace/mc-harness-vnhair/wr node tools/playtest/vn-hairfix.cjs
const { chromium } = require('playwright-core');
const { guardLocal, assertLocalUrl } = require('./_local.cjs');
const fs = require('fs'), cp = require('child_process');
const OUT = process.env.OUT || '/workspace/morrisgrad-round3/vn-hairfix';
const BASE = process.env.VH_BASE || 'http://127.0.0.1:5297/game.html', WS = process.env.VH_WS || 'ws://127.0.0.1:8897', WR = process.env.VH_WR || '/workspace/mc-harness-vnhair/wr';
const ADMIN = 'vh_admin_' + Date.now().toString(36), QID = 'c_vh_' + (Date.now() % 1e7);
const d1 = (sql) => cp.execSync(`cd ${__dirname}/../../server && nice ../node_modules/.bin/wrangler d1 execute morrisgrad_db --local --persist-to ${WR} --command "${sql}"`, { stdio: 'ignore', env: { ...process.env, CI: '1' } });
d1(`INSERT OR REPLACE INTO player_roles (pkey, role, granted_by, granted_at) VALUES ('uid:${ADMIN}','admin','local-test',0)`);
d1(`DELETE FROM custom_quests WHERE id LIKE 'c_vh_%'`);
fs.mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
const CH = ['warrior', 'spearman', 'rogue', 'mage', 'petr', 'kyut', 'alzi', 'leyr'];
const EM = ['calm', 'joy', 'shock', 'anger', 'sad', 'fear', 'shy', 'smirk', 'think', 'determined'];
// окна: каждый персонаж дважды, разные эмоции (включая три кадра с правкой рамки: warrior/fear, spearman/anger, rogue/determined)
const W = [['warrior', 'fear'], ['spearman', 'anger'], ['rogue', 'determined'], ['mage', 'calm'], ['petr', 'smirk'], ['kyut', 'joy'], ['alzi', 'think'], ['leyr', 'shy'],
  ['warrior', 'joy'], ['spearman', 'calm'], ['rogue', 'smirk'], ['mage', 'shock'], ['petr', 'think'], ['kyut', 'sad'], ['alzi', 'joy'], ['leyr', 'calm']];
(async () => {
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const ctx = await b.newContext({ viewport: { width: 1440, height: 860 } }); const blocked = await guardLocal(ctx);
  const p = await ctx.newPage(); const errs = [], cons = []; p.on('pageerror', (e) => errs.push(String(e).slice(0, 200))); p.on('console', (m) => { if (m.type() === 'error') cons.push(m.text().slice(0, 200)); });
  const bad = []; p.on('response', (r) => { if (r.url().includes('/mc-vn/') && r.status() >= 400) bad.push(r.status() + ' ' + r.url()); });
  const msgs = []; p.on('websocket', (ws) => ws.on('framereceived', (f) => { const s = String(f.payload); if (s.includes('admin_result') || s.includes('toast_error')) msgs.push(s.slice(0, 300)); }));
  await p.goto(assertLocalUrl(`${BASE}?name=${ADMIN}&uid=${ADMIN}&ws=${WS}&fs=1&debug=1`));
  await p.waitForFunction(() => window.__game?.state?.().mode === 'hub', null, { timeout: 120000 }); await sleep(2000);
  const G = (fn, a) => p.evaluate(fn, a), S = (o) => G((x) => window.__game.debug.rawSend(x), o);
  await G(() => window.__game.debug.selectClass('mage')); await sleep(1500);
  // 1. все 80 эмоций + превью + иконки декодируются в браузере
  const res = await G(async ([CH, EM]) => { const out = []; const load = (u) => new Promise((r) => { const i = new Image(); i.onload = () => r([u, i.naturalWidth + 'x' + i.naturalHeight]); i.onerror = () => r([u, 'ERR']); i.src = u; });
    for (const c of CH) { for (const e of EM) { out.push(await load(`/mc-vn/${c}/${e}.webp`)); out.push(await load(`/mc-vn/${c}/${e}_t.webp`)); } out.push(await load(`/mc-vn/${c}/icon.webp`)); } return out; }, [CH, EM]);
  const errImg = res.filter((r) => r[1] === 'ERR'), wrong = res.filter((r) => r[1] !== 'ERR' && !(/_t\.webp$/.test(r[0]) ? r[1] === '96x128' : /icon/.test(r[0]) ? r[1] === '128x128' : r[1] === '576x768'));
  ok(res.length === 168 && !errImg.length, `168 картинок VN (8×10 эмоций, 8×10 превью, 8 иконок) грузятся${errImg.length ? ' ERR: ' + errImg.map((r) => r[0]).join(',') : ''}`);
  ok(!wrong.length, 'размеры 576×768 / 96×128 / 128×128' + (wrong.length ? ' не так: ' + JSON.stringify(wrong.slice(0, 5)) : ''));
  // 2. квест Петра с окнами всех персонажей
  await S({ type: 'admin_quest_save', quest: { id: QID, npc: 'petr', title: 'Проверка аватаров', objectives: [{ type: 'talk', npc: 'petr', text: 'Поговорите с Петром' }], minLevel: 1, requires: [], track: true, rewards: { xp: 1 }, offer: ['x'], progress: '…', done: ['x'] } }); await sleep(1200);
  await S({ type: 'admin_dialogue_save', questId: QID, dialogue: { offer: W.map(([who, emo], i) => ({ who, emo, text: `${i + 1}. ${who} · ${emo} — проверка волос на фоне.` })), done: [{ who: 'petr', emo: 'joy', text: 'Готово.' }] } }); await sleep(1500);
  ok(msgs.some((t) => t.includes(QID)) && !msgs.some((t) => t.includes('"ok":false')), 'квест и диалог сохранены: ' + msgs.slice(-1)[0]?.slice(0, 120));
  for (let k = 0; k < 6 && !(await p.$('.mc-vn')); k++) { // подойти к Петру (он бродит) и заговорить
    const n = await G(() => window.__game.debug.npcPos('petr')); await G(([x, y]) => window.__game.debug.tp(x, y + 36, true), [n.x, n.y]); await sleep(700);
    if ((await G(() => window.__game.debug.nearestNpc())) === 'petr') { await G(() => window.__game.debug.interact()); await sleep(1500); } }
  await p.waitForSelector('.mc-vn', { timeout: 8000 });
  for (let i = 0; i < W.length; i++) {
    await p.waitForFunction((i) => +document.querySelector('.mc-vn')?.dataset.vnI === i, i, { timeout: 5000 }).catch(() => {});
    await p.waitForFunction(() => { const im = document.querySelector('.mc-vn .vn-av'); return im && im.complete && im.naturalWidth > 0; }, null, { timeout: 8000 }).catch(() => {});
    const s = await G(() => { const v = document.querySelector('.mc-vn'), im = v.querySelector('.vn-av'); return { i: +v.dataset.vnI, who: v.dataset.who, emo: v.dataset.emo, img: im?.getAttribute('src'), loaded: !!im && im.complete && im.naturalWidth > 0 }; });
    ok(s.i === i && s.who === W[i][0] && s.emo === W[i][1] && s.img === `/mc-vn/${W[i][0]}/${W[i][1]}.webp` && s.loaded, `окно ${i + 1}: ${s.who}/${s.emo} ${s.img} загружен=${s.loaded}`);
    if (i < 8) {
      await sleep(400); await p.screenshot({ path: `${OUT}/${String(i + 1).padStart(2, '0')}-${W[i][0]}-${W[i][1]}-dark.png` });
      await G(() => { const st = document.createElement('style'); st.id = 'vh-light'; st.textContent = '#game-canvas{opacity:0!important}html,body,#game-window,#game-screen{background:linear-gradient(135deg,#fbf7ec,#e9eef7)!important}'; document.head.appendChild(st); });
      await sleep(250); await p.screenshot({ path: `${OUT}/${String(i + 1).padStart(2, '0')}-${W[i][0]}-${W[i][1]}-light.png` });
      await G(() => document.getElementById('vh-light')?.remove());
    }
    if (i < W.length - 1) { await p.click('#vn-next'); await sleep(350); }
  }
  ok(!bad.length, 'нет 4xx/5xx по /mc-vn/' + (bad.length ? ': ' + bad.join(', ') : ''));
  ok(!errs.length, 'нет ошибок страницы' + (errs.length ? ': ' + errs.join(' | ') : ''));
  ok(!blocked.length, 'нелокальных запросов нет' + (blocked.length ? ': ' + blocked.slice(0, 3).join(', ') : ''));
  if (cons.length) console.log('console errors (info):', cons.slice(0, 5).join(' | '));
  d1(`DELETE FROM custom_quests WHERE id='${QID}'`);
  await b.close(); console.log(fails ? `FAIL ${fails}` : 'ALL PASS'); process.exit(fails ? 1 : 0);
})().catch((e) => { console.log('FAIL exception', e.message); process.exit(1); });
