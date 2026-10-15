// Значки статусов над ОЗ моба: по одному на вид со стаками (🔥×N 🩸×N), данные — стаки из снимка сервера. Только локально.
// Черты «Поджог»/«Кровотечение» 100% на все типы оружия (админ, локальная D1), потом сброс.
const { chromium } = require('playwright-core');
const { guardLocal, assertLocalUrl } = require(process.env.MC_LOCAL_GUARD || './_local');
const OUT = '/workspace/morrisgrad-round3', UID = 'test_admin_pt';
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
(async () => {
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const ctx = await b.newContext({ viewport: { width: 1280, height: 760 } }); await guardLocal(ctx); const p = await ctx.newPage(); const errs = [];
  p.on('pageerror', (e) => errs.push(String(e).slice(0, 200)));
  await p.goto(assertLocalUrl(`http://127.0.0.1:5199/game.html?name=Алекс&uid=${UID}&ws=ws://127.0.0.1:8787&fs=1&debug=1`));
  await p.waitForFunction(() => window.__game?.state?.().mode === 'hub' && window.__game.meta?.state, null, { timeout: 120000 }); await p.waitForTimeout(1500);
  const G = (fn, a) => p.evaluate(fn, a);
  await G(() => window.__game.debug.selectClass('mage')); await p.waitForTimeout(2000);
  await G(() => window.__game.debug.rawSend({ type: 'dev_grant', flags: { talents_open: 1 }, xp: 5e6 })); await p.waitForTimeout(1200);
  for (const id of ['coat', 'coat', 'coat', 'frost_nova', 'ether', 'ether', 'ether', 'deep']) { await G((x) => window.__game.meta.talentLearn('mage.' + x), id); await p.waitForTimeout(250); }
  for (let i = 0; i < 8 && (await G(() => window.__game.state().world)) !== 'arinar'; i++) { await G(() => window.__game.debug.teleport(240, 600)); await p.waitForTimeout(700); await G(() => window.__game.debug.rawSend({ type: 'use_portal', portalId: 'portal_arinar' })); await p.waitForTimeout(1800); }
  await G(() => { window.__game.debug.rawSend({ type: 'dev_teleport', x: 24000, y: 20500, god: true }); window.__game.debug.teleport(24000, 20500); }); await p.waitForTimeout(3500);
  const WT = ['daggers', 'spear', 'axe', 'sword', 'staff', 'book', 'bow', 'hammer'];
  for (const w of WT) await G((w) => window.__game.debug.rawSend({ type: 'admin_save', kind: 'weapon', id: w, patch: { traits: [{ k: 'burn', chance: 100, dpsPct: 5, dur: 8 }, { k: 'bleed', chance: 100, dpsPct: 5, dur: 4 }] } }), w);
  await p.waitForTimeout(1500);
  const me = await G(() => window.__game.state().player);
  // гарантированный обычный (не элита) живучий моб рядом
  await G(([x, y]) => window.__game.debug.rawSend({ type: 'dev_spawn_mob', mob: 'garden_golem', x: x + 90, y, cursed: true }), [me.x, me.y]); await p.waitForTimeout(1500);
  let ms = (await G(() => window.__game.debug.zoneMobsFull())).filter((m) => !m.elite); ms.sort((a, z) => Math.hypot(a.x - me.x, a.y - me.y) - Math.hypot(z.x - me.x, z.y - me.y));
  const m0 = ms[0]; ok(!!m0, 'моб рядом');
  await G(([x, y]) => { window.__game.debug.rawSend({ type: 'dev_teleport', x, y, god: true }); window.__game.debug.teleport(x, y); }, [m0.x - 90, m0.y]); await p.waitForTimeout(1500);
  let best = null;
  for (let i = 0; i < 14 && !(best && /×/.test(best)); i++) {
    const mm = (await G(() => window.__game.debug.zoneMobsFull())).find((m) => m.id === m0.id) || m0;
    const sp = await G(([x, y]) => window.__game.debug.screenOf(x, y), [mm.x, mm.y]);
    if (sp) { await p.mouse.move(sp.x, sp.y); await p.mouse.down(); await p.waitForTimeout(700); await p.mouse.up(); }
    best = await G(() => [...document.querySelectorAll('.mc-msts')].map((e) => e.textContent).sort((a, b) => b.length - a.length)[0] || null);
  }
  await p.screenshot({ path: `${OUT}/r6-mob-status.png` });
  const row = await G(() => { const e = [...document.querySelectorAll('.mc-msts')].sort((a, b) => b.children.length - a.children.length)[0]; return e ? [...e.children].map((c) => c.className + ':' + c.textContent) : []; });
  ok(row.some((x) => /burn:🔥/.test(x)) && row.some((x) => /bleed:🩸/.test(x)), 'над полоской ОЗ — два значка разных видов: ' + row.join(' '));
  ok(row.some((x) => /burn:🔥×[2-7]/.test(x)), 'поджог со стаками ×N: ' + row.join(' '));
  ok(row.filter((x) => /^mc-mst burn/.test(x)).length === 1, 'один значок на вид (не по значку на стак)');
  const cnt = await G(() => window.__game.debug.mobStatusRow({ sts: { burn: 2, bleed: 1, poison: 0 }, flagRaw: 64, frozen: false }));
  ok(/🔥<sub>×2<\/sub>/.test(cnt) && /🩸<\/b>/.test(cnt) && /🐌/.test(cnt) && !/☠/.test(cnt), 'разметка: 🔥×2 🩸 🐌, без яда');
  for (const w of WT) await G((w) => window.__game.debug.rawSend({ type: 'admin_reset', kind: 'weapon', id: w }), w); await p.waitForTimeout(800);
  ok(!errs.length, 'без ошибок ' + errs.join('|'));
  console.log(fails ? `FAILED ${fails}` : 'mob-status ok'); await b.close(); process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
