"""Атлас всех Отголосков бестиария (68 мобов) в едином пиксельном стиле «Проклятых».
Масштаб общий для мира: 10 px арта = 1 м, ячейка 48×48 (= 4.8 м); мелкие мобы ~14–20 px, крупные ~30,
огромные/боссы ~40–46 px — поэтому один и тот же размер билборда даёт честные пропорции.
Строка = моб (порядок MOBS_PUBLIC из server/meta/generated/public.ts), 12 колонок:
  0–3 ход/полёт, 4–6 атака (замах → удар → возврат), 7 урон (вспышка), 8–11 распад.
Семейство и палитра — из бестиария (art.fam / art.pal), базовый цвет — mob.color.
Выход: src/assets/mc/bestiary_atlas.png + bestiary_atlas.json {cell, cols, rows: [ids], flying: {id: м}, body: [[низ, верх] px]}.
"""
import os, re, json, math, random
from PIL import Image
from pixkit import Sprite, Mat, hexc, mix, ramp

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
OUT = os.path.join(ROOT, 'src', 'assets', 'mc', 'bestiary_atlas.png')
PREV = '/workspace/morrisgrad-round2/sprites'
C, COLS, G = 48, 12, 46      # координаты рисования семейств (старая сетка 48, земля y=46, центр x=24)
CO, GO, XO = 64, 62, 32        # реальная ячейка атласа v2: 64×64, земля y=62, центр x=32

class XSprite(Sprite):
    """Холст v2: семейства рисуют в старых координатах 48-сетки, а растеризация идёт в 64-ячейке с масштабом k —
    больше пикселей на тело (детальнее кластеры), тот же код поз/анимации."""
    def __init__(self, k):
        super().__init__(CO, CO, v2=True); self.k = k
    def T(self, x, y): return (XO + (x - 24) * self.k, GO - (G - y) * self.k)
    def ellipse(self, cx, cy, rx, ry, mat, **kw):
        X, Y = self.T(cx, cy); return super().ellipse(X, Y, rx * self.k, ry * self.k, mat, **kw)
    def poly(self, pts, mat, **kw): return super().poly([self.T(x, y) for x, y in pts], mat, **kw)
    def limb(self, x0, y0, x1, y1, r0, mat, r1=None, **kw):
        a, b = self.T(x0, y0); c, d = self.T(x1, y1)
        return super().limb(a, b, c, d, r0 * self.k, mat, r1=None if r1 is None else r1 * self.k, **kw)
    def rect(self, x0, y0, x1, y1, mat, **kw):
        a, b = self.T(x0, y0); c, d = self.T(x1 + 1, y1 + 1)
        return self.fill([(x, y) for y in range(int(round(b)), int(round(d))) for x in range(int(round(a)), int(round(c)))], mat, **kw)
    def px(self, x, y, c, glow=False):
        X, Y = self.T(x, y); super().px(X, Y, c, glow)
    def rpx(self, x, y, c, glow=False): super().px(x, y, c, glow)
    def line(self, x0, y0, x1, y1, c, glow=False):
        a, b = self.T(x0, y0); e, f = self.T(x1, y1)
        n = int(max(abs(e - a), abs(f - b))) + 1
        for i in range(n + 1):
            t = i / n; super().px(a + (e - a) * t, b + (f - b) * t, c, glow)
    def erase(self, pts):
        out = []
        for (x, y) in pts:
            a, b = self.T(x, y); c, d = self.T(x + 1, y + 1)
            out += [(u, v) for v in range(int(round(b)), int(round(d))) for u in range(int(round(a)), int(round(c)))]
        super().erase(out)

src = open(os.path.join(ROOT, 'server', 'meta', 'generated', 'public.ts'), encoding='utf8').read()
MOBS = json.loads(re.search(r'MOBS_PUBLIC: Record<string, MobPublic> = (\{.*\});', src).group(1))

ACC = {  # акцент/свечение по палитре
    'dew': '#e0f2fe', 'gold': '#fff7c2', 'night': '#c084fc', 'teal': '#99f6e4', 'frost': '#e0f2fe', 'glitch': '#4ade80', 'grass': '#bef264',
    'lilac': '#f5d0fe', 'violet': '#e9d5ff', 'pome': '#fda4af', 'root': '#a3e635', 'star': '#fef9c3', 'fox': '#fff7ed', 'thorn': '#f472b6',
    'shard': '#a5f3fc', 'clay': '#fdba74', 'moon': '#e0e7ff', 'void': '#c4b5fd', 'lantern': '#fde68a', 'white': '#ffffff', 'mine': '#fcd34d',
    'ember': '#fb923c', 'ore': '#bef264', 'grave': '#a3e635', 'acid': '#d9f99d', 'rot': '#84cc16', 'bone': '#fef3c7', 'crystal': '#a5f3fc',
    'harpy': '#fde68a', 'rust': '#fdba74', 'warden': '#fde68a', 'copper': '#fdba74', 'fan': '#e0f2fe', 'cable': '#fca5a5', 'pixel': '#86efac',
    'heat': '#fdba74', 'silver': '#f1f5f9', 'dusk': '#c4b5fd', 'silence': '#e2e8f0', 'spark': '#fef08a', 'steel': '#bae6fd', 'crater': '#d6d3d1',
    'thin': '#e9d5ff', 'echo': '#a5b4fc', 'choir': '#f5f3ff', 'stone': '#e7e5e4',
}
FLY = {'wisp', 'bat', 'fly', 'moth', 'pixie', 'jelly', 'ghost', 'eye', 'fly_boss', 'choir', 'star_l', 'shade', 'harpy'}

def darker(h, k=0.6):
    c = hexc(h); return '#%02x%02x%02x' % tuple(int(v * k) for v in c[:3])

def eyes(s, x, y, gap, col='#1a1030', glow=None, size=1):
    """v2: аниме-глаза в реальных пикселях — ресница, радужка 2 тона, белый блик; светящиеся — ядро + ореол."""
    k = getattr(s, 'k', 1)
    X, Y = s.T(x, y) if hasattr(s, 'T') else (x, y)
    g = max(3 if glow else 4, gap * k)
    big = size > 1 or (k >= 1.3 and gap * k >= 4.5)
    for i, dx in enumerate((-g / 2, g / 2)):
        ex, ey = int(round(X + dx - (1 if big else 0.5))), int(round(Y))
        if glow:
            gc = hexc(glow)
            for (u, v) in ((0, 0), (1, 0), (0, 1), (1, 1)) if big else ((0, 0), (0, 1)):
                s.rpx(ex + u, ey + v, gc, glow=True)
            s.rpx(ex, ey, (255, 255, 255, 255), glow=True)
        else:
            lash = hexc(col)
            iris = s.eye_iris
            s.rpx(ex, ey, lash); s.rpx(ex + 1, ey, lash)
            if i == 1: s.rpx(ex + 2, ey - 1, lash)
            else: s.rpx(ex - 1, ey - 1, lash)
            s.rpx(ex, ey + 1, (255, 255, 255, 255)); s.rpx(ex + 1, ey + 1, iris[1] + (255,))
            s.rpx(ex, ey + 2, iris[2] + (255,)); s.rpx(ex + 1, ey + 2, iris[0] + (255,))
            if big: s.rpx(ex, ey + 3, iris[3] + (255,)); s.rpx(ex + 1, ey + 3, iris[1] + (255,))
            # румянец под внешним уголком глаза
            bx = ex - 1 if i == 0 else ex + 2
            if g >= 6: s.rpx(bx, ey + (4 if big else 3), (244, 140, 170, 255))
    if not glow and g >= 6:  # ротик
        mx, my = int(round(X)), int(round(Y)) + (4 if big else 3)
        s.rpx(mx - 1, my, hexc(col)); s.rpx(mx, my + 1, hexc(col)) if big else None

# ---------- семейства: f(s, M, A, ph) — M основной материал, A акцент, ph — фаза ----------
def slime(s, M, A, ph, big=False):
    k = 2 if big else 1
    sq = 1 + 0.12 * math.sin(ph['t'] * 6.283) - 0.15 * ph['atk']
    rx, ry = 8 * k * (2 - sq) / 1.0, 7 * k * sq
    cy = G - ry
    s.ellipse(24, cy, rx * 0.75, ry, M)
    s.ellipse(24 - rx * 0.25, cy - ry * 0.45, rx * 0.18, ry * 0.18, Mat(A, glow=True))
    eyes(s, 24 + ph['atk'] * 2, cy - 1, 5 * k, glow=None)
    if big:
        for i in range(5): s.poly([(16 + i * 4, cy - ry + 1), (18 + i * 4, cy - ry - 5 - (i % 2) * 2), (20 + i * 4, cy - ry + 1)], Mat('#facc15'))

