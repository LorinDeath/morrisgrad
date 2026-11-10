// Поле и шапка не вылезают за экран. node tools/tests/eternal-watch-layout.mjs
// NODE_PATH должен видеть playwright-core, Chrome: CHROME или /usr/bin/google-chrome-stable.
import { chromium } from "playwright-core";
import { mkdirSync } from "fs";

const BASE = process.env.EW_URL || "http://127.0.0.1:4321/games/eternal-watch?shot=1";
const OUT = "/opt/cursor/artifacts";
mkdirSync(OUT, { recursive: true });

let fails = 0;
const bad = (m) => { fails++; console.log("FAIL " + m); };
const ok = (c, m) => { if (!c) bad(m); else console.log("ok " + m); };

async function metrics(page) {
  return page.evaluate(() => {
    const doc = document.scrollingElement || document.documentElement;
    const canvas = document.getElementById("ew-canvas");
    const panel = document.getElementById("ew-panel");
    const cr = canvas ? canvas.getBoundingClientRect() : null;
    const pr = panel && !panel.hidden ? panel.getBoundingClientRect() : null;
    const sell = [...(panel?.querySelectorAll("button") ?? [])].find((b) => b.textContent?.startsWith("Продать"));
    if (panel && sell) panel.scrollTop = panel.scrollHeight;
    const sr = sell ? sell.getBoundingClientRect() : null;
    const pr2 = panel && !panel.hidden ? panel.getBoundingClientRect() : null;
    return {
      scrollWidth: doc.scrollWidth,
      innerWidth: window.innerWidth,
      innerHeight: window.innerHeight,
      canvas: cr && { x: cr.x, y: cr.y, w: cr.width, h: cr.height, r: cr.right, b: cr.bottom },
      panel: pr2 && { x: pr2.x, y: pr2.y, w: pr2.width, h: pr2.height, b: pr2.bottom },
      sell: sr && { y: sr.y, b: sr.bottom, h: sr.height },
      panelScroll: panel ? panel.scrollHeight : 0,
      panelClient: panel ? panel.clientHeight : 0,
      overflowY: panel ? getComputedStyle(panel).overflowY : "",
    };
  });
}

function assertFit(info, label, { board }) {
  ok(info.scrollWidth <= info.innerWidth + 1, `${label}: scrollWidth ${info.scrollWidth} > ${info.innerWidth}`);
  if (!board) return;
  const c = info.canvas;
  ok(!!c && c.w > 0 && c.h > 0, `${label}: канвас ${c?.w}×${c?.h}`);
  if (!c) return;
  ok(c.x >= -1 && c.r <= info.innerWidth + 1, `${label}: канвас x=${c.x.toFixed(1)} r=${c.r.toFixed(1)} экран ${info.innerWidth}`);
  ok(c.y >= -1 && c.b <= info.innerHeight + 1, `${label}: канвас y=${c.y.toFixed(1)} b=${c.b.toFixed(1)} экран ${info.innerHeight}`);
  ok(c.w >= info.innerWidth * 0.9, `${label}: канвас ${c.w.toFixed(0)} < 90% из ${info.innerWidth}`);
  if (info.panel) {
    ok(c.b <= info.panel.y + 2, `${label}: поле перекрыто листом (низ канваса ${c.b.toFixed(0)}, лист ${info.panel.y.toFixed(0)})`);
    ok(info.panel.h <= info.innerHeight * 0.46, `${label}: лист ${info.panel.h.toFixed(0)}px выше 45%`);
  }
}

const browser = await chromium.launch({
  executablePath: process.env.CHROME || "/usr/bin/google-chrome-stable",
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});

async function boot(width, height, dpr, mobile) {
  const context = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: dpr,
    isMobile: mobile,
    hasTouch: mobile,
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(BASE, { waitUntil: "networkidle", timeout: 30000 });
  await page.waitForFunction(() => window.__ew, { timeout: 10000 });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForFunction(() => window.__ew, { timeout: 10000 });
  await page.waitForTimeout(200);
  return { context, page, errors };
}

