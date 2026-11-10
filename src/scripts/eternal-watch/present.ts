// Тексты карточек и подсказок. Без DOM.
import { fmt, previewStats, rankCost, statsOf } from "./combat.ts";
import { goalsOf, mapById, type MapDef } from "./maps.ts";
import { bonusesFor, modeInfo, modeLabel, mutatorById } from "./modes.ts";
import { canBuy, nodeById } from "./research.ts";
import { modAt } from "./sim.ts";
import {
  ABILITY_BY_ID, DMG_NAME, TARGET_NAME, TOWER_NAME, TOWERS,
  type Meta, type ModKind, type Run, type TowerKind,
} from "./types.ts";

export interface TipButton { id: string; label: string; tip: string; on?: boolean }

const MOD_NAME: Record<ModKind, string> = {
  dmg: "урон", range: "радиус", rate: "темп", xp: "опыт", bounty: "дань",
};

export function towerTip(meta: Meta, kind: TowerKind, cost?: number, run: Run | null = null): string {
  const b = bonusesFor(meta, run);
  const spec = TOWERS[kind];
  const st = previewStats(kind, b);
  const price = cost ?? spec.cost;
  const locked = !b.unlocked[kind];
  const lines = [
    locked ? `${TOWER_NAME[kind]} закрыта. Откройте ветку в древе.` : `${TOWER_NAME[kind]}. Цена: ${price} золота.`,
  ];
  if (kind === "miner") {
    lines.push("Урон: нет. Жильник не стреляет.");
    lines.push("Добыча: 1 руда каждые 6 с, быстрее от древа.");
    lines.push("Опыт: 8 за единицу руды.");
  } else {
    lines.push(`Урон: ${fmt(st.dmg)}. Темп: ${fmt(st.rate)} выстр/с.`);
    lines.push(`Радиус: ${fmt(st.range)} клетки.`);
    lines.push(`Тип урона: ${DMG_NAME[spec.type]}.`);
    lines.push(spec.air || b.air[kind] ? "Бьёт землю и воздух." : "Бьёт землю. Воздух — отдельный узел древа.");
  }
  lines.push(spec.blurb);
  return lines.join("\n");
}

export function abilityTip(id: string, upgraded: boolean): string {
  const raw = id.startsWith("up:") ? id.slice(3) : id;
  const def = ABILITY_BY_ID[raw];
  if (!def) return "Умение.";
  if (id.startsWith("up:")) return `Усилить «${def.name}»: числа умения ×1.5. Один раз за башню.\n${def.text}`;
  return `${def.name}${upgraded ? " (усилено)" : ""}.\n${def.text}`;
}

