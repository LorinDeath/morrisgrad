-- Админ-панель «Проклятых»: правки игровых данных и квесты из игры. Пишет только серверно проверенный админ (player_roles).
-- game_overrides — текущая правка сущности (kind: mob | weapon | item | skill | loot, id — id сущности), data — JSON-патч
-- поверх значений из кода (только разрешённые поля, проверены сервером). version растёт с каждым сохранением.
CREATE TABLE IF NOT EXISTS game_overrides (
  kind TEXT NOT NULL,
  id TEXT NOT NULL,
  data TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  updated_by TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (kind, id)
);
-- журнал: каждое сохранение (правка данных или квеста) — кто, когда, было/стало
CREATE TABLE IF NOT EXISTS game_override_audit (
  aid INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL,
  target_id TEXT NOT NULL,
  before TEXT,
  after TEXT,
  version INTEGER NOT NULL,
  granted_by TEXT NOT NULL,
  at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_override_audit_at ON game_override_audit(at);
-- квесты, созданные в админ-панели (QuestDef JSON, проверен сервером); enabled = 0 — скрыт
CREATE TABLE IF NOT EXISTS custom_quests (
  id TEXT PRIMARY KEY,
  data TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  version INTEGER NOT NULL DEFAULT 1,
  updated_by TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
-- версия набора правок (одна строка): комнаты сверяют её и перечитывают правки (горячая перезагрузка)
CREATE TABLE IF NOT EXISTS game_config_version (k TEXT PRIMARY KEY, v INTEGER NOT NULL);
INSERT OR IGNORE INTO game_config_version (k, v) VALUES ('overrides', 0);
