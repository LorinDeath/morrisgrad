// Выбор кадра новых мобов bestiary32 (Художник, 64 кадра на моба) — чистые функции без THREE и DOM: общие для мира, забега,
// обликов и тестов (tools/tests/beast32-frames.test.mjs). Горячий цикл: ничего не создаём, только числа; состояние — поля моба.
// Кадр в листе страницы: idx = mob.start + anim.off + f; col = idx % cols, row = floor(idx / cols).
//
// Состояние моба (s) — обычный объект сущности, поля (секунды; −1 = нет):
//   s.dieK   прогресс смерти 0..1          → die  (по прогрессу, f = min(n−1, floor(k·n)))
//   s.hurtT  с момента попадания по мобу   → hurt (6 кадров @24; вспышка уже нарисована)
//   s.atkT   с начала удара (рывок/удар)   → atk 6..8 (удар, импакт = 7), пока s.atkOn — держим 6..8 по кругу; после — 9..11 возврат
//   s.recT   с конца удара                 → atk 9..11
//   s.windT  с начала замаха (флаг 1)      → atk 0..5, затем держим 5
//   s.moving ход/стоит                     → walk / idle
//   s.frozen заморожен                     → последний кадр (s.f32)
export const ANIM_KEYS = ['idle', 'walk', 'atk', 'hurt', 'die'];

/** разобрать атлас один раз: плоские числа для горячего цикла (без поиска по строкам на кадр) */
export function prepMeta(meta) {
  const A = meta.anims, a = (k) => A[k];
  return {
    cols: meta.cols, cell: meta.cell, pxPerM: meta.pxPerM, H: meta.cell / meta.pxPerM,
    idleOff: a('idle').off, idleN: a('idle').n, idleFps: a('idle').fps,
    walkOff: a('walk').off, walkN: a('walk').n, walkFps: a('walk').fps,
    atkOff: a('atk').off, atkN: a('atk').n, atkFps: a('atk').fps, hold: A.atk.hold ?? 5, s0: A.atk.strike?.[0] ?? 6, s1: A.atk.strike?.[1] ?? 8, impact: A.atk.impact ?? 7, r0: A.atk.recover?.[0] ?? 9, r1: A.atk.recover?.[1] ?? 11,
    hurtOff: a('hurt').off, hurtN: a('hurt').n, hurtFps: a('hurt').fps,
    dieOff: a('die').off, dieN: a('die').n, dieFps: a('die').fps,
    frames: meta.framesPerMob,
  };
}

/**
 * Кадр внутри моба (0..63). M — prepMeta, s — состояние (см. выше), T — время (с), walkFps — темп ног (старые fps × 3), fm — множитель скорости (админка).
 * phase — сдвиг фазы (чтобы толпа не шагала в ногу). Без аллокаций.
 */
export function mobFrame(M, s, T, walkFps, fm, phase) {
  let f;
  if (s.dieK >= 0) { const k = s.dieK > 0.999 ? 0.999 : s.dieK; f = M.dieOff + Math.min(M.dieN - 1, Math.floor(k * M.dieN)); }
  else if (s.frozen && s.f32 >= 0) return s.f32;
  else if (s.hurtT >= 0 && s.hurtT * M.hurtFps * fm < M.hurtN) f = M.hurtOff + Math.floor(s.hurtT * M.hurtFps * fm);
  else if (s.atkT >= 0 && (s.atkOn || s.atkT * M.atkFps * fm < M.s1 - M.s0 + 1)) {
    const span = M.s1 - M.s0 + 1, i = Math.floor(s.atkT * M.atkFps * fm);
    f = M.atkOff + M.s0 + (s.atkOn ? i % span : Math.min(span - 1, i));
  }
  else if (s.recT >= 0 && s.recT * M.atkFps * fm < M.r1 - M.r0 + 1) f = M.atkOff + M.r0 + Math.floor(s.recT * M.atkFps * fm);
  else if (s.windT >= 0) f = M.atkOff + Math.min(M.hold, Math.floor(s.windT * M.atkFps * fm));
  else if (s.moving) f = M.walkOff + (((Math.floor(T * walkFps * fm + phase * M.walkN)) % M.walkN) + M.walkN) % M.walkN;
  else f = M.idleOff + (((Math.floor(T * M.idleFps * fm + phase * M.idleN)) % M.idleN) + M.idleN) % M.idleN;
  s.f32 = f;
  return f;
}

/** время (с) от начала удара до кадра импакта при множителе fm — для сверки с моментом урона */
export const impactDelay = (M, fm = 1) => (M.impact - M.s0 + 0.5) / (M.atkFps * fm);

/**
 * Шаг состояния по флагам сервера мира (zone_state: flag 1 — замах/windup, 2 — рывок/удар dashT) и событиям клиента.
 * Вызывать раз в кадр до mobFrame. hit — по мобу попали в этом кадре; strike — моб нанёс удар без флага (событие phit от моба рядом).
 */
export function stepZone(M, s, dt, flag, hit, strike, fm = 1) {
  if (hit) s.hurtT = 0; else if (s.hurtT >= 0) { s.hurtT += dt; if (s.hurtT > 1) s.hurtT = -1; }
  if (flag === 1) s.windT = s.windT >= 0 ? s.windT + dt : 0; else s.windT = -1;
  if (flag === 2) { if (s.atkT >= 0) s.atkT += dt; else { s.atkT = 0; s.recT = -1; } s.atkOn = true; }
  else if (strike) { s.atkT = 0; s.recT = -1; s.atkOn = false; }
  else if (s.atkT >= 0) { s.atkT += dt; if (s.atkOn || s.atkT * M.atkFps * fm >= M.s1 - M.s0 + 1) { s.atkOn = false; s.atkT = -1; s.recT = 0; } }
  else if (s.recT >= 0) { s.recT += dt; if (s.recT > 1) s.recT = -1; }
}
/** начальные поля состояния (один раз при появлении моба) */
export function initState(s) { s.dieK = -1; s.hurtT = -1; s.atkT = -1; s.recT = -1; s.windT = -1; s.atkOn = false; s.moving = false; s.f32 = -1; return s; }

/** длительность анимации (с) при множителе fm — для показа/тестов (die — по прогрессу, обычно 0.5 с; atk — замах+удар+возврат) */
export function animDur(M, a, fm = 1) { const n = { idle: M.idleN, walk: M.walkN, atk: M.atkN, hurt: M.hurtN, die: M.dieN }[a], fps = { idle: M.idleFps, walk: M.walkFps, atk: M.atkFps, hurt: M.hurtFps, die: M.dieFps }[a]; return n / (fps * fm); }
/**
 * Принудительное состояние для показа (debug.mobDemo, снимки и GIF): anim ∈ idle|walk|atk|hurt|die, t — время с начала анимации (по кругу).
 * atk: замах 0..5 (0.3 с) → удар 6..8 → возврат 9..11. Без аллокаций.
 */
export function forceState(M, s, anim, t, fm = 1) {
  s.dieK = -1; s.hurtT = -1; s.atkT = -1; s.recT = -1; s.windT = -1; s.atkOn = false; s.moving = anim === 'walk'; s.frozen = false;
  const d = animDur(M, anim, fm), tt = ((t % d) + d) % d;
  if (anim === 'die') s.dieK = tt / d;
  else if (anim === 'hurt') s.hurtT = tt;
  else if (anim === 'atk') { const w = (M.hold + 1) / (M.atkFps * fm), st = (M.s1 - M.s0 + 1) / (M.atkFps * fm); if (tt < w) s.windT = tt; else if (tt < w + st) s.atkT = tt - w; else s.recT = tt - w - st; }
}
