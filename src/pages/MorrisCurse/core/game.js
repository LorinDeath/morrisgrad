import { DEFAULT_STATS, StatsUI } from './playerStats.js';
import { DuelManager } from './duelManager.js';
import { GameHUD } from './hud.js';
import {
  CAMPFIRE_CONFIG,
  SPRITE_CONFIG,
  SPRITES,
  campfireImg,
  keytImg,
  createArtDecoPattern,
  drawCharacterShadow,
  drawCharacterSprite,
  drawBossSprite
} from './sprites.js';

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

  let currentPing = 0;
  let lastPingTimestamp = 0;

  const floorPattern = createArtDecoPattern(ctx);

  let worldPortals = [];
  let isModalOpen = false;
  let isGameRunning = false;
  let activeNearPortal = null;

  // Плавный интерполированный объект Кейт
  const boss = {
    x: 700,
    y: 700,
    targetX: 700,
    targetY: 700,
    dirX: 0,
    dirY: 1,
    state: 'wander',
    isMoving: false,
    hp: 100,
    maxHp: 100,
    armor: 10,
    attack: 5,
    inDuel: false,
    bubble: { text: '', expireAt: 0 }
  };

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

  const player = {
    x: WORLD_SIZE / 2,
    y: WORLD_SIZE / 2,
    width: 32,
    height: 40,
    color: '#ffffff',
    inDuel: false,
    escapedUntil: 0,
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

  const duelManager = new DuelManager(getGameContainer(), (data) => {
    if (socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(data));
    }
  });

  const statsUI = new StatsUI(getGameContainer(), () => {});

  const hud = new GameHUD(
    canvas.parentElement || document.body,
    (targetId, targetNick) => {
      if (!player.stats.classId) {
        showToast('Для дуэли нужно выбрать тело у алтаря!');
        return;
      }
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: 'duel_invite', targetId }));
        showToast(`Вызов на дуэль отправлен ${targetNick}`);
      }
    },
    (side) => {
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: 'join_boss_fight', side }));
      }
    }
  );

  function canMove() {
    return !isKicked &&
           !isTyping &&
           !isModalOpen &&
           !statsUI.isSoulOpen &&
           !player.inDuel &&
           !(duelManager && duelManager.isAnyModalOpen());
  }

  function resetKeys() {
    keys.w = keys.a = keys.s = keys.d = false;
    dash.active = false;
  }

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
        display: none; position: absolute; inset: 0; width: 100%; height: 100%;
        background: rgba(5, 4, 10, 0.92); backdrop-filter: blur(8px); z-index: 99999;
        align-items: center; justify-content: center; font-family: monospace; box-sizing: border-box;
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
    resetKeys();

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
        background: ${isDisabled ? '#12101b' : '#171326'}; border: 1px solid ${isDisabled ? '#241e33' : '#30264b'};
        padding: 12px 14px; border-radius: 6px; display: flex; justify-content: space-between; align-items: center;
        ${isDisabled ? 'opacity: 0.4; filter: grayscale(100%);' : ''}
      `;

      item.innerHTML = `
        <div>
          <div style="font-weight: bold; color: ${isDisabled ? '#9ca3af' : '#facc15'}; font-size: 14px;">${game.title}</div>
          <div style="font-size: 11px; color: #a1a1aa; margin-top: 2px;">${game.desc}</div>
        </div>
        <button ${isDisabled ? 'disabled' : ''} style="background: ${isDisabled ? '#374151' : '#7c3aed'}; border: none; padding: 6px 14px; border-radius: 4px; color: ${isDisabled ? '#9ca3af' : '#fff'}; font-family: monospace; font-weight: bold; cursor: ${isDisabled ? 'not-allowed' : 'pointer'};">
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

    card.style.cssText = 'width: 100%; height: 100%; max-width: 100%; max-height: 100%; border-radius: 0; padding: 0; border: none;';
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

    card.style.cssText = 'background: #0e0c18; border: 2px solid #8b5cf6; border-radius: 10px; width: 92%; max-width: 520px; height: auto; max-height: 90%; display: flex; flex-direction: column; padding: 20px; box-shadow: 0 0 35px rgba(139, 92, 246, 0.4); color: #fff; box-sizing: border-box;';
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

  setInterval(() => {
    if (socket.readyState === WebSocket.OPEN && !isKicked) {
      lastPingTimestamp = performance.now();
      socket.send(JSON.stringify({ type: 'ping' }));
    }
  }, 2000);

  socket.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);

      if (data.type === 'pong') {
        if (lastPingTimestamp > 0) {
          currentPing = Math.max(1, Math.round(performance.now() - lastPingTimestamp));
        }
        return;
      }

      if (data.type === 'kicked') {
        isKicked = true;
        kickReason = data.reason || 'Сессия закрыта';
        socket.close();
        return;
      }
      if (data.type === 'welcome') {
        myNetworkId = data.myId;
        if (data.portals) worldPortals = data.portals;
      }
      if (data.type === 'open_class_selection') {
        resetKeys();
        duelManager.openClassSelect();
      }
      if (data.type === 'class_updated') {
        player.stats = { ...player.stats, ...data.stats };
        player.color = data.color;
      }
      if (data.type === 'duel_incoming') {
        resetKeys();
        duelManager.showInvite(data.fromUsername, data.fromId);
      }
      if (data.type === 'duel_declined_notify') {
        showToast(`${data.targetNick} отклонил вызов на дуэль.`);
      }

      if (data.type === 'duel_start') {
        player.inDuel = true;
        resetKeys();
        hud.clearTarget();
        duelManager.startDuel(data, myNetworkId, username);
      }

      if (data.type === 'duel_update') {
        duelManager.updateDuel(data);
      }

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

        if (data.playerId === 'boss_keyt' || targetNick === 'кейт') {
          boss.bubble = { text: data.text, expireAt: Date.now() + 4500 };
          return;
        }

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
        if (data.boss) {
          boss.targetX = data.boss.x;
          boss.targetY = data.boss.y;
          boss.dirX = data.boss.dirX;
          boss.dirY = data.boss.dirY;
          boss.state = data.boss.state;
          boss.hp = data.boss.hp;
          boss.maxHp = data.boss.maxHp;
          boss.armor = data.boss.armor;
          boss.attack = data.boss.attack;
          boss.inDuel = data.boss.inDuel;
          boss.duelId = data.boss.duelId;
        }

        const activeNicks = new Set();
        const myNameLower = (username || '').trim().toLowerCase();

        data.players.forEach((p) => {
          const pNameLower = (p.username || '').trim().toLowerCase();
          if (p.id === myNetworkId || pNameLower === myNameLower) {
            player.inDuel = Boolean(p.inDuel);
            if (p.escapedUntil) player.escapedUntil = p.escapedUntil;
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
            cur.escapedUntil = p.escapedUntil || 0;
            cur.stats = p.stats || DEFAULT_STATS;
          } else {
            otherPlayers.set(pNameLower, {
              id: p.id,
              x: p.x,
              y: p.y,
              targetX: p.x,
              targetY: p.y,
              dirX: 0,
              dirY: 1,
              username: p.username || 'Странник',
              color: p.color || '#38bdf8',
              inDuel: Boolean(p.inDuel),
              escapedUntil: p.escapedUntil || 0,
              stats: p.stats || DEFAULT_STATS,
              width: 32,
              height: 40,
              bubble: { text: '', expireAt: 0 }
            });
          }
        });

        for (const nick of otherPlayers.keys()) {
          if (!activeNicks.has(nick)) {
            if (hud.currentTarget && hud.currentTarget.username && hud.currentTarget.username.toLowerCase() === nick) {
              hud.clearTarget();
            }
            otherPlayers.delete(nick);
          }
        }
      }
    } catch (e) {}
  };

  let lastSentX = player.x;
  let lastSentY = player.y;

  setInterval(() => {
    if (!isKicked && socket.readyState === WebSocket.OPEN && canMove()) {
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
    smoothSpeed: 14
  };

  const keys = { w: false, a: false, s: false, d: false };
  window.addEventListener('blur', resetKeys);

  canvas.addEventListener('click', (e) => {
    if (!canMove()) return;

    const rect = canvas.getBoundingClientRect();
    const screenX = (e.clientX - rect.left) * (canvas.width / rect.width);
    const screenY = (e.clientY - rect.top) * (canvas.height / rect.height);

    const mouseWorldX = (screenX - VIEW_WIDTH / 2) / camera.zoom + camera.x;
    const mouseWorldY = (screenY - VIEW_HEIGHT / 2) / camera.zoom + camera.y;

    if (boss.state !== 'dead') {
      if (Math.abs(mouseWorldX - boss.x) <= 24 && Math.abs(mouseWorldY - boss.y) <= 28) {
        hud.setTarget({ ...boss, isBoss: true });
        return;
      }
    }

    for (const portal of worldPortals) {
      const pw = portal.width || 36;
      const ph = portal.height || 36;
      if (
        Math.abs(mouseWorldX - portal.x) <= pw / 2 + 10 &&
        Math.abs(mouseWorldY - portal.y) <= ph / 2 + 10
      ) {
        const dist = Math.hypot(player.x - portal.x, player.y - portal.y);
        if (dist <= 75 && socket.readyState === WebSocket.OPEN) {
          socket.send(JSON.stringify({ type: 'use_portal', portalId: portal.id }));
          return;
        } else if (dist > 75) {
          showToast('Подойдите ближе к объекту');
        }
        return;
      }
    }

    let clicked = null;
    for (const p of otherPlayers.values()) {
      if (
        Math.abs(mouseWorldX - p.x) <= SPRITE_CONFIG.drawWidth / 2 + 6 &&
        mouseWorldY >= p.y - SPRITE_CONFIG.drawHeight / 2 - 24 / camera.zoom &&
        mouseWorldY <= p.y + SPRITE_CONFIG.drawHeight / 2
      ) {
        if (p.escapedUntil && Date.now() < p.escapedUntil) {
          showToast('Игрок восстанавливается после побега');
          return;
        }
        clicked = p;
        break;
      }
    }

    if (clicked) {
      hud.setTarget(clicked);
    } else {
      hud.clearTarget();
    }
  });

  window.addEventListener('keydown', (e) => {
    if (isKicked) return;

    if (e.key === 'Escape') {
      if (duelManager && duelManager.isClassSelectOpen) {
        duelManager.closeClassSelect();
        resetKeys();
        e.preventDefault();
        return;
      }
      if (statsUI && statsUI.isSoulOpen) {
        statsUI.toggleSoulModal(false);
        resetKeys();
        e.preventDefault();
        return;
      }
      if (hud && hud.currentTarget) {
        hud.clearTarget();
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

    if ((e.key === 'e' || e.key === 'E' || e.key === 'у' || e.key === 'У') && !isTyping && canMove()) {
      if (activeNearPortal && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: 'use_portal', portalId: activeNearPortal.id }));
        e.preventDefault();
        return;
      }
    }

    if ((e.key === 'c' || e.key === 'C' || e.key === 'с' || e.key === 'С') && !isTyping && canMove()) {
      resetKeys();
      statsUI.toggleSoulModal(undefined, player.stats, username);
      e.preventDefault();
      return;
    }

    if ((e.code === 'Space' || e.key === ' ' || e.code === 'ShiftLeft' || e.code === 'ShiftRight' || e.key === 'Shift') && canMove()) {
      e.preventDefault();
      if (dash.cooldownTimer <= 0 && !dash.active) {
        let mx = 0;
        let my = 0;
        if (keys.w) my -= 1;
        if (keys.s) my += 1;
        if (keys.a) mx -= 1;
        if (keys.d) mx += 1;

        if (mx !== 0 || my !== 0) {
          const len = Math.hypot(mx, my);
          dash.dirX = mx / len;
          dash.dirY = my / len;
        } else if (lastFaceDir.x !== 0 || lastFaceDir.y !== 0) {
          const len = Math.hypot(lastFaceDir.x, lastFaceDir.y);
          dash.dirX = lastFaceDir.x / len;
          dash.dirY = lastFaceDir.y / len;
        } else {
          dash.dirX = 0;
          dash.dirY = 1;
        }

        dash.active = true;
        dash.timer = dash.duration;
        dash.cooldownTimer = dash.cooldown;
      }
      return;
    }

    if (e.key === 'Enter') {
      e.preventDefault();
      if (!isTyping) {
        isTyping = true;
        chatText = '';
        resetKeys();
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
        if (chatText.length < 35) chatText += e.key;
        e.preventDefault();
        return;
      }
      return;
    }

    if (!canMove()) return;

    const k = e.key.toLowerCase();
    if (k === 'w' || k === 'ц' || e.code === 'KeyW' || e.code === 'ArrowUp') keys.w = true;
    if (k === 'a' || k === 'ф' || e.code === 'KeyA' || e.code === 'ArrowLeft') keys.a = true;
    if (k === 's' || k === 'ы' || e.code === 'KeyS' || e.code === 'ArrowDown') keys.s = true;
    if (k === 'd' || k === 'в' || e.code === 'KeyD' || e.code === 'ArrowRight') keys.d = true;

    if (e.key === '+' || e.key === '=' || e.code === 'NumpadAdd') {
      camera.targetZoom = Math.min(camera.maxZoom, camera.targetZoom + 0.2);
    }
    if (e.key === '-' || e.key === '_' || e.code === 'NumpadSubtract') {
      camera.targetZoom = Math.max(camera.minZoom, camera.targetZoom - 0.2);
    }
  });

  window.addEventListener('keyup', (e) => {
    const k = e.key.toLowerCase();
    if (k === 'w' || k === 'ц' || e.code === 'KeyW' || e.code === 'ArrowUp') keys.w = false;
    if (k === 'a' || k === 'ф' || e.code === 'KeyA' || e.code === 'ArrowLeft') keys.a = false;
    if (k === 's' || k === 'ы' || e.code === 'KeyS' || e.code === 'ArrowDown') keys.s = false;
    if (k === 'd' || k === 'в' || e.code === 'KeyD' || e.code === 'ArrowRight') keys.d = false;
  });

  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    const delta = e.deltaY < 0 ? 0.15 : -0.15;
    camera.targetZoom = Math.max(camera.minZoom, Math.min(camera.maxZoom, camera.targetZoom + delta));
  }, { passive: false });

  function drawBubble(text, x, y, isSelf, strokeColor) {
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

    const borderColor = strokeColor || (isSelf ? '#ffd700' : '#38bdf8');

    ctx.fillStyle = 'rgba(10, 8, 18, 0.95)';
    ctx.strokeStyle = borderColor;
    ctx.lineWidth = 1.5 / camera.zoom;
    ctx.fillRect(boxX, boxY, boxW, boxH);
    ctx.strokeRect(boxX, boxY, boxW, boxH);

    const tailH = 5 / camera.zoom;
    ctx.beginPath();
    ctx.moveTo(x - 4 / camera.zoom, boxY + boxH);
    ctx.lineTo(x, boxY + boxH + tailH);
    ctx.lineTo(x + 4 / camera.zoom, boxY + boxH);
    ctx.fillStyle = borderColor;
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
    const dt = Math.min(0.04, (currentTime - lastTime) / 1000);
    lastTime = currentTime;
    const now = Date.now();

    if (dash.cooldownTimer > 0) {
      dash.cooldownTimer = Math.max(0, dash.cooldownTimer - dt);
    }

    let isMoving = false;

    if (canMove()) {
      if (dash.active) {
        player.x += dash.dirX * dash.speed * dt;
        player.y += dash.dirY * dash.speed * dt;
        isMoving = true;

        dash.timer -= dt;
        if (dash.timer <= 0) dash.active = false;
      } else {
        let dx = 0;
        let dy = 0;
        if (keys.w) dy -= 1;
        if (keys.s) dy += 1;
        if (keys.a) dx -= 1;
        if (keys.d) dx += 1;

        if (dx !== 0 || dy !== 0) {
          isMoving = true;
          if (dx !== 0 && dy !== 0) {
            dx *= 0.7071;
            dy *= 0.7071;
          }
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

      activeNearPortal = null;
      let minPortalDist = Infinity;
      worldPortals.forEach((portal) => {
        const dist = Math.hypot(player.x - portal.x, player.y - portal.y);
        if (dist <= 60 && dist < minPortalDist) {
          minPortalDist = dist;
          activeNearPortal = portal;
        }
      });
    }

    // Проверка реального движения Кейт по дельте координат
    if (boss.state !== 'dead') {
      const bDx = boss.targetX - boss.x;
      const bDy = boss.targetY - boss.y;
      const dist = Math.hypot(bDx, bDy);

      // Шагает ТОЛЬКО если есть физическое смещение > 0.8px и она не в бою
      boss.isMoving = dist > 0.8 && boss.state !== 'combat';

      if (dist > 0.5) {
        boss.dirX = bDx;
        boss.dirY = bDy;
      }

      boss.x += bDx * Math.min(1, 14 * dt);
      boss.y += bDy * Math.min(1, 14 * dt);
    } else {
      boss.isMoving = false;
    }

    hud.update({
      player,
      otherPlayers,
      boss,
      worldPortals,
      activeNearPortal,
      camera,
      dash,
      username,
      lastFaceDir,
      ping: currentPing
    });

    camera.zoom += (camera.targetZoom - camera.zoom) * Math.min(1, 10 * dt);
    camera.x += (player.x - camera.x) * Math.min(1, camera.smoothSpeed * dt);
    camera.y += (player.y - camera.y) * Math.min(1, camera.smoothSpeed * dt);

    const halfViewW = (VIEW_WIDTH / 2) / camera.zoom;
    const halfViewH = (VIEW_HEIGHT / 2) / camera.zoom;

    camera.x = Math.max(halfViewW, Math.min(WORLD_SIZE - halfViewW, camera.x));
    camera.y = Math.max(halfViewH, Math.min(WORLD_SIZE - halfViewH, camera.y));

    ctx.fillStyle = '#050408';
    ctx.fillRect(0, 0, VIEW_WIDTH, VIEW_HEIGHT);

    ctx.save();
    ctx.translate(VIEW_WIDTH / 2, VIEW_HEIGHT / 2);
    ctx.scale(camera.zoom, camera.zoom);
    ctx.translate(-camera.x, -camera.y);

    if (floorPattern) {
      ctx.fillStyle = floorPattern;
      ctx.fillRect(0, 0, WORLD_SIZE, WORLD_SIZE);
    } else {
      ctx.fillStyle = '#0c0a14';
      ctx.fillRect(0, 0, WORLD_SIZE, WORLD_SIZE);
    }

    ctx.fillStyle = 'rgba(12, 8, 24, 0.62)';
    ctx.fillRect(0, 0, WORLD_SIZE, WORLD_SIZE);

    const edgeGradient = ctx.createRadialGradient(
      WORLD_SIZE / 2, WORLD_SIZE / 2, WORLD_SIZE * 0.28,
      WORLD_SIZE / 2, WORLD_SIZE / 2, WORLD_SIZE * 0.72
    );
    edgeGradient.addColorStop(0, 'rgba(0, 0, 0, 0)');
    edgeGradient.addColorStop(1, 'rgba(4, 2, 8, 0.85)');
    ctx.fillStyle = edgeGradient;
    ctx.fillRect(0, 0, WORLD_SIZE, WORLD_SIZE);

    ctx.strokeStyle = '#c59b27';
    ctx.lineWidth = 3;
    ctx.strokeRect(2, 2, WORLD_SIZE - 4, WORLD_SIZE - 4);

    ctx.strokeStyle = 'rgba(245, 215, 127, 0.35)';
    ctx.lineWidth = 1;
    ctx.strokeRect(8, 8, WORLD_SIZE - 16, WORLD_SIZE - 16);

    worldPortals.forEach((p) => {
      if (p.id === 'portal_class_select') {
        ctx.save();
        ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
        ctx.beginPath();
        ctx.ellipse(p.x, p.y + 11, 16, 6, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    });

    otherPlayers.forEach((p) => drawCharacterShadow(ctx, p.x, p.y));
    if (boss.state !== 'dead') {
      drawCharacterShadow(ctx, boss.x, boss.y, 1.2);
    }
    drawCharacterShadow(ctx, player.x, player.y, dash.active ? 1.25 : 1);

    otherPlayers.forEach((p) => {
      const pDx = p.targetX - p.x;
      const pDy = p.targetY - p.y;
      const isOtherMoving = Math.hypot(pDx, pDy) > 0.6;
      if (isOtherMoving) {
        p.dirX = pDx;
        p.dirY = pDy;
      }
      p.x += pDx * Math.min(1, 14 * dt);
      p.y += pDy * Math.min(1, 14 * dt);
    });

    const entities = [];
    worldPortals.forEach((portal) => entities.push({ type: 'portal', y: portal.y, item: portal }));
    otherPlayers.forEach((p) => entities.push({ type: 'other_player', y: p.y, item: p }));
    if (boss.state !== 'dead') {
      entities.push({ type: 'boss', y: boss.y, item: boss });
    }
    entities.push({ type: 'self_player', y: player.y, item: player });

    entities.sort((a, b) => a.y - b.y);

    entities.forEach((ent) => {
      if (ent.type === 'portal') {
        const portal = ent.item;

        if (portal.id === 'portal_class_select') {
          ctx.save();
          const lightPulse = Math.sin(now / 180) * 5;
          const glow = ctx.createRadialGradient(portal.x, portal.y + 4, 3, portal.x, portal.y + 4, 52 + lightPulse);
          glow.addColorStop(0, 'rgba(168, 85, 247, 0.55)');
          glow.addColorStop(0.5, 'rgba(139, 92, 246, 0.18)');
          glow.addColorStop(1, 'rgba(0, 0, 0, 0)');
          ctx.fillStyle = glow;
          ctx.beginPath();
          ctx.arc(portal.x, portal.y + 4, 55 + lightPulse, 0, Math.PI * 2);
          ctx.fill();

          const drawW = CAMPFIRE_CONFIG.drawWidth;
          const drawH = 40;
          const drawX = portal.x - drawW / 2;
          const drawY = portal.y - drawH + 12;

          if (campfireImg.complete && campfireImg.naturalWidth > 0) {
            ctx.imageSmoothingEnabled = false;
            const frameW = campfireImg.naturalWidth / CAMPFIRE_CONFIG.cols;
            const frameH = campfireImg.naturalHeight / CAMPFIRE_CONFIG.rows;
            const currentFrame = Math.floor(now / CAMPFIRE_CONFIG.frameSpeed) % CAMPFIRE_CONFIG.cols;
            const sx = currentFrame * frameW;
            const sy = 0;

            ctx.filter = 'hue-rotate(240deg) saturate(1.8) brightness(1.1)';
            ctx.drawImage(campfireImg, sx, sy, frameW, frameH, drawX, drawY, drawW, drawH);
            ctx.filter = 'none';
          }
          ctx.restore();
          return;
        }

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
        ctx.restore();
        return;
      }

      // Отрисовка Кейт с передачей честного флага движения boss.isMoving
      if (ent.type === 'boss') {
        const b = ent.item;
        drawBossSprite(ctx, keytImg, b.x, b.y, b.dirX || 0, b.dirY || 1, Boolean(boss.isMoving), now);
        return;
      }

      if (ent.type === 'other_player') {
        const p = ent.item;
        const isOtherMoving = Math.hypot(p.targetX - p.x, p.targetY - p.y) > 0.6;
        const classId = p.stats?.classId;
        const targetSprite = (classId && SPRITES[classId]) ? SPRITES[classId] : SPRITES.soul;

        ctx.save();
        if (p.escapedUntil && now < p.escapedUntil) {
          ctx.globalAlpha = Math.floor(now / 150) % 2 === 0 ? 0.3 : 1.0;
        }

        drawCharacterSprite(ctx, targetSprite, p.x, p.y, p.dirX || 0, p.dirY || 1, isOtherMoving, now, p.color || '#38bdf8');
        ctx.restore();
        return;
      }

      if (ent.type === 'self_player') {
        const halfW = player.width / 2;
        const halfH = player.height / 2;

        if (dash.active) {
          ctx.save();
          ctx.shadowColor = '#eab308';
          ctx.shadowBlur = 12;
          ctx.strokeStyle = '#fef08a';
          ctx.lineWidth = 2;
          ctx.strokeRect(player.x - halfW - 2, player.y - halfH - 2, player.width + 4, player.height + 4);
          ctx.restore();
        }

        const myClassId = player.stats?.classId;
        const mySprite = (myClassId && SPRITES[myClassId]) ? SPRITES[myClassId] : SPRITES.soul;

        ctx.save();
        if (player.escapedUntil && now < player.escapedUntil) {
          ctx.globalAlpha = Math.floor(now / 150) % 2 === 0 ? 0.3 : 1.0;
        }

        drawCharacterSprite(ctx, mySprite, player.x, player.y, lastFaceDir.x, lastFaceDir.y, isMoving, now, player.color || '#ffffff');
        ctx.restore();
      }
    });

    const halfH = player.height / 2;

    worldPortals.forEach((portal) => {
      const pFontSize = 12 / camera.zoom;
      ctx.font = `bold ${pFontSize}px monospace`;
      ctx.textAlign = 'center';
      ctx.strokeStyle = '#050408';
      ctx.lineWidth = 2.5 / camera.zoom;

      if (portal.id === 'portal_class_select') {
        const drawY = portal.y - 40 + 12;
        ctx.strokeText(`[ Алтарь Перевоплощения ]`, portal.x, drawY - 6 / camera.zoom);
        ctx.fillStyle = '#e9d5ff';
        ctx.fillText(`[ Алтарь Перевоплощения ]`, portal.x, drawY - 6 / camera.zoom);

        if (activeNearPortal && activeNearPortal.id === portal.id) {
          const badgeY = drawY - 22 / camera.zoom;
          ctx.fillStyle = 'rgba(13, 10, 24, 0.92)';
          ctx.strokeStyle = '#a855f7';
          ctx.lineWidth = 1.5 / camera.zoom;
          const bw = 120 / camera.zoom;
          const bh = 18 / camera.zoom;
          ctx.fillRect(portal.x - bw / 2, badgeY - bh / 2, bw, bh);
          ctx.strokeRect(portal.x - bw / 2, badgeY - bh / 2, bw, bh);
          ctx.font = `bold ${10 / camera.zoom}px monospace`;
          ctx.fillStyle = '#facc15';
          ctx.fillText(`[E] или Клик: Тело`, portal.x, badgeY + 3 / camera.zoom);
        }
      } else {
        const pw = portal.width || 32;
        const ph = portal.height || 32;
        const drawX = Math.max(6, Math.min(WORLD_SIZE - pw - 6, portal.x - pw / 2));
        const drawY = Math.max(6, Math.min(WORLD_SIZE - ph - 6, portal.y - ph / 2));

        ctx.strokeText(`[ ${portal.name} ]`, drawX + pw / 2, drawY - 8 / camera.zoom);
        ctx.fillStyle = '#e9d5ff';
        ctx.fillText(`[ ${portal.name} ]`, drawX + pw / 2, drawY - 8 / camera.zoom);

        if (activeNearPortal && activeNearPortal.id === portal.id) {
          const badgeY = drawY - 24 / camera.zoom;
          ctx.fillStyle = 'rgba(13, 10, 24, 0.92)';
          ctx.strokeStyle = '#38bdf8';
          ctx.lineWidth = 1.5 / camera.zoom;
          const bw = 100 / camera.zoom;
          const bh = 18 / camera.zoom;
          ctx.fillRect(drawX + pw / 2 - bw / 2, badgeY - bh / 2, bw, bh);
          ctx.strokeRect(drawX + pw / 2 - bw / 2, badgeY - bh / 2, bw, bh);
          ctx.font = `bold ${10 / camera.zoom}px monospace`;
          ctx.fillStyle = '#38bdf8';
          ctx.fillText(`[E] Войти`, drawX + pw / 2, badgeY + 3 / camera.zoom);
        }
      }
    });

    if (boss.state !== 'dead') {
      const bossNickOffsetY = halfH + (12 / camera.zoom);
      ctx.font = `bold ${12 / camera.zoom}px monospace`;
      ctx.textAlign = 'center';
      ctx.strokeStyle = '#050408';
      ctx.lineWidth = 2.5 / camera.zoom;
      ctx.strokeText('Кейт [БОСС]', Math.round(boss.x), Math.round(boss.y - bossNickOffsetY));
      ctx.fillStyle = '#f472b6';
      ctx.fillText('Кейт [БОСС]', Math.round(boss.x), Math.round(boss.y - bossNickOffsetY));

      if (boss.inDuel) {
        ctx.font = `bold ${15 / camera.zoom}px monospace`;
        ctx.fillText('⚔️', Math.round(boss.x), Math.round(boss.y - halfH - 26 / camera.zoom));
      }
    }

    otherPlayers.forEach((p) => {
      if (p.inDuel) {
        ctx.font = `bold ${15 / camera.zoom}px monospace`;
        ctx.textAlign = 'center';
        ctx.fillText('⚔️', Math.round(p.x), Math.round(p.y - halfH - 24 / camera.zoom));
      }
    });

    if (player.inDuel) {
      ctx.font = `bold ${15 / camera.zoom}px monospace`;
      ctx.textAlign = 'center';
      ctx.fillText('⚔️', Math.round(player.x), Math.round(player.y - halfH - 24 / camera.zoom));
    }

    const nickFontSize = 12 / camera.zoom;
    ctx.font = `bold ${nickFontSize}px monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.lineWidth = 2.5 / camera.zoom;

    const nickOffsetY = halfH + (10 / camera.zoom);

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

    const bubbleOffsetY = halfH + (26 / camera.zoom);

    if (boss.bubble && boss.bubble.expireAt > now && boss.state !== 'dead') {
      drawBubble(boss.bubble.text, boss.x, boss.y - bubbleOffsetY, false, '#f472b6');
    }

    otherPlayers.forEach((p) => {
      if (p.bubble && p.bubble.expireAt > now) {
        drawBubble(p.bubble.text, p.x, p.y - bubbleOffsetY, false);
      }
    });

    if (player.bubble && player.bubble.expireAt > now) {
      drawBubble(player.bubble.text, player.x, player.y - bubbleOffsetY, true);
    }

    ctx.restore();

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