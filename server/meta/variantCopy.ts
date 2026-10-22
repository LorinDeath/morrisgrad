// Копии трофеев вариантов биомов (content.ts variantItems, id «<вариант>_<слот>», поле part — базовый предмет).
// Принцип: D1 (game_overrides) — источник истины. Копия — полноценный предмет: своя строка в game_overrides
// (создаётся один раз скриптом выкладки tools/seed-variant-copies.ts, админка правит её как любой предмет).
// Пока у копии нет своей строки — она НАСЛЕДУЕТ правку базы на лету (copyPatch): навык R, черты, разбор — как у базы;
// уровень — уровень моба-варианта; треб. уровень — тот же сдвиг от уровня, что у базы; статы — профиль базы
// (какие линии и в каких долях), подогнанный под кривую «сила по уровню» соседей того же слота и редкости
// (ДЕЙСТВУЮЩИЕ значения: код + правки D1, копии в выборку не входят).
import { ITEM_BY_ID } from "./defs";
import { itemBudget, weaponAvg, weaponHitMult, STAT_COST, ITEM_LINE_CAP } from "./balance";
import { statRound } from "./content";
import { TRAITS } from "./overrides";

export const COPY_STATS = ["dmgMin", "dmgMax", "armor", "hp", "speedPct", "critPct", "regen", "cdrPct", "magnetPct", "lifestealPct", "atkSpeedPct", "armorPen", "armorPenPct"];
const DMG = new Set(["dmgMin", "dmgMax"]);
/** все копии: id → базовый предмет */
export function copyIds(): string[] { return Object.values<any>(ITEM_BY_ID).filter((i) => i.part && ITEM_BY_ID[i.part]).map((i) => i.id); }
export const isCopy = (id: string) => !!(ITEM_BY_ID as any)[id]?.part;
export const copyBase = (id: string): string | null => (ITEM_BY_ID as any)[id]?.part || null;

/** «сила» линий (в единицах бюджета STAT_COST): у оружия — отдельно урон (средний удар / множитель типа) и прочие линии */
export function powerOf(it: any): { dmg: number; sec: number } {
  const s = it?.stats || {}; let sec = 0;
  for (const k of COPY_STATS) if (!DMG.has(k)) sec += (Number(s[k]) || 0) * (STAT_COST[k] || 1);
  const dmg = it?.slot === "weapon" ? ((Number(s.dmgMin) || 0) + (Number(s.dmgMax) || 0)) / 2 / weaponHitMult(it.wtype) : 0;
  return { dmg, sec };
}
const median = (a: number[]) => { const b = [...a].sort((x, y) => x - y), n = b.length; return n ? (n % 2 ? b[(n - 1) / 2] : (b[n / 2 - 1] + b[n / 2]) / 2) : 0; };

export type PeerCurve = { dmg: number; sec: number; n: number; win: number; any: boolean };
/** медиана соседей (не копии) того же слота и редкости около уровня L; соседи приведены к L по форме бюджета кода.
 *  Окно ±0…±5 ур., пока не наберётся ≥3; иначе — тот же слот любой редкости (приведение по множителю редкости). */
export function peerCurve(slot: string, rarity: string, L: number, metric: "dmg" | "sec" | "both" = "both"): PeerCurve {
  const pool = Object.values<any>(ITEM_BY_ID).filter((i) => !i.part && i.slot === slot && (i.lvl || 1) > 0);
  const norm = (i: any) => { const p = powerOf(i), l = i.lvl || 1;
    return { dmg: p.dmg * weaponAvg(L, rarity) / weaponAvg(l, i.rarity), sec: p.sec * itemBudget(L, rarity) / itemBudget(l, i.rarity) }; };
  const want = (i: any) => { const p = powerOf(i); return metric === "dmg" ? p.dmg > 0 : metric === "sec" ? p.sec > 0 : p.dmg + p.sec > 0; };
  for (const any of [false, true]) for (let w = 0; w <= 5; w++) {
    const ps = pool.filter((i) => (any || i.rarity === rarity) && Math.abs((i.lvl || 1) - L) <= w && want(i));
    if (ps.length >= 3 || (any && w === 5 && ps.length)) { const n = ps.map(norm); return { dmg: median(n.map((x) => x.dmg)), sec: median(n.map((x) => x.sec)), n: ps.length, win: w, any }; }
  }
  return { dmg: 0, sec: 0, n: 0, win: -1, any: true };
}

