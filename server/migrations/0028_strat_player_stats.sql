-- Профиль игрока «Партии Чёрных королей»: строка на каждого игрока каждой завершённой партии (аддитивно, ТЗ §14.J).
CREATE TABLE IF NOT EXISTS strat_player_stats (
  match_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  race TEXT NOT NULL,
  result TEXT NOT NULL,          -- win / loss / draw
  rated INTEGER NOT NULL DEFAULT 0,
  league TEXT,                   -- quick / normal / tactical
  size INTEGER NOT NULL,
  map_id TEXT,
  turns INTEGER NOT NULL,
  duration_ms INTEGER NOT NULL,
  techs TEXT,                    -- JSON [id]
  chief_type TEXT,
  chief_level INTEGER,           -- приватно (для «самых прокачанных типов»); максимум наружу не отдаётся
  chief_kills INTEGER NOT NULL DEFAULT 0,
  talents TEXT,                  -- JSON [id]
  ults TEXT,                     -- JSON [id]
  created_at INTEGER NOT NULL,
  PRIMARY KEY (match_id, user_id)
);
CREATE INDEX IF NOT EXISTS strat_player_stats_user ON strat_player_stats(user_id, created_at DESC);
