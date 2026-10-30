// Плейтест рельефа и вида фигур (локально: astro 4391 + wrangler 8871). Скриншоты → /workspace/minigame-tz/shots/s2-*.png
import { createRequire } from "module"; const require = createRequire("/workspace/mc-ui-tools/");
const { chromium } = require("playwright-core");
const SITE = "http://127.0.0.1:4391/games/strategy", OUT = "/workspace/minigame-tz/shots/", WS = "ws://127.0.0.1:8871";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const T = Date.now(), errs = [];
const br = await chromium.launch({ executablePath: "/usr/bin/google-chrome", args: ["--no-sandbox"] });
async function player(uid, w = 1180, h = 960, dsf = 1) {
  const ctx = await br.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: dsf });
  await ctx.addCookies([{ name: "mg_dev_noclerk", value: "1", url: "http://127.0.0.1:4391" }]);
  const p = await ctx.newPage(); p.on("dialog", (d) => d.accept().catch(() => {})); p.on("pageerror", (e) => errs.push(uid + ": " + e.message)); p.on("console", (m) => m.type() === "error" && !/favicon|404/.test(m.text()) && errs.push(uid + " console: " + m.text()));
  return p;
}
async function playOne(P) {
  const plan = await P.evaluate(() => window.__stratPlan?.());
  if (plan === "over") return "over"; if (!plan || plan === "wait") return "wait";
  if (plan === "end") { await P.click("#end"); return "end"; }
  await P.mouse.click(...plan.from); await sleep(120); await P.mouse.click(...plan.to); await sleep(250); return "act";
}
const setStyle = async (P, st) => { const cur = await P.$eval("#pstyle", (e) => e.dataset.style); if (cur !== st) await P.click("#pstyle"); await sleep(250); };
const uA = "strat_" + T + "_Alex", uB = "strat_" + T + "_Mira";
const A = await player("A", 1180, 960, 2), B = await player("B");
await A.goto(SITE + "?devUser=" + uA); await sleep(1500);
// 1) 15×15 с ботом: лобби с предпросмотром карты
await A.selectOption("#size", "15"); await A.click("#create"); await sleep(1500);
await A.selectOption("#mapsel", "o15a"); await sleep(800);
await A.screenshot({ path: OUT + "s2-01-lobby-15-map-preview.png" });
await A.click("#bot"); await A.click('[data-race="fire"]'); await sleep(300); await A.click("#ready"); await sleep(1500);
await setStyle(A, "figures");
for (let i = 0; i < 4; i++) { const r = await playOne(A); if (r === "wait") await sleep(700); }
await sleep(1200);
await A.screenshot({ path: OUT + "s2-02-play-15-figures.png" });
await (await A.$("#board")).screenshot({ path: OUT + "s2-03-board-15-figures.png" });
await setStyle(A, "tokens");
await (await A.$("#board")).screenshot({ path: OUT + "s2-04-board-15-tokens.png" });
await setStyle(A, "figures");
// крупный план постройки: ищем ячейку со структурой без фигуры, кликаем (инфо о клетке) и снимаем окрестность
const pick = await A.evaluate(() => { const S = window.__stratS(), m = S.g.map, n = m.size; const occ = new Set(S.g.pieces.map((p) => p.x + "," + p.y));
  const pr = ["T", "W", "M", "A", "S", "V", "X", "O", "D", "Q", "R"]; for (const ch of pr) for (let i = 0; i < n * n; i++) { const x = i % n, y = (i / n) | 0; if (m.s[i] === ch && !occ.has(x + "," + y) && x > 0 && x < n - 1 && y > 0 && y < n - 1) return { x, y, n, you: S.you, ch }; } return null; });
