// Алтарь перевоплощения Альказака (service.ts cityAltar / altarRespawn / soulSet) и жители города (cityWalk.ts).
// cd server && bun meta/city-altar-test.ts
import { MetaService } from "./service";
import { CITY_CFG, cityAltarPos, inCity } from "./city";
import { CityWalk, cityWalkBlocked, isResident } from "./cityWalk";
import { cityNpcId, inRoomArea, buildingById, outsideDoor } from "./cityBuild";
import { walkable } from "./walkable";
let pass = 0, fail = 0; const ok = (c: any, m: string, x?: any) => { c ? pass++ : fail++; console.log((c ? "ok   " : "FAIL ") + m + (c || x === undefined ? "" : " " + JSON.stringify(x))); };
const P: any = (MetaService as any).prototype;

function mk(opts: any = {}) {
  const sent: any[] = [], acc: any = opts.acc || {};
  const self: any = {
    sent, acc, killer: !!opts.killer, pk: !!opts.pk, duel: false, bc: 0,
    send: (_ws: any, m: any) => sent.push(m), store: { account: () => acc },
    killerOf() { return { killer: self.killer }; }, pkOf() { return { pk: self.pk }; },
    pvp: { inDuel: () => self.duel }, onPlayersChanged: () => self.bc++,
  };
  for (const k of ["nearCityAltar", "altarRespawn", "soulSet", "cityAltar", "altarState"]) self[k] = P[k].bind(self);
  const [ax, ay] = cityAltarPos();
  const session: any = { id: "s1", world: "arinar", x: ax + 30, y: ay + 10, stats: { classId: "warrior", hp: 70 } };
  const ms: any = { pkey: "p1", zp: { alive: true, hp: 70, maxHp: 70 }, dirty: false };
  return { self, session, ms, ax, ay };
}
const last = (s: any, t: string) => [...s.sent].reverse().find((m: any) => m.type === t);

// ——— точка алтаря ———
{ const [ax, ay] = cityAltarPos();
  ok(CITY_CFG.altar?.on !== false && Math.hypot(ax - CITY_CFG.x, ay - CITY_CFG.y) < 260, "алтарь включён и стоит у фонтана", [ax, ay]);
  ok(inCity(ax, ay) && walkable("arinar", ax, ay + 48), "точка алтаря — под куполом, возрождение (на шаг южнее) проходимо"); }

// ——— привязка возрождения ———
{ const { self, session, ms, ax, ay } = mk();
  self.cityAltar(null, session, ms, "bind");
  ok(self.acc.altarRp?.id === "alkazak" && ms.dirty, "bind у алтаря: account.altarRp сохранён (D1 accounts.data)", self.acc);
  ok(last(self, "city_altar")?.bound === 1, "клиенту — состояние алтаря (bound)");
  const rp = self.altarRespawn(session, ms, "arinar");
  ok(rp && Math.hypot(rp.x - ax, rp.y - (ay + 48)) < 64 && walkable("arinar", rp.x, rp.y), "после гибели — возрождение у алтаря", rp);
  ok(self.altarRespawn(session, ms, "hellfire") === null, "другой мир — возрождение как раньше");
  self.killer = true; ok(self.altarRespawn(session, ms, "arinar") === null, "убийца — возрождение как раньше (купол не пустит)"); self.killer = false;
  self.pk = true; ok(self.altarRespawn(session, ms, "arinar") === null, "PK-режим — возрождение как раньше"); self.pk = false;
  CITY_CFG.altar.on = false; ok(self.altarRespawn(session, ms, "arinar") === null, "алтарь выключен в админке — как раньше"); CITY_CFG.altar.on = true;
  self.cityAltar(null, session, ms, "unbind");
  ok(!!last(self, "toast_error") && self.acc.altarRp, "откат привязки: повтор сразу — отказ", self.sent.slice(-1));
  ms.altarAt = Date.now() - 60_000; self.cityAltar(null, session, ms, "unbind");
  ok(!self.acc.altarRp && self.altarRespawn(session, ms, "arinar") === null, "unbind после отката: возрождение как раньше"); }
{ const { self, session, ms } = mk(); ok(self.altarRespawn(session, ms, "arinar") === null, "не привязывался — возрождение по умолчанию"); }
{ const { self, session, ms } = mk(); session.x += 600; self.cityAltar(null, session, ms, "bind");
  ok(!self.acc.altarRp && /Подойдите/.test(last(self, "toast_error")?.message || ""), "далеко от алтаря — отказ"); }
{ const { self, session, ms } = mk(); session.x += 30; CITY_CFG.altar.r = 20; self.cityAltar(null, session, ms, "bind");
  ok(!self.acc.altarRp, "радиус взаимодействия — из админки (r = 20 → далеко)"); CITY_CFG.altar.r = 110; }
{ const { self, session, ms } = mk({ killer: true }); self.cityAltar(null, session, ms, "bind"); ok(!self.acc.altarRp, "убийцу алтарь не привязывает"); }
{ const { self, session, ms } = mk(); ms.zp.alive = false; self.cityAltar(null, session, ms, "bind"); ok(!self.acc.altarRp, "мёртвый — отказ"); }

