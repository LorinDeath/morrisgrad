# Повтор правки Художника на НОВЫХ файлах Историка (18:11): голова по calm, низ из calm. Оригиналы не трогаем → emo_*_fixed_v3.png
import sys; sys.path.insert(0,'/workspace/vn_fix')
from fix import *
for cid,emo,full in [('warrior','fear',True),('spearman','anger',False),('rogue','determined',False)]:
    R=ld(O+f'{cid}/emo_calm.png'); ht=np.where((R[...,3]>128).sum(1)>25)[0][0]
    seam=ht+250
    R,out,s=fix(cid,emo,'calm',seam)
    H=1024; y=np.arange(H)[:,None].astype(np.float32)
    lo,hi=(seam+20,seam+70) if full else (seam+150,seam+260)
    w=np.clip((hi-y)/(hi-lo),0,1)*np.ones((1,768))   # 1 — новая эмоция, 0 — calm
    if not full: w=np.ones_like(w)  # своё тело целиком; calm только закрывает пустоты снизу
    m=blend(out,R,w.astype(np.float32))
    m=over(m, R*(y[...,None]>seam).astype(np.uint8))  # дыры снизу закрыть calm
    Image.fromarray(dehalo(m)).save(O+f'{cid}/emo_{emo}_fixed_v3.png')
    W=Image.new('RGBA',(768*3,1024),(40,40,60,255))
    for k,p in enumerate([f'{cid}/emo_calm.png',f'{cid}/emo_{emo}.png',f'{cid}/emo_{emo}_fixed_v3.png']): W.alpha_composite(Image.open(O+p).convert('RGBA'),(768*k,0))
    W.resize((1152,512)).save(f'/workspace/vn_fix/v3_{cid}.png')
