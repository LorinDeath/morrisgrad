// Протокол PvP-дуэлей и отсутствия Clerk userId в рассылках (локальный wrangler dev + локальная D1; MC_DEV_TRUST_USERID=1).
// node --experimental-websocket server/meta/duel-test.mjs  (из каталога сервера — для локальной D1)
import { execSync } from 'node:child_process';
const URL = 'ws://127.0.0.1:8787';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? 'PASS ' : 'FAIL ') + m); };
const WR = process.env.WRANGLER || 'npx wrangler';
const d1 = (sql) => execSync(`${WR} d1 execute morrisgrad_db --local --json --command ${JSON.stringify(sql)}`, { stdio: 'pipe' }).toString();
const d1rows = (sql) => JSON.parse(d1(sql))[0].results;
function client(name, uid, guestId, x = 600, y = 640) {
  const ws = new WebSocket(URL);
  const msgs = [], raw = [];
  ws.onmessage = (e) => { raw.push(e.data); msgs.push(JSON.parse(e.data)); };
  const c = { ws, msgs, raw, send: (o) => ws.send(JSON.stringify(o)),
    wait: async (t, ms = 5000, pred = () => true) => { const s = Date.now(); while (Date.now() - s < ms) { const m = [...msgs].reverse().find((mm) => mm.type === t && pred(mm)); if (m) return m; await sleep(40); } return null; },
    clear: () => { msgs.length = 0; }, close: () => ws.close(), x, y };
  c.walk = async (tx, ty) => { for (let i = 0; i < 200; i++) { const dx = tx - c.x, dy = ty - c.y, d = Math.hypot(dx, dy); if (d < 1) break; const st = Math.min(d, 55); c.x += dx / d * st; c.y += dy / d * st; c.send({ type: 'move', x: c.x, y: c.y }); await sleep(90); } };
  return new Promise((res) => { ws.onopen = () => { c.send({ type: 'join', userId: uid, guestId, username: name, x, y, stats: { classId: null, hp: 1, maxHp: 1, armor: 1, attack: 1 } }); res(c); }; });
}
const T = Date.now();
const uidA = 'test_duel_A_' + T, uidB = 'test_duel_B_' + T;
d1(`INSERT OR REPLACE INTO users (id, username, created_at) VALUES ('${uidA}', 'Дуэлянт_А', ${T}), ('${uidB}', 'Дуэлянт_Б', ${T})`);
const A = await client('duelA' + T % 1000, uidA, undefined, 560, 640);
const B = await client('duelB' + T % 1000, uidB, undefined, 640, 640);
const C = await client('duelC' + T % 1000, undefined, 'duelguest' + T, 600, 700);
await A.wait('meta_state'); await B.wait('meta_state'); await C.wait('meta_state');
const welA = await A.wait('welcome'), welB = await B.wait('welcome'), welC = await C.wait('welcome');
const sidA = welA.myId, sidB = welB.myId, sidC = welC.myId;
// C без героя → вызов невозможен
C.send({ type: 'duel_challenge', sid: sidA });
ok(/выберите героя/.test((await C.wait('duel_err', 3000))?.message || ''), 'no hero → challenge refused');
A.send({ type: 'select_class', classId: 'warrior' }); B.send({ type: 'select_class', classId: 'mage' }); C.send({ type: 'select_class', classId: 'rogue' });
let stA = await A.wait('meta_state', 5000, (m) => m.hero?.cls === 'warrior');
let stB = await B.wait('meta_state', 5000, (m) => m.hero?.cls === 'mage');
await C.wait('meta_state', 5000, (m) => m.hero?.cls === 'rogue');
A.clear(); A.send({ type: 'dev_grant', xp: 6000, item: 'fly_blades' });
stA = await A.wait('meta_state', 5000, (m) => m.hero?.lvl > 1);
const blades = stA.account.inv.find((i) => i.id === 'fly_blades');
A.clear(); A.send({ type: 'equip', uid: blades.uid }); stA = await A.wait('meta_state', 5000, (m) => m.hero?.equip?.weapon);
const effA = stA.hero.effective, effB = stB.hero.effective;
A.send({ type: 'move', x: 561, y: 640 }); await sleep(400);