// ——— облик души ———
{ const { self, session, ms } = mk();
  self.cityAltar(null, session, ms, "soul");
  ok(session.stats.soul === 1 && last(self, "city_soul")?.on === 1 && self.bc === 1, "soul у алтаря: stats.soul = 1, клиенту city_soul, рассылка игрокам");
  ok(session.stats.classId === "warrior", "тело не теряется (classId на месте, лишних тел нет)");
  self.cityAltar(null, session, ms, "body");
  ok(session.stats.soul === 1 && last(self, "toast_error"), "откат смены облика: сразу назад — отказ");
  ms.soulAt = Date.now() - 60_000; session.x += 2000; self.cityAltar(null, session, ms, "body");
  ok(!session.stats.soul && last(self, "city_soul")?.on === 0, "body — вернуться в тело можно и вдали от алтаря"); }
{ const { self, session, ms } = mk({ pk: true }); self.cityAltar(null, session, ms, "soul"); ok(!session.stats.soul, "PK-режим — душа не отделяется"); }
{ const { self, session, ms } = mk({ killer: true }); self.cityAltar(null, session, ms, "soul"); ok(!session.stats.soul, "убийца — душа не отделяется"); }
{ const { self, session, ms } = mk(); self.duel = true; self.cityAltar(null, session, ms, "soul"); ok(!session.stats.soul, "в дуэли — нельзя"); }
{ const { self, session, ms } = mk(); session.stats = { hp: 70 }; self.cityAltar(null, session, ms, "soul"); ok(!session.stats.soul, "без тела (класса) — нельзя"); }
{ const { self, session, ms } = mk(); CITY_CFG.altar.soulOn = false; self.cityAltar(null, session, ms, "soul"); ok(!session.stats.soul, "облик души выключен в админке"); CITY_CFG.altar.soulOn = true; }
{ const { self, session, ms } = mk(); self.cityAltar(null, session, ms, "xxx"); ok(!self.sent.length, "неизвестное действие — тихо игнорируется"); }
// душа вне боя: PvP-удар по душе / от души — нет
{ const sa: any = { id: "a", world: "arinar", stats: { classId: "warrior", soul: 1 } }, sv: any = { id: "v", world: "arinar", stats: { classId: "rogue" } };
  const self: any = { ms: new Map([["a", { zp: { alive: true } }], ["v", { zp: { alive: true } }]]), sessionLookup: (id: string) => [null, id === "a" ? sa : sv] };
  ok(P.pvpStrike.call(self, "a", "v", 1) === false && P.pvpStrike.call(self, "v", "a", 1) === false, "PvP: душа не бьёт и не получает урон"); }

// ——— жители: дом ↔ улица ———
{ const R = (CITY_CFG.npc as any[]).map((s, i) => [i, s]).filter(([, s]) => isResident(s));
  ok(R.length === 4 && R.every(([i]) => i >= 24), "жителей 4 (места 25–28)", R.map(([i]) => i));
  const W = new CityWalk(); W.sync(0);
  ok(W.st.size === 4 && [...W.st.values()].every((s) => inRoomArea(s.x, s.y) && !cityWalkBlocked(s.x, s.y)), "старт — дома, на свободной клетке комнаты");
  let t = 0, inside = 0, outside = 0, bad = 0, moved = 0; const start = new Map([...W.st].map(([k, s]) => [k, [s.x, s.y]]));
  CITY_CFG.walk.inMinSec = CITY_CFG.walk.inMaxSec = 5; CITY_CFG.walk.outMinSec = CITY_CFG.walk.outMaxSec = 5;
  for (let k = 0; k < 2400; k++) { t += 100; W.tick(t, 0.1); for (const s of W.st.values()) { if (inRoomArea(s.x, s.y)) inside++; else { outside++; if (!inCity(s.x, s.y)) bad++; } if (cityWalkBlocked(s.x, s.y, 10)) bad++; } }
  for (const [k, s] of W.st) { const p = start.get(k)!; if (Math.hypot(s.x - p[0], s.y - p[1]) > 1 || s.out) moved++; }
  ok(inside > 0 && outside > 0, `ходят и дома, и на улице (${inside} / ${outside})`);
  ok(bad === 0, "никогда не стоят в стене и не выходят за купол", bad);
  const s0 = [...W.st.values()][0]; const b = buildingById((CITY_CFG.npc as any[])[s0.i].house)!, d = outsideDoor(b);
  ok(Math.hypot(s0.door[0] - d[0], s0.door[1] - d[1]) < 40, "на улицу выходит у своей двери");
  W.talkStart(cityNpcId(24), "pl", 0, 0, t); const a = W.pos(cityNpcId(24))!, ax = a.x, ay = a.y;
  for (let k = 0; k < 100; k++) { t += 100; W.tick(t, 0.1); }
  ok(a.x === ax && a.y === ay && !a.moving, "в разговоре стоит на месте (не уходит даже по таймеру)");
  W.talkEnd(null, "pl", t);
  ok(JSON.stringify(W.entry(cityNpcId(24))?.slice(0, 1)) === JSON.stringify(["city_25"]), "снимок для zone_state: [id, x, y, dir, moving]");
  (CITY_CFG.npc as any[])[25].on = false; W.sync(t); ok(!W.pos("city_26") && W.st.size === 3, "место выключили в админке — житель пропал"); (CITY_CFG.npc as any[])[25].on = true;
  CITY_CFG.walk.on = false; W.sync(t); W.tick(t + 100, 0.1); ok([...W.st.values()].every((s) => !s.out && s.x === s.home[0] && s.y === s.home[1]), "прогулки выкл — стоят дома на своём месте"); CITY_CFG.walk.on = true; }

console.log(`\n${pass} ok, ${fail} fail`); process.exit(fail ? 1 : 0);
