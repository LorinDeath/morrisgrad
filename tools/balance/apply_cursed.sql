-- MorrisCurse «Проклятые вещи» (ветка cursed-items). Применять ДО деплоя сервера (сервер читает item_instances.cursed).
-- 1) схема: флаг проклятия на экземпляре (то же, что server/migrations/0014_cursed_items.sql)
ALTER TABLE item_instances ADD COLUMN cursed INTEGER NOT NULL DEFAULT 0;
-- 2) настройки проклятия в D1 (вкладка админки «☠ Проклятие», kind='curse' id='main'); значения = исходные из кода
INSERT INTO game_overrides (kind, id, data, version, updated_by, updated_at) VALUES ('curse', 'main', '{"equipDropMult":10,"mobDropMult":10,"itemChanceMult":1,"bossOnly":true,"statMult":1.5,"rsMult":2,"mobHp":4.5,"mobDmg":2.2,"mobArmor":1.45,"mobXp":2,"glow1":0.3,"glow2":0.5,"glow3":0.65,"glow4":0.8,"glow5":1,"tint":"#a855f7"}', 1, 'cursed-items', 1792096000000)
  ON CONFLICT(kind, id) DO UPDATE SET data = excluded.data, version = game_overrides.version + 1, updated_by = excluded.updated_by, updated_at = excluded.updated_at;
UPDATE game_config_version SET v = v + 1 WHERE k = 'overrides';
