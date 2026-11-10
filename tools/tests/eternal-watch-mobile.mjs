// Телефонная вёрстка «Вечной стражи»: поле крупное, док и подсказки на месте.
// node tools/tests/eternal-watch-mobile.mjs
import { chromium } from "playwright-core";
import { mkdirSync } from "fs";

const BASE = process.env.EW_URL || "http://127.0.0.1:4321/games/eternal-watch?shot=1";
const OUT = "/opt/cursor/artifacts";
mkdirSync(OUT, { recursive: true });

const SAVE_KEY = "mg-eternal-watch-v2";
const metaSave = {
  v: 2, sparks: 40, ash: 1, vein: 2, nodes: { "spark.root": 1, "muzzle.root": 1 },
  stars: { "spark-path": 1 }, endlessBest: {}, modeBest: {}, dailyBest: {},
  damageNumbers: true, v1Bonus: true, run: null,
};

let fails = 0;
const bad = (m) => { fails++; console.log("FAIL " + m); };
const ok = (c, m) => { if (c) console.log("ok " + m); else bad(m); };

async function layout(page) {
  return page.evaluate(() => {
    const rect = (id) => {
      const el = document.getElementById(id);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      const hidden = el.hidden || getComputedStyle(el).display === "none";
      return { x: r.x, y: r.y, w: r.width, h: r.height, b: r.bottom, hidden };
    };
    const canvas = document.getElementById("ew-canvas");
    const buttons = [...document.querySelectorAll("button")];
    const dockButtons = [...document.querySelectorAll("#ew-dock .dock button")];
    const untipped = buttons.filter((b) => !b.dataset.tip).map((b) => b.id || b.textContent?.slice(0, 24));
    return {
      canvas: rect("ew-canvas"),
      stage: rect("ew-stage"),
      dock: rect("ew-dock"),
      handle: document.querySelector(".dock-handle")?.getBoundingClientRect().height ?? 0,
      banner: rect("ew-banner"),
      globals: rect("ew-globals"),
      dockButtons: dockButtons.length,
      dockTips: dockButtons.every((b) => !!b.dataset.tip),
      untipped,
      zoom: window.__ew?.zoom?.() ?? 0,
      dpr: window.devicePixelRatio,
      innerH: window.innerHeight,
      innerW: window.innerWidth,
      scroll: (document.scrollingElement || document.documentElement).scrollWidth,
    };
  });
}

function assertPlayable(info, label) {
  ok(info.stage && info.stage.h >= 160, `${label}: сцена ${info.stage?.h} px`);
  ok(info.canvas && info.canvas.h >= 160 && info.canvas.w >= info.innerW * 0.9, `${label}: канвас ${info.canvas?.w}×${info.canvas?.h}`);
  ok(info.canvas && info.canvas.y >= -1 && info.canvas.b <= info.innerH + 2, `${label}: канвас вне экрана`);
  ok(info.dock && !info.dock.hidden && info.dock.h >= 40 && info.dock.h <= 160, `${label}: док ${info.dock?.h}`);
  ok(info.dock && info.dock.b <= info.innerH + 2, `${label}: док ниже экрана`);
  ok(info.canvas && info.dock && info.canvas.b <= info.dock.y + 2, `${label}: поле перекрыто доком`);
  ok(info.dockButtons >= 8, `${label}: кнопок дока ${info.dockButtons}`);
  ok(info.dockTips, `${label}: у кнопки дока нет подсказки`);
  ok(info.untipped.length === 0, `${label}: без подсказки ${info.untipped.join(",")}`);
  ok(info.zoom >= 36, `${label}: клетка ${info.zoom?.toFixed?.(1)} px`);
  ok(info.scroll <= info.innerW + 1, `${label}: горизонтальный скролл ${info.scroll}`);
  ok(!info.banner || info.banner.hidden || info.banner.h < 48, `${label}: плашка ${info.banner?.h}`);
}

const browser = await chromium.launch({
  executablePath: process.env.CHROME || "/usr/bin/google-chrome-stable",
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});

const widths = [360, 390, 412];
for (const width of widths) {
  for (const [name, save] of [["fresh", null], ["meta", metaSave]]) {
    const label = `${width} ${name}`;
    const context = await browser.newContext({
      viewport: { width, height: 780 },
      deviceScaleFactor: width === 412 ? 2.6 : 2,
      isMobile: true,
      hasTouch: true,
    });
    if (save) {
      await context.addInitScript(([key, raw]) => localStorage.setItem(key, raw), [SAVE_KEY, JSON.stringify(save)]);
    }
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    await page.goto(BASE, { waitUntil: "networkidle", timeout: 30000 });
    await page.waitForFunction(() => window.__ew, { timeout: 10000 });
    await page.evaluate(() => {
      const ew = window.__ew;
      ew.sparks(30);
      ew.buy("muzzle.root");
      ew.start("spark-path", false);
      ew.run().gold = 200;
      ew.place(6, 3, "spark");
      ew.place(5, 4, "muzzle");
      ew.spawn("walker", 3, 1.2);
    });
    await page.waitForTimeout(250);
    const play = await layout(page);
    assertPlayable(play, label + " портрет");

    await page.setViewportSize({ width: 780, height: 360 });
    await page.evaluate(() => window.dispatchEvent(new Event("resize")));
    await page.waitForTimeout(200);
    const turned = await layout(page);
    assertPlayable(turned, label + " альбом");

    if (width === 390 && name === "fresh") {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.evaluate(() => window.dispatchEvent(new Event("resize")));
      await page.waitForTimeout(200);
      await page.screenshot({ path: `${OUT}/ew-mobile-portrait.png` });
    }
    ok(errors.length === 0, `${label}: ошибки ${errors.join(" | ")}`);
    await context.close();
  }
}

await browser.close();
console.log(fails ? `\nmobile: ${fails} FAIL` : "\nmobile: OK");
process.exit(fails ? 1 : 0);
