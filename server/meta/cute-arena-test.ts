// Победа над отражением Кьют («Испытание отражений»): засчитывается заданиям, доске, Бестиарию, в том числе быстрая (< 10 с);
// кап здоровья 25% / 30% / 50%; поражения и повторы не засчитываются; повторяющиеся и связанные задания не ломаются.
import { MetaService } from "./service";
import { REWARD_RULES } from "./shared";
import { newAccount, newHero, acceptQuest, questComplete } from "./profile";
import { BTASKS, boardOf, boardRefresh } from "./board";
let f = 0; const ok = (c: any, m: string, x?: any) => { console.log((c ? "PASS " : "FAIL ") + m + (!c && x !== undefined ? " " + JSON.stringify(x) : "")); if (!c) f++; };
const P: any = (MetaService as any).prototype;

ok(REWARD_RULES.duel.minWinSec > 1.5 && REWARD_RULES.duel.minWinSec < 10, "порог победы больше, чем появление отражения (1,5 с), и меньше прежних 10 с");

/** один «сервер» на тест: свой аккаунт, герой, окно забега в комнате duel; бой длится sec секунд реального времени */
function mk() {
  const a: any = newAccount(); a.hero = "warrior"; const h: any = newHero("warrior"); h.lvl = 20;
  const ctx0 = { pkey: "uid:cute" }; boardRefresh(a, h, ctx0);
  const sent: any[] = [], sess: any = { id: "s1", stats: { classId: "warrior" }, runRoom: "duel", world: "hellfire" };
  const ms: any = { pkey: "uid:cute", run: { room: "duel", at: Date.now() - 60000, maxMembers: 1 }, dirty: false, zp: {} };
  const svc: any = Object.create(P);
  svc.ms = new Map([["s1", ms]]);
  svc.store = { account: () => a, hero: () => h, heroMap: () => ({ warrior: h }), recordRun: async () => true, audit() {} };
  svc.send = (_ws: any, m: any) => sent.push(m); svc.push = (_ws: any, _s: any, m: any) => sent.push(m);
  svc.boardSoon = () => {}; svc.sessionLookup = undefined;
  const fight = async (sec: number, o: any = {}) => {
    ms.run = { room: "duel", at: Date.now() - sec * 1000, maxMembers: 1 };
    const before = sent.length;
    await svc.runResult({} as any, sess, { time: sec, kills: { kyut_mirror: 1 }, won: true, hpCapPct: 100, room: "duel", ...o }, { runMembers: () => [sess] });
    return sent.slice(before).find((m) => m.reward)?.reward;
  };
  return { a, h, svc, fight, ms };
}
const wins = (a: any) => boardOf(a).p.ach_duel_win | 0, duels = (a: any) => boardOf(a).p.ach_duels | 0;

