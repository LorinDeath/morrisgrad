// Сбор ресурсов в открытом мире: свечение узлов (клиент) и личные таймеры узлов (сервер).
// Админка «⛏ Сбор» (kind='gather', id='main' в game_overrides) — правка применяется живьём (applyOverride).
export const GATHER_CFG = {
  glowOn: true,          // фиолетовое свечение у готовых к сбору узлов (деревья, кристаллы, цветы, руда)
  glowColor: "#a855f7",  // цвет свечения
  glowPower: 1,          // яркость, 0…3
  glowPulse: 1,          // скорость пульсации, 0 — без пульса
  glowSize: 1.18,        // размер ореола относительно спрайта
  personal: true,        // узел у каждого игрока свой: собранный одним остаётся доступным другим
  respawnMult: 1,        // время восстановления узла, ×
  range: 75,             // дальность сбора, px: узел виден для «E» и принимается сервером в этом радиусе от узла
  slack: 20,             // запас, px: на сколько дальше range можно отойти, не прерывая сбор (рывок позиции от сервера, лаг, скольжение у пропса)
  timeMs: 1100,          // длительность сбора, мс
};
const num = (v: any, d: number, lo: number, hi: number) => { const x = Number(v); return Number.isFinite(x) ? Math.max(lo, Math.min(hi, x)) : d; };
export const gatherRange = () => num(GATHER_CFG.range, 75, 20, 400);
export const gatherSlack = () => num(GATHER_CFG.slack, 20, 0, 200);
export const gatherTimeMs = () => num(GATHER_CFG.timeMs, 1100, 100, 15000);
export const gatherClient = () => ({ glowOn: GATHER_CFG.glowOn !== false, glowColor: GATHER_CFG.glowColor, glowPower: GATHER_CFG.glowPower,
  glowPulse: GATHER_CFG.glowPulse, glowSize: GATHER_CFG.glowSize,
  range: gatherRange(), slack: gatherSlack(), timeMs: gatherTimeMs() });
