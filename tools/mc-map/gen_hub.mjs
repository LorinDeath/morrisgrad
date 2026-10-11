// Ручная сборка карты Поляны перевоплощения (мир hellfire) вместо удалённого редактора карт.
// Запуск: node tools/mc-map/gen_hub.mjs > server/maps/hellfireMap.ts
// Клетка 32 px (0..37). Сервер не проверяет тайлы (только границы/скорость), поэтому стены ставим
// только там, где нет спавнов мобов, NPC, узлов ресурсов и порталов — проверка ниже падает при конфликте.
const CELL = 32;
const tiles = new Map();
const put = (x, y, tileId, layer) => tiles.set(`${x}_${y}_${layer}`, { x, y, tileId, layer });
const floor = (x, y, id = 'floor_star') => { if (!tiles.has(`${x}_${y}_0`)) put(x, y, id, 0); };
const solid = (x, y, id) => { put(x, y, id, 1); put(x, y, 'collision_box', 2); };

// Алтарь (565,600) ≈ клетка (17.6,18.75): кольцо платформ вокруг ар-деко «ковра»
const AX = 17.65, AY = 18.75;
for (let x = 10; x <= 26; x++) for (let y = 11; y <= 27; y++) {
  const d = Math.hypot(x + 0.5 - AX, y + 0.5 - AY);
  if (d > 5.4 && d < 6.4) floor(x, y, (x + y) % 2 ? 'platform_star' : 'floor_star');
}
// четыре колонны-руны по диагоналям площади
[[13, 14], [21, 14], [13, 22], [21, 22]].forEach(([x, y]) => solid(x, y, 'column_rune'));

// Тропы от площади к порталам (только пол)
const path = (x0, y0, x1, y1, id = 'floor_void') => {
  const n = Math.ceil(Math.hypot(x1 - x0, y1 - y0));
  for (let i = 0; i <= n; i++) { const t = i / n; floor(Math.round(x0 + (x1 - x0) * t), Math.round(y0 + (y1 - y0) * t), id); }
};
path(11, 18, 8, 18);            // запад — разлом в Аринар (240,600)
path(22, 14, 27, 10);           // северо-восток — Склеп (900,300)
path(22, 23, 26, 26);           // юго-восток — арена дуэлей (860,840)
path(13, 23, 10, 27);           // юго-запад — Испытание (300,900)
path(17, 25, 17, 30);           // юг — Разлом мини-игр (565,1000)
path(17, 12, 17, 6);            // север — край Поляны, где роится Мошкара

// Разлом в Аринар: две колонны
solid(6, 15, 'column_rune'); solid(6, 21, 'column_rune');
// Склеп: полукольцо руин с проходом на юго-запад
[[26, 7], [27, 6], [28, 6], [29, 6], [30, 7], [31, 8]].forEach(([x, y]) => solid(x, y, 'wall_ruin'));
// Мастерская Петра (420,760): задняя стенка и платформа
for (let x = 11; x <= 15; x++) solid(x, 26 + (x === 11 || x === 15 ? -1 : 0), 'wall_ruin');
for (let x = 12; x <= 14; x++) for (let y = 23; y <= 24; y++) floor(x, y, 'platform_star');
// Арена дуэлей Кьют (860,840): колонны по углам
[[24, 30], [30, 24], [30, 30]].forEach(([x, y]) => solid(x, y, 'column_rune'));
for (let x = 25; x <= 29; x++) for (let y = 25; y <= 29; y++) if ((x + y) % 2 === 0) floor(x, y, 'platform_star');
// Северный край Поляны: обломки стены с проходами
for (let x = 8; x <= 29; x++) if (x % 5 !== 0) solid(x, 1, 'wall_ruin');
// кристаллы у Испытания
[[6, 30], [11, 31]].forEach(([x, y]) => floor(x, y, 'floor_crystal'));

// ---- проверка: ничего важного не заперто стеной ----
const POI = [
  ['altar', 565, 600], ['portal_arinar', 240, 600], ['portal_crypt', 900, 300], ['portal_duel', 860, 840],
  ['portal_trial', 300, 900], ['portal_arcade', 565, 1000], ['npc_petr', 420, 760], ['npc_kyut', 780, 760],
  ['spawn_default', 660, 640], ['fly1', 520, 150], ['fly2', 600, 120], ['fly3', 680, 160], ['fly4', 760, 130],
];
for (const [n, px, py] of POI) {
  for (const t of tiles.values()) {
    if (t.layer !== 2) continue;
    const cx = t.x * CELL + 16, cy = t.y * CELL + 16;
    if (Math.abs(px - cx) < 16 + 24 && Math.abs(py - cy) < 16 + 24) throw new Error(`стена (${t.x},${t.y}) слишком близко к ${n}`);
  }
}
const list = [...tiles.values()].sort((a, b) => a.layer - b.layer || a.y - b.y || a.x - b.x);
console.log(`// Поляна перевоплощения (мир hellfire): собрано вручную скриптом tools/mc-map/gen_hub.mjs.
// Редактор карт удалён. Сервер не проверяет тайлы — только границы мира и скорость.
// Тайлов: ${list.length}

export interface TileData {
  x: number;
  y: number;
  tileId: string;
  layer: number;
}

export const HELLFIRE_MAP_TILES: TileData[] = [
${list.map((t) => `  { x: ${t.x}, y: ${t.y}, tileId: "${t.tileId}", layer: ${t.layer} },`).join('\n')}
];`);
