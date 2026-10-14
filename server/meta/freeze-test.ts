import { freezeMob } from "./service";
import { castShape } from "./abilityShapes";
import { ZONE_MOBS } from "./defs";
let f = 0; const ok = (c: any, m: string) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) f++; };
const boss = Object.keys(ZONE_MOBS).find((k) => (ZONE_MOBS as any)[k].boss)!, norm = Object.keys(ZONE_MOBS).find((k) => !(ZONE_MOBS as any)[k].boss)!;
const now = 1e6;
const m: any = { type: norm }; ok(freezeMob(m, 3000, now) === 3000 && m.frozenUntil === now + 3000, "обычный моб — 3 с");
ok(freezeMob(m, 3000, now + 3500) === 0, "сразу после — 1.5 с устойчивости (без вечной заморозки)");
ok(freezeMob(m, 3000, now + 4600) === 3000, "после устойчивости — снова");
ok(freezeMob({ type: norm, elite: true }, 3000, now) === 1500, "элита — 1.5 с");
ok(freezeMob({ type: norm, special: "rare" }, 3000, now) === 1500, "редкий — 1.5 с");
ok(freezeMob({ type: boss }, 3000, now) === 600, `босс (${boss}) — 0.6 с`);
const sig = (props: string[]) => { const fr: number[] = []; castShape("frost_nova", { zone: { mobsAround: () => [{ id: 1 }, { id: 2 }] }, sid: "s", x: 0, y: 0, dx: 1, dy: 0, now: 0, dmg: 50, radiusMult: 1, props,
  hit: () => 1, status: (_m: any, st: any) => { if (st.freeze) fr.push(st.freeze); }, move: () => {}, bounds: (x: number, y: number) => [x, y], buff: () => {}, later: (_: number, fn: any) => fn(), ev: () => {} } as any); return fr; };
ok(sig(["t_deep"]).length === 2 && sig(["t_deep"]).every((x) => x === 3000), "Морозная звезда + «Глубокая стужа» — заморозка 3 с всем вокруг");
ok(sig([]).length === 0, "без таланта — только замедление");
console.log(f ? `FAILED ${f}` : "freeze ok"); if (f) process.exit(1);
