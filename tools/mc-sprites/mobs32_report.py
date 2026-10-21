# Сборка отчёта mobs32 из кадров плейтеста (tools/playtest/mobs32-shots.cjs): старое/новое по тирам, GIF анимаций, GIF переключения.
# python3 tools/mc-sprites/mobs32_report.py [OUT]
import sys, os, glob, json
from PIL import Image, ImageDraw, ImageFont
OUT = sys.argv[1] if len(sys.argv) > 1 else '/workspace/morrisgrad-round3/mobs32'
F = OUT + '/frames'
try: font = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', 20); small = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', 15)
except Exception: font = small = ImageFont.load_default()
def label(im, text, xy=(10, 8), f=None):
    d = ImageDraw.Draw(im); f = f or font; x, y = xy; bb = d.textbbox((x, y), text, font=f); d.rectangle((bb[0] - 5, bb[1] - 3, bb[2] + 5, bb[3] + 3), fill=(10, 8, 20)); d.text((x, y), text, font=f, fill=(250, 230, 160)); return im
# 1. старое | новое по тирам (столбцами) + общий лист
rows = []
for t in range(1, 6):
    a, b = F + f'/tier{t}-old.png', F + f'/tier{t}-new.png'
    if not (os.path.exists(a) and os.path.exists(b)): continue
    A, B = Image.open(a).convert('RGB'), Image.open(b).convert('RGB'); w, h = A.size
    c = Image.new('RGB', (w * 2 + 8, h), (20, 16, 30)); c.paste(label(A, f'Тир {t} — старые (12 кадров)'), (0, 0)); c.paste(label(B, f'Тир {t} — новые (64 кадра)'), (w + 8, 0))
    c.save(OUT + f'/tier{t}-old-vs-new.png'); rows.append(c)
if rows:
    s = 0.5; W = int(rows[0].width * s); H = int(rows[0].height * s); sheet = Image.new('RGB', (W, H * len(rows)))
    for i, r in enumerate(rows): sheet.paste(r.resize((W, H), Image.NEAREST), (0, i * H))
    sheet.save(OUT + '/tiers-old-vs-new.png')
# 2. GIF анимаций: по мобу — idle, walk, atk, hurt, die подряд (реальный fps), слева вправо + отражённый
FPS = {'idle': 12, 'walk': 24, 'atk': 20, 'hurt': 24, 'die': 24}
NAMES = {'idle': 'стоит', 'walk': 'ход', 'atk': 'удар (импакт — кадр 7)', 'hurt': 'урон (без белой вспышки)', 'die': 'смерть'}
mobs = sorted({os.path.basename(p).split('-')[1] for p in glob.glob(F + '/gif-*.png')})
for m in mobs:
    frames, durs = [], []
    for an in ['idle', 'walk', 'atk', 'hurt', 'die']:
        fs = sorted(glob.glob(F + f'/gif-{m}-{an}-*.png'))
        reps = 2 if an in ('walk', 'atk', 'hurt') else 1
        for _ in range(reps):
            for i, p in enumerate(fs): im = Image.open(p).convert('RGB'); im = im.resize((im.width * 3 // 5, im.height * 3 // 5), Image.NEAREST); frames.append(label(im, f'{m}: {NAMES[an]}  {i + 1}/{len(fs)}', f=small)); durs.append(int(1000 / FPS[an]))
        if an == 'die' and frames: durs[-1] = 600
    if frames:
        pal = [f.quantize(colors=96, method=Image.MEDIANCUT, dither=Image.NONE) for f in frames]
        pal[0].save(OUT + f'/anim-{m}.gif', save_all=True, append_images=pal[1:], duration=durs, loop=0, optimize=False, disposal=1)
        for an in ['walk', 'atk']:
            fs = sorted(glob.glob(F + f'/gif-{m}-{an}-*.png')); old = sorted(glob.glob(F + f'/gifold-{m}-{an}-*.png'))
            if not fs or not old: continue
            n = len(fs); fr2 = []; d2 = []
            for k in range(n * 2):
                N = Image.open(fs[k % n]).convert('RGB'); O = Image.open(old[int((k % n) * len(old) / n)]).convert('RGB'); w, h = N.size
                c = Image.new('RGB', (w * 2 + 6, h), (20, 16, 30)); c.paste(label(O, f'старые: {an}', f=small), (0, 0)); c.paste(label(N, f'новые: {an}', f=small), (w + 6, 0))
                fr2.append(c.resize((c.width // 2, c.height // 2), Image.NEAREST).quantize(colors=96, method=Image.MEDIANCUT, dither=Image.NONE)); d2.append(int(1000 / FPS[an]))
            fr2[0].save(OUT + f'/old-vs-new-{m}-{an}.gif', save_all=True, append_images=fr2[1:], duration=d2, loop=0)
# 3. живое переключение (видом сцены и из «Настроек»)
for nm, pat, scale in [('switch-live', 'switch-*.png', 0.6), ('settings-switch', 'settings-*.png', 0.6)]:
    fs = sorted(glob.glob(F + '/' + pat))
    if not fs: continue
    fr = []
    for i, p in enumerate(fs):
        im = Image.open(p).convert('RGB'); im = im.resize((int(im.width * scale), int(im.height * scale)), Image.NEAREST); fr.append(im.quantize(colors=255, method=Image.MEDIANCUT, dither=Image.NONE))
    fr[0].save(OUT + f'/{nm}.gif', save_all=True, append_images=fr[1:], duration=[180] * len(fr), loop=0)
print('ok', len(rows), 'тиров,', len(mobs), 'мобов в GIF')
