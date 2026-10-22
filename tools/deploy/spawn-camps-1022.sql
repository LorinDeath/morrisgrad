-- release-1022, шаг БД (b): лагеря ×1.5 и респавн 3–5 мин (просьба Алекса) — ПРАВКОЙ В БД, не дефолтом кода.
-- Читает-меняет-пишет существующую строку game_overrides spawn/arinar: json_set меняет ТОЛЬКО 3 поля,
-- все остальные (campRespawn 120, regen*, ambient* …) остаются как есть. Как сохранение админки: запись в журнал
-- game_override_audit (before/after), version+1, game_config_version+1 (комнаты перечитают правки).
-- Идемпотентно: если значения уже стоят — ни строка, ни журнал не меняются (версия конфигурации +1 — безвредно, лишняя пересинхронизация).
-- Если строки spawn/arinar нет — ничего не меняет (тогда выставить в админке «Спавн → arinar»).
INSERT INTO game_override_audit (kind, target_id, before, after, version, granted_by, at)
  SELECT 'spawn', 'arinar', data, json_set(data, '$.campPopMul', 1.5, '$.campRespawnMin', 180, '$.campRespawnMax', 300), version + 1, 'deploy:release-1022', CAST(strftime('%s', 'now') AS INTEGER) * 1000
  FROM game_overrides WHERE kind = 'spawn' AND id = 'arinar'
    AND (json_extract(data, '$.campPopMul') IS NOT 1.5 OR json_extract(data, '$.campRespawnMin') IS NOT 180 OR json_extract(data, '$.campRespawnMax') IS NOT 300);
UPDATE game_overrides SET data = json_set(data, '$.campPopMul', 1.5, '$.campRespawnMin', 180, '$.campRespawnMax', 300), version = version + 1, updated_by = 'deploy:release-1022', updated_at = CAST(strftime('%s', 'now') AS INTEGER) * 1000
  WHERE kind = 'spawn' AND id = 'arinar'
    AND (json_extract(data, '$.campPopMul') IS NOT 1.5 OR json_extract(data, '$.campRespawnMin') IS NOT 180 OR json_extract(data, '$.campRespawnMax') IS NOT 300);
UPDATE game_config_version SET v = v + 1 WHERE k = 'overrides';
