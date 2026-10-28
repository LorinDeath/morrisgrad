// Сундуки за квесты (по типу / свои / ветки), шанс улучшения яруса, выбор в диалоге, повторяемые квесты после сюжета,
// черновики сюжетного редактора (custom_quests enabled=2) и проверка графа диалога. Запуск: cd server && bun meta/quest-chest-test.ts
import { Database } from "bun:sqlite";
import { AdminStore, validateQuest, questBranchErr } from "./admin";
import { QUEST_BY_ID, QUESTS, setCustomQuests, questType } from "./quests";
import { newAccount, newHero, acceptQuest, turnInQuest, questChoose, questAvailable, questLockReason, questChestSpec, questRewardsFor, setQuestPeriod } from "./profile";
import { BCHEST, upTier, upView, qdefSpec, effSpec, specView } from "./boardChestCfg";
import { chestsOf } from "./boardChest";
import { dialogueGraphErr, validateDialogue } from "./vnChars";
import { validMsg } from "./service";
import "./board"; // подставляет период доски (день/неделя по Киеву) для повторяемых квестов
let f = 0; const ok = (c: any, m: string, x?: any) => { console.log((c ? "PASS " : "FAIL ") + m + (c || x === undefined ? "" : " " + JSON.stringify(x))); if (!c) f++; };
const seq = (...v: number[]) => { let i = 0; return () => v[i++ % v.length]; };

// --- 1. бросок улучшения
ok(upTier("common", 15, 3, seq(0.01)) === "rare", "r=1 < u2=3 → сразу на 2 яруса (простой → редкий)");
ok(upTier("common", 15, 3, seq(0.10)) === "uncommon", "r=10 < u2+u=18 → на 1 ярус");
ok(upTier("common", 15, 3, seq(0.5)) === "common", "r=50 — без улучшения");
ok(upTier("black", 100, 100, seq(0)) === "black", "выше «Чёрного» не бывает");
ok(upTier("divine", 0, 50, seq(0.1)) === "black", "у «Божественного» +2 упирается в потолок → +1");
{ const v = upView("common", 15, 3); ok(v.length === 2 && v[0].p === 15 && v[1].p === 3 && v[0].n === BCHEST.tiers.uncommon.name, "вид: «шанс улучшиться до Добротного 15 %, до Редкого 3 %»", v); }
{ let n = 0; const N = 20000; for (let i = 0; i < N; i++) if (upTier("common", 20, 0, Math.random) !== "common") n++; ok(Math.abs(n / N - 0.2) < 0.02, `частота улучшения ≈ 20 %: ${(n / N * 100).toFixed(1)} %`); }

// --- 2. умолчания по типам и наследование
ok(qdefSpec("hunt").length === 1 && qdefSpec("daily").length === 0, "охота — сундук по типу, ежедневное доски — сундук ранга (n=0)");
ok(BCHEST.rankChest?.hunt === false, "случайный сундук ранга у охоты выключен (сундук — по типу задания)");
ok(effSpec([{ n: 2, t: "rare", c: "no" }], false, "hunt")[0].t === "rare" && effSpec(null, true, "hunt").length === 0, "свой список важнее типа, «без сундука» — пусто");
const story = QUESTS.find((q) => q.campaign === "leyr")!;
ok(questType(story) === "story" && questChestSpec(null, story)[0]?.t === BCHEST.qdef.story.t, "сюжетный квест наследует сундук типа «Сюжет»: " + story.id);
BCHEST.qdef.story.u = 40; ok(specView(questChestSpec(null, story))[0].up[0].p === 40, "правка умолчания типа (админка) сразу видна в квесте"); BCHEST.qdef.story.u = 15;
ok(!!QUESTS.find((q) => q.campaign === "prologue") && questType(QUESTS.find((q) => q.campaign === "prologue")!) === "prologue", "старые квесты: тип определяется без правок данных");

