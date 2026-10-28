// Админка → «Задания доски»: создание, правка, копия, отключение и удаление заданий и достижений без разработчика.
// Цель, условия, предусловия, награды — выбором из списков (каталог сервера cat.bt). Сервер проверяет каждую правку
// (overrides.ts validatePatch/btTargetErr) и применяет её сразу (game_overrides, без выкладки). Предпросмотр — та же
// строка, что видит игрок в окне «Задания» (BoardWin.row поверх временной копии BoardStore).
import { esc } from './overlay.js';
import { BoardStore, PERIODIC } from '../meta/boardStore.js';
import { BoardWin } from './board.js';
import { btType, btDef, makeBtask, prepXp, tableXp, tierLvl, makeRoll, RANKS, BONUS_NAMES, BOARD_CFG } from '../../../../../server/meta/board.ts';
import { HERO_NAMES } from '../../../../../server/meta/shared.ts';
import { BCHEST, BC_TIERS, BC_ENCH_CAP, BC_CURSE_MAX, BC_SPEC_MAX, BC_SPEC_N, bcSpecErr, upView, QDEF_NAMES } from '../../../../../server/meta/boardChestCfg.ts';

const NEW_IDS = { __btnew: 'daily', __achnew: 'ach' };
const POOL_CATS = [['daily', 'Ежедневные', 'dailyMin', 'dailyMax'], ['weekly', 'Еженедельные', 'weeklyMin', 'weeklyMax'], ['monthly', 'Ежемесячные', 'monthlyMin', 'monthlyMax'], ['hard', 'Тяжёлые (на неделю)', 'hardMin', 'hardMax'], ['hunt', 'Заказы Доски объявлений', 'huntOffer', null]];
const TG_LABEL = { mob: 'Какие враги', res: 'Какой ресурс', loot: 'Что забрать', recipe: 'Какой рецепт', upmax: 'Что считать', room: 'Где', trial: 'Что считать', pvp: 'Какие бои', cat: 'Задания какого раздела', world: 'Куда прийти', state: 'Какое состояние' };
export const isCustom = (id) => /^cx_[a-z0-9_]{2,40}$/.test(String(id || ''));
export const newBtId = () => 'cx_' + Date.now().toString(36) + Math.floor(Math.random() * 1296).toString(36).padStart(2, '0');

/** пункты списка вкладки: создать, пулы — сверху */
export function btTopItems() {
  return [{ id: '__btnew', name: '＋ Новое задание' }, { id: '__achnew', name: '＋ Новое достижение' }, { id: '__pools', name: '⚖ Пулы, веса и лимиты' }];
}

/** значения шаблона (как с сервера currentValues) для нового задания */
function blankValues(cat, ev) {
  const t = makeBtask('cx_tmp', cat, ev), v = {};
  for (const k of ['cat', 'ev', 'on', 'title', 'why', 'pc', 'mob', 'giver', 'hl', 'ord', 'minLvl', 'maxLvl', 'lvl', 'req', 'm', 'f', 'minT', 'res', 'item', 'auto', 'hidden', 'hint', 'w', 'rmax', 'rb']) v[k] = t[k] ?? '';
  v.ch = [];
  for (let i = 0; i < 5; i++) { v[`n.${i}`] = t.n[i] || 0; v[`d.${i}`] = t.d[i] || 0; v[`x.${i}`] = 0; }
  v.xm = false; v.lvl = 0;
  if (cat === 'npc') v.giver = 'petr';
  return v;
}
/** значения формы → задание в формате сервера (для btDef и предпросмотра) */
function toTask(id, v) {
  const t = makeBtask(id, v.cat, v.ev);
  t.x = [0, 0, 0, 0, 0];
  for (const [k, x] of Object.entries(v)) { const m = /^([ndx])\.(\d)$/.exec(k); if (m) t[m[1]][+m[2]] = Number(x) || 0; else t[k] = x; }
  prepXp(t); // уровень (если 0) и опыт по таблице (если не вручную) — как на сервере
  return t;
}
/** проверка до отправки (те же правила, что на сервере; сервер всё равно проверит) */
export function checkValues(v, bt, ids) {
  const err = [];
  if (!String(v.title || '').trim()) err.push('Название не может быть пустым');
  let prev = 0, end = false;
  for (let i = 0; i < 5; i++) { const n = +v[`n.${i}`] || 0, d = +v[`d.${i}`] || 0;
    if (!n) { if (i === 0) err.push('Ступень 1: укажите, сколько нужно'); end = true; continue; }
    if (end) err.push(`Ступень ${i + 1}: после пустой ступени не может быть заполненной`);
    else if (n <= prev) err.push(`Ступень ${i + 1}: должно быть больше ступени ${i}`);
    if (!(d >= 1 && d <= 5)) err.push(`Ступень ${i + 1}: сложность 1…5`);
    prev = n; }
  if ((+v.minLvl || 1) > (+v.maxLvl || 30)) err.push('«Доступно с уровня» больше «до уровня»');
  { const e = bcSpecErr(Array.isArray(v.ch) && v.ch.length ? v.ch : null); if (e) err.push(e); }
  if (v.cat === 'npc' && !bt.npcGivers.includes(v.giver)) err.push('Задание персонажа: выберите, кто его выдаёт');
  const tg = bt.evs.find((e) => e.id === v.ev)?.target;
  if (tg === 'state' && !v.m) err.push('Выберите состояние');
  for (const r of String(v.req || '').split(',').map((s) => s.trim()).filter(Boolean)) { const rid = r.split('@')[0]; if (!ids.has(rid)) err.push(`Предусловие: нет задания ${rid}`); }
  return err;
}

