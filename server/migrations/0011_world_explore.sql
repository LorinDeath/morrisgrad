-- Туман войны: разведанная область карты — У КАЖДОГО ГЕРОЯ своя (другой герой исследует мир заново).
-- mask — битсет 375×375 (ячейка 128 px мира Аринара), сжатый RLE + base64 (server/meta/explore.ts).
-- Маску пишет только сервер по фактическим (проверенным сервером) позициям игрока; сохранение — с задержкой (раз в ~30 с и при выходе).
CREATE TABLE IF NOT EXISTS hero_explore (
  pkey TEXT NOT NULL,
  hero TEXT NOT NULL,
  world TEXT NOT NULL,
  mask TEXT NOT NULL,
  cells INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (pkey, hero, world)
);
-- сводка по аккаунту для статистики: лучший герой, сумма по героям, число героев-исследователей
CREATE TABLE IF NOT EXISTS account_explore (
  pkey TEXT NOT NULL,
  world TEXT NOT NULL,
  best_cells INTEGER NOT NULL DEFAULT 0,
  best_hero TEXT,
  total_cells INTEGER NOT NULL DEFAULT 0,
  heroes INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (pkey, world)
);
