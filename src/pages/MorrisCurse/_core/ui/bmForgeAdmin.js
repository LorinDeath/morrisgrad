// Админка «🔥 Конструктор оружия» (чёрная магия, этап Б): детали оружия как заметки Obsidian —
// черновик сохраняется сам (admin_bmf draft), «Опубликовать» — обычная правка bpart (аудит, версия, у всех сразу).
// Вкладки: Детали (список + форма + живое превью) · Артефакты игроков (браузер, скрыть имя) · Дроп кусочков (шанс по мобам).
import { BM_PARTS, BM_NAMES, BP_TYPE_NAMES, BP_ELEMS, BP_ELEM_NAMES } from '../../../../../server/meta/blackArt.ts';
import { RESOURCES } from '../../../../../server/meta/shared.ts';
import { esc } from './overlay.js';
import { elTag } from './bmArtUi.js';
import { WeaponPreview, weaponSheets, weaponManifest } from './bmWeaponArt.js';

const CSS = `
.bmfa{color:#ffe9d0}
.bmfa .sub{display:flex;gap:6px;margin-bottom:8px;flex-wrap:wrap}
.bmfa .sub button,.bmfa .b{background:#2a0f06;border:1px solid #a8320f;color:#fdba74;border-radius:5px;padding:4px 10px;cursor:pointer}
.bmfa .sub button.on{background:#a8320f;color:#fff7e6}
.bmfa .b.pri{background:linear-gradient(#ff7a1a,#a8320f);color:#fff7e6;border-color:#ffb347;font-weight:700}
.bmfa .b.warn{border-color:#ef4444;color:#fca5a5}
.bmfa .cols{display:grid;grid-template-columns:230px 1fr 250px;gap:10px}
@media (max-width:900px){.bmfa .cols{grid-template-columns:1fr}}
.bmfa .pl{max-height:62vh;overflow:auto;border:1px solid #5c1a0b;border-radius:6px;background:#140904}
.bmfa .pl div{padding:4px 8px;cursor:pointer;border-bottom:1px solid #2a0f06;font-size:12px}
.bmfa .pl div.on{background:#3a1206}
.bmfa .pl .g{color:#ffb347;font-weight:700;cursor:default;background:#1a0d08}
.bmfa .pl .dr{color:#fde047}
.bmfa .fm{display:grid;grid-template-columns:1fr 1fr;gap:4px 10px;font-size:12px}
.bmfa .fm label{display:flex;flex-direction:column;gap:2px}
.bmfa .fm .w{grid-column:1/-1}
.bmfa .fm .hd{grid-column:1/-1;color:#ffb347;font-weight:700;margin-top:6px;border-bottom:1px solid #5c1a0b}
.bmfa input,.bmfa select,.bmfa textarea{background:#1a0d08;color:#ffe9d0;border:1px solid #a8320f;border-radius:4px;padding:3px}
.bmfa .st{font-size:12px;margin:6px 0;min-height:16px}
.bmfa .st.draft{color:#fde047}.bmfa .st.ok{color:#86efac}.bmfa .st.err{color:#fca5a5}
.bmfa canvas{width:250px;height:250px;border-radius:8px;border:1px solid #a8320f}
.bmfa table{width:100%;border-collapse:collapse;font-size:12px}
.bmfa td,.bmfa th{border-bottom:1px solid #2a0f06;padding:3px 5px;text-align:left}
.bmfa th{color:#ffb347}
.bmfa .pl .eg{color:#9fb3c8;font-size:11px;cursor:default;background:#100a07;padding:2px 8px}
.bmfa .pl div[data-elem="ice"]{color:#bfe6ff}
.bmfa .ef{display:flex;gap:4px;flex-wrap:wrap;margin-bottom:6px;align-items:center}.bmfa .ef button.on{background:#a8320f;color:#fff7e6}
.bmfa .ef input{flex:1;min-width:80px}
.bmfa .pvb{display:flex;gap:4px;margin-top:4px}.bmfa .pvb button.on{background:#a8320f;color:#fff7e6}
.bmfa-hov{position:fixed;z-index:999;pointer-events:none;border:1px solid #a8320f;border-radius:8px;background:#0b0604;box-shadow:0 0 18px #0009;width:150px;height:150px}
`;
let cssOn = false;
const css = () => { if (cssOn) return; cssOn = true; const s = document.createElement('style'); s.textContent = CSS; document.head.appendChild(s); };
const get = (o, p) => p.split('.').reduce((t, k) => (t == null ? undefined : t[k]), o);
const set = (o, p, v) => { const ks = p.split('.'); let t = o; for (const k of ks.slice(0, -1)) t = t[k] = t[k] && typeof t[k] === 'object' ? t[k] : {}; t[ks.at(-1)] = v; };
const DRAFT_MS = 900;

