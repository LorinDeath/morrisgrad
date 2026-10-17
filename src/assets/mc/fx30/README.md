# anim60 — MorrisCurse
## 1. Костёр, 60 кадров, бесшовный цикл
- campfire_60.png — 320×288, сетка 10×6, ячейка 32×48 (как props_v2 p32), кадр k: col k%10, row k//10
- campfire_60_glow.png — та же раскладка, только светящиеся пиксели, blend additive (#ff8a2a)
- campfire_60.json — cell 32×48, frames 60, fps 30, loop true, anchor [0.5,1.0], size_m [3.2,4.8]
- campfire_60_preview.gif — base+glow (glow-ореол в превью — имитация additive), x6, 30 fps (30/40/30 мс), 2 прохода = 120 кадров
- campfire_60_contact_x4.png — все 60 кадров с номерами 01–60
- campfire_60_seam.json — проверка шва; gen_campfire60.py — генератор
Всё во времени — гармоники sin(2π·k·t/60) с целым k, частицы с жизнью 60/30/20/15 кадров (по модулю), поэтому кадр 61 ≡ кадр 1 (проверено пересчётом).
## 2. FX, 30 кадров (fx30/)
- fx30_{s32,s64,w64,t32,a96,c128,r128}.png, fx30_atlas.json (93 ключа, те же имена/aliases/anchor/blend/glow, frames 30, fps 30)
- одна строка на (ключ, анимация), 30 колонок — брать координаты из anims[].x/y/w/h
- preview_<sheet>_x4.gif, contact_<sheet>_x4|x2.png, fx30_seam_report.json
- loop: бесшовно, период 30; cycles_in_loop — сколько исходных циклов уложено в 30 кадров (сохраняет исходную скорость при 30 fps)
- one-shot: 30 кадров от начала до конца, последние 6 кадров — дизер-растворение, кадр 30 полностью прозрачный
- fps_match_original_timing — fps, при котором one-shot длится как раньше (52–120; у большинства ударов 60–105)
- генератор gen_fx30.py берёт рисующие функции из projectiles_v2/gen_fx_v2.py (только чтение)
