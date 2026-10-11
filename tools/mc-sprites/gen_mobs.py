#!/usr/bin/env python3
"""Генератор пиксель-арт атласа врагов «Проклятых» (2.5D-билборды).

Стиль подогнан под спрайты проекта (character_*_frame16x20.png): чистые пиксели без сглаживания,
1px тёмный контур, 3 тона на цвет (свет сверху-слева), ограниченная палитра.
Атлас: ячейка 48×48, строка = тип врага, 12 колонок:
  0–3 ходьба/полёт, 4–6 атака (замах → удар), 7 «получил урон», 8–11 смерть (распад архива).
Запуск: python3 tools/mc-sprites/gen_mobs.py  → src/assets/mc/mobs_atlas.png + mobs_atlas.json
"""
import json, math, os, random
from PIL import Image

CELL = 48
COLS = 12
OUT = os.path.join(os.path.dirname(__file__), '..', '..', 'src', 'assets', 'mc')
OUTLINE = (20, 12, 28, 255)

def hexc(h, a=255):
    h = h.lstrip('#'); return (int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16), a)
def shade(c, k):
    return tuple(max(0, min(255, int(v * k))) for v in c[:3]) + (c[3],)

class Canvas:
    OY = 0
    def __init__(self):
        self.im = Image.new('RGBA', (CELL, CELL), (0, 0, 0, 0)); self.px = self.im.load(); self.oy = Canvas.OY
    def put(self, x, y, c):
        x, y = int(round(x)), int(round(y + self.oy))
        if 0 <= x < CELL and 0 <= y < CELL: self.px[x, y] = c
    def rect(self, x0, y0, x1, y1, c):
        for y in range(int(y0), int(y1) + 1):
            for x in range(int(x0), int(x1) + 1): self.put(x, y, c)
    def ellipse(self, cx, cy, rx, ry, c):
        for y in range(int(cy - ry) - 1, int(cy + ry) + 2):
            for x in range(int(cx - rx) - 1, int(cx + rx) + 2):
                if rx > 0 and ry > 0 and ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1.0: self.put(x, y, c)
    def line(self, x0, y0, x1, y1, c, w=1):
        n = int(max(abs(x1 - x0), abs(y1 - y0))) + 1
        for i in range(n + 1):
            t = i / max(1, n); x = x0 + (x1 - x0) * t; y = y0 + (y1 - y0) * t
            if w <= 1: self.put(x, y, c)
            else: self.ellipse(x, y, w / 2, w / 2, c)
    def poly(self, pts, c):
        ys = [p[1] for p in pts]
        for y in range(int(min(ys)), int(max(ys)) + 1):
            xs = []
            for i in range(len(pts)):
                (x0, y0), (x1, y1) = pts[i], pts[(i + 1) % len(pts)]
                if (y0 <= y + 0.5 < y1) or (y1 <= y + 0.5 < y0):
                    xs.append(x0 + (y + 0.5 - y0) / (y1 - y0) * (x1 - x0))
            xs.sort()
            for i in range(0, len(xs) - 1, 2):
                for x in range(int(math.ceil(xs[i] - 0.5)), int(math.floor(xs[i + 1] - 0.5)) + 1): self.put(x, y, c)
    def finish(self, light=True, outline=True):
        im = self.im; px = self.px
        src = im.copy(); sp = src.load()
        if light:
            for y in range(CELL):
                for x in range(CELL):
                    c = sp[x, y]
                    if c[3] < 200 or c == OUTLINE or c[3] == 254: continue
                    up = sp[x, y - 1] if y > 0 else (0, 0, 0, 0)
                    dn = sp[x, y + 1] if y < CELL - 1 else (0, 0, 0, 0)
                    lf = sp[x - 1, y] if x > 0 else (0, 0, 0, 0)
                    if up[3] < 100 or lf[3] < 100: px[x, y] = shade(c, 1.28)
                    elif dn[3] < 100: px[x, y] = shade(c, 0.66)
        if outline:
            src = im.copy(); sp = src.load()
            for y in range(CELL):
                for x in range(CELL):
                    if sp[x, y][3] > 60: continue
                    for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                        nx, ny = x + dx, y + dy
                        if 0 <= nx < CELL and 0 <= ny < CELL and sp[nx, ny][3] > 60 and sp[nx, ny][3] != 254:
                            px[x, y] = OUTLINE; break
        return im