export function towerCard(run: Run, meta: Meta, id: number): { title: string; lines: string[]; buttons: TipButton[] } | null {
  const map = mapById(run.mapId);
  const tower = run.towers.find((t) => t.id === id);
  if (!map || !tower) return null;
  const b = bonusesFor(meta, run);
  const mod = modAt(map, run, tower.x, tower.y);
  const spec = TOWERS[tower.kind];
  const lines: string[] = [];
  if (mod) lines.push(`Плитка: ${MOD_NAME[mod]}.`);
  if (tower.abilities.length) {
    lines.push("Умения: " + tower.abilities.map((a) => ABILITY_BY_ID[a]?.name ?? a).join(", ") + (tower.upgraded ? `. Усилено: ${ABILITY_BY_ID[tower.upgraded]?.name ?? ""}.` : "."));
  }
  const buttons: TipButton[] = [];
  if (tower.kind !== "miner") {
    for (const stat of ["dmg", "rate", "range"] as const) {
      const rank = tower.ranks[stat];
      const name = stat === "dmg" ? "Урон" : stat === "rate" ? "Темп" : "Радиус";
      const bonus = stat === "dmg" ? "+14% урона" : stat === "rate" ? "+10% темпа" : "+7% радиуса";
      if (rank >= 6) {
        buttons.push({ id: `up:${stat}`, label: `${name} ${rank}/6`, tip: `${name} уже на максимальном ранге 6. Ранги покупаются за золото этой ночи и не связаны с уровнем опыта.` });
      } else {
        const cost = rankCost(spec.cost, rank);
        buttons.push({
          id: `up:${stat}`,
          label: `${name} ${rank}→${rank + 1} · ${cost}`,
          tip: `Купить ранг «${name}» за ${cost} золота. ${bonus} к базе. Сейчас ранг ${rank} из 6. Это не уровень опыта.`,
        });
      }
    }
  }
  buttons.push({
    id: "target",
    label: `Прицел: ${TARGET_NAME[tower.target]}`,
    tip: "Сменить прицел по кругу: первый на тропе, последний, самый здоровый, ближайший.",
  });
  if (tower.offer) {
    for (const pick of tower.offer) {
      const def = ABILITY_BY_ID[pick.startsWith("up:") ? pick.slice(3) : pick];
      buttons.push({
        id: `ab:${pick}`,
        label: pick.startsWith("up:") ? `Усилить: ${def?.name ?? pick}` : (def?.name ?? pick),
        tip: abilityTip(pick, tower.upgraded === (pick.startsWith("up:") ? pick.slice(3) : pick)),
      });
    }
  }
  const refund = Math.min(tower.spent, Math.floor(tower.spent * Math.min(0.9, 0.7 + b.sell)));
  buttons.push({
    id: "sell",
    label: `Продать · ${refund}`,
    tip: `Снять башню и вернуть ${refund} золота. Это ${Math.round(Math.min(0.9, 0.7 + b.sell) * 100)}% от ${tower.spent} золота, вложенного в неё.`,
  });
  return { title: TOWER_NAME[tower.kind], lines, buttons };
}

export function dockOf(meta: Meta, run: Run | null = null): { kind: TowerKind; label: string; tip: string; locked: boolean; cost: number }[] {
  const b = bonusesFor(meta, run);
  return (Object.keys(TOWERS) as TowerKind[]).map((kind) => {
    const locked = !b.unlocked[kind];
    let cost = TOWERS[kind].cost;
    if (run && kind !== "miner" && !run.placedCombat) cost = Math.max(1, Math.ceil(cost * (1 - b.discount)));
    if (run?.mode === "sandbox") cost = 0;
    return { kind, label: TOWER_NAME[kind], tip: towerTip(meta, kind, cost, run), locked, cost };
  });
}

export function nodeTip(meta: Meta, id: string): string {
  const node = nodeById(id);
  if (!node) return "Нет такого узла.";
  const lv = meta.nodes[id] ?? 0;
  const gate = canBuy(meta, id);
  const cost = node.cost(Math.min(node.max, lv + 1));
  const lines = [
    `${node.name}. Уровень ${lv}/${node.max}.`,
    node.text,
    lv >= node.max ? "Дальше этот узел не берётся." : `Следующий уровень: ${cost.sparks} искр${cost.ash ? `, ${cost.ash} пепла` : ""}${cost.vein ? `, ${cost.vein} руды` : ""}.`,
  ];
  if (node.requires.length) {
    lines.push("Нужно: " + node.requires.map((r) => `${nodeById(r.id)?.name ?? r.id} ур. ${r.level}`).join("; ") + ".");
  }
  if (!gate.ok && lv < node.max) lines.push(gate.reason);
  return lines.join("\n");
}

