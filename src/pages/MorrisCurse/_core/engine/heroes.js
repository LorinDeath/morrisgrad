// Игровые персонажи по референсам пользователя (char-refs): Нофорд, Кавега, Мариэль, Велес.
// Процедурная low-poly геометрия Three.js + тун-материалы (3 тона) + обводка «инвертированной оболочкой» —
// аниме/чиби-пропорции (голова ≈ 1/3 роста), чтобы узнавались по причёске, цветам одежды и деталям.
// Модель смотрит в +Z (к камере), ноги на y=0, рост ≈ 2.1 м.

let gradientTex = null;
const matCache = new Map();

function gradient(THREE) {
  if (gradientTex) return gradientTex;
  const data = new Uint8Array([90, 90, 90, 255, 175, 175, 175, 255, 255, 255, 255, 255]);
  gradientTex = new THREE.DataTexture(data, 3, 1, THREE.RGBAFormat);
  gradientTex.minFilter = THREE.NearestFilter;
  gradientTex.magFilter = THREE.NearestFilter;
  gradientTex.generateMipmaps = false;
  gradientTex.needsUpdate = true;
  return gradientTex;
}

// r128 без управления цветом: hex-цвета из референсов задаём в sRGB и переводим в линейное пространство
function lin(m) {
  if (m.color && m.color.convertSRGBToLinear) m.color.convertSRGBToLinear();
  if (m.emissive && m.emissive.convertSRGBToLinear) m.emissive.convertSRGBToLinear();
  return m;
}

function toon(THREE, color, opts = {}) {
  const key = color + JSON.stringify(opts);
  if (matCache.has(key)) return matCache.get(key);
  const m = new THREE.MeshToonMaterial({ color, gradientMap: gradient(THREE), ...opts });
  lin(m);
  matCache.set(key, m);
  return m;
}

function basic(THREE, color, opts = {}) {
  const key = 'b' + color + JSON.stringify(opts);
  if (matCache.has(key)) return matCache.get(key);
  const m = new THREE.MeshBasicMaterial({ color, ...opts });
  lin(m);
  matCache.set(key, m);
  return m;
}

function outlineMat(THREE) { return basic(THREE, 0x120a12, { side: THREE.BackSide }); }

// Меш + (опционально) обводка: копия геометрии, BackSide, чуть крупнее
function part(THREE, geo, mat, parent, x = 0, y = 0, z = 0, outline = 1.07) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  if (outline) {
    const o = new THREE.Mesh(geo, outlineMat(THREE));
    o.scale.setScalar(outline);
    m.add(o);
  }
  parent.add(m);
  return m;
}

// Сужающийся «короб» (торс, жакет): верх шире низа
function taperBox(THREE, w, h, d, bottomK = 0.82, topDepthK = 1) {
  const g = new THREE.BoxGeometry(w, h, d, 1, 2, 1);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i);
    const t = (y + h / 2) / h; // 0 низ … 1 верх
    const k = bottomK + (1 - bottomK) * t;
    p.setX(i, p.getX(i) * k);
    p.setZ(i, p.getZ(i) * (t > 0.5 ? topDepthK : 1));
  }
  g.computeVertexNormals();
  return g;
}

const SKIN = 0xf6d5c0;

// ---- причёски ----
function sph(THREE, r) { return new THREE.SphereGeometry(r, 14, 10); }

function spike(THREE, parent, mat, dir, len, rad, base = 0.3, flow = null) {
  const g = new THREE.ConeGeometry(rad, len, 5);
  g.translate(0, len * 0.5, 0); // основание пряди в начале координат
  const m = new THREE.Mesh(g, mat);
  const n = new THREE.Vector3(dir[0], dir[1], dir[2]).normalize();
  const v = n.clone();
  if (flow) v.multiplyScalar(0.5).add(new THREE.Vector3(flow[0], flow[1], flow[2]).normalize().multiplyScalar(0.5)).normalize();
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), v);
  m.position.copy(n.clone().multiplyScalar(base));
  m.scale.z = 0.6; // плоские «пряди», а не иглы
  m.castShadow = true;
  const o = new THREE.Mesh(g, outlineMat(THREE));
  o.scale.set(1.14, 1.06, 1.14);
  m.add(o);
  parent.add(m);
  return m;
}

