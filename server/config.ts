import { CHARACTER_CLASSES } from "./classes";
import type { WorldPortalDef } from "./types";

export const WORLD_PORTALS: WorldPortalDef[] = [
  {
    id: "portal_arcade",
    name: "Разлом Мини-игр",
    world: "hellfire",
    x: 12,
    y: 1188,
    width: 32,
    height: 32,
    color: "#a855f7",
  },
  {
    id: "portal_class_select",
    name: "Алтарь Перевоплощения",
    world: "hellfire",
    x: 565,
    y: 600,
    width: 32,
    height: 32,
    color: "#38bdf8",
  },
  // Портал в Аринар (слева от Адского костра)
  {
    id: "portal_arinar",
    name: "Фрактал Бабочки: «Аринар»",
    world: "hellfire",
    targetWorld: "arinar",
    targetX: 300,
    targetY: 600,
    x: 240,
    y: 600,
    width: 36,
    height: 36,
    color: "#818cf8",
  },
  // Обратный портал из Аринара в Мир Адского Пламени
  {
    id: "portal_hellfire",
    name: "Разлом: «Мир Адского Пламени»",
    world: "arinar",
    targetWorld: "hellfire",
    targetX: 300,
    targetY: 600,
    x: 240,
    y: 600,
    width: 36,
    height: 36,
    color: "#f97316",
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
}> = Object.fromEntries(
  Object.values(CHARACTER_CLASSES).map((c) => [
    c.id,
    {
      name: c.name,
      color: c.color,
      ...c.stats,
    },
  ])
);