/** состояние вкладки живёт в объекте админки (ap.bmf) */
export function mountBmForge(ap, sec) {
  css();
  const S = (ap.bmf ||= { sub: 'parts', list: null, sel: null, edit: null, dirty: false, status: '', stCls: '', q: '', dropMob: '' });
  if (!S.list && !S.asked) { S.asked = true; ap.send({ type: 'admin_bmf', op: 'list' }); }
  const subs = [['parts', '🔥 Детали'], ['arts', '🗡 Артефакты игроков'], ['drop', '📜 Дроп кусочков']];
  sec.innerHTML = `<div class="bmfa"><h3>🔥 Конструктор оружия <small class="mc-dim">черновик сохраняется сам · «Опубликовать» — у всех игроков сразу</small></h3>
    <div class="sub">${subs.map(([k, n]) => `<button data-bs="${k}" class="${S.sub === k ? 'on' : ''}">${n}</button>`).join('')}<span style="flex:1"></span>
    <button class="b" data-bx="reload">↻ Обновить</button><button class="b" data-bx="recalc" title="Шаблоны (чёрные мобы) — по текущим деталям. Созданные оружие и артефакты игроков не меняются: это неизменяемый слепок">♻ Пересчитать все</button></div><div class="bd"></div></div>`;
  const bd = sec.querySelector('.bd');
  sec.querySelectorAll('[data-bs]').forEach((b) => (b.onclick = () => { S.sub = b.dataset.bs; mountBmForge(ap, sec); }));
  sec.querySelector('[data-bx="reload"]').onclick = () => { S.list = null; S.asked = false; mountBmForge(ap, sec); };
  sec.querySelector('[data-bx="recalc"]').onclick = () => { if (confirm('Пересчитать шаблоны чёрных мобов по текущим деталям? Созданные артефакты игроков не изменятся.')) ap.send({ type: 'admin_bm_recalc' }); };
  if (!S.list) { bd.innerHTML = '<p class="mc-dim">Загрузка…</p>'; return; }
  if (S.sub === 'arts') return arts(ap, S, bd);
  if (S.sub === 'drop') return drops(ap, S, bd);
  return parts(ap, S, bd, sec);
}

