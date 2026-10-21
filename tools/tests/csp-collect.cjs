// Сбор нарушений CSP (Report-Only) по всем страницам сайта и игре — ТОЛЬКО локально (astro dev + локальный игровой сервер).
//   BASE=http://127.0.0.1:4395 WS=ws://127.0.0.1:8797 node tools/tests/csp-collect.cjs [out.json]
// Внешние запросы обрываются (_local guard), но нарушение CSP браузер фиксирует до запроса — его видно и так.
const { chromium } = require(process.env.PW_CORE || "/workspace/mc-ui-tools/node_modules/playwright-core");
const { guardLocal, assertLocalUrl } = require("../playtest/_local.cjs");
const fs = require("fs"), path = require("path");
const BASE = assertLocalUrl(process.env.BASE || "http://127.0.0.1:4395");
const WS = process.env.WS || "ws://127.0.0.1:8797";
const out = process.argv[2] || "/workspace/morrisgrad-round3/sec2/csp-violations.json";
const pagesDir = path.join(__dirname, "../../src/pages");
const routes = new Set(["/", "/forum", "/forum/t/1", "/forum/t/2", "/forum/u/1", "/forum/rules", "/forum/new", "/u/1", "/u/user_cspTestAAAAAAAA", "/profile", "/chat", "/inventory"]);
(function walk(d, pre) { for (const f of fs.readdirSync(d)) { const p = path.join(d, f); if (fs.statSync(p).isDirectory()) { if (!/^[_\[]|^api$|^forum$|^u$/.test(f)) walk(p, pre + "/" + f); continue; }
  const m = f.match(/^([^\[_][^.]*)\.astro$/); if (m) routes.add((pre + "/" + (m[1] === "index" ? "" : m[1])).replace(/\/$/, "") || "/"); } })(pagesDir, "");
routes.delete("/404");
(async () => {
  const b = await chromium.launch({ executablePath: "/usr/bin/google-chrome" });
  const ctx = await b.newContext({ viewport: { width: 1366, height: 800 } });
  await guardLocal(ctx);
  await ctx.addCookies([{ name: "mg_dev_noclerk", value: "1", url: BASE }]);
  await ctx.addInitScript(() => { window.__csp = []; document.addEventListener("securitypolicyviolation", (e) => window.__csp.push({ dir: e.effectiveDirective, blocked: e.blockedURI, src: (e.sourceFile || "") + ":" + e.lineNumber, sample: (e.sample || "").slice(0, 80), disp: e.disposition })); });
  const all = [];
  const visit = async (route, act) => {
    const p = await ctx.newPage();
    try {
      const r = await p.goto(BASE + route, { waitUntil: "load", timeout: 45000 });
      await p.waitForTimeout(1500);
      if (act) await act(p);
      const v = await p.evaluate(() => window.__csp || []);
      const st = r ? r.status() : 0;
      for (const x of v) all.push({ page: route, ...x, blocked: x.blocked.replace(/\?.*$/, "") });
      console.log(`${st} ${route} — нарушений: ${v.length}${p.url() !== BASE + route ? " → " + p.url().replace(BASE, "") : ""}`);
    } catch (e) { console.log(`ERR ${route}: ${String(e.message).slice(0, 100)}`); }
    await p.close();
  };
  for (const r of [...routes].sort()) await visit(r);
  // игра: запуск (локальный игровой сервер), 15 с загрузки
  await visit(`/MorrisCurse?ws=${encodeURIComponent(WS)}`, async (p) => { await p.click("#btn-start").catch(() => {}); await p.waitForTimeout(15000); await p.screenshot({ path: "/workspace/morrisgrad-round3/sec2/csp-game.png" }); });
  fs.writeFileSync(out, JSON.stringify(all, null, 1));
  const groups = {}; for (const x of all) { const k = `${x.dir} | ${x.blocked || "(inline)"} | ${x.src.replace(/:\d+$/, "")}`; (groups[k] = groups[k] || new Set()).add(x.page); }
  console.log(`\nВсего нарушений: ${all.length}, разных: ${Object.keys(groups).length}`);
  for (const [k, s] of Object.entries(groups)) console.log(`  ${k}  ← ${[...s].slice(0, 4).join(", ")}${s.size > 4 ? ` (+${s.size - 4})` : ""}`);
  await b.close();
})();
