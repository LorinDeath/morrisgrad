import { MapEditor } from './mapEditor.js';

export class AdminPanel {
  constructor(canvas, container, currentUserId, getWorldCallback, onSwitchWorldCallback = null) {
    this.canvas = canvas;
    this.container = container;
    this.currentUserId = currentUserId;
    this.getWorld = getWorldCallback;
    this.onSwitchWorld = onSwitchWorldCallback;

    this.adminIds = [
      'user_38QeREOr606p1c96P4f14YFsLp7'
    ];

    const isTargetUser = this.adminIds.includes(this.currentUserId);
    const isTargetNick = (window.__CURRENT_USERNAME__ && window.__CURRENT_USERNAME__.trim().toLowerCase() === 'lorin death');

    this.editor = new MapEditor(this.canvas, this.container, this.getWorld, this.onSwitchWorld);

    if (isTargetUser || isTargetNick) {
      window.addEventListener('keydown', (e) => {
        if (e.key === 'F2') {
          e.preventDefault();
          this.editor.toggle();
        }
      });
    }
  }

  render(ctx, camera) {
    if (this.editor) {
      this.editor.renderOverlay(ctx, camera);
    }
  }
}