# Атлас снарядов «Проклятых»: 32×32 на кадр, 8 кадров в строке, все снаряды смотрят ВПРАВО (+X),
# поворот к направлению полёта делает шейдер. Рисуем в 4× (128 px), уменьшаем BOX-фильтром и
# «пикселизуем» альфу + тёмный контур — получается чистый пиксель-арт в стиле героев/мобов.
# Запуск: python3 tools/mc-sprites/gen_projectiles.py  → src/assets/mc/proj_atlas.png (+json)
import math, random, json, os
from PIL import Image, ImageDraw, ImageFilter

S = 4            # суперсэмплинг
C = 32           # клетка
B = C * S
COLS = 8
ROWS = ['soul_spark', 'war_axe', 'spear', 'daggers', 'fire_spark', 'orbit_skulls', 'chain_bolt', 'ice_fan',
        'ab_backstab', 'ab_pierce', 'ab_trick', 'ab_fireball', 'enemy', 'enemy_boss',
        'hit', 'hit_fire', 'hit_ice', 'hit_arcane', 'hit_acid',
        'arrow', 'ricochet', 'mine', 'beam', 'split', 'poison_glob', 'fly_blade', 'staff_bolt', 'cloud',
        'hit_poison', 'hit_bleed', 'status']
OUT = os.path.join(os.path.dirname(__file__), '../../src/assets/mc')
random.seed(7)

def rgba(h, a=255):
    h = h.lstrip('#'); return (int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16), a)

def canvas():
    return Image.new('RGBA', (B, B), (0, 0, 0, 0))

def pixelize(img, outline=(12, 6, 18, 255), soft=False):
    small = img.resize((C, C), Image.BOX)
    px = small.load()
    for y in range(C):
        for x in range(C):
            r, g, b, a = px[x, y]
            if a < 40: px[x, y] = (0, 0, 0, 0)
            elif not soft and a < 255:
                # непрозрачная «краска»: восстанавливаем цвет из премультиплицированного усреднения
                px[x, y] = (min(255, r), min(255, g), min(255, b), 255 if a > 110 else 150)
    if outline:
        src = small.copy(); sp = src.load()
        for y in range(C):
            for x in range(C):
                if sp[x, y][3] > 0: continue
                for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    nx, ny = x + dx, y + dy
                    if 0 <= nx < C and 0 <= ny < C and sp[nx, ny][3] >= 200:
                        px[x, y] = outline; break
    return small

def glow_blob(d, cx, cy, r, col, steps=6):
    for i in range(steps, 0, -1):
        k = i / steps
        a = int(col[3] * (1 - k) ** 1.4 * 0.9 + 20)
        rr = r * k
        d.ellipse([cx - rr, cy - rr, cx + rr, cy + rr], fill=(col[0], col[1], col[2], min(255, a)))

def rot(pts, ang, cx=B / 2, cy=B / 2):
    c, s = math.cos(ang), math.sin(ang)
    return [(cx + (x - cx) * c - (y - cy) * s, cy + (x - cx) * s + (y - cy) * c) for x, y in pts]

def star(d, cx, cy, r1, r2, n, ang, fill):
    pts = []
    for i in range(n * 2):
        r = r1 if i % 2 == 0 else r2
        a = ang + i * math.pi / n
        pts.append((cx + math.cos(a) * r, cy + math.sin(a) * r))
    d.polygon(pts, fill=fill)

# ---------------- снаряды ----------------
def soul_spark(f):
    im = canvas(); d = ImageDraw.Draw(im)
    tw = 0.85 + 0.15 * math.sin(f / 8 * 2 * math.pi)
    # хвост
    for i in range(6):
        t = i / 6
        d.ellipse([B / 2 - 44 * t - 10 * (1 - t), B / 2 - 9 * (1 - t), B / 2 - 44 * t + 10 * (1 - t), B / 2 + 9 * (1 - t)], fill=rgba('#22d3ee', int(200 * (1 - t))))
    star(d, B / 2, B / 2, 40 * tw, 9, 4, f * math.pi / 16, rgba('#67e8f9'))
    star(d, B / 2, B / 2, 26 * tw, 6, 4, f * math.pi / 16 + math.pi / 4, rgba('#cffafe'))
    d.ellipse([B / 2 - 9, B / 2 - 9, B / 2 + 9, B / 2 + 9], fill=rgba('#ffffff'))
    return pixelize(im, outline=rgba('#0e3a4a'))

