import { createRequire } from "module"; const require = createRequire("/workspace/mc-ui-tools/");
const { chromium } = require("playwright-core");
const SITE = "http://127.0.0.1:4391/games/strategy", OUT = "/workspace/minigame-tz/shots/";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const T = Date.now();
const br = await chromium.launch({ executablePath: "/usr/bin/google-chrome", args: ["--no-sandbox"] });
const errs = [];
async function player(uid) {
  const ctx = await br.newContext({ viewport: { width: 1180, height: 900 }, deviceScaleFactor: 1 });
  await ctx.addCookies([{ name: "mg_dev_noclerk", value: "1", url: "http://127.0.0.1:4391" }]);
  const p = await ctx.newPage(); p.on("pageerror", (e) => errs.push(uid + ": " + e.message)); p.on("console", (m) => m.type() === "error" && errs.push(uid + " console: " + m.text()));
  return p;
}
const A = await player("A"), B = await player("B");
const uA = "strat_" + T + "_Alex", uB = "strat_" + T + "_Mira";
await A.goto(SITE + "?devUser=" + uA); await B.goto(SITE + "?devUser=" + uB);
await sleep(1500);
await A.screenshot({ path: OUT + "s1-01-home.png" });
await A.selectOption("#size", "8"); await A.click("#create"); await sleep(1200);
const code = (await A.textContent("#code")).trim(); console.log("code", code);
await B.fill("#joincode", code); await B.click("#joinbtn"); await sleep(1200);
await A.click('[data-race="fire"]'); await B.click('[data-race="ice"]'); await sleep(500);
await A.screenshot({ path: OUT + "s1-02-lobby-host.png" }); await B.screenshot({ path: OUT + "s1-03-lobby-guest-blind.png" });
await A.click("#ready"); await B.click("#ready"); await sleep(1200);
await A.screenshot({ path: OUT + "s1-04-start-A.png" });
// играем: каждый ход — первое доступное действие (атака приоритетно), выбирая фигуры кликами по холсту
async function playOne(P) {
  const plan = await P.evaluate(() => window.__stratPlan?.());
  if (plan === "over") return "over"; if (!plan || plan === "wait") return "wait";
  if (plan === "end") { await P.click("#end"); return "end"; }
  await P.mouse.click(...plan.from); await sleep(120); await P.mouse.click(...plan.to); await sleep(250); return "act";
}
let shotsTaken = 0;
for (let i = 0; i < 400; i++) {
  for (const P of [A, B]) {
    const r = await playOne(P);
    if (r === "over") i = 999;
  }
  await sleep(350);
  if (i === 2 && !shotsTaken) {
    for (const P of [A, B]) { const plan = await P.evaluate(() => window.__stratPlan?.()); if (plan?.from) { await P.mouse.click(...plan.from); await sleep(200); await P.screenshot({ path: OUT + "s1-05b-select-highlight.png" }); await P.mouse.click(...plan.from); break; } }
  }
  if (i === 5) { await B.goto("about:blank"); await sleep(1500); await A.screenshot({ path: OUT + "s1-05c-opponent-offline.png" }); await B.goto(SITE + "?devUser=" + uB + "&join=" + code); await sleep(2000); await B.screenshot({ path: OUT + "s1-05d-B-reconnected.png" }); }
  if (i === 3 && !shotsTaken++) { await A.screenshot({ path: OUT + "s1-05-play-A.png" }); await B.screenshot({ path: OUT + "s1-06-play-B-flipped.png" }); }
}
await sleep(800);
await A.screenshot({ path: OUT + "s1-07-end-A.png" }); await B.screenshot({ path: OUT + "s1-08-end-B.png" });
console.log("status A:", await A.textContent("#status")); console.log("status B:", await B.textContent("#status"));
await A.click("#rematch"); await B.click("#rematch"); await sleep(800); await A.screenshot({ path: OUT + "s1-09-rematch-lobby.png" });
// бот на 15×15
await A.click('[data-size="15"]'); await sleep(300); await A.click("#leave"); await sleep(800);
await A.selectOption("#size", "15"); await A.click("#create"); await sleep(1200);
await A.click("#bot"); await A.click('[data-race="ice"]'); await sleep(300); await A.click("#ready"); await sleep(1500);
for (let i = 0; i < 6; i++) { const r = await playOne(A); if (r === "wait") await sleep(600); }
await sleep(1500); await A.screenshot({ path: OUT + "s1-10-bot-15x15.png" });
console.log("bot status:", await A.textContent("#status"));
console.log("errors:", errs.length ? errs : "none");
await br.close();
