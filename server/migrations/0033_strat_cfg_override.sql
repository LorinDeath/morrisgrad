-- G (t1209): «Цели и лиги» из админки — правки по лиге (8/15/35) поверх кода. Аддитивно.
-- key = "league:<size>", json — только изменённые поля (holdK, holdTurns, gold, share, wonderGold, wonderKnow, glory, need, turnLimit, xp, rate*).
-- Сервер накладывает при СОЗДАНИИ партии; идущая партия держит снимок (L.cfg + патч в логе повтора).
CREATE TABLE IF NOT EXISTS strat_cfg_override (
  key TEXT PRIMARY KEY,
  json TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  updated_by TEXT
);
-- журнал: кто, что и когда менял (before/after — JSON; after = NULL — сброс к умолчанию)
CREATE TABLE IF NOT EXISTS strat_cfg_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  key TEXT NOT NULL,
  before TEXT,
  after TEXT,
  by TEXT,
  at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS strat_cfg_log_at ON strat_cfg_log (at);
