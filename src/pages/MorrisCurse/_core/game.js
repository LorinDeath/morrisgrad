// «Проклятые» — 3D-ядро. Точка входа прежняя: initGame(canvasId, username, userId) (импортируется index.astro).
//
// Хаб: общий мир сервера (Адское Пламя / Аринар) в 3D, тот же WebSocket-протокол (join/move/use_portal/...).
// Забег: Vampire Survivors-подобный режим в отдельной 3D-арене; вход через порталы-комнаты (run_join),
// co-op синхронизация через run_relay (ведущий — авторитет орды). См. survivors/run.js.
import { loadThree } from './engine/three-loader.js';
import { Stage } from './engine/stage.js';
import { toX, toZ, toPx, toPy } from './engine/geometry.js';
import { initModelMode, preloadCharacterSheets, modelMode } from './engine/characters.js';
import { NetClient } from './net.js';
import { HubWorld } from './hub/hubWorld.js';
import { RunSession } from './survivors/run.js';
import { RunView } from './survivors/runView.js';
import { RunArena } from './survivors/arena.js';
import { RUN_ROOMS, RUN_CLASSES, ENEMIES, displayClassName } from './survivors/data.js';
import { Overlay, esc } from './ui/overlay.js';
import { RunUI } from './ui/runUI.js';
import { ClassSelect } from './ui/classSelect.js';
import { GameHUD } from './hud.js';
import { TouchControls, isMobileDevice } from './touchControls.js';
import { StatsUI, DEFAULT_STATS } from './playerStats.js';
import { CLASSES, syncClassesFromServer } from './classes.js';
import { AdminPanel } from './admin/adminPanel.js';
import { WORLD_PORTALS as OFFLINE_PORTALS } from '../../../../server/worlds/portals.ts';
import { CHARACTER_CLASSES as OFFLINE_CLASSES } from '../../../../server/classes.ts';
import './styles/core3d.css';

const WORLD_SIZE = 1200;
const MOVE_SPEED = 175; // px/с, как в 2D-версии
const DASH = { duration: 0.22, speed: 620, cooldown: 0.9 };
const PORTAL_RANGE = 85; // как проверка сервера
const FLOWER_RANGE = 120;
const ADMIN_IDS = ['user_38QeREOr606p1c96P4f14YFsLp7'];

export function initGame(canvasId, username = 'Игрок', userId = '') {
  if (window.__MC3D_GAME__) return window.__MC3D_GAME__;
  const api = { ready: null };
  window.__MC3D_GAME__ = api;
  api.ready = boot(canvasId, username || 'Игрок', userId || '', api).catch((err) => {
    console.error('[MorrisCurse 3D] не удалось запустить игру', err);
    const canvas = document.getElementById(canvasId);
    const host = canvas?.parentElement;
    if (host) {
      const box = document.createElement('div');
      box.style.cssText = 'position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:#fca5a5;font:12px monospace;text-align:center;padding:16px;z-index:40;background:#050408';
      box.textContent = 'Не удалось запустить 3D (WebGL недоступен?). ' + (err?.message || '');
      host.appendChild(box);
    }
  });
  return api;
}

