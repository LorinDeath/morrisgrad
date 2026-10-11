"""Тайлы земли 16×16 (единый масштаб: 10 px = 1 м, тайл = 1.6 м) для 2.5D-мира «Проклятых».

Стиль: 16-битная RPG — чистые кластеры пикселей без шумового дизеринга, 3–5 тонов на материал,
свет сверху-слева, ночная палитра Мэлвелдила (холодные тени с фиолетовым, тёплые блики).
Выход: src/assets/mc/tiles_atlas.png (+ .json: имя → индекс), превью ×4 в /workspace/morrisgrad-round2/sprites/.
Всё рисуется кодом (оригинальная работа).
"""
import os, json, random
from PIL import Image

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
OUT = os.path.join(ROOT, 'src', 'assets', 'mc', 'tiles_atlas.png')
PREV = '/workspace/morrisgrad-round2/sprites'
T = 16
COLS = 16

def hx(h, a=255):
    h = h.lstrip('#'); return (int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16), a)

class Tile:
    def __init__(self, base=None):
        self.im = Image.new('RGBA', (T, T), hx(base) if base else (0, 0, 0, 0))
        self.p = self.im.load()
    def put(self, x, y, c, wrap=True):
        if wrap: x %= T; y %= T
        if 0 <= x < T and 0 <= y < T: self.p[x, y] = hx(c) if isinstance(c, str) else c
    def get(self, x, y): return self.p[x % T, y % T]
    def blot(self, cx, cy, shape, c, wrap=True):
        for (dx, dy) in shape: self.put(cx + dx, cy + dy, c, wrap)

# ---------------- палитры ----------------
GRASS = dict(sh='#1c2e33', dk='#23413a', base='#2c5540', md='#386a46', li='#4c8550', hi='#6ea35c')
GARDEN = dict(sh='#1d3330', dk='#24493a', base='#2f6243', md='#3c7a4a', li='#55954f', hi='#7db45e')
DIRT = dict(sh='#2a1f24', dk='#3b2b2a', base='#544034', md='#68503d', li='#7e6449', hi='#9a7d5a')
COBBLE = dict(gap='#26243a', sh='#3d3b56', base='#55536f', li='#706e8c', hi='#938fb0')
PLAZA = dict(gap='#252338', sh='#3a3954', base='#4b4a66', li='#605e7d', hi='#7c7a9a', rune='#b98cff', rune2='#e3ccff')
WATER = dict(dp='#141f45', base='#1d2f63', li='#2b4787', hi='#4a6fb8', foam='#9ec2ff')
WASTE = dict(sh='#2c2a40', base='#3b3854', md='#4a4666', li='#5c587a', hi='#7a7699', star='#e8ecff')
ROT = dict(sh='#1b1a16', base='#2a2820', md='#363423', moss='#4b6320', moss2='#6c8a26', glow='#b5f23e')
CRATER = dict(sh='#21182f', base='#2e2242', md='#3b2d55', li='#4d3c6e', hi='#6a55a0', cry='#c99bff', cry2='#f0dcff')
SAND = dict(sh='#4a3d36', base='#5f4f42', li='#76634f', hi='#8e7a60')
WOOD = dict(gap='#24170f', sh='#4a3020', base='#5f3f29', li='#7a5336', hi='#946946')
BRICK = dict(gap='#1f1d2c', sh='#35324a', base='#45425e', li='#57547a', hi='#716d96', moss='#3c6b3e')

TUFT = [(0, 0), (1, -1), (2, 0), (1, 0)]
TUFT2 = [(0, 0), (0, -1), (1, -2), (2, -1), (2, 0), (1, 0)]
BLADE = [(0, 0), (0, -1)]

