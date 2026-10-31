-- Монеты «Партии Чёрных королей» (только победы в РЕЙТИНГОВЫХ партиях; на будущие сундуки со скинами — сейчас только валюта). Аддитивно.
CREATE TABLE IF NOT EXISTS strat_coins (
  user_id TEXT PRIMARY KEY,
  balance INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS strat_coin_ledger (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  match_id TEXT,
  delta INTEGER NOT NULL,
  reason TEXT NOT NULL,        -- win_goals / win_abandon / (будущее: chest)
  created_at INTEGER NOT NULL,
  UNIQUE (user_id, match_id)
);
CREATE INDEX IF NOT EXISTS strat_coin_ledger_user ON strat_coin_ledger(user_id, created_at DESC);
