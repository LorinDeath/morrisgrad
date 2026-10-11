/* Ящик: Инкрементальная RPG — ядро (данные, формулы, состояние). Без DOM и Three.js. */
(function (root) {
  'use strict';

  var SAVE_KEY = 'morrisgrad-crate-rpg';
  var OLD_KEY = 'morrisgrad-crate-clicks';
  var KILLS_PER_ZONE = 10;
  var BOSS_EVERY = 5;
  var BASE_BOSS_TIME = 30;

  // ---------------------------------------------------------------- форматирование
  var SUFFIX = ['', ' тыс', ' млн', ' млрд', ' трлн', ' квдр', ' квнт', ' скст', ' сптл', ' октл', ' нонл', ' дцл'];
  function fmt(n, dec) {
    if (n === Infinity) return '∞';
    if (!isFinite(n)) return '0';
    var neg = n < 0; n = Math.abs(n);
    var out;
    if (n < 1000) {
      out = n < 10 && dec ? (Math.floor(n * 10) / 10).toString().replace('.', ',') : Math.floor(n).toString();
    } else {
      var e = Math.floor(Math.log10(n) / 3);
      if (e < SUFFIX.length) {
        var v = n / Math.pow(1000, e);
        var s = v >= 100 ? Math.floor(v).toString() : v >= 10 ? (Math.floor(v * 10) / 10).toFixed(1) : (Math.floor(v * 100) / 100).toFixed(2);
        out = s.replace('.', ',') + SUFFIX[e];
      } else {
        var exp = Math.floor(Math.log10(n));
        out = (n / Math.pow(10, exp)).toFixed(2).replace('.', ',') + 'e' + exp;
      }
    }
    return (neg ? '-' : '') + out;
  }
  function fmtTime(sec) {
    sec = Math.max(0, Math.floor(sec));
    var h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
    if (h > 0) return h + 'ч ' + m + 'м';
    if (m > 0) return m + 'м ' + (s < 10 ? '0' : '') + s + 'с';
    return s + 'с';
  }
  function pct(x) { return (Math.round(x * 1000) / 10).toString().replace('.', ',') + '%'; }

  // ---------------------------------------------------------------- регионы
  var REGIONS = [
    { from: 1, name: 'Старый сарай', tint: '#2a1622' },
    { from: 11, name: 'Портовый склад', tint: '#14202a' },
    { from: 21, name: 'Катакомбы Склепа', tint: '#1b1a12' },
    { from: 31, name: 'Пустоши Альказака', tint: '#2a1a0e' },
    { from: 46, name: 'Замок Праведных котов', tint: '#1e1030' },
    { from: 61, name: 'Купол', tint: '#0f1530' },
    { from: 81, name: 'Цитадель Аскетов', tint: '#301010' },
    { from: 101, name: 'Бездна Алзора', tint: '#120618' },
    { from: 151, name: 'За гранью Купола', tint: '#03030a' }
  ];
  function regionOf(z) { var r = REGIONS[0]; for (var i = 0; i < REGIONS.length; i++) if (z >= REGIONS[i].from) r = REGIONS[i]; return r; }

  // ---------------------------------------------------------------- формулы ящиков
  function isBossZone(z) { return z % BOSS_EVERY === 0; }
  function crateHp(z) {
    var hp = 10 * Math.pow(1.6, Math.min(z, 140) - 1);
    if (z > 140) hp *= Math.pow(1.25, z - 140);
    return Math.ceil(hp);
  }
  function bossHp(z) { return crateHp(z) * 10; }
  function crateReward(z) { return Math.max(1, Math.ceil(crateHp(z) / 25 + Math.min(z, 10))); }
  function bossReward(z) { return crateReward(z) * 8; }
  var BOSS_NAMES = ['Окованный сундук', 'Мимик', 'Сейф Алзора', 'Гроб Склепа', 'Сундук Лорин', 'Ящик Пандоры'];
  function bossName(z) { return BOSS_NAMES[(z / BOSS_EVERY - 1) % BOSS_NAMES.length]; }

  // ---------------------------------------------------------------- помощники (DPS)
  var HELPERS = [
    { id: 'beaver', name: 'Бобёр-подмастерье', icon: '🦫', cost: 50, dps: 5, desc: 'Грызёт углы. Медленно, но верно.' },
    { id: 'gena', name: 'Плотник Гена', icon: '🪚', cost: 250, dps: 22, desc: 'Знает, где у ящика слабое место.' },
    { id: 'cat', name: 'Кот-скребун', icon: '🐈', cost: 1000, dps: 74, desc: 'Из клана Праведных котов. Точит когти.' },
    { id: 'woodpecker', name: 'Дятел-берсерк', icon: '🐦', cost: 4000, dps: 245, desc: 'Сто ударов в секунду — и он только разминается.' },
    { id: 'gnome', name: 'Гном с киркой', icon: '⛏️', cost: 20000, dps: 976, desc: 'Принял ящик за руду.' },
    { id: 'lumber', name: 'Лесоруб Тиша', icon: '🪓', cost: 1e5, dps: 3725, desc: 'Тихий. Очень тихий. И очень опасный.' },
    { id: 'ram', name: 'Механический таран', icon: '🛠️', cost: 4e5, dps: 10859, desc: 'Пар, шестерни и непреодолимое желание ломать.' },
    { id: 'imp', name: 'Огненный бес', icon: '😈', cost: 2.5e6, dps: 47143, desc: 'Поджигает доски. Иногда себя.' },
    { id: 'scholar', name: 'Учёный', icon: '📜', cost: 1.5e7, dps: 186e3, desc: 'Изучил 400 трактатов о ящиках.' },
    { id: 'officer', name: 'Офицер стражи', icon: '🎖️', cost: 1e8, dps: 782e3, desc: 'Ящик арестован. Именем закона — вскрыть!' },
    { id: 'masked', name: 'Маска', icon: '🎭', cost: 8e8, dps: 3.7e6, desc: 'Никто не видел его лица. Ящик — тоже.' },
    { id: 'mariel', name: 'Мариэль', icon: '🌙', cost: 6.5e9, dps: 16.8e6, desc: 'Её песня раскалывает дерево.' },
    { id: 'whitehair', name: 'Белоголовый', icon: '❄️', cost: 5e10, dps: 70e6, desc: 'Замораживает ящик и ломает его на осколки.' },
    { id: 'lorin', name: 'Лорин', icon: '💀', cost: 4.5e11, dps: 460e6, desc: 'Смерть приходит и за ящиками.' },
    { id: 'alzor', name: 'Алзор', icon: '👁️', cost: 4e12, dps: 3e9, desc: 'Тот, кто держит Купол. И кувалду.' },
    { id: 'void', name: 'Глаз Бездны', icon: '🟣', cost: 3.6e13, dps: 15e9, desc: 'Смотрит на ящик. Ящик перестаёт существовать.' }
  ];
  var HELPER_GROWTH = 1.075;
  var MILESTONES = [10, 25, 50, 75, 100, 150, 200, 250, 300, 400, 500, 600, 800, 1000];
  function milestoneMult(lvl) { var m = 1; for (var i = 0; i < MILESTONES.length; i++) if (lvl >= MILESTONES[i]) m *= 2; return m; }

  // ---------------------------------------------------------------- клик
  var CLICK_BASE_COST = 5, CLICK_GROWTH = 1.1;

  // ---------------------------------------------------------------- разовые улучшения
  var UPGRADES = [];
  (function () {
    var tiers = [{ lvl: 10, mult: 10 }, { lvl: 25, mult: 60 }, { lvl: 50, mult: 600 }, { lvl: 100, mult: 2e4 }];
    var names = ['Заточка', 'Закалка', 'Мастерство', 'Легенда'];
    HELPERS.forEach(function (h, i) {
      tiers.forEach(function (t, k) {
        UPGRADES.push({ id: 'h' + i + '_' + k, kind: 'helper', helper: i, req: t.lvl, cost: h.cost * t.mult, mult: 2,
          name: names[k] + ': ' + h.name, desc: 'Урон «' + h.name + '» ×2', icon: h.icon });
      });
    });
    var clickT = [{ lvl: 10, c: 100 }, { lvl: 25, c: 2500 }, { lvl: 50, c: 1e5 }, { lvl: 100, c: 1e8 }];
    clickT.forEach(function (t, k) {
      UPGRADES.push({ id: 'c_' + k, kind: 'click', req: t.lvl, cost: t.c, mult: 2, name: 'Тяжёлая рука ' + ['I', 'II', 'III', 'IV'][k], desc: 'Урон клика ×2', icon: '👊' });
    });
    [10, 20, 35, 50, 70, 90, 120].forEach(function (z, k) {
      UPGRADES.push({ id: 'cd_' + k, kind: 'clickdps', zone: z, cost: crateReward(z) * 60, val: 0.01,
        name: 'Отдача ' + ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'][k], desc: 'Клик получает +1% от урона в секунду', icon: '💥' });
    });
    [15, 30, 55, 80, 110].forEach(function (z, k) {
      UPGRADES.push({ id: 'g_' + k, kind: 'global', zone: z, cost: crateReward(z) * 120, mult: 1.5,
        name: 'Командный дух ' + ['I', 'II', 'III', 'IV', 'V'][k], desc: 'Весь урон ×1,5', icon: '🚩' });
    });
  })();
  var UPG_BY_ID = {}; UPGRADES.forEach(function (u) { UPG_BY_ID[u.id] = u; });

  // ---------------------------------------------------------------- характеристики героя
  var STATS = [
    { id: 'str', name: 'Сила', icon: '💪', desc: '+3% к урону клика' },
    { id: 'agi', name: 'Ловкость', icon: '🎯', desc: '+0,5% шанс крита' },
    { id: 'fury', name: 'Ярость', icon: '🔥', desc: '+10% к урону крита' },
    { id: 'lead', name: 'Лидерство', icon: '👥', desc: '+3% к урону помощников' },
    { id: 'luck', name: 'Удача', icon: '🍀', desc: '+2% щепок, +0,1% шанс лута, чаще золотые ящики' },
    { id: 'wis', name: 'Мудрость', icon: '📖', desc: '+5% опыта' }
  ];
  function xpNeed(lvl) { return Math.floor(25 * Math.pow(lvl, 2) + 20); }

  // ---------------------------------------------------------------- предметы
  var RARITIES = [
    { id: 0, name: 'Обычный', color: '#b8b0a8', mult: 1, weight: 60, affixes: 1, sellGems: 0 },
    { id: 1, name: 'Необычный', color: '#4ade80', mult: 1.5, weight: 26, affixes: 1, sellGems: 0 },
    { id: 2, name: 'Редкий', color: '#60a5fa', mult: 2.2, weight: 10, affixes: 2, sellGems: 0 },
    { id: 3, name: 'Эпический', color: '#c084fc', mult: 3.2, weight: 3.2, affixes: 3, sellGems: 1 },
    { id: 4, name: 'Легендарный', color: '#fb923c', mult: 5, weight: 0.7, affixes: 3, sellGems: 3 },
    { id: 5, name: 'Мифический', color: '#f43f5e', mult: 8, weight: 0.1, affixes: 4, sellGems: 10 }
  ];
  var SLOTS = [
    { id: 'weapon', name: 'Инструмент', icon: '🔨' },
    { id: 'gloves', name: 'Перчатки', icon: '🧤' },
    { id: 'amulet', name: 'Амулет', icon: '📿' },
    { id: 'ring', name: 'Кольцо', icon: '💍' }
  ];
  // g: 0 муж, 1 жен, 2 ср, 3 мн
  var BASES = {
    weapon: [['Молоток', 0, '🔨'], ['Лом', 0, '🪛'], ['Топор', 0, '🪓'], ['Кирка', 1, '⛏️'], ['Кувалда', 1, '🔨'], ['Монтировка', 1, '🔧'], ['Тесак', 0, '🗡️']],
    gloves: [['Рукавицы', 3, '🧤'], ['Перчатки', 3, '🧤'], ['Кастеты', 3, '🥊']],
    amulet: [['Амулет', 0, '📿'], ['Оберег', 0, '🧿'], ['Талисман', 0, '🔮']],
    ring: [['Кольцо', 2, '💍'], ['Перстень', 0, '💍']]
  };
  var ADJ = [
    [['Ржавый', 'Ржавая', 'Ржавое', 'Ржавые'], ['Старый', 'Старая', 'Старое', 'Старые'], ['Кривой', 'Кривая', 'Кривое', 'Кривые']],
    [['Крепкий', 'Крепкая', 'Крепкое', 'Крепкие'], ['Добротный', 'Добротная', 'Добротное', 'Добротные']],
    [['Острый', 'Острая', 'Острое', 'Острые'], ['Закалённый', 'Закалённая', 'Закалённое', 'Закалённые']],
    [['Зачарованный', 'Зачарованная', 'Зачарованное', 'Зачарованные'], ['Рунный', 'Рунная', 'Рунное', 'Рунные']],
    [['Легендарный', 'Легендарная', 'Легендарное', 'Легендарные'], ['Древний', 'Древняя', 'Древнее', 'Древние']],
    [['Мифический', 'Мифическая', 'Мифическое', 'Мифические'], ['Запретный', 'Запретная', 'Запретное', 'Запретные']]
  ];
  var SUFFIXES = ['', '', 'плотника', 'Лорин', 'Алзора', 'Купола', 'Бездны', 'Праведных котов', 'Мариэль', 'Склепа'];
  var AFFIXES = [
    { id: 'clickPct', name: 'урон клика', min: 0.05, max: 0.15, fmt: 'pct' },
    { id: 'dpsPct', name: 'урон помощников', min: 0.05, max: 0.15, fmt: 'pct' },
    { id: 'critChance', name: 'шанс крита', min: 0.005, max: 0.02, fmt: 'pct' },
    { id: 'critDmg', name: 'урон крита', min: 0.1, max: 0.3, fmt: 'pct' },
    { id: 'chipsPct', name: 'щепок', min: 0.05, max: 0.12, fmt: 'pct' },
    { id: 'xpPct', name: 'опыта', min: 0.05, max: 0.12, fmt: 'pct' },
    { id: 'dropPct', name: 'шанс лута', min: 0.003, max: 0.01, fmt: 'pct' },
    { id: 'clickDps', name: 'клик от урона/сек', min: 0.002, max: 0.006, fmt: 'pct' }
  ];
  var AFFIX_BY_ID = {}; AFFIXES.forEach(function (a) { AFFIX_BY_ID[a.id] = a; });

  // ---------------------------------------------------------------- навыки
  var SKILLS = [
    { id: 'storm', name: 'Шквал', icon: '🌪️', lvl: 2, cd: 90, dur: 15, desc: '10 автокликов в секунду, 15 с' },
    { id: 'surge', name: 'Мощь', icon: '⚡', lvl: 5, cd: 150, dur: 30, desc: 'Урон помощников ×2, 30 с' },
    { id: 'lucky', name: 'Меткость', icon: '🎯', lvl: 8, cd: 180, dur: 25, desc: '+40% шанс крита, 25 с' },
    { id: 'greed', name: 'Жадность', icon: '💰', lvl: 12, cd: 240, dur: 30, desc: 'Щепки ×3, 30 с' },
    { id: 'quake', name: 'Землетрясение', icon: '🌋', lvl: 16, cd: 120, dur: 0, desc: 'Мгновенно: 30 с урона помощников + 20 кликов' },
    { id: 'reload', name: 'Перезарядка', icon: '🔄', lvl: 25, cd: 600, dur: 0, desc: 'Сбрасывает откат остальных навыков' }
  ];

  // ---------------------------------------------------------------- дерево перерождения
  var PRESTIGE = [
    { id: 'might', row: 0, name: 'Вечная сила', icon: '⚔️', max: 100, base: 1, step: 1, req: [], desc: 'Весь урон ×1,25 (складывается умножением)' },
    { id: 'greedP', row: 0, name: 'Жадность предков', icon: '🪙', max: 100, base: 1, step: 1, req: [], desc: '+20% щепок' },
    { id: 'eye', row: 1, name: 'Острый глаз', icon: '👁️', max: 25, base: 2, step: 1, req: ['might'], desc: '+1% шанс крита' },
    { id: 'leap', row: 1, name: 'Прыжок через склад', icon: '🦘', max: 20, base: 3, step: 3, req: ['greedP'], desc: 'Начинать с зоны +5' },
    { id: 'patience', row: 2, name: 'Терпение', icon: '⏳', max: 10, base: 3, step: 1, req: ['eye'], desc: '+3 с к таймеру босса' },
    { id: 'thrift', row: 2, name: 'Бережливость', icon: '🏷️', max: 15, base: 2, step: 1, req: ['leap'], desc: '−3% к цене помощников' },
    { id: 'lootP', row: 3, name: 'Тяга к луту', icon: '🎁', max: 10, base: 4, step: 1, req: ['patience'], desc: '+15% к шансу лута' },
    { id: 'zen', row: 3, name: 'Медитация', icon: '🧘', max: 8, base: 5, step: 1, req: ['patience'], desc: '−5% откат навыков' },
    { id: 'sleep', row: 3, name: 'Сонный склад', icon: '💤', max: 5, base: 5, step: 2, req: ['thrift'], desc: '+10% офлайн-дохода и +2 ч лимита' },
    { id: 'resonance', row: 4, name: 'Резонанс искр', icon: '✨', max: 10, base: 10, step: 5, req: ['lootP', 'zen'], desc: 'Каждая искра +1% урона дополнительно' },
    { id: 'goldrush', row: 4, name: 'Золотая лихорадка', icon: '🌟', max: 10, base: 4, step: 1, req: ['sleep'], desc: 'Золотые ящики на 10% чаще и щедрее' },
    { id: 'autoclick', row: 5, name: 'Призрачная рука', icon: '👻', max: 10, base: 15, step: 5, req: ['resonance', 'goldrush'], desc: '+1 автоклик в секунду' }
  ];
  var PRESTIGE_BY_ID = {}; PRESTIGE.forEach(function (p) { PRESTIGE_BY_ID[p.id] = p; });
  function prestigeCost(p, lvl) { return p.base + p.step * lvl; }
  function sparksFor(runMax) { return runMax < 30 ? 0 : Math.floor(Math.pow(runMax - 20, 1.6) / 3); }

  // ---------------------------------------------------------------- скины
  // unlock: {type:'default'|'gems'|'zone'|'ach'|'prestige'|'boss'|'daily'|'golden', val}
  var CRATE_SKINS = [
    { id: 'pine', name: 'Сосна', unlock: { type: 'default' } },
    { id: 'oak', name: 'Тёмный дуб', unlock: { type: 'gems', val: 5 } },
    { id: 'birch', name: 'Берёза', unlock: { type: 'gems', val: 5 } },
    { id: 'mahogany', name: 'Красное дерево', unlock: { type: 'gems', val: 15 } },
    { id: 'charred', name: 'Обгоревший', unlock: { type: 'breaks', val: 500 } },
    { id: 'mossy', name: 'Мшистый', unlock: { type: 'zone', val: 15 } },
    { id: 'iron', name: 'Железный', unlock: { type: 'gems', val: 20 } },
    { id: 'rusty', name: 'Ржавый', unlock: { type: 'zone', val: 25 } },
    { id: 'gift', name: 'Подарок', unlock: { type: 'daily', val: 3 } },
    { id: 'gold', name: 'Золотой', unlock: { type: 'golden', val: 10 } },
    { id: 'neon', name: 'Неон', unlock: { type: 'gems', val: 40 } },
    { id: 'crystal', name: 'Кристалл', unlock: { type: 'prestige', val: 1 } },
    { id: 'ice', name: 'Ледяной', unlock: { type: 'zone', val: 50 } },
    { id: 'mimic', name: 'Мимик', unlock: { type: 'bosses', val: 25 } },
    { id: 'lava', name: 'Лавовый', unlock: { type: 'zone', val: 75 } },
    { id: 'candy', name: 'Карамельный', unlock: { type: 'gems', val: 60 } },
    { id: 'cosmic', name: 'Космос', unlock: { type: 'prestige', val: 3 } },
    { id: 'void', name: 'Око Бездны', unlock: { type: 'zone', val: 100 } }
  ];
  var BG_SKINS = [
    { id: 'barn', name: 'Сарай', unlock: { type: 'default' }, a: '#2a1622', b: '#07050a', ground: 0x3a2028, hemi: 0xffe2c4, rim: 0xc084fc },
    { id: 'sunset', name: 'Закат', unlock: { type: 'gems', val: 5 }, a: '#5a2a1a', b: '#140808', ground: 0x4a2418, hemi: 0xffc48a, rim: 0xff6a3a },
    { id: 'forest', name: 'Заповедный лес', unlock: { type: 'level', val: 20 }, a: '#163322', b: '#040a06', ground: 0x1e3324, hemi: 0xd8ffd0, rim: 0x4ade80 },
    { id: 'night', name: 'Неоновая ночь', unlock: { type: 'gems', val: 20 }, a: '#0b2440', b: '#02040a', ground: 0x101a30, hemi: 0xa0d8ff, rim: 0x00ffcc },
    { id: 'dome', name: 'Купол', unlock: { type: 'zone', val: 40 }, a: '#2a0f40', b: '#05020a', ground: 0x24123a, hemi: 0xe8d0ff, rim: 0xd8b4fe },
    { id: 'blood', name: 'Кровавая луна', unlock: { type: 'prestige', val: 2 }, a: '#4a0a14', b: '#0a0204', ground: 0x3a0c14, hemi: 0xffb0b0, rim: 0xe11d48 }
  ];
  var FX_SKINS = [
    { id: 'chips', name: 'Щепки', unlock: { type: 'default' } },
    { id: 'sparks', name: 'Искры', unlock: { type: 'gems', val: 10 } },
    { id: 'confetti', name: 'Конфетти', unlock: { type: 'gems', val: 15 } },
    { id: 'snow', name: 'Снежинки', unlock: { type: 'zone', val: 30 } },
    { id: 'gems', name: 'Самоцветы', unlock: { type: 'legendary', val: 1 } },
    { id: 'hearts', name: 'Сердечки', unlock: { type: 'ach', val: 20 } }
  ];
  function unlockText(u) {
    switch (u.type) {
      case 'default': return 'Есть с начала';
      case 'gems': return 'Купить за ' + u.val + ' 💎';
      case 'zone': return 'Дойти до зоны ' + u.val;
      case 'breaks': return 'Разбить ' + u.val + ' ящиков';
      case 'prestige': return 'Переродиться ' + u.val + ' раз(а)';
      case 'bosses': return 'Победить ' + u.val + ' боссов';
      case 'daily': return 'Награда за ' + u.val + '-й день подряд';
      case 'golden': return 'Поймать ' + u.val + ' золотых ящиков';
      case 'level': return 'Достичь ' + u.val + ' уровня';
      case 'legendary': return 'Найти легендарный предмет';
      case 'ach': return 'Получить ' + u.val + ' достижений';
    }
    return '';
  }

  // ---------------------------------------------------------------- достижения
  var ACH = [];
  function ach(id, name, desc, test, gems) { ACH.push({ id: id, name: name, desc: desc, test: test, gems: gems || 1 }); }
  [[100, 'Разминка'], [1000, 'Тыкалка'], [10000, 'Пальцы из стали'], [100000, 'Клик-машина'], [1e6, 'Миллион касаний']].forEach(function (a, i) {
    ach('clicks' + i, a[1], 'Сделать ' + fmt(a[0]) + ' кликов', function (s) { return s.st.clicks >= a[0]; }, i + 1);
  });
  [[10, 'Первые щепки'], [100, 'Ломатель'], [1000, 'Гроза складов'], [10000, 'Разрушитель'], [100000, 'Конец всех ящиков']].forEach(function (a, i) {
    ach('breaks' + i, a[1], 'Разбить ' + fmt(a[0]) + ' ящиков', function (s) { return s.st.breaks >= a[0]; }, i + 1);
  });
  [[10, 'Портовый грузчик'], [25, 'Спуск в склеп'], [50, 'Пустоши позади'], [75, 'Под Куполом'], [100, 'Бездна зовёт'], [150, 'За гранью']].forEach(function (a, i) {
    ach('zone' + i, a[1], 'Дойти до зоны ' + a[0], function (s) { return s.bestZone >= a[0]; }, i + 2);
  });
  [[1, 'Первый босс'], [10, 'Охотник на боссов'], [50, 'Палач сундуков'], [200, 'Легенда склада']].forEach(function (a, i) {
    ach('boss' + i, a[1], 'Победить ' + a[0] + ' боссов', function (s) { return s.st.bosses >= a[0]; }, i + 1);
  });
  [[5, 'Новичок'], [10, 'Подмастерье'], [25, 'Мастер'], [50, 'Грандмастер'], [100, 'Полубог ящиков']].forEach(function (a, i) {
    ach('lvl' + i, a[1], 'Достичь ' + a[0] + ' уровня', function (s) { return s.level >= a[0]; }, i + 1);
  });
  [[100, 'Меткий'], [1000, 'Снайпер'], [25000, 'Критический мыслитель']].forEach(function (a, i) {
    ach('crit' + i, a[1], 'Нанести ' + fmt(a[0]) + ' критов', function (s) { return s.st.crits >= a[0]; }, i + 1);
  });
  [[1e3, 'Горсть щепок'], [1e6, 'Мешок щепок'], [1e9, 'Гора щепок'], [1e12, 'Лесоповал'], [1e18, 'Щепочный магнат']].forEach(function (a, i) {
    ach('chips' + i, a[1], 'Заработать ' + fmt(a[0]) + ' щепок', function (s) { return s.st.chipsEarned >= a[0]; }, i + 1);
  });
  [[1, 'Первая находка'], [50, 'Барахольщик'], [300, 'Коллекционер']].forEach(function (a, i) {
    ach('items' + i, a[1], 'Найти ' + a[0] + ' предметов', function (s) { return s.st.items >= a[0]; }, i + 1);
  });
  ach('legend', 'Легендарно!', 'Найти легендарный предмет', function (s) { return s.st.legendary >= 1; }, 3);
  ach('mythic', 'Миф во плоти', 'Найти мифический предмет', function (s) { return s.st.mythic >= 1; }, 10);
  [[1, 'Новая жизнь'], [5, 'Колесо Сансары'], [15, 'Вечный ящик']].forEach(function (a, i) {
    ach('prest' + i, a[1], 'Переродиться ' + a[0] + ' раз', function (s) { return s.st.prestiges >= a[0]; }, (i + 1) * 3);
  });
  [[1, 'Блеск!'], [10, 'Золотоискатель'], [50, 'Царь Мидас']].forEach(function (a, i) {
    ach('golden' + i, a[1], 'Поймать ' + a[0] + ' золотых ящиков', function (s) { return s.st.golden >= a[0]; }, i + 1);
  });
  [[5, 'Модник'], [10, 'Дизайнер ящиков'], [18, 'Полная коллекция']].forEach(function (a, i) {
    ach('skins' + i, a[1], 'Собрать ' + a[0] + ' скинов ящика', function (s) { return s.skins.crate.length >= a[0]; }, (i + 1) * 2);
  });
  [[25, 'Тактик'], [250, 'Мастер навыков']].forEach(function (a, i) {
    ach('skill' + i, a[1], 'Использовать навыки ' + a[0] + ' раз', function (s) { return s.st.skills >= a[0]; }, i + 1);
  });
  ach('helpers', 'Вся бригада', 'Нанять всех помощников', function (s) { return s.helpers.every(function (l) { return l > 0; }); }, 5);
  ach('h100', 'Сотня бобров', 'Прокачать помощника до 100 уровня', function (s) { return s.helpers.some(function (l) { return l >= 100; }); }, 2);
  ach('daily7', 'Верность складу', '7 дней подряд забирать ежедневную награду', function (s) { return s.daily.streak >= 7; }, 5);
  ach('hour', 'Залип', 'Провести в игре 1 час', function (s) { return s.st.playTime >= 3600; }, 2);
  ach('fullset', 'Во всеоружии', 'Заполнить все 4 слота снаряжения', function (s) { return SLOTS.every(function (sl) { return !!s.equip[sl.id]; }); }, 2);
  var ACH_BY_ID = {}; ACH.forEach(function (a) { ACH_BY_ID[a.id] = a; });

  // ---------------------------------------------------------------- состояние
  function newState() {
    return {
      v: 2, created: Date.now(), lastTick: Date.now(),
      chips: 0, gems: 0, sparks: 0, sparksTotal: 0,
      zone: 1, runMax: 1, bestZone: 1, kills: 0,
      clickLvl: 1, helpers: HELPERS.map(function () { return 0; }), upg: {},
      level: 1, xp: 0, points: 0, stats: { str: 0, agi: 0, fury: 0, lead: 0, luck: 0, wis: 0 },
      inv: [], equip: { weapon: null, gloves: null, amulet: null, ring: null }, itemSeq: 1,
      skins: { crate: ['pine'], bg: ['barn'], fx: ['chips'], cur: { crate: 'pine', bg: 'barn', fx: 'chips' } },
      ach: {}, prest: {},
      skills: {}, daily: { last: 0, streak: 0 },
      buffs: { frenzyUntil: 0, lootRain: 0 },
      nextGolden: Date.now() + 45000,
      st: { clicks: 0, crits: 0, dmg: 0, breaks: 0, bosses: 0, chipsEarned: 0, items: 0, legendary: 0, mythic: 0, prestiges: 0, golden: 0, skills: 0, playTime: 0, bestHit: 0 },
      settings: { sound: true, particles: true, dmgNums: true, autoAdvance: true, autoSell: -1, bulk: 1 },
      migrated: 0
    };
  }

  function merge(def, obj) {
    if (!obj || typeof obj !== 'object') return def;
    Object.keys(def).forEach(function (k) {
      if (!(k in obj)) return;
      var dv = def[k], ov = obj[k];
      if (dv && typeof dv === 'object' && !Array.isArray(dv) && ov && typeof ov === 'object' && !Array.isArray(ov) && k !== 'upg' && k !== 'ach' && k !== 'prest' && k !== 'skills' && k !== 'equip') {
        def[k] = merge(dv, ov);
      } else if (ov !== undefined && ov !== null || k === 'equip') {
        def[k] = ov;
      }
    });
    return def;
  }
  function loadState(obj) {
    var s = merge(newState(), obj);
    if (!Array.isArray(s.helpers)) s.helpers = [];
    while (s.helpers.length < HELPERS.length) s.helpers.push(0);
    if (!s.equip || typeof s.equip !== 'object') s.equip = { weapon: null, gloves: null, amulet: null, ring: null };
    if (!Array.isArray(s.inv)) s.inv = [];
    ['crate', 'bg', 'fx'].forEach(function (k) { if (!Array.isArray(s.skins[k])) s.skins[k] = []; });
    if (s.skins.crate.indexOf('pine') < 0) s.skins.crate.unshift('pine');
    if (s.skins.bg.indexOf('barn') < 0) s.skins.bg.unshift('barn');
    if (s.skins.fx.indexOf('chips') < 0) s.skins.fx.unshift('chips');
    return s;
  }

  // ---------------------------------------------------------------- игра
  function Game(storage, now) {
    this.storage = storage || null;
    this.now = now || function () { return Date.now(); };
    this.s = newState();
    this.events = [];
    this.boss = null;  // {until, max}
    this.hp = 0; this.maxHp = 0;
    this.cache = null;
  }
  var G = Game.prototype;

  G.emit = function (type, data) { this.events.push({ type: type, data: data || {} }); };
  G.drain = function () { var e = this.events; this.events = []; return e; };
  G.rand = Math.random;

  // ---------- сохранение
  G.load = function () {
    var raw = null, msg = null;
    try { raw = this.storage && this.storage.getItem(SAVE_KEY); } catch (e) {}
    if (raw) {
      try { this.s = loadState(JSON.parse(raw)); } catch (e) { this.s = newState(); if (typeof console !== 'undefined') console.warn('Ящик: не удалось загрузить сохранение', e); }
    }
    // миграция со старого кликера
    try {
      var old = this.storage && this.storage.getItem(OLD_KEY);
      var n = old ? parseInt(old, 10) || 0 : 0;
      if (n > this.s.migrated) {
        var add = n - this.s.migrated;
        this.s.chips += add; this.s.st.clicks += add; this.s.st.chipsEarned += add;
        this.s.migrated = n;
        msg = add;
      }
    } catch (e) {}
    this.invalidate();
    this.spawnCrate();
    return msg;
  };
  G.save = function () {
    this.s.lastTick = this.now();
    try { this.storage && this.storage.setItem(SAVE_KEY, JSON.stringify(this.s)); } catch (e) {}
  };
  G.exportSave = function () {
    var json = JSON.stringify(this.s);
    var b = (typeof btoa !== 'undefined') ? btoa(unescape(encodeURIComponent(json))) : Buffer.from(json, 'utf8').toString('base64');
    return 'MGCRATE1:' + b;
  };
  G.importSave = function (str) {
    str = (str || '').trim();
    if (str.indexOf('MGCRATE1:') !== 0) throw new Error('Неверный формат сохранения');
    var b = str.slice(9);
    var json = (typeof atob !== 'undefined') ? decodeURIComponent(escape(atob(b))) : Buffer.from(b, 'base64').toString('utf8');
    var obj = JSON.parse(json);
    if (!obj || obj.v !== 2) throw new Error('Сохранение повреждено');
    this.s = loadState(obj);
    this.boss = null;
    this.invalidate(); this.spawnCrate(); this.save();
  };
  G.hardReset = function () {
    var migrated = this.s.migrated;
    this.s = newState(); this.s.migrated = migrated;
    this.boss = null; this.invalidate(); this.spawnCrate(); this.save();
  };

  // ---------- производные величины
  G.invalidate = function () { this.cache = null; };
  G.itemTotals = function () {
    var t = { clickFlat: 0, clickPct: 0, dpsPct: 0, critChance: 0, critDmg: 0, chipsPct: 0, xpPct: 0, dropPct: 0, clickDps: 0 };
    var eq = this.s.equip;
    Object.keys(eq).forEach(function (k) {
      var it = eq[k]; if (!it) return;
      if (it.flat) t.clickFlat += it.flat;
      it.aff.forEach(function (a) { t[a.id] += a.v; });
    });
    return t;
  };
  G.p = function (id) { return this.s.prest[id] || 0; };
  G.calc = function () {
    if (this.cache) return this.cache;
    var s = this.s, it = this.itemTotals(), self = this;
    var achCount = Object.keys(s.ach).length;
    var sparkPer = 0.05 + 0.01 * this.p('resonance');
    var global = (1 + s.sparks * sparkPer) * Math.pow(1.25, this.p('might')) * (1 + 0.01 * achCount);
    UPGRADES.forEach(function (u) { if (u.kind === 'global' && s.upg[u.id]) global *= u.mult; });
    // помощники
    var helperDps = HELPERS.map(function (h, i) {
      var l = s.helpers[i]; if (!l) return 0;
      var m = milestoneMult(l);
      UPGRADES.forEach(function (u) { if (u.kind === 'helper' && u.helper === i && s.upg[u.id]) m *= u.mult; });
      return h.dps * l * m;
    });
    var rawDps = helperDps.reduce(function (a, b) { return a + b; }, 0);
    var dpsMult = global * (1 + 0.03 * s.stats.lead) * (1 + it.dpsPct);
    var dps = rawDps * dpsMult;
    // клик
    var clickMult = milestoneMult(s.clickLvl);
    var clickDpsPct = it.clickDps;
    UPGRADES.forEach(function (u) {
      if (!s.upg[u.id]) return;
      if (u.kind === 'click') clickMult *= u.mult;
      if (u.kind === 'clickdps') clickDpsPct += u.val;
    });
    var click = (s.clickLvl * clickMult * global + it.clickFlat + dps * clickDpsPct) * (1 + 0.03 * s.stats.str) * (1 + it.clickPct);
    var critChance = Math.min(0.9, 0.03 + 0.005 * s.stats.agi + it.critChance + 0.01 * this.p('eye'));
    var critMult = 2 + 0.1 * s.stats.fury + it.critDmg;
    var skinsOwned = s.skins.crate.length + s.skins.bg.length + s.skins.fx.length;
    var chipsMult = (1 + 0.02 * s.stats.luck) * (1 + it.chipsPct) * (1 + 0.2 * this.p('greedP')) * (1 + 0.01 * skinsOwned);
    var xpMult = (1 + 0.05 * s.stats.wis) * (1 + it.xpPct);
    var drop = Math.min(0.5, (0.04 + 0.001 * s.stats.luck + it.dropPct) * (1 + 0.15 * this.p('lootP')));
    this.cache = {
      global: global, helperDps: helperDps.map(function (d) { return d * dpsMult; }), dps: dps, click: click,
      critChance: critChance, critMult: critMult, chipsMult: chipsMult, xpMult: xpMult, drop: drop,
      clickDpsPct: clickDpsPct, items: it, achCount: achCount, skinsOwned: skinsOwned,
      helperCostMult: Math.max(0.5, 1 - 0.03 * this.p('thrift')),
      cdMult: 1 - 0.05 * this.p('zen'),
      bossTime: BASE_BOSS_TIME + 3 * this.p('patience')
    };
    return this.cache;
  };
  // эффективные значения с учётом активных баффов
  G.buffActive = function (id) { var k = this.s.skills[id]; return k && k.until > this.now(); };
  G.effDps = function () { return this.calc().dps * (this.buffActive('surge') ? 2 : 1); };
  G.effClick = function () { return this.calc().click * (this.s.buffs.frenzyUntil > this.now() ? 5 : 1); };
  G.effCrit = function () { return Math.min(0.95, this.calc().critChance + (this.buffActive('lucky') ? 0.4 : 0)); };
  G.effChips = function () { return this.calc().chipsMult * (this.buffActive('greed') ? 3 : 1); };

  // ---------- покупки
  function bulkCost(base, growth, lvl, n) { return base * Math.pow(growth, lvl) * (Math.pow(growth, n) - 1) / (growth - 1); }
  function maxAffordable(base, growth, lvl, money) {
    var first = base * Math.pow(growth, lvl);
    if (money < first) return 0;
    return Math.floor(Math.log(money * (growth - 1) / first + 1) / Math.log(growth));
  }
  G.bulkN = function (kind, i) {
    var b = this.s.settings.bulk;
    if (b !== 'max') return b;
    var n = kind === 'click' ? maxAffordable(CLICK_BASE_COST, CLICK_GROWTH, this.s.clickLvl - 1, this.s.chips)
      : maxAffordable(HELPERS[i].cost * this.calc().helperCostMult, HELPER_GROWTH, this.s.helpers[i], this.s.chips);
    return Math.max(1, n);
  };
  G.clickCost = function (n) { return bulkCost(CLICK_BASE_COST, CLICK_GROWTH, this.s.clickLvl - 1, n || 1); };
  G.helperCost = function (i, n) { return bulkCost(HELPERS[i].cost * this.calc().helperCostMult, HELPER_GROWTH, this.s.helpers[i], n || 1); };
  G.buyClick = function () {
    var n = this.bulkN('click'), c = this.clickCost(n);
    if (this.s.chips < c) return false;
    this.s.chips -= c; this.s.clickLvl += n; this.invalidate(); this.emit('buy', { what: 'click' }); return true;
  };
  G.buyHelper = function (i) {
    var n = this.bulkN('helper', i), c = this.helperCost(i, n);
    if (i > 0 && this.s.helpers[i - 1] === 0 && this.s.helpers[i] === 0) return false; // по порядку
    if (this.s.chips < c) return false;
    this.s.chips -= c; this.s.helpers[i] += n; this.invalidate(); this.emit('buy', { what: 'helper', i: i }); return true;
  };
  G.helperVisible = function (i) { return i === 0 || this.s.helpers[i - 1] > 0 || this.s.helpers[i] > 0; };
  G.upgradeVisible = function (u) {
    var s = this.s;
    if (s.upg[u.id]) return false;
    if (u.kind === 'helper') return s.helpers[u.helper] >= u.req;
    if (u.kind === 'click') return s.clickLvl >= u.req;
    return s.runMax >= u.zone;
  };
  G.buyUpgrade = function (id) {
    var u = UPG_BY_ID[id];
    if (!u || !this.upgradeVisible(u) || this.s.chips < u.cost) return false;
    this.s.chips -= u.cost; this.s.upg[id] = 1; this.invalidate(); this.emit('buy', { what: 'upgrade' }); return true;
  };

  // ---------- ящики, зоны, боссы
  G.spawnCrate = function () {
    var z = this.s.zone;
    if (isBossZone(z) && z === this.s.runMax) {
      this.maxHp = bossHp(z);
      this.boss = { until: this.now() + this.calc().bossTime * 1000, total: this.calc().bossTime };
    } else {
      this.maxHp = isBossZone(z) ? bossHp(z) / 2 : crateHp(z);
      this.boss = null;
    }
    this.hp = this.maxHp;
    this.emit('spawn', { boss: !!this.boss, zone: z });
  };
  G.setZone = function (z) {
    z = Math.max(1, Math.min(this.s.runMax, z));
    if (z === this.s.zone) return;
    this.s.zone = z; this.spawnCrate();
  };
  G.damage = function (amount, src) {
    if (amount <= 0) return;
    this.s.st.dmg += amount;
    this.hp -= amount;
    if (this.hp <= 0) this.breakCrate();
  };
  G.breakCrate = function () {
    var s = this.s, z = s.zone, c = this.calc();
    var isBoss = !!this.boss;
    var reward = (isBoss ? bossReward(z) : (isBossZone(z) ? bossReward(z) / 4 : crateReward(z))) * this.effChips();
    s.chips += reward; s.st.chipsEarned += reward; s.st.breaks++;
    var xp = Math.ceil((5 + z * 2) * (isBoss ? 8 : 1) * c.xpMult);
    var gems = 0;
    if (isBoss) { s.st.bosses++; gems = 1 + Math.floor(z / 25); s.gems += gems; }
    this.emit('break', { reward: reward, xp: xp, boss: isBoss, gems: gems, zone: z });
    this.addXp(xp);
    // лут
    var chance = isBoss ? 1 : c.drop;
    if (s.buffs.lootRain > 0) { chance = 1; s.buffs.lootRain--; }
    if (this.rand() < chance) this.dropItem(z, isBoss);
    if (isBoss && this.rand() < 0.03 && s.skins.crate.indexOf('mimic') < 0) this.unlockSkin('crate', 'mimic');
    // прогресс
    if (z === s.runMax) {
      if (isBoss) { this.advance(); return; }
      if (!isBossZone(z)) {
        s.kills++;
        if (s.kills >= KILLS_PER_ZONE) { this.advance(); return; }
      }
    }
    this.spawnCrate();
  };
  G.advance = function () {
    var s = this.s;
    s.runMax++; s.kills = 0;
    if (s.runMax > s.bestZone) s.bestZone = s.runMax;
    this.invalidate();
    this.emit('zoneUnlocked', { zone: s.runMax });
    if (s.settings.autoAdvance) s.zone = s.runMax;
    this.spawnCrate();
  };
  G.bossFail = function () {
    var s = this.s;
    s.zone = Math.max(1, s.zone - 1);
    s.settings.autoAdvance = false;
    this.emit('bossFail', {});
    this.spawnCrate();
  };

  // ---------- клик
  G.click = function (auto) {
    var s = this.s, dmg = this.effClick(), crit = this.rand() < this.effCrit();
    if (crit) { dmg *= this.calc().critMult; s.st.crits++; }
    if (!auto) s.st.clicks++;
    if (dmg > s.st.bestHit) s.st.bestHit = dmg;
    this.damage(dmg, 'click');
    return { dmg: dmg, crit: crit };
  };

  // ---------- опыт
  G.addXp = function (xp) {
    var s = this.s; s.xp += xp;
    var ups = 0;
    while (s.xp >= xpNeed(s.level)) {
      s.xp -= xpNeed(s.level); s.level++; s.points += 3; ups++;
      if (s.level % 5 === 0) s.gems += 1;
      var unlocked = SKILLS.filter(function (k) { return k.lvl === s.level; });
      this.emit('levelUp', { level: s.level, skills: unlocked });
    }
    if (ups) this.invalidate();
  };
  G.addStat = function (id, n) {
    n = Math.min(n || 1, this.s.points);
    if (n <= 0 || !(id in this.s.stats)) return false;
    this.s.stats[id] += n; this.s.points -= n; this.invalidate(); return true;
  };
  G.respecCost = function () { return 10 + 5 * Math.floor(this.s.level / 10); };
  G.respec = function () {
    var c = this.respecCost(), s = this.s;
    if (s.gems < c) return false;
    s.gems -= c;
    var total = 0; Object.keys(s.stats).forEach(function (k) { total += s.stats[k]; s.stats[k] = 0; });
    s.points += total; this.invalidate(); return true;
  };

  // ---------- предметы
  G.rollRarity = function (boss) {
    var luck = this.s.stats.luck;
    var w = RARITIES.map(function (r, i) { return r.weight * (i >= 2 ? (1 + luck * 0.01) : 1); });
    if (boss) { w[0] = 0; w[1] *= 0.6; w[3] *= 2; w[4] *= 3; w[5] *= 3; }
    var sum = w.reduce(function (a, b) { return a + b; }, 0), r = this.rand() * sum;
    for (var i = 0; i < w.length; i++) { r -= w[i]; if (r <= 0) return i; }
    return 0;
  };
  G.makeItem = function (z, rarity, slot) {
    var rnd = this.rand.bind(this);
    slot = slot || SLOTS[Math.floor(rnd() * SLOTS.length)].id;
    var R = RARITIES[rarity];
    var bases = BASES[slot], base = bases[Math.floor(rnd() * bases.length)];
    var adjs = ADJ[rarity], adj = adjs[Math.floor(rnd() * adjs.length)][base[1]];
    var suf = rarity >= 2 ? SUFFIXES[Math.floor(rnd() * SUFFIXES.length)] : '';
    var name = adj + ' ' + base[0].toLowerCase() + (suf ? ' ' + suf : '');
    var pool = AFFIXES.slice(), aff = [];
    if (slot === 'weapon') pool = pool.filter(function (a) { return a.id !== 'dpsPct'; });
    for (var i = 0; i < R.affixes && pool.length; i++) {
      var a = pool.splice(Math.floor(rnd() * pool.length), 1)[0];
      var v = (a.min + rnd() * (a.max - a.min)) * R.mult * (1 + Math.log10(z) * 0.25);
      aff.push({ id: a.id, v: Math.round(v * 10000) / 10000 });
    }
    var item = { id: this.s.itemSeq++, slot: slot, name: name.charAt(0).toUpperCase() + name.slice(1), icon: base[2], r: rarity, z: z, aff: aff };
    if (slot === 'weapon') item.flat = Math.ceil(Math.max(z * 2, crateHp(z) * 0.0005) * R.mult);
    return item;
  };
  G.dropItem = function (z, boss) {
    var s = this.s, r = this.rollRarity(boss), item = this.makeItem(z, r);
    s.st.items++;
    if (r >= 4) s.st.legendary++;
    if (r >= 5) s.st.mythic++;
    if (r >= 4 && s.skins.fx.indexOf('gems') < 0) this.unlockSkin('fx', 'gems');
    var auto = s.settings.autoSell;
    if (r <= auto || s.inv.length >= 40) { this.sellItemObj(item); this.emit('loot', { item: item, sold: true }); return item; }
    s.inv.push(item);
    this.emit('loot', { item: item, sold: false });
    return item;
  };
  G.itemScore = function (it) {
    if (!it) return 0;
    var sc = 0;
    if (it.flat) sc += it.flat / crateHp(Math.max(1, this.s.runMax)) * 3;
    it.aff.forEach(function (a) {
      var A = AFFIX_BY_ID[a.id];
      sc += a.v / ((A.min + A.max) / 2);
    });
    return sc;
  };
  G.sellValue = function (it) { return crateReward(it.z) * 3 * (it.r + 1); };
  G.sellItemObj = function (it) {
    var v = this.sellValue(it);
    this.s.chips += v; this.s.st.chipsEarned += v;
    this.s.gems += RARITIES[it.r].sellGems;
    return v;
  };
  G.findInv = function (id) { for (var i = 0; i < this.s.inv.length; i++) if (this.s.inv[i].id === id) return i; return -1; };
  G.equipItem = function (id) {
    var idx = this.findInv(id); if (idx < 0) return false;
    var it = this.s.inv.splice(idx, 1)[0];
    var prev = this.s.equip[it.slot];
    this.s.equip[it.slot] = it;
    if (prev) this.s.inv.push(prev);
    this.invalidate(); return true;
  };
  G.unequip = function (slot) {
    var it = this.s.equip[slot]; if (!it) return false;
    if (this.s.inv.length >= 40) return false;
    this.s.equip[slot] = null; this.s.inv.push(it); this.invalidate(); return true;
  };
  G.sellItem = function (id) {
    var idx = this.findInv(id); if (idx < 0) return 0;
    var it = this.s.inv.splice(idx, 1)[0];
    return this.sellItemObj(it);
  };
  G.sellAllBelow = function (r) {
    var self = this, total = 0;
    this.s.inv = this.s.inv.filter(function (it) { if (it.r <= r) { total += self.sellItemObj(it); return false; } return true; });
    return total;
  };

  // ---------- скины
  G.skinList = function (kind) { return kind === 'crate' ? CRATE_SKINS : kind === 'bg' ? BG_SKINS : FX_SKINS; };
  G.owns = function (kind, id) { return this.s.skins[kind].indexOf(id) >= 0; };
  G.unlockSkin = function (kind, id) {
    if (this.owns(kind, id)) return false;
    this.s.skins[kind].push(id); this.invalidate();
    var def = this.skinList(kind).filter(function (x) { return x.id === id; })[0];
    this.emit('skin', { kind: kind, id: id, name: def ? def.name : id });
    return true;
  };
  G.skinConditionMet = function (u) {
    var s = this.s;
    switch (u.type) {
      case 'zone': return s.bestZone >= u.val;
      case 'breaks': return s.st.breaks >= u.val;
      case 'prestige': return s.st.prestiges >= u.val;
      case 'bosses': return s.st.bosses >= u.val;
      case 'daily': return s.daily.streak >= u.val;
      case 'golden': return s.st.golden >= u.val;
      case 'level': return s.level >= u.val;
      case 'legendary': return s.st.legendary >= u.val;
      case 'ach': return Object.keys(s.ach).length >= u.val;
    }
    return false;
  };
  G.buySkin = function (kind, id) {
    var def = this.skinList(kind).filter(function (x) { return x.id === id; })[0];
    if (!def || this.owns(kind, id) || def.unlock.type !== 'gems' || this.s.gems < def.unlock.val) return false;
    this.s.gems -= def.unlock.val; this.unlockSkin(kind, id); return true;
  };
  G.setSkin = function (kind, id) {
    if (!this.owns(kind, id)) return false;
    this.s.skins.cur[kind] = id; this.emit('skinSet', { kind: kind, id: id }); return true;
  };

  // ---------- навыки
  G.skillState = function (id) {
    var k = SKILLS.filter(function (x) { return x.id === id; })[0], st = this.s.skills[id] || {}, now = this.now();
    return { def: k, unlocked: this.s.level >= k.lvl, active: (st.until || 0) > now, activeLeft: Math.max(0, ((st.until || 0) - now) / 1000),
      cdLeft: Math.max(0, ((st.cd || 0) - now) / 1000), ready: this.s.level >= k.lvl && (st.cd || 0) <= now };
  };
  G.useSkill = function (id) {
    var ss = this.skillState(id); if (!ss.ready) return false;
    var k = ss.def, now = this.now(), c = this.calc();
    this.s.skills[id] = { until: now + k.dur * 1000, cd: now + k.cd * c.cdMult * 1000 };
    this.s.st.skills++;
    if (id === 'quake') this.damage(this.effDps() * 30 + this.effClick() * 20, 'skill');
    if (id === 'reload') { var self = this; SKILLS.forEach(function (o) { if (o.id !== 'reload' && self.s.skills[o.id]) self.s.skills[o.id].cd = 0; }); }
    this.emit('skill', { id: id });
    return true;
  };

  // ---------- золотые ящики
  G.goldenInterval = function () {
    var f = (1 + 0.01 * this.s.stats.luck) * (1 + 0.1 * this.p('goldrush'));
    return (60 + this.rand() * 90) * 1000 / f;
  };
  G.goldenReward = function () {
    var s = this.s, r = this.rand(), z = Math.max(1, s.zone);
    var perSec = Math.max(this.effDps() / Math.max(1, crateHp(z)), 0.5) * crateReward(z) * this.calc().chipsMult;
    var bonus = 1 + 0.1 * this.p('goldrush');
    s.st.golden++;
    var res;
    if (r < 0.4) { var v = Math.max(perSec * 60, crateReward(z) * 25) * bonus; s.chips += v; s.st.chipsEarned += v; res = { type: 'chips', v: v, text: '+' + fmt(v) + ' щепок' }; }
    else if (r < 0.65) { s.buffs.frenzyUntil = this.now() + 20000 * bonus; res = { type: 'frenzy', text: 'Неистовство! Клик ×5 на ' + Math.round(20 * bonus) + ' с' }; }
    else if (r < 0.8) { s.buffs.lootRain += 5; res = { type: 'loot', text: 'Ливень лута: 5 ящиков с гарантированным лутом' }; }
    else if (r < 0.95) { var g = 1 + Math.floor(this.rand() * 3); s.gems += g; res = { type: 'gems', text: '+' + g + ' 💎' }; }
    else { var j = Math.max(perSec * 600, crateReward(z) * 300) * bonus; s.chips += j; s.st.chipsEarned += j; res = { type: 'jackpot', v: j, text: 'ДЖЕКПОТ! +' + fmt(j) + ' щепок' }; }
    this.emit('golden', res);
    return res;
  };

  // ---------- ежедневная награда
  var DAY = 20 * 3600 * 1000;
  G.dailyReady = function () { return this.now() - this.s.daily.last >= DAY; };
  G.dailyLeft = function () { return Math.max(0, (this.s.daily.last + DAY - this.now()) / 1000); };
  G.claimDaily = function () {
    if (!this.dailyReady()) return null;
    var s = this.s, now = this.now();
    s.daily.streak = (s.daily.last && now - s.daily.last < 48 * 3600 * 1000) ? s.daily.streak + 1 : 1;
    s.daily.last = now;
    var day = ((s.daily.streak - 1) % 7) + 1;
    var chips = crateReward(Math.max(1, s.runMax)) * 30 * day;
    var gems = day === 7 ? 10 : day;
    s.chips += chips; s.st.chipsEarned += chips; s.gems += gems;
    this.emit('daily', { day: day, chips: chips, gems: gems });
    return { day: day, chips: chips, gems: gems };
  };

  // ---------- перерождение
  G.pendingSparks = function () { return sparksFor(this.s.runMax); };
  G.canPrestige = function () { return this.pendingSparks() > 0; };
  G.prestige = function () {
    var n = this.pendingSparks(); if (n <= 0) return false;
    var s = this.s;
    s.sparks += n; s.sparksTotal += n; s.st.prestiges++;
    s.chips = 0; s.clickLvl = 1; s.helpers = HELPERS.map(function () { return 0; }); s.upg = {};
    var start = 1 + 5 * this.p('leap');
    s.zone = start; s.runMax = start; s.kills = 0;
    s.buffs.lootRain = 0;
    this.invalidate(); this.spawnCrate();
    this.emit('prestige', { sparks: n });
    return n;
  };
  G.prestigeReqMet = function (p) { var self = this; return p.req.every(function (r) { return self.p(r) > 0; }); };
  G.buyPrestige = function (id) {
    var p = PRESTIGE_BY_ID[id]; if (!p) return false;
    var l = this.p(id); if (l >= p.max || !this.prestigeReqMet(p)) return false;
    var c = prestigeCost(p, l); if (this.s.sparks < c) return false;
    this.s.sparks -= c; this.s.prest[id] = l + 1; this.invalidate(); return true;
  };

  // ---------- достижения
  G.checkAchievements = function () {
    var s = this.s, self = this, got = [];
    ACH.forEach(function (a) {
      if (!s.ach[a.id] && a.test(s)) { s.ach[a.id] = Date.now(); s.gems += a.gems; got.push(a); }
    });
    if (got.length) { this.invalidate(); got.forEach(function (a) { self.emit('ach', a); }); }
    // скины по условиям
    ['crate', 'bg', 'fx'].forEach(function (kind) {
      self.skinList(kind).forEach(function (d) {
        if (d.unlock.type !== 'gems' && d.unlock.type !== 'default' && !self.owns(kind, d.id) && self.skinConditionMet(d.unlock)) self.unlockSkin(kind, d.id);
      });
    });
    return got;
  };

  // ---------- офлайн
  G.offline = function () {
    var s = this.s, now = this.now();
    var elapsed = (now - (s.lastTick || now)) / 1000;
    var cap = (8 + 2 * this.p('sleep')) * 3600;
    if (elapsed < 60) return null;
    var t = Math.min(elapsed, cap);
    var z = s.zone; if (isBossZone(z) && z === s.runMax) z = Math.max(1, z - 1);
    var dps = this.calc().dps;
    var hp = isBossZone(z) ? bossHp(z) / 2 : crateHp(z);
    var rew = isBossZone(z) ? bossReward(z) / 4 : crateReward(z);
    var kps = Math.min(dps / hp, 10);
    var rate = 0.5 + 0.1 * this.p('sleep');
    var kills = kps * t * rate;
    var chips = kills * rew * this.calc().chipsMult;
    var xp = Math.floor(kills * (5 + z * 2) * this.calc().xpMult * 0.5);
    s.chips += chips; s.st.chipsEarned += chips; s.st.breaks += Math.floor(kills);
    if (xp > 0) this.addXp(xp);
    return { seconds: elapsed, counted: t, chips: chips, xp: xp, kills: Math.floor(kills) };
  };

  // ---------- такт
  G.tick = function (dt) {
    var s = this.s, now = this.now();
    s.st.playTime += dt;
    var dps = this.effDps();
    if (dps > 0) this.damage(dps * dt, 'dps');
    // автоклики: навык «Шквал» + «Призрачная рука»
    var rate = (this.buffActive('storm') ? 10 : 0) + this.p('autoclick');
    if (rate > 0) {
      this._autoAcc = (this._autoAcc || 0) + rate * dt;
      while (this._autoAcc >= 1) { this._autoAcc -= 1; var r = this.click(true); this.emit('autoclick', r); }
    }
    if (this.boss && now > this.boss.until) this.bossFail();
    else if (s.settings.autoAdvance && s.zone < s.runMax && !this.boss) { s.zone = s.runMax; this.spawnCrate(); }
    if (now >= s.nextGolden) { s.nextGolden = now + this.goldenInterval(); this.emit('goldenSpawn', {}); }
    this._achAcc = (this._achAcc || 0) + dt;
    if (this._achAcc > 1) { this._achAcc = 0; this.checkAchievements(); }
  };

  var api = {
    Game: Game, SAVE_KEY: SAVE_KEY, OLD_KEY: OLD_KEY, KILLS_PER_ZONE: KILLS_PER_ZONE,
    HELPERS: HELPERS, UPGRADES: UPGRADES, STATS: STATS, RARITIES: RARITIES, SLOTS: SLOTS, AFFIXES: AFFIX_BY_ID,
    SKILLS: SKILLS, PRESTIGE: PRESTIGE, CRATE_SKINS: CRATE_SKINS, BG_SKINS: BG_SKINS, FX_SKINS: FX_SKINS, ACH: ACH, REGIONS: REGIONS,
    fmt: fmt, fmtTime: fmtTime, pct: pct, crateHp: crateHp, bossHp: bossHp, crateReward: crateReward, isBossZone: isBossZone,
    bossName: bossName, regionOf: regionOf, xpNeed: xpNeed, milestoneMult: milestoneMult, prestigeCost: prestigeCost, sparksFor: sparksFor,
    unlockText: unlockText, MILESTONES: MILESTONES
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.CrateCore = api;
})(typeof window !== 'undefined' ? window : this);
