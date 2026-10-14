-- «Проклятые»: у каждого героя своя сумка (item_instances.hero; NULL — старые «общие» предметы, их забирает герой,
-- который первым наденет) и «Не беспокоить» на весь аккаунт (player_settings.dnd_until). Применять ПОСЛЕ 0006_social.sql.
ALTER TABLE item_instances ADD COLUMN hero TEXT;
CREATE INDEX IF NOT EXISTS idx_items_owner_hero ON item_instances(owner, hero, state);
-- надетое уже сейчас принадлежит надевшему герою
UPDATE item_instances SET hero = (SELECT e.hero FROM hero_equipment e WHERE e.instance_id = item_instances.instance_id) WHERE hero IS NULL AND instance_id IN (SELECT instance_id FROM hero_equipment);
ALTER TABLE player_settings ADD COLUMN dnd_until INTEGER NOT NULL DEFAULT 0;
