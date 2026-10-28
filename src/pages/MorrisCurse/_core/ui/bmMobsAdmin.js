// Админка «👹 Чёрные мобы» (чёрная магия, этап В): конструктор мобов из частей тела Художника + оружие в руке,
// живое превью (анимации, сетка, силуэт героя, хитбокс/агро), лагеря/логова с таймерами, части тела, настройки.
// Черновик моба сохраняется сам (admin_bmm draft → bmc_mdraft), «Опубликовать» — правка bmmob (аудит, версия, у всех сразу).
import { BM_PARTS, BP_TYPE_NAMES } from '../../../../../server/meta/blackArt.ts';
import { RESOURCES } from '../../../../../server/meta/shared.ts';
import { esc } from './overlay.js';
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
  const subs = [['mobs', '👹 Мобы'], ['camps', '⛺ Лагеря и логова'], ['body', '🦴 Части тела'], ['cfg', '⚙ Настройки']];
  sec.innerHTML = `<div class="bmma"><h3>👹 Чёрные мобы <small class="mc-dim">черновик сохраняется сам · «Опубликовать» — у всех сразу · снятие — флажок «Снят», не удаление</small></h3>
    <div class="sub">${subs.map(([k, n]) => `<button data-bs="${k}" class="${S.sub === k ? 'on' : ''}">${n}</button>`).join('')}<span style="flex:1"></span><button class="b" data-bx="reload">↻ Обновить</button></div><div class="bd"></div></div>`;
  const bd = sec.querySelector('.bd');
  sec.querySelectorAll('[data-bs]').forEach((b) => (b.onclick = () => { S.sub = b.dataset.bs; mountBmMobs(ap, sec); }));
  sec.querySelector('[data-bx="reload"]').onclick = () => { S.list = null; S.asked = false; mountBmMobs(ap, sec); };
  if (!S.list) { bd.innerHTML = '<p class="mc-dim">Загрузка…</p>'; return; }
  if (S.sub === 'camps') return camps(ap, S, bd, sec);
  if (S.sub === 'body') return body(ap, S, bd, sec);
  if (S.sub === 'cfg') return cfg(ap, S, bd, sec);
  return mobs(ap, S, bd, sec);
}
const resName = (r) => RESOURCES[r]?.name || r;
const liveTxt = (c) => !c.live ? (c.hidden ? 'выключен' : c.err ? '⚠ ' + c.err : '—') : c.live.state === 'cleared' || c.live.next ? `разбит · возрождение через ${Math.max(0, Math.round(c.live.next || 0))} с` : `живы ${c.live.alive}/${c.live.total}`;
function mobs(ap, S, bd, sec) {
  const L = S.list, drafts = new Map((L.drafts || []).map((d) => [d.id, d]));
  const all = [...L.mobs]; for (const [id, d] of drafts) if (!all.some((m) => m.id === id)) all.push({ id, ...(d.data || {}), _new: true });
  const list = `<div class="g">Мобы <button class="b" style="float:right;padding:0 6px" data-new="1" title="Новый моб">＋</button></div>` + all.map((m) => `<div data-m="${esc(m.id)}" class="${S.sel === m.id ? 'on' : ''}">${esc(m.name || m.id)} <small class="mc-dim">${esc(L.classNames?.[m.cls] || m.cls || '')} ${m.lvl || ''}</small>${drafts.has(m.id) ? ' <span class="dr" title="Неопубликованный черновик">✎</span>' : ''}${m._new ? ' <small class="dr">новый</small>' : ''}${m.hidden ? ' <small class="mc-dim">снят</small>' : ''}</div>`).join('');
  const e = S.edit; let form = '<p class="mc-dim">Выберите моба слева или создайте нового (＋).</p>';
  if (e) {
    const d = e.data, B = L.body || [], P = L.parts || [];
    const num = (k, lab, mn, mx, st = 1) => `<label>${esc(lab)}<input type="number" data-k="${k}" data-n="1" min="${mn}" max="${mx}" step="${st}" value="${d[k] ?? ''}"></label>`;
    const slotSel = (s) => `<label>${esc(L.slotNames?.[s] || s)}${(L.req || []).includes(s) ? ' *' : ''}<select data-k="body.${s}"><option value="">— нет —</option>${B.filter((b) => b.slot === s && (!b.hidden || d.body?.[s] === b.id)).map((b) => `<option value="${esc(b.id)}" ${d.body?.[s] === b.id ? 'selected' : ''}>${esc(b.name || b.id)}${b.img ? '' : ' (заглушка)'}</option>`).join('')}</select></label>`;
    const wSel = (t) => `<label>${esc(BP_TYPE_NAMES[t] || t)}<select data-k="weapon.${t}" ${d.artId ? 'disabled' : ''}><option value="">— нет —</option>${P.filter((p) => p.type === t && (!p.hidden || d.weapon?.[t] === p.id)).map((p) => `<option value="${esc(p.id)}" ${d.weapon?.[t] === p.id ? 'selected' : ''}>${esc(p.name || p.id)}</option>`).join('')}</select></label>`;
    const fin = L.mobs.find((m) => m.id === e.id)?.final;
    form = `<div class="fm">
      <label class="w">Имя<input type="text" data-k="name" value="${esc(d.name || '')}"></label>
      <label>Класс (табличка)<select data-k="cls">${(L.classes || []).map((c) => `<option value="${c}" ${d.cls === c ? 'selected' : ''}>${esc(L.classNames?.[c] || c)}</option>`).join('')}</select></label>
      ${num('lvl', 'Уровень', 1, 60)}<label>&nbsp;<button class="b" data-x="auto" title="Статы как у обычных мобов этого уровня × настройка">⚖ Авто по уровню</button></label>
      <div class="hd">Статы (база; итог = база × части тела × класс + оружие)</div>
      ${num('hp', 'ОЗ', 1, 1e9)}${num('dmg', 'Урон', 0, 1e6, 'any')}${num('armor', 'Броня', 0, 1e6)}${num('speed', 'Скорость', 10, 400)}${num('aggro', 'Агро, px', 0, 2000)}${num('radius', 'Хитбокс, px', 6, 80)}${num('xp', 'Опыт', 0, 1e7)}${num('scale', 'Размер, ×', 0.4, 3, 0.05)}
      <label>Зачарование<select data-k="ench" data-n="1">${[0, 1, 2, 3, 4, 5, 6].map((n) => `<option value="${n}" ${Number(d.ench || 0) === n ? 'selected' : ''}>${n ? 'ярус ' + n + (n === 6 ? ' (Чёрный)' : '') : 'по миру'}</option>`).join('')}</select></label>
      <label style="flex-direction:row;align-items:center;gap:6px"><input type="checkbox" data-k="cursed" ${d.cursed ? 'checked' : ''}> Всегда проклятый</label>
      <label style="flex-direction:row;align-items:center;gap:6px"><input type="checkbox" data-k="hidden" ${d.hidden ? 'checked' : ''}> Снят с публикации</label>
      <div class="hd">Тело (листы Художника; * — обязательно)</div>${(L.slots || []).map(slotSel).join('')}
      <div class="hd">Оружие в руке: детали кузни или артефакт игрока</div>${(L.bpTypes || []).map(wSel).join('')}
      <label class="w">Артефакт игрока (вместо деталей)<select data-k="artId"><option value="">— нет, из деталей —</option>${(L.arts || []).map((a) => `<option value="${esc(a.id)}" ${d.artId === a.id ? 'selected' : ''}>${esc(a.name)} · ${esc(a.id)}</option>`).join('')}</select></label>
      <div class="hd">Дроп</div>
      <div class="w"><table><tr><th>Ресурс</th><th>Шанс %</th><th>Кол-во</th><th></th></tr>${(d.drops || []).map((x, i) => `<tr><td>${esc(resName(x.res))}</td><td>${x.chance}</td><td>${x.qty?.[0]}–${x.qty?.[1]}</td><td><button class="b warn" data-dd="${i}">✕</button></td></tr>`).join('')}
        <tr><td><select class="dres">${(L.res || []).map((r) => `<option value="${esc(r.id)}">${esc(r.name)}</option>`).join('')}</select></td><td><input class="dch" type="number" min="0" max="100" step="0.1" value="10" style="width:60px"></td><td><input class="dqa" type="number" min="1" max="99" value="1" style="width:40px">–<input class="dqb" type="number" min="1" max="99" value="1" style="width:40px"></td><td><button class="b" data-x="dadd">＋</button></td></tr></table></div>
    </div>
    ${fin ? `<div class="fin">Опубликовано, итог: ОЗ ${Math.round(fin.hp)} · урон ${(+fin.dmg).toFixed(1)} · броня ${Math.round(fin.armor)} · скорость ${Math.round(fin.speed)} · ${fin.ranged ? 'дальний бой' : 'ближний бой'}</div>` : ''}
    <div class="st ${S.stCls}">${esc(S.status)}</div>
    <button class="b pri" data-x="pub">📣 Опубликовать</button> <button class="b" data-x="discard" ${e.hasDraft ? '' : 'disabled'}>✕ Отменить черновик</button> <span class="mc-dim" style="font-size:11px">id: ${esc(e.id)} — для квестов охоты и доски: цель «${esc(e.id)}»</span>`;
  }
  const pvBox = e ? `<canvas width="320" height="320"></canvas>
    <div style="display:flex;gap:6px;flex-wrap:wrap;font-size:12px;margin-top:4px"><select data-pv="anim">${ANIMS.map(([k, n]) => `<option value="${k}" ${S.anim === k ? 'selected' : ''}>${n}</option>`).join('')}</select>
    <label><input type="checkbox" data-pv="grid" ${S.grid ? 'checked' : ''}> сетка</label><label><input type="checkbox" data-pv="hero" ${S.hero ? 'checked' : ''}> герой</label><label><input type="checkbox" data-pv="rings" ${S.rings ? 'checked' : ''}> хитбокс/агро</label></div>
    <p class="mc-dim" style="font-size:11px">Живое превью: части тела Художника по z (хвост → правая рука), оружие в точке хвата кадра. Части без листа — огненная ЗАГЛУШКА.</p>` : '';
  bd.innerHTML = `<div class="cols"><div class="pl">${list}</div><div>${form}</div><div>${pvBox}</div></div>`;
  bd.querySelectorAll('[data-m]').forEach((el) => (el.onclick = () => select(ap, S, el.dataset.m, sec)));
  bd.querySelector('[data-new]').onclick = () => { S.status = 'Создание…'; ap.send({ type: 'admin_bmm', op: 'new', lvl: 8, cls: 'warrior' }); };
  if (!e) return;
  const cv = bd.querySelector('canvas'); S.pv?.stop(); S.pv = new MobPreview(cv); Object.assign(S.pv, { anim: S.anim, grid: S.grid, hero: S.hero, rings: S.rings }); preview(S); S.pv.start();
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
function camps(ap, S, bd, sec) {
  const L = S.list, C = L.camps || [], mobsAll = [...(L.mobs || []).map((m) => ({ id: m.id, name: m.name, black: 1 })), ...(L.normal || [])];
  const e = S.camp; const mobOpt = (v) => mobsAll.map((m) => `<option value="${esc(m.id)}" ${v === m.id ? 'selected' : ''}>${m.black ? '👹 ' : ''}${esc(m.name || m.id)}</option>`).join('');
  const live = liveTxt; clearInterval(S.cti); S.cti = setInterval(() => { if (ap.tab !== 'bmmobs' || S.sub !== 'camps' || !ap.el?.isConnected || !sec.isConnected) { clearInterval(S.cti); return; } ap.send({ type: 'admin_bmm', op: 'camps' }); }, 2000);
  const _live0 = (c) => !c.live ? (c.hidden ? 'выключен' : c.err ? '⚠ ' + c.err : '—') : c.live.state === 'cleared' || c.live.next ? `разбит · возрождение через ${Math.max(0, Math.round(c.live.next || 0))} с` : `живы ${c.live.alive}/${c.live.total}`;
  bd.innerHTML = `<p class="mc-dim">Лагерь — точка, радиус, состав и вожак; логово — лагерь с флажком «Логово» (все элита). Таймер возрождения — случайный «от–до», переживает перезапуск сервера. Чёрные дерутся с обычными мобами, только если рядом игрок (настройка «⚙»).</p>
    <table><tr><th>Лагерь</th><th>Мир · x,y · r</th><th>Состав</th><th>Возрождение</th><th>Сейчас</th><th></th></tr>${C.map((c) => `<tr><td>${c.lair ? '🕳 ' : '⛺ '}${esc(c.name)}</td><td>${esc(c.world)} · ${c.x},${c.y} · ${c.r}</td><td style="font-size:11px">${(c.mobs || []).map((x) => `${esc(mobsAll.find((m) => m.id === x.mob)?.name || x.mob)}×${x.n}`).join(', ')}${c.chief ? ` · вожак: ${esc(mobsAll.find((m) => m.id === c.chief)?.name || c.chief)}` : ''}</td><td>${c.respawnMin}–${c.respawnMax} с</td><td data-live="${esc(c.id)}">${esc(live(c))}</td><td><button class="b" data-ce="${esc(c.id)}">✎</button></td></tr>`).join('')}</table>
    <p><button class="b" data-x="cnew">＋ Новый лагерь</button> <button class="b" data-x="crefresh">↻ Таймеры</button></p>
    ${e ? `<div class="fm"><div class="hd">${esc(e.id || 'новый лагерь')}</div>
      <label class="w">Название<input data-c="name" value="${esc(e.name || '')}"></label>
      <label>Мир<select data-c="world">${['arinar', 'hellfire'].map((w) => `<option ${e.world === w ? 'selected' : ''}>${w}</option>`).join('')}</select></label>
      <label>X<input type="number" data-c="x" data-n="1" value="${e.x ?? 0}"></label><label>Y<input type="number" data-c="y" data-n="1" value="${e.y ?? 0}"></label>
      <label>Радиус, px<input type="number" data-c="r" data-n="1" value="${e.r ?? 160}"></label><label>Возрождение от, с<input type="number" data-c="respawnMin" data-n="1" value="${e.respawnMin ?? 60}"></label><label>до, с<input type="number" data-c="respawnMax" data-n="1" value="${e.respawnMax ?? 120}"></label>
      <label>Вожак<select data-c="chief"><option value="">— нет —</option>${mobOpt(e.chief)}</select></label>
      <label style="flex-direction:row;align-items:center;gap:6px"><input type="checkbox" data-c="lair" ${e.lair ? 'checked' : ''}> Логово (элита)</label>
      <label style="flex-direction:row;align-items:center;gap:6px"><input type="checkbox" data-c="hidden" ${e.hidden ? 'checked' : ''}> Выключен</label>
      <div class="w"><table><tr><th>Моб</th><th>Сколько</th><th></th></tr>${(e.mobs || []).map((x, i) => `<tr><td>${esc(mobsAll.find((m) => m.id === x.mob)?.name || x.mob)}</td><td>${x.n}</td><td><button class="b warn" data-cd="${i}">✕</button></td></tr>`).join('')}
        <tr><td><select class="cm">${mobOpt('')}</select></td><td><input class="cn" type="number" min="1" max="40" value="3" style="width:50px"></td><td><button class="b" data-x="cadd">＋</button></td></tr></table></div>
      <div class="w"><button class="b" data-x="here">📍 Поставить у меня</button> <button class="b pri" data-x="csave">💾 Сохранить лагерь</button> <span class="st ${S.cst || ''}">${esc(S.cstatus || '')}</span></div></div>` : ''}`;
  bd.querySelectorAll('[data-ce]').forEach((b) => (b.onclick = () => { const c = C.find((x) => x.id === b.dataset.ce); S.camp = clone(c); delete S.camp.live; delete S.camp.err; S.cstatus = ''; mountBmMobs(ap, sec); }));
  bd.querySelector('[data-x="cnew"]').onclick = () => { S.camp = { id: '', name: 'Лагерь чёрных', world: 'arinar', x: 0, y: 0, r: 160, mobs: [], chief: '', respawnMin: 60, respawnMax: 120 }; S.cstatus = 'Новый — «Поставить у меня» и состав'; mountBmMobs(ap, sec); };
  bd.querySelector('[data-x="crefresh"]').onclick = () => ap.send({ type: 'admin_bmm', op: 'camps' });
  if (!e) return;
  bd.querySelectorAll('[data-c]').forEach((el) => (el.onchange = () => { const k = el.dataset.c; e[k] = el.type === 'checkbox' ? el.checked : el.dataset.n ? Number(el.value) : el.value; }));
  bd.querySelectorAll('[data-cd]').forEach((b) => (b.onclick = () => { e.mobs.splice(Number(b.dataset.cd), 1); mountBmMobs(ap, sec); }));
  bd.querySelector('[data-x="cadd"]').onclick = () => { const m = bd.querySelector('.cm').value, n = Number(bd.querySelector('.cn').value) || 1; (e.mobs ||= []).push({ mob: m, n }); mountBmMobs(ap, sec); };
  bd.querySelector('[data-x="here"]').onclick = () => ap.send({ type: 'admin_bmm', op: 'here' });
  bd.querySelector('[data-x="csave"]').onclick = () => { const { id, ...data } = e; S.cstatus = 'Сохранение…'; S.cst = ''; ap.send({ type: 'admin_bmm', op: 'save', kind: 'bmcamp', id: id || '', data }); };
}
function body(ap, S, bd, sec) {
  const B = S.list.body || [], e = S.bpart;
  bd.innerHTML = `<p class="mc-dim">Части тела: лист Художника (public/bm-art/body/&lt;img&gt;.png) и поправки к статам моба, %. Своя часть — «bbx_…»: можно взять лист встроенной или оставить заглушку.</p>
    <table><tr><th>Слот</th><th>Название</th><th>Лист</th><th>ОЗ</th><th>Урон</th><th>Броня</th><th>Скор.</th><th></th></tr>${B.map((b) => `<tr><td>${esc(S.list.slotNames?.[b.slot] || b.slot)}</td><td>${esc(b.name)}${b.hidden ? ' <small class="mc-dim">скрыта</small>' : ''}</td><td>${esc(b.img || 'заглушка')}</td><td>${b.hp}</td><td>${b.dmg}</td><td>${b.armor}</td><td>${b.speed}</td><td><button class="b" data-be="${esc(b.id)}">✎</button></td></tr>`).join('')}</table>
    <p><select class="bslot">${(S.list.slots || []).map((s) => `<option value="${s}">${esc(S.list.slotNames?.[s] || s)}</option>`).join('')}</select> <button class="b" data-x="bnew">＋ Своя часть</button></p>
    ${e ? `<div class="fm"><div class="hd">${esc(e.id || 'новая часть')} · ${esc(e.slot)}</div><label class="w">Название<input data-b="name" value="${esc(e.name || '')}"></label>
      <label>Лист<input data-b="img" value="${esc(e.img || '')}" placeholder="напр. torso_2"></label>${['hp', 'dmg', 'armor', 'speed'].map((k) => `<label>${k}, %<input type="number" data-b="${k}" data-n="1" value="${e[k] ?? 0}"></label>`).join('')}
      <label style="flex-direction:row;align-items:center;gap:6px"><input type="checkbox" data-b="hidden" ${e.hidden ? 'checked' : ''}> Скрыта</label>
      <div class="w"><button class="b pri" data-x="bsave">💾 Сохранить часть</button> <span class="st">${esc(S.bstatus || '')}</span></div></div>` : ''}`;
  bd.querySelectorAll('[data-be]').forEach((b) => (b.onclick = () => { S.bpart = clone(B.find((x) => x.id === b.dataset.be)); delete S.bpart.custom; S.bstatus = ''; mountBmMobs(ap, sec); }));
  bd.querySelector('[data-x="bnew"]').onclick = () => { const slot = bd.querySelector('.bslot').value; S.bpart = { id: '', slot, name: 'Своя часть', img: `${slot}_1`, hp: 0, dmg: 0, armor: 0, speed: 0 }; mountBmMobs(ap, sec); };
  if (!e) return;
  bd.querySelectorAll('[data-b]').forEach((el) => (el.onchange = () => { const k = el.dataset.b; e[k] = el.type === 'checkbox' ? el.checked : el.dataset.n ? Number(el.value) : el.value; }));
  bd.querySelector('[data-x="bsave"]').onclick = () => { const { id, ...data } = e; S.bstatus = 'Сохранение…'; ap.send({ type: 'admin_bmm', op: 'save', kind: 'bmbody', id: id || '', data }); };
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
export function onBmmResult(ap, d) {
  const S = (ap.bmm ||= { sub: 'mobs' });
  const rerender = () => { if (ap.tab === 'bmmobs' && ap.el) { const sec = ap.el.querySelector('section'); if (sec) mountBmMobs(ap, sec); } };
  if (d.op === 'list' && d.ok) { S.list = d; S.asked = false; S.cfgEdit = null; if (S.sel && !S.edit) S.sel = null; }
  else if (d.op === 'new' && d.ok && S.list) { (S.list.drafts ||= []).unshift({ id: d.id, data: d.data, at: Date.now() }); S.sel = d.id; S.edit = { id: d.id, data: clone(d.data), isNew: true, hasDraft: true }; S.status = 'Новый моб — черновик (в игру не идёт до публикации)'; S.stCls = 'draft'; }
  else if (d.op === 'draft') { if (d.ok) { const L = (S.list.drafts ||= []); const x = L.find((y) => y.id === d.id); const data = clone(S.edit?.id === d.id ? S.edit.data : x?.data || {}); if (x) { x.data = data; x.at = Date.now(); } else L.unshift({ id: d.id, data, at: Date.now() });
      if (S.edit?.id === d.id) { S.edit.hasDraft = true; S.status = `Черновик сохранён ${new Date().toLocaleTimeString('ru-RU')} — не опубликован`; S.stCls = 'draft'; } } else { S.status = 'Черновик не сохранён: ' + (d.err || 'ошибка'); S.stCls = 'err'; }
    const st = ap.el?.querySelector('.bmma .st'); if (st && S.sub === 'mobs') { st.className = 'st ' + S.stCls; st.textContent = S.status; const dc = ap.el.querySelector('.bmma [data-x="discard"]'); if (dc) dc.disabled = !S.edit?.hasDraft; } return; }
  else if (d.op === 'discard' && d.ok) { S.edit = null; S.sel = null; S.list = null; S.status = 'Черновик отменён'; ap.send({ type: 'admin_bmm', op: 'list' }); }
  else if (d.op === 'publish') { if (d.ok) { S.list.mobs = d.mobs || S.list.mobs; S.list.drafts = (S.list.drafts || []).filter((x) => x.id !== d.id); if (S.edit) { S.edit.isNew = false; S.edit.hasDraft = false; } S.status = d.isNew ? '✔ Новый моб опубликован — можно ставить в лагерь и в квесты' : '✔ Опубликовано — у всех игроков'; S.stCls = 'ok'; }
    else { S.status = 'Не опубликовано: ' + (d.err || d.message || 'ошибка'); S.stCls = 'err'; } }
  else if (d.op === 'auto' && d.ok && S.edit) { Object.assign(S.edit.data, d.stats); S.status = 'Статы по уровню подставлены — черновик'; S.stCls = 'draft'; clearTimeout(S.dt); S.dt = setTimeout(() => ap.send({ type: 'admin_bmm', op: 'draft', id: S.edit.id, data: S.edit.data }), DRAFT_MS); }
  else if (d.op === 'here' && d.ok && S.camp) { Object.assign(S.camp, { world: d.world, x: d.x, y: d.y }); S.cstatus = `📍 ${d.world} ${d.x},${d.y}`; S.cst = ''; }
  else if (d.op === 'camps' && d.ok && S.list) { S.list.camps = d.camps; // живые таймеры — только ячейки «Сейчас», без перерисовки формы
    const cells = ap.el?.querySelectorAll('.bmma [data-live]'); if (cells?.length) { for (const td of cells) { const c = d.camps.find((x) => x.id === td.dataset.live); if (c) td.textContent = liveTxt(c); } if (cells.length === d.camps.length) return; } }
  else if (d.op === 'save') { const ok = d.ok, msg = ok ? '✔ Сохранено' : 'Ошибка: ' + (d.err || d.message || '');
    if (d.kind === 'bmcamp') { S.cstatus = msg; S.cst = ok ? 'ok' : 'err'; if (ok) { if (d.camps) S.list.camps = d.camps; if (S.camp) S.camp.id = d.id; } }
    else if (d.kind === 'bmbody') { S.bstatus = msg; if (ok) { if (d.body) S.list.body = d.body; if (S.bpart) S.bpart.id = d.id; } }
    else { S.gstatus = msg; } }
  else if (!d.ok) ap.msg?.('Ошибка: ' + (d.err || ''));
  rerender();
}
