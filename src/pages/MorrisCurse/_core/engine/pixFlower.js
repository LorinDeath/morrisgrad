// Цветы Дара на Поляне — пиксельный билборд в стиле мира (вместо мелкой 3D-модели, которую не было видно):
// бутон (розовый), созревший (голубой, светится), активный (раскрытый с клыками). Рядом — подсветка-кольцо.
// Интерфейс как у makeFlower: { group, set(fl), update(dt, moving, t), setHighlight(on) }.
// Утверждённые спрайты тюльпана Дара (props_new/flowers, NOTE_pixFlower.md): tulip_sheet.png 64×60 —
// ряды bud / mature / active × 4 кадра покачивания 16×20, низ стебля = земля. Пока PNG грузится — запасной рисунок ниже.
import tulipSrc from '../../../../assets/mc/tulip_sheet.png';
import { pixTex } from './pixColor.js';
const SHEET_ROW = { bud: 0, mature: 1, active: 2 };
let sheetImg = null, sheetReady = false;
function loadSheet() {
  if (sheetImg || typeof Image === 'undefined') return;
  sheetImg = new Image();
  sheetImg.onload = () => { sheetReady = true; };
  sheetImg.src = typeof tulipSrc === 'object' && tulipSrc ? (tulipSrc.src || tulipSrc.default || '') : tulipSrc;
}
const sheetTex = {};
function sheetTexture(THREE, stage) {
  if (!sheetReady) return null;
  if (sheetTex[stage]) return sheetTex[stage];
  const t = new THREE.Texture(sheetImg);
  t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.generateMipmaps = false; t.needsUpdate = true;
  pixTex(THREE, t); // sRGB-лист (pixColor.js)
  t.repeat.set(0.25, 1 / 3); t.offset.set(0, 1 - (SHEET_ROW[stage] + 1) / 3);
  return (sheetTex[stage] = t);
}
const PAL = { o: '#2a1430', g: '#3f9b4a', G: '#2a6b36', l: '#7bd389', p: '#f472b6', P: '#be185d', h: '#fbcfe8', c: '#7dd3fc', C: '#0369a1', w: '#e0f2fe', r: '#f43f5e', R: '#9f1239', f: '#fef3c7', y: '#facc15' };
const ART = {
  bud: [
    '................',
    '................',
    '......oooo......',
    '.....ohppPo.....',
    '....ohpppPPo....',
    '....opppPPPo....',
    '....oPpPPPRo....',
    '.....oPPPRo.....',
    '......oGGo......',
    '..oo...og.......',
    '.ollo..og..oo...',
    '.oglgo.og.ollo..',
    '..oggGooggoglgo.',
    '...ooGGgGGooggo.',
    '.....ooggo..oo..',
    '.......og.......',
    '.......og.......',
    '......oggo......',
    '.....oGGGGo.....',
    '......oooo......',
  ],
  active: [
    '..oo........oo..',
    '.orRo..oo..oRro.',
    '.orrRoorroRrrro.',
    '..orrrrrrrrrro..',
    '.orrrofffforrro.',
    'orrrof.oo.forrro',
    'oRrrofo..ofoRrro',
    '.oRRrofoofoRRro.',
    '..oooRRRRRRooo..',
    '......oGGo......',
    '.oo....og...oo..',
    'ollo...og..ollo.',
    'oglgo..og.oglgo.',
    '.oggGoooggoGggo.',
    '..ooGGgGGGGooo..',
    '.....ooggo......',
    '.......og.......',
    '.......og.......',
    '.....oGGGGo.....',
    '......oooo......',
  ],
};
ART.mature = ART.bud.map((r) => r.replace(/h/g, 'w').replace(/p/g, 'c').replace(/P/g, 'C').replace(/R/g, 'C'));

const texCache = {};
function tex(THREE, stage) {
  if (texCache[stage]) return texCache[stage];
  const rows = ART[stage] || ART.bud;
  const cv = document.createElement('canvas'); cv.width = 16; cv.height = 20;
  const g = cv.getContext('2d');
  rows.forEach((r, y) => [...r].forEach((ch, x) => { if (ch !== '.') { g.fillStyle = PAL[ch]; g.fillRect(x, y, 1, 1); } }));
  const t = new THREE.CanvasTexture(cv);
  t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.generateMipmaps = false;
  pixTex(THREE, t); // sRGB-канвас: цвета как в палитре (pixColor.js)
  return (texCache[stage] = t);
}

export function makePixFlower(THREE) {
  loadSheet();
  const g = new THREE.Group();
  const mat = new THREE.SpriteMaterial({ map: tex(THREE, 'bud'), transparent: true, alphaTest: 0.3, toneMapped: false });
  const sp = new THREE.Sprite(mat); sp.center.set(0.5, 0); sp.scale.set(1.12, 1.4, 1);
  g.add(sp);
  const sh = new THREE.Mesh(new THREE.CircleBufferGeometry(0.4, 12), new THREE.MeshBasicMaterial({ color: 0x0a0614, transparent: true, opacity: 0.35, depthWrite: false }));
  sh.rotation.x = -Math.PI / 2; sh.scale.set(1.2, 0.6, 1); sh.position.y = 0.025; g.add(sh);
  const ring = new THREE.Mesh(new THREE.RingBufferGeometry(0.62, 0.74, 28), new THREE.MeshBasicMaterial({ color: 0xfacc15, transparent: true, opacity: 0.85, depthWrite: false, side: THREE.DoubleSide }));
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.04; ring.visible = false; g.add(ring);
  let state = '', t0 = Math.random() * 10, hi = false, stage = 'bud', usingSheet = false, frame = -1;
  // одна текстура-лист на стадию, кадр — offset.x (общий у цветков одной стадии — покачивание синхронно, это дёшево)
  const applyTex = () => { const st = sheetTexture(THREE, stage); if (st) { mat.map = st; usingSheet = true; } else { mat.map = tex(THREE, stage); usingSheet = false; } mat.needsUpdate = true; };
  return {
    group: g, sprite: sp, ring,
    set(fl) {
      const key = `${fl.stage}_${fl.flowerType}`;
      if (key === state) return;
      state = key; stage = fl.stage;
      stage = fl.stage === 'active' ? 'active' : fl.stage === 'mature' ? 'mature' : 'bud'; applyTex();
      const h = fl.stage === 'active' ? 1.9 : fl.stage === 'mature' ? 1.55 : 1.4;
      sp.scale.set(h * 0.8, h, 1);
    },
    setHighlight(on) { hi = !!on; ring.visible = hi; },
    update(dt, moving, t) {
      t0 += dt;
      if (!usingSheet && sheetReady) applyTex();
      if (usingSheet) { const f = Math.floor(t0 * (moving ? 10 : 4)) & 3; if (f !== frame) { frame = f; mat.map.offset.x = f * 0.25; } }
      sp.position.y = Math.abs(Math.sin(t0 * (moving ? 8 : 1.5))) * (moving ? 0.12 : 0.03);
      if (hi) { const k = 1 + Math.sin(t0 * 5) * 0.06; ring.scale.set(k, k, k); }
      if (stage === 'mature' && !usingSheet) mat.color.setScalar(1 + 0.15 * Math.sin(t0 * 3)); // в листе мерцание уже в кадрах
    },
  };
}