export function globalTip(meta: Meta, id: "fire" | "bliz" | "dawn", cd: number, run: Run | null = null): string {
  const b = bonusesFor(meta, run);
  if (id === "fire") {
    return [
      "Пожар. Тап по клетке: 36 урона огнём в радиусе 2.2, больше от древа.",
      `Сейчас множитель урона ×${fmt(1 + b.firePower)}, радиус ×${fmt(1.12 ** Math.min(3, b.radiusSteps))}.`,
      `Перезарядка ${fmt(42 * 0.93 ** Math.min(5, b.cdSteps))} с. Осталось ${fmt(cd)} с.`,
      b.abFire ? "Умение открыто." : "Закрыто, пока в древе не взят Пожар.",
    ].join("\n");
  }
  if (id === "bliz") {
    return [
      "Буран. Замедляет всех на карте на 40%.",
      `Длительность ${fmt(4.2 + b.blizTime)} с.`,
      `Перезарядка ${fmt(46 * 0.93 ** Math.min(5, b.cdSteps))} с. Осталось ${fmt(cd)} с.`,
      b.abBliz ? "Умение открыто." : "Закрыто, пока в древе не взят Буран.",
    ].join("\n");
  }
  return [
    "Удар зари. Тап по клетке: 120 урона разрывом в радиусе 1.9. Сопротивления этой атаки ×0.6.",
    `Множитель урона ×${fmt(1 + b.dawnPower)}, радиус ×${fmt(1.12 ** Math.min(3, b.radiusSteps))}.`,
    `Перезарядка ${fmt(78 * 0.93 ** Math.min(5, b.cdSteps))} с. Осталось ${fmt(cd)} с.`,
    b.abDawn ? "Умение открыто." : "Закрыто, пока в древе не взят Удар зари.",
  ].join("\n");
}

export function summaryLines(run: Run): string[] {
  const map = mapById(run.mapId);
  const reward = run.reward;
  const stars = reward?.stars ?? 0;
  const info = modeInfo(run.mode);
  const lines = [
    run.mode === "sandbox" ? "Опыт закончен." : run.outcome === "win" ? "Ночь удержана." : "Врата пали.",
    `${info?.name ?? map?.name ?? "Ночь"}${run.mode === "endless" ? "" : map && info ? " · " + map.name : ""}.`,
    `Разобрано волн: ${run.wavesCleared}. Убийств: ${run.kills}. Прорывов: ${run.leaks}.`,
    `Сила Врат: ${Math.max(0, Math.floor(run.hearts))}/${Math.floor(run.maxHearts)}.`,
    `Золото за ночь: ${Math.floor(run.goldEarned)}.`,
  ];
  if (run.mutators?.length) {
    lines.push("Модификаторы: " + run.mutators.map((id) => mutatorById(id)?.name ?? id).join(", ") + ".");
  }
  if (run.mode === "sandbox") lines.push("Песочница не приносит искр и не пишет рекорд.");
  else if (reward) lines.push(`Награда: ${reward.sparks} искр, ${reward.ash} пепла, ${fmt(reward.vein)} руды.`);
  else lines.push("Награда ещё не записана.");
  if (run.mode === "endless") lines.push("Рекорд волн на этой карте растёт, звёзды не ставятся.");
  else if (run.mode === "campaign") lines.push(`Звёзды этой попытки: ${stars}.`);
  else if (run.mode === "daily") lines.push(`Рекорд этой даты считается по разобранным волнам.`);
  else if (info) lines.push(info.score);
  return lines;
}

export function towerStatsLine(run: Run, meta: Meta, id: number): { dmg: number; rate: number; range: number } | null {
  const map = mapById(run.mapId);
  const tower = run.towers.find((t) => t.id === id);
  if (!map || !tower || tower.kind === "miner") return null;
  const st = statsOf(tower, modAt(map, run, tower.x, tower.y), bonusesFor(meta, run), 0);
  return { dmg: st.dmg, rate: st.rate, range: st.range };
}

void modeLabel;

export function briefLines(map: MapDef, stars: number, best: number): string[] {
  const goals = goalsOf(map);
  return [
    map.blurb,
    `Волн: ${map.waves}. Сложность ${map.difficulty}.`,
    `Цели: 1) ${goals[0]} 2) ${goals[1]} 3) ${goals[2]}`,
    stars > 0 ? `Уже взято звёзд: ${stars}.` : "Звёзд пока нет.",
    best > 0 ? `Лучшая бесконечная волна: ${best}.` : "Бесконечный рекорд ещё не поставлен.",
  ];
}