weaponManifest();
function fieldsOf(ap) { return ap.cat?.schema?.bpart?.fields || []; }
function parts(ap, S, bd, sec) {
  const L = S.list, drafts = new Map((L.drafts || []).map((d) => [d.id, d]));
  const byType = {}; for (const p of L.parts) (byType[p.type] ||= []).push(p);
  for (const [id, d] of drafts) if (!L.parts.some((p) => p.id === id)) (byType[d.data?.type || 'blade'] ||= []).push({ id, ...(d.data || {}), _new: true });
  const ef = S.elf || '', q = (S.pq || '').toLowerCase(), okP = (p) => (!ef || (p.elem || 'fire') === ef) && (!q || String(p.name || '').toLowerCase().includes(q) || String(p.id).includes(q));
  const filt = `<div class="ef">${[['', 'Все'], ...BP_ELEMS.map((x) => [x, `${x === 'ice' ? '❄' : '🔥'} ${BP_ELEM_NAMES[x] || x}`])].map(([k, n]) => `<button class="b ${ef === k ? 'on' : ''}" data-ef="${esc(k)}">${esc(n)}</button>`).join('')}<input type="search" data-pq placeholder="поиск…" value="${esc(S.pq || '')}"></div>`;
  const list = Object.keys(BP_TYPE_NAMES).map((t) => `<div class="g">${esc(BP_TYPE_NAMES[t])} <button class="b" style="float:right;padding:0 6px" data-new="${t}" title="Новая деталь">＋</button></div>`
    + BP_ELEMS.map((el) => { const L = (byType[t] || []).filter((p) => (p.elem || 'fire') === el && okP(p)); return L.length ? `<div class="eg">${elTag(el)} · ${L.length}</div>` + L.map((p) => `<div data-p="${esc(p.id)}" data-elem="${esc(p.elem || 'fire')}" class="${S.sel === p.id ? 'on' : ''}">${esc(p.icon || '•')} ${esc(p.name || p.id)}${drafts.has(p.id) ? ' <span class="dr" title="Есть неопубликованный черновик">✎</span>' : ''}${p._new ? ' <small class="dr">новая</small>' : ''}${p.custom ? ' <small class="mc-dim">своя</small>' : ''}</div>`).join('') : ''; }).join('')).join('');
  const e = S.edit;
  let form = '<p class="mc-dim">Выберите деталь слева или создайте новую (＋).</p>';
  if (e) {
    form = `<div class="fm">${fieldsOf(ap).map((f) => {
      if (f.t === 'hdr') return `<div class="hd">${esc(f.label)}</div>`;
      const v = get(e.data, f.path), id = `bmfa-${f.path}`;
      if (f.t === 'bool') return `<label class="w" style="flex-direction:row;align-items:center;gap:6px"><input type="checkbox" data-k="${f.path}" ${v ? 'checked' : ''}> ${esc(f.label)}</label>`;
      if (f.t === 'enum') return `<label>${esc(f.label)}<select data-k="${f.path}" ${f.path === 'type' && !e.isNew ? 'disabled' : ''}>${f.opts.map((o) => `<option value="${esc(o)}" ${String(v ?? '') === String(o) ? 'selected' : ''}>${esc(o === '' ? '— нет —' : BP_TYPE_NAMES[o] || o)}</option>`).join('')}</select></label>`;
      if (f.t === 'color') return `<label>${esc(f.label)}<input type="color" data-k="${f.path}" value="${esc(v || '#ff6a1a')}"></label>`;
      if (f.t === 'int' || f.t === 'num') return `<label>${esc(f.label)}<input type="number" data-k="${f.path}" data-n="${f.t}" min="${f.min}" max="${f.max}" step="${f.t === 'int' ? 1 : 'any'}" value="${v ?? ''}"></label>`;
      if (f.path === 'img') { const ty = e.data?.type; const ls = weaponSheets().filter((w) => w.slot === ty); return `<label>${esc(f.label)}<select data-k="img"><option value="">— заглушка —</option>${ls.map((w) => `<option value="${esc(w.key)}" ${String(v ?? '') === w.key ? 'selected' : ''}>${esc(w.key)} · ${esc(w.name)}${w.mode ? ' (' + esc(w.mode) + ')' : ''}</option>`).join('')}${v && !ls.some((w) => w.key === v) ? `<option value="${esc(v)}" selected>${esc(v)} (нет листа)</option>` : ''}</select></label>`; }
      return `<label class="${f.t === 'ltext' ? 'w' : ''}">${esc(f.label)}<input type="text" data-k="${f.path}" value="${esc(v ?? '')}" id="${id}"></label>`;
    }).join('')}</div>
    <div class="st ${S.stCls}">${esc(S.status)}</div>
    <button class="b pri" data-x="pub">📣 Опубликовать</button> <button class="b" data-x="discard" ${e.hasDraft ? '' : 'disabled'}>✕ Отменить черновик</button>
    <span class="mc-dim" style="font-size:11px">id: ${esc(e.id)} · кусочек: ${esc(RESOURCES[`bp_${e.data.elem || 'fire'}_${e.data.type}`]?.name || '—')}</span>`;
  }
  bd.innerHTML = `<div class="cols"><div>${filt}<div class="pl">${list}</div><p class="mc-dim" style="font-size:11px">Наведите на деталь — живое превью (атака); клик — открыть.</p></div><div>${form}</div><div>${e ? `<canvas width="250" height="250"></canvas><div class="pvb">${[['cycle', '↻ Цикл'], ['idle', '◌ Покой'], ['attack', '⚔ Атака']].map(([k, n]) => `<button class="b ${(S.pvAnim || 'cycle') === k ? 'on' : ''}" data-pva="${k}">${n}</button>`).join('')}</div><p class="mc-dim" style="font-size:11px">Живое превью: деталь в сборке с первыми рукоятью/лезвием той же стихии. Клик по превью — покой ↔ атака.</p><div class="sum"></div>` : ''}</div></div>`;
  bd.querySelectorAll('[data-p]').forEach((el) => (el.onclick = () => { hoverOff(); select(ap, S, el.dataset.p, sec); }));
  bd.querySelectorAll('[data-ef]').forEach((b) => (b.onclick = () => { S.elf = b.dataset.ef; mountBmForge(ap, sec); }));
  { const qi = bd.querySelector('[data-pq]'); if (qi) qi.oninput = () => { S.pq = qi.value; clearTimeout(S.qt); S.qt = setTimeout(() => { mountBmForge(ap, sec); const n = sec.querySelector('[data-pq]'); if (n) { n.focus(); n.setSelectionRange(n.value.length, n.value.length); } }, 250); }; }
  bd.querySelectorAll('.pl [data-p]').forEach((el) => { el.onmouseenter = () => hoverOn(el, el.dataset.p, L); el.onmouseleave = hoverOff; });
  bd.querySelectorAll('[data-new]').forEach((b) => (b.onclick = (ev) => { ev.stopPropagation(); S.status = 'Создание…'; S.stCls = ''; ap.send({ type: 'admin_bmf', op: 'new', ptype: b.dataset.new }); }));
  if (!e) return;
  const pv = (S.pv && S.pv.cv.isConnected) ? S.pv : null; const cv = bd.querySelector('canvas');
  S.pv?.stop(); S.pv = new WeaponPreview(cv); S.pv.labels = true; S.pv.anim = S.pvAnim || 'cycle'; preview(S); S.pv.start(); void pv;
  cv.style.cursor = 'pointer'; cv.onclick = () => { S.pvAnim = S.pv.anim === 'attack' ? 'idle' : 'attack'; S.pv.anim = S.pvAnim; bd.querySelectorAll('[data-pva]').forEach((b) => b.classList.toggle('on', b.dataset.pva === S.pvAnim)); };
  bd.querySelectorAll('[data-pva]').forEach((b) => (b.onclick = () => { S.pvAnim = b.dataset.pva; S.pv.anim = S.pvAnim; bd.querySelectorAll('[data-pva]').forEach((x) => x.classList.toggle('on', x === b)); }));
  const onEdit = (el) => { const k = el.dataset.k; let v = el.type === 'checkbox' ? el.checked : el.value;
    if (el.dataset.n) { v = el.value === '' ? undefined : Number(v); if (v !== undefined && !Number.isFinite(v)) return; }
    if (v === undefined) { const ks = k.split('.'); let t = e.data; for (const x of ks.slice(0, -1)) t = t?.[x]; if (t) delete t[ks.at(-1)]; } else set(e.data, k, v);
    S.dirty = true; S.status = 'Черновик: сохраняется…'; S.stCls = 'draft'; const st = bd.querySelector('.st'); if (st) { st.className = 'st draft'; st.textContent = S.status; }
    preview(S); clearTimeout(S.dt); S.dt = setTimeout(() => { ap.send({ type: 'admin_bmf', op: 'draft', id: e.id, data: e.data }); }, DRAFT_MS); };
  bd.querySelectorAll('[data-k]').forEach((el) => { el.oninput = () => onEdit(el); el.onchange = () => onEdit(el); });
  bd.querySelector('[data-x="pub"]').onclick = () => { clearTimeout(S.dt); S.status = 'Публикация…'; S.stCls = ''; ap.send({ type: 'admin_bmf', op: 'publish', id: e.id, data: e.data }); };
  bd.querySelector('[data-x="discard"]').onclick = () => { if (!confirm('Отменить черновик? Опубликованная деталь не изменится.')) return; clearTimeout(S.dt); ap.send({ type: 'admin_bmf', op: 'discard', id: e.id }); };
}
function preview(S) {
  const e = S.edit; if (!e || !S.pv) return;
  const draft = { ...(BM_PARTS[e.id] || {}), ...e.data, id: e.id, stats: { ...(BM_PARTS[e.id]?.stats || {}), ...(e.data.stats || {}) } }; // объект, не id: синк деталей с сервера его не сотрёт
  S.pv.set(pairFor(draft, e.id));
}
/** сборка для превью детали: недостающие рукоять/лезвие — первые той же стихии (иначе любые) */
function pairFor(part, id) {
  const el = part.elem || 'fire', V = Object.values(BM_PARTS).filter((p) => p.id !== id && !p.hidden);
  const first = (t) => (V.find((p) => p.type === t && (p.elem || 'fire') === el) || V.find((p) => p.type === t))?.id;
  const parts = { handle: first('handle'), blade: first('blade') }; parts[part.type || 'blade'] = part; return parts;
}
// превью по наведению: одно плавающее окно, деталь в атаке
let HOV = null;
function hoverOn(el, id, L) {
  const p = BM_PARTS[id] || (L.drafts || []).find((d) => d.id === id)?.data; if (!p) return;
  if (!HOV) { const cv = document.createElement('canvas'); cv.width = 150; cv.height = 150; cv.className = 'bmfa-hov'; document.body.appendChild(cv); HOV = { cv, pv: new WeaponPreview(cv) }; HOV.pv.labels = false; }
  const r = el.getBoundingClientRect(); HOV.cv.style.left = `${Math.round(r.right + 8)}px`; HOV.cv.style.top = `${Math.round(Math.max(4, Math.min(innerHeight - 156, r.top - 50)))}px`; HOV.cv.style.display = '';
  HOV.pv.anim = 'attack'; HOV.pv.set(pairFor({ ...p, id }, id)); HOV.pv.start();
}
function hoverOff() { if (HOV) { HOV.pv.stop(); HOV.cv.style.display = 'none'; } }
function select(ap, S, id, sec) {
  const L = S.list, p = L.parts.find((x) => x.id === id), d = (L.drafts || []).find((x) => x.id === id);
  const base = p ? JSON.parse(JSON.stringify(p)) : { type: 'blade', elem: 'fire', name: 'Новая деталь' };
  for (const k of ['id', 'custom']) delete base[k];
  const data = d?.data ? { ...base, ...JSON.parse(JSON.stringify(d.data)), stats: { ...(base.stats || {}), ...(d.data.stats || {}) } } : base;
  S.sel = id; S.edit = { id, data, isNew: !p, hasDraft: !!d }; S.status = d ? `Черновик от ${new Date(d.at).toLocaleString('ru-RU')} — не опубликован` : 'Опубликовано'; S.stCls = d ? 'draft' : 'ok';
  mountBmForge(ap, sec);
}
/** стихии артефакта по его деталям (смешанный — несколько) */
const artElems = (a) => { const s = [...new Set(Object.values(a.parts || {}).map((id) => BM_PARTS[id]?.elem || 'fire'))]; return s.length ? s.sort((x, y) => BP_ELEMS.indexOf(x) - BP_ELEMS.indexOf(y)) : ['fire']; };
function arts(ap, S, bd) {
  const A = S.list.arts || [];
  bd.innerHTML = `<p class="mc-dim">Созданные артефакты (из БД, последние 200): игроки — кузня Знахаря, тестовые — админка. Имя можно скрыть (заменится на «Безымянный артефакт»). Выдать мобу в руку — в конструкторе мобов (этап В).</p>
    <div class="ef">${[['', 'Все'], ...BP_ELEMS.map((x) => [x, `${x === 'ice' ? '❄' : '🔥'} ${BP_ELEM_NAMES[x] || x}`])].map(([k, n]) => `<button class="b ${(S.aef || '') === k ? 'on' : ''}" data-aef="${esc(k)}">${esc(n)}</button>`).join('')}</div>
    <table><tr><th>Имя</th><th>Стихия</th><th>Автор</th><th>Создан</th><th>Источник</th><th>Детали</th><th>Экз.</th><th></th></tr>${A.filter((a) => !S.aef || artElems(a).includes(S.aef)).map((a) => `<tr data-elem="${esc(artElems(a).join(','))}"><td>${esc(a.name)}</td><td>${artElems(a).map(elTag).join('')}</td><td>${esc(a.author || '—')}</td><td>${a.created ? new Date(a.created).toLocaleString('ru-RU') : '—'}</td><td>${esc(a.src || '—')}</td>
      <td style="font-size:11px">${Object.values(a.parts || {}).map((id) => esc(BM_PARTS[id]?.name || id)).join(' + ')}${a.ranged ? ' 🏹' : ''}</td><td>${a.n ?? '—'}</td><td>${a.name === 'Безымянный артефакт' ? '' : `<button class="b warn" data-hide="${esc(a.id)}">Скрыть имя</button>`}</td></tr>`).join('') || '<tr><td colspan="7" class="mc-dim">Пока нет</td></tr>'}</table>`;
  bd.querySelectorAll('[data-aef]').forEach((b) => (b.onclick = () => { S.aef = b.dataset.aef; arts(ap, S, bd); }));
  bd.querySelectorAll('[data-hide]').forEach((b) => (b.onclick = () => { if (confirm('Скрыть имя артефакта у всех?')) ap.send({ type: 'admin_bmf', op: 'hide_name', id: b.dataset.hide }); }));
}
function drops(ap, S, bd) {
  const M = S.list.mobs || [], P = S.list.pieces || [], q = (S.q || '').toLowerCase();
  const rows = M.filter((m) => !q || m.name.toLowerCase().includes(q) || m.id.includes(q) || m.drops.length).filter((m) => !q || m.name.toLowerCase().includes(q) || m.id.includes(q)).slice(0, 60);
  bd.innerHTML = `<p class="mc-dim">Шанс выпадения кусочков чертежа с моба (вкладка «💰 Дроп» — те же данные). 0 — убрать. Здесь — только огненные: ❄ ледяные кусочки падают лишь с ледяных чёрных мобов (конструктор мобов).</p>
    <input placeholder="Поиск моба…" class="q" value="${esc(S.q || '')}" style="width:240px">
    <table><tr><th>Моб</th><th>Ур.</th><th>Кусочки сейчас</th><th>Кусочек</th><th>Шанс %</th><th>Кол-во</th><th></th></tr>${rows.map((m) => `<tr data-m="${esc(m.id)}"><td>${esc(m.name)}</td><td>${m.lvl}</td>
      <td style="font-size:11px">${m.drops.map((d) => `${esc(RESOURCES[d.res]?.name?.replace('Кусочек чертежа: ', '') || d.res)} ${d.chance}% ×${d.qty?.[0]}–${d.qty?.[1]}`).join('<br>') || '—'}</td>
      <td><select class="r">${P.filter((r) => /^bp_fire_/.test(r)).map((r) => `<option value="${r}">${esc(RESOURCES[r]?.name?.replace('Кусочек чертежа: ', '') || r)}</option>`).join('')}</select></td>
      <td><input class="c" type="number" min="0" max="100" step="0.1" value="5" style="width:60px"></td><td><input class="a" type="number" min="1" max="99" value="1" style="width:44px">–<input class="z" type="number" min="1" max="99" value="1" style="width:44px"></td>
      <td><button class="b pri">Сохранить</button></td></tr>`).join('')}</table>`;
  const qi = bd.querySelector('.q'); qi.oninput = () => { S.q = qi.value; clearTimeout(S.qt); S.qt = setTimeout(() => { drops(ap, S, bd); const n = bd.querySelector('.q'); n.focus(); n.setSelectionRange(n.value.length, n.value.length); }, 250); };
  bd.querySelectorAll('tr[data-m] .b').forEach((b) => (b.onclick = () => { const tr = b.closest('tr'), v = (s) => tr.querySelector(s).value;
    ap.send({ type: 'admin_bmf', op: 'drop', mob: tr.dataset.m, res: v('.r'), chance: Number(v('.c')), qmin: Number(v('.a')), qmax: Number(v('.z')) }); }));
}

