-- Боевые шахматы: рейтинг и каркас кампаний. Только новые таблицы (additive). Не apply remote без «ок».
CREATE TABLE IF NOT EXISTS chess_ratings (
  user_id TEXT PRIMARY KEY,
  rating REAL NOT NULL DEFAULT 1500,
  rd REAL NOT NULL DEFAULT 350,
  vol REAL NOT NULL DEFAULT 0.06,
  games INTEGER NOT NULL DEFAULT 0,
  wins INTEGER NOT NULL DEFAULT 0,
  losses INTEGER NOT NULL DEFAULT 0,
  peak REAL NOT NULL DEFAULT 1500,
  updated_at INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS chess_ratings_top ON chess_ratings(rating DESC);

CREATE TABLE IF NOT EXISTS chess_rating_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  match_id TEXT NOT NULL,
  before REAL NOT NULL, after REAL NOT NULL, rd REAL NOT NULL,
  result REAL NOT NULL,
  opp TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS chess_rh_user ON chess_rating_history(user_id, created_at);

CREATE TABLE IF NOT EXISTS chess_campaigns (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  cover TEXT NOT NULL DEFAULT '',
  author_id TEXT NOT NULL,
  published INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS chess_chapters (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL,
  idx INTEGER NOT NULL,
  title TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS chess_ch_camp ON chess_chapters(campaign_id, idx);

CREATE TABLE IF NOT EXISTS chess_maps (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL,
  chapter_id TEXT,
  idx INTEGER NOT NULL DEFAULT 0,
  title TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS chess_maps_ch ON chess_maps(chapter_id, idx);

CREATE TABLE IF NOT EXISTS chess_scenes (
  id TEXT PRIMARY KEY,
  map_id TEXT,
  chapter_id TEXT,
  slot TEXT NOT NULL, -- before | after | between
  idx INTEGER NOT NULL DEFAULT 0,
  payload_json TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS chess_progress (
  user_id TEXT NOT NULL,
  campaign_id TEXT NOT NULL,
  chapter_id TEXT NOT NULL,
  map_id TEXT NOT NULL,
  status TEXT NOT NULL, -- locked | open | done
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, campaign_id, map_id)
);
