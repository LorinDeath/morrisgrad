// nice bun server/strat/stats-test.ts
import { publicStats, privateStats, privView, type StatRow } from "./stats";
import { STRAT_CFG } from "./rules";
let pass = 0, fail = 0; const ok = (c: any, m: string) => { if (c) pass++; else { fail++; console.log("FAIL", m); } };
const r = (o: Partial<StatRow>): StatRow => ({ match_id: "m" + Math.random(), user_id: "u1", race: "fire", result: "win", rated: 1, league: "normal", size: 15, map_id: "o15a", turns: 30, duration_ms: 1800000, techs: "[]", chief_type: "warlord", chief_level: 3, chief_kills: 0, talents: "[]", ults: "[]", created_at: 1, ...o });
const rows = [r({ techs: '["f1","f2"]', talents: '["t1"]', ults: '["doom"]', chief_kills: 4, match_id: "best" }), r({ result: "loss", techs: '["f1"]', chief_level: 5, chief_type: "mage" }), r({ race: "ice", result: "draw", map_id: null, size: 8, turns: 10, duration_ms: 600000 })];
const P = publicStats(rows);
ok(P.matches === 3 && P.wins === 1 && P.winrate === 33.3 && P.races.fire.matches === 2 && P.races.fire.winrate === 50 && P.favouriteRace === "fire", "публичная: по расам, % побед, любимая раса");
ok(!("topTechs" in P) && !("chiefKillRecord" in P) && !JSON.stringify(P).includes("chief_level"), "публичная не содержит приватных полей");
const Q = privateStats(rows);
ok(Q.topTechs[0].id === "f1" && Q.topTechs[0].count === 2, "любимые техно");
ok(Q.topChiefTypes[0].id === "mage" && Q.topChiefTypes[0].levelsGained === 4, "самые прокачанные типы Вождей (сумма уровней)");
ok(Q.chiefKillRecord.kills === 4 && Q.chiefKillRecord.match === "best", "рекорд убийств Вождём");
ok(Q.topTalents[0].id === "t1" && Q.topUlts[0].id === "doom", "таланты/ульты");
ok(Q.avgMatch.turns === 23.3 && Q.avgMatch.minutes === 23.3, "средняя партия");
ok(Q.maps.o15a.matches === 2 && Q.maps["rnd:8"].matches === 1, "по картам");
ok(!JSON.stringify(Q).match(/maxChief|chiefMax|"level"/), "без максимального уровня Вождя");
ok(publicStats([]).winrate === 0 && privateStats([]).avgMatch.turns === 0, "пустой профиль");
// t1163: profile_get.priv — названия из cfg, вид ульты chief|unit
{
  const tech0 = (STRAT_CFG as any).techs[0], ch0 = (STRAT_CFG as any).chiefs[0];
  const V = privView(privateStats([r({ techs: JSON.stringify([tech0.id]), ults: '["doom","quake","zzz"]', chief_type: ch0.id, chief_level: 3, chief_kills: 2, match_id: "mk" })]), STRAT_CFG);
  ok(V.techs[0].name === tech0.name && V.techs[0].n === 1, "priv: название технологии");
  const u = Object.fromEntries(V.ults.map((x) => [x.id, x]));
  ok(u.doom.kind === "chief" && u.quake.kind === "unit" && u.quake.name === "Сотрясение" && u.zzz.name === "zzz", "priv: ульты Вождя/фигуры, неизвестный id — как есть");
  ok(V.chiefsLeveled === 2 && V.chiefTypes[0].name === ch0.name && V.recordChiefKills.n === 2 && V.recordChiefKills.match === "mk", "priv: Вожди прокачаны, рекорд");
}
console.log(`stats: ${pass} ok, ${fail} fail`); if (fail) process.exit(1);
