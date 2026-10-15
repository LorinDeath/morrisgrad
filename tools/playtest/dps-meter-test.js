// node tools/playtest/dps-meter-test.js — формулы счётчика урона согласованы
import { DpsMeter } from '../../src/pages/MorrisCurse/_core/ui/dps.js';
let pass = 0, fail = 0; const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? 'PASS ' : 'FAIL ') + m); };
{ // ровно 10 урона каждые 100 мс 90 с → 100/с, за 60 с 6000, за бой 9000, пик 100
  const M = new DpsMeter(); let t = 1000; for (let i = 0; i < 900; i++) { M.add(10, t); t += 100; }
  const s = M.stats(t - 100);
  ok(s.dps === 100, `steady dps 100 (${s.dps})`); ok(s.dpm === 6000, `dpm = last 60 s = 6000 (${s.dpm})`);
  ok(s.fight === 9000, `fight 9000 (${s.fight})`); ok(s.peak === 100, `peak 1 s = 100 (${s.peak})`);
  ok(Math.abs(s.dpm - s.dps * 60) <= s.dps, 'dpm ≈ dps×60 at steady rate');
}
{ // бой 10 с: dpm = весь урон, не экстраполирован на минуту; dpm ≤ fight
  const M = new DpsMeter(); let t = 0; for (let i = 0; i < 10; i++) { M.add(50, t); t += 1000; }
  const s = M.stats(9000);
  ok(s.dpm === 500 && s.fight === 500, `short fight dpm=fight=500 (${s.dpm}/${s.fight})`);
  ok(s.dps === 50, `dps 50 (${s.dps})`);
}
{ // всплеск: 300 за 1 с → пик 300; через 10 с бой окончен
  const M = new DpsMeter(); M.add(100, 0); M.add(100, 300); M.add(100, 900); M.add(5, 3000);
  ok(M.stats(3000).peak === 300, `burst peak 300 (${M.stats(3000).peak})`);
  ok(!M.stats(12000).active, 'inactive after 8 s gap');
  M.add(7, 20000); const s = M.stats(20000); ok(s.fight === 7 && s.peak === 7, 'new fight resets total/peak');
}
{ const M = new DpsMeter(); for (let i = 0; i < 70; i++) M.add(1, i * 1000); const s = M.stats(69000);
  ok(s.dpm === 60 && s.dpm <= s.fight, `dpm drops hits older than 60 s (${s.dpm}, fight ${s.fight})`); }
console.log(`${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
