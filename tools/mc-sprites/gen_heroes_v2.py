#!/usr/bin/env python3
"""Герои «Проклятых» v2 — ручной пиксель-арт (без пикселизации рендеров).

Ячейка 48×60, строка = герой (spearman=Нофорд, rogue=Кавега, mage=Мариэль, warrior=Велес),
24 колонки = 4 направления (вниз, влево, вправо, вверх) × 6 кадров:
  0 шаг A, 1 стойка, 2 шаг B, 3 «вдох» (idle), 4 замах, 5 удар.
Выход: src/assets/mc/heroes_atlas.png (+ превью в /workspace/morrisgrad-round2/sprites/).
"""
import os, sys, math
from PIL import Image
sys.path.insert(0, os.path.dirname(__file__))
from pixkit import Sprite, Mat, hexc, mirror, ramp

W, H = 48, 60
FR = 6
OUT = os.path.join(os.path.dirname(__file__), '..', '..', 'src', 'assets', 'mc')
PREV = '/workspace/morrisgrad-round2/sprites'
IDS = ['spearman', 'rogue', 'mage', 'warrior']

SKIN = Mat('#f3d2bd'); SKIN_F = Mat('#f3d2bd', rim=False)
DARK = (26, 16, 36, 255)

SPEC = {
  'spearman': dict(name='Нофорд', hair='#eceef4', streak='#17151c', eye='#3b82f6', top='#f4f4f6', trim='#22c55e',
                   legs='#e9e4dc', boots='#9c8f84', weapon='spear'),
  'rogue': dict(name='Кавега', hair='#4a2622', streak='#c0262d', eye='#e0a030', top='#1c1b22', coat='#24232b', trim='#3a3944',
                legs='#16151b', boots='#0f0e13', weapon='daggers', mask=True),
  'mage': dict(name='Мариэль', hair='#c0163f', streak='#ff4f7a', eye='#ef4444', top='#f7f6fb', trim='#8b3fe0',
               legs='#f3d2bd', boots='#f4f3f8', weapon='book', skirt=True, choker=True),
  'warrior': dict(name='Велес', hair='#d8d2c0', streak='#a8a08a', eye='#5f8f5a', top='#1f6a3a', trim='#f1f5f9',
                  legs='#1f6a3a', boots='#141218', weapon='sword', gloves='#26222a', buckle='#f5c542'),
}

def mats(s):
    m = {k: Mat(v) for k, v in s.items() if isinstance(v, str) and v.startswith('#')}
    m['trimg'] = Mat(s['trim'], rim=False, flat=True)
    m['hairhi'] = Mat(s['streak'], rim=False, flat=True)
    return m

# ---------------- позы ----------------
def pose(f):
    """→ bob, шаг (−1..1: какая нога впереди), взмах рук, вдох, атака (0/1/2)"""
    return {
        0: (0, 1, 1, 0, 0), 1: (-1, 0, 0, 0, 0), 2: (0, -1, -1, 0, 0),
        3: (1, 0, 0, 1, 0), 4: (0, 0, 0, 0, 1), 5: (0, 0.6, 0, 0, 2),
    }[f]

