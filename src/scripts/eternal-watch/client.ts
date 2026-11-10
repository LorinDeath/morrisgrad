// Клиент «Вечной стражи». Симуляция живёт в logic.ts.
import {
  ABILITY_BY_ID, ABILITY_ICON, MAPS, PLAY_MODES, SAVE_KEY, SAVE_KEY_V1, TARGET_NAME, TOWER_COLOR, TOWERS, WALL_COST, abilityCd, bonusesFor, buyNode, callWave, castAbility,
  chooseAbility, cycleTarget, PATH_GAP, beginRun, dailyMutators, debugSpawn, endRun, fmt, loadMeta, mapById, modAt, modeInfo, modeLabel, mutatorById, nodeById, openMode, placeStamp,
  placeTower, placeWall, previewStats, refreshMode, sellTower, serializeMeta, spriteUrl, statsOf, stepRun, syncOffers, todayKey, towerFrame, unlockedIndex, upgradeTower,
  xpBar, briefLines, dockOf, globalTip, nodeTip, summaryLines, towerCard,
} from "./logic.ts";
import { fitBattle, fitCam, paintBattle, paintMapPreview, paintTree, paintWorld, toWorld, treeHit, worldHit, warmSprites, type Cam, type Ghost } from "./draw.ts";
import type { EnemyKind, GlobalId, Meta, ModeId, ModKind, Run, TowerKind } from "./logic.ts";

type Screen = "world" | "battle" | "tree" | "summary" | "modes";

const app = document.getElementById("ew-app");
const stage = document.getElementById("ew-stage") as HTMLElement;
const canvas = document.getElementById("ew-canvas") as HTMLCanvasElement;
const context = canvas.getContext("2d");
const panel = document.getElementById("ew-panel") as HTMLElement;
const dockEl = document.getElementById("ew-dock") as HTMLElement;
const resEl = document.getElementById("ew-res") as HTMLElement;
const fightEl = document.getElementById("ew-fight") as HTMLElement;
const globalsEl = document.getElementById("ew-globals") as HTMLElement;
const toastEl = document.getElementById("ew-toast") as HTMLElement;
const tipEl = document.getElementById("ew-tip") as HTMLElement;
if (!app || !stage || !canvas || !context || !panel || !dockEl || !resEl || !fightEl || !globalsEl || !tipEl) throw new Error("нет оболочки");
const shell: HTMLElement = app;
const ctx: CanvasRenderingContext2D = context;

const loaded = loadMeta(localStorage.getItem(SAVE_KEY), localStorage.getItem(SAVE_KEY_V1));
let meta: Meta = loaded.meta;
let persist = loaded.persist;
let run: Run | null = meta.run && meta.run.outcome === "play" ? meta.run : null;
if (run) refreshMode(run);
let screen: Screen = run ? "battle" : "world";
let endless = false;
let speed: 0 | 1 | 2 | 4 = 1;
let selected = 0;
let kind: TowerKind | null = "spark";
let walling = false;
warmSprites();

function iconify(id: string, sprite: string): void {
  const el = document.getElementById(id);
  if (!el || el.querySelector("img")) return;
  const img = document.createElement("img");
  img.alt = "";
  img.src = spriteUrl(sprite);
  el.replaceChildren(img);
}
iconify("ew-pause", "icon_pause");
{
  const call = document.getElementById("ew-call");
  if (call && !call.querySelector("img")) call.textContent = "▶";
}
let aim: GlobalId | null = null;
let nodeId: string | null = RESEARCH_FIRST();
let brief = -1;
let worldCam: Cam = { x: 520, y: 320, z: 1 };
let treeCam: Cam = { x: 160, y: -80, z: 1.05 };
let battleCam: Cam = { x: 8, y: 5, z: 36 };
let battleMin = 12;
let battleMax = 96;
let hover: Ghost | null = null;
let fitted = "";
let footSig = "";
let acc = 0;
let toastTimer = 0;

function RESEARCH_FIRST(): string {
  return "spark.root";
}

function save(): void {
  if (!persist) return;
  meta.run = run && run.outcome === "play" ? run : null;
  localStorage.setItem(SAVE_KEY, serializeMeta(meta));
}

function toast(text: string): void {
  toastEl.hidden = !text;
  toastEl.textContent = text;
  window.clearTimeout(toastTimer);
  if (text) toastTimer = window.setTimeout(() => { toastEl.hidden = true; }, 1600);
}

let tipLock = false;
function showTip(host: HTMLElement): void {
  const text = host.dataset.tip;
  if (!text) return;
  tipEl.textContent = text;
  tipEl.hidden = false;
  const r = host.getBoundingClientRect();
  const left = Math.max(8, Math.min(r.left, window.innerWidth - tipEl.offsetWidth - 8));
  let top = r.top - tipEl.offsetHeight - 8;
  if (top < 8) top = Math.min(window.innerHeight - tipEl.offsetHeight - 8, r.bottom + 8);
  tipEl.style.left = left + "px";
  tipEl.style.top = top + "px";
}
function hideTip(): void { tipEl.hidden = true; }
function bindTip(el: HTMLElement): void {
  if (el.dataset.tipBound) return;
  el.dataset.tipBound = "1";
  let timer = 0;
  let held = false;
  el.addEventListener("mouseenter", () => { if (!held) showTip(el); });
  el.addEventListener("mouseleave", () => { if (!held) hideTip(); });
  el.addEventListener("focus", () => showTip(el));
  el.addEventListener("blur", hideTip);
  el.addEventListener("pointerdown", (e) => {
    if (e.pointerType === "mouse") return;
    held = false;
    window.clearTimeout(timer);
    timer = window.setTimeout(() => { held = true; showTip(el); }, 480);
  });
  const end = () => window.clearTimeout(timer);
  el.addEventListener("pointerup", end);
  el.addEventListener("pointercancel", end);
  el.addEventListener("click", (e) => {
    if (!held) return;
    e.preventDefault();
    e.stopPropagation();
    held = false;
    tipLock = true;
    window.setTimeout(() => { tipLock = false; hideTip(); }, 1400);
  }, true);
}
document.querySelectorAll<HTMLElement>("[data-tip]").forEach(bindTip);

