import { ChestSprites } from '../engine/chestSprite.js';
import { BmView } from './bmView.js';
import { baseOf, goalMatch } from '../../../../../server/meta/biomes.ts';
// Общий мир (Поляна / Аринар): мобы сервера, ресурсы, NPC — всё сервер-авторитетно (server/meta/zone.ts).
// Клиент получает только сущности рядом (AOI) раз в 200 мс, интерполирует их и рисует 2.5D-спрайтами
// одним батчем. Атака/навыки/сбор — запросы к серверу; урон, лут, респавн решает сервер.
import { SpriteBatch, loadAtlasTexture } from '../engine/spriteBatch.js';
import { loadPropTextures, PropSprites } from '../engine/propAtlas.js';
import { BEAST_ROW, BEAST_H, beastTop as BEAST_TOP, beastFlying, loadBeastBatch } from '../engine/beastSprites.js';
import { Beast32View, B32, b32On } from '../engine/beast32.js';
import { mobFrame, stepZone, initState, forceState } from '../engine/beastFrames.js';
import { GFX } from '../engine/gfxCfg.js';
import { pixAtlases, MOB_CELL, MOB_ROWS, MOB_HEIGHT, MOB_FLYING, HERO_HD, HERO_CELL, HERO_H_M, NPC_ROWS, HERO_FRAMES } from '../engine/pixSprites.js';
import { mergeParts, flatMat, toX, toZ } from '../engine/geometry.js';
import {
  MOB_INFO as ZONE_MOBS, NPCS, NPC_RANGE, GATHER_RANGE, GATHER_TIME_MS, ZONE_ATTACK_RANGE, RESOURCES, WEAPON_TYPES, CLASS_WTYPE,
} from '../../../../../server/meta/shared.ts';
import { genNodes, ZONE_GEN, WET } from '../../../../../server/meta/zoneGen.ts';
import { wetNear } from '../../../../../server/meta/liquid.ts';
// Те же узлы сбора, что у сервера: сервер при генерации пропускает точки у воды/лавы (zone.ts: WET.f = wetNear), и этот пропуск
// сдвигает весь дальнейший ряд случайных чисел. Без того же фильтра здесь id узла N на клиенте стоял бы не там, где у сервера.
WET.f = wetNear;
import { sprOf, tintOf } from '../../../../../server/meta/biomes.ts';
import { ProjFx } from '../engine/projFx.js';
import { ProjAtlasFx, curseRGB, curseHex } from '../engine/projAtlas.js';
import { FX_META } from '../engine/fxAtlas.js';
// id навыка → ключ снаряда FX atlas v2 (с псевдонимами); значки/метки/телеграфы не считаются снарядами
const atlasId = (id) => { let k = String(id || '').replace(/^rs:/, ''); k = FX_META.keys[k] ? k : FX_META.aliases[k]; return k && FX_META.keys[k] && !/^(hit|status|mark|tele)_?/.test(k) && FX_META.keys[k].anims.hit ? k : null; };
// навыки без снаряда → эффект v2: рывок (шлейф), нова/аура на месте, конус
const DASH_FX = { backstab: 'shadow_step_trail', shadow_step: 'shadow_step_trail', fly_blade_dash: 'fly_blade_dash_trail', leap_strike: 'leap_strike' };
const NOVA_FX = { shield_wall: 'shield_wall', whirlwind: 'whirlwind', frost_nova: 'frost_nova', orbit_skulls: 'orbit_skulls_aura' };
const CONE_FX = { ice_fan: 'ice_fan_cone', dew_splash: 'dew_splash_cone', gear_spin: 'gear_spin_cone' };
import { atmo } from '../engine/atmosphere.js';
import { npcPos, npcStep } from '../meta/npcLive.js';
import { enchRGB } from '../meta/enchCfg.js';
import boardsAtlasSrc from '../../../../assets/mc/board/boards_atlas.png'; // ВРЕМЕННЫЙ рисунок досок (нужен художник)
// ── Зачарованные мобы (ярус 1…6 в битах 23–25 флага zone_state): оттенок, у Чёрного — мерцание, дрожь, двойник ──
const enchHash = (n) => { const x = Math.sin(n * 12.9898) * 43758.5453; return x - Math.floor(x); };
function enchTint(o, T, r, g, bl) {
  if (o.ench === 6) { const fl = enchHash(Math.floor(T * 11) + o.id) > 0.85 ? 1.7 : 0.38; return [r * 0.32 * fl + 0.04, g * 0.26 * fl, bl * 0.34 * fl + 0.05]; }
  const [er, eg, eb] = enchRGB(o.ench), p = 0.78 + Math.sin(T * 3 + o.id) * 0.22;
  return [r * (0.45 + 0.95 * er * p), g * (0.45 + 0.95 * eg * p), bl * (0.45 + 0.95 * eb * p)];
}
const enchJit = (o, T) => (o.ench === 6 && enchHash(Math.floor(T * 14) + o.id * 3) > 0.7 ? (enchHash(Math.floor(T * 14) + o.id) - 0.5) * 0.22 : 0);
const enchA = (o, T) => (o.ench === 6 ? (enchHash(Math.floor(T * 17) + o.id * 7) > 0.93 ? 0.55 : 1) : 1);
function enchGhosts(b, x, y, z, h, col, row, flip, id, T) {
  const d = 0.07 + enchHash(Math.floor(T * 9) + id) * 0.08;
  b.push(x - d, y, z, h, col, row, flip, 2.2, 0.15, 0.2, 0, 0.32); b.sortId(id);
  b.push(x + d, y, z, h, col, row, flip, 0.15, 1.9, 2.2, 0, 0.32); b.sortId(id);
}


const MOB_TYPES = Object.keys(ZONE_MOBS);
// старые 12 кадров для показа (debug.mobDemo): ход 0–3 @7, замах 4, удар 5–6, урон 7, распад 8–11
const OLD_COL = (a, t, id) => a === 'walk' ? (Math.floor(t * 7 + id * 0.7) & 3) : a === 'idle' ? 0 : a === 'hurt' ? 7 : a === 'die' ? 8 + Math.min(3, Math.floor(((t % 0.5) / 0.5) * 4)) : ((t % 0.6) < 0.3 ? 4 : 5 + (Math.floor(t * 12) & 1));
const NODE_PROP = { tree: 'pome_tree', flower: 'violets', crystal: 'star_crystal', ore: 'ore_node' };
const PX = 20;
// Масштаб мобов открытого мира: общий ×0.75 (было крупно), вожаки/боссы/элита — относительно крупнее обычных
export const MOB_VIS = 0.75;
export const mobScale = (o, boss = !!ZONE_MOBS[o.type]?.boss) => MOB_VIS * (boss ? 1.35 : o.chief ? 1.6 : o.elite ? 1.25 : 1);

