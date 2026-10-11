// Генератор из ЕДИНОГО источника истины (server/meta/bestiary.ts → content.ts → defs.ts):
//  1) server/meta/generated/public.ts — клиентобезопасные данные мобов (без снаряжения и шансов дропа),
//     навыки монстров и материалы. Клиент НЕ импортирует defs.ts/content.ts/bestiary.ts — так в бандл
//     не попадают описания предметов (их сервер присылает только для открытых в Библиотеке).
//  2) server/migrations/0002_item_library_seed.sql — сид таблицы item_library (D1) + хеш версии библиотеки.
// Запуск: node tools/d1/gen.mjs         (перезаписывает файлы)
//         node tools/d1/gen.mjs --check (код выхода 1, если файлы устарели — для тестов/CI)
import { buildSync } from "esbuild";
import { writeFileSync, readFileSync, mkdtempSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const dir = mkdtempSync(join(tmpdir(), "mcgen-"));
const entry = join(dir, "entry.ts");
writeFileSync(entry, `export { CONTENT } from ${JSON.stringify(join(root, "server/meta/content.ts"))};
export { ITEMS, MONSTER_LOOT, LOOKS, ZONE_MOBS, RECIPES } from ${JSON.stringify(join(root, "server/meta/defs.ts"))};
export { BESTIARY } from ${JSON.stringify(join(root, "server/meta/bestiary.ts"))};
export { libraryRows, libraryHash, seedTables, SEED_COLS, SEED_PK } from ${JSON.stringify(join(root, "server/meta/library.ts"))};`);
const out = join(dir, "bundle.mjs");
buildSync({ entryPoints: [entry], bundle: true, format: "esm", platform: "node", outfile: out, logLevel: "error" });
const M = await import(pathToFileURL(out).href);

// ---------- 1) public.ts ----------
const mobs = Object.entries(M.ZONE_MOBS).map(([id, z]) => {
  const b = M.BESTIARY.find((x) => x.id === id);
  return [id, { name: z.name, lvl: z.lvl, tier: z.tier, role: z.role, size: z.size, radius: z.radius, color: z.color, boss: !!z.boss, rare: !!z.rare, huge: !!z.huge,
    hp: z.hp, dmg: z.dmg, armor: z.armor, speed: z.speed, xp: z.xp,
    desc: b?.desc || "", lore: b?.lore || "", where: b?.where || [], art: b?.art || null,
    mats: (b?.mats || []).map((m) => m[0]), hasLook: !!b?.look, lookName: b?.look?.name || null, lookBonus: b?.look?.bonus || null }];
});
const pub = `// СГЕНЕРИРОВАНО tools/d1/gen.mjs из server/meta/bestiary.ts — не править руками.
// Клиентобезопасно: здесь нет снаряжения мобов и шансов дропа (их сервер присылает только для открытого).
export interface MobPublic { name: string; lvl: number; tier: number; role: string; size: string; radius: number; color: string; boss: boolean; rare: boolean; huge: boolean;
  hp: number; dmg: number; armor: number; speed: number; xp: number; desc: string; lore: string; where: string[]; art: { fam: string; pal: string; acc?: string } | null;
  mats: string[]; hasLook: boolean; lookName: string | null; lookBonus: string | null }
// порядок ключей = порядок ZONE_MOBS на сервере (индекс типа моба в zone_state)
export const MOBS_PUBLIC: Record<string, MobPublic> = ${JSON.stringify(Object.fromEntries(mobs), null, 0)};
export const MONSTER_ABILITIES: any[] = ${JSON.stringify(M.CONTENT.abilities)};
export const MOB_RESOURCES: Record<string, { name: string; icon: string; color: string }> = ${JSON.stringify(M.CONTENT.resources)};
`;

// ---------- 2) SQL seed ----------
const q = (v) => (v === null || v === undefined ? "NULL" : typeof v === "number" ? String(v) : "'" + String(v).replace(/'/g, "''") + "'");
const hash = M.libraryHash();
const rows = M.libraryRows();
let sql = `-- СГЕНЕРИРОВАНО tools/d1/gen.mjs из server/meta/defs.ts (единый источник истины). Не править руками.
-- Справочники: rarities, mobs, items (${rows.length} предметов), mob_drops. Хеш версии: ${hash}
-- Сервер при старте сравнивает library_meta.items_hash с хешем кода и при расхождении досеивает сам (UPSERT).
`;
for (const [table, trows] of M.seedTables()) {
  const cols = M.SEED_COLS[table];
  for (let i = 0; i < trows.length; i += 40) {
    sql += `INSERT INTO ${table} (${cols.join(", ")}) VALUES\n` + trows.slice(i, i + 40).map((r) => "  (" + cols.map((c) => q(r[c])).join(", ") + ")").join(",\n") +
      `\nON CONFLICT(${M.SEED_PK[table]}) DO UPDATE SET ${cols.filter((c) => !M.SEED_PK[table].split(", ").includes(c)).map((c) => `${c} = excluded.${c}`).join(", ")};\n`;
  }
}
sql += `INSERT INTO library_meta (key, value) VALUES ('items_hash', ${q(hash)}), ('items_count', '${rows.length}') ON CONFLICT(key) DO UPDATE SET value = excluded.value;\n`;

const files = [[join(root, "server/meta/generated/public.ts"), pub], [join(root, "server/migrations/0002_item_library_seed.sql"), sql]];
if (process.argv.includes("--check")) {
  const stale = files.filter(([p, c]) => !existsSync(p) || readFileSync(p, "utf8") !== c).map(([p]) => p.replace(root + "/", ""));
  if (stale.length) { console.error("STALE generated files (run node tools/d1/gen.mjs):", stale.join(", ")); process.exit(1); }
  console.log(`generated files up to date (${rows.length} items, hash ${hash})`);
} else {
  for (const [p, c] of files) writeFileSync(p, c);
  console.log(`wrote public.ts (${mobs.length} mobs) and 0002 seed (${rows.length} items, hash ${hash})`);
}