function btn(label: string, tip: string, fn: () => void, on = false): HTMLButtonElement {
  const b = document.createElement("button");
  b.type = "button";
  b.textContent = label;
  b.dataset.tip = tip;
  if (on) b.classList.add("on");
  bindTip(b);
  b.addEventListener("click", () => { if (!tipLock) fn(); });
  return b;
}

function cssSize(): { w: number; h: number; dpr: number } {
  const rect = stage.getBoundingClientRect();
  const w = Math.max(1, rect.width);
  const h = Math.max(1, rect.height);
  const dpr = Math.min(3, window.devicePixelRatio || 1);
  return { w, h, dpr };
}

function resize(): void {
  const { w, h, dpr } = cssSize();
  canvas.width = Math.max(1, Math.floor(w * dpr));
  canvas.height = Math.max(1, Math.floor(h * dpr));
  canvas.style.width = "";
  canvas.style.height = "";
  const key = screen + ":" + (run?.mapId ?? "") + ":" + Math.round(w) + "x" + Math.round(h);
  if (key !== fitted) {
    fitted = key;
    if (screen === "world" || screen === "summary" && !run) worldCam = fitCam(w, h, 1040, 640, 40);
    if (screen === "tree") treeCam = { x: 200, y: -120, z: Math.max(0.85, Math.min(1.2, w / 640)) };
    if ((screen === "battle" || screen === "summary") && run) {
      const map = mapById(run.mapId);
      if (map) {
        const fit = fitBattle(w, h, map.cols, map.rows);
        battleCam = fit.cam;
        battleMin = fit.minZ;
        battleMax = fit.maxZ;
      }
    }
  }
}

function draw(): void {
  const { w, h, dpr } = cssSize();
  const key = screen + ":" + (run?.mapId ?? "") + ":" + Math.round(w) + "x" + Math.round(h);
  if (canvas.width !== Math.floor(w * dpr) || canvas.height !== Math.floor(h * dpr) || key !== fitted) resize();
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  if (screen === "modes") {
    ctx.fillStyle = "#070b16";
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = "rgba(80, 140, 255, 0.08)";
    ctx.beginPath();
    for (let x = 0; x <= w; x += 48) { ctx.moveTo(x, 0); ctx.lineTo(x, h); }
    for (let y = 0; y <= h; y += 48) { ctx.moveTo(0, y); ctx.lineTo(w, y); }
    ctx.stroke();
  } else if (screen === "tree") paintTree(ctx, w, h, meta, treeCam, nodeId);
  else if ((screen === "battle" || screen === "summary") && run) {
    const map = mapById(run.mapId);
    if (map) paintBattle(ctx, w, h, map, run, meta, battleCam, selected, meta.damageNumbers, hover);
  } else paintWorld(ctx, w, h, meta, worldCam, endless);
  paintHud();
  const sig = footSignature();
  if (sig !== footSig) {
    footSig = sig;
    paintFoot();
    if (screen === "modes") paintModes();
  }
}

const overlay = document.getElementById("ew-overlay");

function chip(icon: string, label: string, value: string): string {
  return `<span class="chip"><img alt="" src="${spriteUrl(icon)}"><span>${label}</span> <b>${value}</b></span>`;
}

function paintHud(): void {
  shell.classList.toggle("in-battle", screen === "battle");
  shell.classList.toggle("in-modes", screen === "modes");
  const panelOn = (screen === "world" && brief >= 0) || (screen === "tree" && !!nodeId) || (screen === "summary" && !!run) || (screen === "battle" && selected > 0);
  shell.classList.toggle("panel-open", panelOn);
  panel.hidden = !panelOn;
  dockEl.hidden = screen !== "battle";
  if (overlay) overlay.hidden = screen !== "modes";
  resEl.innerHTML = [
    chip("icon_gem", "Искры", String(Math.floor(meta.sparks))),
    chip("icon_fire", "Пепел", String(Math.floor(meta.ash))),
    chip("tile_ore", "Руда", String(Math.floor(meta.vein))),
  ].join("");
  const banner = document.getElementById("ew-banner");
  if (run && screen === "battle") {
    const map = mapById(run.mapId);
    const goal = map ? (run.endless ? 0 : map.waves) : 0;
    const wait = Math.max(0, run.nextWaveAt - run.time);
    const waveLabel = run.queue.length ? "волна идёт" : (!run.endless && run.scheduled >= goal) ? "последняя волна" : `следующая через ${wait.toFixed(1)} с`;
    const waveNo = String(Math.max(run.scheduled, run.wavesCleared, 1));
    fightEl.innerHTML = [
      chip("icon_heart", "Врата", `${Math.max(0, Math.floor(run.hearts))}/${Math.floor(run.maxHearts)}`),
      chip("icon_gold", "Золото", String(Math.floor(run.gold))),
      chip("icon_skull", modeLabel(run), waveNo),
    ].join("");
    const call = document.getElementById("ew-call");
    if (call) call.dataset.tip = `Вызвать следующую волну сразу, не дожидаясь таймера. ${modeLabel(run)}, волна ${waveNo}. ${waveLabel}. Пока волна ещё выходит из портала, вызов ждёт.`;
  } else fightEl.innerHTML = "";
  if (banner) {
    const show = !!(run && screen === "battle" && run.banner && run.time < run.bannerUntil);
    banner.hidden = !show;
    banner.textContent = show && run ? run.banner : "";
  }
  for (const [id, sp] of [["ew-pause", 0], ["ew-x1", 1], ["ew-x2", 2], ["ew-x4", 4]] as const) {
    document.getElementById(id)?.classList.toggle("on", speed === sp);
  }
  document.getElementById("ew-nums")?.classList.toggle("on", meta.damageNumbers);
  document.getElementById("ew-modes")?.classList.toggle("on", screen === "modes");
  paintGlobals();
}