// жители Альказака (city_25…): свой лист src/assets/mc/city/residents/<sprite>.png — 1152×60 (24 кадра 48×60:
// 4 направления вниз/влево/вправо/вверх × 6 кадров, как строка NPC в heroes_atlas). Нет листа — рисуется строкой «вида» (look).
const RES_SHEETS = import.meta.glob('../../../../assets/mc/city/residents/*.png', { eager: true, query: '?url', import: 'default' });
const RES_URL = {}; for (const [k, v] of Object.entries(RES_SHEETS)) RES_URL[k.split('/').pop().replace(/\.png$/, '')] = v;
export function residentSheetKeys() { return Object.keys(RES_URL).filter((k) => !k.endsWith('_glow')); } // <key>_glow.png — слой свечения листа (глаза и т.п.)

export class ZoneView {
  constructor(THREE, parent) {
    this.THREE = THREE;
    this.root = new THREE.Group();
    this.root.name = 'zone';
    parent.add(this.root);
    this.world = null;
    this.mobs = new Map(); // id → {type,x,y,tx,ty,hp,flag,flash,flip,seen}
    this.nodes = new Map(); // id → {def, ready, mesh}
    this.bags = new Map(); // мешки добычи (свои): id → {id, x, y, n}
    this.chests = new Map(); // сундуки схватки: id → {id, x, y, pub, left, mine, n}
    this.dying = [];
    this.teles = []; // {kind,x,y,r,dx,dy,len,t,life}
    this.bolts = [];
    this.me = { hp: 0, maxHp: 0, alive: true };
    this.lastState = 0;
    this.time = 0;
    const at = pixAtlases();
    if (at.mobs) {
      this.batch = new SpriteBatch(THREE, at.mobs, { cellW: MOB_CELL.w, cellH: MOB_CELL.h, cols: MOB_CELL.cols, rows: MOB_CELL.rows, max: 256 });
      this.root.add(this.batch.mesh);
    }
    // NPC мира — утверждённые листы 48×60 (строки 4–7 heroes_atlas, 4 направления × 6 кадров), дыхание на месте
    if (HERO_HD && at.heroes) {
      this.npcBatch = new SpriteBatch(THREE, at.heroes, { cellW: HERO_CELL.w, cellH: HERO_CELL.h, cols: HERO_CELL.cols, rows: HERO_CELL.rows, max: 40 });
      this.root.add(this.npcBatch.mesh);
    }
    // телеграфы, метки под целями, кольца взрывов — спрайты FX atlas v2 (tele_*, mark_*, boom) через this.pfx
    // выстрелы базовой атаки и вспышки попаданий — PNG-спрайты (вид снаряда зависит от типа оружия)
    this.pfx = new ProjFx(THREE, this.root, { max: 600, glowMax: 600 });
    this.pax = new ProjAtlasFx(THREE, this.root, toX, toZ); // настоящие снаряды сервера (FX atlas v2)
    this.bmv = new BmView(THREE, this.root); // Чёрный маг: маг, купола, стрелы, взрывы, розы, проклятая земля (hub/bmView.js)
    this.hits = [];
    this.seed = ZONE_GEN.seed;
    this.d = new THREE.Object3D();
    this.col = new THREE.Color();
    // узлы ресурсов — пропсы v2 (engine/propAtlas.js) (тот же стиль, что земля и деревья)
    this.setGlow(null);
    this.nodeBatch = null; this.chestSpr = null; this.chestSt = {}; // сундуки: {chan: id, open: id} — локальное состояние окна/канала
    this.beast = null;
    this.b32 = new Beast32View(THREE, this.root, { max: 320 }); // мобы bestiary32 (Художник): листы тиров грузятся по мере появления мобов рядом
    loadBeastBatch(THREE, 320).then((bb) => { this.beast = bb; this.root.add(bb.mesh); }).catch((e) => console.warn('[beast]', e.message));
    loadPropTextures(THREE).then((t) => { this.nodeBatch = new PropSprites(THREE, t, { max: 160, parent: this.root, outline: true }); }).catch((e) => console.warn('[nodes]', e.message));
  }

  // свечение узлов сбора из админки (snap.gather): цвет, яркость, пульс, размер
  setGlow(c) {
    const hex = /^#[0-9a-f]{6}$/i.test(c?.glowColor || '') ? c.glowColor : '#a855f7', v = parseInt(hex.slice(1), 16);
    this.glowCfg = { on: c?.glowOn !== false && Number(c?.glowPower ?? 1) > 0, rgb: [((v >> 16) & 255) / 255, ((v >> 8) & 255) / 255, (v & 255) / 255],
      power: Math.max(0, Math.min(3, Number(c?.glowPower ?? 1))), pulse: Math.max(0, Math.min(5, Number(c?.glowPulse ?? 1))), size: Math.max(1, Math.min(1.6, Number(c?.glowSize) || 1.18)) };
  }

  // дальность/время сбора из админки «⛏ Сбор» (snap.gather); без данных — прежние константы
  setGatherCfg(c) {
    const n = (v, d, lo, hi) => { const x = Number(v); return Number.isFinite(x) ? Math.max(lo, Math.min(hi, x)) : d; };
    this.gCfg = { range: n(c?.range, GATHER_RANGE, 20, 400), slack: n(c?.slack, 20, 0, 200), timeMs: n(c?.timeMs, GATHER_TIME_MS, 100, 15000) };
  }
  gatherRange() { return (this.gCfg || (this.setGatherCfg(), this.gCfg)).range; }
  gatherSlack() { return (this.gCfg || (this.setGatherCfg(), this.gCfg)).slack; }

  setWorld(world) {
    if (world === this.world) return;
    this.world = world;
    this.mobs.clear(); this.dying.length = 0; this.teles.length = 0; this.bmv?.apply(null); this.bmv?.roses.clear();
    this.nodes.clear(); this.bags.clear(); this.chests.clear();
    if (world === 'arinar') this.buildNodes(this.seed);
  }

  // Узлы ресурсов — из того же сида, что и на сервере (server/meta/zoneGen.ts)
  buildNodes(seed) {
    this.nodes.clear(); this.bags.clear(); this.chests.clear();
    this.seed = seed;
    genNodes(seed).forEach((def, i) => {
      this.nodes.set(def.id, { def, ready: true, id: def.id, flip: (i & 1) === 1 });
    });
  }

