// HTTP-тесты безопасности сайта против ЛОКАЛЬНОГО astro dev (только 127.0.0.1/localhost — иначе тест падает сразу).
// Запуск: FORUM_DEV_AUTH=1 в .dev.vars, `npx astro dev --host 127.0.0.1 --port 4395`, затем
//   BASE=http://127.0.0.1:4395 node tools/tests/security-http-test.mjs
// Плюс браузерная проверка XSS чата: XSS=1 (нужен playwright-core и запись тестового сообщения в локальный D1).
const BASE = process.env.BASE || "http://127.0.0.1:4395";
if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(BASE)) { console.log("FAIL: только локальный адрес"); process.exit(2); }
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL " + m); } };
const DEV = { cookie: "mg_dev_noclerk=1" }; // локально без ключей Clerk (ветка только для astro dev)
const req = (path, o = {}) => fetch(BASE + path, { redirect: "manual", ...o, headers: { ...DEV, ...(o.headers || {}) } });
const J = { "content-type": "application/json" };

// 1. CSRF: чужой Origin → 403 до любой логики; свой Origin → дальше (401 без входа)
for (const [m, p] of [["POST", "/api/chat"], ["DELETE", "/api/chat"], ["POST", "/api/inventory"], ["POST", "/api/scores"], ["POST", "/api/konkurs"], ["POST", "/profile"], ["POST", "/api/forum/topics"]]) {
  const r = await req(p, { method: m, headers: { ...J, origin: "https://evil.example" }, body: m === "DELETE" ? undefined : "{}" });
  ok(r.status === 403, `CSRF ${m} ${p} с чужого Origin → 403 (было ${r.status})`);
}
{ const r = await req("/api/chat", { method: "POST", headers: { ...J, origin: BASE }, body: JSON.stringify({ message: "hi" }) }); ok(r.status === 401, "свой Origin без входа → 401, не 403 (" + r.status + ")"); }
{ const r = await req("/api/chat", { method: "POST", headers: { ...J, "sec-fetch-site": "cross-site" }, body: "{}" }); ok(r.status === 403, "Sec-Fetch-Site: cross-site → 403"); }

// 2. заголовки безопасности на странице, API и 404
for (const p of ["/", "/chat", "/api/scores", "/games", "/no-such-page-xyz"]) {
  const r = await req(p);
  const h = (k) => r.headers.get(k) || "";
  ok(/frame-ancestors 'self'/.test(h("content-security-policy")), `CSP frame-ancestors ${p}`);
  ok(h("x-frame-options") === "SAMEORIGIN", `X-Frame-Options ${p}`);
  ok(h("x-content-type-options") === "nosniff", `nosniff ${p}`);
  ok(h("referrer-policy") && h("permissions-policy"), `Referrer/Permissions-Policy ${p}`);
}

// 3. /api/leaderboard удалён (запись без проверок)
{ const r = await req("/api/leaderboard", { method: "POST", headers: { ...J, origin: BASE }, body: JSON.stringify({ name: "<img src=x onerror=alert(1)>", score: 1e9 }) }); ok(r.status === 404, "/api/leaderboard POST → 404 (" + r.status + ")"); }

// 4. рекорды: очки — конечное число в пределах
for (const score of ["1e400", 1e12, -5, "abc", null]) {
  const r = await req("/api/scores", { method: "POST", headers: { ...J, origin: BASE }, body: JSON.stringify({ name: "ABC", score }) });
  ok(r.status === 400, `scores: score=${score} → 400 (${r.status})`);
}

// 5. конкурс: лимит длины (анонимная запись в R2)
{ const r = await req("/api/konkurs", { method: "POST", headers: { ...J, origin: BASE }, body: JSON.stringify({ author: "A", name: "B", text: "x".repeat(200_001) }) }); ok(r.status === 400, "konkurs: текст > 200k → 400 (" + r.status + ")"); }
{ const r = await req("/api/konkurs", { method: "POST", headers: { ...J, origin: BASE }, body: JSON.stringify({ author: { a: 1 }, name: "B", text: "c" }) }); ok(r.status === 400, "konkurs: не строка → 400 (" + r.status + ")"); }

// 6. ошибки без внутренних деталей
{ const r = await req("/api/chat?after=0"); const t = await r.text(); ok(!/details|stack|D1_ERROR|SQLITE/i.test(t), "chat GET без внутренних деталей"); }

// 7. XSS чата в браузере (сообщение с HTML уже записано в локальный D1 скриптом запуска)
if (process.env.XSS === "1") {
  const { chromium } = (await import("node:module")).createRequire(import.meta.url)(process.env.PW_CORE || "/workspace/mc-ui-tools/node_modules/playwright-core");
  const b = await chromium.launch({ executablePath: "/usr/bin/google-chrome" });
  const ctx = await b.newContext();
  await ctx.route("**/*", (r) => (/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?\//.test(r.request().url()) || /^(data|blob):/.test(r.request().url()) ? r.continue() : r.abort()));
  await ctx.addCookies([{ name: "mg_dev_noclerk", value: "1", url: BASE }]);
  const p = await ctx.newPage();
  const dialogs = []; p.on("dialog", (d) => { dialogs.push(d.message()); d.dismiss(); });
  await p.addInitScript(() => { localStorage.clear(); });
  await p.goto(BASE + "/chat", { waitUntil: "domcontentloaded" });
  await p.waitForSelector(".msg-row", { timeout: 20000 }).catch(() => {});
  await p.waitForTimeout(1500);
  const r = await p.evaluate(() => ({ pwn: (window).__pwn || 0, imgs: document.querySelectorAll(".msg-text img, .msg-nick img").length, txt: [...document.querySelectorAll(".msg-text")].map((e) => e.textContent).join("|"), nick: [...document.querySelectorAll(".msg-nick")].map((e) => e.textContent).join("|") }));
  ok(r.pwn === 0 && dialogs.length === 0, "чат: скрипт из сообщения/ника не выполнился");
  ok(r.imgs === 0, "чат: HTML из сообщения не стал элементом");
  ok(r.txt.includes("<img src=x onerror="), "чат: текст показан как есть (экранирован)");
  ok(r.nick.includes("<svg onload="), "чат: ник показан как текст");
  await b.close();
}
console.log(`security-http-test: ${pass} PASS, ${fail} FAIL`);
if (fail) process.exit(1);
