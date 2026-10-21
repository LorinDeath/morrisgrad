// Процедурные low-poly модели: герои классов, Кейт, Дар, тюльпаны, порталы, орда, лут.
// Никаких внешних ассетов — всё строится из примитивов Three.js r128.
import { propObject, PROP_SET } from './propAtlas.js';
import { PROP_FPS, PORTAL_S } from './gfxCfg.js';
import { propEmitter as lightEmitter } from './propEmitter.js';
import altar3Src from '../../../../assets/mc/props3/altar/altar.png'; // props3: 32 кадра 64×96 @16 (грузится только при наборе v3)
import { GRADE } from './atmosphere.js';
import { LIGHT, pixTex, setDisplayRGB } from './pixColor.js';
import { mergeParts, flatMat, PX as PX_M } from './geometry.js';
import altarSrc from '../../../../assets/mc/altar.png';
import altarFlashSrc from '../../../../assets/mc/altar_flash.png';

const SKIN = 0xf1c7a1;

function std(THREE, color, extra = {}) {
  return new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.7, metalness: 0.05, ...extra });
}

function mesh(THREE, geo, mat, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  return m;
}

// ---------------------------------------------------------------------------
// ГУМАНОИДЫ (игроки и боссы сервера)
// ---------------------------------------------------------------------------
const LOOKS = {
  warrior: { body: 0x3b82f6, trim: 0xcbd5e1, legs: 0x1e293b, head: 'helmet' },
  spearman: { body: 0xb91c1c, trim: 0xfbbf24, legs: 0x3f1d1d, head: 'cap' },
  rogue: { body: 0x166534, trim: 0x4ade80, legs: 0x1c1917, head: 'hood' },
  mage: { body: 0x6b21a8, trim: 0xe9d5ff, legs: 0x2e1065, head: 'wizard' },
  keyt: { body: 0x1f1b2e, trim: 0xf472b6, legs: 0x0f0c18, head: 'knight' },
  dar: { body: 0x065f46, trim: 0x34d399, legs: 0x1f2937, head: 'jester' },
};

