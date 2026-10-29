#!/usr/bin/env python3
"""Генерирует server/meta/bmElemNames.ts: имена деталей оружия и частей тела стихий (из индексов public/bm-art).
Запуск после sync-elem.py: python3 tools/bm-art/gen-elem-names.py water stone nature lightning"""
import json, sys, os
R = os.path.join(os.path.dirname(__file__), "..", "..")
W = json.load(open(os.path.join(R, "public/bm-art/weapon/index.json")))
B = json.load(open(os.path.join(R, "public/bm-art/body/index.json")))["parts"]
els = sys.argv[1:] or ["water", "stone", "nature", "lightning"]
out = {"weapon": {}, "body": {}}
for el in els:
    p = el + "_"
    out["weapon"][el] = {k[len(p):]: v.get("name", k) for k, v in sorted(W.items()) if k.startswith(p)}
    out["body"][el] = {k[len(p):]: v.get("name", k) for k, v in sorted(B.items()) if k.startswith(p)}
src = "// СГЕНЕРИРОВАНО tools/bm-art/gen-elem-names.py — имена листов Художника для стихий этапа 2 (не править руками)\n"
src += "export const BM_ELEM_NAMES: { weapon: Record<string, Record<string, string>>; body: Record<string, Record<string, string>> } = " + json.dumps(out, ensure_ascii=False) + ";\n"
open(os.path.join(R, "server/meta/bmElemNames.ts"), "w").write(src)
print({el: (len(out["weapon"][el]), len(out["body"][el])) for el in els})
