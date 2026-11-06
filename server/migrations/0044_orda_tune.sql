-- Набор чисел «Орды» и журнал версий. Аддитивно. На удалённую D1 не применять без отдельного ок.
CREATE TABLE IF NOT EXISTS orda_tune (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  rev INTEGER NOT NULL,
  data TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  actor TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS orda_tune_rev (
  rev INTEGER PRIMARY KEY,
  data TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  actor TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
