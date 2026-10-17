# props v2 — MAPPING

Sheets: `props_p32.png` (cells 32×48 = 3.2×4.8 m), `props_b64.png` (cells 64×64 = 6.4×6.4 m), 8 columns; frames run left to right along the key's row (a longer loop continues on the next rows — the 60-frame campfire). `*_glow.png` uses the same layout, holds only the emissive pixels, blend additive. ~10 px/m, anchor = bottom center (the bottom row is the ground contact; outline 1 px), no shadow drawn. Palette: Единый стиль (37), every pixel quantized to it.

## Old key → new
| old key / mesh | new key | variants |
|---|---|---|
| campfire | campfire | campfire |
| torch | torch | torch |
| lantern | lantern | lantern |
| crystal | crystal | crystal |
| star_crystal | star_crystal | star_crystal |
| bush | bush | bush, bush_2, bush_3 |
| violets | violets | violets, violets_2 |
| rock | rock | rock, rock_2, rock_3 |
| ruin_pillar | ruin_pillar | ruin_pillar, ruin_pillar_2 |
| obelisk | obelisk | obelisk |
| pylon | pylon | pylon |
| glitch_shard | glitch_shard | glitch_shard |
| barrel | barrel | barrel, barrel_2 |
| crate | crate | crate, crate_2 |
| fence | fence | fence, fence_2 |
| signpost | signpost | signpost |
| mushroom | mushroom | mushroom, mushroom_2 |
| tombstone | tombstone | tombstone, tombstone_2, tombstone_3 |
| ore_node | ore_node | ore_node, ore_node_2 |
| mesh:hellfire lava cracks | lava_vent | lava_vent |
| mesh:hellfire flame cones | hell_flame | hell_flame |
| tree | tree | tree, tree_2, tree_3 |
| pome_tree | pome_tree | pome_tree, pome_tree_2 |
| dead_tree | dead_tree | dead_tree, dead_tree_2 |
| portal_arch | portal_arch | portal_arch |
| mesh:makePortal frame | portal_arch | portal_arch |
| portal_swirl | portal_swirl | portal_swirl |
| mesh:makePortal swirl | portal_swirl | portal_swirl |
| mesh:makePortal | portal | portal |
| well | well | well |
| mesh:hellfire obsidian spire | hell_spire | hell_spire, hell_spire_2 |
| mesh:hellfire ConeGeometry rocks | hell_crag | hell_crag, hell_crag_2 |
| mesh:hellfire wall Box + gold trim | hell_wall | hell_wall |
| mesh:arena.js column (crypt) | arena_column_crypt | arena_column_crypt |
| mesh:arena.js column (abyss) | arena_column_abyss | arena_column_abyss |
| mesh:arena.js column (mirror) | arena_column_mirror | arena_column_mirror |
| mesh:arena.js column (abode) | arena_column_abode | arena_column_abode |
| mesh:arena.js wall cylinder (crypt) | arena_wall_crypt | arena_wall_crypt |
| mesh:arena.js wall cylinder (abyss) | arena_wall_abyss | arena_wall_abyss |
| mesh:arena.js wall cylinder (mirror) | arena_wall_mirror | arena_wall_mirror |
| mesh:arena.js wall cylinder (abode) | arena_wall_abode | arena_wall_abode |
| mesh:arena.js sigil rings | arena_sigil | arena_sigil |
| mesh:runView.js Сердце Обители | heart_of_abode | heart_of_abode |

