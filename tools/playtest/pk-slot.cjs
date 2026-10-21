// LOCAL ONLY: слот кнопки PK у рамки героя (#mc-pf-pk-slot). Ветка dome-city монтирует туда кнопку — здесь макет-заглушка
// 36×36 (рамка + кольцо прогресса), чтобы проверить место. Режимы: новая тема + HUD в поле, новая тема + колонки, старая тема.
const { chromium } = require('playwright-core');
const { guardLocal, assertLocalUrl } = require('./_local.cjs');
const OUT = process.env.OUT || '/workspace/morrisgrad-round3/ui-rework/pk-slot';
const BASE = process.env.UI_BASE || 'http://127.0.0.1:5311/game-panel.html', WS = process.env.UI_WS || 'ws://127.0.0.1:8911';
assertLocalUrl(BASE); assertLocalUrl(WS);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
(async () => {
  require('fs').mkdirSync(OUT, { recursive: true });
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  for (const [tag, theme, hudOld] of [['new-ig', 'new', '0'], ['new-panels', 'new', '1'], ['oldtheme', 'old', '1']]) {
    const ctx = await b.newContext({ viewport: { width: 1280, height: 720 } }); await guardLocal(ctx);
    await ctx.addInitScript(([t, h]) => { try { localStorage.setItem('mc_ui_theme', t); localStorage.setItem('mc_hud_old', h); } catch {} }, [theme, hudOld]);
    const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(String(e).slice(0, 200)));
    await p.goto(assertLocalUrl(`${BASE}?name=PK&uid=pk_${tag}${Date.now().toString(36)}&ws=${WS}&fs=1&debug=1`));
    await p.waitForFunction(() => window.__game?.state?.().mode === 'hub', null, { timeout: 120000 });
    await p.evaluate(() => window.__game.debug.selectClass('warrior')); await sleep(2500); await p.mouse.move(640, 300);
    const frameSel = theme === 'new' && hudOld === '0' ? '.mc-pframe' : '.hud-left .hud-card';
    const info = () => p.evaluate((fs) => { const s = document.querySelectorAll('#mc-pf-pk-slot'), el = s[0], fr = document.querySelector(fs), hp = fs === '.mc-pframe' ? fr?.querySelector('.mc-uibar') : document.getElementById('ghud-my-hp-bar')?.parentElement, val = fs === '.mc-pframe' ? null : document.getElementById('ghud-my-hp-val');
      const R = (e) => { if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; };
      return { n: s.length, inFrame: !!fr && fr.contains(el), frame: el?.dataset.frame, slot: R(el), shown: el ? getComputedStyle(el).display !== 'none' : false, fr: R(fr), hp: R(hp), val: R(val) }; }, frameSel);
    let i = await info();
    ok(i.n === 1 && i.inFrame, `${tag}: один #mc-pf-pk-slot, в видимой рамке героя (${i.frame})`);
    ok(!i.shown, `${tag}: пустой слот скрыт (рамка как раньше)`);
    const fr = i.fr; await p.screenshot({ path: `${OUT}/${tag}-empty.png`, clip: { x: Math.max(0, fr.x - 6), y: Math.max(0, fr.y - 6), width: fr.w + 12, height: fr.h + 12 } });
    // макет кнопки dome-city: квадрат в рамке + кольцо прогресса (только для проверки места)
    await p.evaluate(() => { const b = document.createElement('button'); b.className = 'pk-mock'; b.title = 'PK (макет)';
      b.style.cssText = 'width:36px;height:36px;padding:0;border:6px solid transparent;border-image:url(/mc-ui/frame_small.png) 5 fill / 10px stretch;image-rendering:pixelated;background:#1a1626;color:#e05a6e;font:bold 11px monospace;display:grid;place-items:center;box-sizing:border-box;position:relative';
      b.innerHTML = '<span>PK</span><i style="position:absolute;inset:-3px;border-radius:50%;background:conic-gradient(#e05a6e 0 65%, transparent 65%);-webkit-mask:radial-gradient(circle, transparent 15px, #000 16px);mask:radial-gradient(circle, transparent 15px, #000 16px);pointer-events:none"></i>';
      document.getElementById('mc-pf-pk-slot').appendChild(b); });
    await sleep(400); i = await info();
    const ov = (a, c) => a && c && a.x < c.x + c.w && c.x < a.x + a.w && a.y < c.y + c.h && c.y < a.y + a.h;
    ok(i.shown && Math.round(i.slot.w) === 36 && Math.round(i.slot.h) === 36, `${tag}: с кнопкой слот 36×36 (${i.slot && Math.round(i.slot.w)}×${i.slot && Math.round(i.slot.h)})`);
    ok(i.slot.x >= i.hp.x + i.hp.w - 1 && i.slot.y < i.hp.y + i.hp.h + 14 && i.slot.y + i.slot.h > i.hp.y - 14, `${tag}: справа от полоски ОЗ, на её уровне (ОЗ до x=${Math.round(i.hp.x + i.hp.w)}, слот x=${Math.round(i.slot.x)})`);
    ok(i.slot.x + i.slot.w <= i.fr.x + i.fr.w + 1 && i.slot.y >= i.fr.y - 1 && i.slot.y + i.slot.h <= i.fr.y + i.fr.h + 1, `${tag}: внутри рамки героя`);
    ok(!ov(i.slot, i.hp) && !ov(i.slot, i.val), `${tag}: не перекрывает полоску ОЗ и подпись`);
    const f2 = i.fr; await p.screenshot({ path: `${OUT}/${tag}-with-mock.png`, clip: { x: Math.max(0, f2.x - 6), y: Math.max(0, f2.y - 6), width: f2.w + 12, height: f2.h + 12 } });
    ok(!errs.length, `${tag}: без ошибок страницы ${errs.join(' | ')}`);
    await ctx.close();
  }
  console.log(fails ? `pk-slot FAILED (${fails})` : 'pk-slot ok');
  await b.close(); process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
