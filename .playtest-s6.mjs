// Скриншоты этапа 6 (арт построек Художника), локально: node .playtest-s6.mjs [lobby|demo|v2|t2|walls|mob|all] → /workspace/minigame-tz/shots/s6-ui-*
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
  const p = await ctx.newPage(); p.setDefaultTimeout(8000); p.on("pageerror", (e) => errs.push(uid + ": " + e.message));
  p.on("console", (m) => m.type() === "error" && !/favicon|Failed to load resource|WebSocket/.test(m.text()) && errs.push(uid + " console: " + m.text()));
  p.on("response", (r) => r.status() >= 400 && !/favicon/.test(r.url()) && errs.push(uid + " HTTP " + r.status() + " " + r.url().slice(0, 140)));
  await p.goto(SITE + "?devUser=" + uid + extra + WSQ); await sleep(1800); await p.addStyleTag({ content: "astro-dev-toolbar{display:none!important}" }); return p;
}
const shot = async (P, name, wait = 600) => { await sleep(wait); await P.screenshot({ path: OUT + name + ".png" }); console.log("shot", name); };
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
  await L.locator("#hhpwrap").screenshot({ path: OUT + "s6-ui-01b-lobby-hidden-hp-toggle.png" }).catch((e) => errs.push("hhpwrap: " + e.message));
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
  await V.locator(".histbar").screenshot({ path: OUT + "s6-ui-66b-v2-replay-bar-crop.png" }).catch((e) => errs.push("histbar: " + e.message)); await dev(V, "live");
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
  await A.locator("#minimapbox").screenshot({ path: OUT + "s6-ui-74-t2-minimap-frame.png" }).catch((e) => errs.push("minimap: " + e.message));
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
await br.close();
console.log(errs.length ? "ERRORS:\n" + [...new Set(errs)].join("\n") : "no errors");
