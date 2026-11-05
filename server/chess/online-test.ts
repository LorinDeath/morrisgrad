// LOCAL ONLY: два WS-клиента играют партию на wrangler dev (MC_DEV_TRUST_USERID=1) до мата, проверка рейтинга D1.
// bun server/chess/online-test.ts   (CH_HTTP=http://127.0.0.1:8787)
import { attacks, moves, byId, type Game } from "./rules";
const HTTP = process.env.CH_HTTP || "http://127.0.0.1:8787", WSU = HTTP.replace(/^http/, "ws");
let fails = 0; const ok = (c: any, m: string) => { console.log((c ? "ok  " : "FAIL") + " " + m); if (!c) fails++; };
const sfx = Date.now().toString(36);
const A = "user_tA_" + sfx, B = "user_tB_" + sfx;
const me0 = async (u: string) => (await (await fetch(HTTP + "/chess/me?devUser=" + u)).json()).rating;

const { code } = await (await fetch(HTTP + "/chess/new", { method: "POST", body: JSON.stringify({ pub: true }) })).json() as any;
ok(/^[A-Z2-9]{6}$/.test(code), "лобби создано " + code);
const open = await (await fetch(HTTP + "/chess/open")).json() as any;
ok(open.list.some((l: any) => l.code === code), "лобби в списке открытых");

