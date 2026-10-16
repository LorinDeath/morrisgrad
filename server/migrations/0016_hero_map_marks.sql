-- Метки игрока на карте M: личные для героя (pkey + класс героя) и мира. data — JSON [{id,x,y,n}], ≤ 200 меток, имя ≤ 32.
CREATE TABLE IF NOT EXISTS hero_map_marks (pkey TEXT NOT NULL, hero TEXT NOT NULL, world TEXT NOT NULL, data TEXT NOT NULL, updated_at INTEGER NOT NULL, PRIMARY KEY (pkey, hero, world));
