// Базовый дефолт до получения ответа от сервера
export const CLASSES = {
  warrior: {
    id: 'warrior',
    name: 'Воин',
    color: '#38bdf8',
    hp: 200,
    maxHp: 200,
    armor: 50,
    minAtk: 1,
    maxAtk: 4,
    ability: {
      name: 'Удар в спину',
      cooldown: 14,
      desc: 'Урон 1.5x от замаха.'
    }
  }
};

// Функция синхронизации данных от сервера
export function syncClassesFromServer(serverClasses) {
  if (!serverClasses || typeof serverClasses !== 'object') return;
  // Очищаем и наполняем объект данными с сервера
  for (const key of Object.keys(CLASSES)) {
    delete CLASSES[key];
  }
  Object.assign(CLASSES, serverClasses);
}

// Расчёт процента защиты брони (1 брони = 1%, 10 брони = 5%, максимум 90%)
export function getArmorReduction(armor) {
  if (!armor || armor <= 0) return 0;
  if (armor === 1) return 0.01;
  const pct = 1 + (armor - 1) * (4 / 9);
  return Math.min(0.90, pct / 100);
}

// Расчёт замаха атаки по времени (сек)
export function getChargeInfo(seconds) {
  let mult = 0.2;
  let tier = 'weak';
  let color = '#6b7280';
  let label = 'Быстрый выпад';

  if (seconds < 7) {
    mult = 0.2 + (seconds / 7) * 0.8;
    tier = 'charging';
    color = '#eab308';
    label = 'Зарядка';
  } else if (seconds < 12) {
    mult = 1.0 + ((seconds - 7) / 5) * 1.0;
    tier = 'charged';
    color = '#f97316';
    label = 'Сверхзаряд (x1)';
  } else if (seconds < 15) {
    mult = 2.0 + ((seconds - 12) / 3) * 1.0;
    tier = 'overcharged';
    color = '#ec4899';
    label = 'Сверхзаряд (x2)';
  } else {
    mult = 3.0;
    tier = 'ultra';
    color = '#a855f7';
    label = 'УЛЬТРА-ЗАРЯД (x3)';
  }

  return { mult: Number(mult.toFixed(2)), tier, color, label };
}