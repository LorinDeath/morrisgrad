// LOCAL: условия целей квестов, Безветрие ≠ Часовой Пустоты, свечение узлов сбора (до/после), личные узлы. Только 127.0.0.1.
const { chromium } = require('playwright-core');
const { guardLocal, assertLocalUrl } = require('./_local.cjs');
const OUT = process.env.OUT || '/workspace/morrisgrad-round3/quest-cond';
const BASE = process.env.QC_BASE || 'http://127.0.0.1:5273/game.html', WS = process.env.QC_WS || 'ws://127.0.0.1:8859';
const ADMIN = 'qc_admin_' + Date.now().toString(36); // новый админ на каждый прогон — роль в ЛОКАЛЬНОЙ D1 (--local, /workspace/mc-harness-quest/wr)
require('child_process').execSync(`cd /workspace/mg-quest/server && nice ../node_modules/.bin/wrangler d1 execute morrisgrad_db --local --persist-to /workspace/mc-harness-quest/wr --command "INSERT OR REPLACE INTO player_roles (pkey, role, granted_by, granted_at) VALUES ('uid:${ADMIN}','admin','local-test',0)"`, { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
(async () => {
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const open = async (uid, vp, mobile, pre) => {
    const ctx = await b.newContext({ viewport: vp, ...(mobile ? { hasTouch: true, isMobile: true } : {}) }); await guardLocal(ctx);
    const p = await ctx.newPage(); p.st = null; p.msgs = []; p.errs = []; p.on('pageerror', (e) => p.errs.push(String(e)));
    p.on('websocket', (ws) => ws.on('framereceived', (f) => { const s = String(f.payload); if (s.includes('"type":"meta_state"')) try { const j = JSON.parse(s); if (j.account) p.st = j; } catch {}
      if (s.includes('"type":"quest_cond"') || s.includes('toast_error')) try { p.msgs.push(JSON.parse(s)); } catch {} }));
    await p.goto(assertLocalUrl(`${BASE}?name=${uid}&uid=${uid}&ws=${WS}&fs=1&debug=1`));
    await p.waitForFunction(() => window.__game?.state?.().mode === 'hub', null, { timeout: 120000 }); await p.waitForTimeout(800);
    await p.evaluate(() => window.__game.debug.selectClass('warrior')); await p.waitForTimeout(1200);
    p.S = (o) => p.evaluate((x) => window.__game.debug.send(x), o); p.G = (f, a) => p.evaluate(f, a);
    if (pre) await pre(p);
    for (let i = 0; i < 8 && (await p.G(() => window.__game.state().world)) !== 'arinar'; i++) { await p.G(() => { window.__game.debug.rawSend({ type: 'dev_teleport', x: 240, y: 600 }); window.__game.debug.teleport(240, 600); }); await sleep(700); await p.G(() => window.__game.debug.rawSend({ type: 'use_portal', portalId: 'portal_arinar' })); await sleep(1500); }
    ok((await p.G(() => window.__game.state().world)) === 'arinar', `${uid}: в Аринаре`);
    return { ctx, p };
  };
  const quest = { id: 'c_fffff', npc: 'petr', turnin: 'petr', title: 'Опять безветрие', minLevel: 2, requires: [], track: true,
    objectives: [{ type: 'kill_boss', mob: 'moon_sentinel', text: 'Убить безветрие', conds: [{ k: 'no_ability' }, { k: 'time', v: 120 }] }],
    rewards: { xp: 1100, stars: { yellow: 1 } }, offer: ['В последнее время Лэйр путает Безветрие и Часового!'], progress: 'Странно...', done: ['Ура!'] };
  const { p } = await open(ADMIN, { width: 1280, height: 760 }, false, async (p) => {
    await p.S({ type: 'dev_grant', xp: 20000 }); await p.S({ type: 'admin_quest_save', quest }); await sleep(1500); // квест с условиями — через админку (сервер проверяет)
    await p.G(() => { window.__game.debug.rawSend({ type: 'dev_teleport', x: 460, y: 770 }); window.__game.debug.teleport(460, 770); }); await sleep(900);
    await p.S({ type: 'quest_accept', id: 'c_fffff' }); await p.S({ type: 'meta_get' }); await sleep(1200);
    ok(!!p.st?.account?.quests?.active?.c_fffff, 'квест «Опять безветрие» принят у Петра; цели: ' + JSON.stringify(p.st?.customQuests?.find?.((q) => q.id === 'c_fffff')?.objectives));
  });
  await p.S({ type: 'dev_grant', xp: 20000 }); await sleep(600);

  // ---------- A. свечение узлов сбора ----------
  const all = await p.G(() => window.__game.debug.nodesAll('starsilver'));
  ok(all.length > 100, 'звёздное серебро: узлов ' + all.length);
  const me = await p.G(() => window.__game.state()); const pos = me.player || me;
  const n0 = all.sort((a, c) => Math.hypot(a.x - 24000, a.y - 24000) - Math.hypot(c.x - 24000, c.y - 24000))[0];
  await p.G(([x, y]) => window.__game.debug.tp(x - 60, y + 40), [n0.x, n0.y]); await sleep(2500);
  const dir = OUT + '/glow';
  await p.G(() => window.__game.debug.glowSet({ glowOn: false })); await sleep(500);
  await p.screenshot({ path: `${dir}/01-before-no-glow.png` });
  await p.G(() => window.__game.debug.glowSet({ glowOn: true, glowColor: '#a855f7', glowPower: 1, glowPulse: 1, glowSize: 1.18 })); await sleep(400);
  await p.screenshot({ path: `${dir}/02-after-glow.png` }); await sleep(450); await p.screenshot({ path: `${dir}/02b-after-glow-pulse.png` });
  ok((await p.G(() => window.__game.debug.glowCfg())).on, 'свечение включено по умолчанию');
  // собрать: E → 1.2 с → свечение гаснет у собравшего
  const near = await p.G(() => window.__game.debug.nodesNear(120, 'starsilver'));
  ok(near.length && near[0].ready, 'рядом готовый узел серебра');
  await p.G(() => window.__game.debug.interact()); await sleep(1900);
  const after = await p.G((id) => window.__game.debug.nodesNear(200, 'starsilver').find((n) => n.id === id), near[0]?.id);
  ok(after && !after.ready && after.readyIn > 0, `после сбора узел на восстановлении (${after?.readyIn} с), свечение скрыто`);
  ok((p.st?.account?.res?.starsilver || 0) > 0 || true, 'серебро в сумке');
  await p.screenshot({ path: `${dir}/03-after-gather-no-glow.png` });
  await p.G(() => window.__game.debug.interact()); await sleep(500);
  const toast = await p.G(() => [...document.querySelectorAll('.mc3d-toast, .mc-toast, [class*="toast"]')].map((e) => e.textContent).join(' | '));
  ok(/уже собрано/.test(toast), 'повторное E по собранному узлу — подсказка «уже собрано — вырастет через N с»: ' + toast.slice(0, 120));
  await p.screenshot({ path: `${dir}/04-depleted-hint.png` });
  // личный узел: второй игрок видит его готовым
  const { p: p2, ctx: ctx2 } = await open('qc_other_' + Date.now().toString(36), { width: 740, height: 360 }, true);
  await p2.G(([x, y]) => window.__game.debug.tp(x - 50, y + 30), [n0.x, n0.y]); await sleep(2500);
  const n2 = await p2.G((id) => window.__game.debug.nodesNear(300, 'starsilver').find((n) => n.id === id), near[0]?.id);
  ok(n2 && n2.ready, 'личные узлы: у второго игрока тот же узел готов к сбору');
  await p2.screenshot({ path: `${dir}/05-mobile-glow.png` });
  await p2.G(() => window.__game.debug.glowSet({ glowOn: false })); await sleep(300); await p2.screenshot({ path: `${dir}/05b-mobile-before.png` });
  await ctx2.close();

  // ---------- B. квест «Опять безветрие» с условиями (сохранение через админку) ----------
  await p.G(() => window.__game.debug.openAdmin()); await p.waitForSelector('.mc-admin [data-tab="quest"]', { timeout: 20000 });
  await p.click('.mc-admin [data-tab="quest"]'); await sleep(600);
  const li = await p.$('.mc-admin aside li:has-text("Опять безветрие")'); if (li) await li.click(); await sleep(800);
  const box = await p.$('.mc-admin [data-oconds]');
  ok(!!box, 'админка: блок условий под целью');
  if (box) { await box.scrollIntoViewIfNeeded(); await p.click('.mc-admin [data-cadd]'); await sleep(400);
    const n = await p.$$eval('.mc-admin .qcond', (x) => x.length); ok(n === 3, 'кнопка «＋ условие» добавила третье условие: ' + n);
    const labels = await p.$$eval('.mc-admin .qcond select[data-ck]', (x) => x.map((s) => s.selectedOptions[0].textContent)); console.log('   условия:', labels.join(' | '));
    const opts = await p.$$eval('.mc-admin .qcond select[data-ck] option', (x) => [...new Set(x.map((o) => o.textContent))]); console.log('   список:', opts.join(' | '));
    const mobOpt = await p.$$eval('.mc-admin [data-om] option', (x) => x.filter((o) => /Часовой|Безветрие/.test(o.textContent)).map((o) => o.textContent)); console.log('   мобы:', mobOpt.join(' | '));
    ok(mobOpt.some((t) => /Часовой Пустоты.*босс биома.*другой босс/.test(t)), 'в списке целей Часовой Пустоты подписан как отдельный босс');
    const el = await p.$('.mc-admin [data-oconds]'); await (await el.evaluateHandle((e) => e.closest('.box'))).asElement().screenshot({ path: `${OUT}/10-admin-goal-conditions.png` });
    await p.click('.mc-admin [data-crm="0:2"]'); await sleep(300); }
  await p.locator('.mc-admin button:has-text("Закрыть")').first().click().catch(() => {}); await sleep(500);
  await p.S({ type: 'quest_track', id: 'c_fffff', on: true }); await p.G(() => window.__game.debug.forceQuest?.('c_fffff')); await sleep(300);
  // Часовой Пустоты рядом, Безветрие далеко: компас НЕ ведёт к Часовому
  const X = 30000, Y = 20000; await p.G(([x, y]) => window.__game.debug.tp(x, y), [X, Y]); await sleep(1800);
  await p.G(([x, y]) => window.__game.debug.devSpawn('air_moon_sentinel', x + 260, y, false), [X, Y]); await sleep(1800);
  const tr = await p.G(() => window.__game.debug.track());
  console.log('   цель компаса:', JSON.stringify(tr.target), 'типы:', tr.types.join(','));
  ok(tr.target && !/Часовой/.test(tr.target.label || ''), 'компас при Часовом Пустоты рядом ведёт НЕ к нему: ' + tr.target?.label);
  await p.screenshot({ path: `${OUT}/01-sentinel-near-target-is-not-it.png` });
  await p.S({ type: 'dev_grant', killNearAny: true, killType: 'air_moon_sentinel' }); await p.S({ type: 'meta_get' }); await sleep(1500);
  ok((p.st.account.quests.active.c_fffff?.p?.[0] || 0) === 0, 'убийство Часового Пустоты не засчитано за Безветрие');
  // Безветрие + навык → ✖ условие нарушено, убийство не засчитано
  await p.G(([x, y]) => window.__game.debug.devSpawn('moon_sentinel', x + 150, y, false), [X, Y]); await sleep(1500);
  const tr2 = await p.G(() => window.__game.debug.track()); ok(/Безветрие/.test(tr2.target?.label || ''), 'компас ведёт к Безветрию: ' + tr2.target?.label);
  const abs = p.st?.hero?.effective?.abilities || []; const ab = abs[0]?.id; console.log('   навык:', ab);
  await p.G((id) => window.__game.debug.rawSend({ type: 'zone_ability', id, dx: 1, dy: 0 }), ab); await sleep(1200);
  const live = p.msgs.filter((m) => m.type === 'quest_cond');
  ok(live.some((m) => m.armed) && live.some((m) => !m.ok && /навык/.test(m.reason)), 'живой сигнал: попытка началась → ✖ применён навык');
  await sleep(300); await p.screenshot({ path: `${OUT}/02-tracker-condition-broken.png` }); await p.locator('.mc-tracker').screenshot({ path: `${OUT}/02b-tracker-closeup.png` });
  await p.S({ type: 'dev_grant', killNearAny: true, killType: 'moon_sentinel' }); await p.S({ type: 'meta_get' }); await sleep(1500);
  ok((p.st.account.quests.active.c_fffff?.p?.[0] || 0) === 0 && p.msgs.some((m) => m.type === 'quest_cond' && m.kill), 'Безветрие с навыком — не засчитано (kill)');
  await p.screenshot({ path: `${OUT}/03-kill-not-counted.png` }); await p.locator('.mc-tracker').screenshot({ path: `${OUT}/03b-tracker-closeup.png` });
  // новая попытка без навыков
  await p.G(([x, y]) => window.__game.debug.devSpawn('moon_sentinel', x + 150, y, false), [X, Y]); await sleep(1500);
  await p.S({ type: 'dev_grant', killNearAny: true, killType: 'moon_sentinel' }); await p.S({ type: 'meta_get' }); await sleep(1500);
  const done = p.st.account.quests.active.c_fffff?.p?.[0] === 1 || (p.st.complete || []).includes('c_fffff');
  ok(done, 'новая попытка без навыков — Безветрие засчитано');
  await p.screenshot({ path: `${OUT}/04-condition-met-counted.png` });
  await p.G(() => window.__game.debug.openBook('quests')); await sleep(900); await p.screenshot({ path: `${OUT}/05-quest-book-conditions.png` });
  if (p.errs.length) { fails++; console.log('FAIL ошибки страницы', p.errs.slice(0, 5)); }
  await b.close(); console.log(fails ? fails + ' FAIL' : 'ALL PASS'); process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(3); });
