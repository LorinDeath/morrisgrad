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
  map_id TEXT NOT NULL DEFAULT '',        -- официальная (o8a…), rnd:<seed> или карта игрока (u…)
  xp INTEGER NOT NULL DEFAULT 1,          -- 0 = партия без опыта (неодобренная карта; гости — всегда без опыта)
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

-- Карты игроков. В публичный список попадают ТОЛЬКО после ручного одобрения админом (без автопубликации).
-- pending — ждёт модерации (автор может играть на ней по коду/ссылке, без опыта); approved / rejected / hidden.
-- Жалобы лишь увеличивают flagged → карта всплывает в очереди модерации.
CREATE TABLE IF NOT EXISTS strat_maps (
  id TEXT PRIMARY KEY,
  author TEXT NOT NULL,
  author_nick TEXT NOT NULL DEFAULT '',
  name TEXT NOT NULL,
  size INTEGER NOT NULL,
  t TEXT NOT NULL,                  -- рельеф, size*size символов (terrain.ts)
  s TEXT NOT NULL,                  -- постройки, size*size символов
  status TEXT NOT NULL DEFAULT 'pending',
  flagged INTEGER NOT NULL DEFAULT 0,
  flag_note TEXT,
  reject_reason TEXT,
  reviewed_by TEXT,
  reviewed_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS strat_maps_status ON strat_maps(status, size);
CREATE INDEX IF NOT EXISTS strat_maps_author ON strat_maps(author);
