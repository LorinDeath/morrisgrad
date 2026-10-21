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
  mmX: 10, mmY: 10,      // отступ круглой мини-карты от правого и верхнего края поля, px (ПК)
  mmZoom: 1,             // зум мини-карты по умолчанию (Поляна): 1 — 1x, 2 — 2x, 3 — 3x
  mmRound: true,         // круглая маска мини-карты (выкл — квадратная в рамке кита)
  tgtSide: "left",       // панель «Цель»: left — слева под рамкой героя, center — по центру сверху, right — справа под мини-картой
  tgtTop: 100,           // отступ панели «Цель» сверху, px
  tgtHide: 0,            // скрыть панель «Цель», если у цели ничего не меняется N с (0 — не скрывать)
  // атмосфера нового интерфейса (ui/atmoUi.js): только html.mc-ui — старая тема и забег без изменений
  atmo: true,            // виньетка/тон по локации и частицы поверх экрана
  vig: 45,               // виньетка-«порча» по краям в цвет локации, % (multiply — только затемняет, спрайты не высветляет)
  grade: 30,             // тон локации, % (multiply-слой: лёгкий цветовой оттенок, никогда не высветляет)
  parts: 50,             // частицы интерфейса (пепел, снег, угли…), % плотности (0 — нет)
  atmoMobile: 40,        // на телефоне сила виньетки/тона и плотность частиц, % от ПК (0 — выкл)
  partsMobile: 60,       // плотность частиц на телефоне, % от ПК (поверх atmoMobile)
  // сила по локациям, % от общих vig/grade/parts (0…200): Поляна, края Аринара, прочие края
  loc: { hub: { vig: 100, grade: 100, parts: 100 }, ice: { vig: 100, grade: 100, parts: 100 }, fire: { vig: 100, grade: 100, parts: 100 },
    stone: { vig: 100, grade: 100, parts: 100 }, air: { vig: 100, grade: 100, parts: 100 }, arinar: { vig: 100, grade: 100, parts: 100 } },
  sfx: true,             // звуки интерфейса (клик, открытие/закрытие окон)
  sfxVol: 40,            // громкость по умолчанию, % (у игрока — свой ползунок в Настройках)
  trans: true,           // плавное открытие/закрытие окон
  transMs: 160,          // длительность перехода окна, мс (60–400)
  loadScreen: true,      // экран загрузки в стиле нового интерфейса
  texPc: "32",           // «Текстуры» по умолчанию на ПК (пока игрок не выбрал сам; применяется со следующей загрузки)
  texMobile: "16",       // «Текстуры» по умолчанию на телефоне
};
export const UI_LOCS = ["hub", "ice", "fire", "stone", "air", "arinar"] as const;
const pct = (v) => Math.max(0, Math.min(100, Math.round(Number(v) || 0)));
const rng = (v, lo, hi, d) => { const n = Number(v); return Number.isFinite(n) ? Math.max(lo, Math.min(hi, Math.round(n))) : d; };
const locs = () => Object.fromEntries(UI_LOCS.map((k) => { const L: any = (UI_CFG.loc as any)?.[k] || {}; return [k, { vig: rng(L.vig, 0, 200, 100), grade: rng(L.grade, 0, 200, 100), parts: rng(L.parts, 0, 200, 100) }]; }));
export const uiClient = () => ({ on: UI_CFG.on !== false, glitch: Math.max(0, Math.min(2, Math.round(Number(UI_CFG.glitch) || 0))),
  biomeMix: Math.max(0, Math.min(100, Number(UI_CFG.biomeMix) || 0)), ornaments: UI_CFG.ornaments !== false,
  avatarCursedAt: Math.max(0, Math.min(100, Number(UI_CFG.avatarCursedAt) || 0)), avatars: UI_CFG.avatars !== false,
  hudIngame: UI_CFG.hudIngame !== false, hudOldDefault: UI_CFG.hudOldDefault === true, mmMobile: UI_CFG.mmMobile !== false,
  mmSize: Math.max(120, Math.min(240, Math.round(Number(UI_CFG.mmSize) || 176))),
  atmo: UI_CFG.atmo !== false, vig: pct(UI_CFG.vig), grade: pct(UI_CFG.grade), parts: pct(UI_CFG.parts), atmoMobile: pct(UI_CFG.atmoMobile),
  sfx: UI_CFG.sfx !== false, sfxVol: pct(UI_CFG.sfxVol), trans: UI_CFG.trans !== false,
  transMs: Math.max(60, Math.min(400, Math.round(Number(UI_CFG.transMs) || 160))), loadScreen: UI_CFG.loadScreen !== false,
  mmX: rng(UI_CFG.mmX, 0, 200, 10), mmY: rng(UI_CFG.mmY, 0, 200, 10), mmZoom: rng(UI_CFG.mmZoom, 1, 3, 1), mmRound: UI_CFG.mmRound !== false,
  tgtSide: ["left", "center", "right"].includes(UI_CFG.tgtSide) ? UI_CFG.tgtSide : "left", tgtTop: rng(UI_CFG.tgtTop, 40, 500, 100), tgtHide: rng(UI_CFG.tgtHide, 0, 60, 0),
  partsMobile: pct(UI_CFG.partsMobile), loc: locs(), texPc: UI_CFG.texPc === "16" ? "16" : "32", texMobile: UI_CFG.texMobile === "32" ? "32" : "16" });