def wisp(s, M, A, ph):
    y = 26 + math.sin(ph['t'] * 6.283) * 2 - ph['atk'] * 2
    s.poly([(20, y + 2), (28, y + 2), (24 + math.sin(ph['t'] * 12) * 3, y + 14)], Mat(darker(M.base, 0.9)))
    s.ellipse(24, y, 6 + ph['atk'], 6 + ph['atk'], Mat(M.base, glow=True))
    s.ellipse(23, y - 1, 3, 3, Mat(A, glow=True))
    eyes(s, 24, y, 4)

def bat(s, M, A, ph):
    y = 24 + math.sin(ph['t'] * 6.283) * 2
    f = math.sin(ph['t'] * 12.566)
    for sg in (-1, 1):
        s.poly([(24 + sg * 3, y), (24 + sg * 15, y - 6 + f * 5), (24 + sg * 12, y + 3), (24 + sg * 8, y + 1), (24 + sg * 5, y + 4)], Mat(darker(M.base, 0.8)))
    s.ellipse(24, y + 1, 4, 5, M)
    s.poly([(21, y - 3), (22, y - 8), (23, y - 3)], M); s.poly([(25, y - 3), (26, y - 8), (27, y - 3)], M)
    eyes(s, 24, y - 1, 3, glow=A)

def fly(s, M, A, ph, big=False):
    k = 2.2 if big else 1
    y = 26 - (6 if big else 0) + math.sin(ph['t'] * 6.283) * 2
    f = math.sin(ph['t'] * 25)
    for sg in (-1, 1):
        s.poly([(24 + sg * 2 * k, y - 2 * k), (24 + sg * 11 * k, y - (8 + f * 3) * k), (24 + sg * 9 * k, y - 1 * k)], Mat('#c7f9ff'))
        s.line(24 + sg * 3 * k, y + 3 * k, 24 + sg * 6 * k, y + 7 * k, hexc(darker(M.base, 0.5)))
    s.ellipse(24, y + 2 * k, 3.5 * k, 5 * k, M)
    s.ellipse(24, y - 3 * k, 3 * k, 2.8 * k, Mat(darker(M.base, 0.8)))
    eyes(s, 24, y - 4 * k, 3 * k, glow='#ef4444', size=1 + int(big))
    if big:
        s.poly([(18, y - 9 * k), (20, y - 14 * k), (22, y - 9 * k), (24, y - 15 * k), (26, y - 9 * k), (28, y - 14 * k), (30, y - 9 * k)], Mat('#facc15'))
    # клинки-лапки при атаке
    if ph['atk'] > 0.5: s.line(24, y + 4 * k, 24 + 9 * k, y + 2 * k, (226, 232, 240, 255))

def quad(s, M, A, ph, size=1.0, ears='fox', tail=True, antlers=False, head_low=False):
    k = size
    b = math.sin(ph['t'] * 12.566)
    by = G - 8 * k - abs(b) * 0.6
    lx = ph['atk'] * 3
    for i, ox in enumerate((-6, -3, 4, 7)):
        sw = b * 2 * (1 if i % 2 else -1)
        s.limb(24 + ox * k + sw * k, by + 2 * k, 24 + ox * k + sw * k * 1.4, G, 1.2 * k, Mat(darker(M.base, 0.75)))
    s.ellipse(24 + lx, by, 9 * k, 5 * k, M)
    hx, hy = 24 + 9 * k + lx * 1.5, by - (2 if head_low else 5) * k
    if tail: s.limb(24 - 8 * k, by - 1 * k, 24 - 13 * k, by - 6 * k + b * 2, 1.8 * k, M, r1=1.0 * k)
    s.ellipse(hx, hy, 4.2 * k, 3.6 * k, M)
    s.ellipse(hx + 3 * k, hy + 1 * k, 2 * k, 1.6 * k, Mat(A))
    if ears == 'fox':
        s.poly([(hx - 3 * k, hy - 2 * k), (hx - 2 * k, hy - 7 * k), (hx, hy - 3 * k)], M); s.poly([(hx, hy - 3 * k), (hx + 2 * k, hy - 7 * k), (hx + 2.5 * k, hy - 2 * k)], M)
    elif ears == 'hare':
        s.limb(hx - 1, hy - 3, hx - 3, hy - 12 * k, 1.2 * k, M); s.limb(hx + 1, hy - 3, hx + 1, hy - 12 * k, 1.2 * k, M)
    if antlers:
        for sg in (-1, 1):
            s.limb(hx + sg * 2, hy - 3 * k, hx + sg * 7 * k, hy - 13 * k, 0.9 * k, Mat(A)); s.limb(hx + sg * 5 * k, hy - 9 * k, hx + sg * 1, hy - 14 * k, 0.7 * k, Mat(A))
    s.px(hx + 1.5 * k, hy - 1 * k, (20, 12, 30, 255)); s.px(hx + 1.5 * k, hy - 1 * k + 1, hexc(A))

def biped(s, M, A, ph, h=18, horns=False, hunch=False, armor=None, weapon=None, hood=False, thin=False, big=1.0):
    k = big
    b = math.sin(ph['t'] * 12.566)
    hip = G - 6 * k
    lean = ph['atk'] * 3 * k + (3 if hunch else 0)
    for sg in (-1, 1):
        s.limb(24 + sg * 2.5 * k, hip, 24 + sg * 3 * k + b * sg * 2 * k, G, (1.0 if thin else 1.6) * k, Mat(darker(M.base, 0.7)))
    top = G - h * k
    body = Mat(armor) if armor else M
    s.poly([(24 - (3 if thin else 5) * k, hip + 1), (24 + (3 if thin else 5) * k, hip + 1), (24 + (2.5 if thin else 4) * k + lean, top + 6 * k), (24 - (2.5 if thin else 4) * k + lean, top + 6 * k)], body)
    hx, hy = 24 + lean * 1.2, top + 3 * k
    if hood:
        s.poly([(hx - 5 * k, hy + 4 * k), (hx + 5 * k, hy + 4 * k), (hx + 3 * k, hy - 5 * k), (hx, hy - 7 * k), (hx - 3 * k, hy - 5 * k)], Mat(darker(M.base, 0.7)))
        s.ellipse(hx, hy + 0.5 * k, 2.6 * k, 2.6 * k, Mat('#0b0712'))
        eyes(s, hx, hy, 2.4 * k, glow=A, size=max(1, int(k)))
    else:
        s.ellipse(hx, hy, 4 * k, 3.8 * k, M)
        eyes(s, hx + 0.5, hy, 3 * k, glow=A if armor else None, size=max(1, int(k)))
    if horns:
        s.poly([(hx - 3 * k, hy - 2 * k), (hx - 5 * k, hy - 7 * k), (hx - 1 * k, hy - 3 * k)], Mat(A)); s.poly([(hx + 3 * k, hy - 2 * k), (hx + 5 * k, hy - 7 * k), (hx + 1 * k, hy - 3 * k)], Mat(A))
    # руки
    ax = 24 + lean + 4 * k
    reach = ph['atk']
    s.limb(ax, top + 8 * k, ax + (3 + reach * 6) * k, top + (13 - reach * 4) * k + (6 if hunch else 0), 1.1 * k, Mat(darker(M.base, 0.85)))
    s.limb(24 + lean - 4 * k, top + 8 * k, 24 + lean - 6 * k, top + 15 * k, 1.1 * k, Mat(darker(M.base, 0.8)))
    if weapon == 'sword':
        ex, ey = ax + (3 + reach * 6) * k, top + (13 - reach * 4) * k
        s.line(ex, ey, ex + (2 + reach * 6) * k, ey - (8 - reach * 6) * k, (226, 232, 240, 255)); s.line(ex + 1, ey, ex + 1 + (2 + reach * 6) * k, ey - (8 - reach * 6) * k, (148, 163, 184, 255))
        s.rect(24 + lean - 9 * k, top + 8 * k, 24 + lean - 6 * k, top + 15 * k, Mat(A))  # щит
    elif weapon == 'pick':
        ex, ey = ax + (3 + reach * 6) * k, top + (13 - reach * 4) * k
        s.line(ex, ey, ex + 2, ey - 8, (120, 90, 60, 255)); s.line(ex - 3, ey - 8, ex + 6, ey - 7, (200, 200, 210, 255))
    elif weapon == 'claws':
        ex, ey = ax + (3 + reach * 6) * k, top + (13 - reach * 4) * k
        for d in (-1, 0, 1): s.line(ex, ey, ex + 3, ey + 2 + d, hexc(A))