// Взъерошенная аниме-причёска: пряди лежат по голове и стекают назад/вниз
function messyHair(THREE, head, R, mats, count = 26, seed = 1, lenK = 1) {
  let r = seed * 9301 + 49297;
  const rnd = () => { r = (r * 9301 + 49297) % 233280; return r / 233280; };
  for (let i = 0; i < count; i++) {
    const ang = (i / count) * Math.PI * 2 + rnd() * 0.3;
    const elev = 0.15 + rnd() * 1.15; // 0 — экватор, π/2 — макушка
    const front = Math.cos(ang) > 0.55 && elev < 0.9; // не закрывать лицо
    if (front) continue;
    const n = [Math.sin(ang) * Math.cos(elev), Math.sin(elev), Math.cos(ang) * Math.cos(elev)];
    const flow = [n[0] * 0.6, -0.9, n[2] * 0.6 - 0.5];
    spike(THREE, head, mats[i % mats.length], n, (0.2 + rnd() * 0.12) * lenK, 0.11 + rnd() * 0.04, R * 0.9, flow);
  }
}

// шапка волос: полусфера чуть крупнее головы, с вырезом спереди под лицо (gapFront рад)
function hairShell(THREE, parent, mat, r, thetaLen, gapFront = 0, y = 0, z = 0) {
  const g = gapFront
    ? new THREE.SphereGeometry(r, 18, 12, Math.PI / 2 + gapFront / 2, Math.PI * 2 - gapFront, 0, thetaLen)
    : new THREE.SphereGeometry(r, 18, 12, 0, Math.PI * 2, 0, thetaLen);
  const m = part(THREE, g, mat, parent, 0, y, z, 1.05);
  m.material = mat;
  if (gapFront) { mat.side = THREE.DoubleSide; }
  return m;
}

// ---- лицо (аниме-глаза) ----
function face(THREE, head, R, eyeColor, { lash = 0x1a1016, brow = 0x2a1a1a, mouth = true, eyeY = -0.02 } = {}) {
  const white = basic(THREE, 0xffffff);
  const iris = basic(THREE, eyeColor);
  const pupil = basic(THREE, 0x0a0a12);
  const dark = basic(THREE, lash);
  [-1, 1].forEach((s) => {
    const x = s * 0.115;
    const z = Math.sqrt(Math.max(0, R * R - x * x - eyeY * eyeY)) - 0.004;
    const eye = new THREE.Group();
    eye.position.set(x, eyeY, z);
    eye.rotation.y = s * Math.asin(x / R);
    const w = new THREE.Mesh(new THREE.CircleGeometry(0.06, 12), white); w.scale.set(1.15, 1.0, 1); eye.add(w);
    const i = new THREE.Mesh(new THREE.CircleGeometry(0.043, 12), iris); i.position.set(0, -0.004, 0.002); i.scale.set(0.95, 1.2, 1); eye.add(i);
    const p = new THREE.Mesh(new THREE.CircleGeometry(0.02, 8), pupil); p.position.set(0, -0.004, 0.004); eye.add(p);
    const hl = new THREE.Mesh(new THREE.CircleGeometry(0.011, 6), white); hl.position.set(-0.015 * s, 0.018, 0.006); eye.add(hl);
    const l = new THREE.Mesh(new THREE.PlaneGeometry(0.15, 0.022), dark); l.position.set(0, 0.058, 0.003); l.rotation.z = -s * 0.12; eye.add(l);
    const b = new THREE.Mesh(new THREE.PlaneGeometry(0.11, 0.018), basic(THREE, brow)); b.position.set(0.005 * s, 0.11, 0.0); b.rotation.z = -s * 0.18; eye.add(b);
    head.add(eye);
  });
  if (mouth) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(0.06, 0.012), basic(THREE, 0x9a4a4a));
    m.position.set(0, -0.15, Math.sqrt(R * R - 0.0225) - 0.01);
    head.add(m);
  }
}

// тонкая «кант»-полоска на плоской поверхности
function stripe(THREE, parent, color, x, y, z, w, h, rotZ = 0, d = 0.012) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), basic(THREE, color));
  m.position.set(x, y, z);
  m.rotation.z = rotZ;
  parent.add(m);
  return m;
}

