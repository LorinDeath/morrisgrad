-- «Орда Обители»: сумка, лут и квесты одного аккаунта. Аддитивно. Не применять на бою без отдельного ок.
CREATE TABLE IF NOT EXISTS orda_saves (
  pkey TEXT PRIMARY KEY,
  hero TEXT,
  lvl INTEGER NOT NULL DEFAULT 1,
  best_floor INTEGER NOT NULL DEFAULT 0,
  data TEXT NOT NULL,
  updated_at INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS orda_saves_floor ON orda_saves(best_floor DESC, lvl DESC);
