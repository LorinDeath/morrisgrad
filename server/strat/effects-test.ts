// t1111u: каждый эффект в конфиге имеет структуру и русское описание с живыми числами
import { STRAT_CFG } from "./rules";
import { techView } from "./econ";
import { effectCatalog, describeEffect, describeSource, EFFECT_KEYS, fxToEffects } from "./effects";
let ok = 0, bad = 0;
const t = (c: boolean, m: string) => { if (c) ok++; else { bad++; console.log("FAIL", m); } };
const cfg: any = STRAT_CFG;
const races = Object.keys(cfg.race);
for (const race of [undefined, ...races]) {
  const cat = effectCatalog(cfg, race, (x, r) => techView(cfg, x, r));
  for (const s of cat) {
    const where = `${race || "-"} ${s.src}:${s.owner ? s.owner + "/" : ""}${s.id}`;
    const tip = describeSource(s);
    if (!(s.effects.length > 0 && tip.length > 0) || /undefined|NaN|\[object/.test(tip)) t(false, `${where} → «${tip}»`);
    for (const e of s.effects) {
      const d = describeEffect(e);
      ok++; if (!EFFECT_KEYS[e.key] || !d || /undefined|NaN/.test(d)) t(false, `${where} ${e.key} → «${d}»`);
      if (!e.trigger || !e.target || typeof e.mag !== "number" || !e.stack) t(false, `${where} ${e.key} schema`);
    }
  }
  t(true, "catalog " + race);
}
const cat = effectCatalog(cfg);
for (const src of ["race", "chief", "talent", "tech", "building", "struct", "terrain", "unit"]) t(cat.some((s) => s.src === src), "src " + src);
t(cat.filter((s) => s.src === "tech").length === cfg.techs.length, "all techs");
t(cat.filter((s) => s.src === "building").length === Object.keys(cfg.build).length, "all buildings");
// живые числа: правка конфига меняет текст
const tip = (c: any, src: string, id: string, r?: string) => describeSource(effectCatalog(c, r, (x, rr) => techView(c, x, rr)).find((s) => s.src === src && s.id === id)!);
const c2 = { ...cfg, race: { ...cfg.race, fire: { ...cfg.race.fire, burnDmg: 3 } } };
t(tip(cfg, "race", "fire").includes("1 урона") && tip(c2, "race", "fire").includes("3 урона"), "live burn " + tip(c2, "race", "fire"));
t(tip(cfg, "building", "wall", "ice").includes("на клетке города") && tip(cfg, "building", "wall", "stone").includes("радиусе 2"), "race wall " + tip(cfg, "building", "wall", "stone"));
t(/лечит своих в радиусе 2 на 4 HP.*перезарядка 4 хода/.test(describeSource(cat.find((s) => s.src === "chief" && s.id === "rally" && s.owner === "fire_lord")!)), "rally tip");
t(fxToEffects({ atkK: { rook: 2 } })[0].kind === "rook" && describeEffect(fxToEffects({ atkK: { rook: 2 } })[0]) === "+2 АТК Стражам", "atkK");
t(describeEffect(fxToEffects({ zzz: 1 })[0]) === "", "unknown key → empty (test catches)");
console.log("samples:"); for (const id of ["fire", "lightning", "nature"]) console.log(" ", id, "—", tip(cfg, "race", id));
for (const [s, id, r] of [["tech", "ambush", "lightning"], ["building", "granary", "water"], ["struct", "X"], ["terrain", "f"], ["unit", "mage"], ["chief", "zeal"]] as any) console.log(" ", s, id, r || "", "—", tip(cfg, s, id, r));

// t1163: подсказки рас по лиге (числа, которые реально идут в партии этой лиги)
{
  const d = (r: string, n?: number) => describeSource(effectCatalog(cfg, r, undefined, n).find((s) => s.src === "race" && s.id === r)!);
  const w8 = d("water", 8), w15 = d("water", 15), f8 = d("fire", 8), f15 = d("fire", 15), l15 = d("lightning", 15), l8 = d("lightning", 8);
  const hasHeal = (t: string) => /HP своим фигурам на своей земле/.test(t), hasHp = (t: string) => /% HP всем/.test(t);
  t(!hasHeal(w8) && hasHeal(w15), "t1163 water heal по лиге");
  t(!hasHp(f8) && hasHp(f15), "t1163 fire HP по лиге");
  t(!hasHp(l15) && hasHp(l8), "t1163 lightning HP по лиге");
  t(hasHeal(d("water")), "t1163 без размера — общие числа");
}

console.log(`effects-test: ${ok} ok, ${bad} fail`); if (bad) process.exit(1);
