// Админка «🛠 Конструктор навыков» (в духе Azure Striker Gunvolt): пресеты 5 огня + 5 льда, свои навыки «skx_…»,
// «Новый» (форма + стихия), «Дублировать», шаблоны и быстрые модификаторы, живое превью: картинка из атласа навыков,
// траектория, хитбокс (как на сервере — те же pathWorld/steer/skHitbox/hbTouch), веер, пробой, взрыв, площади.
// Сохранение — правка kind «skdef» (аудит, версия, у всех онлайн сразу через config_update.skd).
import { SK_FORMS, SK_FORM_NAMES, SK_ELEMS, SK_SLOT, skBlank, skErr, skFxElem, skHitbox, hbTouch, pathWorld, steer, skRange } from '../../../../../server/meta/skillCraft.ts';
import { ELEMENTS } from '../../../../../server/meta/blackArt.ts';
import { SKILL_FX } from '../engine/fxAtlas.js';
import { esc } from './overlay.js';

const CSS = `
.skca{color:#ffe9d0}
.skca .b{background:#2a0f06;border:1px solid #a8320f;color:#fdba74;border-radius:5px;padding:4px 10px;cursor:pointer}
.skca .b.pri{background:linear-gradient(#ff7a1a,#a8320f);color:#fff7e6;border-color:#ffb347;font-weight:700}
.skca .b.warn{border-color:#ef4444;color:#fca5a5}.skca .b:disabled{opacity:.45;cursor:default}
.skca .bar{display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin-bottom:8px}
.skca .cols{display:grid;grid-template-columns:220px 1fr 360px;gap:10px}
@media (max-width:1100px){.skca .cols{grid-template-columns:1fr}}
.skca .pl{max-height:70vh;overflow:auto;border:1px solid #5c1a0b;border-radius:6px;background:#140904}
.skca .pl div{padding:4px 8px;cursor:pointer;border-bottom:1px solid #2a0f06;font-size:12px}
.skca .pl div.on{background:#3a1206}.skca .pl .g{color:#ffb347;font-weight:700;cursor:default;background:#1a0d08}
.skca .pl small{color:#9fb3c8}
.skca .fm{display:grid;grid-template-columns:1fr 1fr 1fr;gap:4px 10px;font-size:12px;max-height:70vh;overflow:auto;padding-right:4px}
.skca .fm label{display:flex;flex-direction:column;gap:2px}
.skca .fm label i{font-style:normal;color:#9fb3c8;font-size:10.5px}
.skca .fm .w{grid-column:1/-1}
.skca .fm .hd{grid-column:1/-1;color:#ffb347;font-weight:700;margin-top:6px;border-bottom:1px solid #5c1a0b;cursor:pointer;user-select:none}
.skca .fm .chg input,.skca .fm .chg select{border-color:#fde047}
.skca input,.skca select{background:#1a0d08;color:#ffe9d0;border:1px solid #a8320f;border-radius:4px;padding:3px}
.skca .st{font-size:12px;margin:6px 0;min-height:16px}.skca .st.ok{color:#86efac}.skca .st.err{color:#fca5a5}.skca .st.draft{color:#fde047}
.skca canvas{width:360px;height:360px;border-radius:8px;border:1px solid #a8320f;background:#0d0705}
.skca .inf{font-size:11.5px;color:#fdba74;margin-top:4px;line-height:1.45}
.skca .tp{display:flex;gap:4px;flex-wrap:wrap;margin:6px 0}.skca .tp .b{padding:2px 7px;font-size:11px}
.skca .ef button.on{background:#a8320f;color:#fff7e6}
`;
let cssDone = false;
const css = () => { if (cssDone || typeof document === 'undefined') return; cssDone = true; const s = document.createElement('style'); s.textContent = CSS; document.head.appendChild(s); };
const EL = Object.fromEntries(ELEMENTS.map((e) => [e.id, e]));
const getP = (o, p) => p.split('.').reduce((a, k) => (a == null ? a : a[k]), o);
const setP = (o, p, v) => { const ks = p.split('.'); let t = o; for (const k of ks.slice(0, -1)) t = t[k] = t[k] && typeof t[k] === 'object' ? t[k] : {}; t[ks.at(-1)] = v; };
const clone = (x) => JSON.parse(JSON.stringify(x));

/** какие поля имеют смысл для текущей формы/траектории (остальные скрыты; «Все поля» — показать всё) */
function relevant(path, v) {
  const f = v.form, P = v.path, m = /^mods\.(\d)\.(\w+)$/.exec(path);
  if (m) return m[2] === 'k' || !!v[`mods.${m[1]}.k`] && (m[2] !== 'th' || !!v[`mods.${m[1]}.if`]);
  const proj = ['path', 'spd', 'range', 'dur', 'scale', 'amp', 'freq', 'turn', 'seek', 'b1a', 'b1s', 'b2a', 'b2s', 'hit', 'hitW', 'hitH', 'n', 'spread', 'pierce', 'hitMul', 'boom', 'boomMul'];
  if (proj.includes(path)) {
    if (f !== 'proj') return false;
    if (path === 'amp') return ['arc', 'sine', 'boomerang', 'lob'].includes(P);
    if (path === 'freq') return P === 'sine';
    if (path === 'turn' || path === 'seek') return P === 'homing';
    if (/^b\d/.test(path)) return P === 'bezier';
    if (path === 'hitW') return v.hit !== 'auto'; if (path === 'hitH') return v.hit === 'box';
    if (path === 'spread') return (v.n || 1) > 1; if (path === 'boomMul') return (v.boom || 0) > 0;
    return true;
  }
  const area = { r: ['nova', 'rain'], len: ['cone', 'dash'], arc: ['cone'], w: ['dash'], drops: ['rain'], area: ['rain'], lead: ['rain'], gap: ['rain'], ticks: ['nova'], tickGap: ['nova'], invuln: ['dash'], trail: ['dash'], trailMul: ['dash'] };
  if (area[path]) return area[path].includes(f) && (path !== 'trailMul' || (v.trail || 0) > 0) && (path !== 'tickGap' || (v.ticks || 1) > 1);
  if (path === 'pct') return v.dmg !== 'normal';
  if (path === 'selfSlowMul') return (v.selfSlow || 0) > 0;
  if (path === 'sDr') return (v.sInv || 0) > 0;
  return true;
}
const HDR_FORM = { _h1: (v) => v.form === 'proj', _h2: (v) => v.form === 'proj', _h3: (v) => v.form !== 'proj' };

