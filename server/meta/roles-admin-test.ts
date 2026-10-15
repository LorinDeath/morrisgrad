// Матрица прав админ-панели: admin / moderator / plain. Запуск:
// npx esbuild server/meta/roles-admin-test.ts --bundle --platform=node --format=esm --outfile=/tmp/roles-admin.mjs && node /tmp/roles-admin.mjs
import { Roles, MOD_ADMIN_KINDS } from "./roles";
import { AdminStore } from "./admin";

let pass = 0, fail = 0;
const ok = (c: any, m: string) => { if (c) { pass++; console.log("PASS " + m); } else { fail++; console.log("FAIL " + m); } };

const r = new Roles(null);
r.loaded = true; r.loadedAt = Date.now();
r.map.set("uid:adm", "admin");
r.map.set("uid:mod", "moderator");

const adm = { pkey: "uid:adm", verified: true };
const mod = { pkey: "uid:mod", verified: true };
const plain = { pkey: "uid:plain", verified: true };
const guest = { pkey: "guest:x", verified: false };
const unverifiedMod = { pkey: "uid:mod", verified: false };

ok(r.isAdmin(adm) && !r.isModerator(adm), "admin isAdmin");
ok(r.isModerator(mod) && !r.isAdmin(mod), "mod isModerator");
ok(!r.isAdmin(plain) && !r.isModerator(plain), "plain neither");
ok(!r.isAdmin(unverifiedMod) && !r.isModerator(unverifiedMod), "unverified moderator has no rights");
ok(!r.canOpenAdmin(guest), "guest cannot open panel");

ok(r.canOpenAdmin(adm) && r.canOpenAdmin(mod) && !r.canOpenAdmin(plain), "open: admin+mod yes, plain no");
ok(r.canAdminFull(adm) && !r.canAdminFull(mod) && !r.canAdminFull(plain), "full (quests/audit): admin only");

for (const k of MOD_ADMIN_KINDS) ok(r.canAdminWrite(mod, k), `mod write ${k}`);
for (const k of ["skill", "loot", "spawn", "region", "boss", "rare", "quest"]) ok(!r.canAdminWrite(mod, k), `mod deny write ${k}`);
ok(r.canAdminWrite(adm, "skill") && r.canAdminWrite(adm, "quest"), "admin write any");
ok(!r.canAdminWrite(plain, "mob"), "plain deny write mob");

const pfA = r.panelFlags(adm), pfM = r.panelFlags(mod), pfP = r.panelFlags(plain);
ok(pfA.admin && !pfA.modAdmin && pfA.kinds === null, "panelFlags admin");
ok(!pfM.admin && pfM.modAdmin && JSON.stringify(pfM.kinds) === JSON.stringify([...MOD_ADMIN_KINDS]), "panelFlags mod");
ok(!pfP.admin && !pfP.modAdmin, "panelFlags plain");

const cat = new AdminStore(null).catalogFor("moderator");
ok(cat.scope === "moderator", "catalog scope moderator");
ok(!!cat.ent.mob?.length && !!cat.ent.weapon?.length && !!cat.ent.item?.length, "mod catalog has mob/weapon/item");
ok(!cat.ent.skill && !cat.ent.loot && !cat.ent.spawn, "mod catalog strips skill/loot/spawn");
ok(Array.isArray(cat.quests) && cat.quests.length === 0, "mod catalog no quests");
ok(!cat.vn?.dialogues || Object.keys(cat.vn.dialogues).length === 0, "mod catalog no dialogues");
ok(!!cat.schema.mob && !!cat.schema.weapon && !!cat.schema.item && !cat.schema.skill, "mod schema only allowed kinds");

const full = new AdminStore(null).catalogFor("admin");
ok(full.scope === "admin" && full.quests.length > 0 && !!full.ent.skill?.length, "admin catalog full");

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
