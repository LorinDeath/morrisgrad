-- Роли игроков «Проклятых»: админ (красная плашка «Админ») и модератор (зелёная «Модератор»).
-- Ключ — ключ профиля аккаунта (uid:<Clerk userId>); роль действует только для серверно проверенного входа.
-- Модераторов выдаёт/снимает админ из профиля игрока в игре (сообщение role_set). Админов — только этой таблицей/миграцией.
CREATE TABLE IF NOT EXISTS player_roles (
  pkey TEXT PRIMARY KEY,
  role TEXT NOT NULL CHECK (role IN ('admin', 'moderator')),
  granted_by TEXT,
  granted_at INTEGER NOT NULL
);
-- прежний список ADMIN_USER_IDS из server/config.ts (удалён в becf9d9)
INSERT OR IGNORE INTO player_roles (pkey, role, granted_by, granted_at) VALUES ('uid:user_38QeREOr606p1c96P4f14YFsLp7', 'admin', 'migration', 0);
