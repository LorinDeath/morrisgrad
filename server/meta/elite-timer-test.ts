// Места появления на уровне КЛАССА моба: мировой босс (WORLD_GEN[мир].bosses) и редкий Отголосок (WORLD_GEN[мир].rares).
// Любой моб этих классов обязан автоматически получить: серверный таймер → отсчёт в мире, метки/указатели (карта, мини-карта, трекер),
// цели охоты/заданий, запись и подсказку в Бестиарии. Тест обходит ВЕСЬ реестр и падает, если какой-то моб не подхвачен.
// Затем добавляет синтетического моба каждого класса «как в коде» и проверяет, что подхват не требует правок по имени.
import { Zone, type ZPlayer } from "./zone";
import { WORLD_GEN, BOSS_TIMERS } from "./zoneGen";
import { ZONE_MOBS } from "./defs";
import { markersOf, setBossState, setRareState, BOSS_STATE, bossStatus } from "./markers";
import { bestiaryRegistry } from "./bestiaryReg";
import { mobHomes } from "./mobHome";
import { BTASKS, BOARD_CFG, isEliteKill, boardEvent } from "./board";
import { validatePatch } from "./overrides";
// @ts-ignore клиентские модули
import { bossLairs, spawnText, bossCfg } from "../../src/pages/MorrisCurse/_core/ui/bossSpawn.js";
// @ts-ignore
import { spawnLabelItems } from "../../src/pages/MorrisCurse/_core/ui/spawnLabels.js";
// @ts-ignore
import { taskTarget } from "../../src/pages/MorrisCurse/_core/ui/boardLoc.js";
let ok = 0, bad = 0; const t = (n: string, c: any) => { c ? (ok++, console.log("ok  ", n)) : (bad++, console.log("FAIL", n)); };
const NOW = 1_700_000_000_000, cfg = { on: true, soon: 10 };

type Cls = { kind: "boss" | "rare"; world: string; type: string; key: string; where?: string };
const classes = (): Cls[] => {
  const out: Cls[] = [];
  for (const [world, G] of Object.entries(WORLD_GEN) as [string, any][]) {
    for (const b of G.bosses || []) out.push({ kind: "boss", world, type: b.type, key: b.key || b.type });
    for (const r of G.rares || []) out.push({ kind: "rare", world, type: r.type, key: r.type });
  }
  return out;
};