# ---------------- вид спереди / сзади ----------------
def front(sp, s, M, f, back=False):
    b, step, swing, br, atk = pose(f)
    hid = s['weapon']
    # ноги
    for side, sx in ((-1, 21), (1, 27)):
        lift = 2 if (step * side) > 0.5 else 0
        fx = sx + side * 0.5
        sp.limb(sx, 36 + b, fx, 48 - lift, 2.6, M['legs'], r1=2.0)
        if s.get('skirt'):
            sp.limb(fx, 44 - lift, fx, 49 - lift, 1.9, SKIN)   # колено
        sp.limb(fx, 47 - lift, fx, 55 - lift, 2.1, M['boots'], r1=2.0)
        sp.ellipse(fx + side * 0.6, 56.5 - lift, 2.6, 1.6, M['boots'])
        if s['weapon'] == 'sword':  # высокие сапоги — блик по голенищу
            sp.line(fx - 1, 48 - lift, fx - 1, 54 - lift, ramp(s['boots'])[3] + (255,))
    # плащ/тренч сзади (полы)
    if s.get('coat'):
        flow = [2, 0, -2, 0, -1, 3][f]
        sp.poly([(16, 24 + b), (32, 24 + b), (34 + flow * 0.5, 52), (28, 51 + abs(flow)), (24, 47 + b), (20, 51 + abs(flow)), (14 + flow * 0.5, 52)], M['coat'])
    # корпус
    sh = 23 + b + br
    sp.poly([(16.5, sh), (31.5, sh), (29.5, 37 + b), (18.5, 37 + b)], M['top'])
    if s.get('skirt'):
        sp.poly([(18, 34 + b), (30, 34 + b), (33, 44 + b), (15, 44 + b)], M['top'])
        sp.line(15, 44 + b, 33, 44 + b, M['trimg'].r[2] + (255,))
        sp.line(16, 43 + b, 32, 43 + b, M['trimg'].r[3] + (255,))
    if s.get('coat') and not back:
        # распахнутые полы + воротник
        sp.poly([(16, sh), (21, sh), (22, 37 + b), (20, 50), (15, 51)], M['coat'])
        sp.poly([(27, sh), (32, sh), (33, 51), (28, 50), (26, 37 + b)], M['coat'])
        sp.poly([(17, sh - 2), (21, sh - 1), (23, sh + 6), (19, sh + 3)], M['trim'])
        sp.poly([(31, sh - 2), (27, sh - 1), (25, sh + 6), (29, sh + 3)], M['trim'])
        sp.line(22, 38 + b, 26, 38 + b, (60, 58, 70, 255))  # ремень
    if not back:
        if hid == 'spear':
            # распахнутая белая рубашка: V-вырез с кожей, зелёный кант, кулон
            sp.poly([(22, sh), (26, sh), (24.5, 31 + b), (23.5, 31 + b)], SKIN_F)
            sp.line(22, sh, 23.5, 31 + b, M['trimg'].r[2] + (255,)); sp.line(26, sh, 24.5, 31 + b, M['trimg'].r[2] + (255,))
            sp.line(18, sh + 1, 18.5, 36 + b, M['trimg'].r[2] + (255,)); sp.line(30, sh + 1, 29.5, 36 + b, M['trimg'].r[2] + (255,))
            sp.line(23, sh + 1, 24, sh + 4, (40, 40, 50, 255))
            sp.px(24, sh + 5, (34, 197, 94, 255), glow=True); sp.px(24, sh + 4, (187, 247, 208, 255), glow=True)
            sp.line(19, 36 + b, 29, 36 + b, ramp(s['legs'])[1] + (255,))
        elif hid == 'book':
            # белый жакет: фиолетовый кант по борту, лацканы
            sp.line(24, sh + 1, 24, 36 + b, M['trimg'].r[2] + (255,))
            sp.line(20, sh, 23, sh + 5, M['trimg'].r[2] + (255,)); sp.line(28, sh, 25, sh + 5, M['trimg'].r[2] + (255,))
            sp.line(19, 34 + b, 29, 34 + b, M['trimg'].r[1] + (255,))
            for yy in (sh + 6, sh + 9): sp.px(25, yy, (233, 213, 255, 255))
        elif hid == 'sword':
            # мундир: белые канты, ряд пуговиц, золотая пряжка
            sp.line(24, sh + 1, 24, 36 + b, M['trimg'].r[2] + (255,))
            sp.line(19, sh, 23, sh + 1, M['trimg'].r[2] + (255,)); sp.line(29, sh, 25, sh + 1, M['trimg'].r[2] + (255,))
            for yy in (sh + 3, sh + 6, sh + 9): sp.px(25.5, yy, (245, 197, 66, 255))
            sp.rect(18.5, 33 + b, 29.5, 34 + b, Mat('#141218', rim=False))
            sp.rect(22.5, 32.5 + b, 25.5, 34.5 + b, Mat(s['buckle'], rim=False), tone=3)
            sp.px(24, 33 + b, (255, 248, 200, 255))
            sp.line(17, 37 + b, 17, 45 + b, M['trimg'].r[2] + (255,)) if False else None
    else:
        if s.get('coat'):
            sp.poly([(16, sh), (32, sh), (34, 52), (14, 52)], M['coat'])
            sp.line(24, 38 + b, 24, 52, ramp(s['coat'])[0] + (255,))
            sp.poly([(17, sh - 2), (31, sh - 2), (30, sh + 2), (18, sh + 2)], M['trim'])
        if hid == 'sword':
            sp.line(17, sh + 1, 31, sh + 1, M['trimg'].r[2] + (255,))
            sp.rect(18.5, 33 + b, 29.5, 34 + b, Mat('#141218', rim=False))
        if hid == 'book':
            sp.line(24, sh + 2, 24, 34 + b, M['trimg'].r[1] + (255,))
    # руки
    arm_mat = M['coat'] if s.get('coat') else M['top']
    hand = Mat(s['gloves']) if s.get('gloves') else (Mat('#0f0e13') if s.get('mask') else SKIN)
    for side, shx in ((-1, 16.5), (1, 31.5)):
        hy = 36 + b + (swing * side * 1.0)
        hx = shx + side * 1.5
        if atk and side == 1 and not back:
            hy = [0, 30, 33][atk] + b; hx = [0, 35, 33][atk]
        if atk and side == -1 and hid == 'book' and not back:
            hy = 31 + b; hx = 15
        sp.limb(shx, sh + 1.5, hx, hy - 1, 2.0, arm_mat, r1=1.7)
        if s.get('trim') and hid in ('book', 'sword'):
            sp.line(hx - 1.5, hy - 2, hx + 1.5, hy - 2, M['trimg'].r[2] + (255,))
        sp.ellipse(hx, hy, 1.7, 1.7, hand)
        if side == -1: lh = (hx, hy)
        else: rh = (hx, hy)
    # голова
    hb = b + br
    if not back:
        sp.limb(24, 19 + hb, 24, 23 + hb, 2.0, SKIN)
        # волосы сзади (длинные — у Мариэль)
        if hid == 'book':
            sp.poly([(15.5, 10 + hb), (32.5, 10 + hb), (33, 25 + hb), (29, 23 + hb), (19, 23 + hb), (15, 25 + hb)], M['hair'])
        sp.ellipse(24, 13 + hb, 7.2, 7.6, SKIN, bias=0.35)
        # лицо
        if s.get('mask'):
            sp.poly([(17.5, 15.5 + hb), (30.5, 15.5 + hb), (29, 20 + hb), (24, 21.5 + hb), (19, 20 + hb)], Mat('#101015'))
            sp.line(18, 16 + hb, 30, 16 + hb, (60, 60, 72, 255))
        ey = 12 + hb
        sp.eye(19.5, ey, s['eye'], side=-1); sp.eye(26.5, ey, s['eye'], side=1)
        if not s.get('mask'):
            sp.px(24, 18 + hb, ramp('#f3d2bd')[1] + (255,))
            sp.px(18.5, 16 + hb, (246, 170, 170, 255)); sp.px(29.5, 16 + hb, (246, 170, 170, 255))
        if s.get('choker'):
            sp.line(22, 21 + hb, 26, 21 + hb, (20, 16, 26, 255)); sp.px(24, 22 + hb, (168, 85, 247, 255), glow=True)
        hair_front(sp, s, M, hb, 'front')
    else:
        sp.limb(24, 19 + hb, 24, 23 + hb, 2.0, SKIN)
        sp.ellipse(24, 13 + hb, 7.4, 7.8, M['hair'])
        hair_front(sp, s, M, hb, 'back')
    weapon(sp, s, M, f, 'back' if back else 'front', lh, rh, b)

