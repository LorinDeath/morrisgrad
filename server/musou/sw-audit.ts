// Сверяет снимок Орды с живыми скриптами Тёмного мира.
import fs from "node:fs";
import vm from "node:vm";
import path from "node:path";
import { SW_DUNGEONS, SW_FLOORS, SW_MODES, SW_QUESTS } from "../../src/scripts/musou/sw-catalog";

const root = path.join(process.cwd(), "public/shadow-world/js");

function live() {
  const ctx: any = { console, Math };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(root, "data.js"), "utf8"), ctx);
  const files = fs.readdirSync(path.join(root, "dungeons")).filter((f) => f.endsWith(".js")).sort();
  const recorded: any[] = [];
  ctx.generateTowerStages = (count: number, theme: string, mobs: any[], boss: any) => {
    recorded.push({ count, theme, mobs, boss });
    const stages = [];
    for (let f = 1; f <= count; f++) {
      const isBoss = f === count;
      const isSwarm = !isBoss && (f === 4 || f === 8 || f === 12);
      stages.push({ name: isBoss ? `Чертог Владыки (Этаж ${f})` : isSwarm ? `Орда (Этаж ${f})` : `Ярус ${f}: ${theme}`, _tower: 1 });
    }
    return stages;
  };
  for (const file of files) vm.runInContext(fs.readFileSync(path.join(root, "dungeons", file), "utf8"), ctx);
  vm.runInContext("this.__D = DUNGEONS; this.__Q = STORY_QUESTS; this.__M = MODE_MIN_LVL;", ctx);
  const clean = (s: string) => String(s || "").replace(/\uFE0F/g, "").replace(/\p{Extended_Pictographic}/gu, "").replace(/\s+/g, " ").trim();
  let towerI = 0;
  const dungeons = ctx.__D.map((d: any) => {
    const tower = d.stages?.[0]?._tower ? recorded[towerI++] : null;
    return {
      id: d.id,
      name: clean(d.name).replace(/\s*\(\d+\s*Этажей\)\s*$/i, ""),
      minLvl: d.minLvl | 0,
      stages: d.stages.length,
      names: d.stages.map((s: any) => tower ? s.name : clean(s.name)),
      bossId: tower ? tower.boss.id : (d.stages.flatMap((s: any) => s.enemies || []).find((e: any) => /\[БОСС\]|\[ФИНАЛЬНЫЙ БОСС\]/.test(e.name)) || {}).id || "",
    };
  });
  return { dungeons, quests: ctx.__Q.map((q: any) => q.id + ":" + q.targetId), modes: ctx.__M, dataJs: fs.readFileSync(path.join(root, "data.js"), "utf8") };
}

export function auditShadowCatalog(): string | null {
  const got = live();
  if (got.dungeons.length !== 17 || SW_DUNGEONS.length !== 17) return `данжей ${got.dungeons.length}, в снимке ${SW_DUNGEONS.length}`;
  if (SW_FLOORS.length !== got.dungeons.reduce((s, d) => s + d.stages, 0)) return "число этапов не сходится с файлами";
  for (let i = 0; i < 17; i++) {
    const a = got.dungeons[i];
    const b = SW_DUNGEONS[i];
    if (a.id !== b.id || a.name !== b.name || a.minLvl !== b.minLvl || a.stages !== b.stages.length) return `${a.id}: снимок разошёлся с файлом`;
    if (a.names.join("|") !== b.stages.map((s) => s.name).join("|")) return `${a.id}: имена этапов`;
    const boss = b.stages.flatMap((s) => s.enemies).find((e) => e.role === "boss");
    if ((boss?.id || "") !== a.bossId) return `${a.id}: босс ${a.bossId} против ${boss?.id}`;
  }
  if (got.quests.join(",") !== SW_QUESTS.map((q) => q.id + ":" + q.targetId).join(",")) return "квесты сюжета";
  for (const k of Object.keys(got.modes)) if (SW_MODES[k] !== got.modes[k]) return "режим " + k;
  if (!got.dataJs.includes("Чёрные Чумные Топи")) return "в data.js нет старого имени топей";
  if (SW_DUNGEONS[2].name !== "Хрустальные Пещеры" || SW_DUNGEONS[2].minLvl !== 6) return "живой третий данж — Хрустальные Пещеры, ур. 6";
  if (SW_DUNGEONS.some((d) => d.id.startsWith("mode_"))) return "режим попал в список данжей";
  return null;
}
