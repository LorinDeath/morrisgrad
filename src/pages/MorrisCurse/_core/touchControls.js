import { skillIcon, radColor } from './ui/actionBar.js';
// Тач-управление: плавающий джойстик в левой части экрана + кнопки (рывок, действие, душа, чат, зум).
// Навык класса в забеге — круглая кнопка HUD забега (runUI). Монтируется в DOM-слой поверх канваса.
export function isMobileDevice() {
  if (navigator.userAgentData?.mobile) {
    return true;
  }
  const uaMatch = /Android|iPhone|iPad|iPod|Opera Mini|IEMobile/i.test(navigator.userAgent);
  const isIPad = navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
  const isTouchScreen = window.matchMedia('(pointer: coarse) and (hover: none)').matches;
  return Boolean(uaMatch || isIPad || isTouchScreen);
}

export class TouchControls {
  constructor(container, callbacks = {}, force = false) {
    this.container = container;
    this.callbacks = callbacks;
    this.stickVector = { x: 0, y: 0 };
    this.touchId = null;
    this.isMobileTouch = force || isMobileDevice();
    if (!this.isMobileTouch) return;
    this.initDOM();
    this.bindEvents();
  }

  initDOM() {
    const root = document.createElement('div');
    root.className = 'mc3d-touch';
    root.innerHTML = `
      <div class="mc3d-joy"><div class="mc3d-joy-hint"></div><div class="mc3d-joy-base"></div><div class="mc3d-joy-knob"></div></div>
      <div class="mc3d-tbtns">
        <div class="mc3d-tbtn ab k-q" data-act="ability" data-slot="0" style="display:none"></div>
        <div class="mc3d-tbtn ab k-r" data-act="ability" data-slot="1" style="display:none"></div>
        <div class="mc3d-tbtn ab k-f" data-act="ability" data-slot="2" style="display:none"></div>
        <div class="mc3d-tbtn atk k-atk" data-hold="attack" title="Атака (автонаведение)">${skillIcon('attack', 40)}</div>
        <div class="mc3d-tbtn k-act" data-act="interact" title="Действие">✋</div>
        <div class="mc3d-tbtn k-dash" data-act="dash" title="Рывок">${skillIcon('dash', 36)}</div>
      </div>
      <div class="mc3d-ttop">
        <div class="mc3d-tbtn" data-act="book" title="Книга Проклятого">📖</div>
        <div class="mc3d-tbtn" data-act="chat" title="Чат">💬</div>
        <div class="mc3d-tbtn" data-act="zoomIn" title="Приблизить">＋</div>
        <div class="mc3d-tbtn" data-act="zoomOut" title="Отдалить">－</div>
      </div>`;
    this.container.appendChild(root);
    this.container.classList.add('mc-touch'); // мобильная раскладка HUD (core3d.css: .mc-touch …)
    this.root = root;
    this.joy = root.querySelector('.mc3d-joy');
    this.base = root.querySelector('.mc3d-joy-base');
    this.knob = root.querySelector('.mc3d-joy-knob');
    this.interactBtn = root.querySelector('[data-act="interact"]');
    this.btnRow = root.querySelector('.mc3d-tbtns');
  }

