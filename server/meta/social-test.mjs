// Друзья, онлайн, настройки дуэлей (все/друзья/никто), «Не беспокоить 5 мин» на аккаунт, гостевые имена,
// отсутствие вытеснения гостей, у каждого героя своя сумка (без дубля надетого → выгрузка D1 не падает), «Сохранить сейчас».
// node --experimental-websocket server/meta/social-test.mjs  (из каталога server; локальный wrangler dev, MC_DEV_TRUST_USERID=1)
import { execSync } from 'node:child_process';
const URL = 'ws://127.0.0.1:8787';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? 'PASS ' : 'FAIL ') + m); };
const WR = process.env.WRANGLER || '../node_modules/.bin/wrangler';
const d1rows = (sql) => JSON.parse(execSync(`${WR} d1 execute morrisgrad_db --local --json --command ${JSON.stringify(sql)}`, { stdio: 'pipe' }).toString())[0].results;
function client(name, uid, guestId, x = 565, y = 600) {
  const ws = new WebSocket(URL);
  const msgs = [];
  ws.onmessage = (e) => msgs.push(JSON.parse(e.data));
  const c = { ws, msgs, send: (o) => ws.send(JSON.stringify(o)), closed: false,
    wait: async (t, ms = 5000, pred = () => true) => { const s = Date.now(); while (Date.now() - s < ms) { const m = [...msgs].reverse().find((mm) => mm.type === t && pred(mm)); if (m) return m; await sleep(40); } return null; },
    clear: () => { msgs.length = 0; }, close: () => ws.close() };
  ws.onclose = () => { c.closed = true; };
  return new Promise((res) => { ws.onopen = () => { c.send({ type: 'join', userId: uid, guestId, username: name, x, y }); res(c); }; });
}
const T = Date.now();
const uA = 'soc_A_' + T, uB = 'soc_B_' + T;
// два гостя с одинаковым ником «Странник» не выбивают друг друга
const G1 = await client('Странник', undefined, 'socguestone' + T);
const G2 = await client('Странник', undefined, 'socguesttwo' + T);
const A = await client('socA', uA), B = await client('socB', uB);
for (const c of [G1, G2, A, B]) await c.wait('meta_state', 8000);
await sleep(500);
ok(!G1.closed && !G2.closed && !G1.msgs.some((m) => m.type === 'kicked'), 'guests named «Странник» do not kick each other');
const gn1 = await G1.wait('guest_name'), gn2 = await G2.wait('guest_name');
ok(/^«Гость» [А-ЯЁ][а-яё]{3}$/.test(gn1?.name || ''), `guest name format: ${gn1?.name}`);
ok(/^«Гость» /.test(gn2?.name || ''), 'second guest named too');
// повторный вход того же гостя (та же вкладка/браузер) — старая сессия вытесняется
const G1b = await client('Странник', undefined, 'socguestone' + T);
await G1b.wait('meta_state', 8000);
const gn1b = await G1b.wait('guest_name');
ok(gn1b?.name === gn1?.name, 'guest name is persistent for the same guestId');
await sleep(300);
ok(G1.closed || G1.msgs.some((m) => m.type === 'kicked'), 'same guestId re-join replaces old tab');

const sid = {};
for (const [k, c] of Object.entries({ A, B, G2 })) sid[k] = (await c.wait('welcome')).myId;
for (const c of [A, B, G2]) c.send({ type: 'select_class', classId: 'warrior' });
for (const c of [A, B, G2]) await c.wait('meta_state', 5000, (m) => m.hero?.cls === 'warrior');

// онлайн
A.send({ type: 'online_get' });
const on = await A.wait('online');
ok(on && on.n >= 4 && on.list.some((p) => p.sid === sid.B) && on.list.some((p) => p.me), `online list n=${on?.n}`);
ok(on && !JSON.stringify(on).includes('uid:') && !JSON.stringify(on).includes(uA), 'online list leaks no pkeys/uids');

// заявка в друзья A → B, принятие
A.send({ type: 'friend_add', sid: sid.B });
const fr = await B.wait('friend_request');
ok(!!fr, 'B gets friend request');
B.send({ type: 'friends_get' });
const fb = await B.wait('friends', 5000, (m) => m.incoming.length > 0);
ok(fb?.incoming?.length === 1, 'B sees incoming request');
B.send({ type: 'friend_respond', id: fb.incoming[0].id, accept: true });
const fa = await A.wait('friends', 5000, (m) => m.friends.length === 1);
ok(fa?.friends?.[0]?.online && fa.friends[0].sid === sid.B, 'A sees B as online friend');
ok(d1rows(`SELECT COUNT(*) n FROM friendships WHERE pkey='uid:${uA}'`)[0].n === 1, 'friendship persisted in D1');

