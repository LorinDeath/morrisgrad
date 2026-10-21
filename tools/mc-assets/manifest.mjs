// Сборка манифеста ресурсов «Проклятых»: после astro build обходит граф модулей игры (vite manifest клиента) от входа
// src/pages/MorrisCurse/index.astro и пишет dist/mc-assets/manifest.json: путь → sha256(16) + размер + группа.
// Музыка (mp3, ~860 МБ) — не в манифесте: стримится по Range с HTTP-кэшем (immutable), в Cache Storage её не кладём.
import { readFileSync, writeFileSync, mkdirSync, statSync, existsSync, readdirSync, rmSync } from 'fs';
import { createHash } from 'crypto';
import { join, resolve } from 'path';
export const GROUP_RULES = [ // [регэксп исходного пути, группа] — первая подходящая
  [/\.(mp3|ogg|wav|m4a)$/i, null],
  [/assets\/mc\/props3\//, 'props3'],
  [/assets\/mc\/bestiary32\//, 'mobs32'],   // мобы 32 (mobs32): заранее — только если у устройства включены новые мобы (ПК по умолчанию), иначе по требованию
  [/assets\/mc\/props2\//, 'props2'],
  [/assets\/mc\/tiles32_|tilesets_32/, 'tiles32'],
  [/assets\/mc\/tiles_/, 'tiles16'],
  [/assets\/mc\/(worldmap_|wm_)/, 'map'],
  [/src\/scripts\/mcAuthGate/, 'auth'],      // оверлей входа гостя (+ русский Clerk): лениво, только гостю — вошедший его не качает (guest-login)
  [/\.(js|mjs|css)$/i, 'core'],
  [/^public\/js\//, 'core'],
  [/^public\/mc-vn\//, 'vn'],
  [/assets\/mc\/(ui|icons)|statIcons|itemCards|ui\//, 'ui'],
  [/\.(png|webp|jpg|jpeg|gif|json|svg)$/i, 'sprites'],
];
export function groupOf(src) { for (const [re, g] of GROUP_RULES) if (re.test(src)) return g; return 'core'; }
const sha = (buf) => createHash('sha256').update(buf).digest('hex').slice(0, 16);
/** граф vite manifest от входов: чанки по imports + dynamicImports, их css, и ассеты, на которые ссылается текст чанка
 *  (vite не связывает импортированные из JS картинки с чанком в manifest — ищем "/_astro/…" в собранном коде) */
export function reachable(vm, entries, readText) {
  const seen = new Set(), out = new Map(); // file → src
  const visit = (key) => { if (!key || seen.has(key)) return; seen.add(key); const c = vm[key]; if (!c) return;
    if (c.file) out.set(c.file, c.src || key); for (const f of c.css || []) out.set(f, key + ':css'); for (const f of c.assets || []) if (!out.has(f)) out.set(f, null);
    for (const i of [...(c.imports || []), ...(c.dynamicImports || [])]) visit(i); };
  for (const e of entries) visit(e);
  for (const f of [...out.keys()]) if (/\.(js|css)$/.test(f)) for (const m of (readText(f) || '').matchAll(/_astro\/[^"'`)?#\n]+?\.(?:png|webp|jpe?g|gif|svg|json|css|js|mp3|ogg|wav|woff2?|otf|ttf)(?=["'`)?#])/gi)) if (!out.has(m[0])) out.set(m[0], null);
  return out;
}
/** исходники по хешу содержимого: собранный ассет vite = байт-в-байт исходник → знаем его путь и группу */
function srcIndex(root) { const ix = new Map(); if (!root || !existsSync(root)) return ix; for (const f of walk(root)) if (/\.(png|webp|jpe?g|gif|svg|json)$/i.test(f)) ix.set(sha(readFileSync(join(root, f))), 'src/assets/' + f); return ix; }
export function buildManifest({ dist, viteManifest, entries, publicFiles = [], srcRoot = null }) {
  const vm = JSON.parse(readFileSync(viteManifest, 'utf8'));
  const files = [], bySha = srcIndex(srcRoot);
  for (const [file, src0] of reachable(vm, entries, (f) => (existsSync(join(dist, f)) ? readFileSync(join(dist, f), 'utf8') : ''))) {
    const abs = join(dist, file); if (!existsSync(abs)) continue;
    const buf = readFileSync(abs), src = src0 || bySha.get(sha(buf)) || file, g = groupOf(src); if (!g) continue;
    files.push({ p: '/' + file, h: sha(buf), s: buf.length, g, src });
  }
  for (const rel of publicFiles) { const abs = join(dist, rel); if (!existsSync(abs)) continue; const buf = readFileSync(abs); files.push({ p: '/' + rel, h: sha(buf), s: buf.length, g: groupOf('public/' + rel), src: 'public/' + rel }); }
  files.sort((a, b) => a.p.localeCompare(b.p));
  const version = sha(Buffer.from(files.map((f) => f.p + f.h).join('\n')));
  const groups = {}; for (const f of files) { const G = (groups[f.g] ||= { files: 0, bytes: 0 }); G.files++; G.bytes += f.s; }
  // версия сервис-воркера: страница сравнивает её с работающим воркером и при расхождении обновляет его сразу (на экране загрузки)
  let sw = 0; try { sw = +(readFileSync(join(dist, 'mc-sw.js'), 'utf8').match(/SW_VER\s*=\s*(\d+)/) || [])[1] || 0; } catch (_) {}
  return { v: 1, version, built: new Date().toISOString(), sw, flags: { cache: true }, groups, files };
}
const walk = (d, base = d) => readdirSync(d, { withFileTypes: true }).flatMap((x) => x.isDirectory() ? walk(join(d, x.name), base) : [join(d, x.name).slice(base.length + 1)]);
/** Astro-интеграция: vite manifest у клиентской сборки + манифест игры после сборки */
let ROOT = null;
export default function mcAssets() {
  return { name: 'mc-assets', hooks: {
    'astro:config:setup': ({ updateConfig }) => { // Astro 7 (окружения vite): manifest только у клиентского окружения, рядом с dist/client (dist/client/mc-vite-manifest.json; .vite Astro удаляет) — после сборки манифеста игры файл стирается, наружу не выкладывается
      updateConfig({ vite: { plugins: [{ name: 'mc-assets:client-manifest', configEnvironment: (name) => (name === 'client' ? { build: { manifest: 'mc-vite-manifest.json' } } : undefined) }] } }); },
    'astro:config:done': ({ config }) => { ROOT = resolve(config.root.pathname); },
    // Astro 5: отдельный вызов на клиентскую сборку (target client); Astro 7: один вызов (target server) с окружениями vite — manifest клиенту
    'astro:build:setup': ({ vite, target, updateConfig }) => {
      if (target === 'client') { vite.build = vite.build || {}; vite.build.manifest = true; }
    },
    'astro:build:done': ({ dir, logger }) => {
      // dir — клиентская сборка: Astro 5 — dist/, Astro 7 + @astrojs/cloudflare 14 — dist/client/
      const dist = resolve(dir.pathname), vmf = [join(dist, 'mc-vite-manifest.json'), join(dist, '.vite/manifest.json'), join(dist, 'manifest.json')].find(existsSync);
      if (!vmf) { logger.warn('mc-assets: нет vite manifest — манифест игры не создан'); return; }
      const vm = JSON.parse(readFileSync(vmf, 'utf8')), entries = Object.keys(vm).filter((k) => /MorrisCurse\/index\.astro|ClientRouter\.astro|^astro:scripts\/page\.js$/.test(k)); // скрипты страницы игры (+ общие скрипты макета)
      const pub = ['js/three.min.js', ...(existsSync(join(dist, 'mc-vn')) ? walk(join(dist, 'mc-vn')).map((f) => 'mc-vn/' + f) : [])];
      const m = buildManifest({ dist, viteManifest: vmf, entries, publicFiles: pub, srcRoot: resolve(ROOT || process.cwd(), 'src/assets') });
      try { const rp = join(dist, '_routes.json'), r = JSON.parse(readFileSync(rp, 'utf8')); for (const x of ['/mc-assets/*', '/mc-sw.js']) if (!r.exclude.includes(x)) r.exclude.push(x); writeFileSync(rp, JSON.stringify(r, null, 2)); } catch (_) {} // статикой, мимо воркера SSR
      mkdirSync(join(dist, 'mc-assets'), { recursive: true }); writeFileSync(join(dist, 'mc-assets/manifest.json'), JSON.stringify(m));
      if (!process.env.MC_KEEP_VITE_MANIFEST) { try { if (vmf.endsWith('mc-vite-manifest.json')) rmSync(vmf, { force: true }); else if (vmf.endsWith('.vite/manifest.json')) rmSync(join(dist, '.vite'), { recursive: true, force: true }); } catch (_) {} } // vite manifest (пути исходников) — не выкладываем
      logger.info(`mc-assets: ${m.files.length} файлов, ${(m.files.reduce((a, f) => a + f.s, 0) / 1048576).toFixed(1)} МБ, версия ${m.version} (${Object.entries(m.groups).map(([g, x]) => `${g} ${x.files}/${(x.bytes / 1048576).toFixed(1)} МБ`).join(', ')})`);
    } } };
}
// CLI: node tools/mc-assets/manifest.mjs [dist] — пересобрать только манифест (плейтесты: «изменённый/удалённый файл»)
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop()) && process.argv[1].includes('mc-assets')) {
  const dist = resolve(process.argv[2] || 'dist');
  mcAssets().hooks['astro:build:done']({ dir: new URL('file://' + dist + '/'), logger: { info: console.log, warn: console.warn } });
}