// --- 3. квест с выбором: награда по ветке
const base = { npc: "petr", title: "Выбор Петра", offer: ["a"], done: ["b"], objectives: [{ type: "level", count: 1, text: "x" }] };
const qa: any = validateQuest({ ...base, id: "c_choice", rewards: { xp: 10, ch: [{ n: 1, t: "common", c: "no", u: 100 }],
  alt: { spare: { name: "Пощадить", xp: 50, ch: [{ n: 1, t: "rare", c: "no" }] }, kill: { name: "Казнить", items: [] } } } });
ok(typeof qa !== "string" && qa.rewards.alt.spare.xp === 50 && qa.rewards.ch[0].u === 100, "квест с наградами веток и u сохраняется", qa);
const qd: any = validateQuest({ ...base, id: "c_daily_after", title: "Убей пятерых", repeat: "daily", reqBranch: [{ q: "c_choice", k: "spare" }], requires: [] });
ok(typeof qd === "string", "нельзя сослаться на ещё не созданный квест (по id)");
setCustomQuests([qa]);
const qd2: any = validateQuest({ ...base, id: "c_daily_after", title: "Убей пятерых", repeat: "daily", reqBranch: [{ q: "c_choice", k: "spare" }],
  objectives: [{ type: "kill", mob: "golem", count: 5, text: "Убей пятерых" }], rewards: { xp: 5 } });
ok(typeof qd2 !== "string" && qd2.repeat === "daily" && qd2.reqBranch[0].k === "spare", "ежедневный после ветки сохраняется", qd2);
ok(typeof validateQuest({ ...base, id: "c_x", repeat: "hourly", rewards: {} }) === "string", "повтор только daily/weekly");
ok(typeof validateQuest({ ...base, id: "c_x", rewards: { alt: { "Bad key": {} } } }) === "string", "ключ ветки — латиница");
const dlg = { offer: [{ who: "petr", emo: "calm", text: "Что с ним сделать?", ch: [{ t: "Пощадить", k: "spare", go: "sp" }, { t: "Казнить", k: "kill", go: "kl" }] },
  { id: "sp", who: "petr", emo: "joy", text: "Милосердно.", go: "end" }, { id: "kl", who: "petr", emo: "sad", text: "Жёстко." }], done: [{ who: "petr", emo: "calm", text: "Готово" }] };
const vd: any = validateDialogue(dlg); ok(typeof vd !== "string", "диалог с ветками проходит проверку", vd);
ok(!questBranchErr(qa, vd), "ключи наград веток есть в выборах диалога");
ok(!!questBranchErr(qa, { offer: [{ who: "petr", emo: "calm", text: "x" }], done: [] } as any), "награда ветки без выбора в диалоге → ошибка");
ok(/несуществующей метке/.test(String(dialogueGraphErr([{ who: "petr", emo: "calm", text: "x", ch: [{ t: "a", go: "nope" }, { t: "b" }] }] as any, "offer"))), "висячая ветка → «ведёт к несуществующей метке»");
ok(/недостижимы/.test(String(dialogueGraphErr([{ who: "petr", emo: "calm", text: "x", go: "end" }, { who: "petr", emo: "calm", text: "y" }] as any, "offer"))), "недостижимое окно → сообщение");
ok(/зациклен/.test(String(dialogueGraphErr([{ id: "a", who: "petr", emo: "calm", text: "x", go: "a" }] as any, "offer"))), "цикл без выхода → сообщение");

