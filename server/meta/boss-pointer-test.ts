// Мировые боссы: состояние логов для трекера/охоты/заданий (жив / таймер / выключен) и выбор цели указателя
import { Zone, type ZPlayer } from "./zone";
import { BOSS_TIMERS } from "./zoneGen";
import { BOARD_CFG } from "./board";
import { validatePatch } from "./overrides";
import { BOSS_STATE, setBossState, markersOf } from "./markers";
// @ts-ignore клиентский модуль
import { bossCfg, bossLairs, pickLair, spawnText, lairTarget, fmtLeft } from "../../src/pages/MorrisCurse/_core/ui/bossSpawn.js";
let ok = 0, bad = 0; const t = (n: string, c: any) => { c ? (ok++, console.log("ok  ", n)) : (bad++, console.log("FAIL", n)); };

// --- сервер: bossStatus отдаёт «выключен в локации» ---
const z = new Zone("arinar", [], [], { proc: true, seed: 3 });
const b = z.gen.bosses[0]; const now = Date.now();
let st = z.bossStatus(now).find((x) => x[0] === (b.key || b.type))!;
t("статус: пятый элемент — выключен = 0 по умолчанию", st.length === 5 && st[4] === 0);
const reg = z.gen.regions.find((r) => b.x >= r.rect[0] && b.x < r.rect[2] && b.y >= r.rect[1] && b.y < r.rect[3]);
if (reg) { (reg as any).bossOn = false; st = z.bossStatus(now).find((x) => x[0] === (b.key || b.type))!; t("статус: босс выключен в локации → 1", st[4] === 1); (reg as any).bossOn = undefined; }
else t("у логова есть регион", false);
// таймер = реальный (через сколько появится)
const pl: ZPlayer = { sid: "a", x: b.x + 400, y: b.y, hp: 1e12, maxHp: 1e12, armorRed: 0, alive: true, respawnAt: 0 };
const T = Date.now() + 99 * 3600e3; z.bossAt[b.key!] = T - 1; z.specials(T, new Map([["a", pl]]));
const bm = z.byId.get(z.bossIds[b.key!])!; z.kill(bm, () => {}); z.update(0.1, T + 10, new Map([["a", pl]]), () => {}, () => {});
st = z.bossStatus(T + 10).find((x) => x[0] === b.key)!;
t(`после смерти таймер = every из админки (${st[2]} с ≈ ${BOSS_TIMERS[b.type].every})`, st[1] === 0 && Math.abs(st[2] - BOSS_TIMERS[b.type].every) <= 2);

// --- настройки показа: БД/админка — источник, умолчания нейтральные ---
t("умолчание: показ таймера включён, «появляется» за 10 с", (BOARD_CFG.qol as any).bossTimer === true && (BOARD_CFG.qol as any).bossSoonSec === 10);
t("админка: qol.bossTimer принимается", typeof validatePatch("board", "main", { "qol.bossTimer": false }) === "object");
t("админка: qol.bossSoonSec 500 отклонён", typeof validatePatch("board", "main", { "qol.bossSoonSec": 500 }) === "string");
t("cfg без данных → включено", bossCfg(null).on === true && bossCfg(null).soon === 10);
t("cfg: выключено админкой", bossCfg({ defs: { cfg: { qol: { bossTimer: false, bossSoonSec: 3 } } } }).on === false && bossCfg({ defs: { cfg: { qol: { bossSoonSec: 3 } } } }).soon === 3);

// --- клиент: выбор логова и текст ---
const all = markersOf("arinar", "boss"); t(`маркеры логов есть (${all.length})`, all.length >= 2);
const [A, B] = all; const type = (k: string) => z.gen.bosses.find((x) => "boss:" + (x.key || x.type) === k)!.type;
const T0 = 1_000_000;
setBossState([[A.id.slice(5), 0, 252, type(A.id), 0], [B.id.slice(5), 0, 40, type(B.id), 0]], T0);
const ctx = { x: A.x, y: A.y };
let ls = bossLairs(() => true, "arinar", T0);
t("логова с таймерами", ls.length >= 2 && ls.find((l: any) => l.key === A.id.slice(5)).left === 252);
let pk = pickLair(ls.filter((l: any) => l.key === A.id.slice(5) || l.key === B.id.slice(5)), ctx);
t("мёртвые оба: берём то, что появится раньше (не ближайшее статичное)", pk.key === B.id.slice(5));
const cfg = { on: true, soon: 10 };
t("текст «появится через 4:12»", spawnText({ alive: false, left: 252 }, cfg) === "Босс появится через 4:12" && fmtLeft(3725) === "1:02:05");
t("текст «появляется» у порога", spawnText({ alive: false, left: 8 }, cfg) === "Босс появляется" && spawnText({ alive: false, left: 0 }, cfg) === "Босс появляется");
setBossState([[A.id.slice(5), 1, 0, type(A.id), 0]], T0);
ls = bossLairs(() => true, "arinar", T0); pk = pickLair(ls.filter((l: any) => l.key === A.id.slice(5) || l.key === B.id.slice(5)), { x: B.x, y: B.y });
t("живой босс важнее ближайшего мёртвого", pk.key === A.id.slice(5) && spawnText(pk, cfg) === "Босс жив");
setBossState([[A.id.slice(5), 0, 100, type(A.id), 1]], T0);
t("выключенный в локации босс не становится целью", !bossLairs(() => true, "arinar", T0).some((l: any) => l.key === A.id.slice(5)));
setBossState([[A.id.slice(5), 0, 100, type(A.id), 0]], T0);
const lt = lairTarget(pickLair(bossLairs((ty: string) => ty === type(A.id), "arinar", T0).filter((l: any) => l.key === A.id.slice(5)), ctx), "Босс", cfg, { mob: 1 });
t("цель: подпись и sp с таймером, координаты логова", lt.label === "Босс · появится через 1:40" && lt.sp === "Босс появится через 1:40" && lt.x === A.x && lt.y === A.y);
t("показ выключен админкой → без таймера в подписи", !lairTarget({ ...pickLair(bossLairs(() => true, "arinar", T0), ctx) }, "Босс", { on: false, soon: 10 }).sp);
t("в другом мире логов нет (портал — старой логикой)", bossLairs(() => true, "hellfire", T0).length === 0);
console.log(`boss-pointer ${ok}/${ok + bad}`); if (bad) process.exit(1);