def golem(s, M, A, ph, big=1.0):
    k = big
    b = math.sin(ph['t'] * 12.566)
    for sg in (-1, 1): s.rect(24 + sg * 4 * k - 2 * k, G - 6 * k + abs(b) * sg, 24 + sg * 4 * k + 2 * k, G, Mat(darker(M.base, 0.75)))
    s.rect(24 - 8 * k, G - 18 * k, 24 + 8 * k, G - 6 * k, M)
    s.rect(24 - 4 * k, G - 25 * k, 24 + 4 * k, G - 18 * k, M)
    s.rect(24 - 2.5 * k, G - 22.5 * k, 24 + 2.5 * k, G - 21.5 * k, Mat(A, glow=True))
    lift = ph['atk'] * 8 * k
    for sg in (-1, 1): s.rect(24 + sg * 10 * k - 2.5 * k, G - 18 * k - (lift if sg > 0 else 0), 24 + sg * 10 * k + 2.5 * k, G - 7 * k - (lift if sg > 0 else 0), Mat(darker(M.base, 0.85)))
    s.ellipse(24, G - 12 * k, 2 * k, 2 * k, Mat(A, glow=True))

def moth(s, M, A, ph):
    y = 24 + math.sin(ph['t'] * 6.283) * 2
    f = math.sin(ph['t'] * 12.566) * 2
    for sg in (-1, 1):
        s.ellipse(24 + sg * 7, y - 3 - f, 7, 6, M); s.ellipse(24 + sg * 6, y + 5 + f * 0.5, 5, 4, Mat(darker(M.base, 0.85)))
        s.ellipse(24 + sg * 7, y - 3 - f, 2, 2, Mat(A, glow=True))
    s.ellipse(24, y + 1, 2.2, 7, Mat(darker(M.base, 0.6)))
    s.line(23, y - 6, 20, y - 11, hexc(A)); s.line(25, y - 6, 28, y - 11, hexc(A))

def pixie(s, M, A, ph):
    y = 22 + math.sin(ph['t'] * 6.283) * 2
    f = math.sin(ph['t'] * 25) * 2
    for sg in (-1, 1): s.ellipse(24 + sg * 6, y - 1 - f, 5, 3, Mat(A, glow=True))
    s.poly([(21, y + 9), (27, y + 9), (25, y + 1), (23, y + 1)], M)
    s.ellipse(24, y - 1, 3.4, 3.2, Mat('#fde2e4'))
    s.ellipse(24, y - 3.5, 3.8, 1.8, M)
    eyes(s, 24, y - 1, 2.4)
    if ph['atk'] > 0.3: s.ellipse(29, y + 2, 1.6, 1.6, Mat(A, glow=True))

def beetle(s, M, A, ph):
    b = math.sin(ph['t'] * 12.566)
    for i in range(3):
        for sg in (-1, 1): s.line(24 + sg * 5, G - 5 + i * 2 - 2, 24 + sg * (10 + b * sg), G - 1 + i, hexc(darker(M.base, 0.5)))
    s.ellipse(24, G - 6, 9, 6, M)
    s.line(24, G - 12, 24, G - 1, hexc(darker(M.base, 0.55)))
    s.ellipse(32 + ph['atk'] * 2, G - 6, 3.5, 3, Mat(darker(M.base, 0.7)))
    s.poly([(34 + ph['atk'] * 2, G - 8), (39 + ph['atk'] * 3, G - 13), (35 + ph['atk'] * 2, G - 6)], Mat(A))
    s.ellipse(21, G - 9, 2, 1.5, Mat(A, glow=True))

def sprout(s, M, A, ph):
    b = math.sin(ph['t'] * 12.566)
    for sg in (-1, 1): s.limb(24 + sg * 3, G - 5, 24 + sg * 5 + b * sg, G, 1.0, Mat('#6b4632'))
    s.ellipse(24, G - 8, 6, 6, M)
    for a in (-0.7, 0, 0.7): s.poly([(24, G - 13), (24 + math.sin(a) * 9 - 2, G - 20 - math.cos(a) * 3), (24 + math.sin(a) * 9 + 2, G - 18 - math.cos(a) * 3)], Mat(A))
    eyes(s, 24, G - 9, 4)
    if ph['atk'] > 0.3: s.limb(29, G - 8, 34 + ph['atk'] * 3, G - 10, 0.9, Mat('#6b4632'))

def mantis(s, M, A, ph):
    b = math.sin(ph['t'] * 12.566)
    for sg in (-1, 1): s.limb(24 + sg * 3, G - 8, 24 + sg * 6 + b, G, 0.8, M)
    s.ellipse(22, G - 10, 7, 3, M)
    s.limb(26, G - 12, 29, G - 22, 1.6, M)
    s.poly([(27, G - 26), (33, G - 24), (29, G - 21)], M)
    eyes(s, 30, G - 25, 2, glow=A)
    r = ph['atk']
    for sg in (0, 3): s.poly([(28, G - 19 + sg), (36 + r * 6, G - 22 + sg - r * 4), (31, G - 17 + sg)], Mat(A))

def plant(s, M, A, ph):
    sway = math.sin(ph['t'] * 6.283) * 2
    s.limb(24, G, 24 + sway, G - 16, 2.0, Mat('#3f7a3b'))
    for sg in (-1, 1): s.poly([(24, G - 4), (24 + sg * 9, G - 8), (24 + sg * 3, G - 2)], Mat('#2f6b3a'))
    mx = 24 + sway + ph['atk'] * 6
    s.ellipse(mx, G - 20, 7, 6, M)
    s.poly([(mx - 1, G - 20), (mx + 8, G - 24 + ph['atk'] * 3), (mx + 8, G - 16 - ph['atk'] * 3)], Mat('#2a0f1e'))
    for i in range(3): s.px(mx + 3 + i * 2, G - 22 + ph['atk'] * 2, (255, 255, 255, 255))

def jelly(s, M, A, ph):
    y = 22 + math.sin(ph['t'] * 6.283) * 2
    for i in range(5):
        x = 18 + i * 3
        s.line(x, y + 4, x + math.sin(ph['t'] * 6.283 + i) * 2, y + 14, hexc(A))
    s.ellipse(24, y, 9, 7, Mat(M.base, glow=False))
    s.rect(15, y + 1, 33, y + 7, Mat('#000000'), tone=0); s.erase([(x, yy) for x in range(10, 40) for yy in range(int(y + 2), int(y + 8))])
    s.ellipse(21, y - 3, 2, 1.5, Mat(A, glow=True))
    eyes(s, 24, y - 1, 4)

def ghost(s, M, A, ph):
    y = 20 + math.sin(ph['t'] * 6.283) * 2
    pts = [(16, y + 14)] + [(16 + i * 2, y + 14 - (2 if i % 2 else 0) + math.sin(ph['t'] * 6.283 + i) * 1) for i in range(9)] + [(32, y)]
    s.ellipse(24, y, 8, 7, M)
    s.poly([(16, y), (32, y), (32, y + 13), (16, y + 13)], M)
    for i in range(4): s.erase(Sprite.ellipse_px(18 + i * 4, y + 15, 1.2, 1.5))
    s.ellipse(21, y - 1, 1.5, 2, Mat('#0b0712')); s.ellipse(27, y - 1, 1.5, 2, Mat('#0b0712'))
    s.ellipse(24, y + 4, 1.5, 1.2 + ph['atk'], Mat('#0b0712'))
    s.line(33, y + 4, 35, y + 9, (120, 100, 80, 255)); s.ellipse(35, y + 11, 2, 2.5, Mat(A, glow=True))