setCustomQuests([qa, qd2]);
const a: any = newAccount(), W: any = newHero("warrior"); W.lvl = 5; a.hero = "warrior"; a.heroes = { warrior: W };
ok(!questAvailable(a, QUEST_BY_ID.c_daily_after, W) && /Выбор Петра.*Пощадить/.test(String(questLockReason(a, QUEST_BY_ID.c_daily_after, W))), "ежедневный закрыт до выбора: " + questLockReason(a, QUEST_BY_ID.c_daily_after, W));
ok(acceptQuest(a, "c_choice", W).ok && questChoose(a, "c_choice", "spare").ok, "квест взят, выбрано «Пощадить»");
ok(questRewardsFor(a, QUEST_BY_ID.c_choice).xp === 50 && questChestSpec(a, QUEST_BY_ID.c_choice)[0].t === "rare", "награда ветки: 50 опыта и редкий сундук");
const n0 = chestsOf(a).list.length; const r: any = turnInQuest(a, W, "c_choice");
ok(r.ok && r.rewards.xp === 50 && r.rewards.br === "spare" && r.rewards.chests?.[0]?.tier !== "common" && chestsOf(a).list.length === n0 + 1, "сдача: награда ветки + сундук (бросок на сервере)", r.rewards);
ok(!questChoose(a, "c_choice", "kill").ok, "после сдачи выбор не меняется");
ok(questAvailable(a, QUEST_BY_ID.c_daily_after, W), "после ветки «Пощадить» открылся ежедневный");
{ const b: any = newAccount(); b.quests.done.push("c_choice"); b.quests.br = { c_choice: "kill" }; ok(!questAvailable(b, QUEST_BY_ID.c_daily_after, null), "другая ветка («Казнить») ежедневный не открывает"); }
// повторяемость: период подставляем вручную
let P = "d100"; setQuestPeriod(() => P);
acceptQuest(a, "c_daily_after", W); a.quests.active.c_daily_after.p = [5];
const r2: any = turnInQuest(a, W, "c_daily_after"); ok(r2.ok && r2.rewards.chests?.length === 1, "ежедневный сдан, сундук по типу «Повторяемый: ежедневный»", r2.rewards);
ok(!questAvailable(a, QUEST_BY_ID.c_daily_after, W) && /завтра/.test(String(questLockReason(a, QUEST_BY_ID.c_daily_after, W))), "сегодня повторно нельзя: " + questLockReason(a, QUEST_BY_ID.c_daily_after, W));
P = "d101"; ok(questAvailable(a, QUEST_BY_ID.c_daily_after, W), "новый день (сброс как у доски) — снова доступен");
ok(a.quests.done.filter((x: string) => x === "c_daily_after").length === 1, "done без дублей при повторах");
{ const z: any = newAccount(); const W2: any = newHero("warrior"); z.hero = "warrior"; chestsOf(z).list = Array.from({ length: Math.max(1, BCHEST.maxStore | 0 || 100) }, (_, i) => ({ id: 9000 + i, tier: "common" } as any));
  const ac = acceptQuest(z, "c_choice", W2); const r3: any = turnInQuest(z, W2, "c_choice"); ok(!r3.ok && !!z.quests.active.c_choice, "хранилище сундуков полно — квест не сдаётся и не теряется: " + r3.err, { ac, r3 }); }

