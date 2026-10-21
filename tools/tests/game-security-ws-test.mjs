// WebSocket-тест безопасности игрового сервера против ЛОКАЛЬНОГО wrangler dev (только 127.0.0.1).
// Запуск: cd server && npx wrangler d1 migrations apply morrisgrad_db --local
//         + роль админа uid:sec_admin_pt в локальной D1 (player_roles)
//         npx wrangler dev --port 8797 --ip 127.0.0.1 --var MC_DEV_TRUST_USERID:1
//         WS=ws://127.0.0.1:8797 node tools/tests/game-security-ws-test.mjs
import { createRequire } from "node:module";
import { execSync } from "node:child_process";
const require = createRequire(import.meta.url);
const WebSocket = require("ws");
const WS = process.env.WS || "ws://127.0.0.1:8797";
if (!/^ws:\/\/(127\.0\.0\.1|localhost):\d+$/.test(WS)) { console.log("FAIL: только локальный адрес"); process.exit(2); }
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL " + m); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function client(name, uid, gid) {
  const ws = new WebSocket(WS); const got = [];
  ws.on("message", (d) => { try { got.push(JSON.parse(String(d))); } catch {} });
  const ready = new Promise((r) => ws.on("open", r));
  const wait = async (pred, ms = 8000) => { const t = Date.now(); while (Date.now() - t < ms) { const m = got.find(pred); if (m) return m; await sleep(50); } return null; };
  return { ws, got, ready, wait, send: (o) => ws.send(typeof o === "string" ? o : JSON.stringify(o)), join: () => ws.send(JSON.stringify({ type: "join", username: name, userId: uid || undefined, guestId: gid })) };
}
const gid = () => Array.from({ length: 24 }, () => "abcdefghijklmnopqrstuvwxyz0123456789"[Math.floor(Math.random() * 36)]).join("");
const A = client("SecAdmin", "sec_admin_pt", gid()), T = client("SecTarget", "sec_target_pt_" + Date.now(), gid()), G = client("Guest", null, gid());
await Promise.all([A.ready, T.ready, G.ready]);
A.join(); T.join(); G.join();
const aw = await A.wait((m) => m.type === "my_role"), tw = await T.wait((m) => m.type === "welcome"), gw = await G.wait((m) => m.type === "my_role");
ok(aw && aw.admin === true, "админ (роль из D1) получил admin-флаги");
ok(gw && !gw.admin && !gw.modAdmin, "гость без прав");
await T.wait((m) => m.type === "my_role");

// 1. гость: админ-команды и выдача ролей отклоняются, поля userId/role в сообщении игнорируются
G.send({ type: "admin_open", userId: "sec_admin_pt", role: "admin" });
G.send({ type: "role_set", sid: tw.myId, moderator: true, userId: "sec_admin_pt" });
await sleep(800);
ok(G.got.filter((m) => m.type === "toast_error" && /прав/.test(m.message)).length >= 2, "гость: admin_open и role_set → «Недостаточно прав»");
ok(!G.got.some((m) => m.type === "admin_catalog" || m.type === "role_changed"), "гость: каталога/смены роли нет");

// 2. мусор: огромное сообщение, не-JSON, NaN-координаты — сервер не падает, позиция не портится
G.send("x".repeat(70 * 1024)); G.send("{не json"); G.send({ type: "move", x: "NaN", y: 1e309 }); G.send({ type: "move", x: { a: 1 }, y: [] });
G.send({ type: "ping" });
ok(await G.wait((m) => m.type === "pong", 3000), "после мусора сокет жив (pong)");

// 3. админ выдаёт модератора по sid → в журнале grant_audit появляется role_set
A.send({ type: "role_set", sid: tw.myId, moderator: true });
const rc = await A.wait((m) => m.type === "role_changed");
ok(rc && rc.role === "moderator", "админ: модератор выдан");
const tr = await T.wait((m) => m.type === "my_role" && m.modAdmin === true);
ok(tr, "цель получила панель модератора");
A.send({ type: "role_set", sid: tw.myId, moderator: false });
await A.wait((m) => m.type === "role_changed" && m.role === null);
await sleep(1500);
const out = execSync(`cd server && npx --prefix .. wrangler d1 execute morrisgrad_db --local --json --command "SELECT kind, pkey, detail FROM grant_audit WHERE kind = 'role_set' AND pkey = 'uid:sec_admin_pt' ORDER BY ts DESC LIMIT 2"`, { stdio: ["ignore", "pipe", "ignore"] }).toString();
const rows = JSON.parse(out)[0]?.results || [];
ok(rows.length === 2 && rows.some((r) => /"role":"moderator"/.test(r.detail)) && rows.some((r) => /"role":null/.test(r.detail)), "журнал: выдача и снятие модератора записаны");
ok(rows.every((r) => !String(r.detail).includes("sec_target_pt")), "журнал: цель — непрозрачный id, не uid");

// Origin: чужой сайт — отказ (403) даже на локальном сервере; morrisgrad.com и localhost-страница — подключаются
async function tryOrigin(origin) {
  return new Promise((r) => { const ws = new WebSocket(WS, origin ? { headers: { Origin: origin } } : {}); ws.on("open", () => { ws.close(); r(true); }); ws.on("unexpected-response", (_q, res) => r(res.statusCode)); ws.on("error", () => r(false)); });
}
ok(await tryOrigin("https://evil.example") === 403, "WS с чужого Origin — 403");
ok(await tryOrigin("https://morrisgrad.com.evil.example") === 403, "WS с похожего домена — 403");
ok(await tryOrigin("https://morrisgrad.com") === true, "WS с morrisgrad.com — подключился");
ok(await tryOrigin("http://localhost:4321") === true, "WS с localhost-страницы к локальному серверу — подключился");

for (const c of [A, T, G]) c.ws.close();
console.log(`game-security-ws-test: ${pass} PASS, ${fail} FAIL`);
process.exit(fail ? 1 : 0);