def toad(s, M, A, ph):
    b = abs(math.sin(ph['t'] * 6.283)) * 2
    s.ellipse(24, G - 6 - b, 10, 6, M)
    s.ellipse(20, G - 12 - b, 2.5, 2.5, M); s.ellipse(28, G - 12 - b, 2.5, 2.5, M)
    eyes(s, 24, G - 13 - b, 8, glow=A)
    s.line(17, G - 5 - b + ph['atk'] * 2, 31, G - 5 - b + ph['atk'] * 2, hexc(darker(M.base, 0.4)))
    for sg in (-1, 1): s.ellipse(24 + sg * 9, G - 1, 3, 1.5, Mat(darker(M.base, 0.75)))
    if ph['atk'] > 0.5: s.ellipse(36, G - 9, 2.5, 2.5, Mat(A, glow=True))

def spider(s, M, A, ph):
    b = math.sin(ph['t'] * 12.566)
    for i in range(4):
        for sg in (-1, 1):
            s.line(24 + sg * 4, G - 7, 24 + sg * (9 + i * 2), G - 11 + i, hexc(darker(M.base, 0.5)))
            s.line(24 + sg * (9 + i * 2), G - 11 + i, 24 + sg * (11 + i * 2) + b * sg * (1 if i % 2 else -1), G, hexc(darker(M.base, 0.5)))
    s.ellipse(24, G - 8, 6, 5, M)
    s.ellipse(24 + ph['atk'] * 2, G - 4, 4, 3, Mat(darker(M.base, 0.8)))
    for dx in (-2, -1, 1, 2): s.px(24 + dx + ph['atk'] * 2, G - 5, hexc(A))

def harpy(s, M, A, ph):
    y = 22 + math.sin(ph['t'] * 6.283) * 2
    f = math.sin(ph['t'] * 12.566) * 5
    for sg in (-1, 1): s.poly([(24 + sg * 2, y), (24 + sg * 16, y - 6 - f), (24 + sg * 13, y + 4), (24 + sg * 6, y + 6)], Mat(darker(M.base, 0.85)))
    s.ellipse(24, y + 3, 4, 6, M)
    s.ellipse(24, y - 4, 3.2, 3, M)
    s.poly([(26, y - 4), (30, y - 3), (26, y - 2)], Mat('#facc15'))
    eyes(s, 24, y - 5, 2.5, glow=A)
    for sg in (-1, 1): s.line(24 + sg * 2, y + 9, 24 + sg * 3, y + 13 + ph['atk'] * 2, hexc('#facc15'))

def serpent(s, M, A, ph):
    for i in range(9):
        t = i / 8
        x = 10 + i * 3.3 + ph['atk'] * 4 * t
        y = G - 3 - math.sin(ph['t'] * 6.283 + i * 0.9) * 2 - (t ** 2) * 10
        s.ellipse(x, y, 3 - t * 0.5 + 0.5, 2.6, M if i % 2 else Mat(darker(M.base, 0.8)))
    s.ellipse(40 + ph['atk'] * 4, G - 15, 4, 3, M)
    s.px(41 + ph['atk'] * 4, G - 16, hexc(A)); s.line(44 + ph['atk'] * 4, G - 14, 46 + ph['atk'] * 4, G - 13, (239, 68, 68, 255))

def crab(s, M, A, ph):
    b = math.sin(ph['t'] * 12.566)
    for i in range(3):
        for sg in (-1, 1): s.line(24 + sg * 6, G - 4, 24 + sg * (10 + i * 2), G - (b * sg + 0), hexc(darker(M.base, 0.6)))
    s.ellipse(24, G - 6, 8, 5, M)
    r = ph['atk']
    for sg in (-1, 1):
        s.limb(24 + sg * 7, G - 7, 24 + sg * 11, G - 13 - r * 3, 1.2, M)
        s.ellipse(24 + sg * 12, G - 15 - r * 3, 3, 2.5, Mat(A))
    s.line(22, G - 10, 22, G - 13, hexc(darker(M.base, 0.5))); s.line(26, G - 10, 26, G - 13, hexc(darker(M.base, 0.5)))
    s.px(22, G - 14, (20, 12, 30, 255)); s.px(26, G - 14, (20, 12, 30, 255))

def eye(s, M, A, ph):
    y = 22 + math.sin(ph['t'] * 6.283) * 2
    for i in range(5):
        a = math.pi * (0.2 + i * 0.15)
        s.line(24 + math.cos(a) * 6, y + math.sin(a) * 6, 24 + math.cos(a) * 10 + math.sin(ph['t'] * 6.283 + i) * 2, y + 12 + i % 2 * 2, hexc(darker(M.base, 0.7)))
    s.ellipse(24, y, 8, 8, Mat('#f5f3ff'))
    s.ellipse(24 + ph['atk'] * 2, y, 4.5, 4.5, M)
    s.ellipse(24 + ph['atk'] * 2, y, 2, 2.6, Mat('#0b0712'))
    s.px(22 + ph['atk'] * 2, y - 2, (255, 255, 255, 255))

def thin(s, M, A, ph):
    biped(s, M, A, ph, h=34, thin=True, hood=False)

def drake(s, M, A, ph):
    quad(s, M, A, ph, size=1.25, ears=None, tail=True)
    f = math.sin(ph['t'] * 12.566) * 3
    s.poly([(20, G - 18), (12, G - 28 - f), (26, G - 20)], Mat(darker(M.base, 0.8)))
    for i in range(4): s.poly([(16 + i * 4, G - 15), (18 + i * 4, G - 20), (20 + i * 4, G - 15)], Mat(A))

def choir(s, M, A, ph):
    for i, (dx, dy) in enumerate(((-8, 2), (0, -4), (8, 2))):
        y = 22 + dy + math.sin(ph['t'] * 6.283 + i) * 2
        s.poly([(24 + dx - 5, y + 14), (24 + dx + 5, y + 14), (24 + dx + 3, y + 1), (24 + dx - 3, y + 1)], M)
        s.ellipse(24 + dx, y, 3.6, 4, Mat('#f5f3ff'))
        s.ellipse(24 + dx, y + 1.5, 1.2, 0.8 + ph['atk'], Mat('#1a1030'))

def star_l(s, M, A, ph):
    y = 20 + math.sin(ph['t'] * 6.283) * 2
    r1, r2 = 15 + ph['atk'] * 2, 7
    pts = []
    for i in range(10):
        a = -math.pi / 2 + i * math.pi / 5 + ph['t'] * 0.3
        r = r1 if i % 2 == 0 else r2
        pts.append((24 + math.cos(a) * r, y + math.sin(a) * r))
    s.poly(pts, M)
    s.ellipse(24, y, 5, 5, Mat(A, glow=True))
    eyes(s, 24, y - 1, 4)
    for i in range(4): s.px(24 - 12 - i * 3, y + 10 + i * 2, hexc(A), glow=True)

def mushroom(s, M, A, ph):
    b = abs(math.sin(ph['t'] * 6.283)) * 1.5
    s.rect(21, G - 9 - b, 27, G, Mat('#e6dcc8'))
    s.ellipse(24, G - 12 - b - ph['atk'] * 2, 10, 6, M)
    for (x, y) in ((19, -14), (26, -16), (29, -12)): s.ellipse(x, G + y - b - ph['atk'] * 2, 1.4, 1.2, Mat(A, glow=True))
    eyes(s, 24, G - 6 - b, 3)
    if ph['atk'] > 0.5:
        for i in range(5): s.px(16 + i * 4, G - 22 - (i % 2) * 3, hexc(A), glow=True)

def fan_l(s, M, A, ph):
    cx, cy = 24, 24
    s.ellipse(cx, cy, 18, 18, Mat(darker(M.base, 0.6)))
    s.ellipse(cx, cy, 15, 15, Mat('#0b0712'))
    rot = ph['t'] * 6.283 / 3 + ph['atk']
    for i in range(5):
        a = rot + i * 2 * math.pi / 5
        s.poly([(cx, cy), (cx + math.cos(a) * 14, cy + math.sin(a) * 14), (cx + math.cos(a + 0.5) * 12, cy + math.sin(a + 0.5) * 12)], M)
    s.ellipse(cx, cy, 4, 4, Mat(A, glow=True))
    for sg in (-1, 1): s.rect(cx + sg * 14 - 2, G - 4, cx + sg * 14 + 2, G, Mat(darker(M.base, 0.5)))