function ring(THREE, parent, color, y, r, tube = 0.012) {
  const m = new THREE.Mesh(new THREE.TorusGeometry(r, tube, 5, 14), basic(THREE, color));
  m.rotation.x = Math.PI / 2;
  m.position.y = y;
  parent.add(m);
  return m;
}

// ---- базовое тело ----
function body(THREE, cfg) {
  const root = new THREE.Group();
  const rig = new THREE.Group();
  root.add(rig);
  const slim = cfg.female ? 0.88 : 1;
  const HIP = 0.82;

  // ноги
  const legs = [-1, 1].map((s) => {
    const g = new THREE.Group();
    g.position.set(s * 0.12 * slim, HIP, 0);
    rig.add(g);
    const upper = part(THREE, new THREE.CylinderGeometry(0.115 * slim, 0.095 * slim, 0.46, 8), toon(THREE, cfg.pants), g, 0, -0.22, 0);
    const lowerMat = toon(THREE, cfg.lowerLeg || cfg.pants);
    part(THREE, new THREE.CylinderGeometry(0.085 * slim, 0.07 * slim, 0.36, 8), lowerMat, g, 0, -0.6, 0);
    if (cfg.boots) {
      part(THREE, new THREE.CylinderGeometry(cfg.bootTop || 0.1, 0.085, cfg.bootH || 0.46, 9), toon(THREE, cfg.boots, cfg.bootShine ? { emissive: 0x111111 } : {}), g, 0, -HIP + (cfg.bootH || 0.46) / 2 + 0.02, 0.005);
    }
    const foot = part(THREE, new THREE.BoxGeometry(0.15 * slim, 0.09, 0.26), toon(THREE, cfg.shoes), g, 0, -HIP + 0.045, 0.05);
    foot.geometry.translate(0, 0, 0);
    return g;
  });

  // таз (связывает ноги и торс)
  part(THREE, new THREE.CylinderGeometry(0.2 * slim, 0.19 * slim, 0.2, 10), toon(THREE, cfg.hip || cfg.pants), rig, 0, HIP - 0.02, 0).scale.z = 0.72;
  // торс
  const torsoH = 0.6;
  const torso = new THREE.Group();
  torso.position.y = HIP + torsoH / 2 - 0.02;
  rig.add(torso);
  const tw = (cfg.female ? 0.42 : 0.5);
  part(THREE, taperBox(THREE, tw, torsoH, 0.3, cfg.female ? 0.78 : 0.82), toon(THREE, cfg.torso), torso);
  const FZ = 0.151; // передняя плоскость торса

  // шея и голова
  part(THREE, new THREE.CylinderGeometry(0.065, 0.075, 0.14, 8), toon(THREE, cfg.neck || SKIN), rig, 0, HIP + torsoH + 0.02, 0, 0);
  const head = new THREE.Group();
  head.position.set(0, HIP + torsoH + 0.36, 0.01);
  rig.add(head);
  const R = 0.33;
  part(THREE, sph(THREE, R), toon(THREE, SKIN), head, 0, 0, 0, 1.04).scale.set(1, 1.04, 0.96);
  // ушки
  [-1, 1].forEach((s) => part(THREE, new THREE.SphereGeometry(0.06, 6, 5), toon(THREE, SKIN), head, s * 0.315, -0.04, -0.01, 0));

  // руки
  const arms = [-1, 1].map((s) => {
    const g = new THREE.Group();
    g.position.set(s * (tw / 2 + 0.06), HIP + torsoH - 0.07, 0);
    g.rotation.z = s * 0.1;
    rig.add(g);
    part(THREE, new THREE.SphereGeometry(0.095 * slim, 8, 6), toon(THREE, cfg.sleeve || cfg.torso), g, 0, -0.02, 0);
    part(THREE, new THREE.CylinderGeometry(0.075 * slim, 0.065 * slim, 0.56, 8), toon(THREE, cfg.sleeve || cfg.torso), g, 0, -0.27, 0);
    const hand = part(THREE, new THREE.SphereGeometry(0.07 * slim, 8, 6), toon(THREE, cfg.hands || SKIN), g, 0, -0.6, 0.01);
    return { g, hand };
  });

  return { root, rig, legs, arms, torso, head, R, FZ, HIP, torsoH, tw };
}

