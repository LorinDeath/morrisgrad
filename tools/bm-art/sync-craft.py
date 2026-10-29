#!/usr/bin/env python3
"""Кузня: значки кусочков чертежа, анимации сборки и значки деталей всех стихий → игра. ЕДИНЫЙ вход — craft_index.json Художника.
  python3 tools/bm-art/sync-craft.py [/workspace/art/black-magic]
Пишет public/bm-art/craft/<id>.png (+_glow) и манифест public/bm-art/craft/index.json:
  bp:   {bp_<elem>_<тип>: {elem, type, cell, cols, rows, anims, anchor}}               — кусочки чертежа (мерцание)
  asm:  {bp_<elem>_<тип>_assemble: {...}}                                              — анимация сборки детали
  part: {<ключ листа в игре>: {id, elem, cell}} — ключ как BmPart.img: огонь «handle_1», прочие «<elem>_handle_1»
Молния сдана с bmp_<ключ> без префикса — берётся через алиасы bmp_lightning_<ключ> индекса. Повторный запуск безопасен."""
import json, os, shutil, sys
SRC = sys.argv[1] if len(sys.argv) > 1 else '/workspace/art/black-magic'
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DST = os.path.join(ROOT, 'public/bm-art/craft'); os.makedirs(DST, exist_ok=True)
IX = json.load(open(os.path.join(SRC, 'craft_index.json')))
meta = {}
for el, E in IX['elements'].items():
    cj = json.load(open(os.path.join(SRC, E['craftJson'])))
    for sec in ('blueprints', 'assemble', 'parts'):
        for k, v in (cj.get(sec) or {}).items(): meta[k] = v
OUT = {'bp': {}, 'asm': {}, 'part': {}}
n = 0
for k, v in IX['ids'].items():
    for f, suf in (('image', ''), ('glow', '_glow')):
        s = os.path.join(SRC, v[f]); d = os.path.join(DST, k + suf + '.png')
        if os.path.exists(s): shutil.copy2(s, d); n += 1
    m = meta.get(k, {}); el = v['elem']
    keep = {x: m.get(x) for x in ('cell', 'cols', 'rows', 'anims', 'anchor') if m.get(x) is not None}
    if v['kind'] == 'blueprint': OUT['bp'][k] = {'elem': el, 'type': m.get('type'), **keep}
    elif v['kind'] == 'assemble': OUT['asm'][k] = {'elem': el, 'type': m.get('type'), **keep}
    else:
        key = v['part'] if el == 'fire' else f"{el}_{v['part']}"
        OUT['part'][key] = {'id': k, 'elem': el, 'cell': m.get('cell', 32), 'name': m.get('name')}
json.dump(OUT, open(os.path.join(DST, 'index.json'), 'w'), ensure_ascii=False, separators=(',', ':'))
print(f"кузня: кусочков {len(OUT['bp'])}, сборок {len(OUT['asm'])}, деталей {len(OUT['part'])}, файлов {n}")
