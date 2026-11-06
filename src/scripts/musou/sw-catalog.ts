// Снимок живого списка данжей Тёмного мира.
// Собирается из public/shadow-world/js/data.js и js/dungeons/01…17
// тем же порядком, что index.html. Не править числа вручную:
// их сверяет server/musou/sw-audit.ts.
// Имена без эмодзи: в файлах перед некоторыми именами стоит пиктограмма.
// Приёмы, ряды атласа, цвет арены и опыт зачистки — баланс Орды, не поля файла.

export type SwRole = "mob" | "elite" | "boss";
export type SwEnemy = { id: string; name: string; role: SwRole; hp: number; atk: number; def: number };
export type SwStage = { name: string; kind: "pack" | "swarm" | "elite" | "boss"; enemies: SwEnemy[] };
export type SwItem = { name: string; slot: string };
export type SwDungeon = {
  id: string; name: string; desc: string; minLvl: number; cooldownSec: number; file: string;
  tower: number; theme: string; stages: SwStage[]; items: SwItem[];
};
export type SwQuest = { id: string; title: string; desc: string; targetId: string };
export type SwFloor = {
  n: number; sw: string; dungeon: number; stage: number; stagesInDungeon: number;
  name: string; dungeonName: string; desc: string; wave: [string, string, string];
  tint: string; ember: string; mob: string; general: string; boss: string; bossTitle: string;
  goal: "pack" | "elite" | "boss"; srcHp: number; srcAtk: number; file: string;
  gSig: "circle" | "cone" | "line" | "curse" | "summon";
  bSig: "circle" | "cone" | "line" | "curse" | "summon";
  gRow: number; bRow: number; mobRows: [number, number, number];
  minLvl: number; mut: number; xp: number; spawnGeneral: 0 | 1; story?: string;
};