  // zone_state от сервера
  applyState(s, myId) {
    if (s.w !== this.world) return;
    this.lastState = this.time;
    if (s.sd !== undefined && s.sd !== this.seed && this.world === 'arinar') this.buildNodes(s.sd);
    const m = s.m || [];
    const seen = new Set();
    for (let i = 0; i + 5 < m.length; i += 6) {
      const id = m[i];
      seen.add(id);
      let o = this.mobs.get(id);
      const type = MOB_TYPES[m[i + 1]] || 'blade_fly';
      // варианты биомов: спрайт базового Отголоска (sk) + перекраска (tint) — server/meta/biomes.ts
      if (!o) { o = initState({ id, type, sk: sprOf(type), tint: tintOf(type), x: m[i + 2], y: m[i + 3], flash: 0, flip: false, mvT: 9, hitN: false, strN: false, ph: (id * 0.618) % 1 }); this.mobs.set(id, o); }
      if (Math.abs(m[i + 2] - o.x) > 1) o.flip = m[i + 2] < o.x;
      const f = m[i + 5];
      o.tx = m[i + 2]; o.ty = m[i + 3]; o.hp = m[i + 4]; o.flag = f & 3; o.elite = !!(f & 4); o.cursed = !!(f & 1024); o.reset = !!(f & 2048); o.chief = !!(f & 4096); o.frozen = !!(f & (1 << 22)); o.ench = (f >> 23) & 7; o.flagRaw = f;
      o.st = f & 8 ? 'burn' : f & 16 ? 'poison' : f & 32 ? 'bleed' : f & 64 ? 'freeze' : null;
      o.sts = f & 56 ? { burn: (f >> 13) & 7, poison: (f >> 16) & 7, bleed: (f >> 19) & 7 } : null; // стаки статусов (одновременно несколько видов)
    }
    for (const [id, o] of this.mobs) if (!seen.has(id) && !o.demo) { this.mobs.delete(id); } // o.demo — показ (debug.mobDemo), не с сервера
    if (Array.isArray(s.bags)) { const keep = new Set(); for (const [id, x, y, n] of s.bags) { keep.add(id); this.bags.set(id, { id, x, y, n }); } for (const id of [...this.bags.keys()]) if (!keep.has(id)) this.bags.delete(id); }
    if (Array.isArray(s.chests)) { const keep = new Set(); for (const [id, x, y, pub, left, mine, n, cz] of s.chests) { keep.add(id); this.chests.set(id, { id, x, y, pub: !!pub, left, mine, n, cz: cz | 0, at: Date.now() }); } for (const id of [...this.chests.keys()]) if (!keep.has(id)) this.chests.delete(id); }
    for (const [id, ready, left] of s.n || []) { const n = this.nodes.get(id); if (n) { n.ready = !!ready; n.readyIn = ready ? 0 : left || 0; n.readyAt = ready ? 0 : Date.now() + (left || 0) * 1000; } } // left — через сколько с узел снова готов (личный таймер)
    if (s.me) this.me = s.me;
    this.tg = s.tg || null; // выбранная цель: точные ХП с сервера
    const out = [];
    if (this.world === 'arinar') this.bmv.apply(s.bm);
    for (const e of s.ev || []) {
      if (e.k === 'bmblk') { this.pax.live.delete(e.id); for (const L of Object.values(this.pax.pred || {})) for (let i = L.length - 1; i >= 0; i--) if (L[i].id === e.id) L.splice(i, 1); } // выстрел из купола почернел: дальше его рисует клиент мага
      if ((e.k[0] === 'b' && e.k[1] === 'm') || ((e.k === 'proj' || e.k === 'pend') && String(e.t || '').startsWith('bm_'))) { this.bmv.event(e); continue; } // Чёрный маг
      if (e.k === 'hit') { const o = this.mobs.get(e.id); if (o) { o.flash = 0.15; o.hitN = true; out.push({ k: 'float', x: o.x, y: o.y, text: e.evade ? 'Уклонение' : String(Math.round(e.d)), color: e.evade ? '#94a3b8' : '#fff' }); } }
      else if (e.k === 'dome_repel') out.push({ k: 'dome_repel', x: e.x, y: e.y }); // купол города вытолкнул моба — вспышка на ободе
      else if (e.k === 'evade') out.push({ k: 'float', x: e.x, y: e.y, text: '↩ сброс', color: '#94a3b8' });
      else if (e.k === 'mskill') out.push({ k: 'float', x: e.x, y: e.y - 20, text: `✦ ${e.name}`, color: '#f0abfc' });
      else if (e.k === 'shot') { if (e.sid !== myId) this.shoot(e.x, e.y, null, e.w, e.tx, e.ty); }
      else if (e.k === 'announce') out.push({ k: 'toast', text: e.text, color: e.color });
      else if (e.k === 'crit') out.push({ k: 'float', x: e.x, y: e.y - 10, text: 'КРИТ', color: '#facc15' });
      else if (e.k === 'die') { this.dying.push({ type: e.type, sk: sprOf(e.type), tint: tintOf(e.type), x: e.x, y: e.y, t: 0, flip: !!this.mobs.get(e.id)?.flip, boss: !!ZONE_MOBS[e.type]?.boss }); this.mobs.delete(e.id); }
      else if (e.k === 'slam') {
        if (e.nova && !e.fx) this.teles.push({ kind: 'nova', fx: 'nova_burst', x: e.x, y: e.y, r: e.r, t: 0, life: 0.5, col: [1, 0.45, 0.55] }); // навык монстра без формы — nova_burst (тинт)
        else if (e.fx === 'warden_slam') { /* удар уже рисует падение (tele_circle) */ }
        else if (!e.fx) this.teles.push({ kind: 'boom', x: e.x, y: e.y, r: e.r, t: 0, life: 0.35 });
        else if (e.fx === 'ice_fan') this.pax.burst('ice_fan', e.x, e.y, e.r, 12);
        else if (e.fx === 'war_axe') this.pax.burst('war_axe', e.x, e.y, e.r, 6);
        else if (e.fx === 'plague_puddle') this.pax.puddle(e.x, e.y, e.r, 1.6);
        else if (e.fx !== 'meteor' && e.fx !== 'spear_rain') this.pax.impact(e.fx, e.x, e.y, { k: Math.max(1, e.r / 50) }); // метеор/копья — своё падение
      }
      else if (e.k === 'tele') { this.teles.push({ kind: 'line', x: e.x, y: e.y, dx: e.dx, dy: e.dy, len: e.len, t: 0, life: e.t || 0.55 }); this.teles.push({ kind: 'dash', fx: 'dash_trail', x: e.x, y: e.y, dx: e.dx, dy: e.dy, len: e.len, t: -(e.t || 0.55), life: 0.3, col: [1, 0.5, 0.45] }); } // рывок моба: телеграф, затем шлейф dash_trail
      else if (e.k === 'tele_line') this.teles.push({ kind: 'line', x: e.x, y: e.y, dx: e.dx, dy: e.dy, len: e.len, w: e.w, t: 0, life: e.t || 0.55 });
      else if (e.k === 'tele_ring') this.teles.push({ kind: 'circle', x: e.x, y: e.y, r: e.r, t: 0, life: e.t || 1.2 });
      else if (e.k === 'tele_cone') { this.teles.push({ kind: 'tcone', x: e.x, y: e.y, dx: e.dx, dy: e.dy, len: e.len, arc: e.arc, t: 0, life: e.t || 0.6 }); if (CONE_FX[e.fx]) this.teles.push({ kind: 'cone', fx: CONE_FX[e.fx], x: e.x, y: e.y, dx: e.dx, dy: e.dy, len: e.len, arc: e.arc, t: -(e.t || 0.6), life: 0.45 }); }
      else if (e.k === 'acone') { const id = String(e.id || '').replace(/^rs:/, ''); this.teles.push({ kind: 'cone', fx: CONE_FX[id] || 'gear_spin_cone', x: e.x, y: e.y, dx: e.dx, dy: e.dy, len: e.len, arc: e.arc, t: 0, life: 0.45 }); }
      else if (e.k === 'tele_circle') { this.teles.push({ kind: 'circle', x: e.x, y: e.y, r: e.r, t: 0, life: e.t || 1.2 }); if (e.fx === 'warden_slam') this.teles.push({ kind: 'slam', x: e.x, y: e.y, r: e.r, t: -Math.max(0, (e.t || 1.2) - 0.35), life: 0.35 + 0.6 }); if (e.fx === 'meteor' || e.fx === 'spear_rain') this.pax.fall(e.fx, e.x, e.y, e.t || 1.2, e.fdx || 1, e.fx === 'meteor' ? Math.max(1, e.r / 70) : 1); }
      // снаряды сервера: вылет / попадание; лужа фляги; удары навыков мобов спрайтами атласа
      else if (e.k === 'proj') this.pax.spawn(e);
      else if (e.k === 'pend') this.pax.end(e);
      else if (e.k === 'puddle') this.pax.puddle(e.x, e.y, e.r, e.t);
      else if (e.k === 'ability') { const cz = !!e.cz, col = cz ? curseRGB() : null; const a = atlasId(e.id); if (a && a !== 'meteor') this.pax.impact(a, e.x, e.y, { k: Math.max(1, (e.r || 40) / 60), cz }); else if (a === 'meteor') this.pax.impact('meteor', e.x, e.y, { k: Math.max(1, (e.r || 70) / 70), cz }); const id = String(e.id || '').replace(/^rs:/, ''); if (NOVA_FX[id]) this.teles.push({ kind: 'nova', fx: NOVA_FX[id], x: e.x, y: e.y, r: e.r || 120, t: 0, life: 0.6, col }); else this.teles.push({ kind: 'boom', x: e.x, y: e.y, r: e.r, t: 0, life: a ? 0.25 : 0.4, color: cz ? curseHex() : 0xfde68a }); }
      // формы навыков (server/meta/abilityShapes.ts): линия/рывок, снаряд, отложенный удар (метеор), точки дождя
      else if (e.k === 'aline') { const id = String(e.id || '').replace(/^rs:/, ''); if (DASH_FX[id]) this.teles.push({ kind: 'dash', fx: DASH_FX[id], x: e.x, y: e.y, dx: e.dx, dy: e.dy, len: e.len, t: 0, life: 0.35, col: e.cz ? curseRGB() : null }); else this.teles.push({ kind: 'line', x: e.x, y: e.y, dx: e.dx, dy: e.dy, len: e.len, t: 0, life: 0.35, cz: !!e.cz }); }
      else if (e.k === 'aproj') this.shoot(e.x, e.y, null, e.w || 'staff', e.tx, e.ty, e.cz);
      else if (e.k === 'amark') { this.teles.push({ kind: 'circle', x: e.x, y: e.y, r: e.r, t: 0, life: e.t || 1.2 }); if (String(e.id || '').replace(/^rs:/, '') === 'warden_slam') this.teles.push({ kind: 'slam', x: e.x, y: e.y, r: e.r, t: -Math.max(0, (e.t || 1.2) - 0.35), life: 0.95 }); if (atlasId(e.id) === 'meteor') this.pax.fall('meteor', e.x, e.y, e.t || 1.2, e.fdx || 1, Math.max(1, e.r / 70)); }
      else if (e.k === 'phit' && e.sid === myId) { out.push({ k: 'hurt', d: e.d }); this.mobStruck(e.src); }
      else if (e.k === 'pdie' && e.sid === myId) out.push({ k: 'died' });
    }
    return out;
  }