## All keys
| key | sheet | row | frames | fps | glow | height_m | kind |
|---|---|---|---|---|---|---|---|
| campfire | p32 | 43–50 (60 frames, 8 per row, wraps) | 60 | 30 | #ff8a2a | 2.6 | prop |
| torch | p32 | 1 | 6 | 10 | #ff9a3c | 3.4 | prop |
| lantern | p32 | 2 | 4 | 8 | #ffd27a | 4.6 | prop |
| crystal | p32 | 3 | 6 | 6 | #9be8ff | 3.2 | prop |
| star_crystal | p32 | 4 | 6 | 6 | #dcd3e6 | 3.2 | prop |
| bush | p32 | 5 | 4 | 4 | — | 1.8 | prop |
| bush_2 | p32 | 6 | 4 | 4 | — | 1.6 | prop |
| bush_3 | p32 | 7 | 4 | 4 | — | 2.0 | prop |
| violets | p32 | 8 | 1 | 0 | — | 1.2 | prop |
| violets_2 | p32 | 9 | 1 | 0 | — | 1.2 | prop |
| rock | p32 | 10 | 1 | 0 | — | 1.2 | prop |
| rock_2 | p32 | 11 | 1 | 0 | — | 1.5 | prop |
| rock_3 | p32 | 12 | 1 | 0 | — | 1.0 | prop |
| ruin_pillar | p32 | 13 | 1 | 0 | — | 4.2 | prop |
| ruin_pillar_2 | p32 | 14 | 1 | 0 | — | 3.0 | prop |
| obelisk | p32 | 15 | 4 | 4 | #c46ad8 | 4.6 | prop |
| pylon | p32 | 16 | 4 | 6 | #b5cf7a | 4.4 | prop |
| glitch_shard | p32 | 17 | 4 | 8 | #c46ad8 | 3.8 | prop |
| barrel | p32 | 18 | 1 | 0 | — | 2.2 | prop |
| barrel_2 | p32 | 19 | 1 | 0 | — | 1.8 | prop |
| crate | p32 | 20 | 1 | 0 | — | 1.9 | prop |
| crate_2 | p32 | 21 | 1 | 0 | — | 2.7 | prop |
| fence | p32 | 22 | 1 | 0 | — | 1.6 | prop |
| fence_2 | p32 | 23 | 1 | 0 | — | 1.6 | prop |
| signpost | p32 | 24 | 1 | 0 | — | 3.6 | prop |
| mushroom | p32 | 25 | 4 | 4 | #c46ad8 | 1.3 | prop |
| mushroom_2 | p32 | 26 | 1 | 0 | — | 1.3 | prop |
| tombstone | p32 | 27 | 1 | 0 | — | 2.0 | prop |
| tombstone_2 | p32 | 28 | 1 | 0 | — | 2.1 | prop |
| tombstone_3 | p32 | 29 | 1 | 0 | — | 1.4 | prop |
| ore_node | p32 | 30 | 5 | 6 | #ffe08a | 1.0 | prop |
| ore_node_2 | p32 | 31 | 5 | 6 | #c4e4f0 | 1.0 | prop |
| totem | p32 | 32 | 4 | 6 | #e3b04b | 4.0 | camp |
| bones | p32 | 33 | 1 | 0 | — | 0.8 | camp |
| bones_2 | p32 | 34 | 1 | 0 | — | 1.6 | camp |
| skull_pile | p32 | 35 | 1 | 0 | — | 1.8 | camp |
| cage | p32 | 36 | 1 | 0 | — | 3.2 | camp |
| banner | p32 | 37 | 4 | 6 | — | 4.4 | camp |
| banner_2 | p32 | 38 | 4 | 6 | — | 4.4 | camp |
| spikes | p32 | 39 | 1 | 0 | — | 2.8 | camp |
| lava_vent | p32 | 40 | 6 | 8 | #d9573a | 1.2 | hellfire |
| hell_flame | p32 | 41 | 8 | 12 | #d9573a | 3.8 | hellfire |
| brazier | p32 | 42 | 8 | 12 | #ff8a2a | 3.8 | hellfire |
| tree | b64 | 0 | 4 | 5 | — | 4.6 | prop |
| tree_2 | b64 | 1 | 4 | 5 | — | 4.2 | prop |
| tree_3 | b64 | 2 | 4 | 4 | — | 5.4 | prop |
| pome_tree | b64 | 3 | 4 | 5 | — | 4.6 | prop |
| pome_tree_2 | b64 | 4 | 4 | 5 | — | 4.6 | prop |
| dead_tree | b64 | 5 | 1 | 0 | — | 5.4 | prop |
| dead_tree_2 | b64 | 6 | 1 | 0 | — | 5.4 | prop |
| portal_arch | b64 | 7 | 4 | 4 | #c46ad8 | 5.0 | prop |
| portal_swirl | b64 | 8 | 8 | 10 | #c46ad8 | 4.2 | prop |
| portal | b64 | 9 | 8 | 10 | #c46ad8 | 5.0 | prop |
| well | b64 | 10 | 4 | 4 | — | 4.4 | prop |
| tent | b64 | 11 | 1 | 0 | — | 3.8 | camp |
| tent_2 | b64 | 12 | 1 | 0 | — | 3.2 | camp |
| hell_spire | b64 | 13 | 6 | 6 | #d9573a | 5.6 | hellfire |
| hell_spire_2 | b64 | 14 | 6 | 6 | #d9573a | 4.4 | hellfire |
| hell_crag | b64 | 15 | 6 | 6 | #d9573a | 3.2 | hellfire |
| hell_crag_2 | b64 | 16 | 6 | 6 | #d9573a | 3.8 | hellfire |
| hell_wall | b64 | 17 | 6 | 6 | #d9573a | 4.4 | hellfire |
| arena_column_crypt | b64 | 18 | 1 | 0 | — | 6.2 | arena |
| arena_column_abyss | b64 | 19 | 5 | 6 | #c46ad8 | 6.2 | arena |
| arena_column_mirror | b64 | 20 | 5 | 6 | #7fb0d0 | 6.2 | arena |
| arena_column_abode | b64 | 21 | 5 | 6 | #e3b04b | 6.2 | arena |
| arena_wall_crypt | b64 | 22 | 1 | 0 | — | 3.4 | arena |
| arena_wall_abyss | b64 | 23 | 4 | 4 | #c46ad8 | 3.4 | arena |
| arena_wall_mirror | b64 | 24 | 4 | 4 | #7fb0d0 | 3.4 | arena |
| arena_wall_abode | b64 | 25 | 4 | 4 | #e3b04b | 3.4 | arena |
| arena_sigil | b64 | 26 | 8 | 8 | #dcd3e6 | None | ground_decal |
| heart_of_abode | b64 | 27 | 6 | 6 | #d9573a | 4.4 | arena |

