-- НЕ ПРИМЕНЕНО. Данные прода (только чтение 17.10.2026): единственная найденная путаница в D1 —
-- отключённый тестовый квест c_vvvv «Ахахах»: цель kill_boss на thin_wisp («Огонёк созвездий» — НЕ босс),
-- такая цель никогда не засчитывается (kill_boss приходит только с боссов). Новая проверка админки такое не пропустит.
-- Вариант исправления: обычная цель «убить 1». Перед применением — бэкап D1 и «ок» владельца.
UPDATE custom_quests
SET data = json_replace(data, '$.objectives', json('[{"type":"kill","mob":"thin_wisp","count":1,"text":"Цель Убить"}]')),
    version = version + 1, updated_at = CAST(strftime('%s','now') AS INTEGER) * 1000
WHERE id = 'c_vvvv' AND json_extract(data, '$.objectives[0].type') = 'kill_boss';
