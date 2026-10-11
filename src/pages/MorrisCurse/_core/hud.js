// Боковые панели (видны в полноэкранном режиме на десктопе): тело/HP, рывок, сеть, мини-карта,
// цель, объекты рядом, комнаты забегов. Дуэльные кнопки (WAP) удалены.
import { CLASSES, getArmorReduction } from './classes.js';
import { Minimap } from './minimap.js';
import { RUN_ROOMS, RUN_CLASSES, ABILITIES, displayClassName } from './survivors/data.js';
import { esc } from './ui/overlay.js';
import { fmtTime } from './ui/runUI.js';

export class GameHUD {
  constructor(container, { onTouchFlower, onPickFlower, onEnterRun, onLeaveRun } = {}) {
    this.container = container;
    this.cb = { onTouchFlower, onPickFlower, onEnterRun, onLeaveRun };
    this.currentTarget = null;
    this.cache = {};
    this.mount();
  }

  mount() {
    this.container.querySelectorAll('.game-hud-panel').forEach((el) => el.remove());
    const canvas = this.container.querySelector('#game-canvas') || this.container.querySelector('canvas');
    const left = document.createElement('div');
    left.className = 'game-hud-panel hud-left';
    left.innerHTML = `
      <div class="hud-card">
        <div class="hud-header">ДУША</div>
        <div class="hud-player-name" id="ghud-my-name">Странник</div>
        <div class="hud-player-class" id="ghud-my-class">Душа [T]</div>
        <div class="hud-bar-bg"><div class="hud-bar-fill hud-hp-fill" id="ghud-my-hp-bar" style="width:100%"></div></div>
        <div class="hud-bar-val" id="ghud-my-hp-val">100 / 100 HP</div>
        <div class="hud-row"><span>Навык:</span><b id="ghud-my-skill">—</b></div>
      </div>
      <div class="hud-card">
        <div class="hud-header">РЫВОК [Space]</div>
        <div class="hud-row"><span>Статус:</span><b id="ghud-dash-status" class="hud-ready">ГОТОВ</b></div>
        <div class="hud-bar-bg"><div class="hud-bar-fill hud-dash-fill" id="ghud-dash-bar" style="width:100%"></div></div>
      </div>
      <div class="hud-card">
        <div class="hud-header">СЕТЬ</div>
        <div class="hud-row"><span>В сети:</span><b id="ghud-online">1</b></div>
        <div class="hud-row"><span>Пинг:</span><b id="ghud-ping" style="color:#4ade80">-- ms</b></div>
        <div class="hud-row"><span>Качество:</span><b id="ghud-net-quality" style="color:#4ade80">📶 Отличное</b></div>
        <div class="hud-row"><span>Зум:</span><b id="ghud-zoom">x0.5</b></div>
        <div class="hud-row"><span>Координаты:</span><b id="ghud-coords">X: 0 | Y: 0</b></div>
      </div>
      <div class="hud-card hud-controls">
        <div class="hud-header">УПРАВЛЕНИЕ</div>
        <div class="hud-ctrl-item">Движение <span>WASD / стрелки</span></div>
        <div class="hud-ctrl-item">Рывок <span>Space / Shift</span></div>
        <div class="hud-ctrl-item">Атака (в мире) <span>ЛКМ (удерживать)</span></div>
        <div class="hud-ctrl-item">Действие / портал <span>E / клик по объекту</span></div>
        <div class="hud-ctrl-item">Навыки <span>Q / R / F</span></div>
        <div class="hud-ctrl-item">Улучшение (забег) <span>1 / 2 / 3</span></div>
        <div class="hud-ctrl-item">Задания <span>J</span></div>
        <div class="hud-ctrl-item">Герой и таланты <span>T / C</span></div>
        <div class="hud-ctrl-item">Навыки и Сияние <span>K</span></div>
        <div class="hud-ctrl-item">Снаряжение <span>I</span></div>
        <div class="hud-ctrl-item">Бестиарий <span>B</span></div>
        <div class="hud-ctrl-item">Чат <span>Enter</span></div>
        <div class="hud-ctrl-item">Зум <span>колесо / + −</span></div>
        <div class="hud-ctrl-item">Автоатака (доступность) <span>V</span></div>
      </div>`;
    const right = document.createElement('div');
    right.className = 'game-hud-panel hud-right';
    right.innerHTML = `
      <div id="ghud-minimap-slot"></div>
      <div class="hud-card" id="ghud-target-card">
        <div class="hud-header">ЦЕЛЬ</div>
        <div id="ghud-target-empty" class="hud-empty">Кликните по объекту</div>
        <div id="ghud-target-details" style="display:none">
          <div class="hud-target-title" id="ghud-target-name">Цель</div>
          <div class="hud-row"><span>Класс / Тип:</span><b id="ghud-target-class">-</b></div>
          <div class="hud-row"><span>❤️ HP:</span><b id="ghud-target-hp">-</b></div>
          <div class="hud-row"><span>🛡️ Защита:</span><b id="ghud-target-armor">-</b></div>
          <div class="hud-row"><span>⚔️ Урон:</span><b id="ghud-target-atk">-</b></div>
          <button class="hud-duel-btn" id="ghud-flower-touch-btn" style="display:none;background:#b91c1c;border-color:#f87171">🖐️ ТРОНУТЬ БУТОН (-1 HP)</button>
          <button class="hud-duel-btn" id="ghud-flower-pick-btn" style="display:none;background:#0284c7;border-color:#38bdf8">🌸 СОРВАТЬ (+20 🛡️ ЩИТ)</button>
        </div>
      </div>
      <div class="hud-card">
        <div class="hud-header">ЗАБЕГИ (CO-OP)</div>
        <div id="ghud-run-rooms"></div>
      </div>
      <div class="hud-card">
        <div class="hud-header">РЯДОМ</div>
        <div id="ghud-nearby-list" class="hud-nearby-box"><div class="hud-empty">Никого</div></div>
      </div>`;
    if (canvas) {
      canvas.style.order = '2';
      left.style.order = '1';
      right.style.order = '3';
      this.container.insertBefore(left, canvas);
      this.container.appendChild(right);
    } else {
      this.container.appendChild(left);
      this.container.appendChild(right);
    }
    this.left = left; this.right = right;
    this.minimap = new Minimap(right.querySelector('#ghud-minimap-slot'));
    const $ = (id) => this.container.querySelector('#' + id);
    this.$ = $;
    this.touchBtn = $('ghud-flower-touch-btn');
    this.pickBtn = $('ghud-flower-pick-btn');
    this.touchBtn.onclick = () => { if (this.currentTarget) this.cb.onTouchFlower?.(this.currentTarget.id); };
    this.pickBtn.onclick = () => { if (this.currentTarget) { this.cb.onPickFlower?.(this.currentTarget.id); this.clearTarget(); } };
    this.roomsBox = $('ghud-run-rooms');
    this.roomsBox.addEventListener('click', (e) => {
      const b = e.target.closest('button[data-room]');
      if (!b) return;
      if (b.dataset.leave) this.cb.onLeaveRun?.(); else this.cb.onEnterRun?.(b.dataset.room);
    });
  }

