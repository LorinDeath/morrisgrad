// Протокол StratMatch/StratIndex на локальном wrangler dev (MC_DEV_TRUST_USERID=1 в .dev.vars, локальная D1).
// SRV=http://127.0.0.1:8871 node server/strat/match-test.mjs   (Node 22: глобальный WebSocket)
import { execSync } from "node:child_process";
const SRV = process.env.SRV || "http://127.0.0.1:8871", WSS = SRV.replace(/^http/, "ws");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0, fail = 0; const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? "PASS " : "FAIL ") + m); };
function client(path) {
  const ws = new WebSocket(WSS + path); const msgs = [];
  ws.onmessage = (e) => msgs.push(JSON.parse(e.data));
  const c = { ws, msgs, send: (o) => ws.send(JSON.stringify(o)), last: (t) => [...msgs].reverse().find((m) => m.type === t),
    wait: async (t, pred = () => true, ms = 4000) => { const s = Date.now(); while (Date.now() - s < ms) { const m = [...msgs].reverse().find((x) => x.type === t && pred(x)); if (m) return m; await sleep(30); } return null; },
    clear: () => (msgs.length = 0), close: () => ws.close() };
  return new Promise((res, rej) => { ws.onopen = () => res(c); ws.onerror = (e) => rej(e); });
}
const newLobby = async (size = 8, pub = false) => (await (await fetch(SRV + "/strat/new", { method: "POST", body: JSON.stringify({ size, pub }) })).json()).code;
const T = Date.now(), uA = "strat_A_" + T, uB = "strat_B_" + T;

const code = await newLobby(8, true);
ok(/^[A-HJ-NP-Z2-9]{6}$/.test(code), "код лобби из 6 символов без O/0/I/1: " + code);
const st0 = (path, origin) => execSync(`curl -s -o /dev/null -w '%{http_code}' -H 'Connection: Upgrade' -H 'Upgrade: websocket' -H 'Sec-WebSocket-Version: 13' -H 'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==' ${origin ? `-H 'Origin: ${origin}'` : ""} --max-time 3 ${SRV}${path} || true`).toString();
ok(st0("/strat/m/ZZZZZZ") === "404", "несуществующее лобби — 404");
ok(st0("/strat/m/" + code, "https://evil.example") === "403", "чужой Origin — 403");
ok(st0("/strat/hub", "https://evil.example") === "403", "хаб: чужой Origin — 403");

