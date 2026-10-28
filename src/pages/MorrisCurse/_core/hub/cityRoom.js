// Интерьеры зданий города Альказак (server/meta/cityBuild.ts): комната — отдельная маленькая карта ВНЕ мира Аринара
// (обе координаты < ROOM_LIMIT). Сервер переносит героя через дверь и шлёт city_room {id, room, ox, oy, name};
// здесь только отрисовка по данным арта (interiors_dark.json: tiles/overlay → запекаем в одну текстуру пола,
// props → вертикальные спрайты из props_dark_*). Никаких пиксельных сдвигов в коде — новая поставка арта = пересинк.
import { pixTex, pixMat } from '../engine/pixColor.js';
import { loadAtlasTexture } from '../engine/spriteBatch.js';
import { toX, toZ } from '../engine/geometry.js';
import { ROOM_LIMIT, ROOM_STEP } from '../../../../../server/meta/cityBuild.ts';
import ROOMS_J from '../../../../assets/mc/city/interiors_dark.json';
import TILES from '../../../../assets/mc/city/tiles_dark.json';
import PROPS from '../../../../assets/mc/city/props_dark_atlas.json';
import tilesSrc from '../../../../assets/mc/city/tiles_dark.png';
import p32Src from '../../../../assets/mc/city/props_dark_p32.png';
import b64Src from '../../../../assets/mc/city/props_dark_b64.png';
import p32GSrc from '../../../../assets/mc/city/props_dark_p32_glow.png';
import b64GSrc from '../../../../assets/mc/city/props_dark_b64_glow.png';

const PX = 20;
const SHEET_SRC = { p32: p32Src, b64: b64Src };
// огонь в доме (очаг dm_hearth и т.п.): кадры пропса (frames/fps из атласа) + _glow-слой + тёплый ореол и пятно на полу.
// День/ночь в комнатах выключены (game.js dnFrame) — свет здесь свой: аддитивно, с потолком яркости (light-nowashout).
// Настройки — админка «🏰 Город» → fx.hearth* (zone_state.city.fx): вкл, сила мерцания, скорость, яркость, размер.
const ROOM_FIRE = /hearth|fireplace|_fire|brazier|candle/;
export const HEARTH_DEF = { hearthOn: true, hearthFlick: 0.35, hearthSpeed: 1, hearthK: 0.8, hearthR: 1 };
/** мерцание огня 0…1 (1 — ровно): три синуса, фаза по месту, a — сила, sp — скорость */
export function hearthFlicker(Tms, x, a, sp) { const T = Tms * (sp || 1), w = 0.55 * Math.sin(T * 0.0112 + x * 3.1) + 0.3 * Math.sin(T * 0.0291 + x * 5.3) + 0.15 * Math.sin(T * 0.0613 + x * 1.7); return 1 - Math.max(0, Math.min(1, a)) * (0.5 - 0.5 * w); }
const radial = (THREE, stops) => { const cv = document.createElement('canvas'); cv.width = cv.height = 64; const x = cv.getContext('2d'), gr = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  for (const [o, a] of stops) gr.addColorStop(o, `rgba(255,255,255,${a})`); x.fillStyle = gr; x.fillRect(0, 0, 64, 64); const t = new THREE.CanvasTexture(cv); return t; };
/** «пространство» точки: 'w' — мир, иначе ключ комнаты (комнаты разнесены на ROOM_STEP) — кого из игроков/NPC видно */
export const inRoomPt = (x, y) => x < ROOM_LIMIT && y < ROOM_LIMIT;
export const spaceOf = (x, y) => (inRoomPt(x, y) ? 'r' + Math.floor(Math.min(x, y) / ROOM_STEP) : 'w');

