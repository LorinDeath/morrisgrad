# INTEGRATION — финальная сборка `integ-preview` (только локально: без push, без деплоя, без удалённых миграций)

**Состояние на 22.10.2026 ~00:30 (Киев): HEAD `1b2c00c`, 187 коммитов поверх `origin/main` `dda459c`.** Готово к выкладке по
`/workspace/morrisgrad-round3/final/deploy/DEPLOY.md` (скрипт `deploy.sh`). Обзор для Алекса — `final/ДЛЯ-АЛЕКСА.md`.

## Финальный состав (первый родитель, по порядку)
| коммит | что |
|--------|-----|
| `aef2039` `e92027b` `a60a3f4` `f0fe067` | light-nowashout / ui-cursed-rework / dome-city / integ-city-light (головы dc50672 61ab126 f63f4a9 6a61fc4; atmosphere.js — rerere) |
| `03bffe8` | props3 e0cf785 (эмиттеры пропсов → `engine/propEmitter.js` + `prop_emitters.json`, городской `lightEmitter.js` сохранён) |
| `519d624` | mobs32 792ee8d (строка настроек мобов в social.js) |
| `bea5ca7` | asset-cache 64a1bfa (манифест, mc-sw.js, коды ошибок, VRAM) |
| `37b76da` | guest-login 24cfd38 (оверлей входа; authErr → реестр showError, `_core/authCodes.js` удалён; .wrangler — бэкап `/workspace/mg-backups/wrangler-state-integ-20261021-232133`) |
| `96060cd` | deps-major 306e7ab (Astro 7, @astrojs/cloudflare 14, Clerk 4, @clerk/localizations ~4.24.0; включает security-audit e7d7852; server/meta/auth.ts из mg-sec docs/merge с проверкой exp) |
| `73542f3` `0f08316` `1b1a8a6` | манифест под Astro 7 (configEnvironment, `mc-vite-manifest.json` в dist/client, удаляется); группы `mobs32` и `auth` ленивые |
| `de347d8` `fd63dcc` | props3 b011edf, затем 0531e3a (свет арены 32, круглая граница; arena3 по умолчанию выкл) |
| `a9a5d50` | `server:deploy` с `--config wrangler.json` (корневой .wrangler/deploy/config.json от Astro 7 перехватывал конфиг) |
| `0bf029f` `1b2c00c` | atmo-ui на телефоне (проверка «не светлее»); кнопка ⚔ PK скрыта в забеге |

Если props3 получит новые коммиты: `git merge --no-ff props3`, затем `bun tools/tests/props3-test.ts`, `node tools/tests/arena32-test.mjs`,
`node tools/tests/undef-lint.mjs`, `npx astro build` (Node 22).

---
## История: первая локальная сборка (21.10, до финального состава)

Цель: показать город Альказак (купол, PK, счёт убийств, день/ночь) **в новом интерфейсе** и с исправленными цветами —
работа живёт в трёх отдельных ветках, здесь они сведены вместе. Рабочие ветки (`mg-ui`, `mg-city`, `mg-light`) не тронуты.

## Состав (обычные слияния `--no-ff`, без squash)
| # | коммит | что слито | голова |
|---|--------|-----------|--------|
| 0 | `dda459c` | основа: `origin/main` | — |
| 1 | `8b89dd5` | `light-nowashout` — цветовой конвейер pixColor (pixTex/pixMat/setDisplayRGB), админка «💡 Свет», light-fidelity | `dc50672` |
| 2 | `29332de` | `ui-cursed-rework` — кит Художника, аватары, «Интерфейс: Новый/Старый», «Текстуры 32/16», вода/лава, HUD в поле (круглая мини-карта, панель цели, «Старые панели») | `471686e` |
| 3 | `6932315` | `dome-city` — Альказак: купол R40, город, интерьеры, PK, счёт убийств, позиция при входе, день/ночь | `0af12e0` |
| 4 | `7e866b2` | `integ-city-light` — интеграционные правки городского исполнителя: город на pixColor (`96e0990`), ночная маска под sRGB (`519d314`) | `519d314` |
| — | `7feba36`… | инструменты: `tools/integ/rebuild.sh`, `resolve.py`, `integ-shots.cjs`, этот файл | — |

Шаг 4 добавлен сверх плана: без него город рисовался бы мимо исправленного цветового конвейера (ветка уже содержит light+city,
поэтому приносит только 2 коммита правок). Ранняя версия `tools/integ/resolve.py` случайно попала в коммит слияния #3 —
безвредно, актуальная версия в следующих коммитах.

## Разрешённые конфликты
Слияние 2 (ui поверх light):
- `server/meta/admin.ts` `KINDS`, `server/meta/overrides.ts` `type Kind`, `ui/admin.js` `ALL_TABS` — обе стороны: `… bmage, light, ui, terrain`.
- `overrides.ts` `SCHEMA` — блоки `light` + `ui` + `terrain`, затем `rare`; `TABLES` — `light`, `ui`, `terrain` (импорты UI_CFG/TERRAIN_CFG/LIGHT_CFG — все).

