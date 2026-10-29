#!/usr/bin/env python3
"""Листы оружия Художника → игра.
  python3 tools/bm-art/sync-weapon.py [/workspace/art/black-magic]
Копирует weapon/*.png (+_glow) в public/bm-art/weapon, пересобирает public/bm-art/weapon/index.json
(slot, type, name, mode, points, anims, cell, muzzleFrames), копирует атлас и пишет server/meta/bmWeaponPts.ts
(точки стыковки и дула — для сервера: снаряд вылетает из дула каждого посоха).
«Посох-жаровня» (blade_3, blade_3_ranged) — тип staff (решение владельца), дуло = tip."""
import json, glob, os, shutil, sys
SRC = sys.argv[1] if len(sys.argv) > 1 else '/workspace/art/black-magic'
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DST = os.path.join(ROOT, 'public/bm-art')
FORCE_STAFF = {'blade_3', 'blade_3_ranged'}
os.makedirs(os.path.join(DST, 'weapon'), exist_ok=True)
idx, pts = {}, {}
for f in sorted(glob.glob(os.path.join(SRC, 'weapon/*.json'))):
    d = json.load(open(f)); k = d.get('key') or os.path.basename(f)[:-5]
    for n in (d.get('image') or k + '.png', d.get('glow') or k + '_glow.png'):
        p = os.path.join(SRC, 'weapon', n)
        if os.path.exists(p): shutil.copy2(p, os.path.join(DST, 'weapon', n))
    typ = 'staff' if k in FORCE_STAFF else (d.get('type') or ('blade' if d.get('slot', '').startswith('blade') else None))
    P = dict(d.get('points') or {})
    if typ == 'staff' and 'muzzle' not in P and 'tip' in P: P['muzzle'] = P['tip']
    e = {'slot': d.get('slot'), 'name': d.get('name'), 'mode': d.get('mode'), 'points': P, 'anims': d.get('anims'), 'cell': d.get('cell', 64)}
    if typ: e['type'] = typ
    mf = d.get('muzzleFrames')
    if mf and any(fr != P.get('muzzle') for L in mf.values() for fr in L): e['muzzleFrames'] = mf
    idx[k] = e
    pts[k] = {'slot': d.get('slot'), 'type': typ, **{n: P[n] for n in ('grip', 'bladeBase', 'base', 'branch1', 'branch2', 'muzzle') if n in P}}
json.dump(idx, open(os.path.join(DST, 'weapon/index.json'), 'w'), ensure_ascii=False, separators=(',', ':'))
A = json.load(open(os.path.join(SRC, 'black_magic_atlas.json')))
for L in A.get('weapon', {}).get('parts', {}).values():
    for p in L:
        if p.get('key') in FORCE_STAFF: p['type'] = 'staff'
json.dump(A, open(os.path.join(DST, 'black_magic_atlas.json'), 'w'), ensure_ascii=False, indent=1)
with open(os.path.join(ROOT, 'server/meta/bmWeaponPts.ts'), 'w') as o:
    o.write('// СГЕНЕРИРОВАНО tools/bm-art/sync-weapon.py из листов Художника — не править руками.\n')
    o.write('// Точки стыковки частей оружия и дуло посохов (px клетки 64×64, от левого верхнего угла).\n')
    o.write('export const BM_WEAPON_PTS: Record<string, { slot: string; type?: string | null; grip?: number[]; bladeBase?: number[]; base?: number[]; branch1?: number[]; branch2?: number[]; muzzle?: number[] }> = ')
    o.write(json.dumps(pts, ensure_ascii=False, separators=(',', ':')) + ';\n')
print(len(idx), 'листов;', sum(1 for v in idx.values() if v.get('type') == 'staff'), 'посохов')
