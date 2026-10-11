"""Атлас всех Отголосков бестиария (68 мобов) в едином пиксельном стиле «Проклятых».
Масштаб общий для мира: 10 px арта = 1 м, ячейка 48×48 (= 4.8 м); мелкие мобы ~14–20 px, крупные ~30,
огромные/боссы ~40–46 px — поэтому один и тот же размер билборда даёт честные пропорции.
Строка = моб (порядок MOBS_PUBLIC из server/meta/generated/public.ts), 12 колонок:
  0–3 ход/полёт, 4–6 атака (замах → удар → возврат), 7 урон (вспышка), 8–11 распад.
Семейство и палитра — из бестиария (art.fam / art.pal), базовый цвет — mob.color.
Выход: src/assets/mc/bestiary_atlas.png + bestiary_atlas.json {cell, cols, rows: [ids], flying: {id: м}}.
"""
import os, re, json, math, random
from PIL import Image
from pixkit import Sprite, Mat, hexc, mix

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
OUT = os.path.join(ROOT, 'src', 'assets', 'mc', 'bestiary_atlas.png')
PREV = '/workspace/morrisgrad-round2/sprites'
C, COLS, G = 48, 12, 46

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
    for dx in (-gap / 2, gap / 2):
        if glow: s.rect(x + dx - size / 2, y, x + dx + size / 2 - 0.01 + (size > 1), y + size - 1 + 0.01, Mat(glow, glow=True))
        else:
            s.px(x + dx, y, hexc(col)); s.px(x + dx, y + 1, hexc(col))
            s.px(x + dx, y, (255, 255, 255, 255)) if size > 1 else None

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

FAM = {
    'slime': slime, 'slime_l': lambda s, M, A, ph: slime(s, M, A, ph, big=True), 'wisp': wisp, 'bat': bat, 'fly': fly,
    'fly_boss': lambda s, M, A, ph: fly(s, M, A, ph, big=True), 'hare': lambda s, M, A, ph: quad(s, M, A, ph, 0.8, 'hare', tail=False),
    'imp': lambda s, M, A, ph: biped(s, M, A, ph, h=15, horns=True), 'moth': moth, 'pixie': pixie, 'beetle': beetle, 'sprout': sprout,
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

def frame(fn, base, acc, col, fly):
    ph = {'t': 0.0, 'atk': 0.0}
    if col < 4: ph['t'] = col / 4
    elif col < 7: ph['atk'] = (0.35, 1.0, 0.5)[col - 4]; ph['t'] = 0.25
    else: ph['t'] = 0.0
    s = Sprite(C, C)
    M = Mat(base); M.base = base
    fn(s, M, acc, ph)
    im = s.render(outline=True)
    px = im.load()
    if col == 7:  # урон: светлая вспышка
        for y in range(C):
            for x in range(C):
                r, g, b, a = px[x, y]
                if a: px[x, y] = (min(255, r + 110), min(255, g + 90), min(255, b + 110), a)
    if col >= 8:  # распад: пиксели исчезают и уходят вверх фиолетовыми искрами
        k = (col - 7) / 4
        rnd = random.Random(col * 31 + hash(base) % 97)
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
            atlas.paste(frame(fn, base, acc, c, fam in FLY), (c * C, r * C))
    atlas.save(OUT)
    json.dump({'cell': C, 'cols': COLS, 'rows': ids, 'flying': flying}, open(OUT.replace('.png', '.json'), 'w'))
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
