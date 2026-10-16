-- Сундуки схватки: переживают перезапуск DO (живут ≤ личная фаза + publicSec). data — JSON сундука (позиции, владельцы, таймеры).
CREATE TABLE IF NOT EXISTS loot_chests (id INTEGER PRIMARY KEY, world TEXT NOT NULL, exp INTEGER NOT NULL, data TEXT NOT NULL);
