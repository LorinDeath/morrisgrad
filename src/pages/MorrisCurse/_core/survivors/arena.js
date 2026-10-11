// 3D-арена комнаты забега: «Склеп» (адский камень) и «Бездна» (осколок Аринара).
import { ARENA_RADIUS } from './data.js';
import { PILLARS } from './run.js';
import { createStoneCanvas } from '../worlds/artDeco.js';

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
    const tex = new THREE.CanvasTexture(createStoneCanvas(abyss
      ? { base: '#0d1026', motif: 'rgba(103,232,249,0.10)', crack: 'rgba(0,0,0,0.4)' }
      : { base: '#1a1212', motif: 'rgba(197,155,39,0.09)', moss: 'rgba(60,80,40,0.35)' }, abyss ? 11 : 5));
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(R / 4, R / 4);
    tex.anisotropy = 4;
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
    this.buildProps(THREE, g, abyss);
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

  // Декор (не влияет на коллизии): плоские детали пола + невысокие предметы у стены и у колонн.
  // Всё инстансами: 1 вызов отрисовки на тип.
  buildProps(THREE, g, abyss) {
    const R = ARENA_RADIUS;
    let seed = abyss ? 99 : 42;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), sc = new THREE.Vector3();
    const inst = (geo, mat, n, place) => {
      const im = new THREE.InstancedMesh(geo, mat, n);
      for (let i = 0; i < n; i++) {
        const o = place(i);
        e.set(o.rx || 0, o.ry || 0, o.rz || 0); q.setFromEuler(e);
        v.set(o.x, o.y || 0, o.z); sc.set(o.s, o.sy || o.s, o.sz || o.s);
        m4.compose(v, q, sc); im.setMatrixAt(i, m4);
      }
      im.instanceMatrix.needsUpdate = true;
      im.receiveShadow = true;
      g.add(im);
      return im;
    };
    const ring = (rMin, rMax) => { const a = rnd() * Math.PI * 2, r = rMin + rnd() * (rMax - rMin); return { x: Math.cos(a) * r, z: Math.sin(a) * r, a }; };
    // обломки/камни вдоль стены
    const rubbleMat = new THREE.MeshStandardMaterial({ color: abyss ? 0x272552 : 0x2b2222, flatShading: true, roughness: 0.95 });
    inst(new THREE.DodecahedronGeometry(0.5, 0), rubbleMat, 70, () => { const p = ring(R - 3.2, R + 0.5); return { ...p, y: 0.15, s: 0.4 + rnd() * 0.9, sy: 0.3 + rnd() * 0.5, ry: rnd() * 6 }; });
    if (abyss) {
      // кристаллы Аринара у стены
      const crMat = new THREE.MeshStandardMaterial({ color: 0x67e8f9, emissive: 0x0e7490, emissiveIntensity: 0.6, roughness: 0.25, flatShading: true });
      inst(new THREE.OctahedronGeometry(0.5, 0), crMat, 28, () => { const p = ring(R - 2.2, R + 1); return { ...p, y: 0.6, s: 0.5 + rnd() * 0.6, sy: 1 + rnd() * 1.6, rz: (rnd() - 0.5) * 0.5 }; });
      // светящиеся пятна-«звёзды» на полу
      const dotMat = new THREE.MeshBasicMaterial({ color: 0x818cf8, transparent: true, opacity: 0.18, depthWrite: false });
      inst(new THREE.CircleGeometry(0.5, 8), dotMat, 60, () => { const p = ring(6, R - 4); return { ...p, y: 0.015, s: 0.4 + rnd() * 1.4, rx: -Math.PI / 2 }; });
    } else {
      // надгробия и свечи у стены
      const graveMat = new THREE.MeshStandardMaterial({ color: 0x3a3238, flatShading: true, roughness: 0.9 });
      inst(new THREE.BoxGeometry(0.9, 1.2, 0.25), graveMat, 22, () => { const p = ring(R - 2.0, R - 0.8); return { ...p, y: 0.5, s: 0.8 + rnd() * 0.4, ry: -p.a + Math.PI / 2 + (rnd() - 0.5) * 0.4, rz: (rnd() - 0.5) * 0.25 }; });
      const candles = Array.from({ length: 40 }, () => { const p = ring(R - 2.6, R - 0.6); return { ...p, s: 0.8 + rnd() * 0.8 }; });
      inst(new THREE.CylinderGeometry(0.06, 0.07, 0.4, 5), new THREE.MeshStandardMaterial({ color: 0xe8dcc0 }), candles.length, (i) => ({ ...candles[i], y: 0.2 * candles[i].s }));
      inst(new THREE.SphereGeometry(0.07, 5, 4), new THREE.MeshBasicMaterial({ color: 0xffc46b }), candles.length, (i) => ({ x: candles[i].x, z: candles[i].z, y: 0.4 * candles[i].s + 0.06, s: 1, sy: 1.6 }));
      // кости / черепки на полу (плоские)
      const boneMat = new THREE.MeshStandardMaterial({ color: 0x6b6152, roughness: 1 });
      inst(new THREE.CylinderGeometry(0.05, 0.05, 0.7, 4), boneMat, 50, () => { const p = ring(7, R - 3); return { ...p, y: 0.04, s: 0.7 + rnd() * 0.6, rx: Math.PI / 2, rz: rnd() * 6 }; });
      // тёмные пятна
      const stainMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.22, depthWrite: false });
      inst(new THREE.CircleGeometry(1, 10), stainMat, 26, () => { const p = ring(4, R - 2); return { ...p, y: 0.012, s: 0.8 + rnd() * 2.2, sz: 0.6 + rnd(), rx: -Math.PI / 2 }; });
    }
    // мох/трава у колонн
    const tuftMat = new THREE.MeshStandardMaterial({ color: abyss ? 0x3730a3 : 0x3f4a2a, flatShading: true });
    inst(new THREE.ConeGeometry(0.12, 0.45, 3), tuftMat, PILLARS.length * 6, (i) => {
      const p = PILLARS[Math.floor(i / 6)]; const a = rnd() * Math.PI * 2, r = p.r + 0.2 + rnd() * 0.6;
      return { x: p.x + Math.cos(a) * r, z: p.z + Math.sin(a) * r, y: 0.2, s: 0.8 + rnd() * 0.8 };
    });
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
