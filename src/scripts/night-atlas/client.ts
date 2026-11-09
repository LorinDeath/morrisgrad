// Клиент «Ночного атласа»: канвас с целым масштабом, клавиатура и кнопки.
import {
  CANVAS_SPRITES,
  HERO_ANCHOR_X,
  TILE,
  WONDERS,
  bushDrawY,
  createHero,
  fitCanvas,
  groundTopOf,
  heroDrawY,
  heroFrame,
  itemPoint,
  makeWorld,
  overlaps,
  propDrawY,
  screenFeet,
  starVisible,
  stepBody,
  wonder,
  type Body,
  type HeroFrame,
  type NightWorld,
  type WonderId,
} from "./logic";

const SPRITE_ROOT = "/games/night-atlas/sprites";

type Mode = "title" | "play" | "win";

function loadImages(size: 16 | 32, names: readonly string[]): Promise<Map<string, HTMLImageElement>> {
  return Promise.all(
    names.map(
      (name) =>
        new Promise<[string, HTMLImageElement]>((resolve, reject) => {
          const img = new Image();
          img.decoding = "async";
          img.onload = () => resolve([name, img]);
          img.onerror = () => reject(new Error(name));
          img.src = `${SPRITE_ROOT}/${size}/${name}.png`;
        }),
    ),
  ).then((pairs) => new Map(pairs));
}

