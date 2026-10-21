# HANDOFF — ветка ui-cursed-rework (только локально: без push, без деплоя, без удалённых изменений)

## Что сделано (коммиты поверх origin/main dda459c)
1. `7ed7f5c` — UI-кит Художника + аватары Историка: `public/mc-ui/` (9-slice, тинт-слои, глитч-ленты, avatars/*_{64,128,cursed_64,cursed_128}).
2. `be047dc` — админка «🎨 Интерфейс» (`server/meta/uiCfg.ts`). Поля: вкл. новой темы, глитч 0–2, доля цвета локации, ромбы, аватары, порог очернённого аватара (по умолчанию 25%). Значения уходят в `meta_state.ui`.
3. `1ec09d4` — `ui/uiSkin.js`, `ui/playerFrame.js`, проводка в game/hud/social/dialog:
   - тинт металла рамок под биом;
   - настройка «🖥 Интерфейс: Новый/Старый» хранится на устройстве (`localStorage mc_ui_theme`);
   - в забеге тема выключена;
   - аватары: окно C (128 + 64), рамка героя (64), карточка «ГЕРОЙ», осмотр игрока, NPC в обычном диалоге. Везде родной размер 64/128, это проверено тестом.
4. `14969b6` — тема `styles/ui-cursed.css`, вся под `html.mc-ui`. Старый CSS не тронут, поэтому старая тема = прежний вид.
5. `50c4540` — плейтесты `tools/playtest/ui-rework.cjs`, `ui-tour.cjs`, `ui-admin.cjs`.
6. `4b6832a` — тайлсеты 32 px (`src/assets/mc/tiles32_*`) + `worlds/texPref.js`:
   - настройка «🧱 Текстуры: Новые (32) / Старые (16)» хранится на устройстве (`localStorage mc_tex`, `?tex=16|32`);
   - по умолчанию ПК — 32, телефон — 16;
   - применяется после перезагрузки (кнопка ↻ в настройках);
   - забег (survivors/arena.js) по-прежнему на 16.
7. `18002dc` + `cfa9dda` — непроходимая вода/лава (`server/meta/liquid.ts`, `terrainCfg.ts`):
   - работает через `propCollision.resolveWorld/blockedWorld`, поэтому сервер (room.ts move, мобы zone.solid, маг, NPC) и предсказание клиента (game.js) работают одинаково;
   - кромка берега 8 px проходима;
   - кто стоит в воде, того выносит на сушу (клиент без движения + сервер при следующем move);
   - лагеря и узлы сбора генерируются не в жидкости;
   - админка «🌊 Рельеф»: вода, лава, ширина кромки;
   - тест `server/meta/liquid-test.ts`, плейтест `tools/playtest/water-tex.cjs`;
   - лавы в открытом мире сейчас нет, она есть только в данжах/забеге. Код готов к биому `lava`.
8. `42cba43` — VN-арт Историка: все 9 персонажей в `public/mc-vn` с теми же ключами и размерами. Добавлены `debug.vn` и плейтест `vn-art.cjs`.
   - Скриншоты: `/workspace/morrisgrad-round3/ui-rework/vn/{before,after,cmp}-*`.
   - Заметно новые эмоции: warrior fear, spearman anger, rogue determined. У остальных правки мелкие (волосы/матирование).
   - Спрайты персонажей (`/workspace/sprites_redesign/`) НЕ трогали.

## Проверки
- bun-тесты `server/meta/*-test.ts` и `tools/tests/*-test.ts` прошли все, кроме двух:
  - `roam-test`: порог «32 spread players < 8 ms/tick» шумит на загруженном боксе. До водного коммита было 7.0–8.2 мс, после 8.4–9.6. Микробенч `inLiquid` даёт ~46 нс на вызов, ~0.04 мс на тик. Нужно перемерить на спокойной машине.
  - `security-test` запускать из корня репо: он читает `server/wrangler.json`. Из корня 32/32.
- `*.mjs` (protocol/social/rating/duel/talent-migrate) требуют сервер на 8787 с локальной D1 по умолчанию и не запускались. `collision-test.mjs` прошёл 10/10 так: `MC_WS=ws://127.0.0.1:8911 node --experimental-websocket server/meta/collision-test.mjs`.
- Плейтесты: blacken-visuals ok, cursed 11/11, ui-tour (new/old × pc/mobile) ok, water-tex ok.
  - Исключение — проверка «идём в пруд»: она ужесточена, игрок скользит по кромке неровного берега. Последнюю версию проверки нужно перезапустить.
  - enchant.cjs: 6 FAIL только по вкладке админки (роль приходит позже, гонка в тесте). Сама админка работает (`ui-admin.cjs`).

## Осталось
- ui-tour перезапущен 21.10: new × pc/mobile/ice/fire/stone/air, old × pc/mobile — всё ok (скриншоты: /workspace/morrisgrad-round3/ui-rework/tour/, 165 шт.). Можно добавить LOC для телефона.
- ui-admin.cjs теперь сам чистит оверрайд ui в локальной D1 харнесса до и после прогона; 5/5 ok.
- Мелочи полировки:
  - диалог NPC на ПК перекрывает панель навыков, это было и в старой теме;
  - лобби на телефоне: кнопки под окном (было и раньше);
  - на телефоне в эмуляции под скриншотом чёрная полоса (было и раньше).
- Предложения по атмосфере (без снарядов): виньетка/цветокор по биому (GRADE/vigEl уже есть), частицы по биому, UI-звуки, плавные переходы окон, экран загрузки.


## Раунд 2 (21.10, после одобрения вида)
Коммиты:
- `6f74678` + `fd62513`: иконки быстрых кнопок HUD по центру рамки. Причина — отступы кнопки и метрики шрифта.
  - Исправлено: `padding: 0`, `line-height: 1`, явный эмодзи-шрифт, оптическая поправка для 👥.
  - Плейтест `icon-center.cjs`: разница кадров «с иконкой / без иконки», центр bbox иконки против центра ячейки, допуск ≤ 1 px.
  - Покрывает HUD, панель навыков, окно C, книгу, таланты, тач-кнопки. Кропы: `ui-rework/fixes/icons-center/`.
- `968665d`: плейтест enchant чинится только в самом тесте.
  - Вкладка админки — гонка с ролью.
  - ОЗ «2 142» — разделитель тысяч.
  - Множитель проклятого сверяется с живым значением админки (локально 4.5), а не с прод-числом.
  - Нужна страница с колонками: `EN_BASE=http://127.0.0.1:5311/game-panel.html EN_WS=ws://127.0.0.1:8911 EN_WR=/workspace/mc-harness-ui/wr`.
- `9e5ce4b`: на ПК диалог NPC стоит над панелью навыков.
- `68cd387`: кнопки лобби внутри окна и всегда видны.
- `75be329`: плейтест `ui-fixes.cjs`. Скриншоты до/после: `ui-rework/fixes/`.
- Чёрная полоса на телефоне — артефакт харнесса. CSS резервирует 46 px под шапку окна `.game-header` из `index.astro` (полноэкранный режим сайта), а в харнессе шапки не было.
  - Харнесс исправлен: `game.html` теперь с шапкой на телефоне.
  - На iPhone Safari нет Fullscreen API для div, поэтому там вид «в странице» (`100svh-120px`). Это вне задачи.
- `61fc7a8`: HUD внутри игрового поля (`hud.js` `mountIngame`/`setIngame`, CSS раздел 7).
  - Настройка «🧭 Старые панели» (`localStorage mc_hud_old`), админка: `hudIngame`, `hudOldDefault`, `mmMobile`, `mmSize`.
  - Плейтест `hud-ingame.cjs` (VIEW / HUD / THEME). Скриншоты: `ui-rework/hud-ingame/`.

Тесты (пункт 4, 21.10):
- Прошли: quest-cond ok, enchant ok, liquid 10/0, duel 41/0, social 25/0, rating 18/0, полный прогон ui-fixes / hud-ingame / ui-tour ×5 / ui-admin ok.
  - ui-tour LOC=ice один раз упал по таймауту под нагрузкой, при повторе ok.
- protocol 39/6 и talent-migrate 6/2 падают одинаково на базе: worktree `/workspace/mg-ui-basecheck` на merge-base `dda459c`. Это не регрессия ветки.
- duel падал только на «грязной» локальной D1 (игрок «повержен» после прошлых тестов). На свежей D1 41/0. Старое состояние отложено в `mc-harness-ui/t8787/state.used-*`.
- roam-test «32 spread players < 8 мс»: нагрузка от чужих процессов, результат плавает.
  - Попеременно база / ветка: база 8.0–11.5 мс, ветка 7.8–10.9 мс.
  - Без проверки жидкостей 7.7–10.9 мс.
  - Микробенч `resolveLiquid` (900 мобов): ~0.08 мс на тик, < 1 % тика.
  - Добавлен одноэлементный кэш карты мира: 90 → 84 нс на вызов.
  - Превышение порога — шум машины, а не путь проверки воды.

Харнесс:
- `vite.config.mjs`: `usePolling`. Без него vite иногда отдавал устаревший CSS после `sed -i`.
- `game-panel.html` — страница с колонками.
- 8787 для `.mjs`-тестов: `wrangler dev` из `mg-ui/server`, D1 по умолчанию (`server/.wrangler`).
  - Миграции применены `--local`.
  - Для тестов добавлена таблица `users` (на проде она от сайта).
  - PID: `/workspace/mc-harness-ui/t8787/wrangler.pid`.
- `talent-migrate-test` запускать с `SERVER_DIR=/workspace/mg-ui/server` (по умолчанию он смотрит в `mg-work`).

## Как запускать (локально)
- Харнесс: `/workspace/mc-harness-ui/start.sh` поднимает vite 127.0.0.1:5311 и wrangler 127.0.0.1:8911 (`--persist-to /workspace/mc-harness-ui/wr`, `MC_DEV_TRUST_USERID` только локально). PID лежат в `/workspace/mc-harness-ui/{vite,wrangler}.pid`; останавливать только их.
- Плейтесты:
  `cd /workspace/mg-ui && NODE_PATH=/workspace/mc-ui-tools/node_modules THEME=new VIEW=pc nice node tools/playtest/ui-tour.cjs`
  Также: ui-rework, ui-admin, water-tex (`TEXS=32,16`), vn-art (`TAG=after`).
- Тесты: `cd server && bun meta/<x>-test.ts`. Исключение: security-test запускать из корня.

## Атмосфера нового интерфейса (пункт 5) — `ui/atmoUi.js`, CSS §8
Всё работает только в `html.mc-ui`. Старая тема и забег без изменений. Настройки — админка «🎨 Интерфейс»: `atmo`, `vig`, `grade`, `parts`, `atmoMobile`, `sfx`, `sfxVol`, `trans`, `transMs`, `loadScreen`.
- **Виньетка-«порча» и тон локации.** Это экранные слои — соседи холста (как в `grim.js`) с `z-index: 1` и `mix-blend-mode: multiply`.
  - Важно: в общей обёртке с `z-index` multiply смешивался с пустотой и высветлял кадр. Плейтест это ловит.
  - Локация берётся из `atmo.moodKey`; движок не правился.
  - Трещины `bg_cracks` из кита видны только по углам (маска).
- **Частицы.** 2D-холст, пиксельные точки, ~30 кадров/с. Центр экрана (герой) чистый.
  - Типы: пепел, споры, лепестки, пыль, снег, синие угли, звёзды — по локации.
  - На телефоне сила `atmoMobile`% (0 — выкл), плотность ещё ×0.6.
- **Звуки.** Синтез WebAudio: клик, открытие, закрытие, «нельзя».
  - Ползунок «🔔 Звуки интерфейса» в Настройках: `localStorage mc_ui_sfx`, 0 — выкл, по умолчанию `sfxVol`.
  - Общий «🔊 Звук: выключен» глушит и эти звуки. До первого жеста пользователя звука нет.
- **Плавные окна** (`overlay.showScreen`/`hideScreen`).
  - Открытие: фон проявляется, окно «всплывает».
  - Быстрая перерисовка того же окна (пришёл список лобби) продолжает анимацию с того же места.
  - Смена уже открытого окна — без анимации.
  - Закрытие: «призрак» окна без id и кликов гаснет за `transMs`×0.8.
  - `hideScreen(true)` закрывает мгновенно. При `prefers-reduced-motion` переходов нет.
- **Экран загрузки.** Знак проклятия, полоса из кита, шаги, подсказка. Выбор админки запоминается в `localStorage mc_ui_load`: экран показывается до прихода настроек.
- Плейтест `tools/playtest/atmo-ui.cjs` (VIEW / THEME). Скриншоты: `ui-rework/atmo/`.

## Слот кнопки PK (для ветки dome-city)
- `#mc-pf-pk-slot` (`ui/playerFrame.js` `pkSlot()`, CSS §9) — один элемент на страницу. `PlayerFrame.placePk()` переносит его в видимую рамку героя:
  - новая `.mc-pframe` — справа от полоски ОЗ;
  - иначе прежняя карточка «ГЕРОЙ» левой колонки — справа от полоски ОЗ и подписи.
- Пустой слот скрыт (`:empty`), поэтому вид рамок не меняется. С кнопкой — квадрат 36×36.
- dome-city: `mountPkButton(document.getElementById('mc-pf-pk-slot'))`. Логики PK здесь нет.
- **Телефон** (`.mc-touch`): рамки героя нет, ОЗ показаны над героем. Поэтому слот стоит в полоске `.mc-pf-mob` слева сверху.
  - Полоска: компактная полоска ОЗ (новая тема — кит, старая — прежний стиль) + слот 44×44; кнопка растягивается минимум до 44 px под палец.
  - Полоска видна только если в слоте есть кнопка и мы в открытом мире. Трекер заданий (и отряд старой темы) тогда сдвигаются на 52 px вниз; пустой слот — раскладка как раньше.
- Плейтест `tools/playtest/pk-slot.cjs` (с макетом кнопки). Скриншоты: `ui-rework/pk-slot/`.

## Админка «🎨 Интерфейс» — все новые параметры ветки
Работает на лету (meta_state.ui), хранится в D1, значения вне диапазона сервер отклоняет с русским сообщением, клиент тоже зажимает, «↺ Вернуть исходное» возвращает значения из кода. Секции:
- **Стиль.**
- **HUD в игровом поле:**
  - `hudIngame`, `hudOldDefault`, `mmMobile`, `mmSize`;
  - `mmX` / `mmY` — отступы карты; `mmZoom` — зум по умолчанию 1–3; `mmRound` — круглая или квадратная в рамке;
  - `tgtSide` — «Цель»: слева, по центру или справа под картой; `tgtTop`; `tgtHide` — автоскрытие через N с без изменений, наведение возвращает панель.
- **Атмосфера:**
  - `atmo`, `vig`, `grade`, `parts`, `atmoMobile`, `partsMobile`;
  - по локациям `loc.<hub|ice|fire|stone|air|arinar>.<vig|grade|parts>` — 0–200 % от общих.
- **Звуки и окна:** `sfx`, `sfxVol` (громкость по умолчанию), `trans`, `transMs`, `loadScreen`.
- **Текстуры по умолчанию:** `texPc` и `texMobile` (32/16).
  - Действуют, пока игрок не выбрал сам; применяются со следующей загрузки, через `localStorage mc_tex_def`.
  - Так же экран загрузки читает `mc_ui_load`.

Плейтест `ui-admin.cjs` проверяет все поля: наличие, русские подписи, применение сразу, после перезагрузки, отказ вне диапазона, сброс. Скриншоты: `ui-rework/admin/`.
`hud-ingame.cjs` (ПК, ig) дополнительно проверяет на лету квадратную карту, отступы, «Цель» справа и автоскрытие.

## Плашки в поле темнее (fixes/target-bg)
- «Цель» и всплывающие окна (`frame_panel` с полупрозрачной серединой) получили тёмный фон под рамкой: `rgba(9,7,15,var(--ui-plate))`.
- Админка: `plate` 50–100 %, по умолчанию 88.
- Яркость фона на льду: «Цель» 92.8 → 19.0, всплывающее окно 99.7 → 19.4; в воздухе — 102 → 20.
- Трекер и кнопки мини-карты и так плотные (16.7 и 26.7).
- Плейтест `plate-bg.cjs` (TAG=before|after). Скриншоты: `ui-rework/fixes/target-bg/` (`compare-*.png`).

## «🔍 Размер интерфейса» (ui-scale) — `ui/uiScale.js`, CSS §11
- Настройки → ползунок «🔍 Размер интерфейса» (по умолчанию 70–150 %, шаг 5), живой предпросмотр: HUD меняется сразу, окно
  настроек держит прежний масштаб, пока ползунок тянут (иначе он уезжает из-под пальца), и догоняет при отпускании.
  Кнопка «Авто» (телефон) / «100%» (ПК) — вернуть значение по умолчанию. Выбор хранится отдельно: `mc_ui_scale_pc` / `mc_ui_scale_mob`.
- По умолчанию: ПК — `scalePc` (100), телефон — `scaleMobile` (0 = авто: короткая сторона экрана / 400, 85–110 %, шаг 5;
  360 → 90 %, 390–412 → 100 %). Пределы ползунка `scaleMin`/`scaleMax`. Всё в админке «🎨 Интерфейс» (живьём, с ограничением, ↺).
- Фактический масштаб = min(выбор, «помещается»): «помещается» — по размеру игрового поля (опорные 760×480 ПК, 600×312 альбом,
  330×520 портрет; подобраны прогоном ui-scale). Если выбор больше — в Настройках «130% (115%)».
  Итог по экранам: ПК 1280×720 / 1920×1080 с HUD в поле — до 150 %; с боковыми панелями: 1280×720 (поле 776 px) — до 100 %, 1920×1080 — до 150 %;
  телефон 360×640 и 640×360 — до 100 %, 390×844 — 115, 844×390 — 110, 412×915 — 120, 915×412 — 115.
- Как: CSS `zoom` на корнях интерфейса (рамка героя, мини-карта, «Цель», трекер, панель умений, отряд, кнопки, тосты,
  подсказки, чат, книга, окна `.mc3d-screen > *` — Настройки, C, диалоги, лобби; окно улучшения, всплывающие окна у мини-карты,
  меню игрока, подсказки сравнения в книге). Пиксель-арт остаётся `image-rendering: pixelated`; холст мира, подписи над головами,
  карта мира и админка не масштабируются. Боковые панели ПК — текст не больше 110 % (колонка фиксированной ширины).
- Тач: кнопки, столбец/ряд кнопок, подсказка джойстика, полоска «ОЗ + PK» — `--ui-st` = max(1, масштаб): цель для пальца
  не меньше 44 px; основание/ручка джойстика и ход ручки растут вместе (`touchControls.js`).
- Забег не трогаем: в режиме run масштаб 100 % и класс `html.mc-uis` снят; правила раскладки ниже — с `:not(.mc-run)`.
- Попутные правки раскладки телефона (ради «ничего не перекрывается» на 360×640 / 640×360, обе темы):
  второстепенные тач-кнопки переносятся во вторую колонку/ряд (раньше на 640×360 ряд уходил за левый край, в портрете
  новой темы колонка наезжала на мини-карту); «Отряд» на телефоне и в старой теме — по центру сверху (альбом) / под трекером
  (портрет), как в новой (раньше лежал поверх трекера). Откат — §11 и блок «Отряд» в ui-cursed.css.
- Позиции, которые считает JS (меню игрока, сравнение предметов в книге), делятся на `currentCSSZoom`.
- Плейтест `tools/playtest/ui-scale.cjs`: 8 экранов (ПК 1280×720, 1920×1080; 360×640, 390×844, 412×915 и их альбом) × 2 темы ×
  масштабы 70/85/100/115/130/150: корни HUD внутри поля, без новых наложений, тач-цели ≥ 44; на 70/100/150 открываются
  Настройки, книга, C, диалог, окно улучшения, всплывающее окно — по ширине на экране, по высоте помещаются или прокручиваются;
  ползунок/предпросмотр/хранение по типу устройства/«Авто». Скриншоты: `ui-rework/ui-scale/`, окна — `ui-scale/win/`.

---

# Альказак (dome-city) — HANDOFF

Local only: no push, deploy or remote writes. Run playtests with `nice` and kill only your own PIDs.
Branch `dome-city`, worktree `/workspace/mg-city`.
Do not touch `/workspace/mg-ui` (branch ui-cursed-rework, 10 commits); it is merged later.

## Done (playtests green)
- **Dome R=40 (1280 px).** Shell 0.9 outside / 0.02 inside, with a smooth real-time fade (in ≈0.8 s, out ≈0.7 s). Rim with glow, plus repel.
- **Server zone.** Zero damage inside: mob hits go through `zoneHit`, which returns early and increments `cityBlocked`. Mobs are pushed out, and a mob whose target is inside resets.
- **Killers stay out** (PK, PvP, or 5 mobs in 10 min). The client gets the deny banner with a countdown via `city_knock`.
- **Kills from under the dome** are not counted.
- **City from the map.**
  - Empty cells are filled with blackened ground plus blob-47; the playtest reports 0 empty cells.
  - The ice edge sits beyond R and the black fringe is clipped.
  - Layout decor inside the city has been removed, so the signpost no longer covers the rose.
- **Interiors.** 11 buildings, each its own instance (house 9×8, tavern 12×10, tent 8×7), with doors and exits.
- **Other.**
  - NPC slots: 24.
  - The rose renders at (24608, 3232) — centre of the grass bed (the wooden tilled_rot planter, its fence posts and bucket are removed), stage 6, no curse; a purely visual corruption decal (cityView.buildBlight) sits under it.
  - PK button (7 s / 30 s) and red names.
  - Kill stats (C window).
  - Position restore, including inside a house.
  - Crystal moved (city-test).

## Tests
- `server/meta/city-test.ts`: 218 ok.
- `dayNight-test.ts`: 34 ok.
- `tools/playtest/city-dome.cjs`: 24/0.
- `city-logic.cjs`: 28/0.
- `city-hero.cjs`: overview shots.
- `day-night.cjs`: 10/0.
  - Light spots now actually glow: the r128 instanceColor came out black, so they use a custom aCol attribute.
  - City lights come from map lanterns, fires and doorways (66 sources in the city at night).

## How to run
- Server: `wrangler dev --local` on port 8883; PID in `/workspace/mc-harness-city/wrangler.pid`.
- Client: Vite on 5297.
- Bundle the unit tests: `node_modules/.bin/esbuild X.ts --bundle --platform=node --format=esm --outfile=/tmp/x.mjs --loader:.json=json && node /tmp/x.mjs`
- Run a playtest: `NODE_PATH=/workspace/mc-ui-tools/node_modules setsid nohup nice node tools/playtest/<x>.cjs > log &`
- Run playtests ONE AT A TIME. In parallel, swiftshader drops to about 2 fps and the tests fail spuriously.
- Do not edit src/ or server/ while a playtest runs, because the hot reload breaks the run.
- Before screenshot passes, run `node tools/sync-city-art/sync.mjs` (new Историк drops in /workspace/city_dome, alkazak_map, tileset_dark_medieval).
- Output: `/workspace/morrisgrad-round3/dome-city/{dome,logic,hero,daynight}`

## Remaining
- Day/night: possible look polish. Lantern light sits at the base of the post; dusk at 19:40 has few lights (lightsOn ramps from 19:45).
- Polish: NPC visuals at the slots, and the city's whitish tint in daylight.
- Final dome previews and environment coordinates from Историк, when they arrive.

## Light emitters (where a light comes from)
- One module: `src/pages/MorrisCurse/_core/engine/lightEmitter.js`. `lightEmitter(key, frame?, set?)` returns `[ex, ey]` in sprite px from the bottom-centre anchor (ey up). Other helpers: `emitterOffsetM()` (metres in the sprite plane, mirrors with `flip`), `emitterSpotsM()` (building windows/doors), `emitterWorld()` / `emitterGround()` (3D emitter point / ground point directly below), `setEmitterCamera(camera)` (once per frame), and `setEmitterOverrides()` (admin table).
- Data: `src/assets/mc/light_emitters.json`, generated by `python3 tools/light-emitters/gen.py` (re-run after `tools/sync-city-art` or new props art). It holds the per-key/per-frame centroid of `_glow` pixels (weight = alpha × brightness); for buildings, `spots` are the connected glow blobs.
- Consumers: `engine/atmosphere.js` (world halos, pools, desktop PointLights), `engine/dayNight.js` (night mask: pool on the ground under the emitter, elongated by `LT.poolEl`; halo at the emitter), `hub/cityView.js` (city lamp halos behind sprites, window/door lights).
- The props3 branch (Художник's light_* sprites replacing radialTex halos) should call `lightEmitter(key, frame)` / `emitterWorld()` and draw its sprite there.
- Test: `tools/light-emitters/run-test.sh` checks emitter world position == glow centroid ±1 px for every key and frame, mirroring, pool under emitter, building spots and overrides.

## Альказак: вертикальный забор и колодец (правки поверх alkazak_map.json)
- В атласе `props_dark` (и в props3: только `fence`/`fence_2`) нет вертикального пролёта забора: `dm_fence` — горизонтальный,
  `dm_fence_post` — узловой столб с обрубками жердей влево/вправо. Колонны таких столбов через 32 px торчали обрубками вбок.
- Арт Художника (`/workspace/city_dome_fence/`, README + SELFCHECK PASS): `dm_fence_v` (пролёт С–Ю 3.2 м, якорь — южный конец) и
  `dm_fence_corner` (угол/концевой столб) — ряды 32–33 листа `props_dark_p32(.png|_glow.png)`, ключи в `props_dark_atlas.json`.
  Временный кадр (`fence_v.png`, `tools/city-fence/gen.py`) и 3D-жерди удалены.
- `server/meta/cityMap.ts fenceRuns()` — по правилам README: колонна узловых столбов (шаг ≤34 px, ≥2) → углы на крайних колышках
  горизонтальных пролётов (`FENCE_END_DX` = −25/+27 px; `y + 0.5` — рисуются после пролёта с тем же y) и `dm_fence_v` от нижнего угла
  вверх по 64 px; остаток — последний пролёт якорем в `Y_верх + 64`. Левая колонна `f:false`, правая `f:true` (жерди внутрь).
  Колонна съехала в соседнюю клетку — стена `#` проходимости едет за ней (`WALK_SHIFT`); коллизии — по-прежнему из сетки walk.
- Клиент `hub/cityView.js fenceSpan`: пролёт рисуется кадром НА ЗЕМЛЕ (квад 3.2 × 4.8 м от южного якоря на север), а не билбордом:
  билборд стоит к камере, колонна в перспективе 58° уходит к точке схода → стыки «ступенькой» (было видно на run-west). На земле
  кадр ложится по линии колонны, следующий пролёт — ровно в его северной точке; 4.8 м на земле = 4.8·sin(тангажа) на экране, как у
  билборда × SIN_P. Глубина — как у земли: герой у северной половины пролётом не перекрывается (README, риск 1). Угол — обычный спрайт.
- Колодец: `WELL_MOVES` — с мощёной площади (24758, 3468) на траву (24758, 3692), проходимость переезжает; ведро — часть кадра `dm_well`.
- Тесты: `server/meta/city-test.ts` (забор: нет узловых колонн, пролёт от нижнего угла до верхнего, без щелей, f по стороне, углы y+0.5, стены; колодец). Скрины: `polish/fence-well/`, `polish/fence-v2/{before,after}`.

## Админка города — аудит (вживую, D1, «Вернуть исходное»)
- «Город»: купол — радиус, непрозрачность снаружи/внутри, переход при входе/выходе `fadeSec`, полоса у края `fadeBandPx`, выталкивание
  (`pushExtraTiles`); убийцы — окно/пороги/переключатели; роза — пятно порчи `blightOn/blightSize/blightK`; вид — `groundLight`
  (яркость земли города: перебак городских чанков terrainChunks вживую). Мёртвые поля `groundTint`/`grassPct` (земля — по карте) из формы убраны.
- «PK-режим»: секунды входа/выхода, сброс отсчёта уроном `cancelOnHit` (получил) / `cancelOnDeal` (нанёс), цвета полосы, значок, цвет имени.
- «День и ночь»: закат/рассвет, цвета, темнота, `reduceMax` — максимум ползунка «Смягчить ночь», форс-время, разброс огней;
  огни `lt.*` (мерцание, сила пятна по видам kFire/kLamp/kWindow, размер/вытянутость пятна, ореол, ореолы и _glow по видам) → клиентский
  `LT` (engine/dayNight.js); `emitters` — JSON правок точек огня → `setEmitterOverrides` (город пересобирает огни по `emitterVersion()`;
  мир — при следующей сборке сцены/чанка). Сервер проверяет JSON (объект, [ex,ey] ±300).
- Плейтест `tools/playtest/city-admin.cjs` (только локально): правка в каждой вкладке → вживую → D1 → перезаход → сброс; 15/15.
  Если в D1 уже есть правки city/pk/dn — отказ (CLEAN=1 сбрасывает их через admin_reset — только для остатков самого плейтеста).
