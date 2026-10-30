-- «Партия Чёрных королей» (мини-игра, этап 1). Только новые таблицы — существующие не меняются.
-- Итоги партий (для статистики баланса и истории).
CREATE TABLE IF NOT EXISTS strat_matches (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL,
  size INTEGER NOT NULL,
  p0 TEXT NOT NULL,
  p1 TEXT NOT NULL,
  race0 TEXT NOT NULL,
  race1 TEXT NOT NULL,
  first INTEGER NOT NULL,
  winner INTEGER NOT NULL,          -- 0 / 1 / 2 = ничья
  reason TEXT NOT NULL,             -- king / limit / forfeit / disconnect
  turns INTEGER NOT NULL,
  turn_limit INTEGER NOT NULL DEFAULT 0,  -- лимит ходов партии (0 = без лимита)
  cfg_version INTEGER NOT NULL,
  started_at INTEGER NOT NULL,
  ended_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS strat_matches_p0 ON strat_matches(p0, ended_at);
CREATE INDEX IF NOT EXISTS strat_matches_p1 ON strat_matches(p1, ended_at);
CREATE INDEX IF NOT EXISTS strat_matches_races ON strat_matches(race0, race1, size);

-- Профиль «Полководец» на аккаунте сайта (pkey = Clerk user id). Уровни 0–10, +1% HP/АТК/БРН за уровень (этап 7).
CREATE TABLE IF NOT EXISTS strat_profiles (
  pkey TEXT PRIMARY KEY,
  xp INTEGER NOT NULL DEFAULT 0,
  level INTEGER NOT NULL DEFAULT 0,
  wins INTEGER NOT NULL DEFAULT 0,
  losses INTEGER NOT NULL DEFAULT 0,
  draws INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL DEFAULT 0
);
