import { avatarHtml, uiPref, setUiPref, UI as UI_SKIN } from './uiSkin.js';
import { upBadge } from './upBadge.js';
import { curseTint } from './book.js';
import { tierOf, lookCls, lookStyle, lookName, enchText, enchBadge } from '../meta/enchCfg.js';
import { grimGet, grimReset, grimSet } from './grim.js';
// Рейтинг игроков (топ-100 по уровню / по рекорду урона) и просмотр персонажа (только чтение).
// Все данные — от сервера (rating / inspect); клиент ничего не считает и не хранит.
import { statIcon } from './statIcons.js';
import { ABILITY_BY_ID, RADIANCE_PROPS, radianceProps, RARITIES, SLOTS, SLOT_ORDER, MOB_INFO } from '../../../../../server/meta/shared.ts';
import { displayClassName } from '../survivors/data.js';
import { iconHtml } from '../meta/itemCards.js';
import { drawHeroPreview } from './heroPreview.js';
import { skillIcon, radColor } from './actionBar.js';
import { esc, roleTag } from './overlay.js';

const WORLD_RU = { hellfire: 'Поляна', arinar: 'Аринар' };
const STAT_RU = { dmgMin: 'Урон (мин)', dmgMax: 'Урон (макс)', hp: 'Здоровье', armor: 'Броня', critPct: 'Крит, %', speedPct: 'Скорость, %', regen: 'Регенерация/с',
  cdrPct: 'Перезарядка −%', magnetPct: 'Радиус сбора, %', lifestealPct: 'Вампиризм, %', atkSpeedPct: 'Скорость атаки, %', dmgPct: 'Урон, %', armorPen: 'Пробитие брони', armorPenPct: 'Пробитие брони, %' };
