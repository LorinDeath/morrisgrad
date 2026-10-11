-- «Проклятые» — D1 (morrisgrad_db) как источник истины для профилей, предметов и прогрессии.
-- Гибрид: Durable Object GameRoom держит «горячее» состояние (открытый мир, кэш профилей онлайн-игроков),
-- D1 — постоянное хранилище с записью насквозь (write-through): предметы/ресурсы — сразу транзакцией (batch),
-- прогрессия героя и аккаунта — не реже раза в 3 с и при выходе.

-- Редкости: вес/базовые шансы дропа по типу источника (обычный моб / редкий / босс), % за убийство на предмет
CREATE TABLE IF NOT EXISTS rarities (
  id TEXT PRIMARY KEY,                -- common | uncommon | rare | epic | legendary | mythic
  name TEXT NOT NULL,                 -- обычный … мифический
  sort INTEGER NOT NULL,
  color TEXT NOT NULL,
  budget_mult REAL NOT NULL,          -- множитель бюджета статов
  dmg_mult REAL NOT NULL,             -- множитель урона оружия
  drop_pct_mob REAL NOT NULL,
  drop_pct_rare REAL NOT NULL,
  drop_pct_boss REAL NOT NULL
);

-- Мобы (Отголоски): справочник для пулов дропа и Библиотеки мобов
CREATE TABLE IF NOT EXISTS mobs (
  id TEXT PRIMARY KEY,                -- id моба или ключ пула забега (run_<id>)
  name TEXT NOT NULL,
  lvl INTEGER NOT NULL,
  tier INTEGER NOT NULL,
  role TEXT NOT NULL,
  size TEXT NOT NULL,                 -- s | l | boss | huge
  kind TEXT NOT NULL,                 -- zone | run | boss
  rare INTEGER NOT NULL DEFAULT 0,
  stats TEXT NOT NULL,                -- JSON hp/dmg/armor/xp
  where_tags TEXT NOT NULL,           -- JSON регионы/комнаты
  look_id TEXT,
  description TEXT NOT NULL DEFAULT ''
);

-- Библиотека предметов: ФИКСИРОВАННЫЙ пул с уникальными id (сид — 0002, генерируется из server/meta/defs.ts)
CREATE TABLE IF NOT EXISTS items (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slot TEXT NOT NULL,                 -- weapon | helmet | armor | legs | hands
  rarity TEXT NOT NULL,               -- common … mythic
  item_level INTEGER NOT NULL,        -- = уровень моба-источника
  req_level INTEGER NOT NULL,         -- требуемый уровень героя
  wtype TEXT,                         -- тип оружия (форма удара/визуал)
  stats TEXT NOT NULL,                -- JSON базовых статов (фиксированные)
  affixes TEXT NOT NULL DEFAULT '[]', -- JSON (зарезервировано)
  props TEXT NOT NULL DEFAULT '{}',   -- JSON: классы, полоса силы
  grants_ability TEXT,                -- навык монстра, который даёт надетый предмет
  set_id TEXT,                        -- комплект (= моб-источник)
  look_id TEXT,                       -- облик полного комплекта
  sources TEXT NOT NULL DEFAULT '[]', -- JSON [{mob, chance, kind}]
  description TEXT NOT NULL DEFAULT '',
  icon TEXT,
  version INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS idx_items_set ON items(set_id);
CREATE INDEX IF NOT EXISTS idx_items_slot_lvl ON items(slot, item_level);

-- Пулы дропа: у каждого моба СВОЙ пул (предметы и материалы), броски — на сервере по пулу
CREATE TABLE IF NOT EXISTS mob_drops (
  mob_id TEXT NOT NULL REFERENCES mobs(id),
  kind TEXT NOT NULL,                 -- item | res
  ref_id TEXT NOT NULL,               -- items.id или id материала
  chance REAL NOT NULL,               -- % за убийство (независимый бросок)
  min_qty INTEGER NOT NULL DEFAULT 1,
  max_qty INTEGER NOT NULL DEFAULT 1,
  conditions TEXT NOT NULL DEFAULT '{}', -- JSON: {"setPiece":true} (часть облика/навыка — реже), {"elite":2} и т.п.
  PRIMARY KEY (mob_id, kind, ref_id)
);
CREATE INDEX IF NOT EXISTS idx_mob_drops_ref ON mob_drops(kind, ref_id);

CREATE TABLE IF NOT EXISTS library_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);

-- Аккаунты (pkey = "u:<clerk user id>" для проверенных, иначе гостевой ключ)
CREATE TABLE IF NOT EXISTS accounts (
  pkey TEXT PRIMARY KEY,
  verified INTEGER NOT NULL DEFAULT 0,
  data TEXT NOT NULL,                 -- JSON: звёзды, очки Создания, ветка души, квесты, флаги, бестиарий
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  rev INTEGER NOT NULL DEFAULT 0      -- версия записи (оптимистичная защита от устаревших записей)
);

