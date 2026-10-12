// PvP-дуэли: приглашение (принять/отказаться, 15 с), ожидание ответа, HUD боя на арене (полоски ОЗ обоих,
// таймер, отсчёт 3-2-1), экран результата «Победа / Поражение / Ничья». Всё состояние — от сервера (meta/pvp.ts);
// клиент только показывает и отправляет намерения (duel_challenge / duel_respond / duel_cancel / duel_leave).
import { displayClassName } from '../survivors/data.js';
import { esc } from './overlay.js';

const REASON_RU = { ko: 'нокаут', forfeit: 'сдача', disconnect: 'соперник покинул бой', timeout: 'время вышло (3 мин) — решил запас здоровья' };
const fmt = (ms) => { const s = Math.ceil(ms / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

export class DuelUI {
  constructor({ overlay, send }) {
    this.overlay = overlay; this.send = send;
    this.inv = null; this.pend = null; this.active = null; this.hud = null; this.lastPh = null;
  }
  get inArena() { return !!this.active; }
  oppSid() { return this.active?.opp?.sid || null; }

  card(cls, html) {
    const el = document.createElement('div');
    el.className = 'mc-duel-card ' + cls;
    el.innerHTML = html;
    el.addEventListener('pointerdown', (e) => e.stopPropagation());
    el.addEventListener('touchstart', (e) => { if (e.target.closest('button')) e.preventDefault(); }, { passive: false });
    this.overlay.layer.appendChild(el);
    return el;
  }
  bar(el, ms) { const b = el.querySelector('.mc-duel-time i'); if (b) { b.style.transition = 'none'; b.style.width = '100%'; void b.offsetWidth; b.style.transition = `width ${ms}ms linear`; b.style.width = '0%'; } }

  // ——— входящий вызов ———
  invite(d) {
    this.closeInvite();
    const el = this.card('inv', `<div class="t">⚔️ Вызов на дуэль</div>
      <div class="who"><b>${esc(d.name)}</b> · ${esc(displayClassName(d.cls, d.cls))} · ур. ${d.lvl}</div>
      <div class="sub">Бой один на один на закрытой арене. Без наград и без потерь.</div>
      <div class="mc-duel-time"><i></i></div>
      <div class="row"><button class="mc-btn gold ok">Принять</button><button class="mc-btn no">Отказаться</button></div>`);
    this.inv = { from: d.from, el, until: performance.now() + (d.ms || 15000) };
    this.bar(el, d.ms || 15000);
    el.querySelector('.ok').addEventListener('pointerdown', (e) => { e.preventDefault(); this.send({ type: 'duel_respond', from: d.from, accept: true }); this.closeInvite(); });
    el.querySelector('.no').addEventListener('pointerdown', (e) => { e.preventDefault(); this.send({ type: 'duel_respond', from: d.from, accept: false }); this.closeInvite(); });
    this.inv.timer = setTimeout(() => this.closeInvite(), (d.ms || 15000) + 300);
  }
  closeInvite(from) {
    if (!this.inv || (from && this.inv.from !== from)) return;
    clearTimeout(this.inv.timer); this.inv.el.remove(); this.inv = null;
  }

  // ——— исходящий вызов ———
  pending(d) {
    this.clearPending();
    const el = this.card('pend', `<div class="t">⚔️ Вызов отправлен</div><div class="who">Ждём ответа: <b>${esc(d.name)}</b></div>
      <div class="mc-duel-time"><i></i></div><div class="row"><button class="mc-btn no">Отменить</button></div>`);
    this.pend = { to: d.to, el };
    this.bar(el, d.ms || 15000);
    el.querySelector('.no').addEventListener('pointerdown', (e) => { e.preventDefault(); this.send({ type: 'duel_cancel' }); this.clearPending(); });
    this.pend.timer = setTimeout(() => this.clearPending(), (d.ms || 15000) + 1500);
  }
  clearPending() { if (!this.pend) return; clearTimeout(this.pend.timer); this.pend.el.remove(); this.pend = null; }

  // ——— бой ———
  start(d) {
    this.closeInvite(); this.clearPending(); this.removeHud();
    this.active = { id: d.id, me: d.me, opp: d.opp };
    this.lastPh = null;
    const el = document.createElement('div');
    el.className = 'mc-duel-hud';
    el.innerHTML = `<div class="bars">
        <div class="p me"><div class="nm">Вы</div><div class="hp"><i></i><span></span></div></div>
        <div class="mid"><div class="tm">3:00</div><div class="vs">VS</div></div>
        <div class="p op"><div class="nm">${esc(d.opp.name)} <small>${esc(displayClassName(d.opp.cls, d.opp.cls))} · ${d.opp.lvl}</small></div><div class="hp"><i></i><span></span></div></div>
      </div>
      <button class="mc-duel-leave" title="Сдаться (поражение)">🏳 Сдаться</button>`;
    el.addEventListener('pointerdown', (e) => { if (e.target.closest('button')) e.stopPropagation(); });
    el.querySelector('.mc-duel-leave').addEventListener('pointerdown', (e) => {
      e.preventDefault(); e.stopPropagation();
      const b = e.currentTarget;
      if (b.dataset.sure) { this.send({ type: 'duel_leave' }); return; }
      b.dataset.sure = '1'; b.textContent = 'Точно сдаться?';
      setTimeout(() => { if (b.isConnected) { delete b.dataset.sure; b.textContent = '🏳 Сдаться'; } }, 2500);
    });
    this.overlay.layer.appendChild(el);
    this.hud = el;
    this.cdEl = document.createElement('div'); // отсчёт — по центру экрана (вне HUD: у HUD transform)
    this.cdEl.className = 'mc-duel-cd';
    this.overlay.layer.appendChild(this.cdEl);
    this.overlay.layer.classList.add('mc-in-duel'); // на арене прячем трекер заданий и подсказки
    this.state({ ph: 'countdown', cd: d.countdown, left: d.dur, p: [] });
  }
  state(d) {
    if (!this.hud || !this.active || (d.id && d.id !== this.active.id)) return;
    const set = (sel, p) => {
      if (!p) return;
      const w = Math.max(0, Math.min(100, (p.hp / Math.max(1, p.maxHp)) * 100));
      const q = this.hud.querySelector(sel);
      q.querySelector('i').style.width = w + '%';
      q.querySelector('span').textContent = `${p.hp} / ${p.maxHp}`;
      q.classList.toggle('low', w < 30);
    };
    set('.p.me .hp', d.p.find((x) => x.sid === this.active.me));
    set('.p.op .hp', d.p.find((x) => x.sid === this.active.opp.sid));
    this.hud.querySelector('.tm').textContent = fmt(d.left);
    const cd = this.cdEl;
    if (d.ph === 'countdown') {
      const n = Math.max(1, Math.ceil(d.cd / 1000));
      if (cd.dataset.n !== String(n)) { cd.dataset.n = String(n); cd.textContent = String(n); cd.className = 'mc-duel-cd show'; void cd.offsetWidth; cd.classList.add('pop'); }
    } else if (d.ph === 'fight' && this.lastPh === 'countdown') {
      cd.dataset.n = 'go'; cd.textContent = 'БОЙ!'; cd.className = 'mc-duel-cd show go pop';
      setTimeout(() => { if (cd.dataset.n === 'go') cd.className = 'mc-duel-cd'; }, 900);
    }
    this.lastPh = d.ph;
  }
  removeHud() {
    if (this.hud) { this.hud.remove(); this.hud = null; }
    if (this.cdEl) { this.cdEl.remove(); this.cdEl = null; }
    this.overlay.layer.classList.remove('mc-in-duel');
  }

  end(d) {
    this.removeHud();
    this.active = null;
    const title = d.result === 'win' ? 'ПОБЕДА' : d.result === 'loss' ? 'ПОРАЖЕНИЕ' : 'НИЧЬЯ';
    const rec = d.record ? `<div class="rec">Ваш счёт дуэлей: <b>${d.record.w}</b> побед · <b>${d.record.l}</b> поражений${d.record.d ? ` · ${d.record.d} ничьих` : ''}</div>` : '';
    const html = `<div class="mc-duel-res ${d.result}">
      <div class="big">${title}</div>
      <div class="vs">против <b>${esc(d.opp || 'соперника')}</b> · ${esc(REASON_RU[d.reason] || d.reason || '')}</div>
      <div class="nums"><div><span>Нанесено</span><b>${d.dealt || 0}</b></div><div><span>Получено</span><b>${d.taken || 0}</b></div>
        <div><span>Ваше ОЗ</span><b>${d.hp ?? '—'}%</b></div><div><span>ОЗ соперника</span><b>${d.oppHp ?? '—'}%</b></div></div>
      ${rec}<div class="note">Без наград и без потерь. Вы в Аринаре, здоровье восстановлено.</div></div>`;
    this.overlay.showScreen(html, [{ text: 'В Аринар', cls: 'gold', onClick: () => this.overlay.hideScreen() }], 'mc-duel-screen');
  }
}
