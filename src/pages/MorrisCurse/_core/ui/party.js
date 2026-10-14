// Отряд (до 4): рамки участников (ОЗ, уровень, лидер), приглашение — игровое окно (принять/отклонить),
// «лидер открыл забег» — войти без похода к порталу. Всё решает сервер (party_*); клиент только показывает.
import { esc } from './overlay.js';

export class PartyUI {
  constructor({ overlay, send, myId, onJoinRun }) {
    this.send = send; this.myId = myId; this.onJoinRun = onJoinRun;
    this.state = null; // { id, leader, max, members:[{sid,name,cls,lvl,hp,maxHp,world,x,y,run,online}] }
    const el = document.createElement('div'); el.className = 'mc-party'; el.style.display = 'none';
    el.addEventListener('pointerdown', (e) => e.stopPropagation());
    el.addEventListener('click', (e) => this.onClick(e));
    overlay.layer.appendChild(el); this.el = el;
    const ask = document.createElement('div'); ask.className = 'mc-party-ask'; ask.style.display = 'none';
    ask.addEventListener('pointerdown', (e) => e.stopPropagation());
    ask.addEventListener('click', (e) => this.onAsk(e));
    overlay.layer.appendChild(ask); this.askEl = ask;
  }
  has(sid) { return !!this.state?.members?.some((m) => m.sid === sid); }
  isLeader() { return this.state?.leader === this.myId(); }
  full() { return (this.state?.members?.length || 0) >= (this.state?.max || 4); }
  canInvite(sid) { return !this.has(sid) && (!this.state || (this.isLeader() && !this.full())); }
  invite(sid) { this.send({ type: 'party_invite', sid: String(sid) }); }
  setState(d) { this.state = d && d.id ? d : null; this.render(); }
  others() { return (this.state?.members || []).filter((m) => m.sid !== this.myId()); }
  render() {
    const s = this.state;
    if (!s) { this.el.style.display = 'none'; this.el.innerHTML = ''; return; }
    const me = this.myId(), lead = s.leader === me;
    this.el.innerHTML = `<div class="hd">👥 Отряд ${s.members.length}/${s.max}<button class="mc-btn sm" data-p="leave" title="Выйти из отряда">выйти</button></div>` + s.members.map((m) => {
      const pct = m.maxHp ? Math.max(0, Math.min(100, (m.hp / m.maxHp) * 100)) : 0;
      return `<div class="pm ${m.sid === me ? 'me' : ''} ${m.online ? '' : 'off'}"><div class="nm">${m.sid === s.leader ? '👑 ' : ''}${esc(m.name)} <small>ур. ${m.lvl || '?'}${m.run ? ' · в забеге' : m.world === 'arinar' ? ' · Аринар' : ' · Поляна'}</small>${lead && m.sid !== me ? `<button class="x" data-p="kick" data-s="${esc(m.sid)}" title="Исключить">✕</button><button class="x" data-p="promote" data-s="${esc(m.sid)}" title="Сделать лидером">👑</button>` : ''}</div><div class="hp"><i style="width:${pct}%"></i><span>${m.hp}/${m.maxHp}</span></div></div>`;
    }).join('');
    this.el.style.display = '';
  }
  onClick(e) {
    const b = e.target.closest('[data-p]'); if (!b) return; e.stopPropagation();
    const a = b.dataset.p;
    if (a === 'leave') this.send({ type: 'party_leave' });
    else if (a === 'kick') this.send({ type: 'party_kick', sid: b.dataset.s });
    else if (a === 'promote') this.send({ type: 'party_promote', sid: b.dataset.s });
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