def glow(c, a=254):  # пиксели «свечения» — без контура/затенения (альфа 254 — маркер)
    return c[:3] + (a,)

# ---------------- рисовальщики ----------------
# phase: ('walk', i) ('atk', i) ('hit', 0) ('die', i); каждый возвращает Canvas

def bob(kind, i):
    return [0, -1, 0, 1][i] if kind == 'walk' else 0

def draw_imp(kind, i):
    cv = Canvas(); red = hexc('#c2410c'); dark = hexc('#7c2d12'); horn = hexc('#fde68a'); eye = hexc('#fef08a')
    b = bob(kind, i); lean = {'atk': [1, 2, -1][i] if kind == 'atk' else 0, 'hit': -2}.get(kind, 0)
    by = 31 + b
    # хвост
    cv.line(17, by + 6, 10, by + 2, dark, 2); cv.put(9, by + 1, horn)
    # ноги
    s = [0, 2, 0, -2][i] if kind == 'walk' else 0
    cv.rect(20 + s, by + 6, 22 + s, 44, dark); cv.rect(26 - s, by + 6, 28 - s, 44, dark)
    cv.ellipse(24 + lean, by + 2, 7, 7, red)           # тело
    cv.ellipse(24 + lean * 1.5, by - 9, 7, 6, red)      # голова
    cv.poly([(18 + lean, by - 13), (16 + lean, by - 20), (21 + lean, by - 14)], horn)
    cv.poly([(30 + lean, by - 13), (32 + lean, by - 20), (27 + lean, by - 14)], horn)
    cv.put(22 + lean * 1.5, by - 9, glow(eye)); cv.put(27 + lean * 1.5, by - 9, glow(eye))
    arm = (36, by - 2) if kind == 'atk' and i == 1 else (33, by + 4)
    cv.line(29 + lean, by, arm[0] + lean, arm[1], red, 2)
    if kind == 'atk' and i == 1:
        for k in range(3): cv.line(arm[0] + 2, arm[1] - 3 + k * 3, arm[0] + 6, arm[1] - 5 + k * 3, glow(hexc('#fff7ed')))
    return cv

def draw_bat(kind, i):
    cv = Canvas(); body = hexc('#5b21b6'); wing = hexc('#7c3aed'); eye = hexc('#f43f5e')
    fl = [0, 1, 2, 1][i] if kind in ('walk', 'atk') else 1
    cy = 22 + [0, -1, 0, 1][i] if kind == 'walk' else 22
    wy = [-8, 0, 6][fl]
    for sgn in (-1, 1):
        cv.poly([(24 + sgn * 4, cy - 2), (24 + sgn * 19, cy + wy - 4), (24 + sgn * 16, cy + wy + 3), (24 + sgn * 11, cy + wy), (24 + sgn * 7, cy + 4)], wing)
    cv.ellipse(24, cy, 5, 6, body)
    cv.poly([(20, cy - 5), (19, cy - 10), (22, cy - 6)], body); cv.poly([(28, cy - 5), (29, cy - 10), (26, cy - 6)], body)
    cv.put(22, cy - 1, glow(eye)); cv.put(26, cy - 1, glow(eye))
    if kind == 'atk' and i >= 1: cv.rect(23, cy + 4, 25, cy + 6, glow(hexc('#fecdd3')))
    return cv

