// Скриншоты этапа 5 (ui_v2 + стены + территория), локально: node .playtest-s5.mjs [real|demo|mob|all] → /workspace/minigame-tz/shots/s5-ui-*
import { createRequire } from "module"; const require = createRequire("/workspace/mc-ui-tools/");
const { chromium } = require("playwright-core");
const SITE = "http://127.0.0.1:4392/games/strategy", OUT = "/workspace/minigame-tz/shots/", WSQ = "&ws=ws://127.0.0.1:8872";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const T = Date.now() % 1e6, only = process.argv[2] || "all";
const br = await chromium.launch({ executablePath: "/usr/bin/google-chrome", args: ["--no-sandbox"] });
const errs = [];
async function player(uid, extra = "", mobile = false) {
  const ctx = await br.newContext({ viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 900 }, deviceScaleFactor: mobile ? 2 : 1, isMobile: mobile, hasTouch: mobile });
  await ctx.addCookies([{ name: "mg_dev_noclerk", value: "1", url: "http://127.0.0.1:4392" }]);
  const p = await ctx.newPage(); p.setDefaultTimeout(8000); p.on("pageerror", (e) => errs.push(uid + ": " + e.message)); p.on("console", (m) => m.type() === "error" && !/favicon|Failed to load resource/.test(m.text()) && errs.push(uid + " console: " + m.text()));
  p.on("response", (r) => r.status() >= 400 && !/favicon/.test(r.url()) && errs.push(uid + " HTTP " + r.status() + " " + r.url().slice(0, 140)));
  await p.goto(SITE + "?devUser=" + uid + extra + WSQ); await sleep(1800); await p.addStyleTag({ content: "astro-dev-toolbar{display:none!important}" }); return p;
}
const shot = async (P, name, wait = 600) => { await sleep(wait); await P.screenshot({ path: OUT + name + ".png" }); console.log("shot", name); };
const dev = (P, f, ...a) => { let done = false; return Promise.race([P.evaluate(([f, a]) => { const r = window.__stratDev[f](...a); return typeof r === "object" ? null : r; }, [f, a]).finally(() => (done = true)), sleep(8000).then(() => { if (!done) { errs.push("dev timeout " + f); console.log("dev timeout", f); } })]); };
const noAdmin = async (P, where) => { const n = await P.evaluate(() => document.querySelectorAll("#admin:not([hidden]), #modrefresh:not([hidden]), #modq:not([hidden]), [data-admin]").length); console.log("admin nodes", where, n); if (n) errs.push("admin entry visible for non-admin at " + where); };
const esc = (P) => P.keyboard.press("Escape").then(() => sleep(350));

