// Все атаки мобов по игроку попадают: обычные (ближние/рывок/рой/танк/стрелки/кастеры), боссы и чёрные (дуга/снаряд × 6 стихий).
// Игрок стоит неподвижно на дистанции атаки; за ≤ 25 с моделирования каждый моб должен нанести урон хотя бы раз.
// Запуск: cd server && bun meta/mob-hits-player-test.ts
import { ITEM_BY_ID, ZONE_MOBS } from "./defs";
import { registerBlackMobs } from "./blackMobs";
import { Zone, type ZPlayer } from "./zone";
registerBlackMobs(ITEM_BY_ID as any);
let pass = 0, fail = 0; const ok = (c: any, m: string) => { if (c) pass++; else fail++; if (!c || process.env.V) console.log((c ? "PASS " : "FAIL ") + m); };
const base = new Zone("arinar", [], [], { proc: true }); const camp = base.camps.find((c) => !base.safeAt(c.x, c.y, 2000))!;
const P = (x: number, y: number): ZPlayer => ({ sid: "t", x, y, hp: 1e12, maxHp: 1e12, armorRed: 0, alive: true, respawnAt: 0, lvl: 30 } as any);
const groups: Record<string, [number, number]> = {}; const srcs = new Set<string>(); let worst = 0;
let now = 50_000_000;
for (const type of Object.keys(ZONE_MOBS)) {
  const d: any = (ZONE_MOBS as any)[type];
  const z = new Zone("arinar", [], [], { proc: true }); for (const m of z.mobs) { m.dead = true; m.respawnAt = 9e15; }
  const cx = camp.x + 900, cy = camp.y + 900;
  const m = z.addMob(type, cx, cy, { fixed: true });
  const ranged = d.bmAtk ? d.bmAtk.kind === "proj" : d.role === "ranged" || d.role === "caster";
  const pl = P(cx + Math.min(ranged ? 170 : 70, d.aggro * 0.6), cy); const pm = new Map([["t", pl]]);
  let hits = 0, firstAt = 0, dmg = 0; const t0 = now;
  for (let i = 0; i < 500 && hits < 2; i++) { now += 50; z.events.length = 0;
    z.update(0.05, now, pm, (_s, dd, src) => { if (dd > 0) { hits++; dmg += dd; srcs.add(src); if (!firstAt) firstAt = now - t0; } }, () => {});
    pl.hp = pl.maxHp; }
  const key = (d.black ? "чёрный " + (d.bmAtk?.kind === "proj" ? "дальний" : "ближний") + " " + d.elem : (d.boss ? "босс " : "") + d.role);
  const g = (groups[key] ||= [0, 0]); g[1]++; if (hits) g[0]++;
  worst = Math.max(worst, firstAt);
  ok(hits > 0, `${type} (${key}${d.boss ? ", босс" : ""}): по игроку попадает (${hits} уд., первый через ${(firstAt / 1000).toFixed(1)} с, урон ${Math.round(dmg)})`);
}
for (const [k, [a, n]] of Object.entries(groups).sort()) console.log(`  ${a === n ? "✓" : "✗"} ${k}: ${a}/${n}`);
console.log("  источники урона (src):", [...srcs].sort().join(", "), "· худший первый удар", (worst / 1000).toFixed(1), "с");
ok(worst < 5000, `первый удар любого моба по стоящему в досягаемости игроку — быстрее 5 с (${(worst / 1000).toFixed(1)} с)`);
// все 6 стихий × ближний/дальний у чёрных мобов есть и попадают
for (const el of ["fire", "ice", "water", "stone", "nature", "lightning"]) for (const kind of ["ближний", "дальний"]) { const g = groups[`чёрный ${kind} ${el}`]; ok(g && g[0] === g[1] && g[1] > 0, `чёрные ${kind} ${el}: все попадают (${g ? g.join("/") : "нет мобов"})`); }
console.log(`\nmob-hits-player ${pass} PASS / ${fail} FAIL`); if (fail) process.exit(1);
