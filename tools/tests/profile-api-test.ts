// /api/get-user, /api/profile (свои данные по сессии) и /api/public-profile (чужие — только публичные поля). bun tools/tests/profile-api-test.ts
import { currentUserResponse } from "../../src/lib/api/currentUser";
import { publicProfileResponse } from "../../src/lib/api/publicProfile";
import { PUBLIC_USER_FIELDS, PRIVATE_USER_FIELDS, rateLimited } from "../../src/lib/api/profileFields";
import { GET as profileGET, POST as profilePOST } from "../../src/pages/api/profile";
import { GET as getUserGET } from "../../src/pages/api/get-user";
import { readFileSync } from "node:fs";
let fails = 0; const ok = (c: any, m: string) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) fails++; };

const rows: Record<string, any> = {
  user_a: { id: "user_a", username: "Алиса", description: "о себе", avatar_url: "/a.png", hellfire: 7, created_at: 1, last_seen: 2, last_username_update: 111, last_avatar_update: 222 },
  user_b: { id: "user_b", username: "Боб", description: "b", avatar_url: null, hellfire: 0, created_at: 3, last_seen: 4, last_username_update: 333, last_avatar_update: 444 },
};
const items = [{ uuid: "i1", user_id: "user_b", item_id: "sw", name: "Меч", description: "d", source: "s", type: "weapon", rarity: "rare", icon: "x", stats: '{"atk":3}', is_transferred: 1, created_at: 5 }];
const writes: any[] = [];
const db = { prepare: (sql: string) => ({ bind: (...a: any[]) => ({
  first: async () => (/FROM users WHERE id/.test(sql) ? rows[a[0]] || null : null),
  all: async () => ({ results: /user_items/.test(sql) ? items.filter((i) => i.user_id === a[0]) : [] }),
  run: async () => { writes.push([sql, a]); return {}; },
}), run: async () => ({}) }) };
const locals = (uid: string | null) => ({ auth: () => ({ userId: uid }), runtime: { env: { morrisgrad_db: db, PROFILES_DB: db } } });
const req = (u: string, init?: RequestInit) => new Request("http://127.0.0.1" + u, init);

// get-user: только свой, по сессии
let r = await getUserGET({ locals: locals("user_a"), request: req("/api/get-user?userId=user_b") } as any); let j: any = await r.json();
ok(r.status === 200 && j.username === "Алиса", "get-user: свой ник по сессии");
ok(j.username !== "Боб", "get-user: ?userId=чужой игнорируется");
ok(j.user?.last_username_update === 111, "get-user: владельцу — и личные поля (кулдауны)");
ok(r.headers.get("cache-control")?.includes("no-store"), "get-user: не кэшируется");
r = await currentUserResponse(locals(null)); ok(r.status === 401, "get-user: без входа — 401");
r = await currentUserResponse({ auth: () => { throw new Error("no clerk"); } }); ok(r.status === 401, "get-user: сбой auth — 401");

// /api/profile: GET/POST только свои
r = await profileGET({ locals: locals(null), request: req("/api/profile?userId=user_b") } as any); ok(r.status === 401, "profile GET: без входа — 401 (раньше отдавал чужой профиль по ?userId)");
r = await profileGET({ locals: locals("user_a"), request: req("/api/profile?userId=user_b") } as any); j = await r.json();
ok(r.status === 200 && j.user.id === "user_a", "profile GET: только свой, ?userId игнорируется");
writes.length = 0;
r = await profilePOST({ locals: locals(null), request: req("/api/profile", { method: "POST", body: JSON.stringify({ userId: "user_b", description: "взлом" }) }) } as any);
ok(r.status === 401 && !writes.length, "profile POST: без входа — 401, ничего не записано (раньше любой менял чужое описание)");
r = await profilePOST({ locals: locals("user_a"), request: req("/api/profile", { method: "POST", body: JSON.stringify({ userId: "user_b", description: "моё" }) }) } as any);
ok(r.status === 200 && writes.length === 1 && writes[0][1][1] === "user_a", "profile POST: пишет только в свой профиль (userId из тела игнорируется)");

// публичный профиль: любой игрок без входа, только публичные поля
r = await publicProfileResponse(req("/api/public-profile?id=user_b", { headers: { "cf-connecting-ip": "1.1.1.1" } }), { runtime: { env: { morrisgrad_db: db } } }); j = await r.json();
ok(r.status === 200 && j.user.username === "Боб", "public-profile: чужой профиль без входа");
ok(PUBLIC_USER_FIELDS.every((k) => k in j.user) && PRIVATE_USER_FIELDS.every((k) => !(k in j.user)), `public-profile: все публичные поля, личных нет (${Object.keys(j.user).join(",")})`);
ok(j.items.length === 1 && j.items[0].stats.atk === 3 && !("is_transferred" in j.items[0]) && !("user_id" in j.items[0]), "public-profile: предметы как на /u/<id>, служебные поля скрыты");
ok(/public/.test(r.headers.get("cache-control") || ""), "public-profile: публичный кэш 60 с");
r = await publicProfileResponse(req("/api/public-profile?id=nope"), { runtime: { env: { morrisgrad_db: db } } }); ok(r.status === 404, "public-profile: нет игрока — 404");
r = await publicProfileResponse(req("/api/public-profile?id=%27%20OR%201"), { runtime: { env: { morrisgrad_db: db } } }); ok(r.status === 400, "public-profile: мусорный id — 400");
let lim = false; for (let i = 0; i < 61; i++) lim = rateLimited("9.9.9.9", 60, 1000); ok(lim && !rateLimited("8.8.8.8", 60, 1000), "public-profile: 61-й запрос за минуту с одного IP — 429, другой IP — ок");
ok(!rateLimited("9.9.9.9", 60, 62_000), "public-profile: через минуту снова можно");

// всё, что /u/<id> показывает другим, есть в публичном наборе (не убрали ни одного видимого поля)
const page = readFileSync(new URL("../../src/pages/u/[id].astro", import.meta.url), "utf8");
const shown = [...new Set([...page.matchAll(/user\.([a-z_]+)/g)].map((m) => m[1]))];
ok(shown.every((f) => (PUBLIC_USER_FIELDS as readonly string[]).includes(f)), `/u/<id> показывает: ${shown.join(", ")} — все в публичном наборе`);
console.log(fails ? `FAILED ${fails}` : "ALL OK"); if (fails) process.exit(1);
