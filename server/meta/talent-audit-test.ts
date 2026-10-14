// Аудит дерева талантов: КАЖДЫЙ узел всех 4 классов изучается по-настоящему (learnTalent с пререквизитами и ярусами)
// и даёт реальный эффект на сервере: статы → heroEffective; активный узел → навык открыт; модификатор/ключевой
// с prop → castShape (мир/дуэль) ведёт себя иначе; cdPct/powerPct → перезарядка/сила навыка. Плюс очки за уровни,
// исключительность и необратимость ключевых, сохранение (JSON + sanitizeTalents).
import { TALENTS, TALENT_BY_ID, TALENT_TIER_REQ, HERO_IDS, talentPointsForLevel } from "./shared";
import { newAccount, newHero, learnTalent, heroEffective, talentPoints, sanitizeTalents, unlockedAbilities, talentMods, type Hero } from "./profile";
import { castShape } from "./abilityShapes";
let pass = 0, fail = 0; const bad: string[] = [];
const ok = (c: any, m: string) => { if (c) pass++; else { fail++; bad.push(m); } console.log((c ? "PASS " : "FAIL ") + m); };
const base = { maxHp: 100, armor: 5, minAtk: 5, maxAtk: 8 };
const effKey: Record<string, string> = { hp: "maxHp", armor: "armor", dmgPct: "dmgPct", critPct: "critPct", speedPct: "speedPct", regen: "regen", atkSpeedPct: "atkSpeedPct", lifestealPct: "lifestealPct", magnetPct: "magnetPct", cdrPct: "cdrPct", revive: "revive" };

/** изучить узел честно: пререквизиты, ярус (добиваем ранги дешёвых стат-узлов), без ключевых соседей */
function reach(a: any, h: Hero, cls: string, id: string, avoid: Set<string>): boolean {
  const t = TALENT_BY_ID[id]; if ((h.talents[id] || 0) > 0) return true;
  for (const r of t.req || []) if (!reach(a, h, cls, r, avoid)) return false;
  let guard = 60;
  const spent = () => Object.values(h.talents).reduce((x, y) => x + y, 0);
  while (spent() < (TALENT_TIER_REQ[t.tier] || 0) && guard-- > 0) {
    const sp = spent();
    const f = TALENTS[cls].filter((n) => !n.excl && n.id !== id && n.tier < t.tier && (h.talents[n.id] || 0) < n.max && !avoid.has(n.id)
      && sp >= (TALENT_TIER_REQ[n.tier] || 0) && (n.req || []).every((q) => (h.talents[q] || 0) > 0)).sort((x, y) => x.tier - y.tier)[0];
    if (!f || !learnTalent(a, h, cls, f.id).ok) return false;
  }
  return learnTalent(a, h, cls, id).ok;
}
const fresh = (cls: string) => { const a = newAccount(); a.flags.talents_open = true; const h = newHero(cls); h.lvl = 30; return { a, h }; };

// подделка мира для castShape: 3 моба рядом, всё отложенное — сразу; считаем все проявления навыка
function shapeSig(id: string, props: string[]) {
  const sig = { hit: 0, fire: 0, dr: 0, inv: 0, dot: 0, slow: 0, later: 0, mark: 0 };
  const mobs = [{ id: 1, x: 20, y: 0 }, { id: 2, x: -20, y: 10 }, { id: 3, x: 0, y: 30 }];
  castShape(id, {
    zone: { mobsAround: (_x: number, _y: number, r: number) => Array.from({ length: Math.max(1, Math.floor(r / 40)) }, (_, i) => mobs[i % 3]), mobs: new Map(mobs.map((m) => [m.id, m])) }, sid: "s", x: 0, y: 0, dx: 1, dy: 0, now: 0, dmg: 100, radiusMult: 1, props,
    hit: (_m, mult) => { sig.hit += mult; return Math.round(100 * mult); }, status: (_m, st) => { if (st?.dot) sig.dot++; if (st?.slow) sig.slow++; },
    move: () => {}, bounds: (x, y) => [x, y], buff: (b) => { sig.dr += b.dr || 0; sig.inv += b.invuln || 0; }, later: (_ms, fn) => { sig.later++; fn(); },
    ev: (e) => { if (e.k === "amark") sig.mark += e.t || 0; }, here: () => [0, 0],
    fire: (o) => { sig.fire++; o.onHit?.(mobs[0], 0); },
  } as any);
  return JSON.stringify(sig);
}