export const SW_DUNGEONS: SwDungeon[] = [
  {
    "id": "dungeon_intro_1",
    "name": "Подвалы Старого Замка",
    "desc": "Заброшенные тренировочные подвалы замка, где хранятся первые реликвии павших стражей.",
    "minLvl": 1,
    "cooldownSec": 0,
    "file": "public/shadow-world/js/dungeons/01_intro_castle.js",
    "tower": 0,
    "theme": "",
    "stages": [
      {
        "name": "Сектор Мишеней",
        "kind": "pack",
        "enemies": [
          {
            "id": "m_dummy_1",
            "name": "Оживленный Манекен",
            "role": "mob",
            "hp": 35,
            "atk": 7,
            "def": 1
          },
          {
            "id": "m_rat_1",
            "name": "Подвальная Крыса-Мутант",
            "role": "mob",
            "hp": 28,
            "atk": 9,
            "def": 0
          }
        ]
      },
      {
        "name": "Оружейный зал",
        "kind": "boss",
        "enemies": [
          {
            "id": "b_shadow_guard",
            "name": "Теневой Страж",
            "role": "boss",
            "hp": 140,
            "atk": 16,
            "def": 5
          }
        ]
      },
      {
        "name": "Сокровищница Гарнизона",
        "kind": "elite",
        "enemies": [
          {
            "id": "b_armored_skeleton",
            "name": "Осколок Командира",
            "role": "elite",
            "hp": 180,
            "atk": 20,
            "def": 8
          }
        ]
      }
    ],
    "items": [
      {
        "name": "Учебный Меч",
        "slot": "weapon"
      },
      {
        "name": "Ржавый Кинжал",
        "slot": "weapon"
      },
      {
        "name": "Тяжелый Тесак",
        "slot": "weapon"
      },
      {
        "name": "Кожаный Доспех",
        "slot": "armor"
      },
      {
        "name": "Поношенный Кафтан",
        "slot": "armor"
      },
      {
        "name": "Латный Нагрудник Стража",
        "slot": "armor"
      }
    ]
  },
  {
    "id": "dungeon_intro_2",
    "name": "Заброшенный Тракт Альказака",
    "desc": "Опасные горные тракты, захваченные бандами безжалостных мародёров и дезертиров.",
    "minLvl": 2,
    "cooldownSec": 0,
    "file": "public/shadow-world/js/dungeons/02_intro_road.js",
    "tower": 0,
    "theme": "",
    "stages": [
      {
        "name": "Застава на тракте",
        "kind": "pack",
        "enemies": [
          {
            "id": "m_bandit_scout",
            "name": "Бандит-Дозорный",
            "role": "mob",
            "hp": 45,
            "atk": 10,
            "def": 1
          },
          {
            "id": "m_deserter",
            "name": "Беглый Дезертир",
            "role": "mob",
            "hp": 50,
            "atk": 12,
            "def": 2
          }
        ]
      },
      {
        "name": "Засада в ущелье",
        "kind": "elite",
        "enemies": [
          {
            "id": "m_bandit_archer",
            "name": "Разбойник-Арбалетчик",
            "role": "mob",
            "hp": 40,
            "atk": 15,
            "def": 1
          },
          {
            "id": "e_mercenary",
            "name": "Наёмник-Головорез",
            "role": "elite",
            "hp": 95,
            "atk": 16,
            "def": 4
          }
        ]
      },
      {
        "name": "Лагерь Атамана",
        "kind": "boss",
        "enemies": [
          {
            "id": "b_bandit_leader",
            "name": "Атаман Мародёров",
            "role": "boss",
            "hp": 200,
            "atk": 22,
            "def": 6
          }
        ]
      }
    ],
    "items": [
      {
        "name": "Кривой Тесак Тракта",
        "slot": "weapon"
      },
      {
        "name": "Зазубренный Ятаган",
        "slot": "weapon"
      },
      {
        "name": "Кожаный Панцирь Разбойника",
        "slot": "armor"
      },
      {
        "name": "Кожаный Капюшон",
        "slot": "helm"
      },
      {
        "name": "Кольцо Разбойника",
        "slot": "ring"
      }
    ]
  },
  {
    "id": "dungeon_intro_3",
    "name": "Хрустальные Пещеры",
    "desc": "Мерцающие подземелья, наполненные кристальной магией и опасными агрессивными созданиями.",
    "minLvl": 6,
    "cooldownSec": 0,
    "file": "public/shadow-world/js/dungeons/03_intro_swamp.js",
    "tower": 0,
    "theme": "",
    "stages": [
      {
        "name": "Мерцающие Гроты",
        "kind": "pack",
        "enemies": [
          {
            "id": "m_crystal_bat",
            "name": "Кристальная Летучая Мышь",
            "role": "mob",
            "hp": 70,
            "atk": 18,
            "def": 3
          },
          {
            "id": "m_cave_crawler",
            "name": "Пещерный Ползун",
            "role": "mob",
            "hp": 85,
            "atk": 20,
            "def": 5
          }
        ]
      },
      {
        "name": "Зал Осколков",
        "kind": "elite",
        "enemies": [
          {
            "id": "e_crystal_golem",
            "name": "Кристальный Страж",
            "role": "elite",
            "hp": 150,
            "atk": 25,
            "def": 10
          }
        ]
      },
      {
        "name": "Сердце Жеоды",
        "kind": "boss",
        "enemies": [
          {
            "id": "b_crystal_queen",
            "name": "Кристальная Владычица",
            "role": "boss",
            "hp": 320,
            "atk": 32,
            "def": 12
          }
        ]
      }
    ],
    "items": [
      {
        "name": "Кристальный Меч",
        "slot": "weapon"
      },
      {
        "name": "Кираса из Жоеды",
        "slot": "armor"
      },
      {
        "name": "Шлем Кристального Стража",
        "slot": "helm"
      },
      {
        "name": "Пулковые Сапоги",
        "slot": "boots"
      },
      {
        "name": "Кристальный Амулет",
        "slot": "amulet"
      },
      {
        "name": "Кольцо Мерцающего Света",
        "slot": "ring"
      }
    ]
  },
  {
    "id": "dungeon_1",
    "name": "Катакомбы Скорби",
    "desc": "Мрачные заброшенные склепы, где покоятся павшие короли и бродят беспокойные мертвецы.",
    "minLvl": 7,
    "cooldownSec": 180,
    "file": "public/shadow-world/js/dungeons/04_catacombs.js",
    "tower": 0,
    "theme": "",
    "stages": [
      {
        "name": "Гниющие Коридоры",
        "kind": "pack",
        "enemies": [
          {
            "id": "m_skeleton_warrior",
            "name": "Падший Воин",
            "role": "mob",
            "hp": 90,
            "atk": 22,
            "def": 4
          },
          {
            "id": "m_ghoul",
            "name": "Голодный Гуль",
            "role": "mob",
            "hp": 80,
            "atk": 25,
            "def": 2
          }
        ]
      },
      {
        "name": "Зал Усыпальниц",
        "kind": "elite",
        "enemies": [
          {
            "id": "m_crypt_mage",
            "name": "Некромант-Отступник",
            "role": "mob",
            "hp": 110,
            "atk": 30,
            "def": 6
          },
          {
            "id": "e_wight_guard",
            "name": "Могильный Упырь",
            "role": "elite",
            "hp": 190,
            "atk": 35,
            "def": 12
          }
        ]
      },
      {
        "name": "Трон Праха",
        "kind": "boss",
        "enemies": [
          {
            "id": "b_reaper",
            "name": "Чёрный Жнец",
            "role": "boss",
            "hp": 550,
            "atk": 50,
            "def": 14
          }
        ]
      }
    ],
    "items": [
      {
        "name": "Костяной Тесак",
        "slot": "weapon"
      },
      {
        "name": "Жуткий Серп Жнеца",
        "slot": "weapon"
      },
      {
        "name": "Кираса Из Костей",
        "slot": "armor"
      },
      {
        "name": "Шлем Могильщика",
        "slot": "helm"
      },
      {
        "name": "Сапоги Усопшего",
        "slot": "boots"
      },
      {
        "name": "Амулет Загробной Жизни",
        "slot": "amulet"
      },
      {
        "name": "Кольцо Разложения",
        "slot": "ring"
      },
      {
        "name": "Плащ Мертвеца",
        "slot": "cloak"
      }
    ]
  },
  {
    "id": "dungeon_storm_tower",
    "name": "Башня Бесконечного Шторма",
    "desc": "Высотный шпиль бури, где каждый этаж испытывает силу героя на прочность под непрекращающимися ударами молний.",
    "minLvl": 10,
    "cooldownSec": 210,
    "file": "public/shadow-world/js/dungeons/05_storm_tower.js",
    "tower": 12,
    "theme": "Шторм",
    "stages": [
      {
        "name": "Ярус 1: Шторм",
        "kind": "pack",
        "enemies": [
          {
            "id": "m_st_1",
            "name": "Грозовой Дух",
            "role": "mob",
            "hp": 160,
            "atk": 32,
            "def": 8
          },
          {
            "id": "m_st_2",
            "name": "Штормовой Страж",
            "role": "mob",
            "hp": 190,
            "atk": 38,
            "def": 12
          },
          {
            "id": "m_st_3",
            "name": "Электрический Сталкер",
            "role": "mob",
            "hp": 140,
            "atk": 45,
            "def": 6
          },
          {
            "id": "e_storm_elite",
            "name": "Громовержец",
            "role": "elite",
            "hp": 280,
            "atk": 52,
            "def": 18
          }
        ]
      },
      {
        "name": "Ярус 2: Шторм",
        "kind": "pack",
        "enemies": [
          {
            "id": "m_st_1",
            "name": "Грозовой Дух",
            "role": "mob",
            "hp": 160,
            "atk": 32,
            "def": 8
          },
          {
            "id": "m_st_2",
            "name": "Штормовой Страж",
            "role": "mob",
            "hp": 190,
            "atk": 38,
            "def": 12
          },
          {
            "id": "m_st_3",
            "name": "Электрический Сталкер",
            "role": "mob",
            "hp": 140,
            "atk": 45,
            "def": 6
          },
          {
            "id": "e_storm_elite",
            "name": "Громовержец",
            "role": "elite",
            "hp": 280,
            "atk": 52,
            "def": 18
          }
        ]
      },
      {
        "name": "Ярус 3: Шторм",
        "kind": "pack",
        "enemies": [
          {
            "id": "m_st_1",
            "name": "Грозовой Дух",
            "role": "mob",
            "hp": 160,
            "atk": 32,
            "def": 8
          },
          {
            "id": "m_st_2",
            "name": "Штормовой Страж",
            "role": "mob",
            "hp": 190,
            "atk": 38,
            "def": 12
          },
          {
            "id": "m_st_3",
            "name": "Электрический Сталкер",
            "role": "mob",
            "hp": 140,
            "atk": 45,
            "def": 6
          },
          {
            "id": "e_storm_elite",
            "name": "Громовержец",
            "role": "elite",
            "hp": 280,
            "atk": 52,
            "def": 18
          }
        ]
      },
      {
        "name": "Орда (Этаж 4)",
        "kind": "swarm",
        "enemies": [
          {
            "id": "m_st_1",
            "name": "Грозовой Дух",
            "role": "mob",
            "hp": 160,
            "atk": 32,
            "def": 8
          },
          {
            "id": "m_st_2",
            "name": "Штормовой Страж",
            "role": "mob",
            "hp": 190,
            "atk": 38,
            "def": 12
          },
          {
            "id": "m_st_3",
            "name": "Электрический Сталкер",
            "role": "mob",
            "hp": 140,
            "atk": 45,
            "def": 6
          },
          {
            "id": "e_storm_elite",
            "name": "Громовержец",
            "role": "elite",
            "hp": 280,
            "atk": 52,
            "def": 18
          }
        ]
      },
      {
        "name": "Ярус 5: Шторм",
        "kind": "pack",
        "enemies": [
          {
            "id": "m_st_1",
            "name": "Грозовой Дух",
            "role": "mob",
            "hp": 160,
            "atk": 32,
            "def": 8
          },
          {
            "id": "m_st_2",
            "name": "Штормовой Страж",
            "role": "mob",
            "hp": 190,
            "atk": 38,
            "def": 12
          },
          {
            "id": "m_st_3",
            "name": "Электрический Сталкер",
            "role": "mob",
            "hp": 140,
            "atk": 45,
            "def": 6
          },
          {
            "id": "e_storm_elite",
            "name": "Громовержец",
            "role": "elite",
            "hp": 280,
            "atk": 52,
            "def": 18
          }
        ]
      },
      {
        "name": "Ярус 6: Шторм",
        "kind": "pack",
        "enemies": [
          {
            "id": "m_st_1",
            "name": "Грозовой Дух",
            "role": "mob",
            "hp": 160,
            "atk": 32,
            "def": 8
          },
          {
            "id": "m_st_2",
            "name": "Штормовой Страж",
            "role": "mob",
            "hp": 190,
            "atk": 38,
            "def": 12
          },
          {
            "id": "m_st_3",
            "name": "Электрический Сталкер",
            "role": "mob",
            "hp": 140,
            "atk": 45,
            "def": 6
          },
          {
            "id": "e_storm_elite",
            "name": "Громовержец",
            "role": "elite",
            "hp": 280,
            "atk": 52,
            "def": 18
          }
        ]
      },
      {
        "name": "Ярус 7: Шторм",
        "kind": "pack",
        "enemies": [
          {
            "id": "m_st_1",
            "name": "Грозовой Дух",
            "role": "mob",
            "hp": 160,
            "atk": 32,
            "def": 8
          },
          {
            "id": "m_st_2",
            "name": "Штормовой Страж",
            "role": "mob",
            "hp": 190,
            "atk": 38,
            "def": 12
          },
          {
            "id": "m_st_3",
            "name": "Электрический Сталкер",
            "role": "mob",
            "hp": 140,
            "atk": 45,
            "def": 6
          },
          {
            "id": "e_storm_elite",
            "name": "Громовержец",
            "role": "elite",
            "hp": 280,
            "atk": 52,
            "def": 18
          }
        ]
      },
      {
        "name": "Орда (Этаж 8)",
        "kind": "swarm",
        "enemies": [
          {
            "id": "m_st_1",
            "name": "Грозовой Дух",
            "role": "mob",
            "hp": 160,
            "atk": 32,
            "def": 8
          },
          {
            "id": "m_st_2",
            "name": "Штормовой Страж",
            "role": "mob",
            "hp": 190,
            "atk": 38,
            "def": 12
          },
          {
            "id": "m_st_3",
            "name": "Электрический Сталкер",
            "role": "mob",
            "hp": 140,
            "atk": 45,
            "def": 6
          },
          {
            "id": "e_storm_elite",
            "name": "Громовержец",
            "role": "elite",
            "hp": 280,
            "atk": 52,
            "def": 18
          }
        ]
      },
      {
        "name": "Ярус 9: Шторм",
        "kind": "pack",
        "enemies": [
          {
            "id": "m_st_1",
            "name": "Грозовой Дух",
            "role": "mob",
            "hp": 160,
            "atk": 32,
            "def": 8
          },
          {
            "id": "m_st_2",
            "name": "Штормовой Страж",
            "role": "mob",
            "hp": 190,
            "atk": 38,
            "def": 12
          },
          {
            "id": "m_st_3",
            "name": "Электрический Сталкер",
            "role": "mob",
            "hp": 140,
            "atk": 45,
            "def": 6
          },
          {
            "id": "e_storm_elite",
            "name": "Громовержец",
            "role": "elite",
            "hp": 280,
            "atk": 52,
            "def": 18
          }
        ]
      },
      {
        "name": "Ярус 10: Шторм",
        "kind": "pack",
        "enemies": [
          {
            "id": "m_st_1",
            "name": "Грозовой Дух",
            "role": "mob",
            "hp": 160,
            "atk": 32,
            "def": 8
          },
          {
            "id": "m_st_2",
            "name": "Штормовой Страж",
            "role": "mob",
            "hp": 190,
            "atk": 38,
            "def": 12
          },
          {
            "id": "m_st_3",
            "name": "Электрический Сталкер",
            "role": "mob",
            "hp": 140,
            "atk": 45,
            "def": 6
          },
          {
            "id": "e_storm_elite",
            "name": "Громовержец",
            "role": "elite",
            "hp": 280,
            "atk": 52,
            "def": 18
          }
        ]
      },
      {
        "name": "Ярус 11: Шторм",
        "kind": "pack",
        "enemies": [
          {
            "id": "m_st_1",
            "name": "Грозовой Дух",
            "role": "mob",
            "hp": 160,
            "atk": 32,
            "def": 8
          },
          {
            "id": "m_st_2",
            "name": "Штормовой Страж",
            "role": "mob",
            "hp": 190,
            "atk": 38,
            "def": 12
          },
          {
            "id": "m_st_3",
            "name": "Электрический Сталкер",
            "role": "mob",
            "hp": 140,
            "atk": 45,
            "def": 6
          },
          {
            "id": "e_storm_elite",
            "name": "Громовержец",
            "role": "elite",
            "hp": 280,
            "atk": 52,
            "def": 18
          }
        ]
      },
      {
        "name": "Чертог Владыки (Этаж 12)",
        "kind": "boss",
        "enemies": [
          {
            "id": "b_raijin",
            "name": "Повелитель Бурь Райдзин",
            "role": "boss",
            "hp": 1100,
            "atk": 75,
            "def": 28
          },
          {
            "id": "m_st_1_throne",
            "name": "Страж Трона",
            "role": "mob",
            "hp": 160,
            "atk": 32,
            "def": 8
          }
        ]
      }
    ],
    "items": [
      {
        "name": "Громовой Клинок",
        "slot": "weapon"
      },
      {
        "name": "Молот Бури",
        "slot": "weapon"
      },
      {
        "name": "Кираса Небесного Грома",
        "slot": "armor"
      },
      {
        "name": "Шлем Электрического Разряда",
        "slot": "helm"
      },
      {
        "name": "Сапоги Ветрового Шага",
        "slot": "boots"
      },
      {
        "name": "Наручи Молнии",
        "slot": "bracers"
      },
      {
        "name": "Амулет Глаза Бури",
        "slot": "amulet"
      },
      {
        "name": "Кольцо Шаровой Молнии",
        "slot": "ring"
      },
      {
        "name": "Реликвия Древнего Шторма",
        "slot": "relic"
      }
    ]
  },
  {
    "id": "dungeon_soul_labyrinth",
    "name": "Лабиринт Забытых Душ",
    "desc": "Хаотичный призрачный лабиринт, где реальность искажена, а коридоры полны безумия и неупокоенных орд.",
    "minLvl": 20,
    "cooldownSec": 260,
    "file": "public/shadow-world/js/dungeons/06_soul_labyrinth.js",
    "tower": 14,
    "theme": "Лабиринт Хаоса",
    "stages": [
      {
        "name": "Ярус 1: Лабиринт Хаоса",
        "kind": "pack",
        "enemies": [
          {
            "id": "m_sl_1",
            "name": "Блуждающий Призрак",
            "role": "mob",
            "hp": 380,
            "atk": 72,
            "def": 18
          },
          {
            "id": "m_sl_2",
            "name": "Расколотая Тень",
            "role": "mob",
            "hp": 320,
            "atk": 85,
            "def": 10
          },
          {
            "id": "m_sl_3",
            "name": "Воющая Банши",
            "role": "mob",
            "hp": 350,
            "atk": 78,
            "def": 14
          },
          {
            "id": "e_soul_eater",
            "name": "Пожиратель Сущностей",
            "role": "elite",
            "hp": 600,
            "atk": 110,
            "def": 35
          }
        ]
      },
      {
        "name": "Ярус 2: Лабиринт Хаоса",
        "kind": "pack",
        "enemies": [
          {
            "id": "m_sl_1",
            "name": "Блуждающий Призрак",
            "role": "mob",
            "hp": 380,
            "atk": 72,
            "def": 18
          },
          {
            "id": "m_sl_2",
            "name": "Расколотая Тень",
            "role": "mob",
            "hp": 320,
            "atk": 85,
            "def": 10
          },
          {
            "id": "m_sl_3",
            "name": "Воющая Банши",
            "role": "mob",
            "hp": 350,
            "atk": 78,
            "def": 14
          },
          {
            "id": "e_soul_eater",
            "name": "Пожиратель Сущностей",
            "role": "elite",
            "hp": 600,
            "atk": 110,
            "def": 35
          }
        ]
      },
      {
        "name": "Ярус 3: Лабиринт Хаоса",
        "kind": "pack",
        "enemies": [
          {
            "id": "m_sl_1",
            "name": "Блуждающий Призрак",
            "role": "mob",
            "hp": 380,
            "atk": 72,
            "def": 18
          },
          {
            "id": "m_sl_2",
            "name": "Расколотая Тень",
            "role": "mob",
            "hp": 320,
            "atk": 85,
            "def": 10
          },
          {
            "id": "m_sl_3",
            "name": "Воющая Банши",
            "role": "mob",
            "hp": 350,
            "atk": 78,
            "def": 14
          },
          {
            "id": "e_soul_eater",
            "name": "Пожиратель Сущностей",
            "role": "elite",
            "hp": 600,
            "atk": 110,
            "def": 35
          }
        ]
      },
      {
        "name": "Орда (Этаж 4)",
        "kind": "swarm",
        "enemies": [
          {
            "id": "m_sl_1",
            "name": "Блуждающий Призрак",
            "role": "mob",
            "hp": 380,
            "atk": 72,
            "def": 18
          },
          {
            "id": "m_sl_2",
            "name": "Расколотая Тень",
            "role": "mob",
            "hp": 320,
            "atk": 85,
            "def": 10
          },
          {
            "id": "m_sl_3",
            "name": "Воющая Банши",
            "role": "mob",
            "hp": 350,
            "atk": 78,
            "def": 14
          },
          {
            "id": "e_soul_eater",
            "name": "Пожиратель Сущностей",
            "role": "elite",
            "hp": 600,
            "atk": 110,
            "def": 35
          }
        ]
      },
      {
        "name": "Ярус 5: Лабиринт Хаоса",
        "kind": "pack",
        "enemies": [
          {
            "id": "m_sl_1",
            "name": "Блуждающий Призрак",
            "role": "mob",
            "hp": 380,
            "atk": 72,
            "def": 18
          },
          {
            "id": "m_sl_2",
            "name": "Расколотая Тень",
            "role": "mob",
            "hp": 320,
            "atk": 85,
            "def": 10
          },
          {
            "id": "m_sl_3",
            "name": "Воющая Банши",
            "role": "mob",
            "hp": 350,
            "atk": 78,
            "def": 14
          },
          {
            "id": "e_soul_eater",
            "name": "Пожиратель Сущностей",
            "role": "elite",
            "hp": 600,
            "atk": 110,
            "def": 35
          }
        ]
      },
      {
        "name": "Ярус 6: Лабиринт Хаоса",
        "kind": "pack",
        "enemies": [
          {
            "id": "m_sl_1",
            "name": "Блуждающий Призрак",
            "role": "mob",
            "hp": 380,
            "atk": 72,
            "def": 18
          },
          {
            "id": "m_sl_2",
            "name": "Расколотая Тень",
            "role": "mob",
            "hp": 320,
            "atk": 85,
            "def": 10
          },
          {
            "id": "m_sl_3",
            "name": "Воющая Банши",
            "role": "mob",
            "hp": 350,
            "atk": 78,
            "def": 14
          },
          {
            "id": "e_soul_eater",
            "name": "Пожиратель Сущностей",
            "role": "elite",
            "hp": 600,
            "atk": 110,
            "def": 35
          }
        ]
      },
      {
        "name": "Ярус 7: Лабиринт Хаоса",
        "kind": "pack",
        "enemies": [
          {
            "id": "m_sl_1",
            "name": "Блуждающий Призрак",
            "role": "mob",
            "hp": 380,
            "atk": 72,
            "def": 18
          },
          {
            "id": "m_sl_2",
            "name": "Расколотая Тень",
            "role": "mob",
            "hp": 320,
            "atk": 85,
            "def": 10
          },
          {
            "id": "m_sl_3",
            "name": "Воющая Банши",
            "role": "mob",
            "hp": 350,
            "atk": 78,
            "def": 14
          },
          {
            "id": "e_soul_eater",
            "name": "Пожиратель Сущностей",
            "role": "elite",
            "hp": 600,
            "atk": 110,
            "def": 35
          }
        ]
      },
      {
        "name": "Орда (Этаж 8)",
        "kind": "swarm",
        "enemies": [
          {
            "id": "m_sl_1",
            "name": "Блуждающий Призрак",
            "role": "mob",
            "hp": 380,
            "atk": 72,
            "def": 18
          },
          {
            "id": "m_sl_2",
            "name": "Расколотая Тень",
            "role": "mob",
            "hp": 320,
            "atk": 85,
            "def": 10
          },
          {
            "id": "m_sl_3",
            "name": "Воющая Банши",
            "role": "mob",
            "hp": 350,
            "atk": 78,
            "def": 14
          },
          {
            "id": "e_soul_eater",
            "name": "Пожиратель Сущностей",
            "role": "elite",
            "hp": 600,
            "atk": 110,
            "def": 35
          }
        ]
      },
      {
        "name": "Ярус 9: Лабиринт Хаоса",
        "kind": "pack",
        "enemies": [
          {
            "id": "m_sl_1",
            "name": "Блуждающий Призрак",
            "role": "mob",
            "hp": 380,
            "atk": 72,
            "def": 18
          },
          {
            "id": "m_sl_2",
            "name": "Расколотая Тень",
            "role": "mob",
            "hp": 320,
            "atk": 85,
            "def": 10
          },
          {
            "id": "m_sl_3",
            "name": "Воющая Банши",
            "role": "mob",
            "hp": 350,
            "atk": 78,
            "def": 14
          },
          {
            "id": "e_soul_eater",
            "name": "Пожиратель Сущностей",
            "role": "elite",
            "hp": 600,
            "atk": 110,
            "def": 35
          }
        ]
      },
      {
        "name": "Ярус 10: Лабиринт Хаоса",
        "kind": "pack",
        "enemies": [
          {
            "id": "m_sl_1",
            "name": "Блуждающий Призрак",
            "role": "mob",
            "hp": 380,
            "atk": 72,
            "def": 18
          },
          {
            "id": "m_sl_2",
            "name": "Расколотая Тень",
            "role": "mob",
            "hp": 320,
            "atk": 85,
            "def": 10
          },
          {
            "id": "m_sl_3",
            "name": "Воющая Банши",
            "role": "mob",
            "hp": 350,
            "atk": 78,
            "def": 14
          },
          {
            "id": "e_soul_eater",
            "name": "Пожиратель Сущностей",
            "role": "elite",
            "hp": 600,
            "atk": 110,
            "def": 35
          }
        ]
      },
      {
        "name": "Ярус 11: Лабиринт Хаоса",
        "kind": "pack",
        "enemies": [
          {
            "id": "m_sl_1",
            "name": "Блуждающий Призрак",
            "role": "mob",
            "hp": 380,
            "atk": 72,
            "def": 18
          },
          {
            "id": "m_sl_2",
            "name": "Расколотая Тень",
            "role": "mob",
            "hp": 320,
            "atk": 85,
            "def": 10
          },
          {
            "id": "m_sl_3",
            "name": "Воющая Банши",
            "role": "mob",
            "hp": 350,
            "atk": 78,
            "def": 14
          },
          {
            "id": "e_soul_eater",
            "name": "Пожиратель Сущностей",
            "role": "elite",
            "hp": 600,
            "atk": 110,
            "def": 35
          }
        ]
      },
      {
        "name": "Орда (Этаж 12)",
        "kind": "swarm",
        "enemies": [
          {
            "id": "m_sl_1",
            "name": "Блуждающий Призрак",
            "role": "mob",
            "hp": 380,
            "atk": 72,
            "def": 18
          },
          {
            "id": "m_sl_2",
            "name": "Расколотая Тень",
            "role": "mob",
            "hp": 320,
            "atk": 85,
            "def": 10
          },
          {
            "id": "m_sl_3",
            "name": "Воющая Банши",
            "role": "mob",
            "hp": 350,
            "atk": 78,
            "def": 14
          },
          {
            "id": "e_soul_eater",
            "name": "Пожиратель Сущностей",
            "role": "elite",
            "hp": 600,
            "atk": 110,
            "def": 35
          }
        ]
      },
      {
        "name": "Ярус 13: Лабиринт Хаоса",
        "kind": "pack",
        "enemies": [
          {
            "id": "m_sl_1",
            "name": "Блуждающий Призрак",
            "role": "mob",
            "hp": 380,
            "atk": 72,
            "def": 18
          },
          {
            "id": "m_sl_2",
            "name": "Расколотая Тень",
            "role": "mob",
            "hp": 320,
            "atk": 85,
            "def": 10
          },
          {
            "id": "m_sl_3",
            "name": "Воющая Банши",
            "role": "mob",
            "hp": 350,
            "atk": 78,
            "def": 14
          },
          {
            "id": "e_soul_eater",
            "name": "Пожиратель Сущностей",
            "role": "elite",
            "hp": 600,
            "atk": 110,
            "def": 35
          }
        ]
      },
      {
        "name": "Чертог Владыки (Этаж 14)",
        "kind": "boss",
        "enemies": [
          {
            "id": "b_thanatos",
            "name": "Владыка Забвения Танатос",
            "role": "boss",
            "hp": 2800,
            "atk": 180,
            "def": 60
          },
          {
            "id": "m_sl_1_throne",
            "name": "Страж Трона",
            "role": "mob",
            "hp": 380,
            "atk": 72,
            "def": 18
          }
        ]
      }
    ],
    "items": [
      {
        "name": "Эфирная Коса",
        "slot": "weapon"
      },
      {
        "name": "Клинок Потерянных Душ",
        "slot": "weapon"
      },
      {
        "name": "Призрачный Саван",
        "slot": "armor"
      },
      {
        "name": "Капюшон Забвения",
        "slot": "helm"
      },
      {
        "name": "Поступь Призрака",
        "slot": "boots"
      },
      {
        "name": "Наручи Душ",
        "slot": "bracers"
      },
      {
        "name": "Амулет Загробного Эха",
        "slot": "amulet"
      },
      {
        "name": "Кольцо Хаоса Душ",
        "slot": "ring"
      },
      {
        "name": "Реликвия Душ",
        "slot": "relic"
      }
    ]
  },
  {
    "id": "dungeon_chaos_inferno",
    "name": "Пекло Первородного Хаоса",
    "desc": "Бездонные лавовые каверны, где рождается чистый хаос и правят беспощадные владыки огня.",
    "minLvl": 30,
    "cooldownSec": 320,
    "file": "public/shadow-world/js/dungeons/07_chaos_inferno.js",
    "tower": 15,
    "theme": "Инферно Хаоса",
    "stages": [
      {
        "name": "Ярус 1: Инферно Хаоса",
        "kind": "pack",
        "enemies": [
          {
            "id": "m_ci_1",
            "name": "Лавовый Скорпион",
            "role": "mob",
            "hp": 950,
            "atk": 160,
            "def": 45
          },
          {
            "id": "m_ci_2",
            "name": "Пылающий Ифрит",
            "role": "mob",
            "hp": 880,
            "atk": 190,
            "def": 30
          },
          {
            "id": "m_ci_3",
            "name": "Пепельный Демон",
            "role": "mob",
            "hp": 1020,
            "atk": 175,
            "def": 40
          },
          {
            "id": "e_magma_lord",
            "name": "Элитный Магма-Голем",
            "role": "elite",
            "hp": 1800,
            "atk": 240,
            "def": 85
          }
        ]
      },
      {
        "name": "Ярус 2: Инферно Хаоса",
        "kind": "pack",
        "enemies": [
          {
            "id": "m_ci_1",
            "name": "Лавовый Скорпион",
            "role": "mob",
            "hp": 950,
            "atk": 160,
            "def": 45
          },
          {
            "id": "m_ci_2",
            "name": "Пылающий Ифрит",
            "role": "mob",
            "hp": 880,
            "atk": 190,
            "def": 30
          },
          {
            "id": "m_ci_3",
            "name": "Пепельный Демон",
            "role": "mob",
            "hp": 1020,
            "atk": 175,
            "def": 40
          },
          {
            "id": "e_magma_lord",
            "name": "Элитный Магма-Голем",
            "role": "elite",
            "hp": 1800,
            "atk": 240,
            "def": 85
          }
        ]
      },
      {
        "name": "Ярус 3: Инферно Хаоса",
        "kind": "pack",
        "enemies": [
          {
            "id": "m_ci_1",
            "name": "Лавовый Скорпион",
            "role": "mob",
            "hp": 950,
            "atk": 160,
            "def": 45
          },
          {
            "id": "m_ci_2",
            "name": "Пылающий Ифрит",
            "role": "mob",
            "hp": 880,
            "atk": 190,
            "def": 30
          },
          {
            "id": "m_ci_3",
            "name": "Пепельный Демон",
            "role": "mob",
            "hp": 1020,
            "atk": 175,
            "def": 40
          },
          {
            "id": "e_magma_lord",
            "name": "Элитный Магма-Голем",
            "role": "elite",
            "hp": 1800,
            "atk": 240,
            "def": 85
          }
        ]
      },
      {
        "name": "Орда (Этаж 4)",
        "kind": "swarm",
        "enemies": [
          {
            "id": "m_ci_1",
            "name": "Лавовый Скорпион",
            "role": "mob",
            "hp": 950,
            "atk": 160,
            "def": 45
          },
          {
            "id": "m_ci_2",
            "name": "Пылающий Ифрит",
            "role": "mob",
            "hp": 880,
            "atk": 190,
            "def": 30
          },
          {
            "id": "m_ci_3",
            "name": "Пепельный Демон",
            "role": "mob",
            "hp": 1020,
            "atk": 175,
            "def": 40
          },
          {
            "id": "e_magma_lord",
            "name": "Элитный Магма-Голем",
            "role": "elite",
            "hp": 1800,
            "atk": 240,
            "def": 85
          }
        ]
      },
      {
        "name": "Ярус 5: Инферно Хаоса",
        "kind": "pack",
        "enemies": [
          {
            "id": "m_ci_1",
            "name": "Лавовый Скорпион",
            "role": "mob",
            "hp": 950,
            "atk": 160,
            "def": 45
          },
          {
            "id": "m_ci_2",
            "name": "Пылающий Ифрит",
            "role": "mob",
            "hp": 880,
            "atk": 190,
            "def": 30
          },
          {
            "id": "m_ci_3",
            "name": "Пепельный Демон",
            "role": "mob",
            "hp": 1020,
            "atk": 175,
            "def": 40
          },
          {
            "id": "e_magma_lord",
            "name": "Элитный Магма-Голем",
            "role": "elite",
            "hp": 1800,
            "atk": 240,
            "def": 85
          }
        ]
      },
      {
        "name": "Ярус 6: Инферно Хаоса",
        "kind": "pack",
        "enemies": [
          {
            "id": "m_ci_1",
            "name": "Лавовый Скорпион",
            "role": "mob",
            "hp": 950,
            "atk": 160,
            "def": 45
          },
          {
            "id": "m_ci_2",
            "name": "Пылающий Ифрит",
            "role": "mob",
            "hp": 880,
            "atk": 190,
            "def": 30
          },
          {
            "id": "m_ci_3",
            "name": "Пепельный Демон",
            "role": "mob",
            "hp": 1020,
            "atk": 175,
            "def": 40
          },
          {
            "id": "e_magma_lord",
            "name": "Элитный Магма-Голем",
            "role": "elite",
            "hp": 1800,
            "atk": 240,
            "def": 85
          }
        ]
      },
      {
        "name": "Ярус 7: Инферно Хаоса",
        "kind": "pack",
        "enemies": [
          {
            "id": "m_ci_1",
            "name": "Лавовый Скорпион",
            "role": "mob",
            "hp": 950,
            "atk": 160,
            "def": 45
          },
          {
            "id": "m_ci_2",
            "name": "Пылающий Ифрит",
            "role": "mob",
            "hp": 880,
            "atk": 190,
            "def": 30
          },
          {
            "id": "m_ci_3",
            "name": "Пепельный Демон",
            "role": "mob",
            "hp": 1020,
            "atk": 175,
            "def": 40
          },
          {
            "id": "e_magma_lord",
            "name": "Элитный Магма-Голем",
            "role": "elite",
            "hp": 1800,
            "atk": 240,
            "def": 85
          }
        ]
      },
      {
        "name": "Орда (Этаж 8)",
        "kind": "swarm",
        "enemies": [
          {
            "id": "m_ci_1",
            "name": "Лавовый Скорпион",
            "role": "mob",
            "hp": 950,
            "atk": 160,
            "def": 45
          },
          {
            "id": "m_ci_2",
            "name": "Пылающий Ифрит",
            "role": "mob",
            "hp": 880,
            "atk": 190,
            "def": 30
          },
          {
            "id": "m_ci_3",
            "name": "Пепельный Демон",
            "role": "mob",
            "hp": 1020,
            "atk": 175,
            "def": 40
          },
          {
            "id": "e_magma_lord",
            "name": "Элитный Магма-Голем",
            "role": "elite",
            "hp": 1800,
            "atk": 240,
            "def": 85
          }
        ]
      },
      {
        "name": "Ярус 9: Инферно Хаоса",
        "kind": "pack",
        "enemies": [
          {
            "id": "m_ci_1",
            "name": "Лавовый Скорпион",
            "role": "mob",
            "hp": 950,
            "atk": 160,
            "def": 45
          },
          {
            "id": "m_ci_2",
            "name": "Пылающий Ифрит",
            "role": "mob",
            "hp": 880,
            "atk": 190,
            "def": 30
          },
          {
            "id": "m_ci_3",
            "name": "Пепельный Демон",
            "role": "mob",
            "hp": 1020,
            "atk": 175,
            "def": 40
          },
          {
            "id": "e_magma_lord",
            "name": "Элитный Магма-Голем",
            "role": "elite",
            "hp": 1800,
            "atk": 240,
            "def": 85
          }
        ]
      },
      {
        "name": "Ярус 10: Инферно Хаоса",
        "kind": "pack",
        "enemies": [
          {
            "id": "m_ci_1",
            "name": "Лавовый Скорпион",
            "role": "mob",
            "hp": 950,
            "atk": 160,
            "def": 45
          },
          {
            "id": "m_ci_2",
            "name": "Пылающий Ифрит",
            "role": "mob",
            "hp": 880,
            "atk": 190,
            "def": 30
          },
          {
            "id": "m_ci_3",
            "name": "Пепельный Демон",
            "role": "mob",
            "hp": 1020,
            "atk": 175,
            "def": 40
          },
          {
            "id": "e_magma_lord",
            "name": "Элитный Магма-Голем",
            "role": "elite",
            "hp": 1800,
            "atk": 240,
            "def": 85
          }
        ]
      },
      {
        "name": "Ярус 11: Инферно Хаоса",
        "kind": "pack",
        "enemies": [
          {
            "id": "m_ci_1",
            "name": "Лавовый Скорпион",
            "role": "mob",
            "hp": 950,
            "atk": 160,
            "def": 45
          },
          {
            "id": "m_ci_2",
            "name": "Пылающий Ифрит",
            "role": "mob",
            "hp": 880,
            "atk": 190,
            "def": 30
          },
          {
            "id": "m_ci_3",
            "name": "Пепельный Демон",
            "role": "mob",
            "hp": 1020,
            "atk": 175,
            "def": 40
          },
          {
            "id": "e_magma_lord",
            "name": "Элитный Магма-Голем",
            "role": "elite",
            "hp": 1800,
            "atk": 240,
            "def": 85
          }
        ]
      },
      {
        "name": "Орда (Этаж 12)",
        "kind": "swarm",
        "enemies": [
          {
            "id": "m_ci_1",
            "name": "Лавовый Скорпион",
            "role": "mob",
            "hp": 950,
            "atk": 160,
            "def": 45
          },
          {
            "id": "m_ci_2",
            "name": "Пылающий Ифрит",
            "role": "mob",
            "hp": 880,
            "atk": 190,
            "def": 30
          },
          {
            "id": "m_ci_3",
            "name": "Пепельный Демон",
            "role": "mob",
            "hp": 1020,
            "atk": 175,
            "def": 40
          },
          {
            "id": "e_magma_lord",
            "name": "Элитный Магма-Голем",
            "role": "elite",
            "hp": 1800,
            "atk": 240,
            "def": 85
          }
        ]
      },
      {
        "name": "Ярус 13: Инферно Хаоса",
        "kind": "pack",
        "enemies": [
          {
            "id": "m_ci_1",
            "name": "Лавовый Скорпион",
            "role": "mob",
            "hp": 950,
            "atk": 160,
            "def": 45
          },
          {
            "id": "m_ci_2",
            "name": "Пылающий Ифрит",
            "role": "mob",
            "hp": 880,
            "atk": 190,
            "def": 30
          },
          {
            "id": "m_ci_3",
            "name": "Пепельный Демон",
            "role": "mob",
            "hp": 1020,
            "atk": 175,
            "def": 40
          },
          {
            "id": "e_magma_lord",
            "name": "Элитный Магма-Голем",
            "role": "elite",
            "hp": 1800,
            "atk": 240,
            "def": 85
          }
        ]
      },
      {
        "name": "Ярус 14: Инферно Хаоса",
        "kind": "pack",
        "enemies": [
          {
            "id": "m_ci_1",
            "name": "Лавовый Скорпион",
            "role": "mob",
            "hp": 950,
            "atk": 160,
            "def": 45
          },
          {
            "id": "m_ci_2",
            "name": "Пылающий Ифрит",
            "role": "mob",
            "hp": 880,
            "atk": 190,
            "def": 30
          },
          {
            "id": "m_ci_3",
            "name": "Пепельный Демон",
            "role": "mob",
            "hp": 1020,
            "atk": 175,
            "def": 40
          },
          {
            "id": "e_magma_lord",
            "name": "Элитный Магма-Голем",
            "role": "elite",
            "hp": 1800,
            "atk": 240,
            "def": 85
          }
        ]
      },
      {
        "name": "Чертог Владыки (Этаж 15)",
        "kind": "boss",
        "enemies": [
          {
            "id": "b_surtur",
            "name": "Владыка Хаоса Суртур",
            "role": "boss",
            "hp": 6500,
            "atk": 420,
            "def": 135
          },
          {
            "id": "m_ci_1_throne",
            "name": "Страж Трона",
            "role": "mob",
            "hp": 950,
            "atk": 160,
            "def": 45
          }
        ]
      }
    ],
    "items": [
      {
        "name": "Меч Пламени",
        "slot": "weapon"
      },
      {
        "name": "Топор Огненного Катаклизма",
        "slot": "weapon"
      },
      {
        "name": "Латы Первородного Огня",
        "slot": "armor"
      },
      {
        "name": "Шлем Пожирателя Миров",
        "slot": "helm"
      },
      {
        "name": "Сапоги Магмового Шага",
        "slot": "boots"
      },
      {
        "name": "Наручи Инферно",
        "slot": "bracers"
      },
      {
        "name": "Амулет Инферно",
        "slot": "amulet"
      },
      {
        "name": "Кольцо Живого Пламени",
        "slot": "ring"
      },
      {
        "name": "Реликвия Пекла",
        "slot": "relic"
      }
    ]
  },
  {
    "id": "dungeon_abyss",
    "name": "Затонувший Храм Бездны",
    "desc": "Древнее подводное святилище, скрывающее безумное давление глубин и ужасы первородного океана.",
    "minLvl": 40,
    "cooldownSec": 330,
    "file": "public/shadow-world/js/dungeons/08_abyss_temple.js",
    "tower": 0,
    "theme": "",
    "stages": [
      {
        "name": "Коралловые Рифы",
        "kind": "pack",
        "enemies": [
          {
            "id": "m_abyss_1",
            "name": "Глубинный Змей",
            "role": "mob",
            "hp": 1400,
            "atk": 240,
            "def": 70
          },
          {
            "id": "m_abyss_2",
            "name": "Океанический Страж",
            "role": "mob",
            "hp": 1600,
            "atk": 220,
            "def": 95
          }
        ]
      },
      {
        "name": "Затопленные Залы",
        "kind": "elite",
        "enemies": [
          {
            "id": "m_abyss_3",
            "name": "Сирена Бездны",
            "role": "mob",
            "hp": 1300,
            "atk": 290,
            "def": 55
          },
          {
            "id": "e_abyss_guardian",
            "name": "Бездонный Страж",
            "role": "elite",
            "hp": 2600,
            "atk": 350,
            "def": 130
          }
        ]
      },
      {
        "name": "Святилище Левиафана",
        "kind": "boss",
        "enemies": [
          {
            "id": "b_kraken",
            "name": "Кракеноподобный Левиафан",
            "role": "boss",
            "hp": 11000,
            "atk": 620,
            "def": 210
          }
        ]
      }
    ],
    "items": [
      {
        "name": "Трезубец Бездны",
        "slot": "weapon"
      },
      {
        "name": "Клинок Давления",
        "slot": "weapon"
      },
      {
        "name": "Панцирь Океанического Титана",
        "slot": "armor"
      },
      {
        "name": "Шлем Коралловой Короны",
        "slot": "helm"
      },
      {
        "name": "Плавники Глубинного Странника",
        "slot": "boots"
      },
      {
        "name": "Наручи Давления",
        "slot": "bracers"
      },
      {
        "name": "Амулет Затерянной Атлантиды",
        "slot": "amulet"
      },
      {
        "name": "Кольцо Глубин",
        "slot": "ring"
      },
      {
        "name": "Реликвия Первородного Океана",
        "slot": "relic"
      }
    ]
  },
  {
    "id": "dungeon_5",
    "name": "Разрыв Антиматрицы",
    "desc": "Катастрофический цифровой сбой в ядре вселенной, где бесповоротно стираются законы физики и исходный код реальности.",
    "minLvl": 50,
    "cooldownSec": 360,
    "file": "public/shadow-world/js/dungeons/09_antimatrix.js",
    "tower": 0,
    "theme": "",
    "stages": [
      {
        "name": "Поврежденный Сектор",
        "kind": "pack",
        "enemies": [
          {
            "id": "m_gl_1",
            "name": "Цифровой Фантом",
            "role": "mob",
            "hp": 2200,
            "atk": 380,
            "def": 110
          },
          {
            "id": "m_gl_2",
            "name": "Блуждающий Баг",
            "role": "mob",
            "hp": 2500,
            "atk": 420,
            "def": 90
          }
        ]
      },
      {
        "name": "Перегруженный Узел",
        "kind": "elite",
        "enemies": [
          {
            "id": "m_gl_3",
            "name": "Перегруженный Брандмауэр",
            "role": "mob",
            "hp": 3100,
            "atk": 350,
            "def": 180
          },
          {
            "id": "e_corrupt_core",
            "name": "Коррумпированное Ядро",
            "role": "elite",
            "hp": 5200,
            "atk": 650,
            "def": 240
          }
        ]
      },
      {
        "name": "Фрактальный Трон",
        "kind": "boss",
        "enemies": [
          {
            "id": "b_matrix",
            "name": "Творец Искажения",
            "role": "boss",
            "hp": 28000,
            "atk": 1650,
            "def": 480
          }
        ]
      }
    ],
    "items": [
      {
        "name": "Кинжал Нулевого Дня",
        "slot": "weapon"
      },
      {
        "name": "Клинок Квантовой Ошибки",
        "slot": "weapon"
      },
      {
        "name": "Кираса Системного Сбоя",
        "slot": "armor"
      },
      {
        "name": "Шлем Цифровой Сингулярности",
        "slot": "helm"
      },
      {
        "name": "Поступь Глюка",
        "slot": "boots"
      },
      {
        "name": "Наручи Антиматрицы",
        "slot": "bracers"
      },
      {
        "name": "Амулет Фрактального Кода",
        "slot": "amulet"
      },
      {
        "name": "Кольцо Бесконечного Цикла",
        "slot": "ring"
      },
      {
        "name": "Реликвия Сбоя",
        "slot": "relic"
      }
    ]
  },
  {
    "id": "dungeon_void_rift",
    "name": "Разлом Вечной Тьмы",
    "desc": "Безграничный разлом антиматерии и абсолютной тьмы, где стираются даже воспоминания о существовании.",
    "minLvl": 60,
    "cooldownSec": 350,
    "file": "public/shadow-world/js/dungeons/10_void_rift.js",
    "tower": 10,
    "theme": "Тьма",
    "stages": [
      {
        "name": "Ярус 1: Тьма",
        "kind": "pack",
        "enemies": [
          {
            "id": "m_vr_1",
            "name": "Абсолютный Фантом",
            "role": "mob",
            "hp": 5500,
            "atk": 850,
            "def": 240
          },
          {
            "id": "m_vr_2",
            "name": "Пожиратель Миров",
            "role": "mob",
            "hp": 6200,
            "atk": 920,
            "def": 210
          },
          {
            "id": "m_vr_3",
            "name": "Тень Сингулярности",
            "role": "mob",
            "hp": 5800,
            "atk": 990,
            "def": 190
          },
          {
            "id": "e_void_guardian",
            "name": "Страж Нулевой Точки",
            "role": "elite",
            "hp": 11000,
            "atk": 1300,
            "def": 380
          }
        ]
      },
      {
        "name": "Ярус 2: Тьма",
        "kind": "pack",
        "enemies": [
          {
            "id": "m_vr_1",
            "name": "Абсолютный Фантом",
            "role": "mob",
            "hp": 5500,
            "atk": 850,
            "def": 240
          },
          {
            "id": "m_vr_2",
            "name": "Пожиратель Миров",
            "role": "mob",
            "hp": 6200,
            "atk": 920,
            "def": 210
          },
          {
            "id": "m_vr_3",
            "name": "Тень Сингулярности",
            "role": "mob",
            "hp": 5800,
            "atk": 990,
            "def": 190
          },
          {
            "id": "e_void_guardian",
            "name": "Страж Нулевой Точки",
            "role": "elite",
            "hp": 11000,
            "atk": 1300,
            "def": 380
          }
        ]
      },
      {
        "name": "Ярус 3: Тьма",
        "kind": "pack",
        "enemies": [
          {
            "id": "m_vr_1",
            "name": "Абсолютный Фантом",
            "role": "mob",
            "hp": 5500,
            "atk": 850,
            "def": 240
          },
          {
            "id": "m_vr_2",
            "name": "Пожиратель Миров",
            "role": "mob",
            "hp": 6200,
            "atk": 920,
            "def": 210
          },
          {
            "id": "m_vr_3",
            "name": "Тень Сингулярности",
            "role": "mob",
            "hp": 5800,
            "atk": 990,
            "def": 190
          },
          {
            "id": "e_void_guardian",
            "name": "Страж Нулевой Точки",
            "role": "elite",
            "hp": 11000,
            "atk": 1300,
            "def": 380
          }
        ]
      },
      {
        "name": "Орда (Этаж 4)",
        "kind": "swarm",
        "enemies": [
          {
            "id": "m_vr_1",
            "name": "Абсолютный Фантом",
            "role": "mob",
            "hp": 5500,
            "atk": 850,
            "def": 240
          },
          {
            "id": "m_vr_2",
            "name": "Пожиратель Миров",
            "role": "mob",
            "hp": 6200,
            "atk": 920,
            "def": 210
          },
          {
            "id": "m_vr_3",
            "name": "Тень Сингулярности",
            "role": "mob",
            "hp": 5800,
            "atk": 990,
            "def": 190
          },
          {
            "id": "e_void_guardian",
            "name": "Страж Нулевой Точки",
            "role": "elite",
            "hp": 11000,
            "atk": 1300,
            "def": 380
          }
        ]
      },
      {
        "name": "Ярус 5: Тьма",
        "kind": "pack",
        "enemies": [
          {
            "id": "m_vr_1",
            "name": "Абсолютный Фантом",
            "role": "mob",
            "hp": 5500,
            "atk": 850,
            "def": 240
          },
          {
            "id": "m_vr_2",
            "name": "Пожиратель Миров",
            "role": "mob",
            "hp": 6200,
            "atk": 920,
            "def": 210
          },
          {
            "id": "m_vr_3",
            "name": "Тень Сингулярности",
            "role": "mob",
            "hp": 5800,
            "atk": 990,
            "def": 190
          },
          {
            "id": "e_void_guardian",
            "name": "Страж Нулевой Точки",
            "role": "elite",
            "hp": 11000,
            "atk": 1300,
            "def": 380
          }
        ]
      },
      {
        "name": "Ярус 6: Тьма",
        "kind": "pack",
        "enemies": [
          {
            "id": "m_vr_1",
            "name": "Абсолютный Фантом",
            "role": "mob",
            "hp": 5500,
            "atk": 850,
            "def": 240
          },
          {
            "id": "m_vr_2",
            "name": "Пожиратель Миров",
            "role": "mob",
            "hp": 6200,
            "atk": 920,
            "def": 210
          },
          {
            "id": "m_vr_3",
            "name": "Тень Сингулярности",
            "role": "mob",
            "hp": 5800,
            "atk": 990,
            "def": 190
          },
          {
            "id": "e_void_guardian",
            "name": "Страж Нулевой Точки",
            "role": "elite",
            "hp": 11000,
            "atk": 1300,
            "def": 380
          }
        ]
      },
      {
        "name": "Ярус 7: Тьма",
        "kind": "pack",
        "enemies": [
          {
            "id": "m_vr_1",
            "name": "Абсолютный Фантом",
            "role": "mob",
            "hp": 5500,
            "atk": 850,
            "def": 240
          },
          {
            "id": "m_vr_2",
            "name": "Пожиратель Миров",
            "role": "mob",
            "hp": 6200,
            "atk": 920,
            "def": 210
          },
          {
            "id": "m_vr_3",
            "name": "Тень Сингулярности",
            "role": "mob",
            "hp": 5800,
            "atk": 990,
            "def": 190
          },
          {
            "id": "e_void_guardian",
            "name": "Страж Нулевой Точки",
            "role": "elite",
            "hp": 11000,
            "atk": 1300,
            "def": 380
          }
        ]
      },
      {
        "name": "Орда (Этаж 8)",
        "kind": "swarm",
        "enemies": [
          {
            "id": "m_vr_1",
            "name": "Абсолютный Фантом",
            "role": "mob",
            "hp": 5500,
            "atk": 850,
            "def": 240
          },
          {
            "id": "m_vr_2",
            "name": "Пожиратель Миров",
            "role": "mob",
            "hp": 6200,
            "atk": 920,
            "def": 210
          },
          {
            "id": "m_vr_3",
            "name": "Тень Сингулярности",
            "role": "mob",
            "hp": 5800,
            "atk": 990,
            "def": 190
          },
          {
            "id": "e_void_guardian",
            "name": "Страж Нулевой Точки",
            "role": "elite",
            "hp": 11000,
            "atk": 1300,
            "def": 380
          }
        ]
      },
      {
        "name": "Ярус 9: Тьма",
        "kind": "pack",
        "enemies": [
          {
            "id": "m_vr_1",
            "name": "Абсолютный Фантом",
            "role": "mob",
            "hp": 5500,
            "atk": 850,
            "def": 240
          },
          {
            "id": "m_vr_2",
            "name": "Пожиратель Миров",
            "role": "mob",
            "hp": 6200,
            "atk": 920,
            "def": 210
          },
          {
            "id": "m_vr_3",
            "name": "Тень Сингулярности",
            "role": "mob",
            "hp": 5800,
            "atk": 990,
            "def": 190
          },
          {
            "id": "e_void_guardian",
            "name": "Страж Нулевой Точки",
            "role": "elite",
            "hp": 11000,
            "atk": 1300,
            "def": 380
          }
        ]
      },
      {
        "name": "Чертог Владыки (Этаж 10)",
        "kind": "boss",
        "enemies": [
          {
            "id": "b_void_walker",
            "name": "Ходок Бездны Азатот",
            "role": "boss",
            "hp": 35000,
            "atk": 2200,
            "def": 600
          },
          {
            "id": "m_vr_1_throne",
            "name": "Страж Трона",
            "role": "mob",
            "hp": 5500,
            "atk": 850,
            "def": 240
          }
        ]
      }
    ],
    "items": [
      {
        "name": "Серп Антиматерии",
        "slot": "weapon"
      },
      {
        "name": "Клинок Поглощения",
        "slot": "weapon"
      },
      {
        "name": "Кираса Абсолютной Тьмы",
        "slot": "armor"
      },
      {
        "name": "Шлем Вечного Мрака",
        "slot": "helm"
      },
      {
        "name": "Поступь Пустоты",
        "slot": "boots"
      },
      {
        "name": "Наручи Сингулярности",
        "slot": "bracers"
      },
      {
        "name": "Амулет Забытых Эпох",
        "slot": "amulet"
      },
      {
        "name": "Кольцо Нулевой Точки",
        "slot": "ring"
      },
      {
        "name": "Плащ Тьмы",
        "slot": "cloak"
      },
      {
        "name": "Реликвия Бездны",
        "slot": "relic"
      }
    ]
  },
  {
    "id": "dungeon_blood_citadel",
    "name": "Кровавая Цитадель Кармиллы",
    "desc": "Величественный и зловещий замок древних вампирских лордов, где каждый камень пропитан багровой исцеляющей кровью.",
    "minLvl": 75,
    "cooldownSec": 380,
    "file": "public/shadow-world/js/dungeons/11_blood_citadel.js",
    "tower": 12,
    "theme": "Кровь",
    "stages": [
      {
        "name": "Ярус 1: Кровь",
        "kind": "pack",
        "enemies": [
          {
            "id": "m_bc_1",
            "name": "Кровавый Рыцарь",
            "role": "mob",
            "hp": 8000,
            "atk": 1200,
            "def": 320
          },
          {
            "id": "m_bc_2",
            "name": "Кровавая Банши",
            "role": "mob",
            "hp": 7500,
            "atk": 1350,
            "def": 280
          },
          {
            "id": "m_bc_3",
            "name": "Ночной Хищник-Вампир",
            "role": "mob",
            "hp": 7200,
            "atk": 1450,
            "def": 250
          },
          {
            "id": "e_blood_priest",
            "name": "Элитный Жрец Крови",
            "role": "elite",
            "hp": 15000,
            "atk": 1850,
            "def": 480
          }
        ]
      },
      {
        "name": "Ярус 2: Кровь",
        "kind": "pack",
        "enemies": [
          {
            "id": "m_bc_1",
            "name": "Кровавый Рыцарь",
            "role": "mob",
            "hp": 8000,
            "atk": 1200,
            "def": 320
          },
          {
            "id": "m_bc_2",
            "name": "Кровавая Банши",
            "role": "mob",
            "hp": 7500,
            "atk": 1350,
            "def": 280
          },
          {
            "id": "m_bc_3",
            "name": "Ночной Хищник-Вампир",
            "role": "mob",
            "hp": 7200,
            "atk": 1450,
            "def": 250
          },
          {
            "id": "e_blood_priest",
            "name": "Элитный Жрец Крови",
            "role": "elite",
            "hp": 15000,
            "atk": 1850,
            "def": 480
          }
        ]
      },
      {
        "name": "Ярус 3: Кровь",
        "kind": "pack",
        "enemies": [
          {
            "id": "m_bc_1",
            "name": "Кровавый Рыцарь",
            "role": "mob",
            "hp": 8000,
            "atk": 1200,
            "def": 320
          },
          {
            "id": "m_bc_2",
            "name": "Кровавая Банши",
            "role": "mob",
            "hp": 7500,
            "atk": 1350,
            "def": 280
          },
          {
            "id": "m_bc_3",
            "name": "Ночной Хищник-Вампир",
            "role": "mob",
            "hp": 7200,
            "atk": 1450,
            "def": 250
          },
          {
            "id": "e_blood_priest",
            "name": "Элитный Жрец Крови",
            "role": "elite",
            "hp": 15000,
            "atk": 1850,
            "def": 480
          }
        ]
      },
      {
        "name": "Орда (Этаж 4)",
        "kind": "swarm",
        "enemies": [
          {
            "id": "m_bc_1",
            "name": "Кровавый Рыцарь",
            "role": "mob",
            "hp": 8000,
            "atk": 1200,
            "def": 320
          },
          {
            "id": "m_bc_2",
            "name": "Кровавая Банши",
            "role": "mob",
            "hp": 7500,
            "atk": 1350,
            "def": 280
          },
          {
            "id": "m_bc_3",
            "name": "Ночной Хищник-Вампир",
            "role": "mob",
            "hp": 7200,
            "atk": 1450,
            "def": 250
          },
          {
            "id": "e_blood_priest",
            "name": "Элитный Жрец Крови",
            "role": "elite",
            "hp": 15000,
            "atk": 1850,
            "def": 480
          }
        ]
      },
      {
        "name": "Ярус 5: Кровь",
        "kind": "pack",
        "enemies": [
          {
            "id": "m_bc_1",
            "name": "Кровавый Рыцарь",
            "role": "mob",
            "hp": 8000,
            "atk": 1200,
            "def": 320
          },
          {
            "id": "m_bc_2",
            "name": "Кровавая Банши",
            "role": "mob",
            "hp": 7500,
            "atk": 1350,
            "def": 280
          },
          {
            "id": "m_bc_3",
            "name": "Ночной Хищник-Вампир",
            "role": "mob",
            "hp": 7200,
            "atk": 1450,
            "def": 250
          },
          {
            "id": "e_blood_priest",
            "name": "Элитный Жрец Крови",
            "role": "elite",
            "hp": 15000,
            "atk": 1850,
            "def": 480
          }
        ]
      },
      {
        "name": "Ярус 6: Кровь",
        "kind": "pack",
        "enemies": [
          {
            "id": "m_bc_1",
            "name": "Кровавый Рыцарь",
            "role": "mob",
            "hp": 8000,
            "atk": 1200,
            "def": 320
          },
          {
            "id": "m_bc_2",
            "name": "Кровавая Банши",
            "role": "mob",
            "hp": 7500,
            "atk": 1350,
            "def": 280
          },
          {
            "id": "m_bc_3",
            "name": "Ночной Хищник-Вампир",
            "role": "mob",
            "hp": 7200,
            "atk": 1450,
            "def": 250
          },
          {
            "id": "e_blood_priest",
            "name": "Элитный Жрец Крови",
            "role": "elite",
            "hp": 15000,
            "atk": 1850,
            "def": 480
          }
        ]
      },
      {
        "name": "Ярус 7: Кровь",
        "kind": "pack",
        "enemies": [
          {
            "id": "m_bc_1",
            "name": "Кровавый Рыцарь",
            "role": "mob",
            "hp": 8000,
            "atk": 1200,
            "def": 320
          },
          {
            "id": "m_bc_2",
            "name": "Кровавая Банши",
            "role": "mob",
            "hp": 7500,
            "atk": 1350,
            "def": 280
          },
          {
            "id": "m_bc_3",
            "name": "Ночной Хищник-Вампир",
            "role": "mob",
            "hp": 7200,
            "atk": 1450,
            "def": 250
          },
          {
            "id": "e_blood_priest",
            "name": "Элитный Жрец Крови",
            "role": "elite",
            "hp": 15000,
            "atk": 1850,
            "def": 480
          }
        ]
      },
      {
        "name": "Орда (Этаж 8)",
        "kind": "swarm",
        "enemies": [
          {
            "id": "m_bc_1",
            "name": "Кровавый Рыцарь",
            "role": "mob",
            "hp": 8000,
            "atk": 1200,
            "def": 320
          },
          {
            "id": "m_bc_2",
            "name": "Кровавая Банши",
            "role": "mob",
            "hp": 7500,
            "atk": 1350,
            "def": 280
          },
          {
            "id": "m_bc_3",
            "name": "Ночной Хищник-Вампир",
            "role": "mob",
            "hp": 7200,
            "atk": 1450,
            "def": 250
          },
          {
            "id": "e_blood_priest",
            "name": "Элитный Жрец Крови",
            "role": "elite",
            "hp": 15000,
            "atk": 1850,
            "def": 480
          }
        ]
      },
      {
        "name": "Ярус 9: Кровь",
        "kind": "pack",
        "enemies": [
          {
            "id": "m_bc_1",
            "name": "Кровавый Рыцарь",
            "role": "mob",
            "hp": 8000,
            "atk": 1200,
            "def": 320
          },
          {
            "id": "m_bc_2",
            "name": "Кровавая Банши",
            "role": "mob",
            "hp": 7500,
            "atk": 1350,
            "def": 280
          },
          {
            "id": "m_bc_3",
            "name": "Ночной Хищник-Вампир",
            "role": "mob",
            "hp": 7200,
            "atk": 1450,
            "def": 250
          },
          {
            "id": "e_blood_priest",
            "name": "Элитный Жрец Крови",
            "role": "elite",
            "hp": 15000,
            "atk": 1850,
            "def": 480
          }
        ]
      },
      {
        "name": "Ярус 10: Кровь",
        "kind": "pack",
        "enemies": [
          {
            "id": "m_bc_1",
            "name": "Кровавый Рыцарь",
            "role": "mob",
            "hp": 8000,
            "atk": 1200,
            "def": 320
          },
          {
            "id": "m_bc_2",
            "name": "Кровавая Банши",
            "role": "mob",
            "hp": 7500,
            "atk": 1350,
            "def": 280
          },
          {
            "id": "m_bc_3",
            "name": "Ночной Хищник-Вампир",
            "role": "mob",
            "hp": 7200,
            "atk": 1450,
            "def": 250
          },
          {
            "id": "e_blood_priest",
            "name": "Элитный Жрец Крови",
            "role": "elite",
            "hp": 15000,
            "atk": 1850,
            "def": 480
          }
        ]
      },
      {
        "name": "Ярус 11: Кровь",
        "kind": "pack",
        "enemies": [
          {
            "id": "m_bc_1",
            "name": "Кровавый Рыцарь",
            "role": "mob",
            "hp": 8000,
            "atk": 1200,
            "def": 320
          },
          {
            "id": "m_bc_2",
            "name": "Кровавая Банши",
            "role": "mob",
            "hp": 7500,
            "atk": 1350,
            "def": 280
          },
          {
            "id": "m_bc_3",
            "name": "Ночной Хищник-Вампир",
            "role": "mob",
            "hp": 7200,
            "atk": 1450,
            "def": 250
          },
          {
            "id": "e_blood_priest",
            "name": "Элитный Жрец Крови",
            "role": "elite",
            "hp": 15000,
            "atk": 1850,
            "def": 480
          }
        ]
      },
      {
        "name": "Чертог Владыки (Этаж 12)",
        "kind": "boss",
        "enemies": [
          {
            "id": "b_carmilla",
            "name": "Королева Кармилла",
            "role": "boss",
            "hp": 52000,
            "atk": 2900,
            "def": 800
          },
          {
            "id": "m_bc_1_throne",
            "name": "Страж Трона",
            "role": "mob",
            "hp": 8000,
            "atk": 1200,
            "def": 320
          }
        ]
      }
    ],
    "items": [
      {
        "name": "Клинок Багрового Заката",
        "slot": "weapon"
      },
      {
        "name": "Коса Истинного Вампира",
        "slot": "weapon"
      },
      {
        "name": "Латы Кровавого Монарха",
        "slot": "armor"
      },
      {
        "name": "Венец Бессмертия",
        "slot": "helm"
      },
      {
        "name": "Поступь Носферату",
        "slot": "boots"
      },
      {
        "name": "Наручи Багрового Ритуала",
        "slot": "bracers"
      },
      {
        "name": "Амулет Вечной Жизни",
        "slot": "amulet"
      },
      {
        "name": "Кольцо Жажды Крови",
        "slot": "ring"
      },
      {
        "name": "Плащ Кровавой Луны",
        "slot": "cloak"
      },
      {
        "name": "Пояс Крови",
        "slot": "belt"
      },
      {
        "name": "Реликвия Древнего Клана",
        "slot": "relic"
      }
    ]
  },
  {
    "id": "dungeon_spectral_cathedral",
    "name": "Спектральный Собор",
    "desc": "Величественное святилище иллюзий и безумной веры, где реальность искажена священными призраками.",
    "minLvl": 90,
    "cooldownSec": 400,
    "file": "public/shadow-world/js/dungeons/12_spectral_cathedral.js",
    "tower": 12,
    "theme": "Спектр",
    "stages": [
      {
        "name": "Ярус 1: Спектр",
        "kind": "pack",
        "enemies": [
          {
            "id": "m_sc_1",
            "name": "Инквизитор",
            "role": "mob",
            "hp": 12000,
            "atk": 1650,
            "def": 420
          },
          {
            "id": "m_sc_2",
            "name": "Еретический Фантом",
            "role": "mob",
            "hp": 11000,
            "atk": 1800,
            "def": 360
          },
          {
            "id": "m_sc_3",
            "name": "Спектральный Фанатик",
            "role": "mob",
            "hp": 11500,
            "atk": 1750,
            "def": 390
          },
          {
            "id": "e_arch_inquisitor",
            "name": "Элитный Каратель",
            "role": "elite",
            "hp": 22000,
            "atk": 2400,
            "def": 650
          }
        ]
      },
      {
        "name": "Ярус 2: Спектр",
        "kind": "pack",
        "enemies": [
          {
            "id": "m_sc_1",
            "name": "Инквизитор",
            "role": "mob",
            "hp": 12000,
            "atk": 1650,
            "def": 420
          },
          {
            "id": "m_sc_2",
            "name": "Еретический Фантом",
            "role": "mob",
            "hp": 11000,
            "atk": 1800,
            "def": 360
          },
          {
            "id": "m_sc_3",
            "name": "Спектральный Фанатик",
            "role": "mob",
            "hp": 11500,
            "atk": 1750,
            "def": 390
          },
          {
            "id": "e_arch_inquisitor",
            "name": "Элитный Каратель",
            "role": "elite",
            "hp": 22000,
            "atk": 2400,
            "def": 650
          }
        ]
      },
      {
        "name": "Ярус 3: Спектр",
        "kind": "pack",
        "enemies": [
          {
            "id": "m_sc_1",
            "name": "Инквизитор",
            "role": "mob",
            "hp": 12000,
            "atk": 1650,
            "def": 420
          },
          {
            "id": "m_sc_2",
            "name": "Еретический Фантом",
            "role": "mob",
            "hp": 11000,
            "atk": 1800,
            "def": 360
          },
          {
            "id": "m_sc_3",
            "name": "Спектральный Фанатик",
            "role": "mob",
            "hp": 11500,
            "atk": 1750,
            "def": 390
          },
          {
            "id": "e_arch_inquisitor",
            "name": "Элитный Каратель",
            "role": "elite",
            "hp": 22000,
            "atk": 2400,
            "def": 650
          }
        ]
      },
      {
        "name": "Орда (Этаж 4)",
        "kind": "swarm",
        "enemies": [
          {
            "id": "m_sc_1",
            "name": "Инквизитор",
            "role": "mob",
            "hp": 12000,
            "atk": 1650,
            "def": 420
          },
          {
            "id": "m_sc_2",
            "name": "Еретический Фантом",
            "role": "mob",
            "hp": 11000,
            "atk": 1800,
            "def": 360
          },
          {
            "id": "m_sc_3",
            "name": "Спектральный Фанатик",
            "role": "mob",
            "hp": 11500,
            "atk": 1750,
            "def": 390
          },
          {
            "id": "e_arch_inquisitor",
            "name": "Элитный Каратель",
            "role": "elite",
            "hp": 22000,
            "atk": 2400,
            "def": 650
          }
        ]
      },
      {
        "name": "Ярус 5: Спектр",
        "kind": "pack",
        "enemies": [
          {
            "id": "m_sc_1",
            "name": "Инквизитор",
            "role": "mob",
            "hp": 12000,
            "atk": 1650,
            "def": 420
          },
          {
            "id": "m_sc_2",
            "name": "Еретический Фантом",
            "role": "mob",
            "hp": 11000,
            "atk": 1800,
            "def": 360
          },
          {
            "id": "m_sc_3",
            "name": "Спектральный Фанатик",
            "role": "mob",
            "hp": 11500,
            "atk": 1750,
            "def": 390
          },
          {
            "id": "e_arch_inquisitor",
            "name": "Элитный Каратель",
            "role": "elite",
            "hp": 22000,
            "atk": 2400,
            "def": 650
          }
        ]
      },
      {
        "name": "Ярус 6: Спектр",
        "kind": "pack",
        "enemies": [
          {
            "id": "m_sc_1",
            "name": "Инквизитор",
            "role": "mob",
            "hp": 12000,
            "atk": 1650,
            "def": 420
          },
          {
            "id": "m_sc_2",
            "name": "Еретический Фантом",
            "role": "mob",
            "hp": 11000,
            "atk": 1800,
            "def": 360
          },
          {
            "id": "m_sc_3",
            "name": "Спектральный Фанатик",
            "role": "mob",
            "hp": 11500,
            "atk": 1750,
            "def": 390
          },
          {
            "id": "e_arch_inquisitor",
            "name": "Элитный Каратель",
            "role": "elite",
            "hp": 22000,
            "atk": 2400,
            "def": 650
          }
        ]
      },
      {
        "name": "Ярус 7: Спектр",
        "kind": "pack",
        "enemies": [
          {
            "id": "m_sc_1",
            "name": "Инквизитор",
            "role": "mob",
            "hp": 12000,
            "atk": 1650,
            "def": 420
          },
          {
            "id": "m_sc_2",
            "name": "Еретический Фантом",
            "role": "mob",
            "hp": 11000,
            "atk": 1800,
            "def": 360
          },
          {
            "id": "m_sc_3",
            "name": "Спектральный Фанатик",
            "role": "mob",
            "hp": 11500,
            "atk": 1750,
            "def": 390
          },
          {
            "id": "e_arch_inquisitor",
            "name": "Элитный Каратель",
            "role": "elite",
            "hp": 22000,
            "atk": 2400,
            "def": 650
          }
        ]
      },
      {
        "name": "Орда (Этаж 8)",
        "kind": "swarm",
        "enemies": [
          {
            "id": "m_sc_1",
            "name": "Инквизитор",
            "role": "mob",
            "hp": 12000,
            "atk": 1650,
            "def": 420
          },
          {
            "id": "m_sc_2",
            "name": "Еретический Фантом",
            "role": "mob",
            "hp": 11000,
            "atk": 1800,
            "def": 360
          },
          {
            "id": "m_sc_3",
            "name": "Спектральный Фанатик",
            "role": "mob",
            "hp": 11500,
            "atk": 1750,
            "def": 390
          },
          {
            "id": "e_arch_inquisitor",
            "name": "Элитный Каратель",
            "role": "elite",
            "hp": 22000,
            "atk": 2400,
            "def": 650
          }
        ]
      },
      {
        "name": "Ярус 9: Спектр",
        "kind": "pack",
        "enemies": [
          {
            "id": "m_sc_1",
            "name": "Инквизитор",
            "role": "mob",
            "hp": 12000,
            "atk": 1650,
            "def": 420
          },
          {
            "id": "m_sc_2",
            "name": "Еретический Фантом",
            "role": "mob",
            "hp": 11000,
            "atk": 1800,
            "def": 360
          },
          {
            "id": "m_sc_3",
            "name": "Спектральный Фанатик",
            "role": "mob",
            "hp": 11500,
            "atk": 1750,
            "def": 390
          },
          {
            "id": "e_arch_inquisitor",
            "name": "Элитный Каратель",
            "role": "elite",
            "hp": 22000,
            "atk": 2400,
            "def": 650
          }
        ]
      },
      {
        "name": "Ярус 10: Спектр",
        "kind": "pack",
        "enemies": [
          {
            "id": "m_sc_1",
            "name": "Инквизитор",
            "role": "mob",
            "hp": 12000,
            "atk": 1650,
            "def": 420
          },
          {
            "id": "m_sc_2",
            "name": "Еретический Фантом",
            "role": "mob",
            "hp": 11000,
            "atk": 1800,
            "def": 360
          },
          {
            "id": "m_sc_3",
            "name": "Спектральный Фанатик",
            "role": "mob",
            "hp": 11500,
            "atk": 1750,
            "def": 390
          },
          {
            "id": "e_arch_inquisitor",
            "name": "Элитный Каратель",
            "role": "elite",
            "hp": 22000,
            "atk": 2400,
            "def": 650
          }
        ]
      },
      {
        "name": "Ярус 11: Спектр",
        "kind": "pack",
        "enemies": [
          {
            "id": "m_sc_1",
            "name": "Инквизитор",
            "role": "mob",
            "hp": 12000,
            "atk": 1650,
            "def": 420
          },
          {
            "id": "m_sc_2",
            "name": "Еретический Фантом",
            "role": "mob",
            "hp": 11000,
            "atk": 1800,
            "def": 360
          },
          {
            "id": "m_sc_3",
            "name": "Спектральный Фанатик",
            "role": "mob",
            "hp": 11500,
            "atk": 1750,
            "def": 390
          },
          {
            "id": "e_arch_inquisitor",
            "name": "Элитный Каратель",
            "role": "elite",
            "hp": 22000,
            "atk": 2400,
            "def": 650
          }
        ]
      },
      {
        "name": "Чертог Владыки (Этаж 12)",
        "kind": "boss",
        "enemies": [
          {
            "id": "b_specter_pope",
            "name": "Призрачный Понтифик",
            "role": "boss",
            "hp": 75000,
            "atk": 3800,
            "def": 1100
          },
          {
            "id": "m_sc_1_throne",
            "name": "Страж Трона",
            "role": "mob",
            "hp": 12000,
            "atk": 1650,
            "def": 420
          }
        ]
      }
    ],
    "items": [
      {
        "name": "Клинок Святого Откровения",
        "slot": "weapon"
      },
      {
        "name": "Посох Иллюзий",
        "slot": "weapon"
      },
      {
        "name": "Мантия Бога",
        "slot": "armor"
      },
      {
        "name": "Венец Понтифика",
        "slot": "helm"
      },
      {
        "name": "Поступь Святого",
        "slot": "boots"
      },
      {
        "name": "Наручи Спектра",
        "slot": "bracers"
      },
      {
        "name": "Амулет Божественного Эха",
        "slot": "amulet"
      },
      {
        "name": "Кольцо Иллюзорного Света",
        "slot": "ring"
      },
      {
        "name": "Плащ Святых Ликов",
        "slot": "cloak"
      },
      {
        "name": "Пояс Вечной Веры",
        "slot": "belt"
      },
      {
        "name": "Реликвия Спектрального Собора",
        "slot": "relic"
      }
    ]
  },
  {
    "id": "dungeon_titan_cradle",
    "name": "Колыбель Забытых Титанов",
    "desc": "Древнейшая колыбель первородных колоссов, кишащая роями неутомимых каменных тварей под сенью падших богов.",
    "minLvl": 110,
    "cooldownSec": 420,
    "file": "public/shadow-world/js/dungeons/13_titan_cradle.js",
    "tower": 14,
    "theme": "Колыбель Титанов",
    "stages": [
      {
        "name": "Ярус 1: Колыбель Титанов",
        "kind": "pack",
        "enemies": [
          {
            "id": "m_tc_1",
            "name": "Каменный Осколок",
            "role": "mob",
            "hp": 14000,
            "atk": 1800,
            "def": 500
          },
          {
            "id": "m_tc_2",
            "name": "Пылевой Элементаль",
            "role": "mob",
            "hp": 12500,
            "atk": 2050,
            "def": 420
          },
          {
            "id": "m_tc_3",
            "name": "Земляной Ползун",
            "role": "mob",
            "hp": 13200,
            "atk": 1950,
            "def": 480
          },
          {
            "id": "e_titan_guardian",
            "name": "Пробужденный Страж",
            "role": "elite",
            "hp": 32000,
            "atk": 3100,
            "def": 950
          }
        ]
      },
      {
        "name": "Ярус 2: Колыбель Титанов",
        "kind": "pack",
        "enemies": [
          {
            "id": "m_tc_1",
            "name": "Каменный Осколок",
            "role": "mob",
            "hp": 14000,
            "atk": 1800,
            "def": 500
          },
          {
            "id": "m_tc_2",
            "name": "Пылевой Элементаль",
            "role": "mob",
            "hp": 12500,
            "atk": 2050,
            "def": 420
          },
          {
            "id": "m_tc_3",
            "name": "Земляной Ползун",
            "role": "mob",
            "hp": 13200,
            "atk": 1950,
            "def": 480
          },
          {
            "id": "e_titan_guardian",
            "name": "Пробужденный Страж",
            "role": "elite",
            "hp": 32000,
            "atk": 3100,
            "def": 950
          }
        ]
      },
      {
        "name": "Ярус 3: Колыбель Титанов",
        "kind": "pack",
        "enemies": [
          {
            "id": "m_tc_1",
            "name": "Каменный Осколок",
            "role": "mob",
            "hp": 14000,
            "atk": 1800,
            "def": 500
          },
          {
            "id": "m_tc_2",
            "name": "Пылевой Элементаль",
            "role": "mob",
            "hp": 12500,
            "atk": 2050,
            "def": 420
          },
          {
            "id": "m_tc_3",
            "name": "Земляной Ползун",
            "role": "mob",
            "hp": 13200,
            "atk": 1950,
            "def": 480
          },
          {
            "id": "e_titan_guardian",
            "name": "Пробужденный Страж",
            "role": "elite",
            "hp": 32000,
            "atk": 3100,
            "def": 950
          }
        ]
      },
      {
        "name": "Орда (Этаж 4)",
        "kind": "swarm",
        "enemies": [
          {
            "id": "m_tc_1",
            "name": "Каменный Осколок",
            "role": "mob",
            "hp": 14000,
            "atk": 1800,
            "def": 500
          },
          {
            "id": "m_tc_2",
            "name": "Пылевой Элементаль",
            "role": "mob",
            "hp": 12500,
            "atk": 2050,
            "def": 420
          },
          {
            "id": "m_tc_3",
            "name": "Земляной Ползун",
            "role": "mob",
            "hp": 13200,
            "atk": 1950,
            "def": 480
          },
          {
            "id": "e_titan_guardian",
            "name": "Пробужденный Страж",
            "role": "elite",
            "hp": 32000,
            "atk": 3100,
            "def": 950
          }
        ]
      },
      {
        "name": "Ярус 5: Колыбель Титанов",
        "kind": "pack",
        "enemies": [
          {
            "id": "m_tc_1",
            "name": "Каменный Осколок",
            "role": "mob",
            "hp": 14000,
            "atk": 1800,
            "def": 500
          },
          {
            "id": "m_tc_2",
            "name": "Пылевой Элементаль",
            "role": "mob",
            "hp": 12500,
            "atk": 2050,
            "def": 420
          },
          {
            "id": "m_tc_3",
            "name": "Земляной Ползун",
            "role": "mob",
            "hp": 13200,
            "atk": 1950,
            "def": 480
          },
          {
            "id": "e_titan_guardian",
            "name": "Пробужденный Страж",
            "role": "elite",
            "hp": 32000,
            "atk": 3100,
            "def": 950
          }
        ]
      },
      {
        "name": "Ярус 6: Колыбель Титанов",
        "kind": "pack",
        "enemies": [
          {
            "id": "m_tc_1",
            "name": "Каменный Осколок",
            "role": "mob",
            "hp": 14000,
            "atk": 1800,
            "def": 500
          },
          {
            "id": "m_tc_2",
            "name": "Пылевой Элементаль",
            "role": "mob",
            "hp": 12500,
            "atk": 2050,
            "def": 420
          },
          {
            "id": "m_tc_3",
            "name": "Земляной Ползун",
            "role": "mob",
            "hp": 13200,
            "atk": 1950,
            "def": 480
          },
          {
            "id": "e_titan_guardian",
            "name": "Пробужденный Страж",
            "role": "elite",
            "hp": 32000,
            "atk": 3100,
            "def": 950
          }
        ]
      },
      {
        "name": "Ярус 7: Колыбель Титанов",
        "kind": "pack",
        "enemies": [
          {
            "id": "m_tc_1",
            "name": "Каменный Осколок",
            "role": "mob",
            "hp": 14000,
            "atk": 1800,
            "def": 500
          },
          {
            "id": "m_tc_2",
            "name": "Пылевой Элементаль",
            "role": "mob",
            "hp": 12500,
            "atk": 2050,
            "def": 420
          },
          {
            "id": "m_tc_3",
            "name": "Земляной Ползун",
            "role": "mob",
            "hp": 13200,
            "atk": 1950,
            "def": 480
          },
          {
            "id": "e_titan_guardian",
            "name": "Пробужденный Страж",
            "role": "elite",
            "hp": 32000,
            "atk": 3100,
            "def": 950
          }
        ]
      },
      {
        "name": "Орда (Этаж 8)",
        "kind": "swarm",
        "enemies": [
          {
            "id": "m_tc_1",
            "name": "Каменный Осколок",
            "role": "mob",
            "hp": 14000,
            "atk": 1800,
            "def": 500
          },
          {
            "id": "m_tc_2",
            "name": "Пылевой Элементаль",
            "role": "mob",
            "hp": 12500,
            "atk": 2050,
            "def": 420
          },
          {
            "id": "m_tc_3",
            "name": "Земляной Ползун",
            "role": "mob",
            "hp": 13200,
            "atk": 1950,
            "def": 480
          },
          {
            "id": "e_titan_guardian",
            "name": "Пробужденный Страж",
            "role": "elite",
            "hp": 32000,
            "atk": 3100,
            "def": 950
          }
        ]
      },
      {
        "name": "Ярус 9: Колыбель Титанов",
        "kind": "pack",
        "enemies": [
          {
            "id": "m_tc_1",
            "name": "Каменный Осколок",
            "role": "mob",
            "hp": 14000,
            "atk": 1800,
            "def": 500
          },
          {
            "id": "m_tc_2",
            "name": "Пылевой Элементаль",
            "role": "mob",
            "hp": 12500,
            "atk": 2050,
            "def": 420
          },
          {
            "id": "m_tc_3",
            "name": "Земляной Ползун",
            "role": "mob",
            "hp": 13200,
            "atk": 1950,
            "def": 480
          },
          {
            "id": "e_titan_guardian",
            "name": "Пробужденный Страж",
            "role": "elite",
            "hp": 32000,
            "atk": 3100,
            "def": 950
          }
        ]
      },
      {
        "name": "Ярус 10: Колыбель Титанов",
        "kind": "pack",
        "enemies": [
          {
            "id": "m_tc_1",
            "name": "Каменный Осколок",
            "role": "mob",
            "hp": 14000,
            "atk": 1800,
            "def": 500
          },
          {
            "id": "m_tc_2",
            "name": "Пылевой Элементаль",
            "role": "mob",
            "hp": 12500,
            "atk": 2050,
            "def": 420
          },
          {
            "id": "m_tc_3",
            "name": "Земляной Ползун",
            "role": "mob",
            "hp": 13200,
            "atk": 1950,
            "def": 480
          },
          {
            "id": "e_titan_guardian",
            "name": "Пробужденный Страж",
            "role": "elite",
            "hp": 32000,
            "atk": 3100,
            "def": 950
          }
        ]
      },
      {
        "name": "Ярус 11: Колыбель Титанов",
        "kind": "pack",
        "enemies": [
          {
            "id": "m_tc_1",
            "name": "Каменный Осколок",
            "role": "mob",
            "hp": 14000,
            "atk": 1800,
            "def": 500
          },
          {
            "id": "m_tc_2",
            "name": "Пылевой Элементаль",
            "role": "mob",
            "hp": 12500,
            "atk": 2050,
            "def": 420
          },
          {
            "id": "m_tc_3",
            "name": "Земляной Ползун",
            "role": "mob",
            "hp": 13200,
            "atk": 1950,
            "def": 480
          },
          {
            "id": "e_titan_guardian",
            "name": "Пробужденный Страж",
            "role": "elite",
            "hp": 32000,
            "atk": 3100,
            "def": 950
          }
        ]
      },
      {
        "name": "Орда (Этаж 12)",
        "kind": "swarm",
        "enemies": [
          {
            "id": "m_tc_1",
            "name": "Каменный Осколок",
            "role": "mob",
            "hp": 14000,
            "atk": 1800,
            "def": 500
          },
          {
            "id": "m_tc_2",
            "name": "Пылевой Элементаль",
            "role": "mob",
            "hp": 12500,
            "atk": 2050,
            "def": 420
          },
          {
            "id": "m_tc_3",
            "name": "Земляной Ползун",
            "role": "mob",
            "hp": 13200,
            "atk": 1950,
            "def": 480
          },
          {
            "id": "e_titan_guardian",
            "name": "Пробужденный Страж",
            "role": "elite",
            "hp": 32000,
            "atk": 3100,
            "def": 950
          }
        ]
      },
      {
        "name": "Ярус 13: Колыбель Титанов",
        "kind": "pack",
        "enemies": [
          {
            "id": "m_tc_1",
            "name": "Каменный Осколок",
            "role": "mob",
            "hp": 14000,
            "atk": 1800,
            "def": 500
          },
          {
            "id": "m_tc_2",
            "name": "Пылевой Элементаль",
            "role": "mob",
            "hp": 12500,
            "atk": 2050,
            "def": 420
          },
          {
            "id": "m_tc_3",
            "name": "Земляной Ползун",
            "role": "mob",
            "hp": 13200,
            "atk": 1950,
            "def": 480
          },
          {
            "id": "e_titan_guardian",
            "name": "Пробужденный Страж",
            "role": "elite",
            "hp": 32000,
            "atk": 3100,
            "def": 950
          }
        ]
      },
      {
        "name": "Чертог Владыки (Этаж 14)",
        "kind": "boss",
        "enemies": [
          {
            "id": "b_atlas",
            "name": "Титан Атлас",
            "role": "boss",
            "hp": 140000,
            "atk": 5200,
            "def": 1800
          },
          {
            "id": "m_tc_1_throne",
            "name": "Страж Трона",
            "role": "mob",
            "hp": 14000,
            "atk": 1800,
            "def": 500
          }
        ]
      }
    ],
    "items": [
      {
        "name": "Сокрушитель Миров",
        "slot": "weapon"
      },
      {
        "name": "Молот Первозданной Скалы",
        "slot": "weapon"
      },
      {
        "name": "Кираса Несокрушимого Титана",
        "slot": "armor"
      },
      {
        "name": "Корона Древних Колоссов",
        "slot": "helm"
      },
      {
        "name": "Поступь Горного Хребта",
        "slot": "boots"
      },
      {
        "name": "Наручи Атланта",
        "slot": "bracers"
      },
      {
        "name": "Амулет Сердца Земли",
        "slot": "amulet"
      },
      {
        "name": "Кольцо Атласа",
        "slot": "ring"
      },
      {
        "name": "Плащ Небесного Свода",
        "slot": "cloak"
      },
      {
        "name": "Пояс Непоколебимости",
        "slot": "belt"
      },
      {
        "name": "Реликвия Забытых Богов",
        "slot": "relic"
      }
    ]
  },
  {
    "id": "dungeon_astral_sanctuary",
    "name": "Астральное Святилище Звёзд",
    "desc": "Обитель безумных звёздных духов и космических аномалий, где законы физики разорваны в клочья.",
    "minLvl": 130,
    "cooldownSec": 450,
    "file": "public/shadow-world/js/dungeons/14_astral_sanctuary.js",
    "tower": 12,
    "theme": "Астральный Хаос",
    "stages": [
      {
        "name": "Ярус 1: Астральный Хаос",
        "kind": "pack",
        "enemies": [
          {
            "id": "m_as_1",
            "name": "Квазаровый Бегун-Психопат",
            "role": "mob",
            "hp": 42000,
            "atk": 4500,
            "def": 1100
          },
          {
            "id": "m_as_2",
            "name": "Парадоксальный Фрактал Света",
            "role": "mob",
            "hp": 38000,
            "atk": 5100,
            "def": 850
          },
          {
            "id": "m_as_3",
            "name": "Многомерный Звёздный Паразит",
            "role": "mob",
            "hp": 45000,
            "atk": 4800,
            "def": 1200
          },
          {
            "id": "e_pulsar_berserk",
            "name": "Сверхновый Берсерк",
            "role": "elite",
            "hp": 95000,
            "atk": 6800,
            "def": 1900
          }
        ]
      },
      {
        "name": "Ярус 2: Астральный Хаос",
        "kind": "pack",
        "enemies": [
          {
            "id": "m_as_1",
            "name": "Квазаровый Бегун-Психопат",
            "role": "mob",
            "hp": 42000,
            "atk": 4500,
            "def": 1100
          },
          {
            "id": "m_as_2",
            "name": "Парадоксальный Фрактал Света",
            "role": "mob",
            "hp": 38000,
            "atk": 5100,
            "def": 850
          },
          {
            "id": "m_as_3",
            "name": "Многомерный Звёздный Паразит",
            "role": "mob",
            "hp": 45000,
            "atk": 4800,
            "def": 1200
          },
          {
            "id": "e_pulsar_berserk",
            "name": "Сверхновый Берсерк",
            "role": "elite",
            "hp": 95000,
            "atk": 6800,
            "def": 1900
          }
        ]
      },
      {
        "name": "Ярус 3: Астральный Хаос",
        "kind": "pack",
        "enemies": [
          {
            "id": "m_as_1",
            "name": "Квазаровый Бегун-Психопат",
            "role": "mob",
            "hp": 42000,
            "atk": 4500,
            "def": 1100
          },
          {
            "id": "m_as_2",
            "name": "Парадоксальный Фрактал Света",
            "role": "mob",
            "hp": 38000,
            "atk": 5100,
            "def": 850
          },
          {
            "id": "m_as_3",
            "name": "Многомерный Звёздный Паразит",
            "role": "mob",
            "hp": 45000,
            "atk": 4800,
            "def": 1200
          },
          {
            "id": "e_pulsar_berserk",
            "name": "Сверхновый Берсерк",
            "role": "elite",
            "hp": 95000,
            "atk": 6800,
            "def": 1900
          }
        ]
      },
      {
        "name": "Орда (Этаж 4)",
        "kind": "swarm",
        "enemies": [
          {
            "id": "m_as_1",
            "name": "Квазаровый Бегун-Психопат",
            "role": "mob",
            "hp": 42000,
            "atk": 4500,
            "def": 1100
          },
          {
            "id": "m_as_2",
            "name": "Парадоксальный Фрактал Света",
            "role": "mob",
            "hp": 38000,
            "atk": 5100,
            "def": 850
          },
          {
            "id": "m_as_3",
            "name": "Многомерный Звёздный Паразит",
            "role": "mob",
            "hp": 45000,
            "atk": 4800,
            "def": 1200
          },
          {
            "id": "e_pulsar_berserk",
            "name": "Сверхновый Берсерк",
            "role": "elite",
            "hp": 95000,
            "atk": 6800,
            "def": 1900
          }
        ]
      },
      {
        "name": "Ярус 5: Астральный Хаос",
        "kind": "pack",
        "enemies": [
          {
            "id": "m_as_1",
            "name": "Квазаровый Бегун-Психопат",
            "role": "mob",
            "hp": 42000,
            "atk": 4500,
            "def": 1100
          },
          {
            "id": "m_as_2",
            "name": "Парадоксальный Фрактал Света",
            "role": "mob",
            "hp": 38000,
            "atk": 5100,
            "def": 850
          },
          {
            "id": "m_as_3",
            "name": "Многомерный Звёздный Паразит",
            "role": "mob",
            "hp": 45000,
            "atk": 4800,
            "def": 1200
          },
          {
            "id": "e_pulsar_berserk",
            "name": "Сверхновый Берсерк",
            "role": "elite",
            "hp": 95000,
            "atk": 6800,
            "def": 1900
          }
        ]
      },
      {
        "name": "Ярус 6: Астральный Хаос",
        "kind": "pack",
        "enemies": [
          {
            "id": "m_as_1",
            "name": "Квазаровый Бегун-Психопат",
            "role": "mob",
            "hp": 42000,
            "atk": 4500,
            "def": 1100
          },
          {
            "id": "m_as_2",
            "name": "Парадоксальный Фрактал Света",
            "role": "mob",
            "hp": 38000,
            "atk": 5100,
            "def": 850
          },
          {
            "id": "m_as_3",
            "name": "Многомерный Звёздный Паразит",
            "role": "mob",
            "hp": 45000,
            "atk": 4800,
            "def": 1200
          },
          {
            "id": "e_pulsar_berserk",
            "name": "Сверхновый Берсерк",
            "role": "elite",
            "hp": 95000,
            "atk": 6800,
            "def": 1900
          }
        ]
      },
      {
        "name": "Ярус 7: Астральный Хаос",
        "kind": "pack",
        "enemies": [
          {
            "id": "m_as_1",
            "name": "Квазаровый Бегун-Психопат",
            "role": "mob",
            "hp": 42000,
            "atk": 4500,
            "def": 1100
          },
          {
            "id": "m_as_2",
            "name": "Парадоксальный Фрактал Света",
            "role": "mob",
            "hp": 38000,
            "atk": 5100,
            "def": 850
          },
          {
            "id": "m_as_3",
            "name": "Многомерный Звёздный Паразит",
            "role": "mob",
            "hp": 45000,
            "atk": 4800,
            "def": 1200
          },
          {
            "id": "e_pulsar_berserk",
            "name": "Сверхновый Берсерк",
            "role": "elite",
            "hp": 95000,
            "atk": 6800,
            "def": 1900
          }
        ]
      },
      {
        "name": "Орда (Этаж 8)",
        "kind": "swarm",
        "enemies": [
          {
            "id": "m_as_1",
            "name": "Квазаровый Бегун-Психопат",
            "role": "mob",
            "hp": 42000,
            "atk": 4500,
            "def": 1100
          },
          {
            "id": "m_as_2",
            "name": "Парадоксальный Фрактал Света",
            "role": "mob",
            "hp": 38000,
            "atk": 5100,
            "def": 850
          },
          {
            "id": "m_as_3",
            "name": "Многомерный Звёздный Паразит",
            "role": "mob",
            "hp": 45000,
            "atk": 4800,
            "def": 1200
          },
          {
            "id": "e_pulsar_berserk",
            "name": "Сверхновый Берсерк",
            "role": "elite",
            "hp": 95000,
            "atk": 6800,
            "def": 1900
          }
        ]
      },
      {
        "name": "Ярус 9: Астральный Хаос",
        "kind": "pack",
        "enemies": [
          {
            "id": "m_as_1",
            "name": "Квазаровый Бегун-Психопат",
            "role": "mob",
            "hp": 42000,
            "atk": 4500,
            "def": 1100
          },
          {
            "id": "m_as_2",
            "name": "Парадоксальный Фрактал Света",
            "role": "mob",
            "hp": 38000,
            "atk": 5100,
            "def": 850
          },
          {
            "id": "m_as_3",
            "name": "Многомерный Звёздный Паразит",
            "role": "mob",
            "hp": 45000,
            "atk": 4800,
            "def": 1200
          },
          {
            "id": "e_pulsar_berserk",
            "name": "Сверхновый Берсерк",
            "role": "elite",
            "hp": 95000,
            "atk": 6800,
            "def": 1900
          }
        ]
      },
      {
        "name": "Ярус 10: Астральный Хаос",
        "kind": "pack",
        "enemies": [
          {
            "id": "m_as_1",
            "name": "Квазаровый Бегун-Психопат",
            "role": "mob",
            "hp": 42000,
            "atk": 4500,
            "def": 1100
          },
          {
            "id": "m_as_2",
            "name": "Парадоксальный Фрактал Света",
            "role": "mob",
            "hp": 38000,
            "atk": 5100,
            "def": 850
          },
          {
            "id": "m_as_3",
            "name": "Многомерный Звёздный Паразит",
            "role": "mob",
            "hp": 45000,
            "atk": 4800,
            "def": 1200
          },
          {
            "id": "e_pulsar_berserk",
            "name": "Сверхновый Берсерк",
            "role": "elite",
            "hp": 95000,
            "atk": 6800,
            "def": 1900
          }
        ]
      },
      {
        "name": "Ярус 11: Астральный Хаос",
        "kind": "pack",
        "enemies": [
          {
            "id": "m_as_1",
            "name": "Квазаровый Бегун-Психопат",
            "role": "mob",
            "hp": 42000,
            "atk": 4500,
            "def": 1100
          },
          {
            "id": "m_as_2",
            "name": "Парадоксальный Фрактал Света",
            "role": "mob",
            "hp": 38000,
            "atk": 5100,
            "def": 850
          },
          {
            "id": "m_as_3",
            "name": "Многомерный Звёздный Паразит",
            "role": "mob",
            "hp": 45000,
            "atk": 4800,
            "def": 1200
          },
          {
            "id": "e_pulsar_berserk",
            "name": "Сверхновый Берсерк",
            "role": "elite",
            "hp": 95000,
            "atk": 6800,
            "def": 1900
          }
        ]
      },
      {
        "name": "Чертог Владыки (Этаж 12)",
        "kind": "boss",
        "enemies": [
          {
            "id": "b_astral_demiurge",
            "name": "Демиург Селестия",
            "role": "boss",
            "hp": 280000,
            "atk": 8900,
            "def": 2800
          },
          {
            "id": "m_as_1_throne",
            "name": "Страж Трона",
            "role": "mob",
            "hp": 42000,
            "atk": 4500,
            "def": 1100
          }
        ]
      }
    ],
    "items": [
      {
        "name": "Клинок Расколотого Космоса",
        "slot": "weapon"
      },
      {
        "name": "Посох Сингулярности",
        "slot": "weapon"
      },
      {
        "name": "Кираса Астрального Света",
        "slot": "armor"
      },
      {
        "name": "Венец Звёздного Разума",
        "slot": "helm"
      },
      {
        "name": "Поступь Сверхновой",
        "slot": "boots"
      },
      {
        "name": "Наручи Квазара",
        "slot": "bracers"
      },
      {
        "name": "Амулет Звёздного Ядра",
        "slot": "amulet"
      },
      {
        "name": "Кольцо Бесконечной Орбиты",
        "slot": "ring"
      },
      {
        "name": "Плащ Ткани Вселенной",
        "slot": "cloak"
      },
      {
        "name": "Пояс Гравитационного Коллапса",
        "slot": "belt"
      },
      {
        "name": "Реликвия Селестии",
        "slot": "relic"
      }
    ]
  },
  {
    "id": "dungeon_oblivion_depths",
    "name": "Глубины Небытия",
    "desc": "Истинная тьма и обитель абсолютной энтропии, где растворяются последние крупицы пространства и времени.",
    "minLvl": 150,
    "cooldownSec": 480,
    "file": "public/shadow-world/js/dungeons/15_oblivion_depths.js",
    "tower": 15,
    "theme": "Небытие",
    "stages": [
      {
        "name": "Ярус 1: Небытие",
        "kind": "pack",
        "enemies": [
          {
            "id": "m_od_1",
            "name": "Тень Забвения",
            "role": "mob",
            "hp": 55000,
            "atk": 4800,
            "def": 1300
          },
          {
            "id": "m_od_2",
            "name": "Пожиратель Памяти",
            "role": "mob",
            "hp": 51000,
            "atk": 5300,
            "def": 1100
          },
          {
            "id": "m_od_3",
            "name": "Страж Пустоты",
            "role": "mob",
            "hp": 58000,
            "atk": 4600,
            "def": 1500
          },
          {
            "id": "e_entropy_manifest",
            "name": "Манифестация Энтропии",
            "role": "elite",
            "hp": 120000,
            "atk": 7200,
            "def": 2200
          }
        ]
      },
      {
        "name": "Ярус 2: Небытие",
        "kind": "pack",
        "enemies": [
          {
            "id": "m_od_1",
            "name": "Тень Забвения",
            "role": "mob",
            "hp": 55000,
            "atk": 4800,
            "def": 1300
          },
          {
            "id": "m_od_2",
            "name": "Пожиратель Памяти",
            "role": "mob",
            "hp": 51000,
            "atk": 5300,
            "def": 1100
          },
          {
            "id": "m_od_3",
            "name": "Страж Пустоты",
            "role": "mob",
            "hp": 58000,
            "atk": 4600,
            "def": 1500
          },
          {
            "id": "e_entropy_manifest",
            "name": "Манифестация Энтропии",
            "role": "elite",
            "hp": 120000,
            "atk": 7200,
            "def": 2200
          }
        ]
      },
      {
        "name": "Ярус 3: Небытие",
        "kind": "pack",
        "enemies": [
          {
            "id": "m_od_1",
            "name": "Тень Забвения",
            "role": "mob",
            "hp": 55000,
            "atk": 4800,
            "def": 1300
          },
          {
            "id": "m_od_2",
            "name": "Пожиратель Памяти",
            "role": "mob",
            "hp": 51000,
            "atk": 5300,
            "def": 1100
          },
          {
            "id": "m_od_3",
            "name": "Страж Пустоты",
            "role": "mob",
            "hp": 58000,
            "atk": 4600,
            "def": 1500
          },
          {
            "id": "e_entropy_manifest",
            "name": "Манифестация Энтропии",
            "role": "elite",
            "hp": 120000,
            "atk": 7200,
            "def": 2200
          }
        ]
      },
      {
        "name": "Орда (Этаж 4)",
        "kind": "swarm",
        "enemies": [
          {
            "id": "m_od_1",
            "name": "Тень Забвения",
            "role": "mob",
            "hp": 55000,
            "atk": 4800,
            "def": 1300
          },
          {
            "id": "m_od_2",
            "name": "Пожиратель Памяти",
            "role": "mob",
            "hp": 51000,
            "atk": 5300,
            "def": 1100
          },
          {
            "id": "m_od_3",
            "name": "Страж Пустоты",
            "role": "mob",
            "hp": 58000,
            "atk": 4600,
            "def": 1500
          },
          {
            "id": "e_entropy_manifest",
            "name": "Манифестация Энтропии",
            "role": "elite",
            "hp": 120000,
            "atk": 7200,
            "def": 2200
          }
        ]
      },
      {
        "name": "Ярус 5: Небытие",
        "kind": "pack",
        "enemies": [
          {
            "id": "m_od_1",
            "name": "Тень Забвения",
            "role": "mob",
            "hp": 55000,
            "atk": 4800,
            "def": 1300
          },
          {
            "id": "m_od_2",
            "name": "Пожиратель Памяти",
            "role": "mob",
            "hp": 51000,
            "atk": 5300,
            "def": 1100
          },
          {
            "id": "m_od_3",
            "name": "Страж Пустоты",
            "role": "mob",
            "hp": 58000,
            "atk": 4600,
            "def": 1500
          },
          {
            "id": "e_entropy_manifest",
            "name": "Манифестация Энтропии",
            "role": "elite",
            "hp": 120000,
            "atk": 7200,
            "def": 2200
          }
        ]
      },
      {
        "name": "Ярус 6: Небытие",
        "kind": "pack",
        "enemies": [
          {
            "id": "m_od_1",
            "name": "Тень Забвения",
            "role": "mob",
            "hp": 55000,
            "atk": 4800,
            "def": 1300
          },
          {
            "id": "m_od_2",
            "name": "Пожиратель Памяти",
            "role": "mob",
            "hp": 51000,
            "atk": 5300,
            "def": 1100
          },
          {
            "id": "m_od_3",
            "name": "Страж Пустоты",
            "role": "mob",
            "hp": 58000,
            "atk": 4600,
            "def": 1500
          },
          {
            "id": "e_entropy_manifest",
            "name": "Манифестация Энтропии",
            "role": "elite",
            "hp": 120000,
            "atk": 7200,
            "def": 2200
          }
        ]
      },
      {
        "name": "Ярус 7: Небытие",
        "kind": "pack",
        "enemies": [
          {
            "id": "m_od_1",
            "name": "Тень Забвения",
            "role": "mob",
            "hp": 55000,
            "atk": 4800,
            "def": 1300
          },
          {
            "id": "m_od_2",
            "name": "Пожиратель Памяти",
            "role": "mob",
            "hp": 51000,
            "atk": 5300,
            "def": 1100
          },
          {
            "id": "m_od_3",
            "name": "Страж Пустоты",
            "role": "mob",
            "hp": 58000,
            "atk": 4600,
            "def": 1500
          },
          {
            "id": "e_entropy_manifest",
            "name": "Манифестация Энтропии",
            "role": "elite",
            "hp": 120000,
            "atk": 7200,
            "def": 2200
          }
        ]
      },
      {
        "name": "Орда (Этаж 8)",
        "kind": "swarm",
        "enemies": [
          {
            "id": "m_od_1",
            "name": "Тень Забвения",
            "role": "mob",
            "hp": 55000,
            "atk": 4800,
            "def": 1300
          },
          {
            "id": "m_od_2",
            "name": "Пожиратель Памяти",
            "role": "mob",
            "hp": 51000,
            "atk": 5300,
            "def": 1100
          },
          {
            "id": "m_od_3",
            "name": "Страж Пустоты",
            "role": "mob",
            "hp": 58000,
            "atk": 4600,
            "def": 1500
          },
          {
            "id": "e_entropy_manifest",
            "name": "Манифестация Энтропии",
            "role": "elite",
            "hp": 120000,
            "atk": 7200,
            "def": 2200
          }
        ]
      },
      {
        "name": "Ярус 9: Небытие",
        "kind": "pack",
        "enemies": [
          {
            "id": "m_od_1",
            "name": "Тень Забвения",
            "role": "mob",
            "hp": 55000,
            "atk": 4800,
            "def": 1300
          },
          {
            "id": "m_od_2",
            "name": "Пожиратель Памяти",
            "role": "mob",
            "hp": 51000,
            "atk": 5300,
            "def": 1100
          },
          {
            "id": "m_od_3",
            "name": "Страж Пустоты",
            "role": "mob",
            "hp": 58000,
            "atk": 4600,
            "def": 1500
          },
          {
            "id": "e_entropy_manifest",
            "name": "Манифестация Энтропии",
            "role": "elite",
            "hp": 120000,
            "atk": 7200,
            "def": 2200
          }
        ]
      },
      {
        "name": "Ярус 10: Небытие",
        "kind": "pack",
        "enemies": [
          {
            "id": "m_od_1",
            "name": "Тень Забвения",
            "role": "mob",
            "hp": 55000,
            "atk": 4800,
            "def": 1300
          },
          {
            "id": "m_od_2",
            "name": "Пожиратель Памяти",
            "role": "mob",
            "hp": 51000,
            "atk": 5300,
            "def": 1100
          },
          {
            "id": "m_od_3",
            "name": "Страж Пустоты",
            "role": "mob",
            "hp": 58000,
            "atk": 4600,
            "def": 1500
          },
          {
            "id": "e_entropy_manifest",
            "name": "Манифестация Энтропии",
            "role": "elite",
            "hp": 120000,
            "atk": 7200,
            "def": 2200
          }
        ]
      },
      {
        "name": "Ярус 11: Небытие",
        "kind": "pack",
        "enemies": [
          {
            "id": "m_od_1",
            "name": "Тень Забвения",
            "role": "mob",
            "hp": 55000,
            "atk": 4800,
            "def": 1300
          },
          {
            "id": "m_od_2",
            "name": "Пожиратель Памяти",
            "role": "mob",
            "hp": 51000,
            "atk": 5300,
            "def": 1100
          },
          {
            "id": "m_od_3",
            "name": "Страж Пустоты",
            "role": "mob",
            "hp": 58000,
            "atk": 4600,
            "def": 1500
          },
          {
            "id": "e_entropy_manifest",
            "name": "Манифестация Энтропии",
            "role": "elite",
            "hp": 120000,
            "atk": 7200,
            "def": 2200
          }
        ]
      },
      {
        "name": "Орда (Этаж 12)",
        "kind": "swarm",
        "enemies": [
          {
            "id": "m_od_1",
            "name": "Тень Забвения",
            "role": "mob",
            "hp": 55000,
            "atk": 4800,
            "def": 1300
          },
          {
            "id": "m_od_2",
            "name": "Пожиратель Памяти",
            "role": "mob",
            "hp": 51000,
            "atk": 5300,
            "def": 1100
          },
          {
            "id": "m_od_3",
            "name": "Страж Пустоты",
            "role": "mob",
            "hp": 58000,
            "atk": 4600,
            "def": 1500
          },
          {
            "id": "e_entropy_manifest",
            "name": "Манифестация Энтропии",
            "role": "elite",
            "hp": 120000,
            "atk": 7200,
            "def": 2200
          }
        ]
      },
      {
        "name": "Ярус 13: Небытие",
        "kind": "pack",
        "enemies": [
          {
            "id": "m_od_1",
            "name": "Тень Забвения",
            "role": "mob",
            "hp": 55000,
            "atk": 4800,
            "def": 1300
          },
          {
            "id": "m_od_2",
            "name": "Пожиратель Памяти",
            "role": "mob",
            "hp": 51000,
            "atk": 5300,
            "def": 1100
          },
          {
            "id": "m_od_3",
            "name": "Страж Пустоты",
            "role": "mob",
            "hp": 58000,
            "atk": 4600,
            "def": 1500
          },
          {
            "id": "e_entropy_manifest",
            "name": "Манифестация Энтропии",
            "role": "elite",
            "hp": 120000,
            "atk": 7200,
            "def": 2200
          }
        ]
      },
      {
        "name": "Ярус 14: Небытие",
        "kind": "pack",
        "enemies": [
          {
            "id": "m_od_1",
            "name": "Тень Забвения",
            "role": "mob",
            "hp": 55000,
            "atk": 4800,
            "def": 1300
          },
          {
            "id": "m_od_2",
            "name": "Пожиратель Памяти",
            "role": "mob",
            "hp": 51000,
            "atk": 5300,
            "def": 1100
          },
          {
            "id": "m_od_3",
            "name": "Страж Пустоты",
            "role": "mob",
            "hp": 58000,
            "atk": 4600,
            "def": 1500
          },
          {
            "id": "e_entropy_manifest",
            "name": "Манифестация Энтропии",
            "role": "elite",
            "hp": 120000,
            "atk": 7200,
            "def": 2200
          }
        ]
      },
      {
        "name": "Чертог Владыки (Этаж 15)",
        "kind": "boss",
        "enemies": [
          {
            "id": "b_oblivion_lord",
            "name": "Владыка Энтропия",
            "role": "boss",
            "hp": 400000,
            "atk": 11000,
            "def": 3500
          },
          {
            "id": "m_od_1_throne",
            "name": "Страж Трона",
            "role": "mob",
            "hp": 55000,
            "atk": 4800,
            "def": 1300
          }
        ]
      }
    ],
    "items": [
      {
        "name": "Коса Энтропии",
        "slot": "weapon"
      },
      {
        "name": "Клинок Забвения",
        "slot": "weapon"
      },
      {
        "name": "Латы Небытия",
        "slot": "armor"
      },
      {
        "name": "Венец Энтропии",
        "slot": "helm"
      },
      {
        "name": "Сапоги Энтропии",
        "slot": "boots"
      },
      {
        "name": "Наручи Забвения",
        "slot": "bracers"
      },
      {
        "name": "Амулет Абсолютной Тьмы",
        "slot": "amulet"
      },
      {
        "name": "Кольцо Разрушения Рассудка",
        "slot": "ring"
      },
      {
        "name": "Плащ Небытия",
        "slot": "cloak"
      },
      {
        "name": "Пояс Энтропии",
        "slot": "belt"
      },
      {
        "name": "Реликвия Забытых Миров",
        "slot": "relic"
      }
    ]
  },
  {
    "id": "dungeon_chronos_engine",
    "name": "Сердце Вечного Времени",
    "desc": "Сложный часовой механизм вселенной, где тиканье шестеренок определяет законы физики, а время подвластно лишь избранным.",
    "minLvl": 175,
    "cooldownSec": 500,
    "file": "public/shadow-world/js/dungeons/16_chronos_engine.js",
    "tower": 15,
    "theme": "Время",
    "stages": [
      {
        "name": "Ярус 1: Время",
        "kind": "pack",
        "enemies": [
          {
            "id": "m_ce_1",
            "name": "Автоматон",
            "role": "mob",
            "hp": 90000,
            "atk": 6800,
            "def": 1900
          },
          {
            "id": "m_ce_2",
            "name": "Квантовый Часовщик",
            "role": "mob",
            "hp": 85000,
            "atk": 7400,
            "def": 1600
          },
          {
            "id": "m_ce_3",
            "name": "Смещенный во Времени Страж",
            "role": "mob",
            "hp": 98000,
            "atk": 6500,
            "def": 2100
          },
          {
            "id": "e_chronos_warden",
            "name": "Элитный Темпоральный Надзиратель",
            "role": "elite",
            "hp": 190000,
            "atk": 10500,
            "def": 3200
          }
        ]
      },
      {
        "name": "Ярус 2: Время",
        "kind": "pack",
        "enemies": [
          {
            "id": "m_ce_1",
            "name": "Автоматон",
            "role": "mob",
            "hp": 90000,
            "atk": 6800,
            "def": 1900
          },
          {
            "id": "m_ce_2",
            "name": "Квантовый Часовщик",
            "role": "mob",
            "hp": 85000,
            "atk": 7400,
            "def": 1600
          },
          {
            "id": "m_ce_3",
            "name": "Смещенный во Времени Страж",
            "role": "mob",
            "hp": 98000,
            "atk": 6500,
            "def": 2100
          },
          {
            "id": "e_chronos_warden",
            "name": "Элитный Темпоральный Надзиратель",
            "role": "elite",
            "hp": 190000,
            "atk": 10500,
            "def": 3200
          }
        ]
      },
      {
        "name": "Ярус 3: Время",
        "kind": "pack",
        "enemies": [
          {
            "id": "m_ce_1",
            "name": "Автоматон",
            "role": "mob",
            "hp": 90000,
            "atk": 6800,
            "def": 1900
          },
          {
            "id": "m_ce_2",
            "name": "Квантовый Часовщик",
            "role": "mob",
            "hp": 85000,
            "atk": 7400,
            "def": 1600
          },
          {
            "id": "m_ce_3",
            "name": "Смещенный во Времени Страж",
            "role": "mob",
            "hp": 98000,
            "atk": 6500,
            "def": 2100
          },
          {
            "id": "e_chronos_warden",
            "name": "Элитный Темпоральный Надзиратель",
            "role": "elite",
            "hp": 190000,
            "atk": 10500,
            "def": 3200
          }
        ]
      },
      {
        "name": "Орда (Этаж 4)",
        "kind": "swarm",
        "enemies": [
          {
            "id": "m_ce_1",
            "name": "Автоматон",
            "role": "mob",
            "hp": 90000,
            "atk": 6800,
            "def": 1900
          },
          {
            "id": "m_ce_2",
            "name": "Квантовый Часовщик",
            "role": "mob",
            "hp": 85000,
            "atk": 7400,
            "def": 1600
          },
          {
            "id": "m_ce_3",
            "name": "Смещенный во Времени Страж",
            "role": "mob",
            "hp": 98000,
            "atk": 6500,
            "def": 2100
          },
          {
            "id": "e_chronos_warden",
            "name": "Элитный Темпоральный Надзиратель",
            "role": "elite",
            "hp": 190000,
            "atk": 10500,
            "def": 3200
          }
        ]
      },
      {
        "name": "Ярус 5: Время",
        "kind": "pack",
        "enemies": [
          {
            "id": "m_ce_1",
            "name": "Автоматон",
            "role": "mob",
            "hp": 90000,
            "atk": 6800,
            "def": 1900
          },
          {
            "id": "m_ce_2",
            "name": "Квантовый Часовщик",
            "role": "mob",
            "hp": 85000,
            "atk": 7400,
            "def": 1600
          },
          {
            "id": "m_ce_3",
            "name": "Смещенный во Времени Страж",
            "role": "mob",
            "hp": 98000,
            "atk": 6500,
            "def": 2100
          },
          {
            "id": "e_chronos_warden",
            "name": "Элитный Темпоральный Надзиратель",
            "role": "elite",
            "hp": 190000,
            "atk": 10500,
            "def": 3200
          }
        ]
      },
      {
        "name": "Ярус 6: Время",
        "kind": "pack",
        "enemies": [
          {
            "id": "m_ce_1",
            "name": "Автоматон",
            "role": "mob",
            "hp": 90000,
            "atk": 6800,
            "def": 1900
          },
          {
            "id": "m_ce_2",
            "name": "Квантовый Часовщик",
            "role": "mob",
            "hp": 85000,
            "atk": 7400,
            "def": 1600
          },
          {
            "id": "m_ce_3",
            "name": "Смещенный во Времени Страж",
            "role": "mob",
            "hp": 98000,
            "atk": 6500,
            "def": 2100
          },
          {
            "id": "e_chronos_warden",
            "name": "Элитный Темпоральный Надзиратель",
            "role": "elite",
            "hp": 190000,
            "atk": 10500,
            "def": 3200
          }
        ]
      },
      {
        "name": "Ярус 7: Время",
        "kind": "pack",
        "enemies": [
          {
            "id": "m_ce_1",
            "name": "Автоматон",
            "role": "mob",
            "hp": 90000,
            "atk": 6800,
            "def": 1900
          },
          {
            "id": "m_ce_2",
            "name": "Квантовый Часовщик",
            "role": "mob",
            "hp": 85000,
            "atk": 7400,
            "def": 1600
          },
          {
            "id": "m_ce_3",
            "name": "Смещенный во Времени Страж",
            "role": "mob",
            "hp": 98000,
            "atk": 6500,
            "def": 2100
          },
          {
            "id": "e_chronos_warden",
            "name": "Элитный Темпоральный Надзиратель",
            "role": "elite",
            "hp": 190000,
            "atk": 10500,
            "def": 3200
          }
        ]
      },
      {
        "name": "Орда (Этаж 8)",
        "kind": "swarm",
        "enemies": [
          {
            "id": "m_ce_1",
            "name": "Автоматон",
            "role": "mob",
            "hp": 90000,
            "atk": 6800,
            "def": 1900
          },
          {
            "id": "m_ce_2",
            "name": "Квантовый Часовщик",
            "role": "mob",
            "hp": 85000,
            "atk": 7400,
            "def": 1600
          },
          {
            "id": "m_ce_3",
            "name": "Смещенный во Времени Страж",
            "role": "mob",
            "hp": 98000,
            "atk": 6500,
            "def": 2100
          },
          {
            "id": "e_chronos_warden",
            "name": "Элитный Темпоральный Надзиратель",
            "role": "elite",
            "hp": 190000,
            "atk": 10500,
            "def": 3200
          }
        ]
      },
      {
        "name": "Ярус 9: Время",
        "kind": "pack",
        "enemies": [
          {
            "id": "m_ce_1",
            "name": "Автоматон",
            "role": "mob",
            "hp": 90000,
            "atk": 6800,
            "def": 1900
          },
          {
            "id": "m_ce_2",
            "name": "Квантовый Часовщик",
            "role": "mob",
            "hp": 85000,
            "atk": 7400,
            "def": 1600
          },
          {
            "id": "m_ce_3",
            "name": "Смещенный во Времени Страж",
            "role": "mob",
            "hp": 98000,
            "atk": 6500,
            "def": 2100
          },
          {
            "id": "e_chronos_warden",
            "name": "Элитный Темпоральный Надзиратель",
            "role": "elite",
            "hp": 190000,
            "atk": 10500,
            "def": 3200
          }
        ]
      },
      {
        "name": "Ярус 10: Время",
        "kind": "pack",
        "enemies": [
          {
            "id": "m_ce_1",
            "name": "Автоматон",
            "role": "mob",
            "hp": 90000,
            "atk": 6800,
            "def": 1900
          },
          {
            "id": "m_ce_2",
            "name": "Квантовый Часовщик",
            "role": "mob",
            "hp": 85000,
            "atk": 7400,
            "def": 1600
          },
          {
            "id": "m_ce_3",
            "name": "Смещенный во Времени Страж",
            "role": "mob",
            "hp": 98000,
            "atk": 6500,
            "def": 2100
          },
          {
            "id": "e_chronos_warden",
            "name": "Элитный Темпоральный Надзиратель",
            "role": "elite",
            "hp": 190000,
            "atk": 10500,
            "def": 3200
          }
        ]
      },
      {
        "name": "Ярус 11: Время",
        "kind": "pack",
        "enemies": [
          {
            "id": "m_ce_1",
            "name": "Автоматон",
            "role": "mob",
            "hp": 90000,
            "atk": 6800,
            "def": 1900
          },
          {
            "id": "m_ce_2",
            "name": "Квантовый Часовщик",
            "role": "mob",
            "hp": 85000,
            "atk": 7400,
            "def": 1600
          },
          {
            "id": "m_ce_3",
            "name": "Смещенный во Времени Страж",
            "role": "mob",
            "hp": 98000,
            "atk": 6500,
            "def": 2100
          },
          {
            "id": "e_chronos_warden",
            "name": "Элитный Темпоральный Надзиратель",
            "role": "elite",
            "hp": 190000,
            "atk": 10500,
            "def": 3200
          }
        ]
      },
      {
        "name": "Орда (Этаж 12)",
        "kind": "swarm",
        "enemies": [
          {
            "id": "m_ce_1",
            "name": "Автоматон",
            "role": "mob",
            "hp": 90000,
            "atk": 6800,
            "def": 1900
          },
          {
            "id": "m_ce_2",
            "name": "Квантовый Часовщик",
            "role": "mob",
            "hp": 85000,
            "atk": 7400,
            "def": 1600
          },
          {
            "id": "m_ce_3",
            "name": "Смещенный во Времени Страж",
            "role": "mob",
            "hp": 98000,
            "atk": 6500,
            "def": 2100
          },
          {
            "id": "e_chronos_warden",
            "name": "Элитный Темпоральный Надзиратель",
            "role": "elite",
            "hp": 190000,
            "atk": 10500,
            "def": 3200
          }
        ]
      },
      {
        "name": "Ярус 13: Время",
        "kind": "pack",
        "enemies": [
          {
            "id": "m_ce_1",
            "name": "Автоматон",
            "role": "mob",
            "hp": 90000,
            "atk": 6800,
            "def": 1900
          },
          {
            "id": "m_ce_2",
            "name": "Квантовый Часовщик",
            "role": "mob",
            "hp": 85000,
            "atk": 7400,
            "def": 1600
          },
          {
            "id": "m_ce_3",
            "name": "Смещенный во Времени Страж",
            "role": "mob",
            "hp": 98000,
            "atk": 6500,
            "def": 2100
          },
          {
            "id": "e_chronos_warden",
            "name": "Элитный Темпоральный Надзиратель",
            "role": "elite",
            "hp": 190000,
            "atk": 10500,
            "def": 3200
          }
        ]
      },
      {
        "name": "Ярус 14: Время",
        "kind": "pack",
        "enemies": [
          {
            "id": "m_ce_1",
            "name": "Автоматон",
            "role": "mob",
            "hp": 90000,
            "atk": 6800,
            "def": 1900
          },
          {
            "id": "m_ce_2",
            "name": "Квантовый Часовщик",
            "role": "mob",
            "hp": 85000,
            "atk": 7400,
            "def": 1600
          },
          {
            "id": "m_ce_3",
            "name": "Смещенный во Времени Страж",
            "role": "mob",
            "hp": 98000,
            "atk": 6500,
            "def": 2100
          },
          {
            "id": "e_chronos_warden",
            "name": "Элитный Темпоральный Надзиратель",
            "role": "elite",
            "hp": 190000,
            "atk": 10500,
            "def": 3200
          }
        ]
      },
      {
        "name": "Чертог Владыки (Этаж 15)",
        "kind": "boss",
        "enemies": [
          {
            "id": "b_chronos_prime",
            "name": "Хронос Прайм",
            "role": "boss",
            "hp": 650000,
            "atk": 16000,
            "def": 5200
          },
          {
            "id": "m_ce_1_throne",
            "name": "Страж Трона",
            "role": "mob",
            "hp": 90000,
            "atk": 6800,
            "def": 1900
          }
        ]
      }
    ],
    "items": [
      {
        "name": "Клинок Темпорального Сдвига",
        "slot": "weapon"
      },
      {
        "name": "Жезл Искажения Времени",
        "slot": "weapon"
      },
      {
        "name": "Доспех Вечного Цикла",
        "slot": "armor"
      },
      {
        "name": "Шлем Часовщика",
        "slot": "helm"
      },
      {
        "name": "Поступь Вечности",
        "slot": "boots"
      },
      {
        "name": "Наручи Хроноса",
        "slot": "bracers"
      },
      {
        "name": "Хронометр Вечности",
        "slot": "amulet"
      },
      {
        "name": "Кольцо Часовой Стрелки",
        "slot": "ring"
      },
      {
        "name": "Плащ Парадокса",
        "slot": "cloak"
      },
      {
        "name": "Пояс Времени",
        "slot": "belt"
      },
      {
        "name": "Реликвия Хроно-Двигателя",
        "slot": "relic"
      }
    ]
  },
  {
    "id": "dungeon_null_dimension",
    "name": "Нуль-Измерение Создателя",
    "desc": "Финальный рубеж мультивселенной. Бескомпромиссный босс-раш сквозь 20 этажей абсолютного хаоса перед лицом самого Создателя.",
    "minLvl": 300,
    "cooldownSec": 720,
    "file": "public/shadow-world/js/dungeons/17_null_dimension.js",
    "tower": 20,
    "theme": "Нуль-Измерение",
    "stages": [
      {
        "name": "Ярус 1: Нуль-Измерение",
        "kind": "pack",
        "enemies": [
          {
            "id": "m_nd_1",
            "name": "Нуль-Разрушитель",
            "role": "mob",
            "hp": 600000,
            "atk": 25000,
            "def": 7500
          },
          {
            "id": "m_nd_2",
            "name": "Сингулярный Коллапсар",
            "role": "mob",
            "hp": 550000,
            "atk": 28000,
            "def": 6800
          },
          {
            "id": "m_nd_3",
            "name": "Апокалиптический Фантом",
            "role": "mob",
            "hp": 650000,
            "atk": 23000,
            "def": 8200
          },
          {
            "id": "e_absolute_avatar",
            "name": "Аватар Абсолюта",
            "role": "elite",
            "hp": 1500000,
            "atk": 42000,
            "def": 14000
          }
        ]
      },
      {
        "name": "Ярус 2: Нуль-Измерение",
        "kind": "pack",
        "enemies": [
          {
            "id": "m_nd_1",
            "name": "Нуль-Разрушитель",
            "role": "mob",
            "hp": 600000,
            "atk": 25000,
            "def": 7500
          },
          {
            "id": "m_nd_2",
            "name": "Сингулярный Коллапсар",
            "role": "mob",
            "hp": 550000,
            "atk": 28000,
            "def": 6800
          },
          {
            "id": "m_nd_3",
            "name": "Апокалиптический Фантом",
            "role": "mob",
            "hp": 650000,
            "atk": 23000,
            "def": 8200
          },
          {
            "id": "e_absolute_avatar",
            "name": "Аватар Абсолюта",
            "role": "elite",
            "hp": 1500000,
            "atk": 42000,
            "def": 14000
          }
        ]
      },
      {
        "name": "Ярус 3: Нуль-Измерение",
        "kind": "pack",
        "enemies": [
          {
            "id": "m_nd_1",
            "name": "Нуль-Разрушитель",
            "role": "mob",
            "hp": 600000,
            "atk": 25000,
            "def": 7500
          },
          {
            "id": "m_nd_2",
            "name": "Сингулярный Коллапсар",
            "role": "mob",
            "hp": 550000,
            "atk": 28000,
            "def": 6800
          },
          {
            "id": "m_nd_3",
            "name": "Апокалиптический Фантом",
            "role": "mob",
            "hp": 650000,
            "atk": 23000,
            "def": 8200
          },
          {
            "id": "e_absolute_avatar",
            "name": "Аватар Абсолюта",
            "role": "elite",
            "hp": 1500000,
            "atk": 42000,
            "def": 14000
          }
        ]
      },
      {
        "name": "Орда (Этаж 4)",
        "kind": "swarm",
        "enemies": [
          {
            "id": "m_nd_1",
            "name": "Нуль-Разрушитель",
            "role": "mob",
            "hp": 600000,
            "atk": 25000,
            "def": 7500
          },
          {
            "id": "m_nd_2",
            "name": "Сингулярный Коллапсар",
            "role": "mob",
            "hp": 550000,
            "atk": 28000,
            "def": 6800
          },
          {
            "id": "m_nd_3",
            "name": "Апокалиптический Фантом",
            "role": "mob",
            "hp": 650000,
            "atk": 23000,
            "def": 8200
          },
          {
            "id": "e_absolute_avatar",
            "name": "Аватар Абсолюта",
            "role": "elite",
            "hp": 1500000,
            "atk": 42000,
            "def": 14000
          }
        ]
      },
      {
        "name": "Ярус 5: Нуль-Измерение",
        "kind": "pack",
        "enemies": [
          {
            "id": "m_nd_1",
            "name": "Нуль-Разрушитель",
            "role": "mob",
            "hp": 600000,
            "atk": 25000,
            "def": 7500
          },
          {
            "id": "m_nd_2",
            "name": "Сингулярный Коллапсар",
            "role": "mob",
            "hp": 550000,
            "atk": 28000,
            "def": 6800
          },
          {
            "id": "m_nd_3",
            "name": "Апокалиптический Фантом",
            "role": "mob",
            "hp": 650000,
            "atk": 23000,
            "def": 8200
          },
          {
            "id": "e_absolute_avatar",
            "name": "Аватар Абсолюта",
            "role": "elite",
            "hp": 1500000,
            "atk": 42000,
            "def": 14000
          }
        ]
      },
      {
        "name": "Ярус 6: Нуль-Измерение",
        "kind": "pack",
        "enemies": [
          {
            "id": "m_nd_1",
            "name": "Нуль-Разрушитель",
            "role": "mob",
            "hp": 600000,
            "atk": 25000,
            "def": 7500
          },
          {
            "id": "m_nd_2",
            "name": "Сингулярный Коллапсар",
            "role": "mob",
            "hp": 550000,
            "atk": 28000,
            "def": 6800
          },
          {
            "id": "m_nd_3",
            "name": "Апокалиптический Фантом",
            "role": "mob",
            "hp": 650000,
            "atk": 23000,
            "def": 8200
          },
          {
            "id": "e_absolute_avatar",
            "name": "Аватар Абсолюта",
            "role": "elite",
            "hp": 1500000,
            "atk": 42000,
            "def": 14000
          }
        ]
      },
      {
        "name": "Ярус 7: Нуль-Измерение",
        "kind": "pack",
        "enemies": [
          {
            "id": "m_nd_1",
            "name": "Нуль-Разрушитель",
            "role": "mob",
            "hp": 600000,
            "atk": 25000,
            "def": 7500
          },
          {
            "id": "m_nd_2",
            "name": "Сингулярный Коллапсар",
            "role": "mob",
            "hp": 550000,
            "atk": 28000,
            "def": 6800
          },
          {
            "id": "m_nd_3",
            "name": "Апокалиптический Фантом",
            "role": "mob",
            "hp": 650000,
            "atk": 23000,
            "def": 8200
          },
          {
            "id": "e_absolute_avatar",
            "name": "Аватар Абсолюта",
            "role": "elite",
            "hp": 1500000,
            "atk": 42000,
            "def": 14000
          }
        ]
      },
      {
        "name": "Орда (Этаж 8)",
        "kind": "swarm",
        "enemies": [
          {
            "id": "m_nd_1",
            "name": "Нуль-Разрушитель",
            "role": "mob",
            "hp": 600000,
            "atk": 25000,
            "def": 7500
          },
          {
            "id": "m_nd_2",
            "name": "Сингулярный Коллапсар",
            "role": "mob",
            "hp": 550000,
            "atk": 28000,
            "def": 6800
          },
          {
            "id": "m_nd_3",
            "name": "Апокалиптический Фантом",
            "role": "mob",
            "hp": 650000,
            "atk": 23000,
            "def": 8200
          },
          {
            "id": "e_absolute_avatar",
            "name": "Аватар Абсолюта",
            "role": "elite",
            "hp": 1500000,
            "atk": 42000,
            "def": 14000
          }
        ]
      },
      {
        "name": "Ярус 9: Нуль-Измерение",
        "kind": "pack",
        "enemies": [
          {
            "id": "m_nd_1",
            "name": "Нуль-Разрушитель",
            "role": "mob",
            "hp": 600000,
            "atk": 25000,
            "def": 7500
          },
          {
            "id": "m_nd_2",
            "name": "Сингулярный Коллапсар",
            "role": "mob",
            "hp": 550000,
            "atk": 28000,
            "def": 6800
          },
          {
            "id": "m_nd_3",
            "name": "Апокалиптический Фантом",
            "role": "mob",
            "hp": 650000,
            "atk": 23000,
            "def": 8200
          },
          {
            "id": "e_absolute_avatar",
            "name": "Аватар Абсолюта",
            "role": "elite",
            "hp": 1500000,
            "atk": 42000,
            "def": 14000
          }
        ]
      },
      {
        "name": "Ярус 10: Нуль-Измерение",
        "kind": "pack",
        "enemies": [
          {
            "id": "m_nd_1",
            "name": "Нуль-Разрушитель",
            "role": "mob",
            "hp": 600000,
            "atk": 25000,
            "def": 7500
          },
          {
            "id": "m_nd_2",
            "name": "Сингулярный Коллапсар",
            "role": "mob",
            "hp": 550000,
            "atk": 28000,
            "def": 6800
          },
          {
            "id": "m_nd_3",
            "name": "Апокалиптический Фантом",
            "role": "mob",
            "hp": 650000,
            "atk": 23000,
            "def": 8200
          },
          {
            "id": "e_absolute_avatar",
            "name": "Аватар Абсолюта",
            "role": "elite",
            "hp": 1500000,
            "atk": 42000,
            "def": 14000
          }
        ]
      },
      {
        "name": "Ярус 11: Нуль-Измерение",
        "kind": "pack",
        "enemies": [
          {
            "id": "m_nd_1",
            "name": "Нуль-Разрушитель",
            "role": "mob",
            "hp": 600000,
            "atk": 25000,
            "def": 7500
          },
          {
            "id": "m_nd_2",
            "name": "Сингулярный Коллапсар",
            "role": "mob",
            "hp": 550000,
            "atk": 28000,
            "def": 6800
          },
          {
            "id": "m_nd_3",
            "name": "Апокалиптический Фантом",
            "role": "mob",
            "hp": 650000,
            "atk": 23000,
            "def": 8200
          },
          {
            "id": "e_absolute_avatar",
            "name": "Аватар Абсолюта",
            "role": "elite",
            "hp": 1500000,
            "atk": 42000,
            "def": 14000
          }
        ]
      },
      {
        "name": "Орда (Этаж 12)",
        "kind": "swarm",
        "enemies": [
          {
            "id": "m_nd_1",
            "name": "Нуль-Разрушитель",
            "role": "mob",
            "hp": 600000,
            "atk": 25000,
            "def": 7500
          },
          {
            "id": "m_nd_2",
            "name": "Сингулярный Коллапсар",
            "role": "mob",
            "hp": 550000,
            "atk": 28000,
            "def": 6800
          },
          {
            "id": "m_nd_3",
            "name": "Апокалиптический Фантом",
            "role": "mob",
            "hp": 650000,
            "atk": 23000,
            "def": 8200
          },
          {
            "id": "e_absolute_avatar",
            "name": "Аватар Абсолюта",
            "role": "elite",
            "hp": 1500000,
            "atk": 42000,
            "def": 14000
          }
        ]
      },
      {
        "name": "Ярус 13: Нуль-Измерение",
        "kind": "pack",
        "enemies": [
          {
            "id": "m_nd_1",
            "name": "Нуль-Разрушитель",
            "role": "mob",
            "hp": 600000,
            "atk": 25000,
            "def": 7500
          },
          {
            "id": "m_nd_2",
            "name": "Сингулярный Коллапсар",
            "role": "mob",
            "hp": 550000,
            "atk": 28000,
            "def": 6800
          },
          {
            "id": "m_nd_3",
            "name": "Апокалиптический Фантом",
            "role": "mob",
            "hp": 650000,
            "atk": 23000,
            "def": 8200
          },
          {
            "id": "e_absolute_avatar",
            "name": "Аватар Абсолюта",
            "role": "elite",
            "hp": 1500000,
            "atk": 42000,
            "def": 14000
          }
        ]
      },
      {
        "name": "Ярус 14: Нуль-Измерение",
        "kind": "pack",
        "enemies": [
          {
            "id": "m_nd_1",
            "name": "Нуль-Разрушитель",
            "role": "mob",
            "hp": 600000,
            "atk": 25000,
            "def": 7500
          },
          {
            "id": "m_nd_2",
            "name": "Сингулярный Коллапсар",
            "role": "mob",
            "hp": 550000,
            "atk": 28000,
            "def": 6800
          },
          {
            "id": "m_nd_3",
            "name": "Апокалиптический Фантом",
            "role": "mob",
            "hp": 650000,
            "atk": 23000,
            "def": 8200
          },
          {
            "id": "e_absolute_avatar",
            "name": "Аватар Абсолюта",
            "role": "elite",
            "hp": 1500000,
            "atk": 42000,
            "def": 14000
          }
        ]
      },
      {
        "name": "Ярус 15: Нуль-Измерение",
        "kind": "pack",
        "enemies": [
          {
            "id": "m_nd_1",
            "name": "Нуль-Разрушитель",
            "role": "mob",
            "hp": 600000,
            "atk": 25000,
            "def": 7500
          },
          {
            "id": "m_nd_2",
            "name": "Сингулярный Коллапсар",
            "role": "mob",
            "hp": 550000,
            "atk": 28000,
            "def": 6800
          },
          {
            "id": "m_nd_3",
            "name": "Апокалиптический Фантом",
            "role": "mob",
            "hp": 650000,
            "atk": 23000,
            "def": 8200
          },
          {
            "id": "e_absolute_avatar",
            "name": "Аватар Абсолюта",
            "role": "elite",
            "hp": 1500000,
            "atk": 42000,
            "def": 14000
          }
        ]
      },
      {
        "name": "Ярус 16: Нуль-Измерение",
        "kind": "pack",
        "enemies": [
          {
            "id": "m_nd_1",
            "name": "Нуль-Разрушитель",
            "role": "mob",
            "hp": 600000,
            "atk": 25000,
            "def": 7500
          },
          {
            "id": "m_nd_2",
            "name": "Сингулярный Коллапсар",
            "role": "mob",
            "hp": 550000,
            "atk": 28000,
            "def": 6800
          },
          {
            "id": "m_nd_3",
            "name": "Апокалиптический Фантом",
            "role": "mob",
            "hp": 650000,
            "atk": 23000,
            "def": 8200
          },
          {
            "id": "e_absolute_avatar",
            "name": "Аватар Абсолюта",
            "role": "elite",
            "hp": 1500000,
            "atk": 42000,
            "def": 14000
          }
        ]
      },
      {
        "name": "Ярус 17: Нуль-Измерение",
        "kind": "pack",
        "enemies": [
          {
            "id": "m_nd_1",
            "name": "Нуль-Разрушитель",
            "role": "mob",
            "hp": 600000,
            "atk": 25000,
            "def": 7500
          },
          {
            "id": "m_nd_2",
            "name": "Сингулярный Коллапсар",
            "role": "mob",
            "hp": 550000,
            "atk": 28000,
            "def": 6800
          },
          {
            "id": "m_nd_3",
            "name": "Апокалиптический Фантом",
            "role": "mob",
            "hp": 650000,
            "atk": 23000,
            "def": 8200
          },
          {
            "id": "e_absolute_avatar",
            "name": "Аватар Абсолюта",
            "role": "elite",
            "hp": 1500000,
            "atk": 42000,
            "def": 14000
          }
        ]
      },
      {
        "name": "Ярус 18: Нуль-Измерение",
        "kind": "pack",
        "enemies": [
          {
            "id": "m_nd_1",
            "name": "Нуль-Разрушитель",
            "role": "mob",
            "hp": 600000,
            "atk": 25000,
            "def": 7500
          },
          {
            "id": "m_nd_2",
            "name": "Сингулярный Коллапсар",
            "role": "mob",
            "hp": 550000,
            "atk": 28000,
            "def": 6800
          },
          {
            "id": "m_nd_3",
            "name": "Апокалиптический Фантом",
            "role": "mob",
            "hp": 650000,
            "atk": 23000,
            "def": 8200
          },
          {
            "id": "e_absolute_avatar",
            "name": "Аватар Абсолюта",
            "role": "elite",
            "hp": 1500000,
            "atk": 42000,
            "def": 14000
          }
        ]
      },
      {
        "name": "Ярус 19: Нуль-Измерение",
        "kind": "pack",
        "enemies": [
          {
            "id": "m_nd_1",
            "name": "Нуль-Разрушитель",
            "role": "mob",
            "hp": 600000,
            "atk": 25000,
            "def": 7500
          },
          {
            "id": "m_nd_2",
            "name": "Сингулярный Коллапсар",
            "role": "mob",
            "hp": 550000,
            "atk": 28000,
            "def": 6800
          },
          {
            "id": "m_nd_3",
            "name": "Апокалиптический Фантом",
            "role": "mob",
            "hp": 650000,
            "atk": 23000,
            "def": 8200
          },
          {
            "id": "e_absolute_avatar",
            "name": "Аватар Абсолюта",
            "role": "elite",
            "hp": 1500000,
            "atk": 42000,
            "def": 14000
          }
        ]
      },
      {
        "name": "Чертог Владыки (Этаж 20)",
        "kind": "boss",
        "enemies": [
          {
            "id": "b_absolute_creator",
            "name": "Архитектор Бытия",
            "role": "boss",
            "hp": 6000000,
            "atk": 65000,
            "def": 22000
          },
          {
            "id": "m_nd_1_throne",
            "name": "Страж Трона",
            "role": "mob",
            "hp": 600000,
            "atk": 25000,
            "def": 7500
          }
        ]
      }
    ],
    "items": [
      {
        "name": "Клинок Первородного Ничто",
        "slot": "weapon"
      },
      {
        "name": "Жезл Абсолютного Замысла",
        "slot": "weapon"
      },
      {
        "name": "Одеяние Архитектора",
        "slot": "armor"
      },
      {
        "name": "Корона Создателя",
        "slot": "helm"
      },
      {
        "name": "Поступь Запределья",
        "slot": "boots"
      },
      {
        "name": "Наручи Нулевой Точки",
        "slot": "bracers"
      },
      {
        "name": "Амулет Первопричины",
        "slot": "amulet"
      },
      {
        "name": "Кольцо Сингулярности Бытия",
        "slot": "ring"
      },
      {
        "name": "Плащ Чистой Энтропии",
        "slot": "cloak"
      },
      {
        "name": "Пояс Создателя Миров",
        "slot": "belt"
      },
      {
        "name": "Реликвия Абсолюта",
        "slot": "relic"
      }
    ]
  }
];

