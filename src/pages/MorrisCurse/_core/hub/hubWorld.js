// Хаб (Мир Адского Пламени / Аринар) в 3D: тайлы карты, порталы, игроки сервера, Кейт, Дар, цветы.
// Логика позиций — в пикселях сервера (0..1200), отрисовка — в метрах (1 м = 20 px).
import { WorldMapManager } from '../worlds/worldMap.js';
import { HellfireEnvironment } from '../worlds/hellfire.js';
import { ArinarSpaceEnvironment } from '../worlds/arinarSpace.js';
import { makePortal, makeFlower } from '../engine/models.js';
import { createCharacter, kindFromClass } from '../engine/characters.js';
import { toX, toZ } from '../engine/geometry.js';

export class HubWorld {
  constructor(THREE, stage) {
    this.THREE = THREE;
    this.stage = stage;
    this.root = new THREE.Group();
    this.root.name = 'hub';
    this.map = new WorldMapManager(32);
    this.envs = { hellfire: new HellfireEnvironment(), arinar: new ArinarSpaceEnvironment() };
    this.world = null;
    this.portalObjs = new Map();
    this.chars = new Map(); // key → {ch, kind}
    this.flowerObjs = new Map();
    this.time = 0;
    this.attached = false;
  }

  attach() {
    if (!this.attached) { this.stage.scene.add(this.root); this.attached = true; }
    if (this.env) this.stage.setEnvironment(this.env);
  }

  detach() {
    if (this.attached) { this.stage.scene.remove(this.root); this.attached = false; }
  }

  setWorld(world, portals, force = false) {
    const THREE = this.THREE;
    const w = world === 'arinar' ? 'arinar' : (world || 'hellfire');
    if (w === this.world && !force) { this.setPortals(portals); return; }
    this.world = w;
    this.map.switchWorld(w);
    if (this.envGroup) this.root.remove(this.envGroup);
    this.env = this.envs[w === 'arinar' ? 'arinar' : 'hellfire'];
    this.envGroup = this.env.build(THREE);
    this.root.add(this.envGroup);
    this.rebuildTiles();
    this.portalSig = '';
    this.setPortals(portals);
    if (this.attached) this.stage.setEnvironment(this.env);
    for (const f of this.flowerObjs.values()) this.root.remove(f.group);
    this.flowerObjs.clear();
  }

  rebuildTiles(showCollision = false) {
    if (this.tilesGroup) this.root.remove(this.tilesGroup);
    this.tilesGroup = this.map.build3D(this.THREE, showCollision);
    this.root.add(this.tilesGroup);
  }

  setPortals(portals) {
    const list = (portals || []).filter((p) => (p.world || 'hellfire') === this.world);
    const sig = list.map((p) => p.id + p.x + p.y).join('|');
    if (sig === this.portalSig) return;
    this.portalSig = sig;
    for (const o of this.portalObjs.values()) this.root.remove(o.group);
    this.portalObjs.clear();
    list.forEach((p) => {
      const o = makePortal(this.THREE, p);
      o.group.position.set(toX(p.x), 0, toZ(p.y));
      o.portal = p;
      this.root.add(o.group);
      this.portalObjs.set(p.id, o);
    });
  }

  // Персонаж по ключу (игрок/босс). Пересоздаётся при смене класса.
  character(key, kind, tint) {
    let c = this.chars.get(key);
    if (c && c.kind === kind) return c;
    if (c) this.root.remove(c.ch.group);
    const ch = createCharacter(this.THREE, kind, tint);
    this.root.add(ch.group);
    c = { ch, kind, used: true };
    this.chars.set(key, c);
    return c;
  }

  // анимация атаки своего героя (кадры замаха/удара 2.5D-листа)
  attackMe() { this.chars.get('__me')?.ch.attack?.(); }

  // state: { me:{x,y,dirX,dirY,moving,classId,color,blink,dash}, others:[...], boss, dar, flowers:Map }
  update(dt, state) {
    this.time += dt;
    this.env?.update(dt);
    for (const o of this.portalObjs.values()) o.update(this.time);
    this.tilesGroup?.children.forEach((c) => { if (c.userData.spin) c.rotation.y += dt * 1.5; });
    for (const c of this.chars.values()) c.used = false;

    const place = (key, kind, s, tint) => {
      const c = this.character(key, kind, tint);
      c.used = true;
      c.ch.group.position.set(toX(s.x), 0, toZ(s.y));
      c.ch.update(dt, !!s.moving, this.time, s.dirX || 0, s.dirY ?? 1);
      c.ch.group.visible = !s.blink;
      c.ch.group.scale.setScalar(s.scale || 1);
      return c;
    };

    const me = state.me;
    place('__me', kindFromClass(me.classId, me.look), me, me.color);
    (state.others || []).forEach((p) => {
      place('p_' + p.key, kindFromClass(p.stats?.classId, p.look || p.stats?.look), { x: p.x, y: p.y, dirX: p.dirX, dirY: p.dirY, moving: p.moving, blink: p.blink }, p.color);
    });
    if (state.boss && state.boss.state !== 'dead') place('boss_keyt', 'keyt', state.boss);
    if (state.dar && state.dar.state !== 'dead') place('boss_dar', 'dar', state.dar);
    for (const [k, c] of this.chars) {
      if (!c.used) { this.root.remove(c.ch.group); this.chars.delete(k); }
    }

    // цветы
    const flowers = state.flowers || new Map();
    for (const fl of flowers.values()) {
      let f = this.flowerObjs.get(fl.id);
      if (!f) {
        f = makeFlower(this.THREE);
        this.root.add(f.group);
        this.flowerObjs.set(fl.id, f);
        f.group.position.set(toX(fl.x), 0, toZ(fl.y));
      }
      f.set(fl);
      const tx = toX(fl.x), tz = toZ(fl.y);
      const moving = Math.hypot(tx - f.group.position.x, tz - f.group.position.z) > 0.03;
      f.group.position.x += (tx - f.group.position.x) * Math.min(1, dt * 12);
      f.group.position.z += (tz - f.group.position.z) * Math.min(1, dt * 12);
      f.update(dt, moving, this.time);
    }
    for (const [id, f] of this.flowerObjs) {
      if (!flowers.has(id)) { this.root.remove(f.group); this.flowerObjs.delete(id); }
    }
  }
}
