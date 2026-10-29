#!/bin/bash
# LOCAL: скриншоты + mp4 по стихиям (мир / кузня / админка) на своём стенде 5417/8417. Без деплоя.
cd "$(dirname "$0")"; export PATH=/workspace/tools/node22/bin:$PATH
VD=/workspace/black-magic/videos; mkdir -p $VD
for EL in ${ELS:-water stone nature lightning}; do
  for G in ${GROUPS_:-forge:forge world:swing,shot,camp admin:admin}; do N=${G%%:*}; SEG=${G#*:}; TMP=/tmp/vid-$EL-$N; rm -rf $TMP; mkdir -p $TMP
    EL=$EL SEG=$SEG VIDEO=$TMP nice node bm-elems.cjs > /tmp/el-$EL-$N.log 2>&1; echo "$EL $N rc=$? $(grep -c '^ok' /tmp/el-$EL-$N.log) ok / $(grep -c '^FAIL' /tmp/el-$EL-$N.log) fail"
    W=$(ls -S $TMP/*.webm | head -1); M=/workspace/black-magic/shots-el4/$EL/marks-$SEG.json
    SS=$(node -e "try{const m=require('$M');console.log(Math.max(0,(m[0]?.[1]||8)-9).toFixed(1))}catch{console.log(0)}")
    nice ffmpeg -loglevel error -y -ss $SS -i "$W" -c:v libx264 -preset veryfast -crf 26 -pix_fmt yuv420p -movflags +faststart "$VD/el4-$EL-$N.mp4" && echo "  -> $VD/el4-$EL-$N.mp4 (с $SS с) $(ffprobe -v error -show_entries format=duration -of csv=p=0 $VD/el4-$EL-$N.mp4)"
  done
done