def war_axe(f):
    im = canvas(); d = ImageDraw.Draw(im)
    a = f / 8 * 2 * math.pi
    handle = [(B / 2 - 6, 20), (B / 2 + 6, 20), (B / 2 + 6, 108), (B / 2 - 6, 108)]
    d.polygon(rot(handle, a), fill=rgba('#7c4a24'))
    d.polygon(rot([(B / 2 - 2, 24), (B / 2 + 2, 24), (B / 2 + 2, 104), (B / 2 - 2, 104)], a), fill=rgba('#a16a3a'))
    blade = [(B / 2 + 4, 22), (B / 2 + 46, 10), (B / 2 + 54, 40), (B / 2 + 44, 66), (B / 2 + 4, 52)]
    d.polygon(rot(blade, a), fill=rgba('#94a3b8'))
    d.polygon(rot([(B / 2 + 30, 14), (B / 2 + 46, 10), (B / 2 + 54, 40), (B / 2 + 44, 66), (B / 2 + 34, 62), (B / 2 + 42, 38)], a), fill=rgba('#e2e8f0'))
    blade2 = [(B / 2 - 4, 26), (B / 2 - 30, 20), (B / 2 - 34, 40), (B / 2 - 4, 46)]
    d.polygon(rot(blade2, a), fill=rgba('#64748b'))
    return pixelize(im)

def spear(f):
    im = canvas(); d = ImageDraw.Draw(im)
    y = B / 2
    d.rectangle([4, y - 4, 92, y + 4], fill=rgba('#8b5a2b'))
    d.rectangle([4, y - 4, 92, y - 1], fill=rgba('#b07a42'))
    d.polygon([(88, y - 14), (124, y), (88, y + 14), (96, y)], fill=rgba('#fbbf24'))
    d.polygon([(96, y - 6), (124, y), (100, y)], fill=rgba('#fef3c7'))
    d.rectangle([84, y - 9, 90, y + 9], fill=rgba('#b45309'))
    gx = 10 + (f / 8) * 80  # бегущий блик
    d.rectangle([gx, y - 4, gx + 8, y - 2], fill=rgba('#fde68a'))
    for i in range(3):  # ленты
        d.line([(6, y), (6 - 4 - i * 2, y + 6 + i * 4 + math.sin(f + i) * 3)], fill=rgba('#dc2626'), width=4)
    return pixelize(im)

def daggers(f):
    im = canvas(); d = ImageDraw.Draw(im)
    y = B / 2
    d.polygon([(48, y - 9), (118, y), (48, y + 9)], fill=rgba('#cbd5e1'))
    d.polygon([(48, y - 9), (118, y), (48, y - 1)], fill=rgba('#f8fafc'))
    d.rectangle([40, y - 15, 48, y + 15], fill=rgba('#475569'))
    d.rectangle([14, y - 5, 40, y + 5], fill=rgba('#3f2a1a'))
    d.ellipse([6, y - 7, 18, y + 7], fill=rgba('#7c3aed'))
    if f in (2, 3, 6):
        star(d, 60 + f * 6, y - 4, 14, 3, 4, 0, rgba('#ffffff'))
    return pixelize(im)

def flame(d, cx, cy, r, f, cols, tail=60):
    for layer, col in enumerate(cols):
        k = 1 - layer * 0.28
        pts = []
        for i in range(24):
            a = i / 24 * 2 * math.pi
            rr = r * k * (1 + 0.12 * math.sin(a * 5 + f * 1.7 + layer))
            x = cx + math.cos(a) * rr; yy = cy + math.sin(a) * rr
            if math.cos(a) < 0:  # хвост назад (влево)
                x -= (-math.cos(a)) ** 2 * tail * k * (0.8 + 0.25 * math.sin(f * 2.1 + layer + a * 3))
            pts.append((x, yy))
        d.polygon(pts, fill=col)

def fire_spark(f):
    im = canvas(); d = ImageDraw.Draw(im)
    flame(d, 80, B / 2, 26, f, [rgba('#b91c1c'), rgba('#f97316'), rgba('#fbbf24'), rgba('#fff7d6')], tail=58)
    for i in range(3):
        x = 30 - ((f * 9 + i * 23) % 30); yy = B / 2 + math.sin(f + i * 2) * 18
        d.rectangle([x, yy, x + 5, yy + 5], fill=rgba('#fdba74'))
    return pixelize(im, outline=rgba('#3b0a02'))

