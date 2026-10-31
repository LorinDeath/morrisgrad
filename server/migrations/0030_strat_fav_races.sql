-- «Любимые расы» игрока (до 3) для рейтингового жребия рас. Аддитивно.
CREATE TABLE IF NOT EXISTS strat_fav_races (
  user_id TEXT PRIMARY KEY,
  races TEXT NOT NULL DEFAULT '',   -- через запятую: fire,ice,stone
  updated_at INTEGER NOT NULL DEFAULT 0
);
-- Журнал жребия (проверка честности): seed раскрыт при старте, commit публиковался в лобби
CREATE TABLE IF NOT EXISTS strat_race_draws (
  match_id TEXT PRIMARY KEY,
  commit_hash TEXT NOT NULL,
  seed TEXT NOT NULL,
  seats TEXT NOT NULL,              -- JSON: [{fav, team}] на момент жребия
  races TEXT NOT NULL,              -- JSON: итог
  created_at INTEGER NOT NULL DEFAULT 0
);
