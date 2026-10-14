import { DpsMeter } from './dps.js';
const m = new DpsMeter(); let t = 0; for (let i = 0; i < 20; i++) { t += 500; m.add(100, t); } // 200 урона/с за 10 с
const s = m.stats(t); console.log(JSON.stringify(s)); if (!(s.dps >= 190 && s.dps <= 230 && s.dpm >= 11000 && s.dpm <= 13000 && s.fight === 2000)) process.exit(1);
const s2 = m.stats(t + 9000); if (s2.active) process.exit(2); console.log('dps ok');