def orbit_skulls(f):
    im = canvas(); d = ImageDraw.Draw(im)
    # призрачное пламя над черепом
    flame_im = canvas(); fd = ImageDraw.Draw(flame_im)
    for i, col in enumerate([rgba('#7c3aed', 220), rgba('#a855f7', 230), rgba('#e9d5ff', 240)]):
        k = 1 - i * 0.3
        pts = []
        for j in range(20):
            a = j / 20 * 2 * math.pi
            rr = 30 * k * (1 + 0.15 * math.sin(a * 4 + f * 1.6 + i))
            x = B / 2 + math.cos(a) * rr; y = 58 + math.sin(a) * rr
            if math.sin(a) < 0: y -= (-math.sin(a)) ** 1.6 * 34 * k * (0.85 + 0.2 * math.sin(f * 2 + i))
            pts.append((x, y))
        fd.polygon(pts, fill=col)
    im.alpha_composite(flame_im)
    bob = math.sin(f / 8 * 2 * math.pi) * 3
    d.ellipse([34, 46 + bob, 94, 100 + bob], fill=rgba('#fef3c7'))
    d.rectangle([46, 88 + bob, 82, 110 + bob], fill=rgba('#fde68a'))
    d.ellipse([42, 62 + bob, 60, 80 + bob], fill=rgba('#1c0b2e'))
    d.ellipse([68, 62 + bob, 86, 80 + bob], fill=rgba('#1c0b2e'))
    eye = rgba('#a3e635') if f % 4 < 2 else rgba('#d9f99d')
    d.ellipse([48, 68 + bob, 54, 74 + bob], fill=eye); d.ellipse([74, 68 + bob, 80, 74 + bob], fill=eye)
    d.polygon([(64, 82 + bob), (59, 90 + bob), (69, 90 + bob)], fill=rgba('#1c0b2e'))
    for x in (52, 60, 68, 76): d.line([(x, 98 + bob), (x, 108 + bob)], fill=rgba('#78350f'), width=3)
    return pixelize(im)

def lightning(d, x0, y0, x1, y1, col, width, jag, rnd):
    pts = [(x0, y0)]
    n = 6
    for i in range(1, n):
        t = i / n
        pts.append((x0 + (x1 - x0) * t + rnd.uniform(-jag, jag), y0 + (y1 - y0) * t + rnd.uniform(-jag, jag)))
    pts.append((x1, y1))
    d.line(pts, fill=col, width=width, joint='curve')

def chain_bolt(f):
    im = canvas(); d = ImageDraw.Draw(im)
    rnd = random.Random(100 + f)
    glow_blob(d, B / 2, B / 2, 46, rgba('#6366f1', 200))
    for i in range(5):
        a = rnd.uniform(0, 2 * math.pi)
        lightning(d, B / 2, B / 2, B / 2 + math.cos(a) * 58, B / 2 + math.sin(a) * 58, rgba('#c7d2fe'), 6, 10, rnd)
    lightning(d, 8, B / 2, B / 2, B / 2, rgba('#a5b4fc'), 7, 12, rnd)
    d.ellipse([B / 2 - 20, B / 2 - 20, B / 2 + 20, B / 2 + 20], fill=rgba('#e0e7ff'))
    d.ellipse([B / 2 - 10, B / 2 - 10, B / 2 + 10, B / 2 + 10], fill=rgba('#ffffff'))
    return pixelize(im, outline=rgba('#1e1b4b'))

def ice_fan(f):
    im = canvas(); d = ImageDraw.Draw(im)
    y = B / 2
    d.polygon([(20, y), (60, y - 18), (122, y), (60, y + 18)], fill=rgba('#38bdf8'))
    d.polygon([(20, y), (60, y - 18), (122, y)], fill=rgba('#7dd3fc'))
    d.polygon([(54, y - 8), (110, y), (54, y)], fill=rgba('#e0f2fe'))
    d.polygon([(30, y - 2), (16, y - 22), (40, y - 8)], fill=rgba('#bae6fd'))
    d.polygon([(30, y + 2), (16, y + 22), (40, y + 8)], fill=rgba('#0ea5e9'))
    if f % 4 == 1: star(d, 92, y - 6, 16, 3, 4, 0, rgba('#ffffff'))
    if f % 4 == 3: star(d, 64, y + 4, 12, 2, 4, 0.3, rgba('#ffffff'))
    return pixelize(im, outline=rgba('#082f49'))

