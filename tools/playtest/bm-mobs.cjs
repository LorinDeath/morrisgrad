// LOCAL: чёрная магия, этап В — админка «👹 Чёрные мобы»: конструктор из частей тела + живое превью + оружие в руке,
// черновик → публикация, лагерь чёрных у обычного лагеря (таймер возрождения), драка чёрных с обычными при игроке рядом,
// отрисовка в мире (листы Художника). Только 127.0.0.1.
const { chromium } = require('playwright-core');
const { execSync } = require('node:child_process');
const fs = require('fs');
const { guardLocal, assertLocalUrl } = require('./_local.cjs');
const OUT = process.env.OUT || '/workspace/black-magic/shots-c';
const BASE = process.env.UD_BASE || 'http://127.0.0.1:5413/game.html', WS = process.env.UD_WS || 'ws://127.0.0.1:8413';
const PERSIST = process.env.PERSIST || '/workspace/mc-harness-bmc/wr';
const VIDEO = process.env.VIDEO || '';
assertLocalUrl(BASE); assertLocalUrl(WS); fs.mkdirSync(OUT, { recursive: true });
const W = '/workspace/mc-ui-tools/node_modules/.bin/wrangler';
const d1 = (sql) => JSON.parse(execSync(`cd /workspace/mg-black-c/server && PATH=/workspace/tools/node22/bin:$PATH ${W} d1 execute morrisgrad_db --local --persist-to ${PERSIST} --json --command ${JSON.stringify(sql)}`, { stdio: 'pipe' }).toString())[0].results;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let ok = 0, bad = 0; const t = (n, c, x) => { c ? ok++ : bad++; console.log(c ? 'ok  ' : 'FAIL', n, x === undefined ? '' : JSON.stringify(x).slice(0, 400)); };
const ADMIN = 'qa_bmc_' + Date.now().toString(36);
(async () => {
  d1(`INSERT OR REPLACE INTO player_roles (pkey, role, granted_by, granted_at) VALUES ('uid:${ADMIN}', 'admin', 'local-test', 0)`);
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const ctx = await b.newContext({ viewport: { width: 1440, height: 860 }, ...(VIDEO ? { recordVideo: { dir: VIDEO, size: { width: 1280, height: 764 } } } : {}) });
  await guardLocal(ctx); await ctx.addInitScript(() => { try { localStorage.setItem('mc_fs_auto', '0'); localStorage.setItem('mc_ui_theme', 'new'); } catch {} });
  const p = await ctx.newPage(); const errs = []; const fr = [];
  p.on('pageerror', (e) => errs.push(String(e.stack || e).slice(0, 400)));
  p.on('websocket', (ws) => ws.on('framereceived', (f) => { const s = String(f.payload); if (/toast|admin_bmm|admin_result|"dev_mob"/.test(s)) fr.push(s.slice(0, 1500)); }));
  const G = (f, a) => p.evaluate(f, a);
  const shot = async (n, o = {}) => { await G(() => document.querySelectorAll('.mcl-err').forEach((e) => e.remove())); await sleep(300); await p.screenshot({ path: `${OUT}/${n}.png`, ...o }); console.log('shot', `${OUT}/${n}.png`); };
  const marks = []; const mark = (n) => marks.push([n, Date.now()]); const T0 = Date.now();
  const waitFr = async (re, ms = 6000) => { for (let i = 0; i < ms / 150; i++) { const x = fr.find((y) => re.test(y)); if (x) return x; await sleep(150); } return null; };
  const anim = async (v) => { await G((v) => { const s = document.querySelector('.bmma [data-pv="anim"]'); if (s) { s.value = v; s.dispatchEvent(new Event('change', { bubbles: true })); } }, v); };
  await p.goto(assertLocalUrl(`${BASE}?name=${ADMIN}&uid=${ADMIN}&ws=${WS}&fs=1&debug=1`));
  await p.waitForFunction(() => window.__game?.state?.().mode === 'hub' && window.__game?.debug, null, { timeout: 120000 }); await sleep(2500);
  await G(() => window.__game.debug.selectClass('warrior')); await sleep(2500); await G(() => window.__game.board?.tut?.('skip')); await sleep(400);
  for (let i = 0; i < 8 && (await G(() => window.__game.state().world)) !== 'arinar'; i++) { await G(() => { window.__game.debug.rawSend({ type: 'dev_teleport', x: 240, y: 600 }); window.__game.debug.teleport(240, 600); }); await sleep(1200); await G(() => window.__game.debug.rawSend({ type: 'use_portal', portalId: 'portal_arinar' })); await sleep(3000); }
  t('в Аринаре', (await G(() => window.__game.state().world)) === 'arinar');
  // лагеря приходят только в радиусе 6000 от игрока; город пуст — выходим наружу кольцом
  for (const [dx, dy] of [[0, 0], [7000, 0], [-7000, 0], [0, 7000], [0, -7000], [7000, 7000], [-7000, -7000], [7000, -7000], [-7000, 7000]]) {
    if (dx || dy) { await G(([x, y]) => window.__game.debug.tp(x, y, true), [24000 + dx, 24150 + dy]); }
    const okc = await p.waitForFunction(() => (window.__game.debug.campsRaw() || []).some((c) => (c[3] ?? 2) >= 2), null, { timeout: dx || dy ? 6000 : 4000 }).then(() => true).catch(() => false);
    if (okc) break;
  }
  const camps = await G(() => window.__game.debug.campsRaw());
  const pl0 = await G(() => { const s = window.__game.state(); return { x: s.player?.x ?? s.x, y: s.player?.y ?? s.y }; });
  const CL = (camps || []).map((c) => Array.isArray(c) ? { id: c[0], x: c[1], y: c[2], alive: c[3], total: c[4], st: c[5] } : c).filter((c) => (c.alive ?? 2) >= 3 && c.alive === c.total && c.st === 0).map((c) => ({ ...c, d: Math.hypot(c.x - pl0.x, c.y - pl0.y) })).filter((c) => c.d > 900).sort((a, b) => a.d - b.d);
  t('обычные лагеря видны клиенту', CL.length > 0, { n: CL.length, c0: CL[0], pl0, raw: (camps || []).slice(0, 1) });
  const tgt = CL[Math.floor(Math.random() * Math.min(6, CL.length))] || { x: pl0.x + 1500, y: pl0.y };
  // админка → «👹 Чёрные мобы»
  await p.waitForFunction(() => { if (document.querySelectorAll('.mc-admin [data-tab]').length) return true; try { if (!window.__game.debug.admin().open) window.__game.debug.openAdmin(); } catch {} return false; }, null, { timeout: 30000 }).catch(() => {});
  await p.waitForFunction(() => { if (document.querySelectorAll('.bmma .pl [data-m]').length >= 3) return true; document.querySelector('.mc-admin [data-tab="bmmobs"]')?.click(); return false; }, null, { timeout: 25000, polling: 1500 }).catch(() => {}); await sleep(300);
  const tabOk = await G(() => ({ tab: !!document.querySelector('.mc-admin [data-tab="bmmobs"]'), list: document.querySelectorAll('.bmma .pl [data-m]').length, subs: document.querySelectorAll('.bmma [data-bs]').length, html: (document.querySelector('.bmma')?.innerText || '').slice(0, 300) }));
  if (tabOk.list < 3) console.log('FR', fr.slice(-6).map((x) => x.slice(0, 300)));
  t('вкладка «👹 Чёрные мобы»: список встроенных мобов, 4 подвкладки', tabOk.tab && tabOk.list >= 3 && tabOk.subs === 4, tabOk);
  mark('tab');
  await G(() => document.querySelector('.bmma [data-m="bmx_ash_warden"]').click()); await sleep(2500);
  const pv = await G(() => ({ cv: !!document.querySelector('.bmma canvas'), st: document.querySelector('.bmma .st')?.textContent, fin: document.querySelector('.bmma .fin')?.textContent }));
  t('моб открыт: превью + итог опубликованного', pv.cv && /Опубликовано/.test(pv.st || '') && !!pv.fin, pv);
  const ink = () => G(() => { const c = document.querySelector('.bmma canvas'); const x = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 3; i < x.length; i += 16) if (x[i] > 0) n++; return n; });
  t('превью рисует (непустой холст)', (await ink()) > 500);
  await shot('01-admin-bmmobs-tab'); mark('open');
  await anim('atk'); await sleep(700); await shot('02-preview-attack-weapon-in-hand'); await sleep(350); await shot('02b-preview-attack-swing');
  await anim('die'); await sleep(900); await shot('03-preview-die'); await anim('all');
  // новый моб → черновик
  fr.length = 0; await G(() => document.querySelector('.bmma [data-new]').click());
  const nw = await waitFr(/"op":"new"/); let nid = null; try { nid = JSON.parse(nw).id; } catch {}
  t('новый моб — черновик bmx_*', /^bmx_/.test(nid || ''), nw?.slice(0, 200)); await sleep(800);
  const setF = async (k, v) => { await G(([k, v]) => { const e = document.querySelector(`.bmma [data-k="${k}"]`); if (!e) return; if (e.type === 'checkbox') e.checked = !!v; else e.value = v; e.dispatchEvent(new Event(e.tagName === 'SELECT' || e.type === 'checkbox' ? 'change' : 'input', { bubbles: true })); }, [k, v]); await sleep(VIDEO ? 420 : 80); };
  await setF('name', 'Пепельный палач'); await setF('lvl', 12);
  fr.length = 0; await G(() => document.querySelector('.bmma [data-x="auto"]').click()); const au = await waitFr(/"op":"auto"/);
  t('«⚖ Авто по уровню» подставил статы', !!au && /"hp":\d/.test(au), au?.slice(0, 200)); await sleep(700);
  const opts = await G(() => Object.fromEntries([...document.querySelectorAll('.bmma select[data-k^="body."], .bmma select[data-k^="weapon."]')].map((s) => [s.dataset.k, [...s.options].map((o) => o.value).filter(Boolean)])));
  for (const k of ['body.torso', 'body.head', 'body.armR', 'body.armL', 'body.legL', 'body.legR', 'body.tail']) if (opts[k]?.length) await setF(k, opts[k][Math.min(2, opts[k].length - 1)]);
  for (const k of Object.keys(opts).filter((k) => k.startsWith('weapon.'))) if (opts[k].length) await setF(k, opts[k][0]);
  await setF('cursed', true); await setF('ench', 6);
  await anim('atk'); await sleep(2400);
  const st1 = await G(() => document.querySelector('.bmma .st')?.textContent);
  const dr = d1(`SELECT id, data FROM game_overrides WHERE kind = 'bmc_mdraft' AND id = '${nid}'`)[0];
  t('черновик сохранился сам (bmc_mdraft в БД)', !!dr && JSON.parse(dr.data).name === 'Пепельный палач' && /Черновик сохранён/.test(st1 || ''), { st1, dr: dr && dr.data.slice(0, 160) });
  t('черновик не попал в игру', await G((id) => !window.__game.debug.mobDef(id), nid));
  await shot('04-new-mob-draft-preview'); mark('draft');
  fr.length = 0; await G(() => document.querySelector('.bmma [data-x="pub"]').click());
  const pub = await waitFr(/"op":"publish"/); t('публикация: ok, новый', !!pub && pub.includes('"ok":true') && pub.includes('"isNew":true'), pub?.slice(0, 200));
  await sleep(1500);
  const ov = d1(`SELECT kind, id FROM game_overrides WHERE id = '${nid}'`);
  t('в БД: bmmob есть, черновик удалён', ov.some((r) => r.kind === 'bmmob') && !ov.some((r) => r.kind === 'bmc_mdraft'), ov);
  const lv0 = await G((id) => window.__game.debug.mobDef(id), nid); t('у клиента — новый вид (black)', !!lv0?.black, lv0 && { name: lv0.name, black: lv0.black });
  await shot('05-new-mob-published'); mark('pub');
  // лагерь чёрных рядом с обычным лагерем
  await G(([x, y]) => window.__game.debug.tp(x, y, true), [Math.round(tgt.x + 150), Math.round(tgt.y + 30)]); await sleep(1500);
  await G(() => document.querySelector('.bmma [data-bs="camps"]').click()); await sleep(900);
  await G(() => document.querySelector('.bmma [data-x="cnew"]').click()); await sleep(400);
  fr.length = 0; await G(() => document.querySelector('.bmma [data-x="here"]').click()); const here = await waitFr(/"op":"here"/); await sleep(400);
  t('«📍 Поставить у меня» — координаты игрока', !!here && /"x":-?\d/.test(here), here?.slice(0, 160));
  const setC = async (k, v) => { await G(([k, v]) => { const e = document.querySelector(`.bmma [data-c="${k}"]`); if (e.type === 'checkbox') e.checked = !!v; else e.value = v; e.dispatchEvent(new Event('change', { bubbles: true })); }, [k, v]); await sleep(VIDEO ? 300 : 50); };
  await setC('name', 'Пепельный лагерь (тест)'); await setC('r', 110); await setC('respawnMin', 20); await setC('respawnMax', 25);
  const addM = async (m, n) => { await G(([m, n]) => { const s = document.querySelector('.bmma .cm'); s.value = m; document.querySelector('.bmma .cn').value = n; document.querySelector('.bmma [data-x="cadd"]').click(); }, [m, n]); await sleep(VIDEO ? 400 : 150); };
  await addM(nid, 2); await addM('bmx_ash_warden', 2); await addM('bmx_ember_archer', 1);
  await G(() => { const s = document.querySelector('.bmma [data-c="chief"]'); s.value = 'bmx_forge_brute'; s.dispatchEvent(new Event('change', { bubbles: true })); }); await sleep(200);
  await shot('06-camp-form');
  fr.length = 0; await G(() => document.querySelector('.bmma [data-x="csave"]').click());
  const sv = await waitFr(/"op":"save"/); t('лагерь сохранён', !!sv && sv.includes('"ok":true'), sv?.slice(0, 300)); mark('camp');
  const isBlack = () => G(() => { return window.__game.debug.zoneMobsFull().filter((m) => window.__game.debug.mobDef(m.type)?.black).map((m) => ({ id: m.id, type: m.type, hp: m.hp, x: Math.round(m.x), y: Math.round(m.y) })); });
  let bm = []; for (let i = 0; i < 20; i++) { bm = await isBlack(); if (bm.length >= 5) break; await sleep(700); }
  t('в мире появились чёрные мобы лагеря (≥5)', bm.length >= 5, bm.slice(0, 3));
  await sleep(2500);
  const lv = await G(() => [...document.querySelectorAll('.bmma [data-live]')].map((e) => e.textContent));
  t('таблица лагерей: живой счётчик «живы N/M»', lv.some((x) => /живы \d+\/\d+/.test(x)), lv);
  await shot('07-camp-table-live');
  // мир: драка чёрных с обычными (игрок рядом)
  await G(() => window.__game.debug.closeAdmin()); await sleep(800);
  // игрок — зритель: в 11 клетках (драка идёт только «на глазах»), но вне агро, иначе мобы бьют игрока, а не друг друга
  { let hr = {}; try { hr = JSON.parse(here || '{}'); } catch {} if (hr.x) { await G(([x, y]) => window.__game.debug.tp(x, y, true), [hr.x - 75, hr.y - 330]); await sleep(1500); } }
  const hp0 = await G(() => { const ms = window.__game.debug.zoneMobsFull(), D = window.__game.debug.mobDef, bl = ms.filter((m) => D(m.type)?.black); if (!bl.length) return {}; const cx = bl.reduce((a, m) => a + m.x, 0) / bl.length, cy = bl.reduce((a, m) => a + m.y, 0) / bl.length; return Object.fromEntries(ms.filter((m) => Math.hypot(m.x - cx, m.y - cy) < 500).map((m) => [m.id, m.hp])); });
  await shot('08-world-black-camp'); mark('world');
  // точные ОЗ чёрных (у клиента — проценты, царапина от слабых обычных их не сдвигает): dev_grant mobInfo
  const rawHp = async () => { const o = {}; for (const ty of ['bmx_ash_warden', 'bmx_ember_archer', 'bmx_forge_brute']) { fr.length = 0; await G((ty) => window.__game.debug.rawSend({ type: 'dev_grant', mobInfo: 1, typeFilter: ty }), ty); const x = await waitFr(/"dev_mob"/, 2500); try { const j = JSON.parse(x); o[j.id] = j.hp; } catch {} } return o; };
  const raw0 = await rawHp();
  let fight = null, seenB = 0, seenN = 0; for (let i = 0; i < 40; i++) { const r = await G((hp0) => { const ms = window.__game.debug.zoneMobsFull(), D = window.__game.debug.mobDef, byId = new Map(ms.map((m) => [m.id, m]));
      const bl = ms.filter((m) => D(m.type)?.black); const cx = bl.length ? bl.reduce((a, m) => a + m.x, 0) / bl.length : 0, cy = bl.length ? bl.reduce((a, m) => a + m.y, 0) / bl.length : 0;
      const blk = bl.filter((m) => m.hp < (hp0[m.id] ?? 100) || m.hp < 100).length;
      const nrm = Object.entries(hp0).filter(([id, h]) => { const m = byId.get(+id); return h != null && (!m ? true : (!D(m.type)?.black && Math.hypot(m.x - cx, m.y - cy) < 700 && m.hp < h)); }).length; // упал в ОЗ или погиб (пропал из зоны)
      return { nrm, blk, nb: bl.length }; }, hp0);
    seenB = Math.max(seenB, r.blk); seenN = Math.max(seenN, r.nrm);
    if (seenN && !seenB && i % 5 === 4) { const r1 = await rawHp(); seenB = Object.keys(raw0).filter((id) => r1[id] == null || r1[id] < raw0[id]).length; }
    if (seenN && seenB) { fight = { ...r, seenN, seenB }; break; } await sleep(1000); }
  t('чёрные дерутся с обычными (обе стороны теряют ОЗ)', !!fight, fight || { seenN, seenB });
  await shot('09-world-fight'); mark('fight'); await sleep(1500); await shot('10-world-fight-2');
  // таймер: ждём павшего чёрного → «следующий через N с»
  // ускорить: всех чёрных лагеря добить (dev_grant killNearAny, только локально) → «разбит · возрождение через N с»
  { const bl = await isBlack(); for (const m of bl) { await G(([x, y]) => window.__game.debug.tp(x, y, true), [m.x + 20, m.y]); await sleep(500); await G((ty) => window.__game.debug.rawSend({ type: 'dev_grant', killNearAny: true, killType: ty }), m.type); await sleep(500); } }
  await G(() => window.__game.debug.openAdmin()); await sleep(800);
  await p.waitForFunction(() => { if (document.querySelector('.bmma [data-live]')) return true; document.querySelector('.mc-admin [data-tab="bmmobs"]')?.click(); setTimeout(() => document.querySelector('.bmma [data-bs="camps"]')?.click(), 400); return false; }, null, { timeout: 15000, polling: 1500 }).catch(() => {});
  let tm = ''; for (let i = 0; i < 45; i++) { tm = await G(() => [...document.querySelectorAll('.bmma [data-live]')].map((e) => e.textContent).join(' | ')); if (/через \d+ с/.test(tm)) break; await sleep(1000); }
  t('таймер возрождения тикает в админке', /через \d+ с/.test(tm), tm);
  await shot('11-camp-respawn-timer'); mark('timer');
  t('без ошибок страницы', errs.length === 0, errs.slice(0, 3));
  fs.writeFileSync(`${OUT}/marks.json`, JSON.stringify(marks.map(([n, t]) => [n, (t - T0) / 1000])));
  console.log(`DONE ok=${ok} bad=${bad}`); await ctx.close(); await b.close(); process.exit(bad ? 1 : 0);
})().catch((e) => { console.log('FAIL crash', e.stack); process.exit(1); });