def draw_ghoul(kind, i):
    cv = Canvas(); skin = hexc('#6b8f71'); rag = hexc('#44403c'); eye = hexc('#bef264')
    b = bob(kind, i); s = [0, 2, 0, -2][i] if kind == 'walk' else 0
    hit = -2 if kind == 'hit' else 0
    cv.rect(19 + s, 36, 21 + s, 45, skin); cv.rect(27 - s, 36, 29 - s, 45, skin)
    cv.poly([(16 + hit, 37 + b), (32 + hit, 37 + b), (30 + hit, 22 + b), (18 + hit, 22 + b)], rag)
    cv.ellipse(25 + hit, 17 + b, 7, 6, skin)     # голова вперёд (сутулость)
    cv.put(23 + hit, 17 + b, glow(eye)); cv.put(28 + hit, 17 + b, glow(eye))
    cv.rect(23 + hit, 20 + b, 28 + hit, 21 + b, hexc('#1c1917'))
    reach = [0, 6, 10][i] if kind == 'atk' else 0
    cv.line(18 + hit, 25 + b, 13 + hit + reach * 0.3, 36 + b - reach, skin, 2)
    cv.line(31 + hit, 25 + b, 35 + hit + reach, 35 + b - reach, skin, 2)
    if kind == 'atk' and i == 2:
        for k in range(3): cv.line(37 + reach, 27 + k * 2 - reach // 2, 40 + reach, 24 + k * 2 - reach // 2, glow(hexc('#ecfccb')))
    return cv

def draw_spitter(kind, i):
    cv = Canvas(); g = hexc('#4d7c0f'); belly = hexc('#a3e635'); eye = hexc('#fef9c3')
    sq = [0, 1, 0, -1][i] if kind == 'walk' else (2 if kind == 'atk' and i == 0 else 0)
    cv.ellipse(24, 34 - sq, 13 + sq, 10 - sq, g)
    cv.ellipse(24, 37 - sq, 8, 5, belly)
    cv.ellipse(30, 26 - sq, 6, 6, g)
    cv.put(31, 24 - sq, glow(eye)); cv.put(33, 25 - sq, glow(eye))
    mouth = 2 + (i if kind == 'atk' else 0)
    cv.ellipse(35, 28 - sq, 2, mouth, hexc('#1a2e05'))
    if kind == 'atk' and i == 2:
        cv.ellipse(41, 27, 3, 3, glow(hexc('#bef264'))); cv.put(44, 25, glow(hexc('#d9f99d')))
    for k in range(3): cv.put(16 + k * 4, 26 - sq + (k % 2), hexc('#365314'))
    return cv

def draw_golem(kind, i):
    cv = Canvas(); rock = hexc('#57534e'); dark = hexc('#292524'); ember = hexc('#fb923c')
    b = bob(kind, i); s = [0, 2, 0, -2][i] if kind == 'walk' else 0
    cv.rect(15 + s, 36, 21 + s, 45, rock); cv.rect(27 - s, 36, 33 - s, 45, rock)
    cv.poly([(10, 36 + b), (38, 36 + b), (40, 18 + b), (24, 12 + b), (8, 18 + b)], rock)
    cv.rect(19, 6 + b, 29, 13 + b, rock)
    cv.rect(21, 9 + b, 22, 10 + b, glow(ember)); cv.rect(26, 9 + b, 27, 10 + b, glow(ember))
    for (x0, y0, x1, y1) in ((14, 22, 19, 30), (30, 20, 26, 28), (22, 30, 25, 34)):
        cv.line(x0, y0 + b, x1, y1 + b, glow(ember))
    up = [0, -8, 4][i] if kind == 'atk' else 0
    cv.rect(4, 20 + b + up, 9, 34 + b + up, rock); cv.rect(39, 20 + b + up, 44, 34 + b + up, rock)
    if kind == 'atk' and i == 2:
        for k in range(5): cv.put(6 + k * 9, 46, glow(ember))
    return cv

def draw_warden(kind, i):
    cv = Canvas(); armor = hexc('#3f3f46'); trim = hexc('#a855f7'); cape = hexc('#7f1d1d'); eye = hexc('#f0abfc')
    b = bob(kind, i); s = [0, 1, 0, -1][i] if kind == 'walk' else 0
    cv.poly([(12, 42), (36, 42), (32, 16 + b), (16, 16 + b)], cape)
    cv.rect(17 + s, 34, 22 + s, 43, armor); cv.rect(26 - s, 34, 31 - s, 43, armor)
    cv.poly([(13, 36 + b), (35, 36 + b), (36, 16 + b), (12, 16 + b)], armor)
    cv.line(24, 17 + b, 24, 35 + b, glow(trim))
    cv.ellipse(24, 10 + b, 7, 7, armor)
    cv.poly([(17, 7 + b), (10, -1 + b), (19, 4 + b)], hexc('#d4d4d8')); cv.poly([(31, 7 + b), (38, -1 + b), (29, 4 + b)], hexc('#d4d4d8'))
    cv.rect(20, 10 + b, 28, 11 + b, glow(eye))
    swing = [-10, -4, 12][i] if kind == 'atk' else 0
    cv.line(37, 22 + b, 43, 8 + b + swing, hexc('#d4d4d8'), 2)
    cv.line(37, 22 + b, 43, 8 + b + swing, glow(trim))
    return cv

def draw_blade_fly(kind, i):
    """Мошкара-Жнец: муха с лезвиями на лапках, большие красные фасеточные глаза, радужные крылья."""
    cv = Canvas(); body = hexc('#155e63'); shell = hexc('#0e7490'); eye = hexc('#e11d48'); blade = hexc('#e2e8f0'); wing = hexc('#a5f3fc', 160)
    hov = [0, -2, -1, 1][i] if kind == 'walk' else (-1 if kind == 'atk' else 0)
    cy = 24 + hov
    flap = i % 2 == 0
    # крылья (полупрозрачные, без контура)
    for sgn in (-1, 1):
        wy = -9 if flap else -4
        cv.poly([(24 + sgn * 3, cy - 3), (24 + sgn * 16, cy + wy), (24 + sgn * 18, cy + wy + 5), (24 + sgn * 6, cy + 2)], glow(wing, 150))
    # лапки-лезвия: 3 пары
    spread = [0, 4, 8][i] if kind == 'atk' else 0
    for k, dy in enumerate((2, 5, 8)):
        for sgn in (-1, 1):
            x0, y0 = 24 + sgn * 4, cy + dy
            x1, y1 = 24 + sgn * (9 + spread + k), cy + dy + 7 - (spread if kind == 'atk' and k == 0 else 0)
            cv.line(x0, y0, x1, y1, hexc('#334155'))
            cv.line(x1, y1, x1 + sgn * 3, y1 + 4, blade)
    cv.ellipse(24, cy + 8, 5, 7, body)           # брюшко
    cv.ellipse(24, cy + 1, 6, 5, shell)          # грудь
    cv.ellipse(24, cy - 5, 5, 4, body)           # голова
    cv.ellipse(20, cy - 6, 3, 3, glow(eye)); cv.ellipse(28, cy - 6, 3, 3, glow(eye))
    cv.put(19, cy - 7, glow(hexc('#fecdd3'))); cv.put(27, cy - 7, glow(hexc('#fecdd3')))
    if kind == 'atk' and i == 2:
        for k in range(4): cv.line(8 + k * 9, 44, 12 + k * 9, 40, glow(hexc('#f8fafc')))
    return cv

def draw_dream_moth(kind, i):
    cv = Canvas(); wing = hexc('#c4b5fd'); body = hexc('#e9d5ff'); spot = hexc('#7c3aed'); eye = hexc('#1e1b4b')
    fl = [0, 1, 2, 1][i] if kind != 'die' else 1
    cy = 23 + [0, -1, -2, -1][i] if kind == 'walk' else 23
    span = [17, 14, 9][fl]
    for sgn in (-1, 1):
        cv.poly([(24 + sgn * 2, cy - 3), (24 + sgn * span, cy - 12 + fl * 2), (24 + sgn * (span + 2), cy - 1), (24 + sgn * 3, cy + 2)], wing)
        cv.poly([(24 + sgn * 2, cy + 1), (24 + sgn * (span - 3), cy + 10), (24 + sgn * 4, cy + 7)], shade(wing, 0.85))
        cv.ellipse(24 + sgn * (span * 0.6), cy - 5 + fl, 2, 2, glow(spot))
    cv.ellipse(24, cy + 2, 3, 7, body)
    cv.line(22, cy - 5, 18, cy - 11, body); cv.line(26, cy - 5, 30, cy - 11, body)
    cv.put(23, cy - 4, eye); cv.put(25, cy - 4, eye)
    if kind == 'atk' and i >= 1:
        rnd = random.Random(i)
        for _ in range(10): cv.put(24 + rnd.randint(-14, 14), cy + 8 + rnd.randint(0, 12), glow(hexc('#f5d0fe', 200)))
    return cv

def draw_rot_glitch(kind, i):
    cv = Canvas(); g = hexc('#65a30d'); hi = hexc('#bef264'); eye = hexc('#ecfccb')
    sq = [0, 2, 0, -2][i] if kind == 'walk' else (3 if kind == 'atk' and i == 1 else 0)
    cv.ellipse(24, 37 - sq / 2, 13 + sq, 9 - sq / 2, g)
    cv.ellipse(24, 30 - sq, 8, 7, g)
    cv.put(21, 29 - sq, glow(eye)); cv.put(27, 29 - sq, glow(eye))
    rnd = random.Random(7 + i)
    for _ in range(5):
        x = rnd.randint(12, 34); y = rnd.randint(24, 42)
        cv.rect(x, y, x + 2, y + 1, glow(hexc(rnd.choice(['#22d3ee', '#f0abfc', '#bef264']))))
    if kind == 'atk' and i == 2:
        cv.ellipse(24, 44, 16, 3, glow(hexc('#84cc16', 200)))
    return cv

def draw_moon_sentinel(kind, i):
    cv = Canvas(); robe = hexc('#4c1d95'); dark = hexc('#2e1065'); moon = hexc('#e9d5ff'); glowc = hexc('#c084fc')
    b = bob(kind, i)
    cv.poly([(10, 43), (38, 43), (32, 14 + b), (16, 14 + b)], robe)
    cv.poly([(14, 43), (24, 30 + b), (34, 43)], dark)
    cv.ellipse(24, 10 + b, 6, 6, dark)
    # голова-полумесяц
    cv.ellipse(24, 3 + b, 8, 7, glow(moon)); cv.ellipse(27, 1 + b, 7, 6, (0, 0, 0, 0))
    cv.rect(21, 10 + b, 22, 11 + b, glow(glowc)); cv.rect(26, 10 + b, 27, 11 + b, glow(glowc))
    swing = [-12, -6, 14][i] if kind == 'atk' else 0
    cv.line(34, 22 + b, 45, 6 + b + swing, glow(glowc), 2)
    cv.line(12, 22 + b, 5, 32 + b, robe, 3)
    return cv

def humanoid(hair, skin, top, bottom, accent, long_hair=False, hat=None, extra=None):
    """Пиксельный NPC 48×48 (чиби, как герои): idle-дыхание в кадрах 0–3, «жест» в 4–6."""
    def draw(kind, i):
        cv = Canvas(); b = [0, 0, -1, -1][i] if kind == 'walk' else 0
        cv.rect(19, 36, 22, 45, bottom); cv.rect(26, 36, 29, 45, bottom)
        cv.rect(18, 45, 22, 46, hexc('#1f1720')); cv.rect(26, 45, 30, 46, hexc('#1f1720'))
        cv.poly([(16, 37 + b), (32, 37 + b), (31, 23 + b), (17, 23 + b)], top)
        cv.line(24, 24 + b, 24, 36 + b, accent)
        arm = -6 if kind == 'atk' else 0
        cv.line(17, 25 + b, 14, 35 + b + arm, top, 3); cv.line(31, 25 + b, 34 + (4 if kind == 'atk' else 0), 35 + b + arm * 2, top, 3)
        cv.ellipse(14, 36 + b + arm, 1.5, 1.5, skin); cv.ellipse(34 + (4 if kind == 'atk' else 0), 36 + b + arm * 2, 1.5, 1.5, skin)
        if long_hair: cv.poly([(15, 12 + b), (33, 12 + b), (34, 30 + b), (14, 30 + b)], hair)
        cv.ellipse(24, 15 + b, 9, 9, skin)
        cv.poly([(14, 15 + b), (16, 6 + b), (24, 3 + b), (32, 6 + b), (34, 15 + b), (30, 10 + b), (18, 10 + b)], hair)
        cv.put(20, 16 + b, hexc('#1e1b2e')); cv.put(28, 16 + b, hexc('#1e1b2e'))
        cv.put(21, 16 + b, glow(hexc('#ffffff'))); cv.put(29, 16 + b, glow(hexc('#ffffff')))
        cv.rect(23, 20 + b, 25, 20 + b, shade(skin, 0.75))
        if hat: hat(cv, b)
        if extra: extra(cv, b, kind, i)
        return cv
    return draw

def _alzi_extra(cv, b, kind, i):  # наушники-«гул серверов» и светящийся шнур
    cv.ellipse(15, 15 + b, 2, 3, hexc('#334155')); cv.ellipse(33, 15 + b, 2, 3, hexc('#334155'))
    cv.line(15, 18 + b, 18, 30 + b, glow(hexc('#22d3ee')))
def _leyr_extra(cv, b, kind, i):  # фиалка в волосах
    cv.ellipse(31, 8 + b, 2, 2, glow(hexc('#a855f7'))); cv.put(31, 8 + b, glow(hexc('#fde68a')))
def _petr_hat(cv, b):
    cv.rect(15, 4 + b, 33, 7 + b, hexc('#78350f')); cv.rect(18, 0 + b, 30, 4 + b, hexc('#92400e'))
def _petr_extra(cv, b, kind, i):  # молот ремесленника
    cv.line(36, 24 + b, 40, 40 + b, hexc('#78350f'), 2); cv.rect(37, 21 + b, 43, 25 + b, hexc('#94a3b8'))
def _kyut_extra(cv, b, kind, i):  # зеркальный клинок
    cv.line(10, 38 + b, 6, 22 + b, glow(hexc('#f9a8d4')), 2)

DRAW_NPC = {
    'alzi': humanoid(hexc('#1f2937'), hexc('#f1c9a5'), hexc('#334155'), hexc('#1e293b'), glow(hexc('#22d3ee')), extra=_alzi_extra),
    'leyr': humanoid(hexc('#7c2d12'), hexc('#f5d0b5'), hexc('#7e22ce'), hexc('#581c87'), glow(hexc('#f0abfc')), long_hair=True, extra=_leyr_extra),
    'petr': humanoid(hexc('#a16207'), hexc('#e8b892'), hexc('#854d0e'), hexc('#3f2a12'), hexc('#fbbf24'), hat=_petr_hat, extra=_petr_extra),
    'kyut': humanoid(hexc('#f9a8d4'), hexc('#f5d0b5'), hexc('#be185d'), hexc('#500724'), glow(hexc('#fbcfe8')), long_hair=True, extra=_kyut_extra),
}

DRAW = {
    'imp': draw_imp, 'bat': draw_bat, 'ghoul': draw_ghoul, 'spitter': draw_spitter, 'golem': draw_golem,
    'warden': draw_warden, 'blade_fly': draw_blade_fly, 'dream_moth': draw_dream_moth, 'rot_glitch': draw_rot_glitch, 'moon_sentinel': draw_moon_sentinel,
}
DRAW.update(DRAW_NPC)

def frame(draw, col):
    Canvas.OY = 4 if draw in (draw_warden, draw_moon_sentinel) else 0
    if col < 4: cv = draw('walk', col)
    elif col < 7: cv = draw('atk', col - 4)
    elif col == 7: cv = draw('hit', 0)
    else: cv = draw('walk', 1)
    im = cv.finish()
    if col == 7:  # отдача: сдвиг назад
        im2 = Image.new('RGBA', im.size, (0, 0, 0, 0)); im2.paste(im, (-2, 1)); im = im2
    if col >= 8:  # распад архива: сплющивание + «пиксели уходят вверх»
        k = col - 8
        w, h = im.size
        sq = im.resize((w, max(2, int(h * (1 - 0.18 * (k + 1))))), Image.NEAREST)
        out = Image.new('RGBA', im.size, (0, 0, 0, 0)); out.paste(sq, (0, h - sq.size[1]))
        px = out.load(); rnd = random.Random(col)
        for y in range(h):
            for x in range(w):
                if px[x, y][3] > 0 and rnd.random() < 0.22 * (k + 1):
                    c = px[x, y]; px[x, y] = (0, 0, 0, 0)
                    ny = y - rnd.randint(2, 6 + k * 3)
                    if 0 <= ny < h and rnd.random() < 0.5: px[x, ny] = (min(255, c[0] + 80), min(255, c[1] + 80), min(255, c[2] + 80), 254)
        im = out
    return im

def main():
    os.makedirs(OUT, exist_ok=True)
    types = list(DRAW.keys())
    atlas = Image.new('RGBA', (CELL * COLS, CELL * len(types)), (0, 0, 0, 0))
    for r, t in enumerate(types):
        for c in range(COLS):
            atlas.paste(frame(DRAW[t], c), (c * CELL, r * CELL))
    # альфа 254 (маркер свечения) → 255; полупрозрачные крылья остаются
    px = atlas.load()
    for y in range(atlas.size[1]):
        for x in range(atlas.size[0]):
            if px[x, y][3] == 254: px[x, y] = px[x, y][:3] + (255,)
    atlas.save(os.path.join(OUT, 'mobs_atlas.png'))
    meta = {'cell': CELL, 'cols': COLS, 'rows': types, 'anims': {'walk': [0, 4], 'atk': [4, 3], 'hit': [7, 1], 'die': [8, 4]}}
    json.dump(meta, open(os.path.join(OUT, 'mobs_atlas.json'), 'w'), ensure_ascii=False, indent=1)
    big = atlas.resize((atlas.size[0] * 3, atlas.size[1] * 3), Image.NEAREST)
    bg = Image.new('RGBA', big.size, (34, 28, 44, 255)); bg.alpha_composite(big)
    os.makedirs('/workspace/morrisgrad-round2/sprites', exist_ok=True)
    bg.save('/workspace/morrisgrad-round2/sprites/mobs_atlas_x3.png')
    print('ok', atlas.size, types)

if __name__ == '__main__':
    main()
