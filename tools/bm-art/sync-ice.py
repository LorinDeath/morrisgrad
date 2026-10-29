#!/usr/bin/env python3
"""Ледяной набор Художника → игра (после sync-weapon.py).
  python3 tools/bm-art/sync-ice.py [/workspace/art/black-magic/ice]
Имена ледяных листов совпадают с огненными, поэтому в игре они с префиксом ice_ (ключ img = ice_<имя>):
  body/<slot>_<n>.* → public/bm-art/body/ice_<slot>_<n>.png (+_glow), записи в body/index.json (точки руки по кадрам);
  weapon/*.* → public/bm-art/weapon/ice_*.png (+_glow), записи в weapon/index.json и server/meta/bmWeaponPts.ts;
  fx/ice_*.* → public/bm-art/fx/ (имена уже с ice_), манифест fx/index.json.
Повторный запуск безопасен (перезаписывает только ice_*). Огненные записи не трогаются."""
import json, glob, os, shutil, sys, re
SRC = sys.argv[1] if len(sys.argv) > 1 else '/workspace/art/black-magic/ice'
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DST = os.path.join(ROOT, 'public/bm-art')
P = 'ice_'
def cp(sub, name, dsub, dname):
    s = os.path.join(SRC, sub, name)
    if os.path.exists(s): shutil.copy2(s, os.path.join(DST, dsub, dname)); return True
    return False
# — тело
bi_path = os.path.join(DST, 'body/index.json'); BI = json.load(open(bi_path))
nb = 0
for f in sorted(glob.glob(os.path.join(SRC, 'body/*.json'))):
    d = json.load(open(f)); k = d.get('key') or os.path.basename(f)[:-5]
    cp('body', d.get('image') or k + '.png', 'body', P + k + '.png'); cp('body', d.get('glow') or k + '_glow.png', 'body', P + k + '_glow.png')
    e = {'slot': d.get('slot'), 'name': d.get('name'), 'z': d.get('z'), 'elem': d.get('elem') or 'ice'}
    pts = d.get('points')
    if isinstance(pts, list) and pts and 'handR' in (pts[0] or {}): e['hand'] = [p.get('handR') for p in pts]
    BI['parts'][P + k] = e; nb += 1
json.dump(BI, open(bi_path, 'w'), ensure_ascii=False, separators=(',', ':'))
# — оружие
wi_path = os.path.join(DST, 'weapon/index.json'); WI = json.load(open(wi_path))
ts_path = os.path.join(ROOT, 'server/meta/bmWeaponPts.ts'); ts = open(ts_path).read()
m = re.search(r'= (\{.*\});\s*$', ts, re.S); PTS = json.loads(m.group(1))
nw = 0
for f in sorted(glob.glob(os.path.join(SRC, 'weapon/*.json'))):
    d = json.load(open(f)); k = d.get('key') or os.path.basename(f)[:-5]
    cp('weapon', d.get('image') or k + '.png', 'weapon', P + k + '.png'); cp('weapon', d.get('glow') or k + '_glow.png', 'weapon', P + k + '_glow.png')
    typ = d.get('type') or ('blade' if d.get('slot', '').startswith('blade') else None)
    pp = dict(d.get('points') or {})
    if typ == 'staff' and 'muzzle' not in pp and 'tip' in pp: pp['muzzle'] = pp['tip']
    e = {'slot': d.get('slot'), 'name': d.get('name'), 'mode': d.get('mode'), 'points': pp, 'anims': d.get('anims'), 'cell': d.get('cell', 64), 'elem': 'ice'}
    if typ: e['type'] = typ
    mf = d.get('muzzleFrames')
    if mf and any(fr != pp.get('muzzle') for L in mf.values() for fr in L): e['muzzleFrames'] = mf
    WI[P + k] = e
    PTS[P + k] = {'slot': d.get('slot'), 'type': typ, **{n: pp[n] for n in ('grip', 'bladeBase', 'base', 'branch1', 'branch2', 'muzzle') if n in pp}}
    nw += 1
json.dump(WI, open(wi_path, 'w'), ensure_ascii=False, separators=(',', ':'))
open(ts_path, 'w').write(ts[:m.start(1)] + json.dumps(PTS, ensure_ascii=False, separators=(',', ':')) + ';\n')
# — эффекты
os.makedirs(os.path.join(DST, 'fx'), exist_ok=True)
fi_path = os.path.join(DST, 'fx/index.json'); FI = json.load(open(fi_path)) if os.path.exists(fi_path) else {}
nf = 0
for f in sorted(glob.glob(os.path.join(SRC, 'fx/*.json'))):
    d = json.load(open(f)); k = d.get('key') or os.path.basename(f)[:-5]
    cp('fx', k + '.png', 'fx', k + '.png'); cp('fx', k + '_glow.png', 'fx', k + '_glow.png')
    FI[k] = {x: d.get(x) for x in ('elem', 'cell', 'cols', 'rows', 'anims', 'anchor', 'scale', 'facing') if d.get(x) is not None}; nf += 1
json.dump(FI, open(fi_path, 'w'), ensure_ascii=False, separators=(',', ':'))
print(f'лёд: тело {nb}, оружие {nw}, эффекты {nf}')
