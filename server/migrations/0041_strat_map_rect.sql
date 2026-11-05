-- t1247: прямоугольные карты «Партии Чёрных королей» (ширина ≠ высоте). Аддитивно.
-- size остаётся большой стороной (по ней лига, правила размера, фильтры хаба); w/h — ширина и высота, NULL — квадрат size×size.
-- t/s — строки клеток по рядам: длина w*h. Старые карты не меняются.
ALTER TABLE strat_maps ADD COLUMN w INTEGER;
ALTER TABLE strat_maps ADD COLUMN h INTEGER;
