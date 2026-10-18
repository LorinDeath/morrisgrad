-- Форум МоррисГрада (сайт, /forum). Та же база morrisgrad_db, что у игры и сайта.
-- Счётчики (лайки, комментарии, темы, карма) денормализованы: списки не делают COUNT на каждый показ.
-- Права: админ/модератор — из player_roles (миграция 0008) по ключу 'uid:<Clerk userId>', проверка только на сервере.

CREATE TABLE IF NOT EXISTS forum_sections (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  icon TEXT NOT NULL DEFAULT '❖',
  sort INTEGER NOT NULL DEFAULT 0,
  admin_only INTEGER NOT NULL DEFAULT 0,       -- 1: новые темы создают только админы/модераторы (например, «Новости»)
  topics_count INTEGER NOT NULL DEFAULT 0,
  posts_count INTEGER NOT NULL DEFAULT 0,       -- темы + комментарии
  last_topic_id INTEGER,
  last_post_at INTEGER,
  last_post_user TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_fsec_sort ON forum_sections(sort, id);

CREATE TABLE IF NOT EXISTS forum_topics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  section_id INTEGER NOT NULL,
  user_id TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'discussion' CHECK (kind IN ('discussion', 'article')),
  title TEXT NOT NULL,
  body TEXT NOT NULL,                  -- исходный текст (markdown-lite)
  body_html TEXT NOT NULL,             -- безопасный HTML, рендерится сервером при записи
  excerpt TEXT NOT NULL DEFAULT '',
  cover_key TEXT,                      -- ключ картинки-обложки в R2 (forum_media)
  likes_count INTEGER NOT NULL DEFAULT 0,
  comments_count INTEGER NOT NULL DEFAULT 0,
  reports_count INTEGER NOT NULL DEFAULT 0,
  hot REAL NOT NULL DEFAULT 0,         -- «горячесть»: log10(лайки + 2·комментарии) + время/45000
  pinned INTEGER NOT NULL DEFAULT 0,
  featured INTEGER NOT NULL DEFAULT 0, -- выбор редакции → вверху «Рекомендованного»
  locked INTEGER NOT NULL DEFAULT 0,
  hidden INTEGER NOT NULL DEFAULT 0,   -- скрыто модерацией / по жалобам
  deleted INTEGER NOT NULL DEFAULT 0,  -- мягкое удаление: текст остаётся, админ может восстановить
  deleted_by TEXT,
  deleted_at INTEGER,
  deleted_reason TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  last_activity INTEGER NOT NULL,
  last_comment_user TEXT
);
CREATE INDEX IF NOT EXISTS idx_ftop_section ON forum_topics(section_id, deleted, pinned DESC, last_activity DESC);
CREATE INDEX IF NOT EXISTS idx_ftop_section_pop ON forum_topics(section_id, deleted, likes_count DESC);
CREATE INDEX IF NOT EXISTS idx_ftop_hot ON forum_topics(deleted, hidden, featured DESC, hot DESC);
CREATE INDEX IF NOT EXISTS idx_ftop_new ON forum_topics(deleted, hidden, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ftop_pop ON forum_topics(deleted, hidden, likes_count DESC);
CREATE INDEX IF NOT EXISTS idx_ftop_user ON forum_topics(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS forum_comments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  topic_id INTEGER NOT NULL,
  user_id TEXT NOT NULL,
  parent_id INTEGER,                   -- корневой комментарий ветки (ответы — 1 уровень вложенности)
  reply_to_id INTEGER,                 -- на какой именно комментарий ответили
  body TEXT NOT NULL,
  body_html TEXT NOT NULL,
  likes_count INTEGER NOT NULL DEFAULT 0,
  reports_count INTEGER NOT NULL DEFAULT 0,
  hidden INTEGER NOT NULL DEFAULT 0,
  deleted INTEGER NOT NULL DEFAULT 0,  -- мягкое удаление (восстанавливается админом)
  deleted_by TEXT,
  deleted_at INTEGER,
  deleted_reason TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_fcom_topic ON forum_comments(topic_id, parent_id, id);
CREATE INDEX IF NOT EXISTS idx_fcom_parent ON forum_comments(parent_id, id);
CREATE INDEX IF NOT EXISTS idx_fcom_user ON forum_comments(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS forum_likes (
  user_id TEXT NOT NULL,
  target_type TEXT NOT NULL CHECK (target_type IN ('t', 'c')),
  target_id INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, target_type, target_id)
);
CREATE INDEX IF NOT EXISTS idx_flike_user_time ON forum_likes(user_id, created_at);

CREATE TABLE IF NOT EXISTS forum_users (
  user_id TEXT PRIMARY KEY,
  nick TEXT NOT NULL,
  nick_key TEXT NOT NULL UNIQUE,                -- ник в нижнем регистре (уникальность без учёта регистра, вкл. кириллицу)
  signature TEXT NOT NULL DEFAULT '',
  topics_count INTEGER NOT NULL DEFAULT 0,
  posts_count INTEGER NOT NULL DEFAULT 0,      -- темы + комментарии (для званий)
  karma INTEGER NOT NULL DEFAULT 0,            -- полученные лайки
  first_seen INTEGER NOT NULL,
  last_seen INTEGER NOT NULL,
  last_post_at INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_fusr_seen ON forum_users(last_seen DESC);

CREATE TABLE IF NOT EXISTS forum_reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  target_type TEXT NOT NULL CHECK (target_type IN ('t', 'c')),
  target_id INTEGER NOT NULL,
  reporter TEXT NOT NULL,
  reason TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved')),
  created_at INTEGER NOT NULL,
  UNIQUE (target_type, target_id, reporter)
);
CREATE INDEX IF NOT EXISTS idx_frep_status ON forum_reports(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_frep_reporter ON forum_reports(reporter, created_at);

CREATE TABLE IF NOT EXISTS forum_bans (
  user_id TEXT PRIMARY KEY,
  until INTEGER NOT NULL,              -- мс; 0 — бессрочно
  reason TEXT NOT NULL DEFAULT '',
  by_user TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS forum_blocks (
  user_id TEXT NOT NULL,
  blocked_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, blocked_id)
);

CREATE TABLE IF NOT EXISTS forum_media (
  key TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  mime TEXT NOT NULL,
  size INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_fmed_user ON forum_media(user_id, created_at);

-- Модераторы форума (отдельно от ролей игры). section_id = 0 — весь форум, иначе — конкретный раздел.
-- Назначает и снимает только админ (/forum/admin → «Модераторы»). Модераторы игры (player_roles) — модераторы всего форума.
CREATE TABLE IF NOT EXISTS forum_moderators (
  user_id TEXT NOT NULL,
  section_id INTEGER NOT NULL DEFAULT 0,
  granted_by TEXT NOT NULL,
  granted_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, section_id)
);

CREATE TABLE IF NOT EXISTS forum_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS forum_modlog (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor TEXT NOT NULL,
  action TEXT NOT NULL,
  target_type TEXT,
  target_id TEXT,
  details TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_fmod_time ON forum_modlog(created_at DESC);

-- Стартовые разделы (админ может переименовать/удалить/добавить в /forum/admin)
INSERT OR IGNORE INTO forum_sections (slug, title, description, icon, sort, admin_only, created_at) VALUES
  ('news', 'Новости МоррисГрада', 'Обновления, анонсы и хроники от создателей', '📜', 10, 1, 0),
  ('curse', 'Проклятые', 'Обсуждение онлайн-игры: билды, боссы, предметы, советы', '⚔', 20, 0, 0),
  ('lore', 'Летописи и лор', 'Книги, персонажи и тайны вселенной', '📖', 30, 0, 0),
  ('art', 'Творчество', 'Арты, музыка, фанфики и всё, что вы создали', '🎨', 40, 0, 0),
  ('talk', 'Таверна', 'Общение обо всём на свете', '🍺', 50, 0, 0),
  ('help', 'Помощь и идеи', 'Ошибки, вопросы и предложения по сайту и играм', '💡', 60, 0, 0);
