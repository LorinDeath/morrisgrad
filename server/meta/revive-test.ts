import { tryRevive } from "./revive";
let f = 0; const ok = (c: any, m: string) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) f++; };
const ms: any = { revive: 1, zp: { hp: -5, maxHp: 200 } };
ok(tryRevive(ms) && ms.zp.hp === 80, "смертельный удар → встаёт с 40% ХП (80/200)");
ms.zp.hp = -1; ok(!tryRevive(ms), "второй раз в том же бою — нет");
ms.reviveUsed = false; ms.zp.hp = 0; ok(tryRevive(ms), "после выхода из боя / новой дуэли — снова готов");
const no: any = { revive: 0, zp: { hp: 0, maxHp: 100 } }; ok(!tryRevive(no) && no.zp.hp === 0, "без таланта — гибель как раньше");
console.log(f ? `FAILED ${f}` : "revive ok"); if (f) process.exit(1);
