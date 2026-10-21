// Два профиля игрока — сайт (/u/<номер>) и форум (/forum/u/<номер>) — одинаковые правила. ТОЛЬКО локально.
//   BASE=http://127.0.0.1:4395 TAG=after node tools/tests/profiles-test.cjs   (нужны тестовые данные: pid 1 «Тестер», pid 3 — ник с HTML)
// Проверяет гостем и вошедшим: номер вместо id Clerk (адреса, HTML, JSON), 301 со старых адресов, только публичные поля,
// экранирование (ник <svg onload> не выполняется), картинка по умолчанию через /api/avatar/<номер>, ссылки между профилями,
// автор темы → профиль форума, чат → /u/<номер>. Снимки профиля форума (ПК + телефон) — OUT/TAG-{pc,phone}-forumprofile.png.
const { chromium } = require(process.env.PW_CORE || "/workspace/mc-ui-tools/node_modules/playwright-core");
const { guardLocal, assertLocalUrl } = require("../playtest/_local.cjs");
const BASE = assertLocalUrl(process.env.BASE || "http://127.0.0.1:4395"), TAG = process.env.TAG || "after";
const OUT = process.env.OUT || "/workspace/morrisgrad-round3/sec2";
const CLERK = /user_[A-Za-z0-9]{8,}/;
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL " + m); } };
const get = (p, h = {}) => fetch(BASE + p, { redirect: "manual", headers: { cookie: "mg_dev_noclerk=1", ...h } });
(async () => {
  // HTTP: адреса, редиректы, JSON
  for (const [old, want] of [["/forum/u/user_cspTestAAAAAAAA", "/forum/u/1"], ["/u/user_cspTestAAAAAAAA", "/u/1"]]) {
    const r = await get(old); ok(r.status === 301 && (r.headers.get("location") || "").endsWith(want), `${old} → 301 ${want} (${r.status} ${r.headers.get("location")})`);
  }
  for (const p of ["/forum/u/abc", "/forum/u/0", "/u/abc"]) { const r = await get(p); ok(r.status === 404, `${p} → 404 (${r.status})`); }
  const fj = await get("/api/forum/user/1", { "x-forum": "1" }); const ft = await fj.text();
  ok(fj.status === 200 && !CLERK.test(ft) && !/"user_id"/.test(ft), "форум API профиля: 200, без id Clerk/user_id");
  const pj = await get("/api/public-profile?pid=1"); const pt = await pj.text();
  ok(pj.status === 200 && !CLERK.test(pt) && /"pid":1/.test(pt), "public-profile: 200, номер, без id Clerk");
  const av = await get("/api/avatar/3"); const at = await av.text();
  ok(av.status === 200 && /image\/svg\+xml/.test(av.headers.get("content-type") || "") && /sandbox/.test(av.headers.get("content-security-policy") || "") && !/<script|\son\w+=/i.test(at), "/api/avatar/<номер>: SVG с CSP sandbox, без скриптов");
  ok((await get("/api/avatar/user_xssTestBBBBBBBB")).status === 400, "/api/avatar по id Clerk → 400");

  const b = await chromium.launch({ executablePath: "/usr/bin/google-chrome" });
  for (const [dev, opt] of [["pc", { viewport: { width: 1366, height: 800 } }], ["phone", { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }]]) {
    for (const who of ["guest", "signed"]) {
      const ctx = await b.newContext(opt); await guardLocal(ctx);
      const cookies = [{ name: "mg_dev_noclerk", value: "1", url: BASE }];
      if (who === "signed") cookies.push({ name: "mg_dev_uid", value: "user_cspTestAAAAAAAA", url: BASE });
      await ctx.addCookies(cookies);
      const p = await ctx.newPage(); const tag = `${dev}/${who}`;
      // профиль форума игрока с ником-HTML
      let r = await p.goto(BASE + "/forum/u/3", { waitUntil: "load" }); await p.waitForTimeout(1500);
      let html = await p.content();
      ok(r.status() === 200, `${tag} /forum/u/3 открывается (${r.status()})`);
      ok(!CLERK.test(html), `${tag} /forum/u/3: в HTML нет id Clerk`);
      ok(!(await p.evaluate(() => window.__pwn)), `${tag} /forum/u/3: ник с HTML не выполняется`);
      ok(!/data-ban="|data-unban="|data-ava-remove="/.test(html), `${tag} /forum/u/3: кнопки модератора не-модератору не показаны`);
      const site = await p.getAttribute("[data-site-profile]", "href", { timeout: 3000 }).catch(() => null);
      ok(site === "/u/3", `${tag} профиль форума → профиль сайта (/u/3): ${site}`);
      if (who === "guest" && !process.env.NOSHOT) await p.screenshot({ path: `${OUT}/${TAG}-${dev}-forumprofile.png` });
      // профиль сайта
      r = await p.goto(BASE + "/u/3", { waitUntil: "load" }); await p.waitForTimeout(800); html = await p.content();
      ok(r.status() === 200 && !CLERK.test(html), `${tag} /u/3: 200, без id Clerk`);
      ok(!(await p.evaluate(() => window.__pwn)), `${tag} /u/3: ник с HTML не выполняется`);
      const ava = await p.getAttribute(".profile-avatar", "src", { timeout: 3000 }).catch(() => null); ok(ava === "/api/avatar/3", `${tag} /u/3: картинка по умолчанию через /api/avatar/3 (${ava})`);
      const okImg = await p.evaluate(() => { const i = document.querySelector(".profile-avatar"); return !!i && i.complete && i.naturalWidth > 0; });
      ok(okImg, `${tag} /u/3: картинка по умолчанию загрузилась`);
      ok((await p.getAttribute("[data-forum-profile]", "href", { timeout: 3000 }).catch(() => null)) === "/forum/u/3", `${tag} профиль сайта → профиль форума`);
      if (who === "guest" && !process.env.NOSHOT) await p.screenshot({ path: `${OUT}/${TAG}-${dev}-siteprofile.png` });
      // автор темы → профиль форума
      await p.goto(BASE + "/forum/t/1", { waitUntil: "load" });
      const au = await p.$$eval("a[href^='/forum/u/']", (as) => as.map((a) => a.getAttribute("href")));
      ok(au.length > 0 && au.every((h) => /^\/forum\/u\/\d+$/.test(h)), `${tag} тема: ссылки на авторов — /forum/u/<номер> (${[...new Set(au)].join(",")})`);
      if (au.length) { const r2 = await p.goto(BASE + au[0], { waitUntil: "load" }); ok(r2.status() === 200, `${tag} переход автор → профиль форума 200`); }
      // чат → /u/<номер>
      await p.goto(BASE + "/chat", { waitUntil: "load" }); await p.waitForTimeout(2500);
      const ch = await p.$$eval("a.msg-nick", (as) => as.map((a) => a.getAttribute("href")));
      ok(ch.length > 0 && ch.every((h) => /^\/u\/\d+$/.test(h)), `${tag} чат: ник → /u/<номер> (${[...new Set(ch)].join(",")})`);
      const chImgs = await p.$$eval(".chat-messages img, img.msg-avatar, .msg img", (is) => is.map((i) => i.getAttribute("src")));
      ok(chImgs.every((s) => !CLERK.test(s || "")), `${tag} чат: в адресах картинок нет id Clerk`);
      ok(!(await p.evaluate(() => window.__pwn)), `${tag} чат: HTML в сообщении/нике не выполняется`);
      await ctx.close();
    }
  }
  await b.close();
  console.log(`profiles-test (${TAG}): ${pass} PASS, ${fail} FAIL`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
