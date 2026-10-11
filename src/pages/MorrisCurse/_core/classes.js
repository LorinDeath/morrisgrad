// Динамический реестр классов, наполняемый сервером
export const CLASSES = {};

// Синхронизация данных от сервера (вызывается при получении пакета welcome)
export function syncClassesFromServer(serverClasses) {
  if (!serverClasses || typeof serverClasses !== 'object') return;
  
  for (const key of Object.keys(CLASSES)) {
    delete CLASSES[key];
  }
  Object.assign(CLASSES, serverClasses);
}

// Расчёт процента защиты брони
export function getArmorReduction(armor) {
  if (!armor || armor <= 0) return 0;
  if (armor === 1) return 0.01;
  const pct = 1 + (armor - 1) * (4 / 9);
  return Math.min(0.90, pct / 100);
}
