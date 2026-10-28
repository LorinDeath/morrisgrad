// «Дорога в Аринар» (l01, Лэйр): не засчитывается сразу при взятии — только при настоящем входе в Аринар (портал). Прогон: bun meta/arinar-reach-test.ts
import { BTASKS, boardOf, boardRefresh, boardEvent, boardTake, BOARD_CFG } from "./board";
import { newAccount, newHero } from "./profile";
let f = 0; const ok = (c: any, m: string, x?: any) => { console.log((c ? "PASS " : "FAIL ") + m + (!c && x !== undefined ? " " + JSON.stringify(x) : "")); if (!c) f++; };
BOARD_CFG.tutVetReward = false;
const a: any = newAccount(), h: any = newHero("warrior"); a.hero = "warrior"; h.lvl = 3; const ctx = { pkey: "uid:t" }; boardRefresh(a, h, ctx);
const b = boardOf(a); ok(BTASKS.npc_l01?.ev === "reach", "l01 — задание «дойти»");
const r = boardTake(a, h, "npc_l01", true); ok(r.ok && b.tk.includes("npc_l01"), "взято у Лэйр", r);
ok(!(b.p.npc_l01 > 0), "сразу после взятия — не выполнено");
boardEvent(a, h, { type: "reach", world: "arinar", here: true }, ctx); ok(!(b.p.npc_l01 > 0), "разговор с NPC в Аринаре («уже здесь») — не засчитывает");
boardEvent(a, h, { type: "reach", world: "hellfire" }, ctx); ok(!(b.p.npc_l01 > 0), "вход в хаб — не засчитывает");
boardEvent(a, h, { type: "reach", world: "arinar" }, ctx); ok(b.p.npc_l01 === 1, "вход в Аринар через портал — засчитано", b.p);
const src = await Bun.file(new URL("./service.ts", import.meta.url)).text(); const i = src.indexOf('case "board_take"'); const seg = src.slice(i, src.indexOf("return true; }", i));
ok(i > 0 && !/type: "reach"/.test(seg), "board_take больше не шлёт reach при взятии");
console.log(f ? `${f} FAIL` : "всё PASS"); process.exit(f ? 1 : 0);
