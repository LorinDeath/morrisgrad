// Манифест ресурсов и diff (src/pages/MorrisCurse/_core/boot/manifestDiff.js, tools/mc-assets/manifest.mjs).
import { diffManifest, assetUrl, eagerGroups, indexOf } from '../../src/pages/MorrisCurse/_core/boot/manifestDiff.js';
import { groupOf, reachable } from '../mc-assets/manifest.mjs';
import { existsSync, readFileSync } from 'fs';
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
const F = (p, h, s, g = 'core') => ({ p, h, s, g });
const M = (files) => ({ v: 1, version: 'x', files });
const haveOf = (m, only) => new Map(m.files.filter((e) => !only || only.includes(e.p)).map((e) => [assetUrl(e), { s: e.s, h: e.h }]));
const A = M([F('/_astro/game.AAA.js', 'a1', 100), F('/_astro/props32_p64.BBB.png', 'b1', 2000, 'props3'), F('/_astro/props_p32.CCC.png', 'c1', 500, 'props2'), F('/js/three.min.js', 't1', 600), F('/mc-vn/a.webp', 'v1', 50, 'vn'), F('/_astro/items.DDD.png', 'd1', 70, 'sprites')]);
const G = ['core', 'sprites', 'props3'];
// ключи кэша
ok(assetUrl(F('/_astro/x.H.png', 'h', 1)) === '/_astro/x.H.png', 'файл vite: ключ = имя с хешем');
ok(assetUrl(F('/js/three.min.js', 'abc', 1)) === '/js/three.min.js?v=abc', 'файл без хеша в имени: ключ ?v=хеш');
// первый визит
let d = diffManifest(A, new Map(), G);
ok(d.files === 4 && d.bytes === 2770 && !d.evict.length, `первый визит: качаем только группы устройства (${d.files} файлов, ${d.bytes} Б), props2 и vn — нет`);
ok(!d.fetch.some((e) => e.g === 'props2' || e.g === 'vn'), 'ленивые группы не качаются заранее');
// повторный визит
d = diffManifest(A, haveOf(A, ['/_astro/game.AAA.js', '/_astro/props32_p64.BBB.png', '/js/three.min.js', '/_astro/items.DDD.png']), G);
ok(d.files === 0 && d.bytes === 0 && !d.evict.length, 'повторный визит без изменений: ничего не качаем и не удаляем');
// изменённый файл vite (новое имя) и нехешированный (новый ?v)
const B = M(A.files.map((e) => e.p === '/_astro/game.AAA.js' ? F('/_astro/game.EEE.js', 'a2', 120) : e.p === '/js/three.min.js' ? F('/js/three.min.js', 't2', 610) : e));
d = diffManifest(B, haveOf(A, ['/_astro/game.AAA.js', '/_astro/props32_p64.BBB.png', '/js/three.min.js', '/_astro/items.DDD.png']), G);
ok(d.files === 2 && d.fetch.map((e) => e.p).sort().join() === '/_astro/game.EEE.js,/js/three.min.js', `изменились 2 файла → качаем только их (${d.fetch.map((e) => e.p)})`);
ok(d.evict.sort().join() === '/_astro/game.AAA.js,/js/three.min.js?v=t1', 'старые версии удаляются из кэша: ' + d.evict);
// удалённый файл
const C = M(A.files.filter((e) => e.p !== '/_astro/items.DDD.png'));
d = diffManifest(C, haveOf(A, ['/_astro/game.AAA.js', '/_astro/props32_p64.BBB.png', '/js/three.min.js', '/_astro/items.DDD.png']), G);
ok(d.files === 0 && d.evict.join() === '/_astro/items.DDD.png', 'удалённый из манифеста файл → удалить из кэша, ничего не качать');
// самолечение: файл пропал из кэша / размер не тот / мусорный ключ
const H = haveOf(A, ['/_astro/game.AAA.js', '/js/three.min.js', '/_astro/items.DDD.png']); H.set('/_astro/props32_p64.BBB.png', { s: 13, h: 'b1' }); H.set('/_astro/junk.ZZZ.js', { s: -1, h: 'x' });
d = diffManifest(A, H, G);
ok(d.fetch.length === 1 && d.fetch[0].p === '/_astro/props32_p64.BBB.png', 'битый (размер) файл в кэше → перекачать');
ok(d.evict.includes('/_astro/junk.ZZZ.js'), 'неизвестный ключ в кэше → удалить');
// прерванная загрузка: в кэше половина → докачать остальное
d = diffManifest(A, haveOf(A, ['/_astro/game.AAA.js', '/js/three.min.js']), G);
ok(d.files === 2 && d.fetch.every((e) => ['/_astro/props32_p64.BBB.png', '/_astro/items.DDD.png'].includes(e.p)), 'продолжение после обрыва: только недокачанное');
// ленивая группа отдельно
d = diffManifest(A, haveOf(A), ['props2']); ok(d.files === 0, 'ленивая группа уже в кэше → ничего');
d = diffManifest(A, new Map(), ['props2']); ok(d.files === 1 && d.fetch[0].g === 'props2', 'ленивая группа: только её файлы');
// группы устройства
ok(eagerGroups({ props: 'props2', tiles: 'tiles16' }).join() === 'core,sprites,ui,props2,tiles16', 'телефон: props2 + тайлы 16');
ok(indexOf(A).get('/js/three.min.js').h === 't1', 'индекс сервис-воркера по пути');
// группы по исходникам
ok(groupOf('src/assets/mc/props3/props32_p64.png') === 'props3' && groupOf('src/assets/mc/props2/props_p32.png') === 'props2', 'группы props3/props2');
ok(groupOf('src/assets/mc/tiles32_atlas.png') === 'tiles32' && groupOf('src/assets/mc/tiles_ice.png') === 'tiles16', 'группы тайлов');
ok(groupOf('src/assets/mc/bestiary32/bestiary32_t1_p1.png') === 'mobs32' && groupOf('src/pages/MorrisCurse/_core/survivors/arena32Set.js') === 'core', 'мобы 32 — своя группа (код арены — core)');
ok(eagerGroups({ props: 'props3', tiles: 'tiles32', mobs: true }).join() === 'core,sprites,ui,props3,tiles32,mobs32' && !eagerGroups({ props: 'props2', tiles: 'tiles16' }).includes('mobs32'), 'мобы 32 заранее — только при новых мобах');
ok(groupOf('src/music/x.mp3') === null, 'музыка не в манифесте (стрим по Range)');
ok(groupOf('src/assets/mc/worldmap_arinar_4096.webp') === 'map' && groupOf('public/mc-vn/a/b.webp') === 'vn', 'карта мира и VN — ленивые');
// граф vite: ассеты из текста чанков, имена с пробелом
const vm = { 'e.ts': { file: '_astro/e.1.js', imports: ['g.js'], isEntry: true }, 'g.js': { file: '_astro/g.2.js', dynamicImports: ['h.js'], css: ['_astro/g.3.css'] }, 'h.js': { file: '_astro/h.4.js' }, 'x.js': { file: '_astro/x.5.js' } };
const txt = { '_astro/g.2.js': 'const a="/_astro/props32_p64.Po2.png", b="/_astro/character_1 2.C4A.png";', '_astro/h.4.js': 'x("/_astro/m.Q.webp")' };
const r = reachable(vm, ['e.ts'], (f) => txt[f] || '');
ok(['_astro/e.1.js', '_astro/g.2.js', '_astro/h.4.js', '_astro/g.3.css', '_astro/props32_p64.Po2.png', '_astro/character_1 2.C4A.png', '_astro/m.Q.webp'].every((f) => r.has(f)) && !r.has('_astro/x.5.js'), 'граф от входа: импорты, динамические, css, ассеты из текста (и с пробелом в имени); чужие чанки — нет');
// собранный манифест (если есть dist)
const mp = [new URL('../../dist/client/mc-assets/manifest.json', import.meta.url), new URL('../../dist/mc-assets/manifest.json', import.meta.url)].find((u) => existsSync(u)) || new URL('../../dist/mc-assets/manifest.json', import.meta.url); // Astro 7: dist/client
if (existsSync(mp)) { const m = JSON.parse(readFileSync(mp, 'utf8')), ps = new Set(m.files.map((f) => f.p));
  ok(m.files.every((f) => /^[0-9a-f]{16}$/.test(f.h) && f.s > 0 && f.g), `dist: ${m.files.length} записей с хешем/размером/группой`);
  ok(ps.size === m.files.length, 'dist: пути уникальны');
  ok(m.files.some((f) => /\/game\.[\w-]+\.js$/.test(f.p)) && ps.has('/js/three.min.js'), 'dist: код игры и three.min.js в манифесте');
  ok(!m.files.some((f) => /\.(mp3|html)$/.test(f.p) || f.p.startsWith('/api')), 'dist: нет HTML, API и музыки');
}
console.log(fails ? `FAILED ${fails}` : 'ALL PASS'); process.exit(fails ? 1 : 0);
