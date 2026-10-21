// LOCAL: полировка Альказака — ночь (огни вразнобой, ореолы), NPC на местах, интерьер, GIF заката. Только 127.0.0.1.
const { chromium } = require('playwright-core');
const { execFileSync } = require('child_process');
const fs = require('fs');
const { guardLocal, assertLocalUrl } = require('./_local.cjs');
const OUT = process.env.OUT || '/workspace/morrisgrad-round3/dome-city/polish';
const BASE = process.env.C_BASE || 'http://127.0.0.1:5297/game.html', WS = process.env.C_WS || 'ws://127.0.0.1:8883';
assertLocalUrl(BASE); assertLocalUrl(WS); fs.mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const CX = 24624, CY = 3376; let R = 1280;
let ok = 0, bad = 0; const t = (n, c, x) => { c ? (ok++, console.log('ok  ', n)) : (bad++, console.log('FAIL', n, x === undefined ? '' : JSON.stringify(x))); };
const gif = (dir, name, fps = 10) => { try { execFileSync('nice', ['ffmpeg', '-y', '-loglevel', 'error', '-framerate', String(fps), '-i', `${dir}/f%03d.png`, '-vf', 'scale=640:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=128[p];[b][p]paletteuse=dither=bayer', `${OUT}/${name}.gif`]); return fs.statSync(`${OUT}/${name}.gif`).size; } catch (e) { console.log('gif', String(e)); return 0; } };
(async () => {
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const ctx = await b.newContext({ viewport: { width: 1280, height: 760 } }); await guardLocal(ctx);
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(String(e)));
  await p.goto(assertLocalUrl(`${BASE}?name=polish_t&uid=polish_t&ws=${WS}&fs=1&debug=1`));
  await p.waitForFunction(() => window.__game?.state?.().mode === 'hub', null, { timeout: 120000 }); await sleep(800);
  const G = (f, a) => p.evaluate(f, a);
  if ((await G(() => window.__game.state().player?.stats?.classId)) == null) { await G(() => window.__game.debug.selectClass('warrior')); await sleep(1500); }
  for (let i = 0; i < 8 && (await G(() => window.__game.state().world)) !== 'arinar'; i++) { await G(() => { window.__game.debug.rawSend({ type: 'dev_teleport', x: 240, y: 600 }); window.__game.debug.teleport(240, 600); }); await sleep(1200); await G(() => window.__game.debug.rawSend({ type: 'use_portal', portalId: 'portal_arinar' })); await sleep(3000); }
  t('в Аринаре', (await G(() => window.__game.state().world)) === 'arinar');
  const dev = async (o) => { await G((o) => { window.__devCity = null; window.__game.debug.rawSend({ type: 'dev_grant', city: o }); }, o); await p.waitForFunction(() => window.__devCity, null, { timeout: 8000 }); return G(() => window.__devCity); };
  const dome = () => G(() => window.__game.debug.city().dome);
  const hud = () => G(() => window.__game.debug.city().hud);
  const tp = async (x, y) => { await G(([x, y]) => window.__game.debug.tp(x, y, true), [x, y]); await sleep(1800); };
  const cells = (c) => G((c) => window.__game.debug.setCells(c), c);
  const pin = async (m) => { await G((m) => window.__game.debug.dn({ pin: m }), m); };
  const shot = async (n) => { await p.screenshot({ path: `${OUT}/${n}.png` }); console.log('shot', n); };
  const d0 = await dev({ pk: false, clearKills: true });
  // ——— NPC: все 24 места включены (заглушки — готовые листы NPC) ———
  const allOn = Array.from({ length: 24 }, (_, i) => i); const d1 = await dev({ npcOn: allOn }); await sleep(2500);
  await tp(CX, CY + 60); await G(() => window.__game.debug.setCells(34, true)); await pin('12:00'); await sleep(3500);
  await shot('day-1200-wide');
  const npcN = await G(() => window.__game.state().npcs?.length ?? null).catch(() => null);
  await shot('npc-slots-outdoor'); const npcList = d1.city.npc || []; console.log('npc slots on', npcList.length, 'outdoor', npcList.filter((n) => !n.house).length);
  t('NPC: все 24 места включены (клиенту приходят только включённые)', npcList.length === 24, npcList.length);
  // ——— день / закат / ночь / рассвет на площади с фонарями ———
  await G(() => window.__game.debug.setCells(24, true)); await sleep(1500);
  for (const s of ['12:00', '19:40', '19:50', '20:00', '23:00', '05:45']) {
    await pin(s); await sleep(1200); const l = await G(() => window.__game.debug.cityLamps()); const d = await G(() => window.__game.debug.dn());
    const on = l.filter((x) => x > 0.95).length, mid = l.filter((x) => x > 0.03 && x <= 0.95).length, off = l.filter((x) => x <= 0.03).length;
    console.log(s, JSON.stringify({ phase: d.phase, n: d.n, lamps: { on, mid, off } }));
    if (s === '12:00') t('днём огни погашены', on === 0 && mid === 0, { on, mid });
    if (s === '19:40') t('19:40: огни загораются вразнобой (часть горит, часть нет)', on + mid > 0 && off + mid > 0, { on, mid, off });
    if (s === '23:00') t('ночью горят все огни', l.length > 20 && off === 0 && on === l.length, { on, mid, off, n: l.length });
    if (s === '05:45') t('05:45: гаснут вразнобой', on + mid > 0 && off + mid > 0, { on, mid, off });
    await shot(`city-${s.replace(':', '')}`);
    if (s === '23:00') { const nl = await G(() => window.__game.debug.dn()); t('ночью NPC/герои/мобы светятся (есть источники)', nl.n > 60, nl.n); }
  }
  // ——— в доме (трактир, ночь): маски нет, интерьер ———
  const inn = d1.city.b.find((b) => b[0] === 'tavern'); await pin('23:00');
  await tp(inn[8], inn[9] + 70); await p.mouse.move(640, 380); await p.keyboard.down('w'); await sleep(1600); await p.keyboard.up('w'); await sleep(2500);
  const room = await G(() => window.__game.debug.city().room); const dIn = await G(() => window.__game.debug.dn());
  t('в доме: интерьер, без ночной маски', (room?.id === 'tavern' || room?.room?.id === 'tavern') && !dIn.active, { room, active: dIn.active }); await G(() => window.__game.debug.setCells(14, true)); await sleep(1500); await shot('inside-tavern-night');
  // ——— GIF заката на площади: 19:26 … 20:04 ———
  await tp(CX, CY + 60); await G(() => window.__game.debug.setCells(24, true)); await sleep(2500);
  const gd = `${OUT}/gif`; fs.rmSync(gd, { recursive: true, force: true }); fs.mkdirSync(gd); let i = 0;
  for (let m = 19 * 60 + 26; m <= 20 * 60 + 4; m++, i++) { await pin(m); await sleep(220); await p.screenshot({ path: `${gd}/f${String(i).padStart(3, '0')}.png` }); }
  t('GIF заката', gif(gd, 'dusk-city', 8) > 20000);
  await pin(null); await dev({ npcOn: d0.city.npc.map((n, i) => (n.on ? i : -1)).filter((i) => i >= 0) });
  t('без ошибок страницы', errs.length === 0, errs.slice(0, 3));
  console.log(`city-polish: ${ok} ok, ${bad} fail`); await b.close(); process.exit(bad ? 1 : 0);
})().catch((e) => { console.error('FAIL', e); process.exit(1); });
