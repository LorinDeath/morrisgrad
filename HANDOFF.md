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
