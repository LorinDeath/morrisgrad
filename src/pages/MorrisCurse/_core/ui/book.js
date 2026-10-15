import { objText } from '../../../../../server/meta/objText.ts';
import { rsInfo } from '../../../../../server/meta/rsAny.ts';
// «Книга Проклятого» — единое окно прогрессии: задания, герой и таланты, навыки и Сияние,
// снаряжение (5 слотов) и сумка, ремесло, бестиарий, ветка души (только у Алтаря).
// Данные — из снимка сервера (MetaClient). Клиент не содержит таблиц предметов и дропа: карточки предметов,
// Библиотеку предметов и пулы дропа мобов сервер присылает ТОЛЬКО для открытого игроком (itemCards.js, lib_get).
import { statIcon } from './statIcons.js';
import {
  TALENTS, TALENT_TIER_REQ, TALENT_BRANCHES, TALENT_BY_ID, ABILITY_BY_ID, ABILITIES_DEF, RADIANCE_PROPS, RADIANCE_MAX, radianceCost, radianceColor,
  RARITIES, SLOTS, SLOT_ORDER, RUN_SKILLS, RUN_SKILL_BY_ID, RUN_SKILL_DROP_PCT, RESOURCES, SOUL_BRANCH, STAR_NAMES, HERO_NAMES, NPCS, STAT_CAPS, MOB_INFO,
} from '../../../../../server/meta/shared.ts';
import { ITEM_BY_ID, iconHtml } from '../meta/itemCards.js';
import { QUESTS, QUEST_BY_ID, CAMPAIGN_NAMES } from '../../../../../server/meta/quests.ts';
import { esc } from './overlay.js';
import { skillIcon } from './actionBar.js';

const TABS = [
  ['quests', '📜', 'Задания', 'J'],
  ['hero', '🧬', 'Герой', 'T'],
  ['skills', '✦', 'Навыки', 'K'],
  ['gear', '🎒', 'Снаряжение', 'I'],
  ['library', '📚', 'Библиотека', 'L'],
  ['bestiary', '👁️', 'Бестиарий', 'B'],
  ['runskills', '🌀', 'Кодекс навыков', ''],
  ['craft', '⚒️', 'Ремесло', ''],
  ['soul', '🜏', 'Душа', ''],
];
const STAT_LABEL = {
  dmgMin: 'Урон (мин)', dmgMax: 'Урон (макс)', hp: 'Здоровье', armor: 'Броня', critPct: 'Крит, %', speedPct: 'Скорость, %',
  regen: 'Регенерация/с', cdrPct: 'Перезарядка −%', magnetPct: 'Радиус сбора, %', lifestealPct: 'Вампиризм, %', atkSpeedPct: 'Скорость атаки, %', dmgPct: 'Урон, %',
};
const STAR_COL = { yellow: '#facc15', red: '#ef4444', purple: '#c084fc', black: '#94a3b8' };
const star = (c, n = 1) => `<b style="color:${STAR_COL[c] || '#fff'}">${'★'.repeat(Math.max(0, n))}</b>`;

// требование уровня: предмет уровня N надевает герой уровня ≥ N (сервер отклоняет equip)
const reqOf = (d) => Math.max(1, d?.req || 1, d?.lvl || 1);
const reqHtml = (d, h) => { const r = reqOf(d); const bad = h && h.lvl < r; return `<span class="mc-req ${bad ? 'bad' : 'ok'}">Требуется уровень героя: ${r}${bad ? ` (у вас ${h.lvl})` : ''}</span>`; };

export function itemStatsHtml(def, newProps = []) {
  const st = def.stats || {};
  const rows = [];
  if (st.dmgMin || st.dmgMax) rows.push(`${statIcon('dmgMin')}Урон: <b>${st.dmgMin}–${st.dmgMax}</b>`);
  for (const [k, v] of Object.entries(st)) if (k !== 'dmgMin' && k !== 'dmgMax' && v) rows.push(`${statIcon(k)}${STAT_LABEL[k] || k}: <b>+${v}</b>${newProps.includes(k) ? ' <i class="mc-new">новое свойство</i>' : ''}`);
  return rows.join('<br>');
}
// Источник дропа: «Мошкара-Жнец — 5%» — из карточки сервера (только для открытых предметов)
export function itemSources(id) {
  return (ITEM_BY_ID[id]?.sources || []).map((s) => (s.mob.startsWith('craft:') ? s.name : `${s.name} — ${s.chance}%`));
}
// «Откуда этот экземпляр»: kill:<mob> / boss:<mob> / run:<room>:<mob> / quest:<id> / craft:<recipe>
export function srcLabel(src) {
  if (!src) return '';
  const [k, a, b] = String(src).split(':');
  const mob = (id) => MOB_INFO[String(id || '').replace(/^run_/, '')]?.name || id;
  if (k === 'kill' || k === 'boss' || k === 'rare') return `${k === 'boss' ? 'мировой босс' : k === 'rare' ? 'редкий Отголосок' : 'добыча'}: ${mob(a)}`;
  if (k === 'run') return `забег «${a}»${b ? ` · ${mob(b)}` : ''}`;
  if (k === 'quest') return `награда задания`;
  if (k === 'craft') return 'ремесло у Петра';
  if (k === 'migrate') return 'перенесён из старого профиля';
  if (k === 'grant') return 'выдан сервером';
  return src;
}
const ROLE_RU = { melee: 'ближний бой', swarm: 'рой', charger: 'таран', ranged: 'стрелок', caster: 'заклинатель', tank: 'танк' };
const NEW_BADGE = '<i class="mc-new">новое</i>';
const RAR = (r) => RARITIES[r] || RARITIES.common;