// ---------------------------------------------------------------------------
// НОФОРД: белые взъерошенные волосы с чёрной прядью, голубые глаза, расстёгнутая белая рубашка
// с зелёным кантом, зелёный кулон, светло-серые брюки.
function noford(THREE) {
  const b = body(THREE, { torso: 0xf4f4f2, sleeve: 0xf4f4f2, pants: 0xcfcdc8, shoes: 0xe8e6e0 });
  const { torso, head, R, FZ } = b;
  const G = 0x22a04a;
  // вырез рубашки (кожа) — треугольник
  const shape = new THREE.Shape();
  shape.moveTo(-0.11, 0.3); shape.lineTo(0.11, 0.3); shape.lineTo(0, -0.12); shape.closePath();
  const v = new THREE.Mesh(new THREE.ShapeGeometry(shape), toon(THREE, SKIN));
  v.position.set(0, 0, FZ + 0.004);
  torso.add(v);
  // зелёный кант: по краям выреза, планка, плечевые швы, низ
  stripe(THREE, torso, G, -0.056, 0.09, FZ + 0.008, 0.018, 0.44, 0.26);
  stripe(THREE, torso, G, 0.056, 0.09, FZ + 0.008, 0.018, 0.44, -0.26);
  stripe(THREE, torso, G, 0.012, -0.2, FZ + 0.008, 0.016, 0.2, 0);
  stripe(THREE, torso, G, 0, -0.29, FZ + 0.008, 0.38, 0.016);
  [-1, 1].forEach((s) => stripe(THREE, torso, G, s * 0.2, 0.2, 0, 0.016, 0.02, 0, 0.3)); // плечевые швы сбоку
  // воротник
  [-1, 1].forEach((s) => { const c = part(THREE, new THREE.BoxGeometry(0.12, 0.05, 0.1), toon(THREE, 0xf4f4f2), torso, s * 0.1, 0.31, 0.08, 1.1); c.rotation.z = -s * 0.5; stripe(THREE, c, G, 0, -0.026, 0.051, 0.12, 0.012); });
  // манжеты
  b.arms.forEach((a) => ring(THREE, a.g, G, -0.5, 0.07, 0.012));
  // кулон: цепочка + зелёный камень
  [-1, 1].forEach((s) => stripe(THREE, torso, 0xc0c4c8, s * 0.035, 0.2, FZ + 0.006, 0.008, 0.16, s * 0.35));
  const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.035, 0), toon(THREE, 0x22c55e, { emissive: 0x0f7a32 }));
  gem.scale.set(0.8, 1.3, 0.5);
  gem.position.set(0, 0.11, FZ + 0.02);
  torso.add(gem);
  // ремень
  part(THREE, new THREE.CylinderGeometry(0.2, 0.2, 0.05, 10), toon(THREE, 0xe4e2dc), b.rig, 0, b.HIP + 0.02, 0, 0).scale.z = 0.75;
  // лицо и волосы
  face(THREE, head, R * 0.97, 0x3b9cf0, { brow: 0xd0d0d0 });
  const HW = toon(THREE, 0xf2f3f5), HB = toon(THREE, 0x18181b);
  hairShell(THREE, head, HW, R + 0.025, Math.PI * 0.5, 0, 0.02, -0.01);
  messyHair(THREE, head, R, [HW], 30, 3, 0.75);
  // чёлка: пряди вниз-вперёд, чёрная прядь по центру макушки
  [[-0.17, 0.0], [-0.06, 0.03], [0.06, 0.02], [0.17, -0.01]].forEach(([x, k]) => {
    const s = spike(THREE, head, HW, [x * 1.5, -0.6, 1], 0.24, 0.075, 0.0);
    s.position.set(x, 0.17 + k, 0.27);
  });
  spike(THREE, head, HB, [0, 1, 0.3], 0.26, 0.12, R * 0.92, [0, 0.4, 1]);
  spike(THREE, head, HB, [0.05, 0.8, 0.6], 0.22, 0.1, R * 0.92, [0, -0.3, 1]);
  const st = spike(THREE, head, HB, [0, -0.5, 1], 0.2, 0.06, 0.0); st.position.set(0.0, 0.2, 0.28);
  // рука в кармане (как на арте): правая рука чуть отведена
  return { ...b, name: 'Нофорд' };
}

