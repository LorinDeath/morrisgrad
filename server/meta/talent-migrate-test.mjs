// E2E перехода на новые деревья (локальный wrangler dev + локальная D1): герой со старым общим деревом (talent_ver = 1)
// при входе получает полный возврат очков, раскладку без закрытых навыков, уведомление, talent_ver = 2 и строку grant_audit.
// Запуск: node --experimental-websocket server/meta/talent-migrate-test.mjs (из server/ рядом с wrangler.json)
import { execFileSync } from 'node:child_process';
const URL = 'ws://127.0.0.1:8787';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? 'PASS ' : 'FAIL ') + m); };
const d1 = (sql) => JSON.parse(execFileSync('npx', ['wrangler', 'd1', 'execute', 'morrisgrad_db', '--local', '--json', '--command', sql], { cwd: process.env.SERVER_DIR || '/workspace/mg-work/server', encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }))[0].results;
function client(uid) {
  const ws = new WebSocket(URL); const msgs = [];
  ws.onmessage = (e) => msgs.push(JSON.parse(e.data));
  const c = { ws, msgs, send: (o) => ws.send(JSON.stringify(o)),
    wait: async (t, ms = 5000, pred = () => true) => { const s = Date.now(); while (Date.now() - s < ms) { const m = [...msgs].reverse().find((mm) => mm.type === t && pred(mm)); if (m) return m; await sleep(40); } return null; } };
  return new Promise((res) => { ws.onopen = () => { c.send({ type: 'join', userId: uid, username: 'mig', x: 600, y: 640, stats: { classId: null, hp: 1, maxHp: 1, armor: 1, attack: 1 } }); res(c); }; });
}
const uid = 'test_tmig_' + Date.now(), pkey = `uid:${uid}`;
let A = await client(uid);
await A.wait('meta_state');
A.send({ type: 'select_class', classId: 'warrior' });
await A.wait('meta_state', 5000, (m) => m.hero?.cls === 'warrior');
A.send({ type: 'dev_grant', xp: 40000 });
const st0 = await A.wait('meta_state', 5000, (m) => m.hero?.lvl > 1);
const lvl = st0.hero.lvl;
A.ws.close(); await sleep(2500);
// «старый» профиль: общее дерево v1 + навык, открытый раньше по уровню
d1(`UPDATE heroes SET talents = '{"warrior.vit":2,"warrior.might":1,"warrior.focus":1}', talent_ver = 1, loadout = '["backstab","shield_wall"]' WHERE pkey = '${pkey}' AND hero = 'warrior'`);
ok(d1(`SELECT talent_ver FROM heroes WHERE pkey = '${pkey}' AND hero = 'warrior'`)[0]?.talent_ver === 1, 'seeded legacy v1 tree row');
A = await client(uid);
await A.wait('meta_state');
A.send({ type: 'select_class', classId: 'warrior' });
const st = await A.wait('meta_state', 6000, (m) => m.hero?.cls === 'warrior');
const notice = A.msgs.find((m) => m.type === 'meta_state' && m.notice);
ok(st && Object.keys(st.hero.talents).length === 0 && st.hero.talentPoints === lvl - 1, `all ${lvl - 1} points available again (refund of 4 spent)`);
ok(st && st.hero.loadout.join() === 'backstab' && !st.hero.unlocked.includes('shield_wall'), 'loadout cleaned: shield_wall now needs its tree node');
ok(notice && /возвращены/.test(notice.notice) && /warrior \+4/.test(notice.notice), 'player notified: ' + (notice && notice.notice));
await sleep(1500);
const row = d1(`SELECT talent_ver, talents, loadout FROM heroes WHERE pkey = '${pkey}' AND hero = 'warrior'`)[0];
ok(row && row.talent_ver === 2 && row.talents === '{}' && row.loadout === '["backstab"]', 'D1 row rewritten: talent_ver 2, talents {}, loadout [backstab]');
const au = d1(`SELECT detail FROM grant_audit WHERE pkey = '${pkey}' AND kind = 'talent_refund'`);
ok(au.length === 1 && JSON.parse(au[0].detail).points === 4, 'grant_audit talent_refund row with old allocation');
A.ws.close(); await sleep(2500);
A = await client(uid); await A.wait('meta_state');
A.send({ type: 'select_class', classId: 'warrior' });
await A.wait('meta_state', 6000, (m) => m.hero?.cls === 'warrior');
ok(!A.msgs.some((m) => m.notice), 'refund happens once (no notice on next login)');
ok(d1(`SELECT COUNT(*) AS n FROM grant_audit WHERE pkey = '${pkey}' AND kind = 'talent_refund'`)[0].n === 1, 'no duplicate refund audit');
A.ws.close();
console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
