# Картинки R2 на своём домене (вместо r2.dev)

Сейчас аватары и арты отдаются с `pub-….r2.dev` — служебного адреса Cloudflare: у него лимит частоты, нет кэша CDN и WAF,
Cloudflare не рекомендует его для прода. Код уже готов (`src/lib/media.ts`): адрес задаётся переменными, по умолчанию — прежний r2.dev.

| Бакет | Сейчас | Новый адрес | Переменная |
|---|---|---|---|
| `morrisgrad-avatars` (аватары профиля) | `pub-c6960920….r2.dev` | `https://media.morrisgrad.com` | `AVATARS_PUBLIC_BASE` |
| `artcollection` (арты, главная) | `pub-becc7b21….r2.dev` | `https://art.morrisgrad.com` | `ART_PUBLIC_BASE` |
| `morrisgrad-forum-media` (форум) | только через воркер `/api/forum/media/…` | без изменений | — |

## Шаги (удалённые — только после «ок» Алекса)

1. Бэкап D1: `npx wrangler d1 export morrisgrad_db --remote --output /workspace/mg-backups/pre-media-domain-<дата>.sql`.
2. Панель Cloudflare → R2 → `morrisgrad-avatars` → Settings → **Custom Domains → Connect Domain** → `media.morrisgrad.com`.
   Cloudflare сам создаст DNS-запись (зона morrisgrad.com уже в аккаунте) и сертификат. Дождаться статуса **Active**.
   То же для `artcollection` → `art.morrisgrad.com`.
   (CLI-вариант: `npx wrangler r2 bucket domain add morrisgrad-avatars --domain media.morrisgrad.com --zone-id <id зоны>`.)
3. Проверить: `curl -I https://media.morrisgrad.com/<любой существующий ключ>` → 200 и `content-type: image/…`.
4. В `wrangler.jsonc` → `vars` добавить `"AVATARS_PUBLIC_BASE": "https://media.morrisgrad.com"`, `"ART_PUBLIC_BASE": "https://art.morrisgrad.com"`,
   в CSP (`src/lib/csp.ts`) домены уже разрешены. Деплой сайта.
5. Перенос старых аватаров на случайные ключи и новый домен (в старых ключах — внутренний id игрока):
   `npx wrangler d1 execute morrisgrad_db --remote --json --command "SELECT id, avatar_url FROM users" > users.json`,
   `node tools/r2/avatar-rekey.mjs --users users.json` (план), затем с `MG_REMOTE_OK=1 … --apply` и выполнить полученный SQL.
   Старые объекты остаются (удаление — отдельно, с кодовым словом).
6. Через неделю без ошибок: в настройках бакетов выключить **Public Development URL (r2.dev)**.
   Пока r2.dev включён, старые ссылки продолжают открываться.

Откат: убрать переменные из `wrangler.jsonc` и задеплоить — код вернётся к r2.dev.
