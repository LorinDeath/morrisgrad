"""Пиксельные иконки навыков, рывка, атаки, оружия и пассивок забега (24×24, прозрачный фон; рамка — CSS).
Палитровая дисциплина: каждая иконка — 1–3 материала pixkit (4 тона + глубокая тень, цветной контур v2),
формы — из набора ручных примитивов (клинок, копьё, взрыв, пламя, снежинка, щит, вихрь…), а не шум.
Выход: src/assets/mc/skill_icons.png + skill_icons.json {cell, cols, index:{id:n}}; превью ×4 в round2/sprites.
"""
import os, json, math
from PIL import Image
from pixkit import Sprite, Mat, hexc

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
OUT = os.path.join(ROOT, 'src', 'assets', 'mc', 'skill_icons.png')
PREV = '/workspace/morrisgrad-round2/sprites'
C = 24
STEEL, STEEL_D, GOLD, WOOD = '#cbd5e1', '#64748b', '#facc15', '#92603a'

def S(): return Sprite(C, C, v2=True)
def M(c, glow=False): return Mat(c, glow=glow)

# ---------- примитивы ----------
def blade(s, x0, y0, x1, y1, w=1.6, col=STEEL, hilt=GOLD, grip=WOOD):
    s.limb(x0, y0, x1, y1, w, M(col), r1=0.5)
    dx, dy = x1 - x0, y1 - y0; L = math.hypot(dx, dy); nx, ny = -dy / L, dx / L
    s.limb(x0 + nx * 3, y0 + ny * 3, x0 - nx * 3, y0 - ny * 3, 0.9, M(hilt))
    s.limb(x0, y0, x0 - dx / L * 3.5, y0 - dy / L * 3.5, 1.0, M(grip))
    s.line(x0 + dx * 0.15, y0 + dy * 0.15, x1 - dx * 0.15, y1 - dy * 0.15, (255, 255, 255, 255))
def spear(s, x0, y0, x1, y1, col=STEEL):
    s.limb(x0, y0, x1, y1, 0.8, M(WOOD))
    dx, dy = x1 - x0, y1 - y0; L = math.hypot(dx, dy); ux, uy = dx / L, dy / L; nx, ny = -uy, ux
    s.poly([(x1 + ux * 5, y1 + uy * 5), (x1 + nx * 2.4, y1 + ny * 2.4), (x1 - ux * 1, y1 - uy * 1), (x1 - nx * 2.4, y1 - ny * 2.4)], M(col))
def burst(s, cx, cy, r0, r1, n, col, core=None, rot=0.0):
    for i in range(n):
        a = rot + i * 2 * math.pi / n
        s.poly([(cx + math.cos(a - 0.22) * r0, cy + math.sin(a - 0.22) * r0), (cx + math.cos(a) * r1, cy + math.sin(a) * r1), (cx + math.cos(a + 0.22) * r0, cy + math.sin(a + 0.22) * r0)], M(col))
    if core: s.ellipse(cx, cy, r0 * 0.9, r0 * 0.9, M(core, glow=True))
def flame(s, cx, by, h, w, c1='#f97316', c2='#facc15', c3='#fff7ed'):
    s.poly([(cx - w, by), (cx - w * 0.9, by - h * 0.45), (cx - w * 0.3, by - h * 0.7), (cx, by - h), (cx + w * 0.4, by - h * 0.55), (cx + w * 0.9, by - h * 0.5), (cx + w, by)], M(c1))
    s.poly([(cx - w * 0.55, by), (cx - w * 0.4, by - h * 0.4), (cx, by - h * 0.7), (cx + w * 0.5, by - h * 0.35), (cx + w * 0.55, by)], M(c2))
    s.ellipse(cx, by - h * 0.18, w * 0.3, h * 0.16, M(c3, glow=True))
