# props_32 — пропсы мира под тайлы 32×32 (для Мэла)

Всё сгенерировано скриптами из `src/` (PIL/numpy). Репозиторий не трогали. Сборка: `cd src && nice -n 19 python3 build.py` (~60 с). Самопроверка лежит в `SELFCHECK.txt` (OVERALL: PASS).

## 1. Главное изменение: 10 → 20 px/м
- Старые v2: `p32` (32×48) и `b64` (64×64), 10 px/м. Новые: `p64` (64×96) и `b128` (128×128), **20 px/м**. Размеры в метрах те же (`size_m`, `height_m` совпадают с v2), поэтому коллизии в `server/meta/propsV2.ts` (SOLID по size_m) менять не нужно.
- `props32_atlas.json` — version 3, `tex_px_per_m: 20`. Схема ключей как в v2 (sheet/row/col/frames/fps/glow/anchor/size_m/height_m/kind/variant_of/wrap) плюс поля `old` (кадры и fps в v2), `replaces_mesh` (для arena_*) и `glow_only`. Блоки `aliases` и `variants` скопированы из v2 без изменений.
- Кадры ключа идут подряд и **переносятся на следующий ряд** с любого столбца. Шейдер SpriteBatch это уже умеет (`cc/cols`); `row`/`col` указывают на первый кадр.

## 2. Листы (≤4096, RGBA, alpha только 0/255)
| лист | ячейка | столбцов | размер | что внутри |
|---|---|---|---|---|
| props32_p64.png (+_glow) | 64×96 | 64 | 4096×2016 | мелкие пропсы: свет, кусты, камни, могилы, посёлок, лагерь, лава |
| props32_b128.png (+_glow) | 128×128 | 32 | 4096×4096 | деревья, порталы, колодец, шатры, Хеллфаер, колонны и стены арены, сигил, heart_of_abode |
| props32_x64.png (+_glow) | 64×64 | 64 | 4096×640 | **отдельная страница**: замены 3D-мешей арены «Выживание» и ореолы света |

Glow-листы повторяют раскладку базовых и смешиваются аддитивно, как в v2. Кто именно светит, см. §7b. Контур #1a1626, свет сверху-слева, якорь снизу по центру, земля на строке h−2, рамка 1 px пустая.

## 3. Что поменять в движке
1. **propAtlas.js:** вместо жёсткого `['p32','b64']` перебирать `Object.keys(META.sheets).filter(s => !s.endsWith('_glow'))`, импортировать новые png и читать `props32_atlas.json`.
2. **Высота:** в `propHeightM` и в размерах квада заменить `frameH/10` на `frameH/META.tex_px_per_m` (то есть /20). Ширина считается так же.
3. **Алтарь (models.js):** `mkSheet(altarSrc, 32)`, `idleTex.offset.x = (Math.floor(t*16)%32)/32`. Источник `altar/altar.png` (64×96 ×32 кадра, 16 fps). Рисунок прежний, добавлены кадры и плавность.
4. **Сундук (chestSprite.js):** `chest/chest.png`, `chest_glow.png`, `chest.json`. Ячейка 48×44 (была 24×22). Нужно `COLS = META.cols` (24) вместо 6 и `PX_M = 32/1.1` вместо 16/1.1, тогда размер в мире сохранится. Анимации: idle_closed 24@12, shake 12@24, open 15@20, idle_open 24@12.
5. **Тюльпаны Дара (pixFlower.js):** `tulip/tulip_sheet.png` (+_glow), `tulip.json`. Ячейка 32×40, ряды bud/mature/active, 24 кадра. Нужно `repeat.x = 1/24` вместо 0.25 и кадр `floor(t*fps)%24`, где fps 12, а в движении 20 (было 4/10). Размер в мире тот же, текстура просто вдвое детальнее.
6. **Ореолы света (atmosphere.js):** сейчас halo и pool — аддитивный InstancedMesh с процедурным `radialTex()`. Замена: анимированные пиксельные спрайты `light_halo_*` (вертикальный ореол) и `light_pool_*` (пятно на земле), 24 кадра @12, только в _glow (glow_only, база пустая). Так как инстансы красятся через `setColorAt`, проще брать **`light_halo_neutral` / `light_pool_neutral`** (серые) и оставить нынешнюю окраску. Цветные варианты подходят, если тинт убрать. Соответствие LIGHT_PROPS: lantern→warm, torch/campfire/brazier/hell_flame→fire, crystal→cool, star_crystal→violet, pylon→lime.
7. **Арена (survivors/arena.js):** вызовы `inst(...)` с низкополигональными мешами заменить на спрайты через PropSprites в тех же позициях (таблица в §5).