// настройки дуэлей B: только друзья → гость не может, друг A может
B.send({ type: 'settings_set', duel: 'friends' });
await B.wait('settings', 5000, (m) => m.settings.duel === 'friends');
G2.send({ type: 'duel_challenge', sid: sid.B });
ok(/только от друзей/.test((await G2.wait('duel_err', 3000))?.message || ''), 'friends-only: stranger refused (server)');
A.send({ type: 'duel_challenge', sid: sid.B });
const inv = await B.wait('pvp_invite', 3000);
ok(!!inv, 'friends-only: friend can challenge');
// «Не беспокоить 5 минут» прямо из окна вызова
B.send({ type: 'duel_respond', from: inv.from, accept: false, dnd: true });
const st = await B.wait('settings', 5000, (m) => m.settings.dnd > 0);
ok(st && st.settings.dnd > 290000, 'DND set for ~5 min');
await A.wait('duel_declined', 3000);
ok(d1rows(`SELECT dnd_until FROM player_settings WHERE pkey='uid:${uB}'`)[0].dnd_until > Date.now(), 'DND persisted on account');
await sleep(4200);
A.clear(); A.send({ type: 'duel_challenge', sid: sid.B });
ok(/не беспокоить/.test((await A.wait('duel_err', 3000))?.message || ''), 'DND blocks challenges');
// DND — на весь аккаунт: вторая вкладка B (другой герой) тоже недоступна
B.send({ type: 'settings_set', dnd: false, duel: 'none' });
await B.wait('settings', 5000, (m) => m.settings.duel === 'none' && !m.settings.dnd);
await sleep(4200);
A.clear(); A.send({ type: 'duel_challenge', sid: sid.B });
ok(/не принимает/.test((await A.wait('duel_err', 3000))?.message || ''), 'duel=none blocks challenges');
B.send({ type: 'settings_set', duel: 'all' }); await B.wait('settings', 5000, (m) => m.settings.duel === 'all');

// просмотр профиля по id из списка друзей
A.send({ type: 'inspect_player', id: fa.friends[0].id });
const ins = await A.wait('inspect', 4000);
ok(ins?.cls === 'warrior', 'inspect friend by opaque id');

// сумки по героям: предмет воина не виден магу и не надевается им; дубль-надевание невозможно
A.clear(); A.send({ type: 'dev_grant', item: 'fly_legs', xp: 3000 });
let sa = await A.wait('meta_state', 5000, (m) => m.account.inv.some((i) => i.id === 'fly_legs'));
const legs = sa.account.inv.find((i) => i.id === 'fly_legs');
A.clear(); A.send({ type: 'equip', uid: legs.uid });
sa = await A.wait('meta_state', 5000, (m) => m.hero?.equip?.legs === legs.uid);
ok(!!sa, 'warrior equips own legs');
A.clear(); A.send({ type: 'select_class', classId: 'mage' });
sa = await A.wait('meta_state', 5000, (m) => m.hero?.cls === 'mage');
ok(sa && !sa.account.inv.some((i) => i.uid === legs.uid), "mage's bag does not contain warrior's item");
A.clear(); A.send({ type: 'equip', uid: legs.uid });
ok(/другого героя/.test((await A.wait('toast_error', 3000))?.message || ''), 'mage cannot equip warrior item (server)');
await sleep(800);
const eq = d1rows(`SELECT hero, slot FROM hero_equipment WHERE pkey='uid:${uA}'`);
ok(eq.length === 1 && eq[0].hero === 'warrior', 'D1: legs equipped only on warrior (soul change flushed immediately)');
ok(d1rows(`SELECT hero FROM item_instances WHERE instance_id='${legs.uid}'`)[0].hero === 'warrior', 'D1: item owned by warrior');
// «Сохранить сейчас» у алтаря
A.clear(); A.send({ type: 'save_now' });
const sv = await A.wait('saved', 5000);
ok(sv?.ok, 'save_now at altar → saved ok');
const lv = d1rows(`SELECT hero, lvl FROM heroes WHERE pkey='uid:${uA}' AND hero='warrior'`)[0];
ok(lv?.lvl > 1, `D1 warrior progress kept after switching (lvl ${lv?.lvl})`);

for (const c of [G1, G2, G1b, A, B]) c.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