def crescent(f, c1, c2, c3):
    im = canvas(); d = ImageDraw.Draw(im)
    k = 0.75 + 0.25 * (f / 7)
    r = 54 * k
    d.pieslice([B / 2 - r, B / 2 - r, B / 2 + r, B / 2 + r], -70, 70, fill=c1)
    r2 = r * 0.8
    d.pieslice([B / 2 - r2 - 30, B / 2 - r2, B / 2 + r2 - 30, B / 2 + r2], -90, 90, fill=(0, 0, 0, 0))
    d.pieslice([B / 2 - r * 0.92, B / 2 - r * 0.92, B / 2 + r * 0.92, B / 2 + r * 0.92], -50, 50, fill=c2)
    d.pieslice([B / 2 - r2 - 6, B / 2 - r2, B / 2 + r2 - 6, B / 2 + r2], -90, 90, fill=(0, 0, 0, 0))
    d.arc([B / 2 - r, B / 2 - r, B / 2 + r, B / 2 + r], -60, 60, fill=c3, width=4)
    return pixelize(im, outline=None, soft=True)

def ab_backstab(f): return crescent(f, rgba('#1d4ed8', 220), rgba('#38bdf8', 240), rgba('#e0f2fe'))

def ab_pierce(f):
    im = canvas(); d = ImageDraw.Draw(im)
    y = B / 2; p = 0.5 + 0.5 * math.sin(f / 8 * 2 * math.pi)
    d.polygon([(0, y - 8 - 3 * p), (100, y - 10), (126, y), (100, y + 10), (0, y + 8 + 3 * p)], fill=rgba('#f59e0b', 200))
    d.polygon([(0, y - 4), (104, y - 5), (126, y), (104, y + 5), (0, y + 4)], fill=rgba('#fde047'))
    d.rectangle([0, y - 1, 110, y + 1], fill=rgba('#ffffff'))
    for i in range(4):
        x = (f * 16 + i * 32) % 110
        d.rectangle([x, y - 12, x + 4, y - 9], fill=rgba('#fef9c3'))
    return pixelize(im, outline=rgba('#451a03'))

def ab_trick(f):
    im = canvas(); d = ImageDraw.Draw(im)
    a = f / 8 * math.pi / 2
    for k in range(4):
        blade = [(B / 2, B / 2 - 8), (B / 2 + 52, B / 2), (B / 2, B / 2 + 8)]
        d.polygon(rot(blade, a + k * math.pi / 2), fill=rgba('#4ade80'))
        d.polygon(rot([(B / 2, B / 2 - 4), (B / 2 + 46, B / 2), (B / 2, B / 2)], a + k * math.pi / 2), fill=rgba('#dcfce7'))
    d.ellipse([B / 2 - 10, B / 2 - 10, B / 2 + 10, B / 2 + 10], fill=rgba('#166534'))
    return pixelize(im, outline=rgba('#052e16'))

def ab_fireball(f):
    im = canvas(); d = ImageDraw.Draw(im)
    flame(d, 74, B / 2, 40, f, [rgba('#7f1d1d'), rgba('#dc2626'), rgba('#f97316'), rgba('#fde047'), rgba('#ffffff')], tail=46)
    rnd = random.Random(f)
    for i in range(5):
        x = rnd.uniform(4, 40); yy = rnd.uniform(30, 98)
        d.rectangle([x, yy, x + 6, yy + 6], fill=rgba('#fb923c'))
    return pixelize(im, outline=rgba('#2a0602'))

