import { newAccount, codexBound } from "./profile";
import { ITEMS, weaponType } from "./defs";
import { validatePatch, applyOverride } from "./overrides";
let f = 0; const ok = (c: any, m: string) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) f++; };
const W = (ITEMS as any[]).filter((d) => d.slot === "weapon");
const [w1, w2, w3] = W; const a: any = newAccount();
// w1, w2 — назначены sun_beam в админке; w1 открыт и надет, w2 закрыт; w3 открыт, выпал spear
for (const w of [w1, w2]) applyOverride("item", w.id, validatePatch("item", w.id, { rs: "sun_beam" }) as any);
a.disc.items[w1.id] = { st: 0, v: 1 }; a.disc.items[w3.id] = { st: 0, v: 1 };
a.inv.push({ uid: "u1", id: w1.id }, { uid: "u3", id: w3.id, rs: "spear" });
let r = codexBound(a, new Set(["u1"]));
ok(r.bound["rs:sun_beam"]?.length === 1 && r.bound["rs:sun_beam"][0].eq && r.bound["rs:sun_beam"][0].src === "item", "открытое надетое оружие — по имени, (надето)");
ok(r.hidden["rs:sun_beam"] >= 1, "закрытое оружие с тем же навыком — скрыто счётчиком");
ok(r.bound["rs:spear"]?.[0]?.src === "drop", "выпавший навык своего экземпляра");
a.disc.items[w2.id] = { st: 0, v: 1 }; r = codexBound(a, new Set(["u1"]));
ok(r.bound["rs:sun_beam"].length === 2 && r.bound["rs:sun_beam"][0].eq, "несколько оружий, надетое первым");
const t = weaponType(w3.id, null); applyOverride("weapon", t, validatePatch("weapon", t, { rs: "moon_orb" }) as any); r = codexBound(a, new Set());
ok(r.bound["rs:moon_orb"]?.some((x: any) => x.name === w3.name && x.src === "type") && !r.bound["rs:spear"]?.some((x: any) => x.name === w3.name), "правка типа важнее выпавшего");
ok(Object.values(r.hidden).some((n) => n > 0), "оружие этого типа, не открытое — в счётчике");
applyOverride("weapon", t, null); for (const w of [w1, w2]) applyOverride("item", w.id, null);
const b: any = newAccount(); r = codexBound(b, new Set());
ok(!Object.keys(r.bound).length, "ничего не открыто — имён нет");
// навык из админки (любой навык игры) — карточка Кодекса по своему id
{ const c: any = newAccount(); const w = W[5]; applyOverride("item", w.id, validatePatch("item", w.id, { rs: "fly_blades" }) as any);
  c.disc.items[w.id] = { st: 0, v: 1 }; c.inv.push({ uid: "x1", id: w.id }); let q = codexBound(c, new Set(["x1"]));
  ok(q.bound["rs:fly_blades"]?.[0]?.name === w.name && q.bound["rs:fly_blades"][0].eq, "«Летучие клинки» из админки: закреплён за открытым надетым оружием");
  applyOverride("item", w.id, validatePatch("item", w.id, { rs: "ab:meteor" }) as any); q = codexBound(c, new Set());
  ok(q.bound["meteor"]?.[0]?.name === w.name, "навык героя в слоте R → карточка героя «Метеор»");
  ok(typeof validatePatch("item", w.id, { rs: "ab:nope" }) === "string", "неизвестный навык отклонён");
  applyOverride("item", w.id, null); }
console.log(f ? `FAILED ${f}` : "codex-bound ok"); if (f) process.exit(1);
