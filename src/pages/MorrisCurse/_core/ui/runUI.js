// HUD забега, модалка выбора улучшения, экран итогов, баннер входа в комнату.
import { WEAPONS, PASSIVES, ABILITIES, RUN_CLASSES, xpNeed, RUN_ROOMS, displayClassName } from '../survivors/data.js';
import { esc } from './overlay.js';

const fmtTime = (t) => {
  const s = Math.max(0, Math.floor(t));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
};
export { fmtTime };

const BEST_KEY = 'mc-run-best';

export class RunUI {
  constructor(overlay, { onChoice, onAbility, onRestart, onLeave }) {
    this.ov = overlay;
    this.cb = { onChoice, onAbility, onRestart, onLeave };
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
      <div class="mc3d-down">Вы пали!<br><small>Союзник может поднять вас, встав рядом</small></div>
      <div class="mc3d-ability hidden" title="Навык класса [Q]"><span class="ic">✦</span><small>Q</small><div class="cd" style="display:none"></div></div>
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
    this.abBtn = this.q('.mc3d-ability');
    this.abCd = this.q('.mc3d-ability .cd');
    const fire = (e) => { e.preventDefault(); e.stopPropagation(); this.cb.onAbility?.(); };
    this.abBtn.addEventListener('pointerdown', fire);
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

  setAbility(classKey) {
    const ab = ABILITIES[RUN_CLASSES[classKey]?.ability];
    this.abBtn.classList.toggle('hidden', !ab);
    if (ab) {
      this.abBtn.querySelector('.ic').textContent = ab.icon;
      this.abBtn.title = `${ab.name} [Q] — ${ab.desc}`;
    }
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
    this.set('nb', this.nbEl, 'textContent', toBoss > 0 && toBoss < 30 ? `⚠ Страж через ${Math.ceil(toBoss)}с` : '');
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
    const ab = ABILITIES[run.cls.ability];
    if (ab) {
      const cd = m.abilityCd;
      this.set('abcd', this.abCd.style, 'display', cd > 0 ? 'flex' : 'none');
      this.set('abct', this.abCd, 'textContent', cd > 0 ? String(Math.ceil(cd)) : '');
    }
  }

  // --- выбор улучшения ---
  openChoices(choices, { title = 'Новый уровень!', sub = '' } = {}) {
    this.closeChoices();
    this.choices = choices;
    this.choiceOpen = true;
    const el = this.ov.showScreen(`<h2>${esc(title)}</h2><p>${esc(sub || 'Выберите улучшение — клавиши 1–3 или нажатие')}</p><div class="mc3d-choices"></div>`, [], 'mc3d-choice-screen');
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
      <p style="font-size:11px;color:#94a3b8">${coop && !isHost ? 'Перезапуск запускает ведущий забега.' : ''}</p>
    </div>`;
    this.ov.showScreen(html, [
      { text: coop && !isHost ? 'Ждать / Снова' : '↻ Снова', cls: 'gold', id: 'mc3d-again', onClick: () => this.cb.onRestart?.() },
      { text: '⟵ В мир', cls: 'ghost', id: 'mc3d-leave', onClick: () => this.cb.onLeave?.() },
    ], 'mc3d-results-screen');
  }

  roomName(id) { return RUN_ROOMS[id]?.name || id; }

  destroy() { window.removeEventListener('keydown', this.keyHandler, true); this.el.remove(); }
}