def enemy(f):
    im = canvas(); d = ImageDraw.Draw(im)
    w = math.sin(f / 8 * 2 * math.pi)
    # капля кислоты, хвост назад
    d.polygon([(30, B / 2 - 6), (64, B / 2 - 26 - w * 3), (100, B / 2), (64, B / 2 + 26 + w * 3), (30, B / 2 + 6)], fill=rgba('#4d7c0f'))
    d.ellipse([50, B / 2 - 26 - w * 3, 104, B / 2 + 26 + w * 3], fill=rgba('#65a30d'))
    d.ellipse([58, B / 2 - 18, 96, B / 2 + 16], fill=rgba('#a3e635'))
    d.ellipse([72, B / 2 - 14, 86, B / 2 - 2], fill=rgba('#ecfccb'))
    for i in range(3):
        x = 20 - ((f * 6 + i * 11) % 18); yy = B / 2 + (i - 1) * 12
        d.ellipse([x, yy, x + 8, yy + 8], fill=rgba('#84cc16'))
    return pixelize(im, outline=rgba('#1a2e05'))

def enemy_boss(f):
    im = canvas(); d = ImageDraw.Draw(im)
    a = f / 8 * 2 * math.pi
    glow_blob(d, B / 2, B / 2, 50, rgba('#a21caf', 210))
    for k in range(3):
        ang = a + k * 2 * math.pi / 3
        d.ellipse([B / 2 + math.cos(ang) * 36 - 7, B / 2 + math.sin(ang) * 36 - 7, B / 2 + math.cos(ang) * 36 + 7, B / 2 + math.sin(ang) * 36 + 7], fill=rgba('#f0abfc'))
    d.ellipse([B / 2 - 24, B / 2 - 24, B / 2 + 24, B / 2 + 24], fill=rgba('#c026d3'))
    d.ellipse([B / 2 - 14, B / 2 - 16, B / 2 + 10, B / 2 + 6], fill=rgba('#f5d0fe'))
    return pixelize(im, outline=rgba('#2e0532'))

# ---------------- попадания (8 кадров: вспышка → распад) ----------------
def burst(f, core, rays, n_rays, ring=None, shards=None, seed=0):
    im = canvas(); d = ImageDraw.Draw(im)
    t = f / 7
    rnd = random.Random(seed)
    if ring:
        r = 14 + t * 46
        d.ellipse([B / 2 - r, B / 2 - r, B / 2 + r, B / 2 + r], outline=(ring[0], ring[1], ring[2], int(255 * (1 - t))), width=max(2, int(10 * (1 - t))))
    for i in range(n_rays):
        a = rnd.uniform(0, 2 * math.pi)
        r0 = 6 + t * 30; r1 = r0 + 26 * (1 - t) + 6
        d.line([(B / 2 + math.cos(a) * r0, B / 2 + math.sin(a) * r0), (B / 2 + math.cos(a) * r1, B / 2 + math.sin(a) * r1)], fill=(rays[0], rays[1], rays[2], int(255 * (1 - t * 0.8))), width=max(2, int(8 * (1 - t))))
    if shards:
        for i in range(7):
            a = rnd.uniform(0, 2 * math.pi); r = 8 + t * 48
            x = B / 2 + math.cos(a) * r; y = B / 2 + math.sin(a) * r
            s = 9 * (1 - t) + 2
            d.polygon([(x, y - s), (x + s * 0.6, y), (x, y + s), (x - s * 0.6, y)], fill=shards)
    cr = 26 * (1 - t) ** 1.3
    if cr > 1:
        star(d, B / 2, B / 2, cr * 1.4, cr * 0.5, 4, t, core)
        d.ellipse([B / 2 - cr * 0.6, B / 2 - cr * 0.6, B / 2 + cr * 0.6, B / 2 + cr * 0.6], fill=rgba('#ffffff'))
    return pixelize(im, outline=None, soft=True)

def explosion(f):
    im = canvas(); d = ImageDraw.Draw(im)
    t = f / 7
    rnd = random.Random(3)
    for i in range(9):
        a = i / 9 * 2 * math.pi + rnd.uniform(-0.3, 0.3)
        dist = 10 + t * 34 * rnd.uniform(0.7, 1.2)
        r = (22 + rnd.uniform(-6, 8)) * (1 - t * 0.55)
        x = B / 2 + math.cos(a) * dist; y = B / 2 + math.sin(a) * dist
        col = rgba('#fde047') if t < 0.25 else rgba('#f97316') if t < 0.5 else rgba('#b91c1c') if t < 0.75 else rgba('#44403c', 200)
        d.ellipse([x - r, y - r, x + r, y + r], fill=col)
    cr = 30 * (1 - t) ** 1.5
    if cr > 1: d.ellipse([B / 2 - cr, B / 2 - cr, B / 2 + cr, B / 2 + cr], fill=rgba('#fff7d6'))
    return pixelize(im, outline=rgba('#1c0a02') if t < 0.7 else None, soft=t >= 0.7)