Слияние 3 (city поверх light+ui):
- те же перечисления + `city, pk, pos, dn`; `SCHEMA` — light/ui/terrain + city/pk/pos/dn; `TABLES` — объединение; импорты — все.
- `server/meta/profile.ts` snapshot (`meta_state`): строка города (`kst: killStats(a)`) + `light: lightClient()` из light.
- `src/.../worlds/terrainChunks.js`: импорты — `TILES`/`TEX_MODE` из `texPref.js` (ui: 16/32 по настройке) + только `city/tiles_dark.*` (город);
  старые фиксированные импорты 16-px листов из city убраны; `init()` — `TILES.sheets` (ui) + `this.dark` (город). Чанк города по-прежнему
  печётся в 32 px (`TX = DK || TEX`), поэтому земля города работает и при «Текстуры: 16», и при «32».
- `server/meta/propCollision.ts`: импорты liquid (ui) + cityBuild/worldBounds (city); `resolveWorld`/`blockedWorld` — сначала интерьер дома
  (город, комнаты не бывают жидкостью), затем пропсы + непроходимые вода/лава (ui); `boundsAt` (город) сохранён.
- `server/meta/arinarLayout.ts` `arinarPlan()` return — поля города (`city, cityP, cityW`) + `waters` (ui, отсев в liquid.ts).
- `src/.../ui/social.js` импорты — `texPref` (ui) + `dnReduce*` (city).
- `HANDOFF.md` — оба файла подряд (ui, затем city), разделитель `---`.

Слияние 4 (integ-city-light): все конфликты — перестановки уже имеющегося (наша сторона — надмножество). git автоматически
вставил второй блок `light` в `SCHEMA` (он стоит в разных местах у веток) — дубль удалён (`dedupe_schema` в resolve.py).
Правка `maskMax` в «🌗 День и ночь» пришла из 519d314.

Интеграционных исправлений кода сверх разрешения конфликтов не понадобилось.

## Пересборка
```
cd /workspace/mg-integ && tools/integ/rebuild.sh            # свежие головы веток, ветка integ-preview (старая голова → integ-preview-prev-<время>)
INTEG_HEADS="dc50672 471686e 0af12e0 519d314" tools/integ/rebuild.sh   # точные головы этой сборки
git worktree add --detach /tmp/x integ-preview && tools/integ/rebuild.sh /tmp/x   # «сухой» прогон без веток
```
Разрешения: `git rerere` (общий `.git/rr-cache`, включён `rerere.enabled/autoupdate`), затем `tools/integ/resolve.py`
(правила по форме конфликта). Проверено: пересборка с точными головами даёт побайтно то же дерево кода, что `7e866b2`.

**Известно на 21.10 ~18:20 (Киев):** с самыми свежими головами (`ui-cursed-rework` 5af20d4, `dome-city` 34b5268) появляется НОВЫЙ конфликт
`engine/atmosphere.js` — пятна/ореолы огней: light (`haloBehind`, `setDisplayRGB`) против city (`emitterGround/emitterWorld`, `poolEl`).
Правильное слияние: позиции из city + цвет `setDisplayRGB` и сдвиг ореола за спрайт из light. Скрипт остановится на нём; после ручного
разрешения rerere запомнит его для следующих пересборок.

## Локальный запуск
Харнесс `/workspace/mc-harness-integ/start.sh`: vite 127.0.0.1:5333 (`game.html` — поле, `game-panel.html` — с колонками как на сайте),
wrangler dev --local 127.0.0.1:8933 (инспектор 9333), D1 `--persist-to /workspace/mc-harness-integ/wr` (миграции применены локально,
3 розы `seed-roses.sql` скопированы из локальной базы city-харнесса — для проверок розы города). `MC_DEV_TRUST_USERID` — только здесь, локально.
Снимки: `NODE_PATH=/workspace/mc-ui-tools/node_modules node tools/integ/integ-shots.cjs` → `/workspace/morrisgrad-round3/integ/`.

## Проверки этой сборки (21.10, локально)
- Сборка: `vite build` игры (харнесс) — ок; бандл воркера `server/index.ts` (esbuild) — ок. Полный `astro build` недоступен: в общих node_modules нет astro.
- Серверные bun-тесты: 57/58 (в т.ч. city-test 218/0, dayNight-test 42/0, liquid 10/10, light-cfg, security 32/0). `roam-test` — 1 перф-порог
  (32 игрока < 8 мс/тик: 12 мс) — падает и на origin/main (9.6), и на каждой ветке отдельно (light 9.4, ui 10.6, city 11.1) на загруженной машине.
- light-fidelity ПК и телефон — ok (без засветки); city-logic 28/0; city-dome 24/0; ui-tour new/pc 9/0, new/mobile 7/0; hud-ingame pc 24/0; integ-shots — ok.
