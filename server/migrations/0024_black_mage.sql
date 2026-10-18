-- Чёрный маг (MorrisCurse): очернение вещей, чёрные розы, состояние мага и куполов.
-- Очернение — флаг экземпляра, как cursed/ench: 0…100 (%). Обычные статы −blk%, 100 — вещь не работает;
-- очернённые статы считаются на лету (bmCfg.blkDark) и действуют только на проклятой земле. Ставит только сервер.
ALTER TABLE item_instances ADD COLUMN blk REAL NOT NULL DEFAULT 0;
-- Чёрные розы: место смерти игрока от мага. Стадия роста и радиус проклятой земли — от возраста (born), без строк на клетку.
CREATE TABLE IF NOT EXISTS black_roses (id INTEGER PRIMARY KEY, world TEXT NOT NULL, x INTEGER NOT NULL, y INTEGER NOT NULL, born INTEGER NOT NULL, pkey TEXT);
CREATE INDEX IF NOT EXISTS idx_black_roses_world ON black_roses (world);
-- Позиция мага, таймеры и живые купола (переживают перезапуск сервера): k = 'arinar' → JSON.
CREATE TABLE IF NOT EXISTS bm_state (k TEXT PRIMARY KEY, data TEXT NOT NULL, updated_at INTEGER NOT NULL);
