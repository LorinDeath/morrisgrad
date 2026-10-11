"""Пропсы окружения 2.5D (единый масштаб 10 px = 1 м): деревья (в т.ч. гранатовые), фиалки, фонари,
кристаллы, руины, алтарь, арка портала, бочки, костёр и т.д. Ячейка 32×48, низ ячейки = земля.
Рисуется кодом через pixkit (4-тоновые материалы, свет сверху-слева, цветной тёмный контур).
Выход: src/assets/mc/props_atlas.png + props_atlas.json {cell, cols, index: name → [col,row,h_m]}.
"""
import os, json, math, random
from PIL import Image
from pixkit import Sprite, Mat, hexc

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
OUT = os.path.join(ROOT, 'src', 'assets', 'mc', 'props_atlas.png')
PREV = '/workspace/morrisgrad-round2/sprites'
W, H, COLS = 32, 48, 8
G = H - 2  # линия земли

def foliage(s, cx, cy, r, mat, seed, clusters=7):
    rnd = random.Random(seed)
    s.ellipse(cx, cy, r, r * 0.85, mat)
    for i in range(clusters):
        a = rnd.random() * math.pi * 2; d = r * (0.45 + rnd.random() * 0.4)
        s.ellipse(cx + math.cos(a) * d, cy + math.sin(a) * d * 0.8 - 1, r * 0.42, r * 0.36, mat)
    # блики листвы сверху-слева
    for i in range(5):
        a = math.pi * (1.1 + rnd.random() * 0.6); d = r * (0.3 + rnd.random() * 0.45)
        s.px(cx + math.cos(a) * d, cy + math.sin(a) * d * 0.8, mat.r[4] + (255,))

def trunk(s, x, top, w, mat):
    s.poly([(x - w, G), (x + w, G), (x + w * 0.6, top), (x - w * 0.6, top)], mat)
    s.px(x - w - 1, G, mat.r[1] + (255,)); s.px(x + w + 1, G, mat.r[1] + (255,))

def tree(s):
    bark = Mat('#5a3d2e'); leaf = Mat('#2f6b4a')
    trunk(s, 16, 26, 3, bark)
    foliage(s, 16, 17, 11, leaf, 3)

def pome_tree(s):
    bark = Mat('#6b4632'); leaf = Mat('#2f6a3f')
    trunk(s, 16, 26, 3, bark)
    foliage(s, 16, 18, 11, leaf, 7)
    rnd = random.Random(9)
    fruit = Mat('#d6304f')
    for i in range(7):
        x = 8 + rnd.random() * 16; y = 12 + rnd.random() * 12
        s.ellipse(x, y, 1.6, 1.6, fruit)
        s.px(x - 0.5, y - 0.7, (255, 190, 200, 255))

def dead_tree(s):
    bark = Mat('#4b3b46')
    trunk(s, 16, 18, 3, bark)
    s.limb(16, 22, 8, 12, 1.2, bark, r1=0.6); s.limb(16, 20, 24, 10, 1.2, bark, r1=0.6); s.limb(16, 18, 15, 6, 1.1, bark, r1=0.5)
    s.limb(10, 15, 6, 13, 0.6, bark)

def bush(s):
    foliage(s, 16, G - 6, 8, Mat('#2d5f45'), 11, 5)

def violets(s):
    leaf = Mat('#2f6a46'); pet = Mat('#8b5cf6'); pet2 = Mat('#c4b5fd')
    rnd = random.Random(4)
    for i in range(9):
        x = 6 + rnd.random() * 20; y = G - 2 - rnd.random() * 9
        s.limb(x, G, x + rnd.uniform(-1, 1), y + 2, 0.4, leaf)
        m = pet if i % 3 else pet2
        for dx, dy in ((-1, 0), (1, 0), (0, -1), (0, 1)): s.px(x + dx, y + dy, m.r[2 + (dx < 0) + (dy < 0)] + (255,))
        s.px(x, y, (250, 224, 120, 255))

def rock(s):
    st = Mat('#5b5874')
    s.poly([(6, G), (26, G), (24, G - 8), (18, G - 12), (10, G - 10), (7, G - 5)], st)
    s.line(12, G - 8, 15, G - 5, st.r[1] + (255,))

def lantern(s):
    iron = Mat('#2f2c3d'); glow = Mat('#ffd27a', glow=True)
    s.rect(15, 14, 16, G, iron)
    s.rect(12, G, 19, G, iron)
    s.rect(12, 8, 19, 15, iron)
    s.rect(13, 9, 18, 14, glow)
    s.poly([(11, 8), (20, 8), (15.5, 4)], iron)