/** статы копии: профиль базы → кривая соседей на уровне копии; потолок линии — max(потолок кода, у базы, у соседей) */
export function copyStats(copy: any, base: any): Record<string, number> {
  const L = copy.lvl || 1, bs = base.stats || {}, bp = powerOf(base), out: Record<string, number> = {};
  for (const k of COPY_STATS) out[k] = 0;
  const cv = peerCurve(copy.slot, copy.rarity, L, copy.slot === "weapon" ? "dmg" : "sec");
  const cs = copy.slot === "weapon" ? peerCurve(copy.slot, copy.rarity, L, "sec") : cv;
  const fall = (a: number, b: number) => (b > 0 ? a / b : 0);
  // множитель линий: к кривой; нет соседей — по форме бюджета кода (уровень базы → уровень копии)
  const kd = copy.slot === "weapon" ? (cv.dmg > 0 ? fall(cv.dmg, bp.dmg) : weaponAvg(L, copy.rarity) / weaponAvg(base.lvl || 1, base.rarity)) : 0;
  const ks = cs.sec > 0 ? fall(cs.sec, bp.sec) : itemBudget(L, copy.rarity) / itemBudget(base.lvl || 1, base.rarity);
  const pool = Object.values<any>(ITEM_BY_ID).filter((i) => !i.part && i.slot === copy.slot && Math.abs((i.lvl || 1) - L) <= 2);
  const cap = (k: string) => Math.max(ITEM_LINE_CAP[k] ?? Infinity, Number(bs[k]) || 0, ...pool.map((i) => Number(i.stats?.[k]) || 0));
  if (copy.slot === "weapon" && (bs.dmgMin || bs.dmgMax)) { out.dmgMin = Math.max(1, Math.round((Number(bs.dmgMin) || 0) * kd)); out.dmgMax = Math.max(out.dmgMin + 1, Math.round((Number(bs.dmgMax) || 0) * kd)); }
  // прочие линии: доли базы; упёршиеся в потолок отдают остаток силы непотолочным (2 прохода)
  const keys = COPY_STATS.filter((k) => !DMG.has(k) && (Number(bs[k]) || 0) > 0);
  let target = bp.sec * ks, free = new Set(keys);
  for (let pass = 0; pass < 3 && free.size; pass++) {
    const fixed = keys.filter((k) => !free.has(k)).reduce((a, k) => a + out[k] * (STAT_COST[k] || 1), 0);
    const fp = [...free].reduce((a, k) => a + (Number(bs[k]) || 0) * (STAT_COST[k] || 1), 0); if (!fp) break;
    const m = Math.max(0, target - fixed) / fp; let hit = false;
    for (const k of [...free]) { const v = (Number(bs[k]) || 0) * m, c = cap(k); if (v > c) { out[k] = c; free.delete(k); hit = true; } else out[k] = v; }
    if (!hit) break;
  }
  for (const k of keys) out[k] = Math.min(cap(k), statRound(k, out[k]));
  // все линии базы упёрлись в потолки (правило игры) — недостающую силу отдаём плоским статам, чтобы копия не была слабее
  // соседей: оружию — в урон (те же доли min/max, не выше +15% к урону соседей), прочему — поровну в броню и здоровье
  const got = keys.reduce((a, k) => a + out[k] * (STAT_COST[k] || 1), 0), left = target - got;
  if (keys.length && left > 0.05 * target) {
    if (copy.slot === "weapon" && out.dmgMax > 0) { const hm = weaponHitMult(copy.wtype), avg = (out.dmgMin + out.dmgMax) / 2;
      const room = cv.dmg > 0 ? Math.max(0, 1.15 * cv.dmg - avg / hm) : left; // урон не выше +15% к соседям
      const f = (avg + Math.min(left, room) * hm) / avg;
      out.dmgMin = Math.max(1, Math.round(out.dmgMin * f)); out.dmgMax = Math.max(out.dmgMin + 1, Math.round(out.dmgMax * f)); }
    else if (copy.slot !== "weapon") { out.armor = statRound("armor", out.armor + left / 2 / (STAT_COST.armor || 1)); out.hp = statRound("hp", out.hp + left / 2 / (STAT_COST.hp || 1)); }
  }
  return out;
}

/** правка копии, унаследованная от ДЕЙСТВУЮЩИХ значений базы (формат строки game_overrides, как у правки админки) */
export function copyPatch(copyId: string): any | null {
  const c: any = (ITEM_BY_ID as any)[copyId], b: any = c?.part ? (ITEM_BY_ID as any)[c.part] : null; if (!c || !b) return null;
  const lvl = c.lvl || 1, req = Math.max(1, Math.min(60, lvl + ((b.req || b.lvl || 1) - (b.lvl || 1))));
  const st = copyStats(c, b), p: any = { lvl, req };
  for (const k of COPY_STATS) p["stats." + k] = st[k];
  if (c.slot === "weapon" || b.rs) p.rs = b.rs || "";
  if (b.salvage != null) p.salvage = JSON.parse(JSON.stringify(b.salvage));
  const tr = TRAITS.item[b.id]; if (tr?.length) p.traits = JSON.parse(JSON.stringify(tr));
  return p;
}
