(function() {
  const dungeonData = {
    id: 'dungeon_1',
    name: 'Катакомбы Скорби',
    desc: 'Мрачные заброшенные склепы, где покоятся павшие короли и бродят беспокойные мертвецы.',
    minLvl: 7,
    cooldownSec: 180,
    stages: [
      {
        name: 'Гниющие Коридоры',
        enemies: [
          { id: 'm_skeleton_warrior', name: 'Падший Воин', hp: 90, atk: 22, def: 4, xp: 45, gold: 40, isBoss: false, avatar: 'skeleton', attackSpeed: 3.0, desc: 'Восставший из мертвых солдат со ржавым мечом.' },
          { id: 'm_ghoul', name: 'Голодный Гуль', hp: 80, atk: 25, def: 2, xp: 50, gold: 42, isBoss: false, avatar: 'dummy', attackSpeed: 2.5, desc: 'Падальщик, оскверняющий древние могилы.' }
        ]
      },
      {
        name: 'Зал Усыпальниц',
        enemies: [
          { id: 'm_crypt_mage', name: 'Некромант-Отступник', hp: 110, atk: 30, def: 6, xp: 70, gold: 60, isBoss: false, avatar: 'shadow_guard', attackSpeed: 3.2, desc: 'Черпает темную силу из останков усопших.' },
          { id: 'e_wight_guard', name: 'Могильный Упырь [ЭЛИТА]', hp: 190, atk: 35, def: 12, xp: 110, gold: 95, isBoss: false, avatar: 'skeleton', attackSpeed: 2.7, desc: 'Элитный страж склепов, наводящий ужас.' }
        ]
      },
      {
        name: 'Трон Праха',
        enemies: [
          { id: 'b_reaper', name: 'Чёрный Жнец [БОСС]', hp: 550, atk: 50, def: 14, xp: 320, gold: 260, isBoss: true, avatar: 'reaper', attackSpeed: 2.6, desc: 'Повелитель склепов и жатвы душ.' }
        ]
      }
    ],
    itemPool: [
      { name: 'Костяной Тесак', slot: 'weapon', baseAtk: 24, baseDef: 0, baseHp: 20, baseAspd: 10, pierce: 5 },
      { name: 'Жуткий Серп Жнеца', slot: 'weapon', baseAtk: 28, baseDef: 0, baseHp: 0, baseAspd: 14, pierce: 3 },
      { name: 'Кираса Из Костей', slot: 'armor', baseAtk: 0, baseDef: 12, baseHp: 90, baseAspd: -2, pierce: 0 },
      { name: 'Шлем Могильщика', slot: 'helm', baseAtk: 3, baseDef: 8, baseHp: 45, baseAspd: 1, pierce: 2 },
      { name: 'Сапоги Усопшего', slot: 'boots', baseAtk: 0, baseDef: 5, baseHp: 35, baseAspd: 7, pierce: 0 },
      // Предметы для слотов с требованиями престижа
      { name: 'Амулет Загробной Жизни', slot: 'amulet', baseAtk: 8, baseDef: 4, baseHp: 55, baseAspd: 3, pierce: 3 },
      { name: 'Кольцо Разложения', slot: 'ring', baseAtk: 12, baseDef: 2, baseHp: 30, baseAspd: 6, pierce: 2 },
      { name: 'Плащ Мертвеца', slot: 'cloak', baseAtk: 6, baseDef: 14, baseHp: 75, baseAspd: 5, pierce: 1 }
    ]
  };

  const idx = DUNGEONS.findIndex(d => d.id === dungeonData.id);
  if (idx !== -1) {
    DUNGEONS[idx] = dungeonData;
  } else {
    DUNGEONS.push(dungeonData);
  }
})();