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

- **Очередь:** `POST /chess/mm/join` `{token|userId|guest,nick}` → `{ticket,status}` / `{matched,code,side}`; `GET /chess/mm/status?ticket=`; `POST /chess/mm/leave`.
  Матч по ближайшему Glicko; если в очереди только двое — играют всегда. Комната DO создаётся только при матче (не висит «жду соперника»).
- Друг по коду: `POST /chess/new {pub}` → `{code}`, `GET /chess/open` — публичные лобби n≤1 (TTL ~5 мин). `leave` / обрыв в lobby снимает место.
- `WS /chess/m/:code`: `hello` → `hello_ok`, `lobby`, `state {state,last,start,clock}`, `result`. Клиент: `act`, `resign`, `leave`, `ping`.
  Таймеры: **5 мин на ход**, **30 мин на партию** (timeout → победа сопернику); обрыв → 90 с (`forfeit`). Пустое лобби → expire.
- Рейтинг: Glicko-2, `chess_ratings` / `chess_rating_history` (0042). Без рейтинга: гости/боты/self/<4 полуходов. `GET /chess/me`, `GET /chess/top`.
- Локально: `cd server && npx wrangler d1 execute morrisgrad_db --local --persist-to /workspace/mg-chess-state --config wrangler.json --file migrations/0042_chess.sql`,
  `npx wrangler dev --config wrangler.json --local --port 8787 --persist-to /workspace/mg-chess-state --var MC_DEV_TRUST_USERID:1`, сайт `npm run dev`,
  два окна `/games/chess-combat?devUser=<uid>`; e2e: `bun chess/online-test.ts`.
- Прод (Алекс/Morrisgrad ок): деплой game worker + сайт. Новых D1-миграций для MM нет.