def snow(s, cx, cy, r, col='#bae6fd'):
    for i in range(6):
        a = i * math.pi / 3
        s.line(cx, cy, cx + math.cos(a) * r, cy + math.sin(a) * r, hexc(col))
        mx, my = cx + math.cos(a) * r * 0.6, cy + math.sin(a) * r * 0.6
        for sg in (-1, 1): s.line(mx, my, mx + math.cos(a + sg * 0.8) * 2.5, my + math.sin(a + sg * 0.8) * 2.5, hexc(col))
    s.ellipse(cx, cy, 1.6, 1.6, M('#ffffff', glow=True))
def shield(s, cx, cy, w, h, col='#3b82f6', rim=GOLD, emb=None):
    pts = [(cx - w, cy - h * 0.7), (cx, cy - h), (cx + w, cy - h * 0.7), (cx + w * 0.9, cy + h * 0.2), (cx, cy + h), (cx - w * 0.9, cy + h * 0.2)]
    s.poly(pts, M(rim)); s.poly([(x * 0.78 + cx * 0.22, y * 0.78 + cy * 0.22) for x, y in pts], M(col))
    if emb: emb(s, cx, cy)
def swirl(s, cx, cy, r, col, turns=1.6, w=1.2):
    pts = []
    for i in range(40):
        t = i / 39; a = t * turns * 2 * math.pi; rr = r * (0.2 + 0.8 * t)
        pts.append((cx + math.cos(a) * rr, cy + math.sin(a) * rr))
    for (a, b) in zip(pts, pts[1:]): s.limb(a[0], a[1], b[0], b[1], w * (0.5 + 0.5 * pts.index(a) / 39), M(col))
def orb(s, cx, cy, r, col, glow=False):
    s.ellipse(cx, cy, r, r, M(col, glow=glow)); s.ellipse(cx - r * 0.35, cy - r * 0.35, r * 0.28, r * 0.28, M('#ffffff', glow=True))
def star(s, cx, cy, r1, r2, col, n=5, rot=-math.pi / 2):
    pts = [(cx + math.cos(rot + i * math.pi / n) * (r1 if i % 2 == 0 else r2), cy + math.sin(rot + i * math.pi / n) * (r1 if i % 2 == 0 else r2)) for i in range(2 * n)]
    s.poly(pts, M(col))
def crescent(s, cx, cy, r, col, cut=0.45):
    s.ellipse(cx, cy, r, r, M(col)); s.erase(Sprite.ellipse_px(cx + r * cut, cy - r * cut * 0.6, r * 0.85, r * 0.85))
def cloud(s, cx, cy, col='#94a3b8'):
    for dx, dy, r in ((-4, 1, 3.5), (0, -1.5, 4.5), (4.5, 1, 3.5), (0, 2.5, 4)): s.ellipse(cx + dx, cy + dy, r, r * 0.85, M(col))
def heart(s, cx, cy, col='#ef4444'):
    s.ellipse(cx - 3, cy - 2, 3.4, 3.2, M(col)); s.ellipse(cx + 3, cy - 2, 3.4, 3.2, M(col)); s.poly([(cx - 6.2, cy - 1), (cx + 6.2, cy - 1), (cx, cy + 7)], M(col))
def speed(s, x, y, n=3, col='#e2e8f0'):
    for i in range(n): s.line(x - 6 + i, y + i * 2.5 - 2.5, x - 1 + i, y + i * 2.5 - 2.5, hexc(col))
def wing(s, cx, cy, sg, col='#a5f3fc'):
    s.poly([(cx, cy), (cx + sg * 9, cy - 6), (cx + sg * 8, cy - 1), (cx + sg * 6, cy + 2)], M(col))
    s.line(cx + sg * 1, cy - 0.5, cx + sg * 7.5, cy - 4.5, hexc('#0e7490'))

# ---------- иконки ----------
ICONS = {}
def icon(name):
    def deco(fn): ICONS[name] = fn; return fn
    return deco

@icon('backstab')
def _(s): blade(s, 7, 17, 18, 5); s.poly([(3, 20), (6, 12), (9, 20)], M('#7c3aed')); speed(s, 9, 18)
@icon('shield_wall')
def _(s):
    shield(s, 12, 12, 7, 9, '#2563eb', GOLD, lambda s, x, y: star(s, x, y - 0.5, 3.2, 1.4, '#fde68a'))
    for a in (-0.6, 0.6): s.line(12 + math.cos(a + math.pi) * 10, 12 + math.sin(a) * 10, 12 + math.cos(a + math.pi) * 11, 12 + math.sin(a) * 11, hexc('#93c5fd'))
