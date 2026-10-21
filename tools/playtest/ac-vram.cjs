// LOCAL ONLY: видеопамять по требованию (engine/vramStream.js) + радиус-стрим земли Аринара (worlds/terrainChunks.js).
// Прогулка через чанки туда и обратно: худший кадр (CPU мс кадра, интервал rAF), байты/число текстур на GPU до/после,
// утечки (вернулись к началу → текстур столько же), смена зон (хаб ↔ Аринар: текстуры уходят и возвращаются).
// MOBILE=1 — телефон (UA Android, props2 + тайлы 16). BEFORE=1 — «как раньше»: без выгрузки (grace 600 с), радиус 59 клеток.
const L = require('./ac-lib.cjs');
const MOB = process.env.MOBILE === '1', BEFORE = process.env.BEFORE === '1', SECS = +(process.env.SECS || 30);
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; return c; };
(async () => {
  const dir = `/workspace/mc-harness-assets/prof-vram-${MOB ? 'mob' : 'pc'}`;
  const ctx = await L.launch(dir, { mobile: MOB });
  const uid = 'vram_' + Date.now().toString(36);
  const { page: p, errs, cons } = await L.visit(ctx, `&uid=${uid}&name=${uid}${BEFORE ? '&vramLegacy=1' : ''}`);
  const G = (fn, a) => p.evaluate(fn, a);
  await G(() => window.__MC3D_GAME__.debug.selectClass?.('mage')).catch(() => {}); await L.sleep(1500);
  const hub0 = await G(() => window.__MC3D_GAME__.debug.vramTick() && window.__MC3D_GAME__.debug.vram());
  for (let i = 0; i < 8 && (await G(() => window.__MC3D_GAME__.state().world)) !== 'arinar'; i++) {
    await G(() => window.__MC3D_GAME__.debug.tp(240, 600)); await L.sleep(900);
    await G(() => window.__MC3D_GAME__.debug.rawSend({ type: 'use_portal', portalId: 'portal_arinar' })); await L.sleep(1500);
  }
  if (!ok((await G(() => window.__MC3D_GAME__.state().world)) === 'arinar', 'в Аринаре')) { console.log(JSON.stringify(await G(() => window.__MC3D_GAME__.state()))); process.exit(1); }
  if (BEFORE) await G(() => window.__MC3D_GAME__.debug.setVram({ legacy: true, loadTilesPc: 59, loadTilesMob: 59, budgetPc: 8192, budgetMob: 4096 }));
  await L.sleep(6000); for (let i = 0; i < 20 && (await G(() => window.__MC3D_GAME__.debug.vram().pending)); i++) await L.sleep(500); await L.sleep(2000);
  const pos0 = await G(() => window.__MC3D_GAME__.debug.pos());
  await G(() => window.__MC3D_GAME__.debug.vramTick()); const v0 = await G(() => window.__MC3D_GAME__.debug.vram()), c0 = await G(() => window.__MC3D_GAME__.debug.chunks());
  console.log('start', JSON.stringify({ pos0, v0, c0 }));
  const top0 = await G(() => window.__MC3D_GAME__.debug.vramTop(400));
  await G(() => window.__MC3D_GAME__.debug.frames(true));
  const leg = async (x, y) => { await G(([x, y]) => window.__MC3D_GAME__.debug.walk(x, y), [x, y]); const t0 = Date.now(); let mx = 0; while (Date.now() - t0 < SECS * 1000) { await L.sleep(2000); const v = await G(() => window.__MC3D_GAME__.debug.vram()); mx = Math.max(mx, v.gpuMB); } await G(() => window.__MC3D_GAME__.debug.walk(0, 0)); return mx; };
  const peakOut = await leg(1, 0);
  const posFar = await G(() => window.__MC3D_GAME__.debug.pos()), cFar = await G(() => window.__MC3D_GAME__.debug.chunks());
  const fOut = await G(() => window.__MC3D_GAME__.debug.frames(true));
  const peakBack = await leg(-1, 0);
  const fBack = await G(() => window.__MC3D_GAME__.debug.frames(true));
  const posBack = await G(() => window.__MC3D_GAME__.debug.pos());
  // если не дошли точно — довести телепортом в стартовую точку
  await G(([x, y]) => window.__MC3D_GAME__.debug.tp(x, y), [pos0.x, pos0.y]);
  const grace = (await G(() => window.__MC3D_GAME__.debug.vram())).cfg.graceMs;
  // крупные атласы держатся 3×grace (см. vramStream) — ждём их срок
  await L.sleep(Math.min(grace * 3, 70000) + 3000); await G(() => window.__MC3D_GAME__.debug.vramTick());
  const v1 = await G(() => window.__MC3D_GAME__.debug.vram()), c1 = await G(() => window.__MC3D_GAME__.debug.chunks());
  console.log('walk', JSON.stringify({ distPx: Math.round(posFar.x - pos0.x), posBack: Math.round(posBack.x - pos0.x), cFar, fOut, fBack, peakOut, peakBack }));
  console.log('end', JSON.stringify({ v1, c1 }));
  { const top1 = await G(() => window.__MC3D_GAME__.debug.vramTop(400)); const k = (t) => `${t.src} ${t.w}x${t.h}`; const cnt = (L) => L.reduce((m, t) => m.set(k(t), (m.get(k(t)) || 0) + 1), new Map());
    const a = cnt(top0), b = cnt(top1), d = []; for (const [x, n] of b) if (n > (a.get(x) || 0)) d.push(`+${n - (a.get(x) || 0)} ${x}`); for (const [x, n] of a) if (n > (b.get(x) || 0)) d.push(`-${n - (b.get(x) || 0)} ${x}`);
    console.log('texdiff', JSON.stringify(d)); }
  console.log('uploads', JSON.stringify(await G(() => window.__MC3D_GAME__.debug.upLog())));
  ok(fOut.n > 50 && fBack.n > 50, `кадры записаны: туда ${fOut.n}, обратно ${fBack.n}`);
  ok(Math.max(fOut.cpuP99, fBack.cpuP99) < 50, `p99 CPU кадра при стриме: ${fOut.cpuP99}/${fBack.cpuP99} мс (худший ${fOut.cpuMax}/${fBack.cpuMax})`);
  if (!BEFORE) {
    // чанки земли считаются отдельно: живой чанк, хоть раз попавший в кадр, держит свою текстуру, пока он жив (его выгрузка — terrainChunks);
    // утечка чанков = текстур чанков на GPU больше, чем живых чанков. Остальные текстуры (атласы, спрайты) должны вернуться к началу.
    const top1 = await G(() => window.__MC3D_GAME__.debug.vramTop(400)); const chGpu = top1.filter((t) => t.chunk).length, other1 = top1.length - chGpu, other0 = top0.filter((t) => !t.chunk).length;
    ok(chGpu <= c1.live, `нет утечки чанков: текстур чанков на GPU ${chGpu}, живых чанков ${c1.live}`);
    ok(other1 <= other0 + 2, `нет утечки остальных текстур: в начале ${other0}, после прогулки и возврата ${other1} (всего на GPU ${v0.gpuTex} → ${v1.gpuTex}, three: ${v0.three} → ${v1.three})`);
    ok(v1.gpuMB <= v0.gpuMB + Math.max(8, v0.gpuMB * 0.1), `VRAM не выросла после возврата: ${v0.gpuMB} → ${v1.gpuMB} МБ (пик ${Math.max(peakOut, peakBack)} МБ)`);
    ok(c1.live <= c0.live + 2 && c1.evicted > 0, `чанки: в начале ${c0.live}, в конце ${c1.live}, выгружено ${c1.evicted}, запечено ${c1.baked}`);
    ok(v1.radius && v1.radius.loadTiles >= 50 && v1.radius.loadTiles >= v1.radius.viewTiles, `радиус ${JSON.stringify(v1.radius)}`);
    // смена зоны: назад в хаб — текстуры Аринара уходят после grace
    await G(() => window.__MC3D_GAME__.debug.rawSend({ type: 'use_portal', portalId: 'portal_hellfire' })).catch(() => {});
    for (let i = 0; i < 6 && (await G(() => window.__MC3D_GAME__.state().world)) === 'arinar'; i++) { await G(() => window.__MC3D_GAME__.debug.tp(23700, 24040)); await L.sleep(1200); await G(() => window.__MC3D_GAME__.debug.rawSend({ type: 'use_portal', portalId: 'portal_hellfire' })); await L.sleep(1500); }
    const w2 = await G(() => window.__MC3D_GAME__.state().world);
    // крупные атласы держатся 3×grace (см. vramStream) — ждём их срок
  await L.sleep(Math.min(grace * 3, 70000) + 3000); await G(() => window.__MC3D_GAME__.debug.vramTick());
    const v2 = await G(() => window.__MC3D_GAME__.debug.vram());
    console.log('zone', JSON.stringify({ w2, hub0, v2 }));
    if (w2 !== 'arinar') ok(v2.gpuMB < v0.gpuMB, `смена зоны → ${w2}: VRAM ${v0.gpuMB} → ${v2.gpuMB} МБ, текстур ${v0.gpuTex} → ${v2.gpuTex}, выгружено всего ${v2.evicted}`);
    else console.log('NOTE: не удалось вернуться в хаб порталом — проверка смены зоны пропущена');
  }
  const E = errs.filter((e) => !/@clerk\/astro: Missing publishableKey/.test(e)); // Clerk с внешнего домена в харнессе заблокирован (_local.cjs) — не наша ошибка
  ok(!E.length, 'нет ошибок страницы ' + JSON.stringify(E));
  console.log('console.error:', JSON.stringify(cons));
  await ctx.close();
  console.log(fails ? `FAILED ${fails}` : 'ALL PASS'); process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