const sortBtn = (d) => `<button class="mc-btn sm" data-act="lvlsort" title="Сортировка по уровню">ур. ${d === 'desc' ? '↓' : '↑'}</button>`;
export class Book {
  constructor(overlay, meta, { canSoul, nearPetr }) {
    this.ov = overlay;
    this.meta = meta;
    this.canSoul = canSoul;
    this.nearPetr = nearPetr;
    this.tab = 'quests';
    this.sel = null; // выбранный предмет/навык
    this.isOpen = false;
    const el = document.createElement('div');
    el.className = 'mc-book';
    el.style.display = 'none';
    el.innerHTML = `<div class="mc-book-head"><div class="mc-book-tabs"></div><button class="mc-book-x" title="Закрыть (Esc)">✕</button></div><div class="mc-book-body"></div>`;
    overlay.layer.appendChild(el);
    this.el = el;
    this.tabsEl = el.querySelector('.mc-book-tabs');
    this.body = el.querySelector('.mc-book-body');
    el.querySelector('.mc-book-x').addEventListener('click', () => this.close());
    el.addEventListener('pointerdown', (e) => e.stopPropagation());
    el.addEventListener('click', (e) => this.onClick(e));
    el.addEventListener('wheel', (e) => e.stopPropagation(), { passive: true });
    meta.on(() => { if (this.isOpen) this.render(); });
    // окно подтверждения — внутри игры (не браузерный confirm)
    const ask = document.createElement('div'); ask.className = 'mc-ask'; ask.style.display = 'none';
    el.appendChild(ask); this.askEl = ask;
    ask.addEventListener('click', (e) => { const b = e.target.closest('[data-ask]'); if (!b) return; e.stopPropagation(); const fn = this.askOk; this.closeAsk(); if (b.dataset.ask === 'ok') fn?.(); });
  }
  confirmIn(title, html, onOk, okLabel = 'Разобрать') {
    this.askOk = onOk;
    this.askEl.innerHTML = `<div class="mc-ask-box"><h3>${esc(title)}</h3><div class="mc-ask-body">${html}</div><div class="mc-ask-btns"><button class="mc-btn danger" data-ask="ok">${esc(okLabel)}</button><button class="mc-btn" data-ask="no">Отмена</button></div></div>`;
    this.askEl.style.display = '';
  }
  closeAsk() { this.askOk = null; this.askEl.style.display = 'none'; }
  /** превью массового разбора от сервера → окно со списком «что получите» */
  showSalvagePreview(p) {
    const rn = RARITIES[p.rarity]?.name || p.rarity;
    if (!p.uids?.length) { this.confirmIn(`Разбор: ${rn}`, '<p class="mc-dim">В сумке нет неодетых предметов этой редкости.</p>', null, 'OK'); return; }
    const got = Object.entries(p.res || {}).map(([k, n]) => `<li>${RESOURCES[k]?.icon || '•'} ${esc(RESOURCES[k]?.name || k)} ×${n}</li>`).join('') || '<li class="mc-dim">ничего</li>';
    const items = p.items.map((i) => `<li style="color:${RARITIES[p.rarity]?.color || ''}">${esc(i.name)}</li>`).join('');
    this.confirmIn(`Разобрать всё: ${rn} (${p.uids.length})`, `<b>Будет разобрано:</b><ul class="mc-ask-list">${items}</ul><b>Вы получите:</b><ul class="mc-ask-list">${got}</ul>`, () => { this.meta.salvageMany(p.rarity, p.uids); this.sel = null; });
  }

  open(tab) { if (tab) this.tab = tab; this.isOpen = true; this.el.style.display = ''; this.libAsked = -1; this.render(); }
  close() { this.isOpen = false; this.el.style.display = 'none'; this.sel = null; }
  toggle(tab) { if (this.isOpen && (!tab || tab === this.tab)) this.close(); else this.open(tab); }

  onClick(e) {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    e.stopPropagation();
    const act = b.dataset.act, v = b.dataset.v, m = this.meta;
    switch (act) {
      case 'tab': this.tab = v; this.sel = null; this.render(); break;
      case 'sel': {
        this.sel = v;
        const it = this.meta.account?.inv.find((i) => i.uid === v);
        if (it?.n) this.meta.markSeen('inv', [v]);
        this.render(); break;
      }
      case 'lsel': this.lsel = v; if (this.meta.library?.items?.[v]?.isNew) this.meta.markSeen('items', [v]); this.render(); break;
      case 'msel': this.msel = this.msel === v ? null : v; if (this.meta.library?.mobs?.[v]?.isNew) this.meta.markSeen('mobs', [v]); this.render(); break;
      case 'lfilter': this.lfilter = v; this.render(); break;
      case 'cfilter': this.cfilter = v; this.render(); break;
      case 'lvlsort': this.lvlSort = this.lvlSort === 'desc' ? 'asc' : 'desc'; this.render(); break; // Библиотека и Бестиарий: по уровню ↑/↓
      case 'mtrack': this.meta.setMobTrack(this.meta.mobTrack === v ? null : v); this.render(); break; // «Отслеживать» моба из Бестиария
      case 'seenall': {
        const L = this.meta.library;
        if (v === 'items' && L) this.meta.markSeen('items', Object.keys(L.items).filter((id) => L.items[id].isNew));
        if (v === 'mobs' && L) this.meta.markSeen('mobs', Object.keys(L.mobs).filter((id) => L.mobs[id].isNew));
        if (v === 'inv') this.meta.markSeen('inv', (this.meta.account?.inv || []).filter((i) => i.n).map((i) => i.uid));
        setTimeout(() => this.render(), 700); break;
      }
      case 'talent': m.talentLearn(v); break;
      case 'radiance': m.radianceUp(v); break;
      case 'silence':
        if (window.confirm('Заглушить навык НАВСЕГДА? Он перестанет работать у этого героя, а вы получите 1 очко Создания. Это нельзя отменить.')) m.silence(v);
        break;
      case 'slot': {
        const [id, idx] = v.split('|');
        // позиционно (Q, G, F): навык встаёт в выбранный слот; если он уже был в другом — меняются местами
        const n = m.hero?.slots || 2, i = Number(idx), lo = Array.from({ length: n }, (_, k) => m.hero?.loadout?.[k] || '');
        const cur = lo.indexOf(id);
        if (cur === i) break;
        if (cur >= 0) lo[cur] = lo[i]; lo[i] = id;
        m.setLoadout(lo);
        break;
      }
      case 'unslot': m.setLoadout((m.hero?.loadout || []).map((x) => (x === v ? '' : x))); break;
      case 'equip': m.equip(v); break;
      case 'unequip': m.unequip(v); break;
      case 'salvage': { const it = m.account?.inv.find((i) => i.uid === v), d = it && ITEM_BY_ID[it.id];
        this.confirmIn('Разобрать предмет?', `<p>${esc(d?.name || 'Предмет')} будет уничтожен.</p>`, () => { m.salvage(v); this.sel = null; }); break; }
      case 'salvage_r': m.salvagePreview(v); break;
      case 'craft': m.craft(v); break;
      case 'soul': m.soulBuy(v); break;
      case 'turnin': m.turnIn(v); break;
      case 'qtrack': m.setTrack(v === '*' ? null : v, true); this.render(); break;
      case 'quntrack': m.setTrack(v === '*' ? null : v, false); this.render(); break;
      default: break;
    }
  }

  render() {
    const st = this.meta.state;
    this.tabsEl.innerHTML = TABS.filter(([id]) => id !== 'soul' || this.canSoul() || (st?.account?.creation || 0) > 0 || (st?.account?.soul || []).length)
      .map(([id, ic, nm, key]) => { const n = this.badge(id); return `<button data-act="tab" data-v="${id}" class="${this.tab === id ? 'on' : ''}" title="${nm}${key ? ` [${key}]` : ''}">${ic}<span>${nm}</span>${n ? `<em class="mc-cnt">${n}</em>` : ''}</button>`; }).join('');
    if (!st) { this.body.innerHTML = '<p class="mc-dim">Нет связи с сервером: прогресс героя хранится на сервере и сейчас недоступен. Соло-забеги работают офлайн.</p>'; return; }
    const fn = { quests: this.rQuests, hero: this.rHero, skills: this.rSkills, gear: this.rGear, library: this.rLibrary, craft: this.rCraft, bestiary: this.rBestiary, runskills: this.rRunSkills, soul: this.rSoul }[this.tab] || this.rQuests;
    if ((this.tab === 'library' || this.tab === 'bestiary' || this.tab === 'runskills' || this.tab === 'gear') && this.libAsked !== this.meta.version) { this.libAsked = this.meta.version; this.meta.libGet(); }
    // прокрутка сохраняется у тела И у всех внутренних списков (сетка Библиотеки, Бестиарий, Кодекс, сумка, карточка):
    // перерисовка после клика по предмету/«просмотрено» не должна прыгать в начало
    const scroll = this.body.scrollTop, key = (e) => e.className.split(' ')[0] + '#' + [...this.body.querySelectorAll('.' + e.className.split(' ')[0])].indexOf(e);
    const inner = new Map(); for (const e of this.body.querySelectorAll('*')) if (e.scrollTop > 0 && e.className && typeof e.className === 'string') inner.set(key(e), e.scrollTop);
    const tabKey = this.tab;
    this.body.innerHTML = this.wallet(st) + fn.call(this, st);
    if (tabKey === this.lastTab) { this.body.scrollTop = scroll; for (const [k, v] of inner) { const [cls, i] = k.split('#'); const e = this.body.querySelectorAll('.' + cls)[+i]; if (e) e.scrollTop = v; } }
    this.lastTab = tabKey;
  }
  // счётчики «новое» на вкладках
  badge(id) {
    const u = this.meta.unread();
    return id === 'gear' ? u.gear : id === 'library' ? u.library : id === 'bestiary' ? u.mobs : 0;
  }

