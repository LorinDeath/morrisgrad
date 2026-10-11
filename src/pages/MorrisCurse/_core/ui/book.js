// «Книга Проклятого» — единое окно прогрессии: задания, герой и таланты, навыки и Сияние,
// снаряжение (5 слотов) и сумка, ремесло, бестиарий, ветка души (только у Алтаря).
// Данные — из снимка сервера (MetaClient). Клиент не содержит таблиц предметов и дропа: карточки предметов,
// Библиотеку предметов и пулы дропа мобов сервер присылает ТОЛЬКО для открытого игроком (itemCards.js, lib_get).
import {
  TALENTS, TALENT_TIER_REQ, ABILITY_BY_ID, ABILITIES_DEF, RADIANCE_PROPS, RADIANCE_MAX, radianceCost, radianceColor,
  RARITIES, SLOTS, SLOT_ORDER, RESOURCES, SOUL_BRANCH, STAR_NAMES, HERO_NAMES, NPCS, STAT_CAPS, MOB_INFO,
} from '../../../../../server/meta/shared.ts';
import { ITEM_BY_ID, iconHtml } from '../meta/itemCards.js';
import { QUESTS, QUEST_BY_ID, CAMPAIGN_NAMES } from '../../../../../server/meta/quests.ts';
import { esc } from './overlay.js';