// КАВЕГА: седо-алые растрёпанные волосы, чёрная маска, длинный чёрный кожаный плащ, чёрный свитер,
// чёрные митенки, чёрные кожаные брюки.
function kavega(THREE) {
  const LEATHER = 0x1c1c22;
  const b = body(THREE, { torso: 0x232327, sleeve: LEATHER, pants: 0x18181d, shoes: 0x111114, hands: 0x18181b });
  const { torso, head, R, FZ, rig, HIP, torsoH } = b;
  // свитер: рельеф рубчиком
  for (let i = -3; i <= 3; i++) stripe(THREE, torso, 0x2e2e34, i * 0.05, -0.02, FZ + 0.004, 0.012, 0.5);
  // плащ: открытая спереди «юбка» от плеч до колен + лацканы
  const coatMat = toon(THREE, LEATHER, { side: THREE.DoubleSide, emissive: 0x050507 });
  const gap = 0.9;
  const coat = new THREE.Mesh(new THREE.CylinderGeometry(0.29, 0.42, 1.12, 12, 1, true, gap / 2, Math.PI * 2 - gap), coatMat);
  coat.position.y = HIP + torsoH - 0.56 + 0.02;
  coat.scale.z = 0.72;
  coat.castShadow = true;
  const co = new THREE.Mesh(coat.geometry, outlineMat(THREE)); co.scale.setScalar(1.04); coat.add(co);
  rig.add(coat);
  b.coat = coat;
  // плечи плаща
  [-1, 1].forEach((s) => part(THREE, new THREE.SphereGeometry(0.13, 8, 6), toon(THREE, LEATHER), rig, s * 0.27, HIP + torsoH - 0.05, 0));
  // лацканы и высокий воротник
  [-1, 1].forEach((s) => {
    const l = part(THREE, new THREE.BoxGeometry(0.1, 0.36, 0.03), toon(THREE, 0x2a2a31), torso, s * 0.12, 0.1, FZ + 0.03, 1.08);
    l.rotation.z = s * 0.3;
    const c = part(THREE, new THREE.BoxGeometry(0.16, 0.16, 0.04), toon(THREE, LEATHER), torso, s * 0.13, 0.36, 0.06, 1.08);
    c.rotation.set(-0.2, s * 0.5, s * 0.25);
  });
  // манжеты плаща
  b.arms.forEach((a) => part(THREE, new THREE.CylinderGeometry(0.09, 0.09, 0.08, 8), toon(THREE, 0x2a2a31), a.g, 0, -0.48, 0));
  // лицо: жёлто-карие глаза, маска на нижней половине лица
  face(THREE, head, R * 0.97, 0xc59a3a, { mouth: false, brow: 0x5a4a4a });
  const mask = new THREE.Mesh(new THREE.SphereGeometry(R * 1.0, 16, 8, Math.PI * 0.12, Math.PI * 0.76, Math.PI * 0.53, Math.PI * 0.3), toon(THREE, 0x0d0d10, { side: THREE.DoubleSide }));
  mask.rotation.y = 0; // фронт +Z покрывается диапазоном phi ~ [0.12π, 0.88π]
  head.add(mask);
  // ремешки маски
  [-1, 1].forEach((s) => stripe(THREE, head, 0x0d0d10, s * 0.3, -0.06, 0, 0.02, 0.03, 0, 0.12));
  // волосы: седые с алыми/каштановыми прядями
  const GR = toon(THREE, 0x7f8188), CR = toon(THREE, 0x9a1430), AU = toon(THREE, 0x8a4a2e);
  hairShell(THREE, head, GR, R + 0.025, Math.PI * 0.52, 0, 0.02, -0.01);
  messyHair(THREE, head, R, [GR, CR, GR, AU, GR, CR], 30, 7);
  // длинная чёлка, частично на глаз
  [[-0.18, GR, 0.26], [-0.08, CR, 0.3], [0.04, GR, 0.32], [0.15, CR, 0.26]].forEach(([x, m, len]) => {
    const s = spike(THREE, head, m, [x * 1.2, -0.75, 1], len, 0.075, 0.0);
    s.position.set(x, 0.16, 0.28);
  });
  return { ...b, name: 'Кавега' };
}