export class CityRoomView {
  constructor(THREE, root) {
    this.THREE = THREE; this.root = root; this.cur = null; this.group = null; this.img = {}; this.load = null; this.anim = []; this.fires = []; this.fx = { ...HEARTH_DEF }; this.t = 0;
  }
  /** админка: fx из zone_state.city (вживую) */
  setFx(fx) { this.fx = { ...HEARTH_DEF, ...(fx || {}) }; }
  /** кадр: анимация огня и мерцание света (game.js, каждый кадр) */
  update(dt) {
    if (!this.group) return; this.t += dt; const F = this.fx, Tm = performance.now();
    for (const a of this.anim) { const f = Math.floor(this.t * a.fps + a.ph) % a.frames; for (const t of a.tex) t.offset.x = f / a.frames; }
    for (const q of this.fires) { const on = F.hearthOn !== false, k = Math.max(0, Math.min(1.5, Number(F.hearthK) || 0)), r = Math.max(0.3, Math.min(3, Number(F.hearthR) || 1));
      const fl = hearthFlicker(Tm, q.x, Number(F.hearthFlick) || 0, Number(F.hearthSpeed) || 1);
      q.halo.visible = q.pool.visible = on; if (q.glow) q.glow.material.opacity = on ? Math.min(1, 0.55 + 0.45 * fl) : 0;
      q.halo.material.opacity = Math.min(0.75, 0.55 * k * fl); q.halo.scale.setScalar(q.hm * r * (0.94 + 0.06 * fl));
      q.pool.material.opacity = Math.min(0.5, 0.34 * k * fl); q.pool.scale.setScalar(r * (0.97 + 0.03 * fl)); }
  }
  get inside() { return !!this.cur; }
  _images() {
    if (this.load) return this.load;
    const L = (s) => loadAtlasTexture(this.THREE, s).then((t) => t.image);
    const Lg = (s) => L(s).catch(() => null); // _glow-слой — по желанию
    this.load = Promise.all([L(tilesSrc), L(p32Src), L(b64Src), Lg(p32GSrc), Lg(b64GSrc)]).then(([t, p, b, pg, bg]) => { this.img = { tiles: t, p32: p, b64: b, p32_glow: pg, b64_glow: bg }; });
    return this.load;
  }
  /** city_room от сервера: room — ключ интерьера (null — снаружи) */
  set(d) {
    if (!d || !d.room) { this.clear(); return; }
    if (this.cur && this.cur.id === d.id && this.cur.ox === d.ox) return;
    this.clear(); this.cur = { ...d };
    const want = this.cur;
    this._images().then(() => { if (this.cur === want) this.build(want); }).catch((e) => console.warn('[city-room]', e.message));
  }
  clear() {
    this.cur = null; this.anim = []; this.fires = [];
    if (this.group) { this.root.remove(this.group); this.group.traverse((o) => { o.geometry?.dispose?.(); if (o.material) { o.material.map?.dispose?.(); o.material.dispose?.(); } }); this.group = null; }
  }
  build(d) {
    const THREE = this.THREE, R = ROOMS_J.interiors?.[d.room]; if (!R) return;
    const T = Number(ROOMS_J.tile) || 32, TT = Number(TILES.tile) || 32, cols = Number(TILES.cols) || 16;
    const [w, h] = R.size, g = new THREE.Group(); g.name = 'city-room:' + d.id;
    // пол + стены (тайлы) + оверлей (ковры) → одна текстура
    const cv = document.createElement('canvas'); cv.width = w * T; cv.height = h * T; const c = cv.getContext('2d'); c.imageSmoothingEnabled = false;
    c.fillStyle = '#07060a'; c.fillRect(0, 0, cv.width, cv.height);
    const put = (name, x, y) => { const i = TILES.index?.[name]; if (i == null) return; c.drawImage(this.img.tiles, (i % cols) * TT, Math.floor(i / cols) * TT, TT, TT, x * T, y * T, T, T); };
    (R.tiles || []).forEach((row, y) => row.forEach((n, x) => put(n, x, y)));
    for (const o of R.overlay || []) put(o.name, o.tile[0], o.tile[1]);
    const tex = new THREE.CanvasTexture(cv); tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.NearestFilter; tex.generateMipmaps = false;
    pixTex(THREE, tex); // sRGB-канвас (engine/pixColor.js)
    const floor = new THREE.Mesh(new THREE.PlaneGeometry((w * T) / PX, (h * T) / PX), pixMat(new THREE.MeshBasicMaterial({ map: tex })));
    floor.rotation.x = -Math.PI / 2; floor.position.set(toX(d.ox + (w * T) / 2), 0.01, toZ(d.oy + (h * T) / 2)); floor.renderOrder = 0; floor.name = 'city-room-floor';
    g.add(floor);
    // пропсы: спрайт к камере, якорь — низ по центру (anchor из атласа), размер — size_m
    const warm = 0xffa64d;
    for (const p of R.props || []) {
      const k = PROPS.keys?.[p.key], im = k && this.img[k.sheet]; if (!k || !im) continue;
      const n = Math.max(1, k.frames | 0), fire = ROOM_FIRE.test(p.key), aTex = [];
      // кадры подряд в одну полосу (frames из атласа, 10 к/с у очага) — offset.x по кадру
      const strip = (img) => { const pc = document.createElement('canvas'); pc.width = k.w * n; pc.height = k.h; const pctx = pc.getContext('2d'); pctx.imageSmoothingEnabled = false;
        for (let f = 0; f < n; f++) pctx.drawImage(img, k.x + f * k.w, k.y, k.w, k.h, f * k.w, 0, k.w, k.h);
        const t = new THREE.CanvasTexture(pc); t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.generateMipmaps = false; t.repeat.set(1 / n, 1); if (n > 1) aTex.push(t); return pixTex(THREE, t); };
      const s = new THREE.Sprite(pixMat(new THREE.SpriteMaterial({ map: strip(im), transparent: true, alphaTest: 0.04 })));
      const [sw, sh] = k.size_m || [k.w / 10, k.h / 10], an = k.anchor || [0.5, 1];
      s.center.set(an[0], 1 - an[1]); s.scale.set(sw, sh, 1);
      const ax = d.ox + (p.anchor_px ? p.anchor_px[0] : (p.tile[0] + (p.w_tiles || 1) / 2) * T), ay = d.oy + (p.anchor_px ? p.anchor_px[1] : (p.tile[1] + 1) * T);
      s.position.set(toX(ax), 0, toZ(ay)); s.renderOrder = 3; s.name = 'city-room-prop:' + p.key;
      g.add(s);
      let glow = null; const gi = k.glow && this.img[k.glow.sheet];
      if (gi) { glow = new THREE.Sprite(pixMat(new THREE.SpriteMaterial({ map: strip(gi), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.8 })));
        glow.center.copy(s.center); glow.scale.copy(s.scale); glow.position.set(toX(ax), 0.02, toZ(ay) + 0.01); glow.renderOrder = 4; glow.name = 'city-room-glow:' + p.key; g.add(glow); }
      if (aTex.length) this.anim.push({ tex: aTex, frames: n, fps: Number(k.fps) || 8, ph: (ax * 7 + ay * 3) % n });
      if (fire) { // свет очага: ореол у огня (над полом, за спрайтом) и тёплое пятно на полу
        const hm = Math.max(2.6, sw * 1.25);
        const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: this._haloTex ||= radial(THREE, [[0, 0.9], [0.2, 0.5], [0.55, 0.14], [1, 0]]), transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending, color: warm, opacity: 0.4, fog: false }));
        halo.position.set(toX(ax), sh * 0.32, toZ(ay) + 0.25); halo.scale.setScalar(hm); halo.renderOrder = 5; halo.name = 'city-room-hearth-halo'; g.add(halo);
        const pool = new THREE.Mesh(new THREE.PlaneGeometry(9, 7), new THREE.MeshBasicMaterial({ map: this._poolTex ||= radial(THREE, [[0, 0.85], [0.35, 0.4], [0.7, 0.1], [1, 0]]), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, color: warm, opacity: 0.3, fog: false }));
        pool.rotation.x = -Math.PI / 2; pool.position.set(toX(ax), 0.02, toZ(ay) + 2.2); pool.renderOrder = 1; pool.name = 'city-room-hearth-pool'; g.add(pool);
        this.fires.push({ x: ax * 0.013, halo, pool, glow, hm });
      }
    }
    this.root.add(g); this.group = g;
  }
  debug() { return this.cur ? { id: this.cur.id, room: this.cur.room, built: !!this.group, props: this.group ? this.group.children.filter((o) => o.name.startsWith('city-room-prop:')).length : 0, fires: this.fires.length, anim: this.anim.length } : null; }
}
