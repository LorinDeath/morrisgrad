// Протокол StratMatch/StratIndex на локальном wrangler dev (MC_DEV_TRUST_USERID=1 в .dev.vars, локальная D1).
// SRV=http://127.0.0.1:8871 node server/strat/match-test.mjs   (Node 22: глобальный WebSocket)
import { execSync } from "node:child_process";
const SRV = process.env.SRV || "http://127.0.0.1:8871", WSS = SRV.replace(/^http/, "ws");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0, fail = 0; const ok = (c, m, d) => { c ? pass++ : fail++; console.log((c ? "PASS " : "FAIL ") + m + (!c && d ? "  :: " + (typeof d === "function" ? d() : d) : "")); };
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
A.clear(); A.send({ type: "cfg", turnLimit: 3 }); ok((await A.wait("err"))?.err === "no_turn_limit", "t1135: лимита ходов нет — отказ сервера");
A.clear(); A.send({ type: "cfg", turnLimit: 201 }); ok((await A.wait("err"))?.err === "no_turn_limit", "лимит 201 — тот же отказ");
B.clear(); B.send({ type: "cfg", turnLimit: 30 }); ok(["not_host", "no_turn_limit"].includes((await B.wait("err"))?.err), "не-хост — отказ");
A.clear(); A.send({ type: "cfg", turnLimit: 0, hiddenHp: false, rated: false }); // свободный выбор рас — нерейтинговая (t1144)
 ok((await A.wait("st")) !== null, "turnLimit 0 (совместимость) принимается");
A.send({ type: "race", race: "fire" }); B.send({ type: "race", race: "ice" });
st = await B.wait("st", (m) => m.seats[0]?.picked && m.seats[1]?.picked);
ok(st && st.seats[0].race === null && st.seats[1].race === "ice", "выбор вслепую: чужая раса скрыта до старта");
A.send({ type: "ready", on: true }); B.send({ type: "ready", on: true });
st = await A.wait("st", (m) => m.phase === "play");
ok(st && st.g.size === 15 && st.g.races[0] === "fire" && st.g.races[1] === "ice", "оба готовы → старт 15×15, расы открыты");
ok(st && st.g.turnLimit === 0 && st.league?.id === "normal" && !!st.terr, "в партии лимита нет; есть league и terr (15×15 — Обычная)");
ok(st?.clock && st.clock.reserve[0] === 0 && st.clock.turnMs > 0, "таймер: лимит хода без запаса (t1135)");
const g = st.g, me = g.cur, P = me === 0 ? A : B, O = me === 0 ? B : A;
const pawn = g.pieces.find((p) => p.o === me && p.k === "pawn"), dy = me === 0 ? -1 : 1;
O.clear(); P.clear(); O.send({ type: "act", act: { a: "move", id: pawn.id, x: pawn.x, y: pawn.y + dy } }); ok((await O.wait("err"))?.err === "not_your_turn", "чужой ход отклонён сервером");
P.send({ type: "act", act: { a: "move", id: pawn.id, x: pawn.x, y: pawn.y + 3 * dy } }); ok((await P.wait("err"))?.err === "bad_move", "недопустимый ход отклонён");
P.clear(); O.clear();
P.send({ type: "act", act: { a: "move", id: pawn.id, x: pawn.x, y: pawn.y + dy } });
st = await O.wait("st", (m) => m.g.v === 1);
ok(st && st.g.pieces.find((p) => p.id === pawn.id).y === pawn.y + dy && st.ev.some((e) => e.e === "move"), "ход виден сопернику (событие + снимок)", () => JSON.stringify({ v: st?.g?.v, ev: st?.ev, p: st?.g?.pieces?.find((p) => p.id === pawn.id), pawn }).slice(0, 600));
// переподключение
O.close(); await sleep(300);
st = await P.wait("st", (m) => m.seats[me === 0 ? 1 : 0]?.online === false);
ok(!!st, "обрыв соперника виден");
const O2 = await client("/strat/m/" + code); O2.send({ type: "hello", userId: me === 0 ? uB : uA });
st = await O2.wait("st"); ok(st && st.you === (me === 0 ? 1 : 0) && st.g.v === 1 && st.phase === "play", "переподключение: то же место и полный снимок");
// t1156: «Предыдущие ходы» в живой партии
{ O2.send({ type: "moves", rq: 71 }); const mv = await O2.wait("moves", (m) => m.rq === 71);
  ok(mv && mv.live === true && mv.n === 1 && mv.list[0].a.a === "move" && mv.list[0].n.startsWith("→") && /^[A-HJ-NP-Z2-9]{6}:\d+$/.test(mv.id), "moves: список ходов живой партии");
  O2.send({ type: "frame", rq: 72, i: 0 }); const f0 = await O2.wait("frame", (m) => m.rq === 72);
  ok(f0 && f0.i === 0 && f0.live && f0.frame.g.pieces.find((p) => p.id === pawn.id).y === pawn.y && !f0.frame.clock && !f0.frame.trees && f0.frame.you === (me === 0 ? 1 : 0), "frame 0: стартовая позиция, без часов, без чужого дерева");
  O2.send({ type: "frame", rq: 73, i: 99 }); const f1 = await O2.wait("frame", (m) => m.rq === 73);
  ok(f1 && f1.i === 1 && f1.frame.g.pieces.find((p) => p.id === pawn.id).y === pawn.y + dy, "frame: i зажат до n, позиция после хода", () => JSON.stringify({ i: f1?.i, err: f1?.err, p: f1?.frame?.g?.pieces?.find((p) => p.id === pawn.id), pawn }).slice(0, 600));
  const sp = await client("/strat/m/" + code); sp.send({ type: "hello", guest: "s".repeat(12) + T }); await sp.wait("st");
  sp.send({ type: "frame", rq: 74, i: 1 }); const fs = await sp.wait("frame", (m) => m.rq === 74); ok(fs && !fs.frame.tree && !fs.frame.terr, "зритель: кадр без дерева/территории", () => JSON.stringify(fs ? { ...fs, frame: Object.keys(fs.frame || {}) } : null).slice(0, 600)); sp.close(); }