  // Ближайший живой моб в радиусе атаки сервера
  nearestMob(px, py, range = ZONE_ATTACK_RANGE) {
    let best = null, bd = range;
    for (const o of this.mobs.values()) {
      const d = Math.hypot(o.x - px, o.y - py) - (ZONE_MOBS[o.type]?.radius || 12);
      if (d < bd) { bd = d; best = o; }
    }
    return best;
  }
  nearestChest(px, py, range = 110) { let best = null, bd = range; for (const c of this.chests.values()) { const d = Math.hypot(c.x - px, c.y - py); if (d < bd) { bd = d; best = c; } } return best; }
  nearestBag(px, py, range = 100) {
    let best = null, bd = range;
    for (const b of this.bags.values()) { const d = Math.hypot(b.x - px, b.y - py); if (d < bd) { bd = d; best = b; } }
    return best;
  }
  // all — и узлы на восстановлении (для подсказки «вырастет через N с»)
  nearestNode(px, py, all = false) {
    let best = null, bd = this.gatherRange();
    for (const n of this.nodes.values()) {
      if (!n.ready && !all) continue;
      const d = Math.hypot(n.def.x - px, n.def.y - py);
      if (d < bd) { bd = d; best = n; }
    }
    return best;
  }
  /** доски из определений сервера (props: nb/ab — world, x, y, r) */
  setBoards(props, on = true) {
    this.boards = on && props ? [props.nb, props.ab] : null;
    if (this.boards && !this.boardB && !this.boardLoading) {
      this.boardLoading = true;
      loadAtlasTexture(this.THREE, boardsAtlasSrc).then((tex) => { this.boardB = new SpriteBatch(this.THREE, tex, { cellW: 64, cellH: 64, cols: 2, rows: 1, max: 2 }); this.root.add(this.boardB.mesh); }).catch(() => { this.boardLoading = false; });
    }
  }
  nearestNpc(world, px, py) {
    let best = null, bd = NPC_RANGE - 5;
    for (const [id, n] of Object.entries(NPCS)) {
      if (n.world !== world) continue;
      const p = npcPos(id); // NPC бродят — живая позиция
      const d = Math.hypot(p.x - px, p.y - py);
      if (d < bd) { bd = d; best = { id, ...n, x: p.x, y: p.y }; }
    }
    return best;
  }
  resName(res) { return RESOURCES[res]?.name || res; }
  gatherTime() { return (this.gCfg || (this.setGatherCfg(), this.gCfg)).timeMs; }

