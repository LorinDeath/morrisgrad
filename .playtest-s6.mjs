// Скриншоты этапа 6 (арт построек Художника), локально: node .playtest-s6.mjs [lobby|demo|v2|t2|walls|p2|mob|menu|mobile|all] → /workspace/minigame-tz/shots/s6-ui-*
import { createRequire } from "module"; const require = createRequire("/workspace/mc-ui-tools/");
const { chromium } = require("playwright-core");
const SITE = "http://127.0.0.1:4392/games/strategy", OUT = "/workspace/minigame-tz/shots/", WSQ = "&ws=ws://127.0.0.1:8872";
const SUF = process.env.SUF || "", N = (n) => n + SUF;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const T = Date.now() % 1e6, only = process.argv[2] || "all";
const br = await chromium.launch({ executablePath: "/usr/bin/google-chrome", args: ["--no-sandbox"] });
const errs = [];
async function player(uid, extra = "", mobile = false) {
  const vp = typeof mobile === "object" ? mobile : mobile ? { width: 390, height: 844 } : { width: 1440, height: 900 }, touch = !!mobile;
  const ctx = await br.newContext({ viewport: vp, deviceScaleFactor: touch ? 2 : 1, isMobile: touch && vp.width < 1000, hasTouch: touch });
  await ctx.addCookies([{ name: "mg_dev_noclerk", value: "1", url: "http://127.0.0.1:4392" }]);
  const p = await ctx.newPage(); p.setDefaultTimeout(8000); p.on("pageerror", (e) => errs.push(uid + ": " + e.message + " @ " + String(e.stack || "").split("\n").slice(1, 3).join(" ").slice(0, 240)));
  p.on("console", (m) => m.type() === "error" && !/favicon|Failed to load resource|WebSocket/.test(m.text()) && errs.push(uid + " console: " + m.text()));
  p.on("response", (r) => r.status() >= 400 && !/favicon/.test(r.url()) && errs.push(uid + " HTTP " + r.status() + " " + r.url().slice(0, 140)));
  await p.goto(SITE + "?devUser=" + uid + extra + WSQ); await sleep(1800); await p.addStyleTag({ content: "astro-dev-toolbar{display:none!important}" }); return p;
}
const shot = async (P, name, wait = 600) => { await sleep(wait); await P.screenshot({ path: OUT + N(name) + ".png" }); console.log("shot", N(name)); };
const dev = (P, f, ...a) => P.evaluate(([f, a]) => { const r = window.__stratDev[f](...a); return typeof r === "object" ? null : r; }, [f, a]).catch((e) => errs.push("dev " + f + ": " + e.message));
const noAdmin = async (P, where) => { const n = await P.evaluate(() => document.querySelectorAll("#admin:not([hidden]), #modrefresh:not([hidden]), #modq:not([hidden]), [data-admin]").length); console.log("admin nodes", where, n); if (n) errs.push("admin entry visible: " + where); };
const closeDlg = (P) => P.locator("[data-x]:visible").first().click().then(() => sleep(350)).catch((e) => errs.push("close: " + e.message));
const esc = (P) => P.keyboard.press("Escape").then(() => sleep(350));
const myCity = (P) => P.evaluate(() => { const { S } = window.__stratDev.dbg(); const c = S.g.ec.cities.find((q) => q.owner === S.you); return [c.id, c.x, c.y]; });
const enCity = (P) => P.evaluate(() => { const { S } = window.__stratDev.dbg(); const c = S.g.ec.cities.find((q) => q.owner !== S.you); return [c.id, c.x, c.y]; });
const king = (P) => P.evaluate(() => { const { S } = window.__stratDev.dbg(); return S.g.pieces.find((p) => p.o === S.you && p.k === "king")?.id; });

