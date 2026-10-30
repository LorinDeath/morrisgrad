// Скриншоты этапа 4 (новый интерфейс), локально: node .playtest-s4.mjs [part] → /workspace/minigame-tz/shots/s4-ui-*
import { createRequire } from "module"; const require = createRequire("/workspace/mc-ui-tools/");
const { chromium } = require("playwright-core");
const SITE = "http://127.0.0.1:4392/games/strategy", OUT = "/workspace/minigame-tz/shots/", WSQ = "&ws=ws://127.0.0.1:8872";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const T = Date.now() % 1e6, only = process.argv[2] || "all";
const br = await chromium.launch({ executablePath: "/usr/bin/google-chrome", args: ["--no-sandbox"] });
const errs = [];
async function player(uid, extra = "", mobile = false, vp) {
  const ctx = await br.newContext({ viewport: vp || (mobile ? { width: 390, height: 844 } : { width: 1440, height: 900 }), deviceScaleFactor: mobile ? 2 : 1, isMobile: mobile, hasTouch: mobile });
  await ctx.addCookies([{ name: "mg_dev_noclerk", value: "1", url: "http://127.0.0.1:4392" }]);
  const p = await ctx.newPage(); p.on("pageerror", (e) => errs.push(uid + ": " + e.message)); p.on("console", (m) => m.type() === "error" && !/favicon/.test(m.text()) && errs.push(uid + " console: " + m.text()));
  await p.goto(SITE + "?devUser=" + uid + extra + WSQ); await sleep(1800); await p.addStyleTag({ content: "astro-dev-toolbar{display:none!important}" }); return p;
}
const shot = async (P, name, wait = 600) => { await sleep(wait); await P.screenshot({ path: OUT + name + ".png" }); console.log("shot", name); };
const dev = (P, f, ...a) => P.evaluate(([f, a]) => window.__stratDev[f](...a), [f, a]);
const noAdmin = async (P, where) => { const n = await P.evaluate(() => document.querySelectorAll("#admin, #modrefresh, #modq, [data-admin]").length); console.log("admin nodes", where, n); if (n) errs.push("admin entry visible for non-admin at " + where); };