def grass_tile(seed, P=GRASS, flowers=None, petals=None, nflow=0):
    r = random.Random(seed)
    t = Tile(P['base'])
    # крупные тональные пятна (тень/свет), без шума
    for _ in range(3):
        cx, cy = r.randrange(T), r.randrange(T)
        for dy in range(-2, 3):
            for dx in range(-3, 4):
                if abs(dx) + abs(dy) <= 3: t.put(cx + dx, cy + dy, P['md'])
    for _ in range(2):
        cx, cy = r.randrange(T), r.randrange(T)
        for dy in range(-1, 2):
            for dx in range(-2, 3):
                if abs(dx) + abs(dy) <= 2: t.put(cx + dx, cy + dy, P['dk'])
    # пучки травы: тень под пучком, светлые кончики
    for _ in range(5):
        x, y = r.randrange(T), r.randrange(T)
        shape = TUFT2 if r.random() < 0.5 else TUFT
        t.blot(x, y + 1, [(dx, 0) for dx in range(3)], P['dk'])
        t.blot(x, y, shape, P['li'])
        t.put(x + 1, y - (2 if shape is TUFT2 else 1), P['hi'])
    for _ in range(4):
        x, y = r.randrange(T), r.randrange(T)
        t.blot(x, y, BLADE, P['hi'] if r.random() < 0.4 else P['li'])
    if flowers:
        for _ in range(nflow):
            x, y = r.randrange(1, T - 2), r.randrange(2, T - 1)
            c1, c2, cc = flowers
            t.put(x, y + 1, P['dk'])
            t.put(x - 1, y, c1); t.put(x + 1, y, c1); t.put(x, y - 1, c2); t.put(x, y + 1, c1); t.put(x, y, cc)
    if petals:
        for _ in range(4):
            x, y = r.randrange(T), r.randrange(T)
            t.put(x, y, petals[0]); t.put(x + 1, y, petals[1])
    return t

def dirt_tile(seed, P=DIRT):
    r = random.Random(seed)
    t = Tile(P['base'])
    for _ in range(3):
        cx, cy = r.randrange(T), r.randrange(T)
        for dy in range(-1, 2):
            for dx in range(-3, 4):
                if abs(dx) + 2 * abs(dy) <= 3: t.put(cx + dx, cy + dy, P['md'])
    for _ in range(2):
        cx, cy = r.randrange(T), r.randrange(T)
        for dx in range(-2, 3): t.put(cx + dx, cy, P['dk'])
    for _ in range(4):  # камешки: тень снизу-справа, блик сверху-слева
        x, y = r.randrange(T), r.randrange(T)
        big = r.random() < 0.4
        t.put(x, y, P['li']); 
        if big: t.put(x + 1, y, P['li']); t.put(x + 1, y + 1, P['sh']); t.put(x, y + 1, P['dk']); t.put(x, y - 0, P['hi'])
        else: t.put(x + 1, y + 1, P['sh'])
    return t

def stones_tile(seed, P=COBBLE, layout=None):
    """Брусчатка: скруглённые камни с собственным светом/тенью и тёмными швами."""
    r = random.Random(seed)
    t = Tile(P['gap'])
    stones = layout or [(0, 0, 7, 5), (8, 0, 7, 6), (0, 6, 5, 5), (6, 7, 6, 4), (13, 7, 3, 5), (0, 12, 8, 4), (9, 12, 7, 4)]
    for (x0, y0, w, h) in stones:
        for y in range(h):
            for x in range(w):
                corner = (x in (0, w - 1)) and (y in (0, h - 1))
                if corner: continue
                c = P['base']
                if y == 0 or x == 0: c = P['li']
                if y == h - 1 or x == w - 1: c = P['sh']
                t.put(x0 + x, y0 + y, c)
        t.put(x0 + 1, y0 + 1, P['hi'])
        if w > 4 and r.random() < 0.6: t.put(x0 + 2, y0 + 1, P['hi'])
    return t

def plaza_tile(variant, P=PLAZA):
    """Плиты площади 32×32 (2×2 тайла): variant 0..3 — четверть большой плиты; 4 — центр с руной."""
    t = Tile(P['base'])
    qx, qy = variant % 2, variant // 2
    for i in range(T):
        # шов по краю большой плиты (левый/верхний край у четверти 0)
        if qx == 0: t.put(0, i, P['gap']); t.put(1, i, P['li'])
        if qy == 0: t.put(i, 0, P['gap']); t.put(i, 1, P['li'])
        if qx == 1: t.put(T - 1, i, P['sh'])
        if qy == 1: t.put(i, T - 1, P['sh'])
    # тонкие трещины и потёртости
    r = random.Random(77 + variant)
    x, y = r.randrange(4, 12), r.randrange(4, 12)
    for k in range(5):
        t.put(x, y, P['gap']); x += r.choice((0, 1)); y += 1
    t.put(r.randrange(3, 13), r.randrange(3, 13), P['hi'])
    t.put(r.randrange(3, 13), r.randrange(3, 13), P['sh'])
    return t