export function makeHumanoid(THREE, kind, tint) {
  if (!LOOKS[kind]) return makeSoul(THREE, tint);
  const L = LOOKS[kind];
  const g = new THREE.Group();
  const rig = new THREE.Group();
  g.add(rig);
  const scale = kind === 'keyt' || kind === 'dar' ? 1.18 : 1;
  rig.scale.setScalar(scale);

  const bodyMat = std(THREE, L.body);
  const trimMat = std(THREE, L.trim, { metalness: 0.35, roughness: 0.45 });
  const legMat = std(THREE, L.legs);
  const skinMat = std(THREE, SKIN);

  const torso = mesh(THREE, new THREE.CylinderGeometry(0.34, 0.42, 0.78, 7), bodyMat, 0, 1.02, 0);
  rig.add(torso);
  const belt = mesh(THREE, new THREE.CylinderGeometry(0.43, 0.43, 0.1, 7), trimMat, 0, 0.7, 0);
  rig.add(belt);

  const legGeo = new THREE.BoxGeometry(0.2, 0.62, 0.22);
  legGeo.translate(0, -0.31, 0);
  const legL = mesh(THREE, legGeo, legMat, -0.16, 0.66, 0);
  const legR = mesh(THREE, legGeo, legMat, 0.16, 0.66, 0);
  rig.add(legL, legR);

  const armGeo = new THREE.BoxGeometry(0.16, 0.58, 0.18);
  armGeo.translate(0, -0.27, 0);
  const armL = mesh(THREE, armGeo, bodyMat, -0.47, 1.36, 0);
  const armR = mesh(THREE, armGeo, bodyMat, 0.47, 1.36, 0);
  rig.add(armL, armR);

  const head = new THREE.Group();
  head.position.set(0, 1.66, 0);
  rig.add(head);
  head.add(mesh(THREE, new THREE.IcosahedronGeometry(0.3, 0), skinMat));
  const eyeMat = new THREE.MeshBasicMaterial({ color: kind === 'keyt' ? 0xff4fd8 : 0x111111 });
  const eyeGeo = new THREE.BoxGeometry(0.07, 0.07, 0.04);
  const e1 = new THREE.Mesh(eyeGeo, eyeMat); e1.position.set(-0.11, 0.03, 0.27);
  const e2 = new THREE.Mesh(eyeGeo, eyeMat); e2.position.set(0.11, 0.03, 0.27);
  head.add(e1, e2);

  if (L.head === 'helmet' || L.head === 'knight') {
    const helm = mesh(THREE, new THREE.CylinderGeometry(0.33, 0.35, 0.36, 8, 1, true), trimMat, 0, 0.08, 0);
    helm.material.side = THREE.DoubleSide;
    head.add(helm);
    head.add(mesh(THREE, new THREE.SphereGeometry(0.33, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2), trimMat, 0, 0.24, 0));
    if (L.head === 'knight') {
      const plume = mesh(THREE, new THREE.ConeGeometry(0.1, 0.55, 5), std(THREE, 0xf472b6, { emissive: 0x9d174d, emissiveIntensity: 0.6 }), 0, 0.6, -0.08);
      plume.rotation.x = -0.5;
      head.add(plume);
    }
  } else if (L.head === 'cap') {
    head.add(mesh(THREE, new THREE.ConeGeometry(0.36, 0.3, 6), trimMat, 0, 0.32, 0));
  } else if (L.head === 'hood') {
    const hood = mesh(THREE, new THREE.ConeGeometry(0.4, 0.62, 6), bodyMat, 0, 0.2, -0.04);
    head.add(hood);
    const mask = mesh(THREE, new THREE.BoxGeometry(0.42, 0.12, 0.08), std(THREE, 0x111827), 0, -0.08, 0.26);
    head.add(mask);
  } else if (L.head === 'wizard') {
    head.add(mesh(THREE, new THREE.CylinderGeometry(0.46, 0.46, 0.05, 10), bodyMat, 0, 0.2, 0));
    const hat = mesh(THREE, new THREE.ConeGeometry(0.3, 0.75, 7), bodyMat, 0, 0.58, -0.05);
    hat.rotation.x = -0.18;
    head.add(hat);
    const brim = mesh(THREE, new THREE.TorusGeometry(0.3, 0.04, 4, 10), trimMat, 0, 0.25, 0);
    brim.rotation.x = Math.PI / 2;
    head.add(brim);
  } else if (L.head === 'jester') {
    const hm = std(THREE, 0x34d399);
    const h2 = std(THREE, 0x7c3aed);
    const c1 = mesh(THREE, new THREE.ConeGeometry(0.13, 0.55, 5), hm, -0.2, 0.42, 0); c1.rotation.z = 0.7;
    const c2 = mesh(THREE, new THREE.ConeGeometry(0.13, 0.55, 5), h2, 0.2, 0.42, 0); c2.rotation.z = -0.7;
    head.add(c1, c2);
    const bellMat = std(THREE, 0xfacc15, { metalness: 0.6, roughness: 0.3 });
    head.add(mesh(THREE, new THREE.IcosahedronGeometry(0.07, 0), bellMat, -0.42, 0.55, 0));
    head.add(mesh(THREE, new THREE.IcosahedronGeometry(0.07, 0), bellMat, 0.42, 0.55, 0));
  }

  // Оружие/атрибуты класса — в правой руке
  const hand = new THREE.Group();
  hand.position.set(0, -0.55, 0.06);
  armR.add(hand);
  const steel = std(THREE, 0xe2e8f0, { metalness: 0.7, roughness: 0.25 });
  if (kind === 'warrior') {
    const blade = mesh(THREE, new THREE.BoxGeometry(0.08, 0.9, 0.03), steel, 0, 0.35, 0.12);
    blade.rotation.x = Math.PI / 2.4;
    hand.add(blade);
    const shield = mesh(THREE, new THREE.CylinderGeometry(0.3, 0.3, 0.07, 6), trimMat, -0.06, -0.15, 0.1);
    shield.rotation.z = Math.PI / 2;
    armL.add(shield);
    shield.position.set(-0.12, -0.35, 0.05);
  } else if (kind === 'spearman') {
    const shaft = mesh(THREE, new THREE.CylinderGeometry(0.035, 0.035, 1.9, 5), std(THREE, 0x7c4a1e), 0, 0.2, 0.25);
    shaft.rotation.x = Math.PI / 2.2;
    hand.add(shaft);
    const tip = mesh(THREE, new THREE.ConeGeometry(0.08, 0.3, 4), steel, 0, 0.4, 1.17);
    tip.rotation.x = Math.PI / 2.2;
    hand.add(tip);
  } else if (kind === 'rogue') {
    const d1 = mesh(THREE, new THREE.ConeGeometry(0.05, 0.42, 4), steel, 0, 0.05, 0.22);
    d1.rotation.x = Math.PI / 2;
    hand.add(d1);
    const d2 = d1.clone();
    armL.add(d2);
    d2.position.set(0, -0.55, 0.28);
  } else if (kind === 'mage') {
    const staff = mesh(THREE, new THREE.CylinderGeometry(0.03, 0.04, 1.5, 5), std(THREE, 0x5b3714), 0, 0.3, 0.06);
    hand.add(staff);
    const orb = mesh(THREE, new THREE.IcosahedronGeometry(0.13, 1), new THREE.MeshBasicMaterial({ color: 0xc084fc }), 0, 1.08, 0.06);
    hand.add(orb);
  } else if (kind === 'keyt') {
    const great = mesh(THREE, new THREE.BoxGeometry(0.12, 1.4, 0.04), std(THREE, 0x9ca3af, { metalness: 0.8, roughness: 0.2, emissive: 0x831843, emissiveIntensity: 0.25 }), 0, 0.6, 0.15);
    great.rotation.x = Math.PI / 2.6;
    hand.add(great);
    const cape = mesh(THREE, new THREE.BoxGeometry(0.75, 1.1, 0.04), std(THREE, 0x831843, { side: THREE.DoubleSide }), 0, 1.0, -0.36);
    cape.rotation.x = 0.12;
    rig.add(cape);
  } else if (kind === 'dar') {
    const wand = mesh(THREE, new THREE.CylinderGeometry(0.03, 0.03, 0.8, 5), std(THREE, 0xfacc15), 0, 0.15, 0.1);
    hand.add(wand);
    hand.add(mesh(THREE, new THREE.OctahedronGeometry(0.12, 0), new THREE.MeshBasicMaterial({ color: 0x34d399 }), 0, 0.6, 0.1));
  }

  // Цветовой акцент игрока (наплечники в цвет игрока)
  if (tint && kind !== 'keyt' && kind !== 'dar') {
    const padMat = std(THREE, tint, { emissive: tint, emissiveIntensity: 0.15 });
    rig.add(mesh(THREE, new THREE.IcosahedronGeometry(0.15, 0), padMat, -0.47, 1.4, 0));
    rig.add(mesh(THREE, new THREE.IcosahedronGeometry(0.15, 0), padMat, 0.47, 1.4, 0));
  }

  let phase = Math.random() * 6;
  return {
    group: g,
    kind,
    update(dt, moving, t) {
      phase += dt * (moving ? 11 : 2.2);
      const sw = moving ? Math.sin(phase) * 0.7 : 0;
      legL.rotation.x = sw;
      legR.rotation.x = -sw;
      armL.rotation.x = -sw * 0.8;
      armR.rotation.x = sw * 0.6 - (moving ? 0 : 0.15);
      rig.position.y = moving ? Math.abs(Math.sin(phase)) * 0.08 : Math.sin(t * 2) * 0.02;
    },
    attackPose(k) { armR.rotation.x = -1.6 * k; },
  };
}

