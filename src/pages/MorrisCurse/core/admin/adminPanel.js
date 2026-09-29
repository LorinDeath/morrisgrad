import { MapEditor } from './mapEditor.js';

export class AdminPanel {
  constructor(canvas, container, currentUserId, getWorldCallback) {
    this.canvas = canvas;
    this.container = container;
    this.currentUserId = currentUserId;
    this.getWorld = getWorldCallback;

    // Авторизованный Clerk ID
    this.targetAdminId = 'user_38QeREOr606p1c96P4f14YFsLp7';

    this.editor = new MapEditor(this.canvas, this.container, this.getWorld);

    if (this.currentUserId === this.targetAdminId) {
      this.initAdminButton();
    }
  }

  initAdminButton() {
    const btn = document.createElement('button');
    btn.id = 'admin-main-trigger-btn';
    btn.innerHTML = '⚡ АДМИН-ПАНЕЛЬ [F2]';
    btn.style.cssText = `
      position: absolute; top: 12px; left: 12px; z-index: 100005;
      background: rgba(14, 11, 26, 0.94); border: 1.5px solid #818cf8;
      box-shadow: 0 0 15px rgba(129, 140, 248, 0.4); color: #818cf8;
      font-family: monospace; font-size: 11px; font-weight: bold;
      padding: 6px 12px; border-radius: 6px; cursor: pointer;
      transition: all 0.2s ease;
    `;

    btn.onmouseover = () => { btn.style.background = '#4338ca'; btn.style.color = '#fff'; };
    btn.onmouseout = () => { btn.style.background = 'rgba(14, 11, 26, 0.94)'; btn.style.color = '#818cf8'; };

    btn.onclick = () => this.editor.toggle();
    this.container.appendChild(btn);

    // Горячая клавиша F2
    window.addEventListener('keydown', (e) => {
      if (e.key === 'F2') {
        e.preventDefault();
        this.editor.toggle();
      }
    });
  }

  render(ctx, camera) {
    if (this.editor) {
      this.editor.renderOverlay(ctx, camera);
    }
  }
}