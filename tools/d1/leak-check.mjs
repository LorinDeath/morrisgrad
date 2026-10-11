// Проверка утечки: клиентский бандл не должен содержать имён/описаний предметов (их присылает сервер только для открытых).
// Запуск: node tools/d1/leak-check.mjs <путь к бандлу клиента> — код выхода 1 при утечке.
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
import { readFileSync } from 'node:fs';
import { buildSync } from 'esbuild';
buildSync({ entryPoints: [join(root, 'server/meta/defs.ts')], bundle: true, format: 'esm', platform: 'node', outfile: '/tmp/defs_b.mjs', logLevel: 'error' });
const D = await import('/tmp/defs_b.mjs?' + Date.now());
const b = readFileSync(process.argv[2], 'utf8').replace(/\\u([0-9a-fA-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
const names = D.ITEMS.map((i) => i.name);
const leaked = names.filter((n) => n.length > 5 && b.includes(`"${n}"`));
const lore = D.ITEMS.filter((i) => i.lore && i.lore.length > 20 && b.includes(i.lore.slice(0, 30)));
console.log(`items ${names.length}, names leaked: ${leaked.length}`, leaked.slice(0, 8), `lore leaked: ${lore.length}`);
process.exit(leaked.length || lore.length ? 1 : 0);