def hair_front(sp, s, M, hb, view):
    hid = s['weapon']; H_ = M['hair']
    if view == 'front':
        if hid == 'spear':   # растрёпанная белая шевелюра + чёрная прядь
            sp.poly([(16, 14 + hb), (16.5, 6 + hb), (21, 3 + hb), (28, 3 + hb), (32, 7 + hb), (32, 14 + hb), (30, 9 + hb), (27, 12 + hb), (25, 8 + hb), (22, 12 + hb), (19, 9 + hb)], H_)
            sp.poly([(23, 4 + hb), (25.5, 4 + hb), (24.5, 12 + hb), (23, 11 + hb)], M['streak'])
            sp.px(18, 5 + hb, ramp(s['hair'])[4] + (255,)); sp.px(19, 4 + hb, ramp(s['hair'])[4] + (255,))
        elif hid == 'daggers':  # тёмно-каштановые с алыми прядями
            sp.poly([(16, 13 + hb), (17, 6 + hb), (22, 3.5 + hb), (29, 4 + hb), (32, 8 + hb), (32, 14 + hb), (29, 10 + hb), (26, 12 + hb), (22, 9 + hb), (19, 12 + hb)], H_)
            sp.line(20, 5 + hb, 18, 11 + hb, ramp(s['streak'])[2] + (255,)); sp.line(28, 5 + hb, 30, 11 + hb, ramp(s['streak'])[2] + (255,))
            sp.line(24, 4 + hb, 23, 9 + hb, ramp(s['streak'])[3] + (255,))
        elif hid == 'book':
            sp.poly([(16, 15 + hb), (16.5, 7 + hb), (21, 4 + hb), (28, 4 + hb), (31.5, 7 + hb), (32, 15 + hb), (29, 10 + hb), (25, 11 + hb), (22, 9 + hb), (19, 11 + hb)], H_)
            sp.px(20, 6 + hb, ramp(s['hair'])[4] + (255,)); sp.px(21, 5 + hb, ramp(s['hair'])[4] + (255,))
        else:  # Велес — зачёсанные назад
            sp.poly([(16.5, 11 + hb), (18, 5 + hb), (24, 3 + hb), (30, 5 + hb), (31.5, 11 + hb), (29, 8 + hb), (19, 8 + hb)], H_)
            sp.line(20, 5 + hb, 28, 5 + hb, ramp(s['hair'])[4] + (255,))
    else:
        if hid == 'spear': sp.poly([(23, 6 + hb), (25.5, 6 + hb), (25, 18 + hb), (23.5, 18 + hb)], M['streak'])
        if hid == 'book': sp.poly([(16, 10 + hb), (32, 10 + hb), (33, 26 + hb), (15, 26 + hb)], H_)
        if hid == 'daggers':
            sp.line(20, 8 + hb, 19, 18 + hb, ramp(s['streak'])[2] + (255,)); sp.line(27, 8 + hb, 28, 18 + hb, ramp(s['streak'])[2] + (255,))