  // wtype — тип оружия (WEAPON_TYPES): копьё, кинжалы, посох, лук, секира, меч, лапки-лезвия…
  // mob — цель (летит за ней), иначе в точку (tx,ty); у дуговых ударов — короткий «серп» в сторону удара
  shoot(fromX, fromY, mob, wtype, tx, ty) {
    if (this.bolts.length >= 128) return; // залпы по 5 снарядов
    const W = WEAPON_TYPES[wtype] || WEAPON_TYPES.book;
    this.bolts.push({ x: fromX, y: fromY, mob, lx: tx, ly: ty, t: 0, shot: W.shot, seed: Math.random() * 8, arc: W.atk.kind === 'arc' });
  }
  // Клиентский прогноз удара по направлению (та же форма, что на сервере: zone.ts targetsInDir) — для визуала
  aimTargets(px, py, dx, dy, wtype) {
    const A = (WEAPON_TYPES[wtype] || WEAPON_TYPES.book).atk;
    const out = [];
    for (const m of this.mobs.values()) {
      const r = ZONE_MOBS[m.type]?.radius || 12;
      const ex = m.x - px, ey = m.y - py, along = ex * dx + ey * dy;
      if (along < -r || along > A.range + r) continue;
      if (A.kind === 'arc') {
        const dist = Math.hypot(ex, ey);
        if (dist > A.range + r) continue;
        if (dist > r + 10 && Math.acos(Math.max(-1, Math.min(1, along / (dist || 1)))) > (A.arc || 1)) continue;
        out.push([m, dist]);
      } else {
        if (Math.abs(ex * dy - ey * dx) > (A.width || 20) + r) continue;
        out.push([m, along]);
      }
    }
    out.sort((a, b) => a[1] - b[1]);
    return { atk: A, list: out.slice(0, A.kind === 'proj' ? 1 : (A.max || 1)).map((x) => x[0]) };
  }
  // Автонаведение (телефон): ближайший моб в секторе взгляда, иначе ближайший в радиусе атаки
  assistDir(px, py, fx, fy, wtype) {
    const A = (WEAPON_TYPES[wtype] || WEAPON_TYPES.book).atk;
    let best = null, bs = -Infinity;
    const fl = Math.hypot(fx, fy) || 1;
    for (const m of this.mobs.values()) {
      const dx = m.x - px, dy = m.y - py, d = Math.hypot(dx, dy);
      if (d > A.range + 30) continue;
      const dot = (dx * fx + dy * fy) / (fl * (d || 1));
      const score = dot * 1.5 - d / A.range;
      if (score > bs) { bs = score; best = m; }
    }
    if (best) { const dx = best.x - px, dy = best.y - py, d = Math.hypot(dx, dy) || 1; return { x: dx / d, y: dy / d, mob: best }; }
    return { x: fx / fl, y: fy / fl, mob: null };
  }
  myWeaponType(classId) { return this.me?.wt || CLASS_WTYPE[classId] || 'book'; }

  // Обычный удар моба на сервере — мгновенный (без флага замаха): по событию phit «от типа» ищем ближайшего такого моба у героя
  // и запускаем кадры удара с 6 (импакт = 7 через ≈0.075 с при 20 fps) — визуал отстаёт от урона на один кадр, а не на весь замах.
  mobStruck(src) {
    const V = this.view; if (!V || !src) return;
    let best = null, bd = 1e9;
    for (const o of this.mobs.values()) { if (o.type !== src) continue; const d = Math.hypot(o.x - V.x, o.y - V.y); if (d < bd) { bd = d; best = o; } }
    if (best && bd < (ZONE_MOBS[src]?.radius || 14) + 60) best.strN = true;
  }

