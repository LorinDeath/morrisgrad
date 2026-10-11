#!/usr/bin/env python3
"""Пикселизация рендеров low-poly героев → спрайт-листы в стиле проекта.

Вход: /tmp/hero_raw_<class>.png (рендер tools/mc-sprites/sheet.html, 4× от 32×40, 3 кадра × 4 направления:
вниз/влево/вправо/вверх — та же раскладка, что у character_*_frame16x20.png).
Выход: src/assets/mc/heroes_atlas.png (строка = герой, 12 колонок = 4 направления × 3 кадра, ячейка 32×40).
Шаги: доминантный цвет блока 4×4 → квантование палитры (14 цветов/герой) → 1px контур → лёгкий свет сверху.
"""
import os, sys
from collections import Counter
from PIL import Image
ROOT = os.path.join(os.path.dirname(__file__), '..', '..')
OUT = os.path.join(ROOT, 'src', 'assets', 'mc')
IDS = ['spearman', 'rogue', 'mage', 'warrior']
FW, FH, S = 32, 40, 4
OUTLINE = (20, 12, 28, 255)

def block_down(im):
    w, h = im.size[0] // S, im.size[1] // S
    out = Image.new('RGBA', (w, h), (0, 0, 0, 0)); src = im.load(); dst = out.load()
    for y in range(h):
        for x in range(w):
            cols = []
            for dy in range(S):
                for dx in range(S):
                    c = src[x * S + dx, y * S + dy]
                    if c[3] > 128: cols.append((c[0] // 8 * 8, c[1] // 8 * 8, c[2] // 8 * 8))
            if len(cols) >= (S * S) * 0.4:
                dst[x, y] = Counter(cols).most_common(1)[0][0] + (255,)
    return out

def process(raw):
    small = block_down(raw)
    rgb = Image.new('RGB', small.size, (0, 0, 0)); rgb.paste(small, mask=small.split()[3])
    q = rgb.quantize(colors=14, method=Image.MEDIANCUT, dither=Image.NONE).convert('RGB')
    alpha = small.split()[3]
    res = Image.new('RGBA', small.size, (0, 0, 0, 0)); res.paste(q, mask=alpha)
    px = res.load(); w, h = res.size
    src = res.copy(); sp = src.load()
    for y in range(h):
        for x in range(w):
            if sp[x, y][3] == 0:
                for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    nx, ny = x + dx, y + dy
                    if 0 <= nx < w and 0 <= ny < h and sp[nx, ny][3] > 0: px[x, y] = OUTLINE; break
    return res

def main():
    rows = []
    for cid in IDS:
        raw = Image.open(f'/tmp/hero_raw_{cid}.png').convert('RGBA')
        rows.append(process(raw))
    # раскладка атласа: строка = герой, колонки = (направление × 3 кадра)
    atlas = Image.new('RGBA', (FW * 12, FH * len(IDS)), (0, 0, 0, 0))
    for r, sheet in enumerate(rows):
        for d in range(4):
            for f in range(3):
                atlas.paste(sheet.crop((f * FW, d * FH, (f + 1) * FW, (d + 1) * FH)), ((d * 3 + f) * FW, r * FH))
        sheet.save(f'/workspace/morrisgrad-round2/sprites/hero_{IDS[r]}_32x40.png')
        sheet.resize((sheet.size[0] // 2, sheet.size[1] // 2), Image.NEAREST).save(f'/workspace/morrisgrad-round2/sprites/hero_{IDS[r]}_16x20.png')
    atlas.save(os.path.join(OUT, 'heroes_atlas.png'))
    print('ok', atlas.size)

if __name__ == '__main__':
    main()
