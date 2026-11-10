// Клиент «Вечной стражи»: канвас с целым масштабом, док башен, карточка, подсказки.
import {
  COLS,
  MAP_H,
  MAP_W,
  ROWS,
  SAVE_KEY,
  SHOP,
  TILE,
  TOWERS,
  auraFor,
  bankDawn,
  bankDefeat,
  beginNight,
  buyShop,
  canDawn,
  chooseGlyph,
  combosOf,
  cycleTarget,
  dawnConversion,
  dawnWave,
  ensureLawOffer,
  fitCanvas,
  formatNumber,
  isPath,
  lawSpec,
  liveLines,
  mergeTowers,
  padsFor,
  parseSave,
  pathPose,
  placeCost,
  placeTower,
  rerollCost,
  rerollRune,
  resonanceText,
  runeSpec,
  sellTower,
  serializeSave,
  shopOwned,
  shotRange,
  socketRune,
  spawnEnemy,
  stepRun,
  towerSpec,
  towerTip,
  unsocketRune,
  upgradeCost,
  upgradeTower,
  COMBO_TEXT,
  TARGET_NAME,
  type EnemyKind,
  type GlyphId,
  type LawId,
  type Meta,
  type Run,
  type Tower,
  type TowerKind,
} from "./logic";

const ROOT = "/games/eternal-watch/sprites";
const ENEMY_LIFT = 3;
const FPS: Record<EnemyKind, number> = { walker: 4, runner: 8, tank: 3, swarm: 0, healer: 4, boss: 3 };
const FRAMES: Record<EnemyKind, readonly string[]> = {
  walker: ["enemy_walker_1", "enemy_walker_2"],
  runner: ["enemy_runner_1", "enemy_runner_2"],
  tank: ["enemy_tank_1", "enemy_tank_2"],
  swarm: ["enemy_swarm"],
  healer: ["enemy_healer_1", "enemy_healer_2"],
  boss: ["enemy_boss_1", "enemy_boss_2"],
};

type Screen = "title" | "play" | "defeat" | "dawn";

