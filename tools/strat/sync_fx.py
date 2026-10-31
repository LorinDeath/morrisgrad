#!/usr/bin/env python3
"""Эффекты fx-v1 Художника → public/strat/art/fx/ (webp, + fx-manifest.json для src/scripts/strat/fx2.ts).
Источник: /workspace/art/black-kings/fx-v1/manifest.json (assets) и <dir>/<name>.json (frame_list, sheet);
запасной путь — старые src/manifest_{vfx,ult}.json. Анимация = один лист (sheet), статика = один png.
Берутся категории, которые играет клиент: vfx, ult, status, proj, ent, баннеры (статичные, без _pop/_example).
Чего нет в манифесте — клиент просто не рисует (без 404).   python3 tools/strat/sync_fx.py [SRC] [DST]"""
import json, os, shutil, sys

SRC = sys.argv[1] if len(sys.argv) > 1 else "/workspace/art/black-kings/fx-v1"
DST = sys.argv[2] if len(sys.argv) > 2 else os.path.join(os.path.dirname(__file__), "../../public/strat/art/fx")
URL = "/strat/art/fx/"  # рядом с hit_<раса>_NN.png из sync_art.py (sync_art пересоздаёт art/ и потом зовёт этот скрипт)
from PIL import Image
def put(src, name):  # → webp без потерь (плоская заливка сжимается в разы); вернуть url
    Image.open(src).save(os.path.join(DST, name + ".webp"), "WEBP", lossless=True, method=6); return URL + name + ".webp"
CATS = {"vfx", "ult", "status", "proj", "ent", "banner", "overlay"}
out = {}
def anim(name, m):
    d = os.path.join(SRC, m["dir"]); j = os.path.join(SRC, m["json"]) if m.get("json") else os.path.join(d, name + ".json")
    if not os.path.exists(j): return
    meta = json.load(open(j)); sheet = os.path.join(d, meta.get("sheet") or name + "_sheet.png")
    if not os.path.exists(sheet) or not meta.get("frame_list"): return
    sz = m.get("size") or [meta.get("frame_w"), meta.get("frame_h")]
    out[name] = {"src": put(sheet, name), "w": meta.get("frame_w", sz[0]), "h": meta.get("frame_h", sz[1]),
                 "fr": [[f["x"], f["y"], f["w"], f["h"]] for f in meta["frame_list"]], "fps": meta.get("fps", m.get("fps", 16)),
                 "anchor": meta.get("anchor", m.get("anchor")), "loop": meta.get("loop", m.get("loop"))}
def static(name, m):
    p = os.path.join(SRC, m["png"])
    if not os.path.exists(p): return
    w, h = m["size"]
    out[name] = {"src": put(p, name), "w": w, "h": h, "fr": [[0, 0, w, h]], "fps": 1, "anchor": m.get("anchor", [w // 2, h // 2]), "loop": None}
    if m.get("name_field"): out[name]["nameField"] = m["name_field"]
    if m.get("subtitle_plate"): out[name]["subPlate"] = m["subtitle_plate"]
os.makedirs(DST, exist_ok=True)
top = os.path.join(SRC, "manifest.json")
if os.path.exists(top):
    for name, m in json.load(open(top)).get("assets", {}).items():
        if m.get("cat") not in CATS or name.endswith("_pop") or "_example" in name or (m["cat"] == "overlay" and name.endswith("_256")): continue
        (anim if m.get("kind") == "anim" else static)(name, m)
for mf in ("manifest_vfx.json", "manifest_ult.json"):  # старый формат
    p = os.path.join(SRC, "src", mf)
    if os.path.exists(p):
        for name, m in json.load(open(p)).items():
            if name not in out: anim(name, m)
json.dump(out, open(os.path.join(DST, "fx-manifest.json"), "w"), ensure_ascii=False, separators=(",", ":"))
print(len(out), "эффектов →", os.path.abspath(DST))