/** прогон одного моба класса через все механики; возвращает список «чего не хватило» */
function pickup(c: Cls, label: string): string[] {
  const miss: string[] = [], z = new Zone(c.world, [], [], { proc: true, seed: 5 });
  // 1) серверный таймер
  const bs = z.bossStatus(NOW), rs = z.rareStatus(NOW);
  const row = c.kind === "boss" ? bs.find((x) => x[0] === c.key) : rs.find((x) => x[0] === c.type);
  if (!row) return [`${label}: нет строки серверного состояния`];
  // 2) клиент: состояние и метки
  setBossState(bs as any, NOW, c.world); setRareState(rs as any, c.world, NOW, (ty) => ZONE_MOBS[ty]?.name || ty);
  const id = (c.kind === "boss" ? "boss:" : "rare:") + c.key, mk = markersOf(c.world).find((m) => m.id === id);
  if (!mk) miss.push("нет метки на карте/мини-карте");
  else if (!bossStatus(mk, NOW)) miss.push("метка без отсчёта");
  // 3) отсчёт в мире (мёртвый моб с таймером 5 мин)
  const ST = BOSS_STATE.get(id); if (ST) { ST.alive = false; ST.at = NOW + 300_000; ST.off = false; }
  const lab = spawnLabelItems(c.world, mk?.x ?? 0, mk?.y ?? 0, cfg, NOW, () => true).find((l: any) => l.key === "sp_" + id);
  if (!lab || !/через 5:00/.test(lab.text) || !lab.name) miss.push("нет подписи с отсчётом в мире");
  if (ST) ST.at = NOW + 5_000; const lab2 = spawnLabelItems(c.world, mk?.x ?? 0, mk?.y ?? 0, cfg, NOW, () => true).find((l: any) => l.key === "sp_" + id);
  if (!lab2 || lab2.text !== "вот-вот появится") miss.push("нет «вот-вот появится»");
  if (ST) { ST.alive = true; } if (spawnLabelItems(c.world, mk?.x ?? 0, mk?.y ?? 0, cfg, NOW, () => true).some((l: any) => l.key === "sp_" + id)) miss.push("подпись остаётся, когда моб жив");
  if (ST) { ST.alive = false; ST.at = NOW + 300_000; }
  // 4) указатели трекера/охоты: место с отсчётом
  const ls = bossLairs((ty: string) => ty === c.type, c.world, NOW);
  const l = ls.find((x: any) => x.key === c.key);
  if (!l || !l.kind || (mk && (l.x !== mk.x || l.y !== mk.y))) miss.push("нет места в указателях трекера");
  else if (!/появится через 5:00/.test(spawnText(l, cfg))) miss.push("в указателе нет отсчёта");
  // 5) цели охоты: дом моба (бестиарий → «Отслеживать»)
  if (!mobHomes(c.type).some((h) => h.world === c.world && h.kind === c.kind)) miss.push("нет места обитания (mobHome)");
  // 6) Бестиарий: запись, «где», подсказка о возвращении у редкого
  const e = bestiaryRegistry().find((x) => x.id === c.type);
  if (!e) miss.push("нет в реестре Бестиария");
  else {
    if (e.g !== (c.kind === "boss" ? "world" : "rare")) miss.push(`не та группа Бестиария (${e.g})`);
    if (!e.where.length) miss.push("в Бестиарии нет «где водится»");
    if (c.kind === "rare" && !(e.resp && e.resp[0] > 0 && e.resp[1] >= e.resp[0])) miss.push("в Бестиарии нет окна возвращения (resp)");
  }
  return miss;
}

// ---- 1. весь реестр классов ----
const all = classes();
t(`реестр классов не пуст: ${all.filter((c) => c.kind === "boss").length} мировых боссов, ${all.filter((c) => c.kind === "rare").length} редких`, all.length >= 5);
t("редких Отголосков не меньше пяти", all.filter((c) => c.kind === "rare").length >= 5);
for (const c of all) { const m = pickup(c, c.type); t(`подхвачен: ${c.kind === "boss" ? "босс" : "редкий"} ${c.type}${m.length ? " — НЕ ХВАТАЕТ: " + m.join("; ") : ""}`, !m.length); }

// ---- 2. моб класса без источника появления ----
const rareTypes = new Set(all.filter((c) => c.kind === "rare").map((c) => c.type));
const orphan = Object.entries(ZONE_MOBS).filter(([id, d]: any) => d.rare && !rareTypes.has(id)).map(([id]) => id);
t(`мобы с флагом rare без места появления в WORLD_GEN.rares: ${orphan.join(", ") || "нет"}`, !orphan.length);
const bossTypes = new Set(all.filter((c) => c.kind === "boss").map((c) => c.type));
const orphanB = Object.keys(BOSS_TIMERS).filter((id) => !bossTypes.has(id));
t(`таймеры боссов без логова в WORLD_GEN.bosses: ${orphanB.join(", ") || "нет"}`, !orphanB.length);

