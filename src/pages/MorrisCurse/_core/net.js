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

export const PING_MS = 5000;

export class NetClient {
  constructor({ username, userId, getJoinState, getToken, guestId }) {
    this.username = username;
    this.userId = userId || '';
    this.getToken = getToken || null; // сессия Clerk → сервер проверяет подпись JWT (мета-прогрессия)
    this.guestId = guestId || '';
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
    // пинг раз в PING_MS (только для замера задержки; таймаутов на нём нет ни у клиента, ни у сервера).
    // Скрытая вкладка — не пингуем (каждое входящее сообщение — платный запрос DO); вернулись — пинг сразу.
    this.pingTimer = setInterval(() => this.sendPing(), PING_MS);
    if (typeof document !== 'undefined') document.addEventListener('visibilitychange', () => { if (!document.hidden) this.sendPing(); });
  }

  sendPing() {
    if (!this.isOpen() || this.kicked || (typeof document !== 'undefined' && document.hidden)) return;
    this.lastPingAt = performance.now();
    this.send({ type: 'ping' });
  }

  // Переподключение с новым токеном (вход/повторный вход в аккаунт во время игры, mcAuthGate): старый сокет закрываем
  // «тихо» (его onclose не уводит в офлайн), новый присылает join с текущей позицией (getJoinState) и свежим токеном.
  reconnect() {
    const old = this.socket;
    this.gen = (this.gen || 0) + 1;
    this.kicked = false; this.offline = false; this.connected = false;
    if (old) { old.__mcReplaced = true; try { old.close(1000, 'reauth'); } catch (_) {} }
    this.connect();
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
      if (!this.connected && socket === this.socket) this.goOffline('Сервер не отвечает');
    }, 6000);
    socket.onopen = async () => {
      clearTimeout(failTimer);
      this.connected = true;
      this.offline = false;
      let token = '';
      try { token = this.getToken ? (await this.getToken()) || '' : ''; } catch (_) { token = ''; }
      const st = this.getJoinState ? this.getJoinState() : {};
      this.send({
        type: 'join',
        userId: this.userId || '',
        username: this.username,
        x: Math.round(st.x || 600),
        y: Math.round(st.y || 600),
        stats: st.stats || {},
        token: token || undefined,
        guestId: this.guestId || undefined,
      });
      this.emit('open', {});
    };
    socket.onmessage = (event) => {
      if (socket !== this.socket) return;
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
      if (socket.__mcReplaced || socket !== this.socket) return; // заменён reconnect()
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
  // Лобби/экземпляры забегов (server/runs.ts)
  lobbyList(room) { return this.send({ type: 'lobby_list', room }); }
  lobbyCreate(room, portalId, opts = {}) { return this.send({ type: 'lobby_create', room, portalId: portalId || undefined, name: opts.name || undefined, isPublic: opts.isPublic !== false, autoStart: !!opts.autoStart }); }
  lobbyJoin(runId, portalId) { return this.send({ type: 'lobby_join', runId, portalId: portalId || undefined }); }
  lobbyReady(ready) { return this.send({ type: 'lobby_ready', ready: !!ready }); }
  lobbyStart() { return this.send({ type: 'lobby_start' }); }
  runLeave() { return this.send({ type: 'run_leave' }); }
  runDead(epoch, dead) { return this.send({ type: 'run_dead', epoch, dead: !!dead }); }
  runGiveUp(epoch) { return this.send({ type: 'run_giveup', epoch }); }
  runFinish(epoch) { return this.send({ type: 'run_finish', epoch }); }
  // epoch — эпоха экземпляра: сервер отбрасывает пакеты старой эпохи (после сброса/рестарта)
  runRelay(data, to, epoch) { return this.send(to ? { type: 'run_relay', data, to, epoch } : { type: 'run_relay', data, epoch }); }
}