def arrow(f):
    im = canvas(); d = ImageDraw.Draw(im); y = B / 2
    d.rectangle([14, y - 3, 100, y + 3], fill=rgba('#a16207'))
    d.polygon([(96, y - 11), (124, y), (96, y + 11), (102, y)], fill=rgba('#e5e7eb'))
    d.polygon([(100, y - 5), (124, y), (102, y)], fill=rgba('#ffffff'))
    for k, col in ((0, '#dc2626'), (1, '#f87171')):
        d.polygon([(8 + k * 10, y - 2), (26 + k * 10, y - 2), (16 + k * 10, y - 14 - (f % 2) * 2)], fill=rgba(col))
        d.polygon([(8 + k * 10, y + 2), (26 + k * 10, y + 2), (16 + k * 10, y + 14 + (f % 2) * 2)], fill=rgba(col))
    return pixelize(im)

def ricochet(f):
    im = canvas(); d = ImageDraw.Draw(im)
    a = f / 8 * 2 * math.pi
    glow_blob(d, B / 2, B / 2, 44, rgba('#fde68a', 190))
    d.ellipse([B / 2 - 26, B / 2 - 26, B / 2 + 26, B / 2 + 26], fill=rgba('#e2e8f0'))
    # лунный серп внутри, вращается
    cx, cy = B / 2 + math.cos(a) * 8, B / 2 + math.sin(a) * 8
    d.ellipse([cx - 22, cy - 22, cx + 22, cy + 22], fill=rgba('#94a3b8'))
    d.ellipse([B / 2 - 12, B / 2 - 14, B / 2 + 4, B / 2 + 2], fill=rgba('#ffffff'))
    return pixelize(im, outline=rgba('#1e293b'))

def mine(f):
    im = canvas(); d = ImageDraw.Draw(im)
    pulse = 0.5 + 0.5 * math.sin(f / 8 * 2 * math.pi)
    d.ellipse([18, 18, 110, 110], outline=rgba('#7c3aed'), width=8)
    d.ellipse([30, 30, 98, 98], outline=rgba('#c084fc', int(150 + 100 * pulse)), width=5)
    for k in range(6):
        ang = k * math.pi / 3 + f * 0.1
        d.line([(B / 2 + math.cos(ang) * 22, B / 2 + math.sin(ang) * 22), (B / 2 + math.cos(ang) * 40, B / 2 + math.sin(ang) * 40)], fill=rgba('#e9d5ff'), width=5)
    star(d, B / 2, B / 2, 18 + 6 * pulse, 7, 5, -math.pi / 2, rgba('#f5d0fe'))
    return pixelize(im, outline=None, soft=True)

def beam(f):
    im = canvas(); d = ImageDraw.Draw(im); y = B / 2
    w = 22 + 6 * math.sin(f / 8 * 2 * math.pi)
    d.rectangle([0, y - w, B, y + w], fill=rgba('#f59e0b', 150))
    d.rectangle([0, y - w * 0.55, B, y + w * 0.55], fill=rgba('#fde047', 220))
    d.rectangle([0, y - w * 0.2, B, y + w * 0.2], fill=rgba('#ffffff'))
    for i in range(5):
        x = (f * 16 + i * 26) % B
        d.rectangle([x, y - w - 6, x + 6, y - w], fill=rgba('#fef9c3'))
        d.rectangle([(x + 13) % B, y + w, (x + 13) % B + 6, y + w + 6], fill=rgba('#fef9c3'))
    return pixelize(im, outline=None, soft=True)

def split(f):
    im = canvas(); d = ImageDraw.Draw(im)
    a = f / 8 * math.pi
    pts = [(B / 2 + 40, B / 2), (B / 2, B / 2 - 22), (B / 2 - 30, B / 2), (B / 2, B / 2 + 22)]
    d.polygon(rot(pts, a * 0.25), fill=rgba('#db2777'))
    d.polygon(rot([(B / 2 + 30, B / 2), (B / 2, B / 2 - 12), (B / 2 - 14, B / 2), (B / 2, B / 2 + 12)], a * 0.25), fill=rgba('#f9a8d4'))
    d.line(rot([(B / 2 - 10, B / 2 - 16), (B / 2 + 6, B / 2 + 18)], a * 0.25), fill=rgba('#ffffff'), width=4)
    return pixelize(im, outline=rgba('#3b0718'))

