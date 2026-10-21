# Альказак (dome-city) — HANDOFF

Local only: no push, deploy or remote writes. Run playtests with `nice` and kill only your own PIDs.
Branch `dome-city`, worktree `/workspace/mg-city`.
Do not touch `/workspace/mg-ui` (branch ui-cursed-rework, 10 commits); it is merged later.

## Done (playtests green)
- **Dome R=40 (1280 px).** Shell 0.9 outside / 0.02 inside, with a smooth real-time fade (in ≈0.8 s, out ≈0.7 s). Rim with glow, plus repel.
- **Server zone.** Zero damage inside: mob hits go through `zoneHit`, which returns early and increments `cityBlocked`. Mobs are pushed out, and a mob whose target is inside resets.
- **Killers stay out** (PK, PvP, or 5 mobs in 10 min). The client gets the deny banner with a countdown via `city_knock`.
- **Kills from under the dome** are not counted.
- **City from the map.**
  - Empty cells are filled with blackened ground plus blob-47; the playtest reports 0 empty cells.
  - The ice edge sits beyond R and the black fringe is clipped.
  - Layout decor inside the city has been removed, so the signpost no longer covers the rose.
- **Interiors.** 11 buildings, each its own instance (house 9×8, tavern 12×10, tent 8×7), with doors and exits.
- **Other.**
  - NPC slots: 24.
  - The rose renders at (24624, 3248), stage 6, with no curse.
  - PK button (7 s / 30 s) and red names.
  - Kill stats (C window).
  - Position restore, including inside a house.
  - Crystal moved (city-test).

## Tests
- `server/meta/city-test.ts`: 218 ok.
- `dayNight-test.ts`: 34 ok.
- `tools/playtest/city-dome.cjs`: 24/0.
- `city-logic.cjs`: 28/0.
- `city-hero.cjs`: overview shots.
- `day-night.cjs`: stages × places plus a GIF.

## How to run
- Server: `wrangler dev --local` on port 8883; PID in `/workspace/mc-harness-city/wrangler.pid`.
- Client: Vite on 5297.
- Bundle the unit tests: `node_modules/.bin/esbuild X.ts --bundle --platform=node --format=esm --outfile=/tmp/x.mjs --loader:.json=json && node /tmp/x.mjs`
- Run a playtest: `NODE_PATH=/workspace/mc-ui-tools/node_modules setsid nohup nice node tools/playtest/<x>.cjs > log &`
- Run playtests ONE AT A TIME. In parallel, swiftshader drops to about 2 fps and the tests fail spuriously.
- Do not edit src/ or server/ while a playtest runs, because the hot reload breaks the run.
- Before screenshot passes, run `node tools/sync-city-art/sync.mjs` (new Историк drops in /workspace/city_dome, alkazak_map, tileset_dark_medieval).
- Output: `/workspace/morrisgrad-round3/dome-city/{dome,logic,hero,daynight}`

## Remaining
- Day/night: review the screenshots and the GIF, and tune the look.
- Polish: NPC visuals at the slots, and the city's whitish tint in daylight.
- Final dome previews and environment coordinates from Историк, when they arrive.
