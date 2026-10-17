// Множители силы моба (mobDmgMul/mobArmorMul): серия атак босса (bossPattern) учитывает проклятие и ярость,
// броня — проклятие; панель «Цель» получает действующие броню и урон (mobEffStats), а не базу бестиария.
// node_modules/.bin/esbuild server/meta/mob-mult-test.ts --bundle --platform=node --format=esm --outfile=/tmp/mm.mjs && node /tmp/mm.mjs
import { Zone, mobDmgMul, mobArmorMul, mobEffStats, type ZPlayer } from "./zone";
import { ZONE_MOBS } from "./defs";
import { CURSE } from "./cursed";
import { validatePatch, applyOverride } from "./overrides";
import { ZONE_GEN } from "./zoneGen";
import { mitigateDamage } from "./balance";
let f = 0; const ok = (c: any, m: string) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) f++; };
const P = (sid: string, x: number, y: number): ZPlayer => ({ sid, x, y, hp: 1e9, maxHp: 1e9, armorRed: 0, alive: true, respawnAt: 0 } as any);
const near = (a: number, b: number, eps = 1e-6) => Math.abs(a - b) <= eps * Math.max(1, Math.abs(b));
const pct0 = ZONE_GEN.cursedPct; ZONE_GEN.cursedPct = 0;
// живые значения прода (вкладка «☠ Проклятие»): ОЗ/урон/броня ×20
applyOverride("curse", "main", validatePatch("curse", "main", { mobHp: 20, mobDmg: 20, mobArmor: 20 }) as any);
const TYPE = ZONE_MOBS.ice_swarm_mother ? "ice_swarm_mother" : Object.keys(ZONE_MOBS).find((k) => ZONE_MOBS[k].boss)!;
const d: any = ZONE_MOBS[TYPE];
const z: any = new Zone("arinar", [], [], { proc: false });
const pm = new Map<string, ZPlayer>([["p", P("p", 3150, 3000)]]);
/** урон всех телеграфов одной серии босса (фаза 1, по кругу набора: circle, line, nova) */
const series = (m: any) => { const out: number[] = []; for (let i = 0; i < 3; i++) { m.casts = []; m.patIdx = i; z.bossPattern(m, d, pm.get("p"), pm, Date.now()); out.push(...m.casts.map((c: any) => c.dmg)); } return out; };
{ // 1) серия атак мирового босса: проклятый ×mobDmg, ярость ×bossEnrageDmg
  const base = z.addMob(TYPE, 3000, 3000, { special: "boss" }), cur = z.addMob(TYPE, 3000, 3000, { special: "boss" });
  cur.cursed = true;
  const b = series(base), c = series(cur);
  ok(b.length > 0 && b.length === c.length, `серия ${TYPE}: ${b.length} телеграфов`);
  ok(c.every((x, i) => near(x / b[i], CURSE.mobDmg)), `проклятый: серия ×${CURSE.mobDmg} (было ×1): ${b.map((x) => x.toFixed(1)).join("/")} → ${c.map((x) => x.toFixed(1)).join("/")}`);
  cur.enraged = true; const e = series(cur), en = (ZONE_GEN as any).bossEnrageDmg || 2.8;
  ok(e.every((x, i) => near(x / b[i], CURSE.mobDmg * en)), `проклятый в ярости: ×${CURSE.mobDmg}×${en}`);
  ok(near(mobDmgMul(cur), CURSE.mobDmg * en) && near(mobDmgMul(cur, false), CURSE.mobDmg), "mobDmgMul: проклятие × ярость");
  const el = z.addMob(TYPE, 3000, 3000, { special: "boss", elite: true }); el.chief = true;
  ok(near(series(el)[0] / b[0], ZONE_GEN.eliteDmg * ZONE_GEN.chiefDmg), "элита × вожак — в серии тоже");
}
{ // 2) обычный удар и навыки — тот же множитель (не изменилось)
  const s = Object.keys(ZONE_MOBS).find((k) => !ZONE_MOBS[k].boss && ZONE_MOBS[k].size === "s")!;
  const m = z.addMob(s, 3000, 3000, {}); ok(near(mobDmgMul(m), 1), "обычный моб ×1");
  m.cursed = true; m.enraged = true; ok(near(mobDmgMul(m), CURSE.mobDmg), "ярость не-босса урон не умножает (как было)");
}
{ // 3) броня: сервер режет урон проклятой броней; панель показывает её же
  const m = z.addMob(TYPE, 3000, 3000, { special: "boss" }); m.cursed = true; m.maxHp = m.hp = 1e12;
  const raw = 5000, real = z.damage(m, "p", raw, () => {});
  const want = mitigateDamage(raw, d.armor * CURSE.mobArmor);
  ok(real === want, `удар ${raw} по проклятой броне ${d.armor}×${CURSE.mobArmor}=${d.armor * CURSE.mobArmor}: прошло ${real} (ожид. ${want})`);
  const st = mobEffStats(m);
  ok(near(st.armor, Math.round(d.armor * CURSE.mobArmor * 10) / 10) && near(st.dmg, Math.round(d.dmg * CURSE.mobDmg * 10) / 10), `панель «Цель»: броня ${d.armor} → ${st.armor}, урон ${d.dmg} → ${st.dmg}`);
  const n = z.addMob(TYPE, 3000, 3000, { special: "boss" }); const sn = mobEffStats(n);
  ok(sn.armor === d.armor && sn.dmg === d.dmg, "не проклятый — база");
  ok(near(mobArmorMul(m, true), 1 + (CURSE.mobArmor - 1) * 0.67), "удар моба по мобу — проклятая броня ослаблена, как было");
}
{ // 4) ОЗ: проклятие при появлении и при возрождении — ×mobHp
  ZONE_GEN.cursedPct = 100; const m = z.addMob(TYPE, 3000, 3000, {}); ZONE_GEN.cursedPct = 0;
  ok(m.cursed && m.maxHp === Math.round(d.hp * CURSE.mobHp) && z.hpOf(m) === m.maxHp, `ОЗ проклятого ${d.hp} × ${CURSE.mobHp} = ${m.maxHp}`);
}
applyOverride("curse", "main", null); ZONE_GEN.cursedPct = pct0;
console.log(f ? `FAILED ${f}` : "mob-mult ok"); if (f) process.exit(1);