-- Герои: прогрессия каждого героя отдельно
CREATE TABLE IF NOT EXISTS heroes (
  pkey TEXT NOT NULL,
  hero TEXT NOT NULL,                 -- warrior | spearman | rogue | mage
  lvl INTEGER NOT NULL DEFAULT 1,
  xp INTEGER NOT NULL DEFAULT 0,
  talents TEXT NOT NULL DEFAULT '{}', -- JSON id → ранг
  abil TEXT NOT NULL DEFAULT '{}',    -- JSON id → {rad, silenced}
  loadout TEXT NOT NULL DEFAULT '[]', -- JSON массив навыков
  updated_at INTEGER NOT NULL,
  rev INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (pkey, hero)
);

-- Экземпляры предметов: ссылаются на пул (items.id); статы из клиента не принимаются никогда
CREATE TABLE IF NOT EXISTS item_instances (
  instance_id TEXT PRIMARY KEY,       -- crypto.randomUUID() сервера
  owner TEXT NOT NULL,                -- accounts.pkey
  item_id TEXT NOT NULL REFERENCES items(id),
  acquired_at INTEGER NOT NULL,
  source TEXT NOT NULL,               -- kill:<mob> | run:<room> | boss:<mob> | quest:<id> | craft:<recipe> | grant:dev | migrate
  state TEXT NOT NULL DEFAULT 'inv',  -- inv | salvaged
  tx_id TEXT NOT NULL,                -- транзакция выдачи (идемпотентность)
  viewed_at INTEGER,                  -- NULL = «новое» (подсветка в сумке), ставится сообщением mark_seen
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_items_owner ON item_instances(owner, state);
CREATE INDEX IF NOT EXISTS idx_items_tx ON item_instances(tx_id);

-- Надетое: один экземпляр — максимум в одном слоте одного героя
CREATE TABLE IF NOT EXISTS hero_equipment (
  pkey TEXT NOT NULL,
  hero TEXT NOT NULL,
  slot TEXT NOT NULL,
  instance_id TEXT NOT NULL UNIQUE REFERENCES item_instances(instance_id),
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (pkey, hero, slot)
);

-- Материалы (абсолютные значения — повтор записи идемпотентен)
CREATE TABLE IF NOT EXISTS resources (
  pkey TEXT NOT NULL,
  res TEXT NOT NULL,
  qty INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (pkey, res)
);

-- Открытия Библиотеки предметов: seen — встречен (выпал/объявлен/показан), owned — получен
CREATE TABLE IF NOT EXISTS player_item_discovery (
  pkey TEXT NOT NULL,
  item_id TEXT NOT NULL REFERENCES items(id),
  state TEXT NOT NULL,                -- seen | owned
  first_at INTEGER NOT NULL,
  first_source TEXT,                  -- откуда впервые (kill:<mob>, quest:<id>, …)
  viewed_at INTEGER,                  -- NULL = «новое» в Библиотеке предметов
  PRIMARY KEY (pkey, item_id)
);

-- Библиотека мобов: встречен/убит (счётчик убийств)
CREATE TABLE IF NOT EXISTS player_mob_discovery (
  pkey TEXT NOT NULL,
  mob_id TEXT NOT NULL,
  seen_at INTEGER NOT NULL,
  kills INTEGER NOT NULL DEFAULT 0,
  viewed_at INTEGER,                  -- NULL = «новое» в Библиотеке мобов
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (pkey, mob_id)
);

-- Прочие «впервые»: навыки, свойства/аффиксы, облики, квесты, рецепты (feature = 'ability:<id>' | 'prop:<stat>' | 'look:<id>' | 'quest:<id>' | 'recipe:<id>')
CREATE TABLE IF NOT EXISTS player_feature_discovery (
  pkey TEXT NOT NULL,
  feature TEXT NOT NULL,
  first_at INTEGER NOT NULL,
  viewed_at INTEGER,                  -- NULL = «новое»
  PRIMARY KEY (pkey, feature)
);

-- Журнал аудита: выдачи, надевания, ремесло, разбор, награды забегов, отказы античита
CREATE TABLE IF NOT EXISTS grant_audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts INTEGER NOT NULL,
  pkey TEXT NOT NULL,
  kind TEXT NOT NULL,                 -- grant | equip | unequip | craft | salvage | run_reward | xp | reject
  item_id TEXT,
  instance_id TEXT,
  qty INTEGER,
  source TEXT,
  tx_id TEXT NOT NULL,
  detail TEXT                         -- JSON
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_audit_tx ON grant_audit(tx_id, kind, IFNULL(instance_id, ''), IFNULL(item_id, ''));
CREATE INDEX IF NOT EXISTS idx_audit_pkey_ts ON grant_audit(pkey, ts);

-- Завершённые забеги (одна награда на забег)
CREATE TABLE IF NOT EXISTS run_results (
  run_id TEXT PRIMARY KEY,
  pkey TEXT NOT NULL,
  room TEXT NOT NULL,
  started_at INTEGER NOT NULL,
  ended_at INTEGER NOT NULL,
  server_time REAL NOT NULL,
  kills INTEGER NOT NULL,
  xp INTEGER NOT NULL,
  flags TEXT                          -- JSON отклонённых/урезанных утверждений клиента
);
CREATE INDEX IF NOT EXISTS idx_runs_pkey ON run_results(pkey, ended_at);
