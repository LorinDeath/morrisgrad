"""Иконки всех предметов библиотеки (345) — пиксель-арт 16×16 в рамке редкости 20×20.
Источник списка — сид D1 (server/migrations/0002_item_library_seed.sql, порядок = индекс в пуле `n`),
облик — ручные шаблоны icon_templates.py по слоту/типу оружия/семейству Отголоска;
палитра дисциплинирована: металл по редкости (4 тона), акцент = цвет Отголоска-комплекта (3 тона),
кожа/дерево (3 тона), камень = цвет редкости; контур — цветной тёмный по соседнему материалу.
Выход: src/assets/mc/items_atlas.png + .json {cell, icon, cols, count}; превью /workspace/morrisgrad-round2/sprites/items_atlas_x4.png
"""
import os, re, json, sys
from PIL import Image
sys.path.insert(0, os.path.dirname(__file__))
from pixkit import ramp, hexc, mix
from icon_templates import T

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
OUT = os.path.join(ROOT, 'src', 'assets', 'mc', 'items_atlas.png')
PREV = '/workspace/morrisgrad-round2/sprites'
CELL, ICON, COLS = 20, 16, 20

METAL = {'common': '#9aa3b5', 'uncommon': '#b9c6d6', 'rare': '#8cc4ff', 'epic': '#c8a2ff', 'legendary': '#ffcf5a', 'mythic': '#ff8fd0'}
RCOL = {'common': '#cbd5e1', 'uncommon': '#4ade80', 'rare': '#60a5fa', 'epic': '#c084fc', 'legendary': '#fbbf24', 'mythic': '#f472b6'}
LEATHER = '#8a5a2b'

PLATE = {'golem', 'knight', 'baron_l', 'warden_boss', 'sentinel_huge', 'crab', 'beetle', 'skeleton', 'star_l', 'drake'}
CLOTH = {'ghost', 'shade', 'thin', 'wisp', 'choir', 'weaver', 'silencer_huge', 'moth', 'pixie', 'jelly', 'queen_huge', 'eye'}
HORN = {'imp', 'dryad_boss', 'stag_l', 'drake', 'queen_huge', 'star_l', 'mantis', 'fan_l'}

def sql_rows(path):
    s = open(path, encoding='utf8').read()
    rows = []
    for m in re.finditer(r"^  \((.*)\)[,;]?\s*$", s, re.M):
        body = m.group(1); vals = []; i = 0
        while i < len(body):
            if body[i] == "'":
                j = i + 1; buf = ''
                while True:
                    if body[j] == "'" and j + 1 < len(body) and body[j + 1] == "'": buf += "'"; j += 2; continue
                    if body[j] == "'": break
                    buf += body[j]; j += 1
                vals.append(buf); i = j + 1
            elif body[i] in ', ': i += 1
            else:
                j = i
                while j < len(body) and body[j] != ',': j += 1
                tok = body[i:j].strip(); vals.append(None if tok == 'NULL' else tok); i = j
        rows.append(vals)
    return rows

def items():
    out = []
    for v in sql_rows(os.path.join(ROOT, 'server', 'migrations', '0002_item_library_seed.sql')):
        if len(v) == 17 and v[2] in ('weapon', 'helmet', 'armor', 'legs', 'hands'):
            out.append({'id': v[0], 'slot': v[2], 'rarity': v[3], 'lvl': int(v[4]), 'wtype': v[6], 'set': v[11]})
    return out

src = open(os.path.join(ROOT, 'server', 'meta', 'generated', 'public.ts'), encoding='utf8').read()
MOBS = json.loads(re.search(r'MOBS_PUBLIC: Record<string, MobPublic> = (\{.*\});', src).group(1))

def template(it):
    fam = ((MOBS.get(it['set']) or {}).get('art') or {}).get('fam', '')
    s = it['slot']
    if s == 'weapon': return T.get(it['wtype'] or 'sword', T['sword'])
    if s == 'helmet': return T['helm'] if fam in PLATE else T['hood'] if fam in CLOTH else T['horned'] if fam in HORN else T['cap']
    if s == 'armor': return T['plate'] if fam in PLATE else T['robe'] if fam in CLOTH else T['vest']
    if s == 'legs': return T['greaves'] if fam in PLATE else T['boots']
    return T['gauntlet'] if fam in PLATE else T['glove']

