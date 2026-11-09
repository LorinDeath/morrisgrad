// «Ночной атлас»: якоря, досягаемость всех 12 чудес, целый масштаб. Запуск: node --experimental-strip-types tools/tests/night-atlas-test.ts
import { readFileSync, existsSync } from "fs";
import { join } from "path";
import {
  AIR_LIFT_MAX,
  AIR_LIFT_MIN,
  BUSH_SINK,
  CANVAS_SPRITES,
  HERO_DRAW_DY,
  OUTLINE_ROW,
  PICKUP_R,
  WALK_FPS,
  WONDERS,
  bushDrawY,
  createHero,
  fitCanvas,
  groundTopOf,
  heroDrawY,
  heroFrame,
  itemPoint,
  makeWorld,
  mulberry32,
  overlaps,
  propDrawY,
  screenFeet,
  stepBody,
  wonder,
  type Body,
  type NightWorld,
  type WonderSpot,
} from "../../src/scripts/night-atlas/logic.ts";

let fails = 0;
let passes = 0;
const ok = (c: unknown, m: string) => {
  if (c) passes++;
  else {
    fails++;
    console.log("FAIL " + m);
  }
};

const root = join(import.meta.dirname, "../..");
for (const size of [16, 32, 64]) {
  for (const name of CANVAS_SPRITES) {
    ok(existsSync(join(root, `public/games/night-atlas/sprites/${size}/${name}.png`)), `png ${size}/${name}`);
  }
  for (const ui of ["ui_heart", "ui_star", "ui_button"]) {
    ok(existsSync(join(root, `public/games/night-atlas/sprites/${size}/${ui}.png`)), `ui ${size}/${ui}`);
  }
}
ok(existsSync(join(root, "public/games/night-atlas/cover.png")), "обложка");
ok(!existsSync(join(root, "public/games/night-atlas/README.md")), "в публичных файлах нет README набора");

const names = WONDERS.map((w) => w.name);
ok(names.join("|") === "Сундук|Сова|Лунная ягода|Карманные часы|Ёжик|Лодка|Шляпа|Костёр|Воздушный шар|Рыбка|Мельница|Граммофон", "имена чудес");
ok(WONDERS.filter((w) => w.air).length === 5 && WONDERS.filter((w) => !w.air).length === 7, "5 в воздухе, 7 на земле");
ok(new Set(WONDERS.map((w) => w.id)).size === 12, "двенадцать разных");
ok(WALK_FPS === 6 && BUSH_SINK === 2 && HERO_DRAW_DY === 15 && OUTLINE_ROW === 14, "контракт кадров и куста");

const groundTop = groundTopOf(160);
const feet = screenFeet(groundTop, 0);
ok(feet === groundTop && heroDrawY(feet) + OUTLINE_ROW === groundTop - 1, "контур героя на пикселе над травой");
ok(bushDrawY(groundTop) + OUTLINE_ROW === groundTop - 1 + BUSH_SINK, "куст на 2 px в траве");
ok(propDrawY(groundTop, 14) === heroDrawY(groundTop), "предмет с низом на строке 14 стоит как герой");
ok(heroFrame(false, 0, 0) === "hero_jump" && heroFrame(true, 0, 0) === "hero_idle", "прыжок не сменяется, покой — idle");
ok(heroFrame(true, 40, 0) === "hero_walk1" && heroFrame(true, 40, 1 / 6) === "hero_walk2" && heroFrame(true, 40, 2 / 6) === "hero_walk1", "шаг walk1 → walk2 на 6 кадрах/с");

const fit = fitCanvas(960, 540, 1);
ok(Number.isInteger(fit.S) && fit.S >= 1 && fit.logicalW % 16 === 0 && fit.logicalH % 16 === 0, "масштаб целый, поле кратно тайлу");
ok((fit.logicalW * fit.S) / 1 <= 960 && (fit.logicalH * fit.S) / 1 <= 540, "кадр влезает в сцену");
const phone = fitCanvas(390, 420, 3);
ok(Number.isInteger(phone.S) && (phone.logicalW * phone.S) / 3 <= 390 + 0.01 && (phone.logicalH * phone.S) / 3 <= 420 + 0.01, "телефон: целые аппаратные пиксели");

function apex(): number {
  const b = createHero();
  let max = 0;
  for (let i = 0; i < 240; i++) {
    stepBody(b, { left: false, right: false, jumpHeld: true, jumpPressed: i === 0 }, 1 / 60, 4000);
    if (b.rise > max) max = b.rise;
    if (i > 8 && b.ground) break;
  }
  return max;
}
const jump = apex();
ok(jump > 36 && jump < 56, `высота прыжка ${jump.toFixed(1)} px — догоняет воздух и не улетает`);