function mount(): () => void {
  const canvas = document.getElementById("ew-canvas") as HTMLCanvasElement | null;
  const stage = document.getElementById("ew-stage");
  const ctx = canvas?.getContext("2d") ?? null;
  const heartsEl = document.querySelector("#ew-hearts b");
  const goldEl = document.querySelector("#ew-gold b");
  const sparksEl = document.querySelector("#ew-sparks b");
  const waveEl = document.querySelector("#ew-wave b");
  const titleEl = document.getElementById("ew-title");
  const defeatEl = document.getElementById("ew-defeat");
  const dawnEl = document.getElementById("ew-dawn");
  const shopEl = document.getElementById("ew-shop");
  const cardEl = document.getElementById("ew-card");
  const dockEl = document.getElementById("ew-dock");
  const toastEl = document.getElementById("ew-toast");
  const tipEl = document.getElementById("ew-tip");
  const startBtn = document.getElementById("ew-start") as HTMLButtonElement | null;
  if (!canvas || !stage || !ctx || !heartsEl || !goldEl || !sparksEl || !waveEl || !titleEl || !defeatEl || !dawnEl || !shopEl || !cardEl || !dockEl || !toastEl || !tipEl || !startBtn) {
    return () => {};
  }
  const g = ctx;

  const loaded = parseSave(localStorage.getItem(SAVE_KEY));
  let meta: Meta = loaded.meta;
  let allowWrite = loaded.allowWrite;
  let run: Run | null = meta.run;
  let screen: Screen = run?.defeated ? "defeat" : run ? "play" : "title";
  let shopOpen = false;
  let selectedKind: TowerKind | null = "mortar";
  let selectedId = 0;
  let hover: { x: number; y: number } | null = null;
  let sprites = new Map<string, HTMLImageElement>();
  let S = 1;
  let vis = 0;
  let last = performance.now();
  let saveAt = 0;
  let raf = 0;
  let alive = true;
  let toastTimer = 0;
  let cardSig = "";
  let dockSig = "";
  let tipLock = false;

  const save = (force = false) => {
    if (!allowWrite) return;
    if (run) meta.run = run;
    const now = performance.now();
    if (!force && now < saveAt) return;
    saveAt = now + 5000;
    try { localStorage.setItem(SAVE_KEY, serializeSave(meta)); } catch { /* хранилище занято */ }
  };

  const toast = (text: string) => {
    toastEl.textContent = text;
    toastEl.hidden = !text;
    window.clearTimeout(toastTimer);
    if (text) toastTimer = window.setTimeout(() => { toastEl.hidden = true; }, 1600);
  };

  const showTip = (host: HTMLElement) => {
    const text = host.dataset.tip;
    if (!text) return;
    tipEl.textContent = text;
    tipEl.hidden = false;
    const r = host.getBoundingClientRect();
    const tw = tipEl.offsetWidth;
    const th = tipEl.offsetHeight;
    let left = r.left + r.width / 2 - tw / 2;
    let top = r.top - th - 8;
    if (top < 8) top = Math.min(window.innerHeight - th - 8, r.bottom + 8);
    left = Math.max(8, Math.min(left, window.innerWidth - tw - 8));
    tipEl.style.left = `${left}px`;
    tipEl.style.top = `${top}px`;
  };
  const hideTip = () => { tipEl.hidden = true; };

  const bindTips = (root: ParentNode) => {
    root.querySelectorAll<HTMLElement>("[data-tip]").forEach((el) => {
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
      el.addEventListener("pointerleave", end);
      el.addEventListener("click", (e) => {
        if (!held) return;
        e.preventDefault();
        e.stopPropagation();
        held = false;
        tipLock = true;
        window.setTimeout(() => { tipLock = false; hideTip(); }, 1400);
      }, true);
    });
  };
  bindTips(document);

  const act = (res: { ok: boolean; reason: string }) => {
    if (!res.ok && res.reason) toast(res.reason);
    if (res.ok) save(true);
    cardSig = "";
    dockSig = "";
  };

  const pads = () => padsFor(meta.extraPads, run?.laws ?? meta.laws);
  const padSet = () => new Set(pads().map((p) => p.x + "," + p.y));

  const syncScreen = () => {
    titleEl.hidden = screen !== "title" || shopOpen;
    defeatEl.hidden = screen !== "defeat" || shopOpen;
    dawnEl.hidden = screen !== "dawn" || shopOpen;
    shopEl.hidden = !shopOpen;
    dockEl.hidden = false;
    if (screen !== "play") {
      cardEl.hidden = true;
      selectedId = 0;
    }
    if (startBtn) {
      startBtn.textContent = run && !run.defeated ? "Продолжить ночь" : "Начать ночь";
      startBtn.dataset.tip = run && !run.defeated
        ? "Продолжить сохранённую ночь с того же места."
        : "Начать ночь: золото и башни этой ночи, искры и законы уже ваши.";
    }
    const dawnBtn = document.getElementById("ew-defeat-dawn");
    if (dawnBtn) dawnBtn.hidden = !(run && canDawn(run));
    const back = document.getElementById("ew-dawn-back");
    if (back) back.hidden = !run || run.defeated;
  };

  const openShop = () => {
    shopOpen = true;
    paintShop();
    syncScreen();
  };
  const closeShop = () => { shopOpen = false; syncScreen(); };

  const paintShop = () => {
    const list = document.getElementById("ew-shop-list");
    if (!list) return;
    list.replaceChildren();
    for (const item of SHOP) {
      const owned = shopOwned(meta, item.id);
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "shop-row";
      const left = document.createElement("span");
      const b = document.createElement("b");
      b.textContent = item.name;
      const small = document.createElement("small");
      small.textContent = owned >= item.max ? "Уже куплено. " + item.text : item.text;
      left.append(b, small);
      const cost = document.createElement("span");
      cost.className = "cost";
      cost.textContent = owned >= item.max ? "есть" : `${item.cost} искр`;
      btn.append(left, cost);
      btn.dataset.tip = `${item.name}. ${item.text} Цена: ${item.cost} искр. Сейчас искр: ${formatNumber(meta.sparks)}.`;
      btn.addEventListener("click", () => {
        if (tipLock) return;
        act(buyShop(meta, item.id, run));
        paintShop();
        dockSig = "";
      });
      list.append(btn);
    }
    bindTips(list);
  };

  const paintDawn = () => {
    if (!run) return;
    const text = document.getElementById("ew-dawn-text");
    const box = document.getElementById("ew-laws");
    if (!text || !box) return;
    const wave = dawnWave(run);
    const gain = dawnConversion(run.gold, wave, run.laws);
    text.textContent = `Волна ${wave}. Золото ${formatNumber(run.gold)} станет ${formatNumber(gain)} искрами. Башни снимаются, руны возвращаются в сумку. Выберите один закон — он останется навсегда.`;
    const offer = ensureLawOffer(meta, run);
    box.replaceChildren();
    if (!offer.length) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "law";
      btn.dataset.tip = "Все законы уже взяты. Рассвет даёт 15 искр.";
      btn.innerHTML = "<b>Искры вместо закона</b>Все законы уже у вас. Забрать 15 искр.";
      btn.addEventListener("click", () => {
        if (tipLock || !run) return;
        act(bankDawn(meta, run, null));
        run = null;
        screen = "title";
        syncScreen();
        save(true);
      });
      box.append(btn);
    } else {
      for (const id of offer) {
        const law = lawSpec(id);
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "law";
        btn.dataset.tip = `${law.name}. ${law.text}`;
        const b = document.createElement("b");
        b.textContent = law.name;
        const small = document.createElement("span");
        small.textContent = law.text;
        btn.append(b, small);
        btn.addEventListener("click", () => {
          if (tipLock || !run) return;
          const cur = run;
          act(bankDawn(meta, cur, id as LawId));
          run = null;
          screen = "title";
          syncScreen();
          save(true);
          toast(`Закон «${law.name}» останется навсегда.`);
        });
        box.append(btn);
      }
    }
    bindTips(box);
  };

  const paintDefeat = () => {
    const text = document.getElementById("ew-defeat-text");
    if (!text || !run) return;
    text.textContent = `Врата пали на волне ${run.wave}. За ночь собрано искр: ${formatNumber(run.sparksNight)}. Всего искр: ${formatNumber(meta.sparks)}.`;
  };

  const paintDock = () => {
    const sig = `${run ? run.gold : "no"}|${meta.chain}|${meta.well}|${meta.discount}|${run?.discountUsed ?? false}|${run?.beaconFree ?? false}|${selectedKind}|${screen}`;
    if (sig === dockSig && dockEl.childElementCount > 0) return;
    dockSig = sig;
    dockEl.replaceChildren();
    for (const spec of TOWERS) {
      const locked = (spec.kind === "chain" && !meta.chain) || (spec.kind === "well" && !meta.well);
      const cost = run ? placeCost(run, spec.kind) : spec.cost;
      const btn = document.createElement("button");
      btn.type = "button";
      if (locked) btn.classList.add("locked");
      if (screen === "play" && selectedKind === spec.kind) btn.classList.add("on");
      const img = document.createElement("img");
      img.src = `${ROOT}/32/tower_${spec.kind}.png`;
      img.alt = "";
      img.width = 32;
      img.height = 32;
      const nm = document.createElement("span");
      nm.textContent = spec.name;
      const pr = document.createElement("span");
      pr.textContent = locked ? `${spec.shop} искр` : `${cost}`;
      btn.append(img, nm, pr);
      btn.dataset.tip = towerTip(spec.kind, cost, locked);
      btn.addEventListener("click", () => {
        if (tipLock) return;
        if (screen !== "play" || !run) {
          toast("Сначала начните ночь — тогда башню можно поставить на площадку.");
          return;
        }
        if (locked) {
          toast(spec.kind === "chain" ? "Цепь открывается в лавке за 40 искр." : "Колодец открывается в лавке за 55 искр.");
          return;
        }
        selectedKind = spec.kind;
        selectedId = 0;
        cardEl.hidden = true;
        dockSig = "";
      });
      dockEl.append(btn);
    }
    bindTips(dockEl);
  };

  const paintCard = () => {
    if (!run || screen !== "play") return;
    const tower = run.towers.find((t) => t.id === selectedId);
    if (!tower) {
      cardEl.hidden = true;
      return;
    }
    const combos = combosOf(run.towers, tower.id);
    const sig = JSON.stringify({
      id: tower.id, lv: tower.level, g: tower.glyphs, r: tower.runes, tg: tower.target, aw: tower.awakened,
      bag: run.bag, slots: run.slots, combos, res: resonanceText(run.towers, tower.id),
      dmg: Math.round(shotRange(run, tower) * 100),
    });
    if (sig === cardSig && !cardEl.hidden) return;
    cardSig = sig;
    cardEl.hidden = false;
    cardEl.replaceChildren();
    const spec = towerSpec(tower.kind);
    const h3 = document.createElement("h3");
    h3.textContent = `${spec.name} · ур. ${tower.level}${tower.awakened ? " · пробуждена" : ""}`;
    cardEl.append(h3);
    const acts = document.createElement("div");
    acts.className = "acts";
    const up = document.createElement("button");
    up.type = "button";
    const ucost = tower.level >= 8 ? 0 : upgradeCost(tower);
    up.textContent = tower.level >= 8 ? "Максимум" : `Улучшить · ${formatNumber(ucost)}`;
    up.dataset.tip = tower.level >= 3 && tower.glyphs.length === 0
      ? "Сначала выберите глиф. Пока его нет, башня не идёт на 4 уровень. Урон и темп текущего уровня уже работают."
      : `Улучшение даёт +18% урона и +4% темпа от базы. Цена: ${formatNumber(ucost)} золота. Сейчас золота ${formatNumber(run.gold)}.`;
    up.addEventListener("click", () => { if (tipLock || !run) return; act(upgradeTower(run, tower.id)); });
    const sell = document.createElement("button");
    sell.type = "button";
    const refund = Math.floor(tower.spent * 0.7);
    sell.textContent = `Продать · ${formatNumber(refund)}`;
    sell.dataset.tip = `Вернуть 70% золота, потраченного на эту башню: ${formatNumber(refund)}. Руны вернутся в сумку.`;
    sell.addEventListener("click", () => {
      if (tipLock || !run) return;
      act(sellTower(run, tower.id));
      selectedId = 0;
      cardEl.hidden = true;
    });
    const aim = document.createElement("button");
    aim.type = "button";
    aim.textContent = `Прицел: ${TARGET_NAME[tower.target]}`;
    aim.dataset.tip = "По кругу: первый на тропе, последний, сильнейший, ближайший. От этого зависит, кого башня бьёт первой.";
    aim.addEventListener("click", () => { if (tipLock || !run) return; act(cycleTarget(run, tower.id)); });
    const close = document.createElement("button");
    close.type = "button";
    close.textContent = "Закрыть";
    close.dataset.tip = "Закрыть карточку. Карта остаётся на месте.";
    close.addEventListener("click", () => { selectedId = 0; cardEl.hidden = true; cardSig = ""; });
    acts.append(up, sell, aim, close);
    cardEl.append(acts);
    const lines = liveLines(run, tower).slice(1);
    for (const line of lines) {
      const p = document.createElement("p");
      p.textContent = line;
      cardEl.append(p);
    }
    const aura = auraFor(run.towers, tower);
    if (aura) {
      const p = document.createElement("p");
      p.textContent = `Аура маяка: +${Math.round(aura.rate * 100)}% темпа, +${aura.range} радиуса${aura.gold ? ", золото с убийств рядом" : ""}.`;
      cardEl.append(p);
    }
    const rp = document.createElement("p");
    rp.textContent = resonanceText(run.towers, tower.id);
    cardEl.append(rp);
    if (combos.length) {
      for (const id of combos) {
        const p = document.createElement("p");
        p.textContent = COMBO_TEXT[id];
        cardEl.append(p);
      }
    } else {
      const p = document.createElement("p");
      p.textContent = "Сочетаний нет: поставьте рядом башню другого типа.";
      cardEl.append(p);
    }

    const needGlyph = (tower.level >= 3 && tower.glyphs.length === 0) || (tower.awakened && tower.glyphs.length < 2);
    if (needGlyph) {
      const box = document.createElement("div");
      box.className = "glyphs";
      for (const gl of spec.glyphs) {
        if (tower.glyphs.includes(gl.id)) continue;
        const b = document.createElement("button");
        b.type = "button";
        b.textContent = gl.name;
        b.dataset.tip = `${gl.name}. ${gl.text}`;
        b.addEventListener("click", () => {
          if (tipLock || !run) return;
          act(chooseGlyph(run, tower.id, gl.id as GlyphId));
        });
        box.append(b);
      }
      cardEl.append(box);
    } else if (tower.glyphs.length) {
      const p = document.createElement("p");
      p.textContent = "Глифы: " + tower.glyphs.map((id) => spec.glyphs.find((g) => g.id === id)?.name ?? id).join(", ") + ".";
      cardEl.append(p);
    }

    const rr = document.createElement("div");
    rr.className = "runes";
    for (let i = 0; i < run.slots; i++) {
      const rune = tower.runes[i];
      const b = document.createElement("button");
      b.type = "button";
      if (rune) {
        const rs = runeSpec(rune);
        b.textContent = rs.name;
        b.classList.add("on");
        const tip = `Руна «${rs.name}». ${rs.text} Нажатие снимает руну обратно в сумку.`;
        b.dataset.tip = tip;
        b.title = tip;
        b.setAttribute("aria-label", tip);
        b.addEventListener("click", () => { if (tipLock || !run) return; act(unsocketRune(run, tower.id, i)); });
      } else {
        b.textContent = `Слот ${i + 1}`;
        const tip = "Пустой слот руны. Руна меняет выстрел этой башни: урон, темп, золото, казнь, прыжок или другой приём. Вставьте её кнопкой из сумки ниже.";
        b.dataset.tip = tip;
        b.title = tip;
        b.setAttribute("aria-label", tip);
      }
      rr.append(b);
    }
    if (tower.runes.length) {
      const rb = document.createElement("button");
      rb.type = "button";
      const cost = rerollCost(run);
      rb.textContent = run.rerollUsed ? "Переброс был" : `Переброс · ${cost}`;
      rb.dataset.tip = `Один раз за ночь заменить первую руну башни на случайную. Цена: ${cost} золота. Старая руна уходит.`;
      rb.addEventListener("click", () => { if (tipLock || !run) return; act(rerollRune(run, tower.id, 0)); });
      rr.append(rb);
    }
    cardEl.append(rr);

    if (run.bag.length) {
      const bag = document.createElement("div");
      bag.className = "runes";
      run.bag.forEach((id, index) => {
        const rs = runeSpec(id);
        const b = document.createElement("button");
        b.type = "button";
        b.textContent = rs.name;
        const tip = `Руна «${rs.name}». ${rs.text} Нажатие вставит её в свободный слот этой башни.`;
        b.dataset.tip = tip;
        b.title = tip;
        b.setAttribute("aria-label", tip);
        b.addEventListener("click", () => { if (tipLock || !run) return; act(socketRune(run, tower.id, index)); });
        bag.append(b);
      });
      cardEl.append(bag);
    } else {
      const p = document.createElement("p");
      p.textContent = "Сумка рун пуста. Руны падают с врагов.";
      cardEl.append(p);
    }

    const mates = run.towers.filter((o) => o.id !== tower.id && o.kind === tower.kind && o.level >= 5 && tower.level >= 5);
    if (run.laws.includes("merge") && mates.length && !run.merged) {
      const box = document.createElement("div");
      box.className = "acts";
      for (const m of mates) {
        const b = document.createElement("button");
        b.type = "button";
        b.textContent = `Слить с ${m.x},${m.y}`;
        b.dataset.tip = "Слияние: эта башня становится пробуждённой (+35% урона и второй глиф). Вторая башня снимается. Один раз за ночь.";
        b.addEventListener("click", () => { if (tipLock || !run) return; act(mergeTowers(run, tower.id, m.id)); });
        box.append(b);
      }
      cardEl.append(box);
    }
    bindTips(cardEl);
  };

  const cellOf = (ev: PointerEvent) => {
    const rect = canvas.getBoundingClientRect();
    const x = ((ev.clientX - rect.left) / rect.width) * MAP_W;
    const y = ((ev.clientY - rect.top) / rect.height) * MAP_H;
    if (x < 0 || y < 0 || x >= MAP_W || y >= MAP_H) return null;
    return { x: Math.floor(x / TILE), y: Math.floor(y / TILE) };
  };

  const onPointer = (ev: PointerEvent) => {
    if (screen !== "play" || shopOpen || !run) return;
    const cell = cellOf(ev);
    hover = cell;
    if (ev.type !== "pointerdown" || !cell || tipLock) return;
    const tower = run.towers.find((t) => t.x === cell.x && t.y === cell.y);
    if (tower) {
      selectedId = tower.id;
      cardSig = "";
      paintCard();
      return;
    }
    if (padSet().has(cell.x + "," + cell.y) && selectedKind) {
      const res = placeTower(run, meta, cell.x, cell.y, selectedKind);
      act(res);
      if (res.ok) {
        const placed = run.towers.find((t) => t.x === cell.x && t.y === cell.y);
        if (placed) {
          selectedId = placed.id;
          cardSig = "";
        }
      }
      return;
    }
    selectedId = 0;
    cardEl.hidden = true;
  };

  const resize = () => {
    const rect = stage.getBoundingClientRect();
    const frame = document.getElementById("ew-frame")?.getBoundingClientRect();
    const width = rect.width >= 8 ? rect.width : Math.max(8, (frame?.width ?? window.innerWidth) - 24);
    const dpr = window.devicePixelRatio || 1;
    S = fitCanvas(width, rect.height, dpr).S;
    canvas.width = MAP_W * S;
    canvas.height = MAP_H * S;
    canvas.style.width = `${(MAP_W * S) / dpr}px`;
    canvas.style.height = `${(MAP_H * S) / dpr}px`;
    g.setTransform(S, 0, 0, S, 0, 0);
    g.imageSmoothingEnabled = false;
  };

  const spr = (name: string) => sprites.get(name) ?? null;

  const drawAnchored = (name: string, px: number, py: number, lift: number, face: 1 | -1) => {
    const img = spr(name);
    if (!img) return;
    const frameX = Math.round((px - 0.5) * TILE);
    const frameY = Math.round((py - 0.5) * TILE - lift);
    if (face < 0) {
      g.save();
      g.translate(frameX + 8, 0);
      g.scale(-1, 1);
      g.drawImage(img, -8, frameY, 16, 16);
      g.restore();
    } else g.drawImage(img, frameX, frameY, 16, 16);
  };

  const pix = (x: number, y: number, color: string, w = 1, h = 1) => {
    g.fillStyle = color;
    g.fillRect(Math.round(x), Math.round(y), w, h);
  };

  const frameRect = (x: number, y: number, color: string) => {
    pix(x * TILE, y * TILE, color, TILE, 1);
    pix(x * TILE, y * TILE + TILE - 1, color, TILE, 1);
    pix(x * TILE, y * TILE, color, 1, TILE);
    pix(x * TILE + TILE - 1, y * TILE, color, 1, TILE);
  };

  const circle = (cx: number, cy: number, r: number, color: string) => {
    const steps = Math.max(16, Math.round(r));
    for (let i = 0; i < steps; i++) {
      const a = (i / steps) * Math.PI * 2;
      pix(cx + Math.cos(a) * r, cy + Math.sin(a) * r, color);
    }
  };

  const drawMap = () => {
    const padsNow = padSet();
    const ground = spr("tile_ground");
    const path = spr("tile_path");
    const pad = spr("tile_pad");
    const wall = spr("tile_wall");
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        if (ground) g.drawImage(ground, x * TILE, y * TILE, 16, 16);
      }
    }
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        const k = x + "," + y;
        if (isPath(x, y)) {
          if (path) g.drawImage(path, x * TILE, y * TILE, 16, 16);
        } else if (!padsNow.has(k) && (x === 0 || y === 0 || x === COLS - 1 || y === ROWS - 1)) {
          if (wall) drawAnchored("tile_wall", x + 0.5, y + 0.5, 0, 1);
        }
      }
    }
    for (const p of pads()) if (pad) g.drawImage(pad, p.x * TILE, p.y * TILE, 16, 16);
    const spawn = spr("tile_spawn");
    const gate = spr("tile_gate");
    if (spawn) g.drawImage(spawn, 15 * TILE, 2 * TILE, 16, 16);
    if (gate) g.drawImage(gate, 1 * TILE, 2 * TILE, 16, 16);
    const t = vis * 2;
    if (Math.floor(t) % 2 === 0) {
      pix(1 * TILE + 7, 2 * TILE + 6, "#ffe9a0");
      pix(1 * TILE + 8, 2 * TILE + 5, "#f0d090");
    }
  };

  const drawRange = (x: number, y: number, range: number, color: string) => {
    circle((x + 0.5) * TILE, (y + 0.5) * TILE, range * TILE, color);
  };

  const paint = () => {
    g.setTransform(S, 0, 0, S, 0, 0);
    g.imageSmoothingEnabled = false;
    g.clearRect(0, 0, MAP_W, MAP_H);
    drawMap();
    const ghost = hover;
    if (run && screen === "play" && ghost && selectedKind && padSet().has(ghost.x + "," + ghost.y) && !run.towers.some((t) => t.x === ghost.x && t.y === ghost.y)) {
      drawRange(ghost.x, ghost.y, towerSpec(selectedKind).range, "#e0a15a");
      g.globalAlpha = 0.72;
      drawAnchored(`tower_${selectedKind}`, ghost.x + 0.5, ghost.y + 0.5, 0, 1);
      g.globalAlpha = 1;
    }
    if (run) {
      const sel = run.towers.find((t) => t.id === selectedId);
      if (sel && sel.kind !== "beacon") drawRange(sel.x, sel.y, shotRange(run, sel), "#f0d090");
      if (sel && sel.kind === "beacon") drawRange(sel.x, sel.y, 1.5, "#f0d090");
      for (const t of run.towers) {
        const up = t.level >= 5 || t.awakened ? "2" : "";
        drawAnchored(`tower_${t.kind}${up}`, t.x + 0.5, t.y + 0.5, 0, 1);
        if (t.id === selectedId) frameRect(t.x, t.y, "#f0d090");
      }
      for (const e of run.enemies) {
        if (!e.alive) continue;
        const pose = pathPose(e.progress);
        const frames = FRAMES[e.kind];
        const fps = FPS[e.kind];
        const frame = frames[fps ? Math.floor(vis * fps + e.id) % frames.length : 0]!;
        let lift = ENEMY_LIFT + (e.kind === "swarm" ? 1 + Math.round(Math.sin(vis * 3 + e.id) ) : 0);
        if (e.kind === "swarm") {
          for (const dx of [-3, 0, 3]) {
            g.save();
            g.translate(dx, 0);
            drawAnchored(frame, pose.x, pose.y, lift, pose.face);
            g.restore();
          }
        } else drawAnchored(frame, pose.x, pose.y, lift, pose.face);
        const bx = Math.round((pose.x - 0.5) * TILE + 2);
        const by = Math.round((pose.y - 0.5) * TILE - lift - 3);
        pix(bx, by, "#1a1626", 12, 2);
        const w = Math.max(0, Math.round(12 * (e.hp / e.maxHp)));
        pix(bx, by, e.kind === "boss" ? "#e24b3b" : "#d2a15a", w, 2);
        if (e.freezeUntil > run.time) pix(bx + 5, by - 2, "#d8f4ff", 2, 2);
      }
      for (const p of run.projectiles) {
        const name = p.kind === "mortar" ? "proj_mortar" : p.kind === "frost" ? "proj_frost" : p.kind === "spike" ? "proj_spike" : "proj_chain";
        const img = spr(name);
        if (!img) continue;
        const cx = Math.round(p.x * TILE);
        const cy = Math.round(p.y * TILE);
        if (p.kind === "spike" || p.kind === "frost") {
          g.save();
          g.translate(cx, cy);
          g.rotate(Math.atan2(p.vy, p.vx));
          g.drawImage(img, -8, -8, 16, 16);
          g.restore();
        } else g.drawImage(img, cx - 8, cy - 8, 16, 16);
      }
      for (const f of run.fx) {
        if (f.kind === "beam") {
          const x0 = Math.round(f.x * TILE);
          const y0 = Math.round(f.y * TILE);
          const x1 = Math.round(f.x2 * TILE);
          const y1 = Math.round(f.y2 * TILE);
          let x = x0;
          let y = y0;
          const dx = Math.abs(x1 - x0);
          const dy = Math.abs(y1 - y0);
          const sx = x0 < x1 ? 1 : -1;
          const sy = y0 < y1 ? 1 : -1;
          let err = dx - dy;
          for (let n = 0; n < 80; n++) {
            pix(x, y, n % 2 ? "#fff6d0" : "#f0d090");
            if (x === x1 && y === y1) break;
            const e2 = 2 * err;
            if (e2 > -dy) { err -= dy; x += sx; }
            if (e2 < dx) { err += dx; y += sy; }
          }
        } else {
          const img = spr(f.kind === "explode" ? "fx_explode" : "fx_hit");
          if (!img) continue;
          const sc = f.kind === "explode" ? Math.max(16, Math.round(16 * f.scale)) : 16;
          g.drawImage(img, Math.round(f.x * TILE - sc / 2), Math.round(f.y * TILE - sc / 2), sc, sc);
        }
      }
    }
  };

  const hud = () => {
    const hearts = run ? run.hearts : 20 + meta.heartRanks * 5;
    const maxH = run ? run.maxHearts : 20 + meta.heartRanks * 5;
    heartsEl.textContent = `${hearts}/${maxH}`;
    goldEl.textContent = formatNumber(run ? run.gold : 0);
    sparksEl.textContent = formatNumber(meta.sparks);
    waveEl.textContent = run ? (run.phase === "gap" ? `Волна ${run.wave} · пауза` : `Волна ${run.wave}`) : "Волна —";
    document.getElementById("ew-pause")?.classList.toggle("on", !!run && run.speed === 0);
    document.getElementById("ew-x1")?.classList.toggle("on", !!run && run.speed === 1);
    document.getElementById("ew-x2")?.classList.toggle("on", !!run && run.speed === 2);
    const pause = document.getElementById("ew-pause");
    if (pause && run && canDawn(run) && screen === "play") {
      pause.dataset.dawn = "1";
    }
  };

  const loop = (now: number) => {
    if (!alive) return;
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    vis += dt;
    if (run && screen === "play" && !shopOpen) stepRun(run, meta, dt);
    if (run && screen === "play" && run.defeated) {
      screen = "defeat";
      paintDefeat();
      syncScreen();
      save(true);
    }
    paint();
    hud();
    paintDock();
    if (screen === "play") paintCard();
    if (screen === "play") save(false);
    dawnHud.hidden = !(run && screen === "play" && canDawn(run));
    raf = requestAnimationFrame(loop);
  };

  const setSpeed = (s: 0 | 1 | 2) => {
    if (!run || screen !== "play") return;
    run.speed = s;
    save(false);
  };

  const startNight = () => {
    if (!run || run.defeated) {
      if (run?.defeated) {
        bankDefeat(meta, run);
        run = null;
      }
      run = beginNight(meta, (Date.now() ^ (meta.night * 997)) >>> 0);
    }
    screen = "play";
    shopOpen = false;
    selectedKind = "mortar";
    dockSig = "";
    syncScreen();
    save(true);
  };

  startBtn.addEventListener("click", () => { if (!tipLock) startNight(); });
  document.getElementById("ew-title-shop")?.addEventListener("click", () => { if (!tipLock) openShop(); });
  document.getElementById("ew-shop-btn")?.addEventListener("click", () => { if (!tipLock) openShop(); });
  document.getElementById("ew-shop-close")?.addEventListener("click", () => { if (!tipLock) closeShop(); });
  document.getElementById("ew-pause")?.addEventListener("click", () => { if (!tipLock) setSpeed(0); });
  document.getElementById("ew-x1")?.addEventListener("click", () => { if (!tipLock) setSpeed(1); });
  document.getElementById("ew-x2")?.addEventListener("click", () => { if (!tipLock) setSpeed(2); });
  document.getElementById("ew-again")?.addEventListener("click", () => {
    if (tipLock || !run) return;
    bankDefeat(meta, run);
    run = null;
    startNight();
  });
  document.getElementById("ew-defeat-dawn")?.addEventListener("click", () => {
    if (tipLock || !run || !canDawn(run)) return;
    screen = "dawn";
    paintDawn();
    syncScreen();
  });
  document.getElementById("ew-dawn-back")?.addEventListener("click", () => {
    if (tipLock || !run || run.defeated) return;
    screen = "play";
    syncScreen();
  });
  const dawnHud = document.createElement("button");
  dawnHud.type = "button";
  dawnHud.className = "shop";
  dawnHud.id = "ew-dawn-hud";
  dawnHud.textContent = "Рассвет";
  dawnHud.dataset.tip = "Встретить Рассвет: обменять оставшееся золото на искры и выбрать закон. Ночь начнётся заново, искры и законы останутся.";
  dawnHud.addEventListener("click", () => {
    if (tipLock || !run || !canDawn(run)) return;
    screen = "dawn";
    paintDawn();
    syncScreen();
  });
  document.getElementById("ew-hud")?.append(dawnHud);
  bindTips(dawnHud.parentElement ?? document);

  canvas.addEventListener("pointerdown", onPointer);
  canvas.addEventListener("pointermove", (e) => { hover = cellOf(e); });
  canvas.addEventListener("pointerleave", () => { hover = null; });

  const onKey = (e: KeyboardEvent) => {
    if (e.key === " " || e.code === "Space") {
      if (!run || screen !== "play") return;
      e.preventDefault();
      setSpeed(run.speed === 0 ? 1 : 0);
    } else if (e.key === "1") setSpeed(1);
    else if (e.key === "2") setSpeed(2);
    else if (e.key === "Escape") {
      if (shopOpen) closeShop();
      else if (screen === "dawn" && run && !run.defeated) { screen = "play"; syncScreen(); }
      else { selectedId = 0; cardEl.hidden = true; }
    }
  };
  window.addEventListener("keydown", onKey);

  const ro = new ResizeObserver(() => resize());
  ro.observe(stage);
  const frameEl = document.getElementById("ew-frame");
  if (frameEl) ro.observe(frameEl);
  const onResize = () => resize();
  window.addEventListener("resize", onResize);
  window.addEventListener("orientationchange", onResize);
  window.visualViewport?.addEventListener("resize", onResize);
  resize();
  requestAnimationFrame(resize);
  syncScreen();
  paintDock();
  if (screen === "defeat") paintDefeat();

  const names = [
    "tile_ground", "tile_path", "tile_pad", "tile_spawn", "tile_gate", "tile_wall",
    ...TOWERS.flatMap((t) => [`tower_${t.kind}`, `tower_${t.kind}2`]),
    "enemy_walker_1", "enemy_walker_2", "enemy_runner_1", "enemy_runner_2",
    "enemy_tank_1", "enemy_tank_2", "enemy_swarm", "enemy_healer_1", "enemy_healer_2",
    "enemy_boss_1", "enemy_boss_2",
    "proj_mortar", "proj_frost", "proj_chain", "proj_spike", "fx_hit", "fx_explode",
  ];
  void Promise.all(names.map((name) => new Promise<[string, HTMLImageElement]>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve([name, img]);
    img.onerror = () => reject(new Error(name));
    img.src = `${ROOT}/16/${name}.png`;
  }))).then((pairs) => {
    sprites = new Map(pairs);
  }).catch(() => toast("Не удалось загрузить рисунки"));

  raf = requestAnimationFrame(loop);

  const api = {
    get screen() { return screen; },
    get meta() { return meta; },
    get run() { return run; },
    start: startNight,
    fast(sec: number) {
      if (!run) startNight();
      if (!run) return;
      const steps = Math.round(sec / 0.05);
      for (let i = 0; i < steps && run && !run.defeated; i++) stepRun(run, meta, 0.05);
    },
    place: (x: number, y: number, kind: TowerKind) => run ? placeTower(run, meta, x, y, kind) : { ok: false, reason: "нет ночи" },
    select: (id: number) => { selectedId = id; cardSig = ""; screen = "play"; shopOpen = false; syncScreen(); },
    gold: (n: number) => { if (run) run.gold += n; },
    spawn: (kind: EnemyKind, progress: number) => run ? spawnEnemy(run, kind, progress) : null,
    openDawn: () => { if (!run) return; run.dawnReady = true; run.cleared = Math.max(run.cleared, 30); screen = "dawn"; paintDawn(); syncScreen(); },
    shop: openShop,
  };
  Object.defineProperty(window, "__ew", { configurable: true, value: api });

  return () => {
    alive = false;
    cancelAnimationFrame(raf);
    ro.disconnect();
    window.removeEventListener("keydown", onKey);
    window.removeEventListener("resize", onResize);
    window.removeEventListener("orientationchange", onResize);
    window.visualViewport?.removeEventListener("resize", onResize);
    save(true);
  };
}

const w = window as Window & { __ewBoot?: boolean; __ewStop?: () => void };
w.__ewStop?.();
w.__ewStop = mount();
if (!w.__ewBoot) {
  w.__ewBoot = true;
  document.addEventListener("astro:before-swap", () => {
    w.__ewStop?.();
    w.__ewStop = undefined;
  });
}