function mount(): () => void {
  const canvas = document.getElementById("na-canvas") as HTMLCanvasElement | null;
  const stage = document.getElementById("na-stage");
  const frame = document.getElementById("na-frame");
  const countEl = document.getElementById("na-count");
  const tray = document.getElementById("na-tray");
  const titleEl = document.getElementById("na-title");
  const winEl = document.getElementById("na-win");
  const toastEl = document.getElementById("na-toast");
  const startBtn = document.getElementById("na-start") as HTMLButtonElement | null;
  const againBtn = document.getElementById("na-again") as HTMLButtonElement | null;
  const leftBtn = document.getElementById("na-left");
  const rightBtn = document.getElementById("na-right");
  const jumpBtn = document.getElementById("na-jump");
  if (!canvas || !stage || !frame || !countEl || !tray || !titleEl || !winEl || !toastEl || !startBtn || !againBtn || !leftBtn || !rightBtn || !jumpBtn) {
    return () => {};
  }
  const ctx = canvas.getContext("2d");
  if (!ctx) return () => {};

  const slots = new Map<WonderId, HTMLElement>();
  tray.replaceChildren();
  for (const w of WONDERS) {
    const slot = document.createElement("div");
    slot.className = "slot";
    slot.title = w.name;
    slot.dataset.id = w.id;
    const img = document.createElement("img");
    img.src = `${SPRITE_ROOT}/32/${w.id}.png`;
    img.width = 32;
    img.height = 32;
    img.alt = w.name;
    slot.append(img);
    tray.append(slot);
    slots.set(w.id, slot);
  }

  let sprites = new Map<string, HTMLImageElement>();
  let logicalW = 320;
  let logicalH = 160;
  let scaleS = 1;
  let world: NightWorld = makeWorld(logicalW, Math.random);
  let hero: Body = createHero();
  let mode: Mode = "title";
  let time = 0;
  let anim = 0;
  let cam = 0;
  const got = new Set<WonderId>();
  const keys = new Set<string>();
  let padLeft = false;
  let padRight = false;
  let padJump = false;
  let jumpWas = false;
  let last = performance.now();
  let raf = 0;
  let alive = true;
  let winTimer = 0;
  let toastTimer = 0;
  let audioCtx: AudioContext | null = null;
  let worldReady = false;

  const paintCount = () => {
    countEl.textContent = `Атлас ${got.size}/12`;
  };

  const toast = (text: string) => {
    toastEl.textContent = text;
    toastEl.hidden = false;
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => {
      toastEl.hidden = true;
    }, 1100);
  };

  const unlockAudio = () => {
    const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    if (!audioCtx) audioCtx = new Ctor();
    if (audioCtx.state === "suspended") void audioCtx.resume();
  };

  const tone = (freqs: number[], dur: number) => {
    if (!audioCtx) return;
    const t0 = audioCtx.currentTime;
    freqs.forEach((freq, i) => {
      const o = audioCtx!.createOscillator();
      const g = audioCtx!.createGain();
      o.type = "sine";
      o.frequency.value = freq;
      const start = t0 + i * 0.045;
      g.gain.setValueAtTime(0.0001, start);
      g.gain.exponentialRampToValueAtTime(0.045, start + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
      o.connect(g);
      g.connect(audioCtx!.destination);
      o.start(start);
      o.stop(start + dur + 0.02);
    });
  };

  const markSlot = (id: WonderId) => {
    slots.get(id)?.classList.add("on");
  };

  const fly = (id: WonderId, fromX: number, fromAbove: number) => {
    const slot = slots.get(id);
    if (!slot) return;
    const frameBox = frame.getBoundingClientRect();
    const canvasBox = canvas.getBoundingClientRect();
    const slotBox = slot.getBoundingClientRect();
    const css = canvasBox.width / logicalW;
    const ax = canvasBox.left - frameBox.left + (fromX - cam) * css;
    const ay = canvasBox.top - frameBox.top + (groundTopOf(logicalH) - fromAbove) * css;
    const bx = slotBox.left - frameBox.left + slotBox.width / 2;
    const by = slotBox.top - frameBox.top + slotBox.height / 2;
    const img = document.createElement("img");
    img.className = "fly";
    img.alt = "";
    img.src = `${SPRITE_ROOT}/32/${id}.png`;
    frame.append(img);
    const animFly = img.animate(
      [
        { left: `${ax}px`, top: `${ay}px`, transform: "translate(-50%, -50%) scale(1)" },
        { left: `${bx}px`, top: `${by}px`, transform: "translate(-50%, -50%) scale(0.72)" },
      ],
      { duration: 440, easing: "cubic-bezier(.2,.75,.2,1)", fill: "forwards" },
    );
    let landed = false;
    const done = () => {
      if (landed) return;
      landed = true;
      img.remove();
      markSlot(id);
    };
    animFly.onfinish = done;
    window.setTimeout(done, 700);
  };

  const showWin = () => {
    if (mode !== "play" || got.size < 12) return;
    mode = "win";
    winEl.hidden = false;
    toastEl.hidden = true;
    tone([523.25, 659.25, 783.99], 0.38);
  };

  const resetRun = (nextMode: Mode) => {
    window.clearTimeout(winTimer);
    got.clear();
    world = makeWorld(logicalW, Math.random);
    hero = createHero();
    time = 0;
    anim = 0;
    mode = nextMode;
    paintCount();
    toastEl.hidden = true;
    for (const el of slots.values()) el.classList.remove("on");
    titleEl.hidden = nextMode !== "title";
    winEl.hidden = true;
    worldReady = true;
  };

  const begin = () => {
    if (mode !== "title") return;
    unlockAudio();
    mode = "play";
    titleEl.hidden = true;
    startBtn.blur();
  };

  const replay = () => {
    unlockAudio();
    resetRun("play");
    againBtn.blur();
  };

  const resize = () => {
    const box = stage.getBoundingClientRect();
    if (box.width < 40 || box.height < 40) return;
    const dpr = window.devicePixelRatio || 1;
    const fit = fitCanvas(box.width, box.height, dpr);
    logicalW = fit.logicalW;
    logicalH = fit.logicalH;
    scaleS = fit.S;
    canvas.width = logicalW * scaleS;
    canvas.height = logicalH * scaleS;
    const cssW = (logicalW * scaleS) / dpr;
    const cssH = (logicalH * scaleS) / dpr;
    canvas.style.width = `${cssW}px`;
    canvas.style.height = `${cssH}px`;
    canvas.style.left = `${Math.round((box.width - cssW) / 2)}px`;
    canvas.style.top = `${Math.round((box.height - cssH) / 2)}px`;
    if (!worldReady) resetRun("title");
  };

  const input = () => {
    if (mode !== "play") return { left: false, right: false, jumpHeld: false, jumpPressed: false };
    const left = padLeft || keys.has("ArrowLeft") || keys.has("KeyA");
    const right = padRight || keys.has("ArrowRight") || keys.has("KeyD");
    const jumpNow = padJump || keys.has("ArrowUp") || keys.has("KeyW") || keys.has("Space");
    const jumpPressed = jumpNow && !jumpWas;
    jumpWas = jumpNow;
    return { left, right: left ? false : right, jumpHeld: jumpNow, jumpPressed };
  };

  const drawSprite = (name: string, dx: number, dy: number) => {
    const img = sprites.get(name);
    if (!img) return;
    ctx.drawImage(img, dx, dy);
  };

  const draw = () => {
    const groundTop = groundTopOf(logicalH);
    ctx.setTransform(scaleS, 0, 0, scaleS, 0, 0);
    ctx.imageSmoothingEnabled = false;
    const smooth = ctx as CanvasRenderingContext2D & { webkitImageSmoothingEnabled?: boolean };
    smooth.webkitImageSmoothingEnabled = false;
    ctx.clearRect(0, 0, logicalW, logicalH);

    const sky = sprites.get("tile_sky");
    const ground = sprites.get("tile_ground");
    const ox = -((cam % TILE) + TILE) % TILE;
    if (sky) {
      for (let y = 0; y < groundTop; y += TILE) {
        for (let x = ox - TILE; x < logicalW + TILE; x += TILE) ctx.drawImage(sky, x, y);
      }
    } else {
      ctx.fillStyle = "#141236";
      ctx.fillRect(0, 0, logicalW, groundTop);
    }

    const star = sprites.get("tile_star");
    if (star) {
      for (const s of world.stars) {
        if (!starVisible(time, s.phase)) continue;
        const sx = Math.round(s.x - cam) - HERO_ANCHOR_X;
        const sy = groundTop - s.above - HERO_ANCHOR_X;
        if (sx < -TILE || sx > logicalW || sy < -TILE || sy > groundTop) continue;
        ctx.drawImage(star, sx, sy);
      }
    }

    if (ground) {
      for (let x = ox - TILE; x < logicalW + TILE; x += TILE) ctx.drawImage(ground, x, groundTop);
    }

    const bush = sprites.get("tile_bush");
    if (bush) {
      const dy = bushDrawY(groundTop);
      for (const b of world.bushes) {
        const sx = Math.round(b.x - cam) - HERO_ANCHOR_X;
        if (sx < -TILE || sx > logicalW) continue;
        ctx.drawImage(bush, sx, dy);
      }
    }

    for (const spot of world.spots) {
      if (got.has(spot.id)) continue;
      const spec = wonder(spot.id);
      const p = itemPoint(spot, time);
      const sx = Math.round(p.x - cam) - HERO_ANCHOR_X;
      if (sx < -TILE || sx > logicalW) continue;
      const contact = groundTop - p.above;
      drawSprite(spot.id, sx, propDrawY(contact, spec.bottom));
    }

    const feet = screenFeet(groundTop, hero.rise);
    const frameName: HeroFrame = heroFrame(hero.ground, hero.vx, anim);
    const sx = Math.round(hero.x - cam);
    const dy = heroDrawY(feet);
    const img = sprites.get(frameName);
    if (img) {
      ctx.save();
      ctx.translate(sx, 0);
      ctx.scale(hero.facing, 1);
      ctx.imageSmoothingEnabled = false;
      smooth.webkitImageSmoothingEnabled = false;
      ctx.drawImage(img, -HERO_ANCHOR_X, dy);
      ctx.restore();
    }
  };

  const loop = (now: number) => {
    if (!alive) return;
    if (document.hidden) return;
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (sprites.size) {
      time += dt;
      if (mode === "play") {
        const prevGround = hero.ground;
        stepBody(hero, input(), dt, world.worldW);
        if (hero.ground && Math.abs(hero.vx) >= 8) anim += dt;
        else if (hero.ground) anim = 0;
        if (!prevGround && hero.ground) anim = 0;
        for (const spot of world.spots) {
          if (got.has(spot.id)) continue;
          if (!overlaps(hero, spot, time)) continue;
          got.add(spot.id);
          paintCount();
          toast(wonder(spot.id).name);
          tone([587.33, 880], 0.28);
          const p = itemPoint(spot, time);
          fly(spot.id, p.x, p.above + 8);
          if (got.size === 12) {
            window.clearTimeout(winTimer);
            winTimer = window.setTimeout(showWin, 680);
          }
        }
      } else {
        jumpWas = padJump || keys.has("Space") || keys.has("ArrowUp") || keys.has("KeyW");
      }
      let next = Math.round(hero.x - logicalW * 0.36);
      if (next < 0) next = 0;
      const maxCam = Math.max(0, world.worldW - logicalW);
      if (next > maxCam) next = maxCam;
      cam = next;
      draw();
    }
    raf = requestAnimationFrame(loop);
  };

  const onKeyDown = (e: KeyboardEvent) => {
    const code = e.code;
    if (code === "ArrowUp" || code === "ArrowDown" || code === "ArrowLeft" || code === "ArrowRight" || code === "Space") e.preventDefault();
    if (e.repeat) return;
    if (mode === "title" && (code === "Enter" || code === "Space")) {
      begin();
      return;
    }
    if (mode === "win" && code === "Enter") {
      replay();
      return;
    }
    if (mode !== "play") return;
    keys.add(code);
  };
  const onKeyUp = (e: KeyboardEvent) => {
    keys.delete(e.code);
  };
  const onBlur = () => {
    keys.clear();
    padLeft = padRight = padJump = false;
  };
  const onVis = () => {
    last = performance.now();
    if (!alive) return;
    if (document.hidden) cancelAnimationFrame(raf);
    else raf = requestAnimationFrame(loop);
  };
  const blockScroll = (e: TouchEvent) => {
    e.preventDefault();
  };

  const hold = (el: HTMLElement, set: (v: boolean) => void, jump: boolean) => {
    const down = (e: PointerEvent) => {
      e.preventDefault();
      if (mode === "title") return;
      el.setPointerCapture(e.pointerId);
      set(true);
      if (jump) padJump = true;
    };
    const up = (e: PointerEvent) => {
      if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId);
      set(false);
    };
    el.addEventListener("pointerdown", down);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
    el.addEventListener("lostpointercapture", () => set(false));
    return () => {
      el.removeEventListener("pointerdown", down);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("pointercancel", up);
    };
  };

  const offLeft = hold(leftBtn, (v) => {
    padLeft = v;
  }, false);
  const offRight = hold(rightBtn, (v) => {
    padRight = v;
  }, false);
  const offJump = hold(jumpBtn, (v) => {
    padJump = v;
  }, true);

  startBtn.addEventListener("click", begin);
  againBtn.addEventListener("click", replay);
  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);
  window.addEventListener("blur", onBlur);
  document.addEventListener("visibilitychange", onVis);
  document.addEventListener("touchmove", blockScroll, { passive: false });
  const ro = new ResizeObserver(() => resize());
  ro.observe(stage);
  resize();
  paintCount();

  void loadImages(16, CANVAS_SPRITES)
    .then((map) => {
      if (!alive) return;
      sprites = map;
      if (!worldReady) resetRun("title");
    })
    .catch(() => {
      toastEl.textContent = "Не удалось загрузить рисунки";
      toastEl.hidden = false;
    });

  raf = requestAnimationFrame(loop);

  if (new URLSearchParams(location.search).has("debug")) {
    Object.defineProperty(window, "__na", {
      configurable: true,
      get: () => ({
        mode,
        time,
        cam,
        logicalW,
        logicalH,
        scaleS,
        worldW: world.worldW,
        hero: { x: hero.x, rise: hero.rise, vx: hero.vx, facing: hero.facing, ground: hero.ground },
        spots: world.spots.map((s) => ({ ...s, got: got.has(s.id) })),
        bushes: world.bushes,
        got: got.size,
      }),
    });
  }

  return () => {
    alive = false;
    cancelAnimationFrame(raf);
    window.clearTimeout(winTimer);
    window.clearTimeout(toastTimer);
    ro.disconnect();
    offLeft();
    offRight();
    offJump();
    startBtn.removeEventListener("click", begin);
    againBtn.removeEventListener("click", replay);
    window.removeEventListener("keydown", onKeyDown);
    window.removeEventListener("keyup", onKeyUp);
    window.removeEventListener("blur", onBlur);
    document.removeEventListener("visibilitychange", onVis);
    document.removeEventListener("touchmove", blockScroll);
    audioCtx?.close().catch(() => {});
  };
}

const w = window as Window & { __naBoot?: boolean; __naStop?: () => void };
w.__naStop?.();
w.__naStop = mount();
if (!w.__naBoot) {
  w.__naBoot = true;
  document.addEventListener("astro:before-swap", () => {
    w.__naStop?.();
    w.__naStop = undefined;
  });
}
