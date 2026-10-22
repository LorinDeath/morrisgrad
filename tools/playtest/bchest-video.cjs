// Видео сундуков наград (только локальный стенд). MODE=pc|phone. recordVideo → webm → ffmpeg mp4.
const { chromium, devices } = require('playwright-core');
const { guardLocal, assertLocalUrl } = require('/workspace/mg-qol/tools/playtest/_local.cjs');
const MODE = process.env.MODE || 'pc';
const RAW = '/workspace/morrisgrad-qol/video/raw/' + MODE;
const BASE = 'http://127.0.0.1:5371/game-panel.html', WS = 'ws://127.0.0.1:8971';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const vp = MODE === 'phone' ? devices['iPhone 13'].viewport : { width: 1280, height: 800 };
  const vsize = MODE === 'phone' ? { width: vp.width * 2, height: vp.height * 2 } : vp;
  const ctx = await b.newContext({ ...(MODE === 'phone' ? { ...devices['iPhone 13'], defaultBrowserType: undefined } : { viewport: vp }), recordVideo: { dir: RAW, size: vsize } });
  await guardLocal(ctx);
  await ctx.addInitScript(() => { try { localStorage.setItem('mc_ui_theme', 'new'); } catch {}
    // видимый курсор/касание и подпись шага (в headless-видео курсора нет)
    addEventListener('DOMContentLoaded', () => {
      const c = document.createElement('div'); c.id = 'vcur'; c.style.cssText = 'position:fixed;z-index:2147483647;left:0;top:0;width:14px;height:14px;margin:-7px 0 0 -7px;border:2px solid #fff;background:rgba(255,80,80,.55);border-radius:50%;pointer-events:none;display:none';
      const cap = document.createElement('div'); cap.id = 'vcap'; cap.style.cssText = 'position:fixed;z-index:2147483647;left:8px;bottom:8px;padding:4px 10px;background:rgba(0,0,0,.75);color:#fff;font:600 14px system-ui;border-radius:4px;pointer-events:none;display:none';
      document.body.append(c, cap);
      const mv = (e) => { const t = e.touches?.[0] || e; c.style.display = 'block'; c.style.left = t.clientX + 'px'; c.style.top = t.clientY + 'px'; };
      addEventListener('mousemove', mv, true); addEventListener('pointerdown', (e) => { mv(e); c.style.background = 'rgba(255,220,60,.9)'; }, true); addEventListener('pointerup', () => { c.style.background = 'rgba(255,80,80,.55)'; }, true);
      setInterval(() => document.querySelectorAll('.mcl-err[data-code="MC-A04"]').forEach((e) => e.remove()), 100);
    });
    window.__cap = (t) => { const e = document.getElementById('vcap'); if (e) { e.textContent = t; e.style.display = t ? 'block' : 'none'; } };
  });
  const p = await ctx.newPage(); const errs = [];
  p.on('pageerror', (e) => errs.push(String(e).slice(0, 300)));
  const T0 = Date.now(); const marks = {};
  const uid = 'bcv_' + MODE + Date.now().toString(36);
  await p.goto(assertLocalUrl(`${BASE}?name=Видео&uid=${uid}&ws=${WS}&fs=1&debug=1`));
  await p.waitForFunction(() => window.__game?.state?.().mode === 'hub', null, { timeout: 120000 });
  await sleep(1500);
  const G = (f, a) => p.evaluate(f, a);
  const S = (o) => G((x) => window.__game.debug.send(x), o);
  const cap = (t) => G((x) => window.__cap(x), t);
  await G(() => window.__game.debug.selectClass('warrior')); await sleep(2500);
  await G(() => window.__game.board?.tut?.('skip')); await sleep(600);
  await S({ type: 'dev_grant', xp: 3000000 }); await sleep(500); await S({ type: 'dev_grant', xp: 3000000 }); await sleep(500);
  await p.keyboard.press('Escape').catch(() => {}); await sleep(300);
  const C = (sel) => `#mc-bchest ${sel}`;
  const center = async (sel) => { const el = await p.$(sel); if (!el) return null; const bb = await el.boundingBox(); return bb && { x: bb.x + bb.width / 2, y: bb.y + bb.height / 2 }; };
  const glide = async (sel) => { const c = await center(sel); if (!c) { console.log('нет', sel); return null; } await p.mouse.move(c.x, c.y, { steps: 18 }); return c; };
  const clickSel = async (sel, mods) => { const c = await glide(sel); if (!c) return false; await sleep(250); if (mods) await p.keyboard.down(mods); await p.mouse.click(c.x, c.y); if (mods) await p.keyboard.up(mods); return true; };
  const tap = async (sel) => { const c = await center(sel); if (!c) return false; await G(([x, y]) => { const e = document.getElementById('vcur'); e.style.display = 'block'; e.style.left = x + 'px'; e.style.top = y + 'px'; }, [c.x, c.y]); await p.touchscreen.tap(c.x, c.y); return true; };
  const openChest = async (pred, label) => {
    const id = await G((src) => { const f = new Function('c', 'return ' + src); return window.__game.bchestWin.st.list.find((c) => !c.opened && f(c))?.id; }, pred);
    if (!id) { console.log('нет сундука', label); return null; }
    await cap(label);
    if (MODE === 'phone') await tap(C(`.bc-row[data-id="${id}"]`)); else await clickSel(C(`.bc-row[data-id="${id}"]`)); await sleep(900);
    if (MODE === 'phone') { await G(() => document.querySelector('#mc-bchest .bc-open')?.scrollIntoView({ block: 'center', behavior: 'smooth' })); await sleep(900); const ok = await tap(C('.bc-open')); console.log('tap open', ok); const got = await p.waitForSelector('.bc-fx', { timeout: 4000 }).then(() => 1, () => 0); if (!got) { console.log('fallback click'); await G(() => document.querySelector('#mc-bchest .bc-open')?.click()); } } else await clickSel(C('.bc-open'));
    await p.waitForSelector('.bc-fx', { timeout: 15000 }).catch(() => {});
    await p.waitForSelector('.bc-fx', { state: 'detached', timeout: 30000 }).catch(() => {});
    await sleep(1500);
    const it = await G(() => window.__game.bchestWin.cur()?.items || []);
    console.log('opened', label, id, it.length, JSON.stringify({ c: it.filter((x) => x.c).length, e: it.filter((x) => x.e).length, b: it.filter((x) => x.b).length }));
    return { id, it };
  };
  if (MODE === 'pc') {
    // заранее (вне кадра): ранговое задание «разобрать предмет» ×1, ранг F, и разобрать один предмет → задание готово
    await S({ type: 'dev_grant', boardRoll: { id: 'd_salvage', r: 'F', n: 1, minL: 1 } }); await sleep(800);
    await S({ type: 'dev_grant', item: 'dew_slime_helmet' }); await S({ type: 'meta_get' }); await sleep(1200);
    await G(() => window.__game.debug.openBook('gear')); await sleep(1200);
    const u = await G(() => [...document.querySelectorAll('.mc-bag .mc-item[data-v]')].pop()?.dataset.v);
    if (u) await S({ type: 'salvage', uid: u }); await sleep(800);
    await p.keyboard.press('Escape'); await sleep(400); await G(() => window.__game.book?.close?.()); await S({ type: 'meta_get' }); await sleep(1500);
    marks.start = Date.now();
    await cap('Доска заданий: сдать ранговое задание (ранг F)');
    await G(() => window.__game.boardWin.open('all', 'daily')); await sleep(1500);
    await G(() => document.querySelector('.mc-bd-row[data-id="d_salvage"]')?.scrollIntoView({ block: 'center' })); await sleep(800);
    const ok = await clickSel('[data-b="claim"][data-v="d_salvage"]'); console.log('claim btn', ok); await sleep(2500);
    await G(() => window.__game.boardWin.close()); await sleep(500);
    // остальные сундуки — выдача dev (ранги A, S, SS), как за сданные задания
    await S({ type: 'dev_grant', bchestGrant: { ranks: ['A', 'S', 'SS'], L: 12, cat: 'weekly' } }); await sleep(800);
    await S({ type: 'meta_get' }); await sleep(800);
    await cap('Клавиша Y — окно «Сундуки наград»: ранг и уровень');
    await p.mouse.move(640, 400, { steps: 5 }); await p.keyboard.press('y'); await sleep(1200);
    if (!(await p.$('#mc-bchest .bc-row'))) { await G(() => window.__game.bchestWin.open()); }
    await p.waitForSelector('#mc-bchest .bc-row', { timeout: 15000 }); await sleep(2500);
    const rows = await G(() => window.__game.bchestWin.st.list.map((c) => [c.rank, c.L, c.tier || c.art || '', c.src || c.cat]));
    console.log('list', JSON.stringify(rows));
    await openChest("c.rank==='F'", 'Обычный сундук (F, за задание доски)');
    await openChest("c.rank==='A'", 'Эпический сундук (A)');
    await openChest("c.rank==='S'", 'Проклятый легендарный (S)');
    const ss = await openChest("c.rank==='SS'", 'Чёрный проклятый (SS)');
    const items = ss?.it || [];
    const pick = (f) => items.find(f);
    const sel = (x) => C(`.grid [data-lid="${x.lid}"]`);
    const t1 = pick((x) => x.c && x.e === 6) || items[0];
    await cap('Наведение — подсказка со сравнением'); await glide(sel(t1)); await sleep(2800);
    const x1 = pick((x) => x !== t1) ; await cap('Shift+клик — забрать сразу'); await clickSel(sel(x1), 'Shift'); await sleep(2000);
    const cur = async () => G(() => window.__game.bchestWin.cur()?.items || []);
    let left = await cur(); console.log('after shift', items.length, '→', left.length);
    const lvl = await G(() => window.__game.debug?.hero?.()?.lvl || 99);
    const x2 = left.find((x) => !x.c) || left[0]; await cap('Выбрать → «Надеть»'); await clickSel(sel(x2)); await sleep(700); await clickSel(C('[data-a="equip"]')); await sleep(2200);
    left = await cur(); console.log('after equip', left.length);
    const x3 = left[left.length - 1]; await cap('Выбрать → «Разобрать»'); await clickSel(sel(x3)); await sleep(700); await clickSel(C('[data-a="salvage"]')); await sleep(800);
    const cf = await p.$('.mc-confirm .ok, .mc-dlg [data-ok], .bc-confirm [data-a="yes"]'); if (cf) { await clickSel('.mc-confirm .ok, .mc-dlg [data-ok], .bc-confirm [data-a="yes"]'); }
    await sleep(2000); left = await cur(); console.log('after salvage', left.length);
    // «Забрать всё» — у открытого сундука, где ещё остались вещи (эпический A)
    const aid = await G(() => window.__game.bchestWin.st.list.filter((c) => c.opened && (c.items || []).length).sort((p, q) => q.items.length - p.items.length)[0]?.id);
    console.log('all target', aid);
    await cap('Открытый сундук с вещами → «Забрать всё»'); await clickSel(C(`.bc-row[data-id="${aid}"]`)); await sleep(1500);
    await cap('«Забрать всё» — пустой сундук исчезает из списка'); await clickSel(C('[data-a="all"]')); await sleep(3500);
    const still = await G((i) => window.__game.bchestWin.st.list.some((c) => c.id === i), aid); console.log('chest still listed', still, 'SS listed', await G((i) => window.__game.bchestWin.st.list.some((c) => c.id === i), ss?.id));
    await sleep(1500); await cap('');
  } else {
    await S({ type: 'dev_grant', bchestGrant: { ranks: ['SS'], L: 12, cat: 'monthly' } }); await sleep(800);
    await S({ type: 'meta_get' }); await sleep(1000);
    marks.start = Date.now();
    await G(() => window.__game.bchestWin.open()); await p.waitForSelector('#mc-bchest .bc-row', { timeout: 15000 }); await cap('Телефон: сундук SS (мифический проклятый)'); await sleep(2000);
    const r = await openChest("c.rank==='SS'", 'Телефон: открыть сундук SS');
    const x = r.it[0]; await cap('Двойной тап — забрать');
    const c = await center(C(`.grid [data-lid="${x.lid}"]`)); await G(([a, bb]) => { const e = document.getElementById('vcur'); e.style.display = 'block'; e.style.left = a + 'px'; e.style.top = bb + 'px'; }, [c.x, c.y]);
    await p.touchscreen.tap(c.x, c.y); await sleep(120); await p.touchscreen.tap(c.x, c.y); await sleep(2500);
    const left = await G(() => window.__game.bchestWin.cur()?.items?.length || 0); console.log('dbltap: было', r.it.length, 'стало', left);
    await sleep(1500); await cap('');
  }
  marks.end = Date.now();
  const v = p.video(); await ctx.close(); const path = await v.path();
  console.log('VIDEO', path, 'SS', ((marks.start - T0) / 1000).toFixed(1), 'DUR', ((marks.end - marks.start) / 1000 + 0.5).toFixed(1));
  console.log('ERRORS', errs.length, JSON.stringify(errs));
  await b.close();
})().catch((e) => { console.error('FAIL', e); process.exit(1); });