  wallet(st) {
    const s = st.account.stars || {};
    const hero = st.hero ? `<b>${esc(HERO_NAMES[st.hero.cls])}</b> · ур. ${st.hero.lvl}` : '<b>Душа без оболочки</b>';
    return `<div class="mc-wallet">${hero}<span>${star('yellow')} ${s.yellow || 0} ${star('red')} ${s.red || 0} ${star('purple')} ${s.purple || 0} ${star('black')} ${s.black || 0}${st.account.creation ? ` · 🜏 ${st.account.creation}` : ''}</span>${st.verified ? '' : '<em title="Войдите на сайт, чтобы прогресс был привязан к аккаунту">гость</em>'}</div>`;
  }

  // ---------- задания ----------
  rQuests(st) {
    const a = st.account;
    const active = Object.keys(a.quests.active).filter((id) => QUEST_BY_ID[id]);
    const row = (id) => {
      const q = QUEST_BY_ID[id];
      const p = a.quests.active[id]?.p || [];
      const complete = st.complete.includes(id);
      const objs = q.objectives.map((o, i) => {
        const need = o.count || 1;
        const have = Math.min(need, p[i] || 0);
        return `<li class="${have >= need ? 'ok' : ''}">${esc(objText(o))}${need > 1 ? ` <b>${have}/${need}</b>` : ''}</li>`;
      }).join('');
      const npc = NPCS[q.turnin || q.npc], other = !!q.turnin && q.turnin !== q.npc; // сдача может быть другому NPC
      const tr = this.meta.isTracked ? this.meta.isTracked(id) : true;
      return `<div class="mc-quest ${complete ? 'done' : ''} ${tr ? 'tracked' : 'untracked'}" data-q="${id}">
        <div class="t"><button class="mc-qtrack ${tr ? 'on' : ''}" data-act="${tr ? 'quntrack' : 'qtrack'}" data-v="${id}" title="${tr ? 'Снять с отслеживания' : 'Отслеживать: трекер, мини-карта, компас'}">${tr ? '👁 Отслеживается' : '◌ Отслеживать'}</button>${q.star ? star(q.star) + ' ' : ''}${esc(q.title)} <small>${esc(q.chapter || CAMPAIGN_NAMES[q.campaign] || '')}</small></div>
        <ul>${objs}</ul>
        ${q.hint && !complete ? `<div class="h">💡 ${esc(q.hint)}</div>` : ''}
        ${!complete && other ? `<div class="h">↪ Сдавать: ${esc(npc?.name || '')} (не тот, кто выдал)</div>` : ''}
        ${complete ? (q.auto ? '<div class="h ok">✔ Выполнено</div>' : `<div class="h ok">✔ Сдайте: ${esc(npc?.name || '')}${other ? ` <small>(не ${esc(NPCS[q.npc]?.name || '')} — другой NPC)</small>` : ''} <button class="mc-btn" data-act="turnin" data-v="${id}">Сдать</button></div>`) : ''}
        ${this.rewardsLine(q)}
      </div>`;
    };
    const avail = (st.available || []).filter((id) => !a.quests.active[id]).map((id) => {
      const q = QUEST_BY_ID[id];
      const npc = NPCS[q.npc];
      return `<div class="mc-quest avail"><div class="t">❕ ${q.star ? star(q.star) + ' ' : ''}${esc(q.title)} <small>${esc(q.chapter || CAMPAIGN_NAMES[q.campaign] || '')}</small></div><div class="h">Возьмите у: <b>${esc(npc?.name || q.npc)}</b>${npc ? ` (${npc.world === 'arinar' ? 'Аринар' : 'Поляна'})` : ''}</div></div>`;
    }).join('');
    const doneN = a.quests.done.length;
    const allBtns = active.length ? `<div class="mc-qtrack-all"><button class="mc-btn" data-act="qtrack" data-v="*">👁 Отслеживать все</button> <button class="mc-btn" data-act="quntrack" data-v="*">◌ Снять все</button></div>` : '';
    return `<h3>Активные</h3>${allBtns}${active.map(row).join('') || '<p class="mc-dim">Нет активных заданий.</p>'}
      ${avail ? `<h3>Доступны</h3>${avail}` : ''}
      <p class="mc-dim">Завершено заданий: ${doneN} из ${QUESTS.length}. Сюжет: Пролог → «Чувствовать» (Лэйр) и «Держать мир» (Алзи) → совместная «Гул» → звёздные испытания → экзамен → чёрная звезда.</p>`;
  }
  rewardsLine(q) {
    const r = q.rewards || {};
    const parts = [];
    if (r.xp) parts.push(`${r.xp} опыта`);
    for (const [c, n] of Object.entries(r.stars || {})) parts.push(`${star(c, n)}`);
    for (const id of r.items || []) { const d = ITEM_BY_ID[id]; if (d) parts.push(`<span style="color:${RARITIES[d.rarity].color}">${iconHtml(d, 20)} ${esc(d.name)}</span>`); }
    for (const [k, n] of Object.entries(r.res || {})) parts.push(`${RESOURCES[k]?.icon || ''}×${n}`);
    if (r.flag === 'talents_open') parts.push('🔓 Дерево талантов');
    if (r.flag === 'radiance_open') parts.push('🔓 Сияние навыков');
    return parts.length ? `<div class="r">Награда: ${parts.join(' · ')}</div>` : '';
  }