  update(dt, world) {
    this.time += dt;
    npcStep(dt); // NPC бродят: плавно догоняем серверную позицию
    const T = this.time, B = this.batch;
    const k = Math.min(1, dt * 8);
    for (const o of this.mobs.values()) {
      if (o.tx !== undefined) { if (Math.abs(o.tx - o.x) + Math.abs(o.ty - o.y) > 1.5) o.mvT = 0; else o.mvT += dt; o.x += (o.tx - o.x) * k; o.y += (o.ty - o.y) * k; }
      o.flash = Math.max(0, o.flash - dt);
    }
    const BB = this.beast, NV = b32On(false) ? this.b32 : null, V = this.view, fm = GFX.mobFps || 1, hf = GFX.mobHurtFlash || 0;
    if (BB || NV) {
      BB?.begin(); NV?.begin();
      for (const o of this.mobs.values()) {
        const row = BEAST_ROW[o.sk];
        if (row === undefined) continue;
        const fly = beastFlying(o.sk);
        // новые мобы: шаг состояния всегда (кадры не «прыгают», когда лист догрузился), рисуем — если лист страницы уже в видеопамяти
        o.moving = o.mvT < 0.3 && !o.frozen;
        if (o.forceA) { forceState(B32, o, o.forceA, o.faFix >= 0 ? o.faFix : T - o.fa0, fm); o.flash = o.forceA === 'hurt' && o.hurtT < 0.1 ? 0.1 : 0; } // показ: заданная анимация по кругу
        else stepZone(B32, o, dt, o.flag, o.hitN, o.strN, fm);
        o.hitN = false; o.strN = false;
        const pg = NV ? NV.use(o.sk, V ? (o.x - V.x) * (o.x - V.x) + (o.y - V.y) * (o.y - V.y) : 0) : -1;
        if (!BB && pg < 0) continue;
        let col = o.frozen ? 0 : (Math.floor(T * (fly ? 10 : 7) + o.id * 0.7)) & 3; // заморожен — кадр стоит
        if (o.flash > 0.05) col = 7; else if (o.flag === 1) col = 4; else if (o.flag === 2) col = 5 + (Math.floor(T * 12) & 1);
        if (o.forceA && pg < 0) col = OLD_COL(o.forceA, o.faFix >= 0 ? o.faFix : T - o.fa0, o.id); // показ старыми листами — те же состояния
        let r = o.flag === 1 ? 1.4 : 1, g = 1, bl = 1;
        if (o.elite) { const p = 0.85 + Math.sin(T * 5 + o.id) * 0.15; r = 1.25 * p + 0.2; g = 1.05 * p + 0.1; bl = 0.6; }
        if (o.st === 'burn') { r *= 1.3; g *= 0.85; bl *= 0.6; } else if (o.st === 'bleed') { r *= 1.3; g *= 0.7; bl *= 0.7; } else if (o.st === 'freeze') { r *= 0.75; bl = 1.6; }
        if (o.tint) { r *= o.tint[0]; g *= o.tint[1]; bl *= o.tint[2]; }
        if (o.cursed) { const p = 0.8 + Math.sin(T * 4 + o.id) * 0.2; r *= 1.1 * p + 0.2; g *= 0.55; bl *= 1.5 * p + 0.2; } // проклятый: фиолетовое свечение
        if (o.ench) [r, g, bl] = enchTint(o, T, r, g, bl); // зачарованный: оттенок яруса; Чёрный — тёмный, мерцает
        if (o.reset) { r *= 0.6; g *= 0.6; bl *= 0.7; }
        if (o.frozen) { r = r * 0.55 + 0.25; g = g * 0.8 + 0.35; bl = 2.1; } // лёд: ярко-голубой, как в забеге
        if (pg >= 0) {
          const f = mobFrame(B32, o, o.faFix >= 0 ? o.faFix : T, (fly ? 10 : 7) * 3, fm, o.ph), jx = enchJit(o, T), y0 = fly && !o.frozen ? Math.sin(T * 5 + o.id) * 0.15 : 0, hh = B32.H * mobScale(o), ea = enchA(o, T);
          NV.push(pg, o.sk, f, toX(o.x) + jx, y0, toZ(o.y), hh, o.flip, r, g, bl, o.flash > 0.05 ? hf : 0, ea, o.id);
          if (o.ench === 6) { const idx = NV.mobStart(o.sk) + f; enchGhosts(NV.B[pg].base, toX(o.x) + jx, y0, toZ(o.y), hh, idx % B32.cols, Math.floor(idx / B32.cols), o.flip, o.id, T); }
        } else
        { const jx = enchJit(o, T), y0 = fly && !o.frozen ? Math.sin(T * 5 + o.id) * 0.15 : 0, hh = BEAST_H * mobScale(o);
          BB.push(toX(o.x) + jx, y0, toZ(o.y), hh, col, row, o.flip, r, g, bl, o.flash > 0.05 ? 0.85 : 0, enchA(o, T)); BB.sortId(o.id);
          if (o.ench === 6) enchGhosts(BB, toX(o.x) + jx, y0, toZ(o.y), hh, col, row, o.flip, o.id, T); } // Чёрный: красно-голубой двойник
        atmo.shadow(toX(o.x), toZ(o.y), Math.max(0.35, (ZONE_MOBS[o.type]?.radius || 12) / PX * 1.1) * mobScale(o) / MOB_VIS * 0.85, fly ? 0.55 : 1);
      }
      for (const dd of this.dying) {
        const row = BEAST_ROW[dd.sk];
        if (row === undefined) continue;
        const kk = Math.min(0.99, dd.t / (dd.boss ? 0.9 : 0.5));
        const pg = NV ? NV.use(dd.sk, 0) : -1;
        if (pg >= 0) { // распад нарисован в кадрах die (по прогрессу смерти); свечение искр гаснет к концу
          if (dd.dieK === undefined) initState(dd); dd.dieK = kk;
          NV.push(pg, dd.sk, mobFrame(B32, dd, T, 21, fm, 0), toX(dd.x), 0, toZ(dd.y), B32.H * MOB_VIS * (dd.boss ? 1.35 : 1), dd.flip, dd.tint?.[0] || 1, dd.tint?.[1] || 1, dd.tint?.[2] || 1, 0, 1, dd.x * 7 + dd.y, 1 - kk * 0.4);
          continue;
        }
        if (!BB) continue;
        BB.push(toX(dd.x), 0, toZ(dd.y), BEAST_H * MOB_VIS * (dd.boss ? 1.35 : 1), 8 + Math.min(3, Math.floor(kk * 4)), row, dd.flip, 1.2 * (dd.tint?.[0] || 1), 1.1 * (dd.tint?.[1] || 1), 1.3 * (dd.tint?.[2] || 1), kk < 0.15 ? 0.6 : 0, 1 - kk * 0.5);
      }
      BB?.end(); NV?.end();
    }
    if (B) {
      B.begin();
      for (const o of this.mobs.values()) {
        const row = MOB_ROWS[o.sk];
        if (row === undefined || (BB && BEAST_ROW[o.sk] !== undefined)) continue;
        const boss = ZONE_MOBS[o.type]?.boss;
        const h = (MOB_HEIGHT[o.sk] || 2) * mobScale(o, boss);
        const fly = MOB_FLYING[o.sk] || 0;
        let col = (Math.floor(T * (fly ? 12 : 7) + o.id * 0.7)) & 3;
        if (o.flash > 0.05) col = 7; else if (o.flag === 1) col = 4; else if (o.flag === 2) col = 5 + (Math.floor(T * 12) & 1);
        let r = o.flag === 1 ? 1.4 : 1, g = 1, bl = 1;
        if (o.elite) { const p = 0.85 + Math.sin(T * 5 + o.id) * 0.15; r = 1.25 * p + 0.2; g = 1.05 * p + 0.1; bl = 0.6; }
        if (o.st === 'burn') { r *= 1.3; g *= 0.85; bl *= 0.6; } else if (o.st === 'bleed') { r *= 1.3; g *= 0.7; bl *= 0.7; } else if (o.st === 'freeze') { r *= 0.75; bl = 1.6; }
        if (o.tint) { r *= o.tint[0]; g *= o.tint[1]; bl *= o.tint[2]; }
        if (o.cursed) { const p = 0.8 + Math.sin(T * 4 + o.id) * 0.2; r *= 1.1 * p + 0.2; g *= 0.55; bl *= 1.5 * p + 0.2; } // проклятый: фиолетовое свечение
        if (o.ench) [r, g, bl] = enchTint(o, T, r, g, bl); // зачарованный: оттенок яруса; Чёрный — тёмный, мерцает
        if (o.reset) { r *= 0.6; g *= 0.6; bl *= 0.7; }
        if (o.frozen) { r = r * 0.55 + 0.25; g = g * 0.8 + 0.35; bl = 2.1; } // лёд: ярко-голубой, как в забеге
        { const jx = enchJit(o, T), y0 = fly ? fly + Math.sin(T * 7 + o.id) * 0.18 : 0;
          B.push(toX(o.x) + jx, y0, toZ(o.y), h, col, row, o.flip, r, g, bl, o.flash > 0.05 ? 0.85 : 0, enchA(o, T)); B.sortId(o.id);
          if (o.ench === 6) enchGhosts(B, toX(o.x) + jx, y0, toZ(o.y), h, col, row, o.flip, o.id, T); }
      }
      for (let i = this.dying.length - 1; i >= 0; i--) {
        const dd = this.dying[i];
        dd.t += dt;
        const life = dd.boss ? 0.9 : 0.5;
        if (dd.t >= life) { this.dying.splice(i, 1); continue; }
        const kk = dd.t / life;
        if (BB && BEAST_ROW[dd.sk] !== undefined) continue;
        B.push(toX(dd.x), 0, toZ(dd.y), (MOB_HEIGHT[dd.sk] || 2) * MOB_VIS * (dd.boss ? 1.35 : 1), 8 + Math.min(3, Math.floor(kk * 4)), MOB_ROWS[dd.sk] ?? 6, dd.flip, 1.2, 1.1, 1.3, kk < 0.15 ? 0.6 : 0, 1 - kk * 0.6);
      }
      // NPC мира
      for (const [id, n] of Object.entries(NPCS)) {
        if (n.world !== world || MOB_ROWS[id] === undefined) continue;
        if (this.npcBatch && NPC_ROWS[id] !== undefined) continue; // рисует npcBatch (HD)
        const p = npcPos(id);
        B.push(toX(p.x), 0, toZ(p.y), MOB_HEIGHT[id] || 2.5, (Math.floor(T * (p.moving ? 8 : 2.5) + n.x) & 3), MOB_ROWS[id], p.dir === 1, 1, 1, 1, 0, 1);
        atmo.shadow(toX(p.x), toZ(p.y), 0.6);
      }
      B.end();
    }
    // Доски: объявлений (Аринар, у места появления) и достижений (Поляна, у Алтаря). Без свечения.
    if (this.boardB && this.boards) {
      const BB2 = this.boardB; BB2.begin();
      this.boards.forEach((p, i) => { if (p && p.world === world) { BB2.push(toX(p.x), 0, toZ(p.y), i ? 2.9 : 2.6, i, 0, false, 1, 1, 1, 0, 1); atmo.shadow(toX(p.x), toZ(p.y), 1.1); } });
      BB2.end();
    }
    const NPB = this.npcBatch;
    if (NPB) {
      NPB.begin(); const RB = this.resB || (this.resB = new Map()); for (const r of RB.values()) { r.b?.begin(); r.g?.begin(); }
      for (const [id, n] of Object.entries(NPCS)) {
        if (n.world !== world || NPC_ROWS[id] === undefined) continue;
        const sk = n.sprite && RES_URL[n.sprite] ? n.sprite : '';
        if (sk) { // свой лист жителя: грузится один раз; пока грузится — строка «вида»
          let r = RB.get(sk); if (!r) { r = { b: null, g: null, gu: { value: 1 } }; RB.set(sk, r); const cell = { cellW: 48, cellH: 60, cols: 24, rows: 1, max: 4 };
            loadAtlasTexture(this.THREE, RES_URL[sk]).then((t) => { r.b = new SpriteBatch(this.THREE, t, cell); this.root.add(r.b.mesh); }).catch(() => { r.bad = 1; });
            if (RES_URL[sk + '_glow']) loadAtlasTexture(this.THREE, RES_URL[sk + '_glow']).then((t) => { r.g = new SpriteBatch(this.THREE, t, { ...cell, additive: true, glowU: r.gu }); r.g.begin(); r.g.end(); this.root.add(r.g.mesh); }).catch(() => {}); }
          if (r.b) { const p = npcPos(id), col = p.dir * HERO_FRAMES + (p.moving ? [0, 1, 2, 1][Math.floor(T * 7 + n.x) & 3] : ((Math.floor(T * 1.25 + n.x) & 1) ? 3 : 1));
            r.b.push(toX(p.x), 0, toZ(p.y), HERO_H_M * 1.08, col, 0, false, 1, 1, 1, 0, 1); atmo.shadow(toX(p.x), toZ(p.y), 0.6);
            if (r.g && n.glow > 0) { r.gu.value = n.glow; r.g.push(toX(p.x), 0, toZ(p.y), HERO_H_M * 1.08, col, 0, false, 1, 1, 1, 0, 1); } // свечение листа (админка «🏰 Город» → fx.resGlow)
            continue; }
        }
        // кадры героя: направление (0 вниз, 1 влево, 2 вправо, 3 вверх) × 6 (шаг A, стойка, шаг B, вдох, …): ходьба A-стойка-B-стойка, стоя — дыхание
        const p = npcPos(id), col = p.dir * HERO_FRAMES + (p.moving ? [0, 1, 2, 1][Math.floor(T * 7 + n.x) & 3] : ((Math.floor(T * 1.25 + n.x) & 1) ? 3 : 1));
        NPB.push(toX(p.x), 0, toZ(p.y), HERO_H_M * 1.08, col, NPC_ROWS[id], false, 1, 1, 1, 0, 1);
        atmo.shadow(toX(p.x), toZ(p.y), 0.6);
      }
      NPB.end(); for (const r of RB.values()) { r.b?.end(); r.g?.end(); }
    }
    // ресурсы: готовые — светятся и покачиваются
    const NB = this.nodeBatch;
    if (NB) {
      NB.begin();
      const G = this.glowCfg; // свечение узлов сбора
      const V = this.view; // Аринар 48000: рисуем только узлы рядом с камерой (их сотни)
      for (const n of this.nodes.values()) {
        if (V && (Math.abs(n.def.x - V.x) > 1400 || Math.abs(n.def.y - V.y) > 1100)) continue;
        const sc = n.ready ? 1 + Math.sin(T * 3 + n.id) * 0.03 : 0.7;
        const k = n.ready ? 1.15 + Math.sin(T * 2.4 + n.id) * 0.12 : 0.45;
        NB.push(NODE_PROP[n.def.type] || 'ore_node', n.def.x, n.def.y, toX(n.def.x), toZ(n.def.y), sc, n.flip, n.ready ? 1 : 0.7, 0, [k, k, k]);
        // готов к сбору — пиксельный фиолетовый контур + пульсирующая аура (админка «⛏ Сбор»); на восстановлении — без свечения
        if (n.ready && G.on) { const pu = G.pulse > 0 ? 0.5 + 0.5 * Math.sin(T * 2.6 * G.pulse + n.id) : 0.7;
          NB.pushGlow(NODE_PROP[n.def.type] || 'ore_node', n.def.x, n.def.y, toX(n.def.x), toZ(n.def.y), sc, n.flip, G.rgb, G.size + 0.04 * pu * Math.min(1, G.pulse), Math.min(1, (0.55 + 0.45 * pu) * Math.min(1.5, G.power)), (0.12 + 0.22 * pu) * G.power); }
        atmo.shadow(toX(n.def.x), toZ(n.def.y), n.def.type === 'tree' ? 1.3 : 0.6, n.ready ? 1 : 0.6);
      }
      // мешки добычи: ящик-мешок, покачивается
      for (const b of this.bags.values()) {
        NB.push('crate', 0, 0, toX(b.x), toZ(b.y), 0.55 * (1 + Math.sin(T * 4 + b.id) * 0.05), false, 1, 0, [1.35, 1.15, 0.6], false);
        atmo.shadow(toX(b.x), toZ(b.y), 0.5, 1);
      }
      // сундуки схватки: большой ящик; личный (есть мои) — золотой, общий — тёмный
      NB.end();
    }
    // сундуки схватки: пиксель-арт сундук поверх пропсов (ореол: личный — золото, общий — серый, канал — пульс)
    if (!this.chestSpr && this.chests.size) this.chestSpr = new ChestSprites(this.THREE, this.root);
    if (this.chestSpr) { const CS = this.chestSpr; CS.begin(); for (const c of this.chests.values()) { CS.push(toX(c.x), toZ(c.y), c, this.chestSt.chan === c.id ? 'chan' : this.chestSt.open === c.id ? 'open' : 'closed', T); } CS.end(); }
    // телеграфы, эффекты навыков и метки — спрайты FX atlas v2 (телеграфы #dcd3e6, цвет задаёт код)
    const P = this.pfx;
    P.begin(dt);
    for (let i = this.teles.length - 1; i >= 0; i--) {
      const t = this.teles[i];
      t.t += dt;
      if (t.t >= t.life) { this.teles.splice(i, 1); continue; }
      if (t.t < 0) continue; // эффект ждёт своего момента (шлейф после рывка, удар после падения)
      const kk = t.t / t.life, X = toX(t.x), Z = toZ(t.y);
      if (t.kind === 'line') P.teleLine(X, Z, t.dx, t.dy, (t.len / PX) * (0.3 + 0.7 * kk), Math.max(1.1, (t.w || 0) / PX), t.cz ? curseRGB() : [1, 0.3, 0.3], 0.85);
      else if (t.kind === 'circle') P.teleCircle(X, Z, t.r / PX, kk, [1, 0.35, 0.65], 0.9);
      else if (t.kind === 'tcone') P.teleCone(X, Z, t.dx, t.dy, t.len / PX, t.arc, [1, 0.35, 0.3], 0.8);
      else if (t.kind === 'cone') P.cone(t.fx, X, Z, t.dx, t.dy, t.len / PX, t.arc, kk);
      else if (t.kind === 'nova') P.nova(t.fx, X, Z, t.r / PX, kk, t.col || null);
      else if (t.kind === 'dash') P.dash(t.fx, X, Z, t.dx, t.dy, t.len / PX, kk, t.col || null);
      else if (t.kind === 'slam') P.slam(X, Z, t.r / PX, t.t, 0.35);
      else if (t.kind === 'boom') P.boom(X, Z, (t.r / PX) * 0.8, kk, t.color || 0xf87171, t.color === 0xfde68a ? 'hit_holy' : 'hit_fire');
    }
    for (const b of this.bags.values()) P.mark('loot', toX(b.x), toZ(b.y), 0.9 + Math.sin(T * 4 + b.id) * 0.08, 1, b.id); // мешок
    for (const o of this.mobs.values()) {
      const X = toX(o.x), Z = toZ(o.y);
      if (o.id === this.selected) P.mark('target', X, Z, Math.max(0.85, (ZONE_MOBS[o.type]?.radius || 12) / PX * 2.2 * mobScale(o)), 1, o.id); // выбранная цель
      if (this.trackTypes?.size && [...this.trackTypes].some((g) => goalMatch(g, o.type))) P.mark('tracked', X, Z, 1.15 * mobScale(o), 1, o.id); // цель квеста (отслеживание)
      if (o.cursed) P.mark('cursed', X, Z, 1.6 * mobScale(o), 1, o.id);
      if (o.ench) { const c = o.ench === 6 ? (Math.floor(T * 9 + o.id) & 1 ? [1, 0.15, 0.2] : [0.1, 0.9, 1]) : enchRGB(o.ench); P.mark('target', X, Z, 1.35 * mobScale(o) * (1 + Math.sin(T * 3 + o.id) * 0.05), 0.9, o.id, c); } // кольцо цвета яруса (Чёрный — красно-голубое)
      if (ZONE_MOBS[o.type]?.boss) P.mark('boss', X, Z, 2.4 * MOB_VIS * 1.35, 1, o.id);
      else if (o.chief) P.mark('leader', X, Z, 1.9 * MOB_VIS * 1.6 / 1.45, 1, o.id); // вожак лагеря
      else if (o.elite) P.mark('elite', X, Z, 1.3 * MOB_VIS * 1.1, 1, o.id);
    }
    // снаряды базовой атаки, вспышки попаданий, значки статусов
    for (let i = this.bolts.length - 1; i >= 0; i--) {
      const b = this.bolts[i];
      const m = this.mobs.get(b.mob);
      const tx = m ? m.x : b.lx, ty = m ? m.y : b.ly;
      if (tx === undefined) { this.bolts.splice(i, 1); continue; }
      b.lx = tx; b.ly = ty;
      const dist = Math.hypot(tx - b.x, ty - b.y) / PX;
      b.t += dt * (b.arc ? 6 : Math.max(2.6, 22 / Math.max(1, dist))); // ~22 м/с, но не дольше ~0.4 с
      if (b.t >= 1) {
        this.bolts.splice(i, 1);
        if (this.hits.length < 48 && (m || b.arc)) this.hits.push({ x: toX(tx), z: toZ(ty), row: P.hitOf(b.shot), t: 0 });
        continue;
      }
      const x = b.x + (tx - b.x) * b.t, y = b.y + (ty - b.y) * b.t;
      P.shot(b.shot, toX(x), toZ(y), (tx - b.x) / PX * 3, (ty - b.y) / PX * 3, b.t * 0.4, b.seed, 1, 1, 1.2);
    }
    for (let i = this.hits.length - 1; i >= 0; i--) {
      const h = this.hits[i];
      h.t += dt / 0.3;
      if (h.t >= 1) { this.hits.splice(i, 1); continue; }
      P.hit(h.row, h.x, h.z, h.t, 1.4, 1.1);
    }
    for (const o of this.mobs.values()) {
      if (!o.st) continue;
      const h = (BEAST_ROW[o.sk] !== undefined ? BEAST_TOP(o.sk) * mobScale(o) : (MOB_HEIGHT[o.sk] || 2) * mobScale(o) + (MOB_FLYING[o.sk] || 0)) + 0.3; // значок статуса — над головой уменьшенного моба
      P.status(o.st, toX(o.x), h, toZ(o.y), o.id);
    }
    P.end();
    this.pax.update(dt);
    this.bmv.world = this.world; this.bmv.update(dt, this.view);
  }

  dispose() { this.pax?.dispose(); this.root.parent?.remove(this.root); }
}
