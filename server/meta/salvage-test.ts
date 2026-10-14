// Разбор: одиночный = логика по умолчанию/админки; массовый = ровно сумма одиночных; превью = результат; навык R из админки важнее выпавшего
import { newAccount, newHero, salvage, salvagePreview, salvageMany, effSkill, weaponSkill } from "./profile";
import { ITEMS, ITEM_BY_ID, salvageDefault, weaponType } from "./defs";
import { validatePatch, applyOverride, currentValues } from "./overrides";
let fail = 0; const ok = (c: boolean, m: string) => { if (!c) fail++; console.log((c ? "PASS " : "FAIL ") + m); };
const byR = (r: string) => ITEMS.filter((i: any) => i.rarity === r && i.slot !== "weapon");
const mk = () => { const a: any = newAccount(); a.res = a.res || {}; return a; };
const rare = byR("rare"), h = newHero("warrior");
{ const a = mk(); a.inv = rare.slice(0, 3).map((it: any, k: number) => ({ uid: "u" + k, id: it.id, at: 0 }));
  const r: any = salvage(a, [h], "u0"); ok(r.ok && (a.res.soul_shard || 0) === 2 && a.inv.length === 2, "одиночный: редкий = 2 осколка (как было)"); }
{ const a = mk(); a.inv = rare.slice(0, 4).map((it: any, k: number) => ({ uid: "u" + k, id: it.id, at: 0 })); a.inv.push({ uid: "w", id: byR("epic")[0].id, at: 0 });
  h.equip = { [ITEM_BY_ID[a.inv[3].id].slot]: "u3" };
  const p = salvagePreview(a, [h], "warrior", "rare");
  ok(p.uids.length === 3 && p.res.soul_shard === 6, `превью: 3 неодетых редких → 6 осколков (${JSON.stringify(p.res)})`);
  const before = a.res.soul_shard || 0, m: any = salvageMany(a, [h], "warrior", "rare", [...p.uids, "w", "u3"]);
  ok(m.ok && m.n === 3 && (a.res.soul_shard - before) === 6 && a.inv.some((i: any) => i.uid === "w") && a.inv.some((i: any) => i.uid === "u3"), "массовый = превью; эпик и надетый не тронуты");
  h.equip = {}; }
{ const id = rare[0].id; ok(JSON.stringify(currentValues("item", id)!.salvage) === JSON.stringify(salvageDefault(id)), "админка: поле «Разбор даёт» по умолчанию = текущая логика");
  const v = validatePatch("item", id, { salvage: { soul_shard: 5 } }); ok(typeof v !== "string", "админка: валидный патч разбора " + JSON.stringify(v));
  ok(typeof validatePatch("item", id, { salvage: { nope: 1 } }) === "string", "админка: неизвестный ресурс отклонён");
  applyOverride("item", id, v); const a = mk(); a.inv = [{ uid: "x", id, at: 0 }]; salvage(a, [h], "x"); ok(a.res.soul_shard === 5, "правка админки применяется к разбору");
  applyOverride("item", id, null); ok(!(ITEM_BY_ID as any)[id].salvage, "сброс правки → по умолчанию"); }
{ const w: any = ITEMS.find((i: any) => i.slot === "weapon"), a = mk(); a.inv = [{ uid: "wp", id: w.id, at: 0, rs: "spear" }]; const hh = newHero("warrior"); hh.equip = { weapon: "wp" };
  ok(weaponSkill(a, hh) === "spear", "без правки — навык экземпляра");
  const v = validatePatch("item", w.id, { rs: "fire_spark" }); applyOverride("item", w.id, v); ok(weaponSkill(a, hh) === "fire_spark", "навык оружия из админки важнее выпавшего");
  ok(typeof validatePatch("item", rare[0].id, { rs: "spear" }) === "string", "навык R не у оружия — отклонён"); applyOverride("item", w.id, null);
  const wt = weaponType(w.id, null), vt = validatePatch("weapon", wt, { rs: "moon_orb" }); applyOverride("weapon", wt, vt);
  ok(weaponSkill(a, hh) === "moon_orb", `навык для типа оружия (${wt}) из админки важнее выпавшего`); applyOverride("weapon", wt, null);
  ok(weaponSkill(a, hh) === "spear", "сброс — снова навык экземпляра");
  { const inst: any = a.inv.find((i: any) => i.uid === hh.equip.weapon), wt2 = weaponType(inst.id, null);
    ok(effSkill(inst)?.src === "drop", "карточка: источник — выпавший");
    applyOverride("weapon", wt2, validatePatch("weapon", wt2, { rs: "moon_orb" })); ok(effSkill(inst)?.src === "type" && effSkill(inst)?.rs === "moon_orb", "карточка: источник — тип оружия");
    applyOverride("item", inst.id, validatePatch("item", inst.id, { rs: "sun_beam" })); ok(effSkill(inst)?.src === "item" && effSkill(inst)?.rs === "sun_beam", "карточка: предмет важнее типа");
    applyOverride("item", inst.id, null); applyOverride("weapon", wt2, null);
    ok(effSkill({ id: rare[0].id } as any) === null, "не оружие — без навыка"); } }
if (fail) { console.log(fail + " FAIL"); process.exit(1); } console.log("salvage ok");