def queen(s, M, A, ph):
    f = math.sin(ph['t'] * 12.566) * 3
    for sg in (-1, 1):
        s.poly([(24 + sg * 4, 22), (24 + sg * 22, 6 - f), (24 + sg * 20, 22), (24 + sg * 14, 30)], Mat(A))
        s.poly([(24 + sg * 4, 26), (24 + sg * 18, 34 + f), (24 + sg * 8, 32)], Mat(darker(A, 0.85)))
    s.poly([(14, G), (34, G), (28, 22), (20, 22)], M)
    s.ellipse(24, 16, 5, 5, Mat('#f5d0fe'))
    s.poly([(18, 12), (19, 4), (21, 9), (24, 2), (27, 9), (29, 4), (30, 12)], Mat('#facc15'))
    eyes(s, 24, 16, 4, glow='#a855f7')
    r = ph['atk']
    s.limb(28, 26, 34 + r * 6, 30 - r * 8, 1.4, M); s.ellipse(35 + r * 6, 29 - r * 8, 2, 2, Mat('#e879f9', glow=True))

def sentinel(s, M, A, ph):
    golem(s, M, A, ph, big=1.75)
    # полумесяц над головой
    for i in range(14):
        a = math.pi * (0.15 + i * 0.05)
        s.px(24 + math.cos(a) * 10, 3 + math.sin(a) * 4, hexc(A), glow=True)

def silencer(s, M, A, ph):
    biped(s, M, A, ph, h=40, hood=True, big=1.1)
    s.rect(18, 14, 30, 16, Mat('#e2e8f0'))  # маска-повязка

def weaver(s, M, A, ph):
    spider(s, M, A, ph)
    s.limb(24, G - 10, 24, G - 22, 1.6, M)
    s.ellipse(24, G - 25, 3.5, 3.5, Mat('#e2e8f0'))
    for i in range(3): s.line(24, G - 22, 10 + i * 14, 4, (226, 232, 240, 140))

def shade(s, M, A, ph):
    y = 4 * math.sin(ph['t'] * 6.283)
    biped(s, M, A, ph, h=24, hood=True)
    s.erase([(x, yy) for x in range(48) for yy in range(G - 3, 48)])

# ================= v2: детальные семейства (перекрывают старые определения выше) =================
def mixh(a, b, t):
    return '#%02x%02x%02x' % mix(hexc(a)[:3], hexc(b)[:3], t)

def lighter(h, t=0.35): return mixh(h, '#fff4e0', t)

def quad(s, M, A, ph, size=1.0, ears='fox', tail=True, antlers=False, head_low=False):
    """Четвероногие v2: двухсегментные лапы с подушечками, светлое брюхо, грива/полоса по спине, морда с носом,
    ухо с розовой внутренней частью, пушистый хвост с кончиком."""
    k = size
    b = math.sin(ph['t'] * 12.566)
    by = G - 8 * k - abs(b) * 0.6
    lx = ph['atk'] * 3
    far, paw = Mat(darker(M.base, 0.72)), Mat(darker(M.base, 0.5))
    belly = Mat(lighter(M.base, 0.45))
    # дальние лапы (темнее), потом ближние
    for i, ox in enumerate((-6, 4, -3, 7)):
        near = i >= 2
        sw = b * 2 * (1 if i % 2 else -1)
        kx, ky = 24 + ox * k + sw * k * 0.6, by + 4.5 * k
        fx = 24 + ox * k + sw * k * 1.4
        mat = M if near else far
        s.limb(24 + ox * k, by + 1 * k, kx, ky, 1.5 * k, mat, r1=1.1 * k)
        s.limb(kx, ky, fx, G - 0.6 * k, 1.0 * k, mat, r1=0.9 * k)
        s.ellipse(fx + 0.6 * k, G - 0.6 * k, 1.5 * k, 0.9 * k, paw)
    if tail:
        tx, ty = 24 - 13 * k, by - 6 * k + b * 2
        s.limb(24 - 8 * k, by - 1 * k, tx, ty, 2.2 * k, M, r1=1.7 * k)
        s.ellipse(tx - 0.5 * k, ty - 0.5 * k, 1.8 * k, 1.8 * k, Mat(lighter(M.base, 0.7)))
    s.ellipse(24 + lx, by, 9 * k, 5 * k, M)
    s.ellipse(24 + lx + 1 * k, by + 2.4 * k, 6.5 * k, 2.4 * k, belly)
    # полоса/грива по спине (волки)
    for i in (range(5) if ears == 'fox' and size >= 1.1 else ()):
        x = 24 + lx - 6 * k + i * 3 * k
        s.poly([(x - 1.5 * k, by - 4 * k), (x - 0.5 * k, by - 6.5 * k - (i % 2) * k), (x + 1.5 * k, by - 4 * k)], Mat(darker(M.base, 0.8)))
    hx, hy = 24 + 9 * k + lx * 1.5, by - (2 if head_low else 5) * k
    s.limb(24 + 6 * k + lx, by - 1 * k, hx - 1 * k, hy + 1 * k, 2.6 * k, M)  # шея
    s.ellipse(hx - 1.5 * k, hy + 2.2 * k, 2.6 * k, 2.2 * k, belly)       # грудка/щёки
    s.ellipse(hx, hy, 4.2 * k, 3.6 * k, M)
    s.ellipse(hx + 3.2 * k, hy + 1.2 * k, 2.3 * k, 1.6 * k, Mat(lighter(M.base, 0.55)))  # морда
    s.px(hx + 5.2 * k, hy + 0.6 * k, (24, 14, 30, 255))  # нос
    if ph['atk'] > 0.5:  # пасть с клыками
        s.line(hx + 2 * k, hy + 2.4 * k, hx + 5 * k, hy + 2.4 * k, (60, 16, 32, 255)); s.px(hx + 4 * k, hy + 3 * k, (255, 255, 255, 255))
    inner = Mat('#f4a6b8')
    if ears == 'fox':
        for ex in (-1.5, 1.2):
            e0 = hx + ex * k
            s.poly([(e0 - 1.8 * k, hy - 2 * k), (e0 - 0.5 * k, hy - 7.5 * k), (e0 + 1.5 * k, hy - 2.5 * k)], M if ex > 0 else far)
            if ex > 0: s.poly([(e0 - 0.9 * k, hy - 2.6 * k), (e0 - 0.4 * k, hy - 5.8 * k), (e0 + 0.6 * k, hy - 2.8 * k)], inner)
    elif ears == 'hare':
        s.limb(hx - 1.5, hy - 3, hx - 4, hy - 12 * k, 1.3 * k, far)
        s.limb(hx + 0.5, hy - 3, hx + 0.5, hy - 12.5 * k, 1.3 * k, M); s.limb(hx + 0.5, hy - 4.5, hx + 0.5, hy - 11 * k, 0.5 * k, inner)
    if antlers:
        for sg in (-1, 1):
            am = Mat(A) if sg > 0 else Mat(darker(A, 0.75))
            s.limb(hx + sg * 2, hy - 3 * k, hx + sg * 7 * k, hy - 13 * k, 0.9 * k, am); s.limb(hx + sg * 5 * k, hy - 9 * k, hx + sg * 1, hy - 14 * k, 0.7 * k, am)
            s.limb(hx + sg * 6.4 * k, hy - 11.5 * k, hx + sg * 10 * k, hy - 14 * k, 0.6 * k, am)
    # глаз (вид сбоку): ресница, радужка, блик
    X, Y = s.T(hx + 1.6 * k, hy - 1.2 * k); X, Y = int(round(X)), int(round(Y))
    ir = s.eye_iris
    s.rpx(X - 1, Y - 1, (24, 14, 30, 255)); s.rpx(X, Y - 1, (24, 14, 30, 255)); s.rpx(X + 1, Y - 1, (24, 14, 30, 255))
    s.rpx(X, Y, (255, 255, 255, 255)); s.rpx(X + 1, Y, ir[1] + (255,)); s.rpx(X, Y + 1, ir[2] + (255,)); s.rpx(X + 1, Y + 1, ir[0] + (255,))