// шаблоны (накладываются на текущий навык) и быстрые модификаторы (в первый свободный слот)
const TEMPLATES = [
  ['🌊 Веер синусоид', { form: 'proj', path: 'sine', n: 5, spread: 50, amp: 40, freq: 2, pierce: 3, hitMul: 0.6, boom: 0 }],
  ['🎯 Самонаводящийся', { form: 'proj', path: 'homing', turn: 360, seek: 500, spd: 480, range: 700, hitMul: 1, boom: 60 }],
  ['🪃 Бумеранг-пробой', { form: 'proj', path: 'boomerang', amp: 70, range: 520, pierce: 8, hitMul: 0.8, boom: 0 }],
  ['〰 Кривая Безье', { form: 'proj', path: 'bezier', b1a: 0.3, b1s: 0.8, b2a: 0.7, b2s: -0.8, hitMul: 1, boom: 80 }],
  ['⏳ Долгий снаряд', { form: 'proj', path: 'line', dur: 4000, spd: 160, pierce: 20, hitMul: 0.3, boom: 0, scale: 1.6 }],
  ['💍 Кольцо 3 удара', { form: 'nova', ticks: 3, tickGap: 500, r: 180 }],
  ['🌧 Ливень', { form: 'rain', drops: 16, area: 260, r: 70, gap: 60 }],
  ['💨 Рывок со следом', { form: 'dash', len: 300, w: 70, invuln: 300, trail: 1, trailMul: 0.7 }],
];
const QMODS = [
  ['+30% атаки 5 с при попадании', { k: 'atk', op: 'pct', v: 30, ms: 5000, st: 1, on: 'hit', if: '', th: 50, ch: 100 }],
  ['×1.5 урона навыков (3 стака) за убийство', { k: 'dmg', op: 'mul', v: 1.5, ms: 6000, st: 3, on: 'kill', if: '', th: 50, ch: 100 }],
  ['+25% скорости бега при касте', { k: 'spd', op: 'pct', v: 25, ms: 3000, st: 1, on: 'cast', if: '', th: 50, ch: 100 }],
  ['+20% крита при ОЗ < 50%', { k: 'crit', op: 'pct', v: 20, ms: 4000, st: 1, on: 'cast', if: 'hpBelow', th: 50, ch: 100 }],
  ['+40% зарядки, шанс 30%', { k: 'charge', op: 'pct', v: 40, ms: 4000, st: 2, on: 'hit', if: '', th: 50, ch: 30 }],
  ['+50% брони при заряженном', { k: 'armor', op: 'pct', v: 50, ms: 3000, st: 1, on: 'cast', if: 'charged', th: 50, ch: 100 }],
];

function flatOf(S, d) { const v = {}; for (const f of S.fields) if (f.t !== 'hdr') v[f.path] = getP(d, f.path) ?? null; return v; }
/** черновик (плоские поля) → SkDef для превью и проверки */
export function defOf(v) {
  const d = skBlank(v.id || 'skx_preview', v.form, v.elem);
  for (const [p, x] of Object.entries(v)) if (x !== null && x !== undefined && p !== 'id') setP(d, p, x);
  return d;
}

