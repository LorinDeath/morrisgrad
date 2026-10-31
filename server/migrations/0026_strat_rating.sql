-- «Партия Чёрных королей»: рейтинг Glicko-2 по трём лигам (quick/normal/tactical) и рейтинговый пул карт. Только новые таблицы.
CREATE TABLE IF NOT EXISTS strat_ratings (
  user_id TEXT NOT NULL,            -- Clerk user id (гости не рейтингуются)
  league TEXT NOT NULL,             -- quick | normal | tactical
  rating REAL NOT NULL DEFAULT 1500,
  rd REAL NOT NULL DEFAULT 350,
  vol REAL NOT NULL DEFAULT 0.06,
  games INTEGER NOT NULL DEFAULT 0,
  wins INTEGER NOT NULL DEFAULT 0,
  losses INTEGER NOT NULL DEFAULT 0,
  draws INTEGER NOT NULL DEFAULT 0,
  peak REAL NOT NULL DEFAULT 1500,
  updated_at INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, league)
);
CREATE INDEX IF NOT EXISTS strat_ratings_top ON strat_ratings(league, rating DESC);
CREATE TABLE IF NOT EXISTS strat_rating_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  league TEXT NOT NULL,
  match_id TEXT NOT NULL,
  before REAL NOT NULL, after REAL NOT NULL, rd REAL NOT NULL,
  result REAL NOT NULL,             -- 1 / 0.5 / 0 (или место в FFA)
  opp TEXT NOT NULL DEFAULT '',     -- соперник (1×1) — для лимита «пара не больше 3 в сутки»
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS strat_rh_user ON strat_rating_history(user_id, league, created_at);
CREATE INDEX IF NOT EXISTS strat_rh_pair ON strat_rating_history(user_id, opp, created_at);
-- рейтинговый пул карт игроков (витринные официальные карты — в пуле всегда). Снимок хэша при добавлении:
-- правка карты автором меняет хэш → карта не рейтинговая до повторного добавления. Удаление не пересчитывает прошлые партии.
CREATE TABLE IF NOT EXISTS strat_rated_maps (
  map_id TEXT PRIMARY KEY,
  version_hash TEXT NOT NULL,
  added_by TEXT NOT NULL,
  added_at INTEGER NOT NULL
);
