// HUD забега, модалка выбора улучшения, экран итогов, баннер входа в комнату.
import { WEAPONS, PASSIVES, xpNeed, RUN_ROOMS, displayClassName } from '../survivors/data.js';
import { esc } from './overlay.js';

const fmtTime = (t) => {
  const s = Math.max(0, Math.floor(t));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
};
export { fmtTime };

const BEST_KEY = 'mc-run-best';

export class RunUI {
  constructor(overlay, { onChoice, onAbility, onRestart, onLeave, onGiveUp }) {
    this.ov = overlay;
    this.cb = { onChoice, onAbility, onRestart, onLeave, onGiveUp };
    const el = document.createElement('div');
    el.className = 'mc3d-run-hud';
    el.style.display = 'none';
    el.innerHTML = `
      <div class="mc3d-xp"><i></i><span>Ур. 1</span></div>
      <div class="mc3d-top"><span class="t">00:00</span><span class="k">☠ 0</span><span class="nb" style="color:#f0abfc"></span></div>
      <div class="mc3d-hp"><div class="bar"><i style="width:100%"></i></div><div class="val">100 / 100</div></div>
      <div class="mc3d-slots"><div class="row w"></div><div class="row p"></div></div>
      <div class="mc3d-allies"></div>
      <div class="mc3d-boss"><span>Страж Склепа</span><div class="bar"><i style="width:100%"></i></div></div>
      <div class="mc3d-down">Вы пали!<br><small>Союзник может поднять вас, встав рядом</small><br><button class="mc-btn danger mc3d-giveup">🏳 Сдаться — в лобби</button></div>
      <div class="mc3d-abilities"></div>
    `;
    overlay.layer.insertBefore(el, overlay.layer.firstChild);
    this.el = el;
    this.q = (s) => el.querySelector(s);
    this.xpFill = this.q('.mc3d-xp i');
    this.xpText = this.q('.mc3d-xp span');
    this.timeEl = this.q('.mc3d-top .t');
    this.killEl = this.q('.mc3d-top .k');
    this.nbEl = this.q('.mc3d-top .nb');
    this.hpFill = this.q('.mc3d-hp .bar i');
    this.hpVal = this.q('.mc3d-hp .val');
    this.wRow = this.q('.mc3d-slots .w');
    this.pRow = this.q('.mc3d-slots .p');
    this.allies = this.q('.mc3d-allies');
    this.bossBox = this.q('.mc3d-boss');
    this.bossFill = this.q('.mc3d-boss i');
    this.downEl = this.q('.mc3d-down');
    this.abBox = this.q('.mc3d-abilities');
    this.q('.mc3d-giveup').addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); this.cb.onGiveUp?.(); });
    this.abEls = [];
    this.choiceOpen = false;
    this.cache = {};
    this.keyHandler = (e) => {
      if (!this.choiceOpen) return;
      const n = parseInt(e.key, 10);
      if (n >= 1 && n <= this.choices.length) { e.preventDefault(); e.stopPropagation(); this.pick(n - 1); }
    };
    window.addEventListener('keydown', this.keyHandler, true);
  }

  show(on) { this.el.style.display = on ? '' : 'none'; if (!on) this.closeChoices(); }

  // До трёх навыков героя (Q / G / F; R — навык оружия); на телефоне — кнопки справа (touchControls)
  setAbilities(list) {
    const keys = ['Q', 'R', 'F'];
    this.abBox.innerHTML = '';
    this.abEls = (list || []).map((a, i) => {
      const b = document.createElement('div');
      b.className = 'mc3d-ability';
      b.title = `${a.name} [${keys[i]}] — ${a.desc}`;
      b.innerHTML = `<span class="ic">${a.icon}</span><small>${keys[i]}</small><div class="cd" style="display:none"></div>`;
      b.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); this.cb.onAbility?.(i); });
      this.abBox.appendChild(b);
      return b.querySelector('.cd');
    });
  }

  set(key, el, prop, val) {
    if (this.cache[key] === val) return;
    this.cache[key] = val;
    el[prop] = val;
  }

  update(run) {
    const m = run.me;
    const need = xpNeed(run.team.level);
    this.set('xpw', this.xpFill.style, 'width', `${Math.min(100, (run.team.xp / need) * 100).toFixed(1)}%`);
    this.set('xpt', this.xpText, 'textContent', `Ур. ${run.team.level}`);
    this.set('time', this.timeEl, 'textContent', fmtTime(run.t));
    this.set('kills', this.killEl, 'textContent', `☠ ${run.team.kills}`);
    const toBoss = run.nextBoss - run.t;
    let nbText = toBoss > 0 && toBoss < 30 ? `⚠ Страж через ${Math.ceil(toBoss)}с` : '';
    if (run.mode === 'trial' && run.heart) nbText = `💛 Сердце ${Math.max(0, Math.round((run.heart.hp / run.heart.maxHp) * 100))}% · Волна ${run.trialWave}/8`;
    else if (run.mode === 'duel') nbText = run.hpCapPct < 100 ? `🪞 Кап здоровья ${run.hpCapPct}%` : '🪞 Отражение';
    this.set('nb', this.nbEl, 'textContent', nbText);
    this.set('hpw', this.hpFill.style, 'width', `${Math.max(0, (m.hp / m.maxHp) * 100).toFixed(1)}%`);
    this.set('hpv', this.hpVal, 'textContent', `${Math.ceil(m.hp)} / ${m.maxHp}`);
    const wSig = Object.entries(m.weapons).map(([k, v]) => k + v.lv).join();
    if (wSig !== this.cache.wSig) {
      this.cache.wSig = wSig;
      this.wRow.innerHTML = Object.entries(m.weapons).map(([k, v]) => `<div class="mc3d-slot" title="${esc(WEAPONS[k].name)}">${WEAPONS[k].icon}<b>${v.lv}</b></div>`).join('');
    }
    const pSig = Object.entries(m.passives).map(([k, v]) => k + v).join();
    if (pSig !== this.cache.pSig) {
      this.cache.pSig = pSig;
      this.pRow.innerHTML = Object.entries(m.passives).map(([k, v]) => `<div class="mc3d-slot" title="${esc(PASSIVES[k].name)}">${PASSIVES[k].icon}<b>${v}</b></div>`).join('');
    }
    // союзники
    const aSig = [...run.remotes.entries()].map(([id, r]) => `${id}:${r.username}:${Math.round((r.hp / (r.maxHp || 1)) * 20)}:${r.dead ? 1 : 0}:${r.stale ? 1 : 0}`).join('|');
    if (aSig !== this.cache.aSig) {
      this.cache.aSig = aSig;
      this.allies.innerHTML = [...run.remotes.values()].map((r) => `<div class="mc3d-ally" style="color:${esc(r.color)}">${r.dead ? '💀 ' : ''}${esc(r.username)}${r.stale ? ' (нет связи)' : ''}<div class="bar"><i style="width:${Math.max(0, Math.round(((r.hp || 0) / (r.maxHp || 1)) * 100))}%"></i></div></div>`).join('');
    }
    // босс
    let boss = null;
    for (const e of run.enemies.values()) if (e.boss && !e.dead) { boss = e; break; }
    this.set('bossOn', this.bossBox.style, 'display', boss ? 'block' : 'none');
    if (boss) this.set('bossW', this.bossFill.style, 'width', `${Math.max(0, ((boss.hp ?? boss.maxHp) / boss.maxHp) * 100).toFixed(1)}%`);
    this.set('down', this.downEl.style, 'display', m.dead && !run.ended ? 'block' : 'none');
    // навык
    (m.abilities || []).forEach((a, i) => {
      const el = this.abEls[i];
      if (!el) return;
      const cd = a.cdLeft;
      this.set('abcd' + i, el.style, 'display', cd > 0 ? 'flex' : 'none');
      this.set('abct' + i, el, 'textContent', cd > 0 ? String(Math.ceil(cd)) : '');
    });
  }

  // --- 3 с неуязвимости на выборе после уровня: кольцо обратного отсчёта ---
  setInvuln(left, total) {
    const ring = this.choiceEl?.querySelector('.mc3d-inv-ring');
    if (!ring) return;
    const key = left > 0 ? Math.ceil(left * 10) : -1;
    if (key === this.cache.inv) return;
    this.cache.inv = key;
    if (left <= 0) { ring.classList.add('over'); ring.style.setProperty('--p', '0'); ring.querySelector('b').textContent = '!'; ring.querySelector('small').textContent = 'вы уязвимы'; ring.style.display = this.cache.invShown ? '' : 'none'; return; }
    this.cache.invShown = true;
    ring.style.display = ''; ring.classList.remove('over');
    ring.style.setProperty('--p', String(Math.max(0, Math.min(1, left / total))));
    ring.querySelector('b').textContent = String(Math.ceil(left));
    ring.querySelector('small').textContent = 'выберите — будет волна';
  }

  // --- выбор улучшения ---
  openChoices(choices, { title = 'Новый уровень!', sub = '' } = {}) {
    this.closeChoices();
    this.choices = choices;
    this.choiceOpen = true;
    this.cache.inv = undefined; this.cache.invShown = false;
    const el = this.ov.showScreen(`<h2>${esc(title)}</h2><p>${esc(sub || 'Выберите улучшение — клавиши 1–3 или нажатие')}</p><div class="mc3d-inv-ring" style="display:none"><b>3</b><small>неуязвимость</small></div><div class="mc3d-choices"></div>`, [], 'mc3d-choice-screen');
    el.style.background = 'rgba(5,3,10,0.62)';
    const box = el.querySelector('.mc3d-choices');
    choices.forEach((c, i) => {
      const b = document.createElement('button');
      b.className = 'mc3d-choice';
      b.innerHTML = `<div class="ic">${c.icon}</div><div class="nm">${i + 1}. ${esc(c.name)}</div><div class="lv">${c.kind === 'weapon' ? 'Оружие' : c.kind === 'passive' ? 'Усиление' : ''}${c.lv ? ` · ур. ${c.lv}` : ''}</div>${c.isNew ? '<div class="new">НОВОЕ</div>' : ''}<div class="ds">${esc(c.desc)}</div>`;
      b.addEventListener('click', (e) => { e.stopPropagation(); this.pick(i); });
      box.appendChild(b);
    });
    this.choiceEl = el;
  }

  pick(i) {
    if (!this.choiceOpen) return;
    const c = this.choices[i];
    this.closeChoices();
    this.cb.onChoice?.(c);
  }

  closeChoices() {
    if (this.choiceOpen && this.ov.screen === this.choiceEl) this.ov.hideScreen();
    this.choiceOpen = false;
    this.choiceEl = null;
  }

  // --- итоги ---
  showResults(info, { isHost, coop, myId }) {
    this.closeChoices();
    let best = null;
    try { best = JSON.parse(localStorage.getItem(BEST_KEY) || 'null'); } catch (_) {}
    const me = (info.players || []).find((p) => p.id === myId) || info.players?.[0] || {};
    const isRecord = !best || info.time > best.time;
    if (isRecord) {
      best = { time: info.time, level: info.level, kills: info.kills, at: Date.now() };
      try { localStorage.setItem(BEST_KEY, JSON.stringify(best)); } catch (_) {}
    }
    const rows = (info.players || []).map((p) => `<tr><td>${esc(p.username)}</td><td>${esc(displayClassName(p.classKey, '—'))}</td><td>${p.kills}</td><td>${p.damage}</td></tr>`).join('');
    const html = `<div class="mc3d-results">
      <h2>${esc(info.reason || 'Забег окончен')}</h2>
      <div class="mc3d-kv">
        <span>Время выживания</span><b>${fmtTime(info.time)}</b>
        <span>Уровень отряда</span><b>${info.level}</b>
        <span>Убито (всего)</span><b>${info.kills}</b>
        <span>Ваши убийства</span><b>${me.kills ?? 0}</b>
        <span>Лучший забег</span><b>${fmtTime(best.time)}${isRecord ? ' 🏆 новый рекорд' : ''}</b>
      </div>
      ${coop ? `<table><tr><th>Игрок</th><th>Класс</th><th>Убийства</th><th>Урон</th></tr>${rows}</table>` : ''}
      <p style="font-size:11px;color:#94a3b8">Забег сброшен сервером. В лобби лидер запускает новый забег с нуля.</p>
    </div>`;
    this.ov.showScreen(html, [
      { text: '↻ В лобби', cls: 'gold', id: 'mc3d-again', onClick: () => this.cb.onRestart?.() },
      { text: '⟵ В мир', cls: 'ghost', id: 'mc3d-leave', onClick: () => this.cb.onLeave?.() },
    ], 'mc3d-results-screen');
  }

  roomName(id) { return RUN_ROOMS[id]?.name || id; }

  destroy() { window.removeEventListener('keydown', this.keyHandler, true); this.el.remove(); }
}