  // ---------- герой и таланты ----------
  rHero(st) {
    const h = st.hero;
    const heroes = Object.entries(st.heroes || {}).map(([id, x]) => `<span class="${h?.cls === id ? 'on' : ''}">${esc(HERO_NAMES[id])} <b>${x.lvl}</b></span>`).join('');
    if (!h) return `<div class="mc-heroes">${heroes}</div><p>Выберите оболочку у <b>Алтаря перевоплощения</b> в центре Поляны. Каждый герой качается отдельно.</p>`;
    const e = h.effective || {};
    const stat = (k, v, cap, id) => `<span>${id ? statIcon(id, 32) : ''}${k}<b>${v}</b>${cap ? `<i title="мягкий кап">/${cap}</i>` : ''}</span>`;
    const stats = `<div class="mc-stats">
      ${stat('Здоровье', e.maxHp, 0, 'maxHp')}${stat('Броня', `${e.armor} (−${Math.round((e.damageReduction || 0) * 100)}%)`, 0, 'armor')}${stat('Оружие', `${e.weaponMin}–${e.weaponMax}`, 0, 'weaponMin')}
      ${stat('Урон', `+${e.dmgPct}%`, STAT_CAPS.dmgPct, 'dmgPct')}${stat('Крит', `${e.critPct}%`, STAT_CAPS.critPct, 'critPct')}${stat('Скор. атаки', `+${e.atkSpeedPct}%`, STAT_CAPS.atkSpeedPct, 'atkSpeedPct')}
      ${stat('Перезарядка', `−${e.cdrPct}%`, STAT_CAPS.cdrPct, 'cdrPct')}${stat('Вампиризм', `${e.lifestealPct}%`, STAT_CAPS.lifestealPct, 'lifestealPct')}${stat('Скорость', `+${e.speedPct}%`, STAT_CAPS.speedPct, 'speedPct')}
    </div>`;
    const xpw = Math.min(100, (h.xp / (h.xpNeed || 1)) * 100);
    const open = this.meta.flag('talents_open');
    return `<div class="mc-heroes">${heroes}</div>
      <div class="mc-xp"><i style="width:${xpw}%"></i><span>Уровень ${h.lvl} · ${h.xp}/${h.xpNeed} опыта</span></div>
      ${stats}
      <h3>Дерево талантов · ${esc(HERO_NAMES[h.cls] || h.cls)} · очков: <b>${h.talentPoints}</b></h3>
      ${open ? '' : '<p class="mc-lock">🔒 Дерево откроет Алзи — кампания «Держать мир», глава 1 (Аринар).</p>'}
      ${this.rTree(h, open)}
      <p class="mc-dim">Очки талантов даются за уровни этого героя (1 за уровень). Стартовый навык класса бесплатен, остальные активные навыки открываются узлами дерева. Ключевые узлы ◆ — выбор одного из двух, навсегда. Проценты ограничены мягкими капами.</p>`;
  }

  /** дерево талантов для листа персонажа (C) */
  talentPanel() {
    const h = this.meta.hero;
    if (!h) return '<p class="mc-dim">Сначала выберите оболочку у Алтаря.</p>';
    const open = this.meta.flag('talents_open');
    return `<h3>Дерево талантов · ${esc(HERO_NAMES[h.cls] || h.cls)} · очков: <b>${h.talentPoints}</b></h3>
      ${open ? '' : '<p class="mc-lock">🔒 Дерево откроет Алзи — кампания «Держать мир», глава 1 (Аринар).</p>'}${this.rTree(h, open)}`;
  }
  // Дерево талантов: сетка 5×5 (ярус × колонка), связи — SVG. Состояния: изучен / доступен / закрыт.
  // Узлы навыков (active) и модификаторов (mod) — с пиксельной иконкой навыка; ключевые (keystone) — ромб, пара «или».
  rTree(h, open) {
    const T = TALENTS[h.cls] || [];
    const spent = Object.values(h.talents || {}).reduce((x, y) => x + y, 0);
    const CW = 104, RH = 92, X0 = 64, NODE = 58;
    const cx = (t) => X0 + t.col * CW + CW / 2, cy = (t) => 30 + (t.tier - 1) * RH + RH / 2;
    const rank = (t) => h.talents?.[t.id] || 0;
    const state = (t) => {
      const r = rank(t);
      if (r >= t.max) return 'max';
      const reqOk = (t.req || []).every((q) => (h.talents?.[q] || 0) > 0);
      const exclTaken = t.excl && (h.talents?.[t.excl] || 0) > 0;
      if (exclTaken) return 'excl';
      if (open && h.talentPoints > 0 && spent >= TALENT_TIER_REQ[t.tier] && reqOk) return r ? 'has avail' : 'avail';
      return r ? 'has' : 'locked';
    };
    const W = X0 + 5 * CW + 8, H = 30 + 5 * RH + 26;
    const lines = [];
    for (const t of T) for (const q of t.req || []) {
      const f = TALENT_BY_ID[q]; if (!f) continue;
      const on = rank(f) > 0 && rank(t) > 0, ready = rank(f) > 0;
      lines.push(`<line x1="${cx(f)}" y1="${cy(f) + NODE / 2}" x2="${cx(t)}" y2="${cy(t) - NODE / 2}" class="${on ? 'on' : ready ? 'ready' : ''}"/>`);
    }
    const pairs = new Set();
    for (const t of T) if (t.excl && !pairs.has(t.excl)) {
      pairs.add(t.id); const o = TALENT_BY_ID[t.excl];
      const y = cy(t), x1 = Math.min(cx(t), cx(o)) + NODE / 2, x2 = Math.max(cx(t), cx(o)) - NODE / 2;
      lines.push(`<line x1="${x1}" y1="${y}" x2="${x2}" y2="${y}" class="excl"/><text x="${(x1 + x2) / 2}" y="${y - 6}" class="or">или</text>`);
    }
    const tiers = [1, 2, 3, 4, 5].map((tier) => `<div class="mc-tt-tier ${spent >= TALENT_TIER_REQ[tier] ? '' : 'locked'}" style="top:${30 + (tier - 1) * RH}px;height:${RH}px"><b>${['I', 'II', 'III', 'IV', 'V'][tier - 1]}</b><small>${TALENT_TIER_REQ[tier] ? `от ${TALENT_TIER_REQ[tier]}` : 'старт'}</small></div>`).join('');
    const br = TALENT_BRANCHES[h.cls] || [];
    const heads = br.map((n, i) => { const w = (5 * CW) / br.length; return `<div class="mc-tt-br" style="left:${X0 + i * w}px;width:${w}px">${esc(n)}</div>`; }).join('');
    const nodes = T.map((t) => {
      const r = rank(t), st = state(t);
      const abil = t.grants || t.mod?.ability;
      const icon = abil ? skillIcon(abil, 40) : `<span class="em">${t.icon}</span>`;
      const kindTxt = { active: 'Активный навык', mod: `Модификатор: ${ABILITY_BY_ID[t.mod?.ability]?.name || ''}`, keystone: 'Ключевой выбор (одно из двух)', stat: 'Пассивный' }[t.kind];
      const reqTxt = (t.req || []).map((q) => TALENT_BY_ID[q]?.name).filter(Boolean).join(', ');
      const why = st === 'excl' ? `Выбран «${TALENT_BY_ID[t.excl]?.name}» — этот путь закрыт` : st === 'locked' ? [!open && 'дерево ещё закрыто (Алзи)', spent < TALENT_TIER_REQ[t.tier] && `нужно вложить ${TALENT_TIER_REQ[t.tier]} очков`, reqTxt && (t.req || []).some((q) => !(h.talents?.[q] > 0)) && `сначала: ${reqTxt}`, open && h.talentPoints <= 0 && 'нет свободных очков'].filter(Boolean).join(' · ') : '';
      const can = st.includes('avail');
      return `<button class="mc-tn ${t.kind} ${st}" data-act="${can ? 'talent' : ''}" data-v="${t.id}" data-tid="${t.id}" style="left:${cx(t) - NODE / 2}px;top:${cy(t) - NODE / 2}px">
        ${icon}${t.kind === 'mod' ? '<i class="plus">+</i>' : ''}<em>${r}/${t.max}</em>
        <div class="tip"><b>${esc(t.name)}</b><small>${kindTxt}${t.max > 1 ? ` · ранг ${r}/${t.max}` : ''}</small><p>${esc(t.desc)}</p>${t.grants ? `<p class="g">${esc(ABILITY_BY_ID[t.grants]?.desc || '')}</p>` : ''}${reqTxt ? `<small>Требует: ${esc(reqTxt)}</small>` : ''}${why ? `<small class="why">${esc(why)}</small>` : can ? '<small class="ok">Нажмите, чтобы изучить</small>' : ''}</div>
        <span class="nm">${esc(t.name)}</span></button>`;
    }).join('');
    return `<div class="mc-tree" style="width:${W}px;height:${H}px">${tiers}${heads}<svg width="${W}" height="${H}">${lines.join('')}</svg>${nodes}</div>
      <div class="mc-tt-legend"><span class="lg active"></span>активный навык <span class="lg mod"></span>модификатор навыка <span class="lg keystone"></span>ключевой выбор <span class="lg stat"></span>пассив · <b class="lg-has">●</b> изучен <b class="lg-av">●</b> доступен</div>`;
  }

