#!/usr/bin/env python3
"""Точки излучения света (emitter) из *_glow листов: центроид светящихся пикселей (вес = альфа × яркость)
на каждый ключ и кадр. Координаты — px спрайта от якоря (низ-центр для anchor [0.5,1]): ex вправо, ey ВВЕРХ.
Здания: окна/двери — связные пятна glow (каждое — свой огонь). Выход: src/assets/mc/light_emitters.json.
Запуск: python3 tools/light-emitters/gen.py  (после tools/sync-city-art)"""
import json, os
from PIL import Image
ROOT = os.path.join(os.path.dirname(__file__), '..', '..')
A = lambda *p: os.path.join(ROOT, 'src', 'assets', 'mc', *p)

def centroid(im, x0, y0, w, h, ax, ay):
    px = im.load(); sw = sx = sy = 0.0; n = 0
    for y in range(y0, y0 + h):
        for x in range(x0, x0 + w):
            r, g, b, a = px[x, y]
            if a == 0: continue
            wt = (a / 255) * (0.2 + 0.8 * max(r, g, b) / 255); sw += wt; sx += wt * (x - x0 + 0.5); sy += wt * (y - y0 + 0.5); n += 1
    if not sw: return None
    return [round(sx / sw - ax * w, 2), round(ay * h - sy / sw, 2), n]

def blobs(im, w, h, ax, ay, min_n=4):
    px = im.load(); seen = set(); out = []
    for y in range(h):
        for x in range(w):
            if (x, y) in seen or px[x, y][3] == 0: continue
            st = [(x, y)]; seen.add((x, y)); pts = []
            while st:
                cx, cy = st.pop(); pts.append((cx, cy))
                for dx in (-1, 0, 1):
                    for dy in (-1, 0, 1):
                        q = (cx + dx, cy + dy)
                        if 0 <= q[0] < w and 0 <= q[1] < h and q not in seen and px[q][3] > 0: seen.add(q); st.append(q)
            if len(pts) < min_n: continue
            sw = sx = sy = 0.0
            for (qx, qy) in pts:
                r, g, b, a = px[qx, qy]; wt = (a / 255) * (0.2 + 0.8 * max(r, g, b) / 255); sw += wt; sx += wt * (qx + 0.5); sy += wt * (qy + 0.5)
            xs = [p[0] for p in pts]; ys = [p[1] for p in pts]
            out.append([round(sx / sw - ax * w, 2), round(ay * h - sy / sw, 2), len(pts), max(xs) - min(xs) + 1, max(ys) - min(ys) + 1])
    return out

def atlas(set_id, jpath, sheets):
    J = json.load(open(jpath)); ims = {k: Image.open(v).convert('RGBA') for k, v in sheets.items()}; out = {}
    for k, d in J['keys'].items():
        g = d.get('glow')
        if not g: continue
        im = ims[g['sheet']]; w, h = d['w'], d['h']; ax, ay = (d.get('anchor') or [0.5, 1])
        cols = J['sheets'][g['sheet']]['cols']; c0, r0 = d.get('col', 0), d.get('row', 0)
        fx = lambda f: (((c0 + f) % cols) * w, (r0 + (c0 + f) // cols) * h)  # кадры идут по строке и переносятся
        fr = [centroid(im, *fx(f), w, h, ax, ay) for f in range(d.get('frames') or 1)]
        ok = [f for f in fr if f]
        if not ok: continue
        n = sum(f[2] for f in ok)
        e = [round(sum(f[0] * f[2] for f in ok) / n, 2), round(sum(f[1] * f[2] for f in ok) / n, 2)]
        out[f'{set_id}:{k}'] = {'w': w, 'h': h, 'm': d.get('size_m'), 'e': e, 'f': [f[:2] if f else None for f in fr], 'src': 'glow'}
    return out

E = {}
E.update(atlas('world', A('props2', 'props_atlas.json'), {'p32_glow': A('props2', 'props_p32_glow.png'), 'b64_glow': A('props2', 'props_b64_glow.png')}))
E.update(atlas('city', A('city', 'props_dark_atlas.json'), {'p32_glow': A('city', 'props_dark_p32_glow.png'), 'b64_glow': A('city', 'props_dark_b64_glow.png')}))
B = json.load(open(A('city', 'buildings.json')))
for k, d in B['keys'].items():
    if not d.get('glow'): continue
    im = Image.open(A('city', d['glow'])).convert('RGBA'); ax, ay = d.get('anchor') or [0.5, 1]
    sp = blobs(im, d['w'], d['h'], ax, ay)
    c = centroid(im, 0, 0, d['w'], d['h'], ax, ay)
    if c: E[f'city:{k}'] = {'w': d['w'], 'h': d['h'], 'm': [d['w'] / 20, d['h'] / 20], 'e': c[:2], 'spots': sp, 'src': 'glow'}
json.dump({'version': 1, 'note': 'gen.py: центроиды *_glow; px спрайта от якоря, ey вверх; f — по кадрам; spots — окна/двери зданий [ex,ey,n,w,h]', 'keys': E},
          open(A('light_emitters.json'), 'w'), ensure_ascii=False, separators=(',', ':'))
print(len(E), 'keys;', {k: v['e'] for k, v in E.items() if any(s in k for s in ('lantern', 'torch', 'campfire', 'portal'))})
