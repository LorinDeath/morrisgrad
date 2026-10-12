// «Проклятые» — 3D-ядро. Точка входа прежняя: initGame(canvasId, username, userId) (импортируется index.astro).
//
// Хаб: общий мир сервера (Адское Пламя / Аринар) в 3D, тот же WebSocket-протокол (join/move/use_portal/...).
// Забег: Vampire Survivors-подобный режим в отдельной 3D-арене; вход через порталы-комнаты (run_join),
// co-op синхронизация через run_relay (ведущий — авторитет орды). См. survivors/run.js.
import { loadThree } from './engine/three-loader.js';
import { Stage } from './engine/stage.js';
import { toX, toZ, toPx, toPy } from './engine/geometry.js';
import { worldSize, worldBounds } from '../../../../server/worlds/sizes.ts';
import { initModelMode, preloadCharacterSheets, modelMode } from './engine/characters.js';
import { loadPixAtlases } from './engine/pixSprites.js';
import { MetaClient } from './meta/metaClient.js';
import { Book } from './ui/book.js';
import { QuestTracker } from './ui/tracker.js';
import { NpcDialog } from './ui/dialog.js';
import { ZoneView } from './hub/zoneView.js';
import { RESOURCES, RARITIES, ABILITY_BY_ID, HERO_NAMES, NPCS, MOB_INFO as ZONE_MOBS, WEAPON_TYPES, abilitySlots } from '../../../../server/meta/shared.ts';
import { ITEM_BY_ID, addCards, iconHtml } from './meta/itemCards.js';
import { QUEST_BY_ID } from '../../../../server/meta/quests.ts';
import { NetClient } from './net.js';
import { HubWorld } from './hub/hubWorld.js';
import { RunSession, LVL_INVULN } from './survivors/run.js';
import { RunView } from './survivors/runView.js';
import { RunArena } from './survivors/arena.js';
import { atmo } from './engine/atmosphere.js';
import { RUN_ROOMS, RUN_CLASSES, ENEMIES, WEAPONS, PASSIVES, displayClassName } from './survivors/data.js';
import { ActionBar } from './ui/actionBar.js';
import { Overlay, esc } from './ui/overlay.js';
import { RunUI } from './ui/runUI.js';
import { ClassSelect } from './ui/classSelect.js';
import { GameHUD } from './hud.js';
import { Social } from './ui/social.js';
import { DuelUI } from './ui/duel.js';
import { TouchControls, isMobileDevice } from './touchControls.js';
import { StatsUI, DEFAULT_STATS } from './playerStats.js';
import { CLASSES, syncClassesFromServer } from './classes.js';
import { WORLD_PORTALS as OFFLINE_PORTALS } from '../../../../server/worlds/portals.ts';
import { CHARACTER_CLASSES as OFFLINE_CLASSES } from '../../../../server/classes.ts';
import './styles/core3d.css';

const WORLD_SIZE = 1200;
const MOVE_SPEED = 175;
const DASH = { duration: 0.22, speed: 620, cooldown: 0.9 };
const PORTAL_RANGE = 85;
const FLOWER_RANGE = 56;
const ALTAR = { x: 565, y: 600 };
const NPC_LIST = NPCS;
const ZONE_BOSS = Object.fromEntries(Object.entries(ZONE_MOBS).filter(([, m]) => m.boss).map(([k, m]) => [k, m.name]));
const ZONE_ATK_MS = 480;

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
  atmo.init(THREE, stage, { mobile });
  let atmoWorld = null;
  overlay.hideScreen();

  const player = {
    x: WORLD_SIZE / 2 + 60, y: WORLD_SIZE / 2 + 40, color: '#ffffff', dirX: 0, dirY: 1, moving: false,
    stats: { ...DEFAULT_STATS }, shield: 0, inDuel: false,
  };
  const dash = { active: false, timer: 0, cd: 0, max: DASH.cooldown, dirX: 0, dirY: 1 };
  let world = 'hellfire';
  let portals = OFFLINE_PORTALS.slice();
  let myId = null;
  const others = new Map();
  let boss = null, dar = null;
  const flowers = new Map();
  let mode = 'hub';
  let run = null, runView = null, runRoom = null, runHostId = null, helloSent = false;
  const runOpts = { hpCapPct: 100 };
  let lobby = null;
  let lobbyView = null;
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

  const classSelect = new ClassSelect(overlay, (classId) => {
    if (!send({ type: 'select_class', classId })) {
      const c = CLASSES[classId];
      if (c) {
        player.stats = { classId, hp: c.hp, maxHp: c.maxHp, armor: c.armor, minAtk: c.minAtk, maxAtk: c.maxAtk };
        player.color = c.color;
        overlay.toast(`Вы обрели тело: ${displayClassName(classId, c.name)}`, c.color);
      }
    }
  });
  const statsUI = new StatsUI(overlay);
  const meta = new MetaClient(send);
  api.meta = meta;
  queueMicrotask(() => { api.book = book; });
  const book = new Book(overlay, meta, {
    canSoul: () => mode === 'hub' && world === 'hellfire' && Math.hypot(player.x - ALTAR.x, player.y - ALTAR.y) <= 110,
    nearPetr: () => mode === 'hub' && !!zone.nearestNpc(world, player.x, player.y) && zone.nearestNpc(world, player.x, player.y).id === 'petr',
  });
  const tracker = new QuestTracker(overlay, meta, { onOpenBook: () => book.toggle('quests'), mobile });
  const dialog = new NpcDialog(overlay, meta);
  dialog.onCraft = () => book.open('craft');
  const zoneSt = { lastAtk: 0, gather: null, abilCd: {}, abilSrv: {}, abilPend: {}, hurtShown: 0 };
  const abar = new ActionBar(overlay.layer, {
    onSlot: (i, kind) => { if (kind === 'ab') useAbility(i); else if (kind === 'dash') input.dashPressed = true; },
  });
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
    onRating: () => openRating(),
    onInspect: (sid) => inspectPlayer(sid),
    onDuel: (sid) => challengeDuel(sid),
  });
  const touch = new TouchControls(overlay.layer, {
    onRating: () => openRating(),
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

  // ... (остальной код остался без изменений, кроме useAbility)

  function useAbility(slot) {
    if (mode === 'run') { input.abilitySlot = slot; return; }
    const h = meta.hero;
    const ab = h?.effective?.abilities?.[slot];
    if (!ab) { overlay.toast(h ? 'Слот навыка пуст — Книга (K)' : 'Навыки есть только у героя — Алтарь', '#94a3b8'); return; }
    const now = performance.now();
    if ((zoneSt.abilCd[ab.id] || 0) > now) return;
    zoneSt.abilCd[ab.id] = now + Math.min(1500, ab.cd * 1000);
    zoneSt.abilPend[ab.id] = now;
    send({ type: 'zone_ability', id: ab.id, dx: player.dirX, dy: player.dirY });
    overlay.toast(`${ABILITY_BY_ID[ab.id]?.icon || '✦'} ${ABILITY_BY_ID[ab.id]?.name || ab.id}`, '#fde68a');
  }

  // (остальной код не менялся)
}
