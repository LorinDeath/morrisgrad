# Сборка снимков arena3-shots.cjs (raw/) в листы сравнения: старое/новое по темам, парапет спрайты/в полу, кромка и диагонали крупно, прореживание.
# Запуск: python3 tools/playtest/arena3_report.py [OUT]
import os, sys, json
from PIL import Image, ImageDraw, ImageFont
OUT = sys.argv[1] if len(sys.argv) > 1 else '/workspace/morrisgrad-round3/props3/arena3'
RAW = OUT + '/raw'
FB = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'
f1, f2, f3 = ImageFont.truetype(FB, 22), ImageFont.truetype(FB, 15), ImageFont.truetype(FB, 18)
TH = {'crypt': 'Склеп (crypt)', 'abyss': 'Бездна (abyss)', 'mirror': 'Отражения (mirror)', 'abode': 'Обитель (abode)'}
VIEWS = {'hero': 'у героя', 'north': 'север: прямая кромка', 'diag': 'диагональ (северо-запад)', 'south': 'юг: стена к камере'}
def grid(rows, cols, title, out, scale, crop=None):
    if not all(os.path.exists(q) for r in rows for q in r[1]): return None
    """rows: [(подпись, [пути])]; cols: подписи колонок"""
    ims = [[Image.open(p).convert('RGB') for p in r[1]] for r in rows]
    if crop: ims = [[im.crop(crop[j](im)) for j, im in enumerate(r)] for r in ims]
    w, h = int(ims[0][0].width * scale), int(ims[0][0].height * scale)
    L, T, G = 170, 70, 8
    o = Image.new('RGB', (L + len(cols) * (w + G), T + len(rows) * (h + G)), (16, 15, 20)); d = ImageDraw.Draw(o)
    d.text((12, 14), title, font=f1, fill=(235, 230, 245))
    for j, c in enumerate(cols): d.text((L + j * (w + G), T - 24), c, font=f2, fill=(200, 200, 215))
    for i, (lab, _) in enumerate(rows):
        d.text((10, T + i * (h + G) + h // 2 - 10), lab, font=f3, fill=(255, 130, 130) if 'было' in lab.lower() or lab.startswith('стар') else (130, 230, 150))
        for j, im in enumerate(ims[i]): o.paste(im.resize((w, h), Image.LANCZOS if scale < 1 else Image.NEAREST), (L + j * (w + G), T + i * (h + G)))
    o.save(out); return out
made = []
for pf in ['pc', 'phone']:
    if not os.path.exists(f'{RAW}/{pf}-crypt-new-north.png'): continue
    sc = 0.5 if pf == 'pc' else 0.4  # телефон: снимки 1081×2202 (DPR 2.6) — листы не шире ~1800 px
    for th in TH:
        if not os.path.exists(f'{RAW}/{pf}-{th}-new-north.png'): continue
        rows = [(t, [f'{RAW}/{pf}-{th}-{k}-{v}.png' for v in VIEWS]) for k, t in [('old', 'было'), ('new', 'стало')]]
        made.append(grid(rows, list(VIEWS.values()), f'Арена «Выживание» · {TH[th]} · {"ПК" if pf == "pc" else "телефон"} · было (arena3 выкл) / стало (arena3 вкл)', f'{OUT}/{pf}-{th}-old-vs-new.png', sc))
    for th in ['crypt', 'abode']:
        if not os.path.exists(f'{RAW}/{pf}-{th}-mode-baked-north.png'): continue
        rows = [(lab, [f'{RAW}/{pf}-{th}-mode-{m}-{v}.png' for v in ['north', 'diag']]) for m, lab in [('sprites', 'спрайты'), ('baked', 'в полу')]]
        made.append(grid(rows, [VIEWS['north'], VIEWS['diag']], f'Парапет: спрайтами (объёмнее) / запечён в пол (дешевле) · {TH[th]} · {"ПК" if pf == "pc" else "телефон"}', f'{OUT}/{pf}-{th}-parapet-sprites-vs-baked.png', sc * 1.3))
        rows = [(lab, [f'{RAW}/{pf}-{th}-mode-{m}-diag.png']) for m, lab in [('sprites' if pf == 'pc' else 'baked', 'все столбы'), ('posts2', 'каждый 2-й')]]
        made.append(grid(rows, ['диагональ (северо-запад)'], f'Угловые столбы на диагоналях · {TH[th]} · {"ПК" if pf == "pc" else "телефон"}', f'{OUT}/{pf}-{th}-diag-posts.png', 1.0 if pf == 'pc' else 0.5))
    # крупно: кромка (север) и диагональ, новые, 4 темы; центр кадра ×2
    cn = lambda im: (im.width // 4, 0, im.width * 3 // 4, im.height // 2)  # север: парапет у верхнего края кадра
    cd = lambda im: (0, 0, im.width // 2, im.height // 2)                 # диагональ: северо-запад — левый верх
    if all(os.path.exists(f'{RAW}/{pf}-{th}-new-diag.png') for th in TH):
        rows = [(th, [f'{RAW}/{pf}-{th}-new-north.png', f'{RAW}/{pf}-{th}-new-diag.png']) for th in TH]
        made.append(grid(rows, ['кромка и парапет (север), ×2', 'диагональ, ×2'], f'Крупно: кромка и диагонали · {"ПК" if pf == "pc" else "телефон"}', f'{OUT}/{pf}-closeup-edge-diag.png', 1.0 if pf == 'pc' else 0.75, crop=[cn, cd]))
print('\n'.join(m for m in made if m))