// МАРИЭЛЬ: короткое малиновое каре, красные глаза, чёрный чокер, белый двубортный жакет и юбка-карандаш
// с фиолетовой окантовкой, белые сапоги до колен, книга, фиолетовые магические искры.
function mariel(THREE) {
  const W = 0xf5f3f7, P = 0x8b3fd6;
  const b = body(THREE, { female: true, torso: W, sleeve: W, pants: SKIN, lowerLeg: SKIN, shoes: 0xf0eef2, boots: 0xf4f2f6, bootH: 0.37, bootTop: 0.092, bootShine: true });
  const { torso, head, R, FZ, rig, HIP } = b;
  // юбка-карандаш
  const skirt = part(THREE, new THREE.CylinderGeometry(0.2, 0.185, 0.44, 12), toon(THREE, W), rig, 0, HIP - 0.17, 0);
  skirt.scale.z = 0.78;
  stripe(THREE, skirt, P, 0.1, -0.02, 0.15, 0.016, 0.4, 0);
  ring(THREE, skirt, P, -0.215, 0.188, 0.01).scale.set(1, 1, 1);
  // лацканы жакета (фиолетовый кант), двубортные пуговицы, пояс
  [-1, 1].forEach((s) => {
    stripe(THREE, torso, P, s * 0.036, 0.21, FZ + 0.008, 0.016, 0.2, -s * 0.36);
    stripe(THREE, torso, P, s * 0.14, 0.22, FZ + 0.008, 0.016, 0.14, -s * 0.9);
    for (let i = 0; i < 2; i++) {
      const btn = new THREE.Mesh(new THREE.CircleGeometry(0.016, 8), basic(THREE, 0x6b4a9a));
      btn.position.set(s * 0.065, 0.0 - i * 0.09, FZ + 0.01);
      torso.add(btn);
    }
  });
  const shape = new THREE.Shape();
  shape.moveTo(-0.07, 0.3); shape.lineTo(0.07, 0.3); shape.lineTo(0, 0.12); shape.closePath();
  const v = new THREE.Mesh(new THREE.ShapeGeometry(shape), toon(THREE, SKIN)); v.position.set(0, 0, FZ + 0.004); torso.add(v);
  stripe(THREE, torso, 0xe8e4ee, 0, -0.2, FZ + 0.006, 0.34, 0.06);
  stripe(THREE, torso, P, 0, -0.17, FZ + 0.009, 0.34, 0.01);
  const brooch = new THREE.Mesh(new THREE.CircleGeometry(0.03, 8), basic(THREE, 0xc0c0d0)); brooch.position.set(0.11, 0.17, FZ + 0.01); torso.add(brooch);
  b.arms.forEach((a) => ring(THREE, a.g, P, -0.5, 0.066, 0.011));
  // кант сапог
  b.legs.forEach((g) => ring(THREE, g, 0xd8d4de, -0.45, 0.094, 0.01));
  // чокер
  const ch = new THREE.Mesh(new THREE.TorusGeometry(0.072, 0.016, 6, 14), basic(THREE, 0x0d0d10));
  ch.rotation.x = Math.PI / 2; ch.position.y = b.HIP + b.torsoH + 0.04; rig.add(ch);
  // книга в левой руке
  const book = part(THREE, new THREE.BoxGeometry(0.06, 0.28, 0.21), toon(THREE, 0x6b3b1f), b.arms[0].g, 0.02, -0.62, 0.06);
  stripe(THREE, book, 0xe8dcc0, 0.031, 0, 0, 0.004, 0.25, 0, 0.18);
  b.book = book;
  // лицо и каре
  face(THREE, head, R * 0.97, 0xc81e3a, { lash: 0x14080c, brow: 0x6a1030 });
  const HM = toon(THREE, 0xa3123f);
  hairShell(THREE, head, HM, R + 0.03, Math.PI * 0.45, 0, 0.02, -0.01);
  const bob = new THREE.Mesh(new THREE.SphereGeometry(R + 0.045, 18, 12, Math.PI / 2 + 0.85, Math.PI * 2 - 1.7, Math.PI * 0.2, Math.PI * 0.52), toon(THREE, 0xa3123f, { side: THREE.DoubleSide }));
  bob.castShadow = true;
  head.add(bob);
  const bo = new THREE.Mesh(bob.geometry, basic(THREE, 0x120a12, { side: THREE.BackSide })); bo.scale.setScalar(1.04); bob.add(bo);
  // кончики каре у скул + чёлка
  [-1, 1].forEach((s) => { const t = spike(THREE, head, HM, [s * 0.2, -1, 0.35], 0.2, 0.08, 0.0); t.position.set(s * 0.27, -0.12, 0.12); });
  [[-0.16, -0.2], [-0.05, 0.05], [0.07, -0.1], [0.17, 0.25]].forEach(([x, k]) => {
    const s = spike(THREE, head, HM, [x + k * 0.4, -0.7, 1], 0.2, 0.08, 0.0);
    s.position.set(x, 0.18, 0.27);
  });
  // фиолетовые искры магии
  const sparks = [];
  const sm = basic(THREE, 0xc084fc, { transparent: true, opacity: 0.9 });
  for (let i = 0; i < 6; i++) {
    const s = new THREE.Mesh(new THREE.OctahedronGeometry(0.045, 0), sm);
    s.scale.set(0.6, 1.4, 0.6);
    b.root.add(s);
    sparks.push({ m: s, a: (i / 6) * Math.PI * 2, r: 0.55 + (i % 2) * 0.15, h: 0.8 + i * 0.18 });
  }
  b.sparks = sparks;
  b.legSwing = 0.45;
  return { ...b, name: 'Мариэль' };
}