  // ---------- навыки и Сияние ----------
  rSkills(st) {
    const h = st.hero;
    if (!h) return '<p>Сначала выберите оболочку у Алтаря.</p>';
    const own = ABILITIES_DEF.filter((x) => x.cls === h.cls);
    const mons = (h.monsterAbilities || []).map((id) => ABILITY_BY_ID[id]).filter(Boolean);
    const radOpen = this.meta.flag('radiance_open');
    const slots = [];
    for (let i = 0; i < h.slots; i++) {
      const id = h.loadout[i];
      const d = id && ABILITY_BY_ID[id];
      slots.push(`<div class="mc-aslot">${d ? `<span>${d.icon}</span><b>${esc(d.name)}</b><button class="mc-btn ghost" data-act="unslot" data-v="${id}">убрать</button>` : '<i>пусто</i>'}<em>${['Q', 'G', 'F'][i]}</em></div>`);
    }
    const card = (d, monster) => {
      const ab = h.abil[d.id] || { rad: 0 };
      const locked = !monster && !(h.unlocked || []).includes(d.id);
      const node = !monster && !d.legacy ? (TALENTS[h.cls] || []).find((t) => t.grants === d.id) : null;
      const sil = ab.silenced;
      const rad = ab.rad || 0;
      const stars = [];
      for (let i = 1; i <= RADIANCE_MAX; i++) stars.push(`<b style="color:${i <= rad ? STAR_COL[radianceColor(i)] : '#334155'}">★</b>`);
      const next = rad < RADIANCE_MAX ? radianceCost(rad + 1) : null;
      const props = (d.radiance || []).map((p, i) => `<span class="${rad >= (i + 1) * 3 ? 'on' : ''}" title="${esc(RADIANCE_PROPS[p]?.desc || '')}">${esc(RADIANCE_PROPS[p]?.name || p)} <small>(${['жёлтая', 'красная', 'фиолетовая'][i]} 3)</small></span>`).join('');
      const inLo = h.loadout.includes(d.id);
      const slotBtns = locked || sil ? '' : ['Q', 'G', 'F'].map((k, i) => i < h.slots
        ? `<button class="mc-btn ${inLo && h.loadout.indexOf(d.id) === i ? 'on' : ''}" data-act="slot" data-v="${d.id}|${i}" title="Назначить на ${k}${h.loadout[i] && h.loadout[i] !== d.id ? ' (поменяется местами)' : ''}">${k}</button>`
        : `<button class="mc-btn" disabled title="Слот F — с 5 уровня героя">${k}</button>`).join('');
      return `<div class="mc-abil ${locked ? 'locked' : ''} ${sil ? 'sil' : ''}">
        <div class="t">${skillIcon(d.id, 32)}<b>${esc(d.name)}</b>${monster ? '<em>трофей</em>' : ''}${d.legacy ? '<em>классовый</em>' : ''}${locked ? `<em title="Откройте узел «${esc(node?.name || '')}» в дереве талантов">🔒 дерево, ярус ${node?.tier || '?'}</em>` : ''}${sil ? '<em>заглушён</em>' : ''}</div>
        <div class="d">${esc(d.desc)} · перезарядка ${d.cd} с</div>
        <div class="rad">Сияние: ${stars.join('')}</div>
        <div class="props">${props}</div>
        <div class="acts">${slotBtns}
          ${!sil && !locked && next ? `<button class="mc-btn gold" data-act="radiance" data-v="${d.id}" ${radOpen ? '' : 'disabled'} title="${radOpen ? '' : 'Сияние откроет Лэйр'}">Сияние ↑ ${star(next.color, next.stars)}</button>` : ''}
          ${!sil && !locked && !monster && (st.account.stars.black || 0) > 0 ? `<button class="mc-btn danger" data-act="silence" data-v="${d.id}" title="Чёрная звезда: заглушить навык навсегда → 1 очко Создания">Заглушить ${star('black')}</button>` : ''}
        </div></div>`;
    };
    return `<h3>Раскладка (${h.slots} слота${h.slots < 3 ? ' · 3-й слот с 5 уровня' : ''})</h3><div class="mc-aslots">${slots.join('')}</div>
      ${radOpen ? '' : '<p class="mc-lock">🔒 Сияние навыков откроет Лэйр — кампания «Чувствовать», глава 1. Звёзды дают звёздные испытания.</p>'}
      <h3>Навыки героя</h3>${own.map((d) => card(d, false)).join('')}
      ${mons.length ? `<h3>Навыки трофеев</h3>${mons.map((d) => card(d, true)).join('')}` : '<p class="mc-dim">Навыки Отголосков даёт их снаряжение: наденьте «Лапки-лезвия мухи» — получите «Лезвийный рывок».</p>'}
      <p class="mc-dim">Сияние: 3 уровня за каждый цвет звёзд (жёлтые → красные → фиолетовые), на 3-м уровне цвета — уникальное свойство. Сила +6%/шаг (кап +45%), перезарядка −2.5%/шаг.</p>`;
  }

