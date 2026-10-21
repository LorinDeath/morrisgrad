// Справочник кодов ошибок для владельца (рус.) — генерируется из реестра src/errors/codes.js.
// node tools/errors/gen-docs.mjs → docs/ERROR_CODES.md (+ копия в хранилище бота, если путь передан вторым аргументом или MC_ERR_COPY).
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { CODES, AREAS } from '../../src/errors/codes.js';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const SEV = { info: 'подсказка (игра идёт дальше)', warn: 'предупреждение (игра работает, часть функций — нет)', error: 'ошибка (шаг не выполнен, нужен повтор)', fatal: 'критично (игра не запускается)' };
export function renderDocs() {
  const L = ['# Коды ошибок «Проклятых» (MorrisCurse)', '',
    '> Файл создан автоматически из `src/errors/codes.js` (`node tools/errors/gen-docs.mjs`). Не правьте вручную — правьте реестр.', '',
    '## Как этим пользоваться', '',
    '- Игрок видит окно с **крупным кодом** (например `MC-N02`), одной строкой по-русски и кнопками **«Скопировать код»** и (если можно) **«Повторить»**. Стека и внутренностей игрок не видит.',
    '- «Скопировать код» кладёт в буфер строку вида `MC-N02 · k3f9a1lq2 · v1dfe31834c835a12 · 2026-10-21T17:05:00.000Z · <шаг>`: код, **контекст** (случайный id этого случая), версию ресурсов клиента (манифест) и время UTC.',
    '- Тот же код и контекст уходят на игровой сервер (без ника и личных данных, не чаще раза в 30 с на код, до 20 за соединение) и видны в админке **«📊 Нагрузка» → последние ошибки** строкой `client MC-N02 k3f9a1lq2 v… мир · шаг`, а в логах воркера — `[mc-err] …`. Ошибки до подключения к серверу (загрузка) отправляются при следующем подключении.',
    '- В консоли браузера игрока — `[mc-err] <код> <контекст> <подробности>`: если игрок может открыть консоль (F12), подробности там.', '',
    '## Сводка', '', '| Код | Область | Что видит игрок | Тяжесть | «Повторить» |', '|---|---|---|---|---|'];
  for (const [c, e] of Object.entries(CODES)) L.push(`| \`${c}\` | ${AREAS[c[3]] || '—'} | ${e.msg} | ${(SEV[e.sev] || e.sev).split(" (")[0]} | ${e.retry ? 'да' : 'нет'} |`);
  L.push('');
  let area = null;
  for (const [c, e] of Object.entries(CODES)) {
    if (c[3] !== area) { area = c[3]; L.push(`## ${area} — ${AREAS[area] || ''}`, ''); }
    L.push(`### ${c}`, '', `**Игрок видит:** «${e.msg}»${e.retry ? ' + кнопка «Повторить»' : ''} · тяжесть: ${SEV[e.sev] || e.sev}`, '',
      `**Что это значит:** ${e.doc.means}`, '', `**Вероятные причины:** ${e.doc.causes}`, '', `**Что может сделать игрок:** ${e.doc.player}`, '', `**Что сказать Мэлу:** ${e.doc.mel}`, '');
  }
  return L.join('\n');
}
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const md = renderDocs(), out = join(ROOT, 'docs/ERROR_CODES.md'); mkdirSync(dirname(out), { recursive: true }); writeFileSync(out, md); console.log('→', out);
  const copy = process.argv[2] || process.env.MC_ERR_COPY; if (copy) { mkdirSync(dirname(copy), { recursive: true }); writeFileSync(copy, md); console.log('→', copy); }
}
