-- t1219: режимы 2×2 и «Все ×3…×8». Только добавление: режим карты игрока ('' — по числу точек спавна) и режим партии в записях.
ALTER TABLE strat_maps ADD COLUMN mode TEXT NOT NULL DEFAULT '';