  // ---------- снаряжение ----------
  rGear(st) {
    const h = st.hero;
    const a = st.account;
    const byUid = new Map(a.inv.map((i) => [i.uid, i]));
    const equippedUids = new Set(h ? Object.values(h.equip || {}) : []);
    const slots = SLOT_ORDER.map((slot) => {
      const uid = h?.equip?.[slot];
      const it = uid && byUid.get(uid);
      const d = it && ITEM_BY_ID[it.id];
      // клик по надетому — карточка статов (Снять только кнопкой в карточке); снятие drag'ом не меняем (его нет)
      return `<button class="mc-gslot ${d ? 'filled' : ''} ${d && this.sel === uid ? 'on' : ''}" ${d && uid ? `data-act="sel" data-v="${uid}"` : `data-act="sel" data-v=""`} title="${d ? esc(d.name) + ' — нажмите, чтобы посмотреть' : esc(SLOTS[slot]) + ': пусто'}" ${d ? `style="border-color:${RARITIES[d.rarity].color}"` : ''}><span>${d ? iconHtml(d, 40) : '·'}</span><small>${esc(SLOTS[slot])}</small>${d ? `<b style="color:${RARITIES[d.rarity].color}">${esc(d.name)}</b>` : ''}</button>`;
    }).join('');
    const bagItems = a.inv.filter((i) => !equippedUids.has(i.uid));
    const bag = bagItems.slice().sort((x, y) => (RARITIES[ITEM_BY_ID[y.id]?.rarity]?.order || 0) - (RARITIES[ITEM_BY_ID[x.id]?.rarity]?.order || 0)).map((it) => {
      const d = ITEM_BY_ID[it.id];
      if (!d) return '';
      const low = h && h.lvl < reqOf(d);
      return `<button class="mc-item ${low ? 'unmet' : ''} ${equippedUids.has(it.uid) ? 'eq' : ''} ${this.sel === it.uid ? 'on' : ''} ${it.n ? 'isnew' : ''}" data-act="sel" data-v="${it.uid}" style="border-color:${RARITIES[d.rarity].color}" title="${esc(d.name)}${low ? ` — нужен ур. ${reqOf(d)}` : ''}">${iconHtml(d, 40)}${it.n ? NEW_BADGE : ''}${low ? `<small class="req">${reqOf(d)}</small>` : ''}</button>`;
    }).join('');
    // массовый разбор по редкости: кнопка на каждую редкость, что есть в сумке → превью с сервера → окно подтверждения
    const rset = [...new Set(bagItems.map((i) => ITEM_BY_ID[i.id]?.rarity).filter(Boolean))].sort((x, y) => (RARITIES[x]?.order || 0) - (RARITIES[y]?.order || 0));
    const salvBtns = rset.map((r) => `<button class="mc-btn sm" data-act="salvage_r" data-v="${r}" style="border-color:${RARITIES[r].color};color:${RARITIES[r].color}" title="Разобрать все неодетые: ${esc(RARITIES[r].name)}">${esc(RARITIES[r].name)}</button>`).join('');
    const res = Object.entries(a.res || {}).filter(([, n]) => n > 0).map(([k, n]) => `<span title="${esc(RESOURCES[k]?.name || k)}">${RESOURCES[k]?.icon || '•'} ${n}</span>`).join('');
    let detail = '<p class="mc-dim">Нажмите на слот или предмет в сумке, чтобы увидеть характеристики. Снять / надеть — кнопками в карточке.</p>';
    const it = this.sel && byUid.get(this.sel);
    if (it) {
      const d = ITEM_BY_ID[it.id];
      const src = itemSources(it.id);
      const eq = equippedUids.has(it.uid);
      const look = d.look && typeof d.look === 'object' ? d.look : null;
      const feats = this.meta.account?.disc?.feats || {};
      const newProps = Object.keys(d.stats || {}).filter((k) => feats['prop:' + k] && !feats['prop:' + k].v);
      const newAb = d.grantsAbility || d.ability?.id;
      const abNew = newAb && feats['ability:' + newAb] && !feats['ability:' + newAb].v;
      if (newProps.length || abNew) this.meta.markSeen('feats', [...newProps.map((k) => 'prop:' + k), ...(abNew ? ['ability:' + newAb] : [])]);
      detail = `<div class="mc-tip"><div class="nm" style="color:${RARITIES[d.rarity].color}">${iconHtml(d, 32)} ${esc(d.name)}</div>
        <div class="rr">${esc(RARITIES[d.rarity].name)} · ${esc(SLOTS[d.slot])}${d.band ? ` · ${esc(d.band)}` : ''}</div>
        <div class="ss">${itemStatsHtml(d, newProps)}</div>
        <div class="fx">Ур. предмета ${d.lvl || 1}. ${reqHtml(d, h)}. Характеристики фиксированные — не растут с уровнем.</div>
        ${(() => { // действующий навык и выход разбора — с сервера (правки админки), иначе выпавший навык экземпляра
          const L = this.meta.library?.inv?.[it.uid], rs = L ? L.rs : it.rs, R = rs && rsInfo(rs);
          const SRC = { item: 'назначен этому предмету', type: 'назначен типу оружия', drop: 'выпал с оружием' };
          const sk = R ? `<div class="ab rsk">${R.icon} Навык оружия (R): <b>${esc(R.name)}</b> — ${esc(R.desc)}${L?.rsSrc ? ` <small class="mc-dim">(${SRC[L.rsSrc]})</small>` : ''}${eq ? ' · <i>активен</i>' : ' · наденьте, чтобы получить 4-й слот'}</div>` : '';
          const sv = L?.salv ? Object.entries(L.salv).map(([k, n]) => `${RESOURCES[k]?.icon || '•'} ${esc(RESOURCES[k]?.name || k)} ×${n}`).join(', ') : '';
          return sk + (sv ? `<div class="ab salv">⚒ Разбор даст: ${sv}</div>` : '');
        })()}
        ${d.ability ? `<div class="ab">✦ Даёт навык: <b>${esc(d.ability.name)}</b>${abNew ? NEW_BADGE : ''}</div>` : ''}
        ${look ? `<div class="ab">🎭 Часть облика «${esc(look.name)}» (${look.parts} предм.)${look.bonus ? ` — ${esc(look.bonus)}` : ''}</div>` : ''}
        ${it.src ? `<div class="src">Этот экземпляр: ${esc(srcLabel(it.src))}${it.at ? ` · ${new Date(it.at).toLocaleDateString('ru-RU')}` : ''}</div>` : ''}
        ${src.length ? `<div class="src">Источники: ${src.map(esc).join('; ')}</div>` : ''}
        ${d.lore ? `<div class="lore">${esc(d.lore)}</div>` : ''}
        <div class="acts">${h ? (eq ? `<button class="mc-btn" data-act="unequip" data-v="${d.slot}">Снять</button>` : (h.lvl < reqOf(d) ? `<button class="mc-btn gold" disabled title="Нужен ${reqOf(d)} уровень героя">Надеть</button>` : `<button class="mc-btn gold" data-act="equip" data-v="${it.uid}">Надеть</button>`)) : ''}
        ${eq ? '' : `<button class="mc-btn danger" data-act="salvage" data-v="${it.uid}">Разобрать</button>`}</div></div>`;
    }
    return `<div class="mc-gear"><div class="mc-gslots">${slots}</div><div class="mc-detail">${detail}</div></div>
      ${h ? '' : '<p class="mc-lock">Надевать предметы может только герой — выберите оболочку у Алтаря.</p>'}
      <h3>Сумка ${h ? 'героя' : ''} · ${bagItems.length}${salvBtns ? ` <span class="mc-salv">разобрать всё: ${salvBtns}</span>` : ''}${bagItems.some((i) => i.n) ? ` <button class="mc-btn sm" data-act="seenall" data-v="inv">отметить просмотренным</button>` : ''}</h3><div class="mc-bag">${bag || '<p class="mc-dim">Пусто. Убивайте Отголосков — их снаряжение станет вашим.</p>'}</div>
      <h3>Материалы</h3><div class="mc-res">${res || '<span class="mc-dim">нет</span>'}</div>`;
  }

