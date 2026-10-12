-- «Проклятые»: PvP-дуэли (сервер-авторитетные). Счёт побед/поражений/ничьих на игрока (ключ профиля)
-- и журнал результатов (идемпотентно по id дуэли). Применять ПОСЛЕ 0004_rating.sql.
CREATE TABLE IF NOT EXISTS duel_stats (
  pkey TEXT PRIMARY KEY,
  wins INTEGER NOT NULL DEFAULT 0,
  losses INTEGER NOT NULL DEFAULT 0,
  draws INTEGER NOT NULL DEFAULT 0,
  last_hero TEXT,
  updated_at INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_duel_stats_wins ON duel_stats (wins DESC, losses ASC);
CREATE TABLE IF NOT EXISTS duel_results (
  id TEXT PRIMARY KEY,
  a_pkey TEXT NOT NULL,
  b_pkey TEXT NOT NULL,
  a_hero TEXT,
  b_hero TEXT,
  winner TEXT,            -- 'a' | 'b' | NULL (ничья)
  reason TEXT NOT NULL,   -- ko | forfeit | disconnect | timeout
  started_at INTEGER NOT NULL,
  ended_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_duel_results_a ON duel_results (a_pkey, ended_at);
CREATE INDEX IF NOT EXISTS idx_duel_results_b ON duel_results (b_pkey, ended_at);
