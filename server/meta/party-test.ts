import { Parties, PARTY_MAX, splitLoot, partyXpShare } from "./party";
let fail = 0; const ok = (c: boolean, m: string) => { if (!c) fail++; console.log((c ? "PASS " : "FAIL ") + m); };
const P = new Parties();
ok(P.invite("a", "b") === null && typeof P.accept("b", "a") !== "string", "a пригласил b — отряд создан");
ok(P.ally("a", "b") && !P.ally("a", "c") && !P.ally("a", "a"), "союзники: a–b да, a–c нет");
ok(P.invite("b", "c") === "Приглашать может только лидер", "приглашает только лидер");
for (const s of ["c", "d"]) { P.invite("a", s); P.accept(s, "a"); }
ok(P.get("a")!.members.length === PARTY_MAX, `максимум ${PARTY_MAX}`);
ok(P.invite("a", "e") === `В отряде максимум ${PARTY_MAX}`, "5-й не приглашается");
ok(typeof P.accept("e", "a") === "string", "без приглашения не войти");
P.leave("a"); ok(P.leaderOf("b") === "b" && P.get("b")!.members.length === 3, "уход лидера → лидер b");
P.leave("c"); P.leave("d"); ok(!P.get("b"), "остался один — отряд распущен");
P.invite("x", "y"); ok(typeof P.accept("y", "x", Date.now() + 61_000) === "string", "приглашение истекает");
{ P.invite("m", "n"); P.accept("n", "m"); const pos: any = { m: { world: "arinar", x: 0, y: 0 }, n: { world: "arinar", x: 900, y: 0 } };
  ok(P.near("m", "arinar", 0, 0, (s) => pos[s]).length === 2, "оба рядом — делёж на двоих");
  pos.n.x = 5000; ok(P.near("m", "arinar", 0, 0, (s) => pos[s]).join() === "m", "далеко — не делит"); }
{ const s = splitLoot({ items: ["i1", "i2", "i3"], res: { ore: 5 } }, ["a", "b"], () => 0);
  const items = [...s.values()].flatMap((x) => x.items), ore = [...s.values()].reduce((t, x) => t + (x.res.ore || 0), 0);
  ok(items.length === 3 && ore === 5 && s.get("a")!.items.length === 2, "добыча: предметы по кругу, ресурсы поровну, сумма сохранена"); }
ok(Math.abs(partyXpShare(4) * 4 - 1.3) < 1e-9 && partyXpShare(1) === 1, "опыт: отряд 4 — каждому 32.5% (сумма 130%)");
if (fail) { console.log(fail + " FAIL"); process.exit(1); } console.log("party ok");
