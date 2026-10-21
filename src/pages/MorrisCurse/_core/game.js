// «Проклятые» — 3D-ядро. Точка входа прежняя: initGame(canvasId, username, userId) (импортируется index.astro).
//
// Хаб: общий мир сервера (Адское Пламя / Аринар) в 3D, тот же WebSocket-протокол (join/move/use_portal/...).
// Забег: Vampire Survivors-подобный режим в отдельной 3D-арене; вход через порталы-комнаты (run_join),
// co-op синхронизация через run_relay (ведущий — авторитет орды). См. survivors/run.js.
import { fmtBig } from './fmtNum.js';
import { showError, hookGlobalErrors, setErrSink } from './boot/errorBox.js'; // коды ошибок (src/errors/codes.js)
import { resolveWorld } from '../../../../server/meta/propCollision.ts';
import { tickSpriteTime, loadAtlasTexture } from './engine/spriteBatch.js';
import { initGrim, grimSet, onGrimStyle } from './ui/grim.js';
import { UnifyPass } from './engine/unify.js';
import { fog } from './map/fog.js';
import { WorldMap } from './map/worldMap.js';
import { loadThree } from './engine/three-loader.js';
import { Stage } from './engine/stage.js';
import { toX, toZ, toPx, toPy } from './engine/geometry.js';
import { worldSize, worldBounds, VIEW_CELLS } from '../../../../server/worlds/sizes.ts';
import { initModelMode, preloadCharacterSheets, modelMode } from './engine/characters.js';
import { loadPixAtlases } from './engine/pixSprites.js';
import { MetaClient } from './meta/metaClient.js';
import { Book } from './ui/book.js';
import { UpgradeWin } from './ui/upgradeWin.js';
import { UPG } from '../../../../server/meta/upgrade.ts';
import { setCurse, glowK } from './meta/curseCfg.js';
import { setBlkVis } from './meta/blkVis.js';
import { setLightCfg, LIGHT } from './engine/pixColor.js';
import { setGfxCfg, GFX, GFX_NEXT } from './engine/gfxCfg.js';
import { PROP_STATS } from './engine/propAtlas.js';
import { VramStream, VRAM, setVramCfg, vcfg, texBytes } from './engine/vramStream.js'; // видеопамять по требованию («🖼 Графика → Видеопамять»)
import { disableCache, enableCache, cacheSummary } from './boot/assetCache.js';
import { veil } from './boot/loaderUI.js';
import { setEnch, enchName, enchText, tierOf } from './meta/enchCfg.js';
import { QuestTracker } from './ui/tracker.js';
import { NpcDialog, npcIconUrl } from './ui/dialog.js';
import { npcPos, npcUpdate, npcServer } from './meta/npcLive.js';
import { ZoneView, mobScale, MOB_VIS } from './hub/zoneView.js';
import { RESOURCES, RARITIES, ABILITY_BY_ID, HERO_NAMES, NPCS, MOB_INFO as ZONE_MOBS, WEAPON_TYPES, volleyDirs, abilitySlots, RUN_SKILL_BY_ID } from '../../../../server/meta/shared.ts';
import { ITEM_BY_ID, addCards, iconHtml, card as cardOf, cardIds } from './meta/itemCards.js';
import { QUEST_BY_ID } from '../../../../server/meta/quests.ts';
import { NetClient } from './net.js';
import { HubWorld } from './hub/hubWorld.js';
import { rsInfo } from '../../../../server/meta/rsAny.ts';
import { RunSession, LVL_INVULN } from './survivors/run.js';
import { RunView } from './survivors/runView.js';
import { RunArena } from './survivors/arena.js';
import { atmo } from './engine/atmosphere.js';
import { RUN_ROOMS, RUN_CLASSES, ENEMIES, WEAPONS, PASSIVES, displayClassName } from './survivors/data.js';
import { ActionBar } from './ui/actionBar.js';
import { Overlay, esc, roleTag } from './ui/overlay.js';
import { RunUI } from './ui/runUI.js';
import { ClassSelect } from './ui/classSelect.js';
import { GameHUD } from './hud.js';
import { Social, soundOn, setSound } from './ui/social.js';
import { DuelUI } from './ui/duel.js';
import { TouchControls, isMobileDevice } from './touchControls.js';
import { StatsUI, DEFAULT_STATS } from './playerStats.js';
import { CLASSES, syncClassesFromServer } from './classes.js';
import { WORLD_PORTALS as OFFLINE_PORTALS, HOME_PORTAL_HUB } from '../../../../server/worlds/portals.ts';
import { CHARACTER_CLASSES as OFFLINE_CLASSES } from '../../../../server/classes.ts';
import './styles/core3d.css';
import { AdminPanel } from './ui/admin.js';
import { LootWindow } from './ui/loot.js';
import { ChestWindow } from './ui/chest.js';
import { DpsMeter } from './ui/dps.js';
import { PartyUI } from './ui/party.js';
import { setCustomQuests, applyBuiltinOverride, QUESTS as ALL_QUESTS } from '../../../../server/meta/quests.ts';
import { setQuestDialogues, QUEST_DIALOGUES } from '../../../../server/meta/vnChars.ts';
import { setBossState, BOSS_STATE as BOSS_STATE_DBG } from '../../../../server/meta/markers.ts';
// правки админ-панели на клиенте: значения по путям (stats.hp, atk.range…) в общие таблицы
import { setMapZones, mapZonesKnown, biomeLabels } from './map/biomeLabels.js';
import { onMarks, onMarkOk, marks as MARKS } from './map/marks.js';
const CFG_TABLES = { weapon: WEAPON_TYPES, skill: ABILITY_BY_ID, mob: ZONE_MOBS };
let configVer = 0;
function applyConfig(d) {
  if (Number.isFinite(d?.ver)) configVer = d.ver;
  if (d?.regenCfg) globalThis.__mcRegen = d.regenCfg; // забег: восстановление в бою по настройкам админки
  for (const p of d?.patches || []) { const o = CFG_TABLES[p.kind]?.[p.id]; if (!o || !p.values) continue;
    for (const [path, v] of Object.entries(p.values)) { if (v == null || path === 'traits') continue; const ks = path.split('.'); let t = o; for (const k of ks.slice(0, -1)) t = t[k] = t[k] && typeof t[k] === 'object' ? t[k] : {}; t[ks.at(-1)] = v; } }
}