## 4. Память и телефоны ⚠
- GPU без мипмапов, база + glow: **≈221 МБ** (p64 ≈ 2×33, b128 ≈ 2×67, x64 ≈ 2×10.5). У v2 было в разы меньше.
- Совет: держать пакет как пару тайлов в `texPref.js`. ПК получает props_32 (вместе с тайлами 32), телефоны остаются на props v2 (вместе с тайлами 16).
- Если на ПК тоже много: x64 грузить только на арене, b128 лениво. Можно сжать в KTX2/Basis. Можно прорядить кадры через один (frames/2, fps/2): петли от этого не сломаются, потому что все гармоники целые.

## 5. Арена «Выживание»: замены 3D-мешей (страница x64)
Темы как в коде: колонны и стены по AT (stone→crypt, air→abyss, ice→mirror, fire→abode).
| меш в arena.js | темы | новые ключи |
|---|---|---|
| rubble, Dodecahedron ×70 (0x272552 abyss / 0x2b2222 прочие) | все | arena_rubble_crypt / _abyss / _mirror / _abode |
| crystals, Octahedron ×28, 0x67e8f9 | abyss (mirror: вариант) | arena_crystal_abyss, arena_crystal_mirror |
| floor dots, Circle ×60, 0x818cf8 | abyss | arena_stardot (только glow) |
| graves, Box ×22 | не-abyss | arena_tombstone_crypt (crypt/mirror), arena_tombstone_abode |
| candles, Cylinder + Sphere ×40 | не-abyss | arena_candles, arena_candles_abode |
| bones, Cylinder ×50 | не-abyss | arena_bones |
| tufts, Cone ×6 у каждой колонны (0x3730a3 abyss / 0x3f4a2a прочие) | все | arena_tuft_abyss, arena_tuft_crypt (для прочих) |
| stains | не-abyss | спрайта нет, оставить как есть (плоские декали) |
Колонны и стены арены (`arena_column_*`, `arena_wall_*`), `arena_sigil` и `heart_of_abode` лежат на b128. Просьбу «props3/» понял так: отдельная страница x64 внутри этого пакета, `/workspace/props_32`.

## 6. Дома, окна, дым
Вне Алказака в мире домов и зданий нет. Алказак по условию не трогали, поэтому перерисовывать нечего. Труб и дыма из труб в игре тоже нет. Источники света — это пропсы из LIGHT_PROPS; их перерисовка, glow-слои и спрайтовые ореолы описаны в §3.6. Если дома появятся, тот же генератор (`src/lib32.py`) годится и для них.

## 7. Не трогали
Пропсы и здания Алказака, розу Чёрного Мага.


## 7a. Портал: исправлен по фидбеку (форма как в props2)
- `portal`, `portal_arch`, `portal_swirl` перерисованы. Силуэт арки и проём взяты **1:1 из старых props2**: старая маска увеличена ×2 со сглаживанием, по пикселям не перерисована. Поэтому арка та же: столбы, полукруглый свод, плинты. Вихрь — прямоугольник со скруглённым верхом, заполняет проём ровно как раньше (x 34..93, y 43..122 в ячейке 128). Круглого диска больше нет.
- Новое в отрисовке: каменная кладка с клиньями свода, замковым камнем, плинтами, швами, трещинами и мхом. На внутренней грани арки отсвет вихря, но только в базовом листе, не в glow. Вихрь трёхрукавный, бесшовный, с ярким ядром, звёздами в тёмных полосах и частицами, которые затягивает внутрь.
- Ключи, размер кадра 128×128 и число кадров прежние: portal 48@24, portal_arch 32@12, portal_swirl 32@16. Позиции в атласе не сдвинулись.
- Всё излучение лежит в `_glow`: вихрь (яркие уровни), частицы и руны.
- Сравнение: `previews/portal_fix.png` (старый p2 и новый, ×3, все три ключа) и `previews/portal_fix.gif` (portal, старый и новый, ×3, петля 4 с).