async function boot(canvasId, username, userId, api) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) throw new Error(`canvas #${canvasId} не найден`);
  const container = canvas.parentElement || document.body;
  if (getComputedStyle(container).position === 'static') container.style.position = 'relative';
  const mobile = isMobileDevice() || /[?&]mobile=1/.test(location.search);
  canvas.classList.add('mc3d-canvas');
  if (mobile) container.classList.add('mc3d-mobile');
  window.__CURRENT_USERNAME__ = username;

  const overlay = new Overlay(canvas, container);
  overlay.showScreen('<h2>ПРОКЛЯТЫЕ</h2><p>Загрузка 3D-мира…</p>', [], 'mc3d-loading');

  const THREE = await loadThree();
  initModelMode();
  await preloadCharacterSheets();
  const stage = new Stage(THREE, canvas, { mobile });
  overlay.hideScreen();

  // ---------------- состояние ----------------
  const player = {
    x: WORLD_SIZE / 2 + 60, y: WORLD_SIZE / 2 + 40, color: '#ffffff', dirX: 0, dirY: 1, moving: false,
    stats: { ...DEFAULT_STATS }, shield: 0, inDuel: false,
  };
  const dash = { active: false, timer: 0, cd: 0, max: DASH.cooldown, dirX: 0, dirY: 1 };
  let world = 'hellfire';
  let portals = OFFLINE_PORTALS.slice();
  let myId = null;
  let isAdmin = ADMIN_IDS.includes(userId) || username.trim().toLowerCase() === 'lorin death';
  const others = new Map(); // id → player
  let boss = null, dar = null;
  const flowers = new Map();
  let mode = 'hub';
  let run = null, runView = null, runRoom = null, runHostId = null, helloSent = false;
  let roomCounts = {};
  let offlineToastShown = false;

  if (!Object.keys(CLASSES).length) {
    syncClassesFromServer(Object.fromEntries(Object.values(OFFLINE_CLASSES).map((c) => [c.id, { id: c.id, name: c.name, color: c.color, ...c.stats }])));
  }

  const hub = new HubWorld(THREE, stage);
  hub.setWorld(world, portals);
  hub.attach();

  // ---------------- сеть ----------------
  const net = new NetClient({
    username, userId,
    getJoinState: () => ({
      x: player.x, y: player.y,
      stats: { classId: player.stats.classId, hp: player.stats.hp, maxHp: player.stats.maxHp, armor: player.stats.armor, attack: player.stats.attack },
    }),
  });
  api.net = net;
  const send = (obj) => net.send(obj);

  // ---------------- UI ----------------
  const classSelect = new ClassSelect(overlay, (classId) => {
    if (!send({ type: 'select_class', classId })) {
      // офлайн: применяем локально
      const c = CLASSES[classId];
      if (c) {
        player.stats = { classId, hp: c.hp, maxHp: c.maxHp, armor: c.armor, minAtk: c.minAtk, maxAtk: c.maxAtk };
        player.color = c.color;
        overlay.toast(`Вы обрели тело: ${displayClassName(classId, c.name)}`, c.color);
      }
    }
  });
  const statsUI = new StatsUI(overlay);
  const runUI = new RunUI(overlay, {
    onChoice: (c) => { run?.applyChoice(c); },
    onAbility: () => { input.abilityPressed = true; },
    onRestart: () => restartRun(),
    onLeave: () => leaveRun(),
  });
  const hud = new GameHUD(container, {
    onTouchFlower: (id) => send({ type: 'touch_flower', flowerId: id }),
    onPickFlower: (id) => send({ type: 'pick_flower', flowerId: id }),
    onOpenAdmin: () => adminPanel?.editor?.toggle(),
    onEnterRun: (room) => requestRun(room, null),
    onLeaveRun: () => leaveRun(),
  });
  const touch = new TouchControls(overlay.layer, {
    onDash: () => { input.dashPressed = true; },
    onInteract: () => interact(),
    onSoul: () => toggleSoul(),
    onChat: () => openChat(),
    onZoomIn: () => zoomBy(1.2),
    onZoomOut: () => zoomBy(1 / 1.2),
  }, /[?&]mobile=1/.test(location.search));

  // Админ-редактор карт: прежний 2D-модуль поверх ортографической 3D-камеры «строго сверху»
  const edCanvas = document.createElement('canvas');
  edCanvas.className = 'mc3d-overlay-canvas';
  container.appendChild(edCanvas);
  const edCtx = edCanvas.getContext('2d');
  const adminPanel = new AdminPanel(edCanvas, container, userId, () => world, (nextWorld) => {
    send({ type: 'admin_switch_world', world: nextWorld });
  });
  if (adminPanel.editor && hub.map.maps[world]) adminPanel.editor.loadTilesArray(hub.map.maps[world]);
  let editorWasActive = false;

  // ---------------- обработчики сервера ----------------
  net.on('welcome', (d) => {
    myId = d.myId;
    isAdmin = isAdmin || !!d.isAdmin;
    if (Array.isArray(d.portals)) portals = d.portals;
    if (d.classes) syncClassesFromServer(d.classes);
    world = d.world || 'hellfire';
    hub.setWorld(world, portals, true);
    if (mode === 'run' && run) run.myId = myId;
    const deep = new URLSearchParams(location.search).get('run');
    if (deep && RUN_ROOMS[deep] && mode === 'hub') requestRun(deep, null);
  });

  net.on('players_state', (d) => {
    if (d.world && d.world !== world && mode === 'hub') {
      world = d.world;
      hub.setWorld(world, portals);
    }
    const seen = new Set();
    const myNick = username.trim().toLowerCase();
    const counts = {};
    (d.players || []).forEach((p) => {
      if (p.runRoom) counts[p.runRoom] = (counts[p.runRoom] || 0) + 1;
      if (p.id === myId || (!myId && (p.username || '').trim().toLowerCase() === myNick)) {
        player.inDuel = !!p.inDuel;
        if (p.color) player.color = p.color;
        if (p.shield !== undefined) player.shield = p.shield;
        if (p.stats) {
          if (player.stats && p.stats.hp > player.stats.hp && !player.inDuel && mode === 'hub') {
            overlay.float(toX(player.x), 2.6, toZ(player.y), `+${p.stats.hp - player.stats.hp} HP`, '#4ade80');
          }
          player.stats = { ...player.stats, ...p.stats };
        }
        return;
      }
      seen.add(p.id);
      let o = others.get(p.id);
      if (!o) {
        o = { id: p.id, x: p.x, y: p.y, dirX: 0, dirY: 1 };
        others.set(p.id, o);
      }
      Object.assign(o, { username: p.username || 'Странник', userId: p.userId || '', world: p.world || 'hellfire', targetX: p.x, targetY: p.y, color: p.color || '#38bdf8', stats: p.stats || DEFAULT_STATS, inDuel: !!p.inDuel, shield: p.shield || 0, runRoom: p.runRoom || null });
    });
    for (const id of others.keys()) if (!seen.has(id)) others.delete(id);
    roomCounts = counts;
    const sync = (cur, s) => {
      if (!s) return null;
      const o = cur || { x: s.x, y: s.y };
      Object.assign(o, s, { targetX: s.x, targetY: s.y, x: o.x, y: o.y });
      return o;
    };
    boss = sync(boss, d.boss);
    dar = sync(dar, d.dar);
    const ids = new Set();
    (d.flowers || []).forEach((f) => { ids.add(f.id); flowers.set(f.id, { ...flowers.get(f.id), ...f }); });
    for (const id of flowers.keys()) if (!ids.has(id)) flowers.delete(id);
  });

  net.on('kicked', () => {
    overlay.showScreen('<h2>Сессия закрыта</h2><p>Вы вошли в игру с другого устройства или вкладки.</p>', [{ text: 'Перезагрузить', onClick: () => location.reload() }]);
  });
  net.on('offline', (d) => {
    if (net.kicked) return;
    if (!offlineToastShown) overlay.toast(`${d.reason}. Офлайн-режим: соло-забеги доступны у порталов.`, '#fca5a5');
    offlineToastShown = true;
    if (mode === 'run' && run) { run.setMembers([], null); }
  });
  net.on('world_switched', (d) => {
    world = d.world || 'hellfire';
    player.x = d.x; player.y = d.y;
    hub.setWorld(world, portals);
    if (adminPanel.editor) adminPanel.editor.loadTilesArray(hub.map.maps[world] || []);
    stage.follow(toX(player.x), toZ(player.y), 0, true);
    overlay.toast(world === 'arinar' ? 'Фрактал Бабочки: Аринар' : world === 'hellfire' ? 'Мир Адского Пламени' : `Мир: ${world}`, '#c084fc');
  });
  net.on('open_class_selection', () => classSelect.open(player.stats.classId));
  net.on('class_updated', (d) => {
    player.stats = { ...player.stats, ...d.stats };
    if (d.color) player.color = d.color;
    const c = CLASSES[d.stats?.classId];
    overlay.toast(`Вы обрели тело: ${displayClassName(d.stats?.classId, c?.name || d.stats?.classId)}`, d.color);
  });
  // WAP-дуэли удалены из клиента. Сервер ещё может прислать дуэльные события (ИИ Кейт/Дар, старые клиенты):
  // вежливо отказываемся/выходим, чтобы игрок не «зависал» в бою без интерфейса.
  net.on('duel_incoming', (d) => {
    send({ type: 'duel_decline', targetId: d.fromId });
    overlay.toast(`${d.fromUsername || 'Игрок'} вызвал на дуэль — дуэли заменены co-op забегами`, '#fcd34d');
  });
  net.on('duel_start', () => {
    send({ type: 'duel_action', action: 'escape' });
    overlay.toast('Вас втянули в бой — вы ускользнули. Сражайтесь в забегах!', '#fcd34d');
  });
  net.on('duel_declined_notify', (d) => overlay.toast(`${d.targetNick || 'Игрок'} отказался`, '#94a3b8'));
  net.on('combat_death', (d) => overlay.toast(`Вы пали! Восстановление: ${d.lockDuration || 30} с`, '#fca5a5'));
  net.on('dar_surprise_hit', (d) => {
    if (d.targetId === myId) {
      if (d.hp !== undefined) player.stats.hp = d.hp;
      flashHurt();
      overlay.float(toX(player.x), 2.6, toZ(player.y), `-${d.damage || ''}`, '#ef4444');
    }
  });
  net.on('flower_touched_notify', (d) => {
    if (d.targetId === myId) {
      if (d.hp !== undefined) player.stats.hp = d.hp;
      flashHurt();
      overlay.float(toX(player.x), 2.6, toZ(player.y), `-${d.damage || 1} HP`, '#ef4444');
    }
  });
  net.on('flower_picked_notify', (d) => {
    flowers.delete(d.flowerId);
    if (d.playerId === myId) {
      player.shield = d.shield;
      overlay.toast('Вы сорвали цветок: синий щит +20', '#38bdf8');
      overlay.float(toX(player.x), 2.6, toZ(player.y), '+20 🛡️', '#38bdf8');
    }
  });
  net.on('toast_error', (d) => overlay.toast(d.message || 'Ошибка', '#fca5a5'));
  net.on('open_minigames_menu', (d) => {
    const list = (d.games || []).map((g) => `<div style="text-align:left;margin:4px 0">${g.disabled || !g.url
      ? `<b style="color:#64748b">${esc(g.title)}</b>`
      : `<a href="${esc(g.url)}" style="color:#ffd700;font-weight:bold">${esc(g.title)}</a>`}<br><small style="color:#94a3b8">${esc(g.desc)}</small></div>`).join('');
    overlay.showScreen(`<h2>${esc(d.portalName || 'Мини-игры')}</h2><div class="mc3d-results" style="max-height:60%;overflow:auto">${list}</div>`, [{ text: 'Закрыть', cls: 'ghost', onClick: () => overlay.hideScreen() }]);
  });
  net.on('chat_bubble', (d) => {
    const nick = (d.username || '').trim().toLowerCase();
    let key = d.playerId;
    if (d.playerId === myId || nick === username.trim().toLowerCase()) key = '__me';
    overlay.bubble(key, d.text);
  });

  // --- co-op забеги ---
  net.on('run_joined', (d) => {
    runRoom = d.room;
    if (d.myId) myId = d.myId;
    startRun(d.room, false);
  });
  net.on('run_members', (d) => {
    if (!run || d.room !== runRoom) return;
    runHostId = d.hostId;
    const wasHost = run.isHost;
    run.setMembers(d.members || [], d.hostId);
    if (!run.isHost && (!helloSent || wasHost)) {
      helloSent = true;
      net.runRelay({ k: 'hello' }, d.hostId);
    }
  });
  net.on('run_left', () => { if (mode === 'run') exitRun(); });
  net.on('run_relay', (d) => { if (run && d.room === runRoom) run.onRelay(d.from, d.data); });

  // ---------------- забег ----------------
  function requestRun(roomId, portalId) {
    if (mode === 'run') return;
    if (net.isOpen() && myId) {
      net.runJoin(roomId, portalId || undefined);
    } else {
      runRoom = roomId;
      startRun(roomId, true);
    }
  }

  function startRun(roomId, solo) {
    if (mode === 'run' && run) return;
    overlay.hideScreen();
    classSelect.isOpen = false; statsUI.isOpen = false;
    const classKey = RUN_CLASSES[player.stats.classId] ? player.stats.classId : 'soul';
    run = new RunSession({
      room: roomId, myId: myId || 'local', username, color: player.color,
      classKey, serverClass: CLASSES[player.stats.classId] || null,
      isHost: solo,
      send: (data, to) => { if (!solo) net.runRelay(data, to); },
      events: onRunEvent,
    });
    helloSent = false;
    const arena = new RunArena(RUN_ROOMS[roomId]?.theme || 'crypt');
    hub.detach();
    runView = new RunView(THREE, stage.scene, run, arena);
    stage.setEnvironment(arena);
    mode = 'run';
    runUI.show(true);
    runUI.setAbility(classKey);
    touch.setMode('run');
    overlay.clearFloats();
    stage.follow(run.me.x, run.me.z, 0, true);
    overlay.toast(`«${RUN_ROOMS[roomId]?.name || roomId}»: продержитесь как можно дольше!`, RUN_ROOMS[roomId]?.color);
    api.run = run;
  }

  function restartRun() {
    if (!run) return;
    if (run.remotes.size && !run.isHost) { overlay.toast('Ждём, пока ведущий перезапустит забег…', '#fcd34d'); return; }
    if (run.remotes.size) net.runRelay({ k: 'restart' });
    doRestart();
  }
  function doRestart() {
    run.reset(0);
    overlay.hideScreen();
    runUI.closeChoices();
    if (!run.isHost && runHostId) net.runRelay({ k: 'hello' }, runHostId);
  }

  function leaveRun() {
    if (mode !== 'run') return;
    if (net.isOpen() && runRoom && myId) {
      net.runLeave();
      setTimeout(() => { if (mode === 'run') exitRun(); }, 1500);
    } else exitRun();
  }

  function exitRun() {
    if (mode !== 'run') return;
    runView?.dispose();
    runView = null; run = null; runRoom = null; api.run = null;
    runUI.show(false);
    overlay.hideScreen();
    overlay.clearFloats();
    hub.attach();
    touch.setMode('hub');
    mode = 'hub';
    stage.follow(toX(player.x), toZ(player.y), 0, true);
  }

  let floatBudget = 0;
  function onRunEvent(type, d) {
    if (!run) return;
    switch (type) {
      case 'levelup':
      case 'choice_applied':
        if (run.pendingChoices > 0 && !runUI.choiceOpen && !run.ended) {
          const chest = run.choiceSource === 'chest';
          runUI.openChoices(run.rollChoices(3), { title: chest ? 'Сундук!' : `Уровень ${run.team.level}!`, sub: run.remotes.size ? 'Отряд не ждёт: вы неуязвимы, пока выбираете' : '' });
        }
        break;
      case 'toast': overlay.toast(d.text, d.color); break;
      case 'hurt':
        flashHurt();
        if (floatBudget > 0) { floatBudget--; overlay.float(run.me.x, 2.4, run.me.z, `-${Math.round(d.dmg)}`, '#f87171'); }
        break;
      case 'downed': overlay.toast(run.remotes.size ? 'Вы пали! Союзники могут поднять вас' : 'Вы пали…', '#fca5a5'); break;
      case 'revived': overlay.toast('Вас подняли!', '#4ade80'); break;
      case 'dmg':
        if (floatBudget > 0) { floatBudget--; overlay.float(d.x, 1.8, d.z, String(Math.round(d.dmg)), d.boss ? '#f0abfc' : '#fff', d.crit); }
        break;
      case 'kill':
        if (d.boss) overlay.toast('Страж повержен!', '#f0abfc');
        break;
      case 'ability': overlay.toast(`${d.name}!`, '#fde68a'); break;
      case 'end':
        runUI.showResults(d, { isHost: run.isHost, coop: run.remotes.size > 0 || (d.players || []).length > 1, myId: run.myId });
        break;
      case 'remote_join': overlay.toast(`${run.remotes.get(d.id)?.username || 'Союзник'} в забеге`, '#4ade80'); break;
      case 'host_lost': if (!hostLostShown) { hostLostShown = true; overlay.toast('Ведущий не отвечает…', '#fcd34d'); } break;
      case 'restart_req': if (!run.isHost) doRestart(); break;
      default: break;
    }
  }
  let hostLostShown = false;

  const flashEl = document.createElement('div');
  flashEl.style.cssText = 'position:absolute;inset:0;pointer-events:none;box-shadow:inset 0 0 60px rgba(220,38,38,0.85);opacity:0;transition:opacity 0.25s';
  overlay.layer.appendChild(flashEl);
  function flashHurt() {
    flashEl.style.transition = 'none';
    flashEl.style.opacity = '1';
    requestAnimationFrame(() => { flashEl.style.transition = 'opacity 0.35s'; flashEl.style.opacity = '0'; });
  }

  // ---------------- ввод ----------------
  const keys = new Set();
  const input = { dashPressed: false, abilityPressed: false };
  const isTyping = (e) => e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable);
  window.addEventListener('keydown', (e) => {
    if (isTyping(e) || net.kicked) return;
    const k = e.key.toLowerCase();
    if (e.key === 'Escape') {
      if (adminPanel.editor?.isActive) { adminPanel.editor.toggle(false); keys.clear(); e.preventDefault(); return; }
      if (classSelect.isOpen) { classSelect.close(); return; }
      if (statsUI.isOpen) { statsUI.close(); return; }
      if (overlay.screen && !runUI.choiceOpen && !(run && run.ended)) { overlay.hideScreen(); return; }
      return;
    }
    if (e.key === 'Enter') { e.preventDefault(); openChat(); return; }
    if (runUI.choiceOpen) return; // 1–3 обрабатывает модалка
    keys.add(e.code);
    if (e.code === 'Space' || e.code === 'ShiftLeft' || e.code === 'ShiftRight') { input.dashPressed = true; e.preventDefault(); }
    if (k === 'q' || k === 'й') input.abilityPressed = true;
    if (k === 'e' || k === 'у') interact();
    if (k === 'c' || k === 'с') toggleSoul();
    if (e.key === '+' || e.key === '=') zoomBy(1.15);
    if (e.key === '-' || e.key === '_') zoomBy(1 / 1.15);
    if (e.key === 'F3') { e.preventDefault(); showDebug = !showDebug; }
  });
  window.addEventListener('keyup', (e) => keys.delete(e.code));
  window.addEventListener('blur', () => keys.clear());
  canvas.addEventListener('wheel', (e) => { e.preventDefault(); zoomBy(e.deltaY < 0 ? 1.1 : 1 / 1.1); }, { passive: false });
  canvas.addEventListener('click', (e) => onCanvasClick(e));

  function zoomBy(f) {
    const v = stage.view;
    v.targetZoom = Math.max(v.minZoom, Math.min(v.maxZoom, v.targetZoom * f));
  }
  function openChat() {
    overlay.openChat((text) => {
      if (!send({ type: 'chat', text })) overlay.bubble('__me', text);
    });
  }
  function toggleSoul() {
    if (mode === 'run' && !statsUI.isOpen && overlay.screen) return;
    statsUI.toggleSoulModal(undefined, player.stats, username, world, { shield: player.shield });
  }
  let showDebug = /[?&]debug=1/.test(location.search);

  function moveVector() {
    let x = 0, y = 0;
    if (keys.has('KeyW') || keys.has('ArrowUp')) y -= 1;
    if (keys.has('KeyS') || keys.has('ArrowDown')) y += 1;
    if (keys.has('KeyA') || keys.has('ArrowLeft')) x -= 1;
    if (keys.has('KeyD') || keys.has('ArrowRight')) x += 1;
    const st = touch.getMoveVector?.() || { x: 0, y: 0 };
    if (st.x || st.y) { x = st.x; y = st.y; }
    const len = Math.hypot(x, y);
    if (len > 1) { x /= len; y /= len; }
    return { x, y };
  }

  // ---------------- хаб: взаимодействие ----------------
  function nearestPortal() {
    let best = null, bd = PORTAL_RANGE;
    for (const p of portals) {
      if ((p.world || 'hellfire') !== world) continue;
      const d = Math.hypot(p.x - player.x, p.y - player.y);
      if (d <= bd) { bd = d; best = p; }
    }
    return best;
  }
  function nearestFlower() {
    let best = null, bd = FLOWER_RANGE;
    for (const f of flowers.values()) {
      if (f.stage === 'active') continue;
      const d = Math.hypot(f.x - player.x, f.y - player.y);
      if (d <= bd) { bd = d; best = f; }
    }
    return best;
  }

  function interact() {
    if (mode !== 'hub' || overlay.screen || overlay.chatOpen) return;
    const p = nearestPortal();
    if (p) return usePortal(p);
    const f = nearestFlower();
    if (f) send({ type: f.stage === 'bud' ? 'touch_flower' : 'pick_flower', flowerId: f.id });
  }

  function usePortal(p) {
    if (p.runRoom) return showRoomPrompt(p);
    if (net.isOpen() && myId) { send({ type: 'use_portal', portalId: p.id }); return; }
    // офлайн-поведение порталов
    if (p.id === 'portal_class_select') classSelect.open(player.stats.classId);
    else if (p.targetWorld) {
      world = p.targetWorld; player.x = p.targetX || 300; player.y = p.targetY || 600;
      hub.setWorld(world, portals);
      stage.follow(toX(player.x), toZ(player.y), 0, true);
    } else overlay.toast('Портал недоступен без связи с сервером', '#fca5a5');
  }

  function showRoomPrompt(p) {
    const room = RUN_ROOMS[p.runRoom];
    if (!room) return;
    const cls = RUN_CLASSES[player.stats.classId] || RUN_CLASSES.soul;
    const n = roomCounts[room.id] || 0;
    overlay.showScreen(`<h2 style="color:${room.color}">${esc(room.name)}</h2>
      <p>${esc(room.desc)}</p>
      <p>Сейчас в комнате: <b>${n}/4</b>${n ? ' — вы присоединитесь к их забегу' : ''}${net.isOpen() ? '' : ' · <span style="color:#fca5a5">офлайн: соло</span>'}</p>
      <p>Ваш класс: <b style="color:${cls.color}">${esc(displayClassName(player.stats.classId))}</b>. Улучшения и уровни действуют только внутри забега.</p>
      ${player.stats.classId ? '' : '<p style="color:#fcd34d">Без тела у вас нет навыка класса — выберите тело у Алтаря.</p>'}`,
    [
      { text: '▶ Начать забег', cls: 'gold', id: 'mc3d-run-start', onClick: () => { overlay.hideScreen(); requestRun(room.id, p.id); } },
      { text: 'Отмена', cls: 'ghost', onClick: () => overlay.hideScreen() },
    ]);
  }

  function onCanvasClick(e) {
    canvas.focus?.();
    if (mode !== 'hub' || overlay.screen || adminPanel.editor?.isActive) return;
    const g = stage.groundPoint(e.clientX, e.clientY);
    if (!g) return;
    const px = toPx(g.x), py = toPy(g.z);
    const cands = [];
    for (const o of others.values()) if (o.world === world && !o.runRoom) cands.push({ kind: 'player', o, x: o.x, y: o.y });
    if (boss && boss.state !== 'dead' && world === 'hellfire') cands.push({ kind: 'keyt', o: boss, x: boss.x, y: boss.y });
    if (dar && dar.state !== 'dead' && world === 'hellfire') cands.push({ kind: 'dar', o: dar, x: dar.x, y: dar.y });
    for (const f of flowers.values()) cands.push({ kind: 'flower', o: f, x: f.x, y: f.y });
    for (const p of portals) if ((p.world || 'hellfire') === world) cands.push({ kind: 'portal', o: p, x: p.x, y: p.y });
    let best = null, bd = 40;
    for (const c of cands) { const d = Math.hypot(c.x - px, c.y - py); if (d < bd) { bd = d; best = c; } }
    if (!best) { hud.clearTarget(); return; }
    const o = best.o;
    if (best.kind === 'portal') {
      hud.setTarget({ kind: 'portal', id: o.id, name: o.name, typeLabel: o.runRoom ? 'Комната забега' : 'Портал' });
      if (Math.hypot(o.x - player.x, o.y - player.y) <= PORTAL_RANGE) usePortal(o);
      else overlay.toast(`Подойдите ближе: ${o.name}`, '#94a3b8');
      return;
    }
    if (best.kind === 'flower') {
      hud.setTarget({ kind: 'flower', id: o.id, stage: o.stage, name: 'Тюльпан-вампир', typeLabel: `${o.stage}${o.flowerType ? ' / ' + o.flowerType : ''}` });
      return;
    }
    const st = o.stats || o;
    hud.setTarget({
      kind: best.kind, id: o.id, name: o.username || o.name || (best.kind === 'keyt' ? 'Кейт' : 'Дар'),
      typeLabel: best.kind === 'player' ? displayClassName(st.classId) : 'Хранитель',
      hp: `${st.hp ?? '?'} / ${st.maxHp ?? '?'}`, armor: st.armor ?? '-', atk: st.minAtk !== undefined ? `${st.minAtk}-${st.maxAtk}` : (st.attack ?? '-'),
    });
  }

  // ---------------- цикл ----------------
  let last = performance.now();
  let moveAcc = 0, lastSentX = -1, lastSentY = -1, hudAcc = 0;
  const fpsS = { n: 0, t: 0, fps: 0 };
  const debugEl = document.createElement('div');
  debugEl.style.cssText = 'position:absolute;left:6px;bottom:6px;font:10px monospace;color:#a3e635;text-shadow:0 1px 2px #000;pointer-events:none;white-space:pre';
  overlay.layer.appendChild(debugEl);

  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
    last = now;
    fpsS.n++; fpsS.t += dt;
    if (fpsS.t >= 0.5) { fpsS.fps = Math.round(fpsS.n / fpsS.t); fpsS.n = 0; fpsS.t = 0; }
    floatBudget = Math.min(30, floatBudget + dt * 40);
    stage.resize();
    overlay.syncRect();
    try {
      if (mode === 'run' && run) runFrame(dt, now);
      else hubFrame(dt, now);
    } catch (err) {
      console.error('[MorrisCurse 3D] ошибка кадра', err);
    }
    stage.render();
    hudAcc += dt;
    if (hudAcc > 0.15) {
      hudAcc = 0;
      hud.update({
        player, username, mode, run, ping: net.ping, online: others.size + 1, zoom: stage.view.zoom, isAdmin,
        roomCounts, runRoom, otherPlayers: [...others.values()].filter((o) => !o.runRoom), boss, portals, world,
        lastFaceDir: { x: player.dirX, y: player.dirY }, nearby: nearbyList(), dash,
      });
    }
    if (showDebug) {
      const info = stage.renderer.info.render;
      debugEl.textContent = `${fpsS.fps} fps · calls ${info.calls} · tris ${info.triangles} · ${mode}${run ? ` · enemies ${run.enemies.size} · ${run.isHost ? 'host' : 'guest'}` : ''} · models ${modelMode()} · ${net.offline ? 'offline' : net.isOpen() ? 'online' : '…'}`;
    } else if (debugEl.textContent) debugEl.textContent = '';
  }

  function nearbyList() {
    const out = [];
    if (mode !== 'hub') return out;
    for (const o of others.values()) {
      if (o.world !== world || o.runRoom) continue;
      const d = Math.round(Math.hypot(o.x - player.x, o.y - player.y));
      if (d < 320) out.push({ title: o.username, dist: d, color: o.color });
    }
    for (const p of portals) {
      if ((p.world || 'hellfire') !== world) continue;
      const d = Math.round(Math.hypot(p.x - player.x, p.y - player.y));
      if (d < 260) out.push({ title: p.name, dist: d, color: p.color });
    }
    return out.sort((a, b) => a.dist - b.dist).slice(0, 8);
  }

  function hubFrame(dt, now) {
    const editorActive = !!adminPanel.editor?.isActive;
    // движение
    const blocked = overlay.screen || overlay.chatOpen || editorActive || net.kicked;
    const mv = blocked ? { x: 0, y: 0 } : moveVector();
    dash.cd = Math.max(0, dash.cd - dt);
    if (input.dashPressed && !blocked && dash.cd <= 0 && !dash.active) {
      dash.active = true; dash.timer = DASH.duration; dash.cd = DASH.cooldown;
      dash.dirX = mv.x || player.dirX; dash.dirY = mv.y || player.dirY;
      const l = Math.hypot(dash.dirX, dash.dirY) || 1; dash.dirX /= l; dash.dirY /= l;
    }
    input.dashPressed = false; input.abilityPressed = false;
    let vx = mv.x * MOVE_SPEED, vy = mv.y * MOVE_SPEED;
    if (dash.active) {
      vx = dash.dirX * DASH.speed; vy = dash.dirY * DASH.speed;
      dash.timer -= dt;
      if (dash.timer <= 0) dash.active = false;
    }
    player.moving = Math.hypot(vx, vy) > 1;
    if (player.moving) {
      if (!dash.active) { const l = Math.hypot(mv.x, mv.y) || 1; player.dirX = mv.x / l; player.dirY = mv.y / l; }
      const nx = Math.max(16, Math.min(WORLD_SIZE - 16, player.x + vx * dt));
      const ny = Math.max(16, Math.min(WORLD_SIZE - 16, player.y + vy * dt));
      if (!hub.map.isBlocked(nx, player.y, 10)) player.x = nx;
      if (!hub.map.isBlocked(player.x, ny, 10)) player.y = ny;
    }
    // отправка позиции (как раньше: раз в 66 мс при изменении)
    moveAcc += dt;
    if (moveAcc >= 0.066) {
      moveAcc = 0;
      const cx = Math.round(player.x), cy = Math.round(player.y);
      if ((cx !== lastSentX || cy !== lastSentY) && net.isOpen() && myId) {
        lastSentX = cx; lastSentY = cy;
        send({ type: 'move', x: cx, y: cy });
      }
    }
    // интерполяция чужих
    const k = Math.min(1, dt * 10);
    const lerp = (o) => {
      if (o.targetX === undefined) return;
      const dx = o.targetX - o.x, dy = o.targetY - o.y;
      o.moving = Math.hypot(dx, dy) > 0.6;
      if (o.moving) { o.dirX = dx; o.dirY = dy; }
      if (Math.hypot(dx, dy) > 200) { o.x = o.targetX; o.y = o.targetY; } else { o.x += dx * k; o.y += dy * k; }
    };
    others.forEach(lerp);
    if (boss) lerp(boss);
    if (dar) lerp(dar);

    const visibleOthers = [...others.values()].filter((o) => o.world === world && !o.runRoom);
    hub.update(dt, {
      me: { x: player.x, y: player.y, dirX: player.dirX, dirY: player.dirY, moving: player.moving, classId: player.stats.classId, color: player.color, scale: dash.active ? 1.08 : 1 },
      others: visibleOthers.map((o) => ({ key: o.id, x: o.x, y: o.y, dirX: o.dirX, dirY: o.dirY, moving: o.moving, stats: o.stats, color: o.color })),
      boss: world === 'hellfire' ? boss : null,
      dar: world === 'hellfire' ? dar : null,
      flowers: world === 'hellfire' ? flowers : new Map(),
    });

    // камера
    window.__GAME_CAMERA__ = { x: player.x, y: player.y, zoom: stage.view.zoom };
    if (editorActive) {
      const cam = window.__GAME_CAMERA__;
      stage.view.zoom += (stage.view.targetZoom - stage.view.zoom) * Math.min(1, dt * 10);
      stage.setOrthoTopDown(toX(cam.x), toZ(cam.y), 1 / (cam.zoom * 20));
      drawEditorOverlay(cam);
    } else {
      stage.useOrtho = false;
      stage.follow(toX(player.x), toZ(player.y), dt);
      if (editorWasActive) {
        // применяем нарисованное в редакторе к 3D-карте и коллизиям
        hub.map.updateWorldTiles(world, [...adminPanel.editor.tiles.values()]);
        hub.rebuildTiles();
        edCanvas.style.pointerEvents = 'none';
        edCtx.clearRect(0, 0, edCanvas.width, edCanvas.height);
      }
    }
    editorWasActive = editorActive;

    // подписи
    overlay.beginFrame();
    const head = (x, y, h = 2.5) => stage.project(toX(x), h, toZ(y));
    const alive = new Set(['__me']);
    let p = head(player.x, player.y);
    if (p) {
      const c = CLASSES[player.stats.classId];
      overlay.label('me', p.x, p.y, `${esc(username)}<small>${esc(displayClassName(player.stats.classId))}${player.shield ? ` · 🛡️${player.shield}` : ''}</small>`, '#ffd700');
      overlay.placeBubble('__me', p.x, p.y - 26);
    }
    visibleOthers.forEach((o) => {
      alive.add(o.id);
      const q = head(o.x, o.y);
      if (!q) return;
      overlay.label('p_' + o.id, q.x, q.y, `${esc(o.username)}<small>${esc(displayClassName(o.stats?.classId))}</small>`, o.color);
      overlay.placeBubble(o.id, q.x, q.y - 26);
    });
    [[boss, 'boss_keyt', 'Кейт', '#f472b6'], [dar, 'boss_dar', 'Дар', '#fb923c']].forEach(([b, id, nm, col]) => {
      if (!b || b.state === 'dead' || world !== 'hellfire') return;
      alive.add(id);
      const q = head(b.x, b.y, 3.1);
      if (!q) return;
      const hp = b.maxHp ? Math.max(0, Math.round((b.hp / b.maxHp) * 100)) : 100;
      overlay.label(id, q.x, q.y, `${esc(b.name || nm)}<div class="mc3d-mini-hp"><i style="width:${hp}%"></i></div>`, col);
      overlay.placeBubble(id, q.x, q.y - 30);
    });
    for (const pt of portals) {
      if ((pt.world || 'hellfire') !== world) continue;
      const q = stage.project(toX(pt.x), pt.id === 'portal_class_select' ? 2.2 : 3.6, toZ(pt.y));
      if (!q) continue;
      const extra = pt.runRoom ? `<small>${roomCounts[pt.runRoom] || 0}/4 в забеге · co-op</small>` : '';
      overlay.label('pt_' + pt.id, q.x, q.y, `${esc(pt.name)}${extra}`, pt.color || '#c084fc');
    }
    overlay.cleanupBubbles(alive);
    overlay.endFrame();
    overlay.updateFloats(dt, (x, y, z) => stage.project(x, y, z));

    // подсказка действия
    let promptText = '';
    if (!overlay.screen && !editorActive) {
      const np = nearestPortal();
      const nf = np ? null : nearestFlower();
      const key = touch.isMobileTouch ? '✋' : 'E';
      if (np) promptText = `${key} — ${np.runRoom ? 'войти в забег: ' : ''}${np.name}`;
      else if (nf) promptText = `${key} — ${nf.stage === 'bud' ? 'тронуть бутон (-1 HP)' : 'сорвать цветок (+20 щит)'}`;
      touch.setInteractHighlight(!!(np || nf));
    }
    overlay.setPrompt(promptText);
  }

  function drawEditorOverlay(cam) {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    edCanvas.style.left = canvas.offsetLeft + 'px';
    edCanvas.style.top = canvas.offsetTop + 'px';
    edCanvas.style.width = w + 'px';
    edCanvas.style.height = h + 'px';
    edCanvas.style.pointerEvents = 'auto';
    if (edCanvas.width !== w) edCanvas.width = w;
    if (edCanvas.height !== h) edCanvas.height = h;
    edCtx.setTransform(1, 0, 0, 1, 0, 0);
    edCtx.clearRect(0, 0, w, h);
    edCtx.setTransform(cam.zoom, 0, 0, cam.zoom, w / 2 - cam.x * cam.zoom, h / 2 - cam.y * cam.zoom);
    adminPanel.render(edCtx, cam);
    edCtx.setTransform(1, 0, 0, 1, 0, 0);
  }

  function runFrame(dt, now) {
    const blocked = overlay.chatOpen || (overlay.screen && !runUI.choiceOpen && !run.ended);
    const mv = blocked ? { x: 0, y: 0 } : moveVector();
    run.update(dt, { x: mv.x, z: mv.y, dash: input.dashPressed, ability: input.abilityPressed });
    input.dashPressed = false; input.abilityPressed = false;
    runView.update(dt, now / 1000);
    stage.useOrtho = false;
    stage.follow(run.me.x, run.me.z, dt);
    window.__GAME_CAMERA__ = { x: toPx(run.me.x), y: toPy(run.me.z), zoom: stage.view.zoom };
    runUI.update(run);

    overlay.beginFrame();
    for (const [id, r] of run.remotes) {
      if (r.stale) continue;
      const q = stage.project(r.x, 2.6, r.z);
      if (!q) continue;
      const rev = r.dead ? `<small>💀 ${r.reviveProgress ? `поднимаем ${Math.round((r.reviveProgress / 2.5) * 100)}%` : 'встаньте рядом, чтобы поднять'}</small>` : '';
      overlay.label('r_' + id, q.x, q.y, `${esc(r.username)}${id === runHostId ? ' 👑' : ''}${rev}`, r.color);
      overlay.placeBubble(id, q.x, q.y - 24);
    }
    for (const e of run.enemies.values()) {
      if (!(e.elite || e.boss) || e.dead) continue;
      const def = ENEMIES[e.type];
      const q = stage.project(e.x, (def.radius || 0.6) * (e.scale || 1) * 2 + 1.2, e.z);
      if (!q) continue;
      const hp = Math.max(0, Math.round(((e.hp ?? e.maxHp) / e.maxHp) * 100));
      overlay.label('e_' + e.id, q.x, q.y, `${e.boss ? 'Страж' : '★ ' + esc(def.name || e.type)}<div class="mc3d-mini-hp"><i style="width:${hp}%"></i></div>`, e.boss ? '#f0abfc' : '#facc15');
    }
    const q = stage.project(run.me.x, 2.6, run.me.z);
    if (q) overlay.placeBubble('__me', q.x, q.y - 10);
    overlay.endFrame();
    overlay.updateFloats(dt, (x, y, z) => stage.project(x, y, z));
    overlay.setPrompt('');
  }

  api.state = () => ({ mode, world, myId, player: { ...player }, others: others.size, run: run ? { t: run.t, enemies: run.enemies.size, level: run.team.level, kills: run.team.kills, isHost: run.isHost, remotes: run.remotes.size, hp: run.me.hp, dead: run.me.dead, ended: run.ended } : null, net: { open: net.isOpen(), offline: net.offline } });
  api.startRun = (room = 'crypt') => requestRun(room, null);
  if (showDebug) {
    // отладочные хуки для автотестов (только с ?debug=1)
    api.debug = {
      teleport: (x, y) => { player.x = x; player.y = y; },
      selectClass: (id) => classSelect.onSelect(id),
      setZoom: (z) => { stage.view.targetZoom = z; stage.view.zoom = z; },
    };
  }
  api.leaveRun = () => leaveRun();
  requestAnimationFrame(frame);
  canvas.focus?.();
}
