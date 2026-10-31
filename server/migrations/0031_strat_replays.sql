-- t1156: повторы партий и «Библиотека партий». Аддитивно.
-- log — JSON RLog (replay.ts): стартовые параметры + принятые действия + хэши ходов; по нему любая позиция восстанавливается.
CREATE TABLE IF NOT EXISTS strat_replays (
  id TEXT PRIMARY KEY,              -- код лобби + ":" + время старта (уникально и для реванша)
  status TEXT NOT NULL DEFAULT 'live', -- live (пишется по ходу партии) | over
  log TEXT NOT NULL,
  size INTEGER NOT NULL DEFAULT 0,
  p0 TEXT, p1 TEXT,                 -- user_id мест (гости — guest:…; боты — bot)
  nick0 TEXT, nick1 TEXT,
  race0 TEXT, race1 TEXT,
  winner INTEGER NOT NULL DEFAULT -1,
  reason TEXT,
  turns INTEGER NOT NULL DEFAULT 0,
  acts INTEGER NOT NULL DEFAULT 0,
  rated INTEGER NOT NULL DEFAULT 0,
  map_id TEXT,
  rv TEXT,                          -- версия правил (хэш cfg) на момент партии
  started_at INTEGER NOT NULL DEFAULT 0,
  ended_at INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS strat_replays_p0 ON strat_replays (p0, ended_at);
CREATE INDEX IF NOT EXISTS strat_replays_p1 ON strat_replays (p1, ended_at);
CREATE INDEX IF NOT EXISTS strat_replays_end ON strat_replays (status, ended_at);
-- Избранное игрока («Сохранить партию»): хранится бессрочно, пока есть хотя бы одна закладка
CREATE TABLE IF NOT EXISTS strat_replay_saves (
  user_id TEXT NOT NULL,
  replay_id TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, replay_id)
);
CREATE INDEX IF NOT EXISTS strat_replay_saves_r ON strat_replay_saves (replay_id);
