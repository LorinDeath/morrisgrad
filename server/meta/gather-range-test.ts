// Сбор: дальность/время из админки (GATHER_CFG.range/slack/timeMs) + узлы сервера и клиента — одни и те же.
// Запуск: bun server/meta/gather-range-test.ts
import { readFileSync } from "node:fs";
import { Zone } from "./zone";
import { GATHER_CFG, gatherClient, gatherRange, gatherSlack, gatherTimeMs } from "./gatherCfg";
import { genNodes, WET, ZONE_GEN } from "./zoneGen";
import { wetNear } from "./liquid.ts";
import { ZONE_NODES } from "./defs";
let f = 0; const ok = (c: any, m: string) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) f++; };

const z: any = new Zone("arinar", [], ZONE_NODES, { proc: true, seed: ZONE_GEN.seed });
const n = z.nodes[0], P = (dx: number, dy = 0) => ({ x: n.x + dx, y: n.y + dy, alive: true } as any);
const T0 = 1_000_000, T1 = T0 + 1200;

// 1. умолчания = прежнее поведение (75 px, 1100 мс) + запас
ok(gatherRange() === 75 && gatherTimeMs() === 1100 && gatherSlack() === 20, "умолчания 75 px / 1100 мс / запас 20 px");
ok(!!z.gatherCheck(P(0), n.id, T0, T1), "вплотную к узлу — сбор засчитан");
ok(!!z.gatherCheck(P(60), n.id, T0, T1) && !!z.gatherCheck(P(90), n.id, T0, T1), "в радиусе 75 и в запасе (до 95 px) — засчитан");
ok(!z.gatherCheck(P(96), n.id, T0, T1), "дальше range+запас — «слишком далеко»");
ok(!z.gatherCheck(P(0), n.id, T0, T0 + 1000), "раньше 1100 мс — рано");
ok(!!z.gatherCheck(P(0), n.id, T0, T0 + 1100), "ровно 1100 мс — можно");

// 2. значения из админки меняют проверку
Object.assign(GATHER_CFG, { range: 150, slack: 0, timeMs: 400 });
ok(!!z.gatherCheck(P(140), n.id, T0, T0 + 450) && !z.gatherCheck(P(151), n.id, T0, T0 + 450), "range=150, slack=0: 140 ок, 151 нет");
ok(!z.gatherCheck(P(0), n.id, T0, T0 + 399) && !!z.gatherCheck(P(0), n.id, T0, T0 + 400), "timeMs=400");
const c = gatherClient() as any; ok(c.range === 150 && c.slack === 0 && c.timeMs === 400, "клиент получает range/slack/timeMs в meta_state");
Object.assign(GATHER_CFG, { range: 1e9, slack: -5, timeMs: "x" as any });
ok(gatherRange() === 400 && gatherSlack() === 0 && gatherTimeMs() === 1100, "мусор в БД зажат в границы / откат к умолчанию");
Object.assign(GATHER_CFG, { range: 75, slack: 20, timeMs: 1100 });

// 3. поля есть в админке (схема «⛏ Сбор» в overrides.ts)
const ovr = readFileSync(new URL("./overrides.ts", import.meta.url), "utf8");
ok(["range", "slack", "timeMs"].every((k) => ovr.includes(`N("${k}"`)), "overrides.ts: поля range, slack, timeMs в админке");

// 4. узлы клиента = узлы сервера: клиент обязан подключать тот же фильтр воды (WET.f = wetNear), иначе id узла N сдвигается
ok(WET.f === wetNear, "WET.f задан (сервер)");
const withWet = genNodes(ZONE_GEN.seed), srv = z.nodes;
ok(withWet.length === srv.length && withWet.every((d, i) => d.id === srv[i].id && d.x === srv[i].x && d.y === srv[i].y), "genNodes(сид) = узлы Zone (id → точка)");
WET.f = null; const noWet = genNodes(ZONE_GEN.seed); WET.f = wetNear;
const moved = noWet.filter((d, i) => !srv[i] || d.x !== srv[i].x || d.y !== srv[i].y).length;
ok(moved > 0, `без фильтра воды у ${moved} из ${noWet.length} узлов id указывает на другую точку (прежняя ошибка клиента)`);
const zv = readFileSync(new URL("../../src/pages/MorrisCurse/_core/hub/zoneView.js", import.meta.url), "utf8");
ok(/WET\.f\s*=\s*wetNear/.test(zv), "клиент (zoneView.js) подключает тот же WET.f = wetNear");
console.log(f ? `FAILED ${f}` : "ALL OK"); process.exit(f ? 1 : 0);
