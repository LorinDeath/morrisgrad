// Админка «👹 Чёрные мобы» (чёрная магия, этап В): конструктор мобов из частей тела Художника + оружие в руке,
// живое превью (анимации, сетка, силуэт героя, хитбокс/агро), лагеря/логова с таймерами, части тела, настройки.
// Черновик моба сохраняется сам (admin_bmm draft → bmc_mdraft), «Опубликовать» — правка bmmob (аудит, версия, у всех сразу).
import { BM_PARTS, BP_TYPE_NAMES, BP_ELEMS, BP_ELEM_NAMES, BP_ELEM_ICONS } from '../../../../../server/meta/blackArt.ts';
import { RESOURCES } from '../../../../../server/meta/shared.ts';
import { esc } from './overlay.js';
import { elTag } from './bmArtUi.js';
import { MobPreview, bodyIndex } from './bmMobArt.js';
import { weaponManifest } from './bmWeaponArt.js';

const CSS = `
.bmma{color:#ffe9d0}
.bmma .sub{display:flex;gap:6px;margin-bottom:8px;flex-wrap:wrap}
.bmma .sub button,.bmma .b{background:#2a0f06;border:1px solid #a8320f;color:#fdba74;border-radius:5px;padding:4px 10px;cursor:pointer}
.bmma .sub button.on{background:#a8320f;color:#fff7e6}
.bmma .b.pri{background:linear-gradient(#ff7a1a,#a8320f);color:#fff7e6;border-color:#ffb347;font-weight:700}
.bmma .b.warn{border-color:#ef4444;color:#fca5a5}
.bmma .cols{display:grid;grid-template-columns:210px 1fr 330px;gap:10px}
@media (max-width:1000px){.bmma .cols{grid-template-columns:1fr}}
.bmma .pl{max-height:64vh;overflow:auto;border:1px solid #5c1a0b;border-radius:6px;background:#140904}
.bmma .pl div{padding:4px 8px;cursor:pointer;border-bottom:1px solid #2a0f06;font-size:12px}
.bmma .pl div.on{background:#3a1206}
.bmma .pl .g{color:#ffb347;font-weight:700;cursor:default;background:#1a0d08}
.bmma .dr{color:#fde047}
.bmma .fm{display:grid;grid-template-columns:1fr 1fr 1fr;gap:4px 10px;font-size:12px}
.bmma .fm label{display:flex;flex-direction:column;gap:2px}
.bmma .fm .w{grid-column:1/-1}
.bmma .fm .hd{grid-column:1/-1;color:#ffb347;font-weight:700;margin-top:6px;border-bottom:1px solid #5c1a0b}
.bmma input,.bmma select{background:#1a0d08;color:#ffe9d0;border:1px solid #a8320f;border-radius:4px;padding:3px}
.bmma .st{font-size:12px;margin:6px 0;min-height:16px}
.bmma .st.draft{color:#fde047}.bmma .st.ok{color:#86efac}.bmma .st.err{color:#fca5a5}
.bmma canvas{width:320px;height:320px;border-radius:8px;border:1px solid #a8320f;image-rendering:pixelated}
.bmma table{width:100%;border-collapse:collapse;font-size:12px}
.bmma td,.bmma th{border-bottom:1px solid #2a0f06;padding:3px 5px;text-align:left}
.bmma th{color:#ffb347}
.bmma .fin{font-size:11px;color:#fdba74;margin-top:4px}
.bmma .ef{display:flex;gap:4px;flex-wrap:wrap;margin-bottom:6px;align-items:center}.bmma .ef button.on{background:#a8320f;color:#fff7e6}
.bmma .pl .eg{color:#9fb3c8;font-size:11px;cursor:default;background:#100a07;padding:2px 8px}
.bmma tr[data-elem="ice"] td,.bmma .pl div[data-elem="ice"]{color:#bfe6ff}
.bmma canvas.bpv{width:150px;height:150px}
.bmma-hov{position:fixed;z-index:999;pointer-events:none;border:1px solid #a8320f;border-radius:8px;background:#0b0604;box-shadow:0 0 18px #0009;width:160px;height:160px;image-rendering:pixelated}
`;
let cssOn = false;
const css = () => { if (cssOn) return; cssOn = true; const s = document.createElement('style'); s.textContent = CSS; document.head.appendChild(s); };
const DRAFT_MS = 900;
const clone = (x) => JSON.parse(JSON.stringify(x ?? null));
const ANIMS = [['all', 'все по кругу'], ['idle', 'покой'], ['walk', 'шаг'], ['atk', 'атака'], ['hurt', 'удар по нему'], ['die', 'смерть']];

export function mountBmMobs(ap, sec) {
  css(); bodyIndex(); weaponManifest();
  const S = (ap.bmm ||= { sub: 'mobs', list: null, sel: null, edit: null, status: '', stCls: '', anim: 'all', grid: true, hero: true, rings: true });
  if (!S.list && !S.asked) { S.asked = true; ap.send({ type: 'admin_bmm', op: 'list' }); }
  const subs = [['mobs', '👹 Мобы'], ['camps', '⛺ Лагеря и логова'], ['placed', '📌 Поставленные лагеря'], ['body', '🦴 Части тела'], ['cfg', '⚙ Настройки']];
  sec.innerHTML = `<div class="bmma"><h3>👹 Чёрные мобы <small class="mc-dim">черновик сохраняется сам · «Опубликовать» — у всех сразу · снятие — флажок «Снят», не удаление</small></h3>
    <div class="sub">${subs.map(([k, n]) => `<button data-bs="${k}" class="${S.sub === k ? 'on' : ''}">${n}</button>`).join('')}<span style="flex:1"></span><button class="b" data-bx="reload">↻ Обновить</button></div><div class="bd"></div></div>`;
  const bd = sec.querySelector('.bd');
  sec.querySelectorAll('[data-bs]').forEach((b) => (b.onclick = () => { S.sub = b.dataset.bs; mountBmMobs(ap, sec); }));
  sec.querySelector('[data-bx="reload"]').onclick = () => { S.list = null; S.asked = false; mountBmMobs(ap, sec); };
  if (!S.list) { bd.innerHTML = '<p class="mc-dim">Загрузка…</p>'; return; }
  if (S.sub === 'camps') return camps(ap, S, bd, sec);
  if (S.sub === 'placed') return placed(ap, S, bd, sec);
  if (S.sub === 'body') return body(ap, S, bd, sec);
  if (S.sub === 'cfg') return cfg(ap, S, bd, sec);
  return mobs(ap, S, bd, sec);
}
const resName = (r) => RESOURCES[r]?.name || r;
const EL_ICON = (el) => BP_ELEM_ICONS[el] || '◆'; // ось стихий — из реестра ELEMENTS
const elOf = (x) => x?.el || x?.elem || 'fire';
/** кнопки фильтра по стихии (key — поле S) */
const elFilter = (S, key) => `<div class="ef">${[['', 'Все'], ...BP_ELEMS.map((x) => [x, `${EL_ICON(x)} ${BP_ELEM_NAMES[x] || x}`])].map(([k, n]) => `<button class="b ${(S[key] || '') === k ? 'on' : ''}" data-ef="${key}:${esc(k)}">${esc(n)}</button>`).join('')}</div>`;
const bindElFilter = (ap, S, bd, sec) => bd.querySelectorAll('[data-ef]').forEach((b) => (b.onclick = () => { const [k, v] = b.dataset.ef.split(':'); S[k] = v; hoverOff(); mountBmMobs(ap, sec); }));
/** <option> по стихиям (optgroup) */
const optsByEl = (L, sel, lab) => BP_ELEMS.map((el) => { const G = L.filter((x) => elOf(x) === el); return G.length ? `<optgroup label="${EL_ICON(el)} ${esc(BP_ELEM_NAMES[el] || el)}">${G.map((x) => `<option value="${esc(x.id)}" ${sel === x.id ? 'selected' : ''}>${esc(lab(x))}</option>`).join('')}</optgroup>` : ''; }).join('');
// превью по наведению/клику: одна часть тела (+ торс/голова той же стихии) — покой при наведении, клик — атака
let HOV = null;
function bodyPreviewMob(S, b) { const B = S.list.body || [], el = elOf(b), pick = (slot) => B.find((x) => x.slot === slot && elOf(x) === el && !x.hidden) || B.find((x) => x.slot === slot);
  const body = {}; for (const s of S.list.req || ['torso', 'head']) { const x = pick(s); if (x) body[s] = { ...x }; } body[b.slot] = { ...b }; return { name: b.name, body, weapon: {}, scale: 1, radius: 18, aggro: 0 }; }