const bb = await (await A.$("#board")).boundingBox(); const cell = bb.width / pick.n;
const px = (pick.you === 1 ? pick.n - 1 - pick.x : pick.x), py = (pick.you === 1 ? pick.n - 1 - pick.y : pick.y);
await A.mouse.click(bb.x + (px + 0.5) * cell, bb.y + (py + 0.5) * cell); await sleep(300);
await A.screenshot({ path: OUT + "s2-05-structure-closeup.png", clip: { x: bb.x + Math.max(0, px - 2) * cell, y: bb.y + Math.max(0, py - 2) * cell, width: cell * 5, height: cell * 5 } });
await (await A.$("#info")).screenshot({ path: OUT + "s2-06-cell-info.png" });
await setStyle(A, "figures");
console.log("closeup struct:", pick.ch, "info:", (await A.textContent("#info")).slice(0, 160));
console.log("15 status:", await A.textContent("#status"));
await A.click("#forfeit").catch(() => {}); await sleep(400);
// 2) 8×8 вдвоём: обе стороны в «фигурах», крупно
await A.goto(SITE + "?devUser=" + uA); await sleep(1200); await B.goto(SITE + "?devUser=" + uB); await sleep(1200);
await A.selectOption("#size", "8"); await A.click("#create"); await sleep(1500);
const code = (await A.textContent("#code")).trim();
await B.fill("#joincode", code); await B.click("#joinbtn"); await sleep(1400);
await A.click('[data-race="fire"]'); await B.click('[data-race="ice"]'); await sleep(400);
await A.click("#ready"); await B.click("#ready"); await sleep(1500);
await setStyle(A, "figures"); await setStyle(B, "tokens");
for (let i = 0; i < 3; i++) { for (const P of [A, B]) await playOne(P); await sleep(350); }
await sleep(800);
await (await A.$("#board")).screenshot({ path: OUT + "s2-07-board-8-figures-A.png" });
await (await B.$("#board")).screenshot({ path: OUT + "s2-08-board-8-tokens-B-flipped.png" });
console.log("style persisted A:", await A.evaluate(() => localStorage.getItem("strat.pieceStyle")), "B:", await B.evaluate(() => localStorage.getItem("strat.pieceStyle")));
await A.click("#forfeit"); await sleep(600);
// 3) своя карта: сохраняем (pending), играем по коду — бейдж «без опыта»
await A.goto(SITE + "?devUser=" + uA); await sleep(1200);
await A.selectOption("#size", "8"); await A.click("#create"); await sleep(1500);
const saved = await A.evaluate(async ([WS, uid]) => {
  const S = window.__stratS(); const m = { ...S.lobbyMap, id: undefined, name: "Моя проба " + (Date.now() % 1000) };
  const ws = new WebSocket(WS + "/strat/hub");
  return await new Promise((res) => { ws.onopen = () => ws.send(JSON.stringify({ type: "hello", userId: uid }));
    ws.onmessage = (e) => { const x = JSON.parse(e.data); if (x.type === "hello_ok") ws.send(JSON.stringify({ type: "map_save", rq: 1, map: m })); if (x.type === "map_save_r") { ws.close(); res(x); } };
    setTimeout(() => res({ err: "timeout" }), 6000); });
}, [WS, uA]);
console.log("map_save:", JSON.stringify(saved));
await A.goto(SITE + "?devUser=" + uA); await sleep(1200); await A.selectOption("#size", "8"); await A.click("#create"); await sleep(1500);
const mid = saved.id || saved.map?.id;
if (mid) { await A.selectOption("#mapsel", mid).catch((e) => errs.push("select own map: " + e.message)); await sleep(900); }
await A.screenshot({ path: OUT + "s2-09-lobby-unapproved-badge.png" });
console.log("badge visible:", await A.isVisible("#mapbadge"), "mapInfo:", JSON.stringify(await A.evaluate(() => window.__stratS().mapInfo)));
await A.click("#bot"); await A.click('[data-race="ice"]'); await sleep(300); await A.click("#ready"); await sleep(1500);
await A.screenshot({ path: OUT + "s2-10-play-unapproved-badge.png" });
console.log("play badge visible:", await A.isVisible("#mapbadge2"));
// 4) админ-очередь (dev_strat_admin — локальная роль из match-test)
const M = await player("M"); await M.goto(SITE + "?devUser=dev_strat_admin"); await sleep(2500);
await M.screenshot({ path: OUT + "s2-11-admin-queue.png", fullPage: true });
console.log("admin card visible:", await M.isVisible("#admin"), "rows:", await M.$$eval(".modrow", (r) => r.length));
console.log("errors:", errs.length ? errs : "none");
await br.close();
