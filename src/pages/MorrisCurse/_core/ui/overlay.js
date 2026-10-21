import { uiSfx } from './atmoUi.js';
import { uiTrans } from './uiSkin.js';
// DOM-слой поверх WebGL-канваса: подписи, пузыри чата, всплывающие цифры урона, тосты, подсказки,
// поле чата и полноэкранные экраны (кик / офлайн). Слой повторяет положение канваса внутри .game-screen.
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export { esc };
// Плашка роли перед именем: красная «Админ», зелёная «Модератор» (роль приходит с сервера)
const ROLE_TXT = { admin: 'Админ', moderator: 'Модератор' };
export function roleTag(role) { return ROLE_TXT[role] ? `<span class="mc-role ${role}">${ROLE_TXT[role]}</span>` : ''; }

export class Overlay {
  constructor(canvas, container) {
    this.canvas = canvas;
    this.container = container;
    this.layer = document.createElement('div');
    this.layer.className = 'mc3d-layer';
    container.appendChild(this.layer);
    this.labels = new Map();
    this.bubbles = new Map();
    this.floats = [];
    this.toastBox = document.createElement('div');
    this.toastBox.className = 'mc3d-toasts';
    this.layer.appendChild(this.toastBox);
    this.prompt = document.createElement('div');
    this.prompt.className = 'mc3d-prompt';
    this.prompt.style.display = 'none';
    this.layer.appendChild(this.prompt);
    this.chatBox = document.createElement('div');
    this.chatBox.className = 'mc3d-chat';
    this.chatBox.innerHTML = '<input type="text" maxlength="45" placeholder="Сообщение… (Enter — отправить, Esc — закрыть)" />';
    this.chatInput = this.chatBox.querySelector('input');
    this.layer.appendChild(this.chatBox);
    this.chatOpen = false;
    this.screen = null;
    this.syncRect();
  }

  // слой ровно над канвасом (канвас может быть flex-элементом между панелями HUD)
  syncRect() {
    const c = this.canvas;
    const l = this.layer.style;
    const left = c.offsetLeft + 'px', top = c.offsetTop + 'px', w = c.clientWidth + 'px', h = c.clientHeight + 'px';
    if (l.left !== left) l.left = left;
    if (l.top !== top) l.top = top;
    if (l.width !== w) l.width = w;
    if (l.height !== h) l.height = h;
    const compact = c.clientHeight < 480 || c.clientWidth < 360;
    if (compact !== this.compact) { this.compact = compact; this.layer.classList.toggle('mc3d-compact', compact); }
  }

  // --- подписи над объектами (вызывать каждый кадр; неиспользованные скрываются) ---
  beginFrame() { for (const l of this.labels.values()) l.used = false; }

