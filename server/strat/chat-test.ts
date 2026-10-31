// nice bun server/strat/chat-test.ts
import { cleanChat, chatAllowed, canSee, parseTo, CHAT_CFG, type ChatMsg } from "./chat";
let pass = 0, fail = 0; const ok = (c: any, m: string) => { if (c) pass++; else { fail++; console.log("FAIL", m); } };
ok(cleanChat("  привет   мир ") === "привет мир", "пробелы");
ok(cleanChat("") === null && cleanChat("   ") === null && cleanChat(5) === null && cleanChat("\u200b\u200b") === null, "пустое/не строка/невидимые");
ok(Array.from(cleanChat("я".repeat(500))!).length === CHAT_CFG.max, "≤200 символов");
const x = cleanChat('<img src=x onerror=alert(1)><script>alert(1)</script>')!;
ok(x === '<img src=x onerror=alert(1)><script>alert(1)</script>', "HTML не исполняется сервером: хранится как текст (клиент — только textContent)");
ok(typeof x === "string" && !/[\u0000-\u001f]/.test(cleanChat("a\u0000b\u001bc\u202ed")!), "управляющие и bidi вырезаны");
ok(cleanChat("ты хуй") !== "ты хуй" && cleanChat("ты хуй")!.includes("\u2217"), "мат маскируется");
const st: number[] = []; let n = 0; for (let i = 0; i < 8; i++) if (chatAllowed(st, 1000 + i)) n++;
ok(n === 5 && !chatAllowed(st, 10_999) && chatAllowed(st, 11_001), "5 за 10 с");
const m = (to: any, from = 0): ChatMsg => ({ id: 1, at: 0, from, nick: "a", to, text: "t" }); const team = (s: number) => s % 2;
ok(canSee(m("all"), -1, team) && canSee(m("all"), 1, team), "всем — и зрителям");
ok(canSee(m("team"), 0, team) && !canSee(m("team"), 1, team) && !canSee(m("team"), -1, team) && canSee(m("team", 0), 2, team), "команде — только своим");
ok(canSee(m(1), 1, team) && canSee(m(1), 0, team) && !canSee(m(1), 2, team) && !canSee(m(1), -1, team), "шёпот — отправителю и адресату");
ok(parseTo("all", 2) === "all" && parseTo("team", 2) === "team" && parseTo(1, 2) === 1 && parseTo(5, 2) === null && parseTo("x", 2) === null, "адресат");
console.log(`chat: ${pass} ok, ${fail} fail`); if (fail) process.exit(1);
