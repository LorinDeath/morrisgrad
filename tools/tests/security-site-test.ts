// Тесты безопасности сайта (чистые функции). Запуск: bun tools/tests/security-site-test.ts
import { isCrossSiteWrite, withSecurityHeaders, SECURITY_HEADERS } from "../../src/lib/security";
import { readFileSync } from "fs";

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

console.log(`security-site-test: ${passes} PASS, ${fails} FAIL`);
if (fails) process.exit(1);
