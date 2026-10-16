-- «📊 Нагрузка»: дневные агрегаты (без персональных данных). stats_daily — счётчики/максимумы за день (Киев),
-- stats_seen — уникальные игроки за день по анонимному хешу ключа (не id), reg: 1 — вошёл в аккаунт, 0 — гость.
CREATE TABLE IF NOT EXISTS stats_daily (day TEXT NOT NULL, k TEXT NOT NULL, v REAL NOT NULL, PRIMARY KEY (day, k));
CREATE TABLE IF NOT EXISTS stats_seen (day TEXT NOT NULL, h TEXT NOT NULL, reg INTEGER NOT NULL, PRIMARY KEY (day, h));
