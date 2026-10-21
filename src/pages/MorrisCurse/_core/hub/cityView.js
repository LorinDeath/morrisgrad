// Город Альказак под куполом (server/meta/city.ts) — только отрисовка: купол (арт Историка, /workspace/city_dome → src/assets/mc/city),
// дома (стены + крыша, крыша гаснет, когда свой герой внутри), центральный объект площади (фонтан → позже статуя), места NPC,
// отталкивание убийцы (repel) и вспышка обода. Правила (урон 0, убийцы, мобы) — только сервер.
//
// Купол: 526 блоков обода 32×32 арт-px (1 арт-px = 1 px мира = 1/20 м), 16 кадров 8 fps + аддитивный glow; задняя дуга — 84 статичных блока;
// заливка — отдельный меш opacity 0.02 (ProjBatch отбрасывает a < 0.04). Позиция блока = якорь + world_offset_m (камера: right/up/forward
// из city_dome.json) — НЕ сдвиг по мировому Y, как FxAtlas.draw (квад к камере ужимается на cos p и блоки разъезжаются).
import { lightOf, lampHash, FIRE, flickerOf, LT } from '../engine/dayNight.js';
import { emitterOffsetM, emitterSpotsM, emitterWorld, emitterBasis } from '../engine/lightEmitter.js';
import { ProjBatch } from '../engine/projBatch.js';
import { loadAtlasTexture } from '../engine/spriteBatch.js';
import { toX, toZ } from '../engine/geometry.js';
import { NPC_ROWS, MOB_ROWS } from '../engine/pixSprites.js';
import { NPCS } from '../../../../../server/meta/shared.ts';
import { CITY_CFG, CITY_TILE } from '../../../../../server/meta/city.ts';
import { registerMarker } from '../../../../../server/meta/markers.ts';
import DOME from '../../../../assets/mc/city/city_dome.json';
import PROPS from '../../../../assets/mc/city/props_dark_atlas.json';
import BLD from '../../../../assets/mc/city/buildings.json';
import p32Src from '../../../../assets/mc/city/props_dark_p32.png';
import fenceVSrc from '../../../../assets/mc/city/fence_v.png'; // вертикальный забор (tools/city-fence/gen.py) — до арта Художника
import p32GSrc from '../../../../assets/mc/city/props_dark_p32_glow.png';
import b64Src from '../../../../assets/mc/city/props_dark_b64.png';
import b64GSrc from '../../../../assets/mc/city/props_dark_b64_glow.png';
import { MAP, mapProps, mapShiftPx } from '../../../../../server/meta/cityMap.ts';
import rimSrc from '../../../../assets/mc/city/city_dome_rim_0.png';
import rimGSrc from '../../../../assets/mc/city/city_dome_rim_0_glow.png';
import backSrc from '../../../../assets/mc/city/city_dome_back.png';
import shellSrc from '../../../../assets/mc/city/city_dome_shell_q4.png';
import repSrc from '../../../../assets/mc/city/city_dome_repel.png';
import repGSrc from '../../../../assets/mc/city/city_dome_repel_glow.png';
import flSrc from '../../../../assets/mc/city/city_dome_rim_flash.png';
import flGSrc from '../../../../assets/mc/city/city_dome_rim_flash_glow.png';

