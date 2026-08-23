(function() {
  const dungeonData = {
    id: 'dungeon_abyss',
    name: 'Затонувший Храм Бездны',
    desc: 'Древнее подводное святилище, скрывающее безумное давление глубин и ужасы первородного океана.',
    minLvl: 40,
    cooldownSec: 330,
    stages: [
      {
        name: 'Коралловые Рифы',
        enemies: [
          { id: 'm_abyss_1', name: 'Глубинный Змей', hp: 1400, atk: 240, def: 70, xp: 850, gold: 700, isBoss: false, avatar: 'demon', attackSpeed: 2.6, desc: 'Огромная хищная рыба, обитающая в кромешной тьме.' },
          { id: 'm_abyss_2', name: 'Океанический Страж', hp: 1600, atk: 220, def: 95, xp: 900, gold: 750, isBoss: false, avatar: 'shadow_guard', attackSpeed: 3.0, desc: 'Забытый голем, покрытый ракушками и водорослями.' }
        ]
      },
      {
        name: 'Затопленные Залы',
        enemies: [
          { id: 'm_abyss_3', name: 'Сирена Бездны', hp: 1300, atk: 290, def: 55, xp: 950, gold: 800, isBoss: false, avatar: 'reaper', attackSpeed: 2.4, desc: 'Манит путников в ловушку смертоносным пением.' },
          { id: 'e_abyss_guardian', name: 'Бездонный Страж [ЭЛИТА]', hp: 2600, atk: 350, def: 130, xp: 1500, gold: 1250, isBoss: false, avatar: 'shadow_guard', attackSpeed: 2.2, desc: 'Элитный страж подводных врат.' }
        ]
      },
      {
        name: 'Святилище Левиафана',
        enemies: [
          { id: 'b_kraken', name: 'Кракеноподобный Левиафан [БОСС]', hp: 11000, atk: 620, def: 210, xp: 12000, gold: 9500, isBoss: true, avatar: 'dragon', attackSpeed: 2.0, desc: 'Колоссальный хозяин бездны, способный сокрушить целые флотилии.' }
        ]
      }
    ],
    itemPool: [
      { name: 'Трезубец Бездны', slot: 'weapon', baseAtk: 420, baseDef: 60, baseHp: 800, baseAspd: 40, pierce: 80 },
      { name: 'Клинок Давления', slot: 'weapon', baseAtk: 460, baseDef: 30, baseHp: 650, baseAspd: 50, pierce: 70 },
      { name: 'Панцирь Океанического Титана', slot: 'armor', baseAtk: 0, baseDef: 150, baseHp: 1400, baseAspd: 15, pierce: 0 },
      { name: 'Шлем Коралловой Короны', slot: 'helm', baseAtk: 65, baseDef: 90, baseHp: 700, baseAspd: 22, pierce: 40 },
      { name: 'Плавники Глубинного Странника', slot: 'boots', baseAtk: 0, baseDef: 70, baseHp: 550, baseAspd: 45, pierce: 25 },
      { name: 'Наручи Давления', slot: 'bracers', baseAtk: 95, baseDef: 110, baseHp: 750, baseAspd: 35, pierce: 45 },
      { name: 'Амулет Затерянной Атлантиды', slot: 'amulet', baseAtk: 180, baseDef: 95, baseHp: 900, baseAspd: 25, pierce: 40 },
      { name: 'Кольцо Глубин', slot: 'ring', baseAtk: 180, baseDef: 90, baseHp: 950, baseAspd: 20, pierce: 35 },
      { name: 'Реликвия Первородного Океана', slot: 'relic', baseAtk: 220, baseDef: 140, baseHp: 1100, baseAspd: 30, pierce: 60 }
    ]
  };

  const idx = DUNGEONS.findIndex(d => d.id === dungeonData.id);
  if (idx !== -1) {
    DUNGEONS[idx] = dungeonData;
  } else {
    DUNGEONS.push(dungeonData);
  }
})();