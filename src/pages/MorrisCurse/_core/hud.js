// Боковые панели (видны в полноэкранном режиме на десктопе): тело/HP, рывок, сеть, мини-карта,
// цель, объекты рядом, комнаты забегов. Дуэльные кнопки (WAP) удалены.
// Внутриигровой режим (html.mc-hud-ig, настройка «Старые панели: Выкл»): колонки скрыты, поле на всю ширину,
// те же узлы (мини-карта, цель, забеги, рядом) переезжают в слой поверх игры и возвращаются на место при «Вкл».
import { CLASSES } from './classes.js';
import { Minimap } from './minimap.js';
import { worldSize } from '../../../../server/worlds/sizes.ts';
import { RUN_ROOMS, RUN_CLASSES, ABILITIES, displayClassName } from './survivors/data.js';
import { esc } from './ui/overlay.js';
import { avatarUrl, hudIngame, UI as UI_SKIN } from './ui/uiSkin.js';
import { fmtTime } from './ui/runUI.js';

export class GameHUD {
  constructor(container, cb = {}) {
    this.container = container;
    // все колбэки целиком (раньше список полей терял onPeople/onMap — «Онлайн», «Друзья», ⚙ молча не работали)
    this.cb = { ...cb };
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
        <div class="hud-header" id="ghud-my-head">ГЕРОЙ</div>
        <div class="hud-who"><span class="mc-av s64" id="ghud-my-av" style="display:none"><i></i></span><div>
        <div class="hud-player-name" id="ghud-my-name">Странник</div>
        <div class="hud-player-class" id="ghud-my-class">Душа [T]</div></div></div>
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
        <div class="hud-ctrl-item">Навыки <span>Q / G / F</span></div>
        <div class="hud-ctrl-item">Навык оружия <span>R</span></div>
        <div class="hud-ctrl-item">Улучшение (забег) <span>1 / 2 / 3</span></div>
        <div class="hud-ctrl-item">Задания <span>J</span></div>
        <div class="hud-ctrl-item">Персонаж <span>C</span></div>
        <div class="hud-ctrl-item">Навыки и Сияние <span>K</span></div>
        <div class="hud-ctrl-item">Снаряжение <span>I</span></div>
        <div class="hud-ctrl-item">Меню <span>B</span></div>
        <div class="hud-ctrl-item">Чат <span>Enter</span></div>
        <div class="hud-ctrl-item">Зум <span>колесо / + −</span></div>
        <div class="hud-ctrl-item">Автоатака (доступность) <span>V</span></div>
        <div class="hud-ctrl-item">Портал домой (Аринар) <span>H</span></div>
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
          <button class="hud-duel-btn" id="ghud-inspect-btn" style="display:none;background:#4c1d95;border-color:#a78bfa">👤 Посмотреть персонажа</button>
          <button class="hud-duel-btn" id="ghud-duel-btn" style="display:none;background:#7f1d1d;border-color:#f87171">⚔️ Вызвать на дуэль</button>
        </div>
      </div>
      <div class="hud-card">
        <div class="hud-header">ЗАБЕГИ (CO-OP)</div>
        <div id="ghud-run-rooms"></div>
      </div>
      <div class="hud-card">
        <div class="hud-header">РЯДОМ</div>
        <div id="ghud-nearby-list" class="hud-nearby-box"><div class="hud-empty">Никого</div></div>
      </div>
      <div class="hud-card hud-rating-card">
        <button class="hud-duel-btn" id="ghud-rating-btn" style="margin:0;background:#78350f;border-color:#fbbf24">🏆 РЕЙТИНГ ИГРОКОВ</button>
        <div class="hud-soc-row"><button class="hud-duel-btn" id="ghud-online-btn">🟢 ОНЛАЙН <b>·</b></button><button class="hud-duel-btn" id="ghud-friends-btn">🤝 ДРУЗЬЯ</button><button class="hud-duel-btn" id="ghud-set-btn" title="Настройки">⚙️</button></div>
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
    this.inspectBtn = $('ghud-inspect-btn');
    this.inspectBtn.onclick = () => { if (this.currentTarget?.kind === 'player') this.cb.onInspect?.(this.currentTarget.id); };
    this.duelBtn = $('ghud-duel-btn');
    this.duelBtn.onclick = () => { if (this.currentTarget?.kind === 'player') this.cb.onDuel?.(this.currentTarget.id); };
    $('ghud-rating-btn').onclick = () => this.cb.onRating?.();
    $('ghud-online-btn').onclick = () => this.cb.onPeople?.('online');
    $('ghud-friends-btn').onclick = () => this.cb.onPeople?.('friends');
    $('ghud-set-btn').onclick = () => this.cb.onPeople?.('settings');
    this.roomsBox = $('ghud-run-rooms');
    this.roomsBox.addEventListener('click', (e) => {
      const b = e.target.closest('button[data-room]');
      if (!b) return;
      if (b.dataset.leave) this.cb.onLeaveRun?.(); else this.cb.onEnterRun?.(b.dataset.room);
    });
    this.mountIngame();
  }

