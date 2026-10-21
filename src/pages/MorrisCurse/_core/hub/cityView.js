// Город Альказак под куполом (server/meta/city.ts) — только отрисовка: купол (арт Историка, /workspace/city_dome → src/assets/mc/city),
// дома (стены + крыша, крыша гаснет, когда свой герой внутри), центральный объект площади (фонтан → позже статуя), места NPC,
// отталкивание убийцы (repel) и вспышка обода. Правила (урон 0, убийцы, мобы) — только сервер.
//
// Купол: 526 блоков обода 32×32 арт-px (1 арт-px = 1 px мира = 1/20 м), 16 кадров 8 fps + аддитивный glow; задняя дуга — 84 статичных блока;
// заливка — отдельный меш opacity 0.02 (ProjBatch отбрасывает a < 0.04). Позиция блока = якорь + world_offset_m (камера: right/up/forward
// из city_dome.json) — НЕ сдвиг по мировому Y, как FxAtlas.draw (квад к камере ужимается на cos p и блоки разъезжаются).
import { ProjBatch } from '../engine/projBatch.js';
import { loadAtlasTexture } from '../engine/spriteBatch.js';
import { toX, toZ } from '../engine/geometry.js';
import { NPC_ROWS, MOB_ROWS } from '../engine/pixSprites.js';
import { NPCS } from '../../../../../server/meta/shared.ts';
import { CITY_CFG, CITY_TILE } from '../../../../../server/meta/city.ts';
import { registerMarker } from '../../../../../server/meta/markers.ts';
import DOME from '../../../../assets/mc/city/city_dome.json';
import rimSrc from '../../../../assets/mc/city/city_dome_rim_0.png';
import rimGSrc from '../../../../assets/mc/city/city_dome_rim_0_glow.png';
import backSrc from '../../../../assets/mc/city/city_dome_back.png';
import fillSrc from '../../../../assets/mc/city/city_dome_fill_mask.png';
import repSrc from '../../../../assets/mc/city/city_dome_repel.png';
import repGSrc from '../../../../assets/mc/city/city_dome_repel_glow.png';
import flSrc from '../../../../assets/mc/city/city_dome_rim_flash.png';
import flGSrc from '../../../../assets/mc/city/city_dome_rim_flash_glow.png';