def biped(s, M, A, ph, h=18, horns=False, hunch=False, armor=None, weapon=None, hood=False, thin=False, big=1.0):
    """Гуманоиды v2: чиби-пропорции (голова ~1/3 у мелких), одежда другого цвета (туника/юбка, пояс с пряжкой, ворот),
    сапоги, руки из двух сегментов с кистями; у рыцарей — шлем с прорезью и плюмажем, наплечники, щит с гербом."""
    k = min(big, 44.0 / h)
    b = math.sin(ph['t'] * 12.566)
    hr = (2.8 + h * 0.06) * k                     # радиус головы
    hip = G - max(5.5, h * 0.32) * k
    top = G - h * k
    lean = ph['atk'] * 3 * k + (3 if hunch else 0)
    cl = armor or mixh(A, '#2a1f3d', 0.55)
    if hood: cl = darker(M.base, 0.7)
    cloth, clothd = Mat(cl), Mat(darker(cl, 0.75))
    boot = Mat(darker(armor, 0.6) if armor else '#4a3426')
    skin = M
    bw = (2.6 if thin else 4.4) * k
    sh_y = top + 2 * hr - 0.5 * k                  # линия плеч
    reach = ph['atk']
    # дальняя рука
    s.limb(24 + lean - bw + 0.5 * k, sh_y + 1 * k, 24 + lean - bw - 2 * k, sh_y + (hip - sh_y) * 0.6, 1.1 * k, clothd)
    s.ellipse(24 + lean - bw - 2 * k, sh_y + (hip - sh_y) * 0.6 + 1.2 * k, 1.2 * k, 1.2 * k, Mat(darker(M.base, 0.75)))
    # ноги: штанины + сапоги
    for sg in (-1, 1):
        fx = 24 + sg * 2.4 * k + b * sg * 2 * k
        s.limb(24 + sg * 2 * k, hip, fx, G - 2 * k, (0.9 if thin else 1.4) * k, clothd if not thin else skin)
        s.limb(fx, G - 2.4 * k, fx + 0.6 * k, G - 0.8 * k, (1.1 if thin else 1.6) * k, boot)
    # торс + подол
    s.poly([(24 - bw - 0.5 * k, hip + 2 * k), (24 + bw + 0.5 * k, hip + 2 * k), (24 + bw * 0.95 + lean, sh_y), (24 - bw * 0.95 + lean, sh_y)], cloth)
    if armor:
        s.ellipse(24 + lean - 0.8 * k, sh_y + 3 * k, bw * 0.55, 2.4 * k, Mat(lighter(armor, 0.35)))  # нагрудник
        for sg in (-1, 1): s.ellipse(24 + lean + sg * bw, sh_y + 0.6 * k, 1.9 * k, 1.5 * k, Mat(lighter(armor, 0.15)))  # наплечники
    elif not hood:
        s.poly([(24 + lean - 1.6 * k, sh_y), (24 + lean + 1.6 * k, sh_y), (24 + lean, sh_y + 2.4 * k)], skin)  # ворот
    if not hood:
        by_ = hip - 0.2 * k
        s.rect(24 - bw - 0.2 * k + lean * 0.2, by_, 24 + bw + 0.2 * k + lean * 0.2, by_ + 0.9 * k, Mat('#3b2418'), tone=2)  # пояс
        s.px(24 + lean * 0.2, by_ + 0.4 * k, hexc(A))
    if thin and not armor and not hood:  # рёбра
        for i in range(3): s.line(24 + lean - bw * 0.6, sh_y + 2 * k + i * 1.6 * k, 24 + lean + bw * 0.6, sh_y + 2 * k + i * 1.6 * k, hexc(darker(cl, 0.5)))
    hx, hy = 24 + lean * 1.2, top + hr
    if hood:
        s.poly([(hx - hr * 1.3, hy + hr * 1.2), (hx + hr * 1.3, hy + hr * 1.2), (hx + hr * 0.9, hy - hr * 1.1), (hx + 0.5 * k, hy - hr * 1.7), (hx - hr * 0.9, hy - hr * 1.1)], cloth)
        s.ellipse(hx + 0.4 * k, hy + 0.4 * k, hr * 0.68, hr * 0.7, Mat('#0b0712'), tone=2)
        eyes(s, hx + 0.4 * k, hy, hr * 0.55, glow=A, size=max(1, int(k)))
    else:
        s.ellipse(hx, hy, hr, hr * 0.95, skin)
        if armor:
            s.ellipse(hx, hy - hr * 0.15, hr * 1.08, hr * 0.98, Mat(armor))
            s.rect(hx - hr * 0.7, hy - 0.2 * k, hx + hr * 0.85, hy + 0.6 * k, Mat('#0b0712'), tone=2)
            eyes(s, hx + 0.6 * k, hy, hr * 0.7, glow=A, size=max(1, int(k)))
            s.poly([(hx - 0.8 * k, hy - hr), (hx - 4 * k, hy - hr - 3.5 * k), (hx + 1 * k, hy - hr - 1.8 * k)], Mat(A))  # плюмаж
        else:
            # причёска/макушка: тёмная шапка волос по верху головы с прядкой
            hair = Mat(darker(A, 0.55)) if not thin else Mat(darker(M.base, 0.8))
            HX, HY = s.T(hx, hy); R = hr * s.k
            cap = [p for p in Sprite.ellipse_px(HX, HY - R * 0.12, R * 1.06, R * 0.98) if p[1] < HY - R * 0.32]
            for j in range(-2, 3):  # чёлка: зубцы вниз
                fx = HX + j * R * 0.38
                cap += [p for p in Sprite.poly_px([(fx - R * 0.22, HY - R * 0.4), (fx + R * 0.02 * j, HY - R * (0.05 if j % 2 else 0.2)), (fx + R * 0.22, HY - R * 0.4)])]
            Sprite.fill(s, cap, hair)
            eyes(s, hx + 0.4 * k, hy + 0.2 * k, hr * 0.72, size=max(1, int(k)))
    if horns:
        for sg in (-1, 1):
            s.poly([(hx + sg * hr * 0.7, hy - hr * 0.5), (hx + sg * (hr + 1.6 * k), hy - hr - 3.2 * k), (hx + sg * hr * 0.15, hy - hr * 0.8)], Mat(A))
    # ближняя рука (плечо → локоть → кисть)
    ax, ay = 24 + lean + bw - 0.5 * k, sh_y + 1 * k
    ex, ey = ax + (2 + reach * 6) * k, ay + (hip - sh_y) * 0.65 - reach * 4 * k + (4 if hunch else 0)
    s.limb(ax, ay, (ax + ex) / 2 + 0.6 * k, (ay + ey) / 2, 1.2 * k, cloth)
    s.limb((ax + ex) / 2 + 0.6 * k, (ay + ey) / 2, ex, ey, 1.0 * k, skin)
    s.ellipse(ex, ey, 1.25 * k, 1.25 * k, skin)
    if weapon == 'sword':
        tx, ty = ex + (2 + reach * 6) * k, ey - (9 - reach * 6) * k
        s.line(ex, ey, tx, ty, (226, 232, 240, 255)); s.line(ex + 1, ey, tx + 1, ty, (148, 163, 184, 255))
        s.line(ex - 1.5 * k, ey + 0.5 * k, ex + 1.5 * k, ey - 0.5 * k, hexc(A))  # гарда
        sx = 24 + lean - bw - 3 * k
        s.rect(sx - 2.2 * k, sh_y + 1 * k, sx + 1.2 * k, sh_y + 8 * k, Mat(A))  # щит
        s.rect(sx - 1 * k, sh_y + 2.5 * k, sx, sh_y + 6 * k, Mat(darker(A, 0.55)), tone=2)  # герб
    elif weapon == 'pick':
        s.line(ex, ey, ex + 2 * k, ey - 8 * k, (120, 90, 60, 255)); s.line(ex - 3 * k, ey - 8 * k, ex + 6 * k, ey - 7 * k, (200, 200, 210, 255))
    elif weapon == 'claws':
        for d in (-1, 0, 1): s.line(ex, ey, ex + 3 * k, ey + (2 + d) * k, hexc(A))

