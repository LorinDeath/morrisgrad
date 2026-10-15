// Мир Адского Пламени: ар-деко арена в золотой раме, обсидиановые шпили и искры.
import { createArtDecoCanvas, createStoneCanvas } from './artDeco.js';
import { HALF } from '../engine/geometry.js';
import { loadPropTextures, PropSprites } from '../engine/propAtlas.js';

export class HellfireEnvironment {
  constructor() {
    this.id = 'hellfire';
    this.sky = 0x07050d;
    this.fog = { color: 0x0b0714, near: 26, far: 70 };
    this.hemi = { sky: 0x9b7bd6, ground: 0x2a1006, intensity: 0.55 };
    this.sun = { color: 0xffd9a8, intensity: 0.85 };
  }

  build(THREE) {
    const g = new THREE.Group();
    g.name = 'env-hellfire';
    const size = HALF * 2;

    // Пол арены
    // спокойный тёмный камень вместо пёстрой ар-деко плитки (узор остался только в центре — у Алтаря)
    const tex = new THREE.CanvasTexture(createStoneCanvas({ base: '#17121f', motif: 'rgba(197,155,39,0.08)', moss: 'rgba(70,40,90,0.25)' }, 3));
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(size / 7, size / 7);
    tex.anisotropy = 4;
    if (THREE.sRGBEncoding) tex.encoding = THREE.sRGBEncoding;
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85, metalness: 0.15 }));
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    g.add(floor);

    // Ар-деко «ковёр» у Алтаря перевоплощения — единственный яркий участок, ориентир
    const deco = new THREE.CanvasTexture(createArtDecoCanvas({ base: '#100b18', corner: '#150f22', diamond: '#1a1329', inner: '#0b0812', gold: 'rgba(197,155,39,0.30)', gold2: 'rgba(212,175,55,0.40)' }));
    deco.wrapS = deco.wrapT = THREE.RepeatWrapping;
    deco.repeat.set(4, 4);
    if (THREE.sRGBEncoding) deco.encoding = THREE.sRGBEncoding;
    const carpet = new THREE.Mesh(new THREE.CircleGeometry(7.5, 40), new THREE.MeshStandardMaterial({ map: deco, roughness: 0.8, metalness: 0.2 }));
    carpet.rotation.x = -Math.PI / 2;
    carpet.position.set(565 / 20 - 30, 0.01, 600 / 20 - 30);
    carpet.receiveShadow = true;
    g.add(carpet);

    // Виньетка: тёмное кольцо по краю (как радиальный градиент 2D-версии)
    const vignette = new THREE.Mesh(
      new THREE.RingGeometry(HALF * 0.75, HALF * 1.6, 48, 1),
      new THREE.MeshBasicMaterial({ color: 0x040208, transparent: true, opacity: 0.55, depthWrite: false })
    );
    vignette.rotation.x = -Math.PI / 2;
    vignette.position.y = 0.02;
    g.add(vignette);

    // Внешняя лавовая пустошь
    const outer = new THREE.Mesh(new THREE.PlaneGeometry(260, 260), new THREE.MeshStandardMaterial({ color: 0x120a0a, roughness: 1, emissive: 0x1a0603, emissiveIntensity: 0.6 }));
    outer.rotation.x = -Math.PI / 2;
    outer.position.y = -0.6;
    g.add(outer);

    // Рама арены, обсидиановые шпили, скалы и лава пустоши — спрайты пропсов v2 (hell_wall / hell_spire / hell_crag / lava_vent /
    // hell_flame / brazier) вместо мешей; кадры играет шейдер, варианты — по позиции. Пустошь вне арены недоступна → без коллизий.
    const items = [];
    const R = (() => { let x = 1337; return () => ((x = (x * 16807) % 2147483647) / 2147483647); })(); // детерминированно у всех
    const seg = 6.4 * 0.9; // плитка стены 6.4 м (масштаб 0.9)
    for (const [x0, z0, dx, dz, L] of [[-HALF, -HALF - 0.4, 1, 0, size], [-HALF, HALF + 0.4, 1, 0, size], [-HALF - 0.4, -HALF, 0, 1, size], [HALF + 0.4, -HALF, 0, 1, size]])
      for (let d = seg / 2; d < L; d += seg) items.push(['hell_wall', x0 + dx * d, z0 + dz * d, 0.9]);
    for (let i = 0; i < 12; i++) {
      const side = i % 4, k = Math.floor(i / 4) - 1, along = k * (HALF * 0.66), out = HALF + 1.6;
      const x = side === 0 ? along : side === 1 ? out : side === 2 ? along : -out;
      const z = side === 0 ? -out : side === 1 ? along : side === 2 ? out : along;
      items.push([k === 0 ? 'brazier' : 'hell_spire', x, z, k === 0 ? 1 : 1 + (i % 3) * 0.12]);
    }
    for (let i = 0; i < 46; i++) { const a = R() * Math.PI * 2, r = HALF + 6 + R() * 40; items.push([R() < 0.45 ? 'hell_spire' : 'hell_crag', Math.cos(a) * r, Math.sin(a) * r, 0.8 + R() * 0.7]); }
    for (let i = 0; i < 26; i++) { const a = R() * Math.PI * 2, r = HALF + 4 + R() * 30; items.push([i % 3 ? 'lava_vent' : 'hell_flame', Math.cos(a) * r, Math.sin(a) * r, 0.9 + R() * 0.5]); }
    loadPropTextures(THREE).then((tex) => {
      const B = new PropSprites(THREE, tex, { max: items.length + 4, parent: g });
      B.begin();
      for (const [k, x, z, sc] of items) B.push(k, x * 20, z * 20, x, z, sc, false, 1, k === 'lava_vent' ? -0.55 : 0);
      B.end(); this.props = B;
    }).catch((e) => console.warn('[hellfire props]', e.message));

    // Искры, поднимающиеся вверх
    const N = 220;
    const pos = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      pos[i * 3] = (Math.random() - 0.5) * size * 1.4;
      pos[i * 3 + 1] = Math.random() * 12;
      pos[i * 3 + 2] = (Math.random() - 0.5) * size * 1.4;
    }
    const pg = new THREE.BufferGeometry();
    pg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.embers = new THREE.Points(pg, new THREE.PointsMaterial({ color: 0xff9a3c, size: 0.14, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false }));
    g.add(this.embers);
    this.group = g;
    return g;
  }

  update(dt) {
    if (!this.embers) return;
    const a = this.embers.geometry.attributes.position;
    for (let i = 0; i < a.count; i++) {
      let y = a.array[i * 3 + 1] + dt * (0.6 + (i % 7) * 0.12);
      if (y > 12) y = 0;
      a.array[i * 3 + 1] = y;
      a.array[i * 3] += Math.sin(y + i) * dt * 0.15;
    }
    a.needsUpdate = true;
  }
}