function hoverOn(S, el, b, anim) { if (!b) return;
  if (!HOV) { const cv = document.createElement('canvas'); cv.width = 160; cv.height = 160; cv.className = 'bmma-hov'; document.body.appendChild(cv); HOV = { cv, pv: new MobPreview(cv) }; Object.assign(HOV.pv, { grid: false, hero: false, rings: false, zoom: 1.4 }); }
  const r = el.getBoundingClientRect(); HOV.cv.style.left = `${Math.round(Math.min(innerWidth - 166, r.right + 8))}px`; HOV.cv.style.top = `${Math.round(Math.max(4, Math.min(innerHeight - 166, r.top - 60)))}px`; HOV.cv.style.display = '';
  HOV.pv.anim = anim; HOV.pv.set(bodyPreviewMob(S, b)); HOV.pv.start(); }
function hoverOff() { if (HOV) { HOV.pv.stop(); HOV.cv.style.display = 'none'; } }
const liveTxt = (c) => !c.live ? (c.hidden ? 'выключен' : c.err ? '⚠ ' + c.err : '—') : !c.live.alive && c.live.total ? `разбит · возрождение через ${Math.max(0, Math.round(c.live.next || 0))} с` : `живы ${c.live.alive}/${c.live.total}${c.live.next ? ` · ⏳ следующий через ${Math.round(c.live.next)} с` : ''}${c.live.state === 1 ? ' · ⚔ бой' : ''}`;
function mobs(ap, S, bd, sec) {
  const L = S.list, drafts = new Map((L.drafts || []).map((d) => [d.id, d]));
  const all = [...L.mobs]; for (const [id, d] of drafts) if (!all.some((m) => m.id === id)) all.push({ id, ...(d.data || {}), _new: true });
  const mf = S.mef || '';
  const list = `<div class="g">Мобы <button class="b" style="float:right;padding:0 6px" data-new="1" title="Новый моб">＋</button></div>` + BP_ELEMS.map((el) => { const G = all.filter((m) => (m.el || m.elem || 'fire') === el && (!mf || mf === el)); return G.length ? `<div class="eg">${elTag(el)} · ${G.length}</div>` + G.map((m) => `<div data-m="${esc(m.id)}" data-elem="${el}" class="${S.sel === m.id ? 'on' : ''}">${EL_ICON(el)} ${esc(m.name || m.id)} <small class="mc-dim">${esc(L.classNames?.[m.cls] || m.cls || '')} ${m.lvl || ''}</small>${drafts.has(m.id) ? ' <span class="dr" title="Неопубликованный черновик">✎</span>' : ''}${m._new ? ' <small class="dr">новый</small>' : ''}${m.hidden ? ' <small class="mc-dim">снят</small>' : ''}</div>`).join('') : ''; }).join('');
  const e = S.edit; let form = '<p class="mc-dim">Выберите моба слева или создайте нового (＋).</p>';
  if (e) {
    const d = e.data, B = L.body || [], P = L.parts || [];
    const itemName = (id) => (L.gear || []).find((g) => g.id === id)?.name || id, tierName = (t) => (L.tiers || []).find((x) => x.id === t)?.name || t;
    const gv = (k) => k.split('.').reduce((o, x) => (o == null ? undefined : o[x]), d);
    const num = (k, lab, mn, mx, st = 1, tip = '') => `<label${tip ? ` title="${esc(tip)}"` : ''}>${esc(lab)}<input type="number" data-k="${k}" data-n="1" min="${mn}" max="${mx}" step="${st}" value="${gv(k) ?? ''}"></label>`;
    const slotSel = (s) => `<label>${esc(L.slotNames?.[s] || s)}${(L.req || []).includes(s) ? ' *' : ''}<select data-k="body.${s}"><option value="">— нет —</option>${optsByEl(B.filter((b) => b.slot === s && (!b.hidden || d.body?.[s] === b.id)), d.body?.[s], (b) => `${b.name || b.id}${b.img ? '' : ' (заглушка)'}`)}</select></label>`;
    const wSel = (t) => `<label>${esc(BP_TYPE_NAMES[t] || t)}<select data-k="weapon.${t}" ${d.artId ? 'disabled' : ''}><option value="">— нет —</option>${optsByEl(P.filter((p) => p.type === t && (!p.hidden || d.weapon?.[t] === p.id)), d.weapon?.[t], (p) => p.name || p.id)}</select></label>`;
    const fin = L.mobs.find((m) => m.id === e.id)?.final;
    form = `<div class="fm">
      <label class="w">Имя<input type="text" data-k="name" value="${esc(d.name || '')}"></label>
      <label>Класс (табличка)<select data-k="cls">${(L.classes || []).map((c) => `<option value="${c}" ${d.cls === c ? 'selected' : ''}>${esc(L.classNames?.[c] || c)}</option>`).join('')}</select></label>
      <label>Стихия<select data-k="elem"><option value="" ${!d.elem ? 'selected' : ''}>авто (по лезвию / торсу)</option>${BP_ELEMS.map((x) => `<option value="${x}" ${d.elem === x ? 'selected' : ''}>${EL_ICON(x)} ${esc(BP_ELEM_NAMES[x] || x)}</option>`).join('')}</select></label>
      ${num('lvl', 'Уровень', 1, 60)}<label>&nbsp;<button class="b" data-x="auto" title="Статы как у обычных мобов этого уровня × настройка">⚖ Авто по уровню</button></label>
      <div class="hd">Статы (база; итог = база × части тела × класс + оружие)</div>
      ${num('hp', 'ОЗ', 1, 1e9)}${num('dmg', 'Урон', 0, 1e6, 'any')}${num('armor', 'Броня', 0, 1e6)}${num('speed', 'Скорость', 10, 400)}${num('aggro', 'Агро, px', 0, 2000)}${num('radius', 'Хитбокс, px', 6, 80)}${num('xp', 'Опыт', 0, 1e7)}${num('scale', 'Размер, ×', 0.4, 3, 0.05)}
      <label>Зачарование<select data-k="ench" data-n="1">${[0, 1, 2, 3, 4, 5, 6].map((n) => `<option value="${n}" ${Number(d.ench || 0) === n ? 'selected' : ''}>${n ? 'ярус ' + n + (n === 6 ? ' (Чёрный)' : '') : 'по миру'}</option>`).join('')}</select></label>
      ${num('take', 'Получаемый чёрный урон, ×', 0, 1000, 'any', 'Множитель чёрного урона игроков по этому мобу (удары, навыки, чистый). 1 / пусто — как было. Предельная броня моба режет уже итог.')}
      <label style="flex-direction:row;align-items:center;gap:6px"><input type="checkbox" data-k="cursed" ${d.cursed ? 'checked' : ''}> Всегда проклятый</label>
      <label style="flex-direction:row;align-items:center;gap:6px" title="По игроку: только «Чёрный урон, %» деталей, % навыков и чистый % — от макс. ОЗ ИГРОКА; плоский «Урон» и разница уровней не идут. «Урон» остаётся для боя с мобами."><input type="checkbox" data-k="pctOnly" ${d.pctOnly ? 'checked' : ''}> Урон по игрокам — только %</label>
      <label style="flex-direction:row;align-items:center;gap:6px"><input type="checkbox" data-k="hidden" ${d.hidden ? 'checked' : ''}> Снят с публикации</label>
      <div class="hd">Тело (листы Художника; * — обязательно) <small class="mc-dim">❄ ледяные части и ледяные детали — только у ледяного моба; огненные можно смешивать</small></div>${(L.slots || []).map(slotSel).join('')}
      <div class="hd">Оружие в руке: детали кузни или артефакт игрока</div>${(L.bpTypes || []).map(wSel).join('')}
      <label class="w">Артефакт игрока (вместо деталей)<select data-k="artId"><option value="">— нет, из деталей —</option>${(L.arts || []).map((a) => `<option value="${esc(a.id)}" ${d.artId === a.id ? 'selected' : ''}>${esc(a.name)} · ${esc(a.id)}</option>`).join('')}</select></label>
      <div class="hd">Дроп</div>
      <div class="w"><table><tr><th>Ресурс</th><th>Шанс %</th><th>Кол-во</th><th></th></tr>${(d.drops || []).map((x, i) => `<tr><td>${esc(resName(x.res))}</td><td>${x.chance}</td><td>${x.qty?.[0]}–${x.qty?.[1]}</td><td><button class="b warn" data-dd="${i}">✕</button></td></tr>`).join('')}
        <tr><td><select class="dres">${(L.res || []).map((r) => `<option value="${esc(r.id)}">${esc(r.name)}</option>`).join('')}</select></td><td><input class="dch" type="number" min="0" max="100" step="0.1" value="10" style="width:60px"></td><td><input class="dqa" type="number" min="1" max="99" value="1" style="width:40px">–<input class="dqb" type="number" min="1" max="99" value="1" style="width:40px"></td><td><button class="b" data-x="dadd">＋</button></td></tr></table></div>
      <div class="hd">Снаряжение в дроп <small class="mc-dim">обычные вещи; шанс за убийство</small></div>
      <div class="w"><table><tr><th>Вещь</th><th>Шанс %</th><th></th></tr>${(d.gear || []).map((x, i) => `<tr><td>${esc(itemName(x.item))}</td><td>${x.chance}</td><td><button class="b warn" data-gd="${i}">✕</button></td></tr>`).join('')}
        <tr><td><select class="gitem">${(S.list.gear || []).map((r) => `<option value="${esc(r.id)}">${esc(r.name)}</option>`).join('')}</select></td><td><input class="gch" type="number" min="0" max="100" step="0.1" value="5" style="width:60px"></td><td><button class="b" data-x="gadd">＋</button></td></tr></table></div>
      <div class="hd">Сундуки наград <small class="mc-dim">ранг сундука доски; уходит владельцу добычи (элита — шанс ×2)</small></div>
      <div class="w"><table><tr><th>Ранг</th><th>Шанс %</th><th>Проклятый %</th><th>Ур.</th><th></th></tr>${(d.chests || []).map((x, i) => `<tr><td>${esc(tierName(x.t))}</td><td>${x.chance}</td><td>${x.c || 0}</td><td>${x.L || 'моба'}</td><td><button class="b warn" data-cd="${i}">✕</button></td></tr>`).join('')}
        <tr><td><select class="ct">${(S.list.tiers || []).map((r) => `<option value="${esc(r.id)}">${esc(r.name)}</option>`).join('')}</select></td><td><input class="cch" type="number" min="0" max="100" step="0.1" value="10" style="width:60px"></td><td><input class="cc" type="number" min="0" max="100" value="0" style="width:50px"></td><td><input class="cl" type="number" min="0" max="25" value="0" style="width:40px" title="0 — уровень моба"></td><td><button class="b" data-x="cadd">＋</button></td></tr></table></div>
      <div class="hd">Движение <small class="mc-dim">рывок к цели / отскок стрелка, телепорт, тени-послеобразы цвета стихии; пусто — нет</small></div>
      ${num('move.spd', 'Скорость, ×', 0.2, 4, 0.05, 'множитель к итоговой скорости')}${num('move.dash.cd', 'Рывок: перезарядка, мс', 300, 60000, 100)}${num('move.dash.len', 'Рывок: длина, px', 20, 600)}${num('move.dash.spd', 'Рывок: скорость, px/с', 200, 4000, 50)}${num('move.blink.cd', 'Телепорт: перезарядка, мс', 500, 60000, 100)}${num('move.blink.range', 'Телепорт: дальность, px', 40, 800)}${num('move.ghost', 'Теней при рывке', 0, 8)}
      <div class="hd">Поддержка: лечение и бафф союзников <small class="mc-dim">в бою, раз в перезарядку; навыки с «лечением» лечат те же цели</small></div>
      <label title="Кого лечит: себя / всех чёрных союзников в радиусе (из своего лагеря) / одного самого раненого">Цель лечения<select data-k="sup.tgt">${[['', '— нет (только навыки, себя) —'], ['self', 'себя'], ['allies', 'всех союзников в радиусе'], ['low', 'самого раненого союзника']].map(([k, n]) => `<option value="${k}" ${(d.sup?.tgt || '') === k ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
      ${num('sup.r', 'Радиус, px', 40, 1200)}${num('sup.pct', 'Лечение, % ОЗ цели', 0, 100, 0.5)}${num('sup.cd', 'Перезарядка, мс', 500, 120000, 100)}
      <label>Бафф союзникам<select data-k="sup.buff">${[['', '— нет —'], ['dmg', '⚔ урон +%'], ['shield', '🛡 щит −50 % урона'], ['spd', '💨 рывок скорости']].map(([k, n]) => `<option value="${k}" ${(d.sup?.buff || '') === k ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
      ${num('sup.bv', 'Бафф урона, %', 1, 300)}${num('sup.bms', 'Длительность баффа, мс', 300, 60000, 100)}
    </div>
    ${fin ? `<div class="fin">Опубликовано, итог: ОЗ ${Math.round(fin.hp)} · урон ${(+fin.dmg).toFixed(1)} · броня ${Math.round(fin.armor)} · скорость ${Math.round(fin.speed)} · ${fin.ranged ? 'дальний бой' : 'ближний бой'}</div>` : ''}
    <div class="st ${S.stCls}">${esc(S.status)}</div>
    <button class="b pri" data-x="pub">📣 Опубликовать</button> <button class="b" data-x="discard" ${e.hasDraft ? '' : 'disabled'}>✕ Отменить черновик</button> <span class="mc-dim" style="font-size:11px">id: ${esc(e.id)} — для квестов охоты и доски: цель «${esc(e.id)}»</span>`;
  }
  const pvBox = e ? `<canvas width="320" height="320"></canvas>
    <div style="display:flex;gap:6px;flex-wrap:wrap;font-size:12px;margin-top:4px"><select data-pv="anim">${ANIMS.map(([k, n]) => `<option value="${k}" ${S.anim === k ? 'selected' : ''}>${n}</option>`).join('')}</select>
    <label><input type="checkbox" data-pv="grid" ${S.grid ? 'checked' : ''}> сетка</label><label><input type="checkbox" data-pv="hero" ${S.hero ? 'checked' : ''}> герой</label><label><input type="checkbox" data-pv="rings" ${S.rings ? 'checked' : ''}> хитбокс/агро</label><label title="Моб смотрит влево: весь риг (тело, оружие, свечение) зеркально, как в мире при ходьбе/атаке влево"><input type="checkbox" data-pv="faceL" ${S.faceL ? 'checked' : ''}> ◀ смотрит влево</label></div>
    <p class="mc-dim" style="font-size:11px">Живое превью: части тела Художника по z (хвост → правая рука), оружие в точке хвата кадра. Клик по превью — атака ↔ все по кругу.</p>` : '';
  bd.innerHTML = `<div class="cols"><div>${elFilter(S, 'mef')}<div class="pl">${list}</div></div><div>${form}</div><div>${pvBox}</div></div>`;
  bindElFilter(ap, S, bd, sec);
  bd.querySelectorAll('[data-m]').forEach((el) => (el.onclick = () => select(ap, S, el.dataset.m, sec)));
  bd.querySelector('[data-new]').onclick = () => { if (S.newAt && Date.now() - S.newAt < 5000) return; S.newAt = Date.now(); S.status = 'Создание…'; ap.send({ type: 'admin_bmm', op: 'new', lvl: 8, cls: 'warrior', tmp: newTmp() }); }; // двойной клик — один черновик
  if (!e) return;
  const cv = bd.querySelector('canvas'); S.pv?.stop(); S.pv = new MobPreview(cv); Object.assign(S.pv, { anim: S.anim, grid: S.grid, hero: S.hero, rings: S.rings, faceL: !!S.faceL }); preview(S); S.pv.start();
  cv.style.cursor = 'pointer'; cv.onclick = () => { S.anim = S.anim === 'atk' ? 'all' : 'atk'; S.pv.anim = S.anim; const sl = bd.querySelector('[data-pv="anim"]'); if (sl) sl.value = S.anim; };
  bd.querySelectorAll('[data-pv]').forEach((el) => (el.onchange = () => { const k = el.dataset.pv; S[k] = el.type === 'checkbox' ? el.checked : el.value; S.pv[k] = S[k]; }));
  const touch = (rerender) => { S.status = 'Черновик: сохраняется…'; S.stCls = 'draft'; const st = bd.querySelector('.st'); if (st) { st.className = 'st draft'; st.textContent = S.status; }
    preview(S); clearTimeout(S.dt); S.dt = setTimeout(() => ap.send({ type: 'admin_bmm', op: 'draft', id: e.id, data: e.data }), DRAFT_MS); if (rerender) mountBmMobs(ap, sec); };
  const onEdit = (el) => { const k = el.dataset.k; let v = el.type === 'checkbox' ? el.checked : el.value;
    if (el.dataset.n) { v = el.value === '' ? undefined : Number(v); if (v !== undefined && !Number.isFinite(v)) return; }
    const ks = k.split('.'); let t = e.data; for (const x of ks.slice(0, -1)) t = t[x] = t[x] && typeof t[x] === 'object' ? t[x] : {};
    if (v === undefined) delete t[ks.at(-1)]; else t[ks.at(-1)] = v; touch(k === 'artId'); };
  bd.querySelectorAll('[data-k]').forEach((el) => { el.oninput = () => onEdit(el); el.onchange = () => onEdit(el); });
  bd.querySelectorAll('[data-dd]').forEach((b) => (b.onclick = () => { e.data.drops.splice(Number(b.dataset.dd), 1); touch(true); }));
  bd.querySelector('[data-x="dadd"]').onclick = () => { const v = (s) => bd.querySelector(s).value; (e.data.drops ||= []).push({ res: v('.dres'), chance: Number(v('.dch')), qty: [Number(v('.dqa')), Math.max(Number(v('.dqa')), Number(v('.dqb')))] }); touch(true); };
  bd.querySelectorAll('[data-gd]').forEach((b) => (b.onclick = () => { e.data.gear.splice(Number(b.dataset.gd), 1); touch(true); }));
  bd.querySelectorAll('[data-cd]').forEach((b) => (b.onclick = () => { e.data.chests.splice(Number(b.dataset.cd), 1); touch(true); }));
  bd.querySelector('[data-x="gadd"]').onclick = () => { const v = (s) => bd.querySelector(s).value; if (!v('.gitem')) return; (e.data.gear ||= []).push({ item: v('.gitem'), chance: Number(v('.gch')) }); touch(true); };
  bd.querySelector('[data-x="cadd"]').onclick = () => { const v = (s) => bd.querySelector(s).value; const c = { t: v('.ct'), chance: Number(v('.cch')) }; if (Number(v('.cc'))) c.c = Number(v('.cc')); if (Number(v('.cl'))) c.L = Number(v('.cl')); (e.data.chests ||= []).push(c); touch(true); };
  bd.querySelector('[data-x="auto"]').onclick = () => ap.send({ type: 'admin_bmm', op: 'auto', lvl: Number(e.data.lvl) || 1 });
  bd.querySelector('[data-x="pub"]').onclick = () => { clearTimeout(S.dt); S.status = 'Публикация…'; S.stCls = ''; ap.send({ type: 'admin_bmm', op: 'publish', id: e.id, data: e.data }); };
  bd.querySelector('[data-x="discard"]').onclick = () => { if (!confirm('Отменить черновик? Опубликованный моб не изменится.')) return; clearTimeout(S.dt); ap.send({ type: 'admin_bmm', op: 'discard', id: e.id }); };
}
function preview(S) {
  const e = S.edit; if (!e || !S.pv) return; const d = e.data;
  let weapon = { ...(d.weapon || {}) };
  if (d.artId) { const a = (S.list.arts || []).find((x) => x.id === d.artId); if (a?.parts) weapon = { ...a.parts }; }
  for (const k of Object.keys(weapon)) if (!weapon[k] || !BM_PARTS[weapon[k]]) delete weapon[k];
  const body = {}; for (const [s, id] of Object.entries(d.body || {})) { const b = (S.list.body || []).find((x) => x.id === id); if (b) body[s] = { ...b }; }
  S.pv.set({ ...d, body, weapon });
}
function select(ap, S, id, sec) {
  const L = S.list, m = L.mobs.find((x) => x.id === id), dr = (L.drafts || []).find((x) => x.id === id);
  const base = m ? clone(m) : {}; for (const k of ['id', 'custom', 'final']) delete base[k];
  const data = dr?.data ? { ...base, ...clone(dr.data), body: { ...(base.body || {}), ...(dr.data.body || {}) }, weapon: { ...(base.weapon || {}), ...(dr.data.weapon || {}) } } : base;
  S.sel = id; S.edit = { id, data, isNew: !m, hasDraft: !!dr }; S.status = dr ? `Черновик от ${new Date(dr.at).toLocaleString('ru-RU')} — не опубликован` : 'Опубликовано'; S.stCls = dr ? 'draft' : 'ok';
  mountBmMobs(ap, sec);
}
/** поставленные на карту лагеря (не шаблоны логов в 0,0) + фильтры вкладки «📌»: стихия, местность, мир */
export const isPlaced = (c) => !!(c && (c.x || c.y));
export function placedOf(S, camps, elsOf) {
  return (camps || []).filter((c) => isPlaced(c) && (!S.pef || elsOf(c).includes(S.pef)) && (!S.pbi || (c.bio?.name || '—') === S.pbi) && (!S.pw || c.world === S.pw)
    && (!S.pst || (S.pst === 'off' ? c.hidden : S.pst === 'dead' ? !c.hidden && c.live && !c.live.alive : S.pst === 'alive' ? !c.hidden && c.live?.alive > 0 : true)));
}
/** вкладка «📌 Поставленные лагеря»: что стоит в мире, кто там живёт, выключить/включить, сменить состав, удалить (с подтверждением).
 *  Телепорта нет: в админке нет безопасной команды перемещения админа (есть только dev-путь), поэтому — координаты. */
function placed(ap, S, bd, sec) {
  const L = S.list, C0 = L.camps || [], mobsAll = [...(L.mobs || []).map((m) => ({ id: m.id, name: m.name, black: 1, el: m.el || m.elem || 'fire' })), ...(L.normal || [])];
  const mobEl = (id) => mobsAll.find((m) => m.id === id && m.black) ? elOf(mobsAll.find((m) => m.id === id)) : '';
  const campEls = (c) => [...new Set([...(c.mobs || []).map((x) => mobEl(x.mob)), mobEl(c.chief)].filter(Boolean))];
  const P = C0.filter(isPlaced), C = placedOf(S, C0, campEls), mname = (id) => mobsAll.find((m) => m.id === id)?.name || id;
  S.pEls = campEls; clearInterval(S.cti); S.cti = setInterval(() => { if (ap.tab !== 'bmmobs' || S.sub !== 'placed' || !ap.el?.isConnected || !sec.isConnected) { clearInterval(S.cti); return; } ap.send({ type: 'admin_bmm', op: 'camps' }); }, 2000);
  const bios = [...new Set(P.map((c) => c.bio?.name || '—'))].sort(), worlds = [...new Set(P.map((c) => c.world))].sort();
  const sel = (k, all, opts) => `<select data-pf="${k}"><option value="">${all}</option>${opts.map(([v, n]) => `<option value="${esc(v)}" ${S[k] === v ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select>`;
  const nAlive = P.filter((c) => !c.hidden && c.live?.alive > 0).length, nOff = P.filter((c) => c.hidden).length;
  bd.innerHTML = `<p class="mc-dim">Лагеря, которые стоят на карте (шаблоны логов в 0,0 — во вкладке «⛺»). Всего ${P.length}: с живыми мобами ${nAlive}, выключено ${nOff}. «🗑» снимает лагерь и его мобов сразу; после перезапуска сервера он не вернётся. Встроенный лагерь (из кода) удалить нельзя — он выключается навсегда; логово из набора 30.10 возвращается в шаблоны. Телепорта нет — в админке нет безопасной команды перемещения, поэтому показаны координаты.</p>
    ${elFilter(S, 'pef')}<div class="row" style="gap:6px;margin:4px 0">${sel('pbi', 'Любая местность', bios.map((b) => [b, b]))}${sel('pw', 'Все миры', worlds.map((w) => [w, w]))}${sel('pst', 'Любое состояние', [['alive', 'живые'], ['dead', 'разбиты'], ['off', 'выключены']])}<span class="mc-dim">показано ${C.length}</span></div>
    <table data-pids="${esc(C.map((c) => c.id).sort().join(','))}"><tr><th>Лагерь</th><th>Стихия</th><th>Местность</th><th>Мир · x,y · r</th><th>Кто там</th><th>Сейчас</th><th></th></tr>${C.map((c) => `<tr data-pc="${esc(c.id)}" style="${c.hidden ? 'opacity:.55' : ''}"><td>${c.lair ? '🕳 ' : '⛺ '}${esc(c.name || c.id)}${c.builtin ? ' <small class="mc-dim">встроенный</small>' : ''}</td><td>${campEls(c).map(elTag).join('') || '—'}</td><td>${esc(c.bio?.name || '—')}${c.bio?.lvl ? ` <small class="mc-dim">ур. ${c.bio.lvl[0]}–${c.bio.lvl[1]}</small>` : ''}</td><td>${esc(c.world)} · <b>${c.x},${c.y}</b> · ${c.r}</td><td style="font-size:11px">${c.chief ? `👑 ${esc(mname(c.chief))}; ` : ''}${(c.mobs || []).map((x) => `${mobEl(x.mob) ? EL_ICON(mobEl(x.mob)) + ' ' : ''}${esc(mname(x.mob))}×${x.n}`).join(', ')}</td><td data-live="${esc(c.id)}">${esc(liveTxt(c))}</td>
      <td style="white-space:nowrap"><button class="b" data-pe="${esc(c.id)}" title="изменить состав и место">✎ Состав</button> <button class="b" data-ph="${esc(c.id)}">${c.hidden ? '▶ Включить' : '⏸ Выключить'}</button> <button class="b" data-pd="${esc(c.id)}" style="color:#ff8a8a">🗑 Удалить</button></td></tr>`).join('')}</table>
    ${C.length ? '' : '<p class="mc-dim">Ничего не найдено.</p>'}<div class="st ${S.pst2 || ''}">${esc(S.pstatus || '')}</div>`;
  bindElFilter(ap, S, bd, sec);
  bd.querySelectorAll('[data-pf]').forEach((x) => (x.onchange = () => { S[x.dataset.pf] = x.value; mountBmMobs(ap, sec); }));
  const byId = (id) => C0.find((c) => c.id === id);
  bd.querySelectorAll('[data-pe]').forEach((b) => (b.onclick = () => { const c = byId(b.dataset.pe); if (!c) return; S.camp = clone(c); ['live', 'err', 'bio', 'builtin'].forEach((k) => delete S.camp[k]); S.cstatus = ''; S.sub = 'camps'; mountBmMobs(ap, sec); }));
  bd.querySelectorAll('[data-ph]').forEach((b) => (b.onclick = () => { const c = byId(b.dataset.ph); if (!c) return; ap.send({ type: 'admin_bmm', op: 'hide', kind: 'bmcamp', id: c.id, data: { hidden: !c.hidden } }); }));
  bd.querySelectorAll('[data-pd]').forEach((b) => (b.onclick = () => { const c = byId(b.dataset.pd); if (!c) return;
    const what = c.builtin ? 'Встроенный лагерь нельзя стереть — он будет выключен навсегда.' : /^bcx_c30_/.test(c.id) ? 'Логово вернётся в шаблоны (скрыто, 0,0).' : 'Лагерь будет удалён совсем.';
    if (!confirm(`Удалить «${c.name || c.id}» (${c.world} ${c.x},${c.y})?\n${what}\nЖивые мобы лагеря исчезнут сразу и не возродятся, в том числе после перезапуска.`)) return;
    S.pstatus = 'Удаляю…'; S.pst2 = ''; ap.send({ type: 'admin_bmm', op: 'cdel', id: c.id, data: { confirm: c.id } }); }));
}
function camps(ap, S, bd, sec) {
  const L = S.list, C0 = L.camps || [], mobsAll = [...(L.mobs || []).map((m) => ({ id: m.id, name: m.name, black: 1, el: m.el || m.elem || 'fire' })), ...(L.normal || [])];
  const e = S.camp; const mobOpt = (v) => optsByEl(mobsAll.filter((m) => m.black), v, (m) => `👹 ${m.name || m.id}`) + (`<optgroup label="Обычные мобы">${mobsAll.filter((m) => !m.black).map((m) => `<option value="${esc(m.id)}" ${v === m.id ? 'selected' : ''}>${esc(m.name || m.id)}</option>`).join('')}</optgroup>`);
  const mobEl = (id) => mobsAll.find((m) => m.id === id && m.black) ? elOf(mobsAll.find((m) => m.id === id)) : '';
  const campEls = (c) => [...new Set([...(c.mobs || []).map((x) => mobEl(x.mob)), mobEl(c.chief)].filter(Boolean))];
  const C = C0.filter((c) => !S.cef || campEls(c).includes(S.cef));
  const live = liveTxt; clearInterval(S.cti); S.cti = setInterval(() => { if (ap.tab !== 'bmmobs' || S.sub !== 'camps' || !ap.el?.isConnected || !sec.isConnected) { clearInterval(S.cti); return; } ap.send({ type: 'admin_bmm', op: 'camps' }); }, 2000);
  const _live0 = (c) => !c.live ? (c.hidden ? 'выключен' : c.err ? '⚠ ' + c.err : '—') : !c.live.alive && c.live.total ? `разбит · возрождение через ${Math.max(0, Math.round(c.live.next || 0))} с` : `живы ${c.live.alive}/${c.live.total}${c.live.next ? ` · ⏳ следующий через ${Math.round(c.live.next)} с` : ''}${c.live.state === 1 ? ' · ⚔ бой' : ''}`;
  bd.innerHTML = `<p class="mc-dim">Лагерь — точка, радиус, состав и вожак; логово — лагерь с флажком «Логово» (все элита). Таймер возрождения — случайный «от–до», переживает перезапуск сервера. Чёрные дерутся с обычными мобами, только если рядом игрок (настройка «⚙»).</p>
    ${elFilter(S, 'cef')}<table><tr><th>Лагерь</th><th>Стихия</th><th>Мир · x,y · r</th><th>Состав</th><th>Возрождение</th><th>Сейчас</th><th></th></tr>${C.map((c) => `<tr data-elem="${esc(campEls(c).join(','))}"><td>${c.lair ? '🕳 ' : '⛺ '}${esc(c.name)}</td><td>${campEls(c).map(elTag).join('') || '—'}</td><td>${esc(c.world)} · ${c.x},${c.y} · ${c.r}</td><td style="font-size:11px">${(c.mobs || []).map((x) => `${mobEl(x.mob) ? EL_ICON(mobEl(x.mob)) + ' ' : ''}${esc(mobsAll.find((m) => m.id === x.mob)?.name || x.mob)}×${x.n}`).join(', ')}${c.chief ? ` · вожак: ${esc(mobsAll.find((m) => m.id === c.chief)?.name || c.chief)}` : ''}</td><td>${c.respawnMin}–${c.respawnMax} с</td><td data-live="${esc(c.id)}">${esc(live(c))}</td><td><button class="b" data-ce="${esc(c.id)}">✎</button></td></tr>`).join('')}</table>
    <p><button class="b" data-x="cnew">＋ Новый лагерь</button> <button class="b" data-x="crefresh">↻ Таймеры</button></p>
    ${e ? `<div class="fm"><div class="hd">${esc(e.id || 'новый лагерь')}</div>
      <label class="w">Название<input data-c="name" value="${esc(e.name || '')}"></label>
      <label>Мир<select data-c="world">${['arinar', 'hellfire'].map((w) => `<option ${e.world === w ? 'selected' : ''}>${w}</option>`).join('')}</select></label>
      <label>X<input type="number" data-c="x" data-n="1" value="${e.x ?? 0}"></label><label>Y<input type="number" data-c="y" data-n="1" value="${e.y ?? 0}"></label>
      <label>Радиус, px<input type="number" data-c="r" data-n="1" value="${e.r ?? 160}"></label><label>Возрождение от, с<input type="number" data-c="respawnMin" data-n="1" value="${e.respawnMin ?? 60}"></label><label>до, с<input type="number" data-c="respawnMax" data-n="1" value="${e.respawnMax ?? 120}"></label><label title="Множитель чёрного урона игроков по мобам этого лагеря (поверх «Получаемого урона» моба). Пусто / 1 — как было">Мобы получают урон, ×<input type="number" data-c="take" data-n="1" min="0.1" max="20" step="any" value="${e.take ?? ''}"></label><label title="Множитель урона мобов этого лагеря по игрокам (чёрный, навыки, чистый). Пусто / 1 — как было">Мобы наносят урон, ×<input type="number" data-c="deal" data-n="1" min="0.05" max="5" step="any" value="${e.deal ?? ''}"></label>
      <label>Вожак<select data-c="chief"><option value="">— нет —</option>${mobOpt(e.chief)}</select></label>
      <label style="flex-direction:row;align-items:center;gap:6px"><input type="checkbox" data-c="lair" ${e.lair ? 'checked' : ''}> Логово (элита)</label>
      <label style="flex-direction:row;align-items:center;gap:6px"><input type="checkbox" data-c="hidden" ${e.hidden ? 'checked' : ''}> Выключен</label>
      <div class="w"><table><tr><th>Моб</th><th>Сколько</th><th></th></tr>${(e.mobs || []).map((x, i) => `<tr><td>${esc(mobsAll.find((m) => m.id === x.mob)?.name || x.mob)}</td><td>${x.n}</td><td><button class="b warn" data-cd="${i}">✕</button></td></tr>`).join('')}
        <tr><td><select class="cm">${mobOpt('')}</select></td><td><input class="cn" type="number" min="1" max="40" value="3" style="width:50px"></td><td><button class="b" data-x="cadd">＋</button></td></tr></table></div>
      ${(() => { const lo = e.loot || {}, els = campEls(e), R = (L.res || []).filter((r) => !/^(bp_|bm_shard_)/.test(r.id) || els.some((el) => r.id.startsWith(`bp_${el}_`) || r.id === `bm_shard_${el}`)), rn = (id) => (L.res || []).find((r) => r.id === id)?.name || id;
        const gn = (id) => (L.gear || []).find((g) => g.id === id)?.name || id, tn = (t) => (L.tiers || []).find((x) => x.id === t)?.name || t;
        return `<div class="hd">Добыча лагеря <small class="mc-dim">в сундук лагеря каждому участнику; кусочки — только стихии мобов лагеря (${els.map(EL_ICON).join('') || '—'})</small></div>
      <div class="w"><table><tr><th>Ресурс</th><th>Шанс %</th><th>Кол-во</th><th></th></tr>${(lo.drops || []).map((x, i) => `<tr><td>${esc(rn(x.res))}</td><td>${x.chance}</td><td>${x.qty?.[0]}–${x.qty?.[1]}</td><td><button class="b warn" data-ld="${i}">✕</button></td></tr>`).join('')}
        <tr><td><select class="lres">${R.map((r) => `<option value="${esc(r.id)}">${esc(r.name)}</option>`).join('')}</select></td><td><input class="lch" type="number" min="0" max="100" step="0.1" value="25" style="width:60px"></td><td><input class="lqa" type="number" min="1" max="99" value="1" style="width:40px">–<input class="lqb" type="number" min="1" max="99" value="2" style="width:40px"></td><td><button class="b" data-x="ldadd">＋</button></td></tr></table></div>
      <div class="w"><table><tr><th>Снаряжение</th><th>Шанс %</th><th></th></tr>${(lo.gear || []).map((x, i) => `<tr><td>${esc(gn(x.item))}</td><td>${x.chance}</td><td><button class="b warn" data-lg="${i}">✕</button></td></tr>`).join('')}
        <tr><td><select class="lgi">${(L.gear || []).map((r) => `<option value="${esc(r.id)}">${esc(r.name)}</option>`).join('')}</select></td><td><input class="lgc" type="number" min="0" max="100" step="0.1" value="10" style="width:60px"></td><td><button class="b" data-x="lgadd">＋</button></td></tr></table></div>
      <div class="w"><table><tr><th>Сундук наград</th><th>Шанс %</th><th>Проклятый %</th><th>Ур.</th><th></th></tr>${(lo.chests || []).map((x, i) => `<tr><td>${esc(tn(x.t))}</td><td>${x.chance}</td><td>${x.c || 0}</td><td>${x.L || 'по мобам'}</td><td><button class="b warn" data-lc="${i}">✕</button></td></tr>`).join('')}
        <tr><td><select class="lct">${(L.tiers || []).map((r) => `<option value="${esc(r.id)}">${esc(r.name)}</option>`).join('')}</select></td><td><input class="lcch" type="number" min="0" max="100" step="0.1" value="35" style="width:60px"></td><td><input class="lcc" type="number" min="0" max="100" value="0" style="width:50px"></td><td><input class="lcl" type="number" min="0" max="25" value="0" style="width:40px"></td><td><button class="b" data-x="lcadd">＋</button></td></tr></table></div>`; })()}
      <div class="w"><button class="b" data-x="here">📍 Поставить у меня</button> <button class="b pri" data-x="csave">💾 Сохранить лагерь</button> <span class="st ${S.cst || ''}">${esc(S.cstatus || '')}</span></div></div>` : ''}`;
  bindElFilter(ap, S, bd, sec);
  bd.querySelectorAll('[data-ce]').forEach((b) => (b.onclick = () => { const c = C.find((x) => x.id === b.dataset.ce); S.camp = clone(c); delete S.camp.live; delete S.camp.err; S.cstatus = ''; mountBmMobs(ap, sec); }));
  bd.querySelector('[data-x="cnew"]').onclick = () => { S.camp = { id: '', _tmp: newTmp(), name: 'Лагерь чёрных', world: 'arinar', x: 0, y: 0, r: 160, mobs: [], chief: '', respawnMin: 60, respawnMax: 120 }; S.cstatus = 'Новый — «Поставить у меня» и состав'; mountBmMobs(ap, sec); };
  bd.querySelector('[data-x="crefresh"]').onclick = () => ap.send({ type: 'admin_bmm', op: 'camps' });
  if (!e) return;
  bd.querySelectorAll('[data-c]').forEach((el) => (el.onchange = () => { const k = el.dataset.c; e[k] = el.type === 'checkbox' ? el.checked : el.dataset.n ? (el.value === '' && (k === 'take' || k === 'deal') ? 1 : Number(el.value)) : el.value; })); // пустой множитель лагеря — 1 (как было)
  bd.querySelectorAll('[data-cd]').forEach((b) => (b.onclick = () => { e.mobs.splice(Number(b.dataset.cd), 1); mountBmMobs(ap, sec); }));
  bd.querySelector('[data-x="cadd"]').onclick = () => { const m = bd.querySelector('.cm').value, n = Number(bd.querySelector('.cn').value) || 1; (e.mobs ||= []).push({ mob: m, n }); mountBmMobs(ap, sec); };
  const LO = () => (e.loot ||= {}), rr = () => mountBmMobs(ap, sec), q = (c) => bd.querySelector(c).value;
  bd.querySelectorAll('[data-ld]').forEach((b) => (b.onclick = () => { LO().drops.splice(Number(b.dataset.ld), 1); rr(); }));
  bd.querySelectorAll('[data-lg]').forEach((b) => (b.onclick = () => { LO().gear.splice(Number(b.dataset.lg), 1); rr(); }));
  bd.querySelectorAll('[data-lc]').forEach((b) => (b.onclick = () => { LO().chests.splice(Number(b.dataset.lc), 1); rr(); }));
  bd.querySelector('[data-x="ldadd"]').onclick = () => { if (!q('.lres')) return; const a = Number(q('.lqa')) || 1; (LO().drops ||= []).push({ res: q('.lres'), chance: Number(q('.lch')), qty: [a, Math.max(a, Number(q('.lqb')) || a)] }); rr(); };
  bd.querySelector('[data-x="lgadd"]').onclick = () => { if (!q('.lgi')) return; (LO().gear ||= []).push({ item: q('.lgi'), chance: Number(q('.lgc')) }); rr(); };
  bd.querySelector('[data-x="lcadd"]').onclick = () => { const c = { t: q('.lct'), chance: Number(q('.lcch')) }; if (Number(q('.lcc'))) c.c = Number(q('.lcc')); if (Number(q('.lcl'))) c.L = Number(q('.lcl')); (LO().chests ||= []).push(c); rr(); };
  bd.querySelector('[data-x="here"]').onclick = () => ap.send({ type: 'admin_bmm', op: 'here' });
  bd.querySelector('[data-x="csave"]').onclick = () => { const { id, _tmp, ...data } = e; S.cstatus = 'Сохранение…'; S.cst = ''; ap.send({ type: 'admin_bmm', op: 'save', kind: 'bmcamp', id: id || '', tmp: id ? undefined : _tmp, data }); };
}
function body(ap, S, bd, sec) {
  const B0 = S.list.body || [], e = S.bpart, q = (S.bq || '').toLowerCase();
  const B = B0.filter((b) => (!S.bef || elOf(b) === S.bef) && (!q || `${b.id} ${b.name} ${b.img}`.toLowerCase().includes(q))).sort((a, b) => BP_ELEMS.indexOf(elOf(a)) - BP_ELEMS.indexOf(elOf(b)));
  bd.innerHTML = `<p class="mc-dim">Части тела: лист Художника (public/bm-art/body/&lt;img&gt;.png) и поправки к статам моба, %. Своя часть — «bbx_…»: можно взять лист встроенной или оставить заглушку.</p>
    ${elFilter(S, 'bef')}<p><input class="bq" placeholder="поиск: имя / лист" value="${esc(S.bq || '')}"> <small class="mc-dim">наведите на строку — покой, клик по 👁 — атака</small></p>
    <table><tr><th>Стихия</th><th>Слот</th><th>Название</th><th>Лист</th><th>ОЗ</th><th>Урон</th><th>Броня</th><th>Скор.</th><th>Чист. 🔥/❄</th><th></th></tr>${B.map((b) => `<tr data-elem="${elOf(b)}" data-bh="${esc(b.id)}"><td>${elTag(elOf(b))}</td><td>${esc(S.list.slotNames?.[b.slot] || b.slot)}</td><td>${esc(b.name)}${b.hidden ? ' <small class="mc-dim">скрыта</small>' : ''}</td><td>${esc(b.img || 'заглушка')}</td><td>${b.hp}</td><td>${b.dmg}</td><td>${b.armor}</td><td>${b.speed}</td><td>${b.pfire || b.pice ? `<span style="color:#ff9a3c">${b.pfire || 0}</span>/<span style="color:#7cd0ff">${b.pice || 0}</span>%` : '—'}</td><td><button class="b" data-bpv="${esc(b.id)}" title="Атака">👁</button> <button class="b" data-be="${esc(b.id)}">✎</button></td></tr>`).join('')}</table>
    <p><select class="bslot">${(S.list.slots || []).map((s) => `<option value="${s}">${esc(S.list.slotNames?.[s] || s)}</option>`).join('')}</select> <button class="b" data-x="bnew">＋ Своя часть</button></p>
    ${e ? `<div class="fm"><div class="hd">${esc(e.id || 'новая часть')} · ${esc(e.slot)}</div><label class="w">Название<input data-b="name" value="${esc(e.name || '')}"></label>
      <label>Лист<input data-b="img" value="${esc(e.img || '')}" placeholder="напр. torso_2 / ice_torso_1"></label>
      <label>Стихия<select data-b="elem">${BP_ELEMS.map((x) => `<option value="${x}" ${elOf(e) === x ? 'selected' : ''}>${EL_ICON(x)} ${esc(BP_ELEM_NAMES[x] || x)}</option>`).join('')}</select></label>
      <label>Чист. огн., % ОЗ<input type="number" data-b="pfire" data-n="1" min="0" max="100" step="any" value="${e.pfire ?? 0}"></label><label>Чист. лёд, % ОЗ<input type="number" data-b="pice" data-n="1" min="0" max="100" step="any" value="${e.pice ?? 0}"></label>${['hp', 'dmg', 'armor', 'speed'].map((k) => `<label>${k}, %<input type="number" data-b="${k}" data-n="1" value="${e[k] ?? 0}"></label>`).join('')}
      <label style="flex-direction:row;align-items:center;gap:6px"><input type="checkbox" data-b="hidden" ${e.hidden ? 'checked' : ''}> Скрыта</label>
      <div class="w"><button class="b pri" data-x="bsave">💾 Сохранить часть</button> <span class="st">${esc(S.bstatus || '')}</span></div>
      <div class="w"><canvas class="bpv" width="150" height="150" title="Клик — покой / атака"></canvas></div></div>` : ''}`;
  bindElFilter(ap, S, bd, sec);
  const bqi = bd.querySelector('.bq'); if (bqi) bqi.onchange = () => { S.bq = bqi.value; mountBmMobs(ap, sec); };
  bd.querySelectorAll('[data-bh]').forEach((tr) => { const b = B0.find((x) => x.id === tr.dataset.bh); tr.onmouseenter = () => hoverOn(S, tr, b, 'idle'); tr.onmouseleave = hoverOff; });
  bd.querySelectorAll('[data-bpv]').forEach((x) => (x.onclick = (ev) => { ev.stopPropagation(); hoverOn(S, x, B0.find((y) => y.id === x.dataset.bpv), 'atk'); }));
  const bcv = bd.querySelector('canvas.bpv'); if (bcv && e) { S.bpv?.stop(); S.bpv = new MobPreview(bcv); Object.assign(S.bpv, { grid: false, hero: false, rings: false, zoom: 1.3, anim: 'idle' }); S.bpv.set(bodyPreviewMob(S, e)); S.bpv.start(); bcv.onclick = () => { S.bpv.anim = S.bpv.anim === 'atk' ? 'idle' : 'atk'; }; }
  bd.querySelectorAll('[data-be]').forEach((b) => (b.onclick = () => { S.bpart = clone(B.find((x) => x.id === b.dataset.be)); delete S.bpart.custom; S.bstatus = ''; mountBmMobs(ap, sec); }));
  bd.querySelector('[data-x="bnew"]').onclick = () => { const slot = bd.querySelector('.bslot').value; S.bpart = { id: '', _tmp: newTmp(), slot, name: 'Своя часть', img: `${slot}_1`, hp: 0, dmg: 0, armor: 0, speed: 0 }; mountBmMobs(ap, sec); };
  if (!e) return;
  bd.querySelectorAll('[data-b]').forEach((el) => (el.onchange = () => { const k = el.dataset.b; e[k] = el.type === 'checkbox' ? el.checked : el.dataset.n ? Number(el.value) : el.value; if (S.bpv && (k === 'img' || k === 'elem')) S.bpv.set(bodyPreviewMob(S, e)); }));
  bd.querySelector('[data-x="bsave"]').onclick = () => { const { id, _tmp, ...data } = e; S.bstatus = 'Сохранение…'; ap.send({ type: 'admin_bmm', op: 'save', kind: 'bmbody', id: id || '', tmp: id ? undefined : _tmp, data }); };
}
function cfg(ap, S, bd, sec) {
  const c = (S.cfgEdit ||= clone(S.list.cfg || {})), fields = ap.cat?.schema?.bmmcfg?.fields || [];
  const get = (p) => p.split('.').reduce((t, k) => (t == null ? undefined : t[k]), c);
  bd.innerHTML = `<div class="fm">${fields.map((f) => f.t === 'bool' ? `<label style="flex-direction:row;align-items:center;gap:6px"><input type="checkbox" data-g="${f.path}" ${get(f.path) ? 'checked' : ''}> ${esc(f.label)}</label>` : `<label>${esc(f.label)}<input type="number" data-g="${f.path}" step="any" min="${f.min}" max="${f.max}" value="${get(f.path) ?? ''}"></label>`).join('')}
    <div class="w"><button class="b pri" data-x="gsave">💾 Сохранить настройки</button> <span class="st">${esc(S.gstatus || '')}</span></div></div>`;
  bd.querySelectorAll('[data-g]').forEach((el) => (el.onchange = () => { const ks = el.dataset.g.split('.'); let t = c; for (const k of ks.slice(0, -1)) t = t[k] ||= {}; t[ks.at(-1)] = el.type === 'checkbox' ? el.checked : Number(el.value); }));
  bd.querySelector('[data-x="gsave"]').onclick = () => { S.gstatus = 'Сохранение…'; ap.send({ type: 'admin_bmm', op: 'save', kind: 'bmmcfg', id: 'main', data: c }); };
}

/** ответ сервера admin_bmm */
/** админ сейчас взаимодействует с полем формы (фокус на input/select/textarea внутри окна) — не пересобирать DOM */
/** ответ «save» относится к открытой форме? (тот же id, или новый с тем же tmp) — иначе id чужого ответа не попадёт в другой лагерь/часть */
export const sameObj = (o, d) => !!o && (o.id ? o.id === d.id : !!(o._tmp && o._tmp === d.tmp));
export const newTmp = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
export const adminBusy = (ap) => { const a = document.activeElement; return !!(a && ap?.el?.contains(a) && /^(INPUT|SELECT|TEXTAREA)$/.test(a.tagName)); };
export function onBmmResult(ap, d) {
  const S = (ap.bmm ||= { sub: 'mobs' });
  const rerender = () => { if (ap.tab === 'bmmobs' && ap.el) { const sec = ap.el.querySelector('section'); if (sec) mountBmMobs(ap, sec); } };
  if (d.op === 'list' && d.ok) { S.list = d; S.asked = false; S.cfgEdit = null; if (S.sel && !S.edit) S.sel = null; }
  else if (d.op === 'new' && !d.ok) S.newAt = 0;
  else if (d.op === 'new' && d.ok && S.list) { S.newAt = 0; if (!(S.list.drafts ||= []).some((x) => x.id === d.id)) S.list.drafts.unshift({ id: d.id, data: d.data, at: Date.now() }); S.sel = d.id; S.edit = { id: d.id, data: clone(d.data), isNew: true, hasDraft: true }; S.status = 'Новый моб — черновик (в игру не идёт до публикации)'; S.stCls = 'draft'; }
  else if (d.op === 'draft') { if (d.ok) { const L = (S.list.drafts ||= []); const x = L.find((y) => y.id === d.id); const data = clone(S.edit?.id === d.id ? S.edit.data : x?.data || {}); if (x) { x.data = data; x.at = Date.now(); } else L.unshift({ id: d.id, data, at: Date.now() });
      if (S.edit?.id === d.id) { S.edit.hasDraft = true; S.status = `Черновик сохранён ${new Date().toLocaleTimeString('ru-RU')} — не опубликован`; S.stCls = 'draft'; } } else { S.status = 'Черновик не сохранён: ' + (d.err || 'ошибка'); S.stCls = 'err'; }
    const st = ap.el?.querySelector('.bmma .st'); if (st && S.sub === 'mobs') { st.className = 'st ' + S.stCls; st.textContent = S.status; const dc = ap.el.querySelector('.bmma [data-x="discard"]'); if (dc) dc.disabled = !S.edit?.hasDraft; } return; }
  else if (d.op === 'discard' && d.ok) { S.edit = null; S.sel = null; S.list = null; S.status = 'Черновик отменён'; ap.send({ type: 'admin_bmm', op: 'list' }); }
  else if (d.op === 'publish') { if (d.ok) { S.list.mobs = d.mobs || S.list.mobs; S.list.drafts = (S.list.drafts || []).filter((x) => x.id !== d.id); if (S.edit) { S.edit.isNew = false; S.edit.hasDraft = false; } S.status = d.isNew ? '✔ Новый моб опубликован — можно ставить в лагерь и в квесты' : '✔ Опубликовано — у всех игроков'; S.stCls = 'ok'; }
    else { S.status = 'Не опубликовано: ' + (d.err || d.message || 'ошибка'); S.stCls = 'err'; } }
  else if (d.op === 'auto' && d.ok && S.edit) { Object.assign(S.edit.data, d.stats); S.status = 'Статы по уровню подставлены — черновик'; S.stCls = 'draft'; clearTimeout(S.dt); S.dt = setTimeout(() => ap.send({ type: 'admin_bmm', op: 'draft', id: S.edit.id, data: S.edit.data }), DRAFT_MS); }
  else if (d.op === 'here' && d.ok && S.camp) { Object.assign(S.camp, { world: d.world, x: d.x, y: d.y }); S.cstatus = `📍 ${d.world} ${d.x},${d.y}`; S.cst = ''; }
  else if (d.op === 'cdel') { if (d.camps && S.list) S.list.camps = d.camps; S.pstatus = d.ok ? `✔ ${d.how || 'удалён'}: ${d.id}` : 'Не удалено: ' + (d.err || ''); S.pst2 = d.ok ? 'ok' : 'err'; if (d.ok && S.camp?.id === d.id) S.camp = null; }
  else if (d.op === 'hide' && d.kind !== 'bmmob' && S.sub === 'placed') { S.pstatus = d.ok ? '✔ Готово' : 'Ошибка: ' + (d.err || ''); S.pst2 = d.ok ? 'ok' : 'err'; ap.send({ type: 'admin_bmm', op: 'camps' }); return; }
  else if (d.op === 'camps' && d.ok && S.list) { S.list.camps = d.camps; // живые таймеры — только ячейки «Сейчас», без перерисовки формы
    // опрос раз в 2 с: НИКОГДА не пересобирать форму, пока админ что-то правит (открытый выпадающий список/поле в фокусе, открыт лагерь) —
    // иначе <select> пересоздаётся и закрывается сам. Пересборка — только если поменялся набор лагерей и форма не открыта.
    const cells = ap.el?.querySelectorAll('.bmma [data-live]') || [];
    for (const td of cells) { const c = d.camps.find((x) => x.id === td.dataset.live); if (c) td.textContent = liveTxt(c); }
    const shown = [...cells].map((td) => td.dataset.live).sort().join(','), all = d.camps.map((c) => c.id).sort().join(',');
    const pt = ap.el?.querySelector('.bmma [data-pids]'); // вкладка «📌»: пересборка, если поменялся видимый набор или выключен/включён
    const sameSet = S.sub === 'placed' ? !!pt && pt.dataset.pids === placedOf(S, d.camps, S.pEls || (() => [])).map((c) => c.id).sort().join(',') && [...ap.el.querySelectorAll('.bmma [data-ph]')].every((b) => b.textContent.includes('Включить') === !!d.camps.find((c) => c.id === b.dataset.ph)?.hidden)
      : !S.cef ? shown === all : [...cells].every((td) => d.camps.some((c) => c.id === td.dataset.live));
    if (sameSet || S.camp || adminBusy(ap)) return; }
  else if (d.op === 'save') { const ok = d.ok, msg = ok ? '✔ Сохранено' : 'Ошибка: ' + (d.err || d.message || '');
    if (d.kind === 'bmcamp') { S.cstatus = msg; S.cst = ok ? 'ok' : 'err'; if (ok) { if (d.camps) S.list.camps = d.camps; if (sameObj(S.camp, d)) S.camp.id = d.id; } }
    else if (d.kind === 'bmbody') { S.bstatus = msg; if (ok) { if (d.body) S.list.body = d.body; if (sameObj(S.bpart, d)) S.bpart.id = d.id; } }
    else { S.gstatus = msg; } }
  else if (!d.ok) ap.msg?.('Ошибка: ' + (d.err || ''));
  rerender();
}
