-- Форум: публичные id профилей (вместо Clerk userId в адресах и API) и аватары.
-- pid — постоянный публичный номер участника (/forum/u/<pid>, «Игрок #<pid>»).
ALTER TABLE forum_users ADD COLUMN pid INTEGER;
ALTER TABLE forum_users ADD COLUMN avatar_key TEXT;            -- ключ в R2 (FORUM_MEDIA), NULL — сгенерированный аватар
ALTER TABLE forum_users ADD COLUMN avatar_at INTEGER NOT NULL DEFAULT 0;
UPDATE forum_users SET pid = (SELECT COUNT(*) FROM forum_users f2 WHERE f2.rowid <= forum_users.rowid) WHERE pid IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_fusr_pid ON forum_users(pid);
-- Тип загрузки (post | avatar) — отдельный лимит частоты для аватаров.
ALTER TABLE forum_media ADD COLUMN kind TEXT NOT NULL DEFAULT 'post';
CREATE INDEX IF NOT EXISTS idx_fmedia_user_kind ON forum_media(user_id, kind, created_at);
