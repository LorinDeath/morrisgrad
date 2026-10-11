"""Мини-движок пиксель-арта для спрайтов «Проклятых» (герои, Отголоски, NPC).

Фигуры рисуются «материалами» — 4-тоновыми рампами (тень / база / свет / блик) в аниме-стиле:
тени уходят в холодный фиолетовый, свет — в тёплый. Каждая фигура сама считает cel-тон по своей
псевдо-нормали (свет сверху-слева), по нижне-правому краю фигуры — «ободок» тени (rim), снаружи —
тёмный 1px-контур (selective: цвет контура — затемнённый цвет соседнего пикселя, у земли — почти чёрный).
Пиксели «свечения» (glow) не получают контура и не затеняются.
"""
import math
from PIL import Image

OUT_DARK = (22, 12, 30)

def hexc(h, a=255):
    h = h.lstrip('#'); return (int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16), a)

def mix(a, b, t):
    return tuple(int(round(a[i] + (b[i] - a[i]) * t)) for i in range(3))

def ramp(base, shadow_hue=(54, 34, 92), warm=(255, 236, 200)):
    """4 тона: тень (холодная), база, свет (тёплый), блик."""
    b = hexc(base)[:3] if isinstance(base, str) else tuple(base[:3])
    sh = mix(tuple(int(v * 0.6) for v in b), shadow_hue, 0.28)
    deep = mix(tuple(int(v * 0.4) for v in b), shadow_hue, 0.35)
    li = mix(b, warm, 0.28)
    hi = mix(b, (255, 255, 255), 0.62)
    return [deep, sh, b, li, hi]   # 0 глубокая тень, 1 тень, 2 база, 3 свет, 4 блик

class Mat:
    def __init__(self, base, rim=True, flat=False, glow=False, shadow_hue=(54, 34, 92)):
        self.r = ramp(base, shadow_hue)
        self.rim = rim; self.flat = flat; self.glow = glow

