-- t1243: полная админка правил «Партии Чёрных королей». Аддитивно.
-- Правки хранятся в strat_cfg_override (0033) строками key = 'p:<путь>', json = {"v": значение}.
-- strat_cfg_rev — версии правил: после каждого сохранения — полный снимок карты правок {путь: значение}, кто, когда и зачем.
-- Номер 0040 — чтобы не столкнуться с 0034–0036 ветки редактора карт.
CREATE TABLE IF NOT EXISTS strat_cfg_rev (
  rev INTEGER PRIMARY KEY,
  at INTEGER NOT NULL,
  by TEXT NOT NULL,
  who TEXT,
  note TEXT,
  n INTEGER NOT NULL DEFAULT 0,      -- сколько полей изменено в этой версии
  json TEXT NOT NULL                 -- снимок всех правок после сохранения
);
ALTER TABLE strat_cfg_log ADD COLUMN rev INTEGER;
CREATE INDEX IF NOT EXISTS strat_cfg_log_rev ON strat_cfg_log(rev);
