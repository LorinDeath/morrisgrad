export const WORLD_PORTALS = [
  {
    id: "portal_arcade",
    name: "Разлом Мини-игр",
    x: 12,
    y: 1188,
    width: 32,
    height: 32,
    color: "#a855f7",
  },
  {
    id: "portal_class_select",
    name: "Алтарь Перевоплощения",
    x: 565,
    y: 600,
    width: 32,
    height: 32,
    color: "#38bdf8",
  },
];

export const MINI_GAMES = [
  { id: "shadow_world", title: "Тёмный мир BETA", desc: "Игровые механики этой игры будут в Проклятых", url: "/shadow-world/index.html", disabled: false },
  { id: "quiz", title: "Викторина", desc: "Тесты по лору", url: "/quiz_obitel_smerti.html", disabled: false },
  { id: "musicc", title: "Музыкальная карусель", desc: "Просто интересный плеер", url: "/lorin_death_carousel_final.html", disabled: false },
  { id: "Darkestt", title: "Тёмный мир ALFA", desc: "Можешь сломать если хочешь", url: "/Darks.html", disabled: false },
  { id: "World", title: "Это мы с тобой (Скоро)", desc: "На техобслуживании", url: "", disabled: true },
  { id: "protokol", title: "Неоновый протокол (Скоро)", desc: "На техобслуживании", url: "", disabled: true },
  { id: "Zaglush", title: "Заглушка (Скоро)", desc: "На техобслуживании", url: "", disabled: true },
];

export const CLASSES_CONFIG: Record<string, {
  name: string;
  color: string;
  hp: number;
  maxHp: number;
  armor: number;
  minAtk: number;
  maxAtk: number;
}> = {
  warrior: {
    name: "Воин",
    color: "#38bdf8",
    hp: 200,
    maxHp: 200,
    armor: 50,
    minAtk: 1,
    maxAtk: 4,
  },
  spearman: {
    name: "Копейщик",
    color: "#ef4444",
    hp: 50,
    maxHp: 50,
    armor: 5,
    minAtk: 5,
    maxAtk: 10,
  },
  rogue: {
    name: "Разбойник",
    color: "#22c55e",
    hp: 150,
    maxHp: 150,
    armor: 8,
    minAtk: 1,
    maxAtk: 15,
  },
};