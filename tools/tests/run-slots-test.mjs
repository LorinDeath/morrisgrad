// Задача 6: навыки класса/бесплатное оружие не занимают 4 слота оружия забега
import { RunSession } from '../../src/pages/MorrisCurse/_core/survivors/run.js';
import { MAX_WEAPONS } from '../../src/pages/MorrisCurse/_core/survivors/data.js';
let ok = 0, bad = 0; const t = (n, c) => { c ? ok++ : (bad++, console.log('FAIL', n)); };
const r = new RunSession({ room: 'x', myId: 'a', username: 'u', classKey: 'warrior', runSkill: 'chain_bolt' });
r.reset?.(0);
const W = r.me.weapons, free = Object.keys(W).filter((k) => W[k].free);
t('навык забега выдан бесплатно', W.chain_bolt?.free === true);
t('стартовое оружие бесплатно', free.length >= 2);
let guard = 0;
while (Object.keys(W).filter((k) => !W[k].free).length < MAX_WEAPONS && guard++ < 500) {
  const c = r.rollChoices(3).find((x) => x.kind === 'weapon' && !W[x.id]); if (c) r.addWeapon(c.id);
}
const paid = Object.keys(W).filter((k) => !W[k].free).length;
t(`можно взять ${MAX_WEAPONS} оружия сверх бесплатных`, paid === MAX_WEAPONS);
t('после лимита новых оружий не предлагают', Array.from({ length: 50 }, () => r.rollChoices(3)).flat().every((x) => x.kind !== 'weapon' || W[x.id]));
const r2 = new RunSession({ room: 'y', myId: 'a', username: 'u', classKey: 'warrior' }); r2.reset?.(0);
t('без навыка — нет лишнего', !r2.me.weapons.chain_bolt);
console.log(`run-slots ${ok}/${ok + bad}`); process.exit(bad ? 1 : 0);