class Sprite:
    def __init__(self, w, h):
        self.w, self.h = w, h
        self.col = {}      # (x,y) → (r,g,b,a)
        self.glowpx = set()
        self.sid = {}      # (x,y) → id фигуры (для ободков)
        self.n = 0

    # --- базовые растровые формы (множества пикселей) ---
    @staticmethod
    def ellipse_px(cx, cy, rx, ry):
        out = []
        for y in range(int(math.floor(cy - ry)) - 1, int(math.ceil(cy + ry)) + 2):
            for x in range(int(math.floor(cx - rx)) - 1, int(math.ceil(cx + rx)) + 2):
                if rx > 0 and ry > 0 and ((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2 <= 1.0: out.append((x, y))
        return out

    @staticmethod
    def poly_px(pts):
        ys = [p[1] for p in pts]; out = []
        for y in range(int(math.floor(min(ys))), int(math.ceil(max(ys))) + 1):
            xs = []
            for i in range(len(pts)):
                (x0, y0), (x1, y1) = pts[i], pts[(i + 1) % len(pts)]
                yc = y + 0.5
                if (y0 <= yc < y1) or (y1 <= yc < y0): xs.append(x0 + (yc - y0) / (y1 - y0) * (x1 - x0))
            xs.sort()
            for i in range(0, len(xs) - 1, 2):
                for x in range(int(math.ceil(xs[i] - 0.5)), int(math.floor(xs[i + 1] - 0.5)) + 1): out.append((x, y))
        return out

    @staticmethod
    def limb_px(x0, y0, x1, y1, r0, r1=None):
        r1 = r0 if r1 is None else r1
        out = set()
        L = math.hypot(x1 - x0, y1 - y0); n = max(1, int(L * 2))
        for i in range(n + 1):
            t = i / n; r = r0 + (r1 - r0) * t
            cx, cy = x0 + (x1 - x0) * t, y0 + (y1 - y0) * t
            for p in Sprite.ellipse_px(cx, cy, r, r): out.add(p)
        return list(out)

    # --- закраска фигуры материалом ---
    def fill(self, pts, mat, mode='box', light=(-0.6, -0.8), bias=0.0, tone=None):
        if not pts: return
        self.n += 1; sid = self.n
        S = set(p for p in pts if 0 <= p[0] < self.w and 0 <= p[1] < self.h)
        if not S: return
        xs = [p[0] for p in S]; ys = [p[1] for p in S]
        x0, x1, y0, y1 = min(xs), max(xs), min(ys), max(ys)
        cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
        rx, ry = max(1, (x1 - x0) / 2 + 0.5), max(1, (y1 - y0) / 2 + 0.5)
        for (x, y) in S:
            if mat.glow:
                self.col[(x, y)] = mat.r[3] + (255,); self.glowpx.add((x, y)); self.sid[(x, y)] = sid; continue
            self.glowpx.discard((x, y))
            if tone is not None: t = tone
            elif mat.flat: t = 2
            else:
                nx, ny = (x - cx) / rx, (y - cy) / ry
                v = nx * light[0] + ny * light[1] + bias
                t = 3 if v > 0.55 else (1 if v < -0.45 else 2)
                if mode == 'round' and v > 0.95 and (nx * nx + ny * ny) < 0.6: t = 4
            self.col[(x, y)] = mat.r[t] + (255,)
            self.sid[(x, y)] = sid
        if mat.rim and not mat.glow and tone is None:
            for (x, y) in S:
                if (x + 1, y) not in S or (x, y + 1) not in S:
                    if (x, y - 1) in S and (x - 1, y) in S:
                        self.col[(x, y)] = mat.r[1] + (255,)
        return S

    def ellipse(self, cx, cy, rx, ry, mat, **k): return self.fill(self.ellipse_px(cx, cy, rx, ry), mat, mode=k.pop('mode', 'round'), **k)
    def poly(self, pts, mat, **k): return self.fill(self.poly_px(pts), mat, **k)
    def limb(self, x0, y0, x1, y1, r0, mat, r1=None, **k): return self.fill(self.limb_px(x0, y0, x1, y1, r0, r1), mat, **k)
    def rect(self, x0, y0, x1, y1, mat, **k):
        return self.fill([(x, y) for y in range(int(y0), int(y1) + 1) for x in range(int(x0), int(x1) + 1)], mat, **k)

    def px(self, x, y, c, glow=False):
        x, y = int(math.floor(x + 0.5)), int(math.floor(y + 0.5))
        if 0 <= x < self.w and 0 <= y < self.h:
            self.col[(x, y)] = c[:3] + (c[3] if len(c) > 3 else 255,)
            if glow: self.glowpx.add((x, y))
            else: self.glowpx.discard((x, y))

    def line(self, x0, y0, x1, y1, c, glow=False):
        n = int(max(abs(x1 - x0), abs(y1 - y0))) + 1
        for i in range(n + 1):
            t = i / n; self.px(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, c, glow)

    def erase(self, pts):
        for p in pts:
            self.col.pop(p, None); self.glowpx.discard(p)

    # --- аниме-глаз: ресницы, радужка 2 тона, блик ---
    def eye(self, x, y, iris, side=1, closed=False, lash=(26, 16, 36)):
        """x,y — верхний левый пиксель глаза 2×3."""
        ir = ramp(iris)
        if closed:
            self.px(x, y + 1, lash + (255,)); self.px(x + 1, y + 1, lash + (255,)); return
        self.px(x - (1 if side < 0 else 0), y, lash + (255,)); self.px(x + 1 + (1 if side > 0 else 0), y, lash + (255,))
        self.px(x, y, lash + (255,)); self.px(x + 1, y, lash + (255,))
        self.px(x, y + 1, ir[3] + (255,)); self.px(x + 1, y + 1, ir[1] + (255,))
        self.px(x, y + 2, ir[2] + (255,)); self.px(x + 1, y + 2, ir[0] + (255,))
        self.px(x + (0 if side > 0 else 1), y + 1, (255, 255, 255, 255))

    def render(self, outline=True):
        im = Image.new('RGBA', (self.w, self.h), (0, 0, 0, 0)); p = im.load()
        for (x, y), c in self.col.items(): p[x, y] = c
        if outline:
            out = {}
            for y in range(self.h):
                for x in range(self.w):
                    if (x, y) in self.col: continue
                    nb = None
                    for dx, dy in ((0, 1), (1, 0), (-1, 0), (0, -1)):
                        q = (x + dx, y + dy)
                        if q in self.col and q not in self.glowpx: nb = self.col[q]; break
                    if nb: out[(x, y)] = mix(nb, OUT_DARK, 0.82) + (255,)
            for (x, y), c in out.items(): p[x, y] = c
        return im

def mirror(im):
    return im.transpose(Image.FLIP_LEFT_RIGHT)
