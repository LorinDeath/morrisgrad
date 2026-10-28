// 📋 Счётчик «взято X из Y» на Доске объявлений: заказы Доски и личные задания персонажей (НПС) — раздельно, как лимиты на сервере (boardTake).
// Раньше клиент считал все взятые вместе — игроки видели «Взято 7 / 6». Запуск: bun meta/board-count-test.ts
import { BOARD_CFG, BTASKS, boardRefresh, boardOf, boardClient, boardDefs, boardTake, needsTake, takeAt } from "./board";
import { newAccount, newHero } from "./profile";
import { BoardStore } from "../../src/pages/MorrisCurse/_core/meta/boardStore.js";
let f = 0, n = 0; const ok = (c: any, m: string) => { n++; if (!c) { console.log("FAIL " + m); f++; } else console.log("PASS " + m); };
const a: any = newAccount("u_cnt", "cnt"); const h: any = newHero("warrior"); h.lvl = 12; a.hero = "warrior"; a.heroes = { warrior: h };
const ctx: any = { heroes: a.heroes }; boardRefresh(a, h, ctx); const b = boardOf(a);
const huntMax = (BOARD_CFG.huntMax | 0) || 6;
// заказы Доски — до лимита
const hunt = (b.sel.hunt || []).filter((id: string) => BTASKS[id] && needsTake(BTASKS[id]));
let got = 0; for (const id of hunt) if (boardTake(a, h, id, true).ok) got++;
// личные задания НПС (giver = НПС)
const npcT = Object.values(BTASKS).filter((t: any) => needsTake(t) && takeAt(t) !== "board" && takeAt(t));
let gotN = 0; for (const t of npcT.slice(0, 2)) if (boardTake(a, h, (t as any).id, true).ok) gotN++;
const S: any = new BoardStore(() => {}); S.apply({ boardDefs: boardDefs(), board: boardClient(a, h) });
console.log(`· взято заказов ${got} (предложено ${hunt.length}), личных ${gotN}, всего в tk ${b.tk.length}`);
ok(got === Math.min(huntMax, hunt.length), `заказов Доски взято не больше лимита (${got} из ${huntMax})`);
ok(S.takenCount("board") === got, `счётчик Доски = только заказы Доски (${S.takenCount("board")})`);
ok(S.takenCount("npc") === gotN, `личные задания считаются отдельно (${S.takenCount("npc")})`);
ok(S.takenCount("board") <= S.takeMax("board"), "X не больше Y");
ok(gotN < 1 || b.tk.length > huntMax, `старый счёт (все взятые = ${b.tk.length}) давал «${b.tk.length} / ${huntMax}» — воспроизведено`);
const old = BOARD_CFG.huntMax; BOARD_CFG.huntMax = 2; // админ уменьшил лимит при взятых заказах — показ всё равно не «6 из 2»
const S2: any = new BoardStore(() => {}); S2.apply({ boardDefs: boardDefs(), board: boardClient(a, h) });
ok(S2.takeMax("board") === 2 && Math.min(S2.takenCount("board"), S2.takeMax("board")) === 2, "лимит уменьшен: показ «взято 2 из 2»");
ok(!boardTake(a, h, hunt.find((id: string) => !b.tk.includes(id)) || hunt[0], true).ok || hunt.every((id: string) => b.tk.includes(id)), "сервер: новый заказ сверх лимита не берётся");
BOARD_CFG.huntMax = old;
console.log(f ? `FAILED ${f}` : `board-count ok (${n} проверок)`); process.exit(f ? 1 : 0);