export function mountSkillCraft(ap, sec) {
  css();
  const S = (ap.skc ||= { list: null, fields: null, sel: null, edit: null, ef: '', q: '', all: false, closed: {}, status: '', stCls: '', newForm: 'proj', newElem: 'fire', speed: 1 });
  if (!S.list && !S.asked) { S.asked = true; ap.send({ type: 'admin_skc', op: 'list' }); }
  if (!S.list) { sec.innerHTML = '<div class="skca"><h3>🛠 Конструктор навыков</h3><p class="mc-dim">Загрузка…</p></div>'; return; }
  const E = S.edit, cur = S.list.find((x) => x.id === S.sel);
  const shown = S.list.filter((x) => (!S.ef || x.v.elem === S.ef) && (!S.q || (x.v.name + ' ' + x.id).toLowerCase().includes(S.q.toLowerCase())));
  const row = (x) => `<div data-sid="${x.id}" class="${x.id === S.sel ? 'on' : ''}">${esc(x.v.icon || '✨')} ${esc(x.v.name || x.id)} <small>${EL[x.v.elem]?.icon || ''} ${esc(SK_FORM_NAMES[x.v.form] || x.v.form)}${x.used?.length ? ' · на ' + x.used.length + ' дет.' : ''}</small></div>`;
  const nCustom = S.list.filter((x) => x.custom).length;
  sec.innerHTML = `<div class="skca"><h3>🛠 Конструктор навыков <small class="mc-dim">пресеты (огонь/лёд) правятся и сбрасываются · свои — «Новый» или «Дублировать» · сохранение — у всех сразу · назначение: 🔥 Части оружия → «Навык»</small></h3>
    <div class="bar ef"><button class="b ${!S.ef ? 'on' : ''}" data-ef="">Все</button>${SK_ELEMS.map((e) => `<button class="b ${S.ef === e ? 'on' : ''}" data-ef="${e}">${EL[e]?.icon || ''} ${esc(EL[e]?.name || e)}</button>`).join('')}
      <input data-q placeholder="поиск…" value="${esc(S.q)}" style="width:120px"><span style="flex:1"></span>
      <select data-nf title="форма нового навыка">${SK_FORMS.map((f) => `<option value="${f}" ${S.newForm === f ? 'selected' : ''}>${esc(SK_FORM_NAMES[f])}</option>`).join('')}</select>
      <select data-ne title="стихия нового навыка">${SK_ELEMS.map((e) => `<option value="${e}" ${S.newElem === e ? 'selected' : ''}>${EL[e]?.icon || ''} ${esc(EL[e]?.name || e)}</option>`).join('')}</select>
      <button class="b" data-x="new" title="пустой навык выбранной формы и стихии">＋ Новый</button>
      <button class="b" data-x="dup" ${E ? '' : 'disabled'} title="копия выбранного (пресета или своего) — новый свой навык">⧉ Дублировать</button>
      <button class="b" data-x="reload">↻</button></div>
    <div class="cols"><div class="pl">${['preset', 'custom'].map((g) => { const L = shown.filter((x) => (g === 'preset' ? x.preset : !x.preset)); return `<div class="g">${g === 'preset' ? 'Пресеты' : `Свои (${nCustom}/${S.list.max || 200})`}</div>${L.map(row).join('') || '<div class="mc-dim">— нет —</div>'}`; }).join('')}</div>
    <div>${E ? editor(S, E, cur) : '<p class="mc-dim">Выберите навык слева или нажмите «＋ Новый». Подсказки — под каждым полем; лишние для формы поля скрыты (флажок «Все поля»).</p>'}</div>
    <div>${E ? `<canvas width="360" height="360" data-pv></canvas><div class="bar" style="margin-top:4px">Превью: <select data-spd>${[0.25, 0.5, 1, 2].map((k) => `<option value="${k}" ${S.speed == k ? 'selected' : ''}>×${k}</option>`).join('')}</select><label><input type="checkbox" data-pt ${S.ptOff ? '' : 'checked'}> путь</label><label><input type="checkbox" data-hb ${S.hbOff ? '' : 'checked'}> хитбокс</label><label><input type="checkbox" data-mb ${S.mobOff ? '' : 'checked'}> мишени</label></div><div class="inf" data-inf></div>` : ''}</div></div></div>`;
  const $ = (q) => sec.querySelector(q), $$ = (q) => sec.querySelectorAll(q);
  $$('[data-ef]').forEach((b) => (b.onclick = () => { S.ef = b.dataset.ef; mountSkillCraft(ap, sec); }));
  const q = $('[data-q]'); q.oninput = () => { S.q = q.value; clearTimeout(S.qt); S.qt = setTimeout(() => { mountSkillCraft(ap, sec); const n = sec.querySelector('[data-q]'); n.focus(); n.setSelectionRange(n.value.length, n.value.length); }, 250); };
  $('[data-nf]').onchange = (e) => (S.newForm = e.target.value); $('[data-ne]').onchange = (e) => (S.newElem = e.target.value);
  $('[data-x="reload"]').onclick = () => { S.list = null; S.asked = false; mountSkillCraft(ap, sec); };
  $('[data-x="new"]').onclick = () => { if (E?.dirty && !confirm('Есть несохранённые правки. Бросить их?')) return; const v = flatOf(S, skBlank('skx_new', S.newForm, S.newElem)); S.sel = null; S.edit = { id: null, v, orig: clone(v), dirty: true }; S.status = 'Новый навык — ещё не сохранён'; S.stCls = 'draft'; mountSkillCraft(ap, sec); };
  const dup = $('[data-x="dup"]'); if (dup) dup.onclick = () => { if (!E) return; const v = clone(E.v); v.name = String(v.name || 'Навык').slice(0, 40) + ' (копия)'; S.sel = null; S.edit = { id: null, v, orig: clone(v), dirty: true, from: E.id }; S.status = `Копия «${E.v.name}» — ещё не сохранена`; S.stCls = 'draft'; mountSkillCraft(ap, sec); };
  $$('[data-sid]').forEach((d) => (d.onclick = () => { if (E?.dirty && E.id !== d.dataset.sid && !confirm('Есть несохранённые правки. Бросить их?')) return; select(S, d.dataset.sid); mountSkillCraft(ap, sec); }));
  if (E) wireEditor(ap, sec, S);
}
function select(S, id) { const x = S.list.find((y) => y.id === id); if (!x) return; S.sel = id; S.edit = { id, v: clone(x.v), orig: clone(x.v), dirty: false }; S.status = ''; S.stCls = ''; }