const BLD_SRC = import.meta.glob('../../../../assets/mc/city/bld_*.png', { eager: true, query: '?url', import: 'default' });
const bldUrl = (f) => BLD_SRC[`../../../../assets/mc/city/${f}`] || null;
const SIN_P = Math.sin(1.02); // камера 58°: арт 3/4 (1 px = 1 px мира на экране) → высота спрайта × sin(pitch), основание совпадает с землёй
const PX = 20, BLOCK_M = 1.6, FLASH = DOME.sheets?.rim_flash?.alpha_curve_30fps || [0, 1, 0.85, 0.65, 0.45, 0.3, 0.18, 0.08, 0];
const RIM = DOME.sheets?.rim || { cols: 128, frames: 16, fps: 8 }, RIM0 = DOME.sheets?.rim_0 || { cols: 128, rows: 74 }, SHELL = DOME.sheets?.shell || null, REP = DOME.sheets?.repel || { cols: 18, frames: 18, fps: 30, size_m: [9.6, 9.6] };
const sstep = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const MOBILE = /Mobi|Android|iPhone/i.test(globalThis.navigator?.userAgent || '');
const hex = (c, d = 0x8b5cf6) => (/^#[0-9a-f]{6}$/i.test(c || '') ? parseInt(c.slice(1), 16) : d);

export class CityView {
  constructor(THREE, root) {
    this.THREE = THREE; this.root = root; this.cfg = null; this.ready = false; this.time = 0; this.quality = 0;
    this.group = new THREE.Group(); this.group.name = 'city-alkazak'; root.add(this.group); this.group.visible = false;
    this.fx = []; this.flashAt = -9; this.houses = []; this.inside = false; this.inHouse = null; this.stats = { repel: 0 };
    this.glowOn = !MOBILE; // аддитивный слой обода (≈ треть видеопамяти купола): на телефонах — без него
    const L = (s) => loadAtlasTexture(THREE, s);
    const want = [rimSrc, backSrc, shellSrc, repSrc, flSrc, ...(this.glowOn ? [rimGSrc, repGSrc, flGSrc] : [])];
    this.shellA = SHELL?.opacity_outside ?? 0.9; // текущая непрозрачность оболочки (плавно к цели)
    Promise.all(want.map(L)).then((tx) => {
      const [rim, back, shell, rep, fl, rimG, repG, flG] = tx;
      for (const t of tx) { t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.generateMipmaps = false; t.needsUpdate = true; }
      const NB = DOME.b.length, NBB = DOME.bb.length;
      // порядок (README купола): оболочка → задняя дуга → обод → glow; depthTest — персонажи перед передней дугой её закрывают
      this.back = new ProjBatch(THREE, back, { cols: DOME.sheets?.back?.cols || 128, rows: 1, max: NBB, renderOrder: 6 });
      this.rim = new ProjBatch(THREE, rim, { cols: RIM0.cols, rows: RIM0.rows, max: NB, renderOrder: 7 });
      this.flash = new ProjBatch(THREE, fl, { cols: DOME.sheets?.rim_flash?.cols || 128, rows: DOME.sheets?.rim_flash?.rows || 5, max: NB, additive: true, renderOrder: 8 });
      this.rep = new ProjBatch(THREE, rep, { cols: REP.cols, rows: 1, max: 16, renderOrder: 8 });
      if (rimG) { this.rimG = new ProjBatch(THREE, rimG, { cols: RIM0.cols, rows: RIM0.rows, max: NB, additive: true, renderOrder: 8 }); this.repG = new ProjBatch(THREE, repG, { cols: REP.cols, rows: 1, max: 16, additive: true, renderOrder: 9 }); this.flashG = new ProjBatch(THREE, flG, { cols: DOME.sheets?.rim_flash?.cols || 128, rows: DOME.sheets?.rim_flash?.rows || 5, max: NB, additive: true, renderOrder: 9 }); }
      for (const b of [this.back, this.rim, this.flash, this.rep, this.rimG, this.repG, this.flashG]) if (b) { b.mesh.name = 'city-dome'; this.group.add(b.mesh); }
      // оболочка — ОТДЕЛЬНЫЙ меш (ProjBatch отбрасывает a < 0.04, а изнутри нужно 0.02): квад к камере, 16 кадров 8 fps,
      // снаружи 0.9 / изнутри 0.02, переход плавный (экспонента 0.25 с ≈ 0.6–0.8 с). Центр = якорь + world_offset_m
      if (SHELL) {
        shell.repeat.set(1 / SHELL.cols, 1 / SHELL.rows);
        const [w, h] = SHELL.size_m;
        this.shellMat = new THREE.MeshBasicMaterial({ map: shell, transparent: true, opacity: this.shellA, depthTest: true, depthWrite: false, fog: false });
        this.shell = new THREE.Mesh(new THREE.PlaneGeometry(w, h), this.shellMat); this.shell.renderOrder = 5; this.shell.name = 'city-dome-shell';
        this.shell.rotation.x = Math.atan2(DOME.cam.up[2], DOME.cam.up[1]); // плоскость: «вверх» = cam.up, нормаль = −forward (к камере)
        this.group.add(this.shell);
      }
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
    // места NPC: в общий реестр (диалог, ближайший NPC, отрисовка листом выбранного «вида»)
    for (const id of Object.keys(NPCS)) if (id.startsWith('city_')) NPCS[id].world = '-';
    for (const n of c.npc || []) { NPCS[n.id] = Object.assign(NPCS[n.id] || {}, { name: n.name, title: n.title, world: 'arinar', x: n.x, y: n.y, color: '#c4b5fd', role: 'city', mobile: true }); NPC_ROWS[n.id] = NPC_ROWS[n.look] ?? 6; MOB_ROWS[n.id] = MOB_ROWS[n.look] ?? MOB_ROWS.petr; }
    registerMarker({ id: 'city:alkazak', type: 'sign', world: 'arinar', x: c.x, y: c.y - 60, icon: '🏰', label: `${c.name || 'Альказак'} — город под куполом · без сражений` });
    if (moved) this.place();
  }
  place() {
    const c = this.cfg; if (!c) return;
    this.ax = toX(c.x); this.az = toZ(c.y);
    if (this.shell) { const o = SHELL.world_offset_m; this.shell.position.set(this.ax + o[0], o[1], this.az + o[2]); }
    this.buildHouses(); this.buildCenter(); this.buildMap(); this.buildBlight();
  }
  buildHouses() {}
  // ——— карта Историка: здания bld_* (+glow) и пропсы dm_* (+glow, анимации) — спрайты к камере, якорь — низ по центру ———
  buildMap() {
    const THREE = this.THREE, c = this.cfg; if (!c) return;
    const sig = `${c.x},${c.y},${c.rTiles}`; if (this.mapSig === sig) return; this.mapSig = sig;
    if (this.mapG) { this.group.remove(this.mapG); this.mapG.traverse((o) => { if (o.material) { o.material.map?.dispose?.(); o.material.dispose?.(); } }); }
    const g = new THREE.Group(); g.name = 'city-map'; this.mapG = g; this.group.add(g); this.anim = [];
    const gg = new THREE.Group(); gg.name = 'city-glow'; g.add(gg); this.glowG = gg; this.glows = []; this.lights = []; this.halos = [];
    // ореол огня: мягкое тёплое пятно (за спрайтом), в точке излучения (engine/lightEmitter.js — центроид _glow)
    const haloTex = this._haloTex ||= (() => { const cv = document.createElement('canvas'); cv.width = cv.height = 64; const x = cv.getContext('2d'), gr = x.createRadialGradient(32, 32, 0, 32, 32, 32);
      gr.addColorStop(0, 'rgba(255,255,255,0.95)'); gr.addColorStop(0.18, 'rgba(255,255,255,0.55)'); gr.addColorStop(0.5, 'rgba(255,255,255,0.16)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = gr; x.fillRect(0, 0, 64, 64);
      const t = new THREE.CanvasTexture(cv); return t; })();
    // огонь: q = [x0, z0, цвет, радиус пятна м, сила, -, хэш, смещение огня [вправо, вверх] м, живой огонь, мерцание] (формат маски dayNight)
    const addLight = (x0, z0, col, rM, k, off, fire, haloM, kind = fire ? 'fire' : 'lamp') => {
      const h = lampHash(x0, z0); this.lights.push([x0, z0, col, rM, k, 0, h, off, fire, 1]);
      const m = new THREE.SpriteMaterial({ map: haloTex, color: col, transparent: true, depthWrite: false, depthTest: true, blending: THREE.AdditiveBlending, fog: false, opacity: 0 });
      const sp = new THREE.Sprite(m); sp.scale.set(haloM, haloM, 1); sp.renderOrder = 2; gg.add(sp);
      this.glows.push({ m, lamp: true, h, halo: true, fire, kind, x0, z0, off, sp, haloM, k });
    }; // свечение (_glow) отдельно: ночью рисуется ещё раз поверх маски темноты (game.js)
    const L = (src) => (this._tex ||= {})[src] ||= loadAtlasTexture(THREE, src).then((t) => { t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.generateMipmaps = false; t.needsUpdate = true; return t; });
    const sprite = (base, glow, fr, cols, rows, col, row, wM, hM, x, y, flip, an = [0.5, 1], frames = 1, fps = 0, lamp = false, kind = 'lamp') => {
      const mk = (tp, add) => tp.then((t0) => {
        const t = t0.clone(); t.needsUpdate = true; t.repeat.set((flip ? -1 : 1) / cols, 1 / rows); t.offset.set((col + (flip ? 1 : 0)) / cols, 1 - (row + 1) / rows);
        const m = new THREE.SpriteMaterial({ map: t, transparent: true, alphaTest: add ? 0 : 0.04, depthWrite: !add, blending: add ? THREE.AdditiveBlending : THREE.NormalBlending, fog: false });
        const sp = new THREE.Sprite(m); sp.center.set(an[0], 1 - an[1]); sp.scale.set(wM, hM * SIN_P, 1); sp.position.set(toX(x), add ? 0.02 : 0, toZ(y) + (add ? 0.01 : 0)); sp.renderOrder = add ? 4 : 3;
        (add ? gg : g).add(sp); if (add) this.glows.push({ m, lamp, kind, h: lampHash(toX(x), toZ(y)) }); if (frames > 1) this.anim.push({ t, cols, col, row, rows, frames, fps, flip, ph: (x * 7 + y * 3) % 1000 / 1000 });
      });
      mk(L(base), false); if (glow && this.glowOn) mk(L(glow), true);
    };
    // здания: картинка целиком (основание + крыша), ширина footprint·32 px
    const [sx, sy] = mapShiftPx();
    for (const b of MAP.buildings || []) {
      const k = BLD.keys?.[b.key]; const src = k && bldUrl(k.image); if (!src) continue;
      sprite(src, k.glow ? bldUrl(k.glow) : null, 0, 1, 1, 0, 0, k.w / PX, k.h / PX, b.anchor_world_px[0] + sx, b.anchor_world_px[1] + sy, false, k.anchor || [0.5, 1], 1, 0, true, 'window');
      { const x0 = toX(b.anchor_world_px[0] + sx), z0 = toZ(b.anchor_world_px[1] + sy), tav = b.interior === 'shop_tavern';
        for (const sp of emitterSpotsM(b.key, { wM: k.w / PX, hM: (k.h / PX) * SIN_P, max: tav ? 6 : 3 })) addLight(x0, z0, 0xffc477, 1.6 + Math.min(1.4, sp[2] / 40), 0.62, [sp[0], sp[1]], false, 1.5 + Math.min(1.5, sp[2] / 30), 'window');
        const e = b.exit_world_px; if (e) addLight(toX(e[0] + sx), toZ(e[1] + sy - 10), 0xffc879, tav ? 4.4 : 3.4, 0.8, [0, 0.9], false, tav ? 3.2 : 2.6, 'door'); } // дверь: проём над порогом // окна — «огни»: загораются вразнобой
    }
    // пропсы dm_*
    const SH = { p32: p32Src, b64: b64Src, p32_glow: p32GSrc, b64_glow: b64GSrc };
    // вертикальный забор (cityMap.fenceRuns): столбы — спрайты (колышек dm_fence без перекладин); жерди — 3D-полосы ОТ столба ДО столба
    //   (одна, 8…12 арт-px над землёй — две жерди вдоль глубины на экране почти совпадают и рябят; темнее и тоньше столба, вдоль «вверх» камеры как у спрайтов), поэтому в перспективе колонна
    //   не ломается лесенкой и жердь всегда упирается в соседний столб / крайний колышек пролёта. Вершины — в update (базис камеры)
    const fenceV = (p) => L(fenceVSrc).then((t0) => {
      const t = t0.clone(); t.needsUpdate = true; t.repeat.set(7 / 12, 1); t.offset.set(0, 0);
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, alphaTest: 0.04, fog: false }));
      sp.center.set(0.5, 0); sp.scale.set(0.7, 1.8 * SIN_P, 1); sp.position.set(toX(p.x), 0, toZ(p.y)); sp.renderOrder = 3; sp.name = p.k; g.add(sp); });
    const rails = [];
    for (const p of mapProps(c.rTiles)) {
      if (p.k === 'dm_fence_vpost') { fenceV(p); continue; }
      if (p.k === 'dm_fence_vrail') { rails.push([toX(p.x), toZ(p.y), toZ(p.y - (p.len || 64))]); continue; }
      const k = PROPS.keys?.[p.k]; if (!k) continue; const S = PROPS.sheets[k.sheet]; if (!S) continue;
      const [wM, hM] = k.size_m || [k.w / 10, k.h / 10];
      sprite(SH[k.sheet], k.glow ? SH[k.glow.sheet] : null, 0, S.cols, S.rows, k.col, k.row, wM * (p.s || 1), hM * (p.s || 1), p.x, p.y, !!p.f, k.anchor || [0.5, 1], k.frames || 1, k.fps || 0, !!lightOf(p.k), FIRE.test(p.k) ? 'fire' : 'lamp');
      const Lp = lightOf(p.k); if (Lp) { const sc = p.s || 1, off = emitterOffsetM(p.k, { wM: wM * sc, hM: hM * sc * SIN_P, flip: !!p.f, set: 'city' }) || [0, (Lp[4] || 1) * SIN_P], fire = FIRE.test(p.k);
        addLight(toX(p.x), toZ(p.y), Lp[1], Lp[2] * sc, Lp[3], off, fire, (fire ? 3.4 : 2.6) * sc); }
    }
    this.fenceRails = null; if (rails.length) L(fenceVSrc).then((t0) => {
      const t = t0.clone(); t.needsUpdate = true; t.repeat.set(4 / 12, 4 / 18); t.offset.set(7 / 12, 1 - 4 / 18);
      const n = rails.length, pos = new Float32Array(n * 12), uv = new Float32Array(n * 8), idx = [];
      for (let i = 0; i < n; i++) { uv.set([0, 0, 1, 0, 1, 1, 0, 1], i * 8); const o = i * 4; idx.push(o, o + 1, o + 2, o, o + 2, o + 3); }
      const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); geo.setIndex(idx);
      const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: t, color: 0xa09088, transparent: true, alphaTest: 0.04, side: THREE.DoubleSide, fog: false }));
      mesh.name = 'city-fence-rails'; mesh.renderOrder = 3; mesh.frustumCulled = false; g.add(mesh); this.fenceRails = { mesh, rails, sig: '' }; this.stats.fenceRails = rails.length;
    });
    this.stats.props = (MAP.props || []).length; this.stats.buildings = (MAP.buildings || []).length;
  }
  // ——— пятно порчи под розой города: очернённая проклятая земля расползается в траву (рваный край, тёмные жилы, искры).
  //      Только вид — механики проклятия нет (city.ts noCurseIn). Пиксель-арт: 1 арт-px = 2 px мира, сид — позиция розы ———
  buildBlight() {
    const THREE = this.THREE, r = this.cfg?.rose; if (!r) return;
    const sig = `${r.x},${r.y}`; if (this.blightSig === sig && this.blightG?.parent === this.group) return; this.blightSig = sig; // группа города пересобирается — пятно вешаем заново
    if (this.blightG) { this.blightG.parent?.remove(this.blightG); this.blightG.traverse((o) => { o.material?.map?.dispose?.(); o.material?.dispose?.(); }); }
    let seed = (Math.round(r.x) * 73856093) ^ (Math.round(r.y) * 19349663); const rnd = () => { seed = (seed * 1664525 + 1013904223) | 0; return ((seed >>> 8) & 0xffffff) / 0x1000000; };
    const W = 72, H = 64, cx = W / 2, cy = H / 2 + 2;
    const lat = Array.from({ length: 9 * 9 }, rnd), vn = (x, y) => { // значение-шум на решётке 8×8 (гладко)
      const gx = Math.min(7.999, Math.max(0, x)), gy = Math.min(7.999, Math.max(0, y)), i = Math.floor(gx), j = Math.floor(gy), fx = gx - i, fy = gy - j, sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
      const a = lat[j * 9 + i], b = lat[j * 9 + i + 1], c = lat[(j + 1) * 9 + i], d = lat[(j + 1) * 9 + i + 1]; return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy; };
    const lat2 = Array.from({ length: 17 * 17 }, rnd), vn2 = (x, y) => { const gx = Math.min(15.999, Math.max(0, x)), gy = Math.min(15.999, Math.max(0, y)), i = Math.floor(gx), j = Math.floor(gy), fx = gx - i, fy = gy - j;
      const a = lat2[j * 17 + i], b = lat2[j * 17 + i + 1], c = lat2[(j + 1) * 17 + i], d = lat2[(j + 1) * 17 + i + 1]; return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy; };
    const field = (x, y) => { const dx = (x - cx) / (W * 0.40), dy = (y - cy) / (H * 0.40), d = Math.hypot(dx, dy); return 1 - d + (vn(x / W * 8, y / H * 8) - 0.5) * 0.55 + (vn2(x / W * 16, y / H * 16) - 0.5) * 0.22; };
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H; const g = cv.getContext('2d'); const img = g.createImageData(W, H), D = img.data;
    const put = (x, y, c, a = 255) => { if (x < 0 || y < 0 || x >= W || y >= H) return; const k = (y * W + x) * 4; D[k] = c[0]; D[k + 1] = c[1]; D[k + 2] = c[2]; D[k + 3] = Math.max(D[k + 3], a); };
    const CORE = [11, 7, 16], MID = [24, 14, 30], EDGE = [38, 26, 40], ROT = [36, 34, 24], VEIN = [40, 16, 50], VEIN2 = [62, 22, 78];
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const f = field(x, y), dth = ((x * 7 + y * 13) % 4) / 4; // упорядоченный дизеринг края — пиксель-арт без размытия
      if (f > 0.62) put(x, y, CORE); else if (f > 0.47) put(x, y, (f - 0.47) / 0.15 > dth ? CORE : MID); else if (f > 0.37) put(x, y, (f - 0.37) / 0.1 > dth ? MID : EDGE);
      else if (f > 0.3 && dth < (f - 0.3) / 0.07 * 0.6) put(x, y, rnd() < 0.35 ? ROT : EDGE, 210); // рваный край: клочья гнили в траве
    }
    const veins = 7 + Math.floor(rnd() * 3), sparks = [];
    for (let v = 0; v < veins; v++) { // жилы: от сердца наружу, за край пятна — в траву
      let a = (v / veins) * Math.PI * 2 + (rnd() - 0.5) * 0.6, x = cx + Math.cos(a) * 6, y = cy + Math.sin(a) * 5; const len = 14 + rnd() * 14;
      for (let t = 0; t < len; t++) { a += (rnd() - 0.5) * 0.5; x += Math.cos(a); y += Math.sin(a) * 0.88; const f = field(x | 0, y | 0); put(x | 0, y | 0, t < len * 0.45 ? VEIN2 : VEIN, f > 0.3 ? 255 : 200);
        if (t > 8 && rnd() < 0.06) { let b = a + (rnd() < 0.5 ? 0.9 : -0.9), bx = x, by = y; for (let u = 0; u < 6 + rnd() * 8; u++) { b += (rnd() - 0.5) * 0.6; bx += Math.cos(b); by += Math.sin(b) * 0.88; put(bx | 0, by | 0, VEIN); } }
        if (t > 4 && rnd() < 0.05 && sparks.length < 8) sparks.push([x | 0, y | 0]); }
    }
    g.putImageData(img, 0, 0);
    const sc = document.createElement('canvas'); sc.width = W; sc.height = H; const sg = sc.getContext('2d');
    for (let i = 0; i < 6; i++) { let x, y; do { x = (rnd() * W) | 0; y = (rnd() * H) | 0; } while (field(x, y) < 0.5); sparks.push([x, y]); }
    for (const [x, y] of sparks) { sg.fillStyle = rnd() < 0.5 ? '#c04cf0' : '#ff6ad8'; sg.fillRect(x, y, 1, 1); if (rnd() < 0.35) { sg.fillStyle = 'rgba(176,60,220,0.45)'; sg.fillRect(x - 1, y, 3, 1); sg.fillRect(x, y - 1, 1, 3); } }
    const tex = (c) => { const t = new THREE.CanvasTexture(c); t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.generateMipmaps = false; return t; };
    const wM = (W * 2) / PX, hM = (H * 2) / PX, G = new THREE.Group(); G.name = 'city-rose-blight'; this.blightG = G;
    const geo = new THREE.PlaneGeometry(wM, hM); geo.rotateX(-Math.PI / 2);
    const base = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: tex(cv), transparent: true, depthWrite: false, fog: false })); base.renderOrder = 1;
    this.blightSpark = new THREE.MeshBasicMaterial({ map: tex(sc), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, opacity: 0.6 });
    const sp = new THREE.Mesh(geo, this.blightSpark); sp.renderOrder = 2; sp.position.y = 0.004;
    G.add(base, sp); G.position.set(toX(r.x), 0.013, toZ(r.y - 6)); this.group.add(G); // сердце пятна — у основания стебля
  }
  // ——— центральный объект площади: фонтан (заглушка-меш до арта) / статуя (зарезервировано) / пусто ———
  buildCenter() {
    const THREE = this.THREE;
    if (this.center) { this.group.remove(this.center); this.center.traverse((o) => o.geometry?.dispose?.()); this.center = null; }
    const kind = this.cfg.cp || 'fountain'; if (kind === 'none' || kind === 'fountain') return; // фонтан — пропс dm_fountain карты Историка (alkazak_map.json)
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
    { const F = this.fenceRails, B = emitterBasis(); // жерди вертикального забора — по базису камеры (пересчёт при его смене)
      const sig = F && `${B.rx.toFixed(4)},${B.ux.toFixed(4)},${B.uy.toFixed(4)},${B.uz.toFixed(4)}`;
      if (F && sig !== F.sig) { F.sig = sig; const P = F.mesh.geometry.attributes.position, a = P.array, u = 0.1 * SIN_P, w = 0.13, bk = 0.04; let k = 0;
        const v = (x, z, h, r) => { a[k++] = x + B.rx * r + B.ux * h + B.vx * bk; a[k++] = B.ry * r + B.uy * h + B.vy * bk; a[k++] = z + B.rz * r + B.uz * h + B.vz * bk; };
        // полоса: от низа перекладины у ближнего столба до её верха у дальнего (на экране — сплошная жердь между ними), ширина 2.6 арт-px
        for (const [x, z1, z0] of F.rails) for (const [h0, h1] of [[8, 12]]) { v(x, z1, h0 * u, -w); v(x, z1, h0 * u, w); v(x, z0, h1 * u, w); v(x, z0, h1 * u, -w); }
        P.needsUpdate = true; F.mesh.geometry.computeBoundingSphere(); } }
    this.time += dt; const T = this.time, c = this.cfg;
    if (!c || !c.on || !this.ready) return;
    const near = view && Math.abs(view.x - c.x) < c.r + 2600 && Math.abs(view.y - c.y) < c.r + 2600;
    this.group.visible = !!near; if (!near) return;
    const ax = this.ax, az = this.az, f = Math.floor(T * (RIM.fps || 8)) % (RIM.frames || 16), F = RIM.frames || 16, cols = RIM0.cols || 128;
    const glow = this.glowOn && this.quality < 2;
    this.back.begin(); for (const [i, ox, oy, oz] of DOME.bb) this.back.push(ax + ox, oy, az + oz, BLOCK_M, BLOCK_M, 0, 0, 0, 0, i % 128, 0); this.back.end();
    this.rim.begin(); this.rimG?.begin();
    for (const [loc, ox, oy, oz] of DOME.b) { const t = loc * F + f, col = t % cols, row = Math.floor(t / cols);
      this.rim.push(ax + ox, oy, az + oz, BLOCK_M, BLOCK_M, 0, 0, 0, 0, col, row);
      if (glow) this.rimG?.push(ax + ox, oy, az + oz, BLOCK_M, BLOCK_M, 0, 0, 0, 0, col, row, 1, 1, 1, 0.75); }
    this.rim.end(); this.rimG?.end();
    for (const a of this.anim || []) { const f = Math.floor(T * a.fps + a.ph * a.frames) % a.frames; a.t.offset.x = (a.col + f + (a.flip ? 1 : 0)) / a.cols; }
    // вспышка обода при отталкивании: 0.3 с по кривой (30 fps)
    const fk = Math.floor((T - this.flashAt) * 30), fa = fk >= 0 && fk < FLASH.length ? FLASH[fk] : 0;
    this.flash.begin(); this.flashG?.begin();
    if (fa > 0 && this.quality < 2) DOME.b.forEach(([, ox, oy, oz], i) => { this.flash.push(ax + ox, oy, az + oz, BLOCK_M, BLOCK_M, 0, 0, 0, 0, i % 128, Math.floor(i / 128), 1, 1, 1, fa); if (glow) this.flashG?.push(ax + ox, oy, az + oz, BLOCK_M, BLOCK_M, 0, 0, 0, 0, i % 128, Math.floor(i / 128), 1, 1, 1, fa * 0.7); });
    this.flash.end(); this.flashG?.end();
    // отталкивание: 18 кадров 30 fps, квад 9.6 м, mode 1 по направлению наружу
    this.rep.begin(); this.repG?.begin();
    for (let i = this.fx.length - 1; i >= 0; i--) { const e = this.fx[i]; e.t += dt; const k = Math.floor(e.t * (REP.fps || 30)); if (k >= (REP.frames || 18)) { this.fx.splice(i, 1); continue; }
      this.rep.push(toX(e.x), 0.8, toZ(e.y), REP.size_m[0], REP.size_m[1], 1, 0, e.dx, e.dy, k, 0); if (glow) this.repG?.push(toX(e.x), 0.8, toZ(e.y), REP.size_m[0], REP.size_m[1], 1, 0, e.dx, e.dy, k, 0); }
    this.rep.end(); this.repG?.end();
    // оболочка: цель по расстоянию зрителя (свой герой) до центра, плавно (README купола §2)
    if (this.shell) {
      const aIn = Number.isFinite(Number(c.aIn)) ? Number(c.aIn) : SHELL.opacity_inside, aOut = Number.isFinite(Number(c.aOut)) ? Number(c.aOut) : SHELL.opacity_outside;
      const d = view ? Math.hypot(view.x - c.x, view.y - c.y) : 1e9, k = sstep(c.r - 32, c.r + 32, d), target = aIn + (aOut - aIn) * k;
      const tn = performance.now(), rdt = Math.min(0.5, Math.max(0, (tn - (this.fadeT || tn)) / 1000)); this.fadeT = tn; // реальное время: кадр игры обрезан до 0.05 с, а переход должен длиться 0.6–0.8 с на любом FPS
      const a0 = this.shellA; this.shellA += (target - this.shellA) * (1 - Math.exp(-rdt / 0.2)); this.shellMat.opacity = this.shellA;
      { // метрика для плейтеста: переход по пересечениям уровней (вход 0.8→0.05, выход 0.1→0.85) в реальном времени + наибольший шаг за кадр
        const F = this.fade || (this.fade = { t: {}, last: null, step: 0, n: 0 }), a1 = this.shellA, X = (lv, up) => (up ? a0 < lv && a1 >= lv : a0 > lv && a1 <= lv);
        if (X(0.8, false)) { F.t.inAt = tn - rdt * 1000 * (a0 - 0.8) / Math.max(1e-6, a0 - a1); F.step = 0; F.n = 0; }
        if (X(0.1, true)) { F.t.outAt = tn - rdt * 1000 * (0.1 - a0) / Math.max(1e-6, a1 - a0); F.step = 0; F.n = 0; }
        F.step = Math.max(F.step, Math.abs(a1 - a0)); F.n++;
        if (X(0.05, false) && F.t.inAt) { F.last = { dir: 'in', from: 0.8, to: 0.05, ms: Math.round(tn - F.t.inAt), frames: F.n, maxStep: +F.step.toFixed(3) }; F.t.inAt = 0; }
        if (X(0.85, true) && F.t.outAt) { F.last = { dir: 'out', from: 0.1, to: 0.85, ms: Math.round(tn - F.t.outAt), frames: F.n, maxStep: +F.step.toFixed(3) }; F.t.outAt = 0; }
      }
      const sf = Math.floor(T * (SHELL.fps || 8)) % (SHELL.frames || 16); this.shellMat.map.offset.set((sf % SHELL.cols) / SHELL.cols, 1 - (Math.floor(sf / SHELL.cols) + 1) / SHELL.rows);
      this.shell.visible = this.shellA > 0.003;
    }
    if (this.glows?.length) { const W = this._w3 ||= [0, 0, 0], Tm = performance.now(); for (const q of this.glows) if (q.halo) { emitterWorld(q.x0, 0, q.z0, q.off, 0.18, W); q.sp.position.set(W[0], W[1], W[2]); q.fl = flickerOf(Tm, q.x0, q.z0, q.fire); const hs = q.haloM * LT.halo * (0.94 + 0.06 * q.fl); q.sp.scale.set(hs, hs, 1); } } // ореол — в точке огня, чуть «за» спрайтом
    if (this.blightSpark) this.blightSpark.opacity = 0.32 + 0.22 * Math.sin(T * 2.3) * Math.sin(T * 3.7 + 1.1); // искры порчи мерцают
    // фонтан «бьёт»
    if (this.jet) { this.jet.scale.y = 1 + 0.18 * Math.sin(T * 6); this.jetMat.opacity = 0.45 + 0.15 * Math.sin(T * 9); this.waterMat.color.setHSL(0.72, 0.4, 0.28 + 0.03 * Math.sin(T * 2.1)); }
  }
  debug() { return this.cfg ? { on: this.cfg.on, name: this.cfg.name, x: this.cfg.x, y: this.cfg.y, r: this.cfg.r, ready: this.ready, glow: !!this.rimG, shellA: +(this.shellA ?? 0).toFixed(3), fade: this.fade?.last || null, inHouse: this.inHouse, houses: this.houses.length, props: this.mapG ? this.mapG.children.length : 0, anim: (this.anim || []).length, center: this.center?.name || null, repel: this.stats.repel, npc: (this.cfg.npc || []).length } : null; }
}