function catchSpot(world: NightWorld, spot: WonderSpot): boolean {
  const spec = wonder(spot.id);
  const b: Body = createHero();
  b.x = Math.max(14, spot.x - 40);
  let t = 0;
  let heldJump = false;
  for (let i = 0; i < 360; i++) {
    const dt = 1 / 60;
    const ix = itemPoint(spot, t).x;
    const left = b.x > ix + 1.5;
    const right = b.x < ix - 1.5;
    const close = Math.abs(b.x - ix) < 5;
    const pressed = spec.air && close && b.ground && !heldJump;
    if (pressed) heldJump = true;
    if (b.ground && !close) heldJump = false;
    stepBody(b, { left, right, jumpHeld: spec.air && (heldJump || pressed), jumpPressed: pressed }, dt, world.worldW);
    t += dt;
    if (overlaps(b, spot, t)) return true;
    if (!spec.air && overlaps({ ...b, rise: 0, ground: true, vy: 0 }, spot, t)) return true;
  }
  return false;
}

for (const view of [192, 240, 320, 400]) {
  for (let seed = 1; seed <= 24; seed++) {
    const world = makeWorld(view, mulberry32(seed * 1000 + view));
    const ratio = world.worldW / view;
    ok(ratio >= 2.5 - 0.06 && ratio <= 3 + 0.06, `ширина ${world.worldW} при виде ${view} ≈ 2.5–3 экрана (${ratio.toFixed(2)})`);
    ok(new Set(world.spots.map((s) => s.id)).size === 12, `сид ${seed} вид ${view}: 12 чудес`);
    ok(world.bushes.length >= 2 && world.bushes.some((b) => b.x < 160), `кусты ${world.bushes.length}`);
    ok(world.stars.length >= 8, "звёзды только декор и они есть");
    const hero = createHero();
    ok(!world.spots.some((s) => overlaps(hero, s, 0)), `старт не подбирает чудо (вид ${view} сид ${seed})`);
    let reachable = true;
    let standOk = true;
    for (const spot of world.spots) {
      const spec = wonder(spot.id);
      ok(spec.air ? spot.lift >= AIR_LIFT_MIN && spot.lift <= AIR_LIFT_MAX : spot.lift === 0, `высота ${spot.id}`);
      for (let k = 0; k < 8; k++) {
        const t = k * 0.4;
        const p = itemPoint(spot, t);
        const stand = createHero();
        stand.x = p.x;
        if (spec.air && overlaps(stand, spot, t)) standOk = false;
        if (!spec.air && !overlaps(stand, spot, t)) standOk = false;
        let crossed = !spec.air;
        if (spec.air) {
          for (let rise = 0; rise <= jump + 0.01; rise += 1) {
            const body = createHero();
            body.x = p.x;
            body.rise = rise;
            body.ground = false;
            if (overlaps(body, spot, t)) crossed = true;
          }
        }
        if (!crossed) reachable = false;
      }
      if (!catchSpot(world, spot)) reachable = false;
      ok(Math.abs(spot.x - hero.x) > PICKUP_R, "чудо не в радиусе старта по x");
    }
    ok(standOk, `земля берётся шагом, воздух — нет (вид ${view} сид ${seed})`);
    ok(reachable, `все 12 догоняются (вид ${view} сид ${seed})`);
    for (let i = 1; i < world.spots.length; i++) {
      ok(world.spots[i]!.x - world.spots[i - 1]!.x >= 28, "чудеса не слипаются");
    }
  }
}

const page = readFileSync(join(root, "src/pages/games/night-atlas.astro"), "utf8");
const hub = readFileSync(join(root, "src/pages/games.astro"), "utf8");
const seo = readFileSync(join(root, "src/lib/seo.ts"), "utf8");
for (const piece of [
  "Ночный атлас",
  "Собери двенадцать чудес этой ночью",
  "Собери двенадцать чудес ночи",
  "Атлас собран",
  "Все двенадцать чудес нашлись этой ночью",
  "Влево, вправо и прыжок — клавишами или кнопками внизу",
  "Начать",
  "Ещё раз",
]) ok(page.includes(piece), "текст страницы: " + piece);
ok(page.includes('href="/games"') && hub.includes('data-game-url="/games/night-atlas"') && hub.includes("Собери двенадцать чудес этой ночью"), "хаб ведёт на игру");
ok(seo.includes('"/games/night-atlas"'), "адрес в карте сайта");
const banned = ["Pixel Art Atlas", "Hugging Face", "Krea", "сюрприз"];
for (const file of ["src/pages/games/night-atlas.astro", "src/pages/games.astro", "src/scripts/night-atlas/client.ts", "src/scripts/night-atlas/logic.ts", "src/lib/seo.ts"]) {
  const text = readFileSync(join(root, file), "utf8");
  for (const word of banned) ok(!text.includes(word), `${file} без «${word}»`);
}

console.log(`\nnight-atlas-test: ${passes} PASS, ${fails} FAIL`);
process.exit(fails ? 1 : 0);