def crystal(s):
    c = Mat('#8b7cf6'); c2 = Mat('#c4b5fd')
    s.poly([(12, G), (17, G), (16, G - 22), (13, G - 18)], c)
    s.poly([(16, G), (22, G), (22, G - 13), (19, G - 16)], c2)
    s.poly([(9, G), (13, G), (11, G - 10)], c)
    s.line(14, G - 17, 14, G - 6, (240, 230, 255, 255), glow=True)

def ruin_pillar(s):
    st = Mat('#5a5772'); moss = Mat('#3c6b3e')
    s.rect(11, 14, 20, G, st)
    s.rect(9, G - 2, 22, G, st)
    s.poly([(10, 14), (21, 14), (20, 10), (14, 8), (11, 11)], st)
    for y in range(18, G - 2, 5): s.line(11, y, 20, y, st.r[1] + (255,))
    s.ellipse(12, G - 6, 2.5, 3, moss); s.ellipse(19, 16, 2, 1.5, moss)

def obelisk(s):
    st = Mat('#3e3a58'); rune = Mat('#b98cff', glow=True)
    s.poly([(11, G), (21, G), (19, 10), (16, 4), (13, 10)], st)
    for y in (16, 22, 28, 34): s.px(16, y, rune.r[3] + (255,), glow=True); s.px(15, y + 1, rune.r[3] + (255,), glow=True)

def altar(s):
    st = Mat('#6a6788'); gold = Mat('#d4a73a'); cry = Mat('#7dd3fc', glow=True)
    s.rect(4, G - 6, 27, G, st)
    s.rect(7, G - 12, 24, G - 6, st)
    s.line(4, G - 6, 27, G - 6, gold.r[3] + (255,))
    s.poly([(13, G - 12), (18, G - 12), (17, G - 26), (15.5, G - 30), (14, G - 26)], cry)
    s.px(15, G - 24, (255, 255, 255, 255), glow=True)

def portal_arch(s):
    st = Mat('#4a4766')
    s.rect(4, 12, 8, G, st); s.rect(23, 12, 27, G, st)
    for i in range(24):
        a = math.pi * i / 23
        s.ellipse(15.5 - math.cos(a) * 9.5, 13 - math.sin(a) * 8, 2.6, 2.6, st)
    for y in range(18, G, 6): s.line(4, y, 8, y, st.r[1] + (255,)); s.line(23, y, 27, y, st.r[1] + (255,))

def portal_swirl(s):
    for r in range(9, 0, -1):
        c = (int(120 + r * 12), int(60 + r * 8), 255, 255)
        s.fill(s.ellipse_px(15.5, 27, r, r * 1.5), Mat('#000000', glow=True)); 
        for (x, y) in s.ellipse_px(15.5, 27, r, r * 1.5): s.px(x, y, c, glow=True)

def barrel(s):
    wood = Mat('#7a5336'); iron = Mat('#3b3850')
    s.ellipse(16, G - 7, 7, 8, wood, mode='box')
    s.rect(9, G - 11, 23, G - 10, iron); s.rect(9, G - 4, 23, G - 3, iron)

def crate(s):
    wood = Mat('#8a6440')
    s.rect(8, G - 14, 24, G, wood)
    s.line(8, G - 14, 24, G, wood.r[1] + (255,)); s.line(24, G - 14, 8, G, wood.r[1] + (255,))
    s.rect(8, G - 14, 24, G - 13, wood, tone=3)

def campfire(s):
    log = Mat('#5a3d2e'); f1 = Mat('#ff9a3c', glow=True); f2 = Mat('#ffe08a', glow=True)
    s.limb(8, G - 1, 24, G - 3, 1.5, log); s.limb(8, G - 3, 24, G - 1, 1.5, log)
    s.poly([(10, G - 3), (22, G - 3), (16, G - 18)], f1)
    s.poly([(13, G - 3), (19, G - 3), (16, G - 11)], f2)

def torch(s):
    wood = Mat('#5a3d2e'); f1 = Mat('#ff9a3c', glow=True); f2 = Mat('#ffe08a', glow=True)
    s.rect(15, 18, 16, G, wood)
    s.poly([(13, 18), (19, 18), (16, 8)], f1); s.poly([(15, 18), (17, 18), (16, 12)], f2)

def fence(s):
    wood = Mat('#7a5336')
    for x in (4, 15, 26): s.rect(x, G - 14, x + 2, G, wood)
    s.rect(2, G - 11, 29, G - 10, wood); s.rect(2, G - 5, 29, G - 4, wood)

def signpost(s):
    wood = Mat('#7a5336')
    s.rect(15, G - 18, 16, G, wood)
    s.poly([(8, G - 20), (24, G - 20), (26, G - 17), (24, G - 14), (8, G - 14)], wood)

def mushroom(s):
    stem = Mat('#e6dcc8'); cap = Mat('#9b5de5')
    for (x, r) in ((12, 5), (21, 3.5)):
        s.rect(x - 1, G - r - 3, x + 1, G, stem)
        s.ellipse(x, G - r - 4, r, r * 0.7, cap)
        s.px(x - 1, G - r - 5, (255, 230, 255, 255))

