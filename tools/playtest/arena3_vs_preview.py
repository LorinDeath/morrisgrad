# Лист «превью Художника / в игре (было) / в игре (стало)» по 4 темам + средняя яркость пола (без HUD).
# Запуск: python3 tools/playtest/arena3_vs_preview.py OUT_NEW [OUT_OLD] [pf]
import os, sys, json
from PIL import Image, ImageDraw, ImageFont, ImageStat
NEW = sys.argv[1]; OLD = sys.argv[2] if len(sys.argv) > 2 else None; PF = sys.argv[3] if len(sys.argv) > 3 else 'pc'
PRE = '/workspace/arena_32'
FB = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'; f1, f2 = ImageFont.truetype(FB, 20), ImageFont.truetype(FB, 14)
TH = {'crypt': 'Склеп', 'abyss': 'Бездна', 'mirror': 'Отражения', 'abode': 'Обитель'}
def lum(p, crop=True):
    im = Image.open(p).convert('L')
    if crop: w, h = im.size; im = im.crop((0, int(h * 0.06), w, int(h * 0.82)))  # без HUD сверху/снизу
    return round(ImageStat.Stat(im).mean[0], 1)
def avg(d, pf, th, tag):
    v = [lum(f'{d}/raw/{pf}-{th}-{tag}-{k}.png') for k in ['hero', 'wide', 'north', 'diag', 'south'] if os.path.exists(f'{d}/raw/{pf}-{th}-{tag}-{k}.png')]
    return round(sum(v) / len(v), 1) if v else None
W, H = 420, 300; cols = [('превью Художника', None), ('в игре: старая арена', 'old'), ('в игре: arena32 до света', 'prev'), ('в игре: arena32 со светом', 'new')]
if not OLD: cols = [c for c in cols if c[1] != 'prev']
L, T, G = 130, 64, 8
o = Image.new('RGB', (L + len(cols) * (W + G), T + 4 * (H + G + 20)), (16, 15, 20)); d = ImageDraw.Draw(o)
d.text((12, 12), f'Арена 32: превью / в игре · {"ПК" if PF == "pc" else "телефон"} · вид «у героя», средняя яркость кадра (0–255)', font=f1, fill=(235, 230, 245))
stats = {}
for j, (c, _) in enumerate(cols): d.text((L + j * (W + G), T - 22), c, font=f2, fill=(200, 200, 215))
for i, th in enumerate(TH):
    y = T + i * (H + G + 20); d.text((10, y + H // 2), TH[th], font=f1, fill=(130, 230, 150)); st = stats[th] = {}
    for j, (c, tag) in enumerate(cols):
        if tag is None: p = f'{PRE}/preview_{th}.png'; st['preview'] = lum(p, False)
        else:
            src = NEW if tag in ('new', 'old') else OLD; t2 = 'new' if tag == 'prev' else tag
            p = f'{src}/raw/{PF}-{th}-{t2}-hero.png'; st[tag] = avg(src, PF, th, t2)
        if not os.path.exists(p): continue
        im = Image.open(p).convert('RGB'); im.thumbnail((W, H), Image.LANCZOS); o.paste(im, (L + j * (W + G), y))
        d.text((L + j * (W + G), y + H + 2), f'яркость {st.get(tag or "preview")}', font=f2, fill=(220, 220, 140))
out = f'{NEW}/{PF}-preview-vs-game.png'; o.save(out); print(out); print(json.dumps(stats, ensure_ascii=False))
