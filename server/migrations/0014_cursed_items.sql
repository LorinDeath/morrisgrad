-- Проклятые вещи: флаг экземпляра (не новый предмет). Статы = база (с правками админки) × CURSE.statMult на лету.
-- Ставит только сервер при выпадении с проклятого босса; клиент флаг не передаёт.
ALTER TABLE item_instances ADD COLUMN cursed INTEGER NOT NULL DEFAULT 0;