export function makeSoul(THREE, tint = 0xffffff) {
  const g = new THREE.Group();
  const rig = new THREE.Group();
  g.add(rig);
  const mat = new THREE.MeshStandardMaterial({ color: tint || 0xe0f2fe, emissive: 0x67e8f9, emissiveIntensity: 0.35, transparent: true, opacity: 0.82, flatShading: true });
  const body = new THREE.Mesh(new THREE.ConeGeometry(0.48, 1.25, 8, 1, true), mat);
  body.rotation.x = Math.PI;
  body.position.y = 0.95;
  rig.add(body);
  const head = new THREE.Mesh(new THREE.IcosahedronGeometry(0.42, 1), mat);
  head.position.y = 1.55;
  rig.add(head);
  const eyeMat = new THREE.MeshBasicMaterial({ color: 0x0b1020 });
  const eg = new THREE.SphereGeometry(0.07, 6, 4);
  const e1 = new THREE.Mesh(eg, eyeMat); e1.position.set(-0.14, 1.6, 0.36);
  const e2 = new THREE.Mesh(eg, eyeMat); e2.position.set(0.14, 1.6, 0.36);
  rig.add(e1, e2);
  let phase = Math.random() * 6;
  return {
    group: g,
    kind: 'soul',
    update(dt, moving, t) {
      phase += dt * (moving ? 6 : 2);
      rig.position.y = 0.15 + Math.sin(phase) * 0.12;
      rig.rotation.z = moving ? Math.sin(phase) * 0.08 : 0;
    },
    attackPose() {},
  };
}

