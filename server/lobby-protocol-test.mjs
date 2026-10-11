// Тест лобби/экземпляров забегов (server/runs.ts) против локального `wrangler dev` (ws://127.0.0.1:8787).
// node --experimental-websocket server/lobby-protocol-test.mjs
const URL = process.env.WS || 'ws://127.0.0.1:8787';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0, fail = 0;
const ok = (c, m, x) => { c ? pass++ : fail++; console.log((c ? 'PASS ' : 'FAIL ') + m + (x !== undefined && !c ? ' ' + JSON.stringify(x) : '')); };
function client(name) {
  const ws = new WebSocket(URL);
  const msgs = [];
  ws.onmessage = (e) => msgs.push(JSON.parse(e.data));
  const c = { ws, msgs, name,
    send: (o) => ws.send(JSON.stringify(o)),
    last: (t, f = () => true) => [...msgs].reverse().find((m) => m.type === t && f(m)),
    wait: async (t, f = () => true, ms = 4000) => { const s = Date.now(); while (Date.now() - s < ms) { const m = c.last(t, f); if (m) return m; await sleep(40); } return null; },
    clear: () => { msgs.length = 0; } };
  return new Promise((res) => { ws.onopen = () => { c.send({ type: 'join', username: name, x: 900, y: 320, stats: { classId: null, hp: 1, maxHp: 1, armor: 1, attack: 1 } }); res(c); }; });
}
const A = await client('lobby_A'), B = await client('lobby_B'), C = await client('lobby_C'), D = await client('lobby_D');
const ida = (await A.wait('welcome')).myId, idb = (await B.wait('welcome')).myId, idc = (await C.wait('welcome')).myId, idd = (await D.wait('welcome')).myId;

// --- создание и список ---
A.send({ type: 'lobby_create', room: 'crypt', name: 'Отряд А' });
const ja = await A.wait('run_joined');
ok(ja && ja.runId && ja.state === 'lobby' && ja.epoch === 0, 'lobby_create → run_joined {runId, state lobby, epoch 0}', ja);
C.send({ type: 'lobby_create', room: 'crypt', name: 'Отряд C' });
const jc = await C.wait('run_joined');
ok(jc && jc.runId !== ja.runId, 'second lobby gets a distinct run id');
B.send({ type: 'lobby_list', room: 'crypt' });
const ll = await B.wait('lobby_list');
ok(ll && ll.lobbies.some((l) => l.id === ja.runId && l.state === 'lobby' && l.count === 1 && l.name === 'Отряд А') && ll.lobbies.some((l) => l.id === jc.runId), 'lobby_list shows both open lobbies with count/state/name', ll);
D.send({ type: 'lobby_create', room: 'crypt', name: 'Тайный', isPublic: false });
const jd = await D.wait('run_joined');
B.clear(); B.send({ type: 'lobby_list', room: 'crypt' });
const ll2 = await B.wait('lobby_list');
ok(ll2 && !ll2.lobbies.some((l) => l.id === jd.runId), 'private lobby not listed');
D.send({ type: 'run_leave' }); await D.wait('run_left');

// --- вход, готовность, старт ---
B.send({ type: 'lobby_join', runId: ja.runId });
const jb = await B.wait('run_joined');
ok(jb && jb.runId === ja.runId, 'lobby_join → same instance');
await sleep(200);
A.clear(); B.clear();
A.send({ type: 'lobby_start' });
const te = await A.wait('toast_error');
ok(te && /готов/.test(te.message), 'leader cannot start until everyone is ready', te);
B.send({ type: 'lobby_start' });
const te2 = await B.wait('toast_error');
ok(te2 && /лидер/.test(te2.message), 'non-leader cannot start');
B.send({ type: 'lobby_ready', ready: true });
const rmr = await A.wait('run_members', (m) => m.lobby.members.find((x) => x.id === idb)?.ready);
ok(!!rmr, 'ready state broadcast');
A.send({ type: 'lobby_start' });
const sa = await A.wait('run_start'), sb = await B.wait('run_start');
ok(sa && sb && sa.epoch === 1 && sa.hostId === ida && sa.runId === ja.runId, 'lobby_start → run_start to all, epoch 1, host = leader', sa);
C.clear(); C.send({ type: 'lobby_join', runId: ja.runId });
const te3 = await C.wait('toast_error');
ok(te3 && /идёт/.test(te3.message) && C.last('run_joined', (m) => m.runId === ja.runId) == null, 'join rejected while run in progress (no drop-in)');

// --- изоляция двух лобби ---
C.send({ type: 'lobby_start' }); const cStart = await C.wait('run_start');
C.clear(); B.clear();
A.send({ type: 'run_relay', epoch: 1, data: { k: 'snap', lv: 12 } });
const rb = await B.wait('run_relay');
await sleep(250);
ok(rb && rb.data.lv === 12 && rb.runId === ja.runId, 'relay delivered inside instance');
ok(!C.last('run_relay'), 'relay NOT delivered to the other lobby (isolation)');
const cEpoch = cStart.epoch;
C.send({ type: 'run_relay', epoch: cEpoch, data: { k: 'c' } }); await sleep(250);
ok(!A.last('run_relay') && !B.last('run_relay', (m) => m.data.k === 'c'), 'other lobby relays do not leak into ours');
B.clear();
A.send({ type: 'run_relay', epoch: 0, data: { k: 'stale' } }); await sleep(250);
ok(!B.last('run_relay'), 'relay with stale epoch rejected');