def plaza_rune():
    t = plaza_tile(0)
    P = PLAZA
    t = Tile(P['base'])
    for i in range(T):
        t.put(0, i, P['gap']); t.put(i, 0, P['gap']); t.put(T - 1, i, P['sh']); t.put(i, T - 1, P['sh'])
    # руна-ромб с глазом (символ Мэлвелдила)
    ring = [(8, 3), (9, 4), (10, 5), (11, 6), (12, 7), (11, 8), (10, 9), (9, 10), (8, 11), (7, 10), (6, 9), (5, 8), (4, 7), (5, 6), (6, 5), (7, 4)]
    for (x, y) in ring: t.put(x, y, P['rune'])
    for (x, y) in [(8, 6), (7, 7), (8, 7), (9, 7), (8, 8)]: t.put(x, y, P['rune2'])
    return t

def water_tile(frame):
    P = WATER
    t = Tile(P['base'])
    r = random.Random(11)
    for _ in range(3):
        cx, cy = r.randrange(T), r.randrange(T)
        for dx in range(-3, 4): t.put(cx + dx, cy, P['dp']); t.put(cx + dx, cy + 1, P['dp'])
    for k in range(4):
        x, y = (k * 5 + frame * 2) % T, (k * 7 + 3) % T
        t.put(x, y, P['li']); t.put(x + 1, y, P['li']); t.put(x + 2, y, P['hi']); t.put(x + 3, y, P['li'])
    t.put((3 + frame * 3) % T, (11 + frame) % T, P['foam'])
    return t

def waste_tile(seed):
    P = WASTE; r = random.Random(seed)
    t = Tile(P['base'])
    for _ in range(3):
        cx, cy = r.randrange(T), r.randrange(T)
        for dy in range(-2, 3):
            for dx in range(-2, 3):
                if abs(dx) + abs(dy) <= 2: t.put(cx + dx, cy + dy, P['md'])
    # трещины-плитняк
    x, y = r.randrange(T), 0
    for k in range(T):
        t.put(x, y, P['sh']); y += 1; x += r.choice((-1, 0, 1))
    for _ in range(3):
        x, y = r.randrange(T), r.randrange(T)
        t.put(x, y, P['li']); t.put(x + 1, y, P['hi'])
    if r.random() < 0.7:  # звёздная пыль
        x, y = r.randrange(T), r.randrange(T)
        t.put(x, y, P['star'])
    return t

def rot_tile(seed):
    P = ROT; r = random.Random(seed)
    t = Tile(P['base'])
    for _ in range(3):
        cx, cy = r.randrange(T), r.randrange(T)
        for dy in range(-1, 2):
            for dx in range(-3, 4):
                if abs(dx) + 2 * abs(dy) <= 3: t.put(cx + dx, cy + dy, P['md'])
    for _ in range(2):  # мох
        cx, cy = r.randrange(T), r.randrange(T)
        for (dx, dy) in [(0, 0), (1, 0), (2, 0), (1, -1), (-1, 0), (0, 1), (1, 1)]: t.put(cx + dx, cy + dy, P['moss'])
        t.put(cx + 1, cy - 1, P['moss2'])
    if r.random() < 0.6:  # сбойные пиксели-«глитчи»
        x, y = r.randrange(T), r.randrange(T)
        t.put(x, y, P['glow']); t.put(x + 1, y, P['moss2'])
    for _ in range(3):
        t.put(r.randrange(T), r.randrange(T), P['sh'])
    return t

def crater_tile(seed):
    P = CRATER; r = random.Random(seed)
    t = Tile(P['base'])
    for _ in range(3):
        cx, cy = r.randrange(T), r.randrange(T)
        for dy in range(-2, 3):
            for dx in range(-3, 4):
                if abs(dx) + abs(dy) <= 3: t.put(cx + dx, cy + dy, P['md'])
    # маленький кратер: тёмная чаша, светлый нижний край
    cx, cy = r.randrange(3, 13), r.randrange(3, 13)
    for dx in range(-2, 3): t.put(cx + dx, cy, P['sh'])
    for dx in range(-1, 2): t.put(cx + dx, cy - 1, P['sh'])
    for dx in range(-1, 2): t.put(cx + dx, cy + 1, P['li'])
    if r.random() < 0.5:
        x, y = r.randrange(T), r.randrange(T)
        t.put(x, y, P['cry']); t.put(x, y - 1, P['cry2'])
    return t