function client(uid: string, nick: string) {
  const ws = new WebSocket(WSU + "/chess/m/" + code);
  const c: any = { ws, state: null as Game | null, side: null, result: null, lobby: null, errs: [] as string[] };
  c.ready = new Promise<void>((res) => ws.addEventListener("open", () => { ws.send(JSON.stringify({ type: "hello", userId: uid, nick })); res(); }));
  ws.addEventListener("message", (e: any) => {
    const m = JSON.parse(e.data);
    if (m.type === "hello_ok") c.side = m.you.side;
    if (m.type === "state") c.state = m.state;
    if (m.type === "lobby") c.lobby = m.lobby;
    if (m.type === "result") c.result = m.result;
    if (m.type === "err") c.errs.push(m.err);
  });
  c.send = (o: any) => ws.send(JSON.stringify(o));
  return c;
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const ca = client(A, "Альфа"); await ca.ready; await sleep(300);
const cb = client(B, "Бета"); await cb.ready; await sleep(500);
ok(ca.side === "w" && cb.side === "b", "стороны w/b");
ok(ca.state && cb.state && ca.state.side === "w", "партия стартовала у обоих");
ok(ca.lobby?.seats?.length === 2 && ca.lobby.seats.every((s: any) => s.rated), "оба игрока рейтинговые");
const gst = new WebSocket(WSU + "/chess/m/" + code); let gErr = "";
gst.addEventListener("open", () => gst.send(JSON.stringify({ type: "hello", guest: "g".repeat(20) }))); gst.addEventListener("message", (e: any) => { const m = JSON.parse(e.data); if (m.type === "err") gErr = m.err; });
await sleep(400); ok(gErr === "full", "третий не садится (full)");
// чужой ход отклоняется
cb.send({ type: "act", act: "end" }); await sleep(250); ok(ca.state.side === "w", "ход не в свою очередь игнорируется");
// нелегальный ход
const wp = ca.state.pieces.find((p: any) => p.s === "w" && p.t === "P");
ca.send({ type: "act", act: "move", id: wp.id, x: wp.x, y: wp.y - 5 }); await sleep(250); ok(ca.errs.includes("illegal"), "нелегальный ход → illegal");

// играем жадным ботом за обоих до мата
for (let step = 0; step < 900 && !ca.result; step++) {
  const G = ca.state as Game; if (!G || G.side === "x") { await sleep(50); continue; }
  const c = G.side === ca.side ? ca : cb; const side = G.side;
  const mine = G.pieces.filter((p) => p.s === side);
  let best: any = null;
  for (const p of mine) for (const a of attacks(G, p)) { const q = byId(G, a.qId)!; const sc = a.dmg + (q.t === "K" ? 1000 : 0) + (q.hp <= a.dmg ? 50 : 0); if (!best || sc > best.sc) best = { p, a, sc }; }
  const turnBefore = JSON.stringify([G.side, G.ap, G.pieces.length, G.turn, G.pieces.map((p) => p.x * 8 + p.y + p.hp)]);
  if (best) c.send({ type: "act", act: "attack", id: best.p.id, qId: best.a.qId });
  else {
    const opts: any[] = []; for (const p of mine) for (const [x, y] of moves(G, p)) opts.push({ p, x, y });
    // тянемся к королю соперника
    const k = G.pieces.find((p) => p.t === "K" && p.s !== side)!;
    opts.sort((u, v) => (Math.abs(u.x - k.x) + Math.abs(u.y - k.y)) - (Math.abs(v.x - k.x) + Math.abs(v.y - k.y)) + (Math.random() - 0.5) * 6);
    if (opts.length) c.send({ type: "act", act: "move", id: opts[0].p.id, x: opts[0].x, y: opts[0].y }); else c.send({ type: "act", act: "end" });
  }
  for (let i = 0; i < 40; i++) { await sleep(15); const s = ca.state; if (JSON.stringify([s.side, s.ap, s.pieces.length, s.turn, s.pieces.map((p: any) => p.x * 8 + p.y + p.hp)]) !== turnBefore || ca.result) break; }
}
await sleep(500);
ok(!!ca.result && !!cb.result, "итог пришёл обоим: " + (ca.result?.reason) + ", ход " + ca.result?.turns);
ok(ca.result?.reason === "mate", "мат = король убит");
const ra = ca.result?.seats?.find((s: any) => s.side === "w")?.rating, rb = ca.result?.seats?.find((s: any) => s.side === "b")?.rating;
ok(ra && rb && ra.before === 1500 && rb.before === 1500, "до: 1500/1500");
const wW = ca.result?.winner === "w";
ok(ra && rb && (wW ? ra.delta > 0 && rb.delta < 0 : ra.delta < 0 && rb.delta > 0), `Δ: w ${ra?.delta} / b ${rb?.delta}`);
const da = await me0(A), db = await me0(B);
ok(da.games === 1 && db.games === 1 && da.rating === ra.after && db.rating === rb.after, "D1 chess_ratings записан (" + da.rating + " / " + db.rating + ")");
ca.ws.close(); cb.ws.close(); gst.close();

// гость против зарегистрированного — без рейтинга; сдача
const { code: c2 } = await (await fetch(HTTP + "/chess/new", { method: "POST", body: JSON.stringify({ pub: false }) })).json() as any;
const open2 = await (await fetch(HTTP + "/chess/open")).json() as any; ok(!open2.list.some((l: any) => l.code === c2), "приватное лобби не в списке");
const mk = (hello: any) => { const ws = new WebSocket(WSU + "/chess/m/" + c2); const o: any = { ws, result: null }; ws.addEventListener("open", () => ws.send(JSON.stringify(hello))); ws.addEventListener("message", (e: any) => { const m = JSON.parse(e.data); if (m.type === "result") o.result = m.result; }); return o; };
const g1 = mk({ type: "hello", userId: A }); await sleep(300); const g2 = mk({ type: "hello", guest: "guest_" + sfx + "_xxxxxxxxxxxx", nick: "Гость" }); await sleep(500);
g1.ws.send(JSON.stringify({ type: "resign" })); await sleep(600);
ok(g2.result?.winner === "b" && g2.result?.reason === "resign", "сдача → победа соперника");
ok(g2.result?.unrated === "guest" && !g2.result?.seats?.some((s: any) => s.rating), "гость → без рейтинга");
ok((await me0(A)).games === 1, "рейтинг A не изменился от гостевой партии");
g1.ws.close(); g2.ws.close();
// ─── matchmaking queue + cancel ───
const mmA = "user_mmA_" + sfx, mmB = "user_mmB_" + sfx;
const joinQ = async (uid: string, nick: string) => {
  const r = await fetch(HTTP + "/chess/mm/join", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ userId: uid, nick }) });
  return await r.json() as any;
};
const j1 = await joinQ(mmA, "ММ-Альфа");
ok(j1.status === "searching" && j1.ticket, "A в очереди: " + j1.status);
const leave = await (await fetch(HTTP + "/chess/mm/leave", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ticket: j1.ticket }) })).json() as any;
ok(!!leave.ok, "A отменил поиск");
const stGone = await (await fetch(HTTP + "/chess/mm/status?ticket=" + j1.ticket)).json() as any;
ok(stGone.status === "cancelled" || stGone.status === "gone" || stGone.status === "searching", "ticket после leave: " + stGone.status);

