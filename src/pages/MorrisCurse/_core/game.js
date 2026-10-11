// «Проклятые» — 3D-ядро. Точка входа прежняя: initGame(canvasId, username, userId) (импортируется index.astro).
//
// Хаб: общий мир сервера (Адское Пламя / Аринар) в 3D, тот же WebSocket-протокол (join/move/use_portal/...).
// Забег: Vampire Survivors-подобный режим в отдельной 3D-арене; вход через порталы-комнаты (run_join),
// co-op синхронизация через run_relay (ведущий — авторитет орды). См. survivors/run.js.
import { loadThree } from './engine/three-loader.js';
import { Stage } from './engine/stage.js';
import { toX, toZ, toPx, toPy } from './engine/geometry.js';
import { worldSize } from '../../../../server/worlds/sizes.ts';
import { initModelMode, preloadCharacterSheets, modelMode } from './engine/characters.js';
import { loadPixAtlases } from './engine/pixSprites.js';
import { MetaClient } from './meta/metaClient.js';
import { Book } from './ui/book.js';
import { QuestTracker } from './ui/tracker.js';
import { NpcDialog } from './ui/dialog.js';
import { ZoneView } from './hub/zoneView.js';
import { RESOURCES, RARITIES, ABILITY_BY_ID, HERO_NAMES, NPCS, MOB_INFO as ZONE_MOBS, WEAPON_TYPES } from '../../../../server/meta/shared.ts';
import { ITEM_BY_ID, addCards } from './meta/itemCards.js';
import { QUEST_BY_ID } from '../../../../server/meta/quests.ts';
import { NetClient } from './net.js';
import { HubWorld } from './hub/hubWorld.js';
import { RunSession } from './survivors/run.js';
import { RunView } from './survivors/runView.js';
import { RunArena } from './survivors/arena.js';
import { RUN_ROOMS, RUN_CLASSES, ENEMIES, WEAPONS, displayClassName } from './survivors/data.js';
import { Overlay, esc } from './ui/overlay.js';
import { RunUI } from './ui/runUI.js';
import { ClassSelect } from './ui/classSelect.js';
import { GameHUD } from './hud.js';
import { TouchControls, isMobileDevice } from './touchControls.js';
import { StatsUI, DEFAULT_STATS } from './playerStats.js';
import { CLASSES, syncClassesFromServer } from './classes.js';
import { WORLD_PORTALS as OFFLINE_PORTALS } from '../../../../server/worlds/portals.ts';
import { CHARACTER_CLASSES as OFFLINE_CLASSES } from '../../../../server/classes.ts';
import './styles/core3d.css';

const WORLD_SIZE = 1200; // хаб; Аринар — 2400 (server/worlds/sizes.ts)
const MOVE_SPEED = 175; // px/с, как в 2D-версии
const DASH = { duration: 0.22, speed: 620, cooldown: 0.9 };
const PORTAL_RANGE = 85; // как проверка сервера
const FLOWER_RANGE = 120;
const ALTAR = { x: 565, y: 600 };
const NPC_LIST = NPCS;
const ZONE_BOSS = Object.fromEntries(Object.entries(ZONE_MOBS).filter(([, m]) => m.boss).map(([k, m]) => [k, m.name]));
const ZONE_ATK_MS = 480;