/** какие условия имеют смысл для действия (как их проверяет сервер, board.ts amount) */
const WEAR = ['wearc', 'wearc5', 'dark50', 'naked'], ENCHF = (k) => k === 'ench' || /^e[1-6](up)?$/.test(k);
function flagFor(ev, k) {
  if (ev === 'kill') return k !== 'min'; // oneshot, skillonly, basiconly — тоже здесь
  if (ev === 'salvage' || ev === 'upgrade') return k === 'cursed' || ENCHF(k);
  if (ev === 'run') return k === 'solo' || k === 'min';
  if (ev === 'trial') return k === 'solo';
  if (ev === 'death') return WEAR.includes(k);
  return false;
}
/** список-выбор цели (по событию). Возвращает <select> с группами и поиском */
function targetPicker(cat, v) {
  const bt = cat.bt, tg = bt.evs.find((e) => e.id === v.ev)?.target ?? (v.ev === 'ui' ? 'ui' : '');
  if (tg === 'ui') return `<label><span>Цель (действие интерфейса, только встроенные шаги обучения)</span><input type="text" value="${esc(v.m || '')}" disabled></label>`;
  if (!tg) return `<p class="mc-dim">У этого действия нет цели — считается любое.</p>`;
  const o = (id, name, cur) => `<option value="${esc(id)}" ${id === cur ? 'selected' : ''}>${esc(name)}</option>`;
  const cur = v.m || '';
  let groups = [];
  if (tg === 'mob') {
    const mobs = (cat.mobs || []).slice().sort((a, b) => (a.lvl || 0) - (b.lvl || 0) || a.name.localeCompare(b.name, 'ru'));
    groups = [['', [['', 'Любые враги']]], ['Края (все враги края)', Object.entries(bt.biomes).map(([k, n]) => ['biome:' + k, `Край: ${n}`])],
      ['Типы врагов', Object.entries(bt.roles).map(([k, n]) => ['role:' + k, `Тип: ${n}`])],
      ['Мировые боссы', mobs.filter((m) => m.boss).map((m) => [m.id, `${m.name} · ур. ${m.lvl}`])],
      ['👹 Чёрные мобы (конструктор)', mobs.filter((m) => m.black).map((m) => [m.id, `${m.name} · ур. ${m.lvl}`])],
      ['Отголоски', mobs.filter((m) => !m.boss && !m.base && !m.black).map((m) => [m.id, `${m.name} · ур. ${m.lvl}`])],
      ['Отголоски краёв (варианты)', mobs.filter((m) => !m.boss && m.base).map((m) => [m.id, `${m.name} · ур. ${m.lvl}${m.biome ? ' · ' + (bt.biomes[m.biome] || m.biome) : ''}`])]];
    if (v.ev === 'kill') groups.push(['Вашим героем', Object.entries(bt.heroes).map(([k, n]) => ['cls:' + k, `Играя за: ${n}`])]);
  } else if (tg === 'res') groups = [['', [['', 'Любой ресурс']]], ['Ресурсы', (cat.res || []).map((r) => [r.id, `${r.icon || ''} ${r.name}`])]];
  else if (tg === 'loot') groups = [['', Object.entries(bt.loot).map(([k, n]) => [k, n])]], groups[0][1].unshift(['', 'Материалы (любые)']);
  else if (tg === 'recipe') groups = [['', [['', 'Любой рецепт']]], ['Рецепты', bt.recipes.map((r) => [r.id, r.name])]];
  else if (tg === 'upmax') groups = [['', [['', 'Каждое улучшение'], ['max', 'Лучшая заточка вещи (+N)']]]];
  else if (tg === 'room') groups = [['', [['', 'Любой забег'], ...Object.entries(bt.rooms)]]];
  else if (tg === 'trial') groups = [['', [['', 'Любое испытание'], ['full', 'Пройти все 8 волн'], ['max', 'Лучший результат (волн)']]]];
  else if (tg === 'pvp') groups = [['', [['', 'Любой бой'], ['win', 'Только победы']]]];
  else if (tg === 'cat') groups = [['', [['', 'Любого раздела'], ...bt.cats.map((c) => [c.id, c.name])]]];
  else if (tg === 'world') groups = [['', [['', 'Любой мир'], ...Object.entries(bt.worlds)]]];
  else if (tg === 'state') groups = [['Состояние героя и сумки', Object.entries(bt.states)], ['Победы над видом (с запуска)', (cat.mobs || []).map((m) => ['mob:' + m.id, `Побед: ${m.name}`])]];
  if (cur && !groups.some(([, L]) => L.some(([id]) => id === cur))) groups.unshift(['Текущее значение', [[cur, cur]]]);
  const html = groups.map(([g, L]) => L.length ? (g ? `<optgroup label="${esc(g)}">${L.map(([id, n]) => o(id, n, cur)).join('')}</optgroup>` : L.map(([id, n]) => o(id, n, cur)).join('')) : '').join('');
  return `<label class="wide"><span>${esc(TG_LABEL[tg] || 'Цель')}</span><span class="pick1"><input type="search" placeholder="поиск…" data-flt="m"><select data-v="m">${html}</select></span></label>`;
}

/** чипы «Сначала выполнить» (цепочки, в т.ч. личные задания персонажей) */
function reqHtml(cat, v, selfId) {
  const all = cat.ent.btask || [], by = new Map(all.map((e) => [e.id, e]));
  const L = String(v.req || '').split(',').map((s) => s.trim()).filter(Boolean);
  const chip = (r) => { const [id, ti] = r.split('@'); const e = by.get(id); return `<span class="chip">${esc(e?.values?.title || e?.name || id)}${ti ? ` · ступень ${esc(ti)}` : ''} <small>${esc(id)}</small> <button class="btn sm" data-rq-del="${esc(r)}">✕</button></span>`; };
  const opts = all.filter((e) => e.id !== selfId && e.cat !== 'tut').sort((a, b) => (a.cat || '').localeCompare(b.cat || '') || (a.values?.minLvl || 0) - (b.values?.minLvl || 0))
    .map((e) => `<option value="${esc(e.id)}">${esc((cat.bt.cats.find((c) => c.id === e.cat)?.name || e.cat) + ': ' + (e.values?.title || e.name))}${e.values?.giver && cat.bt.npcGivers.includes(e.values.giver) ? ' · ' + esc(cat.bt.givers[e.values.giver]) : ''}</option>`).join('');
  return `<div class="box"><b>Сначала выполнить</b> <small>цепочка: задание откроется, когда выполнены эти (у персонажей — как сюжетные квесты)</small>
    <div class="chips">${L.map(chip).join('') || '<span class="mc-dim">— нет —</span>'}</div>
    <span class="pick1"><input type="search" placeholder="поиск задания…" data-flt="rq"><select data-rq>${opts}</select></span>
    <select data-rq-t><option value="">полностью</option>${[1, 2, 3, 4].map((i) => `<option value="${i}">ступень ${i}</option>`).join('')}</select>
    <button class="btn" data-rq-add>＋ Добавить</button></div>`;
}