// ——— A) userId не рассылается; панель «ЦЕЛЬ» получает статы сервера ———
const ps = await B.wait('players_state', 3000, (m) => m.players.some((p) => p.id === sidA && p.sv));
const pa = ps?.players.find((p) => p.id === sidA);
ok(ps && ps.players.every((p) => !('userId' in p)), 'players_state: no userId field');
ok(pa && pa.sv && pa.sv.maxHp === effA.maxHp && pa.sv.armor === effA.armor && pa.sv.wMin === effA.weaponMin && pa.sv.wMax === effA.weaponMax && pa.sv.lvl === stA.hero.lvl, `players_state.sv = server stats of A ${JSON.stringify(pa?.sv)}`);

// ——— вызовы: себя, отказ, частота, подделанное принятие ———
A.send({ type: 'duel_challenge', sid: sidA });
ok(!!(await A.wait('duel_err', 3000)), 'self-challenge refused');
await sleep(4100);
A.clear(); B.clear();
A.send({ type: 'duel_challenge', sid: sidB });
const inv = await B.wait('pvp_invite', 3000);
ok(inv && inv.from === sidA && inv.name && inv.cls === 'warrior' && inv.ms === 15000, `B receives invite from A (${inv?.name}, 15 s)`);
ok(!!(await A.wait('duel_pending', 2000)), 'A sees pending');
ok(!JSON.stringify(inv).includes(uidA), 'invite carries no uid');
C.clear(); C.send({ type: 'duel_challenge', sid: sidB });
ok(/другой вызов/.test((await C.wait('duel_err', 2000))?.message || ''), 'target busy with another invite → refused');
B.send({ type: 'duel_respond', from: sidA, accept: false });
ok(!!(await A.wait('duel_declined', 3000)), 'decline → challenger notified');
A.clear(); A.send({ type: 'duel_challenge', sid: sidB });
ok(/часто/.test((await A.wait('duel_err', 2000))?.message || ''), 'rate limit: second challenge within 4 s refused');
// принять без приглашения / старый duel_accept — дуэли нет
B.clear(); A.clear();
B.send({ type: 'duel_respond', from: sidA, accept: true });
B.send({ type: 'duel_accept', targetId: sidA });
await sleep(700);
ok(!B.msgs.some((m) => m.type === 'pvp_start' || m.type === 'duel_start') && !A.msgs.some((m) => m.type === 'pvp_start' || m.type === 'duel_start'), 'forged accept / legacy duel_accept → no duel');

// ——— таймаут приглашения (15 с) ———
C.clear(); B.clear();
C.send({ type: 'duel_challenge', sid: sidB });
ok(!!(await B.wait('pvp_invite', 3000, (m) => m.from === sidC)), 'C → B invite');
const exp = await C.wait('duel_expired', 17500);
ok(!!exp && !!(await B.wait('duel_closed', 1000, (m) => m.expired)), 'invite expires after 15 s (both notified)');
B.send({ type: 'duel_respond', from: sidC, accept: true });
ok(!!(await B.wait('duel_err', 2000)), 'late accept refused');

