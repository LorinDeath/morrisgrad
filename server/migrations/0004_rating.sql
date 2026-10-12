-- Рейтинг игроков: рекорд одиночного удара героя (считает только сервер — удары в открытом мире) и индексы
-- для топа по уровню и по урону. Имена берутся из таблицы сайта users (по Clerk uid), гости — «Гость #xxxx».
-- Только добавление столбцов/индексов — безопасно на живой базе.
ALTER TABLE heroes ADD COLUMN max_dmg INTEGER NOT NULL DEFAULT 0;
ALTER TABLE heroes ADD COLUMN max_dmg_at INTEGER;
ALTER TABLE heroes ADD COLUMN max_dmg_where TEXT; -- '<мир>:<моб>'
CREATE INDEX IF NOT EXISTS idx_heroes_level ON heroes(lvl DESC, xp DESC);
CREATE INDEX IF NOT EXISTS idx_heroes_maxdmg ON heroes(max_dmg DESC);