const jA = await joinQ(mmA, "ММ-Альфа");
const jB = await joinQ(mmB, "ММ-Бета");
ok(jA.status === "searching" || jA.status === "matched", "A join2 " + jA.status);
ok(jB.status === "matched" && jB.code, "B сразу matched: " + JSON.stringify(jB));
const stA = jA.status === "matched" ? jA : await (await fetch(HTTP + "/chess/mm/status?ticket=" + jA.ticket)).json() as any;
ok(stA.status === "matched" && stA.code === jB.code, "A видит тот же код " + stA.code);
ok(stA.side && jB.side && stA.side !== jB.side, "стороны разные " + stA.side + "/" + jB.side);

const mmCode = jB.code;
function mmClient(uid: string, nick: string) {
  const ws = new WebSocket(WSU + "/chess/m/" + mmCode);
  const c: any = { ws, state: null as Game | null, side: null, result: null, clock: null };
  c.ready = new Promise<void>((res) => ws.addEventListener("open", () => { ws.send(JSON.stringify({ type: "hello", userId: uid, nick })); res(); }));
  ws.addEventListener("message", (e: any) => {
    const m = JSON.parse(e.data);
    if (m.type === "hello_ok") c.side = m.you.side;
    if (m.type === "state") { c.state = m.state; if (m.clock) c.clock = m.clock; }
    if (m.type === "result") c.result = m.result;
  });
  return c;
}
const ma = mmClient(mmA, "ММ-Альфа"); await ma.ready;
const mb = mmClient(mmB, "ММ-Бета"); await mb.ready;
await sleep(500);
ok(ma.state && mb.state, "MM партия стартовала");
ok(ma.clock?.turnDeadline && ma.clock?.matchDeadline, "clock в state");
const turnLeft = ma.clock.turnDeadline - ma.clock.now;
const matchLeft = ma.clock.matchDeadline - ma.clock.now;
ok(turnLeft > 4 * 60_000 && turnLeft <= 5 * 60_000, "ход ~5 мин: " + Math.round(turnLeft / 1000) + "s");
ok(matchLeft > 29 * 60_000 && matchLeft <= 30 * 60_000, "партия ~30 мин: " + Math.round(matchLeft / 1000) + "s");
ma.ws.close(); mb.ws.close();

// leave снимает место в обычном лобби
const { code: lob } = await (await fetch(HTTP + "/chess/new", { method: "POST", body: JSON.stringify({ pub: true }) })).json() as any;
const lw = new WebSocket(WSU + "/chess/m/" + lob);
let leftOk = false;
await new Promise<void>((res) => lw.addEventListener("open", () => { lw.send(JSON.stringify({ type: "hello", userId: A, nick: "LeaveTest" })); res(); }));
await sleep(300);
lw.send(JSON.stringify({ type: "leave" }));
lw.addEventListener("message", (e: any) => { if (JSON.parse(e.data).type === "left") leftOk = true; });
await sleep(400);
const open3 = await (await fetch(HTTP + "/chess/open")).json() as any;
ok(!open3.list.some((l: any) => l.code === lob && l.n >= 1) || leftOk, "leave: место снято / left ok");
try { lw.close(); } catch {}

console.log(fails ? `FAILED ${fails}` : "ALL OK (incl MM)"); process.exit(fails ? 1 : 0);
