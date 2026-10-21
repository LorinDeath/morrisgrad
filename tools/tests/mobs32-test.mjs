// Мобы bestiary32: атлас и выбор кадров для всех 68 мобов и всех анимаций, листы (размеры, непустые ячейки), машина состояний удара,
// отсутствие аллокаций в горячем цикле. Запуск: node --expose-gc tools/tests/mobs32-test.mjs
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import sharp from 'sharp';
import { prepMeta, mobFrame, stepZone, initState, forceState, animDur, impactDelay, ANIM_KEYS } from '../../src/pages/MorrisCurse/_core/engine/beastFrames.js';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const DIR = join(ROOT, 'src/assets/mc/bestiary32');
const A = JSON.parse(readFileSync(join(DIR, 'bestiary32_atlas.json'), 'utf8'));
const OLD = JSON.parse(readFileSync(join(ROOT, 'src/assets/mc/bestiary_atlas.json'), 'utf8'));
let fails = 0, passes = 0; const ok = (c, m) => { if (c) passes++; else { fails++; if (fails < 40) console.log('FAIL ' + m); } };
const M = prepMeta(A);

// 1. атлас: те же 68 id, что у старого бестиария; страница/старт/тир согласованы; 64 кадра влезают в страницу
const ids = Object.keys(A.mobs);
ok(ids.length === 68, `68 мобов (${ids.length})`);
ok(JSON.stringify(A.rows) === JSON.stringify(OLD.rows), 'rows = старый bestiary_atlas (те же id и порядок)');
ok(JSON.stringify(Object.keys(A.flying).sort()) === JSON.stringify(Object.keys(OLD.flying).sort()), 'летуны те же');
ok(A.framesPerMob === 64 && M.frames === 64, '64 кадра на моба');
const sumN = ANIM_KEYS.reduce((a, k) => a + A.anims[k].n, 0); ok(sumN === 64, `сумма кадров анимаций = 64 (${sumN})`);
ok(A.anims.idle.n === 16 && A.anims.idle.fps === 12 && A.anims.walk.n === 12 && A.anims.walk.fps === 24 && A.anims.atk.n === 12 && A.anims.atk.fps === 20 && A.anims.atk.impact === 7 && A.anims.hurt.n === 6 && A.anims.hurt.fps === 24 && A.anims.die.n === 18 && A.anims.die.fps === 24, 'анимации по ТЗ (16@12, 12@24, 12@20 импакт 7, 6@24, 18@24)');
for (const id of ids) {
  const m = A.mobs[id], pg = A.pages[m.page];
  ok(!!pg && pg.mobs.includes(id), `${id}: страница ${m.page} содержит моба`);
  ok(pg.tier === m.tier, `${id}: тир страницы = тир моба`);
  ok(m.start % 64 === 0 && (m.start + 64) <= pg.rows * A.cols, `${id}: 64 кадра в пределах страницы`);
  ok(JSON.stringify(m.body) === JSON.stringify(A.body[A.rows.indexOf(id)]), `${id}: body совпадает с совместимым полем`);
  const ob = OLD.body[OLD.rows.indexOf(id)], r = (m.body[1] - m.body[0]) / A.pxPerM / ((ob[1] - ob[0]) / OLD.pxPerM);
  ok(r > 0.85 && r < 1.1, `${id}: рост тела в метрах ≈ старому (${r.toFixed(2)})`);
}
// 2. листы: размеры как в json (< 4096), _glow той же раскладки; каждая ячейка каждого кадра всех мобов непуста
const VR = { tot: 0, tiers: {} };
for (const pg of A.pages) {
  const [b, g] = await Promise.all([sharp(join(DIR, pg.image)).ensureAlpha().raw().toBuffer({ resolveWithObject: true }), sharp(join(DIR, pg.glow)).ensureAlpha().raw().toBuffer({ resolveWithObject: true })]);
  ok(b.info.width === pg.w && b.info.height === pg.h && pg.w <= 4096 && pg.h <= 4096, `${pg.image}: ${b.info.width}×${b.info.height} = json, ≤ 4096`);
  ok(g.info.width === pg.w && g.info.height === pg.h, `${pg.glow}: та же раскладка`);
  ok(pg.h === pg.rows * A.cell && pg.w === A.cols * A.cell, `${pg.image}: rows×cell`);
  const mb = (pg.w * pg.h * 4) / 1048576; VR.tot += mb * 2; VR.tiers[pg.tier] = (VR.tiers[pg.tier] || 0) + mb * 2;
  const cellAlpha = (buf, W, idx) => { const C = A.cell, col = idx % A.cols, row = Math.floor(idx / A.cols); let n = 0; for (let y = 0; y < C; y++) { const o = ((row * C + y) * W + col * C) * 4; for (let x = 0; x < C; x++) if (buf[o + x * 4 + 3]) n++; } return n; };
  for (const id of pg.mobs) {
    const m = A.mobs[id];
    for (let f = 0; f < 64; f++) {
      const n = cellAlpha(b.data, pg.w, m.start + f);
      ok(f >= A.anims.die.off ? n > 0 : n > 20, `${id}: кадр ${f} непуст (${n} px)`); // последние кадры распада почти пусты — так задумано
      // 1 px пустая рамка: соседние ячейки не «залезают»
      const C = A.cell, idx = m.start + f, col = idx % A.cols, row = Math.floor(idx / A.cols); let edge = 0;
      for (let k = 0; k < C; k++) { for (const [x, y] of [[k, 0], [k, C - 1], [0, k], [C - 1, k]]) if (b.data[(((row * C + y) * pg.w) + col * C + x) * 4 + 3]) edge++; }
      ok(edge === 0, `${id}: кадр ${f} — пустая рамка 1 px (${edge})`);
    }
  }
}
// 3. выбор кадров: forceState → mobFrame за всю длительность каждой анимации даёт ровно кадры анимации, по порядку, каждый
const S = initState({});
for (const id of ids) for (const a of ANIM_KEYS) {
  const off = A.anims[a].off, n = A.anims[a].n, d = animDur(M, a), seen = new Set(); let prev = -1, mono = true;
  for (let i = 0; i < 400; i++) { const t = (i / 400) * d; forceState(M, S, a, t); const f = mobFrame(M, S, a === 'walk' || a === 'idle' ? t : 0, M.walkFps, 1, 0); seen.add(f); if (a !== 'atk' && f < prev) mono = false; prev = f; if (f < off || f >= off + n) { ok(false, `${id}/${a}: кадр ${f} вне [${off}, ${off + n})`); break; } }
  ok(seen.size === n, `${id}/${a}: все ${n} кадров достижимы (${seen.size})`);
  ok(mono, `${id}/${a}: кадры идут по порядку`);
  const idx = A.mobs[id].start + off + n - 1; ok(idx < A.pages[A.mobs[id].page].rows * A.cols, `${id}/${a}: последний кадр на странице`);
}
// 4. машина состояний мира: замах 0..5 (держим 5) → флаг 2 → удар 6..8 → конец флага → 9..11 → ход/стоит
{
  const s = initState({}); let T = 0; const dt = 1 / 60, seq = [];
  const run = (sec, flag, hit = false, str = false) => { for (let t = 0; t < sec; t += dt) { stepZone(M, s, dt, flag, hit, str); hit = false; str = false; T += dt; seq.push(mobFrame(M, s, T, 21, 1, 0)); } };
  run(0.2, 0); ok(seq.at(-1) >= M.idleOff && seq.at(-1) < M.idleOff + M.idleN, 'стоит → idle');
  seq.length = 0; run(0.55, 1); ok(seq[0] === M.atkOff && seq.at(-1) === M.atkOff + M.hold && Math.max(...seq) === M.atkOff + 5, 'замах: 0..5, держит 5');
  seq.length = 0; run(0.4, 2); ok(seq[0] === M.atkOff + 6 && seq.every((f) => f >= M.atkOff + 6 && f <= M.atkOff + 8), 'рывок (флаг 2): 6..8');
  seq.length = 0; run(0.3, 0); ok(seq[0] === M.atkOff + 9 && seq.includes(M.atkOff + 11), 'после рывка: возврат 9..11');
  ok(seq.at(-1) < M.atkOff, 'затем — idle/walk');
  seq.length = 0; run(0.35, 0, false, true); ok(seq[0] === M.atkOff + 6 && seq.includes(M.atkOff + 7) && seq.includes(M.atkOff + 11), 'мгновенный удар (phit): 6..8 → 9..11');
  seq.length = 0; run(0.3, 0, true); ok(seq[0] === M.hurtOff && seq.includes(M.hurtOff + 5) && seq.at(-1) < M.atkOff, 'попадание: hurt 0..5 (0.25 с) → обратно');
  s.moving = true; seq.length = 0; for (let t = 0; t < 0.5; t += 1 / 120) seq.push(mobFrame(M, s, T + t, M.walkFps, 1, 0)); ok(new Set(seq).size === 12 && seq.every((f) => f >= M.walkOff && f < M.walkOff + 12), 'ход: 12 кадров за 0.5 с @24');
  s.frozen = true; const fz = mobFrame(M, s, T + 5, 21, 1, 0); ok(fz === s.f32, 'заморожен — кадр стоит');
  s.frozen = false; s.dieK = 0.5; ok(mobFrame(M, s, T, 21, 1, 0) === M.dieOff + 9, 'смерть по прогрессу: k=0.5 → кадр 9'); s.dieK = 1; ok(mobFrame(M, s, T, 21, 1, 0) === M.dieOff + 17, 'k=1 → последний кадр');
  const id = impactDelay(M); ok(Math.abs(id - 0.075) < 1e-9, `импакт через ${id.toFixed(3)} с после начала удара (кадр 7 @20 fps)`);
  const f2 = initState({}); forceState(M, f2, 'atk', 0.16, 2); ok(mobFrame(M, f2, 0, 21, 2, 0) > M.atkOff + 5, 'fps ×2 ускоряет удар');
}
// 5. горячий цикл без аллокаций: 2 млн вызовов stepZone+mobFrame
if (global.gc) {
  const st = ids.map(() => initState({ ph: Math.random() })); global.gc(); const h0 = process.memoryUsage().heapUsed; let T = 0, acc = 0;
  const t0 = performance.now();
  for (let i = 0; i < 2e6; i++) { const s = st[i % 68]; T += 1e-4; s.moving = (i & 7) < 5; stepZone(M, s, 1 / 60, (i >> 6) % 3, (i & 255) === 0, false); acc += mobFrame(M, s, T, 21, 1, s.ph); }
  const ms = performance.now() - t0; global.gc(); const dh = process.memoryUsage().heapUsed - h0;
  ok(dh < 256 * 1024, `без аллокаций: прирост кучи ${(dh / 1024).toFixed(0)} КБ на 2 млн кадров`);
  console.log(`hot loop: ${(ms * 1e6 / 2e6).toFixed(0)} нс на моба (stepZone+mobFrame), acc=${acc % 7}`);
} else console.log('SKIP аллокации: запустите с --expose-gc');
console.log(`VRAM RGBA8: всего ${VR.tot.toFixed(1)} МБ; по тирам ` + Object.entries(VR.tiers).map(([t, v]) => `t${t} ${v.toFixed(1)}`).join(', ') + ' (база+glow; glow в 5551 — вдвое меньше)');
console.log(`${fails ? 'FAIL' : 'PASS'} mobs32: ${passes} проверок, ошибок ${fails}`);
process.exit(fails ? 1 : 0);