function input(f, val) {
  const t = f.t, p = f.path, title = [f.h, f.min != null ? `от ${f.min} до ${f.max}` : ''].filter(Boolean).join(' · ');
  if (t === 'enum') return `<select data-f="${p}" title="${esc(title)}">${f.opts.map((o) => `<option value="${esc(o)}" ${String(val ?? '') === String(o) ? 'selected' : ''}>${esc(f.optn?.[o] ?? (o || '—'))}</option>`).join('')}</select>`;
  if (t === 'bool') return `<input type="checkbox" data-f="${p}" ${val ? 'checked' : ''}>`;
  if (t === 'int' || t === 'num') return `<input type="number" data-f="${p}" value="${val ?? ''}" ${f.min != null ? `min="${f.min}" max="${f.max}"` : ''} step="${t === 'int' ? 1 : 'any'}" title="${esc(title)}">`;
  return `<input data-f="${p}" value="${esc(val ?? '')}" title="${esc(title)}">`;
}
function editor(S, E, cur) {
  const v = E.v; let html = '', hdr = null, hide = false;
  for (const f of S.fields) {
    if (f.t === 'hdr') { hdr = f.path; hide = !S.all && HDR_FORM[hdr] && !HDR_FORM[hdr](v); if (!hide) html += `<div class="hd" data-hd="${hdr}">${S.closed[hdr] ? '▸' : '▾'} ${esc(f.label)}</div>`; continue; }
    if (hide || S.closed[hdr] || (!S.all && !relevant(f.path, v))) continue;
    const wide = f.t === 'ltext' || f.path === 'rad', chg = JSON.stringify(v[f.path]) !== JSON.stringify(E.orig[f.path]);
    const rng = f.min != null ? ` <i>${f.min}…${f.max}</i>` : '';
    html += `<label class="${wide ? 'w' : ''} ${chg ? 'chg' : ''}">${esc(f.label)}${rng}${input(f, v[f.path])}${f.h ? `<i>${esc(f.h)}</i>` : ''}</label>`;
  }
  const isPreset = cur?.preset, isCustom = !!E.id && !isPreset;
  return `<div class="bar"><b>${esc(v.icon || '✨')} ${esc(v.name || '')}</b> <small class="mc-dim">${E.id ? esc(E.id) : 'новый (id выдаст сервер)'}${isPreset ? ' · пресет' : ''}${cur?.used?.length ? ' · стоит на: ' + esc(cur.used.slice(0, 5).join(', ')) : ''}</small><span style="flex:1"></span>
      <label><input type="checkbox" data-all ${S.all ? 'checked' : ''}> Все поля</label>
      <button class="b pri" data-x="save" title="Ctrl+S">💾 Сохранить</button><button class="b" data-x="undo" ${E.dirty ? '' : 'disabled'}>↶ Отменить правки</button>
      ${isPreset ? '<button class="b warn" data-x="reset" title="вернуть исходные числа пресета">↺ Сбросить пресет</button>' : ''}${isCustom ? '<button class="b warn" data-x="del">🗑 Удалить</button>' : ''}</div>
    <div class="st ${S.stCls}" data-st>${esc(S.status)}</div>
    <div class="tp"><small class="mc-dim">Шаблоны:</small>${TEMPLATES.map(([n], i) => `<button class="b" data-tpl="${i}" title="наложить на текущий навык (остальные поля не меняются)">${esc(n)}</button>`).join('')}</div>
    <div class="tp"><small class="mc-dim">Быстрые модификаторы:</small>${QMODS.map(([n], i) => `<button class="b" data-qm="${i}" title="в первый свободный слот модификатора">${esc(n)}</button>`).join('')}</div>
    <div class="fm">${html}</div>`;
}
function wireEditor(ap, sec, S) {
  const E = S.edit, $ = (q) => sec.querySelector(q), $$ = (q) => sec.querySelectorAll(q), F = Object.fromEntries(S.fields.map((f) => [f.path, f]));
  const RER = new Set(['form', 'path', 'hit', 'n', 'boom', 'dmg', 'ticks', 'trail', 'selfSlow', 'sInv']);
  const status = (t, c) => { S.status = t; S.stCls = c; const st = $('[data-st]'); if (st) { st.textContent = t; st.className = 'st ' + c; } };
  const check = () => { const e = skErr(defOf(E.v)); const sv = $('[data-x="save"]'); if (sv) sv.disabled = !!e; if (e) status('⚠ ' + e, 'err'); else if (S.stCls === 'err') status(E.dirty ? 'Есть несохранённые правки' : '', E.dirty ? 'draft' : ''); };
  const rerender = () => { const sc = $('.fm')?.scrollTop || 0; mountSkillCraft(ap, sec); const fm = sec.querySelector('.fm'); if (fm) fm.scrollTop = sc; };
  $$('[data-f]').forEach((el) => {
    const f = F[el.dataset.f];
    const h = () => {
      let x = f.t === 'bool' ? el.checked : el.value;
      if (f.t === 'int' || f.t === 'num') { if (x === '') return; x = Number(x); if (!Number.isFinite(x)) return; if (f.min != null) x = Math.max(f.min, Math.min(f.max, x)); if (f.t === 'int') x = Math.round(x); }
      E.v[f.path] = x; E.dirty = true; el.closest('label')?.classList.toggle('chg', JSON.stringify(x) !== JSON.stringify(E.orig[f.path]));
      if (S.stCls !== 'err') status('Есть несохранённые правки', 'draft');
      const ud = $('[data-x="undo"]'); if (ud) ud.disabled = false;
      if (RER.has(f.path) || /^mods\.\d\.(k|if)$/.test(f.path)) rerender(); else check();
    };
    el.addEventListener(f.t === 'enum' || f.t === 'bool' ? 'change' : 'input', h);
  });
  $$('[data-hd]').forEach((d) => (d.onclick = () => { S.closed[d.dataset.hd] = !S.closed[d.dataset.hd]; rerender(); }));
  $('[data-all]').onchange = (e) => { S.all = e.target.checked; rerender(); };
  $$('[data-tpl]').forEach((b) => (b.onclick = () => { Object.assign(E.v, TEMPLATES[+b.dataset.tpl][1]); E.dirty = true; status('Шаблон наложен — проверьте превью и сохраните', 'draft'); rerender(); }));
  $$('[data-qm]').forEach((b) => (b.onclick = () => { let i = [0, 1, 2, 3].find((j) => !E.v[`mods.${j}.k`]); if (i == null) { status('Все 4 слота модификаторов заняты — очистите один («Что меняет» → —)', 'err'); return; } for (const [k, x] of Object.entries(QMODS[+b.dataset.qm][1])) E.v[`mods.${i}.${k}`] = x; E.dirty = true; status(`Модификатор ${i + 1} заполнен`, 'draft'); rerender(); }));
  $('[data-x="save"]').onclick = () => { const e = skErr(defOf(E.v)); if (e) return status('⚠ ' + e, 'err'); status('Сохраняю…', 'draft'); ap.send({ type: 'admin_skc', op: 'save', id: E.id || '', data: E.v }); };
  $('[data-x="undo"]').onclick = () => { E.v = clone(E.orig); E.dirty = false; status('Правки отменены', ''); rerender(); };
  const rs = $('[data-x="reset"]'); if (rs) rs.onclick = () => { if (confirm('Вернуть исходные числа пресета?')) ap.send({ type: 'admin_skc', op: 'reset', id: E.id }); };
  const dl = $('[data-x="del"]'); if (dl) dl.onclick = () => { if (confirm(`Удалить навык «${E.v.name}»?`)) ap.send({ type: 'admin_skc', op: 'reset', id: E.id }); };
  sec.querySelector('.skca').onkeydown = (e) => { if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); $('[data-x="save"]')?.click(); } };
  const sp = $('[data-spd]'); if (sp) sp.onchange = () => (S.speed = Number(sp.value) || 1);
  for (const [a, k] of [['[data-pt]', 'ptOff'], ['[data-hb]', 'hbOff'], ['[data-mb]', 'mobOff']]) { const c = $(a); if (c) c.onchange = () => (S[k] = !c.checked); }
  check();
  const cv = $('[data-pv]'); if (cv) startPreview(cv, S, $('[data-inf]'));
}

