from PIL import Image, ImageDraw
import random
random.seed(7)
OUT='/workspace/mg-qol/src/assets/mc/board/'
O=(28,18,14,255)           # контур
def box(d,x0,y0,x1,y1,c): d.rectangle((x0,y0,x1,y1),fill=c)
def wood(d,x0,y0,x1,y1,base,dark,light):
    box(d,x0,y0,x1,y1,base)
    for y in range(y0,y1+1):
        for x in range(x0,x1+1):
            r=random.random()
            if r<0.08: d.point((x,y),dark)
            elif r<0.12: d.point((x,y),light)
# ——— Доска объявлений: два столба, козырёк, щит с листками ———
W,H=64,64
im=Image.new('RGBA',(W,H),(0,0,0,0)); d=ImageDraw.Draw(im)
POST=(92,58,36,255); POSTD=(64,40,26,255); POSTL=(122,80,48,255)
# столбы
for px in (10,50):
    box(d,px-1,14,px+4,62,O); wood(d,px,15,px+3,61,POST,POSTD,POSTL); d.line((px,15,px,61),fill=POSTL)
# козырёк
box(d,4,8,59,14,O)
for i,x in enumerate(range(5,59,6)):
    wood(d,x,9,min(58,x+5),13,(110,64,40,255),(78,44,28,255),(140,88,56,255)); d.line((x,9,x,13),fill=(70,40,26,255))
d.line((5,9,58,9),fill=(156,104,64,255))
box(d,6,15,57,16,(40,26,18,200))  # тень под козырьком
# щит
box(d,7,17,56,49,O)
wood(d,8,18,55,48,(132,90,56,255),(104,68,42,255),(156,110,70,255))
for y in (25,33,41): d.line((8,y,55,y),fill=(110,74,46,255))
# листки (бумага, разные оттенки) + кнопки
PAP=[(232,220,188,255),(222,206,170,255),(238,228,200,255),(214,198,160,255)]
sheets=[(11,20,22,31),(25,19,37,30),(40,21,52,33),(12,34,23,46),(27,33,39,46),(42,36,53,46)]
for i,(x0,y0,x1,y1) in enumerate(sheets):
    c=PAP[i%4]; box(d,x0+1,y0+1,x1+1,y1+1,(60,40,26,140)); box(d,x0,y0,x1,y1,c)
    d.line((x0,y1,x1,y1),fill=(190,172,136,255)); d.line((x1,y0,x1,y1),fill=(196,180,144,255))
    for ly in range(y0+3,y1-1,2):
        w=random.randint(4,x1-x0-2); d.line((x0+2,ly,x0+1+w,ly),fill=(120,104,84,255))
    pin=[(170,40,36,255),(60,90,150,255),(200,160,40,255)][i%3]
    d.point(((x0+x1)//2,y0+1),pin); d.point(((x0+x1)//2,y0),(40,24,20,255))
# красная печать «заказ» на одном листке
box(d,48,28,50,30,(150,30,30,255))
# основание: трава/камни
pass
im.save(OUT+'notice_board.png')
# ——— Доска достижений: тёмная каменная стела с бронзовыми табличками ———
im=Image.new('RGBA',(W,H),(0,0,0,0)); d=ImageDraw.Draw(im)
ST=(70,66,82,255); STD=(50,46,62,255); STL=(98,92,112,255)
# постамент
box(d,8,54,55,62,O); wood(d,9,55,54,61,(84,78,96,255),STD,STL); d.line((9,55,54,55),fill=STL)
# стела с закруглённым верхом
box(d,12,10,51,54,O)
d.ellipse((12,2,51,24),fill=O)
d.ellipse((13,3,50,23),fill=ST); box(d,13,12,50,53,ST)
for y in range(3,54):
    for x in range(13,51):
        if im.getpixel((x,y))[:3]==ST[:3]:
            r=random.random()
            if r<0.07: d.point((x,y),STD)
            elif r<0.10: d.point((x,y),STL)
d.line((13,14,13,53),fill=STL); d.line((50,14,50,53),fill=STD)
# герб сверху: щит
box(d,28,6,35,13,(150,112,52,255)); d.line((28,6,35,6),fill=(200,160,80,255)); d.point((31,14),(150,112,52,255)); d.point((32,14),(150,112,52,255))
d.line((31,8,32,8),fill=(90,60,30,255)); d.line((30,10,33,10),fill=(90,60,30,255))
# таблички (бронза) в 2 колонки
BR=(166,122,58,255); BRD=(118,84,40,255); BRL=(214,170,96,255)
for row,y in enumerate((18,26,34,42)):
    for col,x in enumerate((16,33)):
        box(d,x,y,x+13,y+5,O); box(d,x+1,y+1,x+12,y+4,BR)
        d.line((x+1,y+1,x+12,y+1),fill=BRL); d.line((x+1,y+4,x+12,y+4),fill=BRD)
        w=random.randint(5,9); d.line((x+3,y+2,x+2+w,y+2),fill=BRD)
        if (row+col)%3==0: d.line((x+3,y+3,x+6,y+3),fill=BRD)
# пустые места (ещё не заслужено) — тёмные ниши
for x,y in ((16,50),(33,50)):
    box(d,x,y-2,x+13,y+2,STD)
im.save(OUT+'ach_board.png')
for n in ('notice_board','ach_board'):
    Image.open(OUT+n+'.png').resize((256,256),Image.NEAREST).save('/tmp/'+n+'_x4.png')