  label(key, x, y, html, color = '#f1f5f9') {
    let l = this.labels.get(key);
    if (!l) {
      const el = document.createElement('div');
      el.className = 'mc3d-label';
      this.layer.appendChild(el);
      l = { el, html: '', color: '' };
      this.labels.set(key, l);
    }
    l.used = true;
    if (l.html !== html) { l.el.innerHTML = html; l.html = html; }
    if (l.color !== color) { l.el.style.color = color; l.color = color; }
    l.el.style.display = '';
    l.el.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px) translate(-50%, -100%)`;
    l.el.style.left = '0'; l.el.style.top = '0';
  }

  endFrame() {
    for (const [k, l] of this.labels) {
      if (!l.used) {
        if (l.idle === undefined) l.idle = 0;
        l.el.style.display = 'none';
        if (++l.idle > 600) { l.el.remove(); this.labels.delete(k); }
      } else l.idle = 0;
    }
  }

  // --- пузыри чата ---
  bubble(id, text, role) {
    const old = this.bubbles.get(id);
    if (old) old.el.remove();
    const el = document.createElement('div');
    el.className = 'mc3d-bubble';
    el.textContent = text;
    if (role && ROLE_TXT[role]) el.insertAdjacentHTML('afterbegin', roleTag(role) + ' ');
    this.layer.appendChild(el);
    this.bubbles.set(id, { el, until: performance.now() + 5000 });
  }

  placeBubble(id, x, y) {
    const b = this.bubbles.get(id);
    if (!b) return;
    if (performance.now() > b.until) { b.el.remove(); this.bubbles.delete(id); return; }
    b.el.style.left = '0'; b.el.style.top = '0';
    b.el.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px) translate(-50%, -100%)`;
  }

  cleanupBubbles(alive) {
    for (const [id, b] of this.bubbles) if (!alive.has(id) || performance.now() > b.until) { b.el.remove(); this.bubbles.delete(id); }
  }

  // --- всплывающий текст (урон, лечение) в 3D-координатах; позиция проецируется в updateFloats ---
  float(wx, wy, wz, text, color = '#fff', crit = false) {
    if (this.floats.length > 70) { const f = this.floats.shift(); f.el.remove(); }
    const el = document.createElement('div');
    el.className = 'mc3d-float' + (crit ? ' crit' : '');
    el.textContent = text;
    if (!crit) el.style.color = color;
    this.layer.appendChild(el);
    this.floats.push({ el, wx, wy, wz, t: 0, life: 0.8, dx: (Math.random() - 0.5) * 16 });
  }

  updateFloats(dt, project) {
    for (let i = this.floats.length - 1; i >= 0; i--) {
      const f = this.floats[i];
      f.t += dt;
      if (f.t >= f.life) { f.el.remove(); this.floats.splice(i, 1); continue; }
      const p = project(f.wx, f.wy, f.wz);
      if (!p) { f.el.style.display = 'none'; continue; }
      f.el.style.display = '';
      const k = f.t / f.life;
      f.el.style.left = '0'; f.el.style.top = '0';
      f.el.style.transform = `translate(${Math.round(p.x + f.dx * k)}px, ${Math.round(p.y - 30 * k)}px) translate(-50%, -50%)`;
      f.el.style.opacity = String(1 - k * k);
    }
  }

  clearFloats() { this.floats.forEach((f) => f.el.remove()); this.floats = []; }

  toast(text, color = '#f1f5f9') {
    const el = document.createElement('div');
    el.className = 'mc3d-toast';
    el.style.color = color;
    el.textContent = text;
    this.toastBox.appendChild(el);
    while (this.toastBox.children.length > 4) this.toastBox.firstChild.remove();
    setTimeout(() => el.remove(), 2700);
  }

  setPrompt(text) {
    if (!text) { if (this.prompt.style.display !== 'none') this.prompt.style.display = 'none'; return; }
    if (this.prompt.textContent !== text) this.prompt.textContent = text;
    this.prompt.style.display = '';
  }

  // поле чата всегда над панелью навыков (Q G F R Space ЛКМ) и прочими нижними кнопками: меряем их верх и поднимаем поле
  placeChat() {
    const box = this.chatBox; box.style.bottom = ''; box.style.top = '';
    const L = this.layer.getBoundingClientRect(), r = this.chatInput.getBoundingClientRect();
    let top = Infinity;
    for (const el of this.layer.querySelectorAll('.mc-abar, .mc3d-slots, .mc3d-abilities')) {
      const b = el.getBoundingClientRect(); if (!b.width || !b.height) continue;
      if (b.right > r.left && b.left < r.right && b.bottom > r.top) top = Math.min(top, b.top);
    }
    if (top < Infinity && top < r.bottom + 6) box.style.bottom = Math.max(8, Math.round(L.bottom - top + 8)) + 'px';
  }

  openChat(onSend) {
    if (this.chatOpen) return;
    this.chatOpen = true;
    this.chatBox.style.display = 'block';
    this.placeChat();
    this.chatInput.value = '';
    setTimeout(() => this.chatInput.focus(), 0);
    const finish = (send) => {
      this.chatInput.onkeydown = null;
      this.chatInput.onblur = null;
      const text = this.chatInput.value.trim();
      this.chatBox.style.display = 'none';
      this.chatOpen = false;
      if (send && text) onSend(text);
      this.canvas.focus?.();
    };
    this.chatInput.onkeydown = (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') { e.preventDefault(); finish(true); }
      else if (e.key === 'Escape') { e.preventDefault(); finish(false); }
    };
    this.chatInput.onblur = () => { if (this.chatOpen) finish(false); };
  }

  // Полноэкранный экран поверх игры (html + кнопки [{text, cls, onClick}])
  showScreen(html, buttons = [], cls = '') {
    // окно сменилось другим (вкладки, лобби) — без звука; появление: уже открытое окно — без анимации,
    // только что открытое (перерисовка через миг, пришёл список) — анимация продолжается с того же места
    const prev = this.screen, age = prev ? performance.now() - (prev._t || 0) : 0;
    this.hideScreen(true);
    const el = document.createElement('div');
    el.className = 'mc3d-screen ' + cls;
    el.innerHTML = html;
    if (buttons.length) {
      const row = document.createElement('div');
      row.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap;justify-content:center;';
      buttons.forEach((b) => {
        const btn = document.createElement('button');
        btn.className = 'mc3d-btn ' + (b.cls || '');
        btn.textContent = b.text;
        btn.onclick = (e) => { e.stopPropagation(); b.onClick?.(); };
        if (b.id) btn.id = b.id;
        row.appendChild(btn);
      });
      // новый интерфейс: кнопки лобби — внутри рамки окна (а не отдельной строкой под ним), всегда видны внизу окна
      const win = document.documentElement.classList.contains('mc-ui') && /\bmc-lobby-screen\b/.test(cls) ? el.querySelector('.mc-lobby') : null;
      if (win) { row.classList.add('mc-lobby-acts'); win.appendChild(row); } else el.appendChild(row);
    }
    el._t = prev && age < 400 ? prev._t : performance.now();
    if (prev && age >= 400) el.classList.add('mc-noanim');
    else if (prev) el.style.setProperty('--mc-tr-d', `-${Math.round(age)}ms`);
    if (!prev) uiSfx('open');
    this.layer.appendChild(el);
    this.screen = el;
    return el;
  }

  // instant — без «призрака» (showScreen меняет окно); иначе в новом интерфейсе окно плавно гаснет (ui-cursed.css §8)
  hideScreen(instant = false) {
    if (!this.screen) return;
    const el = this.screen; this.screen = null;
    if (instant || !uiTrans()) { el.remove(); if (!instant) uiSfx('close'); return; }
    uiSfx('close');
    // призрак: без id (getElementById находит только живые окна), без фокуса и кликов; удаляется по таймеру
    if (el.contains(document.activeElement)) document.activeElement.blur?.();
    el.querySelectorAll('[id]').forEach((n) => n.removeAttribute('id')); el.removeAttribute('id');
    el.classList.add('mc-ghost'); el.setAttribute('inert', ''); el.setAttribute('aria-hidden', 'true');
    const ms = (parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--mc-tr')) || 160) * 0.8 + 40;
    setTimeout(() => el.remove(), ms);
  }
}
