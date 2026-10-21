// Реестр кодов ошибок (src/errors/codes.js) ↔ справочник docs/ERROR_CODES.md: формат, уникальность, полнота описаний,
// справочник совпадает со сгенерированным (не забыли перегенерировать), коды из кода игры есть в реестре.
import { readFileSync, readdirSync, statSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { CODES, AREAS, CODE_RE } from '../../src/errors/codes.js';
import { renderDocs } from '../errors/gen-docs.mjs';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
const keys = Object.keys(CODES);
ok(keys.every((k) => CODE_RE.test(k)), 'формат MC-<буква><2 цифры>: ' + keys.filter((k) => !CODE_RE.test(k)).join(', '));
ok(keys.every((k) => AREAS[k[3]]), 'область каждого кода описана в AREAS');
ok(!!CODES['MC-X00'], 'есть общий MC-X00');
// дубли: ключ объекта уникален сам по себе — ловим дубли в ИСХОДНИКЕ (второй ключ молча перезаписал бы первый)
const src = readFileSync(join(ROOT, 'src/errors/codes.js'), 'utf8'), seen = new Map();
for (const m of src.matchAll(/'(MC-[A-Z]\d{2})':/g)) seen.set(m[1], (seen.get(m[1]) || 0) + 1);
const dup = [...seen].filter(([, n]) => n > 1).map(([k]) => k);
ok(!dup.length, 'нет повторяющихся кодов в реестре ' + dup.join(', '));
const msgs = new Map(); for (const [k, e] of Object.entries(CODES)) msgs.set(e.msg, [...(msgs.get(e.msg) || []), k]);
ok([...msgs.values()].every((v) => v.length === 1), 'строки игроку не повторяются (иначе коды неразличимы на глаз)');
const bad = keys.filter((k) => { const e = CODES[k]; return !e.msg || e.msg.length > 60 || !['info', 'warn', 'error', 'fatal'].includes(e.sev) || typeof e.retry !== 'boolean' || ['means', 'causes', 'player', 'mel'].some((f) => !e.doc?.[f] || e.doc[f].length < 10); });
ok(!bad.length, 'у каждого кода: строка игроку ≤ 60 символов, тяжесть, retry, 4 поля справочника: ' + bad.join(', '));
ok(keys.every((k) => /[а-яё]/i.test(CODES[k].msg)), 'строки игроку — по-русски');
// справочник актуален
const md = readFileSync(join(ROOT, 'docs/ERROR_CODES.md'), 'utf8');
ok(md === renderDocs(), 'docs/ERROR_CODES.md совпадает с реестром (node tools/errors/gen-docs.mjs)');
const missing = keys.filter((k) => !md.includes(`### ${k}`)); ok(!missing.length, 'в справочнике есть раздел на каждый код ' + missing.join(', '));
// все коды, упомянутые в коде игры/сервера, есть в реестре; и каждый код реестра где-то используется
const walk = (d) => readdirSync(d).flatMap((f) => { const p = join(d, f); return statSync(p).isDirectory() ? (/node_modules|dist|^\./.test(f) ? [] : walk(p)) : /\.(js|ts|astro)$/.test(f) ? [p] : []; });
const files = [...walk(join(ROOT, 'src/pages/MorrisCurse')), ...(existsSync(join(ROOT, 'src/scripts')) ? walk(join(ROOT, 'src/scripts')) : []), ...walk(join(ROOT, 'server')).filter((f) => !/test/.test(f))];
const used = new Set(); for (const f of files) for (const m of readFileSync(f, 'utf8').matchAll(/['"](MC-[A-Z]\d{2})['"]/g)) used.add(m[1]);
const unknown = [...used].filter((k) => !CODES[k]); ok(!unknown.length, 'коды в коде игры есть в реестре: ' + unknown.join(', '));
// MC-A01/A05 выдаёт окно входа ветки guest-login (src/scripts/mcAuthGate.ts); пока её нет в этой ветке — не требуем
const GUEST = existsSync(join(ROOT, 'src/scripts/mcAuthGate.ts')) ? [] : ['MC-A01', 'MC-A05'];
const unused = keys.filter((k) => !used.has(k) && k !== 'MC-X00' && !GUEST.includes(k)); ok(!unused.length, 'каждый код реестра где-то выдаётся: ' + unused.join(', '));
console.log(fails ? `FAILED ${fails}` : 'ALL PASS'); process.exit(fails ? 1 : 0);
