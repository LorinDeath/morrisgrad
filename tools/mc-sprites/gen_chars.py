"""Атлас персонажей 16×20 (чиби) для 2.5D: герои + NPC (кроме Кейт и Дара — у них свои листы).

Ячейка 24×24: фигура 16×20 стоит внизу по центру (x=4, y=4), запас сверху/по бокам — для оружия в кадрах атаки.
Строки: spearman, rogue, mage, warrior, alzi, leyr, petr, kyut.
Колонки: 4 направления (вниз, влево, вправо = зеркало, вверх) × 6 кадров:
  0 шаг A, 1 стойка, 2 шаг B, 3 «вдох» (кивок для idle), 4 замах, 5 удар.
Выход: src/assets/mc/chars_atlas.png (576×192) и превью ×4 в /workspace/morrisgrad-round2/sprites/.
Арт — ручные пиксельные карты в chibi_art.py (оригинальные персонажи проекта).
"""
import os, sys
from PIL import Image
sys.path.insert(0, os.path.dirname(__file__))
import chibi_art as A

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
OUT = os.path.join(ROOT, 'src', 'assets', 'mc', 'chars_atlas.png')
PREV = '/workspace/morrisgrad-round2/sprites'
ROWS = ['spearman', 'rogue', 'mage', 'warrior', 'alzi', 'leyr', 'petr', 'kyut']
CW, CH, FX, FY = 24, 24, 4, 4

def hx(h):
    h = h.lstrip('#'); return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4)) + (255,)

def figure(c, d, leg, breathe=False):
    legs = c.get('legs', A.LEGS)[d][leg]
    rows = list(c[d]) + list(legs)
    if breathe:  # кивок: голова на 1 px ниже, шея «уходит» в воротник
        rows = [rows[0]] + rows[0:12] + rows[13:]
    im = Image.new('RGBA', (16, 20))
    for y, r in enumerate(rows):
        assert len(r) == 16, (d, y, r)
        for x, ch in enumerate(r):
            if ch != '.': im.putpixel((x, y), hx(c['pal'][ch]))
    return im

# ---- оружие: отрезки/точки в координатах ячейки 24×24; каждый слой получает свой тёмный контур ----
WOOD, STEEL, STEEL_L, STEEL_D = '#8a5a2b', '#c9d3e3', '#ffffff', '#6b7690'
def L(x0, y0, x1, y1, col):
    n = max(abs(x1 - x0), abs(y1 - y0)); return [(round(x0 + (x1 - x0) * i / n), round(y0 + (y1 - y0) * i / n), col) for i in range(n + 1)]

