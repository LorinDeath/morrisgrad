# Security audit — morrisgrad site, forum, MorrisCurse game (2026-10-21)

Branch `security-audit` (worktree `/workspace/mg-sec`, base `main` c8dc474). Local only: nothing pushed or deployed, no remote D1/R2/secrets touched.
The only prod contact was unauthenticated public GETs of `/`, `/forum`, `/MorrisCurse` to read response headers.
Line numbers refer to `main` unless noted. One commit per finding so each can be cherry-picked into feature branches.

## Summary

| # | Sev | Area | Finding | Status |
|---|-----|------|---------|--------|
| 1 | critical | site API | `/api/profile` GET returns `SELECT *` of any user by `?userId=` and creates rows for arbitrary ids; POST updates any user's description with no auth (`src/pages/api/profile.ts:22,32,37-39,57-61`) | fixed on `guest-login` (ca03ec9), untouched here |
| 2 | high | site chat | Stored XSS: chat message, nickname and avatar URL inserted into `innerHTML` unescaped (`src/pages/chat.astro:246-261`) | fixed c430e90 |
| 3 | high | site profile | Stored XSS on public profile `/u/<id>`: item `source/icon/setId/stats` from `POST /api/inventory` rendered with `innerHTML` (`src/pages/u/[id].astro:229,248,250,261,272`; same in `inventory.astro:208-215,253,272-296`, `profile.astro:559-613`); POST stores any fields (`api/inventory.ts:104-131`) | fixed c886370 |
| 4 | high | site scores | `/api/leaderboard` POST: no auth, no validation, writes to the same KV keys (`daily_scores_*`) as `/api/scores`; names rendered via `innerHTML` in `ScoreBoard.astro:44-48`, `MiniGame.astro:516` → unauthenticated stored XSS on the home page (`src/pages/api/leaderboard.js:30-51`) | fixed 262888d (endpoint removed — unused by clients; renders escaped; score finite 0…1e9) |
| 5 | high | site | No CSRF protection on cookie-authenticated writes outside the forum (`/profile` form POST, `/api/chat` POST/DELETE, `/api/inventory` POST/DELETE, `/api/ascension`) (`src/middleware.ts:10-16`) | fixed fd96649 (Origin / Sec-Fetch-Site check in middleware for all non-GET) |
| 6 | high | deps | `@clerk/astro` 2.16.13: GHSA-vqx2-fgx2-5wq9 (critical, middleware route-protection bypass), GHSA-w24r-5266-9c3c; npm audit 36 issues (3 critical, 28 high) | partly fixed d446430: Clerk 2.17.16, astro 5.18.2, non-major `audit fix` → 11 (1 critical, 9 high). Rest needs majors — decision D1 |
| 7 | medium | site headers | Prod sends no CSP / X-Frame-Options / nosniff / HSTS / Referrer-Policy / Permissions-Policy (verified by public GET) → clickjacking, MIME sniffing | fixed 6ea73c4 (middleware for SSR + `public/_headers` for static). Full script-src CSP — decision D2 |
| 8 | medium | site profile | Nickname accepts any characters (only length + word list) → HTML in nick reached chat/other renders (`src/pages/profile.astro:120-143`) | fixed 9eccf56 (same charset as forum nick) |
| 9 | medium | site R2 | Avatar upload stores browser-declared `Content-Type` (HTML/SVG possible) to public `pub-…r2.dev` (`src/pages/profile.astro:155-165`) | fixed 9eccf56 (magic-byte sniff, JPEG/PNG/WebP/GIF only). Existing objects in the bucket not checked — decision D6 |
| 10 | medium | game auth | `verifyClerkToken` accepted tokens without `exp` (`server/meta/auth.ts:116`) | fixed cbfbf0d (+ test with local RSA keys) |
| 11 | medium | site API | Clerk user ids are public and used as profile keys: `/api/chat` GET returns `user_id` of every author (`api/chat.ts:97`), `/u/<clerkId>` (`u/[id].astro:20`), forum `GET /api/forum/user/<clerkId>` accepts a Clerk id (`lib/forum/service.ts:278`). Same pattern as `/api/get-user` | needs decision D3 (move to public `pid`; get-user split is on `guest-login`) |
| 12 | low | site API | Internal error text returned to clients (`api/chat.ts:131,176,200`, `ascension.ts:21,66`, `arts.ts:27,127`, `konkurs.ts:34,66`, `book.ts:26`; `get-user.ts:59` is on guest-login) | fixed cfe993c |
| 13 | low | site API | `/api/konkurs`: anonymous R2 write without type/length limits; object in `author` → 500 (`api/konkurs.ts:8-11`) | fixed cfe993c + b21d5e7 (strings only, 60/150/200 000 chars). Rate limit/captcha — decision D4 |
| 14 | low | site API | `/api/chat?after=0` returned the whole 7-day history in one response (`api/chat.ts:104-108`) | fixed c430e90 (LIMIT 100) |
| 15 | low | site API | `/api/inventory` DELETE deleted by `uuid` only (ownership checked by the preceding SELECT, race-free but fragile) (`api/inventory.ts:157`) | fixed c886370 (`AND user_id = ?`) |
| 16 | low | game admin | Moderator grant/revoke had no audit trail (`player_roles` keeps only current state) (`server/meta/service.ts:594-608`) | fixed 39ef713 (→ `grant_audit`, opaque target id) |
| 17 | low | repo | `.gitignore` lacked `.dev.vars` (where `MC_DEV_TRUST_USERID`/`FORUM_DEV_AUTH` live) | fixed 569bbae |
| 18 | low | repo | Local miniflare state `.wrangler/state/**` (D1/KV/R2 sqlite, 12 files, 1 test user, no e-mails) is tracked | fixed on `guest-login` (3cb59b8), untouched here |
| 19 | low | forum | `\u0000` in user text collided with renderer placeholder markers (`lib/forum/md.ts:47,70`) — could duplicate/break own links, not XSS | fixed 1dbfa2d |
| 20 | low | site | `profile.astro:187` logged all env binding names | fixed 9eccf56 |
| 21 | low | site scores/games | Scores, konkurs, ascension chance, site inventory are client-asserted (anyone can post any score / mint items for the browser roguelike) | needs decision D4/D5 |
| 22 | low | site | "Self-healing" DDL (`CREATE TABLE`/`ALTER`) runs on every request (`api/chat.ts:18-60`, `inventory.ts:18-39`, `profile.astro:36-81`, `u/[id].astro:17`, `ascension.ts:24`) — ~12 extra D1 statements per chat poll, amplifies load | needs decision D7 (move to migrations) |
| 23 | info | forum | External `https:` images in posts load from third-party hosts (viewer IP visible to them; `referrerpolicy=no-referrer` already set) (`lib/forum/md.ts:30-35`) | decision D8 |
| 24 | info | site | Unhandled exceptions (Astro 500 page) bypass middleware → that response has no security headers | accepted (static `_headers` still apply to assets) |

