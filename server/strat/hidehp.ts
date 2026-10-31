// «Скрытое здоровье» (лобби, t1137b): сервер не отдаёт точные ОЗ чужих фигур и построек — только грубое состояние.
// Свои (и союзники в 2×2: team) видят всё. Зритель видит грубо обе стороны. Числа урона по чужим тоже скрыты.
export type HpState = "ok" | "hurt" | "low" | "dead";
export const HIDE_HP = { ok: 0.66, low: 0.33 }; // >66% — «цел», 33–66% — «ранен», <33% — «при смерти»
export const HP_LABEL: Record<HpState, string> = { ok: "цел", hurt: "ранен", low: "при смерти", dead: "уничтожен" };
export function hpState(hp: number, max: number): HpState {
  if (hp <= 0) return "dead"; const f = hp / Math.max(1, max);
  return f > HIDE_HP.ok ? "ok" : f >= HIDE_HP.low ? "hurt" : "low";
}
const HP_KEYS = ["hp", "dmg", "n", "max", "mag"];
/** Редакция вида партии для зрителя viewer (0/1, иначе — зритель). gv — результат view(); ev — события; bhp — список ОЗ построек.
 *  Возвращает новые объекты, исходные не трогает. sameTeam(a, b) — союзники (1×1: a === b). */
export let TOWER_MAX = 16; // HP Сторожевой башни (match.ts выставляет из конфига)
export const setTowerMax = (n: number) => { if (Number.isFinite(n) && n > 0) TOWER_MAX = n; };
export function redactHp(gv: any, ev: any[], bhp_: any[] | undefined, viewer: number, sameTeam: (a: number, b: number) => boolean = (a, b) => a === b) {
  const mine = (o: number | undefined) => o !== undefined && viewer >= 0 && viewer < 8 && sameTeam(o, viewer);
  const owner = new Map<number, number>(); const maxOf = new Map<number, number>();
  for (const p of gv?.pieces || []) { owner.set(p.id, p.o); maxOf.set(p.id, p.mh); }
  for (const e of ev || []) if (e && e.e === "kill" && typeof e.o === "number" && typeof e.id === "number" && !owner.has(e.id)) owner.set(e.id, e.o);
  const cityOwner = new Map<number, number>(); for (const c of gv?.ec?.cities || []) cityOwner.set(c.id, c.owner);
  const g2 = gv && { ...gv, pieces: (gv.pieces || []).map((p: any) => mine(p.o) ? p : (() => { const { hp, ...r } = p; return { ...r, hs: hpState(hp, p.mh) }; })()) };
  if (g2?.ec) g2.ec = { ...g2.ec, cities: g2.ec.cities.map((c: any) => { if (mine(c.owner) || !c.bhp) return c; const { bhp, ...r } = c; const L = bhp_?.find((x: any) => x.city === c.id);
    return { ...r, bhs: Object.fromEntries(Object.entries(bhp).map(([b, h]) => [b, hpState(h as number, L?.b.find((x: any) => x.b === b)?.max ?? (h as number) + 1)])) }; }) };
  if (g2?.ec?.tbhp) { const tw = new Map<number, number>((g2.ec.towers || []).map((t: any) => [t.id, t.owner])); const tb: any = {}, ts: any = {};
    for (const k in g2.ec.tbhp) { if (mine(tw.get(+k))) tb[k] = g2.ec.tbhp[k]; else ts[k] = hpState(g2.ec.tbhp[k], TOWER_MAX); } g2.ec = { ...g2.ec, tbhp: tb, tbhs: ts }; } // t1140: башни
  for (const t of gv?.ec?.towers || []) cityOwner.set(t.id, t.owner);
  if (g2) delete g2.lastEv;
  const ev2 = (ev || []).map((e: any) => {
    if (!e || !HP_KEYS.some((k) => k in e)) return e;
    let o: number | undefined, mx: number | undefined;
    if (e.e === "bhit") o = cityOwner.get(e.city) ?? e.owner;
    else { const s = e.t ?? e.id; o = owner.get(s); mx = maxOf.get(s); }
    if (mine(o)) return e;
    const r: any = { ...e }; for (const k of HP_KEYS) delete r[k];
    if (typeof e.hp === "number") r.hs = hpState(e.hp, e.max ?? mx ?? Math.max(e.hp, 1));
    return r;
  });
  const bhp2 = bhp_?.map((c) => mine(cityOwner.get(c.city)) ? c : { city: c.city, ruin: c.ruin, b: c.b.map((x: any) => ({ b: x.b, hs: hpState(x.hp, x.max) })) });
  return { g: g2, ev: ev2, bhp: bhp2 };
}
