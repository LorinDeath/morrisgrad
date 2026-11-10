// Клиент «Вечной стражи». Симуляция живёт в logic.ts.
import {
  MAPS, SAVE_KEY, SAVE_KEY_V1, TOWER_COLOR, TOWERS, buyNode, castAbility, chooseAbility,
  compile, cycleTarget, beginRun, endRun, loadMeta, mapById, nodeById, placeStamp, placeTower, sellTower,
  serializeMeta, stepRun, syncOffers, unlockedIndex, upgradeTower, briefLines, dockOf, globalTip,
  nodeTip, summaryLines, towerCard,
} from "./logic.ts";
import { fitCam, paintBattle, paintTree, paintWorld, toWorld, treeHit, worldHit, type Cam } from "./draw.ts";
import type { GlobalId, Meta, ModKind, Run, TowerKind } from "./logic.ts";

type Screen = "world" | "battle" | "tree" | "summary";

const app = document.getElementById("ew-app");
const stage = document.getElementById("ew-stage") as HTMLElement;
const canvas = document.getElementById("ew-canvas") as HTMLCanvasElement;
const context = canvas.getContext("2d");
const foot = document.getElementById("ew-foot") as HTMLElement;
const resEl = document.getElementById("ew-res") as HTMLElement;
const toastEl = document.getElementById("ew-toast") as HTMLElement;
const tipEl = document.getElementById("ew-tip") as HTMLElement;
if (!app || !stage || !canvas || !context || !foot || !resEl || !tipEl) throw new Error("нет оболочки");
const ctx: CanvasRenderingContext2D = context;

const loaded = loadMeta(localStorage.getItem(SAVE_KEY), localStorage.getItem(SAVE_KEY_V1));
let meta: Meta = loaded.meta;
let persist = loaded.persist;
let run: Run | null = meta.run && meta.run.outcome === "play" ? meta.run : null;
let screen: Screen = run ? "battle" : "world";
let endless = false;
let speed: 0 | 1 | 2 | 4 = 1;
let selected = 0;
let kind: TowerKind | null = "spark";
let aim: GlobalId | null = null;
let nodeId: string | null = RESEARCH_FIRST();
let brief = -1;
let worldCam: Cam = { x: 520, y: 320, z: 1 };
let treeCam: Cam = { x: 400, y: 280, z: 1 };
let battleCam: Cam = { x: 8, y: 5, z: 32 };
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
  let h = rect.height;
  if (h < 120) {
    h = Math.max(160, window.innerHeight * 0.42);
    stage.style.minHeight = h + "px";
  }
  const w = Math.max(1, rect.width);
  const dpr = Math.min(3, window.devicePixelRatio || 1);
  return { w, h, dpr };
}

function resize(): void {
  const { w, h, dpr } = cssSize();
  canvas.width = Math.max(1, Math.floor(w * dpr));
  canvas.height = Math.max(1, Math.floor(h * dpr));
  canvas.style.width = w + "px";
  canvas.style.height = h + "px";
  const key = screen + ":" + (run?.mapId ?? "") + ":" + Math.round(w) + "x" + Math.round(h);
  if (key !== fitted) {
    fitted = key;
    if (screen === "world" || screen === "summary" && !run) worldCam = fitCam(w, h, 1040, 640, 40);
    if (screen === "tree") {
      const z = Math.max(0.7, Math.min(1.15, w / 700));
      treeCam = { x: 70 + (w / z) * 0.42, y: 80 + (h / z) * 0.36, z };
    }
    if ((screen === "battle" || screen === "summary") && run) {
      const map = mapById(run.mapId);
      if (map) battleCam = fitCam(w, h, map.cols, map.rows, 1.2);
    }
  }
}

function draw(): void {
  const { w, h, dpr } = cssSize();
  if (canvas.width !== Math.floor(w * dpr) || canvas.height !== Math.floor(h * dpr)) resize();
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  if (screen === "tree") paintTree(ctx, w, h, meta, treeCam, nodeId);
  else if ((screen === "battle" || screen === "summary") && run) {
    const map = mapById(run.mapId);
    if (map) paintBattle(ctx, w, h, map, run, meta, battleCam, selected, meta.damageNumbers);
  } else paintWorld(ctx, w, h, meta, worldCam, endless);
  paintHud();
  const sig = footSignature();
  if (sig !== footSig) { footSig = sig; paintFoot(); }
}

