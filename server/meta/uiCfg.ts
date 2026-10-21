// Интерфейс «проклятое + очернённое» (реворк UI): только отрисовка у клиента, на механику не влияет.
// Админка «🎨 Интерфейс» (kind='ui', id='main' в game_overrides) — правка применяется живьём (meta_state.ui).
export const UI_CFG = {
  on: true,              // новый стиль интерфейса (выкл — прежний вид)
  glitch: 1,             // глитч рамок: 0 — нет, 1 — только под курсором, 2 — ещё редкие вздрагивания окон
  biomeMix: 60,          // доля цвета локации в металле рамок, % (0 — всегда проклятый фиолет, 100 — полностью цвет биома)
  ornaments: true,       // ромбы-застёжки на углах больших окон
  avatarCursedAt: 25,    // аватар героя становится очернённым с этого очернения героя, %
  avatars: true,         // аватары в окне персонажа, карточке героя и просмотре игрока
};
export const uiClient = () => ({ on: UI_CFG.on !== false, glitch: Math.max(0, Math.min(2, Math.round(Number(UI_CFG.glitch) || 0))),
  biomeMix: Math.max(0, Math.min(100, Number(UI_CFG.biomeMix) || 0)), ornaments: UI_CFG.ornaments !== false,
  avatarCursedAt: Math.max(0, Math.min(100, Number(UI_CFG.avatarCursedAt) || 0)), avatars: UI_CFG.avatars !== false });