// ---------------------------------------------------------------------------
// ТЮЛЬПАНЫ-ВАМПИРЫ (bud / mature / active + тип)
// ---------------------------------------------------------------------------
const FLOWER_COLORS = { normal: 0xf43f5e, fire: 0xf97316, frost: 0x38bdf8, hell: 0xa855f7 };

export function makeFlower(THREE) {
  const g = new THREE.Group();
  const stemMat = std(THREE, 0x15803d);
  const stem = mesh(THREE, new THREE.CylinderGeometry(0.06, 0.09, 0.9, 5), stemMat, 0, 0.45, 0);
  g.add(stem);
  const leafGeo = new THREE.ConeGeometry(0.16, 0.6, 3);
  const l1 = mesh(THREE, leafGeo, stemMat, -0.2, 0.25, 0); l1.rotation.z = 1.0;
  const l2 = mesh(THREE, leafGeo, stemMat, 0.2, 0.3, 0); l2.rotation.z = -1.0;
  g.add(l1, l2);
  const headG = new THREE.Group();
  headG.position.y = 0.95;
  g.add(headG);
  const petalMat = std(THREE, 0xf43f5e, { emissive: 0x000000 });
  const bud = mesh(THREE, new THREE.IcosahedronGeometry(0.28, 0), petalMat);
  bud.scale.set(1, 1.4, 1);
  headG.add(bud);
  const petals = [];
  const petalGeo = new THREE.ConeGeometry(0.2, 0.62, 4);
  petalGeo.translate(0, 0.31, 0);
  for (let i = 0; i < 5; i++) {
    const p = mesh(THREE, petalGeo, petalMat);
    p.rotation.y = (i / 5) * Math.PI * 2;
    p.rotation.z = 0.7;
    const pivot = new THREE.Group();
    pivot.rotation.y = (i / 5) * Math.PI * 2;
    p.rotation.set(0.8, 0, 0);
    pivot.add(p);
    headG.add(pivot);
    petals.push(p);
  }
  const fangMat = std(THREE, 0xfef3c7);
  const fangs = new THREE.Group();
  for (let i = 0; i < 6; i++) {
    const f = mesh(THREE, new THREE.ConeGeometry(0.035, 0.14, 3), fangMat);
    const a = (i / 6) * Math.PI * 2;
    f.position.set(Math.cos(a) * 0.15, 0.12, Math.sin(a) * 0.15);
    fangs.add(f);
  }
  headG.add(fangs);
  const glow = new THREE.PointLight(0xf43f5e, 0, 4);
  glow.position.y = 1.2;
  g.add(glow);

  let state = '';
  let t0 = Math.random() * 10;
  return {
    group: g,
    set(fl) {
      const key = `${fl.stage}_${fl.flowerType}`;
      if (key === state) return;
      state = key;
      const isActive = fl.stage === 'active';
      const col = isActive ? (FLOWER_COLORS[fl.flowerType] || 0xf43f5e) : (fl.stage === 'mature' ? 0x38bdf8 : 0x86efac);
      petalMat.color.setHex(col);
      petalMat.emissive.setHex(fl.stage === 'mature' ? 0x0c4a6e : (isActive ? col : 0x000000));
      petalMat.emissiveIntensity = isActive ? 0.35 : 0.5;
      petals.forEach((p) => { p.visible = isActive; });
      fangs.visible = isActive;
      bud.visible = !isActive;
      bud.scale.setScalar(fl.stage === 'mature' ? 1.25 : 0.8);
      bud.scale.y *= 1.4;
      g.scale.setScalar(isActive ? 1.35 : (fl.stage === 'mature' ? 1.1 : 0.8));
      glow.color.setHex(col);
      glow.intensity = isActive ? 0.9 : (fl.stage === 'mature' ? 0.6 : 0);
    },
    update(dt, moving, t) {
      t0 += dt;
      headG.rotation.z = Math.sin(t0 * 2.2) * 0.12;
      headG.rotation.y += dt * (moving ? 3 : 0.5);
      const open = 0.6 + Math.sin(t0 * 3) * 0.25;
      petals.forEach((p) => { p.rotation.x = open; });
    },
  };
}