const A = await client("/strat/m/" + code), B = await client("/strat/m/" + code), X = await client("/strat/m/" + code);
X.send({ type: "hello" }); ok((await X.wait("err"))?.err === "no_ident", "без входа и гостя — отказ");
X.send({ type: "hello", token: "garbage" }); ok((await X.wait("err", (m) => m.err !== "no_ident"))?.err?.startsWith("auth_"), "мусорный токен — auth_*");
A.send({ type: "hello", userId: uA, nick: "Альфа" });
let st = await A.wait("st"); ok(st?.you === 0 && st.phase === "lobby" && st.size === 8, "первый вошедший — хост, место 0");
B.send({ type: "hello", userId: uB, nick: "Бета" });
st = await B.wait("st"); ok(st?.you === 1, "второй — место 1");
const open = await (await fetch(SRV + "/strat/open")).json();
ok(!open.list.some((l) => l.code === code), "заполненное лобби не в списке «Ждут соперника»");
B.send({ type: "cfg", size: 15 }); ok((await B.wait("err"))?.err === "not_host", "не хост не меняет настройки");
A.send({ type: "cfg", size: 15 }); ok((await A.wait("st", (m) => m.size === 15)) !== null, "хост меняет размер 8→15");
A.clear(); A.send({ type: "cfg", turnLimit: 3 }); ok((await A.wait("err"))?.err === "bad_turn_limit", "лимит ходов вне 5..200 — отказ сервера");
A.clear(); A.send({ type: "cfg", turnLimit: 201 }); ok((await A.wait("err"))?.err === "bad_turn_limit", "лимит 201 — отказ");
B.clear(); B.send({ type: "cfg", turnLimit: 30 }); ok((await B.wait("err"))?.err === "not_host", "лимит меняет только хост");
A.send({ type: "cfg", turnLimit: 30 }); ok((await A.wait("st", (m) => m.turnLimit === 30)) !== null, "хост ставит лимит 30 ходов");
A.send({ type: "race", race: "fire" }); B.send({ type: "race", race: "ice" });
st = await B.wait("st", (m) => m.seats[0]?.picked && m.seats[1]?.picked);
ok(st && st.seats[0].race === null && st.seats[1].race === "ice", "выбор вслепую: чужая раса скрыта до старта");
A.send({ type: "ready", on: true }); B.send({ type: "ready", on: true });
st = await A.wait("st", (m) => m.phase === "play");
ok(st && st.g.size === 15 && st.g.races[0] === "fire" && st.g.races[1] === "ice", "оба готовы → старт 15×15, расы открыты");
ok(st && st.g.turnLimit === 30, "лимит из лобби попал в партию (30)");
ok(st?.clock && st.clock.reserve[0] === 300000, "таймер: 60 с + запас 5 мин");
const g = st.g, me = g.cur, P = me === 0 ? A : B, O = me === 0 ? B : A;
const pawn = g.pieces.find((p) => p.o === me && p.k === "pawn"), dy = me === 0 ? -1 : 1;
O.clear(); P.clear(); O.send({ type: "act", act: { a: "move", id: pawn.id, x: pawn.x, y: pawn.y + dy } }); ok((await O.wait("err"))?.err === "not_your_turn", "чужой ход отклонён сервером");
P.send({ type: "act", act: { a: "move", id: pawn.id, x: pawn.x, y: pawn.y + 3 * dy } }); ok((await P.wait("err"))?.err === "bad_move", "недопустимый ход отклонён");
P.clear(); O.clear();
P.send({ type: "act", act: { a: "move", id: pawn.id, x: pawn.x, y: pawn.y + dy } });
st = await O.wait("st", (m) => m.g.v === 1);
ok(st && st.g.pieces.find((p) => p.id === pawn.id).y === pawn.y + dy && st.ev.some((e) => e.e === "move"), "ход виден сопернику (событие + снимок)");
// переподключение
O.close(); await sleep(300);
st = await P.wait("st", (m) => m.seats[me === 0 ? 1 : 0]?.online === false);
ok(!!st, "обрыв соперника виден");
const O2 = await client("/strat/m/" + code); O2.send({ type: "hello", userId: me === 0 ? uB : uA });
st = await O2.wait("st"); ok(st && st.you === (me === 0 ? 1 : 0) && st.g.v === 1 && st.phase === "play", "переподключение: то же место и полный снимок");
// сдача
P.send({ type: "forfeit" }); st = await O2.wait("st", (m) => m.phase === "over");
ok(st && st.result.winner === (me === 0 ? 1 : 0) && st.result.reason === "forfeit", "сдача → победа соперника");
await sleep(500);
const rows = JSON.parse(execSync(`${process.env.WRANGLER || "npx wrangler"} d1 execute morrisgrad_db --local --persist-to ${process.env.PERSIST} --config wrangler.json --json --command "SELECT winner, reason, size FROM strat_matches WHERE code='${code}'"`, { stdio: "pipe" }).toString())[0].results;
ok(rows.length === 1 && rows[0].reason === "forfeit" && rows[0].size === 15, "итог записан в D1 strat_matches");
// реванш
P.send({ type: "rematch" }); O2.send({ type: "rematch" });
ok(!!(await P.wait("st", (m) => m.phase === "lobby" && !m.g)), "реванш: обратно в лобби, расы выбираются заново");
// бот
const code2 = await newLobby(8);
const H = await client("/strat/m/" + code2); H.send({ type: "hello", guest: "g".repeat(10) + T, nick: "Гостик" });
st = await H.wait("st"); ok(st?.seats[0]?.guest === true, "гость входит (без опыта)");
H.send({ type: "bot", on: true }); H.send({ type: "race", race: "ice" }); H.send({ type: "ready", on: true });
st = await H.wait("st", (m) => m.phase === "play"); ok(!!st, "игра с ботом стартует");
for (let i = 0; i < 40; i++) { const s = H.last("st"); if (s.phase !== "play") break; if (s.g.cur === 0) H.send({ type: "act", act: { a: "end" } }); await sleep(600); }
st = H.last("st"); ok(st.g.v >= 6 && st.ev !== undefined, `бот ходит сам (версия ${st.g.v})`);
// таймер хода через alarm(): короткий dev-таймер, ход передаётся сам
{
  const c3 = await newLobby(5); const D = await client("/strat/m/" + c3), E = await client("/strat/m/" + c3);
  D.send({ type: "hello", userId: uA }); await D.wait("st"); E.send({ type: "hello", userId: uB }); await E.wait("st", (m) => m.you === 1);
  E.clear(); E.send({ type: "dev_clock", ms: 1500 }); ok((await E.wait("err"))?.err === "dev_only", "dev-таймер: только хост в лобби");
  D.send({ type: "dev_clock", ms: 1500 }); D.send({ type: "race", race: "fire" }); E.send({ type: "race", race: "fire" });
  D.send({ type: "ready", on: true }); E.send({ type: "ready", on: true });
  const s0 = await D.wait("st", (m) => m.phase === "play"); const cur0 = s0.g.cur;
  const s1 = await D.wait("st", (m) => m.phase === "play" && m.g.cur !== cur0, 5000);
  ok(!!s1 && s1.g.v >= 1, "alarm(): время хода вышло — ход передан сопернику");
  D.close(); E.close();
}
// хаб: онлайн и приглашения
const h1 = await client("/strat/hub"), h2 = await client("/strat/hub");
h1.send({ type: "hello", userId: uA, nick: "Альфа" }); h2.send({ type: "hello", userId: uB, nick: "Бета" });
const ol = await h1.wait("online", (m) => m.list.length >= 1); const bsid = (await h2.wait("hello_ok")).sid;
ok(ol && ol.list.some((p) => p.sid === bsid) && !JSON.stringify(ol).includes(uB), "онлайн-список без Clerk id");
h1.send({ type: "invite", to: bsid, code: code2 });
ok((await h2.wait("invite"))?.code === code2, "приглашение доходит");
h1.send({ type: "invite", to: bsid, code: code2 }); ok((await h1.wait("err"))?.err === "invite_rate", "не чаще 1 раза в 10 с");
for (const c of [A, B, X, P, O2, H, h1, h2]) try { c.close(); } catch {}
console.log(`${pass} PASS, ${fail} FAIL`); process.exit(fail ? 1 : 0);
