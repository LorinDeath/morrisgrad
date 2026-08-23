// Проверяем, есть ли уже такой данж в массиве
const existingIndex = DUNGEONS.findIndex(d => d.id === 'dungeon_intro_2');

const updatedDungeon = {
  id: 'dungeon_intro_2',
  name: 'Заброшенный Тракт Альказака',
  desc: 'Опасные горные тракты, захваченные бандами безжалостных мародёров и дезертиров.',
  minLvl: 2,
  cooldownSec: 0,
  stages: [
    {
      name: 'Застава на тракте',
      enemies: [
        { id: 'm_bandit_scout', name: 'Бандит-Дозорный', hp: 45, atk: 10, def: 1, xp: 18, gold: 15, isBoss: false, avatar: 'bandit', attackSpeed: 2.8, desc: 'Высматривает путников с заброшенной вышки.' },
        { id: 'm_deserter', name: 'Беглый Дезертир', hp: 50, atk: 12, def: 2, xp: 22, gold: 18, isBoss: false, avatar: 'skeleton', attackSpeed: 3.0, desc: 'Бывший солдат, продавший совесть за золото.' }
      ]
    },
    {
      name: 'Засада в ущелье',
      enemies: [
        { id: 'm_bandit_archer', name: 'Разбойник-Арбалетчик', hp: 40, atk: 15, def: 1, xp: 25, gold: 22, isBoss: false, avatar: 'bandit', attackSpeed: 3.5, desc: 'Бьет издалека отточенными болтами.' },
        { id: 'e_mercenary', name: 'Наёмник-Головорез [ЭЛИТА]', hp: 95, atk: 16, def: 4, xp: 45, gold: 40, isBoss: false, avatar: 'skeleton', attackSpeed: 2.6, desc: 'Профессиональный убийца на службе у атамана.' }
      ]
    },
    {
      name: 'Лагерь Атамана',
      enemies: [
        { id: 'b_bandit_leader', name: 'Атаман Мародёров [БОСС]', hp: 200, atk: 22, def: 6, xp: 100, gold: 85, isBoss: true, avatar: 'bandit', attackSpeed: 2.5, desc: 'Главарь банды, держащий в страхе всю округу.' }
      ]
    }
  ],
  itemPool: [
    { name: 'Кривой Тесак Тракта', slot: 'weapon', baseAtk: 12, baseDef: 0, baseHp: 10, baseAspd: 8, pierce: 2 },
    { name: 'Зазубренный Ятаган', slot: 'weapon', baseAtk: 14, baseDef: 0, baseHp: 0, baseAspd: 10, pierce: 1 },
    { name: 'Кожаный Панцирь Разбойника', slot: 'armor', baseAtk: 0, baseDef: 5, baseHp: 40, baseAspd: 3, pierce: 0 },
    { name: 'Кожаный Капюшон', slot: 'helm', baseAtk: 0, baseDef: 3, baseHp: 20, baseAspd: 2, pierce: 0 },
    { name: 'Кольцо Разбойника', slot: 'ring', baseAtk: 6, baseDef: 0, baseHp: 25, baseAspd: 4, pierce: 1 }
  ]
};

if (existingIndex !== -1) {
  // Если данж уже был — заменяем его старую версию на новую
  DUNGEONS[existingIndex] = updatedDungeon;
} else {
  // Если это абсолютно новый данж — просто добавляем
  DUNGEONS.push(updatedDungeon);
}