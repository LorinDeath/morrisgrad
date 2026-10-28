// Сюжет «Проклятые: Гул Мэлвелдила» (STORY-proklyatye.md, канон отрывка «Алзи и Лэйр»).
// Пролог на Поляне перевоплощения → Аринар (Мэлвелдил): «Чувствовать» (Лэйр), «Держать мир» (Алзи) →
// совместная «Гул» (командные данжи) → звёздные квесты (жёлтые → красные → фиолетовые) → экзамены →
// чёрная звезда. Тексты оригинальные. Прогресс и награды считает только сервер.

export type Objective =
  | { type: "talk"; npc: string; text: string }
  | { type: "select_hero"; text: string }
  | { type: "reach"; world: string; text: string }
  | { type: "kill"; mob: string; count: number; text: string; noAbilities?: boolean; cls?: string }
  | { type: "gather"; res: string; count: number; text: string }
  | { type: "equip_monster"; monster: string; text: string }
  | { type: "craft"; count: number; text: string }
  | { type: "talent"; count: number; text: string }
  | { type: "run"; room: string; minTime: number; text: string; cls?: string; minPlayers?: number; maxPlayers?: number }
  | { type: "duel_win"; text: string; hpCapPct?: number }
  | { type: "kill_boss"; mob: string; text: string; noAbilities?: boolean }
  // квесты из админ-панели: собрать предмет/ресурс (сдаются при сдаче) и достичь уровня — проверяются по профилю
  | { type: "collect"; item?: string; res?: string; count: number; text: string }
  | { type: "level"; count: number; text: string };

export interface QuestDef {
  id: string; npc: string; campaign: "prologue" | "leyr" | "alzi" | "joint" | "star" | "exam" | "black" | "custom";
  turnin?: string; minLevel?: number; lore?: string; custom?: boolean; // квесты админ-панели: сдать другому NPC, мин. уровень, текст-лор
  title: string; chapter?: string; star?: "yellow" | "red" | "purple" | "black";
  requires?: string[];
  requiresStars?: { npc: string; color: string; count: number };
  auto?: boolean; // сдаётся автоматически (пролог)
  track?: boolean; // отслеживание целей-мобов (подсветка на карте/мини-карте + компас); false — выключено в админке
  objectives: Objective[];
  rewards: { xp?: number; stars?: Record<string, number>; items?: string[]; res?: Record<string, number>; flag?: string };
  offer: string[]; progress: string; done: string[];
  hint?: string;
}

