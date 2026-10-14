// Протокол рейтинга и просмотра персонажа (локальный wrangler dev + локальная D1; MC_DEV_TRUST_USERID=1).
// node server/meta/rating-test.mjs  (из каталога, где лежит wrangler.json сервера, — для локальной D1)
import { execSync } from 'node:child_process';
const URL = 'ws://127.0.0.1:8787';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? 'PASS ' : 'FAIL ') + m); };
const WR = process.env.WRANGLER || 'npx wrangler';
const d1 = (sql) => execSync(`${WR} d1 execute morrisgrad_db --local --command ${JSON.stringify(sql)}`, { stdio: 'pipe' }).toString();
function client(name, uid, guestId, x = 600, y = 640) {
  const ws = new WebSocket(URL);
  const msgs = [];
  ws.onmessage = (e) => msgs.push(JSON.parse(e.data));
  const c = { ws, msgs, send: (o) => ws.send(JSON.stringify(o)),
    wait: async (t, ms = 5000, pred = () => true) => { const s = Date.now(); while (Date.now() - s < ms) { const m = [...msgs].reverse().find((mm) => mm.type === t && pred(mm)); if (m) return m; await sleep(40); } return null; },
    clear: () => { msgs.length = 0; }, close: () => ws.close(), x, y };
  c.walk = async (tx, ty) => { for (let i = 0; i < 200; i++) { const dx = tx - c.x, dy = ty - c.y, d = Math.hypot(dx, dy); if (d < 1) break; const st = Math.min(d, 55); c.x += dx / d * st; c.y += dy / d * st; c.send({ type: 'move', x: c.x, y: c.y }); await sleep(90); } };
  return new Promise((res) => { ws.onopen = () => { c.send({ type: 'join', userId: uid, guestId, username: name, x, y, stats: { classId: null, hp: 1, maxHp: 1, armor: 1, attack: 1 } }); res(c); }; });
}
const T = Date.now();
const uidA = 'test_rate_A_' + T;
const fakeN = 105;
d1(`INSERT OR REPLACE INTO users (id, username, created_at) VALUES ('${uidA}', 'Рейтинговый_А', ${T})`);
const A = await client('nickA', uidA);
const B = await client('nickB', undefined, 'ratingguest' + T);
let st = await A.wait('meta_state'); await B.wait('meta_state');
const welA = await A.wait('welcome');
A.send({ type: 'select_class', classId: 'warrior' }); B.send({ type: 'select_class', classId: 'mage' });
st = await A.wait('meta_state', 5000, (m) => m.hero?.cls === 'warrior'); await B.wait('meta_state', 5000, (m) => m.hero?.cls === 'mage');
A.clear(); A.send({ type: 'dev_grant', xp: 9000, item: 'fly_blades' });
st = await A.wait('meta_state', 5000, (m) => m.hero?.lvl > 1);
const blades = st?.account.inv.find((i) => i.id === 'fly_blades');
A.clear(); A.send({ type: 'equip', uid: blades?.uid }); st = await A.wait('meta_state', 5000, (m) => m.hero?.equip?.weapon);
const eff = st.hero.effective;
ok(st.hero.lvl >= 3 && st.hero.equip.weapon, `A: warrior lvl ${st.hero.lvl} with fly blades`);
// бьём моба на Поляне (удар считает сервер); заодно пытаемся подделать урон в сообщениях
const zs = await A.wait('zone_state', 4000, (m) => m.w === 'hellfire');
let fi = 0; for (let j = 0; j < zs.m.length; j += 6) if (zs.m[j + 2] > 480 && zs.m[j + 2] < 800 && zs.m[j + 3] < 220) { fi = j; break; }
const flyId = zs.m[fi];
await A.walk(zs.m[fi + 2], zs.m[fi + 3] + 60); await sleep(200);
const hits = [];
for (let i = 0; i < 14; i++) {
  const z = [...A.msgs].reverse().find((m) => m.type === 'zone_state');
  let mob = null; if (z) for (let j = 0; j < z.m.length; j += 6) if (z.m[j] === flyId) mob = z.m.slice(j, j + 6);
  if (mob) { A.send({ type: 'move', x: mob[2], y: mob[3] + 50 }); await sleep(60); }
  A.send({ type: 'zone_attack', dx: 0, dy: -1, dmg: 999999, real: 999999, crit: true, maxDmg: 999999 });
  await sleep(600);
}
for (const m of A.msgs) if (m.type === 'zone_state' && m.ev) for (const e of m.ev) if (e.k === 'hit') hits.push(e.d);
A.send({ type: 'run_result', time: 30, kills: { imp: 3 }, maxDmg: 999999, maxHit: 999999 });
A.send({ type: 'rating_set', max_dmg: 999999 }); A.send({ type: 'meta_set', hero: { md: 999999 } });
await sleep(400);
// поддельные игроки выше уровнем: свой ряд вне топ-100 всё равно показывается
d1(`INSERT INTO heroes (pkey, hero, lvl, xp, talents, abil, loadout, updated_at, rev) VALUES ${Array.from({ length: fakeN }, (_, i) => `('guest:ratingfake${T}x${i}', 'rogue', 40, ${i}, '{}', '{}', '[]', ${T}, 1)`).join(',')}`);
A.clear(); A.send({ type: 'dev_grant', ratingRefresh: true }); await A.wait('dev_rating_reset', 8000);
A.send({ type: 'rating_get' });
let r = await A.wait('rating', 8000);
ok(r && r.level.top.length === 100 && r.level.top[0].r === 1, `rating: level top-100 (${r?.level.top.length} rows, total ${r?.total.level})`);
ok(r && r.level.me && r.level.me.r > 100 && r.level.me.name === 'Рейтинговый_А' && r.level.me.hero === 'warrior' && r.level.me.lvl === st.hero.lvl && r.level.me.me, `own place shown outside top-100: #${r?.level.me?.r} ${JSON.stringify(r?.level.me)}`);
ok(r && r.level.top.every((x, i, arr) => i === 0 || arr[i - 1].lvl > x.lvl || (arr[i - 1].lvl === x.lvl && arr[i - 1].xp >= x.xp)), 'level tab sorted by level, tie-break XP');
ok(r && r.level.top.some((x) => /^«Гость» [А-ЯЁ][а-яё]{3}$/.test(x.name)), 'guests shown as «Гость» Имя');
const raw = JSON.stringify(r || {});
ok(!raw.includes(uidA) && !raw.includes('uid:') && !raw.includes('guest:') && !raw.includes('ratingguest') && !raw.includes('ratingfake'), 'rating JSON has no profile keys / uids / guest ids');
const maxHit = Math.max(0, ...hits);
const bound = Math.ceil((eff.weaponMax) * (1 + eff.dmgPct / 100) * 1.75) + 1;
ok(r && r.dmg.me && r.dmg.me.v > 0 && r.dmg.me.v <= bound && r.dmg.me.v !== 999999, `max damage recorded by server: ${r?.dmg.me?.v} (server hits max ${maxHit}, bound ${bound}), forged 999999 ignored`);
ok(r && r.dmg.me && r.dmg.me.v === maxHit && /^hellfire:/.test(r.dmg.me.where) && r.dmg.me.hero === 'warrior', `damage row: hero + where (${r?.dmg.me?.where})`);
// частота: повторный rating_get сразу — отказ
A.clear(); A.send({ type: 'rating_get' });
ok(!!(await A.wait('rating_err', 2000)), 'rating_get rate-limited (2 s)');
// просмотр персонажа: B кликает A (sid сессии)
B.clear(); B.send({ type: 'inspect_player', sid: welA.myId });
let ins = await B.wait('inspect', 5000);
ok(ins && ins.name === 'Рейтинговый_А' && ins.cls === 'warrior' && ins.lvl === st.hero.lvl, `inspect by sid: ${ins?.name} ${ins?.cls} lvl ${ins?.lvl}`);
ok(ins && ins.gear.length === 1 && ins.gear[0].id === 'fly_blades' && ins.gear[0].stats && typeof ins.gear[0].n === 'number', 'inspect: equipped gear with icon index + stats');
ok(ins && ins.stats.maxHp === eff.maxHp && ins.stats.armor === eff.armor && ins.stats.wMax === eff.weaponMax && ins.stats.critPct === eff.critPct, 'inspect: final params = server effective stats');
ok(ins && Array.isArray(ins.abilities) && ins.abilities.length >= 1 && ins.abilities.every((x) => x.id && 'rad' in x), 'inspect: loadout skills with radiance ' + JSON.stringify(ins?.abilities));
const insRaw = JSON.stringify(ins || {});
ok(ins && !('talents' in ins) && !('inv' in ins) && !('account' in ins) && !insRaw.includes(uidA) && !insRaw.includes('uid:') && !insRaw.includes(blades.uid) && !insRaw.includes('quests') && !insRaw.includes('"res"'), 'inspect: no talents / bag / item instance ids / quests / uid');
// просмотр из рейтинга (непрозрачный id) — в т. ч. игрока вне сети (поддельный ряд из D1)
await sleep(800);
B.clear(); B.send({ type: 'inspect_player', id: r.level.me.id, hero: 'warrior' });
ins = await B.wait('inspect', 5000);
ok(ins && ins.name === 'Рейтинговый_А' && ins.cls === 'warrior', 'inspect by rating id (online player)');
await sleep(800);
B.clear(); B.send({ type: 'inspect_player', id: r.level.top[0].id, hero: r.level.top[0].hero });
ins = await B.wait('inspect', 5000);
ok(ins && /^«Гость» /.test(ins.name) && ins.lvl === 40 && ins.stats, 'inspect offline player from D1 (read-only) ' + JSON.stringify(ins && { n: ins.name, l: ins.lvl }));
await sleep(800);
B.clear(); B.send({ type: 'inspect_player', id: 'nonexistent123' });
ok(!!(await B.wait('inspect_err', 3000)), 'unknown id → inspect_err');
// частота просмотра
await sleep(800);
B.clear(); for (let i = 0; i < 5; i++) B.send({ type: 'inspect_player', sid: welA.myId });
await sleep(1500);
const nOk = B.msgs.filter((m) => m.type === 'inspect').length, nErr = B.msgs.filter((m) => m.type === 'inspect_err').length;
ok(nOk === 1 && nErr === 4, `inspect rate-limited: ${nOk} ok, ${nErr} refused of 5 burst`);
// уборка поддельных строк
d1(`DELETE FROM heroes WHERE pkey LIKE 'guest:ratingfake${T}x%'`);
A.close(); B.close();
console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
