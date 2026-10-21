// Тесты безопасности сайта (чистые функции). Запуск: bun tools/tests/security-site-test.ts
import { isCrossSiteWrite, withSecurityHeaders, SECURITY_HEADERS, siteNickProblem } from "../../src/lib/security";
import { readFileSync } from "fs";
import { cleanInventoryItem } from "../../src/lib/inventoryItem";
import { rateLimit, guardAnonWrite, checkTurnstile, memLimit, _resetMem, LIMITS } from "../../src/lib/antiabuse";

let fails = 0, passes = 0;
const ok = (c: any, m: string) => { if (c) passes++; else { fails++; console.log("FAIL " + m); } };
const H = (o: Record<string, string>) => new Headers(o);
const U = "https://morrisgrad.com/api/chat";

// --- CSRF ---
ok(!isCrossSiteWrite("GET", U, H({ origin: "https://evil.example" })), "GET не проверяется");
ok(!isCrossSiteWrite("POST", U, H({ origin: "https://morrisgrad.com" })), "свой Origin — можно");
ok(isCrossSiteWrite("POST", U, H({ origin: "https://evil.example" })), "чужой Origin — отказ");
ok(isCrossSiteWrite("DELETE", U, H({ origin: "https://morrisgrad.com.evil.example" })), "похожий домен — отказ");
ok(isCrossSiteWrite("POST", U, H({ origin: "http://morrisgrad.com" })), "другая схема — отказ");
ok(isCrossSiteWrite("POST", U, H({ origin: "null" })), "Origin null (sandbox/data:) — отказ");
ok(isCrossSiteWrite("PUT", U, H({ "sec-fetch-site": "cross-site" })), "без Origin, Sec-Fetch-Site cross-site — отказ");
ok(isCrossSiteWrite("PUT", U, H({ "sec-fetch-site": "same-site" })), "поддомен (same-site) — отказ");
ok(!isCrossSiteWrite("POST", U, H({ "sec-fetch-site": "same-origin" })), "same-origin без Origin — можно");
ok(!isCrossSiteWrite("POST", U, H({})), "без заголовков (не браузер) — пропуск");
ok(!isCrossSiteWrite("POST", "http://localhost:4321/profile", H({ origin: "http://localhost:4321" })), "локальная разработка");

// --- заголовки безопасности ---
{
  const r = withSecurityHeaders(new Response("x"), true);
  for (const k of Object.keys(SECURITY_HEADERS)) ok(r.headers.get(k), "заголовок " + k);
  ok(/frame-ancestors 'self'/.test(r.headers.get("content-security-policy") || ""), "CSP frame-ancestors");
  const media = withSecurityHeaders(new Response("x", { headers: { "content-security-policy": "default-src 'none'; sandbox" } }), true);
  ok(media.headers.get("content-security-policy") === "default-src 'none'; sandbox", "своя CSP ответа не перетирается");
  const red = withSecurityHeaders(Response.redirect("https://morrisgrad.com/", 302), true);
  ok(red.status === 302 && red.headers.get("location") && red.headers.get("x-frame-options") === "SAMEORIGIN", "редирект (неизменяемые заголовки) — копия с заголовками");
  ok(!withSecurityHeaders(new Response("x"), false).headers.has("strict-transport-security"), "HSTS только по https");
  // public/_headers совпадает с SECURITY_HEADERS
  const hf = readFileSync(new URL("../../public/_headers", import.meta.url), "utf8").toLowerCase();
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) ok(hf.includes(`${k}: ${v}`.toLowerCase()), "_headers: " + k);
}

// --- ник сайта ---
ok(siteNickProblem("Лорин Death_1.") === null, "обычный ник");
for (const bad of ["<svg onload=alert()>", 'a"b', "a'b", "x&y", "a<b", "tab\there", "emoji😀"]) ok(siteNickProblem(bad), "запрещён: " + bad);