function paintGlobals(): void {
  if (!run || screen !== "battle") {
    if (globalsEl.childElementCount) globalsEl.replaceChildren();
    return;
  }
  const b = bonusesFor(meta, run);
  const defs: [GlobalId, string, number, boolean][] = [
    ["fire", "Пожар", 42, b.abFire],
    ["bliz", "Буран", 46, b.abBliz],
    ["dawn", "Удар зари", 78, b.abDawn],
  ];
  const sig = defs.map((d) => d[3]).join("") + (aim ?? "");
  if (globalsEl.dataset.sig !== sig) {
    globalsEl.dataset.sig = sig;
    globalsEl.replaceChildren();
    for (const [id, name, , open] of defs) {
      const button = btn(name, globalTip(meta, id, 0, run), () => {
        if (!run) return;
        if (!open) { toast("Умение ещё в древе."); return; }
        if (run.abilityCd[id] > 0.05) return;
        if (id === "bliz") {
          const res = castAbility(run, meta, "bliz", 0, 0);
          if (!res.ok) toast(res.reason);
          save();
          footSig = "";
          return;
        }
        aim = aim === id ? null : id;
        kind = null;
        footSig = "";
      }, aim === id);
      button.classList.add("ability");
      button.dataset.ability = id;
      button.setAttribute("aria-label", name);
      const icon = document.createElement("img");
      icon.alt = "";
      icon.src = spriteUrl(ABILITY_ICON[id]);
      const ring = document.createElement("span");
      ring.className = "ring";
      button.replaceChildren(ring, icon);
      globalsEl.append(button);
    }
  }
  defs.forEach(([id, name, base, open], i) => {
    const button = globalsEl.children[i] as HTMLButtonElement | undefined;
    if (!button || !run) return;
    const max = Math.max(0.01, abilityCd(base, b.cdSteps));
    const cd = run.abilityCd[id];
    const p = open ? Math.max(0, Math.min(1, cd / max)) : 1;
    button.style.setProperty("--p", `${Math.round((1 - p) * 360)}deg`);
    button.classList.toggle("cooling", !open || cd > 0.05);
    button.classList.toggle("on", aim === id && open && cd <= 0.05);
    button.dataset.tip = globalTip(meta, id, cd, run);
    button.setAttribute("aria-label", cd > 0.05 ? `${name}, ещё ${Math.ceil(cd)} с` : name);
  });
}

function footSignature(): string {
  if (screen === "modes") return "modes:" + todayKey() + ":" + JSON.stringify(meta.modeBest) + ":" + JSON.stringify(meta.dailyBest);
  if (screen === "tree") return "tree:" + nodeId + ":" + meta.sparks + ":" + meta.ash + ":" + meta.vein + ":" + JSON.stringify(meta.nodes);
  if (screen === "summary" && run) return "sum:" + run.outcome + ":" + run.wavesCleared + ":" + (run.reward?.sparks ?? 0);
  if (screen === "world") return "world:" + endless + ":" + brief + ":" + JSON.stringify(meta.stars);
  if (!run) return "empty";
  const t = run.towers.find((x) => x.id === selected);
  return ["battle", run.mode, selected, kind, walling, aim, t?.xp, t?.offer?.join(), t?.ranks.dmg, t?.ranks.rate, t?.ranks.range, t?.abilities.join(), (run.mutators ?? []).join(), shell.classList.contains("dock-collapsed")].join(":");
}

function paintFoot(): void {
  panel.replaceChildren();
  if (screen === "battle") paintDock();
  else dockEl.replaceChildren();
  if (screen === "tree") paintTreeFoot();
  else if (screen === "summary" && run) paintSummary();
  else if (screen === "world") paintWorldFoot();
  else if (run && selected) {
    const card = towerCard(run, meta, selected);
    if (card) paintCard(card);
  }
  if (panel.childElementCount) panel.prepend(sheetToggle());
}

function sheetToggle(): HTMLButtonElement {
  const collapsed = shell.classList.contains("sheet-collapsed");
  const b = btn(collapsed ? "Развернуть" : "Свернуть", "Свернуть карточку вниз, чтобы поле осталось на виду. Повторное нажатие открывает её снова.", () => {
    shell.classList.toggle("sheet-collapsed");
    fitted = "";
    footSig = "";
  });
  b.classList.add("sheet-toggle");
  return b;
}

