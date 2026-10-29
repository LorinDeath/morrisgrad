import json,subprocess,sys
V='/workspace/black-magic/videos'
for el in ['water','stone','nature','lightning']:
    m=dict(json.load(open(f'/workspace/black-magic/shots-el4/{el}/marks-swing,shot,camp.json')))
    base=min(m.values())-9
    segs={'swing':(m['w01-swing-trail']-5,m['w03-pure-numbers']+3),
          'shots':(min(v for k,v in m.items() if k.startswith('s-'))-6,max(v for k,v in m.items() if k.startswith('s-'))+4),
          'camp-drop':(m['c01-camp']-3,m['c06-camp-chest-taken']+3)}
    for n,(a,b) in segs.items():
        a=max(0,a-base); b=b-base
        out=f'{V}/short/el4-{el}-{n}.mp4'
        subprocess.run(['nice','ffmpeg','-loglevel','error','-y','-ss',f'{a:.2f}','-t',f'{b-a:.2f}','-i',f'{V}/el4-{el}-world.mp4','-vf','scale=1280:-2','-c:v','libx264','-preset','veryfast','-crf','28','-an','-pix_fmt','yuv420p','-movflags','+faststart',out],check=True)
        print(out, round(b-a,1))