// ВЕЛЕС: короткие пепельно-серые зачёсанные волосы, тёмно-зелёный китель с белым кантом на груди
// и рукавах, ремень с пряжкой, тёмные перчатки, высокие чёрные сапоги.
function veles(THREE) {
  const GRN = 0x2f4d38, WH = 0xf1f1ea;
  const b = body(THREE, { torso: GRN, sleeve: GRN, pants: 0x2b4633, shoes: 0x0e0e10, hands: 0x2a1d16, boots: 0x111114, bootH: 0.5, bootTop: 0.11, bootShine: true });
  const { torso, head, R, FZ, rig, HIP } = b;
  // высокий воротник-стойка
  const col = part(THREE, new THREE.CylinderGeometry(0.1, 0.11, 0.1, 10), toon(THREE, GRN), rig, 0, b.HIP + b.torsoH + 0.03, 0.005, 1.08);
  ring(THREE, col, WH, 0.05, 0.1, 0.008);
  // белый кант: две вертикальные линии от воротника, ряд пуговиц, «галуны» на груди
  [-1, 1].forEach((s) => {
    stripe(THREE, torso, WH, s * 0.085, 0.05, FZ + 0.008, 0.016, 0.5, s * 0.06);
    stripe(THREE, torso, WH, s * 0.15, 0.26, FZ + 0.008, 0.016, 0.12, -s * 1.1);
    for (let i = 0; i < 3; i++) stripe(THREE, torso, WH, s * 0.18, -0.06 - i * 0.045, FZ + 0.006, 0.07, 0.012, 0);
  });
  for (let i = 0; i < 4; i++) {
    const btn = new THREE.Mesh(new THREE.CircleGeometry(0.014, 8), basic(THREE, 0xb08d3c));
    btn.position.set(0, 0.2 - i * 0.11, FZ + 0.01);
    torso.add(btn);
  }
  // ремень с пряжкой
  const belt = part(THREE, new THREE.CylinderGeometry(0.205, 0.205, 0.06, 12), toon(THREE, 0x141416), rig, 0, HIP + 0.04, 0, 0);
  belt.scale.z = 0.74;
  const buckle = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.05, 0.02), toon(THREE, 0xb08d3c, { emissive: 0x2a1e05 }));
  buckle.position.set(0, HIP + 0.04, 0.155);
  rig.add(buckle);
  // полосы на рукавах
  b.arms.forEach((a) => { ring(THREE, a.g, WH, -0.36, 0.072, 0.01); ring(THREE, a.g, WH, -0.41, 0.07, 0.01); ring(THREE, a.g, WH, -0.46, 0.068, 0.01); });
  // лицо: серо-зелёные глаза; волосы — гладко зачёсанные назад, короткие
  face(THREE, head, R * 0.97, 0x5f7f6a, { brow: 0x777777 });
  const HG = toon(THREE, 0xb7b6ad);
  const cap = hairShell(THREE, head, HG, R + 0.022, Math.PI * 0.42, 0, 0.035, -0.02);
  cap.scale.set(1, 1.02, 1.06);
  const back = new THREE.Mesh(new THREE.SphereGeometry(R + 0.02, 18, 12, Math.PI / 2 + 1.5, Math.PI * 2 - 3.0, Math.PI * 0.3, Math.PI * 0.32), toon(THREE, 0xb7b6ad, { side: THREE.DoubleSide }));
  head.add(back);
  // зачёс: несколько гладких прядей назад-вверх
  [[-0.14], [0], [0.13]].forEach(([x], i) => {
    const s = spike(THREE, head, HG, [x, 0.5, -0.9], 0.2, 0.07, 0.0);
    s.position.set(x, 0.27, 0.12 - i * 0.0);
  });
  const lock = spike(THREE, head, HG, [0.4, -0.8, 1], 0.14, 0.05, 0); lock.position.set(0.1, 0.19, 0.28);
  return { ...b, name: 'Велес' };
}

