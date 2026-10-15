// Черты админки в забеге (клиент-хост RunSession): поджог/заморозка/вампиризм/замедление по ударам оружия и навыков.
// npx esbuild tools/playtest/run-traits-test.js --bundle --platform=node --format=esm --loader:.png=file --loader:.webp=file --loader:.json=json --outfile=/tmp/rt.mjs && node /tmp/rt.mjs
import { RunSession } from '../../src/pages/MorrisCurse/_core/survivors/run.js';
let pass = 0, fail = 0; const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? 'PASS ' : 'FAIL ') + m); };
const evs = []; const mk = (traits) => new RunSession({ room: undefined, classKey: 'soul', isHost: true, traits, events: (k, d) => evs.push([k, d]) });
let R;
try { R = mk({ weapon: [{ k: 'burn', dpsPct: 50, dur: 3, chance: 100 }, { k: 'lifesteal', pct: 100, chance: 100 }], skill: { fireball: [{ k: 'freeze', dur: 1, chance: 100 }] } }); }
catch (e) { console.log('RunSession ctor failed:', e.message); process.exit(1); }
const e = { id: 9001, x: R.me.x + 1, z: R.me.z, hp: 1e6, maxHp: 1e6 };
const ENE = (await import('../../src/pages/MorrisCurse/_core/survivors/data.js')).ENEMIES; e.type = Object.keys(ENE)[0];
R.me.hp = 1; const hp0 = R.me.hp;
R.hitEnemy(e, { w: 'soul_spark', dmg: 20 });
ok([...R.dots.values()].some((d) => d.e === e && d.kind === 'burn'), 'weapon trait burn → DoT on enemy');
ok(R.me.hp > hp0, `weapon trait lifesteal heals (${hp0} → ${R.me.hp})`);
R.flushLs(); ok(evs.some(([k, d]) => k === 'lsheal' && d.amt >= 1), 'lifesteal → «+N HP» lsheal event');
R.hitEnemy(e, { w: 'ab_fireball', dmg: 20 });
ok((e.frzU || 0) > R.t, 'skill trait freeze (fireball) → enemy frozen');
const R2 = mk(null); const e2 = { ...e, id: 9002, frzU: 0 }; R2.hitEnemy(e2, { w: 'ab_fireball', dmg: 20 });
ok(!(e2.frzU > R2.t) && ![...R2.dots.values()].some((d) => d.e === e2), 'no traits → no extra effects');
R.traits = { weapon: [{ k: 'slow', chance: 100 }], skill: {} }; const e3 = { ...e, id: 9003 }; R.hitEnemy(e3, { w: 'soul_spark', dmg: 5 });
ok((e3.slowUntil || 0) > R.t, 'live update (meta_state.runTraits) → slow applies');
console.log(`${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
