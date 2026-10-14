// Админ-панель (только роль admin; сервер проверяет КАЖДЫЙ запрос — клиентская кнопка лишь скрыта у остальных).
// Вкладки: Бестиарий / Оружие / Предметы / Навыки / Дроп / Квесты / Журнал. Поля — из server/meta/overrides.ts (SCHEMA),
// черты — редактор эффектов в духе RPG Maker MZ (Traits): эффект + параметры, добавить/удалить. «Сохранить» → D1.
import { esc } from './overlay.js';
import { statIcon } from './statIcons.js';

const TABS = [['mob', '👹 Бестиарий'], ['weapon', '🗡 Оружие'], ['item', '🎒 Предметы'], ['skill', '✨ Навыки'], ['loot', '💰 Дроп'], ['quest', '📜 Квесты'], ['audit', '🧾 Журнал']];
const STAT_OF = (path) => (path.startsWith('stats.') ? path.slice(6) : { hp: 'maxHp', dmg: 'dmgMin', armor: 'armor', speed: 'speedPct', 'atk.range': 'area', cd: 'atkSpeedPct', 'status.dpsPct': 'dmgPct', crit: 'critPct' }[path]);
const css = `
.mc-admin{position:fixed;inset:0;z-index:9000;background:rgba(8,5,16,.96);color:#f1e7d0;font:13px/1.35 monospace;display:flex;flex-direction:column}
.mc-admin header{display:flex;gap:6px;align-items:center;padding:8px 10px;border-bottom:2px solid #c59b27;flex-wrap:wrap}
.mc-admin header b{color:#f87171;margin-right:8px;font-size:15px}
.mc-admin .tabs button,.mc-admin .btn{background:#1b142c;border:1px solid #6b4fa0;color:#fde68a;padding:5px 9px;border-radius:6px;cursor:pointer;font:inherit}
.mc-admin .tabs button.on{background:#3b2a12;border-color:#c59b27}
.mc-admin .btn.gold{background:#78350f;border-color:#fbbf24}.mc-admin .btn.red{background:#4c0f17;border-color:#f87171}
.mc-admin main{flex:1;display:flex;min-height:0}
.mc-admin aside{width:260px;border-right:1px solid #3b2c52;display:flex;flex-direction:column;min-height:0}
.mc-admin aside input{margin:6px;padding:5px;background:#120c1f;border:1px solid #3b2c52;color:#fff;border-radius:4px}
.mc-admin aside ul{list-style:none;margin:0;padding:0;overflow:auto;flex:1}
.mc-admin aside li{padding:4px 8px;cursor:pointer;border-bottom:1px solid #1d1530;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.mc-admin aside li.on{background:#2a1d45;color:#fde68a}.mc-admin aside li small{color:#9a8bb8}
.mc-admin section{flex:1;overflow:auto;padding:10px 14px}
.mc-admin h3{margin:4px 0 10px;color:#fde68a}
.mc-admin .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:6px 14px}
.mc-admin label{display:flex;align-items:center;gap:6px;justify-content:space-between;background:#140e24;padding:4px 6px;border-radius:4px;border:1px solid #241a3a}
.mc-admin label span{display:flex;align-items:center;gap:5px}
.mc-admin input,.mc-admin select,.mc-admin textarea{background:#0d0918;border:1px solid #3b2c52;color:#fff;border-radius:4px;padding:3px 5px;font:inherit}
.mc-admin input[type=number]{width:90px}.mc-admin textarea{width:100%;min-height:54px}
.mc-admin .box{border:1px solid #6b4fa0;border-radius:8px;padding:8px;margin:10px 0;background:#110b1e}
.mc-admin .box > b{color:#c4b5fd}
.mc-admin .trait{display:flex;gap:8px;align-items:center;flex-wrap:wrap;padding:5px;border-bottom:1px dashed #2c2145}
.mc-admin .trait .tn{color:#fb923c;min-width:110px}
.mc-admin .msg{margin-left:auto;color:#a7f3d0}.mc-admin .msg.err{color:#fca5a5}
.mc-admin table{border-collapse:collapse;width:100%}.mc-admin td,.mc-admin th{border-bottom:1px solid #241a3a;padding:3px 6px;text-align:left;vertical-align:top}
.mc-admin .chips{display:flex;flex-wrap:wrap;gap:4px}.mc-admin .chips label{padding:2px 6px}
@media (max-width:760px){.mc-admin main{flex-direction:column}.mc-admin aside{width:auto;max-height:34vh;border-right:0;border-bottom:1px solid #3b2c52}}
`;

