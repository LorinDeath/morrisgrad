// Плейтест этапа 2 (локально, 2 клиента): node .playtest-s3.mjs → /workspace/minigame-tz/shots/s3-*
import { createRequire } from "module"; const require = createRequire("/workspace/mc-ui-tools/");
const { chromium } = require("playwright-core");
const SITE = "http://127.0.0.1:4391/games/strategy", OUT = "/workspace/minigame-tz/shots/", WS = "ws://127.0.0.1:8871/strat/hub";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const T = Date.now(), only = process.argv[2] || "all";
// админ-правка только для витрины (быстрый опыт/запас ресурсов), в конце сбрасывается
async function adminPatch(patch) {
  const ws = new WebSocket(WS, { headers: { Origin: "http://127.0.0.1:4391" } });
  await new Promise((r) => (ws.onopen = r)); const got = new Promise((r) => (ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.type === "hello_ok") ws.send(JSON.stringify({ type: "cfg_set", rq: 1, patch })); if (m.type === "cfg_set_r") r(m); }));
  ws.send(JSON.stringify({ type: "hello", userId: "dev_strat_admin", nick: "Админ" })); const r = await got; ws.close(); return r;
}
const br = await chromium.launch({ executablePath: "/usr/bin/google-chrome", args: ["--no-sandbox"] });
const errs = [];
async function player(uid, vp = { width: 1280, height: 900 }, extra = "", mobile = false) {
  const ctx = await br.newContext({ viewport: vp, deviceScaleFactor: mobile ? 2 : 1, isMobile: mobile, hasTouch: mobile });
  await ctx.addCookies([{ name: "mg_dev_noclerk", value: "1", url: "http://127.0.0.1:4391" }]);
  const p = await ctx.newPage(); p.on("pageerror", (e) => errs.push(uid + ": " + e.message)); p.on("console", (m) => m.type() === "error" && !/favicon|404/.test(m.text()) && errs.push(uid + " console: " + m.text()));
  p.uid = uid; await p.goto(SITE + "?devUser=" + uid + extra); await sleep(1500); return p;
}
const shot = async (P, name, sel) => { await sleep(500); if (sel) await P.locator(sel).screenshot({ path: OUT + name + ".png" }); else await P.screenshot({ path: OUT + name + ".png" }); console.log("shot", name); };
async function lobby(A, B, size, ra, rb, tl = "") {
  await A.selectOption("#size", String(size)); await A.click("#create"); await sleep(1200);
  const code = (await A.textContent("#code")).trim();
  if (B) { await B.fill("#joincode", code); await B.click("#joinbtn"); await sleep(1200); }
  await A.click(`[data-race="${ra}"]`); if (B) await B.click(`[data-race="${rb}"]`); else await A.click("#bot"); await sleep(500);
  return code;
}
async function start(A, B) { await A.click("#ready"); if (B) await B.click("#ready"); await sleep(1500); }
async function setStyle(P, want) { const cur = await P.getAttribute("#pstyle", "data-style"); if (cur !== want) { await P.click("#pstyle"); await sleep(400); } }
async function playOne(P) {
  const plan = await P.evaluate(() => { document.querySelector("#board").scrollIntoView({ block: "center" }); return window.__stratPlan?.(); });
  if (plan === "over") return "over"; if (!plan || plan === "wait") return "wait";
  if (plan === "end") { await P.click("#end"); return "end"; }
  await P.mouse.click(...plan.from); await sleep(120); await P.mouse.click(...plan.to); await sleep(250); return "act";
}
const S = (P) => P.evaluate(() => { const s = window.__stratS(); return s && { you: s.you, phase: s.phase, cur: s.g?.cur, pieces: s.g?.pieces, ec: s.g?.ec, size: s.g?.size }; });
const cellPx = (P, x, y) => P.evaluate(([x, y]) => { document.querySelector("#board").scrollIntoView({ block: "center" }); const s = window.__stratS(), n = s.g.size, r = document.querySelector("#board").getBoundingClientRect(), c = r.width / n; if (s.you === 1) { x = n - 1 - x; y = n - 1 - y; } return [r.left + (x + .5) * c, r.top + (y + .5) * c]; }, [x, y]);