function paintHud(): void {
  const bits = [`<span>Искры <b>${Math.floor(meta.sparks)}</b></span>`, `<span>Пепел <b>${Math.floor(meta.ash)}</b></span>`, `<span>Руда <b>${Math.floor(meta.vein)}</b></span>`];
  if (run) {
    bits.unshift(`<span>Золото <b>${Math.floor(run.gold)}</b></span>`);
    bits.unshift(`<span>Врата <b>${Math.max(0, Math.floor(run.hearts))}/${Math.floor(run.maxHearts)}</b></span>`);
    bits.push(`<span>Волна <b>${Math.max(1, run.scheduled || 1)}</b></span>`);
  }
  resEl.innerHTML = bits.join("");
  for (const [id, sp] of [["ew-pause", 0], ["ew-x1", 1], ["ew-x2", 2], ["ew-x4", 4]] as const) {
    document.getElementById(id)?.classList.toggle("on", speed === sp && !!run);
  }
  document.getElementById("ew-nums")?.classList.toggle("on", meta.damageNumbers);
}

function footSignature(): string {
  if (screen === "tree") return "tree:" + nodeId + ":" + meta.sparks + ":" + meta.ash + ":" + meta.vein + ":" + JSON.stringify(meta.nodes);
  if (screen === "summary" && run) return "sum:" + run.outcome + ":" + run.wavesCleared + ":" + (run.reward?.sparks ?? 0);
  if (screen === "world") return "world:" + endless + ":" + brief + ":" + JSON.stringify(meta.stars);
  if (!run) return "empty";
  const t = run.towers.find((x) => x.id === selected);
  return ["battle", run.gold, run.hearts, selected, kind, aim, t?.xp, t?.offer?.join(), t?.ranks.dmg, t?.abilities.join(), run.abilityCd.fire, run.abilityCd.bliz, run.abilityCd.dawn].join(":");
}

function paintFoot(): void {
  foot.replaceChildren();
  if (screen === "tree") return paintTreeFoot();
  if (screen === "summary" && run) return paintSummary();
  if (screen === "world") return paintWorldFoot();
  if (run && selected) {
    const card = towerCard(run, meta, selected);
    if (card) return paintCard(card);
  }
  paintDock();
}

function paintWorldFoot(): void {
  const h = document.createElement("h2");
  h.textContent = endless ? "Бесконечная ночь" : "Карта ночей";
  foot.append(h);
  const p = document.createElement("p");
  if (brief >= 0 && MAPS[brief]) {
    const map = MAPS[brief];
    const open = brief <= unlockedIndex(meta.stars);
    for (const line of briefLines(map, meta.stars[map.id] ?? 0, meta.endlessBest[map.id] ?? 0)) {
      const row = document.createElement("p");
      row.textContent = line;
      foot.append(row);
    }
    const row = document.createElement("div");
    row.className = "acts";
    row.append(btn(endless ? "Начать бесконечную ночь" : "Начать ночь", endless
      ? `Бесконечная ночь «${map.name}». Волны не кончаются, рекорд — последняя полностью разобранная волна.`
      : `Начать кампанию «${map.name}». Золото этой ночи сгорит, искры останутся.`, () => start(map.id, endless), false));
    if (!open) row.append(btn("Закрыто", "Сначала возьмите хотя бы одну звезду на предыдущей ночи.", () => toast("Эта ночь ещё закрыта.")));
    if (run && run.outcome === "play") row.append(btn("Вернуться в ночь", "Снова открыть текущую ночь. Она не сбрасывается.", () => { screen = "battle"; fitted = ""; footSig = ""; }));
    foot.append(row);
  } else {
    p.textContent = endless
      ? "Выберите открытую ночь. Под узлом — лучшая волна на этом устройстве."
      : "Выберите ночь. Три звезды: дойти до конца, сохранить половину Врат, не пустить никого и удержать 80%.";
    foot.append(p);
    if (run && run.outcome === "play") foot.append(btn("Вернуться в ночь", "Снова открыть текущую ночь. Она не сбрасывается.", () => { screen = "battle"; fitted = ""; footSig = ""; }));
  }
}