  // ——— HUD внутри игрового поля ———
  mountIngame() {
    this.mobile = this.container.classList.contains('mc3d-mobile');
    const ig = document.createElement('div');
    ig.className = 'mc-ighud' + (this.mobile ? ' mob' : '');
    ig.innerHTML = `
      <div class="ig-mm"><div class="ig-mm-disc"></div>
        <div class="ig-row ig-acts"><span class="ig-net" title="Сеть"><i class="ig-dot"></i><b class="ig-ping">--</b><small>мс</small><span class="ig-on">· <b>1</b></span></span><span class="ig-tg"></span>
          <button class="ig-b" data-ig="runs" title="Забеги (co-op)">⚔️</button><button class="ig-b" data-ig="near" title="Рядом">👁️</button><button class="ig-b" data-ig="help" title="Управление (? / F1)">?</button></div></div>
      <div class="ig-pop" data-pop="runs"><div class="ig-pop-h">Забеги (co-op)<button class="ig-x" data-ig="runs" title="Закрыть">✕</button></div></div>
      <div class="ig-pop" data-pop="near"><div class="ig-pop-h">Рядом<button class="ig-x" data-ig="near" title="Закрыть">✕</button></div></div>
      <div class="ig-tgt"></div>
      <div class="ig-help" data-pop="help"><div class="ig-help-w"><div class="ig-pop-h">Управление<button class="ig-x" data-ig="help" title="Закрыть (Esc)">✕</button></div>
        <div class="ig-help-l">${this.left.querySelector('.hud-controls')?.innerHTML.replace(/<div class="hud-header">[^<]*<\/div>/, '') || ''}
        <div class="hud-ctrl-item">Эта подсказка <span>? / F1</span></div></div></div></div>`;
    (this.container.querySelector('.mc3d-layer') || this.container).appendChild(ig);
    this.igEl = ig;
    const q = (s) => ig.querySelector(s);
    this.igNet = { ping: q('.ig-ping'), on: q('.ig-on b'), dot: q('.ig-dot'), box: q('.ig-net') };
    // что куда переезжает: [узел, новое место]; на старом месте — метка, чтобы вернуть ровно туда же
    const roomsCard = this.roomsBox.closest('.hud-card'), nearCard = this.$('ghud-nearby-list').closest('.hud-card');
    const tgl = (id) => this.minimap.container.querySelector('#' + id);
    this.moves = [[this.minimap.container, q('.ig-mm-disc')], [tgl('mm-toggle-players'), q('.ig-tg'), '👥'], [tgl('mm-toggle-portals'), q('.ig-tg'), '🌀'],
      [this.$('ghud-target-card'), q('.ig-tgt')], [roomsCard, q('[data-pop="runs"]')], [nearCard, q('[data-pop="near"]')]]
      .map(([el, to, icon]) => { const mark = document.createComment('ig'); el.parentNode.insertBefore(mark, el); return { el, to, mark, icon, full: el.textContent }; });
    ig.addEventListener('click', (e) => {
      const b = e.target.closest('[data-ig]'); if (!b) return;
      e.stopPropagation(); this.igToggle(b.dataset.ig);
    });
    ig.addEventListener('pointerdown', (e) => e.stopPropagation()); // клик по HUD — не ход/атака в мире
    if (this.mobile) this.minimap.canvas.addEventListener('click', () => { if (this.igOn) this.minimap.onOpenMap?.(); }); // телефон: тап по круглой карте — карта мира
    q('.ig-help').addEventListener('click', (e) => { if (e.target.classList.contains('ig-help')) this.igToggle('help', false); });
    this.onKey = (e) => {
      if (!this.igOn || e.target?.closest?.('input, textarea, [contenteditable]')) return;
      if (e.key === '?' || e.code === 'F1') { e.preventDefault(); this.igToggle('help'); }
      else if (e.key === 'Escape' && ig.querySelector('.open')) { this.igToggle(null, false); e.stopPropagation(); }
    };
    window.addEventListener('keydown', this.onKey, true);
    this.onIg = () => this.setIngame(hudIngame());
    window.addEventListener('mc-hud-ig', this.onIg);
    this.setIngame(hudIngame());
  }

