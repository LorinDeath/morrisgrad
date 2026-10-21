// Интерфейс «проклятое + очернённое» (реворк UI): только отрисовка у клиента, на механику не влияет.
// Админка «🎨 Интерфейс» (kind='ui', id='main' в game_overrides) — правка применяется живьём (meta_state.ui).
export const UI_CFG = {
  on: true,              // новый стиль интерфейса (выкл — прежний вид)
  glitch: 1,             // глитч рамок: 0 — нет, 1 — только под курсором, 2 — ещё редкие вздрагивания окон
  biomeMix: 60,          // доля цвета локации в металле рамок, % (0 — всегда проклятый фиолет, 100 — полностью цвет биома)
  ornaments: true,       // ромбы-застёжки на углах больших окон
  avatarCursedAt: 25,    // аватар героя становится очернённым с этого очернения героя, %
  avatars: true,         // аватары в окне персонажа, карточке героя и просмотре игрока
  hudIngame: true,       // HUD внутри игрового поля (круглая мини-карта, панель цели, компактные кнопки) вместо боковых колонок
  hudOldDefault: false,  // «Старые панели» по умолчанию (пока игрок сам не выбрал в настройках)
  mmMobile: true,        // круглая мини-карта и на телефоне (меньше, без кнопок)
  mmSize: 176,           // диаметр круглой мини-карты на ПК, px (120–240; на телефоне ×0.6)
  // атмосфера нового интерфейса (ui/atmoUi.js): только html.mc-ui — старая тема и забег без изменений
  atmo: true,            // виньетка/тон по локации и частицы поверх экрана
  vig: 45,               // виньетка-«порча» по краям в цвет локации, % (multiply — только затемняет, спрайты не высветляет)
  grade: 30,             // тон локации, % (multiply-слой: лёгкий цветовой оттенок, никогда не высветляет)
  parts: 50,             // частицы интерфейса (пепел, снег, угли…), % плотности (0 — нет)
  atmoMobile: 40,        // на телефоне сила виньетки/тона и плотность частиц, % от ПК (0 — выкл)
  sfx: true,             // звуки интерфейса (клик, открытие/закрытие окон)
  sfxVol: 40,            // громкость по умолчанию, % (у игрока — свой ползунок в Настройках)
  trans: true,           // плавное открытие/закрытие окон
  transMs: 160,          // длительность перехода окна, мс (60–400)
  loadScreen: true,      // экран загрузки в стиле нового интерфейса
};
const pct = (v) => Math.max(0, Math.min(100, Math.round(Number(v) || 0)));
export const uiClient = () => ({ on: UI_CFG.on !== false, glitch: Math.max(0, Math.min(2, Math.round(Number(UI_CFG.glitch) || 0))),
  biomeMix: Math.max(0, Math.min(100, Number(UI_CFG.biomeMix) || 0)), ornaments: UI_CFG.ornaments !== false,
  avatarCursedAt: Math.max(0, Math.min(100, Number(UI_CFG.avatarCursedAt) || 0)), avatars: UI_CFG.avatars !== false,
  hudIngame: UI_CFG.hudIngame !== false, hudOldDefault: UI_CFG.hudOldDefault === true, mmMobile: UI_CFG.mmMobile !== false,
  mmSize: Math.max(120, Math.min(240, Math.round(Number(UI_CFG.mmSize) || 176))),
  atmo: UI_CFG.atmo !== false, vig: pct(UI_CFG.vig), grade: pct(UI_CFG.grade), parts: pct(UI_CFG.parts), atmoMobile: pct(UI_CFG.atmoMobile),
  sfx: UI_CFG.sfx !== false, sfxVol: pct(UI_CFG.sfxVol), trans: UI_CFG.trans !== false,
  transMs: Math.max(60, Math.min(400, Math.round(Number(UI_CFG.transMs) || 160))), loadScreen: UI_CFG.loadScreen !== false });