const PX = 20, BLOCK_M = 1.6, FLASH = DOME.sheets?.rim_flash?.alpha_curve_30fps || [0, 1, 0.85, 0.65, 0.45, 0.3, 0.18, 0.08, 0];
const MOBILE = /Mobi|Android|iPhone/i.test(globalThis.navigator?.userAgent || '');
const hex = (c, d = 0x8b5cf6) => (/^#[0-9a-f]{6}$/i.test(c || '') ? parseInt(c.slice(1), 16) : d);

export class CityView {
  constructor(THREE, root) {
    this.THREE = THREE; this.root = root; this.cfg = null; this.ready = false; this.time = 0; this.quality = 0;
    this.group = new THREE.Group(); this.group.name = 'city-alkazak'; root.add(this.group); this.group.visible = false;
    this.fx = []; this.flashAt = -9; this.houses = []; this.inside = false; this.inHouse = null; this.stats = { repel: 0 };
    this.glowOn = !MOBILE; // аддитивный слой обода (≈ треть видеопамяти купола): на телефонах — без него
    const L = (s) => loadAtlasTexture(THREE, s);
    const want = [rimSrc, backSrc, fillSrc, repSrc, flSrc, ...(this.glowOn ? [rimGSrc, repGSrc, flGSrc] : [])];
    Promise.all(want.map(L)).then((tx) => {
      const [rim, back, fill, rep, fl, rimG, repG, flG] = tx;
      for (const t of tx) { t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.generateMipmaps = false; t.needsUpdate = true; }
      const NB = DOME.b.length, NBB = DOME.bb.length;
      // порядок: задняя дуга → обод → glow; depthTest — персонажи перед передней дугой её закрывают
      this.back = new ProjBatch(THREE, back, { cols: 128, rows: 1, max: NBB, renderOrder: 6 });
      this.rim = new ProjBatch(THREE, rim, { cols: DOME.rim.cols, rows: DOME.rim.rows, max: NB, renderOrder: 7 });
      this.flash = new ProjBatch(THREE, fl, { cols: 128, rows: 5, max: NB, additive: true, renderOrder: 8 });
      this.rep = new ProjBatch(THREE, rep, { cols: 18, rows: 1, max: 16, renderOrder: 8 });
      if (rimG) { this.rimG = new ProjBatch(THREE, rimG, { cols: DOME.rim.cols, rows: DOME.rim.rows, max: NB, additive: true, renderOrder: 8 }); this.repG = new ProjBatch(THREE, repG, { cols: 18, rows: 1, max: 16, additive: true, renderOrder: 9 }); this.flashG = new ProjBatch(THREE, flG, { cols: 128, rows: 5, max: NB, additive: true, renderOrder: 9 }); }
      for (const b of [this.back, this.rim, this.flash, this.rep, this.rimG, this.repG, this.flashG]) if (b) { b.mesh.name = 'city-dome'; this.group.add(b.mesh); }
      // заливка 2 %: квад 102.5×95 м к камере (нормаль = −forward), центр на 3.75 м выше якоря по экрану
      const [w, h] = DOME.dome.size_m || [102.5, 95];
      this.fillMat = new THREE.MeshBasicMaterial({ map: fill, transparent: true, opacity: 0.02, depthWrite: false, depthTest: false, color: 0xffffff });
      this.fill = new THREE.Mesh(new THREE.PlaneGeometry(w, h), this.fillMat); this.fill.rotation.x = -Math.acos(DOME.cam.up[1]); this.fill.renderOrder = 6; this.fill.name = 'city-dome-fill';
      this.group.add(this.fill);
      this.ready = true; this.place();
    }).catch((e) => console.warn('[city]', e.message));
  }
  setQuality(level) { this.quality = level | 0; } // авто-качество (game.js): 2+ — без glow и вспышки
  /** zone_state.city: настройки отрисовки и места NPC (при входе и при правке в админке) */
  apply(c) {
    if (!c) return;
    const moved = !this.cfg || this.cfg.x !== c.x || this.cfg.y !== c.y || this.cfg.cp !== c.cp;
    this.cfg = c; Object.assign(CITY_CFG, { name: c.name, x: c.x, y: c.y, alphaIn: c.aIn, centerpiece: c.cp, plazaTiles: c.plaza, on: c.on });
    this.group.visible = !!c.on;
    if (this.fillMat) this.fillMat.opacity = Math.max(0, Math.min(1, Number(c.aIn) || 0.02));
    // места NPC: в общий реестр (диалог, ближайший NPC, отрисовка листом выбранного «вида»)
    for (const id of Object.keys(NPCS)) if (id.startsWith('city_')) NPCS[id].world = '-';
    for (const n of c.npc || []) { NPCS[n.id] = Object.assign(NPCS[n.id] || {}, { name: n.name, title: n.title, world: 'arinar', x: n.x, y: n.y, color: '#c4b5fd', role: 'city', mobile: true }); NPC_ROWS[n.id] = NPC_ROWS[n.look] ?? 6; MOB_ROWS[n.id] = MOB_ROWS[n.look] ?? MOB_ROWS.petr; }
    registerMarker({ id: 'city:alkazak', type: 'sign', world: 'arinar', x: c.x, y: c.y - 60, icon: '🏰', label: `${c.name || 'Альказак'} — город под куполом · без сражений` });
    if (moved) this.place();
  }
  place() {
    const c = this.cfg; if (!c) return;
    this.ax = toX(c.x); this.az = toZ(c.y);
    if (this.fill) { const u = DOME.cam.up; this.fill.position.set(this.ax + 0, u[1] * 3.75, this.az + u[2] * 3.75); }
    this.buildHouses(); this.buildCenter();
  }
  // дома — пропсы dm_house_* с интерьерами (server/meta/cityBuild.ts, hub/cityRoom.js); раскладка/отрисовка — этап арта
  buildHouses() {}
  // ——— центральный объект площади: фонтан (заглушка-меш до арта) / статуя (зарезервировано) / пусто ———
  buildCenter() {
    const THREE = this.THREE;
    if (this.center) { this.group.remove(this.center); this.center.traverse((o) => o.geometry?.dispose?.()); this.center = null; }
    const kind = this.cfg.cp || 'fountain'; if (kind === 'none') return;
    const g = new THREE.Group(); g.name = 'city-center ' + kind; const stone = new THREE.MeshBasicMaterial({ color: 0x5b5566 }), dark = new THREE.MeshBasicMaterial({ color: 0x38323f });
    const T = CITY_TILE, cx = toX((Math.floor(this.cfg.x / T) + 0.5) * T), cz = toZ((Math.floor(this.cfg.y / T) + 0.5) * T);
    if (kind === 'fountain') {
      const rim = new THREE.Mesh(new THREE.CylinderGeometry(2.5, 2.7, 0.6, 20, 1, true), stone); rim.position.y = 0.3; g.add(rim);
      const lip = new THREE.Mesh(new THREE.TorusGeometry(2.55, 0.18, 6, 24), dark); lip.rotation.x = Math.PI / 2; lip.position.y = 0.6; g.add(lip);
      this.waterMat = new THREE.MeshBasicMaterial({ color: 0x3b2f6b, transparent: true, opacity: 0.92 });
      const water = new THREE.Mesh(new THREE.CircleGeometry(2.45, 24), this.waterMat); water.rotation.x = -Math.PI / 2; water.position.y = 0.48; g.add(water);
      const col = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.5, 1.8, 10), stone); col.position.y = 0.9; g.add(col);
      const bowl = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 0.45, 0.35, 14), stone); bowl.position.y = 1.85; g.add(bowl);
      this.jetMat = new THREE.MeshBasicMaterial({ color: 0xc46ad8, transparent: true, opacity: 0.55, depthWrite: false });
      const jet = new THREE.Mesh(new THREE.ConeGeometry(0.22, 1.1, 8), this.jetMat); jet.position.y = 2.55; g.add(jet); this.jet = jet;
    } else { // статуя: постамент и закрытый силуэт под тканью (место зарезервировано)
      const ped = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.9, 2.4), stone); ped.position.y = 0.45; g.add(ped);
      const cloth = new THREE.Mesh(new THREE.ConeGeometry(0.9, 3.2, 7), new THREE.MeshBasicMaterial({ color: 0x2b2438 })); cloth.position.y = 2.5; g.add(cloth);
    }
    g.position.set(cx, 0, cz); this.group.add(g); this.center = g;
  }
  /** игрок упёрся в купол (сервер не пустил): отталкивание в точке на ободе, повернуто наружу */
  repel(px, py) {
    if (!this.cfg) return; const dx = px - this.cfg.x, dy = py - this.cfg.y, L = Math.hypot(dx, dy) || 1;
    this.fx.push({ x: this.cfg.x + (dx / L) * this.cfg.r, y: this.cfg.y + (dy / L) * this.cfg.r, dx: dx / L, dy: dy / L, t: 0 });
    if (this.time - this.flashAt > 0.3) this.flashAt = this.time; this.stats.repel++;
  }
  inCity(px, py) { const c = this.cfg; return !!(c && c.on && (px - c.x) ** 2 + (py - c.y) ** 2 <= c.r * c.r); }
  /** кадр: view = фокус камеры (свой герой) */
  update(dt, view) {
    this.time += dt; const T = this.time, c = this.cfg;
    if (!c || !c.on || !this.ready) return;
    const near = view && Math.abs(view.x - c.x) < c.r + 2600 && Math.abs(view.y - c.y) < c.r + 2600;
    this.group.visible = !!near; if (!near) return;
    const ax = this.ax, az = this.az, f = Math.floor(T * (DOME.rim.fps || 8)) % (DOME.rim.frames || 16), F = DOME.rim.frames || 16, cols = DOME.rim.cols || 128;
    const glow = this.glowOn && this.quality < 2;
    this.back.begin(); for (const [i, ox, oy, oz] of DOME.bb) this.back.push(ax + ox, oy, az + oz, BLOCK_M, BLOCK_M, 0, 0, 0, 0, i % 128, 0); this.back.end();
    this.rim.begin(); this.rimG?.begin();
    for (const [loc, ox, oy, oz] of DOME.b) { const t = loc * F + f, col = t % cols, row = Math.floor(t / cols);
      this.rim.push(ax + ox, oy, az + oz, BLOCK_M, BLOCK_M, 0, 0, 0, 0, col, row);
      if (glow) this.rimG?.push(ax + ox, oy, az + oz, BLOCK_M, BLOCK_M, 0, 0, 0, 0, col, row, 1, 1, 1, 0.75); }
    this.rim.end(); this.rimG?.end();
    // вспышка обода при отталкивании: 0.3 с по кривой (30 fps)
    const fk = Math.floor((T - this.flashAt) * 30), fa = fk >= 0 && fk < FLASH.length ? FLASH[fk] : 0;
    this.flash.begin(); this.flashG?.begin();
    if (fa > 0 && this.quality < 2) DOME.b.forEach(([, ox, oy, oz], i) => { this.flash.push(ax + ox, oy, az + oz, BLOCK_M, BLOCK_M, 0, 0, 0, 0, i % 128, Math.floor(i / 128), 1, 1, 1, fa); if (glow) this.flashG?.push(ax + ox, oy, az + oz, BLOCK_M, BLOCK_M, 0, 0, 0, 0, i % 128, Math.floor(i / 128), 1, 1, 1, fa * 0.7); });
    this.flash.end(); this.flashG?.end();
    // отталкивание: 18 кадров 30 fps, квад 9.6 м, mode 1 по направлению наружу
    this.rep.begin(); this.repG?.begin();
    for (let i = this.fx.length - 1; i >= 0; i--) { const e = this.fx[i]; e.t += dt; const k = Math.floor(e.t * 30); if (k >= 18) { this.fx.splice(i, 1); continue; }
      this.rep.push(toX(e.x), 0.8, toZ(e.y), 9.6, 9.6, 1, 0, e.dx, e.dy, k, 0); if (glow) this.repG?.push(toX(e.x), 0.8, toZ(e.y), 9.6, 9.6, 1, 0, e.dx, e.dy, k, 0); }
    this.rep.end(); this.repG?.end();
    this.fillMat.opacity = Math.max(0, (Number(c.aIn) || 0.02) + 0.005 * Math.sin(2 * Math.PI * T / 4));
    // фонтан «бьёт»
    if (this.jet) { this.jet.scale.y = 1 + 0.18 * Math.sin(T * 6); this.jetMat.opacity = 0.45 + 0.15 * Math.sin(T * 9); this.waterMat.color.setHSL(0.72, 0.4, 0.28 + 0.03 * Math.sin(T * 2.1)); }
  }
  debug() { return this.cfg ? { on: this.cfg.on, name: this.cfg.name, x: this.cfg.x, y: this.cfg.y, r: this.cfg.r, ready: this.ready, glow: !!this.rimG, inHouse: this.inHouse, houses: this.houses.length, center: this.center?.name || null, repel: this.stats.repel, npc: (this.cfg.npc || []).length } : null; }
}