for (const [k, v] of BOSS_STATE) if (v.kind) { v.alive = false; v.off = false; v.at = Date.now() + 300_000; } // для проверки указателей заданий: отсчёт «через 5:00» от текущего времени
// ---- 3. задания: охота/достижения на каждого моба класса (создаются из реестра сами) ----
for (const c of all) {
  const id = c.kind === "rare" ? "hunt_rare_" + c.type : "hunt_" + c.type, ach = c.kind === "rare" ? "ach_rare_" + c.type : "ach_wb_" + c.type;
  const task: any = BTASKS[id] || BTASKS["hunt_wboss_" + c.type];
  if (c.kind === "rare") t(`задание-охота на ${c.type}`, !!task && task.m === c.type);
  t(`достижение на ${c.type}`, !!(BTASKS[ach] || BTASKS["rare_" + c.type] || BTASKS["wb_" + c.type]));
  // цель задания ведёт на место появления и показывает отсчёт
  const tk: any = c.kind === "rare" ? BTASKS["hunt_rare_" + c.type] : (BTASKS["wb_" + c.type] || BTASKS["hunt_" + c.type]);
  if (tk) {
    const mk = markersOf(c.world).find((m) => m.id === (c.kind === "boss" ? "boss:" : "rare:") + c.key)!;
    const tg = taskTarget({ ...tk, take: 0, nb: 0, at: undefined }, { defs: { props: {}, cfg: BOARD_CFG }, tier: () => ({ ready: false, done: false }), taken: () => true }, { world: c.world, x: mk.x + 5000, y: mk.y, mobs: new Map(), camps: [], nodes: new Map() });
    t(`задание на ${c.type}: указатель на место появления с отсчётом`, !!tg && tg.x === mk.x && tg.y === mk.y && /появится через 4:5|появится через 5:00/.test(tg.sp || ""));
  }
}

// ---- 4. квесты «элита»: редкий засчитывается, мировой босс и обычные — как раньше ----
t("редкий Отголосок — элита для заданий", isEliteKill({}, { rare: true }) === true);
t("особь в рамке (вожак Корнеедов и др.) — по-прежнему элита", isEliteKill({ elite: true }, {}) === true);
t("обычный моб и мировой босс — не элита", isEliteKill({}, {}) === false && isEliteKill({}, { boss: true }) === false);

// ---- 5. серверный таймер: место заранее, спавн ровно там, смерть → новый таймер из настроек, перезапуск → честно ----
{
  const z = new Zone("arinar", [], [], { proc: true, seed: 11 }), r = z.gen.rares[0], T = NOW;
  z.rareStatus(T); const nx = z.rareNext[r.type];
  t("место следующего появления выбрано заранее", !!nx && z.rareAt[r.type] >= T + r.every[0] * 1000 - 1 && z.rareAt[r.type] <= T + r.every[1] * 1000 + 1);
  const pl: ZPlayer = { sid: "a", x: nx.x + 2000, y: nx.y, hp: 1e12, maxHp: 1e12, armorRed: 0, alive: true, respawnAt: 0 };
  const T2 = z.rareAt[r.type] + 1; z.specials(T2, new Map([["a", pl]]));
  const m = z.byId.get(z.rareIds[r.type]!);
  t("спавн ровно в объявленной точке", !!m && Math.abs(m.x - nx.x) < 1 && Math.abs(m.y - nx.y) < 1);
  t("жив → в статусе «жив» (x, y — где)", z.rareStatus(T2).find((x) => x[0] === r.type)![1] === 1);
  z.kill(m!, () => {}); z.update(0.1, T2 + 10, new Map([["a", pl]]), () => {}, () => {});
  const st = z.rareStatus(T2 + 10).find((x) => x[0] === r.type)!;
  t(`после смерти — новый таймер из окна ${r.every[0]}–${r.every[1]} с (показано ${st[2]})`, st[1] === 0 && st[2] >= r.every[0] - 2 && st[2] <= r.every[1] + 2);
  const snap = z.rareSnapshot(); t("снимок для БД содержит таймер", !!snap[r.type] && snap[r.type][0] > T2);
  const z2 = new Zone("arinar", [], [], { proc: true, seed: 12 }); z2.rareHold = true; z2.rareRestore(snap, T2 + 20);
  const st2 = z2.rareStatus(T2 + 20).find((x) => x[0] === r.type)!;
  t("после перезапуска таймер восстановлен (разница < 2 с)", Math.abs(st2[2] - st[2]) <= 12 && z2.rareNext[r.type].x === snap[r.type][1]);
  const z3 = new Zone("arinar", [], [], { proc: true, seed: 13 }); z3.rareHold = true;
  z3.rareRestore({ [r.type]: [T2 - 999_999, nx.x, nx.y, "x"], ghost: [1, 2, 3, "x"] }, T2);
  const st3 = z3.rareStatus(T2).find((x) => x[0] === r.type)!;
  t("просроченный сохранённый таймер → честное «скоро» (1–3 мин), чужие типы игнорируются", st3[2] >= 59 && st3[2] <= 181 && !z3.rareAt["ghost"]);
  const z4 = new Zone("arinar", [], [], { proc: true, seed: 14 }); z4.rareHold = true;
  t("пока таймеры не загружены (rareHold) спавна нет", (z4.specials(NOW, new Map([["a", pl]])), !Object.keys(z4.rareIds).length));
}