@icon('whirlwind')
def _(s): swirl(s, 12, 12, 10, '#94a3b8'); s.poly([(16, 3), (21, 4), (19, 8)], M(STEEL)); s.poly([(8, 21), (3, 20), (5, 16)], M(STEEL))
@icon('pierce')
def _(s): spear(s, 3, 20, 15, 8); s.line(17, 6, 21, 2, hexc('#fde68a')); s.line(18, 8, 22, 6, hexc('#fde68a'))
@icon('spear_rain')
def _(s):
    for x, y in ((6, 4), (12, 7), (18, 3)): spear(s, x, y, x, y + 9)
    s.ellipse(12, 21, 9, 1.6, M('#64748b'))
@icon('leap_strike')
def _(s): s.limb(4, 20, 12, 6, 0.8, M('#fde68a')); s.limb(12, 6, 19, 18, 0.8, M('#fde68a')); spear(s, 14, 6, 19, 15); burst(s, 19, 20, 1.5, 4, 6, '#fbbf24')
@icon('trick_strike')
def _(s):
    for i in range(6):
        a = i * math.pi / 3
        s.poly([(12 + math.cos(a) * 3, 12 + math.sin(a) * 3), (12 + math.cos(a + 0.35) * 10, 12 + math.sin(a + 0.35) * 10), (12 + math.cos(a + 0.6) * 4, 12 + math.sin(a + 0.6) * 4)], M(STEEL))
    orb(s, 12, 12, 2.6, '#a855f7', glow=True)
@icon('smoke_bomb')
def _(s): cloud(s, 12, 13, '#57534e'); cloud(s, 13, 10, '#78716c'); orb(s, 8, 18, 2.4, '#1c1917'); s.px(9, 15, hexc('#fb923c'), glow=True)
@icon('shadow_step')
def _(s): flame(s, 8, 21, 10, 4); flame(s, 15, 21, 14, 5, '#dc2626', '#f97316'); speed(s, 21, 9, 3, '#fca5a5')
@icon('fireball')
def _(s): s.poly([(3, 21), (10, 10), (14, 15)], M('#f97316')); orb(s, 14, 10, 6, '#ef4444'); s.ellipse(14, 10, 3.4, 3.4, M('#fde047', glow=True))
@icon('frost_nova')
def _(s): snow(s, 12, 12, 9); s.ellipse(12, 12, 3.6, 3.6, M('#7dd3fc'))
@icon('meteor')
def _(s):
    for i in range(3): s.line(2 + i * 2, 4 + i * 3, 11 + i, 12 + i, hexc('#fdba74'))
    orb(s, 15, 15, 5.5, '#a16207'); s.ellipse(15, 15, 3, 3, M('#f97316', glow=True))
@icon('fly_blade_dash')
def _(s):
    s.ellipse(12, 13, 3.5, 4.5, M('#334155')); s.ellipse(12, 7.5, 3, 2.6, M('#1e293b'))
    s.px(11, 7, (239, 68, 68, 255), glow=True); s.px(13, 7, (239, 68, 68, 255), glow=True)
    wing(s, 10, 11, -1); wing(s, 14, 11, 1)
    for sg in (-1, 1): s.poly([(12 + sg * 3, 16), (12 + sg * 10, 20), (12 + sg * 4, 18)], M(STEEL))
    speed(s, 6, 21, 2, '#a5f3fc')
@icon('dew_splash')
def _(s):
    s.poly([(12, 2), (17, 11), (12, 15), (7, 11)], M('#38bdf8')); s.ellipse(12, 11, 5, 4.5, M('#38bdf8'))
    for x in (4, 20): s.ellipse(x, 18, 2, 2.4, M('#7dd3fc'))
    s.ellipse(12, 20, 9, 1.8, M('#0ea5e9')); s.px(10, 8, (255, 255, 255, 255))
