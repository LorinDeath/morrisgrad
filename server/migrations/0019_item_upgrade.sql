-- Улучшение предметов у Петра: уровень +N экземпляра (0 — не улучшен). Ставит только сервер (item_upgrade).
ALTER TABLE item_instances ADD COLUMN upg INTEGER NOT NULL DEFAULT 0;
