// LOCAL ONLY (локальный wrangler dev + vite): победа над отражением Кьют в «Испытании отражений» засчитывается заданиям доски.
// Быстрая победа (<10 с), обычная, с капом здоровья; повторные/связанные задания. Запуск:
//   NODE_PATH=/workspace/mc-ui-tools/node_modules node tools/playtest/cute-arena.cjs
const { chromium } = require('playwright-core');
const { guardLocal, assertLocalUrl } = require('./_local.cjs');
const BASE = process.env.GR_BASE || 'http://127.0.0.1:5395/game.html', WS = process.env.GR_WS || 'ws://127.0.0.1:8995';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
(async () => {
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox', '--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const ctx = await b.newContext({ viewport: { width: 1280, height: 760 } }); await guardLocal(ctx);
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(String(e).slice(0, 300)));
  const G = (f, a) => p.evaluate(f, a), S = (o) => G((x) => window.__game.debug.rawSend(x), o);
  const uid = 'cute_' + Date.now().toString(36);
  let board = null, rewards = [];
  p.on('websocket', (ws) => ws.on('framereceived', (f) => { const s = String(f.payload); try { if (s.includes('"board"') || s.includes('"reward"')) { const j = JSON.parse(s); if (j.board) board = j.board; if (j.type === 'meta_state' && j.board) board = j.board; if (j.reward) rewards.push(j.reward); } } catch {} }));
  await p.goto(assertLocalUrl(`${BASE}?name=${uid}&uid=${uid}&ws=${WS}&fs=1&debug=1`));
  await p.waitForFunction(() => window.__game?.state?.().mode === 'hub', null, { timeout: 120000 }); await sleep(800);
  await G(() => window.__game.debug.selectClass('warrior')); await sleep(1500);
  await G(() => window.__game.board?.tut?.('skip')); await sleep(300);
  await S({ type: 'dev_grant', xp: 3000000 }); await sleep(800);
  const prog = () => G(() => { const b = window.__game.meta?.state?.board || {}; const o = {}; for (const [k, v] of Object.entries(b.p || {})) if (/duel/.test(k)) o[k] = v; return o; });
  const duelRoll = () => G(() => Object.keys(window.__game.meta.state?.board?.roll || {}).filter((k) => /duel/.test(k)));
  console.log('в наборе дня/недели:', JSON.stringify(await duelRoll()), 'начальный прогресс:', JSON.stringify(await prog()));
  const toHub = async () => { for (let i = 0; i < 10 && (await G(() => window.__game.state().mode)) === 'run'; i++) { await S({ type: 'run_leave' }); await sleep(1500); } await sleep(1500); };
  const fight = async (name, waitSec, cap) => {
    rewards.length = 0;
    if (cap) await G((c) => { window.__game.debug.setCap?.(c); }, cap);
    await G(() => window.__game.startRun('duel')); 
    await p.waitForFunction(() => window.__game?.state?.().mode === 'run', null, { timeout: 30000 });
    await p.waitForFunction(() => [...(window.__game.run?.enemies?.values?.() || [])].some((e) => e.type === 'kyut_mirror'), null, { timeout: 30000 });
    await sleep(waitSec * 1000);
    const t = await G(() => { const r = window.__game.run; const e = [...r.enemies.values()].find((x) => x.type === 'kyut_mirror'); r.killEnemy(e, r.myId); return r.t; });
    await p.waitForFunction(() => window.__game.run?.endInfo?.won === true, null, { timeout: 15000 });
    const info = await G(() => ({ ...window.__game.run.endInfo, players: undefined }));
    await sleep(2500);
    console.log(name, 'бой до', t.toFixed(1), 'с; итог:', JSON.stringify(info), 'награда:', JSON.stringify(rewards.map((r) => ({ xp: r.xp, time: r.time }))));
    await toHub();
    return { t, info, rewardXp: rewards[0]?.xp };
  };
  const a = await fight('A быстрая победа', 3.5);
  await sleep(4000); const p1 = await prog(); console.log('прогресс после A:', JSON.stringify(p1));
  ok(a.t < 10 && a.t >= 3, 'A: бой короче 10 с, но не короче порога');
  ok((p1.ach_duel_win | 0) === 1 && (p1.ach_duels | 0) === 1, 'A: быстрая победа над отражением Кьют засчитана («Дуэлянт», «Завсегдатай арены»)');
  const c = await fight('B обычная победа', 16);
  const p2 = await prog(); console.log('прогресс после B:', JSON.stringify(p2));
  ok(c.t >= 10 && c.rewardXp > 0, 'B: бой не короче 10 с, опыт победы выдан');
  ok((p2.ach_duel_win | 0) === 2 && (p2.ach_duels | 0) === 2, 'B: победы суммируются, ничего не сломано');
  await b.close(); process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
