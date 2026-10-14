// Статусы: стаки одного вида складываются (до DOT_STACK_MAX), разные виды — одновременно; у типов оружия статусов нет
import { Zone, DOT_STACK_MAX } from "./zone";
import { WEAPON_TYPES } from "./defs";
let fail = 0; const ok = (c: boolean, m: string) => { if (!c) fail++; console.log((c ? "PASS " : "FAIL ") + m); };
ok(Object.values(WEAPON_TYPES).every((w: any) => !w.status?.kind && !w.status?.dpsPct && !w.status?.slow), "у типов оружия нет статусов по умолчанию (только отбрасывание)");
const z: any = Object.create(Zone.prototype);
const mob: any = { type: "night_bat", x: 0, y: 0, dots: [], slowUntil: 0 };
for (let i = 0; i < 7; i++) z.applyStatus(mob, "a" + (i % 2), { kind: "bleed", dps: 10, dur: 3 }, 0, 0);
z.applyStatus(mob, "a", { kind: "burn", dps: 5, dur: 3 }, 0, 0);
ok(mob.dots.filter((x: any) => x.kind === "bleed").length === DOT_STACK_MAX, `кровотечение: ${DOT_STACK_MAX} стаков (лимит)`);
ok(mob.dots.some((x: any) => x.kind === "burn"), "поджог действует одновременно с кровотечением");
const dps = mob.dots.reduce((t: number, x: any) => t + x.dps, 0); ok(dps === 55, `урон/с суммируется по стакам: ${dps}`);
if (fail) { console.log(fail + " FAIL"); process.exit(1); } console.log("status-stack ok");