if (only === "all" || only === "real") {
  const A = await player("s5_" + T + "_Alex");
  await noAdmin(A, "home"); await shot(A, "s5-ui-01-home");
  await A.selectOption("#size", "8"); await A.click("#create"); await sleep(1300);
  await A.click('[data-race="fire"]').catch(() => {}); await A.click('.ba-b[data-bot="1"][data-lv="medium"]').catch(() => {}); await sleep(900);
  await noAdmin(A, "lobby"); await shot(A, "s5-ui-02-lobby-free-pick-real");
  if (await A.isVisible("#hhp")) { await A.check("#hhp").catch(() => {}); await sleep(500); await A.locator("#hhpwrap").screenshot({ path: OUT + "s5-ui-03-lobby-hidden-hp-toggle.png" }).catch(() => {}); }
  await A.click("#ready"); await sleep(2200);
  if (await A.isVisible("#modals .namedlg")) { await A.fill("#modals .namedlg input", "Огнеяр"); await A.keyboard.press("Enter"); await sleep(500); }
  await noAdmin(A, "game"); await shot(A, "s5-ui-04-game-real-3col", 1800);
}
if (only === "all" || only === "demo") {
  const D = await player("s5_" + T + "_demo", "&demo=15&skirm=1");
  await noAdmin(D, "demo-game");
  await dev(D, "s5", {}); await dev(D, "chat"); await shot(D, "s5-ui-10-game-14ap-goals-chat", 900);
  await D.hover(".apbox2"); await shot(D, "s5-ui-11-ap-tooltip-sources", 700); await D.mouse.move(5, 5);
  const gl = await D.$("#goals .goal"); if (gl) { await gl.hover(); await shot(D, "s5-ui-12-goal-tooltip", 700); await D.mouse.move(5, 5); }
  await dev(D, "wmode", { k: "claim", city: 1 }); await dev(D, "cam", 5, 11, 80); await shot(D, "s5-ui-13-claim-cells-capture-walls-small", 900);
  await dev(D, "wmode", null); await dev(D, "cam", 6, 13, 170); await shot(D, "s5-ui-14-walls-closeup-256", 900);
  await dev(D, "cam", 7, 7, 40); await shot(D, "s5-ui-15-walls-lod-far", 900);
  await dev(D, "cam", 4, 6, 90); await shot(D, "s5-ui-16-founding-ring", 900);
  await dev(D, "fx", { e: "bdestroy", city: 2, b: "wall", owner: 1, by: 0 }); await dev(D, "cam", 6, 1, 90); await shot(D, "s5-ui-17-enemy-ruin-destroy-toast", 500);
  await dev(D, "fx", { e: "tcap", x: 7, y: 13, owner: 0, by: 1 }); await shot(D, "s5-ui-18-territory-lost-toast", 400);
  await dev(D, "fx", { e: "tcap", x: 8, y: 12, owner: 1, by: 0 }); await shot(D, "s5-ui-18b-territory-retaken-toast", 400);
  await dev(D, "tech"); await D.evaluate(() => document.querySelector("#techdlg .e4q, #techdlg .hidden-era")?.scrollIntoView({ block: "center" })); await shot(D, "s5-ui-19-tech-epoch4-q", 900); await esc(D);
  const D2 = await player("s5_" + T + "_hid", "&demo=15&skirm=1");
  await dev(D2, "s5", { hidden: true }); await dev(D2, "cam", 7, 6, 90); await shot(D2, "s5-ui-20-hidden-hp", 900);
  const L = await player("s5_" + T + "_lob", "&demo=8&skirm=1");
  await dev(L, "lobby8", "ffa", 8); await noAdmin(L, "demo-lobby"); await shot(L, "s5-ui-30-lobby8-free-rating-colours", 1500);
  await dev(L, "ratedLobby"); await shot(L, "s5-ui-31-lobby-rated-no-picker", 1500);
  await dev(L, "drum", 6); await shot(L, "s5-ui-32-drum-spinning", 700); await shot(L, "s5-ui-33-drum-revealed", 3200);
  await esc(L); await dev(L, "fav"); await shot(L, "s5-ui-34-fav-races-picker", 700); await esc(L);
  await dev(L, "prof"); await shot(L, "s5-ui-35-profile-coins", 1500); await esc(L);
}
if (only === "hist" || only === "all") {
  const H = await player("s5h" + T, "&demo=15&skirm=1");
  await dev(H, "s5", {}); await dev(H, "hist", 10); await shot(H, "s5-ui-50-moves-list-live", 700);
  await dev(H, "view", 3); await shot(H, "s5-ui-51-view-turn-N-banner", 700);
  const w = await H.$(".mv-e .mv-why"); if (w) { await w.hover(); await shot(H, "s5-ui-52-event-why-tooltip", 700); await H.mouse.move(5, 5); }
  await H.click('#histbar [data-hv="live"]'); await shot(H, "s5-ui-53-back-to-live", 600);
  await dev(H, "replay"); await H.click('#histbar [data-sp="2"]'); await H.click('#histbar [data-hv="play"]'); await shot(H, "s5-ui-54-replay-player-autoplay-2x", 1500);
  await H.click('#histbar [data-hv="save"]').catch(() => {}); await shot(H, "s5-ui-55-replay-saved", 600);
  await H.click('#histbar [data-hv="close"]'); 
  await dev(H, "prof"); await sleep(1200); await H.click('.ptab[data-t="lib"]').catch(() => errs.push("no lib tab")); await shot(H, "s5-ui-56-profile-library", 900); await esc(H);
  const HM = await player("s5hm" + T, "&demo=15&skirm=1", true);
  await dev(HM, "s5", {}); await dev(HM, "hist", 10); await dev(HM, "view", 4); await shot(HM, "s5-ui-57-mobile-view-turn", 900);
}
if (only === "all" || only === "mob") {

  const M = await player("s5_" + T + "_mob", "&demo=15&skirm=1", true);
  await dev(M, "s5", {}); await shot(M, "s5-ui-40-mobile-game", 900);
  await M.evaluate(() => window.scrollTo(0, 99999)); await shot(M, "s5-ui-41-mobile-game-scrolled", 600);
  const ML = await player("s5_" + T + "_mlob", "&demo=8&skirm=1", true);
  await dev(ML, "lobby8", "ffa", 8); await shot(ML, "s5-ui-42-mobile-lobby", 1300);
  await ML.evaluate(() => window.scrollTo(0, 99999)); await shot(ML, "s5-ui-43-mobile-lobby-leagues", 600);
}
await br.close();
console.log(errs.length ? "ERRORS:\n" + [...new Set(errs)].join("\n") : "no errors");
