// Улучшение предметов у Петра (сервер решает всё: стоимость, списание, уровень; клиент только показывает).
// Настройки — UPG (админка «⚒ Улучшение», kind='upgrade' id='main', живьём). Провалов и поломок нет: хватает материалов — +1 уровень.
// Уровень +N требует материал order[N-1] (порядок: по уровню мобов-источников, боссы/редкие — позже; см. MATERIALS.md).
// Проклятые: кол-во × cursedMult и второй материал — следующий по редкости (order[N]; на последнем уровне — предыдущий).
export const UPG_ORDER = ["soul_shard", "fly_wing", "dew_gel", "wisp_light", "fly_chitin", "bat_wing", "spore", "rot_ore", "mirage_fur", "imp_leaf", "moonpetal", "violet_dust", "dreamwood", "beetle_shell", "star_dust", "moon_fur", "fox_tail", "pome_seed", "starsilver", "thorn", "star_chitin", "gem_chunk", "garden_clay", "void_gel", "acid_gland", "spider_silk", "vine_sap", "imp_horn", "ghost_wax", "old_bone", "heat_core", "royal_dew", "queen_jelly", "harpy_feather", "rune_crystal", "grave_cloth", "glitch_shard", "void_iris", "thin_veil", "matron_seed", "lunar_dust", "fan_blade", "copper_wire", "star_core", "white_antler", "spark_core", "calm_core", "silence_core", "silent_thread", "memory_wisp", "rust_gear", "moon_shell", "violet_heart", "drake_scale", "echo_iron", "choir_note", "maw_bearing", "fallen_light"];
export const UPG: any = {
  maxLvl: 58,         // максимум улучшения (не больше числа материалов)
  cost: 3,            // материалов за уровень (обычная вещь), если для уровня не задано своё
  cursedMult: 2,      // проклятая вещь: кол-во × и второй материал
  flatPct: 3,         // обычная: +% к плоским статам за уровень (от базы, аддитивно)
  pctPts: 0.3,        // обычная: +п.п. к процентным статам (*Pct) за уровень
  cFlatPct: 3.5,      // проклятая: +% к плоским (от проклятой базы)
  cPctPts: 0.35,      // проклятая: +п.п. к процентным
  order: UPG_ORDER.slice(),        // материал уровня +1…+N
  costs: UPG_ORDER.map(() => 0),   // своё кол-во на уровень (0 — общее «cost»)
};
export const isPctStat = (k: string) => /Pct$/.test(k);
const r1 = (x: number) => Math.round(x * 10) / 10;
/** Статы экземпляра с улучшением +up. base — уже с проклятием (×statMult). Плоские: base × (1 + up·flat%); целые остаются целыми. */
export function upgStats(base: Record<string, any>, up: number, cursed: boolean, cfg: any = UPG): Record<string, any> {
  up = Math.max(0, Math.min(cfg.maxLvl | 0, up | 0));
  if (!up) return base;
  const fp = (cursed ? cfg.cFlatPct : cfg.flatPct) / 100, pp = cursed ? cfg.cPctPts : cfg.pctPts, o: any = {};
  for (const [k, v] of Object.entries(base || {})) {
    if (typeof v !== "number" || !v) { o[k] = v; continue; }
    o[k] = isPctStat(k) ? r1(v + up * pp) : Number.isInteger(v) ? Math.round(v * (1 + up * fp)) : Math.round(v * (1 + up * fp) * 100) / 100;
  }
  return o;
}
/** Стоимость перехода на уровень `to` (1…maxLvl): { ресурс: кол-во }. */
export function upgCost(to: number, cursed: boolean, cfg: any = UPG): Record<string, number> | null {
  if (!(to >= 1 && to <= cfg.maxLvl)) return null;
  const ord: string[] = cfg.order, m1 = ord[to - 1]; if (!m1) return null;
  const n = (cfg.costs?.[to - 1] || cfg.cost) * (cursed ? cfg.cursedMult : 1);
  const out: Record<string, number> = { [m1]: Math.round(n) };
  if (cursed) { const m2 = ord[to] || ord[to - 2]; if (m2 && m2 !== m1) out[m2] = (out[m2] || 0) + Math.round(n); }
  return out;
}
export const upgClient = () => JSON.parse(JSON.stringify(UPG));
