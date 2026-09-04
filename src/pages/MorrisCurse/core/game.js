export function initGame(canvasId, username = 'Игрок', userId = null) {
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

  const player = {
    x: WORLD_SIZE / 2,
    y: WORLD_SIZE / 2,
    width: 16,
    height: 16,
    stats: { moveSpeed: 175 }
  };

  let myNetworkId = null;
  const otherPlayers = new Map();

  const WS_URL = 'wss://morris-multiplayer.alexseylyou.workers.dev';
  const socket = new WebSocket(WS_URL);

  socket.onopen = () => {
    // Отправляем уникальный ID (или ник, если ID отсутствует)
    socket.send(JSON.stringify({
      type: 'join',
      userId: userId || username,
      username: username,
      x: Math.round(player.x),
      y: Math.round(player.y)
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
      }

      if (data.type === 'players_state') {
        const activeIds = new Set();

        data.players.forEach((p) => {
          if (p.id === myNetworkId) return;
          activeIds.add(p.id);

          if (otherPlayers.has(p.id)) {
            const cur = otherPlayers.get(p.id);
            cur.targetX = p.x;
            cur.targetY = p.y;
            cur.username = p.username;
          } else {
            otherPlayers.set(p.id, {
              x: p.x,
              y: p.y,
              targetX: p.x,
              targetY: p.y,
              username: p.username || 'Странник',
              width: 16,
              height: 16
            });
          }
        });

        for (const id of otherPlayers.keys()) {
          if (!activeIds.has(id)) otherPlayers.delete(id);
        }
      }
    } catch (e) {}
  };

  let lastSentX = player.x;
  let lastSentY = player.y;

  setInterval(() => {
    if (!isKicked && socket.readyState === WebSocket.OPEN) {
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
    zoom: 1.0,
    targetZoom: 1.0,
    minZoom: 0.5,
    maxZoom: 2.0,
    smoothSpeed: 6
  };

  const keys = { w: false, a: false, s: false, d: false };

  window.addEventListener('keydown', (e) => {
    if (isKicked) return;
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

  let lastTime = performance.now();

  function loop(currentTime) {
    const dt = (currentTime - lastTime) / 1000;
    lastTime = currentTime;

    if (!isKicked) {
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

      player.x += dx * player.stats.moveSpeed * dt;
      player.y += dy * player.stats.moveSpeed * dt;

      const halfW = player.width / 2;
      const halfH = player.height / 2;
      player.x = Math.max(halfW + 4, Math.min(WORLD_SIZE - halfW - 4, player.x));
      player.y = Math.max(halfH + 28, Math.min(WORLD_SIZE - halfH - 4, player.y));
    }

    camera.zoom += (camera.targetZoom - camera.zoom) * Math.min(1, 10 * dt);
    camera.x += (player.x - camera.x) * Math.min(1, camera.smoothSpeed * dt);
    camera.y += (player.y - camera.y) * Math.min(1, camera.smoothSpeed * dt);

    const halfViewW = (VIEW_WIDTH / 2) / camera.zoom;
    const halfViewH = (VIEW_HEIGHT / 2) / camera.zoom;

    camera.x = Math.max(halfViewW, Math.min(WORLD_SIZE - halfViewW, camera.x));
    camera.y = Math.max(halfViewH, Math.min(WORLD_SIZE - halfViewH, camera.y));

    // Отрисовка мира
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

    const halfW = player.width / 2;
    const halfH = player.height / 2;

    // Другие игроки
    otherPlayers.forEach((p) => {
      p.x += (p.targetX - p.x) * Math.min(1, 15 * dt);
      p.y += (p.targetY - p.y) * Math.min(1, 15 * dt);

      ctx.fillStyle = '#38bdf8';
      ctx.fillRect(Math.round(p.x - halfW), Math.round(p.y - halfH), p.width, p.height);

      ctx.font = 'bold 20px monospace';
      ctx.textAlign = 'center';
      ctx.strokeStyle = '#050408';
      ctx.lineWidth = 3;
      ctx.strokeText(p.username, Math.round(p.x), Math.round(p.y - halfH - 8));
      ctx.fillStyle = '#38bdf8';
      ctx.fillText(p.username, Math.round(p.x), Math.round(p.y - halfH - 8));
    });

    // Свой персонаж
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(Math.round(player.x - halfW), Math.round(player.y - halfH), player.width, player.height);

    ctx.font = 'bold 20px monospace';
    ctx.textAlign = 'center';
    ctx.strokeStyle = '#050408';
    ctx.lineWidth = 3;
    ctx.strokeText(username, Math.round(player.x), Math.round(player.y - halfH - 8));
    ctx.fillStyle = '#ffd700';
    ctx.fillText(username, Math.round(player.x), Math.round(player.y - halfH - 8));

    ctx.restore();

    // Плашка UI
    ctx.fillStyle = 'rgba(13, 10, 20, 0.75)';
    ctx.fillRect(8, 8, 140, 62);
    ctx.strokeStyle = '#332742';
    ctx.strokeRect(8, 8, 140, 62);
    ctx.font = '12px monospace';
    ctx.textAlign = 'left';
    ctx.fillStyle = '#a855f7';
    ctx.fillText(`Онлайн: ${otherPlayers.size + 1}`, 14, 24);
    ctx.fillStyle = '#ffd700';
    ctx.fillText(`Зум: x${camera.zoom.toFixed(1)} [+/-]`, 14, 40);
    ctx.fillStyle = '#cbd5e1';
    ctx.fillText(`X: ${Math.round(player.x)} | Y: ${Math.round(player.y)}`, 14, 56);

    // Оверлей отключения, если игрока кикнуло
    if (isKicked) {
      ctx.fillStyle = 'rgba(5, 4, 8, 0.85)';
      ctx.fillRect(0, 0, VIEW_WIDTH, VIEW_HEIGHT);
      ctx.font = 'bold 13px monospace';
      ctx.fillStyle = '#ef4444';
      ctx.textAlign = 'center';
      ctx.fillText('СВЯЗЬ РАЗОРВАНА', VIEW_WIDTH / 2, VIEW_HEIGHT / 2 - 10);
      ctx.font = '11px monospace';
      ctx.fillStyle = '#94a3b8';
      ctx.fillText(kickReason, VIEW_WIDTH / 2, VIEW_HEIGHT / 2 + 12);
      return; // Останавливаем цикл
    }

    requestAnimationFrame(loop);
  }

  requestAnimationFrame(loop);
}