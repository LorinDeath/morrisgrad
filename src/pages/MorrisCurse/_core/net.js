// Сетевой слой: тот же WebSocket-протокол, что и у прежнего ядра (join/move/ping/chat/portal/class…),
// плюс новые сообщения co-op забегов (run_join / run_leave / run_relay).
// Если сервер недоступен — ядро продолжает работать офлайн (соло-забег).
const PROD_WS_URL = 'wss://morris-multiplayer.alexseylyou.workers.dev';

export function resolveWsUrl() {
  if (typeof window === 'undefined') return PROD_WS_URL;
  if (window.__MORRIS_WS_URL__) return window.__MORRIS_WS_URL__;
  // Локальная отладка: ?ws=ws://127.0.0.1:8787 работает только на localhost
  const host = window.location.hostname;
  if (host === 'localhost' || host === '127.0.0.1') {
    const q = new URLSearchParams(window.location.search).get('ws');
    if (q && /^wss?:\/\//.test(q)) return q;
  }
  return PROD_WS_URL;
}

export class NetClient {
  constructor({ username, userId, getJoinState }) {
    this.username = username;
    this.userId = userId || '';
    this.getJoinState = getJoinState;
    this.handlers = new Map();
    this.ping = 0;
    this.lastPingAt = 0;
    this.myId = null;
    this.connected = false;
    this.offline = false;
    this.kicked = false;
    this.url = resolveWsUrl();
    this.connect();
    this.pingTimer = setInterval(() => {
      if (this.isOpen() && !this.kicked) {
        this.lastPingAt = performance.now();
        this.send({ type: 'ping' });
      }
    }, 2000);
  }

  connect() {
    let socket;
    try {
      socket = new WebSocket(this.url);
    } catch (err) {
      this.goOffline('WebSocket недоступен');
      return;
    }
    this.socket = socket;
    const failTimer = setTimeout(() => {
      if (!this.connected) this.goOffline('Сервер не отвечает');
    }, 6000);
    socket.onopen = () => {
      clearTimeout(failTimer);
      this.connected = true;
      this.offline = false;
      const st = this.getJoinState ? this.getJoinState() : {};
      this.send({
        type: 'join',
        userId: this.userId || '',
        username: this.username,
        x: Math.round(st.x || 600),
        y: Math.round(st.y || 600),
        stats: st.stats || {},
      });
      this.emit('open', {});
    };
    socket.onmessage = (event) => {
      let data;
      try { data = JSON.parse(event.data); } catch (_) { return; }
      if (data.type === 'pong') {
        if (this.lastPingAt > 0) this.ping = Math.max(1, Math.round(performance.now() - this.lastPingAt));
        return;
      }
      if (data.type === 'welcome') this.myId = data.myId;
      if (data.type === 'kicked') {
        this.kicked = true;
        try { socket.close(); } catch (_) {}
      }
      this.emit(data.type, data);
      this.emit('*', data);
    };
    socket.onclose = () => {
      clearTimeout(failTimer);
      const wasConnected = this.connected;
      this.connected = false;
      if (!this.kicked) this.goOffline(wasConnected ? 'Соединение потеряно' : 'Нет связи с сервером');
    };
    socket.onerror = () => {};
  }

  goOffline(reason) {
    if (this.offline) return;
    this.offline = true;
    this.emit('offline', { reason });
  }

  isOpen() {
    return this.socket && this.socket.readyState === WebSocket.OPEN;
  }

  send(obj) {
    if (!this.isOpen()) return false;
    try { this.socket.send(JSON.stringify(obj)); return true; } catch (_) { return false; }
  }

  on(type, fn) {
    if (!this.handlers.has(type)) this.handlers.set(type, []);
    this.handlers.get(type).push(fn);
  }

  emit(type, data) {
    (this.handlers.get(type) || []).forEach((fn) => {
      try { fn(data); } catch (err) { console.error('[net]', type, err); }
    });
  }

  // --- co-op забеги ---
  runJoin(room, portalId) { return this.send({ type: 'run_join', room, portalId }); }
  runLeave() { return this.send({ type: 'run_leave' }); }
  runRelay(data, to) { return this.send(to ? { type: 'run_relay', data, to } : { type: 'run_relay', data }); }
}