function paintWorldFoot(): void {
  const h = document.createElement("h2");
  h.textContent = endless ? "Бесконечная ночь" : "Карта ночей";
  panel.append(h);
  const p = document.createElement("p");
  if (brief >= 0 && MAPS[brief]) {
    const map = MAPS[brief];
    h.textContent = map.name;
    const open = brief <= unlockedIndex(meta.stars);
    const preview = document.createElement("canvas");
    preview.id = "ew-preview";
    preview.width = 320;
    preview.height = 140;
    panel.append(preview);
    const pctx = preview.getContext("2d");
    if (pctx) paintMapPreview(pctx, map, preview.width, preview.height);
    const row = document.createElement("div");
    row.className = "acts";
    row.append(btn(endless ? "Начать бесконечную ночь" : "Начать ночь", endless
      ? `Бесконечная ночь «${map.name}». Волны не кончаются, рекорд — последняя полностью разобранная волна.`
      : `Начать кампанию «${map.name}». Золото этой ночи сгорит, искры останутся.`, () => start(map.id, endless), false));
    if (!open) row.append(btn("Закрыто", "Сначала возьмите хотя бы одну звезду на предыдущей ночи.", () => toast("Эта ночь ещё закрыта.")));
    if (run && run.outcome === "play") row.append(btn("Вернуться в ночь", "Снова открыть текущую ночь. Она не сбрасывается.", () => { screen = "battle"; fitted = ""; footSig = ""; }));
    panel.append(row);
    const best = document.createElement("p");
    best.textContent = endless
      ? `Лучшая волна: ${meta.endlessBest[map.id] ?? 0}.`
      : `Звёзды: ${"★".repeat(meta.stars[map.id] ?? 0)}${"☆".repeat(3 - (meta.stars[map.id] ?? 0))}.`;
    panel.append(best);
    for (const line of briefLines(map, meta.stars[map.id] ?? 0, meta.endlessBest[map.id] ?? 0)) {
      const rowLine = document.createElement("p");
      rowLine.textContent = line;
      panel.append(rowLine);
    }
  } else {
    p.textContent = endless
      ? "Выберите открытую ночь. Под узлом — лучшая волна на этом устройстве."
      : "Выберите ночь. Три звезды: дойти до конца, сохранить половину Врат, не пустить никого и удержать 80%.";
    panel.append(p);
    if (endless) {
      const list = document.createElement("div");
      for (const map of MAPS) {
        const line = document.createElement("p");
        const open = MAPS.indexOf(map) <= unlockedIndex(meta.stars);
        line.textContent = open ? `${map.name}: волна ${meta.endlessBest[map.id] ?? 0}` : `${map.name}: закрыто`;
        list.append(line);
      }
      panel.append(list);
    }
    if (run && run.outcome === "play") panel.append(btn("Вернуться в ночь", "Снова открыть текущую ночь. Она не сбрасывается.", () => { screen = "battle"; fitted = ""; footSig = ""; }));
  }
}

function paintDock(): void {
  hideTip();
  dockEl.replaceChildren();
  const collapsed = shell.classList.contains("dock-collapsed");
  const toggle = btn(collapsed ? "▴" : "▾", collapsed ? "Показать ряд башен." : "Спрятать ряд башен, чтобы поле стало крупнее.", () => {
    shell.classList.toggle("dock-collapsed");
    footSig = "";
  });
  toggle.classList.add("dock-handle");
  toggle.setAttribute("aria-label", collapsed ? "Показать башни" : "Спрятать башни");
  dockEl.append(toggle);
  const dock = document.createElement("div");
  dock.className = "dock";
  if (run?.mode === "maze") {
    const wallBtn = btn("Стена", `Стена за ${WALL_COST} золота. Враги обходят её, но путь от портала до Врат должен остаться. Долгое нажатие повторяет эту подсказку.`, () => {
      walling = !walling;
      if (walling) { kind = null; aim = null; }
      hover = null;
      footSig = "";
    }, walling);
    const img = document.createElement("img");
    img.alt = "";
    img.src = spriteUrl("decor_fence");
    wallBtn.prepend(img);
    const small = document.createElement("small");
    small.textContent = `${WALL_COST} золота`;
    wallBtn.append(small);
    dock.append(wallBtn);
  }
  if (run?.mode === "sandbox") {
    dock.append(btn("Закончить", "Закрыть песочницу. Искры, пепел и руда не начисляются, рекорд не пишется.", () => {
      if (!run) return;
      endRun(run, meta);
      screen = "summary";
      save();
      footSig = "";
    }));
  }
  for (const entry of dockOf(meta, run)) {
    const b = btn(entry.label, entry.tip, () => {
      if (entry.locked) { toast("Сначала откройте башню в древе."); return; }
      walling = false;
      kind = kind === entry.kind ? null : entry.kind;
      aim = null;
      hover = null;
      footSig = "";
    }, kind === entry.kind);
    if (entry.locked) b.classList.add("locked");
    const img = document.createElement("img");
    img.alt = "";
    img.src = spriteUrl(towerFrame(entry.kind, false));
    b.prepend(img);
    if (entry.locked) {
      const lock = document.createElement("img");
      lock.alt = "";
      lock.className = "lock";
      lock.src = spriteUrl("icon_lock");
      b.append(lock);
    }
    const small = document.createElement("small");
    small.textContent = entry.locked ? "в древе" : entry.cost === 0 ? "свободно" : `${entry.cost} золота`;
    b.append(small);
    dock.append(b);
  }
  dockEl.append(dock);
}

