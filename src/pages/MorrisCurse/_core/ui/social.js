// Рейтинг игроков (топ-100 по уровню / по рекорду урона) и просмотр персонажа (только чтение).
// Все данные — от сервера (rating / inspect); клиент ничего не считает и не хранит.
import { ABILITY_BY_ID, RADIANCE_PROPS, radianceProps, RARITIES, SLOTS, SLOT_ORDER, MOB_INFO } from '../../../../../server/meta/shared.ts';
import { displayClassName } from '../survivors/data.js';
import { iconHtml } from '../meta/itemCards.js';
import { skillIcon, radColor } from './actionBar.js';
import { esc } from './overlay.js';

const WORLD_RU = { hellfire: 'Поляна', arinar: 'Аринар' };
const STAT_RU = { dmgMin: 'Урон (мин)', dmgMax: 'Урон (макс)', hp: 'Здоровье', armor: 'Броня', critPct: 'Крит, %', speedPct: 'Скорость, %', regen: 'Регенерация/с',
  cdrPct: 'Перезарядка −%', magnetPct: 'Радиус сбора, %', lifestealPct: 'Вампиризм, %', atkSpeedPct: 'Скорость атаки, %', dmgPct: 'Урон, %' };
const heroLabel = (cls) => (cls ? displayClassName(cls, '—') : 'Душа');
export function whereLabel(w) {
  const [world, mob] = String(w || '').split(':');
  if (!world) return '—';
  return `${WORLD_RU[world] || world}${mob ? ' · ' + (MOB_INFO[mob]?.name || mob) : ''}`;
}
const fmtDate = (t) => { if (!t) return ''; const d = new Date(t); return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}`; };

export class Social {
  constructor({ overlay, send }) {
    this.overlay = overlay; this.send = send;
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
    const row = (r) => t === 'level'
      ? `<tr class="${r.me ? 'me' : ''}" data-id="${esc(r.id)}" data-hero="${esc(r.hero || '')}"><td class="n">${r.r}</td><td class="nm">${esc(r.name)}${r.me ? ' <i>(вы)</i>' : ''}</td><td>${esc(heroLabel(r.hero))}</td><td class="v">${r.lvl}</td></tr>`
      : `<tr class="${r.me ? 'me' : ''}" data-id="${esc(r.id)}" data-hero="${esc(r.hero || '')}"><td class="n">${r.r}</td><td class="nm">${esc(r.name)}${r.me ? ' <i>(вы)</i>' : ''}</td><td>${esc(heroLabel(r.hero))}</td><td class="v">${r.v}</td><td class="w">${esc(whereLabel(r.where))}<small>${fmtDate(r.at)}</small></td></tr>`;
    const head = t === 'level' ? '<tr><th>#</th><th>Игрок</th><th>Герой</th><th>Ур.</th></tr>' : '<tr><th>#</th><th>Игрок</th><th>Герой</th><th>Удар</th><th>Где</th></tr>';
    let body = '';
    if (!d) body = `<div class="mc-soc-empty">${this.err ? esc(this.err) : 'Загрузка рейтинга…'}</div>`;
    else if (!L.top.length) body = `<div class="mc-soc-empty">${t === 'dmg' ? 'Рекордов ещё нет — бейте монстров на Поляне и в Аринаре' : 'Пока пусто'}</div>`;
    else {
      const meOut = L.me && L.me.r > L.top.length;
      body = `<div class="mc-soc-scroll"><table class="mc-soc-tbl ${t}"><thead>${head}</thead><tbody>${L.top.map(row).join('')}</tbody></table></div>`
        + `<div class="mc-soc-mine">${L.me ? (meOut ? `<table class="mc-soc-tbl ${t}"><tbody>${row(L.me)}</tbody></table>` : `Ваше место: <b>${L.me.r}</b>`) : (t === 'dmg' ? 'У вас ещё нет рекорда урона' : 'Вас пока нет в рейтинге')}</div>`;
    }
    const note = t === 'dmg' ? 'Самый сильный одиночный удар по монстру в открытом мире (считает сервер; забеги не учитываются).' : 'Лучший герой игрока: уровень, при равенстве — опыт.';
    const html = `<div class="mc-soc"><div class="mc-soc-head"><h2>🏆 РЕЙТИНГ</h2><button class="mc-soc-x" title="Закрыть (Esc)">✕</button></div>
      <div class="mc-soc-tabs"><button data-tab="level" class="${t === 'level' ? 'on' : ''}">По уровню</button><button data-tab="dmg" class="${t === 'dmg' ? 'on' : ''}">Рекорд урона</button></div>
      <div class="mc-soc-note">${note}${d ? ` · всего: ${d.total[t]}` : ''}</div>${body}</div>`;
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
  openInspect(q) {
    this.back = this.view === 'rating' ? 'rating' : null;
    this.view = 'inspect'; this.insp = null; this.inspErr = null; this.inspQ = q;
    this.send({ type: 'inspect_player', ...q });
    this.renderInspect();
  }
  onInspect(d) { if (this.view === 'inspect') { this.insp = d; this.renderInspect(); } }
  onInspectErr(d) { if (this.view === 'inspect') { this.inspErr = d.message; this.renderInspect(); } }

  renderInspect() {
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
        const stHtml = (g.stats?.dmgMin || g.stats?.dmgMax ? `Урон: <b>${g.stats.dmgMin}–${g.stats.dmgMax}</b><br>` : '') + st.filter(([k]) => k !== 'dmgMin' && k !== 'dmgMax').map(([k, v]) => `${STAT_RU[k] || esc(k)}: <b>+${v}</b>`).join('<br>');
        return `<div class="mc-insp-slot" tabindex="0" style="--rc:${rar.color}"><div class="ic">${iconHtml(g, 40)}</div><span>${esc(SLOTS[s])}</span>
          <div class="tip"><b style="color:${rar.color}">${esc(g.name)}</b><br><small>${esc(rar.name)} · ур. ${g.req}</small><br>${stHtml || '—'}</div></div>`;
      }).join('');
      const s = d.stats;
      const P = (k, v) => `<div class="mc-insp-st"><span>${k}</span><b>${v}</b></div>`;
      const stats = [
        P('❤️ Здоровье', s.maxHp), P('🛡️ Броня', `${s.armor} <small>(−${Math.round(s.dr * 100)}% урона)</small>`), P('⚔️ Урон оружия', `${s.wMin}–${s.wMax}`), P('💥 Урон', `+${s.dmgPct}%`),
        P('🎯 Крит', `${s.critPct}%`), P('⚡ Скорость атаки', `+${s.atkSpeedPct}%`), P('👟 Скорость', `${s.speedPct >= 0 ? '+' : ''}${s.speedPct}%`), P('💧 Регенерация', `${s.regen}/с`),
        P('🩸 Вампиризм', `${s.lifestealPct}%`), P('⏱️ Перезарядка', `−${s.cdrPct}%`), P('🧲 Радиус сбора', `+${s.magnetPct}%`),
      ].join('');
      const abil = d.abilities.length ? d.abilities.map((a) => {
        const def = ABILITY_BY_ID[a.id] || { name: a.id, desc: '' };
        const props = radianceProps(a.id, a.rad).map((p) => RADIANCE_PROPS[p]?.name).filter(Boolean);
        return `<div class="mc-insp-ab" tabindex="0" style="--rc:${radColor(a.rad)}">${skillIcon(a.id, 40)}<div><b>${esc(def.name)}</b><small>Сияние ${a.rad}${props.length ? ' · ' + esc(props.join(', ')) : ''} · сила ×${a.power} · кд ${a.cd} с</small></div>
          <div class="tip">${esc(def.desc || '')}</div></div>`;
      }).join('') : '<div class="mc-soc-empty">Навыки не выбраны</div>';
      body = `<div class="mc-insp-top"><div><div class="mc-insp-name">${esc(d.name)}</div><div class="mc-insp-cls">${esc(heroLabel(d.cls))} · <b>ур. ${d.lvl}</b></div></div>
          ${d.maxDmg ? `<div class="mc-insp-rec">Рекорд удара<br><b>${d.maxDmg.v}</b><small>${esc(whereLabel(d.maxDmg.where))}</small></div>` : ''}</div>
        <div class="mc-insp-h">Снаряжение</div><div class="mc-insp-gear">${gear}</div>
        <div class="mc-insp-h">Параметры</div><div class="mc-insp-stats">${stats}</div>
        <div class="mc-insp-h">Навыки</div><div class="mc-insp-abs">${abil}</div>`;
    }
    const html = `<div class="mc-soc mc-insp"><div class="mc-soc-head">${this.back ? '<button class="mc-soc-back" title="Назад к рейтингу">←</button>' : ''}<h2>👤 ПЕРСОНАЖ</h2><button class="mc-soc-x" title="Закрыть (Esc)">✕</button></div>${body}</div>`;
    this.overlay.showScreen(html, [], 'mc-social');
    const el = this.overlay.screen;
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      if (e.target.closest('.mc-soc-x')) { this.close(); return; }
      if (e.target.closest('.mc-soc-back')) { this.view = 'rating'; this.renderRating(); return; }
      const sl = e.target.closest('.mc-insp-slot, .mc-insp-ab');
      el.querySelectorAll('.mc-insp-slot.sel, .mc-insp-ab.sel').forEach((x) => { if (x !== sl) x.classList.remove('sel'); });
      if (sl) sl.classList.toggle('sel'); // касание на телефоне показывает подсказку
    });
  }

  close() { this.view = null; this.overlay.hideScreen(); }
}
