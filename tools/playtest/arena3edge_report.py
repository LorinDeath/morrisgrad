# LOCAL ONLY: python3 tools/playtest/arena3edge_report.py — SHOTS (снимки arena3-edge.cjs: TAG=before — граница tiles, TAG=r2 — round), OUT
# Листы «было / стало» кромки арены 32: по теме и платформе — строки видов, столбцы было | стало; плюс обзор диагоналей 4 темы.
import os
from PIL import Image, ImageDraw, ImageFont
S=os.environ.get('SHOTS','/workspace/a3edge/shots'); O=os.environ.get('OUT') or '/workspace/morrisgrad-round3/props3/arena3edge'; os.makedirs(O+'/raw',exist_ok=True)
try: F=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',16); FB=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',20)
except Exception: F=FB=ImageFont.load_default()
TH=['crypt','abyss','mirror','abode']; NM={'crypt':'Склеп','abyss':'Бездна','mirror':'Отражения','abode':'Обитель'}
VIEWS=[('nw','z0.5','диагональ СЗ, обычный зум'),('nw','z2','диагональ СЗ, крупно ×4'),('sw','z1','диагональ ЮЗ, ×2'),('w','z2','запад (бок), ×4'),('n','z1','север, ×2'),('s','z1','юг, ×2')]
def load(pf,th,tag,pt,z,w):
    f=f'{S}/{pf}-{th}-{tag}-{pt}-{z}.png'
    if not os.path.exists(f): return None
    im=Image.open(f).convert('RGB'); return im.resize((w,int(im.height*w/im.width)),Image.LANCZOS)
def sheet(pf,th,views,out,w):
    rows=[]
    for pt,z,lab in views:
        a=load(pf,th,'before',pt,z,w); b=load(pf,th,'r2',pt,z,w)
        if a and b: rows.append((lab,a,b))
    if not rows: return
    h=rows[0][1].height; W=2*w+30; H=50+len(rows)*(h+26)
    o=Image.new('RGB',(W,H),(16,16,22)); d=ImageDraw.Draw(o)
    d.text((10,8),f'{NM[th]} ({th}) · {"ПК" if pf=="pc" else "телефон"} · кромка арены 32',font=FB,fill=(235,235,235))
    d.text((10,32),'было (ступени по клеткам 1.6 м)',font=F,fill=(255,150,150)); d.text((w+20,32),'стало (ровный круг)',font=F,fill=(150,255,150))
    for i,(lab,a,b) in enumerate(rows):
        y=50+i*(h+26); d.text((10,y+2),lab,font=F,fill=(200,200,200)); o.paste(a,(10,y+22)); o.paste(b,(w+20,y+22))
    o.save(out)
for pf,w in [('pc',620),('phone',300)]:
    for th in TH: sheet(pf,th,VIEWS,f'{O}/{pf}-{th}-before-after.png',w)
# обзор: 4 темы, диагональ — было/стало, обычный зум и ×4
def overview(pf,z,out,w):
    rows=[(NM[t],load(pf,t,'before','nw',z,w),load(pf,t,'r2','nw',z,w)) for t in TH]
    rows=[r for r in rows if r[1] and r[2]]
    if not rows: return
    h=rows[0][1].height; o=Image.new('RGB',(2*w+30,50+len(rows)*(h+26)),(16,16,22)); d=ImageDraw.Draw(o)
    d.text((10,8),f'Кромка арены 32 · диагональ СЗ · {"ПК" if pf=="pc" else "телефон"} · {"обычный зум" if z=="z0.5" else "×2" if z=="z1" else "×4"}',font=FB,fill=(235,235,235))
    d.text((10,32),'было',font=F,fill=(255,150,150)); d.text((w+20,32),'стало',font=F,fill=(150,255,150))
    for i,(lab,a,b) in enumerate(rows):
        y=50+i*(h+26); d.text((10,y+2),lab,font=F,fill=(200,200,200)); o.paste(a,(10,y+22)); o.paste(b,(w+20,y+22))
    o.save(out)
for pf,w in [('pc',560),('phone',280)]:
    for z in ['z0.5','z2']: overview(pf,z,f'{O}/{pf}-all-diag-{z.replace(".","")}.png',w)
import shutil,glob
for f in glob.glob(S+'/*-before-*.png')+glob.glob(S+'/*-r2-*.png'): shutil.copy(f,O+'/raw/'+os.path.basename(f).replace('-r2-','-after-'))
print('ok', sorted(os.listdir(O)))