// Привязка персонажей к классам сервера (id классов не меняются для совместимости)
export const HERO_BY_CLASS = {
  warrior: { id: 'veles', name: 'Велес', build: veles },
  spearman: { id: 'noford', name: 'Нофорд', build: noford },
  rogue: { id: 'kavega', name: 'Кавега', build: kavega },
  mage: { id: 'mariel', name: 'Мариэль', build: mariel },
};

export function hasHero(classId) { return !!HERO_BY_CLASS[classId]; }

export function makeHero(THREE, classId) {
  const def = HERO_BY_CLASS[classId];
  const h = def.build(THREE);
  let phase = Math.random() * 6;
  let yaw = 0;
  const swingK = h.legSwing || 0.7;
  return {
    group: h.root,
    kind: classId,
    heroName: def.name,
    update(dt, moving, t, dirX = 0, dirY = 1) {
      phase += dt * (moving ? 10 : 2);
      const sw = moving ? Math.sin(phase) * swingK : 0;
      h.legs[0].rotation.x = sw;
      h.legs[1].rotation.x = -sw;
      h.arms[0].g.rotation.x = -sw * 0.8 - (h.book ? 0.35 : 0);
      h.arms[1].g.rotation.x = sw * 0.8;
      h.rig.position.y = moving ? Math.abs(Math.sin(phase)) * 0.05 : Math.sin(t * 2) * 0.012;
      h.head.rotation.z = moving ? 0 : Math.sin(t * 0.9) * 0.03;
      if (h.coat) h.coat.rotation.x = moving ? -0.12 - Math.abs(sw) * 0.08 : 0;
      if (Math.abs(dirX) + Math.abs(dirY) > 0.01) {
        const target = Math.atan2(dirX, dirY);
        let d = target - yaw;
        while (d > Math.PI) d -= Math.PI * 2;
        while (d < -Math.PI) d += Math.PI * 2;
        yaw += d * Math.min(1, dt * 14);
        h.root.rotation.y = yaw;
      }
      if (h.sparks) {
        h.sparks.forEach((s, i) => {
          const a = s.a + t * (1.2 + i * 0.1);
          s.m.position.set(Math.cos(a) * s.r, s.h + Math.sin(t * 3 + i) * 0.1, Math.sin(a) * s.r);
          s.m.rotation.y = t * 3;
        });
      }
    },
    setTint() {},
    // Поза для генерации спрайт-листов (tools/mc-sprites): sw — размах шага, yawRad — поворот
    pose(sw, yawRad) {
      h.legs[0].rotation.x = sw; h.legs[1].rotation.x = -sw;
      h.arms[0].g.rotation.x = -sw * 0.8 - (h.book ? 0.35 : 0); h.arms[1].g.rotation.x = sw * 0.8;
      h.rig.position.y = Math.abs(sw) > 0.01 ? 0.04 : 0; h.head.rotation.z = 0;
      if (h.coat) h.coat.rotation.x = Math.abs(sw) > 0.01 ? -0.16 : 0;
      yaw = yawRad; h.root.rotation.y = yawRad;
    },
    // «Чиби»-пропорции для пиксельного листа: крупнее голова, как у спрайтов проекта
    chibi(k) { h.head.scale.setScalar(k); },
  };
}
