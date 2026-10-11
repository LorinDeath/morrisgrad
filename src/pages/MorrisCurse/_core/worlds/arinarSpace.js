// Фрактал Бабочки «Аринар»: парящая звёздная платформа в открытом космосе.
import { HALF } from '../engine/geometry.js';
import { createArtDecoCanvas } from './artDeco.js';

export class ArinarSpaceEnvironment {
  constructor() {
    this.id = 'arinar';
    this.sky = 0x03020a;
    this.fog = { color: 0x060418, near: 30, far: 95 };
    this.hemi = { sky: 0x8ea2ff, ground: 0x1b0c33, intensity: 0.6 };
    this.sun = { color: 0xc7d2fe, intensity: 0.7 };
  }

  build(THREE) {
    const g = new THREE.Group();
    g.name = 'env-arinar';
    const size = HALF * 2;

    const tex = new THREE.CanvasTexture(createArtDecoCanvas({
      base: '#070a1c', corner: '#0d1230', diamond: '#10163a', inner: '#05061a',
      gold: 'rgba(129, 140, 248, 0.45)', gold2: 'rgba(165, 180, 252, 0.6)', violet: '#2e2a6b',
    }));
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(size / 3.2, size / 3.2);
    if (THREE.sRGBEncoding) tex.encoding = THREE.sRGBEncoding;
    const floor = new THREE.Mesh(new THREE.BoxGeometry(size, 1.2, size), [
      new THREE.MeshStandardMaterial({ color: 0x1e1b4b, flatShading: true }),
      new THREE.MeshStandardMaterial({ color: 0x1e1b4b, flatShading: true }),
      new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6, metalness: 0.3, transparent: true, opacity: 0.93 }),
      new THREE.MeshStandardMaterial({ color: 0x0b0a24 }),
      new THREE.MeshStandardMaterial({ color: 0x1e1b4b, flatShading: true }),
      new THREE.MeshStandardMaterial({ color: 0x1e1b4b, flatShading: true }),
    ]);
    floor.position.y = -0.6;
    floor.receiveShadow = true;
    g.add(floor);
    // Светящийся кант платформы
    const edgeMat = new THREE.MeshBasicMaterial({ color: 0x818cf8 });
    [[0, -HALF, size, 0.08], [0, HALF, size, 0.08], [-HALF, 0, 0.08, size], [HALF, 0, 0.08, size]].forEach(([x, z, w, d]) => {
      const e = new THREE.Mesh(new THREE.BoxGeometry(w, 0.06, d), edgeMat);
      e.position.set(x, 0.01, z);
      g.add(e);
    });
    // Звёздная сфера
    const N = 1400;
    const pos = new Float32Array(N * 3);
    const col = new Float32Array(N * 3);
    const palette = [[1, 1, 1], [0.65, 0.95, 0.99], [0.88, 0.9, 1], [0.98, 0.81, 0.91]];
    for (let i = 0; i < N; i++) {
      const u = Math.random() * 2 - 1;
      const th = Math.random() * Math.PI * 2;
      const r = 90 + Math.random() * 60;
      const s = Math.sqrt(1 - u * u);
      pos[i * 3] = Math.cos(th) * s * r;
      pos[i * 3 + 1] = u * r * 0.7 - 10;
      pos[i * 3 + 2] = Math.sin(th) * s * r;
      const c = palette[i % 4];
      col[i * 3] = c[0]; col[i * 3 + 1] = c[1]; col[i * 3 + 2] = c[2];
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    sg.setAttribute('color', new THREE.BufferAttribute(col, 3));
    this.stars = new THREE.Points(sg, new THREE.PointsMaterial({ size: 0.6, vertexColors: true, transparent: true, opacity: 0.9, depthWrite: false, fog: false }));
    g.add(this.stars);
    // Туманности
    const nebColors = [0x6d28d9, 0x0e7490, 0xbe185d, 0x4338ca];
    for (let i = 0; i < 7; i++) {
      const m = new THREE.Mesh(new THREE.SphereGeometry(10 + Math.random() * 14, 10, 8), new THREE.MeshBasicMaterial({ color: nebColors[i % 4], transparent: true, opacity: 0.09, depthWrite: false, fog: false }));
      const a = (i / 7) * Math.PI * 2;
      m.position.set(Math.cos(a) * 75, -12 + Math.random() * 25, Math.sin(a) * 75);
      g.add(m);
    }
    // Парящие кристаллы-осколки
    this.shards = [];
    const shardMat = new THREE.MeshStandardMaterial({ color: 0xa5b4fc, emissive: 0x4338ca, emissiveIntensity: 0.6, flatShading: true, metalness: 0.3, roughness: 0.2 });
    for (let i = 0; i < 28; i++) {
      const s = new THREE.Mesh(new THREE.OctahedronGeometry(0.6 + Math.random() * 1.8, 0), shardMat);
      const a = Math.random() * Math.PI * 2;
      const r = HALF + 5 + Math.random() * 30;
      s.position.set(Math.cos(a) * r, -6 + Math.random() * 14, Math.sin(a) * r);
      s.userData.base = s.position.y;
      s.userData.ph = Math.random() * 6;
      g.add(s);
      this.shards.push(s);
    }
    // Мотыльки света над платформой
    const M = 60;
    const mp = new Float32Array(M * 3);
    for (let i = 0; i < M; i++) {
      mp[i * 3] = (Math.random() - 0.5) * size;
      mp[i * 3 + 1] = 0.5 + Math.random() * 5;
      mp[i * 3 + 2] = (Math.random() - 0.5) * size;
    }
    const mg = new THREE.BufferGeometry();
    mg.setAttribute('position', new THREE.BufferAttribute(mp, 3));
    this.motes = new THREE.Points(mg, new THREE.PointsMaterial({ color: 0xc4b5fd, size: 0.22, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false }));
    g.add(this.motes);
    this.t = 0;
    this.group = g;
    return g;
  }

  update(dt) {
    this.t += dt;
    if (this.stars) this.stars.rotation.y += dt * 0.004;
    this.shards?.forEach((s) => {
      s.position.y = s.userData.base + Math.sin(this.t * 0.7 + s.userData.ph) * 0.8;
      s.rotation.y += dt * 0.3;
    });
    if (this.motes) {
      const a = this.motes.geometry.attributes.position;
      for (let i = 0; i < a.count; i++) {
        a.array[i * 3] += Math.sin(this.t * 0.8 + i) * dt * 0.4;
        a.array[i * 3 + 2] += Math.cos(this.t * 0.6 + i * 1.3) * dt * 0.4;
      }
      a.needsUpdate = true;
    }
  }
}
