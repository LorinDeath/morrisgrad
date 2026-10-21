// Город Альказак и PK-режим — HUD (изолированный модуль; стили — styles/cityHud.css на токенах --ch-*,
// чтобы при слиянии с ui-cursed-rework менять только токены). Правила — только сервер (server/meta/city.ts):
//  • кнопка ⚔ PK у полоски ОЗ: pk_toggle → отсчёт (вход 7 с / выход 30 с без боя), повторное нажатие — отмена;
//  • плашка «купол не пускает» (city_deny) с обратным отсчётом; «вы в городе» (city_room/зона) — подсказка;
//  • тосты pvp_kill / pvp_death.
import './../styles/cityHud.css';

const fmt = (s) => { s = Math.max(0, Math.ceil(s)); return s >= 60 ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` : `${s} с`; };

export class CityHud {
  constructor(root, { send, toast }) {
    this.send = send; this.toast = toast; this.st = { pk: false, to: null, endAt: 0, on: true, killer: null, color: '#ef4444' };
    this.deny = null; this.world = '';
    const el = (this.el = document.createElement('div')); el.className = 'ch-root'; el.innerHTML = `
      <button type="button" class="ch-pk" aria-pressed="false" title="PK-режим: нападать на игроков (вне куполов). Купол города не пускает убийц."><span class="ch-pk-ic">⚔</span><span class="ch-pk-t">PK</span><span class="ch-pk-n"></span></button>
      <div class="ch-deny" role="status" hidden><b class="ch-deny-h">Купол Альказака не пускает</b><span class="ch-deny-m"></span><span class="ch-deny-n"></span></div>`;
    root.appendChild(el);
    this.btn = el.querySelector('.ch-pk'); this.denyEl = el.querySelector('.ch-deny');
    this.btn.addEventListener('click', (e) => { e.stopPropagation(); this.send({ type: 'pk_toggle' }); });
    this.btn.addEventListener('mousedown', (e) => e.stopPropagation());
    this.render();
  }
  /** мир сменился: кнопка — только в Аринаре */
  setWorld(w) { if (w === this.world) return; this.world = w; this.render(); }
  get pk() { return !!this.st.pk; }
  get color() { return this.st.color || '#ef4444'; }
  onPk(d) {
    const was = this.st;
    this.st = { pk: !!d.pk, to: d.to ?? null, endAt: d.to !== null && d.to !== undefined ? performance.now() + (d.left || 0) * 1000 : 0, dur: d.dur || 0, on: d.on !== false, killer: d.killer ? { ...d.killer, endAt: performance.now() + (d.killer.sec || 0) * 1000 } : null, color: d.color || '#ef4444' };
    if (was.to === null && this.st.to !== null) this.toast(this.st.to ? `⚔ PK-режим включится через ${fmt(d.left)} — без боя. Нажмите ещё раз — отмена.` : `PK-режим выключится через ${fmt(d.left)} — без боя.`, this.st.to ? '#fca5a5' : '#cbd5e1');
    else if (was.to !== null && this.st.to === null && was.pk === this.st.pk) this.toast('Отсчёт PK-режима отменён', '#94a3b8');
    this.render();
  }
  onDeny(d) { this.deny = { msg: d.message || 'Купол не пускает убийц', endAt: d.sec ? performance.now() + d.sec * 1000 : 0, hideAt: performance.now() + 4500 }; this.render(); }
  onKill(d) { this.toast(d.self ? `🛡 Самооборона: ${d.victim} повержен` : `⚔ Вы убили ${d.victim}${d.counted ? ' — купол Альказака вас пока не пустит' : ''}`, '#f87171'); }
  onDeath(d) { this.toast(`💀 Вас убил ${d.killer}`, '#fca5a5'); }
  tick() {
    const t = performance.now();
    if (this.st.to !== null) { const n = this.btn.querySelector('.ch-pk-n'); const s = Math.max(0, (this.st.endAt - t) / 1000); n.textContent = fmt(s); }
    if (this.deny) {
      if (t > this.deny.hideAt) { this.deny = null; this.render(); return; }
      this.denyEl.querySelector('.ch-deny-n').textContent = this.deny.endAt > t ? `ещё ${fmt((this.deny.endAt - t) / 1000)}` : '';
    }
  }
  render() {
    const s = this.st, b = this.btn, show = this.world === 'arinar' && (s.on || s.pk);
    this.el.classList.toggle('ch-hidden', !show);
    b.classList.toggle('ch-on', s.pk); b.classList.toggle('ch-wait', s.to !== null); b.classList.toggle('ch-off', !s.on && !s.pk);
    b.setAttribute('aria-pressed', s.pk ? 'true' : 'false');
    b.querySelector('.ch-pk-t').textContent = s.to !== null ? (s.to ? 'PK через' : 'Выход') : s.pk ? 'PK вкл' : 'PK';
    if (s.to === null) b.querySelector('.ch-pk-n').textContent = '';
    b.style.setProperty('--ch-pk', s.color || '#ef4444');
    this.denyEl.hidden = !this.deny; if (this.deny) this.denyEl.querySelector('.ch-deny-m').textContent = this.deny.msg;
  }
  debug() { return { pk: this.st.pk, to: this.st.to, deny: this.deny?.msg || null, shown: !this.el.classList.contains('ch-hidden'), label: this.btn.textContent.trim() }; }
}
