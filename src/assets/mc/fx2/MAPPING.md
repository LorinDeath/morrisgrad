# MAPPING: старые ключи → projectiles_v2 (fx_atlas.json)
Все анимации: keys[key].anims[anim] = {sheet,row,col,frames,x,y,w,h,fps,loop}. Листы: s32 32×32, s64 64×64, w64 64×32, t32 32×64, a96 96×96, r128 128×128, c128 128×64.

## Атлас A (projectiles.json, мир)
| старый | новый |
|---|---|
| fireball | fireball (s64, fly 4 + hit 6) |
| war_axe | war_axe |
| fire_spark | fire_spark |
| moon_orb | moon_orb |
| split_shard | split_shard (+ split_shard_frag для разлёта) |
| thorn_bow | thorn_bow |
| spear | spear |
| pierce (alias spear) | pierce (w64 64×32, fly 4 + hit 6) |
| daggers / trick_strike | daggers |
| sun_beam / sun_beam_segment / sun_beam_end | sun_beam_start / sun_beam_mid (тайл) / sun_beam_end, вспышка = sun_beam.hit |
| ice_fan | ice_fan (снаряд) + ice_fan_cone (c128) |
| chain_bolt | chain_bolt + chain_bolt_strike (t32, rain) + chain_zap_mid (цепь, тайл) |
| plague_flask → plague_puddle | plague_flask → plague_puddle (s64 loop+fade) + plague_cloud |
| glyph_mine | glyph_mine (s64 loop 4 + hit 6) |
| orbit_skulls | orbit_skulls (череп) + orbit_skulls_aura (a96) |
| meteor | meteor (fall t32 + hit s64) |
| spear_rain | spear_rain (fall t32 + hit s64) |
| dew_splash | dew_splash + dew_splash_cone |
| auto_staff / auto_bow / auto_daggers / auto_claws | те же ключи |

## Атлас B (proj_atlas.json, забеги) — удаляется, всё берётся из v2
| старый | новый |
|---|---|
| soul_spark | soul_spark |
| war_axe, spear, daggers, fire_spark, orbit_skulls, chain_bolt, ice_fan | те же ключи, что в мире |
| arrow (thorn_bow) | thorn_bow |
| ricochet (moon_orb) | moon_orb |
| mine (glyph_mine) | glyph_mine |
| split (split_shard) | split_shard |
| poison_glob (plague_flask) | plague_flask |
| fly_blade | fly_blade |
| staff_bolt | auto_staff |
| ab_backstab | backstab |
| ab_pierce | pierce |
| ab_trick | daggers |
| ab_fireball | fireball |
| enemy | enemy_acid (по умолчанию) или семейство enemy_* по стихии моба |
| enemy_boss | enemy_boss (s64) |
| beam | sun_beam_start + sun_beam_mid×N + sun_beam_end (тайлить!) |
| cloud | plague_cloud (яд) / smoke_bomb (дым) |
| hit, hit_fire, hit_ice, hit_arcane, hit_acid, hit_poison, hit_bleed | те же ключи (8 кадров) + новые hit_shadow, hit_lightning, hit_holy, hit_white (тинт) |
| status (burn/poison/bleed/freeze) | status_burn / status_poison / status_bleed / status_freeze (+ status_slow, status_stun, status_curse), 4 кадра loop |

## Код-эффекты (C/D) → спрайты
| было | новый |
|---|---|
| телеграф линии (полоса) | tele_line_tile (тайл) + tele_line_end |
| телеграф круга (заливка+кольцо) | tele_circle_fill + tele_circle_ring |
| boom-кольцо | boom (r128, 6 кадров) |
| кольца цель/отслеж./проклятый/босс/вожак/элита/мешок | mark_target / mark_tracked / mark_cursed / mark_boss / mark_leader / mark_elite / mark_loot |
| забег: кольцо выбора / магнит | mark_loot (или mark_target) / mark_magnet |
| fx_shockwave.png | level_shockwave |
| fx_shield.png | shield_bubble |
| (нет) конус-телеграф | tele_cone |

## Навыки без визуала → новые
| навык | новый |
|---|---|
| backstab | shadow_step_trail + backstab |
| shadow_step | shadow_step_trail |
| fly_blade_dash / fly_blades | fly_blade_dash_trail / fly_blade |
| leap_strike | leap_strike (trail w64 + land r128) |
| shield_wall | shield_wall (a96) |
| whirlwind | whirlwind (a96) |
| smoke_bomb | smoke_bomb (s64 loop+fade) |
| warden_slam | warden_slam (fall t32 + hit r128) |
| gear_spin | gear_spin_cone |
| frost_nova | frost_nova (r128) |
| навыки монстров без формы (nova) | nova_burst (тинт) |
| любой рывок без своего стиля | dash_trail (тинт) |

## Семейства снарядов монстров (вместо 2)
enemy_acid, enemy_bone, enemy_fire, enemy_frost, enemy_shadow, enemy_arcane, enemy_blood, enemy_rock, enemy_lightning, enemy_web, enemy_water + enemy_boss. Раздать 106 монстрам по стихии/типу — на стороне кода.