const TABS = [
  ['quests', '📜', 'Задания', 'J'],
  ['hero', '🧬', 'Герой', 'T'],
  ['skills', '✦', 'Навыки', 'K'],
  ['gear', '🎒', 'Снаряжение', 'I'],
  ['library', '📚', 'Библиотека', 'L'],
  ['bestiary', '👁️', 'Бестиарий', 'B'],
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
  if (st.dmgMin || st.dmgMax) rows.push(`Урон: <b>${st.dmgMin}–${st.dmgMax}</b>`);
  for (const [k, v] of Object.entries(st)) if (k !== 'dmgMin' && k !== 'dmgMax' && v) rows.push(`${STAT_LABEL[k] || k}: <b>+${v}</b>${newProps.includes(k) ? ' <i class="mc-new">новое свойство</i>' : ''}`);
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
        const lo = [...(m.hero?.loadout || [])];
        const i = Number(idx);
        const cur = lo.indexOf(id);
        if (cur >= 0) lo.splice(cur, 1);
        lo.splice(Math.min(i, lo.length), 0, id);
        m.setLoadout(lo.slice(0, m.hero?.slots || 2));
        break;
      }
      case 'unslot': m.setLoadout((m.hero?.loadout || []).filter((x) => x !== v)); break;
      case 'equip': m.equip(v); break;
      case 'unequip': m.unequip(v); break;
      case 'salvage': if (window.confirm('Разобрать предмет на осколки души?')) { m.salvage(v); this.sel = null; } break;
      case 'craft': m.craft(v); break;
      case 'soul': m.soulBuy(v); break;
      case 'turnin': m.turnIn(v); break;
      default: break;
    }
  }

  render() {
    const st = this.meta.state;
    this.tabsEl.innerHTML = TABS.filter(([id]) => id !== 'soul' || this.canSoul() || (st?.account?.creation || 0) > 0 || (st?.account?.soul || []).length)
      .map(([id, ic, nm, key]) => { const n = this.badge(id); return `<button data-act="tab" data-v="${id}" class="${this.tab === id ? 'on' : ''}" title="${nm}${key ? ` [${key}]` : ''}">${ic}<span>${nm}</span>${n ? `<em class="mc-cnt">${n}</em>` : ''}</button>`; }).join('');
    if (!st) { this.body.innerHTML = '<p class="mc-dim">Нет связи с сервером: прогресс героя хранится на сервере и сейчас недоступен. Соло-забеги работают офлайн.</p>'; return; }
    const fn = { quests: this.rQuests, hero: this.rHero, skills: this.rSkills, gear: this.rGear, library: this.rLibrary, craft: this.rCraft, bestiary: this.rBestiary, soul: this.rSoul }[this.tab] || this.rQuests;
    if ((this.tab === 'library' || this.tab === 'bestiary') && this.libAsked !== this.meta.version) { this.libAsked = this.meta.version; this.meta.libGet(); }
    const scroll = this.body.scrollTop;
    this.body.innerHTML = this.wallet(st) + fn.call(this, st);
    this.body.scrollTop = scroll;
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
        return `<li class="${have >= need ? 'ok' : ''}">${esc(o.text)}${need > 1 ? ` <b>${have}/${need}</b>` : ''}</li>`;
      }).join('');
      const npc = NPCS[q.npc];
      return `<div class="mc-quest ${complete ? 'done' : ''}">
        <div class="t">${q.star ? star(q.star) + ' ' : ''}${esc(q.title)} <small>${esc(q.chapter || CAMPAIGN_NAMES[q.campaign] || '')}</small></div>
        <ul>${objs}</ul>
        ${q.hint && !complete ? `<div class="h">💡 ${esc(q.hint)}</div>` : ''}
        ${complete ? (q.auto ? '<div class="h ok">✔ Выполнено</div>' : `<div class="h ok">✔ Сдайте: ${esc(npc?.name || '')} <button class="mc-btn" data-act="turnin" data-v="${id}">Сдать</button></div>`) : ''}
        ${this.rewardsLine(q)}
      </div>`;
    };
    const avail = (st.available || []).filter((id) => !a.quests.active[id]).map((id) => {
      const q = QUEST_BY_ID[id];
      const npc = NPCS[q.npc];
      return `<div class="mc-quest avail"><div class="t">❕ ${q.star ? star(q.star) + ' ' : ''}${esc(q.title)} <small>${esc(q.chapter || CAMPAIGN_NAMES[q.campaign] || '')}</small></div><div class="h">Возьмите у: <b>${esc(npc?.name || q.npc)}</b>${npc ? ` (${npc.world === 'arinar' ? 'Аринар' : 'Поляна'})` : ''}</div></div>`;
    }).join('');
    const doneN = a.quests.done.length;
    return `<h3>Активные</h3>${active.map(row).join('') || '<p class="mc-dim">Нет активных заданий.</p>'}
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
    const stat = (k, v, cap) => `<span>${k}<b>${v}</b>${cap ? `<i title="мягкий кап">/${cap}</i>` : ''}</span>`;
    const stats = `<div class="mc-stats">
      ${stat('Здоровье', e.maxHp)}${stat('Броня', `${e.armor} (−${Math.round((e.damageReduction || 0) * 100)}%)`)}${stat('Оружие', `${e.weaponMin}–${e.weaponMax}`)}
      ${stat('Урон', `+${e.dmgPct}%`, STAT_CAPS.dmgPct)}${stat('Крит', `${e.critPct}%`, STAT_CAPS.critPct)}${stat('Скор. атаки', `+${e.atkSpeedPct}%`, STAT_CAPS.atkSpeedPct)}
      ${stat('Перезарядка', `−${e.cdrPct}%`, STAT_CAPS.cdrPct)}${stat('Вампиризм', `${e.lifestealPct}%`, STAT_CAPS.lifestealPct)}${stat('Скорость', `+${e.speedPct}%`, STAT_CAPS.speedPct)}
    </div>`;
    const xpw = Math.min(100, (h.xp / (h.xpNeed || 1)) * 100);
    const open = this.meta.flag('talents_open');
    const spent = Object.values(h.talents || {}).reduce((x, y) => x + y, 0);
    const tiers = [1, 2, 3].map((tier) => {
      const list = (TALENTS[h.cls] || []).filter((t) => t.tier === tier);
      const locked = spent < TALENT_TIER_REQ[tier];
      return `<div class="mc-tier ${locked ? 'locked' : ''}"><div class="tl">Ярус ${tier}${locked ? ` · нужно вложить ${TALENT_TIER_REQ[tier]}` : ''}</div>${list.map((t) => {
        const r = h.talents[t.id] || 0;
        const can = open && !locked && h.talentPoints > 0 && r < t.max && (!t.req || h.talents[t.req] > 0);
        return `<button class="mc-tal ${r ? 'has' : ''}" data-act="talent" data-v="${t.id}" ${can ? '' : 'disabled'} title="${esc(t.desc)}"><span>${t.icon}</span><b>${esc(t.name)}</b><i>${r}/${t.max}</i><small>${esc(t.desc)}</small></button>`;
      }).join('')}</div>`;
    }).join('');
    return `<div class="mc-heroes">${heroes}</div>
      <div class="mc-xp"><i style="width:${xpw}%"></i><span>Уровень ${h.lvl} · ${h.xp}/${h.xpNeed} опыта</span></div>
      ${stats}
      <h3>Дерево талантов · очков: <b>${h.talentPoints}</b></h3>
      ${open ? '' : '<p class="mc-lock">🔒 Дерево откроет Алзи — кампания «Держать мир», глава 1 (Аринар).</p>'}
      ${tiers}
      <p class="mc-dim">Очки талантов даются за уровни этого героя. Проценты ограничены мягкими капами — подробности в бестиарии баланса.</p>`;
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
      slots.push(`<div class="mc-aslot">${d ? `<span>${d.icon}</span><b>${esc(d.name)}</b><button class="mc-btn ghost" data-act="unslot" data-v="${id}">убрать</button>` : '<i>пусто</i>'}<em>${['Q', 'R', 'F'][i]}</em></div>`);
    }
    const card = (d, monster) => {
      const ab = h.abil[d.id] || { rad: 0 };
      const locked = !monster && h.lvl < d.unlockLevel;
      const sil = ab.silenced;
      const rad = ab.rad || 0;
      const stars = [];
      for (let i = 1; i <= RADIANCE_MAX; i++) stars.push(`<b style="color:${i <= rad ? STAR_COL[radianceColor(i)] : '#334155'}">★</b>`);
      const next = rad < RADIANCE_MAX ? radianceCost(rad + 1) : null;
      const props = (d.radiance || []).map((p, i) => `<span class="${rad >= (i + 1) * 3 ? 'on' : ''}" title="${esc(RADIANCE_PROPS[p]?.desc || '')}">${esc(RADIANCE_PROPS[p]?.name || p)} <small>(${['жёлтая', 'красная', 'фиолетовая'][i]} 3)</small></span>`).join('');
      const inLo = h.loadout.includes(d.id);
      const slotBtns = locked || sil ? '' : Array.from({ length: h.slots }, (_, i) => `<button class="mc-btn ${inLo && h.loadout.indexOf(d.id) === i ? 'on' : ''}" data-act="slot" data-v="${d.id}|${i}">${['Q', 'R', 'F'][i]}</button>`).join('');
      return `<div class="mc-abil ${locked ? 'locked' : ''} ${sil ? 'sil' : ''}">
        <div class="t"><span>${d.icon}</span><b>${esc(d.name)}</b>${monster ? '<em>трофей</em>' : ''}${d.legacy ? '<em>классовый</em>' : ''}${locked ? `<em>ур. ${d.unlockLevel}</em>` : ''}${sil ? '<em>заглушён</em>' : ''}</div>
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
      <p class="mc-dim">Сияние: 3 уровня за каждый цвет звёзд (жёлтые → красные → фиолетовые), на 3-м уровне цвета — уникальное свойство. Сила +6%/шаг (кап +45%).</p>`;
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
      return `<button class="mc-gslot" data-act="sel" data-v="${uid || ''}" ${d ? `style="border-color:${RARITIES[d.rarity].color}"` : ''}><span>${d ? iconHtml(d, 40) : '·'}</span><small>${esc(SLOTS[slot])}</small>${d ? `<b style="color:${RARITIES[d.rarity].color}">${esc(d.name)}</b>` : ''}</button>`;
    }).join('');
    const bag = a.inv.slice().sort((x, y) => (RARITIES[ITEM_BY_ID[y.id]?.rarity]?.order || 0) - (RARITIES[ITEM_BY_ID[x.id]?.rarity]?.order || 0)).map((it) => {
      const d = ITEM_BY_ID[it.id];
      if (!d) return '';
      const low = h && h.lvl < reqOf(d);
      return `<button class="mc-item ${low ? 'unmet' : ''} ${equippedUids.has(it.uid) ? 'eq' : ''} ${this.sel === it.uid ? 'on' : ''} ${it.n ? 'isnew' : ''}" data-act="sel" data-v="${it.uid}" style="border-color:${RARITIES[d.rarity].color}" title="${esc(d.name)}${low ? ` — нужен ур. ${reqOf(d)}` : ''}">${iconHtml(d, 40)}${it.n ? NEW_BADGE : ''}${low ? `<small class="req">${reqOf(d)}</small>` : ''}</button>`;
    }).join('');
    const res = Object.entries(a.res || {}).filter(([, n]) => n > 0).map(([k, n]) => `<span title="${esc(RESOURCES[k]?.name || k)}">${RESOURCES[k]?.icon || '•'} ${n}</span>`).join('');
    let detail = '<p class="mc-dim">Нажмите на предмет, чтобы увидеть характеристики и источник.</p>';
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
      <h3>Сумка (общая для всех героев) · ${a.inv.length}${a.inv.some((i) => i.n) ? ` <button class="mc-btn sm" data-act="seenall" data-v="inv">отметить просмотренным</button>` : ''}</h3><div class="mc-bag">${bag || '<p class="mc-dim">Пусто. Убивайте Отголосков — их снаряжение станет вашим.</p>'}</div>
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
    const cells = L.sil.map(([slot, rar], n) => {
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
      <div class="mc-libf">${tabs}</div><div class="mc-gear"><div class="mc-libgrid">${cells}</div><div class="mc-detail">${detail}</div></div>`;
  }

  // ---------- Библиотека мобов (бестиарий) ----------
  // Моб виден после встречи; после встречи показан его пул добычи: открытые предметы — по имени,
  // закрытые — силуэтом с цветом редкости и шансом. Данные пула — от сервера (lib_get).
  rBestiary(st) {
    const L = this.meta.library;
    const b = { ...(st.account.bestiary || {}) };
    for (const [id, m] of Object.entries(L?.mobs || {})) if (!b[id]) b[id] = { seen: 1, kills: m.kills, v: m.isNew ? 0 : 1 };
    const order = Object.keys(MOB_INFO).sort((x, y) => (MOB_INFO[x].lvl || 1) - (MOB_INFO[y].lvl || 1));
    const keys = [...order, ...Object.keys(b).filter((k) => !MOB_INFO[k])];
    const total = order.length;
    const seen = keys.filter((k) => b[k]).length;
    const rows = keys.map((id) => {
      const e = b[id];
      const info = MOB_INFO[id.replace(/^run_/, '')];
      if (!e) return MOB_INFO[id] ? `<div class="mc-beast unknown"><b>???</b><small>ур. ${info.lvl} · ещё не встречен</small></div>` : '';
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
        body = `<div class="s">${info ? `ур. ${info.lvl} · ${esc(ROLE_RU[info.role] || info.role || '')} · HP ${info.hp} · урон ${info.dmg} · броня ${info.armor}` : ''}</div>
          ${info?.desc ? `<div class="h">${esc(info.desc)}</div>` : ''}
          ${d ? `<div class="h">Добыча (шанс за убийство):</div><ul>${gear || '<li class="mc-dim">—</li>'}</ul>${mats ? `<div class="h">Материалы:</div><ul>${mats}</ul>` : ''}` : '<p class="mc-dim">Загрузка пула добычи…</p>'}
          ${info?.lore ? `<div class="lore">${esc(info.lore)}</div>` : ''}`;
      }
      return `<div class="mc-beast ${isNew ? 'isnew' : ''}"><button class="mc-beast-h" data-act="msel" data-v="${id}"><b>${esc(info?.name || id)}${id.startsWith('run_') ? ' (забег)' : ''}</b>${isNew ? NEW_BADGE : ''}<small>${tag} · убито ${e.kills || 0}</small></button>${body}</div>`;
    }).join('');
    const anyNew = L ? Object.values(L.mobs).some((m) => m.isNew) : false;
    return `<p class="mc-dim">Встречено ${seen} из ${total}. Записи открываются при встрече; пул добычи — после встречи (закрытые предметы — силуэтом с редкостью и шансом). ${anyNew ? `<button class="mc-btn sm" data-act="seenall" data-v="mobs">отметить всё просмотренным</button>` : ''}</p>${rows}`;
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
