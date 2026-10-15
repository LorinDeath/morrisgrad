// Вампиризм в мире: черта лечит и на добивающем ударе; дробные исцеления копятся в событие lsheal ≥1 ОЗ.
// esbuild lifesteal-test.ts --bundle --platform=node --format=esm --outfile=/tmp/ls.mjs && node /tmp/ls.mjs
import { MetaService } from "./service";
let pass = 0, fail = 0; const ok = (c: any, m: string) => { c ? pass++ : fail++; console.log((c ? "PASS " : "FAIL ") + m); };
const P: any = (MetaService as any).prototype;
const self: any = { lifesteal: P.lifesteal };
const zone: any = { events: [] as any[], applyStatus: () => { throw new Error("status on dead mob"); } };
const session = { id: "a", x: 10, y: 20 };
const ms: any = { zp: { hp: 50, maxHp: 100, alive: true } };
P.traitHit.call(self, zone, { dead: true }, session, ms, 40, [{ k: "lifesteal", chance: 100, pct: 50 }, { k: "burn", chance: 100, dpsPct: 10, dur: 3 }]);
ok(ms.zp.hp === 70, `trait lifesteal heals on killing blow (50→${ms.zp.hp}), no status on dead mob`);
ok(zone.events.some((e: any) => e.k === "lsheal" && e.d === 20 && e.sid === "a"), "lsheal event +20");
zone.events.length = 0;
for (let i = 0; i < 4; i++) self.lifesteal.call(self, zone, session, ms, 0.3);
ok(zone.events.length === 1 && zone.events[0].d === 1, `small heals batched: 4×0.3 → one +1 (${JSON.stringify(zone.events)})`);
ms.zp.hp = 100; zone.events.length = 0; ms.lsAcc = 0; self.lifesteal.call(self, zone, session, ms, 5);
ok(zone.events.length === 0, "full HP → no popup");
console.log(`${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