def weapon(sp, s, M, f, view, lh, rh, b):
    w = s['weapon']; atk = pose(f)[4]
    if w == 'spear':
        shaft = Mat('#8a5a2b'); tip = Mat('#e6edf5')
        x, y = rh
        if atk == 2: sp.limb(x, y, x + 2, y + 14, 0.7, shaft); sp.poly([(x + 1, y + 14), (x + 3.5, y + 14), (x + 2.3, y + 20)], tip)
        else:
            top = y - 22 + (4 if atk == 1 else 0)
            sp.limb(x + 1, y + 6, x + 1, top, 0.7, shaft)
            sp.poly([(x - 0.5, top), (x + 2.5, top), (x + 1, top - 6)], tip)
            sp.px(x + 1, top + 1, (34, 197, 94, 255), glow=True)
    elif w == 'daggers':
        bl = Mat('#cbd5e1')
        for (x, y), sgn in ((lh, -1), (rh, 1)):
            if atk == 2 and sgn == 1:
                sp.line(x + 1, y - 1, x + 7, y - 6, (226, 232, 240, 255))
                for k in range(3): sp.px(x + 4 + k * 2, y - 8 + k, (254, 202, 202, 255), glow=True)
            else: sp.limb(x, y + 1, x + sgn * 0.5, y + 5, 0.6, bl)
    elif w == 'book':
        x, y = lh
        if atk:
            sp.poly([(x - 4, y - 3), (x + 3, y - 3), (x + 3, y + 2), (x - 4, y + 2)], Mat('#fdf6e3', rim=False))
            sp.line(x - 0.5, y - 3, x - 0.5, y + 2, (120, 60, 30, 255))
            for k, (dx, dy) in enumerate(((-3, -7), (2, -9), (-1, -12), (4, -6), (0, -5))[: 3 + atk]):
                sp.px(x + dx, y + dy, (216, 180, 254, 255), glow=True); sp.px(x + dx, y + dy - 1, (168, 85, 247, 255), glow=True)
        else:
            sp.rect(x - 2, y - 3, x + 1, y + 2, Mat('#6b2f1a'))
            sp.line(x - 2, y - 3, x - 2, y + 2, (245, 197, 66, 255))
        # фиолетовые искры у руки
        sp.px(rh[0] + 2, rh[1] - 3 - (f % 3), (192, 132, 252, 255), glow=True)
    elif w == 'sword':
        x, y = rh
        if atk:
            ang = -1.1 if atk == 1 else 0.6
            ex, ey = x + math.cos(ang) * 13, y + math.sin(ang) * 13 - 4
            sp.limb(x, y - 1, ex, ey, 0.8, Mat('#dfe6ee'))
            sp.line(x - 2, y, x + 2, y - 2, (245, 197, 66, 255))
            if atk == 2:
                for k in range(5): sp.px(x + 4 + k * 2, y - 10 + k * 3, (241, 245, 249, 255), glow=True)
        else:
            sp.limb(lh[0] + 1, lh[1] - 3, lh[0] - 1, lh[1] + 9, 0.8, Mat('#1e1b22'))  # ножны
            sp.px(lh[0] + 1, lh[1] - 4, (245, 197, 66, 255))