export class AdminPanel {
  constructor(send) { this.send = send; this.el = null; this.cat = null; this.tab = 'mob'; this.sel = null; this.q = ''; }
  get isOpen() { return !!this.el; }
  open() {
    if (this.el) return;
    if (!document.getElementById('mc-admin-css')) { const s = document.createElement('style'); s.id = 'mc-admin-css'; s.textContent = css; document.head.appendChild(s); }
    const el = this.el = document.createElement('div'); el.className = 'mc-admin';
    el.innerHTML = `<header><b>🛠 Админ-панель</b><div class="tabs">${TABS.map(([k, t]) => `<button data-tab="${k}">${t}</button>`).join(' ')}</div><span class="msg"></span><button class="btn" data-x>✕ Закрыть</button></header>
      <main><aside><input placeholder="Поиск…"><ul></ul></aside><section><p>Загрузка данных с сервера…</p></section></main>`;
    document.body.appendChild(el);
    el.addEventListener('keydown', (e) => e.stopPropagation()); el.addEventListener('keyup', (e) => e.stopPropagation());
    el.querySelector('[data-x]').onclick = () => this.close();
    el.querySelectorAll('[data-tab]').forEach((b) => (b.onclick = () => { this.tab = b.dataset.tab; this.sel = null; this.q = ''; const qi = this.el.querySelector('aside input'); if (qi) qi.value = ''; this.render(); }));
    el.querySelector('aside input').oninput = (e) => { this.q = e.target.value.toLowerCase(); this.list(); };
    this.send({ type: 'admin_open' });
  }
  close() { this.el?.remove(); this.el = null; }
  msg(t, err) { const m = this.el?.querySelector('.msg'); if (m) { m.textContent = t; m.className = 'msg' + (err ? ' err' : ''); } }
  onCatalog(d) { this.cat = d; this.render(); }
  onResult(r) {
    if (!r.ok) { this.msg('✖ ' + (r.err || 'ошибка'), true); return; }
    if (r.kind && r.values) { const e = this.cat.ent[r.kind].find((x) => x.id === r.id); if (e) e.values = r.values; }
    if (r.op === 'quest' && r.quest) { const i = this.cat.quests.findIndex((x) => x.id === r.quest.id); const row = { id: r.quest.id, title: r.quest.title, npc: r.quest.npc, custom: true, def: r.quest }; if (i >= 0) this.cat.quests[i] = row; else this.cat.quests.push(row); this.sel = r.quest.id; }
    if (r.op === 'quest_delete') { this.cat.quests = this.cat.quests.filter((x) => x.id !== r.id); this.sel = null; }
    this.msg(`✔ Сохранено в D1${r.version ? ` (версия ${r.version})` : ''}`); this.render();
  }
  onAudit(rows) { this.audit = rows; if (this.tab === 'audit') this.render(); }
  items() {
    if (!this.cat) return [];
    if (this.tab === 'quest') return [{ id: '__new', name: '＋ Новый квест' }, ...this.cat.quests.map((q) => ({ id: q.id, name: q.title, sub: (q.custom ? '✎ ' : '🔒 ') + q.npc }))];
    if (this.tab === 'audit') return [];
    return this.cat.ent[this.tab].map((e) => ({ id: e.id, name: `${e.icon || ''} ${e.name}`, sub: e.id }));
  }
  list() {
    const ul = this.el.querySelector('aside ul');
    ul.innerHTML = this.items().filter((x) => !this.q || (x.name + x.id).toLowerCase().includes(this.q)).slice(0, 400)
      .map((x) => `<li data-id="${esc(x.id)}" class="${x.id === this.sel ? 'on' : ''}">${esc(x.name)} ${x.sub ? `<small>${esc(x.sub)}</small>` : ''}</li>`).join('');
    ul.querySelectorAll('li').forEach((li) => (li.onclick = () => { this.sel = li.dataset.id; this.render(); }));
  }
  render() {
    if (!this.el) return;
    this.el.querySelectorAll('[data-tab]').forEach((b) => b.classList.toggle('on', b.dataset.tab === this.tab));
    const sec = this.el.querySelector('section');
    if (!this.cat) return;
    this.list();
    if (this.tab === 'audit') { if (!this.audit) this.send({ type: 'admin_audit' }); sec.innerHTML = this.auditHtml(); return; }
    if (this.tab === 'quest') { this.questForm(sec); return; }
    const e = this.cat.ent[this.tab].find((x) => x.id === this.sel);
    if (!e) { sec.innerHTML = `<h3>${esc(this.cat.schema[this.tab].name)}</h3><p>Выберите запись слева. Всего: ${this.cat.ent[this.tab].length}.</p>`; return; }
    this.entityForm(sec, this.tab, e);
  }
  entityForm(sec, kind, e) {
    const S = this.cat.schema[kind], v = e.values || {};
    const field = (f) => {
      const val = v[f.path], ic = STAT_OF(f.path) ? statIcon(STAT_OF(f.path), 16) : '';
      let inp;
      if (f.t === 'bool') inp = `<input type="checkbox" data-p="${f.path}" ${val ? 'checked' : ''}>`;
      else if (f.t === 'enum') inp = `<select data-p="${f.path}">${f.opts.map((o) => `<option ${o === (val ?? '') ? 'selected' : ''} value="${o}">${o || '—'}</option>`).join('')}</select>`;
      else if (f.t === 'skills') return `<div class="box" style="grid-column:1/-1"><b>${esc(f.label)}</b> <small>(до 5)</small><div class="chips">${this.cat.mobSkills.map((k) => `<label><input type="checkbox" data-sk="${k}" ${(val || []).includes(k) ? 'checked' : ''}>${k}</label>`).join('')}</div></div>`;
      else inp = `<input type="number" step="${f.t === 'int' ? 1 : 0.01}" min="${f.min}" max="${f.max}" data-p="${f.path}" value="${val ?? ''}" placeholder="—">`;
      return `<label title="${f.path} · ${f.min ?? ''}…${f.max ?? ''}"><span>${ic}${esc(f.label)}</span>${inp}</label>`;
    };
    sec.innerHTML = `<h3>${esc(e.icon || '')} ${esc(e.name)} <small style="color:#9a8bb8">${esc(kind)}:${esc(e.id)}</small></h3>
      ${kind === 'loot' ? this.lootHtml(v) : `<div class="grid">${S.fields.map(field).join('')}</div>`}
      ${S.traits ? `<div class="box"><b>Черты / эффекты</b> <small>(как Traits в RPG Maker MZ — срабатывают на сервере при попадании)</small><div class="traits"></div>
        <select class="addk">${Object.entries(this.cat.traits).map(([k, d]) => `<option value="${k}">${esc(d.name)}</option>`).join('')}</select> <button class="btn" data-addt>＋ Добавить эффект</button></div>` : ''}
      <p><button class="btn gold" data-save>💾 Сохранить в D1</button> <button class="btn red" data-reset>↺ Вернуть исходное</button></p>`;
    this.traits = JSON.parse(JSON.stringify(v.traits || []));
    const drawTraits = () => {
      const box = sec.querySelector('.traits'); if (!box) return;
      box.innerHTML = this.traits.map((t, i) => { const d = this.cat.traits[t.k]; return `<div class="trait"><span class="tn">${t.k === 'burn' ? '🔥' : t.k === 'freeze' ? '❄️' : t.k === 'poison' ? '☠' : t.k === 'bleed' ? '🩸' : t.k === 'lifesteal' ? '🦇' : '✦'} ${esc(d?.name || t.k)}</span>${(d?.params || []).map((p) => `<label><span>${esc(p.label)}</span><input type="number" step="0.1" min="${p.min}" max="${p.max}" data-ti="${i}" data-tk="${p.k}" value="${t[p.k] ?? p.def}"></label>`).join('')}<button class="btn red" data-rm="${i}">✕</button></div>`; }).join('') || '<small>Эффектов нет</small>';
      box.querySelectorAll('[data-ti]').forEach((inp) => (inp.oninput = () => { this.traits[+inp.dataset.ti][inp.dataset.tk] = Number(inp.value); }));
      box.querySelectorAll('[data-rm]').forEach((b) => (b.onclick = () => { this.traits.splice(+b.dataset.rm, 1); drawTraits(); }));
    };
    drawTraits();
    sec.querySelector('[data-addt]')?.addEventListener('click', () => { const k = sec.querySelector('.addk').value; const d = this.cat.traits[k]; this.traits.push({ k, ...Object.fromEntries(d.params.map((p) => [p.k, p.def])) }); drawTraits(); });
    if (kind === 'loot') this.bindLoot(sec, v);
    sec.querySelector('[data-save]').onclick = () => {
      let patch = {};
      if (kind === 'loot') patch = this.readLoot(sec);
      else {
        sec.querySelectorAll('[data-p]').forEach((i) => { const f = S.fields.find((x) => x.path === i.dataset.p); if (i.type === 'checkbox') patch[f.path] = i.checked; else if (i.value !== '') patch[f.path] = f.t === 'enum' ? i.value : Number(i.value); });
        if (S.fields.some((f) => f.t === 'skills')) patch.skills = [...sec.querySelectorAll('[data-sk]:checked')].map((i) => i.dataset.sk);
        if (S.traits) patch.traits = this.traits;
      }
      this.msg('Сохранение…'); this.send({ type: 'admin_save', kind, id: e.id, patch });
    };
    sec.querySelector('[data-reset]').onclick = () => { if (confirm('Вернуть значения из кода (удалить правку)?')) this.send({ type: 'admin_reset', kind, id: e.id }); };
  }
  lootHtml(v) {
    const opt = (list, cur) => list.map((x) => `<option value="${x.id}" ${x.id === cur ? 'selected' : ''}>${esc(x.name)}</option>`).join('');
    return `<div class="box"><b>Снаряжение (шанс %)</b><table class="lg">${(v.gear || []).map((g) => `<tr><td><select data-gi>${opt(this.cat.items, g.item)}</select></td><td><input type="number" data-gc min="0" max="100" step="0.1" value="${g.chance}"></td><td><button class="btn red" data-delrow>✕</button></td></tr>`).join('')}</table><button class="btn" data-addg>＋ предмет</button></div>
      <div class="box"><b>Материалы (шанс %, кол-во)</b><table class="lm">${(v.materials || []).map((m) => `<tr><td><select data-mr>${opt(this.cat.res, m.res)}</select></td><td><input type="number" data-mc min="0" max="100" value="${m.chance}"></td><td><input type="number" data-m0 min="1" max="99" value="${m.qty?.[0] ?? 1}"> – <input type="number" data-m1 min="1" max="99" value="${m.qty?.[1] ?? 1}"></td><td><button class="btn red" data-delrow>✕</button></td></tr>`).join('')}</table><button class="btn" data-addm>＋ материал</button></div>`;
  }
  bindLoot(sec, v) {
    const redraw = () => { const cur = this.readLoot(sec); sec.querySelector('.box').parentElement; const e = this.cat.ent.loot.find((x) => x.id === this.sel); this.entityForm(sec, 'loot', { ...e, values: cur }); };
    sec.querySelectorAll('[data-delrow]').forEach((b) => (b.onclick = () => { b.closest('tr').remove(); redraw(); }));
    sec.querySelector('[data-addg]').onclick = () => { const cur = this.readLoot(sec); cur.gear.push({ item: this.cat.items[0].id, chance: 5 }); const e = this.cat.ent.loot.find((x) => x.id === this.sel); this.entityForm(sec, 'loot', { ...e, values: cur }); };
    sec.querySelector('[data-addm]').onclick = () => { const cur = this.readLoot(sec); cur.materials.push({ res: this.cat.res[0].id, chance: 50, qty: [1, 1] }); const e = this.cat.ent.loot.find((x) => x.id === this.sel); this.entityForm(sec, 'loot', { ...e, values: cur }); };
  }
  readLoot(sec) {
    return { gear: [...sec.querySelectorAll('.lg tr')].map((r) => ({ item: r.querySelector('[data-gi]').value, chance: Number(r.querySelector('[data-gc]').value) })),
      materials: [...sec.querySelectorAll('.lm tr')].map((r) => ({ res: r.querySelector('[data-mr]').value, chance: Number(r.querySelector('[data-mc]').value), qty: [Number(r.querySelector('[data-m0]').value), Number(r.querySelector('[data-m1]').value)] })) };
  }
  questForm(sec, draft = null) {
    const row = this.cat.quests.find((q) => q.id === this.sel);
    if (row && !row.custom) { sec.innerHTML = `<h3>🔒 ${esc(row.title)}</h3><p>Сюжетный квест из кода (${esc(row.id)}, NPC ${esc(row.npc)}) — только просмотр. Новые квесты создаются кнопкой «＋ Новый квест».</p>`; return; }
    if (!row && this.sel !== '__new') { sec.innerHTML = '<h3>Квесты</h3><p>Выберите квест или «＋ Новый квест». Квест назначается NPC; игроки видят его в диалоге NPC («Все квесты»).</p>'; return; }
    const q = draft || row?.def || { id: 'c_', npc: this.cat.npcs[0]?.id, title: '', objectives: [{ type: 'kill', mob: this.cat.mobs[0]?.id, count: 5, text: '' }], rewards: { xp: 100 }, offer: [''], progress: '', done: [''], lore: '' };
    const npcOpt = (cur, empty) => (empty ? '<option value="">— тот же —</option>' : '') + this.cat.npcs.map((n) => `<option value="${n.id}" ${n.id === cur ? 'selected' : ''}>${esc(n.name)} (${n.world})</option>`).join('');
    const opt = (list, cur) => list.map((x) => `<option value="${x.id}" ${x.id === cur ? 'selected' : ''}>${esc(x.name)}${x.lvl ? ' · ур.' + x.lvl : ''}</option>`).join('');
    const objRow = (o, i) => `<div class="trait" data-oi="${i}"><select data-ot>${this.cat.objTypes.map((t) => `<option ${t === o.type ? 'selected' : ''}>${t}</option>`).join('')}</select>
      ${['kill', 'kill_boss'].includes(o.type) ? `<select data-om>${opt(this.cat.mobs, o.mob)}</select>` : ''}${o.type === 'talk' ? `<select data-on>${npcOpt(o.npc)}</select>` : ''}
      ${['gather'].includes(o.type) ? `<select data-or>${opt(this.cat.res, o.res)}</select>` : ''}${o.type === 'collect' ? `<select data-oc><option value="">ресурс…</option>${opt(this.cat.items, o.item)}</select><select data-or>${opt(this.cat.res, o.res)}</select>` : ''}
      ${o.type === 'reach' ? `<select data-ow><option ${o.world === 'arinar' ? 'selected' : ''}>arinar</option><option ${o.world === 'hellfire' ? 'selected' : ''}>hellfire</option></select>` : ''}
      ${['kill', 'gather', 'collect', 'level'].includes(o.type) ? `<input type="number" data-ocnt min="1" max="999" value="${o.count || 1}">` : ''}
      <input data-otext placeholder="текст цели" value="${esc(o.text || '')}" style="flex:1;min-width:180px"><button class="btn red" data-orm="${i}">✕</button></div>`;
    sec.innerHTML = `<h3>📜 ${row ? 'Квест ' + esc(q.id) : 'Новый квест'}</h3>
      <div class="grid"><label><span>id (c_…)</span><input data-q="id" value="${esc(q.id)}" ${row ? 'readonly' : ''}></label><label><span>Название</span><input data-q="title" value="${esc(q.title)}"></label>
      <label><span>Выдаёт NPC</span><select data-q="npc">${npcOpt(q.npc)}</select></label><label><span>Сдать NPC</span><select data-q="turnin">${npcOpt(q.turnin, true)}</select></label>
      <label><span>Мин. уровень</span><input type="number" data-q="minLevel" min="1" max="60" value="${q.minLevel ?? ''}"></label><label><span>Требует квесты (id, через запятую)</span><input data-q="requires" value="${esc((q.requires || []).join(','))}"></label>
      <label><span>${statIcon('luck', 16)}Опыт</span><input type="number" data-q="xp" min="0" value="${q.rewards?.xp ?? 0}"></label><label><span>Предметы-награды (id через запятую)</span><input data-q="items" value="${esc((q.rewards?.items || []).join(','))}"></label></div>
      <div class="box"><b>Цели</b><div class="objs">${q.objectives.map(objRow).join('')}</div><button class="btn" data-oadd>＋ цель</button></div>
      <div class="box"><b>Реплики</b><p>Предложение (строки):</p><textarea data-q="offer">${esc((q.offer || []).join('\n'))}</textarea><p>В процессе:</p><textarea data-q="progress">${esc(q.progress || '')}</textarea><p>При сдаче (строки):</p><textarea data-q="done">${esc((q.done || []).join('\n'))}</textarea><p>Лор (открывается в «Все квесты» после выполнения):</p><textarea data-q="lore">${esc(q.lore || '')}</textarea></div>
      <p><button class="btn gold" data-qsave>💾 Сохранить квест в D1</button> ${row ? '<button class="btn red" data-qdel>🗑 Скрыть квест</button>' : ''}</p>`;
    const read = () => {
      const g = (k) => sec.querySelector(`[data-q="${k}"]`).value;
      const objectives = [...sec.querySelectorAll('[data-oi]')].map((r) => { const s = (a) => r.querySelector(a)?.value; return { type: s('[data-ot]'), mob: s('[data-om]'), npc: s('[data-on]'), res: s('[data-or]'), item: s('[data-oc]') || undefined, world: s('[data-ow]'), count: Number(s('[data-ocnt]') || 1), text: s('[data-otext]') }; });
      return { id: g('id').trim(), title: g('title'), npc: g('npc'), turnin: g('turnin') || undefined, minLevel: g('minLevel') || undefined, requires: g('requires').split(',').map((x) => x.trim()).filter(Boolean),
        objectives, rewards: { xp: Number(g('xp') || 0), items: g('items').split(',').map((x) => x.trim()).filter(Boolean) }, offer: g('offer').split('\n'), progress: g('progress'), done: g('done').split('\n'), lore: g('lore') };
    };
    const rerender = (q2) => this.questForm(sec, q2);
    sec.querySelectorAll('[data-ot]').forEach((s) => (s.onchange = () => rerender(read())));
    sec.querySelectorAll('[data-orm]').forEach((b) => (b.onclick = () => { const q2 = read(); q2.objectives.splice(+b.dataset.orm, 1); rerender(q2); }));
    sec.querySelector('[data-oadd]').onclick = () => { const q2 = read(); q2.objectives.push({ type: 'kill', mob: this.cat.mobs[0]?.id, count: 3, text: '' }); rerender(q2); };
    sec.querySelector('[data-qsave]').onclick = () => { this.msg('Сохранение…'); this.send({ type: 'admin_quest_save', quest: read() }); };
    sec.querySelector('[data-qdel]')?.addEventListener('click', () => { if (confirm('Скрыть квест у игроков?')) this.send({ type: 'admin_quest_delete', id: q.id }); });
  }
  auditHtml() {
    const rows = this.audit || [];
    return `<h3>🧾 Журнал правок</h3><table><tr><th>#</th><th>Когда</th><th>Кто</th><th>Что</th><th>Версия</th><th>Стало</th></tr>${rows.map((r) => `<tr><td>${r.aid}</td><td>${new Date(r.at).toLocaleString('ru-RU')}</td><td>${esc(r.by)}</td><td>${esc(r.kind)}:${esc(r.target_id)}</td><td>${r.version || '—'}</td><td><small>${esc(String(r.after || 'удалено').slice(0, 160))}</small></td></tr>`).join('')}</table>`;
  }
}
