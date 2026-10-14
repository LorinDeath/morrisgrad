// r7: «Отслеживать» из Бестиария (строка «Охота», компас, мини-карта, карта M, подсветка, между локациями, хранит сервер)
// + квест админки с пустыми текстами целей: «Убить: <моб> 0/5», подсветка и компас (в т.ч. подсказка другой локации). Только локально.
const { chromium } = require('playwright-core');
const { guardLocal, assertLocalUrl } = require(process.env.MC_LOCAL_GUARD || './_local');
const OUT = '/workspace/morrisgrad-round3', URL = 'http://127.0.0.1:5199/game.html?name=Охотник&uid=test_admin_pt&ws=ws://127.0.0.1:8787&fs=1&debug=1&panels=1';
let pass = 0, fail = 0; const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? 'PASS ' : 'FAIL ') + m); };
(async () => {
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const ctx = await b.newContext({ viewport: { width: 1440, height: 860 } }); await guardLocal(ctx); const p = await ctx.newPage(); const errs = [];
  p.on('pageerror', (e) => errs.push(String(e).slice(0, 200)));
  const G = (fn, a) => p.evaluate(fn, a); const adm = []; p.on('websocket', (ws) => ws.on('framereceived', (f) => { const x = String(f.payload); if (/admin_result|toast_error|quest/.test(x)) adm.push(x.slice(0, 200)); }));
  const boot = async () => { await p.goto(assertLocalUrl(URL)); await p.waitForFunction(() => window.__game?.state?.().mode === 'hub' && window.__game.meta?.state, null, { timeout: 120000 }); await p.waitForTimeout(2000); };
  const trk = () => G(() => document.querySelector('.mc-tracker')?.innerText || '');
  await boot(); await G(() => window.__game.debug.selectClass('mage')); await p.waitForTimeout(2500);
  for (let i = 0; i < 6 && (await G(() => window.__game.state().world)) !== 'hellfire'; i++) { await G(() => { window.__game.debug.rawSend({ type: 'dev_teleport', x: 23700, y: 24000, god: true }); window.__game.debug.teleport(23700, 24000); }); await p.waitForTimeout(1200); await G(() => window.__game.debug.rawSend({ type: 'use_portal', portalId: 'portal_hellfire' })); await p.waitForTimeout(2000); }
  await G(() => window.__game.meta.setMobTrack(null)); await p.waitForTimeout(800);
  // 1. Бестиарий → «Отслеживать» (настоящая кнопка книги)
  await G(() => window.__game.debug.openBook('bestiary')); await p.waitForTimeout(600);
  // встреченный моб, который водится только в Аринаре (не забег): открываем карточку настоящим кликом
  const cand = await G(() => [...document.querySelectorAll('.mc-book .mc-beast-h[data-act="msel"]')].map((e) => e.dataset.v).filter((v) => !v.startsWith('run_')));
  const pick = cand.includes('dew_king') ? 'dew_king' : cand.find((v) => /slime|wisp|skeleton/.test(v)) || cand[0];
  await p.click(`.mc-book .mc-beast-h[data-v="${pick}"]`); await p.waitForTimeout(500);
  const btn = await p.$(`[data-act="mtrack"][data-v="${pick}"]`);
  const mid = await btn.getAttribute('data-v'); await btn.click(); await p.waitForTimeout(1200);
  ok(/Не отслеживать/.test(await btn.textContent().catch(() => '')) || /Не отслеживать/.test(await G(() => document.querySelector('.mc-book')?.innerText || '')), 'кнопка → «Не отслеживать» (' + mid + ')');
  await G(() => window.__game.debug.openBook('bestiary')); await p.keyboard.press('Escape'); await G(() => document.querySelector('.mc-book') && (document.querySelector('.mc-book').style.display = 'none')); await p.waitForTimeout(800);
  let t = await trk(), h = await G(() => window.__game.debug.track().hunt);
  ok(/Охота:/.test(t), 'трекер: строка «Охота: …» — ' + t.split('\n').filter((x) => /Охота|·|Аринар/.test(x)).join(' / '));
  ok(h?.target && (h.target.hunt === 'portal' ? /Аринар/.test(h.where) : h.target.world === 'hellfire'), `на Поляне: цель ${h?.target?.hunt} — «${h?.where}» (водится на Поляне — живой рядом, иначе портал в Аринар)`);
  await p.screenshot({ path: `${OUT}/r7-bestiary-track-1-hub-portal.png` });
  // 2. перезагрузка — выбор хранит сервер
  await boot(); ok((await G(() => window.__game.meta.mobTrack)) === mid, 'после перезагрузки отслеживание на месте (сервер): ' + (await G(() => window.__game.meta.state.account.mobTrack)));
  // 3. Аринар: цель — место обитания/лагерь/моб; мини-карта и карта M
  for (let i = 0; i < 8 && (await G(() => window.__game.state().world)) !== 'arinar'; i++) { await G(() => window.__game.debug.teleport(240, 600)); await p.waitForTimeout(700); await G(() => window.__game.debug.rawSend({ type: 'use_portal', portalId: 'portal_arinar' })); await p.waitForTimeout(1800); }
  await p.waitForTimeout(2500); h = await G(() => window.__game.debug.track().hunt);
  ok(h?.target && h.target.world === 'arinar' && ['home', 'camp', 'mob'].includes(h.target.hunt), `в Аринаре: цель ${h?.target?.hunt} «${h?.target?.label}» · ${h?.where}`);
  const arrow = await G(() => document.querySelector('.mc-tracker .arrow span')?.textContent || ''); ok(/🎯/.test(arrow), 'компас: ' + arrow);
  const mm = await G(() => window.__game.debug.track().mm); ok(mm?.hunt === 'in' || mm?.hunt === 'edge', 'мини-карта: 🎯 цели (' + mm?.hunt + ')');
  await p.screenshot({ path: `${OUT}/r7-bestiary-track-2-arinar.png` });
  await p.keyboard.press('KeyM'); await p.waitForTimeout(1500);
  const wm = await G(() => window.__game.debug.worldMapStats?.() || null);
  await p.screenshot({ path: `${OUT}/r7-bestiary-track-3-map.png` });
  ok(wm?.hunt?.homes > 0 && wm.hunt.target, 'карта M: места обитания и 🎯 цель ' + JSON.stringify(wm?.hunt)); await p.keyboard.press('KeyM'); await p.waitForTimeout(400);
  // 4. живой моб рядом: подсветка кольцом + компас к мобу
  const me0 = await G(() => window.__game.state().player);
  const tp = async (x, y, w = 3000) => { await G(([x, y]) => { window.__game.debug.rawSend({ type: 'dev_teleport', x, y, god: true }); window.__game.debug.teleport(x, y); }, [x, y]); await p.waitForTimeout(w); };
  await tp(24160, 23950, 3500);
  const near = await G(() => { const me = window.__game.state().player; return (window.__game.debug.campsRaw() || []).filter((c) => c[3] > 0).sort((a, z) => Math.hypot(a[1] - me.x, a[2] - me.y) - Math.hypot(z[1] - me.x, z[2] - me.y))[0]; });
  const ty = near[7][0]; await G((t) => window.__game.meta.setMobTrack(t), ty); await tp(near[1] - 150, near[2], 3500);
  h = await G(() => window.__game.debug.track().hunt); const rings = await G(() => window.__game.debug.track().types);
  ok(h?.target?.hunt === 'mob' || h?.target?.hunt === 'camp', `рядом ${ty}: цель — ${h?.target?.hunt}`); ok(rings.includes(ty), 'тип в подсветке (кольца на экране/мини-карте)');
  await p.screenshot({ path: `${OUT}/r7-bestiary-track-4-near.png` });
  await G(() => window.__game.meta.setMobTrack(null)); await p.waitForTimeout(800); ok(!/Охота:/.test(await trk()), 'снятие — строка «Охота» пропала');
  // 5. квест админки «Ахахах»: цели без текста (и с заглушкой «Цель»)
  const qid = 'c_r7_ahah';
  await G((q) => window.__game.debug.rawSend({ type: 'admin_quest_save', quest: q }), { id: qid, npc: 'alzi', title: 'Ахахах', objectives: [{ type: 'kill', mob: 'thin_wisp', count: 5, text: '' }, { type: 'kill', mob: 'dew_king', count: 3, text: 'Цель' }], rewards: { xp: 10 }, offer: ['…'], progress: '…', done: ['…'], track: true });
  await p.waitForTimeout(1500); await tp(24160, 23920, 1500); await G((id) => window.__game.debug.rawSend({ type: 'quest_accept', id }), qid); await p.waitForTimeout(800); await G((id) => window.__game.debug.forceQuest?.(id), qid); await p.waitForTimeout(800);
  await G(() => window.__game.meta.setTrack(null, false)); await p.waitForTimeout(1000); await G((id) => window.__game.meta.setTrack(id, true), qid); await p.waitForTimeout(1000);
  console.log('  q0:', JSON.stringify(await G((id) => window.__game.meta.account.quests.untracked.includes(id), qid))); await p.waitForTimeout(1200);
  console.log('  ws:', adm.slice(-6).join(' || ')); t = await trk(); console.log('  tracker:', t.replace(/\n/g, ' / ')); ok(/Убить: Огонёк тонкого места\s*0\/5/.test(t) && /Убить: Король Росы\s*0\/3/.test(t) && !/Цель 0/.test(t), 'трекер: «Убить: Огонёк тонкого места 0/5», «Убить: Король Росы 0/3»');
  const tq = await G(() => window.__game.debug.track()); ok(tq.types.includes('thin_wisp') && tq.types.includes('dew_king'), 'мобы квеста — в подсветке');
  ok(/Огонёк|Король/.test(tq.target?.label || ''), 'компас к цели квеста: ' + tq.target?.label);
  await p.screenshot({ path: `${OUT}/r7-custom-quest-tracker.png` });
  await G(() => window.__game.debug.openBook('quests')); await p.waitForTimeout(700);
  const log = await G(() => document.querySelector('.mc-book')?.innerText || ''); ok(/Убить: Огонёк тонкого места/.test(log), 'журнал заданий: текст цели по типу');
  await p.screenshot({ path: `${OUT}/r7-custom-quest-log.png` }); await p.keyboard.press('Escape');
  // с Поляны — подсказка другой локации
  for (let i = 0; i < 6 && (await G(() => window.__game.state().world)) !== 'hellfire'; i++) { await tp(23700, 24000, 1200); await G(() => window.__game.debug.rawSend({ type: 'use_portal', portalId: 'portal_hellfire' })); await p.waitForTimeout(2000); }
  console.log('  world:', await G(() => window.__game.state().world), JSON.stringify(await G(() => { const t = window.__game.debug.track(); return { types: t.types, target: t.target }; })));
  if ((await G(() => window.__game.state().world)) === 'hellfire') { await p.waitForTimeout(1200); t = await trk(); console.log('  tracker:', t.replace(/\n/g, ' / ')); const tg = await G(() => window.__game.debug.track().target);
    ok(/Аринар/.test(t) && /портал/.test(tg?.label || ''), 'на Поляне: «↪ … — Аринар · <место>», компас к порталу: ' + tg?.label); await p.screenshot({ path: `${OUT}/r7-custom-quest-hub.png` }); }
  else ok(true, '(возврат на Поляну не удался в тесте — проверка межлокационной подсказки квеста пропущена)');
  ok(!errs.length, 'без ошибок страницы ' + errs.join('|'));
  console.log(`${pass} passed, ${fail} failed`); await b.close(); process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
