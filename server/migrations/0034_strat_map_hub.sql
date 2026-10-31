-- t1217: хаб карт игроков — лайки, избранное, комментарии, счётчики. Только добавление (таблицы/колонка/индексы).
ALTER TABLE strat_maps ADD COLUMN descr TEXT NOT NULL DEFAULT '';

CREATE TABLE IF NOT EXISTS strat_map_stats (
  map_id TEXT PRIMARY KEY,
  plays INTEGER NOT NULL DEFAULT 0,      -- завершённые партии не автора, с опытом (не тест)
  likes INTEGER NOT NULL DEFAULT 0,
  favs INTEGER NOT NULL DEFAULT 0,
  comments INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS strat_map_likes (
  map_id TEXT NOT NULL, pkey TEXT NOT NULL, at INTEGER NOT NULL,
  PRIMARY KEY (map_id, pkey)
);

CREATE TABLE IF NOT EXISTS strat_map_favs (
  map_id TEXT NOT NULL, pkey TEXT NOT NULL, at INTEGER NOT NULL,
  PRIMARY KEY (map_id, pkey)
);
CREATE INDEX IF NOT EXISTS strat_map_favs_pkey ON strat_map_favs (pkey, at);

CREATE TABLE IF NOT EXISTS strat_map_comments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  map_id TEXT NOT NULL, pkey TEXT NOT NULL, nick TEXT NOT NULL DEFAULT '',
  text TEXT NOT NULL, at INTEGER NOT NULL,
  hidden INTEGER NOT NULL DEFAULT 0, reports INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS strat_map_comments_map ON strat_map_comments (map_id, at);
CREATE INDEX IF NOT EXISTS strat_map_comments_pkey ON strat_map_comments (pkey, at);

CREATE TABLE IF NOT EXISTS strat_map_comment_reports (
  comment_id INTEGER NOT NULL, pkey TEXT NOT NULL, at INTEGER NOT NULL,
  PRIMARY KEY (comment_id, pkey)
);

CREATE TABLE IF NOT EXISTS strat_map_comment_bans (
  pkey TEXT PRIMARY KEY, by_pkey TEXT NOT NULL, at INTEGER NOT NULL, note TEXT NOT NULL DEFAULT ''
);
