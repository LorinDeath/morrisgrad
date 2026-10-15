// Отряд (до 4): рамки участников (ОЗ, уровень, лидер), приглашение — игровое окно (принять/отклонить),
// «лидер открыл забег» — войти без похода к порталу. Всё решает сервер (party_*); клиент только показывает.
// Панель видна и без отряда (на Поляне/в Аринаре): «＋ Пригласить» — список игроков рядом; меню игрока — клик/ПКМ по нему.
import { esc } from './overlay.js';

export class PartyUI {
  constructor({ overlay, send, myId, onJoinRun, nearby, clsName, onInspect, onDuel }) {
    this.send = send; this.myId = myId; this.onJoinRun = onJoinRun;
    this.nearby = nearby || (() => []); this.clsName = clsName || ((c) => c || ''); this.onInspect = onInspect; this.onDuel = onDuel;
    this.inHub = false; this.pickOpen = false;
    this.state = null; // { id, leader, max, members:[{sid,name,cls,lvl,hp,maxHp,world,x,y,run,online}] }
    const el = document.createElement('div'); el.className = 'mc-party'; el.style.display = 'none';
    el.addEventListener('pointerdown', (e) => e.stopPropagation());
    el.addEventListener('click', (e) => this.onClick(e));
    overlay.layer.appendChild(el); this.el = el;
    const ask = document.createElement('div'); ask.className = 'mc-party-ask'; ask.style.display = 'none';
    ask.addEventListener('pointerdown', (e) => e.stopPropagation());
    ask.addEventListener('click', (e) => this.onAsk(e));
    overlay.layer.appendChild(ask); this.askEl = ask;
    // меню игрока (клик / ПКМ по герою другого игрока)
    const menu = document.createElement('div'); menu.className = 'mc-pmenu'; menu.style.display = 'none';
    menu.addEventListener('pointerdown', (e) => e.stopPropagation());
    menu.addEventListener('click', (e) => this.onMenu(e));
    overlay.layer.appendChild(menu); this.menuEl = menu;
    document.addEventListener('pointerdown', (e) => { if (!menu.contains(e.target)) this.closeMenu(); });
  }
  /** видимость панели без отряда — только в мире (не в забеге/дуэли) */
  setHub(on) { on = !!on; if (on !== this.inHub) { this.inHub = on; if (!on) this.pickOpen = false; this.render(); } }
  has(sid) { return !!this.state?.members?.some((m) => m.sid === sid); }
  isLeader() { return this.state?.leader === this.myId(); }
  full() { return (this.state?.members?.length || 0) >= (this.state?.max || 4); }
  canInvite(sid) { return !this.has(sid) && (!this.state || (this.isLeader() && !this.full())); }
  invite(sid) { this.send({ type: 'party_invite', sid: String(sid) }); }
  setState(d) { this.state = d && d.id ? d : null; this.render(); }
  others() { return (this.state?.members || []).filter((m) => m.sid !== this.myId()); }
  render() {
    const s = this.state;
    const pick = this.pickOpen ? this.pickHtml() : '';
    if (!s) { // без отряда: короткая плашка с приглашением
      if (!this.inHub) { this.el.style.display = 'none'; this.html(''); return; }
      this.el.classList.add('solo');
      this.html(`<div class="hd">👥 Отряд <small>до 4</small><button class="mc-btn sm gold" data-p="pick" title="Пригласить игрока рядом (или клик/ПКМ по нему)">＋ Пригласить</button></div>${pick}`);
      this.el.style.display = ''; return;
    }
    this.el.classList.remove('solo');
    const me = this.myId(), lead = s.leader === me;
    this.html(`<div class="hd">👥 Отряд ${s.members.length}/${s.max}<span class="hb">${lead && !this.full() ? '<button class="mc-btn sm gold" data-p="pick" title="Пригласить">＋</button>' : ''}<button class="mc-btn sm" data-p="leave" title="Выйти из отряда">выйти</button></span></div>${pick}` + s.members.map((m) => {
      const pct = m.maxHp ? Math.max(0, Math.min(100, (m.hp / m.maxHp) * 100)) : 0;
      return `<div class="pm ${m.sid === me ? 'me' : ''} ${m.online ? '' : 'off'}"><div class="nm">${m.sid === s.leader ? '👑 ' : ''}${esc(m.name)} <small>${m.cls ? esc(this.clsName(m.cls)) + ' · ' : ''}ур. ${m.lvl || '?'}${m.run ? ' · в забеге' : m.world === 'arinar' ? ' · Аринар' : ' · Поляна'}</small>${lead && m.sid !== me ? `<button class="x" data-p="kick" data-s="${esc(m.sid)}" title="Исключить">✕</button><button class="x" data-p="promote" data-s="${esc(m.sid)}" title="Сделать лидером">👑</button>` : ''}</div><div class="hp"><i style="width:${pct}%"></i><span>${m.hp}/${m.maxHp}</span></div></div>`;
    }).join(''));
    this.el.style.display = '';
  }
  // перерисовка только при изменении — иначе кнопки пропадают из-под курсора при каждом обновлении ОЗ
  html(h) { if (h !== this.sig) { this.sig = h; this.el.innerHTML = h; } }
  onClick(e) {
    const b = e.target.closest('[data-p]'); if (!b) return; e.stopPropagation();
    const a = b.dataset.p;
    if (a === 'pick') { this.pickOpen = !this.pickOpen; this.render(); return; }
    if (a === 'inv') { this.invite(b.dataset.s); this.pickOpen = false; this.render(); return; }
    if (a === 'leave') this.send({ type: 'party_leave' });
    else if (a === 'kick') this.send({ type: 'party_kick', sid: b.dataset.s });
    else if (a === 'promote') this.send({ type: 'party_promote', sid: b.dataset.s });
  }
  pickHtml() {
    const list = this.nearby().filter((o) => this.canInvite(o.id)).slice(0, 8);
    return `<div class="pick">${list.length ? list.map((o) => `<button class="pi" data-p="inv" data-s="${esc(o.id)}">${esc(o.name)} <small>${esc(o.sub || '')}</small></button>`).join('') : '<div class="mc-dim">Рядом никого. Пригласить можно и из «👥 Онлайн».</div>'}</div>`;
  }
  // меню игрока у курсора: персонаж / дуэль / в отряд
  openMenu(t, x, y) {
    this.menuT = t;
    const inv = this.canInvite(t.id), ally = this.has(t.id);
    this.menuEl.innerHTML = `<div class="t">${esc(t.name)}</div>${t.sub ? `<div class="s">${esc(t.sub)}</div>` : ''}
      <button data-m="insp">👤 Персонаж</button>${t.canDuel && !ally ? '<button data-m="duel">⚔️ Вызвать на дуэль</button>' : ''}
      ${inv ? '<button data-m="inv" class="gold">👥 Пригласить в отряд</button>' : ally ? '<div class="s">✔ в вашем отряде</div>' : this.state && !this.isLeader() ? '<div class="s">приглашает лидер отряда</div>' : this.full() ? '<div class="s">отряд полон (4)</div>' : ''}`;
    const W = window.innerWidth, H = window.innerHeight;
    Object.assign(this.menuEl.style, { display: '', left: Math.min(x + 6, W - 200) + 'px', top: Math.min(y + 6, H - 150) + 'px' });
  }
  closeMenu() { if (this.menuEl.style.display !== 'none') this.menuEl.style.display = 'none'; this.menuT = null; }
  onMenu(e) {
    const b = e.target.closest('[data-m]'); if (!b || !this.menuT) return; e.stopPropagation();
    const t = this.menuT, m = b.dataset.m; this.closeMenu();
    if (m === 'inv') this.invite(t.id); else if (m === 'duel') this.onDuel?.(t.id); else if (m === 'insp') this.onInspect?.(t.id);
  }
  // приглашение / вход в забег лидера — окно внутри игры
  showAsk(kind, d, text) {
    this.ask = { kind, d };
    this.askEl.innerHTML = `<div class="t">${text}</div><div class="b"><button class="mc-btn gold" data-a="yes">${kind === 'run' ? 'Войти' : 'Вступить'}</button><button class="mc-btn" data-a="no">${kind === 'run' ? 'Позже' : 'Отклонить'}</button></div>`;
    this.askEl.style.display = '';
    clearTimeout(this.askT); this.askT = setTimeout(() => { if (this.ask?.d === d) this.closeAsk(kind === 'invite' ? false : null); }, 55_000);
  }
  onInvite(d) { this.showAsk('invite', d, `👥 <b>${esc(d.name)}</b> приглашает в отряд`); }
  onRun(d) { this.showAsk('run', d, `👑 <b>${esc(d.leader)}</b> открыл(а) «${esc(d.room)}» — войти к отряду (без похода к порталу)?`); }
  onAsk(e) { const b = e.target.closest('[data-a]'); if (!b) return; e.stopPropagation(); this.closeAsk(b.dataset.a === 'yes'); }
  closeAsk(yes) {
    const a = this.ask; this.ask = null; this.askEl.style.display = 'none';
    if (!a) return;
    if (a.kind === 'invite' && yes !== null) this.send({ type: 'party_respond', from: a.d.from, accept: !!yes });
    if (a.kind === 'run' && yes) this.onJoinRun?.(a.d);
  }
}
