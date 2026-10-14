-- «Проклятые»: друзья (заявки и дружба) и настройки приватности игрока. Применять ПОСЛЕ 0005_duels.sql.
-- Ключ — ключ профиля (uid:<clerk> или guest:<id>): гости тоже могут дружить. Наружу ключи не отдаются.
CREATE TABLE IF NOT EXISTS friend_requests (
  from_pkey TEXT NOT NULL,
  to_pkey TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (from_pkey, to_pkey)
);
CREATE INDEX IF NOT EXISTS idx_friend_requests_to ON friend_requests (to_pkey, created_at);
-- дружба хранится двумя строками (a→b и b→a): список друзей — один индексный запрос
CREATE TABLE IF NOT EXISTS friendships (
  pkey TEXT NOT NULL,
  friend_pkey TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (pkey, friend_pkey)
);
CREATE TABLE IF NOT EXISTS player_settings (
  pkey TEXT PRIMARY KEY,
  duel_allow TEXT NOT NULL DEFAULT 'all',      -- all | friends | none
  friend_requests INTEGER NOT NULL DEFAULT 1,  -- 1 — принимать заявки в друзья
  updated_at INTEGER NOT NULL DEFAULT 0
);