function paintCard(card: { title: string; lines: string[]; buttons: { id: string; label: string; tip: string }[] }): void {
  const tower = run?.towers.find((t) => t.id === selected);
  const head = document.createElement("div");
  head.className = "tower-head";
  if (tower) {
    const img = document.createElement("img");
    img.alt = "";
    const upgraded = tower.abilities.length > 0 || tower.ranks.dmg + tower.ranks.rate + tower.ranks.range >= 2;
    img.src = spriteUrl(towerFrame(tower.kind, upgraded));
    head.append(img);
  }
  const h = document.createElement("h2");
  h.textContent = card.title;
  head.append(h);
  panel.append(head);
  if (tower && run) {
    const map = mapById(run.mapId);
    const bar = xpBar(tower.xp);
    const xp = document.createElement("div");
    xp.className = "xp";
    const fill = document.createElement("span");
    fill.style.width = `${Math.max(4, Math.min(100, (bar.into / Math.max(1, bar.need)) * 100))}%`;
    xp.append(fill);
    panel.append(xp);
    const st = map ? statsOf(tower, modAt(map, run, tower.x, tower.y), bonusesFor(meta, run), 0) : null;
    const grid = document.createElement("div");
    grid.className = "statgrid";
    const cells: [string, string][] = [
      ["Уровень", String(bar.level)],
      ["До след.", `${Math.floor(bar.into)}/${bar.need}`],
      ["Убийства", String(tower.kills)],
      ["Нанесено", fmt(tower.dealt)],
    ];
    if (tower.kind === "miner") {
      cells.push(["Стрельба", "нет"], ["Добыча", "руда"]);
    } else if (st) {
      cells.push(["Урон", fmt(st.dmg)], ["Темп", `${fmt(st.rate)}/с`], ["Радиус", fmt(st.range)]);
    }
    cells.push(["Прицел", TARGET_NAME[tower.target]]);
    for (const [k, v] of cells) {
      const cell = document.createElement("div");
      const name = document.createElement("b");
      name.textContent = k;
      const val = document.createElement("span");
      val.textContent = v;
      cell.append(name, val);
      grid.append(cell);
    }
    panel.append(grid);
  }
  for (const line of card.lines) {
    const p = document.createElement("p");
    p.textContent = line;
    panel.append(p);
  }
  const actCard = (id: string) => {
    if (!run) return;
    let res = { ok: true, reason: "" };
    if (id.startsWith("up:")) res = upgradeTower(run, meta, selected, id.slice(3) as "dmg" | "rate" | "range");
    else if (id === "target") res = cycleTarget(run, selected);
    else if (id === "sell") { res = sellTower(run, meta, selected); if (res.ok) selected = 0; }
    else if (id.startsWith("ab:")) res = chooseAbility(run, selected, id.slice(3));
    if (!res.ok) toast(res.reason);
    save();
    footSig = "";
  };
  const offers = card.buttons.filter((b) => b.id.startsWith("ab:"));
  if (offers.length) {
    const title = document.createElement("h3");
    title.textContent = "Выбор умения";
    panel.append(title);
    for (const button of offers) {
      const raw = button.id.slice(3).replace(/^up:/, "");
      const def = ABILITY_BY_ID[raw];
      const cardBtn = btn(def?.name ?? button.label, button.tip, () => actCard(button.id));
      cardBtn.className = "ability-card";
      const name = document.createElement("b");
      name.textContent = button.id.includes("up:") ? `Усилить: ${def?.name ?? raw}` : (def?.name ?? button.label);
      const desc = document.createElement("span");
      desc.textContent = def?.text ?? button.tip;
      cardBtn.replaceChildren(name, desc);
      cardBtn.dataset.tip = button.tip;
      panel.append(cardBtn);
    }
  }
  const acts = document.createElement("div");
  acts.className = "acts";
  for (const button of card.buttons) {
    if (button.id.startsWith("ab:")) continue;
    acts.append(btn(button.label, button.tip, () => actCard(button.id)));
  }
  acts.append(btn("Закрыть", "Закрыть карточку. Карта и док башен остаются на месте.", () => { selected = 0; footSig = ""; }));
  panel.append(acts);
  const stamps = document.createElement("div");
  stamps.className = "acts";
  const mods: [ModKind, string][] = [["dmg", "Клеймо урона"], ["range", "Клеймо радиуса"], ["rate", "Клеймо темпа"], ["xp", "Клеймо опыта"], ["bounty", "Клеймо дани"]];
  for (const [mod, label] of mods) {
    stamps.append(btn(label, `${label}. 42 золота. Кладётся на пустырь и усиливает башню на этой клетке. Слотов за ночь: ${bonusesFor(meta, run).stamps}.`, () => {
      toast("Коснитесь пустыря, чтобы положить клеймо.");
      kind = null;
      aim = null;
      (window as unknown as { __stamp?: ModKind }).__stamp = mod;
      footSig = "";
    }));
  }
  panel.append(stamps);
}

function paintTreeFoot(): void {
  const h = document.createElement("h2");
  h.textContent = "Древо ночи";
  panel.append(h);
  const p = document.createElement("p");
  p.textContent = nodeId ? nodeTip(meta, nodeId) : "Выберите узел. Древо сдвигается пальцем и щипком. Долгое нажатие на узел показывает ту же подсказку.";
  panel.append(p);
  if (nodeId) {
    const lv = meta.nodes[nodeId] ?? 0;
    const maxed = (nodeById(nodeId)?.max ?? 1) <= lv;
    panel.append(btn(maxed ? "Уровень максимальный" : "Изучить", nodeTip(meta, nodeId), () => {
      const res = buyNode(meta, nodeId!);
      if (!res.ok) toast(res.reason);
      else save();
      footSig = "";
    }));
  }
}