if (only === "all" || only === "econ") {
  console.log("patch", await adminPatch({ econ: { start: { gold: 40, know: 14 }, xp: { lv: [0, 0, 1, 2] } } }));
  const A = await player("s3_" + T + "_Alex"), B = await player("s3_" + T + "_Mira");
  await A.selectOption("#size", "15"); await A.click("#create"); await sleep(1200);
  const code = (await A.textContent("#code")).trim(); await B.fill("#joincode", code); await B.click("#joinbtn"); await sleep(1200);
  await A.click('[data-race="fire"]'); await B.click('[data-race="ice"]'); await sleep(600);
  await shot(A, "s3-01-lobby-6-races");
  await start(A, B);
  let P = (await S(A)).cur === (await S(A)).you ? A : B; const O = P === A ? B : A;
  await shot(P, "s3-02-econ-bar-desktop");
  await P.click("#ecbar [data-city]"); await sleep(500); await shot(P, "s3-03-castle-panel-desktop");
  await P.click('#citycard [data-b="barracks"]'); await sleep(800); await shot(P, "s3-04-castle-built-barracks");
  await P.click("#techbtn"); await sleep(500); await shot(P, "s3-05-tech-tree-desktop");
  await P.click('#techdlg [data-t="formation"]'); await sleep(800); await shot(P, "s3-06-tech-researched-exclusive-locked");
  await P.keyboard.press("Escape"); await sleep(300);
  // мобильный вид того же игрока
  const M = await player(P.uid, { width: 390, height: 844 }, "&join=" + code, true); await sleep(1500); await M.evaluate(() => document.querySelector("#ecbar").scrollIntoView());
  await shot(M, "s3-07-econ-mobile");
  await M.click("#ecbar [data-city]"); await sleep(500); await M.locator("#citycard").scrollIntoViewIfNeeded(); await shot(M, "s3-08-castle-mobile");
  await M.click("#techbtn"); await sleep(500); await shot(M, "s3-09-tech-mobile");
  await M.close();
  await P.reload(); await sleep(2000);
  // играем до первого опыта → выбор таланта
  let talShot = false;
  for (let i = 0; i < 160 && !talShot; i++) {
    for (const Q of [A, B]) {
      const s = await S(Q); if (s.phase === "over") { i = 999; break; }
      if (s.cur === s.you) { const p = s.pieces.find((p) => p.o === s.you && (p.xp || 0) >= 1 && !(p.tl || []).length); 
        if (p) { await Q.mouse.click(...(await cellPx(Q, p.x, p.y))); await sleep(500); await shot(Q, "s3-10-talent-choice"); await Q.click("#info [data-tal]").catch(() => {}); await sleep(600); await shot(Q, "s3-11-talent-taken"); talShot = true; break; } }
      await playOne(Q);
    }
    await sleep(200);
  }
  await shot(A, "s3-12-midgame-15-A"); await shot(B, "s3-13-midgame-15-B-flipped");
  for (const Q of [A, B]) await Q.context().close();
  console.log("patch reset", await adminPatch({}));
}
if (only === "all" || only === "boards") {
  for (const size of [15, 8]) {
    const A = await player("s3b_" + size + "_" + T); const code = await lobby(A, null, size, "fire", null); await start(A, null);
    const Bf = await player("s3b_" + size + "_" + T, { width: 1280, height: 900 }, "&terrainArt=0&join=" + code); await sleep(1500);
    for (const st of ["figures", "tokens"]) { await setStyle(Bf, st); await shot(Bf, `s3-2${size === 15 ? 0 : 4}-board${size}-before-${st}`, "#board"); }
    await Bf.close(); await A.reload(); await sleep(2500);
    for (const st of ["figures", "tokens"]) { await setStyle(A, st); await shot(A, `s3-2${size === 15 ? 2 : 6}-board${size}-after-${st}`, "#board"); }
    await setStyle(A, "figures"); await shot(A, `s3-2${size === 15 ? 8 : 9}-full-${size}-after`);
    await A.context().close();
  }
}
if (only === "all" || only === "races") {
  for (const [size, ra, rb] of [[8, "stone", "water"], [15, "nature", "lightning"]]) {
    const A = await player("s3r_" + ra + T), B = await player("s3r_" + rb + T); await lobby(A, B, size, ra, rb); await start(A, B);
    for (let i = 0; i < 6; i++) { for (const Q of [A, B]) await playOne(Q); await sleep(200); }
    await shot(A, `s3-3${size === 8 ? 0 : 2}-race-${ra}-vs-${rb}`); await shot(B, `s3-3${size === 8 ? 1 : 3}-race-${rb}-view`);
    for (const Q of [A, B]) await Q.context().close();
  }
}
console.log("errors:", errs.length ? errs.slice(0, 20) : "none");
await br.close();