export function onSkcResult(ap, d) {
  const S = (ap.skc ||= {});
  const rerender = () => { if (ap.tab === 'skillcraft' && ap.el) { const sec = ap.el.querySelector('section'); if (sec) mountSkillCraft(ap, sec); } };
  if (d.op === 'list' && d.ok) { S.list = d.list; S.fields = d.fields; S.list.max = d.max; S.asked = false; if (S.sel && !S.edit?.dirty) select(S, S.sel); }
  else if (d.op === 'save') {
    if (d.ok) { if (d.list) { const max = S.list?.max; S.list = d.list; S.list.max = max; } select(S, d.id); S.status = `Сохранено ${new Date().toLocaleTimeString('ru-RU')} — у всех онлайн`; S.stCls = 'ok'; }
    else { S.status = 'Не сохранено: ' + (d.err || 'ошибка'); S.stCls = 'err'; }
  } else if (d.op === 'reset') {
    if (d.ok) { if (d.list) { const max = S.list?.max; S.list = d.list; S.list.max = max; } if (S.list.find((x) => x.id === d.id)) { select(S, d.id); S.status = 'Пресет сброшен к исходным числам'; } else { S.sel = null; S.edit = null; S.status = 'Удалено'; } S.stCls = 'ok'; }
    else { S.status = 'Не выполнено: ' + (d.err || 'ошибка'); S.stCls = 'err'; }
  }
  rerender();
}

