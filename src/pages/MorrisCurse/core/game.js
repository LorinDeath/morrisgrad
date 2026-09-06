import { DEFAULT_STATS, StatsUI } from './playerStats.js';
import { DuelManager } from './duelManager.js';

export function initGame(canvasId, username = 'Игрок', userId = '') {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  const VIEW_WIDTH = 300;
  const VIEW_HEIGHT = 300;
  const WORLD_SIZE = 1200;

  canvas.width = VIEW_WIDTH;
  canvas.height = VIEW_HEIGHT;

  let isKicked = false;
  let kickReason = '';

  let isTyping = false;
  let chatText = '';

  // Состояние порталов и интерфейса
  let worldPortals = [];
  let portalCooldown = false;
  let isModalOpen = false;
  let isGameRunning = false;

  // Параметры рывка (Dash)
  const dash = {
    active: false,
    timer: 0,
    duration: 0.22,
    speed: 620,
    cooldown: 0.9,
    cooldownTimer: 0,
    dirX: 0,
    dirY: 1
  };
  let lastFaceDir = { x: 0, y: 1 };

  // Характеристики игрока
  const player = {
    x: WORLD_SIZE / 2,
    y: WORLD_SIZE / 2,
    width: 16,
    height: 16,
    color: '#ffffff', // Белый по умолчанию (Дух)
    inDuel: false,    // Флаг нахождения в битве
    stats: { ...DEFAULT_STATS, moveSpeed: 175 },
    bubble: { text: '', expireAt: 0 }
  };

  let myNetworkId = null;
  const otherPlayers = new Map();

  function getGameContainer() {
    return document.fullscreenElement && document.fullscreenElement !== canvas
      ? document.fullscreenElement
      : (canvas.parentElement || document.body);
  }

  // Всплывающее уведомление (тост)
  function showToast(text) {
    const t = document.createElement('div');
    t.style.cssText = `
      position: absolute; top: 16px; left: 50%; transform: translateX(-50%);
      background: #ef4444; color: #fff; padding: 6px 14px; border-radius: 4px;
      font-family: monospace; font-size: 12px; z-index: 10020; box-shadow: 0 0 10px rgba(0,0,0,0.8);
    `;
    t.textContent = text;
    getGameContainer().appendChild(t);
    setTimeout(() => t.remove(), 3000);
  }

  // Менеджер дуэлей и WAP-сражений
  const duelManager = new DuelManager(getGameContainer(), (data) => {
    if (socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(data));
    }
  });

  // Модуль характеристик (передаём колбэк отправки приглашения на дуэль)
  const statsUI = new StatsUI(getGameContainer(), (targetId) => {
    if (socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type: 'duel_invite', targetId }));
    }
  });

  // --- ИНТЕРФЕЙС МИНИ-ИГР ---
  function initArcadeDOM() {
    let overlay = document.getElementById('arcade-overlay');
    const container = getGameContainer();

    if (getComputedStyle(container).position === 'static') {
      container.style.position = 'relative';
    }

    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'arcade-overlay';
      overlay.style.cssText = `
        display: none;
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
        background: rgba(5, 4, 10, 0.92);
        backdrop-filter: blur(8px);
        z-index: 99999;
        align-items: center;
        justify-content: center;
        font-family: monospace;
        box-sizing: border-box;
      `;

      overlay.innerHTML = `
        <button id="arcade-quick-exit" style="display: none; position: absolute; top: 12px; right: 12px; z-index: 100000; background: #dc2626; border: 1px solid #f87171; color: #fff; padding: 6px 14px; font-family: monospace; font-size: 12px; font-weight: bold; border-radius: 4px; cursor: pointer; box-shadow: 0 0 10px rgba(0,0,0,0.8);">✕ ВЫЙТИ [Esc]</button>

        <div id="arcade-card" style="background: #0e0c18; border: 2px solid #8b5cf6; border-radius: 10px; width: 92%; max-width: 520px; max-height: 90%; display: flex; flex-direction: column; padding: 20px; box-shadow: 0 0 35px rgba(139, 92, 246, 0.4); color: #fff; box-sizing: border-box;">
          <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #2e2642; padding-bottom: 12px; margin-bottom: 16px;">
            <div id="arcade-title" style="font-weight: bold; font-size: 16px; color: #c084fc; letter-spacing: 1px;">РАЗЛОМ</div>
            <button id="arcade-close-btn" style="background: transparent; border: none; color: #a1a1aa; font-size: 22px; cursor: pointer; line-height: 1; padding: 0 6px;">✕</button>
          </div>
          <div id="arcade-list" style="display: flex; flex-direction: column; gap: 10px; overflow-y: auto;"></div>
          <iframe id="arcade-frame" style="display: none; width: 100%; height: 100%; border: none; background: #000; border-radius: 4px;" src=""></iframe>
        </div>
      `;

      container.appendChild(overlay);

      document.getElementById('arcade-close-btn').onclick = closeArcadeModal;
      document.getElementById('arcade-quick-exit').onclick = backToGameList;
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay && !isGameRunning) closeArcadeModal();
      });
    } else if (overlay.parentElement !== container) {
      container.appendChild(overlay);
    }
  }

  function openArcadeModal(portalName, games) {
    initArcadeDOM();
    isModalOpen = true;
    isGameRunning = false;
    keys.w = keys.a = keys.s = keys.d = false;

    const overlay = document.getElementById('arcade-overlay');
    const title = document.getElementById('arcade-title');
    const list = document.getElementById('arcade-list');

    title.textContent = portalName || 'Разлом Мини-игр';
    list.innerHTML = '';
    backToGameList();

    (games || []).forEach((game) => {
      const isDisabled = Boolean(game.disabled);
      const item = document.createElement('div');

      item.style.cssText = `
        background: ${isDisabled ? '#12101b' : '#171326'};
        border: 1px solid ${isDisabled ? '#241e33' : '#30264b'};
        padding: 12px 14px;
        border-radius: 6px;
        display: flex;
        justify-content: space-between;
        align-items: center;
        ${isDisabled ? 'opacity: 0.4; filter: grayscale(100%);' : ''}
      `;

      item.innerHTML = `
        <div>
          <div style="font-weight: bold; color: ${isDisabled ? '#9ca3af' : '#facc15'}; font-size: 14px;">${game.title}</div>
          <div style="font-size: 11px; color: #a1a1aa; margin-top: 2px;">${game.desc}</div>
        </div>
        <button 
          ${isDisabled ? 'disabled' : ''} 
          style="
            background: ${isDisabled ? '#374151' : '#7c3aed'};
            border: none;
            padding: 6px 14px;
            border-radius: 4px;
            color: ${isDisabled ? '#9ca3af' : '#fff'};
            font-family: monospace;
            font-weight: bold;
            cursor: ${isDisabled ? 'not-allowed' : 'pointer'};
            pointer-events: ${isDisabled ? 'none' : 'auto'};
          "
        >
          ${isDisabled ? 'СКОРО' : 'ВОЙТИ'}
        </button>
      `;

      if (!isDisabled) {
        item.querySelector('button').onclick = () => launchGame(game.url);
      }

      list.appendChild(item);
    });

    overlay.style.display = 'flex';
  }

  function launchGame(url) {
    isGameRunning = true;
    const card = document.getElementById('arcade-card');
    const list = document.getElementById('arcade-list');
    const frame = document.getElementById('arcade-frame');
    const exitBtn = document.getElementById('arcade-quick-exit');

    card.style.width = '100%';
    card.style.height = '100%';
    card.style.maxWidth = '100%';
    card.style.maxHeight = '100%';
    card.style.borderRadius = '0';
    card.style.padding = '0';
    card.style.border = 'none';

    list.style.display = 'none';
    card.firstElementChild.style.display = 'none';

    frame.src = url;
    frame.style.display = 'block';
    exitBtn.style.display = 'block';
  }

  function backToGameList() {
    isGameRunning = false;
    const card = document.getElementById('arcade-card');
    const list = document.getElementById('arcade-list');
    const frame = document.getElementById('arcade-frame');
    const exitBtn = document.getElementById('arcade-quick-exit');

    card.style.width = '92%';
    card.style.maxWidth = '520px';
    card.style.height = 'auto';
    card.style.maxHeight = '90%';
    card.style.borderRadius = '10px';
    card.style.padding = '20px';
    card.style.border = '2px solid #8b5cf6';

    frame.src = '';
    frame.style.display = 'none';
    exitBtn.style.display = 'none';

    card.firstElementChild.style.display = 'flex';
    list.style.display = 'flex';
  }

  function closeArcadeModal() {
    backToGameList();
    const overlay = document.getElementById('arcade-overlay');
    if (overlay) overlay.style.display = 'none';
    isModalOpen = false;
    isGameRunning = false;
  }

  // --- WEBSOCKET ПОДКЛЮЧЕНИЕ ---
  const WS_URL = 'wss://morris-multiplayer.alexseylyou.workers.dev';
  const socket = new WebSocket(WS_URL);

  socket.onopen = () => {
    socket.send(JSON.stringify({
      type: 'join',
      userId: userId || username,
      username: username,
      x: Math.round(player.x),
      y: Math.round(player.y),
      stats: {
        classId: player.stats.classId,
        hp: player.stats.hp,
        maxHp: player.stats.maxHp,
        armor: player.stats.armor,
        attack: player.stats.attack,
      }
    }));
  };

  socket.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);

      if (data.type === 'kicked') {
        isKicked = true;
        kickReason = data.reason || 'Сессия закрыта';
        socket.close();
        return;
      }

      if (data.type === 'welcome') {
        myNetworkId = data.myId;
        if (data.portals) {
          worldPortals = data.portals;
        }
      }

      // Открытие меню выбора класса (Синий портал 565, 600)
      if (data.type === 'open_class_selection') {
        duelManager.openClassSelect();
      }

      // Обновление статов после выбора класса
      if (data.type === 'class_updated') {
        player.stats = { ...player.stats, ...data.stats };
        player.color = data.color;
      }

      // Входящий вызов на дуэль
      if (data.type === 'duel_incoming') {
        duelManager.showInvite(data.fromUsername, data.fromId);
      }

      // Уведомление об отказе от дуэли
      if (data.type === 'duel_declined_notify') {
        showToast(`${data.targetNick} отклонил вызов на дуэль.`);
      }

      // Старт дуэли
      if (data.type === 'duel_start') {
        player.inDuel = true;
        duelManager.startDuel(data.duel, myNetworkId);
      }

      // Обновление полосок HP и боевого лога WAP
      if (data.type === 'duel_update') {
        if (duelManager.currentDuel) {
          duelManager.me.hp = duelManager.me.id === duelManager.currentDuel.p1.id ? data.p1Hp : data.p2Hp;
          duelManager.opp.hp = duelManager.opp.id === duelManager.currentDuel.p1.id ? data.p1Hp : data.p2Hp;
          duelManager.updateDuelUI();
        }
        duelManager.addLog(data.log);
      }

      // Завершение боя
      if (data.type === 'duel_end') {
        player.inDuel = false;
        duelManager.endDuel(data.winnerName);
      }

      if (data.type === 'open_minigames_menu') {
        openArcadeModal(data.portalName, data.games);
      }

      if (data.type === 'chat_bubble') {
        const targetNick = (data.username || '').trim().toLowerCase();
        const myNick = (username || '').trim().toLowerCase();

        if (targetNick === myNick || (data.playerId && data.playerId === myNetworkId)) {
          player.bubble = { text: data.text, expireAt: Date.now() + 5000 };
          return;
        }

        let assigned = false;
        if (otherPlayers.has(targetNick)) {
          otherPlayers.get(targetNick).bubble = { text: data.text, expireAt: Date.now() + 5000 };
          assigned = true;
        }

        if (!assigned) {
          for (const other of otherPlayers.values()) {
            if (other.username && other.username.trim().toLowerCase() === targetNick) {
              other.bubble = { text: data.text, expireAt: Date.now() + 5000 };
              break;
            }
          }
        }
      }

      if (data.type === 'players_state') {
        const activeNicks = new Set();
        const myNameLower = (username || '').trim().toLowerCase();

        data.players.forEach((p) => {
          const pNameLower = (p.username || '').trim().toLowerCase();
          if (p.id === myNetworkId || pNameLower === myNameLower) {
            player.inDuel = Boolean(p.inDuel);
            if (p.color) player.color = p.color;
            return;
          }

          activeNicks.add(pNameLower);

          if (otherPlayers.has(pNameLower)) {
            const cur = otherPlayers.get(pNameLower);
            cur.targetX = p.x;
            cur.targetY = p.y;
            cur.username = p.username;
            cur.color = p.color || '#38bdf8';
            cur.inDuel = Boolean(p.inDuel);
            cur.stats = p.stats || DEFAULT_STATS;
          } else {
            otherPlayers.set(pNameLower, {
              id: p.id,
              x: p.x,
              y: p.y,
              targetX: p.x,
              targetY: p.y,
              username: p.username || 'Странник',
              color: p.color || '#38bdf8',
              inDuel: Boolean(p.inDuel),
              stats: p.stats || DEFAULT_STATS,
              width: 16,
              height: 16,
              bubble: { text: '', expireAt: 0 }
            });
          }
        });

        for (const nick of otherPlayers.keys()) {
          if (!activeNicks.has(nick)) otherPlayers.delete(nick);
        }
      }
    } catch (e) {}
  };

  let lastSentX = player.x;
  let lastSentY = player.y;

  setInterval(() => {
    // Во время дуэли координаты не шлём — игрок зафиксирован на месте
    if (!isKicked && socket.readyState === WebSocket.OPEN && !player.inDuel) {
      const curX = Math.round(player.x);
      const curY = Math.round(player.y);

      if (curX !== lastSentX || curY !== lastSentY) {
        lastSentX = curX;
        lastSentY = curY;
        socket.send(JSON.stringify({ type: 'move', x: curX, y: curY }));
      }
    }
  }, 66);

  const camera = {
    x: player.x,
    y: player.y,
    zoom: 0.5,
    targetZoom: 0.5,
    minZoom: 0.2,
    maxZoom: 1.5,
    smoothSpeed: 6
  };

  const keys = { w: false, a: false, s: false, d: false };

  // --- ОБРАБОТКА МЫШИ (ХОВЕР, СТАТЫ И КНОПКА ДУЭЛИ) ---
  canvas.addEventListener('mousemove', (e) => {
    if (isModalOpen || statsUI.isSoulOpen || player.inDuel) {
      statsUI.hideTooltip();
      return;
    }

    const rect = canvas.getBoundingClientRect();
    const screenX = (e.clientX - rect.left) * (canvas.width / rect.width);
    const screenY = (e.clientY - rect.top) * (canvas.height / rect.height);

    const mouseWorldX = (screenX - VIEW_WIDTH / 2) / camera.zoom + camera.x;
    const mouseWorldY = (screenY - VIEW_HEIGHT / 2) / camera.zoom + camera.y;

    let hovered = null;

    for (const p of otherPlayers.values()) {
      if (
        Math.abs(mouseWorldX - p.x) <= p.width &&
        Math.abs(mouseWorldY - p.y) <= p.height + 8
      ) {
        hovered = p;
        break;
      }
    }

    if (hovered) {
      statsUI.showTooltip(e.clientX - rect.left, e.clientY - rect.top, hovered, player);
    } else {
      statsUI.hideTooltip();
    }
  });

  canvas.addEventListener('mouseleave', () => statsUI.hideTooltip());

  window.addEventListener('keydown', (e) => {
    if (isKicked) return;

    if (e.key === 'Escape') {
      if (statsUI.isSoulOpen) {
        statsUI.toggleSoulModal(false);
        e.preventDefault();
        return;
      }
      if (isGameRunning) {
        backToGameList();
        e.preventDefault();
        return;
      }
      if (isModalOpen) {
        closeArcadeModal();
        e.preventDefault();
        return;
      }
      if (isTyping) {
        isTyping = false;
        chatText = '';
        e.preventDefault();
        return;
      }
    }

    // Клавиша [C] / [С] — Обитель Души / Меню Персонажа
    if ((e.key === 'c' || e.key === 'C' || e.key === 'с' || e.key === 'С') && !isTyping && !isModalOpen && !player.inDuel) {
      statsUI.toggleSoulModal(undefined, player.stats, username);
      e.preventDefault();
      return;
    }

    // Во время модалок или дуэли блокируем движение
    if (isModalOpen || statsUI.isSoulOpen || player.inDuel) return;

    // Активация рывка (Пробел или Shift)
    if ((e.code === 'Space' || e.key === ' ' || e.key === 'Shift') && !isTyping) {
      e.preventDefault();
      if (dash.cooldownTimer <= 0 && !dash.active) {
        dash.active = true;
        dash.timer = dash.duration;
        dash.cooldownTimer = dash.cooldown;

        let mx = 0;
        let my = 0;
        if (keys.w) my -= 1;
        if (keys.s) my += 1;
        if (keys.a) mx -= 1;
        if (keys.d) mx -= 1;

        if (mx !== 0 || my !== 0) {
          const len = Math.hypot(mx, my);
          dash.dirX = mx / len;
          dash.dirY = my / len;
        } else {
          dash.dirX = lastFaceDir.x;
          dash.dirY = lastFaceDir.y;
        }
      }
      return;
    }

    if (e.key === 'Enter') {
      e.preventDefault();

      if (!isTyping) {
        isTyping = true;
        chatText = '';
        keys.w = keys.a = keys.s = keys.d = false;
      } else {
        const msg = chatText.trim();
        if (msg.length > 0) {
          player.bubble = { text: msg, expireAt: Date.now() + 5000 };
          try {
            socket.send(JSON.stringify({ type: 'chat', text: msg }));
          } catch (_) {}
        }
        isTyping = false;
        chatText = '';
      }
      return;
    }

    if (isTyping) {
      if (e.key === 'Backspace') {
        chatText = chatText.slice(0, -1);
        e.preventDefault();
        return;
      }
      if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
        if (chatText.length < 35) {
          chatText += e.key;
        }
        e.preventDefault();
        return;
      }
      return;
    }

    const k = e.key.toLowerCase();
    if (k === 'w' || k === 'ц') keys.w = true;
    if (k === 'a' || k === 'ф') keys.a = true;
    if (k === 's' || k === 'ы') keys.s = true;
    if (k === 'd' || k === 'в') keys.d = true;

    if (e.key === '+' || e.key === '=' || e.code === 'NumpadAdd') {
      camera.targetZoom = Math.min(camera.maxZoom, camera.targetZoom + 0.2);
    }
    if (e.key === '-' || e.key === '_' || e.code === 'NumpadSubtract') {
      camera.targetZoom = Math.max(camera.minZoom, camera.targetZoom - 0.2);
    }
  });

  window.addEventListener('keyup', (e) => {
    if (isTyping || isModalOpen || statsUI.isSoulOpen || player.inDuel) return;
    const k = e.key.toLowerCase();
    if (k === 'w' || k === 'ц') keys.w = false;
    if (k === 'a' || k === 'ф') keys.a = false;
    if (k === 's' || k === 'ы') keys.s = false;
    if (k === 'd' || k === 'в') keys.d = false;
  });

  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    const delta = e.deltaY < 0 ? 0.15 : -0.15;
    camera.targetZoom = Math.max(camera.minZoom, Math.min(camera.maxZoom, camera.targetZoom + delta));
  }, { passive: false });

  function drawBubble(text, x, y, isSelf) {
    ctx.save();

    const targetFontPx = 13;
    const fontInWorld = targetFontPx / camera.zoom;
    ctx.font = `bold ${fontInWorld}px monospace`;

    const textMetrics = ctx.measureText(text);
    const padX = 10 / camera.zoom;
    const boxW = textMetrics.width + padX * 2;
    const boxH = 22 / camera.zoom;
    const boxX = x - boxW / 2;
    const boxY = y - boxH;

    ctx.fillStyle = 'rgba(10, 8, 18, 0.95)';
    ctx.strokeStyle = isSelf ? '#ffd700' : '#38bdf8';
    ctx.lineWidth = 1.5 / camera.zoom;
    ctx.fillRect(boxX, boxY, boxW, boxH);
    ctx.strokeRect(boxX, boxY, boxW, boxH);

    const tailH = 5 / camera.zoom;
    ctx.beginPath();
    ctx.moveTo(x - 4 / camera.zoom, boxY + boxH);
    ctx.lineTo(x, boxY + boxH + tailH);
    ctx.lineTo(x + 4 / camera.zoom, boxY + boxH);
    ctx.fillStyle = isSelf ? '#ffd700' : '#38bdf8';
    ctx.fill();

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.strokeStyle = '#050408';
    ctx.lineWidth = 2.5 / camera.zoom;
    ctx.strokeText(text, x, boxY + boxH / 2);

    ctx.fillStyle = '#ffffff';
    ctx.fillText(text, x, boxY + boxH / 2);
    ctx.restore();
  }

  let lastTime = performance.now();

  function loop(currentTime) {
    const dt = (currentTime - lastTime) / 1000;
    lastTime = currentTime;
    const now = Date.now();

    if (dash.cooldownTimer > 0) {
      dash.cooldownTimer = Math.max(0, dash.cooldownTimer - dt);
    }

    // Движение (блокируется во время дуэли)
    if (!isKicked && !isTyping && !isModalOpen && !statsUI.isSoulOpen && !player.inDuel) {
      if (dash.active) {
        player.x += dash.dirX * dash.speed * dt;
        player.y += dash.dirY * dash.speed * dt;

        dash.timer -= dt;
        if (dash.timer <= 0) {
          dash.active = false;
        }
      } else {
        let dx = 0;
        let dy = 0;
        if (keys.w) dy -= 1;
        if (keys.s) dy += 1;
        if (keys.a) dx -= 1;
        if (keys.d) dx += 1;

        if (dx !== 0 && dy !== 0) {
          dx *= 0.7071;
          dy *= 0.7071;
        }

        if (dx !== 0 || dy !== 0) {
          lastFaceDir.x = dx;
          lastFaceDir.y = dy;
        }

        player.x += dx * player.stats.moveSpeed * dt;
        player.y += dy * player.stats.moveSpeed * dt;
      }

      const halfW = player.width / 2;
      const halfH = player.height / 2;
      player.x = Math.max(halfW + 4, Math.min(WORLD_SIZE - halfW - 4, player.x));
      player.y = Math.max(halfH + 28, Math.min(WORLD_SIZE - halfH - 4, player.y));

      let nearAnyPortal = false;
      worldPortals.forEach((portal) => {
        const dist = Math.hypot(player.x - portal.x, player.y - portal.y);
        if (dist <= 48) {
          nearAnyPortal = true;
          if (!portalCooldown && socket.readyState === WebSocket.OPEN) {
            portalCooldown = true;
            socket.send(JSON.stringify({ type: 'use_portal', portalId: portal.id }));
          }
        }
      });

      if (!nearAnyPortal) {
        portalCooldown = false;
      }
    }

    camera.zoom += (camera.targetZoom - camera.zoom) * Math.min(1, 10 * dt);
    camera.x += (player.x - camera.x) * Math.min(1, camera.smoothSpeed * dt);
    camera.y += (player.y - camera.y) * Math.min(1, camera.smoothSpeed * dt);

    const halfViewW = (VIEW_WIDTH / 2) / camera.zoom;
    const halfViewH = (VIEW_HEIGHT / 2) / camera.zoom;

    camera.x = Math.max(halfViewW, Math.min(WORLD_SIZE - halfViewW, camera.x));
    camera.y = Math.max(halfViewH, Math.min(WORLD_SIZE - halfViewH, camera.y));

    // Фон
    ctx.fillStyle = '#050408';
    ctx.fillRect(0, 0, VIEW_WIDTH, VIEW_HEIGHT);

    ctx.save();
    ctx.translate(VIEW_WIDTH / 2, VIEW_HEIGHT / 2);
    ctx.scale(camera.zoom, camera.zoom);
    ctx.translate(-camera.x, -camera.y);

    // Сетка
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 0; x <= WORLD_SIZE; x += 40) { ctx.moveTo(x, 0); ctx.lineTo(x, WORLD_SIZE); }
    for (let y = 0; y <= WORLD_SIZE; y += 40) { ctx.moveTo(0, y); ctx.lineTo(WORLD_SIZE, y); }
    ctx.stroke();

    // Стены
    ctx.strokeStyle = '#a020f0';
    ctx.lineWidth = 4;
    ctx.strokeRect(2, 2, WORLD_SIZE - 4, WORLD_SIZE - 4);

    // --- СЛОЙ 1: ПОРТАЛЫ ---
    worldPortals.forEach((portal) => {
      const pw = portal.width || 32;
      const ph = portal.height || 32;
      const drawX = Math.max(6, Math.min(WORLD_SIZE - pw - 6, portal.x - pw / 2));
      const drawY = Math.max(6, Math.min(WORLD_SIZE - ph - 6, portal.y - ph / 2));
      const pulse = Math.sin(now / 200) * 3;

      ctx.save();
      ctx.shadowColor = portal.color || '#a855f7';
      ctx.shadowBlur = 12 + Math.abs(pulse);

      ctx.strokeStyle = portal.color || '#a855f7';
      ctx.lineWidth = 2;
      ctx.strokeRect(drawX - pulse / 2, drawY - pulse / 2, pw + pulse, ph + pulse);

      ctx.fillStyle = portal.color ? `${portal.color}99` : 'rgba(168, 85, 247, 0.65)';
      ctx.fillRect(drawX, drawY, pw, ph);

      ctx.shadowBlur = 0;
      const pFontSize = 12 / camera.zoom;
      ctx.font = `bold ${pFontSize}px monospace`;
      ctx.textAlign = 'center';
      ctx.strokeStyle = '#050408';
      ctx.lineWidth = 2.5 / camera.zoom;
      ctx.strokeText(`[ ${portal.name} ]`, drawX + pw / 2, drawY - 8 / camera.zoom);
      ctx.fillStyle = '#e9d5ff';
      ctx.fillText(`[ ${portal.name} ]`, drawX + pw / 2, drawY - 8 / camera.zoom);
      ctx.restore();
    });

    const halfW = player.width / 2;
    const halfH = player.height / 2;

    otherPlayers.forEach((p) => {
      p.x += (p.targetX - p.x) * Math.min(1, 15 * dt);
      p.y += (p.targetY - p.y) * Math.min(1, 15 * dt);
    });

    // --- СЛОЙ 2: ТЕЛА ДРУГИХ ПЕРСОНАЖЕЙ (ЦВЕТ КЛАССА) ---
    otherPlayers.forEach((p) => {
      ctx.fillStyle = p.color || '#38bdf8';
      ctx.fillRect(Math.round(p.x - halfW), Math.round(p.y - halfH), p.width, p.height);

      // Значок дуэли над головой противника
      if (p.inDuel) {
        ctx.font = `bold ${14 / camera.zoom}px monospace`;
        ctx.textAlign = 'center';
        ctx.fillText('⚔️', Math.round(p.x), Math.round(p.y - halfH - 18 / camera.zoom));
      }
    });

    // Свой персонаж
    if (dash.active) {
      ctx.save();
      ctx.shadowColor = '#eab308';
      ctx.shadowBlur = 12;
      ctx.strokeStyle = '#fef08a';
      ctx.lineWidth = 2;
      ctx.strokeRect(Math.round(player.x - halfW - 2), Math.round(player.y - halfH - 2), player.width + 4, player.height + 4);
      ctx.restore();
    }

    ctx.fillStyle = player.color || '#ffffff';
    ctx.fillRect(Math.round(player.x - halfW), Math.round(player.y - halfH), player.width, player.height);

    // Значок дуэли над своей головой
    if (player.inDuel) {
      ctx.font = `bold ${14 / camera.zoom}px monospace`;
      ctx.textAlign = 'center';
      ctx.fillText('⚔️', Math.round(player.x), Math.round(player.y - halfH - 18 / camera.zoom));
    }

    // --- СЛОЙ 3: НИКИ ПЕРСОНАЖЕЙ ---
    const nickFontSize = 12 / camera.zoom;
    ctx.font = `bold ${nickFontSize}px monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.lineWidth = 2.5 / camera.zoom;

    const nickOffsetY = halfH + (6 / camera.zoom);

    otherPlayers.forEach((p) => {
      ctx.strokeStyle = '#050408';
      ctx.strokeText(p.username, Math.round(p.x), Math.round(p.y - nickOffsetY));
      ctx.fillStyle = p.color || '#38bdf8';
      ctx.fillText(p.username, Math.round(p.x), Math.round(p.y - nickOffsetY));
    });

    ctx.strokeStyle = '#050408';
    ctx.strokeText(username, Math.round(player.x), Math.round(player.y - nickOffsetY));
    ctx.fillStyle = '#ffd700';
    ctx.fillText(username, Math.round(player.x), Math.round(player.y - nickOffsetY));

    // --- СЛОЙ 4: ЧАТ ---
    const bubbleOffsetY = halfH + (20 / camera.zoom);
    otherPlayers.forEach((p) => {
      if (p.bubble && p.bubble.expireAt > now) {
        drawBubble(p.bubble.text, p.x, p.y - bubbleOffsetY, false);
      }
    });

    if (player.bubble && player.bubble.expireAt > now) {
      drawBubble(player.bubble.text, player.x, player.y - bubbleOffsetY, true);
    }

    ctx.restore();

    // Статичный HUD
    const isBody = Boolean(player.stats && player.stats.classId);

    ctx.fillStyle = 'rgba(13, 10, 20, 0.75)';
    ctx.fillRect(8, 8, 148, 92);
    ctx.strokeStyle = '#332742';
    ctx.strokeRect(8, 8, 148, 92);
    ctx.font = '12px monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = '#a855f7';
    ctx.fillText(`Онлайн: ${otherPlayers.size + 1}`, 14, 24);
    ctx.fillStyle = '#ffd700';
    ctx.fillText(`Зум: x${camera.zoom.toFixed(1)} [+/-]`, 14, 40);
    ctx.fillStyle = '#cbd5e1';
    ctx.fillText(`X: ${Math.round(player.x)} | Y: ${Math.round(player.y)}`, 14, 56);

    if (dash.cooldownTimer <= 0) {
      ctx.fillStyle = '#4ade80';
      ctx.fillText(`Рывок: [Пробел]`, 14, 72);
    } else {
      ctx.fillStyle = '#94a3b8';
      ctx.fillText(`Рывок: ${dash.cooldownTimer.toFixed(1)}c`, 14, 72);
    }

    // Динамическая смена Душа [C] -> Персонаж [C] с цветом выбранного тела
    ctx.fillStyle = isBody ? (player.color || '#38bdf8') : '#38bdf8';
    ctx.fillText(isBody ? `Персонаж: [C]` : `Душа: [C]`, 14, 88);

    // Ввод чата
    if (isTyping) {
      const isCursorVisible = Math.floor(now / 500) % 2 === 0;

      ctx.fillStyle = 'rgba(10, 8, 18, 0.95)';
      ctx.fillRect(8, VIEW_HEIGHT - 36, VIEW_WIDTH - 16, 28);
      ctx.strokeStyle = '#ffd700';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(8, VIEW_HEIGHT - 36, VIEW_WIDTH - 16, 28);

      ctx.font = 'bold 13px monospace';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#ffd700';
      ctx.fillText('>', 14, VIEW_HEIGHT - 22);

      ctx.fillStyle = '#ffffff';
      ctx.fillText(chatText + (isCursorVisible ? '_' : ''), 30, VIEW_HEIGHT - 22);
    } else {
      ctx.font = '10px monospace';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'alphabetic';
      ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
      ctx.fillText('[Enter] Чат', VIEW_WIDTH - 10, VIEW_HEIGHT - 10);
    }

    if (isKicked) {
      ctx.fillStyle = 'rgba(5, 4, 8, 0.85)';
      ctx.fillRect(0, 0, VIEW_WIDTH, VIEW_HEIGHT);
      ctx.font = 'bold 13px monospace';
      ctx.fillStyle = '#ef4444';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('СВЯЗЬ РАЗОРВАНА', VIEW_WIDTH / 2, VIEW_HEIGHT / 2 - 10);
      ctx.font = '11px monospace';
      ctx.fillStyle = '#94a3b8';
      ctx.fillText(kickReason, VIEW_WIDTH / 2, VIEW_HEIGHT / 2 + 12);
      return;
    }

    requestAnimationFrame(loop);
  }

  requestAnimationFrame(loop);
}