// item-ui: клик по надетому → статы+«Снять»; сумка → статы+«Надеть»; админ-пикер наград с уровнем/статами; алтарь — tip.
// Только localhost (tools/playtest/_local.js).
const { chromium } = require('playwright-core');
const { guardLocal, assertLocalUrl } = require('./_local.cjs');
const OUT = '/workspace/morrisgrad-round3/item-ui';
const BASE = 'http://127.0.0.1:5196/game.html';
const WS = 'ws://127.0.0.1:8786';
const fs = require('fs');
fs.mkdirSync(OUT, { recursive: true });

(async () => {
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const ctx = await b.newContext({ viewport: { width: 1440, height: 860 } });
  const blocked = await guardLocal(ctx);
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', (e) => errs.push(String(e.stack || e).slice(0, 300)));
  let pass = 0, fail = 0;
  const ok = (c, m) => { if (c) pass++; else fail++; console.log((c ? 'PASS ' : 'FAIL ') + m); };

  const uid = 'test_itemui_' + Date.now();
  await p.goto(assertLocalUrl(`${BASE}?name=ItemUI&uid=${uid}&ws=${WS}&fs=1&debug=1`));
  await p.waitForFunction(() => window.__game?.state?.().mode === 'hub', null, { timeout: 120000 });
  await p.waitForTimeout(2000);
  const G = (fn, a) => p.evaluate(fn, a);

  await G(() => window.__game.debug.selectClass('rogue'));
  await p.waitForTimeout(1500);

  // выдать предметы и надеть один
  for (const it of ['fly_legs', 'padded_coat', 'greenpoise_bow', 'dew_slime_helmet']) {
    await G((i) => window.__game.debug.send({ type: 'dev_grant', item: i }), it);
    await p.waitForTimeout(120);
  }
  await p.waitForTimeout(800);

  const before = await G(() => {
    const a = window.__game.meta.account;
    const h = window.__game.meta.hero;
    const inv = (a?.inv || []).map((i) => ({ uid: i.uid, id: i.id }));
    const eq = { ...(h?.equip || {}) };
    return { inv, eq, cls: h?.cls, lvl: h?.lvl };
  });
  console.log('before', JSON.stringify(before));
  ok(before.inv.length >= 3, `инвентарь после grant: ${before.inv.length}`);

  // надеть fly_legs (оружие/ноги? fly_legs — лапки) и padded_coat
  const coat = before.inv.find((i) => i.id === 'padded_coat');
  const legs = before.inv.find((i) => i.id === 'fly_legs');
  if (coat) { await G((u) => window.__game.meta.equip(u), coat.uid); await p.waitForTimeout(400); }
  if (legs) { await G((u) => window.__game.meta.equip(u), legs.uid); await p.waitForTimeout(400); }

  const eq1 = await G(() => ({ ...(window.__game.meta.hero?.equip || {}) }));
  console.log('equip', JSON.stringify(eq1));
  ok(Object.keys(eq1).length >= 1, `надето слотов: ${Object.keys(eq1).length}`);
  const armorUid = eq1.armor || eq1.legs || Object.values(eq1)[0];

  await G(() => window.__game.debug.openBook('gear'));
  await p.waitForTimeout(700);
  await p.screenshot({ path: `${OUT}/01-gear-open.png` });

  // клик по надетому слоту — НЕ снимает, открывает карточку со «Снять»
  const clickEq = await G(() => {
    const btn = document.querySelector('.mc-gslot.filled');
    if (!btn) return { ok: false, why: 'no filled slot' };
    btn.click();
    return { ok: true, act: btn.getAttribute('data-act'), v: btn.getAttribute('data-v'), title: btn.getAttribute('title') };
  });
  await p.waitForTimeout(500);
  console.log('clickEq', JSON.stringify(clickEq));
  ok(clickEq.ok && clickEq.act === 'sel', `слот data-act=sel (было unequip): ${JSON.stringify(clickEq)}`);

  const card1 = await G(() => {
    const tip = document.querySelector('.mc-detail .mc-tip');
    const unequipBtn = [...document.querySelectorAll('.mc-detail .acts .mc-btn')].find((b) => b.textContent.trim() === 'Снять');
    const equipBtn = [...document.querySelectorAll('.mc-detail .acts .mc-btn')].find((b) => b.textContent.trim() === 'Надеть');
    const eqAfter = { ...(window.__game.meta.hero?.equip || {}) };
    return {
      hasTip: !!tip,
      tipName: tip?.querySelector('.nm')?.textContent?.trim() || '',
      hasUnequip: !!unequipBtn,
      hasEquip: !!equipBtn,
      eqAfter,
      stillEquipped: Object.values(eqAfter).includes(document.querySelector('.mc-gslot.filled.on')?.getAttribute('data-v') || '') || Object.keys(eqAfter).length >= Object.keys(eq1 || {}).length,
    };
  });
  // re-read eq1 length from previous
  const stillOn = await G((uidWant) => {
    const eq = window.__game.meta.hero?.equip || {};
    return { eq, hasUid: uidWant ? Object.values(eq).includes(uidWant) : Object.keys(eq).length > 0, tip: !!document.querySelector('.mc-detail .mc-tip'), snjat: [...document.querySelectorAll('.mc-detail .acts .mc-btn')].some((b) => b.textContent.trim() === 'Снять') };
  }, armorUid);
  console.log('stillOn', JSON.stringify(stillOn));
  ok(stillOn.hasUid && stillOn.tip && stillOn.snjat, `клик по надетому: статы+Снять, предмет надет ${JSON.stringify(stillOn)}`);
  await p.screenshot({ path: `${OUT}/02-equipped-stats.png` });

  // клик по сумке — карточка с «Надеть», без мгновенного экипа
  const bagClick = await G(() => {
    const eqBefore = { ...(window.__game.meta.hero?.equip || {}) };
    const bag = document.querySelector('.mc-bag .mc-item');
    if (!bag) return { ok: false, why: 'empty bag' };
    bag.click();
    return { ok: true, uid: bag.getAttribute('data-v'), eqBefore };
  });
  await p.waitForTimeout(400);
  const bagCard = await G((prev) => {
    const tip = document.querySelector('.mc-detail .mc-tip');
    const nade = [...document.querySelectorAll('.mc-detail .acts .mc-btn')].find((b) => b.textContent.trim() === 'Надеть');
    const eq = { ...(window.__game.meta.hero?.equip || {}) };
    return {
      tip: !!tip,
      name: tip?.querySelector('.nm')?.textContent?.trim() || '',
      hasNade: !!nade,
      eqSame: JSON.stringify(eq) === JSON.stringify(prev),
      eq,
    };
  }, bagClick.eqBefore);
  console.log('bagCard', JSON.stringify(bagCard));
  ok(bagClick.ok && bagCard.tip && bagCard.hasNade && bagCard.eqSame, `сумка: статы+Надеть без авто-экипа ${JSON.stringify(bagCard)}`);
  await p.screenshot({ path: `${OUT}/03-bag-stats.png` });

  // явная кнопка Снять работает
  await G(() => document.querySelector('.mc-gslot.filled')?.click());
  await p.waitForTimeout(300);
  const beforeUneq = await G(() => Object.keys(window.__game.meta.hero?.equip || {}).length);
  await G(() => [...document.querySelectorAll('.mc-detail .acts .mc-btn')].find((b) => b.textContent.trim() === 'Снять')?.click());
  await p.waitForTimeout(500);
  const afterUneq = await G(() => Object.keys(window.__game.meta.hero?.equip || {}).length);
  ok(afterUneq < beforeUneq, `кнопка Снять сняла предмет (${beforeUneq}→${afterUneq})`);
  await p.screenshot({ path: `${OUT}/04-after-unequip-btn.png` });

  await G(() => document.querySelector('.mc-book-x')?.click());
  await p.waitForTimeout(400);

  // --- Алтарь: tip по клику ---
  // снова надеть что-нибудь для превью
  const again = await G(() => (window.__game.meta.account?.inv || []).find((i) => i.id === 'padded_coat')?.uid);
  if (again) { await G((u) => window.__game.meta.equip(u), again); await p.waitForTimeout(400); }
  await G(() => window.__game.debug.openAltar());
  await p.waitForTimeout(800);
  await p.screenshot({ path: `${OUT}/05-altar.png` });
  const altarTip = await G(() => {
    const slot = document.querySelector('.mc-altar-slot.filled');
    if (!slot) return { ok: false, why: 'no filled altar slot' };
    slot.click();
    return { ok: true };
  });
  await p.waitForTimeout(400);
  const tipOk = await G(() => {
    const tip = document.querySelector('.mc-altar-tip');
    return { tip: !!tip, text: tip?.textContent?.slice(0, 120) || '' };
  });
  console.log('altar', JSON.stringify({ altarTip, tipOk }));
  ok(altarTip.ok && tipOk.tip, `алтарь: tip статов ${tipOk.text}`);
  await p.screenshot({ path: `${OUT}/06-altar-tip.png` });
  await G(() => [...document.querySelectorAll('.mc3d-btn')].find((b) => /Закрыть/.test(b.textContent))?.click());
  await p.waitForTimeout(400);

  // --- Админ: пикер наград квеста ---
  // отдельный админ-юзер
  const pa = await ctx.newPage();
  pa.on('pageerror', (e) => errs.push('A ' + String(e.stack || e).slice(0, 200)));
  await pa.goto(assertLocalUrl(`${BASE}?name=Админ&uid=test_admin_pt&ws=${WS}&fs=1&debug=1`));
  await pa.waitForFunction(() => window.__game?.state?.().mode === 'hub', null, { timeout: 120000 });
  await pa.waitForTimeout(2500);
  const GA = (fn, a) => pa.evaluate(fn, a);
  const adm = await GA(() => window.__game.debug.admin());
  console.log('admin btn', JSON.stringify(adm));
  ok(adm.btn, 'админ: кнопка панели');
  await GA(() => document.querySelector('#ghud-admin-btn')?.click());
  await pa.waitForFunction(() => window.__game.debug.admin().loaded, null, { timeout: 20000 });
  await GA(() => { const b = [...document.querySelectorAll('.mc-admin .tabs button')].find((x) => x.dataset.tab === 'quest'); b?.click(); });
  await pa.waitForTimeout(700);
  // каталог: items должны нести lvl/rarity/stats
  const catSample = await GA(() => {
    // AdminPanel хранит cat на инстансе — достаём через debug.admin totals + open form side-channel
    const btn = document.querySelector('#ghud-admin-btn');
    // через raw: перечитать из DOM после выбора квеста; сначала проверим через eval на window
    const g = window.__game;
    // нет прямого доступа к panel.cat — вытащим через клик «Новый квест» (__new) и поиск
    return { loaded: g.debug.admin().loaded, totals: g.debug.admin().totals };
  });
  console.log('catSample', JSON.stringify(catSample));

  // открыть конкретный квест из сайдбара (не __tree/__new)
  const qid = await GA(() => {
    const li = [...document.querySelectorAll('.mc-admin aside li[data-id]')].find((x) => x.dataset.id && !x.dataset.id.startsWith('__'));
    if (!li) return null;
    li.click();
    return li.dataset.id;
  });
  await pa.waitForTimeout(700);
  console.log('opened quest', qid);
  ok(!!qid && !!(await GA(() => !!document.querySelector('[data-qisearch]'))), `форма квеста с пикером открыта (${qid})`);

  // поиск предмета по id
  await GA(() => {
    const inp = document.querySelector('[data-qisearch]');
    if (!inp) return;
    inp.focus();
    inp.value = '';
    inp.dispatchEvent(new Event('input', { bubbles: true }));
    inp.value = 'fly';
    inp.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await pa.waitForTimeout(500);
  const pick = await GA(() => {
    const pis = [...document.querySelectorAll('[data-qipick] .pi')];
    return {
      n: pis.length,
      sample: pis.slice(0, 3).map((el) => ({ text: el.textContent.replace(/\s+/g, ' ').trim(), meta: el.querySelector('.meta')?.textContent || '', title: el.getAttribute('title') || '' })),
    };
  });
  console.log('pick', JSON.stringify(pick));
  ok(pick.n > 0 && /ур\./.test(pick.sample[0]?.meta || ''), `пикер показывает ур./статы: ${JSON.stringify(pick.sample[0])}`);

  await GA(() => document.querySelector('[data-qipick] .pi')?.click());
  await pa.waitForTimeout(600);
  const chip = await GA(() => {
    const c = document.querySelector('[data-qitems] .chip');
    return c ? { text: c.textContent.replace(/\s+/g, ' ').trim(), meta: c.querySelector('.meta')?.textContent || '', title: c.getAttribute('title') || '' } : null;
  });
  console.log('chip', JSON.stringify(chip));
  ok(chip && /ур\./.test(chip.meta || ''), `выбранная награда с уровнем/статами: ${JSON.stringify(chip)}`);
  await pa.screenshot({ path: `${OUT}/07-admin-quest-picker.png` });

  await GA(() => {
    const inp = document.querySelector('[data-qisearch]');
    if (!inp) return;
    inp.value = 'padded';
    inp.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await pa.waitForTimeout(400);
  const padded = await GA(() => {
    const el = document.querySelector('[data-qipick] .pi');
    return el ? { text: el.textContent.replace(/\s+/g, ' ').trim(), meta: el.querySelector('.meta')?.textContent || '' } : null;
  });
  console.log('padded', JSON.stringify(padded));
  ok(padded && /ур\.|броня|HP|Обычн/i.test(padded.meta + padded.text), `padded_coat в пикере со статами: ${JSON.stringify(padded)}`);
  await pa.screenshot({ path: `${OUT}/08-admin-padded.png` });

  console.log('RESULT pass=', pass, 'fail=', fail, 'blocked=', blocked.length, 'errs=', errs.slice(0, 5));
  require('fs').writeFileSync('/tmp/itemui-result.json', JSON.stringify({ pass, fail }));
  await b.close();
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
