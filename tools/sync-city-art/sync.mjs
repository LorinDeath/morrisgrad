// Синхронизация арта города Альказак от Историка → src/assets/mc/city/ (купол + тайлсет «очернённое средневековье» + пропсы + фонтан).
// Запуск: node tools/sync-city-art/sync.mjs [--src /workspace/city_dome]
// Код читает ВСЁ из json (индексы тайлов, blob47, раскладка листов, двери, коллайдеры, кадры/fps) — новая поставка арта = только пересинк.
import { readFileSync, writeFileSync, copyFileSync, mkdirSync, existsSync, statSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const ai = process.argv.indexOf('--src'), SRC = ai > 0 ? process.argv[ai + 1] : '/workspace/city_dome';
const OUT = join(ROOT, 'src/assets/mc/city'); mkdirSync(OUT, { recursive: true });
const TS = join(SRC, 'tileset_dark_medieval');
const log = [];
const cp = (from, name = from.split('/').pop()) => { if (!existsSync(from)) { log.push('нет ' + from); return false; } copyFileSync(from, join(OUT, name)); log.push(`${name} ${statSync(from).size} B`); return true; };
// купол: листы — по city_dome.json (sheets[*].image / glow), без превью и архивов
const domeJ = JSON.parse(readFileSync(join(SRC, 'city_dome.json'), 'utf8'));
const files = new Set();
for (const s of Object.values(domeJ.sheets || {})) { if (s.image) files.add(s.image); if (s.glow) files.add(s.glow); }
if (domeJ.fill?.image) files.add(domeJ.fill.image);
for (const f of readdirSync(SRC)) if (f.endsWith('.png')) files.add(f); // + всё верхнего уровня (маска заливки и т. п.)
for (const f of files) cp(join(SRC, f));
// облегчённый json купола: смещения блоков (м) и листы; остальное (cell_px, screen_m) клиенту не нужно
const r3 = (v) => v.map((x) => Math.round(x * 1000) / 1000);
const dome = { v: domeJ.version, src: join(SRC, 'city_dome.json'), dome: domeJ.dome, cam: domeJ.camera_vectors, world: domeJ.world,
  sheets: Object.fromEntries(Object.entries(domeJ.sheets || {}).map(([k, v]) => [k, Object.fromEntries(Object.entries(v).filter(([kk]) => !['tile_index', 'note'].includes(kk)))])),
  b: (domeJ.blocks || []).map((b, i) => [b.local ?? i, ...r3(b.world_offset_m), b.sheet || 'rim_0', b.i ?? i]),
  bb: (domeJ.back_blocks || []).map((b, i) => [b.i ?? i, ...r3(b.world_offset_m)]),
  fill: domeJ.fill || null, extra: Object.fromEntries(Object.entries(domeJ).filter(([k]) => !['version', 'name', 'palette', 'world', 'dome', 'sheets', 'camera_vectors', 'blocks', 'back_blocks', 'fill'].includes(k))) };
writeFileSync(join(OUT, 'city_dome.json'), JSON.stringify(dome));
// тайлсет и пропсы: картинки — по ссылкам из json
if (existsSync(TS)) {
  const tj = JSON.parse(readFileSync(join(TS, 'tiles_dark.json'), 'utf8'));
  cp(join(TS, 'tiles_dark.png')); writeFileSync(join(OUT, 'tiles_dark.json'), JSON.stringify(tj));
  const pj = JSON.parse(readFileSync(join(TS, 'props_dark_atlas.json'), 'utf8'));
  for (const f of readdirSync(TS)) if (f.endsWith('.png')) cp(join(TS, f)); // листы, анимации (фонтан) — всё верхнего уровня
  writeFileSync(join(OUT, 'props_dark_atlas.json'), JSON.stringify(pj));
  for (const f of readdirSync(TS)) if (f.endsWith('.json') && !['tiles_dark.json', 'props_dark_atlas.json'].includes(f)) { writeFileSync(join(OUT, f), JSON.stringify(JSON.parse(readFileSync(join(TS, f), 'utf8')))); log.push(f); } // interiors_dark.json и др.
}
writeFileSync(join(OUT, 'SYNC.txt'), `синхронизировано ${new Date().toISOString()} из ${SRC}\n` + log.join('\n') + '\n');
console.log(log.join('\n'));