(async () => {
  // 1) быстрая победа (3–9 с) — как обычная
  for (const sec of [3, 5, 9.5]) {
    const { a, fight } = mk(); const r = await fight(sec);
    ok(wins(a) === 1 && duels(a) === 1, `победа за ${sec} с: достижения «Дуэлянт» и «Завсегдатай арены» засчитаны`, boardOf(a).p);
    ok(a.bestiary?.kyut_mirror?.kills === 1, `победа за ${sec} с: «Отражение Кьют» в Бестиарии`);
    ok(r && r.xp === 0, `победа за ${sec} с: опыт за бой как раньше (до 10 с без опыта)`, r);
  }
  // 2) обычная победа: опыт и счётчики
  { const { a, fight } = mk(); const r = await fight(25);
    ok(wins(a) === 1 && duels(a) === 1 && r.xp === REWARD_RULES.duel.winXp, "победа за 25 с: счётчики и опыт победы", r); }
  // 3) слишком быстро (раньше появления отражения), поражение, нет «won» — победой не считаются
  { const { a, fight } = mk(); await fight(2.5); ok(wins(a) === 0 && duels(a) === 0, "победа за 2,5 с (отражение ещё не вышло) — не засчитана"); }
  { const { a, fight } = mk(); const r = await fight(30, { won: false, kills: {} }); ok(wins(a) === 0 && duels(a) === 1 && r.xp === REWARD_RULES.duel.lossXp, "поражение 30 с: победа не засчитана, дуэль сыграна, опыт поражения", r); }
  { const { a, fight } = mk(); await fight(6, { won: false, kills: {} }); ok(wins(a) === 0 && duels(a) === 0, "короткое поражение — ничего"); }
  // 4) серверные часы: клиент не может выдать победу за 30 с, если в комнате прошло 4 с
  { const { a, ms, svc } = mk(); ms.run = { room: "duel", at: Date.now() - 500, maxMembers: 1 };
    await svc.runResult({} as any, { id: "s1", stats: { classId: "warrior" }, runRoom: "duel", world: "hellfire" }, { time: 30, kills: { kyut_mirror: 1 }, won: true, room: "duel" }, { runMembers: () => [] });
    ok(wins(a) === 0, "время клиента ограничено часами сервера (0,5 с в комнате → 2,5 с < порога, победа не засчитана)"); }
  // 5) повторы: каждый забег — один раз; повторный результат того же окна отклоняется (recordRun)
  { const { a, svc, fight } = mk(); let n = 0; svc.store.recordRun = async () => n++ === 0;
    await fight(12); await fight(12); ok(wins(a) === 1 && duels(a) === 1, "повтор результата того же забега не удваивает счётчики"); }
  { const { a, fight } = mk(); for (let i = 0; i < 3; i++) await fight(6); ok(wins(a) === 3, "три отдельные быстрые победы = 3"); }
  // 6) задания с капом здоровья: «Дуэль с четвертью ОЗ» (≤25), «с половиной» (≤50), экзамен (≤30)
  { const { a, h, fight } = mk(); const b = boardOf(a);
    ok(BTASKS.hard_duel25?.ev === "duel_win" && BTASKS.hard_duel25.m === "hp25" && BTASKS.hard_duel50?.m === "hp50", "в данных есть задания с капом 25% и 50%");
    b.sel.hard = [...new Set([...(b.sel.hard || []), "hard_duel25", "hard_duel50"])]; // «выпали» в этот период
    await fight(8, { hpCapPct: 50 }); const p50 = b.p.hard_duel50 | 0, p25a = b.p.hard_duel25 | 0;
    await fight(8, { hpCapPct: 30 }); const p25b = b.p.hard_duel25 | 0;
    await fight(8, { hpCapPct: 25 }); const p25c = b.p.hard_duel25 | 0;
    ok(p25a === 0 && p25b === 0 && p25c === 1, "кап 50% и 30% не засчитывают «четверть ОЗ», кап 25% — засчитывает", { p25a, p25b, p25c });
    ok(p50 === 1 && (b.p.hard_duel50 | 0) === 3, "«с половиной ОЗ»: кап 50/30/25% подходит (все ≤ 50)", { p50, now: b.p.hard_duel50 }); }
  // 7) связанный сюжетный квест Лэйр (★ Не чувствуя: победа с 50% ОЗ) и экзамен (30%): считаются от быстрой победы
  { const { a, h, fight } = mk(); a.quests.done.push("l4_boss");
    ok(acceptQuest(a, "sl_y3", h).ok, "квест «★ Не чувствуя» взят");
    await fight(6, { hpCapPct: 100 }); ok(!questComplete(a, "sl_y3"), "победа без капа задание с 50% не закрывает");
    await fight(6, { hpCapPct: 50 }); ok(questComplete(a, "sl_y3"), "быстрая победа с капом 50% закрывает «★ Не чувствуя»"); }
  { const { a, h, fight } = mk(); a.quests.active.sl_exam = { p: [0, 0] };
    await fight(7, { hpCapPct: 25 }); ok((a.quests.active.sl_exam.p[0] | 0) === 1, "экзамен: победа с капом 25% подходит под условие «30% здоровья»"); }
  // 8) другие виды забегов не задеты: обычный забег не даёт «победу в дуэли»
  { const { a, ms, svc } = mk(); const s2: any = { id: "s1", stats: { classId: "warrior" }, runRoom: "crypt", world: "hellfire" };
    ms.run = { room: "crypt", at: Date.now() - 20000, maxMembers: 1 };
    await svc.runResult({} as any, s2, { time: 20, kills: { imp: 3 }, won: true, room: "crypt" }, { runMembers: () => [s2] });
    ok(wins(a) === 0 && duels(a) === 0, "обычный забег не засчитывается как победа/дуэль"); }
  console.log(f ? `\nFAIL ${f}` : "\nALL OK"); process.exit(f ? 1 : 0);
})();
