-- F (t1205–t1206): «Библиотека» — что игрок уже встретил в партиях. Аддитивно.
-- user_id — только из проверенной сессии (Clerk) места в партии; гости и боты сюда не пишутся (гости — localStorage).
-- kind — категория (race/unit/chief/skill/ult/status/terrain/object/building/tech/wonder/goal/league), item_id — id в правилах.
CREATE TABLE IF NOT EXISTS strat_codex (
  user_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  item_id TEXT NOT NULL,
  first_at INTEGER NOT NULL,         -- мс, первая встреча
  PRIMARY KEY (user_id, kind, item_id)
);
