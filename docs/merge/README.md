# Слияние security-audit с guest-login

1. `src/lib/api/*`, `src/pages/api/get-user.ts`, `profile.ts`, `public-profile.ts`, `tools/tests/profile-api-test.ts` —
   на security-audit это cherry-pick ca03ec9 (5658e02) + доработка под номер игрока (6666281). При слиянии брать версию security-audit.
   `src/pages/MorrisCurse/index.astro` — брать guest-login (там уже `credentials: 'same-origin'` и ник только для вошедшего).
2. `server/meta/auth.ts` — конфликт. Готовая объединённая версия: `docs/merge/auth.ts.guest-login+security-audit`
   (verifyClerkTokenEx из guest-login + обязательный exp: `typeof payload.exp !== "number"` → invalid, затем `exp < now - 5` → expired;
   + проверка azp через `isParty`).
3. `server/meta/service.ts` (guest-login, join): `verifyClerkTokenEx(String(msg.token), issuer, (azp) => originAllowed(this.env, azp, session.localConn === true))`
   и импорт `import { originAllowed, isLocalRequest } from "../limits";`. Сессии нужен `localConn` из `server/room.ts` (security-audit).
4. Тесты после слияния: `bun server/meta/auth-security-test.ts`, `bun tools/tests/profile-api-test.ts`, `bun tools/tests/public-id-test.ts`,
   плейтест guest-login (вход/«Сессия истекла») — токен в плейтестах выпускается для localhost и идёт на локальный сервер, azp проходит.
