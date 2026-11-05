// Боевые шахматы — нарезка чиби-атласов (sheet.png + sheet.json) на отдельные кадры.
// Каждый кадр режется в свой offscreen-canvas ровно по rect из sheet.json, поэтому
// в клетку физически не может попасть весь атлас. Обводка и командное свечение
// запекаются один раз — на каждом кадре рендера только drawImage готового кадра.
export type Rect = [number, number, number, number];
export type Dir = "down" | "left" | "right" | "up";
export type Anim = { rects: Rect[]; fps: number; loop: boolean; anchor: [number, number]; impact?: number; kind?: string };
export type Frame = { c: HTMLCanvasElement; white: HTMLCanvasElement | null; pad: number; w: number; h: number };

const PAD = 3;

export type SheetSet = {
  im: HTMLImageElement;
  j: any;
  side: "w" | "b";
  frames: Map<string, Frame>;
};

/** Достаёт rects анимации. Источник правды — animations.*; rows — запасной путь. */
export function anim(s: SheetSet, name: string, d: Dir | "any" = "down"): Anim | null {
  const A = s.j.animations || {};
  let a = A[name];
  if (!a && name === "attack") a = A.attack_melee || A.attack_ranged;
  if (a) {
    const anchor: [number, number] = a.anchor || a.center || s.j.anchor || [32, 60];
    let rects: Rect[] | undefined = a.rects;
    let dAnchor = anchor;
    if (!rects && a.directions && typeof a.directions === "object") {
      const dd = a.directions[d] || a.directions.down || Object.values(a.directions)[0];
      rects = dd?.rects; if (dd?.anchor) dAnchor = dd.anchor;
    }
    if (rects?.length) return { rects, fps: a.fps || 8, loop: !!a.loop, anchor: dAnchor, impact: a.impact, kind: a.kind };
  }
  // fallback по rows (idle/attack/hit)
  const row = (s.j.rows || []).find((r: any) => r.anim === name && (r.dir === d || r.dir === "any"));
  if (!row) return null;
  const [w, h] = row.cell;
  return {
    rects: Array.from({ length: row.frames }, (_, i) => [i * w, row.y, w, h] as Rect),
    fps: 8, loop: name === "idle", anchor: s.j.anchor || [32, 60],
  };
}

function bake(s: SheetSet, r: Rect, outline: boolean): Frame {
  const [sx, sy, w, h] = r;
  const pad = outline ? PAD : 0;
  // 1) чистый кадр
  const raw = document.createElement("canvas"); raw.width = w; raw.height = h;
  const rg = raw.getContext("2d")!; rg.imageSmoothingEnabled = false;
  rg.drawImage(s.im, sx, sy, w, h, 0, 0, w, h);
  if (!outline) return { c: raw, white: null, pad: 0, w, h };
  // 2) силуэты: тёмная обводка + командный ореол
  const sil = (color: string) => {
    const c = document.createElement("canvas"); c.width = w; c.height = h;
    const g = c.getContext("2d")!; g.drawImage(raw, 0, 0);
    g.globalCompositeOperation = "source-in"; g.fillStyle = color; g.fillRect(0, 0, w, h);
    return c;
  };
  const dark = sil("#0b0810");
  const team = sil(s.side === "w" ? "#fff1c8" : "#ff4a5a");
  const out = document.createElement("canvas"); out.width = w + pad * 2; out.height = h + pad * 2;
  const og = out.getContext("2d")!; og.imageSmoothingEnabled = false;
  // ореол (2px, полупрозрачный)
  og.globalAlpha = s.side === "w" ? 0.55 : 0.6;
  for (const [dx, dy] of [[-2, 0], [2, 0], [0, -2], [0, 2], [-1, -1], [1, -1], [-1, 1], [1, 1], [-2, -1], [2, -1], [-2, 1], [2, 1]]) og.drawImage(team, pad + dx, pad + dy);
  og.globalAlpha = 1;
  // чёткая 1px обводка
  for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) og.drawImage(dark, pad + dx, pad + dy);
  og.drawImage(raw, pad, pad);
  // белая версия для вспышки при попадании
  const white = document.createElement("canvas"); white.width = out.width; white.height = out.height;
  const wg = white.getContext("2d")!; wg.drawImage(out, 0, 0);
  wg.globalCompositeOperation = "source-in"; wg.fillStyle = "#ffffff"; wg.fillRect(0, 0, white.width, white.height);
  return { c: out, white, pad, w, h };
}

export function frame(s: SheetSet, r: Rect, outline = true): Frame {
  const k = r.join(",") + (outline ? "o" : "r");
  let f = s.frames.get(k);
  if (!f) { f = bake(s, r, outline); s.frames.set(k, f); }
  return f;
}

/** Кадр анимации по времени (ms с начала). loop=false — держит последний кадр, null если закончилась. */
export function frameAt(a: Anim, ms: number, fpsMul = 1): Rect | null {
  const i = Math.floor((ms / 1000) * a.fps * fpsMul);
  if (a.loop) return a.rects[((i % a.rects.length) + a.rects.length) % a.rects.length];
  if (i >= a.rects.length) return null;
  return a.rects[Math.max(0, i)];
}

export function dirTo(dx: number, dy: number, fallback: Dir): Dir {
  if (!dx && !dy) return fallback;
  if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? "right" : "left";
  return dy > 0 ? "down" : "up";
}
