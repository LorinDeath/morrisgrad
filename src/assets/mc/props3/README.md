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

Glow-листы повторяют раскладку базовых и смешиваются аддитивно, как в v2. Контур #1a1626, свет сверху-слева, якорь снизу по центру, земля на строке h−2, рамка 1 px пустая.

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
