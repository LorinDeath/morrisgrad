"""Сборка атласов героев/NPC из утверждённых листов (Алекс, 2026-10-14).
Вход: /workspace/sprites/<hero>_{24x24,48x60}.png, /workspace/mobs_new/npc/<npc>_{24x24,48x60}.png,
      /workspace/mobs_new/legacy/chars_atlas.png (база: строки NPC 4–7).
Лист героя: 4 строки (вниз, влево, вправо, вверх) × 6 колонок (шаг A, стойка, шаг B, вдох, замах, удар).
Выход: src/assets/mc/chars_atlas.png (24×24, 24 кол × 8 строк) и heroes_atlas.png (48×60, 24 кол × 8 строк):
строки spearman=nofford, rogue=kavega, mage=mariel, warrior=veles, alzi, leyr, petr, kyut."""
import os, sys
from PIL import Image
SP = os.environ.get('SPRITES', '/workspace/sprites'); NPC = os.environ.get('NPCS', '/workspace/mobs_new/npc')
BASE = os.environ.get('CHARS_BASE', '/workspace/mobs_new/legacy/chars_atlas.png')
OUT = os.path.join(os.path.dirname(__file__), '../../src/assets/mc')
ROWS = [(SP, 'nofford'), (SP, 'kavega'), (SP, 'mariel'), (SP, 'veles'), (NPC, 'alzi'), (NPC, 'leyr'), (NPC, 'petr'), (NPC, 'kyut')]
def build(cw, ch, suffix, base=None):
    atlas = Image.open(base).convert('RGBA') if base else Image.new('RGBA', (cw * 24, ch * 8), (0, 0, 0, 0))
    assert atlas.size == (cw * 24, ch * 8), atlas.size
    for r, (d, name) in enumerate(ROWS):
        p = os.path.join(d, f'{name}_{suffix}.png')
        if not os.path.exists(p): print('нет', p); continue
        sh = Image.open(p).convert('RGBA'); assert sh.size == (cw * 6, ch * 4), (p, sh.size)
        atlas.paste(Image.new('RGBA', (cw * 24, ch), (0, 0, 0, 0)), (0, r * ch))
        for di in range(4):
            for f in range(6):
                atlas.paste(sh.crop((f * cw, di * ch, (f + 1) * cw, (di + 1) * ch)), ((di * 6 + f) * cw, r * ch))
    return atlas
build(24, 24, '24x24', BASE).save(os.path.join(OUT, 'chars_atlas.png'))
build(48, 60, '48x60').save(os.path.join(OUT, 'heroes_atlas.png'))
print('ok')