/** награда: материалы строками (выбор из списка), предмет — из списка с поиском */
function rewardHtml(cat, v) {
  const res = Object.entries(v.res || {});
  const rOpt = (cur) => (cat.res || []).map((r) => `<option value="${esc(r.id)}" ${r.id === cur ? 'selected' : ''}>${esc(`${r.icon || ''} ${r.name}`)}</option>`).join('');
  const items = (cat.items || []).slice().sort((a, b) => (a.slot || '').localeCompare(b.slot || '') || (a.lvl || 0) - (b.lvl || 0));
  const SL = { consumable: 'Расходники', quest: 'Квестовые', '': 'Прочее' };
  const grp = [...new Set(items.map((i) => i.slot || ''))].sort((a, b) => (a === 'consumable' ? -1 : b === 'consumable' ? 1 : a.localeCompare(b)));
  const iOpt = `<option value="">— нет —</option>` + grp.map((g) => `<optgroup label="${esc(SL[g] || g)}">${items.filter((i) => (i.slot || '') === g).map((i) => `<option value="${esc(i.id)}" ${i.id === v.item ? 'selected' : ''}>${esc(`${i.name} · ур. ${i.lvl}`)}</option>`).join('')}</optgroup>`).join('');
  return `<div class="box"><b>Награда</b> <small>опыт — по таблице «уровень × сложность ступени» (настройки Доски); материалы — за каждую ступень × номер ступени; предмет — за последнюю</small>
    <table class="rm">${res.map(([r, n], i) => `<tr><td><select data-rr="${i}">${rOpt(r)}</select></td><td><input type="number" min="1" max="999" data-rn="${i}" value="${n}"></td><td><button class="btn sm red" data-rdel="${i}">✕</button></td></tr>`).join('')}</table>
    <button class="btn sm" data-radd>＋ Материал</button>
    <label class="wide"><span>Предмет за последнюю ступень (расходник или вещь)</span><span class="pick1"><input type="search" placeholder="поиск предмета…" data-flt="item"><select data-v="item">${iOpt}</select></span></label>
    ${chestsHtml(cat, v, v.cat ? btType({ id: "", f: "", ...v }) : null)}
    <div class="xpv"></div></div>`;
}
/** награда «Сундуки» (поле ch): строки { сколько, ярус, уровень вещей, потолок чар, проклятость }; сервер проверяет те же правила (boardChestCfg bcSpecErr) */
const bcName = (cat, t, cur) => { const T = (cat.ent.bchest?.[0]?.values || {}); return (cur ? T[`tiers.${t}.nameC`] : T[`tiers.${t}.name`]) || (cur ? BCHEST.tiers[t]?.nameC : BCHEST.tiers[t]?.name) || t; };
/** умолчание типа (админка «Сундуки наград → По типам квестов»): «Добротный ×1, улучшение +1 12 % / +2 3 %» или «нет» */
export function qdefText(cat, type) {
  const T = cat?.ent?.bchest?.[0]?.values || {}, d = BCHEST.qdef?.[type] || {}, g = (k) => T[`qdef.${type}.${k}`] ?? d[k];
  const n = Number(g('n')) || 0; if (!n) return 'нет (только сундук ранга, если включён)';
  const u = Number(g('u')) || 0, u2 = Number(g('u2')) || 0;
  return `${bcName(cat, g('t'), false)} ×${n}${u || u2 ? ` · улучшение +1: ${u}%${u2 ? `, +2: ${u2}%` : ''}` : ''}`;
}
/** таблица «Сундуки» (общая: задания доски и квесты): сколько, ярус, уровень, чары, проклятость, шанс улучшения +1/+2; type — ключ умолчания */
export function chestsHtml(cat, v, type = null, what = 'за последнюю ступень') {
  const L = Array.isArray(v.ch) ? v.ch : [];
  const row = (x, i) => { const cap = BC_ENCH_CAP[x.t] ?? 0, cm = x.c === 'yes' ? 'yes' : typeof x.c === 'number' && x.c > 0 ? 'pct' : 'no', lm = !x.L ? 'task' : x.L2 ? 'range' : 'fix';
    return `<tr data-chr="${i}"><td><input type="number" min="1" max="${BC_SPEC_N}" data-ch="${i}.n" value="${x.n || 1}" title="Сколько сундуков"></td>
      <td><select data-ch="${i}.t">${BC_TIERS.map((t) => `<option value="${t}" ${t === x.t ? 'selected' : ''}>${esc(bcName(cat, t, false))}</option>`).join('')}</select></td>
      <td><select data-ch="${i}.lm"><option value="task" ${lm === 'task' ? 'selected' : ''}>по уровню задания ±2</option><option value="fix" ${lm === 'fix' ? 'selected' : ''}>ровно</option><option value="range" ${lm === 'range' ? 'selected' : ''}>от…до</option></select>
        ${lm !== 'task' ? `<input type="number" min="1" max="25" data-ch="${i}.L" value="${x.L || 1}" class="n2">` : ''}${lm === 'range' ? `…<input type="number" min="1" max="25" data-ch="${i}.L2" value="${x.L2 || x.L || 1}" class="n2">` : ''}</td>
      <td><select data-ch="${i}.e" ${cap ? '' : 'disabled title="Простой сундук не зачарован"'}><option value="-1" ${!(x.e >= 0) ? 'selected' : ''}>${cap ? `по ярусу (до ${cap})` : 'без чар'}</option>${cap ? Array.from({ length: cap + 1 }, (_, k) => `<option value="${k}" ${x.e === k ? 'selected' : ''}>${k ? `до яруса ${k}` : 'без чар'}</option>`).join('') : ''}</select></td>
      <td><select data-ch="${i}.cm"><option value="no" ${cm === 'no' ? 'selected' : ''}>нет</option><option value="yes" ${cm === 'yes' ? 'selected' : ''}>да («${esc(bcName(cat, x.t, true))}»)</option><option value="pct" ${cm === 'pct' ? 'selected' : ''}>шанс, %</option></select>
        ${cm === 'pct' ? `<input type="number" min="1" max="${BC_CURSE_MAX}" step="0.5" data-ch="${i}.c" value="${x.c}" class="n2">` : ''}</td>
      <td class="nw"><input type="number" min="0" max="100" step="0.5" data-ch="${i}.u" value="${x.u || 0}" class="n2" title="Шанс улучшиться на 1 ярус, % (0…100)">/<input type="number" min="0" max="100" step="0.5" data-ch="${i}.u2" value="${x.u2 || 0}" class="n2" title="Шанс улучшиться сразу на 2 яруса, % (0…100; бросается первым)"></td>
      <td><button class="btn sm red" data-chdel="${i}">✕</button></td></tr>`; };
  const ty = type || null, def = ty ? qdefText(cat, ty) : '';
  return `<div class="bt-ch"><b>Сундуки</b> ${ty ? `<label class="chk"><input type="checkbox" data-choff ${v.chOff ? 'checked' : ''}> без сундука</label>` : ''}
    ${ty ? `<div class="bt-chdef${L.length || v.chOff ? ' off' : ''}">${v.chOff ? '🚫 Сундук не выдаётся (даже по типу).' : L.length ? '✎ Свой список ниже — умолчание типа не действует.' : '↳ Пусто — действует умолчание типа'} «${esc(QDEF_NAMES[ty] || ty)}»: <b>${esc(def)}</b></div>` : ''}
    <small class="hlp">${esc(what)}, во вкладку 🎁; «Улучш. +1/+2» — шанс, что ярус поднимется (простой → добротный N %), бросок на сервере при выдаче; уровень вещей «по заданию» — уровень выпавшего ранга (или задания) ±2; чары — не выше яруса сундука (простой — без чар); проклятый — да или шанс до ${BC_CURSE_MAX} %; «чёрные проклятые» вещи (☠ + ✦6) — только из «Чёрного проклятого сундука». Хранилище — до ${BCHEST.maxStore || 100}: при полном задание не сдать.</small>
    ${L.length ? `<table class="rm ch"><tr><th>Сколько</th><th>Сундук</th><th>Уровень вещей</th><th>Зачарование</th><th>Проклятый</th><th title="Шанс улучшения яруса: +1 / +2, %">Улучш. +1/+2 %</th><th></th></tr>${L.map(row).join('')}</table>` : '<div class="mc-dim">— нет —</div>'}
    ${L.length < BC_SPEC_MAX ? '<button class="btn sm" data-chadd>＋ Сундук</button>' : ''}</div>`;
}
export function chestsBind(sec, v, redraw, upd) {
  const $$ = (q) => [...sec.querySelectorAll(q)];
  $$('[data-ch]').forEach((i) => i.addEventListener(i.tagName === 'SELECT' ? 'change' : 'input', () => {
    const [k, f] = i.dataset.ch.split('.'), x = v.ch[+k]; if (!x) return; const n = Number(i.value);
    // числа не подрезаем молча: вне пределов — сообщение при сохранении (bcSpecErr), а не тихая подмена значения в поле
    if (f === 'n') x.n = Math.round(n) || 0;
    else if (f === 't') { x.t = i.value; const cap = BC_ENCH_CAP[x.t] ?? 0; if (x.e > cap) x.e = cap; if (!cap) x.e = -1; redraw(); return; }
    else if (f === 'lm') { if (i.value === 'task') { x.L = 0; x.L2 = 0; } else if (i.value === 'fix') { x.L = x.L || 10; x.L2 = 0; } else { x.L = x.L || 10; x.L2 = Math.max(x.L, x.L2 || x.L + 2); } redraw(); return; }
    else if (f === 'L') x.L = Math.round(n) || 0;
    else if (f === 'L2') x.L2 = Math.round(n) || 0;
    else if (f === 'e') x.e = Math.round(n);
    else if (f === 'cm') { x.c = i.value === 'yes' ? 'yes' : i.value === 'pct' ? 10 : 'no'; redraw(); return; }
    else if (f === 'c') x.c = Number.isFinite(n) ? n : 0;
    else if (f === 'u' || f === 'u2') x[f] = Number.isFinite(n) ? n : 0;
    upd(); }));
  const off = sec.querySelector('[data-choff]'); if (off) off.onchange = () => { v.chOff = off.checked; redraw(); };
  $$('[data-chdel]').forEach((b) => (b.onclick = () => { v.ch.splice(+b.dataset.chdel, 1); redraw(); }));
  const add = sec.querySelector('[data-chadd]'); if (add) add.onclick = () => { if (!Array.isArray(v.ch)) v.ch = []; v.ch.push({ n: 1, t: 'rare', L: 0, L2: 0, e: -1, c: 'no' }); redraw(); };
}

