// Скриншоты до/после обновления зависимостей — ТОЛЬКО локально. BASE=http://127.0.0.1:4395 TAG=before node tools/tests/deps-shots.cjs
const { chromium } = require(process.env.PW_CORE || "/workspace/mc-ui-tools/node_modules/playwright-core");
const { guardLocal, assertLocalUrl } = require("../playtest/_local.cjs");
const BASE = assertLocalUrl(process.env.BASE || "http://127.0.0.1:4395"), TAG = process.env.TAG || "before";
const WS = process.env.WS || "ws://127.0.0.1:8797", OUT = process.env.OUT || "/workspace/morrisgrad-round3/sec2";
const pages = [["home", "/"], ["forum", "/forum"], ["topic", "/forum/t/2"], ["user", "/u/1"], ["game", `/MorrisCurse?ws=${encodeURIComponent(WS)}`]];
(async () => {
  const b = await chromium.launch({ executablePath: "/usr/bin/google-chrome" });
  for (const [dev, opt] of [["pc", { viewport: { width: 1366, height: 800 } }], ["phone", { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }]]) {
    const ctx = await b.newContext(opt); await guardLocal(ctx);
    await ctx.addCookies([{ name: "mg_dev_noclerk", value: "1", url: BASE }]);
    const errs = [];
    for (const [name, path] of pages) {
      const p = await ctx.newPage(); p.on("pageerror", (e) => errs.push(`${dev}/${name}: ${String(e.message).slice(0, 120)}`));
      const r = await p.goto(BASE + path, { waitUntil: "load", timeout: 60000 }).catch((e) => null);
      await p.waitForTimeout(2500);
      if (name === "game") { await p.click("#btn-start", { timeout: 5000 }).catch(() => {}); await p.waitForTimeout(14000); }
      await p.screenshot({ path: `${OUT}/${TAG}-${dev}-${name}.png` });
      console.log(`${TAG} ${dev} ${name}: ${r ? r.status() : "ERR"}`);
      await p.close();
    }
    if (errs.length) console.log("ошибки JS:\n  " + errs.join("\n  "));
    await ctx.close();
  }
  await b.close();
})();