// ---------------------------------------------------------------------------
// ПОРТАЛЫ
// ---------------------------------------------------------------------------
export function makePortal(THREE, portal) {
  const g = new THREE.Group();
  const color = new THREE.Color(portal.color || '#a855f7');
  const anim = [];
  let flash = null;

  if (portal.id === 'portal_class_select') {
    // Алтарь Перевоплощения: пиксельный билборд (8 кадров 64×96, цикл) + вспышка (6 кадров) при открытии/выборе героя.
    // Низ привязан к земле (линия земли в кадре — y=93), 1 px арта ≈ 1 px мира (20 px/м) → основание ~60 px ≈ 2.9 м
    const FW = 64, FH = 96, GROUND = 93, M = 1 / PX_M;
    const mkSheet = (src, n) => { const tex = new THREE.TextureLoader().load(src); tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.NearestFilter; tex.generateMipmaps = false;
      pixTex(THREE, tex); tex.repeat.set(1 / n, 1); return tex; }; // sRGB-лист: без двойного кодирования (pixColor.js)
    // в сборке Astro импорт PNG — объект { src }, в Vite — строка
    const aUrl = (x) => (typeof x === 'object' && x ? x.src || x.default?.src || x.default || '' : x);
    const A3 = PROP_SET === 'v3', AN = A3 ? 32 : 8, AFPS = A3 ? 16 : 8; // v3 — тот же рисунок, кадров вчетверо больше, плавнее
    const idleTex = mkSheet(aUrl(A3 ? altar3Src : altarSrc), AN), flashTex = mkSheet(aUrl(altarFlashSrc), 6);
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: idleTex, transparent: true, alphaTest: 0.3, toneMapped: false }));
    sp.center.set(0.5, (FH - GROUND) / FH); sp.scale.set(FW * M, FH * M, 1); sp.renderOrder = 2;
    g.add(sp);
    let flashAt = -1, nowT = 0;
    flash = () => { flashAt = nowT; };
    anim.push((t) => {
      nowT = t;
      { const G = GRADE.value || { r: 1, g: 1, b: 1 }, k = LIGHT.props; setDisplayRGB(sp.material.color, G.r * k, G.g * k, G.b * k); } // тон зоны, как у пропсов
      const fl = flashAt >= 0 ? Math.floor((t - flashAt) * 12) : -1; // вспышка 12 к/с, один раз
      if (fl >= 0 && fl < 6) { if (sp.material.map !== flashTex) { sp.material.map = flashTex; sp.material.needsUpdate = true; } flashTex.offset.x = fl / 6; }
      else { if (flashAt >= 0) flashAt = -1; if (sp.material.map !== idleTex) { sp.material.map = idleTex; sp.material.needsUpdate = true; } idleTex.offset.x = (Math.floor(t * AFPS * PROP_FPS.value) % AN) / AN; }
    });
    const light = new THREE.PointLight(0xa855f7, 2.2, 14, 1.6);
    light.position.y = 2;
    g.add(light);
    anim.push((t) => { light.intensity = 2 + Math.sin(t * 7) * 0.4; });
    // Зона убежища (кольцо на земле)
    const ring = new THREE.Mesh(new THREE.RingGeometry(5.3, 5.5, 48), new THREE.MeshBasicMaterial({ color: 0xa855f7, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.03;
    g.add(ring);
    anim.push((t) => { ring.material.opacity = 0.22 + Math.sin(t * 2) * 0.1; });
  } else {
    // Порталы (Фрактал Бабочки, разломы мини-игр и др.) — спрайт пропсов v2 «portal» (арка + вихрь, 8 кадров, свечение),
    // тон вихря — цвет портала. Коллизия — только «ноги» арки по краям (server/meta/propsV2.ts), центр проходим: портал активируется
    const po = propObject(THREE, 'portal', { s: PORTAL_S, glowTint: color }); // набор — с откатом на props2 (fallback_v2.json)
    g.add(po.group);
    const light = new THREE.PointLight(color, 1.5, 10, 1.6);
    const em = lightEmitter('portal', 0, po.set); light.position.set(em ? em.dx * PORTAL_S : 0, em ? em.h * PORTAL_S : 1.8, 0); // свет — из вихря
    g.add(light);
    anim.push((t) => { po.update(t); light.intensity = 1.4 + Math.sin(t * 4) * 0.25; });
  }
  return { group: g, update(t) { anim.forEach((f) => f(t)); }, flash() { flash?.(); } };
}

// ---------------------------------------------------------------------------
// ОРДА: слитые геометрии для InstancedMesh
// ---------------------------------------------------------------------------
export function buildEnemyGeometries(THREE) {
  const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
  const ico = (r, d = 0) => new THREE.IcosahedronGeometry(r, d);
  const cone = (r, h, s = 5) => new THREE.ConeGeometry(r, h, s);
  const cyl = (a, b, h, s = 6) => new THREE.CylinderGeometry(a, b, h, s);

  const geos = {};
  // Бес — мелкий, рогатый, быстрый
  geos.imp = mergeParts(THREE, [
    { geo: ico(0.42, 0), color: 0xb91c1c, pos: [0, 0.6, 0], scale: [1, 0.9, 1] },
    { geo: cone(0.09, 0.35, 4), color: 0x1c1917, pos: [-0.2, 1.0, 0], rot: [0, 0, 0.4] },
    { geo: cone(0.09, 0.35, 4), color: 0x1c1917, pos: [0.2, 1.0, 0], rot: [0, 0, -0.4] },
    { geo: box(0.1, 0.1, 0.05), color: 0xfde047, pos: [-0.13, 0.7, 0.36] },
    { geo: box(0.1, 0.1, 0.05), color: 0xfde047, pos: [0.13, 0.7, 0.36] },
    { geo: box(0.12, 0.3, 0.12), color: 0x7f1d1d, pos: [-0.15, 0.15, 0] },
    { geo: box(0.12, 0.3, 0.12), color: 0x7f1d1d, pos: [0.15, 0.15, 0] },
    { geo: cone(0.06, 0.4, 3), color: 0x7f1d1d, pos: [0, 0.45, -0.45], rot: [-1.2, 0, 0] },
  ]);
  // Упырь — серо-зелёный, сутулый
  geos.ghoul = mergeParts(THREE, [
    { geo: cyl(0.3, 0.38, 0.8, 6), color: 0x4d7c0f, pos: [0, 0.85, -0.05], rot: [0.3, 0, 0] },
    { geo: ico(0.3, 0), color: 0x84cc16, pos: [0, 1.38, 0.18] },
    { geo: box(0.08, 0.08, 0.04), color: 0xef4444, pos: [-0.1, 1.42, 0.45] },
    { geo: box(0.08, 0.08, 0.04), color: 0xef4444, pos: [0.1, 1.42, 0.45] },
    { geo: box(0.14, 0.7, 0.14), color: 0x3f6212, pos: [-0.4, 0.95, 0.25], rot: [-1.0, 0, 0] },
    { geo: box(0.14, 0.7, 0.14), color: 0x3f6212, pos: [0.4, 0.95, 0.25], rot: [-1.0, 0, 0] },
    { geo: box(0.17, 0.5, 0.17), color: 0x27272a, pos: [-0.15, 0.25, 0] },
    { geo: box(0.17, 0.5, 0.17), color: 0x27272a, pos: [0.15, 0.25, 0] },
  ]);
  // Голем пепла — массивный
  geos.golem = mergeParts(THREE, [
    { geo: ico(0.75, 0), color: 0x44403c, pos: [0, 1.0, 0], scale: [1.1, 1, 0.9] },
    { geo: ico(0.35, 0), color: 0x57534e, pos: [0, 1.85, 0.1] },
    { geo: box(0.3, 0.12, 0.05), color: 0xf97316, pos: [0, 1.88, 0.42] },
    { geo: ico(0.33, 0), color: 0x292524, pos: [-0.85, 1.0, 0.1] },
    { geo: ico(0.33, 0), color: 0x292524, pos: [0.85, 1.0, 0.1] },
    { geo: box(0.3, 0.5, 0.3), color: 0x1c1917, pos: [-0.3, 0.25, 0] },
    { geo: box(0.3, 0.5, 0.3), color: 0x1c1917, pos: [0.3, 0.25, 0] },
    { geo: box(0.5, 0.06, 0.06), color: 0xfb923c, pos: [0, 1.1, 0.68], rot: [0, 0, 0.5] },
  ]);
  // Летучая мышь
  const wing = new THREE.ConeGeometry(0.5, 0.05, 3);
  geos.bat = mergeParts(THREE, [
    { geo: ico(0.22, 0), color: 0x312e81, pos: [0, 1.3, 0] },
    { geo: wing, color: 0x4c1d95, pos: [-0.45, 1.35, 0], rot: [0, 0, Math.PI / 2], scale: [1, 1, 0.8] },
    { geo: wing, color: 0x4c1d95, pos: [0.45, 1.35, 0], rot: [0, 0, -Math.PI / 2], scale: [1, 1, 0.8] },
    { geo: box(0.06, 0.06, 0.04), color: 0xf43f5e, pos: [-0.07, 1.35, 0.2] },
    { geo: box(0.06, 0.06, 0.04), color: 0xf43f5e, pos: [0.07, 1.35, 0.2] },
    { geo: cone(0.05, 0.16, 3), color: 0x1e1b4b, pos: [-0.1, 1.55, 0] },
    { geo: cone(0.05, 0.16, 3), color: 0x1e1b4b, pos: [0.1, 1.55, 0] },
  ]);
  // Плевун — стреляет кислотой
  geos.spitter = mergeParts(THREE, [
    { geo: cyl(0.45, 0.55, 0.5, 7), color: 0x6d28d9, pos: [0, 0.3, 0] },
    { geo: ico(0.45, 0), color: 0x8b5cf6, pos: [0, 0.85, 0] },
    { geo: cyl(0.14, 0.2, 0.45, 6), color: 0x4c1d95, pos: [0, 1.05, 0.38], rot: [1.2, 0, 0] },
    { geo: ico(0.1, 0), color: 0xa3e635, pos: [0, 1.15, 0.6] },
    { geo: box(0.1, 0.1, 0.05), color: 0xfef08a, pos: [-0.18, 1.0, 0.38] },
    { geo: box(0.1, 0.1, 0.05), color: 0xfef08a, pos: [0.18, 1.0, 0.38] },
  ]);
  // Страж Проклятия — босс орды
  geos.warden = mergeParts(THREE, [
    { geo: cyl(0.8, 1.1, 1.6, 8), color: 0x1f1b2e, pos: [0, 1.4, 0] },
    { geo: ico(0.6, 0), color: 0x312e81, pos: [0, 2.6, 0] },
    { geo: cone(0.18, 0.9, 4), color: 0xc59b27, pos: [-0.5, 3.2, 0], rot: [0, 0, 0.5] },
    { geo: cone(0.18, 0.9, 4), color: 0xc59b27, pos: [0.5, 3.2, 0], rot: [0, 0, -0.5] },
    { geo: box(0.5, 0.12, 0.05), color: 0xf43f5e, pos: [0, 2.65, 0.55] },
    { geo: ico(0.45, 0), color: 0xc59b27, pos: [-1.1, 2.0, 0] },
    { geo: ico(0.45, 0), color: 0xc59b27, pos: [1.1, 2.0, 0] },
    { geo: box(0.25, 1.4, 0.25), color: 0x111827, pos: [-1.2, 1.2, 0.3] },
    { geo: box(0.25, 1.4, 0.25), color: 0x111827, pos: [1.2, 1.2, 0.3] },
    { geo: box(0.4, 0.6, 0.4), color: 0x0f0c18, pos: [-0.4, 0.3, 0] },
    { geo: box(0.4, 0.6, 0.4), color: 0x0f0c18, pos: [0.4, 0.3, 0] },
  ]);
  return geos;
}

export function buildPickupGeometries(THREE) {
  const gem = new THREE.OctahedronGeometry(0.22, 0);
  gem.scale(0.8, 1.3, 0.8);
  const heart = mergeParts(THREE, [
    { geo: new THREE.SphereGeometry(0.2, 8, 6), color: 0xef4444, pos: [-0.14, 0.1, 0] },
    { geo: new THREE.SphereGeometry(0.2, 8, 6), color: 0xef4444, pos: [0.14, 0.1, 0] },
    { geo: new THREE.ConeGeometry(0.3, 0.42, 8), color: 0xdc2626, pos: [0, -0.16, 0], rot: [Math.PI, 0, 0] },
  ]);
  const magnet = mergeParts(THREE, [
    { geo: new THREE.TorusGeometry(0.25, 0.08, 6, 10, Math.PI), color: 0xdc2626, rot: [0, 0, Math.PI] },
    { geo: new THREE.BoxGeometry(0.16, 0.14, 0.16), color: 0xe5e7eb, pos: [-0.25, 0.07, 0] },
    { geo: new THREE.BoxGeometry(0.16, 0.14, 0.16), color: 0xe5e7eb, pos: [0.25, 0.07, 0] },
  ]);
  const bomb = mergeParts(THREE, [
    { geo: new THREE.IcosahedronGeometry(0.28, 1), color: 0x111827 },
    { geo: new THREE.CylinderGeometry(0.05, 0.05, 0.18, 5), color: 0x9ca3af, pos: [0, 0.32, 0] },
    { geo: new THREE.OctahedronGeometry(0.08, 0), color: 0xfbbf24, pos: [0, 0.45, 0] },
  ]);
  const chest = mergeParts(THREE, [
    { geo: new THREE.BoxGeometry(0.7, 0.42, 0.48), color: 0x92400e, pos: [0, 0.21, 0] },
    { geo: new THREE.CylinderGeometry(0.24, 0.24, 0.7, 8, 1, false, 0, Math.PI), color: 0xb45309, pos: [0, 0.42, 0], rot: [0, 0, Math.PI / 2] },
    { geo: new THREE.BoxGeometry(0.74, 0.08, 0.52), color: 0xfacc15, pos: [0, 0.42, 0] },
    { geo: new THREE.BoxGeometry(0.12, 0.16, 0.06), color: 0xfde047, pos: [0, 0.36, 0.26] },
  ]);
  const coin = new THREE.CylinderGeometry(0.18, 0.18, 0.05, 10);
  coin.rotateX(Math.PI / 2);
  return { gem, heart: heart, magnet, bomb, chest, coin };
}

export { flatMat };