def poison_glob(f):
    im = canvas(); d = ImageDraw.Draw(im)
    w = math.sin(f / 8 * 2 * math.pi)
    d.ellipse([34, 34 - w * 3, 96, 96 + w * 3], fill=rgba('#7e22ce'))
    d.ellipse([42, 40, 90, 88], fill=rgba('#a855f7'))
    d.ellipse([56, 46, 72, 60], fill=rgba('#f3e8ff'))
    for i in range(4):
        x = 20 - ((f * 5 + i * 9) % 18); yy = B / 2 + (i - 1.5) * 10
        d.ellipse([x, yy, x + 8, yy + 8], fill=rgba('#86efac'))
    return pixelize(im, outline=rgba('#2e1065'))

def fly_blade(f):
    im = canvas(); d = ImageDraw.Draw(im)
    a = f / 8 * 2 * math.pi
    for k in range(2):
        blade = [(B / 2, B / 2 - 6), (B / 2 + 54, B / 2 - 26), (B / 2 + 40, B / 2 - 4), (B / 2, B / 2 + 6)]
        d.polygon(rot(blade, a + k * math.pi), fill=rgba('#a3e635'))
        d.polygon(rot([(B / 2, B / 2 - 2), (B / 2 + 50, B / 2 - 24), (B / 2 + 36, B / 2 - 8)], a + k * math.pi), fill=rgba('#ecfccb'))
    d.ellipse([B / 2 - 9, B / 2 - 9, B / 2 + 9, B / 2 + 9], fill=rgba('#3f6212'))
    return pixelize(im, outline=rgba('#1a2e05'))

def staff_bolt(f):
    im = canvas(); d = ImageDraw.Draw(im)
    rnd = random.Random(40 + f)
    for i in range(6):
        t = i / 6
        d.ellipse([B / 2 - 50 * t - 14 * (1 - t), B / 2 - 14 * (1 - t), B / 2 - 50 * t + 14 * (1 - t), B / 2 + 14 * (1 - t)], fill=rgba('#c026d3', int(210 * (1 - t))))
    star(d, B / 2 + 6, B / 2, 30, 10, 6, f * 0.3, rgba('#f0abfc'))
    d.ellipse([B / 2 - 8, B / 2 - 12, B / 2 + 18, B / 2 + 12], fill=rgba('#fdf4ff'))
    for i in range(3):
        x = rnd.uniform(10, 50); y = rnd.uniform(40, 88)
        d.rectangle([x, y, x + 5, y + 5], fill=rgba('#e879f9'))
    return pixelize(im, outline=rgba('#3b0764'))

def cloud(f):
    im = canvas(); d = ImageDraw.Draw(im)
    rnd = random.Random(9)
    for i in range(9):
        a = i / 9 * 2 * math.pi + f * 0.12
        r = 30 + rnd.uniform(-6, 8)
        x = B / 2 + math.cos(a) * r; y = B / 2 + math.sin(a) * r * 0.8
        rr = 20 + 6 * math.sin(f * 0.8 + i)
        d.ellipse([x - rr, y - rr, x + rr, y + rr], fill=rgba('#4d7c0f', 150))
    d.ellipse([30, 34, 98, 94], fill=rgba('#65a30d', 170))
    for i in range(5):
        x = rnd.uniform(36, 90); y = rnd.uniform(36, 90) - (f * 4) % 20
        d.ellipse([x, y, x + 8, y + 8], fill=rgba('#bef264', 220))
    return pixelize(im, outline=None, soft=True)

