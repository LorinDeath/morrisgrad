"""Вертикальный забор Альказака (временный кадр до арта Художника).
Атлас props_dark: dm_fence — только горизонтальный пролёт, dm_fence_post — узловой столб с обрубками
жердей в обе стороны; столбы, поставленные колонной, торчат обрубками вбок. Здесь из ТОГО ЖЕ арта:
  кадр 0 (7×18): столб — средний колышек dm_fence без перекладин (верх-пика как у горизонтального пролёта);
  кадр 1 (4×4):  жердь, видимая вдоль глубины — вертикальная полоса; клиент растягивает её по высоте
                 между столбами (однородна по вертикали — растяжение незаметно).
Выход: src/assets/mc/city/fence_v.png (12×18: столб x0..6, жердь x7..10, y0..3)."""
from PIL import Image
import os
R = os.path.join(os.path.dirname(__file__), '../../src/assets/mc/city')
im = Image.open(f'{R}/props_dark_p32.png').convert('RGBA')
F = im.crop((0, 6 * 48, 32, 7 * 48))            # dm_fence
post = F.crop((13, 30, 20, 48)).copy()           # средний колышек (x 14..18 + край)
clean = [post.getpixel((x, 38 - 30)) for x in range(7)]   # строка без перекладины
for y in list(range(34, 38)) + list(range(40, 44)):
    for x in range(7): post.putpixel((x, y - 30), clean[x])
# жердь: цвета перекладины dm_fence (строка 35: светлая, 36: тёмная), контур — как у столба
lt, md, ol = F.getpixel((15, 38)), F.getpixel((16, 38)), F.getpixel((14, 38))   # свет / середина / контур колышка
rail = Image.new('RGBA', (5, 4))                 # 4 px — чуть тоньше столба (5)
for y in range(4):
    sh = tuple(int(md[i] * 0.62 + F.getpixel((17, 38))[i] * 0.38) for i in range(3)) + (255,)   # жердь темнее столба — столбы читаются
    for x, c in enumerate([ol, md, sh, ol]): rail.putpixel((x, y), c)
out = Image.new('RGBA', (12, 18)); out.paste(post, (0, 0)); out.paste(rail, (7, 0))
out.save(f'{R}/fence_v.png'); print('ok')