function paintDock(): void {
  const h = document.createElement("h2");
  h.textContent = run ? (mapById(run.mapId)?.name ?? "Ночь") : "Башни";
  foot.append(h);
  if (run && aim) {
    const p = document.createElement("p");
    p.textContent = aim === "bliz" ? "Буран накрывает всю ночь." : "Коснитесь сетки — умение ударит в эту клетку.";
    foot.append(p);
  }
  const dock = document.createElement("div");
  dock.className = "dock";
  for (const entry of dockOf(meta)) {
    const b = btn(entry.label, entry.tip, () => {
      if (entry.locked) { toast("Сначала откройте башню в древе."); return; }
      kind = kind === entry.kind ? null : entry.kind;
      selected = 0;
      aim = null;
      footSig = "";
    }, kind === entry.kind);
    if (entry.locked) b.classList.add("locked");
    const small = document.createElement("small");
    small.textContent = entry.locked ? "древо" : String(TOWERS[entry.kind].cost);
    b.append(small);
    b.style.boxShadow = kind === entry.kind ? `inset 0 0 0 2px ${TOWER_COLOR[entry.kind]}` : "";
    dock.append(b);
  }
  foot.append(dock);
  if (run) {
    const acts = document.createElement("div");
    acts.className = "acts";
    const b = compile(meta);
    const globals: GlobalId[] = ["fire", "bliz", "dawn"];
    for (const id of globals) {
      const open = id === "fire" ? b.abFire : id === "bliz" ? b.abBliz : b.abDawn;
      const name = id === "fire" ? "Пожар" : id === "bliz" ? "Буран" : "Удар зари";
      acts.append(btn(name, globalTip(meta, id, run.abilityCd[id]), () => {
        if (!open) { toast("Умение ещё в древе."); return; }
        if (id === "bliz") {
          const res = castAbility(run!, meta, "bliz", 0, 0);
          if (!res.ok) toast(res.reason);
          save();
          footSig = "";
          return;
        }
        aim = aim === id ? null : id;
        kind = null;
        selected = 0;
        footSig = "";
      }, aim === id));
    }
    if (endless || screen === "battle") {
      acts.append(btn("Закончить ночь", "Сдаться. Ночь считается поражением, награда за разобранные волны остаётся.", () => {
        if (!run) return;
        endRun(run, meta);
        screen = "summary";
        save();
        footSig = "";
      }));
    }
    foot.append(acts);
  }
}

function paintCard(card: { title: string; lines: string[]; buttons: { id: string; label: string; tip: string }[] }): void {
  const box = document.createElement("div");
  box.className = "card";
  const h = document.createElement("h2");
  h.textContent = card.title;
  box.append(h);
  const offers = card.buttons.filter((b) => b.id.startsWith("ab:"));
  const rest = card.buttons.filter((b) => !b.id.startsWith("ab:"));
  if (offers.length) {
    const pick = document.createElement("div");
    pick.className = "acts";
    for (const button of offers) pick.append(btn(button.label, button.tip, () => actCard(button.id)));
    box.append(pick);
  }
  for (const line of card.lines) {
    const p = document.createElement("p");
    p.textContent = line;
    box.append(p);
  }
  const acts = document.createElement("div");
  acts.className = "acts";
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
  for (const button of rest) {
    acts.append(btn(button.label, button.tip, () => actCard(button.id)));
  }
  acts.append(btn("К башням", "Закрыть карточку и вернуться к списку башен. Карта остаётся на месте.", () => { selected = 0; footSig = ""; }));
  box.append(acts);
  const stamps = document.createElement("div");
  stamps.className = "acts";
  const mods: [ModKind, string][] = [["dmg", "Клеймо урона"], ["range", "Клеймо радиуса"], ["rate", "Клеймо темпа"], ["xp", "Клеймо опыта"], ["bounty", "Клеймо дани"]];
  for (const [mod, label] of mods) {
    stamps.append(btn(label, `${label}. 42 золота. Кладётся на пустырь и усиливает башню на этой клетке. Слотов за ночь: ${compile(meta).stamps}.`, () => {
      toast("Коснитесь пустыря, чтобы положить клеймо.");
      kind = null;
      aim = null;
      (window as unknown as { __stamp?: ModKind }).__stamp = mod;
      footSig = "";
    }));
  }
  box.append(stamps);
  foot.append(box);
}