// --- 4. черновики (без новой таблицы: custom_quests id draft:<id>, enabled=2)
function d1() {
  const db = new Database(":memory:");
  db.exec(`CREATE TABLE game_overrides (kind TEXT NOT NULL, id TEXT NOT NULL, data TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 1, updated_by TEXT, updated_at INTEGER, PRIMARY KEY (kind, id));
    CREATE TABLE game_override_audit (aid INTEGER PRIMARY KEY AUTOINCREMENT, kind TEXT, target_id TEXT, before TEXT, after TEXT, version INTEGER, granted_by TEXT, at INTEGER);
    CREATE TABLE game_config_version (k TEXT PRIMARY KEY, v INTEGER NOT NULL DEFAULT 0); INSERT INTO game_config_version VALUES ('overrides', 1);
    CREATE TABLE custom_quests (id TEXT PRIMARY KEY, data TEXT, enabled INTEGER, version INTEGER, updated_by TEXT, updated_at INTEGER);
    CREATE TABLE quest_dialogues (quest_id TEXT PRIMARY KEY, data TEXT, version INTEGER, updated_by TEXT, updated_at INTEGER);`);
  const stmt = (sql: string, args: any[] = []) => ({ bind: (...x: any[]) => stmt(sql, x), first: async () => db.query(sql).get(...args) ?? null,
    all: async () => ({ results: db.query(sql).all(...args) }), run: async () => { db.query(sql).run(...args); return { success: true }; }, _run: () => db.query(sql).run(...args) });
  return { raw: db, prepare: (sql: string) => stmt(sql), batch: async (st: any[]) => { db.transaction(() => st.forEach((s) => s._run()))(); return []; } };
}
(async () => {
  const D = d1(), A = new AdminStore(D); await A.sync(true);
  const meta = { ...base, id: "c_saga", title: "Сага", chapter: "Глава 1", card: { on: true, t: "Глава I", s: "Пепел" }, rewards: { xp: 1, alt: { a: { name: "Путь А", xp: 9 } } } };
  ok((await A.draftSave("t", { id: "c_saga", meta })).ok, "черновик: сохранены поля квеста");
  for (let i = 0; i < 200; i += 50) { const wins = Array.from({ length: 50 }, (_, j) => ({ ph: "offer", i: i + j, w: { who: "petr", emo: "calm", text: "окно " + (i + j + 1) } }));
    const r = await A.draftSave("t", { id: "c_saga", wins }); if (!r.ok) ok(false, "черновик: окна " + i, r); }
  const g: any = await A.draftGet("c_saga"); ok(g.draft?.d.offer.length === 200 && g.draft.d.offer[199].text === "окно 200", "200 окон сохранены по частям");
  ok(!QUEST_BY_ID.c_saga, "черновик игрокам не виден (живого квеста нет)");
  ok((await A.draftList()).some((x: any) => x.id === "c_saga"), "список черновиков");
  const p1: any = await A.draftPublish("t", "c_saga"); ok(!p1.ok && /не опубликовано/.test(p1.err), "публикация без окна сдачи → понятная ошибка: " + p1.err);
  await A.draftSave("t", { id: "c_saga", wins: [{ ph: "offer", i: 0, w: { who: "petr", emo: "calm", text: "Начало", ch: [{ t: "Путь А", k: "a", go: "zz" }, { t: "Иначе" }] } }, { ph: "done", i: 0, w: { who: "petr", emo: "joy", text: "Конец" } }] });
  const p2: any = await A.draftPublish("t", "c_saga"); ok(!p2.ok && /несуществующей метке «zz»/.test(p2.err), "висячая ветка не публикуется: " + p2.err);
  await A.draftSave("t", { id: "c_saga", wins: [{ ph: "offer", i: 1, w: { id: "zz", who: "petr", emo: "calm", text: "окно 2" } }] });
  const p3: any = await A.draftPublish("t", "c_saga"); ok(p3.ok && QUEST_BY_ID.c_saga?.card?.t === "Глава I", "опубликовано: квест живой, карточка главы", p3.err);
  ok(!(await A.draftGet("c_saga")).draft, "после публикации черновик закрыт (enabled=3)");
  await A.draftSave("t", { id: "c_saga", meta: { ...meta, title: "Сага (правка)" } }); ok(QUEST_BY_ID.c_saga.title === "Сага", "новый черновик не трогает живой квест");
  await A.draftDiscard("t", "c_saga"); ok(!(await A.draftGet("c_saga")).draft && QUEST_BY_ID.c_saga.title === "Сага", "черновик удалён, живой квест цел");
  const B = new AdminStore(D); await B.sync(true); ok(QUEST_BY_ID.c_saga && !QUEST_BY_ID["draft:c_saga"], "после перезагрузки: живой квест есть, черновиков среди квестов нет");
  ok(validMsg({ t: "quest_choice", id: "c_choice", ph: "offer", wi: 0, ci: 1 }) && validMsg({ t: "admin_qdraft_save", id: "c_saga", wins: [] }), "сообщения quest_choice / admin_qdraft_save проходят схему");
  console.log(f ? `FAILED ${f}` : "quest-chest ok"); if (f) process.exit(1);
})();
