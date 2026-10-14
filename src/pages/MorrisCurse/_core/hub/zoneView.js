import { baseOf } from '../../../../../server/meta/biomes.ts';
// Общий мир (Поляна / Аринар): мобы сервера, ресурсы, NPC — всё сервер-авторитетно (server/meta/zone.ts).
// Клиент получает только сущности рядом (AOI) раз в 200 мс, интерполирует их и рисует 2.5D-спрайтами
// одним батчем. Атака/навыки/сбор — запросы к серверу; урон, лут, респавн решает сервер.
import { SpriteBatch, loadAtlasTexture } from '../engine/spriteBatch.js';
import propsSrc from '../../../../assets/mc/props_atlas.png';
import propsMeta from '../../../../assets/mc/props_atlas.json';
import { BEAST_ROW, BEAST_H, beastTop as BEAST_TOP, beastFlying, loadBeastBatch } from '../engine/beastSprites.js';
import { pixAtlases, MOB_CELL, MOB_ROWS, MOB_HEIGHT, MOB_FLYING, HERO_HD, HERO_CELL, HERO_H_M, NPC_ROWS } from '../engine/pixSprites.js';
import { mergeParts, flatMat, toX, toZ } from '../engine/geometry.js';
import {
  MOB_INFO as ZONE_MOBS, NPCS, NPC_RANGE, GATHER_RANGE, GATHER_TIME_MS, ZONE_ATTACK_RANGE, RESOURCES, WEAPON_TYPES, CLASS_WTYPE,
} from '../../../../../server/meta/shared.ts';
import { genNodes, ZONE_GEN } from '../../../../../server/meta/zoneGen.ts';
import { sprOf, tintOf } from '../../../../../server/meta/biomes.ts';
import { ProjFx } from '../engine/projFx.js';
import { ProjAtlasFx } from '../engine/projAtlas.js';
import PROJ_META from '../../../../assets/mc/projectiles.json';
const atlasId = (id) => { const k = String(id || '').replace(/^rs:/, ''); return PROJ_META.items[k] ? k : null; };
import { atmo } from '../engine/atmosphere.js';

