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
  constructor(container, callbacks = {}) {
    this.container = container;
    this.callbacks = callbacks;

    this.stickVector = { x: 0, y: 0 };
    this.touchId = null;
    this.isMapModalOpen = false;

    // Автоопределение мобильного устройства без привязки к пикселям
    this.isMobileTouch = isMobileDevice();

    if (!this.isMobileTouch) {
      return;
    }

    this.initDOM();
    this.bindEvents();
  }

  initDOM() {
    this.root = document.createElement('div');
    this.root.id = 'touch-controls-root';
    this.root.style.cssText = `
      position: absolute; inset: 0; pointer-events: none; z-index: 9999;
      font-family: monospace; user-select: none; -webkit-user-select: none;
    `;

    this.root.innerHTML = `
      <!-- Кнопка карты -->
      <button id="touch-btn-map" style="
        position: absolute; top: 56px; right: 14px; width: 44px; height: 44px;
        background: rgba(15, 11, 26, 0.85); border: 2px solid #8b5cf6; border-radius: 50%;
        color: #fff; font-size: 18px; display: flex; align-items: center; justify-content: center;
        pointer-events: auto; box-shadow: 0 0 10px rgba(139, 92, 246, 0.4);
      ">🗺️</button>

      <!-- Кнопка чата -->
      <button id="touch-btn-chat" style="
        position: absolute; top: 110px; right: 14px; width: 44px; height: 44px;
        background: rgba(15, 11, 26, 0.85); border: 2px solid #38bdf8; border-radius: 50%;
        color: #fff; font-size: 18px; display: flex; align-items: center; justify-content: center;
        pointer-events: auto; box-shadow: 0 0 10px rgba(56, 189, 248, 0.4);
      ">💬</button>

      <!-- Строка ввода чата -->
      <div id="touch-chat-overlay" style="
        display: none; position: absolute; bottom: 0; left: 0; right: 0;
        background: rgba(10, 8, 18, 0.96); border-top: 2px solid #ffd700;
        padding: 10px 14px; z-index: 10003; pointer-events: auto;
        gap: 8px; align-items: center; box-shadow: 0 -4px 20px rgba(0,0,0,0.8);
      ">
        <input id="touch-chat-input" type="text" placeholder="Введите сообщение..." maxlength="45" style="
          flex: 1; background: #161224; border: 1px solid #8b5cf6; border-radius: 6px;
          padding: 8px 12px; color: #fff; font-family: monospace; font-size: 14px; outline: none;
        " />
        <button id="touch-chat-send" style="
          background: #eab308; border: none; color: #000; font-weight: bold;
          font-family: monospace; padding: 8px 14px; border-radius: 6px; cursor: pointer;
        ">ОТПР.</button>
        <button id="touch-chat-close" style="
          background: #374151; border: none; color: #fff; font-weight: bold;
          font-family: monospace; padding: 8px 12px; border-radius: 6px; cursor: pointer;
        ">✕</button>
      </div>

      <!-- Модалка миникарты -->
      <div id="touch-map-modal" style="
        display: none; position: absolute; inset: 0; background: rgba(5, 4, 10, 0.85);
        align-items: center; justify-content: center; pointer-events: auto; z-index: 10002;
      ">
        <div style="background: #0e0c18; border: 2px solid #8b5cf6; border-radius: 8px; padding: 12px; display: flex; flex-direction: column; gap: 8px; max-width: 90%;">
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <span style="color: #ffd700; font-size: 12px; font-weight: bold;">МИНИ-КАРТА</span>
            <button id="touch-map-close" style="background: none; border: none; color: #94a3b8; font-size: 18px; cursor: pointer;">✕</button>
          </div>
          <div id="touch-map-slot"></div>
        </div>
      </div>

      <!-- Джойстик -->
      <div id="touch-joystick-base" style="
        position: absolute; bottom: 24px; left: 24px; width: 110px; height: 110px;
        background: rgba(14, 11, 24, 0.6); border: 2px solid rgba(139, 92, 246, 0.5);
        border-radius: 50%; pointer-events: auto; touch-action: none;
      ">
        <div id="touch-joystick-knob" style="
          position: absolute; top: 33px; left: 33px; width: 44px; height: 44px;
          background: rgba(168, 85, 247, 0.85); border: 2px solid #ffd700;
          border-radius: 50%; box-shadow: 0 0 12px rgba(255, 215, 0, 0.5);
          pointer-events: none; transition: transform 0.05s ease-out;
        "></div>
      </div>

      <!-- Кнопки действий -->
      <div style="position: absolute; bottom: 20px; right: 20px; width: 160px; height: 160px; pointer-events: none;">
        <button id="touch-btn-soul" style="
          position: absolute; top: 0; right: 80px; width: 48px; height: 48px;
          background: rgba(14, 11, 24, 0.85); border: 2px solid #38bdf8; border-radius: 50%;
          color: #38bdf8; font-weight: bold; font-size: 14px; pointer-events: auto;
          box-shadow: 0 0 10px rgba(56, 189, 248, 0.4);
        ">C</button>

        <button id="touch-btn-interact" style="
          position: absolute; top: 25px; right: 15px; width: 52px; height: 52px;
          background: rgba(14, 11, 24, 0.85); border: 2px solid #eab308; border-radius: 50%;
          color: #ffd700; font-weight: bold; font-size: 16px; pointer-events: auto;
          box-shadow: 0 0 12px rgba(234, 179, 8, 0.5);
        ">E</button>

        <button id="touch-btn-dash" style="
          position: absolute; bottom: 10px; right: 25px; width: 66px; height: 66px;
          background: rgba(88, 28, 135, 0.85); border: 2px solid #a855f7; border-radius: 50%;
          color: #fff; font-weight: bold; font-size: 13px; pointer-events: auto;
          box-shadow: 0 0 15px rgba(168, 85, 247, 0.6);
        ">РЫВОК</button>
      </div>
    `;

    this.container.appendChild(this.root);
  }

  bindEvents() {
    const base = this.root.querySelector('#touch-joystick-base');
    const knob = this.root.querySelector('#touch-joystick-knob');
    const radius = 38;

    const handleTouch = (touch) => {
      const rect = base.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;

      let dx = touch.clientX - centerX;
      let dy = touch.clientY - centerY;
      const dist = Math.hypot(dx, dy);

      if (dist > radius) {
        dx = (dx / dist) * radius;
        dy = (dy / dist) * radius;
      }

      knob.style.transform = `translate(${dx}px, ${dy}px)`;
      this.stickVector.x = dx / radius;
      this.stickVector.y = dy / radius;
    };

    base.addEventListener('touchstart', (e) => {
      e.preventDefault();
      const touch = e.changedTouches[0];
      this.touchId = touch.identifier;
      handleTouch(touch);
    }, { passive: false });

    window.addEventListener('touchmove', (e) => {
      if (this.touchId === null) return;
      for (let i = 0; i < e.changedTouches.length; i++) {
        if (e.changedTouches[i].identifier === this.touchId) {
          e.preventDefault();
          handleTouch(e.changedTouches[i]);
          break;
        }
      }
    }, { passive: false });

    const resetStick = (e) => {
      for (let i = 0; i < e.changedTouches.length; i++) {
        if (e.changedTouches[i].identifier === this.touchId) {
          this.touchId = null;
          knob.style.transform = `translate(0px, 0px)`;
          this.stickVector.x = 0;
          this.stickVector.y = 0;
          break;
        }
      }
    };

    window.addEventListener('touchend', resetStick);
    window.addEventListener('touchcancel', resetStick);

    const bindBtn = (id, cb) => {
      const btn = this.root.querySelector(id);
      if (!btn) return;
      btn.addEventListener('touchstart', (e) => {
        e.preventDefault();
        btn.style.transform = 'scale(0.92)';
        cb?.();
      }, { passive: false });

      btn.addEventListener('touchend', (e) => {
        e.preventDefault();
        btn.style.transform = 'scale(1)';
      }, { passive: false });
    };

    bindBtn('#touch-btn-dash', () => this.callbacks.onDash?.());
    bindBtn('#touch-btn-interact', () => this.callbacks.onInteract?.());
    bindBtn('#touch-btn-soul', () => this.callbacks.onSoul?.());

    const mapBtn = this.root.querySelector('#touch-btn-map');
    const mapModal = this.root.querySelector('#touch-map-modal');
    const mapClose = this.root.querySelector('#touch-map-close');

    mapBtn.onclick = () => {
      this.isMapModalOpen = true;
      mapModal.style.display = 'flex';
      this.callbacks.onToggleMap?.(true, this.root.querySelector('#touch-map-slot'));
    };

    mapClose.onclick = () => {
      this.isMapModalOpen = false;
      mapModal.style.display = 'none';
      this.callbacks.onToggleMap?.(false);
    };

    const chatBtn = this.root.querySelector('#touch-btn-chat');
    const chatOverlay = this.root.querySelector('#touch-chat-overlay');
    const chatInput = this.root.querySelector('#touch-chat-input');
    const chatSend = this.root.querySelector('#touch-chat-send');
    const chatClose = this.root.querySelector('#touch-chat-close');

    const submitChat = () => {
      const text = chatInput.value.trim();
      if (text.length > 0) {
        this.callbacks.onSendChat?.(text);
        chatInput.value = '';
      }
      chatOverlay.style.display = 'none';
      chatInput.blur();
    };

    chatBtn.onclick = () => {
      chatOverlay.style.display = 'flex';
      chatInput.focus();
    };

    chatSend.onclick = submitChat;
    chatClose.onclick = () => {
      chatOverlay.style.display = 'none';
      chatInput.blur();
    };

    chatInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        submitChat();
      }
    });
  }

  setInteractHighlight(active) {
    if (!this.root) return;
    const btn = this.root.querySelector('#touch-btn-interact');
    if (btn) {
      btn.style.borderColor = active ? '#22c55e' : '#eab308';
      btn.style.boxShadow = active ? '0 0 16px #22c55e' : '0 0 12px rgba(234, 179, 8, 0.5)';
    }
  }

  getMoveVector() {
    return this.stickVector;
  }
}