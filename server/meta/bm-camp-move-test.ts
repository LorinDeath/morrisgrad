// B9: перенос лагеря (📍 «Поставить у меня» → сохранить) — старые мобы снимаются и НЕ воскресают, когда игрок приходит на старое место.
// Раньше: снятые получали respawnAt = −1, а неподвижные (fixed) воскрешались по `now >= respawnAt` → два комплекта мобов.
// Запуск: cd server && bun meta/bm-camp-move-test.ts
import { validatePatch, applyOverride } from "./overrides";
import { Zone, type ZPlayer } from "./zone";
import { registerBlackMobs } from "./blackMobs";
import { ITEM_BY_ID } from "./defs";
registerBlackMobs(ITEM_BY_ID as any);
let pass = 0, fail = 0;
const ok = (c: any, m: string) => { if (c) pass++; else fail++; console.log((c ? "PASS " : "FAIL ") + m); };
const z = new Zone("arinar", [], [], { proc: true });
const base = z.camps.find((c) => !z.safeAt(c.x, c.y, 2000))!;
const cx = base.x + 900, cy = base.y + 900, nx = cx + 1500, ny = cy;
const mk = (x: number, y: number) => validatePatch("bmcamp" as any, "bcx_mv", { name: "Перенос", world: "arinar", x, y, r: 120, mobs: [{ mob: "bmx_ash_warden", n: 4 }], respawnMin: 30, respawnMax: 40 });
const cp: any = mk(cx, cy); ok(typeof cp === "object", "лагерь: правка проходит"); applyOverride("bmcamp" as any, "bcx_mv", cp);
const P = (x: number, y: number) => new Map<string, ZPlayer>([["p", { sid: "p", x, y: y + 300, hp: 1e9, maxHp: 1e9, armorRed: 0, alive: true, respawnAt: 0, lvl: 10 }]]);
const near = (x: number, y: number) => z.mobs.filter((m: any) => m.bmc === "bcx_mv" && !m.dead && Math.hypot(m.sx - x, m.sy - y) < 400).length;
const all = () => z.mobs.filter((m: any) => m.bmc === "bcx_mv" && !m.dead).length;
let now = 50_000_000; const run = (pl: Map<string, ZPlayer>, n: number) => { for (let i = 0; i < n; i++) { now += 100; z.update(0.1, now, pl, () => {}, () => {}); } };
z.syncBlackCamps(now, true); run(P(cx, cy), 20);
ok(near(cx, cy) === 4 && all() === 4, `до переноса: 4 на месте (${near(cx, cy)}/${all()})`);
applyOverride("bmcamp" as any, "bcx_mv", mk(nx, ny)); z.syncBlackCamps(now, true); // как admin «save» (service.ts)
run(P(nx, ny), 40); ok(near(nx, ny) === 4, `после переноса: 4 на новом месте (${near(nx, ny)})`);
run(P(cx, cy), 400); // игрок вернулся на старое место — чанк проснулся (раньше тут воскресали)
ok(near(cx, cy) === 0, `на старом месте никого (${near(cx, cy)})`);
ok(all() === 4, `всего живых 4, не 8 (${all()})`);
ok(!z.mobs.some((m: any) => m.bmc === "bcx_mv" && m.respawnAt === -1), "снятые удалены из зоны");
z.syncBlackCamps(now + 5000, true); run(P(nx, ny), 40); ok(all() === 4 && near(nx, ny) === 4, "повторный sync — без дублей");
console.log(`\n${pass} PASS / ${fail} FAIL`); if (fail) process.exit(1);