const rows: string[] = [];
for (const cls of HERO_IDS) {
  // очки: 1 за уровень (ур.1 — 0); тратятся по одному
  const { a, h } = fresh(cls);
  ok(talentPoints(h) === talentPointsForLevel(30) && talentPointsForLevel(1) === 0 && talentPointsForLevel(2) === 1, `${cls}: очки = уровень − 1 (${talentPoints(h)} на ур. 30)`);
  for (const t of TALENTS[cls]) {
    const { a, h } = fresh(cls);
    const avoid = new Set(TALENTS[cls].filter((n) => n.excl).map((n) => n.id));
    if (t.excl) avoid.delete(t.id);
    const before = heroEffective(a, h, cls, base) as any, absBefore = unlockedAbilities(h, cls), modsBefore = talentMods(h, cls);
    // все ранги узла, если не ключевой (их 1)
    let learned = reach(a, h, cls, t.id, avoid); while (learned && (h.talents[t.id] || 0) < t.max) learned = learnTalent(a, h, cls, t.id).ok;
    const after = heroEffective(a, h, cls, base) as any;
    // эталон без этого узла: та же прокачка, но узел снят — чтобы сравнить именно его вклад
    const ref = JSON.parse(JSON.stringify(h)); delete ref.talents[t.id];
    const refEff = heroEffective(a, ref, cls, base) as any;
    const fx: string[] = [];
    let works = learned; if (!learned) fx.push("НЕ удалось изучить");
    for (const [k, v] of Object.entries(t.per || {})) {
      const ek = effKey[k], d = (after[ek] || 0) - (refEff[ek] || 0);
      const good = v ? Math.sign(d) === Math.sign(v as number) : true; if (!good) works = false;
      fx.push(`${k} ${d > 0 ? "+" : ""}${Math.round(d * 100) / 100}`);
    }
    if (t.grants) { const has = unlockedAbilities(h, cls).includes(t.grants) && !absBefore.includes(t.grants); if (!has) works = false; fx.push(`навык ${t.grants}${has ? "" : " НЕ открыт"}`); }
    if (t.mod) {
      const m = talentMods(h, cls)[t.mod.ability];
      if (t.mod.prop) { const differs = shapeSig(t.mod.ability, m?.props || []) !== shapeSig(t.mod.ability, (m?.props || []).filter((p) => p !== t.mod!.prop)); if (!differs) works = false; fx.push(`${t.mod.prop}${differs ? " → меняет навык на сервере" : " → НЕТ эффекта на сервере"}`); }
      if (t.mod.cdPct) { const g = after.abilities?.find?.((x: any) => x.id === t.mod!.ability), r0 = refEff.abilities?.find?.((x: any) => x.id === t.mod!.ability);
        const cdOk = !g || !r0 ? (m?.cdPct || 0) === t.mod.cdPct : g.cd < r0.cd; if (!cdOk) works = false; fx.push(`перезарядка ${t.mod.cdPct}%${cdOk ? "" : " НЕ применена"}`); }
      if (t.mod.powerPct) { const ok2 = (m?.powerPct || 0) >= t.mod.powerPct; if (!ok2) works = false; fx.push(`сила +${t.mod.powerPct}%${ok2 ? "" : " НЕ применена"}`); }
    }
    ok(works, `${t.id} [${t.kind}] «${t.name}»: ${fx.join(", ") || "—"}`);
    rows.push(`${works ? "✅" : "❌"} ${t.id} | ${t.kind} | ${t.name} | ${fx.join(", ")}`);
  }
  // ключевые: только один из пары, навсегда (сброса нет; повторное «изучение» второго — отказ), сохраняются
  for (const t of TALENTS[cls].filter((n) => n.kind === "keystone" && n.id < (n.excl || ""))) {
    const { a, h } = fresh(cls); const avoid = new Set<string>();
    ok(reach(a, h, cls, t.id, avoid), `${cls}: ключевой «${t.name}» изучен`);
    const r2 = learnTalent(a, h, cls, t.excl!); ok(!r2.ok && /Ключевой выбор/.test((r2 as any).err || ""), `${cls}: «${TALENT_BY_ID[t.excl!].name}» после «${t.name}» — отказ`);
    const saved = JSON.parse(JSON.stringify(h)) as Hero;
    ok(sanitizeTalents(saved, cls, 99) === 0 && saved.talents[t.id] === 1, `${cls}: «${t.name}» сохраняется (перезагрузка, проверка дерева)`);
    saved.talents[t.excl!] = 1; ok(sanitizeTalents(saved, cls, 99) > 0, `${cls}: подделка «оба ключевых» в сохранении → сброс с возвратом очков`);
  }
  // нет очков — нельзя
  { const { a, h } = fresh(cls); h.lvl = 1; ok(!learnTalent(a, h, cls, TALENTS[cls][0].id).ok, `${cls}: ур. 1 — очков нет, изучить нельзя`); }
}
console.log("\n" + rows.join("\n"));
console.log(`\n${pass} passed, ${fail} failed`); if (fail) { console.log("BROKEN:\n" + bad.join("\n")); process.exit(1); }
