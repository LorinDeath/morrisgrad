// Гость без cookie Clerk: какие запросы отдаются Clerk без «документных» признаков (без рукопожатия). Запуск: bun tools/tests/guest-test.ts
import { isCookielessPublicGet as g } from "../../src/lib/guest";
let fails = 0, passes = 0;
const ok = (c: any, m: string) => { if (c) passes++; else { fails++; console.log("FAIL " + m); } };
for (const p of ["/", "/robots.txt", "/sitemap.xml", "/sitemap-topics-1.xml", "/yandex_6457807e37b7a44d.html", "/forum", "/forum/sections", "/forum/s/curse", "/forum/t/1", "/forum/u/1", "/books", "/arts", "/changelog-site", "/games/sanctuary", "/MorrisCurse"])
  ok(g("GET", p, null, "") && g("HEAD", p, "", "") && g("GET", p, "_cfuvid=1; mg_theme=dark", "?page=2"), "публичное без cookie Clerk: " + p);
for (const p of ["/forum/me", "/forum/notifications", "/forum/n/5", "/forum/admin", "/forum/new", "/forum/edit/3", "/profile", "/inventory", "/chat", "/idealpage", "/u/abc", "/api/forum/feed", "/api/forum/media/a.webp"])
  ok(!g("GET", p, null, ""), "личное/API — как раньше: " + p);
for (const m of ["POST", "PUT", "DELETE", "PATCH"]) ok(!g(m, "/forum", null, ""), "не GET/HEAD — как раньше: " + m);
for (const c of ["__session=x", "__client_uat=0", "__client_uat_z97-tpqr=0", "__clerk_db_jwt=dvb_x", "__clerk_db_jwt_z97=dvb", "a=1; __session_abc=x", "__refresh_x=1", "__clerk_handshake=x"])
  ok(!g("GET", "/forum", c, ""), "есть cookie Clerk — полный Clerk: " + c);
for (const q of ["?__clerk_db_jwt=x", "?a=1&__clerk_handshake=x", "?__clerk_synced=true"]) ok(!g("GET", "/", null, q), "параметр Clerk — полный Clerk: " + q);
ok(g("GET", "/forum", "my__session=1", ""), "похожее имя cookie не считается cookie Clerk");
console.log(`\nguest-test: ${passes} PASS, ${fails} FAIL`); if (fails) process.exit(1);
