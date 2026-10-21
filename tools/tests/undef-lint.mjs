// Лёгкий линт «необъявленный идентификатор» для клиентского кода MorrisCurse (ловит, напр., HALF_M в game.js, который падает только при вызове).
// Без eslint: acorn-разбор; имя считается объявленным, если оно где-либо в файле связано (var/let/const/function/class/параметр/import/catch)
// или это глобал браузера (tools/tests/browser-globals.json — снимок window из Chrome). Проверка по файлу, не по областям — ловит только
// полностью необъявленные имена (как HALF_M), без ложных срабатываний на затенение. Запуск: node tools/tests/undef-lint.mjs [файлы/папки]
import { parse } from 'acorn';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
const HERE = dirname(fileURLToPath(import.meta.url)), ROOT = join(HERE, '../..');
const G = new Set([...JSON.parse(readFileSync(join(HERE, 'browser-globals.json'), 'utf8')), ...Object.getOwnPropertyNames(globalThis), 'arguments', 'undefined', 'globalThis', 'import']);
const ALLOW = new Set(['__dirname', 'process']); // встречаются в ветках «если Node»
const walk = (n, f, parent = null, key = null) => { if (!n || typeof n.type !== 'string') return; f(n, parent, key); for (const k of Object.keys(n)) { if (k === 'type' || k === 'start' || k === 'end') continue; const v = n[k]; if (Array.isArray(v)) v.forEach((c) => c && typeof c.type === 'string' && walk(c, f, n, k)); else if (v && typeof v.type === 'string') walk(v, f, n, k); } };
const bindNames = (p, out) => { if (!p) return; switch (p.type) { case 'Identifier': out.add(p.name); break; case 'ObjectPattern': p.properties.forEach((q) => bindNames(q.type === 'RestElement' ? q.argument : q.value, out)); break; case 'ArrayPattern': p.elements.forEach((e) => bindNames(e, out)); break; case 'RestElement': bindNames(p.argument, out); break; case 'AssignmentPattern': bindNames(p.left, out); break; } };
export function lintSource(src, file = '?') {
  const ast = parse(src, { ecmaVersion: 'latest', sourceType: 'module', allowHashBang: true, locations: true });
  const decl = new Set();
  walk(ast, (n) => {
    if (n.type === 'VariableDeclarator') bindNames(n.id, decl);
    else if (/Function/.test(n.type)) { if (n.id) decl.add(n.id.name); n.params.forEach((p) => bindNames(p, decl)); }
    else if (n.type === 'ClassDeclaration' || n.type === 'ClassExpression') { if (n.id) decl.add(n.id.name); }
    else if (n.type === 'CatchClause') bindNames(n.param, decl);
    else if (/^Import(Default|Namespace)?Specifier$/.test(n.type)) decl.add(n.local.name);
  });
  const bad = [];
  walk(ast, (n, p, key) => {
    if (n.type !== 'Identifier' || !p) return;
    if ((p.type === 'MemberExpression' && key === 'property' && !p.computed) || ((p.type === 'Property' || p.type === 'MethodDefinition' || p.type === 'PropertyDefinition') && key === 'key' && !p.computed)) return;
    if (/^(Labeled|Break|Continue)Statement$/.test(p.type) || p.type === 'MetaProperty' || /Specifier$/.test(p.type)) return;
    if (decl.has(n.name) || G.has(n.name) || ALLOW.has(n.name)) return;
    bad.push(`${file}:${n.loc.start.line}:${n.loc.start.column + 1} ${n.name}`);
  });
  return bad;
}
const files = (p) => statSync(p).isDirectory() ? readdirSync(p).flatMap((f) => files(join(p, f))) : /\.(m?js)$/.test(p) ? [p] : [];
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2), targets = args.length ? args : [join(ROOT, 'src/pages/MorrisCurse/_core')];
  const all = targets.flatMap(files).flatMap((f) => { try { return lintSource(readFileSync(f, 'utf8'), f.replace(ROOT + '/', '')); } catch (e) { return [`${f}: parse ${e.message}`]; } });
  // самопроверка: исторический баг debug.lightSources должен ловиться
  const self = lintSource('const toX = (p) => p; export const f = (s) => (s.x + HALF_M) * 20;');
  if (!self.some((b) => b.endsWith(' HALF_M'))) { console.log('undef-lint: самопроверка не поймала HALF_M'); process.exit(1); }
  console.log(all.join('\n') || ''); console.log(`undef-lint: ${all.length ? 'FAIL ' + all.length : 'ok'} (${targets.flatMap(files).length} файлов)`); process.exit(all.length ? 1 : 0);
}
