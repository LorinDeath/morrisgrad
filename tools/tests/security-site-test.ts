// Тесты безопасности сайта (чистые функции). Запуск: bun tools/tests/security-site-test.ts
import { isCrossSiteWrite } from "../../src/lib/security";

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

console.log(`security-site-test: ${passes} PASS, ${fails} FAIL`);
if (fails) process.exit(1);
