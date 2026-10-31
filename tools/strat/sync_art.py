#!/usr/bin/env python3
"""Сборка арта «Партии Чёрных королей» в public/strat/art + manifest.json.
Клиент грузит только то, что есть в манифесте; всего остального нет — рисуется заглушка (src/scripts/strat/art.ts).
Источники (по порядку, поздний перекрывает ранний):
  1) /workspace/art/black-kings/style-sample-v2/variant_c — выбранный стиль (вариант C): конь-всадник Огня, тайлы, fx_hit_fire
  2) /workspace/art/black-kings/race-<fire|ice|water|stone|nature|lightning>-v1 — полные наборы всех 6 рас от Художника
     (old_fx/ и src/ не берутся: у Льда свой fx_hit_ice в корне набора)
Имена в наборах рас: <kind>_<pose>.png (kind: pawn knight mage rook hero king; pose: idle attack hit death),
  а также имена Художника <name>_<race>_<pose>.png: militia→pawn, rider→knight, mage, guard→rook, hero, chief→king;
  tile_light/tile_dark.png; fx_hit_<race>_01..08.png. В манифест пишется bbox непрозрачной части (центровка фигур).
  3) /workspace/art/black-kings/terrain-v1 — местность, берега, постройки (+_owned, flag_mask), иконки, подставка, рамка.
Запуск: python3 tools/strat/sync_art.py  (из корня репозитория)"""
import json, os, re, shutil, sys
from pathlib import Path
ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "public/strat/art"
ART = Path("/workspace/art/black-kings")
ALIAS = {"militia": "pawn", "rider": "knight", "mage": "mage", "guard": "rook", "hero": "hero", "chief": "king",
         "pawn": "pawn", "knight": "knight", "rook": "rook", "king": "king"}
KINDS = ["pawn", "knight", "mage", "rook", "hero", "king"]; POSES = ["idle", "attack", "hit", "death"]
RACES6 = ["fire", "ice", "water", "stone", "nature", "lightning"]
SRCS = [(ART / "style-sample-v2/variant_c", None)] + [(ART / f"race-{r}-v1", r) for r in RACES6]
RX = "|".join(RACES6)
man = {"version": 2, "style": "variant_c", "cell": 256, "groundY": 240, "units": {}, "tiles": {}, "fx": {}, "bbox": {}}
try:
    from PIL import Image
except Exception:
    Image = None
if OUT.exists(): shutil.rmtree(OUT)
OUT.mkdir(parents=True)
def put(src: Path, rel: str):
    dst = OUT / rel; dst.parent.mkdir(parents=True, exist_ok=True); shutil.copy2(src, dst); return "/strat/art/" + rel
for d, race in SRCS:
    if not d.is_dir(): print("нет источника:", d); continue
    for f in sorted(d.glob("*.png")):
        n = f.stem
        m = re.fullmatch(r"(%s)_(%s)_(idle|attack|hit|death)" % ("|".join(ALIAS), RX), n)
        if m: r, pose, kind = m[2], m[3], ALIAS[m[1]]
        else:
            m = re.fullmatch(r"(?:(%s)_)?(%s)_(idle|attack|hit|death)" % (RX, "|".join(KINDS)), n)
            if m: r, kind, pose = m[1] or race, m[2], m[3]
            else: r = kind = pose = None
        if kind and r:
            url = put(f, f"{r}/{kind}_{pose}.png"); man["units"].setdefault(r, {}).setdefault(kind, {})[pose] = url
            if Image:
                im = Image.open(f).convert("RGBA"); bb = im.split()[3].point(lambda a: 255 if a > 24 else 0).getbbox()
                if bb: man["bbox"][url] = [bb[0], bb[1], bb[2], bb[3], im.size[0]]
            continue
        if n in ("tile_light", "tile_dark"):
            key = (race or "common") + ":" + n.split("_")[1]
            man["tiles"][key] = put(f, f"tiles/{race or 'common'}_{n}.png"); continue
        m = re.fullmatch(r"fx_hit_(%s)_(\d\d)" % RX, n)
        if m: man["fx"].setdefault(m[1], []).append(put(f, f"fx/hit_{m[1]}_{m[2]}.png"))
for r in man["fx"]: man["fx"][r] = sorted(set(man["fx"][r]))
# 3) местность и постройки: /workspace/art/black-kings/terrain-v1 (мастера 256×256; small/, src/, previews/ не берутся)
#    tile_*, shore_*, struct_<код>(_owned|_banner_mask), flag_mask, icon_<код>, pedestal, frame_board → manifest.terrain[имя]
TER = ART / "terrain-v1"; man["terrain"] = {}
if TER.is_dir():
    for f in sorted(TER.glob("*.png")):
        if re.fullmatch(r"(tile_[a-z0-9_]+|shore_[a-z_]+|struct_[A-Z](_owned|_banner_mask)?|flag_mask|icon_[A-Z]|pedestal|frame_board)", f.stem):
            man["terrain"][f.stem] = put(f, f"terrain/{f.name}")
else: print("нет источника:", TER)
(OUT / "manifest.json").write_text(json.dumps(man, ensure_ascii=False, indent=1))
u = sum(len(p) for r in man["units"].values() for p in r.values())
print(f"готово: позы {u}, тайлы {len(man['tiles'])}, fx {sum(len(v) for v in man['fx'].values())}, местность {len(man['terrain'])} → {OUT}")

# эффекты fx-v1 живут в art/fx рядом с hit_* — rmtree выше их стёр, собрать заново
import subprocess, sys as _sys
subprocess.run([_sys.executable, str(Path(__file__).with_name("sync_fx.py"))], check=False)