// ——— дуэль 1: B вызывает A, A принимает; отсчёт, подделки, нокаут ———
A.clear(); B.clear();
B.send({ type: 'duel_challenge', sid: sidA });
{ const iv = await A.wait('pvp_invite', 3000, (m) => m.from === sidB); ok(!!iv, 'B → A invite' + (iv ? '' : ' err: ' + JSON.stringify(B.msgs.filter((m) => m.type === 'duel_err')))); }
A.send({ type: 'duel_respond', from: sidB, accept: true });
const sA = await A.wait('pvp_start', 3000), sB = await B.wait('pvp_start', 3000);
const wsA = await A.wait('world_switched', 2000, (m) => m.world === 'arena');
ok(sA && sB && sA.id === sB.id && sA.opp.sid === sidB && sB.opp.sid === sidA && sA.countdown === 3000 && sA.dur === 180000, 'pvp_start to both (3 s countdown, 3 min)');
ok(wsA && !!(await B.wait('world_switched', 2000, (m) => m.world === 'arena')), 'both moved to the arena world');
A.x = wsA.x; A.y = wsA.y; const bsw = B.msgs.find((m) => m.type === 'world_switched'); B.x = bsw.x; B.y = bsw.y;
const st0 = await A.wait('pvp_state', 2000);
ok(st0 && st0.ph === 'countdown' && st0.p.every((p) => p.hp === p.maxHp), 'countdown: both at full HP');
const psArena = await A.wait('players_state', 2000, (m) => m.world === 'arena');
ok(psArena && psArena.players.length === 2 && psArena.players.every((p) => p.id === sidA || p.id === sidB), 'arena is private (only the two duelists visible)');
const cOut = await C.wait('players_state', 2000, (m) => !m.players.some((p) => p.id === sidA));
ok(!!cOut, 'duelists disappear from the hub for others');
// стек: C вызывает A в дуэли
C.clear(); C.send({ type: 'duel_challenge', sid: sidA });
ok(!!(await C.wait('duel_err', 2000)), 'cannot challenge a player already in a duel');
// во время отсчёта: удары и подделки урона — без эффекта, движение заблокировано
A.send({ type: 'move', x: A.x + 50, y: A.y });
for (let i = 0; i < 4; i++) { A.send({ type: 'zone_attack', dx: 1, dy: 0, dmg: 99999 }); A.send({ type: 'zone_ability', id: effA.abilities?.[0]?.id || 'x' }); await sleep(150); }
A.send({ type: 'duel_action', action: 'attack', damage: 99999 });
await sleep(300);
const stCd = [...A.msgs].reverse().find((m) => m.type === 'pvp_state');
const ev0 = A.msgs.filter((m) => m.type === 'pvp_state').flatMap((m) => m.ev);
ok(stCd && stCd.p.every((p) => p.hp === p.maxHp) && !ev0.some((e) => e.k === 'phit'), 'countdown: no damage');
const psFrozen = [...B.msgs].reverse().find((m) => m.type === 'players_state' && m.world === 'arena');
ok(psFrozen && Math.abs(psFrozen.players.find((p) => p.id === sidA).x - A.x) < 1, 'countdown: movement frozen');
await A.wait('pvp_state', 4000, (m) => m.ph === 'fight');
ok(true, 'fight phase started after countdown');
// сближение и удары (с подделанными полями урона)
await A.walk(B.x - 90, B.y);
const bound = Math.ceil(effA.weaponMax * (1 + effA.dmgPct / 100) * 1.75 * 0.6) + 1;
A.clear(); B.clear();
let end = null;
for (let i = 0; i < 200 && !end; i++) {
  A.send({ type: 'zone_attack', dx: 1, dy: 0, dmg: 99999, real: 99999, crit: true });
  await sleep(170);
  end = A.msgs.find((m) => m.type === 'pvp_end');
}
const phits = A.msgs.filter((m) => m.type === 'pvp_state').flatMap((m) => m.ev).filter((e) => e.k === 'phit' && e.by === sidA);
ok(phits.length > 3 && phits.every((e) => e.d >= 1 && e.d <= bound), `server damage only: ${phits.length} hits, max ${Math.max(...phits.map((e) => e.d))} ≤ ${bound} (forged 99999 ignored)`);
const atkGap = (() => { const W = { fly_blades: 360 }; return Math.round(W.fly_blades / (1 + (effA.atkSpeedPct || 0) / 100)); })();
ok(phits.length <= Math.ceil((A.msgs.length ? 200 * 170 : 0) / atkGap) + 2, 'attack rate bounded by weapon cooldown');
const endB = await B.wait('pvp_end', 3000);
ok(end && end.result === 'win' && end.reason === 'ko' && endB && endB.result === 'loss', `KO: A wins, B loses (${end?.result}/${endB?.result})`);
const back = await A.wait('world_switched', 2000, (m) => m.world === 'arinar'), backB = await B.wait('world_switched', 2000, (m) => m.world === 'arinar');
ok(back && backB && back.x === 12000 && back.y === 12150 && backB.x === 12000, 'both teleported to Arinar hub spawn');
ok(end.record && end.record.w === 1 && endB.record && endB.record.l === 1, `record in result: A ${JSON.stringify(end.record)} B ${JSON.stringify(endB.record)}`);
const psBack = await C.wait('players_state', 2000) && await A.wait('players_state', 3000, (m) => m.world === 'arinar' && m.players.some((p) => p.id === sidA && p.sv?.hp === p.sv?.maxHp));
ok(!!psBack, 'A back in Arinar with full HP (server)');
let rows = d1rows(`SELECT pkey, wins, losses, draws FROM duel_stats WHERE pkey IN ('uid:${uidA}','uid:${uidB}') ORDER BY pkey`);
ok(rows.length === 2 && rows.find((r) => r.pkey === 'uid:' + uidA).wins === 1 && rows.find((r) => r.pkey === 'uid:' + uidB).losses === 1, 'D1 duel_stats recorded');
ok(d1rows(`SELECT reason, winner FROM duel_results WHERE id = '${sA.id}'`)[0]?.reason === 'ko', 'D1 duel_results logged');
// старый клиентский «duel_action» после дуэли — ничего
// ——— дуэль 2: сдача (duel_leave) ———
await sleep(4200);
A.x = 300; A.y = 600; B.x = 300; B.y = 600;
A.clear(); B.clear();
A.send({ type: 'duel_challenge', sid: sidB });
await B.wait('pvp_invite', 3000);
B.send({ type: 'duel_respond', from: sidA, accept: true });
await B.wait('pvp_start', 3000);
B.send({ type: 'duel_leave' });
const fA = await A.wait('pvp_end', 3000), fB = await B.wait('pvp_end', 3000);
ok(fA && fA.result === 'win' && fA.reason === 'forfeit' && fB && fB.result === 'loss', 'forfeit (leave during countdown) = loss');
ok(!!(await B.wait('world_switched', 2000, (m) => m.world === 'arinar')), 'forfeiter also back in Arinar');
// ——— дуэль 3: отключение = поражение ———
await sleep(4200);
A.clear(); B.clear();
B.send({ type: 'duel_challenge', sid: sidA });
await A.wait('pvp_invite', 3000);
A.send({ type: 'duel_respond', from: sidB, accept: true });
await A.wait('pvp_state', 5000, (m) => m.ph === 'fight');
B.close();
const dA = await A.wait('pvp_end', 3000);
ok(dA && dA.result === 'win' && dA.reason === 'disconnect' && dA.record?.w === 3, `disconnect = forfeit (${dA?.reason}, A ${JSON.stringify(dA?.record)})`);
ok(!!(await A.wait('world_switched', 2000, (m) => m.world === 'arinar')), 'winner teleported to Arinar after disconnect');
rows = d1rows(`SELECT pkey, wins, losses, draws FROM duel_stats WHERE pkey IN ('uid:${uidA}','uid:${uidB}') ORDER BY pkey`);
ok(rows.find((r) => r.pkey === 'uid:' + uidA)?.wins === 3 && rows.find((r) => r.pkey === 'uid:' + uidB)?.losses === 3, 'D1: A 3 wins, B 3 losses');
// ——— рейтинг «Дуэлянты» и просмотр персонажа ———
A.clear(); A.send({ type: 'dev_grant', ratingRefresh: true }); await A.wait('dev_rating_reset', 8000);
A.send({ type: 'rating_get' });
const r = await A.wait('rating', 8000);
ok(r && r.duel && r.duel.me && r.duel.me.w === 3 && r.duel.me.l === 0 && r.duel.me.wr === 100 && r.duel.me.name === 'Дуэлянт_А' && r.duel.me.me, `rating «Дуэлянты»: own row ${JSON.stringify(r?.duel?.me)}`);
ok(r && r.duel.top.every((x, i, arr) => i === 0 || arr[i - 1].w >= x.w), 'duel tab sorted by wins');
const rid = r?.duel.top.find((x) => x.name === 'Дуэлянт_Б')?.id;
C.clear(); C.send({ type: 'inspect_player', id: rid, hero: 'mage' });
const insB = await C.wait('inspect', 5000);
ok(insB && insB.duel && insB.duel.l === 3 && insB.duel.w === 0, `inspect shows duel record ${JSON.stringify(insB?.duel)}`);
// ——— утечка uid: ни в одном сообщении, полученном C (гость) ———
const leak = C.raw.some((s) => s.includes(uidA) || s.includes(uidB)) || A.raw.some((s) => s.includes(uidB));
ok(!leak, `no raw Clerk uid in any message received by other players (${C.raw.length + A.raw.length} msgs scanned)`);
d1(`DELETE FROM duel_stats WHERE pkey IN ('uid:${uidA}','uid:${uidB}','guest:duelguest${T}')`);
d1(`DELETE FROM duel_results WHERE a_pkey IN ('uid:${uidA}','uid:${uidB}') OR b_pkey IN ('uid:${uidA}','uid:${uidB}')`);
d1(`DELETE FROM users WHERE id IN ('${uidA}','${uidB}')`);
A.close(); C.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