// --- гибель отряда → полный сброс ---
A.clear(); B.clear();
A.send({ type: 'run_dead', epoch: 1, dead: true }); await sleep(200);
ok(!A.last('run_reset'), 'one dead of two → no reset');
B.send({ type: 'run_dead', epoch: 1, dead: true });
const ra = await A.wait('run_reset'), rbb = await B.wait('run_reset');
ok(ra && rbb && ra.reason === 'wipe' && ra.epoch === 2, 'team wipe → run_reset {wipe, epoch 2} to all', ra);
const mm = await A.wait('run_members', (m) => m.epoch === 2);
ok(mm && mm.state === 'lobby' && mm.lobby.members.every((x) => !x.dead), 'after wipe: lobby state, dead cleared');
B.clear();
A.send({ type: 'run_relay', epoch: 1, data: { k: 'snap', lv: 15 } }); await sleep(250);
ok(!B.last('run_relay'), 'old host snapshot (epoch 1) rejected after wipe');
D.clear(); D.send({ type: 'lobby_list', room: 'crypt' });
const ll3 = await D.wait('lobby_list');
ok(ll3.lobbies.find((l) => l.id === ja.runId)?.state === 'lobby', 'wiped instance is joinable again (waiting)');

// --- «Сдаться» ---
B.send({ type: 'lobby_ready', ready: true }); await sleep(150);
A.send({ type: 'lobby_start' });
const s2 = await A.wait('run_start', (m) => m.epoch === 3);
ok(!!s2, 'restart → epoch 3');
A.clear(); B.clear();
A.send({ type: 'run_giveup', epoch: 3 });
const ga = await A.wait('run_gaveup');
const mg = await B.wait('run_members', (m) => m.epoch === 3 && m.hostId === idb);
ok(ga && ga.state === 'running', 'give up while ally alive → back to lobby, run continues');
ok(mg && mg.members.length === 1 && mg.members[0].id === idb && mg.lobby.members.find((x) => x.id === ida)?.out, 'host migrates to remaining player; gave-up player listed as out', mg);
B.clear();
A.send({ type: 'run_relay', epoch: 3, data: { k: 'ghost' } }); await sleep(200);
ok(!B.last('run_relay'), 'gave-up player can no longer relay into the run');
B.send({ type: 'run_giveup', epoch: 3 });
const rw = await A.wait('run_reset', (m) => m.epoch === 4);
ok(rw && rw.reason === 'wipe', 'last alive gives up → wipe → reset (epoch 4)');

// --- опустевший экземпляр → удаление ---
A.send({ type: 'run_leave' }); B.send({ type: 'run_leave' });
await A.wait('run_left'); await B.wait('run_left'); await sleep(200);
D.clear(); D.send({ type: 'lobby_list', room: 'crypt' });
const ll4 = await D.wait('lobby_list');
ok(!ll4.lobbies.some((l) => l.id === ja.runId), 'empty instance deleted (full reset)');
B.clear(); B.send({ type: 'lobby_join', runId: ja.runId });
const te4 = await B.wait('toast_error');
ok(te4 && /не найдено/.test(te4.message), 'cannot rejoin deleted instance');
// разрыв связи последнего участника тоже удаляет экземпляр
C.ws.close(); await sleep(400);
D.clear(); D.send({ type: 'lobby_list', room: 'crypt' });
const ll5 = await D.wait('lobby_list');
ok(!ll5.lobbies.some((l) => l.id === jc.runId), 'disconnect of last member deletes instance');
// новый лобби того же портала — с нуля
A.clear(); A.send({ type: 'lobby_create', room: 'crypt', autoStart: true });
const na = await A.wait('run_start');
ok(na && na.epoch === 1 && na.runId !== ja.runId, 'new lobby on same portal starts fresh (new id, epoch 1)');
// старый клиент: run_join → отдельный экземпляр
D.clear(); D.send({ type: 'run_join', room: 'abyss' });
const dj = await D.wait('run_start');
ok(dj && dj.room === 'abyss' && dj.runId !== na.runId, 'legacy run_join → private instance, auto-started');
const far = await client('lobby_far');
await far.wait('welcome');
far.send({ type: 'lobby_create', room: 'abyss', portalId: 'portal_run_abyss' }); // портал Бездны — в Аринаре, игрок на Поляне
const tf = await far.wait('toast_error');
ok(tf && /ближе/.test(tf.message) && !far.last('run_joined'), 'lobby_create via portal rejected when not near it (server check)');
for (const c of [A, B, D, far]) c.ws.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