function paintSummary(): void {
  if (!run) return;
  const h = document.createElement("h2");
  h.textContent = run.outcome === "win" ? "Ночь удержана" : "Врата пали";
  panel.append(h);
  const acts = document.createElement("div");
  acts.className = "acts";
  acts.append(btn("К карте", "Вернуться к карте ночей. Награда уже записана.", () => { run = null; endless = false; screen = "world"; brief = -1; footSig = ""; }));
  acts.append(btn("Ещё раз", "Начать эту же ночь заново. Мета не сбрасывается.", () => {
    if (!run) return;
    if (run.mode === "campaign" || run.mode === "endless") start(run.mapId, run.mode === "endless");
    else startMode(run.mode, run.dailyKey);
  }));
  acts.append(btn("В древо", "Открыть древо и потратить добычу этой ночи.", () => { screen = "tree"; footSig = ""; }));
  panel.append(acts);
  for (const line of summaryLines(run)) {
    const p = document.createElement("p");
    p.textContent = line;
    panel.append(p);
  }
}

function paintModes(): void {
  if (!overlay) return;
  hideTip();
  overlay.replaceChildren();
  const wrap = document.createElement("div");
  wrap.className = "mode-grid";
  const intro = document.createElement("div");
  intro.className = "mode-intro";
  const h = document.createElement("h2");
  h.textContent = "Режимы";
  const p = document.createElement("p");
  p.textContent = "Десять отдельных ночей. Рекорды пишутся на этом устройстве. Кампания и древо остаются на карте.";
  intro.append(h, p);
  const back = btn("К карте ночей", "Закрыть режимы и вернуться к кампании. Текущая ночь, если она идёт, не сбрасывается.", () => {
    screen = run && run.outcome === "play" ? "battle" : "world";
    fitted = "";
    footSig = "";
  });
  intro.append(back);
  wrap.append(intro);
  const today = todayKey();
  for (const mode of PLAY_MODES) {
    const best = mode.id === "daily" ? (meta.dailyBest[today] ?? 0) : (meta.modeBest[mode.id] ?? 0);
    const dailyNote = mode.id === "daily"
      ? " Сегодня: " + dailyMutators(today).map((id) => mutatorById(id)?.name ?? id).join(" и ") + "."
      : "";
    const tip = `${mode.name}. ${mode.summary}\n${mode.rules}\n${mode.research}\n${mode.score}${dailyNote}\nРекорд: ${best}.`;
    const card = btn(mode.name, tip, () => startMode(mode.id, today));
    card.className = "mode-card";
    const img = document.createElement("img");
    img.alt = "";
    img.src = spriteUrl(mode.icon);
    const name = document.createElement("b");
    name.textContent = mode.name;
    const sum = document.createElement("span");
    sum.textContent = mode.summary + dailyNote;
    const rec = document.createElement("small");
    rec.textContent = mode.id === "sandbox" ? "Без рекорда" : mode.id === "daily" ? `Рекорд ${today}: ${best}` : `Рекорд: ${best}`;
    card.replaceChildren(img, name, sum, rec);
    card.dataset.tip = tip;
    wrap.append(card);
  }
  overlay.append(wrap);
}

function startMode(id: ModeId, dailyKey = ""): void {
  if (id === "campaign" || id === "endless") return;
  if (run && run.outcome === "play") endRun(run, meta);
  const next = openMode(meta, id, (Date.now() % 100000) + 1, dailyKey || todayKey());
  if (!next) { toast("Режим не собрался."); return; }
  run = next;
  endless = false;
  screen = "battle";
  selected = 0;
  aim = null;
  walling = id === "maze";
  kind = walling ? null : (bonusesFor(meta, next).unlocked.spark ? "spark" : null);
  fitted = "";
  speed = 1;
  shell.classList.add("in-battle");
  dockEl.hidden = false;
  resize();
  save();
  footSig = "";
  const info = modeInfo(id);
  if (info) toast(info.name);
}

function start(id: string, end: boolean): void {
  const index = MAPS.findIndex((m) => m.id === id);
  if (!end && index > unlockedIndex(meta.stars)) { toast("Сначала предыдущая ночь."); return; }
  if (end && index > unlockedIndex(meta.stars)) { toast("Бесконечная ночь открыта вместе с кампанией."); return; }
  if (run && run.outcome === "play") endRun(run, meta);
  const next = beginRun(meta, id, end, (Date.now() % 100000) + 1);
  if (!next) { toast("Нет такой ночи."); return; }
  run = next;
  endless = end;
  screen = "battle";
  selected = 0;
  aim = null;
  walling = false;
  kind = bonusesFor(meta, next).unlocked.spark ? "spark" : null;
  fitted = "";
  speed = 1;
  shell.classList.add("in-battle");
  dockEl.hidden = false;
  resize();
  save();
  footSig = "";
}

const ptrs = new Map<number, { x: number; y: number; sx: number; sy: number; moved: boolean }>();
let pinch: { dist: number; z: number } | null = null;

function cam(): Cam {
  if (screen === "tree") return treeCam;
  if ((screen === "battle" || screen === "summary") && run) return battleCam;
  return worldCam;
}
function setCam(c: Cam): void {
  if (screen === "tree") treeCam = c;
  else if ((screen === "battle" || screen === "summary") && run) battleCam = c;
  else worldCam = c;
}