const WORLD_SIZE = 1200; // хаб; Аринар — 48000 (server/worlds/sizes.ts)
const MOVE_SPEED = 175; // px/с, как в 2D-версии
const pvpSt = { slowUntil: 0, frozenUntil: 0, swiftUntil: 0 }; // замедление/заморозка/порыв от сервера (pvp_state pstatus / buff)
const swiftSt = { until: 0 }; // Порыв сияния в открытом мире (+25% скорости на 2 с)
const DASH = { duration: 0.22, speed: 620, cooldown: 5, invulnMs: 83, blink: true }; // cooldown/invulnMs/blink — с сервера (админка «🏃 Рывок»)
const ivBlink = new Map(); // id игрока ('me' — я) → до какого времени мигать (неуязвимость рывка, dash_fx от сервера)
const blinkOn = (id) => { const u = ivBlink.get(id); if (!u) return false; const t = performance.now(); if (t > u) { ivBlink.delete(id); return false; } return Math.floor(t / 33) % 2 === 0; };
const PORTAL_RANGE = 85; // как проверка сервера
const FLOWER_RANGE = 56; // ≤ серверных 120 px: подсказка — только когда бутон рядом и виден
const ALTAR = { x: 565, y: 600 };
const NPC_LIST = NPCS;
const ZONE_BOSS = Object.fromEntries(Object.entries(ZONE_MOBS).filter(([, m]) => m.boss).map(([k, m]) => [k, m.name]));
const ZONE_ATK_MS = 480;
const MOVE_SEND_S = 0.1; // позиция на сервер не чаще 10 Гц (было 0.066 ≈ 15 Гц)

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
  hookGlobalErrors(); // непредвиденные ошибки → MC-X00 с кодом контекста (boot/errorBox.js)
  api.ready = boot(canvasId, username || 'Игрок', userId || '', api).catch((err) => {
    console.error('[MorrisCurse 3D] не удалось запустить игру', err);
    const gl = /webgl|context|renderer/i.test(String(err?.message || err));
    showError(gl ? 'MC-G02' : 'MC-X00', { detail: String(err?.stack || err).slice(0, 300), step: gl ? null : 'запуск игры' });
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

  const THREE = await loadThree().catch((e) => { throw new Error('three.min.js: ' + (e?.message || e)); });
  initModelMode();
  await Promise.all([preloadCharacterSheets(), loadPixAtlases(THREE)]);
  const stage = new Stage(THREE, canvas, { mobile });
  stage.unify = new UnifyPass(THREE, stage.renderer); onGrimStyle((v) => { stage.unify.strength = v; }); // единый стиль (engine/unify.js)
  initGrim(canvas); // мрачная цветокоррекция + дымка к краям (ui/grim.js; сила — Настройки)
  atmo.init(THREE, stage, { mobile });
  let atmoWorld = null; // 'run_crypt' | 'run_abyss' в забеге
  // видеоконтекст отобран браузером (мало видеопамяти, сброс драйвера) → MC-G01; вернулся — перезагрузка надёжнее частичного восстановления
  VRAM.inst = new VramStream(stage.renderer, stage.scene);
  stage.renderer.domElement.addEventListener('webglcontextlost', (e) => { e.preventDefault(); showError('MC-G01', { detail: 'webglcontextlost' }); }, false);
  overlay.hideScreen();
  requestAnimationFrame(() => requestAnimationFrame(() => window.dispatchEvent(new CustomEvent('mc:first-frame')))); // index.astro закрывает экран загрузки

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
  const dpsMeter = new DpsMeter(); // DPS / DPM героя (по событиям сервера)
  hub.setWorld(world, portals);
  zone.setWorld(world);
  hub.attach();

  // ---------------- сеть ----------------
  const net = new NetClient({
    username, userId,
    getToken: async () => { const t = await clerkToken(); if (userId && !t) showError('MC-A01', { soft: true, autoClose: 8000, detail: 'Clerk: пустой токен при входе ' + (window.Clerk ? (window.Clerk.loaded ? 'loaded' : 'not loaded') : 'no Clerk') }); return t; },
    guestId: guestId(),
    getJoinState: () => ({
      x: player.x, y: player.y,
      stats: { classId: player.stats.classId, hp: player.stats.hp, maxHp: player.stats.maxHp, armor: player.stats.armor, attack: player.stats.attack },
    }),
  });
  api.net = net;
  const send = (obj) => net.send(obj);

  // ---------------- UI ----------------
  const classSelect = new ClassSelect(overlay, () => api.meta?.state?.heroes || null, () => send({ type: 'save_now' }), (classId) => {
    hub.portalObjs?.get('portal_class_select')?.flash?.(); // вспышка алтаря при выборе героя
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
  queueMicrotask(() => { api.book = book; });
  const book = new Book(overlay, meta, {
    canSoul: () => mode === 'hub' && world === 'hellfire' && Math.hypot(player.x - ALTAR.x, player.y - ALTAR.y) <= 110,
    nearPetr: () => mode === 'hub' && !!zone.nearestNpc(world, player.x, player.y) && zone.nearestNpc(world, player.x, player.y).id === 'petr',
  });
  const tracker = new QuestTracker(overlay, meta, { onOpenBook: () => book.toggle('quests'), mobile });
  const dialog = new NpcDialog(overlay, meta);
  dialog.onCraft = () => book.open('craft');
  const upgWin = new UpgradeWin(overlay, meta, { nearPetr: () => mode === 'hub' && zone.nearestNpc(world, player.x, player.y)?.id === 'petr' });
  dialog.onUpgrade = () => upgWin.open();
  // NPC стоит, пока открыто окно его услуги; закрыли — может снова гулять
  { const uc = upgWin.close.bind(upgWin); upgWin.close = (...a) => { uc(...a); dialog.svcDone(); };
    const bc = book.close.bind(book); book.close = (...a) => { bc(...a); dialog.svcDone(); }; }
  api.upgWin = upgWin;
  const zoneSt = { lastAtk: 0, gather: null, abilCd: {}, abilSrv: {}, abilPend: {}, hurtShown: 0 };
  dpsMeter.mount(overlay.layer);
  const abar = new ActionBar(overlay.layer, {
    onSlot: (i, kind) => { if (kind === 'rs') useWeaponSkill(); else if (kind === 'ab') useAbility(i); else if (kind === 'dash') input.dashPressed = true; },
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
    onMap: () => { if (mode === 'hub') worldMap.toggle(); },
    onPeople: (v) => openPeople(v),
    onInspect: (sid) => inspectPlayer(sid),
    onDuel: (sid) => challengeDuel(sid),
  });
  const touch = new TouchControls(overlay.layer, {
    onHome: () => openHomePortal(),
    onRating: () => openRating(),
    onMap: () => { if (mode === 'hub') worldMap.toggle(); },
    onPeople: () => openPeople('online'),
    onDash: () => { input.dashPressed = true; },
    onWskill: () => useWeaponSkill(),
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
    if (Array.isArray(d.portals)) { portals = d.portals; homePortalKey = ''; }
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
      Object.assign(o, { username: p.username || 'Странник', sv: p.sv || null, world: p.world || 'hellfire', targetX: p.x, targetY: p.y, color: p.color || '#38bdf8', stats: p.stats || DEFAULT_STATS, inDuel: !!p.inDuel, shield: p.shield || 0, runRoom: p.runRoom || null, role: p.role || null });
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

  net.on('kicked', () => showError('MC-S02', { onRetry: () => location.reload() }));
  net.on('welcome', () => setErrSink((r) => send({ type: 'client_err', ...r }))); // коды ошибок → журнал сервера (без личных данных)
  net.on('auth_err', (d) => showError('MC-A02', { soft: true, autoClose: 8000, detail: d?.why || '' }));
  net.on('offline', (d) => {
    if (net.kicked) return;
    setErrSink(null);
    if (!offlineToastShown) showError(d.code || 'MC-N01', { soft: true, detail: d.reason, onRetry: () => location.reload() }); // офлайн-режим: соло-забеги у порталов
    offlineToastShown = true;
    if (mode === 'run' && run) { run.setMembers([], null); }
  });
  // коррекция сервера: упёрлись в твёрдый пропс иначе, чем предсказали (propCollision.ts)
  net.on('marks', (d) => { onMarks(d); worldMap.draw(); });
  net.on('mark_ok', (d) => { onMarkOk(d); worldMap.draw(); });
  net.on('mark_err', (d) => overlay.toast(d.message || 'Ошибка метки', '#fca5a5'));
  net.on('dash_fx', (d) => { if (d.blink && d.ms > 0) ivBlink.set(d.id === myId ? 'me' : d.id, performance.now() + Math.max(d.ms, 34)); });
  net.on('dash_reject', (d) => { dash.cd = Math.max(dash.cd, (d.left || 0) / 1000); });
  net.on('pos_fix', (d) => { if (Number.isFinite(d.x) && Number.isFinite(d.y)) { player.x = d.x; player.y = d.y; } else showError('MC-D01', { soft: true, autoClose: 6000, detail: 'pos_fix ' + JSON.stringify(d).slice(0, 80) }); });
  // переход между зонами: текстуры новой сцены — в очередь загрузки на GPU (≤ upMs мс/кадр), подпись «Готовим мир…» до готовности (≤ 4 с)
  const WNAME = { arinar: 'Аринар', hellfire: 'Поляна перевоплощения', arena: 'арена' };
  const prewarmWorld = (w) => {
    const vs = VRAM.inst; if (!vs) return; vs.zoneFlush();
    const seen = new Set(); stage.scene.traverse((o) => { const ms = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : []; for (const m of ms) { for (const k in m) if (m[k]?.isTexture) seen.add(m[k]); for (const k in m.uniforms || {}) if (m.uniforms[k]?.value?.isTexture) seen.add(m.uniforms[k].value); } });
    for (const t of seen) if (t.image && !vs.onGpu(t)) vs.prewarm(t);
    // подпись держится, пока очередь не пуста (её пополняют и чанки земли, и листы мага на следующем кадре), но не дольше 6 с
    veil(`Готовим мир: ${WNAME[w] || w}…`); const t0 = performance.now(); let empty = 0;
    const chk = () => { empty = vs.pending ? 0 : empty + 1; if (empty > 10 || performance.now() - t0 > 6000) veil(null); else requestAnimationFrame(chk); }; requestAnimationFrame(chk);
  };
  net.on('world_switched', (d) => {
    if (d.homePortal === 'home_portal') overlay.toast('🌀 Портал домой открыт — возвратный портал ждёт вас в хабе', '#c4b5fd');
    if (d.homePortal === 'home_portal_back') overlay.toast('🌀 Вы вернулись туда, где открыли портал', '#c4b5fd');
    world = d.world || 'hellfire';
    if (Number.isFinite(d.x) && Number.isFinite(d.y)) { player.x = d.x; player.y = d.y; } else showError('MC-D01', { soft: true, autoClose: 6000, detail: 'world_switched ' + world });
    hub.setWorld(world, portals);
    zone.setWorld(world);
    stage.follow(toX(player.x), toZ(player.y), 0, true);
    prewarmWorld(world);
    if (world !== 'arena') overlay.toast(world === 'arinar' ? 'Аринар · государство Мэлвелдил' : world === 'hellfire' ? 'Поляна перевоплощения' : `Мир: ${world}`, '#c084fc');
  });
  net.on('open_class_selection', () => { hub.portalObjs?.get('portal_class_select')?.flash?.(); classSelect.open(player.stats.classId); });
  net.on('class_updated', (d) => {
    player.stats = { ...player.stats, ...d.stats };
    if (d.color) player.color = d.color;
    const c = CLASSES[d.stats?.classId];
    overlay.toast(`Вы обрели тело: ${displayClassName(d.stats?.classId, c?.name || d.stats?.classId)}`, d.color);
  });
  // PvP-дуэли — сервер-авторитетные (ui/duel.js, server/meta/pvp.ts). Старые пошаговые бои WAP остались только
  // у ИИ Поляны (цветы-вампиры/Кейт/Дар, isBossFight): интерфейса для них нет — выходим, чтобы не «зависнуть».
  net.on('duel_start', (d) => {
    if (d && d.isBossFight === false) return; // PvP по старому протоколу сервер больше не начинает
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
  net.on('toast_error', (d) => {
    if (d.code === 'MC-A03' && /^admin/.test(d.for || '')) { try { if (adminPanel.isOpen) { adminPanel.onDenied(d); return; } } catch (_) {} } // окно админки: код вместо вечной «Загрузки данных»
    if (d.code && d.code !== 'MC-A03') showError(d.code, { soft: true, autoClose: 6000, detail: d.message }); else overlay.toast(d.message || 'Ошибка', '#fca5a5');
  });
  // Профиль: сервер может не успеть загрузить его (meta_error) — повторяем meta_get с нарастающей паузой,
  // и сторож: если после welcome нет meta_state за 8 с — тоже запрос.
  const metaLoad = { got: false, n: 0, t: 0 };
  const metaRetry = (delay) => {
    clearTimeout(metaLoad.t);
    metaLoad.t = setTimeout(() => {
      if (metaLoad.got) return;
      send({ type: 'meta_get' });
      metaRetry(Math.min(15000, 1000 * 2 ** Math.min(++metaLoad.n, 4)));
    }, delay);
  };
  net.on('welcome', () => { metaLoad.got = false; metaLoad.n = 0; metaRetry(8000); });
  net.on('meta_error', (d) => {
    if (metaLoad.n === 0) overlay.toast(d.message || 'Профиль загружается…', '#fca5a5');
    else if (metaLoad.n === 3) showError('MC-D02', { soft: true, step: 'профиль с сервера', onRetry: () => { metaLoad.n = 0; send({ type: 'meta_get' }); } });
    if (!metaLoad.got) metaRetry(Math.min(15000, 1000 * 2 ** Math.min(metaLoad.n, 4)));
  });
  net.on('offline', () => clearTimeout(metaLoad.t));
  // перезарядка навыка, подтверждённая сервером (и при успехе, и при отказе «ещё на перезарядке»)
  net.on('ability_cd', (d) => {
    const now = performance.now();
    zoneSt.abilSrv[d.id] = { until: now + (d.left || 0), total: (d.cd || 1) * 1000 };
    zoneSt.abilCd[d.id] = now + (d.left || 0);
    delete zoneSt.abilPend[d.id];
  });
  net.on('buff', (d) => { // серверные бафы навыков (Порыв сияния и т.п.)
    if (d.id === 'swift') { const u = performance.now() + (d.ms || 2000); swiftSt.until = u; pvpSt.swiftUntil = Math.max(pvpSt.swiftUntil, u); }
  });
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
    overlay.bubble(key, d.text, d.role);
  });

  // --- мета-прогрессия, квесты, открытый мир ---
  net.on('salvage_preview', (d) => book.showSalvagePreview(d));
  net.on('upgrade_result', (d) => upgWin.onResult(d));
  // условия целей квестов: сервер сообщает «попытка началась» (armed) или «✖ условие нарушено» (ok:false) — трекер показывает
  net.on('quest_cond', (d) => { const k = d.qid + ':' + d.i; tracker.cond ||= {}; tracker.cond[k] = { ok: !!d.ok, armed: !!d.armed, reason: String(d.reason || ''), kill: !!d.kill, at: Date.now() };
    if (!d.ok) overlay.toast(`✖ Условие задания нарушено: ${d.reason}${d.kill ? ' — убийство не засчитано' : ''}`, '#fca5a5'); tracker.sig = ''; });
  net.on('meta_state', (d) => {
    if (d.dash) { DASH.cooldown = Number(d.dash.cd) || DASH.cooldown; DASH.invulnMs = Number(d.dash.invulnMs) || 0; DASH.blink = d.dash.blink !== false; dash.max = DASH.cooldown; }
    if (d.gather) zone.setGlow(d.gather); // свечение узлов сбора (админка «⛏ Сбор»)
    if (d.mapZones) setMapZones(d.mapZones); // карта M: биомы и уровни мобов (с сервера, правки админки)
    if (d.upg) Object.assign(UPG, d.upg); // улучшение у Петра (админка «⚒ Улучшение») — для подписей статов и стоимости
    if (d.ench) setEnch(d.ench); // ярусы зачарования (админка «✦ Зачарование») — цвета, имена, множители для подписей
    if (d.bmv) setBlkVis(d.bmv); // вид очернения (админка «Чёрный маг»)
    if (d.light) setLightCfg(d.light); // свет мира (админка «💡 Свет», engine/pixColor.js)
    if (d.gfx) { setVramCfg(d.gfx.vram); if (d.gfx.assetCache === false) disableCache(); else if (d.gfx.assetCache === true) enableCache(); } // «🖼 Графика»: видеопамять (сразу), кэш ресурсов (выкл — снять воркер и стереть кэш)
    if (d.gfx) setGfxCfg(d.gfx); // графика пропсов (админка «🖼 Графика») — кэш, со следующей загрузки
    if (d.curse) setCurse(d.curse); // конфиг проклятия (админка) — цвет, яркость свечения, множители для подписей
    setTimeout(() => social.refreshSelf(), 0); // лист персонажа (C): таланты/параметры после изменения
    if (run && d.runTraits) run.traits = d.runTraits; // правки черт в админке — сразу и в забеге
    if (Array.isArray(d.customQuests)) setCustomQuests(d.customQuests); // квесты админ-панели (тексты для диалогов)
    if (d.questDialogues && typeof d.questDialogues === 'object') setQuestDialogues(d.questDialogues); // диалоги-новеллы
    if (d.portal !== undefined) syncHomePortal(d.portal);
    if (Array.isArray(d.configPatches)) applyConfig({ ver: d.configVer, patches: d.configPatches, regenCfg: d.regenCfg });
    if (Array.isArray(d.questOverrides)) { for (const q of ALL_QUESTS) if (!q.custom) applyBuiltinOverride(q.id, null); for (const o of d.questOverrides) applyBuiltinOverride(o.id, o); } // правки сюжетных квестов
    metaLoad.got = true; clearTimeout(metaLoad.t);
    const prevLvl = meta.hero?.lvl;
    addCards(d.loot?.cards); addCards(d.reward?.cards);
    meta.apply(d);
    updateBookBadge();
    if (d.loot) showLoot(d.loot, `☠ ${esc(d.loot.mob ? (d.loot.mob) : '')}`);
    if (d.reward) showRunReward(d.reward);
    if (d.notice) overlay.toast(d.notice, '#c4b5fd');
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
  // туман войны и большая карта (M)
  const worldMap = new WorldMap(container, () => ({ world, me: { x: player.x, y: player.y }, hunt: tracker.hunt, party: party.others().filter((m) => m.world === world && !m.run) }));
  worldMap.send = (o) => net.send(o); // метки карты — на сервер
  hud.minimap.onOpenMap = () => worldMap.open();
  net.on('fog', (d) => { fog.setFull(d); worldMap.draw(); });
  net.on('fog_add', (d) => { fog.add(d); if (worldMap.isOpen) worldMap.draw(); });
  net.on('npc_dialog', (d) => dialog.open(d.npc, d.quests));
  net.on('library', (d) => { meta.applyLibrary(d); updateBookBadge(); });
  // Рейтинг и просмотр персонажа (данные — только от сервера)
  const social = new Social({ overlay, send, onDuel: (sid) => challengeDuel(sid), onParty: (sid) => party.invite(sid), canParty: (sid) => !!sid && sid !== myId && party.canInvite(sid), canDuel: (sid) => others.has(sid) && !duel.inArena && world !== 'arena' });
  // ——— PvP-дуэли ———
  const duel = new DuelUI({ overlay, send });
  // ——— Отряд (до 4) ———
  const party = new PartyUI({ overlay, send, myId: () => myId, onJoinRun: (d) => send({ type: 'lobby_join', runId: d.runId }),
    // «＋ Пригласить»: игроки в этом мире, ближние первыми
    nearby: () => [...others.values()].filter((o) => o.world === world && !o.runRoom).map((o) => ({ id: o.id, name: o.username || 'Странник', d: Math.hypot(o.x - player.x, o.y - player.y), sub: `${o.sv ? displayClassName(o.sv.cls) + ' · ур. ' + o.sv.lvl : displayClassName(o.stats?.classId)} · ${Math.round(Math.hypot(o.x - player.x, o.y - player.y) / 20)} м` })).sort((a, b) => a.d - b.d),
    clsName: (c) => displayClassName(c), onInspect: (sid) => inspectPlayer(sid), onDuel: (sid) => challengeDuel(sid) });
  net.on('party_state', (d) => party.setState(d));
  net.on('party_invite', (d) => party.onInvite(d));
  net.on('party_run', (d) => party.onRun(d));
  function challengeDuel(sid) {
    if (!net.isOpen() || !sid) return;
    if (mode !== 'hub') { overlay.toast('Дуэль — только в открытом мире', '#94a3b8'); return; }
    if (duel.inArena) return;
    if (!player.stats.classId) { overlay.toast('Сначала выберите героя', '#94a3b8'); return; }
    send({ type: 'duel_challenge', sid: String(sid) });
  }
  net.on('pvp_invite', (d) => { duel.invite(d); overlay.toast(`⚔️ ${d.name} вызывает вас на дуэль`, '#fcd34d'); });
  net.on('duel_pending', (d) => duel.pending(d));
  net.on('duel_declined', (d) => { duel.clearPending(); overlay.toast(d.gone ? `${d.name} ушёл` : `${d.name} отказался от дуэли`, '#94a3b8'); });
  net.on('duel_expired', () => { duel.clearPending(); overlay.toast('Вызов остался без ответа', '#94a3b8'); });
  net.on('duel_closed', (d) => { if (d.from) duel.closeInvite(d.from); if (d.to) duel.clearPending(); if (d.from && !d.expired) overlay.toast('Вызов отменён', '#94a3b8'); });
  net.on('duel_err', (d) => { duel.clearPending(); overlay.toast(d.message || 'Дуэль недоступна', '#fca5a5'); });
  net.on('pvp_start', (d) => {
    if (social.isOpen) social.close();
    if (book.isOpen) book.close();
    overlay.hideScreen();
    zoneSt.abilCd = {}; zoneSt.abilSrv = {}; zoneSt.abilPend = {}; zoneSt.gather = null; // перезарядки сброшены сервером
    hud.clearTarget();
    duel.start(d);
  });
  net.on('pvp_state', (d) => {
    duel.state(d);
    for (const e of d.ev || []) {
      if (e.k === 'shot' && e.sid !== myId) zone.shoot(e.x, e.y, null, e.w, e.tx, e.ty);
      else if (['ability', 'aline', 'aproj', 'amark', 'proj', 'pend', 'puddle'].includes(e.k)) zone.applyState({ w: zone.world, m: [], ev: [e] }, myId);
      else if (e.k === 'pstatus') { // статусы дуэли (сервер): замедление/заморозка ощущаются в движении; DoT — подпись
        const T = { slow: ['Замедление', '#7dd3fc'], freeze: ['Заморозка', '#bae6fd'], burn: ['Поджог', '#fb923c'], poison: ['Яд', '#a3e635'], bleed: ['Кровотечение', '#f87171'], swift: ['Порыв', '#86efac'] }[e.s] || [e.s, '#fff'];
        if (e.to === myId) { if (e.s === 'slow') pvpSt.slowUntil = performance.now() + (e.ms || 2000); if (e.s === 'freeze') pvpSt.frozenUntil = performance.now() + (e.ms || 1000); if (e.s === 'swift') { pvpSt.swiftUntil = performance.now() + (e.ms || 2000); swiftSt.until = pvpSt.swiftUntil; } overlay.float(toX(player.x), 3, toZ(player.y), T[0], T[1]); }
        else { const o = others.get(e.to); if (o) overlay.float(toX(o.x), 3, toZ(o.y), T[0], T[1]); }
      }
      else if (e.k === 'lsheal') { if (e.sid === myId) lsAdd(e.d); }
      else if (e.k === 'phit' && e.immune) { const me = e.to === myId, o = me ? player : others.get(e.to); overlay.float(toX(o ? o.x : e.x), 2.6, toZ(o ? o.y : e.y), 'неуязвим', '#c4b5fd'); }
      else if (e.k === 'phit') {
        if (e.by === myId) dpsMeter.add(e.d);
        if (e.to === myId) { flashHurt(); overlay.float(toX(player.x), 2.6, toZ(player.y), `-${e.d}`, e.crit ? '#fb923c' : '#f87171'); }
        else { const o = others.get(e.to); overlay.float(toX(o ? o.x : e.x), 2.6, toZ(o ? o.y : e.y), `${e.crit ? '✦' : ''}${e.d}`, e.crit ? '#fde047' : '#fca5a5'); }
      }
    }
  });
  net.on('pvp_end', (d) => { duel.end(d); hud.clearTarget(); });
  // рывок/прыжок навыка в открытом мире: позицию задаёт сервер
  net.on('ability_move', (d) => { if (Number.isFinite(d.x) && Number.isFinite(d.y)) { player.x = d.x; player.y = d.y; } });
  net.on('rating', (d) => social.onRating(d));
  net.on('rating_err', (d) => social.onRatingErr(d));
  net.on('inspect', (d) => social.onInspect(d));
  let myRole = null; // роль своего аккаунта (сервер: player_roles + проверенный вход)
  net.on('my_role', (d) => {
    myRole = d.role || null;
    // кнопка панели — админ (полный доступ) или модератор (бестиарий/оружие/предметы); сервер проверяет каждый admin_*
    const canPanel = !!(d.admin || d.modAdmin);
    adminPanel.setAccess({ full: !!d.admin, allowed: !!(d.admin || d.modAdmin), kinds: d.kinds || (d.modAdmin ? ['mob', 'weapon', 'item'] : null) });
    let b = document.getElementById('ghud-admin-btn');
    if (canPanel && !b) {
      b = document.createElement('button'); b.id = 'ghud-admin-btn'; b.className = 'hud-duel-btn'; b.textContent = '🛠';
      b.onclick = () => uiSafe('админка', () => adminPanel.open());
      document.getElementById('ghud-set-btn')?.insertAdjacentElement('afterend', b);
    }
    if (b) {
      b.style.display = canPanel ? '' : 'none';
      b.title = d.admin ? 'Админ-панель' : 'Панель модератора';
      b.style.cssText = d.admin
        ? 'flex:0 0 auto;border-color:#f87171;color:#fca5a5'
        : 'flex:0 0 auto;border-color:#4ade80;color:#86efac';
    }
    if (!canPanel) adminPanel.close();
  });
  const chestWin = new ChestWindow(container, (o) => send(o)); // сундук схватки
  net.on('chest_view', (d) => { addCards(d.cards); chestWin.view(d); });
  net.on('chest_channel', (d) => chestWin.channel(d));
  net.on('chest_cancel', (d) => { chestWin.cancel(d.message); });
  net.on('chest_close', (d) => { if (chestWin.isOpen) { chestWin.close(); overlay.toast('📦 ' + d.message, '#fca5a5'); } });
  net.on('chest_err', (d) => { if (chestWin.isOpen) chestWin.error(d); else overlay.toast('📦 ' + d.message, '#fca5a5'); });
  net.on('chest_spawn', (d) => overlay.toast(`📦 Сундук схватки: ваших предметов — ${d.mine}`, '#fde68a'));
  function openChest(c) { if (Math.hypot(c.x - player.x, c.y - player.y) > 110) { overlay.toast('Подойдите ближе к сундуку', '#94a3b8'); return; } send({ type: 'chest_open', chest: c.id }); }
  const lootWin = new LootWindow(container, (o) => send(o)); // окно мешка добычи (внутри игры)
  const adminPanel = new AdminPanel((o) => send(o), container); // окно внутри игры (полноэкранный режим, игра позади)
  net.on('admin_catalog', (d) => adminPanel.onCatalog(d));
  adminPanel.onDialogueApplied = (r) => { if (r.dialogue) QUEST_DIALOGUES[r.questId] = r.dialogue; else delete QUEST_DIALOGUES[r.questId]; };
  adminPanel.onQuestApplied = (r) => { if (r.builtin) applyBuiltinOverride(r.quest.id, r.reset ? null : r.quest); };
  net.on('admin_result', (d) => adminPanel.onResult(d));
  net.on('loot_bag', (d) => { addCards(d.cards); if (lootWin.isOpen) lootWin.update(d); else if (!d.taken) lootWin.open(d); });
  net.on('home_portal_err', (d) => overlay.toast('🌀 ' + d.message, '#fca5a5'));
  net.on('loot_err', (d) => { if (lootWin.isOpen) lootWin.error(d.message); else overlay.toast(d.message, '#fca5a5'); });
  function openBag(b) { if (Math.hypot(b.x - player.x, b.y - player.y) > 100) { overlay.toast('Подойдите ближе к мешку', '#94a3b8'); return; } send({ type: 'loot_open', bag: b.id }); }
  // правки админ-панели прилетают сразу (без переподключения): оружие/навыки/мобы, квесты, карточки предметов
  net.on('config_update', (d) => { applyConfig(d); book.libAsked = -1; if (book.isOpen && ['library', 'bestiary', 'runskills', 'gear'].includes(book.tab)) book.render(); // правки админки → Бестиарий/Библиотека/Кодекс заново с сервера
    if (Array.isArray(d.customQuests)) setCustomQuests(d.customQuests);
    if (d.questDialogues && typeof d.questDialogues === 'object') setQuestDialogues(d.questDialogues);
    if (Array.isArray(d.questOverrides)) { for (const q of ALL_QUESTS) if (!q.custom) applyBuiltinOverride(q.id, null); for (const o of d.questOverrides) applyBuiltinOverride(o.id, o); }
    addCards(d.cards); window.dispatchEvent(new CustomEvent('mc-config', { detail: d.ver })); });
  net.on('dev_stats', (d) => { window.__devStats = d; }); // только локальные тесты
  net.on('dev_bm', (d) => { window.__devBm = d; }); // Чёрный маг: только локальные тесты (MC_DEV)
  net.on('admin_audit', (d) => adminPanel.onAudit(d.rows || []));
  net.on('admin_perf', (d) => adminPanel.onPerf(d.data));
  net.on('role_changed', (d) => social.onRoleChanged(d));
  net.on('inspect_err', (d) => social.onInspectErr(d));
  // онлайн / друзья / настройки аккаунта (server/meta/social.ts)
  net.on('online', (d) => social.onOnline(d));
  net.on('friends', (d) => social.onFriends(d));
  net.on('settings', (d) => { social.onSettings(d); if (d.toast) overlay.toast(d.toast, '#a5b4fc'); });
  net.on('social_err', (d) => overlay.toast(d.message || 'Ошибка', '#fca5a5'));
  net.on('toast', (d) => { overlay.toast(d.message || '', '#86efac'); if (social.view === 'online') send({ type: 'online_get' }); });
  net.on('friend_request', (d) => { overlay.toast(`🤝 ${d.name} хочет добавить вас в друзья — «Друзья» → «Заявки»`, '#fcd34d'); send({ type: 'friends_get' }); });
  net.on('guest_name', (d) => { if (d.name) { window.__CURRENT_USERNAME__ = d.name; net.username = d.name; } });
  net.on('saved', (d) => overlay.toast(d.message || (d.ok ? 'Сохранено' : 'Не сохранено'), d.ok ? '#86efac' : '#fca5a5'));
  setSound(soundOn());
  function openPeople(view) {
    if (!net.isOpen()) { overlay.toast('Доступно только онлайн', '#fca5a5'); return; }
    if (mode === 'run' && run && !run.ended) { overlay.toast('После забега', '#94a3b8'); return; }
    if (book.isOpen) book.close();
    if (social.isOpen && social.view === view) { social.close(); return; }
    if (view === 'friends') social.openFriends(); else if (view === 'settings') social.openSettings(); else social.openOnline();
  }
  api.openPeople = openPeople;
  // счётчик «Онлайн» на кнопках: опрос раз в 20 с, пока соединение открыто
  social.onCount = (n, inc) => {
    if (n !== undefined && n !== null) { onlineBtn.querySelector('b').textContent = n; const hb = container.querySelector('#ghud-online-btn b'); if (hb) hb.textContent = n; }
    if (inc !== undefined) { friendsBtn.classList.toggle('has', inc > 0); }
  };
  setInterval(() => { if (net.isOpen() && document.visibilityState !== 'hidden') send({ type: 'online_get' }); }, 20000);
  setTimeout(() => { if (net.isOpen()) { send({ type: 'online_get' }); send({ type: 'friends_get' }); } }, 2500);
  function openRating() {
    if (mode === 'run' && run && !run.ended) { overlay.toast('Рейтинг — после забега', '#94a3b8'); return; }
    if (!net.isOpen()) { overlay.toast('Рейтинг доступен только онлайн', '#fca5a5'); return; }
    if (book.isOpen) book.close();
    if (social.isOpen && social.view === 'rating') { social.close(); return; }
    social.openRating();
  }
  // C — свой лист персонажа (карточка как у чужого «Персонажа») + дерево талантов; Esc / C — закрыть
  // ряд значков статусов над полоской ОЗ моба: по одному на вид, со стаками (поджог ×2, кровотечение ×1…)
  const MOB_ST = [['burn', '🔥', 'Поджог'], ['poison', '☠', 'Яд'], ['bleed', '🩸', 'Кровотечение'], ['slow', '🐌', 'Замедление'], ['frozen', '❄️', 'Заморозка']];
  function mobStatusRow(o) {
    const n = { ...(o.sts || {}), slow: (o.flagRaw & 64) ? 1 : 0, frozen: o.frozen ? 1 : 0 };
    const it = MOB_ST.filter(([k]) => n[k] > 0).map(([k, ic, t]) => `<b class="mc-mst ${k}" title="${t}">${ic}${n[k] > 1 ? `<sub>×${n[k]}</sub>` : ''}</b>`);
    return it.length ? `<div class="mc-msts">${it.join('')}</div>` : '';
  }
  function toggleCharSheet() { uiSafe('лист персонажа', toggleCharSheet0); }
  function toggleCharSheet0() {
    if (social.isSelfOpen()) { social.close(); return; }
    if (!net.isOpen() || !myId) return;
    if (book.isOpen) book.close();
    social.openSelf(myId, { talentHtml: () => book.talentPanel(), onTalent: (id) => meta.talentLearn(id) });
  }
  function inspectPlayer(sid) {
    if (!net.isOpen() || !sid) return;
    if (book.isOpen) book.close();
    social.openInspect({ sid: String(sid) });
  }
  // кнопка рейтинга рядом с Книгой (окно без боковых панелей); на телефоне — в столбце кнопок (touchControls)
  const rateBtn = document.createElement('button');
  rateBtn.className = 'mc-ratebtn';
  rateBtn.title = 'Рейтинг игроков';
  rateBtn.textContent = '🏆';
  rateBtn.addEventListener('pointerdown', (e) => { e.stopPropagation(); openRating(); });
  overlay.layer.appendChild(rateBtn);
  const mkBtn = (cls, title, html, fn) => { const b = document.createElement('button'); b.className = cls; b.title = title; b.innerHTML = html; b.addEventListener('pointerdown', (e) => { e.stopPropagation(); fn(); }); overlay.layer.appendChild(b); return b; };
  const onlineBtn = mkBtn('mc-ratebtn mc-onlinebtn', 'Кто в сети', '👥<b>·</b>', () => openPeople('online'));
  const friendsBtn = mkBtn('mc-ratebtn mc-friendsbtn', 'Друзья', '🤝', () => openPeople('friends'));
  const setBtn = mkBtn('mc-ratebtn mc-setbtn', 'Настройки', '⚙️', () => openPeople('settings'));
  // личный портал домой (H): открыть в Аринаре → в хаб; в хабе — возвратный портал ведёт обратно (сервер проверяет всё)
  const homeBtn = mkBtn('mc-ratebtn mc-homebtn', 'Портал домой (H)', '🌀<small></small>', () => openHomePortal());
  let homePortalKey = '';
  function openHomePortal() {
    if (mode !== 'hub') return;
    if (world !== 'arinar') { overlay.toast('Портал домой открывается в Аринаре', '#94a3b8'); return; }
    if (!net.isOpen()) { overlay.toast('Нужна связь с сервером', '#fca5a5'); return; }
    send({ type: 'home_portal' });
  }
  function syncHomePortal(p) { // meta_state.portal → личные порталы (в хабе — назад, в Аринаре — на месте открытия)
    homePortalCd = p?.cd || 0;
    const want = p && p.x != null ? [
      { id: 'home_return', name: '🌀 Ваш портал → Аринар', x: HOME_PORTAL_HUB.x, y: HOME_PORTAL_HUB.y, world: 'hellfire', personal: true },
      { id: 'home_field', name: '🌀 Ваш портал → хаб', x: p.x, y: p.y, world: 'arinar', personal: true },
    ] : [];
    const key = JSON.stringify(want); if (key === homePortalKey) return; homePortalKey = key;
    portals = [...portals.filter((x) => !x.personal || x.foreign), ...want];
    hub.setWorld(world, portals);
  }
  let homePortalCd = 0;
  // чужие личные порталы (zone_state.fp): видны с подписью «чужой портал», войти нельзя (сервер всё равно проверяет владельца)
  let foreignKey = '';
  function syncForeignPortals(fp) {
    const want = (fp || []).map(([k, name, x, y]) => ({ id: 'fp_' + k, name: `🔒 Чужой портал (${name})`, x, y, world: 'arinar', personal: true, foreign: true, owner: name }));
    const key = JSON.stringify(want); if (key === foreignKey) return; foreignKey = key;
    portals = [...portals.filter((x) => !x.foreign), ...want];
    hub.setWorld(world, portals);
  }
  // выбранный игрок, когда боковой панели «Цель» не видно (телефон, окно): плашка с кнопкой просмотра
  const tchip = document.createElement('div');
  tchip.className = 'mc-tchip';
  tchip.style.display = 'none';
  tchip.innerHTML = '<div class="nm"></div><div class="bt"><button class="mc-btn gold insp">👤 Персонаж</button><button class="mc-btn duel">⚔️ Дуэль</button><button class="mc-btn pinv">👥 В отряд</button></div><button class="x" title="Снять выбор">✕</button>';
  tchip.addEventListener('pointerdown', (e) => e.stopPropagation());
  tchip.addEventListener('touchstart', (e) => { if (e.target.closest('button')) e.preventDefault(); }, { passive: false });
  tchip.querySelector('.insp').addEventListener('pointerdown', (e) => { e.preventDefault(); const t = hud.currentTarget; if (t?.kind === 'player') inspectPlayer(t.id); });
  tchip.querySelector('.duel').addEventListener('pointerdown', (e) => { e.preventDefault(); const t = hud.currentTarget; if (t?.kind === 'player') challengeDuel(t.id); });
  tchip.querySelector('.pinv').addEventListener('pointerdown', (e) => { e.preventDefault(); const t = hud.currentTarget; if (t?.kind === 'player') party.invite(t.id); });
  tchip.querySelector('.x').addEventListener('pointerdown', (e) => { e.preventDefault(); hud.clearTarget(); updateTargetChip(); });
  overlay.layer.appendChild(tchip);
  function updateTargetChip() {
    let t = hud.currentTarget;
    if (t?.kind === 'player') { const o = others.get(t.id); if (o) { t = playerTarget(o); hud.setTarget(t); } } // живые ОЗ с сервера
    // верхняя плашка — только на телефоне; на ПК действия с игроком — всплывающее меню у курсора (party.openMenu)
    const show = mobile && !!t && t.kind === 'player' && mode === 'hub' && !hud.left.offsetParent && others.has(t.id);
    if (show) {
      const txt = `${t.name} · ${t.typeLabel || ''}${t.hp && t.hp !== '…' ? ` · ❤️ ${t.hp}` : ''}`; const nm = tchip.querySelector('.nm'); if (nm.textContent !== txt) nm.textContent = txt;
      const db = tchip.querySelector('.duel'), dd = t.canDuel && !party.has(t.id) ? '' : 'none'; if (db.style.display !== dd) db.style.display = dd; // союзника по отряду на дуэль не вызвать
      const pb = tchip.querySelector('.pinv'), pd = party.canInvite(t.id) ? '' : 'none'; if (pb.style.display !== pd) pb.style.display = pd;
    }
    const disp = show ? '' : 'none';
    if (tchip.style.display !== disp) tchip.style.display = disp;
  }
  // Кнопка Книги со счётчиком «новое» (новые предметы в сумке, открытия Библиотеки и Бестиария)
  const bookBtn = document.createElement('button');
  bookBtn.className = 'mc-bookbtn';
  bookBtn.title = 'Меню (B)';
  bookBtn.innerHTML = '📖<em class="mc-cnt" style="display:none"></em>';
  bookBtn.addEventListener('pointerdown', (e) => { e.stopPropagation(); book.toggle(meta.unread().gear ? 'gear' : meta.unread().library ? 'library' : meta.unread().mobs ? 'bestiary' : undefined); });
  overlay.layer.appendChild(bookBtn);
  // Лист персонажа (C) — рядом с книгой
  const charBtn = document.createElement('button');
  charBtn.className = 'mc-bookbtn mc-charbtn'; charBtn.title = 'Персонаж (C)'; charBtn.textContent = '🧙';
  charBtn.addEventListener('pointerdown', (e) => { e.stopPropagation(); tracker.tutDone('book'); toggleCharSheet(); });
  overlay.layer.appendChild(charBtn);
  function updateBookBadge() {
    const n = meta.unread().total;
    const em = bookBtn.querySelector('em');
    em.style.display = n ? '' : 'none'; em.textContent = n > 99 ? '99+' : String(n);
    bookBtn.classList.toggle('isnew', n > 0);
    const tb = overlay.layer.querySelector('.mc3d-tbtn[data-act="book"]');
    if (tb) { tb.dataset.cnt = n ? String(Math.min(99, n)) : ''; tb.classList.toggle('hascnt', n > 0); }
  }
  meta.on(() => updateBookBadge());
  // «+N HP» от вампиризма (сервер шлёт lsheal ≥1 ОЗ): копим и показываем пачкой раз в 0.5 с над героем
  const lsPop = { acc: 0, at: 0 };
  const lsAdd = (n) => { lsPop.acc += n; const t = performance.now(); if (t - lsPop.at >= 500 && lsPop.acc >= 1) { overlay.float(toX(player.x), 2.9, toZ(player.y), `+${Math.floor(lsPop.acc)} HP`, '#4ade80'); lsPop.acc -= Math.floor(lsPop.acc); lsPop.at = t; } };
  net.on('zone_state', (d) => {
    if (d.npc) npcUpdate(d.npc); // NPC бродят: позиции с сервера
    if (Array.isArray(d.wb)) setBossState(d.wb);
    for (const e of d.ev || []) if (e.k === 'lsheal' && e.sid === myId) lsAdd(e.d);
    if (Array.isArray(d.cp)) zone.camps = d.cp; // лагеря рядом: мини-карта (агро/активность) и трекер квеста
    for (const e of d.ev || []) if (e.k === 'hit' && e.by === myId && e.d > 0) dpsMeter.add(e.d); // мировые боссы: жив / таймер — на карте и мини-карте
    if (d.fp !== undefined || world === 'arinar') syncForeignPortals(world === 'arinar' ? d.fp : []);
    if (mode !== 'hub') return;
    const evs = zone.applyState(d, myId) || [];
    const ct = hud.currentTarget;
    if (ct?.kind === 'bmage' && !zone.bmv?.mage) hud.clearTarget(); // маг ушёл (телепорт) — цель снята
    if (ct?.kind === 'mob') {
      const o = zone.mobs.get(ct.id);
      if (!o || d.tg?.gone) { hud.clearTarget(); zone.selected = 0; send({ type: 'zone_target', id: 0 }); }
      else hud.setTarget(mobTarget(o, d.tg && d.tg.id === ct.id ? d.tg : null));
    }
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
    if (loot.bag) overlay.toast(`💰 Добыча лежит у трупа (${loot.bag.n}) — подойдите и откройте мешок`, '#fde68a');
    if (loot.runSkill) overlay.toast(`${loot.runSkill.icon} Оружие с навыком «${loot.runSkill.name}»! Наденьте его — навык на клавише R`, '#fde68a');
    for (const [r, n] of Object.entries(loot.res || {})) parts.push(`${RESOURCES[r]?.icon || ''}×${n}`);
    if (parts.length) overlay.float(toX(player.x), 3.0, toZ(player.y), parts.join(' '), '#fde68a');
  }
  function showRunReward(r) {
    const items = (r.items || []).map((it) => { const d = ITEM_BY_ID[it.id]; return d ? `<li style="color:${RARITIES[d.rarity].color}">${iconHtml(d, 20)} ${esc(d.name)}</li>` : ''; }).join('');
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
      room: roomId, runSkill: meta.state?.weaponSkill || null, traits: meta.state?.runTraits || null, myId: myId || 'local', username, color: player.color,
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
    const arena = new RunArena(RUN_ROOMS[roomId]?.theme || 'crypt', RUN_ROOMS[roomId]?.tiles || null);
    hub.detach();
    runView = new RunView(THREE, stage.scene, run, arena);
    stage.setEnvironment(arena);
    atmoWorld = 'run_' + (arena.theme || 'crypt'); atmo.setScene(atmoWorld, null, []);
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
          runUI.openChoices(run.rollChoices(3), { title: chest ? 'Сундук!' : `Уровень ${run.team.level}!`, sub: chest ? '' : 'Игра не на паузе: 3 с неуязвимости. Успеете выбрать — ударная волна отбросит врагов' });
        }
        break;
      case 'toast': overlay.toast(d.text, d.color); break;
      case 'hurt':
        flashHurt();
        if (floatBudget > 0) { floatBudget--; overlay.float(run.me.x, 2.4, run.me.z, `-${Math.round(d.dmg)}`, '#f87171'); }
        break;
      case 'downed': overlay.toast(run.remotes.size ? 'Вы пали! Союзники могут поднять вас' : 'Вы пали…', '#fca5a5'); break;
      case 'revived': overlay.toast('Вас подняли!', '#4ade80'); break;
      case 'lsheal': overlay.float(run.me.x, 2.9, run.me.z, `+${d.amt} HP`, '#4ade80'); break;
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
    if (e.key === 'Escape' && upgWin.isOpen) { upgWin.close(); return; }
    if (e.key === 'Escape' && worldMap.isOpen) { worldMap.close(); return; }
    if (worldMap.isOpen && (k === 'n' || k === 'т') && !e.repeat) { worldMap.toggleBiome(); return; } // N — карта биомов
    if (worldMap.isOpen && (e.key === '+' || e.key === '=' || e.code === 'NumpadAdd')) { worldMap.zoomBy(1.5); return; } // +/− — зум карты
    if (worldMap.isOpen && (e.key === '-' || e.key === '_' || e.code === 'NumpadSubtract')) { worldMap.zoomBy(1 / 1.5); return; }
    if (e.key === 'Escape') {
      if (book.isOpen) { book.close(); return; }
      if (dialog.isOpen) { dialog.close(); return; }
      if (classSelect.isOpen) { classSelect.close(); return; }
      if (statsUI.isOpen) { statsUI.close(); return; }
      if (overlay.screen && !runUI.choiceOpen && !(run && run.ended)) { lobbyView = null; overlay.hideScreen(); return; }
      return;
    }
    if (e.key === 'Enter') { e.preventDefault(); openChat(); return; }
    if ((k === 'h' || k === 'р') && mode === 'hub' && !e.repeat) { openHomePortal(); return; }
    if ((k === 'm' || k === 'ь') && mode === 'hub') { worldMap.toggle(); return; }
    if (runUI.choiceOpen) return; // 1–3 обрабатывает модалка
    keys.add(e.code);
    if ((lootWin.isOpen || chestWin.isOpen) && (e.code === 'ShiftLeft' || e.code === 'ShiftRight')) return; // Shift в окне добычи — проводка
    if (e.code === 'Space' || e.code === 'ShiftLeft' || e.code === 'ShiftRight') { input.dashPressed = true; e.preventDefault(); }
    if (!book.isOpen || mode === 'run') {
      if (k === 'q' || k === 'й') useAbility(0);
      if (k === 'g' || k === 'п') useAbility(1); // 2-й навык: G (R теперь — навык оружия)
      if (k === 'r' || k === 'к') useWeaponSkill();
      if (k === 'f' || k === 'а') useAbility(2);
    }
    if (k === 'e' || k === 'у') interact();
    if (mode === 'hub' || !run || run.ended) {
      if (k === 'j' || k === 'о') { tracker.tutDone('book'); book.toggle('quests'); }
      if (k === 'i' || k === 'ш') { tracker.tutDone('book'); book.toggle('gear'); }
      if (k === 'k' || k === 'л') { tracker.tutDone('book'); book.toggle('skills'); }
      if (k === 't' || k === 'е') { tracker.tutDone('book'); book.toggle('hero'); }
      if ((k === 'c' || k === 'с') && !e.repeat) { tracker.tutDone('book'); toggleCharSheet(); }
      if ((k === 'b' || k === 'и') && !e.repeat) { tracker.tutDone('book'); book.toggle(); } // B — меню-книга (Бестиарий — вкладкой)
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
  // ПКМ по игроку — то же меню (персонаж / дуэль / в отряд)
  canvas.addEventListener('contextmenu', (e) => {
    if (mode !== 'hub' || overlay.screen || book.isOpen) return;
    const g = stage.groundPoint(e.clientX, e.clientY); if (!g) return;
    const px = toPx(g.x), py = toPy(g.z); let best = null, bd = 40;
    for (const o of others.values()) if (o.world === world && !o.runRoom) { const d = Math.hypot(o.x - px, o.y - py); if (d < bd) { bd = d; best = o; } }
    if (!best) return;
    e.preventDefault(); const t = playerTarget(best); hud.setTarget(t); party.openMenu({ ...t, sub: t.typeLabel }, e.clientX, e.clientY);
  });
  // Базовая атака в открытом мире: ЛКМ (удержание — повтор со скоростью атаки) в сторону курсора.
  // Клик по NPC/порталу/ресурсу/цветку/игроку — взаимодействие, не атака. Телефон — кнопка ⚔ с автонаведением.
  const aim = { held: false, touch: false, x: null, y: null, cx: null, cy: null };
  let autoAttack = localStorage.getItem('mc-autoatk') === '1'; // доступность: «автоатака» (по умолчанию выкл., клавиша V)
  function aimAt(e) {
    if (e) { aim.cx = e.clientX; aim.cy = e.clientY; }
    if (aim.cx == null) return;
    const g = stage.groundPoint(aim.cx, aim.cy);
    if (g) { aim.x = toPx(g.x); aim.y = toPy(g.z); }
  }
  // Ручное прицеливание (мир/поляна/дуэль): курсор отслеживается всегда, точка на земле пересчитывается в момент
  // выстрела (камера едет за героем — старая мировая точка устарела бы). Сервер берёт только единичный вектор.
  function aimDir() {
    if (aim.touch || aim.cx == null) return null;
    aimAt(null);
    if (aim.x === null) return null;
    const dx = aim.x - player.x, dy = aim.y - player.y, d = Math.hypot(dx, dy);
    return d > 1 ? { x: dx / d, y: dy / d } : null;
  }
  // точка вылета = отрисованный центр героя, прицел = точка курсора на земле (сервер проверяет допуск, см. abilityShapes.shotAim)
  let shotCid = 0;
  function shotMsg(dir, extra = {}) {
    const m = { dx: Math.round(dir.x * 1000) / 1000, dy: Math.round(dir.y * 1000) / 1000, ox: Math.round(player.x), oy: Math.round(player.y), cid: (shotCid = (shotCid % 1e6) + 1), ...extra };
    if (!('tx' in extra) && aim.x != null && !aim.touch && aim.cx != null) { m.tx = Math.round(aim.x); m.ty = Math.round(aim.y); }
    if (m.tx == null || m.ty == null) { delete m.tx; delete m.ty; } // без курсора (телефон/автоцель) — только направление
    return m;
  }
  // выбранный враг (клик по мобу → панель «Цель»; на арене — соперник): автоатака бьёт точно в него
  function lockedTarget() {
    if (world === 'arena') { const o = others.get(duel.oppSid?.()); return o ? { x: o.x, y: o.y, mob: -1 } : null; }
    const ct = hud.currentTarget;
    if (ct?.kind === 'bmage') { const m = zone.bmv?.mage; return m ? { x: m.x, y: m.y, mob: -7 } : null; } // Чёрный маг (BM_LOCK): удар = нападение
    if (ct?.kind !== 'mob') return null;
    const o = zone.mobs.get(ct.id); return o && !o.dead ? { x: o.x, y: o.y, mob: ct.id } : null;
  }
  function clickHitsInteractive(px, py) {
    for (const [id, n] of Object.entries(NPCS)) { const p = npcPos(id); if (n.world === world && Math.hypot(p.x - px, p.y - py) < 40) return true; }
    for (const n of zone.nodes.values()) if (Math.hypot(n.def.x - px, n.def.y - py) < 40) return true;
    for (const p of portals) if ((p.world || 'hellfire') === world && Math.hypot(p.x - px, p.y - py) < 45) return true;
    if (world === 'hellfire') for (const f of flowers.values()) if (Math.hypot(f.x - px, f.y - py) < 36) return true;
    if (world !== 'arena') for (const o of others.values()) if (o.world === world && Math.hypot(o.x - px, o.y - py) < 30) return true; // на арене клик по сопернику — удар
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
  canvas.addEventListener('pointermove', (e) => { if (e.pointerType !== 'touch') aimAt(e); });
  const aimUp = () => { aim.held = false; };
  canvas.addEventListener('pointerup', aimUp);
  canvas.addEventListener('pointercancel', aimUp);
  window.addEventListener('blur', aimUp);

  // Навык по слоту: в забеге — локально (RunSession), в мире — запрос серверу (zone_ability)
  // 4-й слот (R): навык «Вампир-лайка» надетого оружия. Какой навык — решает сервер по экипировке (meta.state.weaponSkill)
  function useWeaponSkill() {
    const rs = meta.state?.weaponSkill;
    if (mode === 'run') { if (run?.weaponSkillBurst?.()) overlay.toast(`${RUN_SKILL_BY_ID[run.runSkill]?.icon || '✦'} Залп навыка оружия`, '#fde68a'); return; }
    if (!rs) { overlay.toast('Нет навыка оружия — наденьте оружие с навыком (Книга → Снаряжение)', '#94a3b8'); return; }
    const now = performance.now();
    if ((zoneSt.abilCd.rs || 0) > now) return;
    zoneSt.abilCd.rs = now + 1500; zoneSt.abilPend['rs:' + rs] = now;
    let adx = player.dirX || 0, ady = player.dirY || 1;
    const ad = aimDir();
    if (ad) { adx = ad.x; ady = ad.y; }
    else if (aim.touch || aim.cx == null) { const t = zone.nearestMob(player.x, player.y, 420); if (t) { const dx = t.x - player.x, dy = t.y - player.y, d = Math.hypot(dx, dy) || 1; adx = dx / d; ady = dy / d; } }
    send({ type: 'zone_ability', id: 'rs', ...shotMsg({ x: adx, y: ady }, ad ? {} : { tx: null, ty: null }) });
    overlay.toast(`${rsInfo(rs)?.icon || '✦'} ${rsInfo(rs)?.name || rs}`, '#fde68a');
  }
  function useAbility(slot) {
    if (mode === 'run') { input.abilitySlot = slot; return; }
    const h = meta.hero;
    const abs = h?.effective?.abilities || [], ab = abs.find((x) => x.slot === slot) || (abs.some((x) => x.slot != null) ? null : abs[slot]); // по клавише слота (Q/G/F)
    if (!ab) { overlay.toast(h ? 'Слот навыка пуст — Книга (K)' : 'Навыки есть только у героя — Алтарь', '#94a3b8'); return; }
    const now = performance.now();
    if ((zoneSt.abilCd[ab.id] || 0) > now) return;
    zoneSt.abilCd[ab.id] = now + Math.min(1500, ab.cd * 1000); // до подтверждения сервера — короткий замок от спама
    zoneSt.abilPend[ab.id] = now;
    // направление навыка: курсор мыши, иначе ближайший моб, иначе взгляд героя (сервер считает форму навыка сам)
    let adx = player.dirX || 0, ady = player.dirY || 1;
    const ad = aimDir();
    if (ad) { adx = ad.x; ady = ad.y; }
    else if (aim.touch || aim.cx == null) { const t = zone.nearestMob(player.x, player.y, 420); if (t) { const dx = t.x - player.x, dy = t.y - player.y, d = Math.hypot(dx, dy) || 1; adx = dx / d; ady = dy / d; } }
    send({ type: 'zone_ability', id: ab.id, ...shotMsg({ x: adx, y: ady }, ad ? {} : { tx: null, ty: null }) });
    overlay.toast(`${ABILITY_BY_ID[ab.id]?.icon || '✦'} ${ABILITY_BY_ID[ab.id]?.name || ab.id}`, '#fde68a');
  }
  // панель действий: навыки раскладки + рывок + атака (мир) / навыки + рывок + оружие и пассивки (забег)
  const ABAR_KEYS = ['Q', 'G', 'F'];
  function updateActionBar() {
    const now = performance.now();
    if (mode === 'run' && run) {
      const m = run.me;
      const list = (m.abilities || []).map((a, i) => ({ kind: 'ab', slot: i, id: a.id, key: ABAR_KEYS[i], name: a.name, desc: a.desc, rad: a.rad || 0, cdLeft: a.cdLeft, cdTotal: a.cd }));
      list.push({ kind: 'dash', id: 'dash', key: 'Space', name: 'Рывок', desc: 'Короткий рывок с неуязвимостью 0.3 с', cdLeft: m.dashCd || 0, cdTotal: 1.1 });
      if (run.runSkill && m.weapons[run.runSkill]) { const R0 = RUN_SKILL_BY_ID[run.runSkill]; list.push({ kind: 'rs', slot: 3, id: 'rs:' + run.runSkill, icon: R0?.icon, key: 'R', name: R0?.name || run.runSkill, desc: 'Навык оружия: мгновенный усиленный залп', cdLeft: run.wsCd || 0, cdTotal: 8 }); }
      abar.show(true); abar.setSlots(list); abar.setRun(m.weapons, m.passives, WEAPONS, PASSIVES);
      return;
    }
    if (mode !== 'hub') { abar.show(false); return; }
    abar.show(true); abar.setRun(null);
    const h = meta.hero;
    const eff = h?.effective;
    const nSlots = h ? abilitySlots(h.lvl || 1) : 0;
    const list = [];
    for (let i = 0; i < 3; i++) {
      if (!h) { list.push({ kind: 'ab', slot: i, key: ABAR_KEYS[i], name: 'Навык', locked: true, lockText: 'навыки есть только у героя — Алтарь Перевоплощения' }); continue; }
      if (i >= nSlots) { list.push({ kind: 'ab', slot: i, key: ABAR_KEYS[i], name: '3-й слот', locked: true, lockText: 'откроется на 5 уровне героя' }); continue; }
      const abs = eff?.abilities || [], a = abs.find((x) => x.slot === i) || (abs.some((x) => x.slot != null) ? null : abs[i]);
      if (!a) { list.push({ kind: 'ab', slot: i, key: ABAR_KEYS[i], empty: true }); continue; }
      const def = ABILITY_BY_ID[a.id] || {};
      const srv = zoneSt.abilSrv[a.id];
      const left = srv ? Math.max(0, (srv.until - now) / 1000) : 0;
      list.push({ kind: 'ab', slot: i, id: a.id, key: ABAR_KEYS[i], name: def.name || a.id, desc: def.desc, rad: a.rad || 0, cdLeft: left, cdTotal: srv ? srv.total / 1000 : a.cd, pending: zoneSt.abilPend[a.id] && now - zoneSt.abilPend[a.id] < 1500 });
    }
    { const rs = meta.state?.weaponSkill; const R0 = rs && rsInfo(rs); const srv = rs && zoneSt.abilSrv['rs:' + rs];
      list.push(rs ? { kind: 'rs', slot: 3, id: 'rs:' + rs, icon: R0?.icon, key: 'R', name: R0?.name || rs, desc: `Навык оружия. ${R0?.desc || ''}`, cdLeft: srv ? Math.max(0, (srv.until - now) / 1000) : 0, cdTotal: srv ? srv.total / 1000 : 8 }
        : { kind: 'rs', slot: 3, key: 'R', name: 'Навык оружия', locked: true, lockText: 'наденьте оружие с навыком «Вампир-лайка» (редкий трофей открытого мира)' }); }
    list.push({ kind: 'dash', id: 'dash', key: 'Space', name: 'Рывок', desc: 'Короткий рывок (Space / Shift)', cdLeft: dash.cd, cdTotal: DASH.cooldown });
    const wt = zone.myWeaponType(player.stats.classId);
    const atkMs = (WEAPON_TYPES[wt]?.cd || ZONE_ATK_MS) / (1 + Math.max(0, meta.state?.hero?.effective?.atkSpeedPct || 0) / 100);
    list.push({ kind: 'atk', id: 'attack', key: 'ЛКМ', name: `Атака: ${WEAPON_TYPES[wt]?.name || 'оружие'}`, desc: 'Удерживайте ЛКМ — удар в сторону курсора; V — автоатака', cdLeft: Math.max(0, atkMs - (now - zoneSt.lastAtk)) / 1000, cdTotal: atkMs / 1000, locked: !h, lockText: 'атака есть только у героя — выберите героя на Алтаре Перевоплощения' });
    abar.setSlots(list);
  }
  function refreshAbilityButtons() {
    if (mode === 'run') return;
    const now = performance.now();
    const list = (meta.hero?.effective?.abilities || []).map((a) => { const srv = zoneSt.abilSrv[a.id]; return { id: a.id, rad: a.rad || 0, cd: srv ? srv.total / 1000 : a.cd, cdLeft: srv ? Math.max(0, (srv.until - now) / 1000) : 0 }; });
    touch.setAbilities(list);
    { const rs = meta.state?.weaponSkill; const srv = rs && zoneSt.abilSrv['rs:' + rs]; touch.setWeaponSkill(rs ? { icon: rsInfo(rs)?.icon || '✦', cd: srv ? srv.total / 1000 : 8, cdLeft: srv ? Math.max(0, (srv.until - now) / 1000) : 0 } : null); }
  }

  function zoomBy(f) {
    const v = stage.view;
    v.targetZoom = Math.max(v.minZoom, Math.min(v.maxZoom, v.targetZoom * f));
  }
  // Открытый мир (Аринар): зум камеры в клетках — по умолчанию ~20, отдалить до ~30, приблизить до ~10 (VIEW_CELLS).
  // Пределы пересчитываются при смене мира и размера окна; мини-карта показывает область камеры ×1.3 и делит этот зум.
  let camKey = '';
  function applyCamLimits() {
    const w = mode === 'hub' ? world : '', key = `${w}|${stage.width}x${stage.height}`;
    if (key === camKey) return; const was = camKey.split('|')[0]; camKey = key;
    const v = stage.view;
    if (w === 'arinar') {
      const cells = was === 'arinar' ? stage.viewCells(v.targetZoom) : VIEW_CELLS.def;
      v.minZoom = stage.zoomForCells(VIEW_CELLS.max); v.maxZoom = stage.zoomForCells(VIEW_CELLS.min);
      v.targetZoom = Math.max(v.minZoom, Math.min(v.maxZoom, stage.zoomForCells(cells)));
      if (was !== 'arinar') v.zoom = v.targetZoom;
    } else if (was === 'arinar') { v.minZoom = 0.2; v.maxZoom = 1.5; v.targetZoom = v.zoom = 0.5; }
  }
  hud.minimap.getCamCells = () => (world === 'arinar' && mode === 'hub' ? stage.viewCells() : 0);
  hud.minimap.onZoom = (f) => zoomBy(f);
  { // щипок двумя пальцами — зум камеры (плавно, тем же zoomBy)
    let pd = 0;
    const dist = (t) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
    // слушаем документ (поверх канваса лежит слой сенсорного управления); щипок по кнопкам/окнам не считается
    const onUi = (e) => [...e.touches].some((t) => t.target?.closest?.('button, .mc-screen, .mc-worldmap, .hud-card, input, textarea'));
    document.addEventListener('touchstart', (e) => { pd = e.touches.length === 2 && !onUi(e) ? dist(e.touches) : 0; }, { passive: true });
    document.addEventListener('touchmove', (e) => { if (e.touches.length === 2 && pd) { const d = dist(e.touches); zoomBy(d / pd); pd = d; } }, { passive: true });
    document.addEventListener('touchend', (e) => { if (e.touches.length < 2) pd = 0; }, { passive: true });
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
    if (world !== 'hellfire' || mode !== 'hub') return null;   // цветы есть только на Поляне
    for (const f of flowers.values()) {
      if (f.stage === 'active') continue;
      const d = Math.hypot(f.x - player.x, f.y - player.y);
      if (d <= bd) { bd = d; best = f; }
    }
    return best;
  }

  function interact() {
    if (mode !== 'hub' || overlay.screen || overlay.chatOpen) return;
    { const c = zone.nearestChest(player.x, player.y, 110); if (c) { if (chestWin.isOpen) chestWin.close(); else openChest(c); return; } }
    { const b = zone.nearestBag(player.x, player.y, 100); if (b) { if (lootWin.isOpen) lootWin.close(); else openBag(b); return; } }
    const npc = zone.nearestNpc(world, player.x, player.y);
    if (npc) { if (net.isOpen()) send({ type: 'npc_talk', npc: npc.id }); else overlay.toast('Персонажи говорят только при связи с сервером', '#fca5a5'); return; }
    const node = zone.nearestNode(player.x, player.y);
    if (!node && !zoneSt.gather) { const nn = zone.nearestNode(player.x, player.y, true); // узел на восстановлении — сказать, когда вырастет (а не молчать)
      if (nn && !nearestPortal() && !nearestFlower()) { const left = Math.max(1, Math.ceil(((nn.readyAt || 0) - Date.now()) / 1000)); overlay.toast(`${zone.resName(nn.def.res)}: уже собрано — вырастет через ≈${left} с`, '#c4b5fd'); return; } }
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
    if (p.foreign) { overlay.toast(`Чужой портал (${p.owner}) — войти может только владелец`, '#fca5a5'); return; }
    if (p.id === 'home_return') { send({ type: 'home_portal_back' }); return; }
    if (p.id === 'home_field') { send({ type: 'home_portal_enter' }); return; }
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

  // Выбор моба кликом: подсветка-кольцо + панель «Цель» (имя, уровень, ХП тек./макс. — с сервера, zone_state.tg)
  // стаки статусов цели: 🔥×2 🩸×1 ☣×3 (поджог/кровотечение/яд — одновременно)
  function stsLabel(s) { if (!s) return ''; const t = [['burn', '🔥'], ['bleed', '🩸'], ['poison', '☣']].filter(([k]) => s[k] > 0).map(([k, i]) => `${i}×${s[k]}`).join(' '); return t ? ' · ' + t : ''; }
  function mobTarget(o, tg) {
    const info = ZONE_MOBS[o.type] || {};
    const en = tierOf(tg?.ench ?? o.ench);
    const tags = [en ? '✦ ' + enchName(en) : '', tg?.cursed || o.cursed ? '☠ Проклятый' : '', tg?.boss || info.boss ? '👑 Босс' : '', tg?.elite || o.elite ? '★ Элита' : '', tg?.reset ? '↩ сброс' : ''].filter(Boolean).join(' · ');
    return {
      kind: 'mob', id: o.id, name: tg?.name || info.name || o.type, color: en ? enchText(en) : '', glitch: en === 6,
      typeLabel: `ур. ${tg?.lvl ?? info.lvl ?? '?'}${tags ? ' · ' + tags : ''}${tg?.skills ? ' · 🌀 ' + tg.skills.join(', ') : ''}${stsLabel(tg?.sts || o.sts)}`,
      hp: tg ? `${fmtBig(tg.hp)} / ${fmtBig(tg.maxHp)}` : `${o.hp ?? '?'}%`, armor: tg?.armor ?? (o.cursed || o.elite || en ? '…' : info.armor ?? '-'), atk: tg?.dmg ?? (o.cursed || o.elite || en ? '…' : info.dmg ?? '-'), // с сервера — с множителями (элита, вожак, проклятие, ярость)
    };
  }
  function bmTarget() { return { kind: 'bmage', id: -7, name: 'Чёрный маг', color: '#a78bfa', typeLabel: 'ур. ? · ???', hp: '? / ?', armor: '?', atk: '?' }; }
  function selectMob(o) { zone.selected = o.id; send({ type: 'zone_target', id: o.id }); hud.setTarget(mobTarget(o, null)); }
  // Панель «ЦЕЛЬ» для игрока: только статы, посчитанные сервером (players_state.sv — как в просмотре персонажа)
  function playerTarget(o) {
    const v = o.sv;
    return {
      kind: 'player', id: o.id, name: o.username || 'Странник',
      typeLabel: v ? `${displayClassName(v.cls)} · ур. ${v.lvl}` : displayClassName(o.stats?.classId),
      hp: v ? `${v.hp} / ${v.maxHp}` : '…', armor: v ? `${v.armor} (−${Math.round(v.dr * 100)}%)` : '…', atk: v ? `${v.wMin}-${v.wMax}` : '…',
      canDuel: world !== 'arena' && !o.runRoom && !o.inDuel,
    };
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
    if (world === 'hellfire') for (const f of flowers.values()) cands.push({ kind: 'flower', o: f, x: f.x, y: f.y });
    for (const p of portals) if ((p.world || 'hellfire') === world) cands.push({ kind: 'portal', o: p, x: p.x, y: p.y });
    for (const c of zone.chests.values()) cands.push({ kind: 'chest', o: c, x: c.x, y: c.y, pad: 22 });
    for (const b of zone.bags.values()) cands.push({ kind: 'bag', o: b, x: b.x, y: b.y, pad: 14 });
    if (world === 'arinar' && zone.bmv?.mage) cands.push({ kind: 'bmage', o: zone.bmv.mage, x: zone.bmv.mage.x, y: zone.bmv.mage.y, pad: 6 });
    for (const m of zone.mobs.values()) cands.push({ kind: 'mob', o: m, x: m.x, y: m.y, pad: Math.max(0, (ZONE_MOBS[m.type]?.radius || 12) * mobScale(m) - 10) }); // зона клика = видимый размер (мобы ×0.75)

    let best = null, bd = 40;
    for (const c of cands) { const d = Math.hypot(c.x - px, c.y - py) - (c.pad || 0); if (d < bd) { bd = d; best = c; } }
    // запасной вариант: клик по телу спрайта (выше «ног») — точка на земле уходит «за» моба; только если у ног никого
    if (!best) { let bd2 = 30; for (const m of zone.mobs.values()) { const d = Math.hypot(m.x - px, m.y - 22 * mobScale(m) - py) - Math.max(0, (ZONE_MOBS[m.type]?.radius || 12) * mobScale(m) - 12); if (d < bd2) { bd2 = d; best = { kind: 'mob', o: m }; } } }
    if (best?.kind !== 'mob' && zone.selected) { zone.selected = 0; send({ type: 'zone_target', id: 0 }); }
    if (!best) { hud.clearTarget(); return; }
    if (best.kind === 'mob') { selectMob(best.o); return; }
    if (best.kind === 'bmage') { hud.setTarget(bmTarget()); return; } // Чёрный маг: ни ОЗ, ни атаки игрок не знает
    if (best.kind === 'bag') { openBag(best.o); return; }
    if (best.kind === 'chest') { openChest(best.o); return; }
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
    if (best.kind === 'player') { const t = playerTarget(o); hud.setTarget(t); if (!mobile) party.openMenu({ ...t, sub: t.typeLabel }, e.clientX, e.clientY); return; } // меню: персонаж / дуэль / в отряд (на телефоне — плашка сверху)
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
  // худший кадр (мс CPU кадра и интервал rAF) — для замеров рывков при стриме (debug.frames)
  const FS = { n: 0, cpuMax: 0, gapMax: 0, cpu: [], gap: [] };
  const frameStat = (cpu, gap) => { FS.n++; if (cpu > FS.cpuMax) FS.cpuMax = cpu; if (gap > FS.gapMax && gap < 1000) FS.gapMax = gap; if (FS.cpu.length < 20000) { FS.cpu.push(cpu); FS.gap.push(gap); } if (cpu > 50 && (FS.slow ||= []).length < 40) FS.slow.push({ cpu: Math.round(cpu), render: Math.round(FS.rMs || 0), newTex: FS.rTex || 0, up: Math.round(VRAM.inst?.frameUp || 0), bake: Math.round(VRAM.inst?.frameBake || 0) }); if (VRAM.inst) VRAM.inst.frameBake = 0; };
  let autoMv = null;
  // окно интерфейса упало при открытии → MC-U01 (с названием окна в шаге), игра идёт дальше
  function uiSafe(name, fn) { try { return fn(); } catch (e) { showError('MC-U01', { soft: true, autoClose: 8000, step: name, detail: String(e?.stack || e).slice(0, 300), onRetry: () => uiSafe(name, fn) }); return null; } }
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
    atmo.setQuality(quality.level);
  }
  if (quality.level) applyQuality();
  atmo.setQuality(quality.level);
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
  // «📊 Нагрузка»: раз в минуту — fps/пинг/тип устройства/браузер (без идентификаторов; сервер обрезает значения)
  { const ua = navigator.userAgent || '', br = /YaBrowser/.test(ua) ? 'yandex' : /SamsungBrowser/.test(ua) ? 'samsung' : /Edg\//.test(ua) ? 'edge' : /OPR\//.test(ua) ? 'opera' : /Firefox\//.test(ua) ? 'firefox' : /Chrome\//.test(ua) ? 'chrome' : /Safari\//.test(ua) ? 'safari' : 'other';
    const mobile = /Mobi|Android|iPhone|iPad/.test(ua) || (navigator.maxTouchPoints > 1 && matchMedia('(pointer:coarse)').matches);
    const cst = () => { if (net.connected && fpsS.fps) net.send({ type: 'client_stats', fps: fpsS.fps, ping: Math.round(net.ping || 0), mobile, br }); };
    setTimeout(cst, 15000); setInterval(cst, 60000); }
  const debugEl = document.createElement('div');
  debugEl.style.cssText = 'position:absolute;left:6px;bottom:6px;font:10px monospace;color:#a3e635;text-shadow:0 1px 2px #000;pointer-events:none;white-space:pre';
  overlay.layer.appendChild(debugEl);

  function frame(now) {
    requestAnimationFrame(frame);
    const realDt = Math.max(0, (now - last) / 1000);
    const dt = Math.min(0.05, realDt);
    last = now;
    tickSpriteTime(dt); // кадры анимированных пропсов v2 (шейдер SpriteBatch)
    fpsS.n++; fpsS.t += realDt;
    if (fpsS.t >= 0.5) { fpsS.fps = Math.round(fpsS.n / fpsS.t); fpsS.cpu = fpsS.cpuAcc / fpsS.n; fpsS.n = 0; fpsS.t = 0; fpsS.cpuAcc = 0; }
    if (realDt < 1) adaptQuality(realDt);
    const cpu0 = performance.now();
    floatBudget = Math.min(30, floatBudget + dt * 40);
    stage.resize();
    applyCamLimits();
    overlay.syncRect();
    atmo.begin();
    try {
      if (mode === 'run' && run) runFrame(dt, now);
      else hubFrame(dt, now);
    } catch (err) {
      console.error('[MorrisCurse 3D] ошибка кадра', err);
    }
    try { atmo.end(dt, mode === 'run' && run ? atmoWorld : world, player.x, player.y); } catch (err) { console.warn('[atmo]', err); }
    try { updateActionBar(); } catch (err) { console.warn('[abar]', err); }
    try { VRAM.inst?.tick(now); } catch (err) { console.warn('[vram]', err); } // загрузка в GPU заранее (≤ upMs) и выгрузка ненужного
    const rTex0 = stage.renderer.info.memory.textures, r0 = performance.now(); VRAM.inst?.hideEmpty(); try { stage.render(); } finally { VRAM.inst?.restoreEmpty(); } FS.rMs = performance.now() - r0; FS.rTex = stage.renderer.info.memory.textures - rTex0;
    { const ft = performance.now() - cpu0; fpsS.cpuAcc += ft; frameStat(ft, realDt * 1000); }
    hudAcc += dt;
    if (hudAcc > 0.15) {
      hudAcc = 0;
      updateTargetChip();
      hud.update({
        player, username, mode, run, ping: net.ping, online: others.size + 1, zoom: stage.view.zoom, viewCells: Math.round(stage.viewCells()),
        roomCounts, runRoom, otherPlayers: [...others.values()].filter((o) => !o.runRoom), boss, portals, world, party: party.others(), zoneMobs: zone.mobs, mobInfo: ZONE_MOBS, camps: world === 'arinar' ? zone.camps : null, track: tracker.trackTypes, hunt: tracker.hunt?.target || null,
        lastFaceDir: { x: player.dirX, y: player.dirY }, nearby: nearbyList(), dash,
        zoneMe: mode === 'hub' && meta.hero ? zone.me : null, eff: meta.hero?.effective || null, heroName: meta.hero ? meta.heroName(player.stats.classId) : null, dps: dpsMeter.stats(),
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
    const mv = blocked ? { x: 0, y: 0 } : autoMv || moveVector(); // autoMv — плейтест «прогулка по чанкам» (debug.walk)
    dash.cd = Math.max(0, dash.cd - dt);
    if (input.dashPressed && !blocked && dash.cd <= 0 && !dash.active) {
      dash.active = true; dash.timer = DASH.duration; dash.cd = DASH.cooldown; dash.max = DASH.cooldown;
      net.send({ type: 'dash' }); // сервер: перезарядка и неуязвимость по своим часам, мигание — всем в мире (dash_fx)
      dash.dirX = mv.x || player.dirX; dash.dirY = mv.y || player.dirY;
      const l = Math.hypot(dash.dirX, dash.dirY) || 1; dash.dirX /= l; dash.dirY /= l;
    }
    input.dashPressed = false; input.abilityPressed = false;
    const pn = performance.now(), slowK = world === 'arena' ? (pn < pvpSt.frozenUntil ? 0 : pn < pvpSt.slowUntil ? 0.6 : 1) : 1; // статусы дуэли
    // скорость героя из талантов/снаряжения/души (eff.speedPct, сервер уже применил мягкий кап и нижнюю границу −20%)
    // Порыв сияния (+25% на 2 с) — и в открытом мире, и на арене
    const swiftK = (pn < swiftSt.until || pn < pvpSt.swiftUntil) ? 1.25 : 1;
    const spK = mode === 'run' ? 1 : 1 + (meta.hero?.effective?.speedPct || 0) / 100;
    let vx = mv.x * MOVE_SPEED * slowK * spK * swiftK, vy = mv.y * MOVE_SPEED * slowK * spK * swiftK;
    if (dash.active) {
      vx = dash.dirX * DASH.speed; vy = dash.dirY * DASH.speed;
      dash.timer -= dt;
      if (dash.timer <= 0) dash.active = false;
    }
    if (duel.inArena && duel.lastPh !== 'fight') { vx = 0; vy = 0; } // отсчёт дуэли: стоим (сервер тоже не двигает)
    player.moving = Math.hypot(vx, vy) > 1;
    if (player.moving) {
      if (!dash.active) { const l = Math.hypot(mv.x, mv.y) || 1; player.dirX = mv.x / l; player.dirY = mv.y / l; }
      const [blo, bhi] = worldBounds(world), lo = Math.max(16, blo), hi = Math.min(worldSize(world) - 16, bhi); // арена: стены
      const nx = Math.max(lo, Math.min(hi, player.x + vx * dt));
      const ny = Math.max(lo, Math.min(hi, player.y + vy * dt));
      if (!hub.map.isBlocked(nx, player.y, 10)) player.x = nx;
      if (!hub.map.isBlocked(player.x, ny, 10)) player.y = ny;
      // твёрдые пропсы v2 — то же выталкивание, что делает сервер (предсказание без рывков)
      if (world !== 'arena' || !duel.inArena) { const [px, py] = resolveWorld(world, player.x, player.y); player.x = Math.max(lo, Math.min(hi, px)); player.y = Math.max(lo, Math.min(hi, py)); }
    }
    // отправка позиции: раз в MOVE_SEND_S (= такт сервера 100 мс) и только при изменении; -= без дрейфа частоты,
    // кламп — после долгого кадра/скрытой вкладки не шлём пачку подряд
    moveAcc += dt;
    if (moveAcc >= MOVE_SEND_S) {
      moveAcc -= MOVE_SEND_S; if (moveAcc >= MOVE_SEND_S) moveAcc = 0;
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
      me: { x: player.x, y: player.y, dirX: player.dirX, dirY: player.dirY, moving: player.moving, classId: player.stats.classId, look: meta.hero?.effective?.look || null, color: player.color, scale: dash.active ? 1.08 : 1, blink: (zone.me && zone.me.alive === false) || blinkOn('me'), cg: meta.hero?.effective?.cursedGlow || 0, bk: meta.hero?.effective?.blkVis || 0 },
      others: visibleOthers.map((o) => ({ key: o.id, x: o.x, y: o.y, dirX: o.dirX, dirY: o.dirY, moving: o.moving, stats: o.stats, look: o.stats?.look || null, color: o.color, blink: blinkOn(o.id) })),
      boss: world === 'hellfire' ? boss : null,
      dar: world === 'hellfire' ? dar : null,
      flowers: world === 'hellfire' ? flowers : new Map(),
      flowerHi: nearestFlower()?.id || null,
    });

    // камера
    window.__GAME_CAMERA__ = { x: player.x, y: player.y, zoom: stage.view.zoom };
    stage.useOrtho = false;
    stage.follow(toX(player.x), toZ(player.y), dt);

    // открытый мир: мобы/ресурсы/NPC сервера, атака по клику, сбор
    zone.view = player; zone.update(dt, world);
    zoneTick(dt, now);

    // подписи
    overlay.beginFrame();
    dpsMeter.render();
    const head = (x, y, h = 2.5) => stage.project(toX(x), h, toZ(y));
    const alive = new Set(['__me']);
    let p = head(player.x, player.y);
    if (p) {
      const zm = zone.me;
      const hpBar = player.stats.classId && zm && zm.maxHp && zm.hp < zm.maxHp ? `<div class="mc3d-mini-hp"><i style="width:${Math.max(0, Math.round((zm.hp / zm.maxHp) * 100))}%"></i></div>` : '';
      overlay.label('me', p.x, p.y, `${roleTag(myRole)}${esc(username)}<small>${esc(displayClassName(player.stats.classId))}${meta.hero ? ` · ур. ${meta.hero.lvl}` : ''}${player.shield ? ` · 🛡️${player.shield}` : ''}</small>${hpBar}`, '#ffd700');
      overlay.placeBubble('__me', p.x, p.y - 26);
    }
    visibleOthers.forEach((o) => {
      alive.add(o.id);
      const q = head(o.x, o.y);
      if (!q) return;
      // союзник по отряду — фиолетовая полоска ОЗ (данные отряда); остальные игроки — без изменений
      const pm = party.has(o.id) ? party.state.members.find((m) => m.sid === o.id) : null;
      const pBar = pm && pm.maxHp ? `<div class="mc3d-mini-hp party"><i style="width:${Math.max(0, Math.round((pm.hp / pm.maxHp) * 100))}%"></i></div>` : '';
      overlay.label('p_' + o.id, q.x, q.y, `${roleTag(o.role)}${esc(o.username)}<small>${esc(displayClassName(o.stats?.classId))}${o.stats?.lvl ? ` · ур. ${o.stats.lvl}` : ''}</small>${pBar}`, o.color);
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
      const q = stage.project(toX(pt.x), pt.id === 'portal_class_select' ? 5.0 : 3.6, toZ(pt.y));
      if (!q) continue;
      const extra = pt.runRoom ? `<small>${roomCounts[pt.runRoom] || 0}/4 в забеге · co-op</small>` : '';
      overlay.label('pt_' + pt.id, q.x, q.y, `${esc(pt.name)}${extra}`, pt.color || '#c084fc');
    }
    // сундуки схватки: таймер личной/общей фазы
    for (const c of zone.chests.values()) { const q = stage.project(toX(c.x), 2.2, toZ(c.y)); if (!q) continue; const left = Math.max(0, c.left - Math.floor((Date.now() - c.at) / 1000)); const t = left >= 60 ? `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}` : `${left} с`;
      overlay.label('ch_' + c.id, q.x, q.y, c.pub ? `📦 Общий сундук<small>${c.n} предм. · ${t}</small>` : `📦 ${c.mine ? 'Ваша добыча: ' + c.mine : 'Чужая добыча'}<small>личный · ${t}</small>`, c.pub ? '#e5e7eb' : c.mine ? '#fde68a' : '#94a3b8'); }
    // NPC: имя и значок задания (❕ — есть задание, ✔ — можно сдать)
    for (const [id, n] of Object.entries(NPC_LIST)) {
      if (n.world !== world) continue;
      let np = npcPos(id); // NPC бродят — имя и значок задания идут за ним
      if (n.mobile) { const bmm = zone.bmv?.mage; if (!bmm) continue; np = { x: bmm.x, y: bmm.y }; } // Чёрный маг — только когда он рядом
      const q = stage.project(toX(np.x), 3.0, toZ(np.y));
      if (!q) continue;
      const mark = npcMark(id), ic = npcIconUrl(id); // портрет квестодателя (арт VN) рядом с именем
      overlay.label('npc_' + id, q.x, q.y, `${mark ? `<b class="mc-npc-mark">${mark}</b>` : ''}${ic ? `<img class="mc-npc-ic${mark ? ' q' : ''}" src="${ic}" alt="">` : ''}${esc(n.name)}<small>${esc(n.title)}</small>`, n.color);
    }
    // мобы мира с неполным здоровьем — полоска
    for (const o of zone.mobs.values()) {
      const stRow = mobStatusRow(o);
      if (o.hp >= 100 && !ZONE_BOSS[o.type] && !stRow) continue;
      const q = stage.project(toX(o.x), ZONE_BOSS[o.type] ? 6.4 : 2.6, toZ(o.y));
      if (!q) continue;
      overlay.label('zm_' + o.id, q.x, q.y, `${ZONE_BOSS[o.type] ? esc(ZONE_BOSS[o.type]) : ''}${stRow}<div class="mc3d-mini-hp"><i style="width:${o.hp}%"></i></div>`, ZONE_BOSS[o.type] ? '#c084fc' : '#e2e8f0');
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
      const bagN = zone.nearestBag(player.x, player.y, 100);
      lootWin.tick(player.x, player.y); chestWin.tick(player.x, player.y); zone.chestSt = { chan: chestWin.ch?.id || 0, open: chestWin.c?.id || 0 };
      const chN = zone.nearestChest(player.x, player.y, 110);
      { const show = world === 'arinar'; homeBtn.style.display = show ? 'block' : 'none'; const tb = overlay.layer.querySelector('.mc3d-tbtn[data-act="home"]'); if (tb) tb.style.display = show ? '' : 'none';
        const left = Math.max(0, Math.ceil((homePortalCd - Date.now()) / 1000)); homeBtn.classList.toggle('cd', left > 0); homeBtn.querySelector('small').textContent = left ? left : ''; }
      if (chN && !chestWin.isOpen && !chestWin.channeling) promptText = `${key} — ${chN.pub ? 'открыть общий сундук (' + chN.n + ')' : chN.mine ? 'забрать свою добычу (' + chN.mine + ')' : 'сундук личный'}`;
      else if (bagN && !lootWin.isOpen) promptText = `${key} — открыть добычу (${bagN.n})`;
      else if (zoneSt.gather) promptText = `Сбор: ${zone.resName(zoneSt.gather.res)} ${Math.round(Math.min(1, zoneSt.gather.t / (zone.gatherTime() / 1000)) * 100)}%`;
      else if (npc) promptText = `${key} — поговорить: ${npc.name}`;
      else if (node) promptText = `${key} — собрать: ${zone.resName(node.def.res)}`;
      else if (np) promptText = `${key} — ${np.runRoom ? 'войти: ' : ''}${np.name}${np.id === 'portal_class_select' ? ' (выбор героя · ветка души)' : ''}`;
      else if (nf) promptText = `${key} — ${nf.stage === 'bud' ? 'тронуть бутон (-1 HP)' : 'сорвать цветок (+20 щит)'}`;
      if (nearAltar && !np && (meta.account?.creation || meta.account?.soul?.length)) promptText += ' · 🜏 ветка души — Книга';
      touch.setInteractHighlight(!!(npc || node || np || nf));
    }
    overlay.setPrompt(promptText);
    tracker.update({ mobs: mode === 'hub' ? zone.mobs : null, nodes: mode === 'hub' ? zone.nodes : null, camps: world === 'arinar' ? zone.camps : null, world, x: player.x, y: player.y, hasClass: !!player.stats.classId, online: net.isOpen() && !net.offline, mobsNear: !!zone.nearestMob(player.x, player.y, 400), near: { altar: world === 'hellfire' && Math.hypot(player.x - ALTAR.x, player.y - ALTAR.y) < 90 } });
    party.setHub(mode === 'hub'); // панель отряда видна в мире и без отряда («＋ Пригласить»)
    zone.trackTypes = tracker.trackTypes; // подсветка мобов-целей квеста на экране
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
    let dir = null, lock = null;
    if (aim.held) {
      // мышь: удар в сторону курсора (точка на земле пересчитывается каждый удар)
      dir = aimDir() || { x: player.dirX || 0, y: player.dirY || 1 };
    } else if (aim.touch && world === 'arena' && others.get(duel.oppSid())) {
      // арена: автонаведение на соперника (кнопка ⚔ на телефоне / автоатака)
      const o = others.get(duel.oppSid()), dx = o.x - player.x, dy = o.y - player.y, d = Math.hypot(dx, dy) || 1;
      dir = { x: dx / d, y: dy / d };
    } else if (aim.touch) {
      dir = zone.assistDir(player.x, player.y, player.dirX || 0, player.dirY || 1, wt);
    } else if (autoAttack && (lock = lockedTarget())) {
      // автоатака + выбранный враг: точно в него (сервер сам целит в его текущую позицию по msg.mob)
      const dx = lock.x - player.x, dy = lock.y - player.y, d = Math.hypot(dx, dy) || 1; dir = { x: dx / d, y: dy / d };
    } else if (autoAttack && aimDir()) {
      dir = aimDir(); // автоатака без цели: в сторону курсора
    } else if (autoAttack) {
      const target = zone.nearestMob(player.x, player.y);
      if (target) { const dx = target.x - player.x, dy = target.y - player.y, d = Math.hypot(dx, dy) || 1; dir = { x: dx / d, y: dy / d }; }
    }
    if (!dir) return;
    zoneSt.lastAtk = now;
    const sm = shotMsg(dir, lock ? { mob: lock.mob, tx: Math.round(lock.x), ty: Math.round(lock.y) } : aim.held || autoAttack ? {} : { tx: null, ty: null });
    send({ type: 'zone_attack', ...sm });
    { // стрелковое оружие: свой снаряд рисуем сразу из центра героя (подтвердит сервер тем же cid)
      const W0 = WEAPON_TYPES[wt] || WEAPON_TYPES.book;
      if (W0.atk.kind !== 'arc' && zone.pax) { zone.pax.meSid = myId; const t = { daggers: 'auto_daggers', book: 'auto_staff', staff: 'auto_staff', bow: 'auto_bow', fly_blades: 'auto_claws', spear: 'spear' }[wt] || 'auto_staff'; // = AUTO_SPRITE сервера
        const tx = sm.tx ?? player.x + dir.x * 100, ty = sm.ty ?? player.y + dir.y * 100, L = Math.hypot(tx - player.x, ty - player.y) || 1, ux = (tx - player.x) / L, uy = (ty - player.y) / L;
        for (const [vx, vy] of volleyDirs(W0.atk, ux, uy)) zone.pax.predict(sm.cid, t, player.x, player.y, vx, vy, W0.atk.range, { auto_bow: 900, auto_daggers: 760, auto_staff: 620, auto_claws: 700, spear: 820 }[t] || 640); }
    }
    // залп (кинжалы ×2, лапки-лезвия ×5) — та же раскладка направлений, что на сервере (shared.volleyDirs)
    let anyHit = false; zoneSt.lastVolley = 0;
    for (const [vx, vy] of volleyDirs((WEAPON_TYPES[wt] || WEAPON_TYPES.book).atk, dir.x, dir.y)) {
      const pred = zone.aimTargets(player.x, player.y, vx, vy, wt);
      const first = pred.list[0]; if (first) anyHit = true; zoneSt.lastVolley++;
      const reach = pred.atk.kind === 'arc' ? pred.atk.range * 0.8 : pred.atk.range;
      if (pred.atk.kind !== 'arc') continue; // мир и дуэль: снаряд ведёт и рисует сервер ({k:'proj'}), без локального прогноза
      if (first && pred.atk.kind === 'proj') zone.shoot(player.x, player.y, first.id, wt);
      else zone.shoot(player.x, player.y, null, wt, player.x + vx * reach, player.y + vy * reach);
    }
    if (!player.moving) { player.dirX = dir.x; player.dirY = dir.y; }
    hub.attackMe?.();
    if (anyHit) tracker.tutDone('fight');
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
    if (runUI.choiceOpen) runUI.setInvuln(run.invulnLeft(), LVL_INVULN);
    const blocked = overlay.chatOpen || (overlay.screen && !runUI.choiceOpen && !run.ended);
    const mv = blocked ? { x: 0, y: 0 } : moveVector();
    party.setHub(false); // в забеге плашка «Отряд · Пригласить» без отряда не нужна (раньше оставалась с Поляны и закрывала HP)
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
      inspect: (sid) => inspectPlayer(sid), charSheet: () => toggleCharSheet(),
      // витрина FX v2: семейства снарядов монстров + эффекты навыков (конусы, новы, рывки, удар стража, телеграфы); возвращает ключи без спрайта
      charsBlk: () => !/^(127\.0\.0\.1|localhost)$/.test(location.hostname) ? null : Object.fromEntries([...hub.chars].map(([k, c]) => [k, { bk: c.bk | 0, on: !!c.ch?.blk?.visible }])), // очернение героев на экране (плейтест)
      myGlow: () => { const c = hub.chars.get('__me')?.ch; return c?.glow?.visible ? { k: c.glowK, pulse: !!c.glowPulse } : null; },
      othersGlow: () => [...hub.chars.entries()].filter(([k]) => k.startsWith('p_')).map(([k, c]) => ({ k: c.ch.glow?.visible ? c.ch.glowK : 0, pulse: !!c.ch.glowPulse })),
      // витрина навыка R: слева обычный, справа проклятый (cz — как в событиях сервера)
      cursedFxDemo: (X, Y) => { ['fireball', 'moon_orb', 'chain_bolt'].forEach((t, i) => { for (const cz of [0, 1]) zone.pax.spawn({ id: 700000 + i * 2 + cz + Math.floor(Math.random() * 1e4) * 10, t, o: 'p', x: X + (cz ? 45 : -75), y: Y - 75 + i * 40, dx: 1, dy: 0, s: 2, r: 4000, cz }); });
        zone.applyState({ w: zone.world, m: [], ev: [{ k: 'ability', id: 'rs:frost_nova', x: X - 160, y: Y + 200, r: 90 }, { k: 'ability', id: 'rs:frost_nova', x: X + 160, y: Y + 200, r: 90, cz: 1 }] }, myId); },
      fxDemo: (what = 'enemy') => {
        const X = player.x, Y = player.y, T = zone.teles;
        if (what === 'clear') { T.length = 0; zone.pax.live.clear(); zone.pax.fx.length = 0; }
        if (what === 'enemy') ['enemy_acid','enemy_bone','enemy_fire','enemy_frost','enemy_shadow','enemy_arcane','enemy_blood','enemy_rock','enemy_lightning','enemy_web','enemy_water','enemy_boss'].forEach((t, i) => zone.pax.spawn({ id: 800000 + i + Math.floor(Math.random() * 1e5) * 100, t, x: X - 250 + (i % 4) * 130, y: Y - 150 + Math.floor(i / 4) * 110, dx: 1, dy: 0, s: 5, r: 4000 }));
        if (what === 'skills') {
          T.push({ kind: 'cone', fx: 'ice_fan_cone', x: X - 60, y: Y - 120, dx: -1, dy: 0, len: 260, arc: 1.0, t: 13, life: 30 }, { kind: 'cone', fx: 'dew_splash_cone', x: X + 60, y: Y - 120, dx: 1, dy: 0, len: 220, arc: 1.1, t: 13, life: 30 }, { kind: 'cone', fx: 'gear_spin_cone', x: X, y: Y + 40, dx: 0, dy: 1, len: 200, arc: 1.6, t: 13, life: 30 });
          T.push({ kind: 'nova', fx: 'frost_nova', x: X - 300, y: Y + 150, r: 110, t: 13, life: 30 }, { kind: 'nova', fx: 'nova_burst', x: X + 300, y: Y + 150, r: 110, t: 13, life: 30, col: [1, 0.45, 0.55] }, { kind: 'nova', fx: 'whirlwind', x: X - 300, y: Y - 60, r: 100, t: 13, life: 30 }, { kind: 'nova', fx: 'shield_wall', x: X + 300, y: Y - 60, r: 100, t: 13, life: 30 });
          T.push({ kind: 'dash', fx: 'dash_trail', x: X - 200, y: Y + 260, dx: 1, dy: 0, len: 180, t: 13, life: 30, col: [1, 0.5, 0.45] }, { kind: 'dash', fx: 'shadow_step_trail', x: X + 40, y: Y + 260, dx: 1, dy: 0, len: 180, t: 13, life: 30 });
          T.push({ kind: 'slam', x: X + 160, y: Y - 260, r: 120, t: 0.5, life: 30 });
        }
        if (what === 'tele') {
          T.push({ kind: 'line', x: X - 250, y: Y - 100, dx: 1, dy: 0, len: 220, t: 29, life: 30 }, { kind: 'circle', x: X + 150, y: Y - 100, r: 90, t: 15, life: 30 }, { kind: 'tcone', x: X - 100, y: Y + 80, dx: 0, dy: 1, len: 220, arc: 1.1, t: 0, life: 30 }, { kind: 'boom', x: X + 220, y: Y + 160, r: 90, t: 0.1, life: 30, color: 0xfde68a });
        }
        return window.__fxMissing?.() || [];
      },
      // витрина атласа: все виды снарядов сеткой 5×5 (медленно летят вправо) + удары/лужа/падение метеора
      projDemo: (kinds) => { const ks = kinds || ['fireball','war_axe','fire_spark','moon_orb','split_shard','thorn_bow','spear','daggers','sun_beam','ice_fan','chain_bolt','plague_flask','glyph_mine','orbit_skulls','meteor','spear_rain','dew_splash','auto_staff','auto_bow','auto_daggers','auto_claws','pierce'];
        ks.forEach((t, i) => zone.pax.spawn({ id: 900000 + i + Math.floor(Math.random() * 1e5) * 100, t, x: player.x - 260 + (i % 6) * 100, y: player.y - 170 + Math.floor(i / 6) * 90, dx: 1, dy: 0, s: 6, r: 4000 }));
        zone.pax.puddle(player.x - 200, player.y + 200, 70, 30); zone.pax.impact('fireball', player.x + 260, player.y + 200, { k: 2 }); zone.pax.fall('meteor', player.x, player.y + 220, 0.5, -1, 1.2); return ks.length; },
      projList: () => ({ me: { x: player.x, y: player.y }, confirmed: zone.pax.confirmed || 0, list: [...zone.pax.live.values()].filter((p) => p.o === 'p').map((p) => { const d = Math.min(p.r, p.s * p.age); return { id: p.id, t: p.t, pred: !!p.pred, x0: p.x0, y0: p.y0, x: p.x0 + p.dx * d, y: p.y0 + p.dy * d, dx: p.dx, dy: p.dy, age: p.age }; }) }),
      selectMobId: (id) => { const o = zone.mobs.get(id); if (o) selectMob(o); return !!o; },
      mobsNear: (r = 500) => [...zone.mobs.values()].filter((o) => !o.dead && Math.hypot(o.x - player.x, o.y - player.y) < r).map((o) => ({ id: o.id, x: o.x, y: o.y, type: o.type })),
      dps: () => dpsMeter.stats(),
      party: () => party.state,
      myId: () => myId,
      runRoom: () => lobby?.room || null,
      track: () => ({ hunt: tracker.hunt, target: tracker.target, types: [...(tracker.trackTypes || [])], camps: (zone.camps || []).length, mm: hud.minimap?.stats }),
      forceQuest: (id) => { const tq = meta.trackedQuests.bind(meta); meta.trackedQuests = () => [id, ...tq().filter((x) => x !== id)]; meta.trackedQuest = () => id; },
      worldMapStats: () => worldMap.stats,
      campsRaw: () => zone.camps,
      bossState: () => [...BOSS_STATE_DBG.entries()],
      projs: () => ({ live: zone.pax.count, fx: zone.pax.fx.length, kinds: [...zone.pax.live.values()].map((p) => `${p.o || "?"}:${p.t}`), ready: zone.pax.ready, spawned: { ...zone.pax.spawned } }),
      rawSend: (o) => net.send(o),
      dropWs: () => net.socket?.close(4000, 'test'),
      loadAtlas: (u) => loadAtlasTexture(THREE, u).then(() => 'ok', () => 'rejected'),
      closeAdmin: () => adminPanel.close?.(),
      arena: () => ({ tiles: runView?.arena?.tiles || null, ready: !!runView?.arena?.floorReady, theme: runView?.arena?.theme }),
      openAltar: () => classSelect.open(player.stats.classId),
      altarFlash: () => hub.portalObjs?.get('portal_class_select')?.flash?.(),
      grim: (g, f) => { grimSet('grim', g); grimSet('fog', f); },
      light: (c) => { if (c) setLightCfg(c); return { ...LIGHT }; },
      props: () => ({ ...PROP_STATS, gfx: { ...GFX }, next: GFX_NEXT.value }), // набор пропсов (props2/props3), листы, байты VRAM, мс загрузки // свет мира (engine/pixColor.js): тесты и подбор значений админки «💡 Свет»
      style: (v) => grimSet('style', v),
      minimap: () => hud.minimap?.stats,
      openAdmin: () => adminPanel.open(), admin: () => ({ open: adminPanel.isOpen, loaded: !!adminPanel.cat, scope: adminPanel.cat?.scope || (adminPanel.full ? 'admin' : 'moderator'), full: !!adminPanel.full, tabs: adminPanel.tabs?.().map((x) => x[0]) || [], totals: adminPanel.cat?.totals, configVer, weapon: (id) => WEAPON_TYPES[id], skill: (id) => ABILITY_BY_ID[id], card: (id) => cardOf(id), cardIds: () => cardIds(), questDef: (id) => ALL_QUESTS.find((x) => x.id === id), quest: (id) => { const q = ALL_QUESTS.find((x) => x.id === id); return q && { title: q.title, offer: q.offer }; }, btn: !!document.getElementById('ghud-admin-btn') && document.getElementById('ghud-admin-btn').style.display !== 'none' }),
      fog: () => ({ world: fog.world, active: fog.active(world), cells: fog.cells, pct: fog.pct() }),
      nodesNear: (r = 900, res = null) => [...zone.nodes.values()].filter((n) => (!res || n.def.res === res) && Math.hypot(n.def.x - player.x, n.def.y - player.y) < r).map((n) => ({ id: n.id, x: n.def.x, y: n.def.y, res: n.def.res, type: n.def.type, ready: n.ready, readyIn: n.readyIn })),
      nodesAll: (res) => [...zone.nodes.values()].filter((n) => !res || n.def.res === res).map((n) => ({ id: n.id, x: n.def.x, y: n.def.y, ready: n.ready })),
      glowSet: (c) => zone.setGlow(c), glowCfg: () => zone.glowCfg, interact: () => interact(), questCond: () => tracker.cond || {},
      dashInfo: () => ({ cd: DASH.cooldown, invulnMs: DASH.invulnMs, blink: DASH.blink, blinking: [...ivBlink.keys()] }),
      biomes: () => ({ known: mapZonesKnown(), labels: biomeLabels(world).map((L) => L.key) }),
      worldMap: () => ({ open: worldMap.isOpen, ...(worldMap.stats || {}) }),
      openMap: () => worldMap.open(), mapZoom: (f) => worldMap.zoomBy(f), mapBiome: (on) => worldMap.toggleBiome(on), marks: () => ({ world: MARKS.world, n: MARKS.list.length, list: MARKS.list.map((m) => m.n), show: MARKS.show }), mapTap: (sx, sy) => worldMap.tap(sx, sy), mapScreen: (x, y) => worldMap.toScreen(x, y),
      bags: () => [...zone.bags.values()], chests: () => [...zone.chests.values()], chest: () => ({ open: chestWin.isOpen, chan: chestWin.channeling, c: chestWin.c }), loot: () => ({ open: lootWin.isOpen, entries: lootWin.bag?.entries || [] }),
      portals: () => portals.map((p) => ({ id: p.id, x: p.x, y: p.y, world: p.world, personal: !!p.personal, foreign: !!p.foreign, name: p.name })),
      zoneMobs: () => [...zone.mobs.values()].map((m) => ({ type: m.type, x: Math.round(m.x), y: Math.round(m.y), elite: !!m.elite, chief: !!m.chief })),
      // тест мерцания: статичные пары спрайтов на ОДНОЙ глубине (батч мобов + 2 героя-спрайта) у точки (x, y) мира
      sortDemo: async (x, y) => {
        const { SpriteBatch } = await import('./engine/spriteBatch.js'); const { createCharacter } = await import('./engine/characters.js');
        const tex = zone.batch?.material.uniforms.map.value; if (!tex) return 'no atlas';
        const B = new SpriteBatch(THREE, tex, { cellW: 48, cellH: 48, cols: tex.image ? Math.round(tex.image.width / 48) : 8, rows: tex.image ? Math.round(tex.image.height / 48) : 8, max: 16 });
        B.begin(); for (let k = 0; k < 4; k++) for (let j = 0; j < 2; j++) { B.push(toX(x) - 3 + k * 2 + j * 0.45, 0, toZ(y) + 1.5, 2.2, 1, (k * 2 + j) % 8); B.sortId?.('demo' + k + '_' + j); } B.end();
        hub.root.add(B.mesh); window.__sortDemo = B;
        // «дрожащая» пара (как толпа мобов: y отличается на доли мм и меняет знак каждый кадр) — до фикса порядок прыгал
        const J = new SpriteBatch(THREE, tex, { cellW: 48, cellH: 48, cols: tex.image ? Math.round(tex.image.width / 48) : 8, rows: tex.image ? Math.round(tex.image.height / 48) : 8, max: 4 });
        hub.root.add(J.mesh); const zb = Math.floor((toZ(y) + 3) / 0.05) * 0.05 + 0.025; let fr = 0;
        const tick = () => { fr++; const j = fr % 2 ? 0.004 : -0.004; J.begin(); J.push(toX(x) - 1, 0, zb + j, 2.4, 1, 2); J.sortId?.('jA'); J.push(toX(x) - 0.4, 0, zb - j, 2.4, 1, 5); J.sortId?.('jB'); J.end(); requestAnimationFrame(tick); };
        tick();
        for (let j = 0; j < 2; j++) { const c = createCharacter(THREE, j ? 'mage' : 'warrior'); c.group.position.set(toX(x) + 3 + j * 0.35, 0, toZ(y) + 1.5); hub.root.add(c.group); c.setSortId?.('demoH' + j); c.update(0, false, 0); }
        return 'ok';
      },
      fakeZoneMob: (type, x, y) => zone.mobs.set('fake_' + type, { id: 'fake_' + type, type, x, y, tx: x, ty: y, hp: 1 }), // тест мини-карты (мировые боссы появляются по таймеру)
      othersInfo: () => [...others.values()].map((o) => ({ world: o.world, x: Math.round(o.x), y: Math.round(o.y), runRoom: o.runRoom })),
      plantFlower: (x, y, stage) => net.send({ type: 'dev_plant_flower', x, y, stage }),
      flowers: () => [...flowers.values()].map((f) => ({ id: f.id, x: f.x, y: f.y, stage: f.stage })),
      // видимость цветка: объект хаба существует, виден, и его точка на экране внутри канваса
      flowerVisible: (id) => { const o = hub.flowerObjs.get(id); if (!o || !o.group.visible || !o.group.parent) return false; const p = o.group.position; const s = stage.project(p.x, 0.5, p.z); return !!s && s.x >= 0 && s.y >= 0 && s.x <= stage.width && s.y <= stage.height; },
      flowerHighlighted: (id) => !!hub.flowerObjs.get(id)?.ring?.visible,
      prompt: () => (overlay.prompt.style.display === 'none' ? '' : overlay.prompt.textContent),
      lightSources: () => (atmo.sources || []).map((s) => ({ k: s.ek || null, x: Math.round(s.x * 20) / 20, z: Math.round(s.z * 20) / 20, ex: s.ex, ey: s.ey, ez: s.ez, gx: s.gx, gz: s.gz, px: Math.round((s.x - toX(0)) * 20), py: Math.round((s.z - toZ(0)) * 20) })), // огни сцены и точки излучения (lightEmitter)
      atmo: () => ({ mood: atmo.moodKey, sh: atmo.shadows?.count, st: atmo.staticShadows?.count || 0, src: atmo.sources?.length || 0, pools: atmo.pools?.count, parts: atmo.partN, lights: atmo.lights.filter((l) => l.intensity > 0).length }),
      teleport: (x, y) => { player.x = x; player.y = y; },
      mobStatusRow: (o) => mobStatusRow(o),
      hpBars: () => [...document.querySelectorAll('.mc3d-label .mc3d-mini-hp i')].map((i) => ({ party: i.parentElement.classList.contains('party'), self: !!i.closest('.mc3d-label')?.dataset?.me, color: getComputedStyle(i).backgroundColor })),
      tp: (x, y, god = true) => { player.x = x; player.y = y; net.send({ type: 'dev_teleport', x, y, god }); }, // dev-сервер: мгновенно и на сервере
      devSpawn: (type, x, y, cursed, ench) => net.send({ type: 'dev_spawn_mob', mob: type, x, y, cursed, ench }),
      target: () => hud.currentTarget,
      zoneFrozen: (list) => { const f = [...zone.mobs.values()].filter((m) => m.frozen); return list ? f.map((m) => ({ id: m.id, x: m.tx, y: m.ty })) : f.length; },
      zoneMobsFull: () => [...zone.mobs.values()].map((m) => ({ id: m.id, type: m.type, x: m.x, y: m.y, hp: m.hp, maxHp: m.maxHp, cursed: !!m.cursed, ench: m.ench | 0, elite: !!m.elite, boss: !!(m.flagRaw & 256) })),
      abilities: () => (meta.hero?.effective?.abilities || []).map((a) => a.id),
      bolts: () => zone.bolts.length, lastVolley: () => zoneSt.lastVolley || 0,
      selected: () => zone.selected || 0,
      walk: (x, y) => { autoMv = x || y ? { x, y } : null; return autoMv; }, // идти в направлении (плейтест стрима), 0,0 — стоп
      frames: (reset) => { const q = (a, k) => { if (!a.length) return 0; const b = [...a].sort((u, v) => u - v); return Math.round(b[Math.min(b.length - 1, Math.floor(b.length * k))] * 10) / 10; };
        const o = { n: FS.n, cpuMax: Math.round(FS.cpuMax * 10) / 10, cpuP99: q(FS.cpu, 0.99), cpuP50: q(FS.cpu, 0.5), gapMax: Math.round(FS.gapMax), gapP99: q(FS.gap, 0.99), gapP50: q(FS.gap, 0.5) };
        o.slow = FS.slow || []; if (reset) { FS.n = 0; FS.cpuMax = 0; FS.gapMax = 0; FS.cpu = []; FS.gap = []; FS.slow = []; } return o; },
      vram: () => ({ ...VRAM.inst?.stats, ...VRAM.inst?.measure(), cfg: vcfg(), radius: hub.env?.terrain?.radius || null, pending: VRAM.inst?.pending || 0 }),
      upLog: () => VRAM.inst?.upLog || [],
      setVram: (v) => { setVramCfg(v); return vcfg(); },
      vramTop: (n = 12) => [...VRAM.inst.seen.entries()].filter(([t]) => VRAM.inst.onGpu(t)).map(([t, e]) => ({ mb: Math.round(texBytes(t) / 104857.6) / 10, w: t.image?.width, h: t.image?.height, src: String(t.image?.src || t.image?.currentSrc || t.image?.constructor?.name || '').split('/').pop().slice(0, 40), idle: Math.round(performance.now() - e.last) })).sort((a, b) => b.mb - a.mb).slice(0, n),
      vramTick: () => { VRAM.inst._scanAt = 0; VRAM.inst.tick(); return VRAM.inst.stats; },
      cache: () => cacheSummary(),
      chunks: () => { const t = hub.env?.terrain; return t?.stats ? { ...t.stats, keys: [...t.chunks.keys()].length } : null; },
      biomeVars: () => ({ biome: document.documentElement.dataset.biome || '', col: getComputedStyle(document.documentElement).getPropertyValue('--mc-biome').trim() }),
      pos: () => ({ x: player.x, y: player.y }),
      // экранная точка мировой позиции (px мира) — для тестов клика мышью
      screenOf: (x, y) => {
        const v = new THREE.Vector3(toX(x), 0, toZ(y)).project(stage.activeCamera());
        const r = canvas.getBoundingClientRect();
        return { x: r.left + (v.x + 1) / 2 * r.width, y: r.top + (1 - v.y) / 2 * r.height };
      },
      aim: () => ({ ...aim, autoAttack }),
      selectClass: (id) => classSelect.onSelect(id),
      setZoom: (z) => { stage.view.targetZoom = z; stage.view.zoom = z; },
      mood: (k) => { atmo.moodOverride = k || null; return atmo.moodOverride; }, // настроение сцены принудительно (hub — ночь, b_stone — нейтральный «день»); null — по зоне
      freeCam: (o) => { stage.freeCam = o && Number.isFinite(o.x) && Number.isFinite(o.z) ? { x: o.x, z: o.z, zoom: o.zoom || 0 } : null; return stage.freeCam; }, // свободная камера (сцена, м); null — снова за героем
      setCells: (c) => { const z = Math.max(stage.view.minZoom, Math.min(stage.view.maxZoom, stage.zoomForCells(c))); stage.view.targetZoom = stage.view.zoom = z; return Math.round(stage.viewCells(z)); },
      cam: () => ({ zoom: stage.view.zoom, cells: Math.round(stage.viewCells()), min: Math.round(stage.viewCells(stage.view.maxZoom)), max: Math.round(stage.viewCells(stage.view.minZoom)),
        d: stage.distance(), near: stage.camera.near, far: stage.camera.far, fogFar: stage.scene.fog?.far, shadowHalf: stage.sun.shadow.camera.right, pitch: stage.pitch, fov: stage.camera.fov }),
      spawn: (type, n = 1, elite = false) => { if (run) for (let i = 0; i < n; i++) run.spawnEnemy(type, run.me, null, { elite }); },
      openBook: (tab) => book.open(tab),
      openUpgrade: () => upgWin.open(),
      npcPos: (id) => npcPos(id), npcServer: (id) => npcServer(id), npcSpawn: (id) => NPCS[id] && { x: NPCS[id].x, y: NPCS[id].y }, nearestNpc: () => zone.nearestNpc(world, player.x, player.y)?.id || null,
      send: (m) => send(m), // тесты: dev_grant работает только при MC_DEV_TRUST_USERID=1 (локально)
      bm: () => zone.bmv?.debug() || null, target: () => hud.currentTarget, // Чёрный маг (hub/bmView.js): маг, купола, розы, земля
      overlay, runUI, zone,
      WEAPONS,
    };
  }
  api.leaveRun = () => leaveRun();
  requestAnimationFrame(frame);
  canvas.focus?.();
}