/** шанс попасть в случайный набор периода: моделирование (те же веса и Min…Max, что на сервере) */
function poolChance(rows, kMin, kMax, runs = 3000) {
  const L = rows.filter((r) => r.on && r.w > 0), hit = new Map(L.map((r) => [r.id, 0])); if (!L.length) return hit;
  for (let s = 0; s < runs; s++) {
    const k = Math.min(L.length, kMin + (s % (Math.max(kMin, kMax) - kMin + 1))); const bag = L.slice(); let W = bag.reduce((a, r) => a + r.w, 0);
    for (let j = 0; j < k && bag.length; j++) { let x = Math.random() * W, i = 0; while (i < bag.length - 1 && (x -= bag[i].w) > 0) i++; hit.set(bag[i].id, hit.get(bag[i].id) + 1); W -= bag[i].w; bag.splice(i, 1); }
  }
  for (const [id, n] of hit) hit.set(id, Math.round((n / runs) * 100));
  return hit;
}
function boardVals(cat) { return (cat.ent.board || [])[0]?.values || {}; }
/** настройки Доски с сервера (и черновик) → копия BOARD_CFG в браузере: предпросмотр опыта и рангов считается по ним */
function syncCfg(cat, extra = {}) {
  for (const [path, val] of Object.entries({ ...boardVals(cat), ...extra })) {
    if (path.startsWith('_') || val === undefined || val === null) continue;
    const ks = path.split('.'); let o = BOARD_CFG;
    for (let i = 0; i < ks.length - 1; i++) { if (o[ks[i]] == null || typeof o[ks[i]] !== 'object') o[ks[i]] = /^\d+$/.test(ks[i + 1]) ? [] : {}; o = o[ks[i]]; }
    o[ks[ks.length - 1]] = val;
  }
}
/** полный патч из значений (без заголовков и пустых): сервер заменяет правку целиком */
export function cleanPatch(cat, kind, values) {
  const out = {}; for (const f of cat.schema[kind]?.fields || []) { if (f.t === 'hdr') continue; const x = values[f.path]; if (x !== null && x !== undefined) out[f.path] = x; }
  return out;
}

/** предпросмотр: строка задания, как в окне «Задания» (и «до/после» для скрытого) */
function previewHtml(panel, id, v) {
  const live = panel.board, t = toTask(id, v), def = btDef({ ...t, hidden: false }), hdef = t.hidden ? btDef(t) : null;
  const S = new BoardStore(() => {});
  S.defs = { ...(live?.defs || { on: true, givers: panel.cat.bt.givers, cfg: {} }), tasks: [def] }; S.byId = new Map([[def.id, def]]);
  S.st = { ...(live?.st || {}), p: { [id]: Math.floor((def.n[0] || 1) / 2) }, c: {}, tk: [], pin: [], lock: {}, reveal: {}, sel: { [def.cat]: [def.id] }, lvl: live?.st?.lvl || 10 };
  if (Array.isArray(v.ch) && v.ch.length && !bcSpecErr(v.ch)) S.st.bx = { [id]: v.ch.map((x) => { const cp = x.c === 'yes' ? 100 : typeof x.c === 'number' ? Math.min(BC_CURSE_MAX, x.c) : 0; return { k: x.n, n: bcName(panel.cat, x.t, cp === 100), c: BCHEST.tiers[x.t]?.color, nc: bcName(panel.cat, x.t, true), L: x.L || 0, L2: x.L2 || 0, e: x.e >= 0 ? x.e : -1, cp, up: upView(x.t, x.u || 0, x.u2 || 0) }; }) };
  if (v.chOff) S.st.bx = { [id]: [] };
  const W = Object.create(BoardWin.prototype); W.s = S; W.mode = ''; W.opt = { near: () => false, mobile: false };
  const row = (d) => { try { return W.row(d); } catch (e) { return `<p class="mc-dim">предпросмотр недоступен: ${esc(e.message)}</p>`; } };
  const g = v.giver, gName = panel.cat.bt.givers[g] || '';
  const where = v.cat === 'ach' ? 'Окно «Задания» → «Достижения» и Доска достижений' : v.cat === 'tut' ? 'Обучение' : panel.cat.bt.npcGivers.includes(g) ? `Диалог персонажа «${gName}»: над ним «❕», когда можно взять, и «✔», когда можно сдать` : g === 'board' || v.cat === 'hunt' ? 'Доска объявлений в Аринаре (взять и сдать — у доски)' : 'Окно «Задания» → «' + (panel.cat.bt.cats.find((c) => c.id === v.cat)?.name || v.cat) + '»';
  const per = PERIODIC.includes(v.cat) ? ' · случайный набор периода (вес ' + (+v.w || 0) + ')' : '', pool = PERIODIC.includes(v.cat) || v.cat === 'hunt';
  let ranked = '';
  if (pool) { // примеры выпадения: те же формулы, что на сервере (makeRoll), герой уровня «доступно с» (или 10)
    const hl = Math.max(+v.minLvl || 1, Math.min(+v.maxLvl || 30, 10)), want = ['F', 'D', 'A', 'S', 'SS'], got = {};
    for (let i = 0; i < 6000 && Object.keys(got).length < want.length; i++) { const R = makeRoll(t, hl, 'pv' + i, 'pv', ['warrior', 'mage']); if (want.includes(R.r) && !got[R.r]) got[R.r] = R; }
    const S2 = new BoardStore(() => {}); S2.base = { ...(live?.defs || { on: true, givers: panel.cat.bt.givers, cfg: {} }), tasks: [def] };
    ranked = want.filter((r) => got[r]).map((r) => { S2.st = { ...(live?.st || {}), p: { [id]: 0 }, c: {}, tk: [], pin: [], lock: {}, reveal: {}, sel: { [def.cat]: [def.id] }, roll: { [id]: got[r] } }; S2.merge(); const W2 = Object.create(BoardWin.prototype); W2.s = S2; W2.mode = ''; W2.opt = W.opt; try { return W2.row(S2.def(id)); } catch (e) { return ''; } }).join('');
    ranked = ranked ? `<div class="mc-dim">Примеры выпадения у героя ${hl} ур. (ранги F, D, A, S, SS):</div>${ranked}` : '';
  }
  return `<div class="bt-prev">${hdef ? `<div class="mc-dim">До получения:</div>${row(hdef)}<div class="mc-dim">После получения:</div>` : ''}${row(def)}</div>
    <p class="mc-dim">Где игрок его видит: ${esc(where)}${esc(per)}${v.on ? '' : ' · <b>выключено — игроки не видят</b>'}</p>${ranked}`;
}