def golem(s, M, A, ph, big=1.0):
    """Големы v2: каменные блоки с фасками и трещинами, мох/кристаллы акцентом, светящееся ядро и глаза-щели."""
    k = big
    b = math.sin(ph['t'] * 12.566)
    st, std = M, Mat(darker(M.base, 0.75))
    for sg in (-1, 1):
        s.rect(24 + sg * 4 * k - 2.2 * k, G - 7 * k + abs(b) * sg, 24 + sg * 4 * k + 2.2 * k, G, std)
        s.rect(24 + sg * 4 * k - 2.8 * k, G - 1.6 * k, 24 + sg * 4 * k + 2.8 * k, G, Mat(darker(M.base, 0.55)))
    lift = ph['atk'] * 8 * k
    s.rect(24 - 12.5 * k, G - 18 * k, 24 - 7.5 * k, G - 7 * k, std)  # дальняя рука
    s.poly([(24 - 8 * k, G - 6 * k), (24 + 8 * k, G - 6 * k), (24 + 9 * k, G - 16 * k), (24 + 6 * k, G - 19 * k), (24 - 6 * k, G - 19 * k), (24 - 9 * k, G - 16 * k)], st)
    s.ellipse(24, G - 12 * k, 2.6 * k, 2.6 * k, Mat(darker(M.base, 0.5)))
    s.ellipse(24, G - 12 * k, 1.8 * k, 1.8 * k, Mat(A, glow=True))
    # трещины
    s.line(24 - 6 * k, G - 17 * k, 24 - 3 * k, G - 13 * k, hexc(darker(M.base, 0.45))); s.line(24 + 5 * k, G - 9 * k, 24 + 7 * k, G - 13 * k, hexc(darker(M.base, 0.45)))
    # голова
    s.poly([(24 - 4.5 * k, G - 18 * k), (24 + 4.5 * k, G - 18 * k), (24 + 4 * k, G - 25 * k), (24 - 4 * k, G - 25 * k)], st)
    s.rect(24 - 3.2 * k, G - 22.6 * k, 24 + 3.2 * k, G - 21.4 * k, Mat('#0b0712'), tone=2)
    for sg in (-1, 1): s.rect(24 + sg * 1.8 * k - 0.7 * k, G - 22.4 * k, 24 + sg * 1.8 * k + 0.7 * k, G - 21.6 * k, Mat(A, glow=True))
    # мох / кристаллы на плечах
    for sg in (-1, 1):
        s.poly([(24 + sg * 6 * k, G - 19 * k), (24 + sg * 7.5 * k, G - 23 * k), (24 + sg * 9 * k, G - 18.5 * k)], Mat(A))
    s.rect(24 + 7.5 * k, G - 18 * k - lift, 24 + 12.5 * k, G - 7 * k - lift, st)  # ближняя рука
    s.rect(24 + 7 * k, G - 8.5 * k - lift, 24 + 13 * k, G - 5.5 * k - lift, Mat(darker(M.base, 0.6)))  # кулак

def jelly(s, M, A, ph):
    """Медуза v2: полупрозрачный купол с бликом и узором, оборка, сужающиеся щупальца."""
    y = 22 + math.sin(ph['t'] * 6.283) * 2
    for i in range(5):
        x = 18.5 + i * 2.8
        sw = math.sin(ph['t'] * 6.283 + i) * 2
        s.limb(x, y + 4, x + sw, y + 10, 0.9, Mat(A), r1=0.7); s.limb(x + sw, y + 10, x - sw * 0.5, y + 15, 0.7, Mat(A), r1=0.4)
    s.ellipse(24, y + 4.5, 9.5, 2, Mat(darker(M.base, 0.75)))
    for i in range(6): s.ellipse(15.5 + i * 3.4, y + 5.5, 1.4, 1.2, Mat(darker(M.base, 0.65)))
    s.fill([p for p in Sprite.ellipse_px(24, y + 2, 9, 8) if p[1] < y + 5], M) if False else None
    s.ellipse(24, y + 1, 9, 6.5, M)
    s.ellipse(24, y + 1.5, 5.5, 3.5, Mat(lighter(M.base, 0.3)))
    s.ellipse(20.5, y - 2.5, 2, 1.4, Mat(A, glow=True))
    eyes(s, 24, y + 0.5, 4)

def slime(s, M, A, ph, big=False):
    """Слизни v2: капля с бликом и внутренними пузырьками, «лужица» у земли; королевский — корона с камнями."""
    k = 2 if big else 1
    sq = 1 + 0.12 * math.sin(ph['t'] * 6.283) - 0.15 * ph['atk']
    rx, ry = 8 * k * (2 - sq) / 1.0, 7 * k * sq
    cy = G - ry
    s.ellipse(24, G - 1 * k, rx * 0.85, 1.6 * k, Mat(darker(M.base, 0.8)))
    s.ellipse(24, cy, rx * 0.75, ry, M)
    s.ellipse(24 + rx * 0.25, cy + ry * 0.35, rx * 0.12, ry * 0.12, Mat(lighter(M.base, 0.4)))
    s.ellipse(24 - rx * 0.3, cy + ry * 0.5, rx * 0.08, ry * 0.08, Mat(lighter(M.base, 0.4)))
    s.ellipse(24 - rx * 0.25, cy - ry * 0.45, rx * 0.18, ry * 0.18, Mat(A, glow=True))
    eyes(s, 24 + ph['atk'] * 2, cy - 1, 5 * k, glow=None)
    if big:
        for i in range(5): s.poly([(16 + i * 4, cy - ry + 1), (18 + i * 4, cy - ry - 5 - (i % 2) * 2), (20 + i * 4, cy - ry + 1)], Mat('#facc15'))
        for i in (1, 3): s.px(18 + i * 4, cy - ry - 1, (239, 68, 68, 255))


def ghost(s, M, A, ph):
    """Призрак v2: волнистый подол, аниме-глаза с бликом, румянец, ручки, фонарь со свечением."""
    y = 20 + math.sin(ph['t'] * 6.283) * 2
    s.ellipse(24, y, 8, 7, M)
    s.poly([(16, y), (32, y), (32, y + 13), (16, y + 13)], M)
    for i in range(4): s.erase(Sprite.ellipse_px(18 + i * 4, y + 15, 1.2, 1.5))
    s.ellipse(27, y + 6, 4, 6, Mat(darker(M.base, 0.85)))  # складка
    s.limb(16.5, y + 5, 14 + ph['atk'] * 2, y + 8, 1.3, M)
    eyes(s, 24, y - 2, 6)
    s.ellipse(24, y + 4, 1.2, 0.8 + ph['atk'], Mat('#2a0f1e'), tone=2)
    s.line(33, y + 4, 35, y + 9, (120, 100, 80, 255))
    s.rect(33.5, y + 9.5, 36.5, y + 13, Mat('#6b4632')); s.ellipse(35, y + 11.2, 1.1, 1.3, Mat(A, glow=True))

def spider(s, M, A, ph):
    """Паук v2: суставчатые лапы с «коленями», брюшко с узором-меткой, кластер светящихся глаз, хелицеры."""
    b = math.sin(ph['t'] * 12.566)
    legc, kneec = Mat(darker(M.base, 0.5)), Mat(darker(M.base, 0.7))
    for i in range(4):
        for sg in (-1, 1):
            kx, ky = 24 + sg * (9 + i * 2), G - 12 + i
            fx = 24 + sg * (11 + i * 2) + b * sg * (1 if i % 2 else -1)
            lc = hexc(darker(M.base, 0.45)); s.line(24 + sg * 4, G - 7, kx, ky, lc); s.line(24 + sg * 4, G - 6.4, kx, ky + 0.6, lc); s.line(kx, ky, fx, G, lc)
            s.ellipse(kx, ky, 0.7, 0.7, kneec)
    s.ellipse(21, G - 9, 7, 5.5, M)
    s.poly([(19, G - 13), (22, G - 10), (19, G - 7), (16, G - 10)], Mat(A))  # метка на брюшке
    s.ellipse(28 + ph['atk'] * 2, G - 6, 4, 3.2, Mat(darker(M.base, 0.8)))
    for (dx, dy) in ((0, 0), (2, 0), (1, -1.2), (3, -1)):
        s.px(28.5 + dx + ph['atk'] * 2, G - 7 + dy, hexc(A), glow=True)
    for sg in (-1, 1): s.line(31 + ph['atk'] * 2, G - 4.5 + sg * 0.8, 32.5 + ph['atk'] * 3, G - 3 + sg * 1.2, (240, 230, 220, 255))