// Сессия Clerk (если игрок вошёл на сайте): короткоживущий JWT, сервер проверяет подпись
async function clerkToken() {
  try {
    const c = window.Clerk;
    if (!c) return '';
    if (!c.loaded && c.load) await Promise.race([c.load(), new Promise((r) => setTimeout(r, 2500))]);
    return (await c.session?.getToken?.()) || '';
  } catch (_) { return ''; }
}
function guestId() {
  try {
    let g = localStorage.getItem('mc-guest-id');
    if (!g || !/^[a-z0-9]{16,40}$/.test(g)) {
      g = Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => b.toString(36).padStart(2, '0')).join('').slice(0, 24);
      localStorage.setItem('mc-guest-id', g);
    }
    return g;
  } catch (_) { return ''; }
}

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
  await Promise.all([preloadCharacterSheets(), loadPixAtlases(THREE)]);
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
  const others = new Map(); // id → player
  let boss = null, dar = null;
  const flowers = new Map();
  let mode = 'hub';
  let run = null, runView = null, runRoom = null, runHostId = null, helloSent = false;
  const runOpts = { hpCapPct: 100 };
  // Лобби экземпляра забега: { runId, room, name, epoch, state, info } — состав и эпоху ведёт сервер
  let lobby = null;
  let lobbyView = null; // 'browser' | 'lobby' | null
  let browserRoom = null, browserPortal = null, lobbyListData = [];
  let lobbyNote = '';
  let roomCounts = {};
  let offlineToastShown = false;

  if (!Object.keys(CLASSES).length) {
    syncClassesFromServer(Object.fromEntries(Object.values(OFFLINE_CLASSES).map((c) => [c.id, { id: c.id, name: c.name, color: c.color, ...c.stats }])));
  }

  const hub = new HubWorld(THREE, stage);
  const zone = new ZoneView(THREE, hub.root);
  hub.setWorld(world, portals);
  zone.setWorld(world);
  hub.attach();

  // ---------------- сеть ----------------
  const net = new NetClient({
    username, userId,
    getToken: clerkToken,
    guestId: guestId(),
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
  // Мета-прогрессия героя (сервер): книга, трекер заданий, диалоги NPC
  const meta = new MetaClient(send);
  api.meta = meta;
  const book = new Book(overlay, meta, {
    canSoul: () => mode === 'hub' && world === 'hellfire' && Math.hypot(player.x - ALTAR.x, player.y - ALTAR.y) <= 110,
    nearPetr: () => mode === 'hub' && !!zone.nearestNpc(world, player.x, player.y) && zone.nearestNpc(world, player.x, player.y).id === 'petr',
  });
  const tracker = new QuestTracker(overlay, meta, { onOpenBook: () => book.toggle('quests'), mobile });
  const dialog = new NpcDialog(overlay, meta);
  dialog.onCraft = () => book.open('craft');
  const zoneSt = { lastAtk: 0, gather: null, abilCd: {}, hurtShown: 0 };
  const runUI = new RunUI(overlay, {
    onChoice: (c) => { run?.applyChoice(c); },
    onAbility: (slot) => { input.abilitySlot = slot ?? 0; },
    onRestart: () => backToLobby(),
    onLeave: () => leaveRun(),
    onGiveUp: () => giveUp(),
  });
  const hud = new GameHUD(container, {
    onTouchFlower: (id) => send({ type: 'touch_flower', flowerId: id }),
    onPickFlower: (id) => send({ type: 'pick_flower', flowerId: id }),
    onEnterRun: (room) => requestRun(room, null),
    onLeaveRun: () => leaveRun(),
  });
  const touch = new TouchControls(overlay.layer, {
    onDash: () => { input.dashPressed = true; },
    onInteract: () => interact(),
    onAttack: (on) => { aim.touch = !!on; },
    onSoul: () => book.toggle('hero'),
    onBook: () => book.toggle(),
    onAbility: (slot) => useAbility(slot ?? 0),
    onChat: () => openChat(),
    onZoomIn: () => zoomBy(1.2),
    onZoomOut: () => zoomBy(1 / 1.2),
  }, /[?&]mobile=1/.test(location.search));

  // ---------------- обработчики сервера ----------------
  net.on('welcome', (d) => {
    myId = d.myId;
    if (Array.isArray(d.portals)) portals = d.portals;
    if (d.classes) syncClassesFromServer(d.classes);
    world = d.world || 'hellfire';
    hub.setWorld(world, portals, true);
    zone.setWorld(world);
    if (mode === 'run' && run) run.myId = myId;
    const deep = new URLSearchParams(location.search).get('run');
    if (deep && RUN_ROOMS[deep] && mode === 'hub') requestRun(deep, null, false);
  });

  net.on('players_state', (d) => {
    if (d.world && d.world !== world && mode === 'hub') {
      world = d.world;
      hub.setWorld(world, portals);
      zone.setWorld(world);
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
    zone.setWorld(world);
    stage.follow(toX(player.x), toZ(player.y), 0, true);
    overlay.toast(world === 'arinar' ? 'Аринар · государство Мэлвелдил' : world === 'hellfire' ? 'Поляна перевоплощения' : `Мир: ${world}`, '#c084fc');
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

  // --- мета-прогрессия, квесты, открытый мир ---
  net.on('meta_state', (d) => {
    const prevLvl = meta.hero?.lvl;
    addCards(d.loot?.cards); addCards(d.reward?.cards);
    meta.apply(d);
    updateBookBadge();
    if (d.loot) showLoot(d.loot, `☠ ${esc(d.loot.mob ? (d.loot.mob) : '')}`);
    if (d.reward) showRunReward(d.reward);
    if (d.gathered) overlay.toast(`+${d.gathered.n} ${RESOURCES[d.gathered.res]?.icon || ''} ${RESOURCES[d.gathered.res]?.name || d.gathered.res}`, RESOURCES[d.gathered.res]?.color || '#a5f3fc');
    if (d.questDone) {
      const q = QUEST_BY_ID[d.questDone.id];
      if (q) overlay.toast(`✔ Задание выполнено: ${q.title}`, '#4ade80');
    }
    if (meta.hero && prevLvl && meta.hero.lvl > prevLvl) overlay.toast(`${HERO_NAMES[meta.hero.cls]}: уровень ${meta.hero.lvl}! +очко таланта`, '#facc15');
    refreshAbilityButtons();
  });
  net.on('quest_progress', (d) => {
    meta.applyProgress(d.quests);
    for (const q of d.quests || []) if (q.complete && QUEST_BY_ID[q.id]) overlay.toast(`◆ Цель выполнена: ${QUEST_BY_ID[q.id].title}`, '#a7f3d0');
  });
  net.on('npc_dialog', (d) => dialog.open(d.npc, d.quests));
  net.on('library', (d) => { meta.applyLibrary(d); updateBookBadge(); });
  // Кнопка Книги со счётчиком «новое» (новые предметы в сумке, открытия Библиотеки и Бестиария)
  const bookBtn = document.createElement('button');
  bookBtn.className = 'mc-bookbtn';
  bookBtn.title = 'Книга Проклятого (J/I/L/B)';
  bookBtn.innerHTML = '📖<em class="mc-cnt" style="display:none"></em>';
  bookBtn.addEventListener('pointerdown', (e) => { e.stopPropagation(); book.toggle(meta.unread().gear ? 'gear' : meta.unread().library ? 'library' : meta.unread().mobs ? 'bestiary' : undefined); });
  overlay.layer.appendChild(bookBtn);
  function updateBookBadge() {
    const n = meta.unread().total;
    const em = bookBtn.querySelector('em');
    em.style.display = n ? '' : 'none'; em.textContent = n > 99 ? '99+' : String(n);
    bookBtn.classList.toggle('isnew', n > 0);
    const tb = overlay.layer.querySelector('.mc3d-tbtn[data-act="book"]');
    if (tb) { tb.dataset.cnt = n ? String(Math.min(99, n)) : ''; tb.classList.toggle('hascnt', n > 0); }
  }
  meta.on(() => updateBookBadge());
  net.on('zone_state', (d) => {
    if (mode !== 'hub') return;
    const evs = zone.applyState(d, myId) || [];
    for (const e of evs) {
      if (e.k === 'float') overlay.float(toX(e.x), 2.4, toZ(e.y), e.text, e.color);
      else if (e.k === 'toast') overlay.toast(e.text, e.color);
      else if (e.k === 'hurt') { flashHurt(); overlay.float(toX(player.x), 2.6, toZ(player.y), `-${e.d}`, '#f87171'); }
      else if (e.k === 'died') overlay.toast('Вы пали! Возрождение через 5 с…', '#fca5a5');
    }
  });
  net.on('zone_respawn', (d) => {
    player.x = d.x; player.y = d.y;
    stage.follow(toX(player.x), toZ(player.y), 0, true);
    overlay.toast('Вы снова здесь. Мир помнит вас.', '#c4b5fd');
  });
  function showLoot(loot) {
    const parts = [];
    if (loot.xp) parts.push(`+${loot.xp} опыта`);
    for (const it of loot.items || []) {
      const def = ITEM_BY_ID[it.id];
      if (def) overlay.toast(`🎁 ${def.icon} ${def.name} (${RARITIES[def.rarity].name})`, RARITIES[def.rarity].color);
    }
    for (const [r, n] of Object.entries(loot.res || {})) parts.push(`${RESOURCES[r]?.icon || ''}×${n}`);
    if (parts.length) overlay.float(toX(player.x), 3.0, toZ(player.y), parts.join(' '), '#fde68a');
  }
  function showRunReward(r) {
    const items = (r.items || []).map((it) => { const d = ITEM_BY_ID[it.id]; return d ? `<li style="color:${RARITIES[d.rarity].color}">${d.icon} ${esc(d.name)}</li>` : ''; }).join('');
    const res = Object.entries(r.res || {}).map(([k, n]) => `${RESOURCES[k]?.icon || ''}×${n}`).join(' ');
    const box = overlay.screen?.querySelector('.mc3d-results');
    const html = `<div class="mc-reward"><b>Награда героя</b> (сервер): +${r.xp} опыта${r.levelUps ? ` · уровень +${r.levelUps}` : ''}${res ? ` · ${res}` : ''}${items ? `<ul>${items}</ul>` : ''}</div>`;
    if (box) box.insertAdjacentHTML('beforeend', html);
    else overlay.toast(`Награда: +${r.xp} опыта${items ? ' и трофеи' : ''}`, '#fde68a');
  }

  // --- co-op забеги ---
  net.on('lobby_list', (d) => {
    if (d.room !== browserRoom) return;
    lobbyListData = d.lobbies || [];
    if (lobbyView === 'browser') renderBrowser();
  });
  net.on('run_joined', (d) => {
    if (d.myId) myId = d.myId;
    lobby = { runId: d.runId, room: d.room, name: d.name, epoch: d.epoch, state: d.state, info: d.lobby };
    lobbyNote = '';
    if (mode !== 'run') showLobby();
  });
  net.on('run_members', (d) => {
    if (!lobby || d.runId !== lobby.runId) return;
    lobby.info = d.lobby; lobby.state = d.state; lobby.epoch = d.epoch;
    if (run && mode === 'run' && d.epoch === run.epoch) {
      runHostId = d.hostId;
      const wasHost = run.isHost;
      run.setMembers(d.members || [], d.hostId);
      if (!run.isHost && (!helloSent || wasHost)) {
        helloSent = true;
        net.runRelay({ k: 'hello' }, d.hostId, run.epoch);
      }
    }
    if (lobbyView === 'lobby' && mode !== 'run') showLobby();
  });
  // Старт (или рестарт) забега экземпляра: всегда НОВАЯ симуляция с нуля
  net.on('run_start', (d) => {
    if (!lobby || d.runId !== lobby.runId) return;
    lobby.epoch = d.epoch; lobby.state = 'running';
    if (mode === 'run') exitRun(true);
    runRoom = d.room;
    runHostId = d.hostId;
    startRun(d.room, d.hostId === myId, d.epoch);
  });
  // Сервер сбросил экземпляр (гибель отряда / победа / опустел): старое состояние забега больше не действительно
  net.on('run_reset', (d) => {
    if (!lobby || d.runId !== lobby.runId) return;
    lobby.epoch = d.epoch; lobby.state = 'lobby';
    lobbyNote = d.reason === 'wipe' ? '💀 Отряд пал — забег сброшен. Можно начать заново.' : d.reason === 'finish' ? '✔ Забег завершён и сброшен.' : 'Забег сброшен.';
    if (run && mode === 'run') {
      run.stale = true;
      if (!run.ended) run.finish(d.reason === 'wipe' ? 'Отряд пал' : 'Забег завершён');
    } else if (lobbyView === 'lobby') showLobby();
  });
  net.on('run_gaveup', () => {
    sendRunResult();
    if (mode === 'run') exitRun(true);
    lobbyNote = lobby?.state === 'running' ? '🏳 Вы сдались. Отряд ещё сражается — дождитесь конца забега или выйдите в мир.' : '';
    showLobby();
  });
  net.on('run_left', () => {
    lobby = null;
    if (mode === 'run') exitRun();
    if (lobbyView) { lobbyView = null; overlay.hideScreen(); }
  });
  net.on('run_relay', (d) => { if (run && lobby && d.runId === lobby.runId && d.epoch === run.epoch) run.onRelay(d.from, d.data); });

  // ---------------- лобби ----------------
  const CLASS_ICON = { warrior: '🛡️', spearman: '🔱', rogue: '🗡️', mage: '🔮' };
  function openBrowser(roomId, portalId) {
    browserRoom = roomId; browserPortal = portalId || null;
    lobbyListData = [];
    lobbyView = 'browser';
    renderBrowser();
    net.lobbyList(roomId);
  }
  function renderBrowser() {
    const room = RUN_ROOMS[browserRoom];
    if (!room) return;
    const max = room.mode === 'duel' ? 2 : 4;
    const rows = lobbyListData.map((l) => {
      const cls = l.members.map((m) => CLASS_ICON[m.classId] || '👻').join('');
      const can = l.state === 'lobby' && l.count < l.max;
      return `<div class="mc-lobby-row"><span class="nm">${esc(l.name)} <small>${cls}</small></span><small>${l.count}/${l.max}</small>
        <span class="st ${l.state === 'running' ? 'run' : ''}">${l.state === 'running' ? 'в забеге' : 'ожидание'}</span>
        <button class="mc-btn ${can ? 'gold' : ''}" data-join="${esc(l.id)}" ${can ? '' : 'disabled'}>Войти</button></div>`;
    }).join('') || '<p class="mc-dim">Открытых лобби нет — создайте своё.</p>';
    const el = overlay.showScreen(`<div class="mc-lobby"><h2 style="color:${room.color}">${esc(room.name)}</h2>
      <div class="sub">${esc(room.desc)}<br>Вход только в лобби в режиме ожидания (в идущий забег войти нельзя). До ${max} игроков.</div>
      ${rows}
      <div class="mc-lobby-form"><input type="text" maxlength="24" placeholder="Название лобби (необязательно)" class="mc-lobby-name">
        <label><input type="checkbox" class="mc-lobby-public" checked> открытое</label></div></div>`,
    [
      { text: '＋ Создать лобби', cls: 'gold', id: 'mc-lobby-create', onClick: () => {
        const name = el.querySelector('.mc-lobby-name')?.value || '';
        const isPublic = !!el.querySelector('.mc-lobby-public')?.checked;
        net.lobbyCreate(browserRoom, browserPortal, { name, isPublic });
      } },
      { text: '▶ Один', id: 'mc3d-run-start', onClick: () => net.lobbyCreate(browserRoom, browserPortal, { isPublic: false, autoStart: true }) },
      { text: '↻', cls: 'ghost', onClick: () => net.lobbyList(browserRoom) },
      { text: 'Закрыть', cls: 'ghost', onClick: () => { lobbyView = null; overlay.hideScreen(); } },
    ], 'mc-lobby-screen');
    el.querySelectorAll('[data-join]').forEach((b) => b.addEventListener('click', (e) => { e.stopPropagation(); net.lobbyJoin(b.dataset.join, browserPortal); }));
    el.querySelector('.mc-lobby-name')?.addEventListener('keydown', (e) => e.stopPropagation());
  }
  function showLobby() {
    if (!lobby) return;
    lobbyView = 'lobby';
    const room = RUN_ROOMS[lobby.room] || { name: lobby.room, color: '#fff' };
    const info = lobby.info || { members: [] };
    const meIsLeader = info.leaderId === myId;
    const me = info.members.find((m) => m.id === myId);
    const allReady = info.members.every((m) => m.ready);
    const running = lobby.state === 'running';
    const rows = info.members.map((m) => `<div class="mc-lobby-row"><span class="nm" style="color:${esc(m.color)}">${m.leader ? '👑 ' : ''}${esc(m.username)}</span>
      <small>${CLASS_ICON[m.classId] || '👻'} ${esc(displayClassName(m.classId))}</small>
      <span class="st ${m.ready ? '' : 'run'}">${running ? (m.out ? 'сдался' : m.dead ? 'пал' : 'в забеге') : m.ready ? 'готов' : 'не готов'}</span></div>`).join('');
    const caps = room.mode === 'duel' && !running ? `<div class="caps">Кап здоровья (звёздные задания Кьют): ${[100, 50, 30].map((c) => `<button class="mc-btn ${runOpts.hpCapPct === c ? 'on' : ''}" data-cap="${c}">${c}%</button>`).join('')}</div>` : '';
    const btns = [];
    if (!running) {
      if (meIsLeader) btns.push({ text: allReady ? '▶ Начать забег' : `▶ Начать (готовы ${info.members.filter((m) => m.ready).length}/${info.members.length})`, cls: 'gold', id: 'mc3d-run-start', onClick: () => net.lobbyStart() });
      else btns.push({ text: me?.ready ? '✖ Не готов' : '✔ Готов', cls: me?.ready ? '' : 'gold', id: 'mc-lobby-ready', onClick: () => net.lobbyReady(!me?.ready) });
    }
    btns.push({ text: '⟵ Выйти в мир', cls: 'ghost', id: 'mc-lobby-leave', onClick: () => { lobbyView = null; overlay.hideScreen(); net.runLeave(); } });
    const el = overlay.showScreen(`<div class="mc-lobby"><h2 style="color:${room.color}">${esc(room.name)} · ${esc(lobby.name || '')}</h2>
      <div class="sub">${info.isPublic === false ? '🔒 закрытое' : '🌐 открытое'} · ${info.count || info.members.length}/${info.max || 4} · ${running ? 'забег идёт' : 'ожидание'}${meIsLeader ? ' · вы лидер' : ''}</div>
      ${lobbyNote ? `<p style="color:#fcd34d">${esc(lobbyNote)}</p>` : ''}
      ${rows}${caps}
      <p class="mc-dim">Лидер начинает, когда все готовы. Каждый старт — новый забег с нуля (уровень 1, без старых мобов). Гибель всего отряда сбрасывает забег.</p></div>`, btns, 'mc-lobby-screen');
    el.querySelectorAll('[data-cap]').forEach((b) => b.addEventListener('click', (e) => { e.stopPropagation(); runOpts.hpCapPct = Number(b.dataset.cap); showLobby(); }));
  }
  function backToLobby() {
    sendRunResult();
    if (mode === 'run') exitRun(true);
    if (lobby) showLobby();
  }
  function giveUp() {
    if (!run || !run.me.dead || run.ended) return;
    if (lobby && net.isOpen() && run.epoch) net.runGiveUp(run.epoch);
    else { run.finish('Вы сдались'); }
  }

  // ---------------- забег ----------------
  // Портал забега → браузер лобби (онлайн) или соло-забег без сервера (офлайн).
  // quick — сразу свой закрытый экземпляр и старт (отладка, глубокая ссылка).
  function requestRun(roomId, portalId, quick = false) {
    if (mode === 'run') return;
    if (net.isOpen() && myId) {
      if (lobby) { showLobby(); return; }
      if (quick) net.lobbyCreate(roomId, portalId, { isPublic: false, autoStart: true });
      else openBrowser(roomId, portalId);
    } else {
      runRoom = roomId;
      startRun(roomId, true, 0);
    }
  }

  function startRun(roomId, isHost, epoch = 0) {
    if (mode === 'run' && run) return;
    const solo = !lobby; // офлайн: без сервера
    lobbyView = null;
    overlay.hideScreen();
    classSelect.isOpen = false; statsUI.isOpen = false;
    const classKey = RUN_CLASSES[player.stats.classId] ? player.stats.classId : 'soul';
    run = new RunSession({
      room: roomId, myId: myId || 'local', username, color: player.color,
      classKey, serverClass: CLASSES[player.stats.classId] || null,
      meta: classKey !== 'soul' && meta.hero?.cls === classKey ? meta.hero.effective : null,
      hpCapPct: runOpts.hpCapPct,
      isHost: solo || !!isHost,
      send: (data, to) => { if (!solo && run && !run.stale) net.runRelay(data, to, run.epoch); },
      events: onRunEvent,
    });
    run.epoch = epoch;
    run.sentDead = false;
    helloSent = false;
    if (!solo && !run.isHost && runHostId) { helloSent = true; setTimeout(() => { if (run && run.epoch === epoch && !run.isHost) net.runRelay({ k: 'hello' }, runHostId, epoch); }, 300); }
    const arena = new RunArena(RUN_ROOMS[roomId]?.theme || 'crypt');
    hub.detach();
    runView = new RunView(THREE, stage.scene, run, arena);
    stage.setEnvironment(arena);
    mode = 'run';
    runUI.show(true);
    runUI.setAbilities(run.me.abilities);
    run.resultSent = false;
    book.close(); dialog.close();
    tracker.show(false);
    touch.setMode('run');
    overlay.clearFloats();
    stage.follow(run.me.x, run.me.z, 0, true);
    const rm = RUN_ROOMS[roomId];
    overlay.toast(rm?.mode === 'duel' ? `«${rm.name}»: победите отражение!` : rm?.mode === 'trial' ? `«${rm.name}»: удержите Сердце 8 волн!` : `«${rm?.name || roomId}»: продержитесь как можно дольше!`, rm?.color);
    api.run = run;
  }

  function leaveRun() {
    sendRunResult();
    if (net.isOpen() && lobby && myId) {
      net.runLeave();
      const r = run;
      // страховка: если сервер не ответил run_left, выходим сами (но только из ЭТОГО забега)
      setTimeout(() => { if (mode === 'run' && run === r) exitRun(); }, 1500);
    } else if (mode === 'run') exitRun();
  }

  // Итог забега → сервер (он сам ограничит награду реальным временем в комнате)
  function sendRunResult() {
    if (!run || run.resultSent || !net.isOpen() || !runRoom || !lobby) return;
    run.resultSent = true;
    const st = run.me.stats;
    const ei = run.endInfo || {};
    send({ type: 'run_result', time: Math.round(run.t), kills: st.killsByType, bossKills: st.bossKills, usedAbility: st.usedAbility, room: runRoom,
      won: !!ei.won, wave: ei.wave ?? run.trialWave ?? 0, hpCapPct: run.hpCapPct || 100 });
  }

  // toLobby — остаёмся участником экземпляра (лобби), иначе полностью в мир
  function exitRun(toLobby = false) {
    if (mode !== 'run') return;
    tracker.show(true);
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
        if (d.boss) overlay.toast(`${ENEMIES[d.type]?.name || 'Страж'} повержен!`, '#f0abfc');
        break;
      case 'ability': overlay.toast(`${d.name}!`, '#fde68a'); break;
      case 'end':
        runUI.showResults(d, { isHost: run.isHost, coop: run.remotes.size > 0 || (d.players || []).length > 1, myId: run.myId });
        sendRunResult();
        // победа в мини-игре / завершение: хост просит сервер сбросить экземпляр (гибель отряда сервер видит сам)
        if (lobby && run.isHost && !run.stale && d.won && run.epoch) net.runFinish(run.epoch);
        break;
      case 'remote_join': overlay.toast(`${run.remotes.get(d.id)?.username || 'Союзник'} в забеге`, '#4ade80'); break;
      case 'host_lost': if (!hostLostShown) { hostLostShown = true; overlay.toast('Ведущий не отвечает…', '#fcd34d'); } break;
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
  const input = { dashPressed: false, abilityPressed: false, abilitySlot: -1 };
  const isTyping = (e) => e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable);
  window.addEventListener('keydown', (e) => {
    if (isTyping(e) || net.kicked) return;
    const k = e.key.toLowerCase();
    if (e.key === 'Escape') {
      if (book.isOpen) { book.close(); return; }
      if (dialog.isOpen) { dialog.close(); return; }
      if (classSelect.isOpen) { classSelect.close(); return; }
      if (statsUI.isOpen) { statsUI.close(); return; }
      if (overlay.screen && !runUI.choiceOpen && !(run && run.ended)) { lobbyView = null; overlay.hideScreen(); return; }
      return;
    }
    if (e.key === 'Enter') { e.preventDefault(); openChat(); return; }
    if (runUI.choiceOpen) return; // 1–3 обрабатывает модалка
    keys.add(e.code);
    if (e.code === 'Space' || e.code === 'ShiftLeft' || e.code === 'ShiftRight') { input.dashPressed = true; e.preventDefault(); }
    if (!book.isOpen || mode === 'run') {
      if (k === 'q' || k === 'й') useAbility(0);
      if (k === 'r' || k === 'к') useAbility(1);
      if (k === 'f' || k === 'а') useAbility(2);
    }
    if (k === 'e' || k === 'у') interact();
    if (mode === 'hub' || !run || run.ended) {
      if (k === 'j' || k === 'о') { tracker.tutDone('book'); book.toggle('quests'); }
      if (k === 'i' || k === 'ш') { tracker.tutDone('book'); book.toggle('gear'); }
      if (k === 'k' || k === 'л') { tracker.tutDone('book'); book.toggle('skills'); }
      if (k === 't' || k === 'е' || k === 'c' || k === 'с') { tracker.tutDone('book'); book.toggle('hero'); }
      if (k === 'b' || k === 'и') { tracker.tutDone('book'); book.toggle('bestiary'); }
      if (k === 'l' || k === 'д') { tracker.tutDone('book'); book.toggle('library'); }
    }
    if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) tracker.tutDone('move');
    if (e.key === '+' || e.key === '=') zoomBy(1.15);
    if (e.key === '-' || e.key === '_') zoomBy(1 / 1.15);
    if (e.key === 'F3') { e.preventDefault(); showDebug = !showDebug; }
    if (e.code === 'KeyV' && mode === 'hub' && !overlay.chatOpen) { autoAttack = !autoAttack; localStorage.setItem('mc-autoatk', autoAttack ? '1' : '0'); overlay.toast(`Автоатака: ${autoAttack ? 'вкл' : 'выкл'}`, '#fde68a'); }
  });
  window.addEventListener('keyup', (e) => keys.delete(e.code));
  window.addEventListener('blur', () => keys.clear());
  canvas.addEventListener('wheel', (e) => { e.preventDefault(); zoomBy(e.deltaY < 0 ? 1.1 : 1 / 1.1); }, { passive: false });
  canvas.addEventListener('click', (e) => onCanvasClick(e));
  // Базовая атака в открытом мире: ЛКМ (удержание — повтор со скоростью атаки) в сторону курсора.
  // Клик по NPC/порталу/ресурсу/цветку/игроку — взаимодействие, не атака. Телефон — кнопка ⚔ с автонаведением.
  const aim = { held: false, touch: false, x: null, y: null };
  let autoAttack = localStorage.getItem('mc-autoatk') === '1'; // доступность: «автоатака» (по умолчанию выкл., клавиша V)
  function aimAt(e) {
    const g = stage.groundPoint(e.clientX, e.clientY);
    if (g) { aim.x = toPx(g.x); aim.y = toPy(g.z); }
  }
  function clickHitsInteractive(px, py) {
    for (const n of Object.values(NPCS)) if (n.world === world && Math.hypot(n.x - px, n.y - py) < 40) return true;
    for (const n of zone.nodes.values()) if (Math.hypot(n.def.x - px, n.def.y - py) < 40) return true;
    for (const p of portals) if ((p.world || 'hellfire') === world && Math.hypot(p.x - px, p.y - py) < 45) return true;
    for (const f of flowers.values()) if (Math.hypot(f.x - px, f.y - py) < 36) return true;
    for (const o of others.values()) if (o.world === world && Math.hypot(o.x - px, o.y - py) < 30) return true;
    if (world === 'hellfire') for (const o of [boss, dar]) if (o && o.state !== 'dead' && Math.hypot(o.x - px, o.y - py) < 40) return true;
    return false;
  }
  canvas.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'touch' || e.button !== 0 || mode !== 'hub' || overlay.screen || book.isOpen) return;
    aimAt(e);
    if (aim.x === null || clickHitsInteractive(aim.x, aim.y)) return;
    aim.held = true;
    try { canvas.setPointerCapture(e.pointerId); } catch (_) {}
  });
  canvas.addEventListener('pointermove', (e) => { if (aim.held) aimAt(e); });
  const aimUp = () => { aim.held = false; };
  canvas.addEventListener('pointerup', aimUp);
  canvas.addEventListener('pointercancel', aimUp);
  window.addEventListener('blur', aimUp);

  // Навык по слоту: в забеге — локально (RunSession), в мире — запрос серверу (zone_ability)
  function useAbility(slot) {
    if (mode === 'run') { input.abilitySlot = slot; return; }
    const h = meta.hero;
    const ab = h?.effective?.abilities?.[slot];
    if (!ab) { overlay.toast(h ? 'Слот навыка пуст — Книга (K)' : 'Навыки есть только у героя — Алтарь', '#94a3b8'); return; }
    const now = performance.now();
    if ((zoneSt.abilCd[ab.id] || 0) > now) return;
    zoneSt.abilCd[ab.id] = now + ab.cd * 1000;
    send({ type: 'zone_ability', id: ab.id });
    overlay.toast(`${ABILITY_BY_ID[ab.id]?.icon || '✦'} ${ABILITY_BY_ID[ab.id]?.name || ab.id}`, '#fde68a');
  }
  function refreshAbilityButtons() {
    if (mode === 'run') return;
    const now = performance.now();
    const list = (meta.hero?.effective?.abilities || []).map((a) => ({ icon: ABILITY_BY_ID[a.id]?.icon || '✦', cdLeft: Math.max(0, ((zoneSt.abilCd[a.id] || 0) - now) / 1000) }));
    touch.setAbilities(list);
  }

  function zoomBy(f) {
    const v = stage.view;
    v.targetZoom = Math.max(v.minZoom, Math.min(v.maxZoom, v.targetZoom * f));
  }
  function openChat() {
    overlay.openChat((text) => {
      if (!send({ type: 'chat', text })) overlay.bubble('__me', text);
    });
  }
  function toggleSoul() { book.toggle('hero'); }
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
    const npc = zone.nearestNpc(world, player.x, player.y);
    if (npc) { if (net.isOpen()) send({ type: 'npc_talk', npc: npc.id }); else overlay.toast('Персонажи говорят только при связи с сервером', '#fca5a5'); return; }
    const node = zone.nearestNode(player.x, player.y);
    if (node && !zoneSt.gather) {
      if (!player.stats.classId) { overlay.toast('Собирать может только герой — выберите оболочку у Алтаря', '#94a3b8'); return; }
      zoneSt.gather = { id: node.id, t: 0, x: player.x, y: player.y, res: node.def.res };
      send({ type: 'gather_start', node: node.id });
      return;
    }
    const p = nearestPortal();
    if (p) return usePortal(p);
    const f = nearestFlower();
    if (f) send({ type: f.stage === 'bud' ? 'touch_flower' : 'pick_flower', flowerId: f.id });
  }

  function usePortal(p) {
    if (p.runRoom) return net.isOpen() && myId ? requestRun(p.runRoom, p.id) : showRoomPrompt(p);
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
    overlay.showScreen(`<h2 style="color:${room.color}">${esc(room.name)}</h2>
      <p>${esc(room.desc)}</p>
      <p><span style="color:#fca5a5">Нет связи с сервером: только соло, без награды героя.</span></p>
      <p>Ваш герой: <b style="color:${cls.color}">${esc(displayClassName(player.stats.classId))}</b>${meta.hero ? ` · ур. ${meta.hero.lvl}` : ''}. Уровни забега сгорают по выходу; опыт героя и трофеи сохраняет сервер.</p>
      ${player.stats.classId ? '' : '<p style="color:#fcd34d">Без тела у вас нет навыков — выберите оболочку у Алтаря.</p>'}`,
    [
      ...(room.mode === 'duel'
        ? [100, 50, 30].map((cap) => ({ text: cap === 100 ? '▶ Бой' : `▶ Бой · кап ${cap}% HP`, cls: cap === 100 ? 'gold' : '', id: cap === 100 ? 'mc3d-run-start' : undefined, onClick: () => { overlay.hideScreen(); runOpts.hpCapPct = cap; requestRun(room.id, p.id); } }))
        : [{ text: room.mode === 'trial' ? '▶ Начать испытание' : '▶ Начать забег', cls: 'gold', id: 'mc3d-run-start', onClick: () => { overlay.hideScreen(); runOpts.hpCapPct = 100; requestRun(room.id, p.id); } }]),
      { text: 'Отмена', cls: 'ghost', onClick: () => overlay.hideScreen() },
    ]);
  }

  function onCanvasClick(e) {
    canvas.focus?.();
    if (mode !== 'hub' || overlay.screen || book.isOpen) return;
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
  const fpsS = { n: 0, t: 0, fps: 0, cpu: 0, cpuAcc: 0 };
  // Адаптивное качество: держим ≥ ~45 fps — сначала снижаем разрешение рендера, потом выключаем тени.
  // Возвращаем качество, если долго стабильно ≥ 57 fps. ?q=low|high фиксирует уровень.
  const maxPR = Math.min(window.devicePixelRatio || 1, mobile ? 1.5 : 2);
  const QUALITY = [
    { pr: maxPR, shadows: !mobile },
    { pr: Math.max(1, maxPR * 0.75), shadows: !mobile },
    { pr: 1, shadows: false },
    { pr: 0.75, shadows: false },
  ];
  const qForced = /[?&]q=(low|high)/.exec(location.search)?.[1];
  const quality = { level: qForced === 'low' ? 3 : 0, low: 0, high: 0, cooldown: 3 };
  function applyQuality() {
    const q = QUALITY[quality.level];
    stage.renderer.setPixelRatio(q.pr);
    if (stage.renderer.shadowMap.enabled !== q.shadows) {
      stage.renderer.shadowMap.enabled = q.shadows;
      stage.scene.traverse((o) => { if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => { m.needsUpdate = true; }); });
    }
    stage.resize(true);
  }
  if (quality.level) applyQuality();
  function adaptQuality(realDt) {
    if (qForced) return;
    quality.cooldown -= realDt;
    const fps = 1 / Math.max(1e-3, realDt);
    if (fps < 42) { quality.low += realDt; quality.high = 0; } else if (fps > 57) { quality.high += realDt; quality.low = Math.max(0, quality.low - realDt); }
    if (quality.cooldown > 0) return;
    if (quality.low > 2.5 && quality.level < QUALITY.length - 1) { quality.level++; applyQuality(); quality.low = 0; quality.cooldown = 4; }
    else if (quality.high > 12 && quality.level > 0) { quality.level--; applyQuality(); quality.high = 0; quality.cooldown = 8; }
  }
  api.perf = () => ({ fps: fpsS.fps, cpuMs: +fpsS.cpu.toFixed(2), quality: quality.level, pixelRatio: stage.renderer.getPixelRatio(), shadows: stage.renderer.shadowMap.enabled, calls: stage.renderer.info.render.calls, tris: stage.renderer.info.render.triangles, enemies: run ? run.enemies.size : 0 });
  const debugEl = document.createElement('div');
  debugEl.style.cssText = 'position:absolute;left:6px;bottom:6px;font:10px monospace;color:#a3e635;text-shadow:0 1px 2px #000;pointer-events:none;white-space:pre';
  overlay.layer.appendChild(debugEl);

  function frame(now) {
    requestAnimationFrame(frame);
    const realDt = Math.max(0, (now - last) / 1000);
    const dt = Math.min(0.05, realDt);
    last = now;
    fpsS.n++; fpsS.t += realDt;
    if (fpsS.t >= 0.5) { fpsS.fps = Math.round(fpsS.n / fpsS.t); fpsS.cpu = fpsS.cpuAcc / fpsS.n; fpsS.n = 0; fpsS.t = 0; fpsS.cpuAcc = 0; }
    if (realDt < 1) adaptQuality(realDt);
    const cpu0 = performance.now();
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
    fpsS.cpuAcc += performance.now() - cpu0;
    hudAcc += dt;
    if (hudAcc > 0.15) {
      hudAcc = 0;
      hud.update({
        player, username, mode, run, ping: net.ping, online: others.size + 1, zoom: stage.view.zoom,
        roomCounts, runRoom, otherPlayers: [...others.values()].filter((o) => !o.runRoom), boss, portals, world,
        lastFaceDir: { x: player.dirX, y: player.dirY }, nearby: nearbyList(), dash,
      });
    }
    if (showDebug) {
      const info = stage.renderer.info.render;
      debugEl.textContent = `${fpsS.fps} fps · cpu ${fpsS.cpu.toFixed(1)}ms · q${quality.level} · calls ${info.calls} · tris ${info.triangles} · ${mode}${run ? ` · enemies ${run.enemies.size} · ${run.isHost ? 'host' : 'guest'}` : ''} · models ${modelMode()} · ${net.offline ? 'offline' : net.isOpen() ? 'online' : '…'}`;
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
    // движение
    const blocked = overlay.screen || overlay.chatOpen || net.kicked;
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
      const wsz = worldSize(world);
      const nx = Math.max(16, Math.min(wsz - 16, player.x + vx * dt));
      const ny = Math.max(16, Math.min(wsz - 16, player.y + vy * dt));
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
      me: { x: player.x, y: player.y, dirX: player.dirX, dirY: player.dirY, moving: player.moving, classId: player.stats.classId, look: meta.hero?.effective?.look || null, color: player.color, scale: dash.active ? 1.08 : 1, blink: zone.me && zone.me.alive === false },
      others: visibleOthers.map((o) => ({ key: o.id, x: o.x, y: o.y, dirX: o.dirX, dirY: o.dirY, moving: o.moving, stats: o.stats, look: o.stats?.look || null, color: o.color })),
      boss: world === 'hellfire' ? boss : null,
      dar: world === 'hellfire' ? dar : null,
      flowers: world === 'hellfire' ? flowers : new Map(),
    });

    // камера
    window.__GAME_CAMERA__ = { x: player.x, y: player.y, zoom: stage.view.zoom };
    stage.useOrtho = false;
    stage.follow(toX(player.x), toZ(player.y), dt);

    // открытый мир: мобы/ресурсы/NPC сервера, атака по клику, сбор
    zone.update(dt, world);
    zoneTick(dt, now);

    // подписи
    overlay.beginFrame();
    const head = (x, y, h = 2.5) => stage.project(toX(x), h, toZ(y));
    const alive = new Set(['__me']);
    let p = head(player.x, player.y);
    if (p) {
      const zm = zone.me;
      const hpBar = player.stats.classId && zm && zm.maxHp && zm.hp < zm.maxHp ? `<div class="mc3d-mini-hp"><i style="width:${Math.max(0, Math.round((zm.hp / zm.maxHp) * 100))}%"></i></div>` : '';
      overlay.label('me', p.x, p.y, `${esc(username)}<small>${esc(displayClassName(player.stats.classId))}${meta.hero ? ` · ур. ${meta.hero.lvl}` : ''}${player.shield ? ` · 🛡️${player.shield}` : ''}</small>${hpBar}`, '#ffd700');
      overlay.placeBubble('__me', p.x, p.y - 26);
    }
    visibleOthers.forEach((o) => {
      alive.add(o.id);
      const q = head(o.x, o.y);
      if (!q) return;
      overlay.label('p_' + o.id, q.x, q.y, `${esc(o.username)}<small>${esc(displayClassName(o.stats?.classId))}${o.stats?.lvl ? ` · ур. ${o.stats.lvl}` : ''}</small>`, o.color);
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
    // NPC: имя и значок задания (❕ — есть задание, ✔ — можно сдать)
    for (const [id, n] of Object.entries(NPC_LIST)) {
      if (n.world !== world) continue;
      const q = stage.project(toX(n.x), 3.0, toZ(n.y));
      if (!q) continue;
      const mark = npcMark(id);
      overlay.label('npc_' + id, q.x, q.y, `${mark ? `<b class="mc-npc-mark">${mark}</b>` : ''}${esc(n.name)}<small>${esc(n.title)}</small>`, n.color);
    }
    // мобы мира с неполным здоровьем — полоска
    for (const o of zone.mobs.values()) {
      if (o.hp >= 100 && !ZONE_BOSS[o.type]) continue;
      const q = stage.project(toX(o.x), ZONE_BOSS[o.type] ? 6.4 : 2.6, toZ(o.y));
      if (!q) continue;
      overlay.label('zm_' + o.id, q.x, q.y, `${ZONE_BOSS[o.type] ? esc(ZONE_BOSS[o.type]) : ''}<div class="mc3d-mini-hp"><i style="width:${o.hp}%"></i></div>`, ZONE_BOSS[o.type] ? '#c084fc' : '#e2e8f0');
    }
    overlay.cleanupBubbles(alive);
    overlay.endFrame();
    overlay.updateFloats(dt, (x, y, z) => stage.project(x, y, z));

    // подсказка действия
    let promptText = '';
    if (!overlay.screen) {
      const key = touch.isMobileTouch ? '✋' : 'E';
      const npc = zone.nearestNpc(world, player.x, player.y);
      const node = npc ? null : zone.nearestNode(player.x, player.y);
      const np = npc || node ? null : nearestPortal();
      const nf = npc || node || np ? null : nearestFlower();
      const nearAltar = world === 'hellfire' && Math.hypot(player.x - ALTAR.x, player.y - ALTAR.y) < 110;
      if (zoneSt.gather) promptText = `Сбор: ${zone.resName(zoneSt.gather.res)} ${Math.round(Math.min(1, zoneSt.gather.t / (zone.gatherTime() / 1000)) * 100)}%`;
      else if (npc) promptText = `${key} — поговорить: ${npc.name}`;
      else if (node) promptText = `${key} — собрать: ${zone.resName(node.def.res)}`;
      else if (np) promptText = `${key} — ${np.runRoom ? 'войти: ' : ''}${np.name}${np.id === 'portal_class_select' ? ' (выбор героя · ветка души)' : ''}`;
      else if (nf) promptText = `${key} — ${nf.stage === 'bud' ? 'тронуть бутон (-1 HP)' : 'сорвать цветок (+20 щит)'}`;
      if (nearAltar && !np && (meta.account?.creation || meta.account?.soul?.length)) promptText += ' · 🜏 ветка души — Книга';
      touch.setInteractHighlight(!!(npc || node || np || nf));
    }
    overlay.setPrompt(promptText);
    tracker.update({ world, x: player.x, y: player.y, hasClass: !!player.stats.classId, online: net.isOpen() && !net.offline, mobsNear: !!zone.nearestMob(player.x, player.y, 400), near: { altar: world === 'hellfire' && Math.hypot(player.x - ALTAR.x, player.y - ALTAR.y) < 90 } });
    refreshAbilityButtons();
  }

  // Атака по клику (ЛКМ к курсору / ⚔ с автонаведением) и сбор в общем мире (сервер проверяет дальность, перезарядку и всё остальное)
  function zoneTick(dt, now) {
    if (!net.isOpen() || !myId) return;
    const hasHero = !!player.stats.classId;
    if (zoneSt.gather) {
      const g = zoneSt.gather;
      g.t += dt;
      if (Math.hypot(player.x - g.x, player.y - g.y) > 30) { zoneSt.gather = null; overlay.toast('Сбор прерван: вы отошли', '#94a3b8'); }
      else if (g.t * 1000 >= zone.gatherTime() + 60) { send({ type: 'gather_done', node: g.id }); zoneSt.gather = null; }
      return;
    }
    if (!hasHero || overlay.screen || book.isOpen || zone.me?.alive === false) return;
    const wt = zone.myWeaponType(player.stats.classId);
    const atkMs = (WEAPON_TYPES[wt]?.cd || ZONE_ATK_MS) / (1 + Math.max(0, meta.state?.hero?.effective?.atkSpeedPct || 0) / 100);
    if (now - zoneSt.lastAtk < atkMs) return;
    let dir = null;
    if (aim.held && aim.x !== null) {
      // мышь: удар в сторону курсора (точка на земле)
      const dx = aim.x - player.x, dy = aim.y - player.y, d = Math.hypot(dx, dy);
      dir = d > 1 ? { x: dx / d, y: dy / d } : { x: player.dirX || 0, y: player.dirY || 1 };
    } else if (aim.touch) {
      dir = zone.assistDir(player.x, player.y, player.dirX || 0, player.dirY || 1, wt);
    } else if (autoAttack) {
      const target = zone.nearestMob(player.x, player.y);
      if (target) { const dx = target.x - player.x, dy = target.y - player.y, d = Math.hypot(dx, dy) || 1; dir = { x: dx / d, y: dy / d }; }
    }
    if (!dir) return;
    zoneSt.lastAtk = now;
    send({ type: 'zone_attack', dx: Math.round(dir.x * 1000) / 1000, dy: Math.round(dir.y * 1000) / 1000 });
    const pred = zone.aimTargets(player.x, player.y, dir.x, dir.y, wt);
    const first = pred.list[0];
    const reach = pred.atk.kind === 'arc' ? pred.atk.range * 0.8 : pred.atk.range;
    if (first && pred.atk.kind === 'proj') zone.shoot(player.x, player.y, first.id, wt);
    else zone.shoot(player.x, player.y, null, wt, player.x + dir.x * reach, player.y + dir.y * reach);
    if (!player.moving) { player.dirX = dir.x; player.dirY = dir.y; }
    hub.attackMe?.();
    if (pred.list.length) tracker.tutDone('fight');
  }
  function npcMark(id) {
    const st = meta.state;
    if (!st) return '';
    for (const qid of st.complete || []) if (QUEST_BY_ID[qid]?.npc === id && !QUEST_BY_ID[qid].auto) return '✔';
    for (const qid of st.available || []) if (QUEST_BY_ID[qid]?.npc === id && !st.account.quests.active[qid]) return '❕';
    return '';
  }

  function runFrame(dt, now) {
    // Сообщаем серверу о гибели/подъёме (он решает, погиб ли отряд целиком → сброс экземпляра)
    if (lobby && run.epoch && !run.stale && run.me.dead !== run.sentDead) { run.sentDead = run.me.dead; net.runDead(run.epoch, run.me.dead); }
    // Страховка паузы выбора улучшения: пока есть невыбранные улучшения, модалка должна быть открыта.
    // Если её перекрыло/закрыло другое окно (чат, книга, диалог, итоги…), открываем снова — иначе соло-забег
    // стоит на паузе без видимого выбора («зависание» после уровня).
    if (run.pendingChoices > 0 && !run.ended) {
      if (runUI.choiceOpen && overlay.screen !== runUI.choiceEl) { runUI.choiceOpen = false; runUI.choiceEl = null; }
      if (!runUI.choiceOpen && !overlay.screen && !overlay.chatOpen) onRunEvent('levelup', { level: run.team.level });
    } else if (runUI.choiceOpen && (run.pendingChoices <= 0 || run.ended)) runUI.closeChoices();
    const blocked = overlay.chatOpen || (overlay.screen && !runUI.choiceOpen && !run.ended);
    const mv = blocked ? { x: 0, y: 0 } : moveVector();
    run.update(dt, { x: mv.x, z: mv.y, dash: input.dashPressed, slot: input.abilitySlot });
    input.dashPressed = false; input.abilityPressed = false; input.abilitySlot = -1;
    touch.setAbilities(run.me.abilities);
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
      overlay.label('e_' + e.id, q.x, q.y, `${e.boss ? esc(def.name) : '★ ' + esc(def.name || e.type)}<div class="mc3d-mini-hp"><i style="width:${hp}%"></i></div>`, e.boss ? '#f0abfc' : '#facc15');
    }
    const q = stage.project(run.me.x, 2.6, run.me.z);
    if (q) overlay.placeBubble('__me', q.x, q.y - 10);
    overlay.endFrame();
    overlay.updateFloats(dt, (x, y, z) => stage.project(x, y, z));
    overlay.setPrompt('');
  }

  api.state = () => ({ mode, world, myId, player: { ...player }, others: others.size, run: run ? { t: run.t, enemies: run.enemies.size, level: run.team.level, kills: run.team.kills, isHost: run.isHost, remotes: run.remotes.size, hp: run.me.hp, dead: run.me.dead, ended: run.ended } : null, net: { open: net.isOpen(), offline: net.offline } });
  api.startRun = (room = 'crypt') => requestRun(room, null, true);
  api.lobby = () => lobby;
  if (showDebug) {
    // отладочные хуки для автотестов (только с ?debug=1)
    api.debug = {
      teleport: (x, y) => { player.x = x; player.y = y; },
      // экранная точка мировой позиции (px мира) — для тестов клика мышью
      screenOf: (x, y) => {
        const v = new THREE.Vector3(toX(x), 0, toZ(y)).project(stage.activeCamera());
        const r = canvas.getBoundingClientRect();
        return { x: r.left + (v.x + 1) / 2 * r.width, y: r.top + (1 - v.y) / 2 * r.height };
      },
      aim: () => ({ ...aim, autoAttack }),
      selectClass: (id) => classSelect.onSelect(id),
      setZoom: (z) => { stage.view.targetZoom = z; stage.view.zoom = z; },
      spawn: (type, n = 1, elite = false) => { if (run) for (let i = 0; i < n; i++) run.spawnEnemy(type, run.me, null, { elite }); },
      openBook: (tab) => book.open(tab),
      send: (m) => send(m), // тесты: dev_grant работает только при MC_DEV_TRUST_USERID=1 (локально)
      overlay, runUI, zone,
      WEAPONS,
    };
  }
  api.leaveRun = () => leaveRun();
  requestAnimationFrame(frame);
  canvas.focus?.();
}
