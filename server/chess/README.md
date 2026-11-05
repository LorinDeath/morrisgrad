# Боевые шахматы (`server/chess`)

Отдельный namespace от `server/strat`. Маршруты worker: `/chess/*`.

- `rules.ts` — движок (ОД, фигуры, мат = убийство короля, угроза королю).
- `rating.ts` — Glicko-2, пул один; таблицы `chess_*`.
- `hub.ts` / `match.ts` — ChessIndex / ChessMatch DO.
- Миграция: `../migrations/0042_chess.sql` (не apply remote без «ок»).

Клиент: `src/scripts/chess/client.ts`, страница `/games/chess-combat`.
Поле: `public/chess/board/B_artdeco/` (выбор Алекса). Спрайты: `public/chess/art/{light,dark}/`.

Онлайн-лобби: каркас DO готов; вертикаль сейчас — бот на клиенте.
Кампания: каркас `/games/chess-combat-admin` (localStorage).

## Арт (чистовик B + волна 2)

Ассеты: `public/chess/{board,bg,props,ui}/` из `/workspace/art/chess-combat-set-v1/` (без `_archive/`). Клиент: фон `hall` по умолчанию, пропы/special с карты, UI 9-slice.

## Онлайн 1×1 и рейтинг (chess-combat)

- `POST /chess/new {pub}` → `{code}` (ChessIndex), `GET /chess/open` — публичные лобби с n≤1.
- `WS /chess/m/:code` (ChessMatch, hibernation): `hello {token | userId(dev) | guest, nick}` → `hello_ok`, `lobby`, `state {state,last,start}`, `result`.
  Клиент шлёт `act {act: move|attack|ability|end, ...}`, `resign`, `ping`. Сервер валидирует ходы по `rules.ts`; нелегальный → `err illegal` + state.
  Обрыв → 90 с на возврат (alarm), иначе техническое поражение (`forfeit`).
- Рейтинг: Glicko-2 (`rating.ts`), запись `rating-db.ts` в `chess_ratings` / `chess_rating_history` (миграция 0042), идемпотентно по match_id.
  Без рейтинга: гости/боты, сам с собой, < 4 полуходов. `GET /chess/me` (Bearer Clerk / devUser на localhost), `GET /chess/top`.
- Локально: `cd server && npx wrangler d1 execute morrisgrad_db --local --persist-to /workspace/mg-chess-state --config wrangler.json --file migrations/0042_chess.sql`,
  `npx wrangler dev --config wrangler.json --local --port 8787 --persist-to /workspace/mg-chess-state --var MC_DEV_TRUST_USERID:1`, сайт `npm run dev`,
  два окна `/games/chess-combat?devUser=<uid>`; e2e: `bun chess/online-test.ts`.
- Прод (только после «ок»): remote 0042, деплой воркера (DO-миграция ChessMatch/ChessIndex), деплой сайта.
