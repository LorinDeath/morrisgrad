-- Форум: уведомления, подписки, статистика участников. Существующие разделы/темы/комментарии не меняются.

-- Уведомления (получатель — user_id). Однотипные непрочитанные склеиваются по agg_key («X и ещё N …»).
CREATE TABLE IF NOT EXISTS forum_notifs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  type TEXT NOT NULL,                 -- reply | comment | like | mention | sub_topic | sub_section | mod | ban | mod_assign
  topic_id INTEGER,
  comment_id INTEGER,
  actor_id TEXT,                      -- последний, кто вызвал событие (NULL — система)
  actor_ids TEXT NOT NULL DEFAULT '[]', -- JSON: разные участники в склейке (до 50)
  actors INTEGER NOT NULL DEFAULT 1,
  text TEXT NOT NULL DEFAULT '',      -- фрагмент / причина
  agg_key TEXT,
  read INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_fnot_unread ON forum_notifs(user_id, read, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_fnot_user ON forum_notifs(user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_fnot_agg ON forum_notifs(user_id, agg_key, read);
CREATE INDEX IF NOT EXISTS idx_fnot_comment ON forum_notifs(comment_id);
CREATE INDEX IF NOT EXISTS idx_fnot_topic ON forum_notifs(topic_id);

-- Подписки: kind 't' — тема, 's' — раздел.
CREATE TABLE IF NOT EXISTS forum_subs (
  user_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('t', 's')),
  target_id INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, kind, target_id)
);
CREATE INDEX IF NOT EXISTS idx_fsubs_target ON forum_subs(kind, target_id);

-- Настройки уведомлений и счётчики для статистики.
ALTER TABLE forum_users ADD COLUMN notif_off TEXT NOT NULL DEFAULT '';   -- выключенные типы через запятую
ALTER TABLE forum_users ADD COLUMN comments_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE forum_users ADD COLUMN likes_given INTEGER NOT NULL DEFAULT 0;

-- Заполнение из уже имеющихся данных.
UPDATE forum_users SET comments_count = (SELECT COUNT(*) FROM forum_comments c WHERE c.user_id = forum_users.user_id AND c.deleted = 0);
UPDATE forum_users SET likes_given = (SELECT COUNT(*) FROM forum_likes l WHERE l.user_id = forum_users.user_id);
-- Авторы автоматически следят за своими темами.
INSERT OR IGNORE INTO forum_subs (user_id, kind, target_id, created_at) SELECT user_id, 't', id, created_at FROM forum_topics WHERE deleted = 0;
