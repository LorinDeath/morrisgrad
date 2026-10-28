// Варианты в Бестиарии: у каждого вида — особые особи (проклятый, ярусы зачарования 1–6, где 6 — «Чёрный» глитч) и варианты краёв
// (VARIANT_BY_ID — свои карточки вида, напр. «Гончая синего пламени»). Статус игрока по каждому: не встречен / встречен, не побеждён /
// побеждён + число побед; после встречи — ОЗ и уровень. Хранится в accounts.data (a.bvar), новой таблицы нет.
// «Встречен» — только сервер: особь оказалась в поле зрения (≈ экран) или в радиусе агрессии (service.ts, цикл интереса);
// «побеждён» — только по проверенному пути засчитывания убийств (service.ts onZoneKill → получатели recv, как Бестиарий/задания).
import { ZONE_MOBS } from "./defs";
import { ENCH, ENCH_N, tierOk } from "./enchant";
import { VARIANTS, VARIANT_BY_ID, BIOMES, baseOf } from "./biomes";
import { CURSE } from "./cursed";

/** ключи особых особей: c — проклятый, e1…e6 — ярусы зачарования (e6 — Чёрный) */
export const VAR_KEYS = ["c", ...Array.from({ length: ENCH_N }, (_, i) => "e" + (i + 1))];
/** [встречен (мс), побед, ОЗ при встрече (макс.)] */
export type VarRec = [number, number, number];
type Acc = { bvar?: Record<string, Record<string, VarRec>> };
const MAX_TYPES = 400;

/** какие ключи у особи: проклятый и/или ярус зачарования (оба — если проклятый ещё и зачарован) */
export function varKeys(m: { cursed?: boolean; ench?: number }): string[] {
  const k: string[] = []; if (m.cursed) k.push("c"); if (tierOk(m.ench)) k.push("e" + m.ench); return k;
}
function rec(a: Acc, type: string, k: string, mk: boolean): VarRec | null {
  if (!(ZONE_MOBS as any)[type] || !VAR_KEYS.includes(k)) return null;
  const B = a.bvar || (mk ? (a.bvar = {}) : null); if (!B) return null;
  let t = B[type]; if (!t) { if (!mk || Object.keys(B).length >= MAX_TYPES) return null; t = B[type] = {}; }
  return t[k] || (mk ? (t[k] = [Date.now(), 0, 0]) : null);
}
/** встреча особой особи; true — запись изменилась (сохранить, обновить клиент) */
export function noteVarSeen(a: Acc, type: string, m: { cursed?: boolean; ench?: number; maxHp?: number }): boolean {
  let ch = false;
  for (const k of varKeys(m)) { const had = !!a.bvar?.[type]?.[k], r = rec(a, type, k, true); if (!r) continue;
    const hp = Math.round(m.maxHp || 0); if (!had) ch = true; if (hp > r[2]) { r[2] = hp; ch = true; } }
  return ch;
}
/** победа над особой особью (вызывается там же, где noteMob(…, 1) для получателя убийства) */
export function noteVarKill(a: Acc, type: string, m: { cursed?: boolean; ench?: number; maxHp?: number }) {
  for (const k of varKeys(m)) { const r = rec(a, type, k, true); if (!r) continue; r[1]++; const hp = Math.round(m.maxHp || 0); if (hp > r[2]) r[2] = hp; }
}
/** ОЗ особой особи по правилам сервера (для подсказки, если ОЗ при встрече не записались) */
function hpOf(type: string, k: string): number {
  const d: any = (ZONE_MOBS as any)[type]; if (!d) return 0;
  return Math.round(d.hp * (k === "c" ? CURSE.mobHp : Number(ENCH.tiers[+k.slice(1) - 1]?.mobHp) || 1));
}
const nm = (k: string) => (k === "c" ? "Проклятый" : ENCH.tiers[+k.slice(1) - 1]?.name || k);
const col = (k: string) => (k === "c" ? "#a855f7" : ENCH.tiers[+k.slice(1) - 1]?.color || "#fff");
export interface VarView { k: string; name: string; col: string; st: 0 | 1 | 2; kills?: number; hp?: number; lvl?: number; spr?: string; tint?: [number, number, number]; where?: string }
/** строки карточки Бестиария: особые особи вида + варианты краёв; невстреченным — без ОЗ/уровня (клиент рисует ???/силуэт) */
export function bvarView(a: Acc & { bestiary?: Record<string, { kills?: number }> }, type: string): VarView[] {
  const d: any = (ZONE_MOBS as any)[type]; if (!d) return [];
  const out: VarView[] = [], spr = baseOf(type), T = a.bvar?.[type] || {};
  for (const k of VAR_KEYS) { const r = T[k];
    out.push(r ? { k, name: nm(k), col: col(k), st: r[1] > 0 ? 2 : 1, kills: r[1], hp: r[2] || hpOf(type, k), lvl: d.lvl, spr } : { k, name: nm(k), col: col(k), st: 0, spr }); }
  // варианты краёв этого вида (у базового — его варианты; у варианта — базовый и «соседи»), статус — из их собственных карточек
  const base = baseOf(type);
  const kin = [base, ...VARIANTS.filter((v) => v.base === base).map((v) => v.id)].filter((id) => id !== type);
  for (const id of kin) { const v = VARIANT_BY_ID[id], b = a.bestiary?.[id], z: any = (ZONE_MOBS as any)[id]; if (!z) continue;
    const bio = v ? BIOMES[v.biome] : null, where = bio?.name || "обычный облик";
    out.push(b ? { k: "v:" + id, name: z.name, col: bio?.color || "#cbd5e1", st: (b.kills || 0) > 0 ? 2 : 1, kills: b.kills || 0, hp: z.hp, lvl: z.lvl, spr: base, ...(bio ? { tint: bio.tint } : {}), where }
      : { k: "v:" + id, name: "???", col: bio?.color || "#cbd5e1", st: 0, spr: base, where }); }
  return out;
}