/** форма задания/достижения */
export function btaskForm(panel, sec, e, opts = {}) {
  syncCfg(panel.cat);
  const cat = panel.cat, bt = cat.bt, isNew = !e, D0 = panel.btDraft, id = isNew ? (opts.id || (D0?.isNew && D0.at === panel.sel ? D0.id : newBtId())) : e.id, custom = isCustom(id);
  const v = panel.btDraft && panel.btDraft.id === id ? panel.btDraft.v : JSON.parse(JSON.stringify(isNew ? opts.values || blankValues(opts.cat || 'daily', opts.ev || 'kill') : e.values));
  panel.btDraft = { id, v, isNew, at: panel.sel };
  const ids = new Set((cat.ent.btask || []).map((x) => x.id));
  const sel = (path, L, cur, dis) => `<select data-v="${path}" ${dis ? 'disabled' : ''}>${L.map(([k, n]) => `<option value="${esc(k)}" ${k === cur ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select>`;
  const num = (path, label, min, max) => `<label><span>${esc(label)}</span><input type="number" min="${min}" max="${max}" step="1" data-v="${path}" value="${v[path] ?? ''}"></label>`;
  const catL = (isNew ? bt.cats : [{ id: v.cat, name: (bt.cats.find((c) => c.id === v.cat)?.name) || (v.cat === 'tut' ? 'Обучение' : v.cat) }]).map((c) => [c.id, c.name]);
  const evL = [...bt.evs.map((x) => [x.id, x.name]), ...(v.ev === 'ui' ? [['ui', 'Действие в интерфейсе (обучение)']] : [])];
  const gL = Object.entries(bt.givers).map(([k, n]) => [k, k === '' ? '— окно «Задания» (без персонажа)' : k === 'board' ? 'Доска объявлений' : `${n} (личное задание в диалоге)`]);
  const flags = String(v.f || '').split(',').map((s) => s.trim()).filter(Boolean);
  const tierRow = (i) => `<tr><td>Ступень ${i + 1}</td><td><input type="number" min="0" max="1000000" data-v="n.${i}" value="${v[`n.${i}`] || 0}"></td><td>${sel(`d.${i}`, [[0, '—'], [1, '1 · легко'], [2, '2'], [3, '3 · средне'], [4, '4'], [5, '5 · очень трудно']].map(([a, b]) => [String(a), b]), String(v[`d.${i}`] || 0))}</td><td><input type="number" min="0" max="10000000" data-v="x.${i}" value="${v[`x.${i}`] || 0}" title="Опыт за ступень — число. Изменили — опыт станет «вручную»"></td><td class="xp" data-xp="${i}"></td></tr>`;
  const pool = PERIODIC.includes(v.cat) || v.cat === 'hunt';
  sec.innerHTML = `<div class="btf">
    <h3>${isNew ? (v.cat === 'ach' ? '＋ Новое достижение' : '＋ Новое задание') : esc(v.title)} <small style="color:#9a8bb8">${esc(id)} · ${custom ? 'создано в админке' : 'встроенное'}</small></h3>
    <div class="cols"><div class="fm">
    <div class="box"><b>Основное</b><div class="grid">
      <label class="wide"><span>Название</span><input type="text" maxlength="160" data-v="title" value="${esc(v.title || '')}"></label>
      <label class="wide"><span>Зачем (одна строка для игрока)</span><input type="text" maxlength="160" data-v="why" value="${esc(v.why || '')}"></label>
      <label><span>Раздел</span>${sel('cat', catL, v.cat, !isNew)}</label>
      <label class="wide"><span>Что нужно сделать</span>${sel('ev', evL, v.ev, !isNew)}</label>
      ${v.cat === 'ach' || v.cat === 'tut' ? '' : `<label class="wide"><span>Кто выдаёт и принимает</span>${sel('giver', gL, v.giver || '')}</label>`}
      <label><span>Включено</span><input type="checkbox" data-v="on" ${v.on ? 'checked' : ''}></label>
      <label><span>Скрытое («???» до получения)</span><input type="checkbox" data-v="hidden" ${v.hidden ? 'checked' : ''}></label>
      ${v.hidden ? `<label class="wide"><span>Подсказка скрытого до выполнения (необязательно, пусто — стандартная строка)</span><input type="text" maxlength="160" data-v="hint" value="${esc(v.hint || '')}"></label>` : ''}
      ${num('ord', 'Порядок в списке', 0, 9999)}
    </div>${isNew ? '' : '<small class="mc-dim">Раздел и «что сделать» у сохранённого задания не меняются (на них завязан прогресс игроков) — нажмите «Копировать» и измените копию.</small>'}</div>
    <div class="box"><b>Цель и условия</b>${targetPicker(cat, v)}
      <div class="chips flg">${Object.entries(bt.flags).filter(([k]) => flagFor(v.ev, k) || flags.includes(k)).map(([k, n]) => `<label title="${esc(k)}"><input type="checkbox" data-flag="${esc(k)}" ${flags.includes(k) ? 'checked' : ''}>${esc(n)}</label>`).join('')}</div>
      ${Object.keys(bt.flags).some((k) => flagFor(v.ev, k)) ? '' : '<small class="mc-dim">Дополнительных условий у этого действия нет.</small>'}
      ${v.ev === 'run' ? num('minT', 'Забег не короче, секунд', 0, 3600) : ''}</div>
    <div class="box"><b>Ступени</b> <small>каждая следующая больше предыдущей; пустая ступень — конец</small>
      <table class="tiers"><tr><th></th><th>Сколько</th><th>Сложность</th><th>Опыт (число)</th><th>По таблице*</th></tr>${[0, 1, 2, 3, 4].map(tierRow).join('')}</table>
      <p><label style="display:inline-flex"><span>Опыт задан вручную</span><input type="checkbox" data-v="xm" ${v.xm ? 'checked' : ''}></label> <button class="btn sm" data-xrecalc>↻ Пересчитать по таблице</button></p>
      <small class="mc-dim">Опыт — одно и то же число героям любого уровня. * по таблице «уровень задания × сложность» (вкладка «📋 Доска»); без «вручную» сервер сам держит опыт равным таблице.</small></div>
    <div class="box"><b>Доступность</b><div class="grid">${num('minLvl', 'Доступно с уровня', 1, 30)}${num('maxLvl', 'До уровня (для пула)', 1, 30)}${num('lvl', 'Уровень задания (от него опыт; 0 — подобрать по цели)', 0, 30)}
      ${pool ? `<label><span>Вес в случайном наборе (0 — не выпадает)</span><input type="number" min="0" max="100" step="0.5" data-v="w" value="${v.w ?? 1}"></label>
      <label><span>Высший ранг при выпадении</span>${sel('rmax', [['', 'по событию (S/SS — бои, забеги, испытания)'], ...RANKS.map((r) => [r, 'до ' + r])], v.rmax || '')}</label>
      <label><span>Выполнить на теле (сдаёт и награждается тело-владелец)</span>${sel('rb', [['', 'на своём теле (владелец)'], ['any', 'на любом теле'], ...Object.entries(HERO_NAMES)], v.rb || '')}</label>` : ''}</div>
      ${pool ? '<small class="mc-dim">Повторяющееся: при выпадении сервер бросает ранг F…SS — он меняет количество, уровень врагов, опыт и бонусные условия (настройки рангов — «⚖ Пулы, веса и лимиты»). Числа выше — основа для ранга D.</small>' : ''}</div>
    ${reqHtml(cat, v, id)}
    ${rewardHtml(cat, v)}
    <details class="box"><summary><b>Подсказки и обучение</b></summary><div class="grid">
      <label class="wide"><span>Подсказка: ПК</span><input type="text" maxlength="160" data-v="pc" value="${esc(v.pc || '')}"></label>
      <label class="wide"><span>Подсказка: телефон</span><input type="text" maxlength="160" data-v="mob" value="${esc(v.mob || '')}"></label>
      <label><span>Подсветка</span><input type="text" maxlength="40" data-v="hl" value="${esc(v.hl || '')}"></label>
      <label><span>Засчитать само (обучение)</span><input type="text" maxlength="40" data-v="auto" value="${esc(v.auto || '')}"></label></div></details>
    <div class="acts"><div class="errs"></div><p><button class="btn gold" data-bt-save>${isNew ? '✚ Создать' : '💾 Сохранить'}</button>
      <button class="btn" data-bt-copy>⧉ Копировать</button>
      ${isNew ? '<button class="btn" data-bt-cancel>Отмена</button>' : custom ? '<button class="btn red" data-bt-del>🗑 Удалить</button>' : `<button class="btn" data-bt-onoff>${e.values.on ? '⏻ Отключить' : '⏻ Включить'}</button> <button class="btn red" data-bt-reset>↺ Вернуть исходное</button>`}</p></div>
    </div><div class="pv"><b>Как увидит игрок</b><div class="pvb"></div></div></div></div>`;
  const $ = (s) => sec.querySelector(s), $$ = (s) => [...sec.querySelectorAll(s)];
  const redraw = () => btaskForm(panel, sec, e, opts);
  const upd = () => {
    $('.pvb').innerHTML = previewHtml(panel, id, v);
    const T0 = toTask(id, { ...v, xm: false }); for (let i = 0; i < 5; i++) { const c = sec.querySelector(`[data-xp="${i}"]`); if (c) c.textContent = +v[`n.${i}`] > 0 ? `${tableXp(T0, i)} (ур. ${tierLvl(T0, i)})` : ''; }
    if (!v.xm) { const T1 = toTask(id, v); for (let i = 0; i < 5; i++) { v[`x.${i}`] = T1.x[i]; const inp = sec.querySelector(`[data-v="x.${i}"]`); if (inp && document.activeElement !== inp) inp.value = T1.x[i]; } }
    const er = checkValues(v, bt, ids); $('.errs').innerHTML = er.length ? `<div class="box err">${er.map((x) => '✖ ' + esc(x)).join('<br>')}</div>` : '';
  };
  $$('[data-v]').forEach((i) => i.addEventListener(i.tagName === 'SELECT' || i.type === 'checkbox' ? 'change' : 'input', () => {
    const p = i.dataset.v; v[p] = i.type === 'checkbox' ? i.checked : i.type === 'number' ? (i.value === '' ? 0 : Number(i.value)) : i.value;
    if (/^x\.\d$/.test(p)) { v.xm = true; const c = sec.querySelector('[data-v="xm"]'); if (c) c.checked = true; }
    if (p === 'cat' || p === 'ev') { if (p === 'ev') v.m = ''; if (p === 'cat' && v.cat === 'npc' && !bt.npcGivers.includes(v.giver)) v.giver = bt.npcGivers[0]; redraw(); return; }
    upd();
  }));
  $$('[data-flag]').forEach((i) => i.addEventListener('change', () => { v.f = $$('[data-flag]:checked').map((x) => x.dataset.flag).join(','); upd(); }));
  $$('[data-flt]').forEach((q) => q.addEventListener('input', () => { const s = q.nextElementSibling, t = q.value.trim().toLowerCase();
    s.querySelectorAll('option').forEach((o) => { o.hidden = !!t && !o.textContent.toLowerCase().includes(t) && !o.value.toLowerCase().includes(t); });
    s.querySelectorAll('optgroup').forEach((g) => { g.hidden = ![...g.querySelectorAll('option')].some((o) => !o.hidden); });
    const f = [...s.querySelectorAll('option')].find((o) => !o.hidden); if (t && f && s.selectedOptions[0]?.hidden) { s.value = f.value; s.dispatchEvent(new Event('change')); } }));
  $('[data-xrecalc]').onclick = () => { v.xm = false; redraw(); panel.msg('Опыт пересчитан по таблице — сохраните'); };
  // предусловия
  $('[data-rq-add]').onclick = () => { const rid = $('[data-rq]').value, ti = $('[data-rq-t]').value; if (!rid) return; const L = String(v.req || '').split(',').map((s) => s.trim()).filter(Boolean); const r = ti ? `${rid}@${ti}` : rid; if (!L.includes(r)) L.push(r); v.req = L.join(','); redraw(); };
  $$('[data-rq-del]').forEach((b) => (b.onclick = () => { v.req = String(v.req || '').split(',').map((s) => s.trim()).filter((x) => x && x !== b.dataset.rqDel).join(','); redraw(); }));
  // материалы
  const resArr = () => Object.entries(v.res || {});
  $$('[data-rr]').forEach((s) => s.addEventListener('change', () => { const a = resArr(); a[+s.dataset.rr][0] = s.value; v.res = Object.fromEntries(a); redraw(); }));
  $$('[data-rn]').forEach((s) => s.addEventListener('input', () => { const a = resArr(); a[+s.dataset.rn][1] = Math.max(1, Math.min(999, +s.value || 1)); v.res = Object.fromEntries(a); upd(); }));
  $$('[data-rdel]').forEach((b) => (b.onclick = () => { const a = resArr(); a.splice(+b.dataset.rdel, 1); v.res = Object.fromEntries(a); redraw(); }));
  $('[data-radd]').onclick = () => { const free = (cat.res || []).find((r) => !(r.id in (v.res || {}))); if (!free) return; v.res = { ...(v.res || {}), [free.id]: 1 }; redraw(); };
  chestsBind(sec, v, redraw, upd);
  // действия
  $('[data-bt-save]').onclick = () => {
    const er = checkValues(v, bt, ids); if (er.length) { panel.msg('✖ ' + er[0], true); upd(); return; }
    const patch = cleanPatch(cat, 'btask', v);
    panel.btPending = id; panel.msg(isNew ? 'Создание…' : 'Сохранение…'); panel.send({ type: 'admin_save', kind: 'btask', id, patch });
  };
  $('[data-bt-copy]').onclick = () => { const nv = JSON.parse(JSON.stringify(v)); nv.title = String(nv.title || '').slice(0, 150) + ' (копия)'; if (nv.cat === 'tut') nv.cat = 'daily'; if (nv.ev === 'ui') nv.ev = 'kill';
    const nid = newBtId(); panel.btDraft = null; panel.sel = '__copy'; panel.btCopy = { id: nid, values: nv }; panel.render(); panel.msg('Копия — проверьте и нажмите «Создать»'); };
  $('[data-bt-cancel]')?.addEventListener('click', () => { panel.btDraft = null; panel.sel = null; panel.render(); });
  $('[data-bt-del]')?.addEventListener('click', () => { if (confirm(`Удалить «${v.title}»?\nУ игроков пропадёт прогресс по нему. Отменить нельзя.`)) { panel.btDraft = null; panel.send({ type: 'admin_reset', kind: 'btask', id }); } });
  $('[data-bt-reset]')?.addEventListener('click', () => { if (confirm('Вернуть значения из кода (удалить правку)?')) { panel.btDraft = null; panel.send({ type: 'admin_reset', kind: 'btask', id }); } });
  $('[data-bt-onoff]')?.addEventListener('click', () => { const on = !e.values.on; if (!on && !confirm(`Отключить «${v.title}»? Игроки перестанут его видеть; прогресс сохранится.`)) return; panel.btDraft = null; panel.send({ type: 'admin_save', kind: 'btask', id, patch: { ...cleanPatch(cat, 'btask', e.values), on } }); });
  upd();
}

/** пулы: сколько выпадает за период и веса заданий; сохраняет только изменённое (по одной правке, сервер принимает не чаще 3/с) */
export function poolsForm(panel, sec) {
  const cat = panel.cat, bv = boardVals(cat), d = panel.poolDraft || (panel.poolDraft = { b: {}, w: {}, on: {} });
  const ent = cat.ent.btask || [];
  const val = (k) => (k in d.b ? d.b[k] : bv[k]);
  const part = POOL_CATS.map(([c, name, kMin, kMax]) => {
    const rows = ent.filter((x) => x.cat === c).map((x) => ({ id: x.id, t: x.values.title, on: x.id in d.on ? d.on[x.id] : !!x.values.on, w: x.id in d.w ? d.w[x.id] : +(x.values.w ?? 1), lvl: `${x.values.minLvl}–${x.values.maxLvl}` }));
    const lo = +val(kMin) || 0, hi = kMax ? +val(kMax) || lo : lo, ch = poolChance(rows, lo, hi), W = rows.filter((r) => r.on).reduce((a, r) => a + (r.w > 0 ? r.w : 0), 0);
    return `<details class="box" ${panel.poolOpen === c ? 'open' : ''} data-pc="${c}"><summary><b>${esc(name)}</b> · заданий ${rows.length} (включено ${rows.filter((r) => r.on).length}, в пуле ${rows.filter((r) => r.on && r.w > 0).length}) · выпадает ${kMax ? `${lo}–${hi}` : lo} · сумма весов ${Math.round(W * 10) / 10}</summary>
      <div class="grid"><label><span>${kMax ? 'Сколько выпадает: от' : 'Заказов на доске за день'}</span><input type="number" min="0" max="20" data-pb="${kMin}" value="${val(kMin)}"></label>${kMax ? `<label><span>до</span><input type="number" min="0" max="20" data-pb="${kMax}" value="${val(kMax)}"></label>` : ''}</div>
      <table class="pool"><tr><th>Вкл.</th><th>Задание</th><th>Уровни</th><th>Вес</th><th>Шанс попасть в набор*</th></tr>${rows.sort((a, b) => b.w - a.w || a.t.localeCompare(b.t, 'ru')).map((r) => `<tr class="${r.on ? '' : 'off'}"><td><input type="checkbox" data-pon="${r.id}" ${r.on ? 'checked' : ''}></td><td><a href="#" data-pgo="${r.id}">${esc(r.t)}</a> <small>${esc(r.id)}</small></td><td>${r.lvl}</td><td><input type="number" min="0" max="100" step="0.5" data-pw="${r.id}" value="${r.w}"></td><td>${r.on && r.w > 0 ? (ch.get(r.id) ?? 0) + '%' : '—'}</td></tr>`).join('')}</table></details>`;
  }).join('');
  const changed = Object.keys(d.b).length + Object.keys(d.w).length + Object.keys(d.on).length;
  // ранги: веса, +уровней, множители, бонусы (те же поля, что «📋 Доска»); пример — еженедельное «Неделя охоты» у героя 10 ур.
  syncCfg(cat, d.b);
  const W = RANKS.reduce((a, r) => a + Math.max(0, +val(`ranks.${r}.w`) || 0), 0) || 1, ex = {};
  const tpl = makeBtask('cx_ex', 'weekly', 'kill'); tpl.n = [400, 0, 0, 0, 0]; tpl.d = [3, 0, 0, 0, 0]; tpl.f = 'lvl'; tpl.why = 'Враги';
  for (let i = 0; i < 20000 && Object.keys(ex).length < RANKS.length; i++) { const R = makeRoll(tpl, 10, 'ex' + i, 'ex', ['warrior', 'mage']); if (!ex[R.r]) ex[R.r] = R; }
  const rin = (k, a, b, st = 1) => `<input type="number" min="${a}" max="${b}" step="${st}" data-pb="${k}" value="${val(k) ?? ''}">`;
  const rankBox = `<details class="box" ${panel.poolOpen === 'ranks' ? 'open' : ''} data-pc="ranks"><summary><b>Ранги F…SS</b> · вес выпадения, сложность, опыт, бонусы</summary>
    <table class="pool rk"><tr><th>Ранг</th><th>Вес</th><th>Шанс</th><th>+уровней врагов</th><th>× опыта</th><th>× количества</th><th>Бонусов</th><th>Пример: неделя, герой 10 ур.</th></tr>
    ${RANKS.map((r) => { const R = ex[r]; return `<tr><td><b class="mc-rank r-${r}">${r}</b></td><td>${rin(`ranks.${r}.w`, 0, 1000, 0.1)}</td><td>${Math.round((Math.max(0, +val(`ranks.${r}.w`) || 0) / W) * 1000) / 10}%</td><td>${rin(`ranks.${r}.plus`, -10, 20)}</td><td>${rin(`ranks.${r}.mul`, 0, 50, 0.1)}</td><td>${rin(`ranks.${r}.cnt`, 0.1, 10, 0.1)}</td><td>${rin(`ranks.${r}.bon`, 0, 3)}</td>
      <td><small>${R ? esc(`${R.f === 'wboss' ? 'мировые боссы ×' + R.n : `${R.n} врагов ${R.minL}+ ур.`} · +${R.x} опыта${R.bon.length ? ` · бонусы ${R.bon.length}×+${R.bon[0].xp}` : ''}`) : '—'}</small></td></tr>`; }).join('')}</table>
    <div class="grid">${['daily', 'weekly', 'monthly', 'hard', 'hunt'].map((c) => `<label><span>${esc({ daily: 'Ежедневные', weekly: 'Еженедельные', monthly: 'Ежемесячные', hard: 'Тяжёлые', hunt: 'Заказы Доски' }[c])}: ранги</span><input type="checkbox" data-pbb="rankOn.${c}" ${val(`rankOn.${c}`) !== false ? 'checked' : ''}></label><label><span>+уровней сверх ранга</span>${rin(`catPlus.${c}`, -5, 10)}</label>`).join('')}</div>
    <small class="mc-dim">Уровень врагов = уровень героя при выпадении + «+уровней» ранга + «сверх ранга» раздела. S и SS — только для боёв, забегов и испытаний; SS у героя 8+ — мировые боссы (звать отряд). Прогресс засчитывается всем членам отряда рядом. Изменения — для новых выпадений (со следующего периода).</small></details>
  <details class="box" ${panel.poolOpen === 'bonus' ? 'open' : ''} data-pc="bonus"><summary><b>Бонусные условия</b> · пул, опыт</summary>
    <div class="grid"><label><span>Опыт за каждое выполненное бонусное, % от опыта ранга</span>${rin('bonusXp', 0, 500)}</label>
    ${Object.entries(BONUS_NAMES).map(([k, n]) => `<label><span>${esc(n)}</span><input type="checkbox" data-pbb="bonus.${k}.on" ${val(`bonus.${k}.on`) !== false ? 'checked' : ''}></label>`).join('')}
    <label><span>«Враги выше вас»: на сколько уровней</span>${rin('bonus.higher.n', 1, 15)}</label>
    ${['daily', 'weekly', 'monthly', 'hard', 'hunt'].map((c) => `<label><span>«Уложиться»: ${c === 'daily' ? 'ежедневные' : c === 'weekly' ? 'еженедельные' : c === 'monthly' ? 'ежемесячные' : c === 'hard' ? 'тяжёлые' : 'заказы'}, мин</span>${rin(`bonus.fast.${c}`, 5, 10000)}</label>`).join('')}</div>
    <small class="mc-dim">Все условия проверяет сервер: смерть, время, тело героя, уровень и элитность врага, отряд, ночь. Условий, которые знает только клиент (например, «без зелий»), нет.</small></details>`;
  sec.innerHTML = `<div class="btf"><h3>⚖ Пулы, веса и лимиты</h3>
    <p class="mc-dim">Каждому игроку на период (день/неделю/месяц, сброс по Киеву) выпадает случайный набор, одинаковый для него весь период. Вероятность задания — его вес; 0 — не выпадает. * шанс — моделирование 3000 наборов без учёта уровня героя.</p>
    ${part}
    ${rankBox}
    <div class="box"><b>Лимиты и шкалы</b><div class="grid">${[['pinMax', 'Отслеживаемых заданий (трекер, стрелки, карта)', 1, 30], ['trackMax', 'Отслеживаемых врагов из Бестиария', 1, 30], ['huntMax', 'Взятых заказов Доски', 1, 30], ['npcMax', 'Взятых личных заданий персонажей', 1, 30]].map(([k, n, a, b]) => `<label><span>${esc(n)}</span><input type="number" min="${a}" max="${b}" data-pb="${k}" value="${val(k)}"></label>`).join('')}
      <label><span>Шкала прогресса достижений</span><input type="checkbox" data-pbb="bars.ach" ${val('bars.ach') !== false ? 'checked' : ''}></label><label><span>Шкала прогресса Бестиария</span><input type="checkbox" data-pbb="bars.lib" ${val('bars.lib') !== false ? 'checked' : ''}></label></div>
      <small class="mc-dim">Таблица опыта, множители и дневные пороги опыта по разделам — вкладка «📋 Доска» → «Доска заданий: настройки…».</small></div>
    <p class="acts"><button class="btn gold" data-psave ${changed ? '' : 'disabled'}>💾 Сохранить изменения (${changed})</button> <button class="btn" data-pundo ${changed ? '' : 'disabled'}>Отменить</button></p></div>`;
  const $$ = (s) => [...sec.querySelectorAll(s)], keep = () => { panel.poolOpen = sec.querySelector('details[open][data-pc]')?.dataset.pc || panel.poolOpen; };
  $$('details[data-pc]').forEach((x) => x.addEventListener('toggle', () => { if (x.open) panel.poolOpen = x.dataset.pc; }));
  const re = () => { keep(); const y = sec.scrollTop; poolsForm(panel, sec); sec.scrollTop = y; };
  $$('[data-pb]').forEach((i) => i.addEventListener('change', () => { d.b[i.dataset.pb] = Number(i.value); re(); }));
  $$('[data-pbb]').forEach((i) => i.addEventListener('change', () => { d.b[i.dataset.pbb] = i.checked; re(); }));
  $$('[data-pw]').forEach((i) => i.addEventListener('change', () => { d.w[i.dataset.pw] = Math.max(0, Math.min(100, Number(i.value) || 0)); re(); }));
  $$('[data-pon]').forEach((i) => i.addEventListener('change', () => { d.on[i.dataset.pon] = i.checked; re(); }));
  $$('[data-pgo]').forEach((a) => (a.onclick = (ev) => { ev.preventDefault(); panel.sel = a.dataset.pgo; panel.btJump = true; panel.render(); }));
  sec.querySelector('[data-pundo]').onclick = () => { panel.poolDraft = null; re(); };
  sec.querySelector('[data-psave]').onclick = () => {
    const q = [];
    for (const [k, mn, mx] of [['daily', 'dailyMin', 'dailyMax'], ['weekly', 'weeklyMin', 'weeklyMax'], ['monthly', 'monthlyMin', 'monthlyMax'], ['hard', 'hardMin', 'hardMax']]) if (+val(mn) > +val(mx)) { panel.msg(`✖ ${k}: «от» больше «до»`, true); return; }
    if (Object.keys(d.b).length) q.push({ type: 'admin_save', kind: 'board', id: 'main', patch: cleanPatch(cat, 'board', { ...bv, ...d.b }) });
    for (const id of new Set([...Object.keys(d.w), ...Object.keys(d.on)])) { const x = ent.find((y) => y.id === id); if (x) q.push({ type: 'admin_save', kind: 'btask', id, patch: { ...cleanPatch(cat, 'btask', x.values), ...(id in d.w ? { w: d.w[id] } : {}), ...(id in d.on ? { on: d.on[id] } : {}) } }); }
    panel.poolDraft = null; panel.sendQueue(q, `Пулы: сохранено ${q.length}`);
  };
}

export const BT_CSS = `
.mc-admin .btf .cols{display:grid;grid-template-columns:minmax(0,1fr) 360px;gap:12px;align-items:start}
.mc-admin .btf .pv{position:sticky;top:0;border:1px solid #6b4fa0;border-radius:8px;padding:8px;background:#110b1e}
.mc-admin .btf .pv .mc-bd-row{margin:4px 0}.mc-admin .btf .bt-prev{font-family:monospace;color:#e2e8f0;font-size:12px}
.mc-admin .btf label.wide{grid-column:1/-1}.mc-admin .btf label.wide input[type=text]{flex:1;min-width:200px}
.mc-admin .btf .pick1{display:flex;gap:4px;flex:1;min-width:0}.mc-admin .btf .pick1 select{flex:1;min-width:0;max-width:100%}.mc-admin .btf .pick1 input{width:120px}
.mc-admin .btf .flg{margin-top:6px}.mc-admin .btf .flg label{font-size:11px}
.mc-admin .btf table.tiers input{width:100px}.mc-admin .btf table.tiers td.xp{font-size:11px}.mc-admin .btf td.xp{color:#86efac}
.mc-admin .btf .box.err{border-color:#f87171;color:#fca5a5}
.mc-admin .btf .bt-ch{margin-top:8px}.mc-admin .btf .bt-ch table.ch td{padding:2px 3px;white-space:nowrap}.mc-admin .btf .bt-ch input.n2{width:52px}.mc-admin .btf .bt-ch input[data-ch$='.n']{width:52px}
.mc-admin .btf .chip{display:inline-flex;gap:4px;align-items:center;border:1px solid #3b2c52;border-radius:6px;padding:2px 6px;background:#140e24}
.mc-admin .btf table.pool tr.off{opacity:.5}.mc-admin .btf table.rk input{width:58px}.mc-admin .btf table.pool input[type=number]{width:70px}
.mc-admin .btf details>summary{cursor:pointer}.mc-admin .btf a{color:#c4b5fd}.mc-admin .btf .acts p{margin:4px 0 0}.mc-admin .btf .acts .box.err{margin:0}
.mc-admin .btf .acts{position:sticky;bottom:0;background:rgba(10,7,20,.95);padding:6px 0;margin:0}
/* телефон: вкладки админки — одной прокручиваемой строкой, больше места форме */
.mc-admin.sheet header .tabs{display:flex;flex-wrap:nowrap;overflow-x:auto;max-width:100%;gap:4px}.mc-admin.sheet header .tabs button{white-space:nowrap}
@media (max-width:900px){.mc-admin .btf .cols{grid-template-columns:1fr}.mc-admin .btf .pv{position:static}}
`;
