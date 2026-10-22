// Админка: спавн/боссы/редкие — проверка схемы и живого применения (без перезапуска)
import { validatePatch, applyOverride, currentValues } from "./overrides";
import { ZONE_GEN, BOSS_TIMERS, WORLD_GEN } from "./zoneGen";
import { Zone, type ZPlayer } from "./zone";
let ok = 0, bad = 0; const t = (n: string, c: any) => { c ? (ok++, console.log("ok  ", n)) : (bad++, console.log("FAIL", n)); };
t("шанс бродячих 150% отклонён", typeof validatePatch("spawn", "arinar", { ambientChance: 150 }) === "string");
t("чужое поле отклонено", typeof validatePatch("spawn", "arinar", { globalCap: 9999 }) === "string");
const p = validatePatch("spawn", "arinar", { ambientChance: 30, campRespawn: 20, campRespawnMin: 0, campRespawnMax: 0, ambientOn: true });
t("правка спавна валидна", typeof p === "object"); applyOverride("spawn", "arinar", p);
t("ZONE_GEN обновился сразу", ZONE_GEN.ambientChance === 30 && ZONE_GEN.campRespawn === 20);
const bt = Object.keys(BOSS_TIMERS)[0];
const bp = validatePatch("boss", bt, { every: 120 }); applyOverride("boss", bt, bp);
t(`таймер босса ${bt} = 120 с`, BOSS_TIMERS[bt].every === 120 && currentValues("boss", bt).every === 120);
const rt = WORLD_GEN.arinar.rares[0].type;
t("редкий: мин > макс отклонено", typeof validatePatch("rare", rt, { "every.0": 5000, "every.1": 100 }) === "string");
applyOverride("rare", rt, validatePatch("rare", rt, { "every.0": 100, "every.1": 200 })); t("редкий: интервал обновился", WORLD_GEN.arinar.rares[0].every[0] === 100 && WORLD_GEN.arinar.rares[0].every[1] === 200);
// живой респавн: убитый лагерный моб и босс используют новые таймеры
const z = new Zone("arinar", [], [], { proc: true, seed: 3 });
const m = z.mobs.find((x) => x.rk === 1)!; const before = Date.now(); z.kill(m, () => {});
t("лагерный моб: респавн 20 с из админки (от/до = 0 — старое поле)", Math.abs(m.respawnAt - before - 20000) < 1500);
// новое: случайно от…до (по умолчанию 180…300 с) и численность ×campPopMul
t("численность 9 — отклонена (0.25…4)", typeof validatePatch("spawn", "arinar", { campPopMul: 9 }) === "string");
applyOverride("spawn", "arinar", validatePatch("spawn", "arinar", { campRespawnMin: 180, campRespawnMax: 300 }) as any);
{ const rs: number[] = []; for (const mm of z.mobs.filter((x) => x.rk).slice(0, 400)) { const b0 = Date.now(); z.kill(mm, () => {}); rs.push((mm.respawnAt - b0) / 1000); mm.dead = false; mm.hp = mm.maxHp; }
  t(`лагерь: респавн случайно 180…300 с (мин ${Math.min(...rs).toFixed(0)}, макс ${Math.max(...rs).toFixed(0)})`, rs.every((v) => v >= 179.5 && v <= 300.5) && Math.max(...rs) - Math.min(...rs) > 60); }
const b = z.gen.bosses.find((x) => x.type === bt)!; const pl: ZPlayer = { sid: "a", x: b.x + 400, y: b.y, hp: 1e12, maxHp: 1e12, armorRed: 0, alive: true, respawnAt: 0 };
const now = Date.now() + 99 * 3600e3; z.bossAt[b.key!] = now - 1; z.specials(now, new Map([["a", pl]]));
const bm = z.byId.get(z.bossIds[b.key!])!; t("босс появился", bm && !bm.dead);
z.kill(bm, () => {}); z.update(0.1, now + 10, new Map([["a", pl]]), () => {}, () => {});
const st = z.bossStatus(now + 10).find((x) => x[0] === b.key)!;
t(`после смерти таймер ≈120 с (${st[2]})`, st[1] === 0 && Math.abs(st[2] - 120) <= 2);
applyOverride("spawn", "arinar", null); applyOverride("boss", bt, null);
t("«Вернуть исходное»", ZONE_GEN.ambientChance === 10 && ZONE_GEN.campRespawn === 45 && (ZONE_GEN as any).campRespawnMin === 180 && (ZONE_GEN as any).campRespawnMax === 300 && (ZONE_GEN as any).campPopMul === 1.5 && BOSS_TIMERS[bt].every !== 120);
console.log(`spawn-admin ${ok}/${ok + bad}`); if (bad) process.exit(1);
