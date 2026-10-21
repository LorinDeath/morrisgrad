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

const PX = 20;
const SHEET_SRC = { p32: p32Src, b64: b64Src };
/** «пространство» точки: 'w' — мир, иначе ключ комнаты (комнаты разнесены на ROOM_STEP) — кого из игроков/NPC видно */
export const inRoomPt = (x, y) => x < ROOM_LIMIT && y < ROOM_LIMIT;
export const spaceOf = (x, y) => (inRoomPt(x, y) ? 'r' + Math.floor(Math.min(x, y) / ROOM_STEP) : 'w');

export class CityRoomView {
  constructor(THREE, root) {
    this.THREE = THREE; this.root = root; this.cur = null; this.group = null; this.img = {}; this.load = null;
  }
  get inside() { return !!this.cur; }
  _images() {
    if (this.load) return this.load;
    const L = (s) => loadAtlasTexture(this.THREE, s).then((t) => t.image);
    this.load = Promise.all([L(tilesSrc), L(p32Src), L(b64Src)]).then(([t, p, b]) => { this.img = { tiles: t, p32: p, b64: b }; });
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
    this.cur = null;
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
    for (const p of R.props || []) {
      const k = PROPS.keys?.[p.key], im = k && this.img[k.sheet]; if (!k || !im) continue;
      const pc = document.createElement('canvas'); pc.width = k.w; pc.height = k.h; const pctx = pc.getContext('2d'); pctx.imageSmoothingEnabled = false;
      pctx.drawImage(im, k.x, k.y, k.w, k.h, 0, 0, k.w, k.h);
      const t = new THREE.CanvasTexture(pc); t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.generateMipmaps = false;
      const s = new THREE.Sprite(pixMat(new THREE.SpriteMaterial({ map: pixTex(THREE, t), transparent: true, alphaTest: 0.04 })));
      const [sw, sh] = k.size_m || [k.w / 10, k.h / 10], an = k.anchor || [0.5, 1];
      s.center.set(an[0], 1 - an[1]); s.scale.set(sw, sh, 1);
      const ax = d.ox + (p.anchor_px ? p.anchor_px[0] : (p.tile[0] + (p.w_tiles || 1) / 2) * T), ay = d.oy + (p.anchor_px ? p.anchor_px[1] : (p.tile[1] + 1) * T);
      s.position.set(toX(ax), 0, toZ(ay)); s.renderOrder = 3; s.name = 'city-room-prop:' + p.key;
      g.add(s);
    }
    this.root.add(g); this.group = g;
  }
  debug() { return this.cur ? { id: this.cur.id, room: this.cur.room, built: !!this.group, props: this.group ? this.group.children.length - 1 : 0 } : null; }
}
