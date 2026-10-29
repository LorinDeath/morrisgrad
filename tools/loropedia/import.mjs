#!/usr/bin/env node
// Импорт Obsidian-летописи «Обитель смерти» в Лоропедию МоррисГрада.
// Запуск: node tools/loropedia/import.mjs [путь_к_хранилищу] [--report путь.json]
// Пишет: src/data/loropedia/data.json, public/loropedia/search.json, public/loropedia/img/*.
// Новых зависимостей нет: свой разбор YAML-шапки и markdown, картинки — через sharp (уже в проекте).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import {
  DEFAULT_VAULT, HIDDEN_TERMS, EXCLUDE_NOTES, EXCLUDE_IMAGES, MIN_KEEP_RATIO,
  HEADING_RENAMES, TEXT_REPLACEMENTS, KEEP_ALWAYS_TYPES, CATEGORIES, RESERVED_SLUGS,
} from './config.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const args = process.argv.slice(2);
const reportIdx = args.indexOf('--report');
const REPORT_PATH = reportIdx >= 0 ? args[reportIdx + 1] : '/workspace/loropedia/import-report.json';
const VAULT = args.find((a, i) => !a.startsWith('--') && i !== reportIdx + 1) || DEFAULT_VAULT;
const OUT_DATA = path.join(ROOT, 'src/data/loropedia/data.json');
const OUT_PUBLIC = path.join(ROOT, 'public/loropedia');
const OUT_IMG = path.join(OUT_PUBLIC, 'img');
const BASE = '/loropedia';

const hidden = (s) => HIDDEN_TERMS.test(String(s ?? ''));