def sand_tile(seed):
    P = SAND; r = random.Random(seed)
    t = Tile(P['base'])
    for k in range(3):
        y = r.randrange(T); x = r.randrange(T)
        for dx in range(5): t.put(x + dx, y + (1 if dx > 2 else 0), P['li'])
        for dx in range(5): t.put(x + dx, y + 1 + (1 if dx > 2 else 0), P['sh'])
    t.put(r.randrange(T), r.randrange(T), P['hi'])
    return t

def wood_tile(seed):
    P = WOOD; r = random.Random(seed)
    t = Tile(P['base'])
    for y in range(T):
        if y % 4 == 3:
            for x in range(T): t.put(x, y, P['gap'])
        elif y % 4 == 0:
            for x in range(T): t.put(x, y, P['li'])
    for k in range(4):
        y = k * 4; x = (r.randrange(T))
        for yy in range(3): t.put(x, y + yy, P['gap'])
        t.put(r.randrange(T), y + 1, P['sh']); t.put(r.randrange(T), y + 1, P['sh'])
        t.put((x + 3) % T, y + 2, P['hi'])
    return t

def brick_tile(seed, moss=False):
    P = BRICK; r = random.Random(seed)
    t = Tile(P['gap'])
    for row in range(4):
        y0 = row * 4; off = 4 if row % 2 else 0
        for b in range(-1, 3):
            x0 = b * 8 + off
            for y in range(3):
                for x in range(7):
                    c = P['base']
                    if y == 0: c = P['li']
                    if x == 6 or y == 2: c = P['sh']
                    t.put(x0 + x, y0 + y, c)
            t.put(x0 + 1, y0, P['hi'])
    if moss:
        for x in range(T):
            h = 1 + (r.random() < 0.5) + (r.random() < 0.25)
            for y in range(h): t.put(x, y, P['moss'] if y < h - 1 else '#2b4d34')
    return t

def wall_top_tile(seed):
    P = BRICK; r = random.Random(seed)
    t = Tile(P['li'])
    for i in range(T):
        t.put(i, 0, P['hi']); t.put(i, T - 1, P['sh']); t.put(0, i, P['hi']); t.put(T - 1, i, P['sh'])
    for k in range(3):
        x, y = r.randrange(2, 14), r.randrange(2, 14)
        t.put(x, y, P['base']); t.put(x + 1, y, P['base'])
    for x in range(3, 13, 4): t.put(x, 7, P['base'])
    return t

# ----- кромки: трава нависает над дорогой (N/S/E/W + внешние углы) -----
def fringe(side, P=GRASS):
    """Прозрачный тайл: зубчатая кромка травы с тенью под ней, рисуется поверх дороги/камня у травы."""
    t = Tile(None)
    r = random.Random(hash(side) & 0xffff)
    depth = [2 + ((i * 7 + 3) % 3 == 0) + ((i * 5) % 4 == 0) for i in range(T)]
    for i in range(T):
        d = depth[i]
        for k in range(d):
            c = P['base'] if k < d - 1 else P['li']
            if k == 0: c = P['md']
            if side == 'n': t.put(i, k, c, False)
            if side == 's': t.put(i, T - 1 - k, P['md'] if k < d - 1 else P['li'], False)
            if side == 'w': t.put(k, i, c, False)
            if side == 'e': t.put(T - 1 - k, i, c, False)
        # тень под кромкой (на земле)
        sh = (0, 0, 0, 90)
        if side == 'n': t.put(i, d, sh, False)
        if side == 'w': t.put(d, i, sh, False)
        if side == 'e': t.put(T - 1 - d, i, sh, False)
        if side == 's': t.put(i, T - 1 - d, P['hi'] if i % 5 == 2 else P['li'], False)
    return t

def corner(which, P=GRASS):
    """Внешний угол (трава только по диагонали): маленький «клин»."""
    t = Tile(None)
    pts = [(0, 0), (1, 0), (2, 0), (0, 1), (1, 1), (0, 2)]
    for (x, y) in pts:
        X = x if which in ('nw', 'sw') else T - 1 - x
        Y = y if which in ('nw', 'ne') else T - 1 - y
        t.put(X, Y, P['md'] if (x + y) < 2 else P['li'], False)
    return t

