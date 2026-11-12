#!/usr/bin/env node
// Накат пакета Лоропедии 12.11.2026 поверх уже собранных data.json / expanded.json.
// Хранилище 07.11 в репозитории не лежит: обновлённые заметки пакета — полная замена,
// новые добавляются, картинки прежних статей не пересобираются.
// Запуск: node tools/loropedia/apply-update.mjs /path/to/package
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  HIDDEN_TERMS, EXCLUDE_NOTES, MIN_KEEP_RATIO, HEADING_RENAMES, TEXT_REPLACEMENTS,
  KEEP_ALWAYS_TYPES, CATEGORIES,
} from './config.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const PACK = path.resolve(process.argv[2] || '/tmp/loropedia-update');
const VAULT = path.join(PACK, 'vault');
const GUESS_H = 'Предположения Историка — не канон';
const AUTHOR_H = 'Авторские мысли Алекс';
const BASE = '/loropedia';
const hidden = (s) => HIDDEN_TERMS.test(String(s ?? ''));
const TR = { а:'a',б:'b',в:'v',г:'g',д:'d',е:'e',ё:'yo',ж:'zh',з:'z',и:'i',й:'y',к:'k',л:'l',м:'m',н:'n',о:'o',п:'p',р:'r',с:'s',т:'t',у:'u',ф:'f',х:'kh',ц:'ts',ч:'ch',ш:'sh',щ:'shch',ъ:'',ы:'y',ь:'',э:'e',ю:'yu',я:'ya' };
function slugify(s) {
  return String(s).toLowerCase().split('').map((c) => (c in TR ? TR[c] : c)).join('').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'x';
}
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const stripMd = (s) => String(s)
  .replace(/!\[\[[^\]]*\]\]/g, '')
  .replace(/\[\[([^\]|#]*)(?:#[^\]|]*)?(?:\|([^\]]*))?\]\]/g, (_, t, d) => d || t)
  .replace(/\*\*|__|`/g, '').replace(/(^|[^*])\*([^*]+)\*/g, '$1$2').trim();
function sanitizeInternal(s) {
  return String(s)
    .replace(/\s*\((?:по\s+)?[\w–.-]+\.(?:md|txt|fb2)\)/g, '')
    .replace(/по\s+[\w–.-]+\.(?:md|txt)/g, 'по замыслу Алекса')
    .replace(/\bв\s+[\w–.-]+\.(?:md|txt)/g, 'в заметках Алекса')
    .replace(/[\w–.-]+\.(?:md|txt)(?:\s*\(Алекс\))?/g, 'заметки Алекса')
    .replace(/\s*=\s*(?:свежий\s+)?(?:fb2|v8d)\b/g, '')
    .replace(/\(\s*\)/g, '');
}
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
function walk(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith('.')) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p)); else if (e.name.endsWith('.md')) out.push(p);
  }
  return out;
}
const isListLine = (l) => /^\s*(?:[-*+]|\d+[a-z]?\.)\s+/.test(l);
function parseBlocks(body) {
  const lines = body.replace(/\r/g, '').split('\n');
  const blocks = []; let i = 0;
  const isStart = (l) => /^(#{1,6}\s|>|```|\||---+\s*$|!\[\[)/.test(l) || isListLine(l);
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
      const co = buf[0].match(/^\[!(\w+)\][-+]?\s*(.*)$/);
      if (co) blocks.push({ t: 'callout', kind: co[1].toLowerCase(), title: co[2], lines: buf.slice(1) });
      else blocks.push({ t: 'quote', lines: buf });
      continue;
    }
    const img = l.match(/^!\[\[([^\]|]+)(?:\|[^\]]*)?\]\]\s*$/);
    if (img) { i++; if (i < lines.length && /^\*[^*].*\*\s*$/.test(lines[i])) i++; blocks.push({ t: 'img', file: img[1].trim() }); continue; }
    if (l.startsWith('|')) {
      const rows = [];
      while (i < lines.length && lines[i].startsWith('|')) rows.push(lines[i++]);
      const cells = (r) => r.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
      const head = cells(rows[0]);
      const bodyRows = rows.slice(1).filter((r) => !/^\|[\s:|-]+\|?$/.test(r.trim())).map(cells);
      blocks.push({ t: 'table', head, rows: bodyRows }); continue;
    }
    if (isListLine(l)) {
      const items = [];
      while (i < lines.length && (isListLine(lines[i]) || (/^—\s+\S/.test(lines[i]) && items.length) || (/^\s{2,}\S/.test(lines[i]) && items.length))) {
        const m = lines[i].match(/^(\s*)(?:([-*+])|(\d+[a-z]?)\.)\s+(.*)$/);
        const dash = lines[i].match(/^—\s+(.*)$/);
        if (m) items.push({ indent: m[1].replace(/\t/g, '  ').length, ordered: !!m[3], text: m[4] });
        else if (dash) items.push({ indent: 0, ordered: false, text: dash[1] });
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
function splitSentences(text) {
  const out = []; let cur = ''; let depth = 0; let link = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i]; cur += c;
    if (c === '[' && text[i + 1] === '[') link++;
    if (c === ']' && text[i + 1] === ']') link = Math.max(0, link - 1);
    if (c === '«') depth++;
    if (c === '»') depth = Math.max(0, depth - 1);
    if (!link && !depth && /[.!?…]/.test(c) && /\s/.test(text[i + 1] || '')) {
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
const STATUS_CALLOUT = /Канон \(есть|Справочная заметка|Спорно|Идея Алекса — НЕ канон|ждёт подтверждения|Гипотезы Историка/;
function redactBlocks(blocks, stat) {
  const out = [];
  const count = (s) => { stat.total += stripMd(s).length; };
  for (const b0 of blocks) {
    const b = structuredClone(b0);
    if (b.t === 'h') {
      if (HEADING_RENAMES[b.text]) b.text = HEADING_RENAMES[b.text];
      if (hidden(b.text)) { stat.removed += b.text.length; continue; }
      out.push(b); continue;
    }
    if (b.t === 'p' || b.t === 'quote') {
      b.lines = b.lines.map((l) => { count(l); return redactText(l, stat); }).filter((l) => stripMd(l).length > 0);
      if (b.lines.length) out.push(b);
      continue;
    }
    if (b.t === 'callout') {
      if (b.kind === 'info') continue;
      count(b.title); b.title = redactText(b.title, stat);
      b.lines = b.lines.map((l) => { count(l); return redactText(l, stat); }).filter((l) => l.trim());
      if ((b.title || b.lines.length) && !hidden(b.title)) out.push(b);
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
    if (b.t === 'img') { if (!hidden(b.file)) out.push(b); continue; }
    out.push(b);
  }
  const clean = [];
  for (let k = 0; k < out.length; k++) {
    const b = out[k];
    if (b.t === 'h') {
      const next = out[k + 1];
      if (!next || (next.t === 'h' && next.level <= b.level) || next.t === 'hr') continue;
    }
    clean.push(b);
  }
  return clean;
}

const manifest = JSON.parse(fs.readFileSync(path.join(PACK, 'manifest.json'), 'utf8'));
const byFile = new Map(manifest.articles.map((a) => [a.file.replace(/^vault\//, ''), a]));
const layer = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/loropedia/books/darg-sirrom.json'), 'utf8'));
const dargOwned = new Set(Object.entries(layer.appends || {}).filter(([, h]) => /lp-ds-block/.test(h)).map(([s]) => s));
const layerSlugs = new Set((layer.articles || []).map((a) => a.slug));

const publicData = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/loropedia/data.json'), 'utf8'));
const expanded = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/loropedia/expanded.json'), 'utf8'));
const keyOf = (s) => String(s).trim().toLowerCase().replace(/ё/g, 'е');

const notes = [];
for (const file of walk(VAULT)) {
  const rel = path.relative(VAULT, file);
  const folder = rel.includes(path.sep) ? rel.split(path.sep)[0] : '';
  const title = path.basename(file, '.md');
  const meta = byFile.get(rel);
  const { fm, body } = parseFrontmatter(fs.readFileSync(file, 'utf8'));
  const n = { file, rel, folder, title, fm, body, meta };
  if (!meta) n.excluded = 'нет в manifest.json';
  else if (EXCLUDE_NOTES.includes(title)) n.excluded = 'служебная заметка';
  else if (meta.slug_status && /каталоге сайта нет/.test(meta.slug_status) && meta.slug !== 'predpolozheniya-istorika') n.excluded = 'служебная страница vault';
  else if (hidden(title) || hidden(meta.slug)) n.excluded = 'скрытая тема в названии';
  else if (!CATEGORIES.some((c) => c.folder === folder)) n.excluded = 'вне разделов';
  else n.slug = meta.slug;
  notes.push(n);
}
const byKey = new Map();
for (const a of publicData.articles) {
  byKey.set(keyOf(a.title), { slug: a.slug, title: a.title, excluded: false });
  for (const al of a.aliases || []) if (!byKey.has(keyOf(al))) byKey.set(keyOf(al), { slug: a.slug, title: a.title, excluded: false });
}
for (const a of layer.articles || []) {
  const rec = { slug: a.slug, title: a.title, excluded: false };
  if (!byKey.has(keyOf(a.title))) byKey.set(keyOf(a.title), rec);
  for (const al of a.aliases || []) if (!byKey.has(keyOf(al))) byKey.set(keyOf(al), rec);
}
const publicSlugs = new Set(publicData.articles.map((a) => a.slug));
for (const a of expanded.articles) {
  if (publicSlugs.has(a.slug)) continue;
  const rec = { slug: a.slug, title: a.title, excluded: true };
  if (!byKey.has(keyOf(a.title))) byKey.set(keyOf(a.title), rec);
  for (const al of a.aliases || []) if (!byKey.has(keyOf(al))) byKey.set(keyOf(al), rec);
}
for (const n of notes) {
  const rec = { slug: n.slug, title: n.title, excluded: !!n.excluded, note: n };
  if (!n.excluded) byKey.set(keyOf(n.title), rec);
  else if (!byKey.has(keyOf(n.title))) byKey.set(keyOf(n.title), rec);
  for (const al of [].concat(n.fm.aliases || [])) {
    const k = keyOf(al);
    if (!byKey.has(k)) byKey.set(k, rec);
  }
}

const report = { excluded: [], redacted: [], thinKept: [], broken: {}, published: [] };
for (const n of notes) {
  if (n.excluded) { report.excluded.push({ slug: n.meta?.slug, note: n.rel, reason: n.excluded }); continue; }
  let body = sanitizeInternal(n.body);
  body = body.replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, (m, t, d) => (hidden(t) && !hidden(d) ? d : m));
  for (const [re, to] of TEXT_REPLACEMENTS) body = body.replace(re, to);
  let blocks = parseBlocks(body);
  const h1 = blocks.findIndex((b) => b.t === 'h' && b.level === 1);
  if (h1 >= 0 && stripMd(blocks[h1].text) === n.title) blocks.splice(h1, 1);
  const stat = { total: 0, removed: 0 };
  const coreIdx = blocks.findIndex((b) => b.t === 'h' && /^Появления/.test(b.text));
  const statCore = { total: 0, removed: 0 };
  redactBlocks(coreIdx >= 0 ? blocks.slice(0, coreIdx) : blocks, statCore);
  n.blocks = redactBlocks(blocks, stat);
  if (stat.removed > 0) {
    const keep = statCore.total ? 1 - statCore.removed / statCore.total : 1;
    n.redaction = { removedChars: stat.removed, keepRatio: Math.round(keep * 100) / 100 };
    report.redacted.push({ slug: n.slug, ...n.redaction });
    if (keep < MIN_KEEP_RATIO && !(KEEP_ALWAYS_TYPES.includes(n.fm.type) && keep > 0)) {
      n.excluded = `после вычёркивания осталось ${Math.round(keep * 100)}%`;
      report.excluded.push({ slug: n.slug, note: n.rel, reason: n.excluded });
    }
  }
  for (const k of Object.keys(n.fm)) {
    const v = n.fm[k];
    if (Array.isArray(v)) n.fm[k] = v.filter((x) => !hidden(x));
    else if (v != null && hidden(sanitizeInternal(String(v)))) n.fm[k] = undefined;
    else if (typeof v === 'string') n.fm[k] = sanitizeInternal(v);
  }
}

function resolve(target) {
  return byKey.get(keyOf(target)) || null;
}
function renderInline(text, ctx) {
  const ph = [];
  const hold = (html) => `\u0000${ph.push(html) - 1}\u0000`;
  let s = String(text);
  s = s.replace(/!\[\[[^\]]*\]\]/g, '');
  s = s.replace(/\[\[([^\]|#]*)(#[^\]|]*)?(?:\|([^\]]*))?\]\]/g, (_, target, hash, disp) => {
    const label = (disp || target).trim();
    if (hidden(label) || hidden(target)) return '';
    const n = resolve(target);
    if (n && !n.excluded && n.slug && !hidden(n.slug)) {
      ctx?.links?.add(n.slug);
      const anchor = hash ? '#' + slugify(hash.slice(1)) : '';
      return hold(`<a class="lp-link" href="${BASE}/${n.slug}${anchor}">${esc(label)}</a>`);
    }
    if (n && n.excluded) return hold(esc(label));
    if (ctx?.note) (report.broken[target.trim()] ||= new Set()).add(ctx.note.slug);
    return hold(`<span class="lp-missing">${esc(label)}</span>`);
  });
  s = s.replace(/`([^`]+)`/g, (_, c) => hold(`<code>${esc(c)}</code>`));
  s = esc(s);
  s = s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/(^|[^*\w])\*([^*\s][^*]*?)\*(?![*\w])/g, '$1<em>$2</em>');
  s = s.replace(/(^|[\s(«])_([^_]+)_(?=[\s.,;:!?)»]|$)/g, '$1<em>$2</em>');
  s = s.replace(/\u0000(\d+)\u0000/g, (_, k) => ph[+k]);
  return s;
}
const OB_LET = { 'и1.1': 2, 'и1.2': 3, 'и1.3': 4, 'и1.4': 5, 'и1.5': 6, 'и1.6': 7, 'и1.7': 8, 'гл. 1': 9, 'гл.1': 9, 'гл. 2': 10, 'гл.2': 10, 'гл. 3': 11, 'гл.3': 11, 'гл. 4': 12, 'гл.4': 12, 'гл. 5': 13, 'гл.5': 13, 'и2.1': 14, 'и2.2': 15, 'и2.3': 16, 'и2.4': 17, 'и2.5': 18, 'и2.6': 19, 'и2.7': 20, 'и2.8': 21, 'и2.9': 22 };
function spoilerMeta(title) {
  const raw = stripMd(title).replace(/^🔒\s*/, '').replace(/\s+/g, ' ').trim();
  const low = raw.toLowerCase().replace(/ё/g, 'е');
  let book = 'book:chernaya-korona';
  if (/черн(ая|ой) корон/.test(low)) book = 'book:chernaya-korona';
  else if (/дарг сирром/.test(low)) book = 'book:darg-sirrom';
  else if (/праведн/.test(low)) book = 'book:pravednye-koty';
  else if (/\bkill\b/.test(low)) book = 'book:kill';
  else if (/летопис|обитель смерти/.test(low)) book = 'book:obitel-smerti';
  if (/будущ/.test(low)) return { book, ch: 99, what: raw };
  let ch = null;
  const g = low.match(/гл\.?\s*(\d+)/);
  if (g && !/и\d/.test(low.slice(Math.max(0, (g.index || 0) - 2)))) ch = +g[1];
  if (ch == null && /последнее зеркало/.test(low)) ch = 66;
  else if (ch == null && /эпилог/.test(low)) ch = book === 'book:chernaya-korona' ? 65 : 22;
  else if (ch == null && /пролог/.test(low)) ch = book === 'book:chernaya-korona' ? 0 : 1;
  if (ch == null && book === 'book:obitel-smerti') {
    let best = 0;
    for (const [k, v] of Object.entries(OB_LET)) if (low.includes(k)) best = Math.max(best, v);
    ch = best || 22;
  }
  if (ch == null && /гл|пролог|эпилог|последнее|и\d\.\d/.test(low)) ch = book === 'book:darg-sirrom' ? 1 : 1;
  if (ch == null) ch = 99;
  return { book, ch, what: raw };
}
function renderList(items, ctx, cls = '') {
  let out = ''; const stack = [];
  for (const it of items) {
    if (/^⏳/.test(it.text.trim())) {
      while (stack.length) out += `</li></${stack.pop().tag}>`;
      const inner = renderInline(it.text.replace(/^⏳\s*/, ''), ctx);
      out += `<details class="lp-shutter lp-pending" data-spoiler-ch="99"><summary data-tip="Это не канон: пункт ещё не подтверждён и не входит в текст как факт. Нажмите, чтобы открыть."><span class="lp-pill lp-pill-idea">не канон</span> Ждёт решения, не факт книги <span class="lp-shutter-hint">открыть</span></summary><div class="lp-shutter-body"><p>${inner}</p></div></details>`;
      continue;
    }
    const tag = it.ordered ? 'ol' : 'ul';
    while (stack.length && it.indent < stack[stack.length - 1].indent) out += `</li></${stack.pop().tag}>`;
    if (!stack.length || it.indent > stack[stack.length - 1].indent) {
      out += `<${tag}${stack.length ? '' : cls}>`; stack.push({ indent: it.indent, tag });
    } else out += '</li>';
    out += `<li>${renderInline(it.text, ctx)}`;
  }
  while (stack.length) out += `</li></${stack.pop().tag}>`;
  return out;
}
function renderTable(b, ctx) {
  return `<div class="lp-table-wrap"><table class="lp-table"><thead><tr>${b.head.map((h) => `<th>${renderInline(h, ctx)}</th>`).join('')}</tr></thead><tbody>${b.rows.map((r) => `<tr>${r.map((c) => `<td>${renderInline(c, ctx)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
}
function renderInner(blocks, ctx) {
  return blocks.map((b) => {
    if (b.t === 'p') return `<p>${b.lines.map((l) => renderInline(l, ctx)).join('<br>')}</p>`;
    if (b.t === 'quote') return `<blockquote>${b.lines.map((l) => renderInline(l, ctx)).join('<br>')}</blockquote>`;
    if (b.t === 'list') return renderList(b.items, ctx);
    if (b.t === 'table') return renderTable(b, ctx);
    if (b.t === 'callout') return renderCallout(b, ctx);
    if (b.t === 'h') return `<h3>${renderInline(b.text, ctx)}</h3>`;
    return '';
  }).join('\n');
}
function renderCallout(b, ctx) {
  if (b.kind === 'info' && STATUS_CALLOUT.test(b.title)) return '';
  const innerBlocks = parseBlocks(b.lines.join('\n'));
  const inner = renderInner(innerBlocks, ctx);
  if (b.kind === 'spoiler') {
    const meta = spoilerMeta(b.title);
    const labelLow = stripMd(b.title).toLowerCase().replace(/ё/g, 'е');
    if (ctx.note?.dropDarg && /дарг сирром/.test(labelLow) && !/черн/.test(labelLow)) return '';
    const tip = meta.ch === 99
      ? `Спойлер: ${meta.what}. Шторка сама не открывается. Нажмите, чтобы прочитать.`
      : `Спойлер: ${meta.what}. Нажмите, чтобы открыть. Откроется само, если в «Ходе чтения» отмечена эта глава.`;
    const cls = ctx.region === 'author' ? 'lp-shutter lp-author-item' : 'lp-shutter';
    return `<details class="${cls}" data-spoiler-book="${meta.book}" data-spoiler-ch="${meta.ch}"><summary data-tip="${esc(tip)}"><span class="lp-shutter-ico" aria-hidden="true">${meta.book === 'book:chernaya-korona' ? '♔' : '🜂'}</span> ${esc(meta.what)} <span class="lp-shutter-hint">открыть</span></summary><div class="lp-shutter-body">${inner}</div></details>`;
  }
  if (b.kind === 'question') {
    return `<details class="lp-shutter lp-pending" data-spoiler-ch="99"><summary data-tip="Это не канон. Пункт свёрнут, пока автор не подтвердит его. Нажмите, чтобы открыть."><span class="lp-pill lp-pill-idea">не канон</span> ${esc(stripMd(b.title) || 'Ждёт подтверждения')} <span class="lp-shutter-hint">открыть</span></summary><div class="lp-shutter-body">${inner}</div></details>`;
  }
  if (b.kind === 'warning' && ctx.region === 'guess') {
    return `${b.title ? `<p class="lp-ds-note">${renderInline(b.title, ctx)}</p>` : ''}${inner}`;
  }
  if (!inner && !b.title) return '';
  return `<aside class="lp-callout lp-callout-${esc(b.kind)}">${b.title ? `<div class="lp-callout-title">${renderInline(b.title, ctx)}</div>` : ''}${inner ? `<div>${inner}</div>` : ''}</aside>`;
}
function renderNote(n) {
  const ctx = { links: new Set(), note: n, region: 'body' };
  const html = []; const toc = []; const ids = new Set();
  let region = 'body';
  const close = () => {
    if (region === 'guess') html.push('</aside>');
    if (region === 'author') html.push('</section>');
    if (region === 'mention') html.push('</details>');
    region = 'body'; ctx.region = 'body';
  };
  for (const b of n.blocks) {
    if (b.t === 'h') {
      const plain = stripMd(b.text);
      if (plain === GUESS_H) {
        close();
        html.push(`<aside class="lp-guess" data-lp-guess="1"><p class="lp-guess-label" id="predpolozheniya-istorika-ne-kanon">${GUESS_H}</p>`);
        toc.push({ id: 'predpolozheniya-istorika-ne-kanon', text: GUESS_H, level: 2 });
        region = 'guess'; ctx.region = 'guess'; continue;
      }
      if (plain === AUTHOR_H) {
        close();
        html.push(`<section class="lp-author-thought" data-lp-author="1"><h2 id="avtorskie-mysli-aleks">${AUTHOR_H}</h2><p class="lp-ds-note">Не текст книги и не предположение Историка. Спрятано, пока читатель сам не откроет.</p>`);
        toc.push({ id: 'avtorskie-mysli-aleks', text: AUTHOR_H, level: 2 });
        region = 'author'; ctx.region = 'author'; continue;
      }
      if (/^Справочно:/.test(plain)) {
        close();
        html.push('<details class="lp-mentions"><summary data-tip="Служебный указатель упоминаний. Это не описание статьи. Нажмите, чтобы развернуть.">Справочно: где упоминается. Это указатель, не описание.</summary>');
        region = 'mention'; ctx.region = 'mention'; continue;
      }
      if (region !== 'body' && b.level <= 2) close();
      const level = Math.min(Math.max(b.level, 2), 4);
      let id = slugify(plain); let k = 2; while (ids.has(id)) id = `${slugify(plain)}-${k++}`; ids.add(id);
      if (level <= 3) toc.push({ id, text: plain, level });
      html.push(`<h${level} id="${id}">${renderInline(b.text, ctx)}</h${level}>`);
      continue;
    }
    if (b.t === 'img' || b.t === 'code') continue;
    if (b.t === 'p') {
      const plain = stripMd(b.lines.join(' '));
      if (region === 'author' && /^Не текст книги и не догадка Историка/.test(plain)) continue;
      const inner = b.lines.map((l) => renderInline(l, ctx)).join('<br>');
      if (inner.trim()) html.push(`<p>${inner}</p>`);
      continue;
    }
    if (b.t === 'quote') { html.push(`<blockquote>${b.lines.map((l) => renderInline(l, ctx)).join('<br>')}</blockquote>`); continue; }
    if (b.t === 'callout') { const h = renderCallout(b, ctx); if (h) html.push(h); continue; }
    if (b.t === 'list') { html.push(renderList(b.items, ctx, /^Появления/.test(toc.at(-1)?.text || '') ? ' class="lp-chips"' : '')); continue; }
    if (b.t === 'table') { html.push(renderTable(b, ctx)); continue; }
    if (b.t === 'hr') html.push('<div class="lp-hr" aria-hidden="true">✦ ⚜ ✦</div>');
  }
  close();
  const stop = n.blocks.findIndex((b) => b.t === 'h' && [GUESS_H, AUTHOR_H].includes(stripMd(b.text)) || (b.t === 'h' && /^Справочно:|^Появления/.test(stripMd(b.text))));
  const core = stop >= 0 ? n.blocks.slice(0, stop) : n.blocks;
  let excerpt = '';
  for (const b of core) {
    if (b.t !== 'p') continue;
    const text = stripMd(b.lines.join(' ')).replace(/\s+/g, ' ').trim();
    if (!text || hidden(text) || /Основание:|Ограничение:/.test(text)) continue;
    excerpt = text.slice(0, 220);
    break;
  }
  const bodyHtml = html.join('\n').replace(/<section class="lp-author-thought"[\s\S]*?<\/section>\n?/g, (m) => (m.includes('lp-author-item') ? m : ''));
  return { html: bodyHtml, toc, links: [...ctx.links].filter((s) => s !== n.slug && !hidden(s)), excerpt };
}

const STATUS = {
  'канон': { key: 'canon', label: 'Канон', icon: '✅' },
  'идея': { key: 'idea', label: 'Не канон · идея', icon: '💡' },
  'додумано': { key: 'idea', label: 'Не канон · додумано', icon: '💡' },
  'спорно': { key: 'disputed', label: 'Спорно', icon: '⚠️' },
  'справка': { key: 'ref', label: 'Справка', icon: '📎' },
  'теории': { key: 'idea', label: GUESS_H, icon: '💭' },
};
const cap = (s) => String(s).charAt(0).toUpperCase() + String(s).slice(1);
const crownBook = (n) => n.slug.startsWith('chk-') || n.fm.bookId === 'book:chernaya-korona' || n.fm.spoiler_book === 'book:chernaya-korona' || /чёрная_корона|черная_корона/.test([].concat(n.fm.tags || []).join(' '));

const rendered = [];
for (const n of notes) {
  if (n.excluded || !n.blocks) continue;
  if (layerSlugs.has(n.slug)) { report.excluded.push({ slug: n.slug, note: n.rel, reason: 'статью держит слой книги «Дарг Сирром»' }); continue; }
  n.dropDarg = dargOwned.has(n.slug);
  const r = renderNote(n);
  if (hidden(r.html) || hidden(r.excerpt) || hidden(n.title)) {
    report.excluded.push({ slug: n.slug, note: n.rel, reason: 'после рендера осталась скрытая тема' });
    continue;
  }
  const st = STATUS[n.fm['статус']] || STATUS['канон'];
  const historianGuess = n.slug === 'predpolozheniya-istorika' || n.slug === 'zhdyot-podtverzhdeniya-avtora' || n.fm['статус'] === 'теории';
  const canonBody = String(n.body).split('## ' + GUESS_H)[0];
  const invented = !historianGuess && /додумано/i.test(canonBody) && st.key === 'canon';
  const ctx = { links: new Set(r.links), note: n };
  const fields = [];
  const crown = crownBook(n);
  for (const [k, label] of [['type', 'Тип'], ['клан', 'Клан'], ['роль', 'Роль'], ['рассказчик', 'Рассказчик'], ['когда', 'Когда']]) {
    const v = n.fm[k];
    if (v == null || v === '' || v === '—' || (Array.isArray(v) && !v.length)) continue;
    const text = Array.isArray(v) ? v.join(', ') : k === 'type' ? cap(v) : String(v);
    if (hidden(stripMd(text))) continue;
    fields.push({ label, html: renderInline(text, ctx) });
  }
  if (crown && n.fm['номер'] != null && n.fm['номер'] !== '') fields.push({ label: 'Глава книги', html: `№${esc(n.fm['номер'])}` });
  const aliases = [].concat(n.fm.aliases || []).filter((x) => x && !hidden(x));
  const tags = [].concat(n.fm.tags || []).map((t) => String(t).replace(/_/g, ' ')).filter((t) => t && !hidden(t));
  const cat = CATEGORIES.find((c) => c.folder === n.folder);
  const books = new Set();
  if (n.fm.bookId) books.add(n.fm.bookId);
  if (n.fm.spoiler_book) books.add(n.fm.spoiler_book);
  if (crown) books.add('book:chernaya-korona');
  if (n.slug === 'letopis-obitel-smerti' || n.slug.startsWith('i1-') || n.slug.startsWith('i2-') || n.slug === 'prolog') books.add('book:obitel-smerti');
  const order = crown ? null : (n.fm['номер'] != null && n.fm['номер'] !== '' ? +n.fm['номер'] : null);
  rendered.push({
    slug: n.slug, title: n.meta.title || n.title, cat: cat.slug, type: n.fm.type || '', status: historianGuess ? 'idea' : st.key,
    statusLabel: historianGuess ? GUESS_H : st.label, statusIcon: historianGuess ? '💭' : st.icon,
    invented, historianGuess, aliases, tags, fields, html: r.html, toc: r.toc, excerpt: r.excerpt,
    links: [...new Set([...r.links, ...ctx.links])].filter((s) => s !== n.slug),
    clan: /^[—-]?$/.test(stripMd(n.fm['клан'] || '')) ? '' : stripMd(n.fm['клан'] || ''),
    role: stripMd(n.fm['роль'] || ''), when: n.fm['когда'] || '', order: Number.isFinite(order) ? order : null,
    redacted: !!n.redaction, books: [...books],
    publicOk: n.slug !== 'predpolozheniya-istorika',
    rel: n.rel,
  });
  report.published.push(n.slug);
}

function articleOf(row, old) {
  const a = {
    slug: row.slug, title: row.title, cat: row.cat, type: row.type, status: row.status, statusLabel: row.statusLabel, statusIcon: row.statusIcon,
    invented: row.invented, aliases: row.aliases, tags: row.tags, fields: row.fields,
    image: old?.image ?? null, gallery: old?.gallery ?? [], html: row.html, toc: row.toc, excerpt: row.excerpt,
    links: row.links, backlinks: [], clan: hidden(row.clan) ? '' : row.clan, role: row.role, when: row.when, order: row.order,
    redacted: row.redacted, books: row.books,
  };
  if (row.historianGuess) a.historianGuess = true;
  return a;
}
const filler = `<aside class="lp-guess" data-lp-guess="1"><p class="lp-guess-label" id="predpolozheniya-istorika-ne-kanon">${GUESS_H}</p><p>Отдельной гипотезы по этой статье Историк не записал.</p></aside>`;
function withGuess(html) {
  return html.includes('lp-guess-label') ? html : html + filler;
}

function mergeInto(data, { expandedMode }) {
  for (const slug of layerSlugs) {
    const i = data.articles.findIndex((a) => a.slug === slug);
    if (i >= 0) data.articles.splice(i, 1);
  }
  const by = new Map(data.articles.map((a) => [a.slug, a]));
  for (const row of rendered) {
    if (!expandedMode && !row.publicOk) continue;
    const old = by.get(row.slug);
    if (!old && row.slug && report.thinKept.find((x) => x.slug === row.slug)) continue;
    const a = articleOf(row, old);
    if (expandedMode) a.html = withGuess(a.html);
    if (old) {
      const i = data.articles.findIndex((x) => x.slug === row.slug);
      a.backlinks = old.backlinks;
      data.articles[i] = a;
    } else data.articles.push(a);
  }
  // тихая страница летописи — только если её ещё нет
  if (!by.has('letopis-kniga') && !data.articles.some((a) => a.slug === 'letopis-kniga')) {
    data.articles.push(letopisArticle(data, expandedMode));
  }
  const known = new Set(data.articles.map((a) => a.slug));
  for (const a of data.articles) a.links = [...new Set(a.links)].filter((s) => known.has(s) && s !== a.slug && !hidden(s));
  const map = new Map(data.articles.map((a) => [a.slug, a]));
  for (const a of data.articles) a.backlinks = [];
  for (const a of data.articles) for (const t of a.links) {
    const b = map.get(t); if (b && !b.backlinks.includes(a.slug)) b.backlinks.push(a.slug);
  }
  for (const a of data.articles) a.backlinks.sort((x, y) => map.get(x).title.localeCompare(map.get(y).title, 'ru'));
  data.articles.sort((a, b) => a.title.localeCompare(b.title, 'ru'));
  data.categories = CATEGORIES.map((c) => ({ ...c, name: c.folder, count: data.articles.filter((a) => a.cat === c.slug).length })).filter((c) => c.count);
  const tagMap = new Map();
  for (const a of data.articles) for (const t of a.tags) {
    if (!tagMap.has(t)) tagMap.set(t, []);
    tagMap.get(t).push(a.slug);
  }
  data.tags = [...tagMap].map(([name, slugs]) => ({ name, slug: slugify(name), slugs })).sort((a, b) => b.slugs.length - a.slugs.length || a.name.localeCompare(b.name, 'ru'));
  const clanGroups = new Map();
  for (const a of data.articles.filter((x) => x.cat === 'personazhi')) {
    const k = a.clan || 'Без клана'; if (hidden(k)) continue;
    (clanGroups.get(k) || clanGroups.set(k, []).get(k)).push(a.slug);
  }
  data.clans = [...clanGroups].map(([name, slugs]) => ({ name, slug: map.has(slugify(name)) ? slugify(name) : null, slugs }))
    .sort((a, b) => (a.name === 'Без клана') - (b.name === 'Без клана') || b.slugs.length - a.slugs.length);
  data.chapters = data.articles.filter((a) => a.cat === 'glavy' && a.order != null && !a.slug.startsWith('chk-')).sort((a, b) => a.order - b.order).map((a) => a.slug);
  data.events = data.articles.filter((a) => a.cat === 'sobytiya').map((a) => ({ slug: a.slug, title: a.title, when: a.when, status: a.status, statusLabel: a.statusLabel })).sort((a, b) => a.title.localeCompare(b.title, 'ru'));
  const chrono = rendered.find((r) => r.slug === 'khronologiya');
  const note = notes.find((n) => n.slug === 'khronologiya' && !n.excluded);
  if (chrono && note) {
    const timeline = []; let era = null;
    const ctx = { links: new Set(), note, region: 'body' };
    for (const b of note.blocks) {
      if (b.t === 'h' && stripMd(b.text) === GUESS_H) break;
      if (b.t === 'h' && b.level === 2) {
        const title = stripMd(b.text);
        if (hidden(title) || title.startsWith('«Чёрная корона»')) { era = null; continue; }
        era = { title, items: [] }; timeline.push(era); continue;
      }
      if (b.t === 'list' && era) for (const it of b.items) {
        if (hidden(it.text)) continue;
        const pending = /^⏳/.test(it.text.trim());
        const html = renderInline(it.text.replace(/^⚠️\s*/, '').replace(/^⏳\s*/, ''), ctx);
        if (!html || hidden(html)) continue;
        era.items.push({ html: pending ? `<span class="lp-pill lp-pill-idea">не канон</span> ${html}` : html, disputed: pending || /⚠️|спорно/i.test(it.text) });
      }
    }
    if (timeline.some((e) => e.items.length)) data.timeline = timeline.filter((e) => e.items.length);
  }
  data.stats = { ...data.stats, articles: data.articles.length, links: data.articles.reduce((s, a) => s + a.links.length, 0) };
  data.generatedAt = new Date().toISOString();
  if (Array.isArray(data.search)) {
    const rows = data.search.filter((r) => !hidden(r.t) && !hidden(r.e) && !hidden(r.s));
    const idx = new Map(rows.map((r) => [r.s, r]));
    for (const a of data.articles) {
      if (a.slug === 'i2-9-razbitaya-dusha') continue;
      const row = { s: a.slug, t: a.title, a: a.aliases, g: a.tags, c: a.cat, st: a.status, e: a.excerpt, i: a.image?.thumb ?? null };
      if (hidden(JSON.stringify(row))) continue;
      if (idx.has(a.slug)) Object.assign(idx.get(a.slug), row);
      else { rows.push(row); idx.set(a.slug, row); }
    }
    data.search = rows;
  }
  return data;
}

function letopisArticle(data, expandedMode) {
  const chapters = data.articles.filter((a) => data.chapters.includes(a.slug));
  const items = chapters.map((a) => `<li><a class="lp-link" href="${BASE}/${a.slug}">${esc(a.title)}</a></li>`).join('');
  const html = [
    '<p><strong>Летопись «Обитель смерти»</strong> — первая книга серии «Моррис Град: Ледяной клинок». Автор: Lorin Death. Рассказ ведут Лорин и, во второй истории, Мариэль.</p>',
    '<p>Ниже — главы, которые уже разобраны в Лоропедии, в порядке чтения. Это тихая страница книги: без отдельного оформления, чтобы флагман «Чёрная корона — Начало» читался иначе.</p>',
    '<h2 id="glavy">Главы</h2>',
    `<ol class="lp-list">${items}</ol>`,
    '<h2 id="v-knige">В файле книги</h2>',
    '<p>В книге есть ещё часть, для которой отдельной статьи пока нет: «История третья: Братный контракт. Часть 1: Двадцать четыре часа». Здесь только название из оглавления, без пересказа.</p>',
  ].join('');
  // fix typo Братный -> Брачный
  const fixed = html.replace('Братный', 'Брачный');
  const links = chapters.map((a) => a.slug);
  return {
    slug: 'letopis-kniga', title: 'Летопись «Обитель смерти» (книга)', cat: 'glavy', type: 'раздел', status: 'canon', statusLabel: 'Канон', statusIcon: '✅',
    invented: false, aliases: ['Обитель смерти (книга)', 'Ледяной клинок'], tags: ['книга', 'раздел'],
    fields: [{ label: 'Тип', html: 'Книга' }, { label: 'Серия', html: 'Моррис Град: Ледяной клинок' }, { label: 'Автор', html: 'Lorin Death' }],
    image: null, gallery: [], html: expandedMode ? withGuess(fixed) : fixed,
    toc: [{ id: 'glavy', text: 'Главы', level: 2 }, { id: 'v-knige', text: 'В файле книги', level: 2 }],
    excerpt: 'Первая книга серии «Моррис Град: Ледяной клинок». Главы летописи по порядку чтения, без пересказа закрытых сцен.',
    links, backlinks: [], clan: '', role: '', when: '', order: null, redacted: false, books: ['book:obitel-smerti'],
  };
}

// Опечатку исправляю до сборки — строка выше оставлена как страховка.
mergeInto(publicData, { expandedMode: false });
mergeInto(expanded, { expandedMode: true });

// повторная сборка страницы летописи уже внутри mergeInto на данных ДО добавления самой себя.
// Ссылки на главы снимаются с chapters, которые ещё не включают её. Это верно.

function sweep(data, name) {
  const bad = [];
  for (const a of data.articles) {
    const blob = [a.title, a.html, a.excerpt, ...(a.aliases || [])].join('\n');
    if (hidden(blob)) bad.push(a.slug);
  }
  if (data.search && hidden(JSON.stringify(data.search))) bad.push('search');
  if (bad.length) throw new Error(name + ' скрытая тема: ' + bad.slice(0, 12).join(', '));
}
sweep(publicData, 'public');
sweep(expanded, 'expanded');

const crownChapters = manifest.book.chapters.map((c) => {
  const pub = publicData.articles.find((a) => a.slug === c.slug);
  return { n: c.n, slug: pub ? c.slug : null, title: pub ? pub.title : `Глава ${c.n}`, published: !!pub };
});
const partDefs = [
  { slug: 'chk-chast-pervaya-pepel', title: 'Часть первая. Пепел', range: 'главы 1–5', from: 1, to: 5 },
  { slug: 'chk-chast-vtoraya-zerkala', title: 'Часть вторая. Зеркала', range: 'главы 6–13', from: 6, to: 13 },
  { slug: 'chk-chast-tretya-lordy-tmy', title: 'Часть третья. Лорды тьмы', range: 'главы 14–22', from: 14, to: 22 },
  { slug: 'chk-chast-chetvyortaya-kniga-v-biblioteke', title: 'Часть четвёртая. Книга в библиотеке', range: 'главы 23–32', from: 23, to: 32 },
  { slug: 'chk-chast-pyataya-ten-korony', title: 'Часть пятая. Тень короны', range: 'главы 33–40', from: 33, to: 40 },
  { slug: 'chk-chast-shestaya-oshibka-arinar', title: 'Часть шестая. Ошибка Аринар', range: 'главы 41–47', from: 41, to: 47 },
  { slug: 'chk-chast-sedmaya-den-poyavleniya', title: 'Часть седьмая. День Появления', range: 'главы 48–54', from: 48, to: 54 },
  { slug: 'chk-chast-vosmaya-sosud', title: 'Часть восьмая. Сосуд', range: 'главы 55–64', from: 55, to: 64 },
];
const bySlug = new Map(publicData.articles.map((a) => [a.slug, a]));
function blurb(slug, fallback) {
  const a = bySlug.get(slug);
  const t = a?.excerpt || fallback;
  return hidden(t) ? fallback : t;
}
const pro = bySlug.get('chk-00-prolog-noch-fioletovoy-luny');
const shutter = pro?.html.match(/<details class="lp-shutter"[\s\S]*?<\/details>/)?.[0] || '';
const crown = {
  series: 'Моррис Град: Чёрная корона',
  book: 'Начало',
  authors: 'Lorin Death и Alex Seylor',
  bookSlug: 'chernaya-korona-kniga',
  chronoSlug: bySlug.has('chernaya-korona-khronologiya') ? 'chernaya-korona-khronologiya' : null,
  annotation: blurb('chernaya-korona-kniga', 'Приквел к летописи «Обитель смерти»: как Лорелин стала Лорин.'),
  prologue: { n: 0, slug: pro ? pro.slug : null, title: pro ? pro.title : 'Пролог', blurb: blurb('chk-00-prolog-noch-fioletovoy-luny', 'Ночь, с которой начинается книга.'), shutter },
  parts: partDefs.map((p) => ({
    ...p,
    published: bySlug.has(p.slug),
    blurb: blurb(p.slug, p.range),
    chapters: crownChapters.filter((c) => c.n >= p.from && c.n <= p.to),
  })),
  after: crownChapters.filter((c) => c.n >= 65),
  epilogueSlug: bySlug.has('chk-epilog-i-poslednee-zerkalo') ? 'chk-epilog-i-poslednee-zerkalo' : null,
};
fs.writeFileSync(path.join(ROOT, 'src/data/loropedia/crown.json'), JSON.stringify(crown));
fs.copyFileSync(path.join(PACK, 'theories.json'), path.join(ROOT, 'src/data/loropedia/theories.json'));

fs.writeFileSync(path.join(ROOT, 'src/data/loropedia/data.json'), JSON.stringify(publicData));
fs.writeFileSync(path.join(ROOT, 'src/data/loropedia/expanded.json'), JSON.stringify(expanded));

const searchPath = path.join(ROOT, 'public/loropedia/search.json');
let search = JSON.parse(fs.readFileSync(searchPath, 'utf8'));
search = search.filter((r) => !layerSlugs.has(r.s) && !(layer.redirects && layer.redirects[r.s]));
const sidx = new Map(search.map((r) => [r.s, r]));
for (const a of publicData.articles) {
  if (hidden(a.slug) || hidden(a.title) || hidden(a.excerpt)) continue;
  const row = { s: a.slug, t: a.title, a: a.aliases, g: a.tags, c: a.cat, st: a.status, e: a.excerpt, i: a.image?.thumb ?? null };
  if (sidx.has(a.slug)) Object.assign(sidx.get(a.slug), row);
  else { search.push(row); sidx.set(a.slug, row); }
}
if (hidden(JSON.stringify(search))) throw new Error('поиск: скрытая тема');
for (const [slug, r] of Object.entries(layer.renames || {})) {
  const row = sidx.get(slug);
  if (row) { row.t = r.title; row.a = [...new Set([...(row.a || []), ...(r.aliases || [])])]; }
}
for (const [slug, pt] of Object.entries(layer.patches || {})) {
  const row = sidx.get(slug);
  if (row) { row.a = [...new Set([...(row.a || []), ...(pt.aliases || [])])]; if (pt.excerpt) row.e = pt.excerpt; }
}
for (const a of layer.articles || []) {
  const row = { s: a.slug, t: a.title, a: a.aliases || [], g: a.tags || [], c: a.cat, st: a.status, e: a.excerpt, i: null };
  search = search.filter((x) => x.s !== a.slug);
  search.push(row);
}
if (hidden(JSON.stringify(search))) throw new Error('поиск слоя: скрытая тема');
fs.writeFileSync(searchPath, JSON.stringify(search));

const covPath = path.join(ROOT, 'src/data/loropedia/contract/coverage.json');
const cov = JSON.parse(fs.readFileSync(covPath, 'utf8'));
cov.liveArticles = publicData.stats.articles;
fs.writeFileSync(covPath, JSON.stringify(cov, null, 2) + '\n');

const broken = Object.fromEntries(Object.entries(report.broken).map(([k, v]) => [k, [...v]]));
fs.writeFileSync('/tmp/loropedia-merge-report.json', JSON.stringify({ ...report, broken, public: publicData.stats.articles, expanded: expanded.stats.articles }, null, 2));
console.log('public', publicData.stats.articles, 'expanded', expanded.stats.articles);
console.log('excluded', report.excluded.length, 'redacted', report.redacted.length, 'broken targets', Object.keys(broken).length);
console.log('excluded sample', report.excluded.slice(0, 12));