canvas.addEventListener("pointerdown", (e) => {
  canvas.setPointerCapture(e.pointerId);
  ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, moved: false });
  if (ptrs.size === 2) {
    const [a, b] = [...ptrs.values()];
    pinch = { dist: Math.hypot(a.x - b.x, a.y - b.y), z: cam().z };
  }
});
canvas.addEventListener("pointermove", (e) => {
  const p = ptrs.get(e.pointerId);
  if (!p) return;
  const dx = e.clientX - p.x;
  const dy = e.clientY - p.y;
  if (Math.hypot(e.clientX - p.sx, e.clientY - p.sy) > 8) p.moved = true;
  p.x = e.clientX;
  p.y = e.clientY;
  const c = cam();
  updateHover(e.clientX, e.clientY);
  if (ptrs.size >= 2 && pinch) {
    const [a, b] = [...ptrs.values()];
    const dist = Math.max(8, Math.hypot(a.x - b.x, a.y - b.y));
    const z = clampZoom(pinch.z * (dist / pinch.dist));
    setCam({ ...c, z });
    pinch = { dist, z };
    return;
  }
  if (p.moved) setCam({ ...c, x: c.x - dx / c.z, y: c.y - dy / c.z });
});
canvas.addEventListener("pointerup", (e) => {
  const p = ptrs.get(e.pointerId);
  ptrs.delete(e.pointerId);
  pinch = null;
  if (!p || p.moved) return;
  const rect = canvas.getBoundingClientRect();
  tap(e.clientX - rect.left, e.clientY - rect.top);
});
canvas.addEventListener("pointercancel", (e) => { ptrs.delete(e.pointerId); pinch = null; });
canvas.addEventListener("pointermove", (e) => {
  if (!ptrs.has(e.pointerId)) updateHover(e.clientX, e.clientY);
});
canvas.addEventListener("pointerleave", () => { hover = null; });
canvas.addEventListener("wheel", (e) => {
  e.preventDefault();
  const c = cam();
  setCam({ ...c, z: clampZoom(c.z * (e.deltaY > 0 ? 0.9 : 1.1)) });
}, { passive: false });

function clampZoom(z: number): number {
  if (screen === "battle" || screen === "summary") return Math.max(battleMin, Math.min(battleMax, z));
  if (screen === "tree") return Math.max(0.35, Math.min(2.2, z));
  return Math.max(0.22, Math.min(1.8, z));
}

function updateHover(clientX: number, clientY: number): void {
  if (screen !== "battle" || !run || (!kind && !walling)) { hover = null; return; }
  const map = mapById(run.mapId);
  if (!map) { hover = null; return; }
  const rect = canvas.getBoundingClientRect();
  const { w, h } = cssSize();
  const world = toWorld(battleCam, w, h, clientX - rect.left, clientY - rect.top);
  const x = Math.floor(world.x);
  const y = Math.floor(world.y);
  const ch = y >= 0 && x >= 0 && y < map.rows && x < map.cols ? map.grid[y][x] : "#";
  const free = !run.towers.some((t) => t.x === x && t.y === y) && !run.walls.includes(x + "," + y);
  if (walling) {
    hover = { x, y, kind: "wall", range: 0, ok: ".+*~^$".includes(ch) && free };
    return;
  }
  if (!kind) { hover = null; return; }
  const okTile = kind === "miner" ? ch === "v" && free : ".+*~^$".includes(ch) && free;
  const range = previewStats(kind, bonusesFor(meta, run)).range;
  hover = { x, y, kind, range, ok: okTile };
}

let canvasTipTimer = 0;
canvas.addEventListener("pointerdown", (e) => {
  if (e.pointerType === "mouse" || screen === "battle") return;
  window.clearTimeout(canvasTipTimer);
  canvasTipTimer = window.setTimeout(() => showCanvasTip(e.clientX, e.clientY), 480);
});
canvas.addEventListener("pointerup", () => window.clearTimeout(canvasTipTimer));
canvas.addEventListener("pointermove", (e) => {
  if (screen === "tree" && e.pointerType === "mouse" && ptrs.size === 0) showCanvasTip(e.clientX, e.clientY, true);
});

function tap(sx: number, sy: number): void {
  const { w, h } = cssSize();
  if (screen === "tree") {
    nodeId = treeHit(treeCam, w, h, sx, sy) ?? nodeId;
    footSig = "";
    return;
  }
  if (screen === "world") {
    const i = worldHit(worldCam, w, h, sx, sy);
    if (i >= 0) { brief = i; footSig = ""; }
    return;
  }
  if (!run || screen !== "battle") return;
  const map = mapById(run.mapId);
  if (!map) return;
  const world = toWorld(battleCam, w, h, sx, sy);
  const x = Math.floor(world.x);
  const y = Math.floor(world.y);
  if (aim === "fire" || aim === "dawn") {
    const res = castAbility(run, meta, aim, world.x, world.y);
    if (!res.ok) toast(res.reason);
    aim = null;
    save();
    footSig = "";
    return;
  }
  const stamp = (window as unknown as { __stamp?: ModKind }).__stamp;
  if (stamp) {
    const res = placeStamp(run, meta, x, y, stamp);
    if (!res.ok) toast(res.reason);
    (window as unknown as { __stamp?: ModKind }).__stamp = undefined;
    save();
    footSig = "";
    return;
  }
  const hit = run.towers.find((t) => t.x === x && t.y === y);
  if (hit && !walling) { selected = hit.id; kind = null; footSig = ""; return; }
  if (walling) {
    const res = placeWall(run, meta, x, y);
    if (!res.ok) toast(res.reason);
    else { save(); footSig = ""; }
    return;
  }
  if (kind) {
    const res = placeTower(run, meta, x, y, kind);
    if (!res.ok) toast(res.reason);
    else { save(); footSig = ""; }
  }
}