export const SW_QUESTS: SwQuest[] = [
  {
    "id": "sq_0",
    "title": "Пролог: Испытание Замка",
    "desc": "Победите Теневого Стража.",
    "targetId": "b_shadow_guard"
  },
  {
    "id": "sq_0b",
    "title": "Глава I: Безопасный Тракт",
    "desc": "Одолейте Атамана Мародёров.",
    "targetId": "b_bandit_leader"
  },
  {
    "id": "sq_0c",
    "title": "Глава II: Очищение Топей",
    "desc": "Уничтожьте Болотный Ужас.",
    "targetId": "b_swamp_horror"
  },
  {
    "id": "sq_1",
    "title": "Глава III: Эхо Катакомб",
    "desc": "Сразите Чёрного Жнеца.",
    "targetId": "b_reaper"
  },
  {
    "id": "sq_storm",
    "title": "Глава IV: Владыка Бурь",
    "desc": "Покорите Башню Шторма.",
    "targetId": "b_raijin"
  },
  {
    "id": "sq_soul",
    "title": "Глава V: Забвение Душ",
    "desc": "Сразите Танатоса.",
    "targetId": "b_thanatos"
  },
  {
    "id": "sq_chaos",
    "title": "Глава VI: Пламя Хаоса",
    "desc": "Победите Суртура.",
    "targetId": "b_surtur"
  },
  {
    "id": "sq_abyss",
    "title": "Глава VII: Левиафан Бездны",
    "desc": "Победите Левиафана.",
    "targetId": "b_kraken"
  },
  {
    "id": "sq_5",
    "title": "Глава VIII: Сбой Антиматрицы",
    "desc": "Уничтожьте Творца Искажения.",
    "targetId": "b_matrix"
  },
  {
    "id": "sq_vr",
    "title": "Глава IX: Разлом Тьмы",
    "desc": "Победите Азатота.",
    "targetId": "b_void_walker"
  },
  {
    "id": "sq_bc",
    "title": "Глава X: Королева Кармилла",
    "desc": "Одолейте Кармиллу.",
    "targetId": "b_carmilla"
  },
  {
    "id": "sq_sc",
    "title": "Глава XI: Спектральный Понтифик",
    "desc": "Свергните Понтифика.",
    "targetId": "b_specter_pope"
  },
  {
    "id": "sq_tc",
    "title": "Глава XII: Титан Атлас",
    "desc": "Сразите Атласа.",
    "targetId": "b_atlas"
  },
  {
    "id": "sq_as",
    "title": "Глава XIII: Демиург Селестия",
    "desc": "Победите Селестию.",
    "targetId": "b_astral_demiurge"
  },
  {
    "id": "sq_od",
    "title": "Глава XIV: Энтропия Небытия",
    "desc": "Уничтожьте Энтропию.",
    "targetId": "b_oblivion_lord"
  },
  {
    "id": "sq_ce",
    "title": "Глава XV: Хронос Прайм",
    "desc": "Остановите Хроноса.",
    "targetId": "b_chronos_prime"
  },
  {
    "id": "sq_nd",
    "title": "ФИНАЛ: Архитектор Бытия",
    "desc": "Сразите Абсолютного Архитектора!",
    "targetId": "b_absolute_creator"
  }
];