@icon('swarm_call')
def _(s):
    for (x, y) in ((7, 8), (16, 6), (12, 15), (18, 16), (5, 17)):
        s.ellipse(x, y, 2.4, 1.8, M('#facc15')); s.line(x - 1, y, x + 1, y, hexc('#1c1917')); s.ellipse(x - 0.5, y - 2, 1.6, 1, M('#e0f2fe'))
@icon('stag_charge')
def _(s):
    s.ellipse(13, 15, 5, 4, M('#f8fafc')); s.ellipse(17, 11, 2.6, 2.2, M('#f8fafc'))
    for sg, c in ((-1, '#e2e8f0'), (1, '#e2e8f0')):
        s.limb(16, 9, 14 + sg * 4, 3, 0.6, M('#fde68a')); s.limb(15 + sg * 2, 6, 15 + sg * 5, 5, 0.5, M('#fde68a'))
    speed(s, 7, 14, 3, '#bae6fd')
@icon('thorn_bloom')
def _(s):
    for i in range(5):
        a = -math.pi / 2 + i * 2 * math.pi / 5
        s.ellipse(12 + math.cos(a) * 4, 11 + math.sin(a) * 4, 3, 3, M('#e11d48'))
    s.ellipse(12, 11, 2.4, 2.4, M('#fda4af')); s.limb(12, 15, 12, 22, 0.8, M('#15803d'))
    for y, sg in ((18, -1), (20, 1)): s.poly([(12, y), (12 + sg * 4, y - 2), (12 + sg * 1, y - 1)], M('#22c55e'))
@icon('gear_spin')
def _(s):
    burst(s, 12, 12, 6, 9.5, 8, '#b45309'); s.ellipse(12, 12, 6.5, 6.5, M('#d97706')); s.ellipse(12, 12, 2.4, 2.4, M('#451a03'))
@icon('warden_slam')
def _(s):
    s.limb(6, 18, 14, 8, 1.0, M(WOOD)); s.rect(11, 3, 19, 9, M('#64748b')); s.rect(12, 4, 18, 5, M('#cbd5e1'), tone=2)
    burst(s, 7, 20, 1.5, 5, 7, '#fde68a', rot=0.3)
@icon('dead_calm')
def _(s): crescent(s, 12, 11, 8, '#e0e7ff'); s.line(3, 20, 21, 20, hexc('#818cf8')); s.line(6, 22, 18, 22, hexc('#6366f1'))
@icon('vortex_pull')
def _(s): swirl(s, 12, 12, 10, '#a78bfa', turns=2.2, w=1.0); orb(s, 12, 12, 2.2, '#4c1d95')
@icon('total_silence')
def _(s):
    s.ellipse(12, 12, 9, 9, M('#e2e8f0')); s.ellipse(12, 12, 7, 7, M('#334155'))
    s.rect(7, 10, 9, 14, M('#e2e8f0')); s.poly([(9, 10), (13, 7), (13, 17), (9, 14)], M('#e2e8f0'))
    s.limb(5, 5, 19, 19, 1.0, M('#ef4444'))
@icon('starfall')
def _(s):
    for (x, y, r) in ((7, 6, 3.5), (16, 10, 4.5), (9, 17, 3)): star(s, x, y, r, r * 0.45, '#fde047')
    for (x, y) in ((4, 3), (13, 6), (6, 14)): s.line(x - 3, y - 3, x - 1, y - 1, hexc('#fef9c3'))
