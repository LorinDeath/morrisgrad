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
