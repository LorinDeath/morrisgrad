// Отрисовка забега: орда и снаряды — InstancedMesh (один draw call на тип), герои — модели из спрайтов.
import { buildEnemyGeometries, buildPickupGeometries, flatMat } from '../engine/models.js';
import { createCharacter, kindFromClass } from '../engine/characters.js';
import { ENEMIES, WEAPONS } from './data.js';

const CAP = { imp: 220, bat: 220, ghoul: 200, spitter: 120, golem: 90, warden: 4 };
const GEM_CAP = 420;
const SHOT_CAP = 260;

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
    this.dummy = new THREE.Object3D();
    this.col = new THREE.Color();
    this.time = 0;

    // Орда
    const geos = buildEnemyGeometries(THREE);
    this.enemyMeshes = {};
    Object.keys(CAP).forEach((type) => {
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

    // Снаряды по видам
    const T = THREE;
    const glow = (c) => new T.MeshBasicMaterial({ color: c });
    const shotDefs = {
      soul_spark: [new T.IcosahedronGeometry(0.28, 0), glow(0x67e8f9)],
      war_axe: [this.axeGeo(), new T.MeshStandardMaterial({ color: 0xcbd5e1, metalness: 0.7, roughness: 0.3, flatShading: true })],
      spear: [this.longGeo(0.12, 1.4), new T.MeshStandardMaterial({ color: 0xfbbf24, metalness: 0.5, roughness: 0.3, flatShading: true })],
      daggers: [this.longGeo(0.07, 0.7), new T.MeshStandardMaterial({ color: 0xe2e8f0, metalness: 0.8, roughness: 0.2, flatShading: true })],
      fire_spark: [new T.IcosahedronGeometry(0.36, 0), glow(0xf97316)],
      orbit_skulls: [new T.IcosahedronGeometry(0.4, 0), new T.MeshStandardMaterial({ color: 0xfef3c7, emissive: 0x7c2d12, emissiveIntensity: 0.3, flatShading: true })],
      chain_bolt: [new T.OctahedronGeometry(0.3, 0), glow(0xa5b4fc)],
      ice_fan: [this.longGeo(0.1, 0.55), glow(0x7dd3fc)],
      ab_backstab: [this.longGeo(0.14, 1.1), glow(0x38bdf8)],
      ab_pierce: [this.longGeo(0.3, 3.2), glow(0xfde047)],
      ab_trick: [this.longGeo(0.1, 0.8), glow(0x4ade80)],
      ab_fireball: [new T.IcosahedronGeometry(1.0, 1), glow(0xff5a1f)],
      enemy: [new T.IcosahedronGeometry(0.3, 0), glow(0xa3e635)],
    };
    this.shotMeshes = {};
    Object.keys(shotDefs).forEach((k) => {
      const [geo, mat] = shotDefs[k];
      const im = new THREE.InstancedMesh(geo, mat, k === 'enemy' ? 160 : SHOT_CAP);
      im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      im.count = 0;
      im.frustumCulled = false;
      this.root.add(im);
      this.shotMeshes[k] = im;
    });

    // Эффекты
    this.boomPool = [];
    for (let i = 0; i < 16; i++) {
      const m = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 10), new THREE.MeshBasicMaterial({ color: 0xf97316, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false }));
      m.visible = false;
      this.root.add(m);
      this.boomPool.push(m);
    }
    const zg = new THREE.BufferGeometry();
    zg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(64 * 6), 3));
    this.zapLines = new THREE.LineSegments(zg, new THREE.LineBasicMaterial({ color: 0xc7d2fe }));
    this.zapLines.frustumCulled = false;
    this.root.add(this.zapLines);

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

  axeGeo() {
    const T = this.THREE;
    const g = new T.BoxGeometry(0.75, 0.08, 0.32);
    return g;
  }

  longGeo(r, len) {
    const g = new this.THREE.ConeGeometry(r, len, 4);
    g.rotateX(Math.PI / 2); // остриё вдоль +Z
    return g;
  }

  playerModel(id, classKey, color, isMe) {
    let p = this.players.get(id);
    const kind = kindFromClass(classKey === 'soul' ? null : classKey);
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

    // орда
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
      const squash = 1 + Math.sin(this.time * 12 + e.id) * 0.05;
      d.scale.set(s, s * squash, s);
      d.updateMatrix();
      im.setMatrixAt(i, d.matrix);
      if (e.flash > 0) this.col.setRGB(5, 5, 5);
      else if (e.elite) this.col.setRGB(1.9, 1.5, 0.6);
      else if (e.slowUntil > run.t) this.col.setRGB(0.6, 1.1, 2.0);
      else this.col.setRGB(1, 1, 1);
      im.setColorAt(i, this.col);
    }
    Object.keys(this.enemyMeshes).forEach((k) => {
      const im = this.enemyMeshes[k];
      im.count = counts[k];
      im.instanceMatrix.needsUpdate = true;
      if (im.instanceColor) im.instanceColor.needsUpdate = true;
    });

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

    // снаряды
    const sc = {};
    Object.keys(this.shotMeshes).forEach((k) => { sc[k] = 0; });
    const putShot = (key, x, z, vx, vz, size, spin) => {
      const im = this.shotMeshes[key];
      if (!im || sc[key] >= SHOT_CAP) return;
      d.position.set(x, 0.9, z);
      if (spin) d.rotation.set(0, this.time * 18, 0);
      else d.rotation.set(0, Math.atan2(vx, vz), 0);
      d.scale.setScalar(size);
      d.updateMatrix();
      im.setMatrixAt(sc[key]++, d.matrix);
    };
    for (const p of run.projectiles) {
      const base = WEAPONS[p.w]?.base.size || 0.5;
      putShot(p.w, p.x, p.z, p.vx, p.vz, Math.max(0.6, p.size / base), p.w === 'war_axe' || p.w === 'orbit_skulls');
    }
    for (const s of run.visualShots) putShot(s.w, s.x, s.z, s.vx, s.vz, 1, s.w === 'war_axe' || s.w === 'orbit_skulls');
    for (const s of run.enemyShots) {
      const im = this.shotMeshes.enemy;
      if (sc.enemy >= 160) break;
      d.position.set(s.x, 0.8, s.z);
      d.rotation.set(this.time * 5, this.time * 4, 0);
      d.scale.setScalar(1);
      d.updateMatrix();
      im.setMatrixAt(sc.enemy++, d.matrix);
    }
    Object.keys(this.shotMeshes).forEach((k) => {
      this.shotMeshes[k].count = sc[k];
      this.shotMeshes[k].instanceMatrix.needsUpdate = true;
    });

    // эффекты
    let bi = 0;
    let zi = 0;
    const zp = this.zapLines.geometry.attributes.position;
    for (const f of run.fx) {
      if (f.kind === 'boom' && bi < this.boomPool.length) {
        const m = this.boomPool[bi++];
        const k = f.t / f.life;
        m.visible = true;
        m.position.set(f.x, 0.5, f.z);
        m.scale.setScalar(f.r * (0.4 + k * 0.7));
        m.scale.y *= 0.45;
        m.material.color.setHex(f.color || 0xf97316);
        m.material.opacity = 0.55 * (1 - k);
      } else if (f.kind === 'zap' && zi < 64) {
        zp.array.set([f.x, 0.9, f.z, f.x2, 0.9, f.z2], zi * 6);
        zi++;
      }
    }
    for (; bi < this.boomPool.length; bi++) this.boomPool[bi].visible = false;
    this.zapLines.geometry.setDrawRange(0, zi * 2);
    zp.needsUpdate = true;

    // герои
    const me = run.me;
    const meP = this.playerModel(run.myId, run.classKey, run.color, true);
    this.placePlayer(meP, me, dt, t, me.iframes > 0 && !me.dead && Math.floor(this.time * 20) % 2 === 0);
    this.meLight.position.set(me.x, 3, me.z);
    this.meRing.position.set(me.x, 0.04, me.z);
    this.magnetRing.position.set(me.x, 0.03, me.z);
    this.magnetRing.scale.setScalar(me.magnet || 2.4);
    const alive = new Set([run.myId]);
    for (const [id, r] of run.remotes) {
      alive.add(id);
      const p = this.playerModel(id, r.classKey || 'soul', r.color, false);
      this.placePlayer(p, r, dt, t, false);
      p.ch.group.visible = !r.stale;
    }
    for (const [id, p] of this.players) {
      if (!alive.has(id)) { this.root.remove(p.ch.group); this.players.delete(id); }
    }
  }

  placePlayer(p, s, dt, t, blink) {
    const g = p.ch.group;
    g.position.set(s.x, 0, s.z);
    p.ch.update(dt, !!s.moving && !s.dead, t, s.dirX || 0, s.dirZ ?? 1);
    g.rotation.z = s.dead ? Math.PI / 2.2 : 0;
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