  // ---------- ремесло ----------
  rCraft(st) {
    const a = st.account;
    const near = this.nearPetr();
    const rows = (st.recipes || []).map((r) => {
      const d = ITEM_BY_ID[r.item];
      if (!d) return '';
      const ok = Object.entries(r.cost).every(([k, n]) => (a.res[k] || 0) >= n);
      const cost = Object.entries(r.cost).map(([k, n]) => `<span class="${(a.res[k] || 0) >= n ? 'ok' : 'no'}">${RESOURCES[k]?.icon || ''} ${a.res[k] || 0}/${n}</span>`).join(' ');
      return `<div class="mc-recipe"><b style="color:${RARITIES[d.rarity].color}">${iconHtml(d, 24)} ${esc(d.name)}</b><small>${itemStatsHtml(d)}</small><div>${cost}</div><button class="mc-btn gold" data-act="craft" data-v="${r.id}" ${ok && near ? '' : 'disabled'}>Создать</button></div>`;
    }).join('');
    return `${near ? '' : '<p class="mc-lock">⚒️ Создавать можно у Петра (Поляна, юго-запад). Рецепты видны всегда.</p>'}${rows}`;
  }

  // ---------- Библиотека предметов ----------
  // Все предметы пула — сеткой; открытые (встречены/получены) — с данными от сервера, закрытые — силуэты (слот + редкость).
  rLibrary(st) {
    const L = this.meta.library;
    if (!L) return '<p class="mc-dim">Загрузка Библиотеки…</p>';
    const byN = new Map(Object.values(L.items).map((c) => [c.n, c]));
    const f = this.lfilter || 'all';
    const dir = this.lvlSort === 'desc' ? -1 : 1, lvOf = (n) => byN.get(n)?.lvl ?? (L.sil[n][2] || 1) * 5 - 2;
    const idx = L.sil.map((_, n) => n).sort((x, y) => (lvOf(x) - lvOf(y)) * dir || x - y);
    const cells = idx.map((n) => { const [slot, rar] = L.sil[n];
      const c = byN.get(n);
      if (f !== 'all' && f !== slot) return '';
      if (!c) return `<div class="mc-lib lock" style="border-color:${RAR(rar).color}55" title="${esc(RAR(rar).name)} · ${esc(SLOTS[slot])} — ещё не открыт">${iconHtml({ n }, 32, 'sil')}</div>`;
      return `<button class="mc-lib ${c.isNew ? 'isnew' : ''} ${this.lsel === c.id ? 'on' : ''} ${c.owned ? 'own' : ''}" data-act="lsel" data-v="${c.id}" style="border-color:${RAR(c.rarity).color}" title="${esc(c.name)}">${iconHtml(c, 32)}${c.isNew ? NEW_BADGE : ''}${c.owned ? `<small>×${c.owned}</small>` : ''}</button>`;
    }).join('');
    const opened = Object.keys(L.items).length;
    const owned = Object.values(L.items).filter((c) => c.st === 'owned').length;
    let detail = '<p class="mc-dim">Открытые предметы показывают характеристики и источники. Закрытые — только силуэт: слот и редкость.</p>';
    const c = this.lsel && L.items[this.lsel];
    if (c) {
      detail = `<div class="mc-tip"><div class="nm" style="color:${RAR(c.rarity).color}">${iconHtml(c, 32)} ${esc(c.name)}</div>
        <div class="rr">${esc(RAR(c.rarity).name)} · ${esc(SLOTS[c.slot])} · ур. ${c.lvl}${c.band ? ` · ${esc(c.band)}` : ''}</div>
        <div class="fx">${reqHtml(c, st.hero)}</div>
        <div class="ss">${itemStatsHtml(c)}</div>
        ${c.ability ? `<div class="ab">✦ Навык: <b>${esc(c.ability.name)}</b> — ${esc(c.ability.desc || '')}</div>` : ''}
        ${c.look ? `<div class="ab">🎭 Облик «${esc(c.look.name)}» (${c.look.parts} предм.)${c.look.bonus ? ` — ${esc(c.look.bonus)}` : ''}</div>` : ''}
        <div class="src">Где добыть: ${(c.sources || []).map((s) => esc(s.mob.startsWith('craft:') ? s.name : `${s.name} — ${s.chance}%`)).join('; ') || '—'}</div>
        <div class="src">${c.st === 'owned' ? `У вас: ${c.owned} шт.${c.ownedSrc?.length ? ` (${c.ownedSrc.map((x) => esc(srcLabel(x))).join('; ')})` : ''}` : 'Встречен, но ещё не получен'}</div>
        ${c.lore ? `<div class="lore">${esc(c.lore)}</div>` : ''}</div>`;
    }
    const tabs = [['all', 'Все'], ...SLOT_ORDER.map((s) => [s, SLOTS[s]])].map(([v, nm]) => `<button class="mc-btn sm ${f === v ? 'gold' : ''}" data-act="lfilter" data-v="${v}">${esc(nm)}</button>`).join('');
    const anyNew = Object.values(L.items).some((x) => x.isNew);
    return `<p class="mc-dim">Открыто <b>${opened}</b> из ${L.size} · получено ${owned}. ${anyNew ? `<button class="mc-btn sm" data-act="seenall" data-v="items">отметить всё просмотренным</button>` : ''}</p>
      <div class="mc-libf">${tabs} ${sortBtn(this.lvlSort)}</div><div class="mc-gear"><div class="mc-libgrid">${cells}</div><div class="mc-detail">${detail}</div></div>`;
  }

