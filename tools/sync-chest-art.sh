#!/bin/sh
# Перенос рисунков сундуков наград от художника (/workspace/art/chests) в игру: src/assets/mc/rewardchest.
# Берём только то, что проигрывает клиент: листы открытия, иконки, атлас. Слой *_items.png не нужен —
# вылетают настоящие иконки выпавших вещей. Превью/исходники/_tmp — не в сборку.
set -e
SRC=${1:-/workspace/art/chests}; DST="$(dirname "$0")/../src/assets/mc/rewardchest"
mkdir -p "$DST"
cp "$SRC/chests_atlas.json" "$SRC/chests_icons_20.png" "$SRC/chests_icons_40.png" "$DST/"
for f in "$SRC"/chest_open_*.png; do case "$f" in *_items.png) ;; *) cp "$f" "$DST/" ;; esac; done
ls -la "$DST" | wc -l; du -sh "$DST"