// ——— живое превью ———
const IMG = new Map();
function img(src) { let i = IMG.get(src); if (!i) { i = new Image(); i.src = src; IMG.set(src, i); } return i; }
function part(d, pn) {
  const key = SKILL_FX?.elems?.[skFxElem(d)]?.slots?.[SK_SLOT[d.form]] || SKILL_FX?.elems?.fire?.slots?.[SK_SLOT[d.form]], K = key && SKILL_FX.keys[key];
  const p = K?.parts?.[pn] || (pn && K && Object.values(K.parts)[0]); if (!p) return null;
  return { p, im: img(`/bm-art/fx/skills/${p.image}`), gl: p.glow ? img(`/bm-art/fx/skills/${p.glow}`) : null, key };
}
/** кадр анимации части в (x,y) с поворотом ang, масштаб k (px мира → px холста), растяжение sx/sy */
function drawPart(g, P, anim, t, x, y, ang, k, sx = 1, sy = 1, loop) {
  if (!P || !P.im.complete || !P.im.naturalWidth) return false;
  const A = P.p.anims[anim] || Object.values(P.p.anims)[0]; const [w, h] = P.p.cell, an = P.p.anchor || [w / 2, h / 2];
  const lp = loop ?? A.loop, f0 = Math.floor(t * (A.fps || 12)), fr = lp ? f0 % A.n : Math.min(A.n - 1, f0);
  const cols = P.p.cols || A.n, cx = (fr % cols) * w, cy = ((A.row || 0) + Math.floor(fr / cols)) * h;
  g.save(); g.translate(x, y); g.rotate(ang); g.scale(k * sx, k * sy);
  g.drawImage(P.im, cx, cy, w, h, -an[0], -an[1], w, h);
  if (P.gl?.complete && P.gl.naturalWidth) { g.globalCompositeOperation = 'lighter'; g.drawImage(P.gl, cx, cy, w, h, -an[0], -an[1], w, h); }
  g.restore(); return true;
}
function startPreview(cv, S, inf) {
  const g = cv.getContext('2d'), W = cv.width, H = cv.height; let t0 = performance.now(), last = t0, sim = 0, cache = '', st = null;
  const MOBS = [[0.55, -0.12], [0.75, 0.15], [0.9, -0.05], [0.4, 0.25]]; // мишени в долях дальности (вдоль, вбок)
  const frame = (now) => {
    if (!cv.isConnected || S.edit == null) return;
    requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - last) / 1000) * (S.speed || 1); last = now; sim += dt;
    const d = defOf(S.edit.v), key = JSON.stringify(S.edit.v), col = (ELEMENTS.find((e) => e.id === d.elem) || {}).color || '#ff8a2a';
    if (key !== cache) { cache = key; sim = 0; st = null; }
    g.clearRect(0, 0, W, H); g.fillStyle = '#0d0705'; g.fillRect(0, 0, W, H);
    // сетка 50 px мира
    const R = d.form === 'proj' ? Math.max(200, skRange(d) + (d.boom || 0)) : d.form === 'rain' ? (d.area + d.r) * 2.2 : d.form === 'nova' ? d.r * 2.4 : d.len * 1.3;
    const k = d.form === 'proj' || d.form === 'cone' || d.form === 'dash' ? (W - 40) / R : (W - 30) / R;
    const ox = d.form === 'proj' || d.form === 'cone' || d.form === 'dash' ? 24 : W / 2, oy = H / 2;
    g.strokeStyle = '#2a120a'; g.lineWidth = 1; const gs = 50 * k; for (let x = ox % gs; x < W; x += gs) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.stroke(); } for (let y = oy % gs; y < H; y += gs) { g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); }
    const P = (x, y) => [ox + x * k, oy + y * k];
    const mobs = S.mobOff ? [] : (d.form === 'proj' ? MOBS.map(([a, s]) => [a * skRange(d), s * skRange(d)]) : d.form === 'nova' ? [[d.r * 0.7, 0], [-d.r * 0.5, d.r * 0.6]] : d.form === 'rain' ? [[d.area * 0.3, -d.area * 0.2], [-d.area * 0.4, d.area * 0.3]] : [[d.len * 0.6, 0], [d.len * 0.9, d.form === 'cone' ? d.len * 0.3 : 0]]);
    const MR = 18, hitNow = new Set();
    let info = '';
    if (d.form === 'proj') {
      const range = skRange(d), T = range / Math.max(1, d.spd), n = Math.max(1, Math.min(12, d.n | 0)), spr = n > 1 ? (d.spread || 0) * Math.PI / 180 : 0;
      const hb = skHitbox(d), PP = { p: d.path, a: d.amp, f: d.freq, b: [d.b1a, d.b1s, d.b2a, d.b2s] };
      if (!st || sim > T + 0.8) { sim = sim > T + 0.8 ? 0 : sim; st = Array.from({ length: n }, (_, i) => { const a = n > 1 ? -spr / 2 + spr * i / (n - 1) : 0; return { dx: Math.cos(a), dy: Math.sin(a), hx: Math.cos(a), hy: Math.sin(a), x: 0, y: 0, s: 0, hits: new Set(), done: false, boomAt: -1 }; }); }
      const bolt = part(d, 'bolt'), burst = part(d, 'burst');
      for (const pr of st) {
        // путь (пунктир) — для детерминированных траекторий
        if (!S.ptOff && d.path !== 'homing') { g.strokeStyle = col + '66'; g.setLineDash([4, 4]); g.beginPath(); for (let s = 0; s <= range; s += Math.max(4, range / 80)) { const [x, y] = pathWorld(PP, 0, 0, pr.dx, pr.dy, s, range); const [cx, cy] = P(x, y); s ? g.lineTo(cx, cy) : g.moveTo(cx, cy); } g.stroke(); g.setLineDash([]); }
        if (!pr.done) {
          const ds = d.spd * dt;
          if (d.path === 'homing') {
            let best = null, bd = (d.seek || 0) ** 2; for (const [mx, my] of mobs) { const q = (mx - pr.x) ** 2 + (my - pr.y) ** 2; if (q < bd) { bd = q; best = [mx, my]; } }
            if (best) [pr.hx, pr.hy] = steer(pr.hx, pr.hy, best[0] - pr.x, best[1] - pr.y, d.turn, dt);
            pr.x += pr.hx * ds; pr.y += pr.hy * ds; pr.s += ds; (pr.tr ||= []).push([pr.x, pr.y]); if (pr.tr.length > 60) pr.tr.shift();
          } else { pr.s += ds; const [x, y, hx, hy] = pathWorld(PP, 0, 0, pr.dx, pr.dy, Math.min(pr.s, range), range); pr.x = x; pr.y = y; pr.hx = hx; pr.hy = hy; }
          for (let i = 0; i < mobs.length; i++) if (!pr.hits.has(i) && hbTouch(hb, pr.x, pr.y, pr.hx, pr.hy, mobs[i][0], mobs[i][1], MR)) { pr.hits.add(i); hitNow.add(i); if (pr.hits.size >= Math.max(1, d.pierce)) { pr.done = true; pr.boomAt = sim; } }
          if (pr.s >= range) { pr.done = true; pr.boomAt = sim; }
        }
        if (!S.ptOff && pr.tr) { g.strokeStyle = col + '88'; g.beginPath(); pr.tr.forEach(([x, y], j) => { const [cx, cy] = P(x, y); j ? g.lineTo(cx, cy) : g.moveTo(cx, cy); }); g.stroke(); }
        const [cx, cy] = P(pr.x, pr.y), ang = Math.atan2(pr.hy, pr.hx);
        if (!pr.done) {
          if (!drawPart(g, bolt, 'fly', sim, cx, cy, ang, k * (d.scale || 1))) { g.fillStyle = col; g.beginPath(); g.arc(cx, cy, 6, 0, 7); g.fill(); }
          if (!S.hbOff) { g.strokeStyle = '#7dd3fc'; g.lineWidth = 1.5; g.save(); g.translate(cx, cy); g.rotate(ang); if (hb.s === 'c') { g.beginPath(); g.arc(0, 0, hb.r * k, 0, 7); g.stroke(); } else g.strokeRect(hb.a0 * k, -hb.hw * k, (hb.a1 - hb.a0) * k, hb.hw * 2 * k); g.restore(); }
        } else if (pr.boomAt >= 0 && sim - pr.boomAt < 0.6 && d.boom > 0) {
          const tt = sim - pr.boomAt; if (!drawPart(g, burst, 'burst', tt, cx, cy, 0, k * (d.boom * 2) / (burst?.p.cell[0] || 216))) { g.fillStyle = col + '55'; g.beginPath(); g.arc(cx, cy, d.boom * k, 0, 7); g.fill(); }
          if (!S.hbOff) { g.strokeStyle = '#fca5a5'; g.beginPath(); g.arc(cx, cy, d.boom * k, 0, 7); g.stroke(); }
        }
      }
      const hbt = hb.s === 'c' ? `круг ⌀${Math.round(hb.r * 2)}` : `прямоугольник ${Math.round(hb.a1 - hb.a0)}×${Math.round(hb.hw * 2)}`;
      info = `Дальность ${Math.round(range)} px · полёт ${T.toFixed(2)} с · снарядов ${n}${n > 1 ? ` веером ${d.spread}°` : ''} · пробой ${d.pierce} · хитбокс ${hbt} px${d.hit === 'auto' ? ' (по картинке)' : ''}${d.boom ? ` · взрыв r${d.boom}` : ''}`;
    } else if (d.form === 'cone') {
      const T = 0.9; if (sim > T + 0.5) sim = 0; const a = (d.arc || 90) * Math.PI / 180, [cx, cy] = P(0, 0);
      g.fillStyle = col + '22'; g.strokeStyle = col; g.beginPath(); g.moveTo(cx, cy); g.arc(cx, cy, d.len * k, -a / 2, a / 2); g.closePath(); g.fill(); if (!S.hbOff) g.stroke();
      const L = part(d, 'lash'); drawPart(g, L, 'lash', sim, cx, cy, 0, k * d.len / (L?.p.cell[0] || 272), 1, Math.max(0.6, a / 1.2), false);
      mobs.forEach(([mx, my], i) => { const r = Math.hypot(mx, my), an = Math.abs(Math.atan2(my, mx)); if (sim < 0.4 && r <= d.len + MR && an <= a / 2) hitNow.add(i); });
      info = `Плеть: длина ${d.len} px · угол ${d.arc}°`;
    } else if (d.form === 'nova') {
      const ticks = Math.max(1, d.ticks | 0), gap = ticks > 1 ? d.tickGap / 1000 : 0, T = gap * (ticks - 1) + 0.7; if (sim > T + 0.4) sim = 0;
      const [cx, cy] = P(0, 0), Rn = part(d, 'ring');
      for (let i = 0; i < ticks; i++) { const tt = sim - i * gap; if (tt < 0 || tt > 0.7) continue; drawPart(g, Rn, 'ring', tt, cx, cy, 0, k * d.r * 2 / (Rn?.p.cell[0] || 296) * 1.1, 1, 1, false); if (tt < 0.08) mobs.forEach(([mx, my], j) => { if (Math.hypot(mx, my) <= d.r + MR) hitNow.add(j); }); }
      if (!S.hbOff) { g.strokeStyle = col; g.beginPath(); g.arc(cx, cy, d.r * k, 0, 7); g.stroke(); }
      info = `Кольцо: радиус ${d.r} px · ударов ${ticks}${ticks > 1 ? ` через ${d.tickGap} мс (каждый ×${(1 / Math.sqrt(ticks)).toFixed(2)})` : ''}`;
    } else if (d.form === 'rain') {
      const n = Math.max(1, d.drops | 0), lead = d.lead < 0 ? 0.3 : d.lead / 1000, gap = d.gap / 1000, T = lead + gap * n + 0.8; if (sim > T + 0.3) sim = 0;
      const [cx, cy] = P(0, 0); g.strokeStyle = col + '88'; g.setLineDash([5, 4]); g.beginPath(); g.arc(cx, cy, d.area * k, 0, 7); g.stroke(); g.setLineDash([]);
      const M = part(d, 'mark'), Dp = part(d, 'drop'), Im = part(d, 'impact');
      for (let i = 0; i < n; i++) {
        const u = (i * 0.618) % 1, rr = Math.sqrt((i * 0.371 + 0.13) % 1) * d.area, an = u * 6.283, x = Math.cos(an) * rr, y = Math.sin(an) * rr, [px, py] = P(x, y), tt = sim - lead - i * gap;
        if (tt < -0.4 || tt > 0.8) continue;
        if (tt < 0) { drawPart(g, M, 'mark', sim, px, py, 0, k * d.r * 2 / (M?.p.cell[0] || 128)); if (!S.hbOff) { g.strokeStyle = '#fca5a5'; g.beginPath(); g.arc(px, py, d.r * k, 0, 7); g.stroke(); } }
        else if (tt < 0.15) drawPart(g, Dp, 'drop', tt * 3, px, py - 40 * (1 - tt / 0.15), 0, k * 0.8);
        else { drawPart(g, Im, 'impact', tt - 0.15, px, py, 0, k * d.r * 2 / (Im?.p.cell[0] || 128), 1, 1, false); if (tt < 0.2) mobs.forEach(([mx, my], j) => { if (Math.hypot(mx - x, my - y) <= d.r + MR) hitNow.add(j); }); }
      }
      info = `Дождь: ${n} капель r${d.r} на площади r${d.area} · через ${d.gap} мс`;
    } else if (d.form === 'dash') {
      const T = 0.5; if (sim > T + 0.9) sim = 0; const u = Math.min(1, sim / T), [cx, cy] = P(0, 0), [hx, hy] = P(d.len * u, 0);
      if (!S.hbOff) { g.strokeStyle = col; g.strokeRect(cx, cy - d.w / 2 * k, d.len * k, d.w * k); }
      const Tr = part(d, 'trail'), Sp = part(d, 'spirit');
      drawPart(g, Tr, 'trail', sim, cx, cy, 0, k * d.len / (Tr?.p.cell[0] || 240) * u + 1e-3, 1, 1, false);
      drawPart(g, Sp, 'spirit', sim, hx, hy, 0, k * 1.2);
      g.fillStyle = '#ffe9d0'; g.beginPath(); g.arc(hx, hy, 7, 0, 7); g.fill();
      mobs.forEach(([mx, my], i) => { if (Math.abs(mx - d.len * u) < 14 && Math.abs(my) <= d.w / 2 + MR) hitNow.add(i); });
      info = `Рывок: ${d.len} px, полоса ${d.w} px${d.invuln ? ` · неуязвимость ${d.invuln} мс` : ''}${d.trail ? ` · след ×${d.trailMul}` : ''}`;
    }
    // мишени + герой
    for (let i = 0; i < mobs.length; i++) { const [mx, my] = P(mobs[i][0], mobs[i][1]); if (hitNow.has(i)) (st ||= []).flash = { ...(st?.flash || {}), [i]: sim }; const fl = st?.flash?.[i] != null && sim - st.flash[i] < 0.25 && sim >= st.flash[i]; g.strokeStyle = fl ? '#ef4444' : '#a3a3a3'; g.fillStyle = fl ? '#ef444455' : '#ffffff10'; g.beginPath(); g.arc(mx, my, MR * k, 0, 7); g.fill(); g.stroke(); }
    if (d.form !== 'dash') { const [hx, hy] = P(0, 0); g.fillStyle = '#ffe9d0'; g.beginPath(); g.arc(hx, hy, 6, 0, 7); g.fill(); }
    g.fillStyle = '#9fb3c8'; g.font = '10px sans-serif'; g.fillText(`клетка 50 px · ${(SKILL_FX?.elems?.[skFxElem(d)]?.slots?.[SK_SLOT[d.form]]) || '—'}`, 6, H - 6);
    if (inf && inf.dataset.v !== info + key) {
      inf.dataset.v = info + key; const mods = [0, 1, 2, 3].map((i) => d.mods?.[i]).filter((m) => m?.k);
      const dm = d.dmg === 'black' ? `чёрный ${d.pct}% ОЗ цели × k${d.k}` : d.dmg === 'pure' ? `чистый ${EL[d.elem]?.name || d.elem} ${d.pct}% × k${d.k}` : `обычный × k${d.k}`;
      inf.innerHTML = `${esc(info)}<br>Урон: ${esc(dm)}${d.mul !== 1 ? ` · ×${d.mul}` : ''} · КД ${d.cd} с${d.hpCost ? ` · цена ${d.hpCost}% ОЗ` : ''}${d.selfSlow ? ` · самозамедление ${d.selfSlow} мс` : ''}${mods.length ? '<br>Модификаторы: ' + mods.map((m) => esc(`${m.op === 'mul' ? '×' + m.v : (m.v >= 0 ? '+' : '') + m.v + '%'} ${m.k} ${m.ms ? m.ms / 1000 + ' с' : ''}${m.st > 1 ? ' до ' + m.st + ' ст.' : ''} ${m.on}${m.if ? ' если ' + m.if + (m.th ? ' ' + m.th + '%' : '') : ''}${m.ch < 100 ? ' шанс ' + m.ch + '%' : ''}`)).join('; ') : ''}`;
    }
  };
  requestAnimationFrame(frame);
}