def queen(s, M, A, ph):
    """Королева v2: крылья с прожилками в 2 слоя, длинные волосы, аниме-лицо, платье с оборками и поясом, скипетр."""
    f = math.sin(ph['t'] * 12.566) * 3
    for sg in (-1, 1):
        s.poly([(24 + sg * 4, 22), (24 + sg * 22, 6 - f), (24 + sg * 20, 22), (24 + sg * 14, 30)], Mat(A))
        s.line(24 + sg * 5, 22, 24 + sg * 19, 9 - f, hexc(darker(A, 0.7))); s.line(24 + sg * 6, 24, 24 + sg * 18, 20, hexc(darker(A, 0.7)))
        s.poly([(24 + sg * 4, 26), (24 + sg * 18, 34 + f), (24 + sg * 8, 32)], Mat(darker(A, 0.85)))
    hair = Mat(mixh(M.base, '#4c1d95', 0.5))
    s.poly([(17.5, 14), (30.5, 14), (32, 30), (16, 30)], hair)  # волосы за спиной
    s.poly([(14, G), (34, G), (28, 22), (20, 22)], M)
    for i in range(3): s.poly([(15 + i * 0.5, G - 2 - i * 7), (33 - i * 0.5, G - 2 - i * 7), (32 - i, G - 4 - i * 7), (16 + i, G - 4 - i * 7)], Mat(lighter(M.base, 0.4)))  # оборки
    s.rect(20.5, 24, 27.5, 25, Mat('#facc15'))  # пояс
    s.ellipse(24, 16, 5, 5, Mat('#f5d0fe'))
    s.poly([(18.8, 14), (19.5, 11), (24, 10.4), (28.5, 11), (29.2, 14), (27, 12.5), (24, 13.2), (21, 12.5)], hair)  # чёлка
    s.poly([(18, 12), (19, 4), (21, 9), (24, 2), (27, 9), (29, 4), (30, 12)], Mat('#facc15'))
    s.px(24, 7, (239, 68, 68, 255)); s.px(20, 9, (96, 165, 250, 255)); s.px(28, 9, (96, 165, 250, 255))
    s.eye_iris = ramp('#7c3aed'); eyes(s, 24, 15.5, 4.2)
    r = ph['atk']
    s.limb(28, 26, 34 + r * 6, 30 - r * 8, 1.4, M); s.line(34 + r * 6, 34 - r * 8, 35 + r * 6, 24 - r * 8, hexc('#facc15'))
    s.ellipse(35 + r * 6, 23 - r * 8, 2, 2, Mat('#e879f9', glow=True))


FAM = {
    'slime': slime, 'slime_l': lambda s, M, A, ph: slime(s, M, A, ph, big=True), 'wisp': wisp, 'bat': bat, 'fly': fly,
    'fly_boss': lambda s, M, A, ph: fly(s, M, A, ph, big=True), 'hare': lambda s, M, A, ph: quad(s, M, A, ph, 0.8, 'hare', tail=False),
    'imp': lambda s, M, A, ph: biped(s, M, A, ph, h=19, horns=True), 'moth': moth, 'pixie': pixie, 'beetle': beetle, 'sprout': sprout,
    'fox': lambda s, M, A, ph: quad(s, M, A, ph, 0.95, 'fox'), 'mantis': mantis, 'golem': lambda s, M, A, ph: golem(s, M, A, ph, 0.9),
    'plant': plant, 'wolf': lambda s, M, A, ph: quad(s, M, A, ph, 1.15, 'fox', head_low=True), 'jelly': jelly, 'ghost': ghost,
    'stag_l': lambda s, M, A, ph: quad(s, M, A, ph, 1.6, None, tail=False, antlers=True),
    'dryad_boss': lambda s, M, A, ph: biped(s, M, A, ph, h=40, horns=True, weapon='claws', big=1.1),
    'ghoul': lambda s, M, A, ph: biped(s, M, A, ph, h=20, hunch=True, weapon='claws'), 'toad': toad, 'spider': spider,
    'skeleton': lambda s, M, A, ph: biped(s, M, A, ph, h=19, thin=True, weapon='pick'), 'harpy': harpy,
    'knight': lambda s, M, A, ph: biped(s, M, A, ph, h=21, armor=darker(M.base, 0.9), weapon='sword'),
    'baron_l': lambda s, M, A, ph: biped(s, M, A, ph, h=34, armor=darker(M.base, 0.9), weapon='sword', big=1.3),
    'warden_boss': lambda s, M, A, ph: biped(s, M, A, ph, h=40, armor=darker(M.base, 0.9), weapon='sword', horns=True, big=1.4),
    'sentinel_huge': sentinel, 'serpent': serpent, 'shade': shade, 'weaver': weaver, 'fan_l': fan_l, 'silencer_huge': silencer,
    'crab': crab, 'eye': eye, 'thin': thin, 'drake': drake, 'choir': choir, 'star_l': star_l, 'queen_huge': queen, 'mushroom': mushroom,
}

def frame(fn, base, acc, col, fly, scale=1.4):
    ph = {'t': 0.0, 'atk': 0.0}
    if col < 4: ph['t'] = col / 4
    elif col < 7: ph['atk'] = (0.35, 1.0, 0.5)[col - 4]; ph['t'] = 0.25
    else: ph['t'] = 0.0
    s = XSprite(scale)
    s.eye_iris = ramp(mix(hexc(acc)[:3], (59, 31, 107), 0.5))
    M = Mat(base); M.base = base
    fn(s, M, acc, ph)
    im = s.render(outline=True)
    px = im.load(); C = CO
    if col == 7:  # урон: светлая вспышка
        for y in range(C):
            for x in range(C):
                r, g, b, a = px[x, y]
                if a: px[x, y] = (min(255, r + 110), min(255, g + 90), min(255, b + 110), a)
    if col >= 8:  # распад: пиксели исчезают и уходят вверх фиолетовыми искрами
        k = (col - 7) / 4
        rnd = random.Random(col * 31 + sum(map(ord, base)) % 97)  # детерминированно (hash() строк солится)
        out = Image.new('RGBA', (C, C), (0, 0, 0, 0)); op = out.load()
        for y in range(C):
            for x in range(C):
                c = px[x, y]
                if not c[3]: continue
                if rnd.random() < k * 0.9:
                    if rnd.random() < 0.25:
                        ny = int(y - k * 10 - rnd.random() * 6)
                        if 0 <= ny < C: op[x, ny] = (196, 181, 253, 255)
                    continue
                op[x, y] = (int(c[0] * (1 - k * 0.3) + 120 * k * 0.3), int(c[1] * (1 - k * 0.3) + 80 * k * 0.3), int(c[2] * (1 - k * 0.3) + 200 * k * 0.3), c[3])
        im = out
    return im

def main():
    ids = list(MOBS.keys())
    C = CO
    atlas = Image.new('RGBA', (C * COLS, C * len(ids)), (0, 0, 0, 0))
    flying = {}
    missing = []
    for r, mid in enumerate(ids):
        m = MOBS[mid]
        art = m.get('art') or {}
        fam = art.get('fam') or 'slime'
        fn = FAM.get(fam)
        if not fn: missing.append((mid, fam)); fn = slime
        base = m.get('color') or '#a78bfa'
        acc = ACC.get(art.get('pal'), '#fde68a')
        if fam in FLY: flying[mid] = 0
        for c in range(COLS):
            big = m.get('boss') or m.get('huge') or fam.endswith(('_boss', '_huge', '_l'))
            atlas.paste(frame(fn, base, acc, c, fam in FLY, scale=1.32 if big else 1.45), (c * C, r * C))
    atlas.save(OUT)
    # body: [низ, верх] видимого тела в кадре 0 (px от низа ячейки) — для масштаба в забеге и полосок над головой
    body = []
    for r in range(len(ids)):
        bb = atlas.crop((0, r * C, C, (r + 1) * C)).getbbox()
        body.append([C - bb[3], C - bb[1]] if bb else [0, C])
    json.dump({'cell': C, 'pxPerM': 12.5, 'cols': COLS, 'rows': ids, 'flying': flying, 'body': body}, open(OUT.replace('.png', '.json'), 'w'))
    os.makedirs(PREV, exist_ok=True)
    # превью: кадр 0 каждого моба сеткой 12×N с подписью-индексом
    n = len(ids); pc = 12; pr = (n + pc - 1) // pc
    prev = Image.new('RGBA', (pc * C, pr * C), (34, 44, 52, 255))
    for i in range(n):
        prev.alpha_composite(atlas.crop((0, i * C, C, (i + 1) * C)), ((i % pc) * C, (i // pc) * C))
    prev.resize((prev.width * 3, prev.height * 3), Image.NEAREST).save(os.path.join(PREV, 'bestiary_frame0_x3.png'))
    anim = atlas.crop((0, 0, C * COLS, C * 6))
    bg = Image.new('RGBA', anim.size, (34, 44, 52, 255)); bg.alpha_composite(anim)
    bg.resize((anim.width * 3, anim.height * 3), Image.NEAREST).save(os.path.join(PREV, 'bestiary_anim_rows0-5_x3.png'))
    print('mobs', n, 'missing families', missing, atlas.size)

if __name__ == '__main__':
    main()
