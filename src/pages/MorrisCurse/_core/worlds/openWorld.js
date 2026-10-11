// Открытые миры в пиксельном 2.5D: Поляна перевоплощения (хаб, мир hellfire) и Мэлвелдил (Аринар, 2400×2400).
// Земля и пропсы — terrain.js (запечённый tiles_atlas + props_atlas); здесь — небо, туман, свет и светлячки.
import { buildTerrain } from './terrain.js';
import { worldSize } from '../../../../../server/worlds/sizes.ts';
import { toX, toZ } from '../engine/geometry.js';

const PALETTE = {
  hellfire: { sky: 0x1b1733, fog: { color: 0x1b1733, near: 34, far: 90 }, hemi: { sky: 0xd8ccff, ground: 0x3a5a3a, intensity: 1.0 }, sun: { color: 0xfff1d6, intensity: 0.75 }, motes: 0xfde68a },
  arinar: { sky: 0x151030, fog: { color: 0x151030, near: 36, far: 100 }, hemi: { sky: 0xc7c2ff, ground: 0x334d3d, intensity: 0.95 }, sun: { color: 0xffe9d2, intensity: 0.7 }, motes: 0xc4b5fd },
};

export class OpenWorldEnvironment {
  constructor(id) {
    this.id = id;
    Object.assign(this, PALETTE[id] || PALETTE.hellfire);
    this.terrain = null;
  }

  build(THREE) {
    const g = new THREE.Group();
    g.name = 'env-' + this.id;
    this.group = g;
    this.ready = buildTerrain(THREE, this.id).then((t) => {
      this.terrain = t;
      g.add(t.group);
      return t;
    }).catch((e) => console.warn('[terrain]', e.message));
    // светлячки / пыльца над землёй
    const size = worldSize(this.id);
    const N = this.id === 'arinar' ? 420 : 160;
    const pos = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      pos[i * 3] = toX(Math.random() * size);
      pos[i * 3 + 1] = 0.3 + Math.random() * 3;
      pos[i * 3 + 2] = toZ(Math.random() * size);
    }
    const pg = new THREE.BufferGeometry();
    pg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.motes = new THREE.Points(pg, new THREE.PointsMaterial({ color: this.motes, size: 0.12, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.t = 0;
    g.add(this.motes);
    return g;
  }

  update(dt) {
    this.t += dt;
    if (!this.motes) return;
    const a = this.motes.geometry.attributes.position;
    for (let i = 0; i < a.count; i += 1) {
      a.array[i * 3 + 1] += Math.sin(this.t * 1.3 + i) * dt * 0.25;
      a.array[i * 3] += Math.cos(this.t * 0.7 + i * 1.7) * dt * 0.2;
    }
    a.needsUpdate = true;
    this.motes.material.opacity = 0.55 + Math.sin(this.t * 2.1) * 0.25;
  }
}
