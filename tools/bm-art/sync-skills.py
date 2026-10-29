#!/usr/bin/env python3
"""Листы навыков Художника (fx/skills каждой стихии) → игра.
  python3 tools/bm-art/sync-skills.py [/workspace/art/black-magic]
Берёт <root>/fx/skills (огонь) и <root>/<elem>/fx/skills (лёд, вода, камень, природа, молния — какие есть),
копирует листы частей (<key>_<part>.png + _glow) в public/bm-art/fx/skills/ и пишет манифест
public/bm-art/fx/skills/index.json: {elems: {elem: {slots: {whip|ring|bolt|rain|dash: key}}}, keys: {key: {elem, slot, shape, skill, parts}}}.
Код игры выбирает лист по стихии навыка и его слоту (форма: cone→whip, nova→ring, proj→bolt, rain→rain, dash→dash),
поэтому id навыка у Художника (skill) — только справка. Повторный запуск безопасен."""
import json, glob, os, shutil, sys
SRC = sys.argv[1] if len(sys.argv) > 1 else '/workspace/art/black-magic'
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DST = os.path.join(ROOT, 'public/bm-art/fx/skills')
os.makedirs(DST, exist_ok=True)
dirs = [os.path.join(SRC, 'fx/skills')] + sorted(glob.glob(os.path.join(SRC, '*/fx/skills')))
OUT = {'pxPerMeter': 20, 'elems': {}, 'keys': {}}
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
        OUT['keys'][key] = {'elem': el, 'slot': S.get('slot'), 'shape': S.get('shape'), 'skill': (S.get('skill') or {}).get('id'), 'parts': parts}
json.dump(OUT, open(os.path.join(DST, 'index.json'), 'w'), ensure_ascii=False, separators=(',', ':'))
print('навыки:', ', '.join(f"{e} {len([k for k in OUT['keys'].values() if k['elem'] == e])}" for e in OUT['elems']), f'· листов {nf}')