## 7b. Излучение (_glow): кто светит и где
Центр glow-пикселей годится как точка источника света. Аудит пройден по всем ключам. Убрано случайное свечение:
- 1-px светлячки и мотыльки: кусты, камни, руины, указатель, колодец, бочка, мёртвые деревья, мотыльки у фонаря;
- огоньки-призраки (wisp) у могил;
- глаза черепов в skull_pile;
- рассеянные искры и частицы у обелиска, пилона, осколка, руды, колонн арены, кристаллов арены и обломков;
- отсвет внутри шатра: источника света в шатре нет, поэтому оставлен тусклым тёплым цветом в базе, без излучения;
- руны стен арены: все 4 `arena_wall_*` теперь без glow.

Там, где светятся руны или жилы с «бегущей» яркостью, маска glow теперь **постоянна**. Меняется только цвет, поэтому центр не гуляет от кадра к кадру. Руны на арке портала расставлены зеркально.

**Светят** (центр в пикселях ячейки; смещение по X от якоря и высота над землёй в метрах при 20 px/м; «гуляние» — макс. СКО центра по кадрам, px):
| ключ | что светит | центр (px) | dx, м | высота, м | гуляние, px | glow px |
|---|---|---|---|---|---|---|
| campfire | пламя и угли костра | (32.1, 73.2) | +0.03 | 1.04 | 0.6 | 620 |
| torch | пламя факела | (32.1, 22.5) | +0.03 | 3.58 | 0.8 | 188 |
| lantern | стекло лампы (мотыльки не светят) | (43.0, 33.5) | +0.57 | 3.02 | 0.9 | 120 |
| crystal | грани кристалла | (30.4, 67.7) | -0.06 | 1.31 | 0.8 | 657 |
| star_crystal | грани кристалла | (30.4, 67.8) | -0.06 | 1.31 | 0.8 | 657 |
| obelisk | столбец рун (маска постоянна, бежит только яркость) | (31.0, 40.6) | -0.02 | 2.67 | 0.0 | 47 |
| pylon | шар на вершине (кольца и дуги без излучения) | (32.0, 7.0) | +0.03 | 4.35 | 0.0 | 13 |
| glitch_shard | кромка и пятна осколка (покачивание ±3 px) | (31.2, 40.2) | -0.01 | 2.69 | 2.8 | 162 |
| mushroom | шляпки (пульс); споры не светят | (23.1, 67.7) | -0.42 | 1.31 | 2.8 | 45 |
| tombstone | свеча у камня | (48.1, 85.5) | +0.83 | 0.42 | 0.2 | 2 |
| tombstone_2 | свеча у камня | (48.1, 85.5) | +0.83 | 0.42 | 0.2 | 2 |
| ore_node | жилы руды (маска постоянна) | (32.7, 83.5) | +0.06 | 0.53 | 0.0 | 48 |
| ore_node_2 | жилы руды (маска постоянна) | (32.7, 84.4) | +0.06 | 0.48 | 0.0 | 70 |
| totem | глаза трёх ликов (маска постоянна) | (32.0, 49.8) | +0.03 | 2.21 | 0.0 | 36 |
| lava_vent | лава в жерле | (32.1, 86.9) | +0.03 | 0.36 | 0.0 | 305 |
| hell_flame | пламя | (32.2, 71.8) | +0.03 | 1.11 | 0.6 | 744 |
| brazier | огонь в чаше | (32.0, 38.4) | +0.03 | 2.78 | 0.7 | 427 |
| portal_arch | руны арки, симметрично (маска постоянна) | (63.8, 82.7) | +0.02 | 2.16 | 0.0 | 115 |
| portal_swirl | вихрь | (63.4, 83.3) | -0.00 | 2.13 | 2.0 | 2553 |
| portal | вихрь + руны арки | (63.4, 83.3) | -0.00 | 2.13 | 1.9 | 2671 |
| hell_spire | лавовые трещины у основания | (68.4, 115.8) | +0.25 | 0.51 | 1.3 | 172 |
| hell_spire_2 | лавовые трещины у основания | (66.6, 115.6) | +0.16 | 0.52 | 0.9 | 118 |
| hell_crag | лавовые трещины | (76.6, 113.4) | +0.66 | 0.63 | 2.0 | 29 |
| hell_crag_2 | лавовые трещины | (55.1, 108.0) | -0.42 | 0.90 | 1.2 | 145 |
| hell_wall | лавовые жилы | (48.6, 94.0) | -0.75 | 1.60 | 2.2 | 401 |
| arena_column_crypt | руны + 3 свечи у основания | (63.7, 63.4) | +0.01 | 3.13 | 0.0 | 186 |
| arena_column_abyss | столбец рун | (63.5, 61.7) | -0.00 | 3.21 | 0.0 | 180 |
| arena_column_mirror | столбец рун | (63.5, 61.7) | -0.00 | 3.21 | 0.0 | 180 |
| arena_column_abode | столбец рун | (63.5, 61.7) | -0.00 | 3.21 | 0.0 | 180 |
| arena_sigil | весь знак (декаль на полу) | (64.0, 63.0) | +0.02 | 0.05 | 0.0 | 2638 |
| heart_of_abode | сердце | (62.3, 60.1) | -0.06 | 3.29 | 2.4 | 718 |
| arena_crystal_abyss | кристаллы | (31.0, 40.9) | -0.03 | 1.06 | 1.0 | 476 |
| arena_crystal_mirror | кристаллы | (31.0, 40.9) | -0.03 | 1.06 | 1.0 | 476 |
| arena_candles | огоньки свечей | (34.0, 42.5) | +0.13 | 0.97 | 0.5 | 17 |
| arena_candles_abode | огоньки свечей | (34.0, 42.5) | +0.13 | 0.97 | 0.5 | 17 |
| arena_stardot | точка (только glow) | (32.0, 39.0) | +0.03 | -0.35 | 0.0 | 103 |
| light_halo_* / light_pool_* | ореол или пятно, только glow | (32, 31) | 0 | центр спрайта | 0 | — |

