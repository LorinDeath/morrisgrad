// Сундуки схватки: группировка, личные броски, фазы, канал, Shift-взятие, анти-дюп, конкуренция, админ-права.
// npx esbuild server/meta/chests-test.ts --bundle --platform=node --format=esm --outfile=/tmp/chests.mjs && node /tmp/chests.mjs
import { CHEST, Chests, Encounters, recipients, rollChest, linkedAlive } from "./chests";
import { validatePatch, applyOverride, currentValues } from "./overrides";
import { Roles } from "./roles";
let pass = 0, fail = 0; const ok = (c: any, m: string) => { c ? pass++ : fail++; console.log((c ? "PASS " : "FAIL ") + m); };
const mob = (id: number, x: number, y: number, o: any = {}) => ({ id, x, y, dead: false, reset: false, targetSid: null as any, mobTarget: 0, camp: 0, dmgBy: new Map<string, number>(), ...o });
const t0 = 1e12;
// --- группировка ---
{
  const E = new Encounters(); const pk = (s: string) => "uid:" + s;
  const a = mob(1, 0, 0, { camp: 7 }), b = mob(2, 100, 0, { camp: 7, targetSid: "A" }), c = mob(3, 150, 50, { camp: 7, targetSid: "B" }), far = mob(4, 3000, 0, { targetSid: "A" });
  const all = [a, b, c, far];
  a.dmgBy.set("A", 900); a.dmgBy.set("B", 100); a.dead = true;
  ok(linkedAlive(all, a, new Set(["A", "B"])).length === 2, "связаны 2 живых из пачки, дальний — нет");
  const e = E.onKill("arinar", a, all, pk, t0)!; ok(!!e && e.watch.size === 2, "убийство из пачки → схватка, наблюдаем 2");
  ok(!E.done(e, (id) => all.find((m) => m.id === id), t0), "схватка не закончена, пока живы");
  b.dmgBy.set("A", 500); b.dead = true; E.onKill("arinar", b, all, pk, t0 + 1000);
  c.dmgBy.set("B", 300); c.dmgBy.set("C", 10); c.dead = true; const e2 = E.onKill("arinar", c, all, pk, t0 + 2000);
  ok(e2 === e && E.done(e, (id) => all.find((m) => m.id === id), t0 + 2000), "последний моб → схватка закончена (один сундук)");
  ok(e.dmg.get("A") === 1400 && e.dmg.get("B") === 400, "урон схватки суммируется");
  for (const m of [a, b, c]) e.kills.push({ type: "x", lootKey: "x", elite: false, cursed: false, boss: false, rare: false, special: "", x: m.x, y: m.y });
  CHEST.minSharePct = 7; const rec = recipients(e, (s) => [s]);
  ok(rec.has("A") && rec.has("B") && !rec.has("C"), "порог вклада 7%: C (0.5%) без добычи");
  const lone = mob(9, 9000, 9000); lone.dmgBy.set("A", 50); lone.dead = true;
  ok(E.onKill("arinar", lone, [lone], pk, t0) === null, "одиночный моб → null (обычный мешок)");
  CHEST.on = false; const x = mob(10, 0, 0); x.dmgBy.set("A", 1); ok(E.onKill("arinar", x, [x, mob(11, 10, 0, { targetSid: "A" })], pk, t0) === null, "выкл в админке → мешки"); CHEST.on = true;
  const r2 = mob(20, 0, 0); r2.dmgBy.set("A", 1); const live = mob(21, 50, 0, { targetSid: "A" });
  const e3 = E.onKill("arinar", r2, [r2, live], pk, t0)!; live.reset = true; ok(E.done(e3, () => live, t0), "оставшийся моб сбросился (поводок) → сундук");
  // броски: personal — каждому свои
  let n = 0; const ents = rollChest(e, rec, () => [], () => ({ items: ["it" + (n++)], res: { ore: 2 } }), Math.random);
  ok(ents.filter((z) => z.o === "uid:A").length === 6 && ents.filter((z) => z.o === "uid:B").length === 6, "personal: по 3 убийства × (вещь+ресурс) каждому");
  CHEST.partyMode = "rr"; n = 0; const ents2 = rollChest(e, rec, (s) => ["A", "B"], () => ({ items: ["q" + (n++)], res: { ore: 3 } }), () => 0);
  const ia = ents2.filter((z) => z.k === "item" && z.o === "uid:A").length, ib = ents2.filter((z) => z.k === "item" && z.o === "uid:B").length;
  ok(ia + ib === 3 && Math.abs(ia - ib) <= 1 && n === 3, "rr: один бросок на отряд, вещи по кругу");
  ok(ents2.filter((z) => z.k === "res").reduce((s, z) => s + z.n, 0) === 9, "rr: ресурсы делятся без потерь");
  CHEST.partyMode = "personal";
}
// --- сундук ---
{
  const C = new Chests(); CHEST.personalSec = 120; CHEST.publicSec = 3600; CHEST.channelSec = 15;
  const c = C.spawn("arinar", 1000, 1000, [{ o: "uid:A", id: "sword", k: "item", n: 1 }, { o: "uid:A", id: "helm@c", k: "item", n: 1 }, { o: "uid:B", id: "boots", k: "item", n: 1 }, { o: "uid:B", id: "ore", k: "res", n: 4 }], "chest:x", "mob", "x", "x", t0)!;
  ok(c.entries.length === 4 && c.entries[1].c === 1 && c.entries[1].id === "helm", "один сундук, проклятая метка сохранена");
  ok(C.visible(c, "uid:A", t0).length === 2 && C.visible(c, "uid:Z", t0).length === 0, "личная фаза: видит только своё");
  ok(typeof C.get(c.id, "arinar", 1000 + CHEST.range + 10, 1000, t0) === "string" && typeof C.get(c.id, "hellfire", 1000, 1000, t0) === "string", "дальность/мир");
  ok("err" in C.tryOpen(c, "uid:Z", "z", t0), "чужой не открывает личный");
  ok("view" in C.tryOpen(c, "uid:A", "a", t0), "владелец открывает сразу");
  const inv: string[] = []; const give = (e: any) => (inv.push(e.id), true);
  ok(C.take(c, "uid:A", c.entries.find((e) => e.o === "uid:B")!.lid, give, t0).err === "Это чужая добыча", "чужую позицию не взять");
  const l0 = c.entries[0].lid; ok(!!C.take(c, "uid:A", l0, give, t0).got && C.take(c, "uid:A", l0, give, t0 + 500).err === "Уже забрали", "анти-дюп: повтор lid");
  // смерть и возвращение: окно закрылось, сундук ждёт
  C.open.delete("uid:A"); ok("view" in C.tryOpen(c, "uid:A", "a2", t0 + 60_000), "после смерти/возрождения (новая сессия) — открывает снова");
  // общая фаза: окно личной фазы закрывается, повторное открытие — через канал
  C.open.set("uid:A", { id: c.id, at: t0 + 1000, sid: "a" }); const evp = C.tick(c.pubAt + 1, () => 0, () => ({ world: "arinar", x: 1000, y: 1000, alive: true }));
  ok(evp.some((x) => x.k === "close" && x.pk === "uid:A") && "channel" in C.tryOpen(c, "uid:A", "a", c.pubAt + 2), "личное окно не даёт обойти канал в общей фазе"); C.chan.delete("uid:A");
  const tp = c.pubAt + 1; ok(C.visible(c, "uid:Z", tp).length === 3, "после 2 мин — всё общее, видят все");
  ok(C.near("uid:Z", "arinar", 1000, 1000, 500, tp)[0][3] === 1, "near: фаза общая");
  const ch = C.tryOpen(c, "uid:Z", "z", tp); ok("channel" in ch && (ch as any).channel === tp + 15000, "общий: канал 15 с");
  ok(C.take(c, "uid:Z", c.entries[0].lid, give, tp + 1000).err === "Сначала откройте сундук", "во время канала брать нельзя");
  let hurt = 0; const pos = () => ({ world: "arinar", x: 1000, y: 1000, alive: true });
  ok(C.tick(tp + 5000, () => hurt, pos).length === 0, "канал идёт");
  hurt = tp + 6000; const ev = C.tick(tp + 6000, () => hurt, pos); ok(ev[0]?.k === "cancel" && /ударили/.test(ev[0].why!), "урон прерывает канал");
  C.tryOpen(c, "uid:Z", "z", tp + 7000); ok(C.tick(tp + 7000 + 15000, () => hurt, pos)[0]?.k === "opened", "канал 15 с без урона → открыто");
  // конкуренция: двое открыли, берут одно
  C.tryOpen(c, "uid:Y", "y", tp + 30000); C.tick(tp + 46000, () => 0, pos);
  const lid = c.entries[0].lid; const r1 = C.take(c, "uid:Z", lid, give, tp + 46100), r2 = C.take(c, "uid:Y", lid, give, tp + 46100);
  ok(!!r1.got && r2.err === "Уже забрали", "конкуренция: позицию получает ровно один");
  ok(C.viewers(c.id).length === 2, "оба видят обновление");
  hurt = tp + 47000; const ev2 = C.tick(tp + 47000, () => hurt, pos); ok(ev2.filter((x) => x.k === "close").length === 2, "урон закрывает окно добычи");
  // лимит
  CHEST.takeRate = 2; C.open.set("uid:Q", { id: c.id, at: tp + 50000, sid: "q" }); const lids = c.entries.map((e) => e.lid);
  const res = [...lids, ...lids, ...lids].map((l) => C.take(c, "uid:Q", l, () => false, tp + 50000)); ok(res.filter((r) => r.err === "Не так быстро").length >= 1, "лимит взятий/с"); CHEST.takeRate = 6;
  ok(C.expire(c.exp + 1).length === 1 && !C.chests.size && C.removed.has(c.id), "через час — исчезает (и удаляется из D1)");
  const C2 = new Chests(); C2.seed([JSON.parse(JSON.stringify(c))]); ok(C2.chests.get(c.id)?.entries.length === c.entries.length, "восстановление из БД (рестарт DO)");
}
// --- свечение проклятых: только свои в личной фазе ---
{
  const C = new Chests(); const t = 2e12;
  const c = C.spawn("arinar", 0, 0, [{ o: "uid:A", id: "a@c", k: "item", n: 1 }, { o: "uid:A", id: "b@c", k: "item", n: 1 }, ...[1, 2, 3, 4].map((i) => ({ o: "uid:B", id: "x" + i + "@c", k: "item" as const, n: 1 })), { o: "uid:B", id: "plain", k: "item", n: 1 }], "s", "mob", "m", "m", t)!;
  const nA = C.near("uid:A", "arinar", 0, 0, 100, t)[0], nB = C.near("uid:B", "arinar", 0, 0, 100, t)[0], nZ = C.near("uid:Z", "arinar", 0, 0, 100, t)[0];
  ok(nA[7] === 2 && nB[7] === 4 && nZ[7] === 0 && nZ[5] === 0, "личная фаза: свечение по СВОИМ проклятым (A 2, B 4, чужой 0)");
  const nP = C.near("uid:Z", "arinar", 0, 0, 100, c.pubAt + 1)[0]; ok(nP[7] === 5 && nP[5] === 7, "общая: все оставшиеся проклятые, потолок 5");
  C.open.set("uid:B", { id: c.id, at: t, sid: "b" }); C.take(c, "uid:B", c.entries.find((e) => e.o === "uid:B" && e.c)!.lid, () => true, t);
  ok(C.near("uid:B", "arinar", 0, 0, 100, t)[0][7] === 3, "свечение уменьшается при взятии");
}
// --- админка ---
{
  ok(typeof validatePatch("chest", "main", { personalSec: 10, channelSec: 3, partyMode: "rr", guard: false, minSharePct: 12 }) === "object", "правка сундуков валидна");
  ok(typeof validatePatch("chest", "main", { partyMode: "steal" }) === "string", "режим отряда — только из списка");
  ok(typeof validatePatch("chest", "main", { personalSec: -1 }) === "string", "диапазон проверяется");
  applyOverride("chest", "main", validatePatch("chest", "main", { personalSec: 10, channelSec: 3 }) as any); ok(CHEST.personalSec === 10 && CHEST.channelSec === 3, "правка действует сразу");
  applyOverride("chest", "main", null); ok(CHEST.personalSec === 120 && CHEST.channelSec === 15 && CHEST.publicSec === 3600, "сброс — исходные");
  ok(currentValues("chest", "main").partyMode === "personal", "currentValues для панели");
  const R: any = new Roles(null as any); R.map.set("uid:m", "moderator"); R.loaded = true; R.loadedAt = Date.now();
  ok(!R.canAdminWrite({ pkey: "uid:m", verified: true }, "chest"), "модератор не может писать «Сундуки»");
}
console.log(`\n${pass} passed, ${fail} failed`); if (fail) process.exit(1);
