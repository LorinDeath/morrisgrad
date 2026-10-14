// Стресс-тест анти-дюпа добычи (Shift-проводка = частые loot_take): залпы и параллельные запросы, двойные клики,
// две вкладки одного аккаунта, полная сумка → освободить слот, обрыв соединения посреди сбора.
// Инвариант: предметов в сумке ровно столько, сколько было в мешках (не больше), uid предметов уникальны, ресурсы сходятся.
// node tools/playtest/loot-dupe.js  (нужен wrangler dev :8787 с MC_DEV_TRUST_USERID=1)
const WebSocket = require('ws');
const URL = 'ws://127.0.0.1:8787';
const UID = `test_dupe_${Date.now()}`;
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else fail++; console.log((c ? 'PASS ' : 'FAIL ') + m); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function conn(name) {
  return new Promise((res, rej) => {
    const ws = new WebSocket(URL); const c = { ws, name, bags: [], waits: [], closed: false, kicked: false, got: 0, msgs: [] };
    c.send = (o) => { if (ws.readyState === 1) ws.send(JSON.stringify(o)); };
    c.wait = (type, pred = () => true, ms = 5000) => new Promise((r2, j2) => { const w = { type, pred, r2 }; c.waits.push(w); setTimeout(() => { const i = c.waits.indexOf(w); if (i >= 0) { c.waits.splice(i, 1); j2(new Error(`${name}: timeout ${type}`)); } }, ms); });
    ws.on('message', (raw) => { let d; try { d = JSON.parse(raw); } catch { return; }
      if (d.type === 'zone_state' && Array.isArray(d.bags)) c.bags = d.bags;
      if (d.type === 'kicked' || d.type === 'session_replaced') c.kicked = true;
      for (const w of [...c.waits]) if (w.type === d.type && w.pred(d)) { c.waits.splice(c.waits.indexOf(w), 1); w.r2(d); } });
    ws.on('close', () => { c.closed = true; });
    ws.on('open', async () => { c.send({ type: 'join', userId: UID, username: 'Dupe', x: 600, y: 640, stats: {} }); try { await c.wait('meta_state', () => true, 15000); res(c); } catch (e) { rej(e); } });
    ws.on('error', rej);
  });
}
const inv = async (c) => { c.send({ type: 'dev_grant', invCount: true }); return c.wait('dev_inv'); };
async function newBag(c, items, res = {}) {
  const before = new Set(c.bags.map((b) => b[0]));
  c.send({ type: 'dev_grant', bag: { items, res } });
  for (let i = 0; i < 40; i++) { await sleep(100); const nb = c.bags.find((b) => !before.has(b[0])); if (nb) { c.send({ type: 'loot_open', bag: nb[0] }); const v = await c.wait('loot_bag', (d) => d.id === nb[0]); return v; } }
  throw new Error('no bag');
}
const ITEMS = ['fly_legs', 'dew_slime_weapon'];
(async () => {
  let A = await conn('A');
  const base = await inv(A);
  let expectItems = base.n;
  // 1) залп: 60 запросов без пауз (по одному lid, «всё», повторы) — сервер обрабатывает по одному, лимит 25/с
  { const v = await newBag(A, Array.from({ length: 12 }, (_, i) => ITEMS[i % 2]), { fly_wing: 5 }); const lids = v.entries.map((e) => e.lid);
    const r0 = (base.res.fly_wing || 0);
    for (let k = 0; k < 60; k++) A.send({ type: 'loot_take', bag: v.id, ...(k % 3 === 0 ? { all: true } : { lids: [lids[k % lids.length], lids[(k * 7) % lids.length]] }) });
    for (let t = 0; t < 10; t++) { await sleep(400); A.send({ type: 'loot_take', bag: v.id, all: true }); }
    await sleep(600); const s = await inv(A); expectItems += 12;
    ok(s.n === expectItems && s.uids === s.n && (s.res.fly_wing || 0) === r0 + 5, `burst ×60 takes: +${s.n - base.n} items (want 12), fly_wing +${(s.res.fly_wing || 0) - r0} (want 5), unique uids ${s.uids}/${s.n}`); }
  // 2) двойной клик: одна позиция дважды подряд и в одном запросе
  { const v = await newBag(A, ['fly_legs', 'fly_legs']); const l = v.entries[0].lid;
    A.send({ type: 'loot_take', bag: v.id, lids: [l] }); A.send({ type: 'loot_take', bag: v.id, lids: [l] }); A.send({ type: 'loot_take', bag: v.id, lids: [l, l, l] });
    await sleep(700); const s = await inv(A); expectItems += 1;
    ok(s.n === expectItems, `double click same slot ×5: +1 (have ${s.n}, want ${expectItems})`);
    A.send({ type: 'loot_take', bag: v.id, all: true }); await sleep(500); expectItems += 1; }
  // 3) две вкладки одного аккаунта: параллельные «забрать всё» и по позициям
  { const v = await newBag(A, Array.from({ length: 8 }, () => 'fly_legs')); const lids = v.entries.map((e) => e.lid);
    let B = null; try { B = await conn('B'); } catch (e) { console.log('B join failed:', e.message); }
    await sleep(800);
    const both = [A, B].filter((c) => c && !c.closed);
    for (let k = 0; k < 20; k++) for (const c of both) c.send({ type: 'loot_take', bag: v.id, ...(k % 2 ? { all: true } : { lids: [lids[k % 8]] }) });
    await sleep(1500); for (const c of both) c.send({ type: 'loot_take', bag: v.id, all: true }); await sleep(800);
    const live = both.find((c) => !c.closed) || await conn('A2'); const s = await inv(live); expectItems += 8;
    ok(s.n === expectItems && s.uids === s.n, `two sessions same account (${both.filter((c) => !c.closed).map((c) => c.name).join('+')} open${A.closed ? ', A replaced' : ''}): +8 exactly (have ${s.n}, want ${expectItems})`);
    if (A.closed) A = live; if (B && B !== A && !B.closed) B.ws.close(); await sleep(300); }
  // 4) полная сумка: ничего не берётся, позиции остаются; освободили 1 слот → ровно 1
  { const s0 = await inv(A); const heroCap = 120; const fillN = Math.max(0, heroCap - s0.n);
    A.send({ type: 'dev_grant', fill: { id: 'fly_legs', n: fillN } }); await sleep(500); const sf = await inv(A); expectItems = sf.n;
    const v = await newBag(A, ['dew_slime_weapon', 'dew_slime_weapon', 'dew_slime_weapon']);
    for (let k = 0; k < 10; k++) A.send({ type: 'loot_take', bag: v.id, all: true }); await sleep(600);
    const s1 = await inv(A);
    A.send({ type: 'loot_open', bag: v.id }); const v1 = await A.wait('loot_bag', (d) => d.id === v.id);
    ok(s1.n === expectItems && v1.entries.length === 3, `inventory full (${sf.n}): took ${s1.n - expectItems}, bag still has ${v1.entries.length}/3`);
    A.send({ type: 'dev_grant', freeSlots: 1 }); await sleep(300);
    for (let k = 0; k < 10; k++) A.send({ type: 'loot_take', bag: v.id, all: true }); await sleep(600);
    const s2 = await inv(A); A.send({ type: 'loot_open', bag: v.id }); const v2 = await A.wait('loot_bag', (d) => d.id === v.id);
    ok(s2.n === expectItems && v2.entries.length === 2 && (s2.cnt.dew_slime_weapon || 0) === (s1.cnt.dew_slime_weapon || 0) + 1, `freed 1 slot → exactly 1 taken (bag ${v2.entries.length}/3 left, dew +${(s2.cnt.dew_slime_weapon || 0) - (s1.cnt.dew_slime_weapon || 0)})`);
    A.send({ type: 'dev_grant', freeSlots: 200 }); await sleep(400); expectItems = (await inv(A)).n;
    for (let k = 0; k < 5; k++) A.send({ type: 'loot_take', bag: v.id, all: true }); await sleep(500); expectItems += 2;
    const s3 = await inv(A); ok(s3.n === expectItems, `after freeing: remaining 2 taken once (have ${s3.n}, want ${expectItems})`); }
  // 5) обрыв посреди сбора: залп и сразу закрыть сокет; переподключиться и добрать
  { const v = await newBag(A, Array.from({ length: 10 }, () => 'fly_legs')); const lids = v.entries.map((e) => e.lid);
    for (let k = 0; k < 10; k++) A.send({ type: 'loot_take', bag: v.id, lids: [lids[k]] }); A.ws.terminate(); await sleep(1500);
    A = await conn('A3'); await sleep(1200);
    for (let k = 0; k < 6; k++) { A.send({ type: 'loot_take', bag: v.id, all: true }); A.send({ type: 'loot_take', bag: v.id, lids }); await sleep(250); }
    await sleep(800); const s = await inv(A); expectItems += 10;
    ok(s.n === expectItems && s.uids === s.n, `reconnect mid-take: total +10 exactly (have ${s.n}, want ${expectItems}), unique uids`); }
  console.log(`${pass} passed, ${fail} failed`); A.ws.close(); process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
