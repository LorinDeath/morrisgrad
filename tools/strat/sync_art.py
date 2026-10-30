#!/usr/bin/env python3
"""Сборка арта «Партии Чёрных королей» в public/strat/art + manifest.json.
Клиент грузит только то, что есть в манифесте; всего остального нет — рисуется заглушка (src/scripts/strat/art.ts).
Источники (по порядку, поздний перекрывает ранний):
  1) /workspace/art/black-kings/style-sample-v2/variant_c — выбранный стиль (вариант C): конь-всадник Огня, тайлы, fx_hit_fire
  2) /workspace/art/black-kings/race-fire-v1, race-ice-v1 — полные наборы рас от Художника (когда появятся)
Имена в наборах рас: <kind>_<pose>.png (kind: pawn knight mage rook hero king; pose: idle attack hit death),
  а также имена Художника <name>_<race>_<pose>.png: militia→pawn, rider→knight, mage, guard→rook, hero, chief→king;
  tile_light/tile_dark.png; fx_hit_<race>_01..08.png. В манифест пишется bbox непрозрачной части (центровка фигур).
Запуск: python3 tools/strat/sync_art.py  (из корня репозитория)"""
import json, os, re, shutil, sys
from pathlib import Path
ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "public/strat/art"
ART = Path("/workspace/art/black-kings")
ALIAS = {"militia": "pawn", "rider": "knight", "mage": "mage", "guard": "rook", "hero": "hero", "chief": "king",
         "pawn": "pawn", "knight": "knight", "rook": "rook", "king": "king"}
KINDS = ["pawn", "knight", "mage", "rook", "hero", "king"]; POSES = ["idle", "attack", "hit", "death"]
SRCS = [(ART / "style-sample-v2/variant_c", None), (ART / "race-fire-v1", "fire"), (ART / "race-ice-v1", "ice")]
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
        m = re.fullmatch(r"(%s)_(fire|ice)_(idle|attack|hit|death)" % "|".join(ALIAS), n)
        if m: r, pose, kind = m[2], m[3], ALIAS[m[1]]
        else:
            m = re.fullmatch(r"(?:(fire|ice)_)?(%s)_(idle|attack|hit|death)" % "|".join(KINDS), n)
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
        m = re.fullmatch(r"fx_hit_(fire|ice)_(\d\d)", n)
        if m: man["fx"].setdefault(m[1], []).append(put(f, f"fx/hit_{m[1]}_{m[2]}.png"))
for r in man["fx"]: man["fx"][r] = sorted(set(man["fx"][r]))
(OUT / "manifest.json").write_text(json.dumps(man, ensure_ascii=False, indent=1))
u = sum(len(p) for r in man["units"].values() for p in r.values())
print(f"готово: позы {u}, тайлы {len(man['tiles'])}, fx {sum(len(v) for v in man['fx'].values())} → {OUT}")