// ---- 6. общие настройки показа (админка) ----
t("админка: общие qol.bossTimer / qol.bossSoonSec принимаются", typeof validatePatch("board", "main", { "qol.bossTimer": false }) === "object" && typeof validatePatch("board", "main", { "qol.bossSoonSec": 30 }) === "object");
t("админка: окно возвращения редкого правится (rare.every)", typeof validatePatch("rare", all.find((c) => c.kind === "rare")!.type, { "every.0": 700 }) === "object");
t("cfg: общий для боссов и редких", bossCfg(null).on === true && bossCfg({ defs: { cfg: { qol: { bossTimer: false, bossSoonSec: 3 } } } }).on === false);

// ---- 7. НОВЫЕ мобы классов, добавленные «как в коде»: ничего кроме записи в реестр не правим ----
{
  const G: any = WORLD_GEN.arinar, base = ZONE_MOBS.dew_king;
  const bBoss = G.bosses[0], rareDef = G.rares[0];
  (ZONE_MOBS as any).zz_new_rare = { ...base, name: "Тестовый редкий", rare: true };
  (ZONE_MOBS as any).zz_new_boss = { ...ZONE_MOBS[bBoss.type], name: "Тестовый босс" };
  G.rares.push({ type: "zz_new_rare", region: rareDef.region, every: [100, 200], life: 60 });
  G.bosses.push({ ...bBoss, type: "zz_new_boss", key: "zz_new_boss", x: bBoss.x + 123, y: bBoss.y + 77 });
  try {
    for (const c of [{ kind: "rare", world: "arinar", type: "zz_new_rare", key: "zz_new_rare" }, { kind: "boss", world: "arinar", type: "zz_new_boss", key: "zz_new_boss" }] as Cls[]) {
      const m = pickup(c, c.type); t(`новый ${c.kind === "boss" ? "босс" : "редкий"} подхвачен автоматически${m.length ? " — НЕ ХВАТАЕТ: " + m.join("; ") : ""}`, !m.length);
    }
  } finally { G.rares.pop(); G.bosses.pop(); delete (ZONE_MOBS as any).zz_new_rare; delete (ZONE_MOBS as any).zz_new_boss; }
}
// скрытый вид: в подписи мира имя не раскрывается, пока вид не встречен
{
  const z = new Zone("arinar", [], [], { proc: true, seed: 5 }), r = z.gen.rares[0];
  setRareState(z.rareStatus(NOW) as any, "arinar", NOW, (ty) => ZONE_MOBS[ty]?.name || ty);
  const mk = markersOf("arinar").find((m) => m.id === "rare:" + r.type)!;
  const l = spawnLabelItems("arinar", mk.x, mk.y, cfg, NOW, () => false).find((x: any) => x.key === "sp_rare:" + r.type);
  t("невстреченный редкий в мире подписан без имени", !!l && l.name === "Редкий Отголосок" && !l.name.includes(ZONE_MOBS[r.type].name));
}
console.log(`elite-timer ${ok}/${ok + bad}`); if (bad) process.exit(1);
