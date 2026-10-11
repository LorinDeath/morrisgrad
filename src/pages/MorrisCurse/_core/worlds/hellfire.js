// Мир Адского Пламени: ар-деко арена в золотой раме, обсидиановые шпили и искры.
import { createArtDecoCanvas } from './artDeco.js';
import { HALF } from '../engine/geometry.js';

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
    const tex = new THREE.CanvasTexture(createArtDecoCanvas());
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(size / 3.2, size / 3.2);
    tex.anisotropy = 4;
    if (THREE.sRGBEncoding) tex.encoding = THREE.sRGBEncoding;
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85, metalness: 0.15 }));
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    g.add(floor);

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

    // Золотая рама арены (низкий бортик)
    const gold = new THREE.MeshStandardMaterial({ color: 0xc59b27, metalness: 0.75, roughness: 0.3, emissive: 0x3d2a00, emissiveIntensity: 0.4 });
    const stone = new THREE.MeshStandardMaterial({ color: 0x1b1428, roughness: 0.8, flatShading: true });
    const t = 0.6;
    [[0, -HALF - t / 2, size + t * 2, t], [0, HALF + t / 2, size + t * 2, t], [-HALF - t / 2, 0, t, size], [HALF + t / 2, 0, t, size]].forEach(([x, z, w, d]) => {
      const wall = new THREE.Mesh(new THREE.BoxGeometry(w, 0.7, d), stone);
      wall.position.set(x, 0.35, z);
      wall.receiveShadow = true;
      g.add(wall);
      const trim = new THREE.Mesh(new THREE.BoxGeometry(w + 0.02, 0.08, d + 0.02), gold);
      trim.position.set(x, 0.72, z);
      g.add(trim);
    });
    // Обелиски по углам и по сторонам
    const obMat = new THREE.MeshStandardMaterial({ color: 0x140f1f, roughness: 0.5, metalness: 0.3, flatShading: true });
    const tipMat = new THREE.MeshBasicMaterial({ color: 0xf59e0b });
    for (let i = 0; i < 12; i++) {
      const side = i % 4;
      const k = Math.floor(i / 4) - 1; // -1,0,1
      const along = k * (HALF * 0.66);
      const out = HALF + 1.6;
      const x = side === 0 ? along : side === 1 ? out : side === 2 ? along : -out;
      const z = side === 0 ? -out : side === 1 ? along : side === 2 ? out : along;
      const ob = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.75, 6 + (i % 3), 4), obMat);
      ob.position.set(x, (6 + (i % 3)) / 2 - 0.3, z);
      ob.rotation.y = Math.PI / 4;
      ob.castShadow = true;
      g.add(ob);
      const tip = new THREE.Mesh(new THREE.OctahedronGeometry(0.25, 0), tipMat);
      tip.position.set(x, 6.4 + (i % 3), z);
      g.add(tip);
    }
    // Шпили-скалы в пустоши
    const rockMat = new THREE.MeshStandardMaterial({ color: 0x1c1212, flatShading: true, roughness: 0.95 });
    for (let i = 0; i < 46; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = HALF + 6 + Math.random() * 40;
      const h = 2 + Math.random() * 9;
      const rock = new THREE.Mesh(new THREE.ConeGeometry(0.8 + Math.random() * 1.8, h, 5), rockMat);
      rock.position.set(Math.cos(a) * r, h / 2 - 0.6, Math.sin(a) * r);
      rock.rotation.y = Math.random() * 3;
      g.add(rock);
    }
    // Лавовые трещины во внешней пустоши
    const lavaMat = new THREE.MeshBasicMaterial({ color: 0xff5a1f, transparent: true, opacity: 0.75 });
    for (let i = 0; i < 26; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = HALF + 4 + Math.random() * 30;
      const crack = new THREE.Mesh(new THREE.PlaneGeometry(0.25 + Math.random() * 0.4, 3 + Math.random() * 8), lavaMat);
      crack.rotation.x = -Math.PI / 2;
      crack.rotation.z = Math.random() * Math.PI;
      crack.position.set(Math.cos(a) * r, -0.57, Math.sin(a) * r);
      g.add(crack);
    }

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