if (only === "all" || only === "real") {
  const A = await player("s4_" + T + "_Alex");
  await noAdmin(A, "home"); await shot(A, "s4-ui-01-home");
  await A.selectOption("#size", "8"); await A.click("#create"); await sleep(1300);
  await A.click('[data-race="fire"]'); await A.click('.ba-b[data-bot="1"][data-lv="medium"]'); await sleep(900);
  await noAdmin(A, "lobby"); await shot(A, "s4-ui-02-lobby-races-maps");
  await A.click("#ready"); await sleep(2200);
  if (await A.isVisible("#modals .namedlg")) { await shot(A, "s4-ui-03-chief-naming", 300); await A.fill("#modals .namedlg input", "Огнеяр"); await A.keyboard.press("Enter"); await sleep(500); }
  await noAdmin(A, "game"); await shot(A, "s4-ui-04-game-desktop", 1800);
  const c = await A.$("#ecbar [data-city]"); if (c) { await c.click(); await shot(A, "s4-ui-05-city-recruit-build", 700); await A.keyboard.press("Escape"); await sleep(300); const x = await A.$("#citydlg [data-x]"); if (x) await x.click(); }
  await A.click("#techbtn"); await shot(A, "s4-ui-06-tech-tree-fog", 900);
  const t = await A.$('#techdlg [data-t]:not([aria-disabled])');
  if (t) { await t.click(); await shot(A, "s4-ui-07-tech-unveil", 450); await shot(A, "s4-ui-07b-tech-after-research", 1200); }
  const xb = await A.$("#techdlg [data-x]"); if (xb) await xb.click(); await sleep(300);
  await A.click("#forfeit"); await shot(A, "s4-ui-08-confirm-surrender", 600); await A.click("#modals .ovl:last-child .btn.ghost, #modals [data-v='false']").catch(() => A.keyboard.press("Escape")); await sleep(400);
}
if (only === "all" || only === "demo") {
  const D = await player("s4_" + T + "_demo", "&demo=8&skirm=1");
  await noAdmin(D, "demo-game"); await shot(D, "s4-ui-09-facing-skirmish", 1200);
  const pas = await D.$("#score .pas, #chief .pas, .pas"); if (pas) { await pas.hover(); await shot(D, "s4-ui-10-passive-tooltip", 700); }
  await D.mouse.move(5, 5);
  await dev(D, "chief"); await shot(D, "s4-ui-11-chief-tree-fog", 900); await D.keyboard.press("Escape"); await sleep(400);
  await dev(D, "name", true); await shot(D, "s4-ui-12-chief-reborn-naming", 700); await D.keyboard.press("Escape"); await sleep(400);
  await dev(D, "toast", "Казармы построены", "good", "castle"); await dev(D, "toast", "Соперник: «Захват города» — 1 из 3", "bad", "castle"); await shot(D, "s4-ui-13-toasts", 500);
  await dev(D, "goal", 1); await shot(D, "s4-ui-14-goal-popup", 1100); await sleep(4300);
  await dev(D, "menu"); await shot(D, "s4-ui-15-pause-menu", 600); await D.keyboard.press("Escape"); await sleep(400);
  await dev(D, "over", 0); await shot(D, "s4-ui-16-victory", 1400);
  await dev(D, "over", 1); await shot(D, "s4-ui-17-defeat", 1400);
  for (const [n, name] of [[50, "s4-ui-18-map-50-minimap"], [100, "s4-ui-19-map-100-minimap"], [4, "s4-ui-20-map-4x4"]]) {
    const P = await player("s4_" + T + "_m" + n, "&demo=" + n); await shot(P, name, 1200); await P.context().close(); }
  // мобильный: игра + долгое нажатие на пассивку
  const M = await player("s4_" + T + "_mob", "&demo=8&skirm=1", true); await shot(M, "s4-ui-21-mobile-game", 900);
  const mp = await M.$(".pas"); if (mp) { const b = await mp.boundingBox(); await M.evaluate(() => scrollTo(0, 0)); await mp.scrollIntoViewIfNeeded(); const bb = await mp.boundingBox();
    await M.touchscreen.tap(bb.x + 4, bb.y + 4).catch(() => {}); await mp.dispatchEvent("pointerdown", { pointerType: "touch", isPrimary: true, clientX: bb.x + 4, clientY: bb.y + 4 }); await sleep(700); await mp.dispatchEvent("pointerup", { pointerType: "touch" }); await shot(M, "s4-ui-22-mobile-longpress-sheet", 400); }
  const H = await player("s4_" + T + "_mh", "", true); await shot(H, "s4-ui-23-mobile-home", 600);
}
if (only === "all" || only === "new") {
  const D = await player("s4_" + T + "_new", "&demo=8&skirm=1");
  const my = await D.evaluate(() => { const S = window.__stratS(); const ps = S.g.pieces.filter((p) => p.o === S.you); return { king: ps.find((p) => p.k === "king"), unit: ps.find((p) => p.k !== "king") }; });
  await dev(D, "aim", "fire", 4, 3, 2); await shot(D, "s4-ui-24-ult-telegraph", 500);
  await dev(D, "ult", "fire", 4, 3); await shot(D, "s4-ui-25-ult-doom-banner", 420); await sleep(2600); await shot(D, "s4-ui-26-ult-doom-overlay", 200);
  await dev(D, "ult", "lightning", 3, 4); await shot(D, "s4-ui-27-ult-lightning", 500); await sleep(2500);
  await dev(D, "ult", "ice", 5, 2, true); await shot(D, "s4-ui-28-unit-ult-small", 400); await sleep(1800);
  if (my.unit) { await dev(D, "lvl", my.unit.id, 2); await dev(D, "sel", my.unit.id); await shot(D, "s4-ui-29-levelup-dock-abilities", 700); }
  await dev(D, "chief5"); if (my.king) await dev(D, "sel", my.king.id); await shot(D, "s4-ui-30-chief-l5-ult-button", 700);
  await dev(D, "chat"); await shot(D, "s4-ui-31-chat-whisper", 600);
  await dev(D, "timer", 5000, 60000); await dev(D, "away", 1, true); await shot(D, "s4-ui-32-timer-warn-away", 600);
  await dev(D, "claim"); await shot(D, "s4-ui-33-away-claim", 500);
  await dev(D, "ffa", 3); await dev(D, "bl", 1); await shot(D, "s4-ui-34-blacklist", 900); await D.keyboard.press("Escape"); await sleep(300);
  await dev(D, "ffa", 6); await shot(D, "s4-ui-35-ffa6-hud", 700);
  await dev(D, "menu"); await shot(D, "s4-ui-36-menu-profile-ratings", 800);
  await D.click("#modals [data-top]"); await shot(D, "s4-ui-37-leaderboard", 900); await D.keyboard.press("Escape"); await sleep(300); await D.keyboard.press("Escape"); await sleep(300);
  await dev(D, "ffa", 2); await dev(D, "over", 0); await shot(D, "s4-ui-38-victory-rating", 1500); await D.keyboard.press("Escape"); await sleep(300);
  await dev(D, "lobby8", "2v2", 4); await D.evaluate(() => { window.__stratS().ranked = true; window.__stratDev.render(); }); await shot(D, "s4-ui-39-lobby-2v2-ranked", 700);
  await dev(D, "lobby8", "ffa", 8); await shot(D, "s4-ui-40-lobby-ffa8-bots", 700);
  await dev(D, "prof"); await shot(D, "s4-ui-43-profile-public", 900);
  await D.click("#profdlg .ptab[data-t=priv]"); await shot(D, "s4-ui-44-profile-private", 600); await D.keyboard.press("Escape"); await sleep(300);
  await dev(D, "resume"); await shot(D, "s4-ui-41-home-resume", 700);
  const M = await player("s4_" + T + "_mobchat", "&demo=8&skirm=1", true); await dev(M, "chat"); await shot(M, "s4-ui-42-mobile-chat-sheet", 700);
  await M.evaluate(() => document.querySelector(".chat")?.classList.remove("open")); await dev(M, "prof"); await shot(M, "s4-ui-45-mobile-profile", 900);
}
console.log(errs.join("\n") || "no errors"); await br.close();
