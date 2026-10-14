// Добыча на земле: владелец, дальность, исчезновение, полная сумка, анти-дюп, лимит.
// npx esbuild server/meta/loot-test.ts --bundle --platform=node --format=esm --outfile=/tmp/loot.mjs && node /tmp/loot.mjs
import { LootBags, BAG_TTL_MS, BAG_RANGE, TAKE_RATE, pickBagOwner, KILLER_BAG_CHANCE } from "./loot";
let pass = 0, fail = 0; const ok = (c: any, m: string) => { c ? pass++ : fail++; console.log((c ? "PASS " : "FAIL ") + m); };
const L = new LootBags(), t0 = 1e12;
const b = L.drop("arinar", 1000, 1000, "uid:a", { items: ["x1", "x2", "x3"], res: { ore: 2 } }, "kill:slime", "mob", "slime", t0)!;
ok(b && b.entries.length === 4, "bag with 3 items + 1 resource stack");
ok(!L.drop("arinar", 0, 0, "uid:a", { items: [], res: {} }, "k", "mob", "m", t0), "empty loot → no bag");
ok(typeof L.access(b.id, "uid:b", "arinar", 1000, 1000, t0) === "string", "foreign owner rejected");
ok(typeof L.access(b.id, "uid:a", "arinar", 1000 + BAG_RANGE + 30, 1000, t0) === "string", "too far rejected");
ok(typeof L.access(b.id, "uid:a", "hellfire", 1000, 1000, t0) === "string", "other world rejected");
ok(typeof L.access(b.id, "uid:a", "arinar", 1010, 1000, t0) === "object", "owner nearby can open");
ok(L.near("uid:a", "arinar", 1000, 1000, 500).length === 1 && L.near("uid:b", "arinar", 1000, 1000, 500).length === 0, "bags visible only to owner");
const inv: string[] = [];
let r = L.take(b, [b.entries[0].lid, b.entries[0].lid], (e) => (inv.push(e.id), true), 10);
ok(r.got.length === 1 && inv.length === 1, "same lid twice in one request → taken once (anti-dupe)");
const lid0 = r.got[0].lid; r = L.take(b, [lid0], (e) => (inv.push(e.id), true), 10);
ok(r.got.length === 0 && inv.length === 1, "replayed lid → nothing (anti-dupe)");
r = L.take(b, "all", (e) => e.k === "res", 10);
ok(r.full && r.got.length === 1 && b.entries.length === 2, "inventory full: items stay in bag, resource taken");
r = L.take(b, "all", () => true, 10);
ok(r.left === 0 && !L.bags.has(b.id), "take all empties and removes bag");
const b2 = L.drop("arinar", 0, 0, "uid:a", { items: ["y"], res: {} }, "k", "mob", "m", t0)!;
L.expire(t0 + BAG_TTL_MS + 1); ok(!L.bags.has(b2.id), "bag despawns after TTL");
ok(typeof L.access(b2.id, "uid:a", "arinar", 0, 0, t0 + BAG_TTL_MS + 1) === "string", "expired bag cannot be opened");
const g1 = L.admit("uid:z", 100, t0); const g2 = L.admit("uid:z", 10, t0 + 10);
ok(g1 === TAKE_RATE && g2 === 0, `rate limit: burst ${g1}, then ${g2}`);
for (let i = 0; i < 45; i++) L.drop("arinar", 0, 0, "uid:c", { items: ["q"], res: {} }, "k", "mob", "m", t0 + i);
ok([...L.bags.values()].filter((x) => x.owner === "uid:c").length === 40, "max 40 bags per owner (oldest dropped)");
// владелец мешка: больше всех урона; 10% — добивший (rng сервера); мобы не владеют
{
  const dm = new Map([["top", 600], ["kill", 100], ["mob:7", 900]]);
  ok(pickBagOwner(dm, "kill", () => 0.5) === "top", "bag → top damage dealer (mob damage ignored)");
  ok(pickBagOwner(dm, "kill", () => 0.05) === "kill", "rng < 10% → killing blow gets the bag");
  ok(pickBagOwner(dm, "top", () => 0.0) === "top" && pickBagOwner(dm, "mob:7", () => 0.0) === "top", "killer = top or a mob → top");
  ok(pickBagOwner(new Map([["mob:1", 5]]), "mob:1", () => 0) === null, "only mobs damaged → no bag");
  let k = 0, s = 12345; const rnd = () => ((s = (s * 1103515245 + 12345) % 2147483648) / 2147483648);
  for (let i = 0; i < 20000; i++) if (pickBagOwner(dm, "kill", rnd) === "kill") k++;
  ok(Math.abs(k / 20000 - KILLER_BAG_CHANCE) < 0.01, `killer share over 20000 kills: ${(k / 200).toFixed(1)}% (≈10%)`);
  const L2 = new LootBags(); const own = pickBagOwner(dm, "kill", () => 0.5)!;
  const bb = L2.drop("arinar", 0, 0, own, { items: ["x"], res: {} }, "k", "mob", "m", t0)!;
  ok(L2.near("top", "arinar", 0, 0, 100).length === 1 && L2.near("kill", "arinar", 0, 0, 100).length === 0 && typeof L2.access(bb.id, "kill", "arinar", 0, 0, t0) === "string", "only the owner sees/opens the bag");
}
console.log(`${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
