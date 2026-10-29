#!/usr/bin/env python3
"""Листы навыков Художника (fx/skills каждой стихии) → игра.
  python3 tools/bm-art/sync-skills.py [/workspace/art/black-magic]
Берёт <root>/fx/skills (огонь) и <root>/<elem>/fx/skills (лёд, вода, камень, природа, молния — какие есть),
копирует листы частей (<key>_<part>.png + _glow) в public/bm-art/fx/skills/ и пишет манифест
public/bm-art/fx/skills/index.json: {elems: {elem: {slots: {whip|ring|bolt|rain|dash: key}}}, keys: {key: {elem, slot, shape, skill, parts}}}.
Код игры выбирает лист по стихии навыка и его слоту (форма: cone→whip, nova→ring, proj→bolt, rain→rain, dash→dash),
поэтому id навыка у Художника (skill) — только справка. Повторный запуск безопасен."""
import json, glob, os, shutil, sys
try:
    from PIL import Image
except Exception:
    Image = None
SRC = sys.argv[1] if len(sys.argv) > 1 else '/workspace/art/black-magic'
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DST = os.path.join(ROOT, 'public/bm-art/fx/skills')
os.makedirs(DST, exist_ok=True)
dirs = [os.path.join(SRC, 'fx/skills')] + sorted(glob.glob(os.path.join(SRC, '*/fx/skills')))
OUT = {'pxPerMeter': 20, 'elems': {}, 'keys': {}}
HIT = {}
def opaque(path, p):
    """непрозрачная рамка рисунка (объединение всех кадров, альфа > 40) от точки привязки: [x0, y0, x1, y1] px ячейки
    (x — вдоль направления, y — вниз). Это хитбокс конструктора навыков «по картинке» (server/meta/skillArtHit.json)."""
    im = Image.open(path).convert('RGBA'); cw, ch = p['cell']; ax, ay = p.get('anchor') or [cw / 2, ch / 2]
    cols = p.get('cols') or max(1, im.width // cw); rows = p.get('rows') or max(1, im.height // ch)
    a = im.split()[3].point(lambda v: 255 if v > 40 else 0); box = None
    for r in range(rows):
        for c in range(cols):
            b = a.crop((c * cw, r * ch, (c + 1) * cw, (r + 1) * ch)).getbbox()
            if b: box = b if not box else (min(box[0], b[0]), min(box[1], b[1]), max(box[2], b[2]), max(box[3], b[3]))
    return [box[0] - ax, box[1] - ay, box[2] - ax, box[3] - ay] if box else None
nf = 0
for d in dirs:
    ap = os.path.join(d, 'skills_atlas.json')
    if not os.path.exists(ap): continue
    A = json.load(open(ap)); el = A.get('elem')
    if not el: continue
    OUT['elems'][el] = {'slots': A.get('slots') or {}}
    for key in (A.get('slots') or {}).values():
        jf = os.path.join(d, key + '.json')
        if not os.path.exists(jf): continue
        S = json.load(open(jf)); parts = {}
        for pn, p in (S.get('parts') or {}).items():
            ok = True
            for img in (p.get('image'), p.get('glow')):
                if not img or not os.path.exists(os.path.join(d, img)): ok = False; continue
                shutil.copy2(os.path.join(d, img), os.path.join(DST, img)); nf += 1
            if not ok: continue
            parts[pn] = {x: p.get(x) for x in ('image', 'glow', 'cell', 'cols', 'rows', 'anims', 'anchor', 'layer') if p.get(x) is not None}
            hb = opaque(os.path.join(d, p['image']), p) if Image else None
            if hb: parts[pn]['hit'] = hb; HIT.setdefault(key, {})[pn] = hb
        OUT['keys'][key] = {'elem': el, 'slot': S.get('slot'), 'shape': S.get('shape'), 'skill': (S.get('skill') or {}).get('id'), 'parts': parts}
json.dump(OUT, open(os.path.join(DST, 'index.json'), 'w'), ensure_ascii=False, separators=(',', ':'))
json.dump({'pxPerMeter': 20, 'elems': {e: v['slots'] for e, v in OUT['elems'].items()}, 'hit': HIT}, open(os.path.join(ROOT, 'server/meta/skillArtHit.json'), 'w'), ensure_ascii=False, separators=(',', ':'))
print('навыки:', ', '.join(f"{e} {len([k for k in OUT['keys'].values() if k['elem'] == e])}" for e in OUT['elems']), f'· листов {nf}')