const heroLabel = (cls) => (cls ? displayClassName(cls, '—') : 'Душа');
export function whereLabel(w) {
  const [world, mob] = String(w || '').split(':');
  if (!world) return '—';
  return `${WORLD_RU[world] || world}${mob ? ' · ' + (MOB_INFO[mob]?.name || mob) : ''}`;
}
const fmtDate = (t) => { if (!t) return ''; const d = new Date(t); return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}`; };

export class Social {
  constructor({ overlay, send, onDuel, canDuel, onParty, canParty }) {
    this.onParty = onParty; this.canParty = canParty || (() => false);
    this.overlay = overlay; this.send = send;
    this.onDuel = onDuel; this.canDuel = canDuel; // вызов на дуэль из просмотра персонажа (только игрок в сети)
    this.tab = 'level'; this.data = null; this.view = null; // 'rating' | 'inspect'
    this.askedAt = 0;
  }
  get isOpen() { return !!this.view && !!this.overlay.screen && this.overlay.screen.classList.contains('mc-social'); }

  // ---------- рейтинг ----------
  openRating(tab) {
    if (tab) this.tab = tab;
    this.view = 'rating';
    const now = performance.now();
    if (!this.data || now - this.askedAt > 15000) { this.askedAt = now; this.send({ type: 'rating_get' }); this.loading = true; }
    this.renderRating();
  }
  onRating(d) { this.data = d; this.loading = false; if (this.view === 'rating') this.renderRating(); }
  onRatingErr(d) { this.loading = false; if (this.view === 'rating') { if (!this.data) this.err = d.message; this.renderRating(); } }

  renderRating() {
    const d = this.data, t = this.tab;
    const L = d?.[t];
    const tr = (r) => `<tr class="${r.me ? 'me' : ''}" data-id="${esc(r.id)}" data-hero="${esc(r.hero || '')}"><td class="n">${r.r}</td><td class="nm">${roleTag(r.role)}${esc(r.name)}${r.me ? ' <i>(вы)</i>' : ''}</td><td>${esc(heroLabel(r.hero))}</td>`;
    const row = (r) => t === 'level' ? `${tr(r)}<td class="v">${r.lvl}</td></tr>`
      : t === 'duel' ? `${tr(r)}<td class="v">${r.n ?? (r.w + r.l + r.d)}</td><td class="wl">${r.w}/${r.l}${r.d ? `<small>ничьи ${r.d}</small>` : ''}</td><td class="wr">${r.wr}%</td></tr>`
      : `${tr(r)}<td class="v">${r.v}</td><td class="w">${esc(whereLabel(r.where))}<small>${fmtDate(r.at)}</small></td></tr>`;
    const head = t === 'level' ? '<tr><th>#</th><th>Игрок</th><th>Герой</th><th>Ур.</th></tr>'
      : t === 'duel' ? '<tr><th>#</th><th>Игрок</th><th>Герой</th><th>Дуэлей</th><th>П/П</th><th>% побед</th></tr>'
      : '<tr><th>#</th><th>Игрок</th><th>Герой</th><th>Удар</th><th>Где</th></tr>';
    let body = '';
    if (!d) body = `<div class="mc-soc-empty">${this.err ? esc(this.err) : 'Загрузка рейтинга…'}</div>`;
    else if (!L) body = '<div class="mc-soc-empty">Вкладка появится после обновления сервера</div>';
    else if (!L.top.length) body = `<div class="mc-soc-empty">${t === 'dmg' ? 'Рекордов ещё нет — бейте монстров на Поляне и в Аринаре' : t === 'duel' ? 'Дуэлей ещё не было — вызовите кого-нибудь: выберите игрока и «⚔️ Вызвать на дуэль»' : 'Пока пусто'}</div>`;
    else {
      const meOut = L.me && L.me.r > L.top.length;
      body = `<div class="mc-soc-scroll"><table class="mc-soc-tbl ${t}"><thead>${head}</thead><tbody>${L.top.map(row).join('')}</tbody></table></div>`
        + `<div class="mc-soc-mine">${L.me ? (meOut ? `<table class="mc-soc-tbl ${t}"><tbody>${row(L.me)}</tbody></table>` : `Ваше место: <b>${L.me.r}</b>`) : (t === 'dmg' ? 'У вас ещё нет рекорда урона' : t === 'duel' ? 'Вы ещё не дрались на дуэлях' : 'Вас пока нет в рейтинге')}</div>`;
    }
    const note = t === 'dmg' ? 'Самый сильный одиночный удар по монстру в открытом мире (считает сервер; забеги не учитываются).'
      : t === 'duel' ? 'Топ-100 дуэлянтов: учитываются и число дуэлей, и доля побед (нижняя граница Уилсона) — одна победа 1:0 не обгонит 18 из 20. Бой считает сервер.' : 'Лучший по уровню герой игрока (при равенстве — опыт). Во вкладке «Рекорд урона» — герой с самым сильным ударом.';
    const html = `<div class="mc-soc"><div class="mc-soc-head"><h2>🏆 РЕЙТИНГ</h2><button class="mc-soc-x" title="Закрыть (Esc)">✕</button></div>
      <div class="mc-soc-tabs"><button data-tab="level" class="${t === 'level' ? 'on' : ''}">По уровню</button><button data-tab="dmg" class="${t === 'dmg' ? 'on' : ''}">Рекорд урона</button><button data-tab="duel" class="${t === 'duel' ? 'on' : ''}">⚔️ Дуэлянты</button></div>
      <div class="mc-soc-note">${note}${d && d.total[t] !== undefined ? ` · всего: ${d.total[t]}` : ''}</div>${body}</div>`;
    this.overlay.showScreen(html, [], 'mc-social');
    const el = this.overlay.screen;
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      if (e.target.closest('.mc-soc-x')) { this.close(); return; }
      const tb = e.target.closest('[data-tab]');
      if (tb) { this.tab = tb.dataset.tab; this.renderRating(); return; }
      const tr = e.target.closest('tr[data-id]');
      if (tr) this.openInspect({ id: tr.dataset.id, hero: tr.dataset.hero || undefined });
    });
    if (this.scrollMe) { this.scrollMe = false; }
  }

  // ---------- просмотр персонажа ----------
  // C — свой персонаж: та же карточка, что у чужого «Персонаж», + дерево талантов рядом (self: { talentHtml, onTalent })
  openSelf(sid, self) { this.view = null; this.openInspect({ sid: String(sid) }, self); this.back = null; }
  isSelfOpen() { return !!this.self && this.view === 'inspect' && !!this.overlay.screen?.querySelector?.('.mc-charsheet'); }
  /** после изучения таланта: дерево — сразу, параметры — новым запросом (сервер ограничивает частоту) */
  refreshSelf() {
    if (!this.isSelfOpen()) return;
    const t = this.overlay.screen.querySelector('.mc-cs-tal'); if (t) t.innerHTML = this.self.talentHtml();
    clearTimeout(this.selfT); this.selfT = setTimeout(() => { if (this.isSelfOpen()) this.send({ type: 'inspect_player', ...this.inspQ }); }, 900);
  }
  openInspect(q, self = null) {
    this.self = self;
    this.back = ['rating', 'online', 'friends'].includes(this.view) ? this.view : null;
    this.view = 'inspect'; this.insp = null; this.inspErr = null; this.inspQ = q;
    this.send({ type: 'inspect_player', ...q });
    this.renderInspect();
  }
  // ответ сервера на role_set: обновить карточку и списки
  onRoleChanged(d) { if (this.insp && this.insp.id === d.id) { this.insp.role = d.role || undefined; if (this.view === 'inspect') this.renderInspect(); } }
  onInspect(d) { if (this.view === 'inspect') { this.insp = d; if (this.isSelfOpen()) { const c = this.overlay.screen.querySelector('.mc-cs-card'); if (c) { c.innerHTML = this.inspBody(); this.drawPv(c); return; } } this.renderInspect(); } }
  onInspectErr(d) { if (this.view === 'inspect') { this.inspErr = d.message; this.renderInspect(); } }

  renderInspect() {
    const body = this.inspBody();
    const html = this.self
      ? `<div class="mc-soc mc-insp mc-charsheet"><div class="mc-soc-head"><h2>🧍 МОЙ ПЕРСОНАЖ <small>C</small></h2><button class="mc-soc-x" title="Закрыть (Esc / C)">✕</button></div>
          <div class="mc-cs-cols"><div class="mc-cs-card">${body}</div><div class="mc-cs-tal">${this.self.talentHtml()}</div></div></div>`
      : `<div class="mc-soc mc-insp"><div class="mc-soc-head">${this.back ? '<button class="mc-soc-back" title="Назад">←</button>' : ''}<h2>👤 ПЕРСОНАЖ</h2><button class="mc-soc-x" title="Закрыть (Esc)">✕</button></div>${body}</div>`;
    this.overlay.showScreen(html, [], 'mc-social');
    this.drawPv(this.overlay.screen);
    this.bindInspect();
  }
  drawPv(root) { root?.querySelectorAll?.('canvas.mc-insp-pv').forEach((c) => drawHeroPreview(c, c.dataset.cls, Number(c.dataset.bk) / 100)); }
  inspBody() {
    const d = this.insp;
    let body;
    if (!d) body = `<div class="mc-soc-empty">${this.inspErr ? esc(this.inspErr) : 'Загрузка…'}</div>`;
    else if (!d.cls) body = '<div class="mc-soc-empty">Душа без оболочки — герой ещё не выбран</div>';
    else {
      const bySlot = Object.fromEntries(d.gear.map((g) => [g.slot, g]));
      const gear = SLOT_ORDER.map((s) => {
        const g = bySlot[s];
        if (!g) return `<div class="mc-insp-slot empty" tabindex="0"><div class="ic">·</div><span>${esc(SLOTS[s])}</span><div class="tip">${esc(SLOTS[s])}: пусто</div></div>`;
        const rar = RARITIES[g.rarity] || RARITIES.common;
        const st = Object.entries(g.stats || {}).filter(([, v]) => v);
        const stHtml = (g.stats?.dmgMin || g.stats?.dmgMax ? `${statIcon('dmgMin')}Урон: <b>${g.stats.dmgMin}–${g.stats.dmgMax}</b><br>` : '') + st.filter(([k]) => k !== 'dmgMin' && k !== 'dmgMax').map(([k, v]) => `${statIcon(k)}${STAT_RU[k] || esc(k)}: <b>+${v}</b>`).join('<br>');
        const cz = !!g.cursed, en = tierOf(g), rc = en ? enchText(en) : cz ? curseTint() : rar.color;
        const nm = lookName(g.name, cz, en);
        return `<div class="mc-insp-slot${lookCls(cz, en)}" tabindex="0" style="--rc:${rc};${lookStyle(en)}" title="${esc(nm)}${g.up ? ' +' + g.up : ''}">${en ? '<i class="mc-eg" aria-hidden="true"></i>' : ''}<div class="ic">${iconHtml(g, 40)}${upBadge(g.up, g.cursed)}</div><span>${esc(SLOTS[s])}</span>
          <div class="tip${cz ? ' cursed' : ''}${en ? ' ench' : ''}" style="${lookStyle(en)}"><b style="color:${rc}">${esc(nm)}</b>${upBadge(g.up, g.cursed, true)}<br><small>${cz ? '<b class="cz">☠ Проклятая</b> · ' : ''}${en ? enchBadge(en) + ' · ' : ''}${esc(rar.name)} · ур. ${g.req}</small>${g.blk ? `<br><b class="bk" style="color:#a78bfa">🌑 ${g.blk >= 100 ? 'Сломано очернением — не работает' : `Очернение −${+Number(g.blk).toFixed(1)}%`}</b>` : ''}<br>${stHtml || '—'}</div></div>`;
      }).join('');
      const s = d.stats;
      const P = (k, v) => `<div class="mc-insp-st"><span>${k}</span><b>${v}</b></div>`;
      const stats = [
        P('❤️ Здоровье', s.maxHp), P('🛡️ Броня', `${s.armor} <small>(−${Math.round(s.dr * 100)}% урона)</small>`), P('⚔️ Урон оружия', `${s.wMin}–${s.wMax}`), P('💥 Урон', `+${s.dmgPct}%`),
        P('🎯 Крит', `${s.critPct}%`), P('⚡ Скорость атаки', `+${s.atkSpeedPct}%`), P('👟 Скорость', `${s.speedPct >= 0 ? '+' : ''}${s.speedPct}%`), P('💧 Регенерация', `${s.regen}/с`),
        P('🩸 Вампиризм', `${s.lifestealPct}%`), P('⏱️ Перезарядка', `−${s.cdrPct}%`), P('🧲 Радиус сбора', `+${s.magnetPct}%`),
        ...((s.armorPen || s.armorPenPct) ? [P('🗡️ Пробитие брони', [s.armorPen ? `${s.armorPen}` : '', s.armorPenPct ? `${s.armorPenPct}%` : ''].filter(Boolean).join(' + '))] : []),
      ].join('');
      // очернение (Чёрный маг): общий % по надетому (как считает сервер) и сила, ушедшая «в тень» (статы вещей × очернение%) — без объяснений
      const bl = d.blk, sh = Object.entries(bl?.shadow || {}).filter(([, v]) => v);
      const shTxt = (sh.some(([k]) => k === 'dmgMin' || k === 'dmgMax') ? [`${statIcon('dmgMin')}${bl.shadow.dmgMin || 0}–${bl.shadow.dmgMax || 0}`] : [])
        .concat(sh.filter(([k]) => k !== 'dmgMin' && k !== 'dmgMax').map(([k, v]) => `<span title="${esc(STAT_RU[k] || k)}">${statIcon(k)}+${v}</span>`)).join(' · ');
      const blkRows = bl && bl.avg > 0 ? P('🌑 Очернение снаряжения', `${+Number(bl.avg).toFixed(1)}%`) + (shTxt ? `<div class="mc-insp-st mc-insp-blk" style="grid-column:1/-1" title="Очернённая сила надетых вещей"><span>🌑 Ушло в тень</span><b style="color:#c4b5fd">${shTxt}</b></div>` : '') : '';
      const abil = d.abilities.length ? d.abilities.map((a) => {
        const def = ABILITY_BY_ID[a.id] || { name: a.id, desc: '' };
        const props = radianceProps(a.id, a.rad).map((p) => RADIANCE_PROPS[p]?.name).filter(Boolean);
        return `<div class="mc-insp-ab" tabindex="0" style="--rc:${radColor(a.rad)}">${skillIcon(a.id, 40)}<div><b>${esc(def.name)}</b><small>Сияние ${a.rad}${props.length ? ' · ' + esc(props.join(', ')) : ''} · сила ×${a.power} · кд ${a.cd} с</small></div>
          <div class="tip">${esc(def.desc || '')}</div></div>`;
      }).join('') : '<div class="mc-soc-empty">Навыки не выбраны</div>';
      body = `<div class="mc-insp-top"><div class="mc-insp-who">${avatarHtml(d.cls, d.bk, 128, 'big')}${avatarHtml(d.cls, d.bk, 64, 'small')}<canvas class="mc-insp-pv" width="72" height="90" data-cls="${esc(d.cls)}" data-bk="${Math.max(0, Math.min(100, d.bk | 0))}" title="${d.bk ? 'Очернение героя' : esc(heroLabel(d.cls))}"></canvas><div><div class="mc-insp-name">${roleTag(d.role)}${esc(d.name)}</div><div class="mc-insp-cls">${esc(heroLabel(d.cls))} · <b>ур. ${d.lvl}</b></div></div></div>
          <div class="mc-insp-recs">${d.maxDmg ? `<div class="mc-insp-rec">Рекорд удара<br><b>${d.maxDmg.v}</b><small>${esc(whereLabel(d.maxDmg.where))}</small></div>` : ''}
          ${d.duel ? `<div class="mc-insp-rec duel">Дуэли<br><b>${d.duel.w}–${d.duel.l}</b><small>победы–поражения${d.duel.d ? ` · ничьи ${d.duel.d}` : ''}</small></div>` : ''}</div></div>
        ${d.sid && this.canDuel?.(d.sid) ? '<button class="mc-btn mc-insp-duel">⚔️ Вызвать на дуэль</button>' : ''}
        <div class="mc-insp-h">Снаряжение</div><div class="mc-insp-gear">${gear}</div>
        <div class="mc-insp-h">Параметры</div><div class="mc-insp-stats">${stats}${blkRows}</div>
        <div class="mc-insp-h">Навыки</div><div class="mc-insp-abs">${abil}</div>`;
    }
    // только серверно проверенный админ получает canMod; сервер всё равно проверяет права на role_set
    if (d?.canMod) body = `<div class="mc-insp-mod">${d.role === 'moderator' ? '<button class="mc-btn sm mc-modbtn off" data-on="0">Снять</button>' : '<button class="mc-btn sm gold mc-modbtn" data-on="1">Выдать модерку</button>'}</div>` + body;
    return body;
  }
  bindInspect() {
    const el = this.overlay.screen;
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      if (e.target.closest('.mc-soc-x')) { this.close(); return; }
      if (e.target.closest('.mc-soc-back')) { const b = this.back; if (b === 'online') this.openOnline(); else if (b === 'friends') this.openFriends(); else { this.view = 'rating'; this.renderRating(); } return; }
      const mb = e.target.closest('.mc-modbtn');
      if (mb && this.insp?.id) { mb.disabled = true; this.send({ type: 'role_set', id: this.insp.id, moderator: mb.dataset.on === '1' }); return; }
      const tb = e.target.closest('[data-act="talent"]');
      if (tb && this.self) { this.self.onTalent(tb.dataset.v); return; }
      if (e.target.closest('.mc-insp-duel')) { const sid = this.insp?.sid; this.close(); if (sid) this.onDuel?.(sid); return; }
      const sl = e.target.closest('.mc-insp-slot, .mc-insp-ab');
      el.querySelectorAll('.mc-insp-slot.sel, .mc-insp-ab.sel').forEach((x) => { if (x !== sl) x.classList.remove('sel'); });
      if (sl) sl.classList.toggle('sel'); // касание на телефоне показывает подсказку
    });
  }

  // ---------- онлайн / друзья / настройки ----------
  onOnline(d) { this.online = d; this.onCount?.(d.n); if (this.view === 'online') this.renderOnline(); }
  onFriends(d) { this.friends = d; if (d.settings) this.settings = d.settings; this.onCount?.(this.online?.n, (d.incoming || []).length); if (this.view === 'friends') this.renderFriends(); if (this.view === 'settings') this.renderSettings(); }
  onSettings(d) { this.settings = d.settings; if (this.view === 'settings') this.renderSettings(); }

  openOnline() { this.back = null; this.view = 'online'; this.send({ type: 'online_get' }); this.renderOnline(); }
  openFriends(tab) { this.back = null; this.view = 'friends'; if (tab) this.ftab = tab; this.send({ type: 'friends_get' }); this.renderFriends(); }
  openSettings() { this.back = null; this.view = 'settings'; this.send({ type: 'friends_get' }); this.renderSettings(); }

  socTabs(cur) {
    const inc = (this.friends?.incoming || []).length;
    return `<div class="mc-soc-tabs"><button data-view="online" class="${cur === 'online' ? 'on' : ''}">🟢 Онлайн${this.online ? ` (${this.online.n})` : ''}</button><button data-view="friends" class="${cur === 'friends' ? 'on' : ''}">🤝 Друзья${inc ? ` <i class="mc-soc-badge">${inc}</i>` : ''}</button><button data-view="settings" class="${cur === 'settings' ? 'on' : ''}">⚙️ Настройки</button></div>`;
  }
  playerRow(p, acts) {
    const where = p.world ? (WORLD_RU[p.world] || (p.world === 'arena' ? 'Арена' : p.world)) : (p.online ? 'в сети' : 'не в сети');
    return `<div class="mc-soc-pl ${p.me ? 'me' : ''}" data-id="${esc(p.id)}" data-sid="${esc(p.sid || '')}"><span class="dot ${p.online === false ? 'off' : ''}"></span>
      <div class="who"><b>${roleTag(p.role)}${esc(p.name)}</b>${p.me ? ' <i>(вы)</i>' : ''}${p.friend ? ' <span class="fr" title="Друг">🤝</span>' : ''}<small>${esc(heroLabel(p.cls))}${p.lvl ? ` · ур. ${p.lvl}` : ''} · ${esc(where)}${p.busy ? ' · занят' : ''}</small></div>
      <div class="acts">${acts}</div></div>`;
  }
  bindSoc(el) {
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      if (e.target.closest('.mc-soc-x')) { this.close(); return; }
      const v = e.target.closest('[data-view]');
      if (v) { const k = v.dataset.view; if (k === 'online') this.openOnline(); else if (k === 'friends') this.openFriends(); else this.openSettings(); return; }
      const ft = e.target.closest('[data-ftab]');
      if (ft) { this.ftab = ft.dataset.ftab; this.renderFriends(); return; }
      const b = e.target.closest('button[data-act]');
      if (!b) return;
      const row = b.closest('.mc-soc-pl');
      const id = row?.dataset.id, sid = row?.dataset.sid;
      const act = b.dataset.act;
      if (act === 'view') { const back = this.view; this.openInspect(sid ? { sid } : { id }); this.back = back; }
      else if (act === 'add') { this.send(sid ? { type: 'friend_add', sid } : { type: 'friend_add', id }); b.disabled = true; b.textContent = '✓ Заявка'; }
      else if (act === 'duel') { if (sid) { this.close(); this.onDuel?.(sid); } }
      else if (act === 'pinv') { if (sid) this.onParty?.(sid); }
      else if (act === 'acc') this.send({ type: 'friend_respond', id, accept: true });
      else if (act === 'dec') this.send({ type: 'friend_respond', id, accept: false });
      else if (act === 'cancel') this.send({ type: 'friend_cancel', id });
      else if (act === 'del') { if (b.dataset.sure) this.send({ type: 'friend_remove', id }); else { b.dataset.sure = '1'; b.textContent = 'Точно удалить?'; } }
      else if (act === 'duelset') this.send({ type: 'settings_set', duel: b.dataset.v });
      else if (act === 'freq') this.send({ type: 'settings_set', freq: !this.settings?.freq });
      else if (act === 'dnd') this.send({ type: 'settings_set', dnd: !(this.settings?.dnd > 0) });
      else if (act === 'sound') { setSound(!soundOn()); this.renderSettings(); }
      else if (act === 'uitheme') { setUiPref(b.dataset.v); this.renderSettings(); } // только это устройство, применяется сразу
    });
  }
  renderOnline() {
    const d = this.online;
    const body = !d ? '<div class="mc-soc-empty">Загрузка…</div>' : !d.list.length ? '<div class="mc-soc-empty">Никого нет в сети</div>'
      : `<div class="mc-soc-scroll mc-soc-list">${d.list.map((p) => this.playerRow(p, p.me ? '' : `<button class="mc-btn sm" data-act="view">👤 Посмотреть</button>${p.friend ? '' : '<button class="mc-btn sm" data-act="add">🤝 В друзья</button>'}<button class="mc-btn sm gold" data-act="duel" ${p.busy ? 'disabled' : ''}>⚔️ На дуэль</button>${this.canParty(p.sid) ? '<button class="mc-btn sm" data-act="pinv">👥 В отряд</button>' : ''}`)).join('')}</div>`;
    this.overlay.showScreen(`<div class="mc-soc mc-soc-people"><div class="mc-soc-head"><h2>👥 ИГРОКИ</h2><button class="mc-soc-x" title="Закрыть (Esc)">✕</button></div>${this.socTabs('online')}
      <div class="mc-soc-note">Все, кто сейчас в игре${d ? ` · ${d.n}` : ''}. Дуэль — если вы оба в открытом мире (Поляна/Аринар).</div>${body}</div>`, [], 'mc-social');
    this.bindSoc(this.overlay.screen);
  }
  renderFriends() {
    const d = this.friends, t = this.ftab || 'list';
    let body = '<div class="mc-soc-empty">Загрузка…</div>';
    if (d) {
      if (t === 'list') body = d.friends.length ? d.friends.map((p) => this.playerRow(p, `<button class="mc-btn sm" data-act="view">👤 Посмотреть</button>${p.online ? '<button class="mc-btn sm gold" data-act="duel">⚔️ На дуэль</button>' : ''}<button class="mc-btn sm danger" data-act="del">✕</button>`)).join('')
        : '<div class="mc-soc-empty">Друзей пока нет — откройте «Онлайн» и нажмите «🤝 В друзья»</div>';
      else body = (d.incoming.length ? `<div class="mc-insp-h">Входящие</div>${d.incoming.map((p) => this.playerRow(p, '<button class="mc-btn sm gold" data-act="acc">Принять</button><button class="mc-btn sm" data-act="dec">Отклонить</button>')).join('')}` : '<div class="mc-soc-empty">Входящих заявок нет</div>')
        + (d.outgoing.length ? `<div class="mc-insp-h">Отправленные</div>${d.outgoing.map((p) => this.playerRow(p, '<button class="mc-btn sm" data-act="cancel">Отозвать</button>')).join('')}` : '');
    }
    const inc = (d?.incoming || []).length;
    this.overlay.showScreen(`<div class="mc-soc mc-soc-people"><div class="mc-soc-head"><h2>🤝 ДРУЗЬЯ</h2><button class="mc-soc-x" title="Закрыть (Esc)">✕</button></div>${this.socTabs('friends')}
      <div class="mc-soc-tabs sub"><button data-ftab="list" class="${t === 'list' ? 'on' : ''}">Список${d ? ` (${d.friends.length})` : ''}</button><button data-ftab="req" class="${t === 'req' ? 'on' : ''}">Заявки${inc ? ` <i class="mc-soc-badge">${inc}</i>` : ''}</button></div>
      <div class="mc-soc-scroll mc-soc-list">${body}</div></div>`, [], 'mc-social');
    this.bindSoc(this.overlay.screen);
  }
  renderSettings() {
    const st = this.settings || { duel: 'all', freq: true, dnd: 0 };
    const opt = (v, t) => `<button class="mc-btn sm ${st.duel === v ? 'gold' : ''}" data-act="duelset" data-v="${v}">${t}</button>`;
    const dndMin = st.dnd > 0 ? Math.ceil(st.dnd / 60000) : 0;
    this.overlay.showScreen(`<div class="mc-soc mc-soc-people"><div class="mc-soc-head"><h2>⚙️ НАСТРОЙКИ</h2><button class="mc-soc-x" title="Закрыть (Esc)">✕</button></div>${this.socTabs('settings')}
      <div class="mc-set"><div class="mc-set-row"><span>🖥 Интерфейс</span><div class="grp"><button class="mc-btn sm ${uiPref() === 'new' && UI_SKIN.on ? 'gold' : ''}" data-act="uitheme" data-v="new"${UI_SKIN.on ? '' : ' disabled title="Новый интерфейс сейчас выключен администратором"'}>Новый</button><button class="mc-btn sm ${uiPref() === 'old' || !UI_SKIN.on ? 'gold' : ''}" data-act="uitheme" data-v="old">Старый</button></div></div>
      <div class="mc-set-row"><span>🔊 Звук</span><button class="mc-btn sm ${soundOn() ? 'gold' : ''}" data-act="sound">${soundOn() ? 'Включён' : 'Выключен'}</button></div>
      <div class="mc-set-row"><span>🌑 Мрачность</span><div class="grp"><input type="range" min="0" max="100" step="5" value="${grimGet('grim')}" data-grim="grim"><b class="mc-grim-v" data-grimv="grim">${grimGet('grim')}%</b></div></div>
      <div class="mc-set-row"><span>🌫 Дымка вдали</span><div class="grp"><input type="range" min="0" max="100" step="5" value="${grimGet('fog')}" data-grim="fog"><b class="mc-grim-v" data-grimv="fog">${grimGet('fog')}%</b></div></div>
      <div class="mc-set-row"><span>🎨 Единый стиль</span><div class="grp"><input type="range" min="0" max="100" step="5" value="${grimGet('style')}" data-grim="style"><b class="mc-grim-v" data-grimv="style">${grimGet('style')}%</b></div></div>
      <div class="mc-set-row"><span>🖼 Картинка</span><button class="mc-btn sm" data-act="grimreset">Сбросить к стандартным</button></div>
      <div class="mc-set-row"><span>⚔️ Вызовы на дуэль</span><div class="grp">${opt('all', 'От всех')}${opt('friends', 'Только друзья')}${opt('none', 'Никто')}</div></div>
      <div class="mc-set-row"><span>🤝 Заявки в друзья</span><button class="mc-btn sm ${st.freq ? 'gold' : ''}" data-act="freq">${st.freq ? 'Принимать' : 'Не принимать'}</button></div>
      <div class="mc-set-row"><span>🌙 Не беспокоить (5 минут)</span><button class="mc-btn sm ${dndMin ? 'gold' : ''}" data-act="dnd">${dndMin ? `Включено · ещё ${dndMin} мин` : 'Выключено'}</button></div>
      <p class="mc-dim">Настройки дуэлей и «Не беспокоить» — для всего аккаунта (всех героев) и проверяются сервером. Звук и картинка (мрачность, дымка, единый стиль) — на этом устройстве, у каждого игрока свои.</p></div></div>`, [], 'mc-social');
    this.bindSoc(this.overlay.screen);
    // картинка — на этом устройстве (localStorage), у каждого игрока своя; 0 = эффект выключен
    this.overlay.screen.querySelectorAll('[data-grim]').forEach((r) => r.addEventListener('input', () => { grimSet(r.dataset.grim, Number(r.value)); const v = this.overlay.screen.querySelector(`[data-grimv="${r.dataset.grim}"]`); if (v) v.textContent = `${r.value}%`; }));
    this.overlay.screen.querySelector('[data-act="grimreset"]')?.addEventListener('click', (e) => { e.stopPropagation(); grimReset(); this.renderSettings(); });
  }

  close() { this.view = null; this.self = null; this.overlay.hideScreen(); }
}

// звук: настройка устройства (localStorage); глушит все медиа-элементы страницы и доступна как window.MC_SOUND
export function soundOn() { try { return localStorage.getItem('mc-sound') !== '0'; } catch (_) { return true; } }
export function setSound(on) {
  try { localStorage.setItem('mc-sound', on ? '1' : '0'); } catch (_) {}
  window.MC_SOUND = !!on;
  document.querySelectorAll('audio, video').forEach((m) => { m.muted = !on; });
}