def curb(side):
    """Бордюр площади: тёмный шов + светлая фаска, поверх соседней земли."""
    P = PLAZA; t = Tile(None)
    for i in range(T):
        if side == 'n': t.put(i, 0, P['gap'], False); t.put(i, 1, (0, 0, 0, 70), False)
        if side == 's': t.put(i, T - 1, P['hi'], False); t.put(i, T - 2, P['li'], False)
        if side == 'w': t.put(0, i, P['gap'], False); t.put(1, i, (0, 0, 0, 70), False)
        if side == 'e': t.put(T - 1, i, P['sh'], False)
    return t

def shore(side):
    """Берег: светлая пена у края воды (рисуется на тайле воды со стороны суши)."""
    P = WATER; t = Tile(None)
    for i in range(T):
        w = 1 + ((i * 3) % 5 == 0)
        for k in range(w + 1):
            c = '#2a3a4a' if k == 0 else P['foam']
            if side == 'n': t.put(i, k, c, False)
            if side == 's': t.put(i, T - 1 - k, c, False)
            if side == 'w': t.put(k, i, c, False)
            if side == 'e': t.put(T - 1 - k, i, c, False)
    return t

def build():
    tiles = []
    def add(name, tile): tiles.append((name, tile))
    for i in range(4): add(f'grass{i}', grass_tile(100 + i))
    for i in range(3): add(f'grass_violet{i}', grass_tile(200 + i, flowers=('#8b4fe0', '#c49bff', '#fde68a'), nflow=2 + i % 2))
    for i in range(2): add(f'grass_white{i}', grass_tile(250 + i, flowers=('#dfe6ff', '#ffffff', '#f6c453'), nflow=2))
    for i in range(3): add(f'garden{i}', grass_tile(300 + i, P=GARDEN, petals=('#be123c', '#f43f5e') if i else None))
    add('garden_flowers', grass_tile(310, P=GARDEN, flowers=('#e11d48', '#fb7185', '#fde68a'), nflow=3))
    for i in range(3): add(f'dirt{i}', dirt_tile(400 + i))
    for i in range(3): add(f'cobble{i}', stones_tile(500 + i, layout=None if i == 0 else [(0, 0, 6, 5), (7, 0, 9, 5), (0, 6, 8, 5), (9, 6, 7, 5), (0, 12, 5, 4), (6, 12, 10, 4)] if i == 1 else [(0, 0, 8, 6), (9, 0, 7, 4), (9, 5, 7, 6), (0, 7, 8, 4), (0, 12, 6, 4), (7, 12, 9, 4)]))
    for v in range(4): add(f'plaza{v}', plaza_tile(v))
    add('plaza_rune', plaza_rune())
    for f in range(3): add(f'water{f}', water_tile(f))
    for i in range(4): add(f'waste{i}', waste_tile(600 + i))
    for i in range(4): add(f'rot{i}', rot_tile(700 + i))
    for i in range(4): add(f'crater{i}', crater_tile(800 + i))
    for i in range(2): add(f'sand{i}', sand_tile(900 + i))
    for i in range(2): add(f'wood{i}', wood_tile(950 + i))
    add('brick0', brick_tile(1)); add('brick1', brick_tile(2)); add('brick_moss', brick_tile(3, True))
    add('wall_top', wall_top_tile(5))
    for s in 'nsew': add(f'fringe_{s}', fringe(s))
    for c in ('nw', 'ne', 'sw', 'se'): add(f'corner_{c}', corner(c))
    for s in 'nsew': add(f'curb_{s}', curb(s))
    for s in 'nsew': add(f'shore_{s}', shore(s))
    rows = (len(tiles) + COLS - 1) // COLS
    atlas = Image.new('RGBA', (COLS * T, rows * T))
    index = {}
    for i, (name, tile) in enumerate(tiles):
        atlas.paste(tile.im, ((i % COLS) * T, (i // COLS) * T))
        index[name] = i
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    atlas.save(OUT)
    json.dump({'tile': T, 'cols': COLS, 'rows': rows, 'index': index}, open(OUT.replace('.png', '.json'), 'w'), ensure_ascii=False, indent=0)
    bg = Image.new('RGBA', atlas.size, (40, 40, 48, 255)); bg.alpha_composite(atlas)
    os.makedirs(PREV, exist_ok=True)
    bg.resize((atlas.width * 4, atlas.height * 4), Image.NEAREST).save(os.path.join(PREV, 'tiles_atlas_x4.png'))
    print('tiles', len(tiles), atlas.size)

if __name__ == '__main__':
    build()