# ---------------- вид сбоку (влево) ----------------
def side(sp, s, M, f):
    b, step, swing, br, atk = pose(f)
    hid = s['weapon']
    sh = 23 + b + br
    st = step * 5
    arm_mat = M['coat'] if s.get('coat') else M['top']
    hand = Mat(s['gloves']) if s.get('gloves') else (Mat('#0f0e13') if s.get('mask') else SKIN)
    # дальняя рука
    hx, hy = 25 + swing * 3, 36 + b
    sp.limb(25, sh + 2, hx, hy - 1, 1.9, Mat(s.get('coat') or s['top']), r1=1.6)
    sp.ellipse(hx, hy, 1.6, 1.6, hand)
    # ноги: дальняя, ближняя
    for k, off in ((0, -st), (1, st)):
        fx = 24 + off
        sp.limb(24, 36 + b, fx * 0.5 + 24 * 0.5, 47, 2.6, M['legs'], r1=2.0)
        if s.get('skirt'): sp.limb(fx * 0.5 + 12, 44, fx * 0.5 + 12, 48, 1.9, SKIN)
        kx = fx * 0.5 + 12
        sp.limb(kx, 47, fx, 55, 2.1, M['boots'], r1=2.0)
        sp.ellipse(fx - 1.2, 56.5, 2.8, 1.6, M['boots'])
    if s.get('coat'):
        flow = [3, 1, 3, 1, 2, 4][f]
        sp.poly([(20, sh), (28, sh), (29 + flow, 50), (24 + flow * 0.5, 52), (19, 49)], M['coat'])
    sp.poly([(19.5, sh), (28.5, sh), (27.5, 37 + b), (20.5, 37 + b)], M['top'])
    if s.get('coat'):
        sp.poly([(19.5, sh), (25, sh), (24, 37 + b), (19, 48), (18, 40)], M['coat'])
        sp.poly([(23, sh - 3), (28, sh - 2), (27, sh + 3), (24, sh + 1)], M['trim'])
    if s.get('skirt'):
        sp.poly([(19, 34 + b), (29, 34 + b), (31, 44 + b), (17, 44 + b)], M['top'])
        sp.line(17, 44 + b, 31, 44 + b, M['trimg'].r[2] + (255,))
    if hid == 'spear':
        sp.line(20, sh + 1, 21, 36 + b, M['trimg'].r[2] + (255,)); sp.px(20, sh + 4, (34, 197, 94, 255), glow=True)
    if hid == 'book': sp.line(20, sh + 1, 20, 36 + b, M['trimg'].r[2] + (255,))
    if hid == 'sword':
        sp.line(20, sh + 1, 20, 36 + b, M['trimg'].r[2] + (255,))
        sp.rect(19.5, 33 + b, 28.5, 34 + b, Mat('#141218', rim=False)); sp.rect(19, 32.5 + b, 21, 34.5 + b, Mat(s['buckle'], rim=False), tone=3)
    # голова
    hb = b + br
    if hid == 'book': sp.poly([(19, 9 + hb), (31, 9 + hb), (32, 26 + hb), (25, 24 + hb)], M['hair'])
    sp.limb(24, 19 + hb, 24, 23 + hb, 2.0, SKIN)
    sp.ellipse(23.5, 13 + hb, 6.8, 7.4, SKIN, bias=0.35)
    sp.px(16.5, 14 + hb, ramp('#f3d2bd')[2] + (255,))  # нос
    if s.get('mask'):
        sp.poly([(16.5, 15 + hb), (24, 15 + hb), (25, 20 + hb), (19, 21 + hb)], Mat('#101015'))
    sp.eye(18.5, 12 + hb, s['eye'], side=-1)
    if s.get('choker'): sp.line(22, 21 + hb, 26, 21 + hb, (20, 16, 26, 255))
    H_ = M['hair']
    if hid == 'sword':
        sp.poly([(18, 9 + hb), (21, 4 + hb), (28, 4 + hb), (31, 9 + hb), (30.5, 17 + hb), (27, 18 + hb), (25, 11 + hb), (19, 9 + hb)], H_)
    else:
        sp.poly([(17, 11 + hb), (19, 5 + hb), (25, 3 + hb), (30, 5 + hb), (31.5, 12 + hb), (30, 19 + hb), (27, 20 + hb), (25, 13 + hb), (22, 11 + hb), (20, 14 + hb)], H_)
    if hid == 'spear': sp.line(24, 4 + hb, 22, 12 + hb, ramp(s['streak'])[2] + (255,))
    if hid == 'daggers': sp.line(26, 5 + hb, 27, 16 + hb, ramp(s['streak'])[2] + (255,)); sp.line(21, 5 + hb, 19, 10 + hb, ramp(s['streak'])[2] + (255,))
    # ближняя рука (оружие вперёд-влево)
    if atk == 2: hx, hy = 13, 31 + b
    elif atk == 1: hx, hy = 26, 29 + b
    else: hx, hy = 24 - swing * 3, 36 + b
    sp.limb(24, sh + 2, hx, hy - 1, 2.0, arm_mat, r1=1.7)
    sp.ellipse(hx, hy, 1.7, 1.7, hand)
    w = hid
    if w == 'spear':
        if atk == 2: sp.limb(hx + 8, hy, hx - 9, hy, 0.7, Mat('#8a5a2b')); sp.poly([(hx - 9, hy - 1.5), (hx - 9, hy + 1.5), (hx - 15, hy)], Mat('#e6edf5'))
        else:
            top = hy - 22 + (3 if atk else 0)
            sp.limb(hx, hy + 6, hx - 1, top, 0.7, Mat('#8a5a2b')); sp.poly([(hx - 2.5, top), (hx + 0.5, top), (hx - 1, top - 6)], Mat('#e6edf5'))
    elif w == 'daggers':
        if atk == 2:
            sp.line(hx - 1, hy, hx - 7, hy - 3, (226, 232, 240, 255))
            for k in range(3): sp.px(hx - 5 - k * 2, hy - 7 + k * 2, (254, 202, 202, 255), glow=True)
        else: sp.limb(hx, hy + 1, hx - 1, hy + 5, 0.6, Mat('#cbd5e1'))
    elif w == 'book':
        if atk:
            sp.poly([(hx - 5, hy - 3), (hx + 1, hy - 3), (hx + 1, hy + 2), (hx - 5, hy + 2)], Mat('#fdf6e3', rim=False))
            for k in range(2 + atk): sp.px(hx - 6 - k * 2, hy - 5 - k * 2, (216, 180, 254, 255), glow=True)
        else: sp.rect(hx - 2, hy - 3, hx + 1, hy + 2, Mat('#6b2f1a')); sp.line(hx + 1, hy - 3, hx + 1, hy + 2, (245, 197, 66, 255))
        sp.px(hx + 2, hy - 6 - (f % 3), (192, 132, 252, 255), glow=True)
    elif w == 'sword':
        if atk:
            ang = (-2.2 if atk == 1 else -3.6)
            ex, ey = hx + math.cos(ang) * 13, hy + math.sin(ang) * 13
            sp.limb(hx, hy, ex, ey, 0.8, Mat('#dfe6ee'))
            if atk == 2:
                for k in range(5): sp.px(hx - 4 - k * 2, hy - 8 + k * 3, (241, 245, 249, 255), glow=True)
        else: sp.limb(26, 34 + b, 31, 44 + b, 0.8, Mat('#1e1b22'))

def frame(hid, d, f):
    s = SPEC[hid]; M = mats(s)
    sp = Sprite(W, H)
    if d == 0: front(sp, s, M, f)
    elif d == 3: front(sp, s, M, f, back=True)
    else: side(sp, s, M, f)
    im = sp.render()
    if d == 2: im = mirror(im)
    return im

def main():
    atlas = Image.new('RGBA', (W * 4 * FR, H * len(IDS)), (0, 0, 0, 0))
    for r, hid in enumerate(IDS):
        for d in range(4):
            for f in range(FR):
                atlas.paste(frame(hid, d, f), ((d * FR + f) * W, r * H))
    atlas.save(os.path.join(OUT, 'heroes_atlas.png'))
    big = atlas.resize((atlas.size[0] * 3, atlas.size[1] * 3), Image.NEAREST)
    bg = Image.new('RGBA', big.size, (34, 28, 44, 255)); bg.alpha_composite(big)
    os.makedirs(PREV, exist_ok=True)
    bg.save(os.path.join(PREV, 'heroes_atlas_v2_x3.png'))
    print('ok', atlas.size)

if __name__ == '__main__':
    main()