У `arena_sigil` якорь (0.5, 0.5), высота считается от центра декали. Заметно «гуляют» только сами источники: покачивание `glitch_shard` (±3 px) и вращение вихря портала (~2 px ≈ 0.1 м). Если нужна полностью неподвижная точка, лучше брать центр по сумме всех кадров.

**Не светят** (glow = null в атласе): bush, bush_2, bush_3, violets, violets_2, rock, rock_2, rock_3, ruin_pillar, ruin_pillar_2, barrel, barrel_2, crate, crate_2, fence, fence_2, signpost, mushroom_2, tombstone_3, bones, bones_2, skull_pile, cage, banner, banner_2, spikes, tree, tree_2, tree_3, pome_tree, pome_tree_2, dead_tree, dead_tree_2, well, tent, tent_2, arena_wall_crypt, arena_wall_abyss, arena_wall_mirror, arena_wall_abode, arena_rubble_crypt, arena_rubble_abyss, arena_rubble_mirror, arena_rubble_abode, arena_tombstone_crypt, arena_tombstone_abode, arena_bones, arena_tuft_crypt, arena_tuft_abyss.

## 8. Кадры и fps по ключам
Петли бесшовные, в каждом кадре есть видимое изменение (проверено в SELFCHECK). Колонка `old` — значения из v2.
| ключ | лист | кадров | fps | сек | old | kind |
|---|---|---|---|---|---|---|
| campfire | p64 | 48 | 24 | 2.0 | 60@30 | prop |
| torch | p64 | 36 | 24 | 1.5 | 6@10 | prop |
| lantern | p64 | 32 | 16 | 2.0 | 4@8 | prop |
| crystal | p64 | 36 | 12 | 3.0 | 6@6 | prop |
| star_crystal | p64 | 36 | 12 | 3.0 | 6@6 | prop |
| bush | p64 | 32 | 16 | 2.0 | 4@4 | prop |
| bush_2 | p64 | 32 | 16 | 2.0 | 4@4 | prop |
| bush_3 | p64 | 32 | 16 | 2.0 | 4@4 | prop |
| violets | p64 | 32 | 16 | 2.0 | 1@0 | prop |
| violets_2 | p64 | 32 | 16 | 2.0 | 1@0 | prop |
| rock | p64 | 24 | 12 | 2.0 | 1@0 | prop |
| rock_2 | p64 | 24 | 12 | 2.0 | 1@0 | prop |
| rock_3 | p64 | 24 | 12 | 2.0 | 1@0 | prop |
| ruin_pillar | p64 | 24 | 12 | 2.0 | 1@0 | prop |
| ruin_pillar_2 | p64 | 24 | 12 | 2.0 | 1@0 | prop |
| obelisk | p64 | 36 | 12 | 3.0 | 4@4 | prop |
| pylon | p64 | 32 | 16 | 2.0 | 4@6 | prop |
| glitch_shard | p64 | 32 | 16 | 2.0 | 4@8 | prop |
| barrel | p64 | 32 | 12 | 2.7 | 1@0 | prop |
| barrel_2 | p64 | 32 | 12 | 2.7 | 1@0 | prop |
| crate | p64 | 24 | 12 | 2.0 | 1@0 | prop |
| crate_2 | p64 | 24 | 12 | 2.0 | 1@0 | prop |
| fence | p64 | 24 | 12 | 2.0 | 1@0 | prop |
| fence_2 | p64 | 24 | 12 | 2.0 | 1@0 | prop |
| signpost | p64 | 24 | 12 | 2.0 | 1@0 | prop |
| mushroom | p64 | 32 | 12 | 2.7 | 4@4 | prop |
| mushroom_2 | p64 | 32 | 12 | 2.7 | 1@0 | prop |
| tombstone | p64 | 24 | 12 | 2.0 | 1@0 | prop |
| tombstone_2 | p64 | 24 | 12 | 2.0 | 1@0 | prop |
| tombstone_3 | p64 | 24 | 12 | 2.0 | 1@0 | prop |
| ore_node | p64 | 32 | 12 | 2.7 | 5@6 | prop |
| ore_node_2 | p64 | 32 | 12 | 2.7 | 5@6 | prop |
| totem | p64 | 32 | 12 | 2.7 | 4@6 | camp |
| bones | p64 | 24 | 12 | 2.0 | 1@0 | camp |
| bones_2 | p64 | 24 | 12 | 2.0 | 1@0 | camp |
| skull_pile | p64 | 24 | 12 | 2.0 | 1@0 | camp |
| cage | p64 | 32 | 12 | 2.7 | 1@0 | camp |
| banner | p64 | 32 | 16 | 2.0 | 4@6 | camp |
| banner_2 | p64 | 32 | 16 | 2.0 | 4@6 | camp |
| spikes | p64 | 24 | 12 | 2.0 | 1@0 | camp |
| lava_vent | p64 | 48 | 16 | 3.0 | 6@8 | hellfire |
| hell_flame | p64 | 36 | 24 | 1.5 | 8@12 | hellfire |
| brazier | p64 | 36 | 24 | 1.5 | 8@12 | hellfire |
| tree | b128 | 48 | 16 | 3.0 | 4@5 | prop |
| tree_2 | b128 | 48 | 16 | 3.0 | 4@5 | prop |
| tree_3 | b128 | 48 | 16 | 3.0 | 4@4 | prop |
| pome_tree | b128 | 48 | 16 | 3.0 | 4@5 | prop |
| pome_tree_2 | b128 | 48 | 16 | 3.0 | 4@5 | prop |
| dead_tree | b128 | 48 | 16 | 3.0 | 1@0 | prop |
| dead_tree_2 | b128 | 48 | 16 | 3.0 | 1@0 | prop |
| portal_arch | b128 | 32 | 12 | 2.7 | 4@4 | prop |
| portal_swirl | b128 | 32 | 16 | 2.0 | 8@10 | prop |
| portal | b128 | 48 | 24 | 2.0 | 8@10 | prop |
| well | b128 | 32 | 12 | 2.7 | 4@4 | prop |
| tent | b128 | 32 | 12 | 2.7 | 1@0 | camp |
| tent_2 | b128 | 32 | 12 | 2.7 | 1@0 | camp |
| hell_spire | b128 | 32 | 12 | 2.7 | 6@6 | hellfire |
| hell_spire_2 | b128 | 32 | 12 | 2.7 | 6@6 | hellfire |
| hell_crag | b128 | 32 | 12 | 2.7 | 6@6 | hellfire |
| hell_crag_2 | b128 | 32 | 12 | 2.7 | 6@6 | hellfire |
| hell_wall | b128 | 32 | 12 | 2.7 | 6@6 | hellfire |
| arena_column_crypt | b128 | 32 | 12 | 2.7 | 1@0 | arena |
| arena_column_abyss | b128 | 32 | 12 | 2.7 | 5@6 | arena |
| arena_column_mirror | b128 | 32 | 12 | 2.7 | 5@6 | arena |
| arena_column_abode | b128 | 32 | 12 | 2.7 | 5@6 | arena |
| arena_wall_crypt | b128 | 32 | 12 | 2.7 | 1@0 | arena |
| arena_wall_abyss | b128 | 32 | 12 | 2.7 | 4@4 | arena |
| arena_wall_mirror | b128 | 32 | 12 | 2.7 | 4@4 | arena |
| arena_wall_abode | b128 | 32 | 12 | 2.7 | 4@4 | arena |
| arena_sigil | b128 | 32 | 12 | 2.7 | 8@8 | ground_decal |
| heart_of_abode | b128 | 32 | 12 | 2.7 | 6@6 | arena |
| arena_rubble_crypt | x64 | 24 | 12 | 2.0 | — | arena_extra |
| arena_rubble_abyss | x64 | 24 | 12 | 2.0 | — | arena_extra |
| arena_rubble_mirror | x64 | 24 | 12 | 2.0 | — | arena_extra |
| arena_rubble_abode | x64 | 24 | 12 | 2.0 | — | arena_extra |
| arena_crystal_abyss | x64 | 32 | 12 | 2.7 | — | arena_extra |
| arena_crystal_mirror | x64 | 32 | 12 | 2.7 | — | arena_extra |
| arena_tombstone_crypt | x64 | 24 | 12 | 2.0 | — | arena_extra |
| arena_tombstone_abode | x64 | 24 | 12 | 2.0 | — | arena_extra |
| arena_candles | x64 | 24 | 24 | 1.0 | — | arena_extra |
| arena_candles_abode | x64 | 24 | 24 | 1.0 | — | arena_extra |
| arena_bones | x64 | 24 | 12 | 2.0 | — | arena_extra |
| arena_tuft_crypt | x64 | 24 | 12 | 2.0 | — | arena_extra |
| arena_tuft_abyss | x64 | 24 | 12 | 2.0 | — | arena_extra |
| arena_stardot | x64 | 24 | 12 | 2.0 | — | arena_extra |
| light_halo_neutral | x64 | 24 | 12 | 2.0 | — | light |
| light_pool_neutral | x64 | 24 | 12 | 2.0 | — | light |
| light_halo_warm | x64 | 24 | 12 | 2.0 | — | light |
| light_pool_warm | x64 | 24 | 12 | 2.0 | — | light |
| light_halo_fire | x64 | 24 | 12 | 2.0 | — | light |
| light_pool_fire | x64 | 24 | 12 | 2.0 | — | light |
| light_halo_cool | x64 | 24 | 12 | 2.0 | — | light |
| light_pool_cool | x64 | 24 | 12 | 2.0 | — | light |
| light_halo_violet | x64 | 24 | 12 | 2.0 | — | light |
| light_pool_violet | x64 | 24 | 12 | 2.0 | — | light |
| light_halo_lime | x64 | 24 | 12 | 2.0 | — | light |
| light_pool_lime | x64 | 24 | 12 | 2.0 | — | light |

Плюс отдельно: altar 32@16, chest (см. §3.4), tulip 3×24@12.

## 9. Файлы
- `props_all_1.png`, `props_all_2.png`: все ключи с подписями. `previews/preview_NN_x2.png`: крупно.
- `before_after.png`: v2 и новые в одном масштабе мира на тайлах 32.
- `props_animated_1_world.gif`, `props_animated_2_camp_hell_arena.gif`, `props_animated_pilot_x2.gif`.
- `src/`: генераторы. `lib32.py` — палитра и примитивы, `p_core/p_more/p_big/p_extra/p_special.py` — пропсы, `build.py` — упаковка, atlas, превью и самопроверка.