## Notes for the code
- `portal_arch` + `portal_swirl` are drawn on the same 64×64 grid and anchor: the swirl goes behind the arch, additive. `portal` is the already composited version (8 frames), when one sprite is more convenient.
- `arena_sigil` is a ground decal (anchor 0.5/0.5), lay it flat; it is drawn in neutral light tones (dcd3e6/a99cb8), so it can be tinted with code for the run arena.
- `hell_wall`, `arena_wall_*`, `fence*`, `spikes` tile horizontally (64 / 32 px).
- Vegetation (tree*, pome_tree*, bush*) has 4 sway frames at 4–5 fps: offset the phase with code per instance.
- Camp props (kind=camp): tent, tent_2, totem, bones, bones_2, skull_pile, cage, banner, banner_2, spikes, plus campfire.
- Hellfire: hell_spire(2), hell_crag(2), hell_wall, lava_vent, hell_flame (replaces the cones), brazier.
- Arenas: arena_column_{crypt,abyss,mirror,abode}, arena_wall_{…}, arena_sigil, heart_of_abode (replaces the octahedron in runView.js).
- The altar is unchanged: the separate altar.png / altar_flash.png. Tulips are unchanged.
- Generator: `timeout 600 nice -n 19 python3 gen_props_v2.py` (about 4 s); `test` renders only 6 keys.


## 2026-10-17: campfire 60 frames
New seamless 60-frame campfire from Художник (`anim60/campfire_60*.png`, 10×6 grid) repacked into `props_p32.png` / `props_p32_glow.png` rows 43–50 (frame k → row 43 + k//8, col k%8); sheet grew 43 → 51 rows (256×2448). Old 8-frame campfire cells in row 0 are kept but unused. Cell 32×48, anchor, size_m and collider (SOLID 0.45) unchanged.