  bindEvents() {
    const R = 50;
    const start = (e) => {
      if (this.touchId !== null) return;
      e.preventDefault();
      this.touchId = e.pointerId;
      const rect = this.joy.getBoundingClientRect();
      this.origin = { x: e.clientX - rect.left, y: e.clientY - rect.top };
      [this.base, this.knob].forEach((el) => { el.style.display = 'block'; });
      this.joy.classList.add('on');
      this.base.style.left = this.origin.x + 'px'; this.base.style.top = this.origin.y + 'px';
      this.knob.style.left = this.origin.x + 'px'; this.knob.style.top = this.origin.y + 'px';
      try { this.joy.setPointerCapture(e.pointerId); } catch (_) {}
    };
    const move = (e) => {
      if (e.pointerId !== this.touchId) return;
      e.preventDefault();
      const rect = this.joy.getBoundingClientRect();
      let dx = e.clientX - rect.left - this.origin.x;
      let dy = e.clientY - rect.top - this.origin.y;
      const len = Math.hypot(dx, dy);
      if (len > R) { dx = (dx / len) * R; dy = (dy / len) * R; }
      this.knob.style.left = this.origin.x + dx + 'px';
      this.knob.style.top = this.origin.y + dy + 'px';
      this.stickVector = { x: dx / R, y: dy / R };
    };
    const end = (e) => {
      if (e.pointerId !== this.touchId) return;
      this.touchId = null;
      this.stickVector = { x: 0, y: 0 };
      [this.base, this.knob].forEach((el) => { el.style.display = 'none'; });
      this.joy.classList.remove('on');
    };
    this.joy.addEventListener('pointerdown', start);
    this.joy.addEventListener('pointermove', move);
    this.joy.addEventListener('pointerup', end);
    this.joy.addEventListener('pointercancel', end);
    // кнопка удержания (атака): пока палец на кнопке — атака повторяется со скоростью оружия
    this.atkBtn = this.root.querySelector('[data-hold="attack"]');
    const hold = (on) => (e) => { e.preventDefault(); e.stopPropagation(); this.atkBtn.classList.toggle('hl', on); this.callbacks.onAttack?.(on); };
    this.atkBtn.addEventListener('pointerdown', (e) => { try { this.atkBtn.setPointerCapture(e.pointerId); } catch (_) {} hold(true)(e); });
    ['pointerup', 'pointercancel', 'lostpointercapture'].forEach((ev) => this.atkBtn.addEventListener(ev, hold(false)));
    // «призрачный клик»: кнопка срабатывает на pointerdown и может открыть экран (лобби, книгу) — без этого
    // синтетический click после touchend попадёт в кнопку нового экрана под пальцем
    this.root.addEventListener('touchstart', (e) => { if (e.target.closest?.('.mc3d-tbtn')) e.preventDefault(); }, { passive: false });
    this.root.querySelectorAll('.mc3d-tbtn[data-act]').forEach((b) => {
      b.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const act = b.dataset.act;
        const fn = this.callbacks['on' + act[0].toUpperCase() + act.slice(1)];
        if (fn) fn(b.dataset.slot !== undefined ? Number(b.dataset.slot) : undefined);
      });
    });
  }

  setMode(mode) {
    if (!this.root) return;
    this.interactBtn.style.display = mode === 'run' ? 'none' : '';
    if (this.atkBtn) this.atkBtn.style.display = mode === 'run' ? 'none' : '';
    this.container.classList.toggle('mc-run', mode === 'run'); // в забеге рывок занимает место атаки (атака авто)
  }

  // Кнопки навыков (до 3): [{icon, name, cdLeft}]
  setAbilities(list) {
    if (!this.root) return;
    this.abBtns = this.abBtns || [...this.root.querySelectorAll('.mc3d-tbtn.ab')];
    this.abBtns.forEach((b, i) => {
      const a = list[i];
      b.style.display = a ? '' : 'none';
      if (!a) return;
      // те же пиксельные иконки, что и на панели действий; радиальная шторка перезарядки
      if (b.dataset.id !== a.id) { b.dataset.id = a.id; b.innerHTML = `${skillIcon(a.id, 36)}<div class="sw"></div><span class="cdt"></span>`; b.style.borderColor = radColor(a.rad || 0); }
      const left = Math.max(0, a.cdLeft || 0), tot = Math.max(0.01, a.cd || a.cdTotal || 1);
      const p = left > 0 ? Math.round(Math.min(1, left / tot) * 100) : 0;
      if (b._p !== p) { b._p = p; b.querySelector('.sw').style.background = p ? `conic-gradient(rgba(5,3,12,.72) ${p}%, transparent 0)` : 'none'; }
      const t = left > 0 ? String(Math.ceil(left)) : '';
      const ct = b.querySelector('.cdt'); if (ct.textContent !== t) ct.textContent = t;
      b.classList.toggle('cd', left > 0);
    });
  }

  setInteractHighlight(active) {
    if (!this.interactBtn) return;
    this.interactBtn.classList.toggle('hl', !!active);
  }

  getMoveVector() {
    return this.stickVector;
  }
}