export const QUESTS: QuestDef[] = [
  // ---------------- Пролог «Как детализировано» (Поляна перевоплощения = хаб) ----------------
  { id: "p1_swarm", npc: "leyr_echo", campaign: "prologue", chapter: "Пролог «Как детализировано»", title: "Мошкара лезет в глаза", auto: true,
    objectives: [{ type: "kill", mob: "blade_fly", count: 3, text: "Отбейтесь от Мошкары-Жнеца на краю Поляны" }],
    rewards: { xp: 40, items: ["fly_legs"] }, hint: "Мошкара роится на северном краю Поляны. Атака — ЛКМ в сторону цели (удерживайте); на телефоне — кнопка ⚔.",
    offer: ["Шелестит трава. Пахнет фиалками. Где-то далеко двое смотрят на звёзды…", "…и мир гудит, как вентилятор. Над поляной вспыхивает фиолетовая полоса. Из травы поднимается рой."],
    progress: "Рой ещё жужжит.", done: ["Архив Отголоска распакован: вам достались сапоги-лапки. Так здесь устроено — что было у врага, становится вашим."] },
  { id: "p2_shell", npc: "leyr_echo", campaign: "prologue", chapter: "Пролог «Как детализировано»", title: "Оболочка", requires: ["p1_swarm"], auto: true,
    objectives: [{ type: "select_hero", text: "Подойдите к Алтарю перевоплощения (E) и выберите оболочку" }],
    rewards: { xp: 40 }, hint: "Алтарь — сияющий кристалл в центре Поляны",
    offer: ["Алтарь помнит каждого, кто на нём выбирал оболочку. Иногда он тихо гудит — будто за ним кто-то дышит.", "Каждая оболочка помнит своё: качать её придётся отдельно."],
    progress: "Алтарь в центре Поляны.", done: ["Вы надели чужую память. Она вам к лицу."] },
  { id: "p3_take", npc: "leyr_echo", campaign: "prologue", chapter: "Пролог «Как детализировано»", title: "Забери всё", requires: ["p2_shell"], auto: true,
    objectives: [{ type: "equip_monster", monster: "blade_fly", text: "Наденьте трофей Мошкары (Книга Проклятого → Снаряжение, клавиша I)" }],
    rewards: { xp: 40 }, hint: "Откройте снаряжение (I) и наденьте «Сапоги-лапки»",
    offer: ["Главное правило Проклятых: убил — распаковал — забрал. Оружие, броню, сапоги, облик, способности."],
    progress: "Наденьте трофей.", done: ["Жужжит? Это нормально."] },
  { id: "p4_dream", npc: "leyr_echo", campaign: "prologue", chapter: "Пролог «Как детализировано»", title: "Чужие сны", requires: ["p3_take"], auto: true,
    objectives: [{ type: "reach", world: "arinar", text: "Войдите в разлом «Фрактал Бабочки: Аринар» (запад Поляны)" }],
    rewards: { xp: 60 }, hint: "Фиолетовый разлом на западе Поляны",
    offer: ["Порталы — это чужие сны. Западный ведёт в Аринар, в государство Мэлвелдил. Там живут Алзи и Лэйр."],
    progress: "Разлом — на западе.", done: ["Гранатовые сады под фиолетовым полумесяцем. Мир стал шире."] },

  // ---------------- Кампания Лэйр «Чувствовать» ----------------
  { id: "l1_wind", npc: "leyr", campaign: "leyr", chapter: "«Чувствовать» · Глава 1: Ветер", title: "Ветер перестал дуть", requires: ["p4_dream"],
    objectives: [{ type: "talk", npc: "leyr", text: "Поговорите с Лэйр на лугу" }], rewards: { xp: 60, flag: "radiance_open" },
    hint: "Лэйр — у фиалкового луга в деревне, на западе Аринара",
    offer: ["Вы тоже Проклятый? Тогда вы поймёте. Сегодня утром ветер… просто перестал.", "Я столько лет не чувствовала, как воздух холодит лицо. Я не отдам это обратно."],
    progress: "Лэйр смотрит на неподвижную траву.", done: ["Навык, в который вложено чувство, светится. Это Сияние. Я покажу вам — когда наберёте звёзд."] },
  { id: "l2_moths", npc: "leyr", campaign: "leyr", chapter: "«Чувствовать» · Глава 1: Ветер", title: "Тихие мотыльки", requires: ["l1_wind"],
    objectives: [{ type: "kill", mob: "dream_moth", count: 6, text: "Развейте тихих мотыльков на Лугах (юг)" }], rewards: { xp: 120, res: { moonpetal: 2 } },
    hint: "Мотыльки кружат над Лугами мотыльков — к югу от деревни",
    offer: ["Тихие мотыльки садятся на траву — и она перестаёт шуметь. Прогоните их."],
    progress: "Ещё тихо…", done: ["Слышите? Шелест! Совсем слабый, но есть."] },
  { id: "l3_violets", npc: "leyr", campaign: "leyr", chapter: "«Чувствовать» · Глава 1: Ветер", title: "Запах фиалок", requires: ["l2_moths"],
    objectives: [{ type: "gather", res: "moonpetal", count: 3, text: "Соберите ночные фиалки (удерживайте E у цветка)" }], rewards: { xp: 120 },
    hint: "Фиалки светятся в траве по всему Мэлвелдилу",
    offer: ["Я боюсь однажды проснуться в тишине и не вспомнить, как они пахнут. Принесите три фиалки."],
    progress: "Ещё фиалки?", done: ["Пахнут. По-настоящему пахнут."] },
  { id: "l4_boss", npc: "leyr", campaign: "leyr", chapter: "«Чувствовать» · Глава 1: Ветер", title: "Безветрие", requires: ["l3_violets"],
    objectives: [{ type: "kill_boss", mob: "moon_sentinel", text: "Победите Безветрие — Отголоска, съевшего ветер (мировой босс Восточного кряжа, ур. 15; засчитывается убийство в открытом мире — и всему отряду рядом). Лучше вместе с другими Проклятыми" }],
    rewards: { xp: 400, stars: { yellow: 1 }, items: ["melveldil_sandals"] }, hint: "Мировой босс Восточного кряжа: о пробуждении объявят всем в Аринаре",
    offer: ["Тот, кто съел ветер, просыпается на Восточном кряже под полумесяцем. Он огромный. Зовите других — и наберитесь сил."],
    progress: "Ветра всё ещё нет.", done: ["Ветер! Он вернулся! …Держите звезду. Это сохранённое воспоминание — потратьте его на Сияние.", "Теперь у меня есть для вас и нечестные задания. Звёздные."] },

  // ---------------- Кампания Алзи «Держать мир» ----------------
  { id: "a1_pillars", npc: "alzi", campaign: "alzi", chapter: "«Держать мир» · Глава 1: Опоры", title: "Опоры", requires: ["p4_dream"],
    objectives: [{ type: "talk", npc: "alzi", text: "Поговорите с Алзи у древнего шпиля" }], rewards: { xp: 60, flag: "talents_open" },
    hint: "Алзи стоит у светлого шпиля в деревне, на западе Аринара",
    offer: ["Видите шпиль? Это опора Мэлвелдила. Слышите, как он гудит? Когда опоры раскаляются, мир начинает… сжимать лишнее.", "Из сжатого рождаются Отголоски. Мошкара, мотыльки… Не спрашивайте, откуда я это знаю. Мне нужна помощь."],
    progress: "Алзи прислушивается к гулу.", done: ["Ваша оболочка умеет расти. Каждый уровень — очко таланта. Дерево талантов теперь открыто."] },
  { id: "a2_heat", npc: "alzi", campaign: "alzi", chapter: "«Держать мир» · Глава 1: Опоры", title: "Перегрев", requires: ["a1_pillars"],
    objectives: [{ type: "kill", mob: "rot_glitch", count: 6, text: "Уничтожьте Глитч-слизь у перегретой опоры (Луга мотыльков, юг)" }], rewards: { xp: 120, res: { soul_shard: 2 } },
    hint: "Зелёная рябь на Лугах мотыльков, к югу от деревни",
    offer: ["На южных лугах пошла зелёная рябь — трава мерцает, как плохой сон. Сотрите слизь, пока она не расползлась."],
    progress: "Опора всё ещё горячая.", done: ["Гул выровнялся. Спасибо."] },
  { id: "a3_cool", npc: "alzi", campaign: "alzi", chapter: "«Держать мир» · Глава 1: Опоры", title: "Холодный металл", requires: ["a2_heat"],
    objectives: [{ type: "gather", res: "starsilver", count: 2, text: "Соберите звёздное серебро (оно холодит руки)" }], rewards: { xp: 120 },
    hint: "Серебряные кристаллы — в Звёздных пустошах (северо-восток от деревни) и на Восточном кряже",
    offer: ["Звёздное серебро холодное, как сквозняк в ночном коридоре. Принесите два куска."],
    progress: "Нужно серебро.", done: ["Хватит, чтобы остудить один зал."] },
  { id: "a4_hall", npc: "alzi", campaign: "alzi", chapter: "«Держать мир» · Глава 1: Опоры", title: "Перегретый зал", requires: ["a3_cool"],
    objectives: [{ type: "run", room: "abyss", minTime: 180, text: "Продержитесь 3 минуты в «Бездне» — перегретом зале под Аринаром" }], rewards: { xp: 250, items: ["chronicle_page"] },
    hint: "Портал «Бездна» — на восточном краю деревни Аринара",
    offer: ["Под Аринаром — залы, где жарче всего. Там Отголоски рождаются толпами. Продержитесь три минуты, пока я сбрасываю нагрузку.", "…И да. Я позвал вас сюда, не спросив как следует. Простите. Шутка про мошкару не помогает, я знаю."],
    progress: "Зал всё ещё горит.", done: ["Остыло. Вы держите мир лучше, чем я."] },

  // ---------------- Совместная кампания «Гул» (командные данжи) ----------------
  { id: "j1_fans", npc: "alzi", campaign: "joint", chapter: "«Гул» · Гудящий зал", title: "Гудящий зал", requires: ["l4_boss", "a4_hall"],
    objectives: [{ type: "run", room: "abyss", minTime: 240, minPlayers: 2, text: "Командный данж: 4 минуты в «Бездне» отрядом от двух Проклятых" }], rewards: { xp: 500, res: { starsilver: 3 } },
    hint: "Соберите отряд и войдите в «Бездну» вместе",
    offer: ["Глушитель выбрал, что заглушить первым. Самое громкое сердце в Мэлвелдиле — у Лэйр.", "Одному туда нельзя. Собирайте отряд. Мы идём туда, откуда идёт гул."],
    progress: "Нужен отряд.", done: ["Гудящий зал пройден. Где-то за стенами что-то вращается — ровно, без устали. Дальше — Озоновый коридор. (Следующие данжи — скоро.)"] },

  // ---------------- Звёздные квесты Лэйр ----------------
  { id: "sl_y1", npc: "leyr", campaign: "star", star: "yellow", title: "★ Без рук", requires: ["l4_boss"],
    objectives: [{ type: "kill", mob: "blade_fly", count: 10, noAbilities: true, text: "10 Мошкар-Жнецов БЕЗ навыков (навык сбрасывает прогресс)" }], rewards: { stars: { yellow: 1 } },
    offer: ["Нечестное задание: только обычные удары. Почувствуйте бой руками."], progress: "Без навыков!", done: ["Звезда ваша."] },
  { id: "sl_y2", npc: "leyr", campaign: "star", star: "yellow", title: "★ Одна оболочка", requires: ["l4_boss"],
    objectives: [{ type: "run", room: "crypt", minTime: 150, cls: "mage", text: "2.5 минуты в «Склепе» за Мариэль" }], rewards: { stars: { yellow: 1 } },
    offer: ["Пройдите сон в самой хрупкой оболочке."], progress: "Мариэль. Склеп.", done: ["Звезда."] },
  { id: "sl_y3", npc: "leyr", campaign: "star", star: "yellow", title: "★ Не чувствуя", requires: ["l4_boss"],
    objectives: [{ type: "duel_win", hpCapPct: 50, text: "Выиграйте «Испытание отражений» с 50% здоровья" }], rewards: { stars: { yellow: 1 } },
    offer: ["Испытание отражений, но вы начинаете наполовину пустым."], progress: "Полживота и победа.", done: ["Звезда!"] },
  { id: "sl_r1", npc: "leyr", campaign: "star", star: "red", title: "★★ Красный рассвет", requiresStars: { npc: "leyr", color: "yellow", count: 3 },
    objectives: [{ type: "run", room: "crypt", minTime: 360, maxPlayers: 1, text: "Соло: 6 минут в «Склепе»" }], rewards: { stars: { red: 1 } },
    offer: ["Красные звёзды горячие. Одна. Шесть минут."], progress: "Соло.", done: ["Красная звезда."] },
  { id: "sl_p1", npc: "leyr", campaign: "star", star: "purple", title: "★★★ Фиолетовая полоса", requiresStars: { npc: "leyr", color: "red", count: 1 },
    objectives: [{ type: "kill_boss", mob: "moon_sentinel", noAbilities: true, text: "Победите Безветрие, не применяя навыков" }], rewards: { stars: { purple: 1 } },
    offer: ["Иногда в небе на миг проступает фиолетовая неоновая полоса. Как свет фонаря в окно. Помогите понять, откуда она."], progress: "…", done: ["Фиолетовая звезда. Вы готовы к экзамену."] },
  { id: "sl_exam", npc: "leyr", campaign: "exam", title: "Экзамен: Хранитель ощущений", requiresStars: { npc: "leyr", color: "purple", count: 1 },
    objectives: [{ type: "duel_win", hpCapPct: 30, text: "Выиграйте дуэль с 30% здоровья" }, { type: "run", room: "abyss", minTime: 420, text: "7 минут в «Бездне»" }],
    rewards: { xp: 1000, flag: "class_sensekeeper" },
    offer: ["Экзамен на «Хранителя ощущений»."], progress: "Экзамен идёт.", done: ["Персональный класс «Хранитель ощущений» ваш (скоро на Алтаре).", "И есть ещё одно задание. Чёрное. Брать его не обязательно."] },
  { id: "sl_black", npc: "leyr", campaign: "black", star: "black", title: "✦ Отданное воспоминание", requires: ["sl_exam"],
    objectives: [{ type: "kill_boss", mob: "moon_sentinel", noAbilities: true, text: "Победите Безветрие без навыков ещё раз" }], rewards: { stars: { black: 1 } },
    offer: ["Чёрная звезда — воспоминание, которое отдают миру добровольно. Глушитель отнимает силой. Вы — выбираете."], progress: "…", done: ["Она ваша. Распоряжаться ею не обязательно."] },

  // ---------------- Звёздные квесты Алзи ----------------
  { id: "sa_y1", npc: "alzi", campaign: "star", star: "yellow", title: "★ Опора без навыков", requires: ["a4_hall"],
    objectives: [{ type: "kill", mob: "rot_glitch", count: 8, noAbilities: true, text: "8 Глитч-слизней без навыков" }], rewards: { stars: { yellow: 1 } },
    offer: ["Майнер отключает навыки, когда перегревается. Привыкайте."], progress: "Без навыков.", done: ["Звезда."] },
  { id: "sa_y2", npc: "alzi", campaign: "star", star: "yellow", title: "★ Один в зале", requires: ["a4_hall"],
    objectives: [{ type: "run", room: "abyss", minTime: 240, maxPlayers: 1, text: "Соло: 4 минуты в «Бездне»" }], rewards: { stars: { yellow: 1 } },
    offer: ["В этот раз — без отряда."], progress: "Соло.", done: ["Звезда."] },
];
export const QUEST_BY_ID: Record<string, QuestDef> = Object.fromEntries(QUESTS.map((q) => [q.id, q]));
/** Квесты админ-панели (D1 custom_quests): заменить набор «custom» в общих таблицах (сервер — при загрузке/сохранении, клиент — из meta_state). */
export function setCustomQuests(list: QuestDef[]) {
  for (let i = QUESTS.length - 1; i >= 0; i--) if (QUESTS[i].custom) { delete QUEST_BY_ID[QUESTS[i].id]; QUESTS.splice(i, 1); }
  for (const q of list) { if (QUEST_BY_ID[q.id]) continue; const d = { ...q, custom: true, campaign: "custom" as const }; QUESTS.push(d); QUEST_BY_ID[q.id] = d; }
}
// правки СЮЖЕТНЫХ квестов из админ-панели: поверх значений из кода, id не меняется (прогресс игроков сохраняется).
// Объект квеста мутируется на месте — ссылки QUEST_BY_ID/QUESTS остаются теми же; null — вернуть исходное.
const QUEST_ORIG = new Map<string, QuestDef>();
export const QUEST_EDITABLE = ["title", "chapter", "npc", "turnin", "minLevel", "requires", "objectives", "rewards", "offer", "progress", "done", "lore", "hint"] as const;
export function questOriginal(id: string): QuestDef | undefined { const q = QUEST_BY_ID[id]; if (!q || q.custom) return undefined; return QUEST_ORIG.get(id) || q; }
export function applyBuiltinOverride(id: string, patch: Partial<QuestDef> | null) {
  const q = QUEST_BY_ID[id]; if (!q || q.custom) return;
  if (!QUEST_ORIG.has(id)) QUEST_ORIG.set(id, JSON.parse(JSON.stringify(q)));
  const o = QUEST_ORIG.get(id)! as any;
  for (const k of QUEST_EDITABLE) { (q as any)[k] = o[k] === undefined ? undefined : JSON.parse(JSON.stringify(o[k])); }
  (q as any).edited = false;
  if (patch) { for (const k of QUEST_EDITABLE) if ((patch as any)[k] !== undefined) (q as any)[k] = (patch as any)[k]; (q as any).edited = true; }
}
export function builtinOverrides(): Partial<QuestDef>[] { return QUESTS.filter((q: any) => !q.custom && q.edited).map((q) => { const o: any = { id: q.id }; for (const k of QUEST_EDITABLE) o[k] = (q as any)[k]; return o; }); }
export const turninNpc = (q: QuestDef) => q.turnin || q.npc;
export const CAMPAIGN_NAMES: Record<string, string> = { custom: "Поручения", prologue: "Пролог", leyr: "Лэйр · «Чувствовать»", alzi: "Алзи · «Держать мир»", joint: "Совместная · «Гул»", star: "Звёздные квесты", exam: "Экзамены", black: "Чёрная звезда" };