def status(f):
    im = canvas(); d = ImageDraw.Draw(im)
    k, ph = f // 2, f % 2
    if k == 0:   # горение
        flame(d, B / 2, 78, 26, ph * 3, [rgba('#dc2626'), rgba('#f97316'), rgba('#fde047')], tail=0)
        d.polygon([(B / 2 - 18, 70), (B / 2, 14 + ph * 6), (B / 2 + 18, 70)], fill=rgba('#f97316'))
        d.polygon([(B / 2 - 8, 74), (B / 2, 40 + ph * 4), (B / 2 + 8, 74)], fill=rgba('#fde047'))
    elif k == 1:  # яд
        for i, (x, y, r) in enumerate([(50, 80, 18), (80, 60, 14), (60, 36 - ph * 6, 10)]):
            d.ellipse([x - r, y - r, x + r, y + r], fill=rgba('#84cc16'))
            d.ellipse([x - r * 0.4, y - r * 0.6, x, y - r * 0.2], fill=rgba('#ecfccb'))
    elif k == 2:  # кровотечение
        y0 = 30 + ph * 10
        d.polygon([(B / 2, y0), (B / 2 + 20, y0 + 40), (B / 2, y0 + 56), (B / 2 - 20, y0 + 40)], fill=rgba('#b91c1c'))
        d.ellipse([B / 2 - 20, y0 + 26, B / 2 + 20, y0 + 62], fill=rgba('#dc2626'))
        d.ellipse([B / 2 - 10, y0 + 32, B / 2 - 2, y0 + 42], fill=rgba('#fecaca'))
    else:  # заморозка
        star(d, B / 2, B / 2, 50, 12, 6, ph * 0.26, rgba('#7dd3fc'))
        star(d, B / 2, B / 2, 30, 8, 6, ph * 0.26 + 0.5, rgba('#e0f2fe'))
    return pixelize(im)

DRAW = {
    'arrow': arrow, 'ricochet': ricochet, 'mine': mine, 'beam': beam, 'split': split, 'poison_glob': poison_glob,
    'fly_blade': fly_blade, 'staff_bolt': staff_bolt, 'cloud': cloud, 'status': status,
    'hit_poison': lambda f: burst(f, rgba('#e9d5ff'), rgba('#c084fc'), 6, ring=rgba('#a855f7'), shards=rgba('#86efac'), seed=5),
    'hit_bleed': lambda f: burst(f, rgba('#fecaca'), rgba('#ef4444'), 8, ring=None, shards=rgba('#b91c1c'), seed=6),
    'soul_spark': soul_spark, 'war_axe': war_axe, 'spear': spear, 'daggers': daggers, 'fire_spark': fire_spark,
    'orbit_skulls': orbit_skulls, 'chain_bolt': chain_bolt, 'ice_fan': ice_fan, 'ab_backstab': ab_backstab,
    'ab_pierce': ab_pierce, 'ab_trick': ab_trick, 'ab_fireball': ab_fireball, 'enemy': enemy, 'enemy_boss': enemy_boss,
    'hit': lambda f: burst(f, rgba('#fde68a'), rgba('#fef3c7'), 7, ring=rgba('#fbbf24'), seed=1),
    'hit_fire': explosion,
    'hit_ice': lambda f: burst(f, rgba('#bae6fd'), rgba('#e0f2fe'), 5, ring=rgba('#38bdf8'), shards=rgba('#7dd3fc'), seed=2),
    'hit_arcane': lambda f: burst(f, rgba('#c7d2fe'), rgba('#a5b4fc'), 9, ring=rgba('#818cf8'), seed=3),
    'hit_acid': lambda f: burst(f, rgba('#d9f99d'), rgba('#a3e635'), 6, ring=rgba('#65a30d'), shards=rgba('#84cc16'), seed=4),
}

atlas = Image.new('RGBA', (C * COLS, C * len(ROWS)), (0, 0, 0, 0))
for r, name in enumerate(ROWS):
    for f in range(COLS):
        atlas.paste(DRAW[name](f), (f * C, r * C))
os.makedirs(OUT, exist_ok=True)
atlas.save(os.path.join(OUT, 'proj_atlas.png'))
json.dump({'cell': C, 'cols': COLS, 'rows': ROWS}, open(os.path.join(OUT, 'proj_atlas.json'), 'w'), ensure_ascii=False, indent=1)
prev = atlas.resize((atlas.width * 3, atlas.height * 3), Image.NEAREST)
bg = Image.new('RGBA', prev.size, (24, 18, 36, 255)); bg.alpha_composite(prev)
os.makedirs('/workspace/morrisgrad-round2/sprites', exist_ok=True)
bg.save('/workspace/morrisgrad-round2/sprites/proj_atlas_x3.png')
print('ok', atlas.size, len(ROWS))