  // открыть/закрыть всплывающее окно (одно за раз); id=null — закрыть все
  igToggle(id, force) {
    for (const el of this.igEl.querySelectorAll('[data-pop]')) {
      const on = id && el.dataset.pop === id ? (force ?? !el.classList.contains('open')) : false;
      el.classList.toggle('open', on);
      this.igEl.querySelector(`.ig-b[data-ig="${el.dataset.pop}"]`)?.classList.toggle('on', on);
    }
  }

  setIngame(on) {
    on = !!on && !(this.mobile && !UI_SKIN.mmMobile);
    if (on === this.igOn) return;
    this.igOn = on;
    for (const m of this.moves) {
      if (on) m.to.appendChild(m.el); else m.mark.parentNode.insertBefore(m.el, m.mark.nextSibling);
      if (m.icon) { m.el.textContent = on ? m.icon : m.full; m.el.title = on ? m.full.replace(/^\S+\s*/, '') + ' на мини-карте' : ''; } // в ряду под картой — только значок
    }
    if (!on) this.igToggle(null, false);
    // круглая мини-карта — квадратный холст (рисование берёт размеры холста), обычная — 220×150 как было
    this.igSize();
    this.cache = {}; // перерисовать тексты/списки в новом месте
  }

  // «Цель» гаснет, если у неё tgtHide с ничего не менялось (ОЗ, имя, статус — по тексту карточки); 0 — не скрывать
  igTgtIdle() {
    const N = Number(UI_SKIN.tgtHide) || 0, card = this.$('ghud-target-card');
    if (!N || !this.currentTarget || !card) { this.igEl.classList.remove('tgt-idle'); this.tgtSig = null; return; }
    const sig = card.textContent, now = performance.now();
    if (sig !== this.tgtSig) { this.tgtSig = sig; this.tgtAt = now; }
    this.igEl.classList.toggle('tgt-idle', now - this.tgtAt > N * 1000);
  }
  // зум мини-карты по умолчанию (админка mmZoom 1…3): при входе в HUD-в-поле и когда админ его поменял; выбор игрока кнопками ± дальше не трогаем
  igZoomDef() {
    const z = Math.max(1, Math.min(3, Math.round(Number(UI_SKIN.mmZoom) || 1))) - 1, mm = this.minimap;
    if (this.zoomDefApplied === z || !mm?.zoomLevels) return;
    this.zoomDefApplied = z; mm.zoomIndex = Math.min(z, mm.zoomLevels.length - 1);
    const t = document.getElementById('mm-zoom-text'); if (t && mm.zoomLabels) t.textContent = mm.zoomLabels[mm.zoomIndex];
  }
  igSize() { // админка может поменять диаметр на лету (mmSize) — холст подгоняем без пересоздания
    const cv = this.minimap.canvas, d = Math.round((Number(UI_SKIN.mmSize) || 176) * (this.mobile ? 0.6 : 1)) - 12;
    if (this.igOn) { if (cv.width !== d || cv.height !== d) cv.width = cv.height = d; } else if (cv.width !== 220 || cv.height !== 150) { cv.width = 220; cv.height = 150; }
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
    if (!this.igOn && !this.left.offsetParent) return; // панели скрыты (не fullscreen / мобильный) — не тратим время
    const { player, username, mode, run, ping = 0, online = 1, zoom = 0.5, roomCounts = {}, nearby = [], dash } = d;
    const st = player.stats || {};
    const cls = CLASSES[st.classId];
    const rc = RUN_CLASSES[st.classId] || RUN_CLASSES.soul;
    this.txt('ghud-my-name', username);
    this.txt('ghud-my-class', `${cls ? displayClassName(st.classId, cls.name) : 'Душа'} [C]`);
    this.txt('ghud-my-head', cls ? 'ГЕРОЙ · ТЕЛО' : 'ДУША (без тела)'); // душа вселилась в тело — карточка героя
    { const u = avatarUrl(st.classId, d.eff?.blkVis | 0, 64), av = this.$('ghud-my-av'); if (av && av.dataset.u !== u) { av.dataset.u = u; av.style.display = u ? '' : 'none'; av.style.setProperty('--av', u ? `url('${u}')` : 'none'); av.classList.toggle('cz', u.includes('_cursed')); } } // аватар (обычный / очернённый по порогу админки)
    if (mode === 'run' && run) {
      this.txt('ghud-my-hp-bar', `${Math.max(0, (run.me.hp / run.me.maxHp) * 100)}%`, 'width');
      this.txt('ghud-my-hp-val', `${Math.ceil(run.me.hp)} / ${run.me.maxHp} HP (забег)`);
    } else {
      // мир: настоящие ОЗ — с сервера (zone_state.me), брони на карточке нет (решение владельца)
      const zm = d.zoneMe, eff = d.eff;
      const hp = zm && zm.maxHp ? Math.max(0, Math.round(zm.hp)) : eff?.maxHp ?? st.hp ?? 100, mx = zm && zm.maxHp ? zm.maxHp : eff?.maxHp ?? st.maxHp ?? 100;
      this.txt('ghud-my-hp-bar', `${Math.max(0, (hp / (mx || 1)) * 100)}%`, 'width');
      this.txt('ghud-my-hp-val', `${hp} / ${mx} ОЗ`); // броня на карточке героя убрана по решению владельца
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
    if (this.igOn) { // компактный индикатор сети: точка цвета качества, пинг, онлайн; подробности — во всплывающей подсказке
      const n = this.igNet, sig = [ping, online, q[0], zoom.toFixed(2), Math.round(player.x / 32), Math.round(player.y / 32)].join('|');
      if (n.sig !== sig) { n.sig = sig; n.ping.textContent = ping || '--'; n.on.textContent = online; n.dot.style.background = q[1]; n.ping.style.color = q[1];
        n.box.title = `Сеть: ${q[0].replace('📶 ', '')} · пинг ${ping || '--'} мс · в сети ${online}\nЗум x${zoom.toFixed(2)} · X ${Math.round(player.x)} · Y ${Math.round(player.y)}`; }
      this.igEl.classList.toggle('tgt', !!this.currentTarget); this.igSize(); this.igTgtIdle(); this.igZoomDef();
    }
    this.txt('ghud-coords', mode === 'run' && run ? `${run.me.x.toFixed(0)} м | ${run.me.z.toFixed(0)} м` : `X: ${Math.round(player.x)} | Y: ${Math.round(player.y)}`);

    if (mode === 'run' && run) this.minimap.updateRun(run);
    else this.minimap.update({ player, otherPlayers: d.otherPlayers, boss: d.boss, worldPortals: d.portals, worldSize: worldSize(d.world), lastFaceDir: d.lastFaceDir, currentWorld: d.world || 'hellfire', mobs: d.zoneMobs, mobInfo: d.mobInfo, hunt: d.hunt || null, camps: d.camps, track: d.track, party: d.party });

    // цель
    const t = this.currentTarget;
    this.$('ghud-target-empty').style.display = t ? 'none' : '';
    this.$('ghud-target-details').style.display = t ? '' : 'none';
    if (t) {
      this.txt('ghud-target-name', t.name);
      { const el = this.$('ghud-target-name'); if (el) { el.style.color = t.color || ''; el.className = 'hud-target-title' + (t.glitch ? ' mc-glitch-txt' : ''); if (t.glitch) el.dataset.t = t.name; } } // ярус зачарования: цвет, у Чёрного — глитч
      this.txt('ghud-target-class', t.typeLabel || '-');
      this.txt('ghud-target-hp', t.hp ?? '-');
      this.txt('ghud-target-armor', t.armor ?? '-');
      this.txt('ghud-target-atk', t.atk ?? '-');
      this.touchBtn.style.display = t.kind === 'flower' && t.stage === 'bud' ? '' : 'none';
      this.pickBtn.style.display = t.kind === 'flower' && t.stage === 'mature' ? '' : 'none';
      this.inspectBtn.style.display = t.kind === 'player' ? '' : 'none';
      this.duelBtn.style.display = t.kind === 'player' && t.canDuel ? '' : 'none';
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