@icon('eclipse')
def _(s): s.ellipse(12, 12, 9, 9, M('#f59e0b', glow=True)); s.ellipse(13, 11, 7.5, 7.5, M('#1e1b4b')); s.px(7, 8, (254, 243, 199, 255), glow=True)
# рывок / атака
@icon('dash')
def _(s): s.poly([(10, 4), (15, 4), (21, 12), (15, 20), (10, 20), (15, 12)], M('#38bdf8')); s.poly([(3, 6), (7, 6), (11, 12), (7, 18), (3, 18), (7, 12)], M('#0ea5e9'))
@icon('attack')
def _(s): blade(s, 6, 18, 18, 6, 1.8); s.poly([(14, 3), (21, 2), (20, 9)], M('#fde68a', glow=True))
# оружие забега
@icon('w_soul_spark')
def _(s): star(s, 12, 12, 9, 3, '#e9d5ff', n=4); s.ellipse(12, 12, 2.4, 2.4, M('#ffffff', glow=True))
@icon('w_war_axe')
def _(s): s.limb(6, 20, 15, 6, 0.9, M(WOOD)); s.poly([(12, 3), (20, 4), (21, 11), (15, 9)], M(STEEL))
@icon('w_spear')
def _(s): spear(s, 4, 20, 16, 8)
@icon('w_daggers')
def _(s): blade(s, 6, 19, 15, 9, 1.2); blade(s, 18, 19, 10, 9, 1.2)
@icon('w_fire_spark')
def _(s): flame(s, 12, 21, 17, 7)
@icon('w_orbit_skulls')
def _(s):
    s.ellipse(12, 12, 9, 9, M('#4c1d95')); s.erase(Sprite.ellipse_px(12, 12, 7.5, 7.5))
    for (x, y) in ((12, 4), (19, 15), (5, 15)):
        s.ellipse(x, y, 3, 2.8, M('#f5f5f4')); s.px(x - 1, y, (24, 14, 30, 255)); s.px(x + 1, y, (24, 14, 30, 255))
@icon('w_chain_bolt')
def _(s): s.poly([(14, 2), (6, 13), (11, 13), (8, 22), (18, 9), (13, 9), (17, 2)], M('#fde047'))
@icon('w_ice_fan')
def _(s):
    for a in (-0.7, -0.35, 0, 0.35, 0.7): s.poly([(12, 20), (12 + math.sin(a) * 15 - 1.4, 20 - math.cos(a) * 15), (12 + math.sin(a) * 15 + 1.4, 20 - math.cos(a) * 15)], M('#bae6fd'))
@icon('w_thorn_bow')
def _(s):
    pts = [(7 + 6 * math.sin(t / 12 * math.pi), 3 + t * 1.5) for t in range(13)]
    for a, b in zip(pts, pts[1:]): s.limb(a[0], a[1], b[0], b[1], 0.8, M('#166534'))
    s.line(7, 3, 7, 21, hexc('#e2e8f0')); s.limb(7, 12, 20, 12, 0.5, M(WOOD)); s.poly([(19, 10), (23, 12), (19, 14)], M(STEEL))
@icon('w_moon_orb')
def _(s): orb(s, 12, 12, 8, '#fef3c7'); s.ellipse(9, 14, 1.6, 1.6, M('#e7e5e4')); s.ellipse(15, 9, 1.2, 1.2, M('#e7e5e4'))
@icon('w_glyph_mine')
def _(s): star(s, 12, 12, 9, 4.5, '#a855f7', n=6, rot=0); s.ellipse(12, 12, 3, 3, M('#f0abfc', glow=True))
@icon('w_sun_beam')
def _(s): burst(s, 12, 12, 5, 10, 8, '#fbbf24', core='#fef08a')
@icon('w_split_shard')
def _(s): s.poly([(12, 2), (19, 10), (12, 22), (5, 10)], M('#22d3ee')); s.line(12, 2, 12, 22, hexc('#a5f3fc')); s.line(5, 10, 19, 10, hexc('#0e7490'))
@icon('w_plague_flask')
def _(s): s.rect(10, 3, 14, 7, M('#a8a29e')); s.ellipse(12, 15, 7, 7, M('#84cc16')); s.ellipse(12, 11, 5, 2, M('#d9f99d', glow=True)); s.px(9, 13, (255, 255, 255, 255))
@icon('w_fly_blades')
def _(s): swirl(s, 12, 12, 9, STEEL, turns=1.2, w=1.4); s.ellipse(12, 12, 2.2, 2.2, M('#ef4444', glow=True))
# пассивки
@icon('p_might')
def _(s): s.ellipse(12, 12, 7, 6, M('#f59e0b')); s.rect(6, 7, 17, 10, M('#f59e0b')); [s.line(7 + i * 3, 7, 7 + i * 3, 10, hexc('#78350f')) for i in range(4)]
@icon('p_haste')
def _(s): s.ellipse(12, 13, 8, 8, M('#e2e8f0')); s.rect(10, 2, 14, 4, M('#94a3b8')); s.line(12, 13, 12, 7, hexc('#1e293b')); s.line(12, 13, 16, 15, hexc('#ef4444'))
@icon('p_swift')
def _(s): s.poly([(6, 6), (12, 6), (12, 15), (20, 16), (20, 20), (6, 20)], M('#a16207')); speed(s, 6, 9, 3, '#fde68a'); wing(s, 12, 9, 1, '#f8fafc')
@icon('p_magnet')
def _(s):
    for sg in (-1, 1): s.limb(12 + sg * 5, 6, 12 + sg * 5, 15, 2.0, M('#ef4444')); s.rect(12 + sg * 5 - 2, 3, 12 + sg * 5 + 2, 6, M('#e2e8f0'))
    s.ellipse(12, 15, 7, 5, M('#ef4444')); s.ellipse(12, 14, 3, 3, M('#00000000'.replace('00000000', '1e1b4b')))