def glitch_shard(s):
    g = Mat('#4ade80', glow=True); d = Mat('#14532d')
    s.poly([(12, G), (20, G), (19, G - 20), (14, G - 24)], d)
    for y in range(G - 22, G, 3): s.line(13, y, 19, y, (90, 255, 160, 255), glow=True)
    s.rect(21, G - 16, 24, G - 14, g); s.rect(8, G - 10, 10, G - 9, g)

def pylon(s):
    met = Mat('#4b4e63'); led = Mat('#a78bfa', glow=True)
    s.poly([(9, G), (23, G), (21, 8), (11, 8)], met)
    s.rect(10, 6, 22, 8, met)
    for y in range(12, G - 2, 4):
        s.line(12, y, 20, y, met.r[1] + (255,))
        s.px(18, y + 1, led.r[3] + (255,), glow=True)

def tombstone(s):
    st = Mat('#6b6884')
    s.poly([(10, G), (22, G), (22, G - 12), (19, G - 16), (13, G - 16), (10, G - 12)], st)
    s.line(16, G - 13, 16, G - 6, st.r[1] + (255,)); s.line(13, G - 10, 19, G - 10, st.r[1] + (255,))

def ore_node(s):
    st = Mat('#4b4a3a'); ore = Mat('#a3e635', glow=True)
    s.poly([(6, G), (26, G), (23, G - 10), (15, G - 13), (8, G - 8)], st)
    for (x, y) in ((12, G - 7), (18, G - 9), (21, G - 4), (10, G - 3)): s.rect(x, y, x + 1, y + 1, ore)

def star_crystal(s):
    c = Mat('#cbd5e1'); g = Mat('#e0f2fe', glow=True)
    s.poly([(10, G), (15, G), (14, G - 16)], c); s.poly([(15, G), (21, G), (19, G - 12)], c); s.poly([(13, G), (17, G), (16, G - 20)], c)
    s.px(16, G - 15, g.r[3] + (255,), glow=True)

def well(s):
    st = Mat('#5f5c78'); wood = Mat('#7a5336'); water = Mat('#2b4787')
    s.ellipse(16, G - 4, 10, 4, st)
    s.ellipse(16, G - 5, 7, 2.2, water)
    s.rect(6, G - 20, 7, G - 4, wood); s.rect(25, G - 20, 26, G - 4, wood)
    s.poly([(4, G - 20), (28, G - 20), (16, G - 28)], Mat('#8a3a3a'))

PROPS = [
    ('tree', tree, 4.6), ('pome_tree', pome_tree, 4.6), ('dead_tree', dead_tree, 4.4), ('bush', bush, 2.0),
    ('violets', violets, 1.6), ('rock', rock, 1.6), ('lantern', lantern, 3.6), ('crystal', crystal, 3.2),
    ('ruin_pillar', ruin_pillar, 4.0), ('obelisk', obelisk, 4.6), ('altar', altar, 3.4), ('portal_arch', portal_arch, 4.8),
    ('portal_swirl', portal_swirl, 4.8), ('barrel', barrel, 1.8), ('crate', crate, 1.8), ('campfire', campfire, 2.0),
    ('torch', torch, 3.2), ('fence', fence, 1.8), ('signpost', signpost, 2.4), ('mushroom', mushroom, 1.4),
    ('glitch_shard', glitch_shard, 3.0), ('pylon', pylon, 4.6), ('tombstone', tombstone, 1.8), ('ore_node', ore_node, 1.6),
    ('star_crystal', star_crystal, 2.4), ('well', well, 3.0),
]

def main():
    rows = (len(PROPS) + COLS - 1) // COLS
    atlas = Image.new('RGBA', (W * COLS, H * rows), (0, 0, 0, 0))
    index = {}
    for i, (name, fn, hm) in enumerate(PROPS):
        s = Sprite(W, H); fn(s)
        im = s.render(outline=True)
        c, r = i % COLS, i // COLS
        atlas.paste(im, (c * W, r * H))
        index[name] = [c, r, hm]
    atlas.save(OUT)
    json.dump({'cell': [W, H], 'cols': COLS, 'rows': rows, 'index': index}, open(OUT.replace('.png', '.json'), 'w'), indent=0)
    os.makedirs(PREV, exist_ok=True)
    bg = Image.new('RGBA', atlas.size, (40, 52, 60, 255)); bg.alpha_composite(atlas)
    bg.resize((atlas.width * 4, atlas.height * 4), Image.NEAREST).save(os.path.join(PREV, 'props_atlas_x4.png'))
    print('props', len(PROPS), atlas.size)

if __name__ == '__main__':
    main()
