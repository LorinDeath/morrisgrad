// Проверка предметов, которые клиент мини-игр присылает в POST /api/inventory (данные игрока — не доверяем).
// Предмет потом виден в публичном профиле /u/<id>, поэтому: только строки ограниченной длины,
// иконка — эмодзи/короткий текст или https-ссылка, статы — числа. Лишние поля отбрасываются.
export const INV_MAX_BATCH = 50;
const RARITIES = new Set(["common", "uncommon", "rare", "epic", "legendary", "mythic", "divine"]);
const str = (v: any, max: number, def = "") => (typeof v === "string" ? v.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, max) : def);
function stats(o: any): Record<string, number> {
  const out: Record<string, number> = {};
  if (!o || typeof o !== "object" || Array.isArray(o)) return out;
  let n = 0;
  for (const [k, v] of Object.entries(o)) {
    if (n >= 30) break;
    if (!/^[A-Za-z_][A-Za-z0-9_]{0,31}$/.test(k) || k === "__proto__") continue;
    const x = Number(v);
    if (!Number.isFinite(x) || Math.abs(x) > 1e9) continue;
    out[k] = x; n++;
  }
  return out;
}
export type CleanItem = { item_id: string; name: string; desc: string; source: string; type: string; rarity: string; stats: Record<string, number>; icon: string; setId: string | null; setStats: Record<string, number> };
export function cleanInventoryItem(it: any): CleanItem | null {
  if (!it || typeof it !== "object" || Array.isArray(it)) return null;
  const name = str(it.name, 80);
  if (!name) return null;
  let icon = str(it.icon, 300, "📦");
  if (/^https?:/i.test(icon)) { try { const u = new URL(icon); icon = u.protocol === "https:" && !/["'<>\s\\`]/.test(icon) ? u.toString() : "📦"; } catch { icon = "📦"; } }
  else icon = icon.slice(0, 16) || "📦";
  const rarity = RARITIES.has(String(it.rarity)) ? String(it.rarity) : "common";
  return {
    item_id: str(it.id, 64, "unknown") || "unknown",
    name, desc: str(it.desc, 500), source: str(it.source, 60, "Unknown") || "Unknown",
    type: str(it.type, 24), rarity, stats: stats(it.stats), icon,
    setId: str(it.setId, 40) || null, setStats: stats(it.setStats),
  };
}