// ───────────────────────── утилиты ─────────────────────────
const TR = { а:'a',б:'b',в:'v',г:'g',д:'d',е:'e',ё:'yo',ж:'zh',з:'z',и:'i',й:'y',к:'k',л:'l',м:'m',н:'n',о:'o',п:'p',р:'r',с:'s',т:'t',у:'u',ф:'f',х:'kh',ц:'ts',ч:'ch',ш:'sh',щ:'shch',ъ:'',ы:'y',ь:'',э:'e',ю:'yu',я:'ya' };
export function slugify(s) {
  return String(s).toLowerCase().split('').map((c) => (c in TR ? TR[c] : c)).join('')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'x';
}
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const stripMd = (s) => String(s)
  .replace(/!\[\[[^\]]*\]\]/g, '')
  .replace(/\[\[([^\]|#]*)(?:#[^\]|]*)?(?:\|([^\]]*))?\]\]/g, (_, t, d) => d || t)
  .replace(/\*\*|__|`/g, '').replace(/(^|[^*])\*([^*]+)\*/g, '$1$2').trim();

// Внутренние имена рабочих файлов (plan.md, A.txt, *.fb2) не публикуем.
function sanitizeInternal(s) {
  return String(s)
    .replace(/\s*\((?:по\s+)?[\w–.-]+\.(?:md|txt|fb2)\)/g, '')
    .replace(/по\s+[\w–.-]+\.(?:md|txt)/g, 'по замыслу Алекса')
    .replace(/\bв\s+[\w–.-]+\.(?:md|txt)/g, 'в заметках Алекса')
    .replace(/[\w–.-]+\.(?:md|txt)(?:\s*\(Алекс\))?/g, 'заметки Алекса')
    .replace(/\s*=\s*(?:свежий\s+)?(?:fb2|v8d)\b/g, '')
    .replace(/\(\s*\)/g, '');
}

// ───────────────────────── YAML-шапка ─────────────────────────
function unq(v) {
  v = v.trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) return v.slice(1, -1);
  return v;
}
function parseFrontmatter(src) {
  const m = src.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!m) return { fm: {}, body: src };
  const fm = {}; let key = null;
  for (const line of m[1].split(/\r?\n/)) {
    const item = line.match(/^\s+-\s+(.*)$/);
    if (item && key) { (fm[key] = Array.isArray(fm[key]) ? fm[key] : []).push(unq(item[1])); continue; }
    const kv = line.match(/^([^:\s][^:]*):\s*(.*)$/);
    if (!kv) continue;
    key = kv[1].trim(); const v = kv[2].trim();
    if (v === '') fm[key] = [];
    else if (v.startsWith('[') && v.endsWith(']')) {
      const inner = v.slice(1, -1).trim();
      fm[key] = inner ? inner.match(/"[^"]*"|'[^']*'|[^,]+/g).map((x) => unq(x)).filter(Boolean) : [];
    } else fm[key] = unq(v);
  }
  return { fm, body: src.slice(m[0].length) };
}

// ───────────────────────── чтение хранилища ─────────────────────────
function walk(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith('.')) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p)); else if (e.name.endsWith('.md')) out.push(p);
  }
  return out;
}

const report = { vault: VAULT, excludedNotes: [], redactedNotes: [], excludedImages: [], brokenLinks: {} };
const all = [];
for (const file of walk(VAULT)) {
  const rel = path.relative(VAULT, file);
  const folder = rel.includes(path.sep) ? rel.split(path.sep)[0] : '';
  const title = path.basename(file, '.md');
  const { fm, body } = parseFrontmatter(fs.readFileSync(file, 'utf8'));
  all.push({ file, rel, folder, title, fm, body });
}

// Исключения целиком: явный список, скрытая тема в имени.
for (const n of all) {
  if (EXCLUDE_NOTES.includes(n.title)) n.excluded = 'исключена по списку (служебная)';
  else if (hidden(n.title)) n.excluded = 'скрытая тема в названии';
  else if (!CATEGORIES.some((c) => c.folder === n.folder)) n.excluded = 'вне разделов';
}

// Индекс названий и псевдонимов → заметка (без учёта регистра).
const byKey = new Map();
const keyOf = (s) => String(s).trim().toLowerCase().replace(/ё/g, 'е');
for (const n of all) {
  byKey.set(keyOf(n.title), n);
}
for (const n of all) for (const a of [].concat(n.fm.aliases || [])) if (!byKey.has(keyOf(a))) byKey.set(keyOf(a), n);

// Слаги.
const used = new Set(RESERVED_SLUGS);
for (const n of all) {
  let s = slugify(n.title); let i = 2;
  while (used.has(s)) s = `${slugify(n.title)}-${i++}`;
  used.add(s); n.slug = s;
}

// ───────────────────────── вычёркивание ─────────────────────────
// Делим абзац на предложения, не разрывая [[ссылки]] и «цитаты».
function splitSentences(text) {
  const out = []; let cur = ''; let depth = 0; let link = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i]; cur += c;
    if (c === '[' && text[i + 1] === '[') link++;
    if (c === ']' && text[i + 1] === ']') link = Math.max(0, link - 1);
    if (c === '«') depth++;
    if (c === '»') depth = Math.max(0, depth - 1);
    if (!link && !depth && /[.!?…]/.test(c) && /\s/.test(text[i + 1] || '')) {
      // «Гл.2», «И2.1» и т.п. — не конец предложения
      if (/(Гл|И\d|т\.д|т\.п|напр|см|ср)\.$/i.test(cur.slice(-5))) continue;
      out.push(cur); cur = '';
    }
  }
  if (cur.trim()) out.push(cur);
  return out;
}
function redactText(text, stat) {
  if (!hidden(text)) return text;
  const parts = splitSentences(text);
  const kept = parts.filter((p) => !hidden(p));
  stat.removed += parts.filter((p) => hidden(p)).map((p) => stripMd(p).length).reduce((a, b) => a + b, 0);
  return kept.join('').trim();
}

// ───────────────────────── markdown → блоки ─────────────────────────
function parseBlocks(body) {
  const lines = body.replace(/\r/g, '').split('\n');
  const blocks = []; let i = 0;
  const isList = (l) => /^\s*(?:[-*+]|\d+\.)\s+/.test(l);
  const isStart = (l) => /^(#{1,6}\s|>|```|\||---+\s*$|!\[\[)/.test(l) || isList(l);
  while (i < lines.length) {
    const l = lines[i];
    if (!l.trim()) { i++; continue; }
    if (l.startsWith('```')) {
      const lang = l.slice(3).trim(); const buf = []; i++;
      while (i < lines.length && !lines[i].startsWith('```')) buf.push(lines[i++]);
      i++; blocks.push({ t: 'code', lang, text: buf.join('\n') }); continue;
    }
    const h = l.match(/^(#{1,6})\s+(.*)$/);
    if (h) { blocks.push({ t: 'h', level: h[1].length, text: h[2].trim() }); i++; continue; }
    if (/^---+\s*$/.test(l)) { blocks.push({ t: 'hr' }); i++; continue; }
    if (l.startsWith('>')) {
      const buf = [];
      while (i < lines.length && lines[i].startsWith('>')) buf.push(lines[i++].replace(/^>\s?/, ''));
      const co = buf[0].match(/^\[!(\w+)\]\s*(.*)$/);
      if (co) blocks.push({ t: 'callout', kind: co[1].toLowerCase(), title: co[2], lines: buf.slice(1) });
      else blocks.push({ t: 'quote', lines: buf });
      continue;
    }
    const img = l.match(/^!\[\[([^\]|]+)(?:\|[^\]]*)?\]\]\s*$/);
    if (img) {
      i++; let caption = '';
      if (i < lines.length && /^\*[^*].*\*\s*$/.test(lines[i])) { caption = lines[i].trim().slice(1, -1); i++; }
      blocks.push({ t: 'img', file: img[1].trim(), caption }); continue;
    }
    if (l.startsWith('|')) {
      const rows = [];
      while (i < lines.length && lines[i].startsWith('|')) rows.push(lines[i++]);
      const cells = (r) => r.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
      const head = cells(rows[0]);
      const bodyRows = rows.slice(1).filter((r) => !/^\|[\s:|-]+\|?$/.test(r.trim())).map(cells);
      blocks.push({ t: 'table', head, rows: bodyRows }); continue;
    }
    if (isList(l)) {
      const items = [];
      while (i < lines.length && (isList(lines[i]) || (/^\s{2,}\S/.test(lines[i]) && items.length))) {
        const m = lines[i].match(/^(\s*)(?:([-*+])|(\d+)\.)\s+(.*)$/);
        if (m) items.push({ indent: m[1].replace(/\t/g, '  ').length, ordered: !!m[3], n: m[3] ? +m[3] : null, text: m[4] });
        else items[items.length - 1].text += ' ' + lines[i].trim();
        i++;
      }
      blocks.push({ t: 'list', items }); continue;
    }
    const buf = [];
    while (i < lines.length && lines[i].trim() && !isStart(lines[i])) buf.push(lines[i++]);
    blocks.push({ t: 'p', lines: buf });
  }
  return blocks;
}

const STATUS_CALLOUT = /Канон \(есть|Справочная заметка|Спорно \/ не подтверждено|Идея Алекса — НЕ канон/;

// Вычёркиваем скрытые темы на уровне блоков. Возвращает новые блоки и статистику.
function redactBlocks(blocks, stat) {
  const out = [];
  const count = (s) => { stat.total += stripMd(s).length; };
  let skipUntilLevel = 0;
  for (const b0 of blocks) {
    const b = structuredClone(b0);
    if (b.t === 'h') {
      if (HEADING_RENAMES[b.text]) b.text = HEADING_RENAMES[b.text];
      if (hidden(b.text)) { stat.removed += b.text.length; continue; }
      out.push(b); continue;
    }
    if (b.t === 'p') {
      b.lines = b.lines.map((l) => { count(l); return redactText(l, stat); }).filter((l) => stripMd(l).length > 0);
      if (b.lines.length) out.push(b);
      continue;
    }
    if (b.t === 'quote') {
      b.lines = b.lines.map((l) => { count(l); return redactText(l, stat); }).filter((l) => l.trim());
      if (b.lines.length) out.push(b);
      continue;
    }
    if (b.t === 'callout') {
      if (STATUS_CALLOUT.test(b.title)) continue; // статус показываем своей плашкой
      count(b.title); b.title = redactText(b.title, stat);
      b.lines = b.lines.map((l) => { count(l); return redactText(l, stat); }).filter((l) => l.trim());
      if (b.title || b.lines.length) out.push(b);
      continue;
    }
    if (b.t === 'list') {
      const items = []; let dropIndent = -1;
      for (const it of b.items) {
        if (dropIndent >= 0 && it.indent > dropIndent) { stat.removed += stripMd(it.text).length; stat.total += stripMd(it.text).length; continue; }
        dropIndent = -1;
        count(it.text);
        if (hidden(it.text)) { stat.removed += stripMd(it.text).length; dropIndent = it.indent; continue; }
        items.push(it);
      }
      if (items.length) out.push({ ...b, items });
      continue;
    }
    if (b.t === 'table') {
      b.head = b.head.map((c) => (hidden(c) ? '' : c));
      b.rows = b.rows.filter((r) => { const s = r.join(' '); count(s); if (hidden(s)) { stat.removed += stripMd(s).length; return false; } return true; });
      if (b.rows.length) out.push(b);
      continue;
    }
    if (b.t === 'img') {
      if (hidden(b.caption) || hidden(b.file)) continue;
      out.push(b); continue;
    }
    out.push(b);
  }
  // убираем «осиротевшие» заголовки (за которыми до следующего заголовка того же уровня ничего нет)
  const clean = [];
  for (let k = 0; k < out.length; k++) {
    const b = out[k];
    if (b.t === 'h') {
      const next = out[k + 1];
      if (!next || (next.t === 'h' && next.level <= b.level) || next.t === 'hr') continue;
    }
    clean.push(b);
  }
  void skipUntilLevel;
  return clean;
}

// ───────────────────────── подготовка заметок ─────────────────────────
for (const n of all) {
  if (n.excluded) continue;
  let body = sanitizeInternal(n.body);
  // [[Скрытая статья|нейтральный текст]] → просто «нейтральный текст»: ссылка всё равно не публикуется,
  // а предложение целиком терять незачем.
  body = body.replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, (m, t, d) => (hidden(t) && !hidden(d) ? d : m));
  for (const [re, to] of TEXT_REPLACEMENTS) body = body.replace(re, to);
  let blocks = parseBlocks(body);
  // первый H1 = название заметки
  const h1 = blocks.findIndex((b) => b.t === 'h' && b.level === 1);
  if (h1 >= 0 && stripMd(blocks[h1].text) === n.title) blocks.splice(h1, 1);
  // статистика по «содержательной» части (без раздела «Появления»)
  const stat = { total: 0, removed: 0 };
  const red = redactBlocks(blocks, stat);
  // доля оставшегося текста считаем без «Появлений»
  const statCore = { total: 0, removed: 0 };
  const coreIdx = blocks.findIndex((b) => b.t === 'h' && /^Появления/.test(b.text));
  redactBlocks(coreIdx >= 0 ? blocks.slice(0, coreIdx) : blocks, statCore);
  n.blocks = red;
  if (stat.removed > 0) {
    const keep = statCore.total ? 1 - statCore.removed / statCore.total : 1;
    n.redaction = { removedChars: stat.removed, keepRatio: Math.round(keep * 100) / 100 };
    if (keep < MIN_KEEP_RATIO && !(KEEP_ALWAYS_TYPES.includes(n.fm.type) && keep > 0)) n.excluded = `после вычёркивания осталось ${Math.round(keep * 100)}% текста`;
  }
}

// Фронтматтер: чистим псевдонимы, теги, поля.
for (const n of all) {
  if (n.excluded) continue;
  const fm = n.fm; const dropped = [];
  const clean = (v) => {
    if (v == null) return v;
    if (Array.isArray(v)) return v.filter((x) => (hidden(x) ? (dropped.push(x), false) : true));
    const s = sanitizeInternal(String(v));
    if (hidden(s)) { dropped.push(s); return undefined; }
    return s;
  };
  for (const k of Object.keys(fm)) fm[k] = clean(fm[k]);
  if (dropped.length) (n.redaction ||= { removedChars: 0, keepRatio: 1 }).droppedFields = dropped.length;
}

const published = all.filter((n) => !n.excluded);
const pubByTitle = new Map(published.map((n) => [n.title, n]));
for (const n of all.filter((x) => x.excluded)) report.excludedNotes.push({ note: n.rel, reason: n.excluded });
for (const n of published.filter((x) => x.redaction)) report.redactedNotes.push({ note: n.rel, ...n.redaction });

// ───────────────────────── картинки ─────────────────────────
const ATT = path.join(VAULT, 'Attachments');
const images = new Map(); // file → {slug, w, h, src, srcset, jpg, alt, caption, notes:[]}
fs.rmSync(OUT_IMG, { recursive: true, force: true });
fs.mkdirSync(OUT_IMG, { recursive: true });
async function useImage(file, note, caption) {
  if (EXCLUDE_IMAGES.includes(file) || hidden(file)) { if (!report.excludedImages.includes(file)) report.excludedImages.push(file); return null; }
  if (!images.has(file)) {
    const p = path.join(ATT, file);
    if (!fs.existsSync(p)) return null;
    const meta = await sharp(p).metadata();
    const base = slugify(file.replace(/\.[^.]+$/, ''));
    const widths = [480, 960].filter((w, i) => i === 0 || meta.width > 480);
    const srcset = [];
    for (const w of widths) {
      const ww = Math.min(w, meta.width);
      await sharp(p).resize({ width: ww, withoutEnlargement: true }).webp({ quality: 80 }).toFile(path.join(OUT_IMG, `${base}-${w}.webp`));
      srcset.push(`${BASE}/img/${base}-${w}.webp ${ww}w`);
    }
    await sharp(p).resize({ width: 1200, withoutEnlargement: true }).jpeg({ quality: 82, mozjpeg: true }).toFile(path.join(OUT_IMG, `${base}.jpg`));
    const w = Math.min(960, meta.width); const h = Math.round(meta.height * (w / meta.width));
    images.set(file, { id: base, w, h, src: `${BASE}/img/${base}-${widths[widths.length - 1]}.webp`, thumb: `${BASE}/img/${base}-480.webp`, srcset: srcset.join(', '), jpg: `${BASE}/img/${base}.jpg`, notes: [] });
  }
  const im = images.get(file);
  if (note && !im.notes.some((x) => x.slug === note.slug)) im.notes.push({ slug: note.slug, title: note.title, caption });
  return im;
}

// ───────────────────────── инлайн-разметка ─────────────────────────
function resolve(target) {
  const n = byKey.get(keyOf(target));
  return n || null;
}
function renderInline(text, ctx) {
  const ph = [];
  const hold = (html) => `\u0000${ph.push(html) - 1}\u0000`;
  let s = String(text);
  s = s.replace(/!\[\[([^\]|]+)(?:\|[^\]]*)?\]\]/g, () => ''); // встроенные картинки внутри строки не поддерживаем
  s = s.replace(/\[\[([^\]|#]*)(#[^\]|]*)?(?:\|([^\]]*))?\]\]/g, (_, target, hash, disp) => {
    const label = (disp || target).trim();
    const n = resolve(target);
    if (n && !n.excluded) {
      ctx?.links?.add(n.slug);
      const anchor = hash ? '#' + slugify(hash.slice(1)) : '';
      return hold(`<a class="lp-link" href="${BASE}/${n.slug}${anchor}">${esc(label)}</a>`);
    }
    if (n && n.excluded) return hold(esc(label)); // ссылка на снятую статью — просто текст
    if (ctx?.note) (report.brokenLinks[target] ||= new Set()).add(ctx.note.title);
    return hold(`<span class="lp-missing" title="Статья не написана">${esc(label)}</span>`);
  });
  s = s.replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, (_, t, u) => hold(`<a href="${esc(u)}" rel="noopener" target="_blank">${esc(t)}</a>`));
  s = s.replace(/`([^`]+)`/g, (_, c) => hold(`<code>${esc(c)}</code>`));
  s = esc(s);
  s = s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/(^|[^*\w])\*([^*\s][^*]*?)\*(?![*\w])/g, '$1<em>$2</em>');
  s = s.replace(/(^|[\s(«])_([^_]+)_(?=[\s.,;:!?)»]|$)/g, '$1<em>$2</em>');
  s = s.replace(/\u0000(\d+)\u0000/g, (_, k) => ph[+k]);
  return s;
}

// ───────────────────────── мини-Dataview ─────────────────────────
// Поддерживаются формы, которые есть в хранилище: TABLE [WITHOUT ID] поля FROM "папка" [OR …]
// [WHERE …] [SORT …] [GROUP BY поле] и LIST FROM … WHERE …
function fieldVal(n, f) {
  f = f.trim();
  if (f === 'file.name') return n.title;
  if (f === 'file.folder') return n.folder;
  if (f === 'file.link') return `[[${n.title}]]`;
  return n.fm[f];
}
function linkTarget(v) { const m = String(v ?? '').match(/^\[\[([^\]|#]+)/); return m ? m[1].trim() : null; }
function runDataview(q, self) {
  q = q.replace(/\s+/g, ' ').trim();
  const m = q.match(/^(TABLE|LIST)( WITHOUT ID)?(.*?) FROM (.+?)(?: WHERE (.+?))?(?: SORT (.+?))?(?: GROUP BY (.+?))?$/i);
  if (!m) return null;
  const [, kind, withoutId, fieldsRaw, fromRaw, where, sort, group] = m;
  const folders = [...fromRaw.matchAll(/"([^"]*)"/g)].map((x) => x[1]);
  let rows = published.filter((n) => folders.some((f) => f === '' || n.folder === f));
  if (where) {
    const w = where.trim();
    let mm;
    if ((mm = w.match(/^([\wа-яё.]+) = this\.file\.link$/i))) rows = rows.filter((n) => linkTarget(n.fm[mm[1]]) === self.title);
    else if ((mm = w.match(/^([\wа-яё.]+) = "([^"]*)"$/i))) rows = rows.filter((n) => String(fieldVal(n, mm[1]) ?? '') === mm[2]);
    else if ((mm = w.match(/^([\wа-яё.]+)$/i))) rows = rows.filter((n) => fieldVal(n, mm[1]));
  }
  if (sort) {
    const keys = sort.split(',').map((k) => { const [f, dir] = k.trim().split(/\s+/); return { f, desc: /desc/i.test(dir || '') }; });
    rows.sort((a, b) => {
      for (const { f, desc } of keys) {
        const num = f.match(/^number\((.+)\)$/);
        let va = num ? +fieldVal(a, num[1]) : fieldVal(a, f);
        let vb = num ? +fieldVal(b, num[1]) : fieldVal(b, f);
        if (f === 'номер') { va = +va; vb = +vb; }
        let c = typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va ?? '').localeCompare(String(vb ?? ''), 'ru');
        if (c) return desc ? -c : c;
      }
      return 0;
    });
  }
  const fields = fieldsRaw.trim() ? fieldsRaw.split(',').map((f) => { const a = f.trim().match(/^(.+?)(?: AS "([^"]+)")?$/); return { f: a[1].trim(), label: a[2] || a[1].trim() }; }) : [];
  if (kind.toUpperCase() === 'LIST') return { t: 'list', items: rows.map((n) => ({ indent: 0, ordered: false, text: `[[${n.title}]]` })) };
  if (group) {
    const g = new Map();
    for (const n of rows) { const k = stripMd(n.fm[group.trim()] || '') || 'Без клана'; (g.get(k) || g.set(k, []).get(k)).push(n); }
    return { t: 'table', head: [group.trim(), fields[0]?.label || 'Заметки'], rows: [...g].map(([k, ns]) => [k, ns.map((n) => `[[${n.title}]]`).join(', ')]) };
  }
  const head = (withoutId ? [] : ['Заметка']).concat(fields.map((f) => f.label));
  const out = rows.map((n) => (withoutId ? [] : [`[[${n.title}]]`]).concat(fields.map((f) => {
    const v = fieldVal(n, f.f); return Array.isArray(v) ? v.join(', ') : String(v ?? '—');
  })));
  return { t: 'table', head, rows: out };
}

// ───────────────────────── блоки → HTML ─────────────────────────
const NONCANON_INLINE = /^\s*💡|додуман|не канон|не из книги|только заметки Алекса/i;
async function renderBlocks(n) {
  const ctx = { links: new Set(), note: n };
  const html = []; const toc = []; const gallery = [];
  let prevH = '';
  const ids = new Set();
  for (const b of n.blocks) {
    if (b.t === 'h') {
      const level = Math.min(Math.max(b.level, 2), 4);
      let id = slugify(stripMd(b.text)); let k = 2; while (ids.has(id)) id = `${slugify(stripMd(b.text))}-${k++}`; ids.add(id);
      if (level <= 3) toc.push({ id, text: stripMd(b.text), level });
      html.push(`<h${level} id="${id}">${renderInline(b.text, ctx)}</h${level}>`);
      prevH = stripMd(b.text); continue;
    }
    if (b.t === 'p') {
      const inner = b.lines.map((l) => renderInline(l, ctx)).join('<br>');
      const nc = NONCANON_INLINE.test(b.lines.join(' ')) && n.fm['статус'] === 'канон';
      html.push(nc ? `<p class="lp-noncanon-inline"><span class="lp-pill lp-pill-idea">Не канон</span> ${inner}</p>` : `<p>${inner}</p>`);
      continue;
    }
    if (b.t === 'quote') { html.push(`<blockquote>${b.lines.map((l) => renderInline(l, ctx)).join('<br>')}</blockquote>`); continue; }
    if (b.t === 'callout') {
      html.push(`<aside class="lp-callout lp-callout-${esc(b.kind)}">${b.title ? `<div class="lp-callout-title">${renderInline(b.title, ctx)}</div>` : ''}${b.lines.length ? `<div>${b.lines.map((l) => renderInline(l, ctx)).join('<br>')}</div>` : ''}</aside>`);
      continue;
    }
    if (b.t === 'list') {
      const cls = /^Появления/.test(prevH) ? ' class="lp-chips"' : '';
      html.push(renderList(b.items, ctx, cls)); continue;
    }
    if (b.t === 'table') { html.push(renderTable(b, ctx)); continue; }
    if (b.t === 'hr') { html.push('<div class="lp-hr" aria-hidden="true">✦ ⚜ ✦</div>'); continue; }
    if (b.t === 'img') { const im = await useImage(b.file, n, b.caption); if (im) gallery.push({ ...im, caption: b.caption, notes: undefined }); continue; }
    if (b.t === 'code') {
      if (b.lang === 'dataview') {
        const r = runDataview(b.text, n);
        if (r) { const rb = redactBlocks([r], { total: 0, removed: 0 })[0]; if (rb) html.push(rb.t === 'table' ? renderTable(rb, ctx, true) : renderList(rb.items, ctx, ' class="lp-dv-list"')); }
        continue;
      }
      html.push(`<pre><code>${esc(b.text)}</code></pre>`); continue;
    }
  }
  return { html: html.join('\n'), toc, gallery, links: ctx.links };
}
function renderList(items, ctx, cls = '') {
  // вложенность по отступам
  let out = ''; const stack = [];
  for (const it of items) {
    const tag = it.ordered ? 'ol' : 'ul';
    while (stack.length && it.indent < stack[stack.length - 1].indent) { out += `</li></${stack.pop().tag}>`; }
    if (!stack.length || it.indent > stack[stack.length - 1].indent) {
      // нумерация сквозная по заметке (как в исходнике), но без «дыр» от вычеркнутых пунктов
      const start = it.ordered && !stack.length && ctx ? (ctx.ol = ctx.ol || 0) + 1 : 1;
      out += `<${tag}${stack.length ? '' : cls}${start > 1 ? ` start="${start}"` : ''}>`; stack.push({ indent: it.indent, tag });
    } else out += '</li>';
    const nc = NONCANON_INLINE.test(it.text) ? ' class="lp-noncanon-li"' : '';
    if (it.ordered && stack.length === 1 && ctx) ctx.ol = (ctx.ol || 0) + 1;
    out += `<li${nc}>${renderInline(it.text, ctx)}`;
  }
  while (stack.length) out += `</li></${stack.pop().tag}>`;
  return out;
}
function renderTable(b, ctx, dv = false) {
  return `<div class="lp-table-wrap"><table class="lp-table${dv ? ' lp-dv' : ''}"><thead><tr>${b.head.map((h) => `<th>${renderInline(h, ctx)}</th>`).join('')}</tr></thead><tbody>${b.rows.map((r) => `<tr>${r.map((c) => `<td>${renderInline(c, ctx)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
}

// ───────────────────────── сборка статей ─────────────────────────
const STATUS = {
  'канон': { key: 'canon', label: 'Канон', icon: '✅' },
  'идея': { key: 'idea', label: 'Не канон · идея', icon: '💡' },
  'додумано': { key: 'idea', label: 'Не канон · додумано', icon: '💡' },
  'спорно': { key: 'disputed', label: 'Спорно', icon: '⚠️' },
  'справка': { key: 'ref', label: 'Справка', icon: '📎' },
};
const FIELD_LABELS = [
  ['type', 'Тип'], ['клан', 'Клан'], ['роль', 'Роль'], ['номер', 'Порядок'], ['история', 'Часть'],
  ['рассказчик', 'Рассказчик'], ['когда', 'Когда'], // «источник» не публикуется (решение Алекса 29.10)
];
const cap = (s) => String(s).charAt(0).toUpperCase() + String(s).slice(1);

const articles = [];
for (const n of published) {
  const r = await renderBlocks(n);
  const ctx = { links: r.links, note: n };
  const st = STATUS[n.fm['статус']] || STATUS['канон'];
  const invented = /додумано/i.test(n.body) && st.key === 'canon';
  const fields = [];
  for (const [k, label] of FIELD_LABELS) {
    const v = n.fm[k];
    if (v == null || v === '' || v === '—' || v === '-' || (Array.isArray(v) && !v.length)) continue;
    const text = Array.isArray(v) ? v.join(', ') : k === 'type' ? cap(v) : k === 'номер' ? `№${v}` : String(v);
    fields.push({ label, html: renderInline(text, ctx) });
  }
  const aliases = [].concat(n.fm.aliases || []).filter(Boolean);
  const tags = [].concat(n.fm.tags || []).filter(Boolean);
  const cat = CATEGORIES.find((c) => c.folder === n.folder);
  // выдержка для карточек/описания: первый абзац
  const firstP = n.blocks.find((b) => b.t === 'p');
  const excerpt = firstP ? stripMd(firstP.lines.join(' ')).replace(/\s+/g, ' ').slice(0, 220) : '';
  articles.push({
    slug: n.slug, title: n.title, cat: cat.slug, type: n.fm.type || '', status: st.key, statusLabel: st.label, statusIcon: st.icon,
    invented, aliases, tags, fields, image: r.gallery[0] || null, gallery: r.gallery, html: r.html, toc: r.toc,
    excerpt, links: [...r.links].filter((s) => s !== n.slug), backlinks: [], clan: /^[—-]?$/.test(stripMd(n.fm['клан'] || '')) ? '' : stripMd(n.fm['клан']),
    role: n.fm['роль'] || '', when: n.fm['когда'] || '', order: n.fm['номер'] ? +n.fm['номер'] : null,
    redacted: !!n.redaction,
  });
}
const bySlug = new Map(articles.map((a) => [a.slug, a]));
for (const a of articles) for (const t of a.links) bySlug.get(t)?.backlinks.includes(a.slug) || bySlug.get(t)?.backlinks.push(a.slug);
for (const a of articles) a.backlinks.sort((x, y) => bySlug.get(x).title.localeCompare(bySlug.get(y).title, 'ru'));
articles.sort((a, b) => a.title.localeCompare(b.title, 'ru'));

// ───────────────────────── хронология ─────────────────────────
const chrono = published.find((n) => n.fm.type === 'хронология');
const timeline = [];
if (chrono) {
  let era = null;
  const ctx = { links: new Set(), note: chrono };
  for (const b of chrono.blocks) {
    if (b.t === 'h' && b.level === 2) { era = { title: stripMd(b.text), items: [] }; timeline.push(era); continue; }
    if (b.t === 'list' && era) for (const it of b.items) {
      era.items.push({ html: renderInline(it.text.replace(/^⚠️\s*/, ''), ctx), disputed: /⚠️|спорно/i.test(it.text) });
    }
  }
}
const events = articles.filter((a) => a.cat === 'sobytiya').map((a) => ({ slug: a.slug, title: a.title, when: a.when, status: a.status, statusLabel: a.statusLabel }));

// ───────────────────────── граф связей ─────────────────────────
// Простой силовой расклад (детерминированный), координаты в 0..1000 × 0..700.
function layoutGraph() {
  const nodes = articles.map((a, i) => ({ slug: a.slug, title: a.title, cat: a.cat, x: 500 + 300 * Math.cos(i * 2.39996), y: 350 + 220 * Math.sin(i * 2.39996), deg: 0 }));
  const idx = new Map(nodes.map((n, i) => [n.slug, i]));
  const edges = []; const seen = new Set();
  for (const a of articles) for (const t of a.links) {
    if (!idx.has(t)) continue; const k = [a.slug, t].sort().join('|'); if (seen.has(k)) continue; seen.add(k);
    edges.push([idx.get(a.slug), idx.get(t)]); nodes[idx.get(a.slug)].deg++; nodes[idx.get(t)].deg++;
  }
  const W = 1000, H = 700, area = W * H, kk = Math.sqrt(area / nodes.length) * 0.75;
  let temp = 80;
  for (let it = 0; it < 400; it++) {
    const disp = nodes.map(() => ({ x: 0, y: 0 }));
    for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) {
      let dx = nodes[i].x - nodes[j].x, dy = nodes[i].y - nodes[j].y; let d = Math.hypot(dx, dy) || 0.01;
      const f = (kk * kk) / d; dx /= d; dy /= d;
      disp[i].x += dx * f; disp[i].y += dy * f; disp[j].x -= dx * f; disp[j].y -= dy * f;
    }
    for (const [i, j] of edges) {
      let dx = nodes[i].x - nodes[j].x, dy = nodes[i].y - nodes[j].y; const d = Math.hypot(dx, dy) || 0.01;
      const f = (d * d) / kk; dx /= d; dy /= d;
      disp[i].x -= dx * f; disp[i].y -= dy * f; disp[j].x += dx * f; disp[j].y += dy * f;
    }
    for (let i = 0; i < nodes.length; i++) {
      // притяжение к центру, чтобы одиночки не улетали
      disp[i].x += (W / 2 - nodes[i].x) * 0.02 * kk / 10; disp[i].y += (H / 2 - nodes[i].y) * 0.02 * kk / 10;
      const d = Math.hypot(disp[i].x, disp[i].y) || 1; const m = Math.min(d, temp);
      nodes[i].x += (disp[i].x / d) * m; nodes[i].y += (disp[i].y / d) * m;
    }
    temp = Math.max(1, temp * 0.985);
  }
  const xs = nodes.map((n) => n.x), ys = nodes.map((n) => n.y);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  for (const n of nodes) { n.x = Math.round(40 + ((n.x - x0) / (x1 - x0 || 1)) * (W - 80)); n.y = Math.round(30 + ((n.y - y0) / (y1 - y0 || 1)) * (H - 60)); }
  return { w: W, h: H, nodes, edges };
}
const graph = layoutGraph();

// ───────────────────────── теги, категории, главная ─────────────────────────
const tagMap = new Map();
for (const a of articles) for (const t of a.tags) (tagMap.get(t) || tagMap.set(t, []).get(t)).push(a.slug);
const tags = [...tagMap].map(([name, slugs]) => ({ name, slug: slugify(name), slugs })).sort((a, b) => b.slugs.length - a.slugs.length || a.name.localeCompare(b.name, 'ru'));
const categories = CATEGORIES.map((c) => ({ ...c, name: c.folder, count: articles.filter((a) => a.cat === c.slug).length })).filter((c) => c.count);

// персонажи по кланам (замена Dataview с главной Obsidian)
const clanGroups = new Map();
for (const a of articles.filter((x) => x.cat === 'personazhi')) {
  const k = a.clan || 'Без клана'; (clanGroups.get(k) || clanGroups.set(k, []).get(k)).push(a.slug);
}
const clans = [...clanGroups].map(([name, slugs]) => ({ name, slug: bySlug.has(slugify(name)) ? slugify(name) : null, slugs }))
  .sort((a, b) => (a.name === 'Без клана') - (b.name === 'Без клана') || b.slugs.length - a.slugs.length);
const chapters = articles.filter((a) => a.cat === 'glavy' && a.order != null).sort((a, b) => a.order - b.order).map((a) => a.slug);

const data = {
  generatedAt: new Date().toISOString(),
  stats: { articles: articles.length, images: images.size, links: graph.edges.length },
  categories, tags, clans, chapters, timeline, events, graph,
  images: [...images.values()].map(({ notes, ...im }) => ({ ...im, notes })),
  articles,
};
fs.mkdirSync(path.dirname(OUT_DATA), { recursive: true });
fs.writeFileSync(OUT_DATA, JSON.stringify(data));
const search = articles.map((a) => ({ s: a.slug, t: a.title, a: a.aliases, g: a.tags, c: a.cat, st: a.status, e: a.excerpt.slice(0, 140), i: a.image?.thumb || null }));
fs.writeFileSync(path.join(OUT_PUBLIC, 'search.json'), JSON.stringify(search));

// Финальная проверка: в публичных файлах не должно остаться скрытых тем.
const leak = [];
const scan = (p, txt) => { const m = txt.match(new RegExp(HIDDEN_TERMS.source, 'giu')); if (m) leak.push(`${p}: ${[...new Set(m)].join(', ')}`); };
scan(OUT_DATA, fs.readFileSync(OUT_DATA, 'utf8'));
scan('search.json', fs.readFileSync(path.join(OUT_PUBLIC, 'search.json'), 'utf8'));
for (const f of fs.readdirSync(OUT_IMG)) scan(f, f);

report.brokenLinks = Object.fromEntries(Object.entries(report.brokenLinks).map(([k, v]) => [k, [...v]]));
report.stats = data.stats; report.leaks = leak;
if (REPORT_PATH) { fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true }); fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2)); }
console.log(`Лоропедия: ${articles.length} статей, ${images.size} картинок, ${graph.edges.length} связей; снято ${report.excludedNotes.length}, вычеркнуто в ${report.redactedNotes.length}; битых ссылок ${Object.keys(report.brokenLinks).length}.`);
if (REPORT_PATH) console.log(`Отчёт (не публикуется): ${REPORT_PATH}`);
if (leak.length) { console.error('ОШИБКА: скрытые темы в публичных файлах:\n' + leak.join('\n')); process.exit(1); }
