-- «Полководец»: уровень аккаунта в «Партии Чёрных королей» — только косметика (ТЗ §5.2). Аддитивно.
CREATE TABLE IF NOT EXISTS strat_profile (
  user_id TEXT PRIMARY KEY,
  xp INTEGER NOT NULL DEFAULT 0,
  level INTEGER NOT NULL DEFAULT 1,
  bot_xp_day TEXT,            -- дата (UTC) последней партии с ботом, давшей опыт
  bot_xp_count INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS strat_profile_level ON strat_profile(level DESC, xp DESC);
