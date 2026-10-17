// LOCAL: старые бои Поляны выключены (LEGACY_HUB_FIGHTS=false): у цветка-вампира, Кейт и Дар нет duel_start isBossFight,
// нет тоста «Вас втянули в бой», duel_invite на Дар/цветок игнорируется; PvP-дуэль (duel_challenge → pvp_start) работает.
// Только localhost (guardLocal). HL_BASE=http://127.0.0.1:5283/game.html HL_WS=ws://127.0.0.1:8839 node tools/playtest/hub-legacy-off.cjs
// HL_EXPECT_ON=1 — контроль: при LEGACY_HUB_FIGHTS=true бой ДОЛЖЕН начаться (проверка, что тест вообще ловит старые бои).
const { chromium } = require('playwright-core');
const { guardLocal, assertLocalUrl } = require('./_local.cjs');
const OUT = process.env.OUT || '/workspace/morrisgrad-round3/hub-legacy-off';
const BASE = process.env.HL_BASE || 'http://127.0.0.1:5283/game.html', WS = process.env.HL_WS || 'ws://127.0.0.1:8839', ON = !!process.env.HL_EXPECT_ON;
require('fs').mkdirSync(OUT, { recursive: true });
let pass = 0, fail = 0; const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? 'PASS ' : 'FAIL ') + m); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const ctx = await b.newContext({ viewport: { width: 1280, height: 760 } }); await guardLocal(ctx);
  await ctx.addInitScript(() => { window.__toasts = []; new MutationObserver((ms) => { for (const m of ms) for (const n of m.addedNodes) { const t = n.textContent || ''; if (t) window.__toasts.push(t.slice(0, 120)); } }).observe(document, { childList: true, subtree: true }); });
  const open = async (name, uid) => {
    const p = await ctx.newPage(); p.rx = []; p.errs = []; p.ps = null;
    p.on('pageerror', (e) => p.errs.push(String(e).slice(0, 200)));
    p.on('websocket', (ws) => { if (!ws.url().startsWith(WS)) return; ws.on('framereceived', (f) => { const s = String(f.payload); if (s.startsWith('{"type":"players_state"')) { try { const j = JSON.parse(s); if (j.world === 'hellfire') p.ps = j; } catch (_) {} return; }
      const m = /^\{"type":"([a-z_]+)"/.exec(s); if (m && /duel|pvp|dar_surprise|combat_death/.test(m[1])) p.rx.push([m[1], s.slice(0, 200)]); }); });
    await p.goto(assertLocalUrl(`${BASE}?name=${encodeURIComponent(name)}&uid=${uid}&ws=${WS}&fs=1&debug=1`));
    await p.waitForFunction(() => window.__game?.state?.().mode === 'hub', null, { timeout: 120000 });
    for (let i = 0; i < 4 && !(await p.evaluate(() => !!window.__game.meta?.hero)); i++) { await p.evaluate(() => window.__game.debug.selectClass('warrior')); await sleep(1300); }
    await sleep(2500); return p;
  };
  const tp = (p, x, y) => p.evaluate(([a, c]) => { window.__game.debug.rawSend({ type: 'dev_teleport', x: a, y: c }); window.__game.debug.teleport(a, c); }, [x, y]);
  const legacy = (p) => p.rx.filter(([ty, s]) => ty === 'duel_start' || ty === 'duel_update' || ty === 'dar_surprise_hit');
  const A = await open('Путник', 'hublegacy_a_' + Date.now().toString(36));
  ok(await A.evaluate(() => window.__game.state().world) === 'hellfire', 'на Поляне (hellfire)');
  // 1) цветок-вампир (активный) прямо рядом
  const P = await A.evaluate(() => window.__game.debug.pos());
  await A.evaluate(([x, y]) => window.__game.debug.plantFlower(x, y, 'active'), [Math.round(P.x) + 30, Math.round(P.y)]); await sleep(600);
  await A.keyboard.down('KeyD'); await sleep(1500); await A.keyboard.up('KeyD'); await A.keyboard.down('KeyA'); await sleep(1500); await A.keyboard.up('KeyA'); await sleep(4000);
  await A.screenshot({ path: `${OUT}/01-flower.png` });
  const fl = (A.ps?.flowers || []).filter((f) => f.stage === 'active');
  ok(fl.length >= 1, `активный цветок есть: ${fl.length} (${fl.map((f) => `${Math.round(f.x)},${Math.round(f.y)}`).join(' ')})`);
  const afterFlower = legacy(A).length;
  // 2) Кейт и Дар — стоим вплотную и ходим вокруг
  const boss = A.ps?.boss, dar = A.ps?.dar;
  ok(!!boss && !!dar, `Кейт ${boss && `${Math.round(boss.x)},${Math.round(boss.y)}`}, Дар ${dar && `${Math.round(dar.x)},${Math.round(dar.y)}`}`);
  for (const [nm, o] of [['Кейт', boss], ['Дар', dar]]) {
    if (!o) continue;
    await tp(A, Math.round(o.x) + 20, Math.round(o.y)); await sleep(700);
    for (let k = 0; k < 4; k++) { const now = (nm === 'Кейт' ? A.ps?.boss : A.ps?.dar) || o; await tp(A, Math.round(now.x) + 15, Math.round(now.y) + 5); await sleep(1500); }
    await A.screenshot({ path: `${OUT}/02-${nm === 'Кейт' ? 'keyt' : 'dar'}.png` });
  }
  const bossMoved = A.ps?.boss && boss && Math.hypot(A.ps.boss.x - boss.x, A.ps.boss.y - boss.y) > 1; console.log('NOTE Кейт сдвинулась (ИИ бродит):', bossMoved, JSON.stringify(A.ps?.boss && { x: A.ps.boss.x, y: A.ps.boss.y, state: A.ps.boss.state }));
  // 3) старый вызов duel_invite на Дар (20% «уговорил») и на цветок
  for (let i = 0; i < 8; i++) { await A.evaluate(() => window.__game.debug.rawSend({ type: 'duel_invite', targetId: 'boss_dar' })); await sleep(250); }
  if (fl[0]) { await A.evaluate((id) => window.__game.debug.rawSend({ type: 'duel_invite', targetId: id }), fl[0].id); }
  await sleep(1500);
  const leg = legacy(A), toasts = await A.evaluate(() => window.__toasts.filter((t) => /втянули/.test(t)));
  if (ON) ok(leg.length > 0, `КОНТРОЛЬ (LEGACY_HUB_FIGHTS=true): старый бой начался — ${leg.length} сообщений (${leg[0]?.[0]}), тост: ${toasts.length}`);
  else {
    ok(afterFlower === 0, `у цветка-вампира: duel_start/duel_update = ${afterFlower}`);
    ok(leg.length === 0, `Кейт, Дар, duel_invite: старых боёв нет (${leg.length}) ${leg.map((x) => x[1]).join(' | ').slice(0, 200)}`);
    ok(toasts.length === 0, `тоста «Вас втянули в бой» нет (${toasts.length})`);
  }
  // 4) обычная PvP-дуэль
  const B = await open('Соперник', 'hublegacy_b_' + Date.now().toString(36));
  const P2 = await A.evaluate(() => window.__game.debug.pos()); await tp(B, Math.round(P2.x) + 40, Math.round(P2.y)); await sleep(1200);
  const sidB = await B.evaluate(() => window.__game.state().myId), sidA = await A.evaluate(() => window.__game.state().myId);
  A.rx.length = 0; B.rx.length = 0;
  await A.evaluate((s) => window.__game.debug.rawSend({ type: 'duel_challenge', sid: s }), sidB); await sleep(1200);
  const inv = B.rx.find(([ty]) => /duel_invite|duel_challenge|pvp_invite/.test(ty)); console.log('NOTE B получил:', JSON.stringify(B.rx.map((x) => x[0])));
  await B.evaluate((s) => window.__game.debug.rawSend({ type: 'duel_respond', from: s, accept: true }), sidA);
  let st = null; for (let i = 0; i < 30 && !st; i++) { await sleep(200); st = A.rx.find(([ty]) => ty === 'pvp_start'); }
  ok(!!inv && !!st, `PvP-дуэль: вызов дошёл (${inv?.[0]}), принят → pvp_start (${!!st})`);
  await sleep(4500); await A.screenshot({ path: `${OUT}/03-pvp-arena.png` });
  ok(await A.evaluate(() => window.__game.state().world) === 'arena', `PvP: на арене (${await A.evaluate(() => window.__game.state().world)})`);
  await A.evaluate(() => window.__game.debug.rawSend({ type: 'duel_leave' })); await sleep(1500);
  const errs = [...A.errs, ...B.errs]; ok(!errs.length, `ошибок страницы нет ${errs.join(' | ')}`);
  console.log(`${pass} passed, ${fail} failed`); await b.close(); process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
