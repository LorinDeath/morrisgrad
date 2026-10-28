// Таймеры возрождения лагерей: сервер ([8] в campSummary), маркер задания ведёт к живой цели, иначе — к пустому лагерю с таймером,
// подпись в мире рядом, настройки админки qol.campTimer/campZoom/campNear. Запуск: bun meta/camp-timer-test.ts
import { Zone } from "./zone";
import { BOARD_CFG } from "./board";
import { validatePatch } from "./overrides";
import { deadCampTarget, campCfg, campLeft, respawnTxt } from "../../src/pages/MorrisCurse/_core/ui/campTimer.js";
import { campLabelItems } from "../../src/pages/MorrisCurse/_core/ui/spawnLabels.js";
import { goalMatch } from "./biomes";
let fail = 0; const ok = (c: any, m: string) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) fail++; };
const z: any = new Zone("arinar", [], [], { proc: true, seed: 5 });
const T = Date.now();
const byCamp = new Map<number, any[]>(); for (const m of z.mobs) if (m.camp) { const a = byCamp.get(m.camp) || []; a.push(m); byCamp.set(m.camp, a); }
const [cid, ms] = [...byCamp.entries()].find(([, a]) => a.length >= 2)!;
const ty = ms[0].type;
let s0 = z.campSummary(T).find((c: any) => c[0] === cid);
ok(s0 && s0[3] === ms.length && s0[8] === 0, `живой лагерь: [8]=0 (${s0?.[3]}/${s0?.[4]})`);
for (const m of ms) z.kill(m, () => {});
const s1 = z.campSummary(T + 5000).find((c: any) => c[0] === cid);
ok(s1[3] === 0 && s1[5] === 2 && s1[8] > 0, `все убиты: состояние «пусто», до возрождения ${s1[8]} с`);
const minRa = Math.min(...ms.map((m: any) => m.respawnAt));
ok(Math.abs(s1[8] - Math.ceil((minRa - T - 5000) / 1000)) <= 1, "таймер — до БЛИЖАЙШЕГО возрождения в лагере");
const cps = [s1.slice()]; cps[0][9] = Date.now() + cps[0][8] * 1000;
ok(campLeft(cps[0]) > 0 && /^\d+:\d\d$|ч/.test(respawnTxt(campLeft(cps[0]))), "клиент: обратный отсчёт " + respawnTxt(campLeft(cps[0])));
const ctx = { world: "arinar", x: s1[1] + 300, y: s1[2], mobs: new Map(), camps: cps };
const tg = deadCampTarget(cps, (t: string) => goalMatch(ty, t), ctx, "Лагерь");
ok(tg && /возродится через/.test(tg.label) && tg.dead, "маркер задания: все мертвы → лагерь с таймером: " + tg?.label);
const live = [[...cps[0]]]; live[0][3] = 1;
ok(!deadCampTarget(live, (t: string) => goalMatch(ty, t), ctx, "Лагерь"), "есть живые — таймер не показывается (ведём к живой цели)");
const cfg = campCfg(BOARD_CFG.qol);
ok(cfg.on && cfg.zoom === 1.4 && cfg.near === 900, "настройки по умолчанию: вкл, ×1.4, 900 px");
const it = campLabelItems(cps, s1[1] + 300, s1[2], cfg);
ok(it.length === 1 && /возродится через/.test(it[0].text), "в мире рядом: " + (it[0]?.name + " / " + it[0]?.text));
ok(campLabelItems(cps, s1[1] + 5000, s1[2], cfg).length === 0, "далеко — подписи нет");
ok(campLabelItems(cps, s1[1], s1[2], campCfg({ campTimer: false })).length === 0, "админка выключила — подписей нет");
const v = validatePatch("board", "main", { "qol.campTimer": false, "qol.campZoom": 2, "qol.campNear": 1200 });
ok(typeof v === "object", "SCHEMA принимает qol.campTimer/campZoom/campNear");
ok(typeof validatePatch("board", "main", { "qol.campZoom": 50 }) === "string", "SCHEMA: приближение вне 0.5–8 — отказ");
console.log(fail ? `camp-timer: ${fail} FAIL` : "camp-timer ok"); if (fail) process.exit(1);