@icon('p_vigor')
def _(s): heart(s, 12, 12)
@icon('p_regen')
def _(s): s.poly([(5, 19), (8, 8), (19, 4), (16, 15)], M('#22c55e')); s.line(6, 18, 17, 6, hexc('#14532d'))
@icon('p_amount')
def _(s): s.rect(10, 4, 14, 20, M('#fde68a')); s.rect(4, 10, 20, 14, M('#fde68a'))
@icon('p_area')
def _(s): s.ellipse(12, 12, 9.5, 9.5, M('#c084fc')); s.erase(Sprite.ellipse_px(12, 12, 7, 7)); s.ellipse(12, 12, 2, 2, M('#f5d0fe', glow=True))
@icon('p_luck')
def _(s):
    for dx, dy in ((-3.5, -3), (3.5, -3), (-3.5, 3), (3.5, 3)): s.ellipse(12 + dx, 11 + dy, 3.6, 3.6, M('#22c55e'))
    s.limb(14, 15, 18, 22, 0.6, M('#15803d'))
@icon('p_mastery')
def _(s): s.rect(5, 6, 19, 18, M('#fef3c7')); s.ellipse(5, 12, 2, 6, M('#d6c7a1')); s.ellipse(19, 12, 2, 6, M('#d6c7a1')); [s.line(8, 9 + i * 3, 16, 9 + i * 3, hexc('#92400e')) for i in range(3)]
@icon('locked')
def _(s): s.rect(6, 11, 18, 20, M('#64748b')); s.ellipse(12, 10, 5, 5, M('#94a3b8')); s.erase(Sprite.ellipse_px(12, 10, 3, 3)); s.rect(11, 14, 13, 17, M('#1e293b'), tone=2)
@icon('empty')
def _(s): s.ellipse(12, 12, 2, 2, M('#475569'))

def main():
    names = list(ICONS.keys()); cols = 10; rows = (len(names) + cols - 1) // cols
    atlas = Image.new('RGBA', (cols * C, rows * C), (0, 0, 0, 0))
    for i, n in enumerate(names):
        s = S(); ICONS[n](s); atlas.paste(s.render(outline=True), ((i % cols) * C, (i // cols) * C))
    atlas.save(OUT)
    json.dump({'cell': C, 'cols': cols, 'rows': rows, 'index': {n: i for i, n in enumerate(names)}}, open(OUT.replace('.png', '.json'), 'w'))
    bg = Image.new('RGBA', atlas.size, (30, 22, 46, 255)); bg.alpha_composite(atlas)
    os.makedirs(PREV, exist_ok=True); bg.resize((bg.width * 4, bg.height * 4), Image.NEAREST).save(os.path.join(PREV, 'skill_icons_x4.png'))
    print('icons', len(names), atlas.size)

if __name__ == '__main__':
    main()
