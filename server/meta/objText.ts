// Текст цели квеста по её типу — когда автор (админка) не задал свой или оставил заглушку «Цель». Общая часть сервера и клиента.
import { ZONE_MOBS, ITEM_BY_ID } from "./defs";
import { NPCS, RESOURCES } from "./shared";
import { baseOf } from "./biomes";
import { objConds, condText } from "./questConds";
const WN: Record<string, string> = { arinar: "Аринар", hellfire: "Поляна" };
const mobName = (id: string) => (ZONE_MOBS as any)[id]?.name || (ZONE_MOBS as any)[baseOf(id)]?.name || id;
export function autoObjText(o: any): string {
  switch (o?.type) {
    case "kill": return `Убить: ${mobName(o.mob)}`;
    case "kill_boss": return `Победить: ${mobName(o.mob)}`;
    case "talk": return `Поговорить: ${NPCS[o.npc]?.name || o.npc}`;
    case "gather": return `Добыть: ${RESOURCES[o.res]?.name || o.res}`;
    case "collect": return `Собрать: ${o.item ? ITEM_BY_ID[o.item]?.name || o.item : RESOURCES[o.res]?.name || o.res}`;
    case "level": return `Достичь уровня ${o.count || 1}`;
    case "reach": return `Попасть: ${WN[o.world] || o.world}`;
    default: return "Цель";
  }
}
/** Текст для показа: свой текст автора, иначе — по типу цели (старые сохранения с «Цель» тоже чинятся). */
export function objText(o: any): string { const t = String(o?.text || "").trim(); return t && t !== "Цель" ? t : autoObjText(o); }

/** условия цели одной строкой («не применяя навыков · быстрее 60 с»), пусто — условий нет */
export function condLine(o: any): string { return objConds(o).map(condText).join(" · "); }
