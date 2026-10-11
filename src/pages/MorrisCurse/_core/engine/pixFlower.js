// Цветы Дара на Поляне — пиксельный билборд в стиле мира (вместо мелкой 3D-модели, которую не было видно):
// бутон (розовый), созревший (голубой, светится), активный (раскрытый с клыками). Рядом — подсветка-кольцо.
// Интерфейс как у makeFlower: { group, set(fl), update(dt, moving, t), setHighlight(on) }.
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
  return (texCache[stage] = t);
}

export function makePixFlower(THREE) {
  const g = new THREE.Group();
  const mat = new THREE.SpriteMaterial({ map: tex(THREE, 'bud'), transparent: true, alphaTest: 0.3, toneMapped: false });
  const sp = new THREE.Sprite(mat); sp.center.set(0.5, 0); sp.scale.set(1.12, 1.4, 1);
  g.add(sp);
  const sh = new THREE.Mesh(new THREE.CircleBufferGeometry(0.4, 12), new THREE.MeshBasicMaterial({ color: 0x0a0614, transparent: true, opacity: 0.35, depthWrite: false }));
  sh.rotation.x = -Math.PI / 2; sh.scale.set(1.2, 0.6, 1); sh.position.y = 0.025; g.add(sh);
  const ring = new THREE.Mesh(new THREE.RingBufferGeometry(0.62, 0.74, 28), new THREE.MeshBasicMaterial({ color: 0xfacc15, transparent: true, opacity: 0.85, depthWrite: false, side: THREE.DoubleSide }));
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.04; ring.visible = false; g.add(ring);
  let state = '', t0 = Math.random() * 10, hi = false, stage = 'bud';
  return {
    group: g, sprite: sp, ring,
    set(fl) {
      const key = `${fl.stage}_${fl.flowerType}`;
      if (key === state) return;
      state = key; stage = fl.stage;
      mat.map = tex(THREE, fl.stage === 'active' ? 'active' : fl.stage === 'mature' ? 'mature' : 'bud'); mat.needsUpdate = true;
      const h = fl.stage === 'active' ? 1.9 : fl.stage === 'mature' ? 1.55 : 1.4;
      sp.scale.set(h * 0.8, h, 1);
    },
    setHighlight(on) { hi = !!on; ring.visible = hi; },
    update(dt, moving, t) {
      t0 += dt;
      sp.position.y = Math.abs(Math.sin(t0 * (moving ? 8 : 1.5))) * (moving ? 0.12 : 0.03);
      if (hi) { const k = 1 + Math.sin(t0 * 5) * 0.06; ring.scale.set(k, k, k); }
      if (stage === 'mature') mat.color.setScalar(1 + 0.15 * Math.sin(t0 * 3));
    },
  };
}
