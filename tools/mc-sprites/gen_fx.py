"""Пиксельные эффекты уровня в забеге (16-битный стиль атласов MorrisCurse).
fx_shockwave.png — кольцо ударной волны (вид сверху, кладётся на землю, растёт и гаснет);
fx_shield.png    — пузырь неуязвимости над героем (билборд, мерцает).
Запуск: python3 tools/mc-sprites/gen_fx.py"""
import math, os
from PIL import Image

ROOT = os.path.join(os.path.dirname(__file__), '..', '..')
OUT = os.path.join(ROOT, 'src', 'assets', 'mc')
PREV = '/workspace/morrisgrad-round2/sprites'
N = 48

def hexc(h, a=255):
    h = h.lstrip('#'); return (int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16), a)

def shockwave():
    im = Image.new('RGBA', (N, N), (0, 0, 0, 0)); px = im.load(); c = (N - 1) / 2
    for y in range(N):
        for x in range(N):
            d = math.hypot(x - c, y - c); r = N / 2 - 3
            ang = math.atan2(y - c, x - c)
            if abs(d - r) < 1.0: px[x, y] = hexc('#ffffff')
            elif abs(d - (r - 1.6)) < 0.9: px[x, y] = hexc('#e9d5ff')
            elif abs(d - (r - 3.2)) < 0.9: px[x, y] = hexc('#c084fc', 230)
            elif abs(d - (r - 4.8)) < 0.8 and (x + y) % 2 == 0: px[x, y] = hexc('#a855f7', 170)
            elif abs(d - (r - 6.5)) < 0.8 and (x * 3 + y) % 4 == 0: px[x, y] = hexc('#7c3aed', 120)
            # «искры» по ободу
            elif abs(d - (r + 1.6)) < 0.7 and int((ang + math.pi) * 8) % 3 == 0: px[x, y] = hexc('#fde68a', 220)
    return im

def shield():
    im = Image.new('RGBA', (N, N), (0, 0, 0, 0)); px = im.load(); c = (N - 1) / 2
    r = N / 2 - 2
    for y in range(N):
        for x in range(N):
            d = math.hypot(x - c, y - c)
            if d > r + 0.5: continue
            # шестиугольная сетка-соты
            q = (x * 0.5 + y * 0.866) / 8.0; w = (x * 0.5 - y * 0.866) / 8.0; v = x / 8.0
            edge = min(abs(q - round(q)), abs(w - round(w)), abs(v - round(v)))
            if abs(d - r) < 1.0: px[x, y] = hexc('#e0f2fe')
            elif abs(d - (r - 1.5)) < 0.8: px[x, y] = hexc('#7dd3fc', 200)
            elif edge < 0.06 and d < r - 2: px[x, y] = hexc("#bae6fd", int(30 + 110 * (d / r) ** 2))
            elif d < r - 2 and (x + y) % 2 == 0 and d > r * 0.55: px[x, y] = hexc('#38bdf8', int(40 * (d / r)))
    # блик
    for i in range(5):
        for j in range(2):
            px[int(c - r * 0.5) + i, int(c - r * 0.55) + j - i // 2] = hexc('#ffffff', 230)
    return im

def main():
    os.makedirs(PREV, exist_ok=True)
    for name, fn in (('fx_shockwave', shockwave), ('fx_shield', shield)):
        im = fn(); im.save(os.path.join(OUT, name + '.png'))
        bg = Image.new('RGBA', (N, N), (24, 18, 40, 255)); bg.alpha_composite(im)
        bg.resize((N * 6, N * 6), Image.NEAREST).save(os.path.join(PREV, name + '_x6.png'))
    print('ok')

main()