function showCanvasTip(clientX: number, clientY: number, hoverOnly = false): void {
  const rect = canvas.getBoundingClientRect();
  const { w, h } = cssSize();
  const sx = clientX - rect.left;
  const sy = clientY - rect.top;
  let text = "";
  if (screen === "tree") {
    const id = treeHit(treeCam, w, h, sx, sy);
    if (id) text = nodeTip(meta, id);
  }
  if (!text) { hideTip(); return; }
  void hoverOnly;
  tipEl.textContent = text;
  tipEl.hidden = false;
  tipEl.style.left = Math.max(8, Math.min(clientX, window.innerWidth - tipEl.offsetWidth - 8)) + "px";
  tipEl.style.top = Math.max(8, clientY - tipEl.offsetHeight - 10) + "px";
}

document.getElementById("ew-call")?.addEventListener("click", () => {
  if (!run) return;
  const res = callWave(run);
  if (!res.ok) toast(res.reason);
});
document.getElementById("ew-pause")?.addEventListener("click", () => { speed = speed === 0 ? 1 : 0; });
document.getElementById("ew-x1")?.addEventListener("click", () => { speed = 1; });
document.getElementById("ew-x2")?.addEventListener("click", () => { speed = 2; });
document.getElementById("ew-x4")?.addEventListener("click", () => { speed = 4; });
document.getElementById("ew-nums")?.addEventListener("click", () => { meta.damageNumbers = !meta.damageNumbers; save(); });
document.getElementById("ew-menu")?.addEventListener("click", () => { shell.classList.toggle("nav-open"); });
document.getElementById("ew-tree")?.addEventListener("click", () => { shell.classList.remove("nav-open"); screen = "tree"; fitted = ""; footSig = ""; });
document.getElementById("ew-endless")?.addEventListener("click", () => { shell.classList.remove("nav-open"); endless = true; screen = "world"; brief = -1; fitted = ""; footSig = ""; });
document.getElementById("ew-world")?.addEventListener("click", () => {
  shell.classList.remove("nav-open");
  endless = false; screen = "world"; brief = -1; fitted = ""; footSig = "";
});
document.getElementById("ew-modes")?.addEventListener("click", () => {
  shell.classList.remove("nav-open");
  screen = "modes";
  fitted = "";
  footSig = "";
});

window.addEventListener("resize", () => { fitted = ""; resize(); });
resize();
save();

let last = performance.now();
let saveAcc = 0;
function frame(now: number): void {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (run && screen === "battle" && run.outcome === "play" && speed > 0) {
    acc += dt * speed;
    let n = 0;
    while (acc >= 0.05 && n < 10) {
      stepRun(run, meta, 0.05);
      acc -= 0.05;
      n++;
    }
    saveAcc += dt;
    if (run.outcome !== "play") { screen = "summary"; save(); footSig = ""; saveAcc = 0; }
    else if (saveAcc > 4) { save(); saveAcc = 0; }
  }
  draw();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

if (new URLSearchParams(location.search).has("shot")) {
  const hook = {
    meta: () => meta,
    run: () => run,
    screen: () => screen,
    start: (id: string, end = false) => start(id, end),
    place: (x: number, y: number, k: TowerKind) => run ? placeTower(run, meta, x, y, k) : { ok: false, reason: "" },
    wall: (x: number, y: number) => run ? placeWall(run, meta, x, y) : { ok: false, reason: "" },
    select: (id: number) => { selected = id; screen = "battle"; if (run) syncOffers(run); footSig = ""; },
    fast: (seconds: number) => {
      if (!run) return;
      const steps = Math.round(seconds / 0.05);
      for (let i = 0; i < steps && run.outcome === "play"; i++) stepRun(run, meta, 0.05);
      if (run.outcome !== "play") screen = "summary";
      save();
      footSig = "";
    },
    buy: (id: string) => buyNode(meta, id),
    sparks: (n: number) => { meta.sparks += n; },
    tree: () => { screen = "tree"; fitted = ""; footSig = ""; },
    endless: () => { endless = true; screen = "world"; brief = -1; fitted = ""; footSig = ""; },
    world: () => { endless = false; screen = "world"; brief = -1; fitted = ""; footSig = ""; },
    modes: () => { screen = "modes"; fitted = ""; footSig = ""; },
    mode: (id: ModeId) => startMode(id),
    summary: () => { if (run) { endRun(run, meta); screen = "summary"; footSig = ""; } },
    stageHeight: () => stage.getBoundingClientRect().height,
    zoom: () => battleCam.z,
    stageWidth: () => stage.getBoundingClientRect().width,
    pick: (index: number) => { brief = index; endless = false; screen = "world"; selected = 0; footSig = ""; },
    spawn: (ek: EnemyKind, n: number, progress: number) => {
      if (!run) return 0;
      const map = mapById(run.mapId);
      const air = ek === "flyer";
      const route = map ? (air ? map.air : map.ground)[0] : null;
      const limit = Math.max(0.4, (route?.length ?? 8) - 0.7);
      let p = Math.max(0, progress);
      for (let i = 0; i < n; i++) {
        let guard = 0;
        while (guard++ < 80 && run.enemies.some((e) => e.alive && e.air === air && Math.abs(e.progress - p) < PATH_GAP)) p += PATH_GAP;
        if (p > limit) break;
        debugSpawn(run, meta, ek, p);
        p += PATH_GAP;
      }
      footSig = "";
      return run.enemies.length;
    },
  };
  (window as unknown as { __ew: typeof hook }).__ew = hook;
}