def weapon(kind, d, phase):
    """phase 0 — замах, 1 — удар. d: down / left / up (right — зеркало left)."""
    px = []
    if kind == 'spear':
        if d == 'down':
            px += L(19, 3 if phase == 0 else 9, 19, 17 if phase == 0 else 23, WOOD)
            tip = (19, 17 if phase == 0 else 23); px += [(tip[0], tip[1], STEEL_L), (tip[0], tip[1] - 1, STEEL), (tip[0] - 1, tip[1] - 2, STEEL_D), (tip[0] + 1, tip[1] - 2, STEEL_D)]
            px += [(19, (6 if phase == 0 else 12), '#3fcf72')]
        elif d == 'left':
            x0 = 9 if phase == 0 else 0
            px += L(x0, 18, x0 + 14, 18, WOOD)
            px += [(x0, 18, STEEL_L), (x0 + 1, 18, STEEL), (x0 + 2, 17, STEEL_D), (x0 + 2, 19, STEEL_D), (x0 + 6, 18, '#3fcf72')]
        else:
            y0 = 6 if phase == 0 else 0
            px += L(18, y0, 18, y0 + 16, WOOD)
            px += [(18, y0, STEEL_L), (18, y0 + 1, STEEL), (17, y0 + 2, STEEL_D), (19, y0 + 2, STEEL_D)]
    elif kind == 'sword':
        BL = [STEEL_L, STEEL, STEEL, STEEL, STEEL_D, STEEL_D]
        if d == 'down':
            seg = L(18, 13, 21, 4, STEEL) if phase == 0 else L(14, 19, 6, 23, STEEL)
            px += [(x, y, BL[min(i, 5)]) for i, (x, y, _) in enumerate(seg)]
            px += [(17, 14, '#ffd54a'), (18, 14, '#ffd54a')] if phase == 0 else [(15, 18, '#ffd54a')]
            if phase == 1: px += [(x, y, '#e8f6ff') for (x, y, _) in L(3, 15, 6, 21, 0)]
        elif d == 'left':
            seg = L(13, 14, 16, 4, STEEL) if phase == 0 else L(7, 18, 0, 16, STEEL)
            px += [(x, y, BL[min(i, 5)]) for i, (x, y, _) in enumerate(seg)]
            px += [(12, 15, '#ffd54a')] if phase == 0 else [(8, 18, '#ffd54a')]
            if phase == 1: px += [(x, y, '#e8f6ff') for (x, y, _) in L(1, 9, 0, 14, 0)]
        else:
            seg = L(18, 14, 20, 6, STEEL) if phase == 0 else L(9, 8, 4, 1, STEEL)
            px += [(x, y, BL[min(i, 5)]) for i, (x, y, _) in enumerate(seg)]
    elif kind == 'daggers':
        if d == 'down':
            if phase == 0: px += L(6, 14, 4, 11, STEEL) + L(17, 14, 19, 11, STEEL)
            else: px += L(7, 20, 6, 23, STEEL) + L(16, 20, 17, 23, STEEL) + [(5, 22, '#e8f6ff'), (18, 22, '#e8f6ff')]
        elif d == 'left':
            px += L(10, 15, 12, 11, STEEL) if phase == 0 else L(5, 18, 0, 18, STEEL) + [(1, 17, '#e8f6ff'), (2, 19, '#e8f6ff')]
        else:
            px += L(6, 12, 5, 8, STEEL) + L(17, 12, 18, 8, STEEL) if phase == 0 else L(8, 6, 8, 1, STEEL) + L(15, 6, 15, 1, STEEL)
    elif kind == 'book':
        G1, G2 = '#e9a8ff', '#b04cf0'
        if d == 'down':
            pts = [(12, 9), (10, 7), (14, 6), (11, 4)] if phase == 0 else [(6, 22), (9, 23), (13, 22), (17, 23), (11, 20), (4, 20), (19, 20)]
        elif d == 'left':
            pts = [(8, 9), (6, 7), (9, 5)] if phase == 0 else [(0, 17), (1, 15), (2, 19), (0, 13), (3, 21), (1, 21)]
        else:
            pts = [(12, 4), (9, 2), (15, 3)] if phase == 0 else [(8, 0), (12, 1), (16, 0), (10, 3), (14, 3)]
        for i, (x, y) in enumerate(pts): px.append((x, y, G1 if i % 2 == 0 else G2))
        return px, True
    return px, False

WEAPON = {'spearman': 'spear', 'rogue': 'daggers', 'mage': 'book', 'warrior': 'sword'}

def outline_layer(px, glow):
    im = Image.new('RGBA', (CW, CH))
    S = {}
    for (x, y, c) in px:
        if 0 <= x < CW and 0 <= y < CH: S[(x, y)] = hx(c)
    if not glow:
        for (x, y) in list(S):
            for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                q = (x + dx, y + dy)
                if q not in S and 0 <= q[0] < CW and 0 <= q[1] < CH: im.putpixel(q, (22, 16, 30, 255))
    for (x, y), c in S.items(): im.putpixel((x, y), c)
    return im

def cell(key, d, f):
    c = A.CHARS[key]
    leg = {0: 0, 1: 1, 2: 2, 3: 1, 4: 1, 5: 0}[f]
    fig = figure(c, d, leg, breathe=(f == 3))
    im = Image.new('RGBA', (CW, CH))
    w = WEAPON.get(key)
    lay = None
    if w and f in (4, 5):
        px, glow = weapon(w, d, f - 4)
        lay = outline_layer(px, glow)
    if lay and d == 'up' and w != 'book': im.alpha_composite(lay)
    im.alpha_composite(fig, (FX, FY + (1 if f == 5 and d == 'down' else 0) if False else FY))
    if lay and not (d == 'up' and w != 'book'): im.alpha_composite(lay)
    return im

def build():
    atlas = Image.new('RGBA', (CW * 24, CH * len(ROWS)))
    for r, key in enumerate(ROWS):
        for di, d in enumerate(['down', 'left', 'right', 'up']):
            for f in range(6):
                src = 'left' if d == 'right' else d
                im = cell(key, src, f)
                if d == 'right': im = im.transpose(Image.FLIP_LEFT_RIGHT)
                atlas.paste(im, ((di * 6 + f) * CW, r * CH))
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    atlas.save(OUT)
    os.makedirs(PREV, exist_ok=True)
    bg = Image.new('RGBA', atlas.size, (58, 74, 52, 255)); bg.alpha_composite(atlas)
    bg.resize((atlas.width * 4, atlas.height * 4), Image.NEAREST).save(os.path.join(PREV, 'chars_atlas_x4.png'))
    print('chars atlas', atlas.size, '→', OUT)
    return atlas

if __name__ == '__main__':
    build()