  setTarget(target) { this.currentTarget = target; }
  clearTarget() { this.currentTarget = null; }

  txt(id, v, prop = 'textContent') {
    const key = id + prop;
    if (this.cache[key] === v) return;
    this.cache[key] = v;
    const el = this.$(id);
    if (!el) return;
    if (prop === 'width') el.style.width = v; else el[prop] = v;
  }

  update(d) {
    if (!this.left.offsetParent) return; // панели скрыты (не fullscreen / мобильный) — не тратим время
    const { player, username, mode, run, ping = 0, online = 1, zoom = 0.5, roomCounts = {}, nearby = [], dash } = d;
    const st = player.stats || {};
    const cls = CLASSES[st.classId];
    const rc = RUN_CLASSES[st.classId] || RUN_CLASSES.soul;
    this.txt('ghud-my-name', username);
    this.txt('ghud-my-class', `${cls ? displayClassName(st.classId, cls.name) : 'Душа'} [C]`);
    if (mode === 'run' && run) {
      this.txt('ghud-my-hp-bar', `${Math.max(0, (run.me.hp / run.me.maxHp) * 100)}%`, 'width');
      this.txt('ghud-my-hp-val', `${Math.ceil(run.me.hp)} / ${run.me.maxHp} HP (забег)`);
    } else {
      this.txt('ghud-my-hp-bar', `${Math.max(0, ((st.hp ?? 100) / (st.maxHp || 100)) * 100)}%`, 'width');
      this.txt('ghud-my-hp-val', `${st.hp ?? 100} / ${st.maxHp ?? 100} HP${st.armor ? ` · 🛡️ ${Math.round(getArmorReduction(st.armor) * 100)}%` : ''}`);
    }
    const ab = ABILITIES[rc.ability];
    this.txt('ghud-my-skill', ab ? `${ab.icon} ${ab.name}` : '— (нужно тело)');
    const dashReady = !dash || dash.cd <= 0;
    this.txt('ghud-dash-status', dashReady ? 'ГОТОВ' : `${dash.cd.toFixed(1)}с`);
    this.txt('ghud-dash-status', dashReady ? 'hud-ready' : 'hud-cd', 'className');
    this.txt('ghud-dash-bar', `${dashReady ? 100 : Math.round((1 - dash.cd / dash.max) * 100)}%`, 'width');
    this.txt('ghud-online', String(online));
    this.txt('ghud-ping', ping ? `${ping} ms` : '-- ms');
    const q = !ping ? ['—', '#94a3b8'] : ping < 90 ? ['📶 Отличное', '#4ade80'] : ping < 200 ? ['📶 Среднее', '#facc15'] : ['📶 Плохое', '#ef4444'];
    this.txt('ghud-net-quality', q[0]);
    this.$('ghud-net-quality').style.color = q[1];
    this.txt('ghud-zoom', `x${zoom.toFixed(2)}`);
    this.txt('ghud-coords', mode === 'run' && run ? `${run.me.x.toFixed(0)} м | ${run.me.z.toFixed(0)} м` : `X: ${Math.round(player.x)} | Y: ${Math.round(player.y)}`);

    if (mode === 'run' && run) this.minimap.updateRun(run);
    else this.minimap.update({ player, otherPlayers: d.otherPlayers, boss: d.boss, worldPortals: d.portals, worldSize: 1200, lastFaceDir: d.lastFaceDir, currentWorld: d.world });

    // цель
    const t = this.currentTarget;
    this.$('ghud-target-empty').style.display = t ? 'none' : '';
    this.$('ghud-target-details').style.display = t ? '' : 'none';
    if (t) {
      this.txt('ghud-target-name', t.name);
      this.txt('ghud-target-class', t.typeLabel || '-');
      this.txt('ghud-target-hp', t.hp ?? '-');
      this.txt('ghud-target-armor', t.armor ?? '-');
      this.txt('ghud-target-atk', t.atk ?? '-');
      this.touchBtn.style.display = t.kind === 'flower' && t.stage === 'bud' ? '' : 'none';
      this.pickBtn.style.display = t.kind === 'flower' && t.stage === 'mature' ? '' : 'none';
    }

    // комнаты забегов
    const rSig = JSON.stringify([mode, d.runRoom, roomCounts, run ? Math.floor(run.t) : 0]);
    if (rSig !== this.cache.rSig) {
      this.cache.rSig = rSig;
      this.roomsBox.innerHTML = Object.values(RUN_ROOMS).map((r) => {
        const inIt = d.runRoom === r.id;
        return `<div class="hud-row" style="align-items:center;margin-bottom:4px"><span style="color:${r.color}">${esc(r.name)} · ${roomCounts[r.id] || 0}/4</span>${inIt
          ? `<button class="hud-duel-btn" style="margin:0;padding:3px 6px" data-room="${r.id}" data-leave="1">Выйти</button>`
          : `<button class="hud-duel-btn" style="margin:0;padding:3px 6px" data-room="${r.id}" ${mode === 'run' ? 'disabled' : ''}>Войти</button>`}</div>`;
      }).join('') + (mode === 'run' && run ? `<div class="hud-row"><span>Время:</span><b>${fmtTime(run.t)}</b></div><div class="hud-row"><span>Роль:</span><b>${run.isHost ? '👑 ведущий' : 'участник'}</b></div>` : '<div class="hud-empty">Войти можно у портала-разлома или кнопкой (вход у портала проверяется сервером).</div>');
    }

    const nSig = nearby.map((n) => n.title + n.dist).join('|');
    if (nSig !== this.cache.nSig) {
      this.cache.nSig = nSig;
      this.$('ghud-nearby-list').innerHTML = nearby.length
        ? nearby.map((n) => `<div class="hud-row"><span style="color:${esc(n.color || '#e2e8f0')}">${esc(n.title)}</span><b>${n.dist} px</b></div>`).join('')
        : '<div class="hud-empty">Никого</div>';
    }
  }
}
