// 3D-арена комнаты забега: «Склеп» (адский камень) и «Бездна» (осколок Аринара).
import { ARENA_RADIUS } from './data.js';
import { PILLARS } from './run.js';
import { createArtDecoCanvas } from '../worlds/artDeco.js';

export class RunArena {
  constructor(theme = 'crypt') {
    this.theme = theme;
    const abyss = theme === 'abyss';
    this.id = 'run_' + theme;
    this.sky = abyss ? 0x03020a : 0x050308;
    this.fog = abyss ? { color: 0x060418, near: 24, far: 70 } : { color: 0x0a0610, near: 22, far: 60 };
    this.hemi = abyss ? { sky: 0x8ea2ff, ground: 0x1b0c33, intensity: 0.6 } : { sky: 0xb38bd6, ground: 0x2a1006, intensity: 0.5 };
    this.sun = abyss ? { color: 0xc7d2fe, intensity: 0.75 } : { color: 0xffc58a, intensity: 0.8 };
  }

  build(THREE) {
    const abyss = this.theme === 'abyss';
    const g = new THREE.Group();
    const R = ARENA_RADIUS;
    const tex = new THREE.CanvasTexture(createArtDecoCanvas(abyss ? {
      base: '#070a1c', corner: '#0d1230', diamond: '#10163a', inner: '#05061a',
      gold: 'rgba(34, 211, 238, 0.35)', gold2: 'rgba(165, 180, 252, 0.5)', violet: '#2e2a6b',
    } : {
      base: '#120c0c', corner: '#1a1010', diamond: '#1f1414', inner: '#0c0707',
      gold: 'rgba(197, 155, 39, 0.35)', gold2: 'rgba(239, 68, 68, 0.45)', violet: '#3b1d1d',
    }));
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(R / 1.6, R / 1.6);
    if (THREE.sRGBEncoding) tex.encoding = THREE.sRGBEncoding;
    const floor = new THREE.Mesh(new THREE.CircleGeometry(R + 2, 64), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85, metalness: 0.1 }));
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    g.add(floor);
    // Сигил в центре
    const sigil = new THREE.Mesh(new THREE.RingGeometry(5, 5.4, 6), new THREE.MeshBasicMaterial({ color: abyss ? 0x22d3ee : 0xef4444, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false }));
    sigil.rotation.x = -Math.PI / 2; sigil.position.y = 0.02;
    g.add(sigil);
    this.sigil = sigil;
    const sigil2 = new THREE.Mesh(new THREE.RingGeometry(9, 9.2, 48), sigil.material);
    sigil2.rotation.x = -Math.PI / 2; sigil2.position.y = 0.02;
    g.add(sigil2);
    // Стена-кольцо
    const wallMat = new THREE.MeshStandardMaterial({ color: abyss ? 0x1e1b4b : 0x1c1414, flatShading: true, roughness: 0.9 });
    const wall = new THREE.Mesh(new THREE.CylinderGeometry(R + 3, R + 3, 3.5, 48, 1, true), wallMat);
    wall.material.side = THREE.BackSide;
    wall.position.y = 1.5;
    g.add(wall);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(R + 0.2, 0.12, 4, 96), new THREE.MeshBasicMaterial({ color: abyss ? 0x22d3ee : 0xc59b27 }));
    rim.rotation.x = Math.PI / 2; rim.position.y = 0.05;
    g.add(rim);
    // Колонны (совпадают с коллайдерами симуляции)
    const colMat = new THREE.MeshStandardMaterial({ color: abyss ? 0x312e81 : 0x2a1f1f, flatShading: true, roughness: 0.6 });
    const capMat = new THREE.MeshStandardMaterial({ color: abyss ? 0xa5b4fc : 0xc59b27, metalness: 0.6, roughness: 0.35, emissive: abyss ? 0x312e81 : 0x3d2a00, emissiveIntensity: 0.5 });
    const flameMat = new THREE.MeshBasicMaterial({ color: abyss ? 0x67e8f9 : 0xff7a1a, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false });
    this.flames = [];
    PILLARS.forEach((p, i) => {
      const h = 3.2 + (i % 3) * 0.6;
      const col = new THREE.Mesh(new THREE.CylinderGeometry(p.r * 0.8, p.r, h, 6), colMat);
      col.position.set(p.x, h / 2, p.z);
      col.castShadow = true; col.receiveShadow = true;
      g.add(col);
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(p.r * 1.05, p.r * 0.85, 0.35, 6), capMat);
      cap.position.set(p.x, h + 0.15, p.z);
      g.add(cap);
      const fl = new THREE.Mesh(new THREE.ConeGeometry(0.35, 1.0, 5), flameMat);
      fl.position.set(p.x, h + 0.8, p.z);
      g.add(fl);
      this.flames.push(fl);
      if (i % 2 === 0) {
        const light = new THREE.PointLight(abyss ? 0x67e8f9 : 0xff8a3c, 1.1, 12, 1.8);
        light.position.set(p.x, h + 1.2, p.z);
        g.add(light);
      }
    });
    // Внешний мир
    if (abyss) {
      const N = 900; const pos = new Float32Array(N * 3);
      for (let i = 0; i < N; i++) {
        const a = Math.random() * Math.PI * 2, r = 90 + Math.random() * 80;
        pos[i * 3] = Math.cos(a) * r; pos[i * 3 + 1] = -30 + Math.random() * 90; pos[i * 3 + 2] = Math.sin(a) * r;
      }
      const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      g.add(new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xe0e7ff, size: 0.7, fog: false })));
    } else {
      const N = 160; const pos = new Float32Array(N * 3);
      for (let i = 0; i < N; i++) {
        pos[i * 3] = (Math.random() - 0.5) * R * 2; pos[i * 3 + 1] = Math.random() * 8; pos[i * 3 + 2] = (Math.random() - 0.5) * R * 2;
      }
      const pg = new THREE.BufferGeometry(); pg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      this.embers = new THREE.Points(pg, new THREE.PointsMaterial({ color: 0xff9a3c, size: 0.12, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false }));
      g.add(this.embers);
    }
    this.group = g;
    this.time = 0;
    return g;
  }

  update(dt) {
    this.time += dt;
    if (this.sigil) this.sigil.rotation.z += dt * 0.2;
    this.flames?.forEach((f, i) => { f.scale.y = 0.8 + Math.sin(this.time * 9 + i) * 0.25; });
    if (this.embers) {
      const a = this.embers.geometry.attributes.position;
      for (let i = 0; i < a.count; i++) {
        let y = a.array[i * 3 + 1] + dt * (0.5 + (i % 5) * 0.15);
        if (y > 8) y = 0;
        a.array[i * 3 + 1] = y;
      }
      a.needsUpdate = true;
    }
  }
}