  // ---------- Библиотека мобов (бестиарий) ----------
  // Моб виден после встречи; после встречи показан его пул добычи: открытые предметы — по имени,
  // закрытые — силуэтом с цветом редкости и шансом. Данные пула — от сервера (lib_get).
  // Пул навыков забега (трофеи с оружия открытого мира) + кодекс: открытые и ещё скрытые
  // Кодекс навыков «Вампир-лайка»: какие навыки уже встречались на добытом оружии (сам навык живёт на оружии)
  // Кодекс навыков: ВСЕ навыки — героев, оружия (R) и монстров; данные и «открыт/нет» — с сервера (правки админки из D1)
  rRunSkills(st) {
    const cur = st.weaponSkill || null, C = this.meta.library?.codex;
    if (!C) return '<p class="mc-dim">Загрузка Кодекса…</p>';
    const f = this.cfilter || 'all', KN = { hero: 'Герои', weapon: 'Оружие (R)', trophy: 'Трофеи', mob: 'Монстры' };
    const list = C.filter((c) => f === 'all' || c.kind === f);
    const found = C.filter((c) => c.found).length;
    const cards = list.map((c) => c.found
      ? `<div class="mc-rskill ${cur && c.id === 'rs:' + cur ? 'on' : ''}"><i>${c.icon || '✦'}</i><b>${esc(c.name)}</b><small>${esc(c.desc || '')}</small><small class="mc-dim">${c.bound?.length ? `<small class="bound">📌 закреплён за: ${c.bound.map((w) => esc(w.name) + (w.eq ? ' <span class="eq">(надето)</span>' : '')).join(', ')}${c.boundHidden ? ` <span class="mc-dim">+ ещё ??? (${c.boundHidden})</span>` : ''}</small>` : c.boundHidden ? `<small class="bound mc-dim">📌 закреплён за: ??? — найдите оружие, чтобы узнать</small>` : ''}${esc(KN[c.kind])}${c.cls ? ' · ' + esc(HERO_NAMES[c.cls] || c.cls) : ''}${c.cd ? ` · перезарядка ${c.cd} с` : ''}${c.power ? ` · сила ×${c.power}` : ''}</small>${cur && c.id === 'rs:' + cur ? '<em>на надетом оружии · R</em>' : ''}</div>`
      : `<div class="mc-rskill locked"><i>❔</i><b>???</b><small>${c.kind === 'hero' && HERO_NAMES[c.cls] ? `${esc(HERO_NAMES[c.cls])}: откроется на ур. ${c.lvl}` : c.kind === 'weapon' ? 'Выпадает с оружием монстров открытого мира' : c.kind === 'trophy' ? 'Трофей монстров: даёт предмет из облика монстра' : 'Встретьте монстра с этим навыком'}</small>${c.boundHidden ? `<small class="bound mc-dim">📌 есть у ??? оружия (${c.boundHidden})</small>` : ''}</div>`).join('');
    const tabs = [['all', 'Все'], ...Object.entries(KN)].map(([v, nm]) => `<button class="mc-btn sm ${f === v ? 'gold' : ''}" data-act="cfilter" data-v="${v}">${esc(nm)} ${v === 'all' ? C.length : C.filter((c) => c.kind === v).length}</button>`).join('');
    return `<div class="mc-rs-head"><b>Кодекс навыков: ${found}/${C.length}</b>
      <small>Навыки героев открываются уровнем, навыки оружия — с добытым оружием (${RUN_SKILL_DROP_PCT.mob}% · редкие/элита ${RUN_SKILL_DROP_PCT.rare}% · боссы ${RUN_SKILL_DROP_PCT.boss}%; клавиша R), навыки монстров — при встрече с ними.</small></div>
      <div class="mc-libf">${tabs}</div><div class="mc-rs-grid">${cards}</div>`;
  }
  rBestiary(st) {
    const L = this.meta.library;
    const b = { ...(st.account.bestiary || {}) };
    for (const [id, m] of Object.entries(L?.mobs || {})) if (!b[id]) b[id] = { seen: 1, kills: m.kills, v: m.isNew ? 0 : 1 };
    // уровень/статы — с сервера (правки админки), иначе из справочника
    const lvlOf = (id) => L?.mobs?.[id]?.st?.lvl ?? MOB_INFO[id]?.lvl ?? 1, dir = this.lvlSort === 'desc' ? -1 : 1;
    const order = Object.keys(MOB_INFO).sort((x, y) => (lvlOf(x) - lvlOf(y)) * dir);
    const keys = [...order, ...Object.keys(b).filter((k) => !MOB_INFO[k])];
    const total = order.length;
    const seen = keys.filter((k) => b[k]).length;
    const rows = keys.map((id) => {
      const e = b[id];
      const info = MOB_INFO[id.replace(/^run_/, '')];
      if (!e) return MOB_INFO[id] ? `<div class="mc-beast unknown"><b>???</b><small>ур. ${lvlOf(id)} · ещё не встречен</small></div>` : '';
      const lm = L?.mobs?.[id];
      const isNew = lm ? lm.isNew : e.v === 0;
      const open = this.msel === id;
      const tag = info?.boss ? 'мировой босс' : info?.rare ? 'редкий' : info?.huge ? 'огромный' : id.startsWith('run_') ? 'забег' : ({ s: 'мелкий', m: 'средний', l: 'крупный' }[info?.size] || '');
      let body = '';
      if (open) {
        const d = lm?.drops;
        const gear = (d?.gear || []).map((g) => {
          if (g.id) { const c = ITEM_BY_ID[g.id] || L?.items?.[g.id]; return c ? `<li><span style="color:${RAR(c.rarity).color}">${iconHtml(c, 20)} ${esc(c.name)}</span> — <b>${g.chance}%</b></li>` : ''; }
          return `<li class="lock"><span style="color:${RAR(g.rarity).color}">${Number.isInteger(g.n) ? iconHtml(g, 20, 'sil') : '▒'} ${esc(RAR(g.rarity).name)} · ${esc(SLOTS[g.slot] || '')}</span> — <b>${g.chance}%</b></li>`;
        }).join('');
        const mats = (d?.res || []).map((m) => `<li>${RESOURCES[m.res]?.icon || ''} ${esc(RESOURCES[m.res]?.name || m.res)} — <b>${m.chance}%</b> ×${m.qty[0]}${m.qty[1] !== m.qty[0] ? '–' + m.qty[1] : ''}</li>`).join('');
        const S = lm?.st || info; // сервер: статы с правками админки
        const canTrack = !id.startsWith('run_');
        body = `<div class="s">${S ? `ур. ${S.lvl} · ${esc(ROLE_RU[info?.role] || info?.role || '')} · ОЗ ${S.hp} · урон ${S.dmg} · броня ${S.armor}` : ''}</div>
          ${lm?.st?.skills?.length ? `<div class="h">Навыки: ${lm.st.skills.map(esc).join(', ')}</div>` : ''}
          ${canTrack ? `<button class="mc-btn sm ${this.meta.mobTrack === id ? 'gold' : ''}" data-act="mtrack" data-v="${id}">${this.meta.mobTrack === id ? '🧭 Не отслеживать' : '🧭 Отслеживать'}</button>` : ''}
          ${info?.desc ? `<div class="h">${esc(info.desc)}</div>` : ''}
          ${d ? `<div class="h">Добыча (шанс за убийство):</div><ul>${gear || '<li class="mc-dim">—</li>'}</ul>${mats ? `<div class="h">Материалы:</div><ul>${mats}</ul>` : ''}` : '<p class="mc-dim">Загрузка пула добычи…</p>'}
          ${info?.lore ? `<div class="lore">${esc(info.lore)}</div>` : ''}`;
      }
      return `<div class="mc-beast ${isNew ? 'isnew' : ''}"><button class="mc-beast-h" data-act="msel" data-v="${id}"><b>${esc(info?.name || id)}${id.startsWith('run_') ? ' (забег)' : ''}</b>${isNew ? NEW_BADGE : ''}<small>${tag} · убито ${e.kills || 0}</small></button>${body}</div>`;
    }).join('');
    const anyNew = L ? Object.values(L.mobs).some((m) => m.isNew) : false;
    return `<p class="mc-dim">${sortBtn(this.lvlSort)} Встречено ${seen} из ${total}. Записи открываются при встрече; пул добычи — после встречи (закрытые предметы — силуэтом с редкостью и шансом). ${anyNew ? `<button class="mc-btn sm" data-act="seenall" data-v="mobs">отметить всё просмотренным</button>` : ''}</p>${rows}`;
  }

  // ---------- ветка души ----------
  rSoul(st) {
    const a = st.account;
    if (!this.canSoul()) return '<p class="mc-lock">Ветка души открывается только у Алтаря перевоплощения.</p>';
    const owned = new Set(a.soul);
    const rows = SOUL_BRANCH.map((n) => {
      const has = owned.has(n.id);
      const avail = !has && (!n.req || owned.has(n.req));
      const shown = has || avail;
      return `<div class="mc-soul ${has ? 'has' : ''}"><b>${shown ? esc(n.name) : '░░░░░'}</b><small>${has ? esc(n.desc) : avail ? '…что-то шепчет из темноты…' : ''}</small>
        ${avail ? `<button class="mc-btn danger" data-act="soul" data-v="${n.id}" ${a.creation >= n.cost ? '' : 'disabled'}>🜏 ${n.cost}</button>` : ''}</div>`;
    }).join('');
    return `<p class="mc-dim">Очки Создания: <b>${a.creation}</b>. Их даёт только заглушённый навык (чёрная звезда).</p>${rows}`;
  }
}