if (only === "all" || only === "lobby") {
  // сервер UI-репо не знает cfg.hiddenHp (есть только в WIP) — галочку показываем в демо-лобби с S.hiddenHp=true
  const L = await player("s6_" + T + "_lob", "&demo=8&skirm=1");
  await dev(L, "lobby8", "ffa", 4); await L.evaluate(() => { const { S } = window.__stratDev.dbg(); S.hiddenHp = true; S.ranked = false; S.rated = false; window.__stratDev.away(1, false); });
  await sleep(600); console.log("hhp visible/checked:", await L.isVisible("#hhp"), await L.isChecked("#hhp").catch(() => "?"));
  await L.evaluate(() => document.querySelector("#hhpwrap")?.scrollIntoView({ block: "center" })); await L.mouse.move(5, 5);
  await noAdmin(L, "lobby"); await shot(L, "s6-ui-01-lobby-hidden-hp-on", 700);
  await L.locator("#hhpwrap").screenshot({ path: OUT + N("s6-ui-01b-lobby-hidden-hp-toggle") + ".png" }).catch((e) => errs.push("hhpwrap: " + e.message));
  const LM = await player("s6_" + T + "_mlob", "&demo=8&skirm=1", true);
  await dev(LM, "lobby8", "ffa", 4); await LM.evaluate(() => { const { S } = window.__stratDev.dbg(); S.hiddenHp = true; S.ranked = false; S.rated = false; window.__stratDev.away(1, false); });
  await LM.evaluate(() => document.querySelector("#hhpwrap")?.scrollIntoView({ block: "center" })); await shot(LM, "s6-ui-02-mobile-lobby-hidden-hp-on", 700);
}
if (only === "all" || only === "demo") {
  const D = await player("s6_" + T + "_demo", "&demo=15&skirm=1");
  await noAdmin(D, "demo-game");
  await dev(D, "s5", {}); await dev(D, "s6", { stage: 2, ph: ["warcouncil"] }); const [cid, cx, cy] = await myCity(D);
  await dev(D, "cam", cx + 2, cy - 2, 100); await shot(D, "s6-ui-10-board-capital-buildings-hp", 1500);
  await dev(D, "cam", cx + 1, cy - 1, 160); await shot(D, "s6-ui-11-board-closeup-sprites-banner", 1200);
  const [eid, ex, ey] = await enCity(D); await dev(D, "cam", ex, ey + 2, 100); await shot(D, "s6-ui-12-board-enemy-city-ruin", 1200);
  await dev(D, "cam", cx, cy - 4, 45); await shot(D, "s6-ui-13-board-far-lod", 1200);
  const k = await king(D); await dev(D, "sel", k); await sleep(500);
  const bb = await D.$('[data-ca="build"]'); if (bb) { await bb.click(); await shot(D, "s6-ui-20-chief-build-picker", 1200); await esc(D); } else errs.push("no build button");
  await dev(D, "city", cid); await shot(D, "s6-ui-30-capital-window-slots-recruit", 1200);
  await D.evaluate(() => document.querySelector(".bslots")?.scrollIntoView({ block: "center" })); await shot(D, "s6-ui-31-capital-window-slots", 600); await closeDlg(D);
  await dev(D, "s6", { lvl: 2, lv2: true, stage: 3 }); await dev(D, "city", cid); await shot(D, "s6-ui-32-capital-lvl3-forge2-wonder3", 1200); await closeDlg(D);
  const mm = await D.addStyleTag({ content: "#minimapbox{display:none!important}" }); // мини-карта перекрывает чудо в углу — только для этих кадров
  for (const st of [1, 2, 3, 4]) { await dev(D, "s6", { stage: st }); await dev(D, "cam", cx + 2, cy - 2, 110); await shot(D, `s6-ui-4${st}-wonder-stage-${st === 4 ? "done" : st}`, 1200); }
  await mm.evaluate((e) => e.remove());
  await dev(D, "wpop", true); await shot(D, "s6-ui-45-wonder-built-popup", 1300); await esc(D);
  await dev(D, "wpop", false); await shot(D, "s6-ui-46-wonder-built-popup-enemy", 1300); await esc(D);
  const D2 = await player("s6_" + T + "_hid", "&demo=15&skirm=1");
  await dev(D2, "s5", { hidden: true }); await dev(D2, "s6", {}); const [, hx, hy] = await enCity(D2); await dev(D2, "cam", hx, hy + 2, 100); await shot(D2, "s6-ui-14-board-enemy-hidden-hp", 1300);
}
if (only === "all" || only === "v2") {
  // ui-v2 extras: рамки ОЗ, захват, покупка, кольцо поселения, башня, эпоха IV, барабан, повтор, монеты, ленты стен lod
  const V = await player("s6_" + T + "_v2", "&demo=15&skirm=1");
  await dev(V, "s5", {}); await dev(V, "s6", { stage: 2, ph: ["warcouncil"] }); const [cid, cx, cy] = await myCity(V);
  await dev(V, "cam", cx, cy - 1, 130); await shot(V, "s6-ui-60-v2-hp-frames-capture-settle-buy", 1500);
  const kp = await V.evaluate(() => { const { S } = window.__stratDev.dbg(); const p = S.g.pieces.find((q) => q.o === S.you && q.k === "king"); return [p.x, p.y]; });
  await V.addStyleTag({ content: "#minimapbox{display:none!important}" }).then((e) => e.evaluate((x) => (x.id = "mmhide")));
  await dev(V, "cam", kp[0], kp[1], 150); await shot(V, "s6-ui-60b-v2-settlement-ring-capture", 1200); await V.evaluate(() => document.getElementById("mmhide")?.remove());
  await dev(V, "wmode", { k: "claim", city: cid }); await shot(V, "s6-ui-61-v2-buy-marker-claim-mode", 900); await dev(V, "wmode", null);
  const tw = await V.evaluate(() => { const { S } = window.__stratDev.dbg(); const t = S.g.ec.towers[0]; return [t.x, t.y]; });
  await dev(V, "cam", tw[0] + 1, tw[1], 150); await shot(V, "s6-ui-62-v2-watchtower-sprite", 1200);
  const k = await king(V); await dev(V, "sel", k); await dev(V, "wmode", { k: "build", b: "watchtower", tower: true }); await dev(V, "cam", cx - 2, cy - 1, 100); await shot(V, "s6-ui-63-v2-tower-build-mode", 1000); await dev(V, "wmode", null);
  await dev(V, "cam", cx, cy - 3, 40); await shot(V, "s6-ui-64-v2-walls-lod-owner-bands", 1200);
  await V.click("#techbtn").catch((e) => errs.push("techbtn: " + e.message)); await sleep(900);
  await V.evaluate(() => document.querySelector(".tcell.e4, .e4fr")?.scrollIntoView({ block: "center", inline: "center" })); await shot(V, "s6-ui-65-v2-era4-node-frames", 600); await closeDlg(V);
  await dev(V, "hist", 8); await dev(V, "replay"); await shot(V, "s6-ui-66-v2-replay-bar-icons", 1200);
  await V.locator(".histbar").screenshot({ path: OUT + N("s6-ui-66b-v2-replay-bar-crop") + ".png" }).catch((e) => errs.push("histbar: " + e.message)); await dev(V, "live");
  await dev(V, "prof"); await shot(V, "s6-ui-67-v2-profile-coin", 1200); await esc(V);
  await dev(V, "drum", 6); await shot(V, "s6-ui-68-v2-race-drum-frame", 3600);
}
if (only === "all" || only === "mob") {
  const M = await player("s6_" + T + "_mob", "&demo=15&skirm=1", true);
  await dev(M, "s5", {}); await dev(M, "s6", { stage: 2 }); const [cid, cx, cy] = await myCity(M);
  await dev(M, "cam", cx, cy - 2, 70); await shot(M, "s6-ui-50-mobile-board-buildings", 1300);
  await dev(M, "city", cid); await shot(M, "s6-ui-51-mobile-capital-window", 1200);
  await M.evaluate(() => { const e = document.querySelector(".bslots"); e?.scrollIntoView({ block: "center" }); }); await shot(M, "s6-ui-52-mobile-capital-slots", 600); await closeDlg(M);
  const k = await king(M); await dev(M, "sel", k); await sleep(500);
  const bb = await M.$('[data-ca="build"]'); if (bb) { await bb.scrollIntoViewIfNeeded(); await bb.click(); await shot(M, "s6-ui-53-mobile-build-picker", 1200); await esc(M); } else errs.push("mob: no build button");
  await dev(M, "wpop", true); await shot(M, "s6-ui-54-mobile-wonder-popup", 1300);
}
if (only === "all" || only === "p2") {
  // UI P2/P2b: фоны меню/лобби (+ портрет), карточки рас/карт, вкладки режима, шапка профиля, плитки, полосы рас
  for (const [mob, sfx] of [[false, ""], [true, "-mobile"]]) {
    const H = await player("s6_" + T + "_p2h" + (mob ? "m" : ""), "", mob); await noAdmin(H, "home" + sfx); await shot(H, `s6-ui-84${sfx}-p2-menu-bg`, 900);
    const L = await player("s6_" + T + "_p2l" + (mob ? "m" : ""), "&demo=8&skirm=1", mob); await dev(L, "lobby8", "1v1", 2); await sleep(500);
    await L.evaluate(() => document.querySelector("#modes")?.scrollIntoView({ block: "start" })); await L.mouse.move(5, 5); await shot(L, `s6-ui-85${sfx}-p2-lobby-modes-races`, 900);
    await L.evaluate(() => document.querySelector("#races")?.scrollIntoView({ block: "center" })); await shot(L, `s6-ui-85b${sfx}-p2-race-cards`, 700);
    await L.evaluate(() => document.querySelector("#maps")?.scrollIntoView({ block: "center" })); await shot(L, `s6-ui-86${sfx}-p2-lobby-map-cards`, 900);
    const V = await player("s6_" + T + "_p2p" + (mob ? "m" : ""), "&demo=8&skirm=1", mob); await dev(V, "prof"); await shot(V, `s6-ui-87${sfx}-p2-profile`, 1300);
  }
}
if (only === "all" || only === "walls") {
  // walls-v2: A|B свои (общая стена + столбики), C враг снизу (двойная стена / частокол front), дорога → ворота; LOD на телефоне
  const A = await player("s6_" + T + "_wl", "&demo=15&skirm=1"); await dev(A, "s5", {}); await dev(A, "s6", { stage: 2 }); const [, cx, cy] = await myCity(A); await sleep(1500);
  await A.addStyleTag({ content: "#hint,#minimapbox{display:none!important}" });
  const wx = 8, wy = 8;
  for (const [nm, o, z] of [["80-walls2-shared-double-gates", {}, 85], ["81-walls2-front-palisade-split", { front: true }, 85], ["82-walls2-gates-open", { open: true }, 85]]) {
    await dev(A, "wtest", { x: wx, y: wy, ...o }); await dev(A, "cam", wx, wy, z); await shot(A, "s6-ui-" + nm, 1500); }
  const M = await player("s6_" + T + "_wlm", "&demo=15&skirm=1", true); await dev(M, "s5", {}); await dev(M, "s6", { stage: 2 }); await sleep(1500);
  await M.addStyleTag({ content: "#hint,#minimapbox{display:none!important}" });
  for (const [nm, z] of [["83-walls2-mobile-lod-40", 40], ["83b-walls2-mobile-small-60", 60]]) { await dev(M, "wtest", { x: wx, y: wy }); await dev(M, "cam", wx, wy, z); await shot(M, "s6-ui-" + nm, 1500); }
}
if (only === "all" || only === "t2") {
  // terrain-v2 + аудит: столица lv1..3, застава, захваченный город, территория, метки, зоны, мини-карта, LOD; M4/M5/M7/M10
  const A = await player("s6_" + T + "_t2", "&demo=15&skirm=1");
  await dev(A, "s5", {}); await dev(A, "s6", { stage: 2 }); const [cid, cx, cy] = await myCity(A); await sleep(2500); // ленивая догрузка t2
  const hideUi = (P) => P.addStyleTag({ content: "#hint,#minimapbox{display:none!important}" }); await hideUi(A);
  for (const lv of [0, 1, 2]) { await A.evaluate((lv) => { const { S } = window.__stratDev.dbg(); S.g.ec.cities.find((q) => q.owner === S.you && q.cap).lvl = lv; }, lv); await dev(A, "render"); await dev(A, "cam", cx + 1, cy - 1, 120); await shot(A, `s6-ui-70-t2-capital-lv${lv + 1}`, 1300); }
  const op = await A.evaluate(([cx, cy]) => { const { S } = window.__stratDev.dbg(), ec = S.g.ec; let c = ec.cities.find((q) => !q.cap);
    if (!c) { const n = S.g.size, free = (x, y) => x >= 0 && y >= 0 && x < n && y < n && !S.g.pieces.some((p) => p.x === x && p.y === y) && !ec.cities.some((q) => Math.abs(q.x - x) + Math.abs(q.y - y) < 3);
      let at = null; for (let r = 3; r < 8 && !at; r++) for (let dx = -r; dx <= r && !at; dx++) for (const dy of [-r, r]) if (!at && free(cx + dx, cy + dy)) at = [cx + dx, cy + dy];
      if (at) { c = { id: 900, owner: S.you, x: at[0], y: at[1], cap: false, growth: 0, lvl: 0, bld: [], forge: [], acted: false, sg: 0, name: "Застава" }; ec.cities.push(c);
        const c2 = { ...c, id: 901, owner: 1 - S.you, x: at[0] + 2, name: "Взятая" }; if (free(c2.x, c2.y)) ec.cities.push(c2); } }
    return c && [c.id, c.x, c.y]; }, [cx, cy]);
  if (op) await A.evaluate(() => { const { S } = window.__stratDev.dbg(); if (S.g.ec.cities.some((q) => q.id === 901)) window.__stratDev.capt(901); });
  if (op) { await dev(A, "render"); await dev(A, "cam", op[1] + 1, op[2], 140); await shot(A, "s6-ui-71-t2-outpost-captured-overlay", 1300); } else errs.push("t2: no outpost in demo");
  const k = await king(A); await dev(A, "sel", k); const kp = await A.evaluate(() => { const { S } = window.__stratDev.dbg(); const p = S.g.pieces.find((q) => q.o === S.you && q.k === "king"); return [p.x, p.y]; });
  await dev(A, "cam", kp[0], kp[1], 110); await A.mouse.move(760, 430); await shot(A, "s6-ui-72-t2-marks-move-attack-select-hover", 1200); await dev(A, "sel", -1);
  await A.evaluate(([x, y]) => { const { S } = window.__stratDev.dbg(); S.g.zones = [{ k: "burn", x: x - 3, y, r: 1 }, { k: "frost", x: x + 3, y, r: 1 }, { k: "wall", x, y: y - 3, r: 1 }, { k: "vines", x, y: y + 3, r: 1 }, { k: "flood", x: x + 3, y: y + 3, r: 1 }]; }, [cx, cy]);
  await dev(A, "cam", cx, cy, 70); await shot(A, "s6-ui-73-t2-zones-burn-frost-wall-vines-flood", 1500); await A.evaluate(() => { delete window.__stratDev.dbg().S.g.zones; });
  await A.evaluate(() => document.querySelectorAll("style").forEach((e) => /#hint,#minimapbox/.test(e.textContent) && e.remove())); await sleep(300);
  await A.locator("#minimapbox").screenshot({ path: OUT + N("s6-ui-74-t2-minimap-frame") + ".png" }).catch((e) => errs.push("minimap: " + e.message));
  await hideUi(A); await dev(A, "cam", cx, cy - 1, 60); await shot(A, "s6-ui-75-t2-territory-fill-blends", 1300);
  // M5: повторный захват 5 ходов (2 из 5), поселение 12 ходов
  await A.evaluate(([x, y]) => { const { S } = window.__stratDev.dbg(), n = S.g.size; S.g.ec.ct = { [(y - 2) * n + x + 1]: { o: 1 - S.you, n: 2, max: 5 } }; }, [cx, cy]); await dev(A, "render");
  await dev(A, "cam", cx + 1, cy - 2, 150); await shot(A, "s6-ui-76-audit-m5-capture-5-turns", 1200);
  const H = await player("s6_" + T + "_t2h", "&demo=15&skirm=1"); await dev(H, "s5", { hidden: true }); await dev(H, "s6", {}); const [, hx, hy] = await enCity(H); await hideUi(H);
  await dev(H, "cam", hx, hy + 2, 120); await shot(H, "s6-ui-77-audit-m4-hidden-hp-3-steps", 1300);
  const L = await player("s6_" + T + "_t2l", "&demo=8&skirm=1"); await dev(L, "lobby8", "ffa", 8);
  await L.evaluate(() => document.querySelector(".colrow")?.scrollIntoView({ block: "center" })); await shot(L, "s6-ui-78-audit-m10-player-swatches", 900);
  const M = await player("s6_" + T + "_t2m", "&demo=15&skirm=1", true); await dev(M, "s5", {}); const [, mx, my] = await myCity(M); await sleep(2000);
  await dev(M, "cam", mx, my, 16); await shot(M, "s6-ui-79-t2-mobile-lod64", 1500); await dev(M, "cam", mx, my, 30); await shot(M, "s6-ui-79b-t2-mobile-full-tiles", 1500);
}
if (only === "all" || only === "menu") {
  // главное меню: настоящий локальный сервер (r3) и демо-данные (?menudemo=1)
  const VP = { desk: false, p390: { width: 390, height: 844 }, l844: { width: 844, height: 390 }, tab: { width: 820, height: 1180 } };
  const small = async (P, nm) => { const n = await P.evaluate(() => [...document.querySelectorAll("#home button, #home select, #home input, .modal button")].filter((e) => { const r = e.getBoundingClientRect(); return r.width && r.height && (r.height < 44 && r.width < 44 || r.height < 30); }).map((e) => (e.id || e.className || e.tagName) + ":" + Math.round(e.getBoundingClientRect().width) + "x" + Math.round(e.getBoundingClientRect().height))); if (n.length) console.log("small targets", nm, n.join(", ")); };
  for (const [k, vp] of Object.entries(VP)) for (const md of ["", "&menudemo=1"]) {
    const P = await player("s6_" + T + "_mn" + k + (md ? "d" : ""), md, vp); await sleep(1200); await noAdmin(P, "menu " + k);
    const tag = k + (md ? "-demo" : "-server"); await shot(P, "s6-ui-menu-" + tag, md ? 900 : 5500);
    if (k !== "desk") await P.screenshot({ path: OUT + N("s6-ui-menu-" + tag + "-full") + ".png", fullPage: true });
    await small(P, tag);
    if (md || k === "desk") {
      await P.click("#topbtn"); await shot(P, "s6-ui-menu-" + tag + "-leaderboard", md ? 1500 : 6000); await esc(P);
      await P.click("#profbtn"); await shot(P, "s6-ui-menu-" + tag + "-profile", 1500); await esc(P);
      await P.click("#libbtn"); await shot(P, "s6-ui-menu-" + tag + "-library", md ? 1500 : 6000); await esc(P);
      if (md) { await P.click("#setbtn"); await shot(P, "s6-ui-menu-" + tag + "-settings", 700); await small(P, tag + " settings"); await esc(P);
        await P.click("#mapsbtn"); await shot(P, "s6-ui-menu-" + tag + "-maps-hub", 700); await esc(P);
        await P.click("#rulesbtn"); await sleep(500); await P.evaluate(() => document.getElementById("rules-leagues")?.scrollIntoView({ block: "start" })); await shot(P, "s6-ui-menu-" + tag + "-rules-leagues", 700); await esc(P);
        await P.click('.pmode[data-pm="bot"]'); await shot(P, "s6-ui-menu-" + tag + "-mode-bot", 400); }
    }
    await P.context().close();
  }
}
if (only === "all" || only === "mobile") {
  // мобильный проход по игровым экранам: 390×844, 844×390, планшет 820×1180; ОД до 14; цели ≥44px; ничего не теряется
  const VP = { p390: { width: 390, height: 844 }, l844: { width: 844, height: 390 }, l667: { width: 667, height: 375 }, tab: { width: 820, height: 1180 } };
  const small = async (P, nm) => { const n = await P.evaluate(() => [...document.querySelectorAll("#match button:not([hidden]), #match [role=button], .modal button, .sheet button")].filter((e) => { const r = e.getBoundingClientRect(), cs = getComputedStyle(e); return r.width && r.height && cs.visibility !== "hidden" && Math.max(r.width, r.height) < 44; }).map((e) => (e.id || e.getAttribute("data-ca") || e.className || e.tagName).toString().slice(0, 24) + ":" + Math.round(e.getBoundingClientRect().width) + "x" + Math.round(e.getBoundingClientRect().height))); console.log("small targets", nm, n.length, [...new Set(n)].slice(0, 30).join(", ")); };
  const missing = (P, nm) => P.evaluate(() => (getComputedStyle(document.getElementById("mtabs")).display !== "none" ? ["#end", ".apbox", "#techbtn", "#menubtn", "#chatfab", "#turnbox", "#mtabs"] : ["#end", ".apbox", "#score", "#techbtn", "#menubtn", "#goals", document.getElementById("chatfab")?.offsetParent ? "#chatfab" : "#chat", "#turnbox"]).map((q) => { const e = document.querySelector(q); if (!e) return q + ":none"; const inV = () => { const r = e.getBoundingClientRect(); return r.width && r.height && r.right <= innerWidth + 1 && r.bottom <= innerHeight + 1 && r.left >= -1 && r.top >= -1; }; if (inV()) return ""; const sy = scrollY; e.scrollIntoView({ block: "nearest" }); const ok = inV() && scrollY === sy; return q + (ok ? ":in-column-scroll" : ":off"); }).filter(Boolean)).then((m) => console.log("missing/offscreen", nm, m.join(" ") || "none"));
  for (const [k, vp] of Object.entries(VP)) {
    const M = await player("s6_" + T + "_mb" + k, "&demo=15&skirm=1", vp); await dev(M, "s5", {}); await dev(M, "s6", { stage: 2 }); await sleep(1200); await noAdmin(M, "mobile " + k);
    await M.evaluate(() => { const { S } = window.__stratDev.dbg(); S.g.ap = 14; S.g.apMax = 14; window.__stratDev.render(); }); await sleep(400);
    const [cid, cx, cy] = await myCity(M); await dev(M, "cam", cx, cy, 50);
    await shot(M, "s6-ui-mobile-" + k + "-board-ap14", 1200); await small(M, k + " board"); await missing(M, k + " board"); console.log("vp", k, await M.evaluate(() => { const r = document.getElementById("mtabs").getBoundingClientRect(); return [innerWidth, innerHeight, document.documentElement.scrollWidth, visualViewport?.height, Math.round(r.top), Math.round(r.bottom)].join(","); }));
    const kk = await king(M); await dev(M, "sel", kk); await shot(M, "s6-ui-mobile-" + k + "-selected-chief", 900); await small(M, k + " sel");
    // «Построить» без прокрутки страницы: кнопка целиком в окне, scrollY не менялся
    console.log("build-btn", k, await M.evaluate(() => { const b = document.querySelector('[data-ca="build"]'); if (!b) return "none"; const r = b.getBoundingClientRect(); const end = document.getElementById("end").getBoundingClientRect();
      return (r.top >= 0 && r.bottom <= innerHeight && r.height ? "in-view" : "OFF") + " y=" + Math.round(r.top) + " scrollY=" + Math.round(scrollY) + (r.bottom > end.top && r.top < end.bottom && r.right > end.left && r.left < end.right ? " OVERLAPS-END" : ""); }));
    console.log("uc-port", k, await M.evaluate(() => { const i = document.querySelector("#info .uc-port img"); if (!i) return "no-img"; const r = i.getBoundingClientRect(); return i.src.replace(location.origin, "") + " " + i.naturalWidth + "x" + i.naturalHeight + " box=" + Math.round(r.width) + "x" + Math.round(r.height); }));
    if (await M.$(".info-x:visible")) { await M.click(".info-x"); await sleep(300); console.log("info-x closes", k, await M.evaluate(() => !document.body.classList.contains("selinfo"))); }
    await dev(M, "sel", -1); await dev(M, "city", cid); await shot(M, "s6-ui-mobile-" + k + "-city-sheet", 1100); await small(M, k + " city");
    console.log("city-x-overlap", k, await M.evaluate(() => { const x = document.querySelector(".citydlg .xbtn, .modal .xbtn, .dlg .xbtn"), rs = [...document.querySelectorAll(".dlg-h .dlg-res > *")]; if (!x) return "no-x"; const a = x.getBoundingClientRect();
      return rs.filter((e) => { const r = e.getBoundingClientRect(); return r.right > a.left + 2 && r.left < a.right - 2 && r.bottom > a.top + 2 && r.top < a.bottom - 2; }).length ? "OVERLAP" : "clear"; }));
    await esc(M); await closeDlg(M);
    const tb = await M.$("#techbtn:visible"); if (tb) { await tb.click(); await sleep(900);
      console.log("tech-fit", k, await M.evaluate(() => { const sc = document.querySelector(".techscreen .tscroll"); if (!sc) return "none"; const cut = [...sc.querySelectorAll(".tnode")].filter((e) => { const r = e.getBoundingClientRect(), b = sc.getBoundingClientRect(); return r.top < b.top - 1 || r.bottom > b.bottom + 1; }).length;
        return "vscroll=" + (sc.scrollHeight - sc.clientHeight) + " hscroll=" + (sc.scrollWidth - sc.clientWidth) + " cards-cut-vertically=" + cut; }));
      await shot(M, "s6-ui-mobile-" + k + "-tech", 300); await esc(M); await closeDlg(M); }
    if (!(await M.$("#mtabs:visible"))) console.log("goals-in-view", k, await M.evaluate(() => { const g = document.getElementById("goals"), r = g.getBoundingClientRect(); return r.height && r.top >= 0 && r.bottom <= innerHeight + 1 ? "yes" : "no top=" + Math.round(r.top) + " bottom=" + Math.round(r.bottom); }));
    if (await M.$("#lcolbtn:visible")) { await M.click("#lcolbtn"); await sleep(400); await shot(M, "s6-ui-mobile-" + k + "-lcol-toggle", 300); console.log("lcol", k, await M.evaluate(() => getComputedStyle(document.querySelector("#play > .lside")).display + " sw=" + document.documentElement.scrollWidth)); await M.click("#lcolbtn"); await sleep(300); }
    // портрет: шторки по вкладкам — всё, что ушло с экрана, должно открываться
    if (await M.$("#mtabs:visible")) for (const [ms, q] of [["players", "#score"], ["goals", "#goals"], ["moves", "#moves"], ["view", "#pstyle"]]) {
      await M.click(`#mtabs [data-ms=${ms}]`); await sleep(350);
      const vis = await M.evaluate((q) => { const e = document.querySelector(q); if (!e) return "none"; const r = e.getBoundingClientRect(); return r.width && r.height && r.top >= 0 && r.bottom <= innerHeight + 1 ? "ok" : "off"; }, q);
      console.log("sheet", k, ms, q, vis); await shot(M, "s6-ui-mobile-" + k + "-sheet-" + ms, 500); await small(M, k + " sheet " + ms);
      await M.click(`#mtabs [data-ms=${ms}]`); await sleep(200);
    }
    // долгое нажатие по клетке доски — подсказка шторкой; затем тап не должен сделать ход
    const lp = await M.evaluate(async () => { const c = document.getElementById("board"), r = c.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2, o = { pointerId: 77, pointerType: "touch", clientX: x, clientY: y, bubbles: true, isPrimary: true };
      c.dispatchEvent(new PointerEvent("pointerdown", o)); await new Promise((f) => setTimeout(f, 650)); const t = document.getElementById("tip"), on = !!t?.classList.contains("on") && t.classList.contains("sheet");
      c.dispatchEvent(new PointerEvent("pointerup", o)); return on; });
    console.log("longpress", k, lp ? "sheet ok" : "NO SHEET"); await shot(M, "s6-ui-mobile-" + k + "-longpress-tip", 400);
    await M.context().close();
  }
}
if (only === "all" || only === "real") {
  // r3: всё на НАСТОЯЩЕМ локальном сервере (60244f2): рейтинговая 8×8 A (стол) vs B (телефон) → WS moves/frame → сдача → rating_get/top_get/profile_get (свой+чужой)/lib_list/save/rename/unsave → HTTP повтор
  const uA = "r3A_" + T, uB = "r3B_" + T, nA = "Алекс" + (T % 1000), nB = "Мира" + (T % 1000);
  const top = (P) => P.locator("#modals .ovl").last();
  const nameIt = async (P, nk) => { for (let k = 0; k < 2; k++) { if (await P.isVisible("#modals .namedlg").catch(() => false)) { if (/Вожд/.test(await P.textContent("#modals .namedlg").catch(() => ""))) { await P.locator("#modals .namedlg button", { hasText: /Позже/i }).first().click({ timeout: 2000 }).catch(() => {}); await sleep(500); continue; } await P.fill("#modals .namedlg input", nk).catch(() => {}); await P.locator("#modals .namedlg button", { hasText: /Назвать/i }).last().click({ timeout: 3000 }).catch(() => P.keyboard.press("Enter")); await sleep(700); } } };
  const hubLog = (P) => P.evaluate(() => { window.__hubIn = []; const o = WebSocket.prototype.send; if (window.__hubHook) return; window.__hubHook = 1; WebSocket.prototype.send = function (d) { try { const m = JSON.parse(d); if (/_get|lib_|moves|frame|cfg/.test(m.type)) window.__hubIn.push(m.type + (m.nick ? ":" + m.nick : "") + (m.ranked !== undefined ? ":ranked=" + m.ranked : "")); } catch {} return o.call(this, d); }; });
  // локальная D1: таблицы users (сайт, Clerk) в миграциях нет — для ников/чужого профиля создаём локальную фикстуру (только --local)
  { const { execSync } = await import("node:child_process"); const q = `CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, username TEXT); INSERT OR REPLACE INTO users (id, username) VALUES ('${uA}', '${nA}'), ('${uB}', '${nB}');`;
    try { execSync(`/workspace/mg-strat-ui/node_modules/.bin/wrangler d1 execute morrisgrad_db --local --config wrangler.json --command "${q}"`, { cwd: "/workspace/mg-strat-ui/server", stdio: "pipe" }); } catch (e) { errs.push("users fixture: " + String(e.stderr || e.message).slice(0, 200)); } }
  // подсказка расы: числа лиги по размеру поля (обычное лобби 8×8 и 15×15)
  { const C = await player("r3C_" + T); await hubLog(C); await C.click('.pmode[data-pm="normal"]').catch((e) => errs.push("C normal: " + e.message)); console.log("real: C playMode", await C.evaluate(() => localStorage.getItem("strat.playMode"))); await C.selectOption("#size", "8"); await C.click("#create"); await sleep(1800);
    const tip = () => C.evaluate(() => [...document.querySelectorAll(".racecard")].map((b) => b.dataset.race + ": " + (b.dataset.tip || "—")).join("\n"));
    console.log("real: C sent", await C.evaluate(() => window.__hubIn.join(",")), "ranked box", await C.evaluate(() => document.querySelector("#ranked")?.checked));
    const t8 = await tip(); console.log("real: race tips 8x8\n" + t8);
    await C.locator('.racecard[data-race="lightning"]').hover().catch(() => {}); await shot(C, "s6-ui-r-00-race-tip-8x8", 700);
    await C.locator("#size").selectOption("15").catch(() => {}); await C.evaluate(() => { const s = document.querySelector("#lsize, #cfgsize"); }); await sleep(300);
    await C.context().close(); }
  const A = await player(uA), B = await player(uB, "", true); await hubLog(A); await hubLog(B);
  await nameIt(A, nA); await nameIt(B, nB);
  await A.click('.pmode[data-pm="ranked"]').catch((e) => errs.push("pm ranked: " + e.message)); await A.selectOption("#size", "8"); await A.click("#create"); await sleep(1800); await nameIt(A, nA);
  const code = ((await A.textContent("#code").catch(() => "")) || "").trim(); console.log("real: lobby", code);
  await B.fill("#joincode", code); await B.click("#joinbtn"); await sleep(1800); await nameIt(B, nB);
  await A.locator(".racecard").first().hover().catch(() => {}); await sleep(500);
  console.log("real: race tip (8x8)", await A.evaluate(() => document.querySelector(".racecard")?.dataset.tip || "—"));
  await shot(A, "s6-ui-r-01-lobby-ranked-real", 400); await A.mouse.move(5, 5);
  await A.click("#ready").catch((e) => errs.push("A ready: " + e.message)); await B.locator("#ready").scrollIntoViewIfNeeded().catch(() => {}); await B.click("#ready", { force: true }).catch((e) => errs.push("B ready: " + e.message)); await sleep(1500);
  console.log("real: ready states", await A.evaluate(() => document.querySelector("#status, .lstatus, #lobby h3")?.textContent?.trim().slice(0, 80))); await sleep(6000); await nameIt(A, nA); await nameIt(B, nB);
  console.log("real: phase", await A.evaluate(() => document.body.className.slice(0, 80)));
  await noAdmin(A, "real game"); await noAdmin(B, "real game phone");
  await sleep(1500); await nameIt(A, nA); await nameIt(B, nB); for (const P of [A, B]) await P.locator("#modals .namedlg button", { hasText: /Позже/i }).first().click({ timeout: 1500 }).catch(() => {}); await sleep(400); await shot(A, "s6-ui-r-02-game-desktop-real", 1500); await shot(B, "s6-ui-r-03-game-phone-real", 300);
  // ход-другой, чтобы в повторе были действия: конец хода у того, чей ход
  // рейтинг считается при сдаче только с хода ≥ RATING_CFG.early.none (5): доигрываем 6 полных ходов
  for (let k = 0; k < 7; k++) for (const P of [A, B]) { await nameIt(P, P === A ? nA : nB); if (await P.isEnabled("#end").catch(() => false)) { await P.click("#end").catch(() => {}); await sleep(1300); } }
  console.log("real: turn", await A.evaluate(() => document.querySelector("#turnno, .turnno, #hturn")?.textContent?.trim()));
  await sleep(2500); console.log("real: rec frames A", await A.evaluate(() => window.__stratDev?.recLen?.() ?? "n/a"), "hprev enabled", await A.isEnabled("#hprev").catch(() => false), "mvlist", await A.evaluate(() => document.querySelector("#mvlist")?.innerText.replace(/\s+/g, " ").slice(0, 160)));
  for (const P of [A, B]) await P.evaluate(() => document.querySelectorAll("#chiefdlg, #modals .namedlg").forEach((e) => e.remove()));
  if (await A.isEnabled("#hprev").catch(() => false)) await A.click("#hprev"); else errs.push("hprev disabled after 6 turns"); await sleep(1500);
  console.log("real: ws replay histbar", await A.evaluate(() => document.querySelector("#histbar")?.innerText.replace(/\s+/g, " ").slice(0, 160)));
  await shot(A, "s6-ui-r-04-ws-moves-real", 300); await A.keyboard.press("Escape").catch(() => {});
  await A.click("#forfeit").catch((e) => errs.push("forfeit: " + e.message)); await sleep(600); await top(A).locator("button").last().click().catch((e) => errs.push("forfeit ok: " + e.message)); await sleep(3500);
  await sleep(1500); console.log("real: end foot", await A.evaluate(() => document.querySelector("#endscreen .es-foot")?.innerText.replace(/\s+/g, " ")), "| B", await B.evaluate(() => document.querySelector("#endscreen .es-foot")?.innerText.replace(/\s+/g, " ")));
  await A.evaluate(() => document.querySelector("#endscreen .es-foot")?.scrollIntoView({ block: "center" })); await B.evaluate(() => document.querySelector("#endscreen .es-foot")?.scrollIntoView({ block: "center" }));
  await shot(A, "s6-ui-r-05-end-rating-desktop", 300); await shot(B, "s6-ui-r-06-end-rating-phone", 100);
  console.log("real: ws sent A", await A.evaluate(() => window.__hubIn.join(",")));
  await A.context().close(); await B.context().close();
  // таблица лиги показывает только непредварительных (games ≥ 10, rating-db.ts): локальная фикстура — добавляем партии тестовым игрокам (только --local)
  { const { execSync } = await import("node:child_process");
    try { execSync(`/workspace/mg-strat-ui/node_modules/.bin/wrangler d1 execute morrisgrad_db --local --config wrangler.json --command "UPDATE strat_ratings SET games = games + 11, wins = wins + 6, losses = losses + 5 WHERE user_id IN ('${uA}', '${uB}')"`, { cwd: "/workspace/mg-strat-ui/server", stdio: "pipe" }); } catch (e) { errs.push("ratings fixture: " + String(e.stderr || e.message).slice(0, 200)); } }
  for (const [uid, nk, vp, sfx] of [[uA, nA, false, "desk"], [uB, nB, { width: 390, height: 844 }, "phone"]]) {
    const P = await player(uid, "", vp); await hubLog(P); await nameIt(P, nk); await sleep(2500); await noAdmin(P, "real menu " + sfx);
    await shot(P, "s6-ui-r-10-menu-rating-" + sfx, 300);
    await P.click("#topbtn"); await sleep(2500); await shot(P, "s6-ui-r-11-leaderboard-" + sfx, 0);
    console.log("real: top rows", sfx, await P.evaluate(() => [...document.querySelectorAll(".ltable .lrow:not(.h)")].map((r) => r.innerText.replace(/\s+/g, " ")).join(" | ").slice(0, 300)));
    const other = sfx === "desk" ? nB : nA, lk = P.locator(".ltable .nk.lnk", { hasText: other }).first();
    if (await lk.count()) { await lk.click(); await sleep(2500); await shot(P, "s6-ui-r-12-profile-public-" + sfx, 0);
      console.log("real: public profile", sfx, await P.evaluate(() => ({ priv: !!document.querySelector('#profdlg .ptab[data-t="priv"]'), coins: !!document.querySelector("#profdlg .pcoins"), txt: document.querySelector("#profdlg")?.innerText.replace(/\s+/g, " ").slice(0, 160) })));
      await esc(P); } else errs.push("no clickable nick " + other + " in top (" + sfx + ")");
    await esc(P);
    await P.click("#profbtn"); await sleep(2500); await shot(P, "s6-ui-r-13-profile-own-" + sfx, 0);
    if (await P.isVisible('#profdlg .ptab[data-t="priv"]')) { await P.click('#profdlg .ptab[data-t="priv"]'); await shot(P, "s6-ui-r-14-profile-private-" + sfx, 600); } else errs.push("no private tab for owner " + sfx);
    await esc(P);
    await P.click("#libbtn"); await sleep(2500); await shot(P, "s6-ui-r-15-library-" + sfx, 0);
    const lib = () => P.evaluate(() => [...document.querySelectorAll("#libdlg .lib-row")].map((r) => (r.classList.contains("saved") ? "★" : "") + r.querySelector(".lib-n")?.textContent).join(" | "));
    console.log("real: lib", sfx, await lib());
    if (sfx === "desk") {
      const sv = P.locator('#libdlg [data-lib="save"]').first();
      if (await sv.count()) { await sv.click(); await sleep(500); await top(P).locator("input").fill("Первая партия r3"); await top(P).locator("button").last().click(); await sleep(1800); } else errs.push("no save button in library");
      console.log("real: lib after save", await lib());
      const rn = P.locator('#libdlg [data-lib="ren"]').first();
      if (await rn.count()) { await rn.click(); await sleep(500); await shot(P, "s6-ui-r-16-library-rename-dialog", 200); await top(P).locator("input").fill("Сдача на 2-м ходу (r3)"); await top(P).locator("button").last().click(); await sleep(1800); } else errs.push("no rename button");
      console.log("real: lib after rename", await lib()); await shot(P, "s6-ui-r-17-library-renamed", 200);
      const reqs = []; P.on("request", (r) => /\/strat\/replay\?/.test(r.url()) && reqs.push(new URL(r.url()).search));
      await P.locator('#libdlg [data-lib="open"]').first().click(); await sleep(3500);
      console.log("real: http replay histbar", await P.evaluate(() => document.querySelector("#histbar")?.innerText.replace(/\s+/g, " ").slice(0, 160)), "requests", reqs.join(" ").slice(0, 300));
      await P.click('#histbar [data-hv="play"]').catch((e) => errs.push("rp play: " + e.message)); await sleep(2500); await shot(P, "s6-ui-r-18-replay-http-real", 0);
      await P.click('#histbar [data-hv="play"]').catch(() => {});
    } else {
      const del = P.locator('#libdlg [data-lib="save"]').first(); if (await del.count()) { await del.click(); await sleep(400); await top(P).locator("button").last().click(); await sleep(1800); }
      const un = P.locator('#libdlg [data-lib="del"]').first(); if (await un.count()) { await un.click(); await sleep(1800); } console.log("real: lib after save+unsave (phone)", await lib());
      await shot(P, "s6-ui-r-19-library-phone-after-unsave", 0);
    }
    console.log("real: hub sent", sfx, await P.evaluate(() => window.__hubIn.join(",")));
    await P.context().close();
  }
}
if (only === "all" || only === "replay") {
  // §14.I: WS moves/frame в партии (подмена канала в демо), HTTP повтор: from/to автоплей, «как было» (dt), rulesChanged, diverged; имя для lib_save
  const R = await player("s6_" + T + "_rpw", "&demo=15&skirm=1"); await dev(R, "s5", {}); await dev(R, "hist", 8);
  await R.evaluate(() => { const D = window.__stratDev, all = D.recFrames(), n = all.length; window.__rpLog = [];
    const turns = all.map((f, k) => ({ turn: f.turn, side: f.cur, from: 3 * k, to: 3 * k + 3 })), list = [];
    for (let i = 0; i < 3 * n; i++) list.push({ i, side: all[Math.floor(i / 3)].cur, a: "move", n: ["a3–b4", "c2:d3", "строит Казарму", "e5–e6"][i % 4], auto: i % 7 === 6 ? 1 : 0, dt: 400 + (i % 5) * 300 });
    D.recKeep(3); D.stReplay("rpW", 3 * n);
    window.__stratRpOut = (o) => { window.__rpLog.push(o.type + (o.i != null ? ":" + o.i : "")); setTimeout(() => {
      if (o.type === "moves") D.rpMsg({ type: "moves", id: "rpW", live: true, n: 3 * n, turns, list });
      if (o.type === "frame") { const k = Math.max(0, turns.findIndex((t) => t.to === o.i)); D.rpMsg({ type: "frame", id: "rpW", i: o.i, n: 3 * n, live: true, diverged: o.i >= 12 ? 13 : null, frame: { g: all[k].g } }); } }, 30); }; });
  const before = await dev(R, "recLen"); await R.click("#hprev"); await sleep(1500);
  console.log("ws replay: frames", before, "→", await dev(R, "recLen"), "sent", await R.evaluate(() => window.__rpLog.join(",")));
  await R.evaluate(() => { for (let k = 0; k < 8; k++) document.getElementById("hprev")?.click(); }); await sleep(600);
  console.log("ws replay: histbar", await R.evaluate(() => document.querySelector("#histbar")?.innerText.replace(/\s+/g, " ")));
  await shot(R, "s6-ui-90-replay-ws-moves-prefill", 500);
  await R.locator(".lside").screenshot({ path: OUT + N("s6-ui-90b-replay-ws-moves-list") + ".png" }).catch((e) => errs.push("moves crop: " + e.message));
  // HTTP: /strat/replay?id= → meta/moves/rulesChanged, &i=, &from&to (≤40)
  const H = await player("s6_" + T + "_rph", "&demo=15&skirm=1"); await dev(H, "s5", {}); await dev(H, "hist", 8);
  const data = await H.evaluate(() => { const D = window.__stratDev, S = D.dbg().S, all = D.recFrames().map((f) => ({ ...f, g: { ...f.g, map: S.g.map } })), n = all.length;
    const turns = all.map((f, k) => ({ turn: f.turn, side: f.cur, from: 3 * k, to: 3 * k + 3 })), list = [];
    for (let i = 0; i < 3 * n; i++) list.push({ i, side: all[Math.floor(i / 3)].cur, a: "move", n: ["a3–b4", "c2:d3", "строит Казарму", "e5–e6"][i % 4], auto: i % 7 === 6 ? 1 : 0, dt: 300 + (i % 4) * 250 });
    return { all, turns, list, n: 3 * n }; });
  const reqs = []; const fr = (i) => ({ g: data.all[Math.min(data.all.length - 1, Math.max(0, Math.ceil(i / 3) - 1))].g });
  await H.route(/\/strat\/replay\?/, (rt) => { const u = new URL(rt.request().url()), q = u.searchParams; reqs.push(u.search); let body;
    if (q.has("from")) { const a = +q.get("from"), b = Math.min(+q.get("to"), a + 39); body = { n: data.n, frames: Array.from({ length: b - a + 1 }, (_, k) => ({ i: a + k, diverged: a + k >= 10 ? 10 : null, frame: fr(a + k) })) }; }
    else if (q.has("i")) { const i = +q.get("i"); body = { n: data.n, i, diverged: i >= 10 ? 10 : null, frame: fr(i) }; }
    else body = { meta: { id: "rpH", nicks: ["Алекс", "Соперник"], races: ["fire", "ice"], turns: data.all.at(-1).turn, at: Date.now() }, log: { n: data.n }, moves: { turns: data.turns, list: data.list }, rulesChanged: true };
    rt.fulfill({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify(body) }); });
  await dev(H, "openRp", "rpH"); await sleep(2500);
  console.log("http replay: histbar", await H.evaluate(() => document.querySelector("#histbar")?.innerText.replace(/\s+/g, " ")));
  await H.click('#histbar [data-sp="0"]').catch((e) => errs.push("speed0: " + e.message)); await H.click('#histbar [data-hv="play"]').catch((e) => errs.push("play: " + e.message));
  await sleep(2600); const sub = await dev(H, "hvSub"); await shot(H, "s6-ui-91-replay-http-asplayed-warn", 0);
  await H.locator("#histbar").screenshot({ path: OUT + N("s6-ui-91b-replay-http-bar-crop") + ".png" }).catch((e) => errs.push("bar crop: " + e.message));
  console.log("http replay: sub action", sub, "requests", reqs.length, "batch", reqs.filter((x) => /from=/.test(x)).join(" ") || "NONE");
  await H.click('#histbar [data-hv="play"]').catch(() => {}); await sleep(300);
  await H.click('#histbar [data-hv="save"]').catch((e) => errs.push("save: " + e.message)); await sleep(500);
  await H.fill(".rptitle input", "Финал у реки — проба названия"); await shot(H, "s6-ui-92-replay-save-title", 300); await H.press(".rptitle input", "Enter"); await sleep(700);
  console.log("saved title", await H.evaluate(() => JSON.parse(localStorage.getItem("strat.lib.v1") || "{}").recs?.find((r) => r.id === "rpH")?.title));
  await noAdmin(H, "replay");
}
if (only === "all" || only === "real" || only === "tree") {
  // r4 (8dbf364+): древо технологий из state.tree НАСТОЯЩЕГО сервера; «Чаща» по эпохе лиги (techEra): Обычная 15×15 → IV, Быстрая 8×8 → III
  for (const [size, lg, mob] of [["15", "normal", false], ["15", "normal", true], ["8", "quick", false]]) {
    await sleep(12000); // пауза перед /strat/new: лимит 6 лобби в минуту (429)
    const P = await player("r4T_" + lg + (mob ? "m" : "") + "_" + T, "", mob); await P.evaluate(() => document.querySelector("vite-error-overlay")?.remove());
    await P.click('.pmode[data-pm="bot"]').catch((e) => errs.push("tree bot: " + e.message)); await P.selectOption("#size", size); await P.click("#create"); await sleep(2200);
    await P.locator('.racecard[data-race="nature"]').scrollIntoViewIfNeeded().catch(() => {}); await P.click('.racecard[data-race="nature"]').catch((e) => errs.push("tree race: " + e.message)); await sleep(500);
    await P.locator("#ready").scrollIntoViewIfNeeded().catch(() => {}); await P.click("#ready", { force: true }).catch((e) => errs.push("tree ready: " + e.message)); await sleep(4000);
    for (let k = 0; k < 2; k++) { await P.locator("#modals .namedlg button", { hasText: /Позже/i }).first().click({ timeout: 1500 }).catch(() => {}); await sleep(400); }
    await noAdmin(P, "tree " + lg);
    const tb = P.locator("#techbtn:visible").first(); await tb.click().catch((e) => errs.push("tree techbtn " + lg + ": " + e.message)); await sleep(1200);
    const info = await P.evaluate(() => { const S = window.__stratDev?.dbg?.().S; const g = document.querySelector('.techscreen [data-node="grove"]'); const cells = [...document.querySelectorAll(".techscreen .tgrid > *")];
      // ряд эпохи: ближайший предшествующий .te
      let era = "?"; if (g) { const cell = g.closest(".tcell"); let i = cells.indexOf(cell); while (i >= 0 && !cells[i].classList.contains("te")) i--; if (i >= 0) era = cells[i].querySelector("span")?.textContent; }
      const srv = S?.tree?.techs?.find((t) => t.id === "grove");
      return { league: S?.league?.id, srvEra: srv?.era, srvCost: srv?.cost, srvErr: srv?.err, row: era, tip: g?.getAttribute("data-tip"), em: g?.querySelector("em")?.textContent, nodes: document.querySelectorAll(".techscreen .tnode:not(.fog)").length, cell: g ? [...g.closest(".tcell").children].map((x) => x.dataset?.node || x.className).join(" ") : "" }; });
    console.log("tree", lg, mob ? "phone" : "desk", JSON.stringify(info));
    const want = lg === "normal" ? "IV" : "III"; if (info.row !== want) errs.push(`tree ${lg}: «Чаща» в ряду ${info.row}, ждали ${want}`);
    const g = P.locator('.techscreen [data-node="grove"]'); await g.scrollIntoViewIfNeeded().catch(() => {}); await g.hover().catch(() => {});
    await shot(P, "s6-ui-r-20-tech-" + lg + "-" + size + (mob ? "-phone" : "-desk"), 700);
    await P.context().close();
  }
}
await br.close();
console.log(errs.length ? "ERRORS:\n" + [...new Set(errs)].join("\n") : "no errors");