// сдача
P.send({ type: "forfeit" }); st = await O2.wait("st", (m) => m.phase === "over");
ok(st && st.result.winner === (me === 0 ? 1 : 0) && st.result.reason === "forfeit", "сдача → победа соперника");
{ O2.send({ type: "frame", rq: 75, i: 1 }); const fo = await O2.wait("frame", (m) => m.rq === 75);
  ok(fo && fo.live === false && fo.frame.trees?.length === 2 && fo.frame.terrs?.length === 2, "после конца: кадр раскрыт (оба дерева, обе территории)");
  await sleep(700); const rid = st.replay?.id;
  const rr = JSON.parse(execSync(`${process.env.WRANGLER || "npx wrangler"} d1 execute morrisgrad_db --local --persist-to ${process.env.PERSIST} --config wrangler.json --json --command "SELECT status, acts, winner, reason FROM strat_replays WHERE id='${rid}'"`, { stdio: "pipe" }).toString())[0].results;
  ok(rr.length === 1 && rr[0].status === "over" && rr[0].acts === 1 && rr[0].reason === "forfeit", "D1: повтор записан (status over)");
  const hr = await (await fetch(SRV + "/strat/replay?id=" + encodeURIComponent(rid))).json();
  ok(hr.meta?.id === rid && hr.moves?.n === 1 && hr.log?.n === 1 && !hr.log.acts && hr.rulesChanged === false, "HTTP /strat/replay: meta + moves");
  const hf = await (await fetch(SRV + "/strat/replay?id=" + encodeURIComponent(rid) + "&from=0&to=1")).json();
  ok(hf.frames?.length === 2 && hf.frames[1].frame.g.pieces.find((p) => p.id === pawn.id).y === pawn.y + dy && hf.frames[1].frame.g.winner !== -1, "HTTP кадры: позиция и исход");
  ok((await fetch(SRV + "/strat/replay?id=bad")).status === 400, "HTTP: неверный id → 400");
  const hu = await client("/strat/hub"); hu.send({ type: "hello", userId: uA, nick: "Альфа" }); await hu.wait("hello_ok");
  hu.send({ type: "lib_save", rq: 81, id: rid, title: "<b>Первая</b>" }); const l1 = await hu.wait("lib", (m) => m.rq === 81);
  ok(l1 && l1.saved.some((x) => x.id === rid && x.title === "bПервая/b") && l1.recent.some((x) => x.id === rid && x.saved) && l1.keepDays === 90, "Библиотека: сохранить, недавние");
  ok(l1 && !JSON.stringify(l1).includes(uA), "Библиотека: без user_id наружу");
  hu.send({ type: "lib_unsave", rq: 82, id: rid }); const l2 = await hu.wait("lib", (m) => m.rq === 82); ok(l2 && !l2.saved.some((x) => x.id === rid), "Библиотека: убрать из сохранённых");
  hu.send({ type: "lib_save", rq: 83, id: "ZZZZZZ:1700000000000" }); ok((await hu.wait("err", (m) => m.rq === 83))?.err === "no_replay", "Библиотека: нет такого повтора");
  hu.close();
  const hg2 = await client("/strat/hub"); hg2.send({ type: "hello", guest: "w".repeat(12) + T }); await hg2.wait("hello_ok");
  hg2.send({ type: "lib_list", rq: 84 }); ok((await hg2.wait("err", (m) => m.rq === 84))?.err === "guest", "Библиотека: гостю — нет"); hg2.close(); }
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
// ---------- рельеф и карты игроков (ручная модерация; неодобренная — без опыта)
{
  const d1 = (q) => JSON.parse(execSync(`${process.env.WRANGLER || "npx wrangler"} d1 execute morrisgrad_db --local --persist-to ${process.env.PERSIST} --config wrangler.json --json --command "${q}"`, { stdio: "pipe" }).toString())[0].results;
  const c4 = await newLobby(8, true); const M = await client("/strat/m/" + c4);
  M.send({ type: "hello", userId: uA, nick: "Альфа" }); let s4 = await M.wait("st");
  ok(s4?.mapInfo?.status === "official" && s4.mapInfo.id === "o8a" && s4.mapInfo.xp === true && s4.lobbyMap?.t?.length === 64, "лобби: официальная карта по умолчанию, предпросмотр рельефа");
  const base = s4.lobbyMap;
  const hg = await client("/strat/hub"); hg.send({ type: "hello", guest: "q".repeat(12) + T }); await hg.wait("hello_ok");
  hg.send({ type: "map_save", rq: 1, map: { name: "Гостевая", size: 8, t: base.t, s: base.s } }); ok((await hg.wait("map_save_r"))?.err === "login_required", "гость не сохраняет карты");
  h1.send({ type: "map_save", rq: 2, map: { name: "Плохая", size: 8, t: "#".repeat(64), s: ".".repeat(64) } }); ok(String((await h1.wait("map_save_r"))?.err).startsWith("invalid:"), "сервер проверяет карту (стены везде — отказ)");
  await sleep(5100);
  h1.send({ type: "map_save", rq: 3, map: { name: "Тест Альфы", size: 8, t: base.t, s: base.s } }); const sv = await h1.wait("map_save_r", (m) => m.rq === 3);
  const mid = sv?.id; ok(/^u[0-9a-f]{10}$/.test(mid || ""), "карта сохранена, статус pending: " + JSON.stringify(sv));
  h2.send({ type: "map_list", rq: 4, size: 8 }); let ls = await h2.wait("map_list_r");
  ok(ls && !ls.list.some((m) => m.id === mid) && ls.list.some((m) => m.kind === "official"), "чужой: неодобренной карты нет в списке");
  h1.send({ type: "map_list", rq: 5, size: 8 }); ls = await h1.wait("map_list_r");
  ok(ls && ls.list.some((m) => m.id === mid && m.status === "pending"), "автор видит свою карту со статусом «на проверке»");
  const c5 = await newLobby(8); const N = await client("/strat/m/" + c5); N.send({ type: "hello", userId: uB }); await N.wait("st");
  N.clear(); N.send({ type: "cfg", map: mid }); ok((await N.wait("err"))?.err === "map_not_approved", "не автор не может выбрать неодобренную карту");
  M.send({ type: "cfg", map: mid }); s4 = await M.wait("st", (m) => m.mapInfo?.id === mid);
  ok(s4 && s4.mapInfo.xp === false && s4.mapInfo.status === "pending", "автор играет на своей карте: xp=false (бейдж «без опыта»)");
  await sleep(300); const op = await (await fetch(SRV + "/strat/open")).json();
  ok(!op.list.some((l) => l.code === c4), "лобби на неодобренной карте не попадает в публичный список (только по коду)");
  M.send({ type: "bot", on: true }); M.send({ type: "race", race: "fire" }); M.send({ type: "ready", on: true });
  s4 = await M.wait("st", (m) => m.phase === "play"); ok(s4?.g?.map?.id === mid, "партия идёт на карте игрока");
  M.send({ type: "forfeit" }); await M.wait("st", (m) => m.phase === "over"); await sleep(600);
  const r4 = d1(`SELECT map_id, xp FROM strat_matches WHERE code='${c4}'`);
  ok(r4.length === 1 && r4[0].map_id === mid && r4[0].xp === 0, "D1: партия на неодобренной карте записана с xp=0");
  h2.send({ type: "map_mod", rq: 6, id: mid, act: "approve" }); ok((await h2.wait("map_mod_r"))?.err === "not_admin", "не админ не модерирует");
  d1("INSERT OR IGNORE INTO player_roles (pkey, role, granted_by, granted_at) VALUES ('uid:dev_strat_admin', 'admin', 'match-test', 0)"); // локальная D1: тестовый админ
  const ha = await client("/strat/hub"); ha.send({ type: "hello", userId: "dev_strat_admin", nick: "Админ" }); const hok = await ha.wait("hello_ok");
  ok(hok?.admin === true, "админ опознан сервером (player_roles)", () => JSON.stringify(hok).slice(0, 400) + " roles=" + JSON.stringify(d1("SELECT * FROM player_roles")).slice(0, 300));
  ha.send({ type: "map_queue", rq: 7 }); const q = await ha.wait("map_queue_r");
  ok(q?.list?.some((m) => m.id === mid && m.checks && m.t), "очередь модерации: карта с предпросмотром и автопроверками");
  ha.send({ type: "map_mod", rq: 8, id: mid, act: "reject" }); ok((await ha.wait("map_mod_r", (m) => m.rq === 8))?.err === "reason_required", "отклонение — только с причиной");
  ha.send({ type: "map_mod", rq: 9, id: mid, act: "approve" }); ok((await ha.wait("map_mod_r", (m) => m.rq === 9))?.status === "approved", "админ одобрил карту");
  h2.send({ type: "map_list", rq: 10, size: 8 }); ls = await h2.wait("map_list_r", (m) => m.rq === 10);
  ok(ls?.list?.some((m) => m.id === mid && m.status === "approved"), "после одобрения — в публичном списке");
  N.clear(); N.send({ type: "cfg", map: mid }); const s5 = await N.wait("st", (m) => m.mapInfo?.id === mid);
  ok(s5?.mapInfo?.xp === true, "после одобрения — опыт начисляется (xp=true)");
  for (const c of [M, N, hg, ha]) try { c.close(); } catch {}
}
// ---------- этап 2: экономика, админ-конфиг, настройки профиля
{
  const ha = await client("/strat/hub"); ha.send({ type: "hello", userId: "dev_strat_admin", nick: "Админ" }); await ha.wait("hello_ok");
  h2.send({ type: "cfg_get", rq: 21 }); ok((await h2.wait("cfg_get_r", (m) => m.rq === 21))?.err === "not_admin", "конфиг правил: не админ не читает");
  h2.send({ type: "cfg_set", rq: 22, patch: { econ: { start: { gold: 99 } } } }); ok((await h2.wait("cfg_set_r", (m) => m.rq === 22))?.err === "not_admin", "конфиг правил: не админ не меняет");
  ha.send({ type: "cfg_get", rq: 23 }); const cg = await ha.wait("cfg_get_r", (m) => m.rq === 23);
  ok(cg?.base?.econ?.start && cg?.cfg?.econ?.city, "админ читает базу и итоговый конфиг");
  ha.send({ type: "cfg_set", rq: 24, patch: { econ: { start: { gold: 9 } }, evil: 1 } }); const cs = await ha.wait("cfg_set_r", (m) => m.rq === 24);
  ok(cs && !cs.err, "админ сохраняет правку (лишние ключи отброшены)");
  const c6 = await newLobby(8); const E = await client("/strat/m/" + c6); E.send({ type: "hello", userId: uA, nick: "Альфа" }); await E.wait("st");
  E.send({ type: "cfg", rated: false }); await E.wait("st", (m) => m.rated === false); // свободный выбор рас — только нерейтинговая (t1144)
  E.send({ type: "race", race: "stone" }); ok((await E.wait("st", (m) => m.seats[0]?.race === "stone")) !== null, "новая раса (Камень) выбирается в лобби", () => JSON.stringify({ err: E.last("err"), seat: E.last("st")?.seats?.[0], races: E.last("st")?.races, draw: E.last("st")?.draw }).slice(0, 700));
  E.send({ type: "race", race: "mana" }); ok((await E.wait("err"))?.err === "bad_race", "неизвестная раса — отказ", () => JSON.stringify(E.msgs.filter((m) => m.type === "err")).slice(0, 300));
  E.send({ type: "race", race: "fire" }); E.send({ type: "bot", on: true }); E.send({ type: "ready", on: true });
  let s6 = await E.wait("st", (m) => m.phase === "play" && m.g.cur === m.you, 15000);
  ok(s6?.cfgPatch?.econ?.start?.gold === 9 && s6.g.ec, "партия получила админ-правку (cfgPatch) и экономику");
  const my = s6.you, cap = s6.g.ec.cities.find((c) => c.owner === my && c.cap);
  E.clear(); E.send({ type: "act", act: { a: "build", city: cap.id, b: "barracks" } });
  s6 = await E.wait("st", (m) => m.g.ec.cities.find((c) => c.id === cap.id)?.bld?.includes("barracks"));
  ok(!!s6 && s6.ev.some((e) => e.e === "build"), "постройка Казармы через сервер");
  E.clear(); E.send({ type: "act", act: { a: "build", city: cap.id, b: "stable" } }); ok((await E.wait("err"))?.err === "already_acted", "стройка — действие Вождя, раз в ход (t1137) — отказ сервера", () => JSON.stringify(E.msgs.filter((m) => m.type === "err")).slice(0, 300) + " cur=" + E.last("st")?.g?.cur);
  E.clear(); E.send({ type: "act", act: { a: "research", t: "<script>" } }); ok(["bad_tech", "bad_action"].includes((await E.wait("err"))?.err), "мусорная технология отклонена");
  E.clear(); E.send({ type: "act", act: { a: "trade", to: 1 - my, give: { gold: 1 }, get: { know: 1 } } }); ok((await E.wait("err"))?.err === "no_ally", "обмен в 1 на 1 — нет союзника");
  E.clear(); E.send({ type: "act", act: { a: "build", city: cap.id, b: "barracks", __proto__: { x: 1 }, extra: "x".repeat(50) } }); ok(!!(await E.wait("err")), "лишние поля действия не ломают сервер");
  E.send({ type: "forfeit" }); await E.wait("st", (m) => m.phase === "over");
  ha.send({ type: "cfg_set", rq: 25, patch: {} }); await ha.wait("cfg_set_r", (m) => m.rq === 25); // вернуть базу
  // настройки профиля
  const hg2 = await client("/strat/hub"); hg2.send({ type: "hello", guest: "g".repeat(12) + T }); await hg2.wait("hello_ok");
  hg2.send({ type: "pref_set", pieceStyle: "fig" }); ok((await hg2.wait("err"))?.err === "guest", "гость: стиль фигур не сохраняется в профиль");
  h1.send({ type: "pref_set", pieceStyle: "tok", glyphBadge: true }); ok(!!(await h1.wait("pref_ok")), "вошедший: стиль сохранён");
  const h3 = await client("/strat/hub"); h3.send({ type: "hello", userId: uA, nick: "Альфа" }); const ho = await h3.wait("hello_ok");
  ok(ho?.prefs?.pieceStyle === "tok", "стиль фигур возвращается при входе (с другого устройства)");
  for (const c of [ha, E, hg2, h3]) try { c.close(); } catch {}
}
for (const c of [A, B, X, P, O2, H, h1, h2]) try { c.close(); } catch {}
// --- t1144: рейтинговый жребий рас
{
  const { createHash } = await import("node:crypto");
  const hf = await client("/strat/hub"); hf.send({ type: "hello", userId: uA, nick: "Альфа" }); await hf.wait("hello_ok");
  hf.send({ type: "fav_races_set", races: ["stone", "stone", "zzz", "nature", "water", "fire"] });
  const fo = await hf.wait("fav_races_ok"); ok(fo?.favRaces?.join() === "stone,nature,water", "любимые расы: чистка и обрезка до 3");
  const hf2 = await client("/strat/hub"); hf2.send({ type: "hello", userId: uA, nick: "Альфа" }); ok((await hf2.wait("hello_ok"))?.favRaces?.join() === "stone,nature,water", "hello_ok.favRaces возвращает сохранённое");
  const hg3 = await client("/strat/hub"); hg3.send({ type: "hello", guest: "r".repeat(12) + T }); await hg3.wait("hello_ok");
  hg3.send({ type: "fav_races_set", races: ["fire"] }); ok((await hg3.wait("err"))?.err === "guest", "гость: любимые расы не сохраняются");
  const rc = await newLobby(8, false), RA = await client("/strat/m/" + rc), RB = await client("/strat/m/" + rc);
  RA.send({ type: "hello", userId: uA, nick: "Альфа" }); await RA.wait("st"); RB.send({ type: "hello", userId: uB, nick: "Бета" }); await RB.wait("st", (m) => m.you === 1);
  RA.clear(); RA.send({ type: "cfg", rated: true }); let rs = await RA.wait("st", (m) => m.rated && m.raceDraw?.commit);
  ok(rs && /^[0-9a-f]{64}$/.test(rs.raceDraw.commit) && !rs.raceDraw.seed, "рейтинговая: в лобби commit, seed скрыт");
  RA.clear(); RA.send({ type: "race", race: "fire" }); ok((await RA.wait("err"))?.err === "rated_random", "рейтинговая: выбор расы — отказ rated_random");
  RA.send({ type: "ready", on: true }); RB.send({ type: "ready", on: true });
  rs = await RB.wait("st", (m) => m.phase === "play", 6000);
  const D = rs?.raceDraw;
  ok(D && D.seed && createHash("sha256").update("strat-race:" + D.seed).digest("hex") === D.commit, "старт: seed раскрыт, SHA-256 совпадает с commit");
  ok(rs && rs.g.races[0] !== rs.g.races[1] && D.rolls?.length === 2 && D.w?.[0] === 85, "расы назначены жребием, без повтора, веса 85/15");
  ok(D?.rolls?.find((r) => r.seat === 0)?.favPool?.length > 0 && D.rolls.find((r) => r.seat === 1)?.favPool?.length === 0, "любимые расы из D1 подтянуты (у Беты нет)");
  const rows2 = JSON.parse(execSync(`${process.env.WRANGLER || "npx wrangler"} d1 execute morrisgrad_db --local --persist-to ${process.env.PERSIST} --config wrangler.json --json --command "SELECT seed FROM strat_race_draws WHERE commit_hash = '${D?.commit}'"`, { encoding: "utf8" }))[0].results;
  ok(rows2[0]?.seed === D?.seed, "журнал жребия в D1 strat_race_draws");
  RA.send({ type: "forfeit" }); await RA.wait("st", (m) => m.phase === "over");
  for (const c of [hf, hf2, hg3, RA, RB]) try { c.close(); } catch {}
}
console.log(`${pass} PASS, ${fail} FAIL`); process.exit(fail ? 1 : 0);
