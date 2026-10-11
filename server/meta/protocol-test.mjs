const URL = 'ws://127.0.0.1:8787';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? 'PASS ' : 'FAIL ') + m); };
function client(name, uid, x = 600, y = 640) {
  const ws = new WebSocket(URL);
  const msgs = [];
  ws.onmessage = (e) => msgs.push(JSON.parse(e.data));
  const c = { ws, msgs, send: (o) => ws.send(JSON.stringify(o)),
    last: (t) => [...msgs].reverse().find((m) => m.type === t),
    wait: async (t, ms = 4000, pred = () => true) => { const s = Date.now(); while (Date.now() - s < ms) { const m = [...msgs].reverse().find((mm) => mm.type === t && pred(mm)); if (m) return m; await sleep(40); } return null; },
    clear: () => { msgs.length = 0; }, close: () => ws.close() };
  return new Promise((res) => { ws.onopen = () => { c.send({ type: 'join', userId: uid, username: name, x, y, stats: { classId: null, hp: 1, maxHp: 1, armor: 1, attack: 1 } }); res(c); }; });
}
const uid = 'test_meta_' + Date.now();
let A = await client('meta_A', uid);
let st = await A.wait('meta_state');
ok(st && st.verified === true && st.account.quests.active.p1_swarm, 'meta_state on join (dev-trusted uid, prologue quest auto-active)');
// hub mobs (prologue swarm) visible via zone_state in hellfire
A.send({ type: 'select_class', classId: 'spearman' });
st = await A.wait('meta_state', 4000, (m) => m.hero?.cls === 'spearman');
ok(st && st.hero.lvl === 1 && st.hero.loadout[0] === 'pierce', 'select hero at altar → per-hero profile (lvl1, legacy skill pierce in loadout)');
const zs = await A.wait('zone_state', 3000, (m) => m.w === 'hellfire');
ok(zs && zs.m.length >= 6, 'hub zone_state: Мошкара-Жнец visible (AOI) count=' + (zs ? zs.m.length / 6 : 0));
// kill a fly: teleport near and attack until dead
const flyId = zs.m[0], fx = zs.m[2], fy = zs.m[3];
A.send({ type: 'move', x: fx, y: fy + 60 }); await sleep(200);
A.clear();
for (let i = 0; i < 40; i++) { const z = A.last('zone_state'); let mob = null; if (z) for (let j = 0; j < z.m.length; j += 6) if (z.m[j] === flyId) { mob = z.m.slice(j, j + 6); } if (z && !mob && i > 2) break; if (mob) { A.send({ type: 'move', x: mob[2], y: mob[3] + 50 }); await sleep(60); A.send({ type: 'zone_attack', dx: 0, dy: -1 }); } await sleep(560); }
const loot = await A.wait('meta_state', 3000, (m) => m.loot);
ok(loot && loot.loot.mob === 'blade_fly' && loot.loot.xp > 0, 'server-side kill of Мошкара-Жнец → XP + loot roll ' + JSON.stringify(loot?.loot?.res || {}));
ok(loot && loot.account.bestiary.blade_fly?.kills >= 1, 'bestiary records kill');
// talents locked until Alzi
A.send({ type: 'talent_learn', id: 'spearman.vit' });
let te = await A.wait('toast_error'); ok(te && /Алзи/.test(te.message), 'talent tree gated by story flag (Alzi)');
// dev grant: xp + flags via quests is long; use dev_grant xp, stars, item
A.clear();
A.send({ type: 'dev_grant', xp: 3000, stars: { yellow: 3, black: 1 }, item: 'fly_blades' });
st = await A.wait('meta_state');
ok(st.hero.lvl >= 5 && st.hero.talentPoints === st.hero.lvl - 1, `hero level ${st.hero.lvl}, talent points ${st.hero.talentPoints}, 3 ability slots=${st.hero.slots}`);
const blades = st.account.inv.find((i) => i.id === 'fly_blades');
A.clear(); A.send({ type: 'equip', uid: blades.uid });
st = await A.wait('meta_state');
ok(st.hero.equip.weapon === blades.uid && st.hero.monsterAbilities.includes('fly_blade_dash'), 'equip fly blades (weapon slot) → monster ability unlocked');
ok(st.hero.effective.itemDmgMin === 5 && st.hero.effective.itemDmgMax === 7, 'fixed item stats 5–7 dmg (no scaling)');
A.clear(); A.send({ type: 'loadout_set', ids: ['pierce', 'fly_blade_dash', 'spear_rain'] });
st = await A.wait('meta_state');
ok(st.hero.loadout.length === 3 && st.hero.effective.abilities.length === 3, 'loadout of 3 abilities incl. monster ability');
A.clear(); A.send({ type: 'loadout_set', ids: ['pierce', 'fireball'] });
te = await A.wait('toast_error'); ok(!!te, 'server rejects other class ability in loadout');
A.clear(); A.send({ type: 'radiance_up', id: 'pierce' });
te = await A.wait('toast_error'); ok(te && /Лэйр/.test(te.message), 'radiance gated by Leyr campaign');
A.clear(); A.send({ type: 'ability_silence', id: 'spear_rain', confirm: 'ЗАГЛУШИТЬ' });
st = await A.wait('meta_state');
ok(st.account.creation === 1 && st.hero.abil.spear_rain?.silenced && st.account.stars.black === 0, 'black star silences skill forever → +1 Creation point');
A.send({ type: 'move', x: 570, y: 610 }); await sleep(150);
A.clear(); A.send({ type: 'soul_buy', id: 'void_whisper' });
st = await A.wait('meta_state');
ok(st.account.soul.includes('void_whisper'), 'Creation point spent in soul branch at Altar');
// run reward + one-way sync
A.send({ type: 'run_join', room: 'crypt' }); await A.wait('run_joined');
await sleep(1500);
A.clear(); A.send({ type: 'run_result', time: 9999, kills: { imp: 99999 }, bossKills: 5 });
st = await A.wait('meta_state', 4000, (m) => m.reward);
ok(st && st.reward.time <= 5 && st.reward.xp < 20, 'run reward capped by server-measured time (claimed 9999s → ' + st?.reward.time + 's, xp ' + st?.reward.xp + ')');
A.send({ type: 'run_leave' }); await sleep(200);
// per-hero separation
A.clear(); A.send({ type: 'select_class', classId: 'mage' });
st = await A.wait('meta_state', 4000, (m) => m.hero?.cls === 'mage');
ok(st.hero.lvl === 1 && st.heroes.spearman.lvl >= 5, 'heroes level separately (mage lvl1, spearman lvl ' + st.heroes.spearman.lvl + ')');
ok(!st.hero.equip.weapon, 'equipment is per hero (mage has no weapon equipped), bag is account-wide: ' + st.account.inv.length + ' items');
const lvlBefore = st.heroes.spearman.lvl;
A.close(); await sleep(800);
// reconnect → persistence
const B = await client('meta_A', uid);
st = await B.wait('meta_state');
ok(st && st.heroes.spearman.lvl === lvlBefore && st.account.creation === 0 && st.account.soul.includes('void_whisper') && st.account.bestiary.blade_fly, 'persistence across reconnect (SQLite DO)');
B.send({ type: 'select_class', classId: 'spearman' });
st = await B.wait('meta_state', 4000, (m) => m.hero?.cls === 'spearman');
ok(st.hero.equip.weapon && st.hero.abil.spear_rain?.silenced, 'spearman equipment and silenced skill persisted');
// craft needs Petr
B.clear(); B.send({ type: 'craft', recipe: 'r_fly_legs' }); te = await B.wait('toast_error'); ok(te && /Петр/.test(te.message), 'craft validated by NPC proximity');
// arinar
B.send({ type: 'move', x: 240, y: 600 }); await sleep(150);
B.clear(); B.send({ type: 'use_portal', portalId: 'portal_arinar' }); await B.wait('world_switched');
const za = await B.wait('zone_state', 3000, (m) => m.w === 'arinar');
ok(za && za.n.length >= 10 && za.n.every((n) => n[0] >= 1000) && typeof za.sd === 'number', 'Аринар zone: seeded resource nodes ' + (za?.n.length) + ' (seed ' + za?.sd + ')');
B.send({ type: 'move', x: 300, y: 650 }); await sleep(150); B.send({ type: 'move', x: 300, y: 700 }); await sleep(150);
B.send({ type: 'move', x: 1200, y: 1200 }); await sleep(200);
const me = B.last('players_state').players.find((p) => p.username === 'meta_A');
ok(me && me.x < 500, 'anti-teleport clamp in Аринар (x=' + me?.x + ')');
B.send({ type: 'move', x: 240, y: 600 }); await sleep(300);
// процедурный спавн: мобы появляются вне безопасной зоны портала и не вплотную к игроку
let zm = null;
for (let i = 0; i < 40 && !(zm && zm.m.length); i++) { await sleep(200); zm = B.last('zone_state'); }
const mobsA = []; if (zm) for (let j = 0; j < zm.m.length; j += 6) mobsA.push(zm.m.slice(j, j + 6));
ok(mobsA.length > 0 && mobsA.every((m) => Math.hypot(m[2] - 240, m[3] - 600) > 120), 'Аринар procedural spawn: ' + mobsA.length + ' mobs in AOI, none in the portal safe zone');
// атака по клику: неверное направление — промах, спам — режется кулдауном
const tgt = mobsA[0];
if (tgt) {
  // подходим к мобу по шагам (анти-телепорт)
  let px = 240, py = 600;
  for (let i = 0; i < 30; i++) { const z = B.last('zone_state'); let m = null; if (z) for (let j = 0; j < z.m.length; j += 6) if (z.m[j] === tgt[0]) m = z.m.slice(j, j + 6); if (!m) break;
    const dx = m[2] - px, dy = m[3] + 70 - py, d = Math.hypot(dx, dy); if (d < 20) break; const st = Math.min(d, 90); px += dx / d * st; py += dy / d * st; B.send({ type: 'move', x: px, y: py }); await sleep(260); }
  await sleep(600); B.clear();
  B.send({ type: 'zone_attack', dx: 0, dy: 1 }); // от моба (он выше)
  await sleep(700);
  const hitsWrong = B.msgs.filter((m) => m.type === 'zone_state').flatMap((m) => m.ev || []).filter((e) => e.k === 'hit' && e.id === tgt[0]);
  ok(hitsWrong.length === 0, 'click attack in the wrong direction misses (server-validated)');
  B.clear();
  for (let i = 0; i < 10; i++) { B.send({ type: 'zone_attack', dx: 0, dy: -1 }); await sleep(30); }
  await sleep(800);
  const shots = B.msgs.filter((m) => m.type === 'zone_state').flatMap((m) => m.ev || []).filter((e) => e.k === 'shot');
  const hits = B.msgs.filter((m) => m.type === 'zone_state').flatMap((m) => m.ev || []).filter((e) => e.k === 'hit');
  ok(shots.length >= 1 && shots.length <= 2 && hits.length >= 1, `attack spam (10 in 300ms) cut by weapon cooldown: ${shots.length} accepted, hits ${hits.length}`);
} else ok(false, 'no Аринар mob to test click attack');
// guest without uid
const G = await client('meta_guest', '');
const gs = await G.wait('meta_state');
ok(gs && gs.verified === false, 'guest without token → unverified guest profile');
B.close(); G.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
