// Отрисовка забега. Орда — 2.5D пиксельные билборды из одного атласа (один draw call на всю орду),
// анимации ход/замах/удар/урон/распад, телеграфы атак на земле, ауры элиты, вспышка при попадании.
// Снаряды/камни — InstancedMesh (draw call на вид), герои — 2.5D-спрайты.
import { buildEnemyGeometries, buildPickupGeometries, flatMat } from '../engine/models.js';
import { createCharacter, kindFromClass, modelMode } from '../engine/characters.js';
import { SpriteBatch } from '../engine/spriteBatch.js';
import { pixAtlases, MOB_CELL, MOB_ROWS, MOB_HEIGHT, MOB_FLYING } from '../engine/pixSprites.js';
import { ENEMIES, WEAPONS } from './data.js';
import { BEAST_ROW, beastFlying, beastHeightFor, loadBeastBatch } from '../engine/beastSprites.js';
// видимый рост тела в забеге (м) — как у прежних спрайтов арены; остальные Отголоски — 1.5 м
const RUN_VIS = { imp: 1.4, bat: 0.9, ghoul: 1.8, spitter: 1.2, golem: 2.8, warden: 4.4, blade_fly: 1.35, dream_moth: 1.1, rot_glitch: 1.1, moon_sentinel: 4.9 };
const RUN_H = {};
const runH = (t) => (RUN_H[t] ??= beastHeightFor(t, RUN_VIS[t] ?? 1.5));
import { ProjFx } from '../engine/projFx.js';

const CAP = { imp: 220, bat: 220, ghoul: 200, spitter: 120, golem: 90, warden: 4, blade_fly: 160, dream_moth: 120, rot_glitch: 140, moon_sentinel: 4 };
const MOB_MAX = 700;
const DEATH_MAX = 120;
const TELE_MAX = 96;
const GEM_CAP = 420;
const STATUS_ICONS = 140;
const ST_KINDS = ['burn', 'poison', 'bleed', 'frz'];
const WEAPON_SIZE = Object.fromEntries(Object.entries(WEAPONS).map(([k, w]) => [k, w.base.size]));
// цвет взрыва → спрайт вспышки
const BOOM_ROW = { 0x93c5fd: 'hit_ice', 0xfbbf24: 'hit', 0xfde047: 'hit', 0xe2e8f0: 'hit', 0xf0abfc: 'hit_arcane', 0xe9d5ff: 'hit_arcane', 0xf87171: 'hit_bleed', 0xa855f7: 'hit_arcane', 0x84cc16: 'hit_poison' };

