// Навык слота R: любой навык игры. Код id: "<run skill>" (как раньше), "ab:<навык героя/монстра>", "mob:<навык монстров>".
// Общий для сервера (каст, проверки) и клиента (админка, карточки, Кодекс) — без серверных зависимостей.
import { ABILITY_BY_ID, ABILITIES_DEF, RUN_SKILLS, RUN_SKILL_BY_ID, HERO_NAMES } from "./shared";
import { MOB_SKILLS } from "./mobSkills";

export const RS_BASE_CD = 8; // с, как WEAPON_SKILL_CD
// Навыки оружия (R) как редактируемые записи админки «Навыки» (кд/сила/черты): ключ "rs:<id>"
export const RS_DEF: Record<string, { id: string; name: string; icon: string; desc: string; cd: number; power: number; unlockLevel: number; cls: string }> =
  Object.fromEntries(RUN_SKILLS.map((r) => ["rs:" + r.id, { id: "rs:" + r.id, name: r.name, icon: r.icon, desc: r.desc, cd: 8, power: 1, unlockLevel: 1, cls: "weapon" }]));
/** Единый реестр навыков игры для админки: навыки героев/монстров (те же объекты, что ABILITY_BY_ID) + навыки оружия R. */
export const SKILL_REGISTRY: Record<string, any> = { ...ABILITY_BY_ID, ...RS_DEF };
export interface RsInfo { id: string; group: "weapon" | "hero" | "mob"; name: string; icon: string; desc: string; cd: number; power: number; castId: string }
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
export function rsInfo(id: string | null | undefined): RsInfo | null {
  if (!id) return null;
  const r = RUN_SKILL_BY_ID[id];
  if (r) { const D = RS_DEF["rs:" + id]; return { id, group: "weapon", name: r.name, icon: r.icon, desc: r.desc, cd: Math.max(1, D?.cd ?? RS_BASE_CD), power: D?.power ?? 1, castId: "rs:" + id }; }
  if (id.startsWith("ab:")) { const d: any = (ABILITY_BY_ID as any)[id.slice(3)]; if (!d) return null;
    // навык героя в слоте R: своя форма (общие формы abilityShapes), перезарядка не меньше базовой R, сила — в разумных рамках
    return { id, group: d.cls === "monster" ? "mob" : "hero", name: d.name, icon: d.icon || "✦", desc: d.desc || "", cd: Math.max(RS_BASE_CD, d.cd || RS_BASE_CD), power: clamp(d.power || 1, 0.8, 1.5), castId: d.id }; }
  if (id.startsWith("mob:")) { const k = id.slice(4), m = MOB_SKILLS[k]; if (!m) return null;
    return { id, group: "mob", name: m.name, icon: "👹", desc: "Навык монстров и боссов", cd: Math.max(RS_BASE_CD, m.cd), power: 1, castId: (ABILITY_BY_ID as any)[k] ? k : "mob:" + k }; }
  return null;
}
export const isRs = (id: any) => typeof id === "string" && !!rsInfo(id);
/** Все варианты для админки: группы по категориям, русские названия. */
export function rsOptions(): { id: string; name: string; group: string }[] {
  const out: { id: string; name: string; group: string }[] = [];
  for (const r of RUN_SKILLS) out.push({ id: r.id, name: r.name, group: "Оружие (R)" });
  for (const d of ABILITIES_DEF as any[]) out.push({ id: "ab:" + d.id, name: d.name + (d.cls && d.cls !== "monster" && d.cls !== "artifact" ? ` (${(HERO_NAMES as any)[d.cls] || d.cls})` : ""), group: d.cls === "artifact" ? "Артефакты" : d.cls === "monster" ? "Монстры" : "Герои" });
  for (const [k, m] of Object.entries(MOB_SKILLS)) if (!k.startsWith("rs:") && !(ABILITY_BY_ID as any)[k]) out.push({ id: "mob:" + k, name: m.name, group: "Монстры" });
  return out;
}
/** id карточки Кодекса для навыка слота R: оружие → "rs:<id>", навык героя/монстра → его id, навык монстров → "mob:<id>". */
export function rsCodexId(id: string): string {
  if (id.startsWith("ab:")) return id.slice(3);
  if (id.startsWith("mob:")) return (ABILITY_BY_ID as any)[id.slice(4)] ? id.slice(4) : id;
  return "rs:" + id;
}