// --- предметы /api/inventory ---
{
  const x = cleanInventoryItem({ id: "sw1", name: "Меч", source: "Neon", type: "weapon", rarity: "epic", icon: "⚔️", stats: { atk: 5, "<b>": 1, hp: "NaN", big: 1e12 }, setStats: null, extra: "x" })!;
  ok(x && x.name === "Меч" && x.stats.atk === 5 && !("<b>" in x.stats) && !("hp" in x.stats) && !("big" in x.stats) && !("extra" in (x as any)), "чистка статов и лишних полей");
  ok(cleanInventoryItem({ name: "a", icon: "javascript:alert(1)" })!.icon.length <= 16, "иконка не-https режется до короткого текста");
  ok(cleanInventoryItem({ name: "a", icon: "http://x.example/a.png" })!.icon === "📦", "http-иконка отклонена");
  ok(cleanInventoryItem({ name: "a", icon: "https://x.example/a.png" })!.icon === "https://x.example/a.png", "https-иконка принята");
  ok(cleanInventoryItem({ name: "a", rarity: "<script>" })!.rarity === "common", "rarity из списка");
  ok(cleanInventoryItem({ name: "x".repeat(1000), source: "y".repeat(1000) })!.name.length === 80, "длина имени");
  ok(cleanInventoryItem({ name: "" }) === null && cleanInventoryItem(null) === null && cleanInventoryItem([1]) === null, "пустые/не объекты отклонены");
}

// --- анонимные записи: лимит по IP + Turnstile по флагу ---
{
  _resetMem();
  const req = (ip: string, h: Record<string, string> = {}) => new Request("https://morrisgrad.com/api/scores", { method: "POST", headers: { "cf-connecting-ip": ip, ...h } });
  let n = 0; for (let i = 0; i < 10; i++) if (await rateLimit({}, "scores", req("1.1.1.1"))) n++;
  ok(n === LIMITS.scores, `рекорды: не больше ${LIMITS.scores}/мин с одного IP (запасной счётчик)`);
  ok(await rateLimit({}, "scores", req("2.2.2.2")), "другой IP — свой лимит");
  ok(memLimit("x", 1, 0) && !memLimit("x", 1, 1000) && memLimit("x", 1, 61_000), "окно минута");
  let bindKey = ""; const env = { RL_KONKURS: { limit: async ({ key }: any) => { bindKey = key; return { success: false }; } } };
  ok(!(await rateLimit(env, "konkurs", req("3.3.3.3"))) && bindKey === "konkurs:3.3.3.3", "привязка Cloudflare Rate Limiting используется, ключ по IP");
  const r429 = await guardAnonWrite(env, "konkurs", req("3.3.3.3")); ok(r429?.status === 429, "лимит → 429");
  ok(await checkTurnstile({}, req("4.4.4.4")) === null, "Turnstile выключен по умолчанию");
  ok((await checkTurnstile({ TURNSTILE_ENABLED: "1" }, req("4.4.4.4")))?.status === 503, "флаг включён без ключей — отказ (не пропускаем молча)");
  const tsEnv = { TURNSTILE_ENABLED: "1", PUBLIC_TURNSTILE_SITE_KEY: "site", TURNSTILE_SECRET_KEY: "sec" };
  const r1 = await checkTurnstile(tsEnv, req("4.4.4.4")); const j1: any = await r1?.json();
  ok(r1?.status === 403 && j1.turnstile === true && j1.sitekey === "site" && !JSON.stringify(j1).includes("sec\""), "без токена → 403 + публичный sitekey, секрет не отдаётся");
  const fake = (success: boolean) => (async () => new Response(JSON.stringify({ success }))) as any;
  ok(await checkTurnstile(tsEnv, req("4.4.4.4", { "x-turnstile": "t" }), fake(true)) === null, "верный токен — пропуск");
  ok((await checkTurnstile(tsEnv, req("4.4.4.4", { "x-turnstile": "t" }), fake(false)))?.status === 403, "неверный токен — отказ");
  ok((await checkTurnstile(tsEnv, req("4.4.4.4", { "x-turnstile": "t" }), (async () => { throw new Error("net"); }) as any))?.status === 403, "сбой проверки — отказ");
  const wj = readFileSync("wrangler.jsonc", "utf8");
  ok(/"RL_SCORES"[^}]*"limit": 6/.test(wj) && /"RL_KONKURS"[^}]*"limit": 2/.test(wj) && /"RL_CHAT"[^}]*"limit": 20/.test(wj) && LIMITS.scores === 6 && LIMITS.konkurs === 2 && LIMITS.chat === 20, "лимиты в wrangler.jsonc совпадают с кодом");
  ok(!/TURNSTILE_SECRET_KEY/.test(wj), "секрет Turnstile не в wrangler.jsonc");
}

console.log(`security-site-test: ${passes} PASS, ${fails} FAIL`);
if (fails) process.exit(1);