export class RunView {
  constructor(THREE, scene, run, arena) {
    this.THREE = THREE;
    this.scene = scene;
    this.run = run;
    this.root = new THREE.Group();
    this.root.name = 'run-view';
    scene.add(this.root);
    this.arena = arena;
    this.root.add(arena.build(THREE));
    if (run.mode === 'trial') {
      // Сердце Обители (Испытание): кристалл в центре, тускнеет с потерей здоровья
      const hg = new THREE.Group();
      const core = new THREE.Mesh(new THREE.OctahedronGeometry(0.9, 0), new THREE.MeshStandardMaterial({ color: 0xfbbf24, emissive: 0xf59e0b, emissiveIntensity: 0.9, flatShading: true, roughness: 0.3 }));
      core.position.y = 1.8; core.scale.y = 1.5;
      const base = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.7, 0.5, 8), new THREE.MeshStandardMaterial({ color: 0x2a1f1f, flatShading: true }));
      base.position.y = 0.25;
      const ring = new THREE.Mesh(new THREE.RingGeometry(1.5, 1.7, 32), new THREE.MeshBasicMaterial({ color: 0xfbbf24, transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false }));
      ring.rotation.x = -Math.PI / 2; ring.position.y = 0.03;
      const light = new THREE.PointLight(0xfbbf24, 1.4, 14, 1.8); light.position.y = 2.4;
      hg.add(core, base, ring, light);
      this.root.add(hg);
      this.heartObj = { core, ring, light };
    }
    this.dummy = new THREE.Object3D();
    this.col = new THREE.Color();
    this.time = 0;

    // Орда: 2.5D-атлас (по умолчанию) или запасные 3D-меши
    const atl = pixAtlases();
    this.enemyMeshes = {};
    this.lastSeen = new Map(); // id → {type,x,z,scale,flip,frame}
    this.frameNo = 0;
    this.dying = [];
    if (atl.mobs && modelMode() === 'pix') {
      this.mobBatch = new SpriteBatch(THREE, atl.mobs, { cellW: MOB_CELL.w, cellH: MOB_CELL.h, cols: MOB_CELL.cols, rows: MOB_CELL.rows, max: MOB_MAX });
      this.root.add(this.mobBatch.mesh);
      // единый атлас Отголосков (как в открытом мире); старый 14-типовой — только для отсутствующих (зеркало Кьют)
      this.beast = null;
      loadBeastBatch(THREE, MOB_MAX).then((bb) => { this.beast = bb; this.root.add(bb.mesh); }).catch((e) => console.warn('[beast]', e.message));
    }
    // Телеграфы (круги/линии на земле), ауры элиты, лужи — по одному InstancedMesh
    const decal = (geo, cap, opacity) => {
      const im = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity, depthWrite: false, side: THREE.DoubleSide }), cap);
      im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      im.setColorAt(0, this.col.setRGB(1, 1, 1));
      im.count = 0; im.frustumCulled = false; im.renderOrder = 1;
      this.root.add(im);
      return im;
    };
    const cg = new THREE.CircleBufferGeometry(1, 28); cg.rotateX(-Math.PI / 2);
    const rg = new THREE.RingBufferGeometry(0.86, 1, 32); rg.rotateX(-Math.PI / 2);
    const lg = new THREE.PlaneBufferGeometry(1, 1); lg.rotateX(-Math.PI / 2); lg.translate(0, 0, 0.5);
    this.teleFill = decal(cg, TELE_MAX, 0.28);
    this.teleRing = decal(rg, TELE_MAX, 0.75);
    this.teleLine = decal(lg, TELE_MAX, 0.32);
    const geos = this.mobBatch ? null : buildEnemyGeometries(THREE);
    if (geos) Object.keys(CAP).forEach((type) => {
      if (!geos[type]) return;
      const mat = flatMat(THREE, type === 'warden' ? { emissive: 0x2a0a20, emissiveIntensity: 0.6 } : {});
      const im = new THREE.InstancedMesh(geos[type], mat, CAP[type]);
      im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      im.setColorAt(0, this.col.setRGB(1, 1, 1));
      im.castShadow = true;
      im.count = 0;
      im.frustumCulled = false;
      this.root.add(im);
      this.enemyMeshes[type] = im;
    });

    // Камни опыта и пикапы
    const pk = buildPickupGeometries(THREE);
    this.gemMesh = new THREE.InstancedMesh(pk.gem, new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0x1e3a8a, emissiveIntensity: 0.6, metalness: 0.3, roughness: 0.25, flatShading: true }), GEM_CAP);
    this.gemMesh.setColorAt(0, this.col.setRGB(1, 1, 1));
    this.gemMesh.count = 0;
    this.gemMesh.frustumCulled = false;
    this.root.add(this.gemMesh);
    this.pickupGeos = pk;
    this.pickupMeshes = new Map();
    this.pickupMat = flatMat(THREE, { emissive: 0x222222, emissiveIntensity: 0.4 });

    // Снаряды и эффекты — PNG-спрайты из proj_atlas (2 draw call на всё)
    this.pfx = new ProjFx(THREE, this.root);

    // Герои
    this.players = new Map();
    this.meLight = new THREE.PointLight(0xffe2b8, 1.0, 11, 1.8);
    this.meLight.position.y = 3;
    this.root.add(this.meLight);
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.9, 1.05, 32), new THREE.MeshBasicMaterial({ color: 0xfacc15, transparent: true, opacity: 0.6, side: THREE.DoubleSide, depthWrite: false }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.04;
    this.meRing = ring;
    this.root.add(ring);
    this.magnetRing = new THREE.Mesh(new THREE.RingGeometry(0.98, 1.0, 48), new THREE.MeshBasicMaterial({ color: 0x93c5fd, transparent: true, opacity: 0.18, side: THREE.DoubleSide, depthWrite: false }));
    this.magnetRing.rotation.x = -Math.PI / 2;
    this.magnetRing.position.y = 0.03;
    this.root.add(this.magnetRing);
  }

  drawHorde3D() {
    const run = this.run, d = this.dummy;
    const counts = {};
    Object.keys(this.enemyMeshes).forEach((k) => { counts[k] = 0; });
    for (const e of run.enemies.values()) {
      if (e.dead) continue;
      const im = this.enemyMeshes[e.type];
      if (!im) continue;
      const i = counts[e.type];
      if (i >= im.instanceMatrix.count) continue;
      counts[e.type]++;
      const def = ENEMIES[e.type];
      const s = e.scale || 1;
      const hop = def.flying ? 0.4 + Math.sin(this.time * 9 + e.id) * 0.25 : Math.abs(Math.sin(this.time * 8 + e.id)) * 0.12;
      d.position.set(e.x, hop, e.z);
      d.rotation.set(0, e.face || 0, 0);
      d.scale.set(s, s, s);
      d.updateMatrix();
      im.setMatrixAt(i, d.matrix);
      if (e.flash > 0) this.col.setRGB(5, 5, 5);
      else if (e.elite) this.col.setRGB(1.9, 1.5, 0.6);
      else this.col.setRGB(1, 1, 1);
      im.setColorAt(i, this.col);
    }
    Object.keys(this.enemyMeshes).forEach((k) => {
      const im = this.enemyMeshes[k];
      im.count = counts[k];
      im.instanceMatrix.needsUpdate = true;
      if (im.instanceColor) im.instanceColor.needsUpdate = true;
    });
  }

  // 2.5D-орда: один батч, кадры по состоянию, распад исчезнувших врагов
  drawHorde(dt) {
    const run = this.run, B = this.mobBatch, BB = this.beast, T = this.time;
    const fno = ++this.frameNo;
    B.begin(); BB?.begin();
    for (const e of run.enemies.values()) {
      if (e.dead) continue;
      const brow = BB ? BEAST_ROW[e.type] : undefined;
      const row = brow ?? MOB_ROWS[e.type];
      if (row === undefined) continue;
      const s = e.scale || 1;
      const h = brow !== undefined ? runH(e.type) * s : (MOB_HEIGHT[e.type] || 2) * s;
      const fly = brow !== undefined ? (beastFlying(e.type) ? 1 : 0) : MOB_FLYING[e.type] || 0;
      const y = brow !== undefined ? (fly ? Math.sin(T * 5 + e.id) * 0.15 * s : 0) : fly ? (fly + Math.sin(T * 7 + e.id) * 0.18) * s : 0;
      let col;
      if (e.flash > 0.05) col = 7;
      else if (e.wind > 0) col = 4;
      else if (e.dashT > 0) col = 5 + (Math.floor(T * 12) & 1);
      else col = (Math.floor(T * (fly ? 12 : 7) + e.id * 0.7)) & 3;
      const sx = Math.sin(e.face || 0);
      let rec = this.lastSeen.get(e.id);
      if (!rec) { rec = { type: e.type, x: 0, z: 0, s: 1, flip: false, f: 0, elite: false }; this.lastSeen.set(e.id, rec); }
      if (Math.abs(sx) > 0.15) rec.flip = sx < 0;
      rec.x = e.x; rec.z = e.z; rec.s = s; rec.f = fno; rec.elite = e.elite; rec.boss = e.boss;
      const shake = e.wind > 0 ? Math.sin(T * 60 + e.id) * 0.06 : 0;
      let r = 1, g = 1, b = 1;
      if (e.elite) { const p = 0.85 + Math.sin(T * 5 + e.id) * 0.15; r = 1.25 * p + 0.2; g = 1.05 * p + 0.1; b = 0.6; }
      if (e.slowUntil > run.t) { r *= 0.7; g *= 0.9; b = 1.5; }
      if (e.frzU > run.t) { r = 0.75; g = 1.15; b = 1.9; }
      else if (e.burnU > run.t) { const f = 0.5 + 0.5 * Math.sin(T * 18 + e.id); r *= 1.25 + 0.25 * f; g *= 0.85; b *= 0.6; }
      else if (e.poisonU > run.t) { r *= 0.75; g *= 1.2; b *= 0.6; }
      else if (e.bleedU > run.t) { r *= 1.3; g *= 0.7; b *= 0.7; }
      if (e.wind > 0) { r = Math.max(r, 1.35); }
      (brow !== undefined ? BB : B).push(e.x + shake, y, e.z, h, col, row, rec.flip, r, g, b, e.flash > 0.05 ? 0.85 : 0, 1);
    }
    // исчезнувшие → распад архива (кадры 8–11)
    for (const [id, rec] of this.lastSeen) {
      if (rec.f === fno) continue;
      this.lastSeen.delete(id);
      if (this.dying.length < DEATH_MAX) this.dying.push({ type: rec.type, x: rec.x, z: rec.z, s: rec.s, flip: rec.flip, t: 0, elite: rec.elite || rec.boss });
    }
    for (let i = this.dying.length - 1; i >= 0; i--) {
      const dd = this.dying[i];
      dd.t += dt;
      const life = dd.elite ? 0.8 : 0.45;
      if (dd.t >= life) { this.dying.splice(i, 1); continue; }
      const k = dd.t / life;
      const brow = BB ? BEAST_ROW[dd.type] : undefined;
      if (brow !== undefined) { BB.push(dd.x, 0, dd.z, runH(dd.type) * dd.s, 8 + Math.min(3, Math.floor(k * 4)), brow, dd.flip, 1.2, 1.1, 1.3, k < 0.15 ? 0.6 : 0, 1 - k * 0.6); continue; }
      if (MOB_ROWS[dd.type] === undefined) continue;
      const fly = MOB_FLYING[dd.type] || 0;
      B.push(dd.x, fly * dd.s * (1 - k), dd.z, (MOB_HEIGHT[dd.type] || 2) * dd.s, 8 + Math.min(3, Math.floor(k * 4)), MOB_ROWS[dd.type], dd.flip, 1.2, 1.1, 1.3, k < 0.15 ? 0.6 : 0, 1 - k * 0.6);
    }
    B.end(); BB?.end();
  }

  // Телеграфы атак, ауры элиты/босса, лужи гнили, метки метеора
  drawDecals() {
    const run = this.run, d = this.dummy, T = this.time;
    let nf = 0, nr = 0, nl = 0;
    const fill = this.teleFill, ring = this.teleRing, line = this.teleLine;
    const put = (im, i, x, z, sx, sz, rotY, r, g, b) => {
      d.position.set(x, 0.05 + i * 0.0004, z); d.rotation.set(0, rotY, 0); d.scale.set(sx, 1, sz); d.updateMatrix();
      im.setMatrixAt(i, d.matrix); im.setColorAt(i, this.col.setRGB(r, g, b));
    };
    for (const e of run.enemies.values()) {
      if (e.dead) continue;
      const A = ENEMIES[e.type].atk;
      const s = e.scale || 1;
      if (e.wind > 0 && A && nf < TELE_MAX && nr < TELE_MAX) {
        const k = 1 - Math.max(0, e.wind) / (A.wind || 1);
        if (A.kind === 'dash' || A.kind === 'lunge') {
          if (nl < TELE_MAX) put(line, nl++, e.x, e.z, 0.9 * s, (A.len || 6) * (0.4 + 0.6 * k), e.face || 0, 1, 0.25, 0.25);
        } else {
          const R = (A.r || 3) * s;
          put(fill, nf++, e.x, e.z, R * k, R * k, 0, A.kind === 'dust' ? 0.9 : 1, A.kind === 'dust' ? 0.7 : 0.2, A.kind === 'dust' ? 1 : 0.2);
          put(ring, nr++, e.x, e.z, R, R, 0, 1, A.kind === 'dust' ? 0.8 : 0.3, A.kind === 'dust' ? 1 : 0.3);
        }
      }
      if ((e.elite || e.boss) && nr < TELE_MAX) {
        const R = ENEMIES[e.type].radius * s * 1.35 + Math.sin(T * 4 + e.id) * 0.08;
        put(ring, nr++, e.x, e.z, R, R, 0, e.boss ? 0.9 : 1, e.boss ? 0.4 : 0.8, e.boss ? 1 : 0.2);
      }
    }
    for (const hz of run.hazards || []) {
      if (nf >= TELE_MAX) break;
      put(fill, nf++, hz.x, hz.z, hz.r, hz.r, 0, 0.45, 0.9, 0.15);
    }
    for (const f of run.fx) {
      if (f.kind !== 'tele' || nr >= TELE_MAX || nf >= TELE_MAX) continue;
      const k = Math.min(1, f.t / f.life);
      put(ring, nr++, f.x, f.z, f.r, f.r, 0, 1, 0.55, 0.1);
      put(fill, nf++, f.x, f.z, f.r * k, f.r * k, 0, 1, 0.4, 0.1);
    }
    for (const im of [fill, ring, line]) {
      im.count = im === fill ? nf : im === ring ? nr : nl;
      im.instanceMatrix.needsUpdate = true;
      if (im.instanceColor) im.instanceColor.needsUpdate = true;
    }
  }

  playerModel(id, classKey, color, isMe, look) {
    let p = this.players.get(id);
    const kind = kindFromClass(classKey === 'soul' ? null : classKey, look);
    if (p && p.kind === kind) return p;
    if (p) this.root.remove(p.ch.group);
    const ch = createCharacter(this.THREE, kind, color);
    this.root.add(ch.group);
    p = { ch, kind, isMe };
    this.players.set(id, p);
    return p;
  }

  update(dt, t) {
    const THREE = this.THREE;
    const run = this.run;
    const d = this.dummy;
    this.time += dt;
    this.arena.update(dt);
    if (this.heartObj && run.heart) {
      const k = Math.max(0, run.heart.hp / run.heart.maxHp);
      const h = this.heartObj;
      h.core.rotation.y += dt * (0.6 + (1 - k) * 2);
      h.core.material.emissiveIntensity = 0.25 + 0.75 * k;
      h.core.material.color.setRGB(0.98, 0.45 + 0.3 * k, 0.15 + 0.1 * k);
      h.light.intensity = 0.4 + 1.0 * k;
      h.ring.material.opacity = 0.2 + 0.4 * k;
    }

    // орда
    if (this.mobBatch) this.drawHorde(dt);
    else this.drawHorde3D();
    this.drawDecals();

    // камни
    let gi = 0;
    for (const g of run.gems.values()) {
      if (gi >= GEM_CAP) break;
      const big = g.v >= 10 ? 1.6 : g.v >= 3 ? 1.25 : 1;
      d.position.set(g.x, 0.45 + Math.sin(this.time * 3 + g.id) * 0.12, g.z);
      d.rotation.set(0, this.time * 2 + g.id, 0);
      d.scale.setScalar(big);
      d.updateMatrix();
      this.gemMesh.setMatrixAt(gi, d.matrix);
      if (g.v >= 10) this.col.setRGB(1.6, 0.25, 0.35);
      else if (g.v >= 3) this.col.setRGB(0.3, 1.5, 0.5);
      else this.col.setRGB(0.35, 0.7, 1.8);
      this.gemMesh.setColorAt(gi, this.col);
      gi++;
    }
    this.gemMesh.count = gi;
    this.gemMesh.instanceMatrix.needsUpdate = true;
    if (this.gemMesh.instanceColor) this.gemMesh.instanceColor.needsUpdate = true;

    // пикапы
    const seen = new Set();
    for (const p of run.pickups.values()) {
      seen.add(p.id);
      let m = this.pickupMeshes.get(p.id);
      if (!m) {
        m = new THREE.Mesh(this.pickupGeos[p.kind] || this.pickupGeos.heart, this.pickupMat);
        m.castShadow = true;
        if (p.kind === 'chest') m.scale.setScalar(1.3);
        this.root.add(m);
        this.pickupMeshes.set(p.id, m);
      }
      m.position.set(p.x, 0.5 + Math.sin(this.time * 2.5 + p.id) * 0.15, p.z);
      m.rotation.y = this.time * 1.5;
    }
    for (const [id, m] of this.pickupMeshes) {
      if (!seen.has(id)) { this.root.remove(m); this.pickupMeshes.delete(id); }
    }

    this.drawShots(dt);

    // герои
    const me = run.me;
    const meP = this.playerModel(run.myId, run.classKey, run.color, true, run.meta?.look);
    this.placePlayer(meP, me, dt, t, me.iframes > 0 && !me.dead && Math.floor(this.time * 20) % 2 === 0);
    if (me.fireT !== undefined && me.fireT !== this.lastFireT) { this.lastFireT = me.fireT; if (!me.moving || Math.random() < 0.5) meP.ch.attack?.(); }
    this.meLight.position.set(me.x, 3, me.z);
    this.meRing.position.set(me.x, 0.04, me.z);
    this.magnetRing.position.set(me.x, 0.03, me.z);
    this.magnetRing.scale.setScalar(me.magnet || 2.4);
    const alive = new Set([run.myId]);
    for (const [id, r] of run.remotes) {
      alive.add(id);
      const p = this.playerModel(id, r.classKey || 'soul', r.color, false, r.look);
      this.placePlayer(p, r, dt, t, false);
      p.ch.group.visible = !r.stale;
    }
    for (const [id, p] of this.players) {
      if (!alive.has(id)) { this.root.remove(p.ch.group); this.players.delete(id); }
    }
  }

  // Снаряды, зоны, попадания, взрывы, разряды, значки статусов — всё из атласа
  drawShots(dt) {
    const run = this.run, P = this.pfx, T = run.t;
    P.begin(dt);
    for (const z of run.zones || []) {
      if (z.kind === 'mine') P.shot('glyph_mine', z.x, z.z, 0, 0, z.t, z.seed, z.t < z.arm ? 0.7 : 1, z.t < z.arm ? 0.55 : 1);
      else if (z.kind === 'cloud') P.cloud(z.x, z.z, z.r, z.t, z.life, 0x65a30d, z.seed);
      else if (z.kind === 'beam') P.beam(z.x, z.z, z.dx, z.dz, z.len, z.w, z.t, z.life, 0xfbbf24);
    }
    for (const p of run.projectiles) {
      const base = WEAPON_SIZE[p.w] || 0.5;
      P.shot(p.w, p.x, p.z, p.orbit ? -Math.sin(p.phase + p.age * 3.2) : p.vx, p.orbit ? Math.cos(p.phase + p.age * 3.2) : p.vz, p.age, p.seed || 0, Math.max(0.7, Math.min(2.2, p.size / base)) * (p.child ? 0.75 : 1));
    }
    for (const s of run.visualShots) {
      if (s.w === 'plague_cloud') P.cloud(s.x, s.z, 2.6, s.age, s.life, 0x65a30d, s.phase);
      else if (s.w === 'sun_beam') P.beam(s.x, s.z, s.vx, s.vz, 11, 0.7, s.age, s.life, 0xfbbf24);
      else P.shot(s.w, s.x, s.z, s.vx, s.vz, s.age, s.phase);
    }
    for (const s of run.enemyShots) P.shot(s.dmg > 10 ? 'enemy_boss' : 'enemy', s.x, s.z, s.vx, s.vz, 3 - s.life, s.x * 0.3, 1, 1, 0.8);
    for (const f of run.fx) {
      if (f.t < 0) continue;
      const k = f.t / f.life;
      if (f.kind === 'hit') P.hit(f.row, f.x, f.z, k, f.r);
      else if (f.kind === 'boom') {
        if (f.life > 1) P.cloud(f.x, f.z, f.r * 0.8, f.t, f.life, f.color || 0x334155, f.x);
        else P.boom(f.x, f.z, f.r, k, f.color || 0xf97316, f.row || BOOM_ROW[f.color] || 'hit_fire');
      } else if (f.kind === 'zap') P.zap(f.x, f.z, f.x2, f.z2, k);
    }
    // значки статусов над головами
    let n = 0;
    for (const e of run.enemies.values()) {
      if (e.dead || n >= STATUS_ICONS) continue;
      const h = (this.beast && BEAST_ROW[e.type] !== undefined ? (RUN_VIS[e.type] ?? 1.5) * (e.scale || 1) + (beastFlying(e.type) ? 0.6 : 0) : (MOB_HEIGHT[e.type] || 2) * (e.scale || 1) + (MOB_FLYING[e.type] || 0)) + 0.25;
      let off = 0;
      for (const kind of ST_KINDS) {
        if (!(e[kind + 'U'] > T)) continue;
        P.status(kind === 'frz' ? 'freeze' : kind, e.x + off, h, e.z, e.id);
        off += 0.55; n++;
      }
    }
    P.end();
  }

  placePlayer(p, s, dt, t, blink) {
    const g = p.ch.group;
    g.position.set(s.x, 0, s.z);
    p.ch.update(dt, !!s.moving && !s.dead, t, s.dirX || 0, s.dirZ ?? 1);
    // 2.5D-спрайт не «ложится» — павший герой полупрозрачен и прижат к земле
    if (p.ch.sprite) { p.ch.sprite.material.opacity = s.dead ? 0.45 : 1; g.rotation.z = 0; }
    else g.rotation.z = s.dead ? Math.PI / 2.2 : 0;
    g.position.y = s.dead ? 0.3 : 0;
    g.visible = !blink;
  }

  dispose() {
    // модели героев используют общий кэш геометрий — не уничтожаем их
    for (const p of this.players.values()) this.root.remove(p.ch.group);
    this.players.clear();
    this.scene.remove(this.root);
    this.root.traverse((o) => {
      if (o.geometry) o.geometry.dispose?.();
      if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => { m.map?.dispose?.(); m.dispose?.(); });
    });
  }
}