def icon(it):
    mob = MOBS.get(it['set']) or {}
    acc = mob.get('color') or '#a78bfa'
    M = ramp(METAL[it['rarity']]); A = ramp(acc); W = ramp(mix(hexc(LEATHER), hexc(acc), 0.18)); Gm = ramp(RCOL[it['rarity']])
    key = {'1': M[4], '2': M[3], '3': M[2], '4': M[1], 'a': A[3], 'b': A[2], 'c': A[1], 'w': W[3], 'x': W[2], 'y': W[1],
           'g': Gm[4], 'G': Gm[2], 'h': (255, 255, 255)}
    deep = {'1': M[0], '2': M[0], '3': M[0], '4': M[0], 'a': A[0], 'b': A[0], 'c': A[0], 'w': W[0], 'x': W[0], 'y': W[0], 'g': Gm[0], 'G': Gm[0], 'h': M[0]}
    rows = template(it)
    im = Image.new('RGBA', (ICON, ICON), (0, 0, 0, 0)); p = im.load()
    for y, r in enumerate(rows):
        for x, ch in enumerate(r):
            if ch in key: p[x, y] = key[ch] + (255,)
    for y, r in enumerate(rows):  # цветной контур: глубокий тон материала-соседа
        for x, ch in enumerate(r):
            if ch != 'o': continue
            nb = None
            for dx, dy in ((0, 1), (1, 0), (-1, 0), (0, -1), (1, 1), (-1, -1), (1, -1), (-1, 1)):
                xx, yy = x + dx, y + dy
                if 0 <= xx < ICON and 0 <= yy < ICON and rows[yy][xx] in deep: nb = deep[rows[yy][xx]]; break
            p[x, y] = mix(nb or (24, 16, 34), (16, 10, 24), 0.45) + (255,)
    # редкие и выше — искры
    if it['rarity'] in ('epic', 'legendary', 'mythic'):
        g = Gm[4] + (255,)
        for (x, y) in ((13, 2), (14, 3), (2, 12)) if it['rarity'] != 'epic' else ((13, 2),):
            if p[x, y][3] == 0: p[x, y] = g
    return im

def frame(rarity):
    c = hexc(RCOL[rarity]); im = Image.new('RGBA', (CELL, CELL), (0, 0, 0, 0)); p = im.load()
    bg0, bg1 = mix(c, (14, 10, 24), 0.86), mix(c, (14, 10, 24), 0.74)
    for y in range(CELL):
        for x in range(CELL):
            d = max(abs(x - 9.5), abs(y - 9.5))
            if d > 9.5: continue
            p[x, y] = (bg1 if (x + y) % 2 == 0 and d > 6 else bg0) + (255,)
            if d > 8.6: p[x, y] = mix(c, (20, 14, 30), 0.35) + (255,)
    for (x, y) in ((0, 0), (19, 0), (0, 19), (19, 19)): p[x, y] = (0, 0, 0, 0)
    for (x, y) in ((1, 1), (18, 1), (1, 18), (18, 18)): p[x, y] = mix(c, (255, 255, 255), 0.5) + (255,)
    return im

def main():
    its = items()
    rows = (len(its) + COLS - 1) // COLS
    atlas = Image.new('RGBA', (COLS * CELL, rows * CELL), (0, 0, 0, 0))
    for i, it in enumerate(its):
        cell = frame(it['rarity']); cell.alpha_composite(icon(it), (2, 2))
        atlas.paste(cell, ((i % COLS) * CELL, (i // COLS) * CELL))
    atlas.save(OUT)
    json.dump({'cell': CELL, 'icon': ICON, 'cols': COLS, 'count': len(its)}, open(OUT.replace('.png', '.json'), 'w'))
    os.makedirs(PREV, exist_ok=True)
    bg = Image.new('RGBA', atlas.size, (30, 24, 44, 255)); bg.alpha_composite(atlas)
    bg.resize((atlas.width * 4, atlas.height * 4), Image.NEAREST).save(os.path.join(PREV, 'items_atlas_x4.png'))
    # крупный образец: по одному на шаблон
    seen = {}; 
    for i, it in enumerate(its):
        k = (it['slot'], it['wtype'] or id(template(it)))
        seen.setdefault(str(k), i)
    pick = list(seen.values())[:24]
    sm = Image.new('RGBA', (len(pick) * CELL, CELL), (30, 24, 44, 255))
    for j, i in enumerate(pick): sm.alpha_composite(atlas.crop(((i % COLS) * CELL, (i // COLS) * CELL, (i % COLS + 1) * CELL, (i // COLS + 1) * CELL)), (j * CELL, 0))
    sm.resize((sm.width * 8, sm.height * 8), Image.NEAREST).save(os.path.join(PREV, 'items_templates_x8.png'))
    print('icons', len(its), atlas.size)

if __name__ == '__main__':
    main()
