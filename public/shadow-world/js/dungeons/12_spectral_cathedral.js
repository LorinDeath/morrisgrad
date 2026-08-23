(function() {
  // Пул спектральных и религиозных врагов для 12 этажей собора
  const cathedralEnemies = [
    { id: 'm_sc_1', name: 'Инквизитор', hp: 12000, atk: 1650, def: 420, xp: 10000, gold: 8000, isBoss: false, avatar: 'skeleton', attackSpeed: 1.8, desc: 'Фанатичный страж догм, наказывающий за малейшее сомнение.' },
    { id: 'm_sc_2', name: 'Еретический Фантом', hp: 11000, atk: 1800, def: 360, xp: 10500, gold: 8400, isBoss: false, avatar: 'shadow_guard', attackSpeed: 2.1, desc: 'Душа казненного еретика, жаждущая возмездия.' },
    { id: 'm_sc_3', name: 'Спектральный Фанатик', hp: 11500, atk: 1750, def: 390, xp: 10800, gold: 8700, isBoss: false, avatar: 'priest', attackSpeed: 1.9, desc: 'Проводит безумные молитвы в залах иллюзорного собора.' },
    { id: 'e_arch_inquisitor', name: 'Элитный Каратель [ЭЛИТА]', hp: 22000, atk: 2400, def: 650, xp: 18000, gold: 14500, isBoss: false, avatar: 'jailer', attackSpeed: 1.7, desc: 'Суровый надзиратель святилища с двуручным молотом.' }
  ];

  const dungeonData = {
    id: 'dungeon_spectral_cathedral',
    name: '⛪ Спектральный Собор',
    desc: 'Величественное святилище иллюзий и безумной веры, где реальность искажена священными призраками.',
    minLvl: 90,
    cooldownSec: 400,
    stages: generateTowerStages(
      12,
      'Спектр',
      cathedralEnemies,
      { id: 'b_specter_pope', name: 'Призрачный Понтифик [БОСС]', hp: 75000, atk: 3800, def: 1100, xp: 110000, gold: 90000, isBoss: true, avatar: 'priest', attackSpeed: 1.5, desc: 'Верховный правитель собора, управляющий силой света и иллюзий.' }
    ),
    itemPool: [
      { name: 'Клинок Святого Откровения', slot: 'weapon', baseAtk: 2100, baseDef: 300, baseHp: 4200, baseAspd: 45, pierce: 320 },
      { name: 'Посох Иллюзий', slot: 'weapon', baseAtk: 2300, baseDef: 180, baseHp: 3500, baseAspd: 55, pierce: 280 },
      { name: 'Мантия Бога', slot: 'armor', baseAtk: 320, baseDef: 1200, baseHp: 6500, baseAspd: 35, pierce: 0 },
      { name: 'Венец Понтифика', slot: 'helm', baseAtk: 600, baseDef: 750, baseHp: 4900, baseAspd: 30, pierce: 120 },
      { name: 'Поступь Святого', slot: 'boots', baseAtk: 0, baseDef: 350, baseHp: 2800, baseAspd: 75, pierce: 110 },
      { name: 'Наручи Спектра', slot: 'bracers', baseAtk: 380, baseDef: 450, baseHp: 3100, baseAspd: 30, pierce: 60 },
      { name: 'Амулет Божественного Эха', slot: 'amulet', baseAtk: 850, baseDef: 480, baseHp: 4500, baseAspd: 45, pierce: 190 },
      { name: 'Кольцо Иллюзорного Света', slot: 'ring', baseAtk: 900, baseDef: 390, baseHp: 3900, baseAspd: 65, pierce: 170 },
      { name: 'Плащ Святых Ликов', slot: 'cloak', baseAtk: 650, baseDef: 820, baseHp: 4600, baseAspd: 25, pierce: 90 },
      { name: 'Пояс Вечной Веры', slot: 'belt', baseAtk: 310, baseDef: 550, baseHp: 4100, baseAspd: 20, pierce: 70 },
      { name: 'Реликвия Спектрального Собора', slot: 'relic', baseAtk: 1050, baseDef: 680, baseHp: 5200, baseAspd: 40, pierce: 240 }
    ]
  };

  const idx = DUNGEONS.findIndex(d => d.id === dungeonData.id);
  if (idx !== -1) {
    DUNGEONS[idx] = dungeonData;
  } else {
    DUNGEONS.push(dungeonData);
  }
})();