const MOB_TYPES = Object.keys(ZONE_MOBS);
const NODE_PROP = { tree: 'pome_tree', flower: 'violets', crystal: 'star_crystal', ore: 'ore_node' };
const HIT_FOR = { spear: 'hit', daggers: 'hit_bleed', soul_spark: 'hit_ice', staff_bolt: 'hit_arcane', ab_backstab: 'hit_ice', thorn_bow: 'hit_bleed', war_axe: 'hit', fly_blades: 'hit_bleed', chain_bolt: 'hit_arcane' };
const PX = 20;
// Масштаб мобов открытого мира: общий ×0.75 (было крупно), вожаки/боссы/элита — относительно крупнее обычных
export const MOB_VIS = 0.75;
export const mobScale = (o, boss = !!ZONE_MOBS[o.type]?.boss) => MOB_VIS * (boss ? 1.35 : o.chief ? 1.6 : o.elite ? 1.25 : 1);

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
      this.npcBatch = new SpriteBatch(THREE, at.heroes, { cellW: HERO_CELL.w, cellH: HERO_CELL.h, cols: HERO_CELL.cols, rows: HERO_CELL.rows, max: 16 });
      this.root.add(this.npcBatch.mesh);
    }
    const decal = (geo, cap, op) => {
      const im = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: op, depthWrite: false, side: THREE.DoubleSide }), cap);
      im.instanceMatrix.setUsage(THREE.DynamicDrawUsage); im.setColorAt(0, new THREE.Color(1, 1, 1));
      im.count = 0; im.frustumCulled = false; this.root.add(im); return im;
    };
    const cg = new THREE.CircleBufferGeometry(1, 28); cg.rotateX(-Math.PI / 2);
    const rg = new THREE.RingBufferGeometry(0.86, 1, 32); rg.rotateX(-Math.PI / 2);
    const lg = new THREE.PlaneBufferGeometry(1, 1); lg.rotateX(-Math.PI / 2); lg.translate(0, 0, 0.5);
    this.fill = decal(cg, 48, 0.3); this.ring = decal(rg, 64, 0.8); this.line = decal(lg, 32, 0.35);
    // выстрелы базовой атаки и вспышки попаданий — PNG-спрайты (вид снаряда зависит от типа оружия)
    this.pfx = new ProjFx(THREE, this.root, { max: 400, glowMax: 500 });
    this.pax = new ProjAtlasFx(THREE, this.root, toX, toZ); // настоящие снаряды сервера (атлас projectiles.png)
    this.hits = [];
    this.seed = ZONE_GEN.seed;
    this.d = new THREE.Object3D();
    this.col = new THREE.Color();
    // узлы ресурсов — пиксельные пропсы из props_atlas (тот же стиль, что земля и деревья)
    this.nodeBatch = null;
    this.beast = null;
    loadBeastBatch(THREE, 320).then((bb) => { this.beast = bb; this.root.add(bb.mesh); }).catch((e) => console.warn('[beast]', e.message));
    const purl = typeof propsSrc === 'object' && propsSrc ? (propsSrc.src || propsSrc.default || '') : propsSrc;
    loadAtlasTexture(THREE, purl).then((t) => {
      const [cw, ch] = propsMeta.cell;
      this.nodeBatch = new SpriteBatch(THREE, t, { cellW: cw, cellH: ch, cols: propsMeta.cols, rows: propsMeta.rows, max: 128 });
      this.root.add(this.nodeBatch.mesh);
    }).catch((e) => console.warn('[nodes]', e.message));
  }

  setWorld(world) {
    if (world === this.world) return;
    this.world = world;
    this.mobs.clear(); this.dying.length = 0; this.teles.length = 0;
    this.nodes.clear(); this.bags.clear();
    if (world === 'arinar') this.buildNodes(this.seed);
  }

  // Узлы ресурсов — из того же сида, что и на сервере (server/meta/zoneGen.ts)
  buildNodes(seed) {
    this.nodes.clear(); this.bags.clear();
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
      if (!o) { o = { id, type, sk: sprOf(type), tint: tintOf(type), x: m[i + 2], y: m[i + 3], flash: 0, flip: false }; this.mobs.set(id, o); }
      if (Math.abs(m[i + 2] - o.x) > 1) o.flip = m[i + 2] < o.x;
      const f = m[i + 5];
      o.tx = m[i + 2]; o.ty = m[i + 3]; o.hp = m[i + 4]; o.flag = f & 3; o.elite = !!(f & 4); o.cursed = !!(f & 1024); o.reset = !!(f & 2048); o.chief = !!(f & 4096);
      o.st = f & 8 ? 'burn' : f & 16 ? 'poison' : f & 32 ? 'bleed' : f & 64 ? 'freeze' : null;
      o.sts = f & 56 ? { burn: (f >> 13) & 7, poison: (f >> 16) & 7, bleed: (f >> 19) & 7 } : null; // стаки статусов (одновременно несколько видов)
    }
    for (const [id, o] of this.mobs) if (!seen.has(id)) { this.mobs.delete(id); }
    if (Array.isArray(s.bags)) { const keep = new Set(); for (const [id, x, y, n] of s.bags) { keep.add(id); this.bags.set(id, { id, x, y, n }); } for (const id of [...this.bags.keys()]) if (!keep.has(id)) this.bags.delete(id); }
    for (const [id, ready] of s.n || []) { const n = this.nodes.get(id); if (n) n.ready = !!ready; }
    if (s.me) this.me = s.me;
    this.tg = s.tg || null; // выбранная цель: точные ХП с сервера
    const out = [];
    for (const e of s.ev || []) {
      if (e.k === 'hit') { const o = this.mobs.get(e.id); if (o) { o.flash = 0.15; out.push({ k: 'float', x: o.x, y: o.y, text: e.evade ? 'Уклонение' : String(Math.round(e.d)), color: e.evade ? '#94a3b8' : '#fff' }); } }
      else if (e.k === 'evade') out.push({ k: 'float', x: e.x, y: e.y, text: '↩ сброс', color: '#94a3b8' });
      else if (e.k === 'mskill') out.push({ k: 'float', x: e.x, y: e.y - 20, text: `✦ ${e.name}`, color: '#f0abfc' });
      else if (e.k === 'shot') { if (e.sid !== myId) this.shoot(e.x, e.y, null, e.w, e.tx, e.ty); }
      else if (e.k === 'announce') out.push({ k: 'toast', text: e.text, color: e.color });
      else if (e.k === 'crit') out.push({ k: 'float', x: e.x, y: e.y - 10, text: 'КРИТ', color: '#facc15' });
      else if (e.k === 'die') { this.dying.push({ type: e.type, sk: sprOf(e.type), tint: tintOf(e.type), x: e.x, y: e.y, t: 0, flip: false, boss: !!ZONE_MOBS[e.type]?.boss }); this.mobs.delete(e.id); }
      else if (e.k === 'slam') {
        if (!e.fx) this.teles.push({ kind: 'boom', x: e.x, y: e.y, r: e.r, t: 0, life: 0.35 });
        else if (e.fx === 'ice_fan') this.pax.burst('ice_fan', e.x, e.y, e.r, 12);
        else if (e.fx === 'war_axe') this.pax.burst('war_axe', e.x, e.y, e.r, 6);
        else if (e.fx === 'plague_puddle') this.pax.puddle(e.x, e.y, e.r, 1.6);
        else if (e.fx !== 'meteor' && e.fx !== 'spear_rain') this.pax.impact(e.fx, e.x, e.y, { k: Math.max(1, e.r / 50) }); // метеор/копья — своё падение
      }
      else if (e.k === 'tele') this.teles.push({ kind: 'line', x: e.x, y: e.y, dx: e.dx, dy: e.dy, len: e.len, t: 0, life: e.t || 0.55 });
      else if (e.k === 'tele_circle') { this.teles.push({ kind: 'circle', x: e.x, y: e.y, r: e.r, t: 0, life: e.t || 1.2 }); if (e.fx === 'meteor' || e.fx === 'spear_rain') this.pax.fall(e.fx, e.x, e.y, e.t || 1.2, e.fdx || 1, e.fx === 'meteor' ? Math.max(1, e.r / 70) : 1); }
      // снаряды сервера: вылет / попадание; лужа фляги; удары навыков мобов спрайтами атласа
      else if (e.k === 'proj') this.pax.spawn(e);
      else if (e.k === 'pend') this.pax.end(e);
      else if (e.k === 'puddle') this.pax.puddle(e.x, e.y, e.r, e.t);
      else if (e.k === 'ability') { const a = atlasId(e.id); if (a && a !== 'meteor') this.pax.impact(a, e.x, e.y, { k: Math.max(1, (e.r || 40) / 60) }); else if (a === 'meteor') this.pax.impact('meteor', e.x, e.y, { k: Math.max(1, (e.r || 70) / 70) }); this.teles.push({ kind: 'boom', x: e.x, y: e.y, r: e.r, t: 0, life: a ? 0.25 : 0.4, color: 0xfde68a }); }
      // формы навыков (server/meta/abilityShapes.ts): линия/рывок, снаряд, отложенный удар (метеор), точки дождя
      else if (e.k === 'aline') this.teles.push({ kind: 'line', x: e.x, y: e.y, dx: e.dx, dy: e.dy, len: e.len, t: 0, life: 0.35 });
      else if (e.k === 'aproj') this.shoot(e.x, e.y, null, e.w || 'staff', e.tx, e.ty);
      else if (e.k === 'amark') { this.teles.push({ kind: 'circle', x: e.x, y: e.y, r: e.r, t: 0, life: e.t || 1.2 }); if (atlasId(e.id) === 'meteor') this.pax.fall('meteor', e.x, e.y, e.t || 1.2, e.fdx || 1, Math.max(1, e.r / 70)); }
      else if (e.k === 'phit' && e.sid === myId) out.push({ k: 'hurt', d: e.d });
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
  nearestBag(px, py, range = 100) {
    let best = null, bd = range;
    for (const b of this.bags.values()) { const d = Math.hypot(b.x - px, b.y - py); if (d < bd) { bd = d; best = b; } }
    return best;
  }
  nearestNode(px, py) {
    let best = null, bd = GATHER_RANGE;
    for (const n of this.nodes.values()) {
      if (!n.ready) continue;
      const d = Math.hypot(n.def.x - px, n.def.y - py);
      if (d < bd) { bd = d; best = n; }
    }
    return best;
  }
  nearestNpc(world, px, py) {
    let best = null, bd = NPC_RANGE - 5;
    for (const [id, n] of Object.entries(NPCS)) {
      if (n.world !== world) continue;
      const d = Math.hypot(n.x - px, n.y - py);
      if (d < bd) { bd = d; best = { id, ...n }; }
    }
    return best;
  }
  resName(res) { return RESOURCES[res]?.name || res; }
  gatherTime() { return GATHER_TIME_MS; }

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

  update(dt, world) {
    this.time += dt;
    const T = this.time, B = this.batch;
    const k = Math.min(1, dt * 8);
    for (const o of this.mobs.values()) {
      if (o.tx !== undefined) { o.x += (o.tx - o.x) * k; o.y += (o.ty - o.y) * k; }
      o.flash = Math.max(0, o.flash - dt);
    }
    const BB = this.beast;
    if (BB) {
      BB.begin();
      for (const o of this.mobs.values()) {
        const row = BEAST_ROW[o.sk];
        if (row === undefined) continue;
        const fly = beastFlying(o.sk);
        let col = (Math.floor(T * (fly ? 10 : 7) + o.id * 0.7)) & 3;
        if (o.flash > 0.05) col = 7; else if (o.flag === 1) col = 4; else if (o.flag === 2) col = 5 + (Math.floor(T * 12) & 1);
        let r = o.flag === 1 ? 1.4 : 1, g = 1, bl = 1;
        if (o.elite) { const p = 0.85 + Math.sin(T * 5 + o.id) * 0.15; r = 1.25 * p + 0.2; g = 1.05 * p + 0.1; bl = 0.6; }
        if (o.st === 'burn') { r *= 1.3; g *= 0.85; bl *= 0.6; } else if (o.st === 'bleed') { r *= 1.3; g *= 0.7; bl *= 0.7; } else if (o.st === 'freeze') { r *= 0.75; bl = 1.6; }
        if (o.tint) { r *= o.tint[0]; g *= o.tint[1]; bl *= o.tint[2]; }
        if (o.cursed) { const p = 0.8 + Math.sin(T * 4 + o.id) * 0.2; r *= 1.1 * p + 0.2; g *= 0.55; bl *= 1.5 * p + 0.2; } // проклятый: фиолетовое свечение
        if (o.reset) { r *= 0.6; g *= 0.6; bl *= 0.7; }
        BB.push(toX(o.x), fly ? Math.sin(T * 5 + o.id) * 0.15 : 0, toZ(o.y), BEAST_H * mobScale(o), col, row, o.flip, r, g, bl, o.flash > 0.05 ? 0.85 : 0, 1);
        atmo.shadow(toX(o.x), toZ(o.y), Math.max(0.35, (ZONE_MOBS[o.type]?.radius || 12) / PX * 1.1) * mobScale(o) / MOB_VIS * 0.85, fly ? 0.55 : 1);
      }
      for (const dd of this.dying) {
        const row = BEAST_ROW[dd.sk];
        if (row === undefined) continue;
        const kk = Math.min(0.99, dd.t / (dd.boss ? 0.9 : 0.5));
        BB.push(toX(dd.x), 0, toZ(dd.y), BEAST_H * MOB_VIS * (dd.boss ? 1.35 : 1), 8 + Math.min(3, Math.floor(kk * 4)), row, dd.flip, 1.2 * (dd.tint?.[0] || 1), 1.1 * (dd.tint?.[1] || 1), 1.3 * (dd.tint?.[2] || 1), kk < 0.15 ? 0.6 : 0, 1 - kk * 0.5);
      }
      BB.end();
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
        if (o.reset) { r *= 0.6; g *= 0.6; bl *= 0.7; }
        B.push(toX(o.x), fly ? fly + Math.sin(T * 7 + o.id) * 0.18 : 0, toZ(o.y), h, col, row, o.flip, r, g, bl, o.flash > 0.05 ? 0.85 : 0, 1);
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
        B.push(toX(n.x), 0, toZ(n.y), MOB_HEIGHT[id] || 2.5, (Math.floor(T * 2.5 + n.x) & 3), MOB_ROWS[id], false, 1, 1, 1, 0, 1);
        atmo.shadow(toX(n.x), toZ(n.y), 0.6);
      }
      B.end();
    }
    const NPB = this.npcBatch;
    if (NPB) {
      NPB.begin();
      for (const [id, n] of Object.entries(NPCS)) {
        if (n.world !== world || NPC_ROWS[id] === undefined) continue;
        NPB.push(toX(n.x), 0, toZ(n.y), HERO_H_M * 1.08, (Math.floor(T * 1.25 + n.x) & 1) ? 3 : 1, NPC_ROWS[id], false, 1, 1, 1, 0, 1);
        atmo.shadow(toX(n.x), toZ(n.y), 0.6);
      }
      NPB.end();
    }
    // ресурсы: готовые — светятся и покачиваются
    const NB = this.nodeBatch;
    if (NB) {
      NB.begin();
      const V = this.view; // Аринар 48000: рисуем только узлы рядом с камерой (их сотни)
      for (const n of this.nodes.values()) {
        if (V && (Math.abs(n.def.x - V.x) > 1400 || Math.abs(n.def.y - V.y) > 1100)) continue;
        const e = propsMeta.index[NODE_PROP[n.def.type] || 'ore_node'];
        if (!e) continue;
        const h = (propsMeta.cell[1] / 10) * (n.ready ? 1 + Math.sin(T * 3 + n.id) * 0.03 : 0.7);
        const k = n.ready ? 1.15 + Math.sin(T * 2.4 + n.id) * 0.12 : 0.45;
        NB.push(toX(n.def.x), 0, toZ(n.def.y), h, e[0], e[1], n.flip, k, k, k, 0, n.ready ? 1 : 0.7);
        atmo.shadow(toX(n.def.x), toZ(n.def.y), n.def.type === 'tree' ? 1.3 : 0.6, n.ready ? 1 : 0.6);
      }
      // мешки добычи: ящик-мешок, покачивается
      const eb = propsMeta.index.crate;
      if (eb) for (const b of this.bags.values()) {
        const h = (propsMeta.cell[1] / 10) * 0.55 * (1 + Math.sin(T * 4 + b.id) * 0.05);
        NB.push(toX(b.x), 0, toZ(b.y), h, eb[0], eb[1], false, 1.35, 1.15, 0.6, 0, 1);
        atmo.shadow(toX(b.x), toZ(b.y), 0.5, 1);
      }
      NB.end();
    }
    // телеграфы и эффекты
    const d = this.d;
    let nf = 0, nr = 0, nl = 0;
    const put = (im, i, x, z, sx, sz, rot, r, g, b) => { d.position.set(x, 0.06 + i * 0.0005, z); d.rotation.set(0, rot, 0); d.scale.set(sx, 1, sz); d.updateMatrix(); im.setMatrixAt(i, d.matrix); im.setColorAt(i, this.col.setRGB(r, g, b)); };
    for (let i = this.teles.length - 1; i >= 0; i--) {
      const t = this.teles[i];
      t.t += dt;
      if (t.t >= t.life) { this.teles.splice(i, 1); continue; }
      const kk = t.t / t.life;
      if (t.kind === 'line' && nl < 32) put(this.line, nl++, toX(t.x), toZ(t.y), 1.1, (t.len / PX) * (0.3 + 0.7 * kk), Math.atan2(t.dx, t.dy), 1, 0.25, 0.25);
      else if (t.kind === 'circle' && nf < 48 && nr < 64) { const R = t.r / PX; put(this.fill, nf++, toX(t.x), toZ(t.y), R * kk, R * kk, 0, 1, 0.3, 0.6); put(this.ring, nr++, toX(t.x), toZ(t.y), R, R, 0, 1, 0.4, 0.9); }
      else if (t.kind === 'boom' && nr < 64) { const R = (t.r / PX) * (0.5 + kk * 0.6); const c = t.color === 0xfde68a ? [1, 0.9, 0.4] : [1, 0.35, 0.3]; put(this.ring, nr++, toX(t.x), toZ(t.y), R, R, 0, ...c); }
    }
    for (const b of this.bags.values()) if (nr < 64) { const R = 0.9 + Math.sin(T * 4 + b.id) * 0.08; put(this.ring, nr++, toX(b.x), toZ(b.y), R, R, 0, 1, 0.85, 0.25); } // мешок — золотое кольцо
    for (const o of this.mobs.values()) {
      if (o.id === this.selected && nr < 64) { const R = Math.max(0.85, (ZONE_MOBS[o.type]?.radius || 12) / PX * 2.2 * mobScale(o)) + Math.sin(T * 6) * 0.06; put(this.ring, nr++, toX(o.x), toZ(o.y), R, R, 0, 1, 0.95, 0.4); } // выбранная цель
      if (this.trackTypes?.size && nr < 64 && (this.trackTypes.has(o.type) || this.trackTypes.has(baseOf(o.type)))) { const R = 1.15 * mobScale(o) + Math.sin(T * 5 + o.id) * 0.1; put(this.ring, nr++, toX(o.x), toZ(o.y), R, R, 0, 0.3, 1, 0.45); } // цель квеста (отслеживание) — зелёное кольцо
      if (o.cursed && nr < 64) { const R = 1.6 * mobScale(o) + Math.sin(T * 3 + o.id) * 0.15; put(this.ring, nr++, toX(o.x), toZ(o.y), R, R, 0, 0.75, 0.2, 1); }
      if (ZONE_MOBS[o.type]?.boss && nr < 64) { const R = 2.4 * MOB_VIS * 1.35 + Math.sin(T * 4) * 0.1; put(this.ring, nr++, toX(o.x), toZ(o.y), R, R, 0, 0.8, 0.4, 1); }
      else if (o.chief && nr < 64) { const R = 1.9 * MOB_VIS * 1.6 / 1.45 + Math.sin(T * 3 + o.id) * 0.1; put(this.ring, nr++, toX(o.x), toZ(o.y), R, R, 0, 1, 0.55, 0.1); } // вожак лагеря — крупнее, золотое кольцо
      else if (o.elite && nr < 64) { const R = 1.3 * MOB_VIS * 1.1 + Math.sin(T * 5 + o.id) * 0.08; put(this.ring, nr++, toX(o.x), toZ(o.y), R, R, 0, 1, 0.8, 0.2); }
    }
    this.fill.count = nf; this.ring.count = nr; this.line.count = nl;
    for (const im of [this.fill, this.ring, this.line]) { im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true; }
    // снаряды базовой атаки, вспышки попаданий, значки статусов — спрайты из proj_atlas
    const P = this.pfx;
    P.begin(dt);
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
        if (this.hits.length < 48 && (m || b.arc)) this.hits.push({ x: toX(tx), z: toZ(ty), row: HIT_FOR[b.shot] || 'hit', t: 0 });
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
  }

  dispose() { this.pax?.dispose(); this.root.parent?.remove(this.root); }
}
