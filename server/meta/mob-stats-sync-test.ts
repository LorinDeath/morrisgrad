// ОЗ мобов из админки = ОЗ живых мобов: правка ОЗ (applyOverride: админка или перечитанный набор правок из D1) сразу
// пересчитывает живых (syncMobStats) — только база, множители экземпляра (элита/вожак/проклятие/ярус/игроки у босса) сохраняются;
// урон и броня — из бестиария на каждом ударе; мёртвые получают новые ОЗ при респавне. Случай с прода: «Пыхтящий гриб» ✦ Странный.
// bun server/meta/mob-stats-sync-test.ts
import { Zone, mobEffStats, enchMul } from "./zone";
import { ZONE_MOBS } from "./defs";
import { ZONE_GEN } from "./zoneGen";
import { CURSE } from "./cursed";
import { validatePatch, applyOverride } from "./overrides";
let f = 0; const ok = (c: any, m: string) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) f++; };
ZONE_GEN.cursedPct = 0;
// прод: ярус «Странный» ×4/×4/×4 (вкладка «✦ Зачарование»)
applyOverride("ench", "main", validatePatch("ench", "main", { "tiers.2.mobHp": 4, "tiers.2.mobDmg": 4, "tiers.2.mobArmor": 4 }) as any);
const T = "puff_mushroom", d: any = ZONE_MOBS[T];
const save = (hp: number, dmg: number, armor: number) => applyOverride("mob", T, validatePatch("mob", T, { hp, dmg, armor }) as any);
save(294, 11.6, 14); // до ребаланса
const z: any = new Zone("arinar", [], [], { proc: false });
const plain = z.addMob(T, 1000, 1000), elite = z.addMob(T, 1100, 1000, { elite: true });
const strange = z.addMob(T, 1200, 1000); strange.ench = 3; strange.maxHp = strange.hp = z.hpOf(strange);
const hurt = z.addMob(T, 1300, 1000); hurt.hp = Math.round(hurt.maxHp / 2);
const dead = z.addMob(T, 1400, 1000, { fixed: true, respawn: 1 }); dead.dead = true; dead.respawnAt = 0;
ok(strange.maxHp === 1176, `до: «Странный» ${strange.maxHp} ОЗ (294×4 — как на скриншоте 1176)`);
// ребаланс: новые ОЗ/урон/броня (как в D1 v115)
save(1982, 13.7, 1);
const e0 = mobEffStats(strange);
ok(e0.dmg === 54.8 && e0.armor === 4, `урон/броня — сразу из бестиария: ${e0.dmg}/${e0.armor} (13.7×4 / 1×4)`);
ok(strange.maxHp === 1176, "без синхронизации ОЗ живого моба остаются старыми (ошибка с прода)");
const n = z.syncMobStats();
ok(n >= 4, `синхронизировано живых: ${n} (4 тестовых + стоящие в мире)`);
ok(plain.maxHp === 1982 && plain.hp === 1982, `обычный: ${plain.maxHp} = ОЗ админки 1982`);
ok(elite.maxHp === Math.round(1982 * ZONE_GEN.eliteHp), `элита: ${elite.maxHp} = 1982×${ZONE_GEN.eliteHp}`);
ok(strange.maxHp === 1982 * enchMul(strange, "hp") && strange.maxHp === z.hpOf(strange), `«Странный»: ${strange.maxHp} = 1982×4 = hpOf`);
ok(hurt.maxHp === 1982 && hurt.hp === 991, `раненый: доля ОЗ сохранена (${hurt.hp}/${hurt.maxHp})`);
ok(z.syncMobStats() === 0, "повторная синхронизация ничего не меняет");
// мёртвый — при респавне из hpOf с новыми ОЗ
{ const pl = new Map([["p", { sid: "p", x: 1400, y: 1060, hp: 1e9, maxHp: 1e9, armorRed: 0, alive: true, respawnAt: 0 } as any]]); z.update(0.05, Date.now(), pl, () => {}, () => {}); }
ok(!dead.dead && dead.maxHp === 1982 && dead.hpBase === 1982, `респавн: ${dead.maxHp} ОЗ`);
// мировой босс с масштабом по игрокам: база меняется, множитель отряда сохраняется
const B = Object.keys(ZONE_MOBS).find((k) => (ZONE_MOBS as any)[k].boss)!, bd: any = ZONE_MOBS[B], bh0 = bd.hp;
const boss = z.addMob(B, 2000, 2000, { hpMul: 1 + ZONE_GEN.bossScalePerPlayer * 2, special: "boss" });
const k0 = boss.maxHp / bh0;
applyOverride("mob", B, validatePatch("mob", B, { hp: bh0 * 2 }) as any); z.syncMobStats();
ok(Math.abs(boss.maxHp / (bh0 * 2) - k0) < 1e-6, `${B}: множитель отряда ×${k0.toFixed(2)} сохранён (${boss.maxHp})`);
applyOverride("mob", B, null); applyOverride("mob", T, null); applyOverride("ench", "main", null); z.syncMobStats();
ok(plain.maxHp === d.hp, `сброс правки → ОЗ кода ${d.hp}`);
console.log(f ? `FAILED ${f}` : "ALL PASS"); if (f) process.exit(1);