for (const width of [360, 390, 412]) {
  const { context, page, errors } = await boot(width, 780, width === 412 ? 2.6 : 3, true);
  const label = `${width}px`;
  assertFit(await metrics(page), `${label} карта`, { board: true });

  await page.evaluate(() => window.__ew.tree());
  await page.waitForTimeout(150);
  assertFit(await metrics(page), `${label} древо`, { board: true });

  await page.evaluate(() => {
    const ew = window.__ew;
    ew.sparks(40);
    ew.buy("muzzle.root");
    ew.start("spark-path", false);
    ew.place(6, 3, "spark");
    ew.fast(1.2);
    const run = ew.run();
    run.gold = 160;
    const tower = run.towers[0];
    if (tower) {
      tower.xp = 260;
      ew.select(tower.id);
    }
    ew.spawn("walker", 6, 1);
    ew.spawn("runner", 3, 3);
    ew.spawn("knight", 2, 5);
  });
  await page.waitForTimeout(250);
  assertFit(await metrics(page), `${label} бой с листом`, { board: true });
  await page.evaluate(() => document.getElementById("ew-menu")?.click());
  await page.waitForTimeout(100);
  assertFit(await metrics(page), `${label} меню открыто`, { board: true });

  if (width === 412) await page.screenshot({ path: `${OUT}/layout-412-battle.png` });
  ok(errors.length === 0, `${label}: ошибки ${errors.join(" | ")}`);
  await context.close();
}

{
  const { context, page, errors } = await boot(1280, 800, 1, false);
  await page.evaluate(() => {
    const ew = window.__ew;
    ew.sparks(80);
    ew.buy("muzzle.root");
    ew.start("spark-path", false);
    ew.run().gold = 400;
    [[9, 3], [7, 3], [6, 1], [5, 3], [8, 5]].forEach((c, i) => ew.place(c[0], c[1], i % 2 ? "muzzle" : "spark"));
    ew.fast(2);
    const run = ew.run();
    run.gold = 186;
    const tower = run.towers[0];
    if (tower) { tower.xp = 260; ew.select(tower.id); }
  });
  await page.waitForTimeout(300);
  const info = await metrics(page);
  ok(info.scrollWidth <= info.innerWidth + 1, `1280: scrollWidth ${info.scrollWidth}`);
  const c = info.canvas;
  ok(!!c && c.x >= -1 && c.r <= info.innerWidth + 1 && c.y >= -1 && c.b <= info.innerHeight + 1, `1280: канвас внутри ${c && JSON.stringify(c)}`);
  ok(info.overflowY === "auto" || info.overflowY === "scroll", `1280: панель overflow ${info.overflowY}`);
  if (info.sell && info.panel) {
    ok(info.sell.b <= info.panel.b + 1 && info.sell.y >= info.panel.y - 1, `1280: «Продать» вне панели y=${info.sell.y.toFixed(0)}..${info.sell.b.toFixed(0)} панель ${info.panel.y.toFixed(0)}..${info.panel.b.toFixed(0)}`);
  } else bad("1280: нет кнопки продажи");
  const clipped = await page.evaluate(() => {
    const ids = ["ew-endless", "ew-world", "ew-tree", "ew-nums"];
    return ids.map((id) => {
      const el = document.getElementById(id);
      const r = el.getBoundingClientRect();
      return { id, x: r.x, r: r.right, w: r.width, hidden: getComputedStyle(el).display === "none" };
    });
  });
  for (const b of clipped) {
    ok(!b.hidden && b.x >= -1 && b.r <= 1281 && b.w > 20, `1280 кнопка ${b.id} x=${b.x.toFixed(0)} r=${b.r.toFixed(0)} w=${b.w.toFixed(0)}`);
  }
  ok(errors.length === 0, `1280: ошибки ${errors.join(" | ")}`);
  await context.close();
}

await browser.close();
console.log(fails ? `\nlayout: ${fails} FAIL` : "\nlayout: OK");
process.exit(fails ? 1 : 0);