/** ответ сервера admin_bmf */
export function onBmfResult(ap, d) {
  const S = (ap.bmf ||= { sub: 'parts' });
  if (d.op === 'list' && d.ok) { S.list = d; S.asked = false; if (S.sel && !S.edit) S.sel = null; }
  if (d.op === 'new' && d.ok && S.list) { (S.list.drafts ||= []).unshift({ id: d.id, data: d.data, at: Date.now() }); S.sel = d.id; S.edit = { id: d.id, data: { ...d.data }, isNew: true, hasDraft: true }; S.status = 'Новая деталь — черновик'; S.stCls = 'draft'; }
  if (d.op === 'draft') { if (d.ok) { const L = (S.list.drafts ||= []); const x = L.find((y) => y.id === d.id); if (x) { x.data = JSON.parse(JSON.stringify(S.edit?.data || x.data)); x.at = Date.now(); } else L.unshift({ id: d.id, data: JSON.parse(JSON.stringify(S.edit?.data || {})), at: Date.now() });
      if (S.edit?.id === d.id) { S.edit.hasDraft = true; S.status = `Черновик сохранён ${new Date().toLocaleTimeString('ru-RU')} — не опубликован`; S.stCls = 'draft'; } } else { S.status = 'Черновик не сохранён: ' + (d.err || 'ошибка'); S.stCls = 'err'; }
    const st = ap.el?.querySelector('.bmfa .st'); if (st && S.sub === 'parts') { st.className = 'st ' + S.stCls; st.textContent = S.status; const dc = ap.el.querySelector('.bmfa [data-x="discard"]'); if (dc) dc.disabled = !S.edit?.hasDraft; } return; }
  if (d.op === 'discard' && d.ok && S.list) { S.list.drafts = (S.list.drafts || []).filter((x) => x.id !== d.id); if (S.sel === d.id) { const p = S.list.parts.find((x) => x.id === d.id); S.edit = null; S.sel = null; if (p) { S.sel = d.id; } } S.status = 'Черновик отменён'; S.stCls = ''; S.list = null; ap.send({ type: 'admin_bmf', op: 'list' }); }
  if (d.op === 'publish') { if (d.ok) { S.list.parts = d.parts || S.list.parts; S.list.drafts = (S.list.drafts || []).filter((x) => x.id !== d.id); if (S.edit) { S.edit.isNew = false; S.edit.hasDraft = false; } S.status = d.isNew ? '✔ Новая деталь опубликована — уже у Знахаря' : '✔ Опубликовано'; S.stCls = 'ok'; }
    else { S.status = 'Не опубликовано: ' + (d.err || d.message || 'ошибка'); S.stCls = 'err'; } }
  if (d.op === 'drop' && S.list) { if (d.ok) { const m = S.list.mobs.find((x) => x.id === d.mob); if (m) m.drops = d.drops || []; ap.msg?.('✔ Дроп кусочков сохранён'); } else ap.msg?.('Ошибка: ' + (d.err || '')); }
  if (d.op === 'hide_name' && d.ok && S.list) { const a = S.list.arts.find((x) => x.id === d.id); if (a) a.name = 'Безымянный артефакт'; ap.msg?.('✔ Имя скрыто'); }
  if (!d.ok && d.op !== 'draft' && d.op !== 'publish') ap.msg?.('Ошибка: ' + (d.err || ''));
  if (ap.tab === 'bmforge' && ap.el) { const sec = ap.el.querySelector('section'); if (sec) mountBmForge(ap, sec); }
}
export { BM_NAMES };