## Area notes (what was checked and found OK)

**HTTP routes.** Site: `arts` (GET, public), `ascension` (auth), `book` (whitelisted id → no traversal, `utils/fb2.ts:260`), `chat` (GET public, POST/DELETE own), `get-user` (guest-login), `inventory` (own rows), `konkurs` (anonymous), `profile` (#1), `scores`/`scores_nl` (anonymous, validated), `forum/*`. Game worker: only WebSocket + `/admin/perf` (Bearer Clerk + D1 admin role, `server/meta/service.ts:1459-1468`). No CORS headers anywhere (same-origin only) ✓.

**Forum** (`src/lib/forum/*`): writes require `X-Forum: 1` + same Origin (`api.ts:78-80`); markdown escapes all text first, links http/https/relative only, images https or own media keys (`md.ts`); edit/delete via `ownTopic/ownComment` (owner or section moderator), moderators cannot edit others' text, restore admin-only, scoped moderation per section, `modlog`; uploads: magic-byte sniff, EXIF/XMP strip, size from settings, random keys `u/YYYYMM/<16 chars>` (no traversal), media GET key regex + `nosniff` + `sandbox` CSP + `inline`; avatars square 32–1024 px; rate limits (uploads/hour, likes/min, account age), profanity filter, `scrub()` removes Clerk ids from all JSON. 266/266 forum tests pass.

**Game WebSocket** (`server/room.ts`, `server/limits.ts`, `server/meta/service.ts`): size ≤ 64 KB before `JSON.parse`, token bucket 60/s burst 120, close after 200 strikes, `type` string ≤ 40, small-message cap 16 KB for non-relay types, per-type schema `MSG_SCHEMA`; join coords clamped, move speed-limited + world bounds + prop collision, NaN rejected; damage/loot/xp/currency computed server-side; admin messages gated by D1 role + verified token (`roles.ts`), client `userId/role` ignored; dev features need `MC_DEV_TRUST_USERID=1` **and** localhost host (`limits.ts:76-80`), flag absent from `server/wrangler.json`. Guest progress key = random 96-bit `mc-guest-id` (`game.js:97-104`), never broadcast (others see FNV opaque ids) — taking over requires reading that browser's localStorage. Auth via token in message, not cookies → no cross-site WebSocket hijacking. Client renders other players' names with `esc()` (`ui/party.js`, `ui/overlay.js`, …). JWT `azp` is not checked — decision D9.

**Secrets.** `git log --all -p` (612 commits) scanned for Clerk secret, AWS, GitHub, Slack, private keys, Google/OpenAI/xAI keys, JWTs, Telegram/Discord webhooks, `*_SECRET=` assignments: only Clerk **publishable** keys (public by design) in `wrangler.jsonc` and historical `repomix-output.xml`. No secret in `dist/` client bundle; client code reads only `import.meta.env.DEV`. `wrangler.jsonc` `vars` holds only the publishable key; `CLERK_SECRET_KEY` must stay a dashboard secret (not verifiable locally).

**D1 SQL.** All queries use `?` bindings; interpolations are constants, whitelisted table/flag names (`service.ts:561,599,675`) or generated `?` lists. Test helpers build SQL strings but run only locally.

**PII.** D1 stores Clerk user id, nickname, description, avatar URL, last_seen; forum: nick, signature, counters; game: pkey + progress. No e-mail or IP is stored or logged. Logs contain at most a 12-char pkey prefix. Chat messages auto-deleted after 7 days; forum/profile data kept until deletion. Workers Logs (`observability.enabled`) keep `console.*` per Cloudflare plan retention. The error-code journal on `asset-cache` (158d5b2, `client_err`) logs code + random ctx + version + world + sanitized step, no nick/text/IP — OK.

**Admin panel.** All admin/moderator actions are checked server-side per message; overrides validated (`overrides.ts`, 32/32 security tests); saves audited in `game_override_audit`; rejects audited in `grant_audit`; role changes now audited (#16). Forum admin settings admin-only, modlog for moderator actions.

## Decisions needed

- **D1 Major upgrades**: astro 7.x (remaining critical GHSA-26w7-cxv4-gfx2 is AVIF image optimisation — the site uses `imageService: 'compile'`, i.e. sharp at build time only; also XSS/SSRF advisories), `@astrojs/cloudflare` 14 (wrangler/miniflare/undici/ws), `@clerk/astro` 4, `sharp` 0.35. Do it in a separate branch with full playtests.
- **D2 Full CSP**: start with `Content-Security-Policy-Report-Only` listing self, `*.clerk.accounts.dev`/`clerk.morrisgrad.com`, `challenges.cloudflare.com`, `api.dicebear.com`, `pub-*.r2.dev`, YouTube, `cherta-kupola…workers.dev`, game WS host, plus nonces/hashes for inline Astro scripts; enforce after a week without violations. HSTS `includeSubDomains; preload` only after confirming all subdomains are HTTPS.
- **D3 Public ids**: replace Clerk ids in `/u/<id>`, chat JSON and forum lookups with the public `pid` (redirect old `/u/user_…` links).
- **D4 Anonymous writes** (scores, konkurs, chat flood): require sign-in or Cloudflare Turnstile + per-IP rate limit (Cloudflare WAF rate-limiting rule is the cheapest).
- **D5 Browser-game items**: `/api/inventory` and `/api/ascension` trust the client; acceptable for the offline roguelike, but must never feed MorrisCurse.
- **D6 Existing avatars**: list `morrisgrad-avatars` objects and re-check content types (remote — needs owner approval); move public buckets from `r2.dev` (rate-limited, not for prod) to a custom domain.
- **D7** Move self-healing DDL to migrations.
- **D8** Forum external images: allow only own uploads or proxy them.
- **D9** Check JWT `azp` against an allowlist of site origins (env `CLERK_AUTHORIZED_PARTIES`); needs the list of every domain the game runs on.
- **Clerk prod keys** (pk_test in prod): separate task, not touched.

## Tests

- `bun tools/tests/security-site-test.ts` — 44/44 (CSRF, headers, `_headers` in sync, nick charset, inventory item cleaning)
- `bun tools/tests/forum-test.ts` — 266/266
- `bun server/meta/auth-security-test.ts` — 11/11 (signature, issuer, exp/nbf, alg none/HS256, sub swap)
- `server/meta/security-test.ts` 32/32, `roles-admin-test.ts` 33/33 (esbuild + node)
- `node tools/tests/security-http-test.mjs` against local `astro dev` — 42/42 incl. browser check that a stored `<img onerror>` message and `<svg onload>` nick do not execute (same test fails 4/42 on `main`'s `chat.astro`)
- `node tools/tests/game-security-ws-test.mjs` against local `wrangler dev` — 9/9 (guest admin/role attempts rejected, junk/oversize/NaN, role audit)
- `astro build` passes with the upgraded deps.
