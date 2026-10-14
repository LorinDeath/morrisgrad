// Админ-панель (только роль admin; сервер проверяет КАЖДЫЙ запрос — клиентская кнопка лишь скрыта у остальных).
// Вкладки: Бестиарий / Оружие / Предметы / Навыки / Дроп / Квесты / Журнал. Поля — из server/meta/overrides.ts (SCHEMA),
// черты — редактор эффектов в духе RPG Maker MZ (Traits): эффект + параметры, добавить/удалить. «Сохранить» → D1.
import { esc } from './overlay.js';
import { statIcon } from './statIcons.js';

const TABS = [['mob', '👹 Бестиарий'], ['weapon', '🗡 Оружие'], ['item', '🎒 Предметы'], ['skill', '✨ Навыки'], ['loot', '💰 Дроп'], ['quest', '📜 Квесты'], ['audit', '🧾 Журнал']];
const STAT_OF = (path) => (path.startsWith('stats.') ? path.slice(6) : { hp: 'maxHp', dmg: 'dmgMin', armor: 'armor', speed: 'speedPct', 'atk.range': 'area', cd: 'atkSpeedPct', 'status.dpsPct': 'dmgPct', crit: 'critPct' }[path]);
const css = `
.mc-admin{position:absolute;left:4%;top:4%;width:92%;height:92%;z-index:60;background:rgba(10,7,20,.97);color:#f1e7d0;font:13px/1.35 monospace;display:flex;flex-direction:column;
  border:2px solid #c59b27;border-radius:10px;box-shadow:0 0 0 1px #3b2a12,0 12px 40px rgba(0,0,0,.7),inset 0 0 0 1px rgba(253,230,138,.12);overflow:hidden;min-width:420px;min-height:300px;resize:both}
.mc-admin header{cursor:move;background:linear-gradient(#2a1d0b,#160f08);user-select:none}
.mc-admin.sheet{left:0!important;top:0!important;width:100%!important;height:100%!important;border-radius:0;resize:none;min-width:0}
.mc-admin .rz{position:absolute;right:2px;bottom:2px;width:14px;height:14px;cursor:nwse-resize;background:linear-gradient(135deg,transparent 50%,#c59b27 50%);opacity:.7}
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
.mc-admin aside li{display:flex;gap:6px;align-items:baseline}.mc-admin aside li .nm{flex:1;overflow:hidden;text-overflow:ellipsis}
.mc-admin aside li .lv{flex:none;color:#86efac;font-size:11px;background:#10261a;border:1px solid #1f5135;border-radius:4px;padding:0 4px}
.mc-admin aside li.grp{cursor:default;color:#c4b5fd;background:#160f26;font-weight:bold}
.mc-admin .stars{color:#fbbf24;font-weight:bold;white-space:nowrap}
.mc-admin .qtree details{margin-left:16px;border-left:1px dashed #4b3a6e;padding-left:6px}
.mc-admin .qtree summary{cursor:pointer;list-style:none;padding:2px 0}.mc-admin .qtree summary::-webkit-details-marker{display:none}
.mc-admin .qtree summary::before{content:'▸ ';color:#9a8bb8}.mc-admin .qtree details[open]>summary::before{content:'▾ '}
.mc-admin .qtree .leaf{margin-left:16px;padding:2px 0 2px 14px;border-left:1px dashed #4b3a6e}
.mc-admin .qn{cursor:pointer;background:#1b142c;border:1px solid #6b4fa0;border-radius:6px;padding:1px 7px;display:inline-block}
.mc-admin .qn:hover{border-color:#fbbf24}.mc-admin .qn.custom{border-color:#22c55e}.mc-admin .qn small{color:#9a8bb8}
.mc-admin .qtree .tbar{margin-bottom:8px;display:flex;gap:6px}
.mc-admin select[multiple]{min-width:260px}
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

const SLOT_ORDER = ['', 'helmet', 'armor', 'hands', 'legs', 'boots', 'ring', 'amulet', 'paws', 'consumable', 'quest', '__res'];
const SLOT_NAMES = { helmet: '⛑ Шлемы', armor: '🛡 Броня (тело)', hands: '🧤 Перчатки', legs: '👖 Поножи', boots: '👢 Обувь', ring: '💍 Кольца', amulet: '📿 Амулеты', paws: '🐾 Лапы', consumable: '🧪 Расходники', quest: '📜 Квестовые', __res: '🪨 Материалы' };
export class AdminPanel {
  // окно ВНУТРИ игрового контейнера (работает в полноэкранном режиме, игра рисуется позади): перетаскивание за шапку,
  // изменение размера за угол, Esc — закрыть; на телефоне — лист на весь игровой экран
  constructor(send, host) { this.host = host || document.body; this.send = send; this.el = null; this.cat = null; this.tab = 'mob'; this.sel = null; this.q = ''; }
  get isOpen() { return !!this.el; }
  open() {
    if (this.el) return;
    if (!document.getElementById('mc-admin-css')) { const s = document.createElement('style'); s.id = 'mc-admin-css'; s.textContent = css; document.head.appendChild(s); }
    const el = this.el = document.createElement('div'); el.className = 'mc-admin';
    if (this.host.clientWidth < 760 || /Mobi|Android|iPhone/i.test(navigator.userAgent)) el.classList.add('sheet');
    if (getComputedStyle(this.host).position === 'static') this.host.style.position = 'relative';
    el.innerHTML = `<header><b>🛠 Админ-панель</b><div class="tabs">${TABS.map(([k, t]) => `<button data-tab="${k}">${t}</button>`).join(' ')}</div><span class="msg"></span><button class="btn" data-x>✕ Закрыть</button></header>
      <main><aside><input placeholder="Поиск…"><div class="chips"></div><ul></ul></aside><section><p>Загрузка данных с сервера…</p></section></main>`;
    this.host.appendChild(el);
    // клавиши не доходят до игры (WASD/навыки), Esc закрывает
    el.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Escape') { e.preventDefault(); this.close(); } });
    el.tabIndex = -1; el.focus({ preventScroll: true });
    ['pointerdown', 'wheel', 'touchstart', 'contextmenu'].forEach((t) => el.addEventListener(t, (e) => e.stopPropagation(), { passive: t !== 'contextmenu' }));
    { // перетаскивание за шапку
      const hd = el.querySelector('header'); let d0 = null;
      hd.addEventListener('pointerdown', (e) => { if (el.classList.contains('sheet') || e.target.closest('button,input,select')) return; const r = el.getBoundingClientRect(), H = this.host.getBoundingClientRect(); d0 = { x: e.clientX, y: e.clientY, l: r.left - H.left, t: r.top - H.top, H }; hd.setPointerCapture(e.pointerId); });
      hd.addEventListener('pointermove', (e) => { if (!d0) return; const w = el.offsetWidth, h = el.offsetHeight; if (w > d0.H.width * 0.8) { el.style.width = Math.round(d0.H.width * 0.8) + 'px'; } if (h > d0.H.height * 0.85) el.style.height = Math.round(d0.H.height * 0.85) + 'px'; const l = Math.max(0, Math.min(d0.H.width - el.offsetWidth, d0.l + e.clientX - d0.x)), t = Math.max(0, Math.min(d0.H.height - el.offsetHeight, d0.t + e.clientY - d0.y)); /* окно не выходит за игровой экран */ el.style.left = l + 'px'; el.style.top = t + 'px'; });
      hd.addEventListener('pointerup', () => { d0 = null; });
    } el.addEventListener('keyup', (e) => e.stopPropagation());
    el.querySelector('[data-x]').onclick = () => this.close();
    el.querySelectorAll('[data-tab]').forEach((b) => (b.onclick = () => { this.tab = b.dataset.tab; this.sel = null; this.q = ''; const qi = this.el.querySelector('aside input'); if (qi) qi.value = ''; this.msg(''); this.render(); }));
    el.querySelector('aside input').oninput = (e) => { this.q = e.target.value.toLowerCase(); this.list(); };
    this.send({ type: 'admin_open' });
  }
  close() { this.el?.remove(); this.el = null; }
  msg(t, err) { const m = this.el?.querySelector('.msg'); if (m) { m.textContent = t; m.className = 'msg' + (err ? ' err' : ''); } }
  onCatalog(d) { this.cat = d; this.render(); }
  onResult(r) {
    if (!r.ok) { this.msg('✖ ' + (r.err || 'ошибка'), true); return; }
    if (r.kind && r.values) { const e = this.cat.ent[r.kind].find((x) => x.id === r.id); if (e) { e.values = r.values; if (r.kind === 'item') e.lvl = Math.max(1, r.values.req || 1, r.values.lvl || 1); if (r.kind === 'mob') e.lvl = r.values.lvl; } }
    if (r.op === 'quest' && r.quest) { this.onQuestApplied?.(r); const i = this.cat.quests.findIndex((x) => x.id === r.quest.id); const row = { id: r.quest.id, title: r.quest.title, npc: r.quest.npc, custom: !r.builtin, edited: r.builtin && !r.reset, requires: r.quest.requires || [], minLevel: r.quest.minLevel, stars: Object.values(r.quest.rewards?.stars || {}).reduce((a, b) => a + b, 0), def: r.quest }; if (i >= 0) this.cat.quests[i] = row; else this.cat.quests.push(row); this.sel = r.quest.id; }
    if (r.op === 'quest_delete') { this.cat.quests = this.cat.quests.filter((x) => x.id !== r.id); this.sel = null; }
    this.msg(`✔ Сохранено в D1${r.version ? ` (версия ${r.version})` : ''}`); this.render();
  }
  onAudit(rows) { this.audit = rows; if (this.tab === 'audit') this.render(); }
  items() {
    if (!this.cat) return [];
    const row = (e, kind, pre = '') => ({ id: pre + e.id, name: `${e.icon || ''} ${e.name}`.trim(), sub: e.id, lvl: e.lvl, kind });
    if (this.tab === 'quest') return [{ id: '__tree', name: '🌳 Дерево квестов' }, { id: '__new', name: '＋ Новый квест' }, ...this.cat.quests.map((q) => ({ id: q.id, name: q.title, stars: q.stars, lvl: q.minLevel, sub: (q.custom ? '✚ ' : q.edited ? '✎ ' : '📖 ') + q.npc }))];
    if (this.tab === 'audit') return [];
    // Оружие: типы (форма удара, черты) + конкретное оружие-предметы с требуемым уровнем надевания (item.req/lvl)
    if (this.tab === 'weapon') return [{ grp: 1, id: '__g1', name: 'Типы оружия' }, ...this.cat.ent.weapon.map((e) => ({ ...row(e, 'weapon'), sub: 'тип · ' + e.id })),
      { grp: 1, id: '__g2', name: 'Оружие (предметы)' }, ...this.cat.ent.item.filter((e) => e.slot === 'weapon').sort((a, b) => (a.lvl || 0) - (b.lvl || 0)).map((e) => row(e, 'item', 'item:'))];
    if (this.tab === 'item') { // ВСЕ предметы, кроме оружия: группы по слоту (сворачиваются) + материалы; фильтр-чипы сверху
      const out = [], col = this.collapsed || (this.collapsed = new Set());
      const groups = {};
      for (const e of this.cat.ent.item) if (e.slot !== 'weapon') (groups[e.slot] = groups[e.slot] || []).push(row(e, 'item'));
      groups.__res = (this.cat.res || []).map((r) => ({ id: 'res:' + r.id, name: `${r.icon || ''} ${r.name}`.trim(), sub: r.id + ' · материал', kind: 'res' }));
      for (const [g, rows] of Object.entries(groups).sort((a, b) => (SLOT_ORDER.indexOf(a[0]) + 99) % 99 - (SLOT_ORDER.indexOf(b[0]) + 99) % 99)) {
        if (this.chip && this.chip !== g) continue;
        out.push({ grp: 1, g, id: '__g_' + g, name: `${col.has(g) ? '▸' : '▾'} ${SLOT_NAMES[g] || g} · ${rows.length}` });
        if (!col.has(g)) out.push(...rows.sort((a, b) => (a.lvl || 0) - (b.lvl || 0) || a.name.localeCompare(b.name, 'ru')));
      }
      return out;
    }
    const list = this.cat.ent[this.tab].map((e) => row(e, this.tab));
    return this.tab === 'loot' ? list : list.sort((a, b) => (a.lvl || 0) - (b.lvl || 0));
  }
  list() {
    const ul = this.el.querySelector('aside ul');
    // поиск: русские названия и id, без учёта регистра, ё = е
    const norm = (t) => String(t || '').toLowerCase().replace(/ё/g, 'е');
    const q = norm(this.q).trim();
    const hit = (x) => !q || x.grp || x.id.startsWith('__') || norm(`${x.name} ${x.id} ${x.sub || ''}`).includes(q);
    ul.innerHTML = this.items().filter(hit).slice(0, 500)
      .map((x) => x.grp ? `<li class="grp" data-grp="1"${x.g ? ` data-g="${esc(x.g)}" style="cursor:pointer"` : ''}>${esc(x.name)}</li>` : `<li data-id="${esc(x.id)}" class="${x.id === this.sel ? 'on' : ''}"><span class="nm">${esc(x.name)}${x.stars ? ` <span class="stars">${x.stars} ★</span>` : ''} ${x.sub ? `<small>${esc(x.sub)}</small>` : ''}</span>${x.lvl ? `<span class="lv">ур. ${x.lvl}</span>` : ''}</li>`).join('');
    ul.querySelectorAll('li[data-g]').forEach((li) => (li.onclick = () => { const g = li.dataset.g, c = this.collapsed; c.has(g) ? c.delete(g) : c.add(g); this.list(); }));
    const chips = this.el.querySelector('.chips');
    if (chips) { chips.style.display = this.tab === 'item' ? '' : 'none';
      if (this.tab === 'item') { const gs = ['', ...new Set(this.cat.ent.item.filter((e) => e.slot !== 'weapon').map((e) => e.slot)), '__res'].sort((a, b) => (SLOT_ORDER.indexOf(a) + 99) % 99 - (SLOT_ORDER.indexOf(b) + 99) % 99);
        chips.innerHTML = gs.map((g) => `<button class="chip ${(this.chip || '') === g ? 'on' : ''}" data-chip="${g}">${g ? SLOT_NAMES[g] || g : 'Все'}</button>`).join('');
        chips.querySelectorAll('[data-chip]').forEach((b) => (b.onclick = () => { this.chip = b.dataset.chip || null; this.list(); })); } }
    ul.querySelectorAll('li[data-id]').forEach((li) => (li.onclick = () => { this.sel = li.dataset.id; this.render(); }));
  }
  render() {
    if (!this.el) return;
    this.el.querySelectorAll('[data-tab]').forEach((b) => b.classList.toggle('on', b.dataset.tab === this.tab));
    const sec = this.el.querySelector('section');
    if (!this.cat) return;
    this.list();
    if (this.tab === 'audit') { if (!this.audit) this.send({ type: 'admin_audit' }); sec.innerHTML = this.auditHtml(); return; }
    if (this.tab === 'quest') { if (!this.sel || this.sel === '__tree') this.questTree(sec); else this.questForm(sec); return; }
    const isItem = String(this.sel || '').startsWith('item:');
    const kind = isItem ? 'item' : this.tab, id = isItem ? this.sel.slice(5) : this.sel;
    if (String(this.sel || '').startsWith('res:')) { const r = (this.cat.res || []).find((x) => 'res:' + x.id === this.sel); sec.innerHTML = r ? `<h3>${esc(r.icon || '')} ${esc(r.name)}</h3><p>Материал <code>${esc(r.id)}</code> — выпадает с мобов и из сбора; редактируется через таблицы дропа (вкладка «Дроп»).</p>` : ''; return; }
    const e = this.cat.ent[kind].find((x) => x.id === id);
    if (!e) { sec.innerHTML = `<h3>${esc(this.cat.schema[this.tab].name)}</h3><p>Выберите запись слева. Всего: ${this.items().filter((x) => !x.grp && !x.id.startsWith('__')).length}.</p>`; return; }
    this.entityForm(sec, kind, e);
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
    sec.innerHTML = `<h3>${esc(e.icon || '')} ${esc(e.name)} <small style="color:#9a8bb8">${esc(kind)}:${esc(e.id)}</small>${e.lvl ? ` <span class="lv" style="color:#86efac">ур. ${e.lvl}</span>` : ''}</h3>
      ${kind === 'item' && e.slot === 'weapon' ? `<p><small>Оружие: требуемый уровень надевания = max(«Треб. уровень» <code>req</code>, «Ур. предмета» <code>lvl</code>); проверяет сервер при экипировке. Тип: ${esc(e.wtype || '—')}</small></p>` : ''}
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
    if (row && !row.custom && !draft && this.viewOnly) {
      const kids = this.cat.quests.filter((x) => (x.requires || []).includes(row.id)), par = (row.requires || []).map((id) => this.cat.quests.find((x) => x.id === id)).filter(Boolean);
      const link = (x) => `<span class="qn" data-go="${esc(x.id)}">${esc(x.title)}${x.stars ? ` <span class="stars">${x.stars} ★</span>` : ''}</span>`;
      sec.innerHTML = `<h3>🔒 ${esc(row.title)}${row.stars ? ` <span class="stars">${row.stars} ★</span>` : ''} <button class="btn" data-totree>🌳 К дереву</button></h3><p>Сюжетный квест из кода (${esc(row.id)}, NPC ${esc(row.npc)}${row.minLevel ? ', ур. ' + row.minLevel : ''}) — только просмотр. Новые квесты создаются кнопкой «＋ Новый квест».</p>
        <p>Открывается после: ${par.map(link).join(' ') || '— (корень)'}</p><p>Открывает: ${kids.map(link).join(' ') || '—'}</p>`;
      sec.querySelector('[data-totree]').onclick = () => { this.sel = '__tree'; this.render(); };
      sec.querySelectorAll('[data-go]').forEach((n) => (n.onclick = () => { this.sel = n.dataset.go; this.render(); }));
      return;
    }
    if (!row && this.sel !== '__new') { sec.innerHTML = '<h3>Квесты</h3><p>Выберите квест или «＋ Новый квест». Квест назначается NPC; игроки видят его в диалоге NPC («Все квесты»).</p>'; return; }
    const builtin = row && !row.custom;
    const q = draft || row?.def || { id: 'c_', npc: this.cat.npcs[0]?.id, title: '', objectives: [{ type: 'kill', mob: this.cat.mobs[0]?.id, count: 5, text: '' }], rewards: { xp: 100 }, offer: [''], progress: '', done: [''], lore: '' };
    const npcOpt = (cur, empty) => (empty ? '<option value="">— тот же —</option>' : '') + this.cat.npcs.map((n) => `<option value="${n.id}" ${n.id === cur ? 'selected' : ''}>${esc(n.name)} (${n.world})</option>`).join('');
    const opt = (list, cur) => list.map((x) => `<option value="${x.id}" ${x.id === cur ? 'selected' : ''}>${esc(x.name)}${x.lvl ? ' · ур.' + x.lvl : ''}</option>`).join('');
    const objRow = (o, i) => !this.cat.objTypes.includes(o.type) ? `<div class="trait" data-oi="${i}" data-raw="${esc(JSON.stringify(o))}"><span class="tn">🔒 ${esc(o.type)}</span><small>особая цель сюжета — меняется только текст</small><input data-otext value="${esc(o.text || '')}" style="flex:1;min-width:180px"></div>` : `<div class="trait" data-oi="${i}"><select data-ot>${this.cat.objTypes.map((t) => `<option ${t === o.type ? 'selected' : ''}>${t}</option>`).join('')}</select>
      ${['kill', 'kill_boss'].includes(o.type) ? `<select data-om>${opt(this.cat.mobs, o.mob)}</select>` : ''}${o.type === 'talk' ? `<select data-on>${npcOpt(o.npc)}</select>` : ''}
      ${['gather'].includes(o.type) ? `<select data-or>${opt(this.cat.res, o.res)}</select>` : ''}${o.type === 'collect' ? `<select data-oc><option value="">ресурс…</option>${opt(this.cat.items, o.item)}</select><select data-or>${opt(this.cat.res, o.res)}</select>` : ''}
      ${o.type === 'reach' ? `<select data-ow><option ${o.world === 'arinar' ? 'selected' : ''}>arinar</option><option ${o.world === 'hellfire' ? 'selected' : ''}>hellfire</option></select>` : ''}
      ${['kill', 'gather', 'collect', 'level'].includes(o.type) ? `<input type="number" data-ocnt min="1" max="999" value="${o.count || 1}">` : ''}
      <input data-otext placeholder="текст цели" value="${esc(o.text || '')}" style="flex:1;min-width:180px"><button class="btn red" data-orm="${i}">✕</button></div>`;
    sec.innerHTML = `${builtin ? `<p class="box" style="margin:0 0 8px">📖 Сюжетный квест <b>${esc(q.id)}</b> — правка хранится в D1 поверх кода; id не меняется, прогресс игроков сохраняется. ${row.edited ? '<b style="color:#fbbf24">✎ изменён</b>' : 'значения из кода'}</p>` : ''}<h3>📜 ${row ? 'Квест ' + esc(q.id) : 'Новый квест'}${row?.stars ? ` <span class="stars">${row.stars} ★</span>` : ''} <button class="btn" data-totree>🌳 К дереву</button></h3>
      <div class="grid"><label><span>id (c_…)</span><input data-q="id" value="${esc(q.id)}" ${row ? 'readonly' : ''}></label><label><span>Название</span><input data-q="title" value="${esc(q.title)}"></label>
      <label><span>Выдаёт NPC</span><select data-q="npc">${npcOpt(q.npc)}</select></label><label><span>Сдать NPC</span><select data-q="turnin">${npcOpt(q.turnin, true)}</select></label>
      <label><span>Мин. уровень</span><input type="number" data-q="minLevel" min="1" max="60" value="${q.minLevel ?? ''}"></label><label style="grid-column:1/-1"><span>🔗 Открывается после квеста(ов)<br><small>Ctrl/⌘ — несколько; пусто — корень дерева</small></span><select multiple size="6" data-q="requires">${this.cat.quests.filter((x) => x.id !== q.id).map((x) => `<option value="${esc(x.id)}" ${(q.requires || []).includes(x.id) ? 'selected' : ''}>${esc(x.title)}${x.stars ? ' ' + x.stars + '★' : ''} — ${esc(x.id)}</option>`).join('')}</select></label>
      <label><span>${statIcon('luck', 16)}Опыт</span><input type="number" data-q="xp" min="0" value="${q.rewards?.xp ?? 0}"></label><label><span>Предметы-награды (id через запятую)</span><input data-q="items" value="${esc((q.rewards?.items || []).join(','))}"></label>
      <label><span>★ Звёзды-награда</span><span>${[['yellow', '#fbbf24'], ['red', '#f87171'], ['purple', '#c084fc'], ['black', '#9ca3af']].map(([c, col]) => `<span style="color:${col}">★</span><input type="number" data-star="${c}" min="0" max="5" style="width:44px" value="${q.rewards?.stars?.[c] || ''}">`).join('')}</span></label></div>
      <div class="box"><b>Цели</b><div class="objs">${q.objectives.map(objRow).join('')}</div><button class="btn" data-oadd>＋ цель</button></div>
      <div class="box"><b>Реплики</b><p>Предложение (строки):</p><textarea data-q="offer">${esc((q.offer || []).join('\n'))}</textarea><p>В процессе:</p><textarea data-q="progress">${esc(q.progress || '')}</textarea><p>При сдаче (строки):</p><textarea data-q="done">${esc((q.done || []).join('\n'))}</textarea><p>Лор (открывается в «Все квесты» после выполнения):</p><textarea data-q="lore">${esc(q.lore || '')}</textarea></div>
      <p><button class="btn gold" data-qsave>💾 Сохранить квест в D1</button> ${builtin ? (row.edited ? '<button class="btn red" data-qreset>↺ Вернуть исходное</button>' : '') : row ? '<button class="btn red" data-qdel>🗑 Скрыть квест</button>' : ''}</p>`;
    const read = () => {
      const g = (k) => sec.querySelector(`[data-q="${k}"]`).value;
      const objectives = [...sec.querySelectorAll('[data-oi]')].map((r) => { const s = (a) => r.querySelector(a)?.value; if (r.dataset.raw) return { ...JSON.parse(r.dataset.raw), text: s('[data-otext]') }; return { type: s('[data-ot]'), mob: s('[data-om]'), npc: s('[data-on]'), res: s('[data-or]'), item: s('[data-oc]') || undefined, world: s('[data-ow]'), count: Number(s('[data-ocnt]') || 1), text: s('[data-otext]') }; });
      return { id: g('id').trim(), title: g('title'), npc: g('npc'), turnin: g('turnin') || undefined, minLevel: g('minLevel') || undefined, requires: [...sec.querySelector('[data-q="requires"]').selectedOptions].map((o) => o.value),
        objectives, rewards: { xp: Number(g('xp') || 0), items: g('items').split(',').map((x) => x.trim()).filter(Boolean), stars: Object.fromEntries([...sec.querySelectorAll('[data-star]')].filter((i) => Number(i.value) > 0).map((i) => [i.dataset.star, Number(i.value)])) }, offer: g('offer').split('\n'), progress: g('progress'), done: g('done').split('\n'), lore: g('lore') };
    };
    const rerender = (q2) => this.questForm(sec, q2);
    sec.querySelector('[data-totree]').onclick = () => { this.sel = '__tree'; this.render(); };
    sec.querySelectorAll('[data-ot]').forEach((s) => (s.onchange = () => rerender(read())));
    sec.querySelectorAll('[data-orm]').forEach((b) => (b.onclick = () => { const q2 = read(); q2.objectives.splice(+b.dataset.orm, 1); rerender(q2); }));
    sec.querySelector('[data-oadd]').onclick = () => { const q2 = read(); q2.objectives.push({ type: 'kill', mob: this.cat.mobs[0]?.id, count: 3, text: '' }); rerender(q2); };
    sec.querySelector('[data-qsave]').onclick = () => { this.msg('Сохранение…'); this.send({ type: 'admin_quest_save', quest: read() }); };
    sec.querySelector('[data-qreset]')?.addEventListener('click', () => { if (confirm('Вернуть квест к значениям из кода?')) { this.msg('Сброс…'); this.send({ type: 'admin_quest_reset', id: q.id }); } });
    sec.querySelector('[data-qdel]')?.addEventListener('click', () => { if (confirm('Скрыть квест у игроков?')) this.send({ type: 'admin_quest_delete', id: q.id }); });
  }
  // дерево квестов (как граф Obsidian, но деревом): корни — квесты без предусловий; дети — квесты, которые открываются после.
  // Квест с несколькими предусловиями виден под каждым (↪ — повтор). Узлы сворачиваются; клик по названию — открыть в редакторе.
  questTree(sec) {
    const Q = this.cat.quests, byId = Object.fromEntries(Q.map((q) => [q.id, q]));
    const kids = {}; for (const q of Q) for (const r of q.requires || []) if (byId[r]) (kids[r] = kids[r] || []).push(q);
    const roots = Q.filter((q) => !(q.requires || []).some((r) => byId[r]));
    const placed = new Set();
    const node = (q, path) => {
      const ch = (kids[q.id] || []).filter((c) => !path.has(c.id)); const rep = placed.has(q.id); placed.add(q.id);
      const lbl = `<span class="qn${q.custom ? ' custom' : ''}" data-go="${esc(q.id)}">${rep ? '↪ ' : ''}${esc(q.title)}${q.stars ? ` <span class="stars">${q.stars} ★</span>` : ''} <small>${esc(q.npc)}${q.minLevel ? ' · ур.' + q.minLevel : ''}${ch.length ? ' · открывает ' + ch.length : ''}</small></span>`;
      if (!ch.length || rep) return `<div class="leaf" data-node="${esc(q.id)}">${lbl}</div>`;
      const p2 = new Set(path); p2.add(q.id);
      return `<details open data-node="${esc(q.id)}"><summary>${lbl}</summary>${ch.map((c) => node(c, p2)).join('')}</details>`;
    };
    sec.innerHTML = `<h3>🌳 Дерево квестов <small style="color:#9a8bb8">${Q.length} квестов · корней ${roots.length}</small></h3>
      <div class="qtree"><div class="tbar"><button class="btn" data-exp>Развернуть всё</button><button class="btn" data-col>Свернуть всё</button><button class="btn gold" data-new>＋ Новый квест</button></div>${roots.map((r) => node(r, new Set())).join('')}</div>`;
    sec.querySelectorAll('[data-go]').forEach((n) => (n.onclick = (e) => { e.preventDefault(); e.stopPropagation(); this.sel = n.dataset.go; this.render(); }));
    sec.querySelector('[data-exp]').onclick = () => sec.querySelectorAll('.qtree details').forEach((d) => (d.open = true));
    sec.querySelector('[data-col]').onclick = () => sec.querySelectorAll('.qtree details').forEach((d) => (d.open = false));
    sec.querySelector('[data-new]').onclick = () => { this.sel = '__new'; this.render(); };
  }
  auditHtml() {
    const rows = this.audit || [];
    return `<h3>🧾 Журнал правок</h3><table><tr><th>#</th><th>Когда</th><th>Кто</th><th>Что</th><th>Версия</th><th>Стало</th></tr>${rows.map((r) => `<tr><td>${r.aid}</td><td>${new Date(r.at).toLocaleString('ru-RU')}</td><td>${esc(r.by)}</td><td>${esc(r.kind)}:${esc(r.target_id)}</td><td>${r.version || '—'}</td><td><small>${esc(String(r.after || 'удалено').slice(0, 160))}</small></td></tr>`).join('')}</table>`;
  }
}
