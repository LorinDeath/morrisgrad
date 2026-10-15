-- Откат настроек проклятия (шанс экипировки снова ×1 только если откатить и код: equipDropMult по умолчанию 10 в server/meta/cursed.ts).
-- Быстро вернуть старый дроп без отката кода: UPDATE ... equipDropMult=1 (см. ниже). Колонка item_instances.cursed остаётся (безвредна).
DELETE FROM game_overrides WHERE kind = 'curse' AND id = 'main';
-- вариант «оставить код, выключить ×10»:
-- INSERT INTO game_overrides (kind, id, data, version, updated_by, updated_at) VALUES ('curse','main','{"equipDropMult":1}',1,'rollback',0) ON CONFLICT(kind,id) DO UPDATE SET data=excluded.data, version=game_overrides.version+1;
UPDATE game_config_version SET v = v + 1 WHERE k = 'overrides';
