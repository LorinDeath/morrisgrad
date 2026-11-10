// Телефонная вёрстка «Вечной стражи»: поле не схлопывается, старт и док доступны.
// node tools/tests/eternal-watch-mobile.mjs
import { chromium } from "playwright-core";
import { mkdirSync } from "fs";

const BASE = process.env.EW_URL || "http://127.0.0.1:4321/games/eternal-watch";
const OUT = "/opt/cursor/artifacts";
mkdirSync(OUT, { recursive: true });

const SAVE_KEY = "mg-eternal-watch-v1";
const freshSave = null;
const metaSave = {
  v: 1, sparks: 12, laws: [], chain: false, well: false, runeSlots: 1,
  startGoldRanks: 1, heartRanks: 0, discount: false, extraPads: false, interest: false,
  purchases: 1, night: 2, bestWave: 6, carryGold: 0, bag: [], dawnUnlocked: false, lawOffer: null, run: null,
};
const runSave = {
  ...metaSave,
  sparks: 4,
  run: {
    night: 2, wave: 4, cleared: 3, phase: "gap", gap: 1.2, queue: [], spawnCd: 0,
    gold: 90, hearts: 17, maxHearts: 20, sparksNight: 1, interest: 0, time: 20,
    towers: [], enemies: [], projectiles: [], fx: [], nextId: 4, bag: [], slots: 1, laws: [],
    rerollUsed: false, merged: false, beaconFree: false, discountArmed: false, discountUsed: false,
    wellSparkCd: 0, critSparkCd: 0, gateHealCd: 0, gatePool: 0, speed: 1, defeated: false, dawnReady: false, rng: 7,
  },
};

let fails = 0;
const bad = (m) => { fails++; console.log("FAIL " + m); };
const ok = (c, m) => { if (!c) bad(m); };

async function layout(page) {
  return page.evaluate(() => {
    const rect = (id) => {
      const el = document.getElementById(id);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      const hidden = el.hidden || getComputedStyle(el).display === "none";
      return { x: r.x, y: r.y, w: r.width, h: r.height, hidden };
    };
    const canvas = document.getElementById("ew-canvas");
    return {
      canvas: rect("ew-canvas"),
      stage: rect("ew-stage"),
      dock: rect("ew-dock"),
      start: rect("ew-start"),
      shop: rect("ew-title-shop"),
      titleHidden: document.getElementById("ew-title")?.hidden ?? true,
      buttons: document.querySelectorAll("#ew-dock button").length,
      S: canvas ? canvas.width / 256 : 0,
      dpr: window.devicePixelRatio,
      innerH: window.innerHeight,
      innerW: window.innerWidth,
    };
  });
}

function assertPlayable(info, label, { startVisible }) {
  ok(info.stage && info.stage.h >= 120, `${label}: сцена ${info.stage?.h} px`);
  ok(info.canvas && info.canvas.h >= 100 && info.canvas.w >= 140, `${label}: канвас ${info.canvas?.w}×${info.canvas?.h}`);
  ok(info.S >= 1 && Number.isInteger(info.S), `${label}: масштаб ×${info.S}`);
  ok(info.dock && !info.dock.hidden && info.dock.h >= 48, `${label}: док ${info.dock?.h}`);
  ok(info.dock && info.dock.y + info.dock.h <= info.innerH + 2, `${label}: док ниже экрана y=${info.dock?.y}`);
  ok(info.buttons === 7, `${label}: кнопок дока ${info.buttons}`);
  if (startVisible) {
    ok(!info.titleHidden, `${label}: экран старта скрыт`);
    for (const key of ["start", "shop"]) {
      const b = info[key];
      ok(b && !b.hidden && b.h >= 36, `${label}: кнопка ${key} ${b?.h}`);
      ok(b && b.y >= -1 && b.y + b.h <= info.innerH + 2, `${label}: кнопка ${key} обрезана y=${b?.y} h=${b?.h} экран ${info.innerH}`);
    }
  }
}

const browser = await chromium.launch({
  executablePath: process.env.CHROME || "/usr/local/bin/google-chrome",
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});

const widths = [360, 390, 412];
const dprs = [2.625, 3];
const saves = [
  ["fresh", freshSave],
  ["meta", metaSave],
  ["run", runSave],
];

for (const width of widths) {
  for (const dpr of dprs) {
    for (const [name, save] of saves) {
      const label = `${width}@${dpr} ${name}`;
      const context = await browser.newContext({
        viewport: { width, height: 780 },
        deviceScaleFactor: dpr,
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
      await page.waitForTimeout(250);
      const startInfo = await layout(page);
      assertPlayable(startInfo, label + " старт", { startVisible: name !== "run" });
      if (name === "run") ok(startInfo.titleHidden, `${label}: сохранённая ночь не показывает титул`);

      if (width === 412 && dpr === 2.625 && name === "fresh") {
        await page.screenshot({ path: `${OUT}/ew-412-start.png` });
      }

      if (name !== "run") await page.locator("#ew-start").click();
      await page.waitForTimeout(300);
      const playInfo = await layout(page);
      assertPlayable(playInfo, label + " игра", { startVisible: false });
      ok(playInfo.titleHidden, `${label}: после старта титул скрыт`);

      await page.setViewportSize({ width: width === 412 ? 360 : 412, height: 780 });
      await page.evaluate(() => window.dispatchEvent(new Event("resize")));
      await page.waitForTimeout(200);
      const resized = await layout(page);
      assertPlayable(resized, label + " resize", { startVisible: false });

      await page.setViewportSize({ width: 780, height: 360 });
      await page.evaluate(() => window.dispatchEvent(new Event("orientationchange")));
      await page.waitForTimeout(200);
      const turned = await layout(page);
      assertPlayable(turned, label + " поворот", { startVisible: false });

      if (width === 412 && dpr === 2.625 && name === "fresh") {
        await page.setViewportSize({ width: 412, height: 780 });
        await page.evaluate(() => window.dispatchEvent(new Event("resize")));
        await page.waitForTimeout(200);
        await page.evaluate(() => {
          const ew = window.__ew;
          ew.gold(200);
          ew.place(11, 1, "mortar");
          ew.place(12, 1, "frost");
          ew.run.phase = "fight";
          ew.run.queue = ["walker"];
          ew.run.spawnCd = 50;
          for (let i = 0; i < 8; i++) ew.spawn(i % 2 ? "runner" : "walker", 0.3 + i * 0.8);
          ew.fast(0.4);
          ew.run.speed = 0;
        });
        await page.waitForTimeout(200);
        const busy = await layout(page);
        assertPlayable(busy, "412 игра с башнями", { startVisible: false });
        await page.screenshot({ path: `${OUT}/ew-412-play.png` });
      }

      ok(errors.length === 0, `${label}: ошибки страницы ${errors.join(" | ")}`);
      await context.close();
    }
  }
}

await browser.close();
console.log(fails ? `\nmobile: ${fails} FAIL` : "\nmobile: OK");
process.exit(fails ? 1 : 0);