export const SW_MODES: Record<string, number> = {"arena":5,"duel":10,"horde":15,"abyss":20,"bossrush":25,"purgatory":35,"demiurge":80};

export const SW_FLOORS: SwFloor[] = [{"n":1,"sw":"dungeon_intro_1","dungeon":1,"stage":1,"stagesInDungeon":3,"name":"Сектор Мишеней","dungeonName":"Подвалы Старого Замка","desc":"Заброшенные тренировочные подвалы замка, где хранятся первые реликвии павших стражей.","wave":["Сектор Мишеней","Оживленный Манекен","Оживленный Манекен"],"tint":"#4a3034","ember":"#ff8a50","mob":"Оживленный Манекен","general":"Оживленный Манекен","boss":"Оживленный Манекен","bossTitle":"в файле нет босса: этап закрывается толпой","goal":"pack","srcHp":35,"srcAtk":7,"file":"public/shadow-world/js/dungeons/01_intro_castle.js","gSig":"circle","bSig":"line","gRow":35,"bRow":41,"mobRows":[6,2,18],"minLvl":1,"mut":0,"xp":55,"spawnGeneral":0},{"n":2,"sw":"dungeon_intro_1","dungeon":1,"stage":2,"stagesInDungeon":3,"name":"Оружейный зал","dungeonName":"Подвалы Старого Замка","desc":"Заброшенные тренировочные подвалы замка, где хранятся первые реликвии павших стражей.","wave":["Оружейный зал","Теневой Страж","Теневой Страж"],"tint":"#4a3034","ember":"#ff8a50","mob":"Теневой Страж","general":"Теневой Страж","boss":"Теневой Страж","bossTitle":"босс этапа из файла данжа","goal":"boss","srcHp":140,"srcAtk":16,"file":"public/shadow-world/js/dungeons/01_intro_castle.js","gSig":"circle","bSig":"line","gRow":35,"bRow":41,"mobRows":[6,2,18],"minLvl":1,"mut":0,"xp":55,"spawnGeneral":0,"story":"sq_0"},{"n":3,"sw":"dungeon_intro_1","dungeon":1,"stage":3,"stagesInDungeon":3,"name":"Сокровищница Гарнизона","dungeonName":"Подвалы Старого Замка","desc":"Заброшенные тренировочные подвалы замка, где хранятся первые реликвии павших стражей.","wave":["Сокровищница Гарнизона","Осколок Командира","Осколок Командира"],"tint":"#4a3034","ember":"#ff8a50","mob":"Осколок Командира","general":"Осколок Командира","boss":"Осколок Командира","bossTitle":"элита этапа, отдельного босса в файле нет","goal":"elite","srcHp":180,"srcAtk":20,"file":"public/shadow-world/js/dungeons/01_intro_castle.js","gSig":"circle","bSig":"line","gRow":35,"bRow":41,"mobRows":[6,2,18],"minLvl":1,"mut":0,"xp":55,"spawnGeneral":0},{"n":4,"sw":"dungeon_intro_2","dungeon":2,"stage":1,"stagesInDungeon":3,"name":"Застава на тракте","dungeonName":"Заброшенный Тракт Альказака","desc":"Опасные горные тракты, захваченные бандами безжалостных мародёров и дезертиров.","wave":["Застава на тракте","Бандит-Дозорный","Бандит-Дозорный"],"tint":"#4a3828","ember":"#ffb060","mob":"Бандит-Дозорный","general":"Бандит-Дозорный","boss":"Бандит-Дозорный","bossTitle":"в файле нет босса: этап закрывается толпой","goal":"pack","srcHp":45,"srcAtk":10,"file":"public/shadow-world/js/dungeons/02_intro_road.js","gSig":"cone","bSig":"curse","gRow":34,"bRow":54,"mobRows":[26,4,32],"minLvl":2,"mut":0,"xp":55,"spawnGeneral":0},{"n":5,"sw":"dungeon_intro_2","dungeon":2,"stage":2,"stagesInDungeon":3,"name":"Засада в ущелье","dungeonName":"Заброшенный Тракт Альказака","desc":"Опасные горные тракты, захваченные бандами безжалостных мародёров и дезертиров.","wave":["Засада в ущелье","Разбойник-Арбалетчик","Наёмник-Головорез"],"tint":"#4a3828","ember":"#ffb060","mob":"Разбойник-Арбалетчик","general":"Разбойник-Арбалетчик","boss":"Наёмник-Головорез","bossTitle":"элита этапа, отдельного босса в файле нет","goal":"elite","srcHp":95,"srcAtk":16,"file":"public/shadow-world/js/dungeons/02_intro_road.js","gSig":"cone","bSig":"curse","gRow":34,"bRow":54,"mobRows":[26,4,32],"minLvl":2,"mut":0,"xp":55,"spawnGeneral":0},{"n":6,"sw":"dungeon_intro_2","dungeon":2,"stage":3,"stagesInDungeon":3,"name":"Лагерь Атамана","dungeonName":"Заброшенный Тракт Альказака","desc":"Опасные горные тракты, захваченные бандами безжалостных мародёров и дезертиров.","wave":["Лагерь Атамана","Атаман Мародёров","Атаман Мародёров"],"tint":"#4a3828","ember":"#ffb060","mob":"Атаман Мародёров","general":"Атаман Мародёров","boss":"Атаман Мародёров","bossTitle":"босс этапа из файла данжа","goal":"boss","srcHp":200,"srcAtk":22,"file":"public/shadow-world/js/dungeons/02_intro_road.js","gSig":"cone","bSig":"curse","gRow":34,"bRow":54,"mobRows":[26,4,32],"minLvl":2,"mut":0,"xp":1272,"spawnGeneral":0,"story":"sq_0b"},{"n":7,"sw":"dungeon_intro_3","dungeon":3,"stage":1,"stagesInDungeon":3,"name":"Мерцающие Гроты","dungeonName":"Хрустальные Пещеры","desc":"Мерцающие подземелья, наполненные кристальной магией и опасными агрессивными созданиями.","wave":["Мерцающие Гроты","Кристальная Летучая Мышь","Кристальная Летучая Мышь"],"tint":"#24344a","ember":"#9ad7ff","mob":"Кристальная Летучая Мышь","general":"Кристальная Летучая Мышь","boss":"Кристальная Летучая Мышь","bossTitle":"в файле нет босса: этап закрывается толпой","goal":"pack","srcHp":70,"srcAtk":18,"file":"public/shadow-world/js/dungeons/03_intro_swamp.js","gSig":"line","bSig":"summon","gRow":30,"bRow":11,"mobRows":[0,27,29],"minLvl":6,"mut":0,"xp":55,"spawnGeneral":0},{"n":8,"sw":"dungeon_intro_3","dungeon":3,"stage":2,"stagesInDungeon":3,"name":"Зал Осколков","dungeonName":"Хрустальные Пещеры","desc":"Мерцающие подземелья, наполненные кристальной магией и опасными агрессивными созданиями.","wave":["Зал Осколков","Кристальный Страж","Кристальный Страж"],"tint":"#24344a","ember":"#9ad7ff","mob":"Кристальный Страж","general":"Кристальный Страж","boss":"Кристальный Страж","bossTitle":"элита этапа, отдельного босса в файле нет","goal":"elite","srcHp":150,"srcAtk":25,"file":"public/shadow-world/js/dungeons/03_intro_swamp.js","gSig":"line","bSig":"summon","gRow":30,"bRow":11,"mobRows":[0,27,29],"minLvl":6,"mut":0,"xp":55,"spawnGeneral":0},{"n":9,"sw":"dungeon_intro_3","dungeon":3,"stage":3,"stagesInDungeon":3,"name":"Сердце Жеоды","dungeonName":"Хрустальные Пещеры","desc":"Мерцающие подземелья, наполненные кристальной магией и опасными агрессивными созданиями.","wave":["Сердце Жеоды","Кристальная Владычица","Кристальная Владычица"],"tint":"#24344a","ember":"#9ad7ff","mob":"Кристальная Владычица","general":"Кристальная Владычица","boss":"Кристальная Владычица","bossTitle":"босс этапа из файла данжа","goal":"boss","srcHp":320,"srcAtk":32,"file":"public/shadow-world/js/dungeons/03_intro_swamp.js","gSig":"line","bSig":"summon","gRow":30,"bRow":11,"mobRows":[0,27,29],"minLvl":6,"mut":0,"xp":672,"spawnGeneral":0},{"n":10,"sw":"dungeon_1","dungeon":4,"stage":1,"stagesInDungeon":3,"name":"Гниющие Коридоры","dungeonName":"Катакомбы Скорби","desc":"Мрачные заброшенные склепы, где покоятся павшие короли и бродят беспокойные мертвецы.","wave":["Гниющие Коридоры","Падший Воин","Падший Воин"],"tint":"#322838","ember":"#c9b6ff","mob":"Падший Воин","general":"Падший Воин","boss":"Падший Воин","bossTitle":"в файле нет босса: этап закрывается толпой","goal":"pack","srcHp":90,"srcAtk":22,"file":"public/shadow-world/js/dungeons/04_catacombs.js","gSig":"curse","bSig":"circle","gRow":28,"bRow":48,"mobRows":[28,25,31],"minLvl":7,"mut":0,"xp":55,"spawnGeneral":0},{"n":11,"sw":"dungeon_1","dungeon":4,"stage":2,"stagesInDungeon":3,"name":"Зал Усыпальниц","dungeonName":"Катакомбы Скорби","desc":"Мрачные заброшенные склепы, где покоятся павшие короли и бродят беспокойные мертвецы.","wave":["Зал Усыпальниц","Некромант-Отступник","Могильный Упырь"],"tint":"#322838","ember":"#c9b6ff","mob":"Некромант-Отступник","general":"Некромант-Отступник","boss":"Могильный Упырь","bossTitle":"элита этапа, отдельного босса в файле нет","goal":"elite","srcHp":190,"srcAtk":35,"file":"public/shadow-world/js/dungeons/04_catacombs.js","gSig":"curse","bSig":"circle","gRow":28,"bRow":48,"mobRows":[28,25,31],"minLvl":7,"mut":0,"xp":55,"spawnGeneral":0},{"n":12,"sw":"dungeon_1","dungeon":4,"stage":3,"stagesInDungeon":3,"name":"Трон Праха","dungeonName":"Катакомбы Скорби","desc":"Мрачные заброшенные склепы, где покоятся павшие короли и бродят беспокойные мертвецы.","wave":["Трон Праха","Чёрный Жнец","Чёрный Жнец"],"tint":"#322838","ember":"#c9b6ff","mob":"Чёрный Жнец","general":"Чёрный Жнец","boss":"Чёрный Жнец","bossTitle":"босс этапа из файла данжа","goal":"boss","srcHp":550,"srcAtk":50,"file":"public/shadow-world/js/dungeons/04_catacombs.js","gSig":"curse","bSig":"circle","gRow":28,"bRow":48,"mobRows":[28,25,31],"minLvl":7,"mut":0,"xp":3070,"spawnGeneral":0,"story":"sq_1"},{"n":13,"sw":"dungeon_storm_tower","dungeon":5,"stage":1,"stagesInDungeon":12,"name":"Ярус 1: Шторм","dungeonName":"Башня Бесконечного Шторма","desc":"Высотный шпиль бури, где каждый этаж испытывает силу героя на прочность под непрекращающимися ударами молний.","wave":["Ярус 1: Шторм","Грозовой Дух","Грозовой Дух"],"tint":"#243044","ember":"#d0e6ff","mob":"Грозовой Дух","general":"Грозовой Дух","boss":"Грозовой Дух","bossTitle":"в файле нет босса: этап закрывается толпой","goal":"pack","srcHp":280,"srcAtk":52,"file":"public/shadow-world/js/dungeons/05_storm_tower.js","gSig":"summon","bSig":"cone","gRow":39,"bRow":42,"mobRows":[46,3,38],"minLvl":10,"mut":0,"xp":55,"spawnGeneral":0},{"n":14,"sw":"dungeon_storm_tower","dungeon":5,"stage":2,"stagesInDungeon":12,"name":"Ярус 2: Шторм","dungeonName":"Башня Бесконечного Шторма","desc":"Высотный шпиль бури, где каждый этаж испытывает силу героя на прочность под непрекращающимися ударами молний.","wave":["Ярус 2: Шторм","Грозовой Дух","Грозовой Дух"],"tint":"#243044","ember":"#d0e6ff","mob":"Грозовой Дух","general":"Грозовой Дух","boss":"Грозовой Дух","bossTitle":"в файле нет босса: этап закрывается толпой","goal":"pack","srcHp":280,"srcAtk":52,"file":"public/shadow-world/js/dungeons/05_storm_tower.js","gSig":"summon","bSig":"cone","gRow":39,"bRow":42,"mobRows":[46,3,38],"minLvl":10,"mut":0,"xp":55,"spawnGeneral":0},{"n":15,"sw":"dungeon_storm_tower","dungeon":5,"stage":3,"stagesInDungeon":12,"name":"Ярус 3: Шторм","dungeonName":"Башня Бесконечного Шторма","desc":"Высотный шпиль бури, где каждый этаж испытывает силу героя на прочность под непрекращающимися ударами молний.","wave":["Ярус 3: Шторм","Грозовой Дух","Грозовой Дух"],"tint":"#243044","ember":"#d0e6ff","mob":"Грозовой Дух","general":"Грозовой Дух","boss":"Грозовой Дух","bossTitle":"в файле нет босса: этап закрывается толпой","goal":"pack","srcHp":280,"srcAtk":52,"file":"public/shadow-world/js/dungeons/05_storm_tower.js","gSig":"summon","bSig":"cone","gRow":39,"bRow":42,"mobRows":[46,3,38],"minLvl":10,"mut":0,"xp":55,"spawnGeneral":0},{"n":16,"sw":"dungeon_storm_tower","dungeon":5,"stage":4,"stagesInDungeon":12,"name":"Орда (Этаж 4)","dungeonName":"Башня Бесконечного Шторма","desc":"Высотный шпиль бури, где каждый этаж испытывает силу героя на прочность под непрекращающимися ударами молний.","wave":["Орда (Этаж 4)","Грозовой Дух","Громовержец"],"tint":"#243044","ember":"#d0e6ff","mob":"Грозовой Дух","general":"Грозовой Дух","boss":"Громовержец","bossTitle":"элита этапа, отдельного босса в файле нет","goal":"elite","srcHp":280,"srcAtk":52,"file":"public/shadow-world/js/dungeons/05_storm_tower.js","gSig":"summon","bSig":"cone","gRow":39,"bRow":42,"mobRows":[46,3,38],"minLvl":10,"mut":0,"xp":55,"spawnGeneral":0},{"n":17,"sw":"dungeon_storm_tower","dungeon":5,"stage":5,"stagesInDungeon":12,"name":"Ярус 5: Шторм","dungeonName":"Башня Бесконечного Шторма","desc":"Высотный шпиль бури, где каждый этаж испытывает силу героя на прочность под непрекращающимися ударами молний.","wave":["Ярус 5: Шторм","Грозовой Дух","Грозовой Дух"],"tint":"#243044","ember":"#d0e6ff","mob":"Грозовой Дух","general":"Грозовой Дух","boss":"Грозовой Дух","bossTitle":"в файле нет босса: этап закрывается толпой","goal":"pack","srcHp":280,"srcAtk":52,"file":"public/shadow-world/js/dungeons/05_storm_tower.js","gSig":"summon","bSig":"cone","gRow":39,"bRow":42,"mobRows":[46,3,38],"minLvl":10,"mut":0,"xp":55,"spawnGeneral":0},{"n":18,"sw":"dungeon_storm_tower","dungeon":5,"stage":6,"stagesInDungeon":12,"name":"Ярус 6: Шторм","dungeonName":"Башня Бесконечного Шторма","desc":"Высотный шпиль бури, где каждый этаж испытывает силу героя на прочность под непрекращающимися ударами молний.","wave":["Ярус 6: Шторм","Грозовой Дух","Грозовой Дух"],"tint":"#243044","ember":"#d0e6ff","mob":"Грозовой Дух","general":"Грозовой Дух","boss":"Грозовой Дух","bossTitle":"в файле нет босса: этап закрывается толпой","goal":"pack","srcHp":280,"srcAtk":52,"file":"public/shadow-world/js/dungeons/05_storm_tower.js","gSig":"summon","bSig":"cone","gRow":39,"bRow":42,"mobRows":[46,3,38],"minLvl":10,"mut":0,"xp":55,"spawnGeneral":0},{"n":19,"sw":"dungeon_storm_tower","dungeon":5,"stage":7,"stagesInDungeon":12,"name":"Ярус 7: Шторм","dungeonName":"Башня Бесконечного Шторма","desc":"Высотный шпиль бури, где каждый этаж испытывает силу героя на прочность под непрекращающимися ударами молний.","wave":["Ярус 7: Шторм","Грозовой Дух","Грозовой Дух"],"tint":"#243044","ember":"#d0e6ff","mob":"Грозовой Дух","general":"Грозовой Дух","boss":"Грозовой Дух","bossTitle":"в файле нет босса: этап закрывается толпой","goal":"pack","srcHp":280,"srcAtk":52,"file":"public/shadow-world/js/dungeons/05_storm_tower.js","gSig":"summon","bSig":"cone","gRow":39,"bRow":42,"mobRows":[46,3,38],"minLvl":10,"mut":0,"xp":55,"spawnGeneral":0},{"n":20,"sw":"dungeon_storm_tower","dungeon":5,"stage":8,"stagesInDungeon":12,"name":"Орда (Этаж 8)","dungeonName":"Башня Бесконечного Шторма","desc":"Высотный шпиль бури, где каждый этаж испытывает силу героя на прочность под непрекращающимися ударами молний.","wave":["Орда (Этаж 8)","Грозовой Дух","Громовержец"],"tint":"#243044","ember":"#d0e6ff","mob":"Грозовой Дух","general":"Грозовой Дух","boss":"Громовержец","bossTitle":"элита этапа, отдельного босса в файле нет","goal":"elite","srcHp":280,"srcAtk":52,"file":"public/shadow-world/js/dungeons/05_storm_tower.js","gSig":"summon","bSig":"cone","gRow":39,"bRow":42,"mobRows":[46,3,38],"minLvl":10,"mut":0,"xp":55,"spawnGeneral":0},{"n":21,"sw":"dungeon_storm_tower","dungeon":5,"stage":9,"stagesInDungeon":12,"name":"Ярус 9: Шторм","dungeonName":"Башня Бесконечного Шторма","desc":"Высотный шпиль бури, где каждый этаж испытывает силу героя на прочность под непрекращающимися ударами молний.","wave":["Ярус 9: Шторм","Грозовой Дух","Грозовой Дух"],"tint":"#243044","ember":"#d0e6ff","mob":"Грозовой Дух","general":"Грозовой Дух","boss":"Грозовой Дух","bossTitle":"в файле нет босса: этап закрывается толпой","goal":"pack","srcHp":280,"srcAtk":52,"file":"public/shadow-world/js/dungeons/05_storm_tower.js","gSig":"summon","bSig":"cone","gRow":39,"bRow":42,"mobRows":[46,3,38],"minLvl":10,"mut":0,"xp":55,"spawnGeneral":0},{"n":22,"sw":"dungeon_storm_tower","dungeon":5,"stage":10,"stagesInDungeon":12,"name":"Ярус 10: Шторм","dungeonName":"Башня Бесконечного Шторма","desc":"Высотный шпиль бури, где каждый этаж испытывает силу героя на прочность под непрекращающимися ударами молний.","wave":["Ярус 10: Шторм","Грозовой Дух","Грозовой Дух"],"tint":"#243044","ember":"#d0e6ff","mob":"Грозовой Дух","general":"Грозовой Дух","boss":"Грозовой Дух","bossTitle":"в файле нет босса: этап закрывается толпой","goal":"pack","srcHp":280,"srcAtk":52,"file":"public/shadow-world/js/dungeons/05_storm_tower.js","gSig":"summon","bSig":"cone","gRow":39,"bRow":42,"mobRows":[46,3,38],"minLvl":10,"mut":0,"xp":55,"spawnGeneral":0},{"n":23,"sw":"dungeon_storm_tower","dungeon":5,"stage":11,"stagesInDungeon":12,"name":"Ярус 11: Шторм","dungeonName":"Башня Бесконечного Шторма","desc":"Высотный шпиль бури, где каждый этаж испытывает силу героя на прочность под непрекращающимися ударами молний.","wave":["Ярус 11: Шторм","Грозовой Дух","Грозовой Дух"],"tint":"#243044","ember":"#d0e6ff","mob":"Грозовой Дух","general":"Грозовой Дух","boss":"Грозовой Дух","bossTitle":"в файле нет босса: этап закрывается толпой","goal":"pack","srcHp":280,"srcAtk":52,"file":"public/shadow-world/js/dungeons/05_storm_tower.js","gSig":"summon","bSig":"cone","gRow":39,"bRow":42,"mobRows":[46,3,38],"minLvl":10,"mut":0,"xp":55,"spawnGeneral":0},{"n":24,"sw":"dungeon_storm_tower","dungeon":5,"stage":12,"stagesInDungeon":12,"name":"Чертог Владыки (Этаж 12)","dungeonName":"Башня Бесконечного Шторма","desc":"Высотный шпиль бури, где каждый этаж испытывает силу героя на прочность под непрекращающимися ударами молний.","wave":["Чертог Владыки (Этаж 12)","Страж Трона","Повелитель Бурь Райдзин"],"tint":"#243044","ember":"#d0e6ff","mob":"Страж Трона","general":"Страж Трона","boss":"Повелитель Бурь Райдзин","bossTitle":"босс этапа из файла данжа","goal":"boss","srcHp":1100,"srcAtk":75,"file":"public/shadow-world/js/dungeons/05_storm_tower.js","gSig":"summon","bSig":"cone","gRow":39,"bRow":42,"mobRows":[46,3,38],"minLvl":10,"mut":1,"xp":24464,"spawnGeneral":1,"story":"sq_storm"},{"n":25,"sw":"dungeon_soul_labyrinth","dungeon":6,"stage":1,"stagesInDungeon":14,"name":"Ярус 1: Лабиринт Хаоса","dungeonName":"Лабиринт Забытых Душ","desc":"Хаотичный призрачный лабиринт, где реальность искажена, а коридоры полны безумия и неупокоенных орд.","wave":["Ярус 1: Лабиринт Хаоса","Блуждающий Призрак","Блуждающий Призрак"],"tint":"#241430","ember":"#e7b6ff","mob":"Блуждающий Призрак","general":"Блуждающий Призрак","boss":"Блуждающий Призрак","bossTitle":"в файле нет босса: этап закрывается толпой","goal":"pack","srcHp":600,"srcAtk":110,"file":"public/shadow-world/js/dungeons/06_soul_labyrinth.js","gSig":"circle","bSig":"line","gRow":51,"bRow":57,"mobRows":[1,44,22],"minLvl":20,"mut":0,"xp":55,"spawnGeneral":0},{"n":26,"sw":"dungeon_soul_labyrinth","dungeon":6,"stage":2,"stagesInDungeon":14,"name":"Ярус 2: Лабиринт Хаоса","dungeonName":"Лабиринт Забытых Душ","desc":"Хаотичный призрачный лабиринт, где реальность искажена, а коридоры полны безумия и неупокоенных орд.","wave":["Ярус 2: Лабиринт Хаоса","Блуждающий Призрак","Блуждающий Призрак"],"tint":"#241430","ember":"#e7b6ff","mob":"Блуждающий Призрак","general":"Блуждающий Призрак","boss":"Блуждающий Призрак","bossTitle":"в файле нет босса: этап закрывается толпой","goal":"pack","srcHp":600,"srcAtk":110,"file":"public/shadow-world/js/dungeons/06_soul_labyrinth.js","gSig":"circle","bSig":"line","gRow":51,"bRow":57,"mobRows":[1,44,22],"minLvl":20,"mut":0,"xp":55,"spawnGeneral":0},{"n":27,"sw":"dungeon_soul_labyrinth","dungeon":6,"stage":3,"stagesInDungeon":14,"name":"Ярус 3: Лабиринт Хаоса","dungeonName":"Лабиринт Забытых Душ","desc":"Хаотичный призрачный лабиринт, где реальность искажена, а коридоры полны безумия и неупокоенных орд.","wave":["Ярус 3: Лабиринт Хаоса","Блуждающий Призрак","Блуждающий Призрак"],"tint":"#241430","ember":"#e7b6ff","mob":"Блуждающий Призрак","general":"Блуждающий Призрак","boss":"Блуждающий Призрак","bossTitle":"в файле нет босса: этап закрывается толпой","goal":"pack","srcHp":600,"srcAtk":110,"file":"public/shadow-world/js/dungeons/06_soul_labyrinth.js","gSig":"circle","bSig":"line","gRow":51,"bRow":57,"mobRows":[1,44,22],"minLvl":20,"mut":0,"xp":55,"spawnGeneral":0},{"n":28,"sw":"dungeon_soul_labyrinth","dungeon":6,"stage":4,"stagesInDungeon":14,"name":"Орда (Этаж 4)","dungeonName":"Лабиринт Забытых Душ","desc":"Хаотичный призрачный лабиринт, где реальность искажена, а коридоры полны безумия и неупокоенных орд.","wave":["Орда (Этаж 4)","Блуждающий Призрак","Пожиратель Сущностей"],"tint":"#241430","ember":"#e7b6ff","mob":"Блуждающий Призрак","general":"Блуждающий Призрак","boss":"Пожиратель Сущностей","bossTitle":"элита этапа, отдельного босса в файле нет","goal":"elite","srcHp":600,"srcAtk":110,"file":"public/shadow-world/js/dungeons/06_soul_labyrinth.js","gSig":"circle","bSig":"line","gRow":51,"bRow":57,"mobRows":[1,44,22],"minLvl":20,"mut":0,"xp":55,"spawnGeneral":0},{"n":29,"sw":"dungeon_soul_labyrinth","dungeon":6,"stage":5,"stagesInDungeon":14,"name":"Ярус 5: Лабиринт Хаоса","dungeonName":"Лабиринт Забытых Душ","desc":"Хаотичный призрачный лабиринт, где реальность искажена, а коридоры полны безумия и неупокоенных орд.","wave":["Ярус 5: Лабиринт Хаоса","Блуждающий Призрак","Блуждающий Призрак"],"tint":"#241430","ember":"#e7b6ff","mob":"Блуждающий Призрак","general":"Блуждающий Призрак","boss":"Блуждающий Призрак","bossTitle":"в файле нет босса: этап закрывается толпой","goal":"pack","srcHp":600,"srcAtk":110,"file":"public/shadow-world/js/dungeons/06_soul_labyrinth.js","gSig":"circle","bSig":"line","gRow":51,"bRow":57,"mobRows":[1,44,22],"minLvl":20,"mut":0,"xp":55,"spawnGeneral":0},{"n":30,"sw":"dungeon_soul_labyrinth","dungeon":6,"stage":6,"stagesInDungeon":14,"name":"Ярус 6: Лабиринт Хаоса","dungeonName":"Лабиринт Забытых Душ","desc":"Хаотичный призрачный лабиринт, где реальность искажена, а коридоры полны безумия и неупокоенных орд.","wave":["Ярус 6: Лабиринт Хаоса","Блуждающий Призрак","Блуждающий Призрак"],"tint":"#241430","ember":"#e7b6ff","mob":"Блуждающий Призрак","general":"Блуждающий Призрак","boss":"Блуждающий Призрак","bossTitle":"в файле нет босса: этап закрывается толпой","goal":"pack","srcHp":600,"srcAtk":110,"file":"public/shadow-world/js/dungeons/06_soul_labyrinth.js","gSig":"circle","bSig":"line","gRow":51,"bRow":57,"mobRows":[1,44,22],"minLvl":20,"mut":0,"xp":55,"spawnGeneral":0},{"n":31,"sw":"dungeon_soul_labyrinth","dungeon":6,"stage":7,"stagesInDungeon":14,"name":"Ярус 7: Лабиринт Хаоса","dungeonName":"Лабиринт Забытых Душ","desc":"Хаотичный призрачный лабиринт, где реальность искажена, а коридоры полны безумия и неупокоенных орд.","wave":["Ярус 7: Лабиринт Хаоса","Блуждающий Призрак","Блуждающий Призрак"],"tint":"#241430","ember":"#e7b6ff","mob":"Блуждающий Призрак","general":"Блуждающий Призрак","boss":"Блуждающий Призрак","bossTitle":"в файле нет босса: этап закрывается толпой","goal":"pack","srcHp":600,"srcAtk":110,"file":"public/shadow-world/js/dungeons/06_soul_labyrinth.js","gSig":"circle","bSig":"line","gRow":51,"bRow":57,"mobRows":[1,44,22],"minLvl":20,"mut":0,"xp":55,"spawnGeneral":0},{"n":32,"sw":"dungeon_soul_labyrinth","dungeon":6,"stage":8,"stagesInDungeon":14,"name":"Орда (Этаж 8)","dungeonName":"Лабиринт Забытых Душ","desc":"Хаотичный призрачный лабиринт, где реальность искажена, а коридоры полны безумия и неупокоенных орд.","wave":["Орда (Этаж 8)","Блуждающий Призрак","Пожиратель Сущностей"],"tint":"#241430","ember":"#e7b6ff","mob":"Блуждающий Призрак","general":"Блуждающий Призрак","boss":"Пожиратель Сущностей","bossTitle":"элита этапа, отдельного босса в файле нет","goal":"elite","srcHp":600,"srcAtk":110,"file":"public/shadow-world/js/dungeons/06_soul_labyrinth.js","gSig":"circle","bSig":"line","gRow":51,"bRow":57,"mobRows":[1,44,22],"minLvl":20,"mut":0,"xp":55,"spawnGeneral":0},{"n":33,"sw":"dungeon_soul_labyrinth","dungeon":6,"stage":9,"stagesInDungeon":14,"name":"Ярус 9: Лабиринт Хаоса","dungeonName":"Лабиринт Забытых Душ","desc":"Хаотичный призрачный лабиринт, где реальность искажена, а коридоры полны безумия и неупокоенных орд.","wave":["Ярус 9: Лабиринт Хаоса","Блуждающий Призрак","Блуждающий Призрак"],"tint":"#241430","ember":"#e7b6ff","mob":"Блуждающий Призрак","general":"Блуждающий Призрак","boss":"Блуждающий Призрак","bossTitle":"в файле нет босса: этап закрывается толпой","goal":"pack","srcHp":600,"srcAtk":110,"file":"public/shadow-world/js/dungeons/06_soul_labyrinth.js","gSig":"circle","bSig":"line","gRow":51,"bRow":57,"mobRows":[1,44,22],"minLvl":20,"mut":0,"xp":55,"spawnGeneral":0},{"n":34,"sw":"dungeon_soul_labyrinth","dungeon":6,"stage":10,"stagesInDungeon":14,"name":"Ярус 10: Лабиринт Хаоса","dungeonName":"Лабиринт Забытых Душ","desc":"Хаотичный призрачный лабиринт, где реальность искажена, а коридоры полны безумия и неупокоенных орд.","wave":["Ярус 10: Лабиринт Хаоса","Блуждающий Призрак","Блуждающий Призрак"],"tint":"#241430","ember":"#e7b6ff","mob":"Блуждающий Призрак","general":"Блуждающий Призрак","boss":"Блуждающий Призрак","bossTitle":"в файле нет босса: этап закрывается толпой","goal":"pack","srcHp":600,"srcAtk":110,"file":"public/shadow-world/js/dungeons/06_soul_labyrinth.js","gSig":"circle","bSig":"line","gRow":51,"bRow":57,"mobRows":[1,44,22],"minLvl":20,"mut":0,"xp":55,"spawnGeneral":0},{"n":35,"sw":"dungeon_soul_labyrinth","dungeon":6,"stage":11,"stagesInDungeon":14,"name":"Ярус 11: Лабиринт Хаоса","dungeonName":"Лабиринт Забытых Душ","desc":"Хаотичный призрачный лабиринт, где реальность искажена, а коридоры полны безумия и неупокоенных орд.","wave":["Ярус 11: Лабиринт Хаоса","Блуждающий Призрак","Блуждающий Призрак"],"tint":"#241430","ember":"#e7b6ff","mob":"Блуждающий Призрак","general":"Блуждающий Призрак","boss":"Блуждающий Призрак","bossTitle":"в файле нет босса: этап закрывается толпой","goal":"pack","srcHp":600,"srcAtk":110,"file":"public/shadow-world/js/dungeons/06_soul_labyrinth.js","gSig":"circle","bSig":"line","gRow":51,"bRow":57,"mobRows":[1,44,22],"minLvl":20,"mut":0,"xp":55,"spawnGeneral":0},{"n":36,"sw":"dungeon_soul_labyrinth","dungeon":6,"stage":12,"stagesInDungeon":14,"name":"Орда (Этаж 12)","dungeonName":"Лабиринт Забытых Душ","desc":"Хаотичный призрачный лабиринт, где реальность искажена, а коридоры полны безумия и неупокоенных орд.","wave":["Орда (Этаж 12)","Блуждающий Призрак","Пожиратель Сущностей"],"tint":"#241430","ember":"#e7b6ff","mob":"Блуждающий Призрак","general":"Блуждающий Призрак","boss":"Пожиратель Сущностей","bossTitle":"элита этапа, отдельного босса в файле нет","goal":"elite","srcHp":600,"srcAtk":110,"file":"public/shadow-world/js/dungeons/06_soul_labyrinth.js","gSig":"circle","bSig":"line","gRow":51,"bRow":57,"mobRows":[1,44,22],"minLvl":20,"mut":0,"xp":55,"spawnGeneral":0},{"n":37,"sw":"dungeon_soul_labyrinth","dungeon":6,"stage":13,"stagesInDungeon":14,"name":"Ярус 13: Лабиринт Хаоса","dungeonName":"Лабиринт Забытых Душ","desc":"Хаотичный призрачный лабиринт, где реальность искажена, а коридоры полны безумия и неупокоенных орд.","wave":["Ярус 13: Лабиринт Хаоса","Блуждающий Призрак","Блуждающий Призрак"],"tint":"#241430","ember":"#e7b6ff","mob":"Блуждающий Призрак","general":"Блуждающий Призрак","boss":"Блуждающий Призрак","bossTitle":"в файле нет босса: этап закрывается толпой","goal":"pack","srcHp":600,"srcAtk":110,"file":"public/shadow-world/js/dungeons/06_soul_labyrinth.js","gSig":"circle","bSig":"line","gRow":51,"bRow":57,"mobRows":[1,44,22],"minLvl":20,"mut":0,"xp":55,"spawnGeneral":0},{"n":38,"sw":"dungeon_soul_labyrinth","dungeon":6,"stage":14,"stagesInDungeon":14,"name":"Чертог Владыки (Этаж 14)","dungeonName":"Лабиринт Забытых Душ","desc":"Хаотичный призрачный лабиринт, где реальность искажена, а коридоры полны безумия и неупокоенных орд.","wave":["Чертог Владыки (Этаж 14)","Страж Трона","Владыка Забвения Танатос"],"tint":"#241430","ember":"#e7b6ff","mob":"Страж Трона","general":"Страж Трона","boss":"Владыка Забвения Танатос","bossTitle":"босс этапа из файла данжа","goal":"boss","srcHp":2800,"srcAtk":180,"file":"public/shadow-world/js/dungeons/06_soul_labyrinth.js","gSig":"circle","bSig":"line","gRow":51,"bRow":57,"mobRows":[1,44,22],"minLvl":20,"mut":2,"xp":51905,"spawnGeneral":1,"story":"sq_soul"},{"n":39,"sw":"dungeon_chaos_inferno","dungeon":7,"stage":1,"stagesInDungeon":15,"name":"Ярус 1: Инферно Хаоса","dungeonName":"Пекло Первородного Хаоса","desc":"Бездонные лавовые каверны, где рождается чистый хаос и правят беспощадные владыки огня.","wave":["Ярус 1: Инферно Хаоса","Лавовый Скорпион","Лавовый Скорпион"],"tint":"#3a1814","ember":"#ff4a32","mob":"Лавовый Скорпион","general":"Лавовый Скорпион","boss":"Лавовый Скорпион","bossTitle":"в файле нет босса: этап закрывается толпой","goal":"pack","srcHp":1800,"srcAtk":240,"file":"public/shadow-world/js/dungeons/07_chaos_inferno.js","gSig":"cone","bSig":"curse","gRow":42,"bRow":58,"mobRows":[46,30,49],"minLvl":30,"mut":0,"xp":55,"spawnGeneral":0},{"n":40,"sw":"dungeon_chaos_inferno","dungeon":7,"stage":2,"stagesInDungeon":15,"name":"Ярус 2: Инферно Хаоса","dungeonName":"Пекло Первородного Хаоса","desc":"Бездонные лавовые каверны, где рождается чистый хаос и правят беспощадные владыки огня.","wave":["Ярус 2: Инферно Хаоса","Лавовый Скорпион","Лавовый Скорпион"],"tint":"#3a1814","ember":"#ff4a32","mob":"Лавовый Скорпион","general":"Лавовый Скорпион","boss":"Лавовый Скорпион","bossTitle":"в файле нет босса: этап закрывается толпой","goal":"pack","srcHp":1800,"srcAtk":240,"file":"public/shadow-world/js/dungeons/07_chaos_inferno.js","gSig":"cone","bSig":"curse","gRow":42,"bRow":58,"mobRows":[46,30,49],"minLvl":30,"mut":0,"xp":55,"spawnGeneral":0},{"n":41,"sw":"dungeon_chaos_inferno","dungeon":7,"stage":3,"stagesInDungeon":15,"name":"Ярус 3: Инферно Хаоса","dungeonName":"Пекло Первородного Хаоса","desc":"Бездонные лавовые каверны, где рождается чистый хаос и правят беспощадные владыки огня.","wave":["Ярус 3: Инферно Хаоса","Лавовый Скорпион","Лавовый Скорпион"],"tint":"#3a1814","ember":"#ff4a32","mob":"Лавовый Скорпион","general":"Лавовый Скорпион","boss":"Лавовый Скорпион","bossTitle":"в файле нет босса: этап закрывается толпой","goal":"pack","srcHp":1800,"srcAtk":240,"file":"public/shadow-world/js/dungeons/07_chaos_inferno.js","gSig":"cone","bSig":"curse","gRow":42,"bRow":58,"mobRows":[46,30,49],"minLvl":30,"mut":0,"xp":55,"spawnGeneral":0},{"n":42,"sw":"dungeon_chaos_inferno","dungeon":7,"stage":4,"stagesInDungeon":15,"name":"Орда (Этаж 4)","dungeonName":"Пекло Первородного Хаоса","desc":"Бездонные лавовые каверны, где рождается чистый хаос и правят беспощадные владыки огня.","wave":["Орда (Этаж 4)","Лавовый Скорпион","Элитный Магма-Голем"],"tint":"#3a1814","ember":"#ff4a32","mob":"Лавовый Скорпион","general":"Лавовый Скорпион","boss":"Элитный Магма-Голем","bossTitle":"элита этапа, отдельного босса в файле нет","goal":"elite","srcHp":1800,"srcAtk":240,"file":"public/shadow-world/js/dungeons/07_chaos_inferno.js","gSig":"cone","bSig":"curse","gRow":42,"bRow":58,"mobRows":[46,30,49],"minLvl":30,"mut":0,"xp":55,"spawnGeneral":0},{"n":43,"sw":"dungeon_chaos_inferno","dungeon":7,"stage":5,"stagesInDungeon":15,"name":"Ярус 5: Инферно Хаоса","dungeonName":"Пекло Первородного Хаоса","desc":"Бездонные лавовые каверны, где рождается чистый хаос и правят беспощадные владыки огня.","wave":["Ярус 5: Инферно Хаоса","Лавовый Скорпион","Лавовый Скорпион"],"tint":"#3a1814","ember":"#ff4a32","mob":"Лавовый Скорпион","general":"Лавовый Скорпион","boss":"Лавовый Скорпион","bossTitle":"в файле нет босса: этап закрывается толпой","goal":"pack","srcHp":1800,"srcAtk":240,"file":"public/shadow-world/js/dungeons/07_chaos_inferno.js","gSig":"cone","bSig":"curse","gRow":42,"bRow":58,"mobRows":[46,30,49],"minLvl":30,"mut":0,"xp":55,"spawnGeneral":0},{"n":44,"sw":"dungeon_chaos_inferno","dungeon":7,"stage":6,"stagesInDungeon":15,"name":"Ярус 6: Инферно Хаоса","dungeonName":"Пекло Первородного Хаоса","desc":"Бездонные лавовые каверны, где рождается чистый хаос и правят беспощадные владыки огня.","wave":["Ярус 6: Инферно Хаоса","Лавовый Скорпион","Лавовый Скорпион"],"tint":"#3a1814","ember":"#ff4a32","mob":"Лавовый Скорпион","general":"Лавовый Скорпион","boss":"Лавовый Скорпион","bossTitle":"в файле нет босса: этап закрывается толпой","goal":"pack","srcHp":1800,"srcAtk":240,"file":"public/shadow-world/js/dungeons/07_chaos_inferno.js","gSig":"cone","bSig":"curse","gRow":42,"bRow":58,"mobRows":[46,30,49],"minLvl":30,"mut":0,"xp":55,"spawnGeneral":0},{"n":45,"sw":"dungeon_chaos_inferno","dungeon":7,"stage":7,"stagesInDungeon":15,"name":"Ярус 7: Инферно Хаоса","dungeonName":"Пекло Первородного Хаоса","desc":"Бездонные лавовые каверны, где рождается чистый хаос и правят беспощадные владыки огня.","wave":["Ярус 7: Инферно Хаоса","Лавовый Скорпион","Лавовый Скорпион"],"tint":"#3a1814","ember":"#ff4a32","mob":"Лавовый Скорпион","general":"Лавовый Скорпион","boss":"Лавовый Скорпион","bossTitle":"в файле нет босса: этап закрывается толпой","goal":"pack","srcHp":1800,"srcAtk":240,"file":"public/shadow-world/js/dungeons/07_chaos_inferno.js","gSig":"cone","bSig":"curse","gRow":42,"bRow":58,"mobRows":[46,30,49],"minLvl":30,"mut":0,"xp":55,"spawnGeneral":0},{"n":46,"sw":"dungeon_chaos_inferno","dungeon":7,"stage":8,"stagesInDungeon":15,"name":"Орда (Этаж 8)","dungeonName":"Пекло Первородного Хаоса","desc":"Бездонные лавовые каверны, где рождается чистый хаос и правят беспощадные владыки огня.","wave":["Орда (Этаж 8)","Лавовый Скорпион","Элитный Магма-Голем"],"tint":"#3a1814","ember":"#ff4a32","mob":"Лавовый Скорпион","general":"Лавовый Скорпион","boss":"Элитный Магма-Голем","bossTitle":"элита этапа, отдельного босса в файле нет","goal":"elite","srcHp":1800,"srcAtk":240,"file":"public/shadow-world/js/dungeons/07_chaos_inferno.js","gSig":"cone","bSig":"curse","gRow":42,"bRow":58,"mobRows":[46,30,49],"minLvl":30,"mut":0,"xp":55,"spawnGeneral":0},{"n":47,"sw":"dungeon_chaos_inferno","dungeon":7,"stage":9,"stagesInDungeon":15,"name":"Ярус 9: Инферно Хаоса","dungeonName":"Пекло Первородного Хаоса","desc":"Бездонные лавовые каверны, где рождается чистый хаос и правят беспощадные владыки огня.","wave":["Ярус 9: Инферно Хаоса","Лавовый Скорпион","Лавовый Скорпион"],"tint":"#3a1814","ember":"#ff4a32","mob":"Лавовый Скорпион","general":"Лавовый Скорпион","boss":"Лавовый Скорпион","bossTitle":"в файле нет босса: этап закрывается толпой","goal":"pack","srcHp":1800,"srcAtk":240,"file":"public/shadow-world/js/dungeons/07_chaos_inferno.js","gSig":"cone","bSig":"curse","gRow":42,"bRow":58,"mobRows":[46,30,49],"minLvl":30,"mut":0,"xp":55,"spawnGeneral":0},{"n":48,"sw":"dungeon_chaos_inferno","dungeon":7,"stage":10,"stagesInDungeon":15,"name":"Ярус 10: Инферно Хаоса","dungeonName":"Пекло Первородного Хаоса","desc":"Бездонные лавовые каверны, где рождается чистый хаос и правят беспощадные владыки огня.","wave":["Ярус 10: Инферно Хаоса","Лавовый Скорпион","Лавовый Скорпион"],"tint":"#3a1814","ember":"#ff4a32","mob":"Лавовый Скорпион","general":"Лавовый Скорпион","boss":"Лавовый Скорпион","bossTitle":"в файле нет босса: этап закрывается толпой","goal":"pack","srcHp":1800,"srcAtk":240,"file":"public/shadow-world/js/dungeons/07_chaos_inferno.js","gSig":"cone","bSig":"curse","gRow":42,"bRow":58,"mobRows":[46,30,49],"minLvl":30,"mut":0,"xp":55,"spawnGeneral":0},{"n":49,"sw":"dungeon_chaos_inferno","dungeon":7,"stage":11,"stagesInDungeon":15,"name":"Ярус 11: Инферно Хаоса","dungeonName":"Пекло Первородного Хаоса","desc":"Бездонные лавовые каверны, где рождается чистый хаос и правят беспощадные владыки огня.","wave":["Ярус 11: Инферно Хаоса","Лавовый Скорпион","Лавовый Скорпион"],"tint":"#3a1814","ember":"#ff4a32","mob":"Лавовый Скорпион","general":"Лавовый Скорпион","boss":"Лавовый Скорпион","bossTitle":"в файле нет босса: этап закрывается толпой","goal":"pack","srcHp":1800,"srcAtk":240,"file":"public/shadow-world/js/dungeons/07_chaos_inferno.js","gSig":"cone","bSig":"curse","gRow":42,"bRow":58,"mobRows":[46,30,49],"minLvl":30,"mut":0,"xp":55,"spawnGeneral":0},{"n":50,"sw":"dungeon_chaos_inferno","dungeon":7,"stage":12,"stagesInDungeon":15,"name":"Орда (Этаж 12)","dungeonName":"Пекло Первородного Хаоса","desc":"Бездонные лавовые каверны, где рождается чистый хаос и правят беспощадные владыки огня.","wave":["Орда (Этаж 12)","Лавовый Скорпион","Элитный Магма-Голем"],"tint":"#3a1814","ember":"#ff4a32","mob":"Лавовый Скорпион","general":"Лавовый Скорпион","boss":"Элитный Магма-Голем","bossTitle":"элита этапа, отдельного босса в файле нет","goal":"elite","srcHp":1800,"srcAtk":240,"file":"public/shadow-world/js/dungeons/07_chaos_inferno.js","gSig":"cone","bSig":"curse","gRow":42,"bRow":58,"mobRows":[46,30,49],"minLvl":30,"mut":0,"xp":55,"spawnGeneral":0},{"n":51,"sw":"dungeon_chaos_inferno","dungeon":7,"stage":13,"stagesInDungeon":15,"name":"Ярус 13: Инферно Хаоса","dungeonName":"Пекло Первородного Хаоса","desc":"Бездонные лавовые каверны, где рождается чистый хаос и правят беспощадные владыки огня.","wave":["Ярус 13: Инферно Хаоса","Лавовый Скорпион","Лавовый Скорпион"],"tint":"#3a1814","ember":"#ff4a32","mob":"Лавовый Скорпион","general":"Лавовый Скорпион","boss":"Лавовый Скорпион","bossTitle":"в файле нет босса: этап закрывается толпой","goal":"pack","srcHp":1800,"srcAtk":240,"file":"public/shadow-world/js/dungeons/07_chaos_inferno.js","gSig":"cone","bSig":"curse","gRow":42,"bRow":58,"mobRows":[46,30,49],"minLvl":30,"mut":0,"xp":55,"spawnGeneral":0},{"n":52,"sw":"dungeon_chaos_inferno","dungeon":7,"stage":14,"stagesInDungeon":15,"name":"Ярус 14: Инферно Хаоса","dungeonName":"Пекло Первородного Хаоса","desc":"Бездонные лавовые каверны, где рождается чистый хаос и правят беспощадные владыки огня.","wave":["Ярус 14: Инферно Хаоса","Лавовый Скорпион","Лавовый Скорпион"],"tint":"#3a1814","ember":"#ff4a32","mob":"Лавовый Скорпион","general":"Лавовый Скорпион","boss":"Лавовый Скорпион","bossTitle":"в файле нет босса: этап закрывается толпой","goal":"pack","srcHp":1800,"srcAtk":240,"file":"public/shadow-world/js/dungeons/07_chaos_inferno.js","gSig":"cone","bSig":"curse","gRow":42,"bRow":58,"mobRows":[46,30,49],"minLvl":30,"mut":0,"xp":55,"spawnGeneral":0},{"n":53,"sw":"dungeon_chaos_inferno","dungeon":7,"stage":15,"stagesInDungeon":15,"name":"Чертог Владыки (Этаж 15)","dungeonName":"Пекло Первородного Хаоса","desc":"Бездонные лавовые каверны, где рождается чистый хаос и правят беспощадные владыки огня.","wave":["Чертог Владыки (Этаж 15)","Страж Трона","Владыка Хаоса Суртур"],"tint":"#3a1814","ember":"#ff4a32","mob":"Страж Трона","general":"Страж Трона","boss":"Владыка Хаоса Суртур","bossTitle":"босс этапа из файла данжа","goal":"boss","srcHp":6500,"srcAtk":420,"file":"public/shadow-world/js/dungeons/07_chaos_inferno.js","gSig":"cone","bSig":"curse","gRow":42,"bRow":58,"mobRows":[46,30,49],"minLvl":30,"mut":3,"xp":85071,"spawnGeneral":1,"story":"sq_chaos"},{"n":54,"sw":"dungeon_abyss","dungeon":8,"stage":1,"stagesInDungeon":3,"name":"Коралловые Рифы","dungeonName":"Затонувший Храм Бездны","desc":"Древнее подводное святилище, скрывающее безумное давление глубин и ужасы первородного океана.","wave":["Коралловые Рифы","Глубинный Змей","Глубинный Змей"],"tint":"#142433","ember":"#7ec8ff","mob":"Глубинный Змей","general":"Глубинный Змей","boss":"Глубинный Змей","bossTitle":"в файле нет босса: этап закрывается толпой","goal":"pack","srcHp":1400,"srcAtk":240,"file":"public/shadow-world/js/dungeons/08_abyss_temple.js","gSig":"line","bSig":"summon","gRow":63,"bRow":49,"mobRows":[0,53,21],"minLvl":40,"mut":0,"xp":55,"spawnGeneral":0},{"n":55,"sw":"dungeon_abyss","dungeon":8,"stage":2,"stagesInDungeon":3,"name":"Затопленные Залы","dungeonName":"Затонувший Храм Бездны","desc":"Древнее подводное святилище, скрывающее безумное давление глубин и ужасы первородного океана.","wave":["Затопленные Залы","Сирена Бездны","Бездонный Страж"],"tint":"#142433","ember":"#7ec8ff","mob":"Сирена Бездны","general":"Сирена Бездны","boss":"Бездонный Страж","bossTitle":"элита этапа, отдельного босса в файле нет","goal":"elite","srcHp":2600,"srcAtk":350,"file":"public/shadow-world/js/dungeons/08_abyss_temple.js","gSig":"line","bSig":"summon","gRow":63,"bRow":49,"mobRows":[0,53,21],"minLvl":40,"mut":0,"xp":55,"spawnGeneral":0},{"n":56,"sw":"dungeon_abyss","dungeon":8,"stage":3,"stagesInDungeon":3,"name":"Святилище Левиафана","dungeonName":"Затонувший Храм Бездны","desc":"Древнее подводное святилище, скрывающее безумное давление глубин и ужасы первородного океана.","wave":["Святилище Левиафана","Кракеноподобный Левиафан","Кракеноподобный Левиафан"],"tint":"#142433","ember":"#7ec8ff","mob":"Кракеноподобный Левиафан","general":"Кракеноподобный Левиафан","boss":"Кракеноподобный Левиафан","bossTitle":"босс этапа из файла данжа","goal":"boss","srcHp":11000,"srcAtk":620,"file":"public/shadow-world/js/dungeons/08_abyss_temple.js","gSig":"line","bSig":"summon","gRow":63,"bRow":49,"mobRows":[0,53,21],"minLvl":40,"mut":4,"xp":122939,"spawnGeneral":0,"story":"sq_abyss"},{"n":57,"sw":"dungeon_5","dungeon":9,"stage":1,"stagesInDungeon":3,"name":"Поврежденный Сектор","dungeonName":"Разрыв Антиматрицы","desc":"Катастрофический цифровой сбой в ядре вселенной, где бесповоротно стираются законы физики и исходный код реальности.","wave":["Поврежденный Сектор","Цифровой Фантом","Цифровой Фантом"],"tint":"#341428","ember":"#ff3d8a","mob":"Цифровой Фантом","general":"Цифровой Фантом","boss":"Цифровой Фантом","bossTitle":"в файле нет босса: этап закрывается толпой","goal":"pack","srcHp":2200,"srcAtk":380,"file":"public/shadow-world/js/dungeons/09_antimatrix.js","gSig":"curse","bSig":"circle","gRow":5,"bRow":65,"mobRows":[5,41,66],"minLvl":50,"mut":0,"xp":55,"spawnGeneral":0},{"n":58,"sw":"dungeon_5","dungeon":9,"stage":2,"stagesInDungeon":3,"name":"Перегруженный Узел","dungeonName":"Разрыв Антиматрицы","desc":"Катастрофический цифровой сбой в ядре вселенной, где бесповоротно стираются законы физики и исходный код реальности.","wave":["Перегруженный Узел","Перегруженный Брандмауэр","Коррумпированное Ядро"],"tint":"#341428","ember":"#ff3d8a","mob":"Перегруженный Брандмауэр","general":"Перегруженный Брандмауэр","boss":"Коррумпированное Ядро","bossTitle":"элита этапа, отдельного босса в файле нет","goal":"elite","srcHp":5200,"srcAtk":650,"file":"public/shadow-world/js/dungeons/09_antimatrix.js","gSig":"curse","bSig":"circle","gRow":5,"bRow":65,"mobRows":[5,41,66],"minLvl":50,"mut":0,"xp":55,"spawnGeneral":0},{"n":59,"sw":"dungeon_5","dungeon":9,"stage":3,"stagesInDungeon":3,"name":"Фрактальный Трон","dungeonName":"Разрыв Антиматрицы","desc":"Катастрофический цифровой сбой в ядре вселенной, где бесповоротно стираются законы физики и исходный код реальности.","wave":["Фрактальный Трон","Творец Искажения","Творец Искажения"],"tint":"#341428","ember":"#ff3d8a","mob":"Творец Искажения","general":"Творец Искажения","boss":"Творец Искажения","bossTitle":"босс этапа из файла данжа","goal":"boss","srcHp":28000,"srcAtk":1650,"file":"public/shadow-world/js/dungeons/09_antimatrix.js","gSig":"curse","bSig":"circle","gRow":5,"bRow":65,"mobRows":[5,41,66],"minLvl":50,"mut":5,"xp":164870,"spawnGeneral":0,"story":"sq_5"},{"n":60,"sw":"dungeon_void_rift","dungeon":10,"stage":1,"stagesInDungeon":10,"name":"Ярус 1: Тьма","dungeonName":"Разлом Вечной Тьмы","desc":"Безграничный разлом антиматерии и абсолютной тьмы, где стираются даже воспоминания о существовании.","wave":["Ярус 1: Тьма","Абсолютный Фантом","Абсолютный Фантом"],"tint":"#1c1830","ember":"#c8c0ff","mob":"Абсолютный Фантом","general":"Абсолютный Фантом","boss":"Абсолютный Фантом","bossTitle":"в файле нет босса: этап закрывается толпой","goal":"pack","srcHp":11000,"srcAtk":1300,"file":"public/shadow-world/js/dungeons/10_void_rift.js","gSig":"summon","bSig":"cone","gRow":52,"bRow":37,"mobRows":[66,51,40],"minLvl":60,"mut":0,"xp":55,"spawnGeneral":0},{"n":61,"sw":"dungeon_void_rift","dungeon":10,"stage":2,"stagesInDungeon":10,"name":"Ярус 2: Тьма","dungeonName":"Разлом Вечной Тьмы","desc":"Безграничный разлом антиматерии и абсолютной тьмы, где стираются даже воспоминания о существовании.","wave":["Ярус 2: Тьма","Абсолютный Фантом","Абсолютный Фантом"],"tint":"#1c1830","ember":"#c8c0ff","mob":"Абсолютный Фантом","general":"Абсолютный Фантом","boss":"Абсолютный Фантом","bossTitle":"в файле нет босса: этап закрывается толпой","goal":"pack","srcHp":11000,"srcAtk":1300,"file":"public/shadow-world/js/dungeons/10_void_rift.js","gSig":"summon","bSig":"cone","gRow":52,"bRow":37,"mobRows":[66,51,40],"minLvl":60,"mut":0,"xp":55,"spawnGeneral":0},{"n":62,"sw":"dungeon_void_rift","dungeon":10,"stage":3,"stagesInDungeon":10,"name":"Ярус 3: Тьма","dungeonName":"Разлом Вечной Тьмы","desc":"Безграничный разлом антиматерии и абсолютной тьмы, где стираются даже воспоминания о существовании.","wave":["Ярус 3: Тьма","Абсолютный Фантом","Абсолютный Фантом"],"tint":"#1c1830","ember":"#c8c0ff","mob":"Абсолютный Фантом","general":"Абсолютный Фантом","boss":"Абсолютный Фантом","bossTitle":"в файле нет босса: этап закрывается толпой","goal":"pack","srcHp":11000,"srcAtk":1300,"file":"public/shadow-world/js/dungeons/10_void_rift.js","gSig":"summon","bSig":"cone","gRow":52,"bRow":37,"mobRows":[66,51,40],"minLvl":60,"mut":0,"xp":55,"spawnGeneral":0},{"n":63,"sw":"dungeon_void_rift","dungeon":10,"stage":4,"stagesInDungeon":10,"name":"Орда (Этаж 4)","dungeonName":"Разлом Вечной Тьмы","desc":"Безграничный разлом антиматерии и абсолютной тьмы, где стираются даже воспоминания о существовании.","wave":["Орда (Этаж 4)","Абсолютный Фантом","Страж Нулевой Точки"],"tint":"#1c1830","ember":"#c8c0ff","mob":"Абсолютный Фантом","general":"Абсолютный Фантом","boss":"Страж Нулевой Точки","bossTitle":"элита этапа, отдельного босса в файле нет","goal":"elite","srcHp":11000,"srcAtk":1300,"file":"public/shadow-world/js/dungeons/10_void_rift.js","gSig":"summon","bSig":"cone","gRow":52,"bRow":37,"mobRows":[66,51,40],"minLvl":60,"mut":0,"xp":55,"spawnGeneral":0},{"n":64,"sw":"dungeon_void_rift","dungeon":10,"stage":5,"stagesInDungeon":10,"name":"Ярус 5: Тьма","dungeonName":"Разлом Вечной Тьмы","desc":"Безграничный разлом антиматерии и абсолютной тьмы, где стираются даже воспоминания о существовании.","wave":["Ярус 5: Тьма","Абсолютный Фантом","Абсолютный Фантом"],"tint":"#1c1830","ember":"#c8c0ff","mob":"Абсолютный Фантом","general":"Абсолютный Фантом","boss":"Абсолютный Фантом","bossTitle":"в файле нет босса: этап закрывается толпой","goal":"pack","srcHp":11000,"srcAtk":1300,"file":"public/shadow-world/js/dungeons/10_void_rift.js","gSig":"summon","bSig":"cone","gRow":52,"bRow":37,"mobRows":[66,51,40],"minLvl":60,"mut":0,"xp":55,"spawnGeneral":0},{"n":65,"sw":"dungeon_void_rift","dungeon":10,"stage":6,"stagesInDungeon":10,"name":"Ярус 6: Тьма","dungeonName":"Разлом Вечной Тьмы","desc":"Безграничный разлом антиматерии и абсолютной тьмы, где стираются даже воспоминания о существовании.","wave":["Ярус 6: Тьма","Абсолютный Фантом","Абсолютный Фантом"],"tint":"#1c1830","ember":"#c8c0ff","mob":"Абсолютный Фантом","general":"Абсолютный Фантом","boss":"Абсолютный Фантом","bossTitle":"в файле нет босса: этап закрывается толпой","goal":"pack","srcHp":11000,"srcAtk":1300,"file":"public/shadow-world/js/dungeons/10_void_rift.js","gSig":"summon","bSig":"cone","gRow":52,"bRow":37,"mobRows":[66,51,40],"minLvl":60,"mut":0,"xp":55,"spawnGeneral":0},{"n":66,"sw":"dungeon_void_rift","dungeon":10,"stage":7,"stagesInDungeon":10,"name":"Ярус 7: Тьма","dungeonName":"Разлом Вечной Тьмы","desc":"Безграничный разлом антиматерии и абсолютной тьмы, где стираются даже воспоминания о существовании.","wave":["Ярус 7: Тьма","Абсолютный Фантом","Абсолютный Фантом"],"tint":"#1c1830","ember":"#c8c0ff","mob":"Абсолютный Фантом","general":"Абсолютный Фантом","boss":"Абсолютный Фантом","bossTitle":"в файле нет босса: этап закрывается толпой","goal":"pack","srcHp":11000,"srcAtk":1300,"file":"public/shadow-world/js/dungeons/10_void_rift.js","gSig":"summon","bSig":"cone","gRow":52,"bRow":37,"mobRows":[66,51,40],"minLvl":60,"mut":0,"xp":55,"spawnGeneral":0},{"n":67,"sw":"dungeon_void_rift","dungeon":10,"stage":8,"stagesInDungeon":10,"name":"Орда (Этаж 8)","dungeonName":"Разлом Вечной Тьмы","desc":"Безграничный разлом антиматерии и абсолютной тьмы, где стираются даже воспоминания о существовании.","wave":["Орда (Этаж 8)","Абсолютный Фантом","Страж Нулевой Точки"],"tint":"#1c1830","ember":"#c8c0ff","mob":"Абсолютный Фантом","general":"Абсолютный Фантом","boss":"Страж Нулевой Точки","bossTitle":"элита этапа, отдельного босса в файле нет","goal":"elite","srcHp":11000,"srcAtk":1300,"file":"public/shadow-world/js/dungeons/10_void_rift.js","gSig":"summon","bSig":"cone","gRow":52,"bRow":37,"mobRows":[66,51,40],"minLvl":60,"mut":0,"xp":55,"spawnGeneral":0},{"n":68,"sw":"dungeon_void_rift","dungeon":10,"stage":9,"stagesInDungeon":10,"name":"Ярус 9: Тьма","dungeonName":"Разлом Вечной Тьмы","desc":"Безграничный разлом антиматерии и абсолютной тьмы, где стираются даже воспоминания о существовании.","wave":["Ярус 9: Тьма","Абсолютный Фантом","Абсолютный Фантом"],"tint":"#1c1830","ember":"#c8c0ff","mob":"Абсолютный Фантом","general":"Абсолютный Фантом","boss":"Абсолютный Фантом","bossTitle":"в файле нет босса: этап закрывается толпой","goal":"pack","srcHp":11000,"srcAtk":1300,"file":"public/shadow-world/js/dungeons/10_void_rift.js","gSig":"summon","bSig":"cone","gRow":52,"bRow":37,"mobRows":[66,51,40],"minLvl":60,"mut":0,"xp":55,"spawnGeneral":0},{"n":69,"sw":"dungeon_void_rift","dungeon":10,"stage":10,"stagesInDungeon":10,"name":"Чертог Владыки (Этаж 10)","dungeonName":"Разлом Вечной Тьмы","desc":"Безграничный разлом антиматерии и абсолютной тьмы, где стираются даже воспоминания о существовании.","wave":["Чертог Владыки (Этаж 10)","Страж Трона","Ходок Бездны Азатот"],"tint":"#1c1830","ember":"#c8c0ff","mob":"Страж Трона","general":"Страж Трона","boss":"Ходок Бездны Азатот","bossTitle":"босс этапа из файла данжа","goal":"boss","srcHp":35000,"srcAtk":2200,"file":"public/shadow-world/js/dungeons/10_void_rift.js","gSig":"summon","bSig":"cone","gRow":52,"bRow":37,"mobRows":[66,51,40],"minLvl":60,"mut":6,"xp":333777,"spawnGeneral":1,"story":"sq_vr"},{"n":70,"sw":"dungeon_blood_citadel","dungeon":11,"stage":1,"stagesInDungeon":12,"name":"Ярус 1: Кровь","dungeonName":"Кровавая Цитадель Кармиллы","desc":"Величественный и зловещий замок древних вампирских лордов, где каждый камень пропитан багровой исцеляющей кровью.","wave":["Ярус 1: Кровь","Кровавый Рыцарь","Кровавый Рыцарь"],"tint":"#3a1420","ember":"#ff6080","mob":"Кровавый Рыцарь","general":"Кровавый Рыцарь","boss":"Кровавый Рыцарь","bossTitle":"в файле нет босса: этап закрывается толпой","goal":"pack","srcHp":15000,"srcAtk":1850,"file":"public/shadow-world/js/dungeons/11_blood_citadel.js","gSig":"circle","bSig":"line","gRow":45,"bRow":59,"mobRows":[20,16,34],"minLvl":75,"mut":0,"xp":55,"spawnGeneral":0},{"n":71,"sw":"dungeon_blood_citadel","dungeon":11,"stage":2,"stagesInDungeon":12,"name":"Ярус 2: Кровь","dungeonName":"Кровавая Цитадель Кармиллы","desc":"Величественный и зловещий замок древних вампирских лордов, где каждый камень пропитан багровой исцеляющей кровью.","wave":["Ярус 2: Кровь","Кровавый Рыцарь","Кровавый Рыцарь"],"tint":"#3a1420","ember":"#ff6080","mob":"Кровавый Рыцарь","general":"Кровавый Рыцарь","boss":"Кровавый Рыцарь","bossTitle":"в файле нет босса: этап закрывается толпой","goal":"pack","srcHp":15000,"srcAtk":1850,"file":"public/shadow-world/js/dungeons/11_blood_citadel.js","gSig":"circle","bSig":"line","gRow":45,"bRow":59,"mobRows":[20,16,34],"minLvl":75,"mut":0,"xp":55,"spawnGeneral":0},{"n":72,"sw":"dungeon_blood_citadel","dungeon":11,"stage":3,"stagesInDungeon":12,"name":"Ярус 3: Кровь","dungeonName":"Кровавая Цитадель Кармиллы","desc":"Величественный и зловещий замок древних вампирских лордов, где каждый камень пропитан багровой исцеляющей кровью.","wave":["Ярус 3: Кровь","Кровавый Рыцарь","Кровавый Рыцарь"],"tint":"#3a1420","ember":"#ff6080","mob":"Кровавый Рыцарь","general":"Кровавый Рыцарь","boss":"Кровавый Рыцарь","bossTitle":"в файле нет босса: этап закрывается толпой","goal":"pack","srcHp":15000,"srcAtk":1850,"file":"public/shadow-world/js/dungeons/11_blood_citadel.js","gSig":"circle","bSig":"line","gRow":45,"bRow":59,"mobRows":[20,16,34],"minLvl":75,"mut":0,"xp":55,"spawnGeneral":0},{"n":73,"sw":"dungeon_blood_citadel","dungeon":11,"stage":4,"stagesInDungeon":12,"name":"Орда (Этаж 4)","dungeonName":"Кровавая Цитадель Кармиллы","desc":"Величественный и зловещий замок древних вампирских лордов, где каждый камень пропитан багровой исцеляющей кровью.","wave":["Орда (Этаж 4)","Кровавый Рыцарь","Элитный Жрец Крови"],"tint":"#3a1420","ember":"#ff6080","mob":"Кровавый Рыцарь","general":"Кровавый Рыцарь","boss":"Элитный Жрец Крови","bossTitle":"элита этапа, отдельного босса в файле нет","goal":"elite","srcHp":15000,"srcAtk":1850,"file":"public/shadow-world/js/dungeons/11_blood_citadel.js","gSig":"circle","bSig":"line","gRow":45,"bRow":59,"mobRows":[20,16,34],"minLvl":75,"mut":0,"xp":55,"spawnGeneral":0},{"n":74,"sw":"dungeon_blood_citadel","dungeon":11,"stage":5,"stagesInDungeon":12,"name":"Ярус 5: Кровь","dungeonName":"Кровавая Цитадель Кармиллы","desc":"Величественный и зловещий замок древних вампирских лордов, где каждый камень пропитан багровой исцеляющей кровью.","wave":["Ярус 5: Кровь","Кровавый Рыцарь","Кровавый Рыцарь"],"tint":"#3a1420","ember":"#ff6080","mob":"Кровавый Рыцарь","general":"Кровавый Рыцарь","boss":"Кровавый Рыцарь","bossTitle":"в файле нет босса: этап закрывается толпой","goal":"pack","srcHp":15000,"srcAtk":1850,"file":"public/shadow-world/js/dungeons/11_blood_citadel.js","gSig":"circle","bSig":"line","gRow":45,"bRow":59,"mobRows":[20,16,34],"minLvl":75,"mut":0,"xp":55,"spawnGeneral":0},{"n":75,"sw":"dungeon_blood_citadel","dungeon":11,"stage":6,"stagesInDungeon":12,"name":"Ярус 6: Кровь","dungeonName":"Кровавая Цитадель Кармиллы","desc":"Величественный и зловещий замок древних вампирских лордов, где каждый камень пропитан багровой исцеляющей кровью.","wave":["Ярус 6: Кровь","Кровавый Рыцарь","Кровавый Рыцарь"],"tint":"#3a1420","ember":"#ff6080","mob":"Кровавый Рыцарь","general":"Кровавый Рыцарь","boss":"Кровавый Рыцарь","bossTitle":"в файле нет босса: этап закрывается толпой","goal":"pack","srcHp":15000,"srcAtk":1850,"file":"public/shadow-world/js/dungeons/11_blood_citadel.js","gSig":"circle","bSig":"line","gRow":45,"bRow":59,"mobRows":[20,16,34],"minLvl":75,"mut":0,"xp":55,"spawnGeneral":0},{"n":76,"sw":"dungeon_blood_citadel","dungeon":11,"stage":7,"stagesInDungeon":12,"name":"Ярус 7: Кровь","dungeonName":"Кровавая Цитадель Кармиллы","desc":"Величественный и зловещий замок древних вампирских лордов, где каждый камень пропитан багровой исцеляющей кровью.","wave":["Ярус 7: Кровь","Кровавый Рыцарь","Кровавый Рыцарь"],"tint":"#3a1420","ember":"#ff6080","mob":"Кровавый Рыцарь","general":"Кровавый Рыцарь","boss":"Кровавый Рыцарь","bossTitle":"в файле нет босса: этап закрывается толпой","goal":"pack","srcHp":15000,"srcAtk":1850,"file":"public/shadow-world/js/dungeons/11_blood_citadel.js","gSig":"circle","bSig":"line","gRow":45,"bRow":59,"mobRows":[20,16,34],"minLvl":75,"mut":0,"xp":55,"spawnGeneral":0},{"n":77,"sw":"dungeon_blood_citadel","dungeon":11,"stage":8,"stagesInDungeon":12,"name":"Орда (Этаж 8)","dungeonName":"Кровавая Цитадель Кармиллы","desc":"Величественный и зловещий замок древних вампирских лордов, где каждый камень пропитан багровой исцеляющей кровью.","wave":["Орда (Этаж 8)","Кровавый Рыцарь","Элитный Жрец Крови"],"tint":"#3a1420","ember":"#ff6080","mob":"Кровавый Рыцарь","general":"Кровавый Рыцарь","boss":"Элитный Жрец Крови","bossTitle":"элита этапа, отдельного босса в файле нет","goal":"elite","srcHp":15000,"srcAtk":1850,"file":"public/shadow-world/js/dungeons/11_blood_citadel.js","gSig":"circle","bSig":"line","gRow":45,"bRow":59,"mobRows":[20,16,34],"minLvl":75,"mut":0,"xp":55,"spawnGeneral":0},{"n":78,"sw":"dungeon_blood_citadel","dungeon":11,"stage":9,"stagesInDungeon":12,"name":"Ярус 9: Кровь","dungeonName":"Кровавая Цитадель Кармиллы","desc":"Величественный и зловещий замок древних вампирских лордов, где каждый камень пропитан багровой исцеляющей кровью.","wave":["Ярус 9: Кровь","Кровавый Рыцарь","Кровавый Рыцарь"],"tint":"#3a1420","ember":"#ff6080","mob":"Кровавый Рыцарь","general":"Кровавый Рыцарь","boss":"Кровавый Рыцарь","bossTitle":"в файле нет босса: этап закрывается толпой","goal":"pack","srcHp":15000,"srcAtk":1850,"file":"public/shadow-world/js/dungeons/11_blood_citadel.js","gSig":"circle","bSig":"line","gRow":45,"bRow":59,"mobRows":[20,16,34],"minLvl":75,"mut":0,"xp":55,"spawnGeneral":0},{"n":79,"sw":"dungeon_blood_citadel","dungeon":11,"stage":10,"stagesInDungeon":12,"name":"Ярус 10: Кровь","dungeonName":"Кровавая Цитадель Кармиллы","desc":"Величественный и зловещий замок древних вампирских лордов, где каждый камень пропитан багровой исцеляющей кровью.","wave":["Ярус 10: Кровь","Кровавый Рыцарь","Кровавый Рыцарь"],"tint":"#3a1420","ember":"#ff6080","mob":"Кровавый Рыцарь","general":"Кровавый Рыцарь","boss":"Кровавый Рыцарь","bossTitle":"в файле нет босса: этап закрывается толпой","goal":"pack","srcHp":15000,"srcAtk":1850,"file":"public/shadow-world/js/dungeons/11_blood_citadel.js","gSig":"circle","bSig":"line","gRow":45,"bRow":59,"mobRows":[20,16,34],"minLvl":75,"mut":0,"xp":55,"spawnGeneral":0},{"n":80,"sw":"dungeon_blood_citadel","dungeon":11,"stage":11,"stagesInDungeon":12,"name":"Ярус 11: Кровь","dungeonName":"Кровавая Цитадель Кармиллы","desc":"Величественный и зловещий замок древних вампирских лордов, где каждый камень пропитан багровой исцеляющей кровью.","wave":["Ярус 11: Кровь","Кровавый Рыцарь","Кровавый Рыцарь"],"tint":"#3a1420","ember":"#ff6080","mob":"Кровавый Рыцарь","general":"Кровавый Рыцарь","boss":"Кровавый Рыцарь","bossTitle":"в файле нет босса: этап закрывается толпой","goal":"pack","srcHp":15000,"srcAtk":1850,"file":"public/shadow-world/js/dungeons/11_blood_citadel.js","gSig":"circle","bSig":"line","gRow":45,"bRow":59,"mobRows":[20,16,34],"minLvl":75,"mut":0,"xp":55,"spawnGeneral":0},{"n":81,"sw":"dungeon_blood_citadel","dungeon":11,"stage":12,"stagesInDungeon":12,"name":"Чертог Владыки (Этаж 12)","dungeonName":"Кровавая Цитадель Кармиллы","desc":"Величественный и зловещий замок древних вампирских лордов, где каждый камень пропитан багровой исцеляющей кровью.","wave":["Чертог Владыки (Этаж 12)","Страж Трона","Королева Кармилла"],"tint":"#3a1420","ember":"#ff6080","mob":"Страж Трона","general":"Страж Трона","boss":"Королева Кармилла","bossTitle":"босс этапа из файла данжа","goal":"boss","srcHp":52000,"srcAtk":2900,"file":"public/shadow-world/js/dungeons/11_blood_citadel.js","gSig":"circle","bSig":"line","gRow":45,"bRow":59,"mobRows":[20,16,34],"minLvl":75,"mut":7,"xp":447182,"spawnGeneral":1,"story":"sq_bc"},{"n":82,"sw":"dungeon_spectral_cathedral","dungeon":12,"stage":1,"stagesInDungeon":12,"name":"Ярус 1: Спектр","dungeonName":"Спектральный Собор","desc":"Величественное святилище иллюзий и безумной веры, где реальность искажена священными призраками.","wave":["Ярус 1: Спектр","Инквизитор","Инквизитор"],"tint":"#281428","ember":"#f0e6ff","mob":"Инквизитор","general":"Инквизитор","boss":"Инквизитор","bossTitle":"в файле нет босса: этап закрывается толпой","goal":"pack","srcHp":22000,"srcAtk":2400,"file":"public/shadow-world/js/dungeons/12_spectral_cathedral.js","gSig":"cone","bSig":"curse","gRow":36,"bRow":56,"mobRows":[22,7,14],"minLvl":90,"mut":0,"xp":55,"spawnGeneral":0},{"n":83,"sw":"dungeon_spectral_cathedral","dungeon":12,"stage":2,"stagesInDungeon":12,"name":"Ярус 2: Спектр","dungeonName":"Спектральный Собор","desc":"Величественное святилище иллюзий и безумной веры, где реальность искажена священными призраками.","wave":["Ярус 2: Спектр","Инквизитор","Инквизитор"],"tint":"#281428","ember":"#f0e6ff","mob":"Инквизитор","general":"Инквизитор","boss":"Инквизитор","bossTitle":"в файле нет босса: этап закрывается толпой","goal":"pack","srcHp":22000,"srcAtk":2400,"file":"public/shadow-world/js/dungeons/12_spectral_cathedral.js","gSig":"cone","bSig":"curse","gRow":36,"bRow":56,"mobRows":[22,7,14],"minLvl":90,"mut":0,"xp":55,"spawnGeneral":0},{"n":84,"sw":"dungeon_spectral_cathedral","dungeon":12,"stage":3,"stagesInDungeon":12,"name":"Ярус 3: Спектр","dungeonName":"Спектральный Собор","desc":"Величественное святилище иллюзий и безумной веры, где реальность искажена священными призраками.","wave":["Ярус 3: Спектр","Инквизитор","Инквизитор"],"tint":"#281428","ember":"#f0e6ff","mob":"Инквизитор","general":"Инквизитор","boss":"Инквизитор","bossTitle":"в файле нет босса: этап закрывается толпой","goal":"pack","srcHp":22000,"srcAtk":2400,"file":"public/shadow-world/js/dungeons/12_spectral_cathedral.js","gSig":"cone","bSig":"curse","gRow":36,"bRow":56,"mobRows":[22,7,14],"minLvl":90,"mut":0,"xp":55,"spawnGeneral":0},{"n":85,"sw":"dungeon_spectral_cathedral","dungeon":12,"stage":4,"stagesInDungeon":12,"name":"Орда (Этаж 4)","dungeonName":"Спектральный Собор","desc":"Величественное святилище иллюзий и безумной веры, где реальность искажена священными призраками.","wave":["Орда (Этаж 4)","Инквизитор","Элитный Каратель"],"tint":"#281428","ember":"#f0e6ff","mob":"Инквизитор","general":"Инквизитор","boss":"Элитный Каратель","bossTitle":"элита этапа, отдельного босса в файле нет","goal":"elite","srcHp":22000,"srcAtk":2400,"file":"public/shadow-world/js/dungeons/12_spectral_cathedral.js","gSig":"cone","bSig":"curse","gRow":36,"bRow":56,"mobRows":[22,7,14],"minLvl":90,"mut":0,"xp":55,"spawnGeneral":0},{"n":86,"sw":"dungeon_spectral_cathedral","dungeon":12,"stage":5,"stagesInDungeon":12,"name":"Ярус 5: Спектр","dungeonName":"Спектральный Собор","desc":"Величественное святилище иллюзий и безумной веры, где реальность искажена священными призраками.","wave":["Ярус 5: Спектр","Инквизитор","Инквизитор"],"tint":"#281428","ember":"#f0e6ff","mob":"Инквизитор","general":"Инквизитор","boss":"Инквизитор","bossTitle":"в файле нет босса: этап закрывается толпой","goal":"pack","srcHp":22000,"srcAtk":2400,"file":"public/shadow-world/js/dungeons/12_spectral_cathedral.js","gSig":"cone","bSig":"curse","gRow":36,"bRow":56,"mobRows":[22,7,14],"minLvl":90,"mut":0,"xp":55,"spawnGeneral":0},{"n":87,"sw":"dungeon_spectral_cathedral","dungeon":12,"stage":6,"stagesInDungeon":12,"name":"Ярус 6: Спектр","dungeonName":"Спектральный Собор","desc":"Величественное святилище иллюзий и безумной веры, где реальность искажена священными призраками.","wave":["Ярус 6: Спектр","Инквизитор","Инквизитор"],"tint":"#281428","ember":"#f0e6ff","mob":"Инквизитор","general":"Инквизитор","boss":"Инквизитор","bossTitle":"в файле нет босса: этап закрывается толпой","goal":"pack","srcHp":22000,"srcAtk":2400,"file":"public/shadow-world/js/dungeons/12_spectral_cathedral.js","gSig":"cone","bSig":"curse","gRow":36,"bRow":56,"mobRows":[22,7,14],"minLvl":90,"mut":0,"xp":55,"spawnGeneral":0},{"n":88,"sw":"dungeon_spectral_cathedral","dungeon":12,"stage":7,"stagesInDungeon":12,"name":"Ярус 7: Спектр","dungeonName":"Спектральный Собор","desc":"Величественное святилище иллюзий и безумной веры, где реальность искажена священными призраками.","wave":["Ярус 7: Спектр","Инквизитор","Инквизитор"],"tint":"#281428","ember":"#f0e6ff","mob":"Инквизитор","general":"Инквизитор","boss":"Инквизитор","bossTitle":"в файле нет босса: этап закрывается толпой","goal":"pack","srcHp":22000,"srcAtk":2400,"file":"public/shadow-world/js/dungeons/12_spectral_cathedral.js","gSig":"cone","bSig":"curse","gRow":36,"bRow":56,"mobRows":[22,7,14],"minLvl":90,"mut":0,"xp":55,"spawnGeneral":0},{"n":89,"sw":"dungeon_spectral_cathedral","dungeon":12,"stage":8,"stagesInDungeon":12,"name":"Орда (Этаж 8)","dungeonName":"Спектральный Собор","desc":"Величественное святилище иллюзий и безумной веры, где реальность искажена священными призраками.","wave":["Орда (Этаж 8)","Инквизитор","Элитный Каратель"],"tint":"#281428","ember":"#f0e6ff","mob":"Инквизитор","general":"Инквизитор","boss":"Элитный Каратель","bossTitle":"элита этапа, отдельного босса в файле нет","goal":"elite","srcHp":22000,"srcAtk":2400,"file":"public/shadow-world/js/dungeons/12_spectral_cathedral.js","gSig":"cone","bSig":"curse","gRow":36,"bRow":56,"mobRows":[22,7,14],"minLvl":90,"mut":0,"xp":55,"spawnGeneral":0},{"n":90,"sw":"dungeon_spectral_cathedral","dungeon":12,"stage":9,"stagesInDungeon":12,"name":"Ярус 9: Спектр","dungeonName":"Спектральный Собор","desc":"Величественное святилище иллюзий и безумной веры, где реальность искажена священными призраками.","wave":["Ярус 9: Спектр","Инквизитор","Инквизитор"],"tint":"#281428","ember":"#f0e6ff","mob":"Инквизитор","general":"Инквизитор","boss":"Инквизитор","bossTitle":"в файле нет босса: этап закрывается толпой","goal":"pack","srcHp":22000,"srcAtk":2400,"file":"public/shadow-world/js/dungeons/12_spectral_cathedral.js","gSig":"cone","bSig":"curse","gRow":36,"bRow":56,"mobRows":[22,7,14],"minLvl":90,"mut":0,"xp":55,"spawnGeneral":0},{"n":91,"sw":"dungeon_spectral_cathedral","dungeon":12,"stage":10,"stagesInDungeon":12,"name":"Ярус 10: Спектр","dungeonName":"Спектральный Собор","desc":"Величественное святилище иллюзий и безумной веры, где реальность искажена священными призраками.","wave":["Ярус 10: Спектр","Инквизитор","Инквизитор"],"tint":"#281428","ember":"#f0e6ff","mob":"Инквизитор","general":"Инквизитор","boss":"Инквизитор","bossTitle":"в файле нет босса: этап закрывается толпой","goal":"pack","srcHp":22000,"srcAtk":2400,"file":"public/shadow-world/js/dungeons/12_spectral_cathedral.js","gSig":"cone","bSig":"curse","gRow":36,"bRow":56,"mobRows":[22,7,14],"minLvl":90,"mut":0,"xp":55,"spawnGeneral":0},{"n":92,"sw":"dungeon_spectral_cathedral","dungeon":12,"stage":11,"stagesInDungeon":12,"name":"Ярус 11: Спектр","dungeonName":"Спектральный Собор","desc":"Величественное святилище иллюзий и безумной веры, где реальность искажена священными призраками.","wave":["Ярус 11: Спектр","Инквизитор","Инквизитор"],"tint":"#281428","ember":"#f0e6ff","mob":"Инквизитор","general":"Инквизитор","boss":"Инквизитор","bossTitle":"в файле нет босса: этап закрывается толпой","goal":"pack","srcHp":22000,"srcAtk":2400,"file":"public/shadow-world/js/dungeons/12_spectral_cathedral.js","gSig":"cone","bSig":"curse","gRow":36,"bRow":56,"mobRows":[22,7,14],"minLvl":90,"mut":0,"xp":55,"spawnGeneral":0},{"n":93,"sw":"dungeon_spectral_cathedral","dungeon":12,"stage":12,"stagesInDungeon":12,"name":"Чертог Владыки (Этаж 12)","dungeonName":"Спектральный Собор","desc":"Величественное святилище иллюзий и безумной веры, где реальность искажена священными призраками.","wave":["Чертог Владыки (Этаж 12)","Страж Трона","Призрачный Понтифик"],"tint":"#281428","ember":"#f0e6ff","mob":"Страж Трона","general":"Страж Трона","boss":"Призрачный Понтифик","bossTitle":"босс этапа из файла данжа","goal":"boss","srcHp":75000,"srcAtk":3800,"file":"public/shadow-world/js/dungeons/12_spectral_cathedral.js","gSig":"cone","bSig":"curse","gRow":36,"bRow":56,"mobRows":[22,7,14],"minLvl":90,"mut":8,"xp":789441,"spawnGeneral":1,"story":"sq_sc"},{"n":94,"sw":"dungeon_titan_cradle","dungeon":13,"stage":1,"stagesInDungeon":14,"name":"Ярус 1: Колыбель Титанов","dungeonName":"Колыбель Забытых Титанов","desc":"Древнейшая колыбель первородных колоссов, кишащая роями неутомимых каменных тварей под сенью падших богов.","wave":["Ярус 1: Колыбель Титанов","Каменный Осколок","Каменный Осколок"],"tint":"#3a301c","ember":"#ffd76a","mob":"Каменный Осколок","general":"Каменный Осколок","boss":"Каменный Осколок","bossTitle":"в файле нет босса: этап закрывается толпой","goal":"pack","srcHp":32000,"srcAtk":3100,"file":"public/shadow-world/js/dungeons/13_titan_cradle.js","gSig":"line","bSig":"summon","gRow":32,"bRow":67,"mobRows":[10,19,18],"minLvl":110,"mut":0,"xp":55,"spawnGeneral":0},{"n":95,"sw":"dungeon_titan_cradle","dungeon":13,"stage":2,"stagesInDungeon":14,"name":"Ярус 2: Колыбель Титанов","dungeonName":"Колыбель Забытых Титанов","desc":"Древнейшая колыбель первородных колоссов, кишащая роями неутомимых каменных тварей под сенью падших богов.","wave":["Ярус 2: Колыбель Титанов","Каменный Осколок","Каменный Осколок"],"tint":"#3a301c","ember":"#ffd76a","mob":"Каменный Осколок","general":"Каменный Осколок","boss":"Каменный Осколок","bossTitle":"в файле нет босса: этап закрывается толпой","goal":"pack","srcHp":32000,"srcAtk":3100,"file":"public/shadow-world/js/dungeons/13_titan_cradle.js","gSig":"line","bSig":"summon","gRow":32,"bRow":67,"mobRows":[10,19,18],"minLvl":110,"mut":0,"xp":55,"spawnGeneral":0},{"n":96,"sw":"dungeon_titan_cradle","dungeon":13,"stage":3,"stagesInDungeon":14,"name":"Ярус 3: Колыбель Титанов","dungeonName":"Колыбель Забытых Титанов","desc":"Древнейшая колыбель первородных колоссов, кишащая роями неутомимых каменных тварей под сенью падших богов.","wave":["Ярус 3: Колыбель Титанов","Каменный Осколок","Каменный Осколок"],"tint":"#3a301c","ember":"#ffd76a","mob":"Каменный Осколок","general":"Каменный Осколок","boss":"Каменный Осколок","bossTitle":"в файле нет босса: этап закрывается толпой","goal":"pack","srcHp":32000,"srcAtk":3100,"file":"public/shadow-world/js/dungeons/13_titan_cradle.js","gSig":"line","bSig":"summon","gRow":32,"bRow":67,"mobRows":[10,19,18],"minLvl":110,"mut":0,"xp":55,"spawnGeneral":0},{"n":97,"sw":"dungeon_titan_cradle","dungeon":13,"stage":4,"stagesInDungeon":14,"name":"Орда (Этаж 4)","dungeonName":"Колыбель Забытых Титанов","desc":"Древнейшая колыбель первородных колоссов, кишащая роями неутомимых каменных тварей под сенью падших богов.","wave":["Орда (Этаж 4)","Каменный Осколок","Пробужденный Страж"],"tint":"#3a301c","ember":"#ffd76a","mob":"Каменный Осколок","general":"Каменный Осколок","boss":"Пробужденный Страж","bossTitle":"элита этапа, отдельного босса в файле нет","goal":"elite","srcHp":32000,"srcAtk":3100,"file":"public/shadow-world/js/dungeons/13_titan_cradle.js","gSig":"line","bSig":"summon","gRow":32,"bRow":67,"mobRows":[10,19,18],"minLvl":110,"mut":0,"xp":55,"spawnGeneral":0},{"n":98,"sw":"dungeon_titan_cradle","dungeon":13,"stage":5,"stagesInDungeon":14,"name":"Ярус 5: Колыбель Титанов","dungeonName":"Колыбель Забытых Титанов","desc":"Древнейшая колыбель первородных колоссов, кишащая роями неутомимых каменных тварей под сенью падших богов.","wave":["Ярус 5: Колыбель Титанов","Каменный Осколок","Каменный Осколок"],"tint":"#3a301c","ember":"#ffd76a","mob":"Каменный Осколок","general":"Каменный Осколок","boss":"Каменный Осколок","bossTitle":"в файле нет босса: этап закрывается толпой","goal":"pack","srcHp":32000,"srcAtk":3100,"file":"public/shadow-world/js/dungeons/13_titan_cradle.js","gSig":"line","bSig":"summon","gRow":32,"bRow":67,"mobRows":[10,19,18],"minLvl":110,"mut":0,"xp":55,"spawnGeneral":0},{"n":99,"sw":"dungeon_titan_cradle","dungeon":13,"stage":6,"stagesInDungeon":14,"name":"Ярус 6: Колыбель Титанов","dungeonName":"Колыбель Забытых Титанов","desc":"Древнейшая колыбель первородных колоссов, кишащая роями неутомимых каменных тварей под сенью падших богов.","wave":["Ярус 6: Колыбель Титанов","Каменный Осколок","Каменный Осколок"],"tint":"#3a301c","ember":"#ffd76a","mob":"Каменный Осколок","general":"Каменный Осколок","boss":"Каменный Осколок","bossTitle":"в файле нет босса: этап закрывается толпой","goal":"pack","srcHp":32000,"srcAtk":3100,"file":"public/shadow-world/js/dungeons/13_titan_cradle.js","gSig":"line","bSig":"summon","gRow":32,"bRow":67,"mobRows":[10,19,18],"minLvl":110,"mut":0,"xp":55,"spawnGeneral":0},{"n":100,"sw":"dungeon_titan_cradle","dungeon":13,"stage":7,"stagesInDungeon":14,"name":"Ярус 7: Колыбель Титанов","dungeonName":"Колыбель Забытых Титанов","desc":"Древнейшая колыбель первородных колоссов, кишащая роями неутомимых каменных тварей под сенью падших богов.","wave":["Ярус 7: Колыбель Титанов","Каменный Осколок","Каменный Осколок"],"tint":"#3a301c","ember":"#ffd76a","mob":"Каменный Осколок","general":"Каменный Осколок","boss":"Каменный Осколок","bossTitle":"в файле нет босса: этап закрывается толпой","goal":"pack","srcHp":32000,"srcAtk":3100,"file":"public/shadow-world/js/dungeons/13_titan_cradle.js","gSig":"line","bSig":"summon","gRow":32,"bRow":67,"mobRows":[10,19,18],"minLvl":110,"mut":0,"xp":55,"spawnGeneral":0},{"n":101,"sw":"dungeon_titan_cradle","dungeon":13,"stage":8,"stagesInDungeon":14,"name":"Орда (Этаж 8)","dungeonName":"Колыбель Забытых Титанов","desc":"Древнейшая колыбель первородных колоссов, кишащая роями неутомимых каменных тварей под сенью падших богов.","wave":["Орда (Этаж 8)","Каменный Осколок","Пробужденный Страж"],"tint":"#3a301c","ember":"#ffd76a","mob":"Каменный Осколок","general":"Каменный Осколок","boss":"Пробужденный Страж","bossTitle":"элита этапа, отдельного босса в файле нет","goal":"elite","srcHp":32000,"srcAtk":3100,"file":"public/shadow-world/js/dungeons/13_titan_cradle.js","gSig":"line","bSig":"summon","gRow":32,"bRow":67,"mobRows":[10,19,18],"minLvl":110,"mut":0,"xp":55,"spawnGeneral":0},{"n":102,"sw":"dungeon_titan_cradle","dungeon":13,"stage":9,"stagesInDungeon":14,"name":"Ярус 9: Колыбель Титанов","dungeonName":"Колыбель Забытых Титанов","desc":"Древнейшая колыбель первородных колоссов, кишащая роями неутомимых каменных тварей под сенью падших богов.","wave":["Ярус 9: Колыбель Титанов","Каменный Осколок","Каменный Осколок"],"tint":"#3a301c","ember":"#ffd76a","mob":"Каменный Осколок","general":"Каменный Осколок","boss":"Каменный Осколок","bossTitle":"в файле нет босса: этап закрывается толпой","goal":"pack","srcHp":32000,"srcAtk":3100,"file":"public/shadow-world/js/dungeons/13_titan_cradle.js","gSig":"line","bSig":"summon","gRow":32,"bRow":67,"mobRows":[10,19,18],"minLvl":110,"mut":0,"xp":55,"spawnGeneral":0},{"n":103,"sw":"dungeon_titan_cradle","dungeon":13,"stage":10,"stagesInDungeon":14,"name":"Ярус 10: Колыбель Титанов","dungeonName":"Колыбель Забытых Титанов","desc":"Древнейшая колыбель первородных колоссов, кишащая роями неутомимых каменных тварей под сенью падших богов.","wave":["Ярус 10: Колыбель Титанов","Каменный Осколок","Каменный Осколок"],"tint":"#3a301c","ember":"#ffd76a","mob":"Каменный Осколок","general":"Каменный Осколок","boss":"Каменный Осколок","bossTitle":"в файле нет босса: этап закрывается толпой","goal":"pack","srcHp":32000,"srcAtk":3100,"file":"public/shadow-world/js/dungeons/13_titan_cradle.js","gSig":"line","bSig":"summon","gRow":32,"bRow":67,"mobRows":[10,19,18],"minLvl":110,"mut":0,"xp":55,"spawnGeneral":0},{"n":104,"sw":"dungeon_titan_cradle","dungeon":13,"stage":11,"stagesInDungeon":14,"name":"Ярус 11: Колыбель Титанов","dungeonName":"Колыбель Забытых Титанов","desc":"Древнейшая колыбель первородных колоссов, кишащая роями неутомимых каменных тварей под сенью падших богов.","wave":["Ярус 11: Колыбель Титанов","Каменный Осколок","Каменный Осколок"],"tint":"#3a301c","ember":"#ffd76a","mob":"Каменный Осколок","general":"Каменный Осколок","boss":"Каменный Осколок","bossTitle":"в файле нет босса: этап закрывается толпой","goal":"pack","srcHp":32000,"srcAtk":3100,"file":"public/shadow-world/js/dungeons/13_titan_cradle.js","gSig":"line","bSig":"summon","gRow":32,"bRow":67,"mobRows":[10,19,18],"minLvl":110,"mut":0,"xp":55,"spawnGeneral":0},{"n":105,"sw":"dungeon_titan_cradle","dungeon":13,"stage":12,"stagesInDungeon":14,"name":"Орда (Этаж 12)","dungeonName":"Колыбель Забытых Титанов","desc":"Древнейшая колыбель первородных колоссов, кишащая роями неутомимых каменных тварей под сенью падших богов.","wave":["Орда (Этаж 12)","Каменный Осколок","Пробужденный Страж"],"tint":"#3a301c","ember":"#ffd76a","mob":"Каменный Осколок","general":"Каменный Осколок","boss":"Пробужденный Страж","bossTitle":"элита этапа, отдельного босса в файле нет","goal":"elite","srcHp":32000,"srcAtk":3100,"file":"public/shadow-world/js/dungeons/13_titan_cradle.js","gSig":"line","bSig":"summon","gRow":32,"bRow":67,"mobRows":[10,19,18],"minLvl":110,"mut":0,"xp":55,"spawnGeneral":0},{"n":106,"sw":"dungeon_titan_cradle","dungeon":13,"stage":13,"stagesInDungeon":14,"name":"Ярус 13: Колыбель Титанов","dungeonName":"Колыбель Забытых Титанов","desc":"Древнейшая колыбель первородных колоссов, кишащая роями неутомимых каменных тварей под сенью падших богов.","wave":["Ярус 13: Колыбель Титанов","Каменный Осколок","Каменный Осколок"],"tint":"#3a301c","ember":"#ffd76a","mob":"Каменный Осколок","general":"Каменный Осколок","boss":"Каменный Осколок","bossTitle":"в файле нет босса: этап закрывается толпой","goal":"pack","srcHp":32000,"srcAtk":3100,"file":"public/shadow-world/js/dungeons/13_titan_cradle.js","gSig":"line","bSig":"summon","gRow":32,"bRow":67,"mobRows":[10,19,18],"minLvl":110,"mut":0,"xp":55,"spawnGeneral":0},{"n":107,"sw":"dungeon_titan_cradle","dungeon":13,"stage":14,"stagesInDungeon":14,"name":"Чертог Владыки (Этаж 14)","dungeonName":"Колыбель Забытых Титанов","desc":"Древнейшая колыбель первородных колоссов, кишащая роями неутомимых каменных тварей под сенью падших богов.","wave":["Чертог Владыки (Этаж 14)","Страж Трона","Титан Атлас"],"tint":"#3a301c","ember":"#ffd76a","mob":"Страж Трона","general":"Страж Трона","boss":"Титан Атлас","bossTitle":"босс этапа из файла данжа","goal":"boss","srcHp":140000,"srcAtk":5200,"file":"public/shadow-world/js/dungeons/13_titan_cradle.js","gSig":"line","bSig":"summon","gRow":32,"bRow":67,"mobRows":[10,19,18],"minLvl":110,"mut":9,"xp":1029235,"spawnGeneral":1,"story":"sq_tc"},{"n":108,"sw":"dungeon_astral_sanctuary","dungeon":14,"stage":1,"stagesInDungeon":12,"name":"Ярус 1: Астральный Хаос","dungeonName":"Астральное Святилище Звёзд","desc":"Обитель безумных звёздных духов и космических аномалий, где законы физики разорваны в клочья.","wave":["Ярус 1: Астральный Хаос","Квазаровый Бегун-Психопат","Квазаровый Бегун-Психопат"],"tint":"#1c2844","ember":"#ffe38a","mob":"Квазаровый Бегун-Психопат","general":"Квазаровый Бегун-Психопат","boss":"Квазаровый Бегун-Психопат","bossTitle":"в файле нет босса: этап закрывается толпой","goal":"pack","srcHp":95000,"srcAtk":6800,"file":"public/shadow-world/js/dungeons/14_astral_sanctuary.js","gSig":"curse","bSig":"circle","gRow":46,"bRow":3,"mobRows":[12,8,24],"minLvl":130,"mut":0,"xp":55,"spawnGeneral":0},{"n":109,"sw":"dungeon_astral_sanctuary","dungeon":14,"stage":2,"stagesInDungeon":12,"name":"Ярус 2: Астральный Хаос","dungeonName":"Астральное Святилище Звёзд","desc":"Обитель безумных звёздных духов и космических аномалий, где законы физики разорваны в клочья.","wave":["Ярус 2: Астральный Хаос","Квазаровый Бегун-Психопат","Квазаровый Бегун-Психопат"],"tint":"#1c2844","ember":"#ffe38a","mob":"Квазаровый Бегун-Психопат","general":"Квазаровый Бегун-Психопат","boss":"Квазаровый Бегун-Психопат","bossTitle":"в файле нет босса: этап закрывается толпой","goal":"pack","srcHp":95000,"srcAtk":6800,"file":"public/shadow-world/js/dungeons/14_astral_sanctuary.js","gSig":"curse","bSig":"circle","gRow":46,"bRow":3,"mobRows":[12,8,24],"minLvl":130,"mut":0,"xp":55,"spawnGeneral":0},{"n":110,"sw":"dungeon_astral_sanctuary","dungeon":14,"stage":3,"stagesInDungeon":12,"name":"Ярус 3: Астральный Хаос","dungeonName":"Астральное Святилище Звёзд","desc":"Обитель безумных звёздных духов и космических аномалий, где законы физики разорваны в клочья.","wave":["Ярус 3: Астральный Хаос","Квазаровый Бегун-Психопат","Квазаровый Бегун-Психопат"],"tint":"#1c2844","ember":"#ffe38a","mob":"Квазаровый Бегун-Психопат","general":"Квазаровый Бегун-Психопат","boss":"Квазаровый Бегун-Психопат","bossTitle":"в файле нет босса: этап закрывается толпой","goal":"pack","srcHp":95000,"srcAtk":6800,"file":"public/shadow-world/js/dungeons/14_astral_sanctuary.js","gSig":"curse","bSig":"circle","gRow":46,"bRow":3,"mobRows":[12,8,24],"minLvl":130,"mut":0,"xp":55,"spawnGeneral":0},{"n":111,"sw":"dungeon_astral_sanctuary","dungeon":14,"stage":4,"stagesInDungeon":12,"name":"Орда (Этаж 4)","dungeonName":"Астральное Святилище Звёзд","desc":"Обитель безумных звёздных духов и космических аномалий, где законы физики разорваны в клочья.","wave":["Орда (Этаж 4)","Квазаровый Бегун-Психопат","Сверхновый Берсерк"],"tint":"#1c2844","ember":"#ffe38a","mob":"Квазаровый Бегун-Психопат","general":"Квазаровый Бегун-Психопат","boss":"Сверхновый Берсерк","bossTitle":"элита этапа, отдельного босса в файле нет","goal":"elite","srcHp":95000,"srcAtk":6800,"file":"public/shadow-world/js/dungeons/14_astral_sanctuary.js","gSig":"curse","bSig":"circle","gRow":46,"bRow":3,"mobRows":[12,8,24],"minLvl":130,"mut":0,"xp":55,"spawnGeneral":0},{"n":112,"sw":"dungeon_astral_sanctuary","dungeon":14,"stage":5,"stagesInDungeon":12,"name":"Ярус 5: Астральный Хаос","dungeonName":"Астральное Святилище Звёзд","desc":"Обитель безумных звёздных духов и космических аномалий, где законы физики разорваны в клочья.","wave":["Ярус 5: Астральный Хаос","Квазаровый Бегун-Психопат","Квазаровый Бегун-Психопат"],"tint":"#1c2844","ember":"#ffe38a","mob":"Квазаровый Бегун-Психопат","general":"Квазаровый Бегун-Психопат","boss":"Квазаровый Бегун-Психопат","bossTitle":"в файле нет босса: этап закрывается толпой","goal":"pack","srcHp":95000,"srcAtk":6800,"file":"public/shadow-world/js/dungeons/14_astral_sanctuary.js","gSig":"curse","bSig":"circle","gRow":46,"bRow":3,"mobRows":[12,8,24],"minLvl":130,"mut":0,"xp":55,"spawnGeneral":0},{"n":113,"sw":"dungeon_astral_sanctuary","dungeon":14,"stage":6,"stagesInDungeon":12,"name":"Ярус 6: Астральный Хаос","dungeonName":"Астральное Святилище Звёзд","desc":"Обитель безумных звёздных духов и космических аномалий, где законы физики разорваны в клочья.","wave":["Ярус 6: Астральный Хаос","Квазаровый Бегун-Психопат","Квазаровый Бегун-Психопат"],"tint":"#1c2844","ember":"#ffe38a","mob":"Квазаровый Бегун-Психопат","general":"Квазаровый Бегун-Психопат","boss":"Квазаровый Бегун-Психопат","bossTitle":"в файле нет босса: этап закрывается толпой","goal":"pack","srcHp":95000,"srcAtk":6800,"file":"public/shadow-world/js/dungeons/14_astral_sanctuary.js","gSig":"curse","bSig":"circle","gRow":46,"bRow":3,"mobRows":[12,8,24],"minLvl":130,"mut":0,"xp":55,"spawnGeneral":0},{"n":114,"sw":"dungeon_astral_sanctuary","dungeon":14,"stage":7,"stagesInDungeon":12,"name":"Ярус 7: Астральный Хаос","dungeonName":"Астральное Святилище Звёзд","desc":"Обитель безумных звёздных духов и космических аномалий, где законы физики разорваны в клочья.","wave":["Ярус 7: Астральный Хаос","Квазаровый Бегун-Психопат","Квазаровый Бегун-Психопат"],"tint":"#1c2844","ember":"#ffe38a","mob":"Квазаровый Бегун-Психопат","general":"Квазаровый Бегун-Психопат","boss":"Квазаровый Бегун-Психопат","bossTitle":"в файле нет босса: этап закрывается толпой","goal":"pack","srcHp":95000,"srcAtk":6800,"file":"public/shadow-world/js/dungeons/14_astral_sanctuary.js","gSig":"curse","bSig":"circle","gRow":46,"bRow":3,"mobRows":[12,8,24],"minLvl":130,"mut":0,"xp":55,"spawnGeneral":0},{"n":115,"sw":"dungeon_astral_sanctuary","dungeon":14,"stage":8,"stagesInDungeon":12,"name":"Орда (Этаж 8)","dungeonName":"Астральное Святилище Звёзд","desc":"Обитель безумных звёздных духов и космических аномалий, где законы физики разорваны в клочья.","wave":["Орда (Этаж 8)","Квазаровый Бегун-Психопат","Сверхновый Берсерк"],"tint":"#1c2844","ember":"#ffe38a","mob":"Квазаровый Бегун-Психопат","general":"Квазаровый Бегун-Психопат","boss":"Сверхновый Берсерк","bossTitle":"элита этапа, отдельного босса в файле нет","goal":"elite","srcHp":95000,"srcAtk":6800,"file":"public/shadow-world/js/dungeons/14_astral_sanctuary.js","gSig":"curse","bSig":"circle","gRow":46,"bRow":3,"mobRows":[12,8,24],"minLvl":130,"mut":0,"xp":55,"spawnGeneral":0},{"n":116,"sw":"dungeon_astral_sanctuary","dungeon":14,"stage":9,"stagesInDungeon":12,"name":"Ярус 9: Астральный Хаос","dungeonName":"Астральное Святилище Звёзд","desc":"Обитель безумных звёздных духов и космических аномалий, где законы физики разорваны в клочья.","wave":["Ярус 9: Астральный Хаос","Квазаровый Бегун-Психопат","Квазаровый Бегун-Психопат"],"tint":"#1c2844","ember":"#ffe38a","mob":"Квазаровый Бегун-Психопат","general":"Квазаровый Бегун-Психопат","boss":"Квазаровый Бегун-Психопат","bossTitle":"в файле нет босса: этап закрывается толпой","goal":"pack","srcHp":95000,"srcAtk":6800,"file":"public/shadow-world/js/dungeons/14_astral_sanctuary.js","gSig":"curse","bSig":"circle","gRow":46,"bRow":3,"mobRows":[12,8,24],"minLvl":130,"mut":0,"xp":55,"spawnGeneral":0},{"n":117,"sw":"dungeon_astral_sanctuary","dungeon":14,"stage":10,"stagesInDungeon":12,"name":"Ярус 10: Астральный Хаос","dungeonName":"Астральное Святилище Звёзд","desc":"Обитель безумных звёздных духов и космических аномалий, где законы физики разорваны в клочья.","wave":["Ярус 10: Астральный Хаос","Квазаровый Бегун-Психопат","Квазаровый Бегун-Психопат"],"tint":"#1c2844","ember":"#ffe38a","mob":"Квазаровый Бегун-Психопат","general":"Квазаровый Бегун-Психопат","boss":"Квазаровый Бегун-Психопат","bossTitle":"в файле нет босса: этап закрывается толпой","goal":"pack","srcHp":95000,"srcAtk":6800,"file":"public/shadow-world/js/dungeons/14_astral_sanctuary.js","gSig":"curse","bSig":"circle","gRow":46,"bRow":3,"mobRows":[12,8,24],"minLvl":130,"mut":0,"xp":55,"spawnGeneral":0},{"n":118,"sw":"dungeon_astral_sanctuary","dungeon":14,"stage":11,"stagesInDungeon":12,"name":"Ярус 11: Астральный Хаос","dungeonName":"Астральное Святилище Звёзд","desc":"Обитель безумных звёздных духов и космических аномалий, где законы физики разорваны в клочья.","wave":["Ярус 11: Астральный Хаос","Квазаровый Бегун-Психопат","Квазаровый Бегун-Психопат"],"tint":"#1c2844","ember":"#ffe38a","mob":"Квазаровый Бегун-Психопат","general":"Квазаровый Бегун-Психопат","boss":"Квазаровый Бегун-Психопат","bossTitle":"в файле нет босса: этап закрывается толпой","goal":"pack","srcHp":95000,"srcAtk":6800,"file":"public/shadow-world/js/dungeons/14_astral_sanctuary.js","gSig":"curse","bSig":"circle","gRow":46,"bRow":3,"mobRows":[12,8,24],"minLvl":130,"mut":0,"xp":55,"spawnGeneral":0},{"n":119,"sw":"dungeon_astral_sanctuary","dungeon":14,"stage":12,"stagesInDungeon":12,"name":"Чертог Владыки (Этаж 12)","dungeonName":"Астральное Святилище Звёзд","desc":"Обитель безумных звёздных духов и космических аномалий, где законы физики разорваны в клочья.","wave":["Чертог Владыки (Этаж 12)","Страж Трона","Демиург Селестия"],"tint":"#1c2844","ember":"#ffe38a","mob":"Страж Трона","general":"Страж Трона","boss":"Демиург Селестия","bossTitle":"босс этапа из файла данжа","goal":"boss","srcHp":280000,"srcAtk":8900,"file":"public/shadow-world/js/dungeons/14_astral_sanctuary.js","gSig":"curse","bSig":"circle","gRow":46,"bRow":3,"mobRows":[12,8,24],"minLvl":130,"mut":10,"xp":1287879,"spawnGeneral":1,"story":"sq_as"},{"n":120,"sw":"dungeon_oblivion_depths","dungeon":15,"stage":1,"stagesInDungeon":15,"name":"Ярус 1: Небытие","dungeonName":"Глубины Небытия","desc":"Истинная тьма и обитель абсолютной энтропии, где растворяются последние крупицы пространства и времени.","wave":["Ярус 1: Небытие","Тень Забвения","Тень Забвения"],"tint":"#160818","ember":"#d7b6ff","mob":"Тень Забвения","general":"Тень Забвения","boss":"Тень Забвения","bossTitle":"в файле нет босса: этап закрывается толпой","goal":"pack","srcHp":120000,"srcAtk":7200,"file":"public/shadow-world/js/dungeons/15_oblivion_depths.js","gSig":"summon","bSig":"cone","gRow":38,"bRow":22,"mobRows":[15,23,33],"minLvl":150,"mut":0,"xp":55,"spawnGeneral":0},{"n":121,"sw":"dungeon_oblivion_depths","dungeon":15,"stage":2,"stagesInDungeon":15,"name":"Ярус 2: Небытие","dungeonName":"Глубины Небытия","desc":"Истинная тьма и обитель абсолютной энтропии, где растворяются последние крупицы пространства и времени.","wave":["Ярус 2: Небытие","Тень Забвения","Тень Забвения"],"tint":"#160818","ember":"#d7b6ff","mob":"Тень Забвения","general":"Тень Забвения","boss":"Тень Забвения","bossTitle":"в файле нет босса: этап закрывается толпой","goal":"pack","srcHp":120000,"srcAtk":7200,"file":"public/shadow-world/js/dungeons/15_oblivion_depths.js","gSig":"summon","bSig":"cone","gRow":38,"bRow":22,"mobRows":[15,23,33],"minLvl":150,"mut":0,"xp":55,"spawnGeneral":0},{"n":122,"sw":"dungeon_oblivion_depths","dungeon":15,"stage":3,"stagesInDungeon":15,"name":"Ярус 3: Небытие","dungeonName":"Глубины Небытия","desc":"Истинная тьма и обитель абсолютной энтропии, где растворяются последние крупицы пространства и времени.","wave":["Ярус 3: Небытие","Тень Забвения","Тень Забвения"],"tint":"#160818","ember":"#d7b6ff","mob":"Тень Забвения","general":"Тень Забвения","boss":"Тень Забвения","bossTitle":"в файле нет босса: этап закрывается толпой","goal":"pack","srcHp":120000,"srcAtk":7200,"file":"public/shadow-world/js/dungeons/15_oblivion_depths.js","gSig":"summon","bSig":"cone","gRow":38,"bRow":22,"mobRows":[15,23,33],"minLvl":150,"mut":0,"xp":55,"spawnGeneral":0},{"n":123,"sw":"dungeon_oblivion_depths","dungeon":15,"stage":4,"stagesInDungeon":15,"name":"Орда (Этаж 4)","dungeonName":"Глубины Небытия","desc":"Истинная тьма и обитель абсолютной энтропии, где растворяются последние крупицы пространства и времени.","wave":["Орда (Этаж 4)","Тень Забвения","Манифестация Энтропии"],"tint":"#160818","ember":"#d7b6ff","mob":"Тень Забвения","general":"Тень Забвения","boss":"Манифестация Энтропии","bossTitle":"элита этапа, отдельного босса в файле нет","goal":"elite","srcHp":120000,"srcAtk":7200,"file":"public/shadow-world/js/dungeons/15_oblivion_depths.js","gSig":"summon","bSig":"cone","gRow":38,"bRow":22,"mobRows":[15,23,33],"minLvl":150,"mut":0,"xp":55,"spawnGeneral":0},{"n":124,"sw":"dungeon_oblivion_depths","dungeon":15,"stage":5,"stagesInDungeon":15,"name":"Ярус 5: Небытие","dungeonName":"Глубины Небытия","desc":"Истинная тьма и обитель абсолютной энтропии, где растворяются последние крупицы пространства и времени.","wave":["Ярус 5: Небытие","Тень Забвения","Тень Забвения"],"tint":"#160818","ember":"#d7b6ff","mob":"Тень Забвения","general":"Тень Забвения","boss":"Тень Забвения","bossTitle":"в файле нет босса: этап закрывается толпой","goal":"pack","srcHp":120000,"srcAtk":7200,"file":"public/shadow-world/js/dungeons/15_oblivion_depths.js","gSig":"summon","bSig":"cone","gRow":38,"bRow":22,"mobRows":[15,23,33],"minLvl":150,"mut":0,"xp":55,"spawnGeneral":0},{"n":125,"sw":"dungeon_oblivion_depths","dungeon":15,"stage":6,"stagesInDungeon":15,"name":"Ярус 6: Небытие","dungeonName":"Глубины Небытия","desc":"Истинная тьма и обитель абсолютной энтропии, где растворяются последние крупицы пространства и времени.","wave":["Ярус 6: Небытие","Тень Забвения","Тень Забвения"],"tint":"#160818","ember":"#d7b6ff","mob":"Тень Забвения","general":"Тень Забвения","boss":"Тень Забвения","bossTitle":"в файле нет босса: этап закрывается толпой","goal":"pack","srcHp":120000,"srcAtk":7200,"file":"public/shadow-world/js/dungeons/15_oblivion_depths.js","gSig":"summon","bSig":"cone","gRow":38,"bRow":22,"mobRows":[15,23,33],"minLvl":150,"mut":0,"xp":55,"spawnGeneral":0},{"n":126,"sw":"dungeon_oblivion_depths","dungeon":15,"stage":7,"stagesInDungeon":15,"name":"Ярус 7: Небытие","dungeonName":"Глубины Небытия","desc":"Истинная тьма и обитель абсолютной энтропии, где растворяются последние крупицы пространства и времени.","wave":["Ярус 7: Небытие","Тень Забвения","Тень Забвения"],"tint":"#160818","ember":"#d7b6ff","mob":"Тень Забвения","general":"Тень Забвения","boss":"Тень Забвения","bossTitle":"в файле нет босса: этап закрывается толпой","goal":"pack","srcHp":120000,"srcAtk":7200,"file":"public/shadow-world/js/dungeons/15_oblivion_depths.js","gSig":"summon","bSig":"cone","gRow":38,"bRow":22,"mobRows":[15,23,33],"minLvl":150,"mut":0,"xp":55,"spawnGeneral":0},{"n":127,"sw":"dungeon_oblivion_depths","dungeon":15,"stage":8,"stagesInDungeon":15,"name":"Орда (Этаж 8)","dungeonName":"Глубины Небытия","desc":"Истинная тьма и обитель абсолютной энтропии, где растворяются последние крупицы пространства и времени.","wave":["Орда (Этаж 8)","Тень Забвения","Манифестация Энтропии"],"tint":"#160818","ember":"#d7b6ff","mob":"Тень Забвения","general":"Тень Забвения","boss":"Манифестация Энтропии","bossTitle":"элита этапа, отдельного босса в файле нет","goal":"elite","srcHp":120000,"srcAtk":7200,"file":"public/shadow-world/js/dungeons/15_oblivion_depths.js","gSig":"summon","bSig":"cone","gRow":38,"bRow":22,"mobRows":[15,23,33],"minLvl":150,"mut":0,"xp":55,"spawnGeneral":0},{"n":128,"sw":"dungeon_oblivion_depths","dungeon":15,"stage":9,"stagesInDungeon":15,"name":"Ярус 9: Небытие","dungeonName":"Глубины Небытия","desc":"Истинная тьма и обитель абсолютной энтропии, где растворяются последние крупицы пространства и времени.","wave":["Ярус 9: Небытие","Тень Забвения","Тень Забвения"],"tint":"#160818","ember":"#d7b6ff","mob":"Тень Забвения","general":"Тень Забвения","boss":"Тень Забвения","bossTitle":"в файле нет босса: этап закрывается толпой","goal":"pack","srcHp":120000,"srcAtk":7200,"file":"public/shadow-world/js/dungeons/15_oblivion_depths.js","gSig":"summon","bSig":"cone","gRow":38,"bRow":22,"mobRows":[15,23,33],"minLvl":150,"mut":0,"xp":55,"spawnGeneral":0},{"n":129,"sw":"dungeon_oblivion_depths","dungeon":15,"stage":10,"stagesInDungeon":15,"name":"Ярус 10: Небытие","dungeonName":"Глубины Небытия","desc":"Истинная тьма и обитель абсолютной энтропии, где растворяются последние крупицы пространства и времени.","wave":["Ярус 10: Небытие","Тень Забвения","Тень Забвения"],"tint":"#160818","ember":"#d7b6ff","mob":"Тень Забвения","general":"Тень Забвения","boss":"Тень Забвения","bossTitle":"в файле нет босса: этап закрывается толпой","goal":"pack","srcHp":120000,"srcAtk":7200,"file":"public/shadow-world/js/dungeons/15_oblivion_depths.js","gSig":"summon","bSig":"cone","gRow":38,"bRow":22,"mobRows":[15,23,33],"minLvl":150,"mut":0,"xp":55,"spawnGeneral":0},{"n":130,"sw":"dungeon_oblivion_depths","dungeon":15,"stage":11,"stagesInDungeon":15,"name":"Ярус 11: Небытие","dungeonName":"Глубины Небытия","desc":"Истинная тьма и обитель абсолютной энтропии, где растворяются последние крупицы пространства и времени.","wave":["Ярус 11: Небытие","Тень Забвения","Тень Забвения"],"tint":"#160818","ember":"#d7b6ff","mob":"Тень Забвения","general":"Тень Забвения","boss":"Тень Забвения","bossTitle":"в файле нет босса: этап закрывается толпой","goal":"pack","srcHp":120000,"srcAtk":7200,"file":"public/shadow-world/js/dungeons/15_oblivion_depths.js","gSig":"summon","bSig":"cone","gRow":38,"bRow":22,"mobRows":[15,23,33],"minLvl":150,"mut":0,"xp":55,"spawnGeneral":0},{"n":131,"sw":"dungeon_oblivion_depths","dungeon":15,"stage":12,"stagesInDungeon":15,"name":"Орда (Этаж 12)","dungeonName":"Глубины Небытия","desc":"Истинная тьма и обитель абсолютной энтропии, где растворяются последние крупицы пространства и времени.","wave":["Орда (Этаж 12)","Тень Забвения","Манифестация Энтропии"],"tint":"#160818","ember":"#d7b6ff","mob":"Тень Забвения","general":"Тень Забвения","boss":"Манифестация Энтропии","bossTitle":"элита этапа, отдельного босса в файле нет","goal":"elite","srcHp":120000,"srcAtk":7200,"file":"public/shadow-world/js/dungeons/15_oblivion_depths.js","gSig":"summon","bSig":"cone","gRow":38,"bRow":22,"mobRows":[15,23,33],"minLvl":150,"mut":0,"xp":55,"spawnGeneral":0},{"n":132,"sw":"dungeon_oblivion_depths","dungeon":15,"stage":13,"stagesInDungeon":15,"name":"Ярус 13: Небытие","dungeonName":"Глубины Небытия","desc":"Истинная тьма и обитель абсолютной энтропии, где растворяются последние крупицы пространства и времени.","wave":["Ярус 13: Небытие","Тень Забвения","Тень Забвения"],"tint":"#160818","ember":"#d7b6ff","mob":"Тень Забвения","general":"Тень Забвения","boss":"Тень Забвения","bossTitle":"в файле нет босса: этап закрывается толпой","goal":"pack","srcHp":120000,"srcAtk":7200,"file":"public/shadow-world/js/dungeons/15_oblivion_depths.js","gSig":"summon","bSig":"cone","gRow":38,"bRow":22,"mobRows":[15,23,33],"minLvl":150,"mut":0,"xp":55,"spawnGeneral":0},{"n":133,"sw":"dungeon_oblivion_depths","dungeon":15,"stage":14,"stagesInDungeon":15,"name":"Ярус 14: Небытие","dungeonName":"Глубины Небытия","desc":"Истинная тьма и обитель абсолютной энтропии, где растворяются последние крупицы пространства и времени.","wave":["Ярус 14: Небытие","Тень Забвения","Тень Забвения"],"tint":"#160818","ember":"#d7b6ff","mob":"Тень Забвения","general":"Тень Забвения","boss":"Тень Забвения","bossTitle":"в файле нет босса: этап закрывается толпой","goal":"pack","srcHp":120000,"srcAtk":7200,"file":"public/shadow-world/js/dungeons/15_oblivion_depths.js","gSig":"summon","bSig":"cone","gRow":38,"bRow":22,"mobRows":[15,23,33],"minLvl":150,"mut":0,"xp":55,"spawnGeneral":0},{"n":134,"sw":"dungeon_oblivion_depths","dungeon":15,"stage":15,"stagesInDungeon":15,"name":"Чертог Владыки (Этаж 15)","dungeonName":"Глубины Небытия","desc":"Истинная тьма и обитель абсолютной энтропии, где растворяются последние крупицы пространства и времени.","wave":["Чертог Владыки (Этаж 15)","Страж Трона","Владыка Энтропия"],"tint":"#160818","ember":"#d7b6ff","mob":"Страж Трона","general":"Страж Трона","boss":"Владыка Энтропия","bossTitle":"босс этапа из файла данжа","goal":"boss","srcHp":400000,"srcAtk":11000,"file":"public/shadow-world/js/dungeons/15_oblivion_depths.js","gSig":"summon","bSig":"cone","gRow":38,"bRow":22,"mobRows":[15,23,33],"minLvl":150,"mut":10,"xp":1999803,"spawnGeneral":1,"story":"sq_od"},{"n":135,"sw":"dungeon_chronos_engine","dungeon":16,"stage":1,"stagesInDungeon":15,"name":"Ярус 1: Время","dungeonName":"Сердце Вечного Времени","desc":"Сложный часовой механизм вселенной, где тиканье шестеренок определяет законы физики, а время подвластно лишь избранным.","wave":["Ярус 1: Время","Автоматон","Автоматон"],"tint":"#2c2618","ember":"#ffd27a","mob":"Автоматон","general":"Автоматон","boss":"Автоматон","bossTitle":"в файле нет босса: этап закрывается толпой","goal":"pack","srcHp":190000,"srcAtk":10500,"file":"public/shadow-world/js/dungeons/16_chronos_engine.js","gSig":"circle","bSig":"line","gRow":40,"bRow":18,"mobRows":[17,9,43],"minLvl":175,"mut":0,"xp":55,"spawnGeneral":0},{"n":136,"sw":"dungeon_chronos_engine","dungeon":16,"stage":2,"stagesInDungeon":15,"name":"Ярус 2: Время","dungeonName":"Сердце Вечного Времени","desc":"Сложный часовой механизм вселенной, где тиканье шестеренок определяет законы физики, а время подвластно лишь избранным.","wave":["Ярус 2: Время","Автоматон","Автоматон"],"tint":"#2c2618","ember":"#ffd27a","mob":"Автоматон","general":"Автоматон","boss":"Автоматон","bossTitle":"в файле нет босса: этап закрывается толпой","goal":"pack","srcHp":190000,"srcAtk":10500,"file":"public/shadow-world/js/dungeons/16_chronos_engine.js","gSig":"circle","bSig":"line","gRow":40,"bRow":18,"mobRows":[17,9,43],"minLvl":175,"mut":0,"xp":55,"spawnGeneral":0},{"n":137,"sw":"dungeon_chronos_engine","dungeon":16,"stage":3,"stagesInDungeon":15,"name":"Ярус 3: Время","dungeonName":"Сердце Вечного Времени","desc":"Сложный часовой механизм вселенной, где тиканье шестеренок определяет законы физики, а время подвластно лишь избранным.","wave":["Ярус 3: Время","Автоматон","Автоматон"],"tint":"#2c2618","ember":"#ffd27a","mob":"Автоматон","general":"Автоматон","boss":"Автоматон","bossTitle":"в файле нет босса: этап закрывается толпой","goal":"pack","srcHp":190000,"srcAtk":10500,"file":"public/shadow-world/js/dungeons/16_chronos_engine.js","gSig":"circle","bSig":"line","gRow":40,"bRow":18,"mobRows":[17,9,43],"minLvl":175,"mut":0,"xp":55,"spawnGeneral":0},{"n":138,"sw":"dungeon_chronos_engine","dungeon":16,"stage":4,"stagesInDungeon":15,"name":"Орда (Этаж 4)","dungeonName":"Сердце Вечного Времени","desc":"Сложный часовой механизм вселенной, где тиканье шестеренок определяет законы физики, а время подвластно лишь избранным.","wave":["Орда (Этаж 4)","Автоматон","Элитный Темпоральный Надзиратель"],"tint":"#2c2618","ember":"#ffd27a","mob":"Автоматон","general":"Автоматон","boss":"Элитный Темпоральный Надзиратель","bossTitle":"элита этапа, отдельного босса в файле нет","goal":"elite","srcHp":190000,"srcAtk":10500,"file":"public/shadow-world/js/dungeons/16_chronos_engine.js","gSig":"circle","bSig":"line","gRow":40,"bRow":18,"mobRows":[17,9,43],"minLvl":175,"mut":0,"xp":55,"spawnGeneral":0},{"n":139,"sw":"dungeon_chronos_engine","dungeon":16,"stage":5,"stagesInDungeon":15,"name":"Ярус 5: Время","dungeonName":"Сердце Вечного Времени","desc":"Сложный часовой механизм вселенной, где тиканье шестеренок определяет законы физики, а время подвластно лишь избранным.","wave":["Ярус 5: Время","Автоматон","Автоматон"],"tint":"#2c2618","ember":"#ffd27a","mob":"Автоматон","general":"Автоматон","boss":"Автоматон","bossTitle":"в файле нет босса: этап закрывается толпой","goal":"pack","srcHp":190000,"srcAtk":10500,"file":"public/shadow-world/js/dungeons/16_chronos_engine.js","gSig":"circle","bSig":"line","gRow":40,"bRow":18,"mobRows":[17,9,43],"minLvl":175,"mut":0,"xp":55,"spawnGeneral":0},{"n":140,"sw":"dungeon_chronos_engine","dungeon":16,"stage":6,"stagesInDungeon":15,"name":"Ярус 6: Время","dungeonName":"Сердце Вечного Времени","desc":"Сложный часовой механизм вселенной, где тиканье шестеренок определяет законы физики, а время подвластно лишь избранным.","wave":["Ярус 6: Время","Автоматон","Автоматон"],"tint":"#2c2618","ember":"#ffd27a","mob":"Автоматон","general":"Автоматон","boss":"Автоматон","bossTitle":"в файле нет босса: этап закрывается толпой","goal":"pack","srcHp":190000,"srcAtk":10500,"file":"public/shadow-world/js/dungeons/16_chronos_engine.js","gSig":"circle","bSig":"line","gRow":40,"bRow":18,"mobRows":[17,9,43],"minLvl":175,"mut":0,"xp":55,"spawnGeneral":0},{"n":141,"sw":"dungeon_chronos_engine","dungeon":16,"stage":7,"stagesInDungeon":15,"name":"Ярус 7: Время","dungeonName":"Сердце Вечного Времени","desc":"Сложный часовой механизм вселенной, где тиканье шестеренок определяет законы физики, а время подвластно лишь избранным.","wave":["Ярус 7: Время","Автоматон","Автоматон"],"tint":"#2c2618","ember":"#ffd27a","mob":"Автоматон","general":"Автоматон","boss":"Автоматон","bossTitle":"в файле нет босса: этап закрывается толпой","goal":"pack","srcHp":190000,"srcAtk":10500,"file":"public/shadow-world/js/dungeons/16_chronos_engine.js","gSig":"circle","bSig":"line","gRow":40,"bRow":18,"mobRows":[17,9,43],"minLvl":175,"mut":0,"xp":55,"spawnGeneral":0},{"n":142,"sw":"dungeon_chronos_engine","dungeon":16,"stage":8,"stagesInDungeon":15,"name":"Орда (Этаж 8)","dungeonName":"Сердце Вечного Времени","desc":"Сложный часовой механизм вселенной, где тиканье шестеренок определяет законы физики, а время подвластно лишь избранным.","wave":["Орда (Этаж 8)","Автоматон","Элитный Темпоральный Надзиратель"],"tint":"#2c2618","ember":"#ffd27a","mob":"Автоматон","general":"Автоматон","boss":"Элитный Темпоральный Надзиратель","bossTitle":"элита этапа, отдельного босса в файле нет","goal":"elite","srcHp":190000,"srcAtk":10500,"file":"public/shadow-world/js/dungeons/16_chronos_engine.js","gSig":"circle","bSig":"line","gRow":40,"bRow":18,"mobRows":[17,9,43],"minLvl":175,"mut":0,"xp":55,"spawnGeneral":0},{"n":143,"sw":"dungeon_chronos_engine","dungeon":16,"stage":9,"stagesInDungeon":15,"name":"Ярус 9: Время","dungeonName":"Сердце Вечного Времени","desc":"Сложный часовой механизм вселенной, где тиканье шестеренок определяет законы физики, а время подвластно лишь избранным.","wave":["Ярус 9: Время","Автоматон","Автоматон"],"tint":"#2c2618","ember":"#ffd27a","mob":"Автоматон","general":"Автоматон","boss":"Автоматон","bossTitle":"в файле нет босса: этап закрывается толпой","goal":"pack","srcHp":190000,"srcAtk":10500,"file":"public/shadow-world/js/dungeons/16_chronos_engine.js","gSig":"circle","bSig":"line","gRow":40,"bRow":18,"mobRows":[17,9,43],"minLvl":175,"mut":0,"xp":55,"spawnGeneral":0},{"n":144,"sw":"dungeon_chronos_engine","dungeon":16,"stage":10,"stagesInDungeon":15,"name":"Ярус 10: Время","dungeonName":"Сердце Вечного Времени","desc":"Сложный часовой механизм вселенной, где тиканье шестеренок определяет законы физики, а время подвластно лишь избранным.","wave":["Ярус 10: Время","Автоматон","Автоматон"],"tint":"#2c2618","ember":"#ffd27a","mob":"Автоматон","general":"Автоматон","boss":"Автоматон","bossTitle":"в файле нет босса: этап закрывается толпой","goal":"pack","srcHp":190000,"srcAtk":10500,"file":"public/shadow-world/js/dungeons/16_chronos_engine.js","gSig":"circle","bSig":"line","gRow":40,"bRow":18,"mobRows":[17,9,43],"minLvl":175,"mut":0,"xp":55,"spawnGeneral":0},{"n":145,"sw":"dungeon_chronos_engine","dungeon":16,"stage":11,"stagesInDungeon":15,"name":"Ярус 11: Время","dungeonName":"Сердце Вечного Времени","desc":"Сложный часовой механизм вселенной, где тиканье шестеренок определяет законы физики, а время подвластно лишь избранным.","wave":["Ярус 11: Время","Автоматон","Автоматон"],"tint":"#2c2618","ember":"#ffd27a","mob":"Автоматон","general":"Автоматон","boss":"Автоматон","bossTitle":"в файле нет босса: этап закрывается толпой","goal":"pack","srcHp":190000,"srcAtk":10500,"file":"public/shadow-world/js/dungeons/16_chronos_engine.js","gSig":"circle","bSig":"line","gRow":40,"bRow":18,"mobRows":[17,9,43],"minLvl":175,"mut":0,"xp":55,"spawnGeneral":0},{"n":146,"sw":"dungeon_chronos_engine","dungeon":16,"stage":12,"stagesInDungeon":15,"name":"Орда (Этаж 12)","dungeonName":"Сердце Вечного Времени","desc":"Сложный часовой механизм вселенной, где тиканье шестеренок определяет законы физики, а время подвластно лишь избранным.","wave":["Орда (Этаж 12)","Автоматон","Элитный Темпоральный Надзиратель"],"tint":"#2c2618","ember":"#ffd27a","mob":"Автоматон","general":"Автоматон","boss":"Элитный Темпоральный Надзиратель","bossTitle":"элита этапа, отдельного босса в файле нет","goal":"elite","srcHp":190000,"srcAtk":10500,"file":"public/shadow-world/js/dungeons/16_chronos_engine.js","gSig":"circle","bSig":"line","gRow":40,"bRow":18,"mobRows":[17,9,43],"minLvl":175,"mut":0,"xp":55,"spawnGeneral":0},{"n":147,"sw":"dungeon_chronos_engine","dungeon":16,"stage":13,"stagesInDungeon":15,"name":"Ярус 13: Время","dungeonName":"Сердце Вечного Времени","desc":"Сложный часовой механизм вселенной, где тиканье шестеренок определяет законы физики, а время подвластно лишь избранным.","wave":["Ярус 13: Время","Автоматон","Автоматон"],"tint":"#2c2618","ember":"#ffd27a","mob":"Автоматон","general":"Автоматон","boss":"Автоматон","bossTitle":"в файле нет босса: этап закрывается толпой","goal":"pack","srcHp":190000,"srcAtk":10500,"file":"public/shadow-world/js/dungeons/16_chronos_engine.js","gSig":"circle","bSig":"line","gRow":40,"bRow":18,"mobRows":[17,9,43],"minLvl":175,"mut":0,"xp":55,"spawnGeneral":0},{"n":148,"sw":"dungeon_chronos_engine","dungeon":16,"stage":14,"stagesInDungeon":15,"name":"Ярус 14: Время","dungeonName":"Сердце Вечного Времени","desc":"Сложный часовой механизм вселенной, где тиканье шестеренок определяет законы физики, а время подвластно лишь избранным.","wave":["Ярус 14: Время","Автоматон","Автоматон"],"tint":"#2c2618","ember":"#ffd27a","mob":"Автоматон","general":"Автоматон","boss":"Автоматон","bossTitle":"в файле нет босса: этап закрывается толпой","goal":"pack","srcHp":190000,"srcAtk":10500,"file":"public/shadow-world/js/dungeons/16_chronos_engine.js","gSig":"circle","bSig":"line","gRow":40,"bRow":18,"mobRows":[17,9,43],"minLvl":175,"mut":0,"xp":55,"spawnGeneral":0},{"n":149,"sw":"dungeon_chronos_engine","dungeon":16,"stage":15,"stagesInDungeon":15,"name":"Чертог Владыки (Этаж 15)","dungeonName":"Сердце Вечного Времени","desc":"Сложный часовой механизм вселенной, где тиканье шестеренок определяет законы физики, а время подвластно лишь избранным.","wave":["Чертог Владыки (Этаж 15)","Страж Трона","Хронос Прайм"],"tint":"#2c2618","ember":"#ffd27a","mob":"Страж Трона","general":"Страж Трона","boss":"Хронос Прайм","bossTitle":"босс этапа из файла данжа","goal":"boss","srcHp":650000,"srcAtk":16000,"file":"public/shadow-world/js/dungeons/16_chronos_engine.js","gSig":"circle","bSig":"line","gRow":40,"bRow":18,"mobRows":[17,9,43],"minLvl":175,"mut":10,"xp":17480223,"spawnGeneral":1,"story":"sq_ce"},{"n":150,"sw":"dungeon_null_dimension","dungeon":17,"stage":1,"stagesInDungeon":20,"name":"Ярус 1: Нуль-Измерение","dungeonName":"Нуль-Измерение Создателя","desc":"Финальный рубеж мультивселенной. Бескомпромиссный босс-раш сквозь 20 этажей абсолютного хаоса перед лицом самого Создателя.","wave":["Ярус 1: Нуль-Измерение","Нуль-Разрушитель","Нуль-Разрушитель"],"tint":"#120810","ember":"#f4f4f5","mob":"Нуль-Разрушитель","general":"Нуль-Разрушитель","boss":"Нуль-Разрушитель","bossTitle":"в файле нет босса: этап закрывается толпой","goal":"pack","srcHp":1500000,"srcAtk":42000,"file":"public/shadow-world/js/dungeons/17_null_dimension.js","gSig":"cone","bSig":"curse","gRow":66,"bRow":14,"mobRows":[13,47,55],"minLvl":300,"mut":0,"xp":55,"spawnGeneral":0},{"n":151,"sw":"dungeon_null_dimension","dungeon":17,"stage":2,"stagesInDungeon":20,"name":"Ярус 2: Нуль-Измерение","dungeonName":"Нуль-Измерение Создателя","desc":"Финальный рубеж мультивселенной. Бескомпромиссный босс-раш сквозь 20 этажей абсолютного хаоса перед лицом самого Создателя.","wave":["Ярус 2: Нуль-Измерение","Нуль-Разрушитель","Нуль-Разрушитель"],"tint":"#120810","ember":"#f4f4f5","mob":"Нуль-Разрушитель","general":"Нуль-Разрушитель","boss":"Нуль-Разрушитель","bossTitle":"в файле нет босса: этап закрывается толпой","goal":"pack","srcHp":1500000,"srcAtk":42000,"file":"public/shadow-world/js/dungeons/17_null_dimension.js","gSig":"cone","bSig":"curse","gRow":66,"bRow":14,"mobRows":[13,47,55],"minLvl":300,"mut":0,"xp":55,"spawnGeneral":0},{"n":152,"sw":"dungeon_null_dimension","dungeon":17,"stage":3,"stagesInDungeon":20,"name":"Ярус 3: Нуль-Измерение","dungeonName":"Нуль-Измерение Создателя","desc":"Финальный рубеж мультивселенной. Бескомпромиссный босс-раш сквозь 20 этажей абсолютного хаоса перед лицом самого Создателя.","wave":["Ярус 3: Нуль-Измерение","Нуль-Разрушитель","Нуль-Разрушитель"],"tint":"#120810","ember":"#f4f4f5","mob":"Нуль-Разрушитель","general":"Нуль-Разрушитель","boss":"Нуль-Разрушитель","bossTitle":"в файле нет босса: этап закрывается толпой","goal":"pack","srcHp":1500000,"srcAtk":42000,"file":"public/shadow-world/js/dungeons/17_null_dimension.js","gSig":"cone","bSig":"curse","gRow":66,"bRow":14,"mobRows":[13,47,55],"minLvl":300,"mut":0,"xp":55,"spawnGeneral":0},{"n":153,"sw":"dungeon_null_dimension","dungeon":17,"stage":4,"stagesInDungeon":20,"name":"Орда (Этаж 4)","dungeonName":"Нуль-Измерение Создателя","desc":"Финальный рубеж мультивселенной. Бескомпромиссный босс-раш сквозь 20 этажей абсолютного хаоса перед лицом самого Создателя.","wave":["Орда (Этаж 4)","Нуль-Разрушитель","Аватар Абсолюта"],"tint":"#120810","ember":"#f4f4f5","mob":"Нуль-Разрушитель","general":"Нуль-Разрушитель","boss":"Аватар Абсолюта","bossTitle":"элита этапа, отдельного босса в файле нет","goal":"elite","srcHp":1500000,"srcAtk":42000,"file":"public/shadow-world/js/dungeons/17_null_dimension.js","gSig":"cone","bSig":"curse","gRow":66,"bRow":14,"mobRows":[13,47,55],"minLvl":300,"mut":0,"xp":55,"spawnGeneral":0},{"n":154,"sw":"dungeon_null_dimension","dungeon":17,"stage":5,"stagesInDungeon":20,"name":"Ярус 5: Нуль-Измерение","dungeonName":"Нуль-Измерение Создателя","desc":"Финальный рубеж мультивселенной. Бескомпромиссный босс-раш сквозь 20 этажей абсолютного хаоса перед лицом самого Создателя.","wave":["Ярус 5: Нуль-Измерение","Нуль-Разрушитель","Нуль-Разрушитель"],"tint":"#120810","ember":"#f4f4f5","mob":"Нуль-Разрушитель","general":"Нуль-Разрушитель","boss":"Нуль-Разрушитель","bossTitle":"в файле нет босса: этап закрывается толпой","goal":"pack","srcHp":1500000,"srcAtk":42000,"file":"public/shadow-world/js/dungeons/17_null_dimension.js","gSig":"cone","bSig":"curse","gRow":66,"bRow":14,"mobRows":[13,47,55],"minLvl":300,"mut":0,"xp":55,"spawnGeneral":0},{"n":155,"sw":"dungeon_null_dimension","dungeon":17,"stage":6,"stagesInDungeon":20,"name":"Ярус 6: Нуль-Измерение","dungeonName":"Нуль-Измерение Создателя","desc":"Финальный рубеж мультивселенной. Бескомпромиссный босс-раш сквозь 20 этажей абсолютного хаоса перед лицом самого Создателя.","wave":["Ярус 6: Нуль-Измерение","Нуль-Разрушитель","Нуль-Разрушитель"],"tint":"#120810","ember":"#f4f4f5","mob":"Нуль-Разрушитель","general":"Нуль-Разрушитель","boss":"Нуль-Разрушитель","bossTitle":"в файле нет босса: этап закрывается толпой","goal":"pack","srcHp":1500000,"srcAtk":42000,"file":"public/shadow-world/js/dungeons/17_null_dimension.js","gSig":"cone","bSig":"curse","gRow":66,"bRow":14,"mobRows":[13,47,55],"minLvl":300,"mut":0,"xp":55,"spawnGeneral":0},{"n":156,"sw":"dungeon_null_dimension","dungeon":17,"stage":7,"stagesInDungeon":20,"name":"Ярус 7: Нуль-Измерение","dungeonName":"Нуль-Измерение Создателя","desc":"Финальный рубеж мультивселенной. Бескомпромиссный босс-раш сквозь 20 этажей абсолютного хаоса перед лицом самого Создателя.","wave":["Ярус 7: Нуль-Измерение","Нуль-Разрушитель","Нуль-Разрушитель"],"tint":"#120810","ember":"#f4f4f5","mob":"Нуль-Разрушитель","general":"Нуль-Разрушитель","boss":"Нуль-Разрушитель","bossTitle":"в файле нет босса: этап закрывается толпой","goal":"pack","srcHp":1500000,"srcAtk":42000,"file":"public/shadow-world/js/dungeons/17_null_dimension.js","gSig":"cone","bSig":"curse","gRow":66,"bRow":14,"mobRows":[13,47,55],"minLvl":300,"mut":0,"xp":55,"spawnGeneral":0},{"n":157,"sw":"dungeon_null_dimension","dungeon":17,"stage":8,"stagesInDungeon":20,"name":"Орда (Этаж 8)","dungeonName":"Нуль-Измерение Создателя","desc":"Финальный рубеж мультивселенной. Бескомпромиссный босс-раш сквозь 20 этажей абсолютного хаоса перед лицом самого Создателя.","wave":["Орда (Этаж 8)","Нуль-Разрушитель","Аватар Абсолюта"],"tint":"#120810","ember":"#f4f4f5","mob":"Нуль-Разрушитель","general":"Нуль-Разрушитель","boss":"Аватар Абсолюта","bossTitle":"элита этапа, отдельного босса в файле нет","goal":"elite","srcHp":1500000,"srcAtk":42000,"file":"public/shadow-world/js/dungeons/17_null_dimension.js","gSig":"cone","bSig":"curse","gRow":66,"bRow":14,"mobRows":[13,47,55],"minLvl":300,"mut":0,"xp":55,"spawnGeneral":0},{"n":158,"sw":"dungeon_null_dimension","dungeon":17,"stage":9,"stagesInDungeon":20,"name":"Ярус 9: Нуль-Измерение","dungeonName":"Нуль-Измерение Создателя","desc":"Финальный рубеж мультивселенной. Бескомпромиссный босс-раш сквозь 20 этажей абсолютного хаоса перед лицом самого Создателя.","wave":["Ярус 9: Нуль-Измерение","Нуль-Разрушитель","Нуль-Разрушитель"],"tint":"#120810","ember":"#f4f4f5","mob":"Нуль-Разрушитель","general":"Нуль-Разрушитель","boss":"Нуль-Разрушитель","bossTitle":"в файле нет босса: этап закрывается толпой","goal":"pack","srcHp":1500000,"srcAtk":42000,"file":"public/shadow-world/js/dungeons/17_null_dimension.js","gSig":"cone","bSig":"curse","gRow":66,"bRow":14,"mobRows":[13,47,55],"minLvl":300,"mut":0,"xp":55,"spawnGeneral":0},{"n":159,"sw":"dungeon_null_dimension","dungeon":17,"stage":10,"stagesInDungeon":20,"name":"Ярус 10: Нуль-Измерение","dungeonName":"Нуль-Измерение Создателя","desc":"Финальный рубеж мультивселенной. Бескомпромиссный босс-раш сквозь 20 этажей абсолютного хаоса перед лицом самого Создателя.","wave":["Ярус 10: Нуль-Измерение","Нуль-Разрушитель","Нуль-Разрушитель"],"tint":"#120810","ember":"#f4f4f5","mob":"Нуль-Разрушитель","general":"Нуль-Разрушитель","boss":"Нуль-Разрушитель","bossTitle":"в файле нет босса: этап закрывается толпой","goal":"pack","srcHp":1500000,"srcAtk":42000,"file":"public/shadow-world/js/dungeons/17_null_dimension.js","gSig":"cone","bSig":"curse","gRow":66,"bRow":14,"mobRows":[13,47,55],"minLvl":300,"mut":0,"xp":55,"spawnGeneral":0},{"n":160,"sw":"dungeon_null_dimension","dungeon":17,"stage":11,"stagesInDungeon":20,"name":"Ярус 11: Нуль-Измерение","dungeonName":"Нуль-Измерение Создателя","desc":"Финальный рубеж мультивселенной. Бескомпромиссный босс-раш сквозь 20 этажей абсолютного хаоса перед лицом самого Создателя.","wave":["Ярус 11: Нуль-Измерение","Нуль-Разрушитель","Нуль-Разрушитель"],"tint":"#120810","ember":"#f4f4f5","mob":"Нуль-Разрушитель","general":"Нуль-Разрушитель","boss":"Нуль-Разрушитель","bossTitle":"в файле нет босса: этап закрывается толпой","goal":"pack","srcHp":1500000,"srcAtk":42000,"file":"public/shadow-world/js/dungeons/17_null_dimension.js","gSig":"cone","bSig":"curse","gRow":66,"bRow":14,"mobRows":[13,47,55],"minLvl":300,"mut":0,"xp":55,"spawnGeneral":0},{"n":161,"sw":"dungeon_null_dimension","dungeon":17,"stage":12,"stagesInDungeon":20,"name":"Орда (Этаж 12)","dungeonName":"Нуль-Измерение Создателя","desc":"Финальный рубеж мультивселенной. Бескомпромиссный босс-раш сквозь 20 этажей абсолютного хаоса перед лицом самого Создателя.","wave":["Орда (Этаж 12)","Нуль-Разрушитель","Аватар Абсолюта"],"tint":"#120810","ember":"#f4f4f5","mob":"Нуль-Разрушитель","general":"Нуль-Разрушитель","boss":"Аватар Абсолюта","bossTitle":"элита этапа, отдельного босса в файле нет","goal":"elite","srcHp":1500000,"srcAtk":42000,"file":"public/shadow-world/js/dungeons/17_null_dimension.js","gSig":"cone","bSig":"curse","gRow":66,"bRow":14,"mobRows":[13,47,55],"minLvl":300,"mut":0,"xp":55,"spawnGeneral":0},{"n":162,"sw":"dungeon_null_dimension","dungeon":17,"stage":13,"stagesInDungeon":20,"name":"Ярус 13: Нуль-Измерение","dungeonName":"Нуль-Измерение Создателя","desc":"Финальный рубеж мультивселенной. Бескомпромиссный босс-раш сквозь 20 этажей абсолютного хаоса перед лицом самого Создателя.","wave":["Ярус 13: Нуль-Измерение","Нуль-Разрушитель","Нуль-Разрушитель"],"tint":"#120810","ember":"#f4f4f5","mob":"Нуль-Разрушитель","general":"Нуль-Разрушитель","boss":"Нуль-Разрушитель","bossTitle":"в файле нет босса: этап закрывается толпой","goal":"pack","srcHp":1500000,"srcAtk":42000,"file":"public/shadow-world/js/dungeons/17_null_dimension.js","gSig":"cone","bSig":"curse","gRow":66,"bRow":14,"mobRows":[13,47,55],"minLvl":300,"mut":0,"xp":55,"spawnGeneral":0},{"n":163,"sw":"dungeon_null_dimension","dungeon":17,"stage":14,"stagesInDungeon":20,"name":"Ярус 14: Нуль-Измерение","dungeonName":"Нуль-Измерение Создателя","desc":"Финальный рубеж мультивселенной. Бескомпромиссный босс-раш сквозь 20 этажей абсолютного хаоса перед лицом самого Создателя.","wave":["Ярус 14: Нуль-Измерение","Нуль-Разрушитель","Нуль-Разрушитель"],"tint":"#120810","ember":"#f4f4f5","mob":"Нуль-Разрушитель","general":"Нуль-Разрушитель","boss":"Нуль-Разрушитель","bossTitle":"в файле нет босса: этап закрывается толпой","goal":"pack","srcHp":1500000,"srcAtk":42000,"file":"public/shadow-world/js/dungeons/17_null_dimension.js","gSig":"cone","bSig":"curse","gRow":66,"bRow":14,"mobRows":[13,47,55],"minLvl":300,"mut":0,"xp":55,"spawnGeneral":0},{"n":164,"sw":"dungeon_null_dimension","dungeon":17,"stage":15,"stagesInDungeon":20,"name":"Ярус 15: Нуль-Измерение","dungeonName":"Нуль-Измерение Создателя","desc":"Финальный рубеж мультивселенной. Бескомпромиссный босс-раш сквозь 20 этажей абсолютного хаоса перед лицом самого Создателя.","wave":["Ярус 15: Нуль-Измерение","Нуль-Разрушитель","Нуль-Разрушитель"],"tint":"#120810","ember":"#f4f4f5","mob":"Нуль-Разрушитель","general":"Нуль-Разрушитель","boss":"Нуль-Разрушитель","bossTitle":"в файле нет босса: этап закрывается толпой","goal":"pack","srcHp":1500000,"srcAtk":42000,"file":"public/shadow-world/js/dungeons/17_null_dimension.js","gSig":"cone","bSig":"curse","gRow":66,"bRow":14,"mobRows":[13,47,55],"minLvl":300,"mut":0,"xp":55,"spawnGeneral":0},{"n":165,"sw":"dungeon_null_dimension","dungeon":17,"stage":16,"stagesInDungeon":20,"name":"Ярус 16: Нуль-Измерение","dungeonName":"Нуль-Измерение Создателя","desc":"Финальный рубеж мультивселенной. Бескомпромиссный босс-раш сквозь 20 этажей абсолютного хаоса перед лицом самого Создателя.","wave":["Ярус 16: Нуль-Измерение","Нуль-Разрушитель","Нуль-Разрушитель"],"tint":"#120810","ember":"#f4f4f5","mob":"Нуль-Разрушитель","general":"Нуль-Разрушитель","boss":"Нуль-Разрушитель","bossTitle":"в файле нет босса: этап закрывается толпой","goal":"pack","srcHp":1500000,"srcAtk":42000,"file":"public/shadow-world/js/dungeons/17_null_dimension.js","gSig":"cone","bSig":"curse","gRow":66,"bRow":14,"mobRows":[13,47,55],"minLvl":300,"mut":0,"xp":55,"spawnGeneral":0},{"n":166,"sw":"dungeon_null_dimension","dungeon":17,"stage":17,"stagesInDungeon":20,"name":"Ярус 17: Нуль-Измерение","dungeonName":"Нуль-Измерение Создателя","desc":"Финальный рубеж мультивселенной. Бескомпромиссный босс-раш сквозь 20 этажей абсолютного хаоса перед лицом самого Создателя.","wave":["Ярус 17: Нуль-Измерение","Нуль-Разрушитель","Нуль-Разрушитель"],"tint":"#120810","ember":"#f4f4f5","mob":"Нуль-Разрушитель","general":"Нуль-Разрушитель","boss":"Нуль-Разрушитель","bossTitle":"в файле нет босса: этап закрывается толпой","goal":"pack","srcHp":1500000,"srcAtk":42000,"file":"public/shadow-world/js/dungeons/17_null_dimension.js","gSig":"cone","bSig":"curse","gRow":66,"bRow":14,"mobRows":[13,47,55],"minLvl":300,"mut":0,"xp":55,"spawnGeneral":0},{"n":167,"sw":"dungeon_null_dimension","dungeon":17,"stage":18,"stagesInDungeon":20,"name":"Ярус 18: Нуль-Измерение","dungeonName":"Нуль-Измерение Создателя","desc":"Финальный рубеж мультивселенной. Бескомпромиссный босс-раш сквозь 20 этажей абсолютного хаоса перед лицом самого Создателя.","wave":["Ярус 18: Нуль-Измерение","Нуль-Разрушитель","Нуль-Разрушитель"],"tint":"#120810","ember":"#f4f4f5","mob":"Нуль-Разрушитель","general":"Нуль-Разрушитель","boss":"Нуль-Разрушитель","bossTitle":"в файле нет босса: этап закрывается толпой","goal":"pack","srcHp":1500000,"srcAtk":42000,"file":"public/shadow-world/js/dungeons/17_null_dimension.js","gSig":"cone","bSig":"curse","gRow":66,"bRow":14,"mobRows":[13,47,55],"minLvl":300,"mut":0,"xp":55,"spawnGeneral":0},{"n":168,"sw":"dungeon_null_dimension","dungeon":17,"stage":19,"stagesInDungeon":20,"name":"Ярус 19: Нуль-Измерение","dungeonName":"Нуль-Измерение Создателя","desc":"Финальный рубеж мультивселенной. Бескомпромиссный босс-раш сквозь 20 этажей абсолютного хаоса перед лицом самого Создателя.","wave":["Ярус 19: Нуль-Измерение","Нуль-Разрушитель","Нуль-Разрушитель"],"tint":"#120810","ember":"#f4f4f5","mob":"Нуль-Разрушитель","general":"Нуль-Разрушитель","boss":"Нуль-Разрушитель","bossTitle":"в файле нет босса: этап закрывается толпой","goal":"pack","srcHp":1500000,"srcAtk":42000,"file":"public/shadow-world/js/dungeons/17_null_dimension.js","gSig":"cone","bSig":"curse","gRow":66,"bRow":14,"mobRows":[13,47,55],"minLvl":300,"mut":0,"xp":55,"spawnGeneral":0},{"n":169,"sw":"dungeon_null_dimension","dungeon":17,"stage":20,"stagesInDungeon":20,"name":"Чертог Владыки (Этаж 20)","dungeonName":"Нуль-Измерение Создателя","desc":"Финальный рубеж мультивселенной. Бескомпромиссный босс-раш сквозь 20 этажей абсолютного хаоса перед лицом самого Создателя.","wave":["Чертог Владыки (Этаж 20)","Страж Трона","Архитектор Бытия"],"tint":"#120810","ember":"#f4f4f5","mob":"Страж Трона","general":"Страж Трона","boss":"Архитектор Бытия","bossTitle":"босс этапа из файла данжа","goal":"boss","srcHp":6000000,"srcAtk":65000,"file":"public/shadow-world/js/dungeons/17_null_dimension.js","gSig":"cone","bSig":"curse","gRow":66,"bRow":14,"mobRows":[13,47,55],"minLvl":300,"mut":10,"xp":55,"spawnGeneral":1,"story":"sq_nd"}];

export const DUNGEON_N = SW_DUNGEONS.length;
export const FLOOR_N = SW_FLOORS.length;

export function fightScale(floor: number) {
  const f = SW_FLOORS[Math.max(0, Math.min(FLOOR_N - 1, (floor | 0) - 1))];
  return 1 + (f.n - 1) * 0.08;
}

export function floorsOf(dungeon: number) {
  return SW_FLOORS.filter((f) => f.dungeon === dungeon);
}