function paintTreeFoot(): void {
  const h = document.createElement("h2");
  h.textContent = "Древо ночи";
  foot.append(h);
  const p = document.createElement("p");
  p.textContent = nodeId ? nodeTip(meta, nodeId) : "Выберите узел. Древо сдвигается пальцем и щипком.";
  foot.append(p);
  if (nodeId) {
    const lv = meta.nodes[nodeId] ?? 0;
    const maxed = (nodeById(nodeId)?.max ?? 1) <= lv;
    foot.append(btn(maxed ? "Уровень максимальный" : "Изучить", nodeTip(meta, nodeId), () => {
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
  foot.append(h);
  const acts = document.createElement("div");
  acts.className = "acts";
  acts.append(btn("К карте", "Вернуться к карте ночей. Награда уже записана.", () => { run = null; endless = false; screen = "world"; brief = -1; footSig = ""; }));
  acts.append(btn("Ещё раз", "Начать эту же ночь заново. Мета не сбрасывается.", () => start(run!.mapId, run!.endless)));
  acts.append(btn("В древо", "Открыть древо и потратить добычу этой ночи.", () => { screen = "tree"; footSig = ""; }));
  foot.append(acts);
  for (const line of summaryLines(run)) {
    const p = document.createElement("p");
    p.textContent = line;
    foot.append(p);
  }
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
  kind = compile(meta).unlocked.spark ? "spark" : null;
  fitted = "";
  speed = 1;
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
  if (ptrs.size >= 2 && pinch) {
    const [a, b] = [...ptrs.values()];
    const dist = Math.max(8, Math.hypot(a.x - b.x, a.y - b.y));
    const z = Math.max(6, Math.min(c.z * 4, pinch.z * (dist / pinch.dist)));
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
canvas.addEventListener("wheel", (e) => {
  e.preventDefault();
  const c = cam();
  const z = Math.max(6, Math.min(160, c.z * (e.deltaY > 0 ? 0.9 : 1.1)));
  setCam({ ...c, z });
}, { passive: false });

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
  if (hit) { selected = hit.id; kind = null; footSig = ""; return; }
  if (kind) {
    const res = placeTower(run, meta, x, y, kind);
    if (!res.ok) toast(res.reason);
    else { save(); footSig = ""; }
  }
}

document.getElementById("ew-pause")?.addEventListener("click", () => { speed = speed === 0 ? 1 : 0; });
document.getElementById("ew-x1")?.addEventListener("click", () => { speed = 1; });
document.getElementById("ew-x2")?.addEventListener("click", () => { speed = 2; });
document.getElementById("ew-x4")?.addEventListener("click", () => { speed = 4; });
document.getElementById("ew-nums")?.addEventListener("click", () => { meta.damageNumbers = !meta.damageNumbers; save(); });
document.getElementById("ew-tree")?.addEventListener("click", () => { screen = "tree"; fitted = ""; footSig = ""; });
document.getElementById("ew-endless")?.addEventListener("click", () => { endless = true; screen = "world"; brief = -1; fitted = ""; footSig = ""; });
document.getElementById("ew-world")?.addEventListener("click", () => {
  endless = false; screen = "world"; brief = -1; fitted = ""; footSig = "";
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
    summary: () => { if (run) { endRun(run, meta); screen = "summary"; footSig = ""; } },
    stageHeight: () => stage.getBoundingClientRect().height,
  };
  (window as unknown as { __ew: typeof hook }).__ew = hook;
